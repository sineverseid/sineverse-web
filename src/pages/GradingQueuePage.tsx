// SINEVERSE, Antrean penilaian mentor: submission yang belum dinilai,
// diurutkan dari yang paling lama (tertua dulu). Hanya course yang diampu
// mentor (courses.mentor_id), admin melihat semua course. Penilaian:
// skor langsung + umpan balik; submission yang dinilai masuk gradebook.
// Tab "Rekap Nilai": rata-rata, sebaran predikat, dan daftar nilai
// terbaru — semuanya dihitung dari submissions yang SUDAH dinilai
// (score tidak null) di course yang sama. Skor dinormalisasi ke skala
// 0–100 (score / max_score × 100) supaya ambang predikat sama dengan
// GradebookPage (Sangat Baik ≥85, Baik ≥70, Cukup ≥60, Perlu Latihan
// <60). Bila belum ada submission yang dinilai, tampil "—" / kosong,
// bukan angka karangan.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fmtDate, fmtSize } from '../lib/guarded'
import { fetchCourses, fetchRubricForAssignment, fetchRubricScores, fetchSubmissionFiles, saveRubricScores, sendNotification, supabase } from '../lib/supabase'
import type { Assignment, Course, RubricWithCriteria, Submission, SubmissionFile } from '../lib/types'
import WorkspaceNav from '../components/WorkspaceNav'
import { MENTOR_NAV } from '../lib/workspaceNav'
import Icon from '../components/icons'

interface QueueRow {
  submission: Submission
  assignment: Assignment
  course: Course
  studentName: string
}

/** Satu submission yang sudah dinilai, dengan skor ternormalisasi 0–100. */
interface RecapItem {
  submission: Submission
  assignment: Assignment
  course: Course
  studentName: string
  /** null bila max_score tidak valid sehingga persen tidak bisa dihitung. */
  percent: number | null
}

interface RecapData {
  total: number
  /** Rata-rata persen (0–100), null bila belum ada nilai yang bisa dihitung. */
  avg: number | null
  sangatBaik: number
  baik: number
  cukup: number
  perluLatihan: number
  recent: RecapItem[]
}

const EMPTY_RECAP: RecapData = {
  total: 0,
  avg: null,
  sangatBaik: 0,
  baik: 0,
  cukup: 0,
  perluLatihan: 0,
  recent: [],
}

type RecapTab = 'queue' | 'rekap'

function predicateOf(percent: number): keyof Pick<RecapData, 'sangatBaik' | 'baik' | 'cukup' | 'perluLatihan'> {
  if (percent >= 85) return 'sangatBaik'
  if (percent >= 70) return 'baik'
  if (percent >= 60) return 'cukup'
  return 'perluLatihan'
}

