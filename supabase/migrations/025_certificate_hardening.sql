-- SINEVERSE — Certificate hardening (migrasi 025), 22 Nov 2026.
-- Audit read-only sebelumnya menemukan celah pada sistem sertifikat
-- (migrasi 016/023/024); migrasi ini menutupnya tanpa mengubah jalur
-- penerbitan yang sudah berjalan.
--
-- Perbaikan (B1–B9):
--   B1 (KRITIS): policy certificates_insert_own dihapus — penerbitan
--     HANYA lewat RPC SECURITY DEFINER (insert langsung oleh admin tetap
--     tercakup certificates_admin_all).
--   B2: submit_exam_attempt() (versi live 022) kini menerbitkan sertifikat
--     ujian dengan pola 024 (token hash, issued_by, snapshot, audit log
--     hanya saat penerbitan baru), idempotent per (user, exam), dan RAISE
--     bila insert benar-benar gagal (tidak pernah mengembalikan serial
--     hantu yang tidak ter-insert).
--   B3: RPC baru issue_work_certificate() — sertifikat karya (SVS-KRY)
--     untuk pemenang kompetisi, admin-only, idempotent per (kompetisi,
--     pemenang); menggantikan insert langsung di CompetitionsPage.
--   B4: semua serial memakai certificate_serial_counters (monoton per
--     prefix+tahun) — count(*)/MAX(serial) atas tabel TIDAK dipakai lagi,
--     karena nomor yang terhapus akan dipakai ulang. Retry loop tetap ada
--     (retry boleh melompati nomor; celah tidak masalah).
--   B7: gate Academy menghitung HANYA sertifikat course berstatus 'valid'.
--   B9: issue_event_certificate() mensyaratkan penerima tercatat HADIR
--     (event_registrations.attended = true), bukan sekadar terdaftar.
--
-- Status 'inactive': dicadangkan dan TIDAK ada jalur kode yang
-- mengaturnya (tidak ada RPC yang menulis status 'inactive') — sengaja
-- DIBIARKAN di check constraint status, bukan dihapus, supaya nilai
-- historis/aplikasi lain tidak rusak bila status itu dipakai nanti.
--
-- Semua CREATE OR REPLACE di sini mereproduksi body aslinya (024/022)
-- persis; yang berubah hanya hunk yang disebut di atas (diverifikasi
-- dengan diff per fungsi sebelum deploy).

-- ---------------------------------------------------------------------------
-- B1: hapus policy insert langsung ke certificates.
-- Penerbitan HANYA lewat RPC SECURITY DEFINER; insert langsung oleh admin
-- tetap tercakup policy certificates_admin_all (FOR ALL, 001).
-- ---------------------------------------------------------------------------
drop policy if exists "certificates_insert_own" on public.certificates;

-- ---------------------------------------------------------------------------
-- B4: penghitung serial monoton per prefix+tahun.
-- count(*) / MAX(serial) atas tabel certificates TIDAK cukup: bila satu
-- serial terhapus (mis. cleanup data uji), hitungan berikutnya memakai
-- ulang nomor yang sama. Counter ini tidak pernah berkurang atau di-reset
-- saat baris sertifikat dihapus, jadi nomor yang sudah terbit tidak pernah
-- diterbitkan ulang. Retry boleh melompati nomor (celah tidak masalah;
-- yang penting unik).
-- TIDAK ada RLS di tabel ini (RLS tidak diaktifkan): hanya RPC SECURITY
-- DEFINER yang menyentuhnya, tidak ada jalur klien langsung.
-- ---------------------------------------------------------------------------
create table if not exists public.certificate_serial_counters (
  prefix text not null,
  year int not null,
  last_n int not null default 0,
  primary key (prefix, year)
);
comment on table public.certificate_serial_counters is 'Monotonic serial counters per certificate prefix+year. Never decremented or reset on delete, so a deleted serial is never re-issued.';

