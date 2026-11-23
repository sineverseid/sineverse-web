// SINEVERSE brand constants — single source of truth for colours, type and copy.
// Palette: Deep Navy, Soft White, Film Green, Light Grey, Mint.
export const BRAND = {
  colors: {
    navy: '#172438',
    softWhite: '#F5F7FA',
    filmGreen: '#16865E',
    lightGrey: '#E8EDF3',
    mint: '#A3E6C4',
  },
  name: 'SINEVERSE',
  tagline: 'Your World of Filmmaking',
  slogan: 'Learn. Create. Collaborate.',
  // Versi web publik — mengikuti rilis artefak yang dicerminkan (v1.4,
  // lupa kata sandi, 24 Nov 2026). Satu rilis, dua penyaluran (artefak + web).
  version: 'v1.4',
  versionUpdated: '24 Nov 2026',
  description:
    'Platform pendidikan filmmaking nasional untuk pelajar SMA/SMK di seluruh Indonesia.',
  gradebook: {
    // Tahap 3 (keputusan Arif 21 Nov 23:18, opsi 1): formula master prompt.
    // Sama dengan weights baris RPS SVS-SEM1 di DB (migrasi 015) — keduanya
    // harus selalu sama; GradebookPage membaca konstanta ini.
    pretestWeight: 0.05,
    posttestWeight: 0.15,
    weeklyAssignmentWeight: 0.3,
    finalPracticeWeight: 0.4,
    discussionWeight: 0.1,
    passingGrade: 70,
  },
  rpsCode: 'SVS-SEM1',
} as const

// Urutan kurikulum Semester 1 (RPS SVS-SEM1, 20 minggu, 10 course × 2 minggu).
// Seed UUID course di Supabase dibuat berurutan mengikuti urutan ini, jadi
// urutan ini adalah urutan tampil Akademi — BUKAN alfabetis.
export const RPS_COURSE_ORDER = [
  '10000000-0000-4000-8000-000000000001', // Dasar Sinematografi — Minggu 1–2
  '10000000-0000-4000-8000-000000000002', // Penulisan Skenario — Minggu 3–4
  '10000000-0000-4000-8000-000000000003', // Pembuatan Storyboard — Minggu 5–6
  '10000000-0000-4000-8000-000000000004', // Penyutradaraan — Minggu 7–8
  '10000000-0000-4000-8000-000000000005', // Editing Film — Minggu 9–10
  '10000000-0000-4000-8000-000000000006', // Tata Suara & Musik Film — Minggu 11–12
  '10000000-0000-4000-8000-000000000007', // Film Dokumenter — Minggu 13–14
  '10000000-0000-4000-8000-000000000008', // Mengenal Jobdesk Crew Film — Minggu 15–16
  '10000000-0000-4000-8000-000000000009', // Produksi & Manajemen Film — Minggu 17–18
  '10000000-0000-4000-8000-00000000000a', // Akting untuk Kamera — Minggu 19–20
] as const

// Label minggu RPS untuk satu course, dari posisinya di urutan kurikulum.
// Course di luar urutan seed (mis. dibuat admin belakangan) tidak punya label.
export function rpsWeekLabel(courseId: string): string | null {
  const idx = (RPS_COURSE_ORDER as readonly string[]).indexOf(courseId)
  if (idx === -1) return null
  return `Minggu ${idx * 2 + 1}–${idx * 2 + 2}`
}

// Ilustrasi course menurut urutan RPS (index+1 = nomor file di
// public/illustrations). Dipakai Detail Course dan kartu rekomendasi;
// course di luar urutan seed tidak punya ilustrasi (null) sehingga
// pemanggil memakai ikon default.
export const COURSE_ILLUSTRATIONS = [
  './illustrations/course-01-dasar-sinematografi.jpg',
  './illustrations/course-02-penulisan-skenario.jpg',
  './illustrations/course-03-storyboard.jpg',
  './illustrations/course-04-penyutradaraan.jpg',
  './illustrations/course-05-editing-film.jpg',
  './illustrations/course-06-tata-suara.jpg',
  './illustrations/course-07-film-dokumenter.jpg',
  './illustrations/course-08-jobdesk-crew.jpg',
  './illustrations/course-09-produksi-manajemen.jpg',
  './illustrations/course-10-akting-kamera.jpg',
] as const

export function courseIllustration(courseId: string): string | null {
  const idx = (RPS_COURSE_ORDER as readonly string[]).indexOf(courseId)
  return idx === -1 ? null : COURSE_ILLUSTRATIONS[idx]
}

// Warna sampul film di artefak (satu hue per film). Web publik menurunkan hue
// secara deterministik dari id film, karena tabel films Supabase tidak
// menyimpan kolom hue — sampul tetap berwarna dan konsisten per film.
export const FILM_HUES = ['#3E6AE1', '#0F5C40', '#16865E', '#172438'] as const

export function filmHue(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return FILM_HUES[h % FILM_HUES.length]
}

// Kunci motif sampul course, mengikuti coverKey di artefak SINEVERSE
// (cinematography, screenwriting, directing, editing, sound, documentary;
// course tanpa cover memakai motif default). Dipetakan dari judul course.
export function courseCoverKey(title: string): string {
  const t = title.toLowerCase()
  if (t.includes('sinematografi')) return 'cinematography'
  if (t.includes('skenario')) return 'screenwriting'
  if (t.includes('sutradara') || t.includes('penyutradaraan')) return 'directing'
  if (t.includes('editing')) return 'editing'
  if (t.includes('suara') || t.includes('musik')) return 'sound'
  if (t.includes('dokumenter')) return 'documentary'
  return 'default'
}

// Bobot nilai akhir (Tahap 3, keputusan Arif 21 Nov 23:18, opsi 1 —
// formula master prompt). Sama dengan weights baris RPS SVS-SEM1 di DB
// (migrasi 015); GradebookPage membaca konstanta ini, RpsPage membaca DB.
export const GRADEBOOK_WEIGHTS = {
  pretest: 0.05,
  posttest: 0.15,
  tugasMingguan: 0.3,
  tugasAkhir: 0.4,
  diskusi: 0.1,
} as const

export const PASSING_GRADE = 70
