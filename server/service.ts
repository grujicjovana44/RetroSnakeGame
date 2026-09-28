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
import {
  recordUsage,
  type ProviderAttempt,
  type TokenUsage,
  type UsageLog,
  type UsageLogEntry,
} from "./usage";

export type SessionStore = Map<string, GameSummary>;
export type InFlightAdvice = {
  promise: Promise<ServiceResult>;
  controller: AbortController;
  subscribers: number;
  settled: boolean;
};

export type AdviceServiceOptions = {
  provider: AdviceProvider;
  providerForModel?: (model: string) => AdviceProvider;
  modelChain?: string[];
  sessions: SessionStore;
  timeoutMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  usageLog?: UsageLog;
  providerName?: "gemini" | "fake";
  modelName?: string;
  adviceCache?: Map<string, AdviceResponse>;
  inFlightAdvice?: Map<string, InFlightAdvice>;
  signal?: AbortSignal;
};

export type ServiceResult = {
  statusCode: number;
  body: AdviceApiResponse;
  attempts: number;
  fallbackUsed?: boolean;
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

  if (options.signal?.aborted) {
    return cancelledResult();
  }

  let flight = options.inFlightAdvice?.get(sessionId);
  if (flight?.controller.signal.aborted) {
    flight = undefined;
  }
  if (!flight) {
    const controller = new AbortController();
    flight = {
      promise: generateAdvice(sessionId, options, startedAt, controller.signal),
      controller,
      subscribers: 0,
      settled: false,
    };
    options.inFlightAdvice?.set(sessionId, flight);
    const createdFlight = flight;
    void createdFlight.promise.then((result) => {
      if (result.body.success && options.adviceCache) {
        if (options.adviceCache.size >= MAX_SESSIONS) {
          const oldestSessionId = options.adviceCache.keys().next().value;
          if (oldestSessionId) {
            options.adviceCache.delete(oldestSessionId);
          }
        }
        options.adviceCache.set(sessionId, result.body.advice);
      }
    }, () => undefined).finally(() => {
      createdFlight.settled = true;
      if (options.inFlightAdvice?.get(sessionId) === createdFlight) {
        options.inFlightAdvice.delete(sessionId);
      }
    });
  }

  return waitForFlight(flight, options.signal);
}

