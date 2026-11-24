// SINEVERSE — SINEBOT client (Tahap 2, frontend).
//
// Semua panggilan AI lewat Supabase Edge Function `sinebot-chat` di server
// (pola yang sama seperti verify-certificate di lib/certificates.ts):
// API key provider tidak pernah ada di frontend. Edge Function BELUM
// di-deploy saat file ini ditulis — sendMessage menangani 404 / gagal
// fetch dengan pesan Bahasa Indonesia yang ramah, supaya UI bisa
// menampilkan tawaran hubungi admin, bukan crash.
//
// Kontrak (dibagi dengan pekerja backend Tahap 2):
// - tabel ai_conversations (id, user_id NULL untuk tamu, role_context,
//   title, status, retained_until), ai_messages (conversation_id,
//   sender_type 'user'|'ai'|'system', content, sources jsonb)
// - RPC search_sinebot_kb(p_query, p_role, p_limit) -> (id, kind, title,
//   category, content, rank)
// - RPC submit_sinebot_feedback(p_message_id, p_rating, p_comment)
// - Edge Function POST /functions/v1/sinebot-chat, body
//   {conversation_id, message} -> {reply, sources, provider,
//   conversation_id, quota_exhausted}
//   Tahap 6 menambahkan di semua respons 200: features
//   {ticketing, status_check, kb_search} dan prompt_version ("v1"/"v2").
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from './supabase'
import { checkTicketAttachmentContent, sanitizeTicketFileName } from './attachmentValidation'

export type SinebotRole = 'siswa' | 'mentor' | 'admin' | 'guest'

export type SinebotSender = 'user' | 'ai' | 'system'

export interface SinebotSource {
  id: string
  kind: 'article' | 'faq'
  title: string
  category: string
}

export interface SinebotMessage {
  id: string
  conversation_id: string | null
  sender_type: SinebotSender
  content: string
  sources: SinebotSource[]
  created_at: string
}

export interface SinebotConversation {
  id: string
  user_id: string | null
  role_context: SinebotRole
  title: string
  status: string
  created_at: string
  updated_at: string
}

export interface SinebotChatReply {
  reply: string
  sources: SinebotSource[]
  provider: string
  conversation_id: string | null
  quota_exhausted: boolean
  // Tahap 6: Edge Function mengembalikan flag fitur yang aktif dan versi
  // prompt yang dipakai untuk jawaban ini. Keduanya opsional — respons
  // lama (atau tanpa field ini) tetap dibaca, nilainya undefined.
  features?: { ticketing: boolean; status_check: boolean; kb_search: boolean }
  prompt_version?: string
}

export interface KbResult {
  id: string
  kind: 'article' | 'faq'
  title: string
  category: string
  content: string
  rank: number
}

/** Kode error yang bisa dikenali UI (bukan pesan mentah dari server). */
export type SinebotErrorCode =
  | 'not_active'
  | 'quota_exhausted'
  | 'rate_limited'
  | 'network'
  | 'unauthorized'
  | 'generic'

export class SinebotError extends Error {
  code: SinebotErrorCode
  /** Estimasi tunggu dalam detik — hanya diisi untuk 'rate_limited'. */
  retryAfterSeconds?: number

  constructor(code: SinebotErrorCode, message: string, retryAfterSeconds?: number) {
    super(message)
    this.name = 'SinebotError'
    this.code = code
    if (typeof retryAfterSeconds === 'number') this.retryAfterSeconds = retryAfterSeconds
  }
}

const ADMIN_EMAIL = 'sineverse.id@gmail.com'

export function sinebotAdminMailto(subject: string): string {
  return `mailto:${ADMIN_EMAIL}?subject=${encodeURIComponent(subject)}`
}

/** Pesan ramah untuk kegagalan umum Supabase (RPC / query tabel). */
function friendlySupabaseError(error: { message: string }): SinebotError {
  const msg = error.message.toLowerCase()
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return new SinebotError(
      'network',
      'Tidak dapat terhubung ke SINEVERSE. Periksa koneksi internet kamu lalu coba lagi.',
    )
  }
  if (msg.includes('jwt') || msg.includes('unauthorized') || msg.includes('not authenticated')) {
    return new SinebotError(
      'unauthorized',
      'Sesi kamu sudah berakhir. Masuk lagi untuk melanjutkan.',
    )
  }
  return new SinebotError(
    'generic',
    'Terjadi kendala saat memuat data bantuan. Coba lagi sebentar lagi.',
  )
}

