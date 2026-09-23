import { describe, expect, it } from "vitest";
import {
  advanceGame,
  createInitialGameState,
  detectCollision,
  findFreePosition,
  FOOD_SCORE,
  GOLDEN_FOOD_SCORE,
  isOppositeDirection,
  isPosition,
  isWithinBounds,
  movePosition,
  requestDirection,
  togglePause,
  validateGameState,
} from "../src/game";
import {
  defaultGameConfig,
  validateGameConfig,
} from "../src/types";

describe("GameConfig and Types", () => {
  it("validates default game config correctly", () => {
    const res = validateGameConfig(defaultGameConfig);

    expect(res.ok).toBe(true);

    if (res.ok) {
      expect(res.config.gridWidth).toBe(30);
      expect(res.config.gridHeight).toBe(30);
    }
  });

  it("rejects invalid game config", () => {
    expect(
      validateGameConfig({
        ...defaultGameConfig,
        gridWidth: 2,
      }).ok
    ).toBe(false);

    expect(
      validateGameConfig({
        ...defaultGameConfig,
        obstacleCount: 500,
      }).ok
    ).toBe(false);

    expect(
      validateGameConfig({
        ...defaultGameConfig,
        difficulty: "invalid" as any,
      }).ok
    ).toBe(false);
  });
});

describe("Helper functions", () => {
  it("isPosition identifies valid positions", () => {
    expect(isPosition({ x: 0, y: 0 })).toBe(true);
    expect(isPosition({ x: -1, y: 5 })).toBe(true);
    expect(isPosition({ x: 1.5, y: 2 })).toBe(false);
    expect(isPosition("foo")).toBe(false);
    expect(isPosition(null)).toBe(false);
  });

  it("isWithinBounds checks boundaries", () => {
    const config = defaultGameConfig;

    expect(
      isWithinBounds({ x: 0, y: 0 }, config)
    ).toBe(true);

    expect(
      isWithinBounds({ x: 29, y: 29 }, config)
    ).toBe(true);

    expect(
      isWithinBounds({ x: 30, y: 0 }, config)
    ).toBe(false);

    expect(
      isWithinBounds({ x: -1, y: 0 }, config)
    ).toBe(false);
  });

  it("isOppositeDirection detects 180 degree turns", () => {
    expect(
      isOppositeDirection("up", "down")
    ).toBe(true);

    expect(
      isOppositeDirection("down", "up")
    ).toBe(true);

    expect(
      isOppositeDirection("left", "right")
    ).toBe(true);

    expect(
      isOppositeDirection("right", "left")
    ).toBe(true);

    expect(
      isOppositeDirection("up", "left")
    ).toBe(false);
  });

  it("movePosition advances coordinate correctly", () => {
    expect(
      movePosition({ x: 5, y: 5 }, "up")
    ).toEqual({ x: 5, y: 4 });

    expect(
      movePosition({ x: 5, y: 5 }, "down")
    ).toEqual({ x: 5, y: 6 });

    expect(
      movePosition({ x: 5, y: 5 }, "left")
    ).toEqual({ x: 4, y: 5 });

    expect(
      movePosition({ x: 5, y: 5 }, "right")
    ).toEqual({ x: 6, y: 5 });
  });

  it("detectCollision detects wall, obstacle, and self collisions", () => {
    const config = defaultGameConfig;

    const snake = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
    ];

    const obstacles = [{ x: 10, y: 10 }];

    expect(
      detectCollision(
        { x: -1, y: 5 },
        snake,
        obstacles,
        config,
        true
      )
    ).toBe("wall");

    expect(
      detectCollision(
        { x: 10, y: 10 },
        snake,
        obstacles,
        config,
        true
      )
    ).toBe("obstacle");

    expect(
      detectCollision(
        { x: 4, y: 5 },
        snake,
        obstacles,
        config,
        true
      )
    ).toBe("self");

    expect(
      detectCollision(
        { x: 6, y: 5 },
        snake,
        obstacles,
        config,
        true
      )
    ).toBeNull();
  });

  it("findFreePosition supports mock random and extraOccupied", () => {
    const config = {
      ...defaultGameConfig,
      gridWidth: 3,
      gridHeight: 3,
      obstacleCount: 0,
    };

    const snake = [{ x: 0, y: 0 }];
    const obstacles = [{ x: 0, y: 1 }];
    const mockRandom = () => 0;

    const pos = findFreePosition(
      config,
      snake,
      obstacles,
      mockRandom
    );

    expect(pos).not.toBeNull();
    expect(pos).toEqual({ x: 1, y: 0 });
  });
});

