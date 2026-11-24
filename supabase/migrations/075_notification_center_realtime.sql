-- SINEVERSE migration 075 — Notification Center: realtime untuk tabel notifications.
--
-- Menambah public.notifications ke publikasi supabase_realtime (pola 060/063,
-- idempotent), supaya lonceng header + halaman Notifikasi bisa berlangganan
-- INSERT tanpa refresh halaman.
--
-- TIDAK ada kolom baru: keputusan Arif 24 Nov 2026 — "Bersihkan" menghapus
-- permanen baris notifikasi milik sendiri (RLS notifications_delete_own dari
-- migrasi 008 sudah mengizinkan), bukan arsip. Tidak ada tabel arsip.
--
-- Verifikasi setelah apply:
--   select * from pg_publication_tables
--   where pubname = 'supabase_realtime' and tablename = 'notifications';

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
