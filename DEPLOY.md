# QUIZVERSE — Going online (deployment guide)

**Hinglish summary (short):**
1. **Sabse fast (free, 10 minute):** `npm run build:static` chalao → `dist` folder ko **Netlify Drop** par drag kar do. Link mil jayega jaise `https://quizverse-xyz.netlify.app` — Balpreet Ji kisi bhi city se mobile/laptop par khel sakte hain. Game poori tarah offline chalti hai, koi server/account nahi chahiye.
2. **Poora version (accounts + cloud sync + AI):** repo GitHub par daalo → **Render** par Blueprint se deploy (free tier). Pehli load par 30–60 second lag sakta hai kyunki free server sota hai.
3. **Classroom mein sabse reliable:** teacher ke laptop par `npm run start:lan` → wahi Wi-Fi par sab phones/tablets/projector URL kholte hain. Internet ki zarurat nahi.
4. **Streamlit? Nahi.** Streamlit Python data-apps ke liye hai; wo har click par script dobara chalata hai — audio, animation aur game-show feel ke liye galat tool hai.

---

## What you are deploying (read this once)

QUIZVERSE has two halves:

| Half | What it needs | What it gives |
|---|---|---|
| **The game** (`app/` + `packages/`) | any static host — no server | teacher creates a quiz, child plays 5 stages with sound, animation, lifelines, winner screen, review, local results/analytics |
| **The server** (`server.mjs`) | a Node host (or the teacher's laptop) | teacher accounts, cloud-synced quizzes + versions, school-wide results/analytics, AI proxy so API keys stay private |

So: **static host = the game works completely.** Adding the Node server changes nothing about gameplay; it only adds accounts, syncing and server-side analytics (the account/sync screens are the next UI milestone).

---

## Option 1 — Free static host (recommended first step)

```bash
npm run build:static        # creates ./dist (~500 KB, no build tools, no dependencies)
```

Then any one of these:

| Host | How | Free tier notes |
|---|---|---|
| **Netlify** | Drag the `dist` folder onto <https://app.netlify.com/drop> — done in ~30 seconds | Free subdomain, HTTPS, generous bandwidth; `netlify.toml` in the repo also works via Git |
| **Cloudflare Pages** | Git repo → build command `node tools/build-static.mjs`, output `dist` | Unlimited bandwidth is the standout free-tier advantage among static hosts ([comparison](https://pressless.io/blog/host-website-free-2026)) |
| **GitHub Pages** | Push repo → Actions/pages: publish `dist` | Free for public repos, HTTPS included |
| **Vercel** | Import repo (uses `vercel.json` already in the repo) | Excellent DX, free hobby tier |

What you get: a public link like `https://quizverse-xyz.netlify.app` that opens on any phone, tablet or laptop, in any city. Works offline after first load, results stay in that device's browser.

What you do **not** get on a static host: teacher accounts, cross-device sync, server analytics, and the AI key proxy. For AI generation on a static host you can paste your own key in **⚙ Generation Engine** (the browser calls the provider directly — acceptable for your own demo, not for a public site).

**Optional custom domain:** a `.in`/`.com` domain costs roughly ₹800–1,200/year; every host above attaches it with free HTTPS.

---

## Option 2 — Free Node host (full product)

Needed for: accounts, sync, server analytics, **and hiding the AI key from students**.

| Host | How | Reality of the free tier |
|---|---|---|
| **Render** | Push to GitHub → New → Blueprint → `render.yaml` is detected | Free web service sleeps after ~15 min idle; first request after that takes 30–60 s. Free disk + optional free Postgres via Neon/Supabase |
| **Koyeb / Fly.io / Railway** | Dockerfile is in the repo | Free/hobby allowances change often; Docker keeps it portable ([free-tier comparison](https://agentdeals.dev/hosting-free-tier-comparison-2026), [Node hosting options](https://granite.so/hosting/nodejs)) |
| **Hugging Face Spaces (Docker)** | Create a Docker Space, push the repo | Genuinely free, gives a public HTTPS URL; sleeps when unused |

Set these environment variables in the host's dashboard (see `.env.example`):

```
QV_API_SECRET=<long random string>      # otherwise teachers are logged out on every restart
QV_STORAGE=postgres                     # recommended on cloud hosts
QV_DATABASE_URL=postgres://…            # free Neon / Supabase
QV_AI_PROVIDER=openai                   # optional
QV_AI_KEY=sk-…                          # optional
```

Then run the schema once:

```bash
psql "$QV_DATABASE_URL" -f server/schema.sql
```

Quick check after deploy: `https://your-app.onrender.com/api/health` must return `{"ok":true,...}`.

---

## Option 3 — Classroom / school mode (most reliable in a real class)

No internet, no accounts, no waiting — this is what I would use on a school day:

```bash
node server.mjs --lan        # or: npm run start:lan
```

It prints something like:

```
QUIZVERSE running → http://0.0.0.0:4317/
Classroom mode — open these on the phones, tablets and projector:
   http://192.168.1.24:4317/
```

- Projector/smart TV → open the first URL on the teacher's laptop and press **⛶ fullscreen**
- Students' phones/tablets on the **same Wi-Fi** → open the `192.168.x.x` URL
- Allow Node.js through the Windows Firewall when Windows asks (first run only)
- Data (quizzes, results) stays on that laptop in `.data/`

On a school PC you can also run it as a container:

```bash
docker build -t quizverse .
docker run -p 4317:4317 -e QV_API_SECRET=change-me -v quizverse-data:/data quizverse
```

---

## Option 4 — Permanent hosting (when the school depends on it)

A ₹400–600/month VPS (DigitalOcean/Hetzner/Contabo) or Render's paid tier removes the sleep, gives a stable URL and a real Postgres. Deploy with the same Dockerfile:

```bash
docker run -d --restart unless-stopped -p 80:4317 \
  -e QV_API_SECRET=… -e QV_STORAGE=postgres -e QV_DATABASE_URL=… \
  --name quizverse quizverse
```

Put Caddy or Nginx in front for HTTPS (Caddy needs two lines).

---

## Why not Streamlit (or Gradio)?

Streamlit/Gradio are Python tools that re-run a script on every interaction and render a fresh widget tree. They are excellent for data apps and demos, and wrong for this product:

- no reliable low-latency **audio** (the intro sting, tick-tock, suspense, applause are a core feature)
- no fine-grained **animation/particle** control (game-show feel)
- no client-side state machine — every click would round-trip to Python
- mobile classroom layout and fullscreen projector mode are hard to control

QUIZVERSE is a static browser app (Web Audio + DOM animation) with an optional tiny Node API. That combination is what makes it feel like a TV game show and still deploy on a free host.

---

## Deployment checklist

- [ ] `npm test` green (137 unit tests) and `npm run qa:browser` green (83 browser checks)
- [ ] `npm run build:static` succeeds and `dist/index.html` opens locally
- [ ] `QV_API_SECRET` set on the server deployment (never left as the default)
- [ ] `.data/`, `.env` are **not** in the repository (`.gitignore` covers them; the server also refuses to serve them)
- [ ] `https://…/api/health` returns `ok:true`
- [ ] Test on a phone, in landscape, with the classroom speaker at real volume
- [ ] If using a personal AI key on a static host, remember it is visible to anyone using that browser

## Honest limitations of the free options

- **Free servers sleep.** First visit after a break is slow. For a live class, use Option 3 (laptop + LAN) or a paid tier.
- **Free disk is ephemeral** on most hosts — use Postgres or the demo data disappears on redeploy.
- **Student accounts are intentionally absent.** Only a first name is stored, and only when the teacher's account is in use. This keeps the privacy promise in the Product Development File (§12.3) and keeps classroom setup to seconds.
