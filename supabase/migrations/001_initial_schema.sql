-- ============================================================================
-- SINEVERSE — Initial database schema (migration 001)
-- Project: sineverse (Supabase, Singapore)
-- App: Expo / React Native (~/workspace/sineverse-app)
--
-- How to apply:
--   Supabase Dashboard -> SQL Editor -> paste this file -> Run.
--   (Or: supabase db push, if the Supabase CLI is linked to the project.)
--
-- Notes:
--   * gen_random_uuid() is built into PostgreSQL 13+ (Supabase runs PG 15),
--     so no extension is needed.
--   * Row Level Security (RLS) is enabled on every table. The app uses the
--     publishable (anon) key, so RLS is what stands between a user and
--     another user's data. The service_role key bypasses RLS by design and
--     must never ship in the app.
--   * Seed data uses fixed UUIDs so the app can reference the 10 Semester 1
--     courses deterministically. Seed inserts are idempotent
--     (ON CONFLICT DO NOTHING). Tables, indexes, and policies are also
--     written to be safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS).
--   * No secrets, passwords, or service_role keys are in this file.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text,
  role text not null default 'siswa'
    check (role in ('siswa', 'mentor', 'admin')),
  photo_url text,
  phone text,
  city text,
  created_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text,
  level text,
  mentor_id uuid references public.profiles (id) on delete set null,
  cover_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules (id) on delete cascade,
  title text not null,
  order_index int not null default 0,
  video_url text,
  content text,
  created_at timestamptz not null default now()
);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  unique (user_id, course_id)
);

create table if not exists public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  status text not null default 'completed'
    check (status in ('not_started', 'in_progress', 'completed')),
  completed_at timestamptz,
  unique (user_id, lesson_id)
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  title text not null,
  description text,
  max_score int not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text,
  file_url text,
  score int,
  feedback text,
  submitted_at timestamptz not null default now(),
  graded_at timestamptz
);

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  title text not null,
  passing_score int not null default 70,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  score int,
  answers jsonb,
  attempted_at timestamptz not null default now()
);

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  type text not null check (type in ('course', 'exam', 'work')),
  serial text not null unique,
  score int,
  issued_at timestamptz not null default now()
);

