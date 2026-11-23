// SINEVERSE — Admin Academy: Kelola Enrollment.
// Admin memilih course, lalu melihat siswa yang terdaftar (enrollments)
// dan yang menunggu di waitlist. Enrollment bisa dihapus, dan pendaftar
// waitlist bisa diterima: baris enrollment dibuat dulu, baru baris
// waitlist dihapus. Bila insert enrollment gagal, baris waitlist
// dipertahankan supaya pendaftar tidak hilang.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { countCourseEnrollments } from '../lib/counts'
import { fetchCourses, fetchProfileNames, supabase } from '../lib/supabase'
import type { Course, Enrollment } from '../lib/types'
import PageHeader from '../components/PageHeader'

interface WaitlistRow {
  id: string
  user_id: string
  course_id: string
  created_at: string
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AdminEnrollmentsPage() {
  const { profile } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [waitlist, setWaitlist] = useState<WaitlistRow[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // B65: kunci busy per baris waitlist — klik ganda "Terima" tidak
  // membuat dua baris enrollment.
  const [acceptingId, setAcceptingId] = useState<string | null>(null)

  async function load() {
    try {
      const courseList = await fetchCourses()
      const [{ data: enrData }, { data: waitData }] = await Promise.all([
        supabase.from('enrollments').select('*').order('enrolled_at', { ascending: false }),
        supabase.from('waitlist').select('*').order('created_at'),
      ])
      const enrRows = (enrData ?? []) as Enrollment[]
      const waitRows = (waitData ?? []) as WaitlistRow[]
      const userIds = [...new Set([...enrRows.map((e) => e.user_id), ...waitRows.map((w) => w.user_id)])]
      const namesMap = await fetchProfileNames(userIds)
      setCourses(courseList)
      setEnrollments(enrRows)
      setWaitlist(waitRows)
      setNames(namesMap)
      if (courseList.length > 0) {
        setSelectedCourseId((prev) => prev || courseList[0].id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat enrollment.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (profile?.role !== 'admin') {
    return (
      <div className="page">
        <h1>Kelola Enrollment</h1>
        <p className="empty">Halaman ini hanya untuk admin.</p>
      </div>
    )
  }
  if (loading) return <div className="page"><p className="muted">Memuat…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>

  // K13: hitung terdaftar/waitlist lewat helper bersama (lib/counts.ts) —
  // definisi yang sama dengan Analitik ("Total enrollment (terdaftar)")
  // dan Beranda admin: waitlist bukan enrollment, pipeline = keduanya.
  const countEnrolled = (courseId: string) =>
    countCourseEnrollments(enrollments, waitlist, courseId).enrolled
  const countWaitlisted = (courseId: string) =>
    countCourseEnrollments(enrollments, waitlist, courseId).waitlisted
  const selectedEnrollments = enrollments.filter((e) => e.course_id === selectedCourseId)
  const selectedWaitlist = waitlist.filter((w) => w.course_id === selectedCourseId)

  async function removeEnrollment(enr: Enrollment) {
    const name = names.get(enr.user_id) ?? 'Siswa ini'
    if (!window.confirm(`Hapus enrollment ${name} dari course ini?`)) return
    const { error: delErr } = await supabase.from('enrollments').delete().eq('id', enr.id)
    if (delErr) {
      setNotice(`Gagal menghapus enrollment: ${delErr.message}`)
      return
    }
    setNotice(`Enrollment ${name} dihapus.`)
    await load()
  }

  async function acceptWaitlist(row: WaitlistRow) {
    if (acceptingId) return
    setAcceptingId(row.id)
    try {
      const name = names.get(row.user_id) ?? 'Pendaftar ini'
      const { error: insErr } = await supabase.from('enrollments').insert({
        user_id: row.user_id,
        course_id: row.course_id,
      })
      if (insErr) {
        // Baris waitlist sengaja TIDAK dihapus bila insert gagal.
        setNotice(`Gagal menerima ${name}: ${insErr.message}. Pendaftar tetap ada di waitlist.`)
        return
      }
      const { error: delErr } = await supabase.from('waitlist').delete().eq('id', row.id)
      if (delErr) {
        setNotice(`${name} sudah terdaftar, tetapi baris waitlist gagal dihapus: ${delErr.message}. Hapus manual bila perlu.`)
        await load()
        return
      }
      setNotice(`${name} diterima dan terdaftar di course.`)
      await load()
    } finally {
      setAcceptingId(null)
    }
  }

  return (
    <div className="page">
      <PageHeader
        icon="user"
        title="Kelola Enrollment"
        subtitle="Terima pendaftar waitlist atau hapus enrollment siswa per course."
      />
      {notice && <p className="notice-box">{notice}</p>}

      <section className="section">
        <h2>Jumlah per Course</h2>
        {courses.length === 0 ? (
          <p className="empty">Belum ada course.</p>
        ) : (
          <div className="grade-table-wrap">
            <table className="grade-table">
              <thead><tr><th>Course</th><th>Terdaftar</th><th>Waitlist</th></tr></thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id}>
                    <td>{c.title}</td>
                    <td>{countEnrolled(c.id)}</td>
                    <td>{countWaitlisted(c.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section">
        <label>
          Course
          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({countEnrolled(c.id)} terdaftar · {countWaitlisted(c.id)} waitlist)
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="section">
        <h2>Siswa Terdaftar ({selectedEnrollments.length})</h2>
        {selectedEnrollments.length === 0 ? (
          <p className="empty">Belum ada siswa terdaftar di course ini.</p>
        ) : (
          <ul className="discussion-list">
            {selectedEnrollments.map((e) => (
              <li key={e.id} className="discussion-item">
                <p><strong>{names.get(e.user_id) ?? 'Siswa'}</strong></p>
                <p className="muted">Terdaftar: {formatDate(e.enrolled_at)}</p>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => void removeEnrollment(e)}>
                  Hapus Enrollment
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Waitlist ({selectedWaitlist.length})</h2>
        {selectedWaitlist.length === 0 ? (
          <p className="empty">Tidak ada pendaftar di waitlist course ini.</p>
        ) : (
          <ul className="discussion-list">
            {selectedWaitlist.map((w) => (
              <li key={w.id} className="discussion-item">
                <p><strong>{names.get(w.user_id) ?? 'Pendaftar'}</strong></p>
                <p className="muted">Mendaftar: {formatDate(w.created_at)}</p>
                <button type="button" className="btn btn-primary btn-small" disabled={acceptingId === w.id} onClick={() => void acceptWaitlist(w)}>
                  {acceptingId === w.id ? 'Memproses…' : 'Terima'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="muted"><Link to="/admin">Kembali ke Admin Panel</Link></p>
    </div>
  )
}
