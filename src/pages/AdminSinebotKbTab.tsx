// SINEVERSE — Admin SINEBOT: tab editor Knowledge Base (Tahap 5).
//
// Dua seksi (Artikel + FAQ) dengan filter status, pencarian, daftar,
// form tambah/edit, ubah status, dan riwayat versi. Semua data lewat
// RPC admin di lib/sinebotKbAdmin.ts — TIDAK ada query langsung ke
// ai_knowledge_base / ai_faq dari client.
//
// Yang SENGAJA tidak ada: tombol hapus permanen. Penghapusan KB bukan
// bagian Tahap 5; "Arsip" hanya perubahan status dan bisa dikembalikan
// ke draft atau diterbitkan lagi. Audience saat edit selalu diisi dari
// nilai yang tersimpan — tidak pernah diubah diam-diam.
//
// Satu busy guard (busyKey) untuk seluruh tab: satu aksi dalam satu
// waktu, klik ganda tidak menjalankan aksi dua kali.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { fmtDate } from '../lib/guarded'
import {
  KB_AUDIENCE_ROLES,
  KB_CATEGORIES,
  getFaq,
  getKbArticle,
  kbAudienceLabel,
  kbStatusLabel,
  listFaqs,
  listKbArticles,
  listKbHistory,
  saveFaq,
  saveKbArticle,
  setKbStatus,
} from '../lib/sinebotKbAdmin'
import type {
  KbAdminArticle,
  KbAdminFaq,
  KbHistoryEntry,
  KbKind,
  KbStatus,
} from '../lib/sinebotKbAdmin'

const PAGE_SIZE = 20

const STATUS_FILTERS: { value: KbStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Semua' },
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Terbit' },
  { value: 'archived', label: 'Arsip' },
]

/** Baris daftar yang diseragamkan antara artikel dan FAQ. */
interface KbRow {
  id: string
  heading: string
  category: string
  status: KbStatus
  audience_roles: string[]
  version: number
  updated_at: string
}

function toRow(kind: KbKind, item: KbAdminArticle | KbAdminFaq): KbRow {
  if (kind === 'article') {
    const a = item as KbAdminArticle
    return {
      id: a.id,
      heading: a.title,
      category: a.category,
      status: a.status,
      audience_roles: a.audience_roles,
      version: a.version,
      updated_at: a.updated_at,
    }
  }
  const f = item as KbAdminFaq
  return {
    id: f.id,
    heading: f.question,
    category: f.category,
    status: f.status,
    audience_roles: f.audience_roles,
    version: f.version,
    updated_at: f.updated_at,
  }
}

function statusPillClass(status: KbStatus): string {
  if (status === 'published') return 'sinebot-kb-pill is-published'
  if (status === 'archived') return 'sinebot-kb-pill is-archived'
  return 'sinebot-kb-pill is-draft'
}

function emptyStateText(kind: KbKind, status: KbStatus | 'all', searching: boolean): string {
  const noun = kind === 'article' ? 'artikel' : 'FAQ'
  if (searching) return `Tidak ada ${noun} yang cocok dengan pencarian ini.`
  if (status === 'draft') return `Belum ada ${noun} draft.`
  if (status === 'published') return `Belum ada ${noun} terbit.`
  if (status === 'archived') return `Belum ada ${noun} arsip.`
  return `Belum ada ${noun}.`
}

interface KbSectionProps {
  kind: KbKind
  busyKey: string | null
  setBusyKey: (key: string | null) => void
}

