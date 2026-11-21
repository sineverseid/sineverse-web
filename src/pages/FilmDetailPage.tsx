// SINEVERSE, Detail film Showcase (006): embed YouTube/Vimeo, ulasan
// bintang 1–5 (satu per pengguna), ubah visibilitas/status oleh pemilik.
// Ulasan hanya untuk film yang sudah dipublikasikan dan publik, dan tidak
// untuk pemilik film sendiri. Film draft/ditolak hanya bisa dilihat
// pemilik dan admin, pengunjung lain hanya melihat penjelasan.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { filmHue } from '../lib/brand'
import { fmtDate, isMissingTableError, videoEmbed } from '../lib/guarded'
import { fetchProfileNames, logAudit, supabase } from '../lib/supabase'
import type { Film, FilmReview } from '../lib/types'

function filmStatusLabel(status: string): string {
  if (status === 'draft') return 'Draft'
  if (status === 'published') return 'Dipublikasikan'
  if (status === 'rejected') return 'Ditolak'
  return status
}

function visibilityLabel(visibility: string): string {
  if (visibility === 'public') return 'Publik'
  if (visibility === 'private') return 'Privat'
  return visibility
}

// Tautan eksternal hanya dirender sebagai tombol bila URL-nya valid
// (http/https); kalau tidak, tampil sebagai teks biasa.
function isSafeHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim())
}

// Pesan error Supabase mentah (bahasa Inggris, teknis) tidak pernah
// ditampilkan ke pengguna, selalu diganti pesan ramah berbahasa Indonesia.
function friendlyDbError(err: unknown): string {
  const msg = err instanceof Error ? err.message : ''
  if (/duplicate key|unique constraint/i.test(msg)) return 'Data yang sama sudah ada. Periksa kembali isianmu.'
  if (/row-level security|permission denied|not authorized/i.test(msg)) return 'Kamu tidak punya izin untuk melakukan tindakan ini.'
  if (/network|fetch failed|Failed to fetch/i.test(msg)) return 'Koneksi bermasalah. Periksa internetmu lalu coba lagi.'
  return 'Terjadi kesalahan. Silakan coba lagi.'
}

