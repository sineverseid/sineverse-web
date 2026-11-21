// SINEVERSE — Detail film Showcase (006): embed YouTube/Vimeo, ulasan
// bintang 1–5 (satu per pengguna), ubah visibilitas/status oleh pemilik.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { filmHue } from '../lib/brand'
import { fmtDate, isMissingTableError, videoEmbed } from '../lib/guarded'
import { fetchProfileNames, supabase } from '../lib/supabase'
import type { Film, FilmReview } from '../lib/types'

export default function FilmDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, profile } = useAuth()
  const [film, setFilm] = useState<Film | null>(null)
  const [missing, setMissing] = useState(false)
  const [reviews, setReviews] = useState<FilmReview[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  // Nama penilai bila film ini ditolak admin (011).
  const [reviewerName, setReviewerName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [rating, setRating] = useState(5)
  const [body, setBody] = useState('')

  async function loadReviews(filmId: string) {
    const { data } = await supabase.from('film_reviews').select('*').eq('film_id', filmId).order('created_at', { ascending: false })
    const rows = (data ?? []) as FilmReview[]
    setReviews(rows)
    setNames(await fetchProfileNames(rows.map((r) => r.user_id)))
  }

  useEffect(() => {
    if (!id) return
    const filmId = id
    let cancelled = false
    async function load() {
      try {
        const { data, error: qErr } = await supabase.from('films').select('*').eq('id', filmId).maybeSingle()
        if (qErr) {
          if (isMissingTableError(qErr)) {
            setMissing(true)
            return
          }
          throw qErr
        }
        if (cancelled) return
        setFilm(data as Film | null)
        if (data) {
          const f = data as Film
          if (f.reviewed_by) {
            const reviewerNames = await fetchProfileNames([f.reviewed_by]).catch(
              () => new Map<string, string>(),
            )
            if (!cancelled) setReviewerName(reviewerNames.get(f.reviewed_by) ?? null)
          }
          await loadReviews(filmId)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat film.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) return <div className="page"><p className="muted">Memuat film…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (missing) return <div className="page"><h1>Showcase</h1><MigrationNotice migration="006" /></div>
  if (!film) return <div className="page"><p className="empty">Film tidak ditemukan atau tidak bisa diakses.</p><Link to="/showcase">Kembali ke Showcase</Link></div>

  const currentFilm = film
  const isOwner = user?.id === film.owner_id
  const isAdmin = profile?.role === 'admin'
  const myReview = reviews.find((r) => r.user_id === user?.id)
  const avg = reviews.length > 0 ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : null
  const embed = film.film_url ? videoEmbed(film.film_url) : null

  async function handleReview(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    const { error: insErr } = await supabase.from('film_reviews').insert({
      film_id: currentFilm.id,
      user_id: user.id,
      rating,
      body: body.trim() || null,
    })
    if (insErr) setNotice(insErr.message)
    else {
      setNotice('Ulasan terkirim.')
      setBody('')
      await loadReviews(currentFilm.id)
    }
  }

  async function handleVisibility() {
    const next = currentFilm.visibility === 'public' ? 'private' : 'public'
    const { error: updErr } = await supabase.from('films').update({ visibility: next }).eq('id', currentFilm.id)
    if (updErr) setNotice(updErr.message)
    else {
      setFilm({ ...currentFilm, visibility: next })
      setNotice(`Visibilitas diubah menjadi ${next === 'public' ? 'publik' : 'privat'}.`)
    }
  }

  return (
    <div className="page">
      <Link to="/showcase" className="back-link">← Showcase</Link>
      <h1>{currentFilm.title}</h1>
      <p className="muted">
        {currentFilm.description ?? ''} · {currentFilm.status} · {currentFilm.visibility}
        {avg !== null ? ` · Rata-rata ulasan: ${avg.toFixed(1)} / 5 (${reviews.length} ulasan)` : ' · Belum ada ulasan'}
      </p>
      {currentFilm.status === 'rejected' && (isOwner || isAdmin) ? (
        <p className="error-box">
          Film ini dinilai tidak layak tampil di Showcase.
          {currentFilm.review_note ? (
            <>
              <br />
              Alasan: {currentFilm.review_note}
            </>
          ) : null}
          <br />
          Dinilai oleh {reviewerName ?? 'admin'}
          {currentFilm.reviewed_at ? ` · ${fmtDate(currentFilm.reviewed_at)}` : ''}
        </p>
      ) : null}
      {currentFilm.poster_url ? (
        <img src={currentFilm.poster_url} alt={`Poster ${currentFilm.title}`} style={{ width: '100%', borderRadius: 12, marginBottom: '1rem' }} />
      ) : (
        <div className="film-cover" style={{ background: filmHue(currentFilm.id), borderRadius: 12, marginBottom: '1rem' }} aria-hidden="true">
          <span className="film-cover-title">{currentFilm.title}</span>
        </div>
      )}
      {embed && embed.kind !== 'link' && embed.embedUrl ? (
        <div className="video-wrap">
          <iframe src={embed.embedUrl} title={`Film: ${currentFilm.title}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        </div>
      ) : currentFilm.film_url ? (
        <p><a href={currentFilm.film_url} target="_blank" rel="noreferrer" className="btn btn-secondary">Tonton Film (tautan eksternal)</a></p>
      ) : (
        <p className="empty">Belum ada tautan film untuk karya ini.</p>
      )}
      {currentFilm.trailer_url && <p><a href={currentFilm.trailer_url} target="_blank" rel="noreferrer">Tonton Trailer</a></p>}
      {(isOwner || isAdmin) && (
        <p>
          <button type="button" className="btn btn-ghost btn-small" onClick={handleVisibility}>
            Ubah ke {currentFilm.visibility === 'public' ? 'Privat' : 'Publik'}
          </button>
        </p>
      )}
      {notice && <p className="notice-box">{notice}</p>}

      <section className="section">
        <h2>Ulasan</h2>
        {reviews.length === 0 ? (
          <p className="empty">Belum ada ulasan. Jadilah yang pertama memberi ulasan.</p>
        ) : (
          <ul className="discussion-list">
            {reviews.map((r) => (
              <li key={r.id} className="discussion-item">
                <p className="discussion-meta">
                  {names.get(r.user_id) ?? 'Anggota'} · {fmtDate(r.created_at)} · {r.rating} / 5
                </p>
                {r.body && <p>{r.body}</p>}
              </li>
            ))}
          </ul>
        )}
        {user && !myReview && (
          <form className="form" onSubmit={handleReview}>
            <label>
              Rating (1–5)
              <select value={rating} onChange={(e) => setRating(Number(e.target.value))} style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} bintang</option>)}
              </select>
            </label>
            <label>
              Ulasan (opsional)
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Apa yang kamu suka dari film ini?" />
            </label>
            <button type="submit" className="btn btn-primary">Kirim Ulasan</button>
          </form>
        )}
        {user && myReview && <p className="muted">Kamu sudah memberi ulasan untuk film ini ({myReview.rating} / 5). Satu ulasan per pengguna.</p>}
      </section>
    </div>
  )
}
