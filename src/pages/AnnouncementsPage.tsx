// SINEVERSE — Feed pengumuman: pengumuman platform (semua) + pengumuman
// course yang diikuti. Dibuat admin/mentor lewat Admin Panel / Mentor
// Workspace; di sini hanya dibaca. Tabel announcements (003).
import { useEffect, useState } from 'react'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { fmtDate, isMissingTableError } from '../lib/guarded'
import { fetchEnrollments, supabase } from '../lib/supabase'
import type { Announcement } from '../lib/types'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

export default function AnnouncementsPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<Announcement[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        // Pengumuman dan enrollment saya independen — dimulai paralel.
        // Bila tabel announcements belum ada, enrollment yang terlanjur
        // berjalan ditelan saja supaya tetap tampil MigrationNotice.
        const enrP = user ? fetchEnrollments(user.id) : Promise.resolve([])
        const { data, error: qErr } = await supabase
          .from('announcements')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50)
        if (qErr) {
          if (isMissingTableError(qErr)) {
            await enrP.catch(() => [])
            if (!cancelled) setItems(null)
            return
          }
          // Enrollment yang terlanjur berjalan tidak boleh jadi unhandled rejection.
          enrP.catch(() => [])
          throw qErr
        }
        let rows = (data ?? []) as Announcement[]
        if (user) {
          const enr = await enrP
          const mine = new Set(enr.map((e) => e.course_id))
          rows = rows.filter((a) => a.scope === 'platform' || (a.course_id && mine.has(a.course_id)))
        } else {
          rows = rows.filter((a) => a.scope === 'platform')
        }
        if (!cancelled) setItems(rows)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat pengumuman.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user])

  if (loading) return <div className="page"><p className="muted">Memuat pengumuman…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (items === null) return <div className="page"><h1>Pengumuman</h1><MigrationNotice migration="003" /></div>

  return (
    <div className="page">
      <PageHeader icon="announcement" title="Pengumuman" />
      {items.length === 0 ? (
        <EmptyState message="Belum ada pengumuman." />
      ) : (
        <ul className="discussion-list">
          {items.map((a) => (
            <li key={a.id} className="discussion-item">
              <p className="discussion-meta">
                {a.scope === 'platform' ? 'Platform' : 'Course'} · {fmtDate(a.created_at)}
              </p>
              <h3>{a.title}</h3>
              {a.body && <p>{a.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
