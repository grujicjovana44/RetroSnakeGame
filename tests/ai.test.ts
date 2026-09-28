import { describe, expect, it } from "vitest";
import { createSession, requestAdvice, type ServiceResult, type SessionStore } from "../server/service";
import { FakeAdviceProvider, type AdviceProvider } from "../server/provider";
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

function createTestSession(): { sessionId: string; sessions: SessionStore } {
  const sessions: SessionStore = new Map();
  const result = createSession(validStats, sessions);
  const body = result.body as { sessionId: string };
  return { sessionId: body.sessionId, sessions };
}

describe("AI Advice backend", () => {
  it("A1 returns structured advice after the fake tool-call round-trip", async () => {
    const { sessionId, sessions } = createTestSession();
    const provider = new FakeAdviceProvider();
    const usageLog: UsageLog = [];
    const options = {
      provider,
      sessions,
      usageLog,
      adviceCache: new Map<string, AdviceResponse>(),
      inFlightAdvice: new Map<string, Promise<ServiceResult>>(),
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
      inFlightAdvice: new Map<string, Promise<ServiceResult>>(),
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
