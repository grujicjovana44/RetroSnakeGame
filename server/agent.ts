import { parseGameSummary, type GameSummary } from "./api";
import {
  AgentModelError,
  type AgentModel,
  type AgentModelStepRequest,
} from "./agentModel";
import {
  agentModelDecisionSchema,
  agentRunEvidenceSchema,
  evaluatePracticeGoalInputSchema,
  incompleteStatusMessageSchema,
  practicePlanApiResponseSchema,
  practicePlanFinalSchema,
  practicePlanPreflightIncompleteSchema,
  practicePlanRequestSchema,
  practiceToolArgumentsSchema,
  type AgentRunEvidence,
  type AgentStepEvidence,
  type AgentStopReason,
  type PracticeEvaluation,
  type PracticeGoal,
  type PracticePlanApiResponse,
} from "./agentContracts";
import {
  createAgentToolDispatcher,
  getPracticeTargetRange,
  PRACTICE_TOOL_FAILURE_STOP_REASON,
  validatePracticeEvaluation,
  type AgentToolExecutor,
  type PracticeToolContext,
  type PracticeToolFailureCode,
} from "./agentTools";

export const MAX_AGENT_STEPS = 3;
export const MAX_TOOL_CALLS = 2;
export const MAX_PROVIDER_ATTEMPTS = 6;
export const MAX_PROVIDER_ATTEMPTS_PER_STEP = 2;
export const AGENT_DEADLINE_MS = 30_000;
export const PROVIDER_ATTEMPT_TIMEOUT_MS = 10_000;
export const TOOL_TIMEOUT_MS = 250;
export const RETRY_DELAY_MS = 200;
export const MAX_RATE_LIMIT_RETRY_AFTER_MS = 2_000;

export const SAFE_AGENT_ERROR_MESSAGE =
  "Plan trenutno nije moguće napraviti bezbedno. Pokušajte ponovo kasnije.";

export type AgentRunTiming = {
  deadlineMs?: number;
  providerAttemptTimeoutMs?: number;
  toolTimeoutMs?: number;
  retryDelayMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
};

export type AgentRunOptions = {
  model: AgentModel;
  provider: "gemini" | "fake";
  modelName: string;
  sessions: ReadonlyMap<string, unknown>;
  signal?: AbortSignal;
  toolExecutor?: AgentToolExecutor;
  timing?: AgentRunTiming;
};

export type AgentRunResult = {
  statusCode: number;
  body: PracticePlanApiResponse;
  evidence: AgentRunEvidence;
};

class AgentStopError extends Error {
  public constructor(public readonly reason: AgentStopReason) {
    super(reason);
    this.name = "AgentStopError";
  }
}

class ParentAbortError extends Error {
  public constructor() {
    super("run_aborted");
    this.name = "ParentAbortError";
  }
}

