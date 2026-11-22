// SINEVERSE — Admin Panel: Analytics & Reports (Tahap 4).
// Agregat read-only per course + ringkasan platform + tren Bulanan/Tahunan
// (grafik batang CSS dari data asli: enrollment per bulan/tahun dari
// enrolled_at, sertifikat diterbitkan dari issued_at, submission masuk dari
// submitted_at). Semua angka dihitung dari data Supabase yang ada — tanpa
// data palsu; kosong ditampilkan "—" atau 0. Rata-rata skor dihitung per siswa terdaftar dulu (skor terbaik
// per kuis, seperti GradebookPage), lalu dirata-rata lintas siswa yang
// punya nilai. Nilai akhir memakai bobot + passing grade baris RPS
// SVS-SEM1, dengan fallback ke bobot master prompt bila baris tidak ada.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { countEnrollments, countUsersByRole } from '../lib/counts'
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

const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

interface TrendBucket {
  label: string
  value: number
}

/** 12 bulan kalender terakhir (termasuk bulan berjalan), nol tetap tampil. */
function monthBuckets(timestamps: string[]): TrendBucket[] {
  const now = new Date()
  const buckets: (TrendBucket & { key: string })[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    buckets.push({
      label: `${MONTHS_ID[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      value: 0,
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    })
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]))
  for (const ts of timestamps) {
    const d = new Date(ts)
    if (Number.isNaN(d.getTime())) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const b = byKey.get(key)
    if (b) b.value += 1
  }
  return buckets
}

/** Tahun dari tahun data paling awal sampai tahun berjalan. */
function yearBuckets(timestamps: string[]): TrendBucket[] {
  const years = timestamps
    .map((ts) => new Date(ts).getFullYear())
    .filter((y) => !Number.isNaN(y))
  if (years.length === 0) return []
  const buckets: TrendBucket[] = []
  for (let y = Math.min(...years); y <= new Date().getFullYear(); y++) {
    buckets.push({ label: String(y), value: 0 })
  }
  const byYear = new Map(buckets.map((b) => [b.label, b]))
  for (const y of years) {
    const b = byYear.get(String(y))
    if (b) b.value += 1
  }
  return buckets
}

/** Grafik batang CSS murni (tanpa library baru) dari bucket data asli. */
function BarChart({ data }: { data: TrendBucket[] }) {
  const max = Math.max(0, ...data.map((d) => d.value))
  if (data.length === 0) return <p className="empty">Belum ada data.</p>
  return (
    <div>
      <div
        style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: '10rem' }}
        role="img"
        aria-label={`Grafik batang: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`}
      >
        {data.map((d) => (
          <div
            key={d.label}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-end',
              height: '100%',
            }}
          >
            <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{d.value}</span>
            <div
              title={`${d.label}: ${d.value}`}
              style={{
                width: '100%',
                maxWidth: '2.5rem',
                height: max > 0 ? `${Math.max(d.value > 0 ? 4 : 0, (d.value / max) * 130)}px` : '2px',
                background: 'var(--film-green)',
                borderRadius: '4px 4px 0 0',
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {data.map((d) => (
          <span
            key={d.label}
            style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: '0.75rem', color: '#5b6b7c' }}
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function AdminAnalyticsPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<CourseRow[] | null>(null)
  const [topLessons, setTopLessons] = useState<TopLesson[]>([])
  const [summary, setSummary] = useState<PlatformSummary | null>(null)
  const [weights, setWeights] = useState(FALLBACK_WEIGHTS)
  const [passing, setPassing] = useState(PASSING_GRADE)
  const [trendTab, setTrendTab] = useState<'bulanan' | 'tahunan'>('bulanan')
  const [trend, setTrend] = useState<{
    bulanan: { enrollments: TrendBucket[]; certificates: TrendBucket[]; submissions: TrendBucket[] }
    tahunan: { enrollments: TrendBucket[]; certificates: TrendBucket[]; submissions: TrendBucket[] }
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        // Batch tingkat atas paralel: course + profil + enrollment +
        // modules + baris RPS + hitung sertifikat.
        const noId = ['00000000-0000-0000-0000-000000000000']
        // B62 (K13): .error tiap batch DIPERIKSA — gagal = error state,
        // bukan agregat 0 + empty state yang menyamarkan kegagalan.
        // fetchCourses sudah melempar sendiri bila gagal.
        const [
          courseList,
          { data: profileRows, error: profileErr },
          { data: enrRowsRaw, error: enrErr },
          { data: modRowsRaw, error: modErr },
          { data: rpsRow, error: rpsErr },
          { data: certRowsRaw, error: certErr },
        ] = await Promise.all([
          fetchCourses(),
          supabase.from('profiles').select('id,role'),
          supabase.from('enrollments').select('id,user_id,course_id,enrolled_at'),
          supabase.from('modules').select('id,course_id'),
          supabase.from('rps').select('*').eq('code', BRAND.rpsCode).maybeSingle(),
          supabase.from('certificates').select('id,issued_at'),
        ])
        {
          const failed = (
            [
              ['profil', profileErr],
              ['enrollment', enrErr],
              ['modul', modErr],
              ['RPS', rpsErr],
              ['sertifikat', certErr],
            ] as const
          )
            .filter(([, e]) => e)
            .map(([name, e]) => `${name} (${e?.message ?? 'gagal'})`)
          if (failed.length > 0) {
            throw new Error(`Gagal memuat analitik: ${failed.join('; ')}.`)
          }
        }
        const profs = (profileRows ?? []) as { id: string; role: string }[]
        const enrRows = (enrRowsRaw ?? []) as {
          id: string
          user_id: string
          course_id: string
          enrolled_at: string
        }[]
        const certRows = (certRowsRaw ?? []) as { id: string; issued_at: string }[]
        const certCount = certRows.length
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
        const { data: lessonRowsRaw, error: lessonErr } = await supabase
          .from('lessons')
          .select('id,module_id,title')
          .in('module_id', modRows.length > 0 ? modRows.map((m) => m.id) : noId)
        if (lessonErr) throw new Error(`Gagal memuat analitik: lesson (${lessonErr.message}).`)
        const lessonRows = (lessonRowsRaw ?? []) as { id: string; module_id: string; title: string }[]
        const lessonCourse = new Map(lessonRows.map((l) => [l.id, modCourse.get(l.module_id) ?? '']))
        const lessonTitle = new Map(lessonRows.map((l) => [l.id, l.title]))
        const lessonIds = lessonRows.map((l) => l.id)
        const lessonIn = lessonIds.length > 0 ? lessonIds : noId

        // Progres + kuis + tugas + diskusi paralel, lalu percobaan +
        // submission paralel. Pengelompokan per course dihitung di JS.
        const [
          { data: progRaw, error: progErr },
          { data: quizRaw, error: quizErr },
          { data: assignRaw, error: assignErr },
          { data: discRaw, error: discErr },
        ] = await Promise.all([
          supabase.from('lesson_progress').select('lesson_id,user_id').in('lesson_id', lessonIn).eq('status', 'completed'),
          supabase.from('quizzes').select('id,kind,lesson_id').in('lesson_id', lessonIn),
          supabase.from('assignments').select('id,kind,lesson_id').in('lesson_id', lessonIn),
          supabase.from('discussions').select('id,lesson_id,user_id').in('lesson_id', lessonIn),
        ])
        {
          const failed = (
            [
              ['progres lesson', progErr],
              ['kuis', quizErr],
              ['tugas', assignErr],
              ['diskusi', discErr],
            ] as const
          )
            .filter(([, e]) => e)
            .map(([name, e]) => `${name} (${e?.message ?? 'gagal'})`)
          if (failed.length > 0) {
            throw new Error(`Gagal memuat analitik: ${failed.join('; ')}.`)
          }
        }
        const progRows = (progRaw ?? []) as { lesson_id: string; user_id: string }[]
        const quizRows = (quizRaw ?? []) as { id: string; kind?: string | null; lesson_id: string }[]
        const assignRows = (assignRaw ?? []) as { id: string; kind?: string | null; lesson_id: string }[]
        const discRows = (discRaw ?? []) as { id: string; lesson_id: string; user_id: string }[]
        const quizCourse = new Map(quizRows.map((q) => [q.id, lessonCourse.get(q.lesson_id) ?? '']))
        const assignCourse = new Map(assignRows.map((a) => [a.id, lessonCourse.get(a.lesson_id) ?? '']))
        const [{ data: attRaw, error: attErr }, { data: subRaw, error: subErr }] = await Promise.all([
          supabase
            .from('quiz_attempts')
            .select('quiz_id,user_id,score')
            .in('quiz_id', quizRows.length > 0 ? quizRows.map((q) => q.id) : noId),
          supabase
            .from('submissions')
            .select('assignment_id,user_id,score,submitted_at')
            .in('assignment_id', assignRows.length > 0 ? assignRows.map((a) => a.id) : noId),
        ])
        {
          const failed = (
            [
              ['percobaan kuis', attErr],
              ['submission', subErr],
            ] as const
          )
            .filter(([, e]) => e)
            .map(([name, e]) => `${name} (${e?.message ?? 'gagal'})`)
          if (failed.length > 0) {
            throw new Error(`Gagal memuat analitik: ${failed.join('; ')}.`)
          }
        }
        const attRows = (attRaw ?? []) as { quiz_id: string; user_id: string; score: number | null }[]
        const subRows = (subRaw ?? []) as {
          assignment_id: string
          user_id: string
          score: number | null
          submitted_at: string
        }[]

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
        // Tren dari timestamp asli: enrollment (enrolled_at), sertifikat
        // (issued_at), submission (submitted_at).
        const enrTs = enrRows.map((e) => e.enrolled_at)
        const certTs = certRows.map((c) => c.issued_at)
        const subTs = subRows.map((s) => s.submitted_at)
        setTrend({
          bulanan: {
            enrollments: monthBuckets(enrTs),
            certificates: monthBuckets(certTs),
            submissions: monthBuckets(subTs),
          },
          tahunan: {
            enrollments: yearBuckets(enrTs),
            certificates: yearBuckets(certTs),
            submissions: yearBuckets(subTs),
          },
        })
        // K13: angka ringkasan lewat helper bersama (lib/counts.ts) —
        // definisi "enrollment" di sini = siswa terdaftar (bukan waitlist),
        // sama seperti halaman Kelola Enrollment dan Beranda admin.
        const roleCounts = countUsersByRole(profs)
        setSummary({
          siswa: roleCounts.siswa,
          mentor: roleCounts.mentor,
          enrollments: countEnrollments(enrRows).enrolled,
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
        <div className="dash-section-head"><h2>Ringkasan platform</h2></div>
        {summary === null ? (
          <p className="empty">Belum ada data platform.</p>
        ) : (
          <div className="stat-grid">
            <div className="stat-card"><span className="stat-num">{summary.siswa}</span><span className="stat-label">Total siswa</span></div>
            <div className="stat-card"><span className="stat-num">{summary.mentor}</span><span className="stat-label">Total mentor</span></div>
            <div className="stat-card"><span className="stat-num">{summary.enrollments}</span><span className="stat-label">Total enrollment (terdaftar)</span></div>
            <div className="stat-card"><span className="stat-num">{summary.certificates}</span><span className="stat-label">Sertifikat diterbitkan</span></div>
            <div className="stat-card"><span className="stat-num">{summary.discussionPosts}</span><span className="stat-label">Postingan diskusi</span></div>
          </div>
        )}
      </section>

      <section className="section">
        <div className="dash-section-head">
          <h2>Tren</h2>
          <div role="group" aria-label="Periode tren" style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className={trendTab === 'bulanan' ? 'btn btn-primary btn-small' : 'btn btn-ghost btn-small'}
              aria-pressed={trendTab === 'bulanan'}
              onClick={() => setTrendTab('bulanan')}
            >
              Bulanan
            </button>
            <button
              type="button"
              className={trendTab === 'tahunan' ? 'btn btn-primary btn-small' : 'btn btn-ghost btn-small'}
              aria-pressed={trendTab === 'tahunan'}
              onClick={() => setTrendTab('tahunan')}
            >
              Tahunan
            </button>
          </div>
        </div>
        {trend === null ? (
          <p className="empty">Belum ada data tren.</p>
        ) : (
          <>
            <h3>Enrollment baru</h3>
            <BarChart data={trend[trendTab].enrollments} />
            <h3 style={{ marginTop: '1.25rem' }}>Sertifikat diterbitkan</h3>
            <BarChart data={trend[trendTab].certificates} />
            <h3 style={{ marginTop: '1.25rem' }}>Submission masuk</h3>
            <BarChart data={trend[trendTab].submissions} />
            <p className="muted">
              {trendTab === 'bulanan'
                ? 'Bulanan = 12 bulan kalender terakhir, termasuk bulan berjalan.'
                : 'Tahunan = tahun data paling awal sampai tahun berjalan.'}{' '}
              Dihitung dari enrolled_at, issued_at, dan submitted_at yang tersimpan.
            </p>
          </>
        )}
      </section>

      <section className="section">
        <div className="dash-section-head"><h2>Per course</h2></div>
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
        <div className="dash-section-head"><h2>Lesson paling banyak didiskusikan</h2></div>
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
