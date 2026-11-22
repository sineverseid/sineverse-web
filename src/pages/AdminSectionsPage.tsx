// SINEVERSE — Admin Academy: Kelola Section & Lesson.
// Admin memilih course, lalu melihat modules (section) beserta lesson di
// bawahnya. Per lesson bisa edit judul + konten, pindah section, atau
// dihapus. Judul section bisa diedit inline. Section utuh tidak pernah
// dihapus dari halaman ini.
// Lesson sambutan "Selamat Datang di SINEVERSE" (Orientasi, urutan 0)
// adalah data seed: penghapusannya butuh konfirmasi kedua yang eksplisit.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchCourses, fetchLessons, fetchModules, invalidateCatalogCache, supabase } from '../lib/supabase'
import type { Course, Lesson, Module } from '../lib/types'
import PageHeader from '../components/PageHeader'

const WELCOME_TITLE = 'Selamat Datang di SINEVERSE'

function isWelcomeLesson(lesson: Lesson, modules: Module[]): boolean {
  if (lesson.title !== WELCOME_TITLE || lesson.order_index !== 0) return false
  const mod = modules.find((m) => m.id === lesson.module_id)
  return mod?.title === 'Orientasi'
}

export default function AdminSectionsPage() {
  const { profile } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [modules, setModules] = useState<Module[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingCourse, setLoadingCourse] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [editingLessonId, setEditingLessonId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [moveTarget, setMoveTarget] = useState<Record<string, string>>({})
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null)
  const [editModuleTitle, setEditModuleTitle] = useState('')
  const [newSectionTitle, setNewSectionTitle] = useState('')
  const [newLessonTitle, setNewLessonTitle] = useState<Record<string, string>>({})
  const [newLessonContent, setNewLessonContent] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    async function loadCourses() {
      try {
        const list = await fetchCourses()
        if (cancelled) return
        setCourses(list)
        if (list.length > 0) setSelectedCourseId(list[0].id)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat course.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadCourses()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedCourseId) return
    let cancelled = false
    async function loadCourse() {
      setLoadingCourse(true)
      setError(null)
      try {
        const mods = await fetchModules(selectedCourseId)
        if (cancelled) return
        const lessonLists = await Promise.all(mods.map((m) => fetchLessons(m.id)))
        if (cancelled) return
        setModules(mods)
        setLessons(lessonLists.flat())
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat section dan lesson.')
      } finally {
        if (!cancelled) setLoadingCourse(false)
      }
    }
    void loadCourse()
    return () => {
      cancelled = true
    }
  }, [selectedCourseId])

  async function reloadCourse() {
    if (!selectedCourseId) return
    try {
      const mods = await fetchModules(selectedCourseId)
      const lessonLists = await Promise.all(mods.map((m) => fetchLessons(m.id)))
      setModules(mods)
      setLessons(lessonLists.flat())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat ulang section dan lesson.')
    }
  }

  if (profile?.role !== 'admin') {
    return (
      <div className="page">
        <h1>Kelola Section &amp; Lesson</h1>
        <p className="empty">Halaman ini hanya untuk admin.</p>
      </div>
    )
  }
  if (loading) return <div className="page"><p className="muted">Memuat…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>

  const selectedCourse = courses.find((c) => c.id === selectedCourseId)
  const lessonsOf = (moduleId: string) =>
    lessons.filter((l) => l.module_id === moduleId).sort((a, b) => a.order_index - b.order_index)

  function startEditLesson(lesson: Lesson) {
    setEditingLessonId(lesson.id)
    setEditTitle(lesson.title)
    setEditContent(lesson.content ?? '')
    setNotice(null)
  }

  async function saveLesson(lesson: Lesson) {
    if (!editTitle.trim()) {
      setNotice('Judul lesson tidak boleh kosong.')
      return
    }
    const { error: updErr } = await supabase
      .from('lessons')
      .update({ title: editTitle.trim(), content: editContent })
      .eq('id', lesson.id)
    if (updErr) {
      setNotice(`Gagal menyimpan lesson: ${updErr.message}`)
      return
    }
    setNotice(`Lesson "${editTitle.trim()}" disimpan.`)
    setEditingLessonId(null)
    await reloadCourse()
  }

  async function moveLesson(lesson: Lesson) {
    const targetId = moveTarget[lesson.id]
    if (!targetId || targetId === lesson.module_id) {
      setNotice('Pilih section tujuan yang berbeda dari section saat ini.')
      return
    }
    const targetLessons = lessonsOf(targetId)
    const nextOrder = targetLessons.length > 0
      ? Math.max(...targetLessons.map((l) => l.order_index)) + 1
      : 0
    const { error: updErr } = await supabase
      .from('lessons')
      .update({ module_id: targetId, order_index: nextOrder })
      .eq('id', lesson.id)
    if (updErr) {
      setNotice(`Gagal memindah lesson: ${updErr.message}`)
      return
    }
    setNotice(`Lesson "${lesson.title}" dipindah ke section tujuan (urutan akhir).`)
    setMoveTarget((prev) => ({ ...prev, [lesson.id]: '' }))
    await reloadCourse()
  }

  async function deleteLesson(lesson: Lesson) {
    if (!window.confirm(`Hapus lesson "${lesson.title}"? Tindakan ini tidak bisa dibatalkan.`)) return
    if (isWelcomeLesson(lesson, modules)) {
      if (!window.confirm(
        'Lesson ini adalah lesson sambutan seed "Selamat Datang di SINEVERSE" di section Orientasi. ' +
        'Menghapusnya akan menghilangkan lesson pembuka bawaan platform. Yakin tetap hapus lesson sambutan ini?',
      )) return
    }
    const { error: delErr } = await supabase.from('lessons').delete().eq('id', lesson.id)
    if (delErr) {
      setNotice(`Gagal menghapus lesson: ${delErr.message}`)
      return
    }
    setNotice(`Lesson "${lesson.title}" dihapus.`)
    await reloadCourse()
  }

  function startEditModule(mod: Module) {
    setEditingModuleId(mod.id)
    setEditModuleTitle(mod.title)
    setNotice(null)
  }

  async function saveModule(mod: Module) {
    if (!editModuleTitle.trim()) {
      setNotice('Judul section tidak boleh kosong.')
      return
    }
    const { error: updErr } = await supabase
      .from('modules')
      .update({ title: editModuleTitle.trim() })
      .eq('id', mod.id)
    if (updErr) {
      setNotice(`Gagal menyimpan section: ${updErr.message}`)
      return
    }
    setNotice(`Section "${editModuleTitle.trim()}" disimpan.`)
    setEditingModuleId(null)
    await reloadCourse()
  }

  async function addSection(e: FormEvent) {
    e.preventDefault()
    if (!selectedCourseId) return
    if (!newSectionTitle.trim()) {
      setNotice('Judul section tidak boleh kosong.')
      return
    }
    const nextOrder = modules.length > 0 ? Math.max(...modules.map((m) => m.order_index)) + 1 : 1
    const { error: insErr } = await supabase.from('modules').insert({
      course_id: selectedCourseId,
      title: newSectionTitle.trim(),
      order_index: nextOrder,
      is_published: true,
    })
    if (insErr) {
      setNotice(`Gagal menambah section: ${insErr.message}`)
      return
    }
    invalidateCatalogCache()
    setNotice(`Section "${newSectionTitle.trim()}" ditambahkan.`)
    setNewSectionTitle('')
    await reloadCourse()
  }

  async function addLesson(e: FormEvent, moduleId: string) {
    e.preventDefault()
    const title = (newLessonTitle[moduleId] ?? '').trim()
    if (!title) {
      setNotice('Judul lesson tidak boleh kosong.')
      return
    }
    const { error: insErr } = await supabase.from('lessons').insert({
      module_id: moduleId,
      title,
      content: (newLessonContent[moduleId] ?? '').trim() || null,
      order_index: lessonsOf(moduleId).length,
    })
    if (insErr) {
      setNotice(`Gagal menambah lesson: ${insErr.message}`)
      return
    }
    invalidateCatalogCache()
    setNotice(`Lesson "${title}" ditambahkan.`)
    setNewLessonTitle((prev) => ({ ...prev, [moduleId]: '' }))
    setNewLessonContent((prev) => ({ ...prev, [moduleId]: '' }))
    await reloadCourse()
  }

  return (
    <div className="page">
      <PageHeader
        icon="book"
        title="Kelola Section & Lesson"
        subtitle="Pilih course, lalu kelola section (module) dan lesson di dalamnya."
      />
      {notice && <p className="notice-box">{notice}</p>}
      <section className="section">
        <label>
          Course
          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
          >
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>
        {selectedCourse && <p className="muted">{modules.length} section · {lessons.length} lesson</p>}
      </section>

      <section className="section">
        <h2>Tambah Section</h2>
        <form className="form" onSubmit={addSection}>
          <label>
            Judul section baru
            <input
              value={newSectionTitle}
              onChange={(e) => setNewSectionTitle(e.target.value)}
              required
              placeholder="Mis. Section 3 — Minggu 3"
            />
          </label>
          <button type="submit" className="btn btn-primary btn-small" disabled={!selectedCourseId}>
            Tambah Section
          </button>
        </form>
      </section>

      {loadingCourse && <p className="muted">Memuat…</p>}
      {!loadingCourse && modules.length === 0 && (
        <p className="empty">Course ini belum punya section.</p>
      )}
      {!loadingCourse && modules.map((mod) => {
        const modLessons = lessonsOf(mod.id)
        return (
          <section className="section" key={mod.id}>
            {editingModuleId === mod.id ? (
              <form
                className="form"
                onSubmit={(e) => {
                  e.preventDefault()
                  void saveModule(mod)
                }}
              >
                <label>
                  Judul section
                  <input value={editModuleTitle} onChange={(e) => setEditModuleTitle(e.target.value)} required />
                </label>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary btn-small">Simpan Section</button>
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditingModuleId(null)}>Batal</button>
                </div>
              </form>
            ) : (
              <h2>
                {mod.title}{' '}
                <button type="button" className="btn btn-ghost btn-small" onClick={() => startEditModule(mod)}>
                  Edit Judul Section
                </button>
              </h2>
            )}
            {modLessons.length === 0 ? (
              <p className="empty">Section ini belum punya lesson.</p>
            ) : (
              <ul className="discussion-list">
                {modLessons.map((lesson, idx) => (
                  <li key={lesson.id} className="discussion-item">
                    {editingLessonId === lesson.id ? (
                      <form
                        className="form"
                        onSubmit={(e) => {
                          e.preventDefault()
                          void saveLesson(lesson)
                        }}
                      >
                        <label>
                          Judul lesson
                          <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
                        </label>
                        <label>
                          Konten
                          <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={6} />
                        </label>
                        <div className="form-actions">
                          <button type="submit" className="btn btn-primary btn-small">Simpan</button>
                          <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditingLessonId(null)}>Batal</button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <p>
                          {/* Nomor urut dihitung per section (posisi di
                              daftar ini), bukan dari order_index global —
                              sebelumnya lesson bernomor 2–6 di SETIAP
                              section karena order_index tidak diulang. */}
                          <strong>{idx + 1}. {lesson.title}</strong>
                          {isWelcomeLesson(lesson, modules) && ' (lesson sambutan seed)'}
                        </p>
                        {lesson.video_url && <p className="muted">Video: {lesson.video_url}</p>}
                        <div className="form-actions">
                          <button type="button" className="btn btn-secondary btn-small" onClick={() => startEditLesson(lesson)}>Edit</button>
                          <button type="button" className="btn btn-ghost btn-small" onClick={() => void deleteLesson(lesson)}>Hapus Lesson</button>
                        </div>
                        <label>
                          Pindah section
                          <select
                            value={moveTarget[lesson.id] ?? ''}
                            onChange={(e) => setMoveTarget((prev) => ({ ...prev, [lesson.id]: e.target.value }))}
                            style={{ fontFamily: 'inherit', padding: '0.5rem 0.7rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
                          >
                            <option value="">Pilih section tujuan</option>
                            {modules.filter((m) => m.id !== lesson.module_id).map((m) => (
                              <option key={m.id} value={m.id}>{m.title}</option>
                            ))}
                          </select>
                        </label>
                        <div className="form-actions">
                          <button type="button" className="btn btn-ghost btn-small" onClick={() => void moveLesson(lesson)}>Pindah</button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault()
                void addLesson(e, mod.id)
              }}
            >
              <h3>Tambah Lesson ke section ini</h3>
              <label>
                Judul lesson
                <input
                  value={newLessonTitle[mod.id] ?? ''}
                  onChange={(e) => setNewLessonTitle((prev) => ({ ...prev, [mod.id]: e.target.value }))}
                  required
                  placeholder="Mis. Pengenalan kamera"
                />
              </label>
              <label>
                Konten (opsional)
                <textarea
                  value={newLessonContent[mod.id] ?? ''}
                  onChange={(e) => setNewLessonContent((prev) => ({ ...prev, [mod.id]: e.target.value }))}
                  rows={3}
                />
              </label>
              <button type="submit" className="btn btn-primary btn-small">Tambah Lesson</button>
            </form>
          </section>
        )
      })}
      <p className="muted"><Link to="/admin">Kembali ke Admin Panel</Link></p>
    </div>
  )
}
