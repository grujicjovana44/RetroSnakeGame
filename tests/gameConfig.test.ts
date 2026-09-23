import { describe, it, expect } from "vitest";
import { validateGameConfig, defaultGameConfig } from "../src/types";

describe("validateGameConfig — baseline runtime provera", () => {
  it("prihvata validan, podrazumevani config", () => {
    const result = validateGameConfig(defaultGameConfig);
    expect(result.ok).toBe(true);
    expect(defaultGameConfig.gridWidth).toBe(30);
    expect(defaultGameConfig.gridHeight).toBe(30);
    expect(defaultGameConfig.obstacleCount).toBe(70);
    expect(defaultGameConfig.difficulty).toBe("normal");
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
