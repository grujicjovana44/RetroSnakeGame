import {
  adviceRequestSchema,
  parseAdviceResponse,
  parseGameSummary,
  SAFE_ERROR_MESSAGE,
  type AdviceApiResponse,
  type AdviceResponse,
  type GameSummary,
} from "./api";
import { GeminiProviderError, type AdviceProvider, type StatsTool } from "./provider";
import { recordUsage, type TokenUsage, type UsageLog, type UsageLogEntry } from "./usage";

export type SessionStore = Map<string, GameSummary>;

export type AdviceServiceOptions = {
  provider: AdviceProvider;
  sessions: SessionStore;
  timeoutMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  usageLog?: UsageLog;
  providerName?: "gemini" | "fake";
  modelName?: string;
  adviceCache?: Map<string, AdviceResponse>;
  inFlightAdvice?: Map<string, Promise<ServiceResult>>;
};

export type ServiceResult = {
  statusCode: number;
  body: AdviceApiResponse;
  attempts: number;
};

const MAX_SESSIONS = 500;

export function createSession(input: unknown, sessions: SessionStore): { statusCode: number; body: unknown } {
  const stats = parseGameSummary(input);
  if (!stats) {
    return { statusCode: 400, body: { success: false, message: "Nevalidni podaci o zavrsenoj igri." } };
  }

  const sessionId = crypto.randomUUID();
  if (sessions.size >= MAX_SESSIONS) {
    const oldestSessionId = sessions.keys().next().value;
    if (oldestSessionId) {
      sessions.delete(oldestSessionId);
    }
  }
  sessions.set(sessionId, stats);
  return { statusCode: 201, body: { sessionId } };
}

export async function requestAdvice(
  input: unknown,
  options: AdviceServiceOptions,
): Promise<ServiceResult> {
  const startedAt = Date.now();
  const request = adviceRequestSchema.safeParse(input);
  if (!request.success || !options.sessions.has(request.data.sessionId)) {
    recordUsage(options.usageLog ?? [], createUsageEntry(options, {
      status: "invalid_input",
      attempts: 0,
      latencyMs: Date.now() - startedAt,
    }));
    return { statusCode: 400, body: { success: false, message: SAFE_ERROR_MESSAGE }, attempts: 0 };
  }

  const sessionId = request.data.sessionId;
  const cachedAdvice = options.adviceCache?.get(sessionId);
  if (cachedAdvice) {
    return { statusCode: 200, body: { success: true, advice: cachedAdvice }, attempts: 0 };
  }

  const inFlight = options.inFlightAdvice?.get(sessionId);
  if (inFlight) {
    return inFlight;
  }

  const resultPromise = generateAdvice(sessionId, options, startedAt);
  options.inFlightAdvice?.set(sessionId, resultPromise);
  try {
    const result = await resultPromise;
    if (result.body.success && options.adviceCache) {
      if (options.adviceCache.size >= MAX_SESSIONS) {
        const oldestSessionId = options.adviceCache.keys().next().value;
        if (oldestSessionId) {
          options.adviceCache.delete(oldestSessionId);
        }
      }
      options.adviceCache.set(sessionId, result.body.advice);
    }
    return result;
  } finally {
    options.inFlightAdvice?.delete(sessionId);
  }
}

