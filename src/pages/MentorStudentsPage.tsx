// SINEVERSE — Mentor Workspace: Siswa.
// Daftar peserta di course yang diampu mentor, dengan progres belajar
// (master prompt §09: daftar peserta, progres, aktivitas belajar).
// Mentor hanya melihat siswa di course-nya sendiri.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchCourses, fetchProfileNames, supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import WorkspaceNav from '../components/WorkspaceNav'
import { MENTOR_NAV } from '../lib/workspaceNav'
import EmptyState from '../components/EmptyState'

interface StudentRow {
  userId: string
  name: string
  courses: string[]
  completed: number
  inProgress: number
}

export default function MentorStudentsPage() {
  const { user, profile } = useAuth()
  const [rows, setRows] = useState<StudentRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
          if (!cancelled) setRows([])
          return
        }
        const courseById = new Map(mine.map((c) => [c.id, c.title]))
        const { data: enr } = await supabase
          .from('enrollments')
          .select('user_id,course_id')
          .in('course_id', mine.map((c) => c.id))
        const enrRows = (enr ?? []) as { user_id: string; course_id: string }[]
        if (enrRows.length === 0) {
          if (!cancelled) setRows([])
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
        const { data: lessons } = await supabase
          .from('lessons')
          .select('id')
          .in('module_id', modRows.map((m) => m.id))
        const lessonIds = ((lessons ?? []) as { id: string }[]).map((l) => l.id)
        const { data: prog } = await supabase
          .from('lesson_progress')
          .select('user_id,status')
          .in('lesson_id', lessonIds.length > 0 ? lessonIds : ['00000000-0000-0000-0000-000000000000'])
        const progRows = (prog ?? []) as { user_id: string; status: string }[]
        const byUser = new Map<string, StudentRow>()
        for (const e of enrRows) {
          const row = byUser.get(e.user_id) ?? {
            userId: e.user_id,
            name: names.get(e.user_id) ?? 'Siswa',
            courses: [],
            completed: 0,
            inProgress: 0,
          }
          const title = courseById.get(e.course_id)
          if (title && !row.courses.includes(title)) row.courses.push(title)
          byUser.set(e.user_id, row)
        }
        for (const p of progRows) {
          const row = byUser.get(p.user_id)
          if (!row) continue
          if (p.status === 'completed') row.completed += 1
          else if (p.status === 'in_progress') row.inProgress += 1
        }
        const out = [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name))
        if (!cancelled) setRows(out)
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
        <div className="grade-table-wrap">
          <table className="grade-table">
            <thead>
              <tr>
                <th>Siswa</th>
                <th>Course</th>
                <th>Lesson Selesai</th>
                <th>Sedang Berjalan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId}>
                  <td>{r.name}</td>
                  <td>{r.courses.join(', ')}</td>
                  <td>{r.completed}</td>
                  <td>{r.inProgress}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted">
        <Link to="/mentor/penilaian">Antrean Penilaian</Link>
        {' · '}
        <Link to="/mentor/analitik">Analitik Course</Link>
      </p>
    </div>
  )
}
