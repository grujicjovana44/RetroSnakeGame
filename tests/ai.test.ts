import { describe, expect, it } from "vitest";
import { createSession, requestAdvice, type SessionStore } from "../server/service";
import {
  FakeAdviceProvider,
  GeminiProviderError,
  parseGeminiModelChain,
  parseFinalAdviceText,
  parseRetryAfterMs,
  type AdviceProvider,
} from "../server/provider";
import type { AdviceResponse } from "../server/api";
import { aggregateUsage, createUsageReport, recordUsage, type UsageLog } from "../server/usage";
import { createRateLimiter, isAllowedOrigin, parseAllowedOrigins } from "../server/httpSecurity";

type TestSession = {
  score: number;
  durationSeconds: number;
  collisions: number;
  foodCollected: number;
};

const validStats: TestSession = {
  score: 120,
  durationSeconds: 45,
  collisions: 1,
  foodCollected: 12,
};
const modelChain = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
];
const validAdvice: AdviceResponse = {
  summary: "Valid summary",
  recommendation: "Valid recommendation",
  category: "general",
};
const inertProvider: AdviceProvider = {
  generateAdvice: async () => validAdvice,
};

function createTestSession(): { sessionId: string; sessions: SessionStore } {
  const sessions: SessionStore = new Map();
  const result = createSession(validStats, sessions);
  const body = result.body as { sessionId: string };
  return { sessionId: body.sessionId, sessions };
}

