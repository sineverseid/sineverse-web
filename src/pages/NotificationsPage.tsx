// SINEVERSE — Notification Center (Fase 1): pusat notifikasi terpadu.
// Daftar + pencarian + filter kategori/status + kelompok tanggal (WIB) +
// tandai satu/semua dibaca + bersihkan permanen + realtime + infinite scroll.
// Sumber: tabel notifications (migrasi 008); tanpa data dummy.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/icons'
import type { IconName } from '../components/icons'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'
import {
  deleteNotifications,
  fetchNotificationsPaged,
  fetchProfileNames,
  fetchUnreadCount,
  isImportantNotification,
  markAllNotificationsRead,
  markNotificationRead,
  notificationCategory,
  notifyNotificationsRead,
  subscribeToNotifications,
} from '../lib/supabase'
import type { NotificationCategory } from '../lib/supabase'
import type { AppNotification } from '../lib/types'

const PAGE_SIZE = 30

/** Label jenis notifikasi berbahasa Indonesia (P49) — kind mentah
    ('discussion', 'grade', …) tidak lagi dicetak apa adanya. Kind yang
    belum dikenal dirapikan dari snake_case supaya tetap terbaca. */
const KIND_LABELS: Record<string, string> = {
  discussion: 'Diskusi',
  grade: 'Nilai',
  revision: 'Revisi',
  claim_approved: 'Pengajuan Disetujui',
  claim_rejected: 'Pengajuan Ditolak',
  mentor_assigned: 'Mentor Ditugaskan',
  mentor_application: 'Lamaran Mentor',
  announcement: 'Pengumuman',
  certificate: 'Sertifikat',
  enrollment: 'Pendaftaran',
  event: 'Acara',
  reminder_assignment: 'Pengingat Tugas',
  reminder_live_class: 'Pengingat Kelas Live',
  reminder_grading: 'Pengingat Penilaian',
  reminder_event: 'Pengingat Acara',
  assignment: 'Tugas',
  quiz: 'Kuis',
  exam: 'Ujian',
  community: 'Komunitas',
  community_post_mention: 'Disebut di Komunitas',
  community_post_reply: 'Balasan di Komunitas',
  mentor_group_mention: 'Disebut di Komunitas Mentor',
  mentor_group_message: 'Komunitas Mentor',
  mentor_group_announcement: 'Pengumuman Komunitas Mentor',
  announcement_published: 'Pengumuman',
  project_chat_mention: 'Disebut di Chat Proyek',
  project_chat_message: 'Chat Proyek',
  moderation_warning: 'Peringatan Moderasi',
  project: 'Proyek',
  project_invite: 'Undangan Proyek',
  project_invite_accepted: 'Undangan Diterima',
  project_invite_declined: 'Undangan Ditolak',
  project_join_request: 'Permintaan Gabung',
  project_join_approved: 'Gabung Disetujui',
  project_join_rejected: 'Gabung Ditolak',
  final_project_review: 'Umpan Balik Proyek Akhir',
  final_project_status: 'Status Proyek Akhir',
  reminder_final_task: 'Pengingat Tugas Proyek Akhir',
  film: 'Film',
  waitlist: 'Daftar Tunggu',
}

