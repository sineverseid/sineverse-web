-- ============================================================================
-- SINEVERSE — Migration 009: server-side quiz/exam scoring + assignment
-- deadline/rubric columns (added by the web build, Fase B).
--
-- Why this file exists: migration 003 ships get_quiz_questions() (which
-- deliberately omits correct_answer so it never reaches a student client)
-- but no scoring RPC — so a student client could not auto-score without
-- leaking the answers. These security-definer RPCs score on the server:
--   * submit_quiz_attempt(p_quiz_id, p_answers jsonb) -> int (score 0–100)
--   * submit_exam_attempt(p_exam_id, p_answers jsonb)
--     -> table(score int, passed boolean, certificate_serial text)
--     On pass it also inserts the certificates row (type 'exam',
--     serial SVS-EXM-YYYY-NNNN) — the app inserts certificates as the
--     logged-in user, so the RPC runs as the caller for that insert and
--     therefore requires the exam to be linked to a course: certificates
--     .course_id is NOT NULL in 001. An exam without a course_id cannot
--     issue a certificate; the RPC raises a clear exception instead of
--     inventing a course.
--   * exam_questions mirrors quiz_questions (003 has no exam-question
--     table at all, so a competency exam could not be taken). Students
--     read them only via get_exam_questions(), which omits correct_answer.
--   * assignments gains due_date + rubric (text); submissions gains
--     is_draft / version / is_late. Resubmission inserts a new row with
--     version = previous max + 1 (the version history).
--   * quizzes gains max_attempts (003 only gives it to competency_exams).
--
-- Apply after 003–008, same way (Dashboard -> SQL Editor -> Run).
-- Idempotent: CREATE TABLE / ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE.
-- No secrets, no service_role key.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Assignment columns (deadline + rubric)
-- ---------------------------------------------------------------------------
alter table public.assignments
  add column if not exists due_date timestamptz;
alter table public.assignments
  add column if not exists rubric text;

alter table public.submissions
  add column if not exists is_draft boolean not null default false;
alter table public.submissions
  add column if not exists version int not null default 1;
alter table public.submissions
  add column if not exists is_late boolean not null default false;

alter table public.quizzes
  add column if not exists max_attempts int;

-- ---------------------------------------------------------------------------
-- Exam questions (same shape as quiz_questions, linked to competency_exams)
-- ---------------------------------------------------------------------------
create table if not exists public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.competency_exams (id) on delete cascade,
  kind text not null check (kind in ('mc', 'true_false', 'short')),
  question text not null,
  options jsonb,
  correct_answer text,
  explanation text,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists exam_questions_exam_id_idx
  on public.exam_questions (exam_id);

alter table public.exam_questions enable row level security;

-- Full-row reads only for the exam's course teacher / admin (mirrors
-- quiz_questions in 003); students use get_exam_questions() below.
drop policy if exists "exam_questions_select_teacher" on public.exam_questions;
create policy "exam_questions_select_teacher"
  on public.exam_questions for select to authenticated
  using (
    exists (
      select 1 from public.competency_exams e
      where e.id = exam_questions.exam_id
        and (e.created_by = auth.uid() or public.is_course_teacher(e.course_id))
    )
    or public.is_admin()
  );

