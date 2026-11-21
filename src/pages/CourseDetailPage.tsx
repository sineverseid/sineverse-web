// SINEVERSE — Detail course: deskripsi, mentor, level, modul + lesson,
// progress, dan pendaftaran ("Ambil Course").
//
// Aturan pendaftaran:
// - Course tanpa mentor → waitlist "Ikuti untuk Bergabung", bukan enrol.
// - Course dengan enrollment_key → minta kode (case-insensitive), tolak kode salah.
// - Selain itu → enrol langsung.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  enrollInCourse,
  fetchCourse,
  fetchEnrollment,
  fetchLessonProgress,
  fetchLessons,
  fetchMentorName,
  fetchModules,
  fetchWaitlistEntry,
  joinWaitlist,
} from '../lib/supabase'
import type { Course, Lesson, LessonProgress, Module } from '../lib/types'

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [course, setCourse] = useState<Course | null>(null)
  const [mentorName, setMentorName] = useState<string | null>(null)
  const [modules, setModules] = useState<(Module & { lessons: Lesson[] })[]>([])
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
        setMentorName(await fetchMentorName(c.mentor_id))
        const mods = await fetchModules(c.id)
        const withLessons = await Promise.all(
          mods.map(async (m) => ({ ...m, lessons: await fetchLessons(m.id) })),
        )
        if (cancelled) return
        setModules(withLessons)
        if (user) {
          const [enr, prog, wl] = await Promise.all([
            fetchEnrollment(user.id, c.id),
            fetchLessonProgress(user.id),
            c.mentor_id === null ? fetchWaitlistEntry(user.id, c.id) : Promise.resolve(false),
          ])
          if (cancelled) return
          setEnrolled(enr !== null)
          setProgress(prog)
          setOnWaitlist(wl)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat course.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id, user])

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

  async function doEnroll() {
    if (!user || !course) return
    const c = course
    setBusy(true)
    setCodeError(null)
    try {
      await enrollInCourse(user.id, c.id)
      setEnrolled(true)
      setNotice('Kamu berhasil mengambil course ini. Selamat belajar.')
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : 'Gagal mendaftar ke course.')
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

  return (
    <div className="page">
      <Link to="/akademi" className="back-link">
        ← Akademi
      </Link>
      <h1>{course.title}</h1>
      <p className="muted">
        {course.category ?? 'Lainnya'} · {course.level ?? 'Semua level'} · Mentor:{' '}
        {mentorName ?? 'Belum ditugaskan'}
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
          {nextLesson && (
            <Link to={`/lesson/${nextLesson.id}`} className="btn btn-primary">
              Lanjutkan: {nextLesson.title}
            </Link>
          )}
        </div>
      )}

      {!enrolled && (
        <div className="enroll-block">
          {noMentor ? (
            <>
              <p className="muted">
                Course ini belum memiliki mentor. Ikuti daftar tunggu — kamu akan diberi tahu
                saat mentor ditugaskan.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleWaitlist}
                disabled={busy || onWaitlist}
              >
                {onWaitlist ? 'Sudah di Daftar Tunggu' : 'Ikuti untuk Bergabung'}
              </button>
            </>
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
        {modules.length === 0 ? (
          <p className="empty">Belum ada modul di course ini.</p>
        ) : (
          modules.map((m) => (
            <div key={m.id} className="module-block">
              <h3>
                {m.title}
                {m.release_label ? ` · ${m.release_label}` : ''}
              </h3>
              {m.lessons.length === 0 ? (
                <p className="empty">Belum ada lesson di modul ini.</p>
              ) : (
                <ol className="lesson-list">
                  {m.lessons.map((l) => {
                    const done = doneIds.has(l.id)
                    const locked = !enrolled
                    return (
                      <li key={l.id}>
                        {locked ? (
                          <span className="lesson-locked">
                            {l.lesson_code ? `${l.lesson_code} — ` : ''}
                            {l.title} (daftar dulu untuk membuka)
                          </span>
                        ) : (
                          <Link to={`/lesson/${l.id}`}>
                            {l.lesson_code ? `${l.lesson_code} — ` : ''}
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
          ))
        )}
      </section>
    </div>
  )
}
