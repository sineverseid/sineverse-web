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
import Icon from '../components/icons'

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

  // Rata-rata dari course yang sudah ada nilainya saja: sebuah course
  // dianggap "dinilai" bila minimal satu komponennya bukan null (nilai
  // akhir selalu berupa angka karena dinormalisasi ulang, jadi 0 dari
  // course tanpa komponen apa pun tidak boleh ikut menarik rata-rata).
  const gradedCourses = grades.filter((g) =>
    g.components.pretest !== null ||
    g.components.posttest !== null ||
    g.components.weeklyAssignments !== null ||
    g.components.finalPractice !== null ||
    g.components.discussion !== null,
  )
  const avg =
    gradedCourses.length > 0
      ? Math.round(
          gradedCourses.reduce((sum, g) => sum + g.components.final, 0) /
            gradedCourses.length,
        )
      : null
  const predikat =
    avg === null
      ? null
      : avg >= 85
        ? 'Sangat Baik'
        : avg >= 70
          ? 'Baik'
          : avg >= 60
            ? 'Cukup'
            : 'Perlu Latihan'

  return (
    <div className="page">
      <PageHeader
        icon="grade"
        title="Nilai Saya"
        subtitle={`Bobot: Pretest 5% · Posttest 15% · Tugas mingguan 30% · Tugas praktik akhir 40% · Diskusi 10% · Nilai lulus: ${PASSING_GRADE}. Hanya nilai kamu sendiri yang ditampilkan di sini.`}
      />
      {avg !== null && (
        <div className="grade-hero">
          <span className="grade-trophy">
            <Icon name="trophy" size={56} />
          </span>
          <div className="grade-hero-body">
            <p>Rata-rata Nilai</p>
            <span className="grade-avg">{avg} / 100</span>
            {predikat && (
              <span className="grade-predikat">
                <Icon name="check" size={14} />
                {predikat}
              </span>
            )}
          </div>
        </div>
      )}
      {grades.length === 0 ? (
        <p className="empty">
          Kamu belum mengambil course apa pun.{' '}
          <Link to="/akademi">Jelajahi Akademi</Link> untuk memulai.
        </p>
      ) : (
        <>
          <div className="dash-section-head">
            <h2>Detail Nilai</h2>
          </div>
          <div className="grade-table-wrap">
            <table className="grade-table">
              <thead>
                <tr>
                  {/* LC5: lebar kolom minimum + header tidak membungkus —
                      sebelumnya "Tugas Mingguan (30%)" terpotong baris. */}
                  <th style={{ minWidth: 180 }}>Course</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Pretest (5%)</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Posttest (15%)</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Tugas Mingguan (30%)</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Tugas Akhir (40%)</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Diskusi (10%)</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Nilai Akhir</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {grades.map((g) => {
                  // K13: course tanpa satu pun komponen nilai BUKAN "0.0 /
                  // Belum lulus" — tidak ada nilai sama sekali (dulu baris
                  // ini yang membuat Gradebook bertentangan dengan
                  // notifikasi nilai yang sudah masuk).
                  const hasAnyGrade =
                    g.components.pretest !== null ||
                    g.components.posttest !== null ||
                    g.components.weeklyAssignments !== null ||
                    g.components.finalPractice !== null ||
                    g.components.discussion !== null
                  return (
                  <tr key={g.course.id}>
                    <td>
                      <Link to={`/course/${g.course.id}`}>{g.course.title}</Link>
                      <br />
                      {/* (D25) Rekap per aktivitas tiap course ada di Grade Book. */}
                      <Link
                        to={`/course/${g.course.id}/gradebook`}
                        style={{ fontSize: '0.85rem' }}
                      >
                        Grade Book — rekap per aktivitas
                      </Link>
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
                      <strong>{hasAnyGrade ? g.components.final.toFixed(1) : '—'}</strong>
                    </td>
                    <td>
                      {!hasAnyGrade ? (
                        <span className="muted">Belum ada nilai</span>
                      ) : (
                        <span className={g.components.passed ? 'badge-pass' : 'badge-fail'}>
                          {g.components.passed ? 'Lulus' : 'Belum lulus'}
                        </span>
                      )}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="grade-motivation">
        <span className="announce-icon">
          <Icon name="star" size={24} />
        </span>
        <span>Terus semangat belajar untuk hasil yang lebih baik!</span>
      </div>
      <p className="muted">
        Tanda &ldquo;—&rdquo; berarti komponen itu belum ada nilainya (belum ada pretest,
        posttest, tugas yang dinilai, atau aktivitas diskusi). Nilai akhir dihitung ulang
        dari komponen yang sudah ada nilainya saja. Ujian kompetensi tidak masuk nilai
        akhir course.
      </p>
    </div>
  )
}
