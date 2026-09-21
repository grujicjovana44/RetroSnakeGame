import { describe, it, expect } from "vitest";
import { validateGameConfig, defaultGameConfig } from "../src/types";

describe("validateGameConfig — baseline runtime provera", () => {
  it("prihvata validan, podrazumevani config", () => {
    const result = validateGameConfig(defaultGameConfig);
    expect(result.ok).toBe(true);
  });

  it("odbija config sa gridWidth van opsega", () => {
    const result = validateGameConfig({
      ...defaultGameConfig,
      gridWidth: 2,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/gridWidth/);
    }
  });

  it("odbija nepoznatu vrednost za difficulty", () => {
    const result = validateGameConfig({
      ...defaultGameConfig,
      difficulty: "impossible",
    });
    expect(result.ok).toBe(false);
  });

  it("odbija config koji nije objekat", () => {
    const result = validateGameConfig(null);
    expect(result.ok).toBe(false);
  });
});
