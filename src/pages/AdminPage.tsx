// SINEVERSE — Admin Panel (role admin only, route-guarded di App.tsx):
// ringkasan, lamaran mentor (setujui/tolak — persetujuan mengubah peran
// lewat trigger database, aplikasi TIDAK PERNAH mengubah profiles.role
// dari client), klaim mengampu + pembagian mentor kurikulum, verifikasi
// sekolah, usulan komunitas + hapus komunitas, pengumuman, progress lengkap.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchCourses, fetchProfileNames, logAudit, supabase } from '../lib/supabase'
import type { CommunityProposal, Course, CourseClaim, MentorApplication, School } from '../lib/types'
import PageHeader from '../components/PageHeader'

interface ProgressRow {
  userId: string
  name: string
  courses: number
  completed: number
  inProgress: number
}

export default function AdminPage() {
  const { user, profile } = useAuth()
  const [counts, setCounts] = useState({ users: 0, siswa: 0, mentor: 0, courses: 0, enrollments: 0, pendingApps: 0, openReports: 0 })
  const [apps, setApps] = useState<MentorApplication[]>([])
  const [claims, setClaims] = useState<CourseClaim[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [schools, setSchools] = useState<School[]>([])
  const [proposals, setProposals] = useState<CommunityProposal[]>([])
  const [communities, setCommunities] = useState<{ id: string; name: string }[]>([])
  const [progress, setProgress] = useState<ProgressRow[]>([])
  const [mentorLoad, setMentorLoad] = useState<{ name: string; courses: number; pending: number }[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [annTitle, setAnnTitle] = useState('')
  const [annBody, setAnnBody] = useState('')
  const [annScope, setAnnScope] = useState<'platform' | 'course'>('platform')
  const [annCourse, setAnnCourse] = useState('')
  const [announcements, setAnnouncements] = useState<{ id: string; title: string; scope: string }[]>([])
  const [newCourseTitle, setNewCourseTitle] = useState('')
  const [newCourseDesc, setNewCourseDesc] = useState('')
  const [newCourseCategory, setNewCourseCategory] = useState('')
  const [assignCourse, setAssignCourse] = useState('')
  const [assignMentor, setAssignMentor] = useState('')
  const [mentors, setMentors] = useState<{ id: string; name: string | null }[]>([])

  async function load() {
    try {
      const { data: profiles } = await supabase.from('profiles').select('id,name,role')
      const profs = (profiles ?? []) as { id: string; name: string | null; role: string }[]
      const { count: enrCount } = await supabase.from('enrollments').select('id', { count: 'exact', head: true })
      const courseList = await fetchCourses()
      const { data: appData } = await supabase.from('mentor_applications').select('*').eq('status', 'pending').order('created_at')
      const { data: claimData } = await supabase.from('course_claims').select('*').eq('status', 'pending').order('created_at')
      const { data: schoolData } = await supabase.from('schools').select('*').order('name')
      const { data: propData } = await supabase.from('community_proposals').select('*').eq('status', 'pending').order('created_at')
      const { data: commData } = await supabase.from('communities').select('id,name').order('name')
      const { data: repData } = await supabase.from('discussion_reports').select('id').eq('status', 'open')
      const { data: annData } = await supabase.from('announcements').select('id,title,scope').order('created_at', { ascending: false }).limit(20)
      const { data: progData } = await supabase.from('lesson_progress').select('user_id,status')
      const { data: enrData } = await supabase.from('enrollments').select('user_id,course_id')
      setNames(await fetchProfileNames(profs.map((p) => p.id)))
      setCounts({
        users: profs.length,
        siswa: profs.filter((p) => p.role === 'siswa').length,
        mentor: profs.filter((p) => p.role === 'mentor').length,
        courses: courseList.length,
        enrollments: enrCount ?? 0,
        pendingApps: (appData ?? []).length,
        openReports: (repData ?? []).length,
      })
      setApps((appData ?? []) as MentorApplication[])
      setClaims((claimData ?? []) as CourseClaim[])
      setCourses(courseList)
      setSchools((schoolData ?? []) as School[])
      setProposals((propData ?? []) as CommunityProposal[])
      setCommunities((commData ?? []) as { id: string; name: string }[])
      setAnnouncements((annData ?? []) as { id: string; title: string; scope: string }[])
      setMentors(profs.filter((p) => p.role === 'mentor').map((p) => ({ id: p.id, name: p.name })))
      const rows: ProgressRow[] = profs
        .filter((p) => p.role === 'siswa')
        .map((p) => {
          const myProg = ((progData ?? []) as { user_id: string; status: string }[]).filter((r) => r.user_id === p.id)
          return {
            userId: p.id,
            name: p.name ?? 'Siswa',
            courses: ((enrData ?? []) as { user_id: string }[]).filter((e) => e.user_id === p.id).length,
            completed: myProg.filter((r) => r.status === 'completed').length,
            inProgress: myProg.filter((r) => r.status === 'in_progress').length,
          }
        })
      setProgress(rows)
      const loadRows: { name: string; courses: number; pending: number }[] = []
      for (const m of profs.filter((p) => p.role === 'mentor')) {
        const mine = courseList.filter((c) => c.mentor_id === m.id)
        let pending = 0
        for (const c of mine) {
          const { data: mods } = await supabase.from('modules').select('id').eq('course_id', c.id)
          const modIds = ((mods ?? []) as { id: string }[]).map((x) => x.id)
          if (modIds.length === 0) continue
          const { data: lessons } = await supabase.from('lessons').select('id').in('module_id', modIds)
          const lessonIds = ((lessons ?? []) as { id: string }[]).map((x) => x.id)
          if (lessonIds.length === 0) continue
          const { data: assigns } = await supabase.from('assignments').select('id').in('lesson_id', lessonIds)
          const aIds = ((assigns ?? []) as { id: string }[]).map((x) => x.id)
          if (aIds.length === 0) continue
          const { count } = await supabase.from('submissions').select('id', { count: 'exact', head: true }).in('assignment_id', aIds).is('score', null)
          pending += count ?? 0
        }
        loadRows.push({ name: m.name ?? 'Mentor', courses: mine.length, pending })
      }
      setMentorLoad(loadRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat Admin Panel.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (profile?.role !== 'admin') {
    return (
      <div className="page">
        <h1>Admin Panel</h1>
        <p className="empty">Halaman ini hanya untuk admin.</p>
      </div>
    )
  }
  if (loading) return <div className="page"><p className="muted">Memuat Admin Panel…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>

  async function decideApp(app: MentorApplication, approve: boolean) {
    // Hanya status yang diubah dari client. Trigger promote_mentor_on_approval
    // di database yang mengubah profiles.role menjadi 'mentor'.
    const { error: updErr } = await supabase
      .from('mentor_applications')
      .update({ status: approve ? 'approved' : 'rejected', decided_by: user?.id ?? null })
      .eq('id', app.id)
    if (updErr) {
      setNotice(updErr.message)
      return
    }
    await logAudit(approve ? 'mentor_application.approved' : 'mentor_application.rejected', 'mentor_applications', app.id, { user_id: app.user_id })
    setNotice(approve ? 'Lamaran mentor disetujui. Peran diubah menjadi mentor oleh trigger database.' : 'Lamaran mentor ditolak.')
    await load()
  }

  async function decideClaim(claim: CourseClaim, approve: boolean) {
    const { error: updErr } = await supabase
      .from('course_claims')
      .update({ status: approve ? 'approved' : 'rejected', decided_by: user?.id ?? null })
      .eq('id', claim.id)
    if (updErr) {
      setNotice(updErr.message)
      return
    }
    await logAudit(approve ? 'course_claim.approved' : 'course_claim.rejected', 'course_claims', claim.id, { course_id: claim.course_id, mentor_id: claim.mentor_id })
    setNotice(
      approve
        ? 'Klaim mengampu disetujui. Tetapkan mentornya di "Pembagian Mentor Kurikulum" di bawah (persetujuan klaim tidak otomatis mengubah courses.mentor_id).'
        : 'Klaim mengampu ditolak.',
    )
    await load()
  }

  async function handleAssignMentor(e: FormEvent) {
    e.preventDefault()
    if (!assignCourse) return
    const { error: updErr } = await supabase
      .from('courses')
      .update({ mentor_id: assignMentor || null })
      .eq('id', assignCourse)
    if (updErr) setNotice(updErr.message)
    else {
      await logAudit('course.mentor_assigned', 'courses', assignCourse, { mentor_id: assignMentor || null })
      setNotice(assignMentor ? 'Mentor ditetapkan untuk course ini.' : 'Mentor dilepas — course kembali tanpa mentor.')
      setAssignCourse('')
      setAssignMentor('')
      await load()
    }
  }

  async function handleCreateCourse(e: FormEvent) {
    e.preventDefault()
    if (!newCourseTitle.trim()) return
    const { error: insErr } = await supabase.from('courses').insert({
      title: newCourseTitle.trim(),
      description: newCourseDesc.trim() || null,
      category: newCourseCategory.trim() || null,
      mentor_id: null,
    })
    if (insErr) setNotice(insErr.message)
    else {
      setNotice('Course baru dibuat (tanpa mentor — mentor bisa mengajukan lewat "Ajukan untuk Mengampu").')
      setNewCourseTitle('')
      setNewCourseDesc('')
      setNewCourseCategory('')
      await load()
    }
  }

  async function handleVerifySchool(school: School, verify: boolean) {
    const { error: updErr } = await supabase.from('schools').update({ is_verified: verify }).eq('id', school.id)
    if (updErr) setNotice(updErr.message)
    else {
      await logAudit(verify ? 'school.verified' : 'school.unverified', 'schools', school.id, {})
      setNotice(`Sekolah ${school.name} ${verify ? 'diverifikasi' : 'batal diverifikasi'}.`)
      await load()
    }
  }

  async function decideProposal(p: CommunityProposal, approve: boolean) {
    const { error: updErr } = await supabase
      .from('community_proposals')
      .update({ status: approve ? 'approved' : 'rejected', decided_by: user?.id ?? null })
      .eq('id', p.id)
    if (updErr) {
      setNotice(updErr.message)
      return
    }
    if (approve) {
      // Persetujuan membuat komunitas + menggabungkan pengusul.
      const { data: comm, error: cErr } = await supabase
        .from('communities')
        .insert({ name: p.name, description: p.description, created_by: p.proposer_id, is_approved: true })
        .select()
        .single()
      if (cErr) {
        setNotice(cErr.message)
        return
      }
      await supabase.from('community_members').insert({
        community_id: (comm as { id: string }).id,
        user_id: p.proposer_id,
        role: 'member',
      })
      await logAudit('community_proposal.approved', 'community_proposals', p.id, { community_id: (comm as { id: string }).id })
      setNotice(`Komunitas "${p.name}" dibuat dan pengusul langsung menjadi anggotanya.`)
    } else {
      setNotice('Usulan komunitas ditolak.')
    }
    await load()
  }

  async function handleDeleteCommunity(id: string, name: string) {
    if (!window.confirm(`Hapus komunitas "${name}" beserta semua postingan dan keanggotaannya? Tindakan ini tidak bisa dibatalkan.`)) return
    const { error: delErr } = await supabase.from('communities').delete().eq('id', id)
    if (delErr) setNotice(delErr.message)
    else {
      await logAudit('community.deleted', 'communities', id, { name })
      setNotice(`Komunitas "${name}" dihapus.`)
      await load()
    }
  }

  async function handleCreateAnnouncement(e: FormEvent) {
    e.preventDefault()
    if (!user || !annTitle.trim()) return
    const { error: insErr } = await supabase.from('announcements').insert({
      scope: annScope,
      course_id: annScope === 'course' ? annCourse || null : null,
      title: annTitle.trim(),
      body: annBody.trim() || null,
      created_by: user.id,
    })
    if (insErr) setNotice(insErr.message)
    else {
      setNotice('Pengumuman dibuat.')
      setAnnTitle('')
      setAnnBody('')
      await load()
    }
  }

  async function handleDeleteAnnouncement(id: string) {
    const { error: delErr } = await supabase.from('announcements').delete().eq('id', id)
    if (delErr) setNotice(delErr.message)
    else {
      setNotice('Pengumuman dihapus.')
      await load()
    }
  }

  return (
    <div className="page">
      <PageHeader
        icon="admin"
        title="Admin Panel"
        subtitle={
          <>
            <Link to="/admin/moderasi">Moderasi &amp; Audit Log</Link> ·{' '}
            <Link to="/admin/diskusi-mentor">Diskusi Admin ↔ Mentor</Link> ·{' '}
            <Link to="/admin/rps">Editor RPS</Link>
          </>
        }
      />
      {notice && <p className="notice-box">{notice}</p>}

      <section className="section">
        <h2>Ringkasan</h2>
        <dl className="profile-list">
          <div><dt>Pengguna</dt><dd>{counts.users} (Siswa {counts.siswa} · Mentor {counts.mentor})</dd></div>
          <div><dt>Course</dt><dd>{counts.courses}</dd></div>
          <div><dt>Enrollment</dt><dd>{counts.enrollments}</dd></div>
          <div><dt>Lamaran mentor pending</dt><dd>{counts.pendingApps}</dd></div>
          <div><dt>Laporan diskusi terbuka</dt><dd>{counts.openReports}</dd></div>
        </dl>
      </section>

      <section className="section">
        <h2>Lamaran Mentor ({apps.length} pending)</h2>
        {apps.length === 0 ? <p className="empty">Tidak ada lamaran mentor yang menunggu.</p> : (
          <ul className="discussion-list">
            {apps.map((a) => (
              <li key={a.id} className="discussion-item">
                <p><strong>{names.get(a.user_id) ?? 'Pelamar'}</strong></p>
                <p>Keahlian: {a.expertise ?? '—'}</p>
                <p>Pengalaman: {a.experience ?? '—'}</p>
                {a.portfolio_link && <p><a href={a.portfolio_link} target="_blank" rel="noreferrer">Portofolio</a></p>}
                <div className="form-actions">
                  <button type="button" className="btn btn-primary btn-small" onClick={() => void decideApp(a, true)}>Setujui</button>
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => void decideApp(a, false)}>Tolak</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Klaim Mengampu ({claims.length} pending)</h2>
        {claims.length === 0 ? <p className="empty">Tidak ada klaim mengampu yang menunggu.</p> : (
          <ul>
            {claims.map((c) => (
              <li key={c.id}>
                {courses.find((x) => x.id === c.course_id)?.title ?? 'Course'} — {names.get(c.mentor_id) ?? 'Mentor'}{' '}
                <button type="button" className="btn btn-primary btn-small" onClick={() => void decideClaim(c, true)}>Setujui</button>{' '}
                <button type="button" className="btn btn-ghost btn-small" onClick={() => void decideClaim(c, false)}>Tolak</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Pembagian Mentor Kurikulum &amp; Buat Course</h2>
        <form className="form" onSubmit={handleAssignMentor}>
          <label>
            Course
            <select value={assignCourse} onChange={(e) => setAssignCourse(e.target.value)} required style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}>
              <option value="">— Pilih course —</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title} {c.mentor_id ? `(mentor: ${names.get(c.mentor_id) ?? ''})` : '(tanpa mentor)'}</option>)}
            </select>
          </label>
          <label>
            Mentor (kosong = lepas mentor)
            <select value={assignMentor} onChange={(e) => setAssignMentor(e.target.value)} style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}>
              <option value="">— Tanpa mentor —</option>
              {mentors.map((m) => <option key={m.id} value={m.id}>{m.name ?? 'Mentor'}</option>)}
            </select>
          </label>
          <button type="submit" className="btn btn-primary">Tetapkan Mentor</button>
        </form>
        <form className="form" onSubmit={handleCreateCourse}>
          <label>Judul course baru<input value={newCourseTitle} onChange={(e) => setNewCourseTitle(e.target.value)} required /></label>
          <label>Deskripsi<textarea value={newCourseDesc} onChange={(e) => setNewCourseDesc(e.target.value)} rows={2} /></label>
          <label>Kategori<input value={newCourseCategory} onChange={(e) => setNewCourseCategory(e.target.value)} placeholder="Mis. Penyutradaraan" /></label>
          <button type="submit" className="btn btn-primary">Buat Course (tanpa mentor)</button>
        </form>
      </section>

      <section className="section">
        <h2>Verifikasi Sekolah</h2>
        {schools.length === 0 ? <p className="empty">Belum ada sekolah.</p> : (
          <ul>
            {schools.map((s) => (
              <li key={s.id}>
                {s.name} — {s.is_verified ? 'Terverifikasi' : 'Belum terverifikasi'}{' '}
                <button type="button" className="btn btn-ghost btn-small" onClick={() => void handleVerifySchool(s, !s.is_verified)}>
                  {s.is_verified ? 'Batalkan Verifikasi' : 'Verifikasi'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Usulan Komunitas ({proposals.length} pending)</h2>
        {proposals.length === 0 ? <p className="empty">Tidak ada usulan komunitas yang menunggu.</p> : (
          <ul>
            {proposals.map((p) => (
              <li key={p.id}>
                <strong>{p.name}</strong> — {p.description ?? ''} (pengusul: {names.get(p.proposer_id) ?? '—'}){' '}
                <button type="button" className="btn btn-primary btn-small" onClick={() => void decideProposal(p, true)}>Setujui &amp; Buat</button>{' '}
                <button type="button" className="btn btn-ghost btn-small" onClick={() => void decideProposal(p, false)}>Tolak</button>
              </li>
            ))}
          </ul>
        )}
        <h3>Semua Komunitas</h3>
        <ul>
          {communities.map((c) => (
            <li key={c.id}>
              {c.name}{' '}
              <button type="button" className="btn btn-ghost btn-small" onClick={() => void handleDeleteCommunity(c.id, c.name)}>Hapus Komunitas</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <h2>Pengumuman</h2>
        <form className="form" onSubmit={handleCreateAnnouncement}>
          <label>Judul<input value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} required /></label>
          <label>Isi<textarea value={annBody} onChange={(e) => setAnnBody(e.target.value)} rows={3} /></label>
          <label>
            Cakupan
            <select value={annScope} onChange={(e) => setAnnScope(e.target.value as 'platform' | 'course')} style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}>
              <option value="platform">Platform (semua pengguna)</option>
              <option value="course">Course tertentu</option>
            </select>
          </label>
          {annScope === 'course' && (
            <label>
              Course
              <select value={annCourse} onChange={(e) => setAnnCourse(e.target.value)} required style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}>
                <option value="">— Pilih course —</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
          )}
          <button type="submit" className="btn btn-primary">Buat Pengumuman</button>
        </form>
        <ul>
          {announcements.map((a) => (
            <li key={a.id}>
              {a.title} ({a.scope}){' '}
              <button type="button" className="btn btn-ghost btn-small" onClick={() => void handleDeleteAnnouncement(a.id)}>Hapus</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <h2>Progress Lengkap — Siswa</h2>
        {progress.length === 0 ? <p className="empty">Belum ada siswa.</p> : (
          <div className="grade-table-wrap">
            <table className="grade-table">
              <thead><tr><th>Siswa</th><th>Course Diambil</th><th>Lesson Selesai</th><th>Sedang Berjalan</th></tr></thead>
              <tbody>
                {progress.map((p) => (
                  <tr key={p.userId}>
                    <td>{p.name}</td>
                    <td>{p.courses}</td>
                    <td>{p.completed}</td>
                    <td>{p.inProgress}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h2 style={{ marginTop: '1rem' }}>Beban Mentor</h2>
        {mentorLoad.length === 0 ? <p className="empty">Belum ada mentor.</p> : (
          <ul>
            {mentorLoad.map((m) => (
              <li key={m.name}>{m.name} — {m.courses} course · {m.pending} submission menunggu penilaian</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
