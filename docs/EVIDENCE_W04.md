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
Gemini allowlist (ordered, backend-only)
  gemini-3.8-flash → gemini-3.7-flash → gemini-3.6-flash → gemini-3.5-flash
  get_game_session_stats(sessionId)
  final AdviceResponse

Backend writes usage report to
  server/ai-usage.local.json (gitignored, no session IDs or provider content)
```

API key se ucitava samo iz `server/.env`. Frontend bundle ne sadrzi key i
frontend nikada ne poziva Gemini direktno.

## Contracts and validation

- `POST /api/game/session` validira cetiri numericka polja i vraca UUID `sessionId`.
- `POST /api/ai/advice` prihvata samo validan UUID koji postoji u session `Map`.
- Gemini je konfigurisan sa tool-calling mode `AUTO`; backend prihvata samo očekivani `get_game_session_stats` poziv.
- Backend proverava da tool argument `sessionId` odgovara originalnom HTTP zahtevu.
- Finalni izlaz se parsira kao JSON i proverava Zod runtime schemom:
  `summary`, `recommendation`, `category`.

## Reliability behavior

- Timeout celog provider flow-a: 15 sekundi, ukljucujuci retry cekanje; abort signal se prosledjuje SDK-u.
- Prekid HTTP veze abortuje provider signal. Koalescirani zahtevi koriste broj aktivnih klijenata; provider se prekida tek kada poslednji klijent odustane, a telemetry beleži `cancelled`.
- Finalni provider tekst mora biti jedan potpun JSON objekat; code fences, okolni tekst i dodatni sadržaj se odbacuju.
- Najviše 2 pokušaja po modelu u jednom ukupnom roku od 15s; attempt-i su sekvencijalni.
- 408/5xx/network/timeout imaju jedan retry; 429 ima jedan retry na istom modelu, bez fallback-a.
- Nakon exhausted retry-a, fallback je dozvoljen za 408/500/502/503, timeout ili mrežnu grešku. 400/401/403/404, quota, policy, malformed output, missing tool call i session mismatch ne pokreću fallback.
- `GEMINI_MODEL_CHAIN` prihvata samo neprazan uređeni podskup fiksne allowliste; browser ne može da bira model.
- Svaki Gemini odgovor ima `maxOutputTokens: 256`; token metadata se agregiraju ako ih provider vrati.
- User-facing failure je stabilna poruka bez provider detalja, stack trace-a ili secrets.
- Backend ogranicava CORS na `FRONTEND_ORIGINS`, dozvoljava najvise 10 advice zahteva/minut po klijentskoj adresi i ogranicava sesije na 500.
- Uspeh za istu sesiju se kešira; paralelni dupli zahtevi dele isti in-flight rezultat.
- Usage report cuva timestamp, provider, model, status, attempts, latency, `fallbackUsed`, sanitizovane attempt metadata i dostupne token metadata; session ID, tool args, stats, prompt, raw response/error i stack trace se ne loguju.
- Usage se ne prikazuje u UI-ju i nema javnog usage endpoint-a.
- Git-ignorisan lokalni JSON report cuva agregate i do 500 zapisa, isključuje session ID i učitava se nakon restarta backend procesa.

## Test evidence

Provere pre reliability follow-up-a, 2026-09-28:

```text
npm exec -- vitest run tests/ai.test.ts  PASS — 1 file, 13 tests
npm test                                 PASS — 4 files, 62 tests
npm run typecheck                       PASS
npm run build                           PASS
```

`npm run test:e2e` je poslednji put prijavljen kao PASS — 5 tests za
2026-09-27; nije ponovljen 2026-09-28.

Tokom ponovnog AI testa tri retry/timeout testa su prvo pala jer je servis bio
podešen na jedan pokušaj i 60 sekundi, suprotno ugovoru i testovima. Servis je
vraćen na najviše dva pokušaja i 15 sekundi, a backend ruta je takođe promenjena
sa 60 na 15 sekundi. Posle toga AI testovi i kompletan test suite su prošli.
A2 eksplicitno potvrđuje `provider.callCount === 0`; malformed test proverava
da runtime schema odbija nevalidan objekat.

## Security checklist

- [x] Vlasnik rucno potvrdio da API key nije u frontend bundle-u.
- [x] Vlasnik rucno potvrdio da API key nije u Git istoriji.
- [x] `server/.env` nije tracked.
- [x] `server/.env.example` postoji bez secreta.
- [x] Backend ne vraca provider secret.
- [x] Provider logovi ne ispisuju session ID, tool arguments, game stats,
      parsed advice, raw response, raw provider error ili stack trace.
- [x] Error response ne sadrzi stack trace ili secrets.
- [x] Input se validira pre provider poziva.
- [x] Output se validira pre prikaza korisniku.
- [x] Browser CORS origin je ogranicen na allowlist.

Security checklist je popunjen prema rucnoj potvrdi vlasnika; agent u ovom
prolazu nije ponavljao bundle/history skeniranje.

## Reliability follow-up status

- Fake-provider suite after the follow-up: 22/22 passed, including ordered
  allowlist validation, 3.8→3.7 success, 3.8→3.7→3.6 success, exhausted-chain
  safe failure, and no-fallback classifications. These tests prove local
  routing behavior only, not live model availability.
- Backend logs now contain only model, attempt kind, phase, status, provider
  status, latency, fallback flag, and returned token metadata. Provider
  response cap is 256 output tokens per response.
- Final gates on 2026-09-28: `npm test` 71/71 passed, `npm run typecheck`
  passed, and `npm run build` passed.

## Cancellation and strict-JSON follow-up — 2026-09-28

- Backend observes an aborted request and passes cancellation to the shared
  provider operation. Coalesced requests retain the operation while at least
  one client is waiting; the last disconnect aborts it and records
  `cancelled` telemetry.
- The provider adapter now parses the complete trimmed response as JSON. Code
  fences and prose outside the JSON object are rejected as malformed output.
- `npm exec -- vitest run tests/ai.test.ts`: PASS, 32 tests.
- `npm test`: PASS, 81 tests across 4 files.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- These checks cover local behavior only. The live two-step Gemini flow remains
  unverified; no live provider request was made for this follow-up.

## Timeout-phase telemetry and backoff contract — 2026-09-28

- Provider phase is reported to the service as the call advances, allowing
  locally generated timeout telemetry to record the last known phase.
- `AI_PROVIDER_CONTRACT.md` documents the runtime jitter cap: 1–1.5 seconds
  at the standard 15-second deadline, proportionally shorter for shorter test
  deadlines.
- `npm exec -- vitest run tests/ai.test.ts`: PASS, 33 tests.
- `npm test`: PASS, 82 tests across 4 files.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- This is local evidence only and does not verify live provider availability.

## Live provider status

Live evidence remains separate from fake-provider evidence. The configured
chain is not considered live-verified until a model completes the same
two-step `get_game_session_stats` tool flow and returns schema-valid
`AdviceResponse`. No success is inferred from models.list or unit tests.

Postojeca evidencija belezi dva ogranicena pokusaja sa ranijim modelom
`gemini-3.8-flash`, oba sa safe `502` odgovorom. Kasnija dva zahteva sa
`gemini-3.8-flash` takodje su vratila safe `502` i `provider_error` nakon po
jednog attempt-a (758 ms i 836 ms), pre uklanjanja `allowedFunctionNames` iz
`AUTO` konfiguracije. Nakon te korekcije live test nije ponovljen; uspeh jos
nije potvrđen. Key se ne unosi u repo ili chat.

### Dodatna dijagnostika — 2026-09-28

- `GEMINI_API_KEY` je prisutan lokalno; `models.list` je uspeo, što potvrđuje
  da ključ može da se autentikuje. Sam ključ nije ispisan.
- Lista naloga uključuje `gemini-3.8-flash`, `gemini-3.1-flash-lite` i
  `gemini-3.5-flash-lite`; `gemini-1.5-flash` nije vraćen kao dostupan model.
- Minimalni direktni `generateContent` poziv ka `gemini-3.8-flash` vratio je
  HTTP `503 UNAVAILABLE` sa porukom da model trenutno ima veliku potražnju.
  Ovo je provider odgovor, a ne dokaz uspešnog advice flow-a.
- Privremeni end-to-end pokušaj sa `gemini-3.1-flash-lite` završio se safe
  `502` posle dva pokušaja; interni status je bio `503` u
  `initial_tool_call`. Model nije usvojen kao produkciona konfiguracija.
- Zvanična dokumentacija navodi da `gemini-3.1-flash-lite` podržava function
  calling i košta manje od izabranog modela, ali ovaj nalog/projekat još nema
  uspešan live test sa njim. Tačni RPM/TPM/RPD limiti zavise od tier-a i vide
  se u AI Studio rate-limit prikazu.
- Live Gemini uspeh nije potvrđen. Fake-provider PASS ne treba prikazivati kao
  dokaz da je Gemini servis dostupan.

### Bounded model-chain smoke — 2026-09-28

- Probe timestamp: `2026-09-28T19:33:51.117Z`. Repository HEAD at probe time:
  `16a6709`; the follow-up implementation was uncommitted, so this is the base
  revision and not a commit identifier for the changes.
- `models.list` authenticated successfully and returned all four allowlisted
  model IDs. This is an authentication/listing result, not generation proof.
- One minimal `generateContent` request per model was attempted, with an
  8-token output cap and no retry. Sanitized results: `gemini-3.8-flash`:
  provider 503 in 1,071 ms; `gemini-3.7-flash`: provider 503 in 2,018 ms;
  `gemini-3.6-flash`: HTTP response without usable text in 1,434 ms (prompt
  tokens 4, total tokens 9); `gemini-3.5-flash`: network/timeout in 10,484 ms.
- None produced usable text, so the two-step `get_game_session_stats` flow was
  not sent. No live model was selected and no live fallback success is claimed.
  Additional calls were stopped to respect the bounded smoke-test budget.
- Controlled fallback transitions are proven by fake-provider tests only;
  they are not live provider evidence.

## Known limitation

Game sesije su in-memory i gube se pri restartu backend procesa. Privatni usage
report čuva do 500 zapisa; poznati tokeni se prikazuju samo kada Gemini vrati
usage metadata. Report ne izračunava cenu. Pricing poređenje za izabrani model
nije zabeleženo. Podela doprinosa oba člana tima nije dokumentovana ovim
prolazom i treba da je dopune Jovana i Jelena.
