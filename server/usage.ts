export type UsageStatus =
  | "success"
  | "timeout"
  | "provider_error"
  | "invalid_input"
  | "malformed_output"
  | "tool_error";

export type UsageLogEntry = {
  operation: "ai.advice";
  phase?: "initial_tool_call" | "final_response";
  providerStatus?: number;
  provider: "gemini" | "fake";
  model: string;
  status: UsageStatus;
  attempts: number;
  latencyMs: number;
  sessionId?: string;
};

export type UsageLog = UsageLogEntry[];

export function recordUsage(log: UsageLog, entry: UsageLogEntry): void {
  log.push({ ...entry });
}
