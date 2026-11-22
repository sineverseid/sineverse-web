-- ============================================================================
-- SINEVERSE — Migration 027: Pendaftaran Siswa & Mentor (master prompt
-- "Pendaftaran Siswa dan Mentor", 22 Nov 2026).
--
-- Isi:
--   1. profiles: username (unik, nullable), province, regency, school_id
--      (FK ke schools), terms_agreed_at.
--   2. schools: npsn (unik, nullable), province, regency.
--   3. Tabel referensi wilayah ref_provinces + ref_regencies (baca publik;
--      baris seed-nya di supabase/seed-ref-wilayah.sql, BUKAN di sini).
--   4. Tabel school_submissions (pengajuan sekolah manual, ditinjau admin).
--   5. mentor_applications: profession, reason, volunteer_agreed,
--      decision_note, decided_at; expertise text -> text[]; status
--      diperluas dengan 'revision_required'.
--   6. Hapus policy schools_insert_own (lubang: siapa pun yang login bisa
--      mendaftarkan sekolah sendiri; admin tetap bisa insert lewat
--      schools_admin_all dari migrasi 004).
--   7. profiles.address DIBIARKAN (tidak dikumpulkan lagi di UI saja).
--
-- Keputusan yang dicatat:
--   * Username dicek keunikannya lewat RPC is_username_available()
--     (security definer, untuk anon + authenticated) karena RLS profiles
--     tidak mengizinkan anon membaca tabel. Unik dijamin indeks pada
--     lower(username) — peka huruf tidak dibedakan; NULL boleh banyak.
--   * Trigger handle_new_user (010) TIDAK diubah: kolom baru ditulis oleh
--     completePendingRegistration() setelah pengguna masuk. Username
--     sengaja tidak lewat metadata signup — duplikat di trigger akan
--     menggagalkan seluruh pembuatan akun, sementara lewat patch
--     kegagalan muncul sebagai pesan yang bisa ditampilkan.
--   * TIDAK ada check DB untuk experience (baris lama berisi teks bebas)
--     maupun profiles.kelas (baris lama berisi 'X-2' dsb.); enum hanya
--     ditegakkan di UI.
--   * Status 'inactive' tidak dipakai; 'revision_required' = admin meminta
--     perbaikan/konfirmasi tambahan (master prompt §2).
--   * Promosi mentor tetap lewat trigger promote_mentor_on_approval (008):
--     persetujuan admin mengubah profiles.role; client tidak pernah
--     melakukannya sendiri.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. profiles: kolom pendaftaran baru
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists username text;
alter table public.profiles
  add column if not exists province text;
alter table public.profiles
  add column if not exists regency text;
alter table public.profiles
  add column if not exists school_id uuid references public.schools (id) on delete set null;
alter table public.profiles
  add column if not exists terms_agreed_at timestamptz;

-- Unik tanpa membedakan huruf besar/kecil; baris lama (username NULL)
-- tetap sah karena NULL tidak dianggap duplikat.
create unique index if not exists profiles_username_unique
  on public.profiles (lower(username));

create index if not exists profiles_school_id_idx
  on public.profiles (school_id);

-- ---------------------------------------------------------------------------
-- 2. schools: NPSN + wilayah
-- ---------------------------------------------------------------------------
alter table public.schools
  add column if not exists npsn text;
alter table public.schools
  add column if not exists province text;
alter table public.schools
  add column if not exists regency text;

create unique index if not exists schools_npsn_unique
  on public.schools (npsn);

create index if not exists schools_province_regency_idx
  on public.schools (province, regency);

-- ---------------------------------------------------------------------------
-- 3. Tabel referensi wilayah (baca publik; seed terpisah)
-- ---------------------------------------------------------------------------
create table if not exists public.ref_provinces (
  code text primary key,
  name text not null
);

create table if not exists public.ref_regencies (
  code text primary key,
  province_code text not null references public.ref_provinces (code),
  name text not null,
  kind text not null check (kind in ('kabupaten', 'kota'))
);

create index if not exists ref_regencies_province_code_idx
  on public.ref_regencies (province_code);

alter table public.ref_provinces enable row level security;
alter table public.ref_regencies enable row level security;

-- Referensi wilayah dibaca siapa pun, termasuk halaman daftar yang
-- dibuka sebelum login (provinsi/kabupaten dipilih di formulir).
drop policy if exists "ref_provinces_select_public" on public.ref_provinces;
create policy "ref_provinces_select_public"
  on public.ref_provinces for select to anon, authenticated using (true);

