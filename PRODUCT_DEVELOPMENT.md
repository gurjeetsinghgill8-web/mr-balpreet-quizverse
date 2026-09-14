# PRODUCT DEVELOPMENT FILE
# QUIZVERSE — AI CLASSROOM GAME SHOW

**Learn. Think. Win.**

**Product mantra:** ONE CLASS. ONE TOPIC. ONE CLICK. COMPLETE EDUCATIONAL GAME.

| Field | Value |
|---|---|
| Document type | Product Development Specification (PDS) + Engineering Build Brief |
| Product name (working) | **QUIZVERSE** |
| Tagline | Learn. Think. Win. |
| Version | 1.0 |
| Status | APPROVED FOR BUILD (MVP) |
| Target audience of this doc | AI coding agent / developer / designer / sound designer |
| Product category | AI-powered educational game-show platform (Classes 1–8) |
| Platforms | Web — Android phone, tablet, laptop, desktop, projector / smart TV |
| Languages | English, Hindi (V1) |
| Related documents (to be created next) | `TECHNICAL_DESIGN.md`, `DESIGN_SYSTEM.md`, `AI_PROMPTS.md`, `QA_TEST_PLAN.md` |

### BUILD STATUS (updated as the product is implemented)

| Layer | Status | Evidence |
|---|---|---|
| **Layer 2 — Game Engine** | ✅ Implemented & tested | `packages/game-engine/engine.js` — 28 unit tests |
| **Layer 1 — Validator + Builder** | ✅ Implemented & tested | `packages/ai-service/validator.js`, `quiz-builder.js` — 15 unit tests |
| **Layer 1 — Live AI providers** | ✅ Implemented & tested | `provider.js` (OpenAI/compatible, Anthropic, Gemini, Ollama, mock), `prompts.js`, `/api/ai/chat` proxy in `server.mjs` — 30 unit tests + browser E2E |
| **Layer 1 — Material mode** | ✅ Implemented | PDF (text layer, FlateDecode, ToUnicode CMap), DOCX (hand-parsed ZIP), TXT/MD in `app/document-ingest.js` — 26 unit tests; source excerpts per question |
| **Layer 3 — Game-show UX** | ✅ Implemented | `app/` (screens, design tokens, original SVG art, synthesised sound), 74 browser checks + 44 design checks |
| **Teacher dashboard & analytics** | ✅ Basic version | `app/screens/teacher.js`, `app/store.js` (local-first; Postgres schema in §16 is next) |
| **Teacher editing & versions (§29, §56)** | ✅ Implemented | `app/quiz-editor.js` — edit / delete+refill / regenerate-one / version history / source panel — 16 unit tests |
| Accounts / server API / OCR for scans | ⛔ Not implemented | §17 API surface and §16 schema are the spec for this phase |

Run it: `node server.mjs` → http://127.0.0.1:4317/ · Verify it: `npm test` (137), `npm run qa:browser` (80), `npm run qa:design` (44).

---

## 0. HOW TO READ THIS DOCUMENT

This is not a feature wish-list. It is a **build contract**.

- `MUST` = non-negotiable for MVP. If missing, the build is rejected.
- `SHOULD` = expected; may be deferred with a written reason.
- `MAY` = optional / phase 2.
- Sections 1–6 define the product. Sections 7–18 define behaviour precisely enough to implement. Sections 19–26 define architecture, quality gates and acceptance. Appendices A–E are ready-to-use assets: sample data, AI prompts, JSON schemas, UI copy, DoD checklist.

**Golden Product Principle (guiding law of the whole project):**

> The application must NEVER feel like *"AI generated a list of MCQs."*
> It must feel like **"A REAL EDUCATIONAL GAME SHOW."**
> That difference is the entire product value.

**Non-Negotiable Quality Bar (Section 65 restated as law):**
The app MUST NOT look like an ordinary school portal, a generic Bootstrap dashboard, a plain MCQ website, an AI-generated form, a spreadsheet, or old educational software. It MUST look like a **premium educational game show**.

**Design test for every single screen:**

> "Will a 7–12 year old WANT to play this?"
> If the answer is no → redesign the screen.

---

## 1. EXECUTIVE SUMMARY

QUIZVERSE turns any school topic into a complete, playable, televised-style classroom quiz game — generated in one click.

A teacher selects a **Class (1–8)** and types a **Topic** (e.g. "Solar System"), or uploads their own **PDF / article / lesson text**. The system generates a validated question bank, wraps it in a **5-stage game engine** with **4 lifelines**, timer, scoring and progression, and renders it inside a **premium, age-adaptive game-show interface** with original mascot, graphics, animations and sound.

The student enters only a **first name**, plays the game, and either becomes the **WINNER** after clearing Stage 5, or receives a **"GREAT EFFORT!"** result screen with a learning explanation for every question.

### 1.1 The two promises (core USP)

> **"Give us the Class and Topic. We build the game."**
> **"Upload your lesson. Turn it into an interactive classroom challenge."**

### 1.2 What makes it different

| Ordinary AI quiz tool | QUIZVERSE |
|---|---|
| Output = list of MCQs | Output = complete playable game |
| One question, next question | 5 stages, suspense, reveal, reward |
| No stakes, no emotion | Lifelines, timer, stage progression, winner moment |
| Same UI for Class 1 and Class 8 | Age-adaptive visuals, difficulty and interaction |
| Wrong answer → "Wrong" | Wrong answer → correct answer + age-simplified explanation |
| Ends at the last question | Ends in celebration, certificate & teacher insight |
| Teacher gets questions | Teacher gets **assessment data** (weak topics, most-missed questions) |

### 1.3 Three-Layer Architecture (the product's spine)

Everything in this document maps to one of three layers. Keep this separation in code, in folders, and in the roadmap.

```
┌─────────────────────────────────────────────────────────────┐
│ LAYER 3 — GAME-SHOW UX                                      │
│ Graphics · Mascot (QUIZO) · Animations · Sound · Celebration │
│ Age-adaptive themes · Micro-interactions · Fullscreen mode   │
└──────────────────────────▲──────────────────────────────────┘
                           │ consumes a frozen "Quiz Package"
┌──────────────────────────┴──────────────────────────────────┐
│ LAYER 2 — GAME ENGINE  (state machine, pure & testable)      │
│ 5 stages · Lifelines · Timer · Scoring · Progression ·       │
│ Winner logic · Result object                                 │
└──────────────────────────▲──────────────────────────────────┘
                           │ consumes a validated question bank
┌──────────────────────────┴──────────────────────────────────┐
│ LAYER 1 — AI QUIZ BRAIN                                      │
│ Class+topic understanding · PDF/material understanding ·     │
│ Question + options + correct + clue + explanation ·          │
│ 10-point validation · Regeneration · Source tracking         │
└──────────────────────────────────────────────────────────────┘
```

**Engineering rule:** Layer 2 and Layer 3 MUST run with **zero AI calls**. Once a quiz is generated, gameplay is a pure client-side experience. This is both the cost-control strategy (Section 16.6) and the offline strategy (Section 20.4).

---

## 2. IP & LEGAL GUARDRAILS (READ FIRST — MANDATORY)

The product is **inspired by the emotional format of a television quiz game show**. It is NOT a clone of any existing show.

### 2.1 MUST NOT (hard prohibitions)

- MUST NOT use the name **"Kaun Banega Crorepati"**, **"KBC"**, or any confusingly similar name.
- MUST NOT use the KBC logo, its shape, its colour-lockup, its typography, or any derivative mark.
- MUST NOT use KBC music, background score, stingers, entry music, or any copyrighted audio — not even a "similar-sounding" recreation of a specific composition.
- MUST NOT reproduce KBC set design, stage layout, lighting design, or exact graphic panels.
- MUST NOT use KBC catchphrases, host scripts, or host likeness.
- MUST NOT use any trademarked show assets, screenshots, clips, or YouTube videos inside the product.

### 2.2 MUST DO

- Build an **original brand**: name, wordmark, palette, mascot, sound library, motion language.
- Add a **compliance note** in the About/Legal screen: *"QUIZVERSE is an original educational product. It is not affiliated with, endorsed by, or derived from any television programme."*
- Keep a **licence register** (`/legal/ASSET_LICENSES.md`) listing the source and licence of every image, font and sound file shipped.
- All sounds MUST be one of: (a) originally synthesised for this product, (b) generated from an AI audio tool with commercial licence, (c) from a CC0/permissive library, or (d) purchased royalty-free with receipt on file.

### 2.3 What we legitimately borrow (format-level, not asset-level)

The **emotional loop** is free to use because it is an idea, not a protected asset:

> **Anticipation → Choice → Suspense → Reveal → Reward → Progress → Challenge → Achievement**

This loop (Section 15.4) is the actual product. Protect it, polish it, and make it original.

---

## 3. TARGET USERS & PERSONAS

| Persona | Role | Primary need | Success looks like |
|---|---|---|---|
| **Sunita Ma'am** (Primary) | Class teacher, Class 3–5 | Turn today's lesson into an exciting activity in under 60 seconds | Creates a game during a free period, plays it after lunch |
| **Rakesh Sir** | Science teacher, Class 6–8 | Revision + assessment before a test | Sees which questions the class got wrong and revises them next day |
| **Aarav** (7 yrs) | Class 2 student | Fun, colour, characters, winning | Asks "can we play the quiz game again?" |
| **Ishita** (13 yrs) | Class 8 student | Challenge, fairness, feeling smart | Wants higher difficulty and a leaderboard |
| **Parent / Tutor** | Home learning | Quick practice at home on a phone | Runs a 10-question game at the dinner table |
| **School IT admin** | Deployment | Works on school hardware / weak internet | Runs fullscreen on projector and old laptops |

### 3.1 Class bands (drive difficulty AND visuals)

| Band | Classes | Difficulty focus | Visual tier |
|---|---|---|---|
| **A — Little Learners** | 1–2 | Recognition, basic facts, pictures, colours, simple counting, very short questions | Cartoon mascot, large buttons, stars, confetti, minimal text |
| **B — Explorers** | 3–5 | Basic concepts, simple application, picture-based, matching concepts | Modern game-show UI, animated icons, topic illustrations |
| **C — Challengers** | 6–8 | Conceptual understanding, reasoning, multi-step thinking, application, H.O.T.S. | Futuristic, competitive, less childish, academic tone |

Optional fine grain: treat 3–4 and 5–6 as sub-tiers inside Band B if tuning is needed.

---

## 4. SUBJECTS & CURRICULUM COVERAGE

**V1 supported subjects:** Mathematics · Science · EVS / Environmental Studies · Social Science · English · Hindi · General Knowledge · Computer.

**V1 teacher-created topics:** any free-text topic is allowed; subject may be Auto-detected or manually selected.

**Future:** Physics · Chemistry · Biology · Geography · History · Civics.

**Topic examples that MUST work well in acceptance testing:** Animals (C1) · Fractions (C3) · Solar System (C5) · Water Cycle (C5) · Indian Freedom Movement (C7) · Computer Basics & Supercomputers (C6–8, Hindi).

---

## 5. PRIMARY USER FLOW (END TO END)

