// SINEVERSE, Halaman lesson — ALUR MENTARI 11 LANGKAH (pilot, RENCANA.md):
// Pretest → Materi (Buku ISBN → Video Ajar → Power Point → Artikel Riset →
// Materi Lainnya) → Penugasan Terstruktur → LINK VCON → Forum Diskusi →
// Posttest → Kuesioner. Tiap langkah terkunci sampai langkah sebelumnya
// selesai (hanya untuk siswa peserta; admin/mentor tidak dikunci).
// Embed video (YouTube/Vimeo) atau kartu tautan eksternal, navigasi
// prev/next, "Tandai Selesai", dan diskusi lesson gaya Mentari (pengantar +
// tabel Topik + tampilan thread + lampiran gambar/file).
//
// Akses: lesson hanya untuk peserta course, mentor pengampu, atau admin.
// Companion fetch (tugas, kuis, diskusi, progres) dimuat independen:
// satu gagal tidak boleh menenggelamkan lesson.
import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import CourseIndexDrawer from '../components/CourseIndexDrawer'
import Icon from '../components/icons'
import { useAuth } from '../context/AuthContext'
import {
  fetchAssignmentsForLessons,
  fetchCourse,
  fetchCourseLessons,
  fetchDiscussionAttachments,
  fetchDiscussions,
  fetchEnrollment,
  fetchLesson,
  fetchLessonProgress,
  fetchLessonProgressFor,
  fetchLessonResources,
  fetchLessons,
  fetchLiveClasses,
  fetchModules,
  fetchProfileNames,
  fetchQuestionnaireQuestions,
  fetchQuestionnaireResponses,
  fetchQuestionnairesForLessons,
  fetchQuizAttempts,
  fetchQuizzesForLessons,
  fetchSubmissions,
  markLessonCompleted,
  markLessonStarted,
  postDiscussion,
  sendNotification,
  submitQuestionnaireResponse,
  supabase,
} from '../lib/supabase'
import {
  DiscussionAttachmentError,
  formatAttachmentSize,
  isImageAttachment,
  uploadDiscussionAttachment,
} from '../lib/discussionAttachments'
import { isMissingTableError } from '../lib/guarded'
import type {
  Assignment,
  Discussion,
  DiscussionAttachment,
  Lesson,
  LessonProgressStatus,
  LessonResource,
  LiveClass,
  Questionnaire,
  QuestionnaireQuestion,
  QuestionnaireResponse,
  Quiz,
  QuizAttempt,
} from '../lib/types'

function videoEmbed(url: string): { kind: 'youtube' | 'vimeo' | 'link'; embedUrl?: string } {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  if (yt) return { kind: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${yt[1]}` }
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vm) return { kind: 'vimeo', embedUrl: `https://player.vimeo.com/video/${vm[1]}` }
  return { kind: 'link' }
}

/** (D24.2) Sapaan menurut jam saat halaman dibuka: pagi 04–11, siang
    11–15, sore 15–19, malam selebihnya. */
function greetingForHour(hour: number): string {
  if (hour >= 4 && hour < 11) return 'Selamat pagi'
  if (hour >= 11 && hour < 15) return 'Selamat siang'
  if (hour >= 15 && hour < 19) return 'Selamat sore'
  return 'Selamat malam'
}

/** (D24.14) Format closes_at ala Mentari: "Sabtu, 28 November 2026,
    pukul 19.00 WIB" (id-ID, zona Asia/Jakarta). */
function formatClosesAt(iso: string): string {
  const d = new Date(iso)
  const datePart = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(d)
  const timePart = new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  }).format(d).replace(':', '.')
  return `${datePart}, pukul ${timePart} WIB`
}

