import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";

export type UsageStatus =
  | "success"
  | "timeout"
  | "provider_error"
  | "invalid_input"
  | "malformed_output"
  | "tool_error"
  | "rate_limited";

export type TokenUsage = {
  promptTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type UsageLogEntry = {
  operation: "ai.advice";
  phase?: "initial_tool_call" | "final_response";
  providerStatus?: number;
  provider: "gemini" | "fake";
  model: string;
  status: UsageStatus;
  attempts: number;
  latencyMs: number;
  timestamp?: string;
  tokenUsage?: TokenUsage;
  sessionId?: string;
};

export type UsageLog = UsageLogEntry[];
export type UsageDashboard = {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  averageLatencyMs: number;
  lastUpdatedAt: string | null;
  providers: string[];
  models: string[];
  tokenUsage: {
    measuredRequests: number;
    promptTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
};

export type UsageReport = {
  updatedAt: string;
  summary: UsageDashboard;
  records: Array<Omit<UsageLogEntry, "sessionId">>;
};

const MAX_USAGE_ENTRIES = 500;
const tokenUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
});
const persistedEntrySchema = z.object({
  operation: z.literal("ai.advice"),
  phase: z.enum(["initial_tool_call", "final_response"]).optional(),
  providerStatus: z.number().int().optional(),
  provider: z.enum(["gemini", "fake"]),
  model: z.string().min(1),
  status: z.enum([
    "success",
    "timeout",
    "provider_error",
    "invalid_input",
    "malformed_output",
    "tool_error",
    "rate_limited",
  ]),
  attempts: z.number().int().nonnegative(),
  latencyMs: z.number().nonnegative(),
  timestamp: z.string().datetime(),
  tokenUsage: tokenUsageSchema.optional(),
});
const persistedLogSchema = z.object({ records: z.array(persistedEntrySchema).max(MAX_USAGE_ENTRIES) });

export function recordUsage(log: UsageLog, entry: UsageLogEntry): void {
  log.push({ ...entry, timestamp: entry.timestamp ?? new Date().toISOString() });
  if (log.length > MAX_USAGE_ENTRIES) {
    log.splice(0, log.length - MAX_USAGE_ENTRIES);
  }
}

export function aggregateUsage(log: UsageLog): UsageDashboard {
  const measuredEntries = log.filter((entry) => entry.tokenUsage !== undefined);
  const sumTokenField = (field: keyof TokenUsage): number | null => {
    const values = measuredEntries
      .map((entry) => entry.tokenUsage?.[field])
      .filter((value): value is number => typeof value === "number");
    return values.length > 0 ? values.reduce((total, value) => total + value, 0) : null;
  };

  return {
    totalRequests: log.length,
    successCount: log.filter((entry) => entry.status === "success").length,
    failureCount: log.filter((entry) => entry.status !== "success").length,
    averageLatencyMs: log.length
      ? Math.round(log.reduce((total, entry) => total + entry.latencyMs, 0) / log.length)
      : 0,
    lastUpdatedAt: log[log.length - 1]?.timestamp ?? null,
    providers: [...new Set(log.map((entry) => entry.provider))],
    models: [...new Set(log.map((entry) => entry.model))],
    tokenUsage: {
      measuredRequests: measuredEntries.length,
      promptTokens: sumTokenField("promptTokens"),
      outputTokens: sumTokenField("outputTokens"),
      totalTokens: sumTokenField("totalTokens"),
    },
  };
}

export function createUsageReport(log: UsageLog, updatedAt = new Date().toISOString()): UsageReport {
  const records = log.map((entry) => {
    const persistedEntry = { ...entry };
    delete persistedEntry.sessionId;
    return persistedEntry;
  });

  return { updatedAt, summary: aggregateUsage(log), records };
}

export async function loadUsageLog(fileUrl: URL): Promise<UsageLog> {
  try {
    const file = await readFile(fileUrl, "utf8");
    const parsedJson: unknown = JSON.parse(file);
    const parsed = persistedLogSchema.safeParse(parsedJson);
    return parsed.success ? parsed.data.records : [];
  } catch (error) {
    if (isMissingFile(error)) return [];
    throw error;
  }
}

export async function persistUsageLog(fileUrl: URL, log: UsageLog): Promise<void> {
  const report = createUsageReport(log);
  await writeFile(fileUrl, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
