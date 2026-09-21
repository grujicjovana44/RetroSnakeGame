# GAME_SPEC.md

## Naziv projekta
RetroSnake: Prepreke

## Opis igre
Igrač upravlja zmijom na kvadratnoj mreži u stilu klasičnih 8-bit igara. Zmija se kreće automatski u trenutnom pravcu i raste svaki put kada pojede hranu. Teren sadrži fiksne prepreke koje zmija mora da izbegne pored sopstvenog tela. Zidovi omogućavaju prolazak na suprotnu stranu table (wrap-around mehanika). Pored obične hrane, povremeno se pojavljuje i privremena zlatna hrana sa većim brojem poena. Partija se završava sudarom sa preprekom ili sopstvenim telom.

## Cilj igrača i kontrole
- **Cilj:** Preživeti što duže, sakupiti što više obične i zlatne hrane i oboriti lični rekord (High Score).
- **Kontrole:**
  - **Strelice / WASD:** Promena pravca kretanja (gore, dole, levo, desno).
  - **Razmak (Space):** Restartovanje igre nakon Game Over ekrana.
  - **P / Escape:** Pauziranje i nastavak igre tokom partije.

## Osnovni game loop
1. Zmija se pomera jedno polje u trenutnom pravcu na svaki "tick" (interval određen brzinom iz `GameConfig`).
2. Izlazak van ivice table prebacuje zmiju na suprotnu stranu (wrap-around).
3. Igrač može promeniti pravac pre sledećeg tick-a; direktan obrt za 180° u jednom potezu se ignoriše.
4. Pojedena obična hrana: Zmija raste za jedan segment, skor raste za +10 poena, generiše se nova hrana i postoji 25% šanse da se pojavi zlatna hrana.
5. Zlatna hrana donosi +50 poena i traje ogranicheno vreme (35 koraka) pre nego što nestane sa table.
6. Sudar sa preprekom ili sopstvenim telom prouzrokuje Game Over.
7. Pritisak na 'P' ili 'Escape' prebacuje igru u status `paused`.

## Win/lose uslov
- **Lose:** Sudar sa preprekom ili sopstvenim repom → Game Over ekran sa finalnim skorom, najboljim skorom i opcijom za restart.
- **Win:** Nema fiksne pobede (Endless / High-score mod) — najbolji rezultat se pamti lokalno.

## Ključna pravila
1. Mreža je fiksne veličine 30 × 30 polja (definisana u `GameConfig`).
2. Prepreke su statične i generišu se pre početka partije. Broj prepreka varira u zavisnosti od težine (Easy: 10, Normal: 20, Hard: 35).
3. Zmija ne sme direktno da se okrene za 180° u jednom potezu.
4. Zidovi ne ubijaju zmiju, već omogućavaju prolazak na suprotnu stranu table.
5. Hrana (obična i zlatna) se nikada ne generiše na polju koje već zauzima zmija, prepreka ili druga hrana.
6. Najbolji ostvareni rezultat (High Score) se automatski čuva u `localStorage`.
7. `GameConfig` ima striktnu runtime validaciju.
8. Restart vraća tablu na novo nasumično stanje bez ponovnog učitavanja stranice.

## Minimalni vizuelni zahtev
- HTML5 Canvas prikaz mreže 30x30.
- Glava zmije se vizuelno razlikuje od tela (ima nacrtane oči usmerene u pravcu kretanja).
- Jasno vizuelno razdvajanje prepreka (crvene), obične hrane (roze) i zlatne hrane (svetleće žuta/zlatna).
- Prikaz trenutnog i najboljeg rezultata (High Score) u vrhu ekrana.
- Jasni vizuelni overlays za status `paused` i `game-over`.

## Van scope-a (OUT OF SCOPE)
- Multiplayer i mrežni funkcionalnosti.
- Online leaderboard i korisnički nalozi.
- Prepreke koje se pomeraju tokom partije.
- Custom audio i zvučni efekti.
- AI Hint funkcionalnost i tool calling (dolazi u narednim sesijama).

## Definition of Done (proverljivo)
- [ ] Igra se pokreće u browseru na mreži 30x30 bez grešaka u konzoli.
- [ ] Zmija se kreće u 4 pravca; obrt za 180° u jednom potezu je onemogućen.
- [ ] Zmija prolazi kroz ivice table i pojavljuje se na suprotnoj strani.
- [ ] Zmija raste i skor se ažurira (+10 za običnu, +50 za zlatnu hranu).
- [ ] Zlatna hrana se pojavljuje sa 25% šanse i nestaje nakon 35 koraka.
- [ ] Sudar sa preprekom ili sopstvenim telom pouzdano završava partiju.
- [ ] Taster 'P' ili 'Escape' uspešno pauzira i nastavlja igru.
- [ ] Glava zmije ima nacrtane oči usmerene ka pravcu kretanja.
- [ ] Najbolji skor se trajno čuva u `localStorage`.
- [ ] Prolaze `npm run typecheck` i `npm test` komande.