# RetroSnake: Prepreke

Starter skelet za Retro AI Engineering Challenge (Sesija 003/004).

## Setup
npm install

## Razvoj
npm run dev

## Provere (pokreni pre i posle svake izmene)
npm run typecheck
npm test

## Struktura
- `src/types.ts` — GameConfig ugovor + runtime validacija (obrazac za dalje)
- `src/main.ts` — baseline ulazna tačka (bez game logike — Codex je dodaje)
- `tests/` — eval/unit testovi
- `docs/` — GAME_SPEC.md, BUILD_PROMPT_V1.md, CONTEXT_MANIFEST.md, itd.

Detaljna pravila igre: `docs/GAME_SPEC.md`.
Prompt za coding agenta: `docs/BUILD_PROMPT_V1.md`.
