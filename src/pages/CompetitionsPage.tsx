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
  const [scoreComment, setScoreComment] = useState('')

  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    if (!id) return
    const compId = id
    let cancelled = false
    async function load() {
      try {
        // Kompetisi, submissions, winners, dan status juri semuanya hanya
        // butuh compId (+ user) — dimuat paralel, bukan berurutan.
        const [compRes, sData, wData, jData] = await Promise.all([
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
        if (!cancelled) {
          setSubs(sRows)
          setWinners((wData.data ?? []) as CompetitionWinner[])
          if (user) setIsJudge(jData.data !== null)
        }
        // Nama peserta dan skor independen satu sama lain (keduanya hanya
        // butuh sRows + status kompetisi) — dimuat paralel.
        const c = data as Competition | null
        const scoresNeeded = !!c && (c.status === 'selesai' || isAdmin)
        const [namesMap, scData] = await Promise.all([
          fetchProfileNames(sRows.map((s) => s.user_id)),
          scoresNeeded
            ? supabase
                .from('competition_scores')
                .select('*')
                .in('submission_id', sRows.map((s) => s.id))
            : Promise.resolve({ data: null } as { data: null }),
        ])
        if (!cancelled) {
          setNames(namesMap)
          if (scoresNeeded) setScores((scData.data ?? []) as CompetitionScore[])
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

  if (loading) return <div className="page"><p className="muted">Memuat kompetisi…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (missing) return <div className="page"><h1>Kompetisi</h1><MigrationNotice migration="007" /></div>
  if (!comp) return <div className="page"><p className="empty">Kompetisi tidak ditemukan.</p><Link to="/kompetisi">Kembali</Link></div>

  const currentComp = comp
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
          comment: scoreComment.trim() || null,
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
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
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
                        <input value={scoreComment} onChange={(e) => setScoreComment(e.target.value)} placeholder="Opsional" />
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
