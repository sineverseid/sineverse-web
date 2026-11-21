// SINEVERSE — Direktori Mentor.
// SINEVERSE Mentors (master prompt §03: profil, kelas, sesi mentoring).
// Semua anggota bisa melihat mentor terverifikasi, course yang diampu,
// dan sesi office hour-nya. Hanya data publik yang aman yang ditampilkan
// (tanpa email, telepon, atau alamat).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchCourses, supabase } from '../lib/supabase'
import type { Course, OfficeHour, Profile } from '../lib/types'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

interface MentorRow {
  profile: Profile
  courses: string[]
  officeHours: OfficeHour[]
}

export default function MentorsPage() {
  const [rows, setRows] = useState<MentorRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data: profs, error: qErr } = await supabase
          .from('profiles')
          .select('id,email,name,role,photo_url,phone,city,bio,skills,interests,created_at')
          .eq('role', 'mentor')
          .order('name')
        if (qErr) throw qErr
        const mentors = (profs ?? []) as Profile[]
        const courses = await fetchCourses()
        const { data: hours } = await supabase
          .from('office_hours')
          .select('*')
          .order('starts_at', { ascending: true })
        const hourRows = (hours ?? []) as OfficeHour[]
        const out: MentorRow[] = mentors.map((m) => ({
          profile: m,
          courses: courses.filter((c: Course) => c.mentor_id === m.id).map((c: Course) => c.title),
          officeHours: hourRows.filter((h) => h.mentor_id === m.id),
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

  return (
    <div className="page">
      <PageHeader
        icon="mentor"
        title="Mentors"
        subtitle="Mentor terverifikasi SINEVERSE — lihat course yang diampu dan sesi mentoring yang tersedia."
      />
      {loading && <p className="muted">Memuat mentor…</p>}
      {error && <p className="error-box">{error}</p>}
      {!loading && !error && rows !== null && rows.length === 0 && (
        <EmptyState
          message="Belum ada mentor. Belum ada mentor terverifikasi di platform."
        />
      )}
      {!loading && !error && rows !== null && rows.length > 0 && (
        <ul className="discussion-list">
          {rows.map((r) => (
            <li key={r.profile.id} className="discussion-item">
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                {r.profile.photo_url ? (
                  <img
                    src={r.profile.photo_url}
                    alt={r.profile.name ?? 'Mentor'}
                    style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : null}
                <div>
                  <h3 style={{ margin: 0 }}>{r.profile.name ?? 'Mentor'}</h3>
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
                {r.officeHours.length === 0
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