async function generateAdvice(
  sessionId: string,
  options: AdviceServiceOptions,
  startedAt: number,
): Promise<ServiceResult> {
  const getStats: StatsTool = (toolSessionId) => {
    if (toolSessionId !== sessionId) {
      return null;
    }
    return options.sessions.get(toolSessionId) ?? null;
  };

  const maxAttempts = 2;
  const timeoutMs = Math.max(1, options.timeoutMs ?? 15_000);
  const deadline = startedAt + timeoutMs;
  const retryDelayMs = Math.min(1_000, Math.max(1, Math.floor(timeoutMs / 4)));
  const firstAttemptTimeoutMs = Math.max(1, timeoutMs - retryDelayMs - 4_000);
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let attempts = 0;
  let tokenUsage: TokenUsage = {};
  let hasTokenUsage = false;

  while (attempts < maxAttempts) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      recordUsage(options.usageLog ?? [], createUsageEntry(options, {
        status: "timeout",
        attempts,
        latencyMs: Date.now() - startedAt,
        sessionId,
        tokenUsage: hasTokenUsage ? tokenUsage : undefined,
      }));
      return { statusCode: 502, body: { success: false, message: SAFE_ERROR_MESSAGE }, attempts };
    }

    attempts += 1;
    const controller = new AbortController();
    const attemptTimeoutMs = attempts === 1
      ? Math.min(remainingMs, firstAttemptTimeoutMs)
      : remainingMs;
    try {
      const advice = await withTimeout(
        options.provider.generateAdvice(sessionId, getStats, controller.signal, (usage) => {
          tokenUsage = mergeTokenUsage(tokenUsage, usage);
          hasTokenUsage = true;
        }),
        attemptTimeoutMs,
        controller,
      );
      const parsed = parseAdviceResponse(advice);
      if (!parsed) {
        recordUsage(options.usageLog ?? [], createUsageEntry(options, {
          status: "malformed_output",
          phase: "final_response",
          attempts,
          latencyMs: Date.now() - startedAt,
          sessionId,
          tokenUsage: hasTokenUsage ? tokenUsage : undefined,
        }));
        return { statusCode: 502, body: { success: false, message: SAFE_ERROR_MESSAGE }, attempts };
      }
      recordUsage(options.usageLog ?? [], createUsageEntry(options, {
        status: "success",
        phase: "final_response",
        attempts,
        latencyMs: Date.now() - startedAt,
        sessionId,
        tokenUsage: hasTokenUsage ? tokenUsage : undefined,
      }));
      return { statusCode: 200, body: { success: true, advice: parsed }, attempts };
    } catch (error) {
      if (!isTransientError(error) || attempts === maxAttempts) {
        recordUsage(options.usageLog ?? [], createUsageEntry(options, {
          status: getFailureStatus(error),
          phase: getErrorPhase(error),
          providerStatus: getProviderStatus(error),
          attempts,
          latencyMs: Date.now() - startedAt,
          sessionId,
          tokenUsage: hasTokenUsage ? tokenUsage : undefined,
        }));
        return { statusCode: 502, body: { success: false, message: SAFE_ERROR_MESSAGE }, attempts };
      }
      const remainingBeforeRetry = deadline - Date.now();
      if (remainingBeforeRetry <= 1) {
        continue;
      }
      await sleep(Math.min(retryDelayMs, remainingBeforeRetry - 1));
    }
  }

  return { statusCode: 502, body: { success: false, message: SAFE_ERROR_MESSAGE }, attempts };
}

function createUsageEntry(
  options: AdviceServiceOptions,
  values: Omit<UsageLogEntry, "operation" | "provider" | "model">,
): UsageLogEntry {
  return {
    operation: "ai.advice",
    provider: options.providerName ?? "fake",
    model: options.modelName ?? "test",
    ...values,
  };
}

function mergeTokenUsage(current: TokenUsage, next: TokenUsage): TokenUsage {
  return {
    promptTokens: addOptionalNumbers(current.promptTokens, next.promptTokens),
    outputTokens: addOptionalNumbers(current.outputTokens, next.outputTokens),
    totalTokens: addOptionalNumbers(current.totalTokens, next.totalTokens),
  };
}

function addOptionalNumbers(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return left + right;
}

function getFailureStatus(error: unknown): UsageLogEntry["status"] {
  if (!(error instanceof Error)) return "provider_error";
  if (error.message === "provider-timeout") return "timeout";
  if (error.message === "malformed-output") return "malformed_output";
  if (error.message === "tool-session-mismatch" || error.message === "session-not-found") {
    return "tool_error";
  }
  return "provider_error";
}

function isTransientError(error: unknown): boolean {
  return error instanceof Error && ["provider-timeout", "provider-unavailable", "network-error"].includes(error.message);
}

function getErrorPhase(error: unknown): "initial_tool_call" | "final_response" | undefined {
  return error instanceof GeminiProviderError ? error.phase : undefined;
}

function getProviderStatus(error: unknown): number | undefined {
  return error instanceof GeminiProviderError ? error.status : undefined;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  controller: AbortController,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("provider-timeout"));
      controller.abort();
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}