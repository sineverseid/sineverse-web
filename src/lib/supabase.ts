// SINEVERSE — Supabase client + typed data helpers.
//
// Project "sineverse" (Singapore). The publishable key below is public by
// design (it is the anon key Supabase issues for client apps). Row Level
// Security in the database is what protects user data — never embed the
// secret / service_role key in this app.
import { createClient } from '@supabase/supabase-js'
import { RPS_COURSE_ORDER } from './brand'
import { isMissingTableError } from './guarded'
import type {
  Assignment,
  Community,
  Course,
  Discussion,
  Enrollment,
  ExamAttempt,
  Lesson,
  LessonProgress,
  LessonResource,
  LibraryItem,
  LiveClass,
  MentorApplication,
  MentorApplicationInput,
  Module,
  Profile,
  Quiz,
  QuizAttempt,
  RefProvince,
  RefRegency,
  School,
  SchoolSubmission,
  Submission,
} from './types'

export const SUPABASE_URL = 'https://twdnlfzorenqitiixher.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_T-qiCuXK5MTb5aiAbZdchg_QwRwA2tf'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // email-confirmation links land back in the app
  },
})

// ---------------------------------------------------------------------------
// Cache baca (in-memory, per sesi) — supaya pindah menu terasa instan.
// ---------------------------------------------------------------------------
// Masalahnya: setiap halaman mengambil data dari server di SETIAP kunjungan,
// jadi setiap pindah menu menunggu jaringan (~1 detik) dan selalu menampilkan
// "Memuat…". Data katalog (course, modul, lesson) hampir tidak pernah berubah
// dan sama untuk semua pengguna, jadi hasil bacanya disimpan di memori dengan
// TTL singkat. Kunjungan ulang dalam TTL langsung tampil tanpa jaringan.
// Data milik pengguna (enrollment, progres, submission, notifikasi) TIDAK
// pernah di-cache — selalu dibaca segar dari server.
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 menit
const readCache = new Map<string, { data: unknown; expiresAt: number }>()

async function cachedRead<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = readCache.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.data as T
  const data = await fetcher()
  // Jangan cache hasil kosong: query katalog yang jalan sebagai anon
  // (sesi Supabase belum pulih saat halaman mount) mengembalikan 0 baris
  // secara diam-diam karena RLS — bukan error. Hasil kosong yang ter-cache
  // akan meracuni katalog selama TTL meski sesi sudah pulih. Kembalikan
  // datanya tanpa menyimpan, supaya percobaan berikutnya memanggil ulang.
  if (Array.isArray(data) && data.length === 0) return data
  readCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
  return data
}

/** Hapus cache katalog — dipanggil setelah course/modul/lesson diubah. */
export function invalidateCatalogCache(): void {
  for (const key of [...readCache.keys()]) {
    if (key.startsWith('catalog:')) readCache.delete(key)
  }
}

/**
 * URL dasar aplikasi (dengan garis miring akhir) untuk pengalihan email
 * autentikasi. Supabase memakai ini sebagai tujuan tautan konfirmasi.
 * Tanpa emailRedirectTo eksplisit, tautan kembali ke origin saja dan
 * kehilangan subpath /sineverse-web/ (atau ke localhost saat
 * pengembangan), sehingga pengguna tidak pernah kembali ke aplikasi.
 * Diturunkan dari URL saat ini agar benar di produksi maupun lokal.
 */
export function appBaseUrl(): string {
  const { origin, pathname } = window.location
  const firstSegment = pathname.split('/').filter(Boolean)[0]
  return firstSegment ? `${origin}/${firstSegment}/` : `${origin}/`
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data as Profile | null
}

export async function updateProfile(
  userId: string,
  patch: Partial<
    Pick<
      Profile,
      | 'name'
      | 'phone'
      | 'city'
      | 'bio'
      | 'birth_date'
      | 'gender'
      | 'address'
      | 'school'
      | 'school_id'
      | 'kelas'
      | 'interests'
      | 'photo_url'
    >
  >,
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select()
    .single()
  if (error) throw error
  return data as Profile
}

// ---------------------------------------------------------------------------
// Courses / modules / lessons
// ---------------------------------------------------------------------------

export async function fetchCourses(): Promise<Course[]> {
  return cachedRead('catalog:courses', async () => {
    const { data, error } = await supabase.from('courses').select('*')
    if (error) throw error
    const rows = (data ?? []) as Course[]
    // Urutan tampil = urutan kurikulum RPS (Semester 1), BUKAN alfabetis.
    // Course seed mengikuti urutan RPS; course baru (di luar seed) tampil
    // setelahnya, diurutkan berdasarkan judul.
    const order = new Map(
      (RPS_COURSE_ORDER as readonly string[]).map((id, i) => [id, i] as const),
    )
    return rows.sort((a, b) => {
      const ia = order.get(a.id)
      const ib = order.get(b.id)
      if (ia !== undefined && ib !== undefined) return ia - ib
      if (ia !== undefined) return -1
      if (ib !== undefined) return 1
      return a.title.localeCompare(b.title, 'id')
    })
  })
}

