// SINEVERSE — Mentor Community, Fase 1 (migrasi 060 + 061).
//
// Grup chat resmi admin + mentor approved & aktif. Rute dilindungi
// RoleRoute mentor/admin (App.tsx); halaman ini juga memeriksa
// keanggotaan aktif sendiri — mentor yang dicabut (revoked_at) tetap
// lolos RoleRoute (role masih 'mentor') tapi RLS menutup datanya, jadi
// ia melihat "Akses terbatas" di tempat, bukan redirect membingungkan.
//
// Pola yang ditiru (ATM): CommunityDetailPage (kartu postingan,
// sematan, nama penulis dari profiles, isMissingTableError,
// MigrationNotice) + sinebotTicketsAdmin (lampiran bucket privat dibuka
// lewat signed URL saat diklik).
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/icons'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { fmtDate, fmtDateOnly, isMissingTableError } from '../lib/guarded'
import {
  MENTOR_GROUP_EMOJIS,
  MENTOR_GROUP_PAGE_SIZE,
  deleteMessage,
  fetchMembers,
  fetchMessages,
  fetchPinned,
  fetchReactions,
  markRead,
  pinMessage,
  sendMessage,
  signedGroupAttachmentUrl,
  subscribeToGroup,
  toggleReaction,
  unpinMessage,
  validateGroupAttachment,
} from '../lib/mentorGroup'
import type {
  MentorGroupMember,
  MentorGroupMessage,
  MentorGroupReactionSummary,
} from '../lib/mentorGroup'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Render isi pesan: @nama anggota dicetak tebal, baris baru dipertahankan. */
function renderBody(body: string, memberNames: string[]): ReactNode {
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

/** Kunci hari lokal (YYYY-M-D) — pembanding pil tanggal, tanpa UTC. */
function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/** Label pil tanggal ala chat: "Hari ini" / "Kemarin" / tanggal. */
function dayLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const now = new Date()
  if (dayKeyOf(d) === dayKeyOf(now)) return 'Hari ini'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (dayKeyOf(d) === dayKeyOf(yesterday)) return 'Kemarin'
  return fmtDateOnly(iso)
}

/** Jam saja ala chat ("09.00", pemisah titik id-ID). */
function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

