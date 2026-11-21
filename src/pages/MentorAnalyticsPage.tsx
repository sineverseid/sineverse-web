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
        // Batch lintas SEMUA course sekaligus (bukan ~7 query sequential per
        // course): enrollments + modules paralel, lalu lessons, lalu
        // lesson_progress + quizzes + assignments paralel, lalu quiz_attempts
        // + submissions paralel. Pengelompokan per course dihitung di JS.
        const mineIds = mine.map((c) => c.id)
        const noId = ['00000000-0000-0000-0000-000000000000']
        const [{ data: enr }, { data: mods }] = await Promise.all([
          supabase.from('enrollments').select('id,user_id,course_id').in('course_id', mineIds),
          supabase.from('modules').select('id,course_id').in('course_id', mineIds),
        ])
        const enrRows = (enr ?? []) as { id: string; user_id: string; course_id: string }[]
        const modRows = (mods ?? []) as { id: string; course_id: string }[]
        const modCourse = new Map(modRows.map((m) => [m.id, m.course_id]))
        const { data: lessons } = await supabase
          .from('lessons')
          .select('id,module_id')
          .in('module_id', modRows.length > 0 ? modRows.map((m) => m.id) : noId)
        const lessonRows = (lessons ?? []) as { id: string; module_id: string }[]
        const lessonCourse = new Map(lessonRows.map((l) => [l.id, modCourse.get(l.module_id) ?? '']))
        const lessonIds = lessonRows.map((l) => l.id)
        const lessonIn = lessonIds.length > 0 ? lessonIds : noId
        const [{ data: prog }, { data: quizzes }, { data: assigns }] = await Promise.all([
          supabase.from('lesson_progress').select('lesson_id').in('lesson_id', lessonIn).eq('status', 'completed'),
          supabase.from('quizzes').select('id,passing_score,lesson_id').in('lesson_id', lessonIn),
          supabase.from('assignments').select('id,lesson_id').in('lesson_id', lessonIn),
        ])
        const progRows = (prog ?? []) as { lesson_id: string }[]
        const quizRows = (quizzes ?? []) as { id: string; passing_score: number; lesson_id: string }[]
        const assignRows = (assigns ?? []) as { id: string; lesson_id: string }[]
        const quizCourse = new Map(quizRows.map((q) => [q.id, lessonCourse.get(q.lesson_id) ?? '']))
        const assignCourse = new Map(assignRows.map((a) => [a.id, lessonCourse.get(a.lesson_id) ?? '']))
        const [{ data: attempts }, { data: subs }] = await Promise.all([
          supabase
            .from('quiz_attempts')
            .select('quiz_id,score')
            .in('quiz_id', quizRows.length > 0 ? quizRows.map((q) => q.id) : noId),
          supabase
            .from('submissions')
            .select('id,score,assignment_id')
            .in('assignment_id', assignRows.length > 0 ? assignRows.map((a) => a.id) : noId),
        ])
        const attRows = (attempts ?? []) as { quiz_id: string; score: number | null }[]
        const subRows = (subs ?? []) as { id: string; score: number | null; assignment_id: string }[]
        const passing = new Map(quizRows.map((q) => [q.id, q.passing_score]))
        const stats = new Map<string, CourseStats>(
          mine.map((c) => [
            c.id,
            {
              courseId: c.id,
              title: c.title,
              students: 0,
              lessons: 0,
              completedLessons: 0,
              quizAttempts: 0,
              quizPassed: 0,
              submissions: 0,
              graded: 0,
              pending: 0,
            },
          ]),
        )
        for (const e of enrRows) {
          const s = stats.get(e.course_id)
          if (s) s.students += 1
        }
        for (const l of lessonRows) {
          const s = stats.get(lessonCourse.get(l.id) ?? '')
          if (s) s.lessons += 1
        }
        for (const p of progRows) {
          const s = stats.get(lessonCourse.get(p.lesson_id) ?? '')
          if (s) s.completedLessons += 1
        }
        for (const a of attRows) {
          const s = stats.get(quizCourse.get(a.quiz_id) ?? '')
          if (!s) continue
          s.quizAttempts += 1
          if (a.score !== null && a.score >= (passing.get(a.quiz_id) ?? 0)) s.quizPassed += 1
        }
        for (const sub of subRows) {
          const s = stats.get(assignCourse.get(sub.assignment_id) ?? '')
          if (!s) continue
          s.submissions += 1
          if (sub.score !== null) s.graded += 1
        }
        const out: CourseStats[] = [...stats.values()].map((s) => ({
          ...s,
          pending: s.submissions - s.graded,
        }))
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
