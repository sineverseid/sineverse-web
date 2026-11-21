// SINEVERSE — Beranda / dashboard per peran.
// Ringkas: course saya, lanjutkan belajar, pengumuman.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  fetchCourseLessons,
  fetchCourses,
  fetchEnrollments,
  fetchLessonProgress,
} from '../lib/supabase'
import type { Course, LessonProgress } from '../lib/types'

export default function HomePage() {
  const { user, profile, loading: authLoading } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [enrolledIds, setEnrolledIds] = useState<string[]>([])
  const [progress, setProgress] = useState<LessonProgress[]>([])
  const [continueTo, setContinueTo] = useState<{ courseId: string; lessonId: string; title: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const all = await fetchCourses()
        if (cancelled) return
        setCourses(all)
        if (user) {
          const [enr, prog] = await Promise.all([
            fetchEnrollments(user.id),
            fetchLessonProgress(user.id),
          ])
          if (cancelled) return
          setEnrolledIds(enr.map((e) => e.course_id))
          setProgress(prog)
          // Lanjutkan belajar: lesson pertama yang belum selesai di course
          // pertama yang sedang diambil.
          for (const e of enr) {
            const lessons = await fetchCourseLessons(e.course_id)
            const done = new Set(
              prog.filter((p) => p.status === 'completed').map((p) => p.lesson_id),
            )
            const next = lessons.find((l) => !done.has(l.id))
            if (next) {
              if (cancelled) return
              const course = all.find((c) => c.id === e.course_id)
              setContinueTo({
                courseId: e.course_id,
                lessonId: next.id,
                title: `${course?.title ?? 'Course'} — ${next.title}`,
              })
              break
            }
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat data.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user])

  if (authLoading || loading) {
    return (
      <div className="page">
        <p className="muted">Memuat…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <p className="error-box">{error}</p>
      </div>
    )
  }

  const myCourses = courses.filter((c) => enrolledIds.includes(c.id))
  const roleLabel =
    profile?.role === 'admin' ? 'Admin' : profile?.role === 'mentor' ? 'Mentor' : 'Siswa'

  return (
    <div className="page">
      <section className="hero">
        <p className="hero-eyebrow">SINEVERSE</p>
        <h1>Your World of Filmmaking</h1>
        <p className="hero-sub">
          Platform pendidikan filmmaking nasional untuk pelajar SMA/SMK di seluruh Indonesia.
        </p>
        {!user && (
          <div className="hero-actions">
            <Link to="/register" className="btn btn-primary">
              Daftar Gratis
            </Link>
            <Link to="/akademi" className="btn btn-secondary">
              Lihat Akademi
            </Link>
          </div>
        )}
      </section>

      {user && (
        <>
          <section className="section">
            <h2>Selamat datang, {profile?.name ?? profile?.email ?? 'SINEVERSE'}</h2>
            <p className="muted">
              Peran: {roleLabel}
              {profile?.city ? ` · ${profile.city}` : ''}
            </p>
            {continueTo && (
              <div className="continue-card">
                <p className="muted">Lanjutkan belajar</p>
                <p className="continue-title">{continueTo.title}</p>
                <Link to={`/lesson/${continueTo.lessonId}`} className="btn btn-primary">
                  Lanjutkan
                </Link>
              </div>
            )}
            {enrolledIds.length > 0 && !continueTo && (
              <p className="muted">Semua lesson di course kamu sudah selesai. Kerja bagus.</p>
            )}
          </section>

          <section className="section">
            <div className="section-head">
              <h2>Course Saya</h2>
              <Link to="/akademi">Lihat semua</Link>
            </div>
            {myCourses.length === 0 ? (
              <p className="empty">
                Kamu belum mengambil course apa pun.{' '}
                <Link to="/akademi">Jelajahi Akademi</Link> untuk memulai.
              </p>
            ) : (
              <ul className="course-list">
                {myCourses.map((c) => (
                  <li key={c.id} className="course-card">
                    <Link to={`/course/${c.id}`}>
                      <h3>{c.title}</h3>
                      <p>{c.description}</p>
                      <span className="chip">{c.level ?? 'Semua level'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="section">
            <h2>Pengumuman</h2>
            <p className="empty">Belum ada pengumuman.</p>
          </section>

          <section className="section">
            <h2>Ringkasan</h2>
            <p className="muted">
              {myCourses.length} course diambil · {progress.filter((p) => p.status === 'completed').length}{' '}
              lesson selesai
            </p>
            <p>
              <Link to="/nilai">Lihat Nilai Saya</Link>
              {' · '}
              <Link to="/rps">Lihat RPS Semester 1</Link>
            </p>
          </section>
        </>
      )}

      {!user && (
        <section className="section">
          <div className="section-head">
            <h2>Course Semester 1</h2>
            <Link to="/akademi">Lihat semua</Link>
          </div>
          {courses.length === 0 ? (
            <p className="empty">Belum ada course yang tersedia.</p>
          ) : (
            <ul className="course-list">
              {courses.slice(0, 4).map((c) => (
                <li key={c.id} className="course-card">
                  <Link to={`/course/${c.id}`}>
                    <h3>{c.title}</h3>
                    <p>{c.description}</p>
                    <span className="chip">{c.level ?? 'Semua level'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
