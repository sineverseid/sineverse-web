// SINEVERSE — Library (006): daftar + isi lengkap + ilustrasi + bookmark.
// PENEGAKAN DASAR HUKUM: item naskah tanpa legal_basis DITOLAK di UI —
// isinya tidak ditampilkan, diganti pesan jujur. Admin bisa mengedit /
// menghapus item (tombol hanya muncul untuk admin).
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { isMissingTableError } from '../lib/guarded'
import { supabase } from '../lib/supabase'
import type { LibraryItem } from '../lib/types'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

function isScript(item: LibraryItem): boolean {
  return (item.category ?? '').toLowerCase().includes('naskah')
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
        const { data, error: qErr } = await supabase.from('library_items').select('*').order('title')
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
          const { data: bm } = await supabase.from('library_bookmarks').select('library_item_id').eq('user_id', user.id)
          if (!cancelled) setBookmarks(new Set(((bm ?? []) as { library_item_id: string }[]).map((b) => b.library_item_id)))
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat Pustaka.')
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
      if (delErr) setNotice(delErr.message)
      else setBookmarks((b) => { const n = new Set(b); n.delete(itemId); return n })
    } else {
      const { error: insErr } = await supabase.from('library_bookmarks').insert({ library_item_id: itemId, user_id: user.id })
      if (insErr) setNotice(insErr.message)
      else setBookmarks((b) => new Set(b).add(itemId))
    }
  }

  return (
    <div className="page">
      <PageHeader
        icon="library"
        title="Pustaka"
        subtitle="Naskah, glosarium, template, dan bacaan filmmaking — lengkap dengan dasar hukum dan atribusi."
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
                  {it.image_url && <img src={it.image_url} alt={`Ilustrasi ${it.title}`} style={{ width: '100%', display: 'block', aspectRatio: '16/9', objectFit: 'cover' }} />}
                  <h3>{it.title}</h3>
                  <p>{it.category ?? 'Pustaka'}</p>
                  {rejected && <p className="muted">Naskah ini belum bisa ditampilkan: dasar hukum belum tercatat.</p>}
                </Link>
                {user && (
                  <div style={{ padding: '0 1.25rem 1rem' }}>
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => void toggleBookmark(it.id, bookmarks.has(it.id))}>
                      {bookmarks.has(it.id) ? 'Hapus Bookmark' : 'Bookmark'}
                    </button>
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

  useEffect(() => {
    if (!id) return
    const itemId = id
    let cancelled = false
    async function load() {
      try {
        const { data, error: qErr } = await supabase.from('library_items').select('*').eq('id', itemId).maybeSingle()
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
          const { data: bm } = await supabase.from('library_bookmarks').select('id').eq('library_item_id', itemId).eq('user_id', user.id).maybeSingle()
          if (!cancelled) setBookmarked(bm !== null)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat item Pustaka.')
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
      await supabase.from('library_bookmarks').delete().eq('library_item_id', currentItem.id).eq('user_id', user.id)
      setBookmarked(false)
    } else {
      const { error: insErr } = await supabase.from('library_bookmarks').insert({ library_item_id: currentItem.id, user_id: user.id })
      if (insErr) setNotice(insErr.message)
      else setBookmarked(true)
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    const { error: updErr } = await supabase.from('library_items').update({
      title: editTitle.trim(),
      body: editBody,
      legal_basis: editLegal.trim() || null,
      attribution: editAttr.trim() || null,
      usage_limits: editLimits.trim() || null,
    }).eq('id', currentItem.id)
    if (updErr) setNotice(updErr.message)
    else {
      setItem({ ...currentItem, title: editTitle.trim(), body: editBody, legal_basis: editLegal.trim() || null, attribution: editAttr.trim() || null, usage_limits: editLimits.trim() || null })
      setEditing(false)
      setNotice('Item Pustaka diperbarui.')
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Hapus item "${currentItem.title}" dari Pustaka?`)) return
    const { error: delErr } = await supabase.from('library_items').delete().eq('id', currentItem.id)
    if (delErr) setNotice(delErr.message)
    else {
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
      {currentItem.image_url && <img src={currentItem.image_url} alt={`Ilustrasi ${currentItem.title}`} style={{ width: '100%', borderRadius: 12, marginBottom: '1rem' }} />}
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
      {user && (
        <button type="button" className="btn btn-ghost btn-small" onClick={toggleBookmark}>
          {bookmarked ? 'Hapus Bookmark' : 'Bookmark'}
        </button>
      )}
      {isAdmin && (
        <section className="section" style={{ marginTop: '1.5rem' }}>
          <h2>Kelola (Admin)</h2>
          {editing ? (
            <form className="form" onSubmit={handleSaveEdit}>
              <label>Judul<input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required /></label>
              <label>Isi<textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={8} /></label>
              <label>Dasar hukum<input value={editLegal} onChange={(e) => setEditLegal(e.target.value)} placeholder="Wajib untuk naskah" /></label>
              <label>Atribusi<input value={editAttr} onChange={(e) => setEditAttr(e.target.value)} /></label>
              <label>Batas pakai<input value={editLimits} onChange={(e) => setEditLimits(e.target.value)} /></label>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary btn-small">Simpan</button>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditing(false)}>Batal</button>
              </div>
            </form>
          ) : (
            <div className="form-actions">
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setEditing(true)}>Edit Item</button>
              <button type="button" className="btn btn-ghost btn-small" onClick={handleDelete}>Hapus Item</button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
