# AI_EVALS.md

Sva četiri slučaja rade preko **fake provider-a** (mock koji simulira Gemini
odgovore, uključujući function-call korak) — pravi live poziv je poslednji,
jednokratni korak potvrde integracije, ne deo test suite-a.

| ID | Scenario | Očekivanje | Obavezni dokaz | Status |
|----|----------|-----------|----------------|--------|
| A1 | Validan `sessionId`, fake provider vraća ispravan tool-call pa ispravan `AdviceResponse` | Uspešan strukturisan `advice` prikazan korisniku | response body + providerCallCount = 1 | PASS |
| A2 | Nepostojeći/nevalidan `sessionId` u POST /api/ai/advice | Backend odbija PRE poziva modelu | `providerCallCount === 0`, status 400 | PASS |
| A3 | Fake provider simulira timeout / provider error | Kontrolisan prekid, safe error korisniku, ne stack trace | status + attempts u internom logu, user-facing poruka | PASS |
| A4 | Fake provider vraća malformisan finalni izlaz (npr. nedostaje `category` ili pogrešan tip) | Odgovor se odbija, NE prikazuje se kao success | schema-validation assertion, `success: false` | PASS |

## Dodatno (preporučeno, ne obavezno za Core)
| ID | Scenario | Očekivanje | Status |
|----|----------|-----------|--------|
| A5 | Model zatraži tool sa `sessionId` koji se NE poklapa sa originalnim zahtevom | Alat se ne izvršava, safe error, `sessionId mismatch` u internom logu | PASS |
| A6 | Retry scenario — fake provider prvi put baca transient grešku, drugi put uspeva | Tačno 2 pokušaja, drugi uspešan, korisnik vidi rezultat, ne grešku | Nije u Core test fixture-u |

Napomena: A2 je najvažniji dokaz za "reliability" deo ocenjivanja — mora
eksplicitno da pokaže da poziv provideru **nije ni napravljen** kada je
lokalni input nevalidan.
