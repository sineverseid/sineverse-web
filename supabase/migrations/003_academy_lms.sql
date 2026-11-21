-- ============================================================================
-- SINEVERSE — Migration 003: Academy / LMS lengkap
-- Project: sineverse (Supabase, Singapore, Postgres 15)
-- Source of truth: ~/workspace/sineverse-app/REBUILD_PLAN.md §2, Migrasi 003
--
-- What it adds (11 tables):
--   course_teachers, course_announcements, announcements, waitlist,
--   lesson_resources, competency_exams, exam_attempts, quiz_questions,
--   discussion_reactions, discussion_reports, rps
-- Plus ALTER TABLE additions on courses, modules, lessons, lesson_progress,
-- discussions, profiles (see "Column additions" below).
-- Seeds: rps row SVS-SEM1 (20-week plan, weights 20/50/30, passing 70).
--
-- How to apply:
--   Supabase Dashboard -> SQL Editor -> paste this file -> Run.
--   Apply in order 003 -> 008. Migrations 001-002 are already applied live;
--   do NOT re-run them (they are idempotent, but only 003-008 still need
--   running). Requires 001 (profiles/courses/modules/lessons/enrollments/
--   lesson_progress/quizzes/discussions + public.is_admin()).
--
-- Notes:
--   * RLS pattern follows 001 exactly: own-row user_id = auth.uid(),
--     mentor-own-course via EXISTS join to courses.mentor_id, admin via
--     public.is_admin(), public catalog read for authenticated.
--   * quiz_questions.correct_answer must NEVER reach a student client.
--     The select policy below allows full-row reads only to the course
--     teacher / admin. Students fetch questions via the security-definer
--     RPC public.get_quiz_questions(), which omits correct_answer.
--   * Gradebook needs NO table: computed from quizzes + quiz_attempts +
--     assignments + submissions + competency_exams + exam_attempts with
--     weights from rps.weights (20/50/30), renormalised when a component
--     is empty (see REBUILD_PLAN.md §2, Migrasi 003).
--   * No secrets, passwords, or service_role keys are in this file.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.course_teachers (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'co_mentor'
    check (role in ('co_mentor', 'assistant_grader')),
  created_at timestamptz not null default now(),
  unique (course_id, user_id)
);

create table if not exists public.course_announcements (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null,
  body text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'platform'
    check (scope in ('platform', 'course')),
  course_id uuid references public.courses (id) on delete cascade,
  title text not null,
  body text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (course_id, user_id)
);

create table if not exists public.lesson_resources (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  kind text not null
    check (kind in ('reading', 'image', 'pdf', 'video', 'file', 'link')),
  title text not null,
  url text,
  body text,
  created_at timestamptz not null default now()
);

