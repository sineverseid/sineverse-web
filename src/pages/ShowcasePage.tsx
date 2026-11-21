// SINEVERSE — Showcase: galeri film yang dipublikasikan + publikasikan
// film sendiri (006). Hanya film status 'published' + visibility 'public'
// yang tampil di galeri; draft/privat hanya untuk pemilik/admin (RLS).
//
// Kurasi admin: film baru masuk sebagai 'draft' (menunggu dinilai admin),
// BUKAN langsung published. Admin melihat bagian "Perlu Dinilai" di atas
// galeri — "Layak Ditampilkan" mengubah status menjadi 'published',
// "Tidak Layak" mengembalikan film sebagai draft privat pemilik + alasan
// dicatat di audit log. Tabel films TIDAK punya kolom penilai/alasan
// (reviewed_by/review_note) — keputusan dicatat lewat logAudit, bukan
// di baris film. Film 'draft' + visibility 'private' (ditolak atau
// dipilih privat oleh pemilik) tidak masuk antrean penilaian.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { filmHue } from '../lib/brand'
import { fmtDate, isMissingTableError } from '../lib/guarded'
import { fetchProfileNames, logAudit, supabase } from '../lib/supabase'
import type { Film } from '../lib/types'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

export default function ShowcasePage() {
  const { user, profile, loading: authLoading } = useAuth()
  const [films, setFilms] = useState<Film[] | null>(null)
  const [myFilms, setMyFilms] = useState<Film[]>([])
  // Antrean kurasi admin: film draft + publik yang menunggu dinilai.
  const [pending, setPending] = useState<Film[]>([])
  const [ownerNames, setOwnerNames] = useState<Map<string, string>>(new Map())
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [filmUrl, setFilmUrl] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [showSchool, setShowSchool] = useState(false)

  const isAdmin = profile?.role === 'admin'

  async function load() {
    try {
      const { data, error: qErr } = await supabase
        .from('films')
        .select('*')
        .eq('status', 'published')
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
      if (qErr) {
        if (isMissingTableError(qErr)) setFilms(null)
        else throw qErr
        return
      }
      setFilms((data ?? []) as Film[])
      if (user) {
        const { data: mine } = await supabase.from('films').select('*').eq('owner_id', user.id).order('created_at', { ascending: false })
        setMyFilms((mine ?? []) as Film[])
      }
      if (isAdmin) {
        const { data: pend } = await supabase
          .from('films')
          .select('*')
          .eq('status', 'draft')
          .eq('visibility', 'public')
          .order('created_at', { ascending: true })
        const pendRows = (pend ?? []) as Film[]
        setPending(pendRows)
        setOwnerNames(
          await fetchProfileNames(pendRows.map((f) => f.owner_id)).catch(
            () => new Map<string, string>(),
          ),
        )
      } else {
        setPending([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat Showcase.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profile?.role])

  async function handlePublish(e: FormEvent) {
    e.preventDefault()
    if (!user || !title.trim()) return
    // Film baru masuk sebagai draft — tampil di galeri HANYA setelah
    // admin menyetujuinya di "Perlu Dinilai".
    const { error: insErr } = await supabase.from('films').insert({
      title: title.trim(),
      description: desc.trim() || null,
      owner_id: user.id,
      film_url: filmUrl.trim() || null,
      visibility,
      show_school: showSchool,
      status: 'draft',
    })
    if (insErr) setNotice(insErr.message)
    else {
      setNotice('Film dikirim untuk dinilai admin. Setelah disetujui, film akan tampil di Showcase.')
      setTitle('')
      setDesc('')
      setFilmUrl('')
      await load()
    }
  }

  // Kurasi admin: setujui (published) atau tolak (kembali jadi draft
  // privat pemilik — status 'draft' tidak punya nilai 'rejected', jadi
  // penolakan dicatat di audit log beserta alasannya).
  async function decideFilm(film: Film, approve: boolean) {
    if (approve) {
      const { error: updErr } = await supabase
        .from('films')
        .update({ status: 'published' })
        .eq('id', film.id)
      if (updErr) {
        setNotice(updErr.message)
        return
      }
      await logAudit('film.approved', 'films', film.id, { title: film.title })
      setNotice(`Film "${film.title}" disetujui dan tampil di Showcase.`)
    } else {
      const reason = rejectReason.trim() || null
      const { error: updErr } = await supabase
        .from('films')
        .update({ visibility: 'private' })
        .eq('id', film.id)
      if (updErr) {
        setNotice(updErr.message)
        return
      }
      await logAudit('film.rejected', 'films', film.id, { title: film.title, reason })
      setNotice(
        `Film "${film.title}" tidak layak tampil — dikembalikan sebagai draft privat pemilik.`,
      )
      setRejectingId(null)
      setRejectReason('')
    }
    await load()
  }

  if (loading || authLoading) return <div className="page"><p className="muted">Memuat Showcase…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (films === null) return <div className="page"><h1>Showcase</h1><MigrationNotice migration="006" /></div>

  return (
    <div className="page">
      <PageHeader
        icon="showcase"
        title="Showcase"
        subtitle="Film karya pelajar SMA/SMK dari seluruh Indonesia."
      />
      {notice && <p className="notice-box">{notice}</p>}

      {isAdmin && (
        <section className="section" aria-label="Film perlu dinilai">
          <h2>Perlu Dinilai ({pending.length})</h2>
          <p className="muted">
            Film baru yang menunggu penilaian admin. Hanya film yang disetujui yang tampil di
            Showcase untuk siswa dan mentor.
          </p>
          {pending.length === 0 ? (
            <p className="empty">Tidak ada film yang menunggu penilaian.</p>
          ) : (
            <ul className="discussion-list">
              {pending.map((f) => (
                <li key={f.id} className="discussion-item">
                  <p className="discussion-meta">
                    Diajukan oleh {ownerNames.get(f.owner_id) ?? '—'} · {fmtDate(f.created_at)}
                  </p>
                  <h3>
                    <Link to={`/showcase/${f.id}`}>{f.title}</Link>
                  </h3>
                  {f.description && <p>{f.description}</p>}
                  {f.film_url && (
                    <p>
                      <a href={f.film_url} target="_blank" rel="noreferrer">
                        Tonton film
                      </a>
                    </p>
                  )}
                  {rejectingId === f.id ? (
                    <form
                      className="form"
                      onSubmit={(e) => {
                        e.preventDefault()
                        void decideFilm(f, false)
                      }}
                    >
                      <label>
                        Alasan penolakan (opsional — dicatat di audit log)
                        <input
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Mis. kualitas video kurang, bukan karya sendiri…"
                        />
                      </label>
                      <div className="form-actions">
                        <button type="submit" className="btn btn-primary btn-small">
                          Konfirmasi Tidak Layak
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-small"
                          onClick={() => {
                            setRejectingId(null)
                            setRejectReason('')
                          }}
                        >
                          Batal
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="form-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-small"
                        onClick={() => void decideFilm(f, true)}
                      >
                        Layak Ditampilkan
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={() => {
                          setRejectingId(f.id)
                          setRejectReason('')
                        }}
                      >
                        Tidak Layak
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {films.length === 0 ? (
        <EmptyState message="Belum ada film yang dipublikasikan." />
      ) : (
        <ul className="course-list">
          {films.map((f) => (
            <li key={f.id} className="course-card">
              <Link to={`/showcase/${f.id}`}>
                {f.poster_url ? (
                  <img src={f.poster_url} alt={`Poster ${f.title}`} style={{ width: '100%', display: 'block', aspectRatio: '16/9', objectFit: 'cover' }} />
                ) : (
                  <div className="film-cover" style={{ background: filmHue(f.id) }} aria-hidden="true">
                    <span className="film-cover-title">{f.title}</span>
                  </div>
                )}
                <div className="course-card-body">
                  <h3>{f.title}</h3>
                  <p>{f.description ?? ''}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {user && (
        <section className="section">
          <h2>Publikasikan Film</h2>
          <form className="form" onSubmit={handlePublish}>
            <label>
              Judul film
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>
            <label>
              Deskripsi
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
            </label>
            <label>
              Tautan film (YouTube / Vimeo)
              <input value={filmUrl} onChange={(e) => setFilmUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
            </label>
            <label>
              Visibilitas
              <select value={visibility} onChange={(e) => setVisibility(e.target.value as 'public' | 'private')} style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}>
                <option value="public">Publik — diajukan untuk tampil di Showcase</option>
                <option value="private">Privat — hanya kamu (dan admin) yang melihat</option>
              </select>
            </label>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" checked={showSchool} onChange={(e) => setShowSchool(e.target.checked)} />
              Tampilkan nama sekolah pada film ini
            </label>
            <button type="submit" className="btn btn-primary">Kirim untuk Dinilai</button>
          </form>
          {myFilms.length > 0 && (
            <>
              <h3>Film Saya</h3>
              <ul>
                {myFilms.map((f) => (
                  <li key={f.id}>
                    <Link to={`/showcase/${f.id}`}>{f.title}</Link> — {f.status} · {f.visibility}
                    {f.status === 'draft' && f.visibility === 'public'
                      ? ' · Menunggu penilaian admin'
                      : ''}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  )
}