function kindLabel(kind: string): string {
  const known = KIND_LABELS[kind]
  if (known) return known
  return kind
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Deep link tujuan notifikasi. Grup mentor (Fase 1) dan komunitas siswa
    (Fase 2) punya tujuan — kind lain tetap tampil tanpa tautan seperti sebelumnya.
    Pengumuman (Fase 4): buka halaman Pengumuman dengan id pengumumannya
    supaya itemnya disorot. */
function notificationLink(n: AppNotification): { href: string; label: string } | null {
  if (n.kind === 'announcement_published') {
    const announcementId =
      n.data && typeof n.data.announcement_id === 'string' ? n.data.announcement_id : null
    return {
      href: announcementId ? `/pengumuman?id=${announcementId}` : '/pengumuman',
      label: 'Buka pengumuman →',
    }
  }
  if (
    n.kind === 'mentor_group_mention' ||
    n.kind === 'mentor_group_message' ||
    n.kind === 'mentor_group_announcement'
  ) {
    return { href: '/komunitas-mentor', label: 'Buka di Komunitas Mentor →' }
  }
  if (n.kind === 'community_post_mention' || n.kind === 'community_post_reply') {
    const communityId =
      n.data && typeof n.data.community_id === 'string' ? n.data.community_id : null
    return {
      href: communityId ? `/komunitas/${communityId}` : '/komunitas',
      label: 'Buka di Komunitas →',
    }
  }
  if (n.kind === 'project_chat_mention' || n.kind === 'project_chat_message') {
    const projectId =
      n.data && typeof n.data.project_id === 'string' ? n.data.project_id : null
    return {
      href: projectId ? `/proyek/${projectId}/chat` : '/proyek',
      label: 'Buka di Chat Proyek →',
    }
  }
  // Fase 2 — sertifikat: daftar sertifikat milik sendiri.
  if (n.kind === 'certificate') {
    return { href: '/sertifikat', label: 'Lihat sertifikat →' }
  }
  // Fase 2 — undangan/gabung proyek (6 kind, satu kasus): detail proyek.
  if (
    n.kind === 'project_invite' ||
    n.kind === 'project_invite_accepted' ||
    n.kind === 'project_invite_declined' ||
    n.kind === 'project_join_request' ||
    n.kind === 'project_join_approved' ||
    n.kind === 'project_join_rejected'
  ) {
    const projectId =
      n.data && typeof n.data.project_id === 'string' ? n.data.project_id : null
    return {
      href: projectId ? `/proyek/${projectId}` : '/proyek',
      label: 'Buka proyek →',
    }
  }
  // Fase 2 — proyek akhir (review/status): detail proyek akhir.
  if (n.kind === 'final_project_review' || n.kind === 'final_project_status') {
    const projectId =
      n.data && typeof n.data.project_id === 'string' ? n.data.project_id : null
    return {
      href: projectId ? `/proyek-akhir/${projectId}` : '/proyek-akhir',
      label: 'Buka proyek akhir →',
    }
  }
  // Fase 2 — mentor_assigned bercabang: konteks proyek akhir (data.context
  // === 'final_project') menaut ke proyek akhir; konteks klaim-course lama
  // (tanpa project_id) tetap tanpa tautan seperti sebelumnya.
  if (n.kind === 'mentor_assigned') {
    const projectId =
      n.data && typeof n.data.project_id === 'string' ? n.data.project_id : null
    const context =
      n.data && typeof n.data.context === 'string' ? n.data.context : null
    if (context === 'final_project' && projectId) {
      return { href: `/proyek-akhir/${projectId}`, label: 'Buka proyek akhir →' }
    }
    return null
  }
  return null
}

const CATEGORY_META: Record<NotificationCategory, { label: string; icon: IconName }> = {
  academy: { label: 'Academy', icon: 'academy' },
  komunitas: { label: 'Komunitas', icon: 'community' },
  proyek: { label: 'Proyek', icon: 'project' },
  sinebot: { label: 'SINEBOT', icon: 'message' },
  sistem: { label: 'Sistem', icon: 'announcement' },
  lainnya: { label: 'Lainnya', icon: 'bell' },
}

type FilterKey = 'all' | 'unread' | 'important' | NotificationCategory

const FILTER_PILLS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'unread', label: 'Belum Dibaca' },
  { key: 'important', label: 'Penting' },
  { key: 'academy', label: 'Academy' },
  { key: 'komunitas', label: 'Komunitas' },
  { key: 'proyek', label: 'Proyek' },
  { key: 'sinebot', label: 'SINEBOT' },
  { key: 'sistem', label: 'Sistem' },
]