drop policy if exists "exam_questions_write_teacher" on public.exam_questions;
create policy "exam_questions_write_teacher"
  on public.exam_questions for all to authenticated
  using (
    exists (
      select 1 from public.competency_exams e
      where e.id = exam_questions.exam_id
        and (e.created_by = auth.uid() or public.is_course_teacher(e.course_id))
    )
    or public.is_admin()
  )
  with check (
    exists (
      select 1 from public.competency_exams e
      where e.id = exam_questions.exam_id
        and (e.created_by = auth.uid() or public.is_course_teacher(e.course_id))
    )
    or public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- get_exam_questions(): student-safe read (no correct_answer)
-- ---------------------------------------------------------------------------
create or replace function public.get_exam_questions(p_exam_id uuid)
returns table (
  id uuid,
  exam_id uuid,
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
  select q.id, q.exam_id, q.kind, q.question, q.options,
         q.explanation, q.order_index, q.created_at
  from public.exam_questions q
  where q.exam_id = p_exam_id
  order by q.order_index, q.created_at;
$$;

grant execute on function public.get_exam_questions(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- submit_quiz_attempt(): score server-side, record the attempt.
-- p_answers: {"<question_id>": "<answer>"} — short answers are scored
-- case-insensitive exact match; mc / true_false exact match.
-- Returns the score 0–100 (null when the quiz has no questions).
-- Enforces quizzes.max_attempts when set (counts prior attempts).
-- ---------------------------------------------------------------------------
create or replace function public.submit_quiz_attempt(p_quiz_id uuid, p_answers jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max int;
  v_count int;
  v_total int;
  v_correct int;
  v_score int;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  select max_attempts into v_max from public.quizzes where id = p_quiz_id;
  if v_max is not null then
    select count(*) into v_count
    from public.quiz_attempts where quiz_id = p_quiz_id and user_id = auth.uid();
    if v_count >= v_max then
      raise exception 'batas percobaan kuis sudah tercapai';
    end if;
  end if;
  select count(*) into v_total from public.quiz_questions where quiz_id = p_quiz_id;
  if v_total = 0 then
    insert into public.quiz_attempts (quiz_id, user_id, score, answers)
    values (p_quiz_id, auth.uid(), null, p_answers);
    return null;
  end if;
  select count(*) into v_correct
  from public.quiz_questions q
  where q.quiz_id = p_quiz_id
    and (
      (q.kind in ('mc', 'true_false') and q.correct_answer = (p_answers ->> q.id::text))
      or (q.kind = 'short' and lower(btrim(q.correct_answer)) = lower(btrim(p_answers ->> q.id::text)))
    );
  v_score := round(v_correct::numeric * 100 / v_total);
  insert into public.quiz_attempts (quiz_id, user_id, score, answers)
  values (p_quiz_id, auth.uid(), v_score, p_answers);
  return v_score;
end;
$$;

grant execute on function public.submit_quiz_attempt(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- submit_exam_attempt(): score server-side, record the attempt, and on pass
-- issue the exam certificate (type 'exam', SVS-EXM-YYYY-NNNN).
-- Returns (score, passed, certificate_serial) — serial is null when the
-- exam was not passed. Raises when max_attempts is exceeded, or when the
-- exam passed but has no course_id (certificates.course_id is NOT NULL).
-- ---------------------------------------------------------------------------
create or replace function public.submit_exam_attempt(p_exam_id uuid, p_answers jsonb)
returns table (score int, passed boolean, certificate_serial text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam record;
  v_count int;
  v_total int;
  v_correct int;
  v_score int;
  v_passed boolean;
  v_serial text;
  v_seq int;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  select * into v_exam from public.competency_exams where id = p_exam_id;
  if v_exam.id is null then
    raise exception 'ujian tidak ditemukan';
  end if;
  if v_exam.max_attempts is not null then
    select count(*) into v_count
    from public.exam_attempts where exam_id = p_exam_id and user_id = auth.uid();
    if v_count >= v_exam.max_attempts then
      raise exception 'batas percobaan ujian sudah tercapai';
    end if;
  end if;
  select count(*) into v_total from public.exam_questions where exam_id = p_exam_id;
  if v_total = 0 then
    insert into public.exam_attempts (exam_id, user_id, score, answers, passed)
    values (p_exam_id, auth.uid(), null, p_answers, null);
    return query select null::int, null::boolean, null::text;
  end if;
  select count(*) into v_correct
  from public.exam_questions q
  where q.exam_id = p_exam_id
    and (
      (q.kind in ('mc', 'true_false') and q.correct_answer = (p_answers ->> q.id::text))
      or (q.kind = 'short' and lower(btrim(q.correct_answer)) = lower(btrim(p_answers ->> q.id::text)))
    );
  v_score := round(v_correct::numeric * 100 / v_total);
  v_passed := v_score >= coalesce(v_exam.passing_score, 70);
  insert into public.exam_attempts (exam_id, user_id, score, answers, passed)
  values (p_exam_id, auth.uid(), v_score, p_answers, v_passed);
  if v_passed then
    if v_exam.course_id is null then
      raise exception 'ujian ini belum terhubung ke course, jadi sertifikat ujian tidak bisa diterbitkan (certificates.course_id wajib terisi)';
    end if;
    select count(*) into v_seq
    from public.certificates
    where type = 'exam' and serial like 'SVS-EXM-' || extract(year from now())::text || '-%';
    v_serial := 'SVS-EXM-' || extract(year from now())::text || '-' || lpad((v_seq + 1)::text, 4, '0');
    insert into public.certificates (user_id, course_id, type, serial, score)
    values (auth.uid(), v_exam.course_id, 'exam', v_serial, v_score)
    on conflict (serial) do nothing;
    -- If a concurrent pass took the same serial, fall back to a retry-safe serial.
    if not found then
      v_serial := 'SVS-EXM-' || extract(year from now())::text || '-' || lpad((v_seq + 2)::text, 4, '0');
      insert into public.certificates (user_id, course_id, type, serial, score)
      values (auth.uid(), v_exam.course_id, 'exam', v_serial, v_score)
      on conflict (serial) do nothing;
    end if;
  end if;
  return query select v_score, v_passed, v_serial;
end;
$$;

grant execute on function public.submit_exam_attempt(uuid, jsonb) to authenticated;
