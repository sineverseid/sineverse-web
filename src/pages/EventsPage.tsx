// SINEVERSE, Acara (007): daftar + detail + sesi/rundown + pendaftaran
// berkapasitas (ditolak bila penuh). Acara eksternal: hanya penyelenggara
// + tautan resmi, tanpa pendaftaran di aplikasi.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { fmtDate, isMissingTableError } from '../lib/guarded'
import { dataUrlToBlob, photoToDataUrl } from '../lib/photo'
import { supabase, uploadToBucket } from '../lib/supabase'
import type { EventRegistration, EventSession, SineEvent } from '../lib/types'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { CompetitionsPage } from './CompetitionsPage'
import { CertificatesPage } from './CertificatesPage'

/** Perkecil poster di browser lalu unggah ke bucket event-posters.
 *  Mengembalikan URL publik, atau null bila bucket belum tersedia. */
async function uploadEventPoster(userId: string, file: File): Promise<string | null> {
  const dataUrl = await photoToDataUrl(file)
  const blob = await dataUrlToBlob(dataUrl)
  const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'
  const uploadFile = new File([blob], `poster.${ext}`, { type: blob.type || 'image/jpeg' })
  return uploadToBucket('event-posters', `${userId}/${Date.now()}.${ext}`, uploadFile)
}

