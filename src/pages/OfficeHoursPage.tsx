// SINEVERSE — Office hours (008): mentor membuat sesi konsultasi dengan
// kapasitas; siswa memesan / membatalkan. Pendaftaran ditolak bila
// kapasitas sudah penuh.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { fmtDate, isMissingTableError } from '../lib/guarded'
import { fetchProfileNames, supabase } from '../lib/supabase'
import type { OfficeHour, OfficeHourBooking } from '../lib/types'
import WorkspaceNav from '../components/WorkspaceNav'
import { MENTOR_NAV } from '../lib/workspaceNav'

export default function OfficeHoursPage() {
  const { user, profile } = useAuth()
  const [hours, setHours] = useState<OfficeHour[] | null>(null)
  const [bookings, setBookings] = useState<OfficeHourBooking[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [starts, setStarts] = useState('')
  const [ends, setEnds] = useState('')
  const [capacity, setCapacity] = useState('')

  const isMentor = profile?.role === 'mentor' || profile?.role === 'admin'

  async function load() {
    try {
      // office_hours dan bookings independen — dimuat paralel.
      const [{ data, error: qErr }, { data: bData }] = await Promise.all([
        supabase.from('office_hours').select('*').order('starts_at', { ascending: true }),
        supabase.from('office_hour_bookings').select('*').eq('status', 'booked'),
      ])
      if (qErr) {
        if (isMissingTableError(qErr)) setHours(null)
        else throw qErr
        return
      }
      setHours((data ?? []) as OfficeHour[])
      const bRows = (bData ?? []) as OfficeHourBooking[]
      setBookings(bRows)
      setNames(await fetchProfileNames([...new Set(bRows.map((b) => b.user_id))]))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat office hours.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return <div className="page"><p className="muted">Memuat office hours…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (hours === null) return <div className="page"><h1>Office Hours</h1><MigrationNotice migration="008" /></div>

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!user || !title.trim() || !starts || !ends) return
    const { error: insErr } = await supabase.from('office_hours').insert({
      mentor_id: user.id,
      title: title.trim(),
      starts_at: new Date(starts).toISOString(),
      ends_at: new Date(ends).toISOString(),
      capacity: capacity ? Number(capacity) : null,
    })
    if (insErr) setNotice(insErr.message)
    else {
      setNotice('Office hour dibuat.')
      setTitle('')
      setStarts('')
      setEnds('')
      setCapacity('')
      await load()
    }
  }

  async function handleBook(oh: OfficeHour) {
    if (!user) return
    const booked = bookings.filter((b) => b.office_hour_id === oh.id).length
    if (oh.capacity !== null && booked >= oh.capacity) {
      setNotice('Pendaftaran ditolak: kapasitas office hour ini sudah penuh.')
      return
    }
    const { error: insErr } = await supabase.from('office_hour_bookings').insert({
      office_hour_id: oh.id,
      user_id: user.id,
      status: 'booked',
    })
    if (insErr) setNotice(insErr.message)
    else {
      setNotice('Kamu terdaftar di office hour ini.')
      await load()
    }
  }

  async function handleCancel(oh: OfficeHour) {
    if (!user) return
    const { error: updErr } = await supabase
      .from('office_hour_bookings')
      .update({ status: 'cancelled' })
      .eq('office_hour_id', oh.id)
      .eq('user_id', user.id)
      .eq('status', 'booked')
    if (updErr) setNotice(updErr.message)
    else {
      setNotice('Booking dibatalkan.')
      await load()
    }
  }

  return (
    <div className="page">
      <h1>Office Hours</h1>
      <WorkspaceNav entries={MENTOR_NAV} />
      {notice && <p className="notice-box">{notice}</p>}
      {hours.length === 0 ? (
        <p className="empty">Belum ada office hour yang dijadwalkan.</p>
      ) : (
        <ul className="discussion-list">
          {hours.map((oh) => {
            const booked = bookings.filter((b) => b.office_hour_id === oh.id)
            const mine = booked.some((b) => b.user_id === user?.id)
            const full = oh.capacity !== null && booked.length >= oh.capacity
            return (
              <li key={oh.id} className="discussion-item">
                <h3>{oh.title}</h3>
                <p className="muted">
                  {fmtDate(oh.starts_at)} s.d. {fmtDate(oh.ends_at)}
                  {oh.capacity !== null ? ` · Terisi ${booked.length} / ${oh.capacity}` : ` · Terisi ${booked.length}`}
                  {full ? ' · Penuh' : ''}
                </p>
                {isMentor && oh.mentor_id === user?.id && booked.length > 0 && (
                  <p className="muted">Peserta: {booked.map((b) => names.get(b.user_id) ?? 'Siswa').join(', ')}</p>
                )}
                {user && !mine && (
                  <button type="button" className="btn btn-primary btn-small" onClick={() => void handleBook(oh)} disabled={full}>
                    {full ? 'Penuh' : 'Pesan Slot'}
                  </button>
                )}
                {user && mine && (
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => void handleCancel(oh)}>
                    Batalkan Booking
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {isMentor && (
        <section className="section">
          <h2>Buat Office Hour</h2>
          <form className="form" onSubmit={handleCreate}>
            <label>Judul<input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Mis. Konsultasi naskah" /></label>
            <label>Mulai<input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} required /></label>
            <label>Selesai<input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} required /></label>
            <label>Kapasitas (kosong = tanpa batas)<input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} /></label>
            <button type="submit" className="btn btn-primary">Buat Office Hour</button>
          </form>
        </section>
      )}
    </div>
  )
}
