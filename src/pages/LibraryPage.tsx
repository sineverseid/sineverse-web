// SINEVERSE, Library (006): daftar + isi lengkap + ilustrasi + bookmark.
// PENEGAKAN DASAR HUKUM: item naskah tanpa legal_basis DITOLAK di UI —
// isinya tidak ditampilkan, diganti pesan jujur. Admin bisa mengedit /
// menghapus item (tombol hanya muncul untuk admin).
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { isMissingTableError } from '../lib/guarded'
import { fetchLibraryItems, invalidateCatalogCache, supabase } from '../lib/supabase'
import type { LibraryItem } from '../lib/types'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

function isScript(item: LibraryItem): boolean {
  return (item.category ?? '').toLowerCase().includes('naskah')
}

function itemInitial(title: string): string {
  const first = title.trim().charAt(0)
  return first ? first.toUpperCase() : 'S'
}

function isVideoName(name: string): boolean {
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
  return ['mp4', 'webm', 'mov', 'm4v'].includes(ext)
}

const LIBRARY_IMAGES_BUCKET = 'library-images'

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function sanitizeFileName(name: string): string {
  const base = (name || 'gambar').split(/[\\/]/).pop() || 'gambar'
  return base.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function LibraryThumb({ item }: { item: LibraryItem }) {
  const [broken, setBroken] = useState(false)
  if (!item.image_url || broken) {
    return (
      <div className="media-placeholder" aria-hidden="true">
        <span>{itemInitial(item.title)}</span>
      </div>
    )
  }
  return (
    <img
      src={item.image_url}
      alt={`Ilustrasi ${item.title}`}
      style={{ width: '100%', display: 'block', aspectRatio: '16/9', objectFit: 'cover' }}
      onError={() => setBroken(true)}
    />
  )
}

export function LibraryPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<LibraryItem[] | null>(null)
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [category, setCategory] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        // Daftar item (katalog, di-cache) dan bookmark (milik pengguna,
        // selalu segar) independen — dimuat paralel.
        const [{ data, error: qErr }, { data: bm }] = await Promise.all([
          fetchLibraryItems().then(
            (rows) => ({ data: rows as LibraryItem[], error: null }),
            (err: unknown) => ({ data: null as LibraryItem[] | null, error: err }),
          ),
          user
            ? supabase.from('library_bookmarks').select('library_item_id').eq('user_id', user.id)
            : Promise.resolve({ data: null } as { data: null }),
        ])
        if (qErr) {
          if (isMissingTableError(qErr)) {
            if (!cancelled) setItems(null)
            return
          }
          throw qErr
        }
        if (cancelled) return
        setItems((data ?? []) as LibraryItem[])
        if (user) {
          if (!cancelled) setBookmarks(new Set(((bm ?? []) as { library_item_id: string }[]).map((b) => b.library_item_id)))
        }
      } catch (err) {
        if (!cancelled) setError('Gagal memuat Pustaka. Coba lagi nanti.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user])

  if (loading) return <div className="page"><p className="muted">Memuat Pustaka…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (items === null) return <div className="page"><h1>Pustaka</h1><MigrationNotice migration="006" /></div>

  const categories = [...new Set(items.map((i) => i.category).filter((c): c is string => !!c))].sort()
  const filtered = category ? items.filter((i) => i.category === category) : items

  async function toggleBookmark(itemId: string, marked: boolean) {
    if (!user) return
    if (marked) {
      const { error: delErr } = await supabase.from('library_bookmarks').delete().eq('library_item_id', itemId).eq('user_id', user.id)
      if (delErr) setNotice('Gagal mengubah bookmark. Coba lagi.')
      else setBookmarks((b) => { const n = new Set(b); n.delete(itemId); return n })
    } else {
      const { error: insErr } = await supabase.from('library_bookmarks').insert({ library_item_id: itemId, user_id: user.id })
      if (insErr) setNotice('Gagal mengubah bookmark. Coba lagi.')
      else setBookmarks((b) => new Set(b).add(itemId))
    }
  }

  return (
    <div className="page">
      <PageHeader
        icon="library"
        title="Pustaka"
        subtitle="Naskah, glosarium, template, dan bacaan filmmaking, lengkap dengan dasar hukum dan atribusi."
      />
      {notice && <p className="notice-box">{notice}</p>}
      <div className="chip-row" style={{ marginBottom: '1rem' }}>
        <button type="button" className={`chip chip-button ${category === '' ? 'chip-active' : ''}`} onClick={() => setCategory('')}>Semua</button>
        {categories.map((c) => (
          <button key={c} type="button" className={`chip chip-button ${category === c ? 'chip-active' : ''}`} onClick={() => setCategory(c)}>{c}</button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <EmptyState message="Belum ada item Pustaka." />
      ) : (
        <ul className="course-list">
          {filtered.map((it) => {
            const rejected = isScript(it) && !it.legal_basis
            return (
              <li key={it.id} className="course-card">
                <Link to={`/pustaka/${it.id}`}>
                  <LibraryThumb item={it} />
                  <div className="course-card-body">
                  <h3>{it.title}</h3>
                  <p>{it.category ?? 'Pustaka'}</p>
                  {it.attachment_url && (
                    <p className="muted">
                      {isVideoName(it.attachment_name ?? '') ? 'Video' : 'Lampiran'}
                      {it.attachment_name ? `: ${it.attachment_name}` : ''}
                    </p>
                  )}
                  {rejected && <p className="muted">Naskah ini belum bisa ditampilkan: dasar hukum belum tercatat.</p>}
                  </div>
                </Link>
                {user ? (
                  <div style={{ padding: '0 1.25rem 1rem' }}>
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => void toggleBookmark(it.id, bookmarks.has(it.id))}>
                      {bookmarks.has(it.id) ? 'Hapus Bookmark' : 'Bookmark'}
                    </button>
                  </div>
                ) : (
                  <div style={{ padding: '0 1.25rem 1rem' }}>
                    <button type="button" className="btn btn-ghost btn-small" disabled>
                      Bookmark
                    </button>
                    <p className="muted" style={{ margin: '0.4rem 0 0' }}>Masuk untuk menyimpan.</p>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function LibraryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, profile } = useAuth()
  const [item, setItem] = useState<LibraryItem | null>(null)
  const [missing, setMissing] = useState(false)
  const [bookmarked, setBookmarked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editLegal, setEditLegal] = useState('')
  const [editAttr, setEditAttr] = useState('')
  const [editLimits, setEditLimits] = useState('')
  const [posterFile, setPosterFile] = useState<File | null>(null)
  const [posterPreview, setPosterPreview] = useState<string | null>(null)
  const [uploadingPoster, setUploadingPoster] = useState(false)
  // P50: gambar detail yang gagal dimuat jatuh ke placeholder inisial.
  const [imageBroken, setImageBroken] = useState(false)

  useEffect(() => {
    if (!id) return
    const itemId = id
    let cancelled = false
    async function load() {
      try {
        // Item dan status bookmark independen — dimuat paralel.
        const [{ data, error: qErr }, { data: bm }] = await Promise.all([
          supabase.from('library_items').select('*').eq('id', itemId).maybeSingle(),
          user
            ? supabase.from('library_bookmarks').select('id').eq('library_item_id', itemId).eq('user_id', user.id).maybeSingle()
            : Promise.resolve({ data: null } as { data: null }),
        ])
        if (qErr) {
          if (isMissingTableError(qErr)) {
            setMissing(true)
            return
          }
          throw qErr
        }
        if (cancelled) return
        setItem(data as LibraryItem | null)
        if (data) {
          setEditTitle(data.title)
          setEditBody(data.body ?? '')
          setEditLegal(data.legal_basis ?? '')
          setEditAttr(data.attribution ?? '')
          setEditLimits(data.usage_limits ?? '')
        }
        if (user) {
          if (!cancelled) setBookmarked(bm !== null)
        }
      } catch (err) {
        if (!cancelled) setError('Gagal memuat item Pustaka. Coba lagi nanti.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id, user])

  if (loading) return <div className="page"><p className="muted">Memuat item…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (missing) return <div className="page"><h1>Pustaka</h1><MigrationNotice migration="006" /></div>
  if (!item) return <div className="page"><p className="empty">Item tidak ditemukan.</p><Link to="/pustaka">Kembali ke Pustaka</Link></div>

  const currentItem = item
  const isAdmin = profile?.role === 'admin'
  const rejected = isScript(currentItem) && !currentItem.legal_basis

  async function toggleBookmark() {
    if (!user) return
    if (bookmarked) {
      const { error: delErr } = await supabase.from('library_bookmarks').delete().eq('library_item_id', currentItem.id).eq('user_id', user.id)
      if (delErr) setNotice('Gagal menghapus bookmark. Coba lagi.')
      else setBookmarked(false)
    } else {
      const { error: insErr } = await supabase.from('library_bookmarks').insert({ library_item_id: currentItem.id, user_id: user.id })
      if (insErr) setNotice('Gagal menyimpan bookmark. Coba lagi.')
      else setBookmarked(true)
    }
  }

  function handlePosterSelect(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setNotice('Poster harus berupa gambar (JPG, PNG, atau sejenisnya).')
      return
    }
    // TANPA batas ukuran (Arif, 24 Nov 2026): poster JPG boleh berapa pun MB.
    if (posterPreview) URL.revokeObjectURL(posterPreview)
    setPosterFile(file)
    setPosterPreview(URL.createObjectURL(file))
    setNotice(null)
  }

  function clearPosterSelection() {
    if (posterPreview) URL.revokeObjectURL(posterPreview)
    setPosterFile(null)
    setPosterPreview(null)
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    // Poster baru diunggah dulu, baru update — bila upload gagal, simpan dibatalkan.
    let imageUrlToSave: string | null | undefined
    const oldImageUrl = currentItem.image_url
    if (posterFile) {
      setUploadingPoster(true)
      try {
        const path = `${randomId()}-${sanitizeFileName(posterFile.name)}`
        const { error: upErr } = await supabase.storage
          .from(LIBRARY_IMAGES_BUCKET)
          .upload(path, posterFile, { upsert: false, contentType: posterFile.type })
        if (upErr) {
          setNotice(`Poster gagal diunggah (${upErr.message}).`)
          return
        }
        const { data } = supabase.storage.from(LIBRARY_IMAGES_BUCKET).getPublicUrl(path)
        imageUrlToSave = data.publicUrl
      } finally {
        setUploadingPoster(false)
      }
    }
    const { error: updErr } = await supabase.from('library_items').update({
      title: editTitle.trim(),
      body: editBody,
      legal_basis: editLegal.trim() || null,
      attribution: editAttr.trim() || null,
      usage_limits: editLimits.trim() || null,
      ...(imageUrlToSave !== undefined ? { image_url: imageUrlToSave } : {}),
    }).eq('id', currentItem.id)
    if (updErr) setNotice('Gagal menyimpan perubahan. Coba lagi nanti.')
    else {
      // Best-effort: hapus poster lama dari bucket bila diganti dan berasal dari sana.
      if (imageUrlToSave && oldImageUrl && oldImageUrl !== imageUrlToSave && oldImageUrl.includes('/library-images/')) {
        const path = oldImageUrl.split('/library-images/')[1]?.split('?')[0]
        if (path) {
          try {
            await supabase.storage.from(LIBRARY_IMAGES_BUCKET).remove([path])
          } catch {
            // File yatim di bucket bukan kegagalan simpan — abaikan.
          }
        }
      }
      invalidateCatalogCache()
      setItem({ ...currentItem, title: editTitle.trim(), body: editBody, legal_basis: editLegal.trim() || null, attribution: editAttr.trim() || null, usage_limits: editLimits.trim() || null, image_url: imageUrlToSave !== undefined ? imageUrlToSave : currentItem.image_url })
      setImageBroken(false)
      clearPosterSelection()
      setEditing(false)
      setNotice('Item Pustaka diperbarui.')
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Hapus item "${currentItem.title}" dari Pustaka?`)) return
    const { error: delErr } = await supabase.from('library_items').delete().eq('id', currentItem.id)
    if (delErr) setNotice('Gagal menghapus item. Coba lagi nanti.')
    else {
      // Best-effort: hapus juga file gambar/lampirannya dari bucket bila berasal dari sana.
      for (const [url, bucket] of [
        [currentItem.image_url, 'library-images'],
        [currentItem.attachment_url, 'library-files'],
      ] as const) {
        if (url && url.includes(`/${bucket}/`)) {
          const path = url.split(`/${bucket}/`)[1]?.split('?')[0]
          if (path) {
            try {
              await supabase.storage.from(bucket).remove([path])
            } catch {
              // File yatim di bucket bukan kegagalan hapus item — abaikan.
            }
          }
        }
      }
      invalidateCatalogCache()
      setNotice('Item dihapus. Kembali ke daftar Pustaka…')
      window.location.hash = '#/pustaka'
    }
  }

  return (
    <div className="page">
      <Link to="/pustaka" className="back-link">← Pustaka</Link>
      <h1>{currentItem.title}</h1>
      <p className="muted">{currentItem.category ?? 'Pustaka'}</p>
      {notice && <p className="notice-box">{notice}</p>}
      {/* P50: gambar detail punya fallback seperti LibraryThumb — bila
          gagal dimuat tampil placeholder inisial, bukan ikon patah. */}
      {currentItem.image_url && !imageBroken ? (
        <img src={currentItem.image_url} alt={`Ilustrasi ${currentItem.title}`} style={{ width: '100%', borderRadius: 12, marginBottom: '1rem' }} onError={() => setImageBroken(true)} />
      ) : currentItem.image_url ? (
        <div className="media-placeholder" style={{ marginBottom: '1rem' }} aria-label="Gambar tidak dapat dimuat">
          <span>{itemInitial(currentItem.title)}</span>
        </div>
      ) : null}
      {currentItem.attachment_url && isVideoName(currentItem.attachment_name ?? '') ? (
        <video src={currentItem.attachment_url} controls style={{ width: '100%', borderRadius: 12, marginBottom: '1rem' }} />
      ) : currentItem.attachment_url ? (
        <p>
          Lampiran:{' '}
          <a href={currentItem.attachment_url} target="_blank" rel="noreferrer">
            {currentItem.attachment_name ?? 'Unduh lampiran'}
          </a>
        </p>
      ) : null}
      {rejected ? (
        <p className="error-box">
          Naskah ini tidak bisa ditampilkan: dasar hukum penggunaannya belum tercatat di SINEVERSE.
          Admin perlu melengkapi legal_basis item ini sebelum isinya dibuka.
        </p>
      ) : (
        <div className="lesson-content">{currentItem.body ?? 'Belum ada isi untuk item ini.'}</div>
      )}
      <dl className="profile-list">
        <div><dt>Dasar hukum</dt><dd>{currentItem.legal_basis ?? '—'}</dd></div>
        <div><dt>Atribusi</dt><dd>{currentItem.attribution ?? '—'}</dd></div>
        <div><dt>Batas pakai</dt><dd>{currentItem.usage_limits ?? '—'}</dd></div>
        {currentItem.source_url && <div><dt>Sumber</dt><dd><a href={currentItem.source_url} target="_blank" rel="noreferrer">{currentItem.source_url}</a></dd></div>}
      </dl>
      {user ? (
        <button type="button" className="btn btn-ghost btn-small" onClick={toggleBookmark}>
          {bookmarked ? 'Hapus Bookmark' : 'Bookmark'}
        </button>
      ) : (
        <div>
          <button type="button" className="btn btn-ghost btn-small" disabled>
            Bookmark
          </button>
          <p className="muted">Masuk untuk menyimpan.</p>
        </div>
      )}
      {isAdmin && (
        <section className="section" style={{ marginTop: '1.5rem' }}>
          <h2>Kelola (Admin)</h2>
          {editing ? (
            <form className="form" onSubmit={handleSaveEdit}>
              <label>Judul<input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required /></label>
              <label>Isi<textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={8} /></label>
              <label>
                Ganti poster (JPG)
                <input type="file" accept="image/*" onChange={(e) => handlePosterSelect(e.target.files?.[0])} />
              </label>
              {posterPreview ? (
                <div>
                  <img src={posterPreview} alt="Pratinjau poster baru" style={{ width: '100%', borderRadius: 8 }} />
                  <p>
                    <button type="button" className="btn btn-ghost btn-small" onClick={clearPosterSelection}>
                      Hapus poster pilihan
                    </button>
                  </p>
                </div>
              ) : currentItem.image_url ? (
                <p className="muted">Poster saat ini tetap dipakai bila tidak memilih file baru. Tanpa batas ukuran.</p>
              ) : (
                <p className="muted">Belum ada poster. Pilih file JPG untuk menambahkan poster. Tanpa batas ukuran.</p>
              )}
              <label>Dasar hukum<input value={editLegal} onChange={(e) => setEditLegal(e.target.value)} placeholder="Wajib untuk naskah" /></label>
              <label>Atribusi<input value={editAttr} onChange={(e) => setEditAttr(e.target.value)} /></label>
              <label>Batas pakai<input value={editLimits} onChange={(e) => setEditLimits(e.target.value)} /></label>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary btn-small" disabled={uploadingPoster}>{uploadingPoster ? 'Mengunggah poster…' : 'Simpan'}</button>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => { clearPosterSelection(); setEditing(false) }}>Batal</button>
              </div>
            </form>
          ) : (
            <div className="form-actions">
              <button type="button" className="btn btn-secondary btn-small" onClick={() => { clearPosterSelection(); setEditing(true) }}>Edit Item</button>
              <button type="button" className="btn btn-ghost btn-small" onClick={handleDelete}>Hapus Item</button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
