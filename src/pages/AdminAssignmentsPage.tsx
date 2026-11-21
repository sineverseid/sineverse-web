// SINEVERSE — Admin Academy: Monitoring Tugas.
// Tabel semua assignment di semua course: course, lesson, judul, jenis,
// deadline, jumlah submission, belum dinilai, dan terlambat.
// "Terlambat" memakai submissions.submitted_at (kolom waktu pengiriman
// yang ada di skema; submissions tidak punya created_at) dibanding
// due_date, hanya bila due_date terisi.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchCourses, supabase } from '../lib/supabase'
import type { Assignment, Lesson, Module, Submission } from '../lib/types'
import PageHeader from '../components/PageHeader'

interface AssignmentRow {
  assignment: Assignment
  courseTitle: string
  lessonTitle: string
  total: number
  ungraded: number
  late: number
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AdminAssignmentsPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<AssignmentRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const courses = await fetchCourses()
        const courseById = new Map(courses.map((c) => [c.id, c.title]))
        const { data: mods } = await supabase.from('modules').select('id,course_id')
        const modRows = (mods ?? []) as Module[]
        const modCourse = new Map(modRows.map((m) => [m.id, m.course_id]))
        let lessonRows: Lesson[] = []
        if (modRows.length > 0) {
          const { data: lessons } = await supabase
            .from('lessons')
            .select('id,module_id,title')
            .in('module_id', modRows.map((m) => m.id))
          lessonRows = (lessons ?? []) as Lesson[]
        }
        const lessonById = new Map(lessonRows.map((l) => [l.id, l]))
        let assignments: Assignment[] = []
        if (lessonRows.length > 0) {
          const { data: assigns } = await supabase
            .from('assignments')
            .select('*')
            .in('lesson_id', lessonRows.map((l) => l.id))
            .order('created_at', { ascending: false })
          assignments = (assigns ?? []) as Assignment[]
        }
        let submissions: Submission[] = []
        if (assignments.length > 0) {
          const { data: subs } = await supabase
            .from('submissions')
            .select('id,assignment_id,score,submitted_at')
            .in('assignment_id', assignments.map((a) => a.id))
          submissions = (subs ?? []) as Submission[]
        }
        const subsByAssignment = new Map<string, Submission[]>()
        for (const s of submissions) {
          const arr = subsByAssignment.get(s.assignment_id) ?? []
          arr.push(s)
          subsByAssignment.set(s.assignment_id, arr)
        }
        const out: AssignmentRow[] = assignments.map((a) => {
          const lesson = lessonById.get(a.lesson_id)
          const courseId = lesson ? modCourse.get(lesson.module_id) ?? '' : ''
          const subs = subsByAssignment.get(a.id) ?? []
          const late = a.due_date
            ? subs.filter((s) => new Date(s.submitted_at) > new Date(a.due_date as string)).length
            : 0
          return {
            assignment: a,
            courseTitle: courseById.get(courseId) ?? 'Course',
            lessonTitle: lesson?.title ?? 'Lesson',
            total: subs.length,
            ungraded: subs.filter((s) => s.score === null).length,
            late,
          }
        })
        out.sort((a, b) =>
          a.courseTitle.localeCompare(b.courseTitle) ||
          a.lessonTitle.localeCompare(b.lessonTitle) ||
          a.assignment.title.localeCompare(b.assignment.title),
        )
        if (!cancelled) setRows(out)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat tugas.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  if (profile?.role !== 'admin') {
    return (
      <div className="page">
        <h1>Monitoring Tugas</h1>
        <p className="empty">Halaman ini hanya untuk admin.</p>
      </div>
    )
  }
  if (loading) return <div className="page"><p className="muted">Memuat…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>

  return (
    <div className="page">
      <PageHeader
        icon="fileText"
        title="Monitoring Tugas"
        subtitle="Semua tugas di semua course: jumlah pengumpulan, yang belum dinilai, dan yang terlambat."
      />
      {rows !== null && rows.length === 0 && <p className="empty">Belum ada tugas.</p>}
      {rows !== null && rows.length > 0 && (
        <div className="grade-table-wrap">
          <table className="grade-table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Lesson</th>
                <th>Tugas</th>
                <th>Jenis</th>
                <th>Deadline</th>
                <th>Submission</th>
                <th>Belum Dinilai</th>
                <th>Terlambat</th>
                <th>Tautan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.assignment.id}>
                  <td>{r.courseTitle}</td>
                  <td>{r.lessonTitle}</td>
                  <td>{r.assignment.title}</td>
                  <td>{(r.assignment.kind ?? 'weekly') === 'final_practice' ? 'Tugas praktik akhir' : 'Tugas mingguan'}</td>
                  <td>{formatDate(r.assignment.due_date)}</td>
                  <td>{r.total}</td>
                  <td>{r.ungraded}</td>
                  <td>{r.late}</td>
                  <td>
                    <Link to={`/tugas/${r.assignment.id}`}>Lihat tugas</Link>
                    {' · '}
                    <Link to="/mentor/penilaian">Antrean penilaian</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted"><Link to="/admin">Kembali ke Admin Panel</Link></p>
    </div>
  )
}