function KbSection({ kind, busyKey, setBusyKey }: KbSectionProps) {
  const isArticle = kind === 'article'
  const title = isArticle ? 'Artikel' : 'FAQ'
  const headingLabel = isArticle ? 'Judul' : 'Pertanyaan'
  const bodyLabel = isArticle ? 'Isi' : 'Jawaban'
  const addLabel = isArticle ? 'Tambah Artikel' : 'Tambah FAQ'

  const [rows, setRows] = useState<KbRow[]>([])
  const [statusFilter, setStatusFilter] = useState<KbStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Form tambah/edit (null = form tertutup).
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formHeading, setFormHeading] = useState('')
  const [formCategory, setFormCategory] = useState<string>('Umum')
  const [formBody, setFormBody] = useState('')
  const [formAudience, setFormAudience] = useState<string[]>(['guest', 'siswa', 'mentor', 'admin'])
  const [formStatus, setFormStatus] = useState<KbStatus>('draft')
  const [formError, setFormError] = useState<string | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  // Riwayat versi (satu baris terbuka dalam satu waktu per seksi).
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [history, setHistory] = useState<KbHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  // Pencarian didebounce 300 ms (pola AdminTicketsPage) supaya tiap
  // ketikan tidak langsung menembak RPC.
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  async function loadList() {
    setLoading(true)
    setError(null)
    try {
      // Minta satu baris ekstra untuk tahu ada halaman berikut atau tidak.
      const items = isArticle
        ? await listKbArticles(
            statusFilter === 'all' ? null : statusFilter,
            searchDebounced,
            PAGE_SIZE + 1,
            page * PAGE_SIZE,
          )
        : await listFaqs(
            statusFilter === 'all' ? null : statusFilter,
            searchDebounced,
            PAGE_SIZE + 1,
            page * PAGE_SIZE,
          )
      setHasMore(items.length > PAGE_SIZE)
      setRows(items.slice(0, PAGE_SIZE).map((item) => toRow(kind, item)))
    } catch (err) {
      setError(err instanceof Error ? err.message : `Daftar ${title.toLowerCase()} tidak bisa dimuat.`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, searchDebounced, page])

  function resetForm() {
    setEditingId(null)
    setFormHeading('')
    setFormCategory('Umum')
    setFormBody('')
    setFormAudience(['guest', 'siswa', 'mentor', 'admin'])
    setFormStatus('draft')
    setFormError(null)
  }

  function openAddForm() {
    resetForm()
    setFormOpen(true)
    setNotice(null)
  }

  async function openEditForm(id: string) {
    if (busyKey) return
    setFormLoading(true)
    setFormError(null)
    setNotice(null)
    try {
      // Isi penuh hanya tersedia lewat get_* (daftar tidak membawa
      // content/answer); audience diambil dari nilai tersimpan apa adanya.
      if (isArticle) {
        const row = await getKbArticle(id)
        if (!row) {
          setFormError('Artikel tidak ditemukan — mungkin sudah diubah admin lain.')
          return
        }
        setEditingId(row.id)
        setFormHeading(row.title)
        setFormCategory(row.category)
        setFormBody(row.content)
        setFormAudience(row.audience_roles.length > 0 ? row.audience_roles : ['guest'])
        setFormStatus(row.status)
      } else {
        const row = await getFaq(id)
        if (!row) {
          setFormError('FAQ tidak ditemukan — mungkin sudah diubah admin lain.')
          return
        }
        setEditingId(row.id)
        setFormHeading(row.question)
        setFormCategory(row.category)
        setFormBody(row.answer)
        setFormAudience(row.audience_roles.length > 0 ? row.audience_roles : ['guest'])
        setFormStatus(row.status)
      }
      setFormOpen(true)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Entri tidak bisa dibuka untuk diedit.')
    } finally {
      setFormLoading(false)
    }
  }

  function toggleAudience(role: string) {
    setFormAudience((current) =>
      current.includes(role) ? current.filter((r) => r !== role) : [...current, role],
    )
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (busyKey) return
    const key = `save-${kind}-${editingId ?? 'new'}`
    setBusyKey(key)
    setFormError(null)
    try {
      let savedId: string
      if (isArticle) {
        savedId = await saveKbArticle({
          id: editingId,
          title: formHeading,
          category: formCategory,
          content: formBody,
          audience_roles: formAudience,
          status: formStatus,
        })
      } else {
        savedId = await saveFaq({
          id: editingId,
          question: formHeading,
          category: formCategory,
          answer: formBody,
          audience_roles: formAudience,
          status: formStatus,
        })
      }
      // Ambil ulang barisnya untuk menampilkan versi baru yang sah
      // (save RPC hanya mengembalikan id, bukan version).
      const fresh = isArticle ? await getKbArticle(savedId) : await getFaq(savedId)
      const version = fresh ? fresh.version : null
      setFormOpen(false)
      resetForm()
      setNotice(
        version !== null
          ? `${title} tersimpan — versi sekarang: v${version}.` +
              (formStatus === 'published' ? ' Status Terbit: langsung terlihat pengguna.' : '')
          : `${title} tersimpan.`,
      )
      await loadList()
      await refreshHistoryIfOpen(savedId)
    } catch (err) {
      // Termasuk error validasi client-side dari lib (judul/isi kosong,
      // audience kosong) — tampil inline, tanpa menembak RPC.
      setFormError(err instanceof Error ? err.message : `${title} tidak bisa disimpan. Coba lagi.`)
    } finally {
      setBusyKey(null)
    }
  }

  async function handleSetStatus(id: string, next: KbStatus) {
    if (busyKey) return
    const key = `status-${kind}-${id}`
    setBusyKey(key)
    setNotice(null)
    try {
      await setKbStatus(kind, id, next)
      setNotice(`Status diubah menjadi "${kbStatusLabel(next)}".`)
      await loadList()
      await refreshHistoryIfOpen(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status gagal diubah. Coba lagi.')
    } finally {
      setBusyKey(null)
    }
  }

  // Muat ulang riwayat bila panel riwayat baris ini sedang terbuka
  // (dipakai setelah simpan/ubah status supaya tidak basi sampai reload).
  async function refreshHistoryIfOpen(id: string) {
    if (historyId !== id) return
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      setHistory(await listKbHistory(kind, id, 10))
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Riwayat tidak bisa dimuat.')
    } finally {
      setHistoryLoading(false)
    }
  }

  async function toggleHistory(id: string) {
    if (historyId === id) {
      setHistoryId(null)
      setHistory([])
      setHistoryError(null)
      return
    }
    if (busyKey) return
    setHistoryId(id)
    setHistory([])
    setHistoryError(null)
    setHistoryLoading(true)
    try {
      setHistory(await listKbHistory(kind, id, 10))
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Riwayat tidak bisa dimuat.')
    } finally {
      setHistoryLoading(false)
    }
  }

  const busy = busyKey !== null

  return (
    <section className="section" aria-label={title}>
      <h2>{title}</h2>
      {notice && <p className="notice-box">{notice}</p>}

      <form className="form" onSubmit={(e) => e.preventDefault()}>
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as KbStatus | 'all')
              setPage(0)
            }}
            disabled={busy}
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cari {isArticle ? 'judul' : 'pertanyaan'}
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
            placeholder={isArticle ? 'Ketik judul artikel…' : 'Ketik pertanyaan…'}
            disabled={busy}
          />
        </label>
      </form>

      <div className="form-actions">
        <button
          type="button"
          className="btn btn-primary btn-small"
          disabled={busy || formLoading}
          onClick={openAddForm}
        >
          + {addLabel}
        </button>
      </div>

      {formOpen && (
        <form className="form" onSubmit={(e) => void handleSave(e)}>
          <h3>{editingId ? `Edit ${title}` : addLabel}</h3>
          <label>
            {headingLabel}
            <input
              type="text"
              value={formHeading}
              onChange={(e) => setFormHeading(e.target.value)}
              placeholder={isArticle ? 'Judul artikel' : 'Pertanyaan yang sering ditanyakan'}
              maxLength={200}
              disabled={busy}
              required
            />
          </label>
          <label>
            Kategori
            <select
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              disabled={busy}
            >
              {KB_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            {bodyLabel}
            <textarea
              value={formBody}
              onChange={(e) => setFormBody(e.target.value)}
              placeholder={isArticle ? 'Tulis isi panduan…' : 'Tulis jawaban…'}
              rows={10}
              disabled={busy}
              required
            />
          </label>
          <fieldset className="sinebot-kb-fieldset" disabled={busy}>
            <legend>Terlihat oleh (audience)</legend>
            <p className="muted">
              Hanya peran yang dicentang yang bisa melihat entri ini di Pusat Bantuan dan
              jawaban SINEBOT.
            </p>
            <div className="sinebot-kb-checks">
              {KB_AUDIENCE_ROLES.map((role) => (
                <label key={role} className="sinebot-kb-check">
                  <input
                    type="checkbox"
                    checked={formAudience.includes(role)}
                    onChange={() => toggleAudience(role)}
                    disabled={busy}
                  />
                  {kbAudienceLabel(role)}
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            Status
            <select
              value={formStatus}
              onChange={(e) => setFormStatus(e.target.value as KbStatus)}
              disabled={busy}
            >
              <option value="draft">Draft — belum terlihat pengguna</option>
              <option value="published">Terbit — langsung terlihat pengguna</option>
              <option value="archived">Arsip — disembunyikan, bisa dikembalikan</option>
            </select>
            <span className="muted">
              Status “Terbit” langsung terlihat pengguna di Pusat Bantuan dan jawaban
              SINEBOT.
            </span>
          </label>
          {formError && <p className="error-box">{formError}</p>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busyKey === `save-${kind}-${editingId ?? 'new'}` ? 'Menyimpan…' : 'Simpan'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => {
                setFormOpen(false)
                resetForm()
              }}
            >
              Batal
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="muted">Memuat {title.toLowerCase()}…</p>
      ) : error ? (
        <p className="error-box">{error}</p>
      ) : rows.length === 0 ? (
        <p className="empty">
          {emptyStateText(kind, statusFilter, searchDebounced.trim() !== '')}
        </p>
      ) : (
        <>
          <ul className="discussion-list">
            {rows.map((row) => (
              <li key={row.id} className="discussion-item">
                <p className="discussion-meta">
                  <span className={statusPillClass(row.status)}>{kbStatusLabel(row.status)}</span>{' '}
                  · {row.category} · v{row.version} · {fmtDate(row.updated_at)}
                </p>
                <p>
                  <strong>{row.heading}</strong>
                </p>
                <p className="muted">
                  Terlihat oleh:{' '}
                  {row.audience_roles.length > 0
                    ? row.audience_roles.map(kbAudienceLabel).join(', ')
                    : '—'}
                </p>
                <div className="sinebot-kb-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    disabled={busy || formLoading}
                    onClick={() => void openEditForm(row.id)}
                  >
                    {formLoading && editingId === row.id ? 'Membuka…' : 'Edit'}
                  </button>
                  {row.status === 'draft' && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      disabled={busy}
                      onClick={() => void handleSetStatus(row.id, 'published')}
                    >
                      Terbitkan
                    </button>
                  )}
                  {row.status === 'published' && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      disabled={busy}
                      onClick={() => void handleSetStatus(row.id, 'draft')}
                    >
                      Kembalikan ke draft
                    </button>
                  )}
                  {row.status === 'archived' && (
                    <>
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        disabled={busy}
                        onClick={() => void handleSetStatus(row.id, 'published')}
                      >
                        Terbitkan
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        disabled={busy}
                        onClick={() => void handleSetStatus(row.id, 'draft')}
                      >
                        Kembalikan ke draft
                      </button>
                    </>
                  )}
                  {row.status !== 'archived' && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      disabled={busy}
                      onClick={() => void handleSetStatus(row.id, 'archived')}
                    >
                      Arsipkan
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    disabled={busy}
                    onClick={() => void toggleHistory(row.id)}
                    aria-expanded={historyId === row.id}
                  >
                    {historyId === row.id ? 'Tutup Riwayat' : 'Riwayat'}
                  </button>
                </div>
                {historyId === row.id && (
                  <div className="sinebot-kb-history">
                    <h4>Riwayat versi</h4>
                    {historyLoading ? (
                      <p className="muted">Memuat riwayat…</p>
                    ) : historyError ? (
                      <p className="error-box">{historyError}</p>
                    ) : history.length === 0 ? (
                      <p className="muted">Belum ada riwayat perubahan untuk entri ini.</p>
                    ) : (
                      <ul className="sinebot-kb-history-list">
                        {history.map((h, i) => (
                          <li key={`${h.version}-${i}`}>
                            <p className="discussion-meta">
                              v{h.version} · {kbStatusLabel(h.status)} ·{' '}
                              {h.changed_by_name ?? 'Pengubah tidak diketahui'} ·{' '}
                              {fmtDate(h.changed_at)}
                            </p>
                            <p>
                              <strong>{h.title}</strong>
                            </p>
                            <p className="muted sinebot-kb-history-preview">
                              {h.content.length > 200
                                ? `${h.content.slice(0, 200)}…`
                                : h.content || '—'}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary btn-small"
              disabled={page === 0 || loading || busy}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ← Sebelumnya
            </button>
            <span className="muted">Halaman {page + 1}</span>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              disabled={!hasMore || loading || busy}
              onClick={() => setPage((p) => p + 1)}
            >
              Berikutnya →
            </button>
          </div>
        </>
      )}
    </section>
  )
}

export default function AdminSinebotKbTab() {
  // Satu busy guard untuk seluruh tab (kedua seksi berbagi kunci ini).
  const [busyKey, setBusyKey] = useState<string | null>(null)
  return (
    <div>
      <p className="muted">
        Kelola panduan dan FAQ yang dipakai SINEBOT dan Pusat Bantuan. Arsip hanya
        menyembunyikan entri — entri arsip bisa dikembalikan ke draft atau diterbitkan
        lagi. Tidak ada hapus permanen di sini.
      </p>
      <KbSection kind="article" busyKey={busyKey} setBusyKey={setBusyKey} />
      <KbSection kind="faq" busyKey={busyKey} setBusyKey={setBusyKey} />
    </div>
  )
}
