// SINEVERSE — Acara (007): daftar + detail + sesi/rundown + pendaftaran
// berkapasitas (ditolak bila penuh). Acara eksternal: hanya penyelenggara
// + tautan resmi, tanpa pendaftaran di aplikasi.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { fmtDate, isMissingTableError } from '../lib/guarded'
import { supabase } from '../lib/supabase'
import type { EventRegistration, EventSession, SineEvent } from '../lib/types'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { CompetitionsPage } from './CompetitionsPage'
import { CertificatesPage } from './CertificatesPage'

export function EventsPage() {
  const { user, profile } = useAuth()
  const [events, setEvents] = useState<SineEvent[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [location, setLocation] = useState('')
  const [capacity, setCapacity] = useState('')
  const [tab, setTab] = useState<'kalender' | 'kompetisi' | 'sertifikat' | 'analitik'>('kalender')

  const canCreate = profile?.role === 'mentor' || profile?.role === 'admin'
  const isStaff = canCreate

  async function load() {
    try {
      const { data, error: qErr } = await supabase.from('events').select('*').order('starts_at', { ascending: true })
      if (qErr) {
        if (isMissingTableError(qErr)) {
          setEvents(null)
          return
        }
        throw qErr
      }
      setEvents((data ?? []) as SineEvent[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat acara.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (cancelled) return
      await load()
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!user || !title.trim()) return
    const { error: insErr } = await supabase.from('events').insert({
      title: title.trim(),
      description: description.trim() || null,
      kind: 'internal',
      starts_at: startsAt ? new Date(startsAt).toISOString() : null,
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      location: location.trim() || null,
      capacity: capacity ? Number(capacity) : null,
      created_by: user.id,
    })
    if (insErr) {
      setNotice(insErr.message)
      return
    }
    setNotice('Acara dibuat. Tambahkan sesi/rundown dari halaman detail acara.')
    setTitle('')
    setDescription('')
    setStartsAt('')
    setEndsAt('')
    setLocation('')
    setCapacity('')
    await load()
  }

  return (
    <div className="page">
      <PageHeader
        icon="event"
        title="Events"
        subtitle="Workshop, screening, webinar, dan festival film pelajar."
      />
      <div className="about-tabs" role="tablist" aria-label="Tab Events">
        <button type="button" role="tab" aria-selected={tab === 'kalender'} className={`about-tab${tab === 'kalender' ? ' active' : ''}`} onClick={() => setTab('kalender')}>Kalender Acara</button>
        <button type="button" role="tab" aria-selected={tab === 'kompetisi'} className={`about-tab${tab === 'kompetisi' ? ' active' : ''}`} onClick={() => setTab('kompetisi')}>Kompetisi &amp; Festival</button>
        <button type="button" role="tab" aria-selected={tab === 'sertifikat'} className={`about-tab${tab === 'sertifikat' ? ' active' : ''}`} onClick={() => setTab('sertifikat')}>Sertifikat Saya</button>
        {isStaff && (
          <button type="button" role="tab" aria-selected={tab === 'analitik'} className={`about-tab${tab === 'analitik' ? ' active' : ''}`} onClick={() => setTab('analitik')}>Analitik</button>
        )}
      </div>
      {tab === 'kalender' && (
        <>
          {loading ? (
            <p className="muted">Memuat acara…</p>
          ) : error ? (
            <p className="error-box">{error}</p>
          ) : events === null ? (
            <>
              <h1>Acara</h1>
              <MigrationNotice migration="007" />
            </>
          ) : (
            <>
      {notice && <p className="notice-box">{notice}</p>}
      {canCreate && (
        <section className="section">
          <h2>Buat Acara</h2>
          <p className="muted">Mentor dan admin dapat membuat acara internal (workshop, screening, webinar, festival).</p>
          <form className="form" onSubmit={handleCreate}>
            <label>
              Judul acara
              <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Mis. Workshop Sinematografi Dasar" />
            </label>
            <label>
              Deskripsi
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </label>
            <label>
              Mulai
              <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </label>
            <label>
              Selesai
              <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </label>
            <label>
              Lokasi
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Kota / daring" />
            </label>
            <label>
              Kapasitas peserta (kosong = tanpa batas)
              <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Mis. 50" />
            </label>
            <button type="submit" className="btn btn-primary">Buat Acara</button>
          </form>
        </section>
      )}
      {events.length === 0 ? (
        <EmptyState message="Belum ada acara." />
      ) : (
        <ul className="course-list">
          {events.map((e) => (
            <li key={e.id} className="course-card">
              <Link to={`/acara/${e.id}`}>
                <h3>{e.title}</h3>
                <p>{e.description ?? ''}</p>
                <p className="muted">
                  {e.kind === 'external' ? 'Eksternal' : 'Internal'}
                  {e.starts_at ? ` · ${fmtDate(e.starts_at)}` : ''}
                  {e.location ? ` · ${e.location}` : ''}
                  {e.capacity !== null ? ` · Kapasitas: ${e.capacity}` : ''}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
            </>
          )}
        </>
      )}
      {tab === 'kompetisi' && <CompetitionsPage />}
      {tab === 'sertifikat' && <CertificatesPage />}
      {tab === 'analitik' && isStaff && <EventsAnalytics />}
    </div>
  )
}

// Analitik Events (tab ke-4, mentor/admin saja): angka nyata dari Supabase —
// jumlah acara, pendaftaran, kompetisi per status, karya masuk, pemenang.
function EventsAnalytics() {
  const [stats, setStats] = useState<{
    events: number
    internal: number
    external: number
    registrations: number
    competitions: number
    compOpen: number
    compJudging: number
    compDone: number
    submissions: number
    winners: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [ev, reg, comp, sub, win] = await Promise.all([
          supabase.from('events').select('kind'),
          supabase.from('event_registrations').select('id', { count: 'exact', head: true }),
          supabase.from('competitions').select('status'),
          supabase.from('competition_submissions').select('id', { count: 'exact', head: true }),
          supabase.from('competition_winners').select('id', { count: 'exact', head: true }),
        ])
        if (cancelled) return
        const evRows = (ev.data ?? []) as { kind: string }[]
        const compRows = (comp.data ?? []) as { status: string }[]
        setStats({
          events: evRows.length,
          internal: evRows.filter((e) => e.kind === 'internal').length,
          external: evRows.filter((e) => e.kind === 'external').length,
          registrations: reg.count ?? 0,
          competitions: compRows.length,
          compOpen: compRows.filter((c) => c.status === 'dibuka').length,
          compJudging: compRows.filter((c) => c.status === 'penjurian').length,
          compDone: compRows.filter((c) => c.status === 'selesai').length,
          submissions: sub.count ?? 0,
          winners: win.count ?? 0,
        })
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat analitik.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <p className="muted">Memuat analitik…</p>
  if (error) return <p className="error-box">{error}</p>
  if (!stats) return <p className="empty">Tidak ada data analitik.</p>

  return (
    <div>
      <section className="section">
        <h2>Acara</h2>
        <dl className="profile-list">
          <div><dt>Total acara</dt><dd>{stats.events}</dd></div>
          <div><dt>Internal</dt><dd>{stats.internal}</dd></div>
          <div><dt>Eksternal</dt><dd>{stats.external}</dd></div>
          <div><dt>Total pendaftaran</dt><dd>{stats.registrations}</dd></div>
        </dl>
      </section>
      <section className="section">
        <h2>Kompetisi &amp; Festival</h2>
        <dl className="profile-list">
          <div><dt>Total kompetisi</dt><dd>{stats.competitions}</dd></div>
          <div><dt>Dibuka</dt><dd>{stats.compOpen}</dd></div>
          <div><dt>Penjurian</dt><dd>{stats.compJudging}</dd></div>
          <div><dt>Selesai</dt><dd>{stats.compDone}</dd></div>
          <div><dt>Karya masuk</dt><dd>{stats.submissions}</dd></div>
          <div><dt>Pemenang</dt><dd>{stats.winners}</dd></div>
        </dl>
      </section>
    </div>
  )
}

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [event, setEvent] = useState<SineEvent | null>(null)
  const [missing, setMissing] = useState(false)
  const [sessions, setSessions] = useState<EventSession[]>([])
  const [registered, setRegistered] = useState(false)
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    const eventId = id
    let cancelled = false
    async function load() {
      try {
        const { data, error: qErr } = await supabase.from('events').select('*').eq('id', eventId).maybeSingle()
        if (qErr) {
          if (isMissingTableError(qErr)) {
            setMissing(true)
            return
          }
          throw qErr
        }
        if (cancelled) return
        setEvent(data as SineEvent | null)
        const { data: sData } = await supabase.from('event_sessions').select('*').eq('event_id', eventId).order('order_index')
        if (!cancelled) setSessions((sData ?? []) as EventSession[])
        const { data: regs, count: total } = await supabase
          .from('event_registrations')
          .select('id,user_id', { count: 'exact' })
          .eq('event_id', eventId)
        if (!cancelled) {
          setCount(total ?? (regs ?? []).length)
          if (user) setRegistered(((regs ?? []) as EventRegistration[]).some((r) => r.user_id === user.id))
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat acara.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id, user])

  if (loading) return <div className="page"><p className="muted">Memuat acara…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (missing) return <div className="page"><h1>Acara</h1><MigrationNotice migration="007" /></div>
  if (!event) return <div className="page"><p className="empty">Acara tidak ditemukan.</p><Link to="/acara">Kembali</Link></div>

  const currentEvent = event
  const full = currentEvent.capacity !== null && count >= currentEvent.capacity

  async function handleRegister(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    if (full) {
      setNotice('Pendaftaran ditolak: kapasitas acara sudah penuh.')
      return
    }
    const { error: insErr } = await supabase.from('event_registrations').insert({
      event_id: currentEvent.id,
      user_id: user.id,
      attended: false,
    })
    if (insErr) setNotice(insErr.message)
    else {
      setRegistered(true)
      setCount((c) => c + 1)
      setNotice('Kamu terdaftar di acara ini.')
    }
  }

  async function handleCancel() {
    if (!user) return
    const { error: delErr } = await supabase.from('event_registrations').delete().eq('event_id', currentEvent.id).eq('user_id', user.id)
    if (delErr) setNotice(delErr.message)
    else {
      setRegistered(false)
      setCount((c) => Math.max(0, c - 1))
      setNotice('Pendaftaran dibatalkan.')
    }
  }

  return (
    <div className="page">
      <Link to="/acara" className="back-link">← Semua Acara</Link>
      <h1>{currentEvent.title}</h1>
      <p className="muted">
        {currentEvent.kind === 'external' ? 'Acara eksternal / nasional' : 'Acara internal SINEVERSE'}
        {currentEvent.starts_at ? ` · ${fmtDate(currentEvent.starts_at)}` : ''}
        {currentEvent.ends_at ? ` s.d. ${fmtDate(currentEvent.ends_at)}` : ''}
        {currentEvent.location ? ` · ${currentEvent.location}` : ''}
      </p>
      <p>{currentEvent.description ?? ''}</p>
      {notice && <p className="notice-box">{notice}</p>}

      {currentEvent.kind === 'external' && (
        <p className="notice-box">
          Acara ini diselenggarakan oleh {currentEvent.organizer ?? 'penyelenggara eksternal'}.
          Pendaftaran hanya dilakukan di situs penyelenggara — SINEVERSE tidak membuka pendaftaran di aplikasi.
          {currentEvent.official_link && (
            <>
              {' '}
              <a href={currentEvent.official_link} target="_blank" rel="noreferrer">Buka situs resmi penyelenggara</a>
            </>
          )}
        </p>
      )}

      <section className="section">
        <h2>Rundown / Sesi</h2>
        {sessions.length === 0 ? (
          <p className="empty">Belum ada sesi yang dijadwalkan untuk acara ini.</p>
        ) : (
          <ol className="week-list">
            {sessions.map((s) => (
              <li key={s.id}>
                <strong>{s.title}</strong>
                {s.starts_at ? ` — ${fmtDate(s.starts_at)}` : ''}
                {s.description ? <p className="muted">{s.description}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      {currentEvent.kind === 'internal' && (
        <section className="section">
          <h2>Pendaftaran</h2>
          <p className="muted">
            Terdaftar: {count}{currentEvent.capacity !== null ? ` / ${currentEvent.capacity}` : ' (tanpa batas kapasitas)'}
            {full ? ' — Kapasitas penuh.' : ''}
          </p>
          {user ? (
            registered ? (
              <>
                <p className="notice-box">Kamu sudah terdaftar di acara ini.</p>
                <button type="button" className="btn btn-ghost" onClick={handleCancel}>Batalkan Pendaftaran</button>
              </>
            ) : (
              <form onSubmit={handleRegister}>
                <button type="submit" className="btn btn-primary" disabled={full}>
                  {full ? 'Kapasitas Penuh' : 'Daftar Acara'}
                </button>
              </form>
            )
          ) : (
            <p className="muted"><Link to="/login">Masuk</Link> untuk mendaftar acara.</p>
          )}
        </section>
      )}
    </div>
  )
}
