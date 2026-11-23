// SINEVERSE — Moderasi admin (003 + 008): laporan diskusi + laporan
// moderasi umum, resolve/dismiss; audit log read-only (ditulis lewat
// log_audit() RPC saja — aplikasi tidak pernah insert langsung).
import { useEffect, useState } from 'react'
import MigrationNotice from '../components/MigrationNotice'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { activityLabel } from '../lib/activityLabels'
import { fmtDate, isMissingTableError } from '../lib/guarded'
import { fetchProfileNames, logAudit, supabase } from '../lib/supabase'
import type { AuditLogRow, DiscussionReport, ModerationReport } from '../lib/types'
import WorkspaceNav from '../components/WorkspaceNav'
import { ADMIN_NAV } from '../lib/workspaceNav'

// Status laporan dalam Bahasa Indonesia (bukan mentah "open"/"resolved").
function reportStatusLabel(status: string): string {
  if (status === 'open') return 'Terbuka'
  if (status === 'resolved') return 'Diselesaikan'
  if (status === 'dismissed') return 'Ditolak'
  return status
}

function targetTypeLabel(t: string): string {
  if (t === 'community_post' || t === 'post') return 'Postingan community'
  if (t === 'community') return 'Komunitas'
  if (t === 'discussion') return 'Diskusi'
  if (t === 'film') return 'Film'
  if (t === 'project') return 'Proyek'
  if (t === 'profile' || t === 'user') return 'Pengguna'
  return t
}

