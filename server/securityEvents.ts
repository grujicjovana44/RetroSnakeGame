import { z } from "zod";

export const securityEventNameSchema = z.enum([
  "request_allowed",
  "agent_decision_allowed",
  "tool_allowed",
  "execution_completed",
  "request_rejected",
  "body_rejected",
  "origin_rejected",
  "rate_limited",
  "concurrency_rejected",
  "agent_decision_rejected",
  "tool_rejected",
  "tool_result_rejected",
  "deadline_reached",
  "provider_failure",
  "unexpected_error",
]);

export const securityEventOutcomeSchema = z.enum(["allowed", "rejected", "failed", "completed"]);

export const securityReasonSchema = z.enum([
  "http_admitted",
  "invalid_json",
  "body_too_large",
  "origin_not_allowed",
  "invalid_input",
  "session_data_invalid",
  "goal_unavailable",
  "concurrency_limit",
  "provider_unconfigured",
  "provider_attempt",
  "tool_execution",
  "agent_completed",
  "agent_incomplete",
  "unknown_tool",
  "invalid_tool_args",
  "invalid_tool_result",
  "invalid_final_output",
  "repeated_call",
  "tool_limit",
  "tool_timeout",
  "tool_error",
  "tool_not_justified",
  "provider_attempt_limit",
  "max_steps",
  "model_refusal",
  "plan_incomplete",
  "cancelled",
  "provider_timeout",
  "deadline",
  "provider_error",
  "internal_error",
]);

export const securityEventSchema = z.object({
  timestamp: z.string().datetime(),
  correlationId: z.string().uuid(),
  event: securityEventNameSchema,
  outcome: securityEventOutcomeSchema,
  route: z.literal("/api/ai/practice-plan"),
  reason: securityReasonSchema,
  statusCode: z.number().int().min(100).max(599),
  providerAttemptCount: z.number().int().min(0).max(6),
  toolCallCount: z.number().int().min(0).max(2),
}).strict();

export type SecurityEvent = z.infer<typeof securityEventSchema>;
export type SecurityEventLog = SecurityEvent[];

export const MAX_SECURITY_EVENTS = 500;

export function recordSecurityEvent(
  log: SecurityEventLog,
  input: Omit<SecurityEvent, "timestamp"> & { timestamp?: string },
): SecurityEvent {
  const event = securityEventSchema.parse({
    timestamp: input.timestamp ?? new Date().toISOString(),
    ...input,
  });
  log.push(event);
  if (log.length > MAX_SECURITY_EVENTS) {
    log.splice(0, log.length - MAX_SECURITY_EVENTS);
  }
  return event;
}
