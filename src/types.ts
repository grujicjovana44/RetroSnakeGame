export type Difficulty = "easy" | "normal" | "hard";

export type GameConfig = {
  gridWidth: number;
  gridHeight: number;
  startingSpeedMs: number;
  obstacleCount: number;
  difficulty: Difficulty;
};

export const defaultGameConfig: GameConfig = {
  gridWidth: 30,
  gridHeight: 30,
  startingSpeedMs: 150,
  obstacleCount: 20,
  difficulty: "normal",
};

export type ValidationResult =
  | { ok: true; config: GameConfig }
  | { ok: false; errors: string[] };

const INITIAL_SNAKE_LENGTH = 3;
const RESERVED_FOOD_CELLS = 2;

export function resolveStartingSpeedMs(config: GameConfig): number {
  const multiplier: Record<Difficulty, number> = {
    easy: 1.25,
    normal: 1,
    hard: 0.75,
  };

  return Math.round(config.startingSpeedMs * multiplier[config.difficulty]);
}

export function validateGameConfig(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof input !== "object" || input === null) {
    return { ok: false, errors: ["config mora biti objekat"] };
  }

  const c = input as Partial<GameConfig>;

  if (
    typeof c.gridWidth !== "number" ||
    !Number.isInteger(c.gridWidth) ||
    c.gridWidth < 5 ||
    c.gridWidth > 60
  ) {
    errors.push("gridWidth mora biti ceo broj u opsegu 5-60");
  }
  if (
    typeof c.gridHeight !== "number" ||
    !Number.isInteger(c.gridHeight) ||
    c.gridHeight < 5 ||
    c.gridHeight > 60
  ) {
    errors.push("gridHeight mora biti ceo broj u opsegu 5-60");
  }
  if (
    typeof c.startingSpeedMs !== "number" ||
    !Number.isFinite(c.startingSpeedMs) ||
    c.startingSpeedMs < 30 ||
    c.startingSpeedMs > 1000
  ) {
    errors.push("startingSpeedMs mora biti broj u opsegu 30-1000");
  }
  if (
    typeof c.obstacleCount !== "number" ||
    !Number.isInteger(c.obstacleCount) ||
    c.obstacleCount < 0 ||
    c.obstacleCount > 100
  ) {
    errors.push("obstacleCount mora biti ceo broj u opsegu 0-100");
  }
  if (
    c.difficulty !== "easy" &&
    c.difficulty !== "normal" &&
    c.difficulty !== "hard"
  ) {
    errors.push('difficulty mora biti "easy" | "normal" | "hard"');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const config = c as GameConfig;
  const availableObstacleCells =
    config.gridWidth * config.gridHeight - INITIAL_SNAKE_LENGTH - RESERVED_FOOD_CELLS;
  if (config.obstacleCount > availableObstacleCells) {
    return {
      ok: false,
      errors: [
        "obstacleCount ostavlja premalo mesta za početnu zmiju i hranu",
      ],
    };
  }

  return { ok: true, config };
}