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

Napomena: A2 je najvažniji dokaz za "reliability" deo ocenjivanja — mora
eksplicitno da pokaže da poziv provideru **nije ni napravljen** kada je
lokalni input nevalidan.

## Verification — 2026-09-28

`npm exec -- vitest run tests/ai.test.ts` passed: 1 file, 13 tests.
`npm test` passed: 4 files, 62 tests. `npm run typecheck` and
`npm run build` also passed. These are fake-provider and local-code results;
they do not establish that a live Gemini request succeeds.
