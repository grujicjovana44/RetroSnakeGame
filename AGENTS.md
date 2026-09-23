# AGENTS.md

Ovo je trajni instrukcioni fajl za coding agenta (Codex) u ovom repozitorijumu.

Pravila iz ovog dokumenta važe u svakoj sesiji nad ovim projektom, dok se eksplicitno ne izmene.

## Uloga

Radiš kao coding agent na studentskom projektu RetroSnake.

Agent predlaže i pravi tehničke izmene, ali ljudski tim zadržava odgovornost za pregled, prihvatanje i objašnjenje svakog rezultata.

## Spec-Driven Development

`GAME_SPEC.md` je izvor istine za očekivano ponašanje igre i definisani scope.

Tok rada treba da prati:

`GAME_SPEC.md` → implementacija → testovi → evaluacija → evidence

Ako implementacija odstupa od specifikacije:

* ne menjaj specifikaciju ili implementaciju prećutno;
* jasno prijavi odstupanje;
* predloži potrebnu izmenu;
* sačekaj ljudsku potvrdu za promenu scope-a ili pravila.

Testovi treba da proveravaju ponašanje definisano specifikacijom, a evaluacije treba da pokriju reprezentativne, granične i negativne slučajeve.

## Uvek važi

* Pre svake veće izmene: sažmi razumevanje zadatka, predloži kratak plan, navedi pretpostavke i nejasnoće i sačekaj potvrdu pre implementacije.
* Ne proširuj scope van onoga što je eksplicitno zatraženo.
* AI Hint i tool calling nisu deo trenutnog scope-a dok se eksplicitno ne zatraže.
* Ne dodaj nove zavisnosti, biblioteke ili build alate bez eksplicitnog odobrenja.
* Ne menjaj `package.json` ili `package-lock.json` bez odobrenja.
* Skripte `dev`, `build`, `typecheck` i `test` treba da ostanu stabilne.
* Svaki strukturisani podatak treba da prati obrazac iz `src/types.ts`: TypeScript tip i runtime validacija gde je validacija potrebna.
* Pre nego što kažeš da je izmena završena, pokreni `npm run typecheck` i `npm test`.
* Ako validacije ne prolaze, nemoj izmenu predstavljati kao završenu.
* Ne unositi API ključeve, tokene ili druge tajne u kod, testove, commit poruke ili dokumentaciju.
* Ne pokretati `git commit` ili `git push` samostalno. Pripremiti izmene i omogućiti čoveku da pregleda i odluči kada se commit-uje.
* Kod izmena dokumentacije u `docs/`, prvo predložiti sadržaj i sačekati potvrdu.

## Komande

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

## Struktura projekta

* `src/types.ts` — tipizovani ugovori i runtime validacija konfiguracije
* `src/game.ts` — core game logika: kretanje, sudari, stanje igre, hrana, scoring, pause i game-over
* `src/main.ts` — UI i rendering, korisnički input, game loop, izbor težine, restart, high score i localStorage persistence
* `tests/` — automatizovani testovi game logike i konfiguracije
* `docs/GAME_SPEC.md` — pravila igre i Definition of Done; source of truth za očekivano ponašanje
* `docs/BUILD_PROMPT_V1.md` — implementacioni prompt korišćen za Session 003
* `docs/CONTEXT_MANIFEST.md` — dokumentuje kontekst koji je coding agent dobio tokom Session 003
* `docs/EVALS.md` — evaluacioni slučajevi i očekivani rezultati
* `docs/EVIDENCE.md` — dokumentovani rezultati testiranja i verifikacije


## Dependency policy

Ne koristiti `npm audit fix --force` niti uvoditi breaking dependency upgrades bez eksplicitnog odobrenja i naknadne verifikacije projekta.

Security audit rezultate dokumentovati kao poznata ograničenja kada automatski non-breaking fix nije dostupan.

## Zabranjene putanje i akcije

* Ne menjati `.git/` interno.
* Ne menjati `package-lock.json` ručno.
* Ne dodavati `.env` fajlove ili tajne u repo.
* Ne dodavati funkcionalnosti koje nisu definisane trenutnim scope-om.

## Format odgovora

Kada predlažeš plan ili rezultat:

* koristi kratke i jasne tačke;
* jasno navedi pretpostavke;
* jasno navedi šta je promenjeno;
* jasno navedi šta nije u scope-u;
* navedi koje su validacije pokrenute i njihov rezultat.
