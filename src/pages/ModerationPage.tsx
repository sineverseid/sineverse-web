// SINEVERSE — Moderasi admin (003 + 008): laporan diskusi + laporan
// moderasi umum, resolve/dismiss; audit log read-only (ditulis lewat
// log_audit() RPC saja — aplikasi tidak pernah insert langsung).
import { useEffect, useState } from 'react'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { fmtDate, isMissingTableError } from '../lib/guarded'
import { logAudit, supabase } from '../lib/supabase'
import type { AuditLogRow, DiscussionReport, ModerationReport } from '../lib/types'
import WorkspaceNav from '../components/WorkspaceNav'
import { ADMIN_NAV } from '../lib/workspaceNav'

export default function ModerationPage() {
  const { user, profile } = useAuth()
  const [discReports, setDiscReports] = useState<DiscussionReport[] | null>(null)
  const [modReports, setModReports] = useState<ModerationReport[] | null>(null)
  const [audit, setAudit] = useState<AuditLogRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function load() {
    try {
      // Ketiga select independen: jalankan paralel, lalu terapkan
      // penanganan error masing-masing dengan urutan yang sama seperti
      // semula (missing table -> null, error lain -> throw).
      const [dRes, mRes, aRes] = await Promise.all([
        supabase.from('discussion_reports').select('*').order('created_at', { ascending: false }),
        supabase.from('moderation_reports').select('*').order('created_at', { ascending: false }),
        supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(100),
      ])
      if (dRes.error) {
        if (isMissingTableError(dRes.error)) setDiscReports(null)
        else throw dRes.error
      } else setDiscReports((dRes.data ?? []) as DiscussionReport[])
      if (mRes.error) {
        if (isMissingTableError(mRes.error)) setModReports(null)
        else throw mRes.error
      } else setModReports((mRes.data ?? []) as ModerationReport[])
      if (aRes.error) {
        if (isMissingTableError(aRes.error)) setAudit(null)
        else throw aRes.error
      } else setAudit((aRes.data ?? []) as AuditLogRow[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat moderasi.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (profile?.role !== 'admin') {
    return (
      <div className="page">
        <h1>Moderasi</h1>
        <p className="empty">Halaman ini hanya untuk admin.</p>
      </div>
    )
  }
  if (loading) return <div className="page"><p className="muted">Memuat moderasi…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>

  async function resolveDiscussion(r: DiscussionReport, status: 'resolved' | 'dismissed') {
    const { error: updErr } = await supabase
      .from('discussion_reports')
      .update({ status, resolved_by: user?.id ?? null, resolved_at: new Date().toISOString() })
      .eq('id', r.id)
    if (updErr) setNotice(updErr.message)
    else {
      await logAudit(`discussion_report.${status}`, 'discussion_reports', r.id, { discussion_id: r.discussion_id })
      setNotice(`Laporan diskusi ${status === 'resolved' ? 'diselesaikan' : 'ditolak'}.`)
      await load()
    }
  }

  async function resolveModeration(r: ModerationReport, status: 'resolved' | 'dismissed') {
    const { error: updErr } = await supabase
      .from('moderation_reports')
      .update({ status, resolved_by: user?.id ?? null, resolved_at: new Date().toISOString() })
      .eq('id', r.id)
    if (updErr) setNotice(updErr.message)
    else {
      await logAudit(`moderation_report.${status}`, 'moderation_reports', r.id, { target_type: r.target_type, target_id: r.target_id })
      setNotice(`Laporan moderasi ${status === 'resolved' ? 'diselesaikan' : 'ditolak'}.`)
      await load()
    }
  }

  return (
    <div className="page">
      <h1>Moderasi &amp; Audit Log</h1>
      <WorkspaceNav entries={ADMIN_NAV} />
      {notice && <p className="notice-box">{notice}</p>}

      <section className="section">
        <h2>Laporan Diskusi</h2>
        {discReports === null ? <MigrationNotice migration="003" /> : discReports.length === 0 ? (
          <p className="empty">Tidak ada laporan diskusi.</p>
        ) : (
          <ul className="discussion-list">
            {discReports.map((r) => (
              <li key={r.id} className="discussion-item">
                <p className="discussion-meta">{fmtDate(r.created_at)} · Status: {r.status}</p>
                <p>Alasan: {r.reason ?? '—'}</p>
                {r.status === 'open' && (
                  <div className="form-actions">
                    <button type="button" className="btn btn-primary btn-small" onClick={() => void resolveDiscussion(r, 'resolved')}>Selesaikan</button>
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => void resolveDiscussion(r, 'dismissed')}>Tolak Laporan</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Laporan Moderasi Umum</h2>
        {modReports === null ? <MigrationNotice migration="008" /> : modReports.length === 0 ? (
          <p className="empty">Tidak ada laporan moderasi.</p>
        ) : (
          <ul className="discussion-list">
            {modReports.map((r) => (
              <li key={r.id} className="discussion-item">
                <p className="discussion-meta">{r.target_type} · {fmtDate(r.created_at)} · Status: {r.status}</p>
                <p>Alasan: {r.reason ?? '—'}</p>
                {r.status === 'open' && (
                  <div className="form-actions">
                    <button type="button" className="btn btn-primary btn-small" onClick={() => void resolveModeration(r, 'resolved')}>Selesaikan</button>
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => void resolveModeration(r, 'dismissed')}>Tolak Laporan</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Audit Log (read-only)</h2>
        {audit === null ? <MigrationNotice migration="008" /> : audit.length === 0 ? (
          <p className="empty">Belum ada entri audit log.</p>
        ) : (
          <ul>
            {audit.map((a) => (
              <li key={a.id}>
                {fmtDate(a.created_at)} — {a.action}
                {a.target_type ? ` (${a.target_type})` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