async function accessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) return null
  return data.session.access_token
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseSources(value: unknown): SinebotSource[] {
  if (!Array.isArray(value)) return []
  const out: SinebotSource[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    if (typeof item.id !== 'string' || typeof item.title !== 'string') continue
    out.push({
      id: item.id,
      kind: item.kind === 'faq' ? 'faq' : 'article',
      title: item.title,
      category: typeof item.category === 'string' ? item.category : '',
    })
  }
  return out
}

function parseMessageRow(row: Record<string, unknown>): SinebotMessage {
  return {
    id: typeof row.id === 'string' ? row.id : '',
    conversation_id: typeof row.conversation_id === 'string' ? row.conversation_id : null,
    sender_type:
      row.sender_type === 'ai' || row.sender_type === 'system' ? row.sender_type : 'user',
    content: typeof row.content === 'string' ? row.content : '',
    sources: parseSources(row.sources),
    created_at: typeof row.created_at === 'string' ? row.created_at : '',
  }
}

function parseConversationRow(row: Record<string, unknown>): SinebotConversation {
  return {
    id: typeof row.id === 'string' ? row.id : '',
    user_id: typeof row.user_id === 'string' ? row.user_id : null,
    role_context:
      row.role_context === 'mentor' || row.role_context === 'admin'
        ? row.role_context
        : row.role_context === 'guest'
          ? 'guest'
          : 'siswa',
    title: typeof row.title === 'string' ? row.title : 'Percakapan',
    status: typeof row.status === 'string' ? row.status : 'open',
    created_at: typeof row.created_at === 'string' ? row.created_at : '',
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : '',
  }
}

/**
 * Format detik tunggu menjadi label Bahasa Indonesia: 3600 -> "1 jam",
 * 7200 -> "2 jam", 1800 -> "30 menit", 90 -> "2 menit".
 * Dipakai pesan rate limit supaya estimasi tunggu mengikuti angka dari
 * server, bukan teks yang dikarang.
 */
function formatWaitTime(seconds: number): string {
  if (seconds >= 3600 && seconds % 3600 === 0) {
    return `${seconds / 3600} jam`
  }
  return `${Math.max(1, Math.ceil(seconds / 60))} menit`
}

/**
 * Baca estimasi tunggu dari respons 429, berurutan: body
 * `retry_after_seconds` dulu, lalu header `Retry-After`, lalu 3600 detik
 * (window rate limit default 60 menit). Tidak pernah throw — sumber yang
 * tidak ada / tidak bisa dibaca dilewati begitu saja.
 */
async function readRetryAfterSeconds(res: Response): Promise<number> {
  const fallbackSeconds = 3600
  try {
    const data: unknown = await res.json()
    if (
      isRecord(data) &&
      typeof data.retry_after_seconds === 'number' &&
      Number.isFinite(data.retry_after_seconds) &&
      data.retry_after_seconds > 0
    ) {
      return Math.floor(data.retry_after_seconds)
    }
  } catch {
    // Body bukan JSON / tidak bisa dibaca — lanjut ke header.
  }
  const header = res.headers.get('Retry-After')
  if (header !== null) {
    const parsed = Number(header)
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed)
  }
  return fallbackSeconds
}

/**
 * Kirim satu pesan ke SINEBOT. conversationId null = percakapan baru.
 * Untuk tamu, Edge Function membuat percakapan tamu (user_id NULL) tapi
 * tamu tidak bisa membacanya kembali setelah refresh (RLS) — jadi UI tamu
 * hanya menyimpan pesan di memori sesi ini.
 */