/** Format persen 0–100: bulat bila bulat, satu desimal bila tidak. */
function fmtPct(percent: number): string {
  const rounded = Math.round(percent * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',')
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
  const [tab, setTab] = useState<RecapTab>('queue')
  const [recap, setRecap] = useState<RecapData | null>(null)
  // P26: isi submission yang diperluas (tanpa clamp) — sisanya di-clamp 3 baris.
  const [expandedSubmissions, setExpandedSubmissions] = useState<Set<string>>(new Set())
  // B25: semua file lampiran per submission (bukan hanya file_url pertama).
  const [filesBySubmission, setFilesBySubmission] = useState<Record<string, SubmissionFile[]>>({})
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  // B27: filter antrean/rekap + pencarian.
  const [filterCourses, setFilterCourses] = useState<Course[]>([])
  const [filterCourse, setFilterCourse] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'pass' | 'fail'>('all')
  const [search, setSearch] = useState('')
  // B26: baris rekap yang sedang diedit nilainya (bukan di antrean).
  const [editingRow, setEditingRow] = useState<QueueRow | null>(null)

  const isAdmin = profile?.role === 'admin'
  const isMentor = profile?.role === 'mentor' || isAdmin

  async function load(isCancelled?: () => boolean) {
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
      if (!isCancelled?.()) setFilterCourses(mine)
      if (courseIds.length === 0) {
        setRows([])
        setRecap(EMPTY_RECAP)
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
        setRecap(EMPTY_RECAP)
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
        setRecap(EMPTY_RECAP)
        return
      }
      const { data: assigns } = await supabase
        .from('assignments')
        .select('*')
        .in('lesson_id', lessonIds)
      const assignments = (assigns ?? []) as Assignment[]
      if (assignments.length === 0) {
        setRows([])
        setRecap(EMPTY_RECAP)
        return
      }
      // Rekap memakai SET assignment yang sama dengan antrean: semua
      // submission yang SUDAH dinilai (score tidak null) di course ini.
      const { data: graded } = await supabase
        .from('submissions')
        .select('*')
        .in('assignment_id', assignments.map((a) => a.id))
        .not('score', 'is', null)
        .order('graded_at', { ascending: false })
      const gradedSubs = (graded ?? []) as Submission[]
      const { data: subs } = await supabase
        .from('submissions')
        .select('*')
        .in('assignment_id', assignments.map((a) => a.id))
        .is('score', null)
        .order('submitted_at', { ascending: true })
      const submissions = (subs ?? []) as Submission[]
      const byAssignment = new Map(assignments.map((a) => [a.id, a]))
      // Nama dibutuhkan antrean DAN rekap (siswa yang dinilai belum tentu
      // masih punya submission yang menunggu), jadi gabungkan kedua set id.
      const studentIds = [...new Set([...submissions, ...gradedSubs].map((s) => s.user_id))]
      const { data: profiles } = studentIds.length
        ? await supabase.from('public_profiles').select('id,name').in('id', studentIds)
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
      // B25: semua file lampiran tiap submission antrean (pola yang sama
      // seperti AssignmentPage.loadFilesFor); gagal muat tidak merusak
      // halaman, tampilan jatuh ke tautan file_url tunggal.
      void (async () => {
        const entries = await Promise.all(
          queue.map(async (row) => {
            try {
              return [row.submission.id, await fetchSubmissionFiles(row.submission.id)] as const
            } catch {
              return [row.submission.id, []] as const
            }
          }),
        )
        if (isCancelled?.()) return
        setFilesBySubmission(Object.fromEntries(entries))
        const allFiles = entries.flatMap(([, rows]) => rows)
        const signed = await Promise.all(
          allFiles.map(async (f) => {
            try {
              const { data } = await supabase.storage.from('submission-files').createSignedUrl(f.file_path, 3600)
              return [f.id, data?.signedUrl ?? ''] as const
            } catch {
              return [f.id, ''] as const
            }
          }),
        )
        if (!isCancelled?.()) setSignedUrls(Object.fromEntries(signed.filter(([, u]) => u)))
      })()
      // Rekap Nilai — hanya dari submission yang benar-benar sudah dinilai.
      // P39: satu siswa yang mengirim ulang lalu dinilai lagi punya DUA
      // baris submission bernilai — hitung pasangan (tugas, siswa) yang
      // berbeda, memakai versi terbaru (graded_at paling akhir) tiap
      // pasangan, supaya v2 tidak terhitung dua kali.
      const latestByPair = new Map<string, Submission>()
      for (const s of gradedSubs) {
        const key = `${s.assignment_id}:${s.user_id}`
        const prev = latestByPair.get(key)
        if (!prev || +new Date(s.graded_at ?? s.submitted_at) >= +new Date(prev.graded_at ?? prev.submitted_at)) {
          latestByPair.set(key, s)
        }
      }
      const gradedItems: RecapItem[] = []
      for (const s of latestByPair.values()) {
        const a = byAssignment.get(s.assignment_id)
        if (!a) continue
        const course = courseById.get(courseByLesson.get(a.lesson_id) ?? '')
        if (!course) continue
        gradedItems.push({
          submission: s,
          assignment: a,
          course,
          studentName: names.get(s.user_id) ?? 'Siswa',
          percent:
            s.score !== null && a.max_score > 0 ? (s.score / a.max_score) * 100 : null,
        })
      }
      const percents = gradedItems
        .map((g) => g.percent)
        .filter((p): p is number => p !== null)
      const counts = { sangatBaik: 0, baik: 0, cukup: 0, perluLatihan: 0 }
      for (const p of percents) counts[predicateOf(p)] += 1
      const recent = [...gradedItems]
        .sort(
          (a, b) =>
            +new Date(b.submission.graded_at ?? b.submission.submitted_at) -
            +new Date(a.submission.graded_at ?? a.submission.submitted_at),
        )
        .slice(0, 10)
      setRecap({
        total: gradedItems.length,
        avg:
          percents.length > 0
            ? Math.round((percents.reduce((a, b) => a + b, 0) / percents.length) * 10) / 10
            : null,
        ...counts,
        recent,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat antrean penilaian.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    void load(() => cancelled)
    return () => {
      cancelled = true
    }
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

  async function startGrading(row: QueueRow, prefill?: { score: string; feedback: string }) {
    setGradingId(row.submission.id)
    setScore(prefill?.score ?? '')
    setFeedback(prefill?.feedback ?? '')
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

  /** B26: buka kembali form penilaian untuk submission yang sudah dinilai
   *  (baris rekap) — skor + umpan balik lama diisi ulang supaya mentor
   *  bisa mengoreksi nilai yang salah ketik. */
  async function startEditingGrade(g: RecapItem) {
    const row: QueueRow = { submission: g.submission, assignment: g.assignment, course: g.course, studentName: g.studentName }
    setEditingRow(row)
    setTab('queue')
    await startGrading(row, {
      score: g.submission.score === null ? '' : String(g.submission.score),
      feedback: g.submission.feedback ?? '',
    })
    setNotice(`Mengubah nilai ${g.studentName} untuk "${g.assignment.title}". Simpan untuk menerapkan, atau Batal untuk membatalkan.`)
  }

  async function handleGrade(e: FormEvent, row: QueueRow) {
    e.preventDefault()
    // B28: kunci ganda — handleGrade tidak boleh jalan dua kali.
    if (saving) return
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
    // B28: saving true di AWAL (bukan setelah update selesai) + tombol
    // submit di-disable selama menyimpan.
    setSaving(true)
    try {
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
      setEditingRow(null)
      setScore('')
      setFeedback('')
      setCriterionScores({})
      await load()
    } finally {
      setSaving(false)
    }
  }

  /** B27: minta revisi — umpan balik wajib diisi, skor tetap kosong
   *  sehingga submission tetap di antrean; siswa diberi tahu lewat
   *  notifikasi. Tidak ada kolom status revisi di skema, jadi permintaan
   *  revisi ditandai dari feedback yang terisi pada submission yang
   *  belum dinilai (badge "Revisi diminta" di antrean). */
  async function handleRequestRevision(row: QueueRow) {
    if (saving) return
    if (!feedback.trim()) {
      setNotice('Tulis umpan balik dulu — siswa perlu tahu apa yang harus direvisi.')
      return
    }
    setSaving(true)
    try {
      const { error: updErr } = await supabase
        .from('submissions')
        .update({ feedback: feedback.trim(), graded_at: null })
        .eq('id', row.submission.id)
        .is('score', null)
      if (updErr) {
        setNotice('Gagal meminta revisi. Coba lagi sebentar lagi.')
        return
      }
      await sendNotification(
        row.submission.user_id,
        'revision',
        `Tugas "${row.assignment.title}" diminta revisi`,
        feedback.trim(),
        { assignment_id: row.assignment.id },
      ).catch(() => undefined)
      setNotice(`Revisi diminta dari ${row.studentName} untuk "${row.assignment.title}".`)
      setGradingId(null)
      setScore('')
      setFeedback('')
      setCriterionScores({})
      await load()
    } finally {
      setSaving(false)
    }
  }

  /** B25: semua file lampiran satu submission; bila belum ada baris di
   *  submission_files (pengiriman lama), pakai tautan file_url tunggal. */
  function renderSubmissionFiles(row: QueueRow) {
    const rows = filesBySubmission[row.submission.id] ?? []
    if (rows.length > 0) {
      return (
        <ul>
          {rows.map((f) => (
            <li key={f.id}>
              <a
                href={signedUrls[f.id] ?? supabase.storage.from('submission-files').getPublicUrl(f.file_path).data.publicUrl}
                target="_blank"
                rel="noreferrer"
              >
                {f.file_name}
              </a>
              {f.file_size !== null ? ` (${fmtSize(f.file_size)})` : ''}
            </li>
          ))}
        </ul>
      )
    }
    if (row.submission.file_url) {
      return <p><a href={row.submission.file_url} target="_blank" rel="noreferrer">Lihat file</a></p>
    }
    return null
  }

  /** Form penilaian satu baris (dipakai antrean dan edit nilai rekap). */
  function gradingForm(row: QueueRow) {
    return (
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
          <button type="submit" className="btn btn-primary btn-small" disabled={saving}>
            {saving ? 'Menyimpan…' : 'Simpan Nilai'}
          </button>
          <button type="button" className="btn btn-secondary btn-small" disabled={saving} onClick={() => void handleRequestRevision(row)}>
            Minta Revisi
          </button>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => { setGradingId(null); setEditingRow(null) }}>Batal</button>
        </div>
      </form>
    )
  }

  return (
    <div className="page">
      <h1>Antrean Penilaian</h1>
      <WorkspaceNav entries={MENTOR_NAV} />
      <div className="pill-tabs">
        <button
          type="button"
          className={`pill-tab${tab === 'queue' ? ' active' : ''}`}
          onClick={() => setTab('queue')}
        >
          Antrean ({rows.length})
        </button>
        <button
          type="button"
          className={`pill-tab${tab === 'rekap' ? ' active' : ''}`}
          onClick={() => setTab('rekap')}
        >
          Rekap Nilai{recap && recap.total > 0 ? ` (${recap.total})` : ''}
        </button>
      </div>
      {notice && <p className="notice-box">{notice}</p>}
      {saving && <p className="muted">Menyimpan nilai…</p>}
      {/* B27: filter course + pencarian (berlaku di antrean dan rekap);
          rekap juga bisa disaring lulus / belum lulus. */}
      <div className="filter-bar">
        <select
          value={filterCourse}
          onChange={(e) => setFilterCourse(e.target.value)}
          aria-label="Filter course"
          style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
        >
          <option value="">Semua course</option>
          {filterCourses.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
        {tab === 'rekap' && (
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | 'pass' | 'fail')}
            aria-label="Filter status nilai"
            style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
          >
            <option value="all">Semua status</option>
            <option value="pass">Lulus (≥70)</option>
            <option value="fail">Belum lulus (&lt;70)</option>
          </select>
        )}
        <input
          className="search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari siswa atau tugas…"
          aria-label="Cari siswa atau tugas"
        />
      </div>
      {tab === 'rekap' ? (
        <>
          {!recap ? (
            <p className="muted">Memuat rekap…</p>
          ) : recap.total === 0 ? (
            <div className="empty-card">
              <span className="empty-card-icon" aria-hidden="true">
                <Icon name="grade" size={32} />
              </span>
              <h3>Belum ada nilai masuk</h3>
              <p>
                Rekap nilai akan terisi setelah kamu menilai submission dari course yang
                kamu ampu. Nilai, sebaran predikat, dan daftar nilai terbaru muncul di
                sini.
              </p>
              <p>
                <Link to="/mentor">Lihat Course Saya →</Link>
              </p>
            </div>
          ) : (
            <>
              <div className="stat-grid">
                <div className="stat-card">
                  <span className="stat-num">
                    {recap.avg === null ? '—' : `${fmtPct(recap.avg)} / 100`}
                  </span>
                  <span className="stat-label">Rata-rata Nilai</span>
                </div>
                <div className="stat-card">
                  <span className="stat-num">{recap.total}</span>
                  {/* P39: total = pasangan (tugas, siswa) yang berbeda, bukan
                      jumlah baris submission — versi kirim-ulang tidak ganda. */}
                  <span className="stat-label">Tugas–Siswa Dinilai</span>
                </div>
              </div>
              <div className="dash-section-head">
                <h2>Sebaran Predikat</h2>
              </div>
              <p className="muted">
                Dari {recap.total} pasangan tugas–siswa yang sudah dinilai — bila satu siswa
                mengirim ulang, hanya versi terbaru yang dihitung
                (Sangat Baik ≥85, Baik ≥70, Cukup ≥60, Perlu Latihan &lt;60).
              </p>
              <ul className="list">
                {(
                  [
                    ['Sangat Baik', recap.sangatBaik],
                    ['Baik', recap.baik],
                    ['Cukup', recap.cukup],
                    ['Perlu Latihan', recap.perluLatihan],
                  ] as const
                ).map(([label, count]) => (
                  <li key={label} className="list-row">
                    <span>{label}</span>
                    <span>
                      {count} penilaian
                      <span className="progress-track" style={{ display: 'block', width: 120 }}>
                        <span
                          className="progress-fill"
                          style={{ width: `${recap.total > 0 ? (count / recap.total) * 100 : 0}%` }}
                        />
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="dash-section-head">
                <h2>Daftar Nilai Terbaru</h2>
              </div>
              <div className="grade-table-wrap">
                <table className="grade-table">
                  <thead>
                    <tr>
                      <th>Siswa</th>
                      <th>Tugas</th>
                      <th>Course</th>
                      <th>Nilai</th>
                      <th>Dinilai</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recap.recent
                      .filter((g) => (filterCourse === '' || g.course.id === filterCourse))
                      .filter((g) =>
                        filterStatus === 'all' ||
                        (filterStatus === 'pass' ? (g.percent ?? 0) >= 70 : (g.percent ?? 0) < 70),
                      )
                      .filter((g) => {
                        const q = search.trim().toLowerCase()
                        if (!q) return true
                        return `${g.studentName} ${g.assignment.title} ${g.course.title}`.toLowerCase().includes(q)
                      })
                      .map((g) => (
                      <tr key={g.submission.id}>
                        <td>{g.studentName}</td>
                        <td>{g.assignment.title}</td>
                        <td>{g.course.title}</td>
                        <td>
                          {g.percent === null
                            ? `${g.submission.score ?? '—'} / ${g.assignment.max_score}`
                            : `${fmtPct(g.percent)} / 100 (${g.submission.score} / ${g.assignment.max_score})`}
                        </td>
                        <td>{fmtDate(g.submission.graded_at ?? g.submission.submitted_at)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost btn-small"
                            onClick={() => void startEditingGrade(g)}
                          >
                            Ubah nilai
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      ) : (
        <>
      <p className="muted">
        Diurutkan dari yang paling lama dikirim (tertua dulu). {rows.length} submission belum dinilai.
      </p>
      {/* B26: form ubah nilai untuk baris rekap (bukan bagian antrean). */}
      {editingRow && (
        <div className="task-card" style={{ marginBottom: '1rem' }}>
          <span className="task-icon">
            <Icon name="fileText" size={24} />
          </span>
          <span className="task-body">
            <h3>Ubah Nilai — {editingRow.assignment.title}</h3>
            <p>
              {editingRow.studentName} • {editingRow.course.title} • {fmtDate(editingRow.submission.submitted_at)}
            </p>
            {gradingForm(editingRow)}
          </span>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="empty-card">
          <span className="empty-card-icon" aria-hidden="true">
            <Icon name="fileText" size={32} />
          </span>
          <h3>Antrean kosong</h3>
          <p>
            Tidak ada submission yang menunggu penilaian. Submission baru dari siswa di
            course yang kamu ampu akan muncul di sini, diurutkan dari yang paling lama
            dikirim.
          </p>
          <p>
            <Link to="/mentor">Lihat Course Saya →</Link>
          </p>
        </div>
      ) : (
        <ul className="list">
          {rows
            .filter((row) => filterCourse === '' || row.course.id === filterCourse)
            .filter((row) => {
              const q = search.trim().toLowerCase()
              if (!q) return true
              return `${row.studentName} ${row.assignment.title} ${row.course.title}`.toLowerCase().includes(q)
            })
            .map((row) => (
            <li key={row.submission.id} className="task-card">
              <span className="task-icon">
                <Icon name="fileText" size={24} />
              </span>
              <span className="task-body">
                <h3>{row.assignment.title}</h3>
                <p>
                  {row.studentName} • {row.course.title} • {fmtDate(row.submission.submitted_at)}
                </p>
                {row.submission.feedback && (
                  <p>
                    <span style={{ display: 'inline-block', background: '#fff3cd', color: '#7a5b00', padding: '0.2rem 0.5rem', borderRadius: 6, fontSize: '0.85rem', fontWeight: 600 }}>
                      Revisi diminta
                    </span>
                    {' '}{row.submission.feedback}
                  </p>
                )}
                {/* P26: isi submission di-clamp 3 baris + bisa diperluas —
                    sebelumnya tampil utuh tanpa pemotongan di antrean. */}
                {(() => {
                  const content = row.submission.content ?? '—'
                  const expanded = expandedSubmissions.has(row.submission.id)
                  const long = content.length > 200
                  return (
                    <>
                      <p style={expanded || !long ? undefined : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {content}
                      </p>
                      {long && (
                        <p>
                          <button
                            type="button"
                            className="btn btn-ghost btn-small"
                            onClick={() => setExpandedSubmissions((prev) => {
                              const next = new Set(prev)
                              if (next.has(row.submission.id)) next.delete(row.submission.id)
                              else next.add(row.submission.id)
                              return next
                            })}
                          >
                            {expanded ? 'Sembunyikan' : 'Lihat selengkapnya'}
                          </button>
                        </p>
                      )}
                    </>
                  )
                })()}
                {renderSubmissionFiles(row)}
                {gradingId === row.submission.id ? (
                  gradingForm(row)
                ) : (
                  <button type="button" className="btn-mint" onClick={() => void startGrading(row)}>
                    Nilai
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
        </>
      )}
      <p><Link to="/mentor">Kembali ke Mentor Workspace</Link></p>
    </div>
  )
}
