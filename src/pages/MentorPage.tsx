// SINEVERSE, Mentor Workspace (008 + 003 + 027): course yang diampu +
// jumlah siswa / penilaian tertunda, "Ajukan untuk Mengampu" course tanpa
// mentor, lamaran mentor, office hours, RPS read-only.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import MentorApplicationForm from '../components/MentorApplicationForm'
import { useAuth } from '../context/AuthContext'
import {
  fetchCourses,
  fetchMyMentorApplication,
  submitMentorApplication,
  supabase,
} from '../lib/supabase'
import type { Course, CourseClaim, MentorApplication, MentorApplicationInput } from '../lib/types'
import PageHeader from '../components/PageHeader'
import WorkspaceNav from '../components/WorkspaceNav'
import { MENTOR_NAV } from '../lib/workspaceNav'

interface MentorCourseRow {
  course: Course
  students: number
  pending: number
}

function toInput(app: MentorApplication): Partial<MentorApplicationInput> {
  return {
    profession: app.profession ?? '',
    expertise: app.expertise ?? [],
    experience: app.experience ?? '',
    portfolio_link: app.portfolio_link,
    reason: app.reason ?? '',
    volunteer_agreed: app.volunteer_agreed ?? false,
  }
}

export default function MentorPage() {
  const { user, profile } = useAuth()
  const [rows, setRows] = useState<MentorCourseRow[]>([])
  const [unassigned, setUnassigned] = useState<Course[]>([])
  const [claims, setClaims] = useState<CourseClaim[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Lamaran mentor milik pengguna (migrasi 027): status ditampilkan apa
  // adanya — pending, disetujui, ditolak (dengan alasan), atau diminta
  // revisi (dengan catatan + bisa diajukan ulang).
  const [myApplication, setMyApplication] = useState<MentorApplication | null>(null)
  const [applying, setApplying] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const isMentor = profile?.role === 'mentor' || profile?.role === 'admin'
  const isAdmin = profile?.role === 'admin'
  const isSiswa = profile?.role === 'siswa'

  function friendlyError(err: unknown): string {
    const msg = err instanceof Error ? err.message : ''
    if (/duplicate|unique|23505/i.test(msg)) return 'Lamaran kamu masih menunggu persetujuan.'
    return 'Gagal mengirim. Coba lagi sebentar lagi.'
  }

  useEffect(() => {
    if (!user) return
    const currentUser = user
    let cancelled = false
    async function load() {
      try {
        // fetchCourses, klaim, dan lamaran independen — paralel sejak awal.
        const [courses, { data: cl }, myApp] = await Promise.all([
          fetchCourses(),
          supabase.from('course_claims').select('*').eq('mentor_id', currentUser.id).order('created_at', { ascending: false }),
          fetchMyMentorApplication(currentUser.id),
        ])
        if (cancelled) return
        const mine = profile?.role === 'admin' ? courses : courses.filter((c) => c.mentor_id === currentUser.id)
        // Batch lintas SEMUA course yang diampu (bukan loop per course):
        // enrollments + modules paralel, lalu lessons → assignments →
        // submissions belum dinilai; jumlah siswa/pending dihitung di JS.
        let out: MentorCourseRow[] = []
        if (mine.length > 0) {
          const mineIds = mine.map((c) => c.id)
          const [{ data: enr }, { data: mods }] = await Promise.all([
            supabase.from('enrollments').select('id,course_id').in('course_id', mineIds),
            supabase.from('modules').select('id,course_id').in('course_id', mineIds),
          ])
          const enrRows = (enr ?? []) as { id: string; course_id: string }[]
          const modRows = (mods ?? []) as { id: string; course_id: string }[]
          const modCourse = new Map(modRows.map((m) => [m.id, m.course_id]))
          let lessonRows: { id: string; module_id: string }[] = []
          if (modRows.length > 0) {
            const { data: lessons } = await supabase
              .from('lessons')
              .select('id,module_id')
              .in('module_id', modRows.map((m) => m.id))
            lessonRows = (lessons ?? []) as { id: string; module_id: string }[]
          }
          const lessonCourse = new Map(lessonRows.map((l) => [l.id, modCourse.get(l.module_id) ?? '']))
          let assignRows: { id: string; lesson_id: string }[] = []
          if (lessonRows.length > 0) {
            const { data: assigns } = await supabase
              .from('assignments')
              .select('id,lesson_id')
              .in('lesson_id', lessonRows.map((l) => l.id))
            assignRows = (assigns ?? []) as { id: string; lesson_id: string }[]
          }
          const assignCourse = new Map(assignRows.map((a) => [a.id, lessonCourse.get(a.lesson_id) ?? '']))
          let subRows: { assignment_id: string }[] = []
          if (assignRows.length > 0) {
            const { data: subs } = await supabase
              .from('submissions')
              .select('assignment_id')
              .in('assignment_id', assignRows.map((a) => a.id))
              .is('score', null)
            subRows = (subs ?? []) as { assignment_id: string }[]
          }
          const studentsByCourse = new Map<string, number>()
          for (const e of enrRows) {
            studentsByCourse.set(e.course_id, (studentsByCourse.get(e.course_id) ?? 0) + 1)
          }
          const pendingByCourse = new Map<string, number>()
          for (const s of subRows) {
            const cid = assignCourse.get(s.assignment_id)
            if (!cid) continue
            pendingByCourse.set(cid, (pendingByCourse.get(cid) ?? 0) + 1)
          }
          out = mine.map((course) => ({
            course,
            students: studentsByCourse.get(course.id) ?? 0,
            pending: pendingByCourse.get(course.id) ?? 0,
          }))
        }
        if (!cancelled) {
          setRows(out)
          setUnassigned(courses.filter((c) => !c.mentor_id))
          setClaims((cl ?? []) as CourseClaim[])
          setMyApplication(myApp)
        }
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
    // Klaim yang ditolak boleh diajukan ulang (migrasi 022): baris yang
    // sama dikembalikan ke 'pending', bukan insert duplikat.
    const existing = claims.find((cl) => cl.course_id === courseId)
    if (existing?.status === 'rejected') {
      const { error: updErr } = await supabase.from('course_claims')
        .update({ status: 'pending' })
        .eq('id', existing.id)
      if (updErr) {
        setNotice('Gagal mengirim ulang pengajuan. Coba lagi sebentar lagi.')
        return
      }
      setNotice('Pengajuan mengampu dikirim ulang. Admin akan meninjau kembali.')
    } else {
      const { error: insErr } = await supabase.from('course_claims').insert({
        course_id: courseId,
        mentor_id: user.id,
        status: 'pending',
      })
      if (insErr) {
        setNotice(/duplicate|unique|23505/i.test(insErr.message)
          ? 'Pengajuan kamu masih menunggu persetujuan.'
          : 'Gagal mengirim pengajuan. Coba lagi sebentar lagi.')
        return
      }
      setNotice('Pengajuan mengampu terkirim. Setelah disetujui admin, kamu otomatis menjadi mentor course itu.')
    }
    const { data } = await supabase.from('course_claims').select('*').eq('mentor_id', user.id).order('created_at', { ascending: false })
    setClaims((data ?? []) as CourseClaim[])
  }

  async function handleApply(values: MentorApplicationInput) {
    if (!user) return
    setApplying(true)
    try {
      const result = await submitMentorApplication(user.id, values)
      setMyApplication(result)
      setShowForm(false)
      setNotice('Lamaran mentor terkirim. Persetujuan admin mengubah peranmu menjadi mentor secara otomatis (trigger di database, bukan dari aplikasi).')
    } catch (err) {
      setNotice(friendlyError(err))
    } finally {
      setApplying(false)
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
          <h2>Gabung sebagai Mentor</h2>
          {myApplication?.status === 'pending' && (
            <p className="notice-box">Lamaran kamu masih menunggu persetujuan admin. Peran mentor aktif begitu lamaran disetujui.</p>
          )}
          {myApplication?.status === 'approved' && (
            <p className="notice-box">Lamaranmu disetujui — peran mentor sudah aktif di akun ini.</p>
          )}
          {myApplication?.status === 'rejected' && !showForm && (
            <>
              <p className="error-box">
                Lamaranmu ditolak oleh admin.
                {myApplication.decision_note ? ` Alasan: ${myApplication.decision_note}` : ''}
              </p>
              <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
                Ajukan Lamaran Baru
              </button>
            </>
          )}
          {myApplication?.status === 'revision_required' && !showForm && (
            <>
              <p className="notice-box">
                Admin meminta perbaikan pada lamaranmu.
                {myApplication.decision_note ? ` Catatan: ${myApplication.decision_note}` : ''}
              </p>
              <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
                Perbaiki &amp; Kirim Ulang
              </button>
            </>
          )}
          {(!myApplication || showForm) && (
            <>
              <p className="muted">Kamu saat ini terdaftar sebagai siswa. Kirim lamaran mentor di sini; admin yang menyetujui.</p>
              <MentorApplicationForm
                initial={myApplication ? toInput(myApplication) : undefined}
                onSubmit={handleApply}
                submitting={applying}
                submitLabel={myApplication?.status === 'revision_required' ? 'Kirim Ulang Lamaran' : 'Kirim Lamaran Mentor'}
              />
            </>
          )}
        </section>
      )}

      {!isMentor && !isSiswa && <p className="empty">Mentor Workspace hanya untuk mentor dan admin.</p>}

      {isMentor && (
        <>
          <section className="section">
            <h2>{isAdmin ? 'Semua Course' : 'Course Saya'}</h2>
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
              <Link to="/mentor/materi" className="btn btn-secondary">Materi</Link>{' '}
              <Link to="/mentor/video" className="btn btn-secondary">Video</Link>{' '}
              <Link to="/mentor/kuis" className="btn btn-secondary">Kuis</Link>{' '}
              <Link to="/mentor/rubrik" className="btn btn-secondary">Rubrik</Link>{' '}
              <Link to="/mentor/pengumuman" className="btn btn-secondary">Pengumuman</Link>{' '}
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
                        claim.status === 'rejected' ? (
                          <>
                            <span className="muted">— pengajuan: Ditolak{claim.decision_note ? `: ${claim.decision_note}` : ''}</span>{' '}
                            <button type="button" className="btn btn-ghost btn-small" onClick={() => void handleClaim(c.id)}>
                              Ajukan Lagi
                            </button>
                          </>
                        ) : (
                          <span className="muted">— pengajuan: {claim.status === 'approved' ? 'Disetujui' : 'Menunggu persetujuan'}</span>
                        )
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
