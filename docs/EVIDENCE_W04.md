# W04 Evidence — RetroSnake AI Advice

Napomena o vremenskoj liniji: sekcije sa datumom 2026-09-28 su istorijski
rezultati. Najnoviji status je u odeljku "Mentor review reconciliation and
live verification — 2026-09-29"; on supersedes raniju tvrdnju da nijedan live
advice poziv nije uspeo.

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
  → gemini-3.1-flash-lite (explicit selection; not in default chain)
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

Verification update — 2026-09-29: all security controls listed in the W04
assignment are marked PASS based on source/test review and owner confirmation.
In this pass, `git check-ignore` confirmed `server/.env` is ignored,
`git ls-files` confirmed it is not tracked, and a search of the built frontend
assets found no `GEMINI_API_KEY` or `API_KEY` variable markers. Source review
confirmed that the provider key is read by the backend, safe user-facing errors
are generic, provider telemetry is sanitized, and CORS/rate limits are
configured. Existing tests cover invalid-input zero-provider-call and output
validation. The no-secret-in-Git-history item remains based on the owner's
manual confirmation and was not independently rescanned in this pass.

These results mean the assignment-defined security checklist passed.
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

## Live provider status before 2026-09-29

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

## Mentor review reconciliation and live verification — 2026-09-29

### Review claim check

| Review statement | Current repository/evidence | Finding |
| --- | --- | --- |
| `server/server.ts` hardcodes `gemini-3.8-flash`; no chain exists | Server reads `GEMINI_MODEL_CHAIN`, parses the backend allowlist and creates providers per model. The default chain remains 3.8 → 3.7 → 3.6 → 3.5. The current local environment selects only `gemini-3.1-flash-lite`. | Stale for current code. `GeminiAdviceProvider` still has a 3.8 constructor default, but the server passes the configured model explicitly. |
| Fallback chain, `fallbackUsed`, and tests are missing | Service has sequential per-model attempts, a shared 15-second deadline, bounded retry/fallback, and `fallbackUsed`. Fake tests cover 3.8 → 3.7, 3.8 → 3.7 → 3.6, exhausted chain, and no-fallback cases. | Implemented and locally tested; live fallback is not verified. |
| `models.list` does not prove generation/tool calling | Correct. It proves listing/authentication only. | The private local usage report records five successful Advice requests for `gemini-3.1-flash-lite` on 2026-09-29; they completed the real tool round-trip and passed response validation. |
| Live 3.8 returned high-demand 503 | The 2026-09-28 bounded probe recorded provider 503 for 3.8 (and 3.7). | Historical provider availability result; not the current selected model's result. |
| Earlier alternate-model attempts were not classified | The 3.1 timeout log recorded two local timeout attempts and phases; a later 3.1 request succeeded. | The observed attempts are classified below. They do not establish a permanent availability guarantee. |
| Contract/evidence should wait for an exact live model success | The local usage report records five 3.1 Flash Lite successes and three timeouts. | The docs record repeated live success for this model and keep other models/live fallback unverified. |
| Provider debug logs expose session/tool/game/raw provider data | `server/provider.ts` contains no provider-content console logging; server-level advice telemetry contains sanitized fields only. Usage telemetry tests exclude session IDs and stack text. | Stale for current implementation. Source inspection confirms sanitization; no process-console capture test was run. |
| Gemma needs a separate adapter, not a model-string swap | The accepted final test used the existing Gemini API key and Gemini model. | Gemma was not implemented or used for this live result. No Gemma capability is claimed. |

### Fallback policy verification

The implementation uses one logical request with a 15-second overall
deadline, at most two attempts per model, and sequential model transitions.
For a 15-second request, the same-model retry delay is bounded to at most
1.5 seconds; the remaining model budget is reserved where possible. The
configured single-model chain therefore retries only the same model and cannot
fall back elsewhere.

Automated evidence:

- Fake `503` twice on `gemini-3.8-flash`, then success on
  `gemini-3.7-flash`; the test asserts `initial`/`retry`/`fallback` attempt
  kinds and `fallbackUsed=true`.
- Fake failures on 3.8 and 3.7, then success on 3.6.
- Exhausted chain returns a generic safe error after 8 fake attempts and
  records sanitized telemetry.
- `401`, `400`, `403` and `429` do not fall back; 429 can retry once on the
  same model and honors `Retry-After` if the deadline allows. Malformed output
  and tool-session mismatch do not retry/fallback.