-- ---------------------------------------------------------------------------
-- Kolom sumber untuk idempotency per (user, exam) dan per (kompetisi,
-- pemenang): tanpa kolom ini RPC tidak bisa membedakan sertifikat ujian
-- dari ujian yang berbeda di course yang sama, atau sertifikat karya dari
-- kompetisi yang berbeda untuk pemenang yang sama.
-- ---------------------------------------------------------------------------
alter table public.certificates add column if not exists exam_id uuid references public.competency_exams (id) on delete set null;
alter table public.certificates add column if not exists competition_id uuid references public.competitions (id) on delete set null;
create index if not exists certificates_exam_id_idx on public.certificates (exam_id);
create index if not exists certificates_competition_id_idx on public.certificates (competition_id);

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
  v_existing record;
  v_year text := extract(year from now())::text;
  v_year_int int := extract(year from now())::int;
  v_token_hash text;
  v_recipient text;
  v_program text;
  v_achievement text;
  v_cert_id uuid;
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
    -- B2: idempotent per (user, exam) — sertifikat ujian yang sudah ada
    -- dikembalikan apa adanya (tidak menerbitkan nomor kedua).
    -- certificates.exam_id (migrasi 025) mencatat ujian sumbernya.
    select c.serial into v_existing
    from public.certificates c
    where c.user_id = auth.uid() and c.type = 'exam' and c.exam_id = p_exam_id
    limit 1;
    if found then
      v_serial := v_existing.serial;
    else
      if v_exam.course_id is null then
        raise exception 'ujian ini belum terhubung ke course, jadi sertifikat ujian tidak bisa diterbitkan';
      end if;
      select p.name into v_recipient from public.profiles p where p.id = auth.uid();
      select co.title into v_program from public.courses co where co.id = v_exam.course_id;
      v_achievement := 'Lulus ujian kompetensi "' || v_exam.title || '" dengan skor ' || v_score || '.';
      -- Pola 024: token acak 32 byte, disimpan HANYA hash SHA-256-nya.
      v_token_hash := encode(digest(gen_random_bytes(32), 'sha256'), 'hex');
      v_serial := null;
      for i in 1..10 loop
        insert into public.certificate_serial_counters (prefix, year, last_n)
        values ('SVS-EXM', v_year_int, 1)
        on conflict (prefix, year) do update set last_n = public.certificate_serial_counters.last_n + 1
        returning last_n into v_seq;
        v_serial := 'SVS-EXM-' || v_year || '-' || lpad(v_seq::text, 4, '0');
        insert into public.certificates (user_id, course_id, type, serial, score, verification_token_hash, issued_by, recipient_name_snapshot, program_name, achievement_description, exam_id)
        values (auth.uid(), v_exam.course_id, 'exam', v_serial, v_score, v_token_hash, auth.uid(), v_recipient, v_program, v_achievement, p_exam_id)
        on conflict on constraint certificates_serial_key do nothing
        returning id into v_cert_id;
        exit when found;
        v_serial := null;
      end loop;
      -- Bila insert benar-benar gagal, RAISE — jangan pernah mengembalikan
      -- serial yang tidak pernah ter-insert (versi lama mengembalikan
      -- serial fallback walau insert keduanya juga bentrok).
      if v_serial is null then
        raise exception 'gagal membuat nomor serial sertifikat (bentrok berulang)';
      end if;
      perform log_certificate_audit(v_cert_id, 'issue', null, 'valid', 'Sertifikat ujian diterbitkan; skor ' || v_score || '.');
    end if;
  end if;
  return query select v_score, v_passed, v_serial;
end;
$$;

