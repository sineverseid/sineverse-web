// SINEVERSE, Feed komunitas: postingan + balasan + sematkan (004).
// Fase 2 (063): kategori, badge peran, reactions, balasan bertingkat,
// mention, pencarian, lampiran gambar/PDF.
// Hanya anggota komunitas yang bisa membaca/menulis feed (RLS); pin oleh
// pembuat komunitas atau admin. Pembuat/admin juga bisa menghidupkan/
// mematikan penanda "Mencari pembimbing" (011) dan mengganti avatar
// komunitas (preset warna atau foto sendiri — lihat communityAvatar.ts).
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import Icon from '../components/icons'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import {
  COMMUNITY_AVATAR_PRESETS,
  PRESET_AVATAR_PREFIX,
  communityAvatarLetter,
  coverValueFromChoice,
  resolveCommunityAvatar,
  uploadCommunityAvatar,
} from '../lib/communityAvatar'
import { fmtDate, isMissingTableError } from '../lib/guarded'
import {
  STUDENT_COMMUNITY_CATEGORIES,
  STUDENT_COMMUNITY_EMOJIS,
  STUDENT_COMMUNITY_PAGE_SIZE,
  deletePost,
  deleteReply,
  fetchCategories,
  fetchMembers,
  fetchPosts,
  fetchReactions,
  fetchReplies,
  roleBadgeLabel,
  sendPost,
  sendReply,
  signedPostAttachmentUrl,
  subscribeToCommunity,
  toggleReaction,
  validatePostAttachment,
} from '../lib/studentCommunity'
import type {
  StudentCommunityMember,
  StudentCommunityPost,
  StudentCommunityReactionSummary,
  StudentCommunityReply,
} from '../lib/studentCommunity'
import { invalidateCatalogCache, logAudit, supabase } from '../lib/supabase'
import type { Community } from '../lib/types'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Render isi teks: @nama anggota dicetak tebal, baris baru dipertahankan (pola MentorGroupPage). */
function renderBodyWithMentions(body: string, memberNames: string[]): ReactNode {
  const names = [...new Set(memberNames)].sort((a, b) => b.length - a.length)
  const mentionRe =
    names.length > 0
      ? new RegExp(`(@(?:${names.map(escapeRegExp).join('|')}))`, 'g')
      : null
  return body.split('\n').map((line, li) => (
    <span key={li}>
      {li > 0 && <br />}
      {mentionRe
        ? line.split(mentionRe).map((part, i) =>
            i % 2 === 1 ? <strong key={i}>{part}</strong> : part,
          )
        : line}
    </span>
  ))
}

