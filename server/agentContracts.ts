import { z } from "zod";

export const PRACTICE_GOALS = ["survive_longer", "collect_more_food"] as const;
export const practiceGoalSchema = z.enum(PRACTICE_GOALS);
export type PracticeGoal = z.infer<typeof practiceGoalSchema>;

export const practicePlanRequestSchema = z.object({
  sessionId: z.string().uuid(),
  goal: practiceGoalSchema,
}).strict();
export type PracticePlanRequest = z.infer<typeof practicePlanRequestSchema>;

export const practiceToolArgumentsSchema = z.object({
  goal: practiceGoalSchema,
  targetValue: z.number().finite().int().min(0).max(86_400),
}).strict();
export type PracticeToolArguments = z.infer<typeof practiceToolArgumentsSchema>;

export const evaluatePracticeGoalInputSchema = z.object({
  sessionId: z.string().uuid(),
  goal: practiceGoalSchema,
  targetValue: z.number().finite().int().min(0).max(86_400),
}).strict();
export type EvaluatePracticeGoalInput = z.infer<typeof evaluatePracticeGoalInputSchema>;

export const PRACTICE_EVIDENCE_FIELDS = [
  "candidate.goal",
  "candidate.targetValue",
  "evaluation.rating",
  "evaluation.targetRatio",
  "goal.baseline",
  "session.score",
  "session.durationSeconds",
  "session.foodCollected",
  "evaluation.foodPerMinute",
  "evaluation.scorePerFood",
] as const;

export const practiceEvidenceFieldSchema = z.enum(PRACTICE_EVIDENCE_FIELDS);
export type PracticeEvidenceField = z.infer<typeof practiceEvidenceFieldSchema>;

const evidenceValueSchema = z.union([
  z.string().max(500),
  z.number().finite(),
  z.null(),
]);

export const practiceEvaluationSchema = z.object({
  tool: z.literal("evaluate_practice_goal"),
  goal: practiceGoalSchema,
  targetValue: z.number().finite().int().min(0).max(86_400),
  goalBaseline: z.number().finite().int().min(0).max(86_400),
  rating: z.enum(["too_easy", "realistic", "too_ambitious"]),
  metrics: z.object({
    score: z.number().finite().int().min(0).max(1_000_000),
    durationSeconds: z.number().finite().min(0).max(86_400),
    foodCollected: z.number().finite().int().min(0).max(10_000),
    foodPerMinute: z.number().finite().nonnegative().nullable(),
    scorePerFood: z.number().finite().nonnegative().nullable(),
    targetRatio: z.number().finite().nonnegative(),
  }).strict(),
  evidence: z.array(z.object({
    field: practiceEvidenceFieldSchema,
    value: evidenceValueSchema,
  }).strict()).max(PRACTICE_EVIDENCE_FIELDS.length),
}).strict();
export type PracticeEvaluation = z.infer<typeof practiceEvaluationSchema>;

export const practicePlanEvidenceSchema = z.object({
  source: z.literal("evaluate_practice_goal"),
  field: practiceEvidenceFieldSchema,
  value: evidenceValueSchema,
  finding: z.string().min(1).max(300),
}).strict();

export const practicePlanFinalSchema = z.object({
  goal: practiceGoalSchema,
  targetValue: z.number().finite().int().min(0).max(86_400),
  summary: z.string().min(1).max(500),
  recommendation: z.string().min(1).max(500),
  evidence: z.array(practicePlanEvidenceSchema).max(5),
  confidence: z.enum(["low", "medium", "high"]),
  completed: z.boolean(),
}).strict();
export type PracticePlanFinal = z.infer<typeof practicePlanFinalSchema>;

const modelToolRequestSchema = z.object({
  kind: z.literal("tool_request"),
  toolName: z.string().min(1).max(100),
  arguments: z.unknown().refine((value) => value !== undefined),
}).strict();

const modelFinalDecisionSchema = z.object({
  kind: z.literal("final"),
  plan: practicePlanFinalSchema,
}).strict();

const modelRefusalSchema = z.object({
  kind: z.literal("refusal"),
  reasonCode: z.literal("insufficient_evidence"),
}).strict();

export const agentModelDecisionSchema = z.discriminatedUnion("kind", [
  modelToolRequestSchema,
  modelFinalDecisionSchema,
  modelRefusalSchema,
]);
export type AgentModelDecision = z.infer<typeof agentModelDecisionSchema>;

export const INCOMPLETE_STATUS_MESSAGES = [
  "Cilj je ocenjen kao realističan, ali plan nije dovršen. Možeš koristiti prikazani cilj za sledeću partiju.",
  "Cilj nije preporučen: alat ga je ocenio kao prelak ili preambiciozan.",
] as const;
export const incompleteStatusMessageSchema = z.enum(INCOMPLETE_STATUS_MESSAGES);