export async function fetchCourse(id: string): Promise<Course | null> {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data as Course | null
}

export async function fetchMentorName(mentorId: string | null): Promise<string | null> {
  if (!mentorId) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', mentorId)
    .maybeSingle()
  if (error || !data) return null
  return (data as { name: string | null }).name
}

export async function fetchModules(courseId: string): Promise<Module[]> {
  return cachedRead(`catalog:modules:${courseId}`, async () => {
    const { data, error } = await supabase
      .from('modules')
      .select('*')
      .eq('course_id', courseId)
      .order('order_index', { ascending: true })
    if (error) throw error
    return (data ?? []) as Module[]
  })
}

export async function fetchLessons(moduleId: string): Promise<Lesson[]> {
  const { data, error } = await supabase
    .from('lessons')
    .select('*')
    .eq('module_id', moduleId)
    .order('order_index', { ascending: true })
  if (error) throw error
  return (data ?? []) as Lesson[]
}

export async function fetchLesson(id: string): Promise<Lesson | null> {
  const { data, error } = await supabase
    .from('lessons')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data as Lesson | null
}

/** Materi tambahan sebuah lesson (tabel lesson_resources, migrasi 003).
 *  Diurutkan berdasarkan waktu dibuat. Dipakai LessonDetailPage. */
export async function fetchLessonResources(lessonId: string): Promise<LessonResource[]> {
  const { data, error } = await supabase
    .from('lesson_resources')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as LessonResource[]
}

/** Mode akses course (migrasi 013): 'direct' atau 'sequential'.
 *  Mengembalikan course yang sudah diperbarui. */
export async function updateCourseAccessMode(
  courseId: string,
  mode: 'direct' | 'sequential',
): Promise<Course> {
  const { data, error } = await supabase
    .from('courses')
    .update({ access_mode: mode })
    .eq('id', courseId)
    .select()
    .single()
  if (error) throw error
  return data as Course
}

// All lessons of a course, in module/lesson order — used for prev/next nav.
// Satu query untuk semua lesson (bukan satu query per modul), lalu diurutkan
// di JS berdasarkan (urutan modul, urutan lesson) supaya urutannya sama
// seperti sebelumya.
export async function fetchCourseLessons(courseId: string): Promise<Lesson[]> {
  return cachedRead(`catalog:lessons:${courseId}`, async () => {
    const modules = await fetchModules(courseId)
    if (modules.length === 0) return []
    const orderByModule = new Map(modules.map((m) => [m.id, m.order_index]))
    const { data, error } = await supabase
      .from('lessons')
      .select('*')
      .in('module_id', modules.map((m) => m.id))
    if (error) throw error
    const lessons = (data ?? []) as Lesson[]
    return lessons.sort((a, b) => {
      const ma = orderByModule.get(a.module_id) ?? 0
      const mb = orderByModule.get(b.module_id) ?? 0
      if (ma !== mb) return ma - mb
      return (a.order_index ?? 0) - (b.order_index ?? 0)
    })
  })
}

// Daftar Library dan Community juga katalog (berubah jarang, sama untuk
// semua pengguna) — di-cache seperti course, supaya pindah ke menu itu
// langsung tampil tanpa menunggu jaringan.
export async function fetchLibraryItems(): Promise<LibraryItem[]> {
  return cachedRead('catalog:library_items', async () => {
    const { data, error } = await supabase.from('library_items').select('*').order('title')
    if (error) throw error
    return (data ?? []) as LibraryItem[]
  })
}

export async function fetchCommunities(): Promise<Community[]> {
  return cachedRead('catalog:communities', async () => {
    const { data, error } = await supabase.from('communities').select('*')
    if (error) throw error
    return (data ?? []) as Community[]
  })
}

// ---------------------------------------------------------------------------
// Enrollments / progress
// ---------------------------------------------------------------------------

