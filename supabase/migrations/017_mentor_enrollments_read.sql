-- SINEVERSE Academy fix (found in Stage 3 live verification, 22 Nov 2026):
-- (1) Mentors could not see enrollments in their own courses. The
-- enrollments SELECT policies only covered own rows + admin, so
-- MentorPage "Siswa Saya" and mentor analytics showed 0 students even
-- with verified enrollments in the database. Add a teacher policy.
-- (2) The RPS SVS-SEM1 description still states the old grading formula
-- (Kuis 20% + Tugas 50% + Ujian Akhir 30%) while the weights row already
-- uses the new 5-component formula (migration 015). Replace that
-- sentence in place. If the exact old sentence is not found, replace()
-- is a no-op — verify with a SELECT afterwards.
-- Idempotent.

drop policy if exists "enrollments_select_teacher" on public.enrollments;
create policy "enrollments_select_teacher"
  on public.enrollments for select to authenticated
  using (public.is_course_teacher(course_id));

update public.rps
set description = replace(description,
  'Nilai akhir = Kuis 20% + Tugas 50% + Ujian Akhir 30%',
  'Nilai akhir = Pretest 5% + Posttest 15% + Tugas mingguan 30% + Tugas praktik akhir 40% + Partisipasi diskusi 10%')
where code = 'SVS-SEM1';
