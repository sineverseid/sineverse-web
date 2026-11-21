// SINEVERSE — Mentor Workspace (008 + 003): course yang diampu + jumlah
// siswa / penilaian tertunda, "Ajukan untuk Mengampu" course tanpa mentor,
// lamaran mentor, office hours, RPS read-only.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchCourseLessons, fetchCourses, supabase } from '../lib/supabase'
import type { Course, CourseClaim } from '../lib/types'
import PageHeader from '../components/PageHeader'
import WorkspaceNav from '../components/WorkspaceNav'
import { MENTOR_NAV } from '../lib/workspaceNav'

interface MentorCourseRow {
  course: Course
  students: number
  pending: number
}

export default function MentorPage() {
  const { user, profile } = useAuth()
  const [rows, setRows] = useState<MentorCourseRow[]>([])
  const [unassigned, setUnassigned] = useState<Course[]>([])
  const [claims, setClaims] = useState<CourseClaim[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [expertise, setExpertise] = useState('')
  const [experience, setExperience] = useState('')
  const [portfolioLink, setPortfolioLink] = useState('')

  const isMentor = profile?.role === 'mentor' || profile?.role === 'admin'
  const isSiswa = profile?.role === 'siswa'

  useEffect(() => {
    if (!user) return
    const currentUser = user
    let cancelled = false
    async function load() {
      try {
        const courses = await fetchCourses()
        if (cancelled) return
        const mine = profile?.role === 'admin' ? courses : courses.filter((c) => c.mentor_id === currentUser.id)
        const out: MentorCourseRow[] = []
        for (const course of mine) {
          const [enr, lessons] = await Promise.all([
            supabase.from('enrollments').select('id').eq('course_id', course.id),
            fetchCourseLessons(course.id),
          ])
          const lessonIds = lessons.map((l) => l.id)
          let pending = 0
          if (lessonIds.length > 0) {
            const { data: assigns } = await supabase.from('assignments').select('id').in('lesson_id', lessonIds)
            const aIds = ((assigns ?? []) as { id: string }[]).map((a) => a.id)
            if (aIds.length > 0) {
              const { count } = await supabase
                .from('submissions')
                .select('id', { count: 'exact', head: true })
                .in('assignment_id', aIds)
                .is('score', null)
              pending = count ?? 0
            }
          }
          out.push({ course, students: (enr.data ?? []).length, pending })
        }
        if (!cancelled) {
          setRows(out)
          setUnassigned(courses.filter((c) => !c.mentor_id))
        }
        const { data: cl } = await supabase.from('course_claims').select('*').eq('mentor_id', currentUser.id).order('created_at', { ascending: false })
        if (!cancelled) setClaims((cl ?? []) as CourseClaim[])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat Mentor Workspace.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user, profile?.role])

  async function handleClaim(courseId: string) {
    if (!user) return
    const { error: insErr } = await supabase.from('course_claims').insert({
      course_id: courseId,
      mentor_id: user.id,
      status: 'pending',
    })
    if (insErr) setNotice(insErr.message)
    else {
      setNotice('Pengajuan mengampu terkirim. Admin akan meninjau — setelah disetujui, admin menetapkan kamu sebagai mentor course itu (lihat Admin Panel).')
      const { data } = await supabase.from('course_claims').select('*').eq('mentor_id', user.id).order('created_at', { ascending: false })
      setClaims((data ?? []) as CourseClaim[])
    }
  }

  async function handleApply(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    const { error: insErr } = await supabase.from('mentor_applications').insert({
      user_id: user.id,
      expertise: expertise.trim() || null,
      experience: experience.trim() || null,
      portfolio_link: portfolioLink.trim() || null,
      status: 'pending',
    })
    if (insErr) setNotice(insErr.message)
    else {
      setNotice('Lamaran mentor terkirim. Persetujuan admin mengubah peranmu menjadi mentor secara otomatis (trigger di database — bukan dari aplikasi).')
      setExpertise('')
      setExperience('')
      setPortfolioLink('')
    }
  }

  if (loading) return <div className="page"><p className="muted">Memuat Mentor Workspace…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>

  return (
    <div className="page">
      <PageHeader
        icon="mentor"
        title="Mentor Workspace"
        subtitle="Kursus yang kamu ampu, antrean penilaian, dan jadwal mentoring."
      />
      <WorkspaceNav entries={MENTOR_NAV} />
      {notice && <p className="notice-box">{notice}</p>}

      {isSiswa && (
        <section className="section">
          <h2>Lamar Menjadi Mentor</h2>
          <p className="muted">Kamu saat ini terdaftar sebagai siswa. Kirim lamaran mentor di sini; admin yang menyetujui.</p>
          <form className="form" onSubmit={handleApply}>
            <label>
              Bidang keahlian
              <input value={expertise} onChange={(e) => setExpertise(e.target.value)} required placeholder="Mis. Sinematografi, penyutradaraan" />
            </label>
            <label>
              Pengalaman
              <textarea value={experience} onChange={(e) => setExperience(e.target.value)} rows={3} placeholder="Pengalaman mengajar / berkarya…" />
            </label>
            <label>
              Tautan portofolio (opsional)
              <input value={portfolioLink} onChange={(e) => setPortfolioLink(e.target.value)} placeholder="https://…" />
            </label>
            <button type="submit" className="btn btn-primary">Kirim Lamaran Mentor</button>
          </form>
        </section>
      )}

      {!isMentor && !isSiswa && <p className="empty">Mentor Workspace hanya untuk mentor dan admin.</p>}

      {isMentor && (
        <>
          <section className="section">
            <h2>Course Saya</h2>
            {rows.length === 0 ? (
              <p className="empty">Kamu belum mengampu course apa pun. Ajukan course tanpa mentor di bawah.</p>
            ) : (
              <ul className="course-list">
                {rows.map((r) => (
                  <li key={r.course.id} className="course-card">
                    <Link to={`/mentor/course/${r.course.id}`}>
                      <h3>{r.course.title}</h3>
                      <p className="muted">
                        {r.students} siswa · {r.pending} submission menunggu penilaian
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p>
              <Link to="/mentor/penilaian" className="btn btn-primary">Antrean Penilaian</Link>{' '}
              <Link to="/mentor/siswa" className="btn btn-secondary">Siswa</Link>{' '}
              <Link to="/mentor/diskusi" className="btn btn-secondary">Diskusi</Link>{' '}
              <Link to="/mentor/analitik" className="btn btn-secondary">Analitik</Link>{' '}
              <Link to="/jam-kantor" className="btn btn-secondary">Office Hours</Link>{' '}
              <Link to="/rps" className="btn btn-ghost">Lihat RPS (read-only)</Link>
            </p>
          </section>

          <section className="section">
            <h2>Ajukan untuk Mengampu</h2>
            {unassigned.length === 0 ? (
              <p className="empty">Tidak ada course tanpa mentor saat ini.</p>
            ) : (
              <ul>
                {unassigned.map((c) => {
                  const claim = claims.find((cl) => cl.course_id === c.id)
                  return (
                    <li key={c.id}>
                      {c.title}{' '}
                      {claim ? (
                        <span className="muted">— pengajuan: {claim.status}</span>
                      ) : (
                        <button type="button" className="btn btn-ghost btn-small" onClick={() => void handleClaim(c.id)}>
                          Ajukan
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