export async function fetchEnrollments(userId: string): Promise<Enrollment[]> {
  const { data, error } = await supabase
    .from('enrollments')
    .select('*')
    .eq('user_id', userId)
    .order('enrolled_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Enrollment[]
}

export async function fetchEnrollment(
  userId: string,
  courseId: string,
): Promise<Enrollment | null> {
  const { data, error } = await supabase
    .from('enrollments')
    .select('*')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle()
  if (error) throw error
  return data as Enrollment | null
}

/**
 * Defense in depth (migrasi 022): admin memantau, bukan peserta — tidak
 * boleh mendaftar course atau mencatat progres belajar. Penegakan
 * sebenarnya ada di RLS; helper ini hanya gagal cepat dengan pesan yang
 * jelas. Bila peran gagal dibaca, biarkan lanjut (fail-open): RLS yang
 * memutuskan, bukan helper ini.
 */
async function assertNotAdmin(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  if (error) return
  if ((data as { role?: string } | null)?.role === 'admin') {
    throw new Error('Admin tidak dapat mengikuti course sebagai peserta.')
  }
}

export async function enrollInCourse(userId: string, courseId: string): Promise<void> {
  // Defense in depth (migrasi 022): admin tidak boleh mengambil course.
  // Penegakan sebenarnya ada di RLS; ini hanya gagal cepat dengan pesan jelas.
  await assertNotAdmin(userId)
  const { error } = await supabase
    .from('enrollments')
    .insert({ user_id: userId, course_id: courseId })
  if (error) throw error
}

export async function fetchLessonProgress(userId: string): Promise<LessonProgress[]> {
  const { data, error } = await supabase
    .from('lesson_progress')
    .select('*')
    .eq('user_id', userId)
  if (error) throw error
  return (data ?? []) as LessonProgress[]
}

export async function fetchLessonProgressFor(
  userId: string,
  lessonId: string,
): Promise<LessonProgress | null> {
  const { data, error } = await supabase
    .from('lesson_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .maybeSingle()
  if (error) throw error
  return data as LessonProgress | null
}

/** Mark a lesson as started (in_progress, records started_at when the column exists). */
export async function markLessonStarted(userId: string, lessonId: string): Promise<void> {
  const existing = await fetchLessonProgressFor(userId, lessonId)
  if (existing && existing.status !== 'not_started') return
  const row: Record<string, unknown> = {
    user_id: userId,
    lesson_id: lessonId,
    status: 'in_progress',
  }
  // started_at is a planned migration-003 column; include it only as an
  // upsert field — if the column does not exist yet the upsert still works
  // because we fall back to a minimal row below on error.
  row['started_at'] = new Date().toISOString()
  const { error } = await supabase
    .from('lesson_progress')
    .upsert(row, { onConflict: 'user_id,lesson_id' })
  if (error) {
    // Column may not exist yet (migration 003 not applied): retry minimal.
    const { error: retryError } = await supabase
      .from('lesson_progress')
      .upsert(
        { user_id: userId, lesson_id: lessonId, status: 'in_progress' },
        { onConflict: 'user_id,lesson_id' },
      )
    if (retryError) throw retryError
  }
}

/** Mark a lesson completed (upsert). */
export async function markLessonCompleted(userId: string, lessonId: string): Promise<void> {
  // Defense in depth (migrasi 022): admin tidak boleh mencatat progres.
  await assertNotAdmin(userId)
  const { error } = await supabase.from('lesson_progress').upsert(
    {
      user_id: userId,
      lesson_id: lessonId,
      status: 'completed',
      completed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,lesson_id' },
  )
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Waitlist (courses without a mentor) — table planned in migration 003.
// Fails gracefully (returns false) when the table does not exist yet.
// ---------------------------------------------------------------------------

export async function joinWaitlist(userId: string, courseId: string): Promise<boolean> {
  const { error } = await supabase
    .from('waitlist')
    .insert({ user_id: userId, course_id: courseId })
  if (error) return false
  return true
}

export async function fetchWaitlistEntry(
  userId: string,
  courseId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('waitlist')
    .select('id')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle()
  if (error) return false
  return data !== null
}

// ---------------------------------------------------------------------------
// Gradebook inputs (read-only here; UI lives in later phases)
// ---------------------------------------------------------------------------

export async function fetchQuizzesForLessons(lessonIds: string[]): Promise<Quiz[]> {
  if (lessonIds.length === 0) return []
  const { data, error } = await supabase
    .from('quizzes')
    .select('*')
    .in('lesson_id', lessonIds)
  if (error) throw error
  return (data ?? []) as Quiz[]
}

export async function fetchQuizAttempts(userId: string): Promise<QuizAttempt[]> {
  const { data, error } = await supabase
    .from('quiz_attempts')
    .select('*')
    .eq('user_id', userId)
  if (error) throw error
  return (data ?? []) as QuizAttempt[]
}

export async function fetchAssignmentsForLessons(
  lessonIds: string[],
): Promise<Assignment[]> {
  if (lessonIds.length === 0) return []
  const { data, error } = await supabase
    .from('assignments')
    .select('*')
    .in('lesson_id', lessonIds)
  if (error) throw error
  return (data ?? []) as Assignment[]
}

export async function fetchSubmissions(userId: string): Promise<Submission[]> {
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('user_id', userId)
  if (error) throw error
  return (data ?? []) as Submission[]
}

// ---------------------------------------------------------------------------
// Rubrik terstruktur + pengiriman multi-file (migrasi 014)
// ---------------------------------------------------------------------------

/** Rubrik sebuah tugas beserta kriterianya, atau null bila belum ada rubrik. */
export async function fetchRubricForAssignment(
  assignmentId: string,
): Promise<RubricWithCriteria | null> {
  const { data, error } = await supabase
    .from('assignment_rubrics')
    .select('*')
    .eq('assignment_id', assignmentId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const rubric = data as AssignmentRubric
  const { data: criteria, error: cErr } = await supabase
    .from('rubric_criteria')
    .select('*')
    .eq('rubric_id', rubric.id)
    .order('order_index', { ascending: true })
  if (cErr) throw cErr
  return { rubric, criteria: (criteria ?? []) as RubricCriterion[] }
}

export interface RubricCriterionInput {
  id?: string
  title: string
  description: string | null
  max_score: number
}

/**
 * Simpan rubrik sebuah tugas: satu baris assignment_rubrics per tugas
 * (upsert), lalu ganti seluruh kriterianya (hapus yang lama, masukkan yang
 * baru sesuai urutan). Kriteria berjudul kosong dibuang.
 * Mengembalikan rubrik + kriteria yang tersimpan.
 */
export async function saveRubric(
  assignmentId: string,
  title: string,
  criteria: RubricCriterionInput[],
): Promise<RubricWithCriteria> {
  const { data, error } = await supabase
    .from('assignment_rubrics')
    .upsert(
      { assignment_id: assignmentId, title: title.trim() || 'Rubrik Penilaian' },
      { onConflict: 'assignment_id' },
    )
    .select()
    .single()
  if (error) throw error
  const rubric = data as AssignmentRubric
  const { error: delErr } = await supabase
    .from('rubric_criteria')
    .delete()
    .eq('rubric_id', rubric.id)
  if (delErr) throw delErr
  const rows = criteria
    .filter((c) => c.title.trim())
    .map((c, i) => ({
      rubric_id: rubric.id,
      title: c.title.trim(),
      description: c.description?.trim() || null,
      max_score: Math.max(1, Math.round(c.max_score)),
      order_index: i,
    }))
  if (rows.length > 0) {
    const { error: insErr } = await supabase.from('rubric_criteria').insert(rows)
    if (insErr) throw insErr
  }
  const saved = await fetchRubricForAssignment(assignmentId)
  if (!saved) throw new Error('Rubrik gagal disimpan.')
  return saved
}

/** Skor per kriteria untuk satu submission (kosong bila belum dinilai). */
export async function fetchRubricScores(submissionId: string): Promise<RubricScore[]> {
  const { data, error } = await supabase
    .from('rubric_scores')
    .select('*')
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as RubricScore[]
}

/** Simpan skor per kriteria (upsert per pasangan submission + kriteria). */
export async function saveRubricScores(
  submissionId: string,
  scores: { criterion_id: string; score: number }[],
): Promise<void> {
  if (scores.length === 0) return
  const { error } = await supabase.from('rubric_scores').upsert(
    scores.map((s) => ({
      submission_id: submissionId,
      criterion_id: s.criterion_id,
      score: s.score,
    })),
    { onConflict: 'submission_id,criterion_id' },
  )
  if (error) throw error
}

/** Semua file lampiran satu submission, diurutkan berdasarkan waktu unggah. */
export async function fetchSubmissionFiles(submissionId: string): Promise<SubmissionFile[]> {
  const { data, error } = await supabase
    .from('submission_files')
    .select('*')
    .eq('submission_id', submissionId)
    .order('uploaded_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as SubmissionFile[]
}

/** Catat file-file yang sudah diunggah ke Storage untuk satu submission. */
export async function addSubmissionFiles(
  submissionId: string,
  files: { file_path: string; file_name: string; file_size: number | null }[],
): Promise<void> {
  if (files.length === 0) return
  const { error } = await supabase
    .from('submission_files')
    .insert(files.map((f) => ({ submission_id: submissionId, ...f })))
  if (error) throw error
}

/** exam_attempts is a planned migration-003 table; empty when absent. */
export async function fetchExamAttempts(userId: string): Promise<ExamAttempt[]> {
  try {
    const { data, error } = await supabase
      .from('exam_attempts')
      .select('*')
      .eq('user_id', userId)
    if (error) return []
    return (data ?? []) as ExamAttempt[]
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Discussions (per lesson)
// ---------------------------------------------------------------------------

export async function fetchDiscussions(lessonId: string): Promise<Discussion[]> {
  const { data, error } = await supabase
    .from('discussions')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('created_at', { ascending: true })
  if (error) throw error
  const rows = (data ?? []) as Discussion[]
  // Attach author names (best effort; RLS may hide other users' profiles).
  const userIds = [...new Set(rows.map((r) => r.user_id))]
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id,name,photo_url')
      .in('id', userIds)
    const byId = new Map(
      ((profiles ?? []) as { id: string; name: string | null; photo_url: string | null }[]).map(
        (p) => [p.id, p],
      ),
    )
    for (const row of rows) {
      const p = byId.get(row.user_id)
      row.author = p ? { name: p.name, photo_url: p.photo_url } : null
    }
  }
  return rows
}

export async function postDiscussion(
  lessonId: string,
  userId: string,
  body: string,
  parentId: string | null,
): Promise<Discussion> {
  const { data, error } = await supabase
    .from('discussions')
    .insert({ lesson_id: lessonId, user_id: userId, body, parent_id: parentId })
    .select()
    .single()
  if (error) throw error
  return data as Discussion
}

// ---------------------------------------------------------------------------
// Fase B–D helpers (migrations 003–008). Each helper throws the raw error;
// pages catch it and use isMissingTableError() to show the honest empty
// state instead of crashing. No helper ever invents rows.
// ---------------------------------------------------------------------------
import type {
  AppNotification,
  AssignmentRubric,
  Certificate,
  CompetencyExam,
  NotificationPrefs,
  QuizQuestion,
  RubricCriterion,
  RubricScore,
  RubricWithCriteria,
  SubmissionFile,
} from './types'

/**
 * Quiz questions for students — ALWAYS via the security-definer RPC, which
 * omits correct_answer. Never select from quiz_questions directly for a
 * student. Returns null when the RPC/table does not exist yet (003).
 */
export async function fetchQuizQuestions(quizId: string): Promise<QuizQuestion[] | null> {
  const { data, error } = await supabase.rpc('get_quiz_questions', { p_quiz_id: quizId })
  if (error) {
    if (isMissingTableError(error)) return null
    throw error
  }
  return (data ?? []) as QuizQuestion[]
}

export async function fetchCompetencyExams(): Promise<CompetencyExam[] | null> {
  const { data, error } = await supabase
    .from('competency_exams')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    if (isMissingTableError(error)) return null
    throw error
  }
  return (data ?? []) as CompetencyExam[]
}

export async function fetchMyCertificates(userId: string): Promise<Certificate[]> {
  const { data, error } = await supabase
    .from('certificates')
    .select('*')
    .eq('user_id', userId)
    .order('issued_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Certificate[]
}

/** Notifications are inserted ONLY through the create_notification() RPC. */
export async function sendNotification(
  userId: string,
  kind: string,
  title: string,
  body?: string | null,
  data?: Record<string, unknown> | null,
): Promise<string | null> {
  const { data: id, error } = await supabase.rpc('create_notification', {
    p_user_id: userId,
    p_kind: kind,
    p_title: title,
    p_body: body ?? null,
    p_data: data ?? null,
  })
  if (error) {
    if (isMissingTableError(error)) return null
    throw error
  }
  return (id as string | null) ?? null
}

export async function fetchNotifications(userId: string): Promise<AppNotification[] | null> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) {
    if (isMissingTableError(error)) return null
    throw error
  }
  return (data ?? []) as AppNotification[]
}

export async function fetchUnreadCount(userId: string): Promise<number | null> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)
  if (error) {
    if (isMissingTableError(error)) return null
    throw error
  }
  return count ?? 0
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id)
  if (error) throw error
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)
  if (error) throw error
}

export async function fetchNotificationPrefs(userId: string): Promise<NotificationPrefs | null> {
  const { data, error } = await supabase
    .from('notification_prefs')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    if (isMissingTableError(error)) return null
    throw error
  }
  return data as NotificationPrefs | null
}