function matchesFilter(n: AppNotification, filter: FilterKey, q: string): boolean {
  if (filter === 'unread' && n.is_read) return false
  if (filter === 'important' && !isImportantNotification(n.kind)) return false
  if (filter !== 'all' && filter !== 'unread' && filter !== 'important' && notificationCategory(n.kind) !== filter) return false
  if (q) {
    const hay = `${n.title} ${n.body ?? ''} ${kindLabel(n.kind)}`.toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}

function senderIdOf(n: AppNotification): string | null {
  const v = n.data?.sender_id
  return typeof v === 'string' ? v : null
}

// --- Waktu dalam zona Asia/Jakarta -------------------------------------------
const jakartaDayKey = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const jakartaFull = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function dayKey(iso: string): string {
  return jakartaDayKey.format(new Date(iso))
}

function groupLabel(key: string, today: string, yesterday: string): string {
  if (key === today) return 'Hari Ini'
  if (key === yesterday) return 'Kemarin'
  const [y, m, d] = key.split('-').map(Number)
  return jakartaFull.format(new Date(Date.UTC(y, m - 1, d, 12)))
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  if (diff < 60_000) return 'baru saja'
  const min = Math.floor(diff / 60_000)
  if (min < 60) return `${min} menit lalu`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} jam lalu`
  const key = dayKey(iso)
  if (key === dayKey(new Date(Date.now() - 86_400_000).toISOString())) return 'kemarin'
  return jakartaFull.format(new Date(iso))
}

export default function NotificationsPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [unread, setUnread] = useState(0)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [realtimeError, setRealtimeError] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [clearScope, setClearScope] = useState<'read' | 'all'>('read')
  const [clearBusy, setClearBusy] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const pageRef = useRef(0)
  const namesRef = useRef<Map<string, string>>(new Map())
  const filterRef = useRef<FilterKey>(filter)
  const searchRef = useRef('')
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    filterRef.current = filter
  }, [filter])
  useEffect(() => {
    searchRef.current = search.trim().toLowerCase()
  }, [search])

  const ensureNames = useCallback(async (rows: AppNotification[]) => {
    const ids = [
      ...new Set(
        rows.map(senderIdOf).filter((s): s is string => s !== null && !namesRef.current.has(s)),
      ),
    ]
    if (ids.length === 0) return
    try {
      const map = await fetchProfileNames(ids)
      const next = new Map(namesRef.current)
      map.forEach((v, k) => next.set(k, v))
      namesRef.current = next
      setNames(next)
    } catch {
      // Nama tetap memakai fallback "Sistem SINEVERSE".
    }
  }, [])

  const loadPage = useCallback(
    async (page: number, reset: boolean) => {
      if (!user) return
      if (reset) setLoading(true)
      else setLoadingMore(true)
      try {
        const rows = await fetchNotificationsPaged(user.id, page, PAGE_SIZE)
        setItems((prev) => {
          const base = reset ? [] : prev
          const seen = new Set(base.map((n) => n.id))
          return [...base, ...rows.filter((n) => !seen.has(n.id))]
        })
        setHasMore(rows.length === PAGE_SIZE)
        pageRef.current = page
        void ensureNames(rows)
      } catch (err) {
        if (reset) setError(err instanceof Error ? err.message : 'Gagal memuat notifikasi.')
        else setNotice(err instanceof Error ? err.message : 'Gagal memuat notifikasi berikutnya.')
      } finally {
        if (reset) setLoading(false)
        else setLoadingMore(false)
      }
    },
    [user, ensureNames],
  )

  // Muat awal + jumlah belum dibaca.
  useEffect(() => {
    // B39: tamu tidak boleh terjebak "Memuat…" selamanya — loading
    // dimatikan dan halaman menampilkan ajakan masuk.
    if (!user) {
      setLoading(false)
      return
    }
    const currentUser = user
    void fetchUnreadCount(currentUser.id)
      .then((count) => {
        if (count !== null) setUnread(count)
      })
      .catch(() => {
        // Jumlah badge tetap 0; daftar tetap dimuat.
      })
    void loadPage(0, true)
  }, [user, loadPage])

  // Realtime: INSERT baru milik sendiri muncul di atas daftar.
  useEffect(() => {
    if (!user) return
    const unsubscribe = subscribeToNotifications(
      user.id,
      (n) => {
        if (!matchesFilter(n, filterRef.current, searchRef.current)) return
        setItems((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev]))
        if (!n.is_read) setUnread((u) => u + 1)
        void ensureNames([n])
      },
      (status) => setRealtimeError(status === 'error'),
    )
    return unsubscribe
  }, [user, ensureNames])

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return
    void loadPage(pageRef.current + 1, false)
  }, [loading, loadingMore, hasMore, loadPage])

  // Infinite scroll: sentinel di bawah daftar.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { rootMargin: '300px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore, hasMore])

  const q = search.trim().toLowerCase()
  const filtered = useMemo(
    () => items.filter((n) => matchesFilter(n, filter, q)),
    [items, filter, q],
  )
  const hasLainnya = useMemo(
    () => items.some((n) => notificationCategory(n.kind) === 'lainnya'),
    [items],
  )
  const readCount = items.filter((n) => n.is_read).length

  const todayKey = dayKey(new Date().toISOString())
  const yesterdayKey = dayKey(new Date(Date.now() - 86_400_000).toISOString())
  const groups = useMemo(() => {
    const out: { key: string; label: string; items: AppNotification[] }[] = []
    for (const n of filtered) {
      const key = dayKey(n.created_at)
      const last = out[out.length - 1]
      if (last && last.key === key) last.items.push(n)
      else out.push({ key, label: groupLabel(key, todayKey, yesterdayKey), items: [n] })
    }
    return out
  }, [filtered, todayKey, yesterdayKey])

  async function handleReadOne(id: string) {
    // P49: kegagalan tandai-baca diberi umpan balik, bukan rejection tak tertangani.
    try {
      await markNotificationRead(id)
      setItems((xs) => xs.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
      setUnread((u) => Math.max(0, u - 1))
      // Lonceng header (Layout) menyegarkan angkanya lewat event ini.
      notifyNotificationsRead()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal menandai notifikasi sudah dibaca. Coba lagi.')
    }
  }

  async function handleReadAll() {
    if (!user) return
    try {
      await markAllNotificationsRead(user.id)
      setItems((xs) => xs.map((n) => ({ ...n, is_read: true })))
      setUnread(0)
      setNotice('Semua notifikasi ditandai sudah dibaca.')
      notifyNotificationsRead()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal menandai notifikasi.')
    }
  }

  async function refreshFirstPage() {
    if (!user) return
    try {
      const rows = await fetchNotificationsPaged(user.id, 0, PAGE_SIZE)
      setItems(rows)
      setHasMore(rows.length === PAGE_SIZE)
      pageRef.current = 0
      void ensureNames(rows)
    } catch {
      // Daftar tetap apa adanya; notice sudah menampilkan hasil hapus.
    }
  }

  async function handleClear() {
    if (!user) return
    setClearBusy(true)
    try {
      // Keputusan Arif 24 Nov 2026: bersihkan = HAPUS PERMANEN baris
      // notifikasi milik sendiri (bukan arsip). Aktivitas sumber — pesan,
      // tugas, tiket — tidak ikut terhapus.
      const count = await deleteNotifications(user.id, clearScope)
      setNotice(`${count} notifikasi dibersihkan.`)
      setClearOpen(false)
      if (clearScope === 'all') setUnread(0)
      notifyNotificationsRead()
      // Penghapusan di server mencakup baris yang belum sempat dimuat,
      // jadi muat ulang halaman pertama tanpa layar loading penuh.
      void refreshFirstPage()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal membersihkan notifikasi. Coba lagi.')
    } finally {
      setClearBusy(false)
    }
  }

  if (loading) return <div className="page"><p className="muted">Memuat notifikasi…</p></div>
  if (!user) {
    return (
      <div className="page">
        <PageHeader icon="bell" title="Notifikasi" subtitle="Pemberitahuan untuk akunmu." />
        <p className="empty">
          <Link to="/login">Masuk</Link> untuk melihat notifikasi.
        </p>
      </div>
    )
  }
  if (error) return <div className="page"><p className="error-box">{error}</p></div>

  return (
    <div className="page">
      <PageHeader
        icon="bell"
        title="Notifikasi"
        subtitle={
          unread > 0 ? (
            <>
              <span className="notif-badge">{unread}</span> belum dibaca.
            </>
          ) : (
            'Semua sudah dibaca.'
          )
        }
      />
      {realtimeError && (
        <p className="notice-box">
          Notifikasi realtime tidak tersambung — muat ulang halaman untuk melihat yang terbaru.
        </p>
      )}
      {notice && <p className="notice-box">{notice}</p>}

      <div className="notif-toolbar">
        <label className="notif-search">
          <Icon name="search" size={18} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari notifikasi…"
            aria-label="Cari notifikasi"
          />
        </label>
        <div className="notif-actions">
          <Link to="/notifikasi/pengaturan" className="btn btn-secondary btn-small">
            <Icon name="settings" size={16} /> Pengaturan Notifikasi
          </Link>
          {unread > 0 && (
            <button type="button" className="btn btn-secondary btn-small" onClick={handleReadAll}>
              Tandai Semua Dibaca
            </button>
          )}
          <button
            type="button"
            className="btn btn-small notif-clear-btn"
            onClick={() => setClearOpen((v) => !v)}
          >
            Bersihkan Notifikasi
          </button>
        </div>
      </div>

      {clearOpen && (
        <div className="notif-dialog" role="group" aria-label="Bersihkan notifikasi">
          <p>
            <strong>Bersihkan Notifikasi?</strong>
          </p>
          <label className="notif-dialog-option">
            <input
              type="radio"
              name="clear-scope"
              checked={clearScope === 'read'}
              onChange={() => setClearScope('read')}
            />
            Yang sudah dibaca saja ({readCount} notifikasi)
          </label>
          <label className="notif-dialog-option">
            <input
              type="radio"
              name="clear-scope"
              checked={clearScope === 'all'}
              onChange={() => setClearScope('all')}
            />
            Semua notifikasi ({items.length} notifikasi, termasuk yang belum dibaca)
          </label>
          <p className="muted">
            Hanya daftar notifikasi yang dihapus. Pesan, tugas, dan tiket aslinya tetap tersimpan.
          </p>
          <div className="notif-dialog-actions">
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => setClearOpen(false)}
            >
              Batal
            </button>
            <button
              type="button"
              className="btn btn-small notif-clear-btn"
              onClick={handleClear}
              disabled={clearBusy}
            >
              {clearBusy ? 'Membersihkan…' : 'Ya, Bersihkan'}
            </button>
          </div>
        </div>
      )}

      <div className="notif-pills" role="group" aria-label="Filter notifikasi">
        {FILTER_PILLS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={filter === p.key ? 'notif-pill notif-pill--active' : 'notif-pill'}
            onClick={() => setFilter(p.key)}
            aria-pressed={filter === p.key}
          >
            {p.label}
          </button>
        ))}
        {hasLainnya && (
          <button
            type="button"
            className={filter === 'lainnya' ? 'notif-pill notif-pill--active' : 'notif-pill'}
            onClick={() => setFilter('lainnya')}
            aria-pressed={filter === 'lainnya'}
          >
            Lainnya
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="empty">Belum ada notifikasi.</p>
      ) : filtered.length === 0 ? (
        <p className="empty">Tidak ada notifikasi yang cocok dengan pencarian atau filter.</p>
      ) : (
        groups.map((g) => (
          <section key={g.key}>
            <h2 className="notif-group-title">{g.label}</h2>
            <ul className="notif-list">
              {g.items.map((n) => {
                const link = notificationLink(n)
                const meta = CATEGORY_META[notificationCategory(n.kind)]
                const sid = senderIdOf(n)
                const sender = sid ? (names.get(sid) ?? 'Sistem SINEVERSE') : 'Sistem SINEVERSE'
                const important = isImportantNotification(n.kind)
                return (
                  <li key={n.id} className={n.is_read ? 'notif-card' : 'notif-card notif-card--unread'}>
                    <div className="notif-card-head">
                      <span className="notif-icon" aria-hidden="true">
                        <Icon name={meta.icon} size={20} />
                      </span>
                      <div className="notif-card-meta">
                        <span>{meta.label}</span>
                        <span className="notif-dot-sep">·</span>
                        <span>{sender}</span>
                        <span className="notif-dot-sep">·</span>
                        <span>{timeAgo(n.created_at)}</span>
                      </div>
                      {!n.is_read && <span className="notif-unread-dot" aria-label="Belum dibaca" />}
                    </div>
                    <p className="notif-title">
                      <strong>{n.title}</strong>
                    </p>
                    {n.body && <p className="notif-body">{n.body}</p>}
                    <div className="notif-tags">
                      {!n.is_read && <span className="notif-tag notif-tag--new">Baru</span>}
                      {important && <span className="notif-tag notif-tag--important">Penting</span>}
                      <span className="notif-kind">{kindLabel(n.kind)}</span>
                    </div>
                    {link && (
                      <p className="notif-link-row">
                        <Link
                          to={link.href}
                          onClick={() => {
                            // Membuka tujuan notifikasi sekaligus menandainya dibaca,
                            // supaya lonceng header ikut berkurang.
                            if (!n.is_read) void handleReadOne(n.id)
                          }}
                        >
                          {link.label} <Icon name="chevronRight" size={16} />
                        </Link>
                      </p>
                    )}
                    {!n.is_read && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={() => void handleReadOne(n.id)}
                      >
                        Tandai Dibaca
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}

      {hasMore && (
        <div ref={sentinelRef} className="notif-sentinel">
          {loadingMore ? 'Memuat…' : ''}
        </div>
      )}
      {!hasMore && items.length > 0 && (
        <p className="muted notif-end">Semua notifikasi sudah dimuat.</p>
      )}
    </div>
  )
}
