import type { GameSummary } from "./api";
import type { PracticeEvaluation, PracticeGoal } from "./agentContracts";

export type AgentModelStepRequest = {
  runId?: string;
  stepNumber: 1 | 2 | 3;
  goal: PracticeGoal;
  sessionFacts: Pick<GameSummary, "score" | "durationSeconds" | "foodCollected">;
  candidateRange: { min: number; max: number };
  priorEvaluations: PracticeEvaluation[];
  remainingBudget: {
    steps: number;
    tools: number;
    providerAttempts: number;
  };
};

export interface AgentModel {
  readonly modelName?: string;
  completeRun?(runId: string): void;
  getSelectedModelName?(request: AgentModelStepRequest): string | undefined;
  requestDecision(request: AgentModelStepRequest, signal: AbortSignal): Promise<unknown>;
}

export type FallbackAgentModelOptions = {
  primary: AgentModel;
  fallback: AgentModel;
  primaryModelName: string;
  fallbackModelName: string;
  onModelAttempt?: (runId: string | undefined, modelName: string) => void;
};

/**
 * Switches models only after a transient primary failure. The agent owns the
 * retry counter, timeout and deadline; this wrapper only selects the model for
 * the next attempt of the same step.
 */
export class FallbackAgentModel implements AgentModel {
  public readonly modelName: string;
  private readonly runStates = new Map<string, { useFallback: boolean }>();
  private readonly requestStates = new WeakMap<object, { useFallback: boolean }>();
  private readonly selectedModels = new WeakMap<object, string>();

  public constructor(private readonly options: FallbackAgentModelOptions) {
    this.modelName = `${options.primaryModelName}->${options.fallbackModelName}`;
  }

  public get activeRunCount(): number {
    return this.runStates.size;
  }

  public async requestDecision(
    request: AgentModelStepRequest,
    signal: AbortSignal,
  ): Promise<unknown> {
    const state = request.runId
      ? (this.runStates.get(request.runId) ?? { useFallback: false })
      : (this.requestStates.get(request) ?? { useFallback: false });
    if (request.runId) this.runStates.set(request.runId, state);
    else this.requestStates.set(request, state);
    const selected = state.useFallback ? this.options.fallback : this.options.primary;
    const selectedModelName = state.useFallback
      ? this.options.fallbackModelName
      : this.options.primaryModelName;
    this.selectedModels.set(request, selectedModelName);
    this.options.onModelAttempt?.(request.runId, selectedModelName);
    try {
      return await selected.requestDecision(request, signal);
    } catch (error) {
      if (!state.useFallback && isFallbackEligible(error)) {
        state.useFallback = true;
      }
      throw error;
    }
  }

  public completeRun(runId: string): void {
    this.runStates.delete(runId);
  }

  public getSelectedModelName(request: AgentModelStepRequest): string | undefined {
    return this.selectedModels.get(request);
  }
}

function isFallbackEligible(error: unknown): boolean {
  if (!(error instanceof AgentModelError)) return false;
  if (error.code === "rate_limit" || error.code === "provider_auth_or_quota") {
    return false;
  }
  if (error.httpStatus === 404 || error.httpStatus === 400 || error.httpStatus === 401 || error.httpStatus === 403) {
    return false;
  }
  if (error.httpStatus === 408 || error.httpStatus === 500 ||
    error.httpStatus === 502 || error.httpStatus === 503) return true;
  return error.code === "provider_timeout" || error.code === "provider_unavailable";
}

export type AgentModelErrorCode =
  | "provider_timeout"
  | "provider_unavailable"
  | "rate_limit"
  | "provider_auth_or_quota"
  | "provider_error";

export class AgentModelError extends Error {
  public readonly retryable: boolean;
  public readonly retryAfterMs?: number;
  public readonly httpStatus?: number;

  public constructor(
    public readonly code: AgentModelErrorCode,
    options: { retryAfterMs?: number; httpStatus?: number } = {},
  ) {
    super(code);
    this.name = "AgentModelError";
    this.retryable = code === "provider_timeout" ||
      code === "provider_unavailable" ||
      code === "rate_limit" ||
      options.httpStatus === 408 ||
      options.httpStatus === 500 ||
      options.httpStatus === 502 ||
      options.httpStatus === 503;
    if (code === "rate_limit" &&
        options.retryAfterMs !== undefined &&
        Number.isFinite(options.retryAfterMs) &&
        options.retryAfterMs >= 0) {
      this.retryAfterMs = options.retryAfterMs;
    }
    if (options.httpStatus !== undefined &&
        Number.isInteger(options.httpStatus) &&
        options.httpStatus >= 100 &&
        options.httpStatus <= 599) {
      this.httpStatus = options.httpStatus;
    }
  }
}