```
TEACHER
  │
  ├─ 1. Opens app ────────────────────────────► Landing: "TURN ANY LESSON INTO A GAME"
  │
  ├─ 2. CREATE QUIZ
  │      • Class           (required, 1–8)
  │      • Topic           (required, free text)
  │      • Subject         (optional, auto-detect)
  │      • Language        (English / Hindi)
  │      • Difficulty      (Auto default)
  │      • Question count  (5/10/15/20/25 — default 15)
  │      • Timer           (Auto default)
  │      • Lifelines ON/OFF
  │      • OR upload PDF / DOCX / TXT / paste text  → Material Mode
  │
  ├─ 3. GENERATE GAME ─────────────────────────► Educational loading messages (Section 17.5)
  │                                                (AI: understand → generate → validate → repair)
  │
  ├─ 4. PREVIEW ───────────────────────────────► Title · Class · Topic · 15 Qs · 5 stages
  │      • Preview questions, edit single question, regenerate single question
  │      • [EDIT] [REGENERATE] [SAVE] [START STUDENT GAME]
  │
  ├─ 5. START STUDENT GAME ────────────────────► Enter student first name
  │
STUDENT
  │
  ├─ 6. Welcome / Mission briefing (mascot QUIZO)
  ├─ 7. Stage 1 → Stage 5, each: question → suspense → reveal → explanation → next
  │      • 4 lifelines available (limited uses)
  │      • Timer running (teacher-configured)
  ├─ 8. Stage complete animation → next stage unlock
  ├─ 9. After Stage 5 → WINNER celebration OR "GREAT EFFORT!" screen
  └─ 10. Result saved ────────────────────────► Teacher analytics + learning insights
```

**Time target:** teacher input → playable game in **under 60 seconds** (generation p50 ≤ 12 s for 15 questions).

---

## 6. SCREEN-BY-SCREEN SPECIFICATION

Global shell for all student screens: game title, student name, stage indicator, score, timer, sound toggle, fullscreen button. Nothing else. No ads. No external links. No chat.

### S1 — Landing Page

- Hero headline: **TURN ANY LESSON INTO A GAME**
- Subheading: *Create an exciting classroom quiz from a Class + Topic or your own learning material.*
- Primary CTA: **CREATE QUIZ** · Secondary CTA: **TRY DEMO**
- Visual: animated game-show environment (CSS/Canvas/SVG — no video background).
- MUST NOT be text-heavy. Max 30 words of visible marketing copy above the fold.
- Below fold: 3 value cards — *One click game* · *Class 1–8 ready* · *Turn your PDF into a game*.

### S2 — Create Your Game (Teacher)

Two tabs, one screen:

**Tab A — From Topic**

| Field | Control | Default | Notes |
|---|---|---|---|
| Class | Dropdown 1–8 | required | Drives difficulty + visual tier |
| Topic | Text input | required | Placeholder: "Example: Water Cycle" |
| Subject | Auto / select | Auto | Auto-detect from topic |
| Language | English / Hindi | English | |
| Difficulty | Auto/Easy/Medium/Hard/Mixed | **Auto** | Auto = class-based |
| Question count | 5/10/15/20/25 | **15** | Never create an empty stage |
| Timer | Auto/15/30/45/60/None | **Auto** | Auto: C1–2 = 45s, C3–8 = 30s |
| Lifelines | 4 toggles | all ON | Each usable once |
| Sound / Mascot | toggles | ON | |

**Tab B — Create From My Material**

- Drop zone: **PDF · DOCX · TXT** or paste article text into a textarea.
- After upload show file name + green state: **"Material successfully loaded."**
- Toggle: **Allow additional knowledge** (default **OFF** → material-only mode).
- Same Class / Language / count / timer controls as Tab A.
- Button: **GENERATE QUIZ**

### S3 — Generation Progress

Full-screen cinematic loader. MUST NOT be a bare spinner.

Educational messages, in order, minimum 900 ms each:
`Understanding your topic…` → `Preparing questions…` → `Checking answer quality…` → `Balancing difficulty…` → `Building your game…` → `Almost ready!`

Plus a stage-road progress bar with the mascot reacting. On failure: Section 17.6 error states.

### S4 — Preview & Manage (Teacher)

Shows: quiz title, class, subject, topic, language, difficulty, question count, source type (Topic / Material + filename), stage distribution, lifeline settings, timer.

Actions: **EDIT** · **REGENERATE** · **GENERATE NEW VERSION** · **SAVE** · **START STUDENT GAME**

Question list: stage badge, difficulty badge, question text, correct option, explanation, source reference (if material mode), per-question **[Edit] [Regenerate] [Delete]**.

Inline edit fields: question, option A–D, correct option, explanation, clue, difficulty, stage. Validation runs again on save.

### S5 — Student Name

- Prompt: **"Who is playing today?"**
- Input: first name / nickname. Optional (fallback: "Champion"). Max 20 chars, profanity-filtered, no PII requested.
- Button: **START CHALLENGE**
- Optional: pick an avatar sticker. No account, no email, no login.

### S6 — Mission Briefing

> **Welcome to the Challenge!**
> *Aarav, your mission is to complete all five stages.*
> *Think carefully, use your lifelines wisely, and enjoy learning!*
> Topic: **Solar System** · Class: **5** · Stage: **1 / 5**

Button: **LET'S PLAY**

### S7 — Game Screen (the heart of the product)

```
┌──────────────────────────────────────────────────────────────┐
│ TOP BAR  Quizverse · Aarav · ●●●○○ Stage 2/5 · Score 1200 · ⏱ 24s │
├──────────────────────────────────┬───────────────────────────┤
│  QUESTION CARD                   │  LIFELINES                │
│  "Which planet is known as       │   50:50      (1 left)     │
│   the Red Planet?"               │   Clue       (1 left)     │
│  [ optional topic illustration ] │   Second Chance (1 left)  │
│                                  │   Change Q   (1 left)     │
│  ┌────────────┐ ┌────────────┐   │                           │
│  │ A  Venus   │ │ B  Mars    │   │   QUIZO mascot            │
│  └────────────┘ └────────────┘   │   (thinking / idle)       │
│  ┌────────────┐ ┌────────────┐   │                           │
│  │ C  Jupiter │ │ D  Saturn  │   │  Progress ●●○○○           │
│  └────────────┘ └────────────┘   │                           │
└──────────────────────────────────┴───────────────────────────┘
```

Answer flow (MUST be sequential, never instant-jump):

1. Student taps option → button enters **SELECTED** state (glow/pulse) + `select.wav`.
2. **Suspense delay** (default 900 ms, configurable 400–1500 ms) with `thinking.wav` and mascot thinking animation.
3. Validation → **CORRECT** (glow, particles, `correct.wav`, +score count-up) or **WRONG** (gentle shake, `wrong.wav`).
4. Feedback text + **educational explanation** panel appears.
5. **CONTINUE** button → next question; last question of a stage → Stage Complete screen.

Accessibility: keys `1–4` / `A–D` select, `Enter` continues, `H/C/S/X` trigger lifelines, `Esc` opens pause.

### S8 — Stage Complete

> **STAGE 1 COMPLETE!**
> `●────○────○────○────○`
> Correct in this stage: **2 / 3** · Score: **1200**

Animation: progress node unlocks, `stage-clear.wav`, mascot celebrates, next stage name revealed. Button: **START STAGE 2**.

### S9 — Final Win Screen

```
                    🏆  (original trophy art, not any show's trophy)
              CONGRATULATIONS AARAV!
        You completed the SOLAR SYSTEM CHALLENGE
   Class 5 · Stage 5/5 · Score 4200 · Accuracy 87% · Time 04:32 · Lifelines used 2
        [ PLAY AGAIN ]   [ NEW GAME ]   [ VIEW RESULT ]
```
Confetti, stars, trophy, celebratory mascot, `final-win.wav`. Must feel special — this is the emotional peak of the product.

### S10 — Non-Winner Screen (never humiliating)

```
              GREAT EFFORT, AARAV!
      You reached Stage 4  ·  Score 3200  ·  Accuracy 71%
      You were strong in: Planet order, Sun facts
      Let's practise: Moon phases
        [ TRY AGAIN ]   [ REVIEW QUESTIONS ]   [ PLAY NEW GAME ]
```
Language MUST be encouraging. NEVER use: "You failed", "Wrong again", "You are stupid", "Loser", or any negativity about the child.

### S11 — Review Questions (student/parent)

Scroll list of the played questions with the student's answer, the correct answer, and the explanation. Used for learning, not punishment. Optional "explain again in simpler words" for Class 1–4 (pre-generated simple explanation variant — no live AI call during gameplay).

### S12 — Teacher Dashboard

- **MY QUIZZES** cards: title · class · topic · date · question count · last played → **[PLAY] [EDIT] [DUPLICATE] [DELETE] [VERSIONS]**
- **RESULTS**: table of student name, score, accuracy, stage reached, time, lifelines used, completed at.
- **ANALYTICS**: total students played, average score, average accuracy, highest score, average completion time, stage-wise performance, question-wise performance, most frequently incorrect questions.
- **LEARNING INSIGHT** block: *"Students may need revision in: Fractions · Water Cycle · Multiplication."*

---

## 7. GAME ENGINE SPECIFICATION (LAYER 2)

### 7.1 Five-stage system

| Stage | Name | Difficulty | Cognitive level | Points / correct |
|---|---|---|---|---|
| 1 | **Warm-Up** | Very Easy | Recall / recognition | 100 |
| 2 | **Starter Challenge** | Easy | Recall + understanding | 200 |
| 3 | **Think Smart** | Moderate | Understanding + application | 300 |
| 4 | **Brain Challenge** | Hard | Application + reasoning | 500 |
| 5 | **Final Challenge** | Highest age-appropriate | H.O.T.S. for the class band | 1000 |

Points configurable; teacher MAY switch to **Correct/Incorrect mode** (no points).

### 7.2 Question distribution

Default 15 questions = **3 per stage**. Distribution MUST never leave an empty stage.

| Question count | Per stage | Rule |
|---|---|---|
| 5 | 1 each | stage 1→5 gets 1 |
| 10 | 2 each | even |
| 15 | 3 each | default |
| 20 | 4 each | even |
| 25 | 5 each | even |

General rule: `base = floor(count / 5)`, remainder `r` distributed to the **first r stages** (never to the final stage first).

### 7.3 Stage advance & winner logic

- `stagePassRatio` default **0.60** (ceil of `questions_in_stage × ratio`).
  - 3 questions → need **2** correct. 1 question → need **1**. 5 questions → need **3**.
- Student advances to next stage only if the stage is passed, otherwise the game ends with the **GREAT EFFORT** screen showing the stage reached.
- **Class 1–2 default = "Always Advance" mode** (pass ratio 0). No failure for young children. Teacher may enable strict mode.
- **WINNER** = student clears **Stage 5** under the active rule. Winner screen is mandatory and MUST be celebratory.
- A student who reaches Stage 5 and does not clear it is **NOT CLEARED** — but the screen is "GREAT EFFORT", never "FAIL".

### 7.4 Game state machine

```
IDLE → BRIEFING → QUESTION_READY → OPTION_SELECTED → SUSPENSE
     → REVEAL_CORRECT | REVEAL_WRONG → EXPLANATION
     → (more questions in stage) → QUESTION_READY
     → STAGE_COMPLETE → (stage passed?) → next stage BRIEFING
                                      ↘ (not passed) → RESULT_NOT_CLEARED
     → after stage 5 passed → WINNER_CELEBRATION → RESULT_SAVED → RESULT_SCREEN

Any state → PAUSED → resume to previous state
Any state → ABORTED (teacher ends game) → RESULT_SAVED (partial)
```

