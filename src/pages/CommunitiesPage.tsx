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
import {
  COMMUNITY_AVATAR_PRESETS,
  communityAvatarLetter,
  coverValueFromChoice,
  resolveCommunityAvatar,
  uploadCommunityAvatar,
} from '../lib/communityAvatar'
import { fmtDate, isMissingTableError } from '../lib/guarded'
import { fetchCommunities, fetchProfileNames, invalidateCatalogCache, logAudit, supabase } from '../lib/supabase'
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

/** Avatar bulat komunitas: foto bila cover_url berupa URL, ubin inisial bila preset/kosong. */
function CommunityAvatarBadge({
  coverUrl,
  name,
  size,
}: {
  coverUrl: string | null
  name: string
  size?: number
}) {
  const avatar = resolveCommunityAvatar(coverUrl, name)
  const px = size ?? 48
  if (avatar.kind === 'image') {
    return (
      <img
        src={avatar.url}
        alt=""
        style={{ width: px, height: px, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      style={{
        width: px,
        height: px,
        borderRadius: '50%',
        background: avatar.bg,
        color: avatar.fg,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize: px * 0.45,
        flexShrink: 0,
      }}
    >
      {avatar.letter}
    </span>
  )
}

interface CommunityAvatarPickerProps {
  /** Nama komunitas yang diketik (huruf awalnya tampil di ubin preset). */
  name: string
  presetId: string | null
  uploadUrl: string | null
  uploading: boolean
  error: string | null
  onSelectPreset: (id: string | null) => void
  onUploadFile: (file: File | null) => void
  onClear: () => void
}

/**
 * Picker avatar komunitas: 8 preset ubin inisial + unggah foto sendiri.
 * Preset dan foto saling meniadakan (yang terakhir dipilih yang berlaku);
 * "Hapus pilihan avatar" mengembalikan ke ubin inisial baku.
 */
function CommunityAvatarPicker({
  name,
  presetId,
  uploadUrl,
  uploading,
  error,
  onSelectPreset,
  onUploadFile,
  onClear,
}: CommunityAvatarPickerProps) {
  const letter = communityAvatarLetter(name)
  return (
    <div>
      <p style={{ fontWeight: 700, margin: '0 0 0.5rem' }}>Pilih avatar</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {COMMUNITY_AVATAR_PRESETS.map((p) => {
          const selected = presetId === p.id && !uploadUrl
          return (
            <button
              key={p.id}
              type="button"
              title={p.label}
              aria-label={`Avatar ${p.label}`}
              aria-pressed={selected}
              onClick={() => onSelectPreset(selected ? null : p.id)}
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                border: 'none',
                background: p.bg,
                color: p.fg,
                fontWeight: 800,
                fontSize: '1.1rem',
                cursor: 'pointer',
                outline: selected ? '2px solid #172438' : '2px solid transparent',
                outlineOffset: 2,
              }}
            >
              {letter}
            </button>
          )
        })}
      </div>
      <p style={{ fontWeight: 700, margin: '1rem 0 0.5rem' }}>Unggah foto sendiri</p>
      {uploadUrl ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img
            src={uploadUrl}
            alt="Pratinjau avatar komunitas"
            style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }}
          />
          <button type="button" className="btn btn-ghost btn-small" onClick={() => onUploadFile(null)}>
            Hapus foto
          </button>
        </div>
      ) : (
        <>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onUploadFile(e.target.files?.[0] ?? null)}
          />
          {uploading && <p className="muted">Mengunggah foto…</p>}
        </>
      )}
      {error && <p className="error-box">{error}</p>}
      {(presetId || uploadUrl) && (
        <p>
          <button type="button" className="btn btn-ghost btn-small" onClick={onClear}>
            Hapus pilihan avatar
          </button>
        </p>
      )}
    </div>
  )
}

