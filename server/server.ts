import "dotenv/config";
import dotenv from "dotenv";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runPracticePlan, SAFE_AGENT_ERROR_MESSAGE, type AgentRunTiming } from "./agent";
import type { AgentModel } from "./agentModel";
import { GeminiAgentModel } from "./geminiAgentModel";
import { createSession, requestAdvice, type InFlightAdvice, type SessionStore } from "./service";
import { GeminiAdviceProvider, parseGeminiModelChain } from "./provider";
import { loadUsageLog, persistUsageLog, recordUsage, type UsageLog } from "./usage";
import { applyCorsHeaders, createRateLimiter, parseAllowedOrigins } from "./httpSecurity";
import {
  recordSecurityEvent,
  type SecurityEventLog,
  type SecurityEvent,
} from "./securityEvents";
import {
  createConcurrencyLimiter,
  type PracticePlanConcurrency,
} from "./concurrency";

dotenv.config({ path: new URL(".env", import.meta.url) });

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "127.0.0.1";
const MAX_BODY_BYTES = 16 * 1024;
const sessions: SessionStore = new Map();
const usageFile = new URL("./ai-usage.local.json", import.meta.url);
const usageLog: UsageLog = await loadUsageLog(usageFile).catch(() => []);
const securityEvents: SecurityEventLog = [];
const adviceCache = new Map<string, import("./api").AdviceResponse>();
const inFlightAdvice = new Map<string, InFlightAdvice>();
const MODEL_CHAIN = parseGeminiModelChain(process.env.GEMINI_MODEL_CHAIN);
const MODEL_NAME = MODEL_CHAIN[0];
const allowedOrigins = parseAllowedOrigins(process.env.FRONTEND_ORIGINS);
const allowAdviceRequest = createRateLimiter(10, 60_000);
const allowPracticePlanRequest = createRateLimiter(10, 60_000);
const practicePlanConcurrency = createConcurrencyLimiter(2);

class RequestBodyTooLargeError extends Error {
  public constructor() {
    super("request-too-large");
    this.name = "RequestBodyTooLargeError";
  }
}

class InvalidJsonBodyError extends Error {
  public constructor() {
    super("invalid-json");
    this.name = "InvalidJsonBodyError";
  }
}

const createProvider = process.env.GEMINI_API_KEY
  ? (modelName: string) => new GeminiAdviceProvider(process.env.GEMINI_API_KEY!, modelName)
  : undefined;
const provider = createProvider?.(MODEL_NAME) ?? null;
const practicePlanModel = process.env.GEMINI_API_KEY
  ? new GeminiAgentModel({ apiKey: process.env.GEMINI_API_KEY, modelName: MODEL_NAME })
  : null;

export type BackendServerOptions = {
  sessions?: SessionStore;
  allowedOrigins?: Set<string>;
  practicePlanModel?: AgentModel | null;
  practicePlanProvider?: "gemini" | "fake";
  practicePlanModelName?: string;
  practicePlanLimiter?: (clientKey: string) => boolean;
  securityEvents?: SecurityEventLog;
  practicePlanConcurrency?: PracticePlanConcurrency;
  practicePlanTiming?: AgentRunTiming;
};

