# EVIDENCE.md

# RetroSnake — Week 3 Evidence

## 1. Submission scope

Ova predaja pokriva **Week 3 / Session 003**.

Session 004 / Week 4 AI tool-calling funkcionalnosti nisu deo ove predaje.

---

## 2. Automated verification

### Typecheck

Command:

```bash
npm run typecheck
```

Result:

```text
PASS
```

---

### Tests

Command:

```bash
npm test
```

Result:

```text
45 tests passed
```

Testovi pokrivaju:

* movement,
* direction validation,
* 180° restriction,
* four-edge wrap-around,
* obstacle collision,
* self collision,
* food,
* golden food,
* pause,
* state validation,
* config validation.

---

### Production build

Command:

```bash
npm run build
```

Result:

```text
PASS
```

---

# 3. Controlled change

## Baseline

Pre izmene, `advanceGame` je prosleđivao poziciju dobijenu iz `movePosition` direktno u `detectCollision`.

Na ivici table:

```text
{x:4,y:2} + RIGHT
        ↓
{x:5,y:2}
        ↓
wrap-around preko ivice
```

## Hypothesis

Ako se sledeća pozicija normalizuje pre collision provere, zmija će moći da napusti jednu ivicu i pojavi se na suprotnoj strani.

## Change

U `src/game.ts` uvedena je `wrapPosition()` funkcija i pozvana iz `advanceGame()` pre `detectCollision()`.

## Validation

Dodati su testovi za:

* right → left,
* left → right,
* top → bottom,
* bottom → top.

## Result

Sva četiri boundary slučaja prolaze.

---

# 4. Test evidence

| Area               | Evidence | Result |
| ------------------ | -------- | ------ |
| Movement           | Vitest   | PASS   |
| 180° turn          | Vitest   | PASS   |
| Right wrap         | Vitest   | PASS   |
| Left wrap          | Vitest   | PASS   |
| Top wrap           | Vitest   | PASS   |
| Bottom wrap        | Vitest   | PASS   |
| Food               | Vitest   | PASS   |
| Golden food        | Vitest   | PASS   |
| Obstacle collision | Vitest   | PASS   |
| Self collision     | Vitest   | PASS   |
| Pause              | Vitest   | PASS   |
| Runtime validation | Vitest   | PASS   |

---

# 5. Browser evidence

Browser verification mora biti izvršena nakon automated testova.

### EVID-01 — Initial game

**Scenario:** Pokretanje igre.

**Expected:**

* Canvas je vidljiv,
* score je prikazan,
* High Score je prikazan,
* zmija i prepreke su vidljive.

**Evidence:** `[SCREENSHOT / RECORDING]`

---

### EVID-02 — Wrap-around

**Scenario:** Zmija prelazi preko ivice.

**Expected:** Zmija se pojavljuje na suprotnoj strani bez Game Over-a.

**Evidence:** `[SCREENSHOT / RECORDING]`

---

### EVID-03 — Game Over

**Scenario:** Zmija udara u prepreku ili sopstveno telo.

**Expected:** Game Over overlay se prikazuje.

**Evidence:** `[SCREENSHOT / RECORDING]`

---

### EVID-04 — Pause

**Scenario:** Pritisak na P ili Escape.

**Expected:** Igra se pauzira i Pause overlay je vidljiv.

**Evidence:** `[SCREENSHOT / RECORDING]`

---

### EVID-05 — Restart

**Scenario:** Space nakon Game Over-a.

**Expected:** Nova igra počinje bez reload-a stranice.

**Evidence:** `[SCREENSHOT / RECORDING]`

---

### EVID-06 — High Score

**Scenario:**

1. ostvariti score,
2. završiti partiju,
3. proveriti High Score,
4. refresh stranice,
5. proveriti da rekord i dalje postoji.

**Expected:** High Score preživljava refresh.

**Evidence:** `[SCREENSHOT / RECORDING]`

---

# 6. Known limitations

Automatizovani unit testovi ne predstavljaju zamenu za browser verification.

Browser evidence mora biti dostavljen za ponašanje koje zavisi od:

* Canvas rendering-a,
* keyboard input-a,
* localStorage-a,
* DOM overlay-a,
* game loop integracije.

---

# 7. Final verification

| Check                  | Result    |
| ---------------------- | --------- |
| `npm run typecheck`    | PASS      |
| `npm test`             | PASS      |
| `npm run build`        | PASS      |
| Browser startup        | TO VERIFY |
| Browser movement       | TO VERIFY |
| Browser wrap-around    | TO VERIFY |
| Browser Game Over      | TO VERIFY |
| Browser pause          | TO VERIFY |
| Browser restart        | TO VERIFY |
| High Score persistence | TO VERIFY |
