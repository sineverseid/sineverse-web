// SINEVERSE — Tugas: lihat tugas + rubrik + tenggat, kirim teks dan/atau
// file (bucket submission-files), simpan draft (lokal, per akun + tugas),
// kirim ulang = baris versi baru. Skema 001 tidak punya kolom tenggat /
// rubrik terpisah — deskripsi dipakai sebagai rubrik, dan bila due_date
// (009) belum ada, halaman menyatakan jujur bahwa belum ada tenggat.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fmtDate } from '../lib/guarded'
import { fetchSubmissions, supabase, uploadToBucket } from '../lib/supabase'
import type { Assignment, Submission } from '../lib/types'

type AssignmentRow = Assignment & { due_date?: string | null; rubric?: string | null }
type SubmissionRow = Submission & { is_draft?: boolean | null; version?: number | null; is_late?: boolean | null }

export default function AssignmentPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [assignment, setAssignment] = useState<AssignmentRow | null>(null)
  const [subs, setSubs] = useState<SubmissionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const draftKey = user && id ? `sineverse-draft-${user.id}-${id}` : ''

  useEffect(() => {
    if (!id || !user) return
    const assignmentId = id
    const currentUser = user
    let cancelled = false
    async function load() {
      try {
        const { data, error: aErr } = await supabase
          .from('assignments')
          .select('*')
          .eq('id', assignmentId)
          .maybeSingle()
        if (aErr) throw aErr
        if (cancelled) return
        setAssignment(data as AssignmentRow | null)
        const all = await fetchSubmissions(currentUser.id)
        if (cancelled) return
        setSubs(
          (all as SubmissionRow[])
            .filter((s) => s.assignment_id === assignmentId)
            .sort((a, b) => +new Date(b.submitted_at) - +new Date(a.submitted_at)),
        )
        const saved = draftKey ? localStorage.getItem(draftKey) : null
        if (saved) setContent(saved)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat tugas.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id, user, draftKey])

  if (loading) return <div className="page"><p className="muted">Memuat tugas…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (!assignment) return <div className="page"><p className="empty">Tugas tidak ditemukan.</p><Link to="/akademi">Kembali ke Akademi</Link></div>

  const latest = subs.find((s) => !s.is_draft) ?? subs[0]
  const nextVersion = subs.reduce((m, s) => Math.max(m, s.version ?? 1), 0) + 1
  const isLate = assignment.due_date ? new Date() > new Date(assignment.due_date) : false

  function handleSaveDraft() {
    if (!draftKey) return
    localStorage.setItem(draftKey, content)
    setNotice('Draft tersimpan di perangkat ini.')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const currentAssignment = assignment
    if (!user || !currentAssignment || (!content.trim() && !file)) {
      setNotice('Isi jawaban teks atau pilih file untuk dikirim.')
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      let fileUrl: string | null = null
      if (file) {
        fileUrl = await uploadToBucket(
          'submission-files',
          `${user.id}/${currentAssignment.id}/v${nextVersion}-${file.name}`,
          file,
        )
        if (!fileUrl) {
          setNotice('Bucket submission-files belum tersedia — file tidak bisa diunggah. Kirim jawaban teks saja, atau minta admin membuat bucket-nya (lihat supabase/README.md).')
          setBusy(false)
          return
        }
      }
      const { error: insErr } = await supabase.from('submissions').insert({
        assignment_id: currentAssignment.id,
        user_id: user.id,
        content: content.trim() || null,
        file_url: fileUrl,
        version: nextVersion,
        is_late: isLate,
        is_draft: false,
      })
      if (insErr) throw insErr
      if (draftKey) localStorage.removeItem(draftKey)
      setContent('')
      setFile(null)
      const all = await fetchSubmissions(user.id)
      setSubs(
        (all as SubmissionRow[])
          .filter((s) => s.assignment_id === assignment.id)
          .sort((a, b) => +new Date(b.submitted_at) - +new Date(a.submitted_at)),
      )
      setNotice(
        isLate
          ? `Terkirim sebagai versi ${nextVersion} — ditandai terlambat (lewat tenggat ${fmtDate(currentAssignment.due_date)}).`
          : `Terkirim sebagai versi ${nextVersion}.`,
      )
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal mengirim tugas.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <Link to="/akademi" className="back-link">← Akademi</Link>
      <h1>{assignment.title}</h1>
      <p className="muted">
        Nilai maks.: {assignment.max_score}
        {' · '}Tenggat:{' '}
        {assignment.due_date ? fmtDate(assignment.due_date) : 'belum ada tenggat yang tercatat untuk tugas ini'}
        {isLate ? ' · Sudah lewat tenggat — pengiriman akan ditandai terlambat.' : ''}
      </p>
      <section className="section">
        <h2>Deskripsi &amp; Rubrik</h2>
        <div className="lesson-content">
          {assignment.rubric ?? assignment.description ?? 'Belum ada deskripsi/rubrik untuk tugas ini.'}
        </div>
      </section>

      {latest && (
        <section className="section">
          <h2>Pengiriman Terakhir</h2>
          <p>
            Versi {latest.version ?? 1} · {fmtDate(latest.submitted_at)}
            {latest.is_late ? ' · Terlambat' : ''}
            {' · '}Nilai: {latest.score === null ? 'belum dinilai' : `${latest.score} / ${assignment.max_score}`}
          </p>
          {latest.feedback && <p>Umpan balik mentor: {latest.feedback}</p>}
          {latest.file_url && <p><a href={latest.file_url} target="_blank" rel="noreferrer">Lihat file terkirim</a></p>}
        </section>
      )}

      {notice && <p className="notice-box">{notice}</p>}

      <form className="form" onSubmit={handleSubmit}>
        <label>
          Jawaban (teks)
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} placeholder="Tulis jawabanmu di sini…" />
        </label>
        <label>
          File jawaban (opsional)
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Mengirim…' : subs.length > 0 ? `Kirim Ulang (versi ${nextVersion})` : 'Kirim Tugas'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleSaveDraft}>
            Simpan Draft
          </button>
        </div>
      </form>

      <section className="section">
        <h2>Riwayat Versi</h2>
        {subs.length === 0 ? (
          <p className="empty">Belum ada pengiriman.</p>
        ) : (
          <ul>
            {subs.map((s) => (
              <li key={s.id}>
                Versi {s.version ?? 1} · {fmtDate(s.submitted_at)}
                {s.is_late ? ' · Terlambat' : ''}
                {' — '}Nilai: {s.score === null ? 'belum dinilai' : s.score}
                {s.feedback ? ` · Umpan balik: ${s.feedback}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
