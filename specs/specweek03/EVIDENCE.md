# RetroSnake — dokaz za specweek03

## Baseline propust i regresiona provera

Pre korekcije, `src/main.ts` je samo crtao poruku
`Baseline OK — čeka implementaciju`. Nije postojala igra: nije bilo tick-a,
kontrola, zmije, hrane, prepreka, kolizija ni restarta.

Korekcija je proverena testovima u `tests/game.test.ts`:

- kretanje i blokiranje obrta od 180°;
- rast, skor i nova hrana na slobodnom polju;
- kolizija sa zidom, preprekom i sopstvenim telom;
- runtime validno i namerno nevalidno stanje igre;
- stvarni interval težine: easy sporije, hard brže.

## Rezultati provera

Nakon korekcije uspešno su pokrenuti:

- `npm run typecheck`
- `npm test` — 2 test fajla, 16 testova prolazi
- `npm run build`

## Ručna provera u browseru

1. Pokreni `npm run dev` i otvori URL koji Vite ispiše.
2. Sačekaj jedan tick: zelena zmija treba automatski da se pomeri desno.
3. Pritisni strelicu gore ili `W`; zmija treba da skrene gore. Dok se kreće
   desno, pritisni levu strelicu ili `A`; direktni obrt se ignoriše.
4. Dovedi glavu do žute hrane: zmija postaje duža, skor poraste za 10, a nova
   žuta hrana se pojavi van zmije i crvenih prepreka.
5. Namerno udari u ivicu ili crvenu prepreku: Canvas prikazuje GAME OVER i
   finalni skor, a dugme za restart postaje vidljivo.
6. Pritisni Space ili dugme `Restartuj partiju`: nova partija počinje bez
   refresh-a, sa skorom 0 i novim nasumično validnim rasporedom hrane/prepreka.
