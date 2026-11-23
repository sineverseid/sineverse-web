// SINEVERSE — Mentor Workspace: Siswa.
// Daftar peserta di course yang diampu mentor, dengan progres belajar
// (master prompt §09: daftar peserta, progres, aktivitas belajar).
// Mentor hanya melihat siswa di course-nya sendiri.
// Ringkasan statistik + "Progress per Course" dihitung dari data asli:
// enrollments, lesson_progress, dan jumlah lesson per course
// (modules → lessons). Progres per siswa = lesson selesai / total
// lesson dari course yang diikutinya; bila sebuah course belum punya
// lesson, progresnya "—" (tidak bisa dihitung), bukan 0% karangan.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchCourses, fetchProfileNames, supabase } from '../lib/supabase'
import type { Course } from '../lib/types'
import PageHeader from '../components/PageHeader'
import WorkspaceNav from '../components/WorkspaceNav'
import { MENTOR_NAV } from '../lib/workspaceNav'
import EmptyState from '../components/EmptyState'

interface StudentRow {
  userId: string
  name: string
  courses: string[]
  courseIds: string[]
  completed: number
  inProgress: number
  /** Jumlah lesson di semua course yang diikuti siswa ini. */
  totalLessons: number
  /** completed / totalLessons × 100; null bila totalLessons = 0. */
  progressPct: number | null
}

/** Progres agregat satu course: jumlah peserta + rata-rata progres %. */
interface CourseProgress {
  courseId: string
  title: string
  students: number
  /** Rata-rata progres % peserta; null bila course belum punya lesson. */
  avgProgressPct: number | null
}

// Status filter yang jujur dari data yang ada: StudentRow hanya membawa
// jumlah lesson selesai dan sedang berjalan, tanpa total lesson per siswa,
// jadi "Selesai" (semua lesson tuntas) tidak bisa dibuktikan. Yang bisa
// dibedakan hanyalah sudah ada aktivitas belajar (Aktif) vs belum ada
// aktivitas sama sekali (Belum Mulai).
type StatusFilter = 'all' | 'active' | 'not_started'

