// SINEVERSE, Sekolah + Klub Film (004).
// Sekolah: daftar + gabung/keluar; roster (daftar anggota) hanya terlihat
// oleh anggota sekolah itu, RLS membatasi school_members, dan UI hanya
// memuat roster bila pengguna sudah menjadi anggota. Klub film: buat,
// gabung/keluar, aktivitas klub.
// Siswa & mentor hanya melihat sekolahnya sendiri (+ pencarian sekolah
// untuk mentor); hanya admin yang melihat direktori lengkap.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { fmtDate, isMissingTableError } from '../lib/guarded'
import { fetchProfileNames, fetchProvinces, fetchRegencies, searchSchools, supabase, updateProfile } from '../lib/supabase'
import type { ClubActivity, FilmClub, RefProvince, RefRegency, School } from '../lib/types'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

export default function SchoolsPage() {
  const { user, profile, refreshProfile } = useAuth()
  const [schools, setSchools] = useState<School[] | null>(null)
  const [clubs, setClubs] = useState<FilmClub[] | null>(null)
  const [clubMembers, setClubMembers] = useState<Set<string>>(new Set())
  const [activities, setActivities] = useState<ClubActivity[]>([])
  const [mySchools, setMySchools] = useState<Set<string>>(new Set())
  const [roster, setRoster] = useState<Record<string, string[]>>({})
  const [rosterLoading, setRosterLoading] = useState<Set<string>>(new Set())
  const [rosterError, setRosterError] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [clubName, setClubName] = useState('')
  const [clubDesc, setClubDesc] = useState('')
  const [clubSchool, setClubSchool] = useState('')
  const [actTitle, setActTitle] = useState('')
  const [actClub, setActClub] = useState('')
  const [actDate, setActDate] = useState('')
  // Pencarian sekolah (mentor saja): cari berdasarkan nama/NPSN dan
  // wilayah (provinsi → kabupaten/kota), bukan menjelajah direktori.
  // Hasil hanya muncul bila ada kata kunci atau wilayah dipilih.
  const [schoolQuery, setSchoolQuery] = useState('')
  const [searchResults, setSearchResults] = useState<School[] | null>(null)
  const [schoolSearching, setSchoolSearching] = useState(false)
  // Filter wilayah pencarian mentor: provinsi → kabupaten/kota (pola yang
  // sama seperti pendaftaran + filter direktori admin).
  const [provinces, setProvinces] = useState<RefProvince[]>([])
  const [regencies, setRegencies] = useState<RefRegency[]>([])
  const [searchProvince, setSearchProvince] = useState('')
  const [searchRegency, setSearchRegency] = useState('')
  // Tombol "Jadikan sekolah saya" yang sedang menyimpan (id sekolah).
  const [settingSchool, setSettingSchool] = useState<string | null>(null)

  // Siswa & mentor hanya melihat sekolahnya sendiri (+ klub film di
  // sekolah itu). Hanya admin yang melihat direktori lengkap.
  const isSiswa = profile?.role === 'siswa'
  const isMentor = profile?.role === 'mentor'
  const scopedToOwnSchool = isSiswa || isMentor
  const ownSchool: School | null = scopedToOwnSchool && schools ? schools[0] ?? null : null

  async function load() {
    try {
      if (scopedToOwnSchool) {
        // Cabang siswa/mentor: satu sekolah (dari profile.school_id) +
        // klub film di sekolah itu saja — bukan 1.000 baris direktori.
        // Bila school_id belum terisi, coba cocokkan nama sekolah /
        // afiliasi bebas di profil dengan baris schools (mis. mentor
        // yang mendaftar sebelum school_id disimpan).
        let own: School | null = null
        if (profile?.school_id) {
          const { data: sData, error: sErr } = await supabase.from('schools').select('*').eq('id', profile.school_id).maybeSingle()
          if (sErr) {
            if (isMissingTableError(sErr)) {
              setSchools(null)
              setClubs(null)
              return
            }
            throw sErr
          }
          own = (sData ?? null) as School | null
        }
        if (!own && profile?.school?.trim()) {
          const { data: byName } = await supabase.from('schools').select('*').ilike('name', profile.school.trim()).limit(1)
          own = ((byName ?? [])[0] ?? null) as School | null
        }
        setSchools(own ? [own] : [])
        const { data: cData, error: cErr } = own
          ? await supabase.from('film_clubs').select('*').eq('school_id', own.id).order('name')
          : await supabase.from('film_clubs').select('*').is('school_id', null).order('name')
        if (cErr) throw cErr
        const shownClubs = (cData ?? []) as FilmClub[]
        setClubs(shownClubs)
        const clubIds = shownClubs.map((c) => c.id)
        const [aRes, memRes, cmRes] = await Promise.all([
          clubIds.length > 0
            ? supabase.from('club_activities').select('*').in('club_id', clubIds).order('starts_at', { ascending: true })
            : Promise.resolve({ data: [] as ClubActivity[] }),
          user
            ? supabase.from('school_members').select('school_id').eq('user_id', user.id)
            : Promise.resolve({ data: null as { school_id: string }[] | null }),
          user
            ? supabase.from('club_members').select('club_id').eq('user_id', user.id)
            : Promise.resolve({ data: null as { club_id: string }[] | null }),
        ])
        setActivities((aRes.data ?? []) as ClubActivity[])
        if (user) {
          setMySchools(new Set(((memRes.data ?? []) as { school_id: string }[]).map((m) => m.school_id)))
          setClubMembers(new Set(((cmRes.data ?? []) as { club_id: string }[]).map((m) => m.club_id)))
        }
        return
      }
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
      // Klub, aktivitas, dan kedua keanggotaan saya independen: paralel.
      const [cRes, aRes, memRes, cmRes] = await Promise.all([
        supabase.from('film_clubs').select('*').order('name'),
        supabase.from('club_activities').select('*').order('starts_at', { ascending: true }),
        user
          ? supabase.from('school_members').select('school_id').eq('user_id', user.id)
          : Promise.resolve({ data: null as { school_id: string }[] | null }),
        user
          ? supabase.from('club_members').select('club_id').eq('user_id', user.id)
          : Promise.resolve({ data: null as { club_id: string }[] | null }),
      ])
      setClubs((cRes.data ?? []) as FilmClub[])
      setActivities((aRes.data ?? []) as ClubActivity[])
      if (user) {
        setMySchools(new Set(((memRes.data ?? []) as { school_id: string }[]).map((m) => m.school_id)))
        setClubMembers(new Set(((cmRes.data ?? []) as { club_id: string }[]).map((m) => m.club_id)))
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
  }, [user?.id, profile?.role, profile?.school_id])

  // Provinsi untuk filter pencarian mentor.
  useEffect(() => {
    if (!isMentor) return
    void fetchProvinces().then(setProvinces).catch(() => setProvinces([]))
  }, [isMentor])

  // Kabupaten/kota mengikuti provinsi yang dipilih.
  useEffect(() => {
    if (!isMentor || !searchProvince) {
      setRegencies([])
      return
    }
    void fetchRegencies(searchProvince).then(setRegencies).catch(() => setRegencies([]))
  }, [isMentor, searchProvince])

  // Nama kabupaten/kota yang dipilih (schools.regency menyimpan nama
  // referensi, bukan kode) — ini yang diteruskan ke searchSchools.
  const regencyName = regencies.find((r) => r.code === searchRegency)?.name ?? ''

  // Pencarian sekolah mentor: berjalan bila ada kata kunci (≥2 karakter)
  // ATAU bila kabupaten/kota dipilih; tanpa keduanya tidak ada hasil —
  // direktori tidak pernah dimuat utuh di akun mentor. Semua filter
  // digabung (AND): kata kunci + kabupaten/kota.
  useEffect(() => {
    if (!isMentor) return
    const q = schoolQuery.trim()
    if (q.length < 2 && !regencyName) {
      setSearchResults(null)
      setSchoolSearching(false)
      return
    }
    setSchoolSearching(true)
    const t = window.setTimeout(() => {
      void searchSchools(q, regencyName || undefined)
        .then((rows) => setSearchResults(rows.filter((r) => r.id !== ownSchool?.id)))
        .catch(() => setSearchResults([]))
        .finally(() => setSchoolSearching(false))
    }, 300)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolQuery, isMentor, ownSchool?.id, regencyName])

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

  // Jadikan sekolah hasil pencarian sebagai sekolah mentor: mengisi
  // profiles.school_id + school lewat jalur update profil yang sama
  // seperti Edit Profile (RLS berlaku, tanpa SQL mentah), lalu muat ulang
  // profil sehingga bagian "Sekolahmu" langsung menampilkan sekolah itu
  // (load() berjalan ulang karena profile.school_id berubah).
  async function handleSetMySchool(s: School) {
    if (!user || settingSchool) return
    setSettingSchool(s.id)
    try {
      await updateProfile(user.id, { school_id: s.id, school: s.name })
      await refreshProfile()
      setNotice(`Sekolahmu diatur ke ${s.name}.`)
    } catch {
      setNotice('Gagal mengatur sekolahmu. Coba lagi.')
    } finally {
      setSettingSchool(null)
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
    setRosterLoading((prev) => new Set(prev).add(schoolId))
    setRosterError((prev) => {
      const next = new Set(prev)
      next.delete(schoolId)
      return next
    })
    try {
      const { data, error: qErr } = await supabase.from('school_members').select('user_id').eq('school_id', schoolId)
      if (qErr) throw qErr
      const ids = ((data ?? []) as { user_id: string }[]).map((m) => m.user_id)
      const names = await fetchProfileNames(ids)
      setRoster((r) => ({ ...r, [schoolId]: ids.map((id) => names.get(id) ?? 'Anggota') }))
    } catch {
      setRosterError((prev) => new Set(prev).add(schoolId))
    } finally {
      setRosterLoading((prev) => {
        const next = new Set(prev)
        next.delete(schoolId)
        return next
      })
    }
  }

  async function handleCreateClub(e: FormEvent) {
    e.preventDefault()
    if (!user || !clubName.trim()) return
    const { error } = await supabase.from('film_clubs').insert({
      // Siswa/mentor membuat klub di sekolahnya sendiri (tanpa pilih
      // sekolah); admin tetap memilih lewat select di form.
      school_id: scopedToOwnSchool ? (ownSchool?.id ?? null) : (clubSchool || null),
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

  const isAdmin = profile?.role === 'admin'
  // Tambah aktivitas hanya untuk pembuat klub atau admin.
  const activityClubs = (clubs ?? []).filter((c) => isAdmin || c.created_by === user?.id)

  return (
    <div className="page">
      <PageHeader icon="school" title="Sekolah" />
      {notice && <p className="notice-box">{notice}</p>}

      <section className="section">
        <h2>{scopedToOwnSchool ? 'Sekolahmu' : 'Sekolah'}</h2>
        {scopedToOwnSchool && schools.length === 0 ? (
          profile?.school ? (
            <ul className="course-list">
              <li className="course-card">
                <div style={{ padding: '1.1rem 1.25rem' }}>
                  <h3>{profile.school}</h3>
                  <p className="muted">Sekolahmu belum terdaftar di data referensi.</p>
                  <p className="muted">Minta admin memverifikasi pengajuan sekolahmu, atau perbarui sekolah di profil.</p>
                  <p><Link to="/profil/edit" className="btn btn-secondary btn-small">Perbarui Sekolah di Profil →</Link></p>
                </div>
              </li>
            </ul>
          ) : (
            <div>
              <p className="empty">{profile?.school_id ? 'Sekolahmu tidak ditemukan di data referensi.' : 'Kamu belum mengatur sekolahmu.'}</p>
              <p><Link to="/profil/edit" className="btn btn-secondary btn-small">Atur Sekolah di Profil →</Link></p>
            </div>
          )
        ) : schools.length === 0 ? (
          <EmptyState message="Belum ada sekolah terdaftar." />
        ) : (
          <ul className="course-list">
            {schools.map((s) => {
              const joined = mySchools.has(s.id)
              const wilayah = [s.city && s.city !== s.regency ? s.city : null, s.regency, s.province].filter(Boolean).join(', ')
              return (
                <li key={s.id} className="course-card">
                  <div style={{ padding: '1.1rem 1.25rem' }}>
                    <h3>{s.name}</h3>
                    {scopedToOwnSchool ? (
                      <>
                        <p className="muted">NPSN {s.npsn ?? '—'} · {s.is_verified ? 'Terverifikasi oleh admin' : 'Belum terverifikasi'}</p>
                        {s.address?.trim() ? <p>{s.address}</p> : <p className="muted">Alamat belum tersedia</p>}
                        {wilayah && <p className="muted">{wilayah}</p>}
                        {s.description && <p>{s.description}</p>}
                        {!s.is_verified && (
                          <p className="muted">Sekolah ini belum terverifikasi oleh admin.</p>
                        )}
                      </>
                    ) : (
                      <>
                        {s.city && <p>{s.city}</p>}
                        {s.description && <p>{s.description}</p>}
                        <p className="muted">{s.is_verified ? 'Terverifikasi oleh admin' : 'Belum terverifikasi'}</p>
                        {!s.is_verified && (
                          <p className="muted">Sekolah ini belum terverifikasi oleh admin.</p>
                        )}
                      </>
                    )}
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
                    {joined && rosterError.has(s.id) && (
                      <p className="error-box">Daftar anggota gagal dimuat.</p>
                    )}
                    {joined && rosterLoading.has(s.id) && (
                      <p className="muted">Memuat anggota…</p>
                    )}
                    {joined && roster[s.id] && (
                      <>
                        {scopedToOwnSchool && <p className="muted">{roster[s.id].length} anggota</p>}
                        <ul>
                          {roster[s.id].map((n, i) => (
                            <li key={i}>{n}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {joined && !roster[s.id] && !rosterLoading.has(s.id) && !rosterError.has(s.id) && (
                      <p className="muted">Lihat daftar anggota.</p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {isMentor && (
        <section className="section">
          <h2>Cari Sekolah Lain</h2>
          <div className="filter-bar">
            <select
              value={searchProvince}
              onChange={(e) => { setSearchProvince(e.target.value); setSearchRegency('') }}
              aria-label="Filter provinsi"
            >
              <option value="">Semua Provinsi</option>
              {provinces.map((p) => (
                <option key={p.code} value={p.code}>{p.name}</option>
              ))}
            </select>
            <select
              value={searchRegency}
              onChange={(e) => setSearchRegency(e.target.value)}
              disabled={!searchProvince}
              aria-label="Filter kabupaten atau kota"
            >
              <option value="">{searchProvince ? 'Semua Kab/Kota' : 'Pilih provinsi dulu'}</option>
              {regencies.map((r) => (
                <option key={r.code} value={r.code}>{r.name}</option>
              ))}
            </select>
            <input
              className="search-input"
              value={schoolQuery}
              onChange={(e) => setSchoolQuery(e.target.value)}
              placeholder="Cari nama atau NPSN sekolah…"
              aria-label="Cari sekolah berdasarkan nama atau NPSN"
            />
          </div>
          {schoolSearching && <p className="muted">Mencari sekolah…</p>}
          {!schoolSearching && (schoolQuery.trim().length >= 2 || regencyName) && (searchResults ?? []).length === 0 && (
            <p className="empty">Tidak ada sekolah terverifikasi yang cocok dengan filter.</p>
          )}
          {(searchResults ?? []).length > 0 && (
            <ul className="course-list">
              {searchResults!.map((s) => {
                const joined = mySchools.has(s.id)
                const wilayah = [s.city && s.city !== s.regency ? s.city : null, s.regency, s.province].filter(Boolean).join(', ')
                return (
                  <li key={s.id} className="course-card">
                    <div style={{ padding: '1.1rem 1.25rem' }}>
                      <h3>{s.name}</h3>
                      <p className="muted">NPSN {s.npsn ?? '—'} · {s.is_verified ? 'Terverifikasi oleh admin' : 'Belum terverifikasi'}</p>
                      {wilayah && <p className="muted">{wilayah}</p>}
                      {user && (
                        <>
                          <button type="button" className="btn btn-secondary btn-small" onClick={() => void toggleSchool(s.id, joined)}>
                            {joined ? 'Keluar' : 'Gabung'}
                          </button>{' '}
                          <button
                            type="button"
                            className="btn btn-primary btn-small"
                            disabled={settingSchool === s.id}
                            onClick={() => void handleSetMySchool(s)}
                          >
                            {settingSchool === s.id ? 'Mengatur…' : 'Jadikan sekolah saya'}
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      <section className="section">
        <h2>{scopedToOwnSchool ? 'Klub Film di Sekolahmu' : 'Klub Film'}</h2>
        {(clubs ?? []).length === 0 ? (
          <EmptyState message={scopedToOwnSchool ? 'Belum ada klub film di sekolahmu.' : 'Belum ada klub film.'} />
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
                    : activities.filter((a) => a.club_id === c.id).map((a) => (a.starts_at ? `${a.title} (${fmtDate(a.starts_at)})` : a.title)).join(' · ')}
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
              {scopedToOwnSchool ? (
                <p className="muted">Sekolah: {ownSchool?.name ?? profile?.school ?? '—'}</p>
              ) : (
                <label>
                  Sekolah (opsional)
                  <select value={clubSchool} onChange={(e) => setClubSchool(e.target.value)} style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}>
                    <option value="">— Tanpa sekolah tertentu —</option>
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Deskripsi
                <textarea value={clubDesc} onChange={(e) => setClubDesc(e.target.value)} rows={2} />
              </label>
              <button type="submit" className="btn btn-primary">Buat Klub</button>
            </form>
          </section>
          {activityClubs.length > 0 ? (
            <section className="section">
              <h2>Tambah Aktivitas Klub</h2>
              <form className="form" onSubmit={handleCreateActivity}>
                <label>
                  Klub
                  <select value={actClub} onChange={(e) => setActClub(e.target.value)} required style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}>
                    <option value="">— Pilih klub —</option>
                    {activityClubs.map((c) => (
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
          ) : (
            <p className="muted">Hanya pembuat klub / admin yang bisa menambah aktivitas.</p>
          )}
        </>
      )}
      {profile?.role !== 'admin' && <p className="muted">Verifikasi sekolah dilakukan admin di Admin Panel.</p>}
    </div>
  )
}
