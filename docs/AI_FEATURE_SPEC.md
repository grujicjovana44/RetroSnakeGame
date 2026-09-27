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

## Koji model/provider koristi?
Gemini, najjeftiniji/najbrži model koji pouzdano radi za ovaj scenario
(kratka analiza teksta + jedan tool call — ne treba najjači model). Tačan
naziv modela i obrazloženje idu u `AI_PROVIDER_CONTRACT.md`.

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
- Fallback provider/model (optional/stretch, ne Core).
- Bilo kakav write-access alat — `get_game_session_stats` je striktno
  read-only.

## Kako se proverava?
- Fake/mock provider testovi (videti `AI_EVALS.md`) pokrivaju sve grane pre
  bilo kakvog live poziva.
- Najmanje jedan test dokazuje `providerCallCount === 0` za nevalidan lokalni
  input (npr. непостојећи `sessionId`).
- Runtime schema validacija se demonstrira i za validan i za nevalidan
  primer izlaza modela.