/** Ubah ISO timestamptz ke nilai input datetime-local (waktu lokal). */
function toLocalInput(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Placeholder netral untuk acara tanpa poster: gradasi navy (class
 *  .media-placeholder yang sudah ada) + ikon gambar. Tanpa gambar
 *  karangan dan tanpa teks karangan. */
function EventPosterPlaceholder() {
  return (
    <div className="media-placeholder" aria-hidden="true">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </svg>
    </div>
  )
}

export function EventsPage() {
  const { user, profile } = useAuth()
  const [events, setEvents] = useState<SineEvent[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  // LB9: tanggal + jam dipisah — input type="date" tampil dd/mm/yyyy di
  // browser berbahasa Indonesia, bukan mm/dd/yyyy seperti datetime-local.
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [location, setLocation] = useState('')
  const [capacity, setCapacity] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [posterFile, setPosterFile] = useState<File | null>(null)
  const [posterPreview, setPosterPreview] = useState<string | null>(null)
  const [posterError, setPosterError] = useState<string | null>(null)
  const [brokenPosters, setBrokenPosters] = useState<Set<string>>(new Set())
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
      // B37: acara mendatang dulu (paling dekat dulu); acara yang sudah
      // lewat diurutkan paling baru dulu di bawahnya, bukan menumpuk di atas.
      const now = Date.now()
      const sorted = ((data ?? []) as SineEvent[]).sort((a, b) => {
        const aPast = a.starts_at ? new Date(a.starts_at).getTime() < now : false
        const bPast = b.starts_at ? new Date(b.starts_at).getTime() < now : false
        if (aPast !== bPast) return aPast ? 1 : -1
        const cmp = (a.starts_at ?? '').localeCompare(b.starts_at ?? '')
        return aPast ? -cmp : cmp
      })
      setEvents(sorted)
    } catch {
      setError('Gagal memuat acara. Coba lagi nanti.')
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

  function handlePosterChange(file: File | null) {
    if (!file) {
      setPosterFile(null)
      if (posterPreview) URL.revokeObjectURL(posterPreview)
      setPosterPreview(null)
      return
    }
    if (!file.type.startsWith('image/')) {
      setPosterError('Poster harus berupa gambar (JPG, PNG, atau WebP).')
      return
    }
    setPosterError(null)
    setPosterFile(file)
    if (posterPreview) URL.revokeObjectURL(posterPreview)
    setPosterPreview(URL.createObjectURL(file))
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!user || !title.trim()) return
    const cap = capacity ? Number(capacity) : null
    // B36: kapasitas 0 ditolak — 0 membuat acara langsung "Penuh" untuk
    // 0 pendaftar sekalipun; kosong tetap berarti tanpa batas.
    if (cap !== null && (Number.isNaN(cap) || cap < 1)) {
      setFormError('Kapasitas minimal 1 (kosong = tanpa batas).')
      return
    }
    // LB9: tanggal + jam digabung ke ISO (jam kosong = 00:00).
    const startsIso = startDate ? new Date(`${startDate}T${startTime || '00:00'}`).toISOString() : null
    const endsIso = endDate ? new Date(`${endDate}T${endTime || '00:00'}`).toISOString() : null
    if (startsIso && endsIso && new Date(endsIso) < new Date(startsIso)) {
      setFormError('Waktu selesai tidak boleh lebih awal dari waktu mulai.')
      return
    }
    setFormError(null)
    // Poster opsional: bila dipilih, unggah dulu; bila unggah gagal,
    // acara TIDAK dibuat supaya poster pilihan pembuat tidak hilang diam-diam.
    let posterUrl: string | null = null
    if (posterFile) {
      try {
        posterUrl = await uploadEventPoster(user.id, posterFile)
      } catch {
        setFormError('Poster tidak dapat dibaca. Pilih gambar lain.')
        return
      }
      if (!posterUrl) {
        setFormError('Poster belum terunggah: bucket event-posters belum tersedia. Coba lagi nanti atau hubungi admin.')
        return
      }
    }
    const { error: insErr } = await supabase.from('events').insert({
      title: title.trim(),
      description: description.trim() || null,
      kind: 'internal',
      starts_at: startsIso,
      ends_at: endsIso,
      location: location.trim() || null,
      capacity: cap,
      poster_url: posterUrl,
      created_by: user.id,
    })
    if (insErr) {
      setNotice('Gagal membuat acara. Coba lagi nanti.')
      return
    }
    setNotice('Acara dibuat. Tambahkan sesi/rundown dari halaman detail acara.')
    setTitle('')
    setDescription('')
    setStartDate('')
    setStartTime('')
    setEndDate('')
    setEndTime('')
    setLocation('')
    setCapacity('')
    setPosterFile(null)
    if (posterPreview) URL.revokeObjectURL(posterPreview)
    setPosterPreview(null)
    await load()
  }

  return (
    <div className="page">
      <PageHeader
        icon="event"
        title="Acara"
        subtitle="Workshop, screening, webinar, dan festival film pelajar."
      />
      <div className="about-tabs" role="tablist" aria-label="Tab Acara">
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
            <MigrationNotice migration="007" />
          ) : (
            <>
      {notice && <p className="notice-box">{notice}</p>}
      {canCreate && (
        <section className="section">
          <h2>Buat Acara</h2>
          <p className="muted">Mentor dan admin dapat membuat acara internal (workshop, screening, webinar, festival).</p>
          <form className="form" onSubmit={handleCreate}>
            {formError && <p className="error-box">{formError}</p>}
            <label>
              Judul acara
              <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Mis. Workshop Sinematografi Dasar" />
            </label>
            <label>
              Deskripsi
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </label>
            <label>
              Tanggal mulai (dd/mm/yyyy)
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label>
              Jam mulai
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </label>
            <label>
              Tanggal selesai (dd/mm/yyyy)
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
            <label>
              Jam selesai
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </label>
            <label>
              Lokasi
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Kota / daring" />
            </label>
            <label>
              Kapasitas peserta (kosong = tanpa batas)
              <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Mis. 50" />
            </label>
            <label>
              Poster acara (foto pamflet acara)
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handlePosterChange(e.target.files?.[0] ?? null)}
              />
            </label>
            {posterPreview && (
              <>
                <img
                  src={posterPreview}
                  alt="Pratinjau poster acara"
                  style={{ width: '100%', maxWidth: 320, borderRadius: 12 }}
                />
                <button type="button" className="btn btn-ghost" onClick={() => handlePosterChange(null)}>
                  Hapus poster
                </button>
              </>
            )}
            {posterError && <p className="error-box">{posterError}</p>}
            {!posterFile && !posterError && (
              <p className="muted">
                Opsional: unggah foto poster/pamflet acara. Foto besar diperkecil
                otomatis di browser sebelum diunggah.
              </p>
            )}
            <button type="submit" className="btn btn-primary">Buat Acara</button>
          </form>
        </section>
      )}
      {events.length === 0 ? (
        <EmptyState message="Belum ada acara." />
      ) : (
        <ul className="course-list">
          {events.map((e) => {
            const showPoster = e.poster_url && !brokenPosters.has(e.id)
            return (
              <li key={e.id} className="course-card">
                <Link to={`/acara/${e.id}`}>
                  {showPoster ? (
                    <img
                      src={e.poster_url ?? ''}
                      alt={`Poster ${e.title}`}
                      onError={() => setBrokenPosters((prev) => new Set(prev).add(e.id))}
                      style={{ width: '100%', display: 'block', aspectRatio: '16/9', objectFit: 'cover' }}
                    />
                  ) : (
                    <EventPosterPlaceholder />
                  )}
                  <div className="course-card-body">
                  <h3>{e.title}</h3>
                  <p>{e.description ?? ''}</p>
                  <p className="muted">
                    {e.kind === 'external' ? 'Eksternal' : 'Internal'}
                    {e.starts_at ? ` · ${fmtDate(e.starts_at)}` : ''}
                    {e.location ? ` · ${e.location}` : ''}
                    {e.capacity !== null ? ` · Kapasitas: ${e.capacity}` : ''}
                  </p>
                  </div>
                </Link>
              </li>
            )
          })}
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
    events: number | null
    internal: number | null
    external: number | null
    registrations: number | null
    competitions: number | null
    compOpen: number | null
    compExpired: number | null
    compJudging: number | null
    compDone: number | null
    submissions: number | null
    winners: number | null
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [partialError, setPartialError] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [ev, reg, comp, sub, win] = await Promise.all([
          supabase.from('events').select('kind'),
          supabase.from('event_registrations').select('id', { count: 'exact', head: true }),
          supabase.from('competitions').select('status,deadline'),
          supabase.from('competition_submissions').select('id', { count: 'exact', head: true }),
          supabase.from('competition_winners').select('id', { count: 'exact', head: true }),
        ])
        if (cancelled) return
        const failed = !!(ev.error || reg.error || comp.error || sub.error || win.error)
        setPartialError(failed)
        const evRows = ev.error ? null : ((ev.data ?? []) as { kind: string }[])
        const compRows = comp.error
          ? null
          : ((comp.data ?? []) as { status: string; deadline: string | null }[])
        const now = new Date()
        const isExpired = (c: { status: string; deadline: string | null }) =>
          c.status === 'dibuka' && !!c.deadline && new Date(c.deadline) < now
        setStats({
          events: evRows ? evRows.length : null,
          internal: evRows ? evRows.filter((e) => e.kind === 'internal').length : null,
          external: evRows ? evRows.filter((e) => e.kind === 'external').length : null,
          registrations: reg.error ? null : (reg.count ?? 0),
          competitions: compRows ? compRows.length : null,
          compOpen: compRows ? compRows.filter((c) => c.status === 'dibuka' && !isExpired(c)).length : null,
          compExpired: compRows ? compRows.filter(isExpired).length : null,
          compJudging: compRows ? compRows.filter((c) => c.status === 'penjurian').length : null,
          compDone: compRows ? compRows.filter((c) => c.status === 'selesai').length : null,
          submissions: sub.error ? null : (sub.count ?? 0),
          winners: win.error ? null : (win.count ?? 0),
        })
      } catch (err) {
        if (!cancelled) setError('Gagal memuat analitik. Coba lagi nanti.')
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

  const show = (v: number | null) => (v === null ? '—' : v)

  return (
    <div>
      {partialError && <p className="error-box">Analitik gagal dimuat sebagian.</p>}
      <section className="section">
        <h2>Acara</h2>
        <dl className="profile-list">
          <div><dt>Total acara</dt><dd>{show(stats.events)}</dd></div>
          <div><dt>Internal</dt><dd>{show(stats.internal)}</dd></div>
          <div><dt>Eksternal</dt><dd>{show(stats.external)}</dd></div>
          <div><dt>Total pendaftaran</dt><dd>{show(stats.registrations)}</dd></div>
        </dl>
      </section>
      <section className="section">
        <h2>Kompetisi &amp; Festival</h2>
        <dl className="profile-list">
          <div><dt>Total kompetisi</dt><dd>{show(stats.competitions)}</dd></div>
          <div><dt>Dibuka</dt><dd>{show(stats.compOpen)}</dd></div>
          <div><dt>Tenggat lewat</dt><dd>{show(stats.compExpired)}</dd></div>
          <div><dt>Penjurian</dt><dd>{show(stats.compJudging)}</dd></div>
          <div><dt>Selesai</dt><dd>{show(stats.compDone)}</dd></div>
          <div><dt>Karya masuk</dt><dd>{show(stats.submissions)}</dd></div>
          <div><dt>Pemenang</dt><dd>{show(stats.winners)}</dd></div>
        </dl>
      </section>
    </div>
  )
}

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [event, setEvent] = useState<SineEvent | null>(null)
  const [missing, setMissing] = useState(false)
  const [sessions, setSessions] = useState<EventSession[]>([])
  const [registered, setRegistered] = useState(false)
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [posterBroken, setPosterBroken] = useState(false)
  // Edit/hapus acara (K7): hanya pembuat acara atau admin.
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editStartsAt, setEditStartsAt] = useState('')
  const [editEndsAt, setEditEndsAt] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [editCapacity, setEditCapacity] = useState('')
  const [editOrganizer, setEditOrganizer] = useState('')
  const [editOfficialLink, setEditOfficialLink] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  // B34: form tambah sesi/rundown (pemilik/admin) — sebelumnya tidak ada
  // satu pun insert ke event_sessions di seluruh src/.
  const [sesTitle, setSesTitle] = useState('')
  const [sesDescription, setSesDescription] = useState('')
  const [sesStartsAt, setSesStartsAt] = useState('')
  const [sesEndsAt, setSesEndsAt] = useState('')
  const [sesError, setSesError] = useState<string | null>(null)
  const [sesSaving, setSesSaving] = useState(false)

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
        setPosterBroken(false)
        // Sesi dan pendaftaran hanya butuh id acara: jalankan paralel.
        const [sRes, regRes] = await Promise.all([
          supabase.from('event_sessions').select('*').eq('event_id', eventId).order('order_index'),
          supabase
            .from('event_registrations')
            .select('id,user_id', { count: 'exact' })
            .eq('event_id', eventId),
        ])
        if (!cancelled) setSessions((sRes.data ?? []) as EventSession[])
        const regs = regRes.data
        const total = regRes.count
        if (!cancelled) {
          setCount(total ?? (regs ?? []).length)
          if (user) setRegistered(((regs ?? []) as EventRegistration[]).some((r) => r.user_id === user.id))
        }
      } catch (err) {
        if (!cancelled) setError('Gagal memuat acara. Coba lagi nanti.')
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
  const canEditEvent = profile?.role === 'admin' || currentEvent.created_by === user?.id

  function startEdit() {
    setEditTitle(currentEvent.title)
    setEditDescription(currentEvent.description ?? '')
    setEditStartsAt(toLocalInput(currentEvent.starts_at))
    setEditEndsAt(toLocalInput(currentEvent.ends_at))
    setEditLocation(currentEvent.location ?? '')
    setEditCapacity(currentEvent.capacity === null ? '' : String(currentEvent.capacity))
    setEditOrganizer(currentEvent.organizer ?? '')
    setEditOfficialLink(currentEvent.official_link ?? '')
    setEditError(null)
    setEditing(true)
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault()
    if (!user || !canEditEvent) return
    const cap = editCapacity ? Number(editCapacity) : null
    // B36: kapasitas 0 ditolak — sama seperti form buat acara.
    if (cap !== null && (Number.isNaN(cap) || cap < 1)) {
      setEditError('Kapasitas minimal 1 (kosong = tanpa batas).')
      return
    }
    if (editStartsAt && editEndsAt && new Date(editEndsAt) < new Date(editStartsAt)) {
      setEditError('Waktu selesai tidak boleh lebih awal dari waktu mulai.')
      return
    }
    setEditError(null)
    const patch = {
      title: editTitle.trim(),
      description: editDescription.trim() || null,
      starts_at: editStartsAt ? new Date(editStartsAt).toISOString() : null,
      ends_at: editEndsAt ? new Date(editEndsAt).toISOString() : null,
      location: editLocation.trim() || null,
      capacity: cap,
      organizer: editOrganizer.trim() || null,
      official_link: editOfficialLink.trim() || null,
    }
    const { error: updErr } = await supabase.from('events').update(patch).eq('id', currentEvent.id)
    if (updErr) {
      setEditError(`Gagal menyimpan acara: ${updErr.message}`)
      return
    }
    setEvent({ ...currentEvent, ...patch })
    setEditing(false)
    setNotice('Acara diperbarui.')
  }

  // B34: tambah satu sesi/rundown ke acara ini (pemilik/admin saja).
  async function handleAddSession(e: FormEvent) {
    e.preventDefault()
    if (!user || !canEditEvent) return
    if (!sesTitle.trim()) {
      setSesError('Isi judul sesi dulu.')
      return
    }
    if (sesStartsAt && sesEndsAt && new Date(sesEndsAt) < new Date(sesStartsAt)) {
      setSesError('Waktu selesai sesi tidak boleh lebih awal dari waktu mulai.')
      return
    }
    setSesError(null)
    setSesSaving(true)
    try {
      const { data, error: insErr } = await supabase
        .from('event_sessions')
        .insert({
          event_id: currentEvent.id,
          title: sesTitle.trim(),
          description: sesDescription.trim() || null,
          starts_at: sesStartsAt ? new Date(sesStartsAt).toISOString() : null,
          ends_at: sesEndsAt ? new Date(sesEndsAt).toISOString() : null,
          order_index: sessions.length,
        })
        .select()
        .single()
      if (insErr) {
        setSesError(`Gagal menambah sesi: ${insErr.message}`)
        return
      }
      setSessions((prev) => [...prev, data as EventSession])
      setSesTitle('')
      setSesDescription('')
      setSesStartsAt('')
      setSesEndsAt('')
      setNotice('Sesi ditambahkan ke rundown acara ini.')
    } finally {
      setSesSaving(false)
    }
  }

  async function handleDeleteEvent() {
    if (!user || !canEditEvent) return
    if (
      !window.confirm(
        `Hapus acara "${currentEvent.title}"? Sesi/rundown dan pendaftaran ikut terhapus. Tindakan ini tidak bisa dibatalkan.`,
      )
    )
      return
    const { error: delErr } = await supabase.from('events').delete().eq('id', currentEvent.id)
    if (delErr) {
      setNotice(`Gagal menghapus acara: ${delErr.message}`)
      return
    }
    navigate('/acara')
  }

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
    if (insErr) setNotice('Gagal mendaftar acara. Coba lagi nanti.')
    else {
      setRegistered(true)
      setCount((c) => c + 1)
      setNotice('Kamu terdaftar di acara ini.')
    }
  }

  async function handleCancel() {
    if (!user) return
    const { error: delErr } = await supabase.from('event_registrations').delete().eq('event_id', currentEvent.id).eq('user_id', user.id)
    if (delErr) setNotice('Gagal membatalkan pendaftaran. Coba lagi nanti.')
    else {
      setRegistered(false)
      setCount((c) => Math.max(0, c - 1))
      setNotice('Pendaftaran dibatalkan.')
    }
  }

  return (
    <div className="page">
      <Link to="/acara" className="back-link">← Semua Acara</Link>
      {currentEvent.poster_url && !posterBroken ? (
        <img
          src={currentEvent.poster_url}
          alt={`Poster ${currentEvent.title}`}
          onError={() => setPosterBroken(true)}
          style={{ width: '100%', display: 'block', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 'var(--radius)' }}
        />
      ) : (
        <div style={{ borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <EventPosterPlaceholder />
        </div>
      )}
      <h1>{currentEvent.title}</h1>
      <p className="muted">
        {currentEvent.kind === 'external' ? 'Acara eksternal / nasional' : 'Acara internal SINEVERSE'}
        {currentEvent.starts_at ? ` · ${fmtDate(currentEvent.starts_at)}` : ''}
        {currentEvent.ends_at ? ` s.d. ${fmtDate(currentEvent.ends_at)}` : ''}
        {currentEvent.location ? ` · ${currentEvent.location}` : ''}
      </p>
      <p>{currentEvent.description ?? ''}</p>
      {notice && <p className="notice-box">{notice}</p>}

      {canEditEvent && !editing && (
        <div className="form-actions">
          <button type="button" className="btn btn-secondary btn-small" onClick={startEdit}>
            Edit Acara
          </button>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => void handleDeleteEvent()}>
            Hapus Acara
          </button>
        </div>
      )}

      {canEditEvent && editing && (
        <section className="section">
          <h2>Edit Acara</h2>
          <form className="form" onSubmit={handleSaveEdit}>
            {editError && <p className="error-box">{editError}</p>}
            <label>
              Judul acara
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
            </label>
            <label>
              Deskripsi
              <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} />
            </label>
            <label>
              Mulai
              <input type="datetime-local" value={editStartsAt} onChange={(e) => setEditStartsAt(e.target.value)} />
            </label>
            <label>
              Selesai
              <input type="datetime-local" value={editEndsAt} onChange={(e) => setEditEndsAt(e.target.value)} />
            </label>
            <label>
              Lokasi
              <input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} placeholder="Kota / daring" />
            </label>
            <label>
              Kapasitas peserta (kosong = tanpa batas)
              <input type="number" min={1} value={editCapacity} onChange={(e) => setEditCapacity(e.target.value)} placeholder="Mis. 50" />
            </label>
            <label>
              Penyelenggara (acara eksternal)
              <input value={editOrganizer} onChange={(e) => setEditOrganizer(e.target.value)} placeholder="Nama penyelenggara" />
            </label>
            <label>
              Tautan resmi (acara eksternal)
              <input value={editOfficialLink} onChange={(e) => setEditOfficialLink(e.target.value)} placeholder="https://…" />
            </label>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">Simpan Perubahan</button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Batal</button>
            </div>
          </form>
        </section>
      )}

      {currentEvent.kind === 'external' && (
        <p className="notice-box">
          Acara ini diselenggarakan oleh {currentEvent.organizer ?? 'penyelenggara eksternal'}.
          Pendaftaran hanya dilakukan di situs penyelenggara. SINEVERSE tidak membuka pendaftaran di aplikasi.
          {currentEvent.official_link ? (
            <>
              {' '}
              <a href={currentEvent.official_link} target="_blank" rel="noreferrer">Buka situs resmi penyelenggara</a>
            </>
          ) : (
            ' Tautan pendaftaran belum tersedia.'
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
                {s.starts_at ? `, ${fmtDate(s.starts_at)}` : ''}
                {s.description ? <p className="muted">{s.description}</p> : null}
              </li>
            ))}
          </ol>
        )}
        {canEditEvent && (
          <form className="form" onSubmit={handleAddSession} style={{ marginTop: '1rem' }}>
            <h3>Tambah Sesi / Rundown</h3>
            {sesError && <p className="error-box">{sesError}</p>}
            <label>
              Judul sesi
              <input value={sesTitle} onChange={(e) => setSesTitle(e.target.value)} required placeholder="Mis. Pembukaan & sambutan" />
            </label>
            <label>
              Deskripsi (opsional)
              <textarea value={sesDescription} onChange={(e) => setSesDescription(e.target.value)} rows={2} />
            </label>
            <label>
              Mulai (opsional)
              <input type="datetime-local" value={sesStartsAt} onChange={(e) => setSesStartsAt(e.target.value)} />
            </label>
            <label>
              Selesai (opsional)
              <input type="datetime-local" value={sesEndsAt} onChange={(e) => setSesEndsAt(e.target.value)} />
            </label>
            <button type="submit" className="btn btn-primary" disabled={sesSaving}>
              {sesSaving ? 'Menambahkan…' : 'Tambah Sesi'}
            </button>
          </form>
        )}
      </section>

      {currentEvent.kind === 'internal' && (
        <section className="section">
          <h2>Pendaftaran</h2>
          <p className="muted">
            Terdaftar: {count}{currentEvent.capacity !== null ? ` / ${currentEvent.capacity}` : ' (tanpa batas kapasitas)'}
            {full ? ', Kapasitas penuh.' : ''}
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
