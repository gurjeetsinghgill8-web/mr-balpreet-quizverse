# QUIZVERSE — AI Classroom Game Show

> **Learn. Think. Win.**
> **ONE CLASS. ONE TOPIC. ONE CLICK. COMPLETE EDUCATIONAL GAME.**

An AI-powered educational game-show platform for **Classes 1–8**.
Teacher picks a **Class + Topic** (or pastes their own lesson material) → the system generates a validated question bank → the student plays a **5-stage game** with **4 lifelines**, timer, score, original sound and animation → ending in a **WINNER celebration** or an encouraging **"GREAT EFFORT"** screen.

---

## ▶️ Run it (no install, no build, no dependencies)

```bash
node server.mjs          # → http://127.0.0.1:4317/
npm run start:lan        # classroom mode: phones/tablets on the same Wi-Fi can join
```

Then open **http://127.0.0.1:4317/** and either click **Try Demo** (instant Class 5 Solar System game) or **Create Quiz**.

Requires Node 18+ (developed on Node 24). There is nothing to `npm install` — the demo is plain ES modules, inline SVG art and runtime-synthesised sound.

### 🌐 Going online (free options + a full guide in [`DEPLOY.md`](./DEPLOY.md))

```bash
npm run build:static     # → ./dist (≈400 KB) : drag onto Netlify Drop / Cloudflare Pages / GitHub Pages
```