export async function runPracticePlan(
  input: unknown,
  options: AgentRunOptions,
): Promise<AgentRunResult> {
  const now = options.timing?.now ?? Date.now;
  const startedAt = now();
  const runId = crypto.randomUUID();
  let providerAttemptCount = 0;
  let retryCount = 0;
  let providerHttpStatus: number | null = null;
  const steps: AgentStepEvidence[] = [];
  const toolDispatcher = createAgentToolDispatcher(options.toolExecutor);

  const requestResult = practicePlanRequestSchema.safeParse(input);
  if (!requestResult.success) {
    return createResult(400, failedResponse(), "failed", "invalid_input");
  }

  const request = requestResult.data;
  if (!options.sessions.has(request.sessionId)) {
    return createResult(400, failedResponse(), "failed", "invalid_input");
  }
  const sessionData = options.sessions.get(request.sessionId);
  const stats = parseGameSummary(sessionData);
  if (!stats) {
    return createResult(400, failedResponse(), "failed", "session_data_invalid");
  }

  const targetRange = getPracticeTargetRange(request.goal, stats);
  if (!targetRange.available) {
    const unavailablePlan = practicePlanPreflightIncompleteSchema.parse({
      goal: request.goal,
      targetValue: null,
      summary: "Za izabrani cilj trenutno nema višeg dostižnog praga.",
      recommendation: "Odigrati novu partiju ili izabrati drugi cilj.",
      evidence: [],
      confidence: "low",
      completed: false,
    });
    return createResult(200, {
      success: true,
      plan: unavailablePlan,
      evaluation: null,
    }, "incomplete", "goal_unavailable");
  }

  const timing = options.timing ?? {};
  const deadlineMs = timing.deadlineMs ?? AGENT_DEADLINE_MS;
  const deadlineAt = startedAt + deadlineMs;
  const controller = new AbortController();
  let deadlineReached = false;
  let clientCancelled = false;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const handleClientAbort = () => {
    clientCancelled = true;
    controller.abort();
  };
  options.signal?.addEventListener("abort", handleClientAbort, { once: true });
  if (options.signal?.aborted) {
    handleClientAbort();
  }
  const remainingAtPreflight = deadlineAt - now();
  if (remainingAtPreflight <= 0) {
    deadlineReached = true;
    controller.abort();
  } else {
    deadlineTimer = setTimeout(() => {
      deadlineReached = true;
      controller.abort();
    }, remainingAtPreflight);
  }

  const evaluations: PracticeEvaluation[] = [];
  const executedCalls = new Set<string>();
  const toolContext: PracticeToolContext = {
    requestSessionId: request.sessionId,
    selectedGoal: request.goal,
    sessions: options.sessions,
  };

  try {
    for (let stepNumber = 1; stepNumber <= MAX_AGENT_STEPS; stepNumber += 1) {
      ensureRunActive();
      const step = createStepEvidence(stepNumber, options.provider, options.modelName);
      steps.push(step);
      const stepRequest: AgentModelStepRequest = {
        stepNumber: stepNumber as 1 | 2 | 3,
        goal: request.goal,
        sessionFacts: projectSessionFacts(stats),
        candidateRange: { min: targetRange.min, max: targetRange.max },
        priorEvaluations: [...evaluations],
        remainingBudget: {
          steps: MAX_AGENT_STEPS - stepNumber + 1,
          tools: MAX_TOOL_CALLS - toolDispatcher.toolCallCount,
          providerAttempts: MAX_PROVIDER_ATTEMPTS - providerAttemptCount,
        },
      };

      const rawDecision = await requestDecisionWithRetry(stepRequest, step);
      ensureRunActive();
      const parsedDecision = agentModelDecisionSchema.safeParse(rawDecision);
      if (!parsedDecision.success) {
        const isFinalDecision = typeof rawDecision === "object" &&
          rawDecision !== null &&
          "kind" in rawDecision &&
          rawDecision.kind === "final";
        if (isFinalDecision) {
          step.decisionKind = "final";
          step.status = "rejected";
          step.validationOutcome = "final_invalid";
          throw new AgentStopError(stepNumber === 1
            ? "invalid_model_proposal"
            : "invalid_final_output");
        }
        step.status = "failed";
        step.validationOutcome = "invalid";
        throw new AgentStopError("malformed_model_output");
      }
      const decision = parsedDecision.data;
      step.decisionKind = decision.kind;

      if (stepNumber === 1 && decision.kind === "final") {
        step.status = "rejected";
        step.proposalStatus = "rejected";
        step.validationOutcome = "invalid";
        throw new AgentStopError("invalid_model_proposal");
      }
      if (stepNumber === 3 && decision.kind === "tool_request") {
        step.status = "rejected";
        step.proposalStatus = "rejected";
        step.validationOutcome = "invalid";
        throw new AgentStopError("max_steps");
      }
      if (decision.kind === "refusal") {
        if (stepNumber === 1) {
          step.status = "failed";
          step.validationOutcome = "valid";
          throw new AgentStopError("model_refusal");
        }
        step.status = "incomplete";
        step.validationOutcome = "valid";
        return createIncompleteResult(request.goal, evaluations[evaluations.length - 1], "model_refusal");
      }
      if (decision.kind === "final") {
        const latestEvaluation = evaluations[evaluations.length - 1];
        if (!latestEvaluation || !isValidFinal(decision.plan, request.goal, latestEvaluation)) {
          step.status = "rejected";
          step.validationOutcome = "final_invalid";
          throw new AgentStopError("invalid_final_output");
        }
        step.status = decision.plan.completed ? "success" : "incomplete";
        step.validationOutcome = "final_valid";
        if (decision.plan.completed) {
          return createResult(200, {
            success: true,
            plan: { ...decision.plan, completed: true },
            evaluation: latestEvaluation,
          }, "completed", "goal_completed");
        }
        return createIncompleteResult(request.goal, latestEvaluation, "plan_incomplete", decision.plan);
      }

      const argsResult = practiceToolArgumentsSchema.safeParse(decision.arguments);
      if (decision.toolName !== "evaluate_practice_goal") {
        step.status = "rejected";
        step.proposalStatus = "rejected";
        step.toolName = decision.toolName;
        step.validationOutcome = "invalid";
        throw new AgentStopError("unknown_tool");
      }
      if (!argsResult.success || argsResult.data.goal !== request.goal) {
        step.status = "rejected";
        step.proposalStatus = "rejected";
        step.toolName = decision.toolName;
        step.validationOutcome = "invalid";
        throw new AgentStopError("invalid_tool_args");
      }
      if (argsResult.data.targetValue < targetRange.min ||
          argsResult.data.targetValue > targetRange.max) {
        step.status = "rejected";
        step.proposalStatus = "rejected";
        step.toolName = decision.toolName;
        step.validationOutcome = "invalid";
        throw new AgentStopError("invalid_tool_args");
      }

      const normalizedCallKey = JSON.stringify([
        decision.toolName,
        request.sessionId,
        argsResult.data.goal,
        argsResult.data.targetValue,
      ]);
      if (executedCalls.has(normalizedCallKey)) {
        step.status = "rejected";
        step.proposalStatus = "rejected";
        step.toolName = decision.toolName;
        step.validationOutcome = "invalid";
        throw new AgentStopError("repeated_call");
      }
      if (stepNumber === 2 && evaluations[evaluations.length - 1]?.rating === "realistic") {
        step.status = "rejected";
        step.proposalStatus = "rejected";
        step.toolName = decision.toolName;
        step.validationOutcome = "invalid";
        throw new AgentStopError("tool_not_justified");
      }
      if (toolDispatcher.toolCallCount >= MAX_TOOL_CALLS) {
        step.status = "rejected";
        step.proposalStatus = "rejected";
        step.toolName = decision.toolName;
        step.validationOutcome = "invalid";
        throw new AgentStopError("tool_limit");
      }
      ensureRunActive();

      const boundToolInput = {
        sessionId: request.sessionId,
        goal: argsResult.data.goal,
        targetValue: argsResult.data.targetValue,
      };
      const parsedToolInput = evaluatePracticeGoalInputSchema.parse(boundToolInput);
      executedCalls.add(normalizedCallKey);
      step.proposalStatus = "accepted";
      step.toolName = decision.toolName;
      step.validationOutcome = "not_checked";
      let dispatchResult;
      try {
        dispatchResult = await executeToolWithWatchdog(
          () => toolDispatcher.dispatch(parsedToolInput, toolContext),
          controller.signal,
          timing.toolTimeoutMs ?? TOOL_TIMEOUT_MS,
          now,
        );
      } catch (error) {
        if (error instanceof AgentStopError || error instanceof ParentAbortError) {
          throw error;
        }
        step.status = "failed";
        step.validationOutcome = "tool_result_invalid";
        throw new AgentStopError("tool_error");
      }
      ensureRunActive();
      if (!dispatchResult.executed) {
        step.status = "rejected";
        step.proposalStatus = "rejected";
        step.validationOutcome = "invalid";
        throw new AgentStopError("tool_limit");
      }

      const toolOutput = dispatchResult.value;
      if (isToolFailure(toolOutput)) {
        step.status = "failed";
        step.validationOutcome = "tool_result_invalid";
        throw new AgentStopError(PRACTICE_TOOL_FAILURE_STOP_REASON[toolOutput.code]);
      }
      if (!isSuccessfulToolOutput(toolOutput)) {
        step.status = "failed";
        step.validationOutcome = "tool_result_invalid";
        throw new AgentStopError("invalid_tool_result");
      }

      const normalizedEvaluation = validatePracticeEvaluation(
        toolOutput.evaluation,
        parsedToolInput,
        sessionData,
      );
      if (!normalizedEvaluation) {
        step.status = "failed";
        step.validationOutcome = "tool_result_invalid";
        throw new AgentStopError("invalid_tool_result");
      }
      evaluations.push(normalizedEvaluation);
      step.status = "success";
      step.validationOutcome = "tool_result_valid";
    }
    throw new AgentStopError("max_steps");
  } catch (error) {
    const reason = error instanceof AgentStopError
      ? error.reason
      : deadlineReached
        ? "deadline"
        : clientCancelled
          ? "cancelled"
          : controller.signal.aborted
            ? "deadline"
            : "provider_error";
    const status = reason === "cancelled" ? "cancelled" : "failed";
    const activeStep = steps[steps.length - 1];
    if (activeStep?.status === "started") {
      activeStep.status = reason === "cancelled" ? "cancelled" : "failed";
    }
    return createResult(statusCodeFor(reason), failedResponse(), status, reason);
  } finally {
    if (deadlineTimer !== undefined) {
      clearTimeout(deadlineTimer);
    }
    options.signal?.removeEventListener("abort", handleClientAbort);
  }

  async function requestDecisionWithRetry(
    stepRequest: AgentModelStepRequest,
    step: AgentStepEvidence,
  ): Promise<unknown> {
    let attemptsThisStep = 0;
    while (true) {
      ensureRunActive();
      if (providerAttemptCount >= MAX_PROVIDER_ATTEMPTS) {
        throw new AgentStopError("provider_attempt_limit");
      }
      const remainingMs = deadlineAt - now();
      if (remainingMs <= 0) {
        deadlineReached = true;
        throw new AgentStopError("deadline");
      }

      const attemptTimeoutMs = Math.max(
        1,
        Math.min(timing.providerAttemptTimeoutMs ?? PROVIDER_ATTEMPT_TIMEOUT_MS, remainingMs),
      );
      attemptsThisStep += 1;
      providerAttemptCount += 1;
      step.providerAttemptCount += 1;
      const attemptStartedAt = now();
      try {
        const output = await callModelWithTimeout(
          options.model,
          stepRequest,
          controller.signal,
          attemptTimeoutMs,
        );
        step.latencyMs += Math.max(0, now() - attemptStartedAt);
        return output;
      } catch (error) {
        step.latencyMs += Math.max(0, now() - attemptStartedAt);
        providerHttpStatus = error instanceof AgentModelError
          ? error.httpStatus ?? null
          : null;
        if (clientCancelled) {
          throw new AgentStopError("cancelled");
        }
        if (deadlineReached || now() >= deadlineAt ||
            (error instanceof AgentModelError &&
             error.code === "provider_timeout" &&
             attemptTimeoutMs >= remainingMs)) {
          deadlineReached = true;
          controller.abort();
          throw new AgentStopError("deadline");
        }
        if (controller.signal.aborted) {
          throw error;
        }
        if (!(error instanceof AgentModelError)) {
          throw new AgentStopError("provider_error");
        }
        if (!error.retryable ||
            attemptsThisStep >= MAX_PROVIDER_ATTEMPTS_PER_STEP ||
            providerAttemptCount >= MAX_PROVIDER_ATTEMPTS) {
          throw new AgentStopError(error.code);
        }

        const delay = retryDelayFor(error, timing.retryDelayMs ?? RETRY_DELAY_MS);
        if (delay === null || deadlineAt - now() <= delay) {
          throw new AgentStopError(error.code);
        }
        await waitForRetry(delay, controller.signal, timing.sleep);
        ensureRunActive();
        retryCount += 1;
      }
    }
  }

  function ensureRunActive(): void {
    if (deadlineReached || deadlineAt - now() <= 0) {
      deadlineReached = true;
      throw new AgentStopError("deadline");
    }
    if (clientCancelled || options.signal?.aborted) {
      clientCancelled = true;
      throw new AgentStopError("cancelled");
    }
    if (controller.signal.aborted) {
      throw new AgentStopError("deadline");
    }
  }

  function createResult(
    statusCode: number,
    body: PracticePlanApiResponse,
    status: AgentRunEvidence["status"],
    stopReason: AgentStopReason,
  ): AgentRunResult {
    const candidateEvidence: AgentRunEvidence = {
      runId,
      status,
      providerHttpStatus,
      providerAttemptCount,
      retryCount,
      toolCallCount: toolDispatcher.toolCallCount,
      stopReason,
      elapsedMs: Math.max(0, now() - startedAt),
      steps: steps.map((step) => ({ ...step })),
    };
    const evidence = agentRunEvidenceSchema.parse(candidateEvidence);
    return { statusCode, body: practicePlanApiResponseSchema.parse(body), evidence };
  }

  function createIncompleteResult(
    goal: PracticeGoal,
    evaluation: PracticeEvaluation,
    reason: "model_refusal" | "plan_incomplete",
    modelPlan?: ReturnType<typeof practicePlanFinalSchema.parse>,
  ): AgentRunResult {
    const incompleteMessage = evaluation.rating === "realistic"
      ? "Cilj je ocenjen kao realističan, ali plan nije dovršen. Možeš koristiti prikazani cilj za sledeću partiju."
      : "Cilj nije preporučen: alat ga je ocenio kao prelak ili preambiciozan.";
    const plan = modelPlan
      ? { ...modelPlan, completed: false }
      : {
          goal,
          targetValue: evaluation.targetValue,
          summary: "Plan nije dovršen.",
          recommendation: "Plan nije dovršen.",
          evidence: evaluation.evidence.slice(0, 5).map((item) => ({
            source: "evaluate_practice_goal" as const,
            field: item.field,
            value: item.value,
            finding: "Vrednost je potvrđena lokalnim evaluatorom.",
          })),
          confidence: "low" as const,
          completed: false as const,
        };
    const parsedPlan = practicePlanFinalSchema.parse(plan);
    return createResult(200, {
      success: true,
      plan: { ...parsedPlan, completed: false },
      evaluation,
      incompleteMessage: incompleteStatusMessageSchema.parse(incompleteMessage),
    }, "incomplete", reason);
  }

  function failedResponse(): PracticePlanApiResponse {
    return { success: false, message: SAFE_AGENT_ERROR_MESSAGE };
  }

  function statusCodeFor(reason: AgentStopReason): number {
    if (reason === "invalid_input" || reason === "session_data_invalid") return 400;
    if (reason === "unauthorized") return 403;
    if (reason === "request_rate_limited") return 429;
    if (reason === "rate_limit") return 503;
    return 502;
  }
}

