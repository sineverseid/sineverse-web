// SINEVERSE — Admin Academy: Kelola Sertifikat.
// Dua bagian: (a) tabel semua sertifikat yang sudah terbit; (b) kelayakan
// sertifikat course per course: untuk tiap siswa terdaftar yang BELUM punya
// sertifikat type 'course' di course itu, nilai 5 komponen dihitung dari
// data mentah (pretest, posttest, tugas mingguan, tugas praktik akhir,
// diskusi) dengan bobot + ambang lulus dari baris RPS SVS-SEM1. "Layak"
// hanya bila passed true, selebihnya "Belum layak" beserta komponen yang
// masih kosong.
// Ditambah 22 Nov 2026: penerbitan Sertifikat Apresiasi Mentor (SVS-MNT)
// dilakukan DI halaman ini oleh admin (migrasi 023). Sertifikat course
// tetap diterbitkan di Tahap 5 (IssueCourseCertificatePage).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  avgOrNull,
  bestScoresByQuiz,
  buildGradeComponents,
  discussionParticipationScore,
} from '../lib/grading'
import { fetchCourses, fetchProfileNames, supabase } from '../lib/supabase'
import {
  fetchCertificateAuditLog,
  issueAcademyCertificate,
  issueEventCertificate,
  issueMentorCertificate,
  reactivateCertificate,
  revokeCertificate,
} from '../lib/certificates'
import type {
  Assignment,
  Certificate,
  CertificateAuditLog,
  Course,
  Discussion,
  Enrollment,
  GradeComponents,
  Lesson,
  Module,
  Quiz,
  QuizAttempt,
  Submission,
} from '../lib/types'
import PageHeader from '../components/PageHeader'

const FALLBACK_WEIGHTS = { pretest: 5, posttest: 15, tugasMingguan: 30, tugasAkhir: 40, diskusi: 10 }
const FALLBACK_PASSING = 70

interface EligibilityRow {
  userId: string
  name: string
  components: GradeComponents
  missing: string[]
}

interface Weights {
  pretest: number
  posttest: number
  tugasMingguan: number
  tugasAkhir: number
  diskusi: number
}

function typeLabel(type: Certificate['type']): string {
  if (type === 'exam') return 'Ujian'
  if (type === 'work') return 'Karya'
  if (type === 'mentor') return 'Mentor'
  if (type === 'academy') return 'Academy'
  if (type === 'event') return 'Event'
  return 'Course'
}

function statusLabel(status: Certificate['status']): string {
  if (status === 'revoked') return 'Dicabut'
  if (status === 'inactive') return 'Tidak aktif'
  return 'Valid'
}

