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

export function EventsPage() {
  const [events, setEvents] = useState<SineEvent[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data, error: qErr } = await supabase.from('events').select('*').order('starts_at', { ascending: true })
        if (qErr) {
          if (isMissingTableError(qErr)) {
            if (!cancelled) setEvents(null)
            return
          }
          throw qErr
        }
        if (!cancelled) setEvents((data ?? []) as SineEvent[])
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
  }, [])

  if (loading) return <div className="page"><p className="muted">Memuat acara…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (events === null) return <div className="page"><h1>Acara</h1><MigrationNotice migration="007" /></div>

  return (
    <div className="page">
      <h1>Acara</h1>
      {events.length === 0 ? (
        <p className="empty">Belum ada acara.</p>
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