// Pilihan avatar pengusul disimpan lokal per id usulan sampai migrasi 031
// menambahkan community_proposals.cover_url (lihat laporan TUGAS 3).
// Hanya pengusul yang melihatnya di "Usulan Saya"; admin belum bisa
// melihat pilihan ini sebelum 031 diterapkan.
const PROPOSAL_AVATARS_KEY = 'sineverse:proposal-avatars'

function readProposalAvatars(): Map<string, string> {
  try {
    const raw = localStorage.getItem(PROPOSAL_AVATARS_KEY)
    if (!raw) return new Map()
    return new Map(Object.entries(JSON.parse(raw) as Record<string, string>))
  } catch {
    return new Map()
  }
}

function saveProposalAvatar(proposalId: string, coverUrl: string) {
  try {
    const map = readProposalAvatars()
    map.set(proposalId, coverUrl)
    localStorage.setItem(PROPOSAL_AVATARS_KEY, JSON.stringify(Object.fromEntries(map)))
  } catch {
    // Penyimpanan lokal gagal: usulan tetap terkirim, avatarnya saja hilang.
  }
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
  // Pilihan avatar di form usulan: preset atau foto yang diunggah (saling
  // meniadakan). Nilai efektifnya dibawa handlePropose (lihat di bawah).
  const [avatarPreset, setAvatarPreset] = useState<string | null>(null)
  const [avatarUploadUrl, setAvatarUploadUrl] = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  // Pilihan avatar pengusul yang tersimpan lokal per id usulan (pra-031).
  const [proposalAvatars, setProposalAvatars] = useState<Map<string, string>>(new Map())

  // Nilai cover_url efektif dari picker form usulan.
  const proposeCoverUrl = coverValueFromChoice(avatarUploadUrl, avatarPreset)

  useEffect(() => {
    setProposalAvatars(readProposalAvatars())
  }, [])

  const isAdmin = profile?.role === 'admin'
  const isMentor = profile?.role === 'mentor'

  async function load() {
    try {
      // Daftar community (katalog, di-cache). Admin melihat semua, yang lain
      // hanya yang disetujui — filter diterapkan di JS supaya hasil cache
      // yang sama bisa dipakai kedua peran.
      let all: Community[]
      try {
        all = await fetchCommunities()
      } catch (err) {
        if (isMissingTableError(err)) {
          setItems(null)
          return
        }
        throw err
      }
      const visible = isAdmin ? all : all.filter((c) => c.is_approved)
      visible.sort((a, b) => a.name.localeCompare(b.name, 'id'))
      setItems(visible)
      // Semua fetch independen di bawah ini dijalankan paralel dalam satu
      // batch; yang bergantung pada hasilnya (seeking butuh mineSet, nama
      // butuh usulan/laporan) menyusul di batch kedua.
      const [memRes, allMemRes, myPropRes, propRes, repRes] = await Promise.all([
        user
          ? supabase.from('community_members').select('community_id,role').eq('user_id', user.id)
          : Promise.resolve({ data: null as { community_id: string; role: string | null }[] | null }),
        supabase.from('community_members').select('community_id'),
        !isAdmin && user
          ? supabase
              .from('community_proposals')
              .select('*')
              .eq('proposer_id', user.id)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: null as CommunityProposal[] | null }),
        isAdmin
          ? supabase.from('community_proposals').select('*').eq('status', 'pending').order('created_at')
          : Promise.resolve({ data: null as CommunityProposal[] | null }),
        isAdmin
          ? supabase.from('moderation_reports').select('*').eq('status', 'open').order('created_at', { ascending: false })
          : Promise.resolve({ data: null as ModerationReport[] | null, error: null }),
      ])
      let mineSet = new Set<string>()
      if (user) {
        const memRows = (memRes.data ?? []) as { community_id: string; role: string | null }[]
        mineSet = new Set(memRows.map((m) => m.community_id))
        setMine(mineSet)
        setMyRoles(new Map(memRows.map((m) => [m.community_id, m.role ?? 'member'])))
      }
      // Jumlah anggota per community (semua peran melihatnya).
      {
        const counts = new Map<string, number>()
        for (const m of (allMemRes.data ?? []) as { community_id: string }[]) {
          counts.set(m.community_id, (counts.get(m.community_id) ?? 0) + 1)
        }
        setMemberCounts(counts)
      }
      // Usulan komunitas saya sendiri (semua status) agar pengusul bisa
      // melihat status usulannya.
      if (!isAdmin && user) {
        setMyProposals((myPropRes.data ?? []) as CommunityProposal[])
      } else {
        setMyProposals([])
      }
      // Admin: usulan menunggu persetujuan + laporan community.
      const props = isAdmin ? ((propRes.data ?? []) as CommunityProposal[]) : []
      if (isAdmin) setProposals(props)
      const repErr = repRes.error
      if (isAdmin && repErr) {
        if (isMissingTableError(repErr)) setModReports(null)
        else setModReports([])
        // Bila laporan gagal dimuat, daftar seeking mentor tetap dimuat
        // di bawah (tidak bergantung pada laporan).
      }
      const reports =
        isAdmin && !repErr
          ? (((repRes.data ?? []) as ModerationReport[]).filter(
              (r) => r.target_type === 'community' || r.target_type === 'community_post',
            ))
          : []
      if (isAdmin && !repErr) setModReports(reports)
      // Batch kedua (paralel): seeking butuh mineSet; nama pengusul butuh
      // usulan; target + pelapor laporan butuh daftar laporan. Dua lookup
      // target (nama community dan isi postingan) juga paralel.
      const communityIds = reports
        .filter((r) => r.target_type === 'community' && r.target_id)
        .map((r) => r.target_id as string)
      const postIds = reports
        .filter((r) => r.target_type === 'community_post' && r.target_id)
        .map((r) => r.target_id as string)
      const [seekRes, proposalNamesRes, commsRes, postsRes, reporterNamesRes] = await Promise.all([
        isMentor
          ? supabase
              .from('communities')
              .select('*')
              .eq('is_approved', true)
              .eq('seeking_mentor', true)
              .order('name')
          : Promise.resolve({ data: null as Community[] | null, error: null }),
        isAdmin
          ? fetchProfileNames(props.map((p) => p.proposer_id)).catch(() => new Map<string, string>())
          : Promise.resolve(new Map<string, string>()),
        communityIds.length > 0
          ? supabase.from('communities').select('id,name').in('id', communityIds)
          : Promise.resolve({ data: null as { id: string; name: string }[] | null }),
        postIds.length > 0
          ? supabase.from('community_posts').select('id,body,community_id').in('id', postIds)
          : Promise.resolve({ data: null as { id: string; body: string; community_id: string }[] | null }),
        isAdmin && !repErr
          ? fetchProfileNames(reports.map((r) => r.reporter_id)).catch(() => new Map<string, string>())
          : Promise.resolve(new Map<string, string>()),
      ])
      // Mentor: community yang sedang mencari pembimbing (011) dan belum
      // diikuti mentor ini. Bila kolom seeking_mentor belum ada (migrasi
      // 011 belum diterapkan), query gagal, tampilkan daftar kosong,
      // bukan crash.
      if (isMentor) {
        if (seekRes.error) setSeeking([])
        else setSeeking(((seekRes.data ?? []) as Community[]).filter((c) => !mineSet.has(c.id)))
      } else {
        setSeeking([])
      }
      if (isAdmin) setProposalNames(proposalNamesRes)
      if (isAdmin && !repErr) {
        // Selesaikan target laporan ke label yang bisa dibaca + tautan,
        // bukan UUID mentah.
        const targets = new Map<string, { label: string; href: string | null }>()
        for (const c of (commsRes.data ?? []) as { id: string; name: string }[]) {
          targets.set(c.id, { label: c.name, href: `/komunitas/${c.id}` })
        }
        for (const p of (postsRes.data ?? []) as { id: string; body: string; community_id: string }[]) {
          const excerpt = p.body.length > 60 ? `${p.body.slice(0, 60)}…` : p.body
          targets.set(p.id, { label: excerpt, href: `/komunitas/${p.community_id}` })
        }
        setReportTargets(targets)
        setReportReporters(reporterNamesRes)
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
      if (!window.confirm('Yakin keluar dari komunitas ini?')) return
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
        `Kamu sudah keluar dari komunitas${communityName ? ` "${communityName}"` : ''}.` +
          (seekingRestored ? ' Komunitas ini kembali ditandai sedang mencari pembimbing.' : ''),
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

  // Avatar usulan: baca dari kolom community_proposals.cover_url bila
  // sudah ada (migrasi 031), kalau belum dari simpanan lokal pengusul.
  function proposalCoverOf(p: CommunityProposal): string | null {
    const stored = (p as unknown as { cover_url?: string | null }).cover_url
    if (stored) return stored
    return proposalAvatars.get(p.id) ?? null
  }

  // Unggah foto avatar dari picker form usulan (downscale di browser,
  // lalu ke bucket community-avatars; butuh migrasi 031).
  async function handleAvatarFile(file: File | null) {
    if (!file) {
      setAvatarUploadUrl(null)
      return
    }
    if (!user) return
    if (!file.type.startsWith('image/')) {
      setAvatarError('Avatar harus berupa gambar (JPG, PNG, atau WebP).')
      return
    }
    setAvatarError(null)
    setAvatarUploading(true)
    const url = await uploadCommunityAvatar(user.id, file).catch(() => null)
    setAvatarUploading(false)
    if (!url) {
      setAvatarError(
        'Foto belum terunggah: bucket community-avatars belum tersedia. Coba lagi nanti atau hubungi admin.',
      )
      return
    }
    setAvatarUploadUrl(url)
    setAvatarPreset(null)
  }

  async function handlePropose(e: FormEvent) {
    e.preventDefault()
    if (!user || !name.trim()) return
    // Pilihan avatar dikirim bersama usulan (community_proposals.cover_url,
    // migrasi 031) supaya terbawa saat admin "Setujui & Buat". Salinan
    // lokal tetap disimpan supaya pengusul melihatnya di "Usulan Saya".
    const { data: inserted, error } = await supabase
      .from('community_proposals')
      .insert({
        name: name.trim(),
        description: desc.trim() || null,
        proposer_id: user.id,
        status: 'pending',
        cover_url: proposeCoverUrl,
      })
      .select('id')
      .single()
    if (error) setNotice(friendlyDbError())
    else {
      if (proposeCoverUrl && inserted) {
        const proposalId = (inserted as { id: string }).id
        saveProposalAvatar(proposalId, proposeCoverUrl)
        setProposalAvatars((m) => new Map(m).set(proposalId, proposeCoverUrl))
      }
      setNotice(
        'Usulan komunitas terkirim. Admin akan meninjau. Bila disetujui, komunitas dibuat dan kamu langsung menjadi anggotanya.' +
          (proposeCoverUrl
            ? ' Pilihan avatarmu akan dipakai bila admin menyetujui.'
            : ''),
      )
      setName('')
      setDesc('')
      setAvatarPreset(null)
      setAvatarUploadUrl(null)
      setAvatarError(null)
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
      // Avatar usulan ikut ke komunitas yang dibuat. Pra-031
      // proposalCoverOf mengembalikan null (kolom belum ada) sehingga
      // komunitas dibuat dengan ubin inisial baku; pasca-031 nilai
      // "preset:..." / URL foto pengusul tersimpan di cover_url.
      const { data: comm, error: cErr } = await supabase
        .from('communities')
        .insert({
          name: p.name,
          description: p.description,
          created_by: p.proposer_id,
          is_approved: true,
          cover_url: proposalCoverOf(p),
        })
        .select()
        .single()
      if (cErr) {
        setNotice(friendlyDbError())
        return
      }
      const { error: memErr } = await supabase.from('community_members').insert({
        community_id: (comm as { id: string }).id,
        user_id: p.proposer_id,
        role: 'member',
      })
      await logAudit('community_proposal.approved', 'community_proposals', p.id, { community_id: (comm as { id: string }).id })
      invalidateCatalogCache()
      setNotice(
        memErr
          ? `Komunitas "${p.name}" dibuat, tetapi pengusul gagal langsung menjadi anggota. Coba tambahkan manual dari halaman detail komunitas.`
          : `Komunitas "${p.name}" dibuat dan pengusul langsung menjadi anggotanya.`,
      )
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
      invalidateCatalogCache()
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
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <CommunityAvatarBadge coverUrl={proposalCoverOf(p)} name={p.name} size={44} />
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0 }}>
                  <strong>{p.name}</strong>
                </p>
                {p.description && <p>{p.description}</p>}
                <p className="muted">
                  Status: {proposalStatusLabel(p.status)} · {fmtDate(p.created_at)}
                </p>
              </div>
            </div>
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
          title="Komunitas"
          subtitle="Moderasi Komunitas. Admin tidak bergabung ke komunitas."
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
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <CommunityAvatarBadge coverUrl={proposalCoverOf(p)} name={p.name} size={44} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0 }}>
                        <strong>{p.name}</strong>
                      </p>
                      {p.description && <p>{p.description}</p>}
                      <p className="muted">
                        Pengusul: {proposalNames.get(p.proposer_id) ?? '—'} · {fmtDate(p.created_at)}
                      </p>
                    </div>
                  </div>
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
            <h2>Laporan Komunitas</h2>
            <Link to="/admin/moderasi">Moderasi →</Link>
          </div>
          {modReports === null ? (
            <p className="empty">
              Tabel laporan belum tersedia.{' '}
              <Link to="/admin/moderasi">Lihat Moderasi</Link>
            </p>
          ) : modReports.length === 0 ? (
            <p className="empty">Tidak ada laporan komunitas.</p>
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
            <h2>Semua Komunitas ({items.length})</h2>
            <Link to="/admin">Admin Panel →</Link>
          </div>
          {items.length === 0 ? (
            <EmptyState message="Belum ada komunitas." />
          ) : (
            <ul className="discussion-list">
              {items.map((c) => (
                <li key={c.id} className="discussion-item">
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <CommunityAvatarBadge coverUrl={c.cover_url} name={c.name} size={44} />
                    <div style={{ minWidth: 0 }}>
                      <p className="discussion-meta">
                        {c.is_approved ? 'Disetujui' : 'Belum disetujui'} ·{' '}
                        {memberCounts.get(c.id) ?? 0} anggota
                        {c.seeking_mentor ? ' · Mencari pembimbing' : ''}
                      </p>
                      <h3>
                        <Link to={`/komunitas/${c.id}`}>{c.name}</Link>
                      </h3>
                      {c.description && <p>{c.description}</p>}
                    </div>
                  </div>
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
          title="Komunitas"
          subtitle="Komunitas yang kamu ikuti dan komunitas lain yang bisa kamu ikuti."
        />
        {notice && <p className="notice-box">{notice}</p>}

        <section className="section">
          <h2>Komunitas Mencari Pembimbing ({seeking.length})</h2>
          <p className="muted">
            Komunitas yang sedang membutuhkan pembimbing. Jadi pembimbing berarti kamu membimbing
            diskusi dan karya anggota komunitas itu.
          </p>
          {seeking.length === 0 ? (
            <p className="empty">Tidak ada komunitas yang sedang mencari pembimbing saat ini.</p>
          ) : (
            <ul className="course-list">
              {seeking.map((c) => (
                <li key={c.id} className="course-card">
                  <Link to={`/komunitas/${c.id}`}>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '1rem 1.25rem 0' }}>
                      <CommunityAvatarBadge coverUrl={c.cover_url} name={c.name} size={48} />
                      <div style={{ minWidth: 0 }}>
                        <h3 style={{ margin: '0 0 0.25rem' }}>{c.name}</h3>
                        <p style={{ margin: '0 0 0.25rem' }}>{c.description ?? 'Komunitas SINEVERSE.'}</p>
                        <p className="muted" style={{ margin: 0 }}>
                          Mencari pembimbing · {memberCounts.get(c.id) ?? 0} anggota
                        </p>
                      </div>
                    </div>
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
          <h2>Komunitas yang Kamu Ikuti ({joined.length})</h2>
          {joined.length === 0 ? (
            <p className="empty">Kamu belum mengikuti komunitas apa pun.</p>
          ) : (
            <ul className="course-list">
              {joined.map((c) => (
                <li key={c.id} className="course-card">
                  <Link to={`/komunitas/${c.id}`}>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '1rem 1.25rem 0' }}>
                      <CommunityAvatarBadge coverUrl={c.cover_url} name={c.name} size={48} />
                      <div style={{ minWidth: 0 }}>
                        <h3 style={{ margin: '0 0 0.25rem' }}>{c.name}</h3>
                        <p style={{ margin: '0 0 0.25rem' }}>{c.description ?? 'Komunitas SINEVERSE.'}</p>
                        <p className="muted" style={{ margin: 0 }}>
                          Status: {memberRoleLabel(myRoles.get(c.id) ?? 'member')} ·{' '}
                          {memberCounts.get(c.id) ?? 0} anggota
                        </p>
                      </div>
                    </div>
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
          <h2>Komunitas Lain ({others.length})</h2>
          {others.length === 0 ? (
            <p className="empty">Tidak ada komunitas lain saat ini.</p>
          ) : (
            <ul className="course-list">
              {others.map((c) => (
                <li key={c.id} className="course-card">
                  <Link to={`/komunitas/${c.id}`}>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '1rem 1.25rem 0' }}>
                      <CommunityAvatarBadge coverUrl={c.cover_url} name={c.name} size={48} />
                      <div style={{ minWidth: 0 }}>
                        <h3 style={{ margin: '0 0 0.25rem' }}>{c.name}</h3>
                        <p style={{ margin: '0 0 0.25rem' }}>{c.description ?? 'Komunitas SINEVERSE.'}</p>
                        <p className="muted" style={{ margin: 0 }}>{memberCounts.get(c.id) ?? 0} anggota</p>
                      </div>
                    </div>
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
              <CommunityAvatarPicker
                name={name}
                presetId={avatarPreset}
                uploadUrl={avatarUploadUrl}
                uploading={avatarUploading}
                error={avatarError}
                onSelectPreset={(id) => {
                  setAvatarPreset(id)
                  if (id) setAvatarUploadUrl(null)
                }}
                onUploadFile={(file) => void handleAvatarFile(file)}
                onClear={() => {
                  setAvatarPreset(null)
                  setAvatarUploadUrl(null)
                  setAvatarError(null)
                }}
              />
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
        title="Komunitas"
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
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '1rem 1.25rem 0' }}>
                  <CommunityAvatarBadge coverUrl={c.cover_url} name={c.name} size={48} />
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ margin: '0 0 0.25rem' }}>{c.name}</h3>
                    <p style={{ margin: '0 0 0.25rem' }}>{c.description ?? 'Komunitas SINEVERSE.'}</p>
                    <p className="muted" style={{ margin: 0 }}>{memberCounts.get(c.id) ?? 0} anggota</p>
                  </div>
                </div>
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
            <CommunityAvatarPicker
              name={name}
              presetId={avatarPreset}
              uploadUrl={avatarUploadUrl}
              uploading={avatarUploading}
              error={avatarError}
              onSelectPreset={(id) => {
                setAvatarPreset(id)
                if (id) setAvatarUploadUrl(null)
              }}
              onUploadFile={(file) => void handleAvatarFile(file)}
              onClear={() => {
                setAvatarPreset(null)
                setAvatarUploadUrl(null)
                setAvatarError(null)
              }}
            />
            <button type="submit" className="btn btn-primary">Kirim Usulan</button>
          </form>
        </section>
      )}
      {myProposalsSection}
    </div>
  )
}
