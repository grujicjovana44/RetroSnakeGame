import {
  adviceRequestSchema,
  parseAdviceResponse,
  parseGameSummary,
  SAFE_ERROR_MESSAGE,
  type AdviceApiResponse,
  type GameSummary,
} from "./api";
import { GeminiProviderError, type AdviceProvider, type StatsTool } from "./provider";
import { recordUsage, type UsageLog } from "./usage";

export type SessionStore = Map<string, GameSummary>;

export type AdviceServiceOptions = {
  provider: AdviceProvider;
  sessions: SessionStore;
  timeoutMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  usageLog?: UsageLog;
  providerName?: "gemini" | "fake";
  modelName?: string;
};

export type ServiceResult = {
  statusCode: number;
  body: AdviceApiResponse;
  attempts: number;
};

export function createSession(input: unknown, sessions: SessionStore): { statusCode: number; body: unknown } {
  const stats = parseGameSummary(input);
  if (!stats) {
    return { statusCode: 400, body: { success: false, message: "Nevalidni podaci o zavrsenoj igri." } };
  }

  const sessionId = crypto.randomUUID();
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
    recordUsage(options.usageLog ?? [], {
      operation: "ai.advice",
      provider: options.providerName ?? "fake",
      model: options.modelName ?? "test",
      status: "invalid_input",
      attempts: 0,
      latencyMs: Date.now() - startedAt,
    });
    return { statusCode: 400, body: { success: false, message: SAFE_ERROR_MESSAGE }, attempts: 0 };
  }

  const getStats: StatsTool = (toolSessionId) => {
    if (toolSessionId !== request.data.sessionId) {
      return null;
    }
    return options.sessions.get(toolSessionId) ?? null;
  };

  const maxAttempts = 2;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      const advice = await withTimeout(
        options.provider.generateAdvice(request.data.sessionId, getStats),
        timeoutMs,
      );
      const parsed = parseAdviceResponse(advice);
      if (!parsed) {
        recordUsage(options.usageLog ?? [], {
          operation: "ai.advice",
          provider: options.providerName ?? "fake",
          model: options.modelName ?? "test",
          status: "malformed_output",
          phase: "final_response",
          attempts,
          latencyMs: Date.now() - startedAt,
          sessionId: request.data.sessionId,
        });
        return { statusCode: 502, body: { success: false, message: SAFE_ERROR_MESSAGE }, attempts };
      }
      recordUsage(options.usageLog ?? [], {
        operation: "ai.advice",
        provider: options.providerName ?? "fake",
        model: options.modelName ?? "test",
        status: "success",
        phase: "final_response",
        attempts,
        latencyMs: Date.now() - startedAt,
        sessionId: request.data.sessionId,
      });
      return { statusCode: 200, body: { success: true, advice: parsed }, attempts };
    } catch (error) {
      if (!isTransientError(error) || attempts === maxAttempts) {
        recordUsage(options.usageLog ?? [], {
          operation: "ai.advice",
          provider: options.providerName ?? "fake",
          model: options.modelName ?? "test",
          status: error instanceof Error && error.message === "malformed-output"
            ? "malformed_output"
            : error instanceof Error && error.message === "provider-timeout"
              ? "timeout"
              : error instanceof Error && error.message === "tool-session-mismatch"
                ? "tool_error"
                : "provider_error",
                  phase: getErrorPhase(error),
                  providerStatus: getProviderStatus(error),
          attempts,
          latencyMs: Date.now() - startedAt,
          sessionId: request.data.sessionId,
        });
        return { statusCode: 502, body: { success: false, message: SAFE_ERROR_MESSAGE }, attempts };
      }
      await sleep(attempts * 1_000);
    }
  }

  return { statusCode: 502, body: { success: false, message: SAFE_ERROR_MESSAGE }, attempts };
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("provider-timeout")), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}
