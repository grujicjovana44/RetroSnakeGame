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
import { getHighScore, saveHighScore } from "./highScore";

type PracticeGoal = "survive_longer" | "collect_more_food";
type PracticeEvaluation = {
  goal: PracticeGoal;
  targetValue: number;
  rating: "too_easy" | "realistic" | "too_ambitious";
  metrics: {
    score: number;
    durationSeconds: number;
    foodCollected: number;
    foodPerMinute: number | null;
    scorePerFood: number | null;
    targetRatio: number;
  };
};
type PracticePlanResult =
  | {
      success: true;
      plan: {
        goal: PracticeGoal;
        targetValue: number | null;
        summary: string;
        recommendation: string;
        completed: boolean;
        confidence: "low" | "medium" | "high";
      };
      evaluation: PracticeEvaluation | null;
      incompleteMessage?: string;
    }
  | { success: false };

const SAFE_PRACTICE_PLAN_ERROR =
  "Plan trenutno nije moguće napraviti bezbedno. Pokušajte ponovo kasnije.";
const REALISTIC_INCOMPLETE_MESSAGE =
  "Cilj je ocenjen kao realističan, ali plan nije dovršen. Možeš koristiti prikazani cilj za sledeću partiju.";
const NON_REALISTIC_INCOMPLETE_MESSAGE =
  "Cilj nije preporučen: alat ga je ocenio kao prelak ili preambiciozan.";

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
const scoreEl = document.getElementById("score");
const statusEl = document.getElementById("status");
const restartButton = document.getElementById("restart") as HTMLButtonElement | null;
const adviceButton = document.getElementById("ai-advice") as HTMLButtonElement | null;
const advicePanel = document.getElementById("ai-advice-panel");
const adviceSummaryEl = document.getElementById("ai-advice-summary");
const adviceRecommendationEl = document.getElementById("ai-advice-recommendation");
const practicePlanControls = document.getElementById("practice-plan-controls");
const practiceGoalSelect = document.getElementById("practice-goal") as HTMLSelectElement | null;
const practicePlanButton = document.getElementById("practice-plan-button") as HTMLButtonElement | null;
const practicePlanPanel = document.getElementById("practice-plan-panel");
const practicePlanStatusEl = document.getElementById("practice-plan-status");
const practicePlanTargetEl = document.getElementById("practice-plan-target");
const practicePlanSummaryEl = document.getElementById("practice-plan-summary");
const practicePlanRecommendationEl = document.getElementById("practice-plan-recommendation");
const practicePlanMetrics = document.getElementById("practice-plan-metrics");
const practicePlanRatingEl = document.getElementById("practice-plan-rating");
const practicePlanScoreEl = document.getElementById("practice-plan-score");
const practicePlanDurationEl = document.getElementById("practice-plan-duration");
const practicePlanFoodEl = document.getElementById("practice-plan-food");
const practicePlanFoodRateEl = document.getElementById("practice-plan-food-rate");
const practicePlanScoreRateEl = document.getElementById("practice-plan-score-rate");
const practicePlanTargetRatioEl = document.getElementById("practice-plan-target-ratio");
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

const BACKEND_URL = "http://127.0.0.1:3001";

function isDifficulty(value: string | undefined): value is Difficulty {
  return value === "easy" || value === "normal" || value === "hard";
}