grant execute on function public.submit_exam_attempt(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- B3: RPC baru issue_work_certificate() — sertifikat karya (SVS-KRY).
-- Menggantikan insert langsung ke certificates di
-- CompetitionsPage.handleIssueWinnerCerts (yang akan memanggil RPC ini).
-- p_winner_id adalah user id pemenang (bukan id baris competition_winners);
-- idempotent per (kompetisi, pemenang). course_id = enrollment terbaru
-- pemenang (perilaku lama di client: course terbaru yang diambil pemenang;
-- sertifikat tidak bisa terbit tanpa enrollment). project_id diisi bila
-- diberikan (nullable — kiriman kompetisi tidak selalu terikat final
-- project).
-- ---------------------------------------------------------------------------
create or replace function public.issue_work_certificate(p_competition_id uuid, p_winner_id uuid, p_project_id uuid)
returns table (serial text, already_issued boolean)
language plpgsql
security definer
as $$
#variable_conflict use_column
declare
  v_caller uuid := auth.uid();
  v_existing record;
  v_winner record;
  v_recipient text;
  v_program text;
  v_achievement text;
  v_course_id uuid;
  v_seq int;
  v_serial text;
  v_year text := extract(year from now())::text;
  v_year_int int := extract(year from now())::int;
  v_token_hash text;
  v_cert_id uuid;
begin
  if v_caller is null then
    raise exception 'harus login untuk menerbitkan sertifikat karya';
  end if;
  if not public.is_admin() then
    raise exception 'hanya admin yang dapat menerbitkan sertifikat karya';
  end if;

  select c.title into v_program from public.competitions c where c.id = p_competition_id;
  if not found then
    raise exception 'kompetisi tidak ditemukan';
  end if;
  select p.name into v_recipient from public.profiles p where p.id = p_winner_id;
  if not found then
    raise exception 'pemenang tidak ditemukan';
  end if;

  select c.serial into v_existing
  from public.certificates c
  where c.user_id = p_winner_id and c.type = 'work' and c.competition_id = p_competition_id
  limit 1;
  if found then
    return query select v_existing.serial, true;
    return;
  end if;

  -- Peringkat/kategori pemenang (bila ada) untuk deskripsi pencapaian.
  select w.rank, w.category into v_winner
  from public.competition_winners w
  join public.competition_submissions s on s.id = w.submission_id
  where w.competition_id = p_competition_id and s.user_id = p_winner_id
  order by w.rank nulls last
  limit 1;
  v_achievement := 'Pemenang kompetisi "' || v_program || '"';
  if found and v_winner.rank is not null then
    v_achievement := v_achievement || ' (peringkat ' || v_winner.rank || ')';
  end if;

  -- course_id: enrollment terbaru pemenang (perilaku lama di client).
  select e.course_id into v_course_id
  from public.enrollments e
  where e.user_id = p_winner_id
  order by e.enrolled_at desc
  limit 1;
  if not found then
    raise exception 'pemenang belum mengambil course apa pun, sertifikat karya tidak bisa diterbitkan';
  end if;

  v_token_hash := encode(digest(gen_random_bytes(32), 'sha256'), 'hex');
  v_serial := null;
  for i in 1..10 loop
    insert into public.certificate_serial_counters (prefix, year, last_n)
    values ('SVS-KRY', v_year_int, 1)
    on conflict (prefix, year) do update set last_n = public.certificate_serial_counters.last_n + 1
    returning last_n into v_seq;
    v_serial := 'SVS-KRY-' || v_year || '-' || lpad(v_seq::text, 4, '0');
    insert into public.certificates (user_id, course_id, type, serial, score, verification_token_hash, issued_by, recipient_name_snapshot, program_name, achievement_description, competition_id, project_id)
    values (p_winner_id, v_course_id, 'work', v_serial, null, v_token_hash, v_caller, v_recipient, v_program, v_achievement, p_competition_id, p_project_id)
    on conflict on constraint certificates_serial_key do nothing
    returning id into v_cert_id;
    exit when found;
    v_serial := null;
  end loop;
  if v_serial is null then
    raise exception 'gagal membuat nomor serial sertifikat (bentrok berulang)';
  end if;

  perform log_certificate_audit(v_cert_id, 'issue', null, 'valid', 'Sertifikat karya diterbitkan.');
  return query select v_serial, false;
end;
$$;

grant execute on function public.issue_work_certificate(uuid, uuid, uuid) to authenticated;

create or replace function public.issue_course_certificate(p_course_id uuid, p_user_id uuid)
returns table (serial text, score int, already_issued boolean)
language plpgsql
security definer
as $$
-- BUGFIX 2 (22 Nov 2026): nama parameter output "serial" bertabrakan dengan
-- kolom certificates.serial. Setelah query count diperbaiki (kualifikasi
-- public.certificates.serial), ambiguitas BERIKUTNYA muncul di
-- "on conflict (serial)" — PL/pgSQL menganggapnya bisa variabel atau kolom
-- (error 42702 yang sama). Dua lapis perbaikan: (a) direktif di bawah
-- memaksa semua referensi ambigu di fungsi ini dibaca sebagai KOLOM;
-- (b) on conflict memakai nama constraint, bukan nama kolom.
#variable_conflict use_column
declare
  v_caller uuid := auth.uid();
  v_is_admin boolean := public.is_admin();
  v_is_teacher boolean := public.is_course_teacher(p_course_id);
  v_enrolled boolean;
  v_existing record;
  v_weights jsonb;
  v_passing numeric := 70;
  v_w_pretest numeric := 5;
  v_w_posttest numeric := 15;
  v_w_weekly numeric := 30;
  v_w_final numeric := 40;
  v_w_discussion numeric := 10;
  v_pretest numeric;
  v_posttest numeric;
  v_weekly numeric;
  v_final_practice numeric;
  v_discussion numeric;
  v_post_count int := 0;
  v_distinct_lessons int := 0;
  v_final numeric := 0;
  v_weight_sum numeric := 0;
  v_seq int;
  v_serial text;
  v_year text := extract(year from now())::text;
  v_year_int int := extract(year from now())::int;
  -- Tambahan 024 (validasi sertifikat).
  v_token_hash text;
  v_recipient text;
  v_program text;
  v_cert_id uuid;
begin
  if v_caller is null then
    raise exception 'harus login untuk menerbitkan sertifikat';
  end if;
  if not v_is_admin and not v_is_teacher then
    raise exception 'hanya admin atau mentor course ini yang bisa menerbitkan sertifikat';
  end if;

  select exists (
    select 1 from public.enrollments
    where course_id = p_course_id and user_id = p_user_id
  ) into v_enrolled;
  if not v_enrolled then
    raise exception 'siswa belum terdaftar di course ini';
  end if;

  select c.serial, c.score into v_existing
  from public.certificates c
  where c.course_id = p_course_id and c.user_id = p_user_id and c.type = 'course'
  limit 1;
  if found then
    return query select v_existing.serial, v_existing.score, true;
    return;
  end if;

  -- Weights + passing grade from the RPS row; master-prompt defaults
  -- when the row (or a key) is missing.
  select r.weights, r.passing_grade into v_weights, v_passing
  from public.rps r where r.code = 'SVS-SEM1' limit 1;
  if v_weights is not null then
    v_w_pretest := coalesce((v_weights ->> 'pretest')::numeric, 5);
    v_w_posttest := coalesce((v_weights ->> 'posttest')::numeric, 15);
    v_w_weekly := coalesce((v_weights ->> 'tugas_mingguan')::numeric, 30);
    v_w_final := coalesce((v_weights ->> 'tugas_akhir')::numeric, 40);
    v_w_discussion := coalesce((v_weights ->> 'diskusi')::numeric, 10);
  end if;
  v_passing := coalesce(v_passing, 70);

  -- Pretest: average of the best attempt per pretest quiz in this course.
  select avg(b.best_score) into v_pretest
  from (
    select a.quiz_id, max(a.score) as best_score
    from public.quiz_attempts a
    join public.quizzes q on q.id = a.quiz_id
    join public.lessons l on l.id = q.lesson_id
    join public.modules m on m.id = l.module_id
    where m.course_id = p_course_id
      and q.kind = 'pretest'
      and a.user_id = p_user_id
      and a.score is not null
    group by a.quiz_id
  ) b;

  select avg(b.best_score) into v_posttest
  from (
    select a.quiz_id, max(a.score) as best_score
    from public.quiz_attempts a
    join public.quizzes q on q.id = a.quiz_id
    join public.lessons l on l.id = q.lesson_id
    join public.modules m on m.id = l.module_id
    where m.course_id = p_course_id
      and q.kind = 'posttest'
      and a.user_id = p_user_id
      and a.score is not null
    group by a.quiz_id
  ) b;

  select avg(s.score) into v_weekly
  from public.submissions s
  join public.assignments a on a.id = s.assignment_id
  join public.lessons l on l.id = a.lesson_id
  join public.modules m on m.id = l.module_id
  where m.course_id = p_course_id
    and coalesce(a.kind, 'weekly') = 'weekly'
    and s.user_id = p_user_id
    and s.score is not null;

  select avg(s.score) into v_final_practice
  from public.submissions s
  join public.assignments a on a.id = s.assignment_id
  join public.lessons l on l.id = a.lesson_id
  join public.modules m on m.id = l.module_id
  where m.course_id = p_course_id
    and a.kind = 'final_practice'
    and s.user_id = p_user_id
    and s.score is not null;

  -- Discussion: null when the student never posted (matches lib/grading.ts);
  -- otherwise min(100, distinctLessons * 10 + totalPosts * 2).
  select count(*), count(distinct d.lesson_id) into v_post_count, v_distinct_lessons
  from public.discussions d
  join public.lessons l on l.id = d.lesson_id
  join public.modules m on m.id = l.module_id
  where m.course_id = p_course_id
    and d.user_id = p_user_id;
  if v_post_count > 0 then
    v_discussion := least(100, v_distinct_lessons * 10 + v_post_count * 2);
  end if;

  -- Renormalized final over the components that exist.
  if v_pretest is not null then v_final := v_final + v_pretest * v_w_pretest; v_weight_sum := v_weight_sum + v_w_pretest; end if;
  if v_posttest is not null then v_final := v_final + v_posttest * v_w_posttest; v_weight_sum := v_weight_sum + v_w_posttest; end if;
  if v_weekly is not null then v_final := v_final + v_weekly * v_w_weekly; v_weight_sum := v_weight_sum + v_w_weekly; end if;
  if v_final_practice is not null then v_final := v_final + v_final_practice * v_w_final; v_weight_sum := v_weight_sum + v_w_final; end if;
  if v_discussion is not null then v_final := v_final + v_discussion * v_w_discussion; v_weight_sum := v_weight_sum + v_w_discussion; end if;
  if v_weight_sum > 0 then v_final := v_final / v_weight_sum; else v_final := 0; end if;

  if v_final < v_passing then
    raise exception 'siswa belum lulus: nilai akhir % (ambang lulus %)', round(v_final, 1), v_passing;
  end if;

  -- Serial unik dengan retry loop: bila dua penerbitan bersamaan mengambil
  -- nomor yang sama, coba nomor berikutnya (maks. 10 percobaan) dan gagal
  -- dengan jelas bila semuanya bentrok — jangan pernah mengembalikan
  -- serial yang tidak benar-benar ter-insert.
  -- BUGFIX (22 Nov 2026, verifikasi live Tahap 5): kolom "serial" di
  -- insert di bawah ini AMBIGU karena RETURNS TABLE punya parameter
  -- output bernama "serial". Postgres error 42702 membuat RPC gagal di
  -- SETIAP penerbitan. Kualifikasi dengan nama tabel menyelesaikan
  -- konflik (juga untuk "type" sekalian).

  -- Tambahan 024: token hash + snapshot untuk verifikasi publik.
  v_token_hash := encode(digest(gen_random_bytes(32), 'sha256'), 'hex');
  select p.name into v_recipient from public.profiles p where p.id = p_user_id;
  select c.title into v_program from public.courses c where c.id = p_course_id;

  v_serial := null;
  for i in 1..10 loop
    -- Nomor serial monoton dari certificate_serial_counters (bukan
    -- count/MAX atas tabel): nomor yang sudah terbit tidak pernah
    -- dipakai ulang walau baris sertifikatnya dihapus. Setiap percobaan
    -- retry mengambil nomor baru (celah nomor tidak masalah; yang
    -- penting unik).
    insert into public.certificate_serial_counters (prefix, year, last_n)
    values ('SVS-CRS', v_year_int, 1)
    on conflict (prefix, year) do update set last_n = public.certificate_serial_counters.last_n + 1
    returning last_n into v_seq;
    v_serial := 'SVS-CRS-' || v_year || '-' || lpad(v_seq::text, 4, '0');
    insert into public.certificates (user_id, course_id, type, serial, score, verification_token_hash, issued_by, recipient_name_snapshot, program_name)
    values (p_user_id, p_course_id, 'course', v_serial, round(v_final)::int, v_token_hash, v_caller, v_recipient, v_program)
    on conflict on constraint certificates_serial_key do nothing
    returning id into v_cert_id;
    exit when found;
    v_serial := null;
  end loop;
  if v_serial is null then
    raise exception 'gagal membuat nomor serial sertifikat (bentrok berulang)';
  end if;

  perform log_certificate_audit(v_cert_id, 'issue', null, 'valid', 'Sertifikat course diterbitkan; nilai akhir ' || round(v_final)::int || '.');
  return query select v_serial, round(v_final)::int, false;
end;
$$;

grant execute on function public.issue_course_certificate(uuid, uuid) to authenticated;

create or replace function public.issue_mentor_certificate(p_mentor_id uuid, p_course_id uuid, p_note text)
returns table (serial text, already_issued boolean)
language plpgsql
security definer
as $$
-- Lihat bugfix 016: nama parameter output "serial" bertabrakan dengan
-- kolom certificates.serial (Postgres error 42702). Direktif di bawah
-- memaksa semua referensi ambigu di fungsi ini dibaca sebagai KOLOM.
#variable_conflict use_column
declare
  v_caller uuid := auth.uid();
  v_role text;
  v_existing record;
  v_seq int;
  v_serial text;
  v_year text := extract(year from now())::text;
  v_year_int int := extract(year from now())::int;
  -- Tambahan 024 (validasi sertifikat).
  v_token_hash text;
  v_recipient text;
  v_program text;
  v_cert_id uuid;
begin
  if v_caller is null then
    raise exception 'harus login untuk menerbitkan sertifikat mentor';
  end if;
  if not public.is_admin() then
    raise exception 'hanya admin yang dapat menerbitkan sertifikat mentor';
  end if;

  select p.role into v_role from public.profiles p where p.id = p_mentor_id;
  if v_role is null then
    raise exception 'mentor tidak ditemukan';
  end if;
  if v_role <> 'mentor' then
    raise exception 'penerima harus berprofil mentor';
  end if;

  if not exists (
    select 1 from public.courses c
    where c.id = p_course_id and c.mentor_id = p_mentor_id
  ) then
    raise exception 'mentor bukan pengampu course ini';
  end if;

  select c.serial into v_existing
  from public.certificates c
  where c.course_id = p_course_id and c.user_id = p_mentor_id and c.type = 'mentor'
  limit 1;
  if found then
    return query select v_existing.serial, true;
    return;
  end if;

  -- Tambahan 024: token hash + snapshot untuk verifikasi publik.
  v_token_hash := encode(digest(gen_random_bytes(32), 'sha256'), 'hex');
  select p.name into v_recipient from public.profiles p where p.id = p_mentor_id;
  select c.title into v_program from public.courses c where c.id = p_course_id;

  -- Serial unik dengan retry loop (pola yang sama dengan migrasi 016).
  v_serial := null;
  for i in 1..10 loop
    -- Nomor serial monoton dari certificate_serial_counters (bukan
    -- count/MAX atas tabel): nomor yang sudah terbit tidak pernah
    -- dipakai ulang walau baris sertifikatnya dihapus. Setiap percobaan
    -- retry mengambil nomor baru (celah nomor tidak masalah; yang
    -- penting unik).
    insert into public.certificate_serial_counters (prefix, year, last_n)
    values ('SVS-MNT', v_year_int, 1)
    on conflict (prefix, year) do update set last_n = public.certificate_serial_counters.last_n + 1
    returning last_n into v_seq;
    v_serial := 'SVS-MNT-' || v_year || '-' || lpad(v_seq::text, 4, '0');
    insert into public.certificates (user_id, course_id, type, serial, score, note, verification_token_hash, issued_by, recipient_name_snapshot, program_name)
    values (p_mentor_id, p_course_id, 'mentor', v_serial, null, p_note, v_token_hash, v_caller, v_recipient, v_program)
    on conflict on constraint certificates_serial_key do nothing
    returning id into v_cert_id;
    exit when found;
    v_serial := null;
  end loop;
  if v_serial is null then
    raise exception 'gagal membuat nomor serial sertifikat (bentrok berulang)';
  end if;

  perform log_certificate_audit(v_cert_id, 'issue', null, 'valid', 'Sertifikat apresiasi mentor diterbitkan.');
  return query select v_serial, false;
end;
$$;

grant execute on function public.issue_mentor_certificate(uuid, uuid, text) to authenticated;

create or replace function public.issue_academy_certificate(p_user_id uuid)
returns table (serial text, already_issued boolean)
language plpgsql
security definer
as $$
#variable_conflict use_column
declare
  v_caller uuid := auth.uid();
  v_existing record;
  v_count int;
  v_recipient text;
  v_seq int;
  v_serial text;
  v_year text := extract(year from now())::text;
  v_year_int int := extract(year from now())::int;
  v_token_hash text;
  v_cert_id uuid;
begin
  if v_caller is null then
    raise exception 'harus login untuk menerbitkan sertifikat academy';
  end if;
  if not public.is_admin() then
    raise exception 'hanya admin yang dapat menerbitkan sertifikat academy';
  end if;

  select p.name into v_recipient from public.profiles p where p.id = p_user_id;
  if not found then
    raise exception 'siswa tidak ditemukan';
  end if;

  select c.serial into v_existing
  from public.certificates c
  where c.user_id = p_user_id and c.type = 'academy'
  limit 1;
  if found then
    return query select v_existing.serial, true;
    return;
  end if;

  -- Syarat kelulusan Academy: sertifikat course untuk KE-10 course.
  select count(distinct course_id) into v_count
  from public.certificates
  where user_id = p_user_id and type = 'course' and status = 'valid';
  if v_count < 10 then
    raise exception 'siswa baru memegang sertifikat course untuk % dari 10 course', v_count;
  end if;

  v_token_hash := encode(digest(gen_random_bytes(32), 'sha256'), 'hex');
  v_serial := null;
  for i in 1..10 loop
    -- Nomor serial monoton dari certificate_serial_counters (bukan
    -- count/MAX atas tabel): nomor yang sudah terbit tidak pernah
    -- dipakai ulang walau baris sertifikatnya dihapus. Setiap percobaan
    -- retry mengambil nomor baru (celah nomor tidak masalah; yang
    -- penting unik).
    insert into public.certificate_serial_counters (prefix, year, last_n)
    values ('SVS-ACD', v_year_int, 1)
    on conflict (prefix, year) do update set last_n = public.certificate_serial_counters.last_n + 1
    returning last_n into v_seq;
    v_serial := 'SVS-ACD-' || v_year || '-' || lpad(v_seq::text, 4, '0');
    insert into public.certificates (user_id, course_id, type, serial, score, verification_token_hash, issued_by, recipient_name_snapshot, program_name)
    values (p_user_id, null, 'academy', v_serial, null, v_token_hash, v_caller, v_recipient, 'SINEVERSE Academy')
    on conflict on constraint certificates_serial_key do nothing
    returning id into v_cert_id;
    exit when found;
    v_serial := null;
  end loop;
  if v_serial is null then
    raise exception 'gagal membuat nomor serial sertifikat (bentrok berulang)';
  end if;

  perform log_certificate_audit(v_cert_id, 'issue', null, 'valid', 'Sertifikat kelulusan Academy diterbitkan.');
  return query select v_serial, false;
end;
$$;

grant execute on function public.issue_academy_certificate(uuid) to authenticated;

create or replace function public.issue_event_certificate(p_user_id uuid, p_event_id uuid, p_note text)
returns table (serial text, already_issued boolean)
language plpgsql
security definer
as $$
#variable_conflict use_column
declare
  v_caller uuid := auth.uid();
  v_existing record;
  v_recipient text;
  v_program text;
  v_seq int;
  v_serial text;
  v_year text := extract(year from now())::text;
  v_year_int int := extract(year from now())::int;
  v_token_hash text;
  v_cert_id uuid;
begin
  if v_caller is null then
    raise exception 'harus login untuk menerbitkan sertifikat event';
  end if;
  if not public.is_admin() then
    raise exception 'hanya admin yang dapat menerbitkan sertifikat event';
  end if;

  select e.title into v_program from public.events e where e.id = p_event_id;
  if not found then
    raise exception 'event tidak ditemukan';
  end if;
  select p.name into v_recipient from public.profiles p where p.id = p_user_id;
  if not found then
    raise exception 'penerima tidak ditemukan';
  end if;

  -- B9: sertifikat event hanya untuk penerima yang tercatat HADIR
  -- (event_registrations.attended = true) — bukan sekadar terdaftar.
  if not exists (
    select 1 from public.event_registrations
    where event_id = p_event_id and user_id = p_user_id and attended = true
  ) then
    raise exception 'penerima belum tercatat hadir di event ini (event_registrations.attended harus true)';
  end if;

  select c.serial into v_existing
  from public.certificates c
  where c.user_id = p_user_id and c.event_id = p_event_id and c.type = 'event'
  limit 1;
  if found then
    return query select v_existing.serial, true;
    return;
  end if;

  v_token_hash := encode(digest(gen_random_bytes(32), 'sha256'), 'hex');
  v_serial := null;
  for i in 1..10 loop
    -- Nomor serial monoton dari certificate_serial_counters (bukan
    -- count/MAX atas tabel): nomor yang sudah terbit tidak pernah
    -- dipakai ulang walau baris sertifikatnya dihapus. Setiap percobaan
    -- retry mengambil nomor baru (celah nomor tidak masalah; yang
    -- penting unik).
    insert into public.certificate_serial_counters (prefix, year, last_n)
    values ('SVS-EVT', v_year_int, 1)
    on conflict (prefix, year) do update set last_n = public.certificate_serial_counters.last_n + 1
    returning last_n into v_seq;
    v_serial := 'SVS-EVT-' || v_year || '-' || lpad(v_seq::text, 4, '0');
    insert into public.certificates (user_id, course_id, type, serial, score, verification_token_hash, issued_by, recipient_name_snapshot, program_name, event_id, note)
    values (p_user_id, null, 'event', v_serial, null, v_token_hash, v_caller, v_recipient, v_program, p_event_id, p_note)
    on conflict on constraint certificates_serial_key do nothing
    returning id into v_cert_id;
    exit when found;
    v_serial := null;
  end loop;
  if v_serial is null then
    raise exception 'gagal membuat nomor serial sertifikat (bentrok berulang)';
  end if;

  perform log_certificate_audit(v_cert_id, 'issue', null, 'valid', 'Sertifikat event diterbitkan.');
  return query select v_serial, false;
end;
$$;

grant execute on function public.issue_event_certificate(uuid, uuid, text) to authenticated;
