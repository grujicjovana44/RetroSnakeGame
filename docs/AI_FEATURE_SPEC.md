# AI_FEATURE_SPEC.md

## Koji problem rešava feature?
Igrač posle završene partije ne zna konkretno šta je moglo bolje — samo vidi
skor. "AI Advice" analizira upravo odigranu partiju i daje kratak, konkretan
savet za sledeći pokušaj.

## Ko koristi feature?
Igrač, ručno, klikom na dugme "AI Advice" na game-over ekranu.

## Kada se aktivira?
Isključivo **posle** game-over-a (nikad tokom aktivne partije / game loop-a —
poziv modelu traje sekunde, ne sme da bude deo real-time petlje).

## Koji input koristi?
Frontend prvo šalje sirove podatke o završenoj partiji na backend i dobija
`sessionId`:

```
POST /api/game/session
{ "score": number, "durationSeconds": number, "collisions": number, "foodCollected": number }
→ { "sessionId": string }
```

Zatim, na klik "AI Advice", frontend šalje **samo** `sessionId`:

```
POST /api/ai/advice
{ "sessionId": string }
```

Model **ne dobija** stats direktno u promptu — dobija ih tek preko tool
poziva `get_game_session_stats(sessionId)`, koji backend izvršava i validira
pre izvršenja (sessionId iz poziva mora da se poklapa sa onim iz originalnog
zahteva).

## Koji output vraća?
```typescript
type AdviceResponse = {
  summary: string;
  recommendation: string;
  category: "movement" | "timing" | "strategy" | "general";
};
```

Krajnji odgovor korisniku:
```typescript
type AdviceApiResponse =
  | { success: true; advice: AdviceResponse }
  | { success: false; message: string }; // safe, generičan tekst
```

## Privatni AI usage izveštaj

Token usage se ne prikazuje u igri niti izlaže kroz HTTP endpoint. Backend
upisuje agregate i do 500 poslednjih zapisa u Git-ignorisan lokalni fajl
`server/ai-usage.local.json`. Fajl sadrži request count, uspehe/neuspehe,
prosečnu latenciju, model, timestamp i prompt/output/ukupan broj tokena kada
provider vrati usage metadata. Nedostupna token polja ostaju `null`.

Usage fajl ne sadrži session ID, prompt, AI odgovor, provider error tekst ili
secret. Podaci se učitavaju pri pokretanju backend-a i čuvaju između
pokretanja. Usage izveštaj ne pravi dodatni provider poziv. Jedan uspešan AI
Advice rezultat se ponovo koristi za istu game session.

## Koji model/provider koristi?
Backend koristi konačnu, fiksnu Gemini allowlistu ovim redosledom:
`gemini-3.8-flash` → `gemini-3.7-flash` → `gemini-3.6-flash` →
`gemini-3.5-flash` → `gemini-3.1-flash-lite`. Ako `GEMINI_MODEL_CHAIN` nije
postavljen, podrazumevani lanac je prva četiri modela; `gemini-3.1-flash-lite`
je dozvoljen za eksplicitan izbor, uključujući konfiguraciju sa samo jednim
modelom. Trenutni lokalni smoke izbor je `GEMINI_MODEL_CHAIN=gemini-3.1-flash-lite`.
Browser ne bira model. Scenario je kratka analiza četiri numeričke statistike i
jednog read-only tool round-trip-a. `models.list` i fake-provider testovi sami
nisu live dokaz; tačno određeni model mora da završi isti dvokoračni flow.

Verifikacioni snimak od 2026-09-29: `gemini-3.1-flash-lite` je jednom uspešno
završio live `get_game_session_stats` round-trip i vratio schema-validan
`AdviceResponse`. Ovo potvrđuje taj model i taj zahtev, ali ne potvrđuje live
dostupnost ostalih modela niti live fallback prelaze.

## Reliability i zaštita

- Ukupni provider flow ima rok od 15 sekundi, uključujući retry wait.
- Ako se HTTP klijent diskonektuje, backend prosleđuje abort provider pozivu. Istovremeni zahtevi za isti session dele jedan provider poziv; on se otkazuje tek kada se svi klijenti odjave. Otkazivanje se beleži kao `cancelled`.
- Maksimum su dva pokušaja po modelu, unutar jednog ukupnog roka od 15 sekundi.
  Transient 408/5xx/network/timeout može jednom da se ponovi; 429 može jednom
  da se ponovi samo na istom modelu, bez model fallback-a.
- Fallback na sledeći model dozvoljen je nakon iscrpljenog transient pokušaja
  (500/502/503/408, mrežna greška ili timeout). Ne radi se za 400, 401/403,
  429, safety/policy odbijanje, malformed output, missing tool-call ili
  session mismatch. 404 ostaje safe failure dok capability/model dostupnost
  nije potvrđena.
- Svaki Gemini odgovor ima `maxOutputTokens: 256`. Token metadata se beleže
  kada ih provider vrati.
- Interna telemetry beleži samo model, attempt kind, fazu, status, provider
  status, latenciju i token metadata; ne beleži session ID, tool argumente,
  statistike, prompt, raw response ili stack trace.
- Pri isteku roka backend otkazuje lokalni SDK zahtev preko `AbortSignal`.
  Provider može i dalje naplatiti zahtev koji je već prihvatio.
- Browser origins su ograničeni na backend allowlist, a advice endpoint ima
  limit od 10 zahteva u minuti po klijentskoj adresi.
- Sesije i usage evidencija su ograničeni na 500 zapisa.

## Kako izgleda success?
Validan `AdviceResponse` (prošao runtime schema proveru) prikazan igraču u
UI-ju, u razumnom vremenu (videti timeout u provider contract-u).

## Kako izgleda failure?
Bilo koji od: nevalidan lokalni input, provider timeout, provider
nedostupan, malformisan/nevalidan izlaz modela → korisnik vidi generičku
poruku ("AI savet trenutno nije dostupan. Pokušajte ponovo kasnije."),
nikad raw grešku, stack trace ili provider detalje.

## Šta je van scope-a?
- AI Hint tokom aktivne partije (real-time) — nije ovaj feature.
- Multi-turn razgovor sa modelom o partiji.
- Poređenje sa istorijom više partija (samo poslednja partija).
- Gemma ili drugi provider/adaptor; zahteva zasebnu capability granu i isti
  dokazani AdviceResponse ugovor.
- Bilo kakav write-access alat — `get_game_session_stats` je striktno
  read-only.
- Cloud/database usage storage, financial cost accounting and deployment.

## Kako se proverava?
- Fake/mock provider testovi (videti `AI_EVALS.md`) pokrivaju sve grane pre
  bilo kakvog live poziva.
- Najmanje jedan test dokazuje `providerCallCount === 0` za nevalidan lokalni
  input (npr. непостојећи `sessionId`).
- Runtime schema validacija se demonstrira i za validan i za nevalidan
  primer izlaza modela.
- Testovi pokrivaju ukupan timeout/cancellation, bounded retry, duple zahteve,
  usage agregaciju i privatnost lokalnog izveštaja, 3.8→3.7 i 3.8→3.7→3.6
  failover, iscrpljenje lanca i ne-fallback za auth/quota/policy/malformed i
  tool-session mismatch slučajeve. Provider izlaz mora biti jedan potpun JSON
  objekat; code fence ili tekst izvan objekta odbacuje se kao malformed.
