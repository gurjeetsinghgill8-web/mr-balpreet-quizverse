# RB-002 — Deploy Full Node Server (Accounts + AI Proxy + Analytics)

| Field | Value |
|-------|-------|
| **Runbook ID** | RB-002 |
| **Service** | QuizVerse Node server (`server.mjs`) |
| **Trigger** | First-time full-product deploy, or infrastructure change |
| **Owner** | Gurjas AI |
| **Est. time** | 15–30 minutes |
| **Last verified** | 2026-09-14 |

---

## Overview

The optional Node server adds teacher accounts, cross-device quiz sync, server-side analytics, and an AI key proxy (so the OpenAI/Gemini key never reaches the student's browser). The game works identically without it.

**Required environment variables** (see `.env.example` for full list):

| Variable | Required | Description |
|----------|----------|-------------|
| `QV_API_SECRET` | ✅ Yes | Long random string for JWT signing. Never commit. |
| `QV_STORAGE` | No | `json` (default, file-based) or `postgres` |
| `QV_DATABASE_URL` | If postgres | `postgres://user:pass@host/db` |
| `QV_AI_PROVIDER` | No | `openai`, `anthropic`, `gemini`, `ollama` |
| `QV_AI_KEY` | If AI proxy | Provider API key (stays server-side) |
| `PORT` | No | Default: `4317` |

Generate a strong secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Option A — Render (free tier, recommended for first cloud deploy)

1. Push the repo to GitHub (already done)
2. Go to https://render.com → New → **Blueprint**
3. Connect `gurjeetsinghgill8-web/mr-balpreet-quizverse`
4. Render detects `render.yaml` automatically
5. Add environment variables in the Render dashboard:
   - `QV_API_SECRET` = (generated secret)
   - `QV_STORAGE` = `postgres` (add a free Neon/Supabase DB)
   - `QV_DATABASE_URL` = (postgres connection string)
6. Click **Apply**

**Run the DB schema once** (only on first deploy):
```bash
psql "$QV_DATABASE_URL" -f server/schema.sql
```

**Health check:**
```
https://your-app.onrender.com/api/health
# Expected: {"ok":true,"storage":"postgres","uptime":...}
```

> ⚠️ Free Render services sleep after ~15 min idle. First request after idle takes 30–60 s. For live classes use Option B or C.

---

## Option B — Docker (any host with Docker: VPS, Koyeb, Fly.io, HF Spaces)

```bash
# Build the image
docker build -t quizverse .

# Run locally to test first
docker run --rm -p 4317:4317 \
  -e QV_API_SECRET=change-me \
  -e QV_STORAGE=json \
  -v quizverse-data:/data \
  quizverse

# Verify
curl http://localhost:4317/api/health
```

For cloud hosts:
- **Koyeb / Fly.io / Railway:** push the Dockerfile, set env vars in the dashboard
- **Hugging Face Spaces (Docker):** create a Docker Space, add the repo, set secrets

---

## Option C — VPS (permanent, ₹400–600/month, no sleep)

```bash
# On the VPS
docker run -d --restart unless-stopped \
  -p 80:4317 \
  -e QV_API_SECRET=<secret> \
  -e QV_STORAGE=postgres \
  -e QV_DATABASE_URL=postgres://... \
  --name quizverse \
  quizverse
```

Add Caddy for HTTPS (two lines):
```
# /etc/caddy/Caddyfile
your-domain.com {
    reverse_proxy localhost:4317
}
```

---

## Post-deploy checklist

- [ ] `GET /api/health` returns `{"ok":true}`
- [ ] Teacher can register and log in
- [ ] Create a quiz → generate → preview works
- [ ] Play a full game: name → all 5 stages → winner screen
- [ ] Check sound on a phone with volume up
- [ ] Verify `.data/` or Postgres has quiz data (not an empty file)
- [ ] `QV_API_SECRET` is NOT the default or empty

---

## Rollback

```bash
# Docker: revert to previous image
docker stop quizverse
docker run -d --name quizverse <previous-image-tag> ...

# Render: go to dashboard → Deploys → select a previous deploy → Rollback
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `{"ok":false}` on health | Server not started or crash on boot | Check logs: `docker logs quizverse` |
| "Access Denied" on login | `QV_API_SECRET` not set or changed | Set/reset the env var and restart |
| Quiz data lost after redeploy | Using `json` storage on ephemeral disk | Switch to `QV_STORAGE=postgres` |
| AI generation fails | Key not set server-side | Set `QV_AI_PROVIDER` + `QV_AI_KEY` env vars |
| Port already in use | Another process on 4317 | Change `PORT` env var or kill the other process |
| Slow first load (Render) | Free tier sleep | Expected — use paid tier or local LAN mode for class |
