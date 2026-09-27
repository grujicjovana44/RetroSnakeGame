# W04 Evidence — RetroSnake AI Advice

## Scenario

Igrac zavrsi Snake partiju i na game-over ekranu klikne `AI Advice`. Backend
cuva minimalne statistike partije u memorijskoj `Map`, a Gemini daje kratak,
strukturisan savet za sledeci pokusaj. AI poziv nije deo real-time game loop-a.

## Architecture

```text
Vite frontend
  POST /api/game/session { score, durationSeconds, collisions, foodCollected }
        |
        v
TypeScript Node backend
  in-memory session Map
  POST /api/ai/advice { sessionId }
        |
        v
Gemini gemini-2.5-flash
  get_game_session_stats(sessionId)
  final AdviceResponse
```

API key se ucitava samo iz `server/.env`. Frontend bundle ne sadrzi key i
frontend nikada ne poziva Gemini direktno.

## Contracts and validation

- `POST /api/game/session` validira cetiri numericka polja i vraca UUID `sessionId`.
- `POST /api/ai/advice` prihvata samo validan UUID koji postoji u session `Map`.
- Gemini je konfigurisan sa tool-calling mode `ANY` i dozvoljen je samo `get_game_session_stats`.
- Backend proverava da tool argument `sessionId` odgovara originalnom HTTP zahtevu.
- Finalni izlaz se parsira kao JSON i proverava Zod runtime schemom:
  `summary`, `recommendation`, `category`.

## Reliability behavior

- Timeout celog provider flow-a: 15 sekundi.
- Retry: najvise 2 pokusaja, samo za timeout/network/unavailable/429/5xx scenario.
- Malformed output, invalid input i session mismatch se ne retry-uju.
- User-facing failure je stabilna poruka bez provider detalja, stack trace-a ili secrets.
- In-memory usage log belezi provider, model, status, attempts, latency i sessionId,
  kao i fazu `initial_tool_call` ili `final_response`, bez API kljuca i raw provider response-a.

## Test evidence

Pokrenuto:

```text
npm.cmd run typecheck    PASS
npm.cmd test             PASS — 4 files, 54 tests
npm.cmd run build        PASS
npm.cmd audit --omit=dev PASS — 0 vulnerabilities
```

Fake-provider evaluacije u `tests/ai.test.ts` pokrivaju A1-A5. A2 eksplicitno
potvrdjuje `provider.callCount === 0` za nevalidan lokalni input. A4 vraca
stvarni malformisan objekat i proverava da ne moze postati success.

## Security checklist

- [x] API key nije u frontend bundle-u.
- [x] API key nije u Git istoriji.
- [x] `server/.env` nije tracked.
- [x] `server/.env.example` postoji bez secreta.
- [x] Backend ne vraca provider secret.
- [x] Log ne sadrzi key niti raw provider response.
- [x] Error response ne sadrzi stack trace ili secrets.
- [x] Input se validira pre provider poziva.
- [x] Output se validira pre prikaza korisniku.

## Live provider status

Uradjena su dva ogranicena live pokusaja ukupno: prvi pre finalne reliability
popravke i drugi posle nje. Oba su zavrsila safe `502` odgovorom; poslednji
interni zapis je `provider_error`, `attempts: 1`, bez raw provider detalja.
Uspeh live integracije nije tvrdjen; provider credentials/model dostupnost ili
provider odgovor zahtevaju dodatnu proveru sa validnim Gemini key-em.

## Known limitation

Sesije i usage log su in-memory i gube se pri restartu backend procesa. To je
prihvatljivo za W04 Core; baza i dashboard nisu u scope-u.
