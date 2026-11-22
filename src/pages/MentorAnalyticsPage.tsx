// SINEVERSE — Mentor Workspace: Analitik.
// Ringkasan per course yang diampu mentor: enrollment, completion,
// hasil kuis, ketepatan submit (master prompt §09: enrollment, completion,
// hasil kuis, ketepatan submit, kebutuhan dukungan siswa).
// Semua angka dihitung dari data Supabase yang ada — tanpa data palsu.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchCourses, supabase } from '../lib/supabase'
import { avgOrNull } from '../lib/grading'
import {
  computeGradeComponents,
  DEFAULT_CERT_PASSING,
  DEFAULT_CERT_WEIGHTS,
} from '../lib/certificates'
import { BRAND } from '../lib/brand'
import type {
  Assignment,
  Discussion,
  Quiz,
  QuizAttempt,
  Submission,
} from '../lib/types'
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
  // Rata-rata komponen nilai per course (Tahap 6): rata-rata lintas siswa
  // terdaftar yang punya nilai, via computeGradeComponents (formula 5
  // komponen Tahap 3). null = belum ada nilai untuk komponen itu.
  avgPretest: number | null
  avgPosttest: number | null
  avgWeekly: number | null
  avgFinalPractice: number | null
  avgDiscussion: number | null
  avgFinal: number | null
  discussionPosts: number
  activeStudents: number
}

function fmtScore(v: number | null): string {
  return v === null ? '—' : v.toFixed(1)
}

