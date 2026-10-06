import { describe, expect, it, vi } from "vitest";
import type { Server as HttpServer } from "node:http";
import {
  createAgentToolDispatcher,
  evaluatePracticeGoal,
  getPracticeTargetRange,
  PRACTICE_TOOL_FAILURE_STOP_REASON,
  validatePracticeEvaluation,
} from "../server/agentTools";
import { GeminiAgentModel } from "../server/geminiAgentModel";
import { runPracticePlan, SAFE_AGENT_ERROR_MESSAGE, type AgentRunOptions } from "../server/agent";
import { createBackendServer, type BackendServerOptions } from "../server/server";
import { createRateLimiter } from "../server/httpSecurity";
import {
  AgentModelError,
  FakeAgentModelScriptExhaustedError,
  ScriptedFakeAgentModel,
  type AgentModel,
  type AgentModelStepRequest,
} from "../server/agentModel";
import type { GameSummary } from "../server/api";
import {
  agentModelDecisionSchema,
  agentRunEvidenceSchema,
  evaluatePracticeGoalInputSchema,
  PRACTICE_EVIDENCE_FIELDS,
  practiceEvaluationSchema,
  practiceGoalSchema,
  practicePlanApiResponseSchema,
  practicePlanFinalSchema,
  practicePlanPreflightIncompleteSchema,
  practicePlanRequestSchema,
  practiceToolArgumentsSchema,
} from "../server/agentContracts";

const sessionId = "73a8904f-a84a-4b35-bf4e-1a22dcb6932a";
const validStats: GameSummary = {
  score: 100,
  durationSeconds: 50,
  collisions: 1,
  foodCollected: 10,
};

const evaluation = {
  tool: "evaluate_practice_goal",
  goal: "survive_longer",
  targetValue: 51,
  goalBaseline: 50,
  rating: "realistic",
  metrics: {
    score: 100,
    durationSeconds: 50,
    foodCollected: 10,
    foodPerMinute: 12,
    scorePerFood: 10,
    targetRatio: 1.02,
  },
  evidence: [
    { field: "candidate.goal", value: "survive_longer" },
    { field: "candidate.targetValue", value: 51 },
    { field: "evaluation.rating", value: "realistic" },
  ],
};

const validPlan = {
  goal: "survive_longer",
  targetValue: 51,
  summary: "A small increase is a reasonable next target.",
  recommendation: "Aim for one more second.",
  evidence: [{
    source: "evaluate_practice_goal",
    field: "evaluation.rating",
    value: "realistic",
    finding: "The evaluator rated this candidate realistic.",
  }],
  confidence: "medium",
  completed: true,
};

function finalDecisionForRequest(
  request: AgentModelStepRequest,
  overrides: Record<string, unknown> = {},
): unknown {
  const lastEvaluation = request.priorEvaluations[request.priorEvaluations.length - 1];
  const evidenceItem = lastEvaluation.evidence[0];
  const completed = lastEvaluation.rating === "realistic";
  return {
    kind: "final",
    plan: {
      goal: lastEvaluation.goal,
      targetValue: lastEvaluation.targetValue,
      summary: "A bounded practice target is ready.",
      recommendation: "Use the evaluated target for the next game.",
      evidence: [{
        source: "evaluate_practice_goal",
        field: evidenceItem.field,
        value: evidenceItem.value,
        finding: "The local evaluator returned this value.",
      }],
      confidence: completed ? "medium" : "low",
      completed,
      ...overrides,
    },
  };
}

function createPlanRunOptions(
  model: AgentModel,
  options: Partial<AgentRunOptions> = {},
  stats: GameSummary = validStats,
): AgentRunOptions {
  return {
    model,
    provider: "fake",
    modelName: "scripted",
    sessions: new Map([[sessionId, stats]]),
    ...options,
  };
}

async function withBackendServer(
  options: BackendServerOptions,
  callback: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server: HttpServer = createBackendServer(options);
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a TCP port.");
  }

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
}

function postJson(
  url: string,
  body: unknown,
  origin = "http://localhost:5173",
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
    signal,
  });
}

