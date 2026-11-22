-- ============================================================================
-- SINEVERSE — Migration 022: Admin / klaim mengampu / hak akses peserta
-- Project: sineverse (Supabase, Singapore, Postgres 15)
--
-- Masalah yang diperbaiki (ditemukan saat audit 22 Nov 2026):
--   (a) decideClaim() di AdminPage hanya mengubah status klaim — tidak
--       pernah menulis courses.mentor_id — sehingga klaim yang disetujui
--       tidak mengubah apa pun: course tetap "Tanpa Mentor" dan siswa
--       tetap tidak bisa mengambil course. Migrasi 008 mendokumentasikan
--       ini ("approval does NOT auto-assign"); 022 menutup celah itu.
--   (b) Admin bisa mencatat progres sebagai peserta: kebijakan *_admin_all
--       (FOR ALL) di enrollments, lesson_progress, quiz_attempts,
--       submissions, dan discussions membiarkan admin insert/update
--       baris miliknya sendiri. Buktinya di data live: 8 baris
--       lesson_progress milik dua akun admin.
--   (c) Mentor yang ditolak tidak bisa mengajukan ulang: unique
--       (course_id, mentor_id) + UI yang menyembunyikan tombol bila ada
--       baris klaim apa pun.
--
-- Isi migrasi ini:
--   (1) course_claims.decision_note — alasan penolakan, terlihat mentor.
--   (2) Trigger assign_mentor_on_claim_approval — persetujuan klaim
--       otomatis menetapkan courses.mentor_id, HANYA bila course masih
--       tanpa mentor DAN pengaju benar-benar ber-peran 'mentor'. Klaim
--       pending lain untuk course yang sama ditolak otomatis, mentor
--       yang disetujui + pendaftar waitlist diberi tahu.
--   (3) Backfill satu kali: course tanpa mentor mendapat mentor dari
--       klaim 'approved' paling awal yang pengajunya ber-peran mentor.
--       (Data live: course 1 dan 2 → Mentor Uji; klaim 'approved' milik
--       akun admin dilewati oleh cek peran — baris klaimnya dibiarkan
--       apa adanya, tidak dihapus.)
--   (4) Partial unique index: klaim pending tidak boleh ganda per
--       (course, mentor), tetapi klaim yang ditolak boleh diajukan ulang.
--   (5) RLS: admin tidak bisa lagi mencatat progres sebagai peserta.
--       Penulisan admin yang memang dibutuhkan dipertahankan:
--       - enrollments: admin tetap bisa mendaftarkan / menghapus
--         enrollment SISWA LAIN (AdminEnrollmentsPage), tidak pernah
--         untuk dirinya sendiri.
--       - submissions: admin tetap bisa UPDATE (menilai) lewat antrean
--         penilaian (GradingQueuePage mengizinkan peran admin).
--       - discussions: admin tetap bisa UPDATE (moderasi: sematkan /
--         tandai selesai / jawaban diterima di LessonDetailPage).
--       lesson_progress dan quiz_attempts: admin hanya SELECT.
--   (6) Guard admin di submit_quiz_attempt() dan submit_exam_attempt()
--       (keduanya security definer, jadi RLS tidak menghentikannya).
--   (7) Kebijakan re-apply: mentor boleh mengubah klaim 'rejected'
--       miliknya kembali menjadi 'pending'.
-- No new tables. No data deletion.
--
-- How to apply:
--   Supabase Dashboard -> SQL Editor -> paste this file -> Run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (1) Alasan penolakan pada klaim mengampu
-- ---------------------------------------------------------------------------
alter table public.course_claims
  add column if not exists decision_note text;

-- ---------------------------------------------------------------------------
-- (2) Trigger: persetujuan klaim otomatis menetapkan mentor course
-- ---------------------------------------------------------------------------
create or replace function public.assign_mentor_on_claim_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_mentor boolean;
  v_course_title text;
  v_wait record;
