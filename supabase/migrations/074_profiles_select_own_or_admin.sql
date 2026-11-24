-- 074 — Perketat SELECT profiles: baris sendiri atau admin saja
-- (perbaikan privasi, temuan kritis QA Fase 7)
--
-- Menggantikan kebijakan lama `profiles_select_authenticated ... using (true)`
-- (migrasi 001) yang membocorkan semua kolom semua profil ke semua pengguna
-- login. Setelah 073 (view public_profiles) + frontend dialihkan (21 query
-- profil pengguna lain pindah ke view), tabel profiles hanya perlu dibaca:
--   - baris sendiri (fetchProfile select('*'), updateProfile, registrasi)
--   - admin (AdminUsersPage butuh email + phone; dashboard/analitik admin)
-- is_admin() adalah SECURITY DEFINER (001:149-155), jadi tidak ada rekursi
-- RLS di sini.
--
-- JANGAN terapkan file ini sebelum frontend yang memakai view live — query
-- profil pengguna lain yang tertinggal di tabel akan mengembalikan [] diam-diam.
--
-- Kebijakan lain tidak disentuh: profiles_insert_own, profiles_update_own,
-- profiles_admin_all, trigger profiles_role_change_admin_only.

drop policy if exists "profiles_select_authenticated" on public.profiles;

create policy "profiles_select_own_or_admin"
  on public.profiles for select to authenticated
  using (auth.uid() = id or public.is_admin());
