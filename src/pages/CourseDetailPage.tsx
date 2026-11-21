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
import { courseCoverKey, rpsWeekLabel } from '../lib/brand'
import {
  enrollInCourse,
  fetchCourse,
  fetchEnrollment,
  fetchLessonProgress,
  fetchMentorName,
  fetchModules,
  fetchWaitlistEntry,
  joinWaitlist,
  logAudit,
  supabase,
} from '../lib/supabase'
import type { Course, Lesson, LessonProgress, Module } from '../lib/types'

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

        const modulesTask = (async () => {
          // Modul + lesson: gagal tidak boleh mengosongkan halaman.
          // Satu query lesson untuk semua modul (bukan satu per modul),
          // diurutkan seperti fetchCourseLessons: (urutan modul, urutan
          // lesson). Query .in() langsung dipakai di sini — bukan
          // fetchCourseLessons — karena fungsi itu memuat ulang modul
          // secara internal, sementara modul sudah ada di sini.
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
          } catch {
            if (!cancelled) setModulesError('Modul gagal dimuat. Coba muat ulang halaman.')
          }
        })()

        const userTasks = user
          ? Promise.all([
              (async () => {
                try {
                  const enr = await fetchEnrollment(user.id, c.id)
                  if (!cancelled) setEnrolled(enr !== null)
                } catch {
                  // Enrollment gagal dibaca: perlakukan sebagai belum terdaftar.
                }
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

        await Promise.all([mentorTask, modulesTask, userTasks])
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
    </div>
  )
}
