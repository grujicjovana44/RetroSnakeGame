import { parseGameSummary, type GameSummary } from "./api";
import {
  PRACTICE_EVIDENCE_FIELDS,
  evaluatePracticeGoalInputSchema,
  practiceEvaluationSchema,
  type AgentStopReason,
  type EvaluatePracticeGoalInput,
  type PracticeEvaluation,
  type PracticeGoal,
} from "./agentContracts";

const MAX_PRACTICE_RESULT_BYTES = 4_096;
const MAX_SURVIVAL_TARGET = 86_400;
const MAX_FOOD_TARGET = 10_000;

export type PracticeTargetRange = {
  baseline: number;
  min: number;
  max: number;
  available: boolean;
};

export type PracticeToolFailureCode =
  | "invalid_tool_args"
  | "forbidden"
  | "session_data_invalid"
  | "invalid_tool_result"
  | "tool_limit"
  | "tool_error"
  | "tool_timeout";

export const PRACTICE_TOOL_FAILURE_STOP_REASON = {
  invalid_tool_args: "invalid_tool_args",
  forbidden: "unauthorized",
  session_data_invalid: "session_data_invalid",
  invalid_tool_result: "invalid_tool_result",
  tool_limit: "tool_limit",
  tool_error: "tool_error",
  tool_timeout: "tool_timeout",
} as const satisfies Record<PracticeToolFailureCode, AgentStopReason>;

export type PracticeToolResult =
  | { success: true; evaluation: PracticeEvaluation }
  | { success: false; code: PracticeToolFailureCode };

export type PracticeToolContext = {
  requestSessionId: string;
  selectedGoal: PracticeGoal;
  sessions: ReadonlyMap<string, unknown>;
};

export type AgentToolExecutor = (
  input: unknown,
  context: PracticeToolContext,
) => unknown | Promise<unknown>;

export type AgentToolDispatchResult =
  | { executed: true; value: unknown }
  | { executed: false; code: "tool_limit" };

export function createAgentToolDispatcher(
  executor: AgentToolExecutor = evaluatePracticeGoal,
  initialToolCallCount = 0,
  maxToolCalls = 2,
) {
  let toolCallCount = Math.max(0, Math.floor(initialToolCallCount));
  return {
    get toolCallCount(): number {
      return toolCallCount;
    },
    async dispatch(
      input: unknown,
      context: PracticeToolContext,
    ): Promise<AgentToolDispatchResult> {
      if (toolCallCount >= maxToolCalls) {
        return { executed: false, code: "tool_limit" };
      }
      toolCallCount += 1;
      return { executed: true, value: await executor(input, context) };
    },
  };
}

export function getPracticeTargetRange(
  goal: PracticeGoal,
  stats: Pick<GameSummary, "durationSeconds" | "foodCollected">,
): PracticeTargetRange {
  const baseline = goal === "survive_longer"
    ? Math.round(stats.durationSeconds)
    : stats.foodCollected;
  const maximum = goal === "survive_longer" ? MAX_SURVIVAL_TARGET : MAX_FOOD_TARGET;
  const max = Math.min(
    maximum,
    baseline + Math.max(3, Math.ceil(2 * Math.max(baseline, 1))),
  );

  return { baseline, min: baseline, max, available: max > baseline };
}

export function evaluatePracticeGoal(
  input: unknown,
  context: PracticeToolContext,
): PracticeToolResult {
  const parsedInput = evaluatePracticeGoalInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return { success: false, code: "invalid_tool_args" };
  }

  const args: EvaluatePracticeGoalInput = parsedInput.data;
  if (args.sessionId !== context.requestSessionId) {
    return { success: false, code: "forbidden" };
  }
  if (args.goal !== context.selectedGoal) {
    return { success: false, code: "invalid_tool_args" };
  }

  const sessionData = context.sessions.get(context.requestSessionId);
  const stats = parseGameSummary(sessionData);
  if (!stats) {
    return { success: false, code: "session_data_invalid" };
  }

  const range = getPracticeTargetRange(args.goal, stats);
  if (!range.available) {
    return { success: false, code: "invalid_tool_args" };
  }
  if (args.targetValue < range.min || args.targetValue > range.max) {
    return { success: false, code: "invalid_tool_args" };
  }

  const validatedEvaluation = validatePracticeEvaluation(
    buildPracticeEvaluation(args, stats, range),
    args,
    stats,
  );
  if (!validatedEvaluation) {
    return { success: false, code: "invalid_tool_result" };
  }

  return { success: true, evaluation: validatedEvaluation };
}

