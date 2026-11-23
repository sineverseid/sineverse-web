// SINEVERSE — Ujian kompetensi: daftar ujian (003) + kerjakan ujian.
// Soal ujian dibaca via get_exam_questions() (009, tanpa correct_answer);
// penilaian + penerbitan sertifikat berjalan di server via
// submit_exam_attempt() (009). Lulus → sertifikat type 'exam',
// serial SVS-EXM-YYYY-NNNN. Bila RPC 009 belum ada, jawaban tersimpan
// sebagai percobaan tanpa nilai + pesan jujur.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { isMissingTableError } from '../lib/guarded'
import { fetchCompetencyExams, fetchCourses, fetchEnrollment, fetchEnrollments, fetchExamAttempts, supabase } from '../lib/supabase'
import type { CompetencyExam, ExamAttempt } from '../lib/types'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

interface ExamQuestion {
  id: string
  exam_id: string
  kind: string
  question: string
  options: string[] | null
  explanation: string | null
  order_index: number
  created_at: string
}

export function ExamsPage() {
  const { user, profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [exams, setExams] = useState<CompetencyExam[] | null>(null)
  const [attempts, setAttempts] = useState<ExamAttempt[]>([])
  // K5: ketersediaan per ujian — course tempat saya terdaftar dan course
  // yang saya ampu. null = gagal dimuat (ketersediaan tidak diketahui,
  // daftar tetap tampil tanpa catatan).
  const [myEnrolledCourseIds, setMyEnrolledCourseIds] = useState<Set<string> | null>(null)
  const [mentorCourseIds, setMentorCourseIds] = useState<Set<string> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        // Daftar ujian dan percobaan saya independen — dimuat paralel.
        const [list, atts] = await Promise.all([
          fetchCompetencyExams(),
          user ? fetchExamAttempts(user.id) : Promise.resolve([] as ExamAttempt[]),
        ])
        if (cancelled) return
        setExams(list)
        if (user) {
          setAttempts(atts)
          // Ketersediaan per ujian: gagal dimuat tidak boleh merusak daftar.
          try {
            const [enrs, courses] = await Promise.all([
              fetchEnrollments(user.id),
              fetchCourses(),
            ])
            if (cancelled) return
            setMyEnrolledCourseIds(new Set(enrs.map((e) => e.course_id)))
            setMentorCourseIds(
              new Set(courses.filter((c) => c.mentor_id === user.id).map((c) => c.id)),
            )
          } catch {
            // Ketersediaan tidak diketahui — daftar tetap tampil.
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat ujian.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user])

  // K5: ketersediaan satu ujian untuk peran saya.
  // 'admin' = mode pantau (tidak mengikuti ujian); 'preview' = pratinjau
  // mentor course; 'open' = siswa terdaftar di course ujian; 'unlinked' =
  // ujian belum terhubung ke course (siswa boleh mengerjakan, sertifikat
  // baru terbit setelah dihubungkan); 'locked' = siswa belum terdaftar di
  // course ujian; 'unknown' = ketersediaan gagal ditentukan.
  function examAccess(ex: CompetencyExam): 'admin' | 'preview' | 'open' | 'unlinked' | 'locked' | 'unknown' {
    if (isAdmin) return 'admin'
    if (ex.course_id === null) return 'unlinked'
    if (mentorCourseIds?.has(ex.course_id)) return 'preview'
    if (myEnrolledCourseIds === null) return 'unknown'
    return myEnrolledCourseIds.has(ex.course_id) ? 'open' : 'locked'
  }

  const anyAvailable =
    exams !== null &&
    exams.some((ex) => {
      const a = examAccess(ex)
      return a === 'open' || a === 'preview' || a === 'unlinked'
    })

  if (loading) return <div className="page"><p className="muted">Memuat ujian…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (exams === null) return <div className="page"><h1>Ujian Kompetensi</h1><MigrationNotice migration="003" /></div>

  return (
    <div className="page">
      <PageHeader
        icon="exam"
        title="Ujian Kompetensi"
        subtitle="Lulus ujian kompetensi menerbitkan sertifikat ujian (SVS-EXM)."
      />
      {exams.length === 0 ? (
        <EmptyState message="Belum ada ujian kompetensi." />
      ) : (
        <>
          {/* K5: empty-state sadar-peran — ujian ADA tapi tidak tersedia
              untuk peran ini mendapat pesan yang tepat, bukan "Belum ada". */}
          {isAdmin ? (
            <p className="notice-box">
              Kamu masuk sebagai admin (mode pantau). Admin tidak mengikuti ujian kompetensi —
              soal hanya bisa dibaca.
            </p>
          ) : (
            user &&
            !anyAvailable && (
              <p className="notice-box">
                Belum ada ujian yang bisa kamu ikuti — semua ujian di bawah membutuhkan
                pendaftaran di course terkait. Daftar dulu ke course-nya, lalu kembali ke sini.
              </p>
            )
          )}
          <ul className="course-list">
            {exams.map((ex) => {
              const mine = attempts.filter((a) => a.exam_id === ex.id)
              const passed = mine.some((a) => a.passed)
              const access = examAccess(ex)
              const accessNote =
                access === 'admin'
                  ? 'Mode pantau admin — soal hanya bisa dibaca.'
                  : access === 'preview'
                    ? 'Pratinjau mentor — soal hanya bisa dibaca.'
                    : access === 'open'
                      ? 'Kamu terdaftar di course ini — ujian bisa diikuti.'
                      : access === 'unlinked'
                        ? 'Belum terhubung ke course — sertifikat diterbitkan setelah dihubungkan.'
                        : access === 'locked'
                          ? 'Perlu terdaftar di course terkait untuk mengikuti ujian ini.'
                          : ''
              return (
                <li key={ex.id} className="course-card">
                  <Link to={`/ujian/${ex.id}`}>
                    <h3>{ex.title}</h3>
                    <p>{ex.description ?? 'Ujian kompetensi.'}</p>
                    <p className="muted">
                      Nilai lulus: {ex.passing_score}
                      {ex.max_attempts !== null ? ` · Maks. percobaan: ${ex.max_attempts}` : ''}
                      {passed ? ' · Lulus' : mine.length > 0 ? ` · ${mine.length} percobaan` : ''}
                    </p>
                    {accessNote && <p className="muted">{accessNote}</p>}
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

export function ExamPage() {
  const { id } = useParams<{ id: string }>()
  const { user, profile } = useAuth()
  // K5: admin tidak boleh ikut ujian sama sekali; hanya siswa terdaftar di
  // course ujian (atau mentor course, sebagai pratinjau read-only).
  const isAdmin = profile?.role === 'admin'
  const [enrolled, setEnrolled] = useState<boolean | null>(null)
  const [isCourseMentor, setIsCourseMentor] = useState(false)
  const [exam, setExam] = useState<CompetencyExam | null>(null)
  const [questions, setQuestions] = useState<ExamQuestion[] | null>(null)
  const [missingQuestions, setMissingQuestions] = useState(false)
  const [attempts, setAttempts] = useState<ExamAttempt[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ score: number | null; passed: boolean | null; serial: string | null; note: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!id || !user) return
    const examId = id
    const currentUser = user
    let cancelled = false
    async function load() {
      try {
        // Daftar ujian, soal (RPC), dan percobaan saya independen — ketiganya
        // hanya butuh examId/user — dimulai paralel. Hasil soal/percobaan
        // baru dipakai setelah daftar ujian dipastikan ada, supaya bila
        // tabel ujian belum ada, halaman tetap menampilkan MigrationNotice
        // (bukan error RPC/percobaan) seperti sebelumnya.
        const listP = fetchCompetencyExams()
        const rpcP = supabase.rpc('get_exam_questions', { p_exam_id: examId })
        const attP = fetchExamAttempts(currentUser.id)
        const list = await listP
        if (cancelled) return
        if (list === null) {
          // Abaikan hasil soal/percobaan yang sudah terlanjur berjalan.
          await Promise.allSettled([rpcP, attP])
          setExam(null)
          return
        }
        setExam(list.find((e) => e.id === examId) ?? null)
        const { data, error: rpcErr } = await rpcP
        if (rpcErr) {
          if (isMissingTableError(rpcErr) || String(rpcErr.code) === 'PGRST202') setMissingQuestions(true)
          else throw rpcErr
        } else if (!cancelled) setQuestions((data ?? []) as ExamQuestion[])
        const atts = await attP
        if (!cancelled) setAttempts(atts.filter((a) => a.exam_id === examId))
        // K5: cek enrollment + mentor course bila ujian terhubung ke course.
        // Ujian tanpa course_id tidak punya enrollment untuk dicek (sertifikat
        // pun tidak bisa terbit sebelum dihubungkan) — siswa tetap boleh
        // mengerjakan, admin tetap diblokir.
        const found = list.find((e) => e.id === examId) ?? null
        if (found?.course_id) {
          try {
            const [enr, { data: cRow }] = await Promise.all([
              fetchEnrollment(currentUser.id, found.course_id),
              supabase.from('courses').select('mentor_id').eq('id', found.course_id).maybeSingle(),
            ])
            if (!cancelled) {
              setEnrolled(enr !== null)
              setIsCourseMentor((cRow as { mentor_id?: string } | null)?.mentor_id === currentUser.id)
            }
          } catch {
            if (!cancelled) setEnrolled(false)
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat ujian.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id, user])

  if (loading) return <div className="page"><p className="muted">Memuat ujian…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (!exam) return <div className="page"><h1>Ujian Kompetensi</h1><MigrationNotice migration="003" /></div>

  const blocked = exam.max_attempts !== null && attempts.length >= exam.max_attempts
  const passed = attempts.some((a) => a.passed)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const currentExam = exam
    if (!user || !questions || !currentExam) return
    // K5: admin tidak boleh ikut ujian (RPC 022 juga menolak — ini pesan jelasnya).
    if (isAdmin) {
      setResult({ score: null, passed: null, serial: null, note: 'Kamu masuk sebagai admin (mode pantau). Admin tidak mengikuti ujian kompetensi.' })
      return
    }
    if (isCourseMentor) {
      setResult({ score: null, passed: null, serial: null, note: 'Kamu mentor course ini (pratinjau). Pratinjau tidak tercatat sebagai percobaan.' })
      return
    }
    if (enrolled === false) {
      setResult({ score: null, passed: null, serial: null, note: 'Ujian ini hanya bisa diikuti oleh siswa yang terdaftar di course-nya. Daftar dulu di halaman course.' })
      return
    }
    setSubmitting(true)
    setResult(null)
    try {
      const { data, error: rpcErr } = await supabase.rpc('submit_exam_attempt', {
        p_exam_id: currentExam.id,
        p_answers: answers,
      })
      if (rpcErr) {
        if (isMissingTableError(rpcErr) || String(rpcErr.code) === 'PGRST202') {
          const { error: insErr } = await supabase.from('exam_attempts').insert({
            exam_id: currentExam.id,
            user_id: user.id,
            score: null,
            answers,
            passed: null,
          })
          if (insErr) throw insErr
          setResult({
            score: null,
            passed: null,
            serial: null,
            note: 'Jawabanmu tersimpan. Penilaian dan penerbitan sertifikat belum tersedia — RPC ujian di migrasi 009 belum dijalankan (lihat supabase/README.md).',
          })
        } else throw rpcErr
      } else {
        const row = (Array.isArray(data) ? data[0] : data) as
          | { score: number | null; passed: boolean | null; certificate_serial: string | null }
          | null
        setResult({
          score: row?.score ?? null,
          passed: row?.passed ?? null,
          serial: row?.certificate_serial ?? null,
          note:
            row?.passed === true
              ? `Selamat, kamu lulus dengan nilai ${row.score}. Sertifikat ujian diterbitkan: ${row.certificate_serial ?? '—'}.`
              : `Nilai kamu: ${row?.score ?? '—'}. Nilai lulus: ${currentExam.passing_score}.`,
        })
      }
      const atts = await fetchExamAttempts(user.id)
      setAttempts(atts.filter((a) => a.exam_id === currentExam.id))
    } catch (err) {
      setResult({ score: null, passed: null, serial: null, note: err instanceof Error ? err.message : 'Gagal mengirim jawaban.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <Link to="/ujian" className="back-link">← Daftar Ujian</Link>
      <h1>{exam.title}</h1>
      <p className="muted">
        {exam.description ?? ''}
        {' '}Nilai lulus: {exam.passing_score}
        {exam.max_attempts !== null ? ` · Maks. percobaan: ${exam.max_attempts}` : ''}
        {exam.course_id === null ? ' · Ujian ini belum terhubung ke course — sertifikat baru bisa diterbitkan setelah dihubungkan.' : ''}
        {passed ? ' · Kamu sudah lulus ujian ini.' : ''}
      </p>
      {result && (
        <p className="notice-box">
          {result.note}{' '}
          {result.serial && <Link to="/sertifikat">Lihat Sertifikat Saya</Link>}
        </p>
      )}
      {/* B24: kerjakan ulang bila percobaan masih tersisa dan belum lulus —
          tanpa ini input terkunci setelah submit pertama. */}
      {result && !blocked && !passed && enrolled !== false && !isAdmin && !isCourseMentor && (
        <p>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={() => {
              setResult(null)
              setAnswers({})
            }}
          >
            Kerjakan ulang
          </button>
        </p>
      )}
      {blocked && <p className="error-box">Batas percobaan ujian ini sudah tercapai ({exam.max_attempts} kali).</p>}
      {/* K5/K3: "Belum ada soal" hanya untuk yang boleh melihat soal
          (admin / mentor course / siswa terdaftar — atau ujian tanpa
          course, yang tidak punya enrollment untuk dicek). Siswa belum
          terdaftar di course ujian harus melihat pesan enrollment. */}
      {missingQuestions ? (
        <MigrationNotice migration="009" />
      ) : (questions ?? []).length === 0 && (isAdmin || isCourseMentor || enrolled !== false) ? (
        <p className="empty">Belum ada soal untuk ujian ini. Mentor menambahkan soal lewat Course Builder.</p>
      ) : isAdmin || isCourseMentor ? (
        <>
          <p className="muted">
            {isAdmin
              ? 'Kamu masuk sebagai admin (mode pantau): soal hanya bisa dibaca, tidak bisa dijawab.'
              : 'Kamu mentor course ini (pratinjau): soal hanya bisa dibaca — pratinjau tidak tercatat sebagai percobaan.'}
          </p>
          <ol>
            {(questions ?? []).map((q) => (
              <li key={q.id}>
                <strong>{q.question}</strong>
                {q.kind !== 'short' && Array.isArray(q.options) && q.options.length > 0 && (
                  <ul>
                    {q.options.map((opt) => (
                      <li key={String(opt)}>{String(opt)}</li>
                    ))}
                  </ul>
                )}
                {q.explanation && <p className="muted">Penjelasan: {q.explanation}</p>}
              </li>
            ))}
          </ol>
        </>
      ) : enrolled === false ? (
        <p className="notice-box">
          Ujian ini hanya bisa diikuti oleh siswa yang terdaftar di course-nya. Daftar dulu di halaman course, lalu kembali ke sini.
        </p>
      ) : (
        <form className="form" onSubmit={handleSubmit}>
          {(questions ?? []).map((q, i) => (
            <fieldset key={q.id} style={{ border: '1px solid var(--light-grey)', borderRadius: 8, padding: '0.75rem' }}>
              <legend><strong>{i + 1}. {q.question}</strong></legend>
              {q.kind === 'short' ? (
                <input
                  value={answers[q.id] ?? ''}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  placeholder="Tulis jawaban singkat…"
                  disabled={blocked || result !== null}
                  required
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {(Array.isArray(q.options) ? q.options : q.kind === 'true_false' ? ['Benar', 'Salah'] : []).map((opt) => (
                    <label key={String(opt)} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontWeight: 400 }}>
                      <input
                        type="radio"
                        name={q.id}
                        value={String(opt)}
                        checked={answers[q.id] === String(opt)}
                        onChange={() => setAnswers((a) => ({ ...a, [q.id]: String(opt) }))}
                        disabled={blocked || result !== null}
                        required
                      />
                      {String(opt)}
                    </label>
                  ))}
                </div>
              )}
              {result && q.explanation && <p className="muted">Penjelasan: {q.explanation}</p>}
            </fieldset>
          ))}
          <button type="submit" className="btn btn-primary" disabled={submitting || blocked || result !== null}>
            {submitting ? 'Mengirim…' : 'Kirim Jawaban Ujian'}
          </button>
        </form>
      )}
      <section className="section">
        <h2>Riwayat Percobaan</h2>
        {attempts.length === 0 ? (
          <p className="empty">Belum ada percobaan.</p>
        ) : (
          <ul>
            {attempts.map((a) => (
              <li key={a.id}>
                {new Date(a.attempted_at).toLocaleString('id-ID')} — Nilai:{' '}
                {a.score === null ? 'belum dinilai' : a.score} ·{' '}
                {a.passed === true ? 'Lulus' : a.passed === false ? 'Belum lulus' : 'Menunggu penilaian'}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
