// SINEVERSE — Admin Panel (role admin only, route-guarded di App.tsx):
// ringkasan, lamaran mentor (setujui/tolak — persetujuan mengubah peran
// lewat trigger database, aplikasi TIDAK PERNAH mengubah profiles.role
// dari client), klaim mengampu + pembagian mentor kurikulum, verifikasi
// sekolah, usulan komunitas + hapus komunitas, pengumuman, progress lengkap.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { countUsersByRole, userBreakdownLabel } from '../lib/counts'
import { fmtDate } from '../lib/guarded'
import { fetchMentorGroupSummary } from '../lib/mentorGroup'
import type { MentorGroupSummary } from '../lib/mentorGroup'
import {
  ANNOUNCEMENT_TARGETS,
  announcementStatusLabel,
  announcementTargetLabel,
  announcementTargetNeedsCourse,
  createAnnouncement,
  deleteAnnouncement,
  signedAnnouncementUrl,
  updateAnnouncement,
} from '../lib/announcements'
import type { AnnouncementTarget } from '../lib/announcements'
import { decideMentorApplication, decideSchoolSubmission, fetchCourses, fetchMentorApplications, fetchProfileNames, fetchProvinces, fetchRefNameMap, fetchRegencies, fetchSchoolSubmissions, invalidateCatalogCache, logAudit, sendNotification, supabase } from '../lib/supabase'
import type { Announcement, CommunityProposal, Course, CourseClaim, MentorApplication, RefProvince, RefRegency, School, SchoolSubmission } from '../lib/types'
import PageHeader from '../components/PageHeader'
import WorkspaceNav from '../components/WorkspaceNav'
import { ADMIN_NAV } from '../lib/workspaceNav'

// Direktori sekolah (Verifikasi Sekolah): 20 baris per halaman.
const SCHOOL_PAGE_SIZE = 20

/** ISO timestamptz -> nilai input datetime-local (waktu lokal, YYYY-MM-DDTHH:mm). */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface ProgressRow {
  userId: string
  name: string
  courses: number
  completed: number
  inProgress: number
}

// Status lamaran mentor dalam Bahasa Indonesia (bukan mentah "pending").
function mentorStatusLabel(status: string): string {
  if (status === 'pending') return 'Menunggu persetujuan'
  if (status === 'approved') return 'Disetujui'
  if (status === 'rejected') return 'Ditolak'
  if (status === 'revision_required') return 'Diminta revisi'
  return status
}

// Status pengajuan sekolah dalam Bahasa Indonesia.
function schoolSubmissionStatusLabel(status: string): string {
  if (status === 'pending') return 'Menunggu'
  if (status === 'approved') return 'Disetujui'
  if (status === 'rejected') return 'Ditolak'
  return status
}

// Beban mentor (jumlah course + submission belum dinilai) untuk SEMUA mentor
// sekaligus: rantai batch 4 query (modules → lessons → assignments →
// submissions belum dinilai), lalu dihitung per course di JS.
// Sebelumnya: 4 query SEQUENTIAL per course, di dalam loop per mentor.
async function fetchMentorLoad(
  mentors: { id: string; name: string | null }[],
  courseList: Course[],
): Promise<{ name: string; courses: number; pending: number }[]> {
  const mentorIds = new Set(mentors.map((m) => m.id))
  const mentorCourses = courseList.filter((c) => c.mentor_id && mentorIds.has(c.mentor_id))
  const pendingByCourse = new Map<string, number>()
  if (mentorCourses.length > 0) {
    const { data: mods } = await supabase
      .from('modules')
      .select('id,course_id')
      .in('course_id', mentorCourses.map((c) => c.id))
    const modRows = (mods ?? []) as { id: string; course_id: string }[]
    const modCourse = new Map(modRows.map((m) => [m.id, m.course_id]))
    if (modRows.length > 0) {
      const { data: lessons } = await supabase
        .from('lessons')
        .select('id,module_id')
        .in('module_id', modRows.map((m) => m.id))
      const lessonRows = (lessons ?? []) as { id: string; module_id: string }[]
      const lessonCourse = new Map(lessonRows.map((l) => [l.id, modCourse.get(l.module_id) ?? '']))
      if (lessonRows.length > 0) {
        const { data: assigns } = await supabase
          .from('assignments')
          .select('id,lesson_id')
          .in('lesson_id', lessonRows.map((l) => l.id))
        const assignRows = (assigns ?? []) as { id: string; lesson_id: string }[]
        const assignCourse = new Map(assignRows.map((a) => [a.id, lessonCourse.get(a.lesson_id) ?? '']))
        if (assignRows.length > 0) {
          const { data: subs } = await supabase
            .from('submissions')
            .select('assignment_id')
            .in('assignment_id', assignRows.map((a) => a.id))
            .is('score', null)
          for (const s of (subs ?? []) as { assignment_id: string }[]) {
            const cid = assignCourse.get(s.assignment_id)
            if (!cid) continue
            pendingByCourse.set(cid, (pendingByCourse.get(cid) ?? 0) + 1)
          }
        }
      }
    }
  }
  return mentors.map((m) => {
    const mine = courseList.filter((c) => c.mentor_id === m.id)
    let pending = 0
    for (const c of mine) pending += pendingByCourse.get(c.id) ?? 0
    return { name: m.name ?? 'Mentor', courses: mine.length, pending }
  })
}

