import {
  advanceGame,
  createInitialGameState,
  type Direction,
  type GameState,
  type Position,
  requestDirection,
  togglePause,
  validateGameState,
} from "./game";
import {
  defaultGameConfig,
  type Difficulty,
  type GameConfig,
  resolveStartingSpeedMs,
  validateGameConfig,
} from "./types";

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
const scoreEl = document.getElementById("score");
const statusEl = document.getElementById("status");
const restartButton = document.getElementById("restart") as HTMLButtonElement | null;
const difficultyButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-difficulty]"),
);

const KEY_TO_DIRECTION: Record<string, Direction> = {
  arrowup: "up",
  w: "up",
  arrowdown: "down",
  s: "down",
  arrowleft: "left",
  a: "left",
  arrowright: "right",
  d: "right",
};

const COLLISION_LABELS = {
  wall: "sudar sa zidom",
  obstacle: "sudar sa preprekom",
  self: "sudar sa sopstvenim repom",
};

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Sporo",
  normal: "Normalno",
  hard: "Brzo",
};

function isDifficulty(value: string | undefined): value is Difficulty {
  return value === "easy" || value === "normal" || value === "hard";
}

function getHighScore(): number {
  try {
    const saved = localStorage.getItem("snake_highscore");
    return saved ? parseInt(saved, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

function saveHighScore(score: number): void {
  try {
    if (score > getHighScore()) {
      localStorage.setItem("snake_highscore", String(score));
    }
  } catch {
    // Sprečava greške u okruženjima bez pristupa localStorage
  }
}

function boot(): void {
  const configResult = validateGameConfig(defaultGameConfig);
  if (!configResult.ok) {
    if (statusEl) statusEl.textContent = "Status: nevalidan config";
    console.error("GameConfig validation failed:", configResult.errors);
    return;
  }

  if (!canvas) {
    console.error("Canvas #game nije pronađen u DOM-u.");
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error("2D context nije dostupan.");
    return;
  }

  const gameCanvas = canvas;
  const gameContext = ctx;
  let state: GameState;
  let pendingConfig: GameConfig = configResult.config;
  let timerId: number | undefined;

  function stopLoop(): void {
    if (timerId !== undefined) {
      window.clearInterval(timerId);
      timerId = undefined;
    }
  }

  function applyState(candidate: GameState): boolean {
    const stateResult = validateGameState(candidate);
    if (!stateResult.ok) {
      stopLoop();
      if (statusEl) statusEl.textContent = "Status: nevalidno stanje igre";
      console.error("GameState validation failed:", stateResult.errors);
      return false;
    }

    state = stateResult.state;
    if (state.score > getHighScore()) {
      saveHighScore(state.score);
    }
    return true;
  }

  function drawCell(position: Position, color: string, inset = 1): void {
    const cellWidth = gameCanvas.width / state.config.gridWidth;
    const cellHeight = gameCanvas.height / state.config.gridHeight;
    gameContext.fillStyle = color;
    gameContext.fillRect(
      position.x * cellWidth + inset,
      position.y * cellHeight + inset,
      cellWidth - inset * 2,
      cellHeight - inset * 2,
    );
  }

  function drawSnakeHead(position: Position, direction: Direction): void {
    const cellWidth = gameCanvas.width / state.config.gridWidth;
    const cellHeight = gameCanvas.height / state.config.gridHeight;

    drawCell(position, "#8fd694", 1);

    const headX = position.x * cellWidth;
    const headY = position.y * cellHeight;
    const eyeRadius = Math.max(1.5, Math.min(cellWidth, cellHeight) * 0.12);

    let eye1X = 0;
    let eye1Y = 0;
    let eye2X = 0;
    let eye2Y = 0;

    switch (direction) {
      case "up":
        eye1X = headX + cellWidth * 0.3;
        eye1Y = headY + cellHeight * 0.3;
        eye2X = headX + cellWidth * 0.7;
        eye2Y = headY + cellHeight * 0.3;
        break;
      case "down":
        eye1X = headX + cellWidth * 0.3;
        eye1Y = headY + cellHeight * 0.7;
        eye2X = headX + cellWidth * 0.7;
        eye2Y = headY + cellHeight * 0.7;
        break;
      case "left":
        eye1X = headX + cellWidth * 0.3;
        eye1Y = headY + cellHeight * 0.3;
        eye2X = headX + cellWidth * 0.3;
        eye2Y = headY + cellHeight * 0.7;
        break;
      case "right":
        eye1X = headX + cellWidth * 0.7;
        eye1Y = headY + cellHeight * 0.3;
        eye2X = headX + cellWidth * 0.7;
        eye2Y = headY + cellHeight * 0.7;
        break;
    }

    gameContext.fillStyle = "#111417";
    gameContext.beginPath();
    gameContext.arc(eye1X, eye1Y, eyeRadius, 0, Math.PI * 2);
    gameContext.arc(eye2X, eye2Y, eyeRadius, 0, Math.PI * 2);
    gameContext.fill();
  }

  function drawFood(position: Position, isGolden = false): void {
    const cellWidth = gameCanvas.width / state.config.gridWidth;
    const cellHeight = gameCanvas.height / state.config.gridHeight;
    const size = Math.min(cellWidth, cellHeight) * 0.76;
    const x = position.x * cellWidth + (cellWidth - size) / 2;
    const y = position.y * cellHeight + (cellHeight - size) / 2;
    const coreSize = size * 0.36;

    const mainColor = isGolden ? "#ffd700" : "#ff4f8b";
    const coreColor = isGolden ? "#ffffff" : "#fff3bf";

    gameContext.save();
    gameContext.shadowBlur = isGolden ? 18 : 14;
    gameContext.shadowColor = mainColor;
    gameContext.fillStyle = mainColor;
    gameContext.fillRect(x, y, size, size);
    gameContext.shadowBlur = 0;
    gameContext.fillStyle = coreColor;
    gameContext.fillRect(
      x + (size - coreSize) / 2,
      y + (size - coreSize) / 2,
      coreSize,
      coreSize,
    );
    gameContext.restore();
  }

  function updateDifficultyControls(): void {
    for (const button of difficultyButtons) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.difficulty === pendingConfig.difficulty),
      );
    }
  }

  function difficultySummary(config: GameConfig): string {
    return `${DIFFICULTY_LABELS[config.difficulty]} (${resolveStartingSpeedMs(config)} ms)`;
  }

  function render(): void {
    const cellWidth = gameCanvas.width / state.config.gridWidth;
    const cellHeight = gameCanvas.height / state.config.gridHeight;

    gameContext.fillStyle = "#111417";
    gameContext.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

    gameContext.strokeStyle = "#20262d";
    gameContext.lineWidth = 1;
    for (let x = 0; x <= state.config.gridWidth; x += 1) {
      gameContext.beginPath();
      gameContext.moveTo(x * cellWidth, 0);
      gameContext.lineTo(x * cellWidth, gameCanvas.height);
      gameContext.stroke();
    }
    for (let y = 0; y <= state.config.gridHeight; y += 1) {
      gameContext.beginPath();
      gameContext.moveTo(0, y * cellHeight);
      gameContext.lineTo(gameCanvas.width, y * cellHeight);
      gameContext.stroke();
    }

    for (const obstacle of state.obstacles) {
      drawCell(obstacle, "#bd5b5b", 2);
    }
    if (state.food) {
      drawFood(state.food, false);
    }
    if (state.goldenFood) {
      drawFood(state.goldenFood, true);
    }

    state.snake.forEach((segment, index) => {
      if (index === 0) {
        drawSnakeHead(segment, state.direction);
      } else {
        drawCell(segment, "#4e9d67", 2);
      }
    });

    if (scoreEl) {
      scoreEl.textContent = `Skor: ${state.score} | Najbolji: ${getHighScore()}`;
    }

    if (state.status === "running") {
      if (statusEl) {
        statusEl.textContent = `Status: igraš — ${difficultySummary(state.config)} | 'P' za pauzu`;
      }
      if (restartButton) restartButton.hidden = true;
      return;
    }

    if (state.status === "paused") {
      gameContext.fillStyle = "rgba(13, 15, 18, 0.75)";
      gameContext.fillRect(0, 0, gameCanvas.width, gameCanvas.height);
      gameContext.fillStyle = "#8fd694";
      gameContext.font = "bold 28px monospace";
      gameContext.textAlign = "center";
      gameContext.fillText("PAUZIRANO", gameCanvas.width / 2, gameCanvas.height / 2);
      gameContext.fillStyle = "#e6e6e6";
      gameContext.font = "16px monospace";
      gameContext.fillText("Pritisni 'P' ili Esc za nastavak", gameCanvas.width / 2, gameCanvas.height / 2 + 36);
      gameContext.textAlign = "start";

      if (statusEl) statusEl.textContent = "Status: pauzirano";
      return;
    }

    // Status: game-over
    gameContext.fillStyle = "rgba(13, 15, 18, 0.88)";
    gameContext.fillRect(0, 0, gameCanvas.width, gameCanvas.height);
    gameContext.fillStyle = "#f3c969";
    gameContext.font = "bold 26px monospace";
    gameContext.textAlign = "center";
    gameContext.fillText("GAME OVER", gameCanvas.width / 2, gameCanvas.height / 2 - 28);
    gameContext.fillStyle = "#e6e6e6";
    gameContext.font = "16px monospace";
    gameContext.fillText(`Finalni skor: ${state.score}`, gameCanvas.width / 2, gameCanvas.height / 2 + 6);
    gameContext.fillText(`Najbolji skor: ${getHighScore()}`, gameCanvas.width / 2, gameCanvas.height / 2 + 30);
    gameContext.fillText("Space ili dugme za restart", gameCanvas.width / 2, gameCanvas.height / 2 + 58);
    gameContext.textAlign = "start";

    if (statusEl && state.collision) {
      statusEl.textContent = `Status: game over — ${COLLISION_LABELS[state.collision]}; sledeća brzina: ${difficultySummary(pendingConfig)}`;
    }
    if (restartButton) restartButton.hidden = false;
  }

  function tick(): void {
    if (state.status !== "running") {
      return;
    }

    const nextState = advanceGame(state);
    if (!applyState(nextState)) {
      return;
    }

    render();
    if (nextState.status === "game-over") {
      stopLoop();
    }
  }

  function restart(): void {
    stopLoop();
    const nextState = createInitialGameState(pendingConfig);
    if (!applyState(nextState)) {
      return;
    }

    render();
    timerId = window.setInterval(tick, resolveStartingSpeedMs(pendingConfig));
  }

  function selectDifficulty(difficulty: Difficulty): void {
    const obstacleMap: Record<Difficulty, number> = {
      easy: 30,
      normal: 70,
      hard: 90,
    };

    const configResult = validateGameConfig({
      ...pendingConfig,
      difficulty,
      obstacleCount: obstacleMap[difficulty],
    });

    if (!configResult.ok) {
      if (statusEl) statusEl.textContent = "Status: nevalidan izbor brzine";
      console.error("GameConfig validation failed:", configResult.errors);
      return;
    }

    pendingConfig = configResult.config;
    updateDifficultyControls();
    render();
  }

  document.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      event.preventDefault();
      if (state.status === "game-over") {
        restart();
      }
      return;
    }

    if (event.code === "KeyP" || event.code === "Escape") {
      event.preventDefault();
      if (state.status === "running" || state.status === "paused") {
        applyState(togglePause(state));
        render();
      }
      return;
    }

    const direction = KEY_TO_DIRECTION[event.key.toLowerCase()];
    if (direction) {
      event.preventDefault();
      applyState(requestDirection(state, direction));
    }
  });

  for (const button of difficultyButtons) {
    button.addEventListener("click", () => {
      const difficulty = button.dataset.difficulty;
      if (isDifficulty(difficulty)) {
        selectDifficulty(difficulty);
      }
    });
  }

  restartButton?.addEventListener("click", restart);
  updateDifficultyControls();
  restart();
}

boot();