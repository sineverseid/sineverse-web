// SINEVERSE — Feed komunitas: postingan + balasan + sematkan (004).
// Hanya anggota komunitas yang bisa membaca/menulis feed (RLS); pin oleh
// pembuat komunitas atau admin.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { fmtDate, isMissingTableError } from '../lib/guarded'
import { supabase } from '../lib/supabase'
import type { Community, CommunityPost, CommunityPostReply } from '../lib/types'

export default function CommunityDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, profile } = useAuth()
  const [community, setCommunity] = useState<Community | null>(null)
  const [posts, setPosts] = useState<CommunityPost[] | null>(null)
  const [replies, setReplies] = useState<CommunityPostReply[]>([])
  const [isMember, setIsMember] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')

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
    if (userIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id,name,photo_url').in('id', userIds)
      const byId = new Map(((profs ?? []) as { id: string; name: string | null; photo_url: string | null }[]).map((p) => [p.id, p]))
      for (const r of rows) r.author = byId.get(r.user_id) ?? null
    }
    setPosts(rows)
    if (rows.length > 0) {
      const { data: reps } = await supabase
        .from('community_post_replies')
        .select('*')
        .in('post_id', rows.map((r) => r.id))
        .order('created_at', { ascending: true })
      const rrows = (reps ?? []) as CommunityPostReply[]
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
        setCommunity(data as Community | null)
        if (user) {
          const { data: mem } = await supabase
            .from('community_members')
            .select('id')
            .eq('community_id', communityId)
            .eq('user_id', user.id)
            .maybeSingle()
          if (!cancelled) setIsMember(mem !== null)
        }
        await loadPosts(communityId)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat komunitas.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id])

  if (loading) return <div className="page"><p className="muted">Memuat komunitas…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (posts === null) return <div className="page"><h1>Komunitas</h1><MigrationNotice migration="004" /></div>
  if (!community) return <div className="page"><p className="empty">Komunitas tidak ditemukan.</p><Link to="/komunitas">Kembali</Link></div>

  const canPin = profile?.role === 'admin' || community.created_by === user?.id

  async function handlePost(e: FormEvent) {
    e.preventDefault()
    const currentCommunity = community
    if (!user || !body.trim() || !currentCommunity) return
    const { error: insErr } = await supabase.from('community_posts').insert({
      community_id: currentCommunity.id,
      user_id: user.id,
      body: body.trim(),
    })
    if (insErr) setNotice(insErr.message)
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
    if (insErr) setNotice(insErr.message)
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
    if (updErr) setNotice(updErr.message)
    else await loadPosts(currentCommunity.id)
  }

  return (
    <div className="page">
      <Link to="/komunitas" className="back-link">← Semua Komunitas</Link>
      <h1>{community.name}</h1>
      <p className="muted">{community.description ?? ''}</p>
      {notice && <p className="notice-box">{notice}</p>}
      {!isMember && (
        <p className="empty">
          Kamu belum menjadi anggota komunitas ini. Gabung dari halaman{' '}
          <Link to="/komunitas">Komunitas</Link> untuk membaca dan menulis di feed.
        </p>
      )}
      {isMember && (
        <form className="form" onSubmit={handlePost}>
          <label>
            Tulis postingan
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} required placeholder="Bagikan kabar, karya, atau ajakan…" />
          </label>
          <button type="submit" className="btn btn-primary">Kirim Postingan</button>
        </form>
      )}
      {(posts ?? []).length === 0 ? (
        <p className="empty">Belum ada postingan di komunitas ini.</p>
      ) : (
        <ul className="discussion-list">
          {posts.map((p) => (
            <li key={p.id} className="discussion-item">
              <p className="discussion-meta">
                {p.author?.name ?? 'Anggota'} · {fmtDate(p.created_at)}
                {p.is_pinned ? ' · Disematkan' : ''}
              </p>
              <p>{p.body}</p>
              <ul className="discussion-replies">
                {replies.filter((r) => r.post_id === p.id).map((r) => (
                  <li key={r.id}>
                    <p className="discussion-meta">{r.author?.name ?? 'Anggota'} · {fmtDate(r.created_at)}</p>
                    <p>{r.body}</p>
                  </li>
                ))}
              </ul>
              {isMember && (
                <div className="form-actions">
                  {replyTo !== p.id && (
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => setReplyTo(p.id)}>Balas</button>
                  )}
                  {canPin && (
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => void handlePin(p)}>
                      {p.is_pinned ? 'Lepas Sematan' : 'Sematkan'}
                    </button>
                  )}
                </div>
              )}
              {isMember && replyTo === p.id && (
                <form className="form form-inline" onSubmit={(e) => handleReply(e, p.id)}>
                  <label>
                    Balasan
                    <textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} rows={2} required />
                  </label>
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary btn-small">Kirim</button>
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => setReplyTo(null)}>Batal</button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
