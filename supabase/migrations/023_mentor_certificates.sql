-- SINEVERSE — Sertifikat Apresiasi Mentor (SVS-MNT), 22 Nov 2026.
-- Jenis sertifikat keempat: penghargaan untuk mentor yang mengampu sebuah
-- course, diterbitkan MANUAL oleh admin dari AdminCertificatesPage.
-- (a) kolom note untuk alasan apresiasi; (b) type check diperlebar;
-- (c) RPC issue_mentor_certificate() mengikuti pola issue_course_certificate
-- (migrasi 016): SECURITY DEFINER, #variable_conflict use_column (parameter
-- output "serial" bertabrakan dengan kolom certificates.serial — lihat
-- bugfix 016), serial SVS-MNT-YYYY-NNNN berbasis hitungan + retry loop
-- 10 percobaan dengan on conflict on constraint certificates_serial_key.
-- Idempotent: bila sertifikat mentor sudah ada untuk (mentor, course),
-- RPC mengembalikan serial yang sudah ada (already_issued true).
-- RLS tidak diubah: sertifikat mentor terlihat oleh mentornya sendiri
-- lewat certificates_select_own (user_id = auth.uid()) dan oleh admin
-- lewat certificates_admin_all; verifikasi serial memakai jalur yang
-- sama dengan jenis sertifikat lain.

alter table public.certificates add column if not exists note text;

alter table public.certificates drop constraint if exists certificates_type_check;
alter table public.certificates add constraint certificates_type_check
  check (type in ('course', 'exam', 'work', 'mentor'));

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

  -- Serial unik dengan retry loop (pola yang sama dengan migrasi 016).
  select count(*) into v_seq
  from public.certificates
  where public.certificates.type = 'mentor'
    and public.certificates.serial like 'SVS-MNT-' || v_year || '-%';
  v_serial := null;
  for i in 1..10 loop
    v_serial := 'SVS-MNT-' || v_year || '-' || lpad((v_seq + i)::text, 4, '0');
    insert into public.certificates (user_id, course_id, type, serial, score, note)
    values (p_mentor_id, p_course_id, 'mentor', v_serial, null, p_note)
    on conflict on constraint certificates_serial_key do nothing;
    exit when found;
    v_serial := null;
  end loop;
  if v_serial is null then
    raise exception 'gagal membuat nomor serial sertifikat (bentrok berulang)';
  end if;

  return query select v_serial, false;
end;
$$;

grant execute on function public.issue_mentor_certificate(uuid, uuid, text) to authenticated;
