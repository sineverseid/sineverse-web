// SINEVERSE — Detail proyek (005): anggota, undangan & permintaan gabung,
// milestone, papan kanban tugas (Rencana → Dikerjakan → Tinjauan →
// Selesai), file proyek (bucket project-files), update produksi.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { fmtDate, isMissingTableError } from '../lib/guarded'
import { fetchProfileNames, supabase, uploadToBucket } from '../lib/supabase'
import type {
  Project,
  ProjectFile,
  ProjectInvite,
  ProjectJoinRequest,
  ProjectMember,
  ProjectMilestone,
  ProjectTask,
  ProjectTaskStatus,
  ProjectUpdate,
} from '../lib/types'

const COLUMNS: { status: ProjectTaskStatus; label: string }[] = [
  { status: 'rencana', label: 'Rencana' },
  { status: 'dikerjakan', label: 'Dikerjakan' },
  { status: 'tinjauan', label: 'Tinjauan' },
  { status: 'selesai', label: 'Selesai' },
]

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, profile } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [missing, setMissing] = useState(false)
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [requests, setRequests] = useState<ProjectJoinRequest[]>([])
  const [invites, setInvites] = useState<ProjectInvite[]>([])
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([])
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [updates, setUpdates] = useState<ProjectUpdate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [taskTitle, setTaskTitle] = useState('')
  const [taskStatus, setTaskStatus] = useState<ProjectTaskStatus>('rencana')
  const [msTitle, setMsTitle] = useState('')
  const [updateBody, setUpdateBody] = useState('')
  const [fileTitle, setFileTitle] = useState('')
  const [fileKind, setFileKind] = useState<ProjectFile['kind']>('reference')
  const [file, setFile] = useState<File | null>(null)
  const [joinMsg, setJoinMsg] = useState('')
  const [inviteName, setInviteName] = useState('')

  const isOwner = project?.owner_id === user?.id
  const isAdmin = profile?.role === 'admin'
  const isMember = members.some((m) => m.user_id === user?.id) || isOwner

  async function loadAll(projectId: string) {
    const [mem, req, inv, ms, tk, fl, up] = await Promise.all([
      supabase.from('project_members').select('*').eq('project_id', projectId),
      supabase.from('project_join_requests').select('*').eq('project_id', projectId).order('created_at', { ascending: true }),
      supabase.from('project_invites').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('project_milestones').select('*').eq('project_id', projectId).order('order_index'),
      supabase.from('project_tasks').select('*').eq('project_id', projectId).order('order_index'),
      supabase.from('project_files').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('project_updates').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    ])
    setMembers((mem.data ?? []) as ProjectMember[])
    setRequests((req.data ?? []) as ProjectJoinRequest[])
    setInvites((inv.data ?? []) as ProjectInvite[])
    setMilestones((ms.data ?? []) as ProjectMilestone[])
    setTasks((tk.data ?? []) as ProjectTask[])
    setFiles((fl.data ?? []) as ProjectFile[])
    setUpdates((up.data ?? []) as ProjectUpdate[])
    const ids = [
      ...((mem.data ?? []) as ProjectMember[]).map((m) => m.user_id),
      ...((req.data ?? []) as ProjectJoinRequest[]).map((r) => r.user_id),
      ...((up.data ?? []) as ProjectUpdate[]).map((u) => u.user_id),
    ]
    setNames(await fetchProfileNames(ids))
  }

  useEffect(() => {
    if (!id) return
    const projectId = id
    let cancelled = false
    async function load() {
      try {
        const { data, error: qErr } = await supabase.from('projects').select('*').eq('id', projectId).maybeSingle()
        if (qErr) {
          if (isMissingTableError(qErr)) {
            setMissing(true)
            return
          }
          throw qErr
        }
        if (cancelled) return
        setProject(data as Project | null)
        if (data) await loadAll(projectId)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat proyek.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading) return <div className="page"><p className="muted">Memuat proyek…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (missing) return <div className="page"><h1>Proyek</h1><MigrationNotice migration="005" /></div>
  if (!project) return <div className="page"><p className="empty">Proyek tidak ditemukan.</p><Link to="/proyek">Kembali</Link></div>

  const currentProject = project
  const refresh = () => loadAll(currentProject.id)

  async function handleJoin(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    if (currentProject.access_mode === 'open') {
      const { error: insErr } = await supabase.from('project_members').insert({
        project_id: currentProject.id,
        user_id: user.id,
        role: 'member',
        permissions: {},
      })
      if (insErr) setNotice(insErr.message)
      else {
        setNotice('Kamu bergabung dengan proyek ini.')
        await refresh()
      }
    } else if (currentProject.access_mode === 'approval') {
      const { error: insErr } = await supabase.from('project_join_requests').insert({
        project_id: currentProject.id,
        user_id: user.id,
        message: joinMsg.trim() || null,
        status: 'pending',
      })
      if (insErr) setNotice(insErr.message)
      else setNotice('Permintaan gabung terkirim. Pemilik proyek akan meninjaunya.')
    } else {
      setNotice('Proyek ini hanya bisa diikuti lewat undangan dari pemilik.')
    }
  }

  async function decideRequest(req: ProjectJoinRequest, approve: boolean) {
    const { error: updErr } = await supabase
      .from('project_join_requests')
      .update({ status: approve ? 'approved' : 'rejected', decided_by: user?.id ?? null })
      .eq('id', req.id)
    if (updErr) {
      setNotice(updErr.message)
      return
    }
    if (approve) {
      await supabase.from('project_members').insert({
        project_id: currentProject.id,
        user_id: req.user_id,
        role: 'member',
        permissions: {},
      })
    }
    await refresh()
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault()
    if (!user || !inviteName.trim()) return
    // Cari anggota berdasarkan nama (tanpa email — Crew Finder rule).
    const { data } = await supabase.from('profiles').select('id').eq('name', inviteName.trim()).maybeSingle()
    const invitee = data as { id: string } | null
    if (!invitee) {
      setNotice('Tidak ditemukan anggota dengan nama persis itu. Pastikan ejaan namanya benar.')
      return
    }
    const { error: insErr } = await supabase.from('project_invites').insert({
      project_id: currentProject.id,
      inviter_id: user.id,
      invitee_id: invitee.id,
      status: 'pending',
    })
    if (insErr) setNotice(insErr.message)
    else {
      setNotice(`Undangan terkirim ke ${inviteName.trim()}.`)
      setInviteName('')
      await refresh()
    }
  }

  async function handleInviteResponse(invite: ProjectInvite, accept: boolean) {
    const { error: updErr } = await supabase
      .from('project_invites')
      .update({ status: accept ? 'accepted' : 'declined' })
      .eq('id', invite.id)
    if (updErr) {
      setNotice(updErr.message)
      return
    }
    if (accept && user) {
      await supabase.from('project_members').insert({
        project_id: currentProject.id,
        user_id: user.id,
        role: 'member',
        permissions: {},
      })
    }
    await refresh()
  }

  async function handleAddTask(e: FormEvent) {
    e.preventDefault()
    if (!taskTitle.trim()) return
    const { error: insErr } = await supabase.from('project_tasks').insert({
      project_id: currentProject.id,
      milestone_id: null,
      title: taskTitle.trim(),
      description: null,
      status: taskStatus,
      priority: 'normal',
      order_index: tasks.length,
    })
    if (insErr) setNotice(insErr.message)
    else {
      setTaskTitle('')
      await refresh()
    }
  }

  async function moveTask(task: ProjectTask, dir: 1 | -1) {
    const idx = COLUMNS.findIndex((c) => c.status === task.status)
    const next = COLUMNS[idx + dir]
    if (!next) return
    const { error: updErr } = await supabase.from('project_tasks').update({ status: next.status }).eq('id', task.id)
    if (updErr) setNotice(updErr.message)
    else await refresh()
  }

  async function handleAddMilestone(e: FormEvent) {
    e.preventDefault()
    if (!msTitle.trim()) return
    const { error: insErr } = await supabase.from('project_milestones').insert({
      project_id: currentProject.id,
      title: msTitle.trim(),
      description: null,
      is_done: false,
      order_index: milestones.length,
    })
    if (insErr) setNotice(insErr.message)
    else {
      setMsTitle('')
      await refresh()
    }
  }

  async function toggleMilestone(ms: ProjectMilestone) {
    await supabase.from('project_milestones').update({ is_done: !ms.is_done }).eq('id', ms.id)
    await refresh()
  }

  async function handleAddUpdate(e: FormEvent) {
    e.preventDefault()
    if (!user || !updateBody.trim()) return
    const { error: insErr } = await supabase.from('project_updates').insert({
      project_id: currentProject.id,
      user_id: user.id,
      body: updateBody.trim(),
    })
    if (insErr) setNotice(insErr.message)
    else {
      setUpdateBody('')
      await refresh()
    }
  }

  async function handleUploadFile(e: FormEvent) {
    e.preventDefault()
    if (!user || !file || !fileTitle.trim()) return
    const url = await uploadToBucket('project-files', `${currentProject.id}/${Date.now()}-${file.name}`, file)
    if (!url) {
      setNotice('Bucket project-files belum tersedia — file tidak bisa diunggah (lihat supabase/README.md).')
      return
    }
    const { error: insErr } = await supabase.from('project_files').insert({
      project_id: currentProject.id,
      kind: fileKind,
      title: fileTitle.trim(),
      url,
      uploaded_by: user.id,
    })
    if (insErr) setNotice(insErr.message)
    else {
      setFileTitle('')
      setFile(null)
      await refresh()
    }
  }

  const myInvite = invites.find((i) => i.invitee_id === user?.id && i.status === 'pending')

  return (
    <div className="page">
      <Link to="/proyek" className="back-link">← Semua Proyek</Link>
      <h1>{currentProject.title}</h1>
      <p className="muted">
        {currentProject.description ?? ''} · Mode: {currentProject.access_mode} · {currentProject.status}
      </p>
      {notice && <p className="notice-box">{notice}</p>}

      {myInvite && (
        <p className="notice-box">
          Kamu diundang ke proyek ini.{' '}
          <button type="button" className="btn btn-primary btn-small" onClick={() => void handleInviteResponse(myInvite, true)}>Terima</button>{' '}
          <button type="button" className="btn btn-ghost btn-small" onClick={() => void handleInviteResponse(myInvite, false)}>Tolak</button>
        </p>
      )}
      {!isMember && user && (
        <form className="form" onSubmit={handleJoin}>
          {currentProject.access_mode === 'approval' && (
            <label>
              Pesan untuk pemilik proyek
              <textarea value={joinMsg} onChange={(e) => setJoinMsg(e.target.value)} rows={2} placeholder="Peran yang kamu minati…" />
            </label>
          )}
          <button type="submit" className="btn btn-primary">
            {currentProject.access_mode === 'open' ? 'Gabung Proyek' : currentProject.access_mode === 'approval' ? 'Minta Gabung' : 'Proyek Undangan Saja'}
          </button>
        </form>
      )}

      <section className="section">
        <h2>Anggota ({members.length})</h2>
        <ul>
          {members.map((m) => (
            <li key={m.id}>{names.get(m.user_id) ?? 'Anggota'}{m.role ? ` — ${m.role}` : ''}</li>
          ))}
        </ul>
      </section>

      {(isOwner || isAdmin) && requests.filter((r) => r.status === 'pending').length > 0 && (
        <section className="section">
          <h2>Permintaan Gabung</h2>
          <ul>
            {requests.filter((r) => r.status === 'pending').map((r) => (
              <li key={r.id}>
                {names.get(r.user_id) ?? 'Anggota'}{r.message ? ` — “${r.message}”` : ''}{' '}
                <button type="button" className="btn btn-primary btn-small" onClick={() => void decideRequest(r, true)}>Setujui</button>{' '}
                <button type="button" className="btn btn-ghost btn-small" onClick={() => void decideRequest(r, false)}>Tolak</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(isOwner || isAdmin) && (
        <section className="section">
          <h2>Undang Anggota</h2>
          <form className="form" onSubmit={handleInvite}>
            <label>
              Nama anggota (persis seperti di profil)
              <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} required placeholder="Nama anggota…" />
            </label>
            <button type="submit" className="btn btn-primary">Kirim Undangan</button>
          </form>
        </section>
      )}

      {isMember && (
        <>
          <section className="section">
            <h2>Milestone</h2>
            {milestones.length === 0 ? <p className="empty">Belum ada milestone.</p> : (
              <ul>
                {milestones.map((m) => (
                  <li key={m.id}>
                    <button type="button" className="link-button" onClick={() => void toggleMilestone(m)}>
                      {m.is_done ? 'Selesai' : 'Belum selesai'}
                    </button>{' '}
                    {m.title}{m.due_date ? ` · tenggat ${fmtDate(m.due_date)}` : ''}
                  </li>
                ))}
              </ul>
            )}
            <form className="form form-inline" onSubmit={handleAddMilestone}>
              <label>
                Milestone baru
                <input value={msTitle} onChange={(e) => setMsTitle(e.target.value)} required placeholder="Mis. Syuting selesai" />
              </label>
              <button type="submit" className="btn btn-primary btn-small">Tambah</button>
            </form>
          </section>

          <section className="section">
            <h2>Papan Tugas (Kanban)</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              {COLUMNS.map((col) => (
                <div key={col.status} className="module-block">
                  <h3>{col.label}</h3>
                  {tasks.filter((t) => t.status === col.status).map((t) => (
                    <div key={t.id} style={{ border: '1px solid var(--light-grey)', borderRadius: 8, padding: '0.6rem', marginBottom: '0.5rem' }}>
                      <strong>{t.title}</strong>
                      {t.priority ? <p className="muted">Prioritas: {t.priority}</p> : null}
                      <div className="form-actions">
                        {col.status !== 'rencana' && <button type="button" className="btn btn-ghost btn-small" onClick={() => void moveTask(t, -1)}>←</button>}
                        {col.status !== 'selesai' && <button type="button" className="btn btn-ghost btn-small" onClick={() => void moveTask(t, 1)}>→</button>}
                      </div>
                    </div>
                  ))}
                  {tasks.filter((t) => t.status === col.status).length === 0 && <p className="muted">Kosong.</p>}
                </div>
              ))}
            </div>
            <form className="form form-inline" onSubmit={handleAddTask}>
              <label>
                Tugas baru
                <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} required placeholder="Mis. Tulis naskah adegan 1" />
              </label>
              <label>
                Kolom awal
                <select value={taskStatus} onChange={(e) => setTaskStatus(e.target.value as ProjectTaskStatus)} style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}>
                  {COLUMNS.map((c) => <option key={c.status} value={c.status}>{c.label}</option>)}
                </select>
              </label>
              <button type="submit" className="btn btn-primary btn-small">Tambah Tugas</button>
            </form>
          </section>

          <section className="section">
            <h2>File Proyek</h2>
            {files.length === 0 ? <p className="empty">Belum ada file.</p> : (
              <ul>
                {files.map((f) => (
                  <li key={f.id}>
                    {f.title} ({f.kind}){f.url ? <>{' — '}<a href={f.url} target="_blank" rel="noreferrer">Buka file</a></> : ''}
                  </li>
                ))}
              </ul>
            )}
            <form className="form" onSubmit={handleUploadFile}>
              <label>
                Judul file
                <input value={fileTitle} onChange={(e) => setFileTitle(e.target.value)} required placeholder="Mis. Storyboard adegan 1" />
              </label>
              <label>
                Jenis
                <select value={fileKind} onChange={(e) => setFileKind(e.target.value as ProjectFile['kind'])} style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}>
                  <option value="reference">Referensi</option>
                  <option value="storyboard">Storyboard</option>
                  <option value="shot_list">Shot-list</option>
                  <option value="production">Produksi</option>
                  <option value="other">Lainnya</option>
                </select>
              </label>
              <label>
                File
                <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
              </label>
              <button type="submit" className="btn btn-primary">Unggah File</button>
            </form>
          </section>

          <section className="section">
            <h2>Update Produksi</h2>
            <form className="form" onSubmit={handleAddUpdate}>
              <label>
                Kabar terbaru produksi
                <textarea value={updateBody} onChange={(e) => setUpdateBody(e.target.value)} rows={3} required placeholder="Mis. Syuting hari pertama selesai, 4 adegan…" />
              </label>
              <button type="submit" className="btn btn-primary">Kirim Update</button>
            </form>
            {updates.length === 0 ? <p className="empty">Belum ada update produksi.</p> : (
              <ul className="discussion-list">
                {updates.map((u) => (
                  <li key={u.id} className="discussion-item">
                    <p className="discussion-meta">{names.get(u.user_id) ?? 'Anggota'} · {fmtDate(u.created_at)}</p>
                    <p>{u.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      {!isMember && <p className="muted">Milestone, kanban, file, dan update produksi hanya terlihat oleh anggota proyek.</p>}
    </div>
  )
}
