import "dotenv/config";
import dotenv from "dotenv";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createSession, requestAdvice, type InFlightAdvice, type SessionStore } from "./service";
import { GeminiAdviceProvider, parseGeminiModelChain } from "./provider";
import { loadUsageLog, persistUsageLog, recordUsage, type UsageLog } from "./usage";
import { applyCorsHeaders, createRateLimiter, parseAllowedOrigins } from "./httpSecurity";

dotenv.config({ path: new URL(".env", import.meta.url) });

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "127.0.0.1";
const MAX_BODY_BYTES = 16 * 1024;
const sessions: SessionStore = new Map();
const usageFile = new URL("./ai-usage.local.json", import.meta.url);
const usageLog: UsageLog = await loadUsageLog(usageFile).catch(() => []);
const adviceCache = new Map<string, import("./api").AdviceResponse>();
const inFlightAdvice = new Map<string, InFlightAdvice>();
const MODEL_CHAIN = parseGeminiModelChain(process.env.GEMINI_MODEL_CHAIN);
const MODEL_NAME = MODEL_CHAIN[0];
const allowedOrigins = parseAllowedOrigins(process.env.FRONTEND_ORIGINS);
const allowAdviceRequest = createRateLimiter(10, 60_000);

const createProvider = process.env.GEMINI_API_KEY
  ? (modelName: string) => new GeminiAdviceProvider(process.env.GEMINI_API_KEY!, modelName)
  : undefined;
const provider = createProvider?.(MODEL_NAME) ?? null;

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

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new Error("request-too-large");
    }
    chunks.push(chunk);
  }

  const body = new TextDecoder().decode(
    Uint8Array.from(chunks.flatMap((chunk) => [...chunk])),
  );
  return JSON.parse(body);
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const clientAbortController = new AbortController();
  request.once("aborted", () => clientAbortController.abort());
  response.once("close", () => {
    if (!response.writableEnded) {
      clientAbortController.abort();
    }
  });

  if (request.method === "OPTIONS") {
    if (!applyCorsHeaders(request, response, allowedOrigins)) {
      sendJson(response, 403, { success: false, message: "Origin nije dozvoljen." });
      return;
    }
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.writeHead(204);
    response.end();
    return;
  }

  if (!applyCorsHeaders(request, response, allowedOrigins)) {
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
      const result = createSession(input, sessions);
      sendJson(response, result.statusCode, result.body);
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
        sessions,
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
  } catch {
    sendJson(response, 400, { success: false, message: "Zahtev mora biti validan JSON." });
  }
}

createServer((request, response) => {
  void handleRequest(request, response);
}).listen(PORT, HOST, () => {
  console.log(`RetroSnake backend listening on http://${HOST}:${PORT}`);
});