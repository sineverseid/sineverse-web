// SINEVERSE — Course Builder (tab Workspace mentor): pilih course yang
// kamu ampu untuk dibuka builder-nya (modul, lesson, tugas, kuis, ujian).
// Sama seperti artefak: Workspace mentor hanya punya 2 tab, Overview dan
// Course Builder; halaman ini adalah isi tab Course Builder.
// Catatan: halaman ini HANYA pemilih course. Penyusunan modul, lesson,
// tugas, kuis, dan ujian berlangsung di halaman detail builder
// (/mentor/course/:id), bukan di file ini — file ini tidak pernah
// memuatnya, jadi tidak ada fungsi builder yang diubah di sini.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchCourses } from '../lib/supabase'
import type { Course } from '../lib/types'
import PageHeader from '../components/PageHeader'
import WorkspaceNav from '../components/WorkspaceNav'
import { MENTOR_NAV } from '../lib/workspaceNav'
import EmptyState from '../components/EmptyState'
import Icon from '../components/icons'

export default function MentorCourseBuilderPage() {
  const { user, profile } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    const currentUser = user
    let cancelled = false
    fetchCourses()
      .then((all) => {
        if (cancelled) return
        const mine =
          profile?.role === 'admin'
            ? all
            : all.filter((c) => c.mentor_id === currentUser.id)
        setCourses(mine)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat course.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, profile?.role])

  if (loading) return <div className="page"><p className="muted">Memuat course…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>

  return (
    <div className="page">
      <PageHeader
        icon="academy"
        title="Course Builder"
        subtitle="Pilih course untuk menyusun modul, lesson, tugas, kuis, dan ujian."
      />
      <WorkspaceNav entries={MENTOR_NAV} />
      {courses.length === 0 ? (
        <EmptyState message="Kamu belum mengampu course apa pun. Ajukan course tanpa mentor dari tab Overview di Mentor Workspace." />
      ) : (
        <section className="section">
          <div className="dash-section-head">
            <h2>Course Saya</h2>
          </div>
          <ul className="course-list">
            {courses.map((c) => {
              const meta = [c.category, c.level].filter((v): v is string => Boolean(v)).join(' • ')
              return (
                <li key={c.id}>
                  <Link className="dash-course" to={`/mentor/course/${c.id}`}>
                    <span className="dash-course-cover">
                      {c.cover_url ? (
                        <img src={c.cover_url} alt="" />
                      ) : (
                        <Icon name="academy" size={40} />
                      )}
                    </span>
                    <span className="dash-course-body">
                      <h3>{c.title}</h3>
                      <p className="dash-course-meta">{meta || 'Course'}</p>
                      {c.description && <p className="dash-course-meta">{c.description}</p>}
                    </span>
                    <span className="dash-course-play">
                      <Icon name="play" size={20} />
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      <p>
        <Link to="/mentor" className="btn btn-ghost">← Kembali ke Overview</Link>
      </p>
    </div>
  )
}
