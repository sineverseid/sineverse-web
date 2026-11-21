-- SINEVERSE Academy fix (found in Stage 5 live verification, 22 Nov 2026):
-- Mentors could not read students' quiz attempts or lesson progress.
-- quiz_attempts had only select_own / insert_own / admin_all, and
-- lesson_progress only select_own / insert_own / update_own / admin_all
-- — no mentor policy, unlike submissions (submissions_select_mentor).
-- Effect: the mentor-side certificate eligibility table showed Pretest /
-- Posttest as "—" and a wrong renormalized final (70.4 instead of 78.9),
-- and per-student "Lesson Selesai" counts on the mentor side were blind
-- (always 0). The issue_course_certificate RPC itself was unaffected
-- (security definer, server-side recompute), so issued scores were right.
-- Fix mirrors the submissions mentor policy, using is_course_teacher so
-- co-teachers (course_teachers) are covered too, not just mentor_id.
-- Idempotent.

drop policy if exists "quiz_attempts_select_mentor" on public.quiz_attempts;
create policy "quiz_attempts_select_mentor"
  on public.quiz_attempts for select to authenticated
  using (exists (
    select 1
    from public.quizzes q
    join public.lessons l on l.id = q.lesson_id
    join public.modules m on m.id = l.module_id
    join public.courses c on c.id = m.course_id
    where q.id = quiz_id and public.is_course_teacher(c.id)
  ));

drop policy if exists "lesson_progress_select_mentor" on public.lesson_progress;
create policy "lesson_progress_select_mentor"
  on public.lesson_progress for select to authenticated
  using (exists (
    select 1
    from public.lessons l
    join public.modules m on m.id = l.module_id
    join public.courses c on c.id = m.course_id
    where l.id = lesson_id and public.is_course_teacher(c.id)
  ));
