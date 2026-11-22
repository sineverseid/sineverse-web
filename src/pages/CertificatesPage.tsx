// SINEVERSE — Sertifikat: "Sertifikat Saya" (3 jenis dengan tampilan
// berbeda: course SVS-CRS, ujian SVS-EXM, karya SVS-KRY) + verifikasi
// sertifikat berdasarkan nomor serial. Tautan verifikasi adalah metode
// verifikasi sertifikat (tidak ada QR code — tidak ada pustaka QR di
// package.json): /sertifikat/verifikasi?serial=SVS-___-____-____
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fmtDate } from '../lib/guarded'
import {
  appBaseUrl,
  fetchCourses,
  fetchMyCertificates,
  fetchProfileNames,
  fetchPublicProfile,
  verifyCertificate,
} from '../lib/supabase'
import type { Certificate, Course } from '../lib/types'
import PageHeader from '../components/PageHeader'

function verificationLink(serial: string): string {
  // Perbaikan 22 Nov 2026: tautan lama hanya memakai origin sehingga
  // kehilangan segmen /sineverse-web/ dan rute hash (#/) — tautan yang
  // disalin tidak bisa dibuka. appBaseUrl() sudah mencakup segmen pertama.
  return `${appBaseUrl()}#/sertifikat/verifikasi?serial=${serial}`
}

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
}

const TYPE_STYLE: Record<Certificate['type'], React.CSSProperties> = {
  course: { borderLeft: '4px solid var(--film-green)', background: '#fff' },
  exam: { borderLeft: '4px solid var(--navy)', background: '#fff' },
  work: { borderLeft: '4px solid #b8860b', background: '#fffdf5' },
}

export function CertificatesPage() {
  const { user } = useAuth()
  const [certs, setCerts] = useState<Certificate[]>([])
  const [coursesById, setCoursesById] = useState<Map<string, Course>>(new Map())
  const [mentorNames, setMentorNames] = useState<Map<string, string>>(new Map())
  const [copiedSerial, setCopiedSerial] = useState<string | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)
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
          .map((c) => courseMap.get(c.course_id)?.mentor_id)
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

  async function handleCopy(serial: string) {
    setCopyError(null)
    const ok = await copyText(verificationLink(serial))
    if (ok) {
      setCopiedSerial(serial)
      window.setTimeout(() => setCopiedSerial((prev) => (prev === serial ? null : prev)), 2000)
    } else {
      setCopyError('Gagal menyalin tautan. Salin manual: ' + verificationLink(serial))
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
            Tiga jenis sertifikat SINEVERSE: Course (SVS-CRS), Ujian Kompetensi (SVS-EXM), Karya
            (SVS-KRY).{' '}
            <Link to="/sertifikat/verifikasi">Verifikasi sertifikat berdasarkan nomor serial →</Link>
          </>
        }
      />
      {certs.length === 0 ? (
        <p className="empty">
          Belum ada sertifikat. Sertifikat course diterbitkan oleh mentor atau admin setelah nilai
          akhirmu lulus; sertifikat ujian diterbitkan otomatis saat kamu lulus ujian kompetensi;
          sertifikat karya diterbitkan untuk pemenang kompetisi.
        </p>
      ) : (
        <ul className="discussion-list">
          {certs.map((c) => {
            const course = coursesById.get(c.course_id)
            const mentorName = course?.mentor_id ? mentorNames.get(course.mentor_id) : null
            return (
              <li key={c.id} className="discussion-item" style={TYPE_STYLE[c.type]}>
                <p className="discussion-meta">{TYPE_LABEL[c.type]} · Diterbitkan {fmtDate(c.issued_at)}</p>
                <h3>{c.serial}</h3>
                {course && <p><strong>{course.title}</strong></p>}
                {mentorName && <p className="muted">Mentor: {mentorName}</p>}
                <p className="muted">Nilai: {c.score ?? '—'}</p>
                <button type="button" className="btn btn-secondary btn-small" onClick={() => void handleCopy(c.serial)}>
                  {copiedSerial === c.serial ? 'Disalin' : 'Salin tautan verifikasi'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {copyError && <p className="error-box">{copyError}</p>}
    </div>
  )
}

export function VerifyCertificatePage() {
  const [searchParams] = useSearchParams()
  const [serial, setSerial] = useState('')
  const [result, setResult] = useState<{ found: boolean; cert: Certificate | null; ownerName: string | null } | null>(null)
  const [courseTitle, setCourseTitle] = useState<string | null>(null)
  const [mentorName, setMentorName] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoVerifiedRef = useRef<string | null>(null)

  async function verify(serialValue: string) {
    const value = serialValue.trim().toUpperCase()
    if (!value) return
    setBusy(true)
    setError(null)
    setResult(null)
    setCourseTitle(null)
    setMentorName(null)
    setCopiedLink(false)
    try {
      const cert = await verifyCertificate(value)
      if (!cert) {
        setResult({ found: false, cert: null, ownerName: null })
        return
      }
      const [owner, courseList] = await Promise.all([
        fetchPublicProfile(cert.user_id),
        fetchCourses(),
      ])
      const course = courseList.find((c) => c.id === cert.course_id)
      let mentor: string | null = null
      if (course?.mentor_id) {
        const namesMap = await fetchProfileNames([course.mentor_id])
        mentor = namesMap.get(course.mentor_id) ?? null
      }
      setCourseTitle(course?.title ?? null)
      setMentorName(mentor)
      setResult({ found: true, cert, ownerName: owner?.name ?? null })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memverifikasi sertifikat.')
    } finally {
      setBusy(false)
    }
  }

  // Prefill + jalankan otomatis bila tautan verifikasi dibuka (?serial=…).
  useEffect(() => {
    const querySerial = searchParams.get('serial')?.trim().toUpperCase() ?? ''
    if (!querySerial || autoVerifiedRef.current === querySerial) return
    autoVerifiedRef.current = querySerial
    setSerial(querySerial)
    void verify(querySerial)
    // Hanya saat serial di URL berubah; verify stabil per nilai serial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  async function handleVerify(e: FormEvent) {
    e.preventDefault()
    await verify(serial)
  }

  async function handleCopyLink() {
    if (!result?.cert) return
    setCopyError(null)
    const ok = await copyText(verificationLink(result.cert.serial))
    if (ok) {
      setCopiedLink(true)
      window.setTimeout(() => setCopiedLink(false), 2000)
    } else {
      setCopyError('Gagal menyalin tautan.')
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
          {courseTitle && <p>Course/Program: {courseTitle}</p>}
          {mentorName && <p>Mentor: {mentorName}</p>}
          <p>Penyelenggara: SINEVERSE</p>
          <p>Serial: {result.cert.serial}</p>
          <p>Penerima: {result.ownerName ?? '—'}</p>
          <p>Nilai: {result.cert.score ?? '—'}</p>
          <p>Diterbitkan: {fmtDate(result.cert.issued_at)}</p>
          <p>
            Tautan verifikasi:{' '}
            <span style={{ wordBreak: 'break-all' }}>{verificationLink(result.cert.serial)}</span>
          </p>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => void handleCopyLink()}>
            {copiedLink ? 'Disalin' : 'Salin tautan verifikasi'}
          </button>
          {copyError && <p className="error-box">{copyError}</p>}
        </div>
      )}
      <p><Link to="/sertifikat">Kembali ke Sertifikat Saya</Link></p>
    </div>
  )
}
