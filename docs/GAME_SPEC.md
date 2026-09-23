## 1. Naziv projekta

**RetroSnake: Prepreke**

## 2. Scope Week 3

Week 3 implementacija obuhvata:

* osnovni Snake game loop
* kretanje zmije
* četiri pravca kretanja
* zabranu direktnog obrta za 180°
* wrap-around preko sve četiri ivice table
* statične prepreke
* običnu hranu
* zlatnu hranu
* score sistem
* collision sa preprekama i sopstvenim telom
* pause/resume
* restart nakon Game Over
* High Score persistence
* runtime validaciju `GameConfig` i `GameState`
* unit testove za domain/game logiku
* browser/runtime validaciju implementirane funkcionalnosti

AI Hint funkcionalnost i tool calling nisu deo Week 3 implementacije.

---

## 3. Opis igre

RetroSnake je klasična Snake igra na kvadratnoj mreži.

Igrač upravlja zmijom koja se automatski pomera u trenutnom pravcu. Zmija raste kada pojede hranu i dobija poene. Tabla sadrži statične prepreke koje zmija mora da izbegava.

Izlazak zmije preko bilo koje ivice table ne završava igru. Zmija se pojavljuje na suprotnoj strani table.

Pored obične hrane postoji i privremena zlatna hrana koja donosi veći broj poena.

Igra se završava kada zmija udari u prepreku ili sopstveno telo.

---

## 4. Cilj igrača

Cilj je:

* preživeti što duže,
* sakupiti što više hrane,
* ostvariti što veći score,
* oboriti prethodni High Score.

Igra nema fiksni završni nivo ili pobednički ekran.

---

## 5. Kontrole

| Kontrola        | Funkcija                |
| --------------- | ----------------------- |
| Arrow Up / W    | Kretanje gore           |
| Arrow Down / S  | Kretanje dole           |
| Arrow Left / A  | Kretanje levo           |
| Arrow Right / D | Kretanje desno          |
| P               | Pause / Resume          |
| Escape          | Pause / Resume          |
| Space           | Restart nakon Game Over |

Direktan obrt za 180° nije dozvoljen.

Primer:

```text
RIGHT → LEFT
UP → DOWN
LEFT → RIGHT
DOWN → UP
```

Takav zahtev za promenu pravca se ignoriše.

---

## 6. Game loop

Na svakom tick-u:

1. određuje se sledeći pravac zmije,
2. izračunava se sledeća pozicija glave,
3. ako glava napusti granice table, primenjuje se wrap-around,
4. proverava se collision sa preprekom,
5. proverava se collision sa sopstvenim telom,
6. proverava se da li je pojedena obična ili zlatna hrana,
7. ažurira se pozicija zmije,
8. po potrebi se zmija produžava,
9. ažurira se score,
10. generiše se nova hrana kada je potrebno,
11. ažurira se timer zlatne hrane.

---

## 7. Wrap-around pravilo

Ivice table nisu smrtonosne.

Ako zmija napusti tablu:

```text
desna ivica → leva ivica
leva ivica → desna ivica
gornja ivica → donja ivica
donja ivica → gornja ivica
```

Primer za tablu širine 30:

```text
x = 29 + RIGHT → x = 0
x = 0 + LEFT   → x = 29
```

Primer za tablu visine 30:

```text
y = 29 + DOWN → y = 0
y = 0 + UP    → y = 29
```

Wrap-around se primenjuje pre provere collision-a u glavnom game loop-u.

Direktna funkcija `detectCollision` i dalje može prijaviti `"wall"` kada dobije poziciju van table. To je pomoćna/domain funkcija; stvarni game loop normalizuje poziciju pomoću wrap-around pravila pre collision provere.

---

## 8. GameConfig

Default konfiguracija koristi:

```text
gridWidth: 30
gridHeight: 30
```

Broj prepreka zavisi od difficulty podešavanja u aktuelnom `GameConfig`:

| Difficulty | Broj prepreka |
| ---------- | ------------: |
| Easy       |            30 |
| Normal     |            70 |
| Hard       |            90 |

