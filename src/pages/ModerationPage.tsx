// SINEVERSE — Moderasi admin (003 + 008): laporan diskusi + laporan
// moderasi umum, resolve/dismiss; audit log read-only (ditulis lewat
// log_audit() RPC saja — aplikasi tidak pernah insert langsung).
// Fase 6 (070): antrean laporan semua ruang + aksi (sembunyikan / hapus
// paksa / peringatan / blokir), pengguna diblokir, filter konten, hak
// moderasi mentor, riwayat moderation_actions.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import MigrationNotice from '../components/MigrationNotice'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { activityLabel } from '../lib/activityLabels'
import { fmtDate, isMissingTableError } from '../lib/guarded'
import {
  TARGET_TABLE,
  blockUser,
  createModerationFilter,
  deleteModerationFilter,
  fetchMentorPermissions,
  fetchMentors,
  fetchModerationActions,
  fetchModerationFilters,
  fetchUserBlocks,
  forceDeleteContent,
  hideContent,
  setMentorPermission,
  setModerationFilterActive,
  unblockUser,
  warnUser,
} from '../lib/moderation'
import type {
  MentorLite,
  MentorModerationPermission,
  ModerationAction,
  ModerationFilter,
  ModerationTargetType,
  UserBlock,
} from '../lib/moderation'
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
  // Fase 6 (070): target baru dari keempat ruang baru.
  if (t === 'mentor_group_message') return 'Pesan grup mentor'
  if (t === 'community_reply') return 'Balasan community'
  if (t === 'project_chat_message') return 'Pesan chat proyek'
  if (t === 'announcement') return 'Pengumuman'
  return t
}

