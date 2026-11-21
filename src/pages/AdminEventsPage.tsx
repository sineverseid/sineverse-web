// SINEVERSE — Admin Panel: Acara & Festival.
// Manajemen Events & Festival (master prompt §04: admin mengelola acara /
// kompetisi). Admin melihat semua acara dan kompetisi, bisa menambah acara
// eksternal/nasional (penyelenggara lain, pendaftaran di situs resmi
// penyelenggara), dan membuka formulir buat acara/kompetisi internal.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { Competition, SineEvent } from '../lib/types'
import PageHeader from '../components/PageHeader'
import WorkspaceNav from '../components/WorkspaceNav'
import { ADMIN_NAV } from '../lib/workspaceNav'
import EmptyState from '../components/EmptyState'

function fmtDate(v: string | null) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AdminEventsPage() {
  const { user } = useAuth()
  const [events, setEvents] = useState<SineEvent[] | null>(null)
  const [competitions, setCompetitions] = useState<Competition[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [extTitle, setExtTitle] = useState('')
  const [extOrganizer, setExtOrganizer] = useState('')
  const [extLink, setExtLink] = useState('')
  const [extDesc, setExtDesc] = useState('')
  const [extStarts, setExtStarts] = useState('')
  const [extLocation, setExtLocation] = useState('')

  async function load() {
    try {
      const [{ data: ev }, { data: comp }] = await Promise.all([
        supabase.from('events').select('*').order('starts_at', { ascending: false }),
        supabase.from('competitions').select('*').order('created_at', { ascending: false }),
      ])
      setEvents((ev ?? []) as SineEvent[])
      setCompetitions((comp ?? []) as Competition[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat acara & kompetisi.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function handleCreateExternal(e: FormEvent) {
    e.preventDefault()
    if (!user || !extTitle.trim()) return
    const { error: insErr } = await supabase.from('events').insert({
      title: extTitle.trim(),
      description: extDesc.trim() || null,
      kind: 'external',
      organizer: extOrganizer.trim() || null,
      official_link: extLink.trim() || null,
      starts_at: extStarts ? new Date(extStarts).toISOString() : null,
      location: extLocation.trim() || null,
      created_by: user.id,
    })
    if (insErr) {
      setNotice(insErr.message)
      return
    }
    setNotice('Acara eksternal ditambahkan. Pendaftaran peserta dilakukan di situs resmi penyelenggara.')
    setExtTitle('')
    setExtOrganizer('')
    setExtLink('')
    setExtDesc('')
    setExtStarts('')
    setExtLocation('')
    await load()
  }

  return (
    <div className="page">
      <PageHeader
        icon="event"
        title="Acara & Festival"
        subtitle="Semua acara dan kompetisi platform, plus acara eksternal/nasional dari penyelenggara lain."
      />
      <WorkspaceNav entries={ADMIN_NAV} />
      {notice && <p className="notice-box">{notice}</p>}
      {loading && <p className="muted">Memuat acara & kompetisi…</p>}
      {error && <p className="error-box">{error}</p>}

      {!loading && !error && (
        <>
          <section className="section">
            <h2>Tambah Acara Eksternal / Nasional</h2>
            <p className="muted">
              Acara dari penyelenggara lain (kompetisi atau festival film nasional). Pendaftaran
              dilakukan di situs resmi penyelenggara, bukan di SINEVERSE.
            </p>
            <form className="form" onSubmit={handleCreateExternal}>
              <label>
                Judul acara
                <input value={extTitle} onChange={(e) => setExtTitle(e.target.value)} required placeholder="Mis. Festival Film Pelajar Nasional 2026" />
              </label>
              <label>
                Penyelenggara
                <input value={extOrganizer} onChange={(e) => setExtOrganizer(e.target.value)} placeholder="Nama penyelenggara" />
              </label>
              <label>
                Tautan resmi pendaftaran
                <input value={extLink} onChange={(e) => setExtLink(e.target.value)} placeholder="https://…" />
              </label>
              <label>
                Tanggal mulai
                <input type="date" value={extStarts} onChange={(e) => setExtStarts(e.target.value)} />
              </label>
              <label>
                Lokasi
                <input value={extLocation} onChange={(e) => setExtLocation(e.target.value)} placeholder="Kota / daring" />
              </label>
              <label>
                Deskripsi
                <textarea value={extDesc} onChange={(e) => setExtDesc(e.target.value)} rows={3} />
              </label>
              <button type="submit" className="btn btn-primary">Tambah Acara Eksternal</button>
            </form>
            <p className="muted">
              Acara internal dibuat dari <Link to="/acara">halaman Acara</Link> dan kompetisi dari{' '}
              <Link to="/kompetisi">halaman Kompetisi</Link> (mentor dan admin).
            </p>
          </section>

          <section className="section">
            <h2>Semua Acara ({events?.length ?? 0})</h2>
            {!events || events.length === 0 ? (
              <EmptyState message="Belum ada acara. Belum ada acara yang dibuat." />
            ) : (
              <ul className="discussion-list">
                {events.map((ev) => (
                  <li key={ev.id} className="discussion-item">
                    <p className="discussion-meta">
                      {ev.kind === 'external' ? 'Eksternal' : 'Internal'}
                      {ev.organizer ? ` · ${ev.organizer}` : ''} · {fmtDate(ev.starts_at)}
                      {ev.location ? ` · ${ev.location}` : ''}
                    </p>
                    <h3>
                      <Link to={`/acara/${ev.id}`}>{ev.title}</Link>
                    </h3>
                    {ev.official_link && (
                      <p>
                        <a href={ev.official_link} target="_blank" rel="noreferrer">
                          Tautan resmi
                        </a>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="section">
            <h2>Semua Kompetisi ({competitions?.length ?? 0})</h2>
            {!competitions || competitions.length === 0 ? (
              <EmptyState message="Belum ada kompetisi. Belum ada kompetisi yang dibuat." />
            ) : (
              <ul className="discussion-list">
                {competitions.map((c) => (
                  <li key={c.id} className="discussion-item">
                    <p className="discussion-meta">
                      Status: {c.status} · Tenggat: {fmtDate(c.deadline)}
                    </p>
                    <h3>
                      <Link to={`/kompetisi/${c.id}`}>{c.title}</Link>
                    </h3>
                    {c.description && <p>{c.description}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