describe("W05 agent contracts", () => {
  it("accepts only the two fixed goals and a UUID-scoped request", () => {
    expect(practiceGoalSchema.safeParse("survive_longer").success).toBe(true);
    expect(practiceGoalSchema.safeParse("collect_more_food").success).toBe(true);
    expect(practiceGoalSchema.safeParse("score_more").success).toBe(false);
    expect(practicePlanRequestSchema.safeParse({ sessionId, goal: "survive_longer" }).success).toBe(true);
    expect(practicePlanRequestSchema.safeParse({ sessionId: "invalid", goal: "survive_longer" }).success).toBe(false);
    expect(practicePlanRequestSchema.safeParse({ sessionId, goal: "survive_longer", extra: true }).success).toBe(false);
  });

  it("strictly validates tool argument shape and integer candidates", () => {
    expect(practiceToolArgumentsSchema.safeParse({ goal: "collect_more_food", targetValue: 10_000 }).success).toBe(true);
    expect(practiceToolArgumentsSchema.safeParse({ goal: "survive_longer", targetValue: 1.5 }).success).toBe(false);
    expect(practiceToolArgumentsSchema.safeParse({ goal: "survive_longer", targetValue: 86_401 }).success).toBe(false);
    expect(practiceToolArgumentsSchema.safeParse({ goal: "survive_longer", targetValue: 10, sessionId }).success).toBe(false);
    expect(evaluatePracticeGoalInputSchema.safeParse({ goal: "survive_longer", targetValue: 10, sessionId }).success).toBe(true);
    expect(evaluatePracticeGoalInputSchema.safeParse({ goal: "survive_longer", targetValue: 10, sessionId, extra: true }).success).toBe(false);
  });

  it("validates each model decision kind and rejects unknown decision fields", () => {
    expect(agentModelDecisionSchema.safeParse({
      kind: "tool_request",
      toolName: "evaluate_practice_goal",
      arguments: { goal: "survive_longer", targetValue: 51 },
    }).success).toBe(true);
    expect(agentModelDecisionSchema.safeParse({ kind: "final", plan: validPlan }).success).toBe(true);
    expect(agentModelDecisionSchema.safeParse({ kind: "refusal", reasonCode: "insufficient_evidence" }).success).toBe(true);
    expect(agentModelDecisionSchema.safeParse({ kind: "tool_request", toolName: "tool", arguments: {}, extra: true }).success).toBe(false);
    expect(agentModelDecisionSchema.safeParse({ kind: "unknown" }).success).toBe(false);
  });

  it("strictly validates normalized evaluation and stable evidence IDs", () => {
    expect(practiceEvaluationSchema.safeParse(evaluation).success).toBe(true);
    expect(practiceEvaluationSchema.safeParse({ ...evaluation, collisions: 1 }).success).toBe(false);
    expect(practiceEvaluationSchema.safeParse({
      ...evaluation,
      evidence: [{ field: "invented.field", value: 2 }],
    }).success).toBe(false);
    expect(PRACTICE_EVIDENCE_FIELDS).toHaveLength(10);
  });

  it("recomputes and rejects mismatched, oversized-shape or unknown-field tool output", () => {
    const input = { sessionId, goal: "survive_longer", targetValue: 51 };
    const valid = evaluatePracticeGoal(input, {
      requestSessionId: sessionId,
      selectedGoal: "survive_longer",
      sessions: new Map([[sessionId, validStats]]),
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(validatePracticeEvaluation(valid.evaluation, input, validStats)).toEqual(valid.evaluation);
      expect(validatePracticeEvaluation({ ...valid.evaluation, collisions: 1 }, input, validStats)).toBeNull();
      expect(validatePracticeEvaluation({ ...valid.evaluation, rating: "too_easy" }, input, validStats)).toBeNull();
    }
  });

  it("bounds final output and rejects unknown properties and invalid evidence values", () => {
    expect(practicePlanFinalSchema.safeParse(validPlan).success).toBe(true);
    expect(practicePlanFinalSchema.safeParse({ ...validPlan, extra: true }).success).toBe(false);
    expect(practicePlanFinalSchema.safeParse({ ...validPlan, summary: "" }).success).toBe(false);
    expect(practicePlanFinalSchema.safeParse({ ...validPlan, summary: "s".repeat(501) }).success).toBe(false);
    expect(practicePlanFinalSchema.safeParse({
      ...validPlan,
      evidence: [{ ...validPlan.evidence[0], field: "unlisted.field" }],
    }).success).toBe(false);
    expect(practicePlanFinalSchema.safeParse({
      ...validPlan,
      evidence: [{ ...validPlan.evidence[0], value: { invented: true } }],
    }).success).toBe(false);
  });

  it("requires normalized evaluation for evaluated API responses and null for unavailable goals", () => {
    expect(practicePlanApiResponseSchema.safeParse({
      success: true,
      plan: validPlan,
      evaluation,
    }).success).toBe(true);
    const unavailable = {
      goal: "survive_longer",
      targetValue: null,
      summary: "Za izabrani cilj trenutno nema višeg dostižnog praga.",
      recommendation: "Odigrati novu partiju ili izabrati drugi cilj.",
      evidence: [],
      confidence: "low",
      completed: false,
    };
    expect(practicePlanPreflightIncompleteSchema.safeParse(unavailable).success).toBe(true);
    expect(practicePlanApiResponseSchema.safeParse({ success: true, plan: unavailable, evaluation: null }).success).toBe(true);
    expect(practicePlanApiResponseSchema.safeParse({ success: true, plan: unavailable, evaluation }).success).toBe(false);
  });

  it("bounds run evidence and requires a steps array", () => {
    const runEvidence = {
      runId: sessionId,
      status: "completed",
      providerHttpStatus: null,
      providerAttemptCount: 2,
      retryCount: 0,
      toolCallCount: 1,
      stopReason: "goal_completed",
      elapsedMs: 30_005,
      steps: [{
        stepNumber: 1,
        provider: "fake",
        model: "scripted",
        latencyMs: 10,
        decisionKind: "tool_request",
        status: "success",
        proposalStatus: "accepted",
        toolName: "evaluate_practice_goal",
        validationOutcome: "valid",
        providerAttemptCount: 1,
      }],
    };
    expect(agentRunEvidenceSchema.safeParse(runEvidence).success).toBe(true);
    expect(agentRunEvidenceSchema.safeParse({ ...runEvidence, providerHttpStatus: 400 }).success).toBe(true);
    expect(agentRunEvidenceSchema.safeParse({ ...runEvidence, providerHttpStatus: "400" }).success).toBe(false);
    expect(agentRunEvidenceSchema.safeParse({ ...runEvidence, steps: undefined }).success).toBe(false);
    expect(agentRunEvidenceSchema.safeParse({ ...runEvidence, providerAttemptCount: 7 }).success).toBe(false);
      expect(agentRunEvidenceSchema.safeParse({
        ...runEvidence,
        steps: [{ ...runEvidence.steps[0], status: "arbitrary-private-data" }],
      }).success).toBe(false);
      expect(PRACTICE_TOOL_FAILURE_STOP_REASON).toEqual({
        invalid_tool_args: "invalid_tool_args",
        forbidden: "unauthorized",
        session_data_invalid: "session_data_invalid",
        invalid_tool_result: "invalid_tool_result",
        tool_limit: "tool_limit",
        tool_error: "tool_error",
        tool_timeout: "tool_timeout",
      });
  });
});

describe("evaluate_practice_goal", () => {
  function evaluate(
    goal: "survive_longer" | "collect_more_food",
    targetValue: number,
    stats: unknown = validStats,
  ) {
    const sessions = new Map<string, unknown>([[sessionId, stats]]);
    return evaluatePracticeGoal({ sessionId, goal, targetValue }, {
      requestSessionId: sessionId,
      selectedGoal: goal,
      sessions,
    });
  }

  it("computes target ranges and integer-only ratings from the selected goal baseline", () => {
    expect(getPracticeTargetRange("survive_longer", validStats)).toEqual({ baseline: 50, min: 50, max: 150, available: true });
    expect(evaluate("survive_longer", 50)).toMatchObject({ success: true, evaluation: { rating: "too_easy" } });
    expect(evaluate("survive_longer", 75)).toMatchObject({ success: true, evaluation: { rating: "realistic" } });
    expect(evaluate("survive_longer", 76)).toMatchObject({ success: true, evaluation: { rating: "too_ambitious" } });
  });

  it("keeps baseline plus one realistic for both goals at every baseline from 0 to 50", () => {
    for (let baseline = 0; baseline <= 50; baseline += 1) {
      const stats: GameSummary = {
        ...validStats,
        durationSeconds: baseline,
        foodCollected: baseline,
      };
      for (const goal of ["survive_longer", "collect_more_food"] as const) {
        const range = getPracticeTargetRange(goal, stats);
        expect(range.max).toBeGreaterThanOrEqual(baseline + 1);
        const result = evaluatePracticeGoal({
          sessionId,
          goal,
          targetValue: baseline + 1,
        }, {
          requestSessionId: sessionId,
          selectedGoal: goal,
          sessions: new Map([[sessionId, stats]]),
        });
        expect(result).toMatchObject({ success: true, evaluation: { rating: "realistic" } });
      }
    }
  });

  it("computes rounded ratios and nulls missing denominators", () => {
    const result = evaluate("collect_more_food", 11);
    expect(result).toMatchObject({
      success: true,
      evaluation: {
        metrics: { foodPerMinute: 12, scorePerFood: 10, targetRatio: 1.1 },
      },
    });

    const noDenominators = evaluate("survive_longer", 1, {
      ...validStats,
      durationSeconds: 0,
      foodCollected: 0,
    });
    expect(noDenominators).toMatchObject({
      success: true,
      evaluation: { metrics: { foodPerMinute: null, scorePerFood: null } },
    });

    const unrepresentableRate = evaluate("survive_longer", 1, {
      ...validStats,
      durationSeconds: Number.MIN_VALUE,
    });
    expect(unrepresentableRate).toMatchObject({
      success: true,
      evaluation: { metrics: { foodPerMinute: null } },
    });
  });

  it("accepts the maximum W04 session metric bounds without invalid_tool_result", () => {
    const maximumStats: GameSummary = {
      score: 1_000_000,
      durationSeconds: 86_400,
      collisions: 10_000,
      foodCollected: 9_999,
    };
    expect(evaluate("collect_more_food", 10_000, maximumStats)).toMatchObject({
      success: true,
      evaluation: { metrics: { score: 1_000_000, durationSeconds: 86_400 } },
    });
  });

  it("accepts inclusive range endpoints and rejects just-outside candidates", () => {
    const range = getPracticeTargetRange("collect_more_food", validStats);
    expect(evaluate("collect_more_food", range.min).success).toBe(true);
    expect(evaluate("collect_more_food", range.max).success).toBe(true);
    expect(evaluate("collect_more_food", range.min - 1)).toMatchObject({ success: false, code: "invalid_tool_args" });
    expect(evaluate("collect_more_food", range.max + 1)).toMatchObject({ success: false, code: "invalid_tool_args" });
  });

  it("rejects unavailable goals, mismatched scope, invalid stored stats and malformed args", () => {
    expect(evaluate("survive_longer", 86_400, { ...validStats, durationSeconds: 86_400 })).toMatchObject({ success: false, code: "invalid_tool_args" });
    expect(evaluatePracticeGoal({ sessionId, goal: "survive_longer", targetValue: 51 }, {
      requestSessionId: "7a0f26d0-0b6e-4e11-9fd7-c7c281711f67",
      selectedGoal: "survive_longer",
      sessions: new Map([[sessionId, validStats]]),
    })).toMatchObject({ success: false, code: "forbidden" });
    expect(evaluate("survive_longer", 51, { ...validStats, score: -1 })).toMatchObject({ success: false, code: "session_data_invalid" });
    expect(evaluatePracticeGoal({ sessionId, goal: "survive_longer", targetValue: 51, extra: true }, {
      requestSessionId: sessionId,
      selectedGoal: "survive_longer",
      sessions: new Map([[sessionId, validStats]]),
    })).toMatchObject({ success: false, code: "invalid_tool_args" });
  });

  it("does not mutate session facts, expose collisions, or exceed the output cap", () => {
    const sessions = new Map<string, unknown>([[sessionId, { ...validStats }]]);
    const before = JSON.stringify(sessions.get(sessionId));
    const result = evaluatePracticeGoal({ sessionId, goal: "survive_longer", targetValue: 51 }, {
      requestSessionId: sessionId,
      selectedGoal: "survive_longer",
      sessions,
    });

    expect(result.success).toBe(true);
    expect(JSON.stringify(sessions.get(sessionId))).toBe(before);
    if (result.success) {
      expect(result.evaluation).not.toHaveProperty("collisions");
      expect(result.evaluation.metrics).not.toHaveProperty("collisions");
      expect(new TextEncoder().encode(JSON.stringify(result.evaluation)).byteLength).toBeLessThanOrEqual(4_096);
    }
  });
});

describe("provider-neutral agent model and scripted fake", () => {
  const request: AgentModelStepRequest = {
    stepNumber: 1,
    goal: "survive_longer",
    sessionFacts: {
      score: validStats.score,
      durationSeconds: validStats.durationSeconds,
      foodCollected: validStats.foodCollected,
    },
    candidateRange: { min: 50, max: 150 },
    priorEvaluations: [],
    remainingBudget: { steps: 3, tools: 2, providerAttempts: 6 },
  };

  it("implements the provider-neutral interface with a valid tool proposal", async () => {
    const model: AgentModel = new ScriptedFakeAgentModel(["valid-tool-proposal"]);
    const decision = await model.requestDecision(request, new AbortController().signal);

    expect(decision).toEqual({
      kind: "tool_request",
      toolName: "evaluate_practice_goal",
      arguments: { goal: "survive_longer", targetValue: 51 },
    });
  });

  it("emulates unknown tools, invalid args, malformed output, final and refusal", async () => {
    const modes = [
      "unknown-tool",
      "invalid-arguments",
      "malformed-output",
      "final",
      "refusal",
    ] as const;
    const fake = new ScriptedFakeAgentModel(modes);
    const outputs: unknown[] = [];
    for (const _mode of modes) {
      outputs.push(await fake.requestDecision(request, new AbortController().signal));
    }

    expect(outputs[0]).toMatchObject({ toolName: "delete_database" });
    expect(outputs[1]).toMatchObject({ arguments: { targetValue: "not-an-integer" } });
    expect(outputs[2]).toBe("{ malformed model output");
    expect(outputs[3]).toMatchObject({ kind: "final" });
    expect(outputs[4]).toEqual({ kind: "refusal", reasonCode: "insufficient_evidence" });
    expect(fake.callCount).toBe(modes.length);
  });

  it("emulates provider errors and an abortable timeout without real delays", async () => {
    const failingModel = new ScriptedFakeAgentModel(["provider-error"]);
    await expect(failingModel.requestDecision(request, new AbortController().signal))
      .rejects.toMatchObject({ code: "provider_unavailable" });

    const timeoutModel = new ScriptedFakeAgentModel(["timeout"]);
    const controller = new AbortController();
    const pending = timeoutModel.requestDecision(request, controller.signal);
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(AgentModelError);
    expect(timeoutModel.abortCount).toBe(1);
  });

  it("marks provider error classes with the SPEC retry policy", () => {
    expect(new AgentModelError("provider_timeout").retryable).toBe(true);
    expect(new AgentModelError("provider_unavailable").retryable).toBe(true);
    expect(new AgentModelError("rate_limit", { retryAfterMs: 2_000 })).toMatchObject({
      retryable: true,
      retryAfterMs: 2_000,
    });
    expect(new AgentModelError("provider_auth_or_quota")).toMatchObject({ retryable: false });
    expect(new AgentModelError("provider_error")).toMatchObject({ retryable: false });
  });

  it("accepts custom tool candidates, raw decisions and request functions, then throws on exhaustion", async () => {
    const rawDecision = {
      kind: "tool_request",
      toolName: "evaluate_practice_goal",
      arguments: { goal: "survive_longer", targetValue: 99, sessionId, unexpected: true },
    };
    const fake = new ScriptedFakeAgentModel([
      { mode: "tool", targetValue: 73 },
      rawDecision,
      (stepRequest) => ({
        kind: "tool_request",
        toolName: "evaluate_practice_goal",
        arguments: { goal: "collect_more_food", targetValue: stepRequest.candidateRange.min + 1 },
      }),
      () => ({ kind: "final", plan: { ...validPlan, targetValue: 999 } }),
    ]);

    expect(await fake.requestDecision(request, new AbortController().signal)).toMatchObject({
      arguments: { targetValue: 73 },
    });
    expect(await fake.requestDecision(request, new AbortController().signal)).toEqual(rawDecision);
    expect(await fake.requestDecision(request, new AbortController().signal)).toMatchObject({
      arguments: { goal: "collect_more_food" },
    });
    expect(await fake.requestDecision(request, new AbortController().signal)).toMatchObject({
      kind: "final",
      plan: { targetValue: 999 },
    });
    await expect(fake.requestDecision(request, new AbortController().signal))
      .rejects.toBeInstanceOf(FakeAgentModelScriptExhaustedError);
  });

  it("repeats the previous normalized proposal and keeps step-one context bounded", async () => {
    const firstStep = new ScriptedFakeAgentModel(["valid-tool-proposal"]);
    await firstStep.requestDecision(request, new AbortController().signal);
    expect(firstStep.requests[0].priorEvaluations).toEqual([]);
    expect(firstStep.requests[0].sessionFacts).not.toHaveProperty("collisions");
    expect(JSON.stringify(firstStep.requests[0])).not.toMatch(/too_easy|too_ambitious|realisticDeltaMax/);

    const previous = evaluation as unknown as import("../server/agentContracts").PracticeEvaluation;
    const repeated = new ScriptedFakeAgentModel(["repeated-proposal"]);
    const decision = await repeated.requestDecision({
      ...request,
      stepNumber: 2,
      priorEvaluations: [previous],
    }, new AbortController().signal);
    expect(decision).toMatchObject({ arguments: { targetValue: previous.targetValue } });
  });
});

describe("Gemini agent model adapter", () => {
  const modelStepRequest: AgentModelStepRequest = {
    stepNumber: 1,
    goal: "survive_longer",
    sessionFacts: { score: 100, durationSeconds: 50, foodCollected: 10 },
    candidateRange: { min: 50, max: 150 },
    priorEvaluations: [],
    remainingBudget: { steps: 3, tools: 2, providerAttempts: 6 },
  };

  function createGeminiResponse(payload: unknown, status = 200, headers?: HeadersInit): Response {
    const responseHeaders = new Headers({ "Content-Type": "application/json" });
    new Headers(headers).forEach((value, key) => responseHeaders.set(key, value));
    return new Response(JSON.stringify(payload), {
      status,
      headers: responseHeaders,
    });
  }

  it("injects transport, normalizes a tool proposal, and counts the outbound request", async () => {
    let outboundRequests = 0;
    let requestBody = "";
    const adapter = new GeminiAgentModel({
      apiKey: "test-server-key",
      modelName: "gemini-3.8-flash",
      fetchImplementation: async (input, init) => {
        outboundRequests += 1;
        requestBody = String(init?.body ?? "");
        expect(String(input)).toContain("gemini-3.8-flash:generateContent");
        return createGeminiResponse({
          candidates: [{
            content: {
              role: "model",
              parts: [{ functionCall: {
                name: "evaluate_practice_goal",
                args: { goal: "survive_longer", targetValue: 51 },
              } }],
            },
            finishReason: "STOP",
          }],
        });
      },
    });

    const decision = await adapter.requestDecision(modelStepRequest, new AbortController().signal);
    expect(outboundRequests).toBe(1);
    expect(decision).toEqual({
      kind: "tool_request",
      toolName: "evaluate_practice_goal",
      arguments: { goal: "survive_longer", targetValue: 51 },
    });
    expect(requestBody).not.toMatch(/too_easy|too_ambitious|realisticDeltaMax|targetRatio|ceil|delta|threshold|formula|1\.10|1\.50/i);
    const systemInstruction = JSON.parse(requestBody).systemInstruction.parts[0].text as string;
    expect(systemInstruction).toContain("Step 1:");
    expect(systemInstruction).toContain("Serbian Latin");
    expect(systemInstruction).toContain("higher than the sessionFacts value for the selected goal");
    expect(systemInstruction).toContain("Prefer a modest, incremental improvement rather than a target near the upper end of candidateRange");
    expect(systemInstruction).not.toMatch(/too_easy|too_ambitious|realistic|realisticDeltaMax|targetRatio|delta|threshold|formula|1\.10|1\.50/i);
    expect(requestBody).not.toContain(sessionId);
    const body = JSON.parse(requestBody) as {
      tools?: unknown[];
      toolConfig?: Record<string, unknown>;
      generationConfig: Record<string, unknown>;
    };
    const generationConfig = body.generationConfig;
    expect(body.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({
        functionDeclarations: [expect.objectContaining({ name: "evaluate_practice_goal" })],
      }),
    ]));
    expect(body.toolConfig).toMatchObject({
      functionCallingConfig: {
        mode: "ANY",
        allowedFunctionNames: ["evaluate_practice_goal"],
      },
    });
    expect(generationConfig.responseJsonSchema).toBeUndefined();
    expect(generationConfig.thinkingConfig).toMatchObject({ thinkingLevel: "LOW" });
  });

  it("returns parsed final JSON as an untrusted decision for orchestrator validation", async () => {
    const rawDecision = {
      kind: "final",
      plan: { ...validPlan, extraFromProvider: "must be rejected later" },
    };
    const adapter = new GeminiAgentModel({
      apiKey: "test-server-key",
      modelName: "gemini-3.8-flash",
      fetchImplementation: async () => createGeminiResponse({
        candidates: [{ content: { parts: [{ text: JSON.stringify(rawDecision) }] } }],
      }),
    });

    expect(await adapter.requestDecision(modelStepRequest, new AbortController().signal)).toEqual(rawDecision);
  });

  it("uses conditional Step-2 tool access and requires JSON final/refusal output", async () => {
    let requestBody = "";
    const adapter = new GeminiAgentModel({
      apiKey: "test-server-key",
      modelName: "gemini-3.8-flash",
      fetchImplementation: async (_input, init) => {
        requestBody = String(init?.body ?? "");
        return createGeminiResponse({
          candidates: [{
            content: { parts: [{ functionCall: {
              name: "evaluate_practice_goal",
              args: { goal: "survive_longer", targetValue: 75 },
            } }] },
          }],
        });
      },
    });
    const nonRealisticEvaluation = {
      ...evaluation,
      targetValue: 150,
      rating: "too_ambitious",
    } as import("../server/agentContracts").PracticeEvaluation;

    await adapter.requestDecision({
      ...modelStepRequest,
      stepNumber: 2,
      priorEvaluations: [nonRealisticEvaluation],
    }, new AbortController().signal);
    const body = JSON.parse(requestBody) as {
      tools?: unknown[];
      toolConfig?: Record<string, unknown>;
      generationConfig: Record<string, unknown>;
    };
    const generationConfig = body.generationConfig;
    expect(body.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ functionDeclarations: [expect.objectContaining({ name: "evaluate_practice_goal" })] }),
    ]));
    expect(body.toolConfig).toMatchObject({
      functionCallingConfig: { mode: "AUTO" },
    });
    expect(generationConfig.responseMimeType).toBe("application/json");
    expect(generationConfig.responseJsonSchema).toMatchObject({
      properties: { kind: { enum: ["final", "refusal"] } },
    });
  });

  it("sends no tool in Step 2 after a realistic result and in Step 3", async () => {
    const requests: Record<string, unknown>[] = [];
    const adapter = new GeminiAgentModel({
      apiKey: "test-server-key",
      modelName: "gemini-3.8-flash",
      fetchImplementation: async (_input, init) => {
        const body = JSON.parse(String(init?.body ?? "")) as Record<string, unknown>;
        requests.push(body);
        return createGeminiResponse({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ kind: "refusal", reasonCode: "insufficient_evidence" }) }] } }],
        });
      },
    });
    const realisticEvaluation = evaluation as unknown as import("../server/agentContracts").PracticeEvaluation;

    await adapter.requestDecision({
      ...modelStepRequest,
      stepNumber: 2,
      priorEvaluations: [realisticEvaluation],
    }, new AbortController().signal);
    await adapter.requestDecision({
      ...modelStepRequest,
      stepNumber: 3,
      priorEvaluations: [realisticEvaluation],
    }, new AbortController().signal);

    for (const body of requests) {
      const generationConfig = body.generationConfig as Record<string, unknown>;
      expect(generationConfig.tools).toBeUndefined();
      expect(generationConfig.toolConfig).toBeUndefined();
      expect(generationConfig.responseMimeType).toBe("application/json");
      expect(generationConfig.responseJsonSchema).toBeDefined();
    }
    const stepTwoInstruction = (requests[0].systemInstruction as { parts: { text: string }[] }).parts[0].text;
    expect(stepTwoInstruction).toContain("at most one revision");
    expect(stepTwoInstruction).toContain("different targetValue");
    const responseSchema = (requests[0].generationConfig as { responseJsonSchema: Record<string, unknown> }).responseJsonSchema;
    expect(responseSchema).not.toHaveProperty("anyOf");
    expect(responseSchema).not.toHaveProperty("additionalProperties");
    expect(responseSchema).toMatchObject({ required: ["kind"] });
    const schemaProperties = responseSchema.properties as Record<string, {
      properties?: Record<string, unknown>;
    }>;
    const planProperties = schemaProperties.plan?.properties as Record<string, {
      maxLength?: number;
      maxItems?: number;
      items?: { properties?: Record<string, { maxLength?: number }> };
    }>;
    expect(planProperties.summary?.maxLength).toBe(500);
    expect(planProperties.recommendation?.maxLength).toBe(500);
    expect(planProperties.evidence?.maxItems).toBe(5);
    const evidenceProperties = planProperties.evidence?.items?.properties;
    expect(evidenceProperties?.finding?.maxLength).toBe(300);
  });

  it("strips JSON Markdown fences and treats MAX_TOKENS empty output as malformed", async () => {
    const decision = { kind: "refusal", reasonCode: "insufficient_evidence" };
    const fencedAdapter = new GeminiAgentModel({
      apiKey: "test-server-key",
      modelName: "gemini-3.8-flash",
      fetchImplementation: async () => createGeminiResponse({
        candidates: [{ content: { parts: [{ text: `\`\`\`json\n${JSON.stringify(decision)}\n\`\`\`` }] } }],
      }),
    });
    expect(await fencedAdapter.requestDecision({ ...modelStepRequest, stepNumber: 3 }, new AbortController().signal))
      .toEqual(decision);

    const maxTokensAdapter = new GeminiAgentModel({
      apiKey: "test-server-key",
      modelName: "gemini-3.8-flash",
      fetchImplementation: async () => createGeminiResponse({
        candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }],
      }),
    });
    expect(await maxTokensAdapter.requestDecision(modelStepRequest, new AbortController().signal))
      .toEqual({ kind: "malformed_model_output" });
  });

  it("disables SDK retries and maps provider 503 after exactly one HTTP request", async () => {
    let outboundRequests = 0;
    const adapter = new GeminiAgentModel({
      apiKey: "test-server-key",
      modelName: "gemini-3.8-flash",
      fetchImplementation: async () => {
        outboundRequests += 1;
        return createGeminiResponse({ error: { code: 503, message: "unavailable" } }, 503);
      },
    });

    await expect(adapter.requestDecision(modelStepRequest, new AbortController().signal))
      .rejects.toMatchObject({ code: "provider_unavailable", retryable: true });
    expect(outboundRequests).toBe(1);
  });

  it("maps provider 429 Retry-After and does not retry auth or non-retryable errors", async () => {
    let outboundRequests = 0;
    const rateLimitedAdapter = new GeminiAgentModel({
      apiKey: "test-server-key",
      modelName: "gemini-3.8-flash",
      fetchImplementation: async () => {
        outboundRequests += 1;
        return createGeminiResponse({ error: { code: 429 } }, 429, { "Retry-After": "2" });
      },
    });
    await expect(rateLimitedAdapter.requestDecision(modelStepRequest, new AbortController().signal))
      .rejects.toMatchObject({ code: "rate_limit", retryable: true, retryAfterMs: 2_000 });
    expect(outboundRequests).toBe(1);

    const authAdapter = new GeminiAgentModel({
      apiKey: "test-server-key",
      modelName: "gemini-3.8-flash",
      fetchImplementation: async () => {
        outboundRequests += 1;
        return createGeminiResponse({ error: { code: 403 } }, 403);
      },
    });
    await expect(authAdapter.requestDecision(modelStepRequest, new AbortController().signal))
      .rejects.toMatchObject({ code: "provider_auth_or_quota", retryable: false });
    expect(outboundRequests).toBe(2);

    const badRequestAdapter = new GeminiAgentModel({
      apiKey: "test-server-key",
      modelName: "gemini-3.8-flash",
      fetchImplementation: async () => createGeminiResponse({ error: { code: 400 } }, 400),
    });
    await expect(badRequestAdapter.requestDecision(modelStepRequest, new AbortController().signal))
      .rejects.toMatchObject({ code: "provider_error", retryable: false, httpStatus: 400 });
  });

  it("rejects models outside the server allowlist", () => {
    expect(() => new GeminiAgentModel({ apiKey: "test", modelName: "gemini-outside-allowlist" })).toThrow();
  });
});

