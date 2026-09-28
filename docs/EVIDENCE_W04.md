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
Gemini gemini-3.8-flash
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
- Retry: najvise 2 pokusaja i jedan retry delay od 1 sekunde; samo za transient timeout/network/unavailable/429/5xx scenario.
- Malformed output, invalid input i session mismatch se ne retry-uju.
- User-facing failure je stabilna poruka bez provider detalja, stack trace-a ili secrets.
- Backend ogranicava CORS na `FRONTEND_ORIGINS`, dozvoljava najvise 10 advice zahteva/minut po klijentskoj adresi i ogranicava sesije na 500.
- Uspeh za istu sesiju se kešira; paralelni dupli zahtevi dele isti in-flight rezultat.
- Usage report cuva timestamp, provider, model, status, attempts, latency i dostupne token metadata; sirov provider odgovor se ne loguje.
- Usage se ne prikazuje u UI-ju i nema javnog usage endpoint-a.
- Git-ignorisan lokalni JSON report cuva agregate i do 500 zapisa, isključuje session ID i učitava se nakon restarta backend procesa.

## Test evidence

Provere ponovljene 2026-09-28:

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
- [ ] Provider trenutno ispisuje session ID, tool arguments, game stats,
      parsed advice, raw response u missing-tool-call slučaju i ceo error
      stack u konzolu. Privatnosni zahtev za console logove nije ispunjen.
- [x] Error response ne sadrzi stack trace ili secrets.
- [x] Input se validira pre provider poziva.
- [x] Output se validira pre prikaza korisniku.
- [x] Browser CORS origin je ogranicen na allowlist.

Security checklist je popunjen prema rucnoj potvrdi vlasnika; agent u ovom
prolazu nije ponavljao bundle/history skeniranje.

## Live provider status

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

## Known limitation

Game sesije su in-memory i gube se pri restartu backend procesa. Privatni usage
report čuva do 500 zapisa; poznati tokeni se prikazuju samo kada Gemini vrati
usage metadata. Report ne izračunava cenu. Pricing poređenje za izabrani model
nije zabeleženo. Podela doprinosa oba člana tima nije dokumentovana ovim
prolazom i treba da je dopune Jovana i Jelena.
