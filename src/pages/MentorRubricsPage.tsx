// SINEVERSE — Mentor Workspace: Daftar Rubrik.
// Semua rubrik (assignment_rubrics + rubric_criteria) untuk tugas di
// course yang diampu mentor, beserta total skor maksimalnya. Daftar ini
// read-only; rubrik diedit dari Course Builder. Mentor hanya melihat
// rubrik di course-nya sendiri; admin melihat semua.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchCourses, supabase } from '../lib/supabase'
import type { Assignment, AssignmentRubric, Course, RubricCriterion } from '../lib/types'
import PageHeader from '../components/PageHeader'
import WorkspaceNav from '../components/WorkspaceNav'
import { MENTOR_NAV } from '../lib/workspaceNav'
import EmptyState from '../components/EmptyState'

interface RubricRow {
  rubric: AssignmentRubric
  assignment: Assignment
  course: Course
  criteria: RubricCriterion[]
  totalMax: number
}

export default function MentorRubricsPage() {
  const { user, profile } = useAuth()
  const [rows, setRows] = useState<RubricRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isMentor = profile?.role === 'mentor' || profile?.role === 'admin'

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    const currentUser = user
    const isAdmin = profile?.role === 'admin'
    let cancelled = false
    async function load() {
      try {
        const courses = await fetchCourses()
        const mine = isAdmin ? courses : courses.filter((c) => c.mentor_id === currentUser.id)
        if (mine.length === 0) {
          if (!cancelled) setRows([])
          return
        }
        const courseById = new Map(mine.map((c) => [c.id, c]))
        const { data: mods } = await supabase
          .from('modules')
          .select('id,course_id')
          .in('course_id', mine.map((c) => c.id))
        const modRows = (mods ?? []) as { id: string; course_id: string }[]
        if (modRows.length === 0) {
          if (!cancelled) setRows([])
          return
        }
        const moduleCourse = new Map(modRows.map((m) => [m.id, m.course_id]))
        const { data: lessons } = await supabase
          .from('lessons')
          .select('id,module_id')
          .in('module_id', modRows.map((m) => m.id))
        const lessonRows = (lessons ?? []) as { id: string; module_id: string }[]
        if (lessonRows.length === 0) {
          if (!cancelled) setRows([])
          return
        }
        const lessonCourse = new Map(
          lessonRows.map((l) => [l.id, moduleCourse.get(l.module_id) ?? '']),
        )
        const { data: assigns } = await supabase
          .from('assignments')
          .select('*')
          .in('lesson_id', lessonRows.map((l) => l.id))
        const assignmentRows = (assigns ?? []) as Assignment[]
        if (assignmentRows.length === 0) {
          if (!cancelled) setRows([])
          return
        }
        const assignmentById = new Map(assignmentRows.map((a) => [a.id, a]))
        const { data: rubrics } = await supabase
          .from('assignment_rubrics')
          .select('*')
          .in('assignment_id', assignmentRows.map((a) => a.id))
          .order('created_at')
        const rubricRows = (rubrics ?? []) as AssignmentRubric[]
        if (rubricRows.length === 0) {
          if (!cancelled) setRows([])
          return
        }
        const { data: criteria } = await supabase
          .from('rubric_criteria')
          .select('*')
          .in('rubric_id', rubricRows.map((r) => r.id))
          .order('order_index')
        const criterionRows = (criteria ?? []) as RubricCriterion[]
        const byRubric = new Map<string, RubricCriterion[]>()
        for (const c of criterionRows) {
          const list = byRubric.get(c.rubric_id) ?? []
          list.push(c)
          byRubric.set(c.rubric_id, list)
        }
        const out: RubricRow[] = []
        for (const rubric of rubricRows) {
          const assignment = assignmentById.get(rubric.assignment_id)
          if (!assignment) continue
          const course = courseById.get(lessonCourse.get(assignment.lesson_id) ?? '')
          if (!course) continue
          const criteriaList = byRubric.get(rubric.id) ?? []
          out.push({
            rubric,
            assignment,
            course,
            criteria: criteriaList,
            totalMax: criteriaList.reduce((s, c) => s + c.max_score, 0),
          })
        }
        out.sort((a, b) => {
          if (a.course.title !== b.course.title) return a.course.title.localeCompare(b.course.title)
          return a.assignment.title.localeCompare(b.assignment.title)
        })
        if (!cancelled) setRows(out)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat daftar rubrik.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user, profile?.role])

  if (loading) return <div className="page"><p className="muted">Memuat…</p></div>
  if (!isMentor) {
    return (
      <div className="page">
        <h1>Daftar Rubrik</h1>
        <p className="empty">Halaman ini hanya untuk mentor.</p>
      </div>
    )
  }
  if (error) return <div className="page"><p className="error-box">{error}</p></div>

  return (
    <div className="page">
      <PageHeader
        icon="grade"
        title="Daftar Rubrik"
        subtitle="Rubrik penilaian tugas di course yang kamu ampu, beserta kriterianya."
      />
      <WorkspaceNav entries={MENTOR_NAV} />
      {rows.length === 0 ? (
        <EmptyState message="Belum ada rubrik. Buat rubrik dari Course Builder saat membuat atau mengedit tugas." actionLabel="Buka Course Builder" actionTo="/mentor/course-builder" />
      ) : (
        <ul className="discussion-list">
          {rows.map(({ rubric, assignment, course, criteria, totalMax }) => (
            <li key={rubric.id} className="discussion-item">
              <p className="discussion-meta">
                {course.title} · Tugas: {assignment.title} (maks. {assignment.max_score})
              </p>
              <h3>{rubric.title}</h3>
              {criteria.length === 0 ? (
                <p className="muted">Rubrik ini belum punya kriteria.</p>
              ) : (
                <ul>
                  {criteria.map((c) => (
                    <li key={c.id}>
                      {c.title} — maks. {c.max_score}
                      {c.description ? <span className="muted"> · {c.description}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
              <p className="muted">Total maksimal rubrik: {totalMax}</p>
              <p>
                <Link to={`/mentor/course/${course.id}`} className="btn btn-ghost btn-small">Edit di Course Builder</Link>
              </p>
            </li>
          ))}
        </ul>
      )}
      <p><Link to="/mentor">Kembali ke Mentor Workspace</Link></p>
    </div>
  )
}
