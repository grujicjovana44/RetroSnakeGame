import { describe, expect, it } from "vitest";
import { createSession, requestAdvice, type SessionStore } from "../server/service";
import { FakeAdviceProvider } from "../server/provider";

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

    const result = await requestAdvice(
      { sessionId },
      { provider, sessions },
    );

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      success: true,
      advice: { category: "strategy" },
    });
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

  it("A4 rejects malformed provider output", async () => {
    const { sessionId, sessions } = createTestSession();
    const provider = new FakeAdviceProvider("malformed");

    const result = await requestAdvice(
      { sessionId },
      { provider, sessions },
    );

    expect(result.statusCode).toBe(502);
    expect(result.body).toEqual({
      success: false,
      message: "AI savet trenutno nije dostupan. Pokusajte ponovo kasnije.",
    });
    expect(provider.callCount).toBe(1);
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