Engine MUST be implemented as a **pure, deterministic, framework-free module** (`packages/game-engine`) with an injectable clock, so it is unit-testable without UI. It exposes:

```ts
createGameEngine(quizPackage, { rng, now }) → {
  getState(): GameState
  selectOption(optionId): AnswerResult
  useLifeline(kind: LifelineKind): LifelineResult
  next(): void          // continue / advance
  pause(): void; resume(): void; abort(): void
  getResult(): GameResult
}
```

### 7.5 Lifelines

| Lifeline | Effect | Uses | Rules & edge cases |
|---|---|---|---|
| **HALF & HALF** | Hide two incorrect options | 1 | Never hide the correct option; never leaves < 2 options; disabled if already used; if only 2 options remain visible, no-op refund |
| **CLASSROOM CLUE** | Show the pre-generated one-line educational hint | 1 | `clue` is generated by AI at quiz-creation time; MUST NOT reveal the answer verbatim (validation check) |
| **SECOND CHANCE** | One extra attempt on the current question | 1 | Second attempt is NOT auto-correct; scores **50%** of the question's points (configurable); question is flagged `assisted = true` in analytics; stage-clear still counts it as correct |
| **CHANGE QUESTION** | Replace current question with an unseen equivalent | 1 | Must keep same class, topic, stage and difficulty (±0 tier); MUST NOT repeat any question already seen; if the pool is exhausted → refund and show "No replacement available" |

Lifeline rules:
- Each usable **once per game** by default; teacher can turn each ON/OFF.
- Used lifeline becomes **USED**, visually greyed, unclickable.
- Timer keeps running during lifeline use (configurable: teacher may choose "pause timer during lifeline").
- Lifeline use is recorded as an analytic event with question id and timestamp.
- Mascot explains lifelines once, in the briefing screen, in one short line each.

### 7.6 Timer

- Teacher options: **15 / 30 / 45 / 60 / None**; **Auto** = 45 s for Class 1–2, 30 s for Class 3–8.
- Timeout counts as an incorrect attempt (first timeout → if SECOND CHANCE unused, offer it; else reveal answer).
- Last 5 seconds: subtle tick + gentle visual pulse. MUST NOT be a loud alarm and MUST NOT induce panic.
- For Class 1–2 default configuration, timer MUST be visually calm (no red flashing).
- Timer pauses on: pause overlay, stage transition, and (optional setting) lifeline activation.

### 7.7 Scoring

- Default: only correct answers score; no negative marking (ever).
- Optional speed bonus: OFF by default.
- Second-chance correct = 50% points.
- Score animates with a count-up on award (≤ 600 ms).
- Score is also stored per stage for the stage-complete screen.

### 7.8 Result object (frozen contract)

```json
{
  "session_id": "s_9f2a",
  "quiz_id": "qz_1042",
  "quiz_title": "Class 5 – Solar System Challenge",
  "student_name": "Aarav",
  "class_level": 5,
  "topic": "Solar System",
  "score": 4200,
  "max_score": 6300,
  "accuracy": 86.7,
  "questions_total": 15,
  "questions_answered": 15,
  "correct": 13,
  "incorrect": 2,
  "stage_reached": 5,
  "stages_cleared": 5,
  "time_taken_seconds": 272,
  "lifelines_used": ["half_half", "clue"],
  "status": "WINNER",
  "per_stage": [
    { "stage": 1, "correct": 3, "total": 3, "passed": true, "score": 300 }
  ],
  "per_question": [
    {
      "question_id": "q_07",
      "selected_option": "B",
      "correct_option": "B",
      "is_correct": true,
      "assisted": false,
      "time_seconds": 14,
      "difficulty": "medium",
      "concept_tag": "planet identity"
    }
  ]
}
```

`status` ∈ `WINNER | NOT_CLEARED | ABORTED`.

---

## 8. AI QUIZ BRAIN SPECIFICATION (LAYER 1)

### 8.1 Input contract

```json
{
  "class_level": 5,
  "topic": "Solar System",
  "subject": "Science",
  "language": "en",
  "difficulty": "auto",
  "question_count": 15,
  "source_mode": "topic",
  "source_material": null,
  "allow_additional_knowledge": false,
  "settings": { "timer": "auto", "lifelines": ["half_half", "clue", "second_chance", "change_question"] }
}
```

`source_mode` ∈ `topic | material | mixed`. `allow_additional_knowledge` is only meaningful in `material` mode.

### 8.2 The 11-step generation pipeline

| Step | Action | Deterministic requirement |
|---|---|---|
| 1 | Understand class → set difficulty band, vocabulary ceiling, sentence length | Band from class_level |
| 2 | Understand topic → concept map, top 5–8 sub-concepts | Saved for analytics `concept_tag` |
| 3 | Determine vocabulary & sentence length for the class | Max words: C1–2 ≈ 12, C3–5 ≈ 20, C6–8 ≈ 30 (question stem) |
| 4 | Generate question pool **with over-generation** (count × 1.6, minimum +5) | Over-generation powers CHANGE QUESTION + dedupe |
| 5 | Generate exactly four options per question | One correct, three plausible distractors, no duplicates |
| 6 | Mark the single correct option | Never two correct |
| 7 | Generate explanation | 1–3 sentences, age-simplified |
| 8 | Generate lifeline assets: `clue` + `simple_explanation` | Clue must not reveal the answer verbatim |
| 9 | Ambiguity check (self-critique pass) | Reject if a second option could be argued correct |
| 10 | Class-appropriateness + duplicate + safety check | Duplicate = ≥ 0.85 text similarity (normalised, embedding or trigram) |
| 11 | Build stages: sort by difficulty, distribute, assign stage + points, freeze Quiz Package | Distribution rule from 7.2 |

**Hard rule:** all AI work happens at **generation time only**. Gameplay MUST NOT call the AI (cost control + offline play).

### 8.3 Quiz Package JSON schema (the frozen artefact)

```json
{
  "schema_version": "1.0",
  "quiz_id": "qz_1042",
  "version": 1,
  "title": "Class 5 – Solar System Challenge",
  "class_level": 5,
  "subject": "Science",
  "topic": "Solar System",
  "language": "en",
  "difficulty_profile": "auto-5",
  "source_type": "topic",
  "source_meta": { "file_name": null, "pages": null, "allow_additional_knowledge": false },
  "settings": {
    "timer_seconds": 30,
    "stage_pass_ratio": 0.6,
    "always_advance": false,
    "points_mode": "points",
    "stage_points": [100, 200, 300, 500, 1000],
    "lifelines": { "half_half": 1, "clue": 1, "second_chance": 1, "change_question": 1 },
    "sound": true, "music": true, "mascot": true
  },
  "stages": [
    { "stage": 1, "name": "Warm-Up", "difficulty": "very_easy", "question_ids": ["q_01", "q_02", "q_03"] }
  ],
  "questions": [
    {
      "question_id": "q_01",
      "stage": 1,
      "question": "Which planet is known as the Red Planet?",
      "options": { "A": "Venus", "B": "Mars", "C": "Jupiter", "D": "Saturn" },
      "correct_option": "B",
      "explanation": "Mars looks red because of iron minerals on its surface.",
      "simple_explanation": "Mars has red dust on it, so we call it the Red Planet.",
      "clue": "This planet is famous for its reddish appearance.",
      "difficulty": "very_easy",
      "concept_tag": "planet identity",
      "cognitive_level": "recall",
      "source_reference": null
    }
  ],
  "generation_meta": {
    "model": "provider-agnostic",
    "generated_at": "2025-01-01T00:00:00Z",
    "validator_pass": true,
    "regenerations": 2,
    "estimated_cost": 0.012
  }
}
```

**Rule:** the client game engine plays **only** from this package. No network, no AI, no database reads are required mid-game (only result posting at the end, which is queued if offline).

### 8.4 The 10-point validation engine

Every generated question MUST pass all checks. Any failure → repair loop (Section 8.5).

| # | Check | Failure action |
|---|---|---|
| 1 | Exactly four options (A–D), non-empty | Reject |
| 2 | Exactly one correct answer, and it exists in options | Reject |
| 3 | No duplicate option texts (normalised, case/space-insensitive) | Reject |
| 4 | No duplicate question vs pool, vs previous versions, and vs earlier stages | Reject |
| 5 | Class-appropriate difficulty and vocabulary (band rules) | Reject or auto-simplify |
| 6 | Language appropriate for class (grammar, sentence length, script correctness) | Reject |
| 7 | Unambiguous wording; no "all of the above" unless class ≥ 5 and explicitly intended; no double negatives | Reject |
| 8 | Correct answer is consistent with the explanation (no contradiction) | Reject |
| 9 | If material mode: question traceable to the source text (quote/page/section reference present) | Reject or drop if not traceable |
| 10 | No hallucinated educational facts; safety check passes (Section 12) | Reject |
| **+** | **Clue does not reveal the answer verbatim; explanation has no spoiler in the question stem** | Reject clue/explanation, repair only that field |

### 8.5 Repair loop (bounded, cheap)

```
generate(pool) → validate(each)
   ├─ pass ───────────────────────► accept
   └─ fail → build a repair prompt containing ONLY the failed question + exact failure codes
              → regenerate that single question (max 2 attempts)
              → still failing → drop the question and pull a spare from the over-generated pool
              → pool exhausted → generate a fresh micro-batch of 3
              → still insufficient → return a partial quiz with an explicit teacher warning
```
Bound total spend: `max_repair_rounds = 3`, `max_total_calls = 6` per quiz.

### 8.6 Material (PDF/article) mode rules

Pipeline: `UPLOAD → TEXT EXTRACTION → CLEANING → SEGMENTATION → KEY CONCEPT EXTRACTION → QUESTION GENERATION → VALIDATION → GAME CREATION`

- **Default = material-only mode.** Questions must be answerable purely from the uploaded content.
- Any question requiring outside info: `allow_additional_knowledge = false` → **do not create it**; `true` → create it and mark `source_reference: { "type": "additional_knowledge" }`.
- Every material-based question SHOULD carry `source_reference`: `{ "page": 4, "section": "The Water Cycle", "excerpt": "…evaporation happens when…" }`.
- Teacher-facing **"Why was this question generated?"** button shows the excerpt + page/section.
- Extraction failure → `"Unable to read this document. Please try another PDF or paste the text."` (never show a raw stack trace).
- OCR: run only if the PDF has no text layer; if OCR confidence < 0.6, warn the teacher.
- Scanned handwritten notes are out of scope for V1.

### 8.7 Question quality prohibitions (NEVER generate)

Two correct options · no correct option · ambiguous prompts · Class 8 question for Class 2 · excessive vocabulary · unsupported facts in material mode · repeated questions · trick questions designed to trap · questions requiring images that were not supplied (unless a topic illustration is attached) · questions about a named real student · questions containing personal data.

### 8.8 AI provider abstraction

```
AI_SERVICE (interface)
 ├── generateQuiz(input): QuizDraft
 ├── repairQuestion(question, failures): Question
 ├── extractKeyConcepts(text): Concept[]
 └── estimateCost(tokens): number

adapters/  ├── provider_openai.ts  ├── provider_anthropic.ts
           ├── provider_gemini.ts  ├── provider_local_llm.ts (school offline mode)
```
Select via `AI_PROVIDER` env var. **Never** hard-code a provider inside business logic. All adapters MUST return the same validated JSON shape or throw a typed `AIGenerationError`.