/** (D24.14) Nilai input datetime-local (waktu lokal perangkat) dari
    closes_at ISO. Dipakai mengisi draft editor mentor/admin. */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function LessonDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, profile } = useAuth()

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [courseId, setCourseId] = useState<string | null>(null)
  const [courseTitle, setCourseTitle] = useState<string>('')
  const [siblings, setSiblings] = useState<Lesson[]>([])
  const [status, setStatus] = useState<LessonProgressStatus>('not_started')
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([])
  const [discussions, setDiscussions] = useState<Discussion[]>([])
  const [resources, setResources] = useState<LessonResource[]>([])
  const [resourcesError, setResourcesError] = useState<string | null>(null)
  const [sequentialLocked, setSequentialLocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [access, setAccess] = useState<'checking' | 'allowed' | 'locked'>('checking')
  const [lockedReason, setLockedReason] = useState<string | null>(null)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [quizError, setQuizError] = useState<string | null>(null)
  const [discussionError, setDiscussionError] = useState<string | null>(null)
  const [submittedAssignment, setSubmittedAssignment] = useState(false)
  const [saving, setSaving] = useState(false)
  // Mentari 11 langkah: kuesioner (084), kelas live (015), lampiran diskusi (086).
  const [mentorId, setMentorId] = useState<string | null>(null)
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([])
  const [questionnaireQuestions, setQuestionnaireQuestions] = useState<QuestionnaireQuestion[]>([])
  const [questionnaireResponses, setQuestionnaireResponses] = useState<QuestionnaireResponse[]>([])
  const [questionnaireError, setQuestionnaireError] = useState<string | null>(null)
  const [questionnaireAnswers, setQuestionnaireAnswers] = useState<Record<string, boolean>>({})
  const [questionnaireSubmitting, setQuestionnaireSubmitting] = useState(false)
  const [liveClasses, setLiveClasses] = useState<LiveClass[]>([])
  const [liveClassesError, setLiveClassesError] = useState<string | null>(null)
  const [vconAcknowledged, setVconAcknowledged] = useState(false)
  const [attachments, setAttachments] = useState<DiscussionAttachment[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  // (D26) Thread topik: dibuka dari baris prompt tabel Topik — kartu
  // pembuka = prompt "Topik diskusi" (penulis = mentor pengampu), lalu
  // postingan top-level sebagai balasannya.
  const [promptThreadOpen, setPromptThreadOpen] = useState(false)
  // (D26) Nama mentor pengampu (untuk kartu pembuka thread topik).
  const [mentorName, setMentorName] = useState<string | null>(null)
  const [newPostFile, setNewPostFile] = useState<File | null>(null)
  const [replyFile, setReplyFile] = useState<File | null>(null)

  const [newPost, setNewPost] = useState('')
  // Ref textarea form diskusi baru.
  const newPostRef = useRef<HTMLTextAreaElement | null>(null)
  const [discussionQuery, setDiscussionQuery] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [helpfulCounts, setHelpfulCounts] = useState<Record<string, number>>({})
  const [helpfulMine, setHelpfulMine] = useState<Set<string>>(new Set())
  const [reportingId, setReportingId] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState('')
  // (D24.14) Tanggal penutupan forum (lessons.closes_at, migrasi 087):
  // draft input datetime-local + status simpan; hanya mentor pengampu/admin.
  const [closesAtDraft, setClosesAtDraft] = useState('')
  const [savingClosesAt, setSavingClosesAt] = useState(false)
  // (D24.13) Drawer Course Index.
  const [indexOpen, setIndexOpen] = useState(false)

  const canModerate = profile?.role === 'mentor' || profile?.role === 'admin'
  // Mode pantau (migrasi 022): admin boleh MEMBUKA lesson untuk memantau,
  // tetapi tidak boleh menandai selesai, mengerjakan kuis/tugas, atau
  // ikut berdiskusi sebagai peserta.
  const isAdmin = profile?.role === 'admin'

  // Reaksi "bermanfaat" (tabel discussion_reactions, migrasi 003).
  // Bila tabel belum ada, diskusi tetap jalan tanpa hitungan reaksi.
  useEffect(() => {
    if (discussions.length === 0) return
    let cancelled = false
    async function loadReactions() {
      try {
        const { data, error } = await supabase
          .from('discussion_reactions')
          .select('discussion_id,user_id')
          .in('discussion_id', discussions.map((d) => d.id))
        if (error || !data || cancelled) return
        const counts: Record<string, number> = {}
        const mine = new Set<string>()
        for (const r of data as { discussion_id: string; user_id: string }[]) {
          counts[r.discussion_id] = (counts[r.discussion_id] ?? 0) + 1
          if (user && r.user_id === user.id) mine.add(r.discussion_id)
        }
        setHelpfulCounts(counts)
        setHelpfulMine(mine)
      } catch {
        // Tabel belum ada, abaikan, diskusi tetap tampil.
      }
    }
    void loadReactions()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discussions.length, user?.id])

  // (D26b) Nama mentor pengampu untuk kartu pembuka thread topik
  // ("Topik diskusi" ditulis mentor). WAJIB lewat public_profiles
  // (fetchProfileNames), BUKAN fetchProfile('profiles'): RLS profiles
  // menutup baris pengguna lain, sehingga siswa selalu mendapat null
  // dan kartu hanya tampil "Mentor". Gagal muat → tampil "Mentor".
  useEffect(() => {
    if (!mentorId) return
    let cancelled = false
    void fetchProfileNames([mentorId])
      .then((m) => {
        if (!cancelled) setMentorName(m.get(mentorId) ?? null)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [mentorId])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setAccess('checking')
      setAssignError(null)
      setQuizError(null)
      setDiscussionError(null)
      setResources([])
      setResourcesError(null)
      setSequentialLocked(false)
      setSubmittedAssignment(false)
      // Reset status + konten lesson sebelumnya: tanpa ini, pindah lesson
      // di komponen yang sama menampilkan status/konten lesson lama
      // (mis. "Status: Selesai" padahal lesson baru belum selesai) sampai
      // fetch progres lesson baru selesai.
      setStatus('not_started')
      setAssignments([])
      setQuizzes([])
      setQuizAttempts([])
      setDiscussions([])
      setSiblings([])
      setNotice(null)
      setLockedReason(null)
      setMentorId(null)
      setQuestionnaires([])
      setQuestionnaireQuestions([])
      setQuestionnaireResponses([])
      setQuestionnaireError(null)
      setQuestionnaireAnswers({})
      setLiveClasses([])
      setLiveClassesError(null)
      setVconAcknowledged(false)
      setAttachments([])
      setSelectedThreadId(null)
      setNewPostFile(null)
      setReplyFile(null)
      setClosesAtDraft('')
      setSavingClosesAt(false)

      // 1. Lesson dulu. Hanya kegagalan di sini yang boleh menampilkan
      // error seluruh halaman.
      let l: Lesson
      try {
        const fetched = await fetchLesson(id as string)
        if (!fetched) {
          if (!cancelled) {
            setError('Lesson tidak ditemukan.')
            setLoading(false)
          }
          return
        }
        l = fetched
      } catch {
        if (!cancelled) {
          setError('Gagal memuat lesson. Periksa koneksi lalu coba lagi.')
          setLoading(false)
        }
        return
      }
      if (cancelled) return
      setLesson(l)
      // (D24.14) Isi draft editor tanggal penutupan dari closes_at lesson.
      setClosesAtDraft(l.closes_at ? toLocalInputValue(l.closes_at) : '')

      // 2. Resolve course (module → course), lalu cek akses. Tamu dan
      // pengguna yang tidak terdaftar tidak boleh melihat isi lesson.
      let courseInfo: { courseId: string; courseTitle: string } | null = null
      try {
        courseInfo = await fetchModulesByLessonModule(l.module_id)
      } catch {
        courseInfo = null
      }
      if (cancelled) return
      if (!courseInfo) {
        setAccess('locked')
        setLoading(false)
        return
      }
      setCourseId(courseInfo.courseId)
      setCourseTitle(courseInfo.courseTitle)

      let allowed = false
      if (user) {
        if (profile?.role === 'admin') {
          allowed = true
        } else {
          try {
            const course = await fetchCourse(courseInfo.courseId)
            if (course?.mentor_id && !cancelled) setMentorId(course.mentor_id)
            if (course && course.mentor_id === user.id) {
              allowed = true
            } else if (course && !course.mentor_id) {
              // Master Prompt §3: siswa belum boleh memulai course sebelum
              // mentor ditetapkan — berlaku juga untuk akses langsung via URL,
              // bukan hanya lewat tautan lesson di halaman course.
              setLockedReason('Course ini belum memiliki mentor — lesson belum bisa dimulai.')
              allowed = false
            } else {
              try {
                const enr = await fetchEnrollment(user.id, courseInfo.courseId)
                if (enr) allowed = true
              } catch {
                allowed = false
              }
            }
          } catch {
            allowed = false
          }
        }
      }
      if (cancelled) return
      if (!allowed) {
        setAccess('locked')
        setLoading(false)
        return
      }
      setAccess('allowed')

      // 3. Companion fetch, masing-masing independen dan PARALEL.
      // Satu gagal hanya menampilkan notice kecil di seksinya, bukan
      // error halaman. Kuis/tugas dibutuhkan tahap berikutnya, jadi
      // hasilnya disimpan ke variabel lokal juga.
      let assigns: Assignment[] = []
      // Thread diskusi + kuesioner lesson disimpan ke variabel lokal juga:
      // lampiran + pertanyaan kuesioner dimuat tahap berikutnya.
      let threadsLocal: Discussion[] = []
      let qnrsLocal: Questionnaire[] = []
      // Kunci berurutan (migrasi 013): hanya untuk peserta biasa, bukan
      // admin / mentor pengampu. Gagal membaca mode akses = fail-open:
      // lesson tetap tampil, tidak terkunci.
      let seqLocked = false
      {
        const [, assignsRes, , threadsRes, , , qnrsRes] = await Promise.all([
          (async () => {
            try {
              const sibs = await fetchCourseLessons(courseInfo.courseId)
              if (!cancelled) setSiblings(sibs)
            } catch {
              if (!cancelled) setSiblings([])
            }
          })(),
          (async () => {
            try {
              const a = await fetchAssignmentsForLessons([l.id])
              if (!cancelled) setAssignments(a)
              return a
            } catch {
              if (!cancelled) setAssignError('Tugas gagal dimuat. Coba muat ulang halaman.')
              return [] as Assignment[]
            }
          })(),
          (async () => {
            try {
              const q = await fetchQuizzesForLessons([l.id])
              if (!cancelled) setQuizzes(q)
              return q
            } catch {
              if (!cancelled) setQuizError('Kuis gagal dimuat. Coba muat ulang halaman.')
              return [] as Quiz[]
            }
          })(),
          (async () => {
            try {
              const threads = await fetchDiscussions(l.id)
              if (!cancelled) setDiscussions(threads)
              return threads
            } catch {
              if (!cancelled) setDiscussionError('Diskusi gagal dimuat. Coba muat ulang halaman.')
              return [] as Discussion[]
            }
          })(),
          (async () => {
            // Materi tambahan: gagal dimuat tidak boleh merusak halaman.
            try {
              const res = await fetchLessonResources(l.id)
              if (!cancelled) setResources(res)
            } catch {
              if (!cancelled) setResourcesError('Materi tambahan gagal dimuat.')
            }
          })(),
          (async () => {
            // Kunci Section 2 (mode 'sequential'): Section 2 (modul
            // order_index 2) terkunci sampai seluruh lesson Section 1
            // (modul order_index 1) selesai.
            try {
              if (!user || profile?.role === 'admin') return
              const course = await fetchCourse(courseInfo.courseId)
              if (!course || (course.access_mode ?? 'direct') !== 'sequential') return
              if (course.mentor_id === user.id) return
              const mods = await fetchModules(courseInfo.courseId)
              const myMod = mods.find((m) => m.id === l.module_id)
              if (!myMod || myMod.order_index !== 2) return
              const section1 = mods.find((m) => m.order_index === 1)
              if (!section1) return
              const s1Lessons = await fetchLessons(section1.id)
              if (s1Lessons.length === 0) return
              const prog = await fetchLessonProgress(user.id)
              const done = new Set(
                prog.filter((p) => p.status === 'completed').map((p) => p.lesson_id),
              )
              if (!s1Lessons.every((sl) => done.has(sl.id))) seqLocked = true
            } catch {
              // Fail-open: kunci tidak diterapkan bila datanya gagal dibaca.
            }
          })(),
          (async () => {
            // Kuesioner lesson ini (migrasi 084): satu per lesson.
            try {
              const qnrs = await fetchQuestionnairesForLessons([l.id])
              if (!cancelled) setQuestionnaires(qnrs)
              return qnrs
            } catch (err) {
              if (!cancelled) {
                setQuestionnaireError(
                  isMissingTableError(err)
                    ? 'Kuesioner belum tersedia (migrasi 084 belum dijalankan).'
                    : 'Kuesioner gagal dimuat. Coba muat ulang halaman.',
                )
              }
              return [] as Questionnaire[]
            }
          })(),
          (async () => {
            // Kelas live course ini (migrasi 015): dipakai langkah LINK VCON.
            try {
              const lcs = await fetchLiveClasses(courseInfo.courseId)
              if (!cancelled) setLiveClasses(lcs)
              return lcs
            } catch {
              if (!cancelled) setLiveClassesError('Kelas live gagal dimuat.')
              return [] as LiveClass[]
            }
          })(),
        ])
        assigns = assignsRes
        threadsLocal = threadsRes
        qnrsLocal = qnrsRes
      }

      if (seqLocked) {
        if (!cancelled) {
          setSequentialLocked(true)
          setLoading(false)
        }
        return
      }

      if (user) {
        // Progres, percobaan kuis, dan submission independen satu sama
        // lain — dimuat paralel. markLessonStarted fire-and-forget:
        // status jadi in_progress saat berhasil, tanpa memblokir render.
        await Promise.all([
          (async () => {
            try {
              const prog = await fetchLessonProgressFor(user.id, l.id)
              if (cancelled) return
              if (prog) setStatus(prog.status)
              if (!prog || prog.status === 'not_started') {
                void markLessonStarted(user.id, l.id)
                  .then(() => {
                    if (!cancelled) setStatus('in_progress')
                  })
                  .catch(() => {
                    // Gagal menandai mulai: lesson tetap tampil, status apa adanya.
                  })
              }
            } catch {
              // Progres gagal dimuat: lesson tetap tampil tanpa status.
            }
          })(),
          (async () => {
            try {
              const attempts = await fetchQuizAttempts(user.id)
              if (!cancelled) setQuizAttempts(attempts)
            } catch {
              // Percobaan gagal dimuat: derivasi langkah kuis fail-open.
            }
          })(),
          (async () => {
            try {
              const subs = await fetchSubmissions(user.id)
              if (!cancelled) {
                const assignIds = new Set(assigns.map((a) => a.id))
                setSubmittedAssignment(subs.some((s) => assignIds.has(s.assignment_id)))
              }
            } catch {
              if (!cancelled) setSubmittedAssignment(false)
            }
          })(),
          (async () => {
            // Kuesioner: pertanyaan + respons milik user (bila ada kuesioner).
            if (qnrsLocal.length === 0) return
            try {
              const [qq, rr] = await Promise.all([
                fetchQuestionnaireQuestions(qnrsLocal[0].id),
                fetchQuestionnaireResponses(user.id),
              ])
              if (cancelled) return
              setQuestionnaireQuestions(qq)
              setQuestionnaireResponses(rr.filter((r) => r.questionnaire_id === qnrsLocal[0].id))
            } catch (err) {
              if (!cancelled) {
                setQuestionnaireError(
                  isMissingTableError(err)
                    ? 'Kuesioner belum tersedia (migrasi 084 belum dijalankan).'
                    : 'Kuesioner gagal dimuat. Coba muat ulang halaman.',
                )
              }
            }
          })(),
          (async () => {
            // Lampiran diskusi (migrasi 086): gagal dimuat bukan error halaman.
            if (threadsLocal.length === 0) return
            try {
              const atts = await fetchDiscussionAttachments(threadsLocal.map((d) => d.id))
              if (!cancelled) setAttachments(atts)
            } catch {
              if (!cancelled) setAttachments([])
            }
          })(),
        ])
      }

      if (!cancelled) setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id, profile?.role])

  if (loading || access === 'checking') {
    return (
      <div className="page">
        <p className="muted">Memuat lesson…</p>
      </div>
    )
  }

  if (error || !lesson) {
    return (
      <div className="page">
        <p className="error-box">{error ?? 'Lesson tidak ditemukan.'}</p>
        <Link to="/akademi">Kembali ke Akademi</Link>
      </div>
    )
  }

  if (access === 'locked') {
    return (
      <div className="page">
        <p className="error-box">{lockedReason ?? 'Lesson ini hanya untuk peserta course.'}</p>
        {courseId ? (
          <Link to={`/course/${courseId}`}>
            Buka halaman course{courseTitle ? `: ${courseTitle}` : ''}
          </Link>
        ) : (
          <Link to="/akademi">Kembali ke Akademi</Link>
        )}
      </div>
    )
  }

  if (sequentialLocked) {
    return (
      <div className="page">
        <p className="error-box">Section 2 terkunci. Selesaikan dulu seluruh lesson di Section 1.</p>
        {courseId ? (
          <Link to={`/course/${courseId}`}>
            Buka halaman course{courseTitle ? `: ${courseTitle}` : ''}
          </Link>
        ) : (
          <Link to="/akademi">Kembali ke Akademi</Link>
        )}
      </div>
    )
  }

  const idx = siblings.findIndex((l) => l.id === lesson.id)
  const prev = idx > 0 ? siblings[idx - 1] : null
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null
  // (D23) Nomor pertemuan = posisi 1-based lesson di dalam course
  // (siblings sudah urut modul + order_index via fetchCourseLessons).
  // BUKAN lesson.order_index mentah (Orientasi order_index 0 → jangan
  // tampil "Pertemuan 0"). null bila posisi tidak diketahui (siblings
  // gagal dimuat): judul tampil tanpa nomor, tanpa mengarang angka.
  const meetingNumber = idx >= 0 ? idx + 1 : null
  // (D24.2) Sapaan forum menurut jam saat halaman dibuka.
  const greeting = greetingForHour(new Date().getHours())
  // (D24.14) Yang boleh mengatur tanggal penutupan forum: admin, atau
  // mentor pengampu course ini (bukan siswa, bukan mentor lain).
  const canEditClosesAt = isAdmin || (user !== null && mentorId !== null && mentorId === user.id)
  const embed = lesson.video_url ? videoEmbed(lesson.video_url) : null
  const topLevel = [...discussions.filter((d) => d.parent_id === null)].sort(
    (a, b) => Number(b.is_pinned ?? false) - Number(a.is_pinned ?? false),
  )
  const replies = (parentId: string) => discussions.filter((d) => d.parent_id === parentId)

  // Pencarian diskusi (client-side, tidak mengubah fetch): cocok bila isi
  // atau nama penulis thread cocok, atau bila ada balasan di thread itu
  // yang cocok. Urutan sematan dari topLevel dipertahankan.
  const searchText = discussionQuery.trim().toLowerCase()
  const visibleTopLevel = searchText
    ? topLevel.filter((d) => {
        const threadText = `${d.body} ${d.author?.name ?? ''}`.toLowerCase()
        if (threadText.includes(searchText)) return true
        return replies(d.id).some((r) =>
          `${r.body} ${r.author?.name ?? ''}`.toLowerCase().includes(searchText),
        )
      })
    : topLevel

  // Kuis dipisah menurut jenisnya (migrasi 015): kuis lama tanpa kind
  // dibaca sebagai 'quiz'. Satu kuis hanya muncul di satu seksi.
  const pretests = quizzes.filter((q) => (q.kind ?? 'quiz') === 'pretest')
  const posttests = quizzes.filter((q) => (q.kind ?? 'quiz') === 'posttest')
  const plainQuizzes = quizzes.filter((q) => (q.kind ?? 'quiz') === 'quiz')

  // --- Derivasi status 11 langkah Mentari (RENCANA.md §2) ---
  // Kunci hanya berlaku untuk siswa peserta (bukan admin, bukan mentor
  // pengampu course). Fail-open: langkah yang datanya gagal dimuat, atau
  // yang tidak punya konten, dianggap selesai supaya lesson tidak macet.
  const applyLocks = !!user && !isAdmin && mentorId !== user.id
  const attemptedQuiz = (list: Quiz[]) =>
    list.some((q) => quizAttempts.some((a) => a.quiz_id === q.id))
  const pretestDone = pretests.length === 0 || attemptedQuiz(pretests) || !!quizError
  const materiDone = status === 'in_progress' || status === 'completed'
  const tugasDone = assignments.length === 0 || submittedAssignment || !!assignError
  const upcomingLive = liveClasses.filter(
    (lc) => lc.scheduled_at && new Date(lc.scheduled_at).getTime() >= Date.now(),
  )
  const vconDone = upcomingLive.length === 0 || vconAcknowledged || !!liveClassesError
  const myDiscussionCount = user
    ? discussions.filter((d) => d.user_id === user.id).length
    : 0
  const diskusiDone = myDiscussionCount >= 2 || !!discussionError
  const posttestDone = posttests.length === 0 || attemptedQuiz(posttests) || !!quizError
  const questionnaire = questionnaires[0] ?? null
  const myQuestionnaireResponse = questionnaire
    ? questionnaireResponses.find((r) => r.questionnaire_id === questionnaire.id) ?? null
    : null
  const kuesionerDone = myQuestionnaireResponse !== null || !!questionnaireError
  // Kehadiran 1 pertemuan = langkah 1 s.d. 10 (Pre Test s.d. Post Test).
  const attendanceDone =
    pretestDone && materiDone && tugasDone && vconDone && diskusiDone && posttestDone
  const unfinishedSteps: string[] = []
  if (!pretestDone) unfinishedSteps.push('Pretest')
  if (!materiDone) unfinishedSteps.push('Materi')
  if (!tugasDone) unfinishedSteps.push('Penugasan Terstruktur')
  if (!vconDone) unfinishedSteps.push('LINK VCON')
  if (!diskusiDone) unfinishedSteps.push('Forum Diskusi')
  if (!posttestDone) unfinishedSteps.push('Posttest')

  // Kunci per langkah: langkah N terkunci sampai langkah N-1 selesai.
  const lockedMateri = applyLocks && !pretestDone
  const lockedTugas = applyLocks && !materiDone
  const lockedVcon = applyLocks && !tugasDone
  const lockedDiskusi = applyLocks && !vconDone
  const lockedPosttest = applyLocks && !diskusiDone
  const lockedKuesioner = applyLocks && !posttestDone

  // Perangkat Pembelajaran (langkah 2-6) dipetakan dari lesson_resources
  // menurut kind (D20): reading → Buku ISBN; video → Video Ajar;
  // pdf → Power Point; link → Artikel Riset; image/file → Materi Lainnya.
  // Resource 'Topik diskusi' disembunyikan di sini (tampil di Forum Diskusi).
  const discussionPrompt = resources.find(
    (r) => r.kind === 'reading' && r.title === 'Topik diskusi',
  )
  const materiResources = resources.filter((r) => r !== discussionPrompt)
  const bukuResources = materiResources.filter((r) => r.kind === 'reading')
  const videoResources = materiResources.filter((r) => r.kind === 'video')
  const pptResources = materiResources.filter((r) => r.kind === 'pdf')
  const artikelResources = materiResources.filter((r) => r.kind === 'link')
  const lainResources = materiResources.filter((r) => r.kind === 'image' || r.kind === 'file')

  // Badge peran di forum (D26, keputusan Arif 28 Nov 2026; label diubah
  // 28 Nov 08:57 atas perintah Arif: JANGAN pakai "Dosen"/"Mahasiswa"):
  // profiles.role penulis — siswa = "Siswa", mentor = "Mentor",
  // admin = "Admin". Bila role tidak tersedia (baris baru yang author-nya
  // diisi client-side tanpa role), pakai perbandingan mentorId sebagai
  // fallback (mentor course = "Mentor", sisanya "Siswa").
  const roleBadge = (d: Discussion) => {
    const role = d.author?.role
    if (role === 'mentor') return 'Mentor'
    if (role === 'admin') return 'Admin'
    if (role === 'siswa') return 'Siswa'
    return d.user_id === mentorId ? 'Mentor' : 'Siswa'
  }

  const excerpt = (text: string, n = 80) =>
    text.length > n ? `${text.slice(0, n).trim()}…` : text

  const attachmentFor = (discussionId: string) =>
    attachments.find((a) => a.discussion_id === discussionId) ?? null

  // Lampiran di kartu postingan (referensi Mentari 6): gambar tampil inline
  // lebar penuh; file lain tampil sebagai tautan unduh.
  const attachmentBlock = (att: DiscussionAttachment | null) => {
    if (!att || !att.url) return null
    if (isImageAttachment(att.mime_type)) {
      return (
        <div style={{ margin: '0.5rem 0' }}>
          <img src={att.url} alt={att.file_name} style={{ maxWidth: '100%' }} />
        </div>
      )
    }
    return (
      <p>
        <a href={att.url} target="_blank" rel="noreferrer" download={att.file_name}>
          <Icon name="download" size={18} /> {att.file_name}
          {att.size_bytes ? ` (${formatAttachmentSize(att.size_bytes)})` : ''}
        </a>
      </p>
    )
  }

  // (D26) Form balasan — dipakai kartu pembuka thread, tiap balasan, dan
  // kartu pembuka thread topik. parentId null = balasan langsung atas
  // topik (postingan baru top-level).
  const replyFormFor = (parentId: string | null) => (
    <form className="form" onSubmit={(e) => handleReply(e, parentId)}>
      <label>
        Balasan
        <textarea
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          rows={3}
          required
          placeholder="Tulis balasan…"
        />
      </label>
      <label>
        Lampiran (opsional, maks. 20 MB)
        <input
          type="file"
          onChange={(e) => setReplyFile(e.target.files?.[0] ?? null)}
        />
      </label>
      {replyFile && (
        <p className="muted">
          Lampiran: {replyFile.name}{' '}
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setReplyFile(null)}>
            Hapus
          </button>
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary btn-small" disabled={posting}>
          Kirim Balasan
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onClick={() => { setReplyTo(null); setReplyFile(null) }}
        >
          Batal
        </button>
      </div>
    </form>
  )

  // (D26) Satu kartu balasan — dipakai thread biasa (parent = thread yang
  // dibuka) dan thread topik (parent = postingan top-level untuk balasan
  // bersarang; null untuk postingan top-level itu sendiri). Nama penulis
  // HURUF BESAR (CSS .discussion-author, data tidak diubah). Memperbaiki
  // cacat lama: tombol REPLY di bawah balasan sebelumnya tidak menampilkan
  // form apa pun (form hanya dirender untuk replyTo === thread id).
  const replyItem = (r: Discussion, parent: Discussion | null, nested?: ReactNode) => (
    <li key={r.id}>
      <p className="discussion-meta">
        <span
          style={{
            display: 'inline-block',
            width: '2rem',
            height: '2rem',
            lineHeight: '2rem',
            textAlign: 'center',
            borderRadius: '50%',
            background: 'var(--light-grey)',
            fontWeight: 700,
            marginRight: '0.5rem',
          }}
        >
          {initialsOf(r.author?.name)}
        </span>
        <span className="discussion-author">{r.author?.name ?? 'Anggota'}</span> ·{' '}
        <span className="chip">{roleBadge(r)}</span> ·{' '}
        {new Date(r.created_at).toLocaleString('id-ID')}
        {parent && parent.accepted_answer_id === r.id ? ' · Jawaban diterima' : ''}
      </p>
      {attachmentBlock(attachmentFor(r.id))}
      <p>{r.body}</p>
      <div className="form-actions">
        {user && !isAdmin && (
          <button type="button" className="btn btn-ghost btn-small" onClick={() => void toggleHelpful(r.id)}>
            Bermanfaat ({helpfulCounts[r.id] ?? 0})
          </button>
        )}
        {canModerate && (
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => void updateDiscussionFlags(r.id, { is_pinned: !(r.is_pinned ?? false) }, r.is_pinned ? 'Balasan dilepas dari sematan.' : 'Balasan disematkan.')}
          >
            {r.is_pinned ? 'Lepas Sematan' : 'Sematkan'}
          </button>
        )}
        {parent && user && parent.user_id === user.id && parent.accepted_answer_id !== r.id && (
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => void updateDiscussionFlags(parent.id, { accepted_answer_id: r.id, is_resolved: true }, 'Balasan ditandai sebagai jawaban yang diterima.')}
          >
            Terima sebagai Jawaban
          </button>
        )}
        {user && !isAdmin && reportingId !== r.id && (
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setReportingId(r.id)}>
            Laporkan
          </button>
        )}
      </div>
      {user && !isAdmin && reportingId === r.id && reportForm(r.id)}
      {user && !isAdmin && replyTo !== r.id && (
        <button type="button" className="btn btn-primary btn-small" onClick={() => setReplyTo(r.id)}>
          ↩ REPLY
        </button>
      )}
      {user && !isAdmin && replyTo === r.id && replyFormFor(r.id)}
      {nested}
    </li>
  )

  // (D25) Kotak kunci NETRAL (bukan hijau): template literal utuh agar
  // spasi setelah titik dua tidak hilang seperti kasus D24b, dan kelas
  // notice-box--locked (abu-abu) agar tidak bernuansa hijau.
  const lockBox = (prevStep: string) => (
    <p className="notice-box notice-box--locked">{`Terkunci. Selesaikan dulu: ${prevStep}.`}</p>
  )

  // (D24.1/D24.12) Ikon per langkah (samakan dengan kartu course):
  // "?" untuk kuis, dokumen untuk materi, clipboard untuk tugas,
  // tautan untuk VCON, pesan untuk forum, grafik untuk kuesioner.
  // "?" adalah lencana teks (bukan emoji); link/clipboard adalah SVG
  // inline mengikuti pola icons.tsx — tanpa library ikon.
  const stepIcon = (step: number) => {
    switch (step) {
      case 0: // Pretest
      case 9: // Posttest
        return <span className="step-icon-q" aria-hidden="true">?</span>
      case 6: // Penugasan Terstruktur
        return <Icon name="clipboard" size={22} />
      case 7: // LINK VCON
        return <Icon name="link" size={22} />
      case 8: // Forum Diskusi
        return <Icon name="message" size={22} />
      case 10: // Kuesioner
        return <Icon name="chart" size={22} />
      default: // 1–5 materi: ikon dokumen
        return <Icon name="fileText" size={22} />
    }
  }

  // (D24.1) Kartu aktivitas gaya Mentari: border; bila langkah selesai,
  // border hijau + lingkaran centang hijau MENEMPEL di sudut kiri atas
  // garis border (absolute, overlap — bukan di dalam kartu); ikon +
  // judul di kepala; isi; tombol aksi kanan bawah bila relevan.
  // `step` = indeks 0-based langkah (untuk id anchor drawer D24.13).
  // (D24b) Langkah yang TERKUNCI tidak pernah tampil selesai, walau
  // derivasi `done`-nya true (materi tanpa resource → selesai via
  // lesson_progress; VCON tanpa kelas live → otomatis terpenuhi).
  // Gaya terkunci yang menang: `shownDone = done && !locked`.
  const activityCard = (
    step: number,
    title: string,
    done: boolean,
    locked: boolean,
    children: ReactNode,
    action?: ReactNode,
  ) => {
    const shownDone = done && !locked
    return (
    <section className={`activity-card${shownDone ? ' activity-done' : ''}`} aria-label={title} id={`step-${step}`}>
      {shownDone && (
        <span className="activity-check" aria-label="Selesai">✓</span>
      )}
      <div className="activity-card-head">
        <span className="activity-icon">{stepIcon(step)}</span>
        <h2>{title}</h2>
      </div>
      {children}
      {action && <div className="activity-action">{action}</div>}
    </section>
    )
  }

  // (D24.1/D24.12) Baris kuis di kartu aktivitas: judul + "Kerjakan
  // Dengan Cepat dan Tepat" + tombol QUIZ › (hijau) langsung ke halaman
  // kuis. Satu baris per kuis (lesson 2 punya 2 pretest — masing-masing
  // dapat tombolnya sendiri).
  const quizCardItems = (list: Quiz[]) => (
    <ul className="list">
      {list.map((q) => {
        const best = bestAttemptScore(q.id)
        return (
          <li key={q.id}>
            <p style={{ margin: '0 0 0.25rem' }}>
              <Link to={`/kuis/${q.id}`}><strong>{quizDisplayTitle(q)}</strong></Link>
              {' '} (nilai lulus: {q.passing_score}
              {best !== null ? ` · nilai terbaikmu: ${best}` : ''})
            </p>
            <p style={{ margin: '0 0 0.5rem' }}>Kerjakan Dengan Cepat dan Tepat</p>
            <div className="activity-action" style={{ marginTop: 0 }}>
              <Link to={`/kuis/${q.id}`} className="btn btn-primary btn-small">
                QUIZ ›
              </Link>
            </div>
          </li>
        )
      })}
    </ul>
  )

  // (D24.1) Tombol FORUM di kartu forum: lompat ke tabel Topik.
  function scrollToForumTopics() {
    document.getElementById('forum-topik')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // (D24.14) Simpan tanggal penutupan forum via RPC
  // set_lesson_forum_closes_at (migrasi 087): hanya closes_at yang
  // berubah. Draft kosong = hapus tenggat (null). `explicitDraft`
  // dipakai tombol Hapus (state draft belum tentu sudah ter-update).
  async function handleSaveClosesAt(explicitDraft?: string) {
    if (!lesson || !canEditClosesAt) return
    setSavingClosesAt(true)
    try {
      const raw = explicitDraft !== undefined ? explicitDraft : closesAtDraft
      const value = raw.trim() === '' ? null : new Date(raw).toISOString()
      const { error } = await supabase.rpc('set_lesson_forum_closes_at', {
        p_lesson_id: lesson.id,
        p_closes_at: value,
      })
      if (error) throw error
      setLesson({ ...lesson, closes_at: value })
      if (value) setClosesAtDraft(toLocalInputValue(value))
      setNotice(
        value
          ? `Tanggal penutupan forum disimpan: ${formatClosesAt(value)}.`
          : 'Tanggal penutupan forum dihapus.',
      )
    } catch (err) {
      setNotice(
        err instanceof Error
          ? `Gagal menyimpan tanggal penutupan: ${err.message}`
          : 'Gagal menyimpan tanggal penutupan forum. Periksa koneksi lalu coba lagi.',
      )
    } finally {
      setSavingClosesAt(false)
    }
  }

  // (D23) Warna tile strip mengikuti status: selesai = hijau (flow-done),
  // terkunci = redup (flow-locked), terbuka-belum-selesai = netral/putih.
  // Pretest tidak pernah terkunci (langkah pertama, selalu terbuka).
  // (D24b) Terkunci MENANG atas selesai: langkah yang derivasinya
  // selesai tapi masih terkunci (materi via lesson_progress, VCON tanpa
  // kelas live) tampil redup, bukan hijau.
  const flowClass = (done: boolean, locked: boolean) =>
    locked ? 'flow-locked' : done ? 'flow-done' : ''

  // Thread yang sedang dibuka di tampilan thread forum (null = daftar topik).
  const selectedThread = selectedThreadId
    ? topLevel.find((d) => d.id === selectedThreadId) ?? null
    : null

  const initialsOf = (name: string | null | undefined) => {
    const parts = (name ?? 'Anggota').trim().split(/\s+/)
    const ini = parts.slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase()
    return ini || 'A'
  }

  const bestAttemptScore = (quizId: string): number | null => {
    let best: number | null = null
    for (const a of quizAttempts) {
      if (a.quiz_id !== quizId || a.score === null) continue
      best = best === null ? a.score : Math.max(best, a.score)
    }
    return best
  }

  // (D23) Judul kuis TAMPIL (display, bukan di DB): "Pretest - Pertemuan N"
  // / "Posttest - Pertemuan N" untuk kind pretest/posttest; kind 'quiz'
  // biasa memakai judul tersimpan. CATATAN: kuis lama di lesson 2
  // ("Dasar Sinematografi", kind pretest) tampil dengan judul yang sama
  // persis seperti pretest seed ("Pretest - Pertemuan 2") — konsekuensi
  // data lama, judul di DB TIDAK diubah.
  const quizDisplayTitle = (q: Quiz) => {
    const kind = q.kind ?? 'quiz'
    if ((kind === 'pretest' || kind === 'posttest') && meetingNumber !== null) {
      return `${kind === 'pretest' ? 'Pretest' : 'Posttest'} - Pertemuan ${meetingNumber}`
    }
    return q.title
  }

  const quizItems = (list: Quiz[]) => (
    <ul>
      {list.map((q) => {
        const best = bestAttemptScore(q.id)
        return (
          <li key={q.id}>
            <Link to={`/kuis/${q.id}`}>{quizDisplayTitle(q)}</Link> (nilai lulus: {q.passing_score}
            {best !== null ? ` · nilai terbaikmu: ${best}` : ''})
          </li>
        )
      })}
    </ul>
  )

  async function handleComplete() {
    if (!user || !lesson) return
    // Admin hanya memantau (migrasi 022): RLS juga menolak, ini pesan jelasnya.
    if (isAdmin) {
      setNotice('Kamu masuk sebagai admin (mode pantau). Admin tidak menandai lesson selesai.')
      return
    }
    const l = lesson
    setSaving(true)
    try {
      await markLessonCompleted(user.id, l.id)
      setStatus('completed')
      setNotice('Lesson ditandai selesai.')
      // B23: label tombol menjanjikan lanjut — navigasi ke lesson
      // berikutnya setelah menandai selesai (bila ada).
      if (next) navigate(`/lesson/${next.id}`)
    } catch {
      setNotice('Gagal menandai lesson selesai. Periksa koneksi lalu coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  async function handleQuestionnaireSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user || !questionnaire || questionnaireQuestions.length === 0) return
    if (isAdmin) {
      setNotice('Kamu masuk sebagai admin (mode pantau). Admin tidak mengisi kuesioner.')
      return
    }
    const unanswered = questionnaireQuestions.filter((q) => questionnaireAnswers[q.id] === undefined)
    if (unanswered.length > 0) {
      setNotice(`Masih ada ${unanswered.length} pernyataan yang belum dijawab. Jawab semua dulu, ya.`)
      return
    }
    setQuestionnaireSubmitting(true)
    try {
      const row = await submitQuestionnaireResponse(questionnaire.id, user.id, questionnaireAnswers)
      setQuestionnaireResponses((rs) => [...rs, row])
      setNotice('Kuesioner terkirim. Terima kasih atas evaluasimu.')
    } catch {
      setNotice('Gagal mengirim kuesioner. Periksa koneksi lalu coba lagi.')
    } finally {
      setQuestionnaireSubmitting(false)
    }
  }

  // (D26) "Buka" pada baris prompt tabel Topik: membuka thread topik —
  // kartu pembuka = prompt "Topik diskusi" (penulis = mentor pengampu),
  // lalu postingan top-level sebagai balasannya (gaya Mentari).
  function openPromptTopic() {
    setSelectedThreadId(null)
    setPromptThreadOpen(true)
  }

  async function handleRefreshDiscussions() {
    if (!lesson) return
    try {
      const threads = await fetchDiscussions(lesson.id)
      setDiscussions(threads)
      try {
        setAttachments(await fetchDiscussionAttachments(threads.map((d) => d.id)))
      } catch {
        setAttachments([])
      }
      setNotice('Diskusi dimuat ulang.')
    } catch {
      setNotice('Gagal memuat ulang diskusi. Periksa koneksi lalu coba lagi.')
    }
  }

  async function toggleHelpful(discussionId: string) {
    if (!user) return
    try {
      if (helpfulMine.has(discussionId)) {
        const { error } = await supabase
          .from('discussion_reactions')
          .delete()
          .eq('discussion_id', discussionId)
          .eq('user_id', user.id)
          .eq('kind', 'helpful')
        if (error) throw error
        setHelpfulMine((m) => { const n = new Set(m); n.delete(discussionId); return n })
        setHelpfulCounts((c) => ({ ...c, [discussionId]: Math.max(0, (c[discussionId] ?? 1) - 1) }))
      } else {
        const { error } = await supabase
          .from('discussion_reactions')
          .insert({ discussion_id: discussionId, user_id: user.id, kind: 'helpful' })
        if (error) throw error
        setHelpfulMine((m) => new Set(m).add(discussionId))
        setHelpfulCounts((c) => ({ ...c, [discussionId]: (c[discussionId] ?? 0) + 1 }))
      }
    } catch (err) {
      setNotice(isMissingTableError(err)
        ? 'Reaksi bermanfaat aktif setelah migrasi 003 dijalankan, lihat supabase/README.md.'
        : 'Gagal menyimpan reaksi. Periksa koneksi lalu coba lagi.')
    }
  }

  async function updateDiscussionFlags(discussionId: string, patch: Record<string, unknown>, okMsg: string) {
    try {
      const { error } = await supabase.from('discussions').update(patch).eq('id', discussionId)
      if (error) throw error
      setDiscussions((ds) => ds.map((d) => (d.id === discussionId ? { ...d, ...patch } as Discussion : d)))
      setNotice(okMsg)
    } catch (err) {
      setNotice(isMissingTableError(err)
        ? 'Fitur ini aktif setelah migrasi 003 dijalankan, lihat supabase/README.md.'
        : 'Gagal memperbarui diskusi. Periksa koneksi lalu coba lagi.')
    }
  }

  async function handleReport(e: FormEvent, discussionId: string) {
    e.preventDefault()
    if (!user || !reportReason.trim()) return
    try {
      const { error } = await supabase.from('discussion_reports').insert({
        discussion_id: discussionId,
        reporter_id: user.id,
        reason: reportReason.trim(),
        status: 'open',
      })
      if (error) throw error
      setNotice('Laporan terkirim. Admin akan meninjaunya.')
      setReportingId(null)
      setReportReason('')
    } catch (err) {
      setNotice(isMissingTableError(err)
        ? 'Pelaporan aktif setelah migrasi 003 dijalankan, lihat supabase/README.md.'
        : 'Gagal mengirim laporan. Periksa koneksi lalu coba lagi.')
    }
  }

  async function handlePost(e: FormEvent) {
    e.preventDefault()
    if (!user || !lesson || !newPost.trim()) return
    const l = lesson
    const file = newPostFile
    setPosting(true)
    try {
      const row = await postDiscussion(l.id, user.id, newPost.trim(), null)
      row.author = { name: profile?.name ?? null, photo_url: profile?.photo_url ?? null, role: profile?.role ?? null }
      setDiscussions((d) => [...d, row])
      setNewPost('')
      setNewPostFile(null)
      if (file) {
        try {
          const att = await uploadDiscussionAttachment(file, l.id, user.id, row.id)
          setAttachments((as) => [...as, att])
        } catch (err) {
          setNotice(
            err instanceof DiscussionAttachmentError
              ? `Diskusi terkirim, tetapi lampiran gagal diunggah: ${err.message}`
              : 'Diskusi terkirim, tetapi lampiran gagal diunggah.',
          )
        }
      }
      // Beri tahu mentor course (best-effort; gagal kirim tidak
      // membatalkan kiriman dan tidak memblokir UI).
      if (courseId) {
        const body = newPost.trim().slice(0, 120)
        void fetchCourse(courseId)
          .then((course) => {
            const mentorId = course?.mentor_id
            if (!mentorId || mentorId === user.id) return
            void sendNotification(
              mentorId,
              'discussion',
              `Diskusi baru di "${l.title}"`,
              body,
              { lesson_id: l.id, discussion_id: row.id },
            ).catch(() => undefined)
          })
          .catch(() => undefined)
      }
    } catch {
      setNotice('Gagal mengirim diskusi. Periksa koneksi lalu coba lagi.')
    } finally {
      setPosting(false)
    }
  }

  // (D26) parentId null = balasan langsung atas topik (postingan baru
  // top-level) — dipakai form REPLY pada kartu pembuka thread topik.
  async function handleReply(e: FormEvent, parentId: string | null) {
    e.preventDefault()
    if (!user || !lesson || !replyBody.trim()) return
    const l = lesson
    const file = replyFile
    setPosting(true)
    try {
      const row = await postDiscussion(l.id, user.id, replyBody.trim(), parentId)
      row.author = { name: profile?.name ?? null, photo_url: profile?.photo_url ?? null, role: profile?.role ?? null }
      setDiscussions((d) => [...d, row])
      setReplyBody('')
      setReplyTo(null)
      setReplyFile(null)
      if (file) {
        try {
          const att = await uploadDiscussionAttachment(file, l.id, user.id, row.id)
          setAttachments((as) => [...as, att])
        } catch (err) {
          setNotice(
            err instanceof DiscussionAttachmentError
              ? `Balasan terkirim, tetapi lampiran gagal diunggah: ${err.message}`
              : 'Balasan terkirim, tetapi lampiran gagal diunggah.',
          )
        }
      }
      // Beri tahu penulis thread induk dan mentor course (best-effort;
      // gagal kirim tidak membatalkan balasan dan tidak memblokir UI).
      // Penerima dideduplikasi dan pengirim sendiri tidak pernah diberi tahu.
      if (courseId) {
        const parent = discussions.find((d) => d.id === parentId)
        const body = replyBody.trim().slice(0, 120)
        void fetchCourse(courseId)
          .then((course) => {
            const recipients = new Set<string>()
            if (parent && parent.user_id !== user.id) recipients.add(parent.user_id)
            const mentorId = course?.mentor_id
            if (mentorId && mentorId !== user.id && mentorId !== parent?.user_id) {
              recipients.add(mentorId)
            }
            for (const recipientId of recipients) {
              void sendNotification(
                recipientId,
                'discussion',
                `Balasan baru di "${l.title}"`,
                body,
                { lesson_id: l.id, discussion_id: row.id },
              ).catch(() => undefined)
            }
          })
          .catch(() => undefined)
      }
    } catch {
      setNotice('Gagal mengirim balasan. Periksa koneksi lalu coba lagi.')
    } finally {
      setPosting(false)
    }
  }

  const reportForm = (discussionId: string) => (
    <form className="form form-inline" onSubmit={(e) => handleReport(e, discussionId)}>
      <label>
        Alasan laporan
        <input value={reportReason} onChange={(e) => setReportReason(e.target.value)} required placeholder="Mis. spam, tidak sopan, di luar topik…" />
      </label>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary btn-small">Kirim Laporan</button>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => setReportingId(null)}>Batal</button>
      </div>
    </form>
  )

  return (
    <div className="page">
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {courseId && (
          <Link to={`/course/${courseId}`} className="back-link">
            ← {courseTitle || 'Course'}
          </Link>
        )}
        {/* (D24.13) Tombol pembuka drawer Course Index. */}
        <button type="button" className="btn btn-ghost btn-small" onClick={() => setIndexOpen(true)}>
          ☰ Course Index
        </button>
      </div>
      <p className="muted">Materi {lesson.order_index}</p>
      <h1>
        {lesson.lesson_code ? `${lesson.lesson_code}, ` : ''}
        {lesson.title}
      </h1>
      <p>
        <span className={`chip ${status === 'completed' ? 'chip-success' : ''}`}>
          {!user
            ? 'Masuk untuk melacak progres'
            : status === 'completed'
              ? 'Selesai'
              : status === 'in_progress'
                ? 'Sedang dipelajari'
                : 'Belum dimulai'}
        </span>
      </p>

      <ol className="flow-strip" aria-label="Alur belajar Mentari">
        {/* 11 langkah Mentari (RENCANA.md §2): status dari derivasi nyata;
            warna tile mengikuti status (D23): hijau = selesai, redup =
            terkunci, putih = terbuka-belum-selesai. */}
        <li className={flowClass(pretestDone, false)} title="Pretest">Pretest</li>
        <li className={flowClass(materiDone, lockedMateri)} title="Buku ISBN">Buku ISBN</li>
        <li className={flowClass(materiDone, lockedMateri)} title="Video Ajar">Video Ajar</li>
        <li className={flowClass(materiDone, lockedMateri)} title="Power Point">Power Point</li>
        <li className={flowClass(materiDone, lockedMateri)} title="Artikel Riset">Artikel Riset</li>
        <li className={flowClass(materiDone, lockedMateri)} title="Materi Lainnya">Materi Lainnya</li>
        <li className={flowClass(tugasDone, lockedTugas)} title="Penugasan Terstruktur">Tugas</li>
        <li className={flowClass(vconDone, lockedVcon)} title="LINK VCON">LINK VCON</li>
        <li className={flowClass(diskusiDone, lockedDiskusi)} title="Forum Diskusi">Forum</li>
        <li className={flowClass(posttestDone, lockedPosttest)} title="Posttest">Posttest</li>
        <li className={flowClass(kuesionerDone, lockedKuesioner)} title="Kuesioner">Kuesioner</li>
      </ol>
      <p className="muted">
        Kehadiran pertemuan ini: {attendanceDone ? 'Hadir' : 'Belum (selesaikan Pre Test sampai Post Test)'}
      </p>

      {activityCard(
        0,
        '1. Pretest',
        pretestDone,
        false,
        <>
          {quizError ? (
            <p className="error-box">{quizError}</p>
          ) : pretests.length === 0 ? (
            <p className="empty">Belum tersedia.</p>
          ) : (
            quizCardItems(pretests)
          )}
        </>,
      )}

      {/* (D24.1) Seksi Materi dipecah menjadi 5 kartu (langkah 2–6):
          Buku ISBN, Video Ajar, Power Point, Artikel Riset, Materi
          Lainnya. "Tentang Materi" (lesson.content, bacaan) tinggal di
          kartu Buku ISBN. Kartu kosong menampilkan "No content" ala
          Mentari. Bila terkunci, tiap kartu menampilkan kotak kunci. */}
      {activityCard(
        1,
        '2. Buku ISBN',
        materiDone,
        lockedMateri,
        lockedMateri ? (
          lockBox('Pretest')
        ) : (
          <>
            {lesson.content ? (
              <>
                <h3>Tentang Materi</h3>
                <div className="lesson-content">{lesson.content}</div>
              </>
            ) : null}
            {bukuResources.length === 0 && !lesson.content ? (
              <p className="no-content">No content</p>
            ) : (
              bukuResources.length > 0 && (
                <ul className="list">
                  {bukuResources.map((r) => (
                    <li key={r.id}>
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>
                      ) : (
                        <span>{r.title}</span>
                      )}
                      {r.kind === 'reading' && r.body ? <p>{r.body}</p> : null}
                    </li>
                  ))}
                </ul>
              )
            )}
            {resourcesError && <p className="muted">{resourcesError}</p>}
          </>
        ),
      )}
      {activityCard(
        2,
        '3. Video Ajar',
        materiDone,
        lockedMateri,
        lockedMateri ? (
          lockBox('Pretest')
        ) : (
          <>
            {!lesson.video_url ? (
              videoResources.length === 0 ? (
                <p className="no-content">No content</p>
              ) : null
            ) : embed && embed.kind !== 'link' && embed.embedUrl ? (
              <div className="lesson-video">
                <iframe
                  src={embed.embedUrl}
                  title={`Video: ${lesson.title}`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <p>
                <a href={lesson.video_url} target="_blank" rel="noreferrer" className="btn-mint">
                  Buka Video (tautan eksternal)
                </a>
              </p>
            )}
            {videoResources.length > 0 && (
              <ul className="list">
                {videoResources.map((r) => (
                  <li key={r.id}>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer">{r.title} (Video)</a>
                    ) : (
                      <span>{r.title} (Video)</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        ),
      )}
      {activityCard(
        3,
        '4. Power Point',
        materiDone,
        lockedMateri,
        lockedMateri ? (
          lockBox('Pretest')
        ) : pptResources.length === 0 ? (
          <p className="no-content">No content</p>
        ) : (
          <ul className="list">
            {pptResources.map((r) => (
              <li key={r.id}>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer">{r.title} (PDF)</a>
                ) : (
                  <span>{r.title} (PDF)</span>
                )}
              </li>
            ))}
          </ul>
        ),
      )}
      {activityCard(
        4,
        '5. Artikel Riset',
        materiDone,
        lockedMateri,
        lockedMateri ? (
          lockBox('Pretest')
        ) : artikelResources.length === 0 ? (
          <p className="no-content">No content</p>
        ) : (
          <ul className="list">
            {artikelResources.map((r) => (
              <li key={r.id}>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>
                ) : (
                  <span>{r.title}</span>
                )}
                {r.kind === 'reading' && r.body ? <p>{r.body}</p> : null}
              </li>
            ))}
          </ul>
        ),
      )}
      {activityCard(
        5,
        '6. Materi Lainnya',
        materiDone,
        lockedMateri,
        lockedMateri ? (
          lockBox('Pretest')
        ) : lainResources.length === 0 ? (
          <p className="no-content">No content</p>
        ) : (
          <ul className="list">
            {lainResources.map((r) => (
              <li key={r.id}>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>
                ) : (
                  <span>{r.title}</span>
                )}
                {r.kind === 'image' && r.url ? (
                  <div>
                    <img src={r.url} alt={r.title} style={{ maxWidth: '100%' }} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ),
      )}

      {activityCard(
        6,
        '7. Penugasan Terstruktur',
        tugasDone,
        lockedTugas,
        <>
          <p className="muted">Kirim tugas project course bila ada. Bila lesson ini tidak punya tugas, langkah ini otomatis terpenuhi.</p>
          {lockedTugas ? (
            lockBox('Materi')
          ) : assignError ? (
            <p className="error-box">{assignError}</p>
          ) : assignments.length === 0 ? (
            <p className="empty">Tidak ada tugas di lesson ini — lanjut ke LINK VCON.</p>
          ) : (
            <ul>
              {assignments.map((a) => (
                <li key={a.id}>
                  <Link to={`/tugas/${a.id}`}><strong>{a.title}</strong></Link>
                  {a.description ? `, ${a.description}` : ''} (maks. {a.max_score})
                </li>
              ))}
            </ul>
          )}
        </>,
      )}

      {activityCard(
        7,
        '8. LINK VCON',
        vconDone,
        lockedVcon,
        <>
          {lockedVcon ? (
            lockBox('Penugasan Terstruktur')
          ) : liveClassesError ? (
            <p className="error-box">{liveClassesError}</p>
          ) : upcomingLive.length === 0 ? (
            <p className="empty">Tidak ada kelas live — lanjut ke Forum Diskusi.</p>
          ) : (
            <>
              <p>Berikut adalah Link VCON untuk Pertemuan ini</p>
              <ul className="list">
                {upcomingLive.map((lc) => {
                  const url = lc.meet_url ?? ''
                  const joinLabel = url.includes('zoom.us')
                    ? 'Gabung Zoom'
                    : url.includes('meet.google.com')
                      ? 'Gabung Google Meet'
                      : 'Gabung Kelas Live'
                  return (
                    <li key={lc.id}>
                      <p style={{ margin: '0 0 0.25rem' }}>
                        <strong>{lc.title}</strong>
                        {lc.scheduled_at ? ` — ${new Date(lc.scheduled_at).toLocaleString('id-ID')}` : ''}
                      </p>
                      {url ? (
                        <p style={{ margin: 0 }}>
                          LINK URL :{' '}
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => setVconAcknowledged(true)}
                          >
                            <Icon name="link" size={16} /> {joinLabel}
                          </a>
                        </p>
                      ) : (
                        <p className="muted" style={{ margin: 0 }}>Tautan kelas live belum tersedia.</p>
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </>,
      )}

      {activityCard(
        8,
        meetingNumber !== null ? `Forum Diskusi - Pertemuan ${meetingNumber}` : 'Forum Diskusi',
        diskusiDone,
        lockedDiskusi,
        <>
          {lockedDiskusi ? (
            lockBox('LINK VCON')
          ) : (
            <>
            <p>
              {meetingNumber !== null && courseTitle
                ? `${greeting}, saat ini kita memasuki pertemuan ke-${meetingNumber} ${courseTitle} dengan materi ${lesson.title}.`
                : `${greeting}, saat ini kita memasuki pertemuan ini dengan materi ${lesson.title}.`}
            </p>
            <p>Untuk pengerjaan forum, tolong diperhatikan beberapa hal di bawah ini:</p>
            <ol>
              <li>Sebelum mengerjakan forum diskusi, pastikan kamu sudah membaca materi.</li>
              <li>
                Kerjakan pretest, lalu forum diskusi, kemudian posttest supaya presensi
                terdeteksi otomatis. Jika salah satunya tidak dikerjakan, presensi
                tidak akan terdeteksi.
              </li>
              <li>Jangan mengerjakan forum diskusi mepet hari terakhir untuk menghindari error sistem.</li>
              {/* (D24.14) Instruksi ke-4: HANYA bila closes_at terisi
                  (migrasi 087). Bila kosong, tetap 3 instruksi — jangan
                  karang tanggal. (D24.11: daftar ini memang 3 instruksi
                  Mentari, BUKAN teks prompt diskusi — terverifikasi dari
                  kode; prompt hanya tampil sebagai baris tabel Topik.) */}
              {lesson.closes_at && (
                <li>
                  {/* (D24b) Template literal utuh — JSX text + ekspresi
                      inline di atas sempat kehilangan spasi di build live
                      ("ke-2akan ditutupSabtu,"); template literal tidak
                      kena pemrosesan whitespace JSX. */}
                  {`Forum diskusi pertemuan ke-${meetingNumber !== null ? meetingNumber : 'ini'} akan ditutup ${formatClosesAt(lesson.closes_at)}.`}
                </li>
              )}
            </ol>
            {/* (D24.14) Kontrol tanggal penutupan forum — HANYA mentor
                pengampu course + admin. Siswa tidak melihat kontrol ini. */}
            {canEditClosesAt && (
              <div style={{ border: '1px solid var(--light-grey)', borderRadius: 8, padding: '0.75rem', marginBottom: '0.75rem' }}>
                <p style={{ margin: '0 0 0.5rem' }}>
                  <strong>Tanggal penutupan forum</strong>{' '}
                  <span className="muted">(mentor/admin)</span>
                </p>
                <p className="muted" style={{ margin: '0 0 0.5rem' }}>
                  {lesson.closes_at
                    ? `Saat ini: ${formatClosesAt(lesson.closes_at)}.`
                    : 'Belum ada tanggal penutupan — instruksi ke-4 tidak tampil ke siswa.'}
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    type="datetime-local"
                    value={closesAtDraft}
                    onChange={(e) => setClosesAtDraft(e.target.value)}
                    aria-label="Tanggal dan jam penutupan forum"
                  />
                  <button
                    type="button"
                    className="btn btn-primary btn-small"
                    onClick={() => void handleSaveClosesAt()}
                    disabled={savingClosesAt}
                  >
                    {savingClosesAt ? 'Menyimpan…' : 'Simpan Tanggal'}
                  </button>
                  {lesson.closes_at && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => void handleSaveClosesAt('')}
                      disabled={savingClosesAt}
                    >
                      Hapus
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="activity-action">
              <button type="button" className="btn btn-primary btn-small" onClick={scrollToForumTopics}>
                FORUM ›
              </button>
            </div>
            <p className="muted">
              Diskusi selesai bila kamu menulis minimal 2 tanggapan (postingan atau
              balasan). Progresmu: {myDiscussionCount}/2.
            </p>
            {notice && <p className="notice-box">{notice}</p>}
            {discussionError ? (
              <p className="error-box">{discussionError}</p>
            ) : selectedThread ? (
              <>
                {/* (D24.7) Bar atas thread: tombol kembali + judul
                    terpotong + tombol refresh (ghost/hijau SINEVERSE,
                    bukan biru). Sebelumnya hanya ada dua tombol tanpa
                    judul thread. */}
                <div className="thread-topbar">
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => setSelectedThreadId(null)} aria-label="Kembali ke daftar topik">
                    ←
                  </button>
                  <span className="thread-topbar-title">{excerpt(selectedThread.body, 60)}</span>
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => void handleRefreshDiscussions()} aria-label="Muat ulang diskusi" title="Muat ulang">
                    ⟳
                  </button>
                </div>
                <div className="discussion-item">
                  <p><strong>{excerpt(selectedThread.body, 120)}</strong></p>
                  <p className="discussion-meta">
                    <span className="discussion-author">{selectedThread.author?.name ?? 'Anggota'}</span> ·{' '}
                    <span className="chip">{roleBadge(selectedThread)}</span> ·{' '}
                    {new Date(selectedThread.created_at).toLocaleString('id-ID')}
                    {selectedThread.is_pinned ? ' · Disematkan' : ''}
                    {selectedThread.is_resolved ? ' · Selesai' : ''}
                  </p>
                  {attachmentBlock(attachmentFor(selectedThread.id))}
                  <p>{selectedThread.body}</p>
                  <div className="form-actions" style={{ marginBottom: '0.5rem' }}>
                    {user && !isAdmin && (
                      <button type="button" className="btn btn-ghost btn-small" onClick={() => void toggleHelpful(selectedThread.id)}>
                        Bermanfaat ({helpfulCounts[selectedThread.id] ?? 0})
                      </button>
                    )}
                    {canModerate && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={() => void updateDiscussionFlags(selectedThread.id, { is_pinned: !(selectedThread.is_pinned ?? false) }, selectedThread.is_pinned ? 'Diskusi dilepas dari sematan.' : 'Diskusi disematkan.')}
                      >
                        {selectedThread.is_pinned ? 'Lepas Sematan' : 'Sematkan'}
                      </button>
                    )}
                    {user && selectedThread.user_id === user.id && !selectedThread.is_resolved && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={() => void updateDiscussionFlags(selectedThread.id, { is_resolved: true }, 'Diskusi ditandai selesai.')}
                      >
                        Tandai Selesai
                      </button>
                    )}
                    {user && !isAdmin && reportingId !== selectedThread.id && (
                      <button type="button" className="btn btn-ghost btn-small" onClick={() => setReportingId(selectedThread.id)}>
                        Laporkan
                      </button>
                    )}
                  </div>
                  {user && !isAdmin && reportingId === selectedThread.id && reportForm(selectedThread.id)}
                  {user && !isAdmin && replyTo !== selectedThread.id && (
                    <button type="button" className="btn btn-primary btn-small" onClick={() => setReplyTo(selectedThread.id)}>
                      ↩ REPLY
                    </button>
                  )}
                  {user && !isAdmin && replyTo === selectedThread.id && replyFormFor(selectedThread.id)}
                </div>
                <ul className="discussion-replies">
                  {replies(selectedThread.id).map((r) => replyItem(r, selectedThread))}
                </ul>
              </>
            ) : promptThreadOpen && discussionPrompt?.body ? (
              <>
                {/* (D26) Thread topik gaya Mentari (referensi 11): kartu
                    pembuka = prompt "Topik diskusi" (penulis = mentor
                    pengampu, tanggal, isi lengkap), lalu postingan
                    top-level sebagai balasan + balasan bersarangnya. */}
                <div className="thread-topbar">
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => setPromptThreadOpen(false)} aria-label="Kembali ke daftar topik">
                    ←
                  </button>
                  <span className="thread-topbar-title">Topik diskusi</span>
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => void handleRefreshDiscussions()} aria-label="Muat ulang diskusi" title="Muat ulang">
                    ⟳
                  </button>
                </div>
                <div className="discussion-item">
                  <p><strong className="topic-prompt">Topik diskusi</strong></p>
                  <p className="discussion-meta">
                    <span className="discussion-author">{mentorName ?? 'Mentor'}</span> ·{' '}
                    <span className="chip">Mentor</span> ·{' '}
                    {new Date(discussionPrompt.created_at).toLocaleString('id-ID')}
                  </p>
                  <p>{discussionPrompt.body}</p>
                  {user && !isAdmin && replyTo !== 'prompt' && (
                    <button type="button" className="btn btn-primary btn-small" onClick={() => setReplyTo('prompt')}>
                      ↩ REPLY
                    </button>
                  )}
                  {user && !isAdmin && replyTo === 'prompt' && replyFormFor(null)}
                </div>
                {topLevel.length > 0 ? (
                  <ul className="discussion-replies">
                    {topLevel.map((t) => replyItem(
                      t,
                      null,
                      replies(t.id).length > 0 ? (
                        <ul className="discussion-replies" style={{ marginLeft: '1.5rem' }}>
                          {replies(t.id).map((r) => replyItem(r, t))}
                        </ul>
                      ) : undefined,
                    ))}
                  </ul>
                ) : (
                  <p className="empty">Belum ada jawaban atas topik ini. Jadilah yang pertama menjawab.</p>
                )}
              </>
            ) : (
              <>
                {/* (D23) Tabel Topik selalu tampil (bukan hanya bila sudah
                    ada thread): baris pertama = prompt "Topik diskusi",
                    lalu satu baris per thread top-level yang sudah ada.
                    JUDUL = kutipan awal isi; AKSI = "Buka". */}
                {topLevel.length > 0 && (
                  <>
                    <label>
                      Cari diskusi
                      <input
                        type="search"
                        value={discussionQuery}
                        onChange={(e) => setDiscussionQuery(e.target.value)}
                        placeholder="Cari diskusi…"
                      />
                    </label>
                    {searchText && (
                      <p className="muted">
                        Menampilkan {visibleTopLevel.length} dari {topLevel.length} diskusi
                      </p>
                    )}
                    {searchText && visibleTopLevel.length === 0 && (
                      <p className="empty">Tidak ada diskusi yang cocok dengan pencarian.</p>
                    )}
                  </>
                )}
                {/* (D24.6/D26) JUDUL bisa diklik (thread → buka thread;
                    prompt → buka thread topik D26); kolom AKSI menampilkan
                    "—" seperti Mentari; judul baris prompt + nama penulis
                    HURUF BESAR (CSS uppercase); tiap baris membawa badge
                    peran (Siswa/Mentor/Admin). */}
                <div id="forum-topik">
                <h3>Topik</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0', borderBottom: '1px solid var(--light-grey)' }}>JUDUL</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem 0', borderBottom: '1px solid var(--light-grey)' }}>AKSI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discussionPrompt?.body ? (
                      <tr>
                        <td style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--light-grey)' }}>
                          <button type="button" className="topic-title topic-prompt" onClick={openPromptTopic}>
                            {excerpt(discussionPrompt.body, 80)}
                          </button>
                          <span className="muted"> · Topik diskusi</span>{' '}
                          <span className="chip">Mentor</span>
                        </td>
                        <td style={{ textAlign: 'right', padding: '0.5rem 0', borderBottom: '1px solid var(--light-grey)' }}>
                          —
                        </td>
                      </tr>
                    ) : null}
                    {visibleTopLevel.map((d) => (
                      <tr key={d.id}>
                        <td style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--light-grey)' }}>
                          <button type="button" className="topic-title" onClick={() => { setPromptThreadOpen(false); setSelectedThreadId(d.id) }}>
                            {excerpt(d.body, 80)}
                          </button>
                          <span className="muted"> · </span>
                          <span className="discussion-author">{d.author?.name ?? 'Anggota'}</span>{' '}
                          <span className="chip">{roleBadge(d)}</span>
                          {replies(d.id).length > 0 ? ` · ${replies(d.id).length} balasan` : ''}
                        </td>
                        <td style={{ textAlign: 'right', padding: '0.5rem 0', borderBottom: '1px solid var(--light-grey)' }}>
                          —
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                {topLevel.length === 0 && (
                  <p className="empty">Belum ada diskusi dari siswa. Jadilah yang pertama menjawab topik di atas.</p>
                )}
                {user ? (
                  isAdmin ? (
                    <p className="muted">
                      Kamu masuk sebagai admin (mode pantau): diskusi hanya bisa dibaca dan dimoderasi, tidak bisa ikut menulis.
                    </p>
                  ) : (
                    <form className="form" id="forum-new-post" onSubmit={handlePost}>
                      <label>
                        Tulis pertanyaan atau komentar
                        <textarea
                          ref={newPostRef}
                          value={newPost}
                          onChange={(e) => setNewPost(e.target.value)}
                          rows={3}
                          required
                          placeholder="Apa yang ingin kamu tanyakan tentang lesson ini?"
                        />
                      </label>
                      <label>
                        Lampiran (opsional, maks. 20 MB)
                        <input
                          type="file"
                          onChange={(e) => setNewPostFile(e.target.files?.[0] ?? null)}
                        />
                      </label>
                      {newPostFile && (
                        <p className="muted">
                          Lampiran: {newPostFile.name}{' '}
                          <button type="button" className="btn btn-ghost btn-small" onClick={() => setNewPostFile(null)}>
                            Hapus
                          </button>
                        </p>
                      )}
                      <button type="submit" className="btn btn-primary" disabled={posting}>
                        {posting ? 'Mengirim…' : 'Kirim Diskusi'}
                      </button>
                    </form>
                  )
                ) : (
                  <p className="muted">
                    <Link to="/login">Masuk</Link> untuk ikut berdiskusi.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </>,
      )}

      {activityCard(
        9,
        '10. Posttest',
        posttestDone,
        lockedPosttest,
        <>
          {lockedPosttest ? (
            lockBox('Forum Diskusi')
          ) : quizError ? (
            <p className="error-box">{quizError}</p>
          ) : posttests.length === 0 ? (
            <p className="empty">Belum tersedia.</p>
          ) : (
            quizCardItems(posttests)
          )}
        </>,
      )}

      {activityCard(
        10,
        meetingNumber !== null ? `Kuesioner Pertemuan ${meetingNumber}` : 'Kuesioner',
        kuesionerDone,
        lockedKuesioner,
        <>
        <p className="muted">Penilaian terhadap mentor dan pembelajaran di pertemuan ini. Jawab Ya atau Tidak untuk tiap pernyataan.</p>
        {lockedKuesioner ? (
          lockBox('Posttest')
        ) : questionnaireError ? (
          <p className="error-box">{questionnaireError}</p>
        ) : !questionnaire ? (
          <p className="empty">Belum tersedia.</p>
        ) : !user ? (
          <p className="muted">
            <Link to="/login">Masuk</Link> untuk mengisi kuesioner.
          </p>
        ) : myQuestionnaireResponse ? (
          <>
            <p className="notice-box">Kuesioner sudah diisi. Terima kasih atas evaluasimu.</p>
            {questionnaireQuestions.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0', borderBottom: '1px solid var(--light-grey)' }}>NO</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0', borderBottom: '1px solid var(--light-grey)' }}>KUESIONER</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0', borderBottom: '1px solid var(--light-grey)' }}>JAWABAN</th>
                  </tr>
                </thead>
                <tbody>
                  {questionnaireQuestions.map((q, i) => (
                    <tr key={q.id}>
                      <td style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--light-grey)' }}>{i + 1}</td>
                      <td style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--light-grey)' }}>{q.question}</td>
                      <td style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--light-grey)' }}>
                        {myQuestionnaireResponse.answers[q.id] === true
                          ? 'Ya'
                          : myQuestionnaireResponse.answers[q.id] === false
                            ? 'Tidak'
                            : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : questionnaireQuestions.length === 0 ? (
          <p className="empty">Belum ada pernyataan kuesioner.</p>
        ) : (
          <form className="form" onSubmit={handleQuestionnaireSubmit}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0', borderBottom: '1px solid var(--light-grey)' }}>NO</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0', borderBottom: '1px solid var(--light-grey)' }}>KUESIONER</th>
                </tr>
              </thead>
              <tbody>
                {questionnaireQuestions.map((q, i) => (
                  <tr key={q.id}>
                    <td style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--light-grey)' }}>{i + 1}</td>
                    <td style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--light-grey)' }}>
                      {q.question}
                      <p className="muted">Jawaban</p>
                      {/* (D24.9) Radio Ya/Tidak HORIZONTAL berdampingan
                          (class .quiz-radio-row): sebelumnya bertumpuk
                          vertikal karena .form label display:flex column. */}
                      <div className="quiz-radio-row">
                        <label>
                          <input
                            type="radio"
                            name={q.id}
                            checked={questionnaireAnswers[q.id] === true}
                            onChange={() => setQuestionnaireAnswers((a) => ({ ...a, [q.id]: true }))}
                          />{' '}
                          Ya
                        </label>
                        <label>
                          <input
                            type="radio"
                            name={q.id}
                            checked={questionnaireAnswers[q.id] === false}
                            onChange={() => setQuestionnaireAnswers((a) => ({ ...a, [q.id]: false }))}
                          />{' '}
                          Tidak
                        </label>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="submit" className="btn btn-primary" disabled={questionnaireSubmitting}>
              {questionnaireSubmitting ? 'Mengirim…' : 'Kirim Kuesioner'}
            </button>
          </form>
        )}
        </>,
      )}

      {plainQuizzes.length > 0 && (
        <section className="section" aria-label="Cek pemahaman">
          <h2>Cek, Kuis</h2>
          {quizError ? (
            <p className="error-box">{quizError}</p>
          ) : (
            quizItems(plainQuizzes)
          )}
        </section>
      )}

      {user && (
        <section className="section" aria-label="Selesai dan Lanjutkan">
          <div className="dash-section-head">
            <h2>Selesai &amp; Lanjutkan</h2>
          </div>
          {notice && <p className="notice-box">{notice}</p>}
          {isAdmin ? (
            <p className="muted">
              Kamu masuk sebagai admin (mode pantau): progres lesson hanya bisa dibaca, tidak bisa ditandai selesai.
            </p>
          ) : (
            <>
              <button
                type="button"
                className="btn-mint"
                onClick={handleComplete}
                disabled={status === 'completed' || saving || !attendanceDone}
              >
                {saving
                  ? 'Menyimpan…'
                  : status === 'completed'
                    ? 'Lesson Selesai'
                    : next
                      ? 'Selesai & Lanjutkan →'
                      : 'Tandai Selesai'}
              </button>
              {!attendanceDone && status !== 'completed' && (
                <p className="muted">{`Selesaikan dulu: ${unfinishedSteps.join(', ')}.`}</p>
              )}
            </>
          )}
        </section>
      )}

      {/* P36: tombol nav berbagi lebar secara fleksibel — sebelumnya
          masing-masing maxWidth 45vw + gap bisa overflow layar sempit. */}
      <nav className="lesson-nav" aria-label="Navigasi lesson">
        {prev ? (
          <Link
            to={`/lesson/${prev.id}`}
            className="btn btn-secondary lesson-nav-title"
            title={prev.title}
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 0', minWidth: 0 }}
          >
            ← {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            to={`/lesson/${next.id}`}
            className="btn btn-secondary lesson-nav-title"
            title={next.title}
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 0', minWidth: 0 }}
          >
            {next.title} →
          </Link>
        ) : (
          <span />
        )}
      </nav>

      {/* (D24.13) Drawer Course Index: General → atas halaman; pertemuan
          → lesson itu; langkah → kartu langkah itu bila lesson ini yang
          dibuka, kalau tidak pindah ke lesson-nya. */}
      <CourseIndexDrawer
        open={indexOpen}
        onClose={() => setIndexOpen(false)}
        courseTitle={courseTitle}
        items={siblings.map((l, i) => ({ id: l.id, meetingNumber: i + 1, title: l.title }))}
        activeId={lesson.id}
        onSelectGeneral={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        onSelectItem={(item) => navigate(`/lesson/${item.id}`)}
        onSelectStep={(item, stepIndex) => {
          if (item.id === lesson.id) {
            document.getElementById(`step-${stepIndex}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          } else {
            navigate(`/lesson/${item.id}`)
          }
        }}
      />

    </div>
  )
}

// Resolves the parent course of a lesson (module → course) for the
// back-link and prev/next navigation.
async function fetchModulesByLessonModule(
  moduleId: string,
): Promise<{ courseId: string; courseTitle: string } | null> {
  const { data: mod, error } = await supabase
    .from('modules')
    .select('course_id, courses(title)')
    .eq('id', moduleId)
    .maybeSingle()
  if (error || !mod) return null
  const course = (mod as unknown as { course_id: string; courses: { title: string } | null }).courses
  return { courseId: (mod as { course_id: string }).course_id, courseTitle: course?.title ?? '' }
}
