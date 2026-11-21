// SINEVERSE, Komunitas: direktori komunitas yang disetujui + gabung/
// keluar + usulan komunitas baru dari anggota (004). Persetujuan admin
// membuat komunitas + menggabungkan pengusul (ditangani admin di Admin
// Panel; di sini usulan tercatat sebagai community_proposals 'pending').
//
// Per peran:
// - Siswa: seperti semula, semua community yang disetujui + tombol Gabung.
// - Mentor: community yang diikuti (status Anggota/Pembimbing + tombol
//   Buka), "Community Mencari Pembimbing" (011: community yang disetujui
//   dan menandai seeking_mentor, tombol "Jadi Pembimbing"), community
//   lain yang bisa diikuti (tombol Gabung); bisa mengusulkan community
//   baru. Pembuat community (atau admin, di halaman detail) bisa
//   menghidupkan/mematikan penanda "Mencari pembimbing".
// - Admin: TIDAK bergabung ke community. Tampilan moderasi: usulan
//   menunggu persetujuan (Setujui & Buat / Tolak), laporan community
//   (moderation_reports target community), semua community dengan status
//   persetujuan + jumlah anggota + aksi Hapus.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { fmtDate, isMissingTableError } from '../lib/guarded'
import { fetchProfileNames, logAudit, supabase } from '../lib/supabase'
import type {
  Community,
  CommunityProposal,
  ModerationReport,
} from '../lib/types'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

function memberRoleLabel(role: string | null): string {
  if (!role) return 'Anggota'
  if (role === 'member') return 'Anggota'
  if (role === 'mentor') return 'Pembimbing'
  return role
}

function proposalStatusLabel(status: CommunityProposal['status']): string {
  if (status === 'pending') return 'Menunggu persetujuan'
  if (status === 'approved') return 'Disetujui'
  return 'Ditolak'
}

function reportStatusLabel(status: ModerationReport['status']): string {
  if (status === 'open') return 'Terbuka'
  if (status === 'resolved') return 'Diselesaikan'
  return 'Ditolak'
}

function reportTargetTypeLabel(targetType: string): string {
  if (targetType === 'community') return 'Komunitas'
  if (targetType === 'community_post') return 'Postingan komunitas'
  return targetType
}

// Pesan ramah untuk kegagalan database, bukan teks mentah Supabase.
function friendlyDbError(): string {
  return 'Gagal menyimpan perubahan. Coba lagi nanti.'
}

