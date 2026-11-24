-- SINEVERSE migration 081 — Notification Center Fase 3 QA: gate prefs
-- harus bisa dibaca lintas pengguna (defek S12a).
--
-- Akar masalah (QA S12a, 24 Nov 22:51): undangan proyek terkirim ke
-- Siswa Uji walau "Komunitas & proyek" OFF (baris prefs tersimpan
-- benar — terverifikasi saat muat ulang). notifyIfAllowed() membaca
-- prefs penerima lewat REST select (fetchNotificationPrefs), tetapi
-- policy notification_prefs_select_own (008) hanya mengizinkan baca
-- baris SENDIRI (+ admin_all). Pengirim non-admin (mentor mengundang,
-- mentor menyetujui, dsb.) mendapat "tidak ada baris" → helper
-- mengembalikan DEFAULT semua-true → gate tidak pernah memblokir.
-- S12b lolos karena pengirimnya ADMIN (admin_all bisa baca baris
-- penerima). Jadi gate prefs hanya bekerja untuk emitter admin
-- (sertifikat) — SEMUA emitter antar-pengguna (undangan, gabung,
-- review/status proyek akhir) buta terhadap prefs penerima.
--
-- Perbaikan: RPC SECURITY DEFINER yang mengembalikan SATU boolean
-- (tanpa membocorkan isi prefs orang lain). Tanpa baris prefs =
-- default aktif (true); in_app false = false; kunci kategori false =
-- false; kunci hilang = true. Frontend notifyIfAllowed() memakai RPC
-- ini (bukan REST select) — perubahan frontend menyusul + deploy.
create or replace function public.prefs_allow_notification(p_user_id uuid, p_key text)
returns boolean
language sql
security definer
stable
as $$
  select coalesce(
    (
      select p.in_app
        and coalesce((p.categories ->> p_key)::boolean, true)
      from public.notification_prefs p
      where p.user_id = p_user_id
    ),
    true
  );
$$;

grant execute on function public.prefs_allow_notification(uuid, text) to authenticated;

-- Verifikasi setelah apply (sebagai Mentor Uji — pembuktian RLS bypass):
--   set role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"db217890-17a8-49ce-9cc7-15d2eb3240c7","role":"authenticated","email":"arifhidayat1732+mentor-uji@gmail.com"}', true);
--   select public.prefs_allow_notification('395e180d-1711-40bf-9266-3665e5b10080', 'komunitas');
--   -- dengan baris prefs Siswa Uji saat ini (semua ON) harus true.
--   -- Uji false: update notification_prefs set categories =
--   -- jsonb_set(categories, '{komunitas}', 'false') where user_id =
--   -- '395e180d-...'; panggil RPC lagi → harus false; lalu kembalikan
--   -- ke true dan panggil lagi → harus true.
