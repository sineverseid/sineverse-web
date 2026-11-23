// SINEVERSE — Sertifikat: "Sertifikat Saya" (6 jenis: course SVS-CRS,
// ujian SVS-EXM, karya SVS-KRY, apresiasi mentor SVS-MNT, kelulusan
// Academy SVS-ACD, event SVS-EVT) + halaman Verifikasi Sertifikat publik.
// Verifikasi memakai token URL (?token=<hash>) — hash SHA-256 dari token
// acak 32 byte (migrasi 024); pencarian manual memakai nomor serial.
// Status SELALU dibaca dari database lewat RPC SECURITY DEFINER
// (verify_certificate_by_token / verify_certificate_by_serial): VALID,
// REVOKED, NOT FOUND, INACTIVE. Tautan verifikasi mentah TIDAK pernah
// ditampilkan sebagai teks (hanya tombol salin + QR).
// Setiap sertifikat yang masih valid bisa diunduh sebagai PNG
// (lib/certificateDownload.ts); yang dicabut/tidak aktif tidak bisa
// diunduh lagi (B6) dan pratinjaunya menampilkan pita DICABUT.
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import QrCode from '../components/QrCode'
import { downloadCertificatePng, renderCertificate } from '../lib/certificateDownload'
import { fmtDate } from '../lib/guarded'
import { fetchCourses, fetchMyCertificates, fetchProfileNames } from '../lib/supabase'
import {
  verificationLinkForCert,
  verifyBySerial,
  verifyByToken,
} from '../lib/certificates'
import type { Certificate, Course, VerificationResult } from '../lib/types'
import PageHeader from '../components/PageHeader'

/** Salin teks ke clipboard; fallback ke execCommand bila API clipboard
 *  tidak tersedia (mis. konteks non-HTTPS). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }
}

const TYPE_LABEL: Record<Certificate['type'], string> = {
  course: 'Sertifikat Course',
  exam: 'Sertifikat Ujian Kompetensi',
  work: 'Sertifikat Karya',
  mentor: 'Sertifikat Apresiasi Mentor',
  academy: 'Sertifikat Kelulusan Academy',
  event: 'Sertifikat Event',
}

const TYPE_STYLE: Record<Certificate['type'], React.CSSProperties> = {
  course: { borderLeft: '4px solid var(--film-green)', background: '#fff' },
  exam: { borderLeft: '4px solid var(--navy)', background: '#fff' },
  work: { borderLeft: '4px solid #b8860b', background: '#fffdf5' },
  mentor: { borderLeft: '4px solid #b8860b', background: '#fffdf5' },
  academy: { borderLeft: '4px solid var(--navy)', background: '#fff' },
  event: { borderLeft: '4px solid var(--film-green)', background: '#fff' },
}

const STATUS_BANNER: Record<VerificationResult['status'], { label: string; text: string; style: React.CSSProperties }> = {
  valid: {
    label: 'VERIFIED CERTIFICATE',
    text: 'Sertifikat ini ASLI dan terdaftar di SINEVERSE.',
    style: { background: '#e6f7ee', border: '1px solid #16865e', color: '#0d5c40' },
  },
  revoked: {
    label: 'REVOKED',
    text: 'Sertifikat ini telah DICABUT dan tidak lagi berlaku.',
    style: { background: '#fdecea', border: '1px solid #c0392b', color: '#7b241c' },
  },
  inactive: {
    label: 'INACTIVE',
    text: 'Sertifikat ini tidak aktif.',
    style: { background: '#fef6e0', border: '1px solid #b8860b', color: '#7d6608' },
  },
}

/** Pratinjau sertifikat sesuai desain referensi (ATM): gambar yang sama
 *  dengan PNG unduhan, diskalakan ke lebar kartu. */
