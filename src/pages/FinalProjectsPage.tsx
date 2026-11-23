// SINEVERSE — Final Project (Tahap 5, migrasi 016): daftar + pendaftaran.
// "Proyek Saya" = proyek yang saya miliki atau ikuti sebagai anggota tim;
// "Proyek yang Dipublikasikan" = proyek berstatus published (terbaca semua
// anggota). Banner panduan menampilkan jumlah course yang sudah selesai
// (sertifikat course) sebagai anjuran lunak — pendaftaran tetap dibuka
// walau belum menyelesaikan 10 course.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'
import { fmtDate } from '../lib/guarded'
import {
  FINAL_PROJECT_STATUS_LABEL,
  createFinalProject,
  fetchMentoredFinalProjects,
  fetchMyCompletedCourseCount,
  fetchMyFinalProjects,
  fetchPublishedFinalProjects,
  fetchSubmittedFinalProjects,
} from '../lib/finalProjects'
import type { FinalProject } from '../lib/finalProjects'
import { fetchProfileNames, logAudit, supabase } from '../lib/supabase'

interface MentorOption {
  id: string
  name: string | null
}

export default function FinalProjectsPage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [mine, setMine] = useState<FinalProject[]>([])
  const [published, setPublished] = useState<FinalProject[]>([])
  const [completedCount, setCompletedCount] = useState<number | null>(null)
  const [mentors, setMentors] = useState<MentorOption[]>([])
  // K14: mentor/admin tidak mendaftar sebagai siswa — mereka me-review.
  const isReviewer = profile?.role === 'mentor' || profile?.role === 'admin'
  const [review, setReview] = useState<FinalProject[]>([])
  const [ownerNames, setOwnerNames] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [mentorId, setMentorId] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    // B38: proyek yang dipublikasikan dimuat untuk SEMUA pengunjung,
    // termasuk yang logout — sebelumnya `if (!user)` langsung return
    // sehingga daftar published selalu kosong untuk tamu.
    if (!user) {
      let cancelled = false
      void (async () => {
        try {
          setPublished(await fetchPublishedFinalProjects())
        } catch {
          if (!cancelled) setError('Gagal memuat Final Project. Coba lagi.')
        } finally {
          if (!cancelled) setLoading(false)
        }
      })()
      return () => {
        cancelled = true
      }
    }
    const reviewer = profile?.role === 'mentor' || profile?.role === 'admin'
    let cancelled = false
    void (async () => {
      try {
        const [my, pub, extra] = await Promise.all([
          fetchMyFinalProjects(user.id),
          fetchPublishedFinalProjects(),
          reviewer
            ? (async () => {
                const list = profile?.role === 'admin'
                  ? await fetchSubmittedFinalProjects()
                  : await fetchMentoredFinalProjects(user.id)
                const names = await fetchProfileNames(list.map((p) => p.owner_id)).catch(() => new Map<string, string>())
                return { list, names, count: null as number | null, mentors: [] as MentorOption[] }
              })()
            : (async () => {
                const [count, mentorRows] = await Promise.all([
                  fetchMyCompletedCourseCount(user.id),
                  supabase.from('profiles').select('id,name').eq('role', 'mentor').order('name'),
                ])
                return {
                  list: [] as FinalProject[],
                  names: new Map<string, string>(),
                  count,
                  mentors: (mentorRows.error ? [] : (mentorRows.data ?? [])) as MentorOption[],
                }
              })(),
        ])
        if (cancelled) return
        setMine(my)
        setPublished(pub)
        setReview(extra.list)
        setOwnerNames(extra.names)
        setCompletedCount(extra.count)
        setMentors(extra.mentors)
      } catch {
        if (!cancelled) setError('Gagal memuat Final Project. Coba lagi.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, profile?.role])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!user || !title.trim() || creating) return
    // K14: mentor/admin tidak mendaftarkan Final Project sebagai siswa.
    if (profile?.role === 'mentor' || profile?.role === 'admin') {
      setNotice('Mentor dan admin tidak mendaftarkan Final Project sebagai siswa.')
      return
    }
    setCreating(true)
    setNotice(null)
    try {
      const project = await createFinalProject({
        title: title.trim(),
        description: description.trim() || null,
        ownerId: user.id,
        mentorId: mentorId || null,
      })
      await logAudit('final_project.created', 'final_projects', project.id, {
        title: project.title,
      })
      navigate(`/proyek-akhir/${project.id}`)
    } catch {
      setNotice('Gagal mendaftarkan Final Project. Coba lagi.')
    } finally {
      setCreating(false)
    }
  }

  // P53: proyek sendiri tidak tampil dua kali — "Proyek yang
  // Dipublikasikan" hanya berisi proyek orang lain (proyek sendiri, baik
  // sebagai pemilik maupun anggota tim, sudah ada di "Proyek Saya").
  const myIds = new Set(mine.map((p) => p.id))
  const publishedOthers = published.filter((p) => !myIds.has(p.id))
  // P54: potong deskripsi panjang seperti DeadlinesPage (~120 karakter).
  const snippet = (d: string) => (d.length > 120 ? `${d.slice(0, 120).trimEnd()}…` : d)

  if (loading) return <div className="page"><p className="muted">Memuat Proyek Akhir…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>

  return (
    <div className="page">
      <PageHeader
        icon="project"
        title="Proyek Akhir"
        subtitle="Film pendek akhir Academy: kerjakan dalam 10 langkah bersama tim lintas sekolah, dinilai mentor, lalu dipublikasikan ke Showcase."
      />
      {notice && <p className="notice-box">{notice}</p>}

      {isReviewer ? (
        <section className="section">
          <h2>{profile?.role === 'admin' ? 'Proyek untuk Direview' : 'Proyek yang Kamu Dampingi'}</h2>
          <p className="muted">
            {profile?.role === 'admin'
              ? 'Proyek akhir yang sudah dikirim siswa untuk dinilai. Buka proyek untuk menilai dan mengubah statusnya.'
              : 'Proyek akhir siswa yang memilihmu sebagai mentor pendamping. Buka proyek untuk menilai dan mengubah statusnya.'}
          </p>
          {review.length === 0 ? (
            <p className="empty">Belum ada proyek untuk direview.</p>
          ) : (
            <ul>
              {review.map((p) => (
                <li key={p.id}>
                  <Link to={`/proyek-akhir/${p.id}`}>{p.title}</Link>
                  {' · '}{FINAL_PROJECT_STATUS_LABEL[p.status]}
                  {ownerNames.get(p.owner_id) ? <span className="muted"> · {ownerNames.get(p.owner_id)}</span> : null}
                  {p.description ? <span className="muted"> — {snippet(p.description)}</span> : null}
                  <span className="muted"> · {fmtDate(p.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        !user ? (
        <p className="notice-box">
          <Link to="/login">Masuk</Link> untuk mendaftarkan Final Project dan melihat proyekmu.
        </p>
      ) : (
      <>
      <p className="notice-box">
        {completedCount === null
          ? 'Jumlah course yang kamu selesaikan belum bisa dimuat.'
          : `Kamu sudah menyelesaikan ${completedCount} dari 10 course (sertifikat course).`}
        {' '}Final Project disarankan setelah menyelesaikan 10 course, tapi pendaftaran tetap dibuka.
      </p>

      <section className="section">
        <h2>Daftarkan Final Project</h2>
        <form className="form" onSubmit={handleCreate}>
          <label>
            Judul film
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Mis. Senja di Ujung Rel"
            />
          </label>
          <label>
            Deskripsi
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Premis atau gambaran singkat film…"
            />
          </label>
          <label>
            Mentor pendamping (opsional)
            <select
              value={mentorId}
              onChange={(e) => setMentorId(e.target.value)}
              style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
            >
              <option value="">Belum ada mentor</option>
              {mentors.map((m) => (
                <option key={m.id} value={m.id}>{m.name ?? 'Mentor'}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-primary" disabled={creating}>
            {creating ? 'Mendaftarkan…' : 'Daftarkan Proyek'}
          </button>
        </form>
      </section>
      </>
      ))}

      {user && (
      <section className="section">
        <h2>Proyek Saya ({mine.length})</h2>
        {mine.length === 0 ? (
          <p className="empty">Belum ada Final Project. Daftarkan proyek film akhirmu di sini.</p>
        ) : (
          <ul>
            {mine.map((p) => (
              <li key={p.id}>
                <Link to={`/proyek-akhir/${p.id}`}>{p.title}</Link>
                {' · '}{FINAL_PROJECT_STATUS_LABEL[p.status]}
                {p.description ? <span className="muted"> — {snippet(p.description)}</span> : null}
                <span className="muted"> · {fmtDate(p.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      <section className="section">
        <h2>Proyek yang Dipublikasikan ({publishedOthers.length})</h2>
        {publishedOthers.length === 0 ? (
          <p className="empty">Belum ada proyek yang dipublikasikan.</p>
        ) : (
          <ul>
            {publishedOthers.map((p) => (
              <li key={p.id}>
                <Link to={`/proyek-akhir/${p.id}`}>{p.title}</Link>
                {' · '}{FINAL_PROJECT_STATUS_LABEL[p.status]}
                {p.description ? <span className="muted"> — {snippet(p.description)}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