async function generateAdvice(
  sessionId: string,
  options: AdviceServiceOptions,
  startedAt: number,
  signal: AbortSignal,
): Promise<ServiceResult> {
  const getStats: StatsTool = (toolSessionId) => {
    if (toolSessionId !== sessionId) {
      return null;
    }
    return options.sessions.get(toolSessionId) ?? null;
  };

  const modelChain = options.modelChain?.length
    ? options.modelChain
    : [options.modelName ?? "test"];
  const maxAttemptsPerModel = 2;
  const timeoutMs = Math.max(1, options.timeoutMs ?? 15_000);
  const deadline = startedAt + timeoutMs;
  const minimumModelAttemptMs = timeoutMs < 1_000
    ? timeoutMs / (modelChain.length * maxAttemptsPerModel)
    : Math.min(3_000, timeoutMs / (modelChain.length + 1));
  const minimumRetryBudgetMs = timeoutMs < 1_000 ? 1 : minimumModelAttemptMs;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let attempts = 0;
  let fallbackUsed = false;
  let selectedModel = modelChain[0];
  let tokenUsage: TokenUsage = {};
  let hasTokenUsage = false;
  const providerAttempts: ProviderAttempt[] = [];

  for (let modelIndex = 0; modelIndex < modelChain.length; modelIndex += 1) {
    const currentModel = modelChain[modelIndex];
    const provider = options.providerForModel?.(currentModel) ?? options.provider;

    for (let modelAttempt = 0; modelAttempt < maxAttemptsPerModel; modelAttempt += 1) {
      if (signal.aborted) {
        return finishFailure("cancelled");
      }
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        return finishFailure("timeout");
      }

      const remainingFallbackModels = modelChain.length - modelIndex - 1;
      const fallbackReserveSlackMs = Math.min(250, timeoutMs * 0.1);
      const fallbackReserveMs = remainingFallbackModels *
        (minimumModelAttemptMs + fallbackReserveSlackMs);
      const currentModelBudgetMs = remainingMs - fallbackReserveMs;
      if (currentModelBudgetMs <= 1 ||
          (modelAttempt === 0 && currentModelBudgetMs < minimumModelAttemptMs)) {
        return finishFailure("timeout");
      }

      const attemptTimeoutMs = modelIndex === 0 && modelAttempt === 0
        ? Math.max(minimumModelAttemptMs, Math.floor(currentModelBudgetMs / maxAttemptsPerModel))
        : currentModelBudgetMs;
      selectedModel = currentModel;
      if (modelIndex > 0) {
        fallbackUsed = true;
      }
      attempts += 1;
      const controller = new AbortController();
      let attemptPhase: "initial_tool_call" | "final_response" = "initial_tool_call";
      const abortAttempt = () => controller.abort();
      signal.addEventListener("abort", abortAttempt, { once: true });
      if (signal.aborted) {
        abortAttempt();
      }
      const attemptStartedAt = Date.now();
      const attemptKind = attempts === 1
        ? "initial"
        : modelAttempt > 0
          ? "retry"
          : "fallback";

      try {
        const advice = await withTimeout(
          provider.generateAdvice(sessionId, getStats, controller.signal, (usage) => {
            tokenUsage = mergeTokenUsage(tokenUsage, usage);
            hasTokenUsage = true;
          }, (phase) => {
            attemptPhase = phase;
          }),
          attemptTimeoutMs,
          controller,
        );
        const parsed = parseAdviceResponse(advice);
        if (!parsed) {
          providerAttempts.push({
            model: selectedModel,
            attemptKind,
            phase: "final_response",
            status: "malformed_output",
            latencyMs: Date.now() - attemptStartedAt,
          });
          return finishFailure("malformed_output", "final_response");
        }

        providerAttempts.push({
          model: selectedModel,
          attemptKind,
          phase: "final_response",
          status: "success",
          latencyMs: Date.now() - attemptStartedAt,
        });
        recordUsage(options.usageLog ?? [], createUsageEntry(options, {
          model: selectedModel,
          status: "success",
          phase: "final_response",
          attempts,
          latencyMs: Date.now() - startedAt,
          fallbackUsed,
          providerAttempts,
          tokenUsage: hasTokenUsage ? tokenUsage : undefined,
        }));
        return {
          statusCode: 200,
          body: { success: true, advice: parsed },
          attempts,
          fallbackUsed,
        };
      } catch (error) {
        const failureStatus = getFailureStatus(error);
        const providerStatus = getProviderStatus(error);
        const failurePhase = getErrorPhase(error) ?? attemptPhase;
        if (signal.aborted) {
          providerAttempts.push({
            model: selectedModel,
            attemptKind,
            phase: failurePhase,
            providerStatus,
            status: "cancelled",
            latencyMs: Date.now() - attemptStartedAt,
          });
          return finishFailure("cancelled", failurePhase, providerStatus);
        }
        providerAttempts.push({
          model: selectedModel,
          attemptKind,
          phase: failurePhase,
          providerStatus,
          failureReason: getFailureReason(error),
          status: failureStatus,
          latencyMs: Date.now() - attemptStartedAt,
        });

        const retryOnSameModel = isRetryableError(error) && modelAttempt === 0;
        if (retryOnSameModel) {
          const jitteredDelayMs = 1_000 + Math.floor(Math.random() * 1_001);
          const retryDelayMs = getProviderStatus(error) === 429
            ? getRetryAfterMs(error) ?? jitteredDelayMs
            : Math.min(jitteredDelayMs, Math.floor(timeoutMs / 10));
          const remainingBeforeRetryMs = deadline - Date.now();
          const retryBudgetMs = remainingBeforeRetryMs - retryDelayMs - fallbackReserveMs;
          if (retryBudgetMs >= minimumRetryBudgetMs) {
            await sleep(retryDelayMs);
            continue;
          }
        }

        if (remainingFallbackModels > 0 && isFallbackEligible(error)) {
          break;
        }

        return finishFailure(failureStatus, failurePhase, providerStatus);
      } finally {
        signal.removeEventListener("abort", abortAttempt);
      }
    }
  }

  return finishFailure("provider_error");

  function finishFailure(
    status: UsageLogEntry["status"],
    phase?: UsageLogEntry["phase"],
    providerStatus?: number,
  ): ServiceResult {
    recordUsage(options.usageLog ?? [], createUsageEntry(options, {
      model: selectedModel,
      status,
      phase,
      providerStatus,
      attempts,
      latencyMs: Date.now() - startedAt,
      fallbackUsed,
      providerAttempts,
      tokenUsage: hasTokenUsage ? tokenUsage : undefined,
    }));
    return {
      statusCode: 502,
      body: { success: false, message: SAFE_ERROR_MESSAGE },
      attempts,
      fallbackUsed,
    };
  }
}

