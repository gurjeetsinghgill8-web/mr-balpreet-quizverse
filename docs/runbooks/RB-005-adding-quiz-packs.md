# RB-005 — Adding New Curated Quiz Packs

| Field | Value |
|-------|-------|
| **Runbook ID** | RB-005 |
| **Service** | QuizVerse offline quiz library |
| **Trigger** | Adding new subjects, topics, or language packs |
| **Owner** | Gurjas AI |
| **Est. time** | 15–30 minutes per pack |
| **Last verified** | 2026-09-14 |

---

## Overview

The `offline` engine uses a curated library of pre-validated quiz packs (in `app/data/packs.js`). These play instantly with no AI call and no internet — ideal for classrooms with slow/no connectivity.

Adding a pack = writing a JSON object that passes the same 10-point validator as live AI output.

---

## Pack format

Each pack must conform to this structure:

```js
{
  id: "class5-solar-system-en",     // kebab-case, globally unique
  class: 5,                          // 1–8
  topic: "Solar System",             // display name
  lang: "en",                        // "en" or "hi"
  questions: [                       // minimum 15, recommended 20–25
    {
      id: "q-001",                   // unique within pack
      text: "Which planet is closest to the Sun?",
      options: ["Mercury", "Venus", "Earth", "Mars"],
      answer: 0,                     // 0-indexed correct option
      difficulty: 1,                 // 1 (easy) / 2 (medium) / 3 (hard)
      hint: "It is the smallest planet in the solar system.",
      explanation: "Mercury orbits closest to the Sun at ~57.9 million km.",
      stage: 1,                      // 1–5 (which game stage this belongs to)
      source: "NCERT Class 5 Science, Chapter 1"  // optional
    },
    // ... more questions
  ]
}
```

### Difficulty distribution (recommended)

| Stage | Difficulty | Count |
|-------|-----------|-------|
| 1 | 1 (easy) | 3–4 |
| 2 | 1–2 | 3–4 |
| 3 | 2 | 3–4 |
| 4 | 2–3 | 3–4 |
| 5 | 3 (hard) | 3–4 |

### Age-tier rules

| Class | Tier | Rules |
|-------|------|-------|
| 1–2 | A (Playful Planet) | Short sentences, max 3-word options, concrete objects |
| 3–5 | B (Quiz Arena) | Standard format, can use fill-in-the-blank style |
| 6–8 | C (Neon Nexus) | Can use technical terms, longer explanations OK |

---

## Step-by-step: adding a pack

### Step 1 — Write the pack JSON

Create a new file `tools/packs-dev/<your-pack-id>.json` to draft it:

```json
{
  "id": "class3-animals-en",
  "class": 3,
  "topic": "Animals",
  "lang": "en",
  "questions": [...]
}
```

### Step 2 — Validate it

```bash
node -e "
const pack = JSON.parse(require('fs').readFileSync('tools/packs-dev/class3-animals-en.json'));
const { validateQuiz } = await import('./packages/ai-service/validator.js');
const result = validateQuiz(pack.questions);
console.log(result);
"
```

All 10 validation checks must pass:
1. Minimum question count (≥5 per stage)
2. All options arrays have exactly 4 items
3. Answer index is 0–3
4. No duplicate question text
5. No duplicate option text within a question
6. Difficulty is 1, 2, or 3
7. Stage is 1–5
8. Hint is present and non-empty
9. Explanation is present and non-empty
10. No question/option is shorter than 5 characters

### Step 3 — Add to the packs file

Open [`app/data/packs.js`](../../app/data/packs.js) and add your pack object to the exported array:

```js
export const OFFLINE_PACKS = [
  // ... existing packs ...
  {
    id: "class3-animals-en",
    class: 3,
    topic: "Animals",
    lang: "en",
    questions: [ /* ... */ ]
  }
];
```

### Step 4 — Test locally

```bash
node server.mjs
# Open http://127.0.0.1:4317/
# Create Quiz → Class 3 → Animals → Engine: offline
# Verify the pack loads and plays correctly
```

Check:
- [ ] Quiz generates without error
- [ ] Preview shows correct questions + difficulty distribution
- [ ] All 5 stages play correctly
- [ ] Hint, explanation, 50-50 lifeline all work
- [ ] Winner screen appears after Stage 5

### Step 5 — Run full tests

```bash
npm test
# The quiz-builder tests will include your new pack if it's referenced
```

### Step 6 — Rebuild static + commit

```bash
npm run build:static

git add app/data/packs.js
git commit -m "feat: add Class 3 Animals offline quiz pack (EN)"
git push origin master
# GitHub Actions will auto-deploy to GitHub Pages
```

---

## Hindi pack guidelines

For `lang: "hi"` packs:

- Question text must be in Devanagari script
- Options in Devanagari
- Hint and explanation in Devanagari
- Test with Hindi font rendering: the app uses `Noto Sans Devanagari` automatically
- Keep sentences shorter (Hindi script is more compact visually)

Example:

```json
{
  "id": "class5-solar-system-hi",
  "class": 5,
  "topic": "सौर मंडल",
  "lang": "hi",
  "questions": [
    {
      "id": "q-001",
      "text": "सूर्य के सबसे निकट कौन सा ग्रह है?",
      "options": ["बुध", "शुक्र", "पृथ्वी", "मंगल"],
      "answer": 0,
      "difficulty": 1,
      "hint": "यह सौर मंडल का सबसे छोटा ग्रह है।",
      "explanation": "बुध सूर्य के सबसे निकट है — लगभग 5.79 करोड़ किलोमीटर।",
      "stage": 1
    }
  ]
}
```

---

## Existing packs (reference)

See `app/data/packs.js` for the current library. When adding a new pack, check for duplicates by searching for the `topic` + `class` + `lang` combination.
