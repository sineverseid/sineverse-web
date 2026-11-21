// SINEVERSE — Halaman lesson: strip WATCH → READ → CHECK → DO,
// embed video (YouTube/Vimeo) atau kartu tautan eksternal, navigasi
// prev/next, "Tandai Selesai", dan diskusi lesson (baca + kirim, balasan
// bersarang via parent_id).
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  fetchAssignmentsForLessons,
  fetchCourseLessons,
  fetchDiscussions,
  fetchLesson,
  fetchLessonProgressFor,
  fetchQuizzesForLessons,
  markLessonCompleted,
  markLessonStarted,
  postDiscussion,
  supabase,
} from '../lib/supabase'
import { isMissingTableError } from '../lib/guarded'
import type {
  Assignment,
  Discussion,
  Lesson,
  LessonProgressStatus,
  Quiz,
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
  const [discussions, setDiscussions] = useState<Discussion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [newPost, setNewPost] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [helpfulCounts, setHelpfulCounts] = useState<Record<string, number>>({})
  const [helpfulMine, setHelpfulMine] = useState<Set<string>>(new Set())
  const [reportingId, setReportingId] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState('')

  const canModerate = profile?.role === 'mentor' || profile?.role === 'admin'

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
        // Tabel belum ada — abaikan, diskusi tetap tampil.
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
      try {
        const l = await fetchLesson(id as string)
        if (cancelled) return
        if (!l) {
          setError('Lesson tidak ditemukan.')
          return
        }
        setLesson(l)
        const [assigns, quizList, threads] = await Promise.all([
          fetchAssignmentsForLessons([l.id]),
          fetchQuizzesForLessons([l.id]),
          fetchDiscussions(l.id),
        ])
        if (cancelled) return
        setAssignments(assigns)
        setQuizzes(quizList)
        setDiscussions(threads)
        if (user) {
          const prog = await fetchLessonProgressFor(user.id, l.id)
          if (cancelled) return
          if (prog) setStatus(prog.status)
          if (!prog || prog.status === 'not_started') {
            await markLessonStarted(user.id, l.id)
            if (!cancelled) setStatus('in_progress')
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat lesson.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id])

  // Resolve course + siblings once the lesson is known.
  useEffect(() => {
    if (!lesson) return
    const currentLesson = lesson
    let cancelled = false
    async function resolveCourse() {
      const mods = await fetchModulesByLessonModule(currentLesson.module_id)
      if (cancelled || !mods) return
      setCourseId(mods.courseId)
      setCourseTitle(mods.courseTitle)
      const all = await fetchCourseLessons(mods.courseId)
      if (!cancelled) setSiblings(all)
    }
    void resolveCourse()
    return () => {
      cancelled = true
    }
  }, [lesson])

  if (loading) {
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

  const idx = siblings.findIndex((l) => l.id === lesson.id)
  const prev = idx > 0 ? siblings[idx - 1] : null
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null
  const embed = lesson.video_url ? videoEmbed(lesson.video_url) : null
  const topLevel = [...discussions.filter((d) => d.parent_id === null)].sort(
    (a, b) => Number(b.is_pinned ?? false) - Number(a.is_pinned ?? false),
  )
  const replies = (parentId: string) => discussions.filter((d) => d.parent_id === parentId)

  async function handleComplete() {
    if (!user || !lesson) return
    const l = lesson
    await markLessonCompleted(user.id, l.id)
    setStatus('completed')
    setNotice('Lesson ditandai selesai.')
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
        ? 'Reaksi bermanfaat aktif setelah migrasi 003 dijalankan — lihat supabase/README.md.'
        : err instanceof Error ? err.message : 'Gagal menyimpan reaksi.')
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
        ? 'Fitur ini aktif setelah migrasi 003 dijalankan — lihat supabase/README.md.'
        : err instanceof Error ? err.message : 'Gagal memperbarui diskusi.')
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
        ? 'Pelaporan aktif setelah migrasi 003 dijalankan — lihat supabase/README.md.'
        : err instanceof Error ? err.message : 'Gagal mengirim laporan.')
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
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal mengirim diskusi.')
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
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal mengirim balasan.')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="page">
      {courseId && (
        <Link to={`/course/${courseId}`} className="back-link">
          ← {courseTitle || 'Course'}
        </Link>
      )}
      <h1>
        {lesson.lesson_code ? `${lesson.lesson_code} — ` : ''}
        {lesson.title}
      </h1>
      <p className="muted">
        Status: {status === 'completed' ? 'Selesai' : status === 'in_progress' ? 'Sedang dipelajari' : 'Belum dimulai'}
      </p>

      <ol className="flow-strip" aria-label="Alur belajar">
        <li className={embed ? 'flow-done' : ''}>WATCH — Tonton</li>
        <li className={lesson.content ? 'flow-done' : ''}>READ — Baca</li>
        <li className={quizzes.length > 0 ? 'flow-done' : ''}>CHECK — Cek Pemahaman</li>
        <li className={assignments.length > 0 ? 'flow-done' : ''}>DO — Kerjakan</li>
      </ol>

      <section className="section" aria-label="Video">
        <h2>WATCH</h2>
        {!lesson.video_url ? (
          <p className="empty">Belum ada video untuk lesson ini.</p>
        ) : embed && embed.kind !== 'link' && embed.embedUrl ? (
          <div className="video-wrap">
            <iframe
              src={embed.embedUrl}
              title={`Video: ${lesson.title}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <p>
            <a href={lesson.video_url} target="_blank" rel="noreferrer" className="btn btn-secondary">
              Buka Video (tautan eksternal)
            </a>
          </p>
        )}
      </section>

      <section className="section" aria-label="Materi bacaan">
        <h2>READ</h2>
        {lesson.content ? (
          <div className="lesson-content">{lesson.content}</div>
        ) : (
          <p className="empty">Belum ada materi bacaan untuk lesson ini.</p>
        )}
      </section>

      <section className="section" aria-label="Cek pemahaman">
        <h2>CHECK — Kuis</h2>
        {quizzes.length === 0 ? (
          <p className="empty">Belum ada kuis untuk lesson ini.</p>
        ) : (
          <ul>
            {quizzes.map((q) => (
              <li key={q.id}>
                <Link to={`/kuis/${q.id}`}>{q.title}</Link> (nilai lulus: {q.passing_score})
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-label="Tugas">
        <h2>DO — Tugas</h2>
        {assignments.length === 0 ? (
          <p className="empty">Belum ada tugas untuk lesson ini.</p>
        ) : (
          <ul>
            {assignments.map((a) => (
              <li key={a.id}>
                <Link to={`/tugas/${a.id}`}><strong>{a.title}</strong></Link>
                {a.description ? ` — ${a.description}` : ''} (maks. {a.max_score})
              </li>
            ))}
          </ul>
        )}
      </section>

      {notice && <p className="notice-box">{notice}</p>}

      {user && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleComplete}
          disabled={status === 'completed'}
        >
          {status === 'completed' ? 'Lesson Selesai' : 'Tandai Selesai'}
        </button>
      )}

      <nav className="lesson-nav" aria-label="Navigasi lesson">
        {prev ? (
          <Link to={`/lesson/${prev.id}`} className="btn btn-secondary">
            ← {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link to={`/lesson/${next.id}`} className="btn btn-secondary">
            {next.title} →
          </Link>
        ) : (
          <span />
        )}
      </nav>

      <section className="section" aria-label="Diskusi lesson">
        <h2>Diskusi Lesson</h2>
        {topLevel.length === 0 ? (
          <p className="empty">Belum ada diskusi. Jadilah yang pertama bertanya.</p>
        ) : (
          <ul className="discussion-list">
            {topLevel.map((d) => (
              <li key={d.id} className="discussion-item">
                <p className="discussion-meta">
                  {d.author?.name ?? 'Anggota'} ·{' '}
                  {new Date(d.created_at).toLocaleString('id-ID')}
                  {d.is_pinned ? ' · Disematkan' : ''}
                  {d.is_resolved ? ' · Selesai' : ''}
                </p>
                <p>{d.body}</p>
                <div className="form-actions" style={{ marginBottom: '0.5rem' }}>
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => void toggleHelpful(d.id)}>
                    Bermanfaat ({helpfulCounts[d.id] ?? 0})
                  </button>
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
                {user && reportingId === d.id && (
                  <form className="form form-inline" onSubmit={(e) => handleReport(e, d.id)}>
                    <label>
                      Alasan laporan
                      <input value={reportReason} onChange={(e) => setReportReason(e.target.value)} required placeholder="Mis. spam, tidak sopan, di luar topik…" />
                    </label>
                    <div className="form-actions">
                      <button type="submit" className="btn btn-primary btn-small">Kirim Laporan</button>
                      <button type="button" className="btn btn-ghost btn-small" onClick={() => setReportingId(null)}>Batal</button>
                    </div>
                  </form>
                )}
                <ul className="discussion-replies">
                  {replies(d.id).map((r) => (
                    <li key={r.id}>
                      <p className="discussion-meta">
                        {r.author?.name ?? 'Anggota'} ·{' '}
                        {new Date(r.created_at).toLocaleString('id-ID')}
                        {d.accepted_answer_id === r.id ? ' · Jawaban diterima' : ''}
                      </p>
                      <p>{r.body}</p>
                      <div className="form-actions">
                        <button type="button" className="btn btn-ghost btn-small" onClick={() => void toggleHelpful(r.id)}>
                          Bermanfaat ({helpfulCounts[r.id] ?? 0})
                        </button>
                        {user && d.user_id === user.id && d.accepted_answer_id !== r.id && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-small"
                            onClick={() => void updateDiscussionFlags(d.id, { accepted_answer_id: r.id, is_resolved: true }, 'Balasan ditandai sebagai jawaban yang diterima.')}
                          >
                            Terima sebagai Jawaban
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {user && replyTo !== d.id && (
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => setReplyTo(d.id)}>
                    Balas
                  </button>
                )}
                {user && replyTo === d.id && (
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
        {user ? (
          <form className="form" onSubmit={handlePost}>
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
