# 🐍 RetroSnake: Obstacles

A modern take on the classic **Snake game**, featuring procedural obstacles, standard and golden food, score tracking, High Score persistence, and a strictly typed TypeScript architecture.

> 🎮 Developed as part of the **Retro AI Engineering Challenge — Week 3 / Sessions 003–004**

---

## 📸 Project Overview

**RetroSnake: Obstacles** brings a modern twist to the classic Snake game.

The main focus of the project is on:

* clean and structured architecture
* strict **type safety** with TypeScript
* reliable game-state validation
* precise collision detection
* comprehensive test coverage

---

## ✨ Key Features

### 🗺️ Configurable Grid with Obstacles

The game is played on a configurable grid where both the **grid dimensions and number of obstacles** can be adjusted through the game configuration.

Obstacles are procedurally generated to add variety and prevent repetitive gameplay.

### 🍎 Standard and Golden Food

* **Standard Food** — awards **+10 points** and increases the snake's length.
* **Golden Food ⭐** — has a **25% chance** of appearing after standard food is collected.

  * Awards **+50 points**.
  * Disappears if it is not collected within **35 steps**.

### 💥 Precise Collision Detection

The game detects:

* 🧱 collision with walls and grid boundaries
* 🪨 collision with obstacles
* 🐍 collision with the snake's own body

### 🛑 180° Turn Protection

Immediate reversal into the opposite direction is prevented, avoiding accidental self-collision.

### ⏸️ Pause and High Score

* Pause and resume functionality using `togglePause`.
* Automatic tracking and local persistence of the **High Score**.

### 🧪 Testing and Validation

The project includes game-state validation through `validateGameState`, together with comprehensive **unit and integration tests** implemented using Vitest.

---

## 🛠️ Technologies

| Technology       | Usage                                    |
| ---------------- | ---------------------------------------- |
| **TypeScript**   | Main programming language, `strict mode` |
| **Vite**         | Bundler and development server           |
| **Vitest**       | Unit and integration testing             |
| **HTML5 Canvas** | Game rendering                           |
| **CSS3**         | Styling and retro console interface      |

---

## 🚀 Quick Start

### Prerequisites

Make sure you have the following installed:

* [Node.js](https://nodejs.org/) — version **18 or higher**
* **npm** package manager

### 1. Clone the Repository

```bash
git clone https://github.com/grujicjovana44/RetroSnakeGame.git
cd RetroSnakeGame
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start the Development Server

```bash
npm run dev
```

The application will be available at:

```text
http://localhost:5173
```

---

## 📜 Available Commands

| Command             | Description                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `npm run dev`       | Starts the local Vite development server with hot reload.                                   |
| `npm run build`     | Creates an optimized production build in the `dist/` directory.                             |
| `npm run preview`   | Locally previews the generated production build.                                            |
| `npm run typecheck` | Runs the TypeScript compiler in type-checking mode without emitting files (`tsc --noEmit`). |
| `npm test`          | Runs all unit and integration tests using Vitest.                                           |

---

## 🎮 Controls

| Control                | Action         |
| ---------------------- | -------------- |
| ⬆️ `Arrow Up` / `W`    | Move up        |
| ⬇️ `Arrow Down` / `S`  | Move down      |
| ⬅️ `Arrow Left` / `A`  | Move left      |
| ➡️ `Arrow Right` / `D` | Move right     |
| `Space` / `P`          | Pause / Resume |

---

## 📂 Project Structure

```text
RetroSnakeGame/
├── docs/
│   ├── GAME_SPEC.md
│   ├── BUILD_PROMPT_V1.md
│   └── CONTEXT_MANIFEST.md
│
├── specs/
│   └── specweek03/
│       ├── PLAN.md
│       └── EVIDENCE.md
│
├── src/
│   ├── game.ts
│   ├── main.ts
│   └── types.ts
│
├── tests/
│   ├── game.test.ts
│   └── gameConfig.test.ts
│
├── index.html
├── package.json
└── tsconfig.json
```

### 📁 Main Directories

* **`docs/`** — project specifications and documentation
* **`specs/`** — development plans and verification evidence
* **`src/`** — application source code
* **`tests/`** — unit and integration tests

### 📄 Key Files

* `game.ts` — core game logic: movement, collisions, food, and validation
* `main.ts` — rendering initialization and event listeners
* `types.ts` — interfaces, types, and `GameConfig` contracts
* `game.test.ts` — tests for movement, collision, and game-state logic
* `gameConfig.test.ts` — configuration validation tests

---

## 🧪 Validation & Code Quality

Before every commit or merge, the complete verification pipeline can be run with:

```bash
npm run typecheck && npm test
```

The project should pass:

* ✅ TypeScript type checking with no errors
* ✅ all unit tests
* ✅ all integration tests

---

## 📋 Verification

The correctness and quality of the implementation can be verified using:

```bash
npm run typecheck
```

and:

```bash
npm test
```

This verifies both **static type safety** and the behavior of the game's core logic.

---

## 📝 License

This project was developed for **educational purposes** as part of the **Retro AI Bootcamp**.
