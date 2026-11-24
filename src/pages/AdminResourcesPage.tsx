// SINEVERSE — Admin Academy: Materi Pembelajaran (Admin).
// Tabel semua lesson_resources di semua course: course, lesson, jenis,
// judul, tautan (url) atau cuplikan isi (80 karakter pertama body),
// dan tanggal dibuat. Hanya baca kecuali hapus (dengan konfirmasi);
// pengeditan materi ada di halaman mentor.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchCourses, supabase } from '../lib/supabase'
import { deleteLessonFile } from '../lib/lessonResources'
import type { Lesson, LessonResource, Module } from '../lib/types'
import PageHeader from '../components/PageHeader'

interface ResourceRow {
  resource: LessonResource
  courseTitle: string
  lessonTitle: string
}

function kindLabel(kind: LessonResource['kind']): string {
  if (kind === 'reading') return 'Bacaan'
  if (kind === 'image') return 'Gambar'
  if (kind === 'pdf') return 'PDF'
  if (kind === 'video') return 'Video'
  if (kind === 'file') return 'File'
  return 'Tautan'
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AdminResourcesPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<ResourceRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function load() {
    try {
      const courses = await fetchCourses()
      const courseById = new Map(courses.map((c) => [c.id, c.title]))
      // B63: .error tiap sub-query diperiksa — gagal = error-box, bukan
      // "Belum ada materi" yang menyamarkan kegagalan sebagai daftar kosong.
      const { data: mods, error: modsErr } = await supabase.from('modules').select('id,course_id')
      if (modsErr) throw modsErr
      const modRows = (mods ?? []) as Module[]
      const modCourse = new Map(modRows.map((m) => [m.id, m.course_id]))
      let lessonRows: Lesson[] = []
      if (modRows.length > 0) {
        const { data: lessons, error: lessonsErr } = await supabase
          .from('lessons')
          .select('id,module_id,title')
          .in('module_id', modRows.map((m) => m.id))
        if (lessonsErr) throw lessonsErr
        lessonRows = (lessons ?? []) as Lesson[]
      }
      const lessonById = new Map(lessonRows.map((l) => [l.id, l]))
      let resources: LessonResource[] = []
      if (lessonRows.length > 0) {
        const { data: res, error: resErr } = await supabase
          .from('lesson_resources')
          .select('*')
          .in('lesson_id', lessonRows.map((l) => l.id))
          .order('created_at', { ascending: false })
        if (resErr) throw resErr
        resources = (res ?? []) as LessonResource[]
      }
      const out: ResourceRow[] = resources.map((r) => {
        const lesson = lessonById.get(r.lesson_id)
        const courseId = lesson ? modCourse.get(lesson.module_id) ?? '' : ''
        return {
          resource: r,
          courseTitle: courseById.get(courseId) ?? 'Course',
          lessonTitle: lesson?.title ?? 'Lesson',
        }
      })
      out.sort((a, b) =>
        a.courseTitle.localeCompare(b.courseTitle) ||
        a.lessonTitle.localeCompare(b.lessonTitle) ||
        a.resource.title.localeCompare(b.resource.title),
      )
      setRows(out)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat materi pembelajaran.')
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
        <h1>Materi Pembelajaran (Admin)</h1>
        <p className="empty">Halaman ini hanya untuk admin.</p>
      </div>
    )
  }
  if (loading) return <div className="page"><p className="muted">Memuat…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>

  async function deleteResource(row: ResourceRow) {
    if (!window.confirm(`Hapus materi "${row.resource.title}" dari lesson "${row.lessonTitle}"? Tindakan ini tidak bisa dibatalkan.`)) return
    const { error: delErr } = await supabase.from('lesson_resources').delete().eq('id', row.resource.id)
    if (delErr) {
      setNotice(`Gagal menghapus materi: ${delErr.message}`)
      return
    }
    // Hapus juga file di bucket (bila ada) — tanpa ini file jadi yatim.
    if (row.resource.file_path) await deleteLessonFile(row.resource.file_path)
    setNotice(`Materi "${row.resource.title}" dihapus.`)
    await load()
  }

  return (
    <div className="page">
      <PageHeader
        icon="library"
        title="Materi Pembelajaran (Admin)"
        subtitle="Semua materi tambahan di semua lesson. Pengeditan materi ada di halaman mentor; di sini materi hanya bisa dihapus."
      />
      {notice && <p className="notice-box">{notice}</p>}
      {rows !== null && rows.length === 0 && <p className="empty">Belum ada materi pembelajaran.</p>}
      {rows !== null && rows.length > 0 && (
        <div className="grade-table-wrap">
          <table className="grade-table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Lesson</th>
                <th>Jenis</th>
                <th>Judul</th>
                <th>Isi / Tautan</th>
                <th>Dibuat</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.resource.id}>
                  <td>{r.courseTitle}</td>
                  <td>{r.lessonTitle}</td>
                  <td>{kindLabel(r.resource.kind)}</td>
                  <td>{r.resource.title}</td>
                  <td>
                    {r.resource.url ? (
                      <a href={r.resource.url} target="_blank" rel="noreferrer">{r.resource.url}</a>
                    ) : (
                      r.resource.body ? r.resource.body.slice(0, 80) + (r.resource.body.length > 80 ? '…' : '') : '—'
                    )}
                  </td>
                  <td>{formatDate(r.resource.created_at)}</td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => void deleteResource(r)}>
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted"><Link to="/admin">Kembali ke Admin Panel</Link></p>
    </div>
  )
}
