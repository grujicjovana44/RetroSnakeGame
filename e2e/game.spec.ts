import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  // Fixed randomness keeps obstacle placement repeatable in browser scenarios.
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto("/");
});

async function triggerGameOver(page: import("@playwright/test").Page): Promise<void> {
  await page.keyboard.press("ArrowUp");
  await page.clock.runFor(15 * 150);
  await expect(page.locator("#status")).toContainText("game over");
}

test("renders the game canvas and score HUD", async ({ page }) => {
  await expect(page).toHaveTitle("RetroSnake: Prepreke");
  await expect(page.locator("#game")).toBeVisible();
  await expect(page.locator("#score")).toContainText("Skor: 0");
  await expect(page.locator("#status")).toContainText("Status: igraš");
});

test("selects the difficulty for the next game", async ({ page }) => {
  const hardButton = page.getByRole("button", { name: "Brzo" });

  await hardButton.click();

  await expect(hardButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Normalno" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("pauses and resumes with keyboard controls", async ({ page }) => {
  await page.keyboard.press("p");
  await expect(page.locator("#status")).toHaveText("Status: pauzirano");

  await page.keyboard.press("Escape");
  await expect(page.locator("#status")).toContainText("Status: igraš");
});

test("shows Game Over after collision and restarts without reloading", async ({ page }) => {
  await page.keyboard.press("ArrowUp");
  await page.clock.runFor(15 * 150);
  await expect(page.locator("#status")).toContainText("game over", {
    timeout: 7_000,
  });

  const restartButton = page.getByRole("button", { name: "Restartuj partiju" });
  await expect(restartButton).toBeVisible();
  await restartButton.click();

  await expect(page.locator("#status")).toContainText("Status: igraš");
  await expect(restartButton).toBeHidden();
});

test("requests and renders AI advice after game over", async ({ page }) => {
  let sessionPayload: unknown;
  let advicePayload: unknown;
  let sessionRequests = 0;
  let adviceRequests = 0;

  await page.route("**/api/game/session", async (route) => {
    sessionRequests += 1;
    sessionPayload = route.request().postDataJSON();
    await route.fulfill({ json: { sessionId: "e2e-session-id" } });
  });
  await page.route("**/api/ai/advice", async (route) => {
    adviceRequests += 1;
    advicePayload = route.request().postDataJSON();
    await route.fulfill({
      json: {
        success: true,
        advice: {
          summary: "Partija je završena posle sudara.",
          recommendation: "Planiraj sledeći pravac pre nego što uzmeš hranu.",
          category: "strategy",
        },
      },
    });
  });

  await page.keyboard.press("ArrowUp");
  await page.clock.runFor(15 * 150);
  await expect(page.locator("#status")).toContainText("game over");
  await page.getByRole("button", { name: "AI Advice" }).click();

  await expect(page.locator("#ai-advice-summary")).toHaveText(
    "Partija je završena posle sudara.",
  );
  await expect(page.locator("#ai-advice-recommendation")).toHaveText(
    "Planiraj sledeći pravac pre nego što uzmeš hranu.",
  );
  expect(sessionPayload).toEqual(expect.objectContaining({
    score: expect.any(Number),
    durationSeconds: expect.any(Number),
    collisions: 1,
    foodCollected: expect.any(Number),
  }));
  expect(advicePayload).toEqual({ sessionId: "e2e-session-id" });
  expect(sessionRequests).toBe(1);
  expect(adviceRequests).toBe(1);
});

test("excludes pause and game-over wait from submitted session duration", async ({ page }) => {
  let sessionPayload: { durationSeconds: number } | undefined;
  await page.route("**/api/game/session", async (route) => {
    sessionPayload = route.request().postDataJSON() as { durationSeconds: number };
    await route.fulfill({ json: { sessionId: "duration-e2e-session" } });
  });
  await page.route("**/api/ai/advice", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        advice: { summary: "Gotovo.", recommendation: "Nastavi.", category: "strategy" },
      },
    });
  });

  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("p");
  await page.clock.runFor(5_000);
  await page.keyboard.press("Escape");
  await page.clock.runFor(15 * 150);
  await expect(page.locator("#status")).toContainText("game over");
  await page.clock.runFor(5_000);
  await page.getByRole("button", { name: "AI Advice" }).click();
  await expect(page.locator("#ai-advice-summary")).toHaveText("Gotovo.");

  expect(sessionPayload?.durationSeconds).toBe(2);
});

