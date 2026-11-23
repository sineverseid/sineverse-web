// SINEVERSE — graceful degradation for migrations 003–008.
//
// Those migrations are written but NOT applied live yet (only 001–002 +
// 12 tables exist in Supabase). A query against a missing table must never
// crash the page: detect it, and show the honest empty state instead.
//
// B9 (audit 23 Nov 2026): deteksi ini DULU terlalu lebar —
// `text.includes('does not exist')` juga cocok dengan "column X does not
// exist", "function does not exist", "bucket does not exist", dan
// 'schema cache' menelan error cache lain. Sekarang hanya pola spesifik:
// PostgREST PGRST205 ("Could not find the table … in the schema cache"),
// Postgres 42P01 (undefined_table) / 42883 (undefined_function), pesan
// "could not find the table", dan `relation "…" does not exist`.
// Sengaja TIDAK lagi mencakup PGRST202 / "could not find the function":
// pemanggil yang memang butuh toleransi RPC belum ada (QuizPage,
// ExamsPage) sudah memeriksa PGRST202 sendiri di call-site; pemanggil
// lain (fetchQuizQuestions, sendNotification, checkUsernameAvailable)
// kini melempar bila RPC-nya belum diterapkan, bukan diam-diam
// mengembalikan null/true — itu perilaku yang diinginkan B9, dan migrasi
// terkait sudah live.

export function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; message?: string; details?: string }
  const code = String(e.code ?? '')
  if (code === 'PGRST205' || code === '42P01' || code === '42883') return true
  const text = `${e.message ?? ''} ${e.details ?? ''}`.toLowerCase()
  if (text.includes('could not find the table')) return true
  return /relation\s+"[^"]+"\s+does not exist/.test(text)
}

/** Honest message used by every 003–008 feature while its table is absent. */
export function missingMigrationMessage(migration: string): string {
  return `Fitur ini aktif setelah migrasi ${migration} dijalankan — lihat supabase/README.md.`
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

export function fmtDateOnly(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('id-ID', { dateStyle: 'medium' })
}

/** Serial helpers — SVS-CRS / SVS-EXM / SVS-KRY + year + zero-padded sequence. */
export function nextSerial(prefix: 'SVS-CRS' | 'SVS-EXM' | 'SVS-KRY', existingCount: number): string {
  const year = new Date().getFullYear()
  return `${prefix}-${year}-${String(existingCount + 1).padStart(4, '0')}`
}

/** Embed helper shared by lesson video + showcase film URLs. */
export function videoEmbed(url: string): { kind: 'youtube' | 'vimeo' | 'link'; embedUrl?: string } {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  if (yt) return { kind: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${yt[1]}` }
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vm) return { kind: 'vimeo', embedUrl: `https://player.vimeo.com/video/${vm[1]}` }
  return { kind: 'link' }
}