drop policy if exists "ref_regencies_select_public" on public.ref_regencies;
create policy "ref_regencies_select_public"
  on public.ref_regencies for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- 4. school_submissions — sekolah manual yang diajukan siswa, ditinjau admin
-- ---------------------------------------------------------------------------
create table if not exists public.school_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  npsn text,
  province text,
  regency text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  decision_note text,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  school_id uuid references public.schools (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists school_submissions_user_id_idx
  on public.school_submissions (user_id);
create index if not exists school_submissions_status_idx
  on public.school_submissions (status);

alter table public.school_submissions enable row level security;

-- Pengaju melihat pengajuannya sendiri.
drop policy if exists "school_submissions_select_own" on public.school_submissions;
create policy "school_submissions_select_own"
  on public.school_submissions for select to authenticated
  using (user_id = auth.uid());

-- Pengaju mengirim sebagai dirinya sendiri.
drop policy if exists "school_submissions_insert_own" on public.school_submissions;
create policy "school_submissions_insert_own"
  on public.school_submissions for insert to authenticated
  with check (user_id = auth.uid());

-- Admin membaca, memutuskan, dan menautkan sekolah (approve/reject).
drop policy if exists "school_submissions_admin_all" on public.school_submissions;
create policy "school_submissions_admin_all"
  on public.school_submissions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. mentor_applications: kolom baru + expertise text[] + status revisi
-- ---------------------------------------------------------------------------
alter table public.mentor_applications
  add column if not exists profession text;
alter table public.mentor_applications
  add column if not exists reason text;
alter table public.mentor_applications
  add column if not exists volunteer_agreed boolean not null default false;
alter table public.mentor_applications
  add column if not exists decision_note text;
alter table public.mentor_applications
  add column if not exists decided_at timestamptz;

-- expertise: text (satu bidang, teks bebas) -> text[] (multi-pilih).
-- Baris lama: 'Sinematografi' menjadi ARRAY['Sinematografi']; kosong
-- menjadi '{}'. Hanya berjalan bila kolomnya masih text.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'mentor_applications'
      and column_name = 'expertise'
      and data_type = 'text'
  ) then
    alter table public.mentor_applications
      alter column expertise type text[]
      using (
        case
          when expertise is null or btrim(expertise) = '' then '{}'::text[]
          else array[btrim(expertise)]
        end
      );
  end if;
end $$;

-- Status diperluas: 'revision_required' (admin meminta perbaikan).
-- Nama constraint lama adalah nama otomatis dari check inline di 008.
alter table public.mentor_applications
  drop constraint if exists mentor_applications_status_check;
alter table public.mentor_applications
  add constraint mentor_applications_status_check
  check (status in ('pending', 'approved', 'rejected', 'revision_required'));

-- ---------------------------------------------------------------------------
-- 6. Tutup lubang schools_insert_own (004)
--    Verifikasi: tidak ada kode aplikasi yang insert ke schools
--    (grep: hanya seed SQL + policy itu sendiri). Alur baru
--    (decideSchoolSubmission, admin) memakai schools_admin_all.
-- ---------------------------------------------------------------------------
drop policy if exists "schools_insert_own" on public.schools;

-- ---------------------------------------------------------------------------
-- 7. RPC: cek ketersediaan username (untuk halaman daftar, tanpa login).
--    profiles hanya bisa dibaca pengguna terautentikasi (RLS 001), jadi
--    pengecekan live memakai fungsi security definer ini. Mengembalikan
--    true bila username belum dipakai siapa pun (tanpa beda huruf).
-- ---------------------------------------------------------------------------
create or replace function public.is_username_available(p_username text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles
    where username is not null
      and lower(username) = lower(btrim(p_username))
  );
$$;

grant execute on function public.is_username_available(text) to anon, authenticated;

-- ============================================================================
-- Verifikasi setelah Run:
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles'
--   and column_name in ('username','province','regency','school_id',
--                        'terms_agreed_at');
--   select * from public.ref_provinces order by code;  -- 0 baris sebelum seed
--   select count(*) from public.ref_regencies;          -- 0 sebelum seed
--   select conname from pg_constraint
--   where conrelid = 'public.mentor_applications'::regclass
--   and contype = 'c';
--   select policyname from pg_policies
--   where schemaname = 'public' and tablename = 'schools';
--   -- schools_insert_own harus HILANG dari daftar.
--   select public.is_username_available('siswa-uji');
-- Lalu jalankan supabase/seed-ref-wilayah.sql (38 provinsi, 514 kab/kota).
-- ============================================================================