test("shows fixed Practice Plan goal controls only after Game Over", async ({ page }) => {
  const controls = page.locator("#practice-plan-controls");
  const button = page.getByRole("button", { name: "Practice Plan" });

  await expect(controls).toBeHidden();
  await expect(button).toBeHidden();
  await triggerGameOver(page);

  await expect(controls).toBeVisible();
  await expect(button).toBeVisible();
  await expect(page.locator("#practice-goal option")).toHaveCount(2);
  await expect(page.locator("#practice-goal option").nth(0)).toHaveAttribute("value", "survive_longer");
  await expect(page.locator("#practice-goal option").nth(1)).toHaveAttribute("value", "collect_more_food");
  await expect(page.locator("#practice-goal option").nth(0)).toHaveText("Preživi duže");
  await expect(page.locator("#practice-goal option").nth(1)).toHaveText("Sakupi više hrane");
});

test("sends both fixed goals with the shared session and renders fields/evaluation metrics", async ({ page }) => {
  const requests: unknown[] = [];
  let sessionRequests = 0;
  await page.route("**/api/game/session", async (route) => {
    sessionRequests += 1;
    await route.fulfill({ json: { sessionId: "practice-e2e-session" } });
  });
  await page.route("**/api/ai/practice-plan", async (route) => {
    const payload = route.request().postDataJSON() as { sessionId: string; goal: string };
    requests.push(payload);
    const isSurvival = payload.goal === "survive_longer";
    const targetValue = isSurvival ? 62 : 15;
    await route.fulfill({
      json: {
        success: true,
        plan: {
          goal: payload.goal,
          targetValue,
          summary: "Validated practice summary.",
          recommendation: "Validated practice recommendation.",
          evidence: [{ source: "evaluate_practice_goal", field: "evaluation.rating", value: "realistic", finding: "validated" }],
          confidence: "medium",
          completed: true,
        },
        evaluation: {
          tool: "evaluate_practice_goal",
          goal: payload.goal,
          targetValue,
          goalBaseline: isSurvival ? 50 : 10,
          rating: "realistic",
          metrics: {
            score: 777,
            durationSeconds: 45,
            foodCollected: 10,
            foodPerMinute: 13.33,
            scorePerFood: 77.7,
            targetRatio: isSurvival ? 1.24 : 1.5,
          },
          evidence: [],
        },
      },
    });
  });

  await triggerGameOver(page);
  const goal = page.locator("#practice-goal");
  const button = page.getByRole("button", { name: "Practice Plan" });

  await goal.selectOption("survive_longer");
  await button.click();
  await expect(page.locator("#practice-plan-status")).toHaveText("Practice Plan je spreman.");
  await expect(page.locator("#practice-plan-target")).toContainText("62 s");
  await expect(page.locator("#practice-plan-summary")).toHaveText("Validated practice summary.");
  await expect(page.locator("#practice-plan-recommendation")).toHaveText("Validated practice recommendation.");
  await expect(page.locator("#practice-plan-score")).toHaveText("777");
  await expect(page.locator("#practice-plan-food-rate")).toHaveText("13.33");
  await expect(page.locator("#practice-plan-target-ratio")).toHaveText("1.24");

  await goal.selectOption("collect_more_food");
  await button.click();
  await expect(page.locator("#practice-plan-target")).toContainText("15 kom.");
  await expect(page.locator("#practice-plan-target-ratio")).toHaveText("1.5");
  expect(requests).toEqual([
    { sessionId: "practice-e2e-session", goal: "survive_longer" },
    { sessionId: "practice-e2e-session", goal: "collect_more_food" },
  ]);
  expect(sessionRequests).toBe(1);
});

test("disables Practice Plan while loading and prevents duplicate sends", async ({ page }) => {
  let requestCount = 0;
  let releaseResponse: (() => void) | undefined;
  await page.route("**/api/game/session", async (route) => {
    await route.fulfill({ json: { sessionId: "loading-e2e-session" } });
  });
  await page.route("**/api/ai/practice-plan", async (route) => {
    requestCount += 1;
    await new Promise<void>((resolve) => { releaseResponse = resolve; });
    await route.fulfill({
      json: {
        success: true,
        plan: { goal: "survive_longer", targetValue: 51, summary: "Ready.", recommendation: "Try it.", evidence: [], confidence: "medium", completed: true },
        evaluation: {
          tool: "evaluate_practice_goal",
          goal: "survive_longer",
          targetValue: 51,
          goalBaseline: 50,
          rating: "realistic",
          metrics: { score: 10, durationSeconds: 50, foodCollected: 1, foodPerMinute: 1.2, scorePerFood: 10, targetRatio: 1.02 },
          evidence: [],
        },
      },
    });
  });

  await triggerGameOver(page);
  const button = page.getByRole("button", { name: "Practice Plan" });
  await button.click();
  await expect(page.locator("#practice-plan-status")).toHaveText("AI analiza u toku...");
  await expect(button).toBeDisabled();
  await button.click({ force: true });
  await expect.poll(() => requestCount).toBe(1);
  expect(requestCount).toBe(1);
  releaseResponse?.();
  await expect(page.locator("#practice-plan-status")).toHaveText("Practice Plan je spreman.");
  await expect(button).toBeEnabled();
});

