-- SINEVERSE migration 032 — alamat sekolah.
--
-- Arif, 22 Nov 2026: tiap sekolah di daftar admin harus menampilkan NPSN
-- dan alamat. Kolom address diisi dari alamat_jalan di sumber referensi
-- yang sama (api-sekolah-indonesia / cermin Dapodik) lewat skrip
-- school-data/load_addresses.py (upsert per NPSN). Alamat kosong
-- (null) berarti sumber tidak menyediakan alamat untuk sekolah itu.
--
-- Cara menerapkan: Supabase Dashboard -> SQL Editor -> paste file ini
-- -> Run. TIDAK diterapkan otomatis; parent yang menerapkan.

alter table public.schools add column if not exists address text;
