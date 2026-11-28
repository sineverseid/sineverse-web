// SINEVERSE — Course Builder (003 + 009): tambah/edit modul + lesson,
// materi kaya (lesson_resources), buat tugas / kuis / ujian, tambah soal
// kuis & ujian. Mentor hanya bisa membangun course yang diampunya (RLS);
// admin bisa semua course.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { createLiveClass, deleteLiveClass, fetchCourse, fetchLiveClasses, fetchModules, fetchRubricForAssignment, invalidateCatalogCache, saveRubric, supabase, updateCourseAccessMode } from '../lib/supabase'
import { acceptForKind, deleteLessonFile, fileMatchesKind, formatFileSize, kindForFile, titleFromFileName, uploadLessonFile, validateLessonFile } from '../lib/lessonResources'
import type { Assignment, AssignmentKind, CompetencyExam, Course, Lesson, LessonResource, LiveClass, Module, Quiz, QuizKind } from '../lib/types'
import WorkspaceNav from '../components/WorkspaceNav'
import { MENTOR_NAV } from '../lib/workspaceNav'

/** Baris kriteria di editor rubrik (belum tentu sudah tersimpan). */
interface RubricDraftCriterion {
  key: string
  title: string
  description: string
  max_score: number
}

/** Baris soal kuis/ujian untuk edit mentor/admin — diambil langsung dari
 *  tabel (bukan RPC siswa), jadi correct_answer ikut tersedia. */
interface QuestionRow {
  id: string
  quiz_id?: string
  exam_id?: string
  kind: 'mc' | 'true_false' | 'short'
  question: string
  options: string[] | null
  correct_answer: string | null
  explanation: string | null
  order_index: number
}

type EditingKind = 'module' | 'lesson' | 'assignment' | 'quiz' | 'quizQuestion' | 'exam' | 'examQuestion'

