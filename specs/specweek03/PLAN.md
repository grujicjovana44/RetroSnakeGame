# RetroSnake — specweek03

## Cilj

Implementirati Core verziju igre RetroSnake: Prepreke prema `GAME_SPEC.md`.
Rad obuhvata samo mehaniku igre, Canvas prikaz, lokalne kontrole i proverljive
testove. Ne obuhvata AI Hint, tool calling, mrežne pozive, nove pakete,
multiplayer, zvuk ili druge funkcije van specifikacije.

## Plan rada

1. U `src/game.ts` izdvojiti čistu domensku logiku: pozicije, pravce, potez,
   kolizije, rast, skor, hranu, prepreke i kreiranje nove partije.
2. Dodati tipizirano stanje igre i runtime validaciju za stanje, kao dopunu
   postojećoj runtime validaciji `GameConfig` ugovora.
3. Uvesti funkciju koja iz `GameConfig` računa stvarni interval tick-a prema
   težini: `easy` je sporiji, `normal` koristi osnovnu vrednost, a `hard` je
   brži.
4. Zameniti baseline prikaz u `src/main.ts` game loop-om, Canvas renderom,
   tastaturom i restartom.
5. Dodati HTML dugme za restart, vidljivo samo kada se partija završi.
6. Dodati Vitest slučajeve za pravila igre, validne/nevalidne strukturisane
   podatke i težinu.
7. Zabeležiti baseline propust i dokaz njegove korekcije u
   `specs/specweek03/EVIDENCE.md`.
8. Pokrenuti `npm run typecheck`, `npm test` i `npm run build`, zatim pripremiti
   listu izmenjenih fajlova i uputstvo za ručnu proveru u browseru.

## Pretpostavke

- Podrazumevana tabla ostaje 20 × 20, sa 8 statičnih prepreka.
- Početna zmija ima tri segmenta, postavljena je blizu centra i kreće se desno.
- Jedna hrana donosi 10 poena.
- Prepreke se nasumično biraju samo pri pokretanju/restartu partije; ne menjaju
  se tokom aktivne partije.
- Ulazak glave u trenutno polje repa dozvoljen je samo kada se rep u istom
  tick-u pomera; pri jedenju hrane rep ostaje i takav ulazak je sudar.
- `startingSpeedMs` je osnovni (normal) interval. Stvarni interval je:
  `easy = 1.25 × startingSpeedMs`, `normal = 1.00 × startingSpeedMs`,
  `hard = 0.75 × startingSpeedMs`. Rezultat se zaokružuje na ceo milisekund.
- Brzina se ne povećava tokom partije, jer je to opciono za Core.

## Dokazivost

- Čiste funkcije ostaju odvojene od DOM-a i renderovanja kako bi eval testovi
  mogli neposredno proveravati sudare i promene stanja.
- Testovi pokrivaju i važeće i nevažeće primere za runtime validaciju stanja.
- `specs/specweek03/EVIDENCE.md` beleži da baseline nije imao igru i upućuje na testove
  i ručnu proveru koji potvrđuju ispravku.

## Dopuna: vizuelna hrana, gušće prepreke i brzina u UI-ju

- Podrazumevani broj prepreka povećava se na 70 (17,5% table 20 × 20).
  Generisanje prvo proverava konačan skup slobodnih polja, pa bira prepreke bez
  ponavljanja; time se gusta validna tabla završava bez beskonačne petlje.
- Hrana se crta kao veći ružičasti kvadrat sa svetlim jezgrom i Canvas glow
  efektom. Pravila jedenja, rasta i skora ostaju nepromenjena.
- Kontrole `Sporo`, `Normalno` i `Brzo` menjaju runtime-validiran
  `GameConfig.difficulty` za sledeći restart. Aktivna partija zadržava svoju
  brzinu, a HUD prikazuje aktivnu i sledeću izabranu brzinu.