create table if not exists public.competency_exams (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses (id) on delete cascade,
  title text not null,
  description text,
  passing_score int not null default 70,
  max_attempts int,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.competency_exams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  score int,
  answers jsonb,
  passed boolean,
  attempted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  kind text not null
    check (kind in ('mc', 'true_false', 'short')),
  question text not null,
  options jsonb,
  correct_answer text,
  explanation text,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.discussion_reactions (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references public.discussions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'helpful'
    check (kind in ('helpful')),
  created_at timestamptz not null default now(),
  unique (discussion_id, user_id, kind)
);

create table if not exists public.discussion_reports (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references public.discussions (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text,
  status text not null default 'open'
    check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.rps (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text,
  weights jsonb not null default '{"kuis": 20, "tugas": 50, "ujian": 30}'::jsonb,
  passing_grade int not null default 70,
  weeks jsonb,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper functions (moved after tables: SQL-language functions are
-- validated at creation, so they must be defined after the tables they query)
-- ---------------------------------------------------------------------------
create or replace function public.is_course_teacher(p_course_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.courses
    where id = p_course_id and mentor_id = auth.uid()
  )
  or exists (
    select 1 from public.course_teachers
    where course_id = p_course_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_course_participant(p_course_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.enrollments
    where course_id = p_course_id and user_id = auth.uid()
  )
  or public.is_course_teacher(p_course_id);
$$;

grant execute on function public.is_course_teacher(uuid) to authenticated;
grant execute on function public.is_course_participant(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- Column additions on existing tables (idempotent)
-- ---------------------------------------------------------------------------
alter table public.courses
  add column if not exists enrollment_key text;
alter table public.courses
  add column if not exists passing_grade int not null default 70;
alter table public.modules
  add column if not exists is_published boolean not null default true;
alter table public.modules
  add column if not exists release_label text;
alter table public.lessons
  add column if not exists lesson_code text;
alter table public.lesson_progress
  add column if not exists started_at timestamptz;
alter table public.discussions
  add column if not exists is_pinned boolean not null default false;
alter table public.discussions
  add column if not exists is_resolved boolean not null default false;
alter table public.discussions
  add column if not exists accepted_answer_id uuid references public.discussions (id) on delete set null;
alter table public.profiles
  add column if not exists birth_date date;
alter table public.profiles
  add column if not exists gender text;
alter table public.profiles
  add column if not exists address text;
alter table public.profiles
  add column if not exists bio text;

-- ---------------------------------------------------------------------------
-- Student-safe quiz questions RPC (security definer).
-- Returns the questions for one quiz WITHOUT correct_answer, only to a
-- student enrolled in the quiz's course, the course teacher, or an admin.
-- ---------------------------------------------------------------------------
create or replace function public.get_quiz_questions(p_quiz_id uuid)
returns table (
  id uuid,
  quiz_id uuid,
  kind text,
  question text,
  options jsonb,
  explanation text,
  order_index int,
  created_at timestamptz
)
language sql
security definer
stable
as $$
  select q.id, q.quiz_id, q.kind, q.question, q.options,
         q.explanation, q.order_index, q.created_at
  from public.quiz_questions q
  join public.quizzes z on z.id = q.quiz_id
  join public.lessons l on l.id = z.lesson_id
  join public.modules m on m.id = l.module_id
  where q.quiz_id = p_quiz_id
    and (
      public.is_course_participant(m.course_id)
      or public.is_admin()
    )
  order by q.order_index, q.created_at;
$$;

grant execute on function public.get_quiz_questions(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Indexes on foreign keys
-- ---------------------------------------------------------------------------
create index if not exists course_teachers_course_id_idx
  on public.course_teachers (course_id);
create index if not exists course_teachers_user_id_idx
  on public.course_teachers (user_id);
create index if not exists course_announcements_course_id_idx
  on public.course_announcements (course_id);
create index if not exists course_announcements_created_by_idx
  on public.course_announcements (created_by);
create index if not exists announcements_course_id_idx
  on public.announcements (course_id);
create index if not exists announcements_created_by_idx
  on public.announcements (created_by);
create index if not exists waitlist_course_id_idx
  on public.waitlist (course_id);
create index if not exists waitlist_user_id_idx
  on public.waitlist (user_id);
create index if not exists lesson_resources_lesson_id_idx
  on public.lesson_resources (lesson_id);
create index if not exists competency_exams_course_id_idx
  on public.competency_exams (course_id);
create index if not exists competency_exams_created_by_idx
  on public.competency_exams (created_by);
create index if not exists exam_attempts_exam_id_idx
  on public.exam_attempts (exam_id);
create index if not exists exam_attempts_user_id_idx
  on public.exam_attempts (user_id);
create index if not exists quiz_questions_quiz_id_idx
  on public.quiz_questions (quiz_id);
create index if not exists discussion_reactions_discussion_id_idx
  on public.discussion_reactions (discussion_id);
create index if not exists discussion_reactions_user_id_idx
  on public.discussion_reactions (user_id);
create index if not exists discussion_reports_discussion_id_idx
  on public.discussion_reports (discussion_id);
create index if not exists discussion_reports_reporter_id_idx
  on public.discussion_reports (reporter_id);
create index if not exists discussion_reports_resolved_by_idx
  on public.discussion_reports (resolved_by);
create index if not exists rps_code_idx
  on public.rps (code);
create index if not exists rps_updated_by_idx
  on public.rps (updated_by);
create index if not exists discussions_accepted_answer_id_idx
  on public.discussions (accepted_answer_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — on for every table
-- ---------------------------------------------------------------------------
alter table public.course_teachers enable row level security;
alter table public.course_announcements enable row level security;
alter table public.announcements enable row level security;
alter table public.waitlist enable row level security;
alter table public.lesson_resources enable row level security;
alter table public.competency_exams enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.discussion_reactions enable row level security;
alter table public.discussion_reports enable row level security;
alter table public.rps enable row level security;

-- ---------------------------------------------------------------------------
-- Policies — course_teachers
-- ---------------------------------------------------------------------------
-- Participants and teachers of the course can see who teaches it.
drop policy if exists "course_teachers_select_participant" on public.course_teachers;
create policy "course_teachers_select_participant"
  on public.course_teachers for select to authenticated
  using (public.is_course_participant(course_id));

-- The course mentor adds a co-mentor / assistant-grader.
drop policy if exists "course_teachers_insert_mentor" on public.course_teachers;
create policy "course_teachers_insert_mentor"
  on public.course_teachers for insert to authenticated
  with check (exists (
    select 1 from public.courses
    where id = course_id and mentor_id = auth.uid()
  ));

-- The course mentor removes a co-teacher.
drop policy if exists "course_teachers_delete_mentor" on public.course_teachers;
create policy "course_teachers_delete_mentor"
  on public.course_teachers for delete to authenticated
  using (exists (
    select 1 from public.courses
    where id = course_id and mentor_id = auth.uid()
  ));

-- Admins can do everything.
drop policy if exists "course_teachers_admin_all" on public.course_teachers;
create policy "course_teachers_admin_all"
  on public.course_teachers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — course_announcements
-- ---------------------------------------------------------------------------
-- Participants of the course read its announcements.
drop policy if exists "course_announcements_select_participant" on public.course_announcements;
create policy "course_announcements_select_participant"
  on public.course_announcements for select to authenticated
  using (public.is_course_participant(course_id));

-- A teacher of the course posts as themselves.
drop policy if exists "course_announcements_insert_teacher" on public.course_announcements;
create policy "course_announcements_insert_teacher"
  on public.course_announcements for insert to authenticated
  with check (public.is_course_teacher(course_id) and created_by = auth.uid());

-- A teacher edits / deletes their own course's announcements.
drop policy if exists "course_announcements_update_teacher" on public.course_announcements;
create policy "course_announcements_update_teacher"
  on public.course_announcements for update to authenticated
  using (public.is_course_teacher(course_id))
  with check (public.is_course_teacher(course_id));

drop policy if exists "course_announcements_delete_teacher" on public.course_announcements;
create policy "course_announcements_delete_teacher"
  on public.course_announcements for delete to authenticated
  using (public.is_course_teacher(course_id));

-- Admins can do everything.
drop policy if exists "course_announcements_admin_all" on public.course_announcements;
create policy "course_announcements_admin_all"
  on public.course_announcements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — announcements (platform feed)
-- ---------------------------------------------------------------------------
-- Platform-wide announcements: everyone logged in. Course-scoped ones:
-- only participants of that course.
drop policy if exists "announcements_select_authenticated" on public.announcements;
create policy "announcements_select_authenticated"
  on public.announcements for select to authenticated
  using (
    scope = 'platform'
    or (scope = 'course' and course_id is not null
        and public.is_course_participant(course_id))
  );

-- Only admins post platform announcements.
drop policy if exists "announcements_insert_admin" on public.announcements;
create policy "announcements_insert_admin"
  on public.announcements for insert to authenticated
  with check (public.is_admin() and created_by = auth.uid());

-- Admins can do everything (update / delete included).
drop policy if exists "announcements_admin_all" on public.announcements;
create policy "announcements_admin_all"
  on public.announcements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — waitlist
-- ---------------------------------------------------------------------------
-- A user sees only their own waitlist rows.
drop policy if exists "waitlist_select_own" on public.waitlist;
create policy "waitlist_select_own"
  on public.waitlist for select to authenticated
  using (user_id = auth.uid());

-- A course teacher sees the waitlist of their course.
drop policy if exists "waitlist_select_teacher" on public.waitlist;
create policy "waitlist_select_teacher"
  on public.waitlist for select to authenticated
  using (public.is_course_teacher(course_id));

-- A user joins a waitlist only as themselves.
drop policy if exists "waitlist_insert_own" on public.waitlist;
create policy "waitlist_insert_own"
  on public.waitlist for insert to authenticated
  with check (user_id = auth.uid());

-- A user leaves a waitlist only themselves.
drop policy if exists "waitlist_delete_own" on public.waitlist;
create policy "waitlist_delete_own"
  on public.waitlist for delete to authenticated
  using (user_id = auth.uid());

-- Admins can do everything.
drop policy if exists "waitlist_admin_all" on public.waitlist;
create policy "waitlist_admin_all"
  on public.waitlist for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — lesson_resources
-- ---------------------------------------------------------------------------
-- Anyone logged in can read lesson materials.
drop policy if exists "lesson_resources_select_authenticated" on public.lesson_resources;
create policy "lesson_resources_select_authenticated"
  on public.lesson_resources for select to authenticated using (true);

-- A teacher manages resources only in their own courses.
drop policy if exists "lesson_resources_insert_teacher" on public.lesson_resources;
create policy "lesson_resources_insert_teacher"
  on public.lesson_resources for insert to authenticated
  with check (exists (
    select 1
    from public.lessons l
    join public.modules m on m.id = l.module_id
    where l.id = lesson_id and public.is_course_teacher(m.course_id)
  ));

drop policy if exists "lesson_resources_update_teacher" on public.lesson_resources;
create policy "lesson_resources_update_teacher"
  on public.lesson_resources for update to authenticated
  using (exists (
    select 1
    from public.lessons l
    join public.modules m on m.id = l.module_id
    where l.id = lesson_id and public.is_course_teacher(m.course_id)
  ))
  with check (exists (
    select 1
    from public.lessons l
    join public.modules m on m.id = l.module_id
    where l.id = lesson_id and public.is_course_teacher(m.course_id)
  ));

drop policy if exists "lesson_resources_delete_teacher" on public.lesson_resources;
create policy "lesson_resources_delete_teacher"
  on public.lesson_resources for delete to authenticated
  using (exists (
    select 1
    from public.lessons l
    join public.modules m on m.id = l.module_id
    where l.id = lesson_id and public.is_course_teacher(m.course_id)
  ));

-- Admins can do everything.
drop policy if exists "lesson_resources_admin_all" on public.lesson_resources;
create policy "lesson_resources_admin_all"
  on public.lesson_resources for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — competency_exams
-- ---------------------------------------------------------------------------
-- Anyone logged in can read the exam list.
drop policy if exists "competency_exams_select_authenticated" on public.competency_exams;
create policy "competency_exams_select_authenticated"
  on public.competency_exams for select to authenticated using (true);

-- A teacher creates exams for their own course (or an admin creates a
-- course-less exam); the creator is recorded.
drop policy if exists "competency_exams_insert_teacher" on public.competency_exams;
create policy "competency_exams_insert_teacher"
  on public.competency_exams for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      (course_id is null and public.is_admin())
      or (course_id is not null and public.is_course_teacher(course_id))
    )
  );

drop policy if exists "competency_exams_update_teacher" on public.competency_exams;
create policy "competency_exams_update_teacher"
  on public.competency_exams for update to authenticated
  using (
    (course_id is null and public.is_admin())
    or (course_id is not null and public.is_course_teacher(course_id))
  )
  with check (
    (course_id is null and public.is_admin())
    or (course_id is not null and public.is_course_teacher(course_id))
  );

drop policy if exists "competency_exams_delete_teacher" on public.competency_exams;
create policy "competency_exams_delete_teacher"
  on public.competency_exams for delete to authenticated
  using (
    (course_id is null and public.is_admin())
    or (course_id is not null and public.is_course_teacher(course_id))
  );

-- Admins can do everything.
drop policy if exists "competency_exams_admin_all" on public.competency_exams;
create policy "competency_exams_admin_all"
  on public.competency_exams for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — exam_attempts
-- ---------------------------------------------------------------------------
-- A user sees only their own attempts.
drop policy if exists "exam_attempts_select_own" on public.exam_attempts;
create policy "exam_attempts_select_own"
  on public.exam_attempts for select to authenticated
  using (user_id = auth.uid());

-- The exam's course teacher reads attempts (grading / pass check).
drop policy if exists "exam_attempts_select_teacher" on public.exam_attempts;
create policy "exam_attempts_select_teacher"
  on public.exam_attempts for select to authenticated
  using (exists (
    select 1 from public.competency_exams e
    where e.id = exam_id
      and (e.course_id is null
           or public.is_course_teacher(e.course_id))
  ));

-- A user records only their own attempt.
drop policy if exists "exam_attempts_insert_own" on public.exam_attempts;
create policy "exam_attempts_insert_own"
  on public.exam_attempts for insert to authenticated
  with check (user_id = auth.uid());

-- Admins can do everything.
drop policy if exists "exam_attempts_admin_all" on public.exam_attempts;
create policy "exam_attempts_admin_all"
  on public.exam_attempts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — quiz_questions
-- ---------------------------------------------------------------------------
-- Full rows (including correct_answer) are readable ONLY by the course
-- teacher. Students use public.get_quiz_questions() instead.
drop policy if exists "quiz_questions_select_teacher" on public.quiz_questions;
create policy "quiz_questions_select_teacher"
  on public.quiz_questions for select to authenticated
  using (exists (
    select 1
    from public.quizzes z
    join public.lessons l on l.id = z.lesson_id
    join public.modules m on m.id = l.module_id
    where z.id = quiz_id and public.is_course_teacher(m.course_id)
  ));

-- A teacher manages questions only in their own courses.
drop policy if exists "quiz_questions_insert_teacher" on public.quiz_questions;
create policy "quiz_questions_insert_teacher"
  on public.quiz_questions for insert to authenticated
  with check (exists (
    select 1
    from public.quizzes z
    join public.lessons l on l.id = z.lesson_id
    join public.modules m on m.id = l.module_id
    where z.id = quiz_id and public.is_course_teacher(m.course_id)
  ));

drop policy if exists "quiz_questions_update_teacher" on public.quiz_questions;
create policy "quiz_questions_update_teacher"
  on public.quiz_questions for update to authenticated
  using (exists (
    select 1
    from public.quizzes z
    join public.lessons l on l.id = z.lesson_id
    join public.modules m on m.id = l.module_id
    where z.id = quiz_id and public.is_course_teacher(m.course_id)
  ))
  with check (exists (
    select 1
    from public.quizzes z
    join public.lessons l on l.id = z.lesson_id
    join public.modules m on m.id = l.module_id
    where z.id = quiz_id and public.is_course_teacher(m.course_id)
  ));

drop policy if exists "quiz_questions_delete_teacher" on public.quiz_questions;
create policy "quiz_questions_delete_teacher"
  on public.quiz_questions for delete to authenticated
  using (exists (
    select 1
    from public.quizzes z
    join public.lessons l on l.id = z.lesson_id
    join public.modules m on m.id = l.module_id
    where z.id = quiz_id and public.is_course_teacher(m.course_id)
  ));

-- Admins can do everything.
drop policy if exists "quiz_questions_admin_all" on public.quiz_questions;
create policy "quiz_questions_admin_all"
  on public.quiz_questions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — discussion_reactions
-- ---------------------------------------------------------------------------
-- Anyone logged in can read reactions.
drop policy if exists "discussion_reactions_select_authenticated" on public.discussion_reactions;
create policy "discussion_reactions_select_authenticated"
  on public.discussion_reactions for select to authenticated using (true);

-- A user reacts only as themselves.
drop policy if exists "discussion_reactions_insert_own" on public.discussion_reactions;
create policy "discussion_reactions_insert_own"
  on public.discussion_reactions for insert to authenticated
  with check (user_id = auth.uid());

-- A user removes only their own reaction.
drop policy if exists "discussion_reactions_delete_own" on public.discussion_reactions;
create policy "discussion_reactions_delete_own"
  on public.discussion_reactions for delete to authenticated
  using (user_id = auth.uid());

-- Admins can do everything (moderation).
drop policy if exists "discussion_reactions_admin_all" on public.discussion_reactions;
create policy "discussion_reactions_admin_all"
  on public.discussion_reactions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — discussion_reports
-- ---------------------------------------------------------------------------
-- Anyone logged in can file a report as themselves.
drop policy if exists "discussion_reports_insert_own" on public.discussion_reports;
create policy "discussion_reports_insert_own"
  on public.discussion_reports for insert to authenticated
  with check (reporter_id = auth.uid());

-- Only admins read and resolve reports.
drop policy if exists "discussion_reports_admin_all" on public.discussion_reports;
create policy "discussion_reports_admin_all"
  on public.discussion_reports for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — rps
-- ---------------------------------------------------------------------------
-- Anyone logged in can read the RPS (read-only for mentors).
drop policy if exists "rps_select_authenticated" on public.rps;
create policy "rps_select_authenticated"
  on public.rps for select to authenticated using (true);

-- Only admins edit the RPS.
drop policy if exists "rps_admin_all" on public.rps;
create policy "rps_admin_all"
  on public.rps for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Seed: RPS Semester 1 (SVS-SEM1) — 20-week plan, 2 weeks per course,
-- weights Kuis 20 / Tugas 50 / Ujian 30, passing grade 70.
-- Idempotent: safe to re-run (ON CONFLICT DO NOTHING on code).
-- ---------------------------------------------------------------------------
insert into public.rps (code, title, description, weights, passing_grade, weeks)
values (
  'SVS-SEM1',
  'RPS Semester 1 — SINEVERSE',
  'Rencana Pembelajaran Semester 1: 10 course selama 20 minggu, 2 minggu per course. Nilai akhir = Kuis 20% + Tugas 50% + Ujian Akhir 30% (direnormalisasi bila ada komponen kosong). Lulus bila nilai akhir >= 70.',
  '{"kuis": 20, "tugas": 50, "ujian": 30}'::jsonb,
  70,
  '[
    {"week": 1, "course": "Dasar Sinematografi", "topic": "Pengenalan kamera dan bahasa visual"},
    {"week": 2, "course": "Dasar Sinematografi", "topic": "Komposisi dan pencahayaan"},
    {"week": 3, "course": "Penulisan Skenario", "topic": "Ide cerita dan struktur tiga babak"},
    {"week": 4, "course": "Penulisan Skenario", "topic": "Format naskah dan penulisan adegan"},
    {"week": 5, "course": "Pembuatan Storyboard", "topic": "Dari naskah ke panel gambar"},
    {"week": 6, "course": "Pembuatan Storyboard", "topic": "Shot, sudut kamera, dan transisi"},
    {"week": 7, "course": "Penyutradaraan", "topic": "Visi sutradara dan pengarahan pemain"},
    {"week": 8, "course": "Penyutradaraan", "topic": "Blocking dan kerja di lokasi syuting"},
    {"week": 9, "course": "Editing Film", "topic": "Merangkai gambar dan ritme cerita"},
    {"week": 10, "course": "Editing Film", "topic": "Transisi, tempo, dan penyelesaian edit"},
    {"week": 11, "course": "Tata Suara & Musik Film", "topic": "Merekam dan menata suara lapangan"},
    {"week": 12, "course": "Tata Suara & Musik Film", "topic": "Musik dan sound design untuk cerita"},
    {"week": 13, "course": "Film Dokumenter", "topic": "Riset, observasi, dan wawancara"},
    {"week": 14, "course": "Film Dokumenter", "topic": "Menyusun kisah nyata menjadi film"},
    {"week": 15, "course": "Mengenal Jobdesk Crew Film", "topic": "Peran dan tanggung jawab tiap kru"},
    {"week": 16, "course": "Mengenal Jobdesk Crew Film", "topic": "Kolaborasi kru dalam produksi"},
    {"week": 17, "course": "Produksi & Manajemen Film", "topic": "Jadwal, anggaran, dan logistik"},
    {"week": 18, "course": "Produksi & Manajemen Film", "topic": "Manajemen produksi sampai pasca-produksi"},
    {"week": 19, "course": "Akting untuk Kamera", "topic": "Ekspresi, blocking, dan konsistensi adegan"},
    {"week": 20, "course": "Akting untuk Kamera", "topic": "Ujian akhir dan refleksi semester"}
  ]'::jsonb
)
on conflict (code) do nothing;

-- ============================================================================
-- Done. Verify in the Supabase Dashboard:
--   * Table Editor shows the 11 new tables above.
--   * Table Editor -> rps shows 1 row (code SVS-SEM1).
--   * Authentication -> Policies shows RLS enabled with policies per table.
-- Next: 004_community_schools_clubs.sql
-- ============================================================================