export function validatePracticeEvaluation(
  output: unknown,
  input: unknown,
  sessionData: unknown,
): PracticeEvaluation | null {
  const parsedInput = evaluatePracticeGoalInputSchema.safeParse(input);
  const parsedStats = parseGameSummary(sessionData);
  const parsedOutput = practiceEvaluationSchema.safeParse(output);
  if (!parsedInput.success || !parsedStats || !parsedOutput.success) {
    return null;
  }

  const range = getPracticeTargetRange(parsedInput.data.goal, parsedStats);
  if (!range.available ||
      parsedInput.data.targetValue < range.min ||
      parsedInput.data.targetValue > range.max) {
    return null;
  }

  const expected = practiceEvaluationSchema.safeParse(
    buildPracticeEvaluation(parsedInput.data, parsedStats, range),
  );
  if (!expected.success || JSON.stringify(expected.data) !== JSON.stringify(parsedOutput.data)) {
    return null;
  }

  const resultBytes = new TextEncoder().encode(JSON.stringify(parsedOutput.data)).byteLength;
  return resultBytes <= MAX_PRACTICE_RESULT_BYTES ? parsedOutput.data : null;
}

function buildPracticeEvaluation(
  args: EvaluatePracticeGoalInput,
  stats: GameSummary,
  range: PracticeTargetRange,
): unknown {
  const delta = args.targetValue - range.baseline;
  const rating = delta <= 0
    ? "too_easy"
    : 2 * delta <= Math.max(4, range.baseline + (range.baseline % 2))
      ? "realistic"
      : "too_ambitious";
  const foodPerMinute = stats.durationSeconds > 0
    ? roundFiniteDerivedMetric(stats.foodCollected / (stats.durationSeconds / 60))
    : null;
  const scorePerFood = stats.foodCollected > 0
    ? roundFiniteDerivedMetric(stats.score / stats.foodCollected)
    : null;
  const targetRatio = roundToTwo(args.targetValue / Math.max(range.baseline, 1));

  return {
    tool: "evaluate_practice_goal",
    goal: args.goal,
    targetValue: args.targetValue,
    goalBaseline: range.baseline,
    rating,
    metrics: {
      score: stats.score,
      durationSeconds: stats.durationSeconds,
      foodCollected: stats.foodCollected,
      foodPerMinute,
      scorePerFood,
      targetRatio,
    },
    evidence: [
      { field: PRACTICE_EVIDENCE_FIELDS[0], value: args.goal },
      { field: PRACTICE_EVIDENCE_FIELDS[1], value: args.targetValue },
      { field: PRACTICE_EVIDENCE_FIELDS[2], value: rating },
      { field: PRACTICE_EVIDENCE_FIELDS[3], value: targetRatio },
      { field: PRACTICE_EVIDENCE_FIELDS[4], value: range.baseline },
      { field: PRACTICE_EVIDENCE_FIELDS[5], value: stats.score },
      { field: PRACTICE_EVIDENCE_FIELDS[6], value: stats.durationSeconds },
      { field: PRACTICE_EVIDENCE_FIELDS[7], value: stats.foodCollected },
      { field: PRACTICE_EVIDENCE_FIELDS[8], value: foodPerMinute },
      { field: PRACTICE_EVIDENCE_FIELDS[9], value: scorePerFood },
    ],
  };
}

function roundToTwo(value: number): number {
  return Number(value.toFixed(2));
}

function roundFiniteDerivedMetric(value: number): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  const rounded = roundToTwo(value);
  return Number.isFinite(rounded) ? rounded : null;
}