function CertificatePreview({
  cert,
  ownerName,
  courseTitle,
  mentorName,
}: {
  cert: Certificate
  ownerName: string
  courseTitle: string | null
  mentorName: string | null
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    void renderCertificate(canvas, { cert, ownerName, courseTitle, mentorName }).catch(() => {
      // Pratinjau gagal digambar: kartu tetap menampilkan info teks.
    })
  }, [cert, ownerName, courseTitle, mentorName])
  return (
    <canvas
      ref={ref}
      width={877}
      height={620}
      style={{ width: '100%', height: 'auto', borderRadius: 8, border: '1px solid var(--light-grey)', display: 'block' }}
      aria-label={`Pratinjau sertifikat ${cert.serial}`}
    />
  )
}

/** Bangun objek Certificate dari hasil verifikasi publik — dipakai untuk
 *  pratinjau dan unduhan PNG di halaman verifikasi (QR di PNG mengodekan
 *  URL token dari verification_token_hash). */
function certificateFromVerification(result: VerificationResult): Certificate {
  return {
    id: '',
    user_id: '',
    course_id: result.course_id,
    type: result.type,
    serial: result.serial,
    score: result.score,
    note: result.note,
    issued_at: result.issued_at,
    verification_token_hash: result.verification_token_hash,
    status: result.status,
    revoked_at: result.revoked_at,
    revocation_reason: result.revocation_reason,
    issued_by: null,
    recipient_name_snapshot: result.recipient_name,
    program_name: result.program_name,
    achievement_description: result.achievement_description,
    event_id: null,
    project_id: null,
    pdf_storage_path: null,
  }
}