- The tests use a fake 503 for chain transitions. They do not separately
  prove fallback for every 500/502/network/timeout variant. Provider 404 has
  no dedicated test and is not fallback-eligible in current code.

### Live calls and exact outcomes

1. **2026-09-29 timeout run:** model `gemini-3.1-flash-lite`, overall
   `status=timeout`, `attempts=2`, `latencyMs=15002`, `fallbackUsed=false`.
   Attempt 1 timed out in `final_response` at 7505 ms; attempt 2 timed out in
   `initial_tool_call` at 5995 ms. Token metadata totaled 213 prompt, 51
   output, 264 total. No provider HTTP status was reported for these local
   timeout attempts, so this is not classified as provider 503.
2. **2026-09-29 successful runs:** the first curl found no backend listening
  and failed before an advice/provider request. The private local usage report
  records five synthetic-session Advice requests with `status=success` and
  three with `status=timeout` for `gemini-3.1-flash-lite`. Every success
  passed runtime schema validation and had `fallbackUsed=false`; the three
  timeouts are retained as failures, not counted as successes. The first
  recorded success took 3833 ms in one attempt; a later success took 13587 ms
  over two attempts (first attempt timed out, retry succeeded); the latest
  success at `2026-09-29T17:12:23Z` took 3910 ms in one attempt. Its sanitized
  token counts were 441 prompt, 166 output, 607 total. Raw advice, session IDs
  and API key are intentionally omitted.

The official Gemini pricing page lists free-tier input/output for
`gemini-3.1-flash-lite`, subject to free-tier availability and limits. This
workspace has no authenticated account-tier evidence, so the actual project's
billing tier, quota and charges are **not verified**. The account owner can
check the project's Billing Tier on AI Studio Projects, usage at AI Studio
Usage, and active quotas at AI Studio Rate Limits:
https://ai.google.dev/gemini-api/docs/pricing
https://aistudio.google.com/projects
https://aistudio.google.com/usage
https://aistudio.google.com/rate-limit

The owner-provided AI Studio Usage screenshots (project `Gemini Project`,
captured 2026-09-29) show activity for both `Gemini 3.1 Flash Lite` and
`Gemini 3.8 Flash`. The expanded dashboard shows multiple API keys (including
keys labeled Gemini API Key 2, 3, and 4) and error categories `400
BadRequest`, `404 NotFound`, `429 TooManyRequests`, and `503
ServiceUnavailable`. These charts aggregate project/API-key activity; their
per-model counts are not legible enough to reconcile with the private local
report or attribute an error to one Advice request. They support the claim that
the project made live API requests and encountered those provider error
categories, but do not prove a specific billing tier or exact number of
successful Advice flows. The screenshots were reviewed in-chat and are not
archived as repository files.

Gemma 4 was considered after mentor feedback, but the accepted immediate goal
was a live call through the existing Gemini API key. The successful call above
is Gemini, not Gemma; no local model, new provider, dependency or Gemma live
claim is part of this evidence.

### Latest local verification — 2026-09-29

- `npx vitest run tests/ai.test.ts`: PASS, 33 tests (focused run before the
  latest full verification).
- `npm run typecheck`: PASS.
- `npm test`: PASS, 82 tests across 4 files.
- `npm run build`: PASS.
- `npm run test:e2e`: PASS, 5 Playwright tests. The initial rerun failed all
  5 tests because the configured frontend URL had no server listening; adding
  Playwright `webServer` startup fixed the test setup. All 5 passed afterward.
- No code was changed during this documentation reconciliation. The code
  changes enabling explicit 3.1 Flash Lite selection and its parser test were
  already present and were included in these checks.

All currently defined local verification gates have now passed: typecheck,
the complete Vitest suite, Playwright E2E, and production build. This means
all tests/checks defined by the repository were green in this run; it does not
claim that every conceivable input or every live fallback model has been
tested.

Reliability summary: all defined local retry, timeout, cancellation, fallback,
validation, unit and E2E checks pass. Live Gemini usage is not uniformly
successful: the private report records five successes and three timeouts for
`gemini-3.1-flash-lite`, and the owner-provided AI Studio dashboard shows
project-level 400/404/429/503 errors across multiple keys/models. Therefore the
implemented bounded-retry/safe-failure controls pass, while uninterrupted
provider availability is not claimed.
