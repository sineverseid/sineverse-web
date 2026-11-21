// SINEVERSE — Sertifikat: "Sertifikat Saya" (3 jenis dengan tampilan
// berbeda: course SVS-CRS, ujian SVS-EXM, karya SVS-KRY) + verifikasi
// sertifikat berdasarkan nomor serial.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fmtDate } from '../lib/guarded'
import { fetchMyCertificates, fetchPublicProfile, verifyCertificate } from '../lib/supabase'
import type { Certificate } from '../lib/types'
import PageHeader from '../components/PageHeader'

const TYPE_LABEL: Record<Certificate['type'], string> = {
  course: 'Sertifikat Course',
  exam: 'Sertifikat Ujian Kompetensi',
  work: 'Sertifikat Karya',
}

const TYPE_STYLE: Record<Certificate['type'], React.CSSProperties> = {
  course: { borderLeft: '4px solid var(--film-green)', background: '#fff' },
  exam: { borderLeft: '4px solid var(--navy)', background: '#fff' },
  work: { borderLeft: '4px solid #b8860b', background: '#fffdf5' },
}

export function CertificatesPage() {
  const { user } = useAuth()
  const [certs, setCerts] = useState<Certificate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    const currentUser = user
    let cancelled = false
    async function load() {
      try {
        const rows = await fetchMyCertificates(currentUser.id)
        if (!cancelled) setCerts(rows)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat sertifikat.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user])

  if (loading) return <div className="page"><p className="muted">Memuat sertifikat…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>

  return (
    <div className="page">
      <PageHeader
        icon="certificate"
        title="Sertifikat Saya"
        subtitle={
          <>
            Tiga jenis sertifikat SINEVERSE: Course (SVS-CRS), Ujian Kompetensi (SVS-EXM), Karya
            (SVS-KRY).{' '}
            <Link to="/sertifikat/verifikasi">Verifikasi sertifikat berdasarkan nomor serial →</Link>
          </>
        }
      />
      {certs.length === 0 ? (
        <p className="empty">
          Belum ada sertifikat. Sertifikat course diterbitkan setelah semua lesson selesai dan nilai akhir
          mencapai passing grade; sertifikat ujian diterbitkan otomatis saat kamu lulus ujian kompetensi;
          sertifikat karya diterbitkan untuk pemenang kompetisi.
        </p>
      ) : (
        <ul className="discussion-list">
          {certs.map((c) => (
            <li key={c.id} className="discussion-item" style={TYPE_STYLE[c.type]}>
              <p className="discussion-meta">{TYPE_LABEL[c.type]} · Diterbitkan {fmtDate(c.issued_at)}</p>
              <h3>{c.serial}</h3>
              <p className="muted">Nilai: {c.score ?? '—'}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function VerifyCertificatePage() {
  const [serial, setSerial] = useState('')
  const [result, setResult] = useState<{ found: boolean; cert: Certificate | null; ownerName: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleVerify(e: FormEvent) {
    e.preventDefault()
    if (!serial.trim()) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const cert = await verifyCertificate(serial)
      if (!cert) {
        setResult({ found: false, cert: null, ownerName: null })
        return
      }
      const owner = await fetchPublicProfile(cert.user_id)
      setResult({ found: true, cert, ownerName: owner?.name ?? null })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memverifikasi sertifikat.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page page-narrow">
      <h1>Verifikasi Sertifikat</h1>
      <p className="muted">Masukkan nomor serial sertifikat (mis. SVS-EXM-2026-0001) untuk memeriksa keasliannya.</p>
      <form className="form" onSubmit={handleVerify}>
        <label>
          Nomor serial
          <input value={serial} onChange={(e) => setSerial(e.target.value.toUpperCase())} required placeholder="SVS-___-____-____" />
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Memeriksa…' : 'Verifikasi'}
        </button>
      </form>
      {error && <p className="error-box">{error}</p>}
      {result && !result.found && (
        <p className="error-box">Sertifikat dengan nomor serial itu tidak ditemukan di SINEVERSE.</p>
      )}
      {result?.found && result.cert && (
        <div className="discussion-item" style={TYPE_STYLE[result.cert.type]}>
          <p className="notice-box">Sertifikat ini ASLI dan terdaftar di SINEVERSE.</p>
          <p><strong>{TYPE_LABEL[result.cert.type]}</strong></p>
          <p>Serial: {result.cert.serial}</p>
          <p>Penerima: {result.ownerName ?? '—'}</p>
          <p>Nilai: {result.cert.score ?? '—'}</p>
          <p>Diterbitkan: {fmtDate(result.cert.issued_at)}</p>
        </div>
      )}
      <p><Link to="/sertifikat">Kembali ke Sertifikat Saya</Link></p>
    </div>
  )
}
