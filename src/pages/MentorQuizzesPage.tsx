// SINEVERSE — Mentor Workspace: Daftar Kuis.
// Semua kuis di course yang diampu mentor: jenis (Kuis / Pretest /
// Posttest), passing score, dan jumlah attempt. Mentor hanya melihat
// kuis di course-nya sendiri; admin melihat semua.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchCourses, fetchQuizzesForLessons, supabase } from '../lib/supabase'
import type { Course, Lesson, Quiz } from '../lib/types'
import PageHeader from '../components/PageHeader'
import WorkspaceNav from '../components/WorkspaceNav'
import { MENTOR_NAV } from '../lib/workspaceNav'
import EmptyState from '../components/EmptyState'

const KIND_LABELS: Record<string, string> = {
  quiz: 'Kuis',
  pretest: 'Pretest',
  posttest: 'Posttest',
}

interface QuizRow {
  quiz: Quiz
  course: Course
  lesson: Lesson
  attempts: number
}

export default function MentorQuizzesPage() {
  const { user, profile } = useAuth()
  const [rows, setRows] = useState<QuizRow[]>([])
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
          .select('id,module_id,title')
          .in('module_id', modRows.map((m) => m.id))
        const lessonRows = (lessons ?? []) as Lesson[]
        if (lessonRows.length === 0) {
          if (!cancelled) setRows([])
          return
        }
        const lessonById = new Map(lessonRows.map((l) => [l.id, l]))
        const quizzes = await fetchQuizzesForLessons(lessonRows.map((l) => l.id))
        if (quizzes.length === 0) {
          if (!cancelled) setRows([])
          return
        }
        // Jumlah attempt per kuis dalam satu query (bukan per kuis).
        const { data: attempts } = await supabase
          .from('quiz_attempts')
          .select('quiz_id')
          .in('quiz_id', quizzes.map((q) => q.id))
        const attemptsByQuiz = new Map<string, number>()
        for (const a of ((attempts ?? []) as { quiz_id: string }[])) {
          attemptsByQuiz.set(a.quiz_id, (attemptsByQuiz.get(a.quiz_id) ?? 0) + 1)
        }
        const out: QuizRow[] = []
        for (const quiz of quizzes) {
          const lesson = lessonById.get(quiz.lesson_id)
          if (!lesson) continue
          const course = courseById.get(moduleCourse.get(lesson.module_id) ?? '')
          if (!course) continue
          out.push({ quiz, course, lesson, attempts: attemptsByQuiz.get(quiz.id) ?? 0 })
        }
        out.sort((a, b) => {
          if (a.course.title !== b.course.title) return a.course.title.localeCompare(b.course.title)
          return a.lesson.title.localeCompare(b.lesson.title)
        })
        if (!cancelled) setRows(out)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat daftar kuis.')
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
        <h1>Daftar Kuis</h1>
        <p className="empty">Halaman ini hanya untuk mentor.</p>
      </div>
    )
  }
  if (error) return <div className="page"><p className="error-box">{error}</p></div>

  return (
    <div className="page">
      <PageHeader
        icon="exam"
        title="Daftar Kuis"
        subtitle="Semua kuis, pretest, dan posttest di course yang kamu ampu."
      />
      <WorkspaceNav entries={MENTOR_NAV} />
      {rows.length === 0 ? (
        <EmptyState message="Belum ada kuis. Buat kuis dari Course Builder di lesson masing-masing course." actionLabel="Buka Course Builder" actionTo="/mentor/course-builder" />
      ) : (
        <div className="grade-table-wrap">
          <table className="grade-table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Lesson</th>
                <th>Kuis</th>
                <th>Jenis</th>
                <th>Nilai Lulus</th>
                <th>Attempt</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ quiz, course, lesson, attempts }) => (
                <tr key={quiz.id}>
                  <td>{course.title}</td>
                  <td>{lesson.title}</td>
                  <td>{quiz.title}</td>
                  <td>{KIND_LABELS[quiz.kind ?? 'quiz'] ?? 'Kuis'}</td>
                  <td>{quiz.passing_score}</td>
                  <td>{attempts}</td>
                  <td>
                    <Link to={`/kuis/${quiz.id}`}>Lihat kuis</Link>
                    {' · '}
                    <Link to={`/mentor/course/${course.id}`}>Kelola di Course Builder</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p><Link to="/mentor">Kembali ke Mentor Workspace</Link></p>
    </div>
  )
}