describe("bounded Practice Plan orchestrator", () => {
  it("completes a normal run with step-one context free of rating criteria", async () => {
    const model = new ScriptedFakeAgentModel(["valid-tool-proposal", "final"]);
    const result = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(model));

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ success: true, plan: { completed: true, targetValue: 51 } });
    expect(result.evidence).toMatchObject({
      status: "completed",
      stopReason: "goal_completed",
      providerAttemptCount: 2,
      toolCallCount: 1,
      steps: [{ stepNumber: 1 }, { stepNumber: 2 }],
    });
    expect(model.requests[0].priorEvaluations).toEqual([]);
    expect(JSON.stringify(model.requests[0])).not.toMatch(/too_easy|too_ambitious|realisticDeltaMax/);
    expect(model.requests[0].sessionFacts).not.toHaveProperty("collisions");
    if (result.body.success && result.body.evaluation) {
      expect(result.body.evaluation).not.toHaveProperty("collisions");
      expect(result.body.evaluation.metrics).not.toHaveProperty("collisions");
    }
  });

  it("returns the same safe 400 body for invalid UUID and missing session without calls", async () => {
    const model = new ScriptedFakeAgentModel(["valid-tool-proposal"]);
    let toolExecutions = 0;
    const options = createPlanRunOptions(model, {
      toolExecutor: () => { toolExecutions += 1; return {}; },
    });
    const invalidId = await runPracticePlan({ sessionId: "invalid", goal: "survive_longer" }, options);
    const missingSession = await runPracticePlan({
      sessionId: "7a0f26d0-0b6e-4e11-9fd7-c7c281711f67",
      goal: "survive_longer",
    }, options);

    expect(invalidId.statusCode).toBe(400);
    expect(missingSession.statusCode).toBe(400);
    expect(invalidId.body).toEqual(missingSession.body);
    expect(model.callCount).toBe(0);
    expect(toolExecutions).toBe(0);
  });

  it("returns the same preflight 400 body for corrupted session metrics and a missing session", async () => {
    const model = new ScriptedFakeAgentModel(["valid-tool-proposal"]);
    const corrupted = createPlanRunOptions(model, {
      sessions: new Map([[sessionId, { ...validStats, score: -1 }]]),
    });
    const missing = createPlanRunOptions(model, { sessions: new Map() });
    const invalidStored = await runPracticePlan({ sessionId, goal: "survive_longer" }, corrupted);
    const missingStored = await runPracticePlan({ sessionId, goal: "survive_longer" }, missing);

    expect(invalidStored.statusCode).toBe(400);
    expect(invalidStored.body).toEqual(missingStored.body);
    expect(invalidStored.evidence.stopReason).toBe("session_data_invalid");
    expect(model.callCount).toBe(0);
  });

  it("returns the fixed unavailable plan without model, tool or evaluation", async () => {
    const model = new ScriptedFakeAgentModel(["valid-tool-proposal"]);
    let toolExecutions = 0;
    const stats = { ...validStats, durationSeconds: 86_400 };
    const result = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(model, {
      toolExecutor: () => { toolExecutions += 1; return {}; },
    }, stats));

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ success: true, plan: { targetValue: null, completed: false }, evaluation: null });
    expect(result.evidence).toMatchObject({ stopReason: "goal_unavailable", providerAttemptCount: 0, toolCallCount: 0 });
    expect(model.callCount).toBe(0);
    expect(toolExecutions).toBe(0);
  });

  it.each([
    ["unknown-tool", "unknown_tool"],
    ["invalid-arguments", "invalid_tool_args"],
  ] as const)("rejects %s before tool execution", async (mode, reason) => {
    const model = new ScriptedFakeAgentModel([mode]);
    let toolExecutions = 0;
    const result = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(model, {
      toolExecutor: () => { toolExecutions += 1; return {}; },
    }));

    expect(result.statusCode).toBe(502);
    expect(result.evidence.stopReason).toBe(reason);
    expect(result.evidence.toolCallCount).toBe(0);
    expect(toolExecutions).toBe(0);
  });

  it("rejects model-supplied sessionId, unknown argument keys and mismatched goals before dispatch", async () => {
    const proposals = [
      { goal: "survive_longer", targetValue: 51, sessionId },
      { goal: "survive_longer", targetValue: 51, extra: true },
      { goal: "collect_more_food", targetValue: 51 },
    ];
    for (const argumentsValue of proposals) {
      const model = new ScriptedFakeAgentModel([() => ({
        kind: "tool_request",
        toolName: "evaluate_practice_goal",
        arguments: argumentsValue,
      })]);
      let toolExecutions = 0;
      const result = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(model, {
        toolExecutor: () => { toolExecutions += 1; return {}; },
      }));
      expect(result.statusCode).toBe(502);
      expect(result.evidence.stopReason).toBe("invalid_tool_args");
      expect(toolExecutions).toBe(0);
    }
  });

  it("rejects malformed decisions and a step-one final without calling the tool", async () => {
    for (const mode of ["malformed-output", "final"] as const) {
      const model = new ScriptedFakeAgentModel([mode]);
      let toolExecutions = 0;
      const result = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(model, {
        toolExecutor: () => { toolExecutions += 1; return {}; },
      }));
      expect(result.statusCode).toBe(502);
      expect(result.evidence.stopReason).toBe(mode === "final" ? "invalid_model_proposal" : "malformed_model_output");
      expect(toolExecutions).toBe(0);
    }
  });

  it("does not replay a throwing tool and returns no internal error details", async () => {
    const secret = "private-tool-stack-sentinel";
    const model = new ScriptedFakeAgentModel(["valid-tool-proposal", "final"]);
    const result = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(model, {
      toolExecutor: () => { throw new Error(secret); },
    }));

    expect(result.statusCode).toBe(502);
    expect(result.evidence.stopReason).toBe("tool_error");
    expect(result.evidence.toolCallCount).toBe(1);
    expect(model.callCount).toBe(1);
    expect(JSON.stringify(result.body)).not.toContain(secret);
  });

  it("does not expose raw provider errors, stacks or secrets", async () => {
    const secret = "private-provider-token-sentinel";
    const model = new ScriptedFakeAgentModel([
      () => { throw new Error(`${secret}\nprivate stack`); },
    ]);
    const result = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(model));

    expect(result.statusCode).toBe(502);
    expect(result.evidence.stopReason).toBe("provider_error");
    expect(JSON.stringify(result.body)).not.toContain(secret);
    expect(JSON.stringify(result.evidence)).not.toContain(secret);
  });

  it("discards a tool result that returns after the watchdog", async () => {
    const model = new ScriptedFakeAgentModel(["valid-tool-proposal", "final"]);
    const result = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(model, {
      toolExecutor: () => new Promise((resolve) => setTimeout(() => resolve({}), 20)),
      timing: { toolTimeoutMs: 5 },
    }));

    expect(result.statusCode).toBe(502);
    expect(result.evidence.stopReason).toBe("tool_timeout");
    expect(result.evidence.toolCallCount).toBe(1);
    expect(model.callCount).toBe(1);
  });

  it("rejects a forged or mismatched tool result before another model step", async () => {
    const model = new ScriptedFakeAgentModel(["valid-tool-proposal", "final"]);
    const result = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(model, {
      toolExecutor: (input, context) => {
        const valid = evaluatePracticeGoal(input, context);
        if (!valid.success) return valid;
        return { success: true, evaluation: { ...valid.evaluation, rating: "too_easy" } };
      },
    }));

    expect(result.statusCode).toBe(502);
    expect(result.evidence.stopReason).toBe("invalid_tool_result");
    expect(result.evidence.toolCallCount).toBe(1);
    expect(model.callCount).toBe(1);
  });

  it("rejects repeated calls before the Step-2 justification gate", async () => {
    const model = new ScriptedFakeAgentModel([
      { mode: "tool", targetValue: 150 },
      "repeated-proposal",
    ]);
    let toolExecutions = 0;
    const result = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(model, {
      toolExecutor: (input, context) => {
        toolExecutions += 1;
        return evaluatePracticeGoal(input, context);
      },
    }));

    expect(result.evidence.stopReason).toBe("repeated_call");
    expect(result.evidence.toolCallCount).toBe(1);
    expect(toolExecutions).toBe(1);
  });

  it("rejects an unjustified distinct Step-2 request after a realistic rating", async () => {
    const model = new ScriptedFakeAgentModel([
      "valid-tool-proposal",
      { mode: "tool", targetValue: 52 },
    ]);
    let toolExecutions = 0;
    const result = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(model, {
      toolExecutor: (input, context) => {
        toolExecutions += 1;
        return evaluatePracticeGoal(input, context);
      },
    }));

    expect(result.evidence.stopReason).toBe("tool_not_justified");
    expect(result.evidence.toolCallCount).toBe(1);
    expect(toolExecutions).toBe(1);
  });

  it("stops a third tool proposal at max_steps before the executor", async () => {
    const model = new ScriptedFakeAgentModel([
      { mode: "tool", targetValue: 150 },
      { mode: "tool", targetValue: 100 },
      "valid-tool-proposal",
    ]);
    let toolExecutions = 0;
    const result = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(model, {
      toolExecutor: (input, context) => {
        toolExecutions += 1;
        return evaluatePracticeGoal(input, context);
      },
    }));

    expect(result.evidence.stopReason).toBe("max_steps");
    expect(result.evidence.toolCallCount).toBe(2);
    expect(toolExecutions).toBe(2);
  });

  it("guards the independent tool limit before invoking the executor", async () => {
    let toolExecutions = 0;
    const dispatcher = createAgentToolDispatcher(() => {
      toolExecutions += 1;
      return {};
    }, 2);
    const result = await dispatcher.dispatch({}, {
      requestSessionId: sessionId,
      selectedGoal: "survive_longer",
      sessions: new Map([[sessionId, validStats]]),
    });

    expect(result).toEqual({ executed: false, code: "tool_limit" });
    expect(dispatcher.toolCallCount).toBe(2);
    expect(toolExecutions).toBe(0);
  });

  it("maps returned tool failure codes through the shared stop taxonomy", async () => {
    const failures = [
      { code: "forbidden", statusCode: 403, stopReason: "unauthorized" },
      { code: "session_data_invalid", statusCode: 400, stopReason: "session_data_invalid" },
      { code: "invalid_tool_result", statusCode: 502, stopReason: "invalid_tool_result" },
    ] as const;
    for (const failure of failures) {
      const model = new ScriptedFakeAgentModel(["valid-tool-proposal"]);
      const result = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(model, {
        toolExecutor: () => ({ success: false, code: failure.code }),
      }));
      expect(result.statusCode).toBe(failure.statusCode);
      expect(result.evidence.stopReason).toBe(failure.stopReason);
    }
  });

  it("allows one candidate revision and binds the final to the latest evaluation", async () => {
    const model = new ScriptedFakeAgentModel([
      { mode: "tool", targetValue: 150 },
      { mode: "tool", targetValue: 75 },
      "final",
    ]);
    const result = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(model));

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ success: true, plan: { targetValue: 75, completed: true }, evaluation: { targetValue: 75 } });
    expect(result.evidence).toMatchObject({ providerAttemptCount: 3, toolCallCount: 2, steps: [{ stepNumber: 1 }, { stepNumber: 2 }, { stepNumber: 3 }] });
  });

  it("maps Step-1 refusal to failure and Step-2/3 refusal to rating-specific partials", async () => {
    const stepOne = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(
      new ScriptedFakeAgentModel(["refusal"]),
    ));
    expect(stepOne.statusCode).toBe(502);
    expect(stepOne.evidence.stopReason).toBe("model_refusal");

    const realistic = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(
      new ScriptedFakeAgentModel(["valid-tool-proposal", "refusal"]),
    ));
    expect(realistic.statusCode).toBe(200);
    expect(realistic.body).toMatchObject({
      success: true,
      plan: { completed: false, confidence: "low" },
      incompleteMessage: "Cilj je ocenjen kao realističan, ali plan nije dovršen. Možeš koristiti prikazani cilj za sledeću partiju.",
    });

    const nonRealistic = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(
      new ScriptedFakeAgentModel([{ mode: "tool", targetValue: 150 }, "refusal"]),
    ));
    expect(nonRealistic.body).toMatchObject({
      success: true,
      incompleteMessage: "Cilj nije preporučen: alat ga je ocenio kao prelak ili preambiciozan.",
      evaluation: { rating: "too_ambitious" },
    });

    const stepThree = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(
      new ScriptedFakeAgentModel([
        { mode: "tool", targetValue: 150 },
        { mode: "tool", targetValue: 75 },
        "refusal",
      ]),
    ));
    expect(stepThree.statusCode).toBe(200);
    expect(stepThree.body).toMatchObject({
      success: true,
      plan: { completed: false, targetValue: 75 },
      evaluation: { targetValue: 75, rating: "realistic" },
    });
  });

  it("rejects finals with a wrong goal, mismatched target, forged evidence or invalid rating semantics", async () => {
    const overrides = [
      { goal: "collect_more_food" },
      { targetValue: 149 },
      { evidence: [{ source: "evaluate_practice_goal", field: "evaluation.rating", value: "realistic", finding: "forged" }] },
      { completed: true, confidence: "high" },
    ];
    for (const planOverrides of overrides) {
      const model = new ScriptedFakeAgentModel([
        { mode: "tool", targetValue: 150 },
        (stepRequest) => finalDecisionForRequest(stepRequest, planOverrides),
      ]);
      const result = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(model));
      expect(result.statusCode).toBe(502);
      expect(result.evidence.stopReason).toBe("invalid_final_output");
    }

    const invalidSchemaModel = new ScriptedFakeAgentModel([
      "valid-tool-proposal",
      (stepRequest) => finalDecisionForRequest(stepRequest, {
        evidence: [{ source: "evaluate_practice_goal", field: "invented.field", value: 1, finding: "forged" }],
      }),
    ]);
    const invalidSchemaFinal = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(invalidSchemaModel));
    expect(invalidSchemaFinal.evidence.stopReason).toBe("invalid_final_output");
  });

  it("retries transient provider failures once per step and preserves safe status mapping", async () => {
    const delays: number[] = [];
    const transient = new ScriptedFakeAgentModel([
      () => { throw new AgentModelError("provider_unavailable"); },
      "valid-tool-proposal",
      "final",
    ]);
    const recovered = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(transient, {
      timing: { sleep: async (milliseconds) => { delays.push(milliseconds); } },
    }));
    expect(recovered.statusCode).toBe(200);
    expect(recovered.evidence).toMatchObject({ providerAttemptCount: 3, retryCount: 1 });
    expect(delays).toEqual([200]);

    const auth = new ScriptedFakeAgentModel([
      () => { throw new AgentModelError("provider_auth_or_quota"); },
    ]);
    const authFailure = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(auth));
    expect(authFailure.statusCode).toBe(502);
    expect(authFailure.evidence.providerAttemptCount).toBe(1);

    const exhausted = new ScriptedFakeAgentModel([
      () => { throw new AgentModelError("provider_unavailable"); },
      () => { throw new AgentModelError("provider_unavailable"); },
    ]);
    const exhaustedResult = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(exhausted, {
      timing: { sleep: async () => undefined },
    }));
    expect(exhaustedResult.statusCode).toBe(502);
    expect(exhaustedResult.evidence.stopReason).toBe("provider_unavailable");
    expect(exhaustedResult.evidence.providerAttemptCount).toBe(2);
  });

  it("honors provider Retry-After values and maps 429 to 503", async () => {
    const delays: number[] = [];
    const retry429 = new ScriptedFakeAgentModel([
      () => { throw new AgentModelError("rate_limit"); },
      "valid-tool-proposal",
      "final",
    ]);
    const recovered = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(retry429, {
      timing: { sleep: async (milliseconds) => { delays.push(milliseconds); } },
    }));
    expect(recovered.statusCode).toBe(200);
    expect(delays).toEqual([200]);

    const exactRetryAfterDelays: number[] = [];
    const retryWithExactDelay = new ScriptedFakeAgentModel([
      () => { throw new AgentModelError("rate_limit", { retryAfterMs: 500 }); },
      "valid-tool-proposal",
      "final",
    ]);
    await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(retryWithExactDelay, {
      timing: { sleep: async (milliseconds) => { exactRetryAfterDelays.push(milliseconds); } },
    }));
    expect(exactRetryAfterDelays).toEqual([500]);

    const tooLong = new ScriptedFakeAgentModel([
      () => { throw new AgentModelError("rate_limit", { retryAfterMs: 2_001 }); },
    ]);
    const limited = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(tooLong));
    expect(limited.statusCode).toBe(503);
    expect(limited.evidence.stopReason).toBe("rate_limit");
    expect(limited.evidence.providerAttemptCount).toBe(1);
  });

  it("propagates provider timeout aborts and stops after one retry", async () => {
    const model = new ScriptedFakeAgentModel(["timeout", "timeout"]);
    const result = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(model, {
      timing: { providerAttemptTimeoutMs: 5, sleep: async () => undefined },
    }));

    expect(result.statusCode).toBe(502);
    expect(result.evidence.stopReason).toBe("provider_timeout");
    expect(result.evidence.providerAttemptCount).toBe(2);
    expect(model.abortCount).toBe(2);
  });

  it("aborts an active provider at total deadline and on client cancellation", async () => {
    const deadlineModel = new ScriptedFakeAgentModel(["timeout"]);
    let toolExecutions = 0;
    const deadlineResult = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(deadlineModel, {
      toolExecutor: () => { toolExecutions += 1; return {}; },
      timing: { deadlineMs: 15, providerAttemptTimeoutMs: 1_000 },
    }));
    expect(deadlineResult.statusCode).toBe(502);
    expect(deadlineResult.body).toEqual({ success: false, message: SAFE_AGENT_ERROR_MESSAGE });
    expect(deadlineResult.evidence.stopReason).toBe("deadline");
    expect(deadlineResult.evidence.providerAttemptCount).toBe(1);
    expect(deadlineResult.evidence.toolCallCount).toBe(0);
    expect(deadlineModel.callCount).toBe(1);
    expect(deadlineModel.abortCount).toBe(1);
    expect(toolExecutions).toBe(0);

    const cancelModel = new ScriptedFakeAgentModel(["timeout"]);
    const controller = new AbortController();
    const pending = runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(cancelModel, {
      signal: controller.signal,
      timing: { deadlineMs: 1_000, providerAttemptTimeoutMs: 500 },
    }));
    setTimeout(() => controller.abort(), 10);
    const cancelled = await pending;
    expect(cancelled.evidence.stopReason).toBe("cancelled");
    expect(cancelModel.abortCount).toBe(1);
  });

  it("enforces the six-attempt run budget without timeout delays", async () => {
    const delays: number[] = [];
    const model = new ScriptedFakeAgentModel([
      () => { throw new AgentModelError("provider_unavailable"); },
      { mode: "tool", targetValue: 150 },
      () => { throw new AgentModelError("provider_unavailable"); },
      { mode: "tool", targetValue: 75 },
      () => { throw new AgentModelError("provider_unavailable"); },
      "final",
      "refusal",
    ]);
    const result = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(model, {
      timing: { sleep: async (milliseconds) => { delays.push(milliseconds); } },
    }));

    expect(result.statusCode).toBe(200);
    expect(model.callCount).toBe(6);
    expect(result.evidence).toMatchObject({ providerAttemptCount: 6, retryCount: 3, toolCallCount: 2 });
    expect(delays).toEqual([200, 200, 200]);
  });

  it("accepts a non-realistic incomplete final with HTTP 200 and normalized evaluation", async () => {
    const model = new ScriptedFakeAgentModel([
      { mode: "tool", targetValue: 150 },
      (stepRequest) => finalDecisionForRequest(stepRequest, {
        completed: false,
        confidence: "medium",
        recommendation: "Model prose must not replace the fixed UI message.",
      }),
    ]);
    const result = await runPracticePlan({ sessionId, goal: "survive_longer" }, createPlanRunOptions(model));

    expect(result.statusCode).toBe(200);
    expect(result.evidence.stopReason).toBe("plan_incomplete");
    expect(result.body).toMatchObject({
      success: true,
      plan: { completed: false, confidence: "medium", targetValue: 150 },
      incompleteMessage: "Cilj nije preporučen: alat ga je ocenio kao prelak ili preambiciozan.",
      evaluation: { targetValue: 150, rating: "too_ambitious" },
    });
  });
});

