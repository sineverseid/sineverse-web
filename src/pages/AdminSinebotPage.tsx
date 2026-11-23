// SINEVERSE — Konsol SINEBOT & Helpdesk (Tahap 5, frontend).
//
// Shell admin: tab via query param ?tab= (pola yang sama seperti
// HelpCenterPage ?tab=tiket, supaya tautan per tab bisa dibagikan dan
// tetap membuka tab yang sama setelah refresh). Tab:
// overview | tiket | kb | percakapan | kualitas | pengaturan | audit.
// Default: overview.
//
// Tab Tiket me-render AdminTicketsPage (Tahap 4) apa adanya — TIDAK
// ditulis ulang, TIDAK dibungkus logika tambahan selain container.
// Tab KB / Kualitas / Pengaturan me-render komponen Worker C
// (AdminSinebotKbTab, AdminSinebotQualityTab, AdminSinebotSettingsTab)
// yang self-contained dan mengambil datanya sendiri.
//
// Pola ditiru dari AdminTicketsPage.tsx: guard role di render,
// WorkspaceNav ADMIN_NAV, satu kunci busy per aksi (B65), semua teks
// Bahasa Indonesia. Semua angka Overview dari query nyata (migrasi
// 054); bila 0, tampil 0 + empty state jujur — tidak ada angka contoh.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fmtDate, fmtDateOnly } from '../lib/guarded'
import { fetchProfileNames } from '../lib/supabase'
import {
  getSinebotOverview,
  getSinebotTimeseries,
  getSupportMessages,
  listSinebotAudit,
  listSupportConversations,
} from '../lib/sinebotAdmin'
import type {
  AuditRow,
  SinebotOverview,
  SupportConversation,
  SupportMessage,
  TimeseriesRow,
} from '../lib/sinebotAdmin'
import { ticketStatusLabel } from '../lib/sinebotTicketsAdmin'
import WorkspaceNav from '../components/WorkspaceNav'
import { ADMIN_NAV } from '../lib/workspaceNav'
import AdminTicketsPage from './AdminTicketsPage'
import AdminSinebotKbTab from './AdminSinebotKbTab'
import AdminSinebotQualityTab from './AdminSinebotQualityTab'
import AdminSinebotSettingsTab from './AdminSinebotSettingsTab'

const TABS = [
  { id: 'overview', label: 'Ringkasan' },
  { id: 'tiket', label: 'Tiket' },
  { id: 'kb', label: 'Basis Pengetahuan' },
  { id: 'percakapan', label: 'Percakapan' },
  { id: 'kualitas', label: 'Kualitas' },
  { id: 'pengaturan', label: 'Pengaturan' },
  { id: 'audit', label: 'Audit Log' },
] as const

type TabId = (typeof TABS)[number]['id']

function isTabId(value: string | null): value is TabId {
  return TABS.some((t) => t.id === value)
}

function roleLabel(roleContext: string): string {
  if (roleContext === 'siswa') return 'Siswa'
  if (roleContext === 'mentor') return 'Mentor'
  if (roleContext === 'admin') return 'Admin'
  return 'Tamu'
}

function conversationStatusLabel(status: string): string {
  if (status === 'open') return 'Terbuka'
  if (status === 'closed') return 'Ditutup'
  return status
}

function senderLabel(senderType: string): string {
  if (senderType === 'ai') return 'SINEBOT'
  if (senderType === 'system') return 'Sistem'
  return 'Pengguna'
}

function shortUserId(userId: string): string {
  return userId.length > 8 ? `${userId.slice(0, 8)}…` : userId
}

/** Ringkasan detail JSON audit yang dipotong — cukup untuk mengenali aksi. */
function shortDetail(detail: unknown): string {
  if (detail === null || detail === undefined) return '—'
  const text = typeof detail === 'string' ? detail : JSON.stringify(detail)
  return text.length > 200 ? `${text.slice(0, 200)}…` : text
}

// ---------------------------------------------------------------------------
// Tab Ringkasan
// ---------------------------------------------------------------------------

