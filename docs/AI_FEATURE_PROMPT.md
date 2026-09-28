# AI_FEATURE_PROMPT.md

> Historical implementation prompt. Its dependency suggestions and pre-code
> instructions describe the initial proposal, not the current implementation.
> The current provider package is `@google/genai`; use
> `AI_FEATURE_SPEC.md`, `AI_PROVIDER_CONTRACT.md`, and `EVIDENCE_W04.md` as the
> current behavior and verification record.

Pre implementacije:
1. Sažmi razumevanje zadatka.
2. Navedi plan u nekoliko koraka.
3. Navedi nejasnoće ili pretpostavke.
4. Ne proširuj scope bez eksplicitnog razloga.

---

## Uloga
Nastavljaš na postojećem RetroSnake projektu (W03 Core je gotov). Ovo je W04:
dodaješ TAČNO JEDNU AI funkcionalnost — "AI Advice" posle game-over-a — uz
bezbednu frontend/backend arhitekturu i pravi Gemini tool-calling flow.

Prati `AGENTS.md` (trajna pravila ovog repoa) i sledeće dokumente kao izvor
istine: `docs/AI_FEATURE_SPEC.md`, `docs/AI_PROVIDER_CONTRACT.md`,
`docs/AI_EVALS.md`.

## Cilj i očekivani rezultat
1. Razdvoj frontend/backend: postojeća igra ostaje frontend (Vite), dodaj
   mali TypeScript backend (Node) koji izlaže:
   - `POST /api/game/session` — prima sirove stats završene partije, čuva ih
     in-memory (Map je dovoljno za Core), vraća `sessionId`.
   - `POST /api/ai/advice` — prima `{ sessionId }`, pokreće Gemini
     tool-calling flow opisan u `AI_PROVIDER_CONTRACT.md`, vraća
     `AdviceApiResponse`.
2. Gemini API key isključivo u backend `.env` (dodaj `.env.example` sa
   praznim `GEMINI_API_KEY=`). Frontend NIKAD ne vidi key.
3. Implementiraj STVARNI tool-calling round-trip (ne direktan structured
   output bez tool-a): model prvi put traži `get_game_session_stats`,
   backend validira i izvršava, model tek onda vraća finalni
   `AdviceResponse`.
4. Frontend: dugme "AI Advice" na game-over ekranu, poziva
   `/api/game/session` pa `/api/ai/advice`, prikazuje rezultat ili safe
   error poruku (loading state dok se čeka, jer poziv traje sekunde).

## Granice — šta NE sme da se radi
- Ne implementiraš AI Hint tokom aktivne partije (real-time) — to nije ovaj
  feature i eksplicitno je van scope-a.
- Ne praviš fallback provider/model (optional/stretch, ne sad).
- Ne šalješ API key frontend-u ni u jednom obliku (ni u response body-ju).
- Ne loguješ API key ni sirov provider response.
- Ne praviš neograničen retry — striktno bounded (max 2 pokušaja) i samo za
  transient greške (videti tačnu listu u `AI_PROVIDER_CONTRACT.md`).
- Ne tretiraš malformisan izlaz modela kao success ni pod kojim uslovom.
- Ne veruj `sessionId` iz tool-call argumenta bez provere protiv originalnog
  HTTP zahteva.

## Nove zavisnosti — traži odobrenje
Za backend će verovatno trebati: Gemini SDK (`@google/generative-ai`), mali
HTTP framework (npr. `express` ili Vite-ov ugrađeni middleware ako je
dovoljan), i `zod` za runtime validaciju. Ovo je legitiman izuzetak od
"ne dodaji zavisnosti" pravila iz `AGENTS.md`, ALI mi prvo predloži tačan
spisak paketa i jednu rečenicu zašto svaki treba, pa čekaj potvrdu pre
`npm install`.

## Provere koje treba da izvršiš
1. Napravi fake/mock Gemini provider PRE bilo kakvog live poziva — sav
   test suite (svi slučajevi iz `AI_EVALS.md`) prolazi preko fake providera.
2. Tek kada su svi fake testovi zeleni, uradi JEDAN ograničen live poziv da
   potvrdiš stvarnu integraciju (ne trošiti live pozive na svaki test run).
3. `npm run typecheck` i `npm test` (i frontend i backend, ako su odvojeni
   package.json-ovi) moraju proći.
4. Eksplicitno pokaži test koji dokazuje `providerCallCount === 0` za
   nevalidan lokalni input (A2 iz `AI_EVALS.md`).
5. Pokreni "security checklist" iz zadatka pre nego što kažeš da je gotovo:
   key nije u frontend bundle-u, nije u git history-u, `.env` nije
   commit-ovan, error response ne sadrži stack trace/secrets.

## Obavezan prvi korak
Pre bilo kakve izmene koda:
1. Pregledaj `AI_FEATURE_SPEC.md`, `AI_PROVIDER_CONTRACT.md` i postojeću
   strukturu repoa, predloži kratak plan (koje fajlove/foldere praviš,
   kojim redom — npr. prvo backend skeleton, pa fake provider, pa testovi,
   pa live provider integracija, pa frontend dugme).
2. Navedi pretpostavke koje spec ostavlja otvorene (npr. tačan naziv
   Gemini modela, tačan HTTP framework, struktura foldera za backend).
3. Navedi nejasnoće i **stani i pitaj** ako nešto nije dovoljno precizno.
4. Ne kreći sa implementacijom, a pogotovo ne sa `npm install`, dok plan i
   spisak zavisnosti ne potvrdim.

## Stop/ask pravilo
Ako naiđeš na odluku koja bi značila da se API key na bilo koji način
približi frontend-u, ili da se malformisan output tretira kao uspeh, ili da
se dodaje funkcionalnost van `AI_FEATURE_SPEC.md` — stani i pitaj.
