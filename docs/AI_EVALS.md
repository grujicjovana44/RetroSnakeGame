# AI_EVALS.md

Automatizovani backend slučajevi rade preko fake provider-a. Lokalni usage
report se proverava kao strukturisan fajl bez session ID-a. Ovi testovi ne
predstavljaju live Gemini potvrdu.

| ID | Scenario | Očekivanje | Test | Status |
|----|----------|-----------|------|--------|
| A1 | Validna game session | Strukturisan savet, jedan provider flow, tokeni sabrani iz oba fake odgovora | `tests/ai.test.ts` | PASS |
| A2 | Nepostojeći/nevalidan `sessionId` | HTTP service odbija pre provider poziva | `provider.callCount === 0`, status 400 | PASS |
| A3 | Provider ne završi odgovor | Dva attempt-a se otkazuju unutar ukupnog timeout budžeta; safe error | `abortCount === 2`, `status=timeout` | PASS |
| A4 | Provider vrati objekat sa nepoznatom `category` | Runtime schema ga odbija; ne prikazuje se kao success | `status=malformed_output`, status 502 | PASS |
| A5 | Tool traži drugi `sessionId` | Tool se ne izvršava za drugu sesiju | Safe error | PASS |
| A6 | Prvi provider attempt je transient failure | Drugi attempt uspe; ukupno dva pokušaja | Response success, call count 2 | PASS |
| A7 | Provider ostaje nedostupan | Bounded failure posle dva pokušaja | Safe error, attempts 2 | PASS |
| A8 | Token metadata postoje/nedostaju | Poznati tokeni se saberu; nepoznati ostaju null | Usage aggregation test | PASS |
| A9 | Dupli i istovremeni zahtev za istu game session | Vraća cache/in-flight rezultat bez drugog provider poziva | `provider.callCount === 1` | PASS |
| A10 | Lokalni usage report | Report čuva agregate i do 500 zapisa, bez session ID-a ili provider sadržaja | `createUsageReport` test | PASS |
| A11 | Origin i učestalost zahteva | Samo allowlist origin; rate limiter odbija prekoračenje | Security helper tests | PASS |
| A12 | Allowlist konfiguracija | Podržan je samo fiksni, uređeni model lanac ili njegov uređeni podskup | `parseGeminiModelChain` | PASS |
| A13 | 3.8 je transient; 3.7 uspe | Posle dva bounded attempt-a na 3.8, 3.7 uspeva; `fallbackUsed=true` i attempt kinds su zabeleženi | `tests/ai.test.ts` | PASS |
| A14 | 3.8 i 3.7 su transient; 3.6 uspe | Fallback prelazi sekvencijalno na 3.6 u istom deadline-u | `tests/ai.test.ts` | PASS |
| A15 | Iscrpljen model lanac | Osam maksimalnih attempt-a daju safe error, bez raw provider detalja | `tests/ai.test.ts` | PASS |
| A16 | Auth, quota i policy greške | 401/403/400 se ne retry-uju; 429 se retry-uje jednom na istom modelu, bez fallback-a | `tests/ai.test.ts` | PASS |
| A17 | Malformed output i tool mismatch | Ne pokreću retry niti fallback | `tests/ai.test.ts` | PASS |
| A18 | JSON format | Validan je samo jedan potpun JSON objekat; code fence i okolni tekst se odbacuju | `tests/ai.test.ts` | PASS |
| A19 | Prekid klijentske veze | Provider se abortuje kada poslednji klijent odustane; prekid jednog od više čekalaca ne prekida deljeni poziv | `tests/ai.test.ts` | PASS |
| A20 | Faza lokalnog timeout-a | Attempt telemetry beleži poslednju poznatu fazu provider-a i kada lokalni timer prekine poziv | `tests/ai.test.ts` | PASS |

Napomena: A2 je najvažniji dokaz za "reliability" deo ocenjivanja — mora
eksplicitno da pokaže da poziv provideru **nije ni napravljen** kada je
lokalni input nevalidan.

## Verification — 2026-09-28

Verification before the model-chain follow-up, 2026-09-28:
`npm exec -- vitest run tests/ai.test.ts` passed 13 tests and `npm test` passed
62 tests. These were fake-provider and local-code results.

Model-chain follow-up verification: AI tests passed 22 tests, `npm test` passed
71 tests, and typecheck/build passed. The bounded live model probe found no
model that returned usable output; the two-step live flow remains unverified.

Cancellation and strict-JSON follow-up, 2026-09-28: `npm exec -- vitest run
tests/ai.test.ts` passed 32 tests, `npm test` passed 81 tests, and
`npm run typecheck` plus `npm run build` passed. These are local/fake-provider
results and do not establish that a live Gemini request succeeds.

Timeout-phase telemetry and backoff-contract follow-up, 2026-09-28:
`npm exec -- vitest run tests/ai.test.ts` passed 33 tests, `npm test` passed
82 tests, and `npm run typecheck` plus `npm run build` passed. The documented
backoff now matches the 1–1.5 second runtime cap at the 15-second deadline.
