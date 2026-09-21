import { type GameConfig, validateGameConfig } from "./types";

export const FOOD_SCORE = 10;
export const GOLDEN_FOOD_SCORE = 50;
export const GOLDEN_FOOD_DURATION = 35; // Trajanje zlatne hrane u broju koraka

export type Position = {
  x: number;
  y: number;
};

export type Direction = "up" | "down" | "left" | "right";

export type Collision = "wall" | "obstacle" | "self";

export type GameStatus = "running" | "paused" | "game-over";

export type GameState = {
  config: GameConfig;
  snake: Position[];
  direction: Direction;
  queuedDirection: Direction;
  food: Position | null;
  goldenFood: Position | null;
  goldenFoodTimer: number;
  obstacles: Position[];
  score: number;
  status: GameStatus;
  collision: Collision | null;
};

export type GameStateValidationResult =
  | { ok: true; state: GameState }
  | { ok: false; errors: string[] };

const DIRECTION_VECTORS: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

function positionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

function isDirection(value: unknown): value is Direction {
  return value === "up" || value === "down" || value === "left" || value === "right";
}

function isCollision(value: unknown): value is Collision {
  return value === "wall" || value === "obstacle" || value === "self";
}

function isPosition(value: unknown): value is Position {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const position = value as Partial<Position>;
  return Number.isInteger(position.x) && Number.isInteger(position.y);
}

export function positionsEqual(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

export function isWithinBounds(position: Position, config: GameConfig): boolean {
  return (
    position.x >= 0 &&
    position.x < config.gridWidth &&
    position.y >= 0 &&
    position.y < config.gridHeight
  );
}

export function isOppositeDirection(a: Direction, b: Direction): boolean {
  return (
    (a === "up" && b === "down") ||
    (a === "down" && b === "up") ||
    (a === "left" && b === "right") ||
    (a === "right" && b === "left")
  );
}

export function movePosition(position: Position, direction: Direction): Position {
  const vector = DIRECTION_VECTORS[direction];
  return { x: position.x + vector.x, y: position.y + vector.y };
}

/** Prebacuje zmiju na suprotnu stranu ako dodirne ivicu (prolazak kroz zid) */
export function wrapPosition(position: Position, config: GameConfig): Position {
  let x = position.x % config.gridWidth;
  let y = position.y % config.gridHeight;
  if (x < 0) x += config.gridWidth;
  if (y < 0) y += config.gridHeight;
  return { x, y };
}

export function detectCollision(
  nextHead: Position,
  snake: Position[],
  obstacles: Position[],
  config: GameConfig,
  tailWillMove: boolean,
): Collision | null {
  // Zid više ne ubija zmiju već ona prolazi kroz njega (wrapPosition)
  if (obstacles.some((obstacle) => positionsEqual(nextHead, obstacle))) {
    return "obstacle";
  }

  const snakeToCheck = tailWillMove ? snake.slice(0, -1) : snake;
  if (snakeToCheck.some((segment) => positionsEqual(nextHead, segment))) {
    return "self";
  }

  return null;
}

export function requestDirection(state: GameState, direction: Direction): GameState {
  if (state.status !== "running" || isOppositeDirection(state.direction, direction)) {
    return state;
  }

  return { ...state, queuedDirection: direction };
}

export function togglePause(state: GameState): GameState {
  if (state.status === "running") {
    return { ...state, status: "paused" };
  }
  if (state.status === "paused") {
    return { ...state, status: "running" };
  }
  return state;
}

function listFreePositions(
  config: GameConfig,
  snake: Position[],
  obstacles: Position[],
  extraOccupied: (Position | null)[] = [],
): Position[] {
  const occupiedList = [
    ...snake.map(positionKey),
    ...obstacles.map(positionKey),
    ...extraOccupied.filter((p): p is Position => p !== null).map(positionKey),
  ];
  const occupied = new Set(occupiedList);
  const freePositions: Position[] = [];

  for (let y = 0; y < config.gridHeight; y += 1) {
    for (let x = 0; x < config.gridWidth; x += 1) {
      const position = { x, y };
      if (!occupied.has(positionKey(position))) {
        freePositions.push(position);
      }
    }
  }

  return freePositions;
}

function pickRandomIndex(length: number, random: () => number): number {
  const value = random();
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(length - 1, Math.floor(value * length)));
}

export function findFreePosition(
  config: GameConfig,
  snake: Position[],
  obstacles: Position[],
  extraOccupied: (Position | null)[] = [],
  random: () => number = Math.random,
): Position | null {
  const freePositions = listFreePositions(config, snake, obstacles, extraOccupied);

  if (freePositions.length === 0) {
    return null;
  }

  return freePositions[pickRandomIndex(freePositions.length, random)];
}

function createStartingSnake(config: GameConfig): Position[] {
  const headX = Math.floor(config.gridWidth / 2);
  const headY = Math.floor(config.gridHeight / 2);

  return [
    { x: headX, y: headY },
    { x: headX - 1, y: headY },
    { x: headX - 2, y: headY },
  ];
}

function createObstacles(
  config: GameConfig,
  snake: Position[],
  random: () => number,
): Position[] {
  const availablePositions = listFreePositions(config, snake, []);
  if (config.obstacleCount > availablePositions.length) {
    throw new Error("Nema dovoljno slobodnih polja za prepreke.");
  }

  const obstacles: Position[] = [];

  for (let index = 0; index < config.obstacleCount; index += 1) {
    const positionIndex = pickRandomIndex(availablePositions.length, random);
    const [nextObstacle] = availablePositions.splice(positionIndex, 1);
    obstacles.push(nextObstacle);
  }

  return obstacles;
}

