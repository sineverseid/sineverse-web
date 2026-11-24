-- SINEVERSE migration 076 — Notification Center Fase 2: sertifikat ujian.
--
-- Mengubah submit_exam_attempt() agar mengembalikan kolom keempat
-- already_issued boolean (true bila serial diambil dari sertifikat yang
-- sudah ada, false bila sertifikat baru diterbitkan), supaya call site
-- ExamsPage bisa membedakan "baru lulus & sertifikat baru terbit" dari
-- "submit ulang ujian yang sudah lulus" dan tidak mengirim notifikasi
-- sertifikat duplikat.
--
-- CREATE OR REPLACE TIDAK BISA dipakai di sini: tipe return berubah dari
-- 3 kolom menjadi 4 kolom (Postgres menolak "cannot change return type
-- of existing function"), jadi fungsi di-DROP dulu lalu dibuat ulang.
-- DROP juga menghapus GRANT-nya, jadi grant ditulis ulang di bawah.
-- Logika penilaian + penerbitan tidak berubah sama sekali (salinan utuh
-- dari migrasi 025, hanya tambahan v_already_issued).
--
-- Verifikasi setelah apply:
--   select * from submit_exam_attempt('<exam_id>', '{}');
--   -- (sebagai siswa yang sudah lulus) harus mengembalikan
--   -- already_issued = true; percobaan pertama yang lulus = false.

drop function if exists public.submit_exam_attempt(uuid, jsonb);

create or replace function public.submit_exam_attempt(p_exam_id uuid, p_answers jsonb)
returns table (score int, passed boolean, certificate_serial text, already_issued boolean)
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
  v_already_issued boolean := false;
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
    return query select null::int, null::boolean, null::text, false;
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
      v_already_issued := true;
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
  return query select v_score, v_passed, v_serial, v_already_issued;
end;
$$;

grant execute on function public.submit_exam_attempt(uuid, jsonb) to authenticated;
