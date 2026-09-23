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
wrapPosition,
type GameState,
type Position,
} from "../src/game";
import {
defaultGameConfig,
type GameConfig,
} from "../src/types";

describe("GameConfig", () => {
it("uses the expected default configuration", () => {
expect(defaultGameConfig).toMatchObject({
gridWidth: 30,
gridHeight: 30,
obstacleCount: expect.any(Number),
});
});

it("has a valid default configuration", () => {
expect(defaultGameConfig.gridWidth).toBeGreaterThan(0);
expect(defaultGameConfig.gridHeight).toBeGreaterThan(0);
expect(defaultGameConfig.obstacleCount).toBeGreaterThanOrEqual(0);
});
});

describe("Helpers", () => {
it("checks whether a position is inside the board", () => {
const config: GameConfig = {
...defaultGameConfig,
gridWidth: 10,
gridHeight: 10,
};

   
expect(isWithinBounds({ x: 0, y: 0 }, config)).toBe(true);
expect(isWithinBounds({ x: 9, y: 9 }, config)).toBe(true);

expect(isWithinBounds({ x: -1, y: 0 }, config)).toBe(false);
expect(isWithinBounds({ x: 10, y: 0 }, config)).toBe(false);
expect(isWithinBounds({ x: 0, y: -1 }, config)).toBe(false);
expect(isWithinBounds({ x: 0, y: 10 }, config)).toBe(false);
   

});

it("moves a position in the requested direction", () => {
const position: Position = { x: 5, y: 5 };

   
expect(movePosition(position, "up")).toEqual({ x: 5, y: 4 });
expect(movePosition(position, "down")).toEqual({ x: 5, y: 6 });
expect(movePosition(position, "left")).toEqual({ x: 4, y: 5 });
expect(movePosition(position, "right")).toEqual({ x: 6, y: 5 });
   

});

it("detects opposite directions", () => {
expect(isOppositeDirection("up", "down")).toBe(true);
expect(isOppositeDirection("down", "up")).toBe(true);
expect(isOppositeDirection("left", "right")).toBe(true);
expect(isOppositeDirection("right", "left")).toBe(true);

   
expect(isOppositeDirection("up", "left")).toBe(false);
expect(isOppositeDirection("right", "down")).toBe(false);
   

});

it("checks whether a value is a valid position", () => {
expect(isPosition({ x: 1, y: 2 })).toBe(true);
expect(isPosition({ x: 0, y: 0 })).toBe(true);
expect(isPosition({ x: -1, y: 2 })).toBe(true);

   
expect(isPosition(null)).toBe(false);
expect(isPosition(undefined)).toBe(false);
expect(isPosition({ x: 1 })).toBe(false);
expect(isPosition({ y: 2 })).toBe(false);
expect(isPosition({ x: "1", y: 2 })).toBe(false);
   

});

it("wraps positions around all four board edges", () => {
const config: GameConfig = {
...defaultGameConfig,
gridWidth: 10,
gridHeight: 10,
};

   
expect(wrapPosition({ x: 10, y: 5 }, config)).toEqual({
  x: 0,
  y: 5,
});

expect(wrapPosition({ x: -1, y: 5 }, config)).toEqual({
  x: 9,
  y: 5,
});

expect(wrapPosition({ x: 5, y: 10 }, config)).toEqual({
  x: 5,
  y: 0,
});

expect(wrapPosition({ x: 5, y: -1 }, config)).toEqual({
  x: 5,
  y: 9,
});
   

});

it("wraps positions correctly when they are more than one cell outside", () => {
const config: GameConfig = {
...defaultGameConfig,
gridWidth: 10,
gridHeight: 10,
};

   
expect(wrapPosition({ x: 12, y: 5 }, config)).toEqual({
  x: 2,
  y: 5,
});

expect(wrapPosition({ x: -12, y: 5 }, config)).toEqual({
  x: 8,
  y: 5,
});

expect(wrapPosition({ x: 5, y: 12 }, config)).toEqual({
  x: 5,
  y: 2,
});

expect(wrapPosition({ x: 5, y: -12 }, config)).toEqual({
  x: 5,
  y: 8,
});
   

});

it("finds a free position that is not occupied", () => {
const config: GameConfig = {
...defaultGameConfig,
gridWidth: 5,
gridHeight: 5,
obstacleCount: 0,
};

   
const snake: Position[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

const obstacles: Position[] = [
  { x: 2, y: 2 },
];

const position = findFreePosition(
  config,
  snake,
  obstacles,
  [],
  () => 0,
);

expect(position).not.toBeNull();

if (position) {
  expect(isWithinBounds(position, config)).toBe(true);
  expect(snake).not.toContainEqual(position);
  expect(obstacles).not.toContainEqual(position);
}
   

});

it("returns null when there are no free positions", () => {
const config: GameConfig = {
...defaultGameConfig,
gridWidth: 2,
gridHeight: 2,
obstacleCount: 0,
};

   
const snake: Position[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

const position = findFreePosition(
  config,
  snake,
  [],
  [],
  () => 0,
);

expect(position).toBeNull();
   

});
});

describe("Game State & Validation", () => {
it("creates a valid initial game state", () => {
const config: GameConfig = {
...defaultGameConfig,
obstacleCount: 0,
};

   
const state = createInitialGameState(config, () => 0);

expect(state.status).toBe("running");
expect(state.score).toBe(0);
expect(state.snake.length).toBe(3);
expect(state.food).not.toBeNull();
expect(state.goldenFood).toBeNull();
expect(state.goldenFoodTimer).toBe(0);
expect(state.collision).toBeNull();
expect(validateGameState(state).ok).toBe(true);
   

});

it("keeps the initial snake and food inside the board", () => {
const config: GameConfig = {
...defaultGameConfig,
obstacleCount: 0,
};

   
const state = createInitialGameState(config, () => 0);

for (const segment of state.snake) {
  expect(isWithinBounds(segment, state.config)).toBe(true);
}

if (state.food) {
  expect(isWithinBounds(state.food, state.config)).toBe(true);
}
   

});

it("rejects a snake segment outside the board", () => {
const config: GameConfig = {
...defaultGameConfig,
obstacleCount: 0,
};

   
const state = createInitialGameState(config, () => 0);

const invalidState: GameState = {
  ...state,
  snake: [
    { x: -1, y: 0 },
    ...state.snake.slice(1),
  ],
};

const result = validateGameState(invalidState);

expect(result.ok).toBe(false);
   

});

it("rejects a food position outside the board", () => {
const config: GameConfig = {
...defaultGameConfig,
obstacleCount: 0,
};

   
const state = createInitialGameState(config, () => 0);

const invalidState: GameState = {
  ...state,
  food: {
    x: state.config.gridWidth,
    y: 0,
  },
};

const result = validateGameState(invalidState);

expect(result.ok).toBe(false);
   

});

it("rejects an invalid score", () => {
const config: GameConfig = {
...defaultGameConfig,
obstacleCount: 0,
};

   
const state = createInitialGameState(config, () => 0);

const invalidState: GameState = {
  ...state,
  score: -1,
};

const result = validateGameState(invalidState);

expect(result.ok).toBe(false);
   

});

it("rejects a score that is not a multiple of the food score", () => {
const config: GameConfig = {
...defaultGameConfig,
obstacleCount: 0,
};

   
const state = createInitialGameState(config, () => 0);

const invalidState: GameState = {
  ...state,
  score: 15,
};

const result = validateGameState(invalidState);

expect(result.ok).toBe(false);
   

});

it("accepts a valid paused state", () => {
const config: GameConfig = {
...defaultGameConfig,
obstacleCount: 0,
};

   
const state = createInitialGameState(config, () => 0);
const pausedState = togglePause(state);

expect(pausedState.status).toBe("paused");
expect(validateGameState(pausedState).ok).toBe(true);
   

});
});

describe("Collision Detection", () => {
it("detects wall collision for an out-of-bounds position", () => {
const config: GameConfig = {
...defaultGameConfig,
gridWidth: 10,
gridHeight: 10,
obstacleCount: 0,
};

   
const collision = detectCollision(
  { x: -1, y: 5 },
  [],
  [],
  config,
  true,
);

expect(collision).toBe("wall");
   

});

it("detects obstacle collision", () => {
const config: GameConfig = {
...defaultGameConfig,
gridWidth: 10,
gridHeight: 10,
obstacleCount: 0,
};

   
const collision = detectCollision(
  { x: 5, y: 5 },
  [],
  [{ x: 5, y: 5 }],
  config,
  true,
);

expect(collision).toBe("obstacle");
   

});

it("detects self collision", () => {
const config: GameConfig = {
...defaultGameConfig,
gridWidth: 10,
gridHeight: 10,
obstacleCount: 0,
};

   
const collision = detectCollision(
  { x: 5, y: 5 },
  [
    { x: 5, y: 5 },
    { x: 5, y: 6 },
    { x: 4, y: 6 },
  ],
  [],
  config,
  true,
);

expect(collision).toBe("self");
   

});

it("does not report self collision with the current tail when the tail moves", () => {
const config: GameConfig = {
...defaultGameConfig,
gridWidth: 10,
gridHeight: 10,
obstacleCount: 0,
};

   
const snake: Position[] = [
  { x: 5, y: 5 },
  { x: 5, y: 6 },
  { x: 4, y: 6 },
];

const collision = detectCollision(
  { x: 4, y: 6 },
  snake,
  [],
  config,
  true,
);

expect(collision).toBeNull();
   

});

it("detects collision with the tail when the tail does not move", () => {
const config: GameConfig = {
...defaultGameConfig,
gridWidth: 10,
gridHeight: 10,
obstacleCount: 0,
};

   
const snake: Position[] = [
  { x: 5, y: 5 },
  { x: 5, y: 6 },
  { x: 4, y: 6 },
];

const collision = detectCollision(
  { x: 4, y: 6 },
  snake,
  [],
  config,
  false,
);

expect(collision).toBe("self");
   

});

it("returns null when there is no collision", () => {
const config: GameConfig = {
...defaultGameConfig,
gridWidth: 10,
gridHeight: 10,
obstacleCount: 0,
};

   
const collision = detectCollision(
  { x: 5, y: 5 },
  [{ x: 4, y: 5 }],
  [{ x: 2, y: 2 }],
  config,
  true,
);

expect(collision).toBeNull();
   

});
});

describe("Direction Requests", () => {
it("accepts a valid direction change", () => {
const config: GameConfig = {
...defaultGameConfig,
gridWidth: 10,
gridHeight: 10,
obstacleCount: 0,
};

   
const state = createInitialGameState(config, () => 0);

const next = requestDirection(state, "up");

expect(next.queuedDirection).toBe("up");
   

});

it("rejects an opposite direction", () => {
const config: GameConfig = {
...defaultGameConfig,
gridWidth: 10,
gridHeight: 10,
obstacleCount: 0,
};

   
const state: GameState = {
  ...createInitialGameState(config, () => 0),
  direction: "right",
  queuedDirection: "right",
};

const next = requestDirection(state, "left");

expect(next.queuedDirection).toBe("right");
   

});

it("does not change direction when the game is paused", () => {
const config: GameConfig = {
...defaultGameConfig,
obstacleCount: 0,
};

   
const state = togglePause(
  createInitialGameState(config, () => 0),
);

const next = requestDirection(state, "up");

expect(next.queuedDirection).toBe(state.queuedDirection);
   

});

it("does not change direction when the game is over", () => {
const config: GameConfig = {
...defaultGameConfig,
obstacleCount: 0,
};

   
const state: GameState = {
  ...createInitialGameState(config, () => 0),
  status: "game-over",
  collision: "self",
};

const next = requestDirection(state, "up");

expect(next.queuedDirection).toBe(state.queuedDirection);
   

});
});

describe("Pause", () => {
it("pauses a running game", () => {
const config: GameConfig = {
...defaultGameConfig,
obstacleCount: 0,
};

   
const state = createInitialGameState(config, () => 0);

const next = togglePause(state);

expect(next.status).toBe("paused");
   

});

it("resumes a paused game", () => {
const config: GameConfig = {
...defaultGameConfig,
obstacleCount: 0,
};

   
const state = createInitialGameState(config, () => 0);
const paused = togglePause(state);
const resumed = togglePause(paused);

expect(resumed.status).toBe("running");
   

});

it("does not change game-over state when toggling pause", () => {
const config: GameConfig = {
...defaultGameConfig,
obstacleCount: 0,
};

   
const state: GameState = {
  ...createInitialGameState(config, () => 0),
  status: "game-over",
  collision: "self",
};

const next = togglePause(state);

expect(next.status).toBe("game-over");
expect(next.collision).toBe("self");
   

});
});

describe("Game Advancement", () => {
it("moves the snake one cell in the current direction", () => {
const config: GameConfig = {
...defaultGameConfig,
gridWidth: 10,
gridHeight: 10,
obstacleCount: 0,
};

   
const state: GameState = {
  ...createInitialGameState(config, () => 0),
  snake: [
    { x: 5, y: 5 },
    { x: 4, y: 5 },
    { x: 3, y: 5 },
  ],
  direction: "right",
  queuedDirection: "right",
  food: { x: 0, y: 0 },
  goldenFood: null,
  goldenFoodTimer: 0,
  obstacles: [],
  score: 0,
  status: "running",
  collision: null,
};

const next = advanceGame(state, () => 0);

expect(next.snake[0]).toEqual({ x: 6, y: 5 });
expect(next.status).toBe("running");
expect(next.score).toBe(0);
   

});

it("increases score and grows when normal food is eaten", () => {
const config: GameConfig = {
...defaultGameConfig,
gridWidth: 10,
gridHeight: 10,
obstacleCount: 0,
};

   
const state: GameState = {
  ...createInitialGameState(config, () => 0),
  snake: [
    { x: 5, y: 5 },
    { x: 4, y: 5 },
  ],
  direction: "right",
  queuedDirection: "right",
  food: { x: 6, y: 5 },
  goldenFood: null,
  goldenFoodTimer: 0,
  obstacles: [],
  score: 0,
  status: "running",
  collision: null,
};

const next = advanceGame(state, () => 0.9);

expect(next.score).toBe(FOOD_SCORE);
expect(next.snake).toHaveLength(3);
expect(next.snake[0]).toEqual({ x: 6, y: 5 });
expect(next.food).not.toEqual({ x: 6, y: 5 });
expect(next.status).toBe("running");
   

});

it("increases score and grows when golden food is eaten", () => {
const config: GameConfig = {
...defaultGameConfig,
gridWidth: 10,
gridHeight: 10,
obstacleCount: 0,
};

   
const state: GameState = {
  ...createInitialGameState(config, () => 0),
  snake: [
    { x: 5, y: 5 },
    { x: 4, y: 5 },
  ],
  direction: "right",
  queuedDirection: "right",
  food: { x: 0, y: 0 },
  goldenFood: { x: 6, y: 5 },
  goldenFoodTimer: 10,
  obstacles: [],
  score: 0,
  status: "running",
  collision: null,
};

const next = advanceGame(state, () => 0);

expect(next.score).toBe(GOLDEN_FOOD_SCORE);
expect(next.snake).toHaveLength(3);
expect(next.snake[0]).toEqual({ x: 6, y: 5 });
expect(next.goldenFood).toBeNull();
expect(next.goldenFoodTimer).toBe(0);
expect(next.status).toBe("running");
   

});

it("ends the game when snake hits an obstacle", () => {
const config: GameConfig = {
...defaultGameConfig,
gridWidth: 10,
gridHeight: 10,
obstacleCount: 0,
};

   
const state: GameState = {
  ...createInitialGameState(config, () => 0),
  snake: [
    { x: 5, y: 5 },
    { x: 4, y: 5 },
  ],
  direction: "right",
  queuedDirection: "right",
  food: { x: 0, y: 0 },
  goldenFood: null,
  goldenFoodTimer: 0,
  obstacles: [{ x: 6, y: 5 }],
  score: 0,
  status: "running",
  collision: null,
};

const next = advanceGame(state, () => 0);

expect(next.status).toBe("game-over");
expect(next.collision).toBe("obstacle");
expect(next.snake).toEqual(state.snake);
expect(next.score).toBe(0);
   

});

it("ends the game when snake hits itself", () => {
const config: GameConfig = {
...defaultGameConfig,
gridWidth: 10,
gridHeight: 10,
obstacleCount: 0,
};

const snake: Position[] = [
{ x: 5, y: 5 },
{ x: 5, y: 4 },
{ x: 4, y: 4 },
{ x: 4, y: 5 },
];

const state: GameState = {
...createInitialGameState(config, () => 0),
snake,
direction: "up",
queuedDirection: "up",
food: { x: 9, y: 9 },
goldenFood: null,
goldenFoodTimer: 0,
obstacles: [],
score: 0,
status: "running",
collision: null,
};

const next = advanceGame(state, () => 0);

expect(next.status).toBe("game-over");
expect(next.collision).toBe("self");
expect(next.snake).toEqual(snake);
expect(next.score).toBe(0);
});


it("wraps from the right edge to the left edge", () => {
const config: GameConfig = {
...defaultGameConfig,
gridWidth: 10,
gridHeight: 10,
obstacleCount: 0,
};

   
const state: GameState = {
  ...createInitialGameState(config, () => 0),
  snake: [
    { x: 9, y: 5 },
    { x: 8, y: 5 },
  ],
  direction: "right",
  queuedDirection: "right",
  food: { x: 0, y: 0 },
  goldenFood: null,
  goldenFoodTimer: 0,
  obstacles: [],
  score: 0,
  status: "running",
  collision: null,
};

const next = advanceGame(state, () => 0);

expect(next.status).toBe("running");
expect(next.collision).toBeNull();
expect(next.snake[0]).toEqual({ x: 0, y: 5 });
   

});

it("wraps from the left edge to the right edge", () => {
const config: GameConfig = {
...defaultGameConfig,
gridWidth: 10,
gridHeight: 10,
obstacleCount: 0,
};

   
const state: GameState = {
  ...createInitialGameState(config, () => 0),
  snake: [
    { x: 0, y: 5 },
    { x: 1, y: 5 },
  ],
  direction: "left",
  queuedDirection: "left",
  food: { x: 5, y: 0 },
  goldenFood: null,
  goldenFoodTimer: 0,
  obstacles: [],
  score: 0,
  status: "running",
  collision: null,
};

const next = advanceGame(state, () => 0);

expect(next.status).toBe("running");
expect(next.collision).toBeNull();
expect(next.snake[0]).toEqual({ x: 9, y: 5 });
   

});

it("wraps from the bottom edge to the top edge", () => {
const config: GameConfig = {
...defaultGameConfig,
gridWidth: 10,
gridHeight: 10,
obstacleCount: 0,
};

   
const state: GameState = {
  ...createInitialGameState(config, () => 0),
  snake: [
    { x: 5, y: 9 },
    { x: 5, y: 8 },
  ],
  direction: "down",
  queuedDirection: "down",
  food: { x: 0, y: 0 },
  goldenFood: null,
  goldenFoodTimer: 0,
  obstacles: [],
  score: 0,
  status: "running",
  collision: null,
};

const next = advanceGame(state, () => 0);

expect(next.status).toBe("running");
expect(next.collision).toBeNull();
expect(next.snake[0]).toEqual({ x: 5, y: 0 });
   

});

it("wraps from the top edge to the bottom edge", () => {
const config: GameConfig = {
...defaultGameConfig,
gridWidth: 10,
gridHeight: 10,
obstacleCount: 0,
};

   
const state: GameState = {
  ...createInitialGameState(config, () => 0),
  snake: [
    { x: 5, y: 0 },
    { x: 5, y: 1 },
  ],
  direction: "up",
  queuedDirection: "up",
  food: { x: 0, y: 5 },
  goldenFood: null,
  goldenFoodTimer: 0,
  obstacles: [],
  score: 0,
  status: "running",
  collision: null,
};

const next = advanceGame(state, () => 0);

expect(next.status).toBe("running");
expect(next.collision).toBeNull();
expect(next.snake[0]).toEqual({ x: 5, y: 9 });
   

});

it("does not advance a paused game", () => {
const config: GameConfig = {
...defaultGameConfig,
obstacleCount: 0,
};


const state = togglePause(
  createInitialGameState(config, () => 0),
);

const next = advanceGame(state, () => 0);

expect(next).toEqual(state);
   

});

it("does not advance a game-over state", () => {
const config: GameConfig = {
...defaultGameConfig,
obstacleCount: 0,
};

const state: GameState = {
  ...createInitialGameState(config, () => 0),
  status: "game-over",
  collision: "self",
};

const next = advanceGame(state, () => 0);

expect(next).toEqual(state);

});
});
