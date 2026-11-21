// SINEVERSE — Admin Panel: Analytics & Reports (Tahap 4).
// Agregat read-only per course + ringkasan platform. Semua angka dihitung
// dari data Supabase yang ada — tanpa data palsu; kosong ditampilkan "—"
// atau 0. Rata-rata skor dihitung per siswa terdaftar dulu (skor terbaik
// per kuis, seperti GradebookPage), lalu dirata-rata lintas siswa yang
// punya nilai. Nilai akhir memakai bobot + passing grade baris RPS
// SVS-SEM1, dengan fallback ke bobot master prompt bila baris tidak ada.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchCourses, fetchProfileNames, supabase } from '../lib/supabase'
import type { Rps } from '../lib/types'
import {
  avgOrNull,
  bestScoresByQuiz,
  buildGradeComponents,
  discussionParticipationScore,
} from '../lib/grading'
import { BRAND, PASSING_GRADE } from '../lib/brand'
import PageHeader from '../components/PageHeader'
import WorkspaceNav from '../components/WorkspaceNav'
import { ADMIN_NAV } from '../lib/workspaceNav'

const FALLBACK_WEIGHTS = { pretest: 5, posttest: 15, tugas_mingguan: 30, tugas_akhir: 40, diskusi: 10 }

interface CourseRow {
  courseId: string
  title: string
  mentor: string
  enrollments: number
  completionPct: number | null
  avgPretest: number | null
  avgPosttest: number | null
  avgWeekly: number | null
  avgFinalPractice: number | null
  avgFinal: number | null
  discussionPosts: number
  activeStudents: number
  ungraded: number
}

interface TopLesson {
  lessonId: string
  title: string
  courseTitle: string
  posts: number
}

interface PlatformSummary {
  siswa: number
  mentor: number
  enrollments: number
  certificates: number
  discussionPosts: number
}

function fmtScore(v: number | null): string {
  return v === null ? '—' : v.toFixed(1)
}

