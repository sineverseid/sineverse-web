// SINEVERSE — Sekolah + Klub Film (004).
// Sekolah: daftar + gabung/keluar; roster (daftar anggota) hanya terlihat
// oleh anggota sekolah itu — RLS membatasi school_members, dan UI hanya
// memuat roster bila pengguna sudah menjadi anggota. Klub film: buat,
// gabung/keluar, aktivitas klub.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { fmtDate, isMissingTableError } from '../lib/guarded'
import { fetchProfileNames, supabase } from '../lib/supabase'
import type { ClubActivity, FilmClub, School } from '../lib/types'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

export default function SchoolsPage() {
  const { user, profile } = useAuth()
  const [schools, setSchools] = useState<School[] | null>(null)
  const [clubs, setClubs] = useState<FilmClub[] | null>(null)
  const [clubMembers, setClubMembers] = useState<Set<string>>(new Set())
  const [activities, setActivities] = useState<ClubActivity[]>([])
  const [mySchools, setMySchools] = useState<Set<string>>(new Set())
  const [roster, setRoster] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [clubName, setClubName] = useState('')
  const [clubDesc, setClubDesc] = useState('')
  const [clubSchool, setClubSchool] = useState('')
  const [actTitle, setActTitle] = useState('')
  const [actClub, setActClub] = useState('')
  const [actDate, setActDate] = useState('')

  async function load() {
    try {
      const { data: sData, error: sErr } = await supabase.from('schools').select('*').order('name')
      if (sErr) {
        if (isMissingTableError(sErr)) {
          setSchools(null)
          setClubs(null)
          return
        }
        throw sErr
      }
      setSchools((sData ?? []) as School[])
      const { data: cData } = await supabase.from('film_clubs').select('*').order('name')
      setClubs((cData ?? []) as FilmClub[])
      const { data: aData } = await supabase.from('club_activities').select('*').order('starts_at', { ascending: true })
      setActivities((aData ?? []) as ClubActivity[])
      if (user) {
        const { data: mem } = await supabase.from('school_members').select('school_id').eq('user_id', user.id)
        setMySchools(new Set(((mem ?? []) as { school_id: string }[]).map((m) => m.school_id)))
        const { data: cm } = await supabase.from('club_members').select('club_id').eq('user_id', user.id)
        setClubMembers(new Set(((cm ?? []) as { club_id: string }[]).map((m) => m.club_id)))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat sekolah & klub.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  async function toggleSchool(id: string, joined: boolean) {
    if (!user) return
    if (joined) {
      const { error } = await supabase.from('school_members').delete().eq('school_id', id).eq('user_id', user.id)
      if (error) setNotice(error.message)
      else setMySchools((m) => { const n = new Set(m); n.delete(id); return n })
    } else {
      const { error } = await supabase.from('school_members').insert({ school_id: id, user_id: user.id })
      if (error) setNotice(error.message)
      else setMySchools((m) => new Set(m).add(id))
    }
  }

  async function toggleClub(id: string, joined: boolean) {
    if (!user) return
    if (joined) {
      const { error } = await supabase.from('club_members').delete().eq('club_id', id).eq('user_id', user.id)
      if (error) setNotice(error.message)
      else setClubMembers((m) => { const n = new Set(m); n.delete(id); return n })
    } else {
      const { error } = await supabase.from('club_members').insert({ club_id: id, user_id: user.id })
      if (error) setNotice(error.message)
      else setClubMembers((m) => new Set(m).add(id))
    }
  }

  async function loadRoster(schoolId: string) {
    const { data } = await supabase.from('school_members').select('user_id').eq('school_id', schoolId)
    const ids = ((data ?? []) as { user_id: string }[]).map((m) => m.user_id)
    const names = await fetchProfileNames(ids)
    setRoster((r) => ({ ...r, [schoolId]: ids.map((id) => names.get(id) ?? 'Anggota') }))
  }

  async function handleCreateClub(e: FormEvent) {
    e.preventDefault()
    if (!user || !clubName.trim()) return
    const { error } = await supabase.from('film_clubs').insert({
      school_id: clubSchool || null,
      name: clubName.trim(),
      description: clubDesc.trim() || null,
      created_by: user.id,
    })
    if (error) setNotice(error.message)
    else {
      setNotice('Klub film dibuat.')
      setClubName('')
      setClubDesc('')
      await load()
    }
  }

  async function handleCreateActivity(e: FormEvent) {
    e.preventDefault()
    if (!user || !actClub || !actTitle.trim()) return
    const { error } = await supabase.from('club_activities').insert({
      club_id: actClub,
      title: actTitle.trim(),
      description: null,
      starts_at: actDate ? new Date(actDate).toISOString() : null,
      created_by: user.id,
    })
    if (error) setNotice(error.message)
    else {
      setNotice('Aktivitas klub dibuat.')
      setActTitle('')
      setActDate('')
      await load()
    }
  }

  if (loading) return <div className="page"><p className="muted">Memuat sekolah & klub…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (schools === null) return <div className="page"><h1>Sekolah & Klub Film</h1><MigrationNotice migration="004" /></div>

  const myClubs = (clubs ?? []).filter((c) => clubMembers.has(c.id) || c.created_by === user?.id)

  return (
    <div className="page">
      <PageHeader icon="school" title="Sekolah" />
      {notice && <p className="notice-box">{notice}</p>}

      <section className="section">
        <h2>Sekolah</h2>
        {schools.length === 0 ? (
          <EmptyState message="Belum ada sekolah terdaftar." />
        ) : (
          <ul className="course-list">
            {schools.map((s) => {
              const joined = mySchools.has(s.id)
              return (
                <li key={s.id} className="course-card">
                  <div style={{ padding: '1.1rem 1.25rem' }}>
                    <h3>{s.name}</h3>
                    <p>{s.city ?? ''}{s.description ? ` — ${s.description}` : ''}</p>
                    <p className="muted">{s.is_verified ? 'Terverifikasi oleh admin' : 'Belum terverifikasi'}</p>
                    {user && (
                      <button type="button" className="btn btn-secondary btn-small" onClick={() => void toggleSchool(s.id, joined)}>
                        {joined ? 'Keluar' : 'Gabung'}
                      </button>
                    )}
                    {joined && (
                      <p style={{ marginTop: '0.75rem' }}>
                        <button type="button" className="btn btn-ghost btn-small" onClick={() => void loadRoster(s.id)}>
                          Lihat Anggota
                        </button>
                      </p>
                    )}
                    {joined && roster[s.id] && (
                      <ul>
                        {roster[s.id].map((n, i) => (
                          <li key={i}>{n}</li>
                        ))}
                      </ul>
                    )}
                    {joined && !roster[s.id] && (
                      <p className="muted">Daftar anggota hanya terlihat oleh anggota sekolah ini.</p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Klub Film</h2>
        {(clubs ?? []).length === 0 ? (
          <EmptyState message="Belum ada klub film." />
        ) : (
          <ul className="discussion-list">
            {(clubs ?? []).map((c) => (
              <li key={c.id} className="discussion-item">
                <h3>{c.name}</h3>
                <p>{c.description ?? ''}</p>
                <p className="muted">
                  Aktivitas:{' '}
                  {activities.filter((a) => a.club_id === c.id).length === 0
                    ? 'belum ada'
                    : activities.filter((a) => a.club_id === c.id).map((a) => `${a.title} (${fmtDate(a.starts_at)})`).join(' · ')}
                </p>
                {user && (
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => void toggleClub(c.id, clubMembers.has(c.id))}>
                    {clubMembers.has(c.id) ? 'Keluar Klub' : 'Gabung Klub'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {user && (
        <>
          <section className="section">
            <h2>Buat Klub Film</h2>
            <form className="form" onSubmit={handleCreateClub}>
              <label>
                Nama klub
                <input value={clubName} onChange={(e) => setClubName(e.target.value)} required placeholder="Mis. Klub Film SMA 1" />
              </label>
              <label>
                Sekolah (opsional)
                <select value={clubSchool} onChange={(e) => setClubSchool(e.target.value)} style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}>
                  <option value="">— Tanpa sekolah tertentu —</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Deskripsi
                <textarea value={clubDesc} onChange={(e) => setClubDesc(e.target.value)} rows={2} />
              </label>
              <button type="submit" className="btn btn-primary">Buat Klub</button>
            </form>
          </section>
          {myClubs.length > 0 && (
            <section className="section">
              <h2>Tambah Aktivitas Klub</h2>
              <form className="form" onSubmit={handleCreateActivity}>
                <label>
                  Klub
                  <select value={actClub} onChange={(e) => setActClub(e.target.value)} required style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}>
                    <option value="">— Pilih klub —</option>
                    {myClubs.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Judul aktivitas
                  <input value={actTitle} onChange={(e) => setActTitle(e.target.value)} required placeholder="Mis. Screening & diskusi film pendek" />
                </label>
                <label>
                  Waktu mulai
                  <input type="datetime-local" value={actDate} onChange={(e) => setActDate(e.target.value)} />
                </label>
                <button type="submit" className="btn btn-primary">Tambah Aktivitas</button>
              </form>
              <p className="muted">Hanya pembuat klub / admin yang bisa menambah aktivitas (ditegakkan RLS).</p>
            </section>
          )}
        </>
      )}
      {profile?.role !== 'admin' && <p className="muted">Verifikasi sekolah dilakukan admin di Admin Panel.</p>}
    </div>
  )
}
