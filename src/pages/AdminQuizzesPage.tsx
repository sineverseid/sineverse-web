// SINEVERSE — Admin Academy: Kelola Kuis.
// Tabel semua kuis di semua course: course, lesson, judul, jenis
// (Kuis / Pretest / Posttest), passing score, jumlah attempt, dan
// rata-rata skor terbaik per siswa (skor terbaik tiap siswa dulu,
// baru dirata-rata; "—" bila belum ada attempt yang bernilai).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { avgOrNull } from '../lib/grading'
import { fetchCourses, supabase } from '../lib/supabase'
import type { Lesson, Module, Quiz, QuizAttempt } from '../lib/types'
import PageHeader from '../components/PageHeader'

interface QuizRow {
  quiz: Quiz
  courseTitle: string
  lessonTitle: string
  attempts: number
  avgBest: number | null
}

function kindLabel(kind: string | undefined): string {
  if (kind === 'pretest') return 'Pretest'
  if (kind === 'posttest') return 'Posttest'
  return 'Kuis'
}

export default function AdminQuizzesPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<QuizRow[] | null>(null)
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
        let quizzes: Quiz[] = []
        if (lessonRows.length > 0) {
          const { data: qz } = await supabase
            .from('quizzes')
            .select('*')
            .in('lesson_id', lessonRows.map((l) => l.id))
            .order('created_at', { ascending: false })
          quizzes = (qz ?? []) as Quiz[]
        }
        let attempts: QuizAttempt[] = []
        if (quizzes.length > 0) {
          const { data: att } = await supabase
            .from('quiz_attempts')
            .select('id,quiz_id,user_id,score')
            .in('quiz_id', quizzes.map((q) => q.id))
          attempts = (att ?? []) as QuizAttempt[]
        }
        const attemptsByQuiz = new Map<string, QuizAttempt[]>()
        for (const a of attempts) {
          const arr = attemptsByQuiz.get(a.quiz_id) ?? []
          arr.push(a)
          attemptsByQuiz.set(a.quiz_id, arr)
        }
        const out: QuizRow[] = quizzes.map((q) => {
          const lesson = lessonById.get(q.lesson_id)
          const courseId = lesson ? modCourse.get(lesson.module_id) ?? '' : ''
          const quizAttempts = attemptsByQuiz.get(q.id) ?? []
          // Skor terbaik per siswa, lalu rata-rata antar siswa.
          const bestByUser = new Map<string, number>()
          for (const [userId, best] of groupBestByUser(quizAttempts)) {
            bestByUser.set(userId, best)
          }
          return {
            quiz: q,
            courseTitle: courseById.get(courseId) ?? 'Course',
            lessonTitle: lesson?.title ?? 'Lesson',
            attempts: quizAttempts.length,
            avgBest: avgOrNull([...bestByUser.values()]),
          }
        })
        out.sort((a, b) =>
          a.courseTitle.localeCompare(b.courseTitle) ||
          a.lessonTitle.localeCompare(b.lessonTitle) ||
          a.quiz.title.localeCompare(b.quiz.title),
        )
        if (!cancelled) setRows(out)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat kuis.')
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
        <h1>Kelola Kuis</h1>
        <p className="empty">Halaman ini hanya untuk admin.</p>
      </div>
    )
  }
  if (loading) return <div className="page"><p className="muted">Memuat…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>

  return (
    <div className="page">
      <PageHeader
        icon="exam"
        title="Kelola Kuis"
        subtitle="Semua kuis, pretest, dan posttest di semua course beserta hasil attempt-nya."
      />
      <p>
        <Link to="/mentor/course-builder" className="btn btn-primary">Buat Kuis</Link>
      </p>
      <p className="muted">
        Kuis, pretest, dan posttest dibuat dari Course Builder: pilih course, buka builder-nya,
        lalu tambah kuis di lesson yang diinginkan.
      </p>
      {rows !== null && rows.length === 0 && <p className="empty">Belum ada kuis.</p>}
      {rows !== null && rows.length > 0 && (
        <div className="grade-table-wrap">
          <table className="grade-table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Lesson</th>
                <th>Kuis</th>
                <th>Jenis</th>
                <th>Passing Score</th>
                <th>Attempt</th>
                <th>Rata-rata Skor Terbaik</th>
                <th>Tautan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.quiz.id}>
                  <td>{r.courseTitle}</td>
                  <td>{r.lessonTitle}</td>
                  <td>{r.quiz.title}</td>
                  <td>{kindLabel(r.quiz.kind)}</td>
                  <td>{r.quiz.passing_score}</td>
                  <td>{r.attempts}</td>
                  <td>{r.avgBest === null ? '—' : r.avgBest.toFixed(1)}</td>
                  <td><Link to={`/kuis/${r.quiz.id}`}>Lihat kuis</Link></td>
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

/** Skor terbaik per user untuk satu kuis (attempt dengan score null diabaikan). */
function groupBestByUser(attempts: QuizAttempt[]): Map<string, number> {
  const best = new Map<string, number>()
  for (const a of attempts) {
    if (a.score === null) continue
    const prev = best.get(a.user_id)
    if (prev === undefined || a.score > prev) best.set(a.user_id, a.score)
  }
  return best
}
