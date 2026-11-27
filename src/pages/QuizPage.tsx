// SINEVERSE — Kuis: soal dimuat HANYA via get_quiz_questions() RPC (003),
// yang tidak pernah mengembalikan correct_answer. Penilaian berjalan di
// server lewat submit_quiz_attempt() (009); bila RPC itu belum ada, jawaban
// tetap tersimpan sebagai percobaan tanpa nilai + pesan jujur.
//
// Tampilan diselaraskan dengan referensi Mentari (pretest + layar soal):
// kartu "Detail Pengerjaan Quiz", banner "Quiz Sudah Selesai", satu soal
// per layar dengan navigasi PREV/NEXT, dan seksi "List Data Peserta".
// Identitas SINEVERSE tidak berubah: warna/font/class CSS yang ada dipakai
// ulang — tombol utama Mentari yang biru dipetakan ke .btn-primary
// SINEVERSE (film green), dan tombol outline biru ke .btn-ghost dengan
// aksen film green.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { isMissingTableError } from '../lib/guarded'
import { fetchEnrollment, fetchQuizAttempts, fetchQuizQuestions, supabase } from '../lib/supabase'
import type { Quiz, QuizAttempt, QuizKind, QuizQuestion } from '../lib/types'

/** Label jenis kuis (migrasi 015): kuis lama tanpa kind dibaca sebagai 'Kuis'. */
function quizKindLabel(kind?: QuizKind): string {
  if (kind === 'pretest') return 'Pretest'
  if (kind === 'posttest') return 'Posttest'
  return 'Kuis'
}

/** Label jenis soal untuk badge di kartu soal (referensi Mentari). */
function questionKindLabel(kind: QuizQuestion['kind']): string {
  if (kind === 'true_false') return 'Benar / Salah'
  if (kind === 'short') return 'Jawaban Singkat'
  return 'Multiple Choice'
}

/** Format detik menjadi MM:SS untuk timer hitung naik. */
function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Satu soal dianggap sudah dijawab bila ada jawaban tak-kosong di state. */
function isQuestionAnswered(q: QuizQuestion, answers: Record<string, string>): boolean {
  const v = answers[q.id]
  if (v === undefined) return false
  return q.kind === 'short' ? v.trim() !== '' : v !== ''
}

/**
 * Baris peserta dari RPC get_quiz_participants (migrasi 085).
 * Didefinisikan lokal di file ini saja — JANGAN pindah ke types.ts.
 * profiles SINEVERSE TIDAK punya kolom NIM, jadi tidak ada NIM di sini.
 * province / regency / school adalah NAMA hasil resolusi di RPC: kode
 * wilayah di profiles diselesaikan lewat ref_provinces / ref_regencies,
 * fallback ke schools via school_id, fallback terakhir profiles.school
 * (nama manual). Ketiganya nullable — yang kosong tampil "—" di kartu.
 */
interface QuizParticipantRow {
  user_id: string
  name: string
  score: number | null
  attempted_at: string | null
  has_attempt: boolean
  province: string | null
  regency: string | null
  school: string | null
}