function isPracticeGoal(value: unknown): value is PracticeGoal {
  return value === "survive_longer" || value === "collect_more_food";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parsePracticePlanResult(value: unknown): PracticePlanResult | null {
  if (!isRecord(value)) return null;
  if (value.success === false && typeof value.message === "string") {
    return { success: false };
  }
  if (value.success !== true || !isRecord(value.plan)) return null;

  const plan = value.plan;
  if (!isPracticeGoal(plan.goal) ||
      (plan.targetValue !== null && !isFiniteNumber(plan.targetValue)) ||
      typeof plan.summary !== "string" ||
      typeof plan.recommendation !== "string" ||
      typeof plan.completed !== "boolean" ||
      (plan.confidence !== "low" && plan.confidence !== "medium" && plan.confidence !== "high")) {
    return null;
  }

  if (value.evaluation === null) {
    if (plan.targetValue !== null || plan.completed ||
        plan.summary !== "Za izabrani cilj trenutno nema višeg dostižnog praga." ||
        plan.recommendation !== "Odigrati novu partiju ili izabrati drugi cilj.") {
      return null;
    }
    return {
      success: true,
      plan: {
        goal: plan.goal,
        targetValue: null,
        summary: plan.summary,
        recommendation: plan.recommendation,
        completed: false,
        confidence: plan.confidence,
      },
      evaluation: null,
    };
  }

  if (!isRecord(value.evaluation)) return null;
  const rawEvaluation = value.evaluation;
  if (rawEvaluation.tool !== "evaluate_practice_goal" ||
      !isPracticeGoal(rawEvaluation.goal) ||
      !isFiniteNumber(rawEvaluation.targetValue) ||
      !isFiniteNumber(rawEvaluation.goalBaseline) ||
      (rawEvaluation.rating !== "too_easy" &&
       rawEvaluation.rating !== "realistic" &&
       rawEvaluation.rating !== "too_ambitious") ||
      !isRecord(rawEvaluation.metrics)) {
    return null;
  }

  const metrics = rawEvaluation.metrics;
  if (!isFiniteNumber(metrics.score) ||
      !isFiniteNumber(metrics.durationSeconds) ||
      !isFiniteNumber(metrics.foodCollected) ||
      (metrics.foodPerMinute !== null && !isFiniteNumber(metrics.foodPerMinute)) ||
      (metrics.scorePerFood !== null && !isFiniteNumber(metrics.scorePerFood)) ||
      !isFiniteNumber(metrics.targetRatio)) {
    return null;
  }
  if (plan.goal !== rawEvaluation.goal || plan.targetValue !== rawEvaluation.targetValue) {
    return null;
  }

  let incompleteMessage: string | undefined;
  if (plan.completed) {
    if (rawEvaluation.rating !== "realistic") return null;
  } else {
    if (plan.confidence === "high" || typeof value.incompleteMessage !== "string") return null;
    incompleteMessage = rawEvaluation.rating === "realistic"
      ? REALISTIC_INCOMPLETE_MESSAGE
      : NON_REALISTIC_INCOMPLETE_MESSAGE;
    if (value.incompleteMessage !== incompleteMessage) return null;
  }

  return {
    success: true,
    plan: {
      goal: plan.goal,
      targetValue: plan.targetValue,
      summary: plan.summary,
      recommendation: plan.recommendation,
      completed: plan.completed,
      confidence: plan.confidence,
    },
    evaluation: {
      goal: rawEvaluation.goal,
      targetValue: rawEvaluation.targetValue,
      rating: rawEvaluation.rating,
      metrics: {
        score: metrics.score,
        durationSeconds: metrics.durationSeconds,
        foodCollected: metrics.foodCollected,
        foodPerMinute: metrics.foodPerMinute,
        scorePerFood: metrics.scorePerFood,
        targetRatio: metrics.targetRatio,
      },
    },
    incompleteMessage,
  };
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
  let gameStartedAt = Date.now();
  let gameEndedAt: number | null = null;
  let pausedAt: number | null = null;
  let pausedMs = 0;
  let foodCollected = 0;
  let gameSessionId: string | null = null;
  let gameSessionPromise: Promise<string> | null = null;
  let sessionGeneration = 0;
  let practicePlanRequestGeneration = 0;

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
      if (adviceButton) adviceButton.hidden = true;
      if (practicePlanControls) practicePlanControls.hidden = true;
      if (practicePlanPanel) practicePlanPanel.hidden = true;
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
      if (practicePlanControls) practicePlanControls.hidden = true;
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
    if (adviceButton) adviceButton.hidden = false;
    if (practicePlanControls) practicePlanControls.hidden = false;
  }

  function tick(): void {
    if (state.status !== "running") {
      return;
    }

    const nextState = advanceGame(state);
    if (nextState.score > state.score) {
      foodCollected += 1;
    }
    if (!applyState(nextState)) {
      return;
    }

    if (nextState.status === "game-over") {
      gameEndedAt = Date.now();
    }
    render();
    if (nextState.status === "game-over") {
      stopLoop();
    }
  }

  function restart(): void {
    stopLoop();
    gameStartedAt = Date.now();
    gameEndedAt = null;
    pausedAt = null;
    pausedMs = 0;
    foodCollected = 0;
    sessionGeneration += 1;
    practicePlanRequestGeneration += 1;
    gameSessionId = null;
    gameSessionPromise = null;
    if (adviceButton) adviceButton.hidden = true;
    if (practicePlanControls) practicePlanControls.hidden = true;
    if (advicePanel) advicePanel.hidden = true;
    if (practicePlanPanel) practicePlanPanel.hidden = true;
    if (practicePlanButton) practicePlanButton.disabled = false;
    const nextState = createInitialGameState(pendingConfig);
    if (!applyState(nextState)) {
      return;
    }

    render();
    timerId = window.setInterval(tick, resolveStartingSpeedMs(pendingConfig));
  }

  async function getOrCreateGameSessionId(): Promise<string> {
    if (gameSessionId) return gameSessionId;
    if (!gameSessionPromise) {
      const currentGeneration = sessionGeneration;
      gameSessionPromise = (async () => {
        const sessionResponse = await fetch(`${BACKEND_URL}/api/game/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            score: state.score,
            durationSeconds: Math.round(((gameEndedAt ?? Date.now()) - gameStartedAt - pausedMs) / 1000),
            collisions: state.collision ? 1 : 0,
            foodCollected,
          }),
        });
        if (!sessionResponse.ok) throw new Error("session-request-failed");
        const session = await sessionResponse.json() as { sessionId?: string };
        if (!session.sessionId || currentGeneration !== sessionGeneration) {
          throw new Error("missing-or-stale-session-id");
        }
        gameSessionId = session.sessionId;
        return gameSessionId;
      })().finally(() => {
        if (currentGeneration === sessionGeneration) gameSessionPromise = null;
      });
    }
    return gameSessionPromise;
  }

  async function requestAiAdvice(): Promise<void> {
    if (state.status !== "game-over" || !adviceButton || !advicePanel) {
      return;
    }

    adviceButton.disabled = true;
    adviceButton.textContent = "AI Advice se ucitava...";
    advicePanel.hidden = false;
    if (adviceSummaryEl) adviceSummaryEl.textContent = "Analiziram zavrsenu partiju...";
    if (adviceRecommendationEl) adviceRecommendationEl.textContent = "";

    try {
      const sessionId = await getOrCreateGameSessionId();

      const adviceResponse = await fetch(`${BACKEND_URL}/api/ai/advice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const result = (await adviceResponse.json()) as {
        success: boolean;
        advice?: { summary: string; recommendation: string; category: string };
        message?: string;
      };
      if (!adviceResponse.ok || !result.success || !result.advice) {
        throw new Error("advice-request-failed");
      }

      if (adviceSummaryEl) adviceSummaryEl.textContent = result.advice.summary;
      if (adviceRecommendationEl) adviceRecommendationEl.textContent = result.advice.recommendation;
    } catch {
      if (adviceSummaryEl) adviceSummaryEl.textContent = "AI savet trenutno nije dostupan.";
      if (adviceRecommendationEl) adviceRecommendationEl.textContent = "Pokusajte ponovo kasnije.";
    } finally {
      adviceButton.disabled = false;
      adviceButton.textContent = "AI Advice";
    }
  }

  function clearPracticePlanOutput(): void {
    if (practicePlanStatusEl) practicePlanStatusEl.textContent = "";
    if (practicePlanTargetEl) practicePlanTargetEl.textContent = "";
    if (practicePlanSummaryEl) practicePlanSummaryEl.textContent = "";
    if (practicePlanRecommendationEl) practicePlanRecommendationEl.textContent = "";
    if (practicePlanMetrics) practicePlanMetrics.hidden = true;
  }

  function renderPracticePlanMetrics(evaluation: PracticeEvaluation): void {
    const metrics = evaluation.metrics;
    if (practicePlanRatingEl) practicePlanRatingEl.textContent = evaluation.rating;
    if (practicePlanScoreEl) practicePlanScoreEl.textContent = String(metrics.score);
    if (practicePlanDurationEl) practicePlanDurationEl.textContent = `${metrics.durationSeconds} s`;
    if (practicePlanFoodEl) practicePlanFoodEl.textContent = String(metrics.foodCollected);
    if (practicePlanFoodRateEl) practicePlanFoodRateEl.textContent = metrics.foodPerMinute === null
      ? "Nije dostupno"
      : String(metrics.foodPerMinute);
    if (practicePlanScoreRateEl) practicePlanScoreRateEl.textContent = metrics.scorePerFood === null
      ? "Nije dostupno"
      : String(metrics.scorePerFood);
    if (practicePlanTargetRatioEl) practicePlanTargetRatioEl.textContent = String(metrics.targetRatio);
    if (practicePlanMetrics) practicePlanMetrics.hidden = false;
  }

  function practiceGoalLabel(goal: PracticeGoal): string {
    return goal === "survive_longer" ? "Preživi duže" : "Sakupi više hrane";
  }

  function renderPracticePlanResult(result: PracticePlanResult): void {
    clearPracticePlanOutput();
    if (!result.success) {
      if (practicePlanStatusEl) practicePlanStatusEl.textContent = SAFE_PRACTICE_PLAN_ERROR;
      return;
    }

    if (result.evaluation === null) {
      if (practicePlanStatusEl) practicePlanStatusEl.textContent = "Cilj trenutno nije dostupan.";
      if (practicePlanTargetEl) practicePlanTargetEl.textContent = "Ciljni prag nije dostupan.";
      if (practicePlanSummaryEl) practicePlanSummaryEl.textContent = result.plan.summary;
      if (practicePlanRecommendationEl) practicePlanRecommendationEl.textContent = result.plan.recommendation;
      return;
    }

    const evaluation = result.evaluation;
    const targetUnit = evaluation.goal === "survive_longer" ? "s" : "kom.";
    if (practicePlanTargetEl) {
      practicePlanTargetEl.textContent = `Cilj: ${practiceGoalLabel(result.plan.goal)}. Ciljni prag: ${result.plan.targetValue} ${targetUnit}.`;
    }
    if (result.plan.completed) {
      if (practicePlanStatusEl) practicePlanStatusEl.textContent = "Practice Plan je spreman.";
      if (practicePlanSummaryEl) practicePlanSummaryEl.textContent = result.plan.summary;
      if (practicePlanRecommendationEl) practicePlanRecommendationEl.textContent = result.plan.recommendation;
    } else if (practicePlanStatusEl) {
      practicePlanStatusEl.textContent = result.incompleteMessage ?? SAFE_PRACTICE_PLAN_ERROR;
    }
    renderPracticePlanMetrics(evaluation);
  }

  async function requestPracticePlan(): Promise<void> {
    if (state.status !== "game-over" ||
        !practicePlanButton ||
        !practicePlanPanel ||
        !practiceGoalSelect ||
        practicePlanButton.disabled) {
      return;
    }

    const goal = practiceGoalSelect.value;
    if (!isPracticeGoal(goal)) return;
    const requestGeneration = ++practicePlanRequestGeneration;
    practicePlanButton.disabled = true;
    practicePlanPanel.hidden = false;
    clearPracticePlanOutput();
    if (practicePlanStatusEl) practicePlanStatusEl.textContent = "AI analiza u toku...";

    try {
      const sessionId = await getOrCreateGameSessionId();
      if (requestGeneration !== practicePlanRequestGeneration || state.status !== "game-over") return;
      const response = await fetch(`${BACKEND_URL}/api/ai/practice-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, goal }),
      });
      const rawResult: unknown = await response.json();
      if (requestGeneration !== practicePlanRequestGeneration || state.status !== "game-over") return;
      const result = parsePracticePlanResult(rawResult);
      if (!response.ok || !result) {
        renderPracticePlanResult({ success: false });
        return;
      }
      renderPracticePlanResult(result);
    } catch {
      if (requestGeneration === practicePlanRequestGeneration) {
        renderPracticePlanResult({ success: false });
      }
    } finally {
      if (requestGeneration === practicePlanRequestGeneration) {
        practicePlanButton.disabled = false;
      }
    }
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
        const wasPaused = state.status === "paused";
        applyState(togglePause(state));
        if (wasPaused && state.status === "running" && pausedAt !== null) {
          pausedMs += Date.now() - pausedAt;
          pausedAt = null;
        } else if (!wasPaused && state.status === "paused") {
          pausedAt = Date.now();
        }
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
  adviceButton?.addEventListener("click", () => {
    void requestAiAdvice();
  });
  practicePlanButton?.addEventListener("click", () => {
    void requestPracticePlan();
  });
  updateDifficultyControls();
  restart();
}

boot();