export default function FilmDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, profile } = useAuth()
  const [film, setFilm] = useState<Film | null>(null)
  const [missing, setMissing] = useState(false)
  const [reviews, setReviews] = useState<FilmReview[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  // Nama penilai bila film ini ditolak admin (011).
  const [reviewerName, setReviewerName] = useState<string | null>(null)
  const [posterBroken, setPosterBroken] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [rating, setRating] = useState(5)
  const [body, setBody] = useState('')

  async function loadReviews(filmId: string) {
    const { data } = await supabase.from('film_reviews').select('*').eq('film_id', filmId).order('created_at', { ascending: false })
    const rows = (data ?? []) as FilmReview[]
    setReviews(rows)
    // Nama pemberi ulasan gagal dimuat tidak boleh merusak halaman film.
    try {
      setNames(await fetchProfileNames(rows.map((r) => r.user_id)))
    } catch {
      setNames(new Map())
    }
  }

  useEffect(() => {
    if (!id) return
    const filmId = id
    let cancelled = false
    async function load() {
      try {
        // Film dan daftar ulasannya independen (keduanya hanya butuh
        // filmId) — dimuat paralel, bukan film dulu baru ulasan.
        const [{ data, error: qErr }, { data: revData }] = await Promise.all([
          supabase.from('films').select('*').eq('id', filmId).maybeSingle(),
          supabase.from('film_reviews').select('*').eq('film_id', filmId).order('created_at', { ascending: false }),
        ])
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
          const rows = (revData ?? []) as FilmReview[]
          setReviews(rows)
          // Nama penilai (bila ditolak) dan nama pemberi ulasan independen
          // satu sama lain — dimuat paralel.
          const [reviewerNames, reviewNames] = await Promise.all([
            f.reviewed_by
              ? fetchProfileNames([f.reviewed_by]).catch(() => new Map<string, string>())
              : Promise.resolve(new Map<string, string>()),
            fetchProfileNames(rows.map((r) => r.user_id)).catch(() => new Map<string, string>()),
          ])
          if (cancelled) return
          // Nama penilai gagal dimuat tidak boleh merusak halaman film.
          if (f.reviewed_by) setReviewerName(reviewerNames.get(f.reviewed_by) ?? 'Admin')
          setNames(reviewNames)
        }
      } catch {
        if (!cancelled) setError('Gagal memuat film. Silakan muat ulang halaman.')
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
  // Formulir ulasan hanya untuk film yang sudah dipublikasikan dan publik,
  // pengunjung yang login, dan bukan pemilik film sendiri.
  const canReview = film.status === 'published' && film.visibility === 'public' && !!user && !isOwner

  // Pengunjung (bukan pemilik/admin) yang membuka film draft/ditolak lewat
  // tautan langsung hanya melihat penjelasan, bukan isi film.
  if ((currentFilm.status !== 'published' || currentFilm.visibility !== 'public') && !isOwner && !isAdmin) {
    return (
      <div className="page">
        <Link to="/showcase" className="back-link">← Showcase</Link>
        <h1>{currentFilm.title}</h1>
        <p className="notice-box">
          Film ini masih draft atau dinilai tidak layak tampil. Hanya pemilik dan admin yang bisa melihatnya.
        </p>
      </div>
    )
  }

  async function handleReview(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    const { error: insErr } = await supabase.from('film_reviews').insert({
      film_id: currentFilm.id,
      user_id: user.id,
      rating,
      body: body.trim() || null,
    })
    if (insErr) setNotice(friendlyDbError(insErr))
    else {
      setNotice('Ulasan terkirim.')
      setBody('')
      await loadReviews(currentFilm.id)
    }
  }

  // Kirim ulang film yang ditolak: status kembali 'draft', penilaian lama
  // dihapus, dan film masuk lagi ke antrean "Perlu Dinilai" admin. Film
  // privat ikut dijadikan publik supaya benar-benar masuk antrean.
  async function handleResubmit() {
    if (!user) return
    const makePublic = currentFilm.visibility === 'private'
    const { error: updErr } = await supabase
      .from('films')
      .update({
        status: 'draft',
        visibility: makePublic ? 'public' : currentFilm.visibility,
        reviewed_by: null,
        review_note: null,
        reviewed_at: null,
      })
      .eq('id', currentFilm.id)
    if (updErr) {
      setNotice(friendlyDbError(updErr))
      return
    }
    await logAudit('film.resubmitted', 'films', currentFilm.id, { title: currentFilm.title })
    setNotice(
      makePublic
        ? 'Film dijadikan publik dan dikirim ulang untuk dinilai admin. Status kembali menjadi draft dan menunggu penilaian.'
        : 'Film dikirim ulang untuk dinilai admin. Status kembali menjadi draft dan menunggu penilaian.',
    )
    setFilm({ ...currentFilm, status: 'draft', visibility: makePublic ? 'public' : currentFilm.visibility, reviewed_by: null, review_note: null, reviewed_at: null })
  }

  async function handleVisibility() {
    const next = currentFilm.visibility === 'public' ? 'private' : 'public'
    // Menyembunyikan film yang sudah tampil di galeri publik butuh konfirmasi.
    if (next === 'private' && currentFilm.status === 'published') {
      if (!window.confirm('Film akan disembunyikan dari galeri publik. Lanjutkan?')) return
    }
    const { error: updErr } = await supabase.from('films').update({ visibility: next }).eq('id', currentFilm.id)
    if (updErr) setNotice(friendlyDbError(updErr))
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
        {currentFilm.description ?? ''} · {filmStatusLabel(currentFilm.status)} · {visibilityLabel(currentFilm.visibility)}
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
          Dinilai oleh {reviewerName ?? 'Admin'}
          {currentFilm.reviewed_at ? ` · ${fmtDate(currentFilm.reviewed_at)}` : ''}
        </p>
      ) : null}
      {isOwner && currentFilm.status === 'rejected' && (
        <p>
          <button type="button" className="btn btn-primary btn-small" onClick={() => void handleResubmit()}>
            Kirim ulang untuk dinilai
          </button>
        </p>
      )}
      {currentFilm.poster_url && !posterBroken ? (
        <img
          src={currentFilm.poster_url}
          alt={`Poster ${currentFilm.title}`}
          onError={() => setPosterBroken(true)}
          style={{ width: '100%', borderRadius: 12, marginBottom: '1rem' }}
        />
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
        isSafeHttpUrl(currentFilm.film_url) ? (
          <p><a href={currentFilm.film_url} target="_blank" rel="noreferrer" className="btn btn-secondary">Tonton Film (tautan eksternal)</a></p>
        ) : (
          <p className="muted">Tautan film: {currentFilm.film_url}</p>
        )
      ) : (
        <p className="empty">Belum ada tautan film untuk karya ini.</p>
      )}
      {currentFilm.trailer_url && (
        isSafeHttpUrl(currentFilm.trailer_url) ? (
          <p><a href={currentFilm.trailer_url} target="_blank" rel="noreferrer">Tonton Trailer</a></p>
        ) : (
          <p className="muted">Tautan trailer: {currentFilm.trailer_url}</p>
        )
      )}
      {(isOwner || isAdmin) && (
        <p>
          <button type="button" className="btn btn-ghost btn-small" onClick={handleVisibility}>
            Ubah ke {currentFilm.visibility === 'public' ? 'Privat' : 'Publik'}
          </button>
        </p>
      )}
      {(isOwner || isAdmin) && currentFilm.status === 'rejected' && (
        <p className="muted">
          Mengubah visibilitas tidak mengubah status ditolak film ini. Kirim ulang film agar dinilai lagi oleh admin.
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
        {canReview && !myReview && (
          <form className="form" onSubmit={handleReview}>
            <label>
              Rating (1 sampai 5)
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
        {canReview && myReview && <p className="muted">Kamu sudah memberi ulasan untuk film ini ({myReview.rating} / 5). Satu ulasan per pengguna.</p>}
      </section>
    </div>
  )
}