export default function QuizPage() {
  const { id } = useParams<{ id: string }>()
  const { user, profile } = useAuth()
  // Mode pantau (migrasi 022): admin boleh MEMBUKA kuis untuk memantau,
  // tetapi tidak boleh mengerjakannya sebagai peserta.
  const isAdmin = profile?.role === 'admin'
  // K4: hanya siswa terdaftar di course pemilik kuis yang boleh submit;
  // mentor course mendapat pratinjau read-only (tanpa attempt tercatat).
  const [enrolled, setEnrolled] = useState<boolean | null>(null)
  const [isCourseMentor, setIsCourseMentor] = useState(false)
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [attempts, setAttempts] = useState<QuizAttempt[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ score: number | null; note: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // (a) Label pertemuan: "Pertemuan {N} · {judul lesson}".
  // N = posisi 1-based lesson di dalam course (urut modul + order_index),
  // dihitung saat load dari modules + lessons course pemilik kuis — BUKAN
  // order_index mentah (Orientasi order_index 0, jadi "Pertemuan 0" salah).
  // null bila posisi tidak bisa dihitung (fetch gagal): tampilan memakai
  // judul kuis tersimpan / label "Materi {order_index}" sebagai fallback.
  const [lessonInfo, setLessonInfo] = useState<{ order_index: number; title: string; meetingNumber: number | null } | null>(null)
  // (a) Timer hitung NAIK (elapsed), BUKAN countdown: skema SINEVERSE
  // tidak punya batas waktu kuis (tidak ada kolom durasi di quizzes),
  // jadi tidak ada "waktu tersisa" yang bisa dihitung mundur. Timer
  // HANYA berjalan saat tampilan soal terbuka (showQuestions) dan hanya
  // untuk siswa yang mengerjakan — tidak jalan di halaman detail, tidak
  // jalan saat pratinjau admin/mentor; berhenti saat jawaban dikirim.
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  // (D23) Pisah halaman detail vs soal (state toggle, tanpa route baru):
  // false = tampilan detail (kartu Detail + CTA + riwayat + peserta),
  // true = tampilan soal gaya Mentari (kembali + judul + timer + soal).
  const [showQuestions, setShowQuestions] = useState(false)
  // (d) Satu soal per layar: indeks soal yang sedang ditampilkan.
  const [currentIndex, setCurrentIndex] = useState(0)
  const [validationMsg, setValidationMsg] = useState<string | null>(null)
  // (f) List Data Peserta. null = belum dimuat / RPC belum ada (seksi
  // disembunyikan diam-diam); [] = RPC ada tapi belum ada peserta.
  const [participants, setParticipants] = useState<QuizParticipantRow[] | null>(null)
  const [pSearch, setPSearch] = useState('')
  const [pStatus, setPStatus] = useState<'all' | 'done' | 'not'>('all')
  const [pSort, setPSort] = useState<'name' | 'score' | 'recent'>('name')

  useEffect(() => {
    if (!id || !user) return
    const quizId = id
    const currentUser = user
    let cancelled = false
    async function load() {
      try {
        // Kuis, soal, dan percobaan independen (hanya butuh quizId/user)
        // — dimulai paralel; soal/percobaan baru dipakai setelah baris
        // kuis dipastikan termuat.
        const qsP = fetchQuizQuestions(quizId)
        const attsP = fetchQuizAttempts(currentUser.id)
        const { data: q, error: qErr } = await supabase
          .from('quizzes')
          .select('*')
          .eq('id', quizId)
          .maybeSingle()
        if (qErr) {
          qsP.catch(() => null)
          attsP.catch(() => [])
          throw qErr
        }
        if (cancelled) return
        setQuiz(q as Quiz | null)
        const [qs, atts] = await Promise.all([qsP, attsP])
        if (cancelled) return
        if (qs === null) setMissing(true)
        else setQuestions(qs)
        setAttempts(atts.filter((a) => a.quiz_id === quizId))
        // K4: tentukan course pemilik kuis lewat lesson -> module -> course,
        // lalu cek enrollment + apakah pengguna mentor course ini.
        // Select diperluas: title + order_index lesson + posisi lesson di
        // dalam course untuk nomor pertemuan (D23).
        try {
          const { data: lRow } = await supabase
            .from('lessons')
            .select('module_id, title, order_index, modules(course_id)')
            .eq('id', (q as Quiz).lesson_id)
            .maybeSingle()
          const typedRow = lRow as unknown as {
            modules?: { course_id?: string }
            module_id?: string
            title?: string
            order_index?: number
          } | null
          const cid = typedRow?.modules?.course_id
          if (!cancelled && typeof typedRow?.title === 'string' && typeof typedRow?.order_index === 'number') {
            // Nomor pertemuan = posisi 1-based lesson di dalam course
            // (urut module.order_index lalu lesson.order_index) — sama
            // dengan urutan fetchCourseLessons. Gagal hitung = null.
            let meetingNumber: number | null = null
            if (cid) {
              try {
                const { data: mods } = await supabase
                  .from('modules')
                  .select('id, order_index')
                  .eq('course_id', cid)
                  .order('order_index', { ascending: true })
                const modRows = (mods ?? []) as { id: string; order_index: number }[]
                const modOrder = new Map(modRows.map((m) => [m.id, m.order_index ?? 0]))
                const { data: lRows } = await supabase
                  .from('lessons')
                  .select('id, module_id, order_index')
                  .in('module_id', modRows.map((m) => m.id))
                const sorted = ((lRows ?? []) as { id: string; module_id: string; order_index: number }[])
                  .sort((a, b) => (modOrder.get(a.module_id) ?? 0) - (modOrder.get(b.module_id) ?? 0)
                    || (a.order_index ?? 0) - (b.order_index ?? 0))
                const pos = sorted.findIndex((r) => r.id === (q as Quiz).lesson_id)
                if (pos >= 0) meetingNumber = pos + 1
              } catch {
                meetingNumber = null
              }
            }
            setLessonInfo({ order_index: typedRow.order_index, title: typedRow.title, meetingNumber })
          }
          if (cid) {
            const [enr, { data: cRow }] = await Promise.all([
              fetchEnrollment(currentUser.id, cid),
              supabase.from('courses').select('mentor_id').eq('id', cid).maybeSingle(),
            ])
            if (!cancelled) {
              setEnrolled(enr !== null)
              setIsCourseMentor((cRow as { mentor_id?: string } | null)?.mentor_id === currentUser.id)
            }
          } else if (!cancelled) {
            setEnrolled(false)
          }
        } catch {
          if (!cancelled) setEnrolled(false)
        }
      } catch (err) {
        if (!cancelled) {
          if (isMissingTableError(err)) setMissing(true)
          else setError(err instanceof Error ? err.message : 'Gagal memuat kuis.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id, user])

  // (a) Timer hitung naik: HANYA berjalan saat tampilan soal terbuka
  // (showQuestions) dan hanya untuk siswa yang mengerjakan — tidak jalan
  // di halaman detail, tidak jalan saat pratinjau admin/mentor; berhenti
  // saat jawaban dikirim (result terisi). "Kerjakan ulang" mengeset
  // result null + elapsed 0 sehingga timer berjalan lagi dari awal.
  useEffect(() => {
    if (!showQuestions || result !== null || isAdmin || isCourseMentor || enrolled !== true) return
    const t = window.setInterval(() => setElapsedSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(t)
  }, [showQuestions, result, isAdmin, isCourseMentor, enrolled])

  // (f) List Data Peserta via RPC get_quiz_participants (migrasi 085).
  // Hanya untuk yang terdaftar / mentor course / admin. Bila RPC belum
  // ada (PGRST202 / error lain), seksi disembunyikan diam-diam.
  // refreshParticipants dipakai juga setelah submit (D23, butir 7): kartu
  // Detail + List Data Peserta harus langsung menampilkan hasil terbaru
  // tanpa reload.
  async function refreshParticipants() {
    if (!id) return
    if (!(enrolled === true || isCourseMentor || isAdmin)) return
    try {
      const { data, error: rpcErr } = await supabase.rpc('get_quiz_participants', { p_quiz_id: id })
      if (rpcErr || !data) return
      setParticipants(data as QuizParticipantRow[])
    } catch {
      // RPC belum ada: sembunyikan seksi tanpa merusak halaman.
    }
  }
  useEffect(() => {
    void refreshParticipants()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, enrolled, isCourseMentor, isAdmin])

  // (D23) Judul tampil (display, bukan di DB): "Pretest - Pertemuan N" /
  // "Posttest - Pertemuan N" untuk kind pretest/posttest; kind 'quiz'
  // biasa memakai judul tersimpan. Bila N tidak diketahui, judul
  // tersimpan dipakai apa adanya (tanpa mengarang nomor pertemuan).
  const meetingNumber = lessonInfo?.meetingNumber ?? null
  const displayTitle =
    quiz && (quiz.kind === 'pretest' || quiz.kind === 'posttest') && meetingNumber !== null
      ? `${quizKindLabel(quiz.kind)} - Pertemuan ${meetingNumber}`
      : (quiz?.title ?? 'Kuis')

  if (loading) return <div className="page"><p className="muted">Memuat kuis…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (!quiz) return <div className="page"><p className="empty">Kuis tidak ditemukan.</p><Link to="/akademi">Kembali ke Akademi</Link></div>
  if (missing) return <div className="page"><h1>{displayTitle}</h1><p className="muted">{quizKindLabel(quiz.kind)}</p><MigrationNotice migration="003" /></div>

  const maxAttempts = (quiz as Quiz & { max_attempts?: number | null }).max_attempts ?? null
  const blocked = maxAttempts !== null && attempts.length >= maxAttempts
  const best = attempts.reduce<number | null>(
    (acc, a) => (a.score === null ? acc : acc === null ? a.score : Math.max(acc, a.score)),
    null,
  )
  const latestAttempt = attempts.reduce<QuizAttempt | null>(
    (acc, a) => (!acc || new Date(a.attempted_at).getTime() > new Date(acc.attempted_at).getTime() ? a : acc),
    null,
  )
  const lessonLabel = lessonInfo
    ? meetingNumber !== null
      ? `Pertemuan ${meetingNumber} · ${lessonInfo.title}`
      : `Materi ${lessonInfo.order_index} · ${lessonInfo.title}`
    : null
  const totalQuestions = questions?.length ?? 0
  // Indeks aman: bila soal berkurang (mis. setelah muat ulang), jangan
  // keluar dari rentang.
  const safeIndex = totalQuestions === 0 ? 0 : Math.min(currentIndex, totalQuestions - 1)
  const currentQuestion = totalQuestions === 0 ? null : (questions as QuizQuestion[])[safeIndex]
  const hasAttempts = attempts.length > 0

  function goPrev() {
    setValidationMsg(null)
    setCurrentIndex((i) => Math.max(0, i - 1))
  }
  function goNext() {
    setValidationMsg(null)
    setCurrentIndex((i) => Math.min(totalQuestions - 1, i + 1))
  }
  // (D23) Buka tampilan soal: mulai dari soal pertama, timer dari 0.
  function openQuestions() {
    setValidationMsg(null)
    setCurrentIndex(0)
    setElapsedSeconds(0)
    setShowQuestions(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const currentQuiz = quiz
    if (!user || !questions || !currentQuiz) return
    // Admin hanya memantau (migrasi 022): RPC juga menolak, ini pesan jelasnya.
    if (isAdmin) {
      setResult({ score: null, note: 'Kamu masuk sebagai admin (mode pantau). Admin tidak mengerjakan kuis.' })
      return
    }
    // K4: pratinjau mentor tidak tercatat sebagai attempt; hanya siswa
    // terdaftar di course ini yang boleh mengerjakan kuis.
    if (isCourseMentor) {
      setResult({ score: null, note: 'Kamu mentor course ini (pratinjau). Pratinjau tidak tercatat sebagai percobaan.' })
      return
    }
    if (enrolled !== true) {
      setResult({ score: null, note: 'Kuis ini hanya bisa dikerjakan oleh siswa yang terdaftar di course-nya. Daftar dulu di halaman course.' })
      return
    }
    // (d) Semua jawaban wajib terisi: bila ada soal belum dijawab,
    // tampilkan pesan dan lompat ke soal pertama yang belum dijawab.
    const firstUnanswered = questions.findIndex((q) => !isQuestionAnswered(q, answers))
    if (firstUnanswered !== -1) {
      const unansweredCount = questions.filter((q) => !isQuestionAnswered(q, answers)).length
      setCurrentIndex(firstUnanswered)
      setValidationMsg(
        `Masih ada ${unansweredCount} soal belum dijawab. Jawab soal ${firstUnanswered + 1} dulu sebelum mengirim jawaban.`,
      )
      return
    }
    setValidationMsg(null)
    setSubmitting(true)
    setResult(null)
    try {
      const { data, error: rpcErr } = await supabase.rpc('submit_quiz_attempt', {
        p_quiz_id: currentQuiz.id,
        p_answers: answers,
      })
      if (rpcErr) {
        if (isMissingTableError(rpcErr) || String(rpcErr.code) === 'PGRST202') {
          // RPC penilaian belum ada (migrasi 009 belum dijalankan): simpan
          // jawaban sebagai percobaan tanpa nilai, jangan karang nilai.
          const { error: insErr } = await supabase.from('quiz_attempts').insert({
            quiz_id: currentQuiz.id,
            user_id: user.id,
            score: null,
            answers,
          })
          if (insErr) throw insErr
          setResult({
            score: null,
            note: 'Jawabanmu tersimpan. Nilai otomatis belum tersedia — RPC penilaian di migrasi 009 belum dijalankan (lihat supabase/README.md).',
          })
        } else throw rpcErr
      } else {
        setResult({
          score: (data as number | null) ?? null,
          note: (data as number | null) === null
            ? 'Kuis ini belum punya soal yang bisa dinilai.'
            : `Nilai kamu: ${data}. Nilai lulus: ${currentQuiz.passing_score}.`,
        })
      }
      const atts = await fetchQuizAttempts(user.id)
      setAttempts(atts.filter((a) => a.quiz_id === currentQuiz.id))
      // (D23, butir 7) Refetch peserta juga, supaya kartu Detail + List
      // Data Peserta langsung menampilkan hasil terbaru tanpa reload
      // (sebelumnya basi sampai reload — LAPORAN.md §8.4 butir 4).
      await refreshParticipants()
      // Kembali ke tampilan detail dengan hasil terbaru.
      setShowQuestions(false)
    } catch (err) {
      setResult({ score: null, note: err instanceof Error ? err.message : 'Gagal mengirim jawaban.' })
    } finally {
      setSubmitting(false)
    }
  }

  // (d) Kartu satu soal: nomor + badge jenis + badge status jawab +
  // label pertemuan + teks soal + pilihan A-E (radio) / isian singkat.
  // `interactive` false = pratinjau mentor/admin (read-only, tanpa form).
  function renderQuestionCard(q: QuizQuestion, idx: number, interactive: boolean) {
    const answered = isQuestionAnswered(q, answers)
    const opts = Array.isArray(q.options) ? q.options : q.kind === 'true_false' ? ['Benar', 'Salah'] : []
    return (
      <div
        key={q.id}
        style={{ border: '1px solid var(--light-grey)', borderRadius: 8, padding: '0.75rem' }}
      >
        <p style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', margin: '0 0 0.5rem' }}>
          <strong>{idx + 1}.</strong>
          <span className="chip chip-success">{questionKindLabel(q.kind)}</span>
          {interactive && (
            answered ? (
              <span className="chip" style={{ border: '1px solid var(--film-green)', color: 'var(--film-green)', background: '#fff' }}>Sudah dijawab</span>
            ) : (
              <span className="chip">Belum dijawab</span>
            )
          )}
        </p>
        {lessonLabel && <p style={{ margin: '0 0 0.5rem' }}><strong>{lessonLabel}</strong></p>}
        <p style={{ margin: '0 0 0.75rem' }}><strong>{q.question}</strong></p>
        {q.kind === 'short' ? (
          interactive ? (
            <input
              value={answers[q.id] ?? ''}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              placeholder="Tulis jawaban singkat…"
              disabled={blocked || result !== null}
              style={{ width: '100%' }}
            />
          ) : (
            <p className="muted">Jawaban singkat (pratinjau).</p>
          )
        ) : interactive ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {opts.map((opt, oi) => (
              <label key={String(opt)} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontWeight: 400 }}>
                <input
                  type="radio"
                  name={q.id}
                  value={String(opt)}
                  checked={answers[q.id] === String(opt)}
                  onChange={() => setAnswers((a) => ({ ...a, [q.id]: String(opt) }))}
                  disabled={blocked || result !== null}
                />
                <strong>{String.fromCharCode(65 + oi)}.</strong> {String(opt)}
              </label>
            ))}
          </div>
        ) : (
          <ul>
            {opts.map((opt, oi) => (
              <li key={String(opt)}><strong>{String.fromCharCode(65 + oi)}.</strong> {String(opt)}</li>
            ))}
          </ul>
        )}
        {(!interactive || result) && q.explanation && <p className="muted">Penjelasan: {q.explanation}</p>}
      </div>
    )
  }

  // (d) Navigasi bawah: PREV di kiri, NEXT (outline) / Kirim Jawaban di kanan.
  function renderNav(interactive: boolean) {
    const isLast = safeIndex >= totalQuestions - 1
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginTop: '1rem' }}>
        <button type="button" className="btn btn-ghost" onClick={goPrev} disabled={safeIndex === 0}>
          ← PREV
        </button>
        {isLast ? (
          interactive ? (
            <button type="submit" className="btn btn-primary" disabled={submitting || blocked || result !== null}>
              {submitting ? 'Mengirim…' : 'Kirim Jawaban'}
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" disabled>
              NEXT →
            </button>
          )
        ) : (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ color: 'var(--film-green)', borderColor: 'var(--film-green)' }}
            onClick={goNext}
          >
            NEXT →
          </button>
        )}
      </div>
    )
  }

  // (f) Filter + urut peserta (hanya dihitung bila seksi ditampilkan).
  const visibleParticipants = (participants ?? [])
    .filter((p) => {
      const q = pSearch.trim().toLowerCase()
      if (q === '') return true
      return p.name.toLowerCase().includes(q) || (p.school ?? '').toLowerCase().includes(q)
    })
    .filter((p) => (pStatus === 'all' ? true : pStatus === 'done' ? p.has_attempt : !p.has_attempt))
    .sort((a, b) => {
      if (pSort === 'score') return (b.score ?? -1) - (a.score ?? -1)
      if (pSort === 'recent') {
        const ta = a.attempted_at ? new Date(a.attempted_at).getTime() : 0
        const tb = b.attempted_at ? new Date(b.attempted_at).getTime() : 0
        return tb - ta
      }
      return a.name.localeCompare(b.name, 'id')
    })
  const showParticipants = participants !== null && (enrolled === true || isCourseMentor || isAdmin)

  return (
    <div className="page">
      {/* (a) Bar atas tampilan DETAIL: tombol kembali + judul tampil +
          label pertemuan. Tanpa kotak timer — timer hanya tampil dan
          berjalan di tampilan soal (D23). */}
      <div>
        <Link to="/akademi" className="back-link">← Akademi</Link>
        <h1>{displayTitle}</h1>
        {lessonLabel && <p className="muted" style={{ marginBottom: 0 }}>{lessonLabel}</p>}
      </div>
      {/* Instruksi Mentari di bawah judul, halaman detail pretest/posttest. */}
      {(quiz.kind === 'pretest' || quiz.kind === 'posttest') && (
        <p><strong>KERJAKAN DENGAN CEPAT DAN TEPAT</strong></p>
      )}
      <p className="muted">
        {quizKindLabel(quiz.kind)} · Nilai lulus: {quiz.passing_score}
        {maxAttempts !== null ? ` · Maks. percobaan: ${maxAttempts}` : ' · Tanpa batas percobaan di skema'}
        {best !== null ? ` · Nilai terbaikmu: ${best}` : ''}
      </p>

      {/* P34: hasil lulus/gagal tampil berbeda — sebelumnya kedua cabang
          ternary memakai 'notice-box' yang sama (ternary mati). */}
      {result && <p className={result.score !== null && result.score >= quiz.passing_score ? 'notice-box' : 'error-box'}>{result.note}</p>}
      {/* B24: kerjakan ulang bila percobaan masih tersisa — tanpa ini
          input terkunci setelah submit pertama dan hanya reload halaman
          yang bisa mengulang. */}
      {result && !blocked && enrolled === true && (
        <p>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={() => {
              setResult(null)
              setAnswers({})
              setCurrentIndex(0)
              setElapsedSeconds(0)
              setValidationMsg(null)
              setShowQuestions(true)
            }}
          >
            Kerjakan ulang
          </button>
        </p>
      )}
      {blocked && <p className="error-box">Batas percobaan kuis ini sudah tercapai ({maxAttempts} kali).</p>}

      {/* (b) Kartu "Detail Pengerjaan Quiz" di atas form. */}
      <section
        style={{
          border: '1px solid var(--light-grey)',
          borderRadius: 8,
          padding: '1rem',
          marginBottom: '1rem',
          background: '#fff',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Detail Pengerjaan Quiz</h2>
        {/* Pil status gaya OUTLINE di kanan atas (ala kartu Mentari):
            hijau outline bila sudah, outline redup bila belum. */}
        <p style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <strong>Quiz</strong>
          {hasAttempts ? (
            <span className="badge-outline-pass">Sudah Mengerjakan Quiz</span>
          ) : (
            <span className="badge-outline-idle">Belum Mengerjakan Quiz</span>
          )}
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>Grade</p>
        <p style={{ marginTop: 0 }}><strong>{best !== null ? best : '—'}</strong></p>
        <p className="muted" style={{ marginBottom: 0 }}>Selesai</p>
        <p style={{ marginTop: 0 }}>{latestAttempt ? new Date(latestAttempt.attempted_at).toLocaleString('id-ID') : '—'}</p>
        <p className="muted" style={{ marginBottom: 0 }}>Waktu Penyelesaian</p>
        {/* quiz_attempts TIDAK punya kolom durasi/started_at — jangan
            dikarang; tampilkan "—" sampai skema mencatat durasi. */}
        <p style={{ marginTop: 0 }}>—</p>
        {/* Admin/mentor (mode pantau/pratinjau) melihat soal read-only:
            tombolnya "LIHAT SOAL", bukan "KERJAKAN QUIZ". */}
        <button type="button" className="btn btn-primary" onClick={openQuestions}>
          {isAdmin || isCourseMentor ? 'LIHAT SOAL' : '▶ KERJAKAN QUIZ'}
        </button>
      </section>

      {/* (c) Banner "Quiz Sudah Selesai" bila sudah ada percobaan
          (tampil sebelum kerjakan ulang; setelah submit, kotak hasil
          di atas yang berbicara). */}
      {hasAttempts && result === null && (
        <p className="notice-box">Quiz Sudah Selesai</p>
      )}

      {/* (D23) Soal HANYA tampil setelah klik KERJAKAN QUIZ / LIHAT SOAL
          (showQuestions): tampilan soal gaya Mentari — tombol kembali ke
          detail + judul Pretest/Posttest + timer kanan atas. Tampilan
          detail di atas tidak lagi memuat soal. */}
      {showQuestions && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowQuestions(false)}>
                ←
              </button>
              <h2 style={{ margin: 0 }}>{quizKindLabel(quiz.kind)}</h2>
            </div>
            <p
              style={{
                border: '1px solid var(--light-grey)',
                borderRadius: 8,
                padding: '0.5rem 0.75rem',
                margin: 0,
                whiteSpace: 'nowrap',
              }}
            >
              Waktu pengerjaan: <strong>{formatElapsed(elapsedSeconds)}</strong>
            </p>
          </div>
          {lessonLabel && <p className="muted">{lessonLabel}</p>}
          {hasAttempts && result === null && (
            <p className="notice-box">Quiz Sudah Selesai</p>
          )}
          {/* K3: "Belum ada soal" hanya tampil untuk yang memang boleh melihat
            soal (admin / mentor course / siswa terdaftar). Siswa belum
            terdaftar harus melihat pesan enrollment di bawah, bukan status
            kosong soal — walau soalnya ada. */}
        {totalQuestions === 0 && (isAdmin || isCourseMentor || enrolled !== false) ? (
          <p className="empty">Belum ada soal untuk kuis ini. Mentor menambahkan soal lewat Course Builder.</p>
        ) : isAdmin || isCourseMentor ? (
          <>
            <p className="muted">
              {isAdmin
                ? 'Kamu masuk sebagai admin (mode pantau): soal hanya bisa dibaca, tidak bisa dijawab.'
                : 'Kamu mentor course ini (pratinjau): soal hanya bisa dibaca — pratinjau tidak tercatat sebagai percobaan dan tidak menggelembungkan hitungan Attempt.'}
            </p>
            {currentQuestion && (
              <>
                <p className="muted">Soal {safeIndex + 1} dari {totalQuestions}</p>
                {renderQuestionCard(currentQuestion, safeIndex, false)}
                {renderNav(false)}
              </>
            )}
          </>
        ) : enrolled !== true ? (
          <p className="notice-box">
            Kuis ini hanya bisa dikerjakan oleh siswa yang terdaftar di course-nya. Daftar dulu di halaman course, lalu kembali ke sini.
          </p>
        ) : (
          <form className="form" onSubmit={handleSubmit}>
            {currentQuestion && (
              <>
                <p className="muted" style={{ margin: 0 }}>Soal {safeIndex + 1} dari {totalQuestions}</p>
                {renderQuestionCard(currentQuestion, safeIndex, true)}
              </>
            )}
            {validationMsg && <p className="error-box" style={{ margin: 0 }}>{validationMsg}</p>}
            {renderNav(true)}
          </form>
        )}
        </div>
      )}

      {/* Riwayat + peserta hanya di tampilan detail, bukan di tampilan soal. */}
      {!showQuestions && (
        <>
      <section className="section">
        <h2>Riwayat Percobaan</h2>
        {attempts.length === 0 ? (
          <p className="empty">Belum ada percobaan.</p>
        ) : (
          <ul>
            {attempts.map((a) => (
              <li key={a.id}>
                {new Date(a.attempted_at).toLocaleString('id-ID')} — Nilai:{' '}
                {a.score === null ? 'belum dinilai' : a.score}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* (f) List Data Peserta — hanya bila pemanggil terdaftar / mentor /
          admin DAN RPC get_quiz_participants ada (bila tidak ada, seksi
          ini tidak dirender sama sekali). Tanpa NIM: profiles SINEVERSE
          tidak punya kolom NIM. */}
      {showParticipants && (
        <section className="section">
          <h2>List Data Peserta</h2>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <input
              value={pSearch}
              onChange={(e) => setPSearch(e.target.value)}
              placeholder="Cari Peserta (Nama / Sekolah)"
              style={{ flex: '1 1 200px', padding: '0.5rem 0.75rem', border: '1px solid var(--light-grey)', borderRadius: 8, fontFamily: 'var(--font)' }}
            />
            <select
              value={pStatus}
              onChange={(e) => setPStatus(e.target.value as 'all' | 'done' | 'not')}
              aria-label="Status Quiz"
              style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--light-grey)', borderRadius: 8, fontFamily: 'var(--font)' }}
            >
              <option value="all">Semua Status Quiz</option>
              <option value="done">Sudah Mengerjakan</option>
              <option value="not">Belum Mengerjakan</option>
            </select>
            <select
              value={pSort}
              onChange={(e) => setPSort(e.target.value as 'name' | 'score' | 'recent')}
              aria-label="Urut Berdasarkan"
              style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--light-grey)', borderRadius: 8, fontFamily: 'var(--font)' }}
            >
              <option value="name">Nama A-Z</option>
              <option value="score">Nilai Tertinggi</option>
              <option value="recent">Terbaru</option>
            </select>
          </div>
          {(participants ?? []).length === 0 ? (
            <p className="empty">Belum ada peserta.</p>
          ) : visibleParticipants.length === 0 ? (
            <p className="empty">Tidak ada peserta yang cocok dengan filter.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {visibleParticipants.map((p) => (
                <li
                  key={p.user_id}
                  style={{ border: '1px solid var(--light-grey)', borderRadius: 8, padding: '1rem', background: '#fff' }}
                >
                  {/* Nama HURUF BESAR ala kartu peserta Mentari. */}
                  <p style={{ margin: '0 0 0.5rem' }}><strong>{p.name.toUpperCase()}</strong></p>
                  <p className="muted" style={{ marginBottom: 0 }}>Provinsi</p>
                  <p style={{ marginTop: 0 }}>{p.province ?? '—'}</p>
                  <p className="muted" style={{ marginBottom: 0 }}>Kab/Kota</p>
                  <p style={{ marginTop: 0 }}>{p.regency ?? '—'}</p>
                  <p className="muted" style={{ marginBottom: 0 }}>Asal Sekolah</p>
                  <p style={{ marginTop: 0 }}>{p.school ?? '—'}</p>
                  {/* Kotak dalam berbingkai berisi pil status + Grade +
                      Selesai + Waktu Penyelesaian (ala kartu Mentari). */}
                  <div style={{ border: '1px solid var(--light-grey)', borderRadius: 8, padding: '0.75rem' }}>
                    <p style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', margin: '0 0 0.5rem' }}>
                      <strong>Quiz</strong>
                      {p.has_attempt ? (
                        <span className="badge-outline-pass">Sudah Mengerjakan Quiz</span>
                      ) : (
                        <span className="badge-outline-idle">Belum Mengerjakan Quiz</span>
                      )}
                    </p>
                    <p className="muted" style={{ marginBottom: 0 }}>Grade</p>
                    <p style={{ marginTop: 0 }}><strong>{p.score === null ? '—' : p.score}</strong></p>
                    <p className="muted" style={{ marginBottom: 0 }}>Selesai</p>
                    <p style={{ marginTop: 0 }}>{p.attempted_at ? new Date(p.attempted_at).toLocaleString('id-ID') : '—'}</p>
                    <p className="muted" style={{ marginBottom: 0 }}>Waktu Penyelesaian</p>
                    {/* RPC tidak mengembalikan durasi (quiz_attempts tidak
                        punya kolom durasi/started_at) — tampilkan "—". */}
                    <p style={{ marginBottom: 0 }}>—</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
        </>
      )}
    </div>
  )
}