### 8.9 Cost & latency control

| Strategy | Rule |
|---|---|
| Generate once, play many | AI only at creation. 1 teacher generation ⇒ unlimited student plays at zero AI cost |
| Over-generate once | +60% pool in a single call instead of many small calls |
| Structured output | Force JSON schema response; never parse prose |
| Repair scope | Only the failing question, not the whole quiz |
| Caching | Same `(class, topic, language, difficulty, count, source_hash)` → offer the existing quiz, plus a **GENERATE NEW VERSION** button |
| Versioning | Every regeneration = new immutable version (v1, v2, v3…). Teacher picks the preferred version |
| Budget guard | Per-teacher daily generation cap with a soft warning, hard stop, and clear teacher-facing message |

**Latency targets:** first question visible ≤ 6 s (streaming partial quiz), full 15-question packed quiz ≤ 12 s (p50) / ≤ 25 s (p95).

---

## 9. VISUAL IDENTITY & DESIGN SYSTEM (LAYER 3)

### 9.1 Brand

| Element | Decision |
|---|---|
| Name | **QUIZVERSE** |
| Tagline | **Learn. Think. Win.** |
| Wordmark | Custom geometric wordmark, orbit motif (an "O" as a ring/planet), gold gradient on deep indigo |
| Identity story | A *Quizverse* — a universe of knowledge where each stage is a new planet to conquer |
| Mascot | **QUIZO** — a friendly AI learning companion (original character, SVG-based) |
| Tone | Exciting but kind. Competitive but never humiliating. Curious, not childish for older classes |

### 9.2 Age-adaptive visual tiers (automatic by class)

| Token | Tier A (1–2) | Tier B (3–5) | Tier C (6–8) |
|---|---|---|---|
| Theme name | **Playful Planet** | **Quiz Arena** | **Neon Nexus** |
| Mascot prominence | Large, always visible, animated | Medium, reacts to events | Small, subtle, optional |
| Question font size | 32–40 px | 26–32 px | 22–26 px |
| Button size | ≥ 88 px tall | ≥ 72 px | ≥ 64 px |
| Illustrations | Big cartoon, per question where possible | Animated icons, topic art | Minimal, data-forward, futuristic |
| Particles | Stars, balloons, confetti | Sparks, light streaks | Grid pulses, sharp light |
| Music | Cheerful, bouncy | Energetic, driving | Focused, cinematic |
| Text density | Minimum | Moderate | Higher, but never a wall of text |
| Difficulty feel | Cooperative | Adventurous | Competitive |

Theme is selected from `class_level` automatically; teacher may override in settings (advanced).

### 9.3 Colour tokens (default palette — configurable)

```css
--qv-indigo-900:#0B1030;  /* base background */
--qv-indigo-700:#171B4A;  /* panels */
--qv-purple-600:#4C1D95;  /* primary accent */
--qv-violet-500:#7C3AED;  /* interactive */
--qv-gold-400:#F5B301;    /* reward / trophies / correct highlight */
--qv-cyan-400:#22D3EE;    /* focus / info / timer normal */
--qv-green-500:#22C55E;   /* correct */
--qv-coral-500:#F87171;   /* wrong (soft, non-punitive) */
--qv-white:#FFFFFF; --qv-mist:#E8ECFF; --qv-muted:#A5ACD6;
```

Rules: gold is reserved for **reward**; green/red are **never the only indicator** (icon + text + shape always accompany colour); contrast ≥ 4.5:1 for all text.

### 9.4 Typography

| Use | Font | Fallback |
|---|---|---|
| Display / headings | **Fredoka** or **Baloo 2** (rounded, friendly) | system-ui |
| Body / UI | **Manrope** or **Inter** | system-ui |
| Hindi / Devanagari | **Baloo 2 (Devanagari)** or **Mukta** | Noto Sans Devanagari |
| Numerals (score/timer) | Tabular figures of the body font | — |

Minimum body size 16 px (mobile) / 18 px (tablet, projector). Line height ≥ 1.4. Max ~60 characters per line for question text.

### 9.5 Component inventory (build once, reuse everywhere)

Buttons (primary / secondary / option / lifeline / icon) · Question card · Option button (6 states: normal, hover, selected, correct, wrong, disabled) · Timer ring · Score chip · Stage progress rail · Lifeline tile · Explanation panel · Mascot speaker · Confetti layer · Particle layer · Modal (pause, confirm, fullscreen) · Toast · Loader with educational messages · Result card · Stat tile · Question list row (teacher) · Analytics bar/heat cell · Certificate (phase 2).

**6 option-button states are mandatory** — this is where the game-feel lives.

### 9.6 Graphics requirements (treated as a core feature)

Must exist as original art (SVG preferred, WebP/AVIF for raster):
- Mascot QUIZO with ≥ 6 expressions: `idle, welcome, thinking, celebrate, encourage, oops`
- Trophy (original design), medal, star burst, winner badge
- Stage backgrounds × 5 (escalating intensity) — lightweight CSS gradients + SVG layers, **no video**
- Lifeline icons × 4 (original pictograms, not copies)
- Progress rail, stage node, streak flames, confetti shapes
- Topic illustration set for common topics (Solar System, Water Cycle, Fractions, Animals, Human Body, Freedom Movement, Computer) — minimum 7 for V1
- MUST NOT use generic stock photos in the game screen. Educational illustration only.

Optional (phase 2): AI-generated topic illustrations, cached as assets at generation time (never generated live mid-game).

---

## 10. MASCOT — QUIZO SPECIFICATION

| Property | Spec |
|---|---|
| Name | **QUIZO** |
| Nature | A friendly, floating educational AI companion; original design; knows the topic |
| Look | Rounded body, single expressive eye visor, orbit ring/halo, tiny antenna with a question-spark. Deep indigo + violet body, gold accents |
| Voice/tone | Warm, encouraging, age-aware. Class 1–2: playful ("Wow, super!"). Class 6–8: peer-like, respectful ("Sharp thinking.") |
| Surfaces | Welcome, mission briefing, lifeline explanation, correct reaction, wrong-answer encouragement, stage transition, winner, non-winner support |
| Animation | Idle float loop (4 s), blink every ~5 s, react ≤ 400 ms to game events; CPU-light (transform/opacity only) |
| Speech format | One short line max, ≤ 12 words, never blocks the question |
| Setting | **ON/OFF** toggle in teacher settings and student HUD. OFF = silent, no popups |

Mandatory lines (localised; see Appendix D):

| Moment | English | Hindi |
|---|---|---|
| Welcome | "Ready, {name}? Let's begin!" | "तैयार हो, {name}? चलो शुरू करें!" |
| Correct | "Great job, {name}!" | "शाबाश, {name}!" |
| Wrong | "Good try! Now you know it." | "अच्छी कोशिश! अब यह याद रहेगा।" |
| Stage clear | "Stage {n} cleared! Keep going." | "स्टेज {n} पूरा! आगे बढ़ो।" |
| Winner | "You did it, {name}! Champion!" | "आपने कर दिखाया, {name}! चैंपियन!" |
| Not cleared | "Great effort! Let's try once more." | "बहुत बढ़िया कोशिश! फिर से कोशिश करें।" |

**Rule:** the mascot NEVER says anything negative about the child. See Section 12 and Section 22.

---

## 11. SOUND DESIGN

### 11.1 Original sound library (filenames as build contract)

| File | Moment | Length | Character |
|---|---|---|---|
| `intro.wav` | Game start briefing | 2.5–4 s | Energetic original sting, rising |
| `button.wav` | Any UI tap | 80–120 ms | Soft, satisfying click |
| `select.wav` | Option locked in | 150–250 ms | Confident "locked" tone |
| `thinking.wav` | Suspense delay | 1–2 s loopable | Subtle rising tension pad |
| `correct.wav` | Correct reveal | 600–900 ms | Bright, positive, resolving |
| `wrong.wav` | Wrong reveal | 400–600 ms | Soft, low, non-punitive |
| `stage-clear.wav` | Stage completion | 1.2–2 s | Ascending victory motif |
| `final-win.wav` | Winner screen | 3–5 s | Full celebration fanfare (original) |
| `timer.wav` | Last 5 seconds | 80 ms × tick | Very subtle tick |
| `lifeline.wav` | Lifeline activation | 300–500 ms | Magical/mechanical effect |
| `whoosh.wav` | Transitions, change question | 250 ms | Airy swipe |

### 11.2 Sound rules

