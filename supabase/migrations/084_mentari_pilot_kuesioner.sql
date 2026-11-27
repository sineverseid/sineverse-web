-- SINEVERSE migration 084 — Kuesioner pilot pola Mentari (Dasar Sinematografi).
--
-- Kuesioner = instrumen evaluasi mentor per pertemuan, mengikuti pola
-- penamaan + RLS tabel quizzes / quiz_attempts (migrasi 001).
--
-- Referensi (Arif, 28 Nov 2026, screenshot Mentari "Kuesioner Pertemuan 18"):
-- 10 PERNYATAAN dengan jawaban Ya/Tidak, tampil sebagai tabel NO | KUESIONER.
-- Bukan 5 pertanyaan scale/text. Kind pertanyaan hanya 'yes_no'.
-- Jawaban tersimpan sebagai peta {question_id: boolean} di responses.answers
-- (Ya = true, Tidak = false).
--
-- RLS: mentor pengampu BOLEH membaca responses (deviasi disengaja dari pola
-- quiz_attempts — kuesioner adalah instrumen evaluasi untuk dosen/mentor).
--
-- TIDAK diterapkan ke live sebelum Arif setuju (pilot staged).
-- ---------------------------------------------------------------------------

-- 1. Tabel questionnaires: satu kuesioner per lesson.
create table if not exists public.questionnaires (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  unique (lesson_id)
);

