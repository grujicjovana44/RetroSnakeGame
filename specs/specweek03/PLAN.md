# PLAN.md — SpecWeek03 Implementation Plan

## Pregled
Cilj ovog plana je implementacija stabilne, tipizirane i testirane verzije igre RetroSnake sa preprekama.

## Arhitektura i moduli
1. **`src/types.ts`**: Tipovi i runtime validacija za `GameConfig` (grid 20×20, 70 prepreka, difficulty).
2. **`src/game.ts`**: Domenska logika (zmija, kolizije, hrana, zlatna hrana, pauziranje, `advanceGame`, `validateGameState`).
3. **`src/main.ts`**: Canvas UI, event handler-i za tastaturu ('P'/Esc pauza, strelice/WASD, Space), prikazi skora i Game Over.
4. **`tests/game.test.ts`**: Vitest jedinici i integracioni testovi za sve funkcije.

## Faze implementacije
- **Faza 1:** Povezivanje tipova i ugovora (`GameConfig`, `defaultGameConfig`).
- **Faza 2:** Domenska logika i otkrivanje kolizija (`detectCollision`, `advanceGame`).
- **Faza 3:** Zlatna hrana (+50, 35 koraka, 25% šanse), pauza i High Score storage.
- **Faza 4:** UI renderovanje (Canvas 2D, oči na glavi zmije, overlays).
- **Faza 5:** Verifikacija (`npm run typecheck`, `npm test`, `npm run build`).