export async function saveNotificationPrefs(
  userId: string,
  patch: { in_app: boolean; categories: Record<string, boolean> },
): Promise<void> {
  const { error } = await supabase
    .from('notification_prefs')
    .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' })
  if (error) throw error
}

/** Public-safe profile fields only — NEVER email (Crew Finder rule).
 * province/regency (kode referensi) ikut dimuat agar Crew Finder bisa
 * difilter berdasarkan lokasi — kode wilayah sudah bersifat publik
 * (kota/regency juga tampil sebagai teks di kartu kru). */
export async function fetchCrewProfiles(): Promise<
  Pick<Profile, 'id' | 'name' | 'photo_url' | 'city' | 'province' | 'regency' | 'bio' | 'skills' | 'interests' | 'availability' | 'is_open_to_crew'>[]
> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,name,photo_url,city,province,regency,bio,skills,interests,availability,is_open_to_crew')
    .eq('is_open_to_crew', true)
  if (error) throw error
  return (data ?? []) as Pick<
    Profile,
    'id' | 'name' | 'photo_url' | 'city' | 'province' | 'regency' | 'bio' | 'skills' | 'interests' | 'availability' | 'is_open_to_crew'
  >[]
}

export async function fetchPublicProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,name,photo_url,city,bio,role,created_at')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data as Profile | null
}

