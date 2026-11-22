// SINEVERSE, Halaman lesson: strip WATCH → READ → CHECK → DO,
// embed video (YouTube/Vimeo) atau kartu tautan eksternal, navigasi
// prev/next, "Tandai Selesai", dan diskusi lesson (baca + kirim, balasan
// bersarang via parent_id).
//
// Akses: lesson hanya untuk peserta course, mentor pengampu, atau admin.
// Companion fetch (tugas, kuis, diskusi, progres) dimuat independen:
// satu gagal tidak boleh menenggelamkan lesson.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import Icon from '../components/icons'
import { useAuth } from '../context/AuthContext'
import {
  fetchAssignmentsForLessons,
  fetchCourse,
  fetchCourseLessons,
  fetchDiscussions,
  fetchEnrollment,
  fetchLesson,
  fetchLessonProgress,
  fetchLessonProgressFor,
  fetchLessonResources,
  fetchLessons,
  fetchModules,
  fetchQuizAttempts,
  fetchQuizzesForLessons,
  fetchSubmissions,
  markLessonCompleted,
  markLessonStarted,
  postDiscussion,
  sendNotification,
  supabase,
} from '../lib/supabase'
import { isMissingTableError } from '../lib/guarded'
import type {
  Assignment,
  Discussion,
  Lesson,
  LessonProgressStatus,
  LessonResource,
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

export default function LessonDetailPage() {
  const { id } = useParams<{ id: string }>()
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
  const [passedQuiz, setPassedQuiz] = useState(false)
  const [submittedAssignment, setSubmittedAssignment] = useState(false)
  const [saving, setSaving] = useState(false)

  const [newPost, setNewPost] = useState('')
  const [discussionQuery, setDiscussionQuery] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [helpfulCounts, setHelpfulCounts] = useState<Record<string, number>>({})
  const [helpfulMine, setHelpfulMine] = useState<Set<string>>(new Set())
  const [reportingId, setReportingId] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState('')

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
      setPassedQuiz(false)
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
      let qs: Quiz[] = []
      // Kunci berurutan (migrasi 013): hanya untuk peserta biasa, bukan
      // admin / mentor pengampu. Gagal membaca mode akses = fail-open:
      // lesson tetap tampil, tidak terkunci.
      let seqLocked = false
      {
        const [, assignsRes, qsRes] = await Promise.all([
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
            } catch {
              if (!cancelled) setDiscussionError('Diskusi gagal dimuat. Coba muat ulang halaman.')
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
        ])
        assigns = assignsRes
        qs = qsRes
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
              if (!cancelled) {
                setQuizAttempts(attempts)
                setPassedQuiz(
                  attempts.some((a) =>
                    qs.some((q) => q.id === a.quiz_id && a.score != null && a.score >= q.passing_score),
                  ),
                )
              }
            } catch {
              if (!cancelled) setPassedQuiz(false)
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

  // Strip mencerminkan penyelesaian nyata, bukan sekadar konten ada:
  // WATCH/READ menyala saat lesson sudah dimulai (in_progress/completed;
  // in_progress dipakai sebagai proksi "sudah dibaca" karena pembacaan
  // tidak dilacak per baris). CHECK hanya saat ada percobaan kuis lulus,
  // DO hanya saat tugas sudah dikirim. Bila percobaan/submission gagal
  // dimuat, strip tampil belum selesai, bukan menyala.
  const watchDone = status === 'in_progress' || status === 'completed'
  const readDone = watchDone
  const checkDone = passedQuiz
  const doDone = submittedAssignment

  // Kuis dipisah menurut jenisnya (migrasi 015): kuis lama tanpa kind
  // dibaca sebagai 'quiz'. Satu kuis hanya muncul di satu seksi.
  const pretests = quizzes.filter((q) => (q.kind ?? 'quiz') === 'pretest')
  const posttests = quizzes.filter((q) => (q.kind ?? 'quiz') === 'posttest')
  const plainQuizzes = quizzes.filter((q) => (q.kind ?? 'quiz') === 'quiz')

  const bestAttemptScore = (quizId: string): number | null => {
    let best: number | null = null
    for (const a of quizAttempts) {
      if (a.quiz_id !== quizId || a.score === null) continue
      best = best === null ? a.score : Math.max(best, a.score)
    }
    return best
  }

  const quizItems = (list: Quiz[]) => (
    <ul>
      {list.map((q) => {
        const best = bestAttemptScore(q.id)
        return (
          <li key={q.id}>
            <Link to={`/kuis/${q.id}`}>{q.title}</Link> (nilai lulus: {q.passing_score}
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
    } catch {
      setNotice('Gagal menandai lesson selesai. Periksa koneksi lalu coba lagi.')
    } finally {
      setSaving(false)
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
    setPosting(true)
    try {
      const row = await postDiscussion(l.id, user.id, newPost.trim(), null)
      row.author = { name: profile?.name ?? null, photo_url: profile?.photo_url ?? null }
      setDiscussions((d) => [...d, row])
      setNewPost('')
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

  async function handleReply(e: FormEvent, parentId: string) {
    e.preventDefault()
    if (!user || !lesson || !replyBody.trim()) return
    const l = lesson
    setPosting(true)
    try {
      const row = await postDiscussion(l.id, user.id, replyBody.trim(), parentId)
      row.author = { name: profile?.name ?? null, photo_url: profile?.photo_url ?? null }
      setDiscussions((d) => [...d, row])
      setReplyBody('')
      setReplyTo(null)
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
      {courseId && (
        <Link to={`/course/${courseId}`} className="back-link">
          ← {courseTitle || 'Course'}
        </Link>
      )}
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

      <ol className="flow-strip" aria-label="Alur belajar">
        <li className={watchDone ? 'flow-done' : ''} title="Tonton">WATCH</li>
        <li className={readDone ? 'flow-done' : ''} title="Baca">READ</li>
        <li className={checkDone ? 'flow-done' : ''} title="Cek Pemahaman">CHECK</li>
        <li className={doDone ? 'flow-done' : ''} title="Kerjakan">DO</li>
      </ol>

      <section className="section" aria-label="Pretest">
        <h2>Pretest</h2>
        <p className="muted">Kerjakan pretest sebelum mulai belajar untuk mengukur pengetahuan awalmu.</p>
        {quizError ? (
          <p className="error-box">{quizError}</p>
        ) : pretests.length === 0 ? (
          <p className="empty">Belum tersedia.</p>
        ) : (
          quizItems(pretests)
        )}
      </section>

      <section className="section" aria-label="Video">
        <div className="dash-section-head">
          <h2>Video Materi</h2>
        </div>
        {!lesson.video_url ? (
          <div className="lesson-video-empty">Materi ini tidak memiliki video. Baca materi di bawah ini.</div>
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
      </section>

      <section className="section" aria-label="Tentang Materi">
        <div className="dash-section-head">
          <h2>Tentang Materi</h2>
        </div>
        {lesson.content ? (
          <div className="lesson-content">{lesson.content}</div>
        ) : (
          <p className="empty">Belum ada materi bacaan untuk lesson ini.</p>
        )}
      </section>

      {resourcesError && <p className="muted">{resourcesError}</p>}
      {resources.length > 0 && (
        <section className="section" aria-label="File Pendukung">
          <div className="dash-section-head">
            <h2>File Pendukung</h2>
          </div>
          <ul className="list">
            {resources.map((r) => {
              const kindLabel =
                r.kind === 'pdf'
                  ? 'PDF'
                  : r.kind === 'reading'
                    ? 'Bacaan'
                    : r.kind === 'video'
                      ? 'Video'
                      : r.kind === 'image'
                        ? 'Gambar'
                        : r.kind === 'link'
                          ? 'Tautan'
                          : 'File'
              const iconName = r.kind === 'reading' ? 'book' : r.kind === 'video' ? 'film' : 'fileText'
              const rowBody = (
                <>
                  <span className="file-icon">
                    <Icon name={iconName} size={20} />
                  </span>
                  <span className="file-body">
                    <strong>{r.title}</strong>
                    <span>{kindLabel}</span>
                  </span>
                  {r.url ? <Icon name="download" size={18} /> : null}
                </>
              )
              return (
                <li key={r.id}>
                  {r.url ? (
                    <a className="file-row" href={r.url} target="_blank" rel="noreferrer">
                      {rowBody}
                    </a>
                  ) : (
                    <div className="file-row">{rowBody}</div>
                  )}
                  {r.kind === 'reading' && r.body ? <p>{r.body}</p> : null}
                  {r.kind === 'image' && r.url ? (
                    <div>
                      <img src={r.url} alt={r.title} style={{ maxWidth: '100%' }} />
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="section" aria-label="Posttest">
        <h2>Posttest</h2>
        <p className="muted">Kerjakan posttest setelah selesai mempelajari materi untuk mengukur pemahamanmu.</p>
        {quizError ? (
          <p className="error-box">{quizError}</p>
        ) : posttests.length === 0 ? (
          <p className="empty">Belum tersedia.</p>
        ) : (
          quizItems(posttests)
        )}
      </section>

      <section className="section" aria-label="Cek pemahaman">
        <h2>CHECK, Kuis</h2>
        {quizError ? (
          <p className="error-box">{quizError}</p>
        ) : plainQuizzes.length === 0 ? (
          <p className="empty">Belum ada kuis untuk lesson ini.</p>
        ) : (
          quizItems(plainQuizzes)
        )}
      </section>

      <section className="section" aria-label="Tugas">
        <h2>DO, Tugas</h2>
        {assignError ? (
          <p className="error-box">{assignError}</p>
        ) : assignments.length === 0 ? (
          <p className="empty">Belum ada tugas untuk lesson ini.</p>
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
      </section>

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
            <button
              type="button"
              className="btn-mint"
              onClick={handleComplete}
              disabled={status === 'completed' || saving}
            >
              {saving
                ? 'Menyimpan…'
                : status === 'completed'
                  ? 'Lesson Selesai'
                  : next
                    ? 'Selesai & Lanjutkan →'
                    : 'Tandai Selesai'}
            </button>
          )}
        </section>
      )}

      <nav className="lesson-nav" aria-label="Navigasi lesson">
        {prev ? (
          <Link
            to={`/lesson/${prev.id}`}
            className="btn btn-secondary lesson-nav-title"
            title={prev.title}
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '45vw', minWidth: 0 }}
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
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '45vw', minWidth: 0 }}
          >
            {next.title} →
          </Link>
        ) : (
          <span />
        )}
      </nav>

      <section className="section" aria-label="Diskusi lesson">
        <h2>Diskusi Lesson</h2>
        {discussionError ? (
          <p className="error-box">{discussionError}</p>
        ) : topLevel.length === 0 ? (
          <p className="empty">Belum ada diskusi. Jadilah yang pertama bertanya.</p>
        ) : (
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
            {visibleTopLevel.length === 0 ? (
              <p className="empty">Tidak ada diskusi yang cocok dengan pencarian.</p>
            ) : (
              <ul className="discussion-list">
                {visibleTopLevel.map((d) => (
              <li key={d.id} className="discussion-item">
                <p className="discussion-meta">
                  {d.author?.name ?? 'Anggota'} ·{' '}
                  {new Date(d.created_at).toLocaleString('id-ID')}
                  {d.is_pinned ? ' · Disematkan' : ''}
                  {d.is_resolved ? ' · Selesai' : ''}
                </p>
                <p>{d.body}</p>
                <div className="form-actions" style={{ marginBottom: '0.5rem' }}>
                  {user && (
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => void toggleHelpful(d.id)}>
                      Bermanfaat ({helpfulCounts[d.id] ?? 0})
                    </button>
                  )}
                  {canModerate && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => void updateDiscussionFlags(d.id, { is_pinned: !(d.is_pinned ?? false) }, d.is_pinned ? 'Diskusi dilepas dari sematan.' : 'Diskusi disematkan.')}
                    >
                      {d.is_pinned ? 'Lepas Sematan' : 'Sematkan'}
                    </button>
                  )}
                  {user && d.user_id === user.id && !d.is_resolved && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => void updateDiscussionFlags(d.id, { is_resolved: true }, 'Diskusi ditandai selesai.')}
                    >
                      Tandai Selesai
                    </button>
                  )}
                  {user && reportingId !== d.id && (
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => setReportingId(d.id)}>
                      Laporkan
                    </button>
                  )}
                </div>
                {user && reportingId === d.id && reportForm(d.id)}
                <ul className="discussion-replies">
                  {replies(d.id).map((r) => (
                    <li key={r.id}>
                      <p className="discussion-meta">
                        {r.author?.name ?? 'Anggota'} ·{' '}
                        {new Date(r.created_at).toLocaleString('id-ID')}
                        {r.is_pinned ? ' · Disematkan' : ''}
                        {d.accepted_answer_id === r.id ? ' · Jawaban diterima' : ''}
                      </p>
                      <p>{r.body}</p>
                      <div className="form-actions">
                        {user && (
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
                        {user && d.user_id === user.id && d.accepted_answer_id !== r.id && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-small"
                            onClick={() => void updateDiscussionFlags(d.id, { accepted_answer_id: r.id, is_resolved: true }, 'Balasan ditandai sebagai jawaban yang diterima.')}
                          >
                            Terima sebagai Jawaban
                          </button>
                        )}
                        {user && reportingId !== r.id && (
                          <button type="button" className="btn btn-ghost btn-small" onClick={() => setReportingId(r.id)}>
                            Laporkan
                          </button>
                        )}
                      </div>
                      {user && reportingId === r.id && reportForm(r.id)}
                    </li>
                  ))}
                </ul>
                {user && !isAdmin && replyTo !== d.id && (
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => setReplyTo(d.id)}>
                    Balas
                  </button>
                )}
                {user && !isAdmin && replyTo === d.id && (
                  <form className="form" onSubmit={(e) => handleReply(e, d.id)}>
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
                    <div className="form-actions">
                      <button type="submit" className="btn btn-primary btn-small" disabled={posting}>
                        Kirim Balasan
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={() => setReplyTo(null)}
                      >
                        Batal
                      </button>
                    </div>
                  </form>
                )}
              </li>
                ))}
              </ul>
            )}
          </>
        )}
        {user ? (
          isAdmin ? (
            <p className="muted">
              Kamu masuk sebagai admin (mode pantau): diskusi hanya bisa dibaca dan dimoderasi, tidak bisa ikut menulis.
            </p>
          ) : (
          <form className="form" onSubmit={handlePost}>
            {notice && <p className="notice-box">{notice}</p>}
            <label>
              Tulis pertanyaan atau komentar
              <textarea
                value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
                rows={3}
                required
                placeholder="Apa yang ingin kamu tanyakan tentang lesson ini?"
              />
            </label>
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
      </section>
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