Vrednosti u ovoj tabeli moraju ostati usklađene sa `src/types.ts`.

`GameConfig` se proverava runtime validacijom pre kreiranja početnog stanja igre.

---

## 9. Prepreke

Prepreke:

* generišu se pre početka partije,
* ostaju statične tokom partije,
* ne smeju zauzimati početne pozicije zmije,
* ne smeju se međusobno preklapati,
* moraju biti unutar table.

Sudar sa preprekom završava igru.

---

## 10. Obična hrana

Kada zmija pojede običnu hranu:

* zmija raste za jedan segment,
* score se povećava za `+10`,
* generiše se nova slobodna pozicija za hranu,
* postoji 25% šanse za pojavljivanje zlatne hrane ako ona trenutno ne postoji.

Hrana ne sme biti postavljena na:

* zmiju,
* prepreku,
* zlatnu hranu.

---

## 11. Zlatna hrana

Zlatna hrana:

* donosi `+50` poena,
* pojavljuje se sa verovatnoćom od 25% nakon konzumiranja obične hrane,
* ne može zauzimati isto polje kao zmija, prepreka ili obična hrana,
* traje najviše 35 game tickova,
* nestaje kada timer dostigne nulu,
* nestaje odmah nakon što je zmija pojede.

---

## 12. Collision pravila

Igra završava kada sledeća pozicija glave predstavlja:

```text
obstacle collision
```

ili

```text
self collision
```

Ivice table nisu collision u stvarnom game loop-u zbog wrap-around mehanike.

Game Over stanje mora sadržati odgovarajući `collision` razlog.

---

## 13. Pause

Kada je igra u stanju:

```text
running
```

pritisak na `P` ili `Escape` prebacuje igru u:

```text
paused
```

Ponovnim pritiskom igra se vraća u:

```text
running
```

Dok je igra pauzirana, game loop ne sme pomerati zmiju.

---

## 14. Game Over i restart

Game Over nastaje nakon collision-a sa:

* preprekom,
* sopstvenim telom.

Game Over prikaz treba da sadrži:

* finalni score,
* High Score,
* mogućnost restarta.

Restart treba da:

* kreira novo početno stanje igre,
* generiše nove prepreke,
* generiše novu hranu,
* resetuje score,
* ne zahteva reload stranice.

---

## 15. High Score

High Score predstavlja najbolji ostvareni score korisnika.

High Score se čuva u browser `localStorage` i mora preživeti refresh stranice.

Minimalno očekivano ponašanje:

```text
novi score > trenutni High Score
        ↓
localStorage se ažurira
        ↓
High Score se prikazuje kao novi rekord
```

Ako novi score nije veći od postojećeg High Score-a, postojeći rekord ostaje nepromenjen.

---

## 16. Vizuelni zahtevi

Igra se prikazuje pomoću HTML5 Canvas-a.

Minimalni UI zahtevi:

* mreža 30×30,
* jasno prikazana zmija,
* vizuelno različita glava zmije,
* oči glave usmerene u trenutnom pravcu,
* crvene prepreke,
* roze obična hrana,
* zlatna/svetleća zlatna hrana,
* trenutni score,
* High Score,
* Pause overlay,
* Game Over overlay.

---

## 17. Runtime validacija

`GameConfig` i `GameState` moraju imati runtime validaciju.

Validacija proverava najmanje:

* validnost konfiguracije,
* validnost pozicija,
* granice table,
* broj prepreka,
* preklapanje zmije i prepreka,
* validnost hrane,
* validnost zlatne hrane,
* validnost pravca,
* zabranu 180° obrta,
* validnost score-a,
* konzistentnost `status` i `collision` polja.

---

## 18. Test requirements

Unit testovi moraju pokriti najmanje:

### Movement

* kretanje gore,
* kretanje dole,
* kretanje levo,
* kretanje desno.

### Direction

* validnu promenu pravca,
* odbijanje 180° obrta.

### Boundary

* desna ivica → leva ivica,
* leva ivica → desna ivica,
* gornja ivica → donja ivica,
* donja ivica → gornja ivica.

