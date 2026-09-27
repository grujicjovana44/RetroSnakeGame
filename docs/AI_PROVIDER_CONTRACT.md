# AI_PROVIDER_CONTRACT.md

```
Provider: Gemini
Model: gemini-2.5-flash (potvrđeno preko ListModels poziva na sopstveni
       API key, 27.09.2026 — stabilna verzija, ne "-preview" ni "-latest")

Zašto je ovaj model dovoljan:
  Zadatak je kratka analiza 4 numerička polja + jedan tool-call round-trip —
  ne treba mu duboko rezonovanje ni najnovija generacija. Od stabilnih
  Flash-Lite verzija dostupnih na ovom nalogu (2.5, 3.1, 3.5), 2.5 je
  najjeftinija po tokenu, a zreo je i pouzdan (dostupan od jula 2025).
  Namerno NIJE korišćen "gemini-flash-lite-latest" alias, jer se taj alias
  sam menja kad Google objavi novu verziju — to bi ugrozilo reproduktivnost
  build-a (isti zahtev, drugačiji model, drugačiji rezultat kroz vreme).
  Namerno NIJE korišćen nijedan "-preview" model iz istog razloga zbog kog
  je "gemini-2.0-flash" ugašen bez pretičke najave — preview modeli nisu
  garantovano stabilni za predaju zadatka.

Input (function/tool):
  Tool name: get_game_session_stats
  Args:      { sessionId: string }
  Allowed caller: samo AI Advice flow, samo za sessionId iz originalnog
                  HTTP zahteva (backend proverava poklapanje pre izvršenja)

Output (tool response, vraćeno modelu):
  { score: number, durationSeconds: number, collisions: number,
    foodCollected: number }

Output (finalni odgovor modela, ka korisniku):
  type AdviceResponse = {
    summary: string;
    recommendation: string;
    category: "movement" | "timing" | "strategy" | "general";
  }

Timeout:
  15s za CEO flow (prvi poziv + tool round-trip + finalni odgovor), ne po
  pojedinačnom pozivu. Implementirati preko AbortController / Promise.race.
  Ako istekne: kontrolisan prekid, korisnik dobija safe error, ne "visi".

Retry policy:
  Bounded retry, max 2 pokušaja, backoff 1s -> 2s.
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
  "model": "gemini-2.5-flash",
  "status": "success | timeout | provider_error | invalid_input | malformed_output",
  "attempts": 1,
  "latencyMs": 0,
  "sessionId": "..."
}
```
Ne loguje se API key niti sirov provider response ako sadrži nešto
neočekivano — samo status/metriku.
