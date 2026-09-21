# CONTEXT_MANIFEST.md

Namena ovog dokumenta: da eksplicitno kažem šta je stvarno poslato coding
agentu (Codex) za implementaciju Session 003 baseline-a, šta je namerno
izostavljeno i zašto — u skladu sa principom "curation beats capacity"
(veći kontekst nije automatski bolji kontekst).

| Izvor                                   | Uključen? | Zašto?                                                              | Prioritet | Rizik                                      |
|------------------------------------------|-----------|-----------------------------------------------------------------------|-----------|---------------------------------------------|
| `GAME_SPEC.md`                          | Da        | Pravila igre, DoD, granice — izvor istine za scope                    | High      | Nizak                                       |
| `BUILD_PROMPT_V1.md`                    | Da        | Sam zadatak/uputstvo agentu                                            | High      | Nizak                                       |
| Postojeći README starter projekta       | Da*       | Setup, komande, konvencije koda                                        | Medium    | Može biti zastareo — proveriti pre oslanjanja |
| Postojeća struktura foldera startera    | Da*       | Da agent poštuje konvencije, ne izmišlja novu strukturu                | Medium    | Nizak                                       |
| Materijal Nedelje 3 (prompt/kontekst)   | Ne        | Objašnjava *kako* pisati prompt čoveku, nije ulaz za agenta            | —         | Šum ako se pošalje agentu direktno          |
| Materijal Sesije 004 (AI Hint / alati)  | Ne        | Van scope-a za ovu nedelju — namerno se ne pominje agentu              | —         | Rizik od preranog širenja scope-a (feature creep) |
| Stari chat transkript / prethodni pokušaji | Ne     | Nije autoritativan izvor pravila; može da unese zastarelu pretpostavku | —         | Konflikt sa aktuelnim `GAME_SPEC.md`        |
| Slučajan web primer/tutorijal za zmijicu | Ne       | Nije potreban; rizik da unese tuđe konvencije ili nepotrebnu složenost | —         | Šum                                         |

\* Uključiti tek kada starter projekat bude potvrđen na času — do tada ova dva
reda ostaju N/A.

## Šta je model stvarno dobio
`GAME_SPEC.md` + `BUILD_PROMPT_V1.md` (+ README/struktura startera kada
postoji). Ništa više.

## Šta je namerno izostavljeno
Sav materijal o AI Hint alatu i tool calling-u (Sesija 004) — ne šaljemo ga
agentu jer bi mogao da "predloži" da odmah implementira i tu funkcionalnost,
što je van scope-a ove nedelje. Takođe izostavljamo opšti materijal o *tome
kako mi pišemo prompt* (Nedelja 3 sesija) — to je znanje za mene, ne kontekst
za agenta.

## Koji izvor ima prioritet pri konfliktu
`GAME_SPEC.md` je nadređen svemu — ako agent predloži nešto što odstupa od
njega (npr. drugačiji win-uslov, dodatnu funkciju), to se tretira kao predlog
za pregled, ne kao prihvaćena izmena scope-a.