create table if not exists public.discussions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.discussions (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper: is the current user an admin?
-- SECURITY DEFINER so it can read public.profiles even when RLS would
-- otherwise block the row. Read-only, no parameters, no side effects.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Indexes on foreign keys (keeps joins and RLS subqueries fast)
-- ---------------------------------------------------------------------------
create index if not exists courses_mentor_id_idx
  on public.courses (mentor_id);
create index if not exists modules_course_id_idx
  on public.modules (course_id);
create index if not exists lessons_module_id_idx
  on public.lessons (module_id);
create index if not exists enrollments_user_id_idx
  on public.enrollments (user_id);
create index if not exists enrollments_course_id_idx
  on public.enrollments (course_id);
create index if not exists lesson_progress_user_id_idx
  on public.lesson_progress (user_id);
create index if not exists lesson_progress_lesson_id_idx
  on public.lesson_progress (lesson_id);
create index if not exists assignments_lesson_id_idx
  on public.assignments (lesson_id);
create index if not exists submissions_assignment_id_idx
  on public.submissions (assignment_id);
create index if not exists submissions_user_id_idx
  on public.submissions (user_id);
create index if not exists quizzes_lesson_id_idx
  on public.quizzes (lesson_id);
create index if not exists quiz_attempts_quiz_id_idx
  on public.quiz_attempts (quiz_id);
create index if not exists quiz_attempts_user_id_idx
  on public.quiz_attempts (user_id);
create index if not exists certificates_user_id_idx
  on public.certificates (user_id);
create index if not exists certificates_course_id_idx
  on public.certificates (course_id);
create index if not exists discussions_lesson_id_idx
  on public.discussions (lesson_id);
create index if not exists discussions_user_id_idx
  on public.discussions (user_id);
create index if not exists discussions_parent_id_idx
  on public.discussions (parent_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — on for every table
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.modules enable row level security;
alter table public.lessons enable row level security;
alter table public.enrollments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.certificates enable row level security;
alter table public.discussions enable row level security;

-- ---------------------------------------------------------------------------
-- Policies — profiles
-- ---------------------------------------------------------------------------
-- Anyone logged in can read profiles (mentor directory, discussion authors).
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select to authenticated using (true);

-- A user creates their own row after signing up.
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

-- A user edits only their own row.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Admins can do everything.
drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all"
  on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — courses
-- ---------------------------------------------------------------------------
-- Anyone logged in can read the catalog.
drop policy if exists "courses_select_authenticated" on public.courses;
create policy "courses_select_authenticated"
  on public.courses for select to authenticated using (true);

-- A mentor creates a course only as themselves.
drop policy if exists "courses_insert_mentor" on public.courses;
create policy "courses_insert_mentor"
  on public.courses for insert to authenticated
  with check (mentor_id = auth.uid());

-- A mentor edits only their own courses.
drop policy if exists "courses_update_mentor" on public.courses;
create policy "courses_update_mentor"
  on public.courses for update to authenticated
  using (mentor_id = auth.uid()) with check (mentor_id = auth.uid());

-- A mentor deletes only their own courses.
drop policy if exists "courses_delete_mentor" on public.courses;
create policy "courses_delete_mentor"
  on public.courses for delete to authenticated
  using (mentor_id = auth.uid());

-- Admins can do everything.
drop policy if exists "courses_admin_all" on public.courses;
create policy "courses_admin_all"
  on public.courses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — modules
-- ---------------------------------------------------------------------------
-- Anyone logged in can read.
drop policy if exists "modules_select_authenticated" on public.modules;
create policy "modules_select_authenticated"
  on public.modules for select to authenticated using (true);

-- A mentor manages modules only in their own courses.
drop policy if exists "modules_insert_mentor" on public.modules;
create policy "modules_insert_mentor"
  on public.modules for insert to authenticated
  with check (exists (
    select 1 from public.courses
    where id = course_id and mentor_id = auth.uid()
  ));

drop policy if exists "modules_update_mentor" on public.modules;
create policy "modules_update_mentor"
  on public.modules for update to authenticated
  using (exists (
    select 1 from public.courses
    where id = course_id and mentor_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.courses
    where id = course_id and mentor_id = auth.uid()
  ));

drop policy if exists "modules_delete_mentor" on public.modules;
create policy "modules_delete_mentor"
  on public.modules for delete to authenticated
  using (exists (
    select 1 from public.courses
    where id = course_id and mentor_id = auth.uid()
  ));

-- Admins can do everything.
drop policy if exists "modules_admin_all" on public.modules;
create policy "modules_admin_all"
  on public.modules for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — lessons
-- ---------------------------------------------------------------------------
-- Anyone logged in can read.
drop policy if exists "lessons_select_authenticated" on public.lessons;
create policy "lessons_select_authenticated"
  on public.lessons for select to authenticated using (true);

-- A mentor manages lessons only in their own courses.
drop policy if exists "lessons_insert_mentor" on public.lessons;
create policy "lessons_insert_mentor"
  on public.lessons for insert to authenticated
  with check (exists (
    select 1
    from public.modules m
    join public.courses c on c.id = m.course_id
    where m.id = module_id and c.mentor_id = auth.uid()
  ));

drop policy if exists "lessons_update_mentor" on public.lessons;
create policy "lessons_update_mentor"
  on public.lessons for update to authenticated
  using (exists (
    select 1
    from public.modules m
    join public.courses c on c.id = m.course_id
    where m.id = module_id and c.mentor_id = auth.uid()
  ))
  with check (exists (
    select 1
    from public.modules m
    join public.courses c on c.id = m.course_id
    where m.id = module_id and c.mentor_id = auth.uid()
  ));

drop policy if exists "lessons_delete_mentor" on public.lessons;
create policy "lessons_delete_mentor"
  on public.lessons for delete to authenticated
  using (exists (
    select 1
    from public.modules m
    join public.courses c on c.id = m.course_id
    where m.id = module_id and c.mentor_id = auth.uid()
  ));

-- Admins can do everything.
drop policy if exists "lessons_admin_all" on public.lessons;
create policy "lessons_admin_all"
  on public.lessons for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — enrollments
-- ---------------------------------------------------------------------------
-- A user sees only their own enrollments.
drop policy if exists "enrollments_select_own" on public.enrollments;
create policy "enrollments_select_own"
  on public.enrollments for select to authenticated
  using (user_id = auth.uid());

-- A user enrolls only themselves.
drop policy if exists "enrollments_insert_own" on public.enrollments;
create policy "enrollments_insert_own"
  on public.enrollments for insert to authenticated
  with check (user_id = auth.uid());

-- Admins can do everything.
drop policy if exists "enrollments_admin_all" on public.enrollments;
create policy "enrollments_admin_all"
  on public.enrollments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — lesson_progress
-- ---------------------------------------------------------------------------
-- A user sees only their own progress.
drop policy if exists "lesson_progress_select_own" on public.lesson_progress;
create policy "lesson_progress_select_own"
  on public.lesson_progress for select to authenticated
  using (user_id = auth.uid());

-- A user records only their own progress.
drop policy if exists "lesson_progress_insert_own" on public.lesson_progress;
create policy "lesson_progress_insert_own"
  on public.lesson_progress for insert to authenticated
  with check (user_id = auth.uid());

-- A user updates only their own progress.
drop policy if exists "lesson_progress_update_own" on public.lesson_progress;
create policy "lesson_progress_update_own"
  on public.lesson_progress for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Admins can do everything.
drop policy if exists "lesson_progress_admin_all" on public.lesson_progress;
create policy "lesson_progress_admin_all"
  on public.lesson_progress for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — assignments
-- ---------------------------------------------------------------------------
-- Anyone logged in can read (lesson content).
drop policy if exists "assignments_select_authenticated" on public.assignments;
create policy "assignments_select_authenticated"
  on public.assignments for select to authenticated using (true);

-- A mentor manages assignments only in their own courses.
drop policy if exists "assignments_insert_mentor" on public.assignments;
create policy "assignments_insert_mentor"
  on public.assignments for insert to authenticated
  with check (exists (
    select 1
    from public.lessons l
    join public.modules m on m.id = l.module_id
    join public.courses c on c.id = m.course_id
    where l.id = lesson_id and c.mentor_id = auth.uid()
  ));

drop policy if exists "assignments_update_mentor" on public.assignments;
create policy "assignments_update_mentor"
  on public.assignments for update to authenticated
  using (exists (
    select 1
    from public.lessons l
    join public.modules m on m.id = l.module_id
    join public.courses c on c.id = m.course_id
    where l.id = lesson_id and c.mentor_id = auth.uid()
  ))
  with check (exists (
    select 1
    from public.lessons l
    join public.modules m on m.id = l.module_id
    join public.courses c on c.id = m.course_id
    where l.id = lesson_id and c.mentor_id = auth.uid()
  ));

drop policy if exists "assignments_delete_mentor" on public.assignments;
create policy "assignments_delete_mentor"
  on public.assignments for delete to authenticated
  using (exists (
    select 1
    from public.lessons l
    join public.modules m on m.id = l.module_id
    join public.courses c on c.id = m.course_id
    where l.id = lesson_id and c.mentor_id = auth.uid()
  ));

-- Admins can do everything.
drop policy if exists "assignments_admin_all" on public.assignments;
create policy "assignments_admin_all"
  on public.assignments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — submissions
-- ---------------------------------------------------------------------------
-- A user reads only their own submissions.
drop policy if exists "submissions_select_own" on public.submissions;
create policy "submissions_select_own"
  on public.submissions for select to authenticated
  using (user_id = auth.uid());

-- The course mentor reads submissions to grade them.
drop policy if exists "submissions_select_mentor" on public.submissions;
create policy "submissions_select_mentor"
  on public.submissions for select to authenticated
  using (exists (
    select 1
    from public.assignments a
    join public.lessons l on l.id = a.lesson_id
    join public.modules m on m.id = l.module_id
    join public.courses c on c.id = m.course_id
    where a.id = assignment_id and c.mentor_id = auth.uid()
  ));

-- A user submits only as themselves.
-- (Resubmission inserts a new row — that is the version history.)
drop policy if exists "submissions_insert_own" on public.submissions;
create policy "submissions_insert_own"
  on public.submissions for insert to authenticated
  with check (user_id = auth.uid());

-- The course mentor grades (score / feedback / graded_at).
drop policy if exists "submissions_update_mentor" on public.submissions;
create policy "submissions_update_mentor"
  on public.submissions for update to authenticated
  using (exists (
    select 1
    from public.assignments a
    join public.lessons l on l.id = a.lesson_id
    join public.modules m on m.id = l.module_id
    join public.courses c on c.id = m.course_id
    where a.id = assignment_id and c.mentor_id = auth.uid()
  ))
  with check (exists (
    select 1
    from public.assignments a
    join public.lessons l on l.id = a.lesson_id
    join public.modules m on m.id = l.module_id
    join public.courses c on c.id = m.course_id
    where a.id = assignment_id and c.mentor_id = auth.uid()
  ));

-- Admins can do everything.
drop policy if exists "submissions_admin_all" on public.submissions;
create policy "submissions_admin_all"
  on public.submissions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — quizzes
-- ---------------------------------------------------------------------------
-- Anyone logged in can read (lesson content).
drop policy if exists "quizzes_select_authenticated" on public.quizzes;
create policy "quizzes_select_authenticated"
  on public.quizzes for select to authenticated using (true);

-- A mentor manages quizzes only in their own courses.
drop policy if exists "quizzes_insert_mentor" on public.quizzes;
create policy "quizzes_insert_mentor"
  on public.quizzes for insert to authenticated
  with check (exists (
    select 1
    from public.lessons l
    join public.modules m on m.id = l.module_id
    join public.courses c on c.id = m.course_id
    where l.id = lesson_id and c.mentor_id = auth.uid()
  ));

drop policy if exists "quizzes_update_mentor" on public.quizzes;
create policy "quizzes_update_mentor"
  on public.quizzes for update to authenticated
  using (exists (
    select 1
    from public.lessons l
    join public.modules m on m.id = l.module_id
    join public.courses c on c.id = m.course_id
    where l.id = lesson_id and c.mentor_id = auth.uid()
  ))
  with check (exists (
    select 1
    from public.lessons l
    join public.modules m on m.id = l.module_id
    join public.courses c on c.id = m.course_id
    where l.id = lesson_id and c.mentor_id = auth.uid()
  ));

drop policy if exists "quizzes_delete_mentor" on public.quizzes;
create policy "quizzes_delete_mentor"
  on public.quizzes for delete to authenticated
  using (exists (
    select 1
    from public.lessons l
    join public.modules m on m.id = l.module_id
    join public.courses c on c.id = m.course_id
    where l.id = lesson_id and c.mentor_id = auth.uid()
  ));

-- Admins can do everything.
drop policy if exists "quizzes_admin_all" on public.quizzes;
create policy "quizzes_admin_all"
  on public.quizzes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — quiz_attempts
-- ---------------------------------------------------------------------------
-- A user sees only their own attempts.
drop policy if exists "quiz_attempts_select_own" on public.quiz_attempts;
create policy "quiz_attempts_select_own"
  on public.quiz_attempts for select to authenticated
  using (user_id = auth.uid());

-- A user records only their own attempt.
drop policy if exists "quiz_attempts_insert_own" on public.quiz_attempts;
create policy "quiz_attempts_insert_own"
  on public.quiz_attempts for insert to authenticated
  with check (user_id = auth.uid());

-- Admins can do everything.
drop policy if exists "quiz_attempts_admin_all" on public.quiz_attempts;
create policy "quiz_attempts_admin_all"
  on public.quiz_attempts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — certificates
-- ---------------------------------------------------------------------------
-- A user sees only their own certificates.
drop policy if exists "certificates_select_own" on public.certificates;
create policy "certificates_select_own"
  on public.certificates for select to authenticated
  using (user_id = auth.uid());

-- Issued by the app on the user's behalf after they pass.
-- (The app inserts the row as the logged-in user; the serial is unique.)
drop policy if exists "certificates_insert_own" on public.certificates;
create policy "certificates_insert_own"
  on public.certificates for insert to authenticated
  with check (user_id = auth.uid());

-- Admins can do everything.
drop policy if exists "certificates_admin_all" on public.certificates;
create policy "certificates_admin_all"
  on public.certificates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — discussions
-- ---------------------------------------------------------------------------
-- Anyone logged in can read the lesson discussion.
drop policy if exists "discussions_select_authenticated" on public.discussions;
create policy "discussions_select_authenticated"
  on public.discussions for select to authenticated using (true);

-- A user posts only as themselves.
drop policy if exists "discussions_insert_own" on public.discussions;
create policy "discussions_insert_own"
  on public.discussions for insert to authenticated
  with check (user_id = auth.uid());

-- A user edits only their own posts.
drop policy if exists "discussions_update_own" on public.discussions;
create policy "discussions_update_own"
  on public.discussions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- A user deletes only their own posts.
drop policy if exists "discussions_delete_own" on public.discussions;
create policy "discussions_delete_own"
  on public.discussions for delete to authenticated
  using (user_id = auth.uid());

-- Admins can do everything (moderation).
drop policy if exists "discussions_admin_all" on public.discussions;
create policy "discussions_admin_all"
  on public.discussions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Seed: Semester 1 courses (RPS SVS-SEM1, 20 weeks, 10 courses)
-- Fixed UUIDs so the app can reference these courses deterministically.
-- Idempotent: safe to re-run (ON CONFLICT DO NOTHING).
-- ---------------------------------------------------------------------------
insert into public.courses (id, title, description, category, level, mentor_id, cover_url)
values
  ('10000000-0000-4000-8000-000000000001', 'Dasar Sinematografi', 'Pengenalan kamera, komposisi, pencahayaan, dan bahasa visual film.', 'Perfilman', 'Pemula', null, null),
  ('10000000-0000-4000-8000-000000000002', 'Penulisan Skenario', 'Belajar menulis cerita, struktur tiga babak, dan format naskah film.', 'Perfilman', 'Pemula', null, null),
  ('10000000-0000-4000-8000-000000000003', 'Pembuatan Storyboard', 'Mengubah naskah menjadi gambar panel demi panel sebagai panduan syuting.', 'Perfilman', 'Pemula', null, null),
  ('10000000-0000-4000-8000-000000000004', 'Penyutradaraan', 'Memimpin proses kreatif: mengarahkan pemain, kamera, dan kru di lokasi syuting.', 'Perfilman', 'Pemula', null, null),
  ('10000000-0000-4000-8000-000000000005', 'Editing Film', 'Merangkai gambar dan suara menjadi cerita yang utuh dengan ritme yang tepat.', 'Perfilman', 'Pemula', null, null),
  ('10000000-0000-4000-8000-000000000006', 'Tata Suara & Musik Film', 'Merekam, menata, dan memilih suara serta musik untuk memperkuat cerita.', 'Perfilman', 'Pemula', null, null),
  ('10000000-0000-4000-8000-000000000007', 'Film Dokumenter', 'Menceritakan kisah nyata: riset, observasi, dan wawancara di lapangan.', 'Perfilman', 'Pemula', null, null),
  ('10000000-0000-4000-8000-000000000008', 'Mengenal Jobdesk Crew Film', 'Mengenal peran dan tanggung jawab setiap kru dalam produksi film.', 'Perfilman', 'Pemula', null, null),
  ('10000000-0000-4000-8000-000000000009', 'Produksi & Manajemen Film', 'Merencanakan jadwal, anggaran, dan logistik produksi film dari awal sampai akhir.', 'Perfilman', 'Pemula', null, null),
  ('10000000-0000-4000-8000-00000000000a', 'Akting untuk Kamera', 'Teknik akting di depan kamera: ekspresi, blocking, dan konsistensi adegan.', 'Perfilman', 'Pemula', null, null)
on conflict (id) do nothing;

-- One orientation module per course.
insert into public.modules (id, course_id, title, order_index)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Orientasi', 0),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Orientasi', 0),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'Orientasi', 0),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'Orientasi', 0),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', 'Orientasi', 0),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000006', 'Orientasi', 0),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000007', 'Orientasi', 0),
  ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000008', 'Orientasi', 0),
  ('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000009', 'Orientasi', 0),
  ('20000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000a', 'Orientasi', 0)