export async function fetchProfileNames(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = [...new Set(userIds.filter(Boolean))]
  if (unique.length === 0) return map
  const { data } = await supabase.from('profiles').select('id,name').in('id', unique)
  for (const row of (data ?? []) as { id: string; name: string | null }[]) {
    map.set(row.id, row.name ?? 'Anggota')
  }
  return map
}

/** Upload a file to a Storage bucket. Returns the public URL, or null when
 *  the bucket does not exist yet (caller shows the honest message). */
export async function uploadToBucket(
  bucket: string,
  path: string,
  file: File,
): Promise<string | null> {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
  if (error) return null
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

export async function updatePhotoUrl(userId: string, photoUrl: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ photo_url: photoUrl }).eq('id', userId)
  if (error) throw error
}

/** Audit log is written only via the log_audit() RPC (security definer). */
export async function logAudit(
  action: string,
  targetType: string,
  targetId: string | null,
  detail?: Record<string, unknown> | null,
): Promise<void> {
  try {
    await supabase.rpc('log_audit', {
      p_action: action,
      p_target_type: targetType,
      p_target_id: targetId,
      p_detail: detail ?? null,
    })
  } catch {
    // Audit is best-effort: never block the admin action itself.
  }
}


// ---------------------------------------------------------------------------
// Tahap 3 — Pretest/Posttest, partisipasi diskusi, Kelas Live (migrasi 015)
// ---------------------------------------------------------------------------

