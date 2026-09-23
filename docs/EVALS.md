# Evals — Week 3 / Session 003

Ovi slučajevi proveravaju ponašanje definisano u `GAME_SPEC.md`. Automatizovani
slučajevi su u `tests/`; browser slučajevi su odvojeni jer zavise od Canvas-a,
DOM-a, tastature i `localStorage`.

## Automatizovani slučajevi

| ID | Vrsta | Ulaz / koraci | Očekivani rezultat | Automatizovani dokaz |
| --- | --- | --- | --- | --- |
| EVAL-01 | Tipičan | Napravi validnu Normal konfiguraciju i početno stanje. Pomeri zmiju ka praznom polju. | Konfiguracija i stanje su validni; glava se pomera jedno polje u smeru kretanja. | `tests/gameConfig.test.ts`, `tests/game.test.ts` |
| EVAL-02 | Granica | Pomeri zmiju preko svake ivice table. | Pozicija se obmota na suprotnu ivicu bez Game Over-a. | `tests/game.test.ts` — četiri wrap-around slučaja |
| EVAL-03 | Neispravan ulaz | Validiraj konfiguraciju/stanje sa nevažećim dimenzijama, pozicijom van table ili preklapanjem entiteta. | Validator vraća `ok: false` i navodi grešku. | `tests/gameConfig.test.ts`, `tests/game.test.ts` |
| EVAL-04 | Regresija iz ranijeg nalaza | Pokušaj direktan obrt za 180°; zatim proveri hranu na zmiji/prepreci i golden food timer. | Obrt se ignoriše; neispravno stanje se odbija; timer ostaje u dozvoljenom opsegu. | `tests/game.test.ts` |
| EVAL-05 | Golden food | Pojedi zlatnu hranu; u odvojenom slučaju pusti timer da istekne. | Score raste za 50, zmija raste, a hrana nestaje pri isteku od 35 tickova. | `tests/game.test.ts` |
| EVAL-06 | Pause | Pozovi `togglePause` iz `running`, pa ponovo iz `paused`. | Stanje prelazi `running → paused → running`. | `tests/game.test.ts` |
| EVAL-07 | Persistence | Sačuvaj novi record, ponovo pročitaj vrednost, pa pokušaj da upišeš niži score. | Novi rekord ostaje sačuvan; niži rezultat ga ne prepisuje; nedostupan storage ne ruši igru. | `tests/highScore.test.ts` |

## Browser slučajevi

Browser provere su dokumentovane snimkom u
`specs/specweek03/evidence/browser_checks.mp4`.

| ID | Koraci | Očekivani rezultat |
| --- | --- | --- |
| EVAL-B01 | Otvori igru na početnom ekranu. | Canvas, score, high score, zmija i prepreke su vidljivi. |
| EVAL-B02 | Koristi strelice/WASD; pritisni P i Escape. | Kretanje prati unos; oba tastera pauziraju/nastavljaju bez pomeranja tokom pauze. |
| EVAL-B03 | Pređi svaku ivicu table. | Zmija se pojavi na suprotnoj ivici. |
| EVAL-B04 | Izazovi sudar, pa pritisni Space. | Game Over overlay se pojavi; Space započinje novu partiju bez reload-a. |
| EVAL-B05 | Ostvari score, završi partiju i osveži stranicu. | High Score se ažurira i ostaje sačuvan u `localStorage`. |

## Baseline i kontrolisana promena

Tutorov raniji pregled prijavio je neuspešne typecheck/build i 10 neuspešnih
testova od 19 u starijem stanju projekta. Radni baseline pre ovih izmena je
commit `844ccdba` (`Add SpecKit`): typecheck PASS, 45/45 testova PASS, build PASS,
`npm audit` 5 ranjivosti. Commit history je dostupan za checkout poređenja.

Kontrolisana izmena u ovom prolazu je nadogradnja Vite/Vitest radi audit nalaza
i izdvajanje high score helper-a sa direktnim testovima. Hipoteza: preporučene
verzije uklanjaju ranjivosti bez regresija, a izolovan helper omogućava proveru
high score pravila. Signali su audit, typecheck, testovi i build; rezultati su u
`specs/specweek03/EVIDENCE.md`.