export function createInitialGameState(
  config: GameConfig,
  random: () => number = Math.random,
): GameState {
  const configResult = validateGameConfig(config);
  if (!configResult.ok) {
    throw new Error(`Nevalidan GameConfig: ${configResult.errors.join("; ")}`);
  }

  const snake = createStartingSnake(configResult.config);
  const obstacles = createObstacles(configResult.config, snake, random);
  const food = findFreePosition(configResult.config, snake, obstacles, [], random);

  if (!food) {
    throw new Error("Nema slobodnog polja za početnu hranu.");
  }

  return {
    config: configResult.config,
    snake,
    direction: "right",
    queuedDirection: "right",
    food,
    goldenFood: null,
    goldenFoodTimer: 0,
    obstacles,
    score: 0,
    status: "running",
    collision: null,
  };
}

export function advanceGame(
  state: GameState,
  random: () => number = Math.random,
): GameState {
  if (state.status !== "running") {
    return state;
  }

  const movedHead = movePosition(state.snake[0], state.queuedDirection);
  const nextHead = wrapPosition(movedHead, state.config); // Teleportacija pri prelazu ivice

  const eatsFood = state.food !== null && positionsEqual(nextHead, state.food);
  const eatsGolden = state.goldenFood !== null && positionsEqual(nextHead, state.goldenFood);

  const collision = detectCollision(
    nextHead,
    state.snake,
    state.obstacles,
    state.config,
    !(eatsFood || eatsGolden),
  );

  if (collision) {
    return {
      ...state,
      direction: state.queuedDirection,
      status: "game-over",
      collision,
    };
  }

  const snake = (eatsFood || eatsGolden)
    ? [nextHead, ...state.snake]
    : [nextHead, ...state.snake.slice(0, -1)];

  let score = state.score;
  let food = state.food;
  let goldenFood = state.goldenFood;
  let goldenFoodTimer = state.goldenFoodTimer;

  if (eatsFood) {
    score += FOOD_SCORE;
    food = findFreePosition(state.config, snake, state.obstacles, [goldenFood], random);

    // 25% šanse da se stvori zlatna hrana
    if (!goldenFood && random() < 0.25) {
      goldenFood = findFreePosition(state.config, snake, state.obstacles, [food], random);
      goldenFoodTimer = GOLDEN_FOOD_DURATION;
    }
  }

  if (eatsGolden) {
    score += GOLDEN_FOOD_SCORE;
    goldenFood = null;
    goldenFoodTimer = 0;
  } else if (goldenFood) {
    goldenFoodTimer -= 1;
    if (goldenFoodTimer <= 0) {
      goldenFood = null;
      goldenFoodTimer = 0;
    }
  }

  return {
    ...state,
    snake,
    direction: state.queuedDirection,
    queuedDirection: state.queuedDirection,
    food,
    goldenFood,
    goldenFoodTimer,
    score,
  };
}

export function validateGameState(input: unknown): GameStateValidationResult {
  const errors: string[] = [];

  if (typeof input !== "object" || input === null) {
    return { ok: false, errors: ["stanje igre mora biti objekat"] };
  }

  const state = input as Partial<GameState>;
  const configResult = validateGameConfig(state.config);
  if (!configResult.ok) {
    errors.push(...configResult.errors.map((error) => `config: ${error}`));
  }

  if (!Array.isArray(state.snake) || state.snake.length === 0) {
    errors.push("snake mora biti neprazan niz pozicija");
  }
  if (!Array.isArray(state.obstacles)) {
    errors.push("obstacles mora biti niz pozicija");
  }
  if (!isDirection(state.direction)) {
    errors.push("direction mora biti važeći pravac");
  }
  if (!isDirection(state.queuedDirection)) {
    errors.push("queuedDirection mora biti važeći pravac");
  }
  if (
    isDirection(state.direction) &&
    isDirection(state.queuedDirection) &&
    isOppositeDirection(state.direction, state.queuedDirection)
  ) {
    errors.push("queuedDirection ne sme biti direktan obrt od 180 stepeni");
  }
  if (state.status !== "running" && state.status !== "paused" && state.status !== "game-over") {
    errors.push("status mora biti running, paused ili game-over");
  }
  if (
    typeof state.score !== "number" ||
    !Number.isInteger(state.score) ||
    state.score < 0 ||
    state.score % FOOD_SCORE !== 0
  ) {
    errors.push(`score mora biti nenegativan ceo umnožak od ${FOOD_SCORE}`);
  }
  if (state.collision !== null && !isCollision(state.collision)) {
    errors.push("collision mora biti null, wall, obstacle ili self");
  }
  if ((state.status === "running" || state.status === "paused") && state.collision !== null) {
    errors.push("aktivna ili pauzirana partija ne sme imati collision");
  }
  if (state.status === "game-over" && !isCollision(state.collision)) {
    errors.push("završena partija mora imati collision");
  }

  if (!configResult.ok || !Array.isArray(state.snake) || !Array.isArray(state.obstacles)) {
    return { ok: false, errors };
  }

  return { ok: true, state: state as GameState };
}