- All assets MUST be original / licensed / CC0 (Section 2.2). **No show audio.**
- Format: `.ogg` (primary) + `.m4a` (iOS fallback); mono for effects; ≤ 40 KB per effect file; total audio budget ≤ 400 KB.
- Mastered conservatively (≈ −16 LUFS short-term for effects); no clipping, no sudden loud bursts (child-safe loudness).
- Preload before first question; lazy-load nothing during a question.
- iOS: audio unlocked on the first user gesture (the LET'S PLAY tap), never autoplay-blocked mid-game.

### 11.3 Sound settings (MANDATORY)

Global **Sound ON/OFF** + separate **Music ON/OFF**, **Effects ON/OFF**, **Volume slider**. Persisted per device. Accessibility: every sound cue MUST have a visual counterpart (text/icon/animation) so the game is fully playable muted.

---

## 12. CONTENT SAFETY & CHILD PROTECTION

Users are minors. These are hard requirements.

### 12.1 Blocked content (never generated, never shown)

Sexual or romantic content of any kind · graphic violence · self-harm · hate speech or communal content · dangerous instructions (weapons, drugs, unsafe experiments) · inappropriate jokes · political campaigning · gambling/betting framing · body-shaming · bullying language · frightening imagery · humiliating student feedback.

### 12.2 Enforcement

1. Prompt-level constraints (Appendix B).
2. Post-generation classifier pass on every question, option, clue, explanation (block-list + model-based check).
3. Second check on teacher edits (teacher edits are validated by the same engine).
4. Sensitive curriculum topics (e.g. human reproduction, puberty): allowed **only** in a strictly curriculum-oriented, scientific, age-appropriate register if the class is 7–8, using sanctioned CBSE/NCERT-style terminology — never anatomical humour, never graphic detail. If uncertain → return the question with `safety: needs_review` and let the teacher decide. Reference acceptance Test 4.
5. No student-to-stranger communication, no chat, no UGC sharing, no public student profiles.
6. No advertising inside student gameplay, ever. No third-party trackers in the student flow.

### 12.3 Data privacy

- Collect only: **student first name/nickname** (optional, free text, profanity-filtered) + gameplay results.
- NEVER collect from students: phone, email, address, date of birth, photo, biometric, geolocation, school ID.
- Teacher accounts only in V1 (email + password/OTP). Student plays as **guest**.
- Provide teacher-facing **Delete results / Delete quiz / Delete all student data** controls.
- Retention: default 12 months, configurable; results exportable as CSV and then deletable.
- Local-first: student gameplay state MAY live in the browser; only the final result is uploaded.

### 12.4 Student feedback language rules

APPROVED (correct): *Excellent! · Great thinking! · Well done! · Fantastic! · Spot on! · Sharp!*
APPROVED (wrong): *Good try! · Not quite — let's learn this one. · Almost! The correct answer is… · That's a common mix-up, here's the idea.*
BANNED: *You are stupid. · Wrong again! · Failure. · You lost. · How can you not know this?* and any sarcasm or comparison that names another student.

---

## 13. ANIMATION & MICRO-INTERACTION SPECIFICATION

| Interaction | Animation | Duration | Easing |
|---|---|---|---|
| Question card entrance | fade + slight zoom (0.96 → 1) + 8 px rise | 280 ms | cubic-bezier(0.2, 0.8, 0.2, 1) |
| Option buttons entrance | sequential fade + rise, 60 ms stagger | 240 ms each | ease-out |
| Option hover / press | scale 1.03 / 0.97 + glow | 120 / 90 ms | ease-out |
| Option selected | pulse glow ring, colour lock | 200 ms | ease-in-out |
| Suspense | dim background 12%, mascot thinking, subtle vignette | 900 ms | linear |
| Correct reveal | green fill sweep + particle burst + icon pop + score count-up | 700 ms | spring(2, 120) |
| Wrong reveal | horizontal shake 3 cycles (±6 px) + soft desaturate | 420 ms | ease-in-out |
| Explanation panel | slide up + fade | 260 ms | ease-out |
| Stage complete | progress rail travels, node unlock pop, mascot celebrate | 1200 ms | ease-in-out |
| Stage transition | cinematic wipe (gradient sweep) + stage title | 1400 ms | ease-in-out |
| Winner | confetti + trophy rise + glow + name reveal | 2500 ms | spring |
| Score increment | digit roll/count-up | ≤ 600 ms | ease-out |
| Lifeline activation | tile flip + effect sweep + "USED" stamp | 500 ms | ease-in-out |
| Timer warning | gentle pulse (Tier A: soft glow only) | 1 s loop | sine |

### 13.1 Animation discipline (MUST)

- Only `transform` and `opacity` for anything animated continuously (GPU-friendly).
- Confetti particles ≤ 120, culled after 2.5 s; particle bursts ≤ 40 particles.
- Respect `prefers-reduced-motion`: reduce to ≤ 150 ms fades, disable confetti/shake, keep logic identical.
- Animations MUST never delay gameplay beyond configured suspense; every animation MUST be skippable by the CONTINUE button.
- No animation may block reading of the question or obscure an option.

---

## 14. ACCESSIBILITY

- WCAG 2.1 AA target. Contrast ≥ 4.5:1 body, ≥ 3:1 large text and UI boundaries.
- Full keyboard play: `A/B/C/D` or `1–4` answer · `Enter` continue · `H` half&half · `C` clue · `S` second chance · `X` change question · `Space` pause.
- Visible focus ring on every interactive element (never remove outline without replacement).
- Screen-reader labels: question, options with letter, result announced via `aria-live="polite"`, timer announced only at 10 s and 5 s remaining (never every second).
- Colour is never the sole indicator: correct = ✓ + "CORRECT!" + green; wrong = ✕ + "NOT QUITE!" + coral.
- Text scaling to 200% without layout breakage; question text reflows instead of clipping.
- Sound-off play is fully supported (all cues have visual equivalents).
- Language attribute set correctly (`lang="hi"` for Hindi) so screen readers use the right voice.

---

## 15. UX PRINCIPLES

### 15.1 Screen-level rule
Every screen must answer: **"Will a 7–12 year old WANT to play this?"** If no → redesign.

### 15.2 Simplicity rule
The teacher's required input is exactly **two fields**: Class + Topic. Everything else is optional and defaulted. Optional controls live behind an "Advanced" disclosure.

### 15.3 Speed rule
Teacher: game ready in < 60 s. Student: tap "START CHALLENGE" to first question in < 3 s (assets preloaded). Option tap to reveal in ≤ 1.2 s.

### 15.4 The emotional loop (protect this above all)
```
Anticipation → Choice → Suspense → Reveal → Reward → Progress → Challenge → Achievement
```
Every design or engineering trade-off MUST be judged by whether it strengthens this loop. Decorative graphics never outrank it.

### 15.5 Device rules
- Mobile-first responsive; tablet = primary target; landscape preferred for game-show feel but portrait MUST work fully.
- Touch targets ≥ 48 × 48 px (Tier A ≥ 64 px). No tiny controls, no hover-only affordances.
- Question + all four options visible without scrolling on a 1366×768 projector and on a 360×640 phone (in landscape, options reflow to 2×2; in portrait they stack).
- **FULLSCREEN** button in the HUD for projector / smart TV / interactive display use (teacher-controlled classroom mode).

### 15.6 Classroom modes

| Mode | V1 status | Behaviour |
|---|---|---|
| **Teacher Mode** | V1 | Teacher controls the screen; students answer verbally or by show of hands; class score/progress shown |
| **Individual Mode** | V1 | One student plays on a device with a name |
| **Team Mode** | Phase 2 | Teams A/B scoreboard updates live |
| **Live Multiplayer / QR Join** | Phase 2+ | Students join from their own devices with a room code |

### 15.7 Error & empty states (student-friendly, never technical)

| Situation | Message | Actions |
|---|---|---|
| Generation failed | "Quiz generation temporarily failed." | TRY AGAIN · EDIT INPUT |
| PDF unreadable | "Unable to read this document. Please try another PDF or paste the text." | RE-UPLOAD · PASTE TEXT |
| Offline mid-quiz | "You're offline — the game will still work. Your result will be saved when you're back online." | CONTINUE |
| Audio blocked by browser | "Tap anywhere to enable sound." | ENABLE SOUND |
| No quizzes yet | "No games yet. Create your first challenge!" | CREATE QUIZ |

Never show stack traces, provider names, HTTP codes or token errors to a teacher or a student.

---

## 16. DATA MODEL

```
teachers(id, name, email, password_hash, school_name, created_at, settings_json)

materials(id, teacher_id, file_name, file_type, storage_path, extracted_text,
          page_count, ocr_used, ocr_confidence, source_hash, created_at)

quizzes(id, teacher_id, title, class_level, subject, topic, language, difficulty,
        source_type, material_id, current_version, settings_json, created_at, updated_at)

quiz_versions(id, quiz_id, version, package_json, model_meta_json, validator_pass,
              regeneration_count, created_by, created_at)          -- immutable, full Quiz Package

questions(id, quiz_version_id, question_id, stage, question, option_a, option_b,
          option_c, option_d, correct_option, explanation, simple_explanation, clue,
          difficulty, cognitive_level, concept_tag, source_reference_json, safety_status)

game_sessions(id, quiz_id, quiz_version_id, student_name, class_level, mode,
              score, max_score, accuracy, correct_count, incorrect_count,
              stage_reached, stages_cleared, status, lifelines_used_json,
              started_at, completed_at, time_taken_seconds, device_json)

answer_events(id, session_id, question_id, stage, selected_option, correct_option,
              is_correct, assisted, time_seconds, lifeline_state_json, answered_at)

lifeline_events(id, session_id, question_id, lifeline_kind, refunded, used_at)

analytics_daily(teacher_id, quiz_id, date, plays, avg_score, avg_accuracy,
                completion_rate, avg_time_seconds)                   -- materialised rollup
```

Notes:
- `quiz_versions.package_json` is the **single source of truth** for gameplay — replayable forever even if the AI provider changes.
- `answer_events` is the source for question-wise analytics and most-missed-question insight.
- All student tables store **first name only**, no PII.
- Row-level security: a teacher can only read rows belonging to their `teacher_id`.

Indexes: `answer_events(session_id)`, `answer_events(question_id)`, `game_sessions(quiz_id, completed_at)`, `quizzes(teacher_id, created_at)`.

---

## 17. API SURFACE (REST, v1)

Auth: teacher JWT (bearer). Student endpoints are unauthenticated but rate-limited and require a valid `session_token` issued at session start.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/teacher/register` · `/login` | Teacher account |
| POST | `/api/materials/upload` | Multipart PDF/DOCX/TXT → `{ material_id, file_name, chars, pages, ocr_used }` |
| POST | `/api/materials/text` | Paste text → `material_id` |
| POST | `/api/quizzes/generate` | Create quiz + v1 package (Section 8.1 input) |
| GET | `/api/quizzes` | Teacher's quizzes (paged, sorted) |
| GET | `/api/quizzes/:id` | Quiz + current version package |
| GET | `/api/quizzes/:id/versions` | Version history |
| PATCH | `/api/quizzes/:id` | Rename, change settings (creates a new version if questions change) |
| POST | `/api/quizzes/:id/regenerate` | New version from same or edited input |
| PATCH | `/api/questions/:questionId` | Teacher edit (re-validated) |
| POST | `/api/questions/:questionId/regenerate` | Regenerate one question in place |
| DELETE | `/api/questions/:questionId` | Delete a question (stage redistributed, never empty) |
| POST | `/api/quizzes/:id/duplicate` | Duplicate quiz |
| DELETE | `/api/quizzes/:id` | Delete quiz + sessions |
| POST | `/api/sessions` | Start game → `{ session_id, session_token, package }` |
| POST | `/api/sessions/:id/answer` | Record an answer event (batched allowed, offline queue) |
| POST | `/api/sessions/:id/lifeline` | Record a lifeline event |
| POST | `/api/sessions/:id/finish` | Submit result → persisted (idempotent by session_token) |
| GET | `/api/results?quiz_id=` | Result list for teacher |
| GET | `/api/analytics/quiz/:id` | Aggregates + stage-wise + question-wise |
| GET | `/api/analytics/insights?teacher_id=` | "Students may need revision in…" |
| GET | `/api/health` | Provider + DB health |

Conventions: all timestamps ISO-8601 UTC; errors use `{ "error": { "code": "...", "message": "...", "field": "..." } }` with human-safe `message`; generation endpoints support `Accept: text/event-stream` for progressive question streaming and progress messages.

---

## 18. PERFORMANCE & COMPATIBILITY

### 18.1 Budgets (measured, enforced in CI where possible)

| Metric | Budget |
|---|---|
| Initial JS (gzip) | ≤ 250 KB |
| First contentful paint on mid-range Android | ≤ 1.5 s (4G) |
| Time from "START CHALLENGE" tap to first question | ≤ 3 s |
| Option tap → reveal latency | ≤ 1.2 s (includes intended suspense) |
| Animation frame rate | 60 fps target, 30 fps floor on low-end |
| Total sound assets | ≤ 400 KB |
| Raster image per screen | ≤ 120 KB (WebP/AVIF) |
| Memory | ≤ 150 MB on a 2 GB Android device |
| Quiz package payload (15 Qs) | ≤ 60 KB JSON |

### 18.2 Rules
- Android 8+, iOS 14+, Chrome/Edge/Firefox/Safari recent 2 versions. No IE, no Flash-era fallbacks.
- No video backgrounds (streaming cost + battery). Animated gradients + SVG only.
- No 3D rendering (three.js) in V1.
- Lazy-load teacher dashboard, analytics, and PDF pipeline; never ship them in the student bundle.
- Preload all sounds/illustrations for the **current stage** during the stage transition, not all 15 questions upfront on a phone.

### 18.3 Offline / low-internet strategy
- Full Quiz Package cached in **IndexedDB** at session start (plus a Service Worker app shell).
- Gameplay fully offline; answer events queued locally and synced on reconnect.
- Result submission idempotent and retried automatically.
- Phase 2: PWA install + "school offline pack" (pre-generated quiz library synced weekly).

---

## 19. ARCHITECTURE & TECH STACK

### 19.1 Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js (App Router) + TypeScript** | Routing, SSR for landing page (SEO), API routes in one repo |
| Styling | **Tailwind CSS + CSS variables** (design tokens) | Age-adaptive themes via token switching |
| Animation | **Framer Motion** + CSS keyframes + Canvas confetti (small custom) | Declarative, performant, reduced-motion aware |
| State | **Zustand** for game state shell; the engine itself is framework-free | Testability |
| Audio | **Howler.js** (or a thin WebAudio wrapper) | iOS unlock + sprite support |
| Backend | Next.js Route Handlers (V1) — extract to **FastAPI/Node service** only when load demands | One deployable, faster MVP |
| DB | **PostgreSQL** (Supabase or self-hosted) | Relational analytics queries |
| Object storage | S3-compatible (Supabase Storage / R2 / MinIO) | PDFs + generated assets |
| AI | Provider-agnostic `AI_SERVICE` (Section 8.8) | No vendor lock-in |
| Testing | Vitest (engine + validators) + Playwright (E2E game flow) + axe (a11y) | Correctness on money paths |
| Deploy | Vercel / Docker on a VPS; school on-prem Docker Compose option | Classroom-friendly |

### 19.2 Three implementation paths (choose by context)

| Path | Scope | Stack | Use when |
|---|---|---|---|
| **A — Single-device MVP** (fastest) | Teacher + student on one device, no accounts | Vite + React SPA, IndexedDB for quizzes, thin serverless proxy for AI key | Prototype, demo day, one classroom pilot |
| **B — Production SaaS** | Accounts, saved quizzes, analytics | Full Section 19.1 stack | Real teacher onboarding at scale |
| **C — School / offline deployment** | Local server, weak internet | Docker Compose: app + Postgres + MinIO + optional local LLM adapter | Schools with poor connectivity, data-residency needs |

All three paths share the same **Quiz Package schema** and **game engine package**, so code migrates upward without rewrites.

### 19.3 Repository shape (target)

```
repo/
├── apps/
│   ├── web/                 # Next.js: landing, teacher dashboard, game shell
│   └── api/                 # route handlers / FastAPI service
├── packages/
│   ├── game-engine/         # pure TS, zero UI, zero AI, 100% unit-tested
│   ├── ai-service/          # AI_SERVICE interface + provider adapters + prompts
│   ├── quiz-schema/         # Zod schemas + types for Quiz Package & Result
│   ├── design-tokens/       # colour/typography/motion tokens per age tier
│   └── content-safety/      # blocklists + classifier hooks
├── assets/  audio/  illustrations/  mascot/
├── docs/    PRODUCT_DEVELOPMENT.md  TECHNICAL_DESIGN.md  DESIGN_SYSTEM.md  QA_TEST_PLAN.md
└── legal/   ASSET_LICENSES.md  PRIVACY.md
```

---

## 20. TEACHER ANALYTICS & LEARNING INSIGHT

Turns the game into an assessment tool (the teacher's real reason to come back).

**Quiz-level:** plays count · average score · average accuracy · highest score · average completion time · completion rate (reached stage 5) · stage-wise correct % · lifelines used distribution.

**Question-level:** correct %, average time, most-missed questions, distractor analysis (which wrong option attracts the most picks → reveals the actual misconception).

**Student-level:** name, score, accuracy, stage reached, time, lifelines used, per-concept correctness.

**Learning insight (plain language):**
> *"Students may need revision in: Fractions · Water Cycle · Multiplication."*
Derived from `concept_tag` correctness across sessions, threshold < 60 % over ≥ 3 attempts.

**Teacher actions from insight:** regenerate a quiz for the weak topic in one click · export CSV · print report · (phase 2) generate a certificate.

---

## 21. MVP SCOPE

### 21.1 MUST ship in V1

1. Teacher dashboard (create, my quizzes, results) · 2. Class selection 1–8 · 3. Topic input · 4. PDF/DOCX/TXT upload + paste-text mode · 5. AI question generation with 10-point validation · 6. 5-stage game engine · 7. Four-option questions · 8. Four lifelines · 9. Timer · 10. Scoring · 11. Animations (Section 13) · 12. Original sound effects + sound settings · 13. Student name entry (guest) · 14. Winner celebration screen · 15. Non-winner "great effort" screen · 16. Result object + save · 17. Replay / new game · 18. Mobile + tablet responsive UI + fullscreen mode · 19. Explanations for every question · 20. English + Hindi UI · 21. Age-adaptive visual tiers · 22. Mascot QUIZO with ON/OFF · 23. Teacher preview + single-question regenerate/edit · 24. Save quiz & versioning · 25. Basic analytics + learning insight.

### 21.2 MUST NOT ship in V1 (avoid dilution)

Student accounts · social network / chat · school ERP · attendance · fees · live multiplayer · QR join · certificates · AI image generation · voice questions · leaderboards · complex permissions · payment gateway.

> First make the core game excellent. Everything else waits.

---

## 22. DEVELOPMENT PRIORITY ORDER

```
1. GAMEPLAY            (engine correctness + emotional loop)
2. VISUAL DESIGN       (premium game-show look, age tiers)
3. AI QUALITY          (validation engine, no hallucination, class-fit)
4. SOUND / ANIMATION   (polish, game feel)
5. TEACHER DASHBOARD   (speed of creation)
6. ANALYTICS           (assessment value)
```
Never sacrifice gameplay quality for backend complexity. A technically complete app with dull gameplay is a **failed** implementation.

---

## 23. ROADMAP

| Phase | Content |
|---|---|
| **V1 — MVP** | Section 21.1 |
| **V1.5 — Classroom Power** | Classroom team mode + live scoreboard · QR join (read-only projector view) · teacher branding (school name, logo, teacher name on result) · printable certificate · CSV export · richer analytics |
| **V2 — Engagement** | Live multiplayer rooms · Team Battle · Teacher vs Students · leaderboards · student progress over time · weak-topic detection automation · certificates with school logo · additional Indian languages |
| **V3 — Ecosystem** | AI-generated topic illustrations (cached) · voice-read questions · offline school pack · school dashboard · curriculum mapping (NCERT chapter alignment) · LTI/Google Classroom integration · adaptive difficulty per student |

---

## 24. RISKS & MITIGATIONS

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 1 | AI hallucinates wrong facts | Educational trust destroyed | Validation check #10 + material-only mode + teacher preview + "why this question" source excerpt + report-question button |
| 2 | Question is ambiguous / two answers look correct | Frustration, unfair loss | Ambiguity self-critique pass + teacher edit + report button |
| 3 | Class mismatch (too hard for Class 2) | Child disengages | Band rules enforced in code, not just prompt; readability metric check |
| 4 | PDF extraction garbage | Useless quiz | Text-layer detection first, OCR fallback, confidence warning, paste-text escape hatch |
| 5 | Generation latency feels slow | Teacher abandons | Streaming partial questions + educational loading messages + hard 25 s p95 budget |
| 6 | AI cost per teacher too high | Unit economics break | Generate-once/play-many, over-generation in one call, caching, versioning, daily caps |
| 7 | Low-end device stutter | Bad experience in real classrooms | Performance budgets, transform/opacity-only animation, reduced-motion, no video |
| 8 | IP/legal exposure (show branding) | Takedown risk | Section 2 hard prohibitions + asset licence register + original brand |
| 9 | Sensitive curriculum topic handled badly | Parent/school complaint | Section 12.2 rule 4 + `needs_review` flag + teacher gate |
| 10 | Hindi quality poor | Trust loss in the target market | Hindi-native prompt templates + Devanagari font stack + native reviewer pass pre-launch |
| 11 | Teacher edits break validation | Bad question reaches students | Re-validate every teacher edit with the same 10-point engine |
| 12 | Provider outage mid-generation | Broken demo | Provider adapter fallback + retry + queued generation job + clear teacher message |

---

## 25. ACCEPTANCE TEST PLAN

Each test MUST pass. "Pass" criteria are explicit; a subjective check is not a pass.

| # | Test | Pass criteria |
|---|---|---|
| 1 | Class 1 + Animals | 15 Qs generated; all stems ≤ 12 words; ≥ 70 % picture/illustration supported; timer default 45 s (or none); **no elimination**; buttons ≥ 88 px; child can play with zero reading help beyond one word |
| 2 | Class 3 + Fractions | Questions are concept-based, not rote; at least 2 questions use a visual (pizza/circle division); no Class-8 vocabulary; explanations ≤ 2 sentences |
| 3 | Class 5 + Solar System | 5 stages populated; difficulty rises stage-wise; explanations factually correct; winner screen reachable |
| 4 | Class 8 + sensitive curriculum content (e.g. human reproduction) | Content is scientific, curriculum-oriented, non-graphic, non-humorous; unsafe variants rejected by the safety pass; teacher can flag and edit; no inappropriate wording reaches the student screen |
| 5 | Upload PDF → generate | Questions ≥ 80 % traceable to the document; "Why this question?" shows page/section/excerpt; zero unrelated injected facts when `allow_additional_knowledge=false`; unreadable PDF gives the friendly error |
| 6 | Wrong answer path | Soft shake + `wrong.wav` + "NOT QUITE!" + correct answer + explanation + CONTINUE; never an instant jump; never humiliating wording |
| 7 | Correct answer path | Glow + particles + `correct.wav` + "CORRECT!" + explanation + score count-up; score increments exactly per stage points |
| 8 | All four lifelines | Each works once, then shows USED and cannot be retriggered; 50:50 never removes the correct option; clue does not reveal the answer verbatim; second chance awards 50 % and flags `assisted`; change question keeps class/topic/stage/difficulty and never repeats a seen question |
| 9 | Clear Stage 5 | WINNER screen with name, topic, class, score, accuracy, time, lifelines used + celebration; result row written to DB |
| 10 | Replay same quiz | Same package replays instantly with no AI call (verify zero generation requests); lifelines and score reset; new result row created |
| 11 | Mobile phone (360×640, portrait + landscape) | Question + 4 options visible without scrolling in landscape; all tap targets ≥ 48 px; no horizontal scroll; audio works after first tap |
| 12 | Tablet / projector (1366×768, fullscreen) | Text readable from 3 m; fullscreen works; no layout overflow; timer and score visible from the back of a classroom |
| 13 | Low-end laptop (4 GB RAM, integrated GPU) | Gameplay ≥ 30 fps; no jank on option reveal; memory ≤ 150 MB; initial load ≤ 1.5 s on 4G |
| 14 | Offline mid-game | Disconnect after question 3 → game completes; result syncs on reconnect exactly once (idempotent) |
| 15 | Sound OFF / reduced motion | Game fully playable and understandable with all sound off and animations reduced |
| 16 | Teacher 60-second test | A first-time teacher creates and starts a Class 5 game in under 60 seconds without help |

### 25.1 Final product test — ask five questions

1. Does it feel like a **game**?
2. Is the **student excited**?
3. Can a teacher create a game **within one minute**?
4. Are the questions **educationally reliable**?
5. Does the application look **premium**?

**If ANY answer is NO, the product is not ready.** No exceptions, no "we'll polish later".

### 25.2 Test pyramid

- **Unit (Vitest):** game engine state machine, stage distribution, pass/winner logic, scoring, lifeline edge cases, all 10 validators, result object shape. Target ≥ 90 % coverage on `packages/game-engine`.
- **Integration:** generation pipeline with a mocked provider returning deliberately broken questions (two correct options, duplicate, unsafe) → assert repair/drop behaviour.
- **E2E (Playwright):** full happy path (Class 5 Solar System → win), wrong-answer path, all-lifelines path, replay path, offline path, mobile viewport.
- **A11y (axe):** zero critical violations on landing, create, game, result.
- **Performance (Lighthouse CI):** budgets from Section 18.1 enforced on the student flow.

---

## 26. DEFINITION OF DONE (V1)

A build is done when:

- [ ] All 16 acceptance tests pass, with evidence (screenshots/videos) for tests 1, 2, 3, 4, 9, 11, 12, 13.
- [ ] No KBC/protected asset anywhere in the repo (`/legal/ASSET_LICENSES.md` complete, no unlicensed file).
- [ ] Every generated question passes all 10 validators; validator failures are logged with codes.
- [ ] Gameplay performs zero AI calls (proven by a network trace in the replay test).
- [ ] Sound settings (global + music + effects + volume) work and persist.
- [ ] Reduced-motion and sound-off play are fully functional.
- [ ] Hindi UI is complete and correct for all student-facing strings (native review).
- [ ] Performance budgets met on a mid-range Android device and a low-end laptop.
- [ ] Teacher can delete quizzes and all student results (privacy control works).
- [ ] Loading, error and empty states implemented for every async action.
- [ ] English + Hindi question generation both verified for the 6 reference topics.
- [ ] The "five questions" test in 25.1 answers YES five times.

---

## APPENDIX A — READY SAMPLE QUIZ PACK (Hindi, Computer, Class 7–8)

Extracted from teacher-provided reference material (YouTube Shorts links + Hindi answers). Use as a **seed/demo pack** and as the golden formatting example for Hindi generation.

Source links (kept as reference only — never embedded or played in-product):
`youtube.com/shorts/_KqtwA9rlo0` · `XLWkvR9mDsk` · `q7viIde4hCQ` · `VTAyHmnJFo4` · `TASAlyzsNg4`

**Note:** 5 questions exist in the source; the 15-question default needs 10 more generated in the same style (marked `TODO-GENERATE`). Distribution for 5 questions = 1 per stage.

```json
{
  "schema_version": "1.0",
  "quiz_id": "qz_demo_hi_computer_01",
  "version": 1,
  "title": "कक्षा 7-8 – कंप्यूटर ज्ञान चैलेंज",
  "class_level": 7,
  "subject": "Computer",
  "topic": "कंप्यूटर की बुनियादी बातें एवं भारत का सुपर कंप्यूटर",
  "language": "hi",
  "difficulty_profile": "auto-7",
  "source_type": "topic",
  "settings": {
    "timer_seconds": 30, "stage_pass_ratio": 0.6, "always_advance": false,
    "points_mode": "points", "stage_points": [100, 200, 300, 500, 1000],
    "lifelines": { "half_half": 1, "clue": 1, "second_chance": 1, "change_question": 1 },
    "sound": true, "music": true, "mascot": true
  },
  "stages": [
    { "stage": 1, "name": "वार्म-अप", "difficulty": "very_easy", "question_ids": ["q_hi_01"] },
    { "stage": 2, "name": "स्टार्टर चैलेंज", "difficulty": "easy", "question_ids": ["q_hi_02"] },
    { "stage": 3, "name": "थिंक स्मार्ट", "difficulty": "medium", "question_ids": ["q_hi_03"] },
    { "stage": 4, "name": "ब्रेन चैलेंज", "difficulty": "hard", "question_ids": ["q_hi_04"] },
    { "stage": 5, "name": "फाइनल चैलेंज", "difficulty": "highest", "question_ids": ["q_hi_05"] }
  ],
  "questions": [
    {
      "question_id": "q_hi_01", "stage": 1, "difficulty": "very_easy",
      "cognitive_level": "recall", "concept_tag": "output device",
      "question": "निम्न में से कौन-सा स्टोरेज डिवाइस नहीं है?",
      "options": { "A": "पेन ड्राइव", "B": "मॉनिटर", "C": "रैम", "D": "हार्ड डिस्क" },
      "correct_option": "B",
      "explanation": "मॉनिटर एक आउटपुट डिवाइस है। यह डेटा, टेक्स्ट और वीडियो को स्क्रीन पर दिखाता है, डेटा स्टोर नहीं करता।",
      "simple_explanation": "मॉनिटर सिर्फ दिखाता है, कुछ याद नहीं रखता। इसलिए यह स्टोरेज डिवाइस नहीं है।",
      "clue": "यह डिवाइस जानकारी को सिर्फ दिखाता है, सुरक्षित नहीं रखता।",
      "source_reference": { "type": "teacher_material", "note": "स्टोरेज डिवाइस" }
    },
    {
      "question_id": "q_hi_02", "stage": 2, "difficulty": "easy",
      "cognitive_level": "understanding", "concept_tag": "booting",
      "question": "कंप्यूटर को चालू करने की प्रक्रिया को क्या कहते हैं?",
      "options": { "A": "बूटिंग", "B": "शटडाउन", "C": "रीस्टार्ट", "D": "लॉगिन" },
      "correct_option": "A",
      "explanation": "पावर बटन दबाने पर ऑपरेटिंग सिस्टम सेकेंडरी मेमोरी से मुख्य मेमोरी (RAM) में लोड होता है। इस शुरुआती प्रक्रिया को बूटिंग कहते हैं।",
      "simple_explanation": "कंप्यूटर चालू होकर तैयार होने की प्रक्रिया = बूटिंग।",
      "clue": "यह शब्द 'जूते के फीते' वाले अंग्रेज़ी शब्द से बना है — जैसे चलने से पहले जूता पहनना।",
      "source_reference": { "type": "teacher_material", "note": "बूटिंग बनाम शटडाउन" }
    },
    {
      "question_id": "q_hi_03", "stage": 3, "difficulty": "medium",
      "cognitive_level": "understanding", "concept_tag": "cpu expansion",
      "question": "C.P.U. का पूरा नाम क्या है?",
      "options": { "A": "सेंट्रल प्रोसेसिंग यूनिट", "B": "सेंटर प्रोग्रेस यूनिट", "C": "सेंटर प्रोसेसिंग यूनिट", "D": "कंप्यूटर प्रोसेस यूनिट" },
      "correct_option": "A",
      "explanation": "C.P.U. यानी Central Processing Unit — इसे कंप्यूटर का 'मस्तिष्क' कहते हैं। यह निर्देशों को प्रोसेस करता है और परिणाम आउटपुट तक पहुँचाता है।",
      "simple_explanation": "CPU कंप्यूटर का दिमाग है — सोचता और गणना करता है।",
      "clue": "'Central' और 'Processing' दोनों शब्द याद रखें — बीच वाला शब्द कोई और नहीं है।",
      "source_reference": { "type": "teacher_material", "note": "CPU" }
    },
    {
      "question_id": "q_hi_04", "stage": 4, "difficulty": "hard",
      "cognitive_level": "application", "concept_tag": "software purpose",
      "question": "MS Paint का मुख्य उपयोग किस लिए किया जाता है?",
      "options": { "A": "प्रोग्रामिंग कोड लिखने के लिए", "B": "ई-मेल भेजने के लिए", "C": "म्यूजिक सुनने के लिए", "D": "चित्र बनाने और संपादित करने के लिए" },
      "correct_option": "D",
      "explanation": "MS Paint विंडोज़ का बुनियादी ग्राफ़िक्स सॉफ्टवेयर है। इससे डिजिटल ड्राइंग बनाई जाती है, आकृतियों में रंग भरा जाता है और चित्र क्रॉप/एडिट किए जाते हैं।",
      "simple_explanation": "Paint = चित्र बनाने और ठीक करने का सॉफ्टवेयर।",
      "clue": "इस सॉफ्टवेयर में ब्रश, रंग और आकृतियाँ मिलती हैं।",
      "source_reference": { "type": "teacher_material", "note": "MS Paint" }
    },
    {
      "question_id": "q_hi_05", "stage": 5, "difficulty": "hard",
      "cognitive_level": "reasoning", "concept_tag": "india supercomputing",
      "question": "भारत का पहला स्वदेशी सुपर कंप्यूटर कौन-सा है?",
      "options": { "A": "परम-8000", "B": "परम-800", "C": "परम-80", "D": "परम-8" },
      "correct_option": "A",
      "explanation": "परम-8000 भारत का पहला स्वदेशी सुपर कंप्यूटर है, जिसे 1991 में C-DAC, पुणे द्वारा विकसित किया गया था। परम श्रृंखला के आगे के मॉडल: परम-10000, परम युवा, परम सिद्धि-AI, परम प्रवेग।",
      "simple_explanation": "1991 में C-DAC पुणे ने परम-8000 बनाया — यह भारत का पहला अपना सुपर कंप्यूटर था।",
      "clue": "नाम में साल जैसा बड़ा अंक है — 8000, 800 नहीं।",
      "source_reference": { "type": "teacher_material", "note": "परम श्रृंखला" }
    }
  ],
  "generation_meta": { "model": "seed-pack", "validator_pass": true, "regenerations": 0, "note": "TODO-GENERATE: 10 more questions needed to reach the 15-question default (2 per stage for a 10-question game, or 3 per stage for 15)." }
}
```

**Distractor-quality lesson from this pack (reuse this pattern in prompts):** every wrong option in the source material is explained with *why it is wrong* — e.g. `(B) शटडाउन` = power off, `(C) रीस्टार्ट` = warm booting, `(D) लॉगिन` = account entry. Prompt templates MUST demand that each distractor be **plausible for this class and clearly wrong for a stated reason**, and that the explanation optionally addresses the strongest distractor.

---

## APPENDIX B — AI PROMPT ARCHITECTURE

### B.1 System prompt (verbatim, use as-is)

```
You are the educational assessment engine of QUIZVERSE, a classroom game-show platform for
Indian school students in Classes 1 to 8.

PRIMARY DUTY
Convert a Class + Topic (or supplied learning material) into a validated multiple-choice
question bank that will be played inside a 5-stage game.

NON-NEGOTIABLE RULES
1. Respect the class level absolutely. A Class 2 student must be able to read and understand
   every word. Never use vocabulary, sentence length or concepts above the class band.
2. Exactly four options per question (A, B, C, D). Exactly one is correct.
3. Distractors must be plausible for this class and unambiguously wrong. Never two correct
   options, never zero correct options, never "none of the above" unless the topic requires it
   and the class is 6-8.
4. Never write ambiguous, trick, negative-only or double-negative questions.
5. Language must match the requested language exactly (English or Hindi in Devanagari).
   For Hindi, use simple school-level Hindi, correct matras and standard terminology.
6. In material mode, use ONLY facts present in the supplied material unless
   allow_additional_knowledge is true. Never invent facts. Every question carries a
   source_reference when material is supplied.
7. Explanations: 1-3 sentences, age-simplified, always consistent with the correct option.
   Also give a shorter 'simple_explanation' for younger readers.
8. Each question gets a 'clue' for the CLASSROOM CLUE lifeline. The clue must guide thinking
   without stating the answer or any exact key word of the correct option.
9. Difficulty must rise across stages: recall -> understanding -> application -> reasoning.
10. Cognitive spread: stage 1 mostly recall; stage 2 recall+understanding; stage 3
    understanding+application; stage 4 application+reasoning; stage 5 higher-order thinking
    appropriate for the age.
11. Assign every question a short 'concept_tag' (2-4 words) used later for teacher analytics.
12. Age suitability, factual accuracy and safety are more important than cleverness.
    If you cannot produce enough safe, accurate questions, return fewer questions and say so.

SAFETY (children are the users)
Never generate sexual, romantic, violent, self-harm, hateful, communal, political-campaigning,
gambling, dangerous-instruction, body-shaming or frightening content. Sensitive curriculum
topics are allowed only in a strictly scientific, curriculum-oriented, non-graphic register for
Classes 7-8. Never reference a real named student. Never collect or ask for personal data.

TONE FOR STUDENT-FACING TEXT
Encouraging, kind, energetic. Never humiliating, sarcastic or comparative with other students.

OUTPUT
Return ONLY valid JSON conforming to the provided schema. No prose, no markdown, no commentary.
```

### B.2 User prompt template (topic mode)

```
Generate a quiz package.

class_level: {{class_level}}
class_band: {{band}}              # A(1-2) | B(3-5) | C(6-8)
topic: {{topic}}
subject: {{subject}}
language: {{language}}
difficulty: {{difficulty}}         # auto resolves to: {{resolved_difficulty}}
question_count: {{question_count}}
over_generate: {{question_count * 1.6 rounded up}}   # extras power CHANGE QUESTION
stage_distribution: {{distribution}}                 # e.g. [3,3,3,3,3]
vocabulary_ceiling: {{max_words_question_stem}} words per question stem
timer_seconds: {{timer_seconds}}

Difficulty ladder for this class:
stage1=very_easy(recall) stage2=easy(recall+understanding) stage3=medium(understanding+application)
stage4=hard(application+reasoning) stage5=highest(higher-order thinking for {{class_band}})

Return JSON: { title, questions: [ { question_id, stage, difficulty, cognitive_level,
concept_tag, question, options{A,B,C,D}, correct_option, explanation, simple_explanation,
clue, source_reference } ] }
```

### B.3 Material-mode addendum (append to B.2)

```
source_mode: material
material_text:
"""
{{extracted_text_with_page_markers}}
"""
allow_additional_knowledge: {{true|false}}

For every question:
- Base it strictly on the material above. Do not add outside facts.
- Include source_reference { page, section, excerpt } where excerpt is a short (<25 words)
  quote from the material that justifies the question.
- If allow_additional_knowledge is false and a concept cannot be questioned from the material
  alone, DO NOT create that question.
- Prefer concepts that appear in headings, bold text, definitions, examples, tables and
  repeated ideas. Skip page numbers, footers, references and formatting artefacts.
```

### B.4 Validation prompt (second pass, self-critique)

```
You are the QUIZVERSE VALIDATOR. Audit the questions below against the 10 checks.
Return JSON: { "results": [ { "question_id", "pass": true|false,
"failures": [ { "code": "TWO_CORRECT"|"NO_CORRECT"|"DUPLICATE_OPTION"|"DUPLICATE_QUESTION"|
"CLASS_MISMATCH"|"LANGUAGE_MISMATCH"|"AMBIGUOUS"|"EXPLANATION_MISMATCH"|
"UNSOURCED"|"UNSAFE"|"CLUE_REVEALS_ANSWER"|"SPOILER_IN_STEM", "detail": "..." } ] } ] }

Be strict. A question that could be argued correct for a second option MUST fail as AMBIGUOUS.
A question whose vocabulary exceeds the class band MUST fail as CLASS_MISMATCH.
A question that is not traceable to the supplied material MUST fail as UNSOURCED.
```

### B.5 Repair prompt (exact, bounded)

```
This question failed validation:
{{question_json}}

Failure codes: {{failure_codes_with_details}}
class_level: {{class_level}}  language: {{language}}  difficulty: {{difficulty}}

Rewrite ONLY this question so that every listed failure is fixed while keeping the same
stage, difficulty, cognitive level and concept_tag. Return exactly one JSON question object.
Do not change the concept being tested. Do not exceed the class vocabulary band.
```

---

## APPENDIX C — SHARED TYPES & SCHEMA NOTES (for `packages/quiz-schema`)

```ts
type Language = 'en' | 'hi';
type Difficulty = 'very_easy' | 'easy' | 'medium' | 'hard' | 'highest';
type CognitiveLevel = 'recall' | 'understanding' | 'application' | 'reasoning';
type OptionKey = 'A' | 'B' | 'C' | 'D';
type LifelineKind = 'half_half' | 'clue' | 'second_chance' | 'change_question';
type GameStatus = 'WINNER' | 'NOT_CLEARED' | 'ABORTED';
type SourceType = 'topic' | 'material' | 'mixed';
type SafetyStatus = 'safe' | 'needs_review' | 'blocked';

interface Question {
  question_id: string; stage: number; question: string;
  options: Record<OptionKey, string>; correct_option: OptionKey;
  explanation: string; simple_explanation?: string; clue: string;
  difficulty: Difficulty; cognitive_level: CognitiveLevel; concept_tag: string;
  source_reference?: { page?: number; section?: string; excerpt?: string; type?: string; note?: string } | null;
  safety_status?: SafetyStatus;
}

interface QuizPackage { /* see Section 8.3 for the full JSON */ }
interface GameResult { /* see Section 7.8 */ }
```

Implementation rules:
- Parse every AI response with **Zod** (`QuizPackageSchema.safeParse`). Never `as QuizPackage`.
- Reject a package if any question fails validation on the client boundary — defence in depth.
- `schema_version` is checked; unknown major version → refuse to play and log.

---

## APPENDIX D — UI STRING DICTIONARY (student-facing, EN + HI)

| Key | English | Hindi |
|---|---|---|
| `app.tagline` | Learn. Think. Win. | सीखो. सोचो. जीतो. |
| `landing.headline` | Turn any lesson into a game | किसी भी पाठ को खेल में बदलें |
| `landing.cta_primary` | Create Quiz | क्विज़ बनाएँ |
| `landing.cta_demo` | Try Demo | डेमो देखें |
| `create.title` | Create Your Game | अपना गेम बनाएँ |
| `create.class` | Select Class | कक्षा चुनें |
| `create.topic` | Enter Topic | विषय लिखें |
| `create.generate` | Generate Game | गेम बनाएँ |
| `create.from_material` | Create From My Material | मेरी सामग्री से बनाएँ |
| `create.material_loaded` | Material successfully loaded. | सामग्री सफलतापूर्वक लोड हो गई। |
| `loading.understanding` | Understanding your topic… | आपका विषय समझा जा रहा है… |
| `loading.preparing` | Preparing questions… | प्रश्न तैयार हो रहे हैं… |
| `loading.checking` | Checking answer quality… | उत्तर की गुणवत्ता जाँची जा रही है… |
| `loading.balancing` | Balancing difficulty… | कठिनाई संतुलित की जा रही है… |
| `loading.building` | Building your game… | आपका गेम बन रहा है… |
| `loading.almost` | Almost ready! | बस तैयार है! |
| `student.name_prompt` | Who is playing today? | आज कौन खेल रहा है? |
| `student.start` | Start Challenge | चुनौती शुरू करें |
| `briefing.welcome` | Welcome to the Challenge! | चुनौती में आपका स्वागत है! |
| `briefing.mission` | {name}, your mission is to complete all five stages. | {name}, आपको पाँचों स्टेज पूरे करने हैं। |
| `briefing.lets_play` | Let's Play | चलो खेलें |
| `game.stage` | Stage | स्टेज |
| `game.score` | Score | स्कोर |
| `game.correct` | CORRECT! | सही! |
| `game.not_quite` | NOT QUITE! | बिलकुल नहीं — चलो सीखें! |
| `game.correct_answer_is` | Correct answer: {answer} | सही उत्तर: {answer} |
| `game.continue` | Continue | आगे बढ़ें |
| `lifeline.half_half` | 50:50 | 50:50 |
| `lifeline.clue` | Classroom Clue | क्लासरूम संकेत |
| `lifeline.second_chance` | Second Chance | दूसरा मौका |
| `lifeline.change_question` | Change Question | प्रश्न बदलें |
| `lifeline.used` | USED | उपयोग हो गया |
| `stage.complete` | STAGE {n} COMPLETE! | स्टेज {n} पूरा! |
| `win.title` | CONGRATULATIONS {name}! | बधाई हो {name}! |
| `win.subtitle` | You completed the {topic} Challenge | आपने {topic} चुनौती पूरी की |
| `effort.title` | GREAT EFFORT, {name}! | बहुत बढ़िया कोशिश, {name}! |
| `effort.reached` | You reached Stage {n} | आप स्टेज {n} तक पहुँचे |
| `result.review` | Review Questions | प्रश्न दोबारा देखें |
| `result.try_again` | Try Again | फिर कोशिश करें |
| `sound.on` / `sound.off` | Sound On / Sound Off | आवाज़ चालू / आवाज़ बंद |
| `error.generation` | Quiz generation temporarily failed. | क्विज़ बनाने में अस्थायी समस्या हुई। |
| `error.pdf` | Unable to read this document. Please try another PDF or paste the text. | यह दस्तावेज़ पढ़ा नहीं जा सका। दूसरा PDF आज़माएँ या टेक्स्ट पेस्ट करें। |

Rules: short lines, no idioms, no sarcasm, verbs in a friendly imperative, always address the student by first name, all strings externalised in an i18n file (never hard-coded in components).

---

## APPENDIX E — GLOSSARY

| Term | Meaning |
|---|---|
| **Quiz Package** | The frozen, validated JSON artefact (questions + stages + settings) that the game engine plays. Single source of truth. |
| **Question Pool** | Over-generated question set from which stages are filled and CHANGE QUESTION replacements are drawn. |
| **Stage** | One of five difficulty tiers; contains N questions and has its own points and pass condition. |
| **Band** | Class grouping A (1–2), B (3–5), C (6–8) driving difficulty and visual tier. |
| **Lifeline** | One-time in-game assistance (50:50, Clue, Second Chance, Change Question). |
| **Material Mode** | Quiz generated strictly from uploaded teacher content with source tracing. |
| **Assisted** | A question answered correctly using SECOND CHANCE; scores 50 % and is flagged for analytics. |
| **Concept Tag** | Short label attached to a question (e.g. "planet identity") powering weak-topic analytics. |
| **Not Cleared** | Student reached but did not pass Stage 5 — shown as "GREAT EFFORT", never as failure. |
| **Game Feel** | The quality of anticipation, suspense, reveal and reward in the interaction loop. |

---

## APPENDIX F — OPEN DECISIONS (teacher/product owner to confirm before build freeze)

1. **Brand name:** keep `QUIZVERSE` or choose a school/Bharat-specific name?
2. **Deployment target for pilot:** single-device demo (Path A) or full SaaS (Path B)?
3. **AI provider for V1:** which provider + budget cap per teacher per day?
4. **Syllabus alignment:** free-topic only in V1, or map to NCERT chapters from day one?
5. **Hindi/English default** and whether Hinglish is needed earlier than V2.
6. **Scoring display:** points mode (default) or simple correct/incorrect for Classes 1–2?
7. **Elimination policy:** confirm "no elimination for Classes 1–2" as the default.
8. **Teacher accounts in V1**, or single-teacher local mode first (no login)?
9. **Certificate + school branding:** V1 or V1.5?
10. **Analytics retention period** and who may export student data.

---

**END OF PRODUCT DEVELOPMENT FILE v1.0**

> Build it as a **GAME PRODUCT** with **EDUCATIONAL INTELLIGENCE** and **PREMIUM CHILD-FRIENDLY UX**.
> A technically functional application with poor graphics or boring gameplay is an **unsuccessful implementation**.