export default function MentorGroupPage() {
  const { user, profile } = useAuth()
  const [members, setMembers] = useState<MentorGroupMember[]>([])
  const [messages, setMessages] = useState<MentorGroupMessage[]>([])
  const [pinned, setPinned] = useState<MentorGroupMessage[]>([])
  const [reactions, setReactions] = useState<Map<string, MentorGroupReactionSummary[]>>(
    new Map(),
  )
  const [isMember, setIsMember] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [missingTable, setMissingTable] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [realtimeOk, setRealtimeOk] = useState<boolean | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [searchMode, setSearchMode] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [searching, setSearching] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<MentorGroupMessage | null>(null)
  const [announce, setAnnounce] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState<number | null>(null)
  const [mentionedIds, setMentionedIds] = useState<string[]>([])
  const [showMembers, setShowMembers] = useState(false)
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [attachmentOpening, setAttachmentOpening] = useState<string | null>(null)

  const listRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const nearBottomRef = useRef(true)
  const membersRef = useRef<MentorGroupMember[]>([])
  const userRef = useRef(user)
  membersRef.current = members
  userRef.current = user

  const isAdmin = profile?.role === 'admin'
  const backTo = isAdmin ? '/admin' : '/mentor'

  function scrollToBottom() {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  function handleListScroll() {
    const el = listRef.current
    if (!el) return
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 200
  }

  async function loadInitial() {
    if (!user) return
    setLoading(true)
    setError(null)
    setMissingTable(false)
    try {
      const [memberList, initial, pinnedList] = await Promise.all([
        fetchMembers(),
        fetchMessages({}),
        fetchPinned(),
      ])
      const me =
        memberList.some((m) => m.user_id === user.id) || profile?.role === 'admin'
      setMembers(memberList)
      setIsMember(me)
      if (!me) return
      const asc = [...initial].reverse()
      setMessages(asc)
      setPinned(pinnedList)
      setHasMore(initial.length >= MENTOR_GROUP_PAGE_SIZE)
      const rx = await fetchReactions(
        initial.map((m) => m.id),
        user.id,
      )
      setReactions(rx)
      await markRead(
        initial.map((m) => m.id),
        user.id,
      ).catch(() => {
        // Tandai-baca gagal bukan alasan halaman error — abaikan diam-diam.
      })
      // Muat awal selalu mulai dari pesan terbaru.
      requestAnimationFrame(scrollToBottom)
    } catch (err) {
      if (isMissingTableError(err)) setMissingTable(true)
      else setError(err instanceof Error ? err.message : 'Gagal memuat percakapan.')
    } finally {
      setLoading(false)
    }
  }

  // Muat awal (sekali per pengguna).
  useEffect(() => {
    if (!user) return
    void loadInitial()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  // Realtime: pesan baru / pin / hapus masuk tanpa reload. Bila langganan
  // gagal, halaman tetap bisa dipakai dengan tombol muat ulang manual.
  useEffect(() => {
    if (isMember !== true) return
    const unsubscribe = subscribeToGroup(
      (event) => {
        if (event.eventType === 'DELETE') {
          setMessages((prev) => prev.filter((m) => m.id !== event.messageId))
          setPinned((prev) => prev.filter((m) => m.id !== event.messageId))
          return
        }
        const incoming = event.message
        if (!incoming) return
        const member = membersRef.current.find((m) => m.user_id === incoming.sender_id)
        const enriched: MentorGroupMessage = {
          ...incoming,
          sender: member
            ? { name: member.name, role: member.role, photo_url: member.photo_url }
            : null,
        }
        if (event.eventType === 'INSERT') {
          setMessages((prev) => {
            if (prev.some((m) => m.id === enriched.id)) return prev
            return [...prev, enriched]
          })
          const me = userRef.current
          if (me && enriched.sender_id !== me.id) {
            void markRead([enriched.id], me.id).catch(() => {})
          }
          if (nearBottomRef.current || enriched.sender_id === userRef.current?.id) {
            requestAnimationFrame(scrollToBottom)
          }
        } else {
          // UPDATE (pin/unpin/hapus/announcement): ganti di tempat.
          setMessages((prev) =>
            prev.map((m) =>
              m.id === enriched.id ? { ...enriched, sender: m.sender ?? enriched.sender } : m,
            ),
          )
          if (incoming.is_pinned !== undefined) {
            void fetchPinned()
              .then(setPinned)
              .catch(() => {})
          }
        }
      },
      (status) => {
        setRealtimeOk(status === 'ok')
        if (status === 'error') {
          setNotice('Pembaruan otomatis tidak aktif — tarik untuk memuat ulang.')
        }
      },
    )
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMember])

  async function handleLoadOlder() {
    if (!user || loadingMore || !hasMore || messages.length === 0) return
    setLoadingMore(true)
    try {
      const older = await fetchMessages({ beforeCreatedAt: messages[0].created_at })
      setMessages((prev) => [...[...older].reverse(), ...prev])
      const rx = await fetchReactions(
        older.map((m) => m.id),
        user.id,
      )
      setReactions((prev) => new Map([...prev, ...rx]))
      setHasMore(older.length >= MENTOR_GROUP_PAGE_SIZE)
      await markRead(
        older.map((m) => m.id),
        user.id,
      ).catch(() => {})
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal memuat pesan lama.')
    } finally {
      setLoadingMore(false)
    }
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    const q = searchInput.trim()
    if (q === '') {
      setSearchMode(false)
      setSearchTerm('')
      await loadInitial()
      return
    }
    setSearching(true)
    try {
      const found = await fetchMessages({ search: q })
      setMessages([...found].reverse())
      setReactions(await fetchReactions(found.map((m) => m.id), user.id))
      setSearchMode(true)
      setSearchTerm(q)
      setHasMore(false)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Pencarian gagal.')
    } finally {
      setSearching(false)
    }
  }

  async function handleClearSearch() {
    setSearchInput('')
    setSearchMode(false)
    setSearchTerm('')
    await loadInitial()
  }

  function handleBodyChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value
    const cursor = e.target.selectionStart ?? value.length
    setBody(value)
    const before = value.slice(0, cursor)
    const match = before.match(/@([\p{L}\p{N} ]*)$/u)
    if (match && match.index !== undefined) {
      const atIndex = match.index
      const prevChar = atIndex > 0 ? before[atIndex - 1] : ' '
      if (prevChar === ' ' || prevChar === '\n') {
        setMentionQuery(match[1])
        setMentionStart(atIndex)
        return
      }
    }
    setMentionQuery(null)
    setMentionStart(null)
  }

  function pickMention(member: MentorGroupMember) {
    if (mentionStart === null) return
    const cursor = textareaRef.current?.selectionStart ?? body.length
    const next = `${body.slice(0, mentionStart)}@${member.name} ${body.slice(cursor)}`
    setBody(next)
    setMentionedIds((prev) =>
      prev.includes(member.user_id) ? prev : [...prev, member.user_id],
    )
    setMentionQuery(null)
    setMentionStart(null)
    const pos = mentionStart + member.name.length + 2
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(pos, pos)
    })
  }

  const mentionSuggestions =
    mentionQuery === null
      ? []
      : members
          .filter((m) => m.name.toLowerCase().includes(mentionQuery.toLowerCase()))
          .slice(0, 6)

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    if (!user || sending) return
    // Hanya id yang @namanya masih ada di teks yang dikirim.
    const mentioned = mentionedIds.filter((id) => {
      const m = members.find((mm) => mm.user_id === id)
      return m ? body.includes(`@${m.name}`) : false
    })
    setSending(true)
    setSendError(null)
    try {
      const msg = await sendMessage({
        userId: user.id,
        body,
        replyTo: replyTo?.id ?? null,
        mentionedUserIds: mentioned,
        isAnnouncement: isAdmin && announce,
        file,
      })
      // Realtime akan mengembalikan pesan yang sama — dedupe di handler.
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
      setBody('')
      setFile(null)
      setReplyTo(null)
      setMentionedIds([])
      setAnnounce(false)
      requestAnimationFrame(scrollToBottom)
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Gagal mengirim pesan.')
    } finally {
      setSending(false)
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    if (!f) {
      setFile(null)
      return
    }
    const problem = validateGroupAttachment(f)
    if (problem) {
      setSendError(problem)
      e.target.value = ''
      return
    }
    setSendError(null)
    setFile(f)
  }

  async function refreshReactionsFor(messageId: string) {
    if (!user) return
    try {
      const rx = await fetchReactions([messageId], user.id)
      setReactions((prev) => {
        const next = new Map(prev)
        const summary = rx.get(messageId)
        if (summary) next.set(messageId, summary)
        else next.delete(messageId)
        return next
      })
    } catch {
      // Reaksi gagal dimuat ulang — hitungan lama tetap tampil.
    }
  }

  async function handleToggleReaction(messageId: string, emoji: string) {
    if (!user) return
    try {
      await toggleReaction(messageId, user.id, emoji)
      await refreshReactionsFor(messageId)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal mengubah reaksi.')
    }
  }

  async function handlePin(m: MentorGroupMessage) {
    if (!user) return
    setBusyAction(m.id)
    try {
      if (m.is_pinned) await unpinMessage(m.id)
      else await pinMessage(m.id, user.id)
      const fresh = await fetchPinned()
      setPinned(fresh)
      setMessages((prev) =>
        prev.map((x) =>
          x.id === m.id
            ? {
                ...x,
                is_pinned: !m.is_pinned,
                pinned_by: !m.is_pinned ? user.id : null,
                pinned_at: !m.is_pinned ? new Date().toISOString() : null,
              }
            : x,
        ),
      )
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal mengubah sematan.')
    } finally {
      setBusyAction(null)
    }
  }

  async function handleDelete(m: MentorGroupMessage) {
    setBusyAction(m.id)
    try {
      await deleteMessage(m.id)
      setConfirmDeleteId(null)
      setMessages((prev) =>
        prev.map((x) =>
          x.id === m.id ? { ...x, deleted_at: new Date().toISOString() } : x,
        ),
      )
      setPinned((prev) => prev.filter((x) => x.id !== m.id))
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal menghapus pesan.')
    } finally {
      setBusyAction(null)
    }
  }

  async function handleOpenAttachment(m: MentorGroupMessage) {
    if (!m.attachment_path) return
    setAttachmentOpening(m.id)
    try {
      const url = await signedGroupAttachmentUrl(m.attachment_path)
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Lampiran tidak bisa dibuka.')
    } finally {
      setAttachmentOpening(null)
    }
  }

  if (loading) {
    return (
      <div className="page">
        <p className="muted">Memuat percakapan…</p>
      </div>
    )
  }
  if (missingTable) {
    return (
      <div className="page">
        <h1>Ruang Komunikasi Mentor</h1>
        <MigrationNotice migration="060" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="page">
        <p className="error-box">{error}</p>
        <p>
          <button type="button" className="btn btn-secondary" onClick={() => void loadInitial()}>
            Muat Ulang
          </button>
        </p>
      </div>
    )
  }
  if (isMember === false) {
    return (
      <div className="page">
        <h1>Akses terbatas</h1>
        <p className="empty">
          Ruang Komunikasi Mentor hanya untuk admin dan mentor yang disetujui dan aktif.
          Keanggotaan kamu di grup ini tidak aktif — hubungi admin bila ini keliru.
        </p>
        <Link to={backTo} className="btn btn-secondary">
          Kembali
        </Link>
      </div>
    )
  }

  const memberNames = members.map((m) => m.name)

  /** Satu pesan sebagai baris chat ala referensi: avatar di kiri, gelembung putih. */
  function renderChatRow(m: MentorGroupMessage, inPinned = false) {
    const senderName = m.sender?.name ?? 'Anggota'
    const senderIsAdmin = m.sender?.role === 'admin'
    const replyTarget = m.reply_to ? messages.find((x) => x.id === m.reply_to) : null
    const summary = reactions.get(m.id) ?? []
    const deleted = m.deleted_at !== null
    return (
      <div key={m.id} className="chat-row">
        <div
          className={`chat-avatar ${senderIsAdmin ? 'chat-avatar-admin' : 'chat-avatar-mentor'}`}
          aria-hidden="true"
        >
          {senderIsAdmin ? <Icon name="shield" size={20} /> : senderName.charAt(0).toUpperCase()}
        </div>
        <article className={`chat-bubble${inPinned ? ' chat-bubble-pinned' : ''}`}>
          <p className="chat-name">
            {senderName}
            {m.is_announcement ? <span className="chat-chip">Pengumuman</span> : null}
            {m.is_pinned ? <span className="chat-chip">Disematkan</span> : null}
          </p>
          {replyTarget ? (
            <p className="chat-quote">
              Membalas {replyTarget.sender?.name ?? 'Anggota'}: {replyTarget.body.slice(0, 120)}
              {replyTarget.body.length > 120 ? '…' : ''}
            </p>
          ) : m.reply_to ? (
            <p className="chat-quote">Membalas pesan sebelumnya.</p>
          ) : null}
          {deleted ? (
            <p className="chat-text muted">Pesan ini dihapus oleh admin.</p>
          ) : (
            <p className="chat-text">{renderBody(m.body, memberNames)}</p>
          )}
          {!deleted && m.attachment_path && (
            <p style={{ margin: '0.5rem 0 0' }}>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                disabled={attachmentOpening === m.id}
                onClick={() => void handleOpenAttachment(m)}
              >
                <Icon name="fileText" size={16} /> {m.attachment_name ?? 'Lampiran'}
                {attachmentOpening === m.id ? ' — Membuka…' : ''}
              </button>
            </p>
          )}
          {!deleted && summary.length > 0 && (
            <p className="chat-row-actions">
              {summary.map((s) => (
                <button
                  key={s.emoji}
                  type="button"
                  className="btn btn-ghost btn-small"
                  aria-pressed={s.mine}
                  style={s.mine ? { outline: '2px solid var(--film-green)', outlineOffset: 1 } : undefined}
                  onClick={() => void handleToggleReaction(m.id, s.emoji)}
                >
                  {s.emoji} {s.count}
                </button>
              ))}
            </p>
          )}
          {!deleted && (
            <div className="chat-row-actions">
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => setReplyTo(m)}
              >
                Balas
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() =>
                  setReactionPickerFor(reactionPickerFor === m.id ? null : m.id)
                }
              >
                Reaksi
              </button>
              {isAdmin && (
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  disabled={busyAction === m.id}
                  onClick={() => void handlePin(m)}
                >
                  {m.is_pinned ? 'Lepas Sematan' : 'Sematkan'}
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  disabled={busyAction === m.id}
                  onClick={() => {
                    if (confirmDeleteId === m.id) void handleDelete(m)
                    else setConfirmDeleteId(m.id)
                  }}
                >
                  {confirmDeleteId === m.id ? 'Yakin hapus?' : 'Hapus'}
                </button>
              )}
            </div>
          )}
          {reactionPickerFor === m.id && !deleted && (
            <p className="chat-row-actions">
              {MENTOR_GROUP_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="btn btn-ghost btn-small"
                  aria-label={`Reaksi ${emoji}`}
                  onClick={() => {
                    void handleToggleReaction(m.id, emoji)
                    setReactionPickerFor(null)
                  }}
                >
                  {emoji}
                </button>
              ))}
            </p>
          )}
          <p className="chat-time">{fmtTime(m.created_at)}</p>
        </article>
      </div>
    )
  }

  /** Daftar pesan dengan pil tanggal tiap pergantian hari. */
  function renderMessageList(): ReactNode[] {
    const rows: ReactNode[] = []
    let lastDay = ''
    for (const m of messages) {
      const key = dayKeyOf(new Date(m.created_at))
      if (key !== lastDay) {
        lastDay = key
        rows.push(
          <div key={`day-${key}-${m.id}`} className="chat-date-pill">
            <span>{dayLabel(m.created_at)}</span>
          </div>,
        )
      }
      rows.push(renderChatRow(m))
    }
    return rows
  }

  const mentorCount = members.filter((m) => m.role === 'mentor').length

  return (
    <div className="page">
      <Link to={backTo} className="back-link">← Kembali</Link>
      <div className="chat-shell">
        <header className="chat-header">
          <div className="chat-header-icon" aria-hidden="true">
            <Icon name="community" size={26} />
          </div>
          <div className="chat-header-main">
            <h1 className="chat-header-title">SINEVERSE Mentor Community</h1>
            <p className="chat-header-sub">Grup resmi Admin &amp; Mentor</p>
            <p className="chat-header-meta">
              <span className="chat-header-pill">{isAdmin ? 'Admin' : 'Mentor'}</span>
              <span>
                {mentorCount} mentor · {members.length} anggota
              </span>
            </p>
          </div>
          <button
            type="button"
            className="chat-kebab"
            aria-label="Menu grup"
            aria-expanded={showMembers}
            onClick={() => setShowMembers((v) => !v)}
          >
            <Icon name="kebab" size={22} />
          </button>
        </header>

        {notice && (
          <p className="notice-box" style={{ margin: '0.75rem 1rem 0' }}>
            {notice}
          </p>
        )}
        {realtimeOk === false && (
          <p className="notice-box" style={{ margin: '0.75rem 1rem 0' }}>
            Pembaruan otomatis tidak aktif — tarik untuk memuat ulang.{' '}
            <button type="button" className="btn btn-ghost btn-small" onClick={() => void loadInitial()}>
              Muat Ulang
            </button>
          </p>
        )}

        {showMembers && (
          <section
            style={{
              padding: '0.9rem 1rem',
              background: '#fff',
              borderBottom: '1px solid var(--light-grey)',
            }}
          >
            <h2 style={{ margin: '0 0 0.6rem', fontSize: '1rem' }}>Anggota ({members.length})</h2>
            {members.length === 0 ? (
              <p className="empty">Belum ada anggota.</p>
            ) : (
              <ul className="discussion-list">
                {members.map((m) => (
                  <li key={m.user_id} className="discussion-item">
                    <p>
                      {m.name} · {m.role === 'admin' ? 'Admin' : 'Mentor'}
                    </p>
                    <p className="muted">Bergabung {fmtDate(m.joined_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {pinned.length > 0 && (
          <section style={{ padding: '0.9rem 1rem 0.25rem', background: '#fff' }}>
            <p className="muted" style={{ margin: '0 0 0.6rem', fontWeight: 700 }}>
              Disematkan ({pinned.length})
            </p>
            {pinned.map((m) => renderChatRow(m, true))}
          </section>
        )}

        <form className="chat-tools" onSubmit={handleSearch}>
          <label className="chat-search">
            <Icon name="search" size={16} />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari pesan…"
              aria-label="Cari pesan"
            />
          </label>
          <button type="submit" className="btn btn-secondary btn-small" disabled={searching}>
            {searching ? 'Mencari…' : 'Cari'}
          </button>
          {searchMode && (
            <button type="button" className="btn btn-ghost btn-small" onClick={() => void handleClearSearch()}>
              Hapus pencarian
            </button>
          )}
        </form>
        {searchMode && (
          <p className="muted" style={{ margin: '0.6rem 1rem 0' }}>
            Hasil pencarian untuk “{searchTerm}” ({messages.length} pesan).
          </p>
        )}

        <div
          className="chat-list"
          ref={listRef}
          onScroll={handleListScroll}
          style={{ maxHeight: '60vh' }}
        >
          {!searchMode && hasMore && (
            <p style={{ textAlign: 'center', margin: '0 0 0.9rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                disabled={loadingMore}
                onClick={() => void handleLoadOlder()}
              >
                {loadingMore ? 'Memuat…' : 'Muat pesan lebih lama'}
              </button>
            </p>
          )}
          {messages.length === 0 ? (
            <p className="empty" style={{ background: 'transparent', border: 'none' }}>
              {searchMode ? 'Tidak ada pesan yang cocok.' : 'Belum ada pesan. Mulai percakapan pertama.'}
            </p>
          ) : (
            renderMessageList()
          )}
        </div>

        <form className="chat-composer" onSubmit={handleSend}>
          {replyTo && (
            <p className="notice-box" style={{ margin: '0 0 0.6rem' }}>
              Membalas {replyTo.sender?.name ?? 'Anggota'}: {replyTo.body.slice(0, 120)}
              {replyTo.body.length > 120 ? '…' : ''}{' '}
              <button type="button" className="link-button" onClick={() => setReplyTo(null)}>
                Batal
              </button>
            </p>
          )}
          {mentionQuery !== null && mentionSuggestions.length > 0 && (
            <ul className="chat-mention-list">
              {mentionSuggestions.map((m) => (
                <li key={m.user_id}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => pickMention(m)}
                  >
                    @{m.name} · {m.role === 'admin' ? 'Admin' : 'Mentor'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="chat-composer-tools">
            {isAdmin && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={announce}
                  onChange={(e) => setAnnounce(e.target.checked)}
                />
                Kirim sebagai pengumuman
              </label>
            )}
            <label className="btn btn-ghost btn-small" style={{ cursor: 'pointer' }}>
              <Icon name="fileText" size={16} /> Lampirkan file (maks 10 MB)
              <input
                type="file"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </label>
            {file && (
              <span className="muted">
                {file.name}{' '}
                <button type="button" className="link-button" onClick={() => setFile(null)}>
                  Hapus
                </button>
              </span>
            )}
          </div>
          <div className="chat-composer-row">
            <textarea
              ref={textareaRef}
              className="chat-composer-input"
              value={body}
              onChange={handleBodyChange}
              rows={1}
              required={file === null}
              placeholder="Tulis pesan…"
              aria-label="Tulis pesan untuk grup mentor (ketik @ untuk menyebut anggota)"
            />
            <button
              type="submit"
              className="chat-send"
              disabled={sending}
              aria-label={sending ? 'Mengirim pesan…' : 'Kirim pesan'}
            >
              <Icon name="send" size={22} />
            </button>
          </div>
          {sendError && <p className="error-box">{sendError}</p>}
        </form>
      </div>
    </div>
  )
}