export const practicePlanPreflightIncompleteSchema = z.object({
  goal: practiceGoalSchema,
  targetValue: z.null(),
  summary: z.literal("Za izabrani cilj trenutno nema višeg dostižnog praga."),
  recommendation: z.literal("Odigrati novu partiju ili izabrati drugi cilj."),
  evidence: z.array(z.never()).length(0),
  confidence: z.literal("low"),
  completed: z.literal(false),
}).strict();
export type PracticePlanPreflightIncomplete = z.infer<typeof practicePlanPreflightIncompleteSchema>;

const completedPracticePlanResponseSchema = z.object({
  success: z.literal(true),
  plan: practicePlanFinalSchema.extend({ completed: z.literal(true) }),
  evaluation: practiceEvaluationSchema,
}).strict();

const partialPracticePlanResponseSchema = z.object({
  success: z.literal(true),
  plan: practicePlanFinalSchema.extend({ completed: z.literal(false) }),
  evaluation: practiceEvaluationSchema,
  incompleteMessage: incompleteStatusMessageSchema,
}).strict();

const unavailablePracticePlanResponseSchema = z.object({
  success: z.literal(true),
  plan: practicePlanPreflightIncompleteSchema,
  evaluation: z.null(),
}).strict();

const failedPracticePlanResponseSchema = z.object({
  success: z.literal(false),
  message: z.string().min(1).max(200),
}).strict();

export const practicePlanApiResponseSchema = z.union([
  completedPracticePlanResponseSchema,
  partialPracticePlanResponseSchema,
  unavailablePracticePlanResponseSchema,
  failedPracticePlanResponseSchema,
]);
export type PracticePlanApiResponse = z.infer<typeof practicePlanApiResponseSchema>;

export const agentStopReasonSchema = z.enum([
  "invalid_input",
  "unauthorized",
  "session_data_invalid",
  "request_rate_limited",
  "unknown_tool",
  "invalid_tool_args",
  "tool_not_justified",
  "tool_timeout",
  "tool_error",
  "invalid_tool_result",
  "provider_timeout",
  "provider_unavailable",
  "provider_auth_or_quota",
  "provider_error",
  "provider_unconfigured",
  "rate_limit",
  "provider_attempt_limit",
  "malformed_model_output",
  "invalid_model_proposal",
  "invalid_final_output",
  "repeated_call",
  "max_steps",
  "tool_limit",
  "deadline",
  "cancelled",
  "goal_completed",
  "plan_incomplete",
  "goal_unavailable",
  "model_refusal",
]);
export type AgentStopReason = z.infer<typeof agentStopReasonSchema>;

export const agentStepStatusSchema = z.enum([
  "started",
  "success",
  "incomplete",
  "rejected",
  "failed",
  "cancelled",
]);

export const agentProposalStatusSchema = z.enum([
  "not_applicable",
  "accepted",
  "rejected",
]);

export const agentValidationOutcomeSchema = z.enum([
  "not_checked",
  "valid",
  "invalid",
  "tool_result_valid",
  "tool_result_invalid",
  "final_valid",
  "final_invalid",
]);

export const agentStepEvidenceSchema = z.object({
  stepNumber: z.number().int().min(1).max(3),
  provider: z.enum(["gemini", "fake"]),
  model: z.string().min(1).max(100),
  latencyMs: z.number().finite().nonnegative(),
  decisionKind: z.enum(["tool_request", "final", "refusal"]).nullable(),
  status: agentStepStatusSchema,
  proposalStatus: agentProposalStatusSchema,
  toolName: z.string().min(1).max(100).nullable(),
  validationOutcome: agentValidationOutcomeSchema,
  providerAttemptCount: z.number().int().min(0).max(6),
}).strict();
export type AgentStepEvidence = z.infer<typeof agentStepEvidenceSchema>;

export const agentRunEvidenceSchema = z.object({
  runId: z.string().uuid(),
  status: z.enum(["running", "completed", "incomplete", "failed", "cancelled"]),
  providerHttpStatus: z.number().int().min(100).max(599).nullable(),
  providerAttemptCount: z.number().int().min(0).max(6),
  retryCount: z.number().int().min(0).max(3),
  toolCallCount: z.number().int().min(0).max(2),
  stopReason: agentStopReasonSchema.nullable(),
  elapsedMs: z.number().finite().nonnegative(),
  steps: z.array(agentStepEvidenceSchema).max(3),
}).strict();
export type AgentRunEvidence = z.infer<typeof agentRunEvidenceSchema>;