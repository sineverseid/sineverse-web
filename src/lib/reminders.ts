// SINEVERSE — Pengingat H-1 (Tahap 6).
//
// Dijalankan sekali per sesi saat masuk (wiring di Layout.tsx). Membuat
// notifikasi in-app lewat sendNotification() (satu-satunya jalur tulis ke
// tabel notifications: RPC create_notification, migrasi 008) untuk:
//
//   reminder_assignment  — tugas di course yang diikuti, tenggat <= 24 jam,
//                          dan belum dikumpulkan.
//   reminder_live_class  — kelas live <= 24 jam di course yang diikuti atau
//                          diampu.
//   reminder_grading     — pengumpulan belum dinilai > 3 hari, untuk mentor
//                          course-nya (satu notifikasi per tugas, berisi
//                          jumlah pengumpulan yang menunggu).
//   reminder_event       — acara <= 24 jam yang sudah didaftarkan pengguna
//                          (events + event_registrations, migrasi 007).
//
// DEDUP (wajib): satu pengingat per item per hari kalender (WIB). Sebelum
// mengirim, semua notifikasi reminder hari ini dibaca dan dicocokkan lewat
// data JSONB { reminder_for, reminder_day }; bila sudah ada, dilewati.
//
// KEAMANAN / KETAHANAN: menghormati notification_prefs (in_app=false ->
// tidak ada pengingat; kategori 'acara' = false -> tidak ada pengingat
// acara). Setiap kegagalan ditelan per seksi — pengingat tidak pernah
// merusak sign-in. Tidak ada tabel baru, tidak ada penghapusan data.
import { fetchNotificationPrefs, sendNotification, supabase } from './supabase'
import { isMissingTableError } from './guarded'

export const REMINDER_KINDS = [
  'reminder_assignment',
  'reminder_live_class',
  'reminder_grading',
  'reminder_event',
] as const

export type ReminderKind = (typeof REMINDER_KINDS)[number]

const DAY_MS = 24 * 60 * 60 * 1000
const GRADING_STALE_MS = 3 * DAY_MS

/** Hari kalender (YYYY-MM-DD) di WIB — hari yang dipakai aturan dedup. */
function jakartaDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

