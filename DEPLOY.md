# SINEVERSE Web — Deploy ke GitHub Pages

Aplikasi web statis SINEVERSE (Vite + React + TypeScript + Supabase), fondasi Fase A
dari `REBUILD_PLAN.md`. Deploy memakai GitHub Actions — tidak ada server, tidak ada
secret yang perlu disiapkan.

## Yang dibutuhkan

- Akun GitHub Arif (pemilik repo).
- Repo **publik** baru (nama bebas, mis. `sineverse-web`).
- Folder ini (`~/workspace/sineverse-web/`) sebagai isi repo.

## Langkah deploy (sekali saja)

1. **Buat repo publik baru di GitHub**
   - Buka https://github.com/new
   - Repository name: `sineverse-web`
   - Visibility: **Public**
   - Jangan centang "Add a README" / ".gitignore" / license (folder ini sudah lengkap).
   - Klik **Create repository**.

2. **Push folder ini ke repo** (dari terminal, di dalam `~/workspace/sineverse-web/`):

   ```bash
   git init
   git add .
   git commit -m "SINEVERSE web — fondasi Fase A (auth, akademi, gradebook, RPS, PWA)"
   git branch -M main
   git remote add origin https://github.com/<username>/sineverse-web.git
   git push -u origin main
   ```

   Ganti `<username>` dengan username GitHub Arif.

3. **Aktifkan GitHub Pages dengan sumber GitHub Actions**
   - Buka repo → **Settings** → **Pages**.
   - Di "Build and deployment", Source: pilih **GitHub Actions**.
   - Simpan. Workflow `.github/workflows/deploy.yml` akan jalan otomatis setiap push ke `main`.

4. **Buka situsnya**
   - URL: `https://<username>.github.io/sineverse-web/`
   - Tunggu 1–3 menit setelah push pertama; tab **Actions** di repo menunjukkan progres build.

## Deploy ulang

Setiap `git push` ke branch `main` otomatis membangun ulang dan men-deploy versi terbaru.
Tidak ada langkah manual lain.

## Catatan

- **Tidak ada secret di workflow.** Supabase publishable key sudah tertanam di
  `src/lib/supabase.ts` — key itu public by design. Jangan pernah menambahkan
  secret/service_role key ke repo ini.
- Aplikasi memakai `HashRouter` dan Vite `base: './'`, jadi bekerja di subpath
  GitHub Pages apa pun tanpa konfigurasi tambahan.
- Bila build gagal di Actions, lihat log job `build` di tab Actions repo.
