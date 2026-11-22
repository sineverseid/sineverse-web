-- SINEVERSE migration 033 — afiliasi mentor (opsional).
--
-- Arif, 22 Nov 2026 (opsi 1): mentor boleh mencantumkan sekolah/institusi
-- tempat mengajar atau menempuh pendidikan ("Sekolah/institusi afiliasi")
-- sebagai teks BEBAS — bukan pilihan sekolah referensi, karena institusi
-- mentor sering bukan SMA/SMK (universitas, studio, perusahaan). Kolom
-- affiliation di mentor_applications; saat lamaran disetujui, aplikasi
-- menyalinnya ke profiles.school (lihat decideMentorApplication di
-- src/lib/supabase.ts). Peran mentor tetap diaktifkan trigger 008.
-- Afiliasi kosong (NULL) berarti mentor tidak mencantumkan apa-apa.
--
-- Cara menerapkan: Supabase Dashboard -> SQL Editor -> paste file ini
-- -> Run. TIDAK diterapkan otomatis; parent yang menerapkan.

alter table public.mentor_applications add column if not exists affiliation text;
