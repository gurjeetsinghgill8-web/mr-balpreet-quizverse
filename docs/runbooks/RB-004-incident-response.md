# RB-004 — Incident Response

| Field | Value |
|-------|-------|
| **Runbook ID** | RB-004 |
| **Service** | QuizVerse (all environments) |
| **Trigger** | Something is broken in production or during a live class |
| **Owner** | Gurjas AI |
| **Last verified** | 2026-09-14 |

---

## Severity levels

| Level | Definition | Example | Response time |
|-------|-----------|---------|--------------|
| **SEV-1** | Game completely broken mid-class | White screen, no audio, crash | Immediate — switch to fallback |
| **SEV-2** | Feature broken, workaround exists | AI generation fails but offline works | Fix within 24 hours |
| **SEV-3** | Minor issue, no user impact | Analytics not showing | Fix in next release |

---

## SEV-1 Immediate Fallback Playbook (During a Live Class)

> The class must continue. Fix things after.

### Step 1 — Switch to Demo Mode (30 seconds)

```
Landing page → "Try Demo" → instant Class 5 Solar System game
```

No generation, no server, no network needed. Always works.

### Step 2 — Switch to Offline Engine (1 minute)

```
⚙ Generation Engine → select "offline" → create your quiz normally
```

The offline engine has curated quiz packs for Classes 1–8, all topics. Works without internet.

### Step 3 — Switch to LAN Mode (3 minutes)

If the online site is down:

```bash
npm run start:lan    # on teacher's laptop
```

Open `http://192.168.x.x:4317/` on projector + student devices.

---

## Common incidents and fixes

### 🔴 White / blank screen on load

**Diagnose:**
```bash
# Open browser DevTools → Console tab — what error is shown?
```

| Error message | Fix |
|--------------|-----|
| `Failed to load module` | Clear browser cache → hard refresh (Ctrl+Shift+R) |
| `Cannot read properties of undefined` | Check if URL has correct path (no extra subdirectory) |
| CORS error | Server not running or wrong URL — check `api/health` |

---

### 🔴 Sound not working

1. Check system volume is up
2. Click anywhere on the page (browser autoplay policy — must have user gesture first)
3. Check the mute toggle (🔊/🔇) in the top bar
4. **⚙ Generation Engine → Test the classroom speaker** — runs the full audio test sequence

If still silent: browser doesn't support Web Audio API (very old browser). Update Chrome/Edge.

---

### 🔴 AI generation fails ("Generation failed" or timeout)

1. Check internet connection
2. In **⚙ Generation Engine**, switch to `mock` — runs the full AI pipeline with a fake provider (no internet, no key)
3. Switch to `offline` — instant, curated quizzes, no internet
4. If using a personal key: verify the key is valid and has quota at provider's dashboard

---

### 🔴 GitHub Pages site is down / not updating

```bash
# Check latest Actions run
gh run list --repo gurjeetsinghgill8-web/mr-balpreet-quizverse --limit 3

# Re-trigger deploy
gh workflow run deploy.yml --repo gurjeetsinghgill8-web/mr-balpreet-quizverse

# Watch the run
gh run watch --repo gurjeetsinghgill8-web/mr-balpreet-quizverse
```

If GitHub Pages itself is down: check https://githubstatus.com and use LAN mode (RB-003) as fallback.

---

### 🔴 Quiz disappeared / localStorage cleared

Quizzes in the static/offline version live in `localStorage`. They can be cleared by:
- User clearing browser data
- Browser private/incognito mode
- Storage quota exceeded

**Prevention:** Save important quizzes by using the full Node server with Postgres storage (RB-002).

**Recovery:** Re-generate the quiz (takes ~30 seconds with offline engine).

---

### 🔴 `EADDRINUSE` — port already in use (LAN mode)

```powershell
# Find what's on port 4317
netstat -ano | findstr :4317

# Kill it (replace PID with the number from above)
taskkill /PID <PID> /F

# Or just use a different port
PORT=4318 npm run start:lan
```

---

### 🔴 Students can't access LAN URL

```powershell
# Check your LAN IP
ipconfig
# Look for "IPv4 Address" under your Wi-Fi adapter

# Test from teacher's laptop first
curl http://127.0.0.1:4317/api/health
```

If the health check passes locally but not from student devices:
1. Check Windows Firewall — allow `node.exe` (both private and public)
2. Ensure all devices are on the **same** Wi-Fi network (school Wi-Fi, not mobile data)
3. If school Wi-Fi blocks device-to-device traffic: create a mobile hotspot from teacher's phone and connect all devices to it

---

## Post-incident checklist

After resolving any SEV-1 or SEV-2 incident:

- [ ] Document what broke and when in the git commit message or a GitHub Issue
- [ ] Update this runbook if the fix is a new pattern
- [ ] Verify the fix by running `npm test` + `npm run qa:browser`
- [ ] If a config change was needed, update `.env.example`
