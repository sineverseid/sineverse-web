// SINEVERSE, Detail proyek (005): anggota, undangan & permintaan gabung,
// milestone, papan kanban tugas (Rencana → Dikerjakan → Tinjauan →
// Selesai), file proyek (bucket project-files), update produksi.
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { fmtDate, isMissingTableError } from '../lib/guarded'
import { fetchCrewProfiles, fetchProfileNames, logAudit, supabase, uploadToBucket } from '../lib/supabase'
import { fetchProjectChatSummary } from '../lib/projectChat'
import type { ProjectChatSummary } from '../lib/projectChat'
import type {
  Project,
  ProjectAccessMode,
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

const MODE_LABEL: Record<ProjectAccessMode, string> = {
  open: 'Terbuka',
  approval: 'Butuh persetujuan',
  invite_only: 'Undangan saja',
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Aktif',
  draft: 'Draf',
  completed: 'Selesai',
  archived: 'Diarsipkan',
  paused: 'Dijeda',
  cancelled: 'Dibatalkan',
}

const PRIORITY_LABEL: Record<string, string> = {
  high: 'tinggi',
  medium: 'sedang',
  low: 'rendah',
}

const REQUEST_STATUS_LABEL: Record<string, string> = {
  pending: 'Menunggu',
  approved: 'Disetujui',
  rejected: 'Ditolak',
}

const SECTION_FAILED = 'Bagian ini gagal dimuat.'

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
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
  const [sectionErrors, setSectionErrors] = useState<Record<string, boolean>>({})
  const [templateTitle, setTemplateTitle] = useState<string | null>(null)
  const [crewNames, setCrewNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Chat Tim (Fase 3, migrasi 068): ringkasan unread + pesan terakhir.
  const [chatSummary, setChatSummary] = useState<ProjectChatSummary | null>(null)
  const [chatReady, setChatReady] = useState(false)

  const [taskTitle, setTaskTitle] = useState('')
  const [taskDesc, setTaskDesc] = useState('')
  const [taskStatus, setTaskStatus] = useState<ProjectTaskStatus>('rencana')
  const [msTitle, setMsTitle] = useState('')
  const [updateBody, setUpdateBody] = useState('')
  const [fileTitle, setFileTitle] = useState('')
  const [fileKind, setFileKind] = useState<ProjectFile['kind']>('reference')
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [joinMsg, setJoinMsg] = useState('')
  const [inviteName, setInviteName] = useState('')
  // B47: bila nama yang diketik cocok dengan beberapa anggota, tampilkan
  // daftarnya untuk dipilih.
  const [inviteMatches, setInviteMatches] = useState<{ id: string; name: string | null }[]>([])

  // Ubah proyek (pemilik / admin).
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editMode, setEditMode] = useState<ProjectAccessMode>('open')

  const isOwner = project?.owner_id === user?.id
  const isAdmin = profile?.role === 'admin'
  const isMember = members.some((m) => m.user_id === user?.id) || isOwner

  // Prefill nama undangan dari Crew Finder (?undang=Nama).
  useEffect(() => {
    const prefilled = searchParams.get('undang')
    if (prefilled) setInviteName(prefilled)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Nama untuk autocomplete undangan: kru yang membuka diri + anggota proyek.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const crew = await fetchCrewProfiles()
        if (!cancelled) setCrewNames(crew.map((c) => c.name ?? '').filter(Boolean))
      } catch {
        // Autocomplete bersifat tambahan; kegagalan dimuat tidak menghalangi undangan manual.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function loadAll(projectId: string) {
    // Setiap query dibungkus sendiri: satu query gagal tidak boleh
    // mengosongkan atau merusak seluruh halaman.
    const errors: Record<string, boolean> = {}
    const [mem, req, inv, ms, tk, fl, up] = await Promise.all([
      supabase.from('project_members').select('*').eq('project_id', projectId).then(
        (r) => { if (r.error) errors.members = true; return r },
        () => { errors.members = true; return { data: null } as { data: null } },
      ),
      supabase.from('project_join_requests').select('*').eq('project_id', projectId).order('created_at', { ascending: true }).then(
        (r) => { if (r.error) errors.requests = true; return r },
        () => { errors.requests = true; return { data: null } as { data: null } },
      ),
      supabase.from('project_invites').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).then(
        (r) => { if (r.error) errors.invites = true; return r },
        () => { errors.invites = true; return { data: null } as { data: null } },
      ),
      supabase.from('project_milestones').select('*').eq('project_id', projectId).order('order_index').then(
        (r) => { if (r.error) errors.milestones = true; return r },
        () => { errors.milestones = true; return { data: null } as { data: null } },
      ),
      supabase.from('project_tasks').select('*').eq('project_id', projectId).order('order_index').then(
        (r) => { if (r.error) errors.tasks = true; return r },
        () => { errors.tasks = true; return { data: null } as { data: null } },
      ),
      supabase.from('project_files').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).then(
        (r) => { if (r.error) errors.files = true; return r },
        () => { errors.files = true; return { data: null } as { data: null } },
      ),
      supabase.from('project_updates').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).then(
        (r) => { if (r.error) errors.updates = true; return r },
        () => { errors.updates = true; return { data: null } as { data: null } },
      ),
    ])
    setSectionErrors(errors)
    if (!errors.members) setMembers((mem.data ?? []) as ProjectMember[])
    if (!errors.requests) setRequests((req.data ?? []) as ProjectJoinRequest[])
    if (!errors.invites) setInvites((inv.data ?? []) as ProjectInvite[])
    if (!errors.milestones) setMilestones((ms.data ?? []) as ProjectMilestone[])
    if (!errors.tasks) setTasks((tk.data ?? []) as ProjectTask[])
    if (!errors.files) setFiles((fl.data ?? []) as ProjectFile[])
    if (!errors.updates) setUpdates((up.data ?? []) as ProjectUpdate[])
    const ids = [
      ...(((mem.data ?? []) as ProjectMember[]).map((m) => m.user_id)),
      ...(((req.data ?? []) as ProjectJoinRequest[]).map((r) => r.user_id)),
      ...(((up.data ?? []) as ProjectUpdate[]).map((u) => u.user_id)),
    ]
    try {
      setNames(await fetchProfileNames(ids))
    } catch {
      // Nama boleh tampil sebagai "Anggota" bila gagal dimuat.
    }
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
        if (data) {
          // loadAll (7 query anggota/tugas/dll) dan judul template
          // independen — keduanya hanya butuh projectId/template dari
          // baris proyek — dijalankan paralel, bukan berurutan.
          const proj = data as Project
          const templateP = proj.template
            ? supabase.from('project_templates').select('title').eq('slug', proj.template).maybeSingle()
            : null
          await loadAll(projectId)
          if (templateP) {
            const { data: tData } = await templateP
            if (!cancelled) setTemplateTitle((tData as { title: string } | null)?.title ?? '—')
          }
        }
      } catch {
        if (!cancelled) setError('Gagal memuat proyek. Coba lagi.')
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

  // Ringkasan Chat Tim (Fase 3): hanya anggota/pemilik/admin. Bila migrasi
  // 068 belum diterapkan, kartu disembunyikan (bukan error halaman).
  useEffect(() => {
    if (!id || !user) return
    if (!isMember && !isAdmin) return
    let cancelled = false
    void (async () => {
      try {
        const summary = await fetchProjectChatSummary(id, user.id)
        if (!cancelled) {
          setChatSummary(summary)
          setChatReady(true)
        }
      } catch {
        if (!cancelled) setChatReady(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id, isMember, isAdmin])

  if (loading) return <div className="page"><p className="muted">Memuat proyek…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (missing) return <div className="page"><h1>Proyek</h1><MigrationNotice migration="005" /></div>
  if (!project) return <div className="page"><p className="empty">Proyek tidak ditemukan.</p><Link to="/proyek">Kembali</Link></div>

  const currentProject = project
  const refresh = () => loadAll(currentProject.id)
  const myRequest = requests.filter((r) => r.user_id === user?.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  const myPendingRequest = myRequest?.status === 'pending' ? myRequest : null

  async function handleJoin(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    if (myPendingRequest) {
      setNotice('Permintaan gabungmu masih menunggu persetujuan pemilik proyek.')
      return
    }
    if (currentProject.access_mode === 'open') {
      const { error: insErr } = await supabase.from('project_members').insert({
        project_id: currentProject.id,
        user_id: user.id,
        role: 'member',
        permissions: {},
      })
      if (insErr) setNotice('Gagal bergabung dengan proyek. Coba lagi.')
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
      if (insErr) setNotice('Gagal mengirim permintaan gabung. Coba lagi.')
      else {
        setNotice('Permintaan gabung terkirim. Pemilik proyek akan meninjaunya.')
        await refresh()
      }
    } else {
      setNotice('Proyek ini hanya bisa diikuti lewat undangan dari pemilik.')
    }
  }

  async function decideRequest(req: ProjectJoinRequest, approve: boolean) {
    if (approve) {
      // B46: anggota dimasukkan DULU, baru status diubah ke approved —
      // bila insert gagal, status tetap pending dan permintaan tidak hilang.
      const { error: memErr } = await supabase.from('project_members').insert({
        project_id: currentProject.id,
        user_id: req.user_id,
        role: 'member',
        permissions: {},
      })
      if (memErr) {
        setNotice('Gagal menambahkan anggota. Permintaan tetap menunggu.')
        await refresh()
        return
      }
    }
    const { error: updErr } = await supabase
      .from('project_join_requests')
      .update({ status: approve ? 'approved' : 'rejected', decided_by: user?.id ?? null })
      .eq('id', req.id)
    if (updErr) {
      setNotice('Gagal memproses permintaan gabung. Coba lagi.')
      return
    }
    await refresh()
  }

  async function sendInvite(invitee: { id: string; name: string | null }) {
    if (!user) return
    // B47: tolak bila diri sendiri, sudah anggota, atau sudah punya
    // undangan pending.
    if (invitee.id === user.id) {
      setNotice('Kamu tidak bisa mengundang dirimu sendiri.')
      return
    }
    if (members.some((m) => m.user_id === invitee.id)) {
      setNotice(`${invitee.name ?? 'Anggota'} sudah menjadi anggota proyek ini.`)
      return
    }
    if (invites.some((i) => i.invitee_id === invitee.id && i.status === 'pending')) {
      setNotice(`${invitee.name ?? 'Anggota'} sudah punya undangan yang masih menunggu jawaban.`)
      return
    }
    const { error: insErr } = await supabase.from('project_invites').insert({
      project_id: currentProject.id,
      inviter_id: user.id,
      invitee_id: invitee.id,
      status: 'pending',
    })
    if (insErr) setNotice('Gagal mengirim undangan. Coba lagi.')
    else {
      setNotice(`Undangan terkirim ke ${invitee.name ?? 'anggota'}.`)
      setInviteName('')
      setInviteMatches([])
      await refresh()
    }
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault()
    if (!user || !inviteName.trim()) return
    // B47: cari berdasarkan nama (substring, tanpa beda huruf besar/kecil).
    // Bila nama cocok dengan beberapa anggota, tampilkan daftarnya untuk
    // dipilih — bukan gagal dengan "Tidak ditemukan anggota".
    const q = inviteName.trim().replace(/[%_]/g, '')
    const { data } = await supabase
      .from('public_profiles')
      .select('id,name')
      .ilike('name', `%${q}%`)
      .order('name')
      .limit(10)
    const matches = (data ?? []) as { id: string; name: string | null }[]
    if (matches.length === 0) {
      setInviteMatches([])
      setNotice('Tidak ditemukan anggota dengan nama itu. Pilih salah satu saran atau periksa ejaannya.')
      return
    }
    if (matches.length === 1) {
      await sendInvite(matches[0])
      return
    }
    setInviteMatches(matches)
    setNotice(`${matches.length} anggota cocok dengan nama itu — pilih salah satu di bawah.`)
  }

  async function handleInviteResponse(invite: ProjectInvite, accept: boolean) {
    if (accept && user) {
      // B48: anggota dimasukkan DULU, baru undangan ditandai diterima —
      // bila insert gagal, undangan tetap pending dan tidak hilang.
      const { error: memErr } = await supabase.from('project_members').insert({
        project_id: currentProject.id,
        user_id: user.id,
        role: 'member',
        permissions: {},
      })
      if (memErr) {
        setNotice('Gagal menambahkan anggota. Undangan tetap menunggu jawaban.')
        await refresh()
        return
      }
    }
    const { error: updErr } = await supabase
      .from('project_invites')
      .update({ status: accept ? 'accepted' : 'declined' })
      .eq('id', invite.id)
    if (updErr) {
      setNotice('Gagal menjawab undangan. Coba lagi.')
      return
    }
    await refresh()
  }

  async function handleLeave() {
    if (!user || isOwner) return
    if (!window.confirm('Keluar dari proyek ini? Kamu tidak akan lagi melihat milestone, tugas, dan file proyek.')) return
    const { error: delErr } = await supabase.from('project_members').delete().eq('project_id', currentProject.id).eq('user_id', user.id)
    if (delErr) {
      setNotice('Gagal keluar dari proyek. Coba lagi.')
      return
    }
    await logAudit('project.left', 'projects', currentProject.id, { title: currentProject.title })
    setNotice('Kamu sudah keluar dari proyek ini.')
    await refresh()
  }

  function startEdit() {
    setEditTitle(currentProject.title)
    setEditDesc(currentProject.description ?? '')
    setEditMode(currentProject.access_mode)
    setEditing(true)
  }

  async function handleEdit(e: FormEvent) {
    e.preventDefault()
    if (!editTitle.trim()) return
    const { error: updErr } = await supabase.from('projects').update({
      title: editTitle.trim(),
      description: editDesc.trim() || null,
      access_mode: editMode,
    }).eq('id', currentProject.id)
    if (updErr) {
      setNotice('Gagal mengubah proyek. Coba lagi.')
      return
    }
    await logAudit('project.updated', 'projects', currentProject.id, { title: editTitle.trim() })
    setProject({ ...currentProject, title: editTitle.trim(), description: editDesc.trim() || null, access_mode: editMode })
    setEditing(false)
    setNotice('Proyek berhasil diubah.')
  }

  async function handleDelete() {
    if (!window.confirm(`Hapus proyek "${currentProject.title}" beserta seluruh anggotanya? Tindakan ini tidak bisa dibatalkan.`)) return
    const { error: memErr } = await supabase.from('project_members').delete().eq('project_id', currentProject.id)
    if (memErr) {
      setNotice('Gagal menghapus proyek. Coba lagi.')
      return
    }
    const { error: delErr } = await supabase.from('projects').delete().eq('id', currentProject.id)
    if (delErr) {
      setNotice('Gagal menghapus proyek. Coba lagi.')
      return
    }
    await logAudit('project.deleted', 'projects', currentProject.id, { title: currentProject.title })
    navigate('/proyek')
  }

  async function handleAddTask(e: FormEvent) {
    e.preventDefault()
    if (!taskTitle.trim()) return
    const { error: insErr } = await supabase.from('project_tasks').insert({
      project_id: currentProject.id,
      milestone_id: null,
      title: taskTitle.trim(),
      description: taskDesc.trim() || null,
      status: taskStatus,
      priority: 'normal',
      order_index: tasks.length,
    })
    if (insErr) setNotice('Gagal menambah tugas. Coba lagi.')
    else {
      setTaskTitle('')
      setTaskDesc('')
      await refresh()
    }
  }

  async function moveTask(task: ProjectTask, dir: 1 | -1) {
    const idx = COLUMNS.findIndex((c) => c.status === task.status)
    const next = COLUMNS[idx + dir]
    if (!next) return
    const { error: updErr } = await supabase.from('project_tasks').update({ status: next.status }).eq('id', task.id)
    if (updErr) setNotice('Gagal memindahkan tugas. Coba lagi.')
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
    if (insErr) setNotice('Gagal menambah milestone. Coba lagi.')
    else {
      setMsTitle('')
      await refresh()
    }
  }

  async function toggleMilestone(ms: ProjectMilestone) {
    const { error: updErr } = await supabase.from('project_milestones').update({ is_done: !ms.is_done }).eq('id', ms.id)
    if (updErr) {
      setNotice('Gagal mengubah milestone. Coba lagi.')
      return
    }
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
    if (insErr) setNotice('Gagal mengirim update. Coba lagi.')
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
      setNotice('Bucket project-files belum tersedia, file tidak bisa diunggah (lihat supabase/README.md).')
      return
    }
    const { error: insErr } = await supabase.from('project_files').insert({
      project_id: currentProject.id,
      kind: fileKind,
      title: fileTitle.trim(),
      url,
      uploaded_by: user.id,
    })
    if (insErr) setNotice('Gagal menyimpan file. Coba lagi.')
    else {
      setFileTitle('')
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await refresh()
    }
  }

  const myInvite = invites.find((i) => i.invitee_id === user?.id && i.status === 'pending')
  const inviteSuggestions = inviteName.trim()
    ? [...new Set([...crewNames, ...members.map((m) => names.get(m.user_id) ?? '')])]
        .filter((n) => n && n.toLowerCase().includes(inviteName.trim().toLowerCase()) && n.toLowerCase() !== inviteName.trim().toLowerCase())
        .slice(0, 5)
    : []

  return (
    <div className="page">
      <Link to="/proyek" className="back-link">← Semua Proyek</Link>
      <h1>{currentProject.title}</h1>
      <p className="muted">
        {currentProject.description ?? ''} · Mode: {MODE_LABEL[currentProject.access_mode]} · {STATUS_LABEL[currentProject.status] ?? currentProject.status}
        {templateTitle ? ` · Template: ${templateTitle}` : ''}
      </p>
      {notice && <p className="notice-box">{notice}</p>}

      {(isOwner || isAdmin) && (
        <div className="form-actions" style={{ marginBottom: '1rem' }}>
          {editing ? (
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditing(false)}>Batalkan Perubahan</button>
          ) : (
            <button type="button" className="btn btn-ghost btn-small" onClick={startEdit}>Ubah Proyek</button>
          )}
          <button type="button" className="btn btn-ghost btn-small" onClick={() => void handleDelete()}>Hapus Proyek</button>
        </div>
      )}
      {isMember && !isOwner && (
        <div className="form-actions" style={{ marginBottom: '1rem' }}>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => void handleLeave()}>Keluar dari Proyek</button>
        </div>
      )}
      {editing && (isOwner || isAdmin) && (
        <section className="section">
          <h2>Ubah Proyek</h2>
          <form className="form" onSubmit={handleEdit}>
            <label>
              Judul proyek
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
            </label>
            <label>
              Deskripsi
              <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3} />
            </label>
            <label>
              Mode akses
              <select value={editMode} onChange={(e) => setEditMode(e.target.value as ProjectAccessMode)} style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}>
                <option value="open">Terbuka, siapa saja bisa gabung</option>
                <option value="approval">Persetujuan, pemilik menyetujui permintaan gabung</option>
                <option value="invite_only">Undangan saja</option>
              </select>
            </label>
            <button type="submit" className="btn btn-primary">Simpan Perubahan</button>
          </form>
        </section>
      )}

      {myInvite && (
        <p className="notice-box">
          Kamu diundang ke proyek ini.{' '}
          <button type="button" className="btn btn-primary btn-small" onClick={() => void handleInviteResponse(myInvite, true)}>Terima</button>{' '}
          <button type="button" className="btn btn-ghost btn-small" onClick={() => void handleInviteResponse(myInvite, false)}>Tolak</button>
        </p>
      )}
      {!isMember && user && currentProject.access_mode === 'invite_only' && (
        <p className="notice-box">Proyek ini hanya bisa diikuti lewat undangan.</p>
      )}
      {!isMember && user && currentProject.access_mode !== 'invite_only' && !myPendingRequest && (
        <form className="form" onSubmit={handleJoin}>
          {currentProject.access_mode === 'approval' && (
            <label>
              Pesan untuk pemilik proyek
              <textarea value={joinMsg} onChange={(e) => setJoinMsg(e.target.value)} rows={2} placeholder="Peran yang kamu minati…" />
            </label>
          )}
          <button type="submit" className="btn btn-primary">
            {currentProject.access_mode === 'open' ? 'Gabung Proyek' : 'Minta Gabung'}
          </button>
        </form>
      )}
      {!isMember && user && myPendingRequest && (
        <p className="notice-box">Permintaan gabungmu masih menunggu persetujuan pemilik proyek.</p>
      )}
      {!isMember && user && myRequest && myRequest.status === 'rejected' && (
        <p className="notice-box">Permintaan gabungmu ditolak oleh pemilik proyek.</p>
      )}
      {!isMember && user && myRequest && myRequest.status === 'approved' && (
        <p className="notice-box">Permintaan gabungmu disetujui.</p>
      )}

      <section className="section">
        <h2>Anggota ({members.length})</h2>
        {sectionErrors.members && <p className="notice-box">{SECTION_FAILED}</p>}
        <ul>
          {members.map((m) => (
            <li key={m.id}>{names.get(m.user_id) ?? 'Anggota'}{m.role ? `, ${m.role}` : ''}</li>
          ))}
        </ul>
      </section>

      {(isMember || isAdmin) && chatReady && (
        <section className="section">
          <h2>Chat Tim</h2>
          {chatSummary && chatSummary.unread > 0 ? (
            <p className="notice-box">{chatSummary.unread} pesan belum dibaca.</p>
          ) : (
            <p className="muted">Semua pesan sudah dibaca.</p>
          )}
          {chatSummary?.latest ? (
            <p className="muted">
              Terakhir dari {chatSummary.latest.senderName} · {fmtDate(chatSummary.latest.createdAt)}: {(chatSummary.latest.body || '[Lampiran]').slice(0, 120)}
              {chatSummary.latest.body.length > 120 ? '…' : ''}
            </p>
          ) : (
            <p className="muted">Belum ada pesan di chat tim.</p>
          )}
          <p>
            <Link to={`/proyek/${currentProject.id}/chat`} className="btn btn-primary">
              Buka Chat Tim
            </Link>
          </p>
        </section>
      )}

      {(isOwner || isAdmin) && requests.filter((r) => r.status === 'pending').length > 0 && (
        <section className="section">
          <h2>Permintaan Gabung</h2>
          {sectionErrors.requests && <p className="notice-box">{SECTION_FAILED}</p>}
          <ul>
            {requests.filter((r) => r.status === 'pending').map((r) => (
              <li key={r.id}>
                {names.get(r.user_id) ?? 'Anggota'}{r.message ? `, “${r.message}”` : ''}{' '}
                <button type="button" className="btn btn-primary btn-small" onClick={() => void decideRequest(r, true)}>Setujui</button>{' '}
                <button type="button" className="btn btn-ghost btn-small" onClick={() => void decideRequest(r, false)}>Tolak</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {(isOwner || isAdmin) && requests.filter((r) => r.status === 'rejected').length > 0 && (
        <section className="section">
          <h2>Permintaan Ditolak</h2>
          <ul>
            {requests.filter((r) => r.status === 'rejected').map((r) => (
              <li key={r.id}>{names.get(r.user_id) ?? 'Anggota'}, {REQUEST_STATUS_LABEL.rejected}</li>
            ))}
          </ul>
        </section>
      )}

      {(isOwner || isAdmin) && (
        <section className="section">
          <h2>Undang Anggota</h2>
          {sectionErrors.invites && <p className="notice-box">{SECTION_FAILED}</p>}
          <form className="form" onSubmit={handleInvite}>
            <label>
              Nama anggota
              <input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                required
                placeholder="Ketik nama anggota…"
                autoComplete="off"
              />
            </label>
            {inviteSuggestions.length > 0 && (
              <ul>
                {inviteSuggestions.map((s) => (
                  <li key={s}>
                    <button type="button" className="link-button" onClick={() => setInviteName(s)}>{s}</button>
                  </li>
                ))}
              </ul>
            )}
            {/* B47: nama kembar — tampilkan yang cocok untuk dipilih. */}
            {inviteMatches.length > 0 && (
              <div>
                <p className="muted">Beberapa anggota cocok — pilih salah satu:</p>
                <ul>
                  {inviteMatches.map((m) => (
                    <li key={m.id}>
                      <button type="button" className="btn btn-secondary btn-small" onClick={() => void sendInvite(m)}>
                        Undang {m.name ?? 'anggota'}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button type="submit" className="btn btn-primary">Kirim Undangan</button>
          </form>
        </section>
      )}

      {isMember && (
        <>
          <section className="section">
            <h2>Milestone</h2>
            {sectionErrors.milestones && <p className="notice-box">{SECTION_FAILED}</p>}
            {milestones.length === 0 && !sectionErrors.milestones ? <p className="empty">Belum ada milestone.</p> : (
              <ul>
                {milestones.map((m) => (
                  <li key={m.id}>
                    <button type="button" className="link-button" onClick={() => void toggleMilestone(m)}>
                      {m.is_done ? 'Batalkan selesai' : 'Tandai selesai'}
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
            {sectionErrors.tasks && <p className="notice-box">{SECTION_FAILED}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              {COLUMNS.map((col) => (
                <div key={col.status} className="module-block">
                  <h3>{col.label}</h3>
                  {tasks.filter((t) => t.status === col.status).map((t) => (
                    <div key={t.id} style={{ border: '1px solid var(--light-grey)', borderRadius: 8, padding: '0.6rem', marginBottom: '0.5rem' }}>
                      <strong>{t.title}</strong>
                      {t.description ? <p>{t.description}</p> : null}
                      {t.priority && t.priority !== 'normal' ? <p className="muted">Prioritas: {PRIORITY_LABEL[t.priority] ?? t.priority}</p> : null}
                      <div className="form-actions">
                        {col.status !== 'rencana' && <button type="button" className="btn btn-ghost btn-small" aria-label="Pindah ke kolom sebelumnya" title="Pindah ke kolom sebelumnya" onClick={() => void moveTask(t, -1)}>←</button>}
                        {col.status !== 'selesai' && <button type="button" className="btn btn-ghost btn-small" aria-label="Pindah ke kolom berikutnya" title="Pindah ke kolom berikutnya" onClick={() => void moveTask(t, 1)}>→</button>}
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
                Deskripsi tugas
                <input value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} placeholder="Penjelasan singkat tugas…" />
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
            {sectionErrors.files && <p className="notice-box">{SECTION_FAILED}</p>}
            {files.length === 0 && !sectionErrors.files ? <p className="empty">Belum ada file.</p> : (
              <ul>
                {files.map((f) => (
                  <li key={f.id}>
                    {f.title} ({f.kind}){f.url ? <>{', '}<a href={f.url} target="_blank" rel="noreferrer">Buka file</a></> : ''}
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
                <input ref={fileInputRef} type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
              </label>
              <button type="submit" className="btn btn-primary">Unggah File</button>
            </form>
          </section>

          <section className="section">
            <h2>Update Produksi</h2>
            {sectionErrors.updates && <p className="notice-box">{SECTION_FAILED}</p>}
            <form className="form" onSubmit={handleAddUpdate}>
              <label>
                Kabar terbaru produksi
                <textarea value={updateBody} onChange={(e) => setUpdateBody(e.target.value)} rows={3} required placeholder="Mis. Syuting hari pertama selesai, 4 adegan…" />
              </label>
              <button type="submit" className="btn btn-primary">Kirim Update</button>
            </form>
            {updates.length === 0 && !sectionErrors.updates ? <p className="empty">Belum ada update produksi.</p> : (
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
