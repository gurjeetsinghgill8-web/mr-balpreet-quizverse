# ADR-001 — Static-First Architecture

| Field | Value |
|-------|-------|
| **ADR ID** | ADR-001 |
| **Status** | Accepted |
| **Date** | 2026-09-14 |
| **Deciders** | Gurjas AI |

---

## Context

QuizVerse needed to be deployable by a non-technical teacher in under 10 minutes, play reliably in Indian classrooms (variable internet, older devices), and feel like a premium TV game show — not a web portal or a Python data app.

The key design question: **server-rendered vs client-rendered, and how far to push the "offline-first" principle?**

---

## Decision

**The game (`app/` + `packages/`) is a fully self-contained static browser application.** The optional Node server (`server.mjs`) is a separate, opt-in layer that adds accounts, sync, and an AI key proxy — but changes nothing about gameplay.

The AI pipeline runs **at generation time only**, producing a frozen *Quiz Package* (plain JSON). Gameplay reads only that frozen package — zero AI cost per play, full offline capability.

---

## Rationale

### Why static-first?

| Requirement | Static-first solution |
|-------------|----------------------|
| Deploy in 10 minutes, no server knowledge | `npm run build:static` → drag `dist/` to Netlify Drop |
| Works in classrooms without reliable internet | Game plays from `localStorage` after first load |
| Zero cost for early usage | Free tier on every static host |
| No GDPR / student data concerns | No server, no accounts = no personal data stored |
| Works on any device (including old Android phones) | Plain ES modules, no framework, no bundler |

### Why not Streamlit / Gradio?

Streamlit re-runs the Python script on every interaction and re-renders a fresh widget tree. This is wrong for this product because:
- No reliable low-latency audio (intro sting, tick-tock, suspense, applause are core features)
- No fine-grained animation control (game-show feel requires frame-level timing)
- No client-side state machine — every answer click would round-trip to Python
- Mobile classroom layout and fullscreen projector mode are hard to control

### Why no bundler / no dependencies?

- Zero `npm install` step → teacher can run `node server.mjs` directly after cloning
- No bundler configuration drift or security advisories in `node_modules`
- The static build is a simple file copy (`tools/build-static.mjs`) — fully auditable
- Forces discipline: every dependency must justify its weight

### Why a separate optional Node server (not serverless functions)?

- The server adds a persistent storage layer (teacher accounts, quiz sync) — serverless functions are stateless
- The AI key proxy is a long-lived secret — serverless cold starts would re-read it on every invocation anyway
- Docker + a ₹400/month VPS is simpler to operate than a serverless platform for a school
- The server is optional — most schools can start with the static game and upgrade later

---

## Consequences

### Positive

- Any teacher can deploy in 10 minutes without help
- Works perfectly in classrooms with intermittent internet
- Zero infrastructure cost for early adopters
- Easy to audit: no black-box bundled code
- Easy to test: unit tests for the pure game engine, browser tests for the full flow

### Negative / trade-offs

- Teacher accounts and cross-device sync require the optional Node server (extra setup)
- AI API keys on a static host are visible in the browser (mitigated by: server-side proxy option, and the setting being opt-in)
- Large pasted PDFs are extracted in-browser (acceptable; scanned PDFs gracefully rejected)
- `localStorage` is device-scoped — quiz data doesn't follow the teacher to another device without the server

### Mitigations for the trade-offs

- The `offline` engine provides instant, validated quizzes with no API key required
- The `mock` engine lets teachers test the full AI pipeline without a key
- The server's AI proxy completely hides the key when the full deployment is used
- RB-003 (LAN mode) covers the "reliable in class" use case without any cloud infra

---

## Alternatives considered

| Alternative | Rejected because |
|-------------|-----------------|
| Next.js / React | Overkill for a game UI; adds build complexity and a framework to learn |
| Streamlit | Wrong tool (see rationale above) |
| Pure serverless (no Node server option) | Can't do persistent teacher accounts without a DB |
| WebSocket multiplayer-first | Adds reliability risk for a live class; single-device works fine for Phase 1 |
