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
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { GRADEBOOK_WEIGHTS, PASSING_GRADE, courseCoverKey, rpsWeekLabel } from '../lib/brand'
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

  const [code, setCode] = useState('')
  const [askCode, setAskCode] = useState(false)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [claimBusy, setClaimBusy] = useState(false)
  const [claimed, setClaimed] = useState(false)

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
                          .select('id')
                          .eq('mentor_id', user.id)
                          .eq('course_id', c.id)
                          .maybeSingle()
                        if (!cancelled && data) setClaimed(true)
                      } catch {
                        // Pengajuan lama gagal dibaca: tombol tetap bisa dikirim.
                      }
                    })(),
                  ]
                : []),
            ])
          : Promise.resolve()

        await Promise.all([mentorTask, modulesTask, userTasks, gradesTask, liveTask])
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
  const coverKey = courseCoverKey(course.title)
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

  async function doEnroll() {
    if (!user || !course) return
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
      const { error: insErr } = await supabase.from('course_claims').insert({
        course_id: c.id,
        mentor_id: user.id,
        status: 'pending',
      })
      if (insErr) throw insErr
      await logAudit('course_claim.created', 'course_claims', null, {
        course_id: c.id,
        mentor_id: user.id,
      })
      setClaimed(true)
      setNotice('Pengajuan mengampu terkirim. Admin akan meninjau pengajuan kamu.')
    } catch {
      setNotice('Gagal mengirim pengajuan mengampu. Periksa koneksi lalu coba lagi.')
    } finally {
      setClaimBusy(false)
    }
  }

  return (
    <div className="page">
      <Link to="/akademi" className="back-link">
        ← Akademi
      </Link>
      {course.cover_url ? (
        <div className="course-cover course-cover-img" aria-hidden="true">
          <img src={course.cover_url} alt="" />
          {week && <span className="course-cover-week">{week}</span>}
          <span className="course-cover-cat">{course.category ?? 'Perfilman'}</span>
        </div>
      ) : (
        <div className={`course-cover cover-${coverKey}`} aria-hidden="true">
          {week && <span className="course-cover-week">{week}</span>}
          <span className="course-cover-cat">{course.category ?? 'Perfilman'}</span>
        </div>
      )}
      <h1>{course.title}</h1>
      <p className="muted">
        {course.category ?? 'Lainnya'} · {course.level ?? 'Semua level'}
        {week ? ` · ${week}` : ''} · Mentor:{' '}
        {mentorFailed ? 'gagal dimuat' : (mentorName ?? 'Belum ditugaskan')}
      </p>
      {course.description && <p>{course.description}</p>}

      {notice && <p className="notice-box">{notice}</p>}

      {enrolled && allLessons.length > 0 && (
        <div className="progress-block">
          <p>
            Progress: {doneCount} dari {allLessons.length} lesson selesai ({percent}%)
          </p>
          <div className="progress-bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-fill" style={{ width: `${percent}%` }} />
          </div>
          {percent === 100 ? (
            <p>
              Course selesai.{' '}
              <Link to="/sertifikat">Lihat sertifikat kamu.</Link>
            </p>
          ) : (
            nextLesson && (
              <Link to={`/lesson/${nextLesson.id}`} className="btn btn-primary">
                Lanjutkan: {nextLesson.title}
              </Link>
            )
          )}
        </div>
      )}

      {showGrades && (
        <section className="section">
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
      )}

      {!enrolled && (
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
                  className="btn btn-primary"
                  onClick={handleWaitlist}
                  disabled={busy || onWaitlist}
                >
                  {onWaitlist ? 'Sudah di Daftar Tunggu' : 'Ikuti untuk Bergabung'}
                </button>
                {profile?.role === 'mentor' && (
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
                )}
              </div>
            </>
          ) : isOtherMentor ? (
            <p className="notice-box">Course ini diampu mentor lain.</p>
          ) : (
            <>
              <button type="button" className="btn btn-primary" onClick={handleEnrollClick} disabled={busy}>
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
      )}

      <section className="section">
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
                    const locked =
                      !enrolled && course.mentor_id !== user?.id && profile?.role !== 'admin'
                    return (
                      <li key={l.id}>
                        {locked ? (
                          <span className="lesson-locked">
                            {l.lesson_code ? `${l.lesson_code}, ` : ''}
                            {l.title} (daftar dulu untuk membuka)
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

      <section className="section">
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
    </div>
  )
}
