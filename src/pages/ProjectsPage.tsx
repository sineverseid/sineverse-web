// SINEVERSE — Proyek: daftar + buat proyek dari nol atau dari template
// sistem (005). Mode akses: terbuka / persetujuan / undangan saja.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { isMissingTableError } from '../lib/guarded'
import { supabase } from '../lib/supabase'
import type { Project, ProjectAccessMode, ProjectTemplate } from '../lib/types'

export default function ProjectsPage() {
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [templates, setTemplates] = useState<ProjectTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [mode, setMode] = useState<ProjectAccessMode>('open')
  const [template, setTemplate] = useState('')

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
        setProjects((data ?? []) as Project[])
        const { data: tData } = await supabase.from('project_templates').select('*').eq('is_system', true).order('title')
        if (!cancelled) setTemplates((tData ?? []) as ProjectTemplate[])
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
      setNotice(insErr.message)
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
    const { data: fresh } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
    setProjects((fresh ?? []) as Project[])
  }

  if (loading) return <div className="page"><p className="muted">Memuat proyek…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (projects === null) return <div className="page"><h1>Proyek</h1><MigrationNotice migration="005" /></div>

  const modeLabel: Record<ProjectAccessMode, string> = {
    open: 'Terbuka',
    approval: 'Butuh persetujuan',
    invite_only: 'Undangan saja',
  }

  return (
    <div className="page">
      <h1>Proyek</h1>
      <p className="muted">Buat film bareng kru dari berbagai sekolah.</p>
      {notice && <p className="notice-box">{notice}</p>}
      {projects.length === 0 ? (
        <p className="empty">Belum ada proyek.</p>
      ) : (
        <ul className="course-list">
          {projects.map((p) => (
            <li key={p.id} className="course-card">
              <Link to={`/proyek/${p.id}`}>
                <h3>{p.title}</h3>
                <p>{p.description ?? ''}</p>
                <p className="muted">
                  {modeLabel[p.access_mode]}
                  {p.template ? ` · Template: ${p.template}` : ''} · {p.status}
                </p>
              </Link>
            </li>
          ))}
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
            {templates.length === 0 && <p className="muted">Belum ada template sistem di database (seed 4 template ada di migrasi 005).</p>}
            <label>
              Mode akses
              <select value={mode} onChange={(e) => setMode(e.target.value as ProjectAccessMode)} style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}>
                <option value="open">Terbuka — siapa saja bisa gabung</option>
                <option value="approval">Persetujuan — pemilik menyetujui permintaan gabung</option>
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
