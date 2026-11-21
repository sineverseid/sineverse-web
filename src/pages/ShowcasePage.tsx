// SINEVERSE — Showcase: galeri film yang dipublikasikan + publikasikan
// film sendiri (006). Hanya film status 'published' + visibility 'public'
// yang tampil di galeri; draft/privat hanya untuk pemilik/admin (RLS).
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { filmHue } from '../lib/brand'
import { isMissingTableError } from '../lib/guarded'
import { supabase } from '../lib/supabase'
import type { Film } from '../lib/types'

export default function ShowcasePage() {
  const { user } = useAuth()
  const [films, setFilms] = useState<Film[] | null>(null)
  const [myFilms, setMyFilms] = useState<Film[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [filmUrl, setFilmUrl] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [showSchool, setShowSchool] = useState(false)

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat Showcase.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  async function handlePublish(e: FormEvent) {
    e.preventDefault()
    if (!user || !title.trim()) return
    const { error: insErr } = await supabase.from('films').insert({
      title: title.trim(),
      description: desc.trim() || null,
      owner_id: user.id,
      film_url: filmUrl.trim() || null,
      visibility,
      show_school: showSchool,
      status: 'published',
    })
    if (insErr) setNotice(insErr.message)
    else {
      setNotice('Film dipublikasikan ke Showcase.')
      setTitle('')
      setDesc('')
      setFilmUrl('')
      await load()
    }
  }

  if (loading) return <div className="page"><p className="muted">Memuat Showcase…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (films === null) return <div className="page"><h1>Showcase</h1><MigrationNotice migration="006" /></div>

  return (
    <div className="page">
      <h1>Showcase</h1>
      <p className="muted">Film karya pelajar SMA/SMK dari seluruh Indonesia.</p>
      {notice && <p className="notice-box">{notice}</p>}
      {films.length === 0 ? (
        <p className="empty">Belum ada film yang dipublikasikan.</p>
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
                <option value="public">Publik — tampil di Showcase</option>
                <option value="private">Privat — hanya kamu (dan admin) yang melihat</option>
              </select>
            </label>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" checked={showSchool} onChange={(e) => setShowSchool(e.target.checked)} />
              Tampilkan nama sekolah pada film ini
            </label>
            <button type="submit" className="btn btn-primary">Publikasikan</button>
          </form>
          {myFilms.length > 0 && (
            <>
              <h3>Film Saya</h3>
              <ul>
                {myFilms.map((f) => (
                  <li key={f.id}>
                    <Link to={`/showcase/${f.id}`}>{f.title}</Link> — {f.status} · {f.visibility}
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