on conflict (id) do nothing;

-- One welcome lesson per orientation module.
insert into public.lessons (id, module_id, title, order_index, video_url, content)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Selamat Datang di SINEVERSE', 0, null, 'Selamat datang di SINEVERSE! Di pelajaran ini kamu akan mengenal cara belajar di platform, melihat isi course, dan memulai perjalanan filmmaking-mu.'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Selamat Datang di SINEVERSE', 0, null, 'Selamat datang di SINEVERSE! Di pelajaran ini kamu akan mengenal cara belajar di platform, melihat isi course, dan memulai perjalanan filmmaking-mu.'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'Selamat Datang di SINEVERSE', 0, null, 'Selamat datang di SINEVERSE! Di pelajaran ini kamu akan mengenal cara belajar di platform, melihat isi course, dan memulai perjalanan filmmaking-mu.'),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', 'Selamat Datang di SINEVERSE', 0, null, 'Selamat datang di SINEVERSE! Di pelajaran ini kamu akan mengenal cara belajar di platform, melihat isi course, dan memulai perjalanan filmmaking-mu.'),
  ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', 'Selamat Datang di SINEVERSE', 0, null, 'Selamat datang di SINEVERSE! Di pelajaran ini kamu akan mengenal cara belajar di platform, melihat isi course, dan memulai perjalanan filmmaking-mu.'),
  ('30000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000006', 'Selamat Datang di SINEVERSE', 0, null, 'Selamat datang di SINEVERSE! Di pelajaran ini kamu akan mengenal cara belajar di platform, melihat isi course, dan memulai perjalanan filmmaking-mu.'),
  ('30000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000007', 'Selamat Datang di SINEVERSE', 0, null, 'Selamat datang di SINEVERSE! Di pelajaran ini kamu akan mengenal cara belajar di platform, melihat isi course, dan memulai perjalanan filmmaking-mu.'),
  ('30000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000008', 'Selamat Datang di SINEVERSE', 0, null, 'Selamat datang di SINEVERSE! Di pelajaran ini kamu akan mengenal cara belajar di platform, melihat isi course, dan memulai perjalanan filmmaking-mu.'),
  ('30000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000009', 'Selamat Datang di SINEVERSE', 0, null, 'Selamat datang di SINEVERSE! Di pelajaran ini kamu akan mengenal cara belajar di platform, melihat isi course, dan memulai perjalanan filmmaking-mu.'),
  ('30000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-00000000000a', 'Selamat Datang di SINEVERSE', 0, null, 'Selamat datang di SINEVERSE! Di pelajaran ini kamu akan mengenal cara belajar di platform, melihat isi course, dan memulai perjalanan filmmaking-mu.')
on conflict (id) do nothing;

-- ============================================================================
-- Done. Verify in the Supabase Dashboard:
--   * Table Editor shows the 12 tables above.
--   * Authentication -> Policies shows RLS enabled with policies per table.
--   * Table Editor -> courses shows the 10 Semester 1 courses.
-- Next steps (not in this file):
--   * Storage bucket for profile photos and submission files (if needed).
--   * App-side: after a user signs up, insert their row into public.profiles
--     with id = the auth user id (the profiles_insert_own policy allows it).
-- ============================================================================
