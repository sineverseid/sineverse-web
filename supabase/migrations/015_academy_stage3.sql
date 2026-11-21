-- SINEVERSE Academy Stage 3 — Quiz kind (pretest/posttest), assignment kind
-- (weekly / final practice), Live Class, and the grading-weight switch to the
-- master-prompt formula (Pretest 5 + Posttest 15 + Tugas mingguan 30 +
-- Tugas praktik akhir 40 + Diskusi 10).
-- Idempotent: add column if not exists / create table if not exists /
-- drop-create policies / plain update for the rps row.
-- Does NOT touch migration 014 tables (assignment_rubrics, rubric_criteria,
-- rubric_scores, submission_files).
-- RLS follows the patterns of 001/003/014 (is_admin, is_course_teacher,
-- is_course_participant).

-- ---------------------------------------------------------------------------
-- quizzes.kind: 'quiz' | 'pretest' | 'posttest' (default 'quiz').
-- Existing rows (plain quizzes) keep working as kind = 'quiz'.
-- ---------------------------------------------------------------------------
alter table public.quizzes
  add column if not exists kind text not null default 'quiz'
    check (kind in ('quiz', 'pretest', 'posttest'));

-- ---------------------------------------------------------------------------
-- assignments.kind: 'weekly' | 'final_practice' (default 'weekly').
-- Existing rows (weekly assignments) keep working as kind = 'weekly'.
-- ---------------------------------------------------------------------------
alter table public.assignments
  add column if not exists kind text not null default 'weekly'
    check (kind in ('weekly', 'final_practice'));

-- ---------------------------------------------------------------------------
-- live_classes: scheduled live sessions per course (schedule + join link
-- only — no video is built here). One row per session.
-- ---------------------------------------------------------------------------
create table if not exists public.live_classes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null,
  scheduled_at timestamptz,
  meet_url text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists live_classes_course_id_idx
  on public.live_classes (course_id);
create index if not exists live_classes_scheduled_at_idx
  on public.live_classes (scheduled_at);

alter table public.live_classes enable row level security;

-- Participants (enrolled), the course teacher, and admins can see a course's
-- live classes. Everyone else sees nothing.
drop policy if exists "live_classes_select_participant" on public.live_classes;
create policy "live_classes_select_participant"
  on public.live_classes for select to authenticated
  using (
    public.is_course_participant(course_id)
    or public.is_course_teacher(course_id)
    or public.is_admin()
  );

-- Only the course teacher or an admin can schedule / edit / cancel.
drop policy if exists "live_classes_write_teacher" on public.live_classes;
create policy "live_classes_write_teacher"
  on public.live_classes for all to authenticated
  using (
    public.is_course_teacher(course_id)
    or public.is_admin()
  )
  with check (
    public.is_course_teacher(course_id)
    or public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- Grading weights switch (Arif's decision, 21 Nov 23:18, option 1):
-- RPS SVS-SEM1 moves from Kuis 20 / Tugas 50 / Ujian 30 to the master-prompt
-- formula Pretest 5 / Posttest 15 / Tugas mingguan 30 / Tugas praktik
-- akhir 40 / Diskusi 10. The app reads the same numbers from the
-- GRADEBOOK_WEIGHTS constant in src/lib/brand.ts — the two must agree.
-- Idempotent: a plain update to the same values.
-- ---------------------------------------------------------------------------
update public.rps
set weights = '{"pretest": 5, "posttest": 15, "tugas_mingguan": 30, "tugas_akhir": 40, "diskusi": 10}'::jsonb
where code = 'SVS-SEM1';