/** Semua diskusi (thread + balasan) di lesson-lesson yang diberikan. */
export async function fetchDiscussionsForLessons(
  lessonIds: string[],
): Promise<Discussion[]> {
  if (lessonIds.length === 0) return []
  const { data, error } = await supabase
    .from('discussions')
    .select('*')
    .in('lesson_id', lessonIds)
  if (error) throw error
  return (data ?? []) as Discussion[]
}

/** Kelas live sebuah course, urut jadwal terdekat dulu. */
export async function fetchLiveClasses(courseId: string): Promise<LiveClass[]> {
  const { data, error } = await supabase
    .from('live_classes')
    .select('*')
    .eq('course_id', courseId)
    .order('scheduled_at', { ascending: true, nullsFirst: false })
  if (error) {
    if (isMissingTableError(error)) return []
    throw error
  }
  return (data ?? []) as LiveClass[]
}

/** Jadwalkan satu kelas live (mentor course / admin). */
export async function createLiveClass(input: {
  courseId: string
  title: string
  scheduledAt: string | null
  meetUrl: string | null
  createdBy: string
}): Promise<LiveClass> {
  const { data, error } = await supabase
    .from('live_classes')
    .insert({
      course_id: input.courseId,
      title: input.title,
      scheduled_at: input.scheduledAt,
      meet_url: input.meetUrl,
      created_by: input.createdBy,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as LiveClass
}

/** Batalkan satu kelas live (mentor course / admin). */
export async function deleteLiveClass(id: string): Promise<void> {
  const { error } = await supabase.from('live_classes').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Pendaftaran Siswa & Mentor (migrasi 027)
// ---------------------------------------------------------------------------

/**
 * Cek apakah username masih tersedia (live check di formulir daftar).
 * Pakai RPC security definer karena RLS profiles tidak mengizinkan anon
 * membaca tabel. Bila migrasi 027 belum diterapkan, anggap tersedia —
 * indeks unik di database tetap jadi pengaman terakhir.
 */
export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const clean = username.trim()
  if (!clean) return false
  const { data, error } = await supabase.rpc('is_username_available', {
    p_username: clean,
  })
  if (error) {
    if (isMissingTableError(error)) return true
    throw error
  }
  return data === true
}

/** Daftar provinsi (referensi, di-cache seperti katalog lain). */
export async function fetchProvinces(): Promise<RefProvince[]> {
  return cachedRead('catalog:provinces', async () => {
    const { data, error } = await supabase
      .from('ref_provinces')
      .select('code,name')
      .order('name')
    if (error) {
      if (isMissingTableError(error)) return []
      throw error
    }
    return (data ?? []) as RefProvince[]
  })
}

/** Daftar kabupaten/kota dalam satu provinsi (referensi, di-cache). */
export async function fetchRegencies(provinceCode: string): Promise<RefRegency[]> {
  if (!provinceCode) return []
  return cachedRead(`catalog:regencies:${provinceCode}`, async () => {
    const { data, error } = await supabase
      .from('ref_regencies')
      .select('code,province_code,name,kind')
      .eq('province_code', provinceCode)
      .order('name')
    if (error) {
      if (isMissingTableError(error)) return []
      throw error
    }
    return (data ?? []) as RefRegency[]
  })
}

/** Peta kode → nama untuk tabel referensi wilayah (untuk tampilan admin). */
export async function fetchRefNameMap(
  table: 'ref_provinces' | 'ref_regencies',
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const { data, error } = await supabase.from(table).select('code,name')
  if (error) return map
  for (const row of (data ?? []) as { code: string; name: string }[]) {
    map.set(row.code, row.name)
  }
  return map
}

/** Cari sekolah terverifikasi berdasarkan nama atau NPSN (untuk daftar).
 * Bila regencyName diisi, pencarian dibatasi ke kabupaten/kota itu
 * (schools.regency menyimpan nama referensi, bukan kode). Dengan wilayah
 * dan query kosong, mengembalikan 20 sekolah pertama di wilayah itu —
 * daftar "sekolah di daerahmu" di formulir pendaftaran. Tanpa wilayah,
 * perilaku lama: butuh minimal 2 huruf. */
export async function searchSchools(query: string, regencyName?: string): Promise<School[]> {
  const q = query.trim()
  if (q.length < 2 && !regencyName) return []
  const like = `%${q.replace(/[%_]/g, '')}%`
  let qb = supabase.from('schools').select('*').eq('is_verified', true)
  if (regencyName) qb = qb.eq('regency', regencyName)
  if (q.length >= 2) qb = qb.or(`name.ilike.${like},npsn.ilike.${like}`)
  const { data, error } = await qb.order('name').limit(20)
  if (error) {
    if (isMissingTableError(error)) return []
    throw error
  }
  return (data ?? []) as School[]
}

/** Ajukan sekolah manual (siswa; status awal pending, ditinjau admin). */
export async function submitSchoolSubmission(input: {
  userId: string
  name: string
  npsn: string | null
  province: string | null
  regency: string | null
}): Promise<SchoolSubmission> {
  const { data, error } = await supabase
    .from('school_submissions')
    .insert({
      user_id: input.userId,
      name: input.name.trim(),
      npsn: input.npsn?.trim() || null,
      province: input.province || null,
      regency: input.regency || null,
      status: 'pending',
    })
    .select('*')
    .single()
  if (error) throw error
  return data as SchoolSubmission
}

/** Semua pengajuan sekolah (admin; pending dulu, lalu terbaru). */
export async function fetchSchoolSubmissions(): Promise<SchoolSubmission[]> {
  const { data, error } = await supabase
    .from('school_submissions')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    if (isMissingTableError(error)) return []
    throw error
  }
  const rows = (data ?? []) as SchoolSubmission[]
  const rank = { pending: 0, approved: 1, rejected: 2 } as const
  return rows.sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9))
}

