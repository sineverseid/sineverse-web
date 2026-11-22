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
import { issueMentorCertificate } from '../lib/certificates'
import type {
  Assignment,
  Certificate,
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
  return 'Course'
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

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const courseList = await fetchCourses()
        const { data: certData } = await supabase
          .from('certificates')
          .select('*')
          .order('issued_at', { ascending: false })
        const certRows = (certData ?? []) as Certificate[]
        const { data: enrData } = await supabase.from('enrollments').select('user_id')
        const userIds = [
          ...new Set([
            ...certRows.map((c) => c.user_id),
            ...((enrData ?? []) as { user_id: string }[]).map((e) => e.user_id),
          ]),
        ]
        const namesMap = await fetchProfileNames(userIds)
        if (cancelled) return
        setCourses(courseList)
        setCertificates(certRows)
        setNames(namesMap)
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
    const { data: certData } = await supabase
      .from('certificates')
      .select('*')
      .order('issued_at', { ascending: false })
    const certRows = (certData ?? []) as Certificate[]
    setCertificates(certRows)
    const userIds = [...new Set(certRows.map((c) => c.user_id))]
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
          weights = {
            pretest: rpsRow.weights.pretest,
            posttest: rpsRow.weights.posttest,
            tugasMingguan: rpsRow.weights.tugas_mingguan,
            tugasAkhir: rpsRow.weights.tugas_akhir,
            diskusi: rpsRow.weights.diskusi,
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

  return (
    <div className="page">
      <PageHeader
        icon="certificate"
        title="Kelola Sertifikat"
        subtitle="Daftar sertifikat yang sudah terbit, kelayakan sertifikat course, dan penerbitan sertifikat apresiasi mentor. Sertifikat course diterbitkan di Tahap 5."
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
                    <td>{courseById.get(c.course_id) ?? 'Course'}</td>
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
            placeholder="Mis. membimbing 10 siswa sampai lulus"
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
