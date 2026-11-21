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
import { fetchSubmissions, supabase, uploadToBucket, addSubmissionFiles, fetchRubricForAssignment, fetchSubmissionFiles } from '../lib/supabase'
import type { Assignment, RubricWithCriteria, Submission, SubmissionFile } from '../lib/types'

type AssignmentRow = Assignment & { due_date?: string | null; rubric?: string | null }
type SubmissionRow = Submission & { is_draft?: boolean | null; version?: number | null; is_late?: boolean | null }

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function AssignmentPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [assignment, setAssignment] = useState<AssignmentRow | null>(null)
  const [subs, setSubs] = useState<SubmissionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rubric, setRubric] = useState<RubricWithCriteria | null>(null)
  const [rubricNote, setRubricNote] = useState<string | null>(null)
  const [filesBySubmission, setFilesBySubmission] = useState<Record<string, SubmissionFile[]>>({})
  // Course pemilik tugas — dibutuhkan untuk path upload storage yang
  // sesuai konvensi README (<course-id>/<assignment-id>/<user-id>/...).
  const [courseId, setCourseId] = useState<string | null>(null)
  // Signed URL per file lampiran (bucket submission-files privat).
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})

  const draftKey = user && id ? `sineverse-draft-${user.id}-${id}` : ''

  useEffect(() => {
    if (!id || !user) return
    const assignmentId = id
    const currentUser = user
    let cancelled = false
    async function load() {
      try {
        // Tugas dan daftar submission saya independen (keduanya hanya
        // butuh id) — dimulai paralel; submission baru dipakai setelah
        // tugas dipastikan termuat.
        const subsP = fetchSubmissions(currentUser.id)
        const { data, error: aErr } = await supabase
          .from('assignments')
          .select('*')
          .eq('id', assignmentId)
          .maybeSingle()
        if (aErr) {
          subsP.catch(() => [])
          throw aErr
        }
        if (cancelled) return
        setAssignment(data as AssignmentRow | null)
        // Tentukan course pemilik tugas (untuk path upload storage).
        // Pakai helper RPC migrasi 014; bila gagal, telusuri lewat
        // lesson -> module -> course.
        try {
          const { data: cid, error: cErr } = await supabase.rpc('course_id_for_assignment', { p_assignment_id: assignmentId })
          if (!cErr && typeof cid === 'string' && cid) {
            if (!cancelled) setCourseId(cid)
          } else {
            const { data: lRow } = await supabase
              .from('lessons')
              .select('module_id, modules(course_id)')
              .eq('id', (data as AssignmentRow).lesson_id)
              .maybeSingle()
            const mid = (lRow as unknown as { modules?: { course_id?: string } } | null)?.modules?.course_id
            if (mid && !cancelled) setCourseId(mid)
          }
        } catch {
          // courseId tetap null; upload file diblokir dengan pesan jujur.
        }
        const all = await subsP
        if (cancelled) return
        const mine = (all as SubmissionRow[])
          .filter((s) => s.assignment_id === assignmentId)
          .sort((a, b) => +new Date(b.submitted_at) - +new Date(a.submitted_at))
        setSubs(mine)
        void loadFilesFor(mine)
        try {
          const r = await fetchRubricForAssignment(assignmentId)
          if (!cancelled) setRubric(r)
        } catch {
          if (!cancelled) setRubricNote('Rubrik terstruktur gagal dimuat, deskripsi di atas tetap bisa dibaca.')
        }
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

  /** Muat daftar file lampiran tiap submission; gagal muat tidak merusak
   *  halaman, tampilannya jatuh kembali ke tautan file_url tunggal. */
  async function loadFilesFor(list: SubmissionRow[]) {
    const entries = await Promise.all(
      list.map(async (s) => {
        try {
          const rows = await fetchSubmissionFiles(s.id)
          return [s.id, rows] as const
        } catch {
          return [s.id, []] as const
        }
      }),
    )
    setFilesBySubmission(Object.fromEntries(entries))
    // Signed URL per file (bucket submission-files privat): tautan
    // unduhan yang bisa dibuka pemilik / mentor course / admin sesuai
    // policy SELECT. Gagal membuat signed URL = jatuh ke getPublicUrl.
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
    setSignedUrls(Object.fromEntries(signed.filter(([, u]) => u)))
  }

  /** Daftar semua file lampiran satu submission; bila belum ada baris di
   *  submission_files (pengiriman lama), pakai tautan file_url tunggal. */
  function renderSubmissionFiles(s: SubmissionRow) {
    const rows = filesBySubmission[s.id] ?? []
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
    if (s.file_url) {
      return <p><a href={s.file_url} target="_blank" rel="noreferrer">Lihat file terkirim</a></p>
    }
    return null
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const currentAssignment = assignment
    if (!user || !currentAssignment || (!content.trim() && files.length === 0)) {
      setNotice('Isi jawaban teks atau pilih file untuk dikirim.')
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      // Path upload HARUS mengikuti konvensi README
      // <course-id>/<assignment-id>/<user-id>/... karena policy INSERT
      // submission-files memeriksa segmen path itu (foldername[3] =
      // pemilik, foldername[1] = course untuk mentor). Path lama
      // <user-id>/<assignment-id>/... selalu ditolak policy.
      if (files.length > 0 && !courseId) {
        setNotice('Course tugas ini tidak bisa ditentukan, file tidak bisa diunggah. Kirim jawaban teks saja, atau coba lagi.')
        setBusy(false)
        return
      }
      const uploaded: { path: string; name: string; size: number; url: string }[] = []
      for (const f of files) {
        const path = `${courseId}/${currentAssignment.id}/${user.id}/v${nextVersion}-${f.name}`
        const url = await uploadToBucket('submission-files', path, f)
        if (!url) {
          setNotice('File tidak bisa diunggah. Periksa koneksi lalu coba lagi, atau kirim jawaban teks saja.')
          setBusy(false)
          return
        }
        uploaded.push({ path, name: f.name, size: f.size, url })
      }
      const { data: inserted, error: insErr } = await supabase
        .from('submissions')
        .insert({
          assignment_id: currentAssignment.id,
          user_id: user.id,
          content: content.trim() || null,
          file_url: uploaded[0]?.url ?? null,
          version: nextVersion,
          is_late: isLate,
          is_draft: false,
        })
        .select()
        .single()
      if (insErr) throw insErr
      let filesNote = ''
      if (uploaded.length > 0 && inserted) {
        try {
          await addSubmissionFiles((inserted as { id: string }).id, uploaded.map((u) => ({
            file_path: u.path,
            file_name: u.name,
            file_size: u.size,
          })))
        } catch {
          filesNote = ' Daftar lampiran gagal disimpan, file pertama tetap bisa dibuka dari tautan pengiriman.'
        }
      }
      if (draftKey) localStorage.removeItem(draftKey)
      setContent('')
      setFiles([])
      const all = await fetchSubmissions(user.id)
      const mine = (all as SubmissionRow[])
        .filter((s) => s.assignment_id === assignment.id)
        .sort((a, b) => +new Date(b.submitted_at) - +new Date(a.submitted_at))
      setSubs(mine)
      void loadFilesFor(mine)
      setNotice(
        (isLate
          ? `Terkirim sebagai versi ${nextVersion}, ditandai terlambat (lewat tenggat ${fmtDate(currentAssignment.due_date)}).`
          : `Terkirim sebagai versi ${nextVersion}.`) + filesNote,
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
        {rubric && rubric.criteria.length > 0 && (
          <div>
            <h3>{rubric.rubric.title}</h3>
            <ul>
              {rubric.criteria.map((c) => (
                <li key={c.id}>
                  <strong>{c.title}</strong> (maks. {c.max_score})
                  {c.description ? `: ${c.description}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
        {rubricNote && <p className="muted">{rubricNote}</p>}
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
          {renderSubmissionFiles(latest)}
        </section>
      )}

      {notice && <p className="notice-box">{notice}</p>}

      <form className="form" onSubmit={handleSubmit}>
        <label>
          Jawaban (teks)
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} placeholder="Tulis jawabanmu di sini…" />
        </label>
        <label>
          File jawaban (opsional, boleh lebih dari satu)
          <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        </label>
        {files.length > 0 && (
          <ul>
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`}>{f.name} ({fmtSize(f.size)})</li>
            ))}
          </ul>
        )}
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
                {renderSubmissionFiles(s)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
