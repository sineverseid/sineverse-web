// SINEVERSE, Kompetisi (007): siklus draft → dibuka → penjurian → selesai.
// Submission hanya saat status 'dibuka' + sebelum deadline + kedua
// persetujuan (hak cipta & penggunaan) dicentang. Penilaian juri per
// kriteria hanya saat 'penjurian' dan hanya oleh juri kompetisi itu.
// SKOR DISEMBUNYIKAN dari peserta sampai status 'selesai', UI tidak
// pernah menampilkan skor ke peserta sebelum itu. Pemenang diterbitkan
// sertifikat karya (type 'work', SVS-KRY) oleh admin.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { fmtDate, isMissingTableError } from '../lib/guarded'
import { fetchEnrollments, fetchProfileNames, supabase } from '../lib/supabase'
import { issueWorkCertificate } from '../lib/certificates'
import type { Competition, CompetitionScore, CompetitionStatus, CompetitionSubmission, CompetitionWinner } from '../lib/types'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

// Status efektif: kompetisi 'dibuka' yang tenggatnya sudah lewat tampil
// sebagai "Tenggat lewat", bukan "Dibuka", agar tidak menyesatkan.
function effectiveStatusLabel(c: { status: CompetitionStatus; deadline: string | null }): string {
  if (c.status === 'dibuka' && c.deadline && new Date(c.deadline).getTime() < Date.now()) {
    return 'Tenggat lewat'
  }
  return (
    { draft: 'Draf', dibuka: 'Dibuka', penjurian: 'Penjurian', selesai: 'Selesai' } as Record<
      string,
      string
    >
  )[c.status] ?? c.status
}

function submissionStatusLabel(status: string): string {
  return (
    { submitted: 'Terkirim', approved: 'Disetujui', rejected: 'Ditolak', pending: 'Menunggu' } as Record<
      string,
      string
    >
  )[status] ?? status
}