export default function ModerationPage() {
  const { user, profile } = useAuth()
  const [discReports, setDiscReports] = useState<DiscussionReport[] | null>(null)
  const [modReports, setModReports] = useState<ModerationReport[] | null>(null)
  const [audit, setAudit] = useState<AuditLogRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // B73: nama pelapor + isi yang dilaporkan + tautan target.
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [discContent, setDiscContent] = useState<Map<string, { body: string; lesson_id: string }>>(new Map())
  const [targetLabels, setTargetLabels] = useState<Map<string, { label: string; to: string | null }>>(new Map())
  // B65: satu kunci busy per laporan yang sedang diputuskan.
  const [busyKey, setBusyKey] = useState<string | null>(null)

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
      // B73 + LB8: nama pelapor/pelaku, isi diskusi yang dilaporkan, dan
      // label/tautan target laporan — supaya admin tidak memutuskan buta.
      // Semua lookup best-effort: gagal = fallback label, bukan halaman error.
      const dRows = (dRes.data ?? []) as DiscussionReport[]
      const mRows = (mRes.data ?? []) as ModerationReport[]
      const aRows = (aRes.data ?? []) as AuditLogRow[]
      const userIds = [
        ...new Set([
          ...dRows.map((r) => r.reporter_id),
          ...mRows.map((r) => r.reporter_id),
          ...aRows.map((r) => r.actor_id).filter((id): id is string => Boolean(id)),
        ]),
      ]
      const namesMap = await fetchProfileNames(userIds).catch(() => new Map<string, string>())
      setNames(namesMap)
      if (dRows.length > 0) {
        const { data: discData } = await supabase
          .from('discussions')
          .select('id,body,lesson_id')
          .in('id', dRows.map((r) => r.discussion_id))
        const map = new Map<string, { body: string; lesson_id: string }>()
        for (const d of (discData ?? []) as { id: string; body: string; lesson_id: string }[]) {
          map.set(d.id, { body: d.body, lesson_id: d.lesson_id })
        }
        setDiscContent(map)
      }
      const labels = new Map<string, { label: string; to: string | null }>()
      for (const r of mRows) {
        const key = `${r.target_type}:${r.target_id ?? ''}`
        const fallback = { label: targetTypeLabel(r.target_type), to: null as string | null }
        if (!r.target_id) {
          labels.set(key, fallback)
          continue
        }
        try {
          if (r.target_type === 'community_post' || r.target_type === 'post') {
            const { data } = await supabase.from('community_posts').select('body,community_id').eq('id', r.target_id).maybeSingle()
            const row = data as { body: string | null; community_id: string } | null
            labels.set(key, row ? { label: row.body ? row.body.slice(0, 80) : targetTypeLabel(r.target_type), to: `/komunitas/${row.community_id}` } : fallback)
          } else if (r.target_type === 'community') {
            const { data } = await supabase.from('communities').select('name').eq('id', r.target_id).maybeSingle()
            const row = data as { name: string } | null
            labels.set(key, row ? { label: row.name, to: `/komunitas/${r.target_id}` } : fallback)
          } else if (r.target_type === 'discussion') {
            const { data } = await supabase.from('discussions').select('body,lesson_id').eq('id', r.target_id).maybeSingle()
            const row = data as { body: string | null; lesson_id: string } | null
            labels.set(key, row ? { label: row.body ? row.body.slice(0, 80) : targetTypeLabel(r.target_type), to: `/lesson/${row.lesson_id}` } : fallback)
          } else if (r.target_type === 'film') {
            const { data } = await supabase.from('films').select('title').eq('id', r.target_id).maybeSingle()
            const row = data as { title: string } | null
            labels.set(key, row ? { label: row.title, to: `/showcase/${r.target_id}` } : fallback)
          } else if (r.target_type === 'project') {
            const { data } = await supabase.from('projects').select('title').eq('id', r.target_id).maybeSingle()
            const row = data as { title: string } | null
            labels.set(key, row ? { label: row.title, to: `/proyek/${r.target_id}` } : fallback)
          } else {
            labels.set(key, fallback)
          }
        } catch {
          labels.set(key, fallback)
        }
      }
      setTargetLabels(labels)
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
    // B65: kunci busy per laporan — klik ganda tidak menjalankan dua kali.
    const key = `disc-${r.id}-${status}`
    if (busyKey) return
    setBusyKey(key)
    try {
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
    } finally {
      setBusyKey(null)
    }
  }

  async function resolveModeration(r: ModerationReport, status: 'resolved' | 'dismissed') {
    // B65: kunci busy per laporan.
    const key = `mod-${r.id}-${status}`
    if (busyKey) return
    setBusyKey(key)
    try {
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
    } finally {
      setBusyKey(null)
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
            {discReports.map((r) => {
              const content = discContent.get(r.discussion_id)
              return (
              <li key={r.id} className="discussion-item">
                <p className="discussion-meta">{fmtDate(r.created_at)} · Status: {reportStatusLabel(r.status)}</p>
                <p>Pelapor: {names.get(r.reporter_id) ?? '—'}</p>
                <p>Alasan: {r.reason ?? '—'}</p>
                {content ? (
                  <p>
                    Isi yang dilaporkan: “{content.body.length > 200 ? `${content.body.slice(0, 200)}…` : content.body}”{' '}
                    <Link to={`/lesson/${content.lesson_id}`}>Lihat diskusi →</Link>
                  </p>
                ) : (
                  <p className="muted">Isi diskusi yang dilaporkan sudah tidak tersedia.</p>
                )}
                {r.status === 'open' && (
                  <div className="form-actions">
                    <button type="button" className="btn btn-primary btn-small" disabled={busyKey !== null} onClick={() => void resolveDiscussion(r, 'resolved')}>{busyKey === `disc-${r.id}-resolved` ? 'Memproses…' : 'Selesaikan'}</button>
                    <button type="button" className="btn btn-ghost btn-small" disabled={busyKey !== null} onClick={() => void resolveDiscussion(r, 'dismissed')}>{busyKey === `disc-${r.id}-dismissed` ? 'Memproses…' : 'Tolak Laporan'}</button>
                  </div>
                )}
              </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Laporan Moderasi Umum</h2>
        {modReports === null ? <MigrationNotice migration="008" /> : modReports.length === 0 ? (
          <p className="empty">Tidak ada laporan moderasi.</p>
        ) : (
          <ul className="discussion-list">
            {modReports.map((r) => {
              const info = targetLabels.get(`${r.target_type}:${r.target_id ?? ''}`)
              return (
              <li key={r.id} className="discussion-item">
                <p className="discussion-meta">{targetTypeLabel(r.target_type)} · {fmtDate(r.created_at)} · Status: {reportStatusLabel(r.status)}</p>
                <p>Pelapor: {names.get(r.reporter_id) ?? '—'}</p>
                <p>Alasan: {r.reason ?? '—'}</p>
                {info && info.to ? (
                  <p>
                    Target yang dilaporkan: <Link to={info.to}>{info.label}</Link>
                  </p>
                ) : (
                  <p className="muted">
                    Target yang dilaporkan: {info?.label ?? targetTypeLabel(r.target_type)}
                    {r.target_id ? ` (ID ${r.target_id.slice(0, 8)} — tidak dapat dibuka)` : ' — tidak tersedia.'}
                  </p>
                )}
                {r.status === 'open' && (
                  <div className="form-actions">
                    <button type="button" className="btn btn-primary btn-small" disabled={busyKey !== null} onClick={() => void resolveModeration(r, 'resolved')}>{busyKey === `mod-${r.id}-resolved` ? 'Memproses…' : 'Selesaikan'}</button>
                    <button type="button" className="btn btn-ghost btn-small" disabled={busyKey !== null} onClick={() => void resolveModeration(r, 'dismissed')}>{busyKey === `mod-${r.id}-dismissed` ? 'Memproses…' : 'Tolak Laporan'}</button>
                  </div>
                )}
              </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Audit Log (read-only)</h2>
        {audit === null ? <MigrationNotice migration="008" /> : audit.length === 0 ? (
          <p className="empty">Belum ada entri audit log.</p>
        ) : (
          <ul className="list">
            {audit.map((a) => (
              <li key={a.id}>
                {fmtDate(a.created_at)} — {activityLabel(a.action)}
                {a.actor_id ? ` oleh ${names.get(a.actor_id) ?? 'pengguna'}` : ' oleh Sistem'}
                {a.target_type ? ` (${targetTypeLabel(a.target_type)})` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
