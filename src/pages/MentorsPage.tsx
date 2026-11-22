// SINEVERSE, Direktori Mentor.
// SINEVERSE Mentors (master prompt §03: profil, kelas, sesi mentoring).
// Semua anggota bisa melihat mentor terverifikasi, course yang diampu,
// dan sesi office hour-nya. Hanya data publik yang aman yang ditampilkan
// (tanpa email, telepon, atau alamat).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchCourses, supabase } from '../lib/supabase'
import type { Course, OfficeHour, Profile } from '../lib/types'
import Icon from '../components/icons'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

interface MentorRow {
  profile: Profile
  courses: string[]
  officeHours: OfficeHour[]
}

export default function MentorsPage() {
  const { user, profile } = useAuth()
  const [rows, setRows] = useState<MentorRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [verifiedOnly, setVerifiedOnly] = useState(true)
  const [hoursError, setHoursError] = useState(false)
  const [brokenPhotos, setBrokenPhotos] = useState<Set<string>>(new Set())
  // Nama sekolah referensi (id → nama) untuk mentor yang school_id-nya
  // terisi — dimuat sekali dengan satu query .in().
  const [schoolNames, setSchoolNames] = useState<Map<string, string>>(new Map())

  // Afiliasi yang ditampilkan di kartu: nama sekolah referensi bila
  // school_id terisi (dan ketemu), kalau tidak teks bebas profiles.school.
  const affiliationOf = (p: Profile) =>
    (p.school_id ? schoolNames.get(p.school_id) : undefined) ?? p.school ?? null

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        // Profil mentor, lamaran, course, dan office hours independen —
        // dimuat paralel. Lamaran dan office hours gagal tetap ditangani
        // non-fatal seperti sebelumnya (tampil semua mentor / jadwal
        // gagal dimuat), bukan error halaman.
        const [profRes, appsRes, courses, hoursRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('id,email,name,role,photo_url,phone,city,bio,skills,interests,school,school_id,created_at')
            .eq('role', 'mentor')
            .order('name'),
          supabase
            .from('mentor_applications')
            .select('user_id')
            .eq('status', 'approved')
            .then(
              (r) => ({ ok: !r.error, data: r.data }) as const,
              () => ({ ok: false, data: null }) as const,
            ),
          fetchCourses(),
          supabase
            .from('office_hours')
            .select('*')
            .order('starts_at', { ascending: true })
            .then(
              (r) => ({ ok: !r.error, data: r.data }) as const,
              () => ({ ok: false, data: null }) as const,
            ),
        ])
        const { data: profs, error: qErr } = profRes
        if (qErr) throw qErr
        const mentors = (profs ?? []) as Profile[]
        // Hanya mentor yang lamarannya disetujui yang boleh tampil dengan
        // label terverifikasi. Bila query lamaran gagal, tampilkan semua
        // mentor tanpa klaim terverifikasi.
        let verifiedIds: Set<string> | null = null
        if (!appsRes.ok) {
          verifiedIds = null
        } else {
          verifiedIds = new Set(((appsRes.data ?? []) as { user_id: string }[]).map((a) => a.user_id))
        }
        const visible = verifiedIds ? mentors.filter((m) => verifiedIds.has(m.id)) : mentors
        if (!cancelled) setVerifiedOnly(verifiedIds !== null)
        if (!hoursRes.ok) {
          if (!cancelled) setHoursError(true)
        }
        const hourRows = (hoursRes.data ?? []) as OfficeHour[]
        const now = new Date()
        // Nama sekolah referensi untuk mentor yang school_id-nya terisi
        // (satu query .in(), pola yang sama dipakai GrowthPage).
        const schoolIds = [
          ...new Set(visible.map((m) => m.school_id).filter((id): id is string => !!id)),
        ]
        if (schoolIds.length > 0) {
          const { data: schoolRows } = await supabase
            .from('schools')
            .select('id,name')
            .in('id', schoolIds)
          if (!cancelled && schoolRows) {
            setSchoolNames(
              new Map((schoolRows as { id: string; name: string }[]).map((s) => [s.id, s.name])),
            )
          }
        }
        const out: MentorRow[] = visible.map((m) => ({
          profile: m,
          courses: courses.filter((c: Course) => c.mentor_id === m.id).map((c: Course) => c.title),
          officeHours: hourRows.filter(
            (h) => h.mentor_id === m.id && h.starts_at && new Date(h.starts_at) >= now,
          ),
        }))
        if (!cancelled) setRows(out)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat direktori mentor.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const initials = (name: string | null | undefined) => {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return 'M'
    return (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase()
  }

  return (
    <div className="page">
      <PageHeader
        icon="mentor"
        title="Mentors"
        subtitle={
          verifiedOnly
            ? 'Mentor terverifikasi SINEVERSE. Lihat course yang diampu dan sesi mentoring yang tersedia.'
            : 'Mentor SINEVERSE. Lihat course yang diampu dan sesi mentoring yang tersedia.'
        }
      />
      {loading && <p className="muted">Memuat mentor…</p>}
      {error && <p className="error-box">{error}</p>}
      {/* Jalan masuk lamaran mentor (migrasi 027): siswa yang sudah login
          mendaftar lewat halaman Mentor Workspace (#/mentor). */}
      {user && profile?.role === 'siswa' && (
        <p>
          <Link to="/mentor" className="btn btn-primary">
            Gabung sebagai Mentor
          </Link>
        </p>
      )}
      {!loading && !error && rows !== null && rows.length === 0 && (
        <EmptyState
          message={
            verifiedOnly
              ? 'Belum ada mentor. Belum ada mentor terverifikasi di platform.'
              : 'Belum ada mentor di platform.'
          }
        />
      )}
      {!loading && !error && rows !== null && rows.length > 0 && (
        <ul className="discussion-list">
          {rows.map((r) => (
            <li key={r.profile.id} className="discussion-item">
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                {r.profile.photo_url && !brokenPhotos.has(r.profile.id) ? (
                  <img
                    src={r.profile.photo_url}
                    alt={r.profile.name ?? 'Mentor'}
                    style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }}
                    onError={() => setBrokenPhotos((prev) => new Set(prev).add(r.profile.id))}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      background: 'var(--navy)',
                      color: '#fff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {initials(r.profile.name)}
                  </span>
                )}
                <div>
                  <h3 style={{ margin: 0 }}>{r.profile.name ?? 'Mentor'}</h3>
                  {affiliationOf(r.profile) && (
                    <p className="muted" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Icon name="school" size={14} />
                      {affiliationOf(r.profile)}
                    </p>
                  )}
                  {r.profile.city && <p className="muted" style={{ margin: 0 }}>{r.profile.city}</p>}
                </div>
              </div>
              {r.profile.bio && <p>{r.profile.bio}</p>}
              {r.profile.skills && r.profile.skills.length > 0 && (
                <p className="muted">Keahlian: {r.profile.skills.join(', ')}</p>
              )}
              <p>
                <strong>Course yang diampu ({r.courses.length}):</strong>{' '}
                {r.courses.length === 0 ? 'Belum mengampu course.' : r.courses.join(', ')}
              </p>
              <p>
                <strong>Sesi mentoring:</strong>{' '}
                {hoursError
                  ? 'Jadwal gagal dimuat.'
                  : r.officeHours.length === 0
                    ? 'Belum ada jadwal office hour.'
                    : `${r.officeHours.length} sesi tersedia.`}{' '}
                <Link to="/jam-kantor">Lihat Office Hours</Link>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