async function waitForFlight(
  flight: InFlightAdvice,
  signal?: AbortSignal,
): Promise<ServiceResult> {
  if (signal?.aborted) {
    return cancelledResult();
  }

  flight.subscribers += 1;
  let abortHandler: (() => void) | undefined;
  try {
    if (!signal) {
      return await flight.promise;
    }

    const aborted = new Promise<ServiceResult>((resolve) => {
      abortHandler = () => resolve(cancelledResult());
      signal.addEventListener("abort", abortHandler, { once: true });
      if (signal.aborted) {
        abortHandler();
      }
    });
    return await Promise.race([flight.promise, aborted]);
  } finally {
    if (abortHandler) {
      signal?.removeEventListener("abort", abortHandler);
    }
    flight.subscribers -= 1;
    if (flight.subscribers === 0 && !flight.settled) {
      flight.controller.abort();
      await flight.promise.catch(() => undefined);
    }
  }
}

function cancelledResult(): ServiceResult {
  return {
    statusCode: 499,
    body: { success: false, message: SAFE_ERROR_MESSAGE },
    attempts: 0,
  };
}

function createUsageEntry(
  options: AdviceServiceOptions,
  values: Omit<UsageLogEntry, "operation" | "provider" | "model"> & { model?: string },
): UsageLogEntry {
  return {
    operation: "ai.advice",
    provider: options.providerName ?? "fake",
    model: values.model ?? options.modelName ?? "test",
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
  if (getProviderStatus(error) === 429) return "rate_limited";
  if (getProviderStatus(error) === 408) return "timeout";
  if (error.message === "provider-timeout") return "timeout";
  if (error.message === "malformed-output") return "malformed_output";
  if (error.message === "tool-session-mismatch" || error.message === "session-not-found") {
    return "tool_error";
  }
  return "provider_error";
}

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = getProviderStatus(error);
  if (status !== undefined) {
    return status === 408 || status === 429 || status >= 500;
  }
  return ["provider-timeout", "provider-unavailable", "network-error"].includes(error.message);
}

function isFallbackEligible(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = getProviderStatus(error);
  if (status !== undefined) {
    return status === 408 || status === 500 || status === 502 || status === 503;
  }
  return ["provider-timeout", "provider-unavailable", "network-error"].includes(error.message);
}

function getErrorPhase(error: unknown): "initial_tool_call" | "final_response" | undefined {
  return error instanceof GeminiProviderError ? error.phase : undefined;
}

function getProviderStatus(error: unknown): number | undefined {
  return error instanceof GeminiProviderError ? error.status : undefined;
}

function getRetryAfterMs(error: unknown): number | undefined {
  return error instanceof GeminiProviderError ? error.retryAfterMs : undefined;
}

function getFailureReason(error: unknown): GeminiProviderError["failureReason"] {
  return error instanceof GeminiProviderError ? error.failureReason : undefined;
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