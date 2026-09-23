# SPEC.md — Session 003 requirements

Ovaj dokument formalizuje zahteve iz `docs/GAME_SPEC.md`. Ako dođe do
konflikta, `docs/GAME_SPEC.md` ima prednost.

## Functional requirements

- Igra koristi podrazumevanu mrežu `30 × 30`.
- Težine koriste 30, 70 i 90 prepreka za Easy, Normal i Hard.
- Zmija se kreće u četiri pravca i ne može da napravi direktan obrt od 180°.
- Izlazak preko ivice table prebacuje zmiju na suprotnu ivicu.
- Obična hrana donosi 10, a zlatna 50 poena.
- Zlatna hrana traje 35 tickova i pojavljuje se sa verovatnoćom 25%.
- Sudar sa preprekom ili sopstvenim telom završava partiju.
- P i Escape menjaju stanje pause/resume.
- Space nakon game-over stanja pokreće novu partiju bez reload-a.
- High Score se čuva u `localStorage`.

## Quality requirements

- `GameConfig` i `GameState` imaju runtime validaciju.
- Core logika je testabilna nezavisno od Canvas renderovanja.
- Ne dodaju se nove zavisnosti niti Session 004 funkcionalnosti.

## Acceptance evidence

Automated evidence se proverava komandama iz `PLAN.md`. Browser ponašanja moraju
imati runtime dokaz u `EVIDENCE.md` pre nego što se označe kao završena.