interface EventOption {
  id: string
  title: string
  starts_at: string | null
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Lima komponen nilai satu course untuk satu siswa, dari data mentah
 *  course itu (pola yang sama dengan GradebookPage). */
function computeComponents(
  quizzes: Quiz[],
  assignments: Assignment[],
  attempts: QuizAttempt[],
  submissions: Submission[],
  userPosts: Discussion[],
  weights: Weights,
  passingGrade: number,
): GradeComponents {
  const best = bestScoresByQuiz(attempts)
  const pretestIds = new Set(quizzes.filter((q) => q.kind === 'pretest').map((q) => q.id))
  const posttestIds = new Set(quizzes.filter((q) => q.kind === 'posttest').map((q) => q.id))
  const pretest = avgOrNull([...best.entries()].filter(([id]) => pretestIds.has(id)).map(([, s]) => s))
  const posttest = avgOrNull([...best.entries()].filter(([id]) => posttestIds.has(id)).map(([, s]) => s))
  const weeklyIds = new Set(assignments.filter((a) => (a.kind ?? 'weekly') === 'weekly').map((a) => a.id))
  const finalIds = new Set(assignments.filter((a) => a.kind === 'final_practice').map((a) => a.id))
  const weeklyAssignments = avgOrNull(
    submissions.filter((s) => weeklyIds.has(s.assignment_id) && s.score !== null).map((s) => s.score as number),
  )
  const finalPractice = avgOrNull(
    submissions.filter((s) => finalIds.has(s.assignment_id) && s.score !== null).map((s) => s.score as number),
  )
  const discussion = discussionParticipationScore(userPosts)
  return buildGradeComponents(
    { pretest, posttest, weeklyAssignments, finalPractice, discussion },
    weights,
    passingGrade,
  )
}

function missingComponents(c: GradeComponents): string[] {
  const missing: string[] = []
  if (c.pretest === null) missing.push('Pretest')
  if (c.posttest === null) missing.push('Posttest')
  if (c.weeklyAssignments === null) missing.push('Tugas mingguan')
  if (c.finalPractice === null) missing.push('Tugas praktik akhir')
  if (c.discussion === null) missing.push('Diskusi')
  return missing
}

export default function AdminCertificatesPage() {
  const { profile } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [eligibility, setEligibility] = useState<EligibilityRow[] | null>(null)
  const [weightsNote, setWeightsNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingEligibility, setLoadingEligibility] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Sertifikat apresiasi mentor (migrasi 023).
  const [mentorCourseId, setMentorCourseId] = useState('')
  const [mentorName, setMentorName] = useState<string | null>(null)
  const [mentorNote, setMentorNote] = useState('')
  const [issuingMentor, setIssuingMentor] = useState(false)
  const [mentorResult, setMentorResult] = useState<{ serial: string; alreadyIssued: boolean } | null>(null)
  const [mentorError, setMentorError] = useState<string | null>(null)
  // Manajemen Sertifikat (migrasi 024): cari/filter + cabut/aktifkan + riwayat.
  const [mgmtSearch, setMgmtSearch] = useState('')
  const [mgmtType, setMgmtType] = useState<'all' | Certificate['type']>('all')
  const [mgmtStatus, setMgmtStatus] = useState<'all' | Certificate['status']>('all')
  const [mgmtDateFrom, setMgmtDateFrom] = useState('')
  const [mgmtDateTo, setMgmtDateTo] = useState('')
  const [mgmtSelectedId, setMgmtSelectedId] = useState<string | null>(null)
  const [auditLog, setAuditLog] = useState<CertificateAuditLog[] | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)
  const [revokeConfirmId, setRevokeConfirmId] = useState<string | null>(null)
  const [revokeReason, setRevokeReason] = useState('')
  const [mgmtBusy, setMgmtBusy] = useState(false)
  const [mgmtError, setMgmtError] = useState<string | null>(null)
  const [mgmtNotice, setMgmtNotice] = useState<string | null>(null)
  // B11: paginasi nyata daftar manajemen — 100 baris per halaman.
  const [mgmtPage, setMgmtPage] = useState(1)
  const [mgmtHasMore, setMgmtHasMore] = useState(false)
  const [mgmtLoadingMore, setMgmtLoadingMore] = useState(false)
  // Sertifikat Kelulusan Academy (migrasi 024).
  const [studentIds, setStudentIds] = useState<string[]>([])
  const [academyStudentId, setAcademyStudentId] = useState('')
  const [academyCount, setAcademyCount] = useState<number | null>(null)
  const [academyChecking, setAcademyChecking] = useState(false)
  const [academyIssuing, setAcademyIssuing] = useState(false)
  const [academyResult, setAcademyResult] = useState<{ serial: string; alreadyIssued: boolean } | null>(null)
  const [academyError, setAcademyError] = useState<string | null>(null)
  // Sertifikat Event (migrasi 024).
  const [eventOptions, setEventOptions] = useState<EventOption[]>([])
  const [eventId, setEventId] = useState('')
  const [eventStudentId, setEventStudentId] = useState('')
  const [eventNote, setEventNote] = useState('')
  const [eventIssuing, setEventIssuing] = useState(false)
  const [eventResult, setEventResult] = useState<{ serial: string; alreadyIssued: boolean } | null>(null)
  const [eventError, setEventError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const courseList = await fetchCourses()
        // B11: halaman pertama manajemen = 100 baris terbaru (.range);
        // halaman berikutnya dimuat tombol "Tampilkan lebih banyak".
        const { data: certData } = await supabase
          .from('certificates')
          .select('*')
          .order('issued_at', { ascending: false })
          .range(0, 99)
        const certRows = (certData ?? []) as Certificate[]
        const { data: enrData } = await supabase.from('enrollments').select('user_id')
        // BUGFIX 22 Nov 2026: daftar penerima JANGAN diturunkan dari sertifikat
        // yang sudah ada — dengan 0 sertifikat di DB, dropdown Penerima/Siswa
        // kosong selamanya dan admin tidak bisa menerbitkan sertifikat pertama.
        // Ambil langsung semua profil peserta (siswa + mentor) dari tabel profiles.
        const { data: memberData } = await supabase
          .from('profiles')
          .select('id')
          .in('role', ['siswa', 'mentor'])
          .order('name')
        const userIds = [
          ...new Set([
            ...certRows.map((c) => c.user_id),
            ...((enrData ?? []) as { user_id: string }[]).map((e) => e.user_id),
            ...((memberData ?? []) as { id: string }[]).map((m) => m.id),
          ]),
        ]
        const namesMap = await fetchProfileNames(userIds)
        const { data: evtData } = await supabase
          .from('events')
          .select('id,title,starts_at')
          .order('starts_at', { ascending: false })
        const evtRows = ((evtData ?? []) as EventOption[]).sort((a, b) =>
          (b.starts_at ?? '').localeCompare(a.starts_at ?? ''),
        )
        if (cancelled) return
        setCourses(courseList)
        setCertificates(certRows)
        setMgmtPage(1)
        setMgmtHasMore(certRows.length === 100)
        setNames(namesMap)
        setStudentIds(userIds)
        setEventOptions(evtRows)
        if (userIds.length > 0) {
          setAcademyStudentId(userIds[0])
          setEventStudentId(userIds[0])
        }
        if (evtRows.length > 0) setEventId(evtRows[0].id)
        if (courseList.length > 0) {
          setSelectedCourseId(courseList[0].id)
          setMentorCourseId(courseList[0].id)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat sertifikat.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  // Nama mentor dari course yang dipilih di bagian apresiasi mentor.
  useEffect(() => {
    if (!mentorCourseId) {
      setMentorName(null)
      return
    }
    const course = courses.find((c) => c.id === mentorCourseId)
    const mentorId = course?.mentor_id ?? null
    if (!mentorId) {
      setMentorName(null)
      return
    }
    let cancelled = false
    fetchProfileNames([mentorId])
      .then((m) => {
        if (!cancelled) setMentorName(m.get(mentorId) ?? null)
      })
      .catch(() => {
        if (!cancelled) setMentorName(null)
      })
    return () => {
      cancelled = true
    }
  }, [mentorCourseId, courses])

  async function refreshCertificates() {
    // Muat ulang jendela yang sudah dimuat (halaman 1..mgmtPage).
    const { data: certData } = await supabase
      .from('certificates')
      .select('*')
      .order('issued_at', { ascending: false })
      .range(0, mgmtPage * 100 - 1)
    const certRows = (certData ?? []) as Certificate[]
    setCertificates(certRows)
    setMgmtHasMore(certRows.length === mgmtPage * 100)
    // Sama seperti load(): penerima diambil dari profiles, bukan dari sertifikat.
    const { data: memberData } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['siswa', 'mentor'])
      .order('name')
    const userIds = [
      ...new Set([
        ...certRows.map((c) => c.user_id),
        ...((memberData ?? []) as { id: string }[]).map((m) => m.id),
      ]),
    ]
    setStudentIds(userIds)
    if (userIds.length > 0) {
      const m = await fetchProfileNames(userIds)
      setNames((prev) => new Map([...prev, ...m]))
    }
  }

  async function handleIssueMentor() {
    const course = courses.find((c) => c.id === mentorCourseId)
    const mentorId = course?.mentor_id ?? null
    if (!mentorId) {
      setMentorError('Course ini belum punya mentor.')
      return
    }
    setMentorError(null)
    setMentorResult(null)
    setIssuingMentor(true)
    try {
      const result = await issueMentorCertificate(mentorId, mentorCourseId, mentorNote.trim() || null)
      setMentorResult(result)
      await refreshCertificates()
    } catch (err) {
      setMentorError(err instanceof Error ? err.message : 'Gagal menerbitkan sertifikat mentor.')
    } finally {
      setIssuingMentor(false)
    }
  }

  // --- Manajemen Sertifikat (024) ------------------------------------------
  // B11: muat 100 baris berikutnya dari server (.range) dan tambahkan ke
  // daftar yang sudah dimuat; filter/search tetap bekerja atas semua
  // baris yang sudah dimuat.
  async function handleLoadMore() {
    setMgmtLoadingMore(true)
    try {
      const from = mgmtPage * 100
      const { data } = await supabase
        .from('certificates')
        .select('*')
        .order('issued_at', { ascending: false })
        .range(from, from + 99)
      const rows = (data ?? []) as Certificate[]
      setCertificates((prev) => [...prev, ...rows])
      setMgmtPage((p) => p + 1)
      setMgmtHasMore(rows.length === 100)
      if (rows.length > 0) {
        const m = await fetchProfileNames(rows.map((r) => r.user_id))
        setNames((prev) => new Map([...prev, ...m]))
      }
    } catch {
      setMgmtError('Gagal memuat sertifikat berikutnya.')
    } finally {
      setMgmtLoadingMore(false)
    }
  }

  async function handleShowAudit(certId: string) {
    setMgmtSelectedId(certId)
    setAuditLog(null)
    setAuditLoading(true)
    try {
      const rows = await fetchCertificateAuditLog(certId)
      setAuditLog(rows)
      const actorIds = rows.map((r) => r.performed_by).filter((id): id is string => Boolean(id))
      if (actorIds.length > 0) {
        const m = await fetchProfileNames(actorIds)
        setNames((prev) => new Map([...prev, ...m]))
      }
    } catch (err) {
      setMgmtError(err instanceof Error ? err.message : 'Gagal memuat riwayat sertifikat.')
    } finally {
      setAuditLoading(false)
    }
  }

  async function handleConfirmRevoke(certId: string) {
    setMgmtError(null)
    setMgmtNotice(null)
    setMgmtBusy(true)
    try {
      await revokeCertificate(certId, revokeReason.trim() || null)
      setRevokeConfirmId(null)
      setRevokeReason('')
      setMgmtNotice('Sertifikat dicabut. QR lama tetap mengarah ke halaman verifikasi yang kini menampilkan status REVOKED.')
      await refreshCertificates()
    } catch (err) {
      setMgmtError(err instanceof Error ? err.message : 'Gagal mencabut sertifikat.')
    } finally {
      setMgmtBusy(false)
    }
  }

  async function handleReactivate(certId: string) {
    setMgmtError(null)
    setMgmtNotice(null)
    setMgmtBusy(true)
    try {
      await reactivateCertificate(certId)
      setMgmtNotice('Sertifikat diaktifkan kembali (status VALID).')
      await refreshCertificates()
    } catch (err) {
      setMgmtError(err instanceof Error ? err.message : 'Gagal mengaktifkan kembali sertifikat.')
    } finally {
      setMgmtBusy(false)
    }
  }

  // --- Sertifikat Kelulusan Academy (024) ----------------------------------
  useEffect(() => {
    if (!academyStudentId) {
      setAcademyCount(null)
      return
    }
    let cancelled = false
    async function check() {
      setAcademyChecking(true)
      try {
        // B7: hitung HANYA sertifikat course yang masih VALID — yang
        // dicabut tidak boleh menggenapi syarat kelulusan Academy.
        const { data } = await supabase
          .from('certificates')
          .select('course_id')
          .eq('user_id', academyStudentId)
          .eq('type', 'course')
          .eq('status', 'valid')
        const distinct = new Set(((data ?? []) as { course_id: string }[]).map((r) => r.course_id))
        if (!cancelled) setAcademyCount(distinct.size)
      } catch {
        if (!cancelled) setAcademyCount(null)
      } finally {
        if (!cancelled) setAcademyChecking(false)
      }
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [academyStudentId, certificates])

  async function handleIssueAcademy() {
    if (!academyStudentId) return
    setAcademyError(null)
    setAcademyResult(null)
    setAcademyIssuing(true)
    try {
      const result = await issueAcademyCertificate(academyStudentId)
      setAcademyResult(result)
      await refreshCertificates()
    } catch (err) {
      setAcademyError(err instanceof Error ? err.message : 'Gagal menerbitkan sertifikat Academy.')
    } finally {
      setAcademyIssuing(false)
    }
  }

  // --- Sertifikat Event (024) ----------------------------------------------
  async function handleIssueEvent() {
    if (!eventStudentId || !eventId) return
    setEventError(null)
    setEventResult(null)
    setEventIssuing(true)
    try {
      const result = await issueEventCertificate(eventStudentId, eventId, eventNote.trim() || null)
      setEventResult(result)
      await refreshCertificates()
    } catch (err) {
      setEventError(err instanceof Error ? err.message : 'Gagal menerbitkan sertifikat event.')
    } finally {
      setEventIssuing(false)
    }
  }

  useEffect(() => {
    if (!selectedCourseId) return
    let cancelled = false
    async function loadEligibility() {
      setLoadingEligibility(true)
      setEligibility(null)
      try {
        // Bobot + ambang lulus dari RPS SVS-SEM1; fallback bila baris hilang.
        let weights: Weights = FALLBACK_WEIGHTS
        let passingGrade = FALLBACK_PASSING
        let weightsSource = 'fallback (baris RPS SVS-SEM1 tidak ditemukan)'
        const { data: rpsData } = await supabase
          .from('rps')
          .select('weights,passing_grade')
          .eq('code', 'SVS-SEM1')
          .maybeSingle()
        const rpsRow = rpsData as unknown as {
          weights?: { pretest: number; posttest: number; tugas_mingguan: number; tugas_akhir: number; diskusi: number }
          passing_grade?: number
        } | null
        if (rpsRow?.weights) {
          // B8: fallback per kunci (bukan hanya per baris) — pola yang
          // sama dengan fetchCourseEligibility di lib/certificates.ts:
          // bila satu kunci hilang dari JSONB, bobot itu memakai default
          // master prompt; tanpa ini bobot undefined membuat nilai akhir
          // NaN.
          weights = {
            pretest: rpsRow.weights.pretest ?? FALLBACK_WEIGHTS.pretest,
            posttest: rpsRow.weights.posttest ?? FALLBACK_WEIGHTS.posttest,
            tugasMingguan: rpsRow.weights.tugas_mingguan ?? FALLBACK_WEIGHTS.tugasMingguan,
            tugasAkhir: rpsRow.weights.tugas_akhir ?? FALLBACK_WEIGHTS.tugasAkhir,
            diskusi: rpsRow.weights.diskusi ?? FALLBACK_WEIGHTS.diskusi,
          }
          passingGrade = rpsRow.passing_grade ?? FALLBACK_PASSING
          weightsSource = `RPS SVS-SEM1 (Pretest ${weights.pretest}% · Posttest ${weights.posttest}% · Tugas mingguan ${weights.tugasMingguan}% · Tugas praktik akhir ${weights.tugasAkhir}% · Diskusi ${weights.diskusi}% · Lulus ${passingGrade})`
        }
        if (cancelled) return
        setWeightsNote(weightsSource)

        const { data: enrData } = await supabase
          .from('enrollments')
          .select('*')
          .eq('course_id', selectedCourseId)
        const enrRows = (enrData ?? []) as Enrollment[]
        const { data: certData } = await supabase
          .from('certificates')
          .select('user_id')
          .eq('course_id', selectedCourseId)
          .eq('type', 'course')
        const certified = new Set(((certData ?? []) as { user_id: string }[]).map((c) => c.user_id))
        const pending = enrRows.filter((e) => !certified.has(e.user_id))
        if (pending.length === 0) {
          if (!cancelled) setEligibility([])
          return
        }
        const { data: mods } = await supabase
          .from('modules')
          .select('id')
          .eq('course_id', selectedCourseId)
        const modRows = (mods ?? []) as Module[]
        let lessonRows: Lesson[] = []
        if (modRows.length > 0) {
          const { data: lessons } = await supabase
            .from('lessons')
            .select('id')
            .in('module_id', modRows.map((m) => m.id))
          lessonRows = (lessons ?? []) as Lesson[]
        }
        const lessonIds = lessonRows.map((l) => l.id)
        const empty = '00000000-0000-0000-0000-000000000000'
        const [quizzes, assignments, discussions] = await Promise.all([
          (async () => {
            if (lessonIds.length === 0) return [] as Quiz[]
            const { data } = await supabase.from('quizzes').select('*').in('lesson_id', lessonIds)
            return (data ?? []) as Quiz[]
          })(),
          (async () => {
            if (lessonIds.length === 0) return [] as Assignment[]
            const { data } = await supabase.from('assignments').select('*').in('lesson_id', lessonIds)
            return (data ?? []) as Assignment[]
          })(),
          (async () => {
            const { data } = await supabase
              .from('discussions')
              .select('id,lesson_id,user_id')
              .in('lesson_id', lessonIds.length > 0 ? lessonIds : [empty])
            return (data ?? []) as Discussion[]
          })(),
        ])
        const quizIds = quizzes.map((q) => q.id)
        const assignmentIds = assignments.map((a) => a.id)
        const [attempts, submissions] = await Promise.all([
          (async () => {
            const { data } = await supabase
              .from('quiz_attempts')
              .select('id,quiz_id,user_id,score')
              .in('quiz_id', quizIds.length > 0 ? quizIds : [empty])
            return (data ?? []) as QuizAttempt[]
          })(),
          (async () => {
            const { data } = await supabase
              .from('submissions')
              .select('id,assignment_id,user_id,score')
              .in('assignment_id', assignmentIds.length > 0 ? assignmentIds : [empty])
            return (data ?? []) as Submission[]
          })(),
        ])
        const rows: EligibilityRow[] = pending.map((enr) => {
          const myAttempts = attempts.filter((a) => a.user_id === enr.user_id)
          const mySubmissions = submissions.filter((s) => s.user_id === enr.user_id)
          const myPosts = discussions.filter((d) => d.user_id === enr.user_id)
          const components = computeComponents(
            quizzes,
            assignments,
            myAttempts,
            mySubmissions,
            myPosts,
            weights,
            passingGrade,
          )
          return {
            userId: enr.user_id,
            name: names.get(enr.user_id) ?? 'Siswa',
            components,
            missing: missingComponents(components),
          }
        })
        rows.sort((a, b) => b.components.final - a.components.final)
        if (!cancelled) setEligibility(rows)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat kelayakan sertifikat.')
      } finally {
        if (!cancelled) setLoadingEligibility(false)
      }
    }
    void loadEligibility()
    return () => {
      cancelled = true
    }
  }, [selectedCourseId, names])

  if (profile?.role !== 'admin') {
    return (
      <div className="page">
        <h1>Kelola Sertifikat</h1>
        <p className="empty">Halaman ini hanya untuk admin.</p>
      </div>
    )
  }
  if (loading) return <div className="page"><p className="muted">Memuat…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>

  const courseById = new Map(courses.map((c) => [c.id, c.title]))

  // Manajemen Sertifikat: filter klien atas daftar sertifikat yang sudah
  // dimuat (terbaru dulu). Paginasi nyata (B11): 100 baris per halaman
  // dari server + tombol "Tampilkan lebih banyak"; filter bekerja atas
  // semua baris yang sudah dimuat (bukan lagi .slice(0, 100)).
  const mgmtFiltered = certificates
    .filter((c) => {
      if (mgmtType !== 'all' && c.type !== mgmtType) return false
      if (mgmtStatus !== 'all' && c.status !== mgmtStatus) return false
      if (mgmtDateFrom && c.issued_at.slice(0, 10) < mgmtDateFrom) return false
      if (mgmtDateTo && c.issued_at.slice(0, 10) > mgmtDateTo) return false
      if (mgmtSearch.trim()) {
        const q = mgmtSearch.trim().toLowerCase()
        const name = (names.get(c.user_id) ?? '').toLowerCase()
        if (!name.includes(q) && !c.serial.toLowerCase().includes(q)) return false
      }
      return true
    })
  const mgmtSelected = mgmtSelectedId ? certificates.find((c) => c.id === mgmtSelectedId) ?? null : null

  return (
    <div className="page">
      <PageHeader
        icon="certificate"
        title="Kelola Sertifikat"
        subtitle="Daftar sertifikat yang sudah terbit, manajemen sertifikat (cari, filter, cabut, aktifkan, riwayat), kelayakan sertifikat course, dan penerbitan sertifikat apresiasi mentor, kelulusan Academy, dan event. Sertifikat course diterbitkan di Tahap 5."
      />
      <section className="section">
        <h2>Sertifikat Terbit ({certificates.length})</h2>
        {certificates.length === 0 ? (
          <p className="empty">Belum ada sertifikat yang terbit.</p>
        ) : (
          <div className="grade-table-wrap">
            <table className="grade-table">
              <thead>
                <tr><th>Siswa</th><th>Course</th><th>Jenis</th><th>Serial</th><th>Skor</th><th>Tanggal Terbit</th></tr>
              </thead>
              <tbody>
                {certificates.map((c) => (
                  <tr key={c.id}>
                    <td>{names.get(c.user_id) ?? 'Siswa'}</td>
                    <td>{c.course_id ? courseById.get(c.course_id) ?? 'Course' : c.program_name ?? '—'}</td>
                    <td>{typeLabel(c.type)}</td>
                    <td>{c.serial}</td>
                    <td>{c.score === null ? '—' : c.score}</td>
                    <td>{formatDate(c.issued_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section">
        <h2>Manajemen Sertifikat</h2>
        <p className="muted">
          Cari berdasarkan nama penerima atau nomor serial, filter berdasarkan jenis, status, dan
          tanggal terbit. Pencabutan membutuhkan konfirmasi + alasan, dan setiap perubahan status
          tercatat di riwayat (audit log). QR sertifikat yang dicabut tetap mengarah ke halaman
          verifikasi yang menampilkan status REVOKED.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <label>
            Cari (nama / serial)
            <input
              value={mgmtSearch}
              onChange={(e) => setMgmtSearch(e.target.value)}
              placeholder="Nama penerima atau SVS-…"
              style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
            />
          </label>
          <label>
            Jenis
            <select
              value={mgmtType}
              onChange={(e) => setMgmtType(e.target.value as 'all' | Certificate['type'])}
              style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
            >
              <option value="all">Semua jenis</option>
              <option value="course">Course</option>
              <option value="exam">Ujian</option>
              <option value="work">Karya</option>
              <option value="mentor">Mentor</option>
              <option value="academy">Academy</option>
              <option value="event">Event</option>
            </select>
          </label>
          <label>
            Status
            <select
              value={mgmtStatus}
              onChange={(e) => setMgmtStatus(e.target.value as 'all' | Certificate['status'])}
              style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
            >
              <option value="all">Semua status</option>
              <option value="valid">Valid</option>
              <option value="revoked">Dicabut</option>
              <option value="inactive">Tidak aktif</option>
            </select>
          </label>
          <label>
            Terbit dari
            <input
              type="date"
              value={mgmtDateFrom}
              onChange={(e) => setMgmtDateFrom(e.target.value)}
              style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
            />
          </label>
          <label>
            Terbit sampai
            <input
              type="date"
              value={mgmtDateTo}
              onChange={(e) => setMgmtDateTo(e.target.value)}
              style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
            />
          </label>
        </div>
        {mgmtNotice && <p className="notice-box">{mgmtNotice}</p>}
        {mgmtError && <p className="error-box">{mgmtError}</p>}
        {mgmtFiltered.length === 0 ? (
          <p className="empty">Tidak ada sertifikat yang cocok dengan filter.</p>
        ) : (
          <div className="grade-table-wrap">
            <table className="grade-table">
              <thead>
                <tr><th>Penerima</th><th>Jenis</th><th>Course / Program</th><th>Serial</th><th>Status</th><th>Tanggal Terbit</th><th>Diterbitkan oleh</th><th>Aksi</th></tr>
              </thead>
              <tbody>
                {mgmtFiltered.map((c) => (
                  <tr key={c.id}>
                    <td>{names.get(c.user_id) ?? c.recipient_name_snapshot ?? '—'}</td>
                    <td>{typeLabel(c.type)}</td>
                    <td>{c.course_id ? courseById.get(c.course_id) ?? 'Course' : c.program_name ?? '—'}</td>
                    <td>{c.serial}</td>
                    <td>{statusLabel(c.status)}</td>
                    <td>{formatDate(c.issued_at)}</td>
                    <td>{c.issued_by ? names.get(c.issued_by) ?? 'Admin' : '—'}</td>
                    <td>
                      <button type="button" className="btn btn-secondary btn-small" onClick={() => void handleShowAudit(c.id)}>
                        Riwayat
                      </button>{' '}
                      {c.status === 'revoked' ? (
                        <button type="button" className="btn btn-secondary btn-small" onClick={() => void handleReactivate(c.id)} disabled={mgmtBusy}>
                          Aktifkan lagi
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          onClick={() => {
                            setRevokeConfirmId(c.id)
                            setRevokeReason('')
                            setMgmtError(null)
                          }}
                          disabled={mgmtBusy}
                        >
                          Cabut
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {mgmtHasMore && (
          <p style={{ marginTop: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => void handleLoadMore()} disabled={mgmtLoadingMore}>
              {mgmtLoadingMore ? 'Memuat…' : 'Tampilkan lebih banyak'}
            </button>
          </p>
        )}
        {revokeConfirmId && (
          <div className="discussion-item" style={{ marginTop: '0.75rem', borderLeft: '4px solid #c0392b' }}>
            <p><strong>Konfirmasi pencabutan</strong></p>
            <p className="muted">
              Sertifikat {certificates.find((c) => c.id === revokeConfirmId)?.serial ?? ''} akan
              dicabut. Tindakan ini tercatat di audit log dan statusnya berubah menjadi REVOKED
              di halaman verifikasi publik.
            </p>
            <label>
              Alasan pencabutan
              <input
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="Mis. data nilai salah input"
                style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)', width: '100%', boxSizing: 'border-box' }}
              />
            </label>
            <p style={{ marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-primary" onClick={() => void handleConfirmRevoke(revokeConfirmId)} disabled={mgmtBusy}>
                {mgmtBusy ? 'Mencabut…' : 'Ya, cabut sertifikat'}
              </button>{' '}
              <button type="button" className="btn btn-secondary" onClick={() => setRevokeConfirmId(null)}>
                Batal
              </button>
            </p>
          </div>
        )}
        {mgmtSelected && (
          <div style={{ marginTop: '0.75rem' }}>
            <h3>Riwayat — {mgmtSelected.serial}</h3>
            {auditLoading && <p className="muted">Memuat riwayat…</p>}
            {!auditLoading && auditLog !== null && auditLog.length === 0 && (
              <p className="empty">Belum ada riwayat perubahan status untuk sertifikat ini.</p>
            )}
            {!auditLoading && auditLog !== null && auditLog.length > 0 && (
              <div className="grade-table-wrap">
                <table className="grade-table">
                  <thead>
                    <tr><th>Tanggal</th><th>Aksi</th><th>Status</th><th>Oleh</th><th>Catatan</th></tr>
                  </thead>
                  <tbody>
                    {auditLog.map((row) => (
                      <tr key={row.id}>
                        <td>{formatDate(row.created_at)}</td>
                        <td>{row.action}</td>
                        <td>{row.previous_status ?? '—'} → {row.new_status ?? '—'}</td>
                        <td>{row.performed_by ? names.get(row.performed_by) ?? 'Admin' : 'Sistem'}</td>
                        <td>{row.notes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="section">
        <h2>Sertifikat Apresiasi Mentor</h2>
        <p className="muted">
          Terbitkan sertifikat apresiasi (SVS-MNT) untuk mentor yang mengampu sebuah course.
          Satu mentor hanya punya satu sertifikat apresiasi per course; bila sudah pernah
          diterbitkan, nomor serial yang sudah ada akan ditampilkan.
        </p>
        <label>
          Course
          <select
            value={mentorCourseId}
            onChange={(e) => {
              setMentorCourseId(e.target.value)
              setMentorResult(null)
              setMentorError(null)
            }}
            style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
          >
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>
        <p className="muted">
          Mentor course ini: {mentorName ? <strong>{mentorName}</strong> : 'belum ada mentor'}
        </p>
        <label>
          Alasan apresiasi
          <textarea
            value={mentorNote}
            onChange={(e) => setMentorNote(e.target.value)}
            rows={3}
            maxLength={140}
            placeholder="Mis. membimbing 10 siswa sampai lulus (maks. 140 karakter)"
            style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)', width: '100%', boxSizing: 'border-box' }}
          />
        </label>
        <p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleIssueMentor()}
            disabled={issuingMentor || !mentorCourseId || !mentorName}
          >
            {issuingMentor ? 'Menerbitkan…' : 'Terbitkan Sertifikat Mentor'}
          </button>
        </p>
        {mentorResult && (
          <p className="notice-box">
            Sertifikat mentor terbit: {mentorResult.serial}
            {mentorResult.alreadyIssued ? ' (sudah pernah diterbitkan sebelumnya untuk course ini).' : '.'}
          </p>
        )}
        {mentorError && <p className="error-box">{mentorError}</p>}
      </section>

      <section className="section">
        <h2>Sertifikat Kelulusan Academy</h2>
        <p className="muted">
          Terbitkan sertifikat kelulusan Academy (SVS-ACD) untuk siswa yang sudah memegang
          sertifikat course untuk ke-10 course. Satu siswa hanya punya satu sertifikat Academy;
          bila sudah pernah diterbitkan, nomor serial yang sudah ada akan ditampilkan.
        </p>
        <label>
          Siswa
          <select
            value={academyStudentId}
            onChange={(e) => {
              setAcademyStudentId(e.target.value)
              setAcademyResult(null)
              setAcademyError(null)
            }}
            style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
          >
            {studentIds.map((id) => <option key={id} value={id}>{names.get(id) ?? id}</option>)}
          </select>
        </label>
        <p className="muted">
          Sertifikat course yang dipegang:{' '}
          {academyChecking ? 'memeriksa…' : academyCount === null ? '—' : <strong>{academyCount} dari 10 course</strong>}
        </p>
        <p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleIssueAcademy()}
            disabled={academyIssuing || !academyStudentId || academyCount === null || academyCount < 10}
          >
            {academyIssuing ? 'Menerbitkan…' : 'Terbitkan Sertifikat Academy'}
          </button>
        </p>
        {academyCount !== null && academyCount < 10 && (
          <p className="muted">Siswa belum memenuhi syarat: baru {academyCount} dari 10 sertifikat course.</p>
        )}
        {academyResult && (
          <p className="notice-box">
            Sertifikat Academy terbit: {academyResult.serial}
            {academyResult.alreadyIssued ? ' (sudah pernah diterbitkan sebelumnya).' : '.'}
          </p>
        )}
        {academyError && <p className="error-box">{academyError}</p>}
      </section>

      <section className="section">
        <h2>Sertifikat Event</h2>
        <p className="muted">
          Terbitkan sertifikat partisipasi event (SVS-EVT). Satu penerima hanya punya satu
          sertifikat per event; bila sudah pernah diterbitkan, nomor serial yang sudah ada
          akan ditampilkan.
        </p>
        <label>
          Event
          <select
            value={eventId}
            onChange={(e) => {
              setEventId(e.target.value)
              setEventResult(null)
              setEventError(null)
            }}
            style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
          >
            {eventOptions.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
          </select>
        </label>
        <label>
          Penerima
          <select
            value={eventStudentId}
            onChange={(e) => {
              setEventStudentId(e.target.value)
              setEventResult(null)
              setEventError(null)
            }}
            style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
          >
            {studentIds.map((id) => <option key={id} value={id}>{names.get(id) ?? id}</option>)}
          </select>
        </label>
        <label>
          Catatan
          <textarea
            value={eventNote}
            onChange={(e) => setEventNote(e.target.value)}
            rows={2}
            placeholder="Mis. peserta Lomba Film Pendek 2026"
            style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)', width: '100%', boxSizing: 'border-box' }}
          />
        </label>
        <p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleIssueEvent()}
            disabled={eventIssuing || !eventId || !eventStudentId}
          >
            {eventIssuing ? 'Menerbitkan…' : 'Terbitkan Sertifikat Event'}
          </button>
        </p>
        {eventResult && (
          <p className="notice-box">
            Sertifikat event terbit: {eventResult.serial}
            {eventResult.alreadyIssued ? ' (sudah pernah diterbitkan sebelumnya untuk event ini).' : '.'}
          </p>
        )}
        {eventError && <p className="error-box">{eventError}</p>}
      </section>

      <section className="section">
        <h2>Kelayakan Sertifikat Course</h2>
        <label>
          Course
          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            style={{ fontFamily: 'inherit', padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
          >
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>
        <p className="muted">Bobot dan ambang lulus: {weightsNote || 'memuat…'}</p>
        <p className="muted">
          Hanya siswa terdaftar yang belum punya sertifikat course di course ini yang dinilai.
          "Layak" berarti nilai akhir lulus; penerbitan sendiri dilakukan di Tahap 5.
        </p>
        {loadingEligibility && <p className="muted">Memuat…</p>}
        {!loadingEligibility && eligibility !== null && eligibility.length === 0 && (
          <p className="empty">Semua siswa terdaftar di course ini sudah punya sertifikat course, atau belum ada siswa terdaftar.</p>
        )}
        {!loadingEligibility && eligibility !== null && eligibility.length > 0 && (
          <div className="grade-table-wrap">
            <table className="grade-table">
              <thead>
                <tr>
                  <th>Siswa</th>
                  <th>Pretest</th>
                  <th>Posttest</th>
                  <th>Tugas Mingguan</th>
                  <th>Tugas Praktik Akhir</th>
                  <th>Diskusi</th>
                  <th>Nilai Akhir</th>
                  <th>Status</th>
                  <th>Komponen Belum Ada</th>
                </tr>
              </thead>
              <tbody>
                {eligibility.map((r) => (
                  <tr key={r.userId}>
                    <td>{r.name}</td>
                    <td>{r.components.pretest === null ? '—' : r.components.pretest.toFixed(1)}</td>
                    <td>{r.components.posttest === null ? '—' : r.components.posttest.toFixed(1)}</td>
                    <td>{r.components.weeklyAssignments === null ? '—' : r.components.weeklyAssignments.toFixed(1)}</td>
                    <td>{r.components.finalPractice === null ? '—' : r.components.finalPractice.toFixed(1)}</td>
                    <td>{r.components.discussion === null ? '—' : r.components.discussion.toFixed(1)}</td>
                    <td>{r.components.final.toFixed(1)}</td>
                    <td>{r.components.passed ? 'Layak' : 'Belum layak'}</td>
                    <td>{r.missing.length === 0 ? '—' : r.missing.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="muted"><Link to="/admin">Kembali ke Admin Panel</Link></p>
    </div>
  )
}
