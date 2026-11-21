// SINEVERSE — Gradebook pribadi: hanya baris pengguna yang sedang masuk.
// Nilai akhir (formula master prompt, keputusan Arif 21 Nov 23:18, opsi 1):
//   Pretest 5% + Posttest 15% + Tugas mingguan 30%
//   + Tugas praktik akhir 40% + Partisipasi diskusi 10%,
//   dinormalisasi ulang atas komponen yang sudah ada nilainya.
//   Lulus bila >= 70. Ujian kompetensi TIDAK masuk gradebook
//   (tetap terpisah di ExamsPage).
// Sumber: quiz_attempts (pretest/posttest, skor terbaik per kuis),
// submissions (tugas yang sudah dinilai), discussions (partisipasi).
// Kuis biasa (kind='quiz') tidak lagi masuk nilai. Komponen yang belum
// ada datanya bernilai null dan ditampilkan "—".
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { GRADEBOOK_WEIGHTS, PASSING_GRADE } from '../lib/brand'
import {
  avgOrNull,
  bestScoresByQuiz,
  buildGradeComponents,
  discussionParticipationScore,
} from '../lib/grading'
import {
  fetchAssignmentsForLessons,
  fetchCourseLessons,
  fetchCourses,
  fetchDiscussionsForLessons,
  fetchEnrollments,
  fetchQuizAttempts,
  fetchQuizzesForLessons,
  fetchSubmissions,
} from '../lib/supabase'
import type {
  Assignment,
  Course,
  Discussion,
  GradeComponents,
  Quiz,
  QuizAttempt,
  Submission,
} from '../lib/types'
import PageHeader from '../components/PageHeader'

interface CourseGrade {
  course: Course
  components: GradeComponents
}

/** Lima komponen nilai satu course untuk satu pengguna, dari data mentah
 *  course itu (kuis + tugas + percobaan + pengumpulan + postingan diskusi
 *  pengguna). Kuis biasa (kind='quiz') tidak masuk komponen mana pun;
 *  tugas lama tanpa kind dibaca sebagai tugas mingguan. */
