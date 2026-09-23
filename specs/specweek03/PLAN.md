# PLAN.md — SpecWeek03 Implementation Plan

## Scope

Ovaj plan pokriva Week 3 / Session 003. Session 004 funkcionalnosti, AI Hint
i tool calling nisu deo ovog rada.

## Source of truth

`docs/GAME_SPEC.md` je autoritativni dokument za gameplay pravila i scope.

Ključne vrednosti koje moraju ostati usklađene sa kodom su:

- grid: `30 × 30`;
- Easy: `30` prepreka;
- Normal: `70` prepreka;
- Hard: `90` prepreka;
- prelazak preko ivice table koristi wrap-around;
- sudar sa preprekom ili sopstvenim telom završava igru.

## Arhitektura i moduli

1. `src/types.ts` — tipovi, podrazumevani `GameConfig` i runtime validacija.
2. `src/game.ts` — kretanje, wrap-around, sudari, hrana, stanje i pauza.
3. `src/main.ts` — Canvas UI, input, game loop, restart i High Score.
4. `tests/` — unit i integracioni testovi za domensku logiku i konfiguraciju.

## Implementacione faze

- [x] Faza 1: `GameConfig` ugovor i runtime validacija.
- [x] Faza 2: domenska logika, sudari i wrap-around.
- [x] Faza 3: obična/zlatna hrana, pauza i High Score UI.
- [x] Faza 4: Canvas renderovanje i status overlays.
- [x] Faza 5: automated verification.
- [ ] Faza 6: browser evidence za ponašanja zavisna od runtime-a.

## Verification

Pre završetka proveriti:

```text
npm run typecheck
npm test
npm run build
```

Rezultati i preostala ograničenja vode se u `EVIDENCE.md`.