| Option | Command / host | What you get |
|---|---|---|
| **Static host** (fastest, free) | `npm run build:static`, then drag `dist` to [Netlify Drop](https://app.netlify.com/drop) | Public link, plays on any phone/laptop, works offline. No accounts |
| **Node host** (full product) | GitHub → [Render Blueprint](https://render.com) via `render.yaml`, or Dockerfile on Koyeb/HF Spaces | Accounts, cloud sync, server analytics, AI key kept server-side |
| **Classroom** (most reliable) | `npm run start:lan` on the teacher's laptop | Every device on the school Wi-Fi, no internet needed |
| **Permanent** | ₹400–600/month VPS with the Dockerfile | No sleep, real Postgres, own domain |

The sound design is a core feature, so check it before a live class: **⚙ Generation Engine → Test the classroom speaker** plays the show intro, the question landing, the wrong-answer buzzer and the applause.

**Optional: switch on live AI generation**

Open **⚙ Generation Engine** in the header and pick an engine:

| Engine | Key needed | What it does |
|---|---|---|
| `offline` | no | The curated demo library + a deterministic extractor for pasted text |
| `mock` | no | Runs the **real AI pipeline** (prompt → JSON → 10-point validation → repair loop) against a mock provider — great for seeing how the engine behaves |
| `openai` / `anthropic` / `gemini` | yes | Live generation for **any** topic and class |
| `ollama` | no | A local model server (`http://127.0.0.1:11434/v1`) |

The API key can also live on the server instead of the browser:

```bash
QV_AI_PROVIDER=openai QV_AI_KEY=sk-... node server.mjs
# or per provider: QV_OPENAI_KEY / QV_ANTHROPIC_KEY / QV_GEMINI_KEY, plus QV_AI_MODEL, QV_AI_BASE_URL
```

Requests always go through the app's own `/api/ai/chat` proxy, so the key is never exposed to the student game and there are no CORS problems. If a live call fails, the app quietly falls back to the offline library unless the teacher switches the fallback off.

**Try these three demo games**

| Class | Topic | Language | Visual tier |
|---|---|---|---|
| 5 | Solar System | English | B — Quiz Arena |
| 7 | कंप्यूटर (Computer) | Hindi | C — Neon Nexus |
| 1 | Animals | English | A — Playful Planet |

**Bring your own lesson:** upload a **PDF / DOCX / TXT / MD** file (or paste text). The browser extracts the text locally — no upload, no server — reports a quality score, and builds questions only from your material with a "why this question?" source excerpt. Scanned/image PDFs are detected and you are told to paste the text instead.

---

## ✅ Verify it

```bash
npm test           # 137 unit tests: engine, validator, AI provider, ingest, editor, UI modules, i18n
npm run qa:browser # 80 end-to-end checks in a real headless Chrome (CDP)
npm run qa:design  # 44 objective design checks: contrast, touch targets, tier scaling, fit
npm run shots      # 19 screenshots of every screen → ./shots
npm run check      # all three suites in one go
```

Current status — all green:

```
unit tests       137/137 passed
browser E2E       80/80  passed   (generation → 5 stages → lifelines → winner → review,
                                   live AI pipeline, PDF upload + unreadable-PDF refusal,
                                   question editing, versions, draft survival)
design QA         44/44  passed   (contrast ≥ 4.5:1, targets ≥ 44px, no clipping/overflow)
```

The browser suites need Chrome or Edge (auto-detected; override with `CHROME_PATH`) and the app server running.

---

## 🧠 Three-layer architecture

```
Layer 3 — GAME-SHOW UX      graphics · mascot QUIZO · animation · original sound · celebration
Layer 2 — GAME ENGINE       5 stages · lifelines · timer · scoring · winner logic
Layer 1 — AI QUIZ BRAIN     generation · 10-point validator · material mode · stage builder
```

**Hard rule:** the AI runs at **generation time only**. Gameplay plays a frozen *Quiz Package* client-side — zero AI cost per play and full offline playability.

```
app/                        Layer 3 — screens, design system, sound, mascot, illustrations
  screens/game.js           student flow  (name → briefing → board → winner → review)
  screens/teacher.js        teacher flow (landing → create → generate → preview/editor → dashboard)
  quiz-service.js           generation router: live AI → offline fallback
  ai-client.js              browser side of the AI_SERVICE (proxy-first transport)
  document-ingest.js        PDF / DOCX / TXT extraction, entirely in the browser
  quiz-editor.js            edit / delete / regenerate one question, versions, integrity checks
  audio.js                  original Web Audio synth (11 sounds + music loop, zero asset files)
  illustrations.js          33 original inline SVG illustrations
  mascot.js                 QUIZO mascot, 6 expressions, EN/HI lines
  styles.css                design tokens, tier A/B/C theming, motion spec
packages/game-engine/       Layer 2 — pure, framework-free, fully unit-tested
packages/ai-service/        Layer 1 — provider adapters, prompts, 10-point validator,
                            stage builder, mock provider, material extraction
tools/                      smoke (CDP E2E), design-qa, screenshot harness, PDF fixture
tests/                      node --test suites (136 tests)
```

---

## 📋 What is implemented right now

- **Teacher flow:** Class 1–8, topic input, language (EN/HI with automatic script detection), question count (5–25), timer, per-lifeline toggles, stage rule, engine selection, educational loading sequence, preview with validator report and pipeline stats, save/regenerate, dashboard with per-question analytics and "revision needed" insights.
- **Layer 1 — generation engines:** provider-agnostic `AI_SERVICE` (OpenAI/compatible, Anthropic, Gemini, Ollama, mock, offline) with class-aware prompt templates, tolerant JSON parsing, the 10-point validator, a bounded repair loop, spare-pool extension, and a frozen Quiz Package artefact. Material mode keeps every question traceable to the teacher's document.
- **Material ingestion:** PDF (text layer, FlateDecode, ToUnicode CMaps), DOCX (hand-parsed ZIP), TXT/MD — all in the browser, with quality scoring, warnings and a "paste instead" escape hatch. A scanned or unreadable file is refused with a friendly message instead of silently generating nonsense, and a **failed upload never destroys work already in the box**. The teacher's create-form draft (including long pasted material) is persisted, so a page refresh costs nothing, and the quiz language auto-corrects to match the topic's script.
- **Teacher editing:** inline question editor re-validated by the same 10-point engine, delete with automatic stage refill from the reserve pool, regenerate-one (AI first, reserve pool as fallback), version history with per-version snapshots, and "why was this question generated?" source excerpts.
- **Game engine:** 5 stages with rising difficulty, 60 % stage pass rule (Classes 1–2 are never eliminated, but the final stage must still be earned), scores 100/200/300/500/1000, four lifelines with edge-case handling, timer with pause support, second chance at 50 % points flagged as *assisted*, deterministic and replayable.
- **Game-show UI:** suspense before every reveal, six option-button states, correct/wrong animations, particles and confetti, stage rail, stage-complete screen, winner celebration, encouraging non-winner screen, review screen, fullscreen classroom mode, keyboard play (A–D / 1–4, Enter, H/C/S/X, Esc), reduced-motion and sound-off support.
- **Age-adaptive tiers:** Class 1–2 (large type, illustrations, no elimination), 3–5 (game-show arena), 6–8 (compact, academic, futuristic).
- **Original assets only:** all graphics are inline SVG, all sounds are synthesised at runtime, mascot and wordmark are original — no third-party or broadcast assets anywhere (legal guardrail, PD §2).
- **Offline-first:** gameplay needs no network; quizzes, versions and results persist in `localStorage`.

## 🔌 Not implemented yet (the honest list)

| Missing | Notes |
|---|---|
| Teacher accounts, database, server API | The demo is single-device (Implementation Path A). PD §16–17 define the Postgres schema and REST surface for Path B; the store module is the only file that changes. |
| OCR for scanned PDFs | Detected and reported (`no_text_layer`) with a paste-the-text fallback; OCR belongs with a server-side pipeline. |
| Classroom team mode, QR join, live multiplayer, certificates | Phase 1.5/2 in the roadmap (PD §23). |
| Curriculum mapping (NCERT chapters), voice questions, AI illustrations | Phase 2/3. |

---

## ⚖️ Legal guardrail (mandatory)

QUIZVERSE is **inspired by the format** of a television quiz game show — never by its assets.
No show name, logo, music, set design, catchphrase or copyrighted graphic is used, and none may be added.
All art, sound and motion must stay original, licensed or CC0, and registered in `legal/ASSET_LICENSES.md`.

---

## 📄 Documentation

| Document | Purpose |
|---|---|
| [`PRODUCT_DEVELOPMENT.md`](./PRODUCT_DEVELOPMENT.md) | Master Product Development File: vision, screen-by-screen spec, game rules, AI pipeline, design system, data model, API, acceptance tests, AI prompt templates, sample packs, UI strings, DoD |
| [`DEPLOY.md`](./DEPLOY.md) | Quick deployment guide: all four options (static, Node, LAN, VPS) |
| [`docs/`](./docs/README.md) | Full documentation hub: architecture, runbooks, ADRs |
| [`docs/architecture/overview.md`](./docs/architecture/overview.md) | System design, three-layer architecture, data flow, file map |
| [`docs/runbooks/RB-001`](./docs/runbooks/RB-001-deploy-static.md) | Deploy static site (GitHub Pages / Netlify / Cloudflare) |
| [`docs/runbooks/RB-002`](./docs/runbooks/RB-002-deploy-node.md) | Deploy full Node server (Render / Docker / VPS) |
| [`docs/runbooks/RB-003`](./docs/runbooks/RB-003-classroom-lan.md) | Offline classroom LAN mode |
| [`docs/runbooks/RB-004`](./docs/runbooks/RB-004-incident-response.md) | Incident response: what to do when things break |
| [`docs/runbooks/RB-005`](./docs/runbooks/RB-005-adding-quiz-packs.md) | Add new curated offline quiz packs |
| [`docs/adr/ADR-001`](./docs/adr/ADR-001-static-first.md) | Why the static-first, no-bundler design was chosen |

## 🧪 Non-negotiable quality bar

The app must look like a **premium educational game show** — not a school portal, not a plain MCQ site, not an AI-generated form.
Final test: *Does it feel like a game? Is the student excited? Can a teacher make a game in 60 seconds? Are the questions reliable? Does it look premium?* If any answer is **no**, it is not ready.