describe("AI Advice backend", () => {
  it("parses Retry-After seconds and HTTP-date values", () => {
    expect(parseRetryAfterMs("2", 1_000)).toBe(2_000);
    expect(parseRetryAfterMs(new Date(4_000).toUTCString(), 1_000)).toBe(3_000);
    expect(parseRetryAfterMs("not-a-date", 1_000)).toBeUndefined();
    expect(parseRetryAfterMs(null, 1_000)).toBeUndefined();
  });

  it("honors provider Retry-After for a same-model 429 retry", async () => {
    const { sessionId, sessions } = createTestSession();
    const calls: string[] = [];
    const delays: number[] = [];
    const result = await requestAdvice({ sessionId }, {
      provider: inertProvider,
      providerForModel: createScriptedModelProvider({
        "gemini-3.6-flash": [
          new GeminiProviderError("provider-unavailable", "final_response", 429, undefined, 1_200),
          validAdvice,
        ],
      }, calls),
      modelChain: ["gemini-3.6-flash"],
      sessions,
      timeoutMs: 5_000,
      sleep: async (milliseconds) => { delays.push(milliseconds); },
    });

    expect(result.statusCode).toBe(200);
    expect(result.attempts).toBe(2);
    expect(result.fallbackUsed).toBe(false);
    expect(calls).toEqual(["gemini-3.6-flash", "gemini-3.6-flash"]);
    expect(delays).toEqual([1_200]);
  });

  it("does not retry or fall back when Retry-After exceeds the deadline", async () => {
    const { sessionId, sessions } = createTestSession();
    const calls: string[] = [];
    const delays: number[] = [];
    const usageLog: UsageLog = [];
    const result = await requestAdvice({ sessionId }, {
      provider: inertProvider,
      providerForModel: createScriptedModelProvider({
        "gemini-3.6-flash": [
          new GeminiProviderError("provider-unavailable", "initial_tool_call", 429, undefined, 5_000),
        ],
      }, calls),
      modelChain: ["gemini-3.6-flash", "gemini-3.5-flash"],
      sessions,
      usageLog,
      timeoutMs: 200,
      sleep: async (milliseconds) => { delays.push(milliseconds); },
    });

    expect(result.statusCode).toBe(502);
    expect(result.attempts).toBe(1);
    expect(result.fallbackUsed).toBe(false);
    expect(calls).toEqual(["gemini-3.6-flash"]);
    expect(delays).toEqual([]);
    expect(usageLog[0].status).toBe("rate_limited");
  });

  it("classifies malformed final output without exposing its contents", () => {
    const rawModelText = "not-json private model content";

    try {
      parseFinalAdviceText(rawModelText);
      throw new Error("Expected invalid JSON to be rejected.");
    } catch (error) {
      expect(error).toBeInstanceOf(GeminiProviderError);
      expect(error).toMatchObject({
        message: "malformed-output",
        failureReason: "invalid-json",
      });
      expect((error as Error).message).not.toContain(rawModelText);
    }

    expect(() => parseFinalAdviceText(JSON.stringify({
      summary: "A summary",
      recommendation: "A recommendation",
      category: "private-category",
    }))).toThrowError(expect.objectContaining({
      message: "malformed-output",
      failureReason: "schema-mismatch",
    }));

    expect(() => parseFinalAdviceText("  \n  ")).toThrowError(expect.objectContaining({
      message: "malformed-output",
      failureReason: "empty-output",
    }));
  });

  it("rejects code fences and prose outside the advice JSON", () => {
    const json = JSON.stringify(validAdvice);

    expect(parseFinalAdviceText(json)).toEqual(validAdvice);
    expect(() => parseFinalAdviceText(`\`\`\`JSON\n${json}\n\`\`\``)).toThrowError(
      expect.objectContaining({ message: "malformed-output", failureReason: "invalid-json" }),
    );
    expect(() => parseFinalAdviceText(`Here is the result:\n${json}\nDone.`)).toThrowError(
      expect.objectContaining({ message: "malformed-output", failureReason: "invalid-json" }),
    );
  });

  it("records only the sanitized malformed-output reason in attempt telemetry", async () => {
    const { sessionId, sessions } = createTestSession();
    const usageLog: UsageLog = [];
    const rawModelText = "not-json private model content";
    const provider: AdviceProvider = {
      generateAdvice: async () => parseFinalAdviceText(rawModelText),
    };

    await requestAdvice({ sessionId }, { provider, sessions, usageLog });

    expect(usageLog[0].providerAttempts?.[0]).toMatchObject({
      status: "malformed_output",
      failureReason: "invalid-json",
    });
    expect(JSON.stringify(usageLog[0])).not.toContain(rawModelText);
  });

  it("records empty final output separately from invalid JSON", async () => {
    const { sessionId, sessions } = createTestSession();
    const usageLog: UsageLog = [];
    const provider: AdviceProvider = {
      generateAdvice: async () => parseFinalAdviceText(""),
    };

    await requestAdvice({ sessionId }, { provider, sessions, usageLog });

    expect(usageLog[0].providerAttempts?.[0]).toMatchObject({
      status: "malformed_output",
      failureReason: "empty-output",
    });
  });

  it("parses only the ordered backend model allowlist", () => {
    expect(parseGeminiModelChain()).toEqual(modelChain);
    expect(parseGeminiModelChain("gemini-3.8-flash, gemini-3.6-flash")).toEqual([
      "gemini-3.8-flash",
      "gemini-3.6-flash",
    ]);
    expect(() => parseGeminiModelChain("gemini-unknown-flash")).toThrow();
    expect(() => parseGeminiModelChain("gemini-3.7-flash,gemini-3.8-flash")).toThrow();
  });

  it("A1 returns structured advice after the fake tool-call round-trip", async () => {
    const { sessionId, sessions } = createTestSession();
    const provider = new FakeAdviceProvider();
    const usageLog: UsageLog = [];
    const options = {
      provider,
      sessions,
      usageLog,
      adviceCache: new Map<string, AdviceResponse>(),
      inFlightAdvice: new Map(),
    };

    const result = await requestAdvice(
      { sessionId },
      options,
    );

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      success: true,
      advice: { category: "strategy" },
    });
    expect(provider.callCount).toBe(1);
    expect(usageLog[0].tokenUsage).toEqual({
      promptTokens: 55,
      outputTokens: 21,
      totalTokens: 76,
    });

    const cachedResult = await requestAdvice({ sessionId }, options);
    expect(cachedResult.body).toEqual(result.body);
    expect(cachedResult.attempts).toBe(0);
    expect(provider.callCount).toBe(1);
  });

  it("A2 rejects invalid local input before calling the provider", async () => {
    const provider = new FakeAdviceProvider();
    const sessions: SessionStore = new Map();

    const result = await requestAdvice(
      { sessionId: "not-a-session" },
      { provider, sessions },
    );

    expect(result.statusCode).toBe(400);
    expect(result.body).toMatchObject({ success: false });
    expect(provider.callCount).toBe(0);
  });

  it("A3 retries transient provider failure at most once", async () => {
    const { sessionId, sessions } = createTestSession();
    const provider = new FakeAdviceProvider("provider-error");

    const result = await requestAdvice(
      { sessionId },
      { provider, sessions, sleep: async () => undefined },
    );

    expect(result.statusCode).toBe(502);
    expect(result.attempts).toBe(2);
    expect(provider.callCount).toBe(2);
    expect(result.body).toEqual({
      success: false,
      message: "AI savet trenutno nije dostupan. Pokusajte ponovo kasnije.",
    });
  });

  it("retries a transient failure and returns the successful second result", async () => {
    const { sessionId, sessions } = createTestSession();
    const provider = new FakeAdviceProvider("transient-once");

    const result = await requestAdvice(
      { sessionId },
      { provider, sessions, sleep: async () => undefined },
    );

    expect(result.statusCode).toBe(200);
    expect(result.attempts).toBe(2);
    expect(provider.callCount).toBe(2);
  });

  it("falls back from 3.8 to 3.7 after bounded transient retries", async () => {
    const { sessionId, sessions } = createTestSession();
    const calls: string[] = [];
    const usageLog: UsageLog = [];
    const result = await requestAdvice({ sessionId }, {
      provider: inertProvider,
      providerForModel: createScriptedModelProvider({
        "gemini-3.8-flash": [unavailableError(), unavailableError()],
        "gemini-3.7-flash": [validAdvice],
      }, calls),
      modelChain,
      modelName: modelChain[0],
      sessions,
      usageLog,
      sleep: async () => undefined,
    });

    expect(result.body).toMatchObject({ success: true, advice: validAdvice });
    expect(result.attempts).toBe(3);
    expect(result.fallbackUsed).toBe(true);
    expect(calls).toEqual(["gemini-3.8-flash", "gemini-3.8-flash", "gemini-3.7-flash"]);
    expect(usageLog[0].providerAttempts?.map((attempt) => attempt.attemptKind)).toEqual([
      "initial",
      "retry",
      "fallback",
    ]);
    expect(usageLog[0].fallbackUsed).toBe(true);
  });

  it("skips a retry that would consume the next model's reserved window", async () => {
    const { sessionId, sessions } = createTestSession();
    const calls: string[] = [];
    const usageLog: UsageLog = [];
    const providerForModel = (model: string): AdviceProvider => ({
      generateAdvice: async () => {
        calls.push(model);
        if (model === "gemini-3.8-flash") {
          return new Promise<never>(() => undefined);
        }
        return validAdvice;
      },
    });

    const result = await requestAdvice({ sessionId }, {
      provider: inertProvider,
      providerForModel,
      modelChain: modelChain.slice(0, 2),
      sessions,
      usageLog,
      timeoutMs: 2_000,
      sleep: async () => undefined,
    });

    expect(result.statusCode).toBe(200);
    expect(result.attempts).toBe(2);
    expect(result.fallbackUsed).toBe(true);
    expect(calls).toEqual([
      "gemini-3.8-flash",
      "gemini-3.7-flash",
    ]);
    expect(usageLog[0].providerAttempts?.map((attempt) => attempt.model)).toEqual([
      "gemini-3.8-flash",
      "gemini-3.7-flash",
    ]);
  });

  it("falls back through 3.7 to 3.6 when both higher models stay unavailable", async () => {
    const { sessionId, sessions } = createTestSession();
    const calls: string[] = [];
    const result = await requestAdvice({ sessionId }, {
      provider: inertProvider,
      providerForModel: createScriptedModelProvider({
        "gemini-3.8-flash": [unavailableError(), unavailableError()],
        "gemini-3.7-flash": [unavailableError(), unavailableError()],
        "gemini-3.6-flash": [validAdvice],
      }, calls),
      modelChain,
      sessions,
      sleep: async () => undefined,
    });

    expect(result.statusCode).toBe(200);
    expect(result.attempts).toBe(5);
    expect(result.fallbackUsed).toBe(true);
    expect(calls).toEqual([
      "gemini-3.8-flash",
      "gemini-3.8-flash",
      "gemini-3.7-flash",
      "gemini-3.7-flash",
      "gemini-3.6-flash",
    ]);
  });

  it("returns a safe error with sanitized attempt telemetry when the chain is exhausted", async () => {
    const { sessionId, sessions } = createTestSession();
    const usageLog: UsageLog = [];
    const scripts = Object.fromEntries(modelChain.map((model) => [
      model,
      [unavailableError(), unavailableError()],
    ]));
    const result = await requestAdvice({ sessionId }, {
      provider: inertProvider,
      providerForModel: createScriptedModelProvider(scripts, []),
      modelChain,
      sessions,
      usageLog,
      sleep: async () => undefined,
    });

    expect(result.statusCode).toBe(502);
    expect(result.attempts).toBe(8);
    expect(result.fallbackUsed).toBe(true);
    expect(result.body).toEqual({ success: false, message: "AI savet trenutno nije dostupan. Pokusajte ponovo kasnije." });
    expect(usageLog[0].providerAttempts).toHaveLength(8);
    expect(JSON.stringify(usageLog[0])).not.toContain(sessionId);
    expect(JSON.stringify(usageLog[0])).not.toContain("stack");
  });

  it.each([
    ["authentication", new GeminiProviderError("provider-error", "initial_tool_call", 401), 1],
    ["quota", new GeminiProviderError("provider-unavailable", "initial_tool_call", 429), 2],
    ["invalid request", new GeminiProviderError("provider-unavailable", "initial_tool_call", 400), 1],
    ["policy rejection", new GeminiProviderError("provider-error", "initial_tool_call", 403), 1],
  ])("does not fall back for %s failures", async (_label, failure, expectedCalls) => {
    const { sessionId, sessions } = createTestSession();
    const calls: string[] = [];
    const result = await requestAdvice({ sessionId }, {
      provider: inertProvider,
      providerForModel: createScriptedModelProvider({
        "gemini-3.8-flash": [failure, failure],
        "gemini-3.7-flash": [validAdvice],
      }, calls),
      modelChain,
      sessions,
      sleep: async () => undefined,
    });

    expect(result.statusCode).toBe(502);
    expect(result.fallbackUsed).toBe(false);
    expect(calls).toEqual(Array(expectedCalls).fill("gemini-3.8-flash"));
  });

  it("does not fall back for malformed output or tool-session mismatch", async () => {
    for (const mode of ["malformed", "mismatch"] as const) {
      const { sessionId, sessions } = createTestSession();
      const provider = new FakeAdviceProvider(mode);
      const result = await requestAdvice({ sessionId }, {
        provider,
        modelChain,
        sessions,
      });

      expect(result.statusCode).toBe(502);
      expect(result.attempts).toBe(1);
      expect(result.fallbackUsed).toBe(false);
      expect(provider.callCount).toBe(1);
    }
  });

  it("aborts both provider attempts within the overall timeout budget", async () => {
    const { sessionId, sessions } = createTestSession();
    const provider = new FakeAdviceProvider("timeout");
    const usageLog: UsageLog = [];
    const startedAt = Date.now();

    const result = await requestAdvice(
      { sessionId },
      { provider, sessions, timeoutMs: 80, usageLog },
    );

    expect(result.statusCode).toBe(502);
    expect(result.attempts).toBe(2);
    expect(provider.abortCount).toBe(2);
    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(usageLog[0].status).toBe("timeout");
  });

  it("records the latest provider phase when the local timeout fires", async () => {
    const { sessionId, sessions } = createTestSession();
    const usageLog: UsageLog = [];
    const provider: AdviceProvider = {
      generateAdvice: async (_sessionId, _getStats, _signal, _recordTokenUsage, recordPhase) => {
        recordPhase?.("final_response");
        return new Promise<never>(() => undefined);
      },
    };

    await requestAdvice({ sessionId }, {
      provider,
      sessions,
      timeoutMs: 80,
      sleep: async () => undefined,
      usageLog,
    });

    expect(usageLog[0].status).toBe("timeout");
    expect(usageLog[0].providerAttempts?.length).toBeGreaterThan(0);
    expect(usageLog[0].providerAttempts?.every((attempt) => attempt.phase === "final_response")).toBe(true);
    expect(usageLog[0].phase).toBe("final_response");
  });

  it("A4 rejects malformed provider output", async () => {
    const { sessionId, sessions } = createTestSession();
    const provider = new FakeAdviceProvider("malformed");
    const usageLog: UsageLog = [];

    const result = await requestAdvice(
      { sessionId },
      { provider, sessions, usageLog },
    );

    expect(result.statusCode).toBe(502);
    expect(result.body).toEqual({
      success: false,
      message: "AI savet trenutno nije dostupan. Pokusajte ponovo kasnije.",
    });
    expect(provider.callCount).toBe(1);
    expect(usageLog[0].status).toBe("malformed_output");
  });

  it("coalesces simultaneous advice requests for the same session", async () => {
    const { sessionId, sessions } = createTestSession();
    let providerCallCount = 0;
    let resolveProvider: ((value: unknown) => void) | undefined;
    const provider: AdviceProvider = {
      generateAdvice: async () => {
        providerCallCount += 1;
        return new Promise((resolve) => {
          resolveProvider = resolve;
        });
      },
    };
    const options = {
      provider,
      sessions,
      adviceCache: new Map<string, AdviceResponse>(),
      inFlightAdvice: new Map(),
    };

    const first = requestAdvice({ sessionId }, options);
    const second = requestAdvice({ sessionId }, options);
    expect(providerCallCount).toBe(1);
    resolveProvider?.({
      summary: "Valid summary",
      recommendation: "Valid recommendation",
      category: "general",
    });

    const results = await Promise.all([first, second]);
    expect(results[0].body).toEqual(results[1].body);
    expect(providerCallCount).toBe(1);
  });

  it("keeps a shared provider call alive while another client is still waiting", async () => {
    const { sessionId, sessions } = createTestSession();
    let providerSignal: AbortSignal | undefined;
    let resolveProvider: ((value: unknown) => void) | undefined;
    const provider: AdviceProvider = {
      generateAdvice: async (_sessionId, _getStats, signal) => {
        providerSignal = signal;
        return new Promise((resolve) => {
          resolveProvider = resolve;
        });
      },
    };
    const firstClient = new AbortController();
    const secondClient = new AbortController();
    const options = {
      provider,
      sessions,
      inFlightAdvice: new Map(),
    };

    const firstRequest = requestAdvice({ sessionId }, { ...options, signal: firstClient.signal });
    const secondRequest = requestAdvice({ sessionId }, { ...options, signal: secondClient.signal });
    firstClient.abort();

    expect((await firstRequest).statusCode).toBe(499);
    expect(providerSignal?.aborted).toBe(false);
    resolveProvider?.(validAdvice);
    expect((await secondRequest).statusCode).toBe(200);
  });

  it("aborts the provider and records cancellation when the last client disconnects", async () => {
    const { sessionId, sessions } = createTestSession();
    const provider = new FakeAdviceProvider("timeout");
    const usageLog: UsageLog = [];
    const client = new AbortController();
    const request = requestAdvice({ sessionId }, {
      provider,
      sessions,
      usageLog,
      signal: client.signal,
    });

    client.abort();
    expect((await request).statusCode).toBe(499);
    expect(provider.abortCount).toBe(1);
    await expect.poll(() => usageLog[0]?.status).toBe("cancelled");
    expect(usageLog[0].providerAttempts?.[0].status).toBe("cancelled");
  });

  it("rejects a tool-call sessionId that differs from the original request", async () => {
    const { sessionId, sessions } = createTestSession();
    const provider = new FakeAdviceProvider("mismatch");

    const result = await requestAdvice(
      { sessionId },
      { provider, sessions },
    );

    expect(result.statusCode).toBe(502);
    expect(result.body).toMatchObject({ success: false });
  });
});

