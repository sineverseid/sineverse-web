// SINEVERSE — Feed pengumuman: pengumuman platform (semua) + pengumuman
// course yang diikuti. Dibuat admin lewat Admin Panel; di sini hanya dibaca.
// Tabel announcements (003) + Fase 4 (067): target, pin, jadwal, lampiran.
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { fmtDate, isMissingTableError } from '../lib/guarded'
import { listAnnouncements, signedAnnouncementUrl } from '../lib/announcements'
import { hideContent, reportContent } from '../lib/moderation'
import { supabase } from '../lib/supabase'
import type { Announcement } from '../lib/types'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

export default function AnnouncementsPage() {
  const { user, profile } = useAuth()
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('id')
  const [items, setItems] = useState<Announcement[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Fase 6 (070): laporkan pengumuman (konfirmasi inline + alasan;
  // hanya pengguna masuk — tamu tidak bisa melapor).
  const [reportTargetId, setReportTargetId] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState('')
  const [reportSending, setReportSending] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)

  // Fase 6 (070): admin menampilkan kembali pengumuman yang disembunyikan.
  const [unhideBusy, setUnhideBusy] = useState<string | null>(null)

  async function load(signal?: { cancelled: boolean }) {
    try {
      // Masuk: daftar terbit sesuai target (RLS + lib). Tamu: perilaku
      // lama — hanya platform (RLS anon tetap membatasi).
      if (user) {
        const rows = await listAnnouncements()
        if (!signal?.cancelled) setItems(rows)
        return
      }
      const { data, error: qErr } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      if (qErr) {
        if (isMissingTableError(qErr)) {
          if (!signal?.cancelled) setItems(null)
          return
        }
        throw qErr
      }
      const rows = ((data ?? []) as Announcement[]).filter((a) => a.scope === 'platform')
      if (!signal?.cancelled) setItems(rows)
    } catch (err) {
      if (!signal?.cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat pengumuman.')
    } finally {
      if (!signal?.cancelled) setLoading(false)
    }
  }

  useEffect(() => {
    const signal = { cancelled: false }
    void load(signal)
    return () => {
      signal.cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Deep link notifikasi (?id=): gulir ke pengumuman itu supaya terlihat.
  useEffect(() => {
    if (!highlightId || !items) return
    const el = document.getElementById(`ann-${highlightId}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightId, items])

  async function handleOpenAttachment(a: Announcement) {
    if (!a.attachment_path) return
    try {
      const url = await signedAnnouncementUrl(a.attachment_path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Lampiran tidak bisa dibuka saat ini.')
    }
  }

  /** Fase 6 (070): admin menampilkan kembali pengumuman yang disembunyikan.
      RPC melempar 'Konten tidak ditemukan.' bila pengumuman sudah dihapus —
      ditangkap sebagai notice, bukan crash. */
  async function handleUnhide(a: Announcement) {
    if (unhideBusy) return
    setUnhideBusy(a.id)
    try {
      await hideContent('announcements', a.id, false)
      setNotice('Pengumuman ditampilkan kembali.')
      await load()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal menampilkan kembali pengumuman.')
    } finally {
      setUnhideBusy(null)
    }
  }

  /** Fase 6 (070): laporkan pengumuman ke antrean moderasi admin. */
  async function handleReport(a: Announcement) {
    if (!user) return
    const reason = reportReason.trim()
    if (reason === '') {
      setReportError('Tulis alasan laporan dulu.')
      return
    }
    setReportSending(true)
    setReportError(null)
    try {
      await reportContent('announcement', a.id, reason)
      setReportTargetId(null)
      setReportReason('')
      setNotice('Laporan terkirim. Admin akan meninjaunya.')
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Gagal mengirim laporan.')
    } finally {
      setReportSending(false)
    }
  }

  if (loading) return <div className="page"><p className="muted">Memuat pengumuman…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (items === null) return <div className="page"><h1>Pengumuman</h1><MigrationNotice migration="003" /></div>

  return (
    <div className="page">
      <PageHeader icon="announcement" title="Pengumuman" />
      {notice && <p className="notice-box">{notice}</p>}
      {items.length === 0 ? (
        <EmptyState message="Belum ada pengumuman." />
      ) : (
        <ul className="discussion-list">
          {items.map((a) => (
            <li
              key={a.id}
              id={`ann-${a.id}`}
              className="discussion-item"
              style={
                a.id === highlightId
                  ? { borderLeft: '4px solid var(--film-green)', background: 'var(--mint, #e8f7ef)' }
                  : undefined
              }
            >
              <p className="discussion-meta">
                {a.scope === 'platform' ? 'Platform' : 'Course'} · {fmtDate(a.publish_at ?? a.created_at)}
                {a.is_pinned ? ' · 📌 Disematkan' : ''}
                {a.is_hidden ? ' · Disembunyikan' : ''}
              </p>
              <h3>{a.title}</h3>
              {a.body && <p>{a.body}</p>}
              {a.attachment_name && a.attachment_path && (
                <p>
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => void handleOpenAttachment(a)}>
                    📎 {a.attachment_name}
                  </button>
                </p>
              )}
              {user && (
                <p>
                  {a.is_hidden && profile?.role === 'admin' && (
                    <>
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        disabled={unhideBusy !== null}
                        onClick={() => void handleUnhide(a)}
                      >
                        {unhideBusy === a.id ? 'Memproses…' : 'Tampilkan kembali'}
                      </button>{' '}
                    </>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => {
                      setReportTargetId(reportTargetId === a.id ? null : a.id)
                      setReportReason('')
                      setReportError(null)
                    }}
                  >
                    Laporkan
                  </button>
                </p>
              )}
              {reportTargetId === a.id && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void handleReport(a)
                  }}
                  style={{ marginTop: '0.6rem' }}
                >
                  <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600 }}>
                    Alasan laporan
                    <textarea
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value)}
                      rows={2}
                      placeholder="Contoh: pengumuman ini berisi konten yang tidak pantas…"
                      style={{ display: 'block', width: '100%', marginTop: '0.35rem' }}
                    />
                  </label>
                  {reportError && <p className="error-box">{reportError}</p>}
                  <p>
                    <button type="submit" className="btn btn-small" disabled={reportSending}>
                      {reportSending ? 'Mengirim…' : 'Kirim laporan'}
                    </button>{' '}
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => {
                        setReportTargetId(null)
                        setReportReason('')
                        setReportError(null)
                      }}
                    >
                      Batal
                    </button>
                  </p>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