export async function sendMessage(
  conversationId: string | null,
  message: string,
): Promise<SinebotChatReply> {
  const text = message.trim()
  if (!text) {
    throw new SinebotError('generic', 'Tulis dulu pertanyaanmu sebelum mengirim.')
  }
  const token = await accessToken()
  let res: Response
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/sinebot-chat`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        // Tamu TIDAK mengirim header Authorization: Edge Function
        // memperlakukan "tanpa header" sebagai tamu. Mengirim publishable
        // key sebagai Bearer justru dianggap token sesi → 401 (temuan
        // verifikasi live Tahap 2, 23 Nov 2026).
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversation_id: conversationId, message: text }),
    })
  } catch {
    throw new SinebotError(
      'network',
      'Tidak dapat terhubung ke layanan SINEBOT. Periksa koneksi internet kamu lalu coba lagi.',
    )
  }
  if (res.status === 404) {
    throw new SinebotError(
      'not_active',
      'Layanan SINEBOT belum aktif. Tim SINEVERSE masih menyiapkan asisten ini — sementara itu, kamu bisa menghubungi admin lewat email.',
    )
  }
  if (res.status === 429) {
    // F1 (Tahap 6, perbaikan 23 Nov 2026): HTTP 429 dari Edge Function
    // HANYA berarti rate limit per-user (20 pesan / 60 menit) — BUKAN
    // kuota harian habis. Kuota provider habis dikembalikan sebagai 200 +
    // quota_exhausted: true (jalur itu tetap memakai kode
    // 'quota_exhausted', lihat SinebotChat). Pesan di sini memakai angka
    // retry_after_seconds dari server supaya pengguna tahu kapan boleh
    // mencoba lagi, bukan dikira SINEBOT mati seharian.
    const retryAfterSeconds = await readRetryAfterSeconds(res)
    throw new SinebotError(
      'rate_limited',
      `Kamu mengirim pesan terlalu cepat. Coba lagi dalam ${formatWaitTime(retryAfterSeconds)}.`,
      retryAfterSeconds,
    )
  }
  if (res.status === 401 || res.status === 403) {
    throw new SinebotError(
      'unauthorized',
      'Sesi kamu sudah berakhir. Masuk lagi untuk melanjutkan percakapan.',
    )
  }
  if (!res.ok) {
    throw new SinebotError(
      'generic',
      'SINEBOT sedang mengalami kendala. Coba lagi sebentar lagi, atau hubungi admin bila masalah berlanjut.',
    )
  }
  let data: unknown
  try {
    data = await res.json()
  } catch {
    throw new SinebotError(
      'generic',
      'SINEBOT mengirim jawaban yang tidak bisa dibaca. Coba kirim lagi pertanyaanmu.',
    )
  }
  if (!isRecord(data) || typeof data.reply !== 'string' || data.reply === '') {
    throw new SinebotError(
      'generic',
      'SINEBOT belum bisa menjawab saat ini. Coba lagi, atau hubungi admin bila pertanyaanmu mendesak.',
    )
  }
  // Tahap 6: baca features + prompt_version secara defensif — field
  // tidak ada / bentuknya salah = undefined, bukan crash.
  const features = isRecord(data.features)
    ? {
        ticketing: data.features.ticketing !== false,
        status_check: data.features.status_check !== false,
        kb_search: data.features.kb_search !== false,
      }
    : undefined
  return {
    reply: data.reply,
    sources: parseSources(data.sources),
    provider: typeof data.provider === 'string' ? data.provider : '',
    conversation_id:
      typeof data.conversation_id === 'string' ? data.conversation_id : conversationId,
    quota_exhausted: data.quota_exhausted === true,
    features,
    prompt_version: typeof data.prompt_version === 'string' ? data.prompt_version : undefined,
  }
}

/** Daftar percakapan milik pengguna yang login (terbaru dulu). */
export async function listConversations(): Promise<SinebotConversation[]> {
  const { data, error } = await supabase
    .from('ai_conversations')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) throw friendlySupabaseError(error)
  if (!Array.isArray(data)) return []
  return data.filter(isRecord).map(parseConversationRow)
}

/** Buat percakapan baru untuk pengguna yang login. */
export async function createConversation(
  roleContext: SinebotRole,
  title: string,
): Promise<SinebotConversation> {
  // user_id WAJIB diisi dengan id pengguna saat ini: tanpa itu baris
  // dibuat dengan user_id NULL, sehingga pemiliknya tidak bisa membacanya
  // kembali (RLS select_own) dan Edge Function menolaknya (403).
  // status WAJIB 'open': migrasi 048 hanya mengizinkan 'open'/'closed'.
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user.id
  if (!userId) {
    throw new SinebotError(
      'unauthorized',
      'Masuk dulu untuk memulai percakapan baru.',
    )
  }
  const { data, error } = await supabase
    .from('ai_conversations')
    .insert({ user_id: userId, role_context: roleContext, title: title.trim() || 'Percakapan baru', status: 'open' })
    .select()
    .single()
  if (error) throw friendlySupabaseError(error)
  if (!isRecord(data)) {
    throw new SinebotError('generic', 'Percakapan baru tidak bisa dibuat. Coba lagi.')
  }
  return parseConversationRow(data)
}

/** Pesan-pesan dalam satu percakapan (terlama dulu). */
export async function getMessages(conversationId: string): Promise<SinebotMessage[]> {
  const { data, error } = await supabase
    .from('ai_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) throw friendlySupabaseError(error)
  if (!Array.isArray(data)) return []
  return data.filter(isRecord).map(parseMessageRow)
}

/** Hapus percakapan sendiri (pesan ikut terhapus via FK cascade). */
export async function deleteConversation(id: string): Promise<void> {
  const { error } = await supabase.from('ai_conversations').delete().eq('id', id)
  if (error) throw friendlySupabaseError(error)
}

/** Cari artikel/FAQ di knowledge base (RPC search_sinebot_kb). */
export async function searchKb(
  query: string,
  role: SinebotRole,
  limit = 10,
): Promise<KbResult[]> {
  const { data, error } = await supabase.rpc('search_sinebot_kb', {
    p_query: query.trim(),
    p_role: role,
    p_limit: limit,
  })
  if (error) throw friendlySupabaseError(error)
  if (!Array.isArray(data)) return []
  const out: KbResult[] = []
  for (const row of data) {
    if (!isRecord(row)) continue
    if (typeof row.id !== 'string' || typeof row.title !== 'string') continue
    out.push({
      id: row.id,
      kind: row.kind === 'faq' ? 'faq' : 'article',
      title: row.title,
      category: typeof row.category === 'string' ? row.category : '',
      content: typeof row.content === 'string' ? row.content : '',
      rank: typeof row.rank === 'number' ? row.rank : 0,
    })
  }
  return out
}

/**
 * Kirim feedback membantu/tidak membantu untuk satu jawaban AI.
 * rating: 1 = membantu, -1 = tidak membantu.
 */
export async function submitFeedback(
  messageId: string,
  rating: 1 | -1,
  comment?: string,
): Promise<void> {
  // RPC submit_sinebot_feedback menerima p_rating TEXT ('helpful' /
  // 'not_helpful'), BUKAN angka. Mengirim 1/-1 membuat RPC menolak dengan
  // 'rating must be helpful or not_helpful' — itulah kenapa tombol feedback
  // di panel tidak pernah berubah jadi "Terima kasih" (temuan verifikasi
  // live Tahap 2 ronde 2, 23 Nov 2026; dibuktikan via curl).
  const { error } = await supabase.rpc('submit_sinebot_feedback', {
    p_message_id: messageId,
    p_rating: rating === 1 ? 'helpful' : 'not_helpful',
    p_comment: comment ?? null,
  })
  if (error) throw friendlySupabaseError(error)
}

// ---------------------------------------------------------------------------
// SINEBOT Tahap 4 — Tiket dukungan (support_tickets).
//
// Kontrak RPC (dibangun bersama pekerja backend dari kontrak yang sama):
// - create_sinebot_ticket(p_category, p_subject, p_description,
//   p_page_context, p_priority, p_attachment_path, p_attachment_name,
//   p_attachment_size, p_attachment_type) RETURNS uuid
// - list_my_tickets() RETURNS SETOF support_tickets (milik pemanggil)
// - get_sinebot_ticket(p_ticket_id) RETURNS jsonb {ticket, messages[]}
// - reply_to_sinebot_ticket(p_ticket_id, p_message, p_attachment_path,
//   p_attachment_name, p_attachment_size, p_attachment_type) RETURNS uuid
// Nilai category/priority di bawah HARUS cocok persis dengan CHECK
// constraint tabel support_tickets; jangan ubah tanpa mengubah migrasi.
// Lampiran: bucket privat 'ticket-attachments', 1 file per tiket/balasan,
// hanya jpg/jpeg/png/webp/pdf, maks 5 MB. TIDAK ada scan malware —
// jangan klaim ada di UI.
// ---------------------------------------------------------------------------

export type TicketCategory =
  | 'akun'
  | 'academy'
  | 'tugas'
  | 'sertifikat'
  | 'komunitas'
  | 'teknis'
  | 'lainnya'

export type TicketPriority = 'low' | 'medium' | 'high' | 'critical'

export type TicketStatus =
  | 'open'
  | 'assigned'
  | 'in_progress'
  | 'waiting_user'
  | 'resolved'
  | 'closed'

export interface TicketAttachment {
  path: string
  name: string
  size: number
  type: string
}

export interface Ticket {
  id: string
  user_id: string
  category: TicketCategory
  subject: string
  description: string
  page_context: string | null
  priority: TicketPriority
  status: TicketStatus
  attachment_path: string | null
  attachment_name: string | null
  attachment_size: number | null
  attachment_type: string | null
  created_at: string
  updated_at: string
}

export interface TicketMessage {
  id: string
  ticket_id: string
  sender_type: 'user' | 'admin'
  sender_id: string | null
  message: string
  attachment_path: string | null
  attachment_name: string | null
  attachment_size: number | null
  attachment_type: string | null
  created_at: string
}

export interface TicketDetail {
  ticket: Ticket
  messages: TicketMessage[]
}

export const MAX_TICKET_ATTACHMENT_SIZE = 5242880 // 5 MB

export const ALLOWED_TICKET_ATTACHMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const

const TICKET_ATTACHMENTS_BUCKET = 'ticket-attachments'

function friendlyTicketError(error: { message: string }, action: string): SinebotError {
  const msg = error.message.toLowerCase()
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return new SinebotError(
      'network',
      'Tidak dapat terhubung ke SINEVERSE. Periksa koneksi internet kamu lalu coba lagi.',
    )
  }
  if (msg.includes('jwt') || msg.includes('unauthorized') || msg.includes('not authenticated')) {
    return new SinebotError(
      'unauthorized',
      'Sesi kamu sudah berakhir. Masuk lagi untuk melanjutkan.',
    )
  }
  return new SinebotError('generic', `${action} Coba lagi sebentar lagi.`)
}

// ---- Pure helpers (diuji unit dengan skrip Node, lihat laporan Tahap 4) ----

/**
 * Validasi lampiran SEBELUM upload. Mengembalikan pesan error Bahasa
 * Indonesia, atau null bila file boleh diunggah.
 */
export function validateTicketAttachment(file: {
  name: string
  type: string
  size: number
}): string | null {
  if (!file || typeof file.size !== 'number' || file.size <= 0) {
    return 'File lampiran tidak bisa dibaca. Pilih file lain.'
  }
  if (file.size > MAX_TICKET_ATTACHMENT_SIZE) {
    return 'Ukuran file maksimal 5 MB. Pilih file yang lebih kecil.'
  }
  const type = (file.type || '').toLowerCase()
  if (!(ALLOWED_TICKET_ATTACHMENT_TYPES as readonly string[]).includes(type)) {
    return 'Format file harus JPG, PNG, WebP, atau PDF.'
  }
  return null
}

// Validasi isi + nama file lampiran pindah ke ./attachmentValidation
// (pure helpers — supaya lib/sinebot tidak ikut bundle awal lewat
// mentorGroup/studentCommunity/dll; modul itu hanya dipakai saat
// pengguna melampirkan file).

// ---- Akhir pure helpers ----

function parseTicketCategory(value: unknown): TicketCategory {
  const allowed: TicketCategory[] = [
    'akun',
    'academy',
    'tugas',
    'sertifikat',
    'komunitas',
    'teknis',
    'lainnya',
  ]
  return typeof value === 'string' && (allowed as string[]).includes(value)
    ? (value as TicketCategory)
    : 'lainnya'
}

function parseTicketPriority(value: unknown): TicketPriority {
  const allowed: TicketPriority[] = ['low', 'medium', 'high', 'critical']
  return typeof value === 'string' && (allowed as string[]).includes(value)
    ? (value as TicketPriority)
    : 'medium'
}

function parseTicketStatus(value: unknown): TicketStatus {
  // Kontrak migrasi 052: nilai status di database adalah
  // 'waiting_for_user'. Sisi pengguna memakai enum 'waiting_user'
  // (label + pil status di HelpCenterPage) — petakan di sini supaya
  // tiket berstatus menunggu pengguna tidak jatuh ke 'open'.
  // Nilai enum database TIDAK diubah; pemetaan hanya di sisi baca.
  if (value === 'waiting_for_user') return 'waiting_user'
  const allowed: TicketStatus[] = [
    'open',
    'assigned',
    'in_progress',
    'waiting_user',
    'resolved',
    'closed',
  ]
  return typeof value === 'string' && (allowed as string[]).includes(value)
    ? (value as TicketStatus)
    : 'open'
}

function parseTicketRow(row: Record<string, unknown>): Ticket {
  return {
    id: typeof row.id === 'string' ? row.id : '',
    user_id: typeof row.user_id === 'string' ? row.user_id : '',
    category: parseTicketCategory(row.category),
    subject: typeof row.subject === 'string' ? row.subject : '',
    description: typeof row.description === 'string' ? row.description : '',
    page_context: typeof row.page_context === 'string' ? row.page_context : null,
    priority: parseTicketPriority(row.priority),
    status: parseTicketStatus(row.status),
    attachment_path: typeof row.attachment_path === 'string' ? row.attachment_path : null,
    attachment_name: typeof row.attachment_name === 'string' ? row.attachment_name : null,
    attachment_size: typeof row.attachment_size === 'number' ? row.attachment_size : null,
    attachment_type: typeof row.attachment_type === 'string' ? row.attachment_type : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : '',
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : '',
  }
}

function parseTicketMessageRow(row: Record<string, unknown>): TicketMessage {
  return {
    id: typeof row.id === 'string' ? row.id : '',
    ticket_id: typeof row.ticket_id === 'string' ? row.ticket_id : '',
    sender_type: row.sender_type === 'admin' ? 'admin' : 'user',
    sender_id: typeof row.sender_id === 'string' ? row.sender_id : null,
    message: typeof row.message === 'string' ? row.message : '',
    attachment_path: typeof row.attachment_path === 'string' ? row.attachment_path : null,
    attachment_name: typeof row.attachment_name === 'string' ? row.attachment_name : null,
    attachment_size: typeof row.attachment_size === 'number' ? row.attachment_size : null,
    attachment_type: typeof row.attachment_type === 'string' ? row.attachment_type : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : '',
  }
}

function randomSuffix(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Unggah lampiran ke bucket privat 'ticket-attachments' di path
 * `<user_id>/<uuid-acak>-<nama-file-disaring>`. Validasi dilakukan
 * SEBELUM upload; bila upload gagal, error dilempar dan pemanggil TIDAK
 * boleh memanggil RPC (tiket tidak dibuat tanpa lampiran yang dijanjikan).
 */
async function uploadTicketAttachment(file: File): Promise<TicketAttachment> {
  const validationError = validateTicketAttachment(file)
  if (validationError) {
    throw new SinebotError('generic', validationError)
  }
  const contentError = await checkTicketAttachmentContent(file)
  if (contentError) {
    throw new SinebotError('generic', contentError)
  }
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user.id
  if (!userId) {
    throw new SinebotError('unauthorized', 'Masuk dulu untuk mengirim lampiran.')
  }
  const path = `${userId}/${randomSuffix()}-${sanitizeTicketFileName(file.name)}`
  const { error } = await supabase.storage
    .from(TICKET_ATTACHMENTS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) {
    throw friendlyTicketError(error, 'Lampiran tidak bisa diunggah.')
  }
  return { path, name: file.name, size: file.size, type: file.type }
}

/**
 * Buat tiket dukungan baru. Lampiran (bila ada) diunggah DULU; bila
 * upload gagal, RPC tidak dipanggil dan tidak ada tiket yang dibuat.
 * Mengembalikan id tiket (uuid dari RPC).
 */
export async function createTicket(
  category: TicketCategory,
  subject: string,
  description: string,
  pageContext?: string,
  priority: TicketPriority = 'medium',
  attachment?: File | null,
): Promise<string> {
  const cleanSubject = subject.trim()
  const cleanDescription = description.trim()
  if (!cleanSubject) {
    throw new SinebotError('generic', 'Tulis dulu subjek tiketmu.')
  }
  if (cleanSubject.length > 200) {
    throw new SinebotError('generic', 'Subjek tiket maksimal 200 karakter.')
  }
  if (!cleanDescription) {
    throw new SinebotError('generic', 'Tulis dulu penjelasan masalahmu.')
  }
  if (cleanDescription.length > 2000) {
    throw new SinebotError('generic', 'Deskripsi tiket maksimal 2000 karakter.')
  }
  let uploaded: TicketAttachment | null = null
  if (attachment) {
    uploaded = await uploadTicketAttachment(attachment)
  }
  const { data, error } = await supabase.rpc('create_sinebot_ticket', {
    p_category: category,
    p_subject: cleanSubject,
    p_description: cleanDescription,
    p_page_context: pageContext?.trim() ? pageContext.trim() : null,
    p_priority: priority,
    p_attachment_path: uploaded ? uploaded.path : null,
    p_attachment_name: uploaded ? uploaded.name : null,
    p_attachment_size: uploaded ? uploaded.size : null,
    p_attachment_type: uploaded ? uploaded.type : null,
  })
  if (error) throw friendlyTicketError(error, 'Tiket tidak bisa dibuat.')
  if (typeof data !== 'string' || data === '') {
    throw new SinebotError('generic', 'Tiket tidak bisa dibuat. Coba lagi sebentar lagi.')
  }
  return data
}

/** Daftar tiket milik pengguna yang login (terbaru dulu). */
export async function listMyTickets(): Promise<Ticket[]> {
  const { data, error } = await supabase.rpc('list_my_tickets')
  if (error) throw friendlyTicketError(error, 'Daftar tiket tidak bisa dimuat.')
  if (!Array.isArray(data)) return []
  return data.filter(isRecord).map(parseTicketRow)
}

/** Detail satu tiket milik pengguna: tiket + daftar balasannya. */
export async function getTicket(ticketId: string): Promise<TicketDetail> {
  const { data, error } = await supabase.rpc('get_sinebot_ticket', {
    p_ticket_id: ticketId,
  })
  if (error) throw friendlyTicketError(error, 'Detail tiket tidak bisa dimuat.')
  if (!isRecord(data) || !isRecord(data.ticket)) {
    throw new SinebotError('generic', 'Tiket tidak ditemukan.')
  }
  const rawMessages = Array.isArray(data.messages) ? data.messages : []
  return {
    ticket: parseTicketRow(data.ticket),
    messages: rawMessages.filter(isRecord).map(parseTicketMessageRow),
  }
}

/**
 * Balas tiket sendiri. Lampiran (bila ada) diunggah DULU; bila upload
 * gagal, RPC tidak dipanggil dan balasan tidak terkirim.
 * Mengembalikan id balasan (uuid dari RPC).
 */
export async function replyToTicket(
  ticketId: string,
  message: string,
  attachment?: File | null,
): Promise<string> {
  const cleanMessage = message.trim()
  if (!cleanMessage) {
    throw new SinebotError('generic', 'Tulis dulu balasanmu.')
  }
  let uploaded: TicketAttachment | null = null
  if (attachment) {
    uploaded = await uploadTicketAttachment(attachment)
  }
  const { data, error } = await supabase.rpc('reply_to_sinebot_ticket', {
    p_ticket_id: ticketId,
    p_message: cleanMessage,
    p_attachment_path: uploaded ? uploaded.path : null,
    p_attachment_name: uploaded ? uploaded.name : null,
    p_attachment_size: uploaded ? uploaded.size : null,
    p_attachment_type: uploaded ? uploaded.type : null,
  })
  if (error) throw friendlyTicketError(error, 'Balasan tidak bisa dikirim.')
  if (typeof data !== 'string' || data === '') {
    throw new SinebotError('generic', 'Balasan tidak bisa dikirim. Coba lagi sebentar lagi.')
  }
  return data
}

/**
 * Buat tautan unduh bertanda (signed URL) berumur singkat untuk satu
 * lampiran tiket. URL dibuat saat diklik dan TIDAK disimpan di state —
 * pemanggil langsung membukanya di tab baru.
 */
export async function createTicketAttachmentUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(TICKET_ATTACHMENTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds)
  if (error || !data?.signedUrl) {
    throw friendlyTicketError(
      error ?? { message: 'signed url gagal' },
      'Lampiran tidak bisa dibuka.',
    )
  }
  return data.signedUrl
}
