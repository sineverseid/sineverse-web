// SINEVERSE — Diskusi Admin ↔ Mentor (008): thread privat per mentor
// atau broadcast ke semua mentor. Admin memulai thread; mentor yang
// dituju (atau semua mentor bila broadcast) bisa membalas.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { fmtDate, isMissingTableError } from '../lib/guarded'
import { fetchProfileNames, supabase } from '../lib/supabase'
import type { AdminDiscussion, AdminDiscussionReply } from '../lib/types'
import WorkspaceNav from '../components/WorkspaceNav'
import { ADMIN_NAV, MENTOR_NAV } from '../lib/workspaceNav'

export default function AdminDiscussionsPage() {
  const { user, profile } = useAuth()
  const [threads, setThreads] = useState<AdminDiscussion[] | null>(null)
  const [replies, setReplies] = useState<AdminDiscussionReply[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [mentors, setMentors] = useState<{ id: string; name: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [target, setTarget] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')

  const isAdmin = profile?.role === 'admin'
  const isMentor = profile?.role === 'mentor'

  async function load() {
    try {
      // Daftar mentor independen dari thread/balasan — dimulai paralel
      // dengan query thread, baru dipakai setelah balasan termuat.
      const mentorsP = supabase.from('profiles').select('id,name,role').eq('role', 'mentor')
      let query = supabase.from('admin_discussions').select('*').order('created_at', { ascending: false })
      if (isMentor && user) {
        // Mentor hanya melihat thread yang ditujukan kepadanya atau broadcast.
        query = query.or(`mentor_id.eq.${user.id},mentor_id.is.null`)
      }
      const { data, error: qErr } = await query
      if (qErr) {
        if (isMissingTableError(qErr)) setThreads(null)
        else throw qErr
        return
      }
      const rows = (data ?? []) as AdminDiscussion[]
      setThreads(rows)
      if (rows.length > 0) {
        const { data: rData } = await supabase.from('admin_discussion_replies').select('*').in('thread_id', rows.map((t) => t.id)).order('created_at', { ascending: true })
        const rRows = (rData ?? []) as AdminDiscussionReply[]
        setReplies(rRows)
        const { data: profs } = await mentorsP
        setMentors(((profs ?? []) as { id: string; name: string | null }[]).map((p) => ({ id: p.id, name: p.name })))
        setNames(await fetchProfileNames([
          ...rows.map((t) => t.admin_id),
          ...rows.map((t) => t.mentor_id).filter((x): x is string => !!x),
          ...rRows.map((r) => r.user_id),
        ]))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat diskusi.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profile?.role])

  if (!isAdmin && !isMentor) {
    return (
      <div className="page">
        <h1>Diskusi Admin ↔ Mentor</h1>
        <p className="empty">Halaman ini hanya untuk admin dan mentor.</p>
      </div>
    )
  }
  if (loading) return <div className="page"><p className="muted">Memuat diskusi…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (threads === null) return <div className="page"><h1>Diskusi Admin ↔ Mentor</h1><MigrationNotice migration="008" /></div>

  async function handleStart(e: FormEvent) {
    e.preventDefault()
    if (!user || !title.trim()) return
    const { error: insErr } = await supabase.from('admin_discussions').insert({
      admin_id: user.id,
      mentor_id: target || null,
      title: title.trim(),
      body: body.trim() || null,
    })
    if (insErr) setNotice(insErr.message)
    else {
      setNotice(target ? 'Thread diskusi privat dibuat.' : 'Broadcast ke semua mentor dibuat.')
      setTitle('')
      setBody('')
      setTarget('')
      await load()
    }
  }

  async function handleReply(e: FormEvent, threadId: string) {
    e.preventDefault()
    if (!user || !replyBody.trim()) return
    const { error: insErr } = await supabase.from('admin_discussion_replies').insert({
      thread_id: threadId,
      user_id: user.id,
      body: replyBody.trim(),
    })
    if (insErr) setNotice(insErr.message)
    else {
      setReplyBody('')
      setReplyTo(null)
      await load()
    }
  }

  return (
    <div className="page">
      <h1>Diskusi Admin ↔ Mentor</h1>
      <WorkspaceNav entries={isAdmin ? ADMIN_NAV : MENTOR_NAV} />
      {notice && <p className="notice-box">{notice}</p>}
      {isAdmin && (
        <form className="form" onSubmit={handleStart}>
          <label>
            Judul thread
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label>
            Pesan awal
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
          </label>
          <label>
            Ditujukan ke
            <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}>
              <option value="">Semua mentor (broadcast)</option>
              {mentors.map((m) => <option key={m.id} value={m.id}>{m.name ?? 'Mentor'}</option>)}
            </select>
          </label>
          <button type="submit" className="btn btn-primary">Mulai Thread</button>
        </form>
      )}
      {threads.length === 0 ? (
        <p className="empty">Belum ada thread diskusi.</p>
      ) : (
        <ul className="discussion-list">
          {threads.map((t) => (
            <li key={t.id} className="discussion-item">
              <p className="discussion-meta">
                {t.mentor_id ? `Privat: ${names.get(t.mentor_id) ?? 'Mentor'}` : 'Broadcast ke semua mentor'} · {fmtDate(t.created_at)}
              </p>
              <h3>{t.title}</h3>
              {t.body && <p>{t.body}</p>}
              <ul className="discussion-replies">
                {replies.filter((r) => r.thread_id === t.id).map((r) => (
                  <li key={r.id}>
                    <p className="discussion-meta">{names.get(r.user_id) ?? 'Anggota'} · {fmtDate(r.created_at)}</p>
                    <p>{r.body}</p>
                  </li>
                ))}
              </ul>
              {user && replyTo !== t.id && (
                <button type="button" className="btn btn-ghost btn-small" onClick={() => setReplyTo(t.id)}>Balas</button>
              )}
              {user && replyTo === t.id && (
                <form className="form form-inline" onSubmit={(e) => handleReply(e, t.id)}>
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
