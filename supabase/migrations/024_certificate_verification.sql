-- SINEVERSE — Sistem Validasi Sertifikat Digital (migrasi 024), 22 Nov 2026.
-- Master prompt "SINEVERSE Certificate Verification" (Arif, 22 Nov 11:42).
--
-- KEPUTUSAN DESAIN TOKEN (baca dulu — ini satu-satunya pembacaan yang
-- konsisten dengan master prompt):
-- Tautan verifikasi harus bisa dibuat ulang kapan saja dari data yang
-- tersimpan (QR di kartu "Sertifikat Saya", QR di halaman verifikasi,
-- QR di dalam PNG unduhan). Karena itu URL membawa HASH-nya, bukan
-- token mentah: saat sertifikat diterbitkan, dibuat token acak
-- 32 byte (gen_random_bytes), disimpan HANYA hash SHA-256-nya
-- (verification_token_hash = encode(digest(token, 'sha256'), 'hex'),
-- 64 karakter heksa, entropi 256-bit, tidak bisa ditebak), dan token
-- mentahnya langsung dibuang — tidak pernah disimpan atau ditampilkan.
-- URL verifikasi: ${appBaseUrl()}#/sertifikat/verifikasi?token=<hash>.
-- RPC verify_certificate_by_token() mencocokkan hash itu persis dengan
-- kolom yang tersimpan. "Token" di URL dan di RPC ini ADALAH hash-nya;
-- tidak ada token mentah di mana pun dalam sistem.
--
-- Isi migrasi:
-- (a) kolom baru di certificates: verification_token_hash, status
--     ('valid' | 'revoked' | 'inactive'), revoked_at, revocation_reason,
--     issued_by, recipient_name_snapshot, program_name,
--     achievement_description, event_id, project_id, pdf_storage_path;
--     course_id tidak lagi NOT NULL (sertifikat academy/event tidak
--     punya course); type check diperlebar ke 6 jenis.
-- (b) backfill token hash + snapshot nama/program untuk baris lama.
-- (c) tabel certificate_audit_logs + helper log_certificate_audit().
-- (d) RPC verifikasi publik: verify_certificate_by_token() +
--     verify_certificate_by_serial() (SECURITY DEFINER, hanya kolom
--     yang aman untuk publik; GRANT ke anon + authenticated).
-- (e) RPC admin: revoke_certificate() + reactivate_certificate().
-- (f) RPC penerbitan baru: issue_academy_certificate() (SVS-ACD) +
--     issue_event_certificate() (SVS-EVT).
-- (g) CREATE OR REPLACE issue_course_certificate() (016) +
--     issue_mentor_certificate() (023) dengan logika ASLI yang dipertahankan
--     persis, ditambah: token hash, issued_by, snapshot nama/program,
--     dan baris audit saat penerbitan BARU (bukan saat idempotent return).
-- RLS certificates TIDAK diubah: jalur publik melewati RPC SECURITY
-- DEFINER; tidak ada policy SELECT untuk anon.
-- KETERBATASAN YANG DIKETAHUI: rate limiting sungguhan pada endpoint
-- verifikasi butuh Edge Function — tidak ada throttling sisi klien yang
-- berpura-pura menjadi rate limiting di sini.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- (a) Kolom baru di certificates
-- ---------------------------------------------------------------------------
alter table public.certificates add column if not exists verification_token_hash text;
alter table public.certificates add column if not exists status text not null default 'valid'
  check (status in ('valid', 'revoked', 'inactive'));
alter table public.certificates add column if not exists revoked_at timestamptz;
alter table public.certificates add column if not exists revocation_reason text;
alter table public.certificates add column if not exists issued_by uuid references public.profiles (id) on delete set null;
alter table public.certificates add column if not exists recipient_name_snapshot text;
alter table public.certificates add column if not exists program_name text;
alter table public.certificates add column if not exists achievement_description text;
alter table public.certificates add column if not exists event_id uuid references public.events (id) on delete set null;
alter table public.certificates add column if not exists project_id uuid references public.final_projects (id) on delete set null;
alter table public.certificates add column if not exists pdf_storage_path text;

