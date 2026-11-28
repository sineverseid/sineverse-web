-- SINEVERSE migration 088 — RPC Grade Book per course (pilot pola Mentari, D25).
--
-- Latar (Arif, 28 Nov 2026, screenshot Mentari "Grade Book"): halaman Grade
-- Book menampilkan SATU kartu per peserta — nama (HURUF BESAR) + kolom per
-- jenis aktivitas (Pretest, Buku ISBN, Video Ajar, Power Point, ...) dengan
-- sel "x/21" + pil "Score: 84.76", dan tombol DOWNLOAD EXCEL.
--
-- RPC SECURITY DEFINER ini mengembalikan SATU objek JSONB per course:
-- judul course, jumlah lesson, cakupan viewer ("all" | "self"), jumlah kelas
-- live terjadwal, dan SATU baris per peserta terdaftar dengan agregat per
-- aktivitas. Akses dibatasi di dalam fungsi (cerminan migrasi 085):
-- admin, mentor pengampu course (courses.mentor_id), atau siswa terdaftar.
-- Siswa hanya melihat barisnya sendiri; orang luar course mendapat exception.
--
-- Definisi agregat (data ASLI, tanpa karangan):
--   - total per aktivitas = jumlah lesson YANG PUNYA konten itu (bukan
--     selalu 11). Lesson tanpa konten tidak dihitung di pembilang maupun
--     penyebut (fail-open RENCANA §2).
--   - done per lesson = derivasi RENCANA §2 (pretest/posttest: ada attempt;
--     tugas: ada submission non-draft; forum: >= 2 postingan di lesson itu;
--     kuesioner: ada response; materi: lesson_progress in_progress/completed).
--   - avg pretest/posttest = rata-rata SKOR TERBAIK PER LESSON (bukan per
--     kuis) — jadi 2 kuis lama berjudul identik di Lesson Pengenalan tidak
--     menghitung lesson itu 3x. null bila belum ada attempt bernilai.
--   - avg tugas = rata-rata skor submission non-draft YANG SUDAH DINILAI
--     (score not null), dipisah kind weekly (tugas lama tanpa kind = weekly)
--     dan final_practice. null bila belum ada yang dinilai.
--   - discussion_score = rumus lib/grading.ts (Skor partisipasi diskusi):
--     min(100, lesson_berbeda*10 + sum(min(10, postingan_lesson*2)));
--     null bila belum pernah posting.
--   - Provinsi / Kab-Kota / Asal Sekolah = resolusi yang sama seperti 085
--     (ref_provinces / ref_regencies / schools / profiles.school manual).
--     TIDAK ADA kolom NIM (keputusan Arif 28 Nov 2026: tanpa NIS).
--   - LINK VCON TIDAK punya kolom nilai: kehadiran VCON tidak tercatat di
--     database (klik join hanya tercatat di sesi, LAPORAN §7.3). RPC hanya
--     mengembalikan jumlah kelas live terjadwal (vcon_scheduled); UI
--     menampilkan "—" + catatan kaki.
--
-- TIDAK diterapkan ke live sebelum Arif setuju (pilot staged).
-- ---------------------------------------------------------------------------

