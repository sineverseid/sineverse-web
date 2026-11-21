// SINEVERSE — Mentor Workspace: Materi Pembelajaran.
// Semua lesson_resources di course yang diampu mentor, dikelompokkan
// per course lalu per lesson. Edit inline, hapus dengan konfirmasi.
// Mentor hanya melihat materi di course-nya sendiri; admin melihat semua.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchCourses, supabase } from '../lib/supabase'
import type { Course, Lesson, LessonResource } from '../lib/types'
import PageHeader from '../components/PageHeader'
import WorkspaceNav from '../components/WorkspaceNav'
import { MENTOR_NAV } from '../lib/workspaceNav'
import EmptyState from '../components/EmptyState'

const KIND_LABELS: Record<LessonResource['kind'], string> = {
  reading: 'Bacaan',
  image: 'Gambar',
  pdf: 'PDF',
  video: 'Video',
  file: 'File',
  link: 'Tautan',
}

const KIND_OPTIONS: LessonResource['kind'][] = ['reading', 'image', 'pdf', 'video', 'file', 'link']

interface MaterialGroup {
  course: Course
  lesson: Lesson
  resources: LessonResource[]
}

export default function MentorMaterialsPage() {
  const { user, profile } = useAuth()
  const [groups, setGroups] = useState<MaterialGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editKind, setEditKind] = useState<LessonResource['kind']>('reading')
  const [editUrl, setEditUrl] = useState('')
  const [editBody, setEditBody] = useState('')
  const [saving, setSaving] = useState(false)

  const isMentor = profile?.role === 'mentor' || profile?.role === 'admin'

  async function load(currentUserId: string, isAdmin: boolean) {
    try {
      const courses = await fetchCourses()
      const mine = isAdmin ? courses : courses.filter((c) => c.mentor_id === currentUserId)
      if (mine.length === 0) {
        setGroups([])
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
        setGroups([])
        return
      }
      const moduleOrder = new Map(modRows.map((m) => [m.id, m.order_index]))
      const moduleCourse = new Map(modRows.map((m) => [m.id, m.course_id]))
      const { data: lessons } = await supabase
        .from('lessons')
        .select('id,module_id,title,order_index')
        .in('module_id', modRows.map((m) => m.id))
        .order('order_index')
      const lessonRows = (lessons ?? []) as Lesson[]
      if (lessonRows.length === 0) {
        setGroups([])
        return
      }
      const { data: res } = await supabase
        .from('lesson_resources')
        .select('*')
        .in('lesson_id', lessonRows.map((l) => l.id))
        .order('created_at')
      const resourceRows = (res ?? []) as LessonResource[]
      const byLesson = new Map<string, LessonResource[]>()
      for (const r of resourceRows) {
        const list = byLesson.get(r.lesson_id) ?? []
        list.push(r)
        byLesson.set(r.lesson_id, list)
      }
      const sortedLessons = [...lessonRows].sort((a, b) => {
        const mo = (moduleOrder.get(a.module_id) ?? 0) - (moduleOrder.get(b.module_id) ?? 0)
        return mo !== 0 ? mo : a.order_index - b.order_index
      })
      const out: MaterialGroup[] = []
      for (const lesson of sortedLessons) {
        const resources = byLesson.get(lesson.id)
        if (!resources || resources.length === 0) continue
        const course = courseById.get(moduleCourse.get(lesson.module_id) ?? '')
        if (!course) continue
        out.push({ course, lesson, resources })
      }
      setGroups(out)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat materi pembelajaran.')
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

  function startEdit(r: LessonResource) {
    setEditingId(r.id)
    setEditTitle(r.title)
    setEditKind(r.kind)
    setEditUrl(r.url ?? '')
    setEditBody(r.body ?? '')
    setNotice(null)
  }

  async function handleSave(e: FormEvent, id: string) {
    e.preventDefault()
    if (!user) return
    if (editTitle.trim() === '') {
      setNotice('Judul materi tidak boleh kosong.')
      return
    }
    setSaving(true)
    const { error: updErr } = await supabase
      .from('lesson_resources')
      .update({
        title: editTitle.trim(),
        kind: editKind,
        url: editUrl.trim() || null,
        body: editBody.trim() || null,
      })
      .eq('id', id)
    setSaving(false)
    if (updErr) {
      setError(`Gagal menyimpan materi: ${updErr.message}`)
      return
    }
    setEditingId(null)
    setNotice('Materi tersimpan.')
    setLoading(true)
    await load(user.id, profile?.role === 'admin')
  }

  async function handleDelete(r: LessonResource) {
    if (!user) return
    if (!window.confirm(`Hapus materi "${r.title}"?`)) return
    const { error: delErr } = await supabase.from('lesson_resources').delete().eq('id', r.id)
    if (delErr) {
      setError(`Gagal menghapus materi: ${delErr.message}`)
      return
    }
    setNotice(`Materi "${r.title}" dihapus.`)
    setLoading(true)
    await load(user.id, profile?.role === 'admin')
  }

  if (loading) return <div className="page"><p className="muted">Memuat…</p></div>
  if (!isMentor) {
    return (
      <div className="page">
        <h1>Materi Pembelajaran</h1>
        <p className="empty">Halaman ini hanya untuk mentor.</p>
      </div>
    )
  }
  if (error) return <div className="page"><p className="error-box">{error}</p></div>

  const total = groups.reduce((s, g) => s + g.resources.length, 0)

  return (
    <div className="page">
      <PageHeader
        icon="book"
        title="Materi Pembelajaran"
        subtitle="Semua materi tambahan (bacaan, PDF, gambar, video, file, tautan) di course yang kamu ampu."
      />
      <WorkspaceNav entries={MENTOR_NAV} />
      {notice && <p className="notice-box">{notice}</p>}
      {groups.length === 0 ? (
        <EmptyState message="Belum ada materi. Tambah materi dari Course Builder di lesson masing-masing course." actionLabel="Buka Course Builder" actionTo="/mentor/course-builder" />
      ) : (
        <>
          <p className="muted">{total} materi di {groups.length} lesson.</p>
          {groups.map((g) => (
            <section className="section" key={`${g.course.id}-${g.lesson.id}`}>
              <h2>{g.course.title}</h2>
              <p className="muted">
                Lesson: <Link to={`/lesson/${g.lesson.id}`}>{g.lesson.title}</Link>
              </p>
              <ul className="discussion-list">
                {g.resources.map((r) => (
                  <li key={r.id} className="discussion-item">
                    {editingId === r.id ? (
                      <form className="form" onSubmit={(e) => void handleSave(e, r.id)}>
                        <label>
                          Judul
                          <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
                        </label>
                        <label>
                          Jenis
                          <select value={editKind} onChange={(e) => setEditKind(e.target.value as LessonResource['kind'])}>
                            {KIND_OPTIONS.map((k) => (
                              <option key={k} value={k}>{KIND_LABELS[k]}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          URL (opsional)
                          <input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} placeholder="https://…" />
                        </label>
                        <label>
                          Isi / catatan (opsional)
                          <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={3} />
                        </label>
                        <div className="form-actions">
                          <button type="submit" className="btn btn-primary btn-small" disabled={saving}>Simpan</button>
                          <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditingId(null)}>Batal</button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <p className="discussion-meta">{KIND_LABELS[r.kind]}</p>
                        <h3>{r.title}</h3>
                        {r.url && (
                          <p><a href={r.url} target="_blank" rel="noreferrer">{r.url}</a></p>
                        )}
                        {r.body && <p className="muted">{r.body.length > 160 ? `${r.body.slice(0, 160)}…` : r.body}</p>}
                        <p>
                          <Link to={`/lesson/${r.lesson_id}`} className="btn btn-ghost btn-small">Buka lesson</Link>{' '}
                          <button type="button" className="btn btn-secondary btn-small" onClick={() => startEdit(r)}>Edit</button>{' '}
                          <button type="button" className="btn btn-ghost btn-small" onClick={() => void handleDelete(r)}>Hapus</button>
                        </p>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
      <p><Link to="/mentor">Kembali ke Mentor Workspace</Link></p>
    </div>
  )
}
