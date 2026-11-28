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
  CourseGradeBook,
  Discussion,
  DiscussionAttachment,
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
  Questionnaire,
  QuestionnaireQuestion,
  QuestionnaireResponse,
  Quiz,
  QuizAttempt,
  RefProvince,
  RefRegency,
  Role,
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

/** Jenis kelamin yang diizinkan di profil (P21) — sama dengan pilihan di formulir daftar/edit profil. */
const ALLOWED_GENDERS = ['Laki-laki', 'Perempuan']

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
      | 'province'
      | 'regency'
      | 'kelas'
      | 'interests'
      | 'photo_url'
    >
  >,
): Promise<Profile> {
  // P21 (audit 23 Nov 2026): validasi nilai sebelum tulis — school_id
  // sembarang, birth_date sembarang string, dan gender bebas tidak lagi
  // lolos ke tabel profiles.
  if (patch.birth_date !== undefined && patch.birth_date !== null && patch.birth_date !== '') {
    const raw = patch.birth_date.trim()
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    // Validasi tanggal kalender sungguhan (komponen lokal — JANGAN lewat
    // toISOString, yang menggeser tanggal di zona UTC+7).
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
    const parsed = parts
      ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
      : null
    if (
      !parts ||
      !parsed ||
      parsed.getFullYear() !== Number(parts[1]) ||
      parsed.getMonth() !== Number(parts[2]) - 1 ||
      parsed.getDate() !== Number(parts[3])
    ) {
      throw new Error('Tanggal lahir tidak valid. Gunakan tanggal yang benar (YYYY-MM-DD).')
    }
    if (raw > todayStr) {
      throw new Error('Tanggal lahir tidak boleh di masa depan.')
    }
  }
  if (patch.gender !== undefined && patch.gender !== null && patch.gender !== '') {
    if (!ALLOWED_GENDERS.includes(patch.gender)) {
      throw new Error('Jenis kelamin tidak valid. Pilih "Laki-laki" atau "Perempuan".')
    }
  }
  if (patch.school_id !== undefined && patch.school_id !== null && patch.school_id !== '') {
    const { data: schoolRow, error: schoolErr } = await supabase
      .from('schools')
      .select('id')
      .eq('id', patch.school_id)
      .maybeSingle()
    if (schoolErr) {
      throw new Error('Tidak dapat memeriksa sekolah yang dipilih. Periksa koneksi lalu coba lagi.')
    }
    if (!schoolRow) {
      throw new Error('Sekolah yang dipilih tidak ditemukan. Pilih lagi dari daftar sekolah.')
    }
  }
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

/** Grade Book satu course (D25, migrasi 088, RPC SECURITY DEFINER).
 *  Admin/mentor pengampu mendapat semua peserta; siswa hanya barisnya
 *  sendiri; orang luar course mendapat exception dari RPC. */
export async function fetchCourseGradebook(courseId: string): Promise<CourseGradeBook> {
  const { data, error } = await supabase.rpc('get_course_gradebook', {
    p_course_id: courseId,
  })
  if (error) throw error
  return data as CourseGradeBook
}

/** Ringkasan publik sebuah course untuk TAMU (logout) — K6. RLS courses
 *  hanya mengizinkan SELECT untuk authenticated
 *  (courses_select_authenticated, migrasi 001), begitu pula modules dan
 *  lessons — jadi fetchCourse untuk tamu selalu null dan halaman course
 *  menampilkan "Course tidak ditemukan." RPC get_public_course (migrasi
 *  037, SECURITY DEFINER) hanya mengembalikan kolom publik: tanpa
 *  enrollment_key (kode akses course) dan tanpa video_url / isi lesson.
 *  Mengembalikan null bila course tidak ada. */
export interface PublicCourseData {
  course: Course
  mentor_name: string | null
  modules: (Module & { lessons: Lesson[] })[]
}

export async function fetchPublicCourse(id: string): Promise<PublicCourseData | null> {
  const { data, error } = await supabase.rpc('get_public_course', { p_course_id: id })
  if (error) throw error
  const row = data as {
    course: Record<string, unknown> | null
    mentor_name: string | null
    modules: Record<string, unknown>[]
    lessons: Record<string, unknown>[]
  } | null
  if (!row || !row.course) return null
  const modules = (row.modules ?? []) as unknown as Module[]
  const lessons = (row.lessons ?? []) as unknown as Lesson[]
  const orderByModule = new Map(modules.map((m) => [m.id, m.order_index]))
  const sortedLessons = [...lessons].sort((a, b) => {
    const ma = orderByModule.get(a.module_id) ?? 0
    const mb = orderByModule.get(b.module_id) ?? 0
    if (ma !== mb) return ma - mb
    return (a.order_index ?? 0) - (b.order_index ?? 0)
  })
  return {
    course: row.course as unknown as Course,
    mentor_name: row.mentor_name,
    modules: modules.map((m) => ({
      ...m,
      lessons: sortedLessons.filter((l) => l.module_id === m.id),
    })),
  }
}

export async function fetchMentorName(mentorId: string | null): Promise<string | null> {
  if (!mentorId) return null
  const { data, error } = await supabase
    .from('public_profiles')
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
  // P5: hanya mentor course / admin (RLS courses_update_mentor + admin).
  await assertCourseTeacherOrAdmin(courseId, 'mengubah mode akses course')
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

/** Id pengguna yang sedang masuk, atau null bila belum masuk. */
async function currentUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

/** Peran profil satu pengguna; null bila tidak dapat dibaca (fail-open). */
async function userRole(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  if (error) return null
  return (data as { role?: string } | null)?.role ?? null
}

/**
 * P5 (audit 23 Nov 2026): defense-in-depth — hanya mentor course itu atau
 * admin yang boleh melakukan aksi tulis milik course (mode akses, kelas
 * live, rubrik). Penegakan sebenarnya ada di RLS/RPC; helper ini hanya
 * gagal cepat dengan pesan yang jelas. Fail-open seperti assertNotAdmin:
 * bila course/peran tidak dapat dibaca, biarkan lanjut — RLS yang
 * memutuskan, bukan helper ini.
 */
async function assertCourseTeacherOrAdmin(courseId: string, action: string): Promise<void> {
  const userId = await currentUserId()
  if (!userId) {
    throw new Error(`Kamu harus masuk untuk ${action}.`)
  }
  let course: Course | null
  try {
    course = await fetchCourse(courseId)
  } catch {
    return
  }
  if (!course) return
  if (course.mentor_id !== null && course.mentor_id === userId) return
  const role = await userRole(userId)
  if (role === null) return
  if (role === 'admin') return
  throw new Error(`Hanya mentor course ini atau admin yang dapat ${action}.`)
}

/** Course pemilik sebuah tugas (tugas → lesson → modul → course); null bila rantai tidak terbaca. */
async function courseIdForAssignment(assignmentId: string): Promise<string | null> {
  try {
    const { data: asg, error: aErr } = await supabase
      .from('assignments')
      .select('lesson_id')
      .eq('id', assignmentId)
      .maybeSingle()
    if (aErr || !asg) return null
    const { data: les, error: lErr } = await supabase
      .from('lessons')
      .select('module_id')
      .eq('id', (asg as { lesson_id: string }).lesson_id)
      .maybeSingle()
    if (lErr || !les) return null
    const { data: mod, error: mErr } = await supabase
      .from('modules')
      .select('course_id')
      .eq('id', (les as { module_id: string }).module_id)
      .maybeSingle()
    if (mErr || !mod) return null
    return (mod as { course_id: string }).course_id
  } catch {
    return null
  }
}

export async function enrollInCourse(userId: string, courseId: string): Promise<void> {
  // Defense in depth (migrasi 022): admin tidak boleh mengambil course.
  // Penegakan sebenarnya ada di RLS; ini hanya gagal cepat dengan pesan jelas.
  await assertNotAdmin(userId)
  // B10 (audit 23 Nov 2026): idempotent — sudah terdaftar dianggap sukses,
  // bukan error unique-violation mentah ke UI.
  const existing = await fetchEnrollment(userId, courseId)
  if (existing) return
  // P22 (audit 23 Nov 2026): course tanpa mentor tidak bisa diambil
  // langsung — jalurnya daftar tunggu (joinWaitlist). UI CourseDetailPage
  // sudah menyembunyikan tombol "Ambil Course" untuk course tanpa mentor;
  // ini penegakan di lib bila ada yang memanggil langsung.
  const course = await fetchCourse(courseId)
  if (!course) {
    throw new Error('Course tidak ditemukan.')
  }
  if (course.mentor_id === null) {
    throw new Error(
      'Course ini belum memiliki mentor. Ikuti daftar tunggu — kamu akan diberi tahu saat mentor ditugaskan.',
    )
  }
  const { error } = await supabase
    .from('enrollments')
    .upsert({ user_id: userId, course_id: courseId }, { onConflict: 'user_id,course_id' })
  if (error) {
    // Balapan dengan tab lain: baris sudah masuk duluan.
    if (String(error.message ?? '').toLowerCase().includes('duplicate')) {
      const raced = await fetchEnrollment(userId, courseId)
      if (raced) return
    }
    throw error
  }
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
  // B20 (audit 23 Nov 2026): sama seperti markLessonCompleted — admin
  // tidak boleh mencatat progres (migrasi 022).
  await assertNotAdmin(userId)
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
// P3: kegagalan query dilempar (bukan false) supaya UI tidak menampilkan
// "belum bergabung" padahal hanya query yang gagal; pemanggil menangani
// throw (CourseDetailPage membungkus dengan try/catch, joinWaitlist
// menangkap pra-cek dan mengandalkan hasil insert).
// ---------------------------------------------------------------------------

/**
 * B11 (audit 23 Nov 2026): "sudah bergabung" bukan lagi kegagalan — dicek
 * dulu lewat fetchWaitlistEntry dan dianggap sukses (true); false hanya
 * untuk kegagalan nyata. Tanda tangan boolean dipertahankan supaya pemanggil
 * (CourseDetailPage) tidak berubah.
 */
export async function joinWaitlist(userId: string, courseId: string): Promise<boolean> {
  // P3: fetchWaitlistEntry kini melempar bila query gagal. Kegagalan baca
  // pra-cek di sini bukan alasan menggagalkan gabung — lanjut ke insert
  // dan biarkan hasilnya yang menentukan (duplikat = sudah bergabung).
  let already = false
  try {
    already = await fetchWaitlistEntry(userId, courseId)
  } catch {
    already = false
  }
  if (already) return true
  const { error } = await supabase
    .from('waitlist')
    .insert({ user_id: userId, course_id: courseId })
  if (error) {
    // Balapan dengan tab lain: baris sudah masuk duluan.
    if (String(error.message ?? '').toLowerCase().includes('duplicate')) {
      try {
        if (await fetchWaitlistEntry(userId, courseId)) return true
      } catch {
        // Keanggotaan tidak dapat dikonfirmasi — laporkan gagal secara jujur.
      }
    }
    return false
  }
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
  // P3 (audit 23 Nov 2026): error query dilempar, bukan false — false
  // hanya berarti "tidak ada baris". Pemanggil (CourseDetailPage) sudah
  // membungkus pemanggilan ini dengan try/catch.
  if (error) throw error
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
// Kuesioner evaluasi mentor (migrasi 084, pilot Mentari).
// Pola fetch mengikuti fetchQuizzesForLessons / fetchQuizAttempts di atas.
// Bila migrasi 084 belum dijalankan, pemanggil menangkap
// isMissingTableError dan menampilkan "Belum tersedia".
// ---------------------------------------------------------------------------

/** Kuesioner untuk daftar lesson (satu per lesson). */
export async function fetchQuestionnairesForLessons(
  lessonIds: string[],
): Promise<Questionnaire[]> {
  if (lessonIds.length === 0) return []
  const { data, error } = await supabase
    .from('questionnaires')
    .select('*')
    .in('lesson_id', lessonIds)
  if (error) throw error
  return (data ?? []) as Questionnaire[]
}

/** 10 pernyataan Ya/Tidak satu kuesioner, urut. */
export async function fetchQuestionnaireQuestions(
  questionnaireId: string,
): Promise<QuestionnaireQuestion[]> {
  const { data, error } = await supabase
    .from('questionnaire_questions')
    .select('*')
    .eq('questionnaire_id', questionnaireId)
    .order('order_index', { ascending: true })
  if (error) throw error
  return (data ?? []) as QuestionnaireQuestion[]
}

/** Respons kuesioner milik satu pengguna (0 atau 1 baris per kuesioner). */
export async function fetchQuestionnaireResponses(
  userId: string,
): Promise<QuestionnaireResponse[]> {
  const { data, error } = await supabase
    .from('questionnaire_responses')
    .select('*')
    .eq('user_id', userId)
  if (error) throw error
  return (data ?? []) as QuestionnaireResponse[]
}

/**
 * Kirim satu respons kuesioner. Semua pertanyaan wajib dijawab (10 Ya/Tidak).
 * Satu pengiriman, final — tidak ada update untuk siswa (unique constraint
 * questionnaire_id + user_id menolak kiriman kedua).
 */
export async function submitQuestionnaireResponse(
  questionnaireId: string,
  userId: string,
  answers: Record<string, boolean>,
): Promise<QuestionnaireResponse> {
  const { data, error } = await supabase
    .from('questionnaire_responses')
    .insert({ questionnaire_id: questionnaireId, user_id: userId, answers })
    .select()
    .single()
  if (error) throw error
  return data as QuestionnaireResponse
}

// ---------------------------------------------------------------------------
// Lampiran diskusi (migrasi 086, pilot Mentari).
// Bila migrasi 086 belum dijalankan, kembalikan [] supaya halaman lesson
// tetap tampil tanpa lampiran (bukan error halaman).
// ---------------------------------------------------------------------------

/** Lampiran untuk daftar postingan diskusi (URL publik diisi di sini). */
export async function fetchDiscussionAttachments(
  discussionIds: string[],
): Promise<DiscussionAttachment[]> {
  if (discussionIds.length === 0) return []
  const { data, error } = await supabase
    .from('discussion_attachments')
    .select('*')
    .in('discussion_id', discussionIds)
  if (error) {
    if (isMissingTableError(error)) return []
    throw error
  }
  const rows = (data ?? []) as DiscussionAttachment[]
  for (const row of rows) {
    const { data: urlData } = supabase.storage
      .from('discussion-attachments')
      .getPublicUrl(row.file_path)
    row.url = urlData.publicUrl
  }
  return rows
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
 * B6 (audit 23 Nov 2026): seluruh simpan berjalan dalam SATU transaksi
 * lewat RPC save_rubric (migrasi 039) — bila insert kriteria gagal, rubrik
 * lama tetap utuh. Mengembalikan rubrik + kriteria yang tersimpan.
 */
export async function saveRubric(
  assignmentId: string,
  title: string,
  criteria: RubricCriterionInput[],
): Promise<RubricWithCriteria> {
  // P5: hanya mentor course / admin. RPC save_rubric (migrasi 039) juga
  // menegakkan ini server-side; ini gagal cepat di lib.
  const courseId = await courseIdForAssignment(assignmentId)
  if (courseId) await assertCourseTeacherOrAdmin(courseId, 'menyimpan rubrik')
  const rows = criteria
    .filter((c) => c.title.trim())
    .map((c, i) => ({
      title: c.title.trim(),
      description: c.description?.trim() || null,
      max_score: Math.max(1, Math.round(c.max_score)),
      order_index: i,
    }))
  const { error } = await supabase.rpc('save_rubric', {
    p_assignment_id: assignmentId,
    p_title: title.trim() || 'Rubrik Penilaian',
    p_criteria: rows,
  })
  if (error) throw error
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

/**
 * Simpan skor per kriteria (upsert per pasangan submission + kriteria).
 * B13 (audit 23 Nov 2026): setiap skor divalidasi terhadap kriteria milik
 * rubrik tugas submission ini — criterion_id harus ada di rubrik itu dan
 * 0 <= score <= max_score. Penegakan yang sama ada di DB (trigger migrasi
 * 040); batas atas tidak bisa berupa CHECK karena CHECK tidak boleh membaca
 * tabel lain.
 */
export async function saveRubricScores(
  submissionId: string,
  scores: { criterion_id: string; score: number }[],
): Promise<void> {
  if (scores.length === 0) return
  const { data: subRow, error: subErr } = await supabase
    .from('submissions')
    .select('assignment_id')
    .eq('id', submissionId)
    .maybeSingle()
  if (subErr) throw subErr
  const assignmentId = (subRow as { assignment_id?: string } | null)?.assignment_id
  if (!assignmentId) throw new Error('Submission tidak ditemukan.')
  const rubric = await fetchRubricForAssignment(assignmentId)
  if (!rubric) throw new Error('Tugas ini belum punya rubrik.')
  const maxByCriterion = new Map(
    rubric.criteria.map((c) => [c.id, c.max_score]),
  )
  for (const s of scores) {
    const max = maxByCriterion.get(s.criterion_id)
    if (max === undefined) {
      throw new Error('Kriteria penilaian tidak ditemukan untuk tugas ini.')
    }
    if (
      typeof s.score !== 'number' ||
      !Number.isFinite(s.score) ||
      s.score < 0 ||
      s.score > max
    ) {
      throw new Error(`Skor harus berupa angka 0–${max}.`)
    }
  }
  const { error } = await supabase.from('rubric_scores').upsert(
    scores.map((s) => ({
      submission_id: submissionId,
      criterion_id: s.criterion_id,
      score: Math.round(s.score),
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

/** exam_attempts is a planned migration-003 table; empty when absent.
 *  B8 (K13): HANYA error tabel hilang yang menjadi [] — error lain
 *  (RLS/jaringan) dilempar supaya gradebook/kelayakan tidak menghitung
 *  siswa seolah tidak pernah ujian. */
export async function fetchExamAttempts(userId: string): Promise<ExamAttempt[]> {
  try {
    const { data, error } = await supabase
      .from('exam_attempts')
      .select('*')
      .eq('user_id', userId)
    if (error) {
      if (isMissingTableError(error)) return []
      throw error
    }
    return (data ?? []) as ExamAttempt[]
  } catch (err) {
    if (isMissingTableError(err)) return []
    throw err
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
  // Attach author names. P19 (pola yang sama seperti fetchProfileNames):
  // bila query profil gagal, lempar — bukan author null diam-diam.
  // Pemanggil (LessonDetailPage) sudah try/catch dan menampilkan error.
  const userIds = [...new Set(rows.map((r) => r.user_id))]
  if (userIds.length > 0) {
    // (D26) Role penulis ikut diambil untuk badge peran forum
    // (profiles.role: siswa = "Mahasiswa", mentor = "Dosen", admin = "Admin").
    const { data: profiles, error: profErr } = await supabase
      .from('public_profiles')
      .select('id,name,photo_url,role')
      .in('id', userIds)
    if (profErr) throw profErr
    const byId = new Map(
      ((profiles ?? []) as { id: string; name: string | null; photo_url: string | null; role: string | null }[]).map(
        (p) => [p.id, p],
      ),
    )
    for (const row of rows) {
      const p = byId.get(row.user_id)
      row.author = p ? { name: p.name, photo_url: p.photo_url, role: p.role as Role | null } : null
    }
  }
  return rows
}

/** Panjang maksimum isi diskusi (P4) — body di kolom discussions.body bertipe text tanpa batas DB. */
const DISCUSSION_BODY_MAX_LENGTH = 5000

export async function postDiscussion(
  lessonId: string,
  userId: string,
  body: string,
  parentId: string | null,
): Promise<Discussion> {
  // P4 (audit 23 Nov 2026): tolak body kosong/setelah trim dan batasi
  // panjang — diskusi kosong tidak lagi tersimpan sebagai baris.
  const clean = body.trim()
  if (!clean) {
    throw new Error('Isi diskusi tidak boleh kosong.')
  }
  if (clean.length > DISCUSSION_BODY_MAX_LENGTH) {
    throw new Error(`Isi diskusi terlalu panjang (maksimal ${DISCUSSION_BODY_MAX_LENGTH} karakter).`)
  }
  const { data, error } = await supabase
    .from('discussions')
    .insert({ lesson_id: lessonId, user_id: userId, body: clean, parent_id: parentId })
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

/** Notification Center Fase 2 — helper bersama semua emitter baru:
    kirim notifikasi hanya bila preferensi penerima mengizinkan kategori
    `prefsKey` (dan `in_app` aktif). Tanpa baris prefs = default aktif.
    081: gate dibaca lewat RPC SECURITY DEFINER
    `prefs_allow_notification(user_id, key)` — REST select tidak bisa
    membaca baris prefs orang lain (policy `notification_prefs_select_own`
    hanya baris sendiri + admin), sehingga pengirim non-admin selalu
    mendapat default semua-true dan gate tidak pernah memblokir (defek
    S12a). RPC hanya mengembalikan satu boolean, tanpa membocorkan isi
    prefs. Bila RPC gagal, lewati diam-diam (fail-closed).
    Mengembalikan true bila terkirim, false bila dilewati gate prefs.
    Best-effort di call site: pemanggil memakai
    `void notifyIfAllowed(...).catch(() => undefined)` supaya kegagalan
    kirim tidak pernah memblokir aksi utama atau menampilkan error.
    Peta kunci: sertifikat & proyek akhir → 'nilai'; undangan/gabung
    proyek → 'komunitas'; reminder_final_task → 'nilai'. */
export async function notifyIfAllowed(
  userId: string,
  prefsKey: string,
  kind: string,
  title: string,
  body: string | null,
  data?: Record<string, unknown> | null,
): Promise<boolean> {
  const { data: allowed, error } = await supabase.rpc('prefs_allow_notification', {
    p_user_id: userId,
    p_key: prefsKey,
  })
  if (error) return false
  if (allowed !== true) return false
  await sendNotification(userId, kind, title, body, data)
  return true
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

/** Event yang disiarkan setiap kali notifikasi ditandai dibaca (satu atau
    semua), supaya lonceng header di Layout bisa menyegarkan angka belum
    dibaca tanpa menunggu pindah halaman atau kembali ke foreground. */
export const NOTIFICATIONS_READ_EVENT = 'sineverse:notifications-read'

export function notifyNotificationsRead(): void {
  window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT))
}

export async function markNotificationRead(id: string): Promise<void> {
  // P5: hanya pemilik notifikasi (RLS notifications_update_own). Bila
  // baris tidak terbaca, biarkan lanjut — RLS yang memutuskan.
  const userId = await currentUserId()
  if (userId) {
    const { data, error } = await supabase
      .from('notifications')
      .select('user_id')
      .eq('id', id)
      .maybeSingle()
    if (!error && data && (data as { user_id: string }).user_id !== userId) {
      throw new Error('Notifikasi ini bukan milikmu.')
    }
  }
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

/** Notification Center (Fase 1, 24 Nov 2026) — kategori + "Penting"
    diturunkan dari kind (D2/D3 rencana implementasi); tanpa kolom baru di DB. */
export type NotificationCategory = 'academy' | 'komunitas' | 'proyek' | 'sinebot' | 'sistem' | 'lainnya'

const NOTIFICATION_CATEGORY_MAP: Record<string, NotificationCategory> = {
  assignment: 'academy',
  quiz: 'academy',
  exam: 'academy',
  grade: 'academy',
  revision: 'academy',
  enrollment: 'academy',
  certificate: 'academy',
  reminder_assignment: 'academy',
  reminder_live_class: 'academy',
  reminder_grading: 'academy',
  reminder_event: 'academy',
  discussion: 'komunitas',
  community: 'komunitas',
  community_post_mention: 'komunitas',
  community_post_reply: 'komunitas',
  mentor_group_mention: 'komunitas',
  mentor_group_message: 'komunitas',
  mentor_group_announcement: 'komunitas',
  project: 'proyek',
  project_chat_mention: 'proyek',
  project_chat_message: 'proyek',
  project_invite: 'proyek',
  project_invite_accepted: 'proyek',
  project_invite_declined: 'proyek',
  project_join_request: 'proyek',
  project_join_approved: 'proyek',
  project_join_rejected: 'proyek',
  film: 'proyek',
  final_project_review: 'academy',
  final_project_status: 'academy',
  reminder_final_task: 'academy',
  sinebot_ticket_update: 'sinebot',
  sinebot_ticket_new: 'sinebot',
  announcement: 'sistem',
  announcement_published: 'sistem',
  event: 'sistem',
  moderation_warning: 'sistem',
  claim_approved: 'sistem',
  claim_rejected: 'sistem',
  mentor_assigned: 'sistem',
  mentor_application: 'sistem',
  waitlist: 'sistem',
}

export function notificationCategory(kind: string): NotificationCategory {
  return NOTIFICATION_CATEGORY_MAP[kind] ?? 'lainnya'
}

const IMPORTANT_KINDS = new Set([
  'moderation_warning',
  'claim_rejected',
  'certificate',
  'sinebot_ticket_new',
  'announcement_published',
  'mentor_group_announcement',
])

export function isImportantNotification(kind: string): boolean {
  return IMPORTANT_KINDS.has(kind)
}

/** Daftar notifikasi per halaman (offset; pemanggil mendedupe berdasarkan id
    karena baris realtime baru bisa menggeser halaman saat scroll). */
export async function fetchNotificationsPaged(
  userId: string,
  page: number,
  pageSize = 30,
): Promise<AppNotification[]> {
  const from = page * pageSize
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + pageSize - 1)
  if (error) {
    if (isMissingTableError(error)) return []
    throw error
  }
  return (data ?? []) as AppNotification[]
}

/** Notification Center (Fase 1): "Bersihkan" menghapus PERMANEN baris
    notifikasi milik sendiri (keputusan Arif 24 Nov 2026 — bukan arsip).
    RLS notifications_delete_own mengizinkan; aktivitas sumber (pesan, tugas,
    tiket) tidak ikut terhapus karena hanya baris notifications yang dihapus.
    Mengembalikan jumlah baris yang terhapus. */
export async function deleteNotifications(
  userId: string,
  scope: 'read' | 'all',
): Promise<number> {
  let q = supabase.from('notifications').delete().eq('user_id', userId)
  if (scope === 'read') q = q.eq('is_read', true)
  const { data, error } = await q.select('id')
  if (error) throw error
  return (data ?? []).length
}

export type NotificationRealtimeStatus = 'ok' | 'error'

/** Langganan Realtime untuk notifikasi milik sendiri (postgres_changes INSERT;
    butuh migrasi 075 yang menambah tabel notifications ke publikasi
    supabase_realtime). onStatus 'error' berarti halaman menampilkan notice
    jujur; lonceng tetap diperbarui lewat polling saat foreground.
    Nama channel WAJIB unik per tempat langganan: supabase.channel(nama)
    mengembalikan channel yang sama bila namanya sudah ada, dan menambah
    postgres_changes ke channel yang sudah subscribe() MELEMPAR error
    ("cannot add postgres_changes callbacks ... after subscribe()") —
    itulah yang membuat halaman Notifikasi blank pada deploy Fase 1 pertama
    (24 Nov 2026), karena Layout dan halaman memakai nama 'notifications'
    yang sama. Lonceng memakai 'notifications-bell', halaman 'notifications-page'. */
export function subscribeToNotifications(
  userId: string,
  onInsert: (n: AppNotification) => void,
  onStatus?: (status: NotificationRealtimeStatus) => void,
  channelName = 'notifications-page',
): () => void {
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const row = (payload as { new?: unknown }).new
        if (typeof row !== 'object' || row === null) return
        const id = (row as { id?: unknown }).id
        if (typeof id !== 'string') return
        onInsert(row as unknown as AppNotification)
      },
    )
    .subscribe((status) => {
      if (!onStatus) return
      if (status === 'SUBSCRIBED') onStatus('ok')
      else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
        onStatus('error')
      }
    })
  return () => {
    void supabase.removeChannel(channel)
  }
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
  // K9: baris belum ada BUKAN tabel hilang. Pengguna baru memakai default
  // (semua aktif) dan halaman menampilkan form — sebelumnya null di sini
  // disalahartikan sebagai "migrasi belum ada" sehingga form tidak pernah
  // tampil. null sekarang hanya berarti tabelnya memang belum ada.
  // (lib/reminders.ts sudah memperlakukan "belum ada preferensi" sebagai
  // default aktif, jadi perilaku pengingat tidak berubah.)
  if (!data) {
    return {
      id: '',
      user_id: userId,
      in_app: true,
      categories: { pengumuman: true, nilai: true, diskusi: true, acara: true, komunitas: true },
      created_at: '',
    } as NotificationPrefs
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
    .from('public_profiles')
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
    .from('public_profiles')
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
  const { data, error } = await supabase.from('public_profiles').select('id,name').in('id', unique)
  // P19 (audit 23 Nov 2026): error query dilempar, bukan map parsial —
  // nama yang gagal dimuat tidak lagi tampil sebagai "Anggota" berulang.
  // Pemanggil sudah menangani throw (try/catch atau .catch → Map kosong).
  if (error) throw error
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
    const { error } = await supabase.rpc('log_audit', {
      p_action: action,
      p_target_type: targetType,
      p_target_id: targetId,
      p_detail: detail ?? null,
    })
    // P17 (audit 23 Nov 2026): kegagalan audit tidak lagi hilang diam-diam
    // — catat ke console.warn (tetap best-effort: tidak memblokir aksi admin).
    if (error) {
      console.warn('log_audit gagal:', error.message)
    }
  } catch (err) {
    console.warn(
      'log_audit gagal:',
      err instanceof Error ? err.message : err,
    )
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

/**
 * Jadwalkan satu kelas live (mentor course / admin).
 * B19 (audit 23 Nov 2026): judul kosong, scheduled_at null/masa lalu, dan
 * meet_url bukan URL http(s) ditolak di sini — sebelum baris sampah sampai
 * ke siswa terdaftar.
 */
export async function createLiveClass(input: {
  courseId: string
  title: string
  scheduledAt: string | null
  meetUrl: string | null
  createdBy: string
}): Promise<LiveClass> {
  const title = input.title.trim()
  if (!title) throw new Error('Judul kelas live tidak boleh kosong.')
  if (!input.scheduledAt) {
    throw new Error('Jadwal kelas live harus diisi.')
  }
  const scheduled = new Date(input.scheduledAt)
  if (Number.isNaN(scheduled.getTime())) {
    throw new Error('Jadwal kelas live tidak valid.')
  }
  if (scheduled.getTime() <= Date.now()) {
    throw new Error('Jadwal kelas live harus di masa depan.')
  }
  const meetUrl = input.meetUrl?.trim() || null
  if (meetUrl) {
    let parsed: URL
    try {
      parsed = new URL(meetUrl)
    } catch {
      throw new Error('Tautan Meet harus berupa URL yang valid (http:// atau https://).')
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Tautan Meet harus berupa URL http:// atau https://.')
    }
  }
  const { data, error } = await supabase
    .from('live_classes')
    .insert({
      course_id: input.courseId,
      title,
      scheduled_at: scheduled.toISOString(),
      meet_url: meetUrl,
      created_by: input.createdBy,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as LiveClass
}

/** Batalkan satu kelas live (mentor course / admin). */
export async function deleteLiveClass(id: string): Promise<void> {
  // P5: hanya mentor course / admin (RLS live_classes_write_teacher).
  // Bila baris tidak terbaca, biarkan lanjut — RLS yang memutuskan.
  const { data } = await supabase
    .from('live_classes')
    .select('course_id')
    .eq('id', id)
    .maybeSingle()
  const courseId = (data as { course_id?: string } | null)?.course_id
  if (courseId) await assertCourseTeacherOrAdmin(courseId, 'membatalkan kelas live')
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
  // P2 (audit 23 Nov 2026): error query dilempar, bukan map kosong — UI
  // admin tidak lagi menampilkan kode wilayah mentah tanpa penjelasan.
  // Pemanggil sudah menangani throw (try/catch di load masing-masing).
  if (error) throw error
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
  // P1 (audit 23 Nov 2026): `,` `(` `)` `"` di dalam query merusak sintaks
  // filter PostgREST `.or()` (error 400) — buang bersama `%` dan `_` yang
  // sudah dibuang sebelumnya, sebelum interpolasi.
  const like = `%${q.replace(/[%_,()"]/g, '')}%`
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

/** Total sekolah di direktori via hitung server (count exact).
 *  K13: JANGAN hitung dari select('*') — PostgREST membatasi select tanpa
 *  limit ke 1000 baris, sehingga panjang array memotong total (dulu hero
 *  admin menampilkan "1000 sekolah" padahal ada 26.662, sementara
 *  direktori yang memakai count exact menampilkan 26.662). */
export async function fetchSchoolTotals(): Promise<{ total: number; verified: number; unverified: number }> {
  const [{ count: total, error: totalErr }, { count: unverified, error: unErr }] = await Promise.all([
    supabase.from('schools').select('id', { count: 'exact', head: true }),
    supabase.from('schools').select('id', { count: 'exact', head: true }).eq('is_verified', false),
  ])
  if (totalErr) throw totalErr
  if (unErr) throw unErr
  const t = total ?? 0
  const u = unverified ?? 0
  return { total: t, verified: t - u, unverified: u }
}

/** Ajukan sekolah manual (siswa; status awal pending, ditinjau admin). */
/**
 * Kunci antar-pemanggil (pola yang sama seperti registration.ts): dua
 * pemanggilan untuk pengguna + nama sekolah yang sama yang berjalan
 * bersamaan (klik ganda / dua tab) berbagi satu janji, bukan dua insert.
 * Pengaman antar-tab tetap indeks unik parsial migrasi 035.
 */
const schoolSubmissionInFlight = new Map<string, Promise<SchoolSubmission>>()

/** Pengajuan pending milik pengguna dengan nama sekolah yang sama (persis). */
async function fetchPendingSchoolSubmission(
  userId: string,
  name: string,
): Promise<SchoolSubmission | null> {
  const clean = name.trim().replace(/[%_\\]/g, (c) => `\\${c}`)
  const { data, error } = await supabase
    .from('school_submissions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .ilike('name', clean)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) return null
  return (data ?? null) as SchoolSubmission | null
}

/**
 * Ajukan sekolah baru untuk ditinjau admin. Nama kosong ditolak; bila
 * pengguna sudah punya pengajuan 'pending' dengan nama yang sama,
 * kembalikan pengajuan itu tanpa duplikat (cek di sini, bukan hanya di
 * pemanggil — registration.ts:221 hanya memeriksa di satu jalur).
 * Bila insert berlomba dengan tab lain, indeks unik migrasi 035 menolak
 * insert kedua; tangkap dan kembalikan baris yang sudah ada.
 */
export async function submitSchoolSubmission(input: {
  userId: string
  name: string
  npsn: string | null
  province: string | null
  regency: string | null
}): Promise<SchoolSubmission> {
  const cleanName = input.name.trim()
  if (!cleanName) throw new Error('Nama sekolah tidak boleh kosong.')
  const key = `${input.userId}:${cleanName.toLowerCase()}`
  const running = schoolSubmissionInFlight.get(key)
  if (running) return running
  const job = (async (): Promise<SchoolSubmission> => {
    const existing = await fetchPendingSchoolSubmission(input.userId, cleanName)
    if (existing) return existing
    const { data, error } = await supabase
      .from('school_submissions')
      .insert({
        user_id: input.userId,
        name: cleanName,
        npsn: input.npsn?.trim() || null,
        province: input.province || null,
        regency: input.regency || null,
        status: 'pending',
      })
      .select('*')
      .single()
    if (error) {
      // Balapan antar-tab: baris pending yang sama sudah masuk duluan.
      if (String(error.message ?? '').toLowerCase().includes('duplicate')) {
        const raced = await fetchPendingSchoolSubmission(input.userId, cleanName)
        if (raced) return raced
      }
      throw error
    }
    return data as SchoolSubmission
  })()
  schoolSubmissionInFlight.set(key, job)
  try {
    return await job
  } finally {
    schoolSubmissionInFlight.delete(key)
  }
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
 * B3+B4 (audit 23 Nov 2026): seluruh keputusan berjalan dalam SATU
 * transaksi lewat RPC decide_school_submission (migrasi 038) — guard
 * status='pending' (admin kedua tidak bisa me-reject yang sudah approved),
 * kode wilayah dikonversi ke NAMA referensi sebelum pencocokan duplikat
 * dan insert sekolah baru (schools.regency menyimpan nama, bukan kode),
 * lalu submission + profil pengaju di-update dalam transaksi yang sama.
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
  const { data, error } = await supabase.rpc('decide_school_submission', {
    p_submission_id: submission.id,
    p_decision: decision,
    p_note: note.trim() || null,
    p_admin_id: adminId,
  })
  if (error) throw error
  invalidateCatalogCache()
  return (data as string | null) ?? null
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
 * pernah mengubah profiles.role sendiri.
 * B2 (audit 23 Nov 2026): update dikunci ke status='pending' — lamaran yang
 * sudah diputuskan tidak bisa diputuskan ulang (menolak mentor yang sudah
 * disetujui tidak lagi lolos diam-diam); bila tidak ada baris yang berubah,
 * status sebenarnya dibaca dan dilaporkan.
 * B15 (audit 23 Nov 2026): penyalinan afiliasi lamaran ke profiles.school
 * kini dilakukan trigger DB yang sama (migrasi 044, dalam transaksi
 * approval) — bukan lagi best-effort client-side di sini.
 */
export async function decideMentorApplication(
  app: MentorApplication,
  decision: 'approved' | 'rejected' | 'revision_required',
  note: string,
  adminId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('mentor_applications')
    .update({
      status: decision,
      decision_note: note.trim() || null,
      decided_by: adminId,
      decided_at: new Date().toISOString(),
    })
    .eq('id', app.id)
    .eq('status', 'pending')
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) {
    const { data: current } = await supabase
      .from('mentor_applications')
      .select('status')
      .eq('id', app.id)
      .maybeSingle()
    const status = (current as { status?: string } | null)?.status
    throw new Error(
      status
        ? `Lamaran ini sudah diputuskan (${status}) dan tidak dapat diputuskan ulang.`
        : 'Lamaran tidak ditemukan.',
    )
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
 * Kunci antar-pemanggil (pola yang sama seperti registration.ts): dua
 * pemanggilan untuk pengguna yang sama yang berjalan bersamaan (klik
 * ganda / dua tab / dua jalur penyelesaian pendaftaran) berbagi satu
 * janji, bukan dua insert. Pengaman antar-tab tetap indeks unik parsial
 * migrasi 035; insert yang kalah balapan ditangkap dan mengembalikan
 * lamaran yang sudah ada.
 */
const mentorApplicationInFlight = new Map<string, Promise<MentorApplication>>()

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
  const running = mentorApplicationInFlight.get(userId)
  if (running) return running
  const job = submitMentorApplicationInner(userId, input)
  mentorApplicationInFlight.set(userId, job)
  try {
    return await job
  } finally {
    mentorApplicationInFlight.delete(userId)
  }
}

async function submitMentorApplicationInner(
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
  if (error) {
    // Balapan antar-tab: lamaran aktif pengguna ini sudah masuk duluan
    // (indeks unik migrasi 035). Kembalikan lamaran itu, bukan error.
    if (String(error.message ?? '').toLowerCase().includes('duplicate')) {
      const raced = await fetchMyMentorApplication(userId)
      if (raced && (raced.status === 'pending' || raced.status === 'approved')) return raced
    }
    throw error
  }
  return data as MentorApplication
}
