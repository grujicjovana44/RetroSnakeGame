# EVIDENCE.md — Verification & Eval Results

## Pregled verifikacije
Sve verifikacione komande su izvršene i potvrdile da je projekat u potpunosti funkcionalan, tipski siguran i da svi testovi prolaze.

## Komande i rezultati

### 1. `npm run typecheck`
- **Status:** PASS (0 errors)
- **Opis:** Svi TypeScript fajlovi u `src/` i `tests/` su uspešno prošli proveru tipova bez ikakvih neiskorišćenih promenljivih ili nepodudarnosti tipova.

### 2. `npm test`
- **Status:** PASS (19/19 tests passed)
- **Opis:** Pokrenut Vitest test suite. Testirani su:
  - Runtime validacija `validateGameConfig` i `validateGameState`
  - Otkrivanje sudara sa zidom, preprekom i sopstvenim repom (`detectCollision`)
  - Sprečavanje obrtaja za 180° u jednom potezu (`requestDirection` i `validateGameState`)
  - Rast zmije i bodovanje obične (+10) i zlatne hrane (+50)
  - Isticanje tajmera zlatne hrane (35 koraka)
  - Pauziranje i nastavak igre (`togglePause`)
  - Generisanje nasumičnih slobodnih polja (`findFreePosition`)

### 3. `npm run build`
- **Status:** PASS
- **Opis:** Produkciona kompilacija (typecheck + vite build) je završena bez grešaka.

### Dependency Security Audit

`npm audit` was executed after the Week 3 implementation.

The current dependency tree contains 5 reported vulnerabilities:

* 3 moderate
* 1 high
* 1 critical

The affected development/test dependency chain includes `vitest@2.1.9`, `@vitest/mocker@2.1.9`, `vite@5.4.21`, and `esbuild@0.21.5`.

Running `npm audit fix` without force does not resolve the remaining findings. npm reports that resolving them automatically would require breaking-version upgrades, including `vitest@5.0.1` and `vite@8.3.0`.

The breaking upgrade was not applied during the Week 3 submission because it could introduce unverified changes to the existing test and build setup.

This is recorded as a known dependency-maintenance limitation for a future update.


## Tabela pokrivenosti zahteva (Traceability)

| Zahtev | Lokacija u kodu | Pokrivenost testovima | Status |
| :--- | :--- | :--- | :--- |
| `GameConfig` validacija | `src/types.ts` | `tests/game.test.ts` | PASS |
| `GameState` validacija | `src/game.ts` | `tests/game.test.ts` | PASS |
| Sudar sa zidom/preprekom/sobom | `src/game.ts` | `tests/game.test.ts` | PASS |
| Blokada obrta za 180° | `src/game.ts` | `tests/game.test.ts` | PASS |
| Obična hrana (+10 poena) | `src/game.ts` | `tests/game.test.ts` | PASS |
| Zlatna hrana (+50, tajmer 35) | `src/game.ts` | `tests/game.test.ts` | PASS |
| Pauza / Resume ('P'/Esc) | `src/game.ts`, `src/main.ts` | `tests/game.test.ts` | PASS |
| High Score storage | `src/main.ts` | Integracija u UI | PASS |