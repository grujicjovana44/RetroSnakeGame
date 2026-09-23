# EVIDENCE.md — Week 3 / Session 003

## Scope

Ova evidence pokriva Session 003. Session 004, AI Hint i tool calling nisu deo
ove predaje.

## Automated verification

| Komanda | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 45 tests |
| `npm run build` | PASS |

Automated testovi pokrivaju movement, direction validation, 180° restriction,
wrap-around preko sve četiri ivice, prepreke, self collision, food, golden food,
pause, state validation i config validation.

## Traceability

| Zahtev | Implementacija | Test/dokaz | Status |
| --- | --- | --- | --- |
| Grid 30×30 i difficulty 30/70/90 | `src/types.ts`, `src/main.ts` | `tests/gameConfig.test.ts` | PASS |
| Movement i 180° restriction | `src/game.ts` | `tests/game.test.ts` | PASS |
| Wrap-around | `wrapPosition`, `advanceGame` | četiri boundary testa | PASS |
| Obstacle collision | `src/game.ts` | `tests/game.test.ts` | PASS |
| Self collision | `src/game.ts` | `tests/game.test.ts` | PASS |
| Food/golden food | `advanceGame` | `tests/game.test.ts` | PASS |
| Pause/resume | `togglePause`, `src/main.ts` | unit test + browser check | PASS |
| Game Over/restart | `advanceGame`, `src/main.ts` | unit test + browser check | PASS |
| Runtime validation | `validateGameConfig`, `validateGameState` | validation tests | PASS |
| High Score persistence | `src/main.ts` | browser check | PASS |

## Browser evidence

Ove stavke ostaju otvorene dok ne budu proverene u browseru i dokumentovane
screenshotom ili drugim jasnim runtime dokazom:

| ID | Scenario | Status |
| --- | --- | --- |
| EVID-01 | Initial game / Canvas / HUD | PASS |
| EVID-02 | Wrap-around | PASS |
| EVID-03 | Game Over overlay | PASS |
| EVID-04 | Pause/resume overlay | PASS |
| EVID-05 | Restart bez reload-a | PASS |
| EVID-06 | High Score posle refresh-a | PASS |

## Known limitations

Unit testovi ne predstavljaju zamenu za browser proveru Canvas renderovanja,
keyboard input-a, DOM overlay-a, game loop-a i `localStorage` persistence-a.

## Dependency note

Dependency tree sadrži ranije evidentirane razvojne/test vulnerabilnosti. Nije
pokretan breaking upgrade niti `npm audit fix --force`, u skladu sa pravilima
repozitorijuma.
