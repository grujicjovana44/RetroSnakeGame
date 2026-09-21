# AGENTS.md

Ovo je trajni instrukcioni fajl za coding agenta (Codex) u ovom repozitorijumu.
Za razliku od `docs/BUILD_PROMPT_V1.md` (jednokratan prompt za konkretan
zadatak), ova pravila važe u **svakoj** sesiji nad ovim projektom, dok se
eksplicitno ne izmene.

## Uloga
Radiš kao coding agent na malom studentskom projektu (Retro AI Engineering
Challenge). Predlažeš i praviš izmene, ali ljudski par zadržava odgovornost
za pregled, prihvatanje i objašnjenje svakog rezultata.

## Uvek važi
- Pre svake veće izmene: sažmi razumevanje zadatka, predloži kratak plan,
  navedi pretpostavke i nejasnoće, i **sačekaj potvrdu** pre nego što počneš.
- Ne proširuj scope van onoga što je eksplicitno zatraženo. `GAME_SPEC.md` je
  izvor istine za pravila igre; ako nešto nije tamo, ne izmišljaj.
- **AI Hint / tool calling se ne implementira** dok se eksplicitno ne zatraži
  (to je Sesija 004, sledeća nedelja) — ne predlaži ga sam od sebe.
- Ne dodaješ nove zavisnosti, biblioteke ili build alate bez eksplicitnog
  odobrenja — prvo predloži i objasni zašto je potrebna.
- Ne diraš `package.json` ili `package-lock.json` bez odobrenja; skripte
  `dev`, `build`, `typecheck`, `test` treba da ostanu stabilne.
- Svaki strukturisan podatak (config, stanje igre, ugovor) prati obrazac iz
  `src/types.ts`: tip **i** runtime validacija, ne samo TypeScript tip.
- Pre nego što kažeš da je nešto gotovo: `npm run typecheck` i `npm test`
  moraju proći. Ako ne prolaze, to nije "gotovo", to je poznat propust.
- Ne unosi API ključeve, tokene ni bilo kakvu tajnu u kod, testove, commit
  poruke ili dokumentaciju.
- Ne pokrećeš `git commit` ili `git push` sam — pripremi izmenu, pokaži diff,
  čovek odlučuje kada se commit-uje.
- Kad predlažeš izmenu dokumenata u `docs/`, predloži sadržaj — ne commit-uj
  ga bez potvrde.

## Komande
- `npm install` — instalacija zavisnosti
- `npm run dev` — lokalni dev server
- `npm run typecheck` — provera tipova (bez emitovanja)
- `npm test` — pokreće Vitest test suite
- `npm run build` — typecheck + produkcioni build

## Struktura projekta
- `src/types.ts` — tipizovani ugovori + runtime validacija (obrazac za sve
  naredne strukturisane delove)
- `src/main.ts` — ulazna tačka; trenutno baseline stub bez game logike
- `tests/` — testovi i eval slučajevi
- `docs/GAME_SPEC.md` — pravila igre i Definition of Done
- `docs/BUILD_PROMPT_V1.md` — trenutni zadatak (Sesija 003 baseline)
- `docs/CONTEXT_MANIFEST.md` — šta je uključeno/izostavljeno iz konteksta i zašto

## Zabranjene putanje/akcije
- Ne menjaj `.git/` interno.
- Ne menjaj `package-lock.json` ručno (samo kroz `npm install`).
- Ne dodaji `.env` fajlove niti bilo šta sa tajnama u repo.

## Format odgovora
Kad predlažeš plan ili rezultat: kratke tačke, jasno označene pretpostavke,
i eksplicitno navedi šta **nije** u scope-u ove izmene.