function unavailableError(): GeminiProviderError {
  return new GeminiProviderError("provider-unavailable", "initial_tool_call", 503);
}

function createScriptedModelProvider(
  scripts: Record<string, unknown[]>,
  calls: string[] = [],
): (model: string) => AdviceProvider {
  return (model) => ({
    generateAdvice: async () => {
      calls.push(model);
      const result = scripts[model]?.shift();
      if (result instanceof Error) throw result;
      return result ?? validAdvice;
    },
  });
}

describe("private AI usage report", () => {
  it("aggregates token usage without returning per-session identifiers", () => {
    const usageLog: UsageLog = [
      {
        operation: "ai.advice",
        provider: "gemini",
        model: "gemini-3.8-flash",
        status: "success",
        attempts: 1,
        latencyMs: 500,
        sessionId: "private-session-id",
        tokenUsage: { promptTokens: 55, outputTokens: 21, totalTokens: 76 },
      },
      {
        operation: "ai.advice",
        provider: "gemini",
        model: "gemini-3.8-flash",
        status: "provider_error",
        attempts: 2,
        latencyMs: 1_500,
      },
    ];

    const dashboard = aggregateUsage(usageLog);

    expect(dashboard).toMatchObject({
      totalRequests: 2,
      successCount: 1,
      failureCount: 1,
      averageLatencyMs: 1_000,
      tokenUsage: {
        measuredRequests: 1,
        promptTokens: 55,
        outputTokens: 21,
        totalTokens: 76,
      },
    });
    expect(dashboard).not.toHaveProperty("sessionId");
    expect(JSON.stringify(dashboard)).not.toContain("private-session-id");
  });

  it("creates a private local report without session identifiers", () => {
    const usageLog: UsageLog = [{
      operation: "ai.advice",
      provider: "gemini",
      model: "gemini-3.8-flash",
      status: "success",
      attempts: 1,
      latencyMs: 500,
      timestamp: "2026-09-27T17:00:00.000Z",
      sessionId: "private-session-id",
      tokenUsage: { promptTokens: 55, outputTokens: 21, totalTokens: 76 },
    }];

    const report = createUsageReport(usageLog, "2026-09-27T17:01:00.000Z");

    expect(report.updatedAt).toBe("2026-09-27T17:01:00.000Z");
    expect(report.summary.totalRequests).toBe(1);
    expect(report.records[0]).not.toHaveProperty("sessionId");
    expect(JSON.stringify(report)).not.toContain("private-session-id");
  });

  it("bounds in-memory usage history", () => {
    const usageLog: UsageLog = [];
    for (let index = 0; index < 505; index += 1) {
      recordUsage(usageLog, {
        operation: "ai.advice",
        provider: "fake",
        model: "test",
        status: "success",
        attempts: 1,
        latencyMs: index,
      });
    }

    expect(usageLog).toHaveLength(500);
    expect(usageLog[0].latencyMs).toBe(5);
  });
});

describe("backend request guards", () => {
  it("allows only configured browser origins", () => {
    const allowed = parseAllowedOrigins("http://localhost:5173, http://127.0.0.1:5173");

    expect(isAllowedOrigin("http://localhost:5173", allowed)).toBe(true);
    expect(isAllowedOrigin("http://evil.example", allowed)).toBe(false);
    expect(isAllowedOrigin(undefined, allowed)).toBe(true);
  });

  it("limits requests per key in a rolling time window", () => {
    let now = 0;
    const allow = createRateLimiter(2, 1_000, () => now);

    expect(allow("local-client")).toBe(true);
    expect(allow("local-client")).toBe(true);
    expect(allow("local-client")).toBe(false);
    now = 1_000;
    expect(allow("local-client")).toBe(true);
  });
});
