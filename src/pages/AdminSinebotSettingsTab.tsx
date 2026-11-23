// SINEVERSE — Admin SINEBOT: tab Pengaturan AI (Tahap 5).
//
// Form pengaturan AI dari admin_get_settings / admin_set_setting
// (lib/sinebotSettings.ts). Satu baris form per kunci, simpan per baris,
// dengan updated_at/updated_by tiap baris.
//
// Kejujuran yang dijaga di UI ini:
// - Kunci API TIDAK tersimpan di sini dan tidak pernah ditampilkan —
//   kunci hanya ada di server (Supabase Secrets).
// - prompt_version hanya label versi — teks prompt masih di kode Edge
//   Function; pengubahan teks prompt ditunda ke Tahap 6.
// - quota_exhaustion tidak bisa diubah di Tahap 5 (tetap "Berhenti +
//   tawarkan tiket").
// - feature_flags disimpan dan tercatat, tapi belum ditegakkan Edge
//   Function di Tahap 5.
//
// Bentuk nilai di ai_settings adalah JSON dan bisa berbeda-beda antar
// kunci; parsing di bawah defensif (objek {provider, model}, string
// "provider/model", number, atau objek flags) supaya halaman tidak crash
// bila satu nilai tersimpan dalam bentuk lain.
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { fmtDate } from '../lib/guarded'
import { getSettings, setSetting } from '../lib/sinebotSettings'
import type { AiSetting } from '../lib/sinebotSettings'

const PROVIDERS = ['groq', 'openrouter', 'sambanova'] as const

// Nilai bawaan = nilai live yang terverifikasi saat Tahap 5 ditulis.
// Dipakai bila kunci belum tersimpan di server; baris menandainya jujur.
const DEFAULTS = {
  primaryProvider: 'groq',
  primaryModel: 'openai/gpt-oss-120b',
  fallbacks: [
    { provider: 'openrouter', model: 'openai/gpt-oss-120b:free' },
    { provider: 'sambanova', model: 'Meta-Llama-3.3-70B-Instruct' },
  ],
  timeoutMs: 25000,
  temperature: 0.3,
  maxTokens: 600,
  rateLimitMessages: 20,
  rateLimitWindow: 60,
  kbResultLimit: 5,
  promptVersion: 'v1',
  quotaExhaustion: 'stop_and_offer_ticket',
  flags: { ticketing: true, status_check: true, kb_search: true },
}

interface ProviderModel {
  provider: string
  model: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN
  return Number.isFinite(n) ? n : fallback
}

/** provider_primary: {provider, model} atau string "provider/model". */
function parseProviderModel(value: unknown, fallback: ProviderModel): ProviderModel {
  if (isRecord(value)) {
    return {
      provider:
        typeof value.provider === 'string' && value.provider !== ''
          ? value.provider
          : typeof value.name === 'string' && value.name !== ''
            ? value.name
            : fallback.provider,
      model: typeof value.model === 'string' ? value.model : fallback.model,
    }
  }
  if (typeof value === 'string' && value !== '') {
    const slash = value.indexOf('/')
    if (slash > 0) {
      return { provider: value.slice(0, slash), model: value.slice(slash + 1) }
    }
    return { provider: fallback.provider, model: value }
  }
  return fallback
}

function parseFallbacks(value: unknown): ProviderModel[] {
  if (!Array.isArray(value)) return [...DEFAULTS.fallbacks]
  const rows = value.map((v, i) =>
    parseProviderModel(v, DEFAULTS.fallbacks[i] ?? { provider: 'groq', model: '' }),
  )
  while (rows.length < 2) rows.push({ provider: 'groq', model: '' })
  return rows
}

function parseFlags(value: unknown): { ticketing: boolean; status_check: boolean; kb_search: boolean } {
  if (!isRecord(value)) return { ...DEFAULTS.flags }
  return {
    ticketing: value.ticketing !== false,
    status_check: value.status_check !== false,
    kb_search: value.kb_search !== false,
  }
}

function validateNumber(
  raw: string,
  label: string,
  min: number,
  max: number,
): { ok: true; value: number } | { ok: false; error: string } {
  if (raw.trim() === '') return { ok: false, error: `${label} wajib diisi.` }
  const n = Number(raw)
  if (!Number.isFinite(n)) return { ok: false, error: `${label} harus berupa angka.` }
  if (n < min || n > max) {
    return { ok: false, error: `${label} harus antara ${min} dan ${max}.` }
  }
  return { ok: true, value: n }
}

