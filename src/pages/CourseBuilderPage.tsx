// SINEVERSE — Course Builder (003 + 009): tambah/edit modul + lesson,
// materi kaya (lesson_resources), buat tugas / kuis / ujian, tambah soal
// kuis & ujian. Mentor hanya bisa membangun course yang diampunya (RLS);
// admin bisa semua course.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchCourse, fetchModules, invalidateCatalogCache, supabase, updateCourseAccessMode } from '../lib/supabase'
import type { Assignment, CompetencyExam, Course, Lesson, LessonResource, Module, Quiz } from '../lib/types'
import WorkspaceNav from '../components/WorkspaceNav'
import { MENTOR_NAV } from '../lib/workspaceNav'

export default function CourseBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const { user, profile } = useAuth()
  const [course, setCourse] = useState<Course | null>(null)
  const [modules, setModules] = useState<Module[]>([])
  const [accessMode, setAccessMode] = useState<'direct' | 'sequential'>('direct')
  const [accessSaving, setAccessSaving] = useState(false)
  const [lessonsByModule, setLessonsByModule] = useState<Record<string, Lesson[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [moduleSection, setModuleSection] = useState('')
  const [lessonModule, setLessonModule] = useState('')
  const [lessonTitle, setLessonTitle] = useState('')
  const [lessonVideo, setLessonVideo] = useState('')
  const [lessonContent, setLessonContent] = useState('')
  const [resLesson, setResLesson] = useState('')
  const [resKind, setResKind] = useState<LessonResource['kind']>('reading')
  const [resTitle, setResTitle] = useState('')
  const [resUrl, setResUrl] = useState('')
  const [resBody, setResBody] = useState('')
  const [asgLesson, setAsgLesson] = useState('')
  const [asgTitle, setAsgTitle] = useState('')
  const [asgDesc, setAsgDesc] = useState('')
  const [asgMax, setAsgMax] = useState(100)
  const [asgDue, setAsgDue] = useState('')
  const [quizLesson, setQuizLesson] = useState('')
  const [quizTitle, setQuizTitle] = useState('')
  const [quizPass, setQuizPass] = useState(70)
  const [quizMax, setQuizMax] = useState('')
  const [qqQuiz, setQqQuiz] = useState('')
  const [qqKind, setQqKind] = useState<'mc' | 'true_false' | 'short'>('mc')
  const [qqQuestion, setQqQuestion] = useState('')
  const [qqOptions, setQqOptions] = useState('')
  const [qqAnswer, setQqAnswer] = useState('')
  const [qqExpl, setQqExpl] = useState('')
  const [examTitle, setExamTitle] = useState('')
  const [examDesc, setExamDesc] = useState('')
  const [examPass, setExamPass] = useState(70)
  const [examMax, setExamMax] = useState('')
  const [eqExam, setEqExam] = useState('')
  const [eqKind, setEqKind] = useState<'mc' | 'true_false' | 'short'>('mc')
  const [eqQuestion, setEqQuestion] = useState('')
  const [eqOptions, setEqOptions] = useState('')
  const [eqAnswer, setEqAnswer] = useState('')
  const [eqExpl, setEqExpl] = useState('')
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [exams, setExams] = useState<CompetencyExam[]>([])

  const canEdit = profile?.role === 'admin' || course?.mentor_id === user?.id

  async function refresh(courseId: string) {
    const mods = await fetchModules(courseId)
    setModules(mods)
    // Satu query untuk semua lesson (bukan satu query per modul),
    // diurutkan seperti fetchCourseLessons: (urutan modul, urutan lesson).
    // Query .in() langsung dipakai di sini — bukan fetchCourseLessons —
    // karena fungsi itu memuat ulang modul secara internal.
    const orderByModule = new Map(mods.map((m) => [m.id, m.order_index]))
    let allLessons: Lesson[] = []
    if (mods.length > 0) {
      const { data: lData } = await supabase
        .from('lessons')
        .select('*')
        .in('module_id', mods.map((m) => m.id))
      allLessons = ((lData ?? []) as Lesson[]).sort((a, b) => {
        const ma = orderByModule.get(a.module_id) ?? 0
        const mb = orderByModule.get(b.module_id) ?? 0
        if (ma !== mb) return ma - mb
        return (a.order_index ?? 0) - (b.order_index ?? 0)
      })
    }
    const map: Record<string, Lesson[]> = {}
    for (const m of mods) map[m.id] = []
    for (const l of allLessons) {
      if (map[l.module_id]) map[l.module_id].push(l)
    }
    setLessonsByModule(map)
    const allLessonIds = allLessons.map((l) => l.id)
    // Kuis + tugas + ujian dimuat paralel. Bila tidak ada lesson,
    // kuis/tugas tetap seperti semula (tidak diubah), ujian tetap dimuat.
    const [qData, aData, eData] = await Promise.all([
      allLessonIds.length > 0
        ? supabase.from('quizzes').select('*').in('lesson_id', allLessonIds).then((r) => r.data)
        : Promise.resolve(null),
      allLessonIds.length > 0
        ? supabase.from('assignments').select('*').in('lesson_id', allLessonIds).then((r) => r.data)
        : Promise.resolve(null),
      supabase.from('competency_exams').select('*').eq('course_id', courseId).then((r) => r.data),
    ])
    if (qData !== null) setQuizzes((qData ?? []) as Quiz[])
    if (aData !== null) setAssignments((aData ?? []) as Assignment[])
    setExams((eData ?? []) as CompetencyExam[])
  }

  useEffect(() => {
    if (!id) return
    const courseId = id
    let cancelled = false
    async function load() {
      try {
        const c = await fetchCourse(courseId)
        if (cancelled) return
        setCourse(c)
        if (c) {
          setAccessMode(c.access_mode ?? 'direct')
          await refresh(courseId)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat course.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading) return <div className="page"><p className="muted">Memuat Course Builder…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (!course) return <div className="page"><p className="empty">Course tidak ditemukan.</p><Link to="/mentor">Kembali</Link></div>
  if (!canEdit) {
    return (
      <div className="page">
        <h1>Course Builder</h1>
        <p className="empty">Kamu bukan pengampu course ini, jadi tidak bisa mengeditnya.</p>
        <Link to="/mentor">Kembali ke Mentor Workspace</Link>
      </div>
    )
  }

  const currentCourse = course
  const allLessons = Object.values(lessonsByModule).flat()
  // Section = modul order_index 1 (Section 1) atau 2 (Section 2).
  // Orientasi (order_index 0) tidak dihitung sebagai section.
  const sectionOrderTaken = new Set(
    modules.filter((m) => m.order_index === 1 || m.order_index === 2).map((m) => m.order_index),
  )
  const sectionChoices = [
    { order: 1, title: 'Section 1 — Minggu 1' },
    { order: 2, title: 'Section 2 — Minggu 2' },
  ].filter((s) => !sectionOrderTaken.has(s.order))
  const ok = (msg: string) => setNotice(msg)
  const fail = (err: unknown) => setNotice(err instanceof Error ? err.message : 'Gagal menyimpan.')

  async function changeAccessMode(mode: 'direct' | 'sequential') {
    setAccessMode(mode)
    setAccessSaving(true)
    try {
      const updated = await updateCourseAccessMode(currentCourse.id, mode)
      setCourse(updated)
      ok(
        mode === 'sequential'
          ? 'Mode akses diubah ke Berurutan: Section 2 terbuka setelah Section 1 selesai.'
          : 'Mode akses diubah ke Langsung: semua section bisa dibuka.',
      )
    } catch (err) {
      setAccessMode(course?.access_mode ?? 'direct')
      fail(err)
    } finally {
      setAccessSaving(false)
    }
  }

  async function addModule(e: FormEvent) {
    e.preventDefault()
    const choice = sectionChoices.find((s) => s.order === Number(moduleSection))
    if (!choice) {
      setNotice('Pilih section dulu.')
      return
    }
    const { error: insErr } = await supabase.from('modules').insert({
      course_id: currentCourse.id,
      title: choice.title,
      order_index: choice.order,
      is_published: true,
    })
    if (insErr) fail(insErr)
    else {
      invalidateCatalogCache()
      setModuleSection('')
      ok('Modul ditambahkan.')
      await refresh(currentCourse.id)
    }
  }

  async function addLesson(e: FormEvent) {
    e.preventDefault()
    if (!lessonModule) {
      setNotice('Pilih modul dulu.')
      return
    }
    // Batas Stage 1: tiap section (order_index 1/2) maksimal 5 lesson.
    const targetModule = modules.find((m) => m.id === lessonModule)
    const isSectionModule =
      targetModule !== undefined && (targetModule.order_index === 1 || targetModule.order_index === 2)
    if (isSectionModule && (lessonsByModule[lessonModule] ?? []).length >= 5) {
      setNotice('Section ini sudah berisi 5 lesson.')
      return
    }
    const { error: insErr } = await supabase.from('lessons').insert({
      module_id: lessonModule,
      title: lessonTitle.trim(),
      video_url: lessonVideo.trim() || null,
      content: lessonContent.trim() || null,
      order_index: (lessonsByModule[lessonModule] ?? []).length,
    })
    if (insErr) fail(insErr)
    else {
      invalidateCatalogCache()
      setLessonTitle('')
      setLessonVideo('')
      setLessonContent('')
      ok('Lesson ditambahkan.')
      await refresh(currentCourse.id)
    }
  }

  async function addResource(e: FormEvent) {
    e.preventDefault()
    if (!resLesson) {
      setNotice('Pilih lesson dulu.')
      return
    }
    const { error: insErr } = await supabase.from('lesson_resources').insert({
      lesson_id: resLesson,
      kind: resKind,
      title: resTitle.trim(),
      url: resUrl.trim() || null,
      body: resBody.trim() || null,
    })
    if (insErr) fail(insErr)
    else {
      setResTitle('')
      setResUrl('')
      setResBody('')
      ok('Materi lesson ditambahkan.')
    }
  }

  async function addAssignment(e: FormEvent) {
    e.preventDefault()
    if (!asgLesson) {
      setNotice('Pilih lesson dulu.')
      return
    }
    const { error: insErr } = await supabase.from('assignments').insert({
      lesson_id: asgLesson,
      title: asgTitle.trim(),
      description: asgDesc.trim() || null,
      max_score: asgMax,
      due_date: asgDue ? new Date(asgDue).toISOString() : null,
      rubric: asgDesc.trim() || null,
    })
    if (insErr) fail(insErr)
    else {
      setAsgTitle('')
      setAsgDesc('')
      setAsgDue('')
      ok('Tugas dibuat.')
      await refresh(currentCourse.id)
    }
  }

  async function addQuiz(e: FormEvent) {
    e.preventDefault()
    if (!quizLesson) {
      setNotice('Pilih lesson dulu.')
      return
    }
    const { error: insErr } = await supabase.from('quizzes').insert({
      lesson_id: quizLesson,
      title: quizTitle.trim(),
      passing_score: quizPass,
      max_attempts: quizMax ? Number(quizMax) : null,
    })
    if (insErr) fail(insErr)
    else {
      setQuizTitle('')
      setQuizMax('')
      ok('Kuis dibuat. Tambahkan soal di bawah.')
      await refresh(currentCourse.id)
    }
  }

  async function addQuizQuestion(e: FormEvent) {
    e.preventDefault()
    if (!qqQuiz) {
      setNotice('Pilih kuis dulu.')
      return
    }
    const options = qqKind === 'mc'
      ? qqOptions.split('\n').map((s) => s.trim()).filter(Boolean)
      : qqKind === 'true_false'
        ? ['Benar', 'Salah']
        : null
    const { error: insErr } = await supabase.from('quiz_questions').insert({
      quiz_id: qqQuiz,
      kind: qqKind,
      question: qqQuestion.trim(),
      options,
      correct_answer: qqAnswer.trim(),
      explanation: qqExpl.trim() || null,
      order_index: 0,
    })
    if (insErr) fail(insErr)
    else {
      setQqQuestion('')
      setQqOptions('')
      setQqAnswer('')
      setQqExpl('')
      ok('Soal kuis ditambahkan. Jawaban benar hanya terlihat oleh pengajar course / admin — tidak pernah dikirim ke siswa.')
    }
  }

  async function addExam(e: FormEvent) {
    e.preventDefault()
    const { error: insErr } = await supabase.from('competency_exams').insert({
      course_id: currentCourse.id,
      title: examTitle.trim(),
      description: examDesc.trim() || null,
      passing_score: examPass,
      max_attempts: examMax ? Number(examMax) : null,
      created_by: user?.id ?? null,
    })
    if (insErr) fail(insErr)
    else {
      setExamTitle('')
      setExamDesc('')
      setExamMax('')
      ok('Ujian kompetensi dibuat. Tambahkan soal di bawah.')
      await refresh(currentCourse.id)
    }
  }

  async function addExamQuestion(e: FormEvent) {
    e.preventDefault()
    if (!eqExam) {
      setNotice('Pilih ujian dulu.')
      return
    }
    const options = eqKind === 'mc'
      ? eqOptions.split('\n').map((s) => s.trim()).filter(Boolean)
      : eqKind === 'true_false'
        ? ['Benar', 'Salah']
        : null
    const { error: insErr } = await supabase.from('exam_questions').insert({
      exam_id: eqExam,
      kind: eqKind,
      question: eqQuestion.trim(),
      options,
      correct_answer: eqAnswer.trim(),
      explanation: eqExpl.trim() || null,
      order_index: 0,
    })
    if (insErr) fail(insErr)
    else {
      setEqQuestion('')
      setEqOptions('')
      setEqAnswer('')
      setEqExpl('')
      ok('Soal ujian ditambahkan.')
    }
  }

  const selectStyle: React.CSSProperties = { fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }

  return (
    <div className="page">
      <Link to="/mentor" className="back-link">← Mentor Workspace</Link>
      <h1>Course Builder — {currentCourse.title}</h1>
      <WorkspaceNav
        entries={MENTOR_NAV.map((e) =>
          e.to === '/mentor/course-builder'
            ? { ...e, to: `/mentor/course/${currentCourse.id}` }
            : e,
        )}
      />
      {notice && <p className="notice-box">{notice}</p>}

      <section className="section">
        <h2>Struktur Saat Ini</h2>
        {modules.length === 0 ? <p className="empty">Belum ada modul.</p> : (
          <ul>
            {modules.map((m) => (
              <li key={m.id}>
                <strong>{m.title}</strong>
                <ul>
                  {(lessonsByModule[m.id] ?? []).map((l) => <li key={l.id}>{l.title}</li>)}
                </ul>
              </li>
            ))}
          </ul>
        )}
        <p className="muted">
          Kuis: {quizzes.length} · Tugas: {assignments.length} · Ujian kompetensi: {exams.length}
        </p>
      </section>

      <section className="section">
        <h2>Mode Akses Section</h2>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
          }}
        >
          <label>
            Cara membuka section
            <select
              value={accessMode}
              onChange={(e) => void changeAccessMode(e.target.value as 'direct' | 'sequential')}
              disabled={accessSaving}
              style={selectStyle}
            >
              <option value="direct">Langsung — semua section bisa dibuka</option>
              <option value="sequential">Berurutan — Section 2 terbuka setelah Section 1 selesai</option>
            </select>
          </label>
          {accessSaving && <p className="muted">Menyimpan…</p>}
        </form>
      </section>

      <section className="section">
        <h2>Tambah Modul</h2>
        <p className="muted">
          Modul Orientasi sudah ada dan tidak diubah. Setiap course maksimal 2 section:
          Section 1 dan Section 2, masing-masing berisi 5 lesson.
        </p>
        {sectionChoices.length === 0 ? (
          <p className="empty">Kedua section sudah ada (Section 1 dan Section 2).</p>
        ) : (
          <form className="form" onSubmit={addModule}>
            <label>
              Section
              <select value={moduleSection} onChange={(e) => setModuleSection(e.target.value)} required style={selectStyle}>
                <option value="">— Pilih section —</option>
                {sectionChoices.map((s) => (
                  <option key={s.order} value={s.order}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn btn-primary">Tambah Modul</button>
          </form>
        )}
      </section>

      <section className="section">
        <h2>Tambah Lesson</h2>
        <form className="form" onSubmit={addLesson}>
          <label>
            Modul
            <select value={lessonModule} onChange={(e) => setLessonModule(e.target.value)} required style={selectStyle}>
              <option value="">— Pilih modul —</option>
              {modules.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </label>
          {(() => {
            const target = modules.find((m) => m.id === lessonModule)
            if (!target || (target.order_index !== 1 && target.order_index !== 2)) return null
            const count = (lessonsByModule[lessonModule] ?? []).length
            return (
              <p className="muted">
                Section ini berisi {count}/5 lesson.
                {count >= 5 ? ' Sudah penuh — tidak bisa tambah lesson lagi.' : ''}
              </p>
            )
          })()}
          <label>Judul lesson<input value={lessonTitle} onChange={(e) => setLessonTitle(e.target.value)} required /></label>
          <label>URL video (opsional)<input value={lessonVideo} onChange={(e) => setLessonVideo(e.target.value)} placeholder="https://…" /></label>
          <label>Isi bacaan<textarea value={lessonContent} onChange={(e) => setLessonContent(e.target.value)} rows={4} /></label>
          <button type="submit" className="btn btn-primary">Tambah Lesson</button>
        </form>
      </section>

      <section className="section">
        <h2>Tambah Materi Lesson (bacaan / gambar / PDF / video / file / tautan)</h2>
        <form className="form" onSubmit={addResource}>
          <label>
            Lesson
            <select value={resLesson} onChange={(e) => setResLesson(e.target.value)} required style={selectStyle}>
              <option value="">— Pilih lesson —</option>
              {allLessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
            </select>
          </label>
          <label>
            Jenis
            <select value={resKind} onChange={(e) => setResKind(e.target.value as LessonResource['kind'])} style={selectStyle}>
              <option value="reading">Bacaan</option>
              <option value="image">Gambar</option>
              <option value="pdf">PDF</option>
              <option value="video">Video</option>
              <option value="file">File</option>
              <option value="link">Tautan</option>
            </select>
          </label>
          <label>Judul<input value={resTitle} onChange={(e) => setResTitle(e.target.value)} required /></label>
          <label>URL (opsional)<input value={resUrl} onChange={(e) => setResUrl(e.target.value)} placeholder="https://…" /></label>
          <label>Isi / catatan<textarea value={resBody} onChange={(e) => setResBody(e.target.value)} rows={3} /></label>
          <button type="submit" className="btn btn-primary">Tambah Materi</button>
        </form>
      </section>

      <section className="section">
        <h2>Buat Tugas</h2>
        <form className="form" onSubmit={addAssignment}>
          <label>
            Lesson
            <select value={asgLesson} onChange={(e) => setAsgLesson(e.target.value)} required style={selectStyle}>
              <option value="">— Pilih lesson —</option>
              {allLessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
            </select>
          </label>
          <label>Judul tugas<input value={asgTitle} onChange={(e) => setAsgTitle(e.target.value)} required /></label>
          <label>Deskripsi &amp; rubrik<textarea value={asgDesc} onChange={(e) => setAsgDesc(e.target.value)} rows={3} /></label>
          <label>Nilai maks.<input type="number" min={1} value={asgMax} onChange={(e) => setAsgMax(Number(e.target.value))} required /></label>
          <label>Tenggat (opsional)<input type="datetime-local" value={asgDue} onChange={(e) => setAsgDue(e.target.value)} /></label>
          <button type="submit" className="btn btn-primary">Buat Tugas</button>
        </form>
      </section>

      <section className="section">
        <h2>Buat Kuis + Soal</h2>
        <form className="form" onSubmit={addQuiz}>
          <label>
            Lesson
            <select value={quizLesson} onChange={(e) => setQuizLesson(e.target.value)} required style={selectStyle}>
              <option value="">— Pilih lesson —</option>
              {allLessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
            </select>
          </label>
          <label>Judul kuis<input value={quizTitle} onChange={(e) => setQuizTitle(e.target.value)} required /></label>
          <label>Nilai lulus<input type="number" min={0} max={100} value={quizPass} onChange={(e) => setQuizPass(Number(e.target.value))} required /></label>
          <label>Maks. percobaan (kosong = tanpa batas)<input type="number" min={1} value={quizMax} onChange={(e) => setQuizMax(e.target.value)} /></label>
          <button type="submit" className="btn btn-primary">Buat Kuis</button>
        </form>
        <form className="form" onSubmit={addQuizQuestion}>
          <label>
            Kuis
            <select value={qqQuiz} onChange={(e) => setQqQuiz(e.target.value)} required style={selectStyle}>
              <option value="">— Pilih kuis —</option>
              {quizzes.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
            </select>
          </label>
          <label>
            Jenis soal
            <select value={qqKind} onChange={(e) => setQqKind(e.target.value as typeof qqKind)} style={selectStyle}>
              <option value="mc">Pilihan ganda</option>
              <option value="true_false">Benar / Salah</option>
              <option value="short">Jawaban singkat</option>
            </select>
          </label>
          <label>Pertanyaan<textarea value={qqQuestion} onChange={(e) => setQqQuestion(e.target.value)} rows={2} required /></label>
          {qqKind === 'mc' && (
            <label>Pilihan jawaban (satu per baris)<textarea value={qqOptions} onChange={(e) => setQqOptions(e.target.value)} rows={4} required placeholder={'Pilihan A\nPilihan B\nPilihan C'} /></label>
          )}
          <label>Jawaban benar (hanya pengajar yang melihat)<input value={qqAnswer} onChange={(e) => setQqAnswer(e.target.value)} required placeholder={qqKind === 'true_false' ? 'Benar atau Salah' : 'Jawaban yang benar'} /></label>
          <label>Penjelasan (ditampilkan ke siswa setelah menjawab)<input value={qqExpl} onChange={(e) => setQqExpl(e.target.value)} /></label>
          <button type="submit" className="btn btn-primary">Tambah Soal Kuis</button>
        </form>
      </section>

      <section className="section">
        <h2>Buat Ujian Kompetensi + Soal</h2>
        <form className="form" onSubmit={addExam}>
          <label>Judul ujian<input value={examTitle} onChange={(e) => setExamTitle(e.target.value)} required /></label>
          <label>Deskripsi<textarea value={examDesc} onChange={(e) => setExamDesc(e.target.value)} rows={2} /></label>
          <label>Nilai lulus<input type="number" min={0} max={100} value={examPass} onChange={(e) => setExamPass(Number(e.target.value))} required /></label>
          <label>Maks. percobaan (kosong = tanpa batas)<input type="number" min={1} value={examMax} onChange={(e) => setExamMax(e.target.value)} /></label>
          <button type="submit" className="btn btn-primary">Buat Ujian</button>
        </form>
        <form className="form" onSubmit={addExamQuestion}>
          <label>
            Ujian
            <select value={eqExam} onChange={(e) => setEqExam(e.target.value)} required style={selectStyle}>
              <option value="">— Pilih ujian —</option>
              {exams.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
          </label>
          <label>
            Jenis soal
            <select value={eqKind} onChange={(e) => setEqKind(e.target.value as typeof eqKind)} style={selectStyle}>
              <option value="mc">Pilihan ganda</option>
              <option value="true_false">Benar / Salah</option>
              <option value="short">Jawaban singkat</option>
            </select>
          </label>
          <label>Pertanyaan<textarea value={eqQuestion} onChange={(e) => setEqQuestion(e.target.value)} rows={2} required /></label>
          {eqKind === 'mc' && (
            <label>Pilihan jawaban (satu per baris)<textarea value={eqOptions} onChange={(e) => setEqOptions(e.target.value)} rows={4} required /></label>
          )}
          <label>Jawaban benar (hanya pengajar yang melihat)<input value={eqAnswer} onChange={(e) => setEqAnswer(e.target.value)} required /></label>
          <label>Penjelasan<input value={eqExpl} onChange={(e) => setEqExpl(e.target.value)} /></label>
          <button type="submit" className="btn btn-primary">Tambah Soal Ujian</button>
        </form>
      </section>
    </div>
  )
}
