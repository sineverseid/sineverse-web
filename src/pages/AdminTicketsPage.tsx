// SINEVERSE — Admin Tiket Bantuan SINEBOT (Tahap 4, frontend).
//
// Halaman admin MINIMAL tapi fungsional: daftar tiket (filter status +
// pencarian + paginasi), detail tiket (isi + lampiran + balasan),
// balas admin (+ lampiran opsional), ubah status, assign ke admin,
// ubah prioritas. Dashboard helpdesk lengkap (metrik/tren) adalah
// Tahap 5 — sengaja TIDAK dibangun di sini.
//
// Pola ditiru dari ModerationPage.tsx (halaman admin paling sederhana):
// guard role di render, WorkspaceNav ADMIN_NAV, kunci busy per aksi
// (B65), nama pemilik diambil best-effort lewat fetchProfileNames.
// Semua data lewat RPC admin di lib/sinebotTicketsAdmin.ts — TIDAK ada
// query langsung ke support_tickets dari client.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { fmtDate, fmtSize } from '../lib/guarded'
import { fetchProfileNames } from '../lib/supabase'
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  assignTicket,
  getTicket,
  listAdmins,
  listTickets,
  replyToTicket,
  setTicketPriority,
  setTicketStatus,
  signedAttachmentUrl,
  ticketPriorityLabel,
  ticketStatusLabel,
  uploadTicketAttachment,
  validateTicketAttachment,
} from '../lib/sinebotTicketsAdmin'
import { checkTicketAttachmentContent } from '../lib/sinebot'
import type {
  AdminListUser,
  TicketAdmin,
  TicketAdminDetail,
  TicketPriority,
  TicketReplyAttachment,
  TicketStatus,
} from '../lib/sinebotTicketsAdmin'
import WorkspaceNav from '../components/WorkspaceNav'
import { ADMIN_NAV } from '../lib/workspaceNav'

const PAGE_SIZE = 20

