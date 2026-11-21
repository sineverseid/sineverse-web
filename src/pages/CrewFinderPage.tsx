// SINEVERSE — Crew Finder: cari kru berdasarkan nama / peran / skill /
// minat / ketersediaan. Hanya field aman-publik yang ditampilkan —
// TIDAK PERNAH email (aturan 005). Hanya profil yang membuka diri
// (is_open_to_crew) yang muncul.
import { useEffect, useState } from 'react'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { isMissingTableError } from '../lib/guarded'
import { fetchCrewProfiles } from '../lib/supabase'

type CrewRow = Awaited<ReturnType<typeof fetchCrewProfiles>>[number]

export default function CrewFinderPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState<CrewRow[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [skill, setSkill] = useState('')
  const [availability, setAvailability] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await fetchCrewProfiles()
        if (!cancelled) setRows(data)
      } catch (err) {
        if (!cancelled) {
          if (isMissingTableError(err)) setMissing(true)
          else setError(err instanceof Error ? err.message : 'Gagal memuat Crew Finder.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <div className="page"><p className="muted">Memuat Crew Finder…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (missing) return <div className="page"><h1>Crew Finder</h1><MigrationNotice migration="005" /></div>

  const needle = q.trim().toLowerCase()
  const filtered = (rows ?? []).filter((r) => {
    if (r.id === user?.id) return false
    if (needle) {
      const hay = `${r.name ?? ''} ${(r.skills ?? []).join(' ')} ${(r.interests ?? []).join(' ')} ${r.city ?? ''} ${r.bio ?? ''}`.toLowerCase()
      if (!hay.includes(needle)) return false
    }
    if (skill && !(r.skills ?? []).some((s) => s.toLowerCase().includes(skill.toLowerCase()))) return false
    if (availability && (r.availability ?? '') !== availability) return false
    return true
  })
  const allSkills = [...new Set((rows ?? []).flatMap((r) => r.skills ?? []))].sort()

  return (
    <div className="page">
      <h1>Crew Finder</h1>
      <p className="muted">
        Temukan kru untuk proyek filmmu. Hanya anggota yang membuka diri untuk kru yang tampil di sini,
        dan hanya info publik yang ditampilkan — alamat email tidak pernah ditampilkan.
      </p>
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
      {filtered.length === 0 ? (
        <p className="empty">Tidak ada kru yang cocok dengan pencarianmu.</p>
      ) : (
        <ul className="course-list">
          {filtered.map((r) => (
            <li key={r.id} className="course-card">
              <div style={{ padding: '1.1rem 1.25rem' }}>
                {r.photo_url && <img src={r.photo_url} alt={`Foto ${r.name ?? 'kru'}`} className="avatar" style={{ width: 64, height: 64 }} />}
                <h3>{r.name ?? 'Anggota'}</h3>
                <p>{r.bio ?? ''}</p>
                <p className="muted">
                  {r.city ?? ''}
                  {r.availability ? ` · Ketersediaan: ${r.availability}` : ''}
                </p>
                {(r.skills ?? []).length > 0 && (
                  <p className="chip-row">{(r.skills ?? []).map((s) => <span key={s} className="chip">{s}</span>)}</p>
                )}
                {(r.interests ?? []).length > 0 && (
                  <p className="muted">Minat: {(r.interests ?? []).join(', ')}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
