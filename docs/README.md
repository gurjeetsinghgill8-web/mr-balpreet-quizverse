# docs/ — QuizVerse Documentation Hub

This folder is the single source of truth for all operational, architectural, and maintenance knowledge about QuizVerse.

## Structure

```
docs/
├── README.md                   ← you are here
├── architecture/
│   └── overview.md             ← system design, layers, data flow
├── runbooks/
│   ├── RB-001-deploy-static.md     ← deploy to GitHub Pages / Netlify / Cloudflare
│   ├── RB-002-deploy-node.md       ← full Node server (Render, Docker, VPS)
│   ├── RB-003-classroom-lan.md     ← offline classroom mode (school Wi-Fi)
│   ├── RB-004-incident-response.md ← what to do when things break
│   └── RB-005-adding-quiz-packs.md ← add new curated offline quiz packs
└── adr/
    └── ADR-001-static-first.md     ← Architecture Decision: static-first design
```

## Quick links

| Need | Go to |
|------|-------|
| Deploy the game online (free) | [RB-001](./runbooks/RB-001-deploy-static.md) |
| Full server with accounts + AI | [RB-002](./runbooks/RB-002-deploy-node.md) |
| Run in a classroom without internet | [RB-003](./runbooks/RB-003-classroom-lan.md) |
| Something broke in production | [RB-004](./runbooks/RB-004-incident-response.md) |
| Add more demo quizzes | [RB-005](./runbooks/RB-005-adding-quiz-packs.md) |
| Why the codebase is built this way | [ADR-001](./adr/ADR-001-static-first.md) |
| Full product spec & design system | [`PRODUCT_DEVELOPMENT.md`](../PRODUCT_DEVELOPMENT.md) |
| Deployment options (quick summary) | [`DEPLOY.md`](../DEPLOY.md) |
