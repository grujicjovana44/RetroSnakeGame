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

**Razlog za Vite/Vitest nadogradnju:** Na baseline commitu `844ccdba`,
`npm audit` je prijavio pet ranjivosti (3 moderate, 1 high, 1 critical).
Prema verzijama razrešenim u lock fajlovima, Vite je ažuriran sa `5.4.21` na
`8.3.0`, a Vitest sa `2.1.9` na `5.0.1` da bi se uklonile prijavljene
ranjivosti. Ovo je nadogradnja preko više glavnih
verzija, pa je tretirana kao kontrolisana izmena i praćena kompletnom proverom
projekta.

**Kompatibilnost:** Posle nadogradnje prošli su postojeći `typecheck`, svih 49
testova, production build i `npm audit` sa 0 ranjivosti. To potvrđuje da su
zavisnosti kompatibilne sa postojećim kodom i skriptama u okruženju u kom su
provere pokrenute.

**Hipoteza:** Vite/Vitest nadogradnja uklanja prijavljene ranjivosti bez
regresije; izdvajanje High Score persistence helper-a omogućava direktne
provere kreiranja i očuvanja rekorda.

**Izmena:** razrešene verzije Vite/Vitest su promenjene sa `5.4.21`/`2.1.9` na
`8.3.0`/`5.0.1`, a lock fajl je regenerisan. `getHighScore`/`saveHighScore` izdvojeni
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
| EVID-01 | Početni prikaz: Canvas, HUD, zmija i prepreke | PASS (00:01) | [`initial-game.png`](evidence/initial-game.png), [`test.mp4`](evidence/test.mp4) |
| EVID-02 | Kretanje tastaturom | PASS (00:05–00:10) | [`test.mp4`](evidence/test.mp4) |
| EVID-03 | Jedenje hrane | PASS (00:11) | [`test.mp4`](evidence/test.mp4) |
| EVID-04 | Game Over | PASS (00:13) | [`test.mp4`](evidence/test.mp4) |
| EVID-05 | Restart nakon Game Over-a | PASS (00:14) | [`test.mp4`](evidence/test.mp4) |
| EVID-06 | Promena moda težine | PASS (00:28) | [`test.mp4`](evidence/test.mp4) |
| EVID-07 | Wrap-around: sva četiri pravca | PASS (00:28–00:40) | [`test.mp4`](evidence/test.mp4) |
| EVID-08 | Pause i nastavak | PASS (01:02) | [`test.mp4`](evidence/test.mp4) |
| EVID-09 | Refresh i očuvan High Score | PASS (01:18) | [`test.mp4`](evidence/test.mp4) |

Timestamp-ove je dostavila učesnica nakon pregleda snimka `test.mp4` i potvrdila
da su tačni.
Automatizovani testovi za domensku logiku i High Score helper prikazani su
odvojeno u prethodnoj tabeli.

## Automatizovani browser testovi

Playwright testovi se nalaze u `e2e/game.spec.ts` i pokreću se Chromium-om.
Deterministički `Math.random` u browser test kontekstu i kontrolisan browser
clock omogućavaju ponovljiv scenario sudara i jedenja hrane bez izmene
aplikacionog koda. Testovi pokrivaju Canvas/HUD, izbor težine, pause/resume,
Game Over/restart i High Score upis i prikaz posle refresh-a.

| Komanda | Rezultat |
| --- | --- |
| `npm run test:e2e` | PASS — 5/5 Chromium testova |
| `npm audit --audit-level=low` | PASS — 0 ranjivosti |

| Dokaz | Rezultat | Artefakt |
| --- | --- | --- |
| Playwright Chromium E2E screenshot | PASS — 5/5 testova | [`e2e-tests-passing.png`](evidence/e2e-tests-passing.png) |

Wrap-around pravci ostaju pokriveni unit testovima i ručnim video dokazom;
browser E2E paket ne proverava ih trenutno.

## Ponovljene provere

Pokrenuto nakon izmena:

| Komanda | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 49/49 testova, 3 fajla |
| `npm run build` | PASS |
| `npm audit` | PASS — 0 ranjivosti |