export default function AdminTicketsPage() {
  const { user, profile } = useAuth()
  const [tickets, setTickets] = useState<TicketAdmin[]>([])
  const [statusFilter, setStatusFilter] = useState<TicketStatus | ''>('')
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [names, setNames] = useState<Map<string, string>>(new Map())
  // B65: satu kunci busy untuk semua aksi — klik ganda tidak
  // menjalankan aksi dua kali.
  const [busyKey, setBusyKey] = useState<string | null>(null)

  // Detail tiket yang sedang dibuka (null = tampilan daftar).
  const [detail, setDetail] = useState<TicketAdminDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [admins, setAdmins] = useState<AdminListUser[]>([])
  const [replyText, setReplyText] = useState('')
  const [replyFile, setReplyFile] = useState<File | null>(null)
  const [replyFileError, setReplyFileError] = useState<string | null>(null)
  const [openingAttachment, setOpeningAttachment] = useState<string | null>(null)

  // Pencarian didebounce 300 ms (pola AdminPage) supaya tiap ketikan
  // tidak langsung menembak RPC.
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  async function loadList() {
    setLoading(true)
    setError(null)
    try {
      // Minta satu baris ekstra untuk tahu ada halaman berikut atau tidak.
      const rows = await listTickets(
        statusFilter === '' ? null : statusFilter,
        searchDebounced,
        PAGE_SIZE + 1,
        page * PAGE_SIZE,
      )
      setHasMore(rows.length > PAGE_SIZE)
      setTickets(rows.slice(0, PAGE_SIZE))
      // Nama pemilik + penerima tugas, best-effort (gagal = fallback).
      const ids = [...new Set(rows.flatMap((r) => [r.user_id, r.assigned_to]).filter((id): id is string => Boolean(id)))]
      if (ids.length > 0) {
        const map = await fetchProfileNames(ids).catch(() => new Map<string, string>())
        setNames(map)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar tiket.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, searchDebounced, page])

  // Daftar admin untuk dropdown assignment — dimuat sekali saat detail
  // pertama kali dibuka (bukan di daftar, supaya daftar tetap ringan).
  async function ensureAdmins() {
    if (admins.length > 0) return
    try {
      setAdmins(await listAdmins())
    } catch {
      // Dropdown assignment tetap tampil (kosong) — error dilaporkan
      // saat admin mencoba menetapkan, bukan saat membuka detail.
      setAdmins([])
    }
  }

  async function openTicket(ticket: TicketAdmin) {
    setDetail(null)
    setDetailError(null)
    setDetailLoading(true)
    setReplyText('')
    setReplyFile(null)
    setReplyFileError(null)
    setNotice(null)
    try {
      const [data] = await Promise.all([getTicket(ticket.id), ensureAdmins()])
      setDetail(data)
      // Nama pengirim balasan (admin/pengguna) best-effort.
      const senderIds = [...new Set(data.messages.map((m) => m.sender_id).filter((id): id is string => Boolean(id)))]
      if (senderIds.length > 0) {
        const map = await fetchProfileNames(senderIds).catch(() => new Map<string, string>())
        setNames((prev) => new Map([...prev, ...map]))
      }
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Gagal membuka tiket.')
    } finally {
      setDetailLoading(false)
    }
  }

  async function reloadDetail() {
    if (!detail) return
    try {
      setDetail(await getTicket(detail.ticket.id))
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Gagal memuat ulang tiket.')
    }
  }

  function ownerName(t: TicketAdmin): string {
    return names.get(t.user_id) ?? 'Pengguna'
  }

  async function openAttachment(path: string, label: string) {
    if (openingAttachment) return
    setOpeningAttachment(path)
    try {
      const url = await signedAttachmentUrl(path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : `Lampiran "${label}" tidak bisa dibuka.`)
    } finally {
      setOpeningAttachment(null)
    }
  }

  async function onReplyFileChange(file: File | null) {
    setReplyFileError(null)
    if (!file) {
      setReplyFile(null)
      return
    }
    const problem = validateTicketAttachment(file)
    if (problem) {
      setReplyFileError(problem)
      setReplyFile(null)
      return
    }
    const contentProblem = await checkTicketAttachmentContent(file)
    if (contentProblem) {
      setReplyFileError(contentProblem)
      setReplyFile(null)
      return
    }
    setReplyFile(file)
  }

  async function handleReply(e: FormEvent) {
    e.preventDefault()
    if (!detail || !user || busyKey) return
    const key = `reply-${detail.ticket.id}`
    setBusyKey(key)
    try {
      // Lampiran diunggah dulu (bila ada), lalu RPC dipanggil dengan
      // metadata-nya — sesuai kontrak reply_to_sinebot_ticket.
      let attachment: TicketReplyAttachment | null = null
      if (replyFile) attachment = await uploadTicketAttachment(user.id, replyFile)
      await replyToTicket(detail.ticket.id, replyText, attachment)
      setNotice('Balasan terkirim. Pemilik tiket diberi tahu.')
      setReplyText('')
      setReplyFile(null)
      await reloadDetail()
      await loadList()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Balasan gagal terkirim. Coba lagi.')
    } finally {
      setBusyKey(null)
    }
  }

  async function handleStatusChange(next: TicketStatus) {
    if (!detail || busyKey) return
    const key = `status-${detail.ticket.id}`
    setBusyKey(key)
    try {
      await setTicketStatus(detail.ticket.id, next)
      setNotice(`Status tiket diubah menjadi "${ticketStatusLabel(next)}".`)
      await reloadDetail()
      await loadList()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Status gagal diubah. Coba lagi.')
    } finally {
      setBusyKey(null)
    }
  }

  async function handleAssign(assigneeId: string) {
    if (!detail || busyKey || !assigneeId) return
    const key = `assign-${detail.ticket.id}`
    setBusyKey(key)
    try {
      await assignTicket(detail.ticket.id, assigneeId)
      const name = admins.find((a) => a.id === assigneeId)?.name ?? 'admin'
      setNotice(`Tiket ditugaskan ke ${name}.`)
      await reloadDetail()
      await loadList()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Tiket gagal ditugaskan. Coba lagi.')
    } finally {
      setBusyKey(null)
    }
  }

  async function handlePriorityChange(next: TicketPriority) {
    if (!detail || busyKey) return
    const key = `priority-${detail.ticket.id}`
    setBusyKey(key)
    try {
      await setTicketPriority(detail.ticket.id, next)
      setNotice(`Prioritas tiket diubah menjadi "${ticketPriorityLabel(next)}".`)
      await reloadDetail()
      await loadList()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Prioritas gagal diubah. Coba lagi.')
    } finally {
      setBusyKey(null)
    }
  }

  if (profile?.role !== 'admin') {
    return (
      <div className="page">
        <h1>Tiket Bantuan</h1>
        <p className="empty">Halaman ini hanya untuk admin.</p>
      </div>
    )
  }

  const ticket = detail?.ticket ?? null
  const isClosed = ticket?.status === 'closed'

  return (
    <div className="page">
      <h1>Tiket Bantuan</h1>
      <WorkspaceNav entries={ADMIN_NAV} />
      {notice && <p className="notice-box">{notice}</p>}

      {detailLoading ? (
        <p className="muted">Memuat tiket…</p>
      ) : detailError ? (
        <section className="section">
          <p className="error-box">{detailError}</p>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => { setDetailError(null); setDetail(null) }}>
            ← Kembali ke daftar
          </button>
        </section>
      ) : ticket && detail ? (
        <section className="section">
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => { setDetail(null); setDetailError(null) }}
          >
            ← Kembali ke daftar
          </button>
          <h2>{ticket.subject}</h2>
          <dl className="profile-list">
            <div><dt>Pemilik</dt><dd>{ownerName(ticket)}</dd></div>
            <div><dt>ID pemilik</dt><dd className="muted" style={{ wordBreak: 'break-all' }}>{ticket.user_id}</dd></div>
            <div><dt>Status</dt><dd>{ticketStatusLabel(ticket.status)}</dd></div>
            <div><dt>Prioritas</dt><dd>{ticketPriorityLabel(ticket.priority)}</dd></div>
            {ticket.category && <div><dt>Kategori</dt><dd>{ticket.category}</dd></div>}
            <div><dt>Ditugaskan ke</dt><dd>{ticket.assigned_to ? (names.get(ticket.assigned_to) ?? admins.find((a) => a.id === ticket.assigned_to)?.name ?? 'Admin') : 'Belum ditugaskan'}</dd></div>
            <div><dt>Dibuat</dt><dd>{fmtDate(ticket.created_at)}</dd></div>
            <div><dt>Terakhir diubah</dt><dd>{fmtDate(ticket.updated_at)}</dd></div>
          </dl>

          <h3>Isi tiket</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{ticket.description || '—'}</p>
          {ticket.attachment && (
            <p>
              Lampiran:{' '}
              <button
                type="button"
                className="btn btn-ghost btn-small"
                disabled={openingAttachment === ticket.attachment.path}
                onClick={() => {
                  const att = ticket.attachment
                  if (att) void openAttachment(att.path, att.name)
                }}
              >
                {openingAttachment === ticket.attachment.path ? 'Membuka…' : ticket.attachment.name}
                {ticket.attachment.size ? ` (${fmtSize(ticket.attachment.size)})` : ''}
              </button>
            </p>
          )}

          <h3>Balasan ({detail.messages.length})</h3>
          {detail.messages.length === 0 ? (
            <p className="empty">Belum ada balasan.</p>
          ) : (
            <ul className="discussion-list">
              {detail.messages.map((m) => {
                const att = m.attachment
                const senderDisplay = m.sender_name ?? (m.sender_id ? names.get(m.sender_id) ?? '' : '')
                return (
                <li key={m.id} className="discussion-item">
                  <p className="discussion-meta">
                    {m.sender_type === 'admin' ? 'Admin' : 'Pengguna'}
                    {senderDisplay ? ` · ${senderDisplay}` : ''} · {fmtDate(m.created_at)}
                  </p>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{m.content || '—'}</p>
                  {att && (
                    <p>
                      Lampiran:{' '}
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        disabled={openingAttachment === att.path}
                        onClick={() => void openAttachment(att.path, att.name)}
                      >
                        {openingAttachment === att.path ? 'Membuka…' : att.name}
                        {att.size ? ` (${fmtSize(att.size)})` : ''}
                      </button>
                    </p>
                  )}
                </li>
                )
              })}
            </ul>
          )}

          <h3>Balas sebagai admin</h3>
          {isClosed ? (
            <p className="empty">Tiket ini sudah ditutup — balasan tidak bisa ditambahkan lagi.</p>
          ) : (
            <form className="form" onSubmit={handleReply}>
              <label>
                Balasan
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={4}
                  required
                  placeholder="Tulis balasan untuk pemilik tiket…"
                />
              </label>
              <label>
                Lampiran (opsional — gambar JPG/PNG/WebP atau PDF, maks 5 MB)
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  onChange={(e) => onReplyFileChange(e.target.files?.[0] ?? null)}
                />
              </label>
              {replyFileError && <p className="error-box">{replyFileError}</p>}
              {replyFile && <p className="muted">Lampiran: {replyFile.name} ({fmtSize(replyFile.size)})</p>}
              <button type="submit" className="btn btn-primary" disabled={busyKey !== null}>
                {busyKey === `reply-${ticket.id}` ? 'Mengirim…' : 'Kirim Balasan'}
              </button>
            </form>
          )}

          <h3>Kelola tiket</h3>
          <form className="form" onSubmit={(e) => e.preventDefault()}>
            <label>
              Status
              <select
                value={ticket.status}
                disabled={isClosed || busyKey !== null}
                onChange={(e) => void handleStatusChange(e.target.value as TicketStatus)}
                style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
              >
                {TICKET_STATUSES.map((s) => (
                  <option key={s} value={s}>{ticketStatusLabel(s)}</option>
                ))}
              </select>
            </label>
            {isClosed && (
              <p className="muted">Tiket yang sudah ditutup tidak bisa diubah lagi statusnya.</p>
            )}
            <label>
              Tugaskan ke admin
              <select
                value={ticket.assigned_to ?? ''}
                disabled={isClosed || busyKey !== null}
                onChange={(e) => void handleAssign(e.target.value)}
                style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
              >
                <option value="">— Belum ditugaskan —</option>
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>
            {admins.length === 0 && (
              <p className="muted">Daftar admin belum termuat — coba buka ulang tiket ini bila dropdown kosong.</p>
            )}
            <label>
              Prioritas
              <select
                value={ticket.priority}
                disabled={isClosed || busyKey !== null}
                onChange={(e) => void handlePriorityChange(e.target.value as TicketPriority)}
                style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
              >
                {TICKET_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{ticketPriorityLabel(p)}</option>
                ))}
              </select>
            </label>
          </form>
          <p className="muted">
            Mengubah status/prioritas/penugasan langsung tersimpan dan pemilik tiket diberi tahu.
          </p>
        </section>
      ) : (
        <section className="section">
          <h2>Daftar Tiket</h2>
          <form className="form" onSubmit={(e) => e.preventDefault()}>
            <label>
              Status
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value as TicketStatus | ''); setPage(0) }}
                style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
              >
                <option value="">Semua status</option>
                {TICKET_STATUSES.map((s) => (
                  <option key={s} value={s}>{ticketStatusLabel(s)}</option>
                ))}
              </select>
            </label>
            <label>
              Cari subjek / deskripsi
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0) }}
                placeholder="Ketik kata kunci…"
              />
            </label>
          </form>
          {loading ? (
            <p className="muted">Memuat tiket…</p>
          ) : error ? (
            <p className="error-box">{error}</p>
          ) : tickets.length === 0 ? (
            <p className="empty">
              {statusFilter !== '' || searchDebounced.trim() !== ''
                ? 'Tidak ada tiket yang cocok dengan filter ini.'
                : 'Belum ada tiket bantuan.'}
            </p>
          ) : (
            <>
              <ul className="discussion-list">
                {tickets.map((t) => (
                  <li key={t.id} className="discussion-item">
                    <p className="discussion-meta">
                      {ticketStatusLabel(t.status)} · {ticketPriorityLabel(t.priority)} · {fmtDate(t.created_at)}
                    </p>
                    <p>
                      <strong>{t.subject}</strong>
                    </p>
                    <p className="muted">
                      {ownerName(t)}
                      {t.assigned_to ? ` · Ditugaskan ke ${names.get(t.assigned_to) ?? 'admin'}` : ' · Belum ditugaskan'}
                    </p>
                    <p>{t.description.length > 160 ? `${t.description.slice(0, 160)}…` : t.description || '—'}</p>
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => void openTicket(t)}>
                      Buka Tiket →
                    </button>
                  </li>
                ))}
              </ul>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  disabled={page === 0 || loading}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  ← Sebelumnya
                </button>
                <span className="muted">Halaman {page + 1}</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  disabled={!hasMore || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Berikutnya →
                </button>
              </div>
            </>
          )}
          {/* Link reload manual: daftar ikut dimuat ulang otomatis tiap
              filter/halaman berubah; tombol ini untuk setelah aksi di
              detail (balas/ubah status) tanpa menunggu reload otomatis. */}
          <p>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              disabled={loading}
              onClick={() => void loadList()}
            >
              Muat ulang daftar
            </button>
          </p>
        </section>
      )}
    </div>
  )
}