function computeGradeComponents(
  quizzes: Quiz[],
  assignments: Assignment[],
  quizAttempts: QuizAttempt[],
  submissions: Submission[],
  userPosts: Discussion[],
): GradeComponents {
  const best = bestScoresByQuiz(quizAttempts)
  const pretestIds = new Set(
    quizzes.filter((q) => q.kind === 'pretest').map((q) => q.id),
  )
  const posttestIds = new Set(
    quizzes.filter((q) => q.kind === 'posttest').map((q) => q.id),
  )
  const pretest = avgOrNull(
    [...best.entries()]
      .filter(([id]) => pretestIds.has(id))
      .map(([, score]) => score),
  )
  const posttest = avgOrNull(
    [...best.entries()]
      .filter(([id]) => posttestIds.has(id))
      .map(([, score]) => score),
  )
  const weeklyIds = new Set(
    assignments
      .filter((a) => (a.kind ?? 'weekly') === 'weekly')
      .map((a) => a.id),
  )
  const finalIds = new Set(
    assignments.filter((a) => a.kind === 'final_practice').map((a) => a.id),
  )
  const weeklyAssignments = avgOrNull(
    submissions
      .filter((s) => weeklyIds.has(s.assignment_id) && s.score !== null)
      .map((s) => s.score as number),
  )
  const finalPractice = avgOrNull(
    submissions
      .filter((s) => finalIds.has(s.assignment_id) && s.score !== null)
      .map((s) => s.score as number),
  )
  const discussion = discussionParticipationScore(userPosts)
  return buildGradeComponents(
    { pretest, posttest, weeklyAssignments, finalPractice, discussion },
    GRADEBOOK_WEIGHTS,
    PASSING_GRADE,
  )
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
        const [enrollments, quizAttempts, submissions] = await Promise.all([
          fetchEnrollments(currentUser.id),
          fetchQuizAttempts(currentUser.id),
          fetchSubmissions(currentUser.id),
        ])
        if (cancelled) return
        const courses = await fetchCourses()
        const byId = new Map(courses.map((c) => [c.id, c]))
        // Lesson semua course yang diambil, diambil paralel (bukan satu per
        // satu) supaya halaman nilai tidak lama memuat.
        const lessonsPerCourse = await Promise.all(
          enrollments.map(async (enr) => ({
            courseId: enr.course_id,
            lessons: await fetchCourseLessons(enr.course_id),
          })),
        )
        const lessonIds = lessonsPerCourse.flatMap((x) => x.lessons.map((l) => l.id))
        const [quizzes, assignments, discussions] = await Promise.all([
          fetchQuizzesForLessons(lessonIds),
          fetchAssignmentsForLessons(lessonIds),
          fetchDiscussionsForLessons(lessonIds),
        ])
        const quizByLesson = new Map<string, Quiz[]>()
        const assignByLesson = new Map<string, Assignment[]>()
        for (const q of quizzes) {
          const arr = quizByLesson.get(q.lesson_id) ?? []
          arr.push(q)
          quizByLesson.set(q.lesson_id, arr)
        }
        for (const a of assignments) {
          const arr = assignByLesson.get(a.lesson_id) ?? []
          arr.push(a)
          assignByLesson.set(a.lesson_id, arr)
        }
        const rows: CourseGrade[] = []
        for (const enr of enrollments) {
          const course = byId.get(enr.course_id)
          if (!course) continue
          const entry = lessonsPerCourse.find((x) => x.courseId === enr.course_id)
          const lessons = entry?.lessons ?? []
          const courseLessonIds = lessons.map((l) => l.id)
          const lessonIdSet = new Set(courseLessonIds)
          const courseQuizzes = courseLessonIds.flatMap((id) => quizByLesson.get(id) ?? [])
          const courseAssignments = courseLessonIds.flatMap(
            (id) => assignByLesson.get(id) ?? [],
          )
          const quizIds = new Set(courseQuizzes.map((q) => q.id))
          const assignmentIds = new Set(courseAssignments.map((a) => a.id))
          const courseAttempts = quizAttempts.filter((att) => quizIds.has(att.quiz_id))
          const courseSubmissions = submissions.filter((s) =>
            assignmentIds.has(s.assignment_id),
          )
          const coursePosts = discussions.filter(
            (d) => lessonIdSet.has(d.lesson_id) && d.user_id === currentUser.id,
          )
          rows.push({
            course,
            components: computeGradeComponents(
              courseQuizzes,
              courseAssignments,
              courseAttempts,
              courseSubmissions,
              coursePosts,
            ),
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
        subtitle={`Bobot: Pretest 5% · Posttest 15% · Tugas mingguan 30% · Tugas praktik akhir 40% · Diskusi 10% · Nilai lulus: ${PASSING_GRADE}. Hanya nilai kamu sendiri yang ditampilkan di sini.`}
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
                <th>Pretest (5%)</th>
                <th>Posttest (15%)</th>
                <th>Tugas Mingguan (30%)</th>
                <th>Tugas Akhir (40%)</th>
                <th>Diskusi (10%)</th>
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
                  <td>
                    {g.components.pretest === null ? '—' : g.components.pretest.toFixed(1)}
                  </td>
                  <td>
                    {g.components.posttest === null
                      ? '—'
                      : g.components.posttest.toFixed(1)}
                  </td>
                  <td>
                    {g.components.weeklyAssignments === null
                      ? '—'
                      : g.components.weeklyAssignments.toFixed(1)}
                  </td>
                  <td>
                    {g.components.finalPractice === null
                      ? '—'
                      : g.components.finalPractice.toFixed(1)}
                  </td>
                  <td>
                    {g.components.discussion === null
                      ? '—'
                      : g.components.discussion.toFixed(1)}
                  </td>
                  <td>
                    <strong>{g.components.final.toFixed(1)}</strong>
                  </td>
                  <td>
                    <span className={g.components.passed ? 'badge-pass' : 'badge-fail'}>
                      {g.components.passed ? 'Lulus' : 'Belum lulus'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted">
        Tanda &ldquo;—&rdquo; berarti komponen itu belum ada nilainya (belum ada pretest,
        posttest, tugas yang dinilai, atau aktivitas diskusi). Nilai akhir dihitung ulang
        dari komponen yang sudah ada nilainya saja. Ujian kompetensi tidak masuk nilai
        akhir course.
      </p>
    </div>
  )
}