function createStepEvidence(
  stepNumber: number,
  provider: "gemini" | "fake",
  modelName: string,
): AgentStepEvidence {
  return {
    stepNumber: stepNumber as 1 | 2 | 3,
    provider,
    model: modelName,
    latencyMs: 0,
    decisionKind: null,
    status: "started",
    proposalStatus: "not_applicable",
    toolName: null,
    validationOutcome: "not_checked",
    providerAttemptCount: 0,
  };
}

function projectSessionFacts(stats: GameSummary): AgentModelStepRequest["sessionFacts"] {
  return {
    score: stats.score,
    durationSeconds: stats.durationSeconds,
    foodCollected: stats.foodCollected,
  };
}

function isValidFinal(
  input: unknown,
  selectedGoal: PracticeGoal,
  latestEvaluation: PracticeEvaluation,
): boolean {
  const parsed = practicePlanFinalSchema.safeParse(input);
  if (!parsed.success ||
      parsed.data.goal !== selectedGoal ||
      parsed.data.targetValue !== latestEvaluation.targetValue) {
    return false;
  }

  const hasValidEvidence = parsed.data.evidence.every((item) =>
    item.source === latestEvaluation.tool &&
    latestEvaluation.evidence.some((fact) =>
      fact.field === item.field && fact.value === item.value,
    ),
  );
  if (!hasValidEvidence) {
    return false;
  }
  if (parsed.data.completed &&
      (latestEvaluation.rating !== "realistic" || parsed.data.evidence.length === 0)) {
    return false;
  }
  if (latestEvaluation.rating !== "realistic" &&
      (parsed.data.completed || parsed.data.confidence === "high")) {
    return false;
  }
  return true;
}

