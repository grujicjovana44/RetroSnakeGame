/** Reads the saved record, safely handling disabled or unavailable storage. */
export function getHighScore(): number {
  try {
    const saved = localStorage.getItem("snake_highscore");
    return saved ? parseInt(saved, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

/** Saves only a new record. Storage errors must not stop a game session. */
export function saveHighScore(score: number): void {
  try {
    if (score > getHighScore()) {
      localStorage.setItem("snake_highscore", String(score));
    }
  } catch {
    // The game remains playable when browser storage is unavailable.
  }
}