async function persistUsageSafely(): Promise<void> {
  try {
    await persistUsageLog(usageFile, usageLog);
  } catch {
    console.warn("[ai.usage] Local usage file could not be updated.");
  }
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  if (response.destroyed) {
    return;
  }
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.writeHead(statusCode);
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage, maxBodyBytes = MAX_BODY_BYTES): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.byteLength;
    if (totalBytes > maxBodyBytes) {
      throw new RequestBodyTooLargeError();
    }
    chunks.push(chunk);
  }

  const body = new TextDecoder().decode(
    Uint8Array.from(chunks.flatMap((chunk) => [...chunk])),
  );
  try {
    return JSON.parse(body);
  } catch {
    throw new InvalidJsonBodyError();
  }
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: BackendServerOptions = {},
): Promise<void> {
  const activeSessions = options.sessions ?? sessions;
  const activeOrigins = options.allowedOrigins ?? allowedOrigins;
  const allowPracticeRequest = options.practicePlanLimiter ?? allowPracticePlanRequest;
  const activeSecurityEvents = options.securityEvents ?? securityEvents;
  const activePracticeConcurrency = options.practicePlanConcurrency ?? practicePlanConcurrency;
  const activePracticeModel = Object.prototype.hasOwnProperty.call(options, "practicePlanModel")
    ? options.practicePlanModel ?? null
    : practicePlanModel;

  const clientAbortController = new AbortController();
  request.once("aborted", () => clientAbortController.abort());
  response.once("close", () => {
    if (!response.writableEnded) {
      clientAbortController.abort();
    }
  });

  if (request.method === "OPTIONS") {
    if (!applyCorsHeaders(request, response, activeOrigins)) {
      sendJson(response, 403, { success: false, message: "Origin nije dozvoljen." });
      return;
    }
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.writeHead(204);
    response.end();
    return;
  }

  if (!applyCorsHeaders(request, response, activeOrigins)) {
    sendJson(response, 403, { success: false, message: "Origin nije dozvoljen." });
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { success: false, message: "Metod nije podrzan." });
    return;
  }

  try {
    const input = await readJson(request);
    if (request.url === "/api/game/session") {
      const result = createSession(input, activeSessions);
      sendJson(response, result.statusCode, result.body);
      return;
    }
    if (request.url === "/api/ai/practice-plan") {
      const correlationId = crypto.randomUUID();
      const remoteAddress = request.socket.remoteAddress ?? "unknown";
      if (!allowPracticeRequest(remoteAddress)) {
        logPracticeTerminal("request_rate_limited");
        emitSecurityEvent(activeSecurityEvents, {
          correlationId,
          event: "rate_limited",
          outcome: "rejected",
          reason: "invalid_input",
          statusCode: 429,
          providerAttemptCount: 0,
          toolCallCount: 0,
        });
        sendJson(response, 429, { success: false, message: SAFE_AGENT_ERROR_MESSAGE });
        return;
      }
      if (!activePracticeModel) {
        logPracticeTerminal("provider_unconfigured");
        emitSecurityEvent(activeSecurityEvents, {
          correlationId,
          event: "provider_failure",
          outcome: "failed",
          reason: "provider_unconfigured",
          statusCode: 503,
          providerAttemptCount: 0,
          toolCallCount: 0,
        });
        sendJson(response, 503, { success: false, message: SAFE_AGENT_ERROR_MESSAGE });
        return;
      }

      const lease = activePracticeConcurrency.tryAcquire();
      if (!lease) {
        emitSecurityEvent(activeSecurityEvents, {
          correlationId,
          event: "concurrency_rejected",
          outcome: "rejected",
          reason: "concurrency_limit",
          statusCode: 429,
          providerAttemptCount: 0,
          toolCallCount: 0,
        });
        sendJson(response, 429, { success: false, message: SAFE_AGENT_ERROR_MESSAGE });
        return;
      }

      emitSecurityEvent(activeSecurityEvents, {
        correlationId,
        event: "request_allowed",
        outcome: "allowed",
        reason: "http_admitted",
        statusCode: 200,
        providerAttemptCount: 0,
        toolCallCount: 0,
      });

      let cleanup = Promise.resolve();
      try {
        let result;
        try {
          result = await runPracticePlan(input, {
          model: activePracticeModel,
          provider: options.practicePlanProvider ?? "gemini",
          modelName: options.practicePlanModelName ?? MODEL_NAME,
          sessions: activeSessions,
          signal: clientAbortController.signal,
          timing: options.practicePlanTiming,
          });
        } catch {
          logPracticeTerminal("provider_error");
          emitSecurityEvent(activeSecurityEvents, {
            correlationId,
            event: "provider_failure",
            outcome: "failed",
            reason: "provider_error",
            statusCode: 502,
            providerAttemptCount: 0,
            toolCallCount: 0,
          });
          sendJson(response, 502, { success: false, message: SAFE_AGENT_ERROR_MESSAGE });
          return;
        }
        cleanup = result.cleanup;
      const providerAttemptCount = result.evidence.providerAttemptCount;
      const toolCallCount = result.evidence.toolCallCount;
      if (result.evidence.steps.some((step) => step.proposalStatus === "accepted")) {
        emitSecurityEvent(activeSecurityEvents, {
          correlationId,
          event: "agent_decision_allowed",
          outcome: "allowed",
          reason: "provider_attempt",
          statusCode: result.statusCode,
          providerAttemptCount,
          toolCallCount,
        });
      }
      if (toolCallCount > 0) {
        emitSecurityEvent(activeSecurityEvents, {
          correlationId,
          event: "tool_allowed",
          outcome: "allowed",
          reason: "tool_execution",
          statusCode: result.statusCode,
          providerAttemptCount,
          toolCallCount,
        });
      }
      if (result.statusCode === 200) {
        emitSecurityEvent(activeSecurityEvents, {
          correlationId,
          event: "execution_completed",
          outcome: "completed",
          reason: result.evidence.status === "completed" ? "agent_completed" : "agent_incomplete",
          statusCode: result.statusCode,
          providerAttemptCount,
          toolCallCount,
        });
      } else {
        emitSecurityEvent(activeSecurityEvents, {
          correlationId,
          event: result.evidence.stopReason === "deadline" || result.evidence.stopReason === "provider_timeout"
            ? "deadline_reached"
            : result.evidence.stopReason?.startsWith("provider_")
              ? "provider_failure"
              : result.evidence.stopReason?.startsWith("tool_")
                ? "tool_rejected"
                : "agent_decision_rejected",
          outcome: result.evidence.stopReason?.startsWith("provider_") ? "failed" : "rejected",
          reason: mapSecurityReason(result.evidence.stopReason),
          statusCode: result.statusCode,
          providerAttemptCount,
          toolCallCount,
        });
      }
      console.info("[ai.practice-plan]", JSON.stringify(result.evidence));
      sendJson(response, result.statusCode, result.body);
      } finally {
        await cleanup;
        lease.release();
      }
      return;
    }
    if (request.url === "/api/ai/advice") {
      const remoteAddress = request.socket.remoteAddress ?? "unknown";
      if (!allowAdviceRequest(remoteAddress)) {
        recordUsage(usageLog, {
          operation: "ai.advice",
          provider: "gemini",
          model: MODEL_NAME,
          status: "rate_limited",
          attempts: 0,
          latencyMs: 0,
        });
        await persistUsageSafely();
        sendJson(response, 429, {
          success: false,
          message: "AI savet trenutno nije dostupan. Pokusajte ponovo kasnije.",
        });
        return;
      }
      if (!provider) {
        recordUsage(usageLog, {
          operation: "ai.advice",
          provider: "gemini",
          model: MODEL_NAME,
          status: "provider_error",
          attempts: 0,
          latencyMs: 0,
        });
        await persistUsageSafely();
        sendJson(response, 503, {
          success: false,
          message: "AI savet trenutno nije dostupan. Pokusajte ponovo kasnije.",
        });
        return;
      }
      const result = await requestAdvice(input, {
        provider,
        sessions: activeSessions,
        usageLog,
        providerName: "gemini",
        modelName: MODEL_NAME,
        modelChain: MODEL_CHAIN,
        providerForModel: createProvider,
        adviceCache,
        inFlightAdvice,
        signal: clientAbortController.signal,
        timeoutMs: 15_000,
      });
      await persistUsageSafely();
      const usage = usageLog[usageLog.length - 1];
      if (usage) {
        console.info("[ai.advice]", JSON.stringify({
          provider: usage.provider,
          model: usage.model,
          status: usage.status,
          phase: usage.phase,
          providerStatus: usage.providerStatus,
          attempts: usage.attempts,
          latencyMs: usage.latencyMs,
          fallbackUsed: usage.fallbackUsed ?? false,
          providerAttempts: usage.providerAttempts,
          tokenUsage: usage.tokenUsage,
        }));
      }
      sendJson(response, result.statusCode, result.body);
      return;
    }
    sendJson(response, 404, { success: false, message: "Ruta nije pronadjena." });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      if (request.url === "/api/ai/practice-plan") {
        emitSecurityEvent(activeSecurityEvents, {
          correlationId: crypto.randomUUID(),
          event: "body_rejected",
          outcome: "rejected",
          reason: "body_too_large",
          statusCode: 413,
          providerAttemptCount: 0,
          toolCallCount: 0,
        });
      }
      sendJson(response, 413, { success: false, message: "Zahtev je prevelik." });
      return;
    }
    if (error instanceof InvalidJsonBodyError) {
      sendJson(response, 400, { success: false, message: "Zahtev mora biti validan JSON." });
      return;
    }
    console.error("[http] Internal request error.");
    sendJson(response, 500, { success: false, message: "Interna greska servera." });
  }
}