function isToolFailure(
  value: unknown,
): value is { success: false; code: PracticeToolFailureCode } {
  if (typeof value !== "object" || value === null ||
      !("code" in value) || !("success" in value)) {
    return false;
  }
  const code = value.code;
  return value.success === false &&
    typeof code === "string" &&
    Object.prototype.hasOwnProperty.call(PRACTICE_TOOL_FAILURE_STOP_REASON, code);
}

function isSuccessfulToolOutput(value: unknown): value is { success: true; evaluation: unknown } {
  return typeof value === "object" &&
    value !== null &&
    "success" in value &&
    value.success === true &&
    "evaluation" in value;
}

async function callModelWithTimeout(
  model: AgentModel,
  request: AgentModelStepRequest,
  parentSignal: AbortSignal,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AgentModelError("provider_timeout"));
    }, timeoutMs);
  });
  const parentAbort = new Promise<never>((_, reject) => {
    abortListener = () => {
      controller.abort();
      reject(new ParentAbortError());
    };
    parentSignal.addEventListener("abort", abortListener, { once: true });
    if (parentSignal.aborted) abortListener();
  });

  try {
    return await Promise.race([
      model.requestDecision(request, controller.signal),
      timeout,
      parentAbort,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (abortListener) parentSignal.removeEventListener("abort", abortListener);
  }
}

async function executeToolWithWatchdog<T>(
  operation: () => Promise<T>,
  parentSignal: AbortSignal,
  timeoutMs: number,
  now: () => number,
): Promise<T> {
  const startedAt = now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AgentStopError("tool_timeout")), timeoutMs);
  });
  const parentAbort = new Promise<never>((_, reject) => {
    abortListener = () => reject(new ParentAbortError());
    parentSignal.addEventListener("abort", abortListener, { once: true });
    if (parentSignal.aborted) abortListener();
  });

  try {
    const result = await Promise.race([operation(), timeout, parentAbort]);
    if (now() - startedAt > timeoutMs) {
      throw new AgentStopError("tool_timeout");
    }
    return result;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (abortListener) parentSignal.removeEventListener("abort", abortListener);
  }
}

function retryDelayFor(error: AgentModelError, retryDelayMs: number): number | null {
  if (error.code !== "rate_limit") {
    return retryDelayMs;
  }
  const delay = error.retryAfterMs ?? retryDelayMs;
  return delay <= MAX_RATE_LIMIT_RETRY_AFTER_MS ? delay : null;
}

async function waitForRetry(
  milliseconds: number,
  signal: AbortSignal,
  customSleep?: AgentRunTiming["sleep"],
): Promise<void> {
  if (milliseconds <= 0) return;
  if (customSleep) {
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => signal.removeEventListener("abort", onAbort);
      const onAbort = () => {
        cleanup();
        reject(new ParentAbortError());
      };
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
      Promise.resolve(customSleep(milliseconds, signal)).then(() => {
        cleanup();
        resolve();
      }, (error: unknown) => {
        cleanup();
        reject(error);
      });
    });
  }
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(new ParentAbortError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}