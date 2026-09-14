# Architecture Overview — QuizVerse

> Last updated: 2026-09-14 | Version: 0.1.0

## System in one sentence

QuizVerse is a **three-layer browser application** that turns a teacher's topic choice into a complete, game-show-quality educational quiz — with zero dependencies, zero build step, and zero runtime cost.

---

## The Three Layers

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 3 — GAME-SHOW UX                                      │
│  app/screens/   app/audio.js   app/illustrations.js          │
│  mascot · animation · sound · fullscreen · keyboard nav      │
├──────────────────────────────────────────────────────────────┤
│  Layer 2 — GAME ENGINE                                       │
│  packages/game-engine/engine.js                              │
│  5 stages · lifelines · timer · scoring · winner logic       │
├──────────────────────────────────────────────────────────────┤
│  Layer 1 — AI QUIZ BRAIN                                     │
│  packages/ai-service/                                        │
│  generation · 10-point validator · material mode · packs     │
└──────────────────────────────────────────────────────────────┘
```

**Hard rule:** AI runs at **generation time only**. After the teacher clicks "Generate", a frozen *Quiz Package* (plain JSON) is stored in `localStorage`. Gameplay reads only that — zero AI cost per play, full offline support.

---

## Data Flow

```
Teacher input (class + topic / PDF)
        │
        ▼
  AI_SERVICE (Layer 1)
  ├── prompt builder (class-aware templates)
  ├── provider adapter  (OpenAI / Anthropic / Gemini / Ollama / mock / offline)
  ├── tolerant JSON parser
  ├── 10-point validator
  ├── bounded repair loop (≤3 passes)
  └── stage builder → Quiz Package (frozen JSON)
        │
        ▼
  localStorage  ←──── quiz-editor (edit / delete / version history)
        │
        ▼
  GAME ENGINE (Layer 2)
  ├── 5 stage runner
  ├── lifeline handler (50-50, audience, hint, skip)
  ├── timer (pause / resume)
  └── score accumulator → result object
        │
        ▼
  GAME-SHOW UX (Layer 3)
  ├── name screen → briefing → question board → feedback
  ├── stage-complete → winner / great-effort → review
  ├── audio synth (11 sounds + music, zero asset files)
  └── mascot QUIZO (6 expressions, EN/HI lines)
```

---

## File Map

| Path | Layer | Responsibility |
|------|-------|----------------|
| `app/screens/teacher.js` | 3 | Teacher flow: landing → create → generate → preview/editor → dashboard |
| `app/screens/game.js` | 3 | Student flow: name → briefing → board → winner → review |
| `app/quiz-service.js` | 3→1 | Generation router: live AI → offline fallback |
| `app/ai-client.js` | 3→1 | Browser transport (proxy-first, direct-fallback) |
| `app/document-ingest.js` | 3 | PDF / DOCX / TXT extraction — all in-browser, no upload |
| `app/quiz-editor.js` | 3 | Inline edit, delete, regenerate-one, version snapshots |
| `app/audio.js` | 3 | Web Audio synth — 11 original sounds + music loop |
| `app/illustrations.js` | 3 | 33 original inline SVG scenes |
| `app/mascot.js` | 3 | QUIZO mascot, 6 expressions, bilingual dialogue |
| `app/styles.css` | 3 | Design tokens, tier A/B/C theming, motion spec |
| `packages/game-engine/engine.js` | 2 | Pure, framework-free, fully unit-tested game logic |
| `packages/ai-service/quiz-builder.js` | 1 | Stage builder, spare pool, Quiz Package serialiser |
| `packages/ai-service/validator.js` | 1 | 10-point validator + repair loop |
| `packages/ai-service/prompts.js` | 1 | Class-aware prompt templates (EN + HI) |
| `packages/ai-service/provider.js` | 1 | Provider adapters: OpenAI, Anthropic, Gemini, Ollama |
| `packages/ai-service/mock-provider.js` | 1 | Deterministic mock for testing |
| `packages/ai-service/material-extract.js` | 1 | Server-side material quality scoring |
| `server.mjs` | — | Optional Node server: API proxy, teacher auth, storage |
| `server/api.js` | — | REST surface: `/api/health`, `/api/ai/chat`, quiz CRUD |
| `server/auth.js` | — | Teacher sessions (JWT) |
| `server/storage.js` | — | Storage adapter: `json` (file) ↔ `postgres` |
| `server/schema.sql` | — | Postgres schema (teachers, quizzes, results) |
| `tools/build-static.mjs` | — | Copies `app/` + `packages/` → `dist/` (zero bundler) |
| `tools/smoke.mjs` | — | CDP end-to-end browser tests |
| `tools/design-qa.mjs` | — | 44 objective design checks (contrast, touch targets) |

---

## Age-Adaptive Visual Tiers

| Tier | Classes | Theme | Typography | Features |
|------|---------|-------|------------|----------|
| **A — Playful Planet** | 1–2 | Bright, large, illustrated | 2rem+ | No elimination, big touch targets |
| **B — Quiz Arena** | 3–5 | Game-show arena | 1.25rem | Full lifelines, suspense timing |
| **C — Neon Nexus** | 6–8 | Dark, futuristic, academic | 1rem | Compact, full keyboard nav |

---

## Storage Model

| Store | Keys | What lives there |
|-------|------|-----------------|
| `localStorage` | `qv_draft_*` | Teacher's create-form draft (persists page refresh) |
| `localStorage` | `qv_quiz_*` | Saved Quiz Packages (JSON) |
| `localStorage` | `qv_results_*` | Per-play result objects |
| `localStorage` | `qv_settings` | Engine selection, sound toggle, reduced-motion |
| Server (optional) | Postgres / JSON file | Teacher accounts, server-synced quizzes + results |

---

## What the optional Node server adds

The game works 100% without the server. The server adds:

- **Teacher accounts** — JWT sessions, passwords (bcrypt)
- **Cross-device quiz sync** — quizzes stored in Postgres/file, shared across devices
- **AI key proxy** — `/api/ai/chat` forwards to the provider; the key never leaves the server
- **Server-side analytics** — aggregate results, "revision needed" insights per class

See [RB-002](../runbooks/RB-002-deploy-node.md) for deployment and [ADR-001](../adr/ADR-001-static-first.md) for why this separation was chosen.