/**
 * Putuskan pengajuan sekolah (admin).
 * Setujui: pakai sekolah yang cocok bila sudah ada (NPSN sama, atau nama
 * yang sama di provinsi+kabupaten yang sama), kalau tidak ada buat sekolah
 * baru terverifikasi; tautkan pengajuan + profil pengaju ke sekolah itu.
 * Tolak: simpan alasan (decision_note) agar terlihat oleh pengaju.
 * Mengembalikan id sekolah yang ditautkan (atau null bila ditolak).
 */
export async function decideSchoolSubmission(
  submission: SchoolSubmission,
  decision: 'approved' | 'rejected',
  note: string,
  adminId: string,
): Promise<string | null> {
  const now = new Date().toISOString()
  if (decision === 'rejected') {
    const { error } = await supabase
      .from('school_submissions')
      .update({
        status: 'rejected',
        decision_note: note.trim() || null,
        decided_by: adminId,
        decided_at: now,
      })
      .eq('id', submission.id)
    if (error) throw error
    return null
  }

  // Cari sekolah yang cocok dulu — jangan buat duplikat.
  let schoolId: string | null = null
  if (submission.npsn) {
    const { data } = await supabase
      .from('schools')
      .select('id')
      .eq('npsn', submission.npsn)
      .maybeSingle()
    schoolId = (data as { id: string } | null)?.id ?? null
  }
  if (!schoolId) {
    const { data } = await supabase
      .from('schools')
      .select('id')
      .ilike('name', submission.name.trim())
      .eq('province', submission.province)
      .eq('regency', submission.regency)
      .maybeSingle()
    schoolId = (data as { id: string } | null)?.id ?? null
  }
  if (!schoolId) {
    // Nama kabupaten/kota untuk kolom city (teks bebas lama di schools).
    let city: string | null = null
    if (submission.regency) {
      const { data } = await supabase
        .from('ref_regencies')
        .select('name')
        .eq('code', submission.regency)
        .maybeSingle()
      city = (data as { name: string } | null)?.name ?? null
    }
    const { data, error } = await supabase
      .from('schools')
      .insert({
        name: submission.name.trim(),
        npsn: submission.npsn || null,
        province: submission.province,
        regency: submission.regency,
        city,
        is_verified: true,
        created_by: adminId,
      })
      .select('id')
      .single()
    if (error) throw error
    schoolId = (data as { id: string }).id
    invalidateCatalogCache()
  }
  const { error: subErr } = await supabase
    .from('school_submissions')
    .update({
      status: 'approved',
      school_id: schoolId,
      decision_note: note.trim() || null,
      decided_by: adminId,
      decided_at: now,
    })
    .eq('id', submission.id)
  if (subErr) throw subErr
  const { error: profErr } = await supabase
    .from('profiles')
    .update({ school_id: schoolId })
    .eq('id', submission.user_id)
  if (profErr) throw profErr
  return schoolId
}