describe("Game State & Validation", () => {
  it("creates initial game state correctly", () => {
    const state = createInitialGameState(
      defaultGameConfig,
      () => 0
    );

    expect(state.status).toBe("running");
    expect(state.score).toBe(0);
    expect(state.snake.length).toBe(3);
    expect(state.obstacles.length).toBe(70);
    expect(state.food).not.toBeNull();
    expect(validateGameState(state).ok).toBe(true);
  });

  it("rejects invalid 180 degree turn in validateGameState", () => {
    const state =
      createInitialGameState(defaultGameConfig);

    const invalidState = {
      ...state,
      direction: "right" as const,
      queuedDirection: "left" as const,
    };

    const res = validateGameState(invalidState);

    expect(res.ok).toBe(false);
  });

  it("rejects food on snake in validateGameState", () => {
    const state =
      createInitialGameState(defaultGameConfig);

    const invalidState = {
      ...state,
      food: state.snake[0],
    };

    const res = validateGameState(invalidState);

    expect(res.ok).toBe(false);
  });

  it("prevents 180 degree direction changes in requestDirection", () => {
    const state =
      createInitialGameState(defaultGameConfig);

    const updated = requestDirection(
      state,
      "left"
    );

    expect(updated.queuedDirection).toBe("right");
  });

  it("accepts valid direction change", () => {
    const state =
      createInitialGameState(defaultGameConfig);

    const updated = requestDirection(
      state,
      "up"
    );

    expect(updated.queuedDirection).toBe("up");
  });

  it("toggles pause correctly", () => {
    const state =
      createInitialGameState(defaultGameConfig);

    const paused = togglePause(state);

    expect(paused.status).toBe("paused");

    const resumed = togglePause(paused);

    expect(resumed.status).toBe("running");
  });
});

