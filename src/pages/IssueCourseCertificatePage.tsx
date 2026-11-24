// SINEVERSE — Admin/Mentor Academy: Terbitkan Sertifikat Course (Tahap 5).
// Penerbitan memakai RPC issue_course_certificate() (migrasi 016) yang
// menghitung ulang nilai akhir di server dan hanya menerbitkan bila siswa
// lulus. Tabel kelayakan di bawah memakai helper fetchCourseEligibility
// dari lib/certificates.ts — skor tidak pernah dikarang di halaman ini.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  fetchCourseEligibility,
  fetchIssuedCourseCertificates,
  issueCourseCertificate,
} from '../lib/certificates'
import type { EligibilityRow } from '../lib/certificates'
import { fetchCourses, fetchProfileNames, logAudit, notifyIfAllowed, supabase } from '../lib/supabase'
import type { Certificate, Course } from '../lib/types'
import PageHeader from '../components/PageHeader'

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatScore(value: number | null): string {
  return value === null ? '—' : value.toFixed(1)
}

export default function IssueCourseCertificatePage() {
  const { profile, loading: authLoading } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [eligibility, setEligibility] = useState<EligibilityRow[] | null>(null)
  const [issued, setIssued] = useState<Certificate[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [weightsNote, setWeightsNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingCourse, setLoadingCourse] = useState(false)
  const [issuingUserId, setIssuingUserId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isAllowed = profile?.role === 'admin' || profile?.role === 'mentor'

  useEffect(() => {
    if (!isAllowed || !profile) return
    let cancelled = false
    async function load() {
      try {
        const courseList = await fetchCourses()
        // Mentor melihat course yang ia ampu sebagai mentor utama DAN
        // sebagai co-mentor/assistant-grader lewat course_teachers
        // (migrasi 003: course_id, user_id, role).
        let visible =
          profile?.role === 'mentor' ? courseList.filter((c) => c.mentor_id === profile.id) : courseList
        if (profile?.role === 'mentor') {
          try {
            const { data: coRows } = await supabase
              .from('course_teachers')
              .select('course_id')
              .eq('user_id', profile.id)
            const coIds = new Set(((coRows ?? []) as { course_id: string }[]).map((r) => r.course_id))
            if (coIds.size > 0) {
              visible = courseList.filter((c) => c.mentor_id === profile.id || coIds.has(c.id))
            }
          } catch {
            // Gagal membaca course_teachers (mis. RLS) — tetap tampilkan
            // course mentor utama supaya halaman tetap bisa dipakai.
          }
        }
        if (cancelled) return
        setCourses(visible)
        if (visible.length > 0) setSelectedCourseId(visible[0].id)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat course.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [isAllowed, profile])

  useEffect(() => {
    if (!selectedCourseId) return
    let cancelled = false
    async function loadCourse() {
      setLoadingCourse(true)
      setEligibility(null)
      setIssued([])
      setWeightsNote('')
      try {
        const [result, issuedRows] = await Promise.all([
          fetchCourseEligibility(selectedCourseId),
          fetchIssuedCourseCertificates(selectedCourseId),
        ])
        const userIds = [
          ...new Set([
            ...result.rows.map((r) => r.userId),
            ...issuedRows.map((c) => c.user_id),
          ]),
        ]
        const namesMap = await fetchProfileNames(userIds)
        if (cancelled) return
        setEligibility(result.rows)
        setWeightsNote(result.weightsNote)
        setIssued(issuedRows)
        setNames(namesMap)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat kelayakan sertifikat.')
      } finally {
        if (!cancelled) setLoadingCourse(false)
      }
    }
    void loadCourse()
    return () => {
      cancelled = true
    }
  }, [selectedCourseId])

  async function handleIssue(row: EligibilityRow) {
    if (!selectedCourseId || issuingUserId) return
    setIssuingUserId(row.userId)
    setNotice(null)
    setError(null)
    try {
      const result = await issueCourseCertificate(selectedCourseId, row.userId)
      // Best-effort: audit tidak boleh memblokir UI.
      void logAudit('certificate.issued', 'certificates', result.serial, {
        course_id: selectedCourseId,
        user_id: row.userId,
      })
      // Fase 2 — beri tahu pemilik sertifikat, hanya bila baru terbit
      // (alreadyIssued = serial lama, jangan kirim ulang).
      if (!result.alreadyIssued) {
        const courseTitle = courses.find((c) => c.id === selectedCourseId)?.title ?? 'Course'
        void notifyIfAllowed(
          row.userId,
          'nilai',
          'certificate',
          `Sertifikat course terbit: "${courseTitle}"`,
          `Sertifikat ${result.serial} sudah terbit dengan nilai ${result.score}. Lihat dan unduh di halaman Sertifikat.`,
          { certificate_serial: result.serial, certificate_type: 'course', course_id: selectedCourseId },
        ).catch(() => undefined)
      }
      setNotice(
        result.alreadyIssued
          ? `Sertifikat sudah pernah terbit: ${result.serial}, nilai ${result.score}.`
          : `Sertifikat terbit: ${result.serial}, nilai ${result.score}.`,
      )
      setEligibility((prev) => (prev ?? []).filter((r) => r.userId !== row.userId))
      const refreshed = await fetchIssuedCourseCertificates(selectedCourseId)
      setIssued(refreshed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menerbitkan sertifikat.')
    } finally {
      setIssuingUserId(null)
    }
  }

  if (authLoading) return <div className="page"><p className="muted">Memuat…</p></div>
  if (!isAllowed) {
    return (
      <div className="page">
        <h1>Terbitkan Sertifikat Course</h1>
        <p className="empty">Halaman ini hanya untuk admin dan mentor.</p>
      </div>
    )
  }
  if (loading) return <div className="page"><p className="muted">Memuat…</p></div>
  if (error && courses.length === 0) return <div className="page"><p className="error-box">{error}</p></div>

  const selectedCourse = courses.find((c) => c.id === selectedCourseId)

  return (
    <div className="page">
      <PageHeader
        icon="certificate"
        title="Terbitkan Sertifikat Course"
        subtitle="Terbitkan sertifikat course (SVS-CRS) untuk siswa yang sudah lulus. Nilai akhir dihitung dari lima komponen dan dicek ulang di server sebelum sertifikat terbit."
      />
      {courses.length === 0 ? (
        <p className="empty">
          {profile?.role === 'mentor'
            ? 'Belum ada course yang kamu ampu sebagai mentor utama.'
            : 'Belum ada course.'}
        </p>
      ) : (
        <>
          <section className="section">
            <label>
              Course
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
              >
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
            <p className="muted">Bobot dan ambang lulus: {weightsNote || 'memuat…'}</p>
            {profile?.role === 'mentor' && (
              <p className="muted">
                Daftar ini menampilkan course dengan kamu sebagai mentor utama atau sebagai
                co-mentor (course_teachers). Bila course yang kamu ampu tidak muncul di sini,
                hubungi admin.
              </p>
            )}
            <p className="muted">
              Hanya siswa terdaftar yang belum punya sertifikat course di course ini yang dinilai.
              Tombol "Terbitkan" hanya muncul untuk siswa yang nilainya sudah lulus.
            </p>
            {notice && <p className="notice-box">{notice}</p>}
            {error && <p className="error-box">{error}</p>}
            {loadingCourse && <p className="muted">Memuat…</p>}
            {!loadingCourse && eligibility !== null && eligibility.length === 0 && (
              <p className="empty">Semua siswa terdaftar di course ini sudah punya sertifikat course, atau belum ada siswa terdaftar.</p>
            )}
            {!loadingCourse && eligibility !== null && eligibility.length > 0 && (
              <div className="grade-table-wrap">
                <table className="grade-table">
                  <thead>
                    <tr>
                      <th>Siswa</th>
                      <th>Pretest</th>
                      <th>Posttest</th>
                      <th>Tugas Mingguan</th>
                      <th>Tugas Praktik Akhir</th>
                      <th>Diskusi</th>
                      <th>Nilai Akhir</th>
                      <th>Status</th>
                      <th>Komponen Belum Ada</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eligibility.map((r) => (
                      <tr key={r.userId}>
                        <td>{names.get(r.userId) ?? 'Siswa'}</td>
                        <td>{formatScore(r.components.pretest)}</td>
                        <td>{formatScore(r.components.posttest)}</td>
                        <td>{formatScore(r.components.weeklyAssignments)}</td>
                        <td>{formatScore(r.components.finalPractice)}</td>
                        <td>{formatScore(r.components.discussion)}</td>
                        <td>{r.components.final.toFixed(1)}</td>
                        <td>{r.components.passed ? 'Layak' : 'Belum layak'}</td>
                        <td>{r.missing.length === 0 ? '—' : r.missing.join(', ')}</td>
                        <td>
                          {r.components.passed && (
                            <button
                              type="button"
                              className="btn btn-primary btn-small"
                              disabled={issuingUserId === r.userId}
                              onClick={() => void handleIssue(r)}
                            >
                              {issuingUserId === r.userId ? 'Menerbitkan…' : 'Terbitkan'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="section">
            <h2>Sertifikat Course Sudah Terbit ({issued.length})</h2>
            {loadingCourse ? (
              <p className="muted">Memuat…</p>
            ) : issued.length === 0 ? (
              <p className="empty">Belum ada sertifikat course yang terbit untuk {selectedCourse?.title ?? 'course ini'}.</p>
            ) : (
              <div className="grade-table-wrap">
                <table className="grade-table">
                  <thead>
                    <tr><th>Siswa</th><th>Serial</th><th>Skor</th><th>Tanggal Terbit</th></tr>
                  </thead>
                  <tbody>
                    {issued.map((c) => (
                      <tr key={c.id}>
                        <td>{names.get(c.user_id) ?? 'Siswa'}</td>
                        <td>{c.serial}</td>
                        <td>{c.score === null ? '—' : c.score}</td>
                        <td>{formatDate(c.issued_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      <p className="muted">
        <Link to={profile?.role === 'mentor' ? '/mentor' : '/admin'}>
          Kembali ke {profile?.role === 'mentor' ? 'Mentor Workspace' : 'Admin Panel'}
        </Link>
        {' · '}
        <Link to="/admin/sertifikat">Lihat semua sertifikat</Link>
      </p>
    </div>
  )
}
