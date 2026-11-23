// SINEVERSE — Admin SINEBOT: tab Feedback & Kualitas (Tahap 5; metrik
// kinerja Tahap 6).
//
// Menampilkan metrik kualitas dari RPC admin_sinebot_quality lewat
// getSinebotQuality() milik Worker B (src/lib/sinebotAdmin.ts) — fungsi
// itu TIDAK ditulis ulang di sini. Bentuk hasil mengikuti kontrak Tahap 5
// ditambah kunci metrik Tahap 6 (migrasi 055, sinebot_metrics):
// {ai_messages_total, ai_sourced, ai_sourced_pct (number|null),
// ai_unsourced, feedback_helpful, feedback_not_helpful,
// escalations_to_ticket, unanswered: [{conversation_id, question
// (string|null — sejak Tahap 6 berisi teks pertanyaan asli), asked_at}],
// avg_response_ms, p95_response_ms, error_rate (fraksi 0-1),
// total_requests, total_tokens, requests_by_provider, tokens_by_provider,
// blocked_injections}.
//
// Biaya uang TIDAK ditampilkan: semua provider pada tier gratis, jadi
// token dicatat apa adanya dan rupiah tidak dikarang.
import { useEffect, useState } from 'react'
import { fmtDate } from '../lib/guarded'
import { getSinebotQuality } from '../lib/sinebotAdmin'
import type { SinebotQuality } from '../lib/sinebotAdmin'

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Belum ada data'
  // RPC mengembalikan fraksi (0.8 = 80%); bila sudah persen (>1) dipakai apa adanya.
  const pct = value > 1 ? value : value * 100
  return `${Math.round(pct)}%`
}

/** Milidetik dari RPC (number|null) — "—" bila belum ada data metrik. */
function formatMs(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${Math.round(value)} ms`
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
  // Rincian per provider: gabungkan kunci requests_by_provider dan
  // tokens_by_provider supaya provider yang hanya muncul di satu sisi
  // tetap tampil (angka sisi lain = 0).
  const providerNames = Array.from(
    new Set([
      ...Object.keys(data.requests_by_provider),
      ...Object.keys(data.tokens_by_provider),
    ]),
  ).sort()

  return (
    <div>
      <p className="muted">
        Ringkasan kualitas jawaban SINEBOT dari feedback pengguna, sumber Knowledge
        Base, dan metrik kinerja AI. Angka dihitung dari data nyata.
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

      <section className="section" aria-label="Kinerja AI">
        <h2>Kinerja AI</h2>
        <dl className="profile-list">
          <div>
            <dt>Waktu respons rata-rata</dt>
            <dd>{formatMs(data.avg_response_ms)}</dd>
          </div>
          <div>
            <dt>Waktu respons p95</dt>
            <dd>{formatMs(data.p95_response_ms)}</dd>
          </div>
          <div>
            <dt>Error rate</dt>
            <dd>
              {data.error_rate === null || data.error_rate === undefined
                ? '—'
                : formatPct(data.error_rate)}
            </dd>
          </div>
          <div>
            <dt>Total request</dt>
            <dd>{data.total_requests}</dd>
          </div>
          <div>
            <dt>Total token</dt>
            <dd>{data.total_tokens}</dd>
          </div>
          <div>
            <dt>Injeksi diblokir</dt>
            <dd>{data.blocked_injections}</dd>
          </div>
        </dl>
        {providerNames.length > 0 && (
          <>
            <h3>Per provider</h3>
            <table className="sinebot-admin-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Request</th>
                  <th>Token</th>
                </tr>
              </thead>
              <tbody>
                {providerNames.map((provider) => (
                  <tr key={provider}>
                    <td>{provider}</td>
                    <td>{data.requests_by_provider[provider] ?? 0}</td>
                    <td>{data.tokens_by_provider[provider] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <p className="muted">
          Metrik dihitung dari sinebot_metrics sejak migrasi 055 diterapkan; sebelum
          itu tidak ada data metrik, jadi angka tampil 0 atau “—”. Biaya uang tidak
          ditampilkan karena semua provider pada tier gratis — token dicatat,
          rupiah tidak dikarang.
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
