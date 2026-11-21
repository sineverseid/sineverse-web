// SINEVERSE — Mentor Workspace: Analitik.
// Ringkasan per course yang diampu mentor: enrollment, completion,
// hasil kuis, ketepatan submit (master prompt §09: enrollment, completion,
// hasil kuis, ketepatan submit, kebutuhan dukungan siswa).
// Semua angka dihitung dari data Supabase yang ada — tanpa data palsu.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchCourses, supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import WorkspaceNav from '../components/WorkspaceNav'
import { MENTOR_NAV } from '../lib/workspaceNav'
import EmptyState from '../components/EmptyState'

interface CourseStats {
  courseId: string
  title: string
  students: number
  lessons: number
  completedLessons: number
  quizAttempts: number
  quizPassed: number
  submissions: number
  graded: number
  pending: number
}

export default function MentorAnalyticsPage() {
  const { user, profile } = useAuth()
  const [rows, setRows] = useState<CourseStats[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function load() {
      try {
        const courses = await fetchCourses()
        const mine =
          profile?.role === 'admin'
            ? courses
            : courses.filter((c) => c.mentor_id === user!.id)
        if (mine.length === 0) {
          if (!cancelled) setRows([])
          return
        }
        const out: CourseStats[] = []
        for (const course of mine) {
          const { data: enr } = await supabase
            .from('enrollments')
            .select('id,user_id')
            .eq('course_id', course.id)
          const enrRows = (enr ?? []) as { id: string; user_id: string }[]
          const { data: mods } = await supabase
            .from('modules')
            .select('id')
            .eq('course_id', course.id)
          const modIds = ((mods ?? []) as { id: string }[]).map((m) => m.id)
          const { data: lessons } = await supabase
            .from('lessons')
            .select('id')
            .in('module_id', modIds.length > 0 ? modIds : ['00000000-0000-0000-0000-000000000000'])
          const lessonIds = ((lessons ?? []) as { id: string }[]).map((l) => l.id)
          let completedLessons = 0
          if (lessonIds.length > 0) {
            const { count } = await supabase
              .from('lesson_progress')
              .select('id', { count: 'exact', head: true })
              .in('lesson_id', lessonIds)
              .eq('status', 'completed')
            completedLessons = count ?? 0
          }
          const { data: quizzes } = await supabase
            .from('quizzes')
            .select('id,passing_score')
            .in('lesson_id', lessonIds.length > 0 ? lessonIds : ['00000000-0000-0000-0000-000000000000'])
          const quizRows = (quizzes ?? []) as { id: string; passing_score: number }[]
          let quizAttempts = 0
          let quizPassed = 0
          if (quizRows.length > 0) {
            const { data: attempts } = await supabase
              .from('quiz_attempts')
              .select('quiz_id,score')
              .in('quiz_id', quizRows.map((q) => q.id))
            const attRows = (attempts ?? []) as { quiz_id: string; score: number | null }[]
            const passing = new Map(quizRows.map((q) => [q.id, q.passing_score]))
            quizAttempts = attRows.length
            quizPassed = attRows.filter(
              (a) => a.score !== null && a.score >= (passing.get(a.quiz_id) ?? 0),
            ).length
          }
          const { data: assigns } = await supabase
            .from('assignments')
            .select('id')
            .in('lesson_id', lessonIds.length > 0 ? lessonIds : ['00000000-0000-0000-0000-000000000000'])
          const aIds = ((assigns ?? []) as { id: string }[]).map((a) => a.id)
          let submissions = 0
          let graded = 0
          if (aIds.length > 0) {
            const { data: subs } = await supabase
              .from('submissions')
              .select('id,score')
              .in('assignment_id', aIds)
            const subRows = (subs ?? []) as { id: string; score: number | null }[]
            submissions = subRows.length
            graded = subRows.filter((s) => s.score !== null).length
          }
          out.push({
            courseId: course.id,
            title: course.title,
            students: enrRows.length,
            lessons: lessonIds.length,
            completedLessons,
            quizAttempts,
            quizPassed,
            submissions,
            graded,
            pending: submissions - graded,
          })
        }
        if (!cancelled) setRows(out)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat analitik.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user, profile?.role])

  return (
    <div className="page">
      <PageHeader
        icon="chart"
        title="Analitik Course"
        subtitle="Enrollment, penyelesaian lesson, hasil kuis, dan penilaian per course yang kamu ampu."
      />
      <WorkspaceNav entries={MENTOR_NAV} />
      {loading && <p className="muted">Memuat analitik…</p>}
      {error && <p className="error-box">{error}</p>}
      {!loading && !error && rows !== null && rows.length === 0 && (
        <EmptyState
          message="Belum ada course. Kamu belum mengampu course apa pun, jadi belum ada analitik."
        />
      )}
      {!loading && !error && rows !== null && rows.length > 0 && (
        <div className="grade-table-wrap">
          <table className="grade-table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Siswa</th>
                <th>Lesson</th>
                <th>Lesson Selesai</th>
                <th>Kuis (lulus/percobaan)</th>
                <th>Tugas (dinilai/masuk)</th>
                <th>Menunggu Nilai</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.courseId}>
                  <td>
                    <Link to={`/course/${r.courseId}`}>{r.title}</Link>
                  </td>
                  <td>{r.students}</td>
                  <td>{r.lessons}</td>
                  <td>{r.completedLessons}</td>
                  <td>
                    {r.quizPassed}/{r.quizAttempts}
                  </td>
                  <td>
                    {r.graded}/{r.submissions}
                  </td>
                  <td>{r.pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted">
        Angka dihitung langsung dari enrollment, progres lesson, percobaan kuis, dan submission
        yang tersimpan. Tidak ada angka contoh.
      </p>
    </div>
  )
}