test("renders realistic and non-realistic incomplete results without model prose", async ({ page }) => {
  const incompleteRequests: string[] = [];
  await page.route("**/api/game/session", async (route) => {
    await route.fulfill({ json: { sessionId: "incomplete-e2e-session" } });
  });
  await page.route("**/api/ai/practice-plan", async (route) => {
    const { goal } = route.request().postDataJSON() as { goal: string };
    incompleteRequests.push(goal);
    const realistic = goal === "survive_longer";
    await route.fulfill({
      json: {
        success: true,
        plan: {
          goal,
          targetValue: realistic ? 51 : 100,
          summary: "PRIVATE_MODEL_SUMMARY_SENTINEL",
          recommendation: "PRIVATE_MODEL_RECOMMENDATION_SENTINEL",
          evidence: [],
          confidence: "low",
          completed: false,
        },
        evaluation: {
          tool: "evaluate_practice_goal",
          goal,
          targetValue: realistic ? 51 : 100,
          goalBaseline: 50,
          rating: realistic ? "realistic" : "too_ambitious",
          metrics: { score: 321, durationSeconds: 50, foodCollected: 5, foodPerMinute: 6, scorePerFood: 64.2, targetRatio: realistic ? 1.02 : 2 },
          evidence: [],
        },
        incompleteMessage: realistic
          ? "Cilj je ocenjen kao realističan, ali plan nije dovršen. Možeš koristiti prikazani cilj za sledeću partiju."
          : "Cilj nije preporučen: alat ga je ocenio kao prelak ili preambiciozan.",
      },
    });
  });

  await triggerGameOver(page);
  const button = page.getByRole("button", { name: "Practice Plan" });
  const status = page.locator("#practice-plan-status");
  await page.locator("#practice-goal").selectOption("survive_longer");
  await button.click();
  await expect(status).toHaveText("Cilj je ocenjen kao realističan, ali plan nije dovršen. Možeš koristiti prikazani cilj za sledeću partiju.");
  await expect(status).not.toContainText("nije preporučen");
  await expect(page.locator("#practice-plan-score")).toHaveText("321");
  await expect(page.locator("#practice-plan-summary")).toBeEmpty();
  await expect(page.locator("#practice-plan-recommendation")).toBeEmpty();

  await page.locator("#practice-goal").selectOption("collect_more_food");
  await button.click();
  await expect(status).toHaveText("Cilj nije preporučen: alat ga je ocenio kao prelak ili preambiciozan.");
  await expect(page.locator("#practice-plan-score")).toHaveText("321");
  await expect(page.locator("#practice-plan-summary")).toBeEmpty();
  await expect(page.locator("#practice-plan-recommendation")).toBeEmpty();
  await expect(page.locator("#practice-plan-panel")).not.toContainText("PRIVATE_MODEL_");
  expect(incompleteRequests).toEqual(["survive_longer", "collect_more_food"]);
});

test("renders unavailable goals without metrics and errors with fixed safe text", async ({ page }) => {
  let mode: "unavailable" | "error" = "unavailable";
  await page.route("**/api/game/session", async (route) => {
    await route.fulfill({ json: { sessionId: "result-state-e2e-session" } });
  });
  await page.route("**/api/ai/practice-plan", async (route) => {
    if (mode === "error") {
      await route.fulfill({ status: 502, json: { success: false, message: "provider secret must not render" } });
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        plan: {
          goal: "survive_longer",
          targetValue: null,
          summary: "Za izabrani cilj trenutno nema višeg dostižnog praga.",
          recommendation: "Odigrati novu partiju ili izabrati drugi cilj.",
          evidence: [],
          confidence: "low",
          completed: false,
        },
        evaluation: null,
      },
    });
  });

  await triggerGameOver(page);
  const button = page.getByRole("button", { name: "Practice Plan" });
  await button.click();
  await expect(page.locator("#practice-plan-summary")).toHaveText("Za izabrani cilj trenutno nema višeg dostižnog praga.");
  await expect(page.locator("#practice-plan-recommendation")).toHaveText("Odigrati novu partiju ili izabrati drugi cilj.");
  await expect(page.locator("#practice-plan-metrics")).toBeHidden();

  mode = "error";
  await button.click();
  await expect(page.locator("#practice-plan-status")).toHaveText("Plan trenutno nije moguće napraviti bezbedno. Pokušajte ponovo kasnije.");
  await expect(page.locator("#practice-plan-panel")).not.toContainText("provider secret");
});

test("saves a new High Score and restores it after refresh", async ({ page }) => {
  await page.keyboard.press("ArrowUp");
  await page.clock.runFor(13 * 150);
  await page.keyboard.press("ArrowLeft");
  await page.clock.runFor(5 * 150);

  await expect(page.locator("#score")).toContainText("Skor: 10");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("snake_highscore")))
    .toBe("10");

  await page.reload();

  await expect(page.locator("#score")).toContainText("Najbolji: 10");
});