begin
  -- Hanya persetujuan yang benar-benar menetapkan mentor. Klaim dari
  -- akun yang BUKAN mentor (mis. klaim 'approved' milik akun admin di
  -- data live) tidak pernah memenangkan course.
  select exists (
    select 1 from public.profiles p
    where p.id = new.mentor_id and p.role = 'mentor'
  ) into v_is_mentor;
  if not v_is_mentor then
    return new;
  end if;

  -- Tetapkan hanya bila course masih tanpa mentor (persetujuan pertama
  -- menang; persetujuan berikutnya tidak boleh merebut course).
  update public.courses
  set mentor_id = new.mentor_id
  where id = new.course_id and mentor_id is null;

  -- Bila course sudah punya mentor, persetujuan ini tidak menetapkan
  -- apa pun — biarkan klaim pending lain tetap menunggu tinjauan admin.
  if not found then
    return new;
  end if;

  -- Tolak klaim pending lain untuk course yang sama supaya tidak ada
  -- penugasan ganda.
  update public.course_claims
  set status = 'rejected',
      decision_note = 'Course sudah diampu mentor lain'
  where course_id = new.course_id
    and status = 'pending'
    and id <> new.id;

  select title into v_course_title
  from public.courses where id = new.course_id;

  -- Beri tahu mentor yang disetujui. Best-effort: kegagalan notifikasi
  -- tidak boleh menggagalkan penetapan mentor — mis. bila persetujuan
  -- dijalankan dari SQL Editor tanpa JWT, auth.uid() null dan
  -- create_notification menolak.
  begin
    perform public.create_notification(
      new.mentor_id,
      'claim_approved',
      'Pengajuan mengampu disetujui',
      'Kamu resmi mengampu course "' || coalesce(v_course_title, 'course') || '".',
      jsonb_build_object('course_id', new.course_id, 'claim_id', new.id)
    );
  exception when others then
    null;
  end;

  -- Beri tahu pendaftar waitlist bahwa course sudah bisa dikerjakan.
  -- (Satu-satunya sumber notifikasi waitlist untuk jalur persetujuan
  -- klaim — decideClaim di client TIDAK mengirimnya lagi, supaya tidak
  -- ganda. Jalur penetapan manual di handleAssignMentor mengirimnya
  -- dari client.)
  for v_wait in
    select user_id from public.waitlist where course_id = new.course_id
  loop
    begin
      perform public.create_notification(
        v_wait.user_id,
        'mentor_assigned',
        'Mentor ditugaskan: ' || coalesce(v_course_title, 'course'),
        'Course "' || coalesce(v_course_title, 'course') || '" sudah memiliki mentor dan bisa mulai dikerjakan.',
        jsonb_build_object('course_id', new.course_id, 'mentor_id', new.mentor_id)
      );
    exception when others then
      null;
    end;
  end loop;

  return new;
end;
$$;

drop trigger if exists course_claims_assign_mentor on public.course_claims;
create trigger course_claims_assign_mentor
  after update of status on public.course_claims
  for each row
  when (new.status = 'approved' and old.status is distinct from 'approved')
  execute function public.assign_mentor_on_claim_approval();

-- ---------------------------------------------------------------------------
-- (3) Backfill satu kali: course tanpa mentor <- klaim 'approved' paling
--     awal yang pengajunya ber-peran mentor. Klaim milik akun admin
--     dilewati (cek peran); baris klaimnya tidak diubah/dihapus.
-- ---------------------------------------------------------------------------
update public.courses c
set mentor_id = sub.mentor_id
from (
  select distinct on (cc.course_id) cc.course_id, cc.mentor_id
  from public.course_claims cc
  join public.profiles p on p.id = cc.mentor_id and p.role = 'mentor'
  where cc.status = 'approved'
  order by cc.course_id, cc.created_at asc
) sub
where c.id = sub.course_id and c.mentor_id is null;

-- ---------------------------------------------------------------------------
-- (4) Klaim pending tidak boleh ganda, klaim ditolak boleh diajukan ulang.
--     Lepas dulu unique (course_id, mentor_id) dari migrasi 008 (nama
--     constraint dicari dinamis — dibuat inline sehingga namanya
--     course_claims_course_id_mentor_id_key), lalu ganti dengan partial
--     unique index yang hanya berlaku untuk status 'pending'.
-- ---------------------------------------------------------------------------
do $$
declare
  v_con text;
begin
  select conname into v_con
  from pg_constraint
  where conrelid = 'public.course_claims'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) ilike '%unique (course_id, mentor_id)%';
  if v_con is not null then
    execute format('alter table public.course_claims drop constraint %I', v_con);
  end if;
end $$;

create unique index if not exists course_claims_pending_unique
  on public.course_claims (course_id, mentor_id) where status = 'pending';

