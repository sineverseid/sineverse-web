// SINEVERSE — Admin Panel: Analitik Akademi (Tahap 6).
// Pelengkap AdminAnalyticsPage (Tahap 4, frozen): halaman ini hanya berisi
// celah yang belum ada di sana — turnaround penilaian per course,
// keterlambatan pengumpulan, beban kerja mentor, dan tren Bulanan/Tahunan
// (grafik batang CSS dari data asli: submission masuk dari submitted_at
// dan enrollment baru dari enrolled_at). Semua angka dihitung dari data
// Supabase yang ada — tanpa data palsu; kosong ditampilkan "—".
// Turnaround = graded_at − submitted_at, hanya untuk submission yang sudah
// dinilai (score tidak null) dan punya graded_at. Terlambat = flag is_late
// (migrasi 009) ATAU submitted_at melewati assignments.due_date.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchCourses, fetchProfileNames, supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import WorkspaceNav from '../components/WorkspaceNav'
import { ADMIN_NAV } from '../lib/workspaceNav'

interface TurnaroundRow {
  courseId: string
  title: string
  mentor: string
  graded: number
  avgHours: number | null
  medianHours: number | null
  oldestUngradedDays: number | null
  ungraded: number
}

interface LateRow {
  courseId: string
  title: string
  total: number
  late: number
  ratePct: number | null
  assignmentsWithDueDate: number
  assignmentsTotal: number
}

