# BUILD_PROMPT_V1.md

Pre implementacije:
1. Sažmi razumevanje zadatka.
2. Navedi plan u nekoliko koraka.
3. Navedi nejasnoće ili pretpostavke.
4. Ne proširuj scope bez eksplicitnog razloga.

---

## Uloga
Ti si coding agent koji pomaže u izradi male, proverljive igre za studentski
projekat. Ne preuzimaš odgovornost za prihvatanje rezultata — ja (i moj par)
pregledamo plan, diff i proveru pre svakog commit-a.

## Cilj i očekivani rezultat
Implementiraj Core verziju igre **RetroSnake: Prepreke**, opisanu u
`GAME_SPEC.md` (priložen kao kontekst). Ovo je **samo Sesija 003** — baseline i
jedna kontrolisana izmena, ne AI Hint alat (to dolazi sledeće nedelje).

Očekujem na kraju:
- radnu igru u browseru koja ispunjava sve stavke iz Definition of Done u
  `GAME_SPEC.md`;
- tipizovan `GameConfig` ugovor sa runtime validacijom (ne samo TS tip);
- najmanje jedan strukturisan deo sistema sa vidljivom runtime proverom
  (validan i nevalidan primer, ne samo "srećni put");
- kod organizovan tako da mogu lako da pišem eval slučajeve nad njim
  (npr. čista funkcija za detekciju sudara, odvojena od render/loop logike).

## Granice — šta NE sme da se radi
- Ne dodaješ nikakav AI poziv, tool calling, fetch ka spoljašnjem API-ju.
- Ne dodaješ nove zavisnosti/pakete bez eksplicitnog odobrenja — prvo predloži,
  pa čekaj potvrdu.
- Ne diraš fajlove van dozvoljenog područja (ispod).
- Ne širiš scope izvan `GAME_SPEC.md` (npr. bez multiplayer-a, login-a,
  zvuka, pokretnih prepreka — puna lista je u sekciji "Van scope-a" u
  `GAME_SPEC.md`).
- Ne brišeš i ne prepisuješ baseline verziju kada napraviš poboljšanje —
  baseline mora ostati vidljiv/rekonstruisan za poređenje pre/posle.

## Tehnički kontekst
- Jezik/okruženje: TypeScript, browser aplikacija.
- Prikaz: HTML5 Canvas (bez frameworka za render, osim ako starter već ima
  nešto ugrađeno — u tom slučaju prati postojeći obrazac).
- Starter: postojeći projekat (Vite + TypeScript + Vitest), NE prazan repo.
  Pre bilo čega pokreni `npm install`, pa pročitaj `README.md` i postojeću
  strukturu — ne pravi novi build sistem niti drugi test runner.
- Relevantni fajlovi za ovaj zadatak: `GAME_SPEC.md` (izvor pravila),
  `CONTEXT_MANIFEST.md` (šta je namerno uključeno/izostavljeno).

## Gameplay pravila
Puna pravila su u `GAME_SPEC.md` — ne dupliraj ih ovde napamet, već ih čitaj
odatle kao izvor istine. Ukratko: grid-based kretanje u 4 pravca, rast posle
hrane, statične prepreke, game over na bilo koji sudar, bez 180° obrta u
jednom potezu.

## Definition of Done
Kopirano iz `GAME_SPEC.md` — implementacija se smatra završenom tek kada su
**sve** stavke iz te liste proverljivo tačne, ne kada "izgleda gotovo".

## Dozvoljeni fajlovi / područja izmene
- `src/` — implementacija igre. `src/types.ts` već sadrži `GameConfig` ugovor
  i `validateGameConfig()` — nastavi taj obrazac (tip + runtime validacija)
  za svaki naredni strukturisani deo, ne piši samo TS tipove bez provere.
- `src/main.ts` — u trenutnom checkout-u sadrži Canvas UI, input, game loop,
  restart i high score. Ovaj prompt je istorijski zapis zadatka za Session 003;
  starter-stub opis iz prvobitnog prompta više nije aktuelno stanje koda.
- `tests/` — testovi i eval slučajevi (`tests/gameConfig.test.ts` je već tu
  kao primer stila/formata; nastavi u istom duhu).
- `index.html` — samo ako je zaista neophodno (npr. dodatni DOM element za
  HUD); ne menjaj build/script tagove bez razloga.
- `docs/GAME_SPEC.md`, `docs/CONTEXT_MANIFEST.md`, `docs/EVALS.md`,
  `specs/specweek03/EVIDENCE.md`,
  možeš predložiti izmene,
  ali ja potvrđujem sadržaj pre commit-a.
- `package.json` — ne menjaj bez eksplicitnog odobrenja. Dependency bezbednosne
  izmene zahtevaju pregled i punu proveru pipeline-a.

Van ovoga ne diraj ništa bez pitanja.

## Provere koje treba da izvršiš
1. Pokreni postojeću početnu proveru (ako starter ima `npm test` ili sličnu
   komandu) **pre** bilo koje izmene i zabeleži rezultat kao baseline.
2. Posle implementacije: pokreni tip-proveru (`npm run build` /
   `tsc --noEmit` ili ekvivalent) i testove.
3. Ručno demonstriraj (opiši kako bih ja to ručno proverila u browseru):
   normalan potez, sudar sa zidom, sudar sa preprekom, jedenje hrane, restart.
4. Pokaži `git diff` / listu izmenjenih fajlova pre nego što predložiš commit.

## Obavezan prvi korak
Pre bilo kakve izmene koda:
1. Pregledaj relevantne fajlove i **predloži kratak plan** (koje fajlove
   praviš/menjaš, kojim redom).
2. Navedi eksplicitno koje pretpostavke praviš (npr. veličina mreže, broj
   prepreka, brzina) ako `GAME_SPEC.md` ostavlja prostor za izbor.
3. Navedi sve nejasnoće i **stani i pitaj** ako nešto u specifikaciji nije
   dovoljno precizno — ne popunjavaj rupe nagađanjem bez da to kažeš.
4. Ne kreći sa implementacijom dok plan ne potvrdim.

## Stop/ask pravilo
Ako naiđeš na odluku koja menja scope, dodaje zavisnost, ili nisi siguran/na
da li je nešto u granicama `GAME_SPEC.md` — stani i pitaj, umesto da nagađaš.
