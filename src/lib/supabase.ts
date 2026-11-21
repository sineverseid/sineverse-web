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
  Module,
  Profile,
  Quiz,
  QuizAttempt,
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

export async function enrollInCourse(userId: string, courseId: string): Promise<void> {
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
  Certificate,
  CompetencyExam,
  NotificationPrefs,
  QuizQuestion,
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

export async function verifyCertificate(serial: string): Promise<Certificate | null> {
  const { data, error } = await supabase
    .from('certificates')
    .select('*')
    .eq('serial', serial.trim().toUpperCase())
    .maybeSingle()
  if (error) throw error
  return data as Certificate | null
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

/** Public-safe profile fields only — NEVER email (Crew Finder rule). */
export async function fetchCrewProfiles(): Promise<
  Pick<Profile, 'id' | 'name' | 'photo_url' | 'city' | 'bio' | 'skills' | 'interests' | 'availability' | 'is_open_to_crew'>[]
> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,name,photo_url,city,bio,skills,interests,availability,is_open_to_crew')
    .eq('is_open_to_crew', true)
  if (error) throw error
  return (data ?? []) as Pick<
    Profile,
    'id' | 'name' | 'photo_url' | 'city' | 'bio' | 'skills' | 'interests' | 'availability' | 'is_open_to_crew'
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

