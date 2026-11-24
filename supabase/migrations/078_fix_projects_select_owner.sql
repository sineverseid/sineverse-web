-- SINEVERSE migration 078 — Notification Center Fase 3 QA: perbaiki
-- projects_select_visible agar pemilik proyek bisa membuat proyek
-- invite_only/approval lewat UI.
--
-- Akar masalah (matriks T0–T5, 24 Nov 22:08): ProjectsPage.tsx memakai
-- insert(...).select().single() → INSERT ... RETURNING. Baris yang
-- dikembalikan harus lolos SELECT policy projects_select_visible =
-- (access_mode = 'open' OR is_project_member(id)). Untuk 'open' lolos
-- langsung; untuk invite_only, is_project_member(id) men-query tabel
-- projects — baris baru belum tersimpan saat policy dicek, jadi tidak
-- ketemu (anggota ditambahkan setelah proyek terbentuk). Admin lolos
-- lewat policy ALL projects_admin_all. Akibatnya SEMUA mentor/siswa
-- gagal membuat proyek mode invite_only/approval sejak awal.
--
-- Perbaikan: tambah (owner_id = auth.uid()) langsung di USING — cek
-- kolom baris itu sendiri tanpa subquery; semantik sama dengan niat
-- policy lama (pemilik dihitung sebagai anggota via helper).
-- Live seketika, tanpa deploy frontend.
drop policy if exists "projects_select_visible" on public.projects;
create policy "projects_select_visible"
  on public.projects for select to authenticated
  using (access_mode = 'open' or owner_id = auth.uid() or public.is_project_member(id));

-- Verifikasi setelah apply:
--   select policyname, qual from pg_policies
--   where tablename = 'projects' and policyname = 'projects_select_visible';
--   -- qual harus memuat owner_id = auth.uid()
--   -- + uji T1-ulang sebagai Mentor Uji (SET ROLE authenticated + JWT
--   -- db217890-17a8-49ce-9cc7-15d2eb3240c7): insert invite_only
--   -- ... returning id → harus SUKSES (dulu 42501).
