// SINEVERSE, Feed komunitas: postingan + balasan + sematkan (004).
// Hanya anggota komunitas yang bisa membaca/menulis feed (RLS); pin oleh
// pembuat komunitas atau admin. Pembuat/admin juga bisa menghidupkan/
// mematikan penanda "Mencari pembimbing" (011).
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import Icon from '../components/icons'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { fmtDate, isMissingTableError } from '../lib/guarded'
import { fetchProfileNames, logAudit, supabase } from '../lib/supabase'
import type { Community, CommunityPost, CommunityPostReply } from '../lib/types'

interface MemberRow {
  user_id: string
  role: string
  name: string
}

export default function CommunityDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, profile } = useAuth()
  const [community, setCommunity] = useState<Community | null>(null)
  const [posts, setPosts] = useState<CommunityPost[] | null>(null)
  const [replies, setReplies] = useState<CommunityPostReply[]>([])
  const [isMember, setIsMember] = useState(false)
  const [myRole, setMyRole] = useState<string | null>(null)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [postsError, setPostsError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [tab, setTab] = useState<'diskusi' | 'pengumuman'>('diskusi')

  async function loadPosts(communityId: string) {
    const { data, error: qErr } = await supabase
      .from('community_posts')
      .select('*')
      .eq('community_id', communityId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
    if (qErr) throw qErr
    const rows = (data ?? []) as CommunityPost[]
    const userIds = [...new Set(rows.map((r) => r.user_id))]
    // Nama penulis dan balasan tidak saling bergantung: jalankan paralel.
    const [profsRes, repsRes] = await Promise.all([
      userIds.length > 0
        ? supabase.from('profiles').select('id,name,photo_url').in('id', userIds)
        : Promise.resolve({ data: null as { id: string; name: string | null; photo_url: string | null }[] | null }),
      rows.length > 0
        ? supabase
            .from('community_post_replies')
            .select('*')
            .in('post_id', rows.map((r) => r.id))
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: null as CommunityPostReply[] | null }),
    ])
    if (userIds.length > 0) {
      const byId = new Map(((profsRes.data ?? []) as { id: string; name: string | null; photo_url: string | null }[]).map((p) => [p.id, p]))
      for (const r of rows) r.author = byId.get(r.user_id) ?? null
    }
    setPosts(rows)
    if (rows.length > 0) {
      const rrows = (repsRes.data ?? []) as CommunityPostReply[]
      const rIds = [...new Set(rrows.map((r) => r.user_id))]
      if (rIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id,name').in('id', rIds)
        const byId = new Map(((profs ?? []) as { id: string; name: string | null }[]).map((p) => [p.id, p]))
        for (const r of rrows) r.author = byId.get(r.user_id) ? { name: byId.get(r.user_id)?.name ?? null, photo_url: null } : null
      }
      setReplies(rrows)
    }
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
        // Keanggotaan saya dan daftar anggota tidak saling bergantung.
        const [memRes, memRowsRes] = await Promise.all([
          user
            ? supabase
                .from('community_members')
                .select('id,role')
                .eq('community_id', communityId)
                .eq('user_id', user.id)
                .maybeSingle()
            : Promise.resolve({ data: null as { role: string | null } | null }),
          supabase
            .from('community_members')
            .select('user_id,role')
            .eq('community_id', communityId),
        ])
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
        // Daftar anggota + jumlah anggota; nama anggota dan feed dimuat
        // paralel karena tidak saling bergantung.
        const memList = (memRowsRes.data ?? []) as { user_id: string; role: string | null }[]
        // Feed hanya boleh dibaca anggota, pembuat, dan admin. Bila query
        // post diblokir RLS, tampilkan pesan terkunci, bukan halaman error.
        const canRead =
          member || comm?.created_by === user?.id || profile?.role === 'admin'
        const namesPromise = fetchProfileNames(memList.map((m) => m.user_id))
          .catch(() => new Map<string, string>())
          .then((names) => {
            if (!cancelled) {
              setMembers(
                memList.map((m) => ({
                  user_id: m.user_id,
                  role: m.role ?? 'member',
                  name: names.get(m.user_id) ?? 'Anggota',
                })),
              )
            }
          })
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
        await Promise.all([namesPromise, postsPromise])
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
      { user_id: user.id, role: 'member', name: profile?.name ?? 'Anggota' },
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

  async function handlePost(e: FormEvent) {
    e.preventDefault()
    const currentCommunity = community
    if (!user || !body.trim() || !currentCommunity) return
    const { error: insErr } = await supabase.from('community_posts').insert({
      community_id: currentCommunity.id,
      user_id: user.id,
      body: body.trim(),
    })
    if (insErr) setNotice('Gagal mengirim postingan. Coba lagi nanti.')
    else {
      setBody('')
      await loadPosts(currentCommunity.id)
    }
  }

  async function handleReply(e: FormEvent, postId: string) {
    e.preventDefault()
    const currentCommunity = community
    if (!user || !replyBody.trim() || !currentCommunity) return
    const { error: insErr } = await supabase.from('community_post_replies').insert({
      post_id: postId,
      user_id: user.id,
      body: replyBody.trim(),
    })
    if (insErr) setNotice('Gagal mengirim balasan. Coba lagi nanti.')
    else {
      setReplyBody('')
      setReplyTo(null)
      await loadPosts(currentCommunity.id)
    }
  }

  async function handlePin(post: CommunityPost) {
    const currentCommunity = community
    if (!currentCommunity) return
    const { error: updErr } = await supabase
      .from('community_posts')
      .update({ is_pinned: !post.is_pinned })
      .eq('id', post.id)
    if (updErr) setNotice('Gagal mengubah sematan. Coba lagi nanti.')
    else await loadPosts(currentCommunity.id)
  }

  const allPosts = posts ?? []
  const pinnedPosts = allPosts.filter((p) => p.is_pinned)
  const visiblePosts = tab === 'pengumuman' ? pinnedPosts : allPosts

  function scrollToPostForm() {
    const form = document.getElementById('buat-post')
    if (!form) return
    form.scrollIntoView({ behavior: 'smooth' })
    form.querySelector('textarea')?.focus({ preventScroll: true })
  }

  function renderPostCard(p: CommunityPost) {
    const postReplies = replies.filter((r) => r.post_id === p.id)
    const authorName = p.author?.name ?? 'Anggota'
    return (
      <article key={p.id} className="post-card">
        <div className="post-head">
          {p.author?.photo_url ? (
            <img src={p.author.photo_url} alt="" className="post-avatar" />
          ) : (
            <div className="post-avatar" aria-hidden="true">
              {authorName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="post-name">
              {authorName}
              {p.is_pinned ? ' · Disematkan' : ''}
            </p>
            <p className="post-time">{fmtDate(p.created_at)}</p>
          </div>
        </div>
        <p className="post-body">{p.body}</p>
        <div className="post-actions">
          <span>
            <Icon name="message" size={16} />
            {postReplies.length} Balasan
          </span>
        </div>
        {postReplies.length > 0 && (
          <ul className="discussion-replies">
            {postReplies.map((r) => (
              <li key={r.id}>
                <p className="discussion-meta">
                  {r.author?.name ?? 'Anggota'} · {fmtDate(r.created_at)}
                </p>
                <p>{r.body}</p>
              </li>
            ))}
          </ul>
        )}
        {isMember && (
          <div className="form-actions">
            {replyTo !== p.id && (
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => setReplyTo(p.id)}
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
          </div>
        )}
        {isMember && replyTo === p.id && (
          <form className="form form-inline" onSubmit={(e) => handleReply(e, p.id)}>
            <label>
              Balasan
              <textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                rows={2}
                required
              />
            </label>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary btn-small">
                Kirim
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => setReplyTo(null)}
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
      <h1>{community.name}</h1>
      {community.description ? (
        <p className="muted">{community.description}</p>
      ) : (
        <p className="muted">Belum ada deskripsi.</p>
      )}
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
      {notice && <p className="notice-box">{notice}</p>}

      <section className="section">
        <h2>Anggota ({members.length})</h2>
        {members.length === 0 ? (
          <p className="empty">Belum ada anggota.</p>
        ) : (
          <ul className="discussion-list">
            {members.map((m) => (
              <li key={m.user_id} className="discussion-item">
                <p>
                  {m.name}
                  {m.role === 'mentor' ? ' · Pembimbing' : ''}
                </p>
              </li>
            ))}
          </ul>
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
            <p>
              <button type="button" className="btn-mint" onClick={scrollToPostForm}>
                + Buat Post
              </button>
            </p>
          )}
          {tab === 'diskusi' && isMember && (
            <form id="buat-post" className="form" onSubmit={handlePost}>
              <label>
                Tulis postingan
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} required placeholder="Bagikan kabar, karya, atau ajakan…" />
              </label>
              <button type="submit" className="btn btn-primary">Kirim Postingan</button>
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
        </>
      )}
    </div>
  )
}