-- ---------------------------------------------------------------------------
-- (7) Re-apply: mentor boleh mengubah klaim 'rejected' miliknya kembali
--     menjadi 'pending' (tanpa baris baru, tanpa duplikat).
-- ---------------------------------------------------------------------------
drop policy if exists "course_claims_update_own_rejected" on public.course_claims;
create policy "course_claims_update_own_rejected"
  on public.course_claims for update to authenticated
  using (mentor_id = auth.uid() and status = 'rejected')
  with check (mentor_id = auth.uid() and status = 'pending');

-- ---------------------------------------------------------------------------
-- (5) RLS: admin memantau, bukan peserta.
--     Penulisan admin yang dipertahankan (sudah diverifikasi ada di kode):
--     enrollments insert/delete untuk siswa lain, submissions update
--     (menilai), discussions update (moderasi). Sisanya: SELECT saja.
-- ---------------------------------------------------------------------------

-- enrollments: admin tidak boleh mendaftar sebagai peserta; tetap bisa
-- mengelola enrollment siswa lain (AdminEnrollmentsPage).
drop policy if exists "enrollments_insert_own" on public.enrollments;
create policy "enrollments_insert_own"
  on public.enrollments for insert to authenticated
  with check (user_id = auth.uid() and not public.is_admin());
drop policy if exists "enrollments_admin_all" on public.enrollments;
create policy "enrollments_admin_select"
  on public.enrollments for select to authenticated
  using (public.is_admin());
create policy "enrollments_admin_insert"
  on public.enrollments for insert to authenticated
  with check (public.is_admin() and user_id <> auth.uid());
create policy "enrollments_admin_delete"
  on public.enrollments for delete to authenticated
  using (public.is_admin() and user_id <> auth.uid());

-- lesson_progress: admin hanya membaca.
drop policy if exists "lesson_progress_insert_own" on public.lesson_progress;
create policy "lesson_progress_insert_own"
  on public.lesson_progress for insert to authenticated
  with check (user_id = auth.uid() and not public.is_admin());
drop policy if exists "lesson_progress_update_own" on public.lesson_progress;
create policy "lesson_progress_update_own"
  on public.lesson_progress for update to authenticated
  using (user_id = auth.uid() and not public.is_admin())
  with check (user_id = auth.uid() and not public.is_admin());
drop policy if exists "lesson_progress_admin_all" on public.lesson_progress;
create policy "lesson_progress_admin_select"
  on public.lesson_progress for select to authenticated
  using (public.is_admin());

-- quiz_attempts: admin hanya membaca (submit_quiz_attempt dijaga di (6)).
drop policy if exists "quiz_attempts_insert_own" on public.quiz_attempts;
create policy "quiz_attempts_insert_own"
  on public.quiz_attempts for insert to authenticated
  with check (user_id = auth.uid() and not public.is_admin());
drop policy if exists "quiz_attempts_admin_all" on public.quiz_attempts;
create policy "quiz_attempts_admin_select"
  on public.quiz_attempts for select to authenticated
  using (public.is_admin());

-- submissions: admin hanya membaca + menilai (GradingQueuePage).
drop policy if exists "submissions_insert_own" on public.submissions;
create policy "submissions_insert_own"
  on public.submissions for insert to authenticated
  with check (user_id = auth.uid() and not public.is_admin());
drop policy if exists "submissions_admin_all" on public.submissions;
create policy "submissions_admin_select"
  on public.submissions for select to authenticated
  using (public.is_admin());
create policy "submissions_admin_update"
  on public.submissions for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- discussions: admin hanya membaca + moderasi (sematkan / selesai /
-- jawaban diterima di LessonDetailPage).
drop policy if exists "discussions_insert_own" on public.discussions;
create policy "discussions_insert_own"
  on public.discussions for insert to authenticated
  with check (user_id = auth.uid() and not public.is_admin());
drop policy if exists "discussions_admin_all" on public.discussions;
create policy "discussions_admin_select"
  on public.discussions for select to authenticated
  using (public.is_admin());
create policy "discussions_admin_update"
  on public.discussions for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- (6) Guard admin di RPC penilaian (security definer — RLS tidak berlaku
--     di dalamnya, jadi guard harus eksplisit di sini).
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
  -- (022) Admin memantau, bukan peserta: tidak boleh mengerjakan kuis.
  if public.is_admin() then
    raise exception 'admin tidak dapat mengerjakan kuis sebagai peserta';
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
  -- (022) Admin memantau, bukan peserta: tidak boleh mengerjakan ujian.
  if public.is_admin() then
    raise exception 'admin tidak dapat mengerjakan ujian sebagai peserta';
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