### Collision

* obstacle collision,
* self collision,
* Game Over tok.

### Food

* obična hrana,
* rast zmije,
* +10 score,
* zlatna hrana,
* +50 score,
* expiration zlatne hrane.

### State

* kreiranje početnog stanja,
* pause/resume,
* runtime validation,
* invalid state.

### Persistence

* kreiranje High Score-a,
* čuvanje novog rekorda,
* zadržavanje postojećeg rekorda kada novi score nije veći.

---

## 19. Browser / runtime verification

Pre predaje mora biti provereno:

```bash
npm run typecheck
npm test
npm run build
```

Aplikacija mora biti pokrenuta u browseru i proverena najmanje za:

1. početak igre,
2. kretanje,
3. sva četiri wrap-around slučaja,
4. jedenje obične hrane,
5. Game Over,
6. pause/resume,
7. restart,
8. High Score persistence.

Browser provera treba da bude dokumentovana screenshotovima ili drugim jasnim runtime dokazom.

---

## 20. Definition of Done

* [x] Igra se pokreće na 30×30 default mreži.
* [x] Zmija se kreće u četiri pravca.
* [x] Direktan obrt za 180° je onemogućen.
* [x] Zmija prolazi kroz desnu ivicu i pojavljuje se sa leve strane.
* [x] Zmija prolazi kroz levu ivicu i pojavljuje se sa desne strane.
* [x] Zmija prolazi kroz gornju ivicu i pojavljuje se sa donje strane.
* [x] Zmija prolazi kroz donju ivicu i pojavljuje se sa gornje strane.
* [x] Zmija raste nakon konzumiranja hrane.
* [x] Obična hrana donosi +10 poena.
* [x] Zlatna hrana donosi +50 poena.
* [x] Zlatna hrana ima ograničeno trajanje od 35 tickova.
* [x] Sudar sa preprekom završava igru.
* [x] Sudar sa sopstvenim telom završava igru.
* [x] P pauzira/nastavlja igru.
* [x] Escape pauzira/nastavlja igru.
* [x] Restart radi bez reload-a stranice.
* [x] GameConfig ima runtime validaciju.
* [x] GameState ima runtime validaciju.
* [x] Browser verification je dokumentovana u `EVIDENCE.md` (`browser_checks.mp4`).
* [x] High Score persistence je pokrivena automatizovanim testom.
* [x] High Score browser ponašanje je dokumentovano u `EVIDENCE.md` (`browser_checks.mp4`).
* [x] `npm run typecheck` prolazi.
* [x] `npm test` prolazi.
* [x] `npm run build` prolazi.

---

## 21. Out of scope

Sledeće funkcionalnosti nisu deo Week 3:

* multiplayer,
* online leaderboard,
* korisnički nalozi,
* server/backend,
* pomerajuće prepreke,
* custom audio,
* AI Hint,
* tool calling,
* Week 4 AI funkcionalnosti.

---

## 22. Traceability

| Zahtev             | Implementacija                             | Test / dokaz                        |
| ------------------ | ------------------------------------------ | ----------------------------------- |
| Movement           | `src/game.ts`                              | `tests/game.test.ts`                |
| 180° restriction   | `src/game.ts`                              | `tests/game.test.ts`                |
| Wrap-around        | `wrapPosition` + `advanceGame`             | 4 boundary testa                    |
| Obstacles          | `src/game.ts` / `src/types.ts`             | collision/state testovi             |
| Food               | `advanceGame`                              | food test                           |
| Golden food        | `advanceGame`                              | golden food test                    |
| Pause              | `togglePause` + UI                         | unit + browser evidence             |
| Game Over          | `advanceGame` + UI                         | collision test + browser evidence   |
| Runtime validation | `validateGameConfig` / `validateGameState` | validation testovi                  |
| High Score         | `src/highScore.ts` + UI                    | `tests/highScore.test.ts`; browser evidence još nedostaje |
| Build/typecheck    | project scripts                            | `EVIDENCE.md`                       |
