// SINEVERSE — Mentor Workspace: Video Management.
// Semua lesson di course yang diampu mentor beserta status videonya.
// Edit video_url inline (kosongkan untuk menghapus video). Mentor hanya
// melihat lesson di course-nya sendiri; admin melihat semua.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { videoEmbed } from '../lib/guarded'
import { fetchCourses, supabase } from '../lib/supabase'
import type { Course, Lesson } from '../lib/types'
import PageHeader from '../components/PageHeader'
import WorkspaceNav from '../components/WorkspaceNav'
import { MENTOR_NAV } from '../lib/workspaceNav'
import EmptyState from '../components/EmptyState'

type VideoFilter = 'all' | 'with' | 'without'

interface VideoRow {
  course: Course
  lesson: Lesson
}

export default function MentorVideosPage() {
  const { user, profile } = useAuth()
  const [rows, setRows] = useState<VideoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [filter, setFilter] = useState<VideoFilter>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editUrl, setEditUrl] = useState('')
  const [saving, setSaving] = useState(false)

  const isMentor = profile?.role === 'mentor' || profile?.role === 'admin'

  async function load(currentUserId: string, isAdmin: boolean) {
    try {
      const courses = await fetchCourses()
      const mine = isAdmin ? courses : courses.filter((c) => c.mentor_id === currentUserId)
      if (mine.length === 0) {
        setRows([])
        return
      }
      const courseById = new Map(mine.map((c) => [c.id, c]))
      const { data: mods } = await supabase
        .from('modules')
        .select('id,course_id,order_index')
        .in('course_id', mine.map((c) => c.id))
        .order('order_index')
      const modRows = (mods ?? []) as { id: string; course_id: string; order_index: number }[]
      if (modRows.length === 0) {
        setRows([])
        return
      }
      const moduleOrder = new Map(modRows.map((m) => [m.id, m.order_index]))
      const moduleCourse = new Map(modRows.map((m) => [m.id, m.course_id]))
      const { data: lessons } = await supabase
        .from('lessons')
        .select('id,module_id,title,order_index,video_url')
        .in('module_id', modRows.map((m) => m.id))
        .order('order_index')
      const lessonRows = (lessons ?? []) as Lesson[]
      const out: VideoRow[] = []
      for (const lesson of lessonRows) {
        const course = courseById.get(moduleCourse.get(lesson.module_id) ?? '')
        if (!course) continue
        out.push({ course, lesson })
      }
      // P40: urutkan berdasarkan course dulu, lalu urutan modul/lesson —
      // sebelumnya urutan modul dibandingkan dulu sehingga lesson dari
      // course berbeda saling menyela.
      out.sort((a, b) => {
        if (a.course.title !== b.course.title) return a.course.title.localeCompare(b.course.title)
        const mo = (moduleOrder.get(a.lesson.module_id) ?? 0) - (moduleOrder.get(b.lesson.module_id) ?? 0)
        if (mo !== 0) return mo
        return a.lesson.order_index - b.lesson.order_index
      })
      setRows(out)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar video.')
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

  function startEdit(lesson: Lesson) {
    setEditingId(lesson.id)
    setEditUrl(lesson.video_url ?? '')
    setNotice(null)
  }

  async function handleSave(e: FormEvent, lesson: Lesson) {
    e.preventDefault()
    if (!user) return
    // P30: hanya URL YouTube/Vimeo yang diterima — URL host lain menjadi
    // tautan eksternal telanjang di lesson. Kosong = hapus video (diizinkan).
    const url = editUrl.trim()
    if (url && videoEmbed(url).kind === 'link') {
      setNotice('Tautan video harus dari YouTube atau Vimeo. Tempel URL video YouTube (youtube.com / youtu.be) atau Vimeo (vimeo.com).')
      return
    }
    setSaving(true)
    const { error: updErr } = await supabase
      .from('lessons')
      .update({ video_url: editUrl.trim() || null })
      .eq('id', lesson.id)
    setSaving(false)
    if (updErr) {
      // B31: kegagalan simpan tampil sebagai notice inline — daftar video
      // tetap terlihat, bukan diganti kotak error seluruh halaman.
      setNotice(`Gagal menyimpan video: ${updErr.message}`)
      return
    }
    setEditingId(null)
    setNotice(editUrl.trim() ? `Video lesson "${lesson.title}" tersimpan.` : `Video lesson "${lesson.title}" dihapus.`)
    setLoading(true)
    await load(user.id, profile?.role === 'admin')
  }

  if (loading) return <div className="page"><p className="muted">Memuat…</p></div>
  if (!isMentor) {
    return (
      <div className="page">
        <h1>Video Management</h1>
        <p className="empty">Halaman ini hanya untuk mentor.</p>
      </div>
    )
  }
  if (error) return <div className="page"><p className="error-box">{error}</p></div>

  const filtered = rows.filter((r) => {
    if (filter === 'with') return Boolean(r.lesson.video_url)
    if (filter === 'without') return !r.lesson.video_url
    return true
  })
  const withVideo = rows.filter((r) => r.lesson.video_url).length

  return (
    <div className="page">
      <PageHeader
        icon="film"
        title="Video Management"
        subtitle="Status video setiap lesson di course yang kamu ampu."
      />
      <WorkspaceNav entries={MENTOR_NAV} />
      {notice && <p className="notice-box">{notice}</p>}
      {rows.length === 0 ? (
        <EmptyState message="Belum ada lesson. Buat lesson dulu dari Course Builder." actionLabel="Buka Course Builder" actionTo="/mentor/course-builder" />
      ) : (
        <>
          <p className="muted">{withVideo} dari {rows.length} lesson sudah ada video.</p>
          <form className="form" onSubmit={(e) => e.preventDefault()}>
            <label>
              Filter
              <select value={filter} onChange={(e) => setFilter(e.target.value as VideoFilter)}>
                <option value="all">Semua</option>
                <option value="with">Sudah ada video</option>
                <option value="without">Belum ada video</option>
              </select>
            </label>
          </form>
          {filtered.length === 0 ? (
            <p className="empty">Tidak ada lesson yang cocok dengan filter ini.</p>
          ) : (
            <div className="grade-table-wrap">
              <table className="grade-table">
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Lesson</th>
                    <th>Status Video</th>
                    <th>Video</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(({ course, lesson }) => (
                    <tr key={lesson.id}>
                      <td>{course.title}</td>
                      <td><Link to={`/lesson/${lesson.id}`}>{lesson.title}</Link></td>
                      <td>{lesson.video_url ? 'Ada video' : 'Belum ada video'}</td>
                      <td>
                        {editingId === lesson.id ? (
                          <form className="form" onSubmit={(e) => void handleSave(e, lesson)}>
                            <input
                              value={editUrl}
                              onChange={(e) => setEditUrl(e.target.value)}
                              placeholder="https://… (kosongkan untuk hapus video)"
                            />
                            <div className="form-actions">
                              <button type="submit" className="btn btn-primary btn-small" disabled={saving}>Simpan</button>
                              <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditingId(null)}>Batal</button>
                            </div>
                          </form>
                        ) : lesson.video_url ? (
                          <a href={lesson.video_url} target="_blank" rel="noreferrer">Buka video</a>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        {editingId !== lesson.id && (
                          <button type="button" className="btn btn-secondary btn-small" onClick={() => startEdit(lesson)}>
                            {lesson.video_url ? 'Edit video' : 'Tambah video'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <p><Link to="/mentor">Kembali ke Mentor Workspace</Link></p>
    </div>
  )
}
