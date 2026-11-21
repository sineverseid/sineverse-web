// SINEVERSE — Gradebook Tahap 3: formula nilai akhir master prompt
// (keputusan Arif 21 Nov 23:18, opsi 1) + definisi skor partisipasi diskusi.
//
//   Nilai akhir = Pretest 5% + Posttest 15% + Tugas mingguan 30%
//               + Tugas praktik akhir 40% + Partisipasi diskusi 10%
//   Bobot yang sama ada di GRADEBOOK_WEIGHTS (src/lib/brand.ts) dan di
//   weights baris RPS SVS-SEM1 di DB (migrasi 015). Komponen yang belum
//   ada nilainya (null) dikeluarkan dari perhitungan dan bobot sisanya
//   dinormalisasi ulang secara transparan — skor TIDAK PERNAH dikarang.
//
// Definisi skor partisipasi diskusi (0–100, null bila belum ada aktivitas):
//   - Hitung postingan siswa di lesson-lesson course itu (thread + balasan).
//   - distinctLessons = jumlah lesson berbeda tempat siswa pernah posting.
//   - totalPosts = jumlah total postingan.
//   - skor = min(100, distinctLessons * 10 + totalPosts * 2)
//   Contoh: posting 1x di masing-masing 10 lesson = 100. Posting 1x di
//   5 lesson = 60. Posting 10x di 1 lesson saja = 30. Rumus ini menghargai
//   penyebaran partisipasi di banyak lesson, bukan sekadar spam di satu
//   tempat. Skor 0 tidak pernah diberikan otomatis — siswa yang belum
//   posting sama sekali mendapat null ("belum ada nilai").
import type { GradeComponents } from './types'

export interface GradePart {
  value: number | null
  weight: number
}

/** Rata-rata, atau null bila tidak ada nilai. */
export function avgOrNull(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * Skor terbaik per kuis (satu kuis dihitung sekali — percobaan terbaik).
 * attempts: { quiz_id, score } dari quiz_attempts; skor null diabaikan.
 */
export function bestScoresByQuiz(
  attempts: { quiz_id: string; score: number | null }[],
): Map<string, number> {
  const best = new Map<string, number>()
  for (const a of attempts) {
    if (a.score === null) continue
    const prev = best.get(a.quiz_id)
    if (prev === undefined || a.score > prev) best.set(a.quiz_id, a.score)
  }
  return best
}

/**
 * Skor partisipasi diskusi 0–100, atau null bila siswa belum pernah
 * posting di course ini. Lihat definisi di atas.
 */
export function discussionParticipationScore(
  userPosts: { lesson_id: string }[],
): number | null {
  if (userPosts.length === 0) return null
  const distinctLessons = new Set(userPosts.map((p) => p.lesson_id)).size
  return Math.min(100, distinctLessons * 10 + userPosts.length * 2)
}

/**
 * Nilai akhir dari komponen yang ada (renormalisasi atas bobot komponen
 * yang nilainya tidak null). Mengembalikan 0 bila belum ada komponen
 * apa pun — pemanggil menampilkan "belum ada nilai" dari komponennya.
 */
export function renormalizedFinal(parts: GradePart[]): number {
  const present = parts.filter((p) => p.value !== null)
  const totalWeight = present.reduce((a, p) => a + p.weight, 0)
  if (totalWeight <= 0) return 0
  return present.reduce((a, p) => a + (p.value as number) * p.weight, 0) / totalWeight
}

/** Susun GradeComponents dari lima nilai komponen + ambang lulus. */
export function buildGradeComponents(
  c: Omit<GradeComponents, 'final' | 'passed'>,
  weights: {
    pretest: number
    posttest: number
    tugasMingguan: number
    tugasAkhir: number
    diskusi: number
  },
  passingGrade: number,
): GradeComponents {
  const final = renormalizedFinal([
    { value: c.pretest, weight: weights.pretest },
    { value: c.posttest, weight: weights.posttest },
    { value: c.weeklyAssignments, weight: weights.tugasMingguan },
    { value: c.finalPractice, weight: weights.tugasAkhir },
    { value: c.discussion, weight: weights.diskusi },
  ])
  return { ...c, final: Math.round(final * 10) / 10, passed: final >= passingGrade }
}