export default function MentorStudentsPage() {
  const { user, profile } = useAuth()
  const [rows, setRows] = useState<StudentRow[] | null>(null)
  const [courses, setCourses] = useState<Course[]>([])
  const [courseProgress, setCourseProgress] = useState<CourseProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [courseFilter, setCourseFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')

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
          if (!cancelled) {
            setRows([])
            setCourses([])
            setCourseProgress([])
          }
          return
        }
        const courseById = new Map(mine.map((c) => [c.id, c.title]))
        const { data: enr } = await supabase
          .from('enrollments')
          .select('user_id,course_id')
          .in('course_id', mine.map((c) => c.id))
        const enrRows = (enr ?? []) as { user_id: string; course_id: string }[]
        if (enrRows.length === 0) {
          if (!cancelled) {
            setRows([])
            setCourses(mine)
            setCourseProgress([])
          }
          return
        }
        const userIds = [...new Set(enrRows.map((e) => e.user_id))]
        // Modules dan nama profil independen satu sama lain (nama hanya butuh
        // userIds dari enrollments) — jalankan paralel, bukan berurutan.
        const [{ data: mods }, names] = await Promise.all([
          supabase
            .from('modules')
            .select('id,course_id')
            .in('course_id', mine.map((c) => c.id)),
          fetchProfileNames(userIds),
        ])
        const modRows = (mods ?? []) as { id: string; course_id: string }[]
        // module_id dibutuhkan untuk memetakan setiap lesson ke course-nya:
        // tanpa itu total lesson per course (penyebut progres) tidak bisa
        // dihitung.
        const { data: lessons } =
          modRows.length > 0
            ? await supabase
                .from('lessons')
                .select('id,module_id')
                .in('module_id', modRows.map((m) => m.id))
            : { data: [] as { id: string; module_id: string }[] }
        const lessonRows = (lessons ?? []) as { id: string; module_id: string }[]
        const lessonIds = lessonRows.map((l) => l.id)
        const moduleCourse = new Map(modRows.map((m) => [m.id, m.course_id]))
        const lessonCourse = new Map(
          lessonRows.map((l) => [l.id, moduleCourse.get(l.module_id) ?? '']),
        )
        const totalLessonsByCourse = new Map<string, number>()
        for (const l of lessonRows) {
          const cid = lessonCourse.get(l.id)
          if (!cid) continue
          totalLessonsByCourse.set(cid, (totalLessonsByCourse.get(cid) ?? 0) + 1)
        }
        const { data: prog } = await supabase
          .from('lesson_progress')
          .select('user_id,lesson_id,status')
          .in('lesson_id', lessonIds.length > 0 ? lessonIds : ['00000000-0000-0000-0000-000000000000'])
        const progRows = (prog ?? []) as { user_id: string; lesson_id: string; status: string }[]
        const byUser = new Map<string, StudentRow>()
        for (const e of enrRows) {
          const row = byUser.get(e.user_id) ?? {
            userId: e.user_id,
            name: names.get(e.user_id) ?? 'Siswa',
            courses: [],
            courseIds: [],
            completed: 0,
            inProgress: 0,
            totalLessons: 0,
            progressPct: null,
          }
          const title = courseById.get(e.course_id)
          if (title && !row.courses.includes(title)) row.courses.push(title)
          if (!row.courseIds.includes(e.course_id)) row.courseIds.push(e.course_id)
          byUser.set(e.user_id, row)
        }
        // Lesson selesai per (siswa, course) — penyebut progres per course.
        const completedByUserCourse = new Map<string, number>()
        for (const p of progRows) {
          const row = byUser.get(p.user_id)
          if (!row) continue
          if (p.status === 'completed') {
            row.completed += 1
            const cid = lessonCourse.get(p.lesson_id)
            if (cid) {
              const key = `${p.user_id}:${cid}`
              completedByUserCourse.set(key, (completedByUserCourse.get(key) ?? 0) + 1)
            }
          } else if (p.status === 'in_progress') row.inProgress += 1
        }
        for (const row of byUser.values()) {
          row.totalLessons = row.courseIds.reduce(
            (sum, cid) => sum + (totalLessonsByCourse.get(cid) ?? 0),
            0,
          )
          row.progressPct =
            row.totalLessons > 0
              ? Math.round((row.completed / row.totalLessons) * 1000) / 10
              : null
        }
        const out = [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name))
        // Progress per Course — hanya course yang punya peserta.
        const progress: CourseProgress[] = mine
          .map((c) => {
            const students = out.filter((r) => r.courseIds.includes(c.id))
            if (students.length === 0) return null
            const total = totalLessonsByCourse.get(c.id) ?? 0
            const pcts = students
              .map((s) => {
                if (total === 0) return null
                return ((completedByUserCourse.get(`${s.userId}:${c.id}`) ?? 0) / total) * 100
              })
              .filter((p): p is number => p !== null)
            return {
              courseId: c.id,
              title: c.title,
              students: students.length,
              avgProgressPct:
                pcts.length > 0
                  ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10
                  : null,
            }
          })
          .filter((p): p is CourseProgress => p !== null)
        if (!cancelled) {
          setRows(out)
          setCourses(mine)
          setCourseProgress(progress)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat daftar siswa.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user, profile?.role])

  const allRows = rows ?? []
  const activeStudents = allRows.filter((r) => r.completed + r.inProgress > 0).length
  const withProgress = allRows.filter((r) => r.progressPct !== null)
  const avgProgress =
    withProgress.length > 0
      ? Math.round(
          (withProgress.reduce((sum, r) => sum + (r.progressPct as number), 0) /
            withProgress.length) *
            10,
        ) / 10
      : null
  const filtered = allRows.filter((r) => {
    // P29: filter memakai id course — dua course berjudul sama tidak lagi bertabrakan.
    if (courseFilter && !r.courseIds.includes(courseFilter)) return false
    if (statusFilter === 'active' && r.completed + r.inProgress === 0) return false
    if (statusFilter === 'not_started' && r.completed + r.inProgress > 0) return false
    if (query.trim() && !r.name.toLowerCase().includes(query.trim().toLowerCase())) return false
    return true
  })

  return (
    <div className="page">
      <PageHeader
        icon="user"
        title="Siswa Saya"
        subtitle="Peserta di course yang kamu ampu beserta progres belajarnya."
      />
      <WorkspaceNav entries={MENTOR_NAV} />
      {loading && <p className="muted">Memuat daftar siswa…</p>}
      {error && <p className="error-box">{error}</p>}
      {!loading && !error && rows !== null && rows.length === 0 && (
        <EmptyState
          message="Belum ada siswa. Belum ada siswa yang mengambil course yang kamu ampu."
        />
      )}
      {!loading && !error && rows !== null && rows.length > 0 && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-num">{allRows.length}</span>
              <span className="stat-label">Total Siswa</span>
            </div>
            <div className="stat-card">
              <span className="stat-num">{courses.length}</span>
              <span className="stat-label">Course Diampu</span>
            </div>
            <div className="stat-card">
              <span className="stat-num">{activeStudents}</span>
              <span className="stat-label">Siswa Aktif</span>
            </div>
            <div className="stat-card">
              <span className="stat-num">
                {avgProgress === null ? '—' : `${String(avgProgress).replace('.', ',')}%`}
              </span>
              <span className="stat-label">Rata-rata Progres</span>
            </div>
          </div>
          {courseProgress.length > 0 && (
            <section className="section">
              <div className="dash-section-head">
                <h2>Progress per Course</h2>
              </div>
              <ul className="list">
                {courseProgress.map((cp) => (
                  <li key={cp.courseId} className="list-row">
                    <span>
                      <strong>{cp.title}</strong>
                      <br />
                      <span className="muted">{cp.students} siswa</span>
                    </span>
                    <span style={{ minWidth: 140, textAlign: 'right' }}>
                      {cp.avgProgressPct === null
                        ? '—'
                        : `${String(cp.avgProgressPct).replace('.', ',')}%`}
                      {cp.avgProgressPct !== null && (
                        <span className="progress-track" style={{ display: 'block' }}>
                          <span
                            className="progress-fill"
                            style={{ width: `${cp.avgProgressPct}%` }}
                          />
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="muted">
                Rata-rata progres = lesson selesai / total lesson course itu, dirata-rata
                per peserta. Course tanpa peserta tidak ditampilkan.
              </p>
            </section>
          )}
        <section className="section">
          <div className="dash-section-head">
            <h2>Daftar Siswa</h2>
          </div>
          <div className="filters">
            <input
              className="search-input"
              type="search"
              placeholder="Cari nama siswa…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="chip-row">
              <select
                className="search-input"
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
                aria-label="Filter course"
              >
                <option value="">Semua course</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
              <select
                className="search-input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                aria-label="Filter status"
              >
                <option value="all">Semua status</option>
                <option value="active">Aktif</option>
                <option value="not_started">Belum Mulai</option>
              </select>
            </div>
          </div>
          {filtered.length === 0 ? (
            <p className="empty">Tidak ada siswa yang cocok dengan filter.</p>
          ) : (
            <div className="grade-table-wrap">
              <table className="grade-table">
                <thead>
                  <tr>
                    <th>Siswa</th>
                    <th>Course</th>
                    <th>Lesson Selesai</th>
                    <th>Sedang Berjalan</th>
                    <th>Progres</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.userId}>
                      <td>{r.name}</td>
                      <td>{r.courses.join(', ')}</td>
                      <td>{r.completed}</td>
                      <td>{r.inProgress}</td>
                      <td>
                        {r.progressPct === null
                          ? '—'
                          : `${r.completed}/${r.totalLessons} (${String(r.progressPct).replace('.', ',')}%)`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        </>
      )}
      <p className="muted">
        <Link to="/mentor/penilaian">Antrean Penilaian</Link>
        {' · '}
        <Link to="/mentor/analitik">Analitik Course</Link>
      </p>
    </div>
  )
}
