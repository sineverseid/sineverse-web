// SINEVERSE — Course Builder (003 + 009): tambah/edit modul + lesson,
// materi kaya (lesson_resources), buat tugas / kuis / ujian, tambah soal
// kuis & ujian. Mentor hanya bisa membangun course yang diampunya (RLS);
// admin bisa semua course.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchCourse, fetchLessons, fetchModules, supabase } from '../lib/supabase'
import type { Assignment, CompetencyExam, Lesson, LessonResource, Module, Quiz } from '../lib/types'
import WorkspaceNav from '../components/WorkspaceNav'
import { MENTOR_NAV } from '../lib/workspaceNav'

export default function CourseBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const { user, profile } = useAuth()
  const [course, setCourse] = useState<{ id: string; title: string; mentor_id: string | null } | null>(null)
  const [modules, setModules] = useState<Module[]>([])
  const [lessonsByModule, setLessonsByModule] = useState<Record<string, Lesson[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [moduleTitle, setModuleTitle] = useState('')
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
    const map: Record<string, Lesson[]> = {}
    for (const m of mods) map[m.id] = await fetchLessons(m.id)
    setLessonsByModule(map)
    const allLessonIds = Object.values(map).flat().map((l) => l.id)
    if (allLessonIds.length > 0) {
      const { data: qData } = await supabase.from('quizzes').select('*').in('lesson_id', allLessonIds)
      setQuizzes((qData ?? []) as Quiz[])
      const { data: aData } = await supabase.from('assignments').select('*').in('lesson_id', allLessonIds)
      setAssignments((aData ?? []) as Assignment[])
    }
    const { data: eData } = await supabase.from('competency_exams').select('*').eq('course_id', courseId)
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
        if (c) await refresh(courseId)
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
  const ok = (msg: string) => setNotice(msg)
  const fail = (err: unknown) => setNotice(err instanceof Error ? err.message : 'Gagal menyimpan.')

  async function addModule(e: FormEvent) {
    e.preventDefault()
    const { error: insErr } = await supabase.from('modules').insert({
      course_id: currentCourse.id,
      title: moduleTitle.trim(),
      order_index: modules.length,
      is_published: true,
    })
    if (insErr) fail(insErr)
    else {
      setModuleTitle('')
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
    const { error: insErr } = await supabase.from('lessons').insert({
      module_id: lessonModule,
      title: lessonTitle.trim(),
      video_url: lessonVideo.trim() || null,
      content: lessonContent.trim() || null,
      order_index: (lessonsByModule[lessonModule] ?? []).length,
    })
    if (insErr) fail(insErr)
    else {
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
        <h2>Tambah Modul</h2>
        <form className="form" onSubmit={addModule}>
          <label>Judul modul<input value={moduleTitle} onChange={(e) => setModuleTitle(e.target.value)} required /></label>
          <button type="submit" className="btn btn-primary">Tambah Modul</button>
        </form>
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
