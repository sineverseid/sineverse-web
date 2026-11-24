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

const LIBRARY_IMAGES_BUCKET = 'library-images'
const LIBRARY_FILES_BUCKET = 'library-files'
/** Batas ukuran gambar ilustrasi Pustaka (sama seperti gambar materi lesson). */
const LIBRARY_IMAGE_MAX_BYTES = 10 * 1024 * 1024
/** Batas ukuran lampiran (sama seperti materi lesson: video 100 MB, file 20 MB). */
const LIBRARY_VIDEO_MAX_BYTES = 100 * 1024 * 1024
const LIBRARY_FILE_MAX_BYTES = 20 * 1024 * 1024
const LIBRARY_FILE_EXTENSIONS = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'zip', 'txt']

function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function isVideoName(name: string): boolean {
  return ['mp4', 'webm', 'mov', 'm4v'].includes(fileExtension(name))
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

export default function AdminLibraryPage() {
  const { user, profile } = useAuth()
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
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

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

  function randomId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }

  function sanitizeFileName(name: string): string {
    const base = (name || 'gambar').split(/[\\/]/).pop() || 'gambar'
    return base.replace(/[^a-zA-Z0-9._-]/g, '_')
  }

  function handleImageSelect(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setNotice('File harus berupa gambar.')
      return
    }
    if (file.size > LIBRARY_IMAGE_MAX_BYTES) {
      setNotice('Ukuran gambar maksimal 10 MB.')
      return
    }
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setNotice(null)
  }

  function clearImageSelection() {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImageFile(null)
    setImagePreview(null)
  }

  function handleAttachmentSelect(file: File | undefined) {
    if (!file) return
    const video = file.type.startsWith('video/') || isVideoName(file.name)
    const max = video ? LIBRARY_VIDEO_MAX_BYTES : LIBRARY_FILE_MAX_BYTES
    if (!video && !LIBRARY_FILE_EXTENSIONS.includes(fileExtension(file.name))) {
      setNotice('Jenis file tidak didukung. Pilih video atau dokumen (PDF, Word, PowerPoint, Excel, ZIP, TXT).')
      return
    }
    if (file.size > max) {
      setNotice(`Ukuran ${video ? 'video' : 'file'} maksimal ${formatFileSize(max)}.`)
      return
    }
    if (attachmentPreview) URL.revokeObjectURL(attachmentPreview)
    setAttachmentFile(file)
    setAttachmentPreview(video ? URL.createObjectURL(file) : null)
    setNotice(null)
  }

  function clearAttachmentSelection() {
    if (attachmentPreview) URL.revokeObjectURL(attachmentPreview)
    setAttachmentFile(null)
    setAttachmentPreview(null)
  }

  /** Hapus satu objek dari bucket pustaka (best-effort). */
  async function removeLibraryObject(url: string | null, bucket: string) {
    if (!url || !url.includes(`/${bucket}/`)) return
    const path = url.split(`/${bucket}/`)[1]?.split('?')[0]
    if (!path) return
    try {
      await supabase.storage.from(bucket).remove([path])
    } catch {
      // File yatim di bucket bukan kegagalan hapus item — abaikan.
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    // P64: label "Dasar hukum (wajib untuk naskah)" ditegakkan — kategori
    // "Naskah" di file ini adalah teks bebas (mis. "Naskah", "Naskah Film"),
    // jadi yang dianggap naskah adalah kategori yang mengandung kata naskah.
    if (category.trim().toLowerCase().includes('naskah') && !legalBasis.trim()) {
      setNotice('Dasar hukum wajib diisi untuk kategori Naskah.')
      return
    }
    // Upload dulu, baru insert — bila file dipilih, URL publiknya yang
    // disimpan ke image_url; bila tidak, pakai tautan yang ditempel.
    let imageUrlToSave: string | null = imageUrl.trim() || null
    let attachmentUrlToSave: string | null = null
    let attachmentNameToSave: string | null = null
    if (imageFile || attachmentFile) {
      setUploading(true)
      try {
        if (imageFile) {
          const path = `${randomId()}-${sanitizeFileName(imageFile.name)}`
          const { error: upErr } = await supabase.storage
            .from(LIBRARY_IMAGES_BUCKET)
            .upload(path, imageFile, { upsert: false, contentType: imageFile.type })
          if (upErr) {
            setNotice(`Gambar gagal diunggah (${upErr.message}).`)
            return
          }
          const { data } = supabase.storage.from(LIBRARY_IMAGES_BUCKET).getPublicUrl(path)
          imageUrlToSave = data.publicUrl
        }
        if (attachmentFile) {
          const path = `${randomId()}-${sanitizeFileName(attachmentFile.name)}`
          const { error: upErr } = await supabase.storage
            .from(LIBRARY_FILES_BUCKET)
            .upload(path, attachmentFile, { upsert: false, contentType: attachmentFile.type })
          if (upErr) {
            setNotice(`Lampiran gagal diunggah (${upErr.message}).`)
            return
          }
          const { data } = supabase.storage.from(LIBRARY_FILES_BUCKET).getPublicUrl(path)
          attachmentUrlToSave = data.publicUrl
          attachmentNameToSave = attachmentFile.name
        }
      } finally {
        setUploading(false)
      }
    }
    const { error: insErr } = await supabase.from('library_items').insert({
      title: title.trim(),
      category: category.trim() || null,
      body: body.trim() || null,
      source_url: sourceUrl.trim() || null,
      legal_basis: legalBasis.trim() || null,
      attribution: attribution.trim() || null,
      usage_limits: usageLimits.trim() || null,
      image_url: imageUrlToSave,
      attachment_url: attachmentUrlToSave,
      attachment_name: attachmentNameToSave,
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
    clearImageSelection()
    clearAttachmentSelection()
    await load()
  }

  async function handleDelete(id: string, itemTitle: string, itemImageUrl: string | null, itemAttachmentUrl: string | null) {
    if (!window.confirm(`Hapus "${itemTitle}" dari Pustaka? Tindakan ini tidak bisa dibatalkan.`)) return
    const { error: delErr } = await supabase.from('library_items').delete().eq('id', id)
    if (delErr) {
      setNotice(delErr.message)
      return
    }
    // Best-effort: hapus juga file gambar/lampirannya dari bucket bila berasal dari sana.
    await removeLibraryObject(itemImageUrl, LIBRARY_IMAGES_BUCKET)
    await removeLibraryObject(itemAttachmentUrl, LIBRARY_FILES_BUCKET)
    invalidateCatalogCache()
    setNotice(`"${itemTitle}" dihapus dari Pustaka.`)
    await load()
  }

  // P73: penjaga peran di dalam halaman (pola yang sama seperti halaman
  // admin lain) — jangan hanya mengandalkan RoleRoute di App.tsx.
  if (profile?.role !== 'admin') {
    return (
      <div className="page">
        <h1>Kelola Pustaka</h1>
        <p className="empty">Halaman ini hanya untuk admin.</p>
      </div>
    )
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
                Gambar ilustrasi (upload file)
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageSelect(e.target.files?.[0])}
                />
              </label>
              {imagePreview && (
                <div>
                  <img
                    src={imagePreview}
                    alt="Pratinjau gambar ilustrasi"
                    style={{ width: '100%', display: 'block', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 8 }}
                  />
                  <p>
                    <button type="button" className="btn btn-ghost btn-small" onClick={clearImageSelection}>
                      Hapus gambar pilihan
                    </button>
                  </p>
                </div>
              )}
              <label>
                Tautan gambar (opsional — dipakai bila tidak upload file)
                <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://… (gambar ilustrasi item)" />
              </label>
              <label>
                Lampiran (video atau file)
                <input
                  type="file"
                  accept="video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.txt"
                  onChange={(e) => handleAttachmentSelect(e.target.files?.[0])}
                />
              </label>
              {attachmentPreview && (
                <div>
                  <video src={attachmentPreview} controls style={{ width: '100%', display: 'block', borderRadius: 8 }} />
                  <p>
                    <button type="button" className="btn btn-ghost btn-small" onClick={clearAttachmentSelection}>
                      Hapus lampiran pilihan
                    </button>
                  </p>
                </div>
              )}
              {attachmentFile && !attachmentPreview && (
                <p className="muted">
                  Lampiran dipilih: {attachmentFile.name} ({formatFileSize(attachmentFile.size)})
                  {' '}
                  <button type="button" className="btn btn-ghost btn-small" onClick={clearAttachmentSelection}>
                    Hapus lampiran pilihan
                  </button>
                </p>
              )}
              <button type="submit" className="btn btn-primary" disabled={uploading}>
                {uploading ? 'Mengunggah…' : 'Tambah ke Pustaka'}
              </button>
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
                      {it.attachment_url && (
                        <p className="muted">
                          {isVideoName(it.attachment_name ?? '') ? 'Video' : 'Lampiran'}:{' '}
                          <a href={it.attachment_url} target="_blank" rel="noreferrer">
                            {it.attachment_name ?? 'Unduh lampiran'}
                          </a>
                        </p>
                      )}
                      <p>
                        <button
                          type="button"
                          className="btn btn-ghost btn-small"
                          onClick={() => void handleDelete(it.id, it.title, it.image_url, it.attachment_url)}
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
