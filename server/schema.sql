-- QUIZVERSE — Postgres schema (PRODUCT_DEVELOPMENT.md §16)
-- Used when QV_STORAGE=postgres. The file store mirrors this structure.
--
--   psql "$QV_DATABASE_URL" -f server/schema.sql
--
-- Privacy by design: the only student data stored is a first name and a game
-- result. No student account, no email, no contact details, no location.

create table if not exists teachers (
  teacher_id    text primary key,
  name          text not null,
  email         text not null unique,
  school_name   text,
  password_hash text not null,
  password_salt text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists materials (
  material_id    text primary key,
  teacher_id     text not null references teachers(teacher_id) on delete cascade,
  file_name      text not null,
  file_type      text not null default 'text',
  extracted_text text not null,
  page_count     integer,
  char_count     integer not null default 0,
  source_hash    text,
  created_at     timestamptz not null default now()
);

create table if not exists quizzes (
  quiz_id         text primary key,
  teacher_id      text not null references teachers(teacher_id) on delete cascade,
  title           text not null,
  class_level     integer not null check (class_level between 1 and 8),
  subject         text not null default 'General',
  topic           text not null default 'General',
  language        text not null default 'en',
  source_type     text not null default 'topic',
  question_count  integer not null default 0,
  current_version integer not null default 1,
  package_json    jsonb not null,          -- the frozen Quiz Package the game plays
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists quizzes_teacher_idx on quizzes (teacher_id, updated_at desc);

-- Every version is immutable: a teacher can always go back to what the class saw.
create table if not exists quiz_versions (
  quiz_id    text not null references quizzes(quiz_id) on delete cascade,
  version    integer not null,
  package    jsonb not null,
  note       text,
  created_by text,
  created_at timestamptz not null default now(),
  primary key (quiz_id, version)
);

-- Live sessions: opened by the teacher when a game starts. The session token is
-- the only credential a student device needs to submit one result.
create table if not exists live_sessions (
  session_id    text primary key,
  quiz_id       text not null references quizzes(quiz_id) on delete cascade,
  session_token text not null,
  student_name  text,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create table if not exists game_sessions (
  session_id         text primary key,
  quiz_id            text not null references quizzes(quiz_id) on delete cascade,
  student_name       text not null,          -- first name only
  class_level        integer,
  mode               text not null default 'individual',
  score              integer not null default 0,
  max_score          integer not null default 0,
  accuracy           numeric(5,1) not null default 0,
  correct_count      integer not null default 0,
  incorrect_count    integer not null default 0,
  stage_reached      integer not null default 0,
  stages_cleared     integer not null default 0,
  status             text not null default 'ABORTED',
  lifelines_used_json jsonb not null default '[]'::jsonb,
  started_at         timestamptz,
  completed_at       timestamptz not null default now(),
  time_taken_seconds integer not null default 0,
  device_json        jsonb not null default '{}'::jsonb,
  result_json        jsonb not null
);

create index if not exists game_sessions_quiz_idx on game_sessions (quiz_id, completed_at desc);

-- Question-level events power "which question did the class miss?" analytics.
create table if not exists answer_events (
  id            bigserial primary key,
  session_id    text not null references game_sessions(session_id) on delete cascade,
  question_id   text not null,
  stage         integer,
  selected_option text,
  correct_option  text,
  is_correct    boolean not null,
  assisted      boolean not null default false,
  time_seconds  integer,
  concept_tag   text,
  answered_at   timestamptz not null default now()
);

create index if not exists answer_events_session_idx on answer_events (session_id);
create index if not exists answer_events_question_idx on answer_events (question_id);

-- Optional convenience view for the teacher dashboard.
create or replace view quiz_analytics as
select
  s.quiz_id,
  count(*)                              as plays,
  count(*) filter (where s.status = 'WINNER') as wins,
  round(avg(s.score))                   as avg_score,
  round(avg(s.accuracy), 1)             as avg_accuracy,
  round(avg(s.time_taken_seconds))      as avg_time_seconds
from game_sessions s
group by s.quiz_id;
