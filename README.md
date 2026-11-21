# SINEVERSE Web

Platform pendidikan filmmaking nasional untuk pelajar SMA/SMK di seluruh Indonesia.
**Your World of Filmmaking.**

Web app statis (Vite + React + TypeScript) untuk GitHub Pages, backend Supabase
(project `sineverse`, Singapore). Fondasi Fase A dari `~/workspace/sineverse-app/REBUILD_PLAN.md`.

## Menjalankan lokal

```bash
npm install
npm run dev      # dev server
npm run build    # build produksi (tsc + vite build) → dist/
npm run preview  # pratinjau hasil build
```

## Yang sudah ada (Fase A — fondasi)

- **Auth**: login email + password (show/hide, pesan error Bahasa Indonesia),
  register (nama/email/password+konfirmasi, min. 6 karakter, pemberitahuan
  konfirmasi email — Supabase "Confirm email" aktif), edit profil
  (nama/telepon/kota/bio), ganti kata sandi. Profil dibuat trigger database,
  bukan dari client.
- **Akademi**: katalog 10 course Semester 1 (data asli Supabase) dengan chip
  kategori + pencarian; detail course (deskripsi, mentor, level, modul+lesson,
  progress %); pendaftaran "Ambil Course" (kode akses case-insensitive bila
  `courses.enrollment_key` terisi; waitlist "Ikuti untuk Bergabung" bila course
  tanpa mentor); lesson WATCH → READ → CHECK → DO dengan embed YouTube/Vimeo,
  prev/next, "Tandai Selesai" (in_progress + started_at, completed), dan
  diskusi lesson (baca + kirim, balasan bersarang via parent_id).
- **Beranda per peran**: course saya, lanjutkan belajar, pengumuman, ringkasan.
- **Gradebook** (`/nilai`): 20% kuis + 50% tugas + 30% ujian, dinormalisasi bila
  komponen kosong, lulus ≥ 70, hanya baris pengguna sendiri.
- **RPS** (`/rps`): read-only RPS SVS-SEM1 (20 minggu, bobot 20/50/30). Bila baris
  `rps` belum ada di database, tampilan 20 minggu disusun dari 10 course live
  dan ditandai dengan jelas.
- **PWA**: manifest SINEVERSE, service worker (auto-update), ikon dari logo asli,
  halaman offline, banner "Pasang Aplikasi" (termasuk panduan iOS).

## Yang BELUM dibangun (fase berikutnya)

Diskusi lengkap + moderasi, UI Tugas/Kuis/Ujian, Community/Projects/Showcase/
Library, Events/Kompetisi/Sertifikat, Mentor Workspace, Admin Panel, upload foto
profil. Lihat `REBUILD_PLAN.md` Fase B–E.

## Deploy

Lihat [DEPLOY.md](./DEPLOY.md). GitHub Pages via Actions; tidak ada secret.

## Brand

Deep Navy `#172438` · Soft White `#F5F7FA` · Film Green `#16865E` ·
Light Grey `#E8EDF3` · Mint `#A3E6C4` · Font: Plus Jakarta Sans (self-hosted
via @fontsource, tanpa Google Fonts).