function emitSecurityEvent(
  log: SecurityEventLog,
  input: Omit<SecurityEvent, "timestamp" | "route">,
): void {
  const event = recordSecurityEvent(log, {
    ...input,
    route: "/api/ai/practice-plan",
  });
  console.info("[security]", JSON.stringify(event));
}

function mapSecurityReason(
  reason: string | null,
): SecurityEvent["reason"] {
  const allowedReasons: SecurityEvent["reason"][] = [
    "invalid_input", "session_data_invalid", "goal_unavailable",
    "provider_unconfigured", "provider_attempt", "tool_execution",
    "agent_completed", "agent_incomplete", "unknown_tool", "invalid_tool_args",
    "invalid_tool_result", "invalid_final_output", "repeated_call", "tool_limit",
    "tool_timeout", "tool_error", "tool_not_justified", "provider_attempt_limit",
    "max_steps", "model_refusal", "plan_incomplete", "cancelled",
    "provider_timeout", "deadline", "provider_error", "internal_error",
  ];
  return reason && allowedReasons.includes(reason as SecurityEvent["reason"])
    ? reason as SecurityEvent["reason"]
    : "internal_error";
}

export function createBackendServer(options: BackendServerOptions = {}) {
  return createServer((request, response) => {
    void handleRequest(request, response, options);
  });
}

function logPracticeTerminal(
  stopReason: "request_rate_limited" | "provider_error" | "provider_unconfigured",
): void {
  console.info("[ai.practice-plan]", JSON.stringify({
    runId: crypto.randomUUID(),
    status: "failed",
    providerHttpStatus: null,
    providerAttemptCount: 0,
    retryCount: 0,
    toolCallCount: 0,
    stopReason,
    elapsedMs: 0,
    steps: [],
  }));
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entrypoint) {
  createBackendServer().listen(PORT, HOST, () => {
    console.log(`RetroSnake backend listening on http://${HOST}:${PORT}`);
  });
}
