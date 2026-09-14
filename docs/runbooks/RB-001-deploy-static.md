# RB-001 — Deploy Static Site (GitHub Pages / Netlify / Cloudflare)

| Field | Value |
|-------|-------|
| **Runbook ID** | RB-001 |
| **Service** | QuizVerse static game |
| **Trigger** | New release, first-time setup, or re-deploy after code change |
| **Owner** | Gurjas AI / Balpreet Ji |
| **Est. time** | 5–10 minutes |
| **Last verified** | 2026-09-14 |

---

## Overview

The game (`app/` + `packages/`) runs entirely in the browser — no server, no database, no build tools needed. `npm run build:static` copies files into `dist/`. Any static host serves it.

**Currently live at:** https://gurjeetsinghgill8-web.github.io/mr-balpreet-quizverse/

---

## Pre-flight checks

```bash
# All tests must be green before deploying
npm test             # 137 unit tests
npm run qa:browser   # 80 browser E2E checks (needs Chrome + server running)
npm run qa:design    # 44 design checks

# Build must succeed and produce index.html
npm run build:static
# Expected output: "Static build ready → ./dist  398 KB total"
```

---

## Option A — GitHub Pages (current setup, automated)

This is the **default** pipeline. Every push to `master` auto-deploys via GitHub Actions.

### How it works

```
git push origin master
      │
      ▼
.github/workflows/deploy.yml
      ├── node tools/build-static.mjs   → dist/
      └── actions/deploy-pages@v4       → GitHub Pages
```

### Check deploy status

```bash
gh run list --repo gurjeetsinghgill8-web/mr-balpreet-quizverse --limit 5
```

Or visit: https://github.com/gurjeetsinghgill8-web/mr-balpreet-quizverse/actions

### Re-trigger a deploy manually

```bash
gh workflow run deploy.yml --repo gurjeetsinghgill8-web/mr-balpreet-quizverse
```

### Verify the live site

```
https://gurjeetsinghgill8-web.github.io/mr-balpreet-quizverse/
```

- Open on a phone and a desktop
- Click **Try Demo** → play one question
- Check sound works (click speaker icon if muted)

---

## Option B — Netlify (drag-and-drop, no account needed)

```bash
npm run build:static
# Then open https://app.netlify.com/drop in a browser
# Drag the ./dist folder into the drop zone
# Netlify gives you a URL like: quizverse-abc123.netlify.app
```

The `netlify.toml` in the repo also works for Git-connected deploys:
- Build command: `node tools/build-static.mjs`
- Publish directory: `dist`

---

## Option C — Cloudflare Pages (Git-connected, unlimited bandwidth)

1. Go to https://dash.cloudflare.com → Pages → Create a project
2. Connect the GitHub repo `gurjeetsinghgill8-web/mr-balpreet-quizverse`
3. Set:
   - **Build command:** `node tools/build-static.mjs`
   - **Build output directory:** `dist`
4. Click **Save and Deploy**

---

## Option D — Vercel (import repo, uses vercel.json)

```bash
npx vercel --prod
# or: import the repo at https://vercel.com/new
```

`vercel.json` is already in the repo with correct routing.

---

## Rollback

GitHub Pages — revert the commit and push:

```bash
git revert HEAD
git push origin master
# Actions will redeploy the reverted version
```

Netlify / Cloudflare — go to the host dashboard → Deployments → click a previous deployment → **Publish**.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Blank white page | Wrong publish directory | Verify `dist/index.html` exists and is the root |
| 404 on refresh/direct URL | Missing SPA redirect rule | Add `/* → /index.html 200` (already in `netlify.toml`) |
| Sound not working | Browser autoplay policy | User must click once first — this is expected browser behaviour |
| Old version still showing | CDN cache | Hard-refresh (Ctrl+Shift+R) or wait ~5 min for CDN propagation |
| Actions workflow fails | `node tools/build-static.mjs` error | Run build locally first and fix the error |