export class FakeAgentModelScriptExhaustedError extends Error {
  public constructor() {
    super("fake_agent_script_exhausted");
    this.name = "FakeAgentModelScriptExhaustedError";
  }
}

export type FakeAgentModelMode =
  | "valid-tool-proposal"
  | "unknown-tool"
  | "invalid-arguments"
  | "final"
  | "refusal"
  | "malformed-output"
  | "timeout"
  | "provider-error"
  | "repeated-proposal";

export type FakeAgentModelScriptItem =
  | FakeAgentModelMode
  | { mode: "tool"; targetValue: number }
  | ((request: AgentModelStepRequest) => unknown)
  | Record<string, unknown>;

export class ScriptedFakeAgentModel implements AgentModel {
  public callCount = 0;
  public abortCount = 0;
  public readonly requests: AgentModelStepRequest[] = [];
  private nextScriptIndex = 0;

  public constructor(
    private readonly script: readonly FakeAgentModelScriptItem[] = ["valid-tool-proposal"],
  ) {}

  public async requestDecision(
    request: AgentModelStepRequest,
    signal: AbortSignal,
  ): Promise<unknown> {
    this.callCount += 1;
    this.requests.push(request);
    if (this.nextScriptIndex >= this.script.length) {
      throw new FakeAgentModelScriptExhaustedError();
    }
    const item = this.script[this.nextScriptIndex];
    this.nextScriptIndex += 1;

    if (typeof item === "function") {
      return item(request);
    }
    if (typeof item !== "string") {
      if (item && item.mode === "tool" && typeof item.targetValue === "number") {
        return createToolProposal(request, item.targetValue);
      }
      return item;
    }

    switch (item) {
      case "valid-tool-proposal":
        return createToolProposal(request, request.candidateRange.min + 1);
      case "unknown-tool":
        return {
          kind: "tool_request",
          toolName: "delete_database",
          arguments: { goal: request.goal, targetValue: request.candidateRange.min + 1 },
        };
      case "invalid-arguments":
        return {
          kind: "tool_request",
          toolName: "evaluate_practice_goal",
          arguments: { goal: request.goal, targetValue: "not-an-integer" },
        };
      case "final":
        return createFinalDecision(request);
      case "refusal":
        return { kind: "refusal", reasonCode: "insufficient_evidence" };
      case "malformed-output":
        return "{ malformed model output";
      case "timeout":
        return waitForAbort(signal, () => {
          this.abortCount += 1;
        });
      case "provider-error":
        throw new AgentModelError("provider_unavailable");
      case "repeated-proposal": {
        const previousEvaluation = request.priorEvaluations[request.priorEvaluations.length - 1];
        const targetValue = previousEvaluation?.targetValue ?? request.candidateRange.min + 1;
        return createToolProposal(request, targetValue);
      }
    }
  }
}

function createToolProposal(request: AgentModelStepRequest, targetValue: number): unknown {
  return {
    kind: "tool_request",
    toolName: "evaluate_practice_goal",
    arguments: { goal: request.goal, targetValue },
  };
}

function createFinalDecision(request: AgentModelStepRequest): unknown {
  const evaluation = request.priorEvaluations[request.priorEvaluations.length - 1];
  const candidateEvidence = evaluation?.evidence[0];
  const completed = evaluation?.rating === "realistic";
  return {
    kind: "final",
    plan: {
      goal: request.goal,
      targetValue: evaluation?.targetValue ?? request.candidateRange.min,
      summary: "A bounded practice target is ready.",
      recommendation: "Use the evaluated target for the next game.",
      evidence: candidateEvidence
        ? [{
            source: "evaluate_practice_goal",
            field: candidateEvidence.field,
            value: candidateEvidence.value,
            finding: "This value came from the local evaluator.",
          }]
        : [],
      confidence: completed ? "medium" : "low",
      completed,
    },
  };
}

function waitForAbort(
  signal: AbortSignal,
  onAbort: () => void,
): Promise<never> {
  return new Promise((_, reject) => {
    const abort = () => {
      onAbort();
      reject(new AgentModelError("provider_timeout"));
    };

    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}