/** Semua lamaran mentor (admin; semua status, terbaru dulu). */
export async function fetchMentorApplications(): Promise<MentorApplication[]> {
  const { data, error } = await supabase
    .from('mentor_applications')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    if (isMissingTableError(error)) return []
    throw error
  }
  return (data ?? []) as MentorApplication[]
}

/**
 * Putuskan lamaran mentor (admin): Setujui / Tolak / Minta Revisi.
 * Alasan/catatan wajib diisi pemanggil untuk tolak/revisi. Persetujuan
 * mengaktifkan peran mentor lewat trigger database (008) — client tidak
 * pernah mengubah profiles.role sendiri. Persetujuan juga menyalin
 * afiliasi lamaran (migrasi 033) ke profiles.school pelamar bila terisi,
 * supaya tampil di direktori mentor dan profilnya; penyalinan ini
 * best-effort (status lamaran sudah tersimpan — kegagalannya tidak
 * membatalkan persetujuan).
 */
export async function decideMentorApplication(
  app: MentorApplication,
  decision: 'approved' | 'rejected' | 'revision_required',
  note: string,
  adminId: string,
): Promise<void> {
  const { error } = await supabase
    .from('mentor_applications')
    .update({
      status: decision,
      decision_note: note.trim() || null,
      decided_by: adminId,
      decided_at: new Date().toISOString(),
    })
    .eq('id', app.id)
  if (error) throw error
  if (decision === 'approved' && app.affiliation?.trim()) {
    // profiles_admin_all mengizinkan admin mengubah profil pelamar;
    // ini hanya menyentuh kolom school (bukan role — guard 008 tidak
    // terpicu karena role tidak berubah).
    const { error: profErr } = await supabase
      .from('profiles')
      .update({ school: app.affiliation.trim() })
      .eq('id', app.user_id)
    if (profErr) console.warn('Gagal menyalin afiliasi mentor ke profil:', profErr.message)
  }
}

/** Lamaran mentor terbaru milik pengguna (untuk status + ajukan ulang). */
export async function fetchMyMentorApplication(
  userId: string,
): Promise<MentorApplication | null> {
  const { data, error } = await supabase
    .from('mentor_applications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    if (isMissingTableError(error)) return null
    throw error
  }
  return (data ?? null) as MentorApplication | null
}

/**
 * Kirim lamaran mentor (6 info + afiliasi opsional, migrasi 033). Bila ada
 * lamaran 'revision_required', perbarui lamaran itu dan kembalikan ke
 * 'pending' (ajukan ulang); bila ada lamaran 'pending', kembalikan
 * lamaran itu tanpa duplikat.
 */
export async function submitMentorApplication(
  userId: string,
  input: MentorApplicationInput,
): Promise<MentorApplication> {
  const existing = await fetchMyMentorApplication(userId)
  const row = {
    profession: input.profession.trim(),
    expertise: input.expertise,
    experience: input.experience.trim(),
    portfolio_link: input.portfolio_link?.trim() || null,
    affiliation: input.affiliation?.trim() || null,
    reason: input.reason.trim(),
    volunteer_agreed: input.volunteer_agreed,
  }
  if (existing && (existing.status === 'pending' || existing.status === 'approved')) return existing
  if (existing && existing.status === 'revision_required') {
    const { data, error } = await supabase
      .from('mentor_applications')
      .update({
        ...row,
        status: 'pending',
        decision_note: null,
        decided_by: null,
        decided_at: null,
      })
      .eq('id', existing.id)
      .select('*')
      .single()
    if (error) throw error
    return data as MentorApplication
  }
  const { data, error } = await supabase
    .from('mentor_applications')
    .insert({ user_id: userId, ...row, status: 'pending' })
    .select('*')
    .single()
  if (error) throw error
  return data as MentorApplication
}
