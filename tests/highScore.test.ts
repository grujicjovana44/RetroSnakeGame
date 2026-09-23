import { afterEach, describe, expect, it, vi } from "vitest";
import { getHighScore, saveHighScore } from "../src/highScore";

const records = new Map<string, string>();

const storage = {
  getItem: (key: string) => records.get(key) ?? null,
  setItem: (key: string, value: string) => records.set(key, value),
  removeItem: (key: string) => records.delete(key),
  clear: () => records.clear(),
  key: (index: number) => [...records.keys()][index] ?? null,
  get length() {
    return records.size;
  },
};

describe("high score persistence", () => {
  afterEach(() => {
    records.clear();
    vi.unstubAllGlobals();
  });

  it("starts at zero when no record is saved", () => {
    vi.stubGlobal("localStorage", storage);
    expect(getHighScore()).toBe(0);
  });

  it("stores a new record and reads it back after a fresh read", () => {
    vi.stubGlobal("localStorage", storage);
    saveHighScore(50);
    expect(getHighScore()).toBe(50);
  });

  it("keeps the existing record when the new score is lower", () => {
    vi.stubGlobal("localStorage", storage);
    saveHighScore(100);
    saveHighScore(40);
    expect(getHighScore()).toBe(100);
  });

  it("continues safely when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("storage unavailable"); },
      setItem: () => { throw new Error("storage unavailable"); },
    });
    expect(getHighScore()).toBe(0);
    expect(() => saveHighScore(100)).not.toThrow();
  });
});