export function CompetitionsPage() {
  const { user, profile } = useAuth()
  const [items, setItems] = useState<Competition[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [deadline, setDeadline] = useState('')

  const canCreate = profile?.role === 'mentor' || profile?.role === 'admin'

  async function load() {
    try {
      const { data, error: qErr } = await supabase.from('competitions').select('*').order('created_at', { ascending: false })
      if (qErr) {
        if (isMissingTableError(qErr)) {
          setItems(null)
          return
        }
        throw qErr
      }
      setItems((data ?? []) as Competition[])
    } catch {
      setError('Gagal memuat kompetisi. Coba lagi nanti.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (cancelled) return
      await load()
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!user || !title.trim()) return
    const { error: insErr } = await supabase.from('competitions').insert({
      title: title.trim(),
      description: description.trim() || null,
      status: 'draft',
      deadline: deadline ? new Date(deadline).toISOString() : null,
      created_by: user.id,
    })
    if (insErr) {
      setNotice('Gagal membuat kompetisi. Coba lagi nanti.')
      return
    }
    setNotice('Kompetisi dibuat sebagai draf. Atur kategori, kriteria, dan juri dari halaman detail, lalu ubah status menjadi "dibuka".')
    setTitle('')
    setDescription('')
    setDeadline('')
    await load()
  }

  if (loading) return <div className="page"><p className="muted">Memuat kompetisi…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (items === null) return <div className="page"><h1>Kompetisi</h1><MigrationNotice migration="007" /></div>

  return (
    <div className="page">
      <PageHeader
        icon="trophy"
        title="Kompetisi"
        subtitle="Kompetisi dan festival film pelajar, kirim karyamu dan menangkan sertifikat."
      />
      {notice && <p className="notice-box">{notice}</p>}
      {canCreate && (
        <section className="section">
          <h2>Buat Kompetisi</h2>
          <p className="muted">
            Mentor dan admin dapat membuat kompetisi. Kompetisi baru berstatus draf, kategori,
            kriteria penilaian, dan panel juri diatur dari halaman detail sebelum dibuka.
          </p>
          <form className="form" onSubmit={handleCreate}>
            <label>
              Judul kompetisi
              <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Mis. Lomba Film Pendek SINEVERSE 2026" />
            </label>
            <label>
              Deskripsi
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </label>
            <label>
              Tenggat pengiriman karya
              <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </label>
            <button type="submit" className="btn btn-primary">Buat Kompetisi (Draf)</button>
          </form>
        </section>
      )}
      {items.length === 0 ? (
        <EmptyState message="Belum ada kompetisi." />
      ) : (
        <ul className="course-list">
          {items.map((c) => (
            <li key={c.id} className="course-card">
              <Link to={`/kompetisi/${c.id}`}>
                <h3>{c.title}</h3>
                <p>{c.description ?? ''}</p>
                <p className="muted">
                  Status: {effectiveStatusLabel(c)}
                  {c.deadline ? ` · Tenggat: ${fmtDate(c.deadline)}` : ''}
                  {c.status === 'dibuka' && c.deadline && new Date(c.deadline).getTime() < Date.now()
                    ? ' · Pengiriman karya sudah melewati tenggat.'
                    : ''}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function CompetitionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, profile } = useAuth()
  const [comp, setComp] = useState<Competition | null>(null)
  const [missing, setMissing] = useState(false)
  const [subs, setSubs] = useState<CompetitionSubmission[]>([])
  const [scores, setScores] = useState<CompetitionScore[]>([])
  const [winners, setWinners] = useState<CompetitionWinner[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [isJudge, setIsJudge] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [link, setLink] = useState('')
  const [category, setCategory] = useState('')
  const [copyright, setCopyright] = useState(false)
  const [usage, setUsage] = useState(false)
  const [scoreInputs, setScoreInputs] = useState<Record<string, string>>({})
  // B50: komentar juri per submission (sebelumnya satu kolom dipakai
  // bersama semua kiriman).
  const [scoreComments, setScoreComments] = useState<Record<string, string>>({})
  // Kelola kompetisi (K7): status, kriteria/kategori, panel juri.
  const [judges, setJudges] = useState<{ id: string; judge_id: string }[]>([])
  const [judgeCandidates, setJudgeCandidates] = useState<{ id: string; name: string | null }[]>([])
  const [selectedJudgeId, setSelectedJudgeId] = useState('')
  const [newStatus, setNewStatus] = useState<CompetitionStatus | ''>('')
  const [critRows, setCritRows] = useState<{ name: string; weight: number }[]>([])
  const [categoriesText, setCategoriesText] = useState('')
  const [busy, setBusy] = useState(false)

  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    if (!id) return
    const compId = id
    let cancelled = false
    async function load() {
      try {
        // Kompetisi, submissions, winners, dan status juri semuanya hanya
        // butuh compId (+ user) — dimuat paralel, bukan berurutan.
        const [compRes, sData, wData, jData, jgData] = await Promise.all([
          supabase.from('competitions').select('*').eq('id', compId).maybeSingle(),
          supabase.from('competition_submissions').select('*').eq('competition_id', compId).order('created_at', { ascending: true }),
          supabase.from('competition_winners').select('*').eq('competition_id', compId).order('rank'),
          user
            ? supabase
                .from('competition_judges')
                .select('id')
                .eq('competition_id', compId)
                .eq('judge_id', user.id)
                .maybeSingle()
            : Promise.resolve({ data: null } as { data: null }),
          user
            ? supabase
                .from('competition_judges')
                .select('id,judge_id')
                .eq('competition_id', compId)
                .order('created_at')
            : Promise.resolve({ data: [] } as { data: { id: string; judge_id: string }[] }),
        ])
        const { data, error: qErr } = compRes
        if (qErr) {
          if (isMissingTableError(qErr)) {
            setMissing(true)
            return
          }
          throw qErr
        }
        if (cancelled) return
        setComp(data as Competition | null)
        const sRows = (sData.data ?? []) as CompetitionSubmission[]
        const judgeRows = ((jgData.data ?? []) as { id: string; judge_id: string }[])
        if (!cancelled) {
          setSubs(sRows)
          setWinners((wData.data ?? []) as CompetitionWinner[])
          setJudges(judgeRows)
          if (user) setIsJudge(jData.data !== null)
        }
        // Nama peserta dan skor independen satu sama lain (keduanya hanya
        // butuh sRows + status kompetisi) — dimuat paralel.
        const c = data as Competition | null
        const scoresNeeded = !!c && (c.status === 'selesai' || isAdmin)
        const [namesMap, scData, candData] = await Promise.all([
          fetchProfileNames([...sRows.map((s) => s.user_id), ...judgeRows.map((j) => j.judge_id)]),
          scoresNeeded
            ? supabase
                .from('competition_scores')
                .select('*')
                .in('submission_id', sRows.map((s) => s.id))
            : Promise.resolve({ data: null } as { data: null }),
          isAdmin
            ? supabase.from('profiles').select('id,name').in('role', ['mentor', 'admin']).order('name')
            : Promise.resolve({ data: null } as { data: null }),
        ])
        if (!cancelled) {
          setNames(namesMap)
          if (scoresNeeded) setScores((scData.data ?? []) as CompetitionScore[])
          if (candData.data) setJudgeCandidates(candData.data as { id: string; name: string | null }[])
        }
      } catch (err) {
        if (!cancelled) setError('Gagal memuat kompetisi. Coba lagi nanti.')
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

  // Isi form kelola dari data kompetisi saat halaman dibuka (sekali per
  // kompetisi); penyimpanan sesudahnya memperbarui state lokal sendiri.
  useEffect(() => {
    if (!comp) return
    setCritRows(Array.isArray(comp.criteria) ? comp.criteria : [])
    setCategoriesText((comp.categories ?? []).join(', '))
    setNewStatus(comp.status)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp?.id])

  if (loading) return <div className="page"><p className="muted">Memuat kompetisi…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (missing) return <div className="page"><h1>Kompetisi</h1><MigrationNotice migration="007" /></div>
  if (!comp) return <div className="page"><p className="empty">Kompetisi tidak ditemukan.</p><Link to="/kompetisi">Kembali</Link></div>

  const currentComp = comp
  const canManage = isAdmin || currentComp.created_by === user?.id
  const criteria: { name: string; weight: number }[] = Array.isArray(currentComp.criteria) ? currentComp.criteria : []
  const canSubmit =
    currentComp.status === 'dibuka' && (!currentComp.deadline || new Date() < new Date(currentComp.deadline))
  const mySub = subs.find((s) => s.user_id === user?.id)
  const scoresVisible = currentComp.status === 'selesai'
  const totalFor = (subId: string) =>
    scores.filter((s) => s.submission_id === subId).reduce((a, s) => a + (s.score ?? 0), 0)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    if (!canSubmit) {
      setNotice('Pengiriman karya hanya dibuka saat kompetisi berstatus "dibuka" dan sebelum tenggat.')
      return
    }
    if (!copyright || !usage) {
      setNotice('Kedua persetujuan wajib dicentang: persetujuan hak cipta dan persetujuan penggunaan karya.')
      return
    }
    // B49: karya tidak boleh dikirim tanpa tautan (juri tidak punya
    // apa-apa untuk dinilai).
    if (!link.trim()) {
      setNotice('Isi tautan karya terlebih dahulu (tautan film / dokumen).')
      return
    }
    const { error: insErr } = await supabase.from('competition_submissions').insert({
      competition_id: currentComp.id,
      user_id: user.id,
      film_id: null,
      link: link.trim() || null,
      category: category.trim() || null,
      copyright_consent: true,
      usage_consent: true,
      status: 'submitted',
    })
    if (insErr) setNotice('Gagal mengirim karya. Coba lagi nanti.')
    else {
      setNotice('Karya terkirim untuk kompetisi ini.')
      setLink('')
      setCategory('')
      const { data } = await supabase.from('competition_submissions').select('*').eq('competition_id', currentComp.id).order('created_at', { ascending: true })
      setSubs((data ?? []) as CompetitionSubmission[])
    }
  }

  async function handleScore(e: FormEvent, sub: CompetitionSubmission) {
    e.preventDefault()
    if (!user || !isJudge || currentComp.status !== 'penjurian') return
    for (const crit of criteria) {
      const value = Number(scoreInputs[`${sub.id}:${crit.name}`])
      if (Number.isNaN(value) || value < 0 || value > 100) {
        setNotice(`Skor "${crit.name}" harus antara 0 dan 100.`)
        return
      }
      const { error: upErr } = await supabase.from('competition_scores').upsert(
        {
          submission_id: sub.id,
          judge_id: user.id,
          criterion: crit.name,
          score: value,
          comment: (scoreComments[sub.id] ?? '').trim() || null,
        },
        { onConflict: 'submission_id,judge_id,criterion' },
      )
      if (upErr) {
        setNotice('Gagal menyimpan penilaian. Coba lagi nanti.')
        return
      }
    }
    setNotice(`Penilaian untuk karya ${names.get(sub.user_id) ?? ''} tersimpan. Skor tetap tersembunyi dari peserta sampai kompetisi selesai.`)
  }

  // --- Kelola kompetisi (K7): hanya pembuat kompetisi atau admin. ---
  // RLS 007: update competitions diizinkan untuk pembuat + admin; panel
  // juri HANYA dikelola admin (competition_judges_admin_all), jadi form
  // juri tidak ditampilkan ke pembuat non-admin.

  async function handleStatusChange(e: FormEvent) {
    e.preventDefault()
    if (!user || !canManage || !newStatus || newStatus === currentComp.status || busy) return
    if (
      newStatus === 'selesai' &&
      !window.confirm('Ubah status menjadi "Selesai"? Skor juri akan terlihat oleh peserta.')
    )
      return
    setBusy(true)
    const { error: updErr } = await supabase
      .from('competitions')
      .update({ status: newStatus })
      .eq('id', currentComp.id)
    setBusy(false)
    if (updErr) {
      setNotice(`Gagal mengubah status: ${updErr.message}`)
      return
    }
    setComp({ ...currentComp, status: newStatus })
    setNotice(`Status kompetisi diubah menjadi "${effectiveStatusLabel({ ...currentComp, status: newStatus })}".`)
  }

  async function handleSaveCriteria(e: FormEvent) {
    e.preventDefault()
    if (!user || !canManage || busy) return
    const clean = critRows
      .map((r) => ({ name: r.name.trim(), weight: r.weight }))
      .filter((r) => r.name)
    for (const r of clean) {
      if (!Number.isFinite(r.weight) || r.weight < 0 || r.weight > 100) {
        setNotice(`Bobot "${r.name}" harus antara 0 dan 100.`)
        return
      }
    }
    const categories = categoriesText.split(',').map((s) => s.trim()).filter(Boolean)
    setBusy(true)
    const { error: updErr } = await supabase
      .from('competitions')
      .update({ criteria: clean, categories })
      .eq('id', currentComp.id)
    setBusy(false)
    if (updErr) {
      setNotice(`Gagal menyimpan kriteria: ${updErr.message}`)
      return
    }
    setComp({ ...currentComp, criteria: clean, categories })
    setCritRows(clean)
    setNotice('Kriteria dan kategori kompetisi disimpan.')
  }

  async function handleAddJudge(e: FormEvent) {
    e.preventDefault()
    if (!user || !isAdmin || !selectedJudgeId || busy) return
    setBusy(true)
    const { data, error: insErr } = await supabase
      .from('competition_judges')
      .insert({ competition_id: currentComp.id, judge_id: selectedJudgeId })
      .select('id,judge_id')
      .single()
    setBusy(false)
    if (insErr) {
      setNotice(
        insErr.message.toLowerCase().includes('duplicate')
          ? 'Pengguna itu sudah menjadi juri kompetisi ini.'
          : `Gagal menambah juri: ${insErr.message}`,
      )
      return
    }
    setJudges((prev) => [...prev, data as { id: string; judge_id: string }])
    const nameMap = await fetchProfileNames([selectedJudgeId])
    setNames((prev) => new Map([...prev, ...nameMap]))
    setSelectedJudgeId('')
    setNotice('Juri ditambahkan.')
  }

  async function handleRemoveJudge(judgeRow: { id: string; judge_id: string }) {
    if (!user || !isAdmin || busy) return
    if (!window.confirm(`Hapus juri ${names.get(judgeRow.judge_id) ?? ''} dari kompetisi ini?`)) return
    setBusy(true)
    const { error: delErr } = await supabase.from('competition_judges').delete().eq('id', judgeRow.id)
    setBusy(false)
    if (delErr) {
      setNotice(`Gagal menghapus juri: ${delErr.message}`)
      return
    }
    setJudges((prev) => prev.filter((j) => j.id !== judgeRow.id))
    setNotice('Juri dihapus.')
  }

  async function handleIssueWinnerCerts() {
    if (!isAdmin || winners.length === 0) return
    const issued: string[] = []
    const failed: string[] = []
    // Enrollment tiap pemenang independen — diambil paralel dulu; RPC
    // penerbitan tetap berurutan supaya pesan hasil sesuai urutan pemenang.
    const winnerSubs = winners
      .map((w) => ({ w, sub: subs.find((s) => s.id === w.submission_id) }))
      .filter((x): x is { w: CompetitionWinner; sub: CompetitionSubmission } => !!x.sub)
    const enrollments = await Promise.all(winnerSubs.map(({ sub }) => fetchEnrollments(sub.user_id)))
    for (let i = 0; i < winnerSubs.length; i++) {
      const { sub } = winnerSubs[i]
      const enr = enrollments[i]
      const name = names.get(sub.user_id) ?? 'Pemenang'
      // certificates.course_id wajib terisi (001): pakai course terbaru
      // yang sedang/diambil pemenang, jujur dicatat di pesan hasil.
      if (enr.length === 0) {
        failed.push(`${name}: belum mengambil course apa pun, sertifikat karya tidak bisa diterbitkan (course_id wajib terisi).`)
        continue
      }
      // B3 (migrasi 025): penerbitan lewat RPC SECURITY DEFINER
      // issue_work_certificate — bukan insert langsung (policy insert
      // langsung sudah dihapus). RPC idempotent per (kompetisi, pemenang).
      try {
        const result = await issueWorkCertificate(currentComp.id, sub.user_id, null)
        issued.push(
          result.alreadyIssued
            ? `${name}, ${result.serial} (sudah diterbitkan sebelumnya)`
            : `${name}, ${result.serial}`,
        )
      } catch (err) {
        failed.push(`${name}: gagal diterbitkan (${err instanceof Error ? err.message : 'coba lagi'}).`)
      }
    }
    setNotice(
      [
        issued.length > 0 ? `Sertifikat karya diterbitkan: ${issued.join('; ')}.` : '',
        failed.length > 0 ? `Gagal: ${failed.join(' ')}` : '',
      ]
        .filter(Boolean)
        .join(' ') || 'Tidak ada sertifikat yang diterbitkan.',
    )
  }

  return (
    <div className="page">
      <Link to="/kompetisi" className="back-link">← Semua Kompetisi</Link>
      <h1>{currentComp.title}</h1>
      <p className="muted">
        Status: <strong>{effectiveStatusLabel(currentComp)}</strong>
        {currentComp.deadline ? ` · Tenggat: ${fmtDate(currentComp.deadline)}` : ''}
        {criteria.length > 0 && ` · Kriteria: ${criteria.map((c) => `${c.name} (${c.weight}%)`).join(', ')}`}
      </p>
      <p>{currentComp.description ?? ''}</p>
      {notice && <p className="notice-box">{notice}</p>}

      {canManage && (
        <section className="section">
          <h2>Kelola Kompetisi</h2>
          <form className="form" onSubmit={handleStatusChange}>
            <label>
              Status kompetisi
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as CompetitionStatus)}
                style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
              >
                <option value="draft">Draf</option>
                <option value="dibuka">Dibuka</option>
                <option value="penjurian">Penjurian</option>
                <option value="selesai">Selesai</option>
              </select>
            </label>
            <p className="muted">
              Alur: Draf → Dibuka (karya bisa dikirim sampai tenggat) → Penjurian (juri menilai)
              → Selesai (skor terlihat peserta). Kompetisi yang tenggatnya lewat tetap harus
              diubah statusnya di sini secara manual.
            </p>
            <button type="submit" className="btn btn-primary btn-small" disabled={busy || !newStatus || newStatus === currentComp.status}>
              Ubah Status
            </button>
          </form>

          <form className="form" onSubmit={handleSaveCriteria}>
            <label>
              Kategori (pisahkan dengan koma)
              <input
                value={categoriesText}
                onChange={(e) => setCategoriesText(e.target.value)}
                placeholder="Mis. Film Pendek Fiksi, Dokumenter"
              />
            </label>
            <p className="muted">Kriteria penilaian (bobot 0–100 per kriteria):</p>
            {critRows.length === 0 && <p className="empty">Belum ada kriteria penilaian.</p>}
            {critRows.map((row, idx) => (
              <div key={idx} className="form-actions">
                <label>
                  Nama kriteria
                  <input
                    value={row.name}
                    onChange={(e) =>
                      setCritRows((prev) => prev.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r)))
                    }
                    placeholder="Mis. Sinematografi"
                  />
                </label>
                <label>
                  Bobot (%)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={row.weight}
                    onChange={(e) =>
                      setCritRows((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, weight: Number(e.target.value) } : r)),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => setCritRows((prev) => prev.filter((_, i) => i !== idx))}
                >
                  Hapus
                </button>
              </div>
            ))}
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => setCritRows((prev) => [...prev, { name: '', weight: 0 }])}
              >
                Tambah Kriteria
              </button>
              <button type="submit" className="btn btn-primary btn-small" disabled={busy}>
                Simpan Kriteria &amp; Kategori
              </button>
            </div>
          </form>

          {isAdmin ? (
            <div>
              <h3>Panel Juri</h3>
              {judges.length === 0 ? (
                <p className="empty">Belum ada juri untuk kompetisi ini.</p>
              ) : (
                <ul className="discussion-list">
                  {judges.map((j) => (
                    <li key={j.id} className="discussion-item">
                      <p>
                        <strong>{names.get(j.judge_id) ?? 'Juri'}</strong>
                      </p>
                      <button type="button" className="btn btn-ghost btn-small" disabled={busy} onClick={() => void handleRemoveJudge(j)}>
                        Hapus Juri
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <form className="form" onSubmit={handleAddJudge}>
                <label>
                  Tambah juri (mentor / admin)
                  <select
                    value={selectedJudgeId}
                    onChange={(e) => setSelectedJudgeId(e.target.value)}
                    style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
                  >
                    <option value="">Pilih pengguna</option>
                    {judgeCandidates
                      .filter((c) => !judges.some((j) => j.judge_id === c.id))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name ?? c.id}
                        </option>
                      ))}
                  </select>
                </label>
                <button type="submit" className="btn btn-primary btn-small" disabled={busy || !selectedJudgeId}>
                  Tambah Juri
                </button>
              </form>
            </div>
          ) : (
            <p className="muted">
              Panel juri hanya dikelola admin. Juri saat ini:{' '}
              {judges.length === 0 ? 'belum ada.' : judges.map((j) => names.get(j.judge_id) ?? 'Juri').join(', ')}
            </p>
          )}
        </section>
      )}

      {winners.length > 0 && (
        <section className="section">
          <h2>Pemenang</h2>
          <ul>
            {winners.map((w) => {
              const sub = subs.find((s) => s.id === w.submission_id)
              return (
                <li key={w.id}>
                  Peringkat {w.rank ?? '—'}, {sub ? names.get(sub.user_id) ?? 'Peserta' : '—'}
                  {w.category ? ` (${w.category})` : ''}
                </li>
              )
            })}
          </ul>
          {isAdmin && (
            <button type="button" className="btn btn-primary btn-small" onClick={handleIssueWinnerCerts}>
              Terbitkan Sertifikat Pemenang (SVS-KRY)
            </button>
          )}
        </section>
      )}

      <section className="section">
        <h2>Kirim Karya</h2>
        {!user ? (
          <p className="muted"><Link to="/login">Masuk</Link> untuk mengirim karya.</p>
        ) : mySub ? (
          <p className="notice-box">Kamu sudah mengirim karya untuk kompetisi ini (status: {submissionStatusLabel(mySub.status)}).</p>
        ) : !canSubmit ? (
          <p className="empty">
            Pengiriman karya {currentComp.status === 'dibuka' ? 'sudah melewati tenggat.' : `belum dibuka (status saat ini: ${effectiveStatusLabel(currentComp)}).`}
          </p>
        ) : (
          <form className="form" onSubmit={handleSubmit}>
            <label>
              Tautan karya (film / dokumen)
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" required />
            </label>
            <label>
              Kategori
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Mis. Film Pendek Fiksi" />
            </label>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" checked={copyright} onChange={(e) => setCopyright(e.target.checked)} required />
              Saya menyetujui ketentuan hak cipta karya ini
            </label>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" checked={usage} onChange={(e) => setUsage(e.target.checked)} required />
              Saya menyetujui penggunaan karya oleh SINEVERSE sesuai ketentuan kompetisi
            </label>
            <button type="submit" className="btn btn-primary">Kirim Karya</button>
          </form>
        )}
      </section>

      <section className="section">
        <h2>Karya yang Masuk ({subs.length})</h2>
        {subs.length === 0 ? (
          <p className="empty">Belum ada karya yang masuk.</p>
        ) : (
          <ul className="discussion-list">
            {subs.map((s) => {
              const mine = s.user_id === user?.id
              return (
                <li key={s.id} className="discussion-item">
                  <p className="discussion-meta">
                    {names.get(s.user_id) ?? 'Peserta'}
                    {s.category ? ` · ${s.category}` : ''} · {fmtDate(s.created_at)} · {submissionStatusLabel(s.status)}
                  </p>
                  {s.link && <p><a href={s.link} target="_blank" rel="noreferrer">Lihat karya</a></p>}
                  {scoresVisible && (
                    <p>Total skor juri: {totalFor(s.id)} (terlihat karena kompetisi sudah selesai)</p>
                  )}
                  {!scoresVisible && mine && (
                    <p className="muted">Skor juri disembunyikan sampai kompetisi berstatus selesai.</p>
                  )}
                  {isJudge && currentComp.status === 'penjurian' && criteria.length > 0 && (
                    <form className="form form-inline" onSubmit={(e) => handleScore(e, s)}>
                      {criteria.map((c) => (
                        <label key={c.name}>
                          {c.name} ({c.weight}%)
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={scoreInputs[`${s.id}:${c.name}`] ?? ''}
                            onChange={(e) => setScoreInputs((prev) => ({ ...prev, [`${s.id}:${c.name}`]: e.target.value }))}
                            required
                          />
                        </label>
                      ))}
                      <label>
                        Komentar juri
                        <input value={scoreComments[s.id] ?? ''} onChange={(e) => setScoreComments((prev) => ({ ...prev, [s.id]: e.target.value }))} placeholder="Opsional" />
                      </label>
                      <button type="submit" className="btn btn-primary btn-small">Simpan Penilaian</button>
                    </form>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {isJudge && currentComp.status !== 'penjurian' && (
          <p className="muted">Penilaian juri hanya dibuka saat kompetisi berstatus penjurian.</p>
        )}
      </section>
    </div>
  )
}