export default function AdminAnalyticsPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<CourseRow[] | null>(null)
  const [topLessons, setTopLessons] = useState<TopLesson[]>([])
  const [summary, setSummary] = useState<PlatformSummary | null>(null)
  const [weights, setWeights] = useState(FALLBACK_WEIGHTS)
  const [passing, setPassing] = useState(PASSING_GRADE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        // Batch tingkat atas paralel: course + profil + enrollment +
        // modules + baris RPS + hitung sertifikat.
        const noId = ['00000000-0000-0000-0000-000000000000']
        const [
          courseList,
          { data: profileRows },
          { data: enrRowsRaw },
          { data: modRowsRaw },
          { data: rpsRow },
          { count: certCount },
        ] = await Promise.all([
          fetchCourses(),
          supabase.from('profiles').select('id,role'),
          supabase.from('enrollments').select('id,user_id,course_id'),
          supabase.from('modules').select('id,course_id'),
          supabase.from('rps').select('*').eq('code', BRAND.rpsCode).maybeSingle(),
          supabase.from('certificates').select('id', { count: 'exact', head: true }),
        ])
        const profs = (profileRows ?? []) as { id: string; role: string }[]
        const enrRows = (enrRowsRaw ?? []) as { id: string; user_id: string; course_id: string }[]
        const modRows = (modRowsRaw ?? []) as { id: string; course_id: string }[]
        const rps = rpsRow as unknown as Rps | null
        const w = {
          pretest: rps?.weights?.pretest ?? FALLBACK_WEIGHTS.pretest,
          posttest: rps?.weights?.posttest ?? FALLBACK_WEIGHTS.posttest,
          tugas_mingguan: rps?.weights?.tugas_mingguan ?? FALLBACK_WEIGHTS.tugas_mingguan,
          tugas_akhir: rps?.weights?.tugas_akhir ?? FALLBACK_WEIGHTS.tugas_akhir,
          diskusi: rps?.weights?.diskusi ?? FALLBACK_WEIGHTS.diskusi,
        }
        const pass = rps?.passing_grade ?? PASSING_GRADE

        const modCourse = new Map(modRows.map((m) => [m.id, m.course_id]))
        const { data: lessonRowsRaw } = await supabase
          .from('lessons')
          .select('id,module_id,title')
          .in('module_id', modRows.length > 0 ? modRows.map((m) => m.id) : noId)
        const lessonRows = (lessonRowsRaw ?? []) as { id: string; module_id: string; title: string }[]
        const lessonCourse = new Map(lessonRows.map((l) => [l.id, modCourse.get(l.module_id) ?? '']))
        const lessonTitle = new Map(lessonRows.map((l) => [l.id, l.title]))
        const lessonIds = lessonRows.map((l) => l.id)
        const lessonIn = lessonIds.length > 0 ? lessonIds : noId

        // Progres + kuis + tugas + diskusi paralel, lalu percobaan +
        // submission paralel. Pengelompokan per course dihitung di JS.
        const [{ data: progRaw }, { data: quizRaw }, { data: assignRaw }, { data: discRaw }] = await Promise.all([
          supabase.from('lesson_progress').select('lesson_id,user_id').in('lesson_id', lessonIn).eq('status', 'completed'),
          supabase.from('quizzes').select('id,kind,lesson_id').in('lesson_id', lessonIn),
          supabase.from('assignments').select('id,kind,lesson_id').in('lesson_id', lessonIn),
          supabase.from('discussions').select('id,lesson_id,user_id').in('lesson_id', lessonIn),
        ])
        const progRows = (progRaw ?? []) as { lesson_id: string; user_id: string }[]
        const quizRows = (quizRaw ?? []) as { id: string; kind?: string | null; lesson_id: string }[]
        const assignRows = (assignRaw ?? []) as { id: string; kind?: string | null; lesson_id: string }[]
        const discRows = (discRaw ?? []) as { id: string; lesson_id: string; user_id: string }[]
        const quizCourse = new Map(quizRows.map((q) => [q.id, lessonCourse.get(q.lesson_id) ?? '']))
        const assignCourse = new Map(assignRows.map((a) => [a.id, lessonCourse.get(a.lesson_id) ?? '']))
        const [{ data: attRaw }, { data: subRaw }] = await Promise.all([
          supabase
            .from('quiz_attempts')
            .select('quiz_id,user_id,score')
            .in('quiz_id', quizRows.length > 0 ? quizRows.map((q) => q.id) : noId),
          supabase
            .from('submissions')
            .select('assignment_id,user_id,score')
            .in('assignment_id', assignRows.length > 0 ? assignRows.map((a) => a.id) : noId),
        ])
        const attRows = (attRaw ?? []) as { quiz_id: string; user_id: string; score: number | null }[]
        const subRows = (subRaw ?? []) as { assignment_id: string; user_id: string; score: number | null }[]

        // Nama mentor (batch, bukan per course).
        const mentorIds = courseList.map((c) => c.mentor_id).filter((id): id is string => Boolean(id))
        const names = await fetchProfileNames(mentorIds)

        // Enrollment per course.
        const enrolledByCourse = new Map<string, Set<string>>()
        for (const c of courseList) enrolledByCourse.set(c.id, new Set())
        for (const e of enrRows) enrolledByCourse.get(e.course_id)?.add(e.user_id)

        // Lesson per course.
        const lessonsByCourse = new Map<string, number>()
        for (const l of lessonRows) {
          const cid = lessonCourse.get(l.id) ?? ''
          lessonsByCourse.set(cid, (lessonsByCourse.get(cid) ?? 0) + 1)
        }

        // Lesson selesai: hanya progres siswa yang terdaftar di course itu.
        const completedByCourse = new Map<string, number>()
        for (const p of progRows) {
          const cid = lessonCourse.get(p.lesson_id) ?? ''
          if (!enrolledByCourse.get(cid)?.has(p.user_id)) continue
          completedByCourse.set(cid, (completedByCourse.get(cid) ?? 0) + 1)
        }

        // Kuis per course per jenis.
        const pretestIdsByCourse = new Map<string, Set<string>>()
        const posttestIdsByCourse = new Map<string, Set<string>>()
        for (const q of quizRows) {
          const cid = quizCourse.get(q.id) ?? ''
          if (q.kind === 'pretest') {
            if (!pretestIdsByCourse.has(cid)) pretestIdsByCourse.set(cid, new Set())
            pretestIdsByCourse.get(cid)?.add(q.id)
          } else if (q.kind === 'posttest') {
            if (!posttestIdsByCourse.has(cid)) posttestIdsByCourse.set(cid, new Set())
            posttestIdsByCourse.get(cid)?.add(q.id)
          }
        }

        // Tugas per course per jenis (tugas lama tanpa kind dibaca mingguan).
        const weeklyIdsByCourse = new Map<string, Set<string>>()
        const finalIdsByCourse = new Map<string, Set<string>>()
        for (const a of assignRows) {
          const cid = assignCourse.get(a.id) ?? ''
          const target = (a.kind ?? 'weekly') === 'final_practice' ? finalIdsByCourse : weeklyIdsByCourse
          if (!target.has(cid)) target.set(cid, new Set())
          target.get(cid)?.add(a.id)
        }

        // Percobaan kuis per siswa (skor terbaik per kuis).
        const attemptsByUser = new Map<string, { quiz_id: string; score: number | null }[]>()
        for (const a of attRows) {
          if (!attemptsByUser.has(a.user_id)) attemptsByUser.set(a.user_id, [])
          attemptsByUser.get(a.user_id)?.push({ quiz_id: a.quiz_id, score: a.score })
        }

        // Submission per siswa.
        const subsByUser = new Map<string, { assignment_id: string; score: number | null }[]>()
        for (const s of subRows) {
          if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, [])
          subsByUser.get(s.user_id)?.push({ assignment_id: s.assignment_id, score: s.score })
        }

        // Diskusi per course: jumlah postingan + siswa terdaftar yang aktif.
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

        // Submission belum dinilai per course (semua pengumpulan di course).
        const ungradedByCourse = new Map<string, number>()
        for (const s of subRows) {
          if (s.score !== null) continue
          const cid = assignCourse.get(s.assignment_id) ?? ''
          ungradedByCourse.set(cid, (ungradedByCourse.get(cid) ?? 0) + 1)
        }

        // Postingan diskusi per lesson (semua penulis) untuk top 5.
        const postsByLesson = new Map<string, number>()
        for (const d of discRows) {
          postsByLesson.set(d.lesson_id, (postsByLesson.get(d.lesson_id) ?? 0) + 1)
        }
        const courseTitle = new Map(courseList.map((c) => [c.id, c.title]))

        const out: CourseRow[] = courseList.map((c) => {
          const enrolled = enrolledByCourse.get(c.id) ?? new Set<string>()
          const lessonCount = lessonsByCourse.get(c.id) ?? 0
          const completed = completedByCourse.get(c.id) ?? 0
          const completionPct =
            enrolled.size > 0 && lessonCount > 0 ? (completed / (enrolled.size * lessonCount)) * 100 : null

          // Nilai per siswa, lalu rata-rata lintas siswa yang punya nilai.
          const pretestVals: number[] = []
          const posttestVals: number[] = []
          const weeklyVals: number[] = []
          const finalVals: number[] = []
          const finalGradeVals: number[] = []
          const preIds = pretestIdsByCourse.get(c.id) ?? new Set<string>()
          const postIds = posttestIdsByCourse.get(c.id) ?? new Set<string>()
          const weekIds = weeklyIdsByCourse.get(c.id) ?? new Set<string>()
          const finIds = finalIdsByCourse.get(c.id) ?? new Set<string>()
          for (const uid of enrolled) {
            const best = bestScoresByQuiz(attemptsByUser.get(uid) ?? [])
            const pre = avgOrNull([...best.entries()].filter(([id]) => preIds.has(id)).map(([, s]) => s))
            const post = avgOrNull([...best.entries()].filter(([id]) => postIds.has(id)).map(([, s]) => s))
            const mySubs = subsByUser.get(uid) ?? []
            const weekly = avgOrNull(
              mySubs.filter((s) => weekIds.has(s.assignment_id) && s.score !== null).map((s) => s.score as number),
            )
            const fin = avgOrNull(
              mySubs.filter((s) => finIds.has(s.assignment_id) && s.score !== null).map((s) => s.score as number),
            )
            const userPosts = discRows.filter(
              (d) => d.user_id === uid && lessonCourse.get(d.lesson_id) === c.id,
            )
            const discussion = discussionParticipationScore(userPosts)
            if (pre !== null) pretestVals.push(pre)
            if (post !== null) posttestVals.push(post)
            if (weekly !== null) weeklyVals.push(weekly)
            if (fin !== null) finalVals.push(fin)
            if (pre !== null || post !== null || weekly !== null || fin !== null || discussion !== null) {
              const comp = buildGradeComponents(
                { pretest: pre, posttest: post, weeklyAssignments: weekly, finalPractice: fin, discussion },
                {
                  pretest: w.pretest,
                  posttest: w.posttest,
                  tugasMingguan: w.tugas_mingguan,
                  tugasAkhir: w.tugas_akhir,
                  diskusi: w.diskusi,
                },
                pass,
              )
              finalGradeVals.push(comp.final)
            }
          }

          return {
            courseId: c.id,
            title: c.title,
            mentor: c.mentor_id ? (names.get(c.mentor_id) ?? 'Mentor') : '—',
            enrollments: enrolled.size,
            completionPct,
            avgPretest: avgOrNull(pretestVals),
            avgPosttest: avgOrNull(posttestVals),
            avgWeekly: avgOrNull(weeklyVals),
            avgFinalPractice: avgOrNull(finalVals),
            avgFinal: avgOrNull(finalGradeVals),
            discussionPosts: postsByCourse.get(c.id) ?? 0,
            activeStudents: activeByCourse.get(c.id)?.size ?? 0,
            ungraded: ungradedByCourse.get(c.id) ?? 0,
          }
        })

        const top: TopLesson[] = [...postsByLesson.entries()]
          .map(([lessonId, posts]) => ({
            lessonId,
            title: lessonTitle.get(lessonId) ?? 'Lesson',
            courseTitle: courseTitle.get(lessonCourse.get(lessonId) ?? '') ?? '—',
            posts,
          }))
          .sort((a, b) => b.posts - a.posts)
          .slice(0, 5)

        if (cancelled) return
        setRows(out)
        setTopLessons(top)
        setWeights(w)
        setPassing(pass)
        setSummary({
          siswa: profs.filter((p) => p.role === 'siswa').length,
          mentor: profs.filter((p) => p.role === 'mentor').length,
          enrollments: enrRows.length,
          certificates: certCount ?? 0,
          discussionPosts: discRows.length,
        })
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
  }, [])

  if (profile?.role !== 'admin') {
    return (
      <div className="page">
        <h1>Analytics &amp; Reports</h1>
        <p className="empty">Halaman ini hanya untuk admin.</p>
      </div>
    )
  }
  if (loading) return <div className="page"><p className="muted">Memuat…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>

  return (
    <div className="page">
      <PageHeader
        icon="chart"
        title="Analytics & Reports"
        subtitle="Agregat per course dan ringkasan platform, dihitung langsung dari data Academy."
      />
      <WorkspaceNav entries={ADMIN_NAV} />

      <section className="section">
        <h2>Ringkasan platform</h2>
        {summary === null ? (
          <p className="empty">Belum ada data platform.</p>
        ) : (
          <dl className="profile-list">
            <div><dt>Total siswa</dt><dd>{summary.siswa}</dd></div>
            <div><dt>Total mentor</dt><dd>{summary.mentor}</dd></div>
            <div><dt>Total enrollment</dt><dd>{summary.enrollments}</dd></div>
            <div><dt>Sertifikat diterbitkan</dt><dd>{summary.certificates}</dd></div>
            <div><dt>Total postingan diskusi</dt><dd>{summary.discussionPosts}</dd></div>
          </dl>
        )}
      </section>

      <section className="section">
        <h2>Per course</h2>
        {rows !== null && rows.length === 0 ? (
          <p className="empty">Belum ada course.</p>
        ) : (
          <div className="grade-table-wrap">
            <table className="grade-table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Mentor</th>
                  <th>Siswa</th>
                  <th>Penyelesaian</th>
                  <th>Rata-rata Pretest</th>
                  <th>Rata-rata Posttest</th>
                  <th>Rata-rata Tugas Mingguan</th>
                  <th>Rata-rata Tugas Akhir</th>
                  <th>Rata-rata Nilai Akhir</th>
                  <th>Diskusi</th>
                  <th>Belum Dinilai</th>
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).map((r) => (
                  <tr key={r.courseId}>
                    <td>
                      <Link to={`/course/${r.courseId}`}>{r.title}</Link>
                    </td>
                    <td>{r.mentor}</td>
                    <td>{r.enrollments}</td>
                    <td>{r.completionPct === null ? '—' : `${r.completionPct.toFixed(1)}%`}</td>
                    <td>{fmtScore(r.avgPretest)}</td>
                    <td>{fmtScore(r.avgPosttest)}</td>
                    <td>{fmtScore(r.avgWeekly)}</td>
                    <td>{fmtScore(r.avgFinalPractice)}</td>
                    <td>{fmtScore(r.avgFinal)}</td>
                    <td>
                      {r.discussionPosts} postingan · {r.activeStudents} siswa aktif
                    </td>
                    <td>{r.ungraded}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted">
          Penyelesaian = lesson selesai dibagi (siswa terdaftar × jumlah lesson). Rata-rata nilai
          akhir memakai bobot RPS SVS-SEM1 (Pretest {weights.pretest}% · Posttest {weights.posttest}% ·
          Tugas mingguan {weights.tugas_mingguan}% · Tugas akhir {weights.tugas_akhir}% · Diskusi{' '}
          {weights.diskusi}%; passing grade {passing}). Tanda "—" berarti belum ada data.
        </p>
      </section>

      <section className="section">
        <h2>Lesson paling banyak didiskusikan</h2>
        {topLessons.length === 0 ? (
          <p className="empty">Belum ada postingan diskusi.</p>
        ) : (
          <div className="grade-table-wrap">
            <table className="grade-table">
              <thead>
                <tr>
                  <th>Lesson</th>
                  <th>Course</th>
                  <th>Postingan</th>
                </tr>
              </thead>
              <tbody>
                {topLessons.map((t) => (
                  <tr key={t.lessonId}>
                    <td>{t.title}</td>
                    <td>{t.courseTitle}</td>
                    <td>{t.posts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="muted">
        Angka dihitung langsung dari enrollment, progres lesson, percobaan kuis, submission, dan
        diskusi yang tersimpan. Tidak ada angka contoh.
      </p>
    </div>
  )
}
