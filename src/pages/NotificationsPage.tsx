// SINEVERSE — Notifikasi: daftar + tandai satu/semua dibaca (008).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { fmtDate } from '../lib/guarded'
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from '../lib/supabase'
import type { AppNotification } from '../lib/types'

export default function NotificationsPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<AppNotification[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
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
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (items === null) return <div className="page"><h1>Notifikasi</h1><MigrationNotice migration="008" /></div>

  const unread = items.filter((n) => !n.is_read).length

  async function handleReadOne(id: string) {
    await markNotificationRead(id)
    setItems((xs) => (xs ?? []).map((n) => (n.id === id ? { ...n, is_read: true } : n)))
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
      <h1>Notifikasi</h1>
      <p className="muted">
        {unread > 0 ? `${unread} belum dibaca.` : 'Semua sudah dibaca.'}{' '}
        <Link to="/notifikasi/pengaturan">Pengaturan notifikasi</Link>
      </p>
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
          {items.map((n) => (
            <li key={n.id} className="discussion-item" style={n.is_read ? undefined : { borderLeft: '4px solid var(--film-green)' }}>
              <p className="discussion-meta">
                {n.kind} · {fmtDate(n.created_at)}
                {n.is_read ? '' : ' · Belum dibaca'}
              </p>
              <p><strong>{n.title}</strong></p>
              {n.body && <p>{n.body}</p>}
              {!n.is_read && (
                <button type="button" className="btn btn-ghost btn-small" onClick={() => void handleReadOne(n.id)}>
                  Tandai Dibaca
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