create or replace function public.get_course_gradebook(p_course_id uuid)
returns jsonb
language plpgsql
security definer
stable
as $$
declare
  v_course_title text;
  v_mentor_id uuid;
  v_is_admin boolean;
  v_is_mentor boolean;
  v_is_student boolean;
  v_lessons_total int;
  v_vcon_scheduled int;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select c.title, c.mentor_id into v_course_title, v_mentor_id
  from public.courses c
  where c.id = p_course_id;
  if not found then
    raise exception 'course tidak ditemukan';
  end if;

  v_is_admin := public.is_admin();
  v_is_mentor := v_mentor_id is not distinct from auth.uid();
  select exists (
    select 1 from public.enrollments e
    where e.course_id = p_course_id and e.user_id = auth.uid()
  ) into v_is_student;

  if not (v_is_admin or v_is_mentor or v_is_student) then
    raise exception 'tidak memiliki akses ke Grade Book course ini';
  end if;

  select count(*) into v_lessons_total
  from public.lessons l
  join public.modules m on m.id = l.module_id
  where m.course_id = p_course_id;

  select count(*) into v_vcon_scheduled
  from public.live_classes lc
  where lc.course_id = p_course_id;

  with
  course_lessons as (
    select l.id as lesson_id
    from public.lessons l
    join public.modules m on m.id = l.module_id
    where m.course_id = p_course_id
  ),
  -- Lesson yang punya konten per jenis aktivitas (penyebut "total").
  pretest_lessons as (
    select distinct q.lesson_id
    from public.quizzes q
    where q.lesson_id in (select lesson_id from course_lessons)
      and coalesce(q.kind, 'quiz') = 'pretest'
  ),
  posttest_lessons as (
    select distinct q.lesson_id
    from public.quizzes q
    where q.lesson_id in (select lesson_id from course_lessons)
      and coalesce(q.kind, 'quiz') = 'posttest'
  ),
  tugas_lessons as (
    select distinct a.lesson_id
    from public.assignments a
    where a.lesson_id in (select lesson_id from course_lessons)
  ),
  forum_lessons as (
    select distinct d.lesson_id
    from public.discussions d
    where d.lesson_id in (select lesson_id from course_lessons)
  ),
  kuesioner_lessons as (
    select distinct q.lesson_id
    from public.questionnaires q
    where q.lesson_id in (select lesson_id from course_lessons)
  ),
  -- Peserta yang boleh dilihat viewer ini.
  viewers as (
    select e.user_id
    from public.enrollments e
    where e.course_id = p_course_id
      and (v_is_admin or v_is_mentor or e.user_id = auth.uid())
  ),
  -- Skor terbaik per peserta per lesson (pretest / posttest).
  pre_best as (
    select a.user_id, q.lesson_id, max(a.score) as best
    from public.quiz_attempts a
    join public.quizzes q on q.id = a.quiz_id
    where a.user_id in (select user_id from viewers)
      and q.lesson_id in (select lesson_id from pretest_lessons)
      and coalesce(q.kind, 'quiz') = 'pretest'
      and a.score is not null
    group by a.user_id, q.lesson_id
  ),
  pre_done as (
    select distinct a.user_id, q.lesson_id
    from public.quiz_attempts a
    join public.quizzes q on q.id = a.quiz_id
    where a.user_id in (select user_id from viewers)
      and q.lesson_id in (select lesson_id from pretest_lessons)
      and coalesce(q.kind, 'quiz') = 'pretest'
  ),
  post_best as (
    select a.user_id, q.lesson_id, max(a.score) as best
    from public.quiz_attempts a
    join public.quizzes q on q.id = a.quiz_id
    where a.user_id in (select user_id from viewers)
      and q.lesson_id in (select lesson_id from posttest_lessons)
      and coalesce(q.kind, 'quiz') = 'posttest'
      and a.score is not null
    group by a.user_id, q.lesson_id
  ),
  post_done as (
    select distinct a.user_id, q.lesson_id
    from public.quiz_attempts a
    join public.quizzes q on q.id = a.quiz_id
    where a.user_id in (select user_id from viewers)
      and q.lesson_id in (select lesson_id from posttest_lessons)
      and coalesce(q.kind, 'quiz') = 'posttest'
  ),
  -- Pengumpulan tugas non-draft per peserta per lesson + skor yang dinilai.
  tugas_done as (
    select distinct s.user_id, a.lesson_id
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    where s.user_id in (select user_id from viewers)
      and a.lesson_id in (select lesson_id from tugas_lessons)
      and s.is_draft = false
  ),
  tugas_scores as (
    select s.user_id, coalesce(a.kind, 'weekly') as kind, s.score
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    where s.user_id in (select user_id from viewers)
      and a.lesson_id in (select lesson_id from tugas_lessons)
      and s.is_draft = false
      and s.score is not null
  ),
  -- Postingan forum per peserta per lesson.
  forum_posts as (
    select d.user_id, d.lesson_id, count(*) as cnt
    from public.discussions d
    where d.user_id in (select user_id from viewers)
      and d.lesson_id in (select lesson_id from forum_lessons)
    group by d.user_id, d.lesson_id
  ),
  -- Kuesioner terisi per peserta per lesson.
  kues_done as (
    select distinct r.user_id, q.lesson_id
    from public.questionnaire_responses r
    join public.questionnaires q on q.id = r.questionnaire_id
    where r.user_id in (select user_id from viewers)
      and q.lesson_id in (select lesson_id from kuesioner_lessons)
  ),
  -- Materi: lesson dibuka (lesson_progress in_progress/completed).
  materi_done as (
    select distinct lp.user_id, lp.lesson_id
    from public.lesson_progress lp
    where lp.user_id in (select user_id from viewers)
      and lp.lesson_id in (select lesson_id from course_lessons)
      and lp.status in ('in_progress', 'completed')
  ),
  per_user as (
    select
      v.user_id,
      (select count(*) from pre_done pd where pd.user_id = v.user_id) as pre_done,
      (select count(*) from pretest_lessons) as pre_total,
      (select round(avg(pb.best), 1) from pre_best pb where pb.user_id = v.user_id) as pre_avg,
      (select count(*) from post_done pd where pd.user_id = v.user_id) as post_done,
      (select count(*) from posttest_lessons) as post_total,
      (select round(avg(pb.best), 1) from post_best pb where pb.user_id = v.user_id) as post_avg,
      (select count(*) from tugas_done td where td.user_id = v.user_id) as tugas_done,
      (select count(*) from tugas_lessons) as tugas_total,
      (select round(avg(ts.score), 1) from tugas_scores ts where ts.user_id = v.user_id and ts.kind = 'weekly') as tugas_avg_weekly,
      (select round(avg(ts.score), 1) from tugas_scores ts where ts.user_id = v.user_id and ts.kind = 'final_practice') as tugas_avg_final,
      (select count(*) from forum_posts fp where fp.user_id = v.user_id and fp.cnt >= 2) as forum_done,
      (select count(*) from forum_lessons) as forum_total,
      (select coalesce(sum(fp.cnt), 0) from forum_posts fp where fp.user_id = v.user_id) as forum_posts,
      -- Rumus partisipasi diskusi (lib/grading.ts): null bila belum posting.
      (select case when count(*) = 0 then null
              else least(100, count(*) * 10 + sum(least(10, fp.cnt * 2)))
              end
       from forum_posts fp where fp.user_id = v.user_id) as discussion_score,
      (select count(*) from kues_done kd where kd.user_id = v.user_id) as kues_done,
      (select count(*) from kuesioner_lessons) as kues_total,
      (select count(*) from materi_done md where md.user_id = v.user_id) as materi_done,
      v_lessons_total as materi_total
    from viewers v
  )
  select jsonb_build_object(
    'course_id', p_course_id,
    'course_title', v_course_title,
    'lessons_total', v_lessons_total,
    'viewer_scope', case when (v_is_admin or v_is_mentor) then 'all' else 'self' end,
    'vcon_scheduled', v_vcon_scheduled,
    'participants', coalesce(
      (select jsonb_agg(
        jsonb_build_object(
          'user_id', u.user_id,
          'name', p.name,
          'province', coalesce(rp.name, s.province),
          'regency', coalesce(rr.name, s.regency),
          'school', coalesce(s.name, p.school),
          'pretest', jsonb_build_object('done', u.pre_done, 'total', u.pre_total, 'avg', u.pre_avg),
          'posttest', jsonb_build_object('done', u.post_done, 'total', u.post_total, 'avg', u.post_avg),
          'tugas', jsonb_build_object('done', u.tugas_done, 'total', u.tugas_total, 'avg_weekly', u.tugas_avg_weekly, 'avg_final', u.tugas_avg_final),
          'forum', jsonb_build_object('done', u.forum_done, 'total', u.forum_total, 'posts', u.forum_posts, 'discussion_score', u.discussion_score),
          'kuesioner', jsonb_build_object('done', u.kues_done, 'total', u.kues_total),
          'materi', jsonb_build_object('done', u.materi_done, 'total', u.materi_total)
        ) order by p.name
      )
      from per_user u
      join public.profiles p on p.id = u.user_id
      left join public.schools s on s.id = p.school_id
      left join public.ref_provinces rp on rp.code = p.province
      left join public.ref_regencies rr on rr.code = p.regency),
      '[]'::jsonb
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_course_gradebook(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Verifikasi (SQL Editor, JANGAN jalankan blok ini sebagai bagian migrasi):
--   select proname from pg_proc where proname = 'get_course_gradebook'; -- 1
--   -- Sebagai siswa terdaftar: select get_course_gradebook('10000000-0000-4000-8000-000000000001');
--   -- harus mengembalikan 1 peserta (diri sendiri). Sebagai admin/mentor
--   -- pengampu: semua peserta terdaftar.
-- Rollback:
--   drop function if exists public.get_course_gradebook(uuid);
-- ---------------------------------------------------------------------------
