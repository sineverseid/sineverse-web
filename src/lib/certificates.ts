// SINEVERSE — Sertifikat course (Tahap 5).
// Rumah bersama untuk kelayakan + penerbitan sertifikat course (SVS-CRS).
// Kelayakan dihitung dari data mentah dengan formula 5 komponen yang sama
// dengan GradebookPage / lib/grading.ts — skor tidak pernah dikarang.
// Penerbitan sendiri dilakukan SERVER-SIDE oleh RPC
// issue_course_certificate() (migrasi 016): RPC yang memeriksa pemanggil
// (admin atau mentor course), menghitung ulang nilai akhir, dan hanya
// menerbitkan bila siswa lulus. Catatan: AdminCertificatesPage (Tahap 4,
// frozen) masih membawa salinan sendiri dari perhitungan ini — setelah
// deploy, halaman itu bisa disederhanakan memakai helper di sini.
import {
  avgOrNull,
  bestScoresByQuiz,
  buildGradeComponents,
  discussionParticipationScore,
} from './grading'
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, appBaseUrl } from './supabase'
import type {
  Assignment,
  Certificate,
  CertificateAuditLog,
  Discussion,
  Enrollment,
  GradeComponents,
  Lesson,
  Module,
  Quiz,
  QuizAttempt,
  Submission,
  VerificationResult,
} from './types'

export const DEFAULT_CERT_WEIGHTS = { pretest: 5, posttest: 15, tugasMingguan: 30, tugasAkhir: 40, diskusi: 10 }
export const DEFAULT_CERT_PASSING = 70

export interface CertWeights {
  pretest: number
  posttest: number
  tugasMingguan: number
  tugasAkhir: number
  diskusi: number
}

export interface EligibilityRow {
  userId: string
  components: GradeComponents
  missing: string[]
}

/** Lima komponen nilai satu course untuk satu siswa, dari data mentah. */
export function computeGradeComponents(
  quizzes: Quiz[],
  assignments: Assignment[],
  attempts: QuizAttempt[],
  submissions: Submission[],
  userPosts: Discussion[],
  weights: CertWeights,
  passingGrade: number,
): GradeComponents {
  const best = bestScoresByQuiz(attempts)
  const pretestIds = new Set(quizzes.filter((q) => q.kind === 'pretest').map((q) => q.id))
  const posttestIds = new Set(quizzes.filter((q) => q.kind === 'posttest').map((q) => q.id))
  const pretest = avgOrNull([...best.entries()].filter(([id]) => pretestIds.has(id)).map(([, s]) => s))
  const posttest = avgOrNull([...best.entries()].filter(([id]) => posttestIds.has(id)).map(([, s]) => s))
  const weeklyIds = new Set(assignments.filter((a) => (a.kind ?? 'weekly') === 'weekly').map((a) => a.id))
  const finalIds = new Set(assignments.filter((a) => a.kind === 'final_practice').map((a) => a.id))
  const weeklyAssignments = avgOrNull(
    submissions.filter((s) => weeklyIds.has(s.assignment_id) && s.score !== null).map((s) => s.score as number),
  )
  const finalPractice = avgOrNull(
    submissions.filter((s) => finalIds.has(s.assignment_id) && s.score !== null).map((s) => s.score as number),
  )
  const discussion = discussionParticipationScore(userPosts)
  return buildGradeComponents(
    { pretest, posttest, weeklyAssignments, finalPractice, discussion },
    weights,
    passingGrade,
  )
}

export function missingComponents(c: GradeComponents): string[] {
  const missing: string[] = []
  if (c.pretest === null) missing.push('Pretest')
  if (c.posttest === null) missing.push('Posttest')
  if (c.weeklyAssignments === null) missing.push('Tugas mingguan')
  if (c.finalPractice === null) missing.push('Tugas praktik akhir')
  if (c.discussion === null) missing.push('Diskusi')
  return missing
}

export interface EligibilityResult {
  rows: EligibilityRow[]
  weights: CertWeights
  passingGrade: number
  weightsNote: string
}

/** Kelayakan sertifikat course untuk semua siswa terdaftar di satu course
 *  yang belum punya sertifikat type 'course' di course itu. */
