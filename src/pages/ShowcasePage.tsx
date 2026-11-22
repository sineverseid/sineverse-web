// SINEVERSE, Showcase: galeri film yang dipublikasikan + publikasikan
// film sendiri (006). Hanya film status 'published' + visibility 'public'
// yang tampil di galeri; draft/privat hanya untuk pemilik/admin (RLS).
//
// Poster film WAJIB milik anggota sendiri (Arif, 21 Nov 2026): ilustrasi
// TIDAK dipakai untuk film. Form publikasi mewajibkan unggah poster ke
// bucket film-posters (migrasi 012); film tanpa poster tidak bisa dikirim.
//
// Kurasi admin: film baru masuk sebagai 'draft' (menunggu dinilai admin),
// BUKAN langsung published. Admin melihat bagian "Perlu Dinilai" di atas
// galeri, "Layak Ditampilkan" mengubah status menjadi 'published'.
// "Tidak Layak" mengubah status menjadi 'rejected' (011) beserta
// reviewed_by / review_note / reviewed_at, pemilik melihat alasan
// penolakan di "Film Saya" dan di halaman detail film. Film 'rejected'
// tidak pernah tampil di galeri publik. Pemilik film yang ditolak bisa
// mengirim ulang untuk dinilai ("Kirim ulang untuk dinilai"): status
// kembali 'draft', penilaian lama dihapus, dan film masuk lagi ke antrean
// admin (film privat ikut dijadikan publik saat dikirim, supaya benar-benar
// masuk antrean).
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { filmHue } from '../lib/brand'
import { fmtDate, isMissingTableError } from '../lib/guarded'
import { fetchProfileNames, logAudit, supabase, uploadToBucket } from '../lib/supabase'
import type { Film } from '../lib/types'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

function filmStatusLabel(status: string): string {
  if (status === 'draft') return 'Draf'
  if (status === 'published') return 'Dipublikasikan'
  if (status === 'rejected') return 'Ditolak'
  return status
}