-- 2. Tabel questionnaire_questions: 10 pernyataan Ya/Tidak per kuesioner.
create table if not exists public.questionnaire_questions (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null references public.questionnaires (id) on delete cascade,
  kind text not null check (kind in ('yes_no')),
  question text not null,
  options jsonb,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

-- 3. Tabel questionnaire_responses: satu respons per siswa per kuesioner.
create table if not exists public.questionnaire_responses (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null references public.questionnaires (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  answers jsonb not null,
  submitted_at timestamptz not null default now(),
  unique (questionnaire_id, user_id)
);

create index if not exists questionnaire_questions_questionnaire_id_idx
  on public.questionnaire_questions (questionnaire_id);
create index if not exists questionnaire_responses_questionnaire_id_idx
  on public.questionnaire_responses (questionnaire_id);
create index if not exists questionnaire_responses_user_id_idx
  on public.questionnaire_responses (user_id);

alter table public.questionnaires enable row level security;
alter table public.questionnaire_questions enable row level security;
alter table public.questionnaire_responses enable row level security;

-- ---------------------------------------------------------------------------
-- Policies — questionnaires (cermin quizzes, migrasi 001)
-- ---------------------------------------------------------------------------
-- Semua pengguna login bisa membaca (konten lesson).
drop policy if exists "questionnaires_select_authenticated" on public.questionnaires;
create policy "questionnaires_select_authenticated"
  on public.questionnaires for select to authenticated using (true);

-- Mentor mengelola kuesioner hanya di course-nya sendiri.
drop policy if exists "questionnaires_insert_mentor" on public.questionnaires;
create policy "questionnaires_insert_mentor"
  on public.questionnaires for insert to authenticated
  with check (exists (
    select 1
    from public.lessons l
    join public.modules m on m.id = l.module_id
    join public.courses c on c.id = m.course_id
    where l.id = lesson_id and c.mentor_id = auth.uid()
  ));

drop policy if exists "questionnaires_update_mentor" on public.questionnaires;
create policy "questionnaires_update_mentor"
  on public.questionnaires for update to authenticated
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

drop policy if exists "questionnaires_delete_mentor" on public.questionnaires;
create policy "questionnaires_delete_mentor"
  on public.questionnaires for delete to authenticated
  using (exists (
    select 1
    from public.lessons l
    join public.modules m on m.id = l.module_id
    join public.courses c on c.id = m.course_id
    where l.id = lesson_id and c.mentor_id = auth.uid()
  ));

-- Admin bisa melakukan semuanya.
drop policy if exists "questionnaires_admin_all" on public.questionnaires;
create policy "questionnaires_admin_all"
  on public.questionnaires for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — questionnaire_questions (cermin quizzes: select terbuka,
-- tulis mentor course + admin). Tidak ada correct_answer yang dilindungi,
-- jadi select tidak dibatasi ke guru saja seperti quiz_questions.
-- ---------------------------------------------------------------------------
drop policy if exists "questionnaire_questions_select_authenticated" on public.questionnaire_questions;
create policy "questionnaire_questions_select_authenticated"
  on public.questionnaire_questions for select to authenticated using (true);

drop policy if exists "questionnaire_questions_insert_mentor" on public.questionnaire_questions;
create policy "questionnaire_questions_insert_mentor"
  on public.questionnaire_questions for insert to authenticated
  with check (exists (
    select 1
    from public.questionnaires q
    join public.lessons l on l.id = q.lesson_id
    join public.modules m on m.id = l.module_id
    join public.courses c on c.id = m.course_id
    where q.id = questionnaire_id and c.mentor_id = auth.uid()
  ));

drop policy if exists "questionnaire_questions_update_mentor" on public.questionnaire_questions;
create policy "questionnaire_questions_update_mentor"
  on public.questionnaire_questions for update to authenticated
  using (exists (
    select 1
    from public.questionnaires q
    join public.lessons l on l.id = q.lesson_id
    join public.modules m on m.id = l.module_id
    join public.courses c on c.id = m.course_id
    where q.id = questionnaire_id and c.mentor_id = auth.uid()
  ))
  with check (exists (
    select 1
    from public.questionnaires q
    join public.lessons l on l.id = q.lesson_id
    join public.modules m on m.id = l.module_id
    join public.courses c on c.id = m.course_id
    where q.id = questionnaire_id and c.mentor_id = auth.uid()
  ));

drop policy if exists "questionnaire_questions_delete_mentor" on public.questionnaire_questions;
create policy "questionnaire_questions_delete_mentor"
  on public.questionnaire_questions for delete to authenticated
  using (exists (
    select 1
    from public.questionnaires q
    join public.lessons l on l.id = q.lesson_id
    join public.modules m on m.id = l.module_id
    join public.courses c on c.id = m.course_id
    where q.id = questionnaire_id and c.mentor_id = auth.uid()
  ));

drop policy if exists "questionnaire_questions_admin_all" on public.questionnaire_questions;
create policy "questionnaire_questions_admin_all"
  on public.questionnaire_questions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — questionnaire_responses
-- Penyimpangan disengaja dari pola quiz_attempts (select own saja): mentor
-- pengampu BOLEH membaca responses, karena kuesioner adalah instrumen
-- evaluasi perkuliahan untuk dosen/mentor.
-- ---------------------------------------------------------------------------
-- Siswa membaca responsnya sendiri; mentor pengampu membaca semua respons
-- kuesioner di course-nya.
drop policy if exists "questionnaire_responses_select_own_mentor" on public.questionnaire_responses;
create policy "questionnaire_responses_select_own_mentor"
  on public.questionnaire_responses for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.questionnaires q
      join public.lessons l on l.id = q.lesson_id
      join public.modules m on m.id = l.module_id
      join public.courses c on c.id = m.course_id
      where q.id = questionnaire_id and c.mentor_id = auth.uid()
    )
  );

-- Siswa hanya mengisi untuk dirinya sendiri, satu kali (unique constraint).
drop policy if exists "questionnaire_responses_insert_own" on public.questionnaire_responses;
create policy "questionnaire_responses_insert_own"
  on public.questionnaire_responses for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "questionnaire_responses_admin_all" on public.questionnaire_responses;
create policy "questionnaire_responses_admin_all"
  on public.questionnaire_responses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Verifikasi (SQL Editor, JANGAN jalankan blok ini sebagai bagian migrasi):
--   select count(*) from information_schema.tables
--     where table_schema = 'public'
--     and table_name in ('questionnaires','questionnaire_questions','questionnaire_responses'); -- 3
--   select policyname from pg_policies where tablename like 'questionnaire%'; -- 13 baris
-- Rollback:
--   drop table if exists public.questionnaire_responses;
--   drop table if exists public.questionnaire_questions;
--   drop table if exists public.questionnaires;
-- ---------------------------------------------------------------------------
