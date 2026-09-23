# Evidence — Week 3 / Session 003

## Scope

Predaja pokriva Week 3 / Session 003. Week 4 AI Hint i tool calling nisu deo
scope-a.

## Baseline

Repo baseline pre ove izmene: commit `844ccdba` (`Add SpecKit`). Na tom commitu
lokalna provera je dala typecheck PASS, 45/45 testova PASS i build PASS.
`npm audit` je prijavio pet ranjivosti (3 moderate, 1 high, 1 critical).
Raniji tutorov nalaz 10/19 neuspešnih testova odnosi se na starije stanje; to
stanje nije ovaj commit.

## Kontrolisana izmena

**Hipoteza:** Vite/Vitest nadogradnja uklanja prijavljene ranjivosti bez
regresije; izdvajanje High Score persistence helper-a omogućava direktne
provere kreiranja i očuvanja rekorda.

**Izmena:** nadograđeni su Vite/Vitest; `getHighScore`/`saveHighScore` izdvojeni
su u `src/highScore.ts`; `tests/highScore.test.ts` pokriva čitanje, upis novog
rekorda, očuvanje boljeg rekorda i nedostupan storage.

**Signal i rezultat:** typecheck PASS; 49/49 testova PASS; production build
PASS; `npm audit` PASS (0 ranjivosti). Testovi ne zamenjuju stvarnu proveru UI-ja.

## Traceability

| Zahtev | Implementacija | Automatizovani dokaz | Status |
| --- | --- | --- | --- |
| Grid 30×30; težine 30/70/90 prepreka | `src/types.ts`, `src/main.ts` | `tests/gameConfig.test.ts` | PASS |
| Kretanje i zabrana obrta za 180° | `src/game.ts` | `tests/game.test.ts` | PASS |
| Wrap-around na sve četiri ivice | `wrapPosition`, `advanceGame` | četiri boundary testa | PASS |
| Hrana, score, zlatna hrana i timer | `advanceGame` | `tests/game.test.ts` | PASS |
| Sudari, Game Over state, pause | `src/game.ts` | `tests/game.test.ts` | PASS |
| Runtime validacija | `validateGameConfig`, `validateGameState` | config/state testovi | PASS |
| High Score helper | `src/highScore.ts` | `tests/highScore.test.ts` | PASS |

## Browser evidence

| ID | Scenario | Rezultat | Artefakt |
| --- | --- | --- | --- |
| EVID-01 | Početni prikaz: Canvas, HUD, zmija i prepreke | PASS | [`initial-game.png`](evidence/initial-game.png), [`browser_checks.mp4`](evidence/browser_checks.mp4) |
| EVID-02 | Kretanje tastaturom | PASS prema dostavljenom snimku | [`browser_checks.mp4`](evidence/browser_checks.mp4) |
| EVID-03 | Wrap-around u browseru | PASS prema dostavljenom snimku | [`browser_checks.mp4`](evidence/browser_checks.mp4) |
| EVID-04 | Pause/resume overlay | PASS prema dostavljenom snimku | [`browser_checks.mp4`](evidence/browser_checks.mp4) |
| EVID-05 | Game Over i restart | PASS prema dostavljenom snimku | [`browser_checks.mp4`](evidence/browser_checks.mp4) |
| EVID-06 | High Score nakon osvajanja poena i refresh-a | PASS prema dostavljenom snimku | [`browser_checks.mp4`](evidence/browser_checks.mp4) |

Početni prikaz je snimljen u Microsoft Edge headless. Učesnica je dodala
`browser_checks.mp4` i navela da prikazuje kretanje tastaturom, refresh, pauzu,
Game Over, prelazak preko ivice i pokretanje nove igre. Statusi iznad se oslanjaju
na taj dostavljeni snimak; automatizovani testovi za domensku logiku i High Score
helper prikazani su odvojeno u prethodnoj tabeli.

## Ponovljene provere

Pokrenuto nakon izmena:

| Komanda | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 49/49 testova, 3 fajla |
| `npm run build` | PASS |
| `npm audit` | PASS — 0 ranjivosti |