function OverviewTab() {
  const [overview, setOverview] = useState<SinebotOverview | null>(null)
  const [timeseries, setTimeseries] = useState<TimeseriesRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [ov, ts] = await Promise.all([getSinebotOverview(), getSinebotTimeseries(14)])
      setOverview(ov)
      setTimeseries(ts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat ringkasan SINEBOT.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return <p className="muted">Memuat ringkasan…</p>
  if (error || !overview) {
    return (
      <section className="section">
        <p className="error-box">{error ?? 'Ringkasan SINEBOT tidak bisa dibaca.'}</p>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => void load()}>
          Coba lagi
        </button>
      </section>
    )
  }

  const totalFeedback = overview.feedback_helpful + overview.feedback_not_helpful
  const rate = overview.feedback_helpful_rate
  const rateText =
    rate === null || totalFeedback === 0
      ? 'Belum ada umpan balik'
      : `${(rate > 1 ? rate : rate * 100).toFixed(0)}% membantu (${overview.feedback_helpful} dari ${totalFeedback})`
  const maxConversations = timeseries.reduce((m, r) => Math.max(m, r.conversations), 0)
  const statusEntries = Object.entries(overview.tickets_by_status)
  const categoryEntries = Object.entries(overview.tickets_by_category)

  return (
    <>
      <section className="section">
        <h2>Angka utama</h2>
        {overview.conversations_total === 0 && overview.messages_total === 0 ? (
          <p className="empty">Belum ada percakapan SINEBOT.</p>
        ) : null}
        <div className="sinebot-admin-stats">
          <div className="sinebot-admin-stat">
            <div className="sinebot-admin-num">{overview.conversations_total}</div>
            <div className="sinebot-admin-label">Percakapan total</div>
          </div>
          <div className="sinebot-admin-stat">
            <div className="sinebot-admin-num">{overview.conversations_today}</div>
            <div className="sinebot-admin-label">Percakapan hari ini</div>
          </div>
          <div className="sinebot-admin-stat">
            <div className="sinebot-admin-num">{overview.messages_total}</div>
            <div className="sinebot-admin-label">Pesan total</div>
          </div>
          <div className="sinebot-admin-stat">
            <div className="sinebot-admin-num">{overview.tickets_open}</div>
            <div className="sinebot-admin-label">Tiket terbuka</div>
          </div>
          <div className="sinebot-admin-stat">
            <div className="sinebot-admin-num">{overview.tickets_critical}</div>
            <div className="sinebot-admin-label">Tiket kritis</div>
          </div>
          <div className="sinebot-admin-stat">
            <div className="sinebot-admin-num">{overview.kb_published}</div>
            <div className="sinebot-admin-label">Artikel KB terbit</div>
          </div>
          <div className="sinebot-admin-stat">
            <div className="sinebot-admin-num">{overview.kb_draft}</div>
            <div className="sinebot-admin-label">Artikel KB draft</div>
          </div>
          <div className="sinebot-admin-stat">
            <div className="sinebot-admin-num">{overview.kb_archived}</div>
            <div className="sinebot-admin-label">Artikel KB arsip</div>
          </div>
          <div className="sinebot-admin-stat">
            <div className="sinebot-admin-num">
              {overview.faq_published}/{overview.faq_draft}/{overview.faq_archived}
            </div>
            <div className="sinebot-admin-label">FAQ terbit / draft / arsip</div>
          </div>
        </div>
        <p className="muted">
          Umpan balik: {rateText}
          {overview.tickets_avg_resolution_hours !== null
            ? ` · Rata-rata penyelesaian tiket ±${overview.tickets_avg_resolution_hours.toFixed(1)} jam (perkiraan dari updated_at).`
            : ' · Rata-rata penyelesaian tiket belum bisa dihitung.'}
        </p>
        <p>
          <button type="button" className="btn btn-ghost btn-small" disabled={loading} onClick={() => void load()}>
            Muat ulang ringkasan
          </button>
        </p>
      </section>

      <section className="section">
        <h2>Percakapan 14 hari terakhir</h2>
        {timeseries.length === 0 ? (
          <p className="empty">Belum ada data tren 14 hari terakhir.</p>
        ) : (
          <>
            <div className="sinebot-admin-bars" role="img" aria-label="Grafik batang percakapan 14 hari terakhir">
              {timeseries.map((row) => (
                <div key={row.day} className="sinebot-admin-bar-wrap" title={`${fmtDateOnly(row.day)}: ${row.conversations} percakapan, ${row.messages} pesan, ${row.tickets} tiket`}>
                  <span className="muted" style={{ fontSize: '0.7rem' }}>
                    {row.conversations > 0 ? row.conversations : ''}
                  </span>
                  <div
                    className="sinebot-admin-bar"
                    style={{ height: maxConversations > 0 ? `${Math.max(4, (row.conversations / maxConversations) * 100)}%` : '4%' }}
                  />
                  <span className="sinebot-admin-bar-label">{row.day.slice(5)}</span>
                </div>
              ))}
            </div>
            <p className="muted">Batang = jumlah percakapan per hari. Arahkan kursor ke batang untuk melihat pesan dan tiket hari itu.</p>
          </>
        )}
      </section>

      <section className="section">
        <h2>Tiket per status</h2>
        {statusEntries.length === 0 ? (
          <p className="empty">Belum ada tiket.</p>
        ) : (
          <table className="sinebot-admin-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {statusEntries.map(([status, count]) => (
                <tr key={status}>
                  <td>{ticketStatusLabel(status)}</td>
                  <td>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="section">
        <h2>Tiket per kategori</h2>
        {categoryEntries.length === 0 ? (
          <p className="empty">Belum ada tiket berkategori.</p>
        ) : (
          <table className="sinebot-admin-table">
            <thead>
              <tr>
                <th>Kategori</th>
                <th>Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {categoryEntries.map(([category, count]) => (
                <tr key={category}>
                  <td>{category || '—'}</td>
                  <td>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="section">
        <h2>Status layanan</h2>
        <p>
          <strong>{overview.service_status || 'operasional'}</strong>
        </p>
        <p className="muted">
          Status ini statis dari ringkasan server, bukan hasil probe kesehatan live — tidak ada pemeriksaan
          ke Edge Function atau provider AI saat halaman ini dibuka.
        </p>
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------
// Tab Percakapan (dukungan)
// ---------------------------------------------------------------------------

const CONVERSATION_PAGE_SIZE = 20

function ConversationsTab() {
  const [rows, setRows] = useState<SupportConversation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [names, setNames] = useState<Map<string, string>>(new Map())
  // B65: satu kunci busy — klik ganda tidak membuka percakapan dua kali.
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesError, setMessagesError] = useState<string | null>(null)

  async function loadList() {
    setLoading(true)
    setError(null)
    try {
      const data = await listSupportConversations()
      setRows(data)
      const ids = [...new Set(data.map((r) => r.user_id).filter((id): id is string => Boolean(id)))]
      if (ids.length > 0) {
        const map = await fetchProfileNames(ids).catch(() => new Map<string, string>())
        setNames(map)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar percakapan.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function ownerLabel(c: SupportConversation): string {
    if (c.owner_name) return c.owner_name
    if (c.user_id) return names.get(c.user_id) ?? `Pengguna ${shortUserId(c.user_id)}`
    return 'Tamu'
  }

  async function openConversation(c: SupportConversation) {
    if (busyKey) return
    const key = `conv-${c.id}`
    setBusyKey(key)
    setSelectedId(c.id)
    setMessages([])
    setMessagesError(null)
    setMessagesLoading(true)
    try {
      setMessages(await getSupportMessages(c.id))
    } catch (err) {
      setMessagesError(err instanceof Error ? err.message : 'Gagal memuat pesan percakapan.')
    } finally {
      setMessagesLoading(false)
      setBusyKey(null)
    }
  }

  const selected = rows.find((r) => r.id === selectedId) ?? null

  return (
    <section className="section">
      <h2>Daftar Percakapan</h2>
      <p className="notice-box">
        Akses ini hanya untuk dukungan dan TERCATAT di audit log.
      </p>
      {loading ? (
        <p className="muted">Memuat percakapan…</p>
      ) : error ? (
        <>
          <p className="error-box">{error}</p>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => void loadList()}>
            Coba lagi
          </button>
        </>
      ) : rows.length === 0 ? (
        <p className="empty">Belum ada percakapan SINEBOT.</p>
      ) : (
        <ul className="discussion-list">
          {rows.slice(0, CONVERSATION_PAGE_SIZE).map((c) => (
            <li key={c.id} className="discussion-item">
              <p className="discussion-meta">
                {roleLabel(c.role_context)} · {conversationStatusLabel(c.status)} · {fmtDate(c.updated_at)}
              </p>
              <p>
                <strong>{c.title || 'Percakapan baru'}</strong>
              </p>
              <p className="muted">
                {ownerLabel(c)} · Dibuat {fmtDate(c.created_at)}
              </p>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                disabled={busyKey !== null}
                onClick={() => void openConversation(c)}
              >
                {busyKey === `conv-${c.id}` ? 'Membuka…' : 'Buka Percakapan →'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows.length > CONVERSATION_PAGE_SIZE && (
        <p className="muted">Menampilkan {CONVERSATION_PAGE_SIZE} percakapan terbaru dari {rows.length}.</p>
      )}
      <p>
        <button type="button" className="btn btn-ghost btn-small" disabled={loading} onClick={() => void loadList()}>
          Muat ulang daftar
        </button>
      </p>

      {selected && (
        <section className="section">
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => { setSelectedId(null); setMessages([]); setMessagesError(null) }}
          >
            ← Kembali ke daftar
          </button>
          <h3>{selected.title || 'Percakapan baru'}</h3>
          <p className="muted">
            {ownerLabel(selected)}
            {roleLabel(selected.role_context) !== ownerLabel(selected) ? ` · ${roleLabel(selected.role_context)}` : ''}
            {' · '}
            {conversationStatusLabel(selected.status)} ·{' '}
            {fmtDate(selected.created_at)}
          </p>
          {messagesLoading ? (
            <p className="muted">Memuat pesan…</p>
          ) : messagesError ? (
            <p className="error-box">{messagesError}</p>
          ) : messages.length === 0 ? (
            <p className="empty">Percakapan ini belum berisi pesan.</p>
          ) : (
            <ul className="discussion-list">
              {messages.map((m) => (
                <li key={m.id} className="discussion-item">
                  <p className="discussion-meta">
                    {senderLabel(m.sender_type)} · {fmtDate(m.created_at)}
                  </p>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{m.content || '—'}</p>
                  {m.sources.length > 0 && (
                    <p>
                      {m.sources.map((s) => (
                        <span key={s.id} className="sinebot-admin-chip" title={s.kind === 'faq' ? 'FAQ' : 'Artikel'}>
                          {s.title}
                        </span>
                      ))}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Tab Audit Log
// ---------------------------------------------------------------------------

const AUDIT_PAGE_SIZE = 20

function AuditTab() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [actionInput, setActionInput] = useState('')
  const [actionFilter, setActionFilter] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load(nextOffset: number, append: boolean, action: string | null) {
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError(null)
    try {
      const { rows: data, hasMore: more } = await listSinebotAudit(action, AUDIT_PAGE_SIZE, nextOffset)
      setRows((prev) => (append ? [...prev, ...data] : data))
      setHasMore(more)
      setOffset(nextOffset)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat audit log.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    void load(0, false, null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function applyFilter(e: FormEvent) {
    e.preventDefault()
    const action = actionInput.trim() === '' ? null : actionInput.trim()
    setActionFilter(action)
    void load(0, false, action)
  }

  if (loading) return <p className="muted">Memuat audit log…</p>
  if (error) {
    return (
      <section className="section">
        <p className="error-box">{error}</p>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => void load(0, false, actionFilter)}>
          Coba lagi
        </button>
      </section>
    )
  }

  return (
    <section className="section">
      <h2>Audit Log SINEBOT</h2>
      <form className="form" onSubmit={applyFilter}>
        <label>
          Filter aksi (mis. sinebot_conversation_viewed)
          <input
            value={actionInput}
            onChange={(e) => setActionInput(e.target.value)}
            placeholder="Ketik nama aksi, kosongkan untuk semua…"
          />
        </label>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-small" disabled={loading}>
            Terapkan
          </button>
          {actionFilter && (
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => { setActionInput(''); setActionFilter(null); void load(0, false, null) }}
            >
              Hapus filter
            </button>
          )}
        </div>
      </form>
      {rows.length === 0 ? (
        <p className="empty">
          {actionFilter ? 'Tidak ada entri audit untuk aksi ini.' : 'Belum ada entri audit log SINEBOT.'}
        </p>
      ) : (
        <ul className="list">
          {rows.map((a) => (
            <li key={a.id}>
              <strong>{fmtDate(a.created_at)}</strong> — {a.action}
              {a.actor_name ? ` oleh ${a.actor_name}` : a.actor_id ? ' oleh admin' : ' oleh Sistem'}
              {a.target_type ? ` (${a.target_type}${a.target_id ? `: ${shortUserId(a.target_id)}` : ''})` : ''}
              <br />
              <span className="muted">{shortDetail(a.detail)}</span>
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <p>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            disabled={loadingMore}
            onClick={() => void load(offset + AUDIT_PAGE_SIZE, true, actionFilter)}
          >
            {loadingMore ? 'Memuat…' : 'Muat lebih banyak'}
          </button>
        </p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export default function AdminSinebotPage() {
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: TabId = isTabId(searchParams.get('tab')) ? (searchParams.get('tab') as TabId) : 'overview'

  function setTab(next: TabId) {
    setSearchParams({ tab: next })
  }

  if (profile?.role !== 'admin') {
    return (
      <div className="page">
        <h1>SINEBOT &amp; Helpdesk</h1>
        <p className="empty">Halaman ini hanya untuk admin.</p>
      </div>
    )
  }

  return (
    <div className="page">
      <h1>SINEBOT &amp; Helpdesk</h1>
      <p className="muted">
        Konsol admin untuk asisten SINEBOT: ringkasan pemakaian, tiket bantuan, basis pengetahuan,
        percakapan dukungan, kualitas jawaban, pengaturan, dan audit log.
      </p>
      <WorkspaceNav entries={ADMIN_NAV} />
      <div className="pill-tabs" role="tablist" aria-label="Bagian konsol SINEBOT">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`pill-tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'tiket' && (
        <div>
          <AdminTicketsPage />
        </div>
      )}
      {tab === 'kb' && <AdminSinebotKbTab />}
      {tab === 'percakapan' && <ConversationsTab />}
      {tab === 'kualitas' && <AdminSinebotQualityTab />}
      {tab === 'pengaturan' && <AdminSinebotSettingsTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  )
}
