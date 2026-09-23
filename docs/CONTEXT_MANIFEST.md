# Context Manifest — Session 003

Ovaj manifest beleži izvore korišćene za implementaciju Session 003. To je
istorijski zapis konteksta, ne opis starter statusa trenutnog koda.

| Izvor | Uključen? | Razlog | Prioritet | Rizik |
| --- | --- | --- | --- | --- |
| `docs/GAME_SPEC.md` | Da | Pravila igre, DoD i scope | High | Nizak |
| `docs/BUILD_PROMPT_V1.md` | Da | Implementacioni zadatak za Session 003 | High | Može sadržati istorijske opise startera |
| README projekta | Da | Setup i postojeće komande | Medium | Proveriti aktuelnost opisa |
| Postojeća struktura projekta | Da | Poštovanje postojeće arhitekture i test runner-a | Medium | Nizak |
| Materijal za prompt engineering | Ne | Uputstvo za autora prompta, ne zahtev za igru | — | Nepotreban šum |
| Materijal Session 004 | Ne | AI Hint i tool calling su van scope-a | — | Rizik od širenja scope-a |
| Stari chat transkripti | Ne | Nisu autoritativni zahtevi | — | Mogu biti zastareli |
| Nasumični web tutoriali | Ne | Nisu potrebni za definisani zadatak | — | Mogu uneti tuđe pretpostavke |

## Šta je model dobio

`GAME_SPEC.md`, `BUILD_PROMPT_V1.md`, README i postojeću strukturu projekta.

## Šta je namerno izostavljeno

Materijal o AI Hint-u i tool calling-u iz Session 004, prompt engineering
materijal namenjen autoru zadatka, stari chat transkripti i nepovezani tutoriali.

## Autoritet pri konfliktu

`docs/GAME_SPEC.md` je izvor istine za ponašanje i opseg igre. `specs/CONSTITUTION.md`
definiše projektne principe; plan i testovi moraju biti usklađeni sa tom
specifikacijom. Evals i tekući rezultati su u `docs/EVALS.md` i
`specs/specweek03/EVIDENCE.md`.