-- Sertifikat academy/event tidak punya course.
alter table public.certificates alter column course_id drop not null;

-- Jenis sertifikat: course, exam, work, mentor + academy, event.
alter table public.certificates drop constraint if exists certificates_type_check;
alter table public.certificates add constraint certificates_type_check
  check (type in ('course', 'exam', 'work', 'mentor', 'academy', 'event'));

-- ---------------------------------------------------------------------------
-- (b) Backfill baris lama
-- ---------------------------------------------------------------------------
-- Token hash acak untuk setiap baris yang belum punya (lihat keputusan
-- desain di atas: yang disimpan adalah hash SHA-256 dari 32 byte acak).
update public.certificates
set verification_token_hash = encode(digest(gen_random_bytes(32), 'sha256'), 'hex')
where verification_token_hash is null;

-- Snapshot nama penerima + nama program dari join (best-effort; NULL
-- boleh — halaman verifikasi memakai fallback ke tabel profiles/courses).
update public.certificates c
set recipient_name_snapshot = p.name
from public.profiles p
where p.id = c.user_id
  and c.recipient_name_snapshot is null;

update public.certificates c
set program_name = co.title
from public.courses co
where co.id = c.course_id
  and c.program_name is null;

create unique index if not exists certificates_verification_token_hash_key
  on public.certificates (verification_token_hash);
create index if not exists certificates_status_idx
  on public.certificates (status);
create index if not exists certificates_event_id_idx
  on public.certificates (event_id);

