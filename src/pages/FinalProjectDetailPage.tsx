// SINEVERSE — Final Project workspace (Tahap 5, migrasi 016): satu proyek
// film akhir dalam 6 tab (Ringkasan, Tim, Tugas, Berkas, Umpan Balik,
// Penilaian & Publikasi).
// Peran: isOwner (owner_id), isMember (pemilik atau anggota tim),
// isMentor (mentor_id), isAdmin (profile.role === 'admin'). Anggota boleh
// mengedit tugas/berkas/tim; hanya mentor/admin yang boleh memberi umpan
// balik, menilai, dan menggerakkan gerbang penilaian/publikasi; hanya
// pemilik/admin yang boleh menghapus proyek atau mengganti mentor.
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'
import { fmtDate, fmtDateOnly, fmtSize } from '../lib/guarded'
import {
  FILE_KIND_LABEL,
  FINAL_PROJECT_STEPS,
  FINAL_PROJECT_STATUS_LABEL,
  TASK_STATUS_LABEL,
  addProjectMember,
  addProjectReview,
  createProjectTask,
  deleteFinalProject,
  deleteProjectFile,
  deleteProjectTask,
  fetchFinalProject,
  fetchProjectFiles,
  fetchProjectMembers,
  fetchProjectReviews,
  fetchProjectTasks,
  publishProjectToShowcase,
  removeProjectMember,
  setProjectMentor,
  updateMemberRole,
  updateProjectStatus,
  updateTaskStatus,
  uploadProjectFile,
} from '../lib/finalProjects'
import type {
  FinalProject,
  FinalProjectFile,
  FinalProjectFileKind,
  FinalProjectMember,
  FinalProjectReview,
  FinalProjectStatus,
  FinalProjectTask,
  FinalProjectTaskStatus,
} from '../lib/finalProjects'
import { fetchProfileNames, logAudit, notifyIfAllowed, supabase, uploadToBucket } from '../lib/supabase'

type Tab = 'ringkasan' | 'tim' | 'tugas' | 'berkas' | 'umpan-balik' | 'penilaian'

const TABS: { key: Tab; label: string }[] = [
  { key: 'ringkasan', label: 'Ringkasan' },
  { key: 'tim', label: 'Tim' },
  { key: 'tugas', label: 'Tugas' },
  { key: 'berkas', label: 'Berkas' },
  { key: 'umpan-balik', label: 'Umpan Balik' },
  { key: 'penilaian', label: 'Penilaian & Publikasi' },
]

interface MentorOption {
  id: string
  name: string | null
}

