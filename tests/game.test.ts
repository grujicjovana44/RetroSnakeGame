import { describe, expect, it } from "vitest";
import {
  advanceGame,
  createInitialGameState,
  detectCollision,
  findFreePosition,
  type GameState,
  positionsEqual,
  requestDirection,
  validateGameState,
} from "../src/game";
import {
  defaultGameConfig,
  resolveStartingSpeedMs,
  validateGameConfig,
} from "../src/types";

const testConfig = {
  ...defaultGameConfig,
  gridWidth: 10,
  gridHeight: 10,
  obstacleCount: 1,
};

function createTestState(overrides: Partial<GameState> = {}): GameState {
  return {
    config: testConfig,
    snake: [
      { x: 4, y: 4 },
      { x: 3, y: 4 },
      { x: 2, y: 4 },
    ],
    direction: "right",
    queuedDirection: "right",
    food: { x: 8, y: 8 },
    obstacles: [{ x: 7, y: 7 }],
    score: 0,
    status: "running",
    collision: null,
    ...overrides,
  };
}

describe("Core game logika", () => {
  it("ignoriše direktan obrt od 180 stepeni", () => {
    const state = createTestState();

    expect(requestDirection(state, "left")).toBe(state);
    expect(requestDirection(state, "up").queuedDirection).toBe("up");
  });

  it("pomera zmiju u izabranom pravcu", () => {
    const nextState = advanceGame(requestDirection(createTestState(), "up"));

    expect(nextState.snake[0]).toEqual({ x: 4, y: 3 });
    expect(nextState.snake).toHaveLength(3);
  });

  it("uvećava zmiju i skor nakon hrane, a novu hranu stavlja na slobodno polje", () => {
    const state = createTestState({ food: { x: 5, y: 4 } });
    const nextState = advanceGame(state, () => 0);

    expect(nextState.snake).toHaveLength(4);
    expect(nextState.score).toBe(10);
    expect(nextState.food).not.toBeNull();
    expect(nextState.snake.some((segment) => positionsEqual(segment, nextState.food!))).toBe(false);
    expect(nextState.obstacles.some((obstacle) => positionsEqual(obstacle, nextState.food!))).toBe(false);
  });

  it("detektuje sudar sa zidom", () => {
    const state = createTestState({
      snake: [
        { x: 0, y: 4 },
        { x: 1, y: 4 },
        { x: 2, y: 4 },
      ],
      direction: "left",
      queuedDirection: "left",
    });

    const nextState = advanceGame(state);

    expect(nextState.status).toBe("game-over");
    expect(nextState.collision).toBe("wall");
  });

  it("detektuje sudar sa statičnom preprekom", () => {
    const state = createTestState({
      obstacles: [{ x: 5, y: 4 }],
    });

    const nextState = advanceGame(state);

    expect(nextState.status).toBe("game-over");
    expect(nextState.collision).toBe("obstacle");
  });

  it("detektuje sudar sa sopstvenim telom", () => {
    const state = createTestState({
      snake: [
        { x: 4, y: 4 },
        { x: 4, y: 3 },
        { x: 3, y: 3 },
        { x: 3, y: 4 },
      ],
      direction: "up",
      queuedDirection: "up",
    });

    const nextState = advanceGame(state);

    expect(nextState.status).toBe("game-over");
    expect(nextState.collision).toBe("self");
  });

  it("izdvojena funkcija kolizije tretira rep kao slobodan kada se pomera", () => {
    const snake = [
      { x: 2, y: 2 },
      { x: 2, y: 3 },
      { x: 1, y: 3 },
      { x: 1, y: 2 },
    ];

    expect(detectCollision({ x: 1, y: 2 }, snake, [], testConfig, true)).toBeNull();
    expect(detectCollision({ x: 1, y: 2 }, snake, [], testConfig, false)).toBe("self");
  });

  it("generiše početnu hranu i prepreke na međusobno slobodnim poljima", () => {
    const state = createInitialGameState(testConfig, () => 0);

    expect(state.obstacles).toHaveLength(testConfig.obstacleCount);
    expect(state.food).not.toBeNull();
    expect(findFreePosition(testConfig, state.snake, state.obstacles, () => 0)).not.toBeNull();
    expect(validateGameState(state).ok).toBe(true);
  });

  it("kreira gustu validnu tablu bez beskonačnog traženja prepreka", () => {
    const denseConfig = {
      ...defaultGameConfig,
      gridWidth: 5,
      gridHeight: 5,
      obstacleCount: 21,
    };

    expect(() => createInitialGameState(denseConfig, () => 0)).not.toThrow();
    const state = createInitialGameState(denseConfig, () => 0);

    expect(state.obstacles).toHaveLength(denseConfig.obstacleCount);
    expect(state.food).not.toBeNull();
    expect(validateGameState(state).ok).toBe(true);
  });
});

describe("Runtime ugovori", () => {
  it("koristi 70 prepreka kao podrazumevanih 17,5% table", () => {
    expect(defaultGameConfig.obstacleCount).toBe(70);
  });

  it("prihvata validno kreirano stanje igre", () => {
    const state = createInitialGameState(testConfig, () => 0);

    expect(validateGameState(state).ok).toBe(true);
  });

  it("odbija stanje gde je hrana na zmiji", () => {
    const state = createInitialGameState(testConfig, () => 0);
    const invalidState = { ...state, food: state.snake[0] };
    const result = validateGameState(invalidState);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/food/);
    }
  });

  it("odbija stanje sa unapred zakazanim obrtom od 180 stepeni", () => {
    const state = createInitialGameState(testConfig, () => 0);
    const result = validateGameState({ ...state, queuedDirection: "left" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/180/);
    }
  });

  it("odbija config sa više prepreka nego što fizički može stati", () => {
    const result = validateGameConfig({
      ...defaultGameConfig,
      gridWidth: 5,
      gridHeight: 5,
      obstacleCount: 22,
    });

    expect(result.ok).toBe(false);
  });
});

describe("Težina", () => {
  it("menja stvarni startingSpeedMs: easy je sporiji, hard brži", () => {
    const easy = resolveStartingSpeedMs({ ...defaultGameConfig, difficulty: "easy" });
    const normal = resolveStartingSpeedMs({ ...defaultGameConfig, difficulty: "normal" });
    const hard = resolveStartingSpeedMs({ ...defaultGameConfig, difficulty: "hard" });

    expect(easy).toBeGreaterThan(normal);
    expect(normal).toBe(150);
    expect(hard).toBeLessThan(normal);
  });
});
