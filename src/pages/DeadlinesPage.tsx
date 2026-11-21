// SINEVERSE — Tenggat Saya (getmydeadlines di artefak): semua tugas dari
// course yang diikuti siswa, diurutkan dari tenggat terdekat. Status dihitung
// dari submission: belum dikumpulkan, terlambat (lewat tenggat tanpa
// submission), atau sudah dikumpulkan. Kolom due_date ada di tabel
// assignments sejak migrasi 009; tugas tanpa due_date ditampilkan jujur
// sebagai "tanpa tenggat tercatat".
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'
import { fmtDate } from '../lib/guarded'
import {
  fetchAssignmentsForLessons,
  fetchCourseLessons,
  fetchCourses,
  fetchEnrollments,
  fetchSubmissions,
} from '../lib/supabase'
import type { Assignment } from '../lib/types'

type AssignmentRow = Assignment & { due_date?: string | null; rubric?: string | null }

interface DeadlineRow {
  assignment: AssignmentRow
  courseTitle: string
  lessonTitle: string
  submitted: boolean
  overdue: boolean
}

export default function DeadlinesPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState<DeadlineRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!user) return
      try {
        const enrollments = await fetchEnrollments(user.id)
        const courses = await fetchCourses()
        const courseById = new Map(courses.map((c) => [c.id, c.title]))
        const submissions = await fetchSubmissions(user.id)
        const submittedIds = new Set(submissions.map((s) => s.assignment_id))

        const allRows: DeadlineRow[] = []
        for (const en of enrollments) {
          const lessons = await fetchCourseLessons(en.course_id)
          if (lessons.length === 0) continue
          const lessonById = new Map(lessons.map((l) => [l.id, l.title]))
          const assignments = (await fetchAssignmentsForLessons(
            lessons.map((l) => l.id),
          )) as AssignmentRow[]
          for (const a of assignments) {
            const due = a.due_date ? new Date(a.due_date) : null
            const submitted = submittedIds.has(a.id)
            allRows.push({
              assignment: a,
              courseTitle: courseById.get(en.course_id) ?? 'Course',
              lessonTitle: lessonById.get(a.lesson_id) ?? 'Pelajaran',
              submitted,
              overdue: Boolean(due && due < new Date() && !submitted),
            })
          }
        }
        if (!cancelled) setRows(allRows)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat tenggat.')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user])

  if (!rows) {
    if (error) return <div className="page"><p className="error-box">{error}</p></div>
    return <div className="page"><p className="muted">Memuat tenggat…</p></div>
  }

  const overdue = rows
    .filter((r) => r.overdue)
    .sort((a, b) => (a.assignment.due_date ?? '').localeCompare(b.assignment.due_date ?? ''))
  const upcoming = rows
    .filter((r) => !r.submitted && !r.overdue && r.assignment.due_date)
    .sort((a, b) => (a.assignment.due_date ?? '').localeCompare(b.assignment.due_date ?? ''))
  const noDeadline = rows.filter((r) => !r.submitted && !r.assignment.due_date)
  const done = rows.filter((r) => r.submitted)

  function renderRow(r: DeadlineRow) {
    return (
      <li key={r.assignment.id} className="list-row">
        <div>
          <Link to={`/tugas/${r.assignment.id}`}>{r.assignment.title}</Link>
          <p className="muted">
            {r.courseTitle} · {r.lessonTitle}
          </p>
          <p className="muted">
            {r.assignment.due_date
              ? `Tenggat: ${fmtDate(r.assignment.due_date)}`
              : 'Tidak ada tenggat yang tercatat untuk tugas ini.'}
          </p>
        </div>
        <span className={`chip ${r.overdue ? 'chip-danger' : r.submitted ? 'chip-success' : ''}`}>
          {r.overdue ? 'Terlambat' : r.submitted ? 'Sudah dikumpulkan' : 'Belum dikumpulkan'}
        </span>
      </li>
    )
  }

  return (
    <div className="page">
      <PageHeader
        icon="clock"
        title="Tenggat Saya"
        subtitle="Tugas dari course yang kamu ikuti, diurutkan dari tenggat terdekat."
      />
      {rows.length === 0 ? (
        <EmptyState message="Belum ada tugas dari course yang kamu ikuti. Daftar ke course di Akademi untuk melihat tenggatmu di sini." actionLabel="Lihat Akademi" actionTo="/akademi" />
      ) : (
        <>
          {overdue.length > 0 && (
            <section className="section">
              <h2>Terlambat ({overdue.length})</h2>
              <ul className="list">{overdue.map(renderRow)}</ul>
            </section>
          )}
          {upcoming.length > 0 && (
            <section className="section">
              <h2>Mendatang ({upcoming.length})</h2>
              <ul className="list">{upcoming.map(renderRow)}</ul>
            </section>
          )}
          {noDeadline.length > 0 && (
            <section className="section">
              <h2>Tanpa tenggat tercatat ({noDeadline.length})</h2>
              <ul className="list">{noDeadline.map(renderRow)}</ul>
            </section>
          )}
          {done.length > 0 && (
            <section className="section">
              <h2>Sudah dikumpulkan ({done.length})</h2>
              <ul className="list">{done.map(renderRow)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