-- ---------------------------------------------------------------------------
-- (c) Tabel audit log sertifikat
-- ---------------------------------------------------------------------------
create table if not exists public.certificate_audit_logs (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references public.certificates (id) on delete cascade,
  action text not null,
  performed_by uuid references public.profiles (id) on delete set null,
  previous_status text,
  new_status text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists certificate_audit_logs_certificate_id_idx
  on public.certificate_audit_logs (certificate_id, created_at desc);

alter table public.certificate_audit_logs enable row level security;

drop policy if exists "certificate_audit_logs_admin_all" on public.certificate_audit_logs;
create policy "certificate_audit_logs_admin_all"
  on public.certificate_audit_logs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Helper: catat satu baris audit. SECURITY DEFINER agar bisa dipanggil
-- dari RPC penerbitan/pencabutan (yang juga SECURITY DEFINER); sengaja
-- TIDAK di-grant ke siapa pun — hanya rantai fungsi definer yang boleh
-- memakainya, jadi tidak ada pengguna yang bisa menulis audit palsu.
-- performed_by selalu auth.uid() pemanggil (definer tidak mengubahnya).
create or replace function public.log_certificate_audit(
  p_cert_id uuid, p_action text, p_prev text, p_new text, p_notes text
)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.certificate_audit_logs (certificate_id, action, performed_by, previous_status, new_status, notes)
  values (p_cert_id, p_action, auth.uid(), p_prev, p_new, nullif(btrim(p_notes), ''));
end;
$$;

-- ---------------------------------------------------------------------------
-- (d) RPC verifikasi publik — hanya kolom yang aman untuk publik.
-- SECURITY DEFINER + STABLE; status SELALU dibaca dari database, tidak
-- pernah disimpulkan dari format serial atau isi QR. GRANT ke anon agar
-- pengunjung tanpa akun bisa memverifikasi.
-- Kolom course_id + verification_token_hash ikut dikembalikan (bukan
-- rahasia — hash itu sendiri adalah token di URL): klien membutuhkannya
-- untuk nama mentor dan untuk menggambar QR di pratinjau/unduhan PNG.
-- ---------------------------------------------------------------------------
create or replace function public.verify_certificate_by_token(p_token text)
returns table (
  serial text, type text, status text, issued_at timestamptz,
  revoked_at timestamptz, revocation_reason text, recipient_name text,
  course_id uuid, course_title text, program_name text, score int,
  note text, achievement_description text, event_name text,
  verification_token_hash text
)
language sql
security definer
stable
as $$
  select
    c.serial, c.type, c.status, c.issued_at,
    c.revoked_at, c.revocation_reason,
    coalesce(c.recipient_name_snapshot, p.name) as recipient_name,
    c.course_id, co.title as course_title, c.program_name, c.score,
    c.note, c.achievement_description, e.title as event_name,
    c.verification_token_hash
  from public.certificates c
  left join public.profiles p on p.id = c.user_id
  left join public.courses co on co.id = c.course_id
  left join public.events e on e.id = c.event_id
  where c.verification_token_hash = lower(btrim(p_token));
$$;

grant execute on function public.verify_certificate_by_token(text) to anon, authenticated;

create or replace function public.verify_certificate_by_serial(p_serial text)
returns table (
  serial text, type text, status text, issued_at timestamptz,
  revoked_at timestamptz, revocation_reason text, recipient_name text,
  course_id uuid, course_title text, program_name text, score int,
  note text, achievement_description text, event_name text,
  verification_token_hash text
)
language sql
security definer
stable
as $$
  select
    c.serial, c.type, c.status, c.issued_at,
    c.revoked_at, c.revocation_reason,
    coalesce(c.recipient_name_snapshot, p.name) as recipient_name,
    c.course_id, co.title as course_title, c.program_name, c.score,
    c.note, c.achievement_description, e.title as event_name,
    c.verification_token_hash
  from public.certificates c
  left join public.profiles p on p.id = c.user_id
  left join public.courses co on co.id = c.course_id
  left join public.events e on e.id = c.event_id
  where c.serial = upper(btrim(p_serial));
$$;

grant execute on function public.verify_certificate_by_serial(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- (e) RPC admin: cabut + aktifkan kembali
-- ---------------------------------------------------------------------------
create or replace function public.revoke_certificate(p_cert_id uuid, p_reason text)
returns text
language plpgsql
security definer
as $$
declare
  v_caller uuid := auth.uid();
  v_cert record;
begin
  if v_caller is null then
    raise exception 'harus login untuk mencabut sertifikat';
  end if;
  if not public.is_admin() then
    raise exception 'hanya admin yang dapat mencabut sertifikat';
  end if;
  select c.id, c.status into v_cert from public.certificates c where c.id = p_cert_id;
  if not found then
    raise exception 'sertifikat tidak ditemukan';
  end if;
  if v_cert.status = 'revoked' then
    raise exception 'sertifikat sudah dicabut';
  end if;
  update public.certificates
  set status = 'revoked', revoked_at = now(), revocation_reason = nullif(btrim(p_reason), '')
  where id = p_cert_id;
  perform log_certificate_audit(p_cert_id, 'revoke', v_cert.status, 'revoked', p_reason);
  return 'revoked';
end;
$$;

grant execute on function public.revoke_certificate(uuid, text) to authenticated;

create or replace function public.reactivate_certificate(p_cert_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  v_caller uuid := auth.uid();
  v_cert record;
begin
  if v_caller is null then
    raise exception 'harus login untuk mengaktifkan kembali sertifikat';
  end if;
  if not public.is_admin() then
    raise exception 'hanya admin yang dapat mengaktifkan kembali sertifikat';
  end if;
  select c.id, c.status into v_cert from public.certificates c where c.id = p_cert_id;
  if not found then
    raise exception 'sertifikat tidak ditemukan';
  end if;
  if v_cert.status = 'valid' then
    raise exception 'sertifikat sudah aktif';
  end if;
  update public.certificates
  set status = 'valid', revoked_at = null, revocation_reason = null
  where id = p_cert_id;
  -- Alasan pencabutan lama tetap tersimpan di audit log (baris 'revoke').
  perform log_certificate_audit(p_cert_id, 'reactivate', v_cert.status, 'valid', 'Sertifikat diaktifkan kembali oleh admin.');
  return 'valid';
end;
$$;

grant execute on function public.reactivate_certificate(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- (f) RPC penerbitan baru: Academy (SVS-ACD) + Event (SVS-EVT)
-- Pola serial sama dengan 016/023: hitungan + retry loop 10 percobaan
-- dengan on conflict on constraint certificates_serial_key, dan
-- #variable_conflict use_column karena parameter output bernama "serial".
-- ---------------------------------------------------------------------------
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
  where user_id = p_user_id and type = 'course';
  if v_count < 10 then
    raise exception 'siswa baru memegang sertifikat course untuk % dari 10 course', v_count;
  end if;

  v_token_hash := encode(digest(gen_random_bytes(32), 'sha256'), 'hex');
  select count(*) into v_seq
  from public.certificates
  where public.certificates.type = 'academy'
    and public.certificates.serial like 'SVS-ACD-' || v_year || '-%';
  v_serial := null;
  for i in 1..10 loop
    v_serial := 'SVS-ACD-' || v_year || '-' || lpad((v_seq + i)::text, 4, '0');
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

  select c.serial into v_existing
  from public.certificates c
  where c.user_id = p_user_id and c.event_id = p_event_id and c.type = 'event'
  limit 1;
  if found then
    return query select v_existing.serial, true;
    return;
  end if;

  v_token_hash := encode(digest(gen_random_bytes(32), 'sha256'), 'hex');
  select count(*) into v_seq
  from public.certificates
  where public.certificates.type = 'event'
    and public.certificates.serial like 'SVS-EVT-' || v_year || '-%';
  v_serial := null;
  for i in 1..10 loop
    v_serial := 'SVS-EVT-' || v_year || '-' || lpad((v_seq + i)::text, 4, '0');
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

-- ---------------------------------------------------------------------------
-- (g) CREATE OR REPLACE issue_course_certificate() (migrasi 016) —
-- logika ASLI dipertahankan persis (eligibilitas 5 komponen dihitung
-- ulang di server, ambang lulus dari RPS, idempotent per (course, user)).
-- Tambahan 024: token hash, issued_by, snapshot nama/program, dan baris
-- audit HANYA saat penerbitan baru (bukan saat idempotent return).
-- ---------------------------------------------------------------------------
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
  -- BUGFIX (22 Nov 2026, verifikasi live Tahap 5): kolom "serial" di bawah
  -- ini AMBIGU karena RETURNS TABLE punya parameter output bernama "serial".
  -- Postgres error 42702 membuat RPC gagal di SETIAP penerbitan. Kualifikasi
  -- dengan nama tabel menyelesaikan konflik (juga untuk "type" sekalian).
  select count(*) into v_seq
  from public.certificates
  where public.certificates.type = 'course'
    and public.certificates.serial like 'SVS-CRS-' || v_year || '-%';

  -- Tambahan 024: token hash + snapshot untuk verifikasi publik.
  v_token_hash := encode(digest(gen_random_bytes(32), 'sha256'), 'hex');
  select p.name into v_recipient from public.profiles p where p.id = p_user_id;
  select c.title into v_program from public.courses c where c.id = p_course_id;

  v_serial := null;
  for i in 1..10 loop
    v_serial := 'SVS-CRS-' || v_year || '-' || lpad((v_seq + i)::text, 4, '0');
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

-- ---------------------------------------------------------------------------
-- (g) CREATE OR REPLACE issue_mentor_certificate() (migrasi 023) —
-- logika ASLI dipertahankan persis (admin-only, penerima harus mentor
-- pengampu course, idempotent per (mentor, course)). Tambahan 024:
-- token hash, issued_by, snapshot nama/program, dan baris audit HANYA
-- saat penerbitan baru (bukan saat idempotent return).
-- ---------------------------------------------------------------------------
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
  select count(*) into v_seq
  from public.certificates
  where public.certificates.type = 'mentor'
    and public.certificates.serial like 'SVS-MNT-' || v_year || '-%';
  v_serial := null;
  for i in 1..10 loop
    v_serial := 'SVS-MNT-' || v_year || '-' || lpad((v_seq + i)::text, 4, '0');
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
