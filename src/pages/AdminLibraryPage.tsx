// SINEVERSE — Admin Panel: Pustaka.
// Kelola Library (master prompt §05G + §12: screenplay hanya dari sumber
// legal — public domain, berlisensi, izin tertulis, atau tautan resmi).
// Hanya admin yang boleh menambah/mengubah/menghapus item Pustaka
// (kebijakan RLS library_items_admin_all).
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { invalidateCatalogCache, supabase } from '../lib/supabase'
import type { LibraryItem } from '../lib/types'
import PageHeader from '../components/PageHeader'
import WorkspaceNav from '../components/WorkspaceNav'
import { ADMIN_NAV } from '../lib/workspaceNav'
import EmptyState from '../components/EmptyState'

export default function AdminLibraryPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<LibraryItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [body, setBody] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [legalBasis, setLegalBasis] = useState('')
  const [attribution, setAttribution] = useState('')
  const [usageLimits, setUsageLimits] = useState('')
  const [imageUrl, setImageUrl] = useState('')

  async function load() {
    try {
      const { data, error: qErr } = await supabase
        .from('library_items')
        .select('*')
        .order('created_at', { ascending: false })
      if (qErr) throw qErr
      setItems((data ?? []) as LibraryItem[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat Pustaka.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const { error: insErr } = await supabase.from('library_items').insert({
      title: title.trim(),
      category: category.trim() || null,
      body: body.trim() || null,
      source_url: sourceUrl.trim() || null,
      legal_basis: legalBasis.trim() || null,
      attribution: attribution.trim() || null,
      usage_limits: usageLimits.trim() || null,
      image_url: imageUrl.trim() || null,
    })
    if (insErr) {
      setNotice(insErr.message)
      return
    }
    invalidateCatalogCache()
    setNotice('Item Pustaka ditambahkan.')
    setTitle('')
    setCategory('')
    setBody('')
    setSourceUrl('')
    setLegalBasis('')
    setAttribution('')
    setUsageLimits('')
    setImageUrl('')
    await load()
  }

  async function handleDelete(id: string, itemTitle: string) {
    if (!window.confirm(`Hapus "${itemTitle}" dari Pustaka? Tindakan ini tidak bisa dibatalkan.`)) return
    const { error: delErr } = await supabase.from('library_items').delete().eq('id', id)
    if (delErr) {
      setNotice(delErr.message)
      return
    }
    invalidateCatalogCache()
    setNotice(`"${itemTitle}" dihapus dari Pustaka.`)
    await load()
  }

  return (
    <div className="page">
      <PageHeader
        icon="library"
        title="Kelola Pustaka"
        subtitle="Tambah dan hapus item Pustaka. Naskah hanya dari sumber legal: public domain, berlisensi, izin tertulis, atau tautan resmi."
      />
      <WorkspaceNav entries={ADMIN_NAV} />
      {notice && <p className="notice-box">{notice}</p>}
      {loading && <p className="muted">Memuat Pustaka…</p>}
      {error && <p className="error-box">{error}</p>}

      {!loading && !error && (
        <>
          <section className="section">
            <h2>Tambah Item Pustaka</h2>
            <form className="form" onSubmit={handleAdd}>
              <label>
                Judul
                <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Mis. Glosarium Shot Size" />
              </label>
              <label>
                Kategori
                <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Mis. Glosarium, Template, Naskah" />
              </label>
              <label>
                Isi / deskripsi
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Isi lengkap item (glosarium, panduan, atau ringkasan)." />
              </label>
              <label>
                Tautan sumber resmi
                <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" />
              </label>
              <label>
                Dasar hukum (wajib untuk naskah)
                <input value={legalBasis} onChange={(e) => setLegalBasis(e.target.value)} placeholder="Mis. Public domain, Berlisensi, Izin tertulis" />
              </label>
              <label>
                Atribusi / penulis
                <input value={attribution} onChange={(e) => setAttribution(e.target.value)} placeholder="Mis. Georges Méliès, 1902" />
              </label>
              <label>
                Batas penggunaan
                <input value={usageLimits} onChange={(e) => setUsageLimits(e.target.value)} placeholder="Mis. Hanya untuk pembelajaran, bukan komersial" />
              </label>
              <label>
                Tautan gambar (opsional)
                <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://… (gambar ilustrasi item)" />
              </label>
              <button type="submit" className="btn btn-primary">Tambah ke Pustaka</button>
            </form>
          </section>

          <section className="section">
            <h2>Semua Item ({items?.length ?? 0})</h2>
            {!items || items.length === 0 ? (
              <EmptyState message="Pustaka kosong. Belum ada item Pustaka." />
            ) : (
              // LB13: grid kartu (bukan satu kolom sempit) + thumbnail dari
              // image_url bila ada; gambar rusak disembunyikan, bukan kotak rusak.
              <ul className="course-list">
                {items.map((it) => (
                  <li key={it.id} className="course-card">
                    {it.image_url ? (
                      <img
                        src={it.image_url}
                        alt=""
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none'
                        }}
                        style={{ width: '100%', display: 'block', aspectRatio: '16/9', objectFit: 'cover' }}
                      />
                    ) : null}
                    <div className="course-card-body">
                      <p className="muted">
                        {it.category ?? 'Tanpa kategori'}
                        {it.legal_basis ? ` · ${it.legal_basis}` : ''}
                      </p>
                      <h3>
                        <Link to={`/pustaka/${it.id}`}>{it.title}</Link>
                      </h3>
                      {it.attribution && <p className="muted">Atribusi: {it.attribution}</p>}
                      <p>
                        <button
                          type="button"
                          className="btn btn-ghost btn-small"
                          onClick={() => void handleDelete(it.id, it.title)}
                        >
                          Hapus
                        </button>
                      </p>
                    </div>
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
