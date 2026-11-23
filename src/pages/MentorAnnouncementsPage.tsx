// SINEVERSE — Mentor Workspace: Pengumuman Course.
// Mentor menulis pengumuman untuk satu course yang diampunya; pengumuman
// tersimpan di course_announcements dan terlihat oleh siswa yang terdaftar
// di course itu. Mentor hanya melihat pengumumannya sendiri; admin melihat
// semua pengumuman untuk memantau mentor lain.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fmtDate } from '../lib/guarded'
import { fetchCourses, supabase } from '../lib/supabase'
import type { Course, CourseAnnouncement } from '../lib/types'
import PageHeader from '../components/PageHeader'
import WorkspaceNav from '../components/WorkspaceNav'
import { MENTOR_NAV } from '../lib/workspaceNav'
import EmptyState from '../components/EmptyState'

export default function MentorAnnouncementsPage() {
  const { user, profile } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [items, setItems] = useState<CourseAnnouncement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [courseId, setCourseId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  const isMentor = profile?.role === 'mentor' || profile?.role === 'admin'

  async function load(currentUserId: string, isAdmin: boolean) {
    try {
      const all = await fetchCourses()
      const mine = isAdmin ? all : all.filter((c) => c.mentor_id === currentUserId)
      setCourses(mine)
      // P31: filter created_by hanya untuk mentor — admin memantau semua
      // pengumuman, bukan hanya pengumumannya sendiri.
      let query = supabase
        .from('course_announcements')
        .select('*')
        .order('created_at', { ascending: false })
      if (!isAdmin) query = query.eq('created_by', currentUserId)
      const { data, error: qErr } = await query
      if (qErr) throw qErr
      setItems((data ?? []) as CourseAnnouncement[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat pengumuman.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    setLoading(true)
    void load(user.id, profile?.role === 'admin')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profile?.role])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    if (!courseId) {
      setNotice('Pilih course dulu.')
      return
    }
    if (title.trim() === '') {
      setNotice('Judul pengumuman tidak boleh kosong.')
      return
    }
    setSaving(true)
    const { data: inserted, error: insErr } = await supabase.from('course_announcements').insert({
      course_id: courseId,
      title: title.trim(),
      body: body.trim() || null,
      created_by: user.id,
    }).select().single()
    setSaving(false)
    if (insErr) {
      // B31: kegagalan kirim tampil sebagai notice inline, daftar tetap terlihat.
      setNotice(`Gagal mengirim pengumuman: ${insErr.message}`)
      return
    }
    setNotice('Pengumuman terkirim ke siswa course itu.')
    setTitle('')
    setBody('')
    // P41: perbarui local state, bukan reload penuh (tanpa flash "Memuat…").
    if (inserted) setItems((prev) => [inserted as CourseAnnouncement, ...prev])
    else {
      setLoading(true)
      await load(user.id, profile?.role === 'admin')
    }
  }

  async function handleDelete(a: CourseAnnouncement) {
    if (!user) return
    if (!window.confirm(`Hapus pengumuman "${a.title}"?`)) return
    const { error: delErr } = await supabase.from('course_announcements').delete().eq('id', a.id)
    if (delErr) {
      // B31: kegagalan hapus tampil sebagai notice inline, daftar tetap terlihat.
      setNotice(`Gagal menghapus pengumuman: ${delErr.message}`)
      return
    }
    setNotice(`Pengumuman "${a.title}" dihapus.`)
    // P41: perbarui local state, bukan reload penuh (tanpa flash "Memuat…").
    setItems((prev) => prev.filter((it) => it.id !== a.id))
  }

  if (loading) return <div className="page"><p className="muted">Memuat…</p></div>
  if (!isMentor) {
    return (
      <div className="page">
        <h1>Pengumuman Course</h1>
        <p className="empty">Halaman ini hanya untuk mentor.</p>
      </div>
    )
  }
  if (error) return <div className="page"><p className="error-box">{error}</p></div>

  const courseById = new Map(courses.map((c) => [c.id, c.title]))

  return (
    <div className="page">
      <PageHeader
        icon="announcement"
        title="Pengumuman Course"
        subtitle="Kirim pengumuman ke siswa di course yang kamu ampu."
      />
      <WorkspaceNav entries={MENTOR_NAV} />
      {notice && <p className="notice-box">{notice}</p>}
      <p className="muted">Pengumuman hanya terlihat oleh siswa yang terdaftar di course tersebut.</p>

      <section className="section">
        <h2>Tulis Pengumuman</h2>
        {courses.length === 0 ? (
          <p className="empty">Kamu belum mengampu course apa pun, jadi belum bisa mengirim pengumuman.</p>
        ) : (
          <form className="form" onSubmit={(e) => void handleSubmit(e)}>
            <label>
              Course
              <select value={courseId} onChange={(e) => setCourseId(e.target.value)} required>
                <option value="">Pilih course…</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </label>
            <label>
              Judul
              <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Mis. Jadwal kelas live minggu ini" />
            </label>
            <label>
              Isi pengumuman
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Tulis isi pengumuman…" />
            </label>
            <button type="submit" className="btn btn-primary" disabled={saving}>Kirim Pengumuman</button>
          </form>
        )}
      </section>

      <section className="section">
        <h2>Pengumuman Saya</h2>
        {items.length === 0 ? (
          <EmptyState message="Belum ada pengumuman yang kamu kirim." />
        ) : (
          <ul className="discussion-list">
            {items.map((a) => (
              <li key={a.id} className="discussion-item">
                <p className="discussion-meta">
                  {courseById.get(a.course_id) ?? 'Course'} · {fmtDate(a.created_at)}
                </p>
                <h3>{a.title}</h3>
                {a.body && <p>{a.body}</p>}
                <p>
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => void handleDelete(a)}>Hapus</button>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p><Link to="/mentor">Kembali ke Mentor Workspace</Link></p>
    </div>
  )
}
