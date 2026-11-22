-- SINEVERSE migration 031 — poster acara + avatar komunitas.
--
-- Bagian A — poster acara (Arif, 22 Nov 2026): tiap acara/event memakai
-- foto poster/pamflet dari pembuat acara. Kolom poster_url di events +
-- bucket event-posters. Pola mengikuti migrasi 012 (film-posters):
-- INSERT hanya ke path milik sendiri, SELECT publik, tanpa DELETE
-- (diganti lewat upsert). INSERT memakai own-path — BUKAN admin-only —
-- supaya mentor yang membuat acara internal (diizinkan aplikasi) juga
-- bisa mengunggah posternya; path unggah selalu <user-id>/<timestamp>,
-- jadi setiap unggahan adalah INSERT baru.
--
-- Bagian B — avatar komunitas (Arif, 22 Nov 2026): anggota memakai
-- avatar preset ("preset:<id>") atau foto sendiri (URL publik bucket
-- ini). community_proposals.cover_url menyimpan pilihan avatar pengusul
-- supaya terbawa saat admin "Setujui & Buat". Konvensi "preset:" hanya
-- ada di kode aplikasi (src/lib/communityAvatar.ts), bukan di database.
--
-- Cara menerapkan: Supabase Dashboard -> SQL Editor -> paste file ini
-- -> Run. TIDAK diterapkan otomatis; parent yang menerapkan.

-- =====================================================================
-- Bagian A: poster acara
-- =====================================================================

alter table public.events add column if not exists poster_url text;

insert into storage.buckets (id, name, public)
values ('event-posters', 'event-posters', true)
on conflict (id) do nothing;

-- SELECT: public read (poster tampil di daftar/detail acara, termasuk tamu)
create policy "event_posters_select_public" on storage.objects
for select to anon, authenticated
using (bucket_id = 'event-posters');

-- INSERT: pemilik path saja (admin dan mentor pembuat acara)
create policy "event_posters_insert_own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'event-posters'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- UPDATE: pemilik path (ganti poster via upsert) + admin
create policy "event_posters_update_own" on storage.objects
for update to authenticated
using (
  bucket_id = 'event-posters'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
)
with check (
  bucket_id = 'event-posters'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

-- DELETE: admin only
create policy "event_posters_delete_admin" on storage.objects
for delete to authenticated
using (
  bucket_id = 'event-posters'
  and public.is_admin()
);

-- =====================================================================
-- Bagian B: avatar komunitas
-- =====================================================================

-- Bucket publik
insert into storage.buckets (id, name, public)
values ('community-avatars', 'community-avatars', true)
on conflict (id) do nothing;

-- SELECT: publik (avatar tampil di daftar komunitas, termasuk tamu)
drop policy if exists "community_avatars_select_public" on storage.objects;
create policy "community_avatars_select_public" on storage.objects
for select to anon, authenticated
using (bucket_id = 'community-avatars');

-- INSERT: pengusul/pembuat/admin, hanya ke path miliknya (<user-id>/...)
drop policy if exists "community_avatars_insert_own" on storage.objects;
create policy "community_avatars_insert_own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'community-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- UPDATE: pemilik path (ganti foto via upsert) + admin
drop policy if exists "community_avatars_update_own" on storage.objects;
create policy "community_avatars_update_own" on storage.objects
for update to authenticated
using (
  bucket_id = 'community-avatars'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
)
with check (
  bucket_id = 'community-avatars'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

-- Tanpa policy DELETE (seperti 012): file avatar lama cukup ditimpa upsert.

-- Kolom avatar pada usulan, supaya pilihan pengusul sampai ke admin
-- saat "Setujui & Buat" (kode sudah membacanya secara defensif).
alter table public.community_proposals
add column if not exists cover_url text;
