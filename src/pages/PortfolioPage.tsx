// SINEVERSE, Portofolio (006).
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
import PageHeader from '../components/PageHeader'

const KINDS = [
  { value: 'work', label: 'Karya' },
  { value: 'role', label: 'Peran' },
  { value: 'skill', label: 'Skill' },
  { value: 'course', label: 'Course' },
  { value: 'certificate', label: 'Sertifikat' },
  { value: 'achievement', label: 'Prestasi' },
] as const

const VISIBILITY_LABELS: Record<string, string> = {
  public: 'Publik',
  members: 'Anggota',
  community: 'Komunitas',
  private: 'Privat',
}

export default function PortfolioPage() {
  const { userId } = useParams<{ userId?: string }>()
  const { user, profile } = useAuth()
  const ownerId = userId ?? user?.id ?? null
  const isOwner = !!user && ownerId === user.id
  const isAdmin = profile?.role === 'admin'
  const canSeePrivate = isOwner || isAdmin

  const [owner, setOwner] = useState<{ name: string | null; photo_url: string | null; role: string | null } | null>(null)
  const [ownerFound, setOwnerFound] = useState<boolean | null>(null)
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
        // Profil publik dan item portofolio tidak saling bergantung:
        // jalankan paralel. Bila profil tidak ditemukan, hasil item
        // dibuang dan tampil tetap seperti semula (daftar kosong).
        const [prof, itemsRes] = await Promise.all([
          fetchPublicProfile(targetId),
          supabase
            .from('portfolio_items')
            .select('*')
            .eq('user_id', targetId)
            .order('created_at', { ascending: false }),
        ])
        if (!cancelled) {
          setOwner(prof ? { name: prof.name, photo_url: prof.photo_url, role: prof.role ?? null } : null)
          setOwnerFound(prof !== null)
        }
        if (!prof) {
          if (!cancelled) setItems([])
          return
        }
        const { data, error: qErr } = itemsRes
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
        // Item 'community' tampil bila pengunjung adalah anggota salah satu
        // komunitas milik pemilik portofolio.
        let sharesCommunity = false
        if (!canSeePrivate && user && user.id !== targetId) {
          const [{ data: owned }, { data: ownerMems }] = await Promise.all([
            supabase.from('communities').select('id').eq('created_by', targetId),
            supabase.from('community_members').select('community_id').eq('user_id', targetId),
          ])
          const ownerCommunityIds = new Set<string>([
            ...(((owned ?? []) as { id: string }[]).map((c) => c.id)),
            ...(((ownerMems ?? []) as { community_id: string }[]).map((m) => m.community_id)),
          ])
          if (ownerCommunityIds.size > 0) {
            const { data: myMems } = await supabase
              .from('community_members')
              .select('community_id')
              .eq('user_id', user.id)
              .in('community_id', [...ownerCommunityIds])
            sharesCommunity = ((myMems ?? []) as { community_id: string }[]).length > 0
          }
        }
        const rows = (data ?? []) as PortfolioItem[]
        const visible = rows.filter((it) => {
          if (canSeePrivate) return true
          if (it.visibility === 'public') return true
          if (it.visibility === 'members' && user) return true
          if (it.visibility === 'community' && sharesCommunity) return true
          return false
        })
        setItems(visible)
        if (canSeePrivate) {
          // Sertifikat hanya butuh id pemilik, bukan hasil batch lain:
          // ikut paralel dalam batch yang sama, bukan await sesudahnya.
          const [progress, courses, enrollments, mods, less, myCerts] = await Promise.all([
            fetchLessonProgress(targetId),
            fetchCourses(),
            fetchEnrollments(targetId),
            supabase.from('modules').select('id,course_id'),
            supabase.from('lessons').select('id,module_id'),
            fetchMyCertificates(targetId),
          ])
          if (cancelled) return
          // Petakan tiap lesson ke course-nya lewat module, lalu hanya
          // course yang benar-benar berisi lesson in_progress yang tampil.
          const moduleCourse = new Map(
            ((mods.data ?? []) as { id: string; course_id: string }[]).map((m) => [m.id, m.course_id]),
          )
          const lessonCourse = new Map(
            ((less.data ?? []) as { id: string; module_id: string }[]).map((l) => [
              l.id,
              moduleCourse.get(l.module_id) ?? '',
            ]),
          )
          const inProgCourseIds = new Set<string>()
          for (const p of progress) {
            if (p.status !== 'in_progress') continue
            const cid = lessonCourse.get(p.lesson_id)
            if (cid) inProgCourseIds.add(cid)
          }
          const byId = new Map(courses.map((c) => [c.id, c]))
          const enrolledIds = new Set(enrollments.map((e) => e.course_id))
          const titles = [...inProgCourseIds]
            .filter((cid) => enrolledIds.has(cid))
            .map((cid) => byId.get(cid)?.title)
            .filter((t): t is string => !!t)
          setInProgress(titles)
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
  }, [ownerId, user?.id, profile?.role])

  if (!ownerId) return <div className="page"><p className="empty">Masuk untuk melihat portofoliomu.</p><Link to="/login">Masuk</Link></div>
  if (loading) return <div className="page"><p className="muted">Memuat portofolio…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (ownerFound === false) return <div className="page"><p className="empty">Pengguna tidak ditemukan.</p><Link to="/">Kembali ke Beranda</Link></div>
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
      <PageHeader
        icon="portfolio"
        title={isOwner ? 'Portofolio Saya' : owner?.name ? `Portofolio ${owner.name}` : 'Portofolio'}
      />
      {owner?.photo_url && <img src={owner.photo_url} alt="Foto profil" className="avatar" />}
      {notice && <p className="notice-box">{notice}</p>}

      {isOwner && (
        <p>
          <Link to="/profil" className="btn btn-ghost">Lihat / Edit Profil Saya →</Link>
        </p>
      )}

      {/* LB4: seksi siswa ("Pembelajaran Berjalan", "Sertifikat Saya")
          hanya untuk pemilik yang memang siswa — mentor/admin tidak
          punya pembelajaran/sertifikat course, jadi seksinya disembunyikan
          (bukan tampil kosong). */}
      {canSeePrivate && owner?.role !== 'mentor' && owner?.role !== 'admin' && (
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
            <h2>{isOwner ? 'Sertifikat Saya' : owner?.name ? `Sertifikat ${owner.name}` : 'Sertifikat'}</h2>
            <p className="muted">Bagian ini hanya terlihat oleh pemilik portofolio dan admin.</p>
            {certs.length === 0 ? (
              <p className="empty">Belum ada sertifikat.</p>
            ) : (
              <ul>
                {certs.map((c) => (
                  <li key={c.id}>{c.serial}, {c.type} · Nilai: {c.score ?? '—'}</li>
                ))}
              </ul>
            )}
            {isOwner && <p><Link to="/sertifikat">Buka halaman Sertifikat Saya →</Link></p>}
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
                  {KINDS.find((k) => k.value === it.kind)?.label ?? it.kind} · {VISIBILITY_LABELS[it.visibility] ?? it.visibility}
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
                <option value="public">Publik, semua orang</option>
                <option value="members">Anggota, pengguna yang masuk</option>
                <option value="community">Komunitas, anggota komunitasku</option>
                <option value="private">Privat, hanya saya (dan admin)</option>
              </select>
            </label>
            <button type="submit" className="btn btn-primary">Tambah Item</button>
          </form>
        </section>
      )}
    </div>
  )
}