function fmtWib(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

type ReminderData = {
  reminder_for: string
  reminder_day: string
  course_id?: string
  assignment_id?: string
  due_date?: string
  scheduled_at?: string
  starts_at?: string
  pending_count?: number
}

/** Kunci dedup: "kind:itemId" yang sudah terkirim pada hari WIB tertentu. */
async function fetchSentToday(userId: string, day: string): Promise<Set<string>> {
  const sent = new Set<string>()
  const { data, error } = await supabase
    .from('notifications')
    .select('kind,data')
    .eq('user_id', userId)
    .in('kind', [...REMINDER_KINDS])
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  for (const row of (data ?? []) as {
    kind: string
    data: Record<string, unknown> | null
  }[]) {
    const d = row.data
    if (
      d &&
      typeof d.reminder_for === 'string' &&
      d.reminder_day === day
    ) {
      sent.add(`${row.kind}:${d.reminder_for}`)
    }
  }
  return sent
}

function categoryEnabled(
  cats: Record<string, unknown> | string[] | null | undefined,
  key: string,
): boolean {
  if (!cats) return true
  if (Array.isArray(cats)) return cats.includes(key)
  const v = (cats as Record<string, unknown>)[key]
  return v !== false
}

/** course_id -> judul course (untuk isi notifikasi). */
async function fetchCourseTitles(courseIds: string[]): Promise<Map<string, string>> {
  const titles = new Map<string, string>()
  if (courseIds.length === 0) return titles
  const { data, error } = await supabase
    .from('courses')
    .select('id,title')
    .in('id', courseIds)
  if (error) throw error
  for (const row of (data ?? []) as { id: string; title: string }[]) {
    titles.set(row.id, row.title)
  }
  return titles
}

/** Semua lesson_id milik course-course ini, beserta peta lesson -> course. */
async function lessonCourseMap(courseIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (courseIds.length === 0) return map
  const { data: modRows, error } = await supabase
    .from('modules')
    .select('id,course_id')
    .in('course_id', courseIds)
  if (error) throw error
  const modCourse = new Map(
    ((modRows ?? []) as { id: string; course_id: string }[]).map((m) => [
      m.id,
      m.course_id,
    ]),
  )
  if (modCourse.size === 0) return map
  const { data: lesRows, error: lesErr } = await supabase
    .from('lessons')
    .select('id,module_id')
    .in('module_id', [...modCourse.keys()])
  if (lesErr) throw lesErr
  for (const row of (lesRows ?? []) as { id: string; module_id: string }[]) {
    const courseId = modCourse.get(row.module_id)
    if (courseId) map.set(row.id, courseId)
  }
  return map
}

async function checkAssignmentReminders(
  userId: string,
  sent: Set<string>,
  day: string,
  now: Date,
  horizon: Date,
): Promise<number> {
  const { data: enrRows, error: enrErr } = await supabase
    .from('enrollments')
    .select('course_id')
    .eq('user_id', userId)
  if (enrErr) throw enrErr
  const courseIds = ((enrRows ?? []) as { course_id: string }[]).map(
    (r) => r.course_id,
  )
  if (courseIds.length === 0) return 0

  const lessons = await lessonCourseMap(courseIds)
  if (lessons.size === 0) return 0
  const titles = await fetchCourseTitles(courseIds)

  const { data: asgRows, error: asgErr } = await supabase
    .from('assignments')
    .select('id,lesson_id,title,due_date')
    .in('lesson_id', [...lessons.keys()])
    .not('due_date', 'is', null)
    .gt('due_date', now.toISOString())
    .lte('due_date', horizon.toISOString())
  if (asgErr) throw asgErr
  const due = (asgRows ?? []) as {
    id: string
    lesson_id: string
    title: string
    due_date: string | null
  }[]
  if (due.length === 0) return 0

  const { data: subRows, error: subErr } = await supabase
    .from('submissions')
    .select('assignment_id')
    .eq('user_id', userId)
    .in(
      'assignment_id',
      due.map((a) => a.id),
    )
  if (subErr) throw subErr
  const submitted = new Set(
    ((subRows ?? []) as { assignment_id: string }[]).map((s) => s.assignment_id),
  )

  let created = 0
  for (const a of due) {
    if (!a.due_date) continue
    if (submitted.has(a.id)) continue
    const key = `reminder_assignment:${a.id}`
    if (sent.has(key)) continue
    const courseId = lessons.get(a.lesson_id) ?? ''
    const courseName = titles.get(courseId)
    const data: ReminderData = {
      reminder_for: a.id,
      reminder_day: day,
      course_id: courseId,
      due_date: a.due_date,
    }
    await sendNotification(
      userId,
      'reminder_assignment',
      `Tugas "${a.title}" tenggat besok`,
      `Tenggat ${fmtWib(a.due_date)} WIB${courseName ? ` — ${courseName}` : ''}. Kirim sebelum tenggat supaya tidak terlambat.`,
      data,
    )
    sent.add(key)
    created += 1
  }
  return created
}

async function checkLiveClassReminders(
  userId: string,
  sent: Set<string>,
  day: string,
  now: Date,
  horizon: Date,
): Promise<number> {
  const [{ data: enrRows, error: enrErr }, { data: ownRows, error: ownErr }] =
    await Promise.all([
      supabase.from('enrollments').select('course_id').eq('user_id', userId),
      supabase.from('courses').select('id').eq('mentor_id', userId),
    ])
  if (enrErr) throw enrErr
  if (ownErr) throw ownErr
  const courseIds = [
    ...new Set([
      ...((enrRows ?? []) as { course_id: string }[]).map((r) => r.course_id),
      ...((ownRows ?? []) as { id: string }[]).map((r) => r.id),
    ]),
  ]
  if (courseIds.length === 0) return 0

  const titles = await fetchCourseTitles(courseIds)
  const { data, error } = await supabase
    .from('live_classes')
    .select('id,course_id,title,scheduled_at')
    .in('course_id', courseIds)
    .not('scheduled_at', 'is', null)
    .gt('scheduled_at', now.toISOString())
    .lte('scheduled_at', horizon.toISOString())
  if (error) throw error
  const rows = (data ?? []) as {
    id: string
    course_id: string
    title: string
    scheduled_at: string | null
  }[]

  let created = 0
  for (const lc of rows) {
    if (!lc.scheduled_at) continue
    const key = `reminder_live_class:${lc.id}`
    if (sent.has(key)) continue
    const courseName = titles.get(lc.course_id)
    const data: ReminderData = {
      reminder_for: lc.id,
      reminder_day: day,
      course_id: lc.course_id,
      scheduled_at: lc.scheduled_at,
    }
    await sendNotification(
      userId,
      'reminder_live_class',
      `Kelas live "${lc.title}" besok`,
      `Mulai ${fmtWib(lc.scheduled_at)} WIB${courseName ? ` — ${courseName}` : ''}. Siapkan pertanyaanmu sebelum kelas dimulai.`,
      data,
    )
    sent.add(key)
    created += 1
  }
  return created
}

async function checkGradingReminders(
  userId: string,
  sent: Set<string>,
  day: string,
  now: Date,
): Promise<number> {
  const { data: ownRows, error: ownErr } = await supabase
    .from('courses')
    .select('id')
    .eq('mentor_id', userId)
  if (ownErr) throw ownErr
  const courseIds = ((ownRows ?? []) as { id: string }[]).map((r) => r.id)
  if (courseIds.length === 0) return 0

  const lessons = await lessonCourseMap(courseIds)
  if (lessons.size === 0) return 0
  const { data: asgRows, error: asgErr } = await supabase
    .from('assignments')
    .select('id,title')
    .in('lesson_id', [...lessons.keys()])
  if (asgErr) throw asgErr
  const assignments = (asgRows ?? []) as { id: string; title: string }[]
  if (assignments.length === 0) return 0

  const staleBefore = new Date(now.getTime() - GRADING_STALE_MS).toISOString()
  const { data: subRows, error: subErr } = await supabase
    .from('submissions')
    .select('assignment_id,submitted_at')
    .in(
      'assignment_id',
      assignments.map((a) => a.id),
    )
    .is('score', null)
    .lt('submitted_at', staleBefore)
  if (subErr) throw subErr
  const pendingByAssignment = new Map<string, number>()
  for (const row of (subRows ?? []) as {
    assignment_id: string
    submitted_at: string
  }[]) {
    pendingByAssignment.set(
      row.assignment_id,
      (pendingByAssignment.get(row.assignment_id) ?? 0) + 1,
    )
  }

  let created = 0
  for (const a of assignments) {
    const count = pendingByAssignment.get(a.id) ?? 0
    if (count === 0) continue
    const key = `reminder_grading:${a.id}`
    if (sent.has(key)) continue
    const data: ReminderData = {
      reminder_for: a.id,
      reminder_day: day,
      assignment_id: a.id,
      pending_count: count,
    }
    await sendNotification(
      userId,
      'reminder_grading',
      `${count} pengumpulan "${a.title}" belum dinilai`,
      `${count} pengumpulan sudah menunggu lebih dari 3 hari. Nilai dari antrean Penilaian supaya siswa tidak menunggu.`,
      data,
    )
    sent.add(key)
    created += 1
  }
  return created
}

async function checkEventReminders(
  userId: string,
  sent: Set<string>,
  day: string,
  now: Date,
  horizon: Date,
): Promise<number> {
  const { data: regRows, error: regErr } = await supabase
    .from('event_registrations')
    .select('event_id')
    .eq('user_id', userId)
  if (regErr) throw regErr
  const eventIds = ((regRows ?? []) as { event_id: string }[]).map(
    (r) => r.event_id,
  )
  if (eventIds.length === 0) return 0

  const { data, error } = await supabase
    .from('events')
    .select('id,title,starts_at')
    .in('id', eventIds)
    .not('starts_at', 'is', null)
    .gt('starts_at', now.toISOString())
    .lte('starts_at', horizon.toISOString())
  if (error) throw error
  const rows = (data ?? []) as {
    id: string
    title: string
    starts_at: string | null
  }[]

  let created = 0
  for (const ev of rows) {
    if (!ev.starts_at) continue
    const key = `reminder_event:${ev.id}`
    if (sent.has(key)) continue
    const data: ReminderData = {
      reminder_for: ev.id,
      reminder_day: day,
      starts_at: ev.starts_at,
    }
    await sendNotification(
      userId,
      'reminder_event',
      `Acara "${ev.title}" besok`,
      `Mulai ${fmtWib(ev.starts_at)} WIB. Sampai jumpa di acara!`,
      data,
    )
    sent.add(key)
    created += 1
  }
  return created
}

/**
 * Buat pengingat H-1 untuk pengguna yang baru masuk. Dipanggil sekali per
 * sesi (lihat Layout.tsx). Selalu resolve — kegagalan apa pun ditelan dan
 * jumlah yang berhasil dibuat dikembalikan.
 */
export async function checkDueReminders(
  userId: string,
): Promise<{ created: number }> {
  try {
    // Preferensi: in_app=false berarti tidak ada pengingat sama sekali.
    // fetchNotificationPrefs mengembalikan null bila tabel belum ada atau
    // pengguna belum pernah menyimpan preferensi — default: pengingat aktif.
    let prefs: Awaited<ReturnType<typeof fetchNotificationPrefs>> = null
    try {
      prefs = await fetchNotificationPrefs(userId)
    } catch {
      prefs = null
    }
    if (prefs && prefs.in_app === false) return { created: 0 }
    const acaraEnabled = categoryEnabled(
      (prefs?.categories ?? null) as
        | Record<string, unknown>
        | string[]
        | null,
      'acara',
    )

    const now = new Date()
    const horizon = new Date(now.getTime() + DAY_MS)
    const day = jakartaDay(now)

    let sent: Set<string>
    try {
      sent = await fetchSentToday(userId, day)
    } catch (err) {
      // Tanpa daftar dedup, jangan kirim apa pun — lebih baik melewatkan
      // satu sesi daripada membuat duplikat.
      if (isMissingTableError(err)) return { created: 0 }
      return { created: 0 }
    }

    let created = 0
    const sections: (() => Promise<number>)[] = [
      () => checkAssignmentReminders(userId, sent, day, now, horizon),
      () => checkLiveClassReminders(userId, sent, day, now, horizon),
      () => checkGradingReminders(userId, sent, day, now),
    ]
    if (acaraEnabled) {
      sections.push(() =>
        checkEventReminders(userId, sent, day, now, horizon),
      )
    }
    for (const run of sections) {
      try {
        created += await run()
      } catch {
        // Satu seksi gagal (mis. tabel belum diterapkan live) tidak
        // menggagalkan seksi lain maupun sign-in.
        continue
      }
    }
    return { created }
  } catch {
    return { created: 0 }
  }
}