export default function CommunitiesPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const [items, setItems] = useState<Community[] | null>(null)
  const [mine, setMine] = useState<Set<string>>(new Set())
  const [myRoles, setMyRoles] = useState<Map<string, string>>(new Map())
  // Mentor: community yang sedang mencari pembimbing (011).
  const [seeking, setSeeking] = useState<Community[]>([])
  const [memberCounts, setMemberCounts] = useState<Map<string, number>>(new Map())
  const [proposals, setProposals] = useState<CommunityProposal[]>([])
  const [proposalNames, setProposalNames] = useState<Map<string, string>>(new Map())
  const [myProposals, setMyProposals] = useState<CommunityProposal[]>([])
  const [modReports, setModReports] = useState<ModerationReport[] | null>([])
  const [reportTargets, setReportTargets] = useState<Map<string, { label: string; href: string | null }>>(new Map())
  const [reportReporters, setReportReporters] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')

  const isAdmin = profile?.role === 'admin'
  const isMentor = profile?.role === 'mentor'

  async function load() {
    try {
      const q = supabase.from('communities').select('*')
      const { data, error: qErr } = isAdmin
        ? await q.order('name')
        : await q.eq('is_approved', true).order('name')
      if (qErr) {
        if (isMissingTableError(qErr)) setItems(null)
        else throw qErr
        return
      }
      setItems((data ?? []) as Community[])
      let mineSet = new Set<string>()
      if (user) {
        const { data: mem } = await supabase
          .from('community_members')
          .select('community_id,role')
          .eq('user_id', user.id)
        const memRows = (mem ?? []) as { community_id: string; role: string | null }[]
        mineSet = new Set(memRows.map((m) => m.community_id))
        setMine(mineSet)
        setMyRoles(new Map(memRows.map((m) => [m.community_id, m.role ?? 'member'])))
      }
      // Mentor: community yang sedang mencari pembimbing (011) dan belum
      // diikuti mentor ini. Bila kolom seeking_mentor belum ada (migrasi
      // 011 belum diterapkan), query gagal, tampilkan daftar kosong,
      // bukan crash.
      if (isMentor) {
        const { data: seekData, error: seekErr } = await supabase
          .from('communities')
          .select('*')
          .eq('is_approved', true)
          .eq('seeking_mentor', true)
          .order('name')
        if (seekErr) setSeeking([])
        else setSeeking(((seekData ?? []) as Community[]).filter((c) => !mineSet.has(c.id)))
      } else {
        setSeeking([])
      }
      // Jumlah anggota per community (semua peran melihatnya).
      {
        const { data: allMem } = await supabase
          .from('community_members')
          .select('community_id')
        const counts = new Map<string, number>()
        for (const m of (allMem ?? []) as { community_id: string }[]) {
          counts.set(m.community_id, (counts.get(m.community_id) ?? 0) + 1)
        }
        setMemberCounts(counts)
      }
      // Usulan komunitas saya sendiri (semua status) agar pengusul bisa
      // melihat status usulannya.
      if (!isAdmin && user) {
        const { data: myPropData } = await supabase
          .from('community_proposals')
          .select('*')
          .eq('proposer_id', user.id)
          .order('created_at', { ascending: false })
        setMyProposals((myPropData ?? []) as CommunityProposal[])
      } else {
        setMyProposals([])
      }
      // Admin: usulan menunggu persetujuan + laporan community.
      if (isAdmin) {
        const { data: propData } = await supabase
          .from('community_proposals')
          .select('*')
          .eq('status', 'pending')
          .order('created_at')
        const props = (propData ?? []) as CommunityProposal[]
        setProposals(props)
        setProposalNames(
          await fetchProfileNames(props.map((p) => p.proposer_id)).catch(
            () => new Map<string, string>(),
          ),
        )
        const { data: repData, error: repErr } = await supabase
          .from('moderation_reports')
          .select('*')
          .eq('status', 'open')
          .order('created_at', { ascending: false })
        if (repErr) {
          if (isMissingTableError(repErr)) setModReports(null)
          else setModReports([])
        } else {
          const reports = ((repData ?? []) as ModerationReport[]).filter(
            (r) => r.target_type === 'community' || r.target_type === 'community_post',
          )
          setModReports(reports)
          // Selesaikan target laporan ke label yang bisa dibaca + tautan,
          // bukan UUID mentah.
          const targets = new Map<string, { label: string; href: string | null }>()
          const communityIds = reports
            .filter((r) => r.target_type === 'community' && r.target_id)
            .map((r) => r.target_id as string)
          const postIds = reports
            .filter((r) => r.target_type === 'community_post' && r.target_id)
            .map((r) => r.target_id as string)
          if (communityIds.length > 0) {
            const { data: comms } = await supabase
              .from('communities')
              .select('id,name')
              .in('id', communityIds)
            for (const c of (comms ?? []) as { id: string; name: string }[]) {
              targets.set(c.id, { label: c.name, href: `/komunitas/${c.id}` })
            }
          }
          if (postIds.length > 0) {
            const { data: postsData } = await supabase
              .from('community_posts')
              .select('id,body,community_id')
              .in('id', postIds)
            for (const p of (postsData ?? []) as { id: string; body: string; community_id: string }[]) {
              const excerpt = p.body.length > 60 ? `${p.body.slice(0, 60)}…` : p.body
              targets.set(p.id, { label: excerpt, href: `/komunitas/${p.community_id}` })
            }
          }
          setReportTargets(targets)
          setReportReporters(
            await fetchProfileNames(reports.map((r) => r.reporter_id)).catch(
              () => new Map<string, string>(),
            ),
          )
        }
      }
    } catch {
      setError('Gagal memuat komunitas. Coba lagi nanti.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profile?.role])

  async function toggleJoin(id: string, joined: boolean, communityName?: string) {
    if (!user) return
    if (joined) {
      if (!window.confirm('Yakin keluar dari community ini?')) return
      const wasMentor = myRoles.get(id) === 'mentor'
      const { error } = await supabase
        .from('community_members')
        .delete()
        .eq('community_id', id)
        .eq('user_id', user.id)
      if (error) {
        setNotice(friendlyDbError())
        return
      }
      // Mentor keluar: bila tidak ada lagi anggota pembimbing, hidupkan
      // lagi penanda "Mencari pembimbing" agar community bisa dicari
      // pembimbing baru.
      let seekingRestored = false
      if (wasMentor) {
        const { data: remaining } = await supabase
          .from('community_members')
          .select('role')
          .eq('community_id', id)
        const hasMentor = ((remaining ?? []) as { role: string | null }[]).some(
          (m) => m.role === 'mentor',
        )
        if (!hasMentor) {
          const { error: updErr } = await supabase
            .from('communities')
            .update({ seeking_mentor: true })
            .eq('id', id)
          seekingRestored = !updErr
        }
      }
      await logAudit('community.left', 'communities', id, {
        name: communityName ?? null,
        seeking_mentor_restored: seekingRestored,
      })
      setNotice(
        `Kamu sudah keluar dari community${communityName ? ` "${communityName}"` : ''}.` +
          (seekingRestored ? ' Community ini kembali ditandai sedang mencari pembimbing.' : ''),
      )
      await load()
    } else {
      const { error } = await supabase
        .from('community_members')
        .insert({ community_id: id, user_id: user.id, role: 'member' })
      if (error) setNotice(friendlyDbError())
      else {
        setMine((m) => new Set(m).add(id))
        setMyRoles((m) => new Map(m).set(id, 'member'))
      }
    }
  }

  // Mentor menjadi pembimbing community yang sedang mencari pembimbing
  // (011): gabung dengan role 'mentor' (atau naikkan role bila sudah
  // jadi anggota biasa) + matikan penanda seeking_mentor community itu.
  async function handleBecomeMentor(id: string, communityName: string) {
    if (!user) return
    const alreadyMember = mine.has(id)
    const { error: memErr } = alreadyMember
      ? await supabase
          .from('community_members')
          .update({ role: 'mentor' })
          .eq('community_id', id)
          .eq('user_id', user.id)
      : await supabase.from('community_members').insert({
          community_id: id,
          user_id: user.id,
          role: 'mentor',
        })
    if (memErr) {
      setNotice(friendlyDbError())
      return
    }
    const { error: updErr } = await supabase
      .from('communities')
      .update({ seeking_mentor: false })
      .eq('id', id)
    if (updErr) {
      // Keanggotaan pembimbing sudah tersimpan; penanda seeking gagal
      // dimatikan (mis. migrasi 011 belum diterapkan), beri tahu,
      // jangan diam.
      setNotice(
        `Kamu kini menjadi pembimbing "${communityName}", tetapi penanda "Mencari pembimbing" gagal dimatikan. Coba lagi nanti.`,
      )
    } else {
      setNotice(`Kamu kini menjadi pembimbing komunitas "${communityName}".`)
    }
    await logAudit('community.mentor_joined', 'communities', id, { name: communityName })
    await load()
  }

  async function handlePropose(e: FormEvent) {
    e.preventDefault()
    if (!user || !name.trim()) return
    const { error } = await supabase.from('community_proposals').insert({
      name: name.trim(),
      description: desc.trim() || null,
      proposer_id: user.id,
      status: 'pending',
    })
    if (error) setNotice(friendlyDbError())
    else {
      setNotice('Usulan komunitas terkirim. Admin akan meninjau. Bila disetujui, komunitas dibuat dan kamu langsung menjadi anggotanya.')
      setName('')
      setDesc('')
      await load()
    }
  }

  // --- Aksi admin (alur yang sama dengan Admin Panel / Moderasi) --------

  async function decideProposal(p: CommunityProposal, approve: boolean) {
    const { error: updErr } = await supabase
      .from('community_proposals')
      .update({ status: approve ? 'approved' : 'rejected', decided_by: user?.id ?? null })
      .eq('id', p.id)
    if (updErr) {
      setNotice(friendlyDbError())
      return
    }
    if (approve) {
      const { data: comm, error: cErr } = await supabase
        .from('communities')
        .insert({ name: p.name, description: p.description, created_by: p.proposer_id, is_approved: true })
        .select()
        .single()
      if (cErr) {
        setNotice(friendlyDbError())
        return
      }
      await supabase.from('community_members').insert({
        community_id: (comm as { id: string }).id,
        user_id: p.proposer_id,
        role: 'member',
      })
      await logAudit('community_proposal.approved', 'community_proposals', p.id, { community_id: (comm as { id: string }).id })
      setNotice(`Komunitas "${p.name}" dibuat dan pengusul langsung menjadi anggotanya.`)
    } else {
      setNotice('Usulan komunitas ditolak.')
    }
    await load()
  }

  async function handleDeleteCommunity(id: string, communityName: string) {
    if (!window.confirm(`Hapus komunitas "${communityName}" beserta semua postingan dan keanggotaannya? Tindakan ini tidak bisa dibatalkan.`)) return
    const { error: delErr } = await supabase.from('communities').delete().eq('id', id)
    if (delErr) setNotice(friendlyDbError())
    else {
      await logAudit('community.deleted', 'communities', id, { name: communityName })
      setNotice(`Komunitas "${communityName}" dihapus.`)
      await load()
    }
  }

  async function resolveModReport(r: ModerationReport, status: 'resolved' | 'dismissed') {
    const { error: updErr } = await supabase
      .from('moderation_reports')
      .update({ status, resolved_by: user?.id ?? null, resolved_at: new Date().toISOString() })
      .eq('id', r.id)
    if (updErr) {
      setNotice(friendlyDbError())
      return
    }
    await logAudit(`moderation_report.${status}`, 'moderation_reports', r.id, { target_type: r.target_type, target_id: r.target_id })
    setNotice(`Laporan moderasi ${status === 'resolved' ? 'diselesaikan' : 'ditolak'}.`)
    await load()
  }

  // Usulan komunitas yang diajukan pengguna ini, lengkap dengan statusnya.
  const myProposalsSection = user && myProposals.length > 0 ? (
    <section className="section">
      <h2>Usulan Saya ({myProposals.length})</h2>
      <ul className="discussion-list">
        {myProposals.map((p) => (
          <li key={p.id} className="discussion-item">
            <p>
              <strong>{p.name}</strong>
            </p>
            {p.description && <p>{p.description}</p>}
            <p className="muted">
              Status: {proposalStatusLabel(p.status)} · {fmtDate(p.created_at)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  ) : null

  if (loading || authLoading) return <div className="page"><p className="muted">Memuat komunitas…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (items === null) return <div className="page"><h1>Komunitas</h1><MigrationNotice migration="004" /></div>

  // --- Admin: moderasi (tidak bergabung ke community) ---------------------
  if (isAdmin) {
    return (
      <div className="page">
        <PageHeader
          icon="community"
          title="Community"
          subtitle="Moderasi Community. Admin tidak bergabung ke community."
        />
        {notice && <p className="notice-box">{notice}</p>}

        <section className="section">
          <h2>Usulan Komunitas Menunggu Persetujuan ({proposals.length})</h2>
          {proposals.length === 0 ? (
            <p className="empty">Tidak ada usulan komunitas yang menunggu.</p>
          ) : (
            <ul className="discussion-list">
              {proposals.map((p) => (
                <li key={p.id} className="discussion-item">
                  <p>
                    <strong>{p.name}</strong>
                  </p>
                  {p.description && <p>{p.description}</p>}
                  <p className="muted">
                    Pengusul: {proposalNames.get(p.proposer_id) ?? '—'} · {fmtDate(p.created_at)}
                  </p>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      onClick={() => void decideProposal(p, true)}
                    >
                      Setujui &amp; Buat
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => void decideProposal(p, false)}
                    >
                      Tolak
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Laporan Community</h2>
            <Link to="/admin/moderasi">Moderasi →</Link>
          </div>
          {modReports === null ? (
            <p className="empty">
              Tabel laporan belum tersedia.{' '}
              <Link to="/admin/moderasi">Lihat Moderasi</Link>
            </p>
          ) : modReports.length === 0 ? (
            <p className="empty">Tidak ada laporan community.</p>
          ) : (
            <ul className="discussion-list">
              {modReports.map((r) => {
                const target = r.target_id ? reportTargets.get(r.target_id) : undefined
                const targetLabel = target?.label ??
                  `${reportTargetTypeLabel(r.target_type)}${r.target_id ? ` #${r.target_id.slice(0, 8)}` : ''}`
                return (
                  <li key={r.id} className="discussion-item">
                    <p className="discussion-meta">
                      {target?.href ? <Link to={target.href}>{targetLabel}</Link> : targetLabel}
                      {' · '}
                      {fmtDate(r.created_at)} · Status: {reportStatusLabel(r.status)}
                    </p>
                    <p>Pelapor: {reportReporters.get(r.reporter_id) ?? '—'}</p>
                    <p>Alasan: {r.reason ?? '—'}</p>
                    <div className="form-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-small"
                        onClick={() => void resolveModReport(r, 'resolved')}
                      >
                        Selesaikan
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={() => void resolveModReport(r, 'dismissed')}
                      >
                        Tolak Laporan
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Semua Community ({items.length})</h2>
            <Link to="/admin">Admin Panel →</Link>
          </div>
          {items.length === 0 ? (
            <EmptyState message="Belum ada community." />
          ) : (
            <ul className="discussion-list">
              {items.map((c) => (
                <li key={c.id} className="discussion-item">
                  <p className="discussion-meta">
                    {c.is_approved ? 'Disetujui' : 'Belum disetujui'} ·{' '}
                    {memberCounts.get(c.id) ?? 0} anggota
                    {c.seeking_mentor ? ' · Mencari pembimbing' : ''}
                  </p>
                  <h3>
                    <Link to={`/komunitas/${c.id}`}>{c.name}</Link>
                  </h3>
                  {c.description && <p>{c.description}</p>}
                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => void handleDeleteCommunity(c.id, c.name)}
                    >
                      Hapus Komunitas
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    )
  }

  // --- Mentor: community yang diikuti + community lain --------------------
  if (isMentor) {
    const joined = items.filter((c) => mine.has(c.id))
    // Community yang sedang mencari pembimbing hanya tampil di bagian
    // "Community Mencari Pembimbing", bukan juga di "Community Lain".
    const others = items.filter((c) => !mine.has(c.id) && !c.seeking_mentor)
    return (
      <div className="page">
        <PageHeader
          icon="community"
          title="Community"
          subtitle="Community yang kamu ikuti dan community lain yang bisa kamu ikuti."
        />
        {notice && <p className="notice-box">{notice}</p>}

        <section className="section">
          <h2>Community Mencari Pembimbing ({seeking.length})</h2>
          <p className="muted">
            Community yang sedang membutuhkan pembimbing. Jadi pembimbing berarti kamu membimbing
            diskusi dan karya anggota community itu.
          </p>
          {seeking.length === 0 ? (
            <p className="empty">Tidak ada community yang sedang mencari pembimbing saat ini.</p>
          ) : (
            <ul className="course-list">
              {seeking.map((c) => (
                <li key={c.id} className="course-card">
                  <Link to={`/komunitas/${c.id}`}>
                    <h3>{c.name}</h3>
                    <p>{c.description ?? 'Komunitas SINEVERSE.'}</p>
                    <p className="muted">
                      Mencari pembimbing · {memberCounts.get(c.id) ?? 0} anggota
                    </p>
                  </Link>
                  <div style={{ padding: '0 1.25rem 1rem' }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      onClick={() => void handleBecomeMentor(c.id, c.name)}
                    >
                      Jadi Pembimbing
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="section">
          <h2>Community yang Kamu Ikuti ({joined.length})</h2>
          {joined.length === 0 ? (
            <p className="empty">Kamu belum mengikuti community apa pun.</p>
          ) : (
            <ul className="course-list">
              {joined.map((c) => (
                <li key={c.id} className="course-card">
                  <Link to={`/komunitas/${c.id}`}>
                    <h3>{c.name}</h3>
                    <p>{c.description ?? 'Komunitas SINEVERSE.'}</p>
                    <p className="muted">
                      Status: {memberRoleLabel(myRoles.get(c.id) ?? 'member')} ·{' '}
                      {memberCounts.get(c.id) ?? 0} anggota
                    </p>
                  </Link>
                  <div style={{ padding: '0 1.25rem 1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <Link to={`/komunitas/${c.id}`} className="btn btn-primary btn-small">
                      Buka
                    </Link>
                    {myRoles.get(c.id) === 'member' && c.seeking_mentor ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-small"
                        onClick={() => void handleBecomeMentor(c.id, c.name)}
                      >
                        Jadi Pembimbing
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => void toggleJoin(c.id, true, c.name)}
                    >
                      Keluar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="section">
          <h2>Community Lain ({others.length})</h2>
          {others.length === 0 ? (
            <p className="empty">Tidak ada community lain saat ini.</p>
          ) : (
            <ul className="course-list">
              {others.map((c) => (
                <li key={c.id} className="course-card">
                  <Link to={`/komunitas/${c.id}`}>
                    <h3>{c.name}</h3>
                    <p>{c.description ?? 'Komunitas SINEVERSE.'}</p>
                    <p className="muted">{memberCounts.get(c.id) ?? 0} anggota</p>
                  </Link>
                  {user && (
                    <div style={{ padding: '0 1.25rem 1rem' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        onClick={() => void toggleJoin(c.id, false, c.name)}
                      >
                        Gabung
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {user && (
          <section className="section">
            <h2>Usulkan Komunitas Baru</h2>
            <form className="form" onSubmit={handlePropose}>
              <label>
                Nama komunitas
                <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Mis. Klub Film Bandung" />
              </label>
              <label>
                Deskripsi
                <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="Komunitas ini tentang…" />
              </label>
              <button type="submit" className="btn btn-primary">Kirim Usulan</button>
            </form>
          </section>
        )}

        {myProposalsSection}
      </div>
    )
  }

  // --- Siswa (dan pengunjung logout): seperti semula -----------------------
  return (
    <div className="page">
      <PageHeader
        icon="community"
        title="Community"
        subtitle="Bergabung dengan komunitas filmmaker pelajar di seluruh Indonesia."
      />
      {notice && <p className="notice-box">{notice}</p>}
      {items.length === 0 ? (
        <EmptyState message="Belum ada komunitas yang disetujui." />
      ) : (
        <ul className="course-list">
          {items.map((c) => (
            <li key={c.id} className="course-card">
              <Link to={`/komunitas/${c.id}`}>
                <h3>{c.name}</h3>
                <p>{c.description ?? 'Komunitas SINEVERSE.'}</p>
                <p className="muted">{memberCounts.get(c.id) ?? 0} anggota</p>
              </Link>
              {user && (
                <div style={{ padding: '0 1.25rem 1rem' }}>
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => void toggleJoin(c.id, mine.has(c.id), c.name)}>
                    {mine.has(c.id) ? 'Keluar' : 'Gabung'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {user && (
        <section className="section">
          <h2>Usulkan Komunitas Baru</h2>
          <form className="form" onSubmit={handlePropose}>
            <label>
              Nama komunitas
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Mis. Klub Film Bandung" />
            </label>
            <label>
              Deskripsi
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="Komunitas ini tentang…" />
            </label>
            <button type="submit" className="btn btn-primary">Kirim Usulan</button>
          </form>
        </section>
      )}
      {myProposalsSection}
    </div>
  )
}