describe("Game Advancement", () => {
  it("advances snake forward when not eating", () => {
    const config = {
      ...defaultGameConfig,
      gridWidth: 10,
      gridHeight: 10,
      obstacleCount: 0,
    };

    const snake = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
    ];

    const state = {
      config,
      snake,
      direction: "right" as const,
      queuedDirection: "right" as const,
      food: { x: 9, y: 9 },
      goldenFood: null,
      goldenFoodTimer: 0,
      obstacles: [],
      score: 0,
      status: "running" as const,
      collision: null,
    };

    const next = advanceGame(state);

    expect(next.snake[0]).toEqual({
      x: 6,
      y: 5,
    });

    expect(next.snake.length).toBe(3);
    expect(next.score).toBe(0);
  });

  it("grows snake and increases score when eating food", () => {
    const config = {
      ...defaultGameConfig,
      gridWidth: 10,
      gridHeight: 10,
      obstacleCount: 0,
    };

    const snake = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
    ];

    const state = {
      config,
      snake,
      direction: "right" as const,
      queuedDirection: "right" as const,
      food: { x: 6, y: 5 },
      goldenFood: null,
      goldenFoodTimer: 0,
      obstacles: [],
      score: 0,
      status: "running" as const,
      collision: null,
    };

    const next = advanceGame(
      state,
      () => 0.99
    );

    expect(next.snake[0]).toEqual({
      x: 6,
      y: 5,
    });

    expect(next.snake.length).toBe(4);
    expect(next.score).toBe(FOOD_SCORE);
  });

  it("handles golden food score and timer expiration", () => {
    const config = {
      ...defaultGameConfig,
      gridWidth: 10,
      gridHeight: 10,
      obstacleCount: 0,
    };

    const snake = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
    ];

    const state = {
      config,
      snake,
      direction: "right" as const,
      queuedDirection: "right" as const,
      food: { x: 9, y: 9 },
      goldenFood: { x: 6, y: 5 },
      goldenFoodTimer: 1,
      obstacles: [],
      score: 0,
      status: "running" as const,
      collision: null,
    };

    const next = advanceGame(state);

    expect(next.score).toBe(
      GOLDEN_FOOD_SCORE
    );

    expect(next.goldenFood).toBeNull();
    expect(next.snake.length).toBe(4);
  });

  it("wraps from the right edge to the left edge", () => {
    const config = {
      ...defaultGameConfig,
      gridWidth: 5,
      gridHeight: 5,
      obstacleCount: 0,
    };

    const snake = [
      { x: 4, y: 2 },
      { x: 3, y: 2 },
      { x: 2, y: 2 },
    ];

    const state = {
      config,
      snake,
      direction: "right" as const,
      queuedDirection: "right" as const,
      food: { x: 2, y: 0 },
      goldenFood: null,
      goldenFoodTimer: 0,
      obstacles: [],
      score: 0,
      status: "running" as const,
      collision: null,
    };

    const next = advanceGame(state);

    expect(next.status).toBe("running");
    expect(next.collision).toBeNull();

    expect(next.snake[0]).toEqual({
      x: 0,
      y: 2,
    });
  });

  it("wraps from the left edge to the right edge", () => {
    const config = {
      ...defaultGameConfig,
      gridWidth: 5,
      gridHeight: 5,
      obstacleCount: 0,
    };

    const snake = [
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ];

    const state = {
      config,
      snake,
      direction: "left" as const,
      queuedDirection: "left" as const,
      food: { x: 2, y: 0 },
      goldenFood: null,
      goldenFoodTimer: 0,
      obstacles: [],
      score: 0,
      status: "running" as const,
      collision: null,
    };

    const next = advanceGame(state);

    expect(next.status).toBe("running");
    expect(next.collision).toBeNull();

    expect(next.snake[0]).toEqual({
      x: 4,
      y: 2,
    });
  });

  it("wraps from the top edge to the bottom edge", () => {
    const config = {
      ...defaultGameConfig,
      gridWidth: 5,
      gridHeight: 5,
      obstacleCount: 0,
    };

    const snake = [
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ];

    const state = {
      config,
      snake,
      direction: "up" as const,
      queuedDirection: "up" as const,
      food: { x: 4, y: 4 },
      goldenFood: null,
      goldenFoodTimer: 0,
      obstacles: [],
      score: 0,
      status: "running" as const,
      collision: null,
    };

    const next = advanceGame(state);

    expect(next.status).toBe("running");
    expect(next.collision).toBeNull();

    expect(next.snake[0]).toEqual({
      x: 2,
      y: 4,
    });
  });

  it("wraps from the bottom edge to the top edge", () => {
    const config = {
      ...defaultGameConfig,
      gridWidth: 5,
      gridHeight: 5,
      obstacleCount: 0,
    };

    const snake = [
      { x: 2, y: 4 },
      { x: 2, y: 3 },
      { x: 2, y: 2 },
    ];

    const state = {
      config,
      snake,
      direction: "down" as const,
      queuedDirection: "down" as const,
      food: { x: 4, y: 4 },
      goldenFood: null,
      goldenFoodTimer: 0,
      obstacles: [],
      score: 0,
      status: "running" as const,
      collision: null,
    };

    const next = advanceGame(state);

    expect(next.status).toBe("running");
    expect(next.collision).toBeNull();

    expect(next.snake[0]).toEqual({
      x: 2,
      y: 0,
    });
  });
});