function visibilityLabel(visibility: string): string {
  if (visibility === 'public') return 'Publik'
  if (visibility === 'private') return 'Privat'
  return visibility
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

export default function ShowcasePage() {
  const { user, profile, loading: authLoading } = useAuth()
  const [films, setFilms] = useState<Film[] | null>(null)
  const [myFilms, setMyFilms] = useState<Film[]>([])
  // Nama penilai untuk film-film saya yang ditolak (011).
  const [reviewerNames, setReviewerNames] = useState<Map<string, string>>(new Map())
  // Antrean kurasi admin: film draft + publik yang menunggu dinilai.
  const [pending, setPending] = useState<Film[]>([])
  const [ownerNames, setOwnerNames] = useState<Map<string, string>>(new Map())
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectError, setRejectError] = useState<string | null>(null)
  const [brokenPosters, setBrokenPosters] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [filmUrl, setFilmUrl] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [showSchool, setShowSchool] = useState(false)
  // Poster film WAJIB milik anggota sendiri (Arif, 21 Nov 2026): ilustrasi
  // tidak dipakai untuk film. Poster diunggah ke bucket film-posters.
  const [posterFile, setPosterFile] = useState<File | null>(null)
  const [posterPreview, setPosterPreview] = useState<string | null>(null)
  const [posterError, setPosterError] = useState<string | null>(null)

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
      // Film saya dan antrean admin independen: paralel. Nama penilai dan
      // nama pemilik antrean baru bisa dicari setelah kedua daftar ada,
      // jadi keduanya ikut paralel di batch kedua.
      const [mineRes, pendRes] = await Promise.all([
        user
          ? supabase.from('films').select('*').eq('owner_id', user.id).order('created_at', { ascending: false })
          : Promise.resolve({ data: null as Film[] | null }),
        isAdmin
          ? supabase
              .from('films')
              .select('*')
              .eq('status', 'draft')
              .eq('visibility', 'public')
              .order('created_at', { ascending: true })
          : Promise.resolve({ data: null as Film[] | null }),
      ])
      const mineRows = user ? ((mineRes.data ?? []) as Film[]) : []
      const pendRows = isAdmin ? ((pendRes.data ?? []) as Film[]) : []
      if (user) setMyFilms(mineRows)
      if (isAdmin) setPending(pendRows)
      else setPending([])
      const reviewerIds = [...new Set(mineRows.map((f) => f.reviewed_by).filter((v): v is string => !!v))]
      const [reviewerNamesRes, ownerNamesRes] = await Promise.all([
        user
          ? reviewerIds.length > 0
            ? fetchProfileNames(reviewerIds).catch(() => new Map<string, string>())
            : Promise.resolve(new Map<string, string>())
          : Promise.resolve(new Map<string, string>()),
        isAdmin
          ? fetchProfileNames(pendRows.map((f) => f.owner_id)).catch(() => new Map<string, string>())
          : Promise.resolve(new Map<string, string>()),
      ])
      if (user) setReviewerNames(reviewerNamesRes)
      if (isAdmin) setOwnerNames(ownerNamesRes)
    } catch {
      setError('Gagal memuat Showcase. Silakan muat ulang halaman.')
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
    // Poster film WAJIB: anggota memakai poster mereka sendiri, bukan ilustrasi.
    if (!posterFile) {
      setPosterError('Unggah poster filmmu sendiri (gambar). Poster wajib diisi.')
      return
    }
    setPosterError(null)
    const posterUrl = await uploadToBucket(
      'film-posters',
      `${user.id}/${Date.now()}-${posterFile.name}`,
      posterFile,
    )
    if (!posterUrl) {
      setPosterError('Poster belum terunggah: bucket film-posters belum tersedia. Coba lagi nanti atau hubungi admin.')
      return
    }
    // Film privat tidak masuk antrean penilaian admin, jadi saat dikirim
    // film langsung dijadikan publik bersama status draft.
    const makePublic = visibility === 'private'
    const { error: insErr } = await supabase.from('films').insert({
      title: title.trim(),
      description: desc.trim() || null,
      owner_id: user.id,
      film_url: filmUrl.trim() || null,
      poster_url: posterUrl,
      visibility: makePublic ? 'public' : visibility,
      show_school: showSchool,
      status: 'draft',
    })
    if (insErr) setNotice(friendlyDbError(insErr))
    else {
      setNotice(
        makePublic
          ? 'Film dijadikan publik dan dikirim untuk dinilai admin. Setelah disetujui, film akan tampil di Showcase.'
          : 'Film dikirim untuk dinilai admin. Setelah disetujui, film akan tampil di Showcase.',
      )
      setTitle('')
      setDesc('')
      setFilmUrl('')
      setPosterFile(null)
      if (posterPreview) URL.revokeObjectURL(posterPreview)
      setPosterPreview(null)
      await load()
    }
  }

  function handlePosterChange(file: File | null) {
    if (!file) {
      setPosterFile(null)
      if (posterPreview) URL.revokeObjectURL(posterPreview)
      setPosterPreview(null)
      return
    }
    if (file.type.startsWith('image/') === false) {
      setPosterError('Poster harus berupa gambar (JPG, PNG, atau WebP).')
      return
    }
    // Tidak ada batas ukuran file: poster diunggah langsung ke Supabase
    // Storage, jadi foto besar pun diterima (Arif, 21 Nov 2026).
    setPosterError(null)
    setPosterFile(file)
    if (posterPreview) URL.revokeObjectURL(posterPreview)
    setPosterPreview(URL.createObjectURL(file))
  }

  // Kirim ulang film yang ditolak: status kembali 'draft', penilaian lama
  // (penilai, alasan, tanggal) dihapus, dan film masuk lagi ke antrean
  // "Perlu Dinilai" admin. Film privat ikut dijadikan publik supaya
  // benar-benar masuk antrean.
  async function handleResubmit(film: Film) {
    if (!user) return
    const makePublic = film.visibility === 'private'
    const { error: updErr } = await supabase
      .from('films')
      .update({
        status: 'draft',
        visibility: makePublic ? 'public' : film.visibility,
        reviewed_by: null,
        review_note: null,
        reviewed_at: null,
      })
      .eq('id', film.id)
    if (updErr) {
      setNotice(friendlyDbError(updErr))
      return
    }
    await logAudit('film.resubmitted', 'films', film.id, { title: film.title })
    setNotice(
      makePublic
        ? 'Film dijadikan publik dan dikirim ulang untuk dinilai admin. Status kembali menjadi draft dan menunggu penilaian.'
        : 'Film dikirim ulang untuk dinilai admin. Status kembali menjadi draft dan menunggu penilaian.',
    )
    await load()
  }

  // Kurasi admin: setujui (published) atau tolak (status 'rejected'
  // beserta penilai, alasan, dan tanggal penilaian, 011). Film yang
  // ditolak keluar dari antrean dan tidak tampil di galeri publik;
  // pemilik melihat alasannya di "Film Saya". Alasan penolakan wajib
  // diisi. Persetujuan juga mencatat penilai dan tanggal seperti penolakan.
  async function decideFilm(film: Film, approve: boolean) {
    if (approve) {
      const { error: updErr } = await supabase
        .from('films')
        .update({
          status: 'published',
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
          review_note: 'Disetujui',
        })
        .eq('id', film.id)
      if (updErr) {
        setNotice(friendlyDbError(updErr))
        return
      }
      await logAudit('film.approved', 'films', film.id, { title: film.title })
      setNotice(`Film "${film.title}" disetujui dan tampil di Showcase.`)
    } else {
      const reason = rejectReason.trim()
      if (!reason) {
        setRejectError('Tulis alasan penolakan terlebih dahulu.')
        return
      }
      const { error: updErr } = await supabase
        .from('films')
        .update({
          status: 'rejected',
          review_note: reason,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', film.id)
      if (updErr) {
        setNotice(friendlyDbError(updErr))
        return
      }
      await logAudit('film.rejected', 'films', film.id, { title: film.title, reason })
      setNotice(
        `Film "${film.title}" dinilai tidak layak tampil, pemilik dapat melihat alasannya di Film Saya.`,
      )
      setRejectingId(null)
      setRejectReason('')
      setRejectError(null)
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
                    Diajukan oleh {ownerNames.get(f.owner_id) ?? 'tidak diketahui'} · {fmtDate(f.created_at)}
                  </p>
                  <h3>
                    <Link to={`/showcase/${f.id}`}>{f.title}</Link>
                  </h3>
                  {f.description && <p>{f.description}</p>}
                  {!f.film_url && !f.trailer_url && (
                    <p>
                      <span style={{ display: 'inline-block', background: '#fff3cd', color: '#7a5b00', padding: '0.2rem 0.5rem', borderRadius: 6, fontSize: '0.85rem', fontWeight: 600 }}>
                        Tidak ada tautan film
                      </span>
                    </p>
                  )}
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
                        Alasan penolakan (wajib, akan dilihat oleh pemilik film)
                        <input
                          value={rejectReason}
                          onChange={(e) => {
                            setRejectReason(e.target.value)
                            if (rejectError) setRejectError(null)
                          }}
                          placeholder="Mis. kualitas video kurang, bukan karya sendiri…"
                        />
                      </label>
                      {rejectError && <p className="error-box">{rejectError}</p>}
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
                            setRejectError(null)
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
                          setRejectError(null)
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
          {films.map((f) => {
            const showPoster = f.poster_url && !brokenPosters.has(f.id)
            return (
              <li key={f.id} className="course-card">
                <Link to={`/showcase/${f.id}`}>
                  {showPoster ? (
                    <img
                      src={f.poster_url ?? ''}
                      alt={`Poster ${f.title}`}
                      onError={() => setBrokenPosters((prev) => new Set(prev).add(f.id))}
                      style={{ width: '100%', display: 'block', aspectRatio: '16/9', objectFit: 'cover' }}
                    />
                  ) : (
                    <div className="film-cover" style={{ background: filmHue(f.id) }} aria-hidden="true">
                      <span className="film-cover-title">{f.title}</span>
                    </div>
                  )}
                  <div className="course-card-body">
                    <h3 style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{f.title}</h3>
                    <p style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{f.description ?? ''}</p>
                  </div>
                </Link>
              </li>
            )
          })}
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
            {!filmUrl.trim() && (
              <p className="notice-box">
                Film tanpa tautan tidak bisa ditonton, admin hanya bisa menilai dari judul dan deskripsi.
              </p>
            )}
            <label>
              Poster film (wajib, poster filmmu sendiri)
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handlePosterChange(e.target.files?.[0] ?? null)}
              />
            </label>
            {posterPreview && (
              <img
                src={posterPreview}
                alt="Pratinjau poster film"
                style={{ width: '100%', maxWidth: 320, borderRadius: 12 }}
              />
            )}
            {posterError && <p className="error-box">{posterError}</p>}
            {!posterFile && !posterError && (
              <p className="muted">
                Poster wajib diisi dengan poster film buatanmu sendiri (bukan ilustrasi).
              </p>
            )}
            <label>
              Visibilitas
              <select value={visibility} onChange={(e) => setVisibility(e.target.value as 'public' | 'private')} style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}>
                <option value="public">Publik, diajukan untuk tampil di Showcase</option>
                <option value="private">Privat, hanya kamu (dan admin) yang melihat</option>
              </select>
            </label>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" checked={showSchool} onChange={(e) => setShowSchool(e.target.checked)} />
              Tampilkan nama sekolah pada film ini
            </label>
            <button type="submit" className="btn btn-primary">
              {visibility === 'private' ? 'Jadikan Publik & Kirim untuk Dinilai' : 'Kirim untuk Dinilai'}
            </button>
          </form>
          {myFilms.length > 0 && (
            <>
              <h3>Film Saya</h3>
              <ul>
                {myFilms.map((f) => (
                  <li key={f.id}>
                    <Link to={`/showcase/${f.id}`}>{f.title}</Link> · {filmStatusLabel(f.status)} · {visibilityLabel(f.visibility)}
                    {f.status === 'draft' && f.visibility === 'public'
                      ? ' · Menunggu penilaian admin'
                      : ''}
                    {f.status === 'draft' && f.visibility === 'private'
                      ? ' · Draft privat, tidak masuk antrean penilaian admin sampai dijadikan publik.'
                      : ''}
                    {f.status === 'rejected' ? (
                      <p className="error-box" style={{ marginTop: '0.5rem' }}>
                        Film ini dinilai tidak layak tampil di Showcase.
                        {f.review_note ? (
                          <>
                            <br />
                            Alasan: {f.review_note}
                          </>
                        ) : null}
                        <br />
                        Dinilai oleh{' '}
                        {f.reviewed_by ? reviewerNames.get(f.reviewed_by) ?? 'admin' : 'admin'}
                        {f.reviewed_at ? ` · ${fmtDate(f.reviewed_at)}` : ''}
                      </p>
                    ) : null}
                    {f.status === 'rejected' ? (
                      <p>
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          onClick={() => void handleResubmit(f)}
                        >
                          Kirim ulang untuk dinilai
                        </button>
                      </p>
                    ) : null}
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
