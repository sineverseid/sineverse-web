// SINEVERSE — Antrean penilaian mentor: submission yang belum dinilai,
// diurutkan dari yang paling lama (tertua dulu). Hanya course yang diampu
// mentor (courses.mentor_id) — admin melihat semua course. Penilaian:
// skor langsung + umpan balik; submission yang dinilai masuk gradebook.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fmtDate } from '../lib/guarded'
import { fetchCourseLessons, fetchCourses, sendNotification, supabase } from '../lib/supabase'
import type { Assignment, Course, Submission } from '../lib/types'
import WorkspaceNav from '../components/WorkspaceNav'
import { MENTOR_NAV } from '../lib/workspaceNav'

interface QueueRow {
  submission: Submission
  assignment: Assignment
  course: Course
  studentName: string
}

export default function GradingQueuePage() {
  const { user, profile } = useAuth()
  const [rows, setRows] = useState<QueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [gradingId, setGradingId] = useState<string | null>(null)
  const [score, setScore] = useState('')
  const [feedback, setFeedback] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const isAdmin = profile?.role === 'admin'
  const isMentor = profile?.role === 'mentor' || isAdmin

  async function load() {
    if (!user) return
    const currentUser = user
    try {
      const courses = await fetchCourses()
      const mine = isAdmin ? courses : courses.filter((c) => c.mentor_id === currentUser.id)
      const queue: QueueRow[] = []
      for (const course of mine) {
        const lessons = await fetchCourseLessons(course.id)
        const lessonIds = lessons.map((l) => l.id)
        if (lessonIds.length === 0) continue
        const { data: assigns } = await supabase
          .from('assignments')
          .select('*')
          .in('lesson_id', lessonIds)
        const assignments = (assigns ?? []) as Assignment[]
        if (assignments.length === 0) continue
        const { data: subs } = await supabase
          .from('submissions')
          .select('*')
          .in('assignment_id', assignments.map((a) => a.id))
          .is('score', null)
          .order('submitted_at', { ascending: true })
        const byAssignment = new Map(assignments.map((a) => [a.id, a]))
        const studentIds = [...new Set(((subs ?? []) as Submission[]).map((s) => s.user_id))]
        const { data: profiles } = studentIds.length
          ? await supabase.from('profiles').select('id,name').in('id', studentIds)
          : { data: [] as { id: string; name: string | null }[] }
        const names = new Map(
          ((profiles ?? []) as { id: string; name: string | null }[]).map((p) => [p.id, p.name ?? 'Siswa']),
        )
        for (const s of (subs ?? []) as Submission[]) {
          const a = byAssignment.get(s.assignment_id)
          if (!a) continue
          queue.push({ submission: s, assignment: a, course, studentName: names.get(s.user_id) ?? 'Siswa' })
        }
      }
      queue.sort((a, b) => +new Date(a.submission.submitted_at) - +new Date(b.submission.submitted_at))
      setRows(queue)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat antrean penilaian.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profile?.role])

  if (!isMentor) {
    return (
      <div className="page">
        <h1>Antrean Penilaian</h1>
        <p className="empty">Halaman ini hanya untuk mentor dan admin.</p>
      </div>
    )
  }
  if (loading) return <div className="page"><p className="muted">Memuat antrean…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>

  async function handleGrade(e: FormEvent, row: QueueRow) {
    e.preventDefault()
    const value = Number(score)
    if (Number.isNaN(value) || value < 0 || value > row.assignment.max_score) {
      setNotice(`Skor harus antara 0 dan ${row.assignment.max_score}.`)
      return
    }
    const { error: updErr } = await supabase
      .from('submissions')
      .update({ score: value, feedback: feedback.trim() || null, graded_at: new Date().toISOString() })
      .eq('id', row.submission.id)
    if (updErr) {
      setNotice(updErr.message)
      return
    }
    // Beri tahu siswa (best-effort; gagal kirim tidak membatalkan nilai).
    await sendNotification(
      row.submission.user_id,
      'grade',
      `Tugas "${row.assignment.title}" sudah dinilai`,
      `Nilai kamu: ${value} / ${row.assignment.max_score}.`,
      { assignment_id: row.assignment.id },
    ).catch(() => undefined)
    setNotice(`Submission ${row.studentName} dinilai: ${value}.`)
    setGradingId(null)
    setScore('')
    setFeedback('')
    setLoading(true)
    await load()
  }

  return (
    <div className="page">
      <h1>Antrean Penilaian</h1>
      <WorkspaceNav entries={MENTOR_NAV} />
      <p className="muted">
        Diurutkan dari yang paling lama dikirim (tertua dulu). {rows.length} submission belum dinilai.
      </p>
      {notice && <p className="notice-box">{notice}</p>}
      {rows.length === 0 ? (
        <p className="empty">Tidak ada submission yang menunggu penilaian.</p>
      ) : (
        <ul className="discussion-list">
          {rows.map((row) => (
            <li key={row.submission.id} className="discussion-item">
              <p className="discussion-meta">
                {row.course.title} · {row.assignment.title} · {row.studentName} ·{' '}
                {fmtDate(row.submission.submitted_at)}
              </p>
              <p>{row.submission.content ?? '—'}</p>
              {row.submission.file_url && (
                <p><a href={row.submission.file_url} target="_blank" rel="noreferrer">Lihat file</a></p>
              )}
              {gradingId === row.submission.id ? (
                <form className="form" onSubmit={(e) => handleGrade(e, row)}>
                  <label>
                    Skor (maks. {row.assignment.max_score})
                    <input type="number" min={0} max={row.assignment.max_score} value={score} onChange={(e) => setScore(e.target.value)} required />
                  </label>
                  <label>
                    Umpan balik
                    <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} placeholder="Apa yang bagus, apa yang bisa diperbaiki…" />
                  </label>
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary btn-small">Simpan Nilai</button>
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => setGradingId(null)}>Batal</button>
                  </div>
                </form>
              ) : (
                <button type="button" className="btn btn-primary btn-small" onClick={() => { setGradingId(row.submission.id); setScore(''); setFeedback('') }}>
                  Nilai
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p><Link to="/mentor">Kembali ke Mentor Workspace</Link></p>
    </div>
  )
}