// Label aksi moderasi (070) dalam Bahasa Indonesia.
function moderationActionLabel(action: string): string {
  if (action === 'hapus_pesan') return 'Hapus pesan'
  if (action === 'sembunyikan') return 'Sembunyikan konten'
  if (action === 'tampilkan_kembali') return 'Tampilkan kembali'
  if (action === 'peringatan') return 'Peringatan'
  if (action === 'blokir') return 'Blokir pengguna'
  if (action === 'buka_blokir') return 'Buka blokir'
  return action
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
  // Fase 6 (070): blokir, riwayat tindakan, filter, hak mentor.
  // null = migrasi 070 belum diterapkan (tampil MigrationNotice).
  const [blocks, setBlocks] = useState<UserBlock[] | null>(null)
  const [actions, setActions] = useState<ModerationAction[] | null>(null)
  const [filters, setFilters] = useState<ModerationFilter[] | null>(null)
  const [permissions, setPermissions] = useState<MentorModerationPermission[] | null>(null)
  const [mentors, setMentors] = useState<MentorLite[] | null>(null)
  const [newPattern, setNewPattern] = useState('')
  const [filterBusy, setFilterBusy] = useState(false)

  async function load() {
    try {
      // Ketiga select independen: jalankan paralel, lalu terapkan
      // penanganan error masing-masing dengan urutan yang sama seperti
      // semula (missing table -> null, error lain -> throw).
      const [dRes, mRes, aRes, blocksRes, actionsRes, filtersRes, permsRes, mentorsRes] = await Promise.all([
        supabase.from('discussion_reports').select('*').order('created_at', { ascending: false }),
        supabase.from('moderation_reports').select('*').order('created_at', { ascending: false }),
        supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(100),
        // Fase 6 (070): best-effort — null bila migrasi 070 belum diterapkan.
        fetchUserBlocks().catch(() => null),
        fetchModerationActions().catch(() => null),
        fetchModerationFilters().catch(() => null),
        fetchMentorPermissions().catch(() => null),
        fetchMentors().catch(() => null),
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
      setBlocks(blocksRes)
      setActions(actionsRes)
      setFilters(filtersRes)
      setPermissions(permsRes)
      setMentors(mentorsRes)
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
          // Fase 6 (070): pelaku tindakan, pengguna diblokir, mentor,
          // dan pengguna yang dilaporkan langsung (target_type 'user').
          ...(actionsRes ?? []).map((a) => a.actor_id),
          ...(blocksRes ?? []).map((b) => b.blocked_id),
          ...(permsRes ?? []).map((p) => p.mentor_id),
          ...mRows
            .filter((r) => r.target_type === 'user' && r.target_id)
            .map((r) => r.target_id as string),
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
          } else if (r.target_type === 'mentor_group_message') {
            const { data } = await supabase.from('mentor_group_messages').select('body').eq('id', r.target_id).maybeSingle()
            const row = data as { body: string | null } | null
            labels.set(key, row ? { label: row.body ? row.body.slice(0, 80) : targetTypeLabel(r.target_type), to: '/komunitas-mentor' } : fallback)
          } else if (r.target_type === 'community_reply') {
            const { data } = await supabase.from('community_post_replies').select('body,post_id').eq('id', r.target_id).maybeSingle()
            const row = data as { body: string | null; post_id: string } | null
            if (row) {
              const { data: postData } = await supabase.from('community_posts').select('community_id').eq('id', row.post_id).maybeSingle()
              const postRow = postData as { community_id: string } | null
              labels.set(key, { label: row.body ? row.body.slice(0, 80) : targetTypeLabel(r.target_type), to: postRow ? `/komunitas/${postRow.community_id}` : null })
            } else labels.set(key, fallback)
          } else if (r.target_type === 'project_chat_message') {
            const { data } = await supabase.from('project_chat_messages').select('body,project_id').eq('id', r.target_id).maybeSingle()
            const row = data as { body: string | null; project_id: string } | null
            labels.set(key, row ? { label: row.body ? row.body.slice(0, 80) : targetTypeLabel(r.target_type), to: `/proyek/${row.project_id}/chat` } : fallback)
          } else if (r.target_type === 'announcement') {
            const { data } = await supabase.from('announcements').select('title').eq('id', r.target_id).maybeSingle()
            const row = data as { title: string } | null
            labels.set(key, row ? { label: row.title, to: `/pengumuman?id=${r.target_id}` } : fallback)
          } else if (r.target_type === 'user') {
            labels.set(key, { label: namesMap.get(r.target_id) ?? 'Pengguna', to: null })
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

  /** Ubah status laporan + audit; true bila berhasil (tanpa busy guard,
      supaya bisa dipakai handler aksi yang sudah memegang busyKey). */
  async function updateReportStatus(r: ModerationReport, status: 'resolved' | 'dismissed'): Promise<boolean> {
    const { error: updErr } = await supabase
      .from('moderation_reports')
      .update({ status, resolved_by: user?.id ?? null, resolved_at: new Date().toISOString() })
      .eq('id', r.id)
    if (updErr) {
      setNotice(updErr.message)
      return false
    }
    await logAudit(`moderation_report.${status}`, 'moderation_reports', r.id, { target_type: r.target_type, target_id: r.target_id })
    return true
  }

  async function resolveModeration(r: ModerationReport, status: 'resolved' | 'dismissed') {
    // B65: kunci busy per laporan.
    const key = `mod-${r.id}-${status}`
    if (busyKey) return
    setBusyKey(key)
    try {
      if (await updateReportStatus(r, status)) {
        setNotice(`Laporan moderasi ${status === 'resolved' ? 'diselesaikan' : 'ditolak'}.`)
        await load()
      }
    } finally {
      setBusyKey(null)
    }
  }

  /** Fase 6 (070): id penulis konten yang dilaporkan (untuk peringatan /
      blokir). Target 'user' = dirinya sendiri. */
  async function fetchTargetAuthorId(r: ModerationReport): Promise<string | null> {
    if (!r.target_id) return null
    if (r.target_type === 'user') return r.target_id
    const table = TARGET_TABLE[r.target_type as ModerationTargetType]
    if (!table) return null
    const col =
      r.target_type === 'announcement'
        ? 'created_by'
        : r.target_type === 'community_post' || r.target_type === 'community_reply'
          ? 'user_id'
          : 'sender_id'
    const { data } = await supabase.from(table).select(col).eq('id', r.target_id).maybeSingle()
    const row = data as Record<string, string | null> | null
    return row?.[col] ?? null
  }

  /** Fase 6 (070): sembunyikan konten + selesaikan laporan. */
  async function handleHideReport(r: ModerationReport) {
    const key = `hide-${r.id}`
    if (busyKey) return
    setBusyKey(key)
    try {
      const table = TARGET_TABLE[r.target_type as ModerationTargetType]
      if (!table || !r.target_id) {
        setNotice('Target laporan ini tidak bisa disembunyikan.')
        return
      }
      await hideContent(table, r.target_id, true, r.reason ?? undefined)
      if (await updateReportStatus(r, 'resolved')) {
        setNotice('Konten disembunyikan dan laporan diselesaikan.')
        await load()
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal menyembunyikan konten.')
    } finally {
      setBusyKey(null)
    }
  }

  /** Fase 6 (070): hapus paksa konten (hard delete admin) + selesaikan laporan. */
  async function handleForceDeleteReport(r: ModerationReport) {
    const key = `forcedel-${r.id}`
    if (busyKey) return
    setBusyKey(key)
    try {
      const table = TARGET_TABLE[r.target_type as ModerationTargetType]
      if (!table || !r.target_id) {
        setNotice('Target laporan ini tidak bisa dihapus.')
        return
      }
      await forceDeleteContent(table, r.target_type as ModerationTargetType, r.target_id, r.reason ?? undefined)
      if (await updateReportStatus(r, 'resolved')) {
        setNotice('Konten dihapus dan laporan diselesaikan.')
        await load()
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal menghapus konten.')
    } finally {
      setBusyKey(null)
    }
  }

  /** Fase 6 (070): kirim peringatan ke penulis konten + selesaikan laporan. */
  async function handleWarnReport(r: ModerationReport) {
    const key = `warn-${r.id}`
    if (busyKey) return
    setBusyKey(key)
    try {
      const authorId = await fetchTargetAuthorId(r)
      if (!authorId) {
        setNotice('Penulis konten yang dilaporkan tidak ditemukan.')
        return
      }
      await warnUser(authorId, r.reason ?? 'Perilakumu di SINEVERSE melanggar aturan komunitas.')
      if (await updateReportStatus(r, 'resolved')) {
        setNotice('Peringatan dikirim dan laporan diselesaikan.')
        await load()
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal mengirim peringatan.')
    } finally {
      setBusyKey(null)
    }
  }

  /** Fase 6 (070): blokir penulis konten (global) + selesaikan laporan. */
  async function handleBlockReport(r: ModerationReport) {
    const key = `block-${r.id}`
    if (busyKey) return
    setBusyKey(key)
    try {
      const authorId = await fetchTargetAuthorId(r)
      if (!authorId) {
        setNotice('Pengguna yang dilaporkan tidak ditemukan.')
        return
      }
      await blockUser(authorId, r.reason ?? 'Diblokir dari laporan moderasi.')
      if (await updateReportStatus(r, 'resolved')) {
        setNotice('Pengguna diblokir dan laporan diselesaikan.')
        await load()
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal memblokir pengguna.')
    } finally {
      setBusyKey(null)
    }
  }

  /** Fase 6 (070): buka blokir pengguna. */
  async function handleUnblock(b: UserBlock) {
    const key = `unblock-${b.id}`
    if (busyKey) return
    setBusyKey(key)
    try {
      await unblockUser(b.id, b.blocked_id)
      setNotice(`Blokir untuk ${b.blocked_name ?? 'pengguna'} dibuka.`)
      await load()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal membuka blokir.')
    } finally {
      setBusyKey(null)
    }
  }

  /** Fase 6 (070): tambah pola filter konten. */
  async function handleAddFilter(e: FormEvent) {
    e.preventDefault()
    const pattern = newPattern.trim()
    if (pattern === '') return
    setFilterBusy(true)
    try {
      await createModerationFilter(pattern)
      setNewPattern('')
      setNotice('Filter konten ditambahkan.')
      await load()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal menambahkan filter.')
    } finally {
      setFilterBusy(false)
    }
  }

  /** Fase 6 (070): aktif/nonaktifkan atau hapus pola filter konten. */
  async function handleToggleFilter(f: ModerationFilter) {
    const key = `filter-${f.id}-toggle`
    if (busyKey) return
    setBusyKey(key)
    try {
      await setModerationFilterActive(f.id, !f.is_active)
      setNotice(`Filter "${f.pattern}" ${f.is_active ? 'dinonaktifkan' : 'diaktifkan'}.`)
      await load()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal mengubah filter.')
    } finally {
      setBusyKey(null)
    }
  }

  async function handleDeleteFilter(f: ModerationFilter) {
    const key = `filter-${f.id}-delete`
    if (busyKey) return
    setBusyKey(key)
    try {
      await deleteModerationFilter(f.id)
      setNotice(`Filter "${f.pattern}" dihapus.`)
      await load()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal menghapus filter.')
    } finally {
      setBusyKey(null)
    }
  }

  /** Fase 6 (070): ubah satu saklar hak moderasi mentor. */
  async function handleTogglePermission(
    mentorId: string,
    field: 'can_pin' | 'can_hide' | 'can_warn',
    value: boolean,
  ) {
    const key = `perm-${mentorId}-${field}`
    if (busyKey) return
    setBusyKey(key)
    try {
      await setMentorPermission(mentorId, { [field]: value })
      setNotice('Hak moderasi mentor diperbarui.')
      await load()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal memperbarui hak moderasi.')
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
                    {r.target_id && r.target_type !== 'user' && (
                      <>
                        <button type="button" className="btn btn-ghost btn-small" disabled={busyKey !== null} onClick={() => void handleHideReport(r)}>Sembunyikan</button>
                        <button type="button" className="btn btn-ghost btn-small" disabled={busyKey !== null} onClick={() => void handleForceDeleteReport(r)}>Hapus paksa</button>
                        <button type="button" className="btn btn-ghost btn-small" disabled={busyKey !== null} onClick={() => void handleWarnReport(r)}>Peringatkan penulis</button>
                      </>
                    )}
                    {r.target_id && (
                      <button type="button" className="btn btn-ghost btn-small" disabled={busyKey !== null} onClick={() => void handleBlockReport(r)}>Blokir pengguna</button>
                    )}
                  </div>
                )}
              </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Pengguna yang Diblokir</h2>
        <p className="muted">
          Pengguna yang diblokir tidak bisa mengirim di ruang mana pun, pesannya disembunyikan
          dari bukan-admin, dan tidak bisa disebut (@mention) oleh siapa pun.
        </p>
        {blocks === null ? <MigrationNotice migration="070" /> : blocks.length === 0 ? (
          <p className="empty">Tidak ada pengguna yang diblokir.</p>
        ) : (
          <ul className="discussion-list">
            {blocks.map((b) => (
              <li key={b.id} className="discussion-item">
                <p>{b.blocked_name ?? b.blocked_id}</p>
                <p className="discussion-meta">
                  {fmtDate(b.created_at)}
                  {b.reason ? ` · Alasan: ${b.reason}` : ''}
                </p>
                <div className="form-actions">
                  <button type="button" className="btn btn-ghost btn-small" disabled={busyKey !== null} onClick={() => void handleUnblock(b)}>
                    {busyKey === `unblock-${b.id}` ? 'Memproses…' : 'Buka blokir'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Filter Konten</h2>
        <p className="muted">
          Kata atau frasa di daftar ini ditolak server saat ada yang mencoba mengirimnya
          (cocok substring, tanpa memperhatikan huruf besar/kecil). Pola yang ditolak tidak
          ditampilkan ke pengguna — mereka hanya melihat pesan penolakan.
        </p>
        {filters === null ? <MigrationNotice migration="070" /> : (
          <>
            <form className="form form-inline" onSubmit={(e) => void handleAddFilter(e)}>
              <label>
                Pola baru
                <input
                  type="text"
                  value={newPattern}
                  onChange={(e) => setNewPattern(e.target.value)}
                  placeholder="contoh: judi online"
                />
              </label>
              <button type="submit" className="btn btn-primary btn-small" disabled={filterBusy || newPattern.trim() === ''}>
                {filterBusy ? 'Menyimpan…' : 'Tambah filter'}
              </button>
            </form>
            {filters.length === 0 ? (
              <p className="empty">Belum ada filter konten.</p>
            ) : (
              <ul className="discussion-list">
                {filters.map((f) => (
                  <li key={f.id} className="discussion-item">
                    <p>
                      {f.pattern}
                      {f.is_active ? '' : ' (nonaktif)'}
                    </p>
                    <p className="discussion-meta">{fmtDate(f.created_at)}</p>
                    <div className="form-actions">
                      <button type="button" className="btn btn-ghost btn-small" disabled={busyKey !== null} onClick={() => void handleToggleFilter(f)}>
                        {f.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                      <button type="button" className="btn btn-ghost btn-small" disabled={busyKey !== null} onClick={() => void handleDeleteFilter(f)}>
                        Hapus
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="section">
        <h2>Hak Moderasi Mentor</h2>
        <p className="muted">
          Atur apa yang boleh dilakukan tiap mentor. Tanpa baris di sini, mentor tetap bisa
          menyematkan di chat proyek (perilaku lama), tapi tidak bisa menyematkan di community
          dan tidak bisa menyembunyikan konten atau memberi peringatan. Pin grup mentor tetap
          admin-only.
        </p>
        {permissions === null || mentors === null ? <MigrationNotice migration="070" /> : mentors.length === 0 ? (
          <p className="empty">Belum ada mentor.</p>
        ) : (
          <ul className="discussion-list">
            {mentors.map((m) => {
              const perm = permissions.find((p) => p.mentor_id === m.id)
              const canPin = perm?.can_pin ?? true
              const canHide = perm?.can_hide ?? false
              const canWarn = perm?.can_warn ?? false
              return (
                <li key={m.id} className="discussion-item">
                  <p>{m.name ?? m.id}</p>
                  <div className="form-actions">
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      <input
                        type="checkbox"
                        checked={canPin}
                        disabled={busyKey !== null}
                        onChange={() => void handleTogglePermission(m.id, 'can_pin', !canPin)}
                      />
                      Sematkan
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      <input
                        type="checkbox"
                        checked={canHide}
                        disabled={busyKey !== null}
                        onChange={() => void handleTogglePermission(m.id, 'can_hide', !canHide)}
                      />
                      Sembunyikan
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      <input
                        type="checkbox"
                        checked={canWarn}
                        disabled={busyKey !== null}
                        onChange={() => void handleTogglePermission(m.id, 'can_warn', !canWarn)}
                      />
                      Peringatan
                    </label>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Riwayat Tindakan Moderasi</h2>
        {actions === null ? <MigrationNotice migration="070" /> : actions.length === 0 ? (
          <p className="empty">Belum ada tindakan moderasi.</p>
        ) : (
          <ul className="list">
            {actions.map((a) => (
              <li key={a.id}>
                {fmtDate(a.created_at)} — {a.actor_name ?? 'Admin'}: {moderationActionLabel(a.action)}
                {a.target_type ? ` (${targetTypeLabel(a.target_type)})` : ''}
                {a.reason ? ` — ${a.reason}` : ''}
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
