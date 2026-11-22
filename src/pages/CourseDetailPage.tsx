// SINEVERSE, Detail course: deskripsi, mentor, level, modul + lesson,
// progress, dan pendaftaran ("Ambil Course").
//
// Aturan pendaftaran:
// - Course tanpa mentor → waitlist "Ikuti untuk Bergabung", bukan enrol.
//   Mentor juga bisa "Ajukan untuk Mengampu" lewat course_claims.
// - Course dengan enrollment_key → minta kode (case-insensitive), tolak kode salah.
// - Selain itu → enrol langsung.
// - Mentor tidak mengambil course mentor lain; admin hanya memantau.
// - Lesson terbuka untuk peserta, mentor pengampu, dan admin.
//
// Course dimuat dulu; nama mentor dan modul dimuat independen agar
// kegagalannya tidak menenggelamkan halaman course.
//
// Desain dashboard (22 Nov 2026): hero foto, baris judul + pil status,
// tab garis bawah (Deskripsi / Materi / Tugas / Diskusi; admin:
// Ringkasan / Aktivitas), kartu tugas dengan lencana tenggat.
//
// Baris statistik mentor/admin (22 Nov 2026): Total Siswa +
// Tingkat Selesai dihitung dari enrollments + lesson_progress asli
// (statsTask di load(); "—" bila belum ada enrollment atau query
// gagal). CTA "Kelola Course" tetap tautan struktural tanpa angka.
// Nilai per Komponen dan Kelas Live tetap memakai data asli yang
// sudah dimuat sebelumnya. Gate §3: lesson terkunci untuk siswa bila
// course belum punya mentor, termasuk peserta yang sudah terdaftar.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Icon from '../components/icons'
import { useAuth } from '../context/AuthContext'
import { courseIllustration, GRADEBOOK_WEIGHTS, PASSING_GRADE, rpsWeekLabel } from '../lib/brand'
import {
  avgOrNull,
  bestScoresByQuiz,
  buildGradeComponents,
  discussionParticipationScore,
} from '../lib/grading'
import {
  enrollInCourse,
  fetchAssignmentsForLessons,
  fetchCourse,
  fetchDiscussionsForLessons,
  fetchEnrollment,
  fetchLessonProgress,
  fetchLiveClasses,
  fetchMentorName,
  fetchModules,
  fetchQuizAttempts,
  fetchQuizzesForLessons,
  fetchSubmissions,
  fetchWaitlistEntry,
  joinWaitlist,
  logAudit,
  supabase,
} from '../lib/supabase'
import type {
  Assignment,
  Course,
  Discussion,
  GradeComponents,
  Lesson,
  LessonProgress,
  LiveClass,
  Module,
  Quiz,
  QuizAttempt,
  Submission,
} from '../lib/types'

/** Lencana tenggat tugas dari due_date asli: terlewat (merah), dekat
 *  (≤3 hari, kuning), jauh (hijau), atau tanpa tenggat (abu-abu). */
function deadlineInfo(dueDate: string | null | undefined): { cls: string; text: string } {
  if (!dueDate) return { cls: 'task-deadline none', text: 'Tanpa tenggat' }
  const due = new Date(dueDate)
  const dateText = due.toLocaleDateString('id-ID', { dateStyle: 'medium' })
  if (due.getTime() < Date.now()) {
    return { cls: 'task-deadline', text: `Terlewat: ${dateText}` }
  }
  if (due.getTime() - Date.now() <= 3 * 24 * 60 * 60 * 1000) {
    return { cls: 'task-deadline soon', text: `Tenggat: ${dateText}` }
  }
  return { cls: 'task-deadline normal', text: `Tenggat: ${dateText}` }
}

/** Lima komponen nilai satu course untuk satu pengguna — perhitungan yang
 *  sama dengan GradebookPage (formula master prompt Tahap 3). Kuis biasa
 *  (kind='quiz') tidak masuk komponen mana pun; tugas lama tanpa kind
 *  dibaca sebagai tugas mingguan. */
function computeGradeComponents(
  quizzes: Quiz[],
  assignments: Assignment[],
  quizAttempts: QuizAttempt[],
  submissions: Submission[],
  userPosts: Discussion[],
): GradeComponents {
  const best = bestScoresByQuiz(quizAttempts)
  const pretestIds = new Set(
    quizzes.filter((q) => q.kind === 'pretest').map((q) => q.id),
  )
  const posttestIds = new Set(
    quizzes.filter((q) => q.kind === 'posttest').map((q) => q.id),
  )
  const pretest = avgOrNull(
    [...best.entries()]
      .filter(([id]) => pretestIds.has(id))
      .map(([, score]) => score),
  )
  const posttest = avgOrNull(
    [...best.entries()]
      .filter(([id]) => posttestIds.has(id))
      .map(([, score]) => score),
  )
  const weeklyIds = new Set(
    assignments
      .filter((a) => (a.kind ?? 'weekly') === 'weekly')
      .map((a) => a.id),
  )
  const finalIds = new Set(
    assignments.filter((a) => a.kind === 'final_practice').map((a) => a.id),
  )
  const weeklyAssignments = avgOrNull(
    submissions
      .filter((s) => weeklyIds.has(s.assignment_id) && s.score !== null)
      .map((s) => s.score as number),
  )
  const finalPractice = avgOrNull(
    submissions
      .filter((s) => finalIds.has(s.assignment_id) && s.score !== null)
      .map((s) => s.score as number),
  )
  const discussion = discussionParticipationScore(userPosts)
  return buildGradeComponents(
    { pretest, posttest, weeklyAssignments, finalPractice, discussion },
    GRADEBOOK_WEIGHTS,
    PASSING_GRADE,
  )
}