describe("Practice Plan HTTP endpoint", () => {
  it("serves the separate route with validated evaluation, CORS, bounded body and sanitized logging", async () => {
    const sessions = new Map<string, GameSummary>();
    const model = new ScriptedFakeAgentModel(["valid-tool-proposal", "final"]);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    let createdSessionId = "";
    try {
      await withBackendServer({
        sessions,
        practicePlanModel: model,
        practicePlanProvider: "fake",
        practicePlanModelName: "scripted",
        allowedOrigins: new Set(["http://localhost:5173"]),
        practicePlanLimiter: () => true,
      }, async (baseUrl) => {
        const sessionResponse = await postJson(`${baseUrl}/api/game/session`, validStats);
        expect(sessionResponse.status).toBe(201);
        expect(sessionResponse.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
        const session = await sessionResponse.json() as { sessionId: string };
        createdSessionId = session.sessionId;

        const planResponse = await postJson(`${baseUrl}/api/ai/practice-plan`, {
          sessionId: session.sessionId,
          goal: "survive_longer",
        });
        const planBody = await planResponse.json() as Record<string, unknown>;
        expect(planResponse.status).toBe(200);
        expect(planBody).toMatchObject({ success: true, evaluation: { rating: "realistic" } });
        expect(planResponse.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");

        const rejectedOrigin = await postJson(`${baseUrl}/api/ai/practice-plan`, {
          sessionId: session.sessionId,
          goal: "survive_longer",
        }, "http://untrusted.example");
        expect(rejectedOrigin.status).toBe(403);

        const oversized = await fetch(`${baseUrl}/api/ai/practice-plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
          body: JSON.stringify({ data: "x".repeat(17 * 1024) }),
        });
        expect(oversized.status).toBe(400);
      });

      const logs = JSON.stringify(info.mock.calls);
      expect(createdSessionId).not.toBe("");
      expect(logs).not.toContain(createdSessionId);
      expect(logs).not.toContain('"foodCollected"');
      expect(logs).not.toContain('"score"');
      expect(logs).not.toContain("evaluate_practice_goal\n");
    } finally {
      info.mockRestore();
    }
  });

  it("enforces the 10-request client limiter and returns a safe 429 response", async () => {
    const model = new ScriptedFakeAgentModel(Array.from({ length: 10 }, () => "refusal" as const));
    const limiter = createRateLimiter(10, 60_000, () => 1_000);
    const sessions = new Map<string, GameSummary>([[sessionId, validStats]]);
    await withBackendServer({
      sessions,
      practicePlanModel: model,
      practicePlanProvider: "fake",
      practicePlanModelName: "scripted",
      allowedOrigins: new Set(["http://localhost:5173"]),
      practicePlanLimiter: limiter,
    }, async (baseUrl) => {
      for (let requestIndex = 0; requestIndex < 10; requestIndex += 1) {
        const response = await postJson(`${baseUrl}/api/ai/practice-plan`, {
          sessionId,
          goal: "survive_longer",
        });
        expect(response.status).toBe(502);
      }
      const limited = await postJson(`${baseUrl}/api/ai/practice-plan`, {
        sessionId,
        goal: "survive_longer",
      });
      expect(limited.status).toBe(429);
      expect(await limited.json()).toEqual({ success: false, message: "Plan trenutno nije moguće napraviti bezbedno. Pokušajte ponovo kasnije." });
    });
    expect(model.callCount).toBe(10);
  });

  it("returns a generic 503 when no server-side model is configured", async () => {
    const sessions = new Map<string, GameSummary>([[sessionId, validStats]]);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
    await withBackendServer({
      sessions,
      practicePlanModel: null,
      allowedOrigins: new Set(["http://localhost:5173"]),
      practicePlanLimiter: () => true,
    }, async (baseUrl) => {
      const response = await postJson(`${baseUrl}/api/ai/practice-plan`, {
        sessionId,
        goal: "survive_longer",
      });
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        success: false,
        message: "Plan trenutno nije moguće napraviti bezbedno. Pokušajte ponovo kasnije.",
      });
      });
      expect(JSON.stringify(info.mock.calls)).toContain("provider_unconfigured");
    } finally {
      info.mockRestore();
    }
  });

  it("returns a generic HTTP 502 and logs no provider secret on E16 failure", async () => {
    const secret = "provider-secret-e16-sentinel";
    const model = new ScriptedFakeAgentModel([
      () => {
        const error = new AgentModelError("provider_error", { httpStatus: 400 });
        error.message = `${secret}\nprivate provider stack`;
        throw error;
      },
    ]);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const sessions = new Map<string, GameSummary>();
    try {
      await withBackendServer({
        sessions,
        practicePlanModel: model,
        practicePlanProvider: "fake",
        practicePlanModelName: "scripted",
        allowedOrigins: new Set(["http://localhost:5173"]),
        practicePlanLimiter: () => true,
      }, async (baseUrl) => {
        const created = await postJson(`${baseUrl}/api/game/session`, validStats);
        const { sessionId: createdSessionId } = await created.json() as { sessionId: string };
        const response = await postJson(`${baseUrl}/api/ai/practice-plan`, {
          sessionId: createdSessionId,
          goal: "survive_longer",
        });
        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({
          success: false,
          message: "Plan trenutno nije moguće napraviti bezbedno. Pokušajte ponovo kasnije.",
        });
      });
      const logs = info.mock.calls.map(([, record]) => String(record)).join("\n");
      expect(logs).toContain('"providerHttpStatus":400');
      expect(logs).not.toContain(secret);
      expect(logs).not.toContain("private provider stack");
    } finally {
      info.mockRestore();
    }
  });

  it("catches run evidence serialization exceptions at the route boundary", async () => {
    const model = new ScriptedFakeAgentModel(["valid-tool-proposal", "final"]);
    const sessions = new Map<string, GameSummary>();
    await withBackendServer({
      sessions,
      practicePlanModel: model,
      practicePlanProvider: "fake",
      practicePlanModelName: "m".repeat(101),
      allowedOrigins: new Set(["http://localhost:5173"]),
      practicePlanLimiter: () => true,
    }, async (baseUrl) => {
      const created = await postJson(`${baseUrl}/api/game/session`, validStats);
      const { sessionId: createdSessionId } = await created.json() as { sessionId: string };
      const response = await postJson(`${baseUrl}/api/ai/practice-plan`, {
        sessionId: createdSessionId,
        goal: "survive_longer",
      });
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        success: false,
        message: "Plan trenutno nije moguće napraviti bezbedno. Pokušajte ponovo kasnije.",
      });
    });
  });

  it("propagates an HTTP client disconnect to the active model request", async () => {
    const model = new ScriptedFakeAgentModel(["timeout"]);
    const sessions = new Map<string, GameSummary>([[sessionId, validStats]]);
    await withBackendServer({
      sessions,
      practicePlanModel: model,
      practicePlanProvider: "fake",
      practicePlanModelName: "scripted",
      allowedOrigins: new Set(["http://localhost:5173"]),
      practicePlanLimiter: () => true,
    }, async (baseUrl) => {
      const controller = new AbortController();
      const pending = postJson(`${baseUrl}/api/ai/practice-plan`, {
        sessionId,
        goal: "survive_longer",
      }, "http://localhost:5173", controller.signal);
      setTimeout(() => controller.abort(), 10);
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
      await vi.waitFor(() => expect(model.abortCount).toBe(1), { timeout: 1_000 });
    });
  });
});