export async function fetchCourseEligibility(courseId: string): Promise<EligibilityResult> {
  let weights: CertWeights = DEFAULT_CERT_WEIGHTS
  let passingGrade = DEFAULT_CERT_PASSING
  let weightsNote = 'fallback (baris RPS SVS-SEM1 tidak ditemukan)'
  // B7 (K13): setiap query di bawah memeriksa error dan melempar — bila
  // satu query gagal (RLS/jaringan), halaman menampilkan error, bukan
  // kelayakan yang salah dari dataset kosong.
  const { data: rpsData, error: rpsErr } = await supabase
    .from('rps')
    .select('weights,passing_grade')
    .eq('code', 'SVS-SEM1')
    .maybeSingle()
  if (rpsErr) throw rpsErr
  const rpsRow = rpsData as unknown as {
    weights?: { pretest: number; posttest: number; tugas_mingguan: number; tugas_akhir: number; diskusi: number }
    passing_grade?: number
  } | null
  if (rpsRow?.weights) {
    // Fallback per kunci (bukan hanya per baris): bila satu kunci hilang
    // dari JSONB, bobot itu memakai default master prompt — tanpa ini
    // bobot undefined akan membuat nilai akhir NaN.
    weights = {
      pretest: rpsRow.weights.pretest ?? DEFAULT_CERT_WEIGHTS.pretest,
      posttest: rpsRow.weights.posttest ?? DEFAULT_CERT_WEIGHTS.posttest,
      tugasMingguan: rpsRow.weights.tugas_mingguan ?? DEFAULT_CERT_WEIGHTS.tugasMingguan,
      tugasAkhir: rpsRow.weights.tugas_akhir ?? DEFAULT_CERT_WEIGHTS.tugasAkhir,
      diskusi: rpsRow.weights.diskusi ?? DEFAULT_CERT_WEIGHTS.diskusi,
    }
    passingGrade = rpsRow.passing_grade ?? DEFAULT_CERT_PASSING
    weightsNote = `RPS SVS-SEM1 (Pretest ${weights.pretest}% · Posttest ${weights.posttest}% · Tugas mingguan ${weights.tugasMingguan}% · Tugas praktik akhir ${weights.tugasAkhir}% · Diskusi ${weights.diskusi}% · Lulus ${passingGrade})`
  }

  const { data: enrData, error: enrErr } = await supabase.from('enrollments').select('*').eq('course_id', courseId)
  if (enrErr) throw enrErr
  const enrRows = (enrData ?? []) as Enrollment[]
  // K12: hanya sertifikat yang masih VALID yang mengecualikan siswa dari
  // kelayakan — sertifikat yang dicabut boleh diterbitkan ulang.
  const { data: certData, error: certErr } = await supabase
    .from('certificates')
    .select('user_id')
    .eq('course_id', courseId)
    .eq('type', 'course')
    .eq('status', 'valid')
  if (certErr) throw certErr
  const certified = new Set(((certData ?? []) as { user_id: string }[]).map((c) => c.user_id))
  const pending = enrRows.filter((e) => !certified.has(e.user_id))
  if (pending.length === 0) return { rows: [], weights, passingGrade, weightsNote }

  const { data: mods, error: modsErr } = await supabase.from('modules').select('id').eq('course_id', courseId)
  if (modsErr) throw modsErr
  const modRows = (mods ?? []) as Module[]
  let lessonRows: Lesson[] = []
  if (modRows.length > 0) {
    const { data: lessons, error: lessonsErr } = await supabase
      .from('lessons')
      .select('id')
      .in('module_id', modRows.map((m) => m.id))
    if (lessonsErr) throw lessonsErr
    lessonRows = (lessons ?? []) as Lesson[]
  }
  const lessonIds = lessonRows.map((l) => l.id)
  const empty = '00000000-0000-0000-0000-000000000000'
  const [quizzes, assignments, discussions] = await Promise.all([
    (async () => {
      if (lessonIds.length === 0) return [] as Quiz[]
      const { data, error } = await supabase.from('quizzes').select('*').in('lesson_id', lessonIds)
      if (error) throw error
      return (data ?? []) as Quiz[]
    })(),
    (async () => {
      if (lessonIds.length === 0) return [] as Assignment[]
      const { data, error } = await supabase.from('assignments').select('*').in('lesson_id', lessonIds)
      if (error) throw error
      return (data ?? []) as Assignment[]
    })(),
    (async () => {
      const { data, error } = await supabase
        .from('discussions')
        .select('id,lesson_id,user_id')
        .in('lesson_id', lessonIds.length > 0 ? lessonIds : [empty])
      if (error) throw error
      return (data ?? []) as Discussion[]
    })(),
  ])
  const quizIds = quizzes.map((q) => q.id)
  const assignmentIds = assignments.map((a) => a.id)
  const [attempts, submissions] = await Promise.all([
    (async () => {
      const { data, error } = await supabase
        .from('quiz_attempts')
        .select('id,quiz_id,user_id,score')
        .in('quiz_id', quizIds.length > 0 ? quizIds : [empty])
      if (error) throw error
      return (data ?? []) as QuizAttempt[]
    })(),
    (async () => {
      const { data, error } = await supabase
        .from('submissions')
        .select('id,assignment_id,user_id,score')
        .in('assignment_id', assignmentIds.length > 0 ? assignmentIds : [empty])
      if (error) throw error
      return (data ?? []) as Submission[]
    })(),
  ])

  const rows: EligibilityRow[] = pending.map((enr) => {
    const components = computeGradeComponents(
      quizzes,
      assignments,
      attempts.filter((a) => a.user_id === enr.user_id),
      submissions.filter((s) => s.user_id === enr.user_id),
      discussions.filter((d) => d.user_id === enr.user_id),
      weights,
      passingGrade,
    )
    return { userId: enr.user_id, components, missing: missingComponents(components) }
  })
  rows.sort((a, b) => b.components.final - a.components.final)
  return { rows, weights, passingGrade, weightsNote }
}

