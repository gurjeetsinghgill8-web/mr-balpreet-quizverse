# RB-003 — Classroom LAN Mode (Offline, School Wi-Fi)

| Field | Value |
|-------|-------|
| **Runbook ID** | RB-003 |
| **Service** | QuizVerse classroom / LAN mode |
| **Trigger** | Before every live class session |
| **Owner** | Mr Balpreet Bjwa (teacher) |
| **Est. time** | 2 minutes |
| **Last verified** | 2026-09-14 |

---

## Overview

The most **reliable option for a real classroom.** Runs entirely on the teacher's laptop. No internet needed. Every phone, tablet, and projector on the same school Wi-Fi opens the game instantly.

This is the recommended mode for live classes.

---

## Pre-class setup (do this once, ~5 minutes)

### 1. Install Node.js (if not already installed)

Download from https://nodejs.org — choose the LTS version. Requires Node 18+.

Verify:
```bash
node --version   # should print v18.x or higher
```

### 2. Get the code

```bash
# Option A — clone from GitHub
git clone https://github.com/gurjeetsinghgill8-web/mr-balpreet-quizverse.git
cd mr-balpreet-quizverse

# Option B — just copy the project folder to the laptop
```

### 3. Allow Node.js through Windows Firewall (first time only)

When you run `npm run start:lan` for the first time, Windows will show a firewall popup. Click **Allow**.

---

## Starting the server before class

```bash
npm run start:lan
```

Expected output:

```
QUIZVERSE running → http://0.0.0.0:4317/
Classroom mode — open these on the phones, tablets and projector:
   http://192.168.1.24:4317/
```

> The IP address (`192.168.1.x`) is your laptop's address on the school Wi-Fi. It may change each day — always check this output.

---

## Classroom setup

| Device | URL to open | Notes |
|--------|-------------|-------|
| **Projector / Smart TV** | `http://127.0.0.1:4317/` on teacher's laptop | Press **⛶** (fullscreen) button in top-right |
| **Student phones/tablets** | `http://192.168.x.x:4317/` | Must be on the same Wi-Fi network |
| **Teacher's demo laptop** | `http://127.0.0.1:4317/` | Can run teacher flow here |

---

## Before the class starts — verify everything

1. **Sound check:** Click **⚙ Generation Engine** → **Test the classroom speaker** → you should hear: intro sting, question sound, wrong-answer buzzer, applause
2. **Screen check:** Open on a phone — game should load in <5 seconds
3. **Create or load a quiz:** Either click **Try Demo** for instant play, or create a new quiz for your today's topic
4. **Set display:** Connect laptop to projector. Open fullscreen mode.

---

## During class — teacher controls

| Action | How |
|--------|-----|
| New game | Teacher screen → pick class + topic → Generate → Play |
| Try Demo (instant) | Landing page → **Try Demo** button (Class 5, Solar System) |
| Pause game | Click the timer (pauses countdown) |
| Keyboard shortcuts | `A/B/C/D` or `1/2/3/4` = answer options, `H` = hint, `C` = 50-50, `S` = skip, `X` = audience, `Esc` = pause |
| Fullscreen | **⛶** button or `F11` |

---

## After class — save results

Results are saved automatically in the browser (`localStorage`). To view:
- Teacher screen → **Dashboard** → see per-question analytics and "revision needed" insights

Results persist until the browser cache is cleared. For permanent storage, use the full Node server (see [RB-002](./RB-002-deploy-node.md)).

---

## Stopping the server

Press `Ctrl+C` in the terminal where the server is running.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Students can't open the URL | Different Wi-Fi network | Check that all devices are on the **same** Wi-Fi. Hotspot from teacher's phone works too. |
| Windows Firewall blocking | Firewall popup was dismissed | Open Windows Defender Firewall → Allow an app → find `node.exe` → allow both private + public |
| `EADDRINUSE: port 4317` | Another server already running | Close the old terminal, or use `PORT=4318 npm run start:lan` |
| Page loads but no sound | Browser autoplay blocked | Student/teacher must click anywhere on the page once first |
| Slow generation on old laptop | AI call taking time | Switch to `offline` engine in ⚙ Generation Engine — no internet needed, instant generation |
| Quiz lost after restart | Browser cache cleared | Use the full server with file/Postgres storage for persistent quizzes |