export default function FinalProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [project, setProject] = useState<FinalProject | null>(null)
  const [members, setMembers] = useState<FinalProjectMember[]>([])
  const [tasks, setTasks] = useState<FinalProjectTask[]>([])
  const [files, setFiles] = useState<FinalProjectFile[]>([])
  const [reviews, setReviews] = useState<FinalProjectReview[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [mentors, setMentors] = useState<MentorOption[]>([])
  const [tab, setTab] = useState<Tab>('ringkasan')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Tim
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('')
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [editingRole, setEditingRole] = useState('')

  // Tugas
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDesc, setTaskDesc] = useState('')
  const [taskStep, setTaskStep] = useState(1)
  const [taskAssignee, setTaskAssignee] = useState('')
  const [taskDue, setTaskDue] = useState('')

  // Berkas
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadKind, setUploadKind] = useState<FinalProjectFileKind>('screenplay')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Umpan balik (mentor/admin)
  const [reviewScore, setReviewScore] = useState('')
  const [reviewFeedback, setReviewFeedback] = useState('')

  // Penilaian (mentor/admin) + publikasi (pemilik/mentor)
  const [assessScore, setAssessScore] = useState('')
  const [assessFeedback, setAssessFeedback] = useState('')
  const [filmUrl, setFilmUrl] = useState('')
  const [filmDesc, setFilmDesc] = useState('')
  const [posterFile, setPosterFile] = useState<File | null>(null)
  const posterInputRef = useRef<HTMLInputElement>(null)

  // Ganti mentor (pemilik/admin)
  const [mentorSelect, setMentorSelect] = useState('')

  const isOwner = project?.owner_id === user?.id
  const isMember = !!isOwner || members.some((m) => m.user_id === user?.id)
  const isMentor = project?.mentor_id === user?.id
  const isAdmin = profile?.role === 'admin'
  const canEdit = isMember || isAdmin
  const canReview = isMentor || isAdmin

  async function loadAll(projectId: string) {
    const [mem, tk, fl, rv] = await Promise.all([
      fetchProjectMembers(projectId).catch(() => [] as FinalProjectMember[]),
      fetchProjectTasks(projectId).catch(() => [] as FinalProjectTask[]),
      fetchProjectFiles(projectId).catch(() => [] as FinalProjectFile[]),
      fetchProjectReviews(projectId).catch(() => [] as FinalProjectReview[]),
    ])
    setMembers(mem)
    setTasks(tk)
    setFiles(fl)
    setReviews(rv)
    const ids = [
      ...mem.map((m) => m.user_id),
      ...tk.map((t) => t.assignee_id).filter((x): x is string => !!x),
      ...fl.map((f) => f.uploaded_by).filter((x): x is string => !!x),
      ...rv.map((r) => r.reviewer_id),
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
    void (async () => {
      try {
        const proj = await fetchFinalProject(projectId)
        if (cancelled) return
        if (!proj) {
          setError('Proyek tidak ditemukan atau kamu tidak punya akses untuk membacanya.')
          return
        }
        setProject(proj)
        setMentorSelect(proj.mentor_id ?? '')
        setFilmDesc(proj.description ?? '')
        await loadAll(projectId)
        try {
          const ownerNames = await fetchProfileNames(
            [proj.owner_id, proj.mentor_id].filter((x): x is string => !!x),
          )
          if (!cancelled) {
            setNames((prev) => {
              const next = new Map(prev)
              for (const [k, v] of ownerNames) next.set(k, v)
              return next
            })
          }
        } catch {
          // Nama pemilik/mentor boleh tampil sebagai "Anggota".
        }
        const { data } = await supabase.from('public_profiles').select('id,name').eq('role', 'mentor').order('name')
        if (!cancelled && data) setMentors(data as MentorOption[])
      } catch {
        if (!cancelled) setError('Gagal memuat Final Project. Coba lagi.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading) return <div className="page"><p className="muted">Memuat Final Project…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p><Link to="/proyek-akhir">← Kembali ke Proyek Akhir</Link></div>
  if (!project) return <div className="page"><p className="empty">Proyek tidak ditemukan.</p><Link to="/proyek-akhir">Kembali</Link></div>

  const current = project
  const refresh = () => loadAll(current.id)
  const nameOf = (userId: string | null | undefined) =>
    userId ? (names.get(userId) ?? 'Anggota') : '—'

  async function changeStatus(status: FinalProjectStatus, msg: string): Promise<boolean> {
    try {
      await updateProjectStatus(current.id, status)
      await logAudit('final_project.status', 'final_projects', current.id, { status })
      setProject({ ...current, status })
      setNotice(msg)
      // Fase 2 — hanya dua transisi yang diberi notifikasi (in_progress dan
      // published adalah aksi pemilik sendiri; approved/revision/rejected
      // ditangani handleAssess dengan satu notifikasi status).
      if (status === 'submitted' && current.mentor_id) {
        void notifyIfAllowed(
          current.mentor_id,
          'nilai',
          'final_project_status',
          `Film "${current.title}" dikirim untuk dinilai`,
          'Pemilik proyek mengirim film untuk dinilai. Buka proyek untuk memulai penilaian.',
          { project_id: current.id, status, reviewer_id: user?.id ?? null },
        ).catch(() => undefined)
      } else if (status === 'under_review') {
        void notifyIfAllowed(
          current.owner_id,
          'nilai',
          'final_project_status',
          `Penilaian "${current.title}" dimulai`,
          'Mentor mulai menilai proyek akhirmu.',
          { project_id: current.id, status, reviewer_id: user?.id ?? null },
        ).catch(() => undefined)
      }
      return true
    } catch {
      setNotice('Gagal mengubah status proyek. Coba lagi.')
      return false
    }
  }

  // --- Tim ---------------------------------------------------------------
  async function handleAddMember(e: FormEvent) {
    e.preventDefault()
    if (!user || !inviteName.trim()) return
    const { data } = await supabase
      .from('public_profiles')
      .select('id,name')
      .ilike('name', inviteName.trim())
      .maybeSingle()
    const found = data as { id: string; name: string | null } | null
    if (!found) {
      setNotice('Tidak ditemukan anggota dengan nama itu. Periksa ejaannya.')
      return
    }
    if (found.id === current.owner_id || members.some((m) => m.user_id === found.id)) {
      setNotice('Anggota itu sudah ada di tim ini.')
      return
    }
    try {
      await addProjectMember(current.id, found.id, inviteRole.trim() || null)
      setNotice(`Anggota ${found.name ?? 'baru'} ditambahkan ke tim.`)
      setInviteName('')
      setInviteRole('')
      await refresh()
    } catch {
      setNotice('Gagal menambahkan anggota. Coba lagi.')
    }
  }

  async function handleSaveRole(member: FinalProjectMember) {
    try {
      await updateMemberRole(member.id, editingRole.trim() || null)
      setEditingMemberId(null)
      setNotice('Jobdesk diperbarui.')
      await refresh()
    } catch {
      setNotice('Gagal memperbarui jobdesk. Coba lagi.')
    }
  }

  async function handleRemoveMember(member: FinalProjectMember) {
    const self = member.user_id === user?.id
    if (!window.confirm(self ? 'Keluar dari tim proyek ini?' : `Hapus ${nameOf(member.user_id)} dari tim?`)) return
    try {
      await removeProjectMember(member.id)
      setNotice(self ? 'Kamu keluar dari tim proyek ini.' : 'Anggota dihapus dari tim.')
      await refresh()
    } catch {
      setNotice('Gagal menghapus anggota. Coba lagi.')
    }
  }

  // --- Tugas ---------------------------------------------------------------
  async function handleAddTask(e: FormEvent) {
    e.preventDefault()
    if (!taskTitle.trim()) return
    try {
      await createProjectTask({
        projectId: current.id,
        title: taskTitle.trim(),
        description: taskDesc.trim() || null,
        step: taskStep,
        assigneeId: taskAssignee || null,
        dueDate: taskDue || null,
      })
      setTaskTitle('')
      setTaskDesc('')
      setTaskDue('')
      setNotice('Tugas ditambahkan.')
      await refresh()
    } catch {
      setNotice('Gagal menambah tugas. Coba lagi.')
    }
  }

  async function handleTaskStatus(task: FinalProjectTask, status: FinalProjectTaskStatus) {
    try {
      await updateTaskStatus(task.id, status)
      setTasks(tasks.map((t) => (t.id === task.id ? { ...t, status } : t)))
    } catch {
      setNotice('Gagal mengubah status tugas. Coba lagi.')
    }
  }

  async function handleDeleteTask(task: FinalProjectTask) {
    if (!window.confirm(`Hapus tugas "${task.title}"?`)) return
    try {
      await deleteProjectTask(task.id)
      setTasks(tasks.filter((t) => t.id !== task.id))
    } catch {
      setNotice('Gagal menghapus tugas. Coba lagi.')
    }
  }

  // --- Berkas --------------------------------------------------------------
  async function handleUpload(e: FormEvent) {
    e.preventDefault()
    if (!user || !uploadFile) return
    const saved = await uploadProjectFile(current.id, uploadFile, uploadKind, user.id)
    if (!saved) {
      setNotice('Bucket project-files belum tersedia, file tidak bisa diunggah.')
      return
    }
    setUploadFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setNotice('Berkas diunggah.')
    await refresh()
  }

  async function handleDeleteFile(file: FinalProjectFile) {
    if (!window.confirm(`Hapus berkas "${file.file_name}"?`)) return
    try {
      await deleteProjectFile(file.id)
      setFiles(files.filter((f) => f.id !== file.id))
    } catch {
      setNotice('Gagal menghapus berkas. Coba lagi.')
    }
  }

  // --- Umpan balik ---------------------------------------------------------
  async function handleAddReview(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    const score = reviewScore.trim() === '' ? null : Math.max(0, Math.min(100, Number(reviewScore)))
    if (reviewScore.trim() !== '' && Number.isNaN(Number(reviewScore))) {
      setNotice('Skor harus berupa angka 0–100.')
      return
    }
    try {
      // Fase 2 — addProjectReview memakai upsert tanpa updated_at, jadi
      // dari baris hasil tidak bisa dibedakan review baru vs edit. Kirim
      // notifikasi hanya bila mentor ini BELUM pernah memberi review;
      // mengedit review yang sama bukan event baru.
      const hadReview = reviews.some((r) => r.reviewer_id === user.id)
      const saved = await addProjectReview({
        projectId: current.id,
        reviewerId: user.id,
        score,
        feedback: reviewFeedback.trim() || null,
      })
      setReviews([saved, ...reviews])
      if (!hadReview) {
        const feedbackText = (reviewFeedback.trim() || '').slice(0, 120)
        const parts: string[] = []
        if (feedbackText) parts.push(`"${nameOf(user.id)}": ${feedbackText}`)
        if (score !== null) parts.push(`Skor: ${score}.`)
        void notifyIfAllowed(
          current.owner_id,
          'nilai',
          'final_project_review',
          `Umpan balik baru untuk "${current.title}"`,
          parts.join(' ') || 'Mentor memberikan umpan balik baru.',
          { project_id: current.id, review_id: saved.id, reviewer_id: user.id },
        ).catch(() => undefined)
      }
      setReviewScore('')
      setReviewFeedback('')
      setNotice('Umpan balik dikirim.')
    } catch {
      setNotice('Gagal mengirim umpan balik. Coba lagi.')
    }
  }

  // --- Penilaian & publikasi ----------------------------------------------
  async function handleAssess(decision: 'approved' | 'revision' | 'rejected') {
    if (!user) return
    // B40: validasi angka yang sama seperti handleAddReview — tanpa ini
    // "abc" menjadi NaN, addProjectReview gagal, dan keputusan mentor
    // tidak pernah tersimpan.
    if (assessScore.trim() !== '' && Number.isNaN(Number(assessScore))) {
      setNotice('Skor harus berupa angka 0–100.')
      return
    }
    const score = assessScore.trim() === '' ? null : Math.max(0, Math.min(100, Number(assessScore)))
    try {
      if (score !== null || assessFeedback.trim()) {
        const saved = await addProjectReview({
          projectId: current.id,
          reviewerId: user.id,
          score,
          feedback: assessFeedback.trim() || null,
        })
        setReviews([saved, ...reviews])
      }
      const msg =
        decision === 'approved'
          ? 'Proyek disetujui mentor. Pemilik bisa mempublikasikan film ke Showcase.'
          : decision === 'revision'
            ? 'Proyek dikembalikan untuk revisi.'
            : 'Proyek ditolak.'
      // Fase 2 — SATU notifikasi status per penilaian (bukan dua:
      // review di alur ini tidak mengirim notifikasi terpisah). Hanya
      // bila status benar-benar berubah (changeStatus mengembalikan false
      // bila gagal).
      const ok = await changeStatus(decision, msg)
      if (ok) {
        const fb = assessFeedback.trim()
        const extra = `${fb ? ` Umpan balik: "${fb.slice(0, 120)}"` : ''}${score !== null ? ` Skor: ${score}.` : ''}`
        const [title, body] =
          decision === 'approved'
            ? [
                `Proyek akhir disetujui: "${current.title}"`,
                `Mentor menyetujui proyekmu.${extra} Kamu bisa mempublikasikan film ke Showcase.`,
              ]
            : decision === 'revision'
              ? [
                  `Proyek akhir perlu revisi: "${current.title}"`,
                  `Mentor mengembalikan proyekmu untuk revisi.${extra}`,
                ]
              : [
                  `Proyek akhir ditolak: "${current.title}"`,
                  `Mentor menolak proyek ini.${extra}`,
                ]
        void notifyIfAllowed(
          current.owner_id,
          'nilai',
          'final_project_status',
          title,
          body,
          { project_id: current.id, status: decision, reviewer_id: user.id },
        ).catch(() => undefined)
      }
      setAssessScore('')
      setAssessFeedback('')
    } catch {
      setNotice('Gagal menyimpan penilaian. Coba lagi.')
    }
  }

  async function handlePublish(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    if (!filmUrl.trim()) {
      setNotice('Isi URL film terlebih dahulu.')
      return
    }
    if (!posterFile) {
      setNotice('Unggah poster filmmu sendiri (gambar). Poster wajib diisi — poster harus poster film aslimu, bukan ilustrasi.')
      return
    }
    if (!posterFile.type.startsWith('image/')) {
      setNotice('Poster harus berupa gambar (JPG, PNG, atau WebP).')
      return
    }
    const posterUrl = await uploadToBucket(
      'film-posters',
      `${user.id}/${Date.now()}-${posterFile.name}`,
      posterFile,
    )
    if (!posterUrl) {
      setNotice('Poster belum terunggah: bucket film-posters belum tersedia. Film tidak dipublikasikan.')
      return
    }
    try {
      const { filmId } = await publishProjectToShowcase({
        project: current,
        filmUrl: filmUrl.trim(),
        posterUrl,
        description: filmDesc.trim() || null,
      })
      await logAudit('final_project.published', 'final_projects', current.id, { film_id: filmId })
      setProject({ ...current, status: 'published', film_id: filmId })
      setNotice('Film dikirim ke antrean penilaian admin Showcase. Setelah disetujui, film tampil di Showcase.')
    } catch {
      setNotice('Gagal mempublikasikan film. Coba lagi.')
    }
  }

  async function handleDeleteProject() {
    if (!window.confirm(`Hapus Final Project "${current.title}" beserta seluruh tugas, berkas, dan umpan baliknya? Tindakan ini tidak bisa dibatalkan.`)) return
    try {
      await deleteFinalProject(current.id)
      await logAudit('final_project.deleted', 'final_projects', current.id, { title: current.title })
      navigate('/proyek-akhir')
    } catch {
      setNotice('Gagal menghapus proyek. Coba lagi.')
    }
  }

  async function handleChangeMentor(e: FormEvent) {
    e.preventDefault()
    try {
      await setProjectMentor(current.id, mentorSelect || null)
      setProject({ ...current, mentor_id: mentorSelect || null })
      // Fase 2 — beri tahu mentor BARU yang ditunjuk; bila mentorSelect
      // kosong (mentor dilepas) tidak ada penerima → tidak ada notifikasi.
      if (mentorSelect) {
        void notifyIfAllowed(
          mentorSelect,
          'nilai',
          'mentor_assigned',
          `Kamu ditunjuk sebagai mentor proyek akhir "${current.title}"`,
          `Kamu menjadi mentor pendamping proyek "${current.title}". Buka proyek untuk melihat progresnya.`,
          { project_id: current.id, project_title: current.title, context: 'final_project' },
        ).catch(() => undefined)
      }
      setNotice('Mentor pendamping diperbarui.')
    } catch {
      setNotice('Gagal mengganti mentor. Coba lagi.')
    }
  }

  // --- Ringkasan -----------------------------------------------------------
  const doneTasks = tasks.filter((t) => t.status === 'done').length
  const assigneeOptions = [
    { id: current.owner_id, label: `${nameOf(current.owner_id)} (Pemilik)` },
    ...members.map((m) => ({ id: m.user_id, label: nameOf(m.user_id) })),
  ]

  return (
    <div className="page">
      <Link to="/proyek-akhir" className="back-link">← Semua Proyek Akhir</Link>
      <PageHeader
        icon="project"
        title={current.title}
        subtitle={`${FINAL_PROJECT_STATUS_LABEL[current.status]}${current.description ? ` · ${current.description}` : ''}`}
      />
      {notice && <p className="notice-box">{notice}</p>}

      <div className="action-grid" style={{ marginBottom: '1rem' }} role="tablist" aria-label="Bagian workspace">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`btn btn-small ${tab === t.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {(isOwner || isAdmin) && (
        <div className="form-actions" style={{ marginBottom: '1rem' }}>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => void handleDeleteProject()}>
            Hapus Proyek
          </button>
        </div>
      )}

      {tab === 'ringkasan' && (
        <section className="section">
          <h2>Ringkasan</h2>
          <p><strong>Status:</strong> {FINAL_PROJECT_STATUS_LABEL[current.status]}</p>
          <p><strong>Pemilik:</strong> {nameOf(current.owner_id)}</p>
          <p><strong>Mentor pendamping:</strong> {current.mentor_id ? nameOf(current.mentor_id) : 'Belum ada mentor'}</p>
          {current.description ? <p>{current.description}</p> : null}
          <p><strong>Progres keseluruhan:</strong> {tasks.length === 0 ? 'Belum ada tugas.' : `${doneTasks}/${tasks.length} tugas selesai.`}</p>
          {current.film_id ? (
            <p><Link to={`/showcase/${current.film_id}`}>Lihat film di Showcase</Link></p>
          ) : null}
          <h3>10 Langkah Produksi</h3>
          <ul>
            {FINAL_PROJECT_STEPS.map((s) => {
              const stepTasks = tasks.filter((t) => t.step === s.step)
              const stepDone = stepTasks.filter((t) => t.status === 'done').length
              return (
                <li key={s.step}>
                  <strong>Langkah {s.step}: {s.title}</strong> — {s.hint}
                  <br />
                  <span className="muted">
                    {stepTasks.length === 0 ? 'Belum ada tugas' : `${stepDone}/${stepTasks.length} tugas selesai`}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {tab === 'tim' && (
        <section className="section">
          <h2>Tim ({members.length + 1})</h2>
          <p className="muted">Tim boleh lintas sekolah — undang siapa saja dari SINEVERSE, apa pun sekolahnya.</p>
          <ul>
            <li>
              {nameOf(current.owner_id)} <span className="muted">— Pemilik</span>
            </li>
            {members.map((m) => (
              <li key={m.id}>
                {nameOf(m.user_id)}{m.role ? ` — ${m.role}` : ''}
                {canEdit && (
                  <>
                    {' '}
                    {editingMemberId === m.id ? (
                      <>
                        <input
                          value={editingRole}
                          onChange={(e) => setEditingRole(e.target.value)}
                          placeholder="Jobdesk, mis. Sutradara"
                          aria-label="Jobdesk anggota"
                        />{' '}
                        <button type="button" className="btn btn-primary btn-small" onClick={() => void handleSaveRole(m)}>Simpan</button>{' '}
                        <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditingMemberId(null)}>Batal</button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={() => {
                          setEditingMemberId(m.id)
                          setEditingRole(m.role ?? '')
                        }}
                      >
                        Ubah jobdesk
                      </button>
                    )}{' '}
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => void handleRemoveMember(m)}>
                      {m.user_id === user?.id ? 'Keluar dari tim' : 'Hapus'}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {canEdit && (
            <form className="form" onSubmit={handleAddMember}>
              <h3>Tambah Anggota</h3>
              <label>
                Nama anggota (cari berdasarkan nama)
                <input
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  required
                  placeholder="Ketik nama anggota…"
                  autoComplete="off"
                />
              </label>
              <label>
                Jobdesk
                <input
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  placeholder="Mis. Sutradara, DOP, Editor, Penulis Skenario, Sound Designer"
                />
              </label>
              <button type="submit" className="btn btn-primary">Tambah ke Tim</button>
            </form>
          )}
          {(isOwner || isAdmin) && (
            <form className="form" onSubmit={handleChangeMentor}>
              <h3>Mentor Pendamping</h3>
              <label>
                Ganti mentor
                <select
                  value={mentorSelect}
                  onChange={(e) => setMentorSelect(e.target.value)}
                  style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
                >
                  <option value="">Belum ada mentor</option>
                  {mentors.map((m) => (
                    <option key={m.id} value={m.id}>{m.name ?? 'Mentor'}</option>
                  ))}
                </select>
              </label>
              <button type="submit" className="btn btn-primary btn-small">Simpan Mentor</button>
            </form>
          )}
        </section>
      )}

      {tab === 'tugas' && (
        <section className="section">
          <h2>Tugas ({tasks.length})</h2>
          {tasks.length === 0 ? (
            <p className="empty">Belum ada tugas. Buat tugas pertama untuk langkah 1.</p>
          ) : (
            FINAL_PROJECT_STEPS.map((s) => {
              const stepTasks = tasks.filter((t) => t.step === s.step)
              if (stepTasks.length === 0) return null
              return (
                <div key={s.step}>
                  <h3>Langkah {s.step}: {s.title}</h3>
                  <div className="grade-table-wrap">
                    <table className="grade-table">
                      <thead>
                        <tr><th>Tugas</th><th>Status</th><th>Penanggung jawab</th><th>Tenggat</th>{canEdit ? <th /> : null}</tr>
                      </thead>
                      <tbody>
                        {stepTasks.map((t) => (
                          <tr key={t.id}>
                            <td>
                              <strong>{t.title}</strong>
                              {t.description ? <div className="muted">{t.description}</div> : null}
                            </td>
                            <td>
                              {canEdit ? (
                                <select
                                  value={t.status}
                                  onChange={(e) => void handleTaskStatus(t, e.target.value as FinalProjectTaskStatus)}
                                  aria-label={`Status tugas ${t.title}`}
                                  style={{ fontFamily: 'inherit', padding: '0.4rem 0.5rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
                                >
                                  {(Object.keys(TASK_STATUS_LABEL) as FinalProjectTaskStatus[]).map((st) => (
                                    <option key={st} value={st}>{TASK_STATUS_LABEL[st]}</option>
                                  ))}
                                </select>
                              ) : (
                                TASK_STATUS_LABEL[t.status]
                              )}
                            </td>
                            <td>{nameOf(t.assignee_id)}</td>
                            <td>{t.due_date ? fmtDateOnly(t.due_date) : '—'}</td>
                            {canEdit ? (
                              <td>
                                <button type="button" className="btn btn-ghost btn-small" onClick={() => void handleDeleteTask(t)}>Hapus</button>
                              </td>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })
          )}
          {canEdit && (
            <form className="form" onSubmit={handleAddTask}>
              <h3>Tugas Baru</h3>
              <label>
                Judul tugas
                <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} required placeholder="Mis. Tulis naskah adegan 1" />
              </label>
              <label>
                Deskripsi
                <textarea value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} rows={2} />
              </label>
              <label>
                Langkah
                <select
                  value={taskStep}
                  onChange={(e) => setTaskStep(Number(e.target.value))}
                  style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
                >
                  {FINAL_PROJECT_STEPS.map((s) => (
                    <option key={s.step} value={s.step}>Langkah {s.step}: {s.title}</option>
                  ))}
                </select>
              </label>
              <label>
                Penanggung jawab
                <select
                  value={taskAssignee}
                  onChange={(e) => setTaskAssignee(e.target.value)}
                  style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
                >
                  <option value="">Belum ditentukan</option>
                  {assigneeOptions.map((a) => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Tenggat (opsional)
                <input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
              </label>
              <button type="submit" className="btn btn-primary">Tambah Tugas</button>
            </form>
          )}
        </section>
      )}

      {tab === 'berkas' && (
        <section className="section">
          <h2>Berkas ({files.length})</h2>
          <p className="muted">
            Skenario untuk langkah 2, storyboard untuk langkah 3, shot list dan jadwal produksi untuk langkah 6.
          </p>
          {files.length === 0 ? (
            <p className="empty">Belum ada berkas.</p>
          ) : (
            <ul>
              {files.map((f) => {
                const url = supabase.storage.from('project-files').getPublicUrl(f.file_path).data.publicUrl
                return (
                  <li key={f.id}>
                    <a href={url} target="_blank" rel="noreferrer">{f.file_name}</a>
                    {' · '}{FILE_KIND_LABEL[f.kind]}
                    {' · '}{nameOf(f.uploaded_by)}
                    {' · '}{fmtDate(f.uploaded_at)}
                    {f.file_size ? ` · ${fmtSize(f.file_size)}` : ''}
                    {canEdit ? (
                      <>
                        {' '}
                        <button type="button" className="btn btn-ghost btn-small" onClick={() => void handleDeleteFile(f)}>Hapus</button>
                      </>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
          {canEdit && (
            <form className="form" onSubmit={handleUpload}>
              <h3>Unggah Berkas</h3>
              <label>
                Jenis berkas
                <select
                  value={uploadKind}
                  onChange={(e) => setUploadKind(e.target.value as FinalProjectFileKind)}
                  style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
                >
                  {(Object.keys(FILE_KIND_LABEL) as FinalProjectFileKind[]).map((k) => (
                    <option key={k} value={k}>{FILE_KIND_LABEL[k]}</option>
                  ))}
                </select>
              </label>
              <label>
                File
                <input ref={fileInputRef} type="file" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} required />
              </label>
              <button type="submit" className="btn btn-primary">Unggah Berkas</button>
            </form>
          )}
        </section>
      )}

      {tab === 'umpan-balik' && (
        <section className="section">
          <h2>Umpan Balik Mentor</h2>
          {reviews.length === 0 ? (
            <p className="empty">Belum ada umpan balik mentor.</p>
          ) : (
            <ul className="discussion-list">
              {reviews.map((r) => (
                <li key={r.id} className="discussion-item">
                  <p className="discussion-meta">
                    {nameOf(r.reviewer_id)} · {fmtDate(r.created_at)}
                    {r.score !== null ? ` · Skor: ${r.score}` : ''}
                  </p>
                  {r.feedback ? <p>{r.feedback}</p> : <p className="muted">Tanpa catatan.</p>}
                </li>
              ))}
            </ul>
          )}
          {canReview && (
            <form className="form" onSubmit={handleAddReview}>
              <h3>Beri Umpan Balik</h3>
              <p className="muted">Ini umpan balik biasa. Penilaian resmi (setujui / minta revisi / tolak) ada di tab Penilaian &amp; Publikasi.</p>
              <label>
                Skor (opsional, 0–100)
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={reviewScore}
                  onChange={(e) => setReviewScore(e.target.value)}
                  placeholder="Mis. 85"
                />
              </label>
              <label>
                Umpan balik
                <textarea value={reviewFeedback} onChange={(e) => setReviewFeedback(e.target.value)} rows={3} placeholder="Catatan untuk tim…" />
              </label>
              <button type="submit" className="btn btn-primary">Kirim Umpan Balik</button>
            </form>
          )}
        </section>
      )}

      {tab === 'penilaian' && (
        <section className="section">
          <h2>Penilaian &amp; Publikasi</h2>
          <p><strong>Status saat ini:</strong> {FINAL_PROJECT_STATUS_LABEL[current.status]}</p>

          {(current.status === 'draft' || current.status === 'in_progress' || current.status === 'revision') && canEdit && (
            <div className="form-actions" style={{ marginBottom: '1rem' }}>
              {current.status === 'draft' && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => void changeStatus('in_progress', 'Proyek mulai dikerjakan.')}
                >
                  Mulai mengerjakan
                </button>
              )}
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void changeStatus('submitted', 'Film dikirim untuk dinilai mentor.')}
              >
                Kirim untuk dinilai
              </button>
            </div>
          )}

          {current.status === 'submitted' && canReview && (
            <div className="form-actions" style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void changeStatus('under_review', 'Penilaian dimulai.')}
              >
                Mulai menilai
              </button>
            </div>
          )}

          {current.status === 'under_review' && canReview && (
            <form className="form" onSubmit={(e) => e.preventDefault()}>
              <h3>Penilaian Mentor</h3>
              <label>
                Skor (opsional, 0–100)
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={assessScore}
                  onChange={(e) => setAssessScore(e.target.value)}
                  placeholder="Mis. 85"
                />
              </label>
              <label>
                Umpan balik penilaian
                <textarea value={assessFeedback} onChange={(e) => setAssessFeedback(e.target.value)} rows={3} placeholder="Catatan penilaian…" />
              </label>
              <div className="action-grid">
                <button type="button" className="btn btn-primary" onClick={() => void handleAssess('approved')}>Setujui</button>
                <button type="button" className="btn btn-ghost" onClick={() => void handleAssess('revision')}>Minta revisi</button>
                <button type="button" className="btn btn-ghost" onClick={() => void handleAssess('rejected')}>Tolak</button>
              </div>
            </form>
          )}

          {current.status === 'approved' && (isOwner || isMentor || isAdmin) && (
            <form className="form" onSubmit={handlePublish}>
              <h3>Publikasikan ke Showcase</h3>
              <label>
                URL film (wajib)
                <input
                  value={filmUrl}
                  onChange={(e) => setFilmUrl(e.target.value)}
                  required
                  placeholder="Link YouTube, Drive, atau lainnya"
                />
              </label>
              <label>
                Deskripsi film
                <textarea value={filmDesc} onChange={(e) => setFilmDesc(e.target.value)} rows={3} />
              </label>
              <label>
                Poster film (wajib)
                <input
                  ref={posterInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPosterFile(e.target.files?.[0] ?? null)}
                  required
                />
              </label>
              <p className="muted">
                Poster harus poster film aslimu sendiri — bukan ilustrasi dan bukan gambar orang lain. Film tanpa poster tidak bisa dipublikasikan.
              </p>
              <button type="submit" className="btn btn-primary">Publikasikan ke Showcase</button>
            </form>
          )}

          {current.status === 'published' && (
            <p className="notice-box">
              Film dikirim ke antrean penilaian admin Showcase. Setelah disetujui, film tampil di Showcase.
              {current.film_id ? (
                <>
                  {' '}
                  <Link to={`/showcase/${current.film_id}`}>Lihat film</Link>
                </>
              ) : null}
            </p>
          )}

          {current.status === 'rejected' && (
            <p className="notice-box">Proyek ini ditolak mentor. Perbaiki berdasarkan umpan balik, lalu kirim lagi untuk dinilai.</p>
          )}
          {current.status === 'revision' && (
            <p className="notice-box">Mentor meminta revisi. Lihat umpan balik di tab Umpan Balik, perbaiki, lalu kirim lagi untuk dinilai.</p>
          )}
          {!canReview && (current.status === 'submitted' || current.status === 'under_review') && (
            <p className="muted">Proyek sedang dinilai mentor. Hasil penilaian muncul di tab Umpan Balik.</p>
          )}
        </section>
      )}
    </div>
  )
}