interface MentorRow {
  mentorId: string
  name: string
  courses: string[]
  students: number
  ungraded: number
  graded: number
  avgHours: number | null
  medianHours: number | null
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

function fmtDuration(hours: number | null): string {
  if (hours === null) return '—'
  if (hours < 1) return `${Math.round(hours * 60)} mnt`
  if (hours < 48) return `${hours.toFixed(1)} jam`
  return `${(hours / 24).toFixed(1)} hari`
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

export default function AdminAcademyAnalyticsPage() {
  const { profile } = useAuth()
  const [turnaround, setTurnaround] = useState<TurnaroundRow[] | null>(null)
  const [lateRows, setLateRows] = useState<LateRow[] | null>(null)
  const [mentorRows, setMentorRows] = useState<MentorRow[] | null>(null)
  const [gradedNoTimestamp, setGradedNoTimestamp] = useState(0)
  const [coursesWithoutMentor, setCoursesWithoutMentor] = useState(0)
  const [mentorsWithoutCourse, setMentorsWithoutCourse] = useState(0)
  const [trendTab, setTrendTab] = useState<'bulanan' | 'tahunan'>('bulanan')
  const [trend, setTrend] = useState<{
    bulanan: { submissions: TrendBucket[]; enrollments: TrendBucket[] }
    tahunan: { submissions: TrendBucket[]; enrollments: TrendBucket[] }
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        // Batch tingkat atas paralel: course + profil + enrollment +
        // modules + submission. Assignments menyusul setelah lesson
        // diketahui (butuh lesson_id). Pengelompokan dihitung di JS.
        const noId = ['00000000-0000-0000-0000-000000000000']
        // B62 (K13): .error tiap batch DIPERIKSA — gagal = error state,
        // bukan agregat 0 + empty state. fetchCourses sudah melempar
        // sendiri bila gagal.
        const [
          courseList,
          { data: profileRows, error: profileErr },
          { data: enrRowsRaw, error: enrErr },
          { data: modRowsRaw, error: modErr },
          { data: subRowsRaw, error: subErr },
        ] = await Promise.all([
          fetchCourses(),
          supabase.from('profiles').select('id,role'),
          supabase.from('enrollments').select('id,user_id,course_id,enrolled_at'),
          supabase.from('modules').select('id,course_id'),
          supabase
            .from('submissions')
            .select('id,assignment_id,user_id,score,submitted_at,graded_at,is_late'),
        ])
        {
          const failed = (
            [
              ['profil', profileErr],
              ['enrollment', enrErr],
              ['modul', modErr],
              ['submission', subErr],
            ] as const
          )
            .filter(([, e]) => e)
            .map(([name, e]) => `${name} (${e?.message ?? 'gagal'})`)
          if (failed.length > 0) {
            throw new Error(`Gagal memuat analitik akademi: ${failed.join('; ')}.`)
          }
        }
        const profs = (profileRows ?? []) as { id: string; role: string }[]
        const enrRows = (enrRowsRaw ?? []) as {
          id: string
          user_id: string
          course_id: string
          enrolled_at: string
        }[]
        const modRows = (modRowsRaw ?? []) as { id: string; course_id: string }[]
        const subRows = (subRowsRaw ?? []) as {
          id: string
          assignment_id: string
          user_id: string
          score: number | null
          submitted_at: string
          graded_at: string | null
          is_late: boolean
        }[]
        const modCourse = new Map(modRows.map((m) => [m.id, m.course_id]))
        const { data: lessonRowsRaw, error: lessonErr } = await supabase
          .from('lessons')
          .select('id,module_id')
          .in('module_id', modRows.length > 0 ? modRows.map((m) => m.id) : noId)
        if (lessonErr) throw new Error(`Gagal memuat analitik akademi: lesson (${lessonErr.message}).`)
        const lessonRows = (lessonRowsRaw ?? []) as { id: string; module_id: string }[]
        const lessonCourse = new Map(lessonRows.map((l) => [l.id, modCourse.get(l.module_id) ?? '']))
        const lessonIds = lessonRows.map((l) => l.id)
        const { data: assignRowsRaw, error: assignErr } = await supabase
          .from('assignments')
          .select('id,lesson_id,due_date')
          .in('lesson_id', lessonIds.length > 0 ? lessonIds : noId)
        if (assignErr) throw new Error(`Gagal memuat analitik akademi: tugas (${assignErr.message}).`)
        const assignRows = (assignRowsRaw ?? []) as {
          id: string
          lesson_id: string
          due_date: string | null
        }[]
        const assignCourse = new Map(assignRows.map((a) => [a.id, lessonCourse.get(a.lesson_id) ?? '']))
        const assignDue = new Map(assignRows.map((a) => [a.id, a.due_date]))

        // Nama mentor (batch, bukan per course).
        const mentorIds = courseList
          .map((c) => c.mentor_id)
          .filter((id): id is string => Boolean(id))
        const names = await fetchProfileNames(mentorIds)

        // Enrollment per course (siswa distinct).
        const enrolledByCourse = new Map<string, Set<string>>()
        for (const c of courseList) enrolledByCourse.set(c.id, new Set())
        for (const e of enrRows) enrolledByCourse.get(e.course_id)?.add(e.user_id)

        // Turnaround + antrean belum dinilai per course.
        const hoursByCourse = new Map<string, number[]>()
        const gradedByCourse = new Map<string, number>()
        const ungradedByCourse = new Map<string, number>()
        const oldestUngradedByCourse = new Map<string, number>()
        let noTimestamp = 0
        const now = Date.now()
        for (const s of subRows) {
          const cid = assignCourse.get(s.assignment_id) ?? ''
          if (s.score !== null) {
            if (s.graded_at !== null) {
              const hours =
                (new Date(s.graded_at).getTime() - new Date(s.submitted_at).getTime()) / 3600000
              // Selisih negatif = anomali data (dinilai sebelum dikumpulkan);
              // tidak masuk hitung agar tidak mengarang angka.
              if (hours >= 0) {
                if (!hoursByCourse.has(cid)) hoursByCourse.set(cid, [])
                hoursByCourse.get(cid)?.push(hours)
                gradedByCourse.set(cid, (gradedByCourse.get(cid) ?? 0) + 1)
              }
            } else {
              noTimestamp += 1
            }
          } else {
            ungradedByCourse.set(cid, (ungradedByCourse.get(cid) ?? 0) + 1)
            const ageDays = (now - new Date(s.submitted_at).getTime()) / 86400000
            const prev = oldestUngradedByCourse.get(cid)
            if (prev === undefined || ageDays > prev) oldestUngradedByCourse.set(cid, ageDays)
          }
        }

        // Keterlambatan per course: flag is_late ATAU submitted_at melewati
        // due_date tugasnya (tugas tanpa due_date hanya bisa lewat flag).
        const totalByCourse = new Map<string, number>()
        const lateByCourse = new Map<string, number>()
        for (const s of subRows) {
          const cid = assignCourse.get(s.assignment_id) ?? ''
          totalByCourse.set(cid, (totalByCourse.get(cid) ?? 0) + 1)
          const due = assignDue.get(s.assignment_id)
          const afterDue =
            due !== null && due !== undefined && new Date(s.submitted_at).getTime() > new Date(due).getTime()
          if (s.is_late || afterDue) lateByCourse.set(cid, (lateByCourse.get(cid) ?? 0) + 1)
        }
        const assignCountByCourse = new Map<string, number>()
        const dueCountByCourse = new Map<string, number>()
        for (const a of assignRows) {
          const cid = assignCourse.get(a.id) ?? ''
          assignCountByCourse.set(cid, (assignCountByCourse.get(cid) ?? 0) + 1)
          if (a.due_date !== null) dueCountByCourse.set(cid, (dueCountByCourse.get(cid) ?? 0) + 1)
        }

        const mentorOfCourse = new Map(
          courseList.map((c) => [c.id, c.mentor_id ? (names.get(c.mentor_id) ?? 'Mentor') : '—']),
        )

        const turnRows: TurnaroundRow[] = courseList.map((c) => {
          const hours = hoursByCourse.get(c.id) ?? []
          return {
            courseId: c.id,
            title: c.title,
            mentor: mentorOfCourse.get(c.id) ?? '—',
            graded: gradedByCourse.get(c.id) ?? 0,
            avgHours: avg(hours),
            medianHours: median(hours),
            oldestUngradedDays: oldestUngradedByCourse.get(c.id) ?? null,
            ungraded: ungradedByCourse.get(c.id) ?? 0,
          }
        })

        const lateOut: LateRow[] = courseList.map((c) => {
          const total = totalByCourse.get(c.id) ?? 0
          const late = lateByCourse.get(c.id) ?? 0
          return {
            courseId: c.id,
            title: c.title,
            total,
            late,
            ratePct: total > 0 ? (late / total) * 100 : null,
            assignmentsWithDueDate: dueCountByCourse.get(c.id) ?? 0,
            assignmentsTotal: assignCountByCourse.get(c.id) ?? 0,
          }
        })

        // Beban kerja mentor: course yang diampu, siswa distinct lintas
        // course-nya, antrean belum dinilai, turnaround gabungan.
        const mentorCourseIds = new Map<string, string[]>()
        for (const c of courseList) {
          if (!c.mentor_id) continue
          if (!mentorCourseIds.has(c.mentor_id)) mentorCourseIds.set(c.mentor_id, [])
          mentorCourseIds.get(c.mentor_id)?.push(c.id)
        }
        const mentorOut: MentorRow[] = [...mentorCourseIds.entries()].map(([mentorId, cids]) => {
          const students = new Set<string>()
          for (const cid of cids) {
            for (const uid of enrolledByCourse.get(cid) ?? []) students.add(uid)
          }
          let ungraded = 0
          const hours: number[] = []
          for (const s of subRows) {
            const cid = assignCourse.get(s.assignment_id) ?? ''
            if (!cids.includes(cid)) continue
            if (s.score === null) {
              ungraded += 1
            } else if (s.graded_at !== null) {
              const h =
                (new Date(s.graded_at).getTime() - new Date(s.submitted_at).getTime()) / 3600000
              if (h >= 0) hours.push(h)
            }
          }
          return {
            mentorId,
            name: names.get(mentorId) ?? 'Mentor',
            courses: cids.map((cid) => courseList.find((c) => c.id === cid)?.title ?? 'Course'),
            students: students.size,
            ungraded,
            graded: hours.length,
            avgHours: avg(hours),
            medianHours: median(hours),
          }
        })
        // Mentor dengan antrean terbanyak dulu — yang paling butuh perhatian.
        mentorOut.sort((a, b) => b.ungraded - a.ungraded || b.students - a.students)

        if (cancelled) return
        setTurnaround(turnRows)
        setLateRows(lateOut)
        setMentorRows(mentorOut)
        setGradedNoTimestamp(noTimestamp)
        // Tren dari timestamp asli: submission masuk (submitted_at) dan
        // enrollment baru (enrolled_at). Seri sertifikat tidak dimuat di
        // halaman ini (ada di Analytics & Reports) sehingga tidak dibuat.
        const subTs = subRows.map((s) => s.submitted_at)
        const enrTs = enrRows.map((e) => e.enrolled_at)
        setTrend({
          bulanan: {
            submissions: monthBuckets(subTs),
            enrollments: monthBuckets(enrTs),
          },
          tahunan: {
            submissions: yearBuckets(subTs),
            enrollments: yearBuckets(enrTs),
          },
        })
        setCoursesWithoutMentor(courseList.filter((c) => !c.mentor_id).length)
        setMentorsWithoutCourse(
          profs.filter((p) => p.role === 'mentor' && !mentorCourseIds.has(p.id)).length,
        )
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
        <h1>Analitik Akademi</h1>
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
        title="Analitik Akademi"
        subtitle="Turnaround penilaian, keterlambatan pengumpulan, dan beban kerja mentor — pelengkap Analytics & Reports per course."
      />
      <WorkspaceNav entries={ADMIN_NAV} />

      <section className="section">
        <div className="dash-section-head"><h2>Turnaround penilaian per course</h2></div>
        {turnaround !== null && turnaround.length === 0 ? (
          <p className="empty">Belum ada course.</p>
        ) : (
          <div className="grade-table-wrap">
            <table className="grade-table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Mentor</th>
                  <th>Dinilai</th>
                  <th>Rata-rata</th>
                  <th>Median</th>
                  <th>Belum Dinilai</th>
                  <th>Antrean Tertua</th>
                </tr>
              </thead>
              <tbody>
                {(turnaround ?? []).map((r) => (
                  <tr key={r.courseId}>
                    <td>
                      <Link to={`/course/${r.courseId}`}>{r.title}</Link>
                    </td>
                    <td>{r.mentor}</td>
                    <td>{r.graded}</td>
                    <td>{fmtDuration(r.avgHours)}</td>
                    <td>{fmtDuration(r.medianHours)}</td>
                    <td>{r.ungraded}</td>
                    <td>
                      {r.oldestUngradedDays === null ? '—' : `${r.oldestUngradedDays.toFixed(1)} hari`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted">
          Turnaround = graded_at dikurangi submitted_at, hanya untuk submission yang sudah dinilai
          dan memiliki graded_at. Tanda "—" berarti belum ada submission yang dinilai di course
          itu. Antrean tertua = umur submission belum dinilai yang paling lama menunggu.
        </p>
        {gradedNoTimestamp > 0 && (
          <p className="muted">
            Catatan: {gradedNoTimestamp} submission sudah dinilai tetapi tanpa graded_at sehingga
            tidak masuk hitung turnaround.
          </p>
        )}
      </section>

      <section className="section">
        <div className="dash-section-head"><h2>Keterlambatan pengumpulan per course</h2></div>
        {lateRows !== null && lateRows.length === 0 ? (
          <p className="empty">Belum ada course.</p>
        ) : (
          <div className="grade-table-wrap">
            <table className="grade-table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Submission Masuk</th>
                  <th>Terlambat</th>
                  <th>Persentase Terlambat</th>
                  <th>Tugas Ber-deadline</th>
                </tr>
              </thead>
              <tbody>
                {(lateRows ?? []).map((r) => (
                  <tr key={r.courseId}>
                    <td>
                      <Link to={`/course/${r.courseId}`}>{r.title}</Link>
                    </td>
                    <td>{r.total}</td>
                    <td>{r.late}</td>
                    <td>{r.ratePct === null ? '—' : `${r.ratePct.toFixed(1)}%`}</td>
                    <td>
                      {r.assignmentsWithDueDate}/{r.assignmentsTotal} tugas
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted">
          Terlambat = submission berflag is_late atau submitted_at melewati due_date tugasnya.
          Tugas tanpa due_date hanya bisa tercatat lewat flag is_late; "—" berarti belum ada
          submission di course itu.
        </p>
      </section>

      <section className="section">
        <div className="dash-section-head"><h2>Beban kerja mentor</h2></div>
        {mentorRows !== null && mentorRows.length === 0 ? (
          <p className="empty">Belum ada mentor yang mengampu course.</p>
        ) : (
          <div className="grade-table-wrap">
            <table className="grade-table">
              <thead>
                <tr>
                  <th>Mentor</th>
                  <th>Course Diampu</th>
                  <th>Siswa</th>
                  <th>Antrean Belum Dinilai</th>
                  <th>Dinilai</th>
                  <th>Rata-rata Penilaian</th>
                  <th>Median Penilaian</th>
                </tr>
              </thead>
              <tbody>
                {(mentorRows ?? []).map((m) => (
                  <tr key={m.mentorId}>
                    <td>{m.name}</td>
                    <td>
                      {m.courses.length} course: {m.courses.join(', ')}
                    </td>
                    <td>{m.students}</td>
                    <td>{m.ungraded}</td>
                    <td>{m.graded}</td>
                    <td>{fmtDuration(m.avgHours)}</td>
                    <td>{fmtDuration(m.medianHours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted">
          Siswa dihitung distinct lintas semua course yang diampu mentor itu. Rata-rata dan median
          penilaian memakai definisi turnaround yang sama seperti tabel pertama. Diurutkan menurut
          antrean belum dinilai terbanyak.
          {coursesWithoutMentor > 0 && ` ${coursesWithoutMentor} course belum punya mentor.`}
          {mentorsWithoutCourse > 0 && ` ${mentorsWithoutCourse} mentor terdaftar belum mengampu course.`}
        </p>
      </section>

      <section className="section">
        <div className="dash-section-head">
          <h2>Tren pengumpulan &amp; enrollment</h2>
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
            <h3>Submission masuk</h3>
            <BarChart data={trend[trendTab].submissions} />
            <h3 style={{ marginTop: '1.25rem' }}>Enrollment baru</h3>
            <BarChart data={trend[trendTab].enrollments} />
            <p className="muted">
              {trendTab === 'bulanan'
                ? 'Bulanan = 12 bulan kalender terakhir, termasuk bulan berjalan.'
                : 'Tahunan = tahun data paling awal sampai tahun berjalan.'}{' '}
              Dihitung dari submitted_at dan enrolled_at yang tersimpan.
            </p>
          </>
        )}
      </section>

      <p className="muted">
        Angka dihitung langsung dari enrollment, submission, dan tugas yang tersimpan. Tidak ada
        angka contoh.
      </p>
    </div>
  )
}