export default function MentorAnalyticsPage() {
  const { user, profile } = useAuth()
  const [rows, setRows] = useState<CourseStats[] | null>(null)
  const [weights, setWeights] = useState(DEFAULT_CERT_WEIGHTS)
  const [passingGrade, setPassingGrade] = useState(DEFAULT_CERT_PASSING)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function load() {
      try {
        // Bobot + passing grade dari baris RPS SVS-SEM1 (fallback ke bobot
        // master prompt bila baris tidak terbaca — mis. RLS untuk mentor).
        let w = DEFAULT_CERT_WEIGHTS
        let pass = DEFAULT_CERT_PASSING
        try {
          const { data: rpsRow } = await supabase
            .from('rps')
            .select('weights,passing_grade')
            .eq('code', BRAND.rpsCode)
            .maybeSingle()
          const rps = rpsRow as unknown as {
            weights?: {
              pretest: number
              posttest: number
              tugas_mingguan: number
              tugas_akhir: number
              diskusi: number
            }
            passing_grade?: number
          } | null
          if (rps?.weights) {
            w = {
              pretest: rps.weights.pretest ?? DEFAULT_CERT_WEIGHTS.pretest,
              posttest: rps.weights.posttest ?? DEFAULT_CERT_WEIGHTS.posttest,
              tugasMingguan: rps.weights.tugas_mingguan ?? DEFAULT_CERT_WEIGHTS.tugasMingguan,
              tugasAkhir: rps.weights.tugas_akhir ?? DEFAULT_CERT_WEIGHTS.tugasAkhir,
              diskusi: rps.weights.diskusi ?? DEFAULT_CERT_WEIGHTS.diskusi,
            }
            pass = rps.passing_grade ?? DEFAULT_CERT_PASSING
          }
        } catch {
          // Tetap pakai fallback; analitik tidak boleh gagal karena RPS.
        }

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
        const [{ data: prog }, { data: quizzes }, { data: assigns }, { data: disc }] =
          await Promise.all([
            supabase.from('lesson_progress').select('lesson_id').in('lesson_id', lessonIn).eq('status', 'completed'),
            supabase.from('quizzes').select('id,kind,passing_score,lesson_id').in('lesson_id', lessonIn),
            supabase.from('assignments').select('id,kind,lesson_id').in('lesson_id', lessonIn),
            supabase.from('discussions').select('id,lesson_id,user_id').in('lesson_id', lessonIn),
          ])
        const progRows = (prog ?? []) as { lesson_id: string }[]
        const quizRows = (quizzes ?? []) as Quiz[]
        const assignRows = (assigns ?? []) as Assignment[]
        const discRows = (disc ?? []) as Discussion[]
        const quizCourse = new Map(quizRows.map((q) => [q.id, lessonCourse.get(q.lesson_id) ?? '']))
        const assignCourse = new Map(assignRows.map((a) => [a.id, lessonCourse.get(a.lesson_id) ?? '']))
        const [{ data: attempts }, { data: subs }] = await Promise.all([
          supabase
            .from('quiz_attempts')
            .select('id,quiz_id,user_id,score')
            .in('quiz_id', quizRows.length > 0 ? quizRows.map((q) => q.id) : noId),
          supabase
            .from('submissions')
            .select('id,score,assignment_id,user_id')
            .in('assignment_id', assignRows.length > 0 ? assignRows.map((a) => a.id) : noId),
        ])
        const attRows = (attempts ?? []) as QuizAttempt[]
        const subRows = (subs ?? []) as Submission[]
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
              avgPretest: null,
              avgPosttest: null,
              avgWeekly: null,
              avgFinalPractice: null,
              avgDiscussion: null,
              avgFinal: null,
              discussionPosts: 0,
              activeStudents: 0,
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
        // Rata-rata komponen nilai + partisipasi diskusi per course (Tahap 6).
        // Dihitung per siswa terdaftar dulu via computeGradeComponents
        // (formula 5 komponen Tahap 3 — tidak dihitung ulang di sini), lalu
        // dirata-rata lintas siswa yang punya nilai. Postingan diskusi
        // dihitung per course; siswa aktif = siswa terdaftar yang posting.
        const enrolledByCourse = new Map<string, Set<string>>()
        for (const c of mine) enrolledByCourse.set(c.id, new Set())
        for (const e of enrRows) enrolledByCourse.get(e.course_id)?.add(e.user_id)
        const attemptsByUser = new Map<string, QuizAttempt[]>()
        for (const a of attRows) {
          if (!attemptsByUser.has(a.user_id)) attemptsByUser.set(a.user_id, [])
          attemptsByUser.get(a.user_id)?.push(a)
        }
        const subsByUser = new Map<string, Submission[]>()
        for (const s of subRows) {
          if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, [])
          subsByUser.get(s.user_id)?.push(s)
        }
        const postsByUser = new Map<string, Discussion[]>()
        for (const d of discRows) {
          if (!postsByUser.has(d.user_id)) postsByUser.set(d.user_id, [])
          postsByUser.get(d.user_id)?.push(d)
        }
        const postsByCourse = new Map<string, number>()
        const activeByCourse = new Map<string, Set<string>>()
        for (const d of discRows) {
          const cid = lessonCourse.get(d.lesson_id) ?? ''
          postsByCourse.set(cid, (postsByCourse.get(cid) ?? 0) + 1)
          if (enrolledByCourse.get(cid)?.has(d.user_id)) {
            if (!activeByCourse.has(cid)) activeByCourse.set(cid, new Set())
            activeByCourse.get(cid)?.add(d.user_id)
          }
        }
        for (const c of mine) {
          const s = stats.get(c.id)
          if (!s) continue
          const courseQuizzes = quizRows.filter((q) => quizCourse.get(q.id) === c.id)
          const courseAssigns = assignRows.filter((a) => assignCourse.get(a.id) === c.id)
          const preVals: number[] = []
          const postVals: number[] = []
          const weeklyVals: number[] = []
          const finalVals: number[] = []
          const discVals: number[] = []
          const finalGradeVals: number[] = []
          for (const uid of enrolledByCourse.get(c.id) ?? []) {
            const userPosts = (postsByUser.get(uid) ?? []).filter(
              (d) => lessonCourse.get(d.lesson_id) === c.id,
            )
            const comp = computeGradeComponents(
              courseQuizzes,
              courseAssigns,
              attemptsByUser.get(uid) ?? [],
              subsByUser.get(uid) ?? [],
              userPosts,
              w,
              pass,
            )
            if (comp.pretest !== null) preVals.push(comp.pretest)
            if (comp.posttest !== null) postVals.push(comp.posttest)
            if (comp.weeklyAssignments !== null) weeklyVals.push(comp.weeklyAssignments)
            if (comp.finalPractice !== null) finalVals.push(comp.finalPractice)
            if (comp.discussion !== null) discVals.push(comp.discussion)
            if (
              comp.pretest !== null ||
              comp.posttest !== null ||
              comp.weeklyAssignments !== null ||
              comp.finalPractice !== null ||
              comp.discussion !== null
            ) {
              finalGradeVals.push(comp.final)
            }
          }
          s.avgPretest = avgOrNull(preVals)
          s.avgPosttest = avgOrNull(postVals)
          s.avgWeekly = avgOrNull(weeklyVals)
          s.avgFinalPractice = avgOrNull(finalVals)
          s.avgDiscussion = avgOrNull(discVals)
          s.avgFinal = avgOrNull(finalGradeVals)
          s.discussionPosts = postsByCourse.get(c.id) ?? 0
          s.activeStudents = activeByCourse.get(c.id)?.size ?? 0
        }
        const out: CourseStats[] = [...stats.values()].map((s) => ({
          ...s,
          pending: s.submissions - s.graded,
        }))
        if (!cancelled) {
          setRows(out)
          setWeights(w)
          setPassingGrade(pass)
        }
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
        subtitle="Enrollment, penyelesaian lesson, hasil kuis, penilaian, rata-rata komponen nilai, dan partisipasi diskusi per course yang kamu ampu."
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
        <>
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

          <section className="section">
            <h2>Rata-rata komponen nilai &amp; partisipasi diskusi</h2>
            <div className="grade-table-wrap">
              <table className="grade-table">
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Rata-rata Pretest</th>
                    <th>Rata-rata Posttest</th>
                    <th>Rata-rata Tugas Mingguan</th>
                    <th>Rata-rata Tugas Akhir</th>
                    <th>Rata-rata Diskusi</th>
                    <th>Rata-rata Nilai Akhir</th>
                    <th>Postingan Diskusi</th>
                    <th>Siswa Aktif Diskusi</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.courseId}>
                      <td>
                        <Link to={`/course/${r.courseId}`}>{r.title}</Link>
                      </td>
                      <td>{fmtScore(r.avgPretest)}</td>
                      <td>{fmtScore(r.avgPosttest)}</td>
                      <td>{fmtScore(r.avgWeekly)}</td>
                      <td>{fmtScore(r.avgFinalPractice)}</td>
                      <td>{fmtScore(r.avgDiscussion)}</td>
                      <td>{fmtScore(r.avgFinal)}</td>
                      <td>{r.discussionPosts}</td>
                      <td>{r.activeStudents}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">
              Rata-rata komponen dihitung per siswa terdaftar dulu, lalu dirata-rata lintas siswa
              yang punya nilai, memakai bobot RPS SVS-SEM1 (Pretest {weights.pretest}% · Posttest{' '}
              {weights.posttest}% · Tugas mingguan {weights.tugasMingguan}% · Tugas praktik akhir{' '}
              {weights.tugasAkhir}% · Diskusi {weights.diskusi}%; passing grade {passingGrade}).
              Tanda "—" berarti belum ada nilai untuk komponen itu.
            </p>
          </section>
        </>
      )}
      <p className="muted">
        Angka dihitung langsung dari enrollment, progres lesson, percobaan kuis, submission, dan
        diskusi yang tersimpan. Tidak ada angka contoh.
      </p>
    </div>
  )
}
