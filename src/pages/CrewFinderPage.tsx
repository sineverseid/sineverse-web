// SINEVERSE, Crew Finder: cari kru berdasarkan nama / peran / skill /
// minat / ketersediaan. Hanya field aman-publik yang ditampilkan —
// TIDAK PERNAH email (aturan 005). Hanya profil yang membuka diri
// (is_open_to_crew) yang muncul.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { isMissingTableError } from '../lib/guarded'
import { fetchCrewProfiles, supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'

type CrewRow = Awaited<ReturnType<typeof fetchCrewProfiles>>[number]

const ROLE_LABEL: Record<string, string> = {
  siswa: 'Siswa',
  mentor: 'Mentor',
  admin: 'Admin',
}

/** Samakan berbagai penulisan ketersediaan ke satu kunci filter. */
export function normalizeAvailability(value: string | null | undefined): string {
  const v = (value ?? '').toLowerCase().trim()
  if (!v) return ''
  if (v.includes('weekend') || v.includes('akhir pekan') || v.includes('sabtu') || v.includes('minggu')) return 'weekend'
  if (v.includes('weekday') || v.includes('hari kerja') || v.includes('senin') || v.includes('selasa') || v.includes('rabu') || v.includes('kamis') || v.includes('jumat') || v.includes('jumat') || v.includes('senin-jumat') || v.includes('senin - jumat')) return 'weekday'
  if (v.includes('fleksibel') || v.includes('flexible') || v.includes('kapan saja') || v.includes('kapan pun')) return 'flexible'
  return v
}

const AVAILABILITY_LABEL: Record<string, string> = {
  weekend: 'Akhir pekan',
  weekday: 'Hari kerja',
  flexible: 'Fleksibel',
}

function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function CrewFinderPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState<CrewRow[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [skill, setSkill] = useState('')
  const [availability, setAvailability] = useState('')
  const [roles, setRoles] = useState<Map<string, string>>(new Map())
  const [myProjects, setMyProjects] = useState<{ id: string; title: string }[]>([])
  const [inviteProjectId, setInviteProjectId] = useState('')
  const [photoBroken, setPhotoBroken] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        // Profil kru, peran, dan proyek saya independen — dimuat paralel.
        const [data, roleData, projData] = await Promise.all([
          fetchCrewProfiles(),
          supabase.from('profiles').select('id,role').eq('is_open_to_crew', true).then((r) => r.data),
          user
            ? supabase.from('projects').select('id,title').eq('owner_id', user.id).order('created_at', { ascending: false }).then((r) => r.data)
            : Promise.resolve(null),
        ])
        if (!cancelled) setRows(data)
        // Peran tidak ikut di fetchCrewProfiles, jadi ambil langsung dari profiles.
        if (!cancelled && roleData) {
          const map = new Map<string, string>()
          for (const r of roleData as { id: string; role: string }[]) map.set(r.id, r.role)
          setRoles(map)
        }
        if (user) {
          if (!cancelled && projData) {
            const list = projData as { id: string; title: string }[]
            setMyProjects(list)
            if (list.length > 0) setInviteProjectId(list[0].id)
          }
        }
      } catch (err) {
        if (!cancelled) {
          if (isMissingTableError(err)) setMissing(true)
          else setError('Gagal memuat Crew Finder. Coba lagi.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return <div className="page"><p className="muted">Memuat Crew Finder…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (missing) return <div className="page"><h1>Crew Finder</h1><MigrationNotice migration="005" /></div>

  const needle = q.trim().toLowerCase()
  const filtered = (rows ?? []).filter((r) => {
    if (r.id === user?.id) return false
    if (needle) {
      const role = roles.get(r.id) ?? ''
      const roleLabel = ROLE_LABEL[role] ?? role
      const hay = `${r.name ?? ''} ${role} ${roleLabel} ${(r.skills ?? []).join(' ')} ${(r.interests ?? []).join(' ')} ${r.city ?? ''} ${r.bio ?? ''}`.toLowerCase()
      if (!hay.includes(needle)) return false
    }
    if (skill && !(r.skills ?? []).some((s) => s.toLowerCase().includes(skill.toLowerCase()))) return false
    if (availability && normalizeAvailability(r.availability) !== availability) return false
    return true
  })
  const allSkills = [...new Set((rows ?? []).flatMap((r) => r.skills ?? []))].sort()
  const totalCrew = (rows ?? []).filter((r) => r.id !== user?.id).length
  const hasActiveFilter = Boolean(needle || skill || availability)

  return (
    <div className="page">
      <PageHeader
        icon="crew"
        title="Crew Finder"
        subtitle="Temukan kru untuk proyek filmmu. Hanya anggota yang membuka diri untuk kru yang tampil di sini, dan hanya info publik yang ditampilkan, alamat email tidak pernah ditampilkan."
      />
      <div className="filters">
        <input
          className="search-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama, peran, skill, minat, kota…"
          aria-label="Cari kru"
        />
        <div className="chip-row">
          <select value={skill} onChange={(e) => setSkill(e.target.value)} aria-label="Filter skill" style={{ fontFamily: 'inherit', padding: '0.5rem 0.7rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}>
            <option value="">Semua skill</option>
            {allSkills.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select value={availability} onChange={(e) => setAvailability(e.target.value)} aria-label="Filter ketersediaan" style={{ fontFamily: 'inherit', padding: '0.5rem 0.7rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}>
            <option value="">Ketersediaan apa saja</option>
            <option value="weekend">Akhir pekan</option>
            <option value="weekday">Hari kerja</option>
            <option value="flexible">Fleksibel</option>
          </select>
        </div>
      </div>
      <p className="muted">{filtered.length} kru ditemukan</p>
      {totalCrew === 0 ? (
        <p className="empty">Belum ada kru yang membuka diri untuk proyek.</p>
      ) : filtered.length === 0 ? (
        <p className="empty">
          {hasActiveFilter
            ? 'Tidak ada kru yang cocok dengan pencarian atau filtermu. Coba ubah kata kunci atau filter.'
            : 'Tidak ada kru yang cocok dengan pencarianmu.'}
        </p>
      ) : (
        <ul className="course-list">
          {filtered.map((r) => {
            const role = roles.get(r.id) ?? ''
            const roleLabel = ROLE_LABEL[role] ?? role
            const showPhoto = r.photo_url && !photoBroken.has(r.id)
            const availKey = normalizeAvailability(r.availability)
            return (
              <li key={r.id} className="course-card">
                <div style={{ padding: '1.1rem 1.25rem' }}>
                  {showPhoto ? (
                    <img
                      src={r.photo_url ?? ''}
                      alt={`Foto ${r.name ?? 'kru'}`}
                      className="avatar"
                      style={{ width: 64, height: 64 }}
                      onError={() => setPhotoBroken((prev) => new Set(prev).add(r.id))}
                    />
                  ) : (
                    <div className="avatar avatar-placeholder" style={{ width: 64, height: 64, fontSize: '1.5rem' }} aria-label={`Foto ${r.name ?? 'kru'} tidak tersedia`}>
                      {initials(r.name)}
                    </div>
                  )}
                  <h3>{r.name ?? 'Anggota'}</h3>
                  {roleLabel && <p className="muted">Peran: {roleLabel}</p>}
                  <p>{r.bio ?? ''}</p>
                  <p className="muted">
                    {r.city ?? ''}
                    {r.availability ? ` · Ketersediaan: ${AVAILABILITY_LABEL[availKey] ?? r.availability}` : ''}
                  </p>
                  {(r.skills ?? []).length > 0 && (
                    <p className="chip-row">{(r.skills ?? []).map((s) => <span key={s} className="chip">{s}</span>)}</p>
                  )}
                  {(r.interests ?? []).length > 0 && (
                    <p className="muted">Minat: {(r.interests ?? []).join(', ')}</p>
                  )}
                  <div className="form-actions" style={{ marginTop: '0.75rem' }}>
                    <Link className="btn btn-ghost btn-small" to={`/portofolio/${r.id}`}>Lihat Profil</Link>
                    {user && myProjects.length > 0 && inviteProjectId && (
                      <Link
                        className="btn btn-primary btn-small"
                        to={`/proyek/${inviteProjectId}?undang=${encodeURIComponent(r.name ?? '')}`}
                      >
                        Undang ke Proyek
                      </Link>
                    )}
                  </div>
                  {user && myProjects.length > 1 && (
                    <label className="muted" style={{ display: 'block', marginTop: '0.5rem' }}>
                      Undang ke proyek:{' '}
                      <select
                        value={inviteProjectId}
                        onChange={(e) => setInviteProjectId(e.target.value)}
                        aria-label="Pilih proyek untuk undangan"
                        style={{ fontFamily: 'inherit', padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
                      >
                        {myProjects.map((p) => (
                          <option key={p.id} value={p.id}>{p.title}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {user && myProjects.length === 0 && (
                    <p className="muted" style={{ marginTop: '0.5rem' }}>Buat proyek dulu untuk mengundang kru ini.</p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
