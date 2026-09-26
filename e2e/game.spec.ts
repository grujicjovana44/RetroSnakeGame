import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  // Fixed randomness keeps obstacle placement repeatable in browser scenarios.
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto("/");
});

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
