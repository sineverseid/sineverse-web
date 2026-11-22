// SINEVERSE — Tenggat Saya (getmydeadlines di artefak): semua tugas dari
// course yang diikuti siswa, diurutkan dari tenggat terdekat. Status dihitung
// dari submission: belum dikumpulkan, terlambat (lewat tenggat tanpa
// submission), atau sudah dikumpulkan. Kolom due_date ada di tabel
// assignments sejak migrasi 009; tugas tanpa due_date ditampilkan jujur
// sebagai "tanpa tenggat tercatat".
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import Icon from '../components/icons'
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
  submittedAt: string | null
  overdue: boolean
}

export default function DeadlinesPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState<DeadlineRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'aktif' | 'riwayat'>('aktif')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!user) return
      try {
        const [enrollments, courses, submissions] = await Promise.all([
          fetchEnrollments(user.id),
          fetchCourses(),
          fetchSubmissions(user.id),
        ])
        const courseById = new Map(courses.map((c) => [c.id, c.title]))
        const submittedIds = new Set(submissions.map((s) => s.assignment_id))
        const submittedAtById = new Map(submissions.map((s) => [s.assignment_id, s.submitted_at]))

        // Lesson semua course yang diambil, diambil paralel (bukan satu per
        // satu) supaya halaman tenggat tidak lama memuat.
        const lessonsPerCourse = await Promise.all(
          enrollments.map(async (en) => ({
            courseId: en.course_id,
            lessons: await fetchCourseLessons(en.course_id),
          })),
        )
        const allLessonIds = lessonsPerCourse.flatMap((x) => x.lessons.map((l) => l.id))
        const allAssignments = (
          await fetchAssignmentsForLessons(allLessonIds)
        ) as AssignmentRow[]
        const assignByLesson = new Map<string, AssignmentRow[]>()
        for (const a of allAssignments) {
          const arr = assignByLesson.get(a.lesson_id) ?? []
          arr.push(a)
          assignByLesson.set(a.lesson_id, arr)
        }
        const allRows: DeadlineRow[] = []
        for (const en of enrollments) {
          const entry = lessonsPerCourse.find((x) => x.courseId === en.course_id)
          const lessons = entry?.lessons ?? []
          if (lessons.length === 0) continue
          const lessonById = new Map(lessons.map((l) => [l.id, l.title]))
          const assignments = lessons.flatMap((l) => assignByLesson.get(l.id) ?? [])
          for (const a of assignments) {
            const due = a.due_date ? new Date(a.due_date) : null
            const submitted = submittedIds.has(a.id)
            allRows.push({
              assignment: a,
              courseTitle: courseById.get(en.course_id) ?? 'Course',
              lessonTitle: lessonById.get(a.lesson_id) ?? 'Pelajaran',
              submitted,
              submittedAt: submittedAtById.get(a.id) ?? null,
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
  const aktif = rows.filter((r) => !r.submitted)

  function renderRow(r: DeadlineRow) {
    const due = r.assignment.due_date ? new Date(r.assignment.due_date) : null
    const soon =
      !r.submitted &&
      !r.overdue &&
      due !== null &&
      due.getTime() - Date.now() <= 3 * 24 * 60 * 60 * 1000
    const badgeClass = r.submitted
      ? 'task-deadline normal'
      : r.overdue
        ? 'task-deadline'
        : !due
          ? 'task-deadline none'
          : soon
            ? 'task-deadline soon'
            : 'task-deadline normal'
    const badgeText = r.submitted
      ? `Terkumpul: ${fmtDate(r.submittedAt)}`
      : r.overdue
        ? `Terlambat: ${fmtDate(r.assignment.due_date)}`
        : !due
          ? 'Tanpa tenggat'
          : `Tenggat: ${fmtDate(r.assignment.due_date)}`
    const description = r.assignment.description?.trim() ?? ''
    const snippet = description.length > 120 ? `${description.slice(0, 120)}…` : description
    return (
      <li key={r.assignment.id}>
        <Link to={`/tugas/${r.assignment.id}`} className="task-card">
          <span className="task-icon">
            <Icon name={r.submitted ? 'check' : 'fileText'} size={24} />
          </span>
          <div className="task-body">
            <h3>{r.assignment.title}</h3>
            <p>
              {r.courseTitle} · {r.lessonTitle}
            </p>
            {snippet ? <p>{snippet}</p> : null}
            <span className={badgeClass}>{badgeText}</span>
          </div>
          <span className="muted" aria-hidden="true">
            <Icon name="chevronRight" size={20} />
          </span>
        </Link>
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
          <div className="pill-tabs" role="tablist" aria-label="Filter tugas">
            <button
              type="button"
              className={`pill-tab${tab === 'aktif' ? ' active' : ''}`}
              onClick={() => setTab('aktif')}
            >
              Aktif ({aktif.length})
            </button>
            <button
              type="button"
              className={`pill-tab${tab === 'riwayat' ? ' active' : ''}`}
              onClick={() => setTab('riwayat')}
            >
              Riwayat ({done.length})
            </button>
          </div>
          {tab === 'aktif' ? (
            <>
              {overdue.length > 0 && (
                <section className="section">
                  <div className="dash-section-head">
                    <h2>Terlambat ({overdue.length})</h2>
                  </div>
                  <ul className="list">{overdue.map(renderRow)}</ul>
                </section>
              )}
              {upcoming.length > 0 && (
                <section className="section">
                  <div className="dash-section-head">
                    <h2>Mendatang ({upcoming.length})</h2>
                  </div>
                  <ul className="list">{upcoming.map(renderRow)}</ul>
                </section>
              )}
              {noDeadline.length > 0 && (
                <section className="section">
                  <div className="dash-section-head">
                    <h2>Tugas Lainnya ({noDeadline.length})</h2>
                  </div>
                  <ul className="list">{noDeadline.map(renderRow)}</ul>
                </section>
              )}
              {aktif.length === 0 && <p className="empty">Tidak ada tugas aktif.</p>}
            </>
          ) : done.length > 0 ? (
            <section className="section">
              <div className="dash-section-head">
                <h2>Sudah dikumpulkan ({done.length})</h2>
              </div>
              <ul className="list">{done.map(renderRow)}</ul>
            </section>
          ) : (
            <p className="empty">Belum ada tugas yang terkumpul.</p>
          )}
        </>
      )}
    </div>
  )
}
