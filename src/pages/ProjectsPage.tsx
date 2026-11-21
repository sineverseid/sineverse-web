// SINEVERSE, Proyek: daftar + buat proyek dari nol atau dari template
// sistem (005). Mode akses: terbuka / persetujuan / undangan saja.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { isMissingTableError } from '../lib/guarded'
import { fetchProfileNames, supabase } from '../lib/supabase'
import type { Project, ProjectAccessMode, ProjectTemplate } from '../lib/types'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

const STATUS_LABEL: Record<string, string> = {
  active: 'Aktif',
  draft: 'Draf',
  completed: 'Selesai',
  archived: 'Diarsipkan',
  paused: 'Dijeda',
  cancelled: 'Dibatalkan',
}

export default function ProjectsPage() {
  const { user, profile } = useAuth()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [templates, setTemplates] = useState<ProjectTemplate[]>([])
  const [templatesFailed, setTemplatesFailed] = useState(false)
  const [memberCounts, setMemberCounts] = useState<Map<string, number>>(new Map())
  const [ownerNames, setOwnerNames] = useState<Map<string, string>>(new Map())
  const [myProjectIds, setMyProjectIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [mode, setMode] = useState<ProjectAccessMode>('open')
  const [template, setTemplate] = useState('')

  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data, error: qErr } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
        if (qErr) {
          if (isMissingTableError(qErr)) {
            if (!cancelled) setProjects(null)
            return
          }
          throw qErr
        }
        if (cancelled) return
        const list = (data ?? []) as Project[]
        setProjects(list)
        // Nama pemilik, jumlah anggota, dan template tidak saling
        // bergantung: jalankan paralel. fetchProfileNames hanya butuh
        // daftar proyek yang sudah ada, bukan hasil query anggota.
        const [memRes, ownerNamesRes, tRes] = await Promise.all([
          supabase.from('project_members').select('project_id,user_id'),
          fetchProfileNames(list.map((p) => p.owner_id)),
          supabase.from('project_templates').select('*').eq('is_system', true).order('title'),
        ])
        if (cancelled) return
        const memData = memRes.data
        const counts = new Map<string, number>()
        for (const m of (memData ?? []) as { project_id: string; user_id: string }[]) {
          counts.set(m.project_id, (counts.get(m.project_id) ?? 0) + 1)
        }
        if (!cancelled) setMemberCounts(counts)
        if (!cancelled) setOwnerNames(ownerNamesRes)
        // Proyek yang bisa dilihat penuh oleh pengguna saat ini.
        if (user) {
          const mine = new Set<string>()
          for (const m of (memData ?? []) as { project_id: string; user_id: string }[]) {
            if (m.user_id === user.id) mine.add(m.project_id)
          }
          if (!cancelled) setMyProjectIds(mine)
        }
        if (tRes.error) {
          if (!cancelled) setTemplatesFailed(true)
        } else if (!cancelled) {
          setTemplates((tRes.data ?? []) as ProjectTemplate[])
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
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!user || !title.trim()) return
    const { data, error: insErr } = await supabase
      .from('projects')
      .insert({
        title: title.trim(),
        description: desc.trim() || null,
        owner_id: user.id,
        access_mode: mode,
        template: template || null,
        status: 'active',
      })
      .select()
      .single()
    if (insErr) {
      setNotice('Gagal membuat proyek. Coba lagi.')
      return
    }
    // Pemilik otomatis menjadi anggota proyek.
    await supabase.from('project_members').insert({
      project_id: (data as Project).id,
      user_id: user.id,
      role: 'owner',
      permissions: { manage: true },
    })
    setNotice('Proyek dibuat.')
    setTitle('')
    setDesc('')
    setMode('open')
    setTemplate('')
    const [freshRes, memRes] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('project_members').select('project_id,user_id'),
    ])
    const list = (freshRes.data ?? []) as Project[]
    setProjects(list)
    const memData = memRes.data
    const counts = new Map<string, number>()
    const mine = new Set<string>()
    for (const m of (memData ?? []) as { project_id: string; user_id: string }[]) {
      counts.set(m.project_id, (counts.get(m.project_id) ?? 0) + 1)
      if (user && m.user_id === user.id) mine.add(m.project_id)
    }
    setMemberCounts(counts)
    setMyProjectIds(mine)
    setOwnerNames(await fetchProfileNames(list.map((p) => p.owner_id)))
  }

  if (loading) return <div className="page"><p className="muted">Memuat proyek…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (projects === null) return <div className="page"><h1>Proyek</h1><MigrationNotice migration="005" /></div>

  const modeLabel: Record<ProjectAccessMode, string> = {
    open: 'Terbuka',
    approval: 'Butuh persetujuan',
    invite_only: 'Undangan saja',
  }
  const templateTitle = (slug: string | null): string | null => {
    if (!slug) return null
    const found = templates.find((t) => t.slug === slug)
    return found ? found.title : '—'
  }

  return (
    <div className="page">
      <PageHeader
        icon="project"
        title="Projects"
        subtitle="Buat film bareng kru dari berbagai sekolah."
      />
      {notice && <p className="notice-box">{notice}</p>}
      {projects.length === 0 ? (
        <EmptyState message="Belum ada proyek." />
      ) : (
        <ul className="course-list">
          {projects.map((p) => {
            const canSee = p.access_mode !== 'invite_only' || isAdmin || p.owner_id === user?.id || myProjectIds.has(p.id)
            if (!canSee) {
              // Proyek undangan saja: judul dan deskripsi tidak boleh bocor.
              return (
                <li key={p.id} className="course-card">
                  <div style={{ padding: '1.1rem 1.25rem' }}>
                    <h3>Proyek undangan saja</h3>
                    <p className="muted">Proyek ini hanya bisa diikuti lewat undangan.</p>
                  </div>
                </li>
              )
            }
            const tpl = templateTitle(p.template)
            return (
              <li key={p.id} className="course-card">
                <Link to={`/proyek/${p.id}`}>
                  <h3>{p.title}</h3>
                  <p>{p.description ?? ''}</p>
                  <p className="muted">
                    Pemilik: {ownerNames.get(p.owner_id) ?? 'Anggota'} · {memberCounts.get(p.id) ?? 0} anggota
                  </p>
                  <p className="muted">
                    {modeLabel[p.access_mode]}
                    {tpl ? ` · Template: ${tpl}` : ''} · {STATUS_LABEL[p.status] ?? p.status}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {user && (
        <section className="section">
          <h2>Buat Proyek Baru</h2>
          <form className="form" onSubmit={handleCreate}>
            <label>
              Judul proyek
              <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Mis. Film pendek: Pulang" />
            </label>
            <label>
              Deskripsi
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
            </label>
            <label>
              Template sistem (opsional)
              <select value={template} onChange={(e) => setTemplate(e.target.value)} style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}>
                <option value="">— Dari nol —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.slug}>{t.title}</option>
                ))}
              </select>
            </label>
            {templatesFailed ? (
              <p className="muted">Template gagal dimuat.</p>
            ) : (
              templates.length === 0 && <p className="muted">Belum ada template sistem di database (seed 4 template ada di migrasi 005).</p>
            )}
            <label>
              Mode akses
              <select value={mode} onChange={(e) => setMode(e.target.value as ProjectAccessMode)} style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}>
                <option value="open">Terbuka, siapa saja bisa gabung</option>
                <option value="approval">Persetujuan, pemilik menyetujui permintaan gabung</option>
                <option value="invite_only">Undangan saja</option>
              </select>
            </label>
            <button type="submit" className="btn btn-primary">Buat Proyek</button>
          </form>
          <p><Link to="/kru">Cari kru di Crew Finder →</Link></p>
        </section>
      )}
    </div>
  )
}
