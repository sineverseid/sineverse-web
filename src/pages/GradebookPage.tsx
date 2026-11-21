// SINEVERSE — Gradebook pribadi: hanya baris pengguna yang sedang masuk.
// Nilai akhir = 20% kuis + 50% tugas + 30% ujian, dinormalisasi ulang bila
// ada komponen yang masih kosong. Lulus bila >= 70.
// Sumber: quiz_attempts, submissions (tugas yang sudah dinilai), exam_attempts.
// Komponen yang belum ada datanya dihitung 0 dan ditandai "belum ada data".
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { GRADEBOOK_WEIGHTS, PASSING_GRADE } from '../lib/brand'
import {
  fetchAssignmentsForLessons,
  fetchCourseLessons,
  fetchCourses,
  fetchEnrollments,
  fetchExamAttempts,
  fetchQuizAttempts,
  fetchQuizzesForLessons,
  fetchSubmissions,
} from '../lib/supabase'
import type { Course } from '../lib/types'
import PageHeader from '../components/PageHeader'

interface CourseGrade {
  course: Course
  quizAvg: number | null
  assignmentAvg: number | null
  examAvg: number | null
  final: number
  passed: boolean
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

export default function GradebookPage() {
  const { user } = useAuth()
  const [grades, setGrades] = useState<CourseGrade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    const currentUser = user
    let cancelled = false
    async function load() {
      try {
        const [enrollments, quizAttempts, submissions, examAttempts] = await Promise.all([
          fetchEnrollments(currentUser.id),
          fetchQuizAttempts(currentUser.id),
          fetchSubmissions(currentUser.id),
          fetchExamAttempts(currentUser.id),
        ])
        if (cancelled) return
        const courses = await fetchCourses()
        const byId = new Map(courses.map((c) => [c.id, c]))
        const rows: CourseGrade[] = []
        for (const enr of enrollments) {
          const course = byId.get(enr.course_id)
          if (!course) continue
          const lessons = await fetchCourseLessons(course.id)
          const lessonIds = lessons.map((l) => l.id)
          const [quizzes, assignments] = await Promise.all([
            fetchQuizzesForLessons(lessonIds),
            fetchAssignmentsForLessons(lessonIds),
          ])
          const quizIds = new Set(quizzes.map((q) => q.id))
          const assignmentIds = new Set(assignments.map((a) => a.id))
          // Best attempt per quiz (latest best score counts once per quiz).
          const bestQuiz = new Map<string, number>()
          for (const att of quizAttempts) {
            if (!quizIds.has(att.quiz_id) || att.score === null) continue
            const prev = bestQuiz.get(att.quiz_id)
            if (prev === undefined || att.score > prev) bestQuiz.set(att.quiz_id, att.score)
          }
          const quizAvg = avg([...bestQuiz.values()])
          const graded = submissions.filter(
            (s) => assignmentIds.has(s.assignment_id) && s.score !== null,
          )
          const assignmentAvg = avg(graded.map((s) => s.score as number))
          // Exam attempts are per course only when linked via exam; the
          // table has no course_id, so the exam component stays empty until
          // competency exams are wired to courses (Fase B).
          const examAvg = avg(
            examAttempts.filter((e) => e.score !== null).map((e) => e.score as number),
          )
          const examComponent = examAttempts.length > 0 ? examAvg : null

          const parts: { value: number | null; weight: number }[] = [
            { value: quizAvg, weight: GRADEBOOK_WEIGHTS.kuis },
            { value: assignmentAvg, weight: GRADEBOOK_WEIGHTS.tugas },
            { value: examComponent, weight: GRADEBOOK_WEIGHTS.ujian },
          ]
          const present = parts.filter((p) => p.value !== null)
          const totalWeight = present.reduce((a, p) => a + p.weight, 0)
          const final =
            totalWeight > 0
              ? present.reduce((a, p) => a + (p.value as number) * p.weight, 0) / totalWeight
              : 0
          rows.push({
            course,
            quizAvg,
            assignmentAvg,
            examAvg: examComponent,
            final: Math.round(final * 10) / 10,
            passed: final >= PASSING_GRADE,
          })
        }
        if (!cancelled) setGrades(rows)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat nilai.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user])

  if (loading) {
    return (
      <div className="page">
        <p className="muted">Memuat nilai…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <p className="error-box">{error}</p>
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader
        icon="grade"
        title="Nilai Saya"
        subtitle={`Bobot: Kuis 20% · Tugas 50% · Ujian 30% · Nilai lulus: ${PASSING_GRADE}. Hanya nilai kamu sendiri yang ditampilkan di sini.`}
      />
      {grades.length === 0 ? (
        <p className="empty">
          Kamu belum mengambil course apa pun.{' '}
          <Link to="/akademi">Jelajahi Akademi</Link> untuk memulai.
        </p>
      ) : (
        <div className="grade-table-wrap">
          <table className="grade-table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Kuis (20%)</th>
                <th>Tugas (50%)</th>
                <th>Ujian (30%)</th>
                <th>Nilai Akhir</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {grades.map((g) => (
                <tr key={g.course.id}>
                  <td>
                    <Link to={`/course/${g.course.id}`}>{g.course.title}</Link>
                  </td>
                  <td>{g.quizAvg === null ? '—' : g.quizAvg.toFixed(1)}</td>
                  <td>{g.assignmentAvg === null ? '—' : g.assignmentAvg.toFixed(1)}</td>
                  <td>{g.examAvg === null ? '—' : g.examAvg.toFixed(1)}</td>
                  <td>
                    <strong>{g.final.toFixed(1)}</strong>
                  </td>
                  <td>
                    <span className={g.passed ? 'badge-pass' : 'badge-fail'}>
                      {g.passed ? 'Lulus' : 'Belum lulus'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted">
        Tanda &ldquo;—&rdquo; berarti komponen itu belum ada datanya (belum ada kuis, tugas yang
        dinilai, atau ujian). Nilai akhir dihitung ulang dari komponen yang sudah ada.
      </p>
    </div>
  )
}
