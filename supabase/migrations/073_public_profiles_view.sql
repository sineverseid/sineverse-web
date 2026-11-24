-- 073 — Public profiles view (perbaikan privasi, temuan kritis QA Fase 7)
--
-- Temuan: kebijakan SELECT profiles `using (true)` (migrasi 001) membuat
-- pengguna login mana pun bisa membaca SEMUA kolom SEMUA profil lewat REST —
-- termasuk phone, address, email, birth_date. Terbukti live sebagai Siswa Uji.
-- UI tidak pernah menampilkan data itu, tapi API bocor. Perbaikan harus di
-- level database, bukan UI.
--
-- View ini mengekspos hanya 17 kolom aman. Aplikasi membaca profil pengguna
-- lain lewat view ini (21 query dialihkan di frontend, komit terpisah).
-- View berjalan sebagai pemilik (security_invoker = false) supaya pembacaan
-- lewat view tidak tunduk pada RLS profiles yang diperketat di migrasi 074.
-- Tanpa opsi itu, non-admin hanya akan melihat barisnya sendiri lewat view.
--
-- Langkah 1 dari 2 (tanpa downtime): terapkan file ini DULU, lalu deploy
-- frontend yang memakai view, BARU terapkan 074 (pengetatan kebijakan).
-- Menerapkan 074 sebelum frontend dialihkan akan membuat nama pengguna lain
-- hilang diam-diam (RLS mengembalikan []).
--
-- Kolom yang SENGAJA TIDAK ADA di view (sensitif): email, phone,
-- birth_date, gender, address, terms_agreed_at.

create or replace view public.public_profiles
with (security_invoker = false) as
select
  id,
  name,
  role,
  photo_url,
  city,
  province,
  regency,
  school,
  school_id,
  bio,
  skills,
  interests,
  availability,
  is_open_to_crew,
  kelas,
  username,
  created_at
from public.profiles;

revoke all on public.public_profiles from public;
grant select on public.public_profiles to authenticated;
grant select on public.public_profiles to service_role;
