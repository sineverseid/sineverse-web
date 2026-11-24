// SINEVERSE — Notifikasi: daftar + tandai satu/semua dibaca (008).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { fmtDate } from '../lib/guarded'
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from '../lib/supabase'
import type { AppNotification } from '../lib/types'
import PageHeader from '../components/PageHeader'

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
  return null
}

export default function NotificationsPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<AppNotification[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    // B39: tamu tidak boleh terjebak "Memuat…" selamanya — loading
    // dimatikan dan halaman menampilkan ajakan masuk.
    if (!user) {
      setLoading(false)
      return
    }
    const currentUser = user
    let cancelled = false
    async function load() {
      try {
        const rows = await fetchNotifications(currentUser.id)
        if (!cancelled) setItems(rows)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat notifikasi.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user])

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
  if (items === null) return <div className="page"><h1>Notifikasi</h1><MigrationNotice migration="008" /></div>

  const unread = items.filter((n) => !n.is_read).length

  async function handleReadOne(id: string) {
    // P49: kegagalan tandai-baca diberi umpan balik, bukan rejection tak tertangani.
    try {
      await markNotificationRead(id)
      setItems((xs) => (xs ?? []).map((n) => (n.id === id ? { ...n, is_read: true } : n)))
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal menandai notifikasi sudah dibaca. Coba lagi.')
    }
  }

  async function handleReadAll() {
    if (!user) return
    try {
      await markAllNotificationsRead(user.id)
      setItems((xs) => (xs ?? []).map((n) => ({ ...n, is_read: true })))
      setNotice('Semua notifikasi ditandai sudah dibaca.')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal menandai notifikasi.')
    }
  }

  return (
    <div className="page">
      <PageHeader
        icon="bell"
        title="Notifikasi"
        subtitle={
          <>
            {unread > 0 ? `${unread} belum dibaca.` : 'Semua sudah dibaca.'}{' '}
            <Link to="/notifikasi/pengaturan">Pengaturan notifikasi</Link>
          </>
        }
      />
      {notice && <p className="notice-box">{notice}</p>}
      {unread > 0 && (
        <p>
          <button type="button" className="btn btn-secondary btn-small" onClick={handleReadAll}>
            Tandai Semua Dibaca
          </button>
        </p>
      )}
      {items.length === 0 ? (
        <p className="empty">Belum ada notifikasi.</p>
      ) : (
        <ul className="discussion-list">
          {items.map((n) => {
            const link = notificationLink(n)
            return (
              <li key={n.id} className="discussion-item" style={n.is_read ? undefined : { borderLeft: '4px solid var(--film-green)' }}>
                <p className="discussion-meta">
                  {kindLabel(n.kind)} · {fmtDate(n.created_at)}
                  {n.is_read ? '' : ' · Belum dibaca'}
                </p>
                <p><strong>{n.title}</strong></p>
                {n.body && <p>{n.body}</p>}
                {link && (
                  <p>
                    <Link to={link.href}>{link.label}</Link>
                  </p>
                )}
                {!n.is_read && (
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => void handleReadOne(n.id)}>
                    Tandai Dibaca
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
