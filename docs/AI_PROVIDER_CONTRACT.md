# AI_PROVIDER_CONTRACT.md

```
Provider: Gemini
Model chain (backend-only allowlist, ordered):
  gemini-3.8-flash → gemini-3.7-flash → gemini-3.6-flash → gemini-3.5-flash
  → gemini-3.1-flash-lite
Configuration: GEMINI_MODEL_CHAIN in server/.env; it may contain only a
  non-empty ordered subset of the fixed allowlist. The browser cannot select
  a model. Without this variable, the default chain is gemini-3.8-flash through
  gemini-3.5-flash; gemini-3.1-flash-lite is an explicitly selectable final
  allowlist member. The current local smoke configuration selects only
  gemini-3.1-flash-lite. The local usage report contains five successful
  two-step requests and three timeouts for that model on 2026-09-29; this does
  not verify availability of the other candidates or a successful live
  fallback response. A bounded 2026-09-29 probe recorded one transition from
  gemini-3.8-flash to gemini-3.1-flash-lite, but both attempts on 3.1 returned
  503.

Zašto je ovaj model dovoljan:
  Lanac daje ograničen failover kada izabrani model privremeno nije dostupan.
  Samo članstvo u models.list nije dokaz za generateContent ili function
  calling. `gemini-3.1-flash-lite` je dodat u allowlistu nakon eksplicitnog
  single-model live testa. Zvanična Gemini Developer API pricing stranica
  prikazuje Free-tier input/output cene za taj model; stvarni tier, kvote i
  billing status konkretnog API projekta nisu provereni ovim testom. Pre produkcionog
  korišćenja proveriti aktuelnu cenu i tier limite:
  https://ai.google.dev/gemini-api/docs/pricing

Input (function/tool):
  Tool name: get_game_session_stats
  Args:      { sessionId: string }
  Allowed caller: samo AI Advice flow, samo za sessionId iz originalnog
                  HTTP zahteva (backend proverava poklapanje pre izvršenja)

Output (tool response, vraćeno modelu):
  { output: { score: number, durationSeconds: number, collisions: number,
              foodCollected: number } }

Function calling:
  SDK mode: AUTO; deklarisan je read-only get_game_session_stats alat.
  Backend proverava ime alata, sessionId i raspoloživost statistike pre nego
  što vrati tool rezultat modelu.

Generation limits:
  maxOutputTokens: 256 on both provider responses. Token metadata
  (promptTokenCount, candidatesTokenCount, totalTokenCount) se čuva kada je
  dostupna; 503 se ne tumači kao token-budget problem.

Output (finalni odgovor modela, ka korisniku):
  type AdviceResponse = {
    summary: string;
    recommendation: string;
    category: "movement" | "timing" | "strategy" | "general";
  }
  Provider text mora biti jedan potpun JSON objekat. Code fence, uvodni ili
  završni tekst i dodatni JSON sadržaj odbacuju se kao malformed output.

Timeout:
  Ukupno 15s od početka flow-a, uključujući retry čekanje. Prvi pokušaj dobija
  deo budžeta koji ostavlja vreme za bounded retry, drugi koristi preostalo
  vreme. AbortController signal se šalje kroz Gemini SDK. SDK cancellation je
  klijentski prekid i ne garantuje da provider neće naplatiti već prihvaćen
  zahtev. Prekid HTTP veze takođe abortuje provider signal. Istovremeni zahtevi
  za istu sesiju dele provider poziv, koji se abortuje tek kada se svi klijenti
  odjave. Cancellation se beleži kao `cancelled`; timeout vraća safe error.

Retry and fallback policy:
  Ukupni deadline je 15s za ceo lanac. Svaki model ima najviše 2 pokušaja;
  drugi pokušaj koristi jittered backoff od 1–1,5s pri roku od 15s
  (proporcionalno kraći za kraći test/override deadline). Nema paralelnih modela.
  Retry se radi za provider 408/429/5xx, timeout i mrežne greške. 429 se
  ponavlja najviše jednom na istom modelu, ali ne pokreće fallback.
  Kada je isti-model retry iscrpljen ili više ne staje u ukupan deadline,
  fallback na sledeći allowlisted model dozvoljen je za 408, 500, 502, 503,
  lokalni timeout ili mrežnu grešku bez provider statusa. Retry prepoznaje
  5xx, ali fallback status allowlista je namerno uža od retry klasifikacije.
  Lanac se izvršava sekvencijalno i završava safe error-om kada se iscrpi ili
  istekne deadline.
  400, 401/403, 404, safety/policy odbijanje, malformed output, missing tool
  call i tool-session mismatch ne pokreću fallback. Trenutni kod ne radi
  fallback ni za jedan 404; model ID i podržanu metodu treba prvo proveriti
  izvan korisničkog zahteva. Ovaj 404 slučaj nema zaseban fake-provider test.
  Retry se ne radi za nevalidan lokalni input ili malformed/tool output.

Secrets:
  GEMINI_API_KEY isključivo u backend environment konfiguraciji (.env /
  .env.local, NIKAD commit-ovano). Repo sadrži .env.example sa praznom
  vrednošću (GEMINI_API_KEY=). Frontend nikad ne vidi key niti direktno
  poziva Gemini.

Validation:
  1. Lokalni input (POST /api/ai/advice body) — schema-validiran PRE bilo
     kakvog poziva modelu. Nevalidan -> 400, providerCallCount ostaje 0.
  2. Tool-call argument (sessionId iz function_call) — mora se poklapati sa
     sessionId iz originalnog HTTP zahteva. Ne poklapa se -> safe error,
     alat se NE izvršava.
  3. Finalni odgovor modela — runtime schema provera (npr. zod) protiv
     AdviceResponse. Ne prolazi -> tretira se kao malformed output, NIKAD
     kao success, korisniku ide safe fallback poruka.
      Tekst izvan jednog potpunog JSON objekta nije dozvoljen.

Abuse and retention controls:
  CORS prihvata samo origin-e iz FRONTEND_ORIGINS (podrazumevano localhost i
  127.0.0.1 na portu 5173). Advice endpoint ograničen je na 10 zahteva/minut
  po klijentskoj adresi. Uspešan odgovor se kešira po game session-u; sesije i
  usage log zadržavaju najviše 500 stavki.

Private usage report:
  Token usage se ne prikazuje u UI-ju i ne izlaže se HTTP endpoint-om.
  Backend čuva agregate i do 500 zapisa u Git-ignorisanom fajlu
  server/ai-usage.local.json. Beleže se timestamp, provider, model, status,
  pokušaji, latencija i zbirni prompt/output/total tokeni iz oba Gemini
  odgovora kada su metadata dostupni. Fajl ne sadrži session ID, prompt,
  završni AI odgovor, raw provider error niti secret. Nedostupna metadata
  ostaju null; validirani zapisi se učitavaju i nastavljaju nakon restarta.

User-facing failure:
  { "success": false,
    "message": "AI savet trenutno nije dostupan. Pokušajte ponovo kasnije." }
  Nikad: raw provider error, stack trace, API key, interni payload.
```

## Interni log (odvojen od user-facing poruke)
```json
{
  "operation": "ai.advice",
  "provider": "gemini",
  "model": "gemini-3.8-flash",
  "status": "success | timeout | provider_error | invalid_input | malformed_output | tool_error | rate_limited | cancelled",
  "attempts": 1,
  "latencyMs": 0,
  "fallbackUsed": false,
  "providerAttempts": [{
    "model": "gemini-3.8-flash",
    "attemptKind": "initial | retry | fallback",
    "phase": "initial_tool_call | final_response",
    "providerStatus": 503,
    "status": "provider_error",
    "latencyMs": 0
  }],
  "timestamp": "2026-09-27T17:00:00.000Z",
  "tokenUsage": { "promptTokens": 55, "outputTokens": 21, "totalTokens": 76 }
}
```
Provider i request logovi ne ispisuju session ID, tool arguments, game stats,
prompt, raw response, raw provider error ili stack trace. Provider attempt
telemetry isključivo sadrži model, attempt kind, fazu, status, provider status,
latenciju i dostupne token metadata. Lokalni persisted report dodatno izostavlja
session ID.