/** Terbitkan sertifikat course via RPC (migrasi 016). RPC menghitung ulang
 *  nilai akhir di server dan menolak bila siswa belum lulus. Bila sertifikat
 *  sudah ada, RPC mengembalikan serial yang sudah ada (alreadyIssued). */
export async function issueCourseCertificate(
  courseId: string,
  userId: string,
): Promise<{ serial: string; score: number; alreadyIssued: boolean }> {
  const { data, error } = await supabase.rpc('issue_course_certificate', {
    p_course_id: courseId,
    p_user_id: userId,
  })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as {
    serial: string
    score: number
    already_issued: boolean
  } | null
  if (!row) throw new Error('RPC issue_course_certificate tidak mengembalikan data.')
  return { serial: row.serial, score: row.score, alreadyIssued: row.already_issued }
}

/** Terbitkan sertifikat apresiasi mentor via RPC (migrasi 023). Hanya admin;
 *  RPC menolak bila penerima bukan mentor atau bukan pengampu course itu.
 *  Bila sertifikat mentor sudah ada untuk (mentor, course), RPC
 *  mengembalikan serial yang sudah ada (alreadyIssued). */
export async function issueMentorCertificate(
  mentorId: string,
  courseId: string,
  note: string | null,
): Promise<{ serial: string; alreadyIssued: boolean }> {
  const { data, error } = await supabase.rpc('issue_mentor_certificate', {
    p_mentor_id: mentorId,
    p_course_id: courseId,
    p_note: note,
  })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as {
    serial: string
    already_issued: boolean
  } | null
  if (!row) throw new Error('RPC issue_mentor_certificate tidak mengembalikan data.')
  return { serial: row.serial, alreadyIssued: row.already_issued }
}

