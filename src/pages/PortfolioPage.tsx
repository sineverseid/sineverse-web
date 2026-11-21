// SINEVERSE — Portofolio (006).
// Item portofolio punya visibilitas public / members / community / private.
// ATURAN PRIVASI: pembelajaran yang sedang berjalan (in-progress) dan
// daftar sertifikat HANYA terlihat oleh pemilik portofolio dan admin —
// pengunjung lain tidak pernah melihat bagian itu, apa pun visibilitasnya.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { isMissingTableError } from '../lib/guarded'
import { fetchCourses, fetchEnrollments, fetchLessonProgress, fetchMyCertificates, fetchPublicProfile, supabase } from '../lib/supabase'
import type { Certificate, PortfolioItem } from '../lib/types'

const KINDS = [
  { value: 'work', label: 'Karya' },
  { value: 'role', label: 'Peran' },
  { value: 'skill', label: 'Skill' },
  { value: 'course', label: 'Course' },
  { value: 'certificate', label: 'Sertifikat' },
  { value: 'achievement', label: 'Prestasi' },
] as const

export default function PortfolioPage() {
  const { userId } = useParams<{ userId?: string }>()
  const { user, profile } = useAuth()
  const ownerId = userId ?? user?.id ?? null
  const isOwner = !!user && ownerId === user.id
  const isAdmin = profile?.role === 'admin'
  const canSeePrivate = isOwner || isAdmin

  const [owner, setOwner] = useState<{ name: string | null; photo_url: string | null } | null>(null)
  const [items, setItems] = useState<PortfolioItem[] | null>(null)
  const [inProgress, setInProgress] = useState<string[]>([])
  const [certs, setCerts] = useState<Certificate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [kind, setKind] = useState<PortfolioItem['kind']>('work')
  const [visibility, setVisibility] = useState<PortfolioItem['visibility']>('members')

  useEffect(() => {
    if (!ownerId) return
    const targetId = ownerId
    let cancelled = false
    async function load() {
      try {
        const prof = await fetchPublicProfile(targetId)
        if (!cancelled) setOwner(prof ? { name: prof.name, photo_url: prof.photo_url } : null)
        const { data, error: qErr } = await supabase
          .from('portfolio_items')
          .select('*')
          .eq('user_id', targetId)
          .order('created_at', { ascending: false })
        if (qErr) {
          if (isMissingTableError(qErr)) {
            if (!cancelled) setItems(null)
            return
          }
          throw qErr
        }
        if (cancelled) return
        // Visibilitas ditegakkan di UI sesuai peran pengunjung (RLS juga
        // membatasi di server; private tidak pernah tampil untuk orang lain).
        const rows = (data ?? []) as PortfolioItem[]
        const visible = rows.filter((it) => {
          if (canSeePrivate) return true
          if (it.visibility === 'public') return true
          if (it.visibility === 'members' && user) return true
          return false
        })
        setItems(visible)
        if (canSeePrivate) {
          const [progress, courses, enrollments] = await Promise.all([
            fetchLessonProgress(targetId),
            fetchCourses(),
            fetchEnrollments(targetId),
          ])
          if (cancelled) return
          const inProgCourseIds = new Set<string>()
          // lesson_progress tidak menyimpan course_id; tandai course yang
          // diambil dan masih punya lesson berstatus in_progress lewat
          // daftar enrollment + progress yang belum selesai.
          const inProgressLessonIds = new Set(progress.filter((p) => p.status === 'in_progress').map((p) => p.lesson_id))
          if (inProgressLessonIds.size > 0) {
            const byId = new Map(courses.map((c) => [c.id, c]))
            for (const e of enrollments) {
              const c = byId.get(e.course_id)
              if (c) inProgCourseIds.add(c.title)
            }
          }
          setInProgress([...inProgCourseIds])
          const myCerts = await fetchMyCertificates(targetId)
          if (!cancelled) setCerts(myCerts)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat portofolio.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, user?.id])

  if (!ownerId) return <div className="page"><p className="empty">Masuk untuk melihat portofoliomu.</p><Link to="/login">Masuk</Link></div>
  if (loading) return <div className="page"><p className="muted">Memuat portofolio…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (items === null) return <div className="page"><h1>Portofolio</h1><MigrationNotice migration="006" /></div>

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!user || !title.trim()) return
    const { error: insErr } = await supabase.from('portfolio_items').insert({
      user_id: user.id,
      kind,
      title: title.trim(),
      description: desc.trim() || null,
      visibility,
    })
    if (insErr) setNotice(insErr.message)
    else {
      setNotice('Item portofolio ditambahkan.')
      setTitle('')
      setDesc('')
      const { data } = await supabase.from('portfolio_items').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      setItems((data ?? []) as PortfolioItem[])
    }
  }

  return (
    <div className="page">
      <h1>Portofolio {isOwner ? 'Saya' : owner?.name ?? ''}</h1>
      {owner?.photo_url && <img src={owner.photo_url} alt="Foto profil" className="avatar" />}
      {notice && <p className="notice-box">{notice}</p>}

      {canSeePrivate && (
        <>
          <section className="section">
            <h2>Pembelajaran Berjalan</h2>
            <p className="muted">Bagian ini hanya terlihat oleh pemilik portofolio dan admin.</p>
            {inProgress.length === 0 ? (
              <p className="empty">Tidak ada pembelajaran yang sedang berjalan.</p>
            ) : (
              <ul>{inProgress.map((t) => <li key={t}>{t}</li>)}</ul>
            )}
          </section>
          <section className="section">
            <h2>Sertifikat Saya</h2>
            <p className="muted">Bagian ini hanya terlihat oleh pemilik portofolio dan admin.</p>
            {certs.length === 0 ? (
              <p className="empty">Belum ada sertifikat.</p>
            ) : (
              <ul>
                {certs.map((c) => (
                  <li key={c.id}>{c.serial} — {c.type} · Nilai: {c.score ?? '—'}</li>
                ))}
              </ul>
            )}
            <p><Link to="/sertifikat">Buka halaman Sertifikat Saya →</Link></p>
          </section>
        </>
      )}

      <section className="section">
        <h2>Item Portofolio</h2>
        {items.length === 0 ? (
          <p className="empty">Belum ada item portofolio yang bisa kamu lihat.</p>
        ) : (
          <ul className="discussion-list">
            {items.map((it) => (
              <li key={it.id} className="discussion-item">
                <p className="discussion-meta">
                  {KINDS.find((k) => k.value === it.kind)?.label ?? it.kind} · {it.visibility}
                </p>
                <h3>{it.title}</h3>
                {it.description && <p>{it.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isOwner && (
        <section className="section">
          <h2>Tambah Item Portofolio</h2>
          <form className="form" onSubmit={handleAdd}>
            <label>
              Judul
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>
            <label>
              Jenis
              <select value={kind} onChange={(e) => setKind(e.target.value as PortfolioItem['kind'])} style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}>
                {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </label>
            <label>
              Deskripsi
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
            </label>
            <label>
              Visibilitas
              <select value={visibility} onChange={(e) => setVisibility(e.target.value as PortfolioItem['visibility'])} style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}>
                <option value="public">Publik — semua orang</option>
                <option value="members">Anggota — pengguna yang masuk</option>
                <option value="community">Komunitas — anggota komunitasku</option>
                <option value="private">Privat — hanya saya (dan admin)</option>
              </select>
            </label>
            <button type="submit" className="btn btn-primary">Tambah Item</button>
          </form>
        </section>
      )}
    </div>
  )
}