export default function AdminPage() {
  const { user, profile } = useAuth()
  const location = useLocation()
  const [counts, setCounts] = useState({ users: 0, siswa: 0, mentor: 0, admin: 0, courses: 0, enrollments: 0, pendingApps: 0, openReports: 0 })
  const [apps, setApps] = useState<MentorApplication[]>([])
  const [claims, setClaims] = useState<CourseClaim[]>([])
  // Penolakan klaim meminta alasan (migrasi 022: decision_note).
  const [rejectingClaimId, setRejectingClaimId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  // Pengajuan sekolah manual + nama wilayah untuk tampilannya (migrasi 027).
  const [schoolSubs, setSchoolSubs] = useState<SchoolSubmission[]>([])
  const [provinceNames, setProvinceNames] = useState<Map<string, string>>(new Map())
  const [regencyNames, setRegencyNames] = useState<Map<string, string>>(new Map())
  // Tab filter lamaran mentor (jumlah asli dari apps, termasuk 0).
  // LC10: default "Semua" — sebelumnya "Menunggu (0)" terpilih padahal
  // kosong, sehingga satu-satunya lamaran (Disetujui) tersembunyi.
  const [appTab, setAppTab] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'revision_required'>('all')
  // Ringkasan Ruang Komunikasi Mentor (Fase 1, migrasi 060/061).
  const [groupSummary, setGroupSummary] = useState<MentorGroupSummary | null>(null)
  const [groupSummaryFailed, setGroupSummaryFailed] = useState(false)
  // Penolakan/revisi lamaran mentor meminta catatan (migrasi 027).
  const [appAction, setAppAction] = useState<{ id: string; kind: 'reject' | 'revision' } | null>(null)
  const [appNote, setAppNote] = useState('')
  // Penolakan pengajuan sekolah meminta alasan (migrasi 027).
  const [rejectingSubId, setRejectingSubId] = useState<string | null>(null)
  const [subNote, setSubNote] = useState('')
  const [courses, setCourses] = useState<Course[]>([])
  // Direktori sekolah (Verifikasi Sekolah): TIDAK lagi memuat 1.000 baris
  // sekaligus seperti sebelumnya — daftar difilter di server (provinsi /
  // kab-kota / status / pencarian nama atau NPSN) dan dipaginasi 20 per
  // halaman. schools.province / schools.regency menyimpan NAMA referensi
  // (bukan kode), jadi filter memakai nama; select menyimpan kode hanya
  // untuk menjalankan cascade kab/kota.
  const [provinces, setProvinces] = useState<RefProvince[]>([])
  const [regencies, setRegencies] = useState<RefRegency[]>([])
  const [schoolSearch, setSchoolSearch] = useState('')
  const [schoolSearchDebounced, setSchoolSearchDebounced] = useState('')
  const [schoolProvince, setSchoolProvince] = useState('') // kode provinsi
  const [schoolRegency, setSchoolRegency] = useState('') // kode kab/kota
  const [schoolStatus, setSchoolStatus] = useState<'all' | 'verified' | 'unverified'>('all')
  const [schoolPage, setSchoolPage] = useState(0)
  const [schoolRows, setSchoolRows] = useState<School[]>([])
  const [schoolTotal, setSchoolTotal] = useState(0)
  const [schoolLoading, setSchoolLoading] = useState(true)
  const [schoolError, setSchoolError] = useState<string | null>(null)
  const [proposals, setProposals] = useState<CommunityProposal[]>([])
  // K11: kunci klik ganda "Setujui & Buat" — tanpa ini dua klik cepat
  // membuat dua komunitas bernama sama + dua baris anggota + dua audit log.
  const [decidingProposalId, setDecidingProposalId] = useState<string | null>(null)
  const [communities, setCommunities] = useState<{ id: string; name: string }[]>([])
  // Hapus komunitas memakai konfirmasi dua langkah di dalam halaman
  // (bukan window.confirm — dialog bawaan browser tidak muncul di
  // semua lingkungan dan tidak enak di HP).
  const [confirmDeleteCommunityId, setConfirmDeleteCommunityId] = useState<string | null>(null)
  const [progress, setProgress] = useState<ProgressRow[]>([])
  const [mentorLoad, setMentorLoad] = useState<{ name: string; courses: number; pending: number }[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  // Foto profil pelamar untuk avatar kartu lamaran (diambil dari query
  // profiles yang sama, tanpa query tambahan).
  const [photos, setPhotos] = useState<Map<string, string | null>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [annTitle, setAnnTitle] = useState('')
  const [annBody, setAnnBody] = useState('')
  // Fase 4 (067): target menggantikan scope lama (scope diturunkan dari
  // target di lib). Plus jadwal terbit, pin, lampiran, dan mode edit.
  const [annTarget, setAnnTarget] = useState<AnnouncementTarget>('all_students')
  const [annCourse, setAnnCourse] = useState('')
  const [annPublishAt, setAnnPublishAt] = useState('')
  const [annPinned, setAnnPinned] = useState(false)
  const [annFile, setAnnFile] = useState<File | null>(null)
  const [annRemoveAttachment, setAnnRemoveAttachment] = useState(false)
  const [editingAnn, setEditingAnn] = useState<Announcement | null>(null)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [newCourseTitle, setNewCourseTitle] = useState('')
  const [newCourseDesc, setNewCourseDesc] = useState('')
  const [newCourseCategory, setNewCourseCategory] = useState('')
  // LB10: Buat Course kini punya mentor + level; setelah dibuat, admin
  // langsung diarahkan ke Course Builder course itu (bukan form minimal
  // yang berhenti di "tanpa mentor").
  const [newCourseMentor, setNewCourseMentor] = useState('')
  const [newCourseLevel, setNewCourseLevel] = useState('')
  const [createdCourseId, setCreatedCourseId] = useState<string | null>(null)
  // B65: satu kunci busy per aksi keputusan — tombol dinonaktifkan selama
  // proses supaya klik ganda tidak menjalankan aksi dua kali.
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [assignCourse, setAssignCourse] = useState('')
  const [assignMentor, setAssignMentor] = useState('')
  const [mentors, setMentors] = useState<{ id: string; name: string | null }[]>([])

  async function load() {
    try {
      // Semua fetch tingkat atas independen — jalankan paralel (Promise.all),
      // bukan 12 await berurutan seperti sebelumnya.
      // B61 (K13): .error tiap query DIPERIKSA — bila satu query gagal
      // (RLS/jaringan), panel menampilkan error-box, bukan "0 pengguna ·
      // 0 enrollment" yang menyamarkan kegagalan sebagai angka 0.
      // fetchCourses / fetchMentorApplications / fetchSchoolSubmissions
      // sudah melempar sendiri bila gagal.
      const [
        { data: profiles, error: profilesErr },
        { count: enrCount, error: enrCountErr },
        courseList,
        appData,
        { data: claimData, error: claimErr },
        { data: propData, error: propErr },
        { data: commData, error: commErr },
        { data: repData, error: repErr },
        { data: annData, error: annErr },
        { data: progData, error: progErr },
        { data: enrData, error: enrRowsErr },
        subData,
      ] = await Promise.all([
        supabase.from('profiles').select('id,name,role,photo_url'),
        supabase.from('enrollments').select('id', { count: 'exact', head: true }),
        fetchCourses(),
        fetchMentorApplications(),
        supabase.from('course_claims').select('*').order('created_at', { ascending: false }),
        supabase.from('community_proposals').select('*').eq('status', 'pending').order('created_at'),
        supabase.from('communities').select('id,name').order('name'),
        supabase.from('discussion_reports').select('id').eq('status', 'open'),
        supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('lesson_progress').select('user_id,status'),
        supabase.from('enrollments').select('user_id,course_id'),
        fetchSchoolSubmissions(),
      ])
      const failedSources = (
        [
          ['profil', profilesErr],
          ['enrollment (hitung)', enrCountErr],
          ['klaim course', claimErr],
          ['usulan komunitas', propErr],
          ['komunitas', commErr],
          ['laporan diskusi', repErr],
          ['pengumuman', annErr],
          ['progres lesson', progErr],
          ['enrollment (baris)', enrRowsErr],
        ] as const
      )
        .filter(([, e]) => e)
        .map(([name, e]) => `${name} (${e?.message ?? 'gagal'})`)
      if (failedSources.length > 0) {
        throw new Error(`Gagal memuat Admin Panel: ${failedSources.join('; ')}.`)
      }
      const profs = (profiles ?? []) as { id: string; name: string | null; role: string; photo_url: string | null }[]
      const mentors = profs.filter((p) => p.role === 'mentor')
      // Nama profil, beban mentor, dan nama wilayah independen satu sama
      // lain — paralel.
      const [namesMap, loadRows, provMap, regMap] = await Promise.all([
        fetchProfileNames(profs.map((p) => p.id)),
        fetchMentorLoad(mentors, courseList),
        fetchRefNameMap('ref_provinces'),
        fetchRefNameMap('ref_regencies'),
      ])
      setNames(namesMap)
      setPhotos(new Map(profs.map((p) => [p.id, p.photo_url ?? null])))
      setProvinceNames(provMap)
      setRegencyNames(regMap)
      // K13: hitung pengguna lewat helper bersama (lib/counts.ts) supaya
      // angka yang sama di Beranda admin, Analitik, dan halaman ini
      // didefinisikan satu kali.
      const roleCounts = countUsersByRole(profs)
      setCounts({
        users: roleCounts.total,
        siswa: roleCounts.siswa,
        mentor: roleCounts.mentor,
        admin: roleCounts.admin,
        courses: courseList.length,
        enrollments: enrCount ?? 0,
        pendingApps: appData.filter((a) => a.status === 'pending').length,
        openReports: (repData ?? []).length,
      })
      setApps(appData)
      setSchoolSubs(subData)
      setClaims((claimData ?? []) as CourseClaim[])
      setCourses(courseList)
      setProposals((propData ?? []) as CommunityProposal[])
      setCommunities((commData ?? []) as { id: string; name: string }[])
      setAnnouncements((annData ?? []) as Announcement[])
      setMentors(profs.filter((p) => p.role === 'mentor').map((p) => ({ id: p.id, name: p.name })))
      const liveCourseIds = new Set(courseList.map((c) => c.id))
      const rows: ProgressRow[] = profs
        .filter((p) => p.role === 'siswa')
        .map((p) => {
          const myProg = ((progData ?? []) as { user_id: string; status: string }[]).filter((r) => r.user_id === p.id)
          return {
            userId: p.id,
            name: p.name ?? 'Siswa',
            // Hanya hitung enrollment yang coursenya masih ada — baris
            // enrollment yatim (course sudah tidak ada) tidak dihitung,
            // supaya angkanya sama dengan yang tampil di Akademi.
            courses: ((enrData ?? []) as { user_id: string; course_id: string }[]).filter(
              (e) => e.user_id === p.id && liveCourseIds.has(e.course_id),
            ).length,
            completed: myProg.filter((r) => r.status === 'completed').length,
            inProgress: myProg.filter((r) => r.status === 'in_progress').length,
          }
        })
      setProgress(rows)
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

  // Ringkasan grup mentor dimuat terpisah dan TIDAK boleh merusak panel:
  // bila migrasi 060/061 belum ada, kartu menampilkan pesan jujur.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    fetchMentorGroupSummary(user.id)
      .then((s) => {
        if (!cancelled) setGroupSummary(s)
      })
      .catch(() => {
        if (!cancelled) setGroupSummaryFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [user?.id])

  // Lompat ke section bila dibuka lewat tautan hash dari Beranda admin
  // (mis. /admin#lamaran-mentor) — setelah data selesai dimuat.
  useEffect(() => {
    if (loading || !location.hash) return
    const el = document.querySelector(location.hash)
    if (el) el.scrollIntoView()
  }, [loading, location.hash])

  // Daftar provinsi untuk filter direktori sekolah (di-cache).
  useEffect(() => {
    let cancelled = false
    void fetchProvinces().then((rows) => { if (!cancelled) setProvinces(rows) })
    return () => { cancelled = true }
  }, [])

  // Daftar kab/kota mengikuti provinsi yang dipilih di filter.
  useEffect(() => {
    if (!schoolProvince) {
      setRegencies([])
      return
    }
    let cancelled = false
    void fetchRegencies(schoolProvince).then((rows) => { if (!cancelled) setRegencies(rows) })
    return () => { cancelled = true }
  }, [schoolProvince])

  // Pencarian sekolah (nama/NPSN) didebounce 300 ms supaya tiap ketikan
  // tidak langsung menembak database.
  useEffect(() => {
    const t = setTimeout(() => setSchoolSearchDebounced(schoolSearch), 300)
    return () => clearTimeout(t)
  }, [schoolSearch])

  // Direktori sekolah: difilter di server + dipaginasi. Berjalan tiap
  // filter/halaman berubah; provinsi dan kab/kota difilter berdasarkan
  // NAMA referensi yang tersimpan di schools.province / schools.regency.
  useEffect(() => {
    let cancelled = false
    setSchoolLoading(true)
    setSchoolError(null)
    const provinceName = provinces.find((p) => p.code === schoolProvince)?.name
    const regencyName = regencies.find((r) => r.code === schoolRegency)?.name
    let query = supabase.from('schools').select('*', { count: 'exact' })
    if (provinceName) query = query.eq('province', provinceName)
    if (regencyName) query = query.eq('regency', regencyName)
    if (schoolStatus !== 'all') query = query.eq('is_verified', schoolStatus === 'verified')
    const q = schoolSearchDebounced.trim()
    if (q.length > 0) {
      const safe = q.replace(/[%(),]/g, '')
      const npsnQ = q.replace(/\D/g, '')
      const orParts = [`name.ilike.%${safe}%`]
      if (npsnQ) orParts.push(`npsn.eq.${npsnQ}`)
      query = query.or(orParts.join(','))
    }
    void query
      .order('name')
      .range(schoolPage * SCHOOL_PAGE_SIZE, schoolPage * SCHOOL_PAGE_SIZE + SCHOOL_PAGE_SIZE - 1)
      .then(({ data, count, error: qErr }) => {
        if (cancelled) return
        if (qErr) setSchoolError(qErr.message)
        else {
          setSchoolRows((data ?? []) as School[])
          setSchoolTotal(count ?? 0)
        }
        setSchoolLoading(false)
      })
    return () => { cancelled = true }
  }, [provinces, regencies, schoolProvince, schoolRegency, schoolStatus, schoolSearchDebounced, schoolPage])

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

  async function decideApp(
    app: MentorApplication,
    decision: 'approved' | 'rejected' | 'revision_required',
    note = '',
  ) {
    if (!user) return
    // B65: tolak pemanggilan kedua selagi satu keputusan masih berjalan.
    const key = `app-${app.id}-${decision}`
    if (busyKey) return
    setBusyKey(key)
    try {
      // Hanya status + catatan yang diubah dari client. Trigger
      // promote_mentor_on_approval di database yang mengubah profiles.role
      // menjadi 'mentor' saat lamaran disetujui.
      try {
        await decideMentorApplication(app, decision, note, user.id)
      } catch (err) {
        setNotice(err instanceof Error ? err.message : 'Gagal menyimpan keputusan. Coba lagi.')
        return
      }
      const action =
        decision === 'approved'
          ? 'mentor_application.approved'
          : decision === 'rejected'
            ? 'mentor_application.rejected'
            : 'mentor_application.revision_required'
      await logAudit(action, 'mentor_applications', app.id, { user_id: app.user_id })
      setNotice(
        decision === 'approved'
          ? 'Lamaran mentor disetujui. Peran diubah menjadi mentor oleh trigger database.'
          : decision === 'rejected'
            ? 'Lamaran mentor ditolak. Alasan tersimpan dan terlihat oleh pelamar.'
            : 'Lamaran diminta revisi. Catatan tersimpan dan terlihat oleh pelamar.',
      )
      setAppAction(null)
      setAppNote('')
      await load()
    } finally {
      setBusyKey(null)
    }
  }

  async function decideSub(sub: SchoolSubmission, decision: 'approved' | 'rejected', note = '') {
    if (!user) return
    // B65: kunci busy per baris keputusan.
    const key = `sub-${sub.id}-${decision}`
    if (busyKey) return
    setBusyKey(key)
    try {
      // Setujui: sekolah dibuat (bila belum ada yang cocok) lalu ditautkan
      // ke pengajuan + profil pengaju. Tolak: alasan tersimpan.
      try {
        await decideSchoolSubmission(sub, decision, note, user.id)
      } catch (err) {
        setNotice(err instanceof Error ? err.message : 'Gagal menyimpan keputusan. Coba lagi.')
        return
      }
      await logAudit(
        decision === 'approved' ? 'school_submission.approved' : 'school_submission.rejected',
        'school_submissions',
        sub.id,
        { user_id: sub.user_id },
      )
      setNotice(
        decision === 'approved'
          ? 'Pengajuan sekolah disetujui — sekolah ditambahkan dan ditautkan ke pengaju.'
          : 'Pengajuan sekolah ditolak. Alasan tersimpan dan terlihat oleh pengaju.',
      )
      setRejectingSubId(null)
      setSubNote('')
      await load()
    } finally {
      setBusyKey(null)
    }
  }

  /**
   * Beri tahu pendaftar waitlist bahwa course sudah memiliki mentor dan
   * bisa mulai dikerjakan (best-effort; gagal kirim tidak membatalkan
   * penetapan mentor).
   */
  async function notifyWaitlist(courseId: string, courseTitle: string) {
    try {
      const { data } = await supabase.from('waitlist').select('user_id').eq('course_id', courseId)
      const rows = (data ?? []) as { user_id: string }[]
      await Promise.all(rows.map((w) =>
        sendNotification(
          w.user_id,
          'mentor_assigned',
          `Mentor ditugaskan: ${courseTitle}`,
          `Course "${courseTitle}" sudah memiliki mentor dan bisa mulai dikerjakan.`,
          { course_id: courseId },
        ).catch(() => undefined),
      ))
    } catch {
      // Best-effort saja.
    }
  }

  async function decideClaim(claim: CourseClaim, approve: boolean, note?: string) {
    // P74: klaim tidak bisa disetujui bila course sudah bermentor atau
    // pengaju bukan mentor — jangan tandai "Disetujui" tanpa penetapan.
    if (approve) {
      const targetCourse = courses.find((x) => x.id === claim.course_id)
      const applicantIsMentor = mentors.some((m) => m.id === claim.mentor_id)
      if (targetCourse?.mentor_id || !applicantIsMentor) {
        setNotice(
          'Klaim ini tidak bisa disetujui: ' +
            (targetCourse?.mentor_id
              ? 'course sudah memiliki mentor.'
              : 'pengaju bukan mentor.'),
        )
        return
      }
    }
    // B65: kunci busy per baris klaim.
    const key = `claim-${claim.id}-${approve ? 'approved' : 'rejected'}`
    if (busyKey) return
    setBusyKey(key)
    try {
      const reason = (note ?? '').trim()
      const { error: updErr } = await supabase
        .from('course_claims')
        .update({
          status: approve ? 'approved' : 'rejected',
          decided_by: user?.id ?? null,
          // Alasan penolakan tersimpan (migrasi 022) dan terlihat oleh mentor.
          decision_note: approve ? null : (reason || null),
        })
        .eq('id', claim.id)
      if (updErr) {
        setNotice(updErr.message)
        return
      }
      await logAudit(approve ? 'course_claim.approved' : 'course_claim.rejected', 'course_claims', claim.id, { course_id: claim.course_id, mentor_id: claim.mentor_id })
      if (approve) {
        // Belt-and-braces di samping trigger migrasi 022: tetapkan mentor
        // langsung dari client juga — tapi dengan dua syarat yang sama
        // seperti trigger: pengaju harus ber-peran mentor, dan course
        // masih tanpa mentor (update bersyarat .is('mentor_id', null)).
        // Notifikasi persetujuan + notifikasi waitlist dikirim oleh
        // trigger database, jadi client TIDAK mengirimnya lagi
        // (menghindari notifikasi ganda).
        const course = courses.find((x) => x.id === claim.course_id)
        const isMentorClaim = mentors.some((m) => m.id === claim.mentor_id)
        if (course && isMentorClaim && !course.mentor_id) {
          const { error: assignErr } = await supabase
            .from('courses')
            .update({ mentor_id: claim.mentor_id })
            .eq('id', claim.course_id)
            .is('mentor_id', null)
          if (assignErr) {
            setNotice(`Klaim disetujui, tetapi penetapan mentor gagal: ${assignErr.message}. Tetapkan manual di "Pembagian Mentor Kurikulum" di bawah.`)
          } else {
            invalidateCatalogCache()
            setNotice('Klaim mengampu disetujui. Mentor otomatis ditetapkan untuk course ini.')
          }
        } else if (course?.mentor_id) {
          setNotice('Klaim disetujui, tetapi course ini sudah memiliki mentor — penetapan tidak diubah.')
        } else {
          setNotice('Klaim disetujui, tetapi pengaju bukan mentor — course tetap tanpa mentor.')
        }
      } else {
        // Penolakan tidak disentuh trigger: client yang memberi tahu mentor.
        await sendNotification(
          claim.mentor_id,
          'claim_rejected',
          'Pengajuan mengampu ditolak',
          reason ? `Alasan: ${reason}` : 'Pengajuan mengampu kamu ditolak admin.',
          { course_id: claim.course_id, claim_id: claim.id },
        ).catch(() => undefined)
        setNotice('Klaim mengampu ditolak.' + (reason ? ' Alasan tersimpan dan terlihat oleh mentor.' : ''))
      }
      setRejectingClaimId(null)
      setRejectReason('')
      await load()
    } finally {
      setBusyKey(null)
    }
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
      invalidateCatalogCache()
      if (assignMentor) {
        const assignedCourse = courses.find((x) => x.id === assignCourse)
        if (assignedCourse) await notifyWaitlist(assignCourse, assignedCourse.title)
      }
      setNotice(assignMentor ? 'Mentor ditetapkan untuk course ini.' : 'Mentor dilepas — course kembali tanpa mentor.')
      setAssignCourse('')
      setAssignMentor('')
      await load()
    }
  }

  async function handleCreateCourse(e: FormEvent) {
    e.preventDefault()
    if (!newCourseTitle.trim()) return
    // LB10: mentor + level ikut tersimpan saat buat (bukan lagi "tanpa
    // mentor" saja); durasi tidak ada kolomnya di tabel courses — isi
    // konten/durasi diatur dari Course Builder setelah course dibuat.
    const { data, error: insErr } = await supabase.from('courses').insert({
      title: newCourseTitle.trim(),
      description: newCourseDesc.trim() || null,
      category: newCourseCategory.trim() || null,
      mentor_id: newCourseMentor || null,
      level: newCourseLevel || null,
    }).select('id').single()
    if (insErr) setNotice(insErr.message)
    else {
      invalidateCatalogCache()
      const newId = (data as { id: string } | null)?.id ?? null
      setCreatedCourseId(newId)
      setNotice(
        newCourseMentor
          ? 'Course baru dibuat dengan mentor. Lengkapi section, lesson, dan durasi dari Course Builder.'
          : 'Course baru dibuat (tanpa mentor — mentor bisa mengajukan lewat "Ajukan untuk Mengampu"). Lengkapi konten dari Course Builder.',
      )
      setNewCourseTitle('')
      setNewCourseDesc('')
      setNewCourseCategory('')
      setNewCourseMentor('')
      setNewCourseLevel('')
      await load()
    }
  }

  async function handleVerifySchool(school: School, verify: boolean) {
    // P66: "Batalkan Verifikasi" minta konfirmasi dulu (verifikasi biasa
    // tetap langsung). Bila baris terakhir di halaman ini keluar dari
    // filter, turun satu halaman supaya halaman tidak kosong.
    if (!verify && !window.confirm(`Batalkan verifikasi "${school.name}"? Sekolah ini tidak lagi tampil sebagai terverifikasi.`)) return
    const { error: updErr } = await supabase.from('schools').update({ is_verified: verify }).eq('id', school.id)
    if (updErr) setNotice(updErr.message)
    else {
      await logAudit(verify ? 'school.verified' : 'school.unverified', 'schools', school.id, {})
      // Perbarui baris di tempat — tanpa memuat ulang seluruh Admin
      // Panel. Bila status baru tidak lagi cocok dengan filter status
      // yang aktif, baris keluar dari daftar (total ikut berkurang).
      const stillMatches = schoolStatus === 'all' || (schoolStatus === 'verified') === verify
      if (stillMatches) {
        setSchoolRows((rows) => rows.map((r) => (r.id === school.id ? { ...r, is_verified: verify } : r)))
      } else {
        const remaining = schoolRows.filter((r) => r.id !== school.id)
        setSchoolRows(remaining)
        setSchoolTotal((t) => Math.max(0, t - 1))
        if (remaining.length === 0 && schoolPage > 0) setSchoolPage((p) => Math.max(0, p - 1))
      }
      setNotice(`Sekolah ${school.name} ${verify ? 'diverifikasi' : 'batal diverifikasi'}.`)
    }
  }

  async function decideProposal(p: CommunityProposal, approve: boolean) {
    // K11: tolak pemanggilan kedua selagi satu keputusan masih berjalan,
    // dan hanya putuskan usulan yang masih pending (pengaman lintas tab).
    if (decidingProposalId) return
    setDecidingProposalId(p.id)
    try {
      const { data: updated, error: updErr } = await supabase
        .from('community_proposals')
        .update({ status: approve ? 'approved' : 'rejected', decided_by: user?.id ?? null })
        .eq('id', p.id)
        .eq('status', 'pending')
        .select('id')
      if (updErr) {
        setNotice(updErr.message)
        return
      }
      if (!updated || updated.length === 0) {
        setNotice('Usulan ini sudah diputuskan sebelumnya.')
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
        // K11: kegagalan insert anggota JANGAN ditelan — komunitas setengah
        // jadi harus dilaporkan keras, bukan dibiarkan tanpa anggota.
        const { error: mErr } = await supabase.from('community_members').insert({
          community_id: (comm as { id: string }).id,
          user_id: p.proposer_id,
          role: 'member',
        })
        if (mErr) {
          setNotice(
            `Komunitas "${p.name}" berhasil dibuat, tetapi pengusul gagal ditambahkan sebagai anggota: ${mErr.message}. Tambahkan pengusul dari halaman komunitas atau hapus komunitas ini dan putuskan ulang usulannya.`,
          )
          await load()
          return
        }
        await logAudit('community_proposal.approved', 'community_proposals', p.id, { community_id: (comm as { id: string }).id })
        setNotice(`Komunitas "${p.name}" dibuat dan pengusul langsung menjadi anggotanya.`)
      } else {
        setNotice('Usulan komunitas ditolak.')
      }
      await load()
    } finally {
      setDecidingProposalId(null)
    }
  }

  async function handleDeleteCommunity(id: string, name: string) {
    const { error: delErr } = await supabase.from('communities').delete().eq('id', id)
    setConfirmDeleteCommunityId(null)
    if (delErr) setNotice(delErr.message)
    else {
      await logAudit('community.deleted', 'communities', id, { name })
      invalidateCatalogCache()
      setNotice(`Komunitas "${name}" dihapus.`)
      await load()
    }
  }

  function resetAnnouncementForm() {
    setAnnTitle('')
    setAnnBody('')
    setAnnTarget('all_students')
    setAnnCourse('')
    setAnnPublishAt('')
    setAnnPinned(false)
    setAnnFile(null)
    setAnnRemoveAttachment(false)
    setEditingAnn(null)
  }

  /** Simpan pengumuman (buat baru atau edit) — draf atau terbitkan. */
  async function handleSaveAnnouncement(e: { preventDefault: () => void }, action: 'draft' | 'publish') {
    e.preventDefault()
    if (!user || !annTitle.trim()) return
    if (announcementTargetNeedsCourse(annTarget) && !annCourse) {
      setNotice('Pilih course dulu untuk target ini.')
      return
    }
    const publishAtIso = annPublishAt ? new Date(annPublishAt).toISOString() : null
    try {
      if (editingAnn) {
        const updated = await updateAnnouncement(editingAnn.id, user.id, {
          title: annTitle,
          body: annBody,
          target: annTarget,
          courseId: annCourse || null,
          file: annFile,
          removeAttachment: annRemoveAttachment && !annFile,
          publishAt: publishAtIso,
          publishAtTouched: true,
          isPinned: annPinned,
          action,
        })
        await logAudit(
          action === 'publish' ? 'announcement.published' : 'announcement.updated',
          'announcements',
          updated.id,
          { target: updated.target ?? null, status: updated.status ?? null },
        )
        setNotice(action === 'publish' ? 'Pengumuman diperbarui dan diterbitkan.' : 'Pengumuman diperbarui sebagai draf.')
      } else {
        const created = await createAnnouncement({
          userId: user.id,
          title: annTitle,
          body: annBody,
          target: annTarget,
          courseId: annCourse || null,
          file: annFile,
          publishAt: publishAtIso,
          isPinned: annPinned,
          action,
        })
        await logAudit(
          action === 'publish' ? 'announcement.published' : 'announcement.created',
          'announcements',
          created.id,
          { target: created.target ?? null, status: created.status ?? null },
        )
        setNotice(
          action === 'publish'
            ? (created.status === 'scheduled' ? 'Pengumuman terjadwal — akan terbit pada waktunya.' : 'Pengumuman diterbitkan.')
            : 'Pengumuman disimpan sebagai draf.',
        )
      }
      resetAnnouncementForm()
      await load()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal menyimpan pengumuman.')
    }
  }

  function handleEditAnnouncement(a: Announcement) {
    setEditingAnn(a)
    setAnnTitle(a.title)
    setAnnBody(a.body ?? '')
    setAnnTarget((a.target as AnnouncementTarget) ?? 'all_students')
    setAnnCourse(a.course_id ?? '')
    setAnnPublishAt(a.publish_at ? toLocalInputValue(a.publish_at) : '')
    setAnnPinned(a.is_pinned ?? false)
    setAnnFile(null)
    setAnnRemoveAttachment(false)
    document.getElementById('pengumuman')?.scrollIntoView({ behavior: 'smooth' })
  }

  async function handleDeleteAnnouncement(id: string) {
    // B65: kunci busy per pengumuman.
    const key = `ann-${id}`
    if (busyKey) return
    setBusyKey(key)
    try {
      await deleteAnnouncement(id)
      await logAudit('announcement.deleted', 'announcements', id, {})
      setNotice('Pengumuman dihapus.')
      await load()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal menghapus pengumuman.')
    } finally {
      setBusyKey(null)
    }
  }

  async function handleOpenAnnouncementAttachment(a: Announcement) {
    if (!a.attachment_path) return
    try {
      const url = await signedAnnouncementUrl(a.attachment_path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Lampiran tidak bisa dibuka saat ini.')
    }
  }

  // Jumlah lamaran per status (asli dari apps) + daftar yang tampil di tab aktif.
  const appTabCounts = {
    all: apps.length,
    pending: apps.filter((a) => a.status === 'pending').length,
    revision_required: apps.filter((a) => a.status === 'revision_required').length,
    approved: apps.filter((a) => a.status === 'approved').length,
    rejected: apps.filter((a) => a.status === 'rejected').length,
  }
  const visibleApps = appTab === 'all' ? apps : apps.filter((a) => a.status === appTab)

  return (
    <div className="page">
      <PageHeader
        icon="admin"
        title="Admin Panel"
        subtitle="Kelola pengguna, mentor, sekolah, course, komunitas, acara, dan platform."
      />
      <WorkspaceNav entries={ADMIN_NAV} />
      {notice && <p className="notice-box">{notice}</p>}

      <section className="section">
        <div className="dash-section-head"><h2>Ringkasan</h2><Link className="dash-more" to="/admin/pengguna">Lihat Semua →</Link></div>
        <dl className="profile-list">
          <div><dt>Pengguna</dt><dd>{userBreakdownLabel({ total: counts.users, siswa: counts.siswa, mentor: counts.mentor, admin: counts.admin, lain: 0 })}</dd></div>
          <div><dt>Course</dt><dd>{counts.courses}</dd></div>
          <div><dt>Pendaftaran (terdaftar)</dt><dd>{counts.enrollments}</dd></div>
          <div><dt>Lamaran mentor pending</dt><dd>{counts.pendingApps}</dd></div>
          <div><dt>Laporan diskusi terbuka</dt><dd>{counts.openReports}</dd></div>
        </dl>
      </section>

      <section className="section">
        <div className="dash-section-head"><h2>Kelola Academy</h2></div>
        <div className="admin-action-grid">
          <Link to="/admin/sections" className="btn btn-secondary">Section &amp; Lesson</Link>
          <Link to="/admin/enrollment" className="btn btn-secondary">Pendaftaran</Link>
          <Link to="/admin/tugas" className="btn btn-secondary">Monitoring Tugas</Link>
          <Link to="/admin/kuis" className="btn btn-secondary">Kelola Kuis</Link>
          <Link to="/admin/sertifikat" className="btn btn-secondary">Sertifikat</Link>
          <Link to="/admin/materi" className="btn btn-secondary">Materi</Link>
          <Link to="/admin/analitik" className="btn btn-secondary">Analitik</Link>
          {/* LB12: tombol ke-8 "Analitik Akademi" (halaman yang SUDAH ADA di
              /admin/analitik-akademi) — 8 tombol = baris 3,3,2 di grid 3 kolom,
              tidak ada lagi tombol sendirian selebar penuh di baris terakhir. */}
          <Link to="/admin/analitik-akademi" className="btn btn-secondary">Analitik Akademi</Link>
        </div>
      </section>

      {/* Ruang Komunikasi Mentor (Fase 1, migrasi 060/061) — grup resmi
          admin + mentor; ringkasan unread + pesan terakhir. */}
      <section className="section">
        <div className="dash-section-head"><h2>Ruang Komunikasi Mentor</h2></div>
        {groupSummaryFailed ? (
          <p className="muted">
            Ringkasan grup belum bisa dimuat — grup chat mentor belum aktif di server.
          </p>
        ) : !groupSummary ? (
          <p className="muted">Memuat ringkasan grup…</p>
        ) : (
          <>
            <p>
              {groupSummary.unread > 0
                ? `${groupSummary.unread} pesan belum dibaca.`
                : 'Semua pesan sudah dibaca.'}
            </p>
            {groupSummary.latest ? (
              <p className="muted">
                Terakhir dari {groupSummary.latest.senderName} ·{' '}
                {fmtDate(groupSummary.latest.createdAt)}: {groupSummary.latest.body.slice(0, 120)}
                {groupSummary.latest.body.length > 120 ? '…' : ''}
              </p>
            ) : (
              <p className="muted">Belum ada pesan di grup.</p>
            )}
          </>
        )}
        <p>
          <Link to="/komunitas-mentor" className="btn btn-primary">
            Buka Ruang Komunikasi Mentor
          </Link>
        </p>
      </section>

      <section className="section" id="lamaran-mentor">
        <div className="dash-section-head"><h2>Lamaran Mentor</h2></div>
        <div className="pill-tabs" role="tablist" aria-label="Filter lamaran mentor">
          <button type="button" className={appTab === 'all' ? 'pill-tab active' : 'pill-tab'} onClick={() => setAppTab('all')}>Semua ({appTabCounts.all})</button>
          <button type="button" className={appTab === 'pending' ? 'pill-tab active' : 'pill-tab'} onClick={() => setAppTab('pending')}>Menunggu ({appTabCounts.pending})</button>
          <button type="button" className={appTab === 'revision_required' ? 'pill-tab active' : 'pill-tab'} onClick={() => setAppTab('revision_required')}>Revisi ({appTabCounts.revision_required})</button>
          <button type="button" className={appTab === 'approved' ? 'pill-tab active' : 'pill-tab'} onClick={() => setAppTab('approved')}>Disetujui ({appTabCounts.approved})</button>
          <button type="button" className={appTab === 'rejected' ? 'pill-tab active' : 'pill-tab'} onClick={() => setAppTab('rejected')}>Ditolak ({appTabCounts.rejected})</button>
        </div>
        {visibleApps.length === 0 ? <p className="empty">{appTab === 'all' ? 'Belum ada lamaran mentor.' : 'Tidak ada lamaran mentor dengan status ini.'}</p> : (
          <ul className="list">
            {visibleApps.map((a) => {
              const applicantName = names.get(a.user_id) ?? 'Pelamar'
              const metaLine = [a.profession, (a.expertise ?? []).join(', ')].filter(Boolean).join(' · ')
              const statusPillClass = a.status === 'approved' ? 'pill-active' : a.status === 'rejected' ? 'task-deadline' : a.status === 'revision_required' ? 'task-deadline soon' : 'chip'
              return (
              <li key={a.id} className="post-card">
                <div className="post-head">
                  {photos.get(a.user_id) ? (
                    <img className="post-avatar" src={photos.get(a.user_id) as string} alt={applicantName} />
                  ) : (
                    <div className="post-avatar">{applicantName.charAt(0).toUpperCase()}</div>
                  )}
                  <div>
                    <p className="post-name">{applicantName}</p>
                    <p className="post-time">{metaLine || '—'} · {fmtDate(a.created_at)}</p>
                  </div>
                  <span className={statusPillClass} style={{ marginLeft: 'auto' }}>{mentorStatusLabel(a.status)}</span>
                </div>
                <div className="post-body">
                  <p>Pengalaman: {a.experience ?? '—'}</p>
                  {a.affiliation && <p>Sekolah/institusi afiliasi: {a.affiliation}</p>}
                  {a.portfolio_link && <p><a href={a.portfolio_link} target="_blank" rel="noreferrer">Portofolio</a></p>}
                  <p>Alasan: {a.reason ?? '—'}</p>
                  <p>Sukarela: {a.volunteer_agreed ? 'Ya, menyetujui pernyataan sukarela' : 'Belum menyetujui'}</p>
                  {a.decided_at && (
                    <p className="muted">
                      Diputuskan {fmtDate(a.decided_at)}
                      {a.decided_by ? ` oleh ${names.get(a.decided_by) ?? 'admin'}` : ''}
                      {a.decision_note ? ` — ${a.decision_note}` : ''}
                    </p>
                  )}
                </div>
                {a.status === 'pending' && (
                  <div className="form-actions">
                    <button type="button" className="btn btn-primary btn-small" disabled={busyKey !== null} onClick={() => void decideApp(a, 'approved')}>{busyKey === `app-${a.id}-approved` ? 'Memproses…' : 'Setujui'}</button>{' '}
                    {appAction?.id === a.id && appAction.kind === 'reject' ? (
                      <>
                        {/* B70: label textarea mengambil baris penuh sendiri
                            (flex 1 1 100%) supaya tidak terjepit di samping tombol. */}
                        <label style={{ flex: '1 1 100%' }}>
                          Alasan penolakan (wajib)
                          <textarea value={appNote} onChange={(e) => setAppNote(e.target.value)} rows={2} placeholder="Tulis alasan penolakan — terlihat oleh pelamar." />
                        </label>{' '}
                        <button type="button" className="btn btn-primary btn-small" disabled={!appNote.trim() || busyKey !== null} onClick={() => void decideApp(a, 'rejected', appNote)}>{busyKey === `app-${a.id}-rejected` ? 'Memproses…' : 'Konfirmasi Tolak'}</button>{' '}
                        <button type="button" className="btn btn-ghost btn-small" onClick={() => { setAppAction(null); setAppNote('') }}>Batal</button>
                      </>
                    ) : (
                      <button type="button" className="btn btn-ghost btn-small" disabled={busyKey !== null} onClick={() => { setAppAction({ id: a.id, kind: 'reject' }); setAppNote('') }}>Tolak</button>
                    )}{' '}
                    {appAction?.id === a.id && appAction.kind === 'revision' ? (
                      <>
                        {/* B70: label textarea mengambil baris penuh sendiri. */}
                        <label style={{ flex: '1 1 100%' }}>
                          Catatan revisi (wajib)
                          <textarea value={appNote} onChange={(e) => setAppNote(e.target.value)} rows={2} placeholder="Tulis yang perlu diperbaiki pelamar — terlihat oleh pelamar." />
                        </label>{' '}
                        <button type="button" className="btn btn-primary btn-small" disabled={!appNote.trim() || busyKey !== null} onClick={() => void decideApp(a, 'revision_required', appNote)}>{busyKey === `app-${a.id}-revision_required` ? 'Memproses…' : 'Konfirmasi Minta Revisi'}</button>{' '}
                        <button type="button" className="btn btn-ghost btn-small" onClick={() => { setAppAction(null); setAppNote('') }}>Batal</button>
                      </>
                    ) : (
                      <button type="button" className="btn btn-ghost btn-small" disabled={busyKey !== null} onClick={() => { setAppAction({ id: a.id, kind: 'revision' }); setAppNote('') }}>Minta Revisi</button>
                    )}
                  </div>
                )}
              </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="section" id="pengajuan-sekolah">
        <div className="dash-section-head"><h2>Pengajuan Sekolah Manual ({schoolSubs.filter((s) => s.status === 'pending').length} pending)</h2></div>
        {schoolSubs.length === 0 ? <p className="empty">Tidak ada pengajuan sekolah.</p> : (
          <ul className="discussion-list">
            {schoolSubs.map((s) => (
              <li key={s.id} className="discussion-item">
                <p><strong>{s.name}</strong>{s.npsn ? ` — NPSN ${s.npsn}` : ''}</p>
                <p>
                  Wilayah: {s.province ? provinceNames.get(s.province) ?? s.province : '—'}
                  {' / '}
                  {s.regency ? regencyNames.get(s.regency) ?? s.regency : '—'}
                </p>
                <p>Pengaju: {names.get(s.user_id) ?? '—'}</p>
                <p>Status: {schoolSubmissionStatusLabel(s.status)}{s.decision_note ? ` — ${s.decision_note}` : ''}</p>
                {s.decided_at && (
                  <p className="muted">
                    Diputuskan {fmtDate(s.decided_at)}
                    {s.decided_by ? ` oleh ${names.get(s.decided_by) ?? 'admin'}` : ''}
                  </p>
                )}
                {s.status === 'pending' && (
                  <div className="form-actions">
                    <button type="button" className="btn btn-primary btn-small" disabled={busyKey !== null} onClick={() => void decideSub(s, 'approved')}>{busyKey === `sub-${s.id}-approved` ? 'Memproses…' : 'Setujui & Tambah Sekolah'}</button>{' '}
                    {rejectingSubId === s.id ? (
                      <>
                        {/* B70: label textarea mengambil baris penuh sendiri. */}
                        <label style={{ flex: '1 1 100%' }}>
                          Alasan penolakan (wajib)
                          <textarea value={subNote} onChange={(e) => setSubNote(e.target.value)} rows={2} placeholder="Tulis alasan penolakan — terlihat oleh pengaju." />
                        </label>{' '}
                        <button type="button" className="btn btn-primary btn-small" disabled={!subNote.trim() || busyKey !== null} onClick={() => void decideSub(s, 'rejected', subNote)}>{busyKey === `sub-${s.id}-rejected` ? 'Memproses…' : 'Konfirmasi Tolak'}</button>{' '}
                        <button type="button" className="btn btn-ghost btn-small" onClick={() => { setRejectingSubId(null); setSubNote('') }}>Batal</button>
                      </>
                    ) : (
                      <button type="button" className="btn btn-ghost btn-small" disabled={busyKey !== null} onClick={() => { setRejectingSubId(s.id); setSubNote('') }}>Tolak</button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <div className="dash-section-head"><h2>Klaim Mengampu ({claims.filter((c) => c.status === 'pending').length} pending)</h2></div>
        {claims.filter((c) => c.status === 'pending').length === 0 ? <p className="empty">Tidak ada klaim mengampu yang menunggu.</p> : (
          <ul className="list">
            {claims.filter((c) => c.status === 'pending').map((c) => {
              const claimedCourse = courses.find((x) => x.id === c.course_id)
              const isMentorClaim = mentors.some((m) => m.id === c.mentor_id)
              // P74: tombol Setujui nonaktif bila klaim tidak bisa
              // disetujui (course sudah bermentor / pengaju bukan mentor).
              const cannotApprove = Boolean(claimedCourse?.mentor_id) || !isMentorClaim
              return (
              <li key={c.id}>
                <p>
                  {claimedCourse?.title ?? 'Course'} — {names.get(c.mentor_id) ?? 'Mentor'}{' '}
                  {claimedCourse?.mentor_id && <span className="muted">(course ini sudah memiliki mentor — klaim tidak bisa disetujui)</span>}{' '}
                  {!isMentorClaim && <span className="muted">(pengaju bukan mentor — klaim tidak bisa disetujui)</span>}{' '}
                  {c.decision_note && <span className="muted">(sebelumnya ditolak: {c.decision_note})</span>}
                </p>
                <div className="form-actions">
                  <button type="button" className="btn btn-primary btn-small" disabled={busyKey !== null || cannotApprove} onClick={() => void decideClaim(c, true)}>{busyKey === `claim-${c.id}-approved` ? 'Memproses…' : 'Setujui'}</button>
                  {rejectingClaimId === c.id ? (
                    <>
                      {/* B70: label textarea mengambil baris penuh sendiri. */}
                      <label style={{ flex: '1 1 100%' }}>
                        Alasan penolakan
                        <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={2} placeholder="Tulis alasan penolakan — terlihat oleh mentor." />
                      </label>
                      <button type="button" className="btn btn-primary btn-small" disabled={busyKey !== null} onClick={() => void decideClaim(c, false, rejectReason)}>{busyKey === `claim-${c.id}-rejected` ? 'Memproses…' : 'Konfirmasi Tolak'}</button>
                      <button type="button" className="btn btn-ghost btn-small" onClick={() => { setRejectingClaimId(null); setRejectReason('') }}>Batal</button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-ghost btn-small" disabled={busyKey !== null} onClick={() => { setRejectingClaimId(c.id); setRejectReason('') }}>Tolak</button>
                  )}
                </div>
              </li>
              )
            })}
          </ul>
        )}
        {claims.filter((c) => c.status !== 'pending').length > 0 && (
          <>
            <h3>Riwayat Keputusan Klaim</h3>
            <ul className="list">
              {claims.filter((c) => c.status !== 'pending').map((c) => (
                <li key={c.id}>
                  {courses.find((x) => x.id === c.course_id)?.title ?? 'Course'} — {names.get(c.mentor_id) ?? 'Mentor'}: {' '}
                  <strong>{c.status === 'approved' ? 'Disetujui' : 'Ditolak'}</strong>
                  {c.decision_note ? ` — ${c.decision_note}` : ''}
                  {c.decided_by ? ` (oleh ${names.get(c.decided_by) ?? 'admin'})` : ''}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* LC11: dulu satu heading memadatkan dua fungsi tak terkait —
          kini dua seksi dengan heading sendiri. */}
      <section className="section" id="pembagian-mentor">
        <div className="dash-section-head"><h2>Pembagian Mentor Kurikulum</h2></div>
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
      </section>

      <section className="section" id="buat-course">
        <div className="dash-section-head"><h2>Buat Course</h2></div>
        <form className="form" onSubmit={handleCreateCourse}>
          <label>Judul course baru<input value={newCourseTitle} onChange={(e) => setNewCourseTitle(e.target.value)} required /></label>
          <label>Deskripsi<textarea value={newCourseDesc} onChange={(e) => setNewCourseDesc(e.target.value)} rows={2} /></label>
          <label>Kategori<input value={newCourseCategory} onChange={(e) => setNewCourseCategory(e.target.value)} placeholder="Mis. Penyutradaraan" /></label>
          {/* LB10: mentor + level langsung di form buat course. */}
          <label>
            Mentor (kosong = tanpa mentor)
            <select value={newCourseMentor} onChange={(e) => setNewCourseMentor(e.target.value)} style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}>
              <option value="">— Tanpa mentor —</option>
              {mentors.map((m) => <option key={m.id} value={m.id}>{m.name ?? 'Mentor'}</option>)}
            </select>
          </label>
          <label>
            Level
            <select value={newCourseLevel} onChange={(e) => setNewCourseLevel(e.target.value)} style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}>
              <option value="">— Semua level —</option>
              <option value="Pemula">Pemula</option>
              <option value="Menengah">Menengah</option>
              <option value="Lanjutan">Lanjutan</option>
            </select>
          </label>
          <button type="submit" className="btn btn-primary">Buat Course</button>
          {createdCourseId && (
            <p className="notice-box">
              Course dibuat. Lengkapi section, lesson, dan kontennya di{' '}
              <Link to={`/mentor/course/${createdCourseId}`}>Course Builder →</Link>
            </p>
          )}
        </form>
      </section>

      <section className="section" id="verifikasi-sekolah">
        <div className="dash-section-head"><h2>Verifikasi Sekolah</h2></div>
        <div className="filter-bar">
          <input
            className="search-input"
            value={schoolSearch}
            onChange={(e) => { setSchoolSearch(e.target.value); setSchoolPage(0) }}
            placeholder="Cari nama sekolah atau NPSN…"
            aria-label="Cari sekolah berdasarkan nama atau NPSN"
          />
          <select
            value={schoolProvince}
            onChange={(e) => { setSchoolProvince(e.target.value); setSchoolRegency(''); setSchoolPage(0) }}
            aria-label="Filter provinsi"
          >
            <option value="">Semua Provinsi</option>
            {provinces.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
          <select
            value={schoolRegency}
            onChange={(e) => { setSchoolRegency(e.target.value); setSchoolPage(0) }}
            disabled={!schoolProvince}
            aria-label="Filter kabupaten atau kota"
          >
            <option value="">Semua Kab/Kota</option>
            {regencies.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
          </select>
          <select
            value={schoolStatus}
            onChange={(e) => { setSchoolStatus(e.target.value as 'all' | 'verified' | 'unverified'); setSchoolPage(0) }}
            aria-label="Filter status verifikasi"
          >
            <option value="all">Semua Status</option>
            <option value="verified">Terverifikasi</option>
            <option value="unverified">Belum terverifikasi</option>
          </select>
        </div>
        <p className="muted">
          {schoolLoading
            ? 'Memuat sekolah…'
            : schoolTotal === 0
              ? 'Tidak ada sekolah yang cocok dengan filter.'
              : `Menampilkan ${schoolPage * SCHOOL_PAGE_SIZE + 1}–${Math.min(schoolTotal, (schoolPage + 1) * SCHOOL_PAGE_SIZE)} dari ${schoolTotal.toLocaleString('id-ID')} sekolah`}
        </p>
        {schoolError ? (
          <p className="error-box">{schoolError}</p>
        ) : schoolRows.length === 0 && !schoolLoading ? (
          <p className="empty">Tidak ada sekolah yang cocok dengan filter.</p>
        ) : (
          <ul className="list">
            {schoolRows.map((s) => {
              const wilayah = [s.city && s.city !== s.regency ? s.city : null, s.regency, s.province].filter(Boolean).join(', ')
              return (
                <li key={s.id} className="list-row">
                  <div className="list-row-main">
                    <p className="list-row-title">{s.name}</p>
                    <p className="list-row-meta">
                      NPSN {s.npsn ?? '—'}
                      <span className={s.is_verified ? 'pill-active' : 'pill-waiting'}>
                        {s.is_verified ? 'Terverifikasi' : 'Belum terverifikasi'}
                      </span>
                    </p>
                    <p className="list-row-meta">{s.address?.trim() ? s.address : 'Alamat belum tersedia'}</p>
                    {wilayah && <p className="list-row-meta">{wilayah}</p>}
                  </div>
                  <button type="button" className="btn btn-ghost btn-small list-row-action" onClick={() => void handleVerifySchool(s, !s.is_verified)}>
                    {s.is_verified ? 'Batalkan Verifikasi' : 'Verifikasi'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost btn-small" disabled={schoolPage === 0 || schoolLoading} onClick={() => setSchoolPage((p) => Math.max(0, p - 1))}>← Sebelumnya</button>
          <span className="muted">Halaman {schoolPage + 1} dari {Math.max(1, Math.ceil(schoolTotal / SCHOOL_PAGE_SIZE))}</span>
          <button type="button" className="btn btn-ghost btn-small" disabled={(schoolPage + 1) * SCHOOL_PAGE_SIZE >= schoolTotal || schoolLoading} onClick={() => setSchoolPage((p) => p + 1)}>Berikutnya →</button>
        </div>
      </section>

      <section className="section">
        <div className="dash-section-head"><h2>Usulan Komunitas ({proposals.length} pending)</h2></div>
        {proposals.length === 0 ? <p className="empty">Tidak ada usulan komunitas yang menunggu.</p> : (
          <ul className="list">
            {proposals.map((p) => (
              <li key={p.id}>
                <strong>{p.name}</strong> — {p.description ?? ''} (pengusul: {names.get(p.proposer_id) ?? '—'})
                <div className="form-actions">
                  <button type="button" className="btn btn-primary btn-small" disabled={decidingProposalId === p.id} onClick={() => void decideProposal(p, true)}>{decidingProposalId === p.id ? 'Memproses…' : 'Setujui & Buat'}</button>
                  <button type="button" className="btn btn-ghost btn-small" disabled={decidingProposalId === p.id} onClick={() => void decideProposal(p, false)}>Tolak</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <h3>Semua Komunitas</h3>
        <ul className="list">
          {communities.map((c) => (
            <li key={c.id} className="list-row">
              <div className="list-row-main">
                <p className="list-row-title">{c.name}</p>
              </div>
              {confirmDeleteCommunityId === c.id ? (
                <div className="form-actions list-row-action">
                  <button type="button" className="btn btn-danger btn-small" onClick={() => void handleDeleteCommunity(c.id, c.name)}>Ya, hapus</button>
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => setConfirmDeleteCommunityId(null)}>Batal</button>
                </div>
              ) : (
                <button type="button" className="btn btn-ghost btn-small list-row-action" onClick={() => setConfirmDeleteCommunityId(c.id)}>Hapus Komunitas</button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="section" id="pengumuman">
        <div className="dash-section-head"><h2>Pengumuman</h2></div>
        {editingAnn && (
          <p className="notice-box">
            Mengedit pengumuman “{editingAnn.title}”.{' '}
            <button type="button" className="btn btn-ghost btn-small" onClick={resetAnnouncementForm}>Batal Edit</button>
          </p>
        )}
        <form className="form" onSubmit={(e) => void handleSaveAnnouncement(e, 'publish')}>
          <label>Judul<input value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} required /></label>
          <label>Isi<textarea value={annBody} onChange={(e) => setAnnBody(e.target.value)} rows={3} /></label>
          <label>
            Target
            <select
              value={annTarget}
              onChange={(e) => setAnnTarget(e.target.value as AnnouncementTarget)}
              style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
            >
              {ANNOUNCEMENT_TARGETS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>
          {announcementTargetNeedsCourse(annTarget) && (
            <label>
              Course
              <select value={annCourse} onChange={(e) => setAnnCourse(e.target.value)} required style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}>
                <option value="">— Pilih course —</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
          )}
          <label>
            Jadwal terbit (kosong = terbit langsung)
            <input
              type="datetime-local"
              value={annPublishAt}
              onChange={(e) => setAnnPublishAt(e.target.value)}
              style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
            />
          </label>
          <label>
            Lampiran (opsional — gambar atau PDF, maks 10 MB)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
              onChange={(e) => {
                setAnnFile(e.target.files?.[0] ?? null)
                setAnnRemoveAttachment(false)
              }}
              style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
            />
          </label>
          {annFile && <p className="muted">Lampiran: {annFile.name} ({Math.round(annFile.size / 1024)} KB)</p>}
          {editingAnn?.attachment_name && !annFile && (
            <p className="muted">
              Lampiran saat ini: {editingAnn.attachment_name}{' '}
              <button type="button" className="btn btn-ghost btn-small" onClick={() => void handleOpenAnnouncementAttachment(editingAnn)}>Buka</button>{' '}
              <label style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                <input type="checkbox" checked={annRemoveAttachment} onChange={(e) => setAnnRemoveAttachment(e.target.checked)} />
                Hapus lampiran
              </label>
            </p>
          )}
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input type="checkbox" checked={annPinned} onChange={(e) => setAnnPinned(e.target.checked)} />
            Sematkan di atas daftar pengumuman
          </label>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="submit" className="btn btn-primary">{editingAnn ? 'Simpan & Terbitkan' : 'Terbitkan'}</button>
            <button type="button" className="btn btn-secondary" onClick={(e) => void handleSaveAnnouncement(e, 'draft')}>Simpan Draf</button>
          </div>
        </form>
        <ul className="list">
          {announcements.map((a) => (
            <li key={a.id}>
              {a.title} ({announcementStatusLabel(a.status)} · {announcementTargetLabel(a.target)}
              {a.course_id ? ` · ${(courses.find((c) => c.id === a.course_id)?.title ?? 'Course')}` : ''}
              {a.publish_at ? ` · Terbit ${fmtDate(a.publish_at)}` : ''}{a.is_pinned ? ' · 📌 Disematkan' : ''}){' '}
              {a.attachment_name && (
                <>
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => void handleOpenAnnouncementAttachment(a)}>📎 {a.attachment_name}</button>{' '}
                </>
              )}
              <button type="button" className="btn btn-ghost btn-small" onClick={() => handleEditAnnouncement(a)}>Edit</button>{' '}
              <button type="button" className="btn btn-ghost btn-small" disabled={busyKey === `ann-${a.id}`} onClick={() => void handleDeleteAnnouncement(a.id)}>{busyKey === `ann-${a.id}` ? 'Menghapus…' : 'Hapus'}</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <div className="dash-section-head"><h2>Progress Lengkap, Siswa</h2></div>
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
        <div className="dash-section-head" style={{ marginTop: '1rem' }}><h2>Beban Mentor</h2></div>
        {mentorLoad.length === 0 ? <p className="empty">Belum ada mentor.</p> : (
          <ul className="list">
            {mentorLoad.map((m) => (
              <li key={m.name}>{m.name} — {m.courses} course · {m.pending} submission menunggu penilaian</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
