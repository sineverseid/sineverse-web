// SINEVERSE — Course Builder (tab Workspace mentor): pilih course yang
// kamu ampu untuk dibuka builder-nya (modul, lesson, tugas, kuis, ujian).
// Sama seperti artefak: Workspace mentor hanya punya 2 tab, Overview dan
// Course Builder; halaman ini adalah isi tab Course Builder.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchCourses } from '../lib/supabase'
import type { Course } from '../lib/types'
import PageHeader from '../components/PageHeader'
import WorkspaceNav from '../components/WorkspaceNav'
import { MENTOR_NAV } from '../lib/workspaceNav'
import EmptyState from '../components/EmptyState'

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
        <ul className="course-list">
          {courses.map((c) => (
            <li key={c.id} className="course-card">
              <Link to={`/mentor/course/${c.id}`}>
                <h3>{c.title}</h3>
                <p>{c.description ?? ''}</p>
                <p className="muted">{c.category ?? 'Course'} — Buka Course Builder →</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p>
        <Link to="/mentor" className="btn btn-ghost">← Kembali ke Overview</Link>
      </p>
    </div>
  )
}