/** Ubah ISO timestamptz ke nilai input datetime-local (waktu lokal). */
function toLocalInput(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

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
  // Upload di form Tambah Materi (migrasi 062): file + pratinjau sebelum simpan.
  const [resFile, setResFile] = useState<File | null>(null)
  const [resFileUrl, setResFileUrl] = useState<string | null>(null)
  const [resFileError, setResFileError] = useState<string | null>(null)
  const [resUploading, setResUploading] = useState(false)
  // (D26) Topik Diskusi per lesson: prompt "Topik diskusi" (resource
  // reading) ditulis mentor — pengantar + "Studi Kasus" + pertanyaan
  // pemandu (format Mentari). Prompt yang sudah ada dimuat untuk diedit.
  const [topicLesson, setTopicLesson] = useState('')
  const [topicBody, setTopicBody] = useState('')
  const [topicExistingId, setTopicExistingId] = useState<string | null>(null)
  const [topicLoading, setTopicLoading] = useState(false)
  const [topicSaving, setTopicSaving] = useState(false)
  // (D27) Lampiran Topik Diskusi: gambar/file pada baris resource topik
  // (kolom url + file_path; kind TETAP 'reading' supaya prompt tetap
  // ditemukan halaman lesson). Memakai ulang jalur upload "Tambah
  // Materi" (bucket 'lesson-resources', uploadLessonFile).
  const [topicFile, setTopicFile] = useState<File | null>(null)
  const [topicFileUrl, setTopicFileUrl] = useState<string | null>(null)
  const [topicFileError, setTopicFileError] = useState<string | null>(null)
  const [topicAttachment, setTopicAttachment] = useState<{ url: string | null; file_path: string | null } | null>(null)
  const [topicAttachmentRemoved, setTopicAttachmentRemoved] = useState(false)
  // Media lesson di form edit (state di level atas — editForm hanya render).
  const [editResources, setEditResources] = useState<LessonResource[]>([])
  const [editResourcesLoading, setEditResourcesLoading] = useState(false)
  const [editMediaFile, setEditMediaFile] = useState<File | null>(null)
  const [editMediaUrl, setEditMediaUrl] = useState<string | null>(null)
  const [editMediaError, setEditMediaError] = useState<string | null>(null)
  const [editMediaUploading, setEditMediaUploading] = useState(false)
  const [editMediaDeletingId, setEditMediaDeletingId] = useState<string | null>(null)
  const [asgLesson, setAsgLesson] = useState('')
  const [asgTitle, setAsgTitle] = useState('')
  const [asgDesc, setAsgDesc] = useState('')
  const [asgMax, setAsgMax] = useState(100)
  const [asgDue, setAsgDue] = useState('')
  const [asgKind, setAsgKind] = useState<AssignmentKind>('weekly')
  const [quizLesson, setQuizLesson] = useState('')
  const [quizTitle, setQuizTitle] = useState('')
  const [quizKind, setQuizKind] = useState<QuizKind>('quiz')
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
  const [quizQuestions, setQuizQuestions] = useState<QuestionRow[]>([])
  const [examQuestions, setExamQuestions] = useState<QuestionRow[]>([])
  // B32: edit inline per item (modul, lesson, tugas, kuis, soal kuis,
  // ujian, soal ujian) + hapus dengan konfirmasi.
  const [editing, setEditing] = useState<{ kind: EditingKind; id: string } | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftText, setDraftText] = useState('')
  const [draftUrl, setDraftUrl] = useState('')
  const [draftNum, setDraftNum] = useState('')
  const [draftNum2, setDraftNum2] = useState('')
  const [draftAnswer, setDraftAnswer] = useState('')
  const [draftExpl, setDraftExpl] = useState('')
  // Opsi soal saat edit (hanya untuk soal pilihan ganda): satu per baris.
  const [draftOptions, setDraftOptions] = useState('')
  const [draftQKind, setDraftQKind] = useState<'mc' | 'true_false' | 'short'>('mc')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [liveClasses, setLiveClasses] = useState<LiveClass[]>([])
  const [lcTitle, setLcTitle] = useState('')
  const [lcScheduled, setLcScheduled] = useState('')
  const [lcMeetUrl, setLcMeetUrl] = useState('')
  const [lcSaving, setLcSaving] = useState(false)
  const [rubAsg, setRubAsg] = useState('')
  const [rubTitle, setRubTitle] = useState('Rubrik Penilaian')
  const [rubCriteria, setRubCriteria] = useState<RubricDraftCriterion[]>([])
  const [rubLoading, setRubLoading] = useState(false)
  const [rubSaving, setRubSaving] = useState(false)
  // (D27) Kelola Lesson: lesson yang dipilih untuk dikelola per-lesson
  // (materi, topik diskusi, tugas, kuis) — mengikuti urutan Pertemuan.
  const [managedLessonId, setManagedLessonId] = useState('')
  // (D27) Materi per lesson untuk kartu Kelola Lesson.
  const [resourcesByLesson, setResourcesByLesson] = useState<Record<string, LessonResource[]>>({})
  // (D27) Grup daftar yang dilipat: kunci "tugas-<lessonId>" /
  // "kuis-<lessonId>" / "soal-<quizId>" / "ujian-soal-<examId>" —
  // default TERLIPAT (tidak ada di map = tertutup).
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

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
    const [qData, aData, eData, lcData, resData] = await Promise.all([
      allLessonIds.length > 0
        ? supabase.from('quizzes').select('*').in('lesson_id', allLessonIds).then((r) => r.data)
        : Promise.resolve(null),
      allLessonIds.length > 0
        ? supabase.from('assignments').select('*').in('lesson_id', allLessonIds).then((r) => r.data)
        : Promise.resolve(null),
      supabase.from('competency_exams').select('*').eq('course_id', courseId).then((r) => r.data),
      fetchLiveClasses(courseId),
      // (D27) Materi per lesson untuk kartu Kelola Lesson.
      allLessonIds.length > 0
        ? supabase.from('lesson_resources').select('*').in('lesson_id', allLessonIds).then((r) => r.data)
        : Promise.resolve(null),
    ])
    if (qData !== null) setQuizzes((qData ?? []) as Quiz[])
    if (aData !== null) setAssignments((aData ?? []) as Assignment[])
    if (resData !== null) {
      const resMap: Record<string, LessonResource[]> = {}
      for (const r of (resData ?? []) as LessonResource[]) {
        if (!resMap[r.lesson_id]) resMap[r.lesson_id] = []
        resMap[r.lesson_id].push(r)
      }
      setResourcesByLesson(resMap)
    }
    setExams((eData ?? []) as CompetencyExam[])
    setLiveClasses(lcData)
    // Soal kuis + soal ujian dimuat setelah kuis/ujian diketahui (butuh id).
    const quizIds = ((qData ?? quizzes) as Quiz[]).map((q) => q.id)
    const examIds = ((eData ?? []) as CompetencyExam[]).map((x) => x.id)
    const [qqData, eqData] = await Promise.all([
      quizIds.length > 0
        ? supabase.from('quiz_questions').select('*').in('quiz_id', quizIds).then((r) => r.data)
        : Promise.resolve(null),
      examIds.length > 0
        ? supabase.from('exam_questions').select('*').in('exam_id', examIds).then((r) => r.data)
        : Promise.resolve(null),
    ])
    if (qqData !== null) setQuizQuestions((qqData ?? []) as QuestionRow[])
    if (eqData !== null) setExamQuestions((eqData ?? []) as QuestionRow[])
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
  // Media lesson untuk form edit: dimuat saat `editing` menunjuk sebuah
  // lesson. Hook di level atas — editForm hanya me-render daftar ini.
  // Saat edit ditutup, file media yang sempat dipilih ikut dibersihkan.
  const editingLessonId = editing?.kind === 'lesson' ? editing.id : null
  useEffect(() => {
    if (!editingLessonId) {
      setEditResources([])
      if (editMediaUrl) URL.revokeObjectURL(editMediaUrl)
      setEditMediaFile(null)
      setEditMediaUrl(null)
      setEditMediaError(null)
      return
    }
    let cancelled = false
    async function loadMedia() {
      setEditResourcesLoading(true)
      const { data, error } = await supabase
        .from('lesson_resources')
        .select('*')
        .eq('lesson_id', editingLessonId)
        .order('created_at', { ascending: true })
      if (cancelled) return
      setEditResourcesLoading(false)
      if (!error) setEditResources((data ?? []) as LessonResource[])
    }
    void loadMedia()
    return () => {
      cancelled = true
    }
  }, [editingLessonId])

  // Cabut object URL pratinjau saat diganti atau saat komponen dilepas.
  useEffect(() => {
    return () => {
      if (resFileUrl) URL.revokeObjectURL(resFileUrl)
    }
  }, [resFileUrl])
  useEffect(() => {
    return () => {
      if (topicFileUrl) URL.revokeObjectURL(topicFileUrl)
    }
  }, [topicFileUrl])
  useEffect(() => {
    return () => {
      if (editMediaUrl) URL.revokeObjectURL(editMediaUrl)
    }
  }, [editMediaUrl])

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

  // (D27) Nomor Pertemuan = posisi lesson dalam daftar datar semua
  // lesson (modul lalu lesson) — sama seperti halaman course
  // (CourseDetailPage: meetingNumber = i + 1).
  const orderedLessons = allLessons
  const meetingOf = (lessonId: string) => orderedLessons.findIndex((l) => l.id === lessonId) + 1
  const managedLesson = orderedLessons.find((l) => l.id === managedLessonId) ?? null

  function toggleGroup(key: string) {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  /** Kelompokkan item per lesson (untuk daftar terlipat); item yang
   *  lesson-nya tidak ditemukan masuk kelompok "Lesson lain". */
  function groupByLesson<T extends { lesson_id: string }>(items: T[]) {
    const map = new Map<string, T[]>()
    for (const it of items) {
      const arr = map.get(it.lesson_id) ?? []
      arr.push(it)
      map.set(it.lesson_id, arr)
    }
    return [...map.entries()].map(([lessonId, list]) => ({
      lesson: orderedLessons.find((l) => l.id === lessonId) ?? null,
      items: list,
    }))
  }

  /** Lompat ke form di bawah (sekaligus mengisi lesson-nya dulu). */
  function jumpToForm(formId: string, preset: () => void) {
    preset()
    requestAnimationFrame(() => {
      document.getElementById(formId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  // (D27) Pindah urutan lesson di dalam modulnya: tukar order_index
  // dengan lesson tetangga. Tanpa migrasi — kolom order_index sudah ada
  // sejak migrasi 001 (urutan tampilan = order_index).
  async function moveLesson(lesson: Lesson, dir: -1 | 1) {
    const siblings = lessonsByModule[lesson.module_id] ?? []
    const idx = siblings.findIndex((l) => l.id === lesson.id)
    const other = siblings[idx + dir]
    if (!other) return
    const { error } = await supabase
      .from('lessons')
      .update({ order_index: other.order_index ?? 0 })
      .eq('id', lesson.id)
    if (error) {
      fail(error)
      return
    }
    const { error: error2 } = await supabase
      .from('lessons')
      .update({ order_index: lesson.order_index ?? 0 })
      .eq('id', other.id)
    if (error2) {
      fail(error2)
      return
    }
    invalidateCatalogCache()
    ok(`Urutan lesson "${lesson.title}" dipindah.`)
    await refresh(currentCourse.id)
  }

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
    // Materi gambar/PDF/video/file butuh sumber: file yang diunggah atau URL.
    const needsSource =
      resKind === 'image' || resKind === 'pdf' || resKind === 'video' || resKind === 'file'
    if (needsSource && !resFile && !resUrl.trim()) {
      setNotice('Pilih file untuk diunggah atau isi URL.')
      return
    }
    const title = resTitle.trim() || (resFile ? titleFromFileName(resFile.name) : '')
    if (!title) {
      setNotice('Isi judul materi dulu.')
      return
    }
    setResUploading(true)
    try {
      let url: string | null = resUrl.trim() || null
      let filePath: string | null = null
      if (resFile) {
        // File diunggah DULU, baru baris materi di-insert (pola mentorGroup).
        const uploaded = await uploadLessonFile(resFile, resLesson, user?.id ?? '')
        url = uploaded.url
        filePath = uploaded.path
      }
      const { error: insErr } = await supabase.from('lesson_resources').insert({
        lesson_id: resLesson,
        kind: resKind,
        title,
        url,
        file_path: filePath,
        body: resBody.trim() || null,
      })
      if (insErr) throw insErr
      if (resFileUrl) URL.revokeObjectURL(resFileUrl)
      setResTitle('')
      setResUrl('')
      setResBody('')
      setResFile(null)
      setResFileUrl(null)
      setResFileError(null)
      ok('Materi lesson ditambahkan.')
    } catch (err) {
      fail(err)
    } finally {
      setResUploading(false)
    }
  }

  // --- Topik Diskusi (D26) -------------------------------------------------
  // Prompt "Topik diskusi" adalah lesson_resources (kind 'reading',
  // title 'Topik diskusi', body = prompt). Satu lesson punya paling
  // banyak satu prompt; bila sudah ada, dimuat untuk diedit (upsert).
  // RLS 003: mentor pengampu course (is_course_teacher) boleh
  // insert/update; admin boleh semuanya.
  async function loadTopicPrompt(lessonId: string) {
    setTopicLesson(lessonId)
    setTopicBody('')
    setTopicExistingId(null)
    setTopicAttachment(null)
    setTopicAttachmentRemoved(false)
    if (topicFileUrl) URL.revokeObjectURL(topicFileUrl)
    setTopicFile(null)
    setTopicFileUrl(null)
    setTopicFileError(null)
    if (!lessonId) return
    setTopicLoading(true)
    try {
      const { data, error } = await supabase
        .from('lesson_resources')
        .select('id,body,url,file_path')
        .eq('lesson_id', lessonId)
        .eq('kind', 'reading')
        .eq('title', 'Topik diskusi')
        .order('created_at', { ascending: true })
        .limit(1)
      if (error) throw error
      const row = (data ?? [])[0] as { id: string; body: string | null; url: string | null; file_path: string | null } | undefined
      if (row) {
        setTopicExistingId(row.id)
        setTopicBody(row.body ?? '')
        if (row.url || row.file_path) setTopicAttachment({ url: row.url, file_path: row.file_path })
      }
    } catch (err) {
      fail(err)
    } finally {
      setTopicLoading(false)
    }
  }

  async function saveTopicPrompt(e: FormEvent) {
    e.preventDefault()
    if (!topicLesson) {
      setNotice('Pilih lesson dulu.')
      return
    }
    const body = topicBody.trim()
    if (!body) {
      setNotice('Isi topik diskusi dulu.')
      return
    }
    setTopicSaving(true)
    try {
      // (D27) Lampiran: file baru diunggah dulu (pola Tambah Materi);
      // file lama diganti/dihapus dari bucket supaya tidak jadi yatim.
      let url = topicAttachment?.url ?? null
      let filePath = topicAttachment?.file_path ?? null
      if (topicAttachmentRemoved) {
        if (filePath) await deleteLessonFile(filePath).catch(() => undefined)
        url = null
        filePath = null
      }
      if (topicFile) {
        const uploaded = await uploadLessonFile(topicFile, topicLesson, user?.id ?? '')
        if (filePath) await deleteLessonFile(filePath).catch(() => undefined)
        url = uploaded.url
        filePath = uploaded.path
      }
      if (topicExistingId) {
        const { error } = await supabase
          .from('lesson_resources')
          .update({ body, url, file_path: filePath })
          .eq('id', topicExistingId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('lesson_resources')
          .insert({
            lesson_id: topicLesson,
            kind: 'reading',
            title: 'Topik diskusi',
            url,
            file_path: filePath,
            body,
          })
          .select('id')
          .single()
        if (error) throw error
        setTopicExistingId((data as { id: string }).id)
      }
      setTopicAttachment(url || filePath ? { url, file_path: filePath } : null)
      setTopicAttachmentRemoved(false)
      if (topicFileUrl) URL.revokeObjectURL(topicFileUrl)
      setTopicFile(null)
      setTopicFileUrl(null)
      setTopicFileError(null)
      ok('Topik diskusi disimpan.')
      await refresh(currentCourse.id)
    } catch (err) {
      fail(err)
    } finally {
      setTopicSaving(false)
    }
  }

  /** File terpilih di form Topik Diskusi: validasi + pratinjau. */
  async function handleTopicFileChange(file: File | null) {
    if (topicFileUrl) URL.revokeObjectURL(topicFileUrl)
    setTopicFile(null)
    setTopicFileUrl(null)
    setTopicFileError(null)
    if (!file) return
    const problem = await validateLessonFile(file, kindForFile(file))
    if (problem) {
      setTopicFileError(problem)
      return
    }
    setTopicFile(file)
    setTopicFileUrl(URL.createObjectURL(file))
  }

  /** Nama file dari path storage lesson/.../<uuid>-<nama-file>. */
  function topicFileName(path: string | null | undefined): string {
    if (!path) return 'Lampiran'
    const base = path.split('/').pop() ?? path
    return base.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '')
  }

  /** Apakah lampiran topik berupa gambar (pratinjau inline) atau file lain. */
  function isTopicImagePath(path: string | null | undefined): boolean {
    return /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(path ?? '')
  }

  /** File terpilih di form Tambah Materi: validasi + pratinjau + sesuaikan Jenis. */
  async function handleResFileChange(file: File | null) {
    if (resFileUrl) URL.revokeObjectURL(resFileUrl)
    setResFile(null)
    setResFileUrl(null)
    setResFileError(null)
    if (!file) return
    const detected = kindForFile(file)
    // File tidak cocok dengan Jenis yang dipilih → ikuti jenis file.
    // 'file' ikut di sini: batas ukuran mengikuti jenis file yang
    // terdeteksi (gambar 10 MB, bukan 20 MB), supaya validasi saat pilih
    // sama dengan validasi saat unggah (uploadLessonFile).
    const effectiveKind =
      (resKind === 'image' || resKind === 'pdf' || resKind === 'video' || resKind === 'file') && detected !== resKind
        ? detected
        : resKind
    if (effectiveKind !== resKind) setResKind(effectiveKind)
    const problem = await validateLessonFile(file, effectiveKind)
    if (problem) {
      setResFileError(problem)
      return
    }
    setResFile(file)
    setResFileUrl(URL.createObjectURL(file))
    if (!resTitle.trim()) setResTitle(titleFromFileName(file.name))
  }

  /** Ganti Jenis di form Tambah Materi: buang file bila tidak cocok lagi. */
  function handleResKindChange(next: LessonResource['kind']) {
    setResKind(next)
    if (resFile && (next === 'reading' || next === 'link' || !fileMatchesKind(resFile, next))) {
      if (resFileUrl) URL.revokeObjectURL(resFileUrl)
      setResFile(null)
      setResFileUrl(null)
      setResFileError(null)
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
      kind: asgKind,
    })
    if (insErr) fail(insErr)
    else {
      setAsgTitle('')
      setAsgDesc('')
      setAsgDue('')
      setAsgKind('weekly')
      ok('Tugas dibuat.')
      await refresh(currentCourse.id)
    }
  }

  async function loadRubric(assignmentId: string) {
    setRubLoading(true)
    try {
      const found = await fetchRubricForAssignment(assignmentId)
      if (found) {
        setRubTitle(found.rubric.title)
        setRubCriteria(
          found.criteria.map((c, i) => ({
            key: `${c.id}-${i}`,
            title: c.title,
            description: c.description ?? '',
            max_score: c.max_score,
          })),
        )
      } else {
        setRubTitle('Rubrik Penilaian')
        setRubCriteria([{ key: `new-${Date.now()}`, title: '', description: '', max_score: 10 }])
      }
    } catch {
      setNotice('Rubrik gagal dimuat, coba lagi sebentar lagi.')
      setRubCriteria([])
    } finally {
      setRubLoading(false)
    }
  }

  function selectRubricAssignment(assignmentId: string) {
    setRubAsg(assignmentId)
    if (assignmentId) void loadRubric(assignmentId)
    else setRubCriteria([])
  }

  async function saveRubricForm(e: FormEvent) {
    e.preventDefault()
    if (!rubAsg) {
      setNotice('Pilih tugas dulu.')
      return
    }
    const filled = rubCriteria.filter((c) => c.title.trim())
    if (filled.length === 0) {
      setNotice('Isi minimal satu kriteria dengan judul.')
      return
    }
    for (const c of filled) {
      if (!Number.isInteger(c.max_score) || c.max_score < 1) {
        setNotice(`Nilai maks. kriteria "${c.title.trim()}" harus bilangan bulat minimal 1.`)
        return
      }
    }
    setRubSaving(true)
    try {
      await saveRubric(
        rubAsg,
        rubTitle.trim() || 'Rubrik Penilaian',
        filled.map((c) => ({
          title: c.title.trim(),
          description: c.description.trim() || null,
          max_score: c.max_score,
        })),
      )
      ok('Rubrik penilaian disimpan.')
    } catch (err) {
      fail(err)
    } finally {
      setRubSaving(false)
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
      kind: quizKind,
    })
    if (insErr) fail(insErr)
    else {
      setQuizTitle('')
      setQuizMax('')
      setQuizKind('quiz')
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
      // P28: urutan soal = jumlah soal yang sudah ada di kuis ini, bukan 0.
      order_index: quizQuestions.filter((qq) => qq.quiz_id === qqQuiz).length,
    })
    if (insErr) fail(insErr)
    else {
      setQqQuestion('')
      setQqOptions('')
      setQqAnswer('')
      setQqExpl('')
      ok('Soal kuis ditambahkan. Jawaban benar hanya terlihat oleh pengajar course / admin — tidak pernah dikirim ke siswa.')
      await refresh(currentCourse.id)
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
      // P28: urutan soal = jumlah soal yang sudah ada di ujian ini, bukan 0.
      order_index: examQuestions.filter((eq) => eq.exam_id === eqExam).length,
    })
    if (insErr) fail(insErr)
    else {
      setEqQuestion('')
      setEqOptions('')
      setEqAnswer('')
      setEqExpl('')
      ok('Soal ujian ditambahkan.')
      await refresh(currentCourse.id)
    }
  }

  async function addLiveClass(e: FormEvent) {
    e.preventDefault()
    if (!lcTitle.trim()) {
      setNotice('Isi judul kelas live dulu.')
      return
    }
    setLcSaving(true)
    try {
      await createLiveClass({
        courseId: currentCourse.id,
        title: lcTitle.trim(),
        scheduledAt: lcScheduled ? new Date(lcScheduled).toISOString() : null,
        meetUrl: lcMeetUrl.trim() || null,
        createdBy: user?.id ?? '',
      })
      setLcTitle('')
      setLcScheduled('')
      setLcMeetUrl('')
      ok('Kelas live dijadwalkan.')
      await refresh(currentCourse.id)
    } catch (err) {
      fail(err)
    } finally {
      setLcSaving(false)
    }
  }

  async function cancelLiveClass(liveClassId: string, title?: string) {
    // P35: batalkan kelas live butuh konfirmasi — sebelumnya satu klik
    // langsung menghapus (materi/pengumuman memakai window.confirm).
    if (!window.confirm(`Batalkan kelas live "${title ?? 'ini'}"? Tindakan ini tidak bisa dibatalkan.`)) return
    try {
      await deleteLiveClass(liveClassId)
      ok('Kelas live dibatalkan.')
      await refresh(currentCourse.id)
    } catch (err) {
      fail(err)
    }
  }

  // --- B32: edit/hapus per item -------------------------------------------
  // Satu state `editing` + draft field dipakai semua jenis item; simpan
  // dan hapus di bawah memakai tabel + patch yang sesuai jenisnya.

  function startEdit(kind: EditingKind, id: string, init: { title?: string; text?: string; url?: string; num?: string; num2?: string; answer?: string; expl?: string; options?: string; qkind?: 'mc' | 'true_false' | 'short' }) {
    setEditing({ kind, id })
    setDraftTitle(init.title ?? '')
    setDraftText(init.text ?? '')
    setDraftUrl(init.url ?? '')
    setDraftNum(init.num ?? '')
    setDraftNum2(init.num2 ?? '')
    setDraftAnswer(init.answer ?? '')
    setDraftExpl(init.expl ?? '')
    setDraftOptions(init.options ?? '')
    setDraftQKind(init.qkind ?? 'mc')
    setNotice(null)
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    const { kind, id } = editing
    const title = draftTitle.trim()
    // Opsi soal pilihan ganda saat edit: diparse dari textarea (satu per
    // baris), sama seperti saat tambah soal.
    const parsedOptions =
      (kind === 'quizQuestion' || kind === 'examQuestion') && draftQKind === 'mc'
        ? draftOptions.split('\n').map((s) => s.trim()).filter(Boolean)
        : null
    if ((kind === 'module' || kind === 'lesson' || kind === 'assignment' || kind === 'quiz' || kind === 'exam') && !title) {
      setNotice('Judul tidak boleh kosong.')
      return
    }
    if (kind === 'quizQuestion' || kind === 'examQuestion') {
      if (!draftText.trim()) {
        setNotice('Pertanyaan tidak boleh kosong.')
        return
      }
      if (!draftAnswer.trim()) {
        setNotice('Jawaban benar tidak boleh kosong.')
        return
      }
      // Soal pilihan ganda: opsi harus ada dan jawaban benar harus cocok
      // dengan salah satu opsi (mencegah jawaban "4" vs opsi "345").
      if (draftQKind === 'mc') {
        if (!parsedOptions || parsedOptions.length === 0) {
          setNotice('Isi minimal 1 pilihan jawaban.')
          return
        }
        if (!parsedOptions.includes(draftAnswer.trim())) {
          setNotice('Jawaban benar harus sama persis dengan salah satu pilihan jawaban.')
          return
        }
      }
    }
    let table = ''
    let patch: Record<string, unknown> = {}
    let doneMsg = ''
    if (kind === 'module') {
      table = 'modules'
      patch = { title }
      doneMsg = 'Judul modul disimpan.'
    } else if (kind === 'lesson') {
      table = 'lessons'
      patch = { title, video_url: draftUrl.trim() || null, content: draftText.trim() || null }
      doneMsg = 'Lesson disimpan.'
    } else if (kind === 'assignment') {
      table = 'assignments'
      patch = {
        title,
        description: draftText.trim() || null,
        max_score: draftNum ? Number(draftNum) : 100,
        due_date: draftNum2 ? new Date(draftNum2).toISOString() : null,
      }
      doneMsg = 'Tugas disimpan.'
    } else if (kind === 'quiz') {
      table = 'quizzes'
      patch = { title, passing_score: draftNum ? Number(draftNum) : 70 }
      doneMsg = 'Kuis disimpan.'
    } else if (kind === 'quizQuestion') {
      table = 'quiz_questions'
      patch = { question: draftText.trim(), correct_answer: draftAnswer.trim(), explanation: draftExpl.trim() || null, ...(parsedOptions ? { options: parsedOptions } : {}) }
      doneMsg = 'Soal kuis disimpan.'
    } else if (kind === 'exam') {
      table = 'competency_exams'
      patch = {
        title,
        description: draftText.trim() || null,
        passing_score: draftNum ? Number(draftNum) : 70,
        max_attempts: draftNum2 ? Number(draftNum2) : null,
      }
      doneMsg = 'Ujian disimpan.'
    } else {
      table = 'exam_questions'
      patch = { question: draftText.trim(), correct_answer: draftAnswer.trim(), explanation: draftExpl.trim() || null, ...(parsedOptions ? { options: parsedOptions } : {}) }
      doneMsg = 'Soal ujian disimpan.'
    }
    const { error: updErr } = await supabase.from(table).update(patch).eq('id', id)
    if (updErr) {
      fail(updErr)
      return
    }
    invalidateCatalogCache()
    setEditing(null)
    ok(doneMsg)
    await refresh(currentCourse.id)
  }

  async function deleteItem(table: string, id: string, label: string) {
    if (!window.confirm(`Hapus ${label}? Tindakan ini tidak bisa dibatalkan.`)) return
    if (deletingId) return
    setDeletingId(id)
    try {
      const { error: delErr } = await supabase.from(table).delete().eq('id', id)
      if (delErr) {
        fail(delErr)
        return
      }
      invalidateCatalogCache()
      ok(`${label} dihapus.`)
      await refresh(currentCourse.id)
    } finally {
      setDeletingId(null)
    }
  }

  // --- Media lesson di form edit (migrasi 062) ---------------------------
  // Daftar media dimuat effect di atas saat `editing` menunjuk lesson.

  async function refreshEditResources(lessonId: string) {
    const { data, error } = await supabase
      .from('lesson_resources')
      .select('*')
      .eq('lesson_id', lessonId)
      .order('created_at', { ascending: true })
    if (!error) setEditResources((data ?? []) as LessonResource[])
  }

  /** File terpilih di seksi Media lesson: validasi + pratinjau. */
  async function handleEditMediaFileChange(file: File | null) {
    if (editMediaUrl) URL.revokeObjectURL(editMediaUrl)
    setEditMediaFile(null)
    setEditMediaUrl(null)
    setEditMediaError(null)
    if (!file) return
    const problem = await validateLessonFile(file, kindForFile(file))
    if (problem) {
      setEditMediaError(problem)
      return
    }
    setEditMediaFile(file)
    setEditMediaUrl(URL.createObjectURL(file))
  }

  /** Unggah media terpilih sebagai materi lesson yang sedang diedit. */
  async function addEditMedia() {
    if (!editing || editing.kind !== 'lesson' || !editMediaFile || !user) return
    const lessonId = editing.id
    setEditMediaUploading(true)
    try {
      const uploaded = await uploadLessonFile(editMediaFile, lessonId, user.id)
      const { error: insErr } = await supabase.from('lesson_resources').insert({
        lesson_id: lessonId,
        kind: kindForFile(editMediaFile),
        title: titleFromFileName(editMediaFile.name),
        url: uploaded.url,
        file_path: uploaded.path,
        body: null,
      })
      if (insErr) throw insErr
      if (editMediaUrl) URL.revokeObjectURL(editMediaUrl)
      setEditMediaFile(null)
      setEditMediaUrl(null)
      setEditMediaError(null)
      ok('Media lesson ditambahkan.')
      await refreshEditResources(lessonId)
    } catch (err) {
      fail(err)
    } finally {
      setEditMediaUploading(false)
    }
  }

  /** Hapus satu media: baris materi + file-nya di bucket (bila ada). */
  async function deleteEditMedia(resource: LessonResource) {
    if (!window.confirm(`Hapus media "${resource.title}"? Tindakan ini tidak bisa dibatalkan.`)) return
    if (editMediaDeletingId) return
    setEditMediaDeletingId(resource.id)
    try {
      const { error: delErr } = await supabase
        .from('lesson_resources')
        .delete()
        .eq('id', resource.id)
      if (delErr) throw delErr
      if (resource.file_path) await deleteLessonFile(resource.file_path)
      ok('Media lesson dihapus.')
      await refreshEditResources(resource.lesson_id)
    } catch (err) {
      fail(err)
    } finally {
      setEditMediaDeletingId(null)
    }
  }
  /** Form edit inline yang dipakai semua jenis item (field disesuaikan). */
  function editForm(kind: EditingKind) {
    const isQuestion = kind === 'quizQuestion' || kind === 'examQuestion'
    return (
      <form
        className="form"
        onSubmit={(e) => void saveEdit(e)}
        style={{ marginTop: '0.5rem' }}
      >
        {isQuestion ? (
          <>
            <label>
              Pertanyaan
              <textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} rows={2} required />
            </label>
            {draftQKind === 'mc' && (
              <label>
                Pilihan jawaban (satu per baris)
                <textarea value={draftOptions} onChange={(e) => setDraftOptions(e.target.value)} rows={4} required />
              </label>
            )}
            <label>
              Jawaban benar (hanya pengajar yang melihat)
              <input value={draftAnswer} onChange={(e) => setDraftAnswer(e.target.value)} required />
            </label>
            <label>
              Penjelasan
              <input value={draftExpl} onChange={(e) => setDraftExpl(e.target.value)} />
            </label>
          </>
        ) : (
          <>
            <label>
              Judul
              <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} required />
            </label>
            {kind === 'lesson' && (
              <>
                <label>
                  URL video (opsional)
                  <input value={draftUrl} onChange={(e) => setDraftUrl(e.target.value)} placeholder="https://…" />
                </label>
                <label>
                  Isi bacaan
                  <textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} rows={3} />
                </label>
                <div>
                  <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Media lesson</p>
                  {editResourcesLoading ? (
                    <p className="muted">Memuat media…</p>
                  ) : (
                    <>
                      {editResources.filter(
                        (r) => r.kind === 'image' || r.kind === 'pdf' || r.kind === 'video' || r.kind === 'file',
                      ).length === 0 ? (
                        <p className="muted">Belum ada media untuk lesson ini.</p>
                      ) : (
                        <ul className="list">
                          {editResources
                            .filter(
                              (r) => r.kind === 'image' || r.kind === 'pdf' || r.kind === 'video' || r.kind === 'file',
                            )
                            .map((r) => (
                              <li key={r.id}>
                                <p>
                                  <strong>{r.title}</strong>{' '}
                                  <span className="muted">
                                    {r.kind === 'image'
                                      ? 'Gambar'
                                      : r.kind === 'pdf'
                                        ? 'PDF'
                                        : r.kind === 'video'
                                          ? 'Video'
                                          : 'File'}
                                  </span>
                                </p>
                                {r.kind === 'image' && r.url ? (
                                  <img src={r.url} alt={r.title} style={{ maxWidth: '100%', maxHeight: 240 }} />
                                ) : null}
                                {r.kind === 'video' && r.url ? (
                                  <video controls preload="metadata" src={r.url} style={{ maxWidth: '100%', maxHeight: 240 }} />
                                ) : null}
                                {r.kind === 'pdf' && r.url ? (
                                  <iframe src={r.url} title={r.title} style={{ width: '100%', height: 320, border: 0 }} />
                                ) : null}
                                {r.kind === 'file' && r.url ? (
                                  <p>
                                    <a href={r.url} target="_blank" rel="noreferrer">
                                      Buka file
                                    </a>
                                  </p>
                                ) : null}
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-small"
                                  disabled={editMediaDeletingId === r.id}
                                  onClick={() => void deleteEditMedia(r)}
                                >
                                  {editMediaDeletingId === r.id ? 'Menghapus…' : 'Hapus'}
                                </button>
                              </li>
                            ))}
                        </ul>
                      )}
                    </>
                  )}
                  <label>
                    Tambah media (gambar / video / PDF)
                    <input
                      type="file"
                      accept="image/*,video/*,application/pdf"
                      onChange={(e) => void handleEditMediaFileChange(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  {editMediaError && <p className="error-box">{editMediaError}</p>}
                  {editMediaFile && editMediaUrl && (
                    <div>
                      <p className="muted">
                        {editMediaFile.name} · {formatFileSize(editMediaFile.size)}
                      </p>
                      {kindForFile(editMediaFile) === 'image' ? (
                        <img src={editMediaUrl} alt={editMediaFile.name} style={{ maxWidth: '100%', maxHeight: 240 }} />
                      ) : kindForFile(editMediaFile) === 'video' ? (
                        <video controls src={editMediaUrl} style={{ maxWidth: '100%', maxHeight: 240 }} />
                      ) : null}
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    disabled={!editMediaFile || editMediaUploading}
                    onClick={() => void addEditMedia()}
                  >
                    {editMediaUploading ? 'Mengunggah…' : 'Tambah media'}
                  </button>
                </div>
              </>
            )}
            {(kind === 'assignment' || kind === 'exam') && (
              <label>
                Deskripsi
                <textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} rows={2} />
              </label>
            )}
            {kind === 'assignment' && (
              <>
                <label>
                  Nilai maks.
                  <input type="number" min={1} value={draftNum} onChange={(e) => setDraftNum(e.target.value)} required />
                </label>
                <label>
                  Tenggat (opsional)
                  <input type="datetime-local" value={draftNum2} onChange={(e) => setDraftNum2(e.target.value)} />
                </label>
              </>
            )}
            {(kind === 'quiz' || kind === 'exam') && (
              <label>
                Nilai lulus
                <input type="number" min={0} max={100} value={draftNum} onChange={(e) => setDraftNum(e.target.value)} required />
              </label>
            )}
            {kind === 'exam' && (
              <label>
                Maks. percobaan (kosong = tanpa batas)
                <input type="number" min={1} value={draftNum2} onChange={(e) => setDraftNum2(e.target.value)} />
              </label>
            )}
          </>
        )}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-small">Simpan</button>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditing(null)}>Batal</button>
        </div>
      </form>
    )
  }

  function editDeleteButtons(kind: EditingKind, id: string, label: string, table: string, init: { title?: string; text?: string; url?: string; num?: string; num2?: string; answer?: string; expl?: string; options?: string; qkind?: 'mc' | 'true_false' | 'short' }) {
    return (
      <>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => startEdit(kind, id, init)}>Edit</button>{' '}
        <button type="button" className="btn btn-ghost btn-small" disabled={deletingId === id} onClick={() => void deleteItem(table, id, label)}>
          {deletingId === id ? 'Menghapus…' : 'Hapus'}
        </button>
      </>
    )
  }

  const rubricAssignment = assignments.find((a) => a.id === rubAsg)
  const rubricTotalMax = rubCriteria.reduce(
    (s, c) => s + (Number.isInteger(c.max_score) && c.max_score > 0 ? c.max_score : 0),
    0,
  )

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

      {/* (D27) Struktur ringkas: modul + lesson dalam urutan Pertemuan
          (sama seperti yang dilihat siswa di halaman course). Tiap baris
          punya tombol ↑ ↓ untuk memindah urutan lesson di dalam modulnya,
          plus Edit/Hapus yang lega (bukan inline sempit). */}
      <section className="section">
        <h2>Struktur Saat Ini</h2>
        <p className="muted">
          Urutan lesson mengikuti nomor Pertemuan di halaman course. Pakai ↑ ↓
          untuk memindah lesson di dalam modulnya.
        </p>
        {modules.length === 0 ? <p className="empty">Belum ada modul.</p> : (
          <ul className="list">
            {modules.map((m) => (
              <li key={m.id} className="builder-structure-module">
                <p><strong>{m.title}</strong></p>
                <div className="form-actions">
                  {editDeleteButtons('module', m.id, `modul "${m.title}"`, 'modules', { title: m.title })}
                </div>
                {editing?.kind === 'module' && editing.id === m.id && editForm('module')}
                <ul className="list">
                  {(lessonsByModule[m.id] ?? []).map((l) => {
                    const siblings = lessonsByModule[m.id] ?? []
                    const idx = siblings.findIndex((x) => x.id === l.id)
                    return (
                      <li key={l.id} className="builder-structure-lesson">
                        <p><strong>Pertemuan {meetingOf(l.id)}</strong> — {l.title}</p>
                        <div className="form-actions">
                          <button type="button" className="btn btn-ghost btn-small" disabled={idx === 0} onClick={() => void moveLesson(l, -1)} title="Pindah ke atas">
                            ↑
                          </button>
                          <button type="button" className="btn btn-ghost btn-small" disabled={idx === siblings.length - 1} onClick={() => void moveLesson(l, 1)} title="Pindah ke bawah">
                            ↓
                          </button>
                          {editDeleteButtons('lesson', l.id, `lesson "${l.title}"`, 'lessons', { title: l.title, text: l.content ?? '', url: l.video_url ?? '' })}
                        </div>
                        {editing?.kind === 'lesson' && editing.id === l.id && editForm('lesson')}
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
        <p className="muted">
          Kuis: {quizzes.length} · Tugas: {assignments.length} · Ujian kompetensi: {exams.length}
        </p>
      </section>

      {/* (D27) Kelola Lesson: pilih satu lesson, lihat dan atur isinya
          (materi, topik diskusi, tugas, kuis) dalam satu tempat — susunan
          mengikuti urutan Pertemuan, bukan per jenis konten. */}
      <section className="section" id="kelola-lesson">
        <h2>Kelola Lesson</h2>
        <p className="muted">
          Pilih satu lesson untuk melihat isinya. Tombol di tiap kartu akan
          mengisi dan menggulir ke form yang bersangkutan di bawah.
        </p>
        <label>
          Lesson
          <select value={managedLessonId} onChange={(e) => setManagedLessonId(e.target.value)} style={selectStyle}>
            <option value="">— Pilih lesson —</option>
            {orderedLessons.map((l) => (
              <option key={l.id} value={l.id}>
                Pertemuan {meetingOf(l.id)} — {l.title}
              </option>
            ))}
          </select>
        </label>
        {managedLesson && (
          <div className="builder-manage">
            <div className="builder-card">
              <h3>Materi</h3>
              {(() => {
                const items = (resourcesByLesson[managedLesson.id] ?? []).filter(
                  (r) => !(r.kind === 'reading' && r.title === 'Topik diskusi'),
                )
                if (items.length === 0) return <p className="muted">Belum ada materi untuk lesson ini.</p>
                return (
                  <ul className="list">
                    {items.map((r) => (
                      <li key={r.id}>
                        <strong>{r.title}</strong>{' '}
                        <span className="muted">
                          {r.kind === 'reading' ? 'Bacaan' : r.kind === 'image' ? 'Gambar' : r.kind === 'pdf' ? 'PDF' : r.kind === 'video' ? 'Video' : r.kind === 'file' ? 'File' : 'Tautan'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )
              })()}
              <div className="form-actions">
                <button type="button" className="btn btn-secondary btn-small" onClick={() => jumpToForm('form-materi', () => setResLesson(managedLesson.id))}>
                  Tambah Materi
                </button>
              </div>
            </div>
            <div className="builder-card">
              <h3>Topik Diskusi</h3>
              {(() => {
                const topic = (resourcesByLesson[managedLesson.id] ?? []).find(
                  (r) => r.kind === 'reading' && r.title === 'Topik diskusi',
                )
                if (!topic) return <p className="muted">Belum ada topik diskusi untuk lesson ini.</p>
                return (
                  <>
                    <p>{topic.body ? `${topic.body.slice(0, 160)}${topic.body.length > 160 ? '…' : ''}` : '(Topik kosong)'}</p>
                    {topic.file_path ? <p className="muted">Lampiran: {topicFileName(topic.file_path)}</p> : null}
                  </>
                )
              })()}
              <div className="form-actions">
                <button type="button" className="btn btn-secondary btn-small" onClick={() => jumpToForm('form-topik', () => void loadTopicPrompt(managedLesson.id))}>
                  Tulis / Edit Topik Diskusi
                </button>
              </div>
            </div>
            <div className="builder-card">
              <h3>Tugas</h3>
              {(() => {
                const items = assignments.filter((a) => a.lesson_id === managedLesson.id)
                if (items.length === 0) return <p className="muted">Belum ada tugas untuk lesson ini.</p>
                return (
                  <ul className="list">
                    {items.map((a) => (
                      <li key={a.id}>
                        <strong>{a.title}</strong> — maks. {a.max_score}
                      </li>
                    ))}
                  </ul>
                )
              })()}
              <div className="form-actions">
                <button type="button" className="btn btn-secondary btn-small" onClick={() => jumpToForm('form-tugas', () => setAsgLesson(managedLesson.id))}>
                  Buat Tugas
                </button>
              </div>
            </div>
            <div className="builder-card">
              <h3>Kuis (Pretest / Posttest)</h3>
              {(() => {
                const items = quizzes.filter((q) => q.lesson_id === managedLesson.id)
                if (items.length === 0) return <p className="muted">Belum ada kuis untuk lesson ini.</p>
                return (
                  <ul className="list">
                    {items.map((q) => (
                      <li key={q.id}>
                        <strong>{q.title}</strong> ({q.kind === 'pretest' ? 'Pretest' : q.kind === 'posttest' ? 'Posttest' : 'Kuis'}) · lulus {q.passing_score}
                      </li>
                    ))}
                  </ul>
                )
              })()}
              <div className="form-actions">
                <button type="button" className="btn btn-secondary btn-small" onClick={() => jumpToForm('form-kuis', () => setQuizLesson(managedLesson.id))}>
                  Buat Kuis
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* (D27) Perkakas level course dilipat secara default supaya halaman
          tidak mengintimidasi saat dibuka. */}
      <details className="section builder-details">
        <summary>Mode Akses Section</summary>
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
      </details>

      <details className="section builder-details">
        <summary>Tambah Modul</summary>
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
      </details>

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

      <section className="section" id="form-materi">
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
            <select value={resKind} onChange={(e) => handleResKindChange(e.target.value as LessonResource['kind'])} style={selectStyle}>
              <option value="reading">Bacaan</option>
              <option value="image">Gambar</option>
              <option value="pdf">PDF</option>
              <option value="video">Video</option>
              <option value="file">File</option>
              <option value="link">Tautan</option>
            </select>
          </label>
          <label>Judul<input value={resTitle} onChange={(e) => setResTitle(e.target.value)} required /></label>
          {(resKind === 'image' || resKind === 'pdf' || resKind === 'video' || resKind === 'file') && (
            <label>
              Upload file (opsional — atau isi URL di bawah)
              <input
                type="file"
                accept={acceptForKind(resKind)}
                onChange={(e) => void handleResFileChange(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
          {resFileError && <p className="error-box">{resFileError}</p>}
          {resFile && resFileUrl && (
            <div>
              <p className="muted">
                {resFile.name} · {formatFileSize(resFile.size)}
              </p>
              {kindForFile(resFile) === 'image' ? (
                <img src={resFileUrl} alt={resFile.name} style={{ maxWidth: '100%', maxHeight: 240 }} />
              ) : kindForFile(resFile) === 'video' ? (
                <video controls src={resFileUrl} style={{ maxWidth: '100%', maxHeight: 240 }} />
              ) : null}
            </div>
          )}
          <label>URL (opsional)<input value={resUrl} onChange={(e) => setResUrl(e.target.value)} placeholder="https://…" /></label>
          <label>Isi / catatan<textarea value={resBody} onChange={(e) => setResBody(e.target.value)} rows={3} /></label>
          <button type="submit" className="btn btn-primary" disabled={resUploading}>
            {resUploading ? 'Mengunggah…' : 'Tambah Materi'}
          </button>
        </form>
      </section>

      {/* (D26) Topik Diskusi — prompt forum per lesson ditulis mentor
          (format Mentari: pengantar + "Studi Kasus" + pertanyaan pemandu).
          Prompt tampil sebagai kartu pembuka thread di Forum Diskusi. */}
      <section className="section" id="form-topik">
        <h2>Topik Diskusi</h2>
        <p className="muted">
          Topik yang dibuka siswa di Forum Diskusi lesson ini. Tulis seperti
          Mentari: pengantar singkat, lalu &quot;Studi Kasus&quot; (skenario dari
          materi lesson), lalu pertanyaan pemandu untuk dijawab siswa. Bila
          lesson sudah punya topik, isinya tampil di bawah untuk diedit —
          topik lama tidak berubah sampai mentor menyimpan yang baru.
        </p>
        <form className="form" onSubmit={saveTopicPrompt}>
          <label>
            Lesson
            <select value={topicLesson} onChange={(e) => void loadTopicPrompt(e.target.value)} required style={selectStyle}>
              <option value="">— Pilih lesson —</option>
              {allLessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
            </select>
          </label>
          {topicLoading ? (
            <p className="muted">Memuat topik…</p>
          ) : (
            <label>
              Topik diskusi
              <textarea
                value={topicBody}
                onChange={(e) => setTopicBody(e.target.value)}
                rows={6}
                required
                placeholder={'Pengantar singkat, lalu Studi Kasus: (skenario dari materi lesson). Lalu pertanyaan pemandu: apa yang akan siswa lakukan dan mengapa?'}
              />
            </label>
          )}
          {/* (D27) Lampiran Topik Diskusi: gambar/file pada prompt — tampil
              di kartu pembuka thread topik (pratinjau bila gambar, tautan
              unduh bila file lain). Memakai ulang jalur upload materi. */}
          {topicAttachment && !topicAttachmentRemoved && (
            <div>
              <p className="muted">Lampiran saat ini: {topicFileName(topicAttachment.file_path)}</p>
              {isTopicImagePath(topicAttachment.file_path) && topicAttachment.url ? (
                <img src={topicAttachment.url} alt={topicFileName(topicAttachment.file_path)} style={{ maxWidth: '100%', maxHeight: 240 }} />
              ) : topicAttachment.url ? (
                <p>
                  <a href={topicAttachment.url} target="_blank" rel="noreferrer">
                    Buka lampiran
                  </a>
                </p>
              ) : null}
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setTopicAttachmentRemoved(true)}>
                Hapus lampiran
              </button>
            </div>
          )}
          <label>
            Lampiran gambar/file (opsional)
            <input
              type="file"
              accept="image/*,video/*,application/pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.txt"
              onChange={(e) => void handleTopicFileChange(e.target.files?.[0] ?? null)}
            />
          </label>
          {topicFileError && <p className="error-box">{topicFileError}</p>}
          {topicFile && topicFileUrl && (
            <div>
              <p className="muted">
                {topicFile.name} · {formatFileSize(topicFile.size)}
              </p>
              {kindForFile(topicFile) === 'image' ? (
                <img src={topicFileUrl} alt={topicFile.name} style={{ maxWidth: '100%', maxHeight: 240 }} />
              ) : kindForFile(topicFile) === 'video' ? (
                <video controls src={topicFileUrl} style={{ maxWidth: '100%', maxHeight: 240 }} />
              ) : null}
            </div>
          )}
          <button type="submit" className="btn btn-primary" disabled={topicSaving || topicLoading}>
            {topicSaving ? 'Menyimpan…' : topicExistingId ? 'Simpan Perubahan Topik' : 'Simpan Topik Diskusi'}
          </button>
        </form>
      </section>

      <section className="section" id="form-tugas">
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
          <label>
            Jenis tugas
            <select value={asgKind} onChange={(e) => setAsgKind(e.target.value as AssignmentKind)} style={selectStyle}>
              <option value="weekly">Tugas mingguan</option>
              <option value="final_practice">Tugas praktik akhir</option>
            </select>
          </label>
          <p className="muted">
            Tugas praktik akhir berbobot 40% di nilai akhir, tugas mingguan 30%.
          </p>
          <label>Deskripsi &amp; rubrik<textarea value={asgDesc} onChange={(e) => setAsgDesc(e.target.value)} rows={3} /></label>
          <label>Nilai maks.<input type="number" min={1} value={asgMax} onChange={(e) => setAsgMax(Number(e.target.value))} required /></label>
          <label>Tenggat (opsional)<input type="datetime-local" value={asgDue} onChange={(e) => setAsgDue(e.target.value)} /></label>
          <button type="submit" className="btn btn-primary">Buat Tugas</button>
        </form>
        {assignments.length > 0 && (
          <>
            <h3>Tugas yang Sudah Dibuat</h3>
            {/* (D27) Dikelompokkan per lesson dan TERLIPAT secara default. */}
            {groupByLesson(assignments).map(({ lesson, items }) => {
              const key = `tugas-${lesson?.id ?? 'lain'}`
              const open = !!openGroups[key]
              const label = lesson ? `Pertemuan ${meetingOf(lesson.id)} — ${lesson.title}` : 'Lesson lain'
              return (
                <div key={key} className="builder-group">
                  <button type="button" className="builder-group-toggle" onClick={() => toggleGroup(key)} aria-expanded={open}>
                    {open ? '▾' : '▸'} {label} ({items.length} tugas)
                  </button>
                  {open && (
                    <ul className="list">
                      {items.map((a) => (
                        <li key={a.id} className="builder-item">
                          <p>
                            <strong>{a.title}</strong> — maks. {a.max_score}
                            {a.due_date ? ` · tenggat ${new Date(a.due_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                          </p>
                          <div className="form-actions">
                            {editDeleteButtons('assignment', a.id, `tugas "${a.title}"`, 'assignments', { title: a.title, text: a.description ?? '', num: String(a.max_score), num2: toLocalInput(a.due_date) })}
                          </div>
                          {editing?.kind === 'assignment' && editing.id === a.id && editForm('assignment')}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </>
        )}
      </section>

      <section className="section">
        <h2>Rubrik Penilaian Tugas</h2>
        <p className="muted">
          Rubrik terstruktur per tugas, dipakai mentor saat menilai. Siswa melihat
          kriteria dan nilai maks. tiap kriteria di halaman tugas.
        </p>
        <form className="form" onSubmit={saveRubricForm}>
          <label>
            Tugas
            <select value={rubAsg} onChange={(e) => selectRubricAssignment(e.target.value)} required style={selectStyle}>
              <option value="">— Pilih tugas —</option>
              {assignments.map((a) => <option key={a.id} value={a.id}>{a.title} (maks. {a.max_score})</option>)}
            </select>
          </label>
          {rubLoading && <p className="muted">Memuat rubrik…</p>}
          {rubAsg && !rubLoading && (
            <>
              <label>Judul rubrik<input value={rubTitle} onChange={(e) => setRubTitle(e.target.value)} /></label>
              {rubCriteria.map((c, idx) => (
                <div key={c.key}>
                  <label>
                    Kriteria {idx + 1} — judul
                    <input
                      value={c.title}
                      onChange={(e) => setRubCriteria((prev) => prev.map((p) => (p.key === c.key ? { ...p, title: e.target.value } : p)))}
                      placeholder="Contoh: Ketepatan isi"
                    />
                  </label>
                  <label>
                    Deskripsi kriteria
                    <input
                      value={c.description}
                      onChange={(e) => setRubCriteria((prev) => prev.map((p) => (p.key === c.key ? { ...p, description: e.target.value } : p)))}
                      placeholder="Apa yang dinilai pada kriteria ini"
                    />
                  </label>
                  <label>
                    Nilai maks.
                    <input
                      type="number"
                      min={1}
                      value={c.max_score}
                      onChange={(e) => setRubCriteria((prev) => prev.map((p) => (p.key === c.key ? { ...p, max_score: Number(e.target.value) } : p)))}
                    />
                  </label>
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => setRubCriteria((prev) => prev.filter((p) => p.key !== c.key))}>
                    Hapus kriteria
                  </button>
                </div>
              ))}
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setRubCriteria((prev) => [...prev, { key: `new-${Date.now()}-${prev.length}`, title: '', description: '', max_score: 10 }])}
                >
                  Tambah Kriteria
                </button>
              </div>
              {rubricAssignment && (
                <p className="muted">
                  Total maks. kriteria: {rubricTotalMax}
                  {rubricTotalMax > rubricAssignment.max_score
                    ? `, melebihi nilai maks. tugas (${rubricAssignment.max_score}), nilai akhir akan dibatasi ke nilai maks. tugas.`
                    : '.'}
                </p>
              )}
              <button type="submit" className="btn btn-primary" disabled={rubSaving}>
                {rubSaving ? 'Menyimpan…' : 'Simpan Rubrik'}
              </button>
            </>
          )}
        </form>
      </section>

      <section className="section" id="form-kuis">
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
          <label>
            Jenis kuis
            <select value={quizKind} onChange={(e) => setQuizKind(e.target.value as QuizKind)} style={selectStyle}>
              <option value="quiz">Kuis</option>
              <option value="pretest">Pretest</option>
              <option value="posttest">Posttest</option>
            </select>
          </label>
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
        {quizzes.length > 0 && (
          <>
            <h3>Kuis yang Sudah Dibuat</h3>
            {/* (D27) Dikelompokkan per lesson dan TERLIPAT secara default;
                soal tiap kuis juga terlipat — tidak pernah tampil semua
                soal terbuka secara default. */}
            {groupByLesson(quizzes).map(({ lesson, items }) => {
              const key = `kuis-${lesson?.id ?? 'lain'}`
              const open = !!openGroups[key]
              const label = lesson ? `Pertemuan ${meetingOf(lesson.id)} — ${lesson.title}` : 'Lesson lain'
              return (
                <div key={key} className="builder-group">
                  <button type="button" className="builder-group-toggle" onClick={() => toggleGroup(key)} aria-expanded={open}>
                    {open ? '▾' : '▸'} {label} ({items.length} kuis)
                  </button>
                  {open && (
                    <ul className="list">
                      {items.map((q) => {
                        const qs = quizQuestions.filter((qq) => qq.quiz_id === q.id)
                        const qKey = `soal-${q.id}`
                        const qOpen = !!openGroups[qKey]
                        return (
                          <li key={q.id} className="builder-item">
                            <p>
                              <strong>{q.title}</strong> ({q.kind === 'pretest' ? 'Pretest' : q.kind === 'posttest' ? 'Posttest' : 'Kuis'}) · lulus {q.passing_score}
                            </p>
                            <div className="form-actions">
                              {editDeleteButtons('quiz', q.id, `kuis "${q.title}"`, 'quizzes', { title: q.title, num: String(q.passing_score) })}
                            </div>
                            {editing?.kind === 'quiz' && editing.id === q.id && editForm('quiz')}
                            {qs.length > 0 && (
                              <>
                                <button type="button" className="builder-group-toggle" onClick={() => toggleGroup(qKey)} aria-expanded={qOpen}>
                                  {qOpen ? '▾' : '▸'} Lihat {qs.length} soal
                                </button>
                                {qOpen && (
                                  <ul className="list">
                                    {qs.map((qq) => (
                                      <li key={qq.id}>
                                        <p>{qq.question}</p>
                                        <div className="form-actions">
                                          {editDeleteButtons('quizQuestion', qq.id, 'soal kuis ini', 'quiz_questions', { text: qq.question, answer: qq.correct_answer ?? '', expl: qq.explanation ?? '', options: (qq.options ?? []).join('\n'), qkind: qq.kind })}
                                        </div>
                                        {editing?.kind === 'quizQuestion' && editing.id === qq.id && editForm('quizQuestion')}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )
            })}
          </>
        )}
      </section>

      {/* (D27) Perkakas level course dilipat secara default. */}
      <details className="section builder-details">
        <summary>Buat Ujian Kompetensi + Soal</summary>
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
        {exams.length > 0 && (
          <>
            <h3>Ujian yang Sudah Dibuat</h3>
            <ul className="list">
              {exams.map((x) => {
                const eqs = examQuestions.filter((eq) => eq.exam_id === x.id)
                const xKey = `ujian-soal-${x.id}`
                const xOpen = !!openGroups[xKey]
                return (
                  <li key={x.id} className="builder-item">
                    <p>
                      <strong>{x.title}</strong> · lulus {x.passing_score}
                      {x.max_attempts ? ` · maks. ${x.max_attempts} percobaan` : ''}
                    </p>
                    <div className="form-actions">
                      {editDeleteButtons('exam', x.id, `ujian "${x.title}"`, 'competency_exams', { title: x.title, text: x.description ?? '', num: String(x.passing_score), num2: x.max_attempts ? String(x.max_attempts) : '' })}
                    </div>
                    {editing?.kind === 'exam' && editing.id === x.id && editForm('exam')}
                    {eqs.length > 0 && (
                      <>
                        <button type="button" className="builder-group-toggle" onClick={() => toggleGroup(xKey)} aria-expanded={xOpen}>
                          {xOpen ? '▾' : '▸'} Lihat {eqs.length} soal
                        </button>
                        {xOpen && (
                          <ul className="list">
                            {eqs.map((eq) => (
                              <li key={eq.id}>
                                <p>{eq.question}</p>
                                <div className="form-actions">
                                  {editDeleteButtons('examQuestion', eq.id, 'soal ujian ini', 'exam_questions', { text: eq.question, answer: eq.correct_answer ?? '', expl: eq.explanation ?? '', options: (eq.options ?? []).join('\n'), qkind: eq.kind })}
                                </div>
                                {editing?.kind === 'examQuestion' && editing.id === eq.id && editForm('examQuestion')}
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </details>

      <details className="section builder-details">
        <summary>Kelas Live</summary>
        <p className="muted">
          Jadwalkan sesi tatap muka daring untuk course ini. Siswa yang terdaftar
          bisa melihat jadwal dan tautan meet-nya.
        </p>
        <form className="form" onSubmit={addLiveClass}>
          <label>Judul kelas live<input value={lcTitle} onChange={(e) => setLcTitle(e.target.value)} required placeholder="Contoh: Bedah Naskah Bareng Mentor" /></label>
          <label>Jadwal (opsional)<input type="datetime-local" value={lcScheduled} onChange={(e) => setLcScheduled(e.target.value)} /></label>
          <label>Tautan meet (opsional)<input type="url" value={lcMeetUrl} onChange={(e) => setLcMeetUrl(e.target.value)} placeholder="https://…" /></label>
          <button type="submit" className="btn btn-primary" disabled={lcSaving}>
            {lcSaving ? 'Menyimpan…' : 'Jadwalkan Kelas Live'}
          </button>
        </form>
        {liveClasses.length === 0 ? (
          <p className="empty">Belum ada kelas live terjadwal.</p>
        ) : (
          <ul>
            {liveClasses.map((lc) => (
              <li key={lc.id}>
                <strong>{lc.title}</strong>
                {' — '}
                {lc.scheduled_at
                  ? new Date(lc.scheduled_at).toLocaleString('id-ID', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Jadwal belum ditentukan'}
                {lc.meet_url && (
                  <>
                    {' · '}
                    <a href={lc.meet_url} target="_blank" rel="noreferrer">Buka tautan meet</a>
                  </>
                )}
                {' '}
                <button type="button" className="btn btn-ghost btn-small" onClick={() => void cancelLiveClass(lc.id, lc.title)}>
                  Batalkan
                </button>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  )
}