/** Badge peran (Master Prompt: Student / Mentor / Admin terlihat di setiap postingan/komentar). */
function RoleBadge({ role }: { role: string | null | undefined }) {
  const label = roleBadgeLabel(role)
  const style =
    label === 'Admin'
      ? { background: '#172438', color: '#fff' }
      : label === 'Mentor'
        ? { background: '#A3E6C4', color: '#172438' }
        : { background: '#E8EDF3', color: '#172438' }
  return (
    <span
      style={{
        ...style,
        display: 'inline-block',
        fontSize: '0.7rem',
        fontWeight: 700,
        lineHeight: 1,
        padding: '0.2rem 0.45rem',
        borderRadius: '999px',
        marginLeft: '0.4rem',
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}

/** Lampiran postingan: gambar tampil inline, PDF/dokumen lain berupa tautan (signed URL, bucket privat). */
function AttachmentView({
  path,
  name,
  type,
}: {
  path: string
  name: string | null
  type: string | null
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    signedPostAttachmentUrl(path)
      .then((u) => {
        if (!cancelled) setUrl(u)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [path])
  const label = name ?? 'Lampiran'
  if (failed) return <p className="muted">Lampiran tidak bisa dibuka saat ini.</p>
  if (!url) return <p className="muted">Memuat lampiran…</p>
  if ((type ?? '').startsWith('image/')) {
    return (
      <p>
        <img
          src={url}
          alt={label}
          style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 8, display: 'block' }}
        />
        <span className="muted">{label}</span>
      </p>
    )
  }
  return (
    <p>
      <a href={url} target="_blank" rel="noreferrer">
        {label}
      </a>
      <span className="muted"> (PDF — terbuka di tab baru)</span>
    </p>
  )
}

interface CommunityAvatarPickerProps {
  /** Nama komunitas (huruf awalnya tampil di ubin preset). */
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
          // LB2: bila nama komunitas belum diketik, communityAvatarLetter
          // mengembalikan '?' — semua tombol tampil "?" literal. Bila
          // belum ada huruf, pakai huruf awal label preset supaya tiap
          // tombol tetap berbeda dan bisa dipilih.
          const shown = letter === '?' ? p.label.charAt(0).toUpperCase() : letter
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
              {shown}
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

export default function CommunityDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, profile } = useAuth()
  const [community, setCommunity] = useState<Community | null>(null)
  const [posts, setPosts] = useState<StudentCommunityPost[] | null>(null)
  const [replies, setReplies] = useState<StudentCommunityReply[]>([])
  const [reactions, setReactions] = useState<Map<string, StudentCommunityReactionSummary[]>>(
    new Map(),
  )
  const [isMember, setIsMember] = useState(false)
  const [myRole, setMyRole] = useState<string | null>(null)
  const [members, setMembers] = useState<StudentCommunityMember[]>([])
  const [postsError, setPostsError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [realtimeOk, setRealtimeOk] = useState<boolean | null>(null)
  // Fase 2: kategori + pencarian + paginasi.
  const [categories, setCategories] = useState<string[]>([...STUDENT_COMMUNITY_CATEGORIES])
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // Komposer postingan.
  const [title, setTitle] = useState('')
  const [postCategory, setPostCategory] = useState('')
  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  // Komposer balasan: replyTo = postingan, replyParent = balasan yang
  // dibalas (null = balasan langsung ke postingan).
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyParent, setReplyParent] = useState<StudentCommunityReply | null>(null)
  const [replyBody, setReplyBody] = useState('')
  // B60: kunci tombol kirim selama request berjalan (klik ganda =
  // postingan/balasan ganda).
  const [posting, setPosting] = useState(false)
  const [replying, setReplying] = useState(false)
  const [tab, setTab] = useState<'diskusi' | 'pengumuman'>('diskusi')
  // Mention (@nama): satu state bersama untuk kedua komposer; mentionTarget
  // menandai textarea mana yang sedang aktif.
  const [mentionTarget, setMentionTarget] = useState<'post' | 'reply' | null>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState<number | null>(null)
  const [mentionedPostIds, setMentionedPostIds] = useState<string[]>([])
  const [mentionedReplyIds, setMentionedReplyIds] = useState<string[]>([])
  const postTextareaRef = useRef<HTMLTextAreaElement>(null)
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null)
  // Reactions + hapus (dua langkah, tanpa window.confirm).
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null)
  const [confirmDeletePostId, setConfirmDeletePostId] = useState<string | null>(null)
  const [confirmDeleteReplyId, setConfirmDeleteReplyId] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  // Editor avatar (pembuat/admin): preset atau foto yang diunggah, saling
  // meniadakan. Diisi dari community.cover_url saat komunitas dimuat.
  const [editPreset, setEditPreset] = useState<string | null>(null)
  const [editUploadUrl, setEditUploadUrl] = useState<string | null>(null)
  const [editUploading, setEditUploading] = useState(false)
  const [editAvatarError, setEditAvatarError] = useState<string | null>(null)
  const [avatarSaving, setAvatarSaving] = useState(false)

  // Isi picker editor dari cover_url yang tersimpan (sekali per komunitas).
  useEffect(() => {
    if (!community) return
    const value = (community.cover_url ?? '').trim()
    if (value.startsWith(PRESET_AVATAR_PREFIX)) {
      setEditPreset(value.slice(PRESET_AVATAR_PREFIX.length))
      setEditUploadUrl(null)
    } else if (/^https?:\/\//i.test(value)) {
      setEditPreset(null)
      setEditUploadUrl(value)
    } else {
      setEditPreset(null)
      setEditUploadUrl(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [community?.id])

  /**
   * Muat satu halaman feed (Fase 2: kategori + pencarian + cursor).
   * append = true menempelkan halaman berikutnya di bawah yang sudah ada.
   * Balasan + reaksi selalu dimuat untuk semua postingan yang tampil.
   */
  async function loadPosts(
    communityId: string,
    opts: {
      category?: string | null
      search?: string
      beforeCreatedAt?: string | null
      append?: boolean
    } = {},
  ) {
    const page = await fetchPosts(communityId, {
      category: opts.category ?? activeCategory,
      search: opts.search ?? searchTerm,
      beforeCreatedAt: opts.beforeCreatedAt ?? null,
      limit: STUDENT_COMMUNITY_PAGE_SIZE,
    })
    setHasMore(page.length === STUDENT_COMMUNITY_PAGE_SIZE)
    // Dedupe: postingan yang disematkan bisa muncul di dua halaman
    // (urut disematkan-dulu + cursor created_at) — jangan tampil ganda.
    const all = opts.append
      ? [...(posts ?? []), ...page.filter((p) => !(posts ?? []).some((x) => x.id === p.id))]
      : page
    setPosts(all)
    const ids = all.map((p) => p.id)
    const [reps, reacts] = await Promise.all([
      fetchReplies(ids),
      user
        ? fetchReactions(
            ids,
            [],
            user.id,
          )
        : Promise.resolve(new Map<string, StudentCommunityReactionSummary[]>()),
    ])
    setReplies(reps)
    // Reaksi balasan dimuat terpisah (butuh id balasan dulu).
    if (reps.length > 0 && user) {
      const replyReacts = await fetchReactions([], reps.map((r) => r.id), user.id)
      for (const [k, v] of replyReacts) reacts.set(k, v)
    }
    setReactions(reacts)
  }

  /** Muat ulang feed dari halaman pertama (setelah kirim/hapus/filter berubah). */
  async function reloadFeed(communityId: string) {
    setHasMore(false)
    await loadPosts(communityId, { beforeCreatedAt: null })
  }

  useEffect(() => {
    if (!id) return
    const communityId = id
    let cancelled = false
    async function load() {
      try {
        const { data, error: qErr } = await supabase
          .from('communities')
          .select('*')
          .eq('id', communityId)
          .maybeSingle()
        if (qErr) {
          if (isMissingTableError(qErr)) {
            setPosts(null)
            return
          }
          throw qErr
        }
        if (cancelled) return
        const comm = data as Community | null
        setCommunity(comm)
        // Keanggotaan saya (daftar anggota lengkap dimuat lewat lib
        // fetchMembers di bawah, beserta nama + role profil untuk badge).
        const memRes = user
          ? await supabase
              .from('community_members')
              .select('id,role')
              .eq('community_id', communityId)
              .eq('user_id', user.id)
              .maybeSingle()
          : { data: null as { role: string | null } | null }
        let member = false
        let role: string | null = null
        if (user) {
          const mem = memRes.data
          member = mem !== null
          role = (mem as { role: string | null } | null)?.role ?? null
          if (!cancelled) {
            setIsMember(member)
            setMyRole(role)
          }
        }
        // Daftar anggota (nama + role profil untuk badge) dan feed dimuat
        // paralel karena tidak saling bergantung.
        const canRead =
          member || comm?.created_by === user?.id || profile?.role === 'admin'
        const membersPromise = fetchMembers(communityId)
          .then((list) => {
            if (!cancelled) setMembers(list)
          })
          .catch(() => {
            if (!cancelled) setMembers([])
          })
        const catsPromise = fetchCategories()
          .then((cats) => {
            if (!cancelled) setCategories(cats)
          })
          .catch(() => {})
        const postsPromise = canRead
          ? loadPosts(communityId).catch(() => {
              if (!cancelled) {
                setPosts([])
                setPostsError('Feed tidak bisa dimuat saat ini. Coba lagi nanti.')
              }
            })
          : Promise.resolve().then(() => {
              if (!cancelled) setPosts([])
            })
        await Promise.all([membersPromise, catsPromise, postsPromise])
      } catch {
        if (!cancelled) setError('Gagal memuat komunitas. Coba lagi nanti.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id, profile?.role])

  // Realtime Fase 2: feed dimuat ulang saat ada postingan/balasan baru.
  // Hanya bila feed sudah berhasil dimuat (posts !== null) — non-anggota
  // tidak melihat error dari sini.
  const postsRef = useRef<StudentCommunityPost[] | null>(null)
  postsRef.current = posts
  const reloadRef = useRef<() => void>(() => {})
  reloadRef.current = () => {
    if (!community || postsRef.current === null) return
    void reloadFeed(community.id).catch(() => {
      setPostsError('Feed tidak bisa dimuat saat ini. Coba lagi nanti.')
    })
  }
  useEffect(() => {
    if (!id || !user) return
    const unsubscribe = subscribeToCommunity(
      id,
      () => reloadRef.current(),
      (status) => setRealtimeOk(status === 'ok'),
    )
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id])

  if (loading) return <div className="page"><p className="muted">Memuat komunitas…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (posts === null) return <div className="page"><h1>Komunitas</h1><MigrationNotice migration="004" /></div>
  if (!community) return <div className="page"><p className="empty">Komunitas tidak ditemukan.</p><Link to="/komunitas">Kembali</Link></div>

  const canPin = profile?.role === 'admin' || community.created_by === user?.id
  // Pembuat community, admin, DAN mentor yang sudah menjadi anggota boleh
  // menghidupkan/mematikan penanda "Mencari pembimbing" (011).
  const canManageSeeking = canPin || myRole === 'mentor'
  // Feed hanya untuk anggota, pembuat, dan admin.
  const canReadFeed =
    isMember || profile?.role === 'admin' || community.created_by === user?.id

  async function handleJoin() {
    if (!user || !community) return
    setJoining(true)
    const { error: insErr } = await supabase.from('community_members').insert({
      community_id: community.id,
      user_id: user.id,
      role: 'member',
    })
    setJoining(false)
    if (insErr) {
      setNotice('Gagal bergabung ke community ini. Coba lagi nanti.')
      return
    }
    setIsMember(true)
    setMyRole('member')
    setMembers((m) => [
      ...m,
      {
        user_id: user.id,
        role: 'member',
        name: profile?.name ?? 'Anggota',
        photo_url: profile?.photo_url ?? null,
        profileRole: profile?.role ?? 'siswa',
      },
    ])
    await logAudit('community.joined', 'communities', community.id, { name: community.name })
    try {
      await loadPosts(community.id)
    } catch {
      setPosts([])
      setPostsError('Feed tidak bisa dimuat saat ini. Coba lagi nanti.')
    }
    setNotice(`Kamu kini menjadi anggota community "${community.name}".`)
  }

  async function handleToggleSeeking() {
    if (!community || !canManageSeeking) return
    const next = !(community.seeking_mentor ?? false)
    const { error: updErr } = await supabase
      .from('communities')
      .update({ seeking_mentor: next })
      .eq('id', community.id)
    if (updErr) {
      setNotice('Gagal mengubah penanda "Mencari pembimbing". Coba lagi nanti.')
      return
    }
    setCommunity({ ...community, seeking_mentor: next })
    await logAudit('community.seeking_mentor', 'communities', community.id, { seeking_mentor: next })
    setNotice(
      next
        ? 'Community ini sekarang ditandai sedang mencari pembimbing. Mentor akan melihatnya di halaman Community.'
        : 'Penanda "Mencari pembimbing" dimatikan untuk community ini.',
    )
  }

  // Unggah foto avatar dari editor (downscale di browser, lalu ke bucket
  // community-avatars; butuh migrasi 031).
  async function handleEditAvatarFile(file: File | null) {
    if (!file) {
      setEditUploadUrl(null)
      return
    }
    if (!user) return
    if (!file.type.startsWith('image/')) {
      setEditAvatarError('Avatar harus berupa gambar (JPG, PNG, atau WebP).')
      return
    }
    setEditAvatarError(null)
    setEditUploading(true)
    const url = await uploadCommunityAvatar(user.id, file).catch(() => null)
    setEditUploading(false)
    if (!url) {
      setEditAvatarError(
        'Foto belum terunggah: bucket community-avatars belum tersedia. Coba lagi nanti atau hubungi admin.',
      )
      return
    }
    setEditUploadUrl(url)
    setEditPreset(null)
  }

  // Simpan pilihan avatar editor ke communities.cover_url. RLS sudah
  // mengizinkan: pembuat mengedit komunitasnya sendiri, admin semua.
  async function handleSaveAvatar() {
    if (!community) return
    const next = coverValueFromChoice(editUploadUrl, editPreset)
    if (next === (community.cover_url ?? null)) return
    setAvatarSaving(true)
    const { error: updErr } = await supabase
      .from('communities')
      .update({ cover_url: next })
      .eq('id', community.id)
    setAvatarSaving(false)
    if (updErr) {
      setEditAvatarError('Gagal menyimpan avatar. Coba lagi nanti.')
      return
    }
    setCommunity({ ...community, cover_url: next })
    // Daftar komunitas di-cache 5 menit: tanpa ini, daftar tetap
    // menampilkan avatar lama sampai cache kedaluwarsa.
    invalidateCatalogCache()
    await logAudit('community.avatar_updated', 'communities', community.id, { cover_url: next })
    setNotice('Avatar komunitas disimpan.')
  }

  // --- Mention (@nama) — satu pola untuk kedua komposer (pola MentorGroupPage) ---
  function handleComposerChange(
    kind: 'post' | 'reply',
    e: ChangeEvent<HTMLTextAreaElement>,
  ) {
    const value = e.target.value
    const cursor = e.target.selectionStart ?? value.length
    if (kind === 'post') setBody(value)
    else setReplyBody(value)
    const before = value.slice(0, cursor)
    const match = before.match(/@([\p{L}\p{N} ]*)$/u)
    if (match && match.index !== undefined) {
      const atIndex = match.index
      const prevChar = atIndex > 0 ? before[atIndex - 1] : ' '
      if (prevChar === ' ' || prevChar === '\n') {
        setMentionTarget(kind)
        setMentionQuery(match[1])
        setMentionStart(atIndex)
        return
      }
    }
    setMentionTarget(null)
    setMentionQuery(null)
    setMentionStart(null)
  }

  function pickMention(member: StudentCommunityMember) {
    if (mentionTarget === null || mentionStart === null) return
    const ref = mentionTarget === 'post' ? postTextareaRef : replyTextareaRef
    const current = mentionTarget === 'post' ? body : replyBody
    const cursor = ref.current?.selectionStart ?? current.length
    const next = `${current.slice(0, mentionStart)}@${member.name} ${current.slice(cursor)}`
    if (mentionTarget === 'post') {
      setBody(next)
      setMentionedPostIds((prev) =>
        prev.includes(member.user_id) ? prev : [...prev, member.user_id],
      )
    } else {
      setReplyBody(next)
      setMentionedReplyIds((prev) =>
        prev.includes(member.user_id) ? prev : [...prev, member.user_id],
      )
    }
    setMentionTarget(null)
    setMentionQuery(null)
    setMentionStart(null)
    const pos = mentionStart + member.name.length + 2
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(pos, pos)
    })
  }

  const mentionSuggestions =
    mentionQuery === null
      ? []
      : members
          .filter((m) => m.name.toLowerCase().includes(mentionQuery.toLowerCase()))
          .slice(0, 6)

  /** Hanya id yang @namanya masih ada di teks yang dikirim. */
  function mentionedInText(text: string, ids: string[]): string[] {
    return ids.filter((id) => {
      const m = members.find((mm) => mm.user_id === id)
      return m ? text.includes(`@${m.name}`) : false
    })
  }

  function handleFileChange(file: File | null) {
    setFileError(null)
    if (!file) {
      setFile(null)
      return
    }
    const problem = validatePostAttachment(file)
    if (problem) {
      setFile(null)
      setFileError(problem)
      return
    }
    setFile(file)
  }

  async function handlePost(e: FormEvent) {
    e.preventDefault()
    const currentCommunity = community
    if (!user || (!body.trim() && !file) || !currentCommunity || posting) return
    setPosting(true)
    try {
      const post = await sendPost({
        communityId: currentCommunity.id,
        userId: user.id,
        title: title.trim() === '' ? null : title.trim(),
        category: postCategory === '' ? null : postCategory,
        body,
        mentionedUserIds: mentionedInText(body, mentionedPostIds),
        file,
      })
      setTitle('')
      setPostCategory('')
      setBody('')
      setFile(null)
      setMentionedPostIds([])
      // Postingan baru tampil di atas (Realtime juga akan mengembalikannya
      // — dedupe lewat id).
      setPosts((prev) => {
        const xs = prev ?? []
        return xs.some((p) => p.id === post.id) ? xs : [post, ...xs]
      })
      // Bila filter kategori/pencarian aktif, postingan baru belum tentu
      // cocok — muat ulang supaya daftar konsisten dengan filter.
      if (activeCategory || searchTerm) await reloadFeed(currentCommunity.id)
      else {
        const reps = await fetchReplies([post.id]).catch(() => [])
        setReplies((prev) => [...prev, ...reps])
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal mengirim postingan. Coba lagi nanti.')
    } finally {
      setPosting(false)
    }
  }

  async function handleReply(e: FormEvent, postId: string) {
    e.preventDefault()
    const currentCommunity = community
    if (!user || !replyBody.trim() || !currentCommunity || replying) return
    setReplying(true)
    try {
      const reply = await sendReply({
        postId,
        userId: user.id,
        body: replyBody,
        parentId: replyParent?.id ?? null,
        mentionedUserIds: mentionedInText(replyBody, mentionedReplyIds),
      })
      setReplyBody('')
      setReplyTo(null)
      setReplyParent(null)
      setMentionedReplyIds([])
      setReplies((prev) => (prev.some((r) => r.id === reply.id) ? prev : [...prev, reply]))
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal mengirim balasan. Coba lagi nanti.')
    } finally {
      setReplying(false)
    }
  }

  async function handlePin(post: StudentCommunityPost) {
    const currentCommunity = community
    if (!currentCommunity) return
    const { error: updErr } = await supabase
      .from('community_posts')
      .update({ is_pinned: !post.is_pinned })
      .eq('id', post.id)
    if (updErr) setNotice('Gagal mengubah sematan. Coba lagi nanti.')
    else await reloadFeed(currentCommunity.id)
  }

  async function handleDeletePost(post: StudentCommunityPost) {
    const currentCommunity = community
    if (!currentCommunity) return
    setBusyAction(`del-post-${post.id}`)
    try {
      await deletePost(post.id)
      setConfirmDeletePostId(null)
      setPosts((prev) => (prev ?? []).filter((p) => p.id !== post.id))
      setReplies((prev) => prev.filter((r) => r.post_id !== post.id))
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal menghapus postingan. Coba lagi nanti.')
    } finally {
      setBusyAction(null)
    }
  }

  async function handleDeleteReply(reply: StudentCommunityReply) {
    const currentCommunity = community
    if (!currentCommunity) return
    setBusyAction(`del-reply-${reply.id}`)
    try {
      await deleteReply(reply.id)
      setConfirmDeleteReplyId(null)
      setReplies((prev) => prev.filter((r) => r.id !== reply.id))
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal menghapus balasan. Coba lagi nanti.')
    } finally {
      setBusyAction(null)
    }
  }

  async function handleToggleReaction(
    target: { postId?: string; replyId?: string },
    emoji: string,
  ) {
    if (!user) return
    const key = target.replyId ? `reply:${target.replyId}` : `post:${target.postId ?? ''}`
    setBusyAction(`react-${key}-${emoji}`)
    try {
      await toggleReaction(target, user.id, emoji)
      // Muat ulang ringkasan reaksi untuk target ini saja.
      const fresh = await fetchReactions(
        target.postId ? [target.postId] : [],
        target.replyId ? [target.replyId] : [],
        user.id,
      )
      setReactions((prev) => {
        const next = new Map(prev)
        const v = fresh.get(key)
        if (v) next.set(key, v)
        else next.delete(key)
        return next
      })
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal mengubah reaksi. Coba lagi nanti.')
    } finally {
      setBusyAction(null)
    }
  }

  async function handleCategoryChange(category: string | null) {
    if (!community) return
    setActiveCategory(category)
    setHasMore(false)
    try {
      await loadPosts(community.id, { category, beforeCreatedAt: null })
    } catch {
      setPosts([])
      setPostsError('Feed tidak bisa dimuat saat ini. Coba lagi nanti.')
    }
  }

  async function handleSearchSubmit(e: FormEvent) {
    e.preventDefault()
    if (!community) return
    const term = searchInput.trim()
    setSearchTerm(term)
    setHasMore(false)
    try {
      await loadPosts(community.id, { search: term, beforeCreatedAt: null })
    } catch {
      setPosts([])
      setPostsError('Feed tidak bisa dimuat saat ini. Coba lagi nanti.')
    }
  }

  async function handleLoadMore() {
    if (!community || loadingMore || !hasMore) return
    const last = (posts ?? [])[(posts ?? []).length - 1]
    if (!last) return
    setLoadingMore(true)
    try {
      await loadPosts(community.id, { beforeCreatedAt: last.created_at, append: true })
    } catch {
      setPostsError('Feed tidak bisa dimuat saat ini. Coba lagi nanti.')
    } finally {
      setLoadingMore(false)
    }
  }

  const allPosts = posts ?? []
  const pinnedPosts = allPosts.filter((p) => p.is_pinned)
  const visiblePosts = tab === 'pengumuman' ? pinnedPosts : allPosts

  const memberNames = members.map((m) => m.name)

  /** Baris reaksi untuk satu postingan / balasan (Fase 2). */
  function renderReactions(target: { postId?: string; replyId?: string }) {
    const key = target.replyId ? `reply:${target.replyId}` : `post:${target.postId ?? ''}`
    const list = reactions.get(key) ?? []
    const pickerOpen = reactionPickerFor === key
    return (
      <div className="post-actions" style={{ flexWrap: 'wrap', gap: '0.25rem' }}>
        {list.map((s) => (
          <button
            key={s.emoji}
            type="button"
            className="btn btn-ghost btn-small"
            aria-pressed={s.mine}
            disabled={busyAction === `react-${key}-${s.emoji}`}
            onClick={() => void handleToggleReaction(target, s.emoji)}
            style={s.mine ? { outline: '2px solid #16865E', outlineOffset: 1 } : undefined}
          >
            {s.emoji} {s.count}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onClick={() => setReactionPickerFor(pickerOpen ? null : key)}
        >
          + Reaksi
        </button>
        {pickerOpen && (
          <span style={{ display: 'inline-flex', gap: '0.25rem', flexWrap: 'wrap' }}>
            {STUDENT_COMMUNITY_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => {
                  setReactionPickerFor(null)
                  void handleToggleReaction(target, e as string)
                }}
              >
                {e}
              </button>
            ))}
          </span>
        )}
      </div>
    )
  }

  /** Satu balasan + anak-anaknya (bertingkat, indent bertambah per tingkat, maks 3). */
  function renderReply(reply: StudentCommunityReply, depth: number) {
    const children = replies.filter((r) => r.parent_id === reply.id)
    const authorName = reply.author?.name ?? 'Anggota'
    const canDelete = user?.id === reply.user_id || profile?.role === 'admin'
    const indent = Math.min(depth, 3) * 1.25
    return (
      <li key={reply.id} style={indent > 0 ? { marginLeft: `${indent}rem` } : undefined}>
        <p className="discussion-meta">
          {authorName}
          <RoleBadge role={reply.author?.role} /> · {fmtDate(reply.created_at)}
        </p>
        <p>{renderBodyWithMentions(reply.body, memberNames)}</p>
        {renderReactions({ replyId: reply.id })}
        {isMember && (
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => {
                setReplyTo(reply.post_id)
                setReplyParent(reply)
              }}
            >
              Balas
            </button>
            {canDelete &&
              (confirmDeleteReplyId === reply.id ? (
                <>
                  <button
                    type="button"
                    className="btn btn-danger btn-small"
                    disabled={busyAction === `del-reply-${reply.id}`}
                    onClick={() => void handleDeleteReply(reply)}
                  >
                    Ya, hapus balasan ini
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => setConfirmDeleteReplyId(null)}
                  >
                    Batal
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => setConfirmDeleteReplyId(reply.id)}
                >
                  Hapus
                </button>
              ))}
          </div>
        )}
        {children.length > 0 && (
          <ul className="discussion-replies">
            {children.map((c) => renderReply(c, depth + 1))}
          </ul>
        )}
      </li>
    )
  }

  function renderPostCard(p: StudentCommunityPost) {
    const postReplies = replies.filter((r) => r.post_id === p.id)
    const topReplies = postReplies.filter((r) => !r.parent_id)
    const authorName = p.author?.name ?? 'Anggota'
    const canDeletePost = user?.id === p.user_id || profile?.role === 'admin'
    return (
      <article key={p.id} className="post-card">
        <div className="post-head">
          {p.author?.role === 'admin' ? (
            <div className="post-avatar chat-avatar-admin" aria-hidden="true">
              <Icon name="shield" size={20} />
            </div>
          ) : p.author?.photo_url ? (
            <img src={p.author.photo_url} alt="" className="post-avatar" />
          ) : (
            <div className="post-avatar" aria-hidden="true">
              {authorName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="post-name">
              {authorName}
              <RoleBadge role={p.author?.role} />
              {p.is_pinned ? ' · Disematkan' : ''}
            </p>
            <p className="post-time">{fmtDate(p.created_at)}</p>
          </div>
        </div>
        {p.category && (
          <p style={{ margin: '0.5rem 0 0' }}>
            <span
              style={{
                display: 'inline-block',
                fontSize: '0.75rem',
                fontWeight: 700,
                background: '#E8EDF3',
                color: '#172438',
                padding: '0.2rem 0.55rem',
                borderRadius: '999px',
              }}
            >
              {p.category}
            </span>
          </p>
        )}
        {p.title && <h3 style={{ margin: '0.5rem 0 0' }}>{p.title}</h3>}
        <p className="post-body">{renderBodyWithMentions(p.body, memberNames)}</p>
        {p.attachment_path && (
          <AttachmentView
            path={p.attachment_path}
            name={p.attachment_name}
            type={p.attachment_type}
          />
        )}
        {renderReactions({ postId: p.id })}
        <div className="post-actions">
          <span>
            <Icon name="message" size={16} />
            {postReplies.length} Balasan
          </span>
        </div>
        {topReplies.length > 0 && (
          <ul className="discussion-replies">
            {topReplies.map((r) => renderReply(r, 0))}
          </ul>
        )}
        {isMember && (
          <div className="form-actions">
            {replyTo !== p.id && (
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => {
                  setReplyTo(p.id)
                  setReplyParent(null)
                }}
              >
                Balas
              </button>
            )}
            {canPin && (
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => void handlePin(p)}
              >
                {p.is_pinned ? 'Lepas Sematan' : 'Sematkan'}
              </button>
            )}
            {canDeletePost &&
              (confirmDeletePostId === p.id ? (
                <>
                  <button
                    type="button"
                    className="btn btn-danger btn-small"
                    disabled={busyAction === `del-post-${p.id}`}
                    onClick={() => void handleDeletePost(p)}
                  >
                    Ya, hapus postingan ini
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => setConfirmDeletePostId(null)}
                  >
                    Batal
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => setConfirmDeletePostId(p.id)}
                >
                  Hapus
                </button>
              ))}
          </div>
        )}
        {isMember && replyTo === p.id && (
          <form className="form form-inline" onSubmit={(e) => handleReply(e, p.id)}>
            {replyParent && (
              <p className="muted" style={{ margin: 0 }}>
                Membalas {replyParent.author?.name ?? 'balasan'} ·{' '}
                <button type="button" className="btn btn-ghost btn-small" onClick={() => setReplyParent(null)}>
                  Balas ke postingan saja
                </button>
              </p>
            )}
            <label>
              Balasan
              <textarea
                ref={replyTextareaRef}
                value={replyBody}
                onChange={(e) => handleComposerChange('reply', e)}
                rows={2}
                required
              />
            </label>
            {mentionTarget === 'reply' && mentionSuggestions.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {mentionSuggestions.map((m) => (
                  <button
                    key={m.user_id}
                    type="button"
                    className="btn btn-ghost btn-small"
                    style={{ justifyContent: 'flex-start' }}
                    onClick={() => pickMention(m)}
                  >
                    @{m.name} · {roleBadgeLabel(m.profileRole)}
                  </button>
                ))}
              </div>
            )}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary btn-small" disabled={replying}>
                {replying ? 'Mengirim…' : 'Kirim'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => {
                  setReplyTo(null)
                  setReplyParent(null)
                }}
              >
                Batal
              </button>
            </div>
          </form>
        )}
      </article>
    )
  }

  return (
    <div className="page">
      <Link to="/komunitas" className="back-link">← Semua Komunitas</Link>
      <header
        className="chat-header"
        style={{
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-card)',
          marginBottom: '1.25rem',
        }}
      >
        <div className="chat-header-icon" aria-hidden="true">
          {(() => {
            const av = resolveCommunityAvatar(community.cover_url, community.name)
            return av.kind === 'image' ? (
              <img src={av.url} alt="" />
            ) : (
              <span style={{ fontWeight: 800, fontSize: '1.3rem' }}>{av.letter}</span>
            )
          })()}
        </div>
        <div className="chat-header-main">
          <h1 className="chat-header-title">{community.name}</h1>
          <p className="chat-header-sub">
            {community.description ??
              (community.is_student_community
                ? 'Ruang resmi siswa SINEVERSE'
                : 'Komunitas SINEVERSE')}
          </p>
          <p className="chat-header-meta">
            {profile && (
              <span className="chat-header-pill">{roleBadgeLabel(profile.role)}</span>
            )}
            <span>{members.length} anggota</span>
            {community.is_student_community ? <span>· Ruang Resmi Siswa</span> : null}
          </p>
        </div>
      </header>
      {canManageSeeking && (
        <p>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={community.seeking_mentor ?? false}
              onChange={() => void handleToggleSeeking()}
            />
            Mencari pembimbing
          </label>
          <span className="muted">
            {' '}Bila aktif, community ini tampil di "Community Mencari Pembimbing" untuk mentor.
          </span>
        </p>
      )}
      {canPin && (
        <section className="section">
          <h2>Avatar komunitas</h2>
          <p className="muted">
            Avatar tampil bulat di daftar komunitas. Pilih salah satu warna atau unggah foto sendiri.
          </p>
          <CommunityAvatarPicker
            name={community.name}
            presetId={editPreset}
            uploadUrl={editUploadUrl}
            uploading={editUploading}
            error={editAvatarError}
            onSelectPreset={(id) => {
              setEditPreset(id)
              if (id) setEditUploadUrl(null)
            }}
            onUploadFile={(file) => void handleEditAvatarFile(file)}
            onClear={() => {
              setEditPreset(null)
              setEditUploadUrl(null)
              setEditAvatarError(null)
            }}
          />
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary btn-small"
              disabled={
                avatarSaving ||
                coverValueFromChoice(editUploadUrl, editPreset) === (community.cover_url ?? null)
              }
              onClick={() => void handleSaveAvatar()}
            >
              {avatarSaving ? 'Menyimpan…' : 'Simpan avatar'}
            </button>
          </div>
        </section>
      )}
      {notice && <p className="notice-box">{notice}</p>}

      <section className="section">
        <h2>Anggota ({members.length})</h2>
        {/* B41: nama anggota hanya untuk yang boleh membaca feed
            (anggota/pembuat/admin); non-anggota hanya melihat jumlah. */}
        {canReadFeed ? (
          members.length === 0 ? (
            <p className="empty">Belum ada anggota.</p>
          ) : (
            <ul className="discussion-list">
              {members.map((m) => (
                <li key={m.user_id} className="discussion-item">
                  <p>
                    {m.name}
                    <RoleBadge role={m.profileRole} />
                    {m.role === 'mentor' ? ' · Pembimbing' : ''}
                  </p>
                </li>
              ))}
            </ul>
          )
        ) : (
          <p className="muted">Gabung ke komunitas ini untuk melihat daftar anggotanya.</p>
        )}
      </section>

      {!canReadFeed && (
        <div>
          <p className="empty">Gabung untuk membaca dan menulis di feed.</p>
          {user && profile?.role !== 'admin' && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={joining}
              onClick={() => void handleJoin()}
            >
              {joining ? 'Bergabung…' : 'Gabung'}
            </button>
          )}
          {!user && <p className="muted">Masuk dulu untuk bergabung ke community ini.</p>}
        </div>
      )}
      {canReadFeed && (
        <>
          {postsError && <p className="notice-box">{postsError}</p>}
          {realtimeOk === false && (
            <p className="notice-box">
              Pembaruan langsung tidak aktif — muat ulang halaman untuk melihat postingan terbaru.
            </p>
          )}
          {/* Fase 2: pencarian + filter kategori. */}
          <form className="form form-inline" onSubmit={handleSearchSubmit}>
            <label>
              Cari postingan
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Kata kunci di judul atau isi…"
              />
            </label>
            <div className="form-actions">
              <button type="submit" className="btn btn-secondary btn-small">
                Cari
              </button>
              {searchTerm !== '' && (
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => {
                    setSearchInput('')
                    setSearchTerm('')
                    setHasMore(false)
                    void loadPosts(community.id, { search: '', beforeCreatedAt: null }).catch(() => {
                      setPosts([])
                      setPostsError('Feed tidak bisa dimuat saat ini. Coba lagi nanti.')
                    })
                  }}
                >
                  Hapus pencarian
                </button>
              )}
            </div>
          </form>
          <div
            className="pill-tabs"
            role="tablist"
            aria-label="Kategori postingan"
            style={{ flexWrap: 'wrap' }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeCategory === null}
              className={activeCategory === null ? 'pill-tab active' : 'pill-tab'}
              onClick={() => void handleCategoryChange(null)}
            >
              Semua
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={activeCategory === c}
                className={activeCategory === c ? 'pill-tab active' : 'pill-tab'}
                onClick={() => void handleCategoryChange(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="pill-tabs" role="tablist" aria-label="Feed komunitas">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'diskusi'}
              className={tab === 'diskusi' ? 'pill-tab active' : 'pill-tab'}
              onClick={() => setTab('diskusi')}
            >
              Diskusi
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'pengumuman'}
              className={tab === 'pengumuman' ? 'pill-tab active' : 'pill-tab'}
              onClick={() => setTab('pengumuman')}
            >
              Pengumuman
            </button>
          </div>
          {tab === 'diskusi' && isMember && (
            <form id="buat-post" className="form" onSubmit={handlePost}>
              <label>
                Judul (opsional)
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                  placeholder="Judul postingan…"
                />
              </label>
              <label>
                Kategori
                <select value={postCategory} onChange={(e) => setPostCategory(e.target.value)}>
                  <option value="">Tanpa kategori</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tulis postingan
                <textarea
                  ref={postTextareaRef}
                  value={body}
                  onChange={(e) => handleComposerChange('post', e)}
                  rows={3}
                  required={file === null}
                  placeholder="Bagikan kabar, karya, atau ajakan… (ketik @ untuk menyebut anggota)"
                />
              </label>
              {mentionTarget === 'post' && mentionSuggestions.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {mentionSuggestions.map((m) => (
                    <button
                      key={m.user_id}
                      type="button"
                      className="btn btn-ghost btn-small"
                      style={{ justifyContent: 'flex-start' }}
                      onClick={() => pickMention(m)}
                    >
                      @{m.name} · {roleBadgeLabel(m.profileRole)}
                    </button>
                  ))}
                </div>
              )}
              <label>
                Lampiran (opsional — gambar atau PDF, maks 10 MB)
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                  onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                />
              </label>
              {file && (
                <p className="muted">
                  Lampiran: {file.name} ({Math.round(file.size / 1024)} KB) ·{' '}
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => handleFileChange(null)}
                  >
                    Hapus lampiran
                  </button>
                </p>
              )}
              {fileError && <p className="error-box">{fileError}</p>}
              <button type="submit" className="btn btn-primary" disabled={posting}>
                {posting ? 'Mengirim…' : 'Kirim Postingan'}
              </button>
            </form>
          )}
          {tab === 'pengumuman' && pinnedPosts.length === 0 ? (
            <p className="empty">Belum ada pengumuman.</p>
          ) : visiblePosts.length === 0 ? (
            <p className="empty">Belum ada postingan di komunitas ini.</p>
          ) : (
            <div className="post-list">
              {visiblePosts.map((p) => renderPostCard(p))}
            </div>
          )}
          {tab === 'diskusi' && hasMore && (
            <p>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={loadingMore}
                onClick={() => void handleLoadMore()}
              >
                {loadingMore ? 'Memuat…' : 'Muat lebih banyak'}
              </button>
            </p>
          )}
        </>
      )}
    </div>
  )
}