interface SettingRowProps {
  label: string
  hint?: string
  setting?: AiSetting
  busy: boolean
  saving: boolean
  error: string | null
  notice: string | null
  onSave: () => void
  /** Baris hanya-tampil (prompt_version, quota): tanpa tombol simpan. */
  readOnly?: boolean
  children: ReactNode
}

function SettingRow({
  label,
  hint,
  setting,
  busy,
  saving,
  error,
  notice,
  onSave,
  readOnly,
  children,
}: SettingRowProps) {
  return (
    <div className="sinebot-kb-setting-row">
      <h3>{label}</h3>
      {hint && <p className="muted">{hint}</p>}
      {children}
      <p className="muted sinebot-kb-setting-meta">
        {setting
          ? `Terakhir diubah: ${fmtDate(setting.updated_at)}${setting.updated_by ? ` oleh ${setting.updated_by}` : ''}`
          : 'Belum tersimpan di server — memakai nilai bawaan.'}
      </p>
      {error && <p className="error-box">{error}</p>}
      {notice && <p className="notice-box">{notice}</p>}
      {!readOnly && (
        <div className="form-actions">
          <button
            type="button"
            className="btn btn-primary btn-small"
            disabled={busy}
            onClick={onSave}
          >
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function AdminSinebotSettingsTab() {
  const [settings, setSettings] = useState<AiSetting[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Satu busy guard untuk seluruh tab (satu simpan dalam satu waktu).
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [rowNotices, setRowNotices] = useState<Record<string, string>>({})

  const [primary, setPrimary] = useState<ProviderModel>({
    provider: DEFAULTS.primaryProvider,
    model: DEFAULTS.primaryModel,
  })
  const [fallbacks, setFallbacks] = useState<ProviderModel[]>([...DEFAULTS.fallbacks])
  const [timeoutMs, setTimeoutMs] = useState(String(DEFAULTS.timeoutMs))
  const [temperature, setTemperature] = useState(String(DEFAULTS.temperature))
  const [maxTokens, setMaxTokens] = useState(String(DEFAULTS.maxTokens))
  const [rateLimitMessages, setRateLimitMessages] = useState(String(DEFAULTS.rateLimitMessages))
  const [rateLimitWindow, setRateLimitWindow] = useState(String(DEFAULTS.rateLimitWindow))
  const [kbResultLimit, setKbResultLimit] = useState(String(DEFAULTS.kbResultLimit))
  const [promptVersion, setPromptVersion] = useState(DEFAULTS.promptVersion)
  const [quotaExhaustion, setQuotaExhaustion] = useState(DEFAULTS.quotaExhaustion)
  const [flags, setFlags] = useState({ ...DEFAULTS.flags })

  function byKey(key: string): AiSetting | undefined {
    return settings?.find((s) => s.key === key)
  }

  async function loadAll() {
    setLoading(true)
    setLoadError(null)
    try {
      const rows = await getSettings()
      setSettings(rows)
      const find = (key: string) => rows.find((s) => s.key === key)?.value
      setPrimary(parseProviderModel(find('provider_primary'), {
        provider: DEFAULTS.primaryProvider,
        model: DEFAULTS.primaryModel,
      }))
      setFallbacks(parseFallbacks(find('provider_fallbacks')))
      setTimeoutMs(String(asNumber(find('provider_timeout_ms'), DEFAULTS.timeoutMs)))
      setTemperature(String(asNumber(find('provider_temperature'), DEFAULTS.temperature)))
      setMaxTokens(String(asNumber(find('provider_max_tokens'), DEFAULTS.maxTokens)))
      setRateLimitMessages(String(asNumber(find('rate_limit_messages'), DEFAULTS.rateLimitMessages)))
      setRateLimitWindow(String(asNumber(find('rate_limit_window_minutes'), DEFAULTS.rateLimitWindow)))
      setKbResultLimit(String(asNumber(find('kb_result_limit'), DEFAULTS.kbResultLimit)))
      const pv = find('prompt_version')
      setPromptVersion(typeof pv === 'string' ? pv : DEFAULTS.promptVersion)
      const qe = find('quota_exhaustion')
      setQuotaExhaustion(typeof qe === 'string' ? qe : DEFAULTS.quotaExhaustion)
      setFlags(parseFlags(find('feature_flags')))
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Pengaturan AI tidak bisa dimuat.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setRowError(key: string, message: string | null) {
    setRowErrors((prev) => {
      const next = { ...prev }
      if (message) next[key] = message
      else delete next[key]
      return next
    })
  }

  function setRowNotice(key: string, message: string | null) {
    setRowNotices((prev) => {
      const next = { ...prev }
      if (message) next[key] = message
      else delete next[key]
      return next
    })
  }

  async function saveRow(key: string, value: unknown) {
    if (busyKey) return
    setBusyKey(key)
    setRowError(key, null)
    setRowNotice(key, null)
    try {
      const updated = await setSetting(key, value)
      setSettings((prev) => {
        if (!prev) return [updated]
        const exists = prev.some((s) => s.key === key)
        return exists ? prev.map((s) => (s.key === key ? updated : s)) : [...prev, updated]
      })
      setRowNotice(key, 'Tersimpan.')
    } catch (err) {
      setRowError(key, err instanceof Error ? err.message : 'Pengaturan gagal disimpan. Coba lagi.')
    } finally {
      setBusyKey(null)
    }
  }

  async function saveNumberRow(
    key: string,
    raw: string,
    label: string,
    min: number,
    max: number,
  ) {
    const checked = validateNumber(raw, label, min, max)
    if (!checked.ok) {
      setRowError(key, checked.error)
      return
    }
    await saveRow(key, checked.value)
  }

  function setFallback(index: number, patch: Partial<ProviderModel>) {
    setFallbacks((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  }

  const busy = busyKey !== null

  if (loading) return <p className="muted">Memuat pengaturan AI…</p>
  if (loadError) return <p className="error-box">{loadError}</p>

  return (
    <div>
      <p className="notice-box">
        Kunci API TIDAK tersimpan di sini dan tidak pernah ditampilkan — kunci hanya ada di
        server (Supabase Secrets).
      </p>
      <p className="muted">
        Perubahan di sini langsung memengaruhi jawaban SINEBOT berikutnya. Simpan per baris;
        tiap baris menampilkan siapa yang terakhir mengubahnya dan kapan.
      </p>

      <section className="section" aria-label="Pengaturan AI">
        <SettingRow
          label="Provider utama"
          hint="Provider dan model yang dipakai pertama untuk menjawab."
          setting={byKey('provider_primary')}
          busy={busy}
          saving={busyKey === 'provider_primary'}
          error={rowErrors.provider_primary ?? null}
          notice={rowNotices.provider_primary ?? null}
          onSave={() => {
            if (primary.model.trim() === '') {
              setRowError('provider_primary', 'Model provider utama wajib diisi.')
              return
            }
            void saveRow('provider_primary', {
              provider: primary.provider,
              model: primary.model.trim(),
            })
          }}
        >
          <form className="form" onSubmit={(e) => e.preventDefault()}>
            <label>
              Provider
              <select
                value={primary.provider}
                onChange={(e) => setPrimary((p) => ({ ...p, provider: e.target.value }))}
                disabled={busy}
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Model
              <input
                type="text"
                value={primary.model}
                onChange={(e) => setPrimary((p) => ({ ...p, model: e.target.value }))}
                placeholder="mis. openai/gpt-oss-120b"
                disabled={busy}
              />
            </label>
          </form>
        </SettingRow>

        <SettingRow
          label="Provider cadangan (fallback)"
          hint="Dipakai berurutan bila provider utama gagal atau kuotanya habis. Urutan baris = urutan fallback."
          setting={byKey('provider_fallbacks')}
          busy={busy}
          saving={busyKey === 'provider_fallbacks'}
          error={rowErrors.provider_fallbacks ?? null}
          notice={rowNotices.provider_fallbacks ?? null}
          onSave={() => {
            const cleaned = fallbacks.map((f) => ({
              provider: f.provider,
              model: f.model.trim(),
            }))
            if (cleaned.some((f) => f.model === '')) {
              setRowError('provider_fallbacks', 'Model tiap provider cadangan wajib diisi.')
              return
            }
            void saveRow('provider_fallbacks', cleaned)
          }}
        >
          <form className="form" onSubmit={(e) => e.preventDefault()}>
            {fallbacks.map((f, i) => (
              <div key={i} className="sinebot-kb-fallback-row">
                <label>
                  Fallback {i + 1} — Provider
                  <select
                    value={f.provider}
                    onChange={(e) => setFallback(i, { provider: e.target.value })}
                    disabled={busy}
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Fallback {i + 1} — Model
                  <input
                    type="text"
                    value={f.model}
                    onChange={(e) => setFallback(i, { model: e.target.value })}
                    placeholder="mis. openai/gpt-oss-120b:free"
                    disabled={busy}
                  />
                </label>
              </div>
            ))}
          </form>
        </SettingRow>

        <SettingRow
          label="Timeout provider (ms)"
          hint="Batas tunggu jawaban dari provider sebelum beralih ke fallback."
          setting={byKey('provider_timeout_ms')}
          busy={busy}
          saving={busyKey === 'provider_timeout_ms'}
          error={rowErrors.provider_timeout_ms ?? null}
          notice={rowNotices.provider_timeout_ms ?? null}
          onSave={() => void saveNumberRow('provider_timeout_ms', timeoutMs, 'Timeout provider', 5000, 60000)}
        >
          <form className="form" onSubmit={(e) => e.preventDefault()}>
            <label>
              Timeout (ms)
              <input
                type="number"
                min={5000}
                max={60000}
                step={1000}
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(e.target.value)}
                disabled={busy}
              />
              <span className="muted">Rentang: 5.000–60.000 ms.</span>
            </label>
          </form>
        </SettingRow>

        <SettingRow
          label="Temperature"
          hint="Seberapa kreatif/variatif jawaban AI. 0 = paling konsisten, 1 = paling variatif."
          setting={byKey('provider_temperature')}
          busy={busy}
          saving={busyKey === 'provider_temperature'}
          error={rowErrors.provider_temperature ?? null}
          notice={rowNotices.provider_temperature ?? null}
          onSave={() => void saveNumberRow('provider_temperature', temperature, 'Temperature', 0, 1)}
        >
          <form className="form" onSubmit={(e) => e.preventDefault()}>
            <label>
              Temperature
              <input
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                disabled={busy}
              />
              <span className="muted">Rentang: 0–1, langkah 0,1.</span>
            </label>
          </form>
        </SettingRow>

        <SettingRow
          label="Maksimal token jawaban"
          hint="Batas panjang jawaban AI per pesan."
          setting={byKey('provider_max_tokens')}
          busy={busy}
          saving={busyKey === 'provider_max_tokens'}
          error={rowErrors.provider_max_tokens ?? null}
          notice={rowNotices.provider_max_tokens ?? null}
          onSave={() => void saveNumberRow('provider_max_tokens', maxTokens, 'Maksimal token', 50, 4000)}
        >
          <form className="form" onSubmit={(e) => e.preventDefault()}>
            <label>
              Maksimal token
              <input
                type="number"
                min={50}
                max={4000}
                step={50}
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                disabled={busy}
              />
              <span className="muted">Rentang: 50–4.000 token.</span>
            </label>
          </form>
        </SettingRow>

        <SettingRow
          label="Batas pesan (rate limit)"
          hint="Jumlah pesan maksimal per pengguna dalam satu jendela waktu."
          setting={byKey('rate_limit_messages')}
          busy={busy}
          saving={busyKey === 'rate_limit_messages'}
          error={rowErrors.rate_limit_messages ?? null}
          notice={rowNotices.rate_limit_messages ?? null}
          onSave={() => void saveNumberRow('rate_limit_messages', rateLimitMessages, 'Batas pesan', 1, 100)}
        >
          <form className="form" onSubmit={(e) => e.preventDefault()}>
            <label>
              Pesan per jendela
              <input
                type="number"
                min={1}
                max={100}
                value={rateLimitMessages}
                onChange={(e) => setRateLimitMessages(e.target.value)}
                disabled={busy}
              />
              <span className="muted">Rentang: 1–100 pesan.</span>
            </label>
          </form>
        </SettingRow>

        <SettingRow
          label="Jendela rate limit (menit)"
          hint="Lamanya jendela hitung untuk batas pesan di atas."
          setting={byKey('rate_limit_window_minutes')}
          busy={busy}
          saving={busyKey === 'rate_limit_window_minutes'}
          error={rowErrors.rate_limit_window_minutes ?? null}
          notice={rowNotices.rate_limit_window_minutes ?? null}
          onSave={() =>
            void saveNumberRow('rate_limit_window_minutes', rateLimitWindow, 'Jendela rate limit', 1, 1440)
          }
        >
          <form className="form" onSubmit={(e) => e.preventDefault()}>
            <label>
              Jendela (menit)
              <input
                type="number"
                min={1}
                max={1440}
                value={rateLimitWindow}
                onChange={(e) => setRateLimitWindow(e.target.value)}
                disabled={busy}
              />
              <span className="muted">Rentang: 1–1.440 menit (24 jam).</span>
            </label>
          </form>
        </SettingRow>

        <SettingRow
          label="Batas hasil Knowledge Base"
          hint="Jumlah artikel/FAQ yang diambil sebagai sumber tiap jawaban AI."
          setting={byKey('kb_result_limit')}
          busy={busy}
          saving={busyKey === 'kb_result_limit'}
          error={rowErrors.kb_result_limit ?? null}
          notice={rowNotices.kb_result_limit ?? null}
          onSave={() => void saveNumberRow('kb_result_limit', kbResultLimit, 'Batas hasil KB', 1, 10)}
        >
          <form className="form" onSubmit={(e) => e.preventDefault()}>
            <label>
              Jumlah hasil KB
              <input
                type="number"
                min={1}
                max={10}
                value={kbResultLimit}
                onChange={(e) => setKbResultLimit(e.target.value)}
                disabled={busy}
              />
              <span className="muted">Rentang: 1–10 hasil.</span>
            </label>
          </form>
        </SettingRow>

        <SettingRow
          label="Versi prompt"
          hint="Label versi saja — teks prompt masih di kode Edge Function; pengubahan teks prompt ditunda ke Tahap 6."
          setting={byKey('prompt_version')}
          busy={busy}
          saving={false}
          error={null}
          notice={null}
          readOnly
          onSave={() => undefined}
        >
          <p>
            Versi prompt saat ini: <strong>{promptVersion}</strong>
          </p>
          <p className="muted">
            Nilai ini hanya penanda versi. Mengubah teks prompt yang dipakai SINEBOT
            membutuhkan perubahan kode Edge Function — ditunda ke Tahap 6.
          </p>
        </SettingRow>

        <SettingRow
          label="Bila kuota provider habis"
          hint="Perilaku SINEBOT saat semua provider kehabisan kuota."
          setting={byKey('quota_exhaustion')}
          busy={busy}
          saving={false}
          error={null}
          notice={null}
          readOnly
          onSave={() => undefined}
        >
          <p>
            <strong>Berhenti + tawarkan tiket (tanpa bayar otomatis)</strong>
          </p>
          <p className="muted">
            Perilaku ini tidak bisa diubah di Tahap 5 — SINEBOT tidak pernah mengaktifkan
            pembayaran otomatis saat kuota habis.
            {quotaExhaustion && quotaExhaustion !== 'stop_and_offer_ticket'
              ? ` Nilai tersimpan di server: ${quotaExhaustion}.`
              : ''}
          </p>
        </SettingRow>

        <SettingRow
          label="Fitur SINEBOT (feature flags)"
          hint="Disimpan dan tercatat, tapi belum ditegakkan Edge Function di Tahap 5."
          setting={byKey('feature_flags')}
          busy={busy}
          saving={busyKey === 'feature_flags'}
          error={rowErrors.feature_flags ?? null}
          notice={rowNotices.feature_flags ?? null}
          onSave={() =>
            void saveRow('feature_flags', {
              ticketing: flags.ticketing,
              status_check: flags.status_check,
              kb_search: flags.kb_search,
            })
          }
        >
          <div className="sinebot-kb-checks">
            <label className="sinebot-kb-check">
              <input
                type="checkbox"
                checked={flags.ticketing}
                onChange={(e) => setFlags((f) => ({ ...f, ticketing: e.target.checked }))}
                disabled={busy}
              />
              Ticketing — tawaran buat tiket saat AI tidak bisa membantu
            </label>
            <label className="sinebot-kb-check">
              <input
                type="checkbox"
                checked={flags.status_check}
                onChange={(e) => setFlags((f) => ({ ...f, status_check: e.target.checked }))}
                disabled={busy}
              />
              Status check — AI boleh mengecek status (tugas/nilai/tiket)
            </label>
            <label className="sinebot-kb-check">
              <input
                type="checkbox"
                checked={flags.kb_search}
                onChange={(e) => setFlags((f) => ({ ...f, kb_search: e.target.checked }))}
                disabled={busy}
              />
              KB search — AI memakai Knowledge Base sebagai sumber jawaban
            </label>
          </div>
          <p className="muted">
            Perubahan di sini disimpan dan tercatat, tapi Edge Function belum membaca
            flag ini di Tahap 5 — penegakan flag direncanakan setelah Tahap 5.
          </p>
        </SettingRow>
      </section>
    </div>
  )
}