/** Semua komponen masih null (belum ada nilai apa pun). */
const EMPTY_COMPONENTS: GradeComponents = {
  pretest: null,
  posttest: null,
  weeklyAssignments: null,
  finalPractice: null,
  discussion: null,
  final: 0,
  passed: false,
}

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  // Admin hanya memantau, admin tidak mengambil course.
  const isAdmin = profile?.role === 'admin'

  const [course, setCourse] = useState<Course | null>(null)
  const [mentorName, setMentorName] = useState<string | null>(null)
  const [mentorFailed, setMentorFailed] = useState(false)
  const [modules, setModules] = useState<(Module & { lessons: Lesson[] })[]>([])
  const [modulesError, setModulesError] = useState<string | null>(null)
  const [progress, setProgress] = useState<LessonProgress[]>([])
  const [enrolled, setEnrolled] = useState(false)
  const [onWaitlist, setOnWaitlist] = useState(false)
  const [gradeComponents, setGradeComponents] = useState<GradeComponents | null>(null)
  const [gradeError, setGradeError] = useState<string | null>(null)
  const [liveClasses, setLiveClasses] = useState<LiveClass[]>([])
  const [liveError, setLiveError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Tugas + diskusi course untuk panel tab (dimuat dari lesson course).
  const [courseAssignments, setCourseAssignments] = useState<Assignment[]>([])
  const [courseDiscussions, setCourseDiscussions] = useState<Discussion[]>([])
  // Baris statistik mentor/admin (22 Nov 2026): Total Siswa +
  // Tingkat Selesai dari enrollments + lesson_progress asli.
  // null = belum dimuat; students null = query gagal (tampil "—").
  const [courseStats, setCourseStats] = useState<{
    students: number | null
    completionPct: number | null
  } | null>(null)
  // Tab aktif: siswa/mentor Deskripsi / Materi / Tugas / Diskusi;
  // admin Ringkasan / Aktivitas.
  const [activeTab, setActiveTab] = useState('deskripsi')

  const [code, setCode] = useState('')
  const [askCode, setAskCode] = useState(false)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [claimBusy, setClaimBusy] = useState(false)
  const [claimed, setClaimed] = useState(false)
  // Klaim saya untuk course ini (bila ada) — status + alasan penolakan
  // dibutuhkan untuk menampilkan alasan dan tombol ajukan ulang (022).
  const [myClaim, setMyClaim] = useState<{ id: string; status: string; decision_note: string | null } | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    async function load() {
      try {
        const c = await fetchCourse(id as string)
        if (cancelled) return
        if (!c) {
          setError('Course tidak ditemukan.')
          return
        }
        setCourse(c)

        // Semua bagian independen dimuat PARALEL; satu gagal hanya
        // menampilkan notice di seksinya, bukan mengosongkan halaman.
        const mentorTask = (async () => {
          // Nama mentor: gagal tidak boleh mengosongkan halaman.
          try {
            const name = await fetchMentorName(c.mentor_id)
            if (!cancelled) setMentorName(name)
          } catch {
            if (!cancelled) setMentorFailed(true)
          }
        })()

        const modulesTask = (async (): Promise<Lesson[]> => {
          // Modul + lesson: gagal tidak boleh mengosongkan halaman.
          // Satu query lesson untuk semua modul (bukan satu per modul),
          // diurutkan seperti fetchCourseLessons: (urutan modul, urutan
          // lesson). Query .in() langsung dipakai di sini — bukan
          // fetchCourseLessons — karena fungsi itu memuat ulang modul
          // secara internal, sementara modul sudah ada di sini.
          // Mengembalikan lesson agar tugas nilai bisa memakai lesson
          // yang sama tanpa query ulang.
          try {
            const mods = await fetchModules(c.id)
            const orderByModule = new Map(mods.map((m) => [m.id, m.order_index]))
            let lessons: Lesson[] = []
            if (mods.length > 0) {
              const { data: lData, error: lErr } = await supabase
                .from('lessons')
                .select('*')
                .in('module_id', mods.map((m) => m.id))
              if (lErr) throw lErr
              lessons = ((lData ?? []) as Lesson[]).sort((a, b) => {
                const ma = orderByModule.get(a.module_id) ?? 0
                const mb = orderByModule.get(b.module_id) ?? 0
                if (ma !== mb) return ma - mb
                return (a.order_index ?? 0) - (b.order_index ?? 0)
              })
            }
            if (!cancelled) {
              setModules(mods.map((m) => ({ ...m, lessons: lessons.filter((x) => x.module_id === m.id) })))
            }
            return lessons
          } catch {
            if (!cancelled) setModulesError('Modul gagal dimuat. Coba muat ulang halaman.')
            return []
          }
        })()

        // Status pendaftaran dipakai dua tempat: blok pendaftaran dan blok
        // nilai per komponen — satu query, dibagikan lewat promise ini.
        const enrollmentTask: Promise<boolean> = user
          ? (async () => {
              try {
                const enr = await fetchEnrollment(user.id, c.id)
                return enr !== null
              } catch {
                // Enrollment gagal dibaca: perlakukan sebagai belum terdaftar.
                return false
              }
            })()
          : Promise.resolve(false)

        const gradesTask = (async () => {
          // Nilai per komponen hanya untuk peserta, mentor pengampu, dan
          // admin; gagal memuat hanya menampilkan notice di bloknya,
          // tidak pernah merusak halaman course.
          if (!user) return
          try {
            const [lessons, isEnrolled] = await Promise.all([
              modulesTask,
              enrollmentTask,
            ])
            const canViewGrades =
              isEnrolled || c.mentor_id === user.id || profile?.role === 'admin'
            if (!canViewGrades) return
            if (lessons.length === 0) {
              if (!cancelled) setGradeComponents(EMPTY_COMPONENTS)
              return
            }
            const lessonIds = lessons.map((l) => l.id)
            const [quizzes, assignments, attempts, submissions, discussions] =
              await Promise.all([
                fetchQuizzesForLessons(lessonIds),
                fetchAssignmentsForLessons(lessonIds),
                fetchQuizAttempts(user.id),
                fetchSubmissions(user.id),
                fetchDiscussionsForLessons(lessonIds),
              ])
            if (cancelled) return
            const userPosts = discussions.filter((d) => d.user_id === user.id)
            setGradeComponents(
              computeGradeComponents(quizzes, assignments, attempts, submissions, userPosts),
            )
          } catch {
            if (!cancelled)
              setGradeError('Nilai per komponen gagal dimuat. Coba muat ulang halaman.')
          }
        })()

        const liveTask = (async () => {
          // Kelas live: gagal memuat hanya menampilkan notice di seksinya.
          try {
            const lc = await fetchLiveClasses(c.id)
            if (!cancelled) setLiveClasses(lc)
          } catch {
            if (!cancelled) setLiveError('Kelas live gagal dimuat. Coba muat ulang halaman.')
          }
        })()

        const listsTask = (async () => {
          // Tugas + diskusi course untuk panel tab: satu query per daftar
          // untuk semua lesson course (fungsi yang sama dipakai gradesTask).
          try {
            const lessons = await modulesTask
            if (lessons.length === 0) return
            const lessonIds = lessons.map((l) => l.id)
            const [a, d] = await Promise.all([
              fetchAssignmentsForLessons(lessonIds),
              fetchDiscussionsForLessons(lessonIds),
            ])
            if (!cancelled) {
              setCourseAssignments(a)
              setCourseDiscussions(d)
            }
          } catch {
            // Gagal dimuat: panel menampilkan keadaan kosong, bukan angka palsu.
          }
        })()

        const statsTask = (async () => {
          // Baris statistik mentor/admin: Total Siswa (jumlah enrollment
          // course ini) dan Tingkat Selesai (% peserta yang menyelesaikan
          // SEMUA lesson course). Tanpa enrollment, Tingkat Selesai "—".
          // Hanya mentor pengampu + admin yang melihat baris ini.
          const canViewStats =
            (user !== null && c.mentor_id === user.id) || profile?.role === 'admin'
          if (!canViewStats) return
          try {
            const lessons = await modulesTask
            const { data: enrData, error: enrErr } = await supabase
              .from('enrollments')
              .select('user_id')
              .eq('course_id', c.id)
            if (enrErr) throw enrErr
            const enrolledIds = [
              ...new Set(((enrData ?? []) as { user_id: string }[]).map((e) => e.user_id)),
            ]
            if (enrolledIds.length === 0 || lessons.length === 0) {
              if (!cancelled) {
                setCourseStats({ students: enrolledIds.length, completionPct: null })
              }
              return
            }
            const lessonIds = lessons.map((l) => l.id)
            const { data: progData, error: progErr } = await supabase
              .from('lesson_progress')
              .select('lesson_id,user_id')
              .eq('status', 'completed')
              .in('lesson_id', lessonIds)
              .in('user_id', enrolledIds)
            if (progErr) throw progErr
            const doneByUser = new Map<string, Set<string>>()
            for (const p of (progData ?? []) as { lesson_id: string; user_id: string }[]) {
              let s = doneByUser.get(p.user_id)
              if (!s) {
                s = new Set()
                doneByUser.set(p.user_id, s)
              }
              s.add(p.lesson_id)
            }
            let fullyDone = 0
            for (const uid of enrolledIds) {
              if ((doneByUser.get(uid)?.size ?? 0) >= lessonIds.length) fullyDone += 1
            }
            if (!cancelled) {
              setCourseStats({
                students: enrolledIds.length,
                completionPct: Math.round((fullyDone / enrolledIds.length) * 100),
              })
            }
          } catch {
            if (!cancelled) setCourseStats({ students: null, completionPct: null })
          }
        })()

        const userTasks = user
          ? Promise.all([
              (async () => {
                const isEnrolled = await enrollmentTask
                if (!cancelled) setEnrolled(isEnrolled)
              })(),
              (async () => {
                try {
                  const prog = await fetchLessonProgress(user.id)
                  if (!cancelled) setProgress(prog)
                } catch {
                  // Progres gagal dibaca: tampilkan course tanpa progres.
                }
              })(),
              ...(c.mentor_id === null
                ? [
                    (async () => {
                      try {
                        const wl = await fetchWaitlistEntry(user.id, c.id)
                        if (!cancelled) setOnWaitlist(wl)
                      } catch {
                        // Status daftar tunggu gagal dibaca: tampilkan tombol apa adanya.
                      }
                    })(),
                  ]
                : []),
              ...(profile?.role === 'mentor'
                ? [
                    (async () => {
                      try {
                        const { data } = await supabase
                          .from('course_claims')
                          .select('id,status,decision_note')
                          .eq('mentor_id', user.id)
                          .eq('course_id', c.id)
                          .maybeSingle()
                        if (!cancelled && data) {
                          const row = data as { id: string; status: string; decision_note: string | null }
                          setMyClaim(row)
                          if (row.status === 'pending' || row.status === 'approved') setClaimed(true)
                        }
                      } catch {
                        // Pengajuan lama gagal dibaca: tombol tetap bisa dikirim.
                      }
                    })(),
                  ]
                : []),
            ])
          : Promise.resolve()

        await Promise.all([mentorTask, modulesTask, userTasks, gradesTask, liveTask, listsTask, statsTask])
      } catch {
        if (!cancelled) setError('Gagal memuat course. Periksa koneksi lalu coba lagi.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user, profile?.role])

  if (loading) {
    return (
      <div className="page">
        <p className="muted">Memuat course…</p>
      </div>
    )
  }

  if (error || !course) {
    return (
      <div className="page">
        <p className="error-box">{error ?? 'Course tidak ditemukan.'}</p>
        <Link to="/akademi">Kembali ke Akademi</Link>
      </div>
    )
  }

  const allLessons = modules.flatMap((m) => m.lessons)
  const doneIds = new Set(progress.filter((p) => p.status === 'completed').map((p) => p.lesson_id))
  const doneCount = allLessons.filter((l) => doneIds.has(l.id)).length
  const percent = allLessons.length > 0 ? Math.round((doneCount / allLessons.length) * 100) : 0
  const nextLesson = allLessons.find((l) => !doneIds.has(l.id))
  const hasKey = Boolean(course.enrollment_key)
  const noMentor = course.mentor_id === null
  const week = rpsWeekLabel(course.id)
  const isCourseMentor = user !== null && course.mentor_id !== null && course.mentor_id === user.id
  const isOtherMentor =
    profile?.role === 'mentor' && course.mentor_id !== null && course.mentor_id !== user?.id
  // Blok nilai hanya untuk peserta, mentor pengampu, dan admin.
  const showGrades = enrolled || isCourseMentor || isAdmin
  const hasAnyGrade =
    gradeComponents !== null &&
    [
      gradeComponents.pretest,
      gradeComponents.posttest,
      gradeComponents.weeklyAssignments,
      gradeComponents.finalPractice,
      gradeComponents.discussion,
    ].some((v) => v !== null)
  // Ringkasan ringkas per section (Stage 1 sudah menampilkan "x/5 selesai"
  // + badge di tiap judul modul; baris ini hanya merangkumnya di satu tempat).
  const sectionSummaries = modules
    .filter((m) => m.order_index === 1 || m.order_index === 2)
    .map((m) => {
      const done = m.lessons.filter((l) => doneIds.has(l.id)).length
      const label = m.order_index === 1 ? 'Section 1' : 'Section 2'
      return `${label}: ${done >= 5 ? 'Selesai' : `${done}/5`}`
    })
  // Hero: cover_url bila ada, kalau tidak ilustrasi RPS, kalau tidak ada
  // keduanya (course di luar urutan RPS) tampilkan fallback gradasi.
  const heroSrc = course.cover_url ?? courseIllustration(course.id)
  const isComplete = enrolled && allLessons.length > 0 && percent === 100
  const lessonTitleById = new Map(allLessons.map((l) => [l.id, l.title]))
  // Jumlah balasan dihitung dari baris diskusi itu sendiri (parent_id),
  // bukan dari kolom hitungan — tidak ada data like di aplikasi ini.
  const replyCounts = new Map<string, number>()
  for (const d of courseDiscussions) {
    if (d.parent_id) replyCounts.set(d.parent_id, (replyCounts.get(d.parent_id) ?? 0) + 1)
  }
  const topDiscussions = courseDiscussions.filter((d) => !d.parent_id)

  async function doEnroll() {
    if (!user || !course) return
    // Defense in depth (migrasi 022): admin tidak mengambil course.
    // (Tombolnya sendiri sudah disembunyikan untuk admin; RLS yang
    // menegakkan bila ada yang memanggil langsung.)
    if (profile?.role === 'admin') {
      setNotice('Admin hanya memantau course dan tidak dapat mengambil course sebagai peserta.')
      return
    }
    const c = course
    setBusy(true)
    setCodeError(null)
    try {
      await enrollInCourse(user.id, c.id)
      setEnrolled(true)
      setNotice('Kamu berhasil mengambil course ini. Selamat belajar.')
    } catch {
      setCodeError('Gagal mendaftar ke course. Periksa koneksi lalu coba lagi.')
    } finally {
      setBusy(false)
    }
  }

  function handleEnrollClick() {
    if (!course) return
    if (!user) {
      navigate('/login', { state: { from: `/course/${course.id}` } })
      return
    }
    if (hasKey) {
      setAskCode(true)
      return
    }
    void doEnroll()
  }

  function handleCodeSubmit(e: FormEvent) {
    e.preventDefault()
    if (!course) return
    const expected = (course.enrollment_key ?? '').trim().toLowerCase()
    if (code.trim().toLowerCase() !== expected) {
      setCodeError('Kode akses salah. Periksa kembali kode dari mentor kamu.')
      return
    }
    void doEnroll()
  }

  async function handleWaitlist() {
    if (!course) return
    if (!user) {
      navigate('/login', { state: { from: `/course/${course.id}` } })
      return
    }
    setBusy(true)
    const ok = await joinWaitlist(user.id, course.id)
    setBusy(false)
    if (ok) {
      setOnWaitlist(true)
      setNotice('Kamu masuk daftar tunggu. Kami beri tahu saat mentor ditugaskan.')
    } else {
      setNotice('Daftar tunggu belum tersedia untuk course ini. Coba lagi nanti.')
    }
  }

  async function handleClaim() {
    if (!user || !course) return
    const c = course
    setClaimBusy(true)
    try {
      // Klaim yang ditolak boleh diajukan ulang (migrasi 022): baris yang
      // sama dikembalikan ke 'pending', bukan insert duplikat.
      if (myClaim?.status === 'rejected') {
        const { error: updErr } = await supabase.from('course_claims')
          .update({ status: 'pending' })
          .eq('id', myClaim.id)
        if (updErr) throw updErr
        setMyClaim({ ...myClaim, status: 'pending' })
        setClaimed(true)
        setNotice('Pengajuan mengampu dikirim ulang. Admin akan meninjau kembali.')
      } else {
        const { data: inserted, error: insErr } = await supabase.from('course_claims').insert({
          course_id: c.id,
          mentor_id: user.id,
          status: 'pending',
        }).select('id').single()
        if (insErr) throw insErr
        await logAudit('course_claim.created', 'course_claims', null, {
          course_id: c.id,
          mentor_id: user.id,
        })
        setClaimed(true)
        setMyClaim({ id: (inserted as { id: string } | null)?.id ?? '', status: 'pending', decision_note: null })
        setNotice('Pengajuan mengampu terkirim. Setelah disetujui admin, kamu otomatis menjadi mentor course ini.')
      }
    } catch {
      setNotice('Gagal mengirim pengajuan mengampu. Periksa koneksi lalu coba lagi.')
    } finally {
      setClaimBusy(false)
    }
  }

  // Blok pendaftaran (tidak berubah isinya; tombol utama memakai btn-mint).
  // Untuk admin blok ini tidak ditampilkan — admin hanya memantau.
  const enrollBlock = !enrolled ? (
    <div className="enroll-block">
      {isAdmin ? (
        <p className="muted">
          Kamu masuk sebagai admin. Admin hanya memantau progres course, admin tidak
          mengambil course.
        </p>
      ) : isCourseMentor ? (
        <p className="muted">
          Kamu mengampu course ini. Lesson sudah terbuka untukmu.
        </p>
      ) : noMentor ? (
        <>
          <p className="muted">
            Course ini belum memiliki mentor. Ikuti daftar tunggu, kamu akan diberi tahu
            saat mentor ditugaskan.
          </p>
          <div className="form-actions">
            <button
              type="button"
              className="btn-mint"
              onClick={handleWaitlist}
              disabled={busy || onWaitlist}
            >
              {onWaitlist ? 'Sudah di Daftar Tunggu' : 'Ikuti untuk Bergabung'}
            </button>
            {profile?.role === 'mentor' && (
              myClaim?.status === 'rejected' ? (
                <>
                  <p className="error-box">
                    Pengajuan mengampu kamu ditolak{myClaim.decision_note ? `: ${myClaim.decision_note}` : '.'}
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleClaim}
                    disabled={claimBusy}
                  >
                    {claimBusy ? 'Mengirim…' : 'Ajukan Lagi'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleClaim}
                  disabled={claimBusy || claimed}
                >
                  {claimed
                    ? 'Pengajuan Mengampu Terkirim'
                    : claimBusy
                      ? 'Mengirim…'
                      : 'Ajukan untuk Mengampu'}
                </button>
              )
            )}
          </div>
        </>
      ) : isOtherMentor ? (
        <p className="notice-box">Course ini diampu mentor lain.</p>
      ) : (
        <>
          <button type="button" className="btn-mint" onClick={handleEnrollClick} disabled={busy}>
            {busy ? 'Memproses…' : 'Ambil Course'}
          </button>
          {askCode && (
            <form className="form form-inline" onSubmit={handleCodeSubmit}>
              <label>
                Kode Akses
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Masukkan kode akses course"
                  autoComplete="off"
                />
              </label>
              <button type="submit" className="btn btn-secondary" disabled={busy}>
                Konfirmasi Kode
              </button>
            </form>
          )}
        </>
      )}
      {codeError && <p className="error-box">{codeError}</p>}
      {!user && <p className="muted">Masuk terlebih dahulu untuk mengambil course ini.</p>}
    </div>
  ) : null

  // "Yang akan kamu pelajari": semua judul lesson asli di course ini.
  const learnList =
    allLessons.length > 0 ? (
      <>
        <h3>Yang akan kamu pelajari</h3>
        <ul className="learn-list">
          {allLessons.map((l) => (
            <li key={l.id} className="learn-item">
              <span className="learn-check">
                <Icon name="check" size={13} />
              </span>
              <span>{l.title}</span>
            </li>
          ))}
        </ul>
      </>
    ) : null

  const deskripsiPanel = (
    <section className="section" aria-label="Deskripsi">
      {isCourseMentor && <h2>Tentang Course</h2>}
      {course.description && <p>{course.description}</p>}
      {enrolled && nextLesson && !noMentor && (
        <p>
          <Link to={`/lesson/${nextLesson.id}`} className="btn-mint">
            Lanjut Belajar →
          </Link>
        </p>
      )}
      {enrolled && noMentor && (
        <p className="muted">
          Menunggu mentor — lesson belum bisa dimulai sampai mentor ditetapkan.
        </p>
      )}
      {isComplete && (
        <p>
          Course selesai.{' '}
          <Link to="/sertifikat" className="btn-mint">
            Lihat Sertifikat
          </Link>
        </p>
      )}
      {enrollBlock}
      {learnList}
    </section>
  )

  const materiPanel = (
    <section className="section" aria-label="Materi">
      <h2>Kurikulum</h2>
      {enrolled && sectionSummaries.length > 0 && (
        <p className="muted">{sectionSummaries.join(' · ')}</p>
      )}
      {modulesError && <p className="error-box">{modulesError}</p>}
      {modules.length === 0 ? (
        <p className="empty">Belum ada modul di course ini.</p>
      ) : (
        modules.map((m) => {
          // Section = modul order_index 1 (Section 1) atau 2 (Section 2);
          // Orientasi (order_index 0) tampil sebagai grup kecil sendiri.
          const isSection = m.order_index === 1 || m.order_index === 2
          const sectionDone = m.lessons.filter((l) => doneIds.has(l.id)).length
          const sectionComplete = isSection && sectionDone >= 5
          const groupTitle =
            m.title && m.title.trim()
              ? m.title
              : m.order_index === 0
                ? 'Orientasi'
                : m.order_index === 1
                  ? 'Section 1'
                  : m.order_index === 2
                    ? 'Section 2'
                    : `Modul ${m.order_index + 1}`
          return (
          <div key={m.id} className="module-block">
            <h3>
              {groupTitle}
              {m.release_label ? ` · ${m.release_label}` : ''}
              {isSection && (
                <>
                  {' · '}
                  <span className="muted">
                    {sectionDone}/5 selesai
                  </span>
                  {sectionComplete && (
                    <>
                      {' '}
                      <span className="badge-pass">Selesai</span>
                    </>
                  )}
                </>
              )}
            </h3>
            {m.lessons.length === 0 ? (
              <p className="empty">Belum ada lesson di modul ini.</p>
            ) : (
              <ol className="lesson-list">
                {m.lessons.map((l) => {
                  const done = doneIds.has(l.id)
                  // Gate Master Prompt §3: siswa belum boleh memulai
                  // course sebelum mentor ditetapkan. Peserta yang sudah
                  // terdaftar pun terkunci bila mentor course hilang
                  // (mis. mentor dilepas setelah pendaftaran); mentor
                  // pengampu dan admin tetap bisa membuka lesson.
                  const locked =
                    (!enrolled || noMentor) &&
                    course.mentor_id !== user?.id &&
                    profile?.role !== 'admin'
                  return (
                    <li key={l.id}>
                      {locked ? (
                        <span className="lesson-locked">
                          {l.lesson_code ? `${l.lesson_code}, ` : ''}
                          {l.title}{' '}
                          {noMentor
                            ? '(menunggu mentor — lesson belum bisa dimulai)'
                            : '(daftar dulu untuk membuka)'}
                        </span>
                      ) : (
                        <Link to={`/lesson/${l.id}`}>
                          {l.lesson_code ? `${l.lesson_code}, ` : ''}
                          {l.title}
                          {done ? ' ✓' : ''}
                        </Link>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
          )
        })
      )}
    </section>
  )

  const tugasPanel = (
    <section className="section" aria-label="Tugas">
      <h2>Tugas</h2>
      {courseAssignments.length === 0 ? (
        <p className="empty">Belum ada tugas di course ini.</p>
      ) : (
        <div className="course-list">
          {courseAssignments.map((a) => {
            const dl = deadlineInfo(a.due_date)
            const lessonTitle = lessonTitleById.get(a.lesson_id)
            return (
              <Link key={a.id} to={`/tugas/${a.id}`} className="task-card">
                <span className="task-icon">
                  <Icon name="fileText" size={24} />
                </span>
                <span className="task-body">
                  <h3>{a.title}</h3>
                  {lessonTitle && <p>{lessonTitle}</p>}
                  {a.description && <p>{a.description}</p>}
                  <span className={dl.cls}>{dl.text}</span>
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )

  const diskusiPanel = (
    <section className="section" aria-label="Diskusi">
      <h2>Diskusi</h2>
      {topDiscussions.length === 0 ? (
        <p className="empty">Belum ada diskusi di course ini.</p>
      ) : (
        <ul className="discussion-list">
          {topDiscussions.map((d) => {
            const replies = replyCounts.get(d.id) ?? 0
            return (
              <li key={d.id} className="discussion-item">
                <p className="discussion-meta">
                  {d.author?.name ?? 'Anggota'} ·{' '}
                  {new Date(d.created_at).toLocaleString('id-ID')}
                  {d.is_pinned ? ' · Disematkan' : ''}
                  {d.is_resolved ? ' · Selesai' : ''}
                </p>
                <p>{d.body}</p>
                {replies > 0 && <p className="muted">{replies} balasan</p>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )

  const gradesSection = showGrades ? (
    <section className="section" aria-label="Nilai per Komponen">
      <h2>Nilai per Komponen</h2>
      {gradeError ? (
        <p className="error-box">{gradeError}</p>
      ) : gradeComponents === null ? (
        <p className="muted">Memuat nilai…</p>
      ) : (
        <>
          <ul>
            <li>
              Pretest (5%):{' '}
              {gradeComponents.pretest === null
                ? 'belum ada nilai'
                : gradeComponents.pretest.toFixed(1)}
            </li>
            <li>
              Posttest (15%):{' '}
              {gradeComponents.posttest === null
                ? 'belum ada nilai'
                : gradeComponents.posttest.toFixed(1)}
            </li>
            <li>
              Tugas mingguan (30%):{' '}
              {gradeComponents.weeklyAssignments === null
                ? 'belum ada nilai'
                : gradeComponents.weeklyAssignments.toFixed(1)}
            </li>
            <li>
              Tugas praktik akhir (40%):{' '}
              {gradeComponents.finalPractice === null
                ? 'belum ada nilai'
                : gradeComponents.finalPractice.toFixed(1)}
            </li>
            <li>
              Diskusi (10%):{' '}
              {gradeComponents.discussion === null
                ? 'belum ada nilai'
                : gradeComponents.discussion.toFixed(1)}
            </li>
          </ul>
          <p>
            Nilai akhir:{' '}
            {hasAnyGrade ? (
              <>
                <strong>{gradeComponents.final.toFixed(1)}</strong>{' '}
                <span className={gradeComponents.passed ? 'badge-pass' : 'badge-fail'}>
                  {gradeComponents.passed ? 'Lulus' : 'Belum lulus'}
                </span>
              </>
            ) : (
              'belum ada nilai'
            )}
          </p>
          <p className="muted">
            Nilai akhir dihitung ulang dari komponen yang sudah ada nilainya saja;{' '}
            <Link to="/nilai">lihat semua nilai kamu di Gradebook</Link>.
          </p>
        </>
      )}
    </section>
  ) : null

  const liveSection = (
    <section className="section" aria-label="Kelas Live">
      <h2>Kelas Live</h2>
      {liveError && <p className="error-box">{liveError}</p>}
      {liveClasses.length === 0 ? (
        <p className="empty">Segera hadir — belum ada kelas live yang dijadwalkan untuk course ini.</p>
      ) : (
        <ul>
          {liveClasses.map((lc) => (
            <li key={lc.id}>
              <strong>{lc.title}</strong>
              {lc.scheduled_at && (
                <>
                  {' · '}
                  {new Date(lc.scheduled_at).toLocaleString('id-ID', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </>
              )}
              {lc.meet_url && (
                <>
                  {' '}
                  <a href={lc.meet_url} target="_blank" rel="noreferrer">
                    Gabung
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )

  // Panel admin: Ringkasan = deskripsi + yang dipelajari + nilai;
  // Aktivitas = tugas + diskusi + kelas live. Baris statistik
  // mentor/admin (Total Siswa, Tingkat Selesai) dihitung dari
  // enrollments + lesson_progress asli — lihat statsTask di load().
  const ringkasanPanel = (
    <>
      <section className="section" aria-label="Ringkasan">
        {course.description && <p>{course.description}</p>}
        {learnList}
        {enrollBlock}
      </section>
      {gradesSection}
    </>
  )
  const aktivitasPanel = (
    <>
      {tugasPanel}
      {diskusiPanel}
      {liveSection}
    </>
  )

  const tabList = isAdmin
    ? [
        { id: 'ringkasan', label: 'Ringkasan' },
        { id: 'aktivitas', label: 'Aktivitas' },
      ]
    : [
        { id: 'deskripsi', label: 'Deskripsi' },
        { id: 'materi', label: 'Materi' },
        { id: 'tugas', label: 'Tugas' },
        { id: 'diskusi', label: 'Diskusi' },
      ]
  const activeTabId = tabList.some((t) => t.id === activeTab) ? activeTab : tabList[0].id

  return (
    <div className="page">
      <Link to="/akademi" className="back-link">
        ← Akademi
      </Link>
      {heroSrc ? (
        <img className="detail-hero-img" src={heroSrc} alt="" />
      ) : (
        <div className="detail-hero-fallback">
          <Icon name="film" size={48} />
        </div>
      )}
      <div className="detail-title-row">
        <h1>{course.title}</h1>
        {course.mentor_id && (
          <span className="pill-active">{enrolled && isComplete ? 'Selesai' : 'Aktif'}</span>
        )}
      </div>
      <p className="muted">
        {course.category ?? 'Lainnya'} · {course.level ?? 'Semua level'}
        {week ? ` · ${week}` : ''} · Mentor:{' '}
        {mentorFailed ? 'gagal dimuat' : (mentorName ?? 'Belum ditugaskan')}
      </p>
      {enrolled && allLessons.length > 0 && (
        <div className="progress-block">
          <p className="muted">
            {doneCount} dari {allLessons.length} materi · {percent}%
          </p>
          <div
            className="progress-track"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progres ${course.title}: ${percent} persen`}
          >
            <div className="progress-fill" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      {notice && <p className="notice-box">{notice}</p>}

      {isCourseMentor && (
        <p>
          <Link to={`/mentor/course/${course.id}`} className="btn btn-secondary">
            Kelola Course
          </Link>
        </p>
      )}

      {(isCourseMentor || isAdmin) && courseStats !== null && (
        <div className="stat-grid" role="group" aria-label="Statistik course">
          <div className="stat-card">
            <span className="stat-num">{courseStats.students ?? '—'}</span>
            <span className="stat-label">Total Siswa</span>
          </div>
          <div className="stat-card">
            <span className="stat-num">
              {courseStats.completionPct === null ? '—' : `${courseStats.completionPct}%`}
            </span>
            <span className="stat-label">Tingkat Selesai</span>
          </div>
        </div>
      )}

      <div className="detail-tabs" role="tablist" aria-label="Bagian course">
        {tabList.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`detail-tab ${activeTabId === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
            aria-pressed={activeTabId === t.id}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isAdmin ? (
        activeTabId === 'ringkasan' ? ringkasanPanel : aktivitasPanel
      ) : (
        <>
          {activeTabId === 'deskripsi' && deskripsiPanel}
          {activeTabId === 'materi' && materiPanel}
          {activeTabId === 'tugas' && tugasPanel}
          {activeTabId === 'diskusi' && diskusiPanel}
          {gradesSection}
          {liveSection}
        </>
      )}
    </div>
  )
}
