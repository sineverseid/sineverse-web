-- SINEVERSE migration 080 — Notification Center Fase 3 QA: yang diundang
-- harus bisa menerima undangannya sendiri.
--
-- Akar masalah (QA S6, 24 Nov 22:41): S7 LOLOS, 079 memperbaiki
-- visibilitas (banner "Kamu diundang ke proyek ini." tampil + tombol
-- Terima/Tolak), tetapi klik "Terima" gagal 2×: "Gagal menambahkan
-- anggota. Undangan tetap menunggu jawaban." Jalur tolak bekerja, dan
-- persetujuan pemilik (S7) bekerja — hanya sisi invitee yang gagal.
-- Penyebab: handleInviteResponse() (ProjectDetailPage.tsx:419, komentar
-- B48) memasukkan anggota DULU (insert project_members sebagai diri
-- sendiri), baru menandai undangan diterima. Policy
-- project_members_insert_owner_or_open hanya mengizinkan pemilik
-- (is_project_owner) ATAU diri sendiri pada proyek 'open'. Invitee
-- pada proyek invite_only bukan keduanya → insert ditolak 42501.
-- Perbaikan: tambah cabang ketiga — diri sendiri bila punya undangan
-- pending ke proyek itu. Subquery memakai alias + project_members.
-- project_id yang qualified agar tidak ambigu dengan kolom tabel
-- project_invites di scope dalam.
-- Live seketika, tanpa deploy frontend.
drop policy if exists "project_members_insert_owner_or_open" on public.project_members;
create policy "project_members_insert_owner_or_open"
  on public.project_members for insert to authenticated
  with check (
    public.is_project_owner(project_id)
    or (user_id = auth.uid() and exists (
      select 1 from public.projects
      where id = project_id and access_mode = 'open'
    ))
    or (user_id = auth.uid() and exists (
      select 1 from public.project_invites i
      where i.project_id = project_members.project_id
        and i.invitee_id = auth.uid()
        and i.status = 'pending'
    ))
  );

-- Verifikasi setelah apply:
--   select policyname, with_check from pg_policies
--   where tablename = 'project_members'
--     and policyname = 'project_members_insert_owner_or_open';
--   -- with_check harus memuat project_invites + status = 'pending'
--   -- + uji ulang S6 lewat UI (klik Terima sebagai Siswa Uji di P-A).
