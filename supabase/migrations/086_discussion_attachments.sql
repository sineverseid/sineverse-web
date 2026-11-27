-- SINEVERSE migration 086 — Lampiran gambar/file di postingan diskusi
-- (pilot pola Mentari).
--
-- Latar (Arif, 28 Nov 2026, screenshot Mentari thread "Test: uji coba,
-- analisis umpan balik, dan revisi purwarupa"): postingan pembuka memuat
-- GAMBAR infografik besar inline di dalam kartu (judul → penulis → tanggal
-- → GAMBAR lebar penuh → teks isi → REPLY); balasan menampilkan ikon
-- download — menandakan balasan itu punya lampiran file.
--
-- Pola yang ditiru (ATM): migrasi 062 lesson-resources — bucket PUBLIK +
-- path lesson/<lesson_id>/<user_id>/<uuid>-<nama-file> + kolom file_path.
-- Dipilih pola 062 (bukan pola bucket privat 063 community-post-files)
-- karena discussions memang dibaca semua pengguna login (policy
-- discussions_select_authenticated), jadi bucket publik cocok dengan model
-- bacanya dan gambar bisa tampil inline lewat URL publik tanpa signed URL.
--
-- Satu lampiran per postingan di pilot. Batas ukuran 20 MB (sama dengan
-- batas tugas Mentari) ditegakkan di UI (src/lib/discussionAttachments.ts).
--
-- TIDAK diterapkan ke live sebelum Arif setuju (pilot staged).
-- ---------------------------------------------------------------------------

-- 1. Tabel discussion_attachments.
create table if not exists public.discussion_attachments (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references public.discussions (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes int,
  created_at timestamptz not null default now()
);

create index if not exists discussion_attachments_discussion_id_idx
  on public.discussion_attachments (discussion_id);

alter table public.discussion_attachments enable row level security;

-- 2. Bucket publik discussion-attachments.
insert into storage.buckets (id, name, public)
values ('discussion-attachments', 'discussion-attachments', true)
on conflict (id) do nothing;

-- 3. RLS tabel (cermin discussions: baca semua pengguna login; tulis pemilik
-- postingan induk + admin).
drop policy if exists "discussion_attachments_select_authenticated" on public.discussion_attachments;
create policy "discussion_attachments_select_authenticated"
  on public.discussion_attachments for select to authenticated using (true);

-- Insert: hanya pemilik postingan induk (user_id postingan = auth.uid()).
drop policy if exists "discussion_attachments_insert_owner" on public.discussion_attachments;
create policy "discussion_attachments_insert_owner"
  on public.discussion_attachments for insert to authenticated
  with check (exists (
    select 1 from public.discussions d
    where d.id = discussion_id and d.user_id = auth.uid()
  ));

-- Delete: pemilik postingan induk.
drop policy if exists "discussion_attachments_delete_owner" on public.discussion_attachments;
create policy "discussion_attachments_delete_owner"
  on public.discussion_attachments for delete to authenticated
  using (exists (
    select 1 from public.discussions d
    where d.id = discussion_id and d.user_id = auth.uid()
  ));

drop policy if exists "discussion_attachments_admin_all" on public.discussion_attachments;
create policy "discussion_attachments_admin_all"
  on public.discussion_attachments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 4. Kebijakan storage (pola 062, disesuaikan untuk peserta diskusi).
-- Konvensi path: discussion/<lesson_id>/<user_id>/<uuid>-<nama-file>.
-- foldername(name): [1]='discussion', [2]=lesson_id, [3]=user_id.
-- INSERT: hanya ke folder sendiri, dan hanya bila pengunggah adalah admin,
-- mentor course pemilik lesson, ATAU siswa terdaftar di course itu.
drop policy if exists "discussion_attachments_insert_participant" on storage.objects;
create policy "discussion_attachments_insert_participant"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'discussion-attachments'
    and cardinality(storage.foldername(name)) >= 4
    and (storage.foldername(name))[1] = 'discussion'
    and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (storage.foldername(name))[3] = auth.uid()::text
    and (
      public.is_admin()
      or exists (
        select 1 from public.lessons l
        join public.modules m on m.id = l.module_id
        join public.courses c on c.id = m.course_id
        where l.id = (storage.foldername(name))[2]::uuid
          and (
            c.mentor_id = auth.uid()
            or exists (
              select 1 from public.enrollments e
              where e.course_id = c.id and e.user_id = auth.uid()
            )
          )
      )
    )
  );

-- DELETE: pemilik file, mentor course pemilik lesson, atau admin.
drop policy if exists "discussion_attachments_delete_owner_teacher" on storage.objects;
create policy "discussion_attachments_delete_owner_teacher"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'discussion-attachments'
    and cardinality(storage.foldername(name)) >= 4
    and (storage.foldername(name))[1] = 'discussion'
    and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      (storage.foldername(name))[3] = auth.uid()::text
      or public.is_admin()
      or exists (
        select 1 from public.lessons l
        join public.modules m on m.id = l.module_id
        join public.courses c on c.id = m.course_id
        where l.id = (storage.foldername(name))[2]::uuid
          and c.mentor_id = auth.uid()
      )
    )
  );

-- SELECT: publik (bucket sudah public; kebijakan eksplisit seperti 062).
drop policy if exists "discussion_attachments_select_public" on storage.objects;
create policy "discussion_attachments_select_public"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'discussion-attachments');

-- ---------------------------------------------------------------------------
-- Verifikasi (SQL Editor, JANGAN jalankan blok ini sebagai bagian migrasi):
--   select count(*) from storage.buckets where id = 'discussion-attachments'; -- 1
--   select count(*) from information_schema.tables
--     where table_schema = 'public' and table_name = 'discussion_attachments'; -- 1
--   select policyname from pg_policies where tablename = 'objects'
--     and policyname like 'discussion_attachments_%'; -- 3 baris
-- Rollback:
--   drop policy if exists "discussion_attachments_select_public" on storage.objects;
--   drop policy if exists "discussion_attachments_delete_owner_teacher" on storage.objects;
--   drop policy if exists "discussion_attachments_insert_participant" on storage.objects;
--   delete from storage.buckets where id = 'discussion-attachments';
--   drop table if exists public.discussion_attachments;
-- ---------------------------------------------------------------------------
