-- SINEVERSE migration 079 — Notification Center Fase 3 QA: proyek harus
-- terlihat oleh undangan tertunda dan oleh calon peminta gabung.
--
-- Akar masalah (QA S6/S7, 24 Nov 22:28): S5 LOLOS (undangan terkirim,
-- kartu notifikasi muncul), tetapi Siswa Uji membuka #/proyek/<id> dan
-- mendapat "Proyek tidak ditemukan." — baik untuk proyek mode
-- invite_only (P-A, ada undangan pending) maupun mode approval (P-B).
-- Halaman detail memuat proyek lewat select('*') polos
-- (ProjectDetailPage.tsx:195), yang tunduk pada SELECT policy
-- projects_select_visible (pasca-078: open / owner / member). Bukan
-- anggota = tidak ada baris = banner undangan + tombol Terima/Tolak +
-- form "Minta Gabung" tidak pernah tampil. Alur terima/tolak undangan
-- dan minta gabung tidak bisa dijangkau sama sekali.
--
-- Perbaikan: tambah dua cabang ke USING policy SELECT —
-- (a) undangan pending: exists project_invites (project_id, invitee_id
-- = auth.uid(), status = 'pending') — undangan yang sudah diterima
-- tercakup lewat keanggotaan, yang ditolak tidak perlu melihat lagi;
-- (b) mode approval terlihat oleh semua pengguna login — tanpa ini
-- tidak ada yang bisa menemukan proyek untuk meminta gabung (daftar
-- #/proyek memakai policy yang sama; tautan langsung pun gagal).
-- Konten anggota (milestone, file, chat) tetap di balik policy member;
-- yang dibuka hanya baris proyek (judul, deskripsi, pemilik, mode),
-- sama seperti proyek open. Live seketika, tanpa deploy frontend.
drop policy if exists "projects_select_visible" on public.projects;
create policy "projects_select_visible"
  on public.projects for select to authenticated
  using (
    access_mode = 'open'
    or access_mode = 'approval'
    or owner_id = auth.uid()
    or public.is_project_member(id)
    or exists (
      select 1 from public.project_invites
      where project_id = projects.id
        and invitee_id = auth.uid()
        and status = 'pending'
    )
  );

-- Verifikasi setelah apply:
--   select policyname, qual from pg_policies
--   where tablename = 'projects' and policyname = 'projects_select_visible';
--   -- qual harus memuat access_mode = 'approval' dan project_invites
--   -- + uji ulang S6/S7 lewat UI.
