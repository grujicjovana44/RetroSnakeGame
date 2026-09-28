# AI_PROVIDER_CONTRACT.md

```
Provider: Gemini
Model: gemini-3.8-flash (potvrđeno preko ListModels poziva na sopstveni
       API key, 27.09.2026 — stabilna verzija, ne "-preview" ni "-latest")

Zašto je ovaj model dovoljan:
  Tim je izabrao eksplicitni gemini-3.8-flash ID nakon provere dostupnosti na
  svom API nalogu. Kratka analiza četiri numerička polja i jedan read-only
  tool round-trip ne zahtevaju najjači model. Provera cena 2026-09-28 našla je
  jeftiniji `gemini-3.1-flash-lite` (paid tier: $0.25/M input, $1.50/M output;
  `gemini-3.8-flash`: $0.75/M i $3.75/M do 2026-12-31). `gemini-3.1-flash-lite`
  je podržan na nalogu i podržava function calling, ali njegov exploratory
  advice-flow test takođe je dobio provider 503. Zato nije zamenio trenutno
  izabrani model. Cene i tier limiti se menjaju; proveriti zvaničnu pricing
  stranicu i AI Studio limit pre produkcionog korišćenja.
  Fiksni model ID izbegava automatsko menjanje ponašanja preko latest alias-a.

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

Output (finalni odgovor modela, ka korisniku):
  type AdviceResponse = {
    summary: string;
    recommendation: string;
    category: "movement" | "timing" | "strategy" | "general";
  }

Timeout:
  Ukupno 15s od početka flow-a, uključujući retry čekanje. Prvi pokušaj dobija
  deo budžeta koji ostavlja vreme za bounded retry, drugi koristi preostalo
  vreme. AbortController signal se šalje kroz Gemini SDK. SDK cancellation je
  klijentski prekid i ne garantuje da provider neće naplatiti već prihvaćen
  zahtev. Timeout vraća safe error.

Retry policy:
  Najviše 2 pokušaja i jedan backoff od 1s pri standardnom 15s roku.
  RETRY IMA SMISLA za: mrežnu grešku, provider 5xx/unavailable, timeout.
  RETRY NEMA SMISLA za: nevalidan lokalni input, nevalidan tool-call
  argument (npr. sessionId mismatch), malformisan izlaz modela — ove greške
  se neće promeniti ponovnim pokušajem, pa se odmah vraća safe error bez
  trošenja dodatnog poziva.

Fallback:
  Nema fallback model/provider u Core-u (optional/stretch po zadatku). Ako
  Gemini poziv konačno ne uspe posle retry-ja -> safe error korisniku.

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
  "status": "success | timeout | provider_error | invalid_input | malformed_output",
  "attempts": 1,
  "latencyMs": 0,
  "timestamp": "2026-09-27T17:00:00.000Z",
  "tokenUsage": { "promptTokens": 55, "outputTokens": 21, "totalTokens": 76 }
}
```
In-memory log može povezati zapis sa session ID-em radi dijagnostike, ali
lokalni report ga izostavlja. **Trenutna implementacija ne ispunjava ovaj
console-log cilj:** `server/provider.ts` trenutno ispisuje session ID, tool
arguments, stats, parsed advice, raw provider response u jednoj error grani,
kao i raw error message/stack. Ne deliti konzolne logove dok se debug ispisi ne
uklone ili sanitizuju. API key nije namerno ispisan.
