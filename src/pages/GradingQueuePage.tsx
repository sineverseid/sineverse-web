// SINEVERSE, Antrean penilaian mentor: submission yang belum dinilai,
// diurutkan dari yang paling lama (tertua dulu). Hanya course yang diampu
// mentor (courses.mentor_id), admin melihat semua course. Penilaian:
// skor langsung + umpan balik; submission yang dinilai masuk gradebook.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fmtDate } from '../lib/guarded'
import { fetchCourses, fetchRubricForAssignment, fetchRubricScores, saveRubricScores, sendNotification, supabase } from '../lib/supabase'
import type { Assignment, Course, RubricWithCriteria, Submission } from '../lib/types'
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
  const [saving, setSaving] = useState(false)
  const [rubricByAssignment, setRubricByAssignment] = useState<Record<string, RubricWithCriteria | null>>({})
  const [rubricLoadingId, setRubricLoadingId] = useState<string | null>(null)
  const [criterionScores, setCriterionScores] = useState<Record<string, string>>({})
  const [rubricNote, setRubricNote] = useState<string | null>(null)

  const isAdmin = profile?.role === 'admin'
  const isMentor = profile?.role === 'mentor' || isAdmin

  async function load() {
    if (!user) {
      setLoading(false)
      return
    }
    const currentUser = user
    setRubricByAssignment({})
    try {
      // Semua data diambil dalam 6 query saja (bukan puluhan query berurutan
      // per course). Sebelumnya halaman ini memuat ~60 query satu per satu,
      // sehingga di HP lama sekali dan tampak macet di "Memuat antrean…".
      const courses = await fetchCourses()
      const mine = isAdmin ? courses : courses.filter((c) => c.mentor_id === currentUser.id)
      const courseById = new Map(mine.map((c) => [c.id, c]))
      const courseIds = mine.map((c) => c.id)
      if (courseIds.length === 0) {
        setRows([])
        return
      }
      const { data: modules } = await supabase
        .from('modules')
        .select('id,course_id')
        .in('course_id', courseIds)
      const moduleIds = ((modules ?? []) as { id: string; course_id: string }[]).map((m) => m.id)
      const courseByModule = new Map(
        ((modules ?? []) as { id: string; course_id: string }[]).map((m) => [m.id, m.course_id]),
      )
      if (moduleIds.length === 0) {
        setRows([])
        return
      }
      const { data: lessons } = await supabase
        .from('lessons')
        .select('id,module_id')
        .in('module_id', moduleIds)
      const lessonIds = ((lessons ?? []) as { id: string; module_id: string }[]).map((l) => l.id)
      const courseByLesson = new Map(
        ((lessons ?? []) as { id: string; module_id: string }[]).map((l) => [
          l.id,
          courseByModule.get(l.module_id) ?? '',
        ]),
      )
      if (lessonIds.length === 0) {
        setRows([])
        return
      }
      const { data: assigns } = await supabase
        .from('assignments')
        .select('*')
        .in('lesson_id', lessonIds)
      const assignments = (assigns ?? []) as Assignment[]
      if (assignments.length === 0) {
        setRows([])
        return
      }
      const { data: subs } = await supabase
        .from('submissions')
        .select('*')
        .in('assignment_id', assignments.map((a) => a.id))
        .is('score', null)
        .order('submitted_at', { ascending: true })
      const submissions = (subs ?? []) as Submission[]
      const byAssignment = new Map(assignments.map((a) => [a.id, a]))
      const studentIds = [...new Set(submissions.map((s) => s.user_id))]
      const { data: profiles } = studentIds.length
        ? await supabase.from('profiles').select('id,name').in('id', studentIds)
        : { data: [] as { id: string; name: string | null }[] }
      const names = new Map(
        ((profiles ?? []) as { id: string; name: string | null }[]).map((p) => [p.id, p.name ?? 'Siswa']),
      )
      const queue: QueueRow[] = []
      for (const s of submissions) {
        const a = byAssignment.get(s.assignment_id)
        if (!a) continue
        const course = courseById.get(courseByLesson.get(a.lesson_id) ?? '')
        if (!course) continue
        queue.push({ submission: s, assignment: a, course, studentName: names.get(s.user_id) ?? 'Siswa' })
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

  if (loading) return <div className="page"><p className="muted">Memuat antrean…</p></div>
  if (!isMentor) {
    return (
      <div className="page">
        <h1>Antrean Penilaian</h1>
        <p className="empty">Halaman ini hanya untuk mentor dan admin.</p>
      </div>
    )
  }
  if (error) return <div className="page"><p className="error-box">{error}</p></div>

  /** Total sementara dari skor kriteria yang sedang diisi (belum dibatasi). */
  function rubricTotal(row: QueueRow): number {
    const r = rubricByAssignment[row.assignment.id]
    if (!r) return 0
    return r.criteria.reduce((s, c) => {
      const v = parseInt(criterionScores[c.id] ?? '', 10)
      return s + (Number.isNaN(v) ? 0 : v)
    }, 0)
  }

  async function startGrading(row: QueueRow) {
    setGradingId(row.submission.id)
    setScore('')
    setFeedback('')
    setCriterionScores({})
    setRubricNote(null)
    let rubric = rubricByAssignment[row.assignment.id]
    if (rubric === undefined) {
      setRubricLoadingId(row.submission.id)
      try {
        rubric = await fetchRubricForAssignment(row.assignment.id)
        setRubricByAssignment((prev) => ({ ...prev, [row.assignment.id]: rubric ?? null }))
      } catch {
        setRubricNote('Rubrik gagal dimuat, penilaian memakai skor tunggal.')
        setRubricByAssignment((prev) => ({ ...prev, [row.assignment.id]: null }))
        rubric = null
      } finally {
        setRubricLoadingId(null)
      }
    }
    if (rubric && rubric.criteria.length > 0) {
      try {
        const existing = await fetchRubricScores(row.submission.id)
        const prefill: Record<string, string> = {}
        for (const s of existing) prefill[s.criterion_id] = String(s.score)
        setCriterionScores(prefill)
      } catch {
        // Skor lama tidak termuat, mentor mengisi dari nol.
      }
    }
  }

  async function handleGrade(e: FormEvent, row: QueueRow) {
    e.preventDefault()
    const rubric = rubricByAssignment[row.assignment.id]
    let value: number
    let parsed: { criterion_id: string; score: number }[] = []
    if (rubric && rubric.criteria.length > 0) {
      for (const c of rubric.criteria) {
        const raw = (criterionScores[c.id] ?? '').trim()
        if (raw === '') {
          setNotice(`Isi skor untuk kriteria "${c.title}".`)
          return
        }
        const v = Number(raw)
        if (!Number.isInteger(v) || v < 0 || v > c.max_score) {
          setNotice(`Skor "${c.title}" harus bilangan bulat antara 0 dan ${c.max_score}.`)
          return
        }
        parsed.push({ criterion_id: c.id, score: v })
      }
      // Total = jumlah skor kriteria, dibatasi ke nilai maks. tugas.
      value = Math.min(parsed.reduce((s, p) => s + p.score, 0), row.assignment.max_score)
    } else {
      value = Number(score)
      if (Number.isNaN(value) || value < 0 || value > row.assignment.max_score) {
        setNotice(`Skor harus antara 0 dan ${row.assignment.max_score}.`)
        return
      }
    }
    const { error: updErr } = await supabase
      .from('submissions')
      .update({ score: value, feedback: feedback.trim() || null, graded_at: new Date().toISOString() })
      .eq('id', row.submission.id)
    if (updErr) {
      setNotice('Gagal menyimpan nilai. Coba lagi sebentar lagi.')
      return
    }
    let rubricScoresNote = ''
    if (parsed.length > 0) {
      try {
        await saveRubricScores(row.submission.id, parsed)
      } catch {
        rubricScoresNote = ' Skor per kriteria gagal disimpan, nilai total tetap tersimpan.'
      }
    }
    setSaving(true)
    // Beri tahu siswa (best-effort; gagal kirim tidak membatalkan nilai).
    await sendNotification(
      row.submission.user_id,
      'grade',
      `Tugas "${row.assignment.title}" sudah dinilai`,
      `Nilai kamu: ${value} / ${row.assignment.max_score}.`,
      { assignment_id: row.assignment.id },
    ).catch(() => undefined)
    setNotice(`Submission ${row.studentName} dinilai: ${value}.${rubricScoresNote}`)
    setGradingId(null)
    setScore('')
    setFeedback('')
    setCriterionScores({})
    await load()
    setSaving(false)
  }

  return (
    <div className="page">
      <h1>Antrean Penilaian</h1>
      <WorkspaceNav entries={MENTOR_NAV} />
      <p className="muted">
        Diurutkan dari yang paling lama dikirim (tertua dulu). {rows.length} submission belum dinilai.
      </p>
      {notice && <p className="notice-box">{notice}</p>}
      {saving && <p className="muted">Menyimpan nilai…</p>}
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
                  {rubricNote && <p className="muted">{rubricNote}</p>}
                  {(() => {
                    const r = rubricByAssignment[row.assignment.id]
                    if (rubricLoadingId === row.submission.id) {
                      return <p className="muted">Memuat rubrik…</p>
                    }
                    if (r && r.criteria.length > 0) {
                      return (
                        <>
                          <p className="muted">{r.rubric.title}</p>
                          {r.criteria.map((c) => (
                            <label key={c.id}>
                              {c.title} (maks. {c.max_score})
                              <input
                                type="number"
                                min={0}
                                max={c.max_score}
                                step={1}
                                value={criterionScores[c.id] ?? ''}
                                onChange={(e) => setCriterionScores((prev) => ({ ...prev, [c.id]: e.target.value }))}
                                required
                              />
                            </label>
                          ))}
                          <p className="muted">
                            Total sementara: {Math.min(rubricTotal(row), row.assignment.max_score)} / {row.assignment.max_score}
                          </p>
                        </>
                      )
                    }
                    return (
                      <label>
                        Skor (maks. {row.assignment.max_score})
                        <input type="number" min={0} max={row.assignment.max_score} value={score} onChange={(e) => setScore(e.target.value)} required />
                      </label>
                    )
                  })()}
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
                <button type="button" className="btn btn-primary btn-small" onClick={() => void startGrading(row)}>
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
