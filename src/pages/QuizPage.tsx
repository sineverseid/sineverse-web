// SINEVERSE — Kuis: soal dimuat HANYA via get_quiz_questions() RPC (003),
// yang tidak pernah mengembalikan correct_answer. Penilaian berjalan di
// server lewat submit_quiz_attempt() (009); bila RPC itu belum ada, jawaban
// tetap tersimpan sebagai percobaan tanpa nilai + pesan jujur.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { isMissingTableError } from '../lib/guarded'
import { fetchQuizAttempts, fetchQuizQuestions, supabase } from '../lib/supabase'
import type { Quiz, QuizAttempt, QuizQuestion } from '../lib/types'

export default function QuizPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [attempts, setAttempts] = useState<QuizAttempt[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ score: number | null; note: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!id || !user) return
    const quizId = id
    const currentUser = user
    let cancelled = false
    async function load() {
      try {
        const { data: q, error: qErr } = await supabase
          .from('quizzes')
          .select('*')
          .eq('id', quizId)
          .maybeSingle()
        if (qErr) throw qErr
        if (cancelled) return
        setQuiz(q as Quiz | null)
        const [qs, atts] = await Promise.all([
          fetchQuizQuestions(quizId),
          fetchQuizAttempts(currentUser.id),
        ])
        if (cancelled) return
        if (qs === null) setMissing(true)
        else setQuestions(qs)
        setAttempts(atts.filter((a) => a.quiz_id === quizId))
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

  if (loading) return <div className="page"><p className="muted">Memuat kuis…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (!quiz) return <div className="page"><p className="empty">Kuis tidak ditemukan.</p><Link to="/akademi">Kembali ke Akademi</Link></div>
  if (missing) return <div className="page"><h1>{quiz.title}</h1><MigrationNotice migration="003" /></div>

  const maxAttempts = (quiz as Quiz & { max_attempts?: number | null }).max_attempts ?? null
  const blocked = maxAttempts !== null && attempts.length >= maxAttempts
  const best = attempts.reduce<number | null>(
    (acc, a) => (a.score === null ? acc : acc === null ? a.score : Math.max(acc, a.score)),
    null,
  )

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const currentQuiz = quiz
    if (!user || !questions || !currentQuiz) return
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
    } catch (err) {
      setResult({ score: null, note: err instanceof Error ? err.message : 'Gagal mengirim jawaban.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <Link to="/akademi" className="back-link">← Akademi</Link>
      <h1>{quiz.title}</h1>
      <p className="muted">
        Nilai lulus: {quiz.passing_score}
        {maxAttempts !== null ? ` · Maks. percobaan: ${maxAttempts}` : ' · Tanpa batas percobaan di skema'}
        {best !== null ? ` · Nilai terbaikmu: ${best}` : ''}
      </p>

      {result && <p className={result.score !== null && result.score >= quiz.passing_score ? 'notice-box' : 'notice-box'}>{result.note}</p>}
      {blocked && <p className="error-box">Batas percobaan kuis ini sudah tercapai ({maxAttempts} kali).</p>}

      {(questions ?? []).length === 0 ? (
        <p className="empty">Belum ada soal untuk kuis ini. Mentor menambahkan soal lewat Course Builder.</p>
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
            {submitting ? 'Mengirim…' : 'Kirim Jawaban'}
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
                {a.score === null ? 'belum dinilai' : a.score}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
