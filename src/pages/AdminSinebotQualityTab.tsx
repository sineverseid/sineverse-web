// SINEVERSE — Admin SINEBOT: tab Feedback & Kualitas (Tahap 5).
//
// Menampilkan metrik kualitas dari RPC admin_sinebot_quality lewat
// getSinebotQuality() milik Worker B (src/lib/sinebotAdmin.ts) — fungsi
// itu TIDAK ditulis ulang di sini. Bentuk hasil mengikuti kontrak Tahap 5:
// {ai_messages_total, ai_sourced, ai_sourced_pct (number|null),
// ai_unsourced, feedback_helpful, feedback_not_helpful,
// escalations_to_ticket, unanswered: [{conversation_id, question
// (string|null), asked_at}]}.
//
// Yang SENGAJA tidak ditampilkan sebagai angka: waktu respons AI, error
// rate, dan biaya token — ketiganya tidak dilacak di mana pun, jadi
// tampil sebagai baris keterangan "Belum dilacak", bukan angka karangan.
import { useEffect, useState } from 'react'
import { fmtDate } from '../lib/guarded'
import { getSinebotQuality } from '../lib/sinebotAdmin'
import type { SinebotQuality } from '../lib/sinebotAdmin'

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Belum ada data'
  return `${Math.round(value * 100) / 100}%`
}

export default function AdminSinebotQualityTab() {
  const [data, setData] = useState<SinebotQuality | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      // getSinebotQuality milik Worker B (tipe SinebotQuality juga dari
      // sana); tidak ditulis ulang di sini.
      setData(await getSinebotQuality())
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Data kualitas SINEBOT tidak bisa dimuat. Coba lagi nanti.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return <p className="muted">Memuat data kualitas SINEBOT…</p>
  if (error) {
    return (
      <div>
        <p className="error-box">{error}</p>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => void load()}>
          Coba lagi
        </button>
      </div>
    )
  }
  if (!data) return <p className="empty">Belum ada data kualitas SINEBOT.</p>

  const helpful = data.feedback_helpful
  const notHelpful = data.feedback_not_helpful
  const feedbackTotal = helpful + notHelpful
  const helpfulPct =
    feedbackTotal > 0 ? `${Math.round((helpful / feedbackTotal) * 100)}%` : null
  const unanswered = data.unanswered

  return (
    <div>
      <p className="muted">
        Ringkasan kualitas jawaban SINEBOT dari feedback pengguna dan sumber Knowledge
        Base. Angka dihitung dari data nyata — yang belum dilacak ditulis apa adanya.
      </p>

      <section className="section" aria-label="Feedback pengguna">
        <h2>Feedback Pengguna</h2>
        {feedbackTotal === 0 ? (
          <p className="empty">Belum ada feedback.</p>
        ) : (
          <>
            <dl className="profile-list">
              <div>
                <dt>Membantu</dt>
                <dd>{helpful}</dd>
              </div>
              <div>
                <dt>Tidak membantu</dt>
                <dd>{notHelpful}</dd>
              </div>
              <div>
                <dt>Tingkat helpful</dt>
                <dd>{helpfulPct ?? '—'}</dd>
              </div>
            </dl>
            <div
              className="sinebot-kb-meter"
              role="img"
              aria-label={`${helpful} dari ${feedbackTotal} feedback menilai jawaban membantu`}
            >
              <div
                className="sinebot-kb-meter-fill"
                style={{ width: `${feedbackTotal > 0 ? (helpful / feedbackTotal) * 100 : 0}%` }}
              />
            </div>
          </>
        )}
      </section>

      <section className="section" aria-label="Jawaban bersumber">
        <h2>Jawaban Bersumber</h2>
        <dl className="profile-list">
          <div>
            <dt>Total pesan AI</dt>
            <dd>{data.ai_messages_total}</dd>
          </div>
          <div>
            <dt>Jawaban bersumber KB</dt>
            <dd>{data.ai_sourced}</dd>
          </div>
          <div>
            <dt>Jawaban tanpa sumber</dt>
            <dd>{data.ai_unsourced}</dd>
          </div>
          <div>
            <dt>Persentase bersumber</dt>
            <dd>{formatPct(data.ai_sourced_pct)}</dd>
          </div>
          <div>
            <dt>Eskalasi ke tiket</dt>
            <dd>{data.escalations_to_ticket}</dd>
          </div>
        </dl>
      </section>

      <section className="section" aria-label="Pertanyaan tanpa sumber">
        <h2>Pertanyaan Tanpa Sumber ({unanswered.length})</h2>
        <p className="muted">
          Pertanyaan pengguna yang dijawab AI tanpa mengutip sumber Knowledge Base —
          kandidat utama artikel/FAQ baru.
        </p>
        {unanswered.length === 0 ? (
          <p className="empty">Tidak ada pertanyaan tanpa sumber.</p>
        ) : (
          <ul className="discussion-list">
            {unanswered.map((u) => (
              <li key={u.conversation_id} className="discussion-item">
                <p className="discussion-meta">{fmtDate(u.asked_at)}</p>
                <p>
                  <strong>{u.question ?? '—'}</strong>
                </p>
                <p className="muted">
                  Percakapan: {u.conversation_id.slice(0, 8)}…
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-label="Metrik yang belum dilacak">
        <h2>Belum Dilacak</h2>
        <dl className="profile-list">
          <div>
            <dt>Waktu respons AI</dt>
            <dd>Belum dilacak</dd>
          </div>
          <div>
            <dt>Error rate</dt>
            <dd>Belum dilacak</dd>
          </div>
          <div>
            <dt>Biaya token</dt>
            <dd>Belum dilacak</dd>
          </div>
        </dl>
        <p className="muted">
          Ketiga metrik ini tidak dicatat di mana pun di Tahap 5 — menampilkannya sebagai
          angka akan mengarang data. Pelacakan ketiganya butuh pencatatan di Edge
          Function / tabel baru dan ditunda ke tahap berikutnya.
        </p>
      </section>

      <p>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => void load()}>
          Muat ulang data
        </button>
      </p>
    </div>
  )
}