export function CertificatesPage() {
  const { user, profile } = useAuth()
  const [certs, setCerts] = useState<Certificate[]>([])
  const [coursesById, setCoursesById] = useState<Map<string, Course>>(new Map())
  const [mentorNames, setMentorNames] = useState<Map<string, string>>(new Map())
  const [copiedSerial, setCopiedSerial] = useState<string | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [downloadingSerial, setDownloadingSerial] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    const currentUser = user
    let cancelled = false
    async function load() {
      try {
        const [rows, courseList] = await Promise.all([
          fetchMyCertificates(currentUser.id),
          fetchCourses(),
        ])
        const courseMap = new Map(courseList.map((c) => [c.id, c]))
        const mentorIds = rows
          .map((c) => (c.course_id ? courseMap.get(c.course_id)?.mentor_id : undefined))
          .filter((id): id is string => Boolean(id))
        const namesMap = await fetchProfileNames(mentorIds)
        if (!cancelled) {
          setCerts(rows)
          setCoursesById(courseMap)
          setMentorNames(namesMap)
        }
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

  async function handleCopy(cert: Certificate) {
    setCopyError(null)
    const ok = await copyText(verificationLinkForCert(cert))
    if (ok) {
      setCopiedSerial(cert.serial)
      window.setTimeout(() => setCopiedSerial((prev) => (prev === cert.serial ? null : prev)), 2000)
    } else {
      setCopyError('Gagal menyalin tautan.')
    }
  }

  // Nama pemilik untuk sertifikat yang diunduh: nama profil, atau awalan
  // email bila nama belum diisi.
  const ownerName =
    profile?.name?.trim() || user?.email?.split('@')[0] || 'Siswa'

  async function handleDownload(cert: Certificate, courseTitle: string | null, mentorName: string | null) {
    setDownloadError(null)
    setDownloadingSerial(cert.serial)
    try {
      await downloadCertificatePng({ cert, ownerName, courseTitle, mentorName })
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Gagal mengunduh sertifikat.')
    } finally {
      setDownloadingSerial(null)
    }
  }

  if (loading) return <div className="page"><p className="muted">Memuat sertifikat…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>

  return (
    <div className="page">
      <PageHeader
        icon="certificate"
        title="Sertifikat Saya"
        subtitle={
          <>
            Enam jenis sertifikat SINEVERSE: Course (SVS-CRS), Ujian Kompetensi (SVS-EXM), Karya
            (SVS-KRY), Apresiasi Mentor (SVS-MNT), Kelulusan Academy (SVS-ACD), Event (SVS-EVT).{' '}
            <Link to="/sertifikat/verifikasi">Verifikasi sertifikat berdasarkan nomor serial →</Link>
          </>
        }
      />
      {certs.length === 0 ? (
        <p className="empty">
          {/* LC7: teks lama memakai bahasa siswa ("nilai akhirmu") untuk semua
              peran — mentor/admin tidak punya nilai akhir sebagai siswa. */}
          {profile?.role === 'mentor' ? (
            <>
              Belum ada sertifikat. Sertifikat apresiasi mentor diterbitkan oleh admin untuk
              mentor course; sertifikat course diterbitkan oleh mentor atau admin setelah nilai
              akhir siswa lulus; sertifikat ujian diterbitkan otomatis saat siswa lulus ujian
              kompetensi; sertifikat karya diterbitkan untuk pemenang kompetisi; sertifikat
              kelulusan Academy diterbitkan admin setelah siswa memegang sertifikat course
              ke-10 course; sertifikat event diterbitkan admin untuk partisipasi event.
            </>
          ) : profile?.role === 'admin' ? (
            <>
              Belum ada sertifikat. Sertifikat course diterbitkan oleh mentor atau admin setelah
              nilai akhir siswa lulus; sertifikat ujian diterbitkan otomatis saat siswa lulus
              ujian kompetensi; sertifikat karya diterbitkan untuk pemenang kompetisi; sertifikat
              apresiasi mentor diterbitkan oleh admin untuk mentor course; sertifikat kelulusan
              Academy diterbitkan admin setelah siswa memegang sertifikat course ke-10 course;
              sertifikat event diterbitkan admin untuk partisipasi event.
            </>
          ) : (
            <>
              Belum ada sertifikat. Sertifikat course diterbitkan oleh mentor atau admin setelah
              nilai akhirmu lulus; sertifikat ujian diterbitkan otomatis saat kamu lulus ujian
              kompetensi; sertifikat karya diterbitkan untuk pemenang kompetisi; sertifikat
              apresiasi mentor diterbitkan oleh admin untuk mentor course; sertifikat kelulusan
              Academy diterbitkan admin setelah kamu memegang sertifikat course ke-10 course;
              sertifikat event diterbitkan admin untuk partisipasi event.
            </>
          )}
        </p>
      ) : (
        <ul className="discussion-list">
          {certs.map((c) => {
            const course = c.course_id ? coursesById.get(c.course_id) : undefined
            const mentorName = course?.mentor_id ? mentorNames.get(course.mentor_id) : null
            // Academy/event tidak punya course: tampilkan program/event.
            const programTitle = course?.title ?? c.program_name ?? null
            return (
              <li key={c.id} className="discussion-item" style={TYPE_STYLE[c.type]}>
                <CertificatePreview cert={c} ownerName={ownerName} courseTitle={programTitle} mentorName={mentorName ?? null} />
                <p className="discussion-meta">{TYPE_LABEL[c.type]} · Diterbitkan {fmtDate(c.issued_at)}</p>
                <h3>{c.serial}</h3>
                {programTitle && <p><strong>{programTitle}</strong></p>}
                {mentorName && <p className="muted">Mentor: {mentorName}</p>}
                {c.type === 'mentor' ? (
                  c.note ? <p><em>{c.note}</em></p> : null
                ) : c.type === 'course' ? (
                  <p className="muted">Nilai: {c.score ?? '—'}</p>
                ) : null}
                {c.status !== 'valid' && (
                  <p className="error-box" style={{ marginTop: '0.5rem' }}>
                    Status: {c.status === 'revoked' ? 'DICABUT' : 'TIDAK AKTIF'}
                    {c.status === 'revoked' && c.revoked_at ? ` pada ${fmtDate(c.revoked_at)}` : ''}
                    {c.status === 'revoked' && c.revocation_reason ? ` — ${c.revocation_reason}` : ''}
                  </p>
                )}
                <button type="button" className="btn btn-secondary btn-small" onClick={() => void handleCopy(c)}>
                  {copiedSerial === c.serial ? 'Disalin' : 'Salin tautan verifikasi'}
                </button>
                <p className="muted" style={{ marginTop: '0.5rem' }}>Pindai kode QR untuk verifikasi:</p>
                <QrCode value={verificationLinkForCert(c)} />
                {c.status !== 'valid' ? (
                  <p className="muted" style={{ marginTop: '0.5rem' }}>
                    Sertifikat ini {c.status === 'revoked' ? 'sudah dicabut' : 'tidak aktif'} — unduhan PNG dinonaktifkan.
                  </p>
                ) : (
                  <p style={{ marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => void handleDownload(c, programTitle, mentorName ?? null)}
                      disabled={downloadingSerial === c.serial}
                    >
                      {downloadingSerial === c.serial ? 'Mengunduh…' : 'Unduh Sertifikat (PNG)'}
                    </button>
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {copyError && <p className="error-box">{copyError}</p>}
      {downloadError && <p className="error-box">{downloadError}</p>}
    </div>
  )
}

export function VerifyCertificatePage() {
  const [searchParams] = useSearchParams()
  const [serial, setSerial] = useState('')
  const [result, setResult] = useState<VerificationResult | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [courseTitle, setCourseTitle] = useState<string | null>(null)
  const [mentorName, setMentorName] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoVerifiedRef = useRef<string | null>(null)

  async function applyResult(found: VerificationResult | null) {
    setResult(found)
    setNotFound(!found)
    setCourseTitle(found?.course_title ?? found?.program_name ?? null)
    setMentorName(null)
    if (found?.type === 'course' && found.course_id) {
      try {
        const courseList = await fetchCourses()
        const course = courseList.find((c) => c.id === found.course_id)
        setCourseTitle(course?.title ?? found.course_title ?? found.program_name ?? null)
        if (course?.mentor_id) {
          const namesMap = await fetchProfileNames([course.mentor_id])
          setMentorName(namesMap.get(course.mentor_id) ?? null)
        }
      } catch {
        // Nama mentor opsional: halaman tetap menampilkan hasil verifikasi.
      }
    }
  }

  async function verifyByTokenValue(token: string) {
    const value = token.trim()
    if (!value) return
    setBusy(true)
    setError(null)
    setResult(null)
    setNotFound(false)
    setCopiedLink(false)
    try {
      const found = await verifyByToken(value)
      await applyResult(found)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memverifikasi sertifikat.')
    } finally {
      setBusy(false)
    }
  }

  async function verifyBySerialValue(serialValue: string) {
    const value = serialValue.trim().toUpperCase()
    if (!value) return
    setBusy(true)
    setError(null)
    setResult(null)
    setNotFound(false)
    setCopiedLink(false)
    try {
      const found = await verifyBySerial(value)
      await applyResult(found)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memverifikasi sertifikat.')
    } finally {
      setBusy(false)
    }
  }

  // Prefill + jalankan otomatis bila tautan verifikasi dibuka:
  // ?token=<hash> (utama, dari QR) atau ?serial=… (tautan lama/manual).
  useEffect(() => {
    const queryToken = searchParams.get('token')?.trim() ?? ''
    const querySerial = searchParams.get('serial')?.trim().toUpperCase() ?? ''
    const key = queryToken ? `token:${queryToken}` : querySerial ? `serial:${querySerial}` : ''
    if (!key) {
      // BUGFIX 22 Nov 2026: pindah ke halaman verifikasi tanpa parameter harus
      // membersihkan hasil lama — sebelumnya hasil VALID sebelumnya tetap tampil.
      // P59: reset juga NOT FOUND, error, dan isi input serial supaya kotak
      // "NOT FOUND" lama tidak ikut tampil.
      autoVerifiedRef.current = ''
      setResult(null)
      setNotFound(false)
      setError(null)
      setSerial('')
      return
    }
    if (autoVerifiedRef.current === key) return
    autoVerifiedRef.current = key
    if (queryToken) {
      void verifyByTokenValue(queryToken)
    } else {
      setSerial(querySerial)
      void verifyBySerialValue(querySerial)
    }
    // Hanya saat parameter URL berubah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  async function handleVerify(e: FormEvent) {
    e.preventDefault()
    await verifyBySerialValue(serial)
  }

  async function handleCopyLink() {
    if (!result) return
    setCopyError(null)
    const cert = certificateFromVerification(result)
    const ok = await copyText(verificationLinkForCert(cert))
    if (ok) {
      setCopiedLink(true)
      window.setTimeout(() => setCopiedLink(false), 2000)
    } else {
      setCopyError('Gagal menyalin tautan.')
    }
  }

  async function handleDownloadVerified() {
    if (!result) return
    setDownloadError(null)
    setDownloading(true)
    try {
      await downloadCertificatePng({
        cert: certificateFromVerification(result),
        ownerName: result.recipient_name ?? 'Penerima',
        courseTitle,
        mentorName,
      })
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Gagal mengunduh sertifikat.')
    } finally {
      setDownloading(false)
    }
  }

  const banner = result ? STATUS_BANNER[result.status] : null

  return (
    <div className="page page-narrow">
      <h1>Verifikasi Sertifikat</h1>
      <p className="muted">
        Pindai kode QR pada sertifikat, atau masukkan nomor serial (mis. SVS-CRS-2026-0001)
        untuk memeriksa keasliannya. Verifikasi tidak memerlukan akun.
      </p>
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
      {notFound && (
        <div className="discussion-item" style={{ borderLeft: '4px solid #c0392b', background: '#fdecea' }}>
          <p><strong>NOT FOUND</strong></p>
          <p>Sertifikat tidak dapat diverifikasi melalui sistem SINEVERSE.</p>
        </div>
      )}
      {result && banner && (
        <div className="discussion-item" style={TYPE_STYLE[result.type]}>
          <div style={{ ...banner.style, borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem' }}>
            <p style={{ margin: 0, fontWeight: 700 }}>
              {result.status === 'valid' ? '✓ ' : ''}{banner.label}
            </p>
            <p style={{ margin: '0.25rem 0 0' }}>{banner.text}</p>
            {result.status === 'revoked' && result.revoked_at && (
              <p style={{ margin: '0.25rem 0 0' }}>Dicabut pada {fmtDate(result.revoked_at)}.</p>
            )}
            {result.status === 'revoked' && result.revocation_reason && (
              <p style={{ margin: '0.25rem 0 0' }}>Alasan: {result.revocation_reason}</p>
            )}
          </div>
          <CertificatePreview
            cert={certificateFromVerification(result)}
            ownerName={result.recipient_name ?? 'Penerima'}
            courseTitle={courseTitle}
            mentorName={mentorName}
          />
          <p><strong>{TYPE_LABEL[result.type]}</strong></p>
          <p>Penerima: {result.recipient_name ?? '—'}</p>
          {courseTitle && <p>Course/Program: {courseTitle}</p>}
          {result.event_name && <p>Event: {result.event_name}</p>}
          {mentorName && <p>Mentor: {mentorName}</p>}
          {result.type === 'course' && <p>Nilai: {result.score ?? '—'}</p>}
          {result.type === 'mentor' && result.note && <p><em>{result.note}</em></p>}
          {result.achievement_description && <p>{result.achievement_description}</p>}
          <p>Penerbit: SINEVERSE — Tim SINEVERSE</p>
          <p>Serial: {result.serial}</p>
          <p>Diterbitkan: {fmtDate(result.issued_at)}</p>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => void handleCopyLink()}>
            {copiedLink ? 'Disalin' : 'Salin tautan verifikasi'}
          </button>
          <p className="muted" style={{ marginTop: '0.5rem' }}>Pindai kode QR untuk verifikasi:</p>
          <QrCode value={verificationLinkForCert(certificateFromVerification(result))} />
          {result.status !== 'valid' ? (
            <p className="muted" style={{ marginTop: '0.5rem' }}>
              Sertifikat ini {result.status === 'revoked' ? 'sudah dicabut' : 'tidak aktif'} — unduhan PNG dinonaktifkan.
            </p>
          ) : (
            <p style={{ marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => void handleDownloadVerified()} disabled={downloading}>
                {downloading ? 'Mengunduh…' : 'Unduh Sertifikat (PNG)'}
              </button>
            </p>
          )}
          {copyError && <p className="error-box">{copyError}</p>}
          {downloadError && <p className="error-box">{downloadError}</p>}
        </div>
      )}
      <p><Link to="/sertifikat">Kembali ke Sertifikat Saya</Link></p>
    </div>
  )
}