/** Sertifikat course yang sudah terbit untuk satu course (terbaru dulu). */
export async function fetchIssuedCourseCertificates(courseId: string): Promise<Certificate[]> {
  const { data, error } = await supabase
    .from('certificates')
    .select('*')
    .eq('course_id', courseId)
    .eq('type', 'course')
    .order('issued_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Certificate[]
}

// ---------------------------------------------------------------------------
// Sistem Validasi Sertifikat (migrasi 024).
// ---------------------------------------------------------------------------

/** URL verifikasi publik dari hash token. Token mentah tidak pernah
 *  disimpan: yang dibawa URL adalah verification_token_hash itu sendiri
 *  (SHA-256 dari 32 byte acak, 256-bit, tidak bisa ditebak). */
export function verificationLinkForHash(hash: string): string {
  return `${appBaseUrl()}#/sertifikat/verifikasi?token=${hash}`
}

/** URL verifikasi untuk satu sertifikat: token URL bila hash ada,
 *  fallback ke URL serial hanya bila hash belum ada (baris pra-024 yang
 *  belum di-backfill — setelah migrasi 024 semua baris punya hash). */
export function verificationLinkForCert(cert: Certificate): string {
  if (cert.verification_token_hash) return verificationLinkForHash(cert.verification_token_hash)
  return `${appBaseUrl()}#/sertifikat/verifikasi?serial=${cert.serial}`
}

/** Terbitkan sertifikat karya pemenang kompetisi via RPC (migrasi 025).
 *  Hanya admin; RPC menolak bila pemenang belum mengambil course apa pun.
 *  Bila sertifikat karya sudah ada untuk (kompetisi, pemenang), RPC
 *  mengembalikan serial yang sudah ada (alreadyIssued). */
export async function issueWorkCertificate(
  competitionId: string,
  winnerId: string,
  projectId: string | null,
): Promise<{ serial: string; alreadyIssued: boolean }> {
  const { data, error } = await supabase.rpc('issue_work_certificate', {
    p_competition_id: competitionId,
    p_winner_id: winnerId,
    p_project_id: projectId,
  })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as {
    serial: string
    already_issued: boolean
  } | null
  if (!row) throw new Error('RPC issue_work_certificate tidak mengembalikan data.')
  return { serial: row.serial, alreadyIssued: row.already_issued }
}

/**
 * P20 (audit 23 Nov 2026): urai body respons Edge Function dengan aman.
 * Body non-JSON, body bukan JSON (mis. halaman error HTML), atau objek
 * yang bukan hasil verifikasi yang valid ({}, {error: ...}) mengembalikan
 * null — bukan objek kosong yang di-cast sebagai VerificationResult.
 * Status HTTP non-2xx tetap dilempar oleh pemanggil sebelum sampai sini.
 */
async function parseVerificationResponse(res: Response): Promise<VerificationResult | null> {
  const contentType = res.headers.get('content-type') ?? ''
  if (contentType && !contentType.includes('application/json')) return null
  let data: unknown
  try {
    data = await res.json()
  } catch {
    return null
  }
  const row = (Array.isArray(data) ? data[0] : data) as VerificationResult | null | undefined
  if (!row || typeof row !== 'object') return null
  if (typeof row.serial !== 'string' || row.serial === '') return null
  if (row.status !== 'valid' && row.status !== 'revoked' && row.status !== 'inactive') return null
  return row
}

/** Verifikasi publik via Edge Function verify-certificate (bukan RPC
 *  langsung): fungsi ini memanggil RPC verify_certificate_by_token di
 *  server dan menerapkan rate limiting — HTTP 429 berarti terlalu banyak
 *  percobaan. Mengembalikan null bila tidak ditemukan (NOT FOUND).
 *  URL fungsi diturunkan dari SUPABASE_URL yang sudah ada (tidak ada
 *  project ref kedua yang di-hardcode). */
export async function verifyByToken(token: string): Promise<VerificationResult | null> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-certificate`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mode: 'token', value: token.trim() }),
  })
  if (res.status === 429) {
    throw new Error('Terlalu banyak percobaan verifikasi, coba lagi sebentar lagi.')
  }
  if (!res.ok) throw new Error(`Verifikasi gagal (${res.status}).`)
  return parseVerificationResponse(res)
}

/** Verifikasi publik via Edge Function berdasarkan nomor serial
 *  (pencarian manual). Sama seperti verifyByToken: 429 = rate limit. */
export async function verifyBySerial(serial: string): Promise<VerificationResult | null> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-certificate`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mode: 'serial', value: serial.trim().toUpperCase() }),
  })
  if (res.status === 429) {
    throw new Error('Terlalu banyak percobaan verifikasi, coba lagi sebentar lagi.')
  }
  if (!res.ok) throw new Error(`Verifikasi gagal (${res.status}).`)
  return parseVerificationResponse(res)
}

/** Cabut sertifikat (admin). Mengembalikan status baru ('revoked'). */
export async function revokeCertificate(certId: string, reason: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('revoke_certificate', {
    p_cert_id: certId,
    p_reason: reason,
  })
  if (error) throw error
  return (data as string) ?? 'revoked'
}

/** Aktifkan kembali sertifikat yang dicabut (admin). */
export async function reactivateCertificate(certId: string): Promise<string> {
  const { data, error } = await supabase.rpc('reactivate_certificate', {
    p_cert_id: certId,
  })
  if (error) throw error
  return (data as string) ?? 'valid'
}

/** Riwayat perubahan status satu sertifikat (admin; RLS admin-only). */
export async function fetchCertificateAuditLog(certId: string): Promise<CertificateAuditLog[]> {
  const { data, error } = await supabase
    .from('certificate_audit_logs')
    .select('*')
    .eq('certificate_id', certId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as CertificateAuditLog[]
}

/** Terbitkan sertifikat kelulusan Academy via RPC (migrasi 024).
 *  RPC menolak bila siswa belum memegang sertifikat course ke-10 course. */
export async function issueAcademyCertificate(
  userId: string,
): Promise<{ serial: string; alreadyIssued: boolean }> {
  const { data, error } = await supabase.rpc('issue_academy_certificate', {
    p_user_id: userId,
  })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as {
    serial: string
    already_issued: boolean
  } | null
  if (!row) throw new Error('RPC issue_academy_certificate tidak mengembalikan data.')
  return { serial: row.serial, alreadyIssued: row.already_issued }
}

/** Terbitkan sertifikat partisipasi event via RPC (migrasi 024). */
export async function issueEventCertificate(
  userId: string,
  eventId: string,
  note: string | null,
): Promise<{ serial: string; alreadyIssued: boolean }> {
  const { data, error } = await supabase.rpc('issue_event_certificate', {
    p_user_id: userId,
    p_event_id: eventId,
    p_note: note,
  })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as {
    serial: string
    already_issued: boolean
  } | null
  if (!row) throw new Error('RPC issue_event_certificate tidak mengembalikan data.')
  return { serial: row.serial, alreadyIssued: row.already_issued }
}
