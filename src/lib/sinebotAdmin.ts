// SINEVERSE — SINEBOT admin console (Tahap 5, frontend).
//
// Wrapper RPC admin untuk konsol SINEBOT & Helpdesk. Semua RPC
// didefinisikan pekerja backend Tahap 5 (migrasi 054) — nama fungsi dan
// parameter di bawah ini MENGIKUTI kontrak persis; jangan mengubah nama
// sendiri bila ada yang terasa janggal, catat di laporan koordinator.
//
// Kontrak RPC (migrasi 054, kecuali dua terakhir dari 048):
// - admin_sinebot_overview() -> jsonb {conversations_total,
//   conversations_today, messages_total, tickets_open, tickets_critical,
//   tickets_by_status, tickets_by_category, tickets_by_priority,
//   feedback_helpful, feedback_not_helpful, feedback_helpful_rate,
//   kb_published, kb_draft, kb_archived, faq_published, faq_draft,
//   faq_archived, tickets_avg_resolution_hours, service_status}
// - admin_sinebot_timeseries(p_days) -> array {day, conversations,
//   messages, tickets}
// - admin_sinebot_quality() -> jsonb {ai_messages_total, ai_sourced,
//   ai_sourced_pct, ai_unsourced, feedback_helpful, feedback_not_helpful,
//   escalations_to_ticket, unanswered: [{conversation_id, question,
//   asked_at}]}
//   Tahap 6 (migrasi 055) menambahkan kunci metrik dari sinebot_metrics:
//   avg_response_ms, p95_response_ms, error_rate (fraksi 0-1),
//   total_requests, total_tokens, requests_by_provider, tokens_by_provider,
//   blocked_injections. Semua null/0 bila belum ada data metrik.
//   Sejak Tahap 6, unanswered[].question berisi teks pertanyaan asli
//   (bukan null lagi), kecuali bila tidak ada pesan user sebelumnya.
// - admin_sinebot_audit_log(p_action, p_limit, p_offset) -> array {id,
//   actor_id, actor_name, action, target_type, target_id, detail,
//   created_at}
// - list_sinebot_conversations_for_support() -> SETOF ai_conversations
//   (048; akses dicatat ke audit log di dalam RPC)
// - get_sinebot_messages_for_support(p_conversation_id) -> SETOF
//   ai_messages (048; akses dicatat ke audit log di dalam RPC)
//
// Pola error mengikuti sinebotTicketsAdmin.ts (TicketAdminError):
// satu class error + friendlyRpcError yang menerjemahkan pesan mentah
// PostgREST/Supabase ke Bahasa Indonesia.
import { supabase } from './supabase'
import type { SinebotSource } from './sinebot'

export interface SinebotOverview {
  conversations_total: number
  conversations_today: number
  messages_total: number
  tickets_open: number
  tickets_critical: number
  tickets_by_status: Record<string, number>
  tickets_by_category: Record<string, number>
  tickets_by_priority: Record<string, number>
  feedback_helpful: number
  feedback_not_helpful: number
  feedback_helpful_rate: number | null
  kb_published: number
  kb_draft: number
  kb_archived: number
  faq_published: number
  faq_draft: number
  faq_archived: number
  tickets_avg_resolution_hours: number | null
  service_status: string
}

export interface TimeseriesRow {
  day: string
  conversations: number
  messages: number
  tickets: number
}

export interface UnansweredQuestion {
  conversation_id: string
  question: string | null
  asked_at: string
}

export interface SinebotQuality {
  ai_messages_total: number
  ai_sourced: number
  ai_sourced_pct: number | null
  ai_unsourced: number
  feedback_helpful: number
  feedback_not_helpful: number
  escalations_to_ticket: number
  unanswered: UnansweredQuestion[]
  // Metrik kinerja AI (Tahap 6, migrasi 055; null/0 bila belum ada data).
  avg_response_ms: number | null
  p95_response_ms: number | null
  error_rate: number | null
  total_requests: number
  total_tokens: number
  requests_by_provider: Record<string, number>
  tokens_by_provider: Record<string, number>
  blocked_injections: number
}

export interface AuditRow {
  id: string
  actor_id: string | null
  actor_name: string | null
  action: string
  target_type: string | null
  target_id: string | null
  detail: unknown
  created_at: string
}

export interface SupportConversation {
  id: string
  user_id: string | null
  // Nama pemilik bila RPC mengembalikannya; list_sinebot_conversations_
  // for_support (048) mengembalikan SETOF ai_conversations TANPA nama —
  // halaman menampilkan user_id singkat bila null.
  owner_name: string | null
  role_context: string
  title: string
  status: string
  created_at: string
  updated_at: string
}

export interface SupportMessage {
  id: string
  sender_type: 'user' | 'ai' | 'system'
  content: string
  sources: SinebotSource[]
  created_at: string
}

export class SinebotAdminError extends Error {
  code: 'not_admin' | 'not_ready' | 'network' | 'unauthorized' | 'generic'

  constructor(code: SinebotAdminError['code'], message: string) {
    super(message)
    this.name = 'SinebotAdminError'
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asCountRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {}
  const out: Record<string, number> = {}
  for (const [key, val] of Object.entries(value)) {
    if (typeof val === 'number' && Number.isFinite(val)) out[key] = val
  }
  return out
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

/**
 * Pesan ramah untuk kegagalan RPC admin konsol. Pesan mentah PostgREST /
 * Supabase tidak ditampilkan apa adanya ke admin.
 */
function friendlyRpcError(error: { message: string; code?: string }): SinebotAdminError {
  const msg = error.message.toLowerCase()
  const code = String(error.code ?? '')
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return new SinebotAdminError(
      'network',
      'Tidak dapat terhubung ke SINEVERSE. Periksa koneksi internet lalu coba lagi.',
    )
  }
  // RPC belum ada di database (migrasi Tahap 5 / 054 belum di-apply):
  // bukan salah admin.
  if (
    code === '42883' ||
    code === '42P01' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the function') ||
    (msg.includes('relation') && msg.includes('does not exist'))
  ) {
    return new SinebotAdminError(
      'not_ready',
      'Fitur konsol SINEBOT belum aktif di server. Migrasi Tahap 5 belum diterapkan — beri tahu koordinator.',
    )
  }
  if (
    msg.includes('not admin') ||
    msg.includes('only admin') ||
    msg.includes('hanya admin') ||
    msg.includes('permission denied') ||
    msg.includes('forbidden') ||
    code === '42501'
  ) {
    return new SinebotAdminError(
      'not_admin',
      'Halaman ini hanya untuk admin. Akun kamu tidak memiliki akses admin untuk konsol SINEBOT.',
    )
  }
  if (msg.includes('jwt') || msg.includes('unauthorized') || msg.includes('not authenticated')) {
    return new SinebotAdminError(
      'unauthorized',
      'Sesi kamu sudah berakhir. Masuk lagi untuk membuka konsol SINEBOT.',
    )
  }
  return new SinebotAdminError(
    'generic',
    'Terjadi kendala saat memuat data SINEBOT. Coba lagi sebentar lagi.',
  )
}

function parseOverview(row: Record<string, unknown>): SinebotOverview {
  return {
    conversations_total: asNumber(row.conversations_total),
    conversations_today: asNumber(row.conversations_today),
    messages_total: asNumber(row.messages_total),
    tickets_open: asNumber(row.tickets_open),
    tickets_critical: asNumber(row.tickets_critical),
    tickets_by_status: asCountRecord(row.tickets_by_status),
    tickets_by_category: asCountRecord(row.tickets_by_category),
    tickets_by_priority: asCountRecord(row.tickets_by_priority),
    feedback_helpful: asNumber(row.feedback_helpful),
    feedback_not_helpful: asNumber(row.feedback_not_helpful),
    feedback_helpful_rate: asNumberOrNull(row.feedback_helpful_rate),
    kb_published: asNumber(row.kb_published),
    kb_draft: asNumber(row.kb_draft),
    kb_archived: asNumber(row.kb_archived),
    faq_published: asNumber(row.faq_published),
    faq_draft: asNumber(row.faq_draft),
    faq_archived: asNumber(row.faq_archived),
    tickets_avg_resolution_hours: asNumberOrNull(row.tickets_avg_resolution_hours),
    service_status: asString(row.service_status, 'operasional'),
  }
}

function parseTimeseriesRow(row: Record<string, unknown>): TimeseriesRow {
  return {
    day: asString(row.day),
    conversations: asNumber(row.conversations),
    messages: asNumber(row.messages),
    tickets: asNumber(row.tickets),
  }
}

function parseQuality(row: Record<string, unknown>): SinebotQuality {
  const unanswered: UnansweredQuestion[] = []
  if (Array.isArray(row.unanswered)) {
    for (const item of row.unanswered) {
      if (!isRecord(item)) continue
      unanswered.push({
        conversation_id: asString(item.conversation_id),
        question: asStringOrNull(item.question),
        asked_at: asString(item.asked_at),
      })
    }
  }
  return {
    ai_messages_total: asNumber(row.ai_messages_total),
    ai_sourced: asNumber(row.ai_sourced),
    ai_sourced_pct: asNumberOrNull(row.ai_sourced_pct),
    ai_unsourced: asNumber(row.ai_unsourced),
    feedback_helpful: asNumber(row.feedback_helpful),
    feedback_not_helpful: asNumber(row.feedback_not_helpful),
    escalations_to_ticket: asNumber(row.escalations_to_ticket),
    unanswered,
    avg_response_ms: asNumberOrNull(row.avg_response_ms),
    p95_response_ms: asNumberOrNull(row.p95_response_ms),
    error_rate: asNumberOrNull(row.error_rate),
    total_requests: asNumber(row.total_requests),
    total_tokens: asNumber(row.total_tokens),
    requests_by_provider: asCountRecord(row.requests_by_provider),
    tokens_by_provider: asCountRecord(row.tokens_by_provider),
    blocked_injections: asNumber(row.blocked_injections),
  }
}

function parseAuditRow(row: Record<string, unknown>): AuditRow {
  return {
    id: asString(row.id),
    actor_id: asStringOrNull(row.actor_id),
    actor_name: asStringOrNull(row.actor_name),
    action: asString(row.action, '—'),
    target_type: asStringOrNull(row.target_type),
    target_id: asStringOrNull(row.target_id),
    detail: row.detail ?? null,
    created_at: asString(row.created_at),
  }
}

function parseSupportConversation(row: Record<string, unknown>): SupportConversation {
  return {
    id: asString(row.id),
    user_id: asStringOrNull(row.user_id),
    owner_name: asStringOrNull(row.owner_name ?? row.name ?? row.display_name),
    role_context: asString(row.role_context, 'guest'),
    title: asString(row.title, 'Percakapan baru'),
    status: asString(row.status, 'open'),
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at ?? row.created_at),
  }
}

function parseSupportMessage(row: Record<string, unknown>): SupportMessage {
  const sender = asString(row.sender_type)
  return {
    id: asString(row.id),
    sender_type: sender === 'ai' ? 'ai' : sender === 'system' ? 'system' : 'user',
    content: asString(row.content ?? row.message ?? row.body),
    sources: parseSources(row.sources),
    created_at: asString(row.created_at),
  }
}

/** Ringkasan angka konsol (percakapan, pesan, tiket, feedback, KB/FAQ). */
export async function getSinebotOverview(): Promise<SinebotOverview> {
  const { data, error } = await supabase.rpc('admin_sinebot_overview')
  if (error) throw friendlyRpcError(error)
  if (!isRecord(data)) {
    throw new SinebotAdminError('generic', 'Ringkasan SINEBOT tidak bisa dibaca. Coba lagi sebentar lagi.')
  }
  return parseOverview(data)
}

/** Tren harian percakapan/pesan/tiket. Default 14 hari. */
export async function getSinebotTimeseries(days = 14): Promise<TimeseriesRow[]> {
  const { data, error } = await supabase.rpc('admin_sinebot_timeseries', {
    p_days: days,
  })
  if (error) throw friendlyRpcError(error)
  if (!Array.isArray(data)) return []
  return data.filter(isRecord).map(parseTimeseriesRow)
}

/** Metrik kualitas jawaban AI (bersumber/tidak, feedback, eskalasi). */
export async function getSinebotQuality(): Promise<SinebotQuality> {
  const { data, error } = await supabase.rpc('admin_sinebot_quality')
  if (error) throw friendlyRpcError(error)
  if (!isRecord(data)) {
    throw new SinebotAdminError('generic', 'Data kualitas SINEBOT tidak bisa dibaca. Coba lagi sebentar lagi.')
  }
  return parseQuality(data)
}

/**
 * Audit log SINEBOT. p_action null/kosong = semua aksi. hasMore =
 * baris yang kembali sama dengan limit (masih ada halaman berikut).
 */
export async function listSinebotAudit(
  action?: string | null,
  limit = 20,
  offset = 0,
): Promise<{ rows: AuditRow[]; hasMore: boolean }> {
  const q = (action ?? '').trim()
  const { data, error } = await supabase.rpc('admin_sinebot_audit_log', {
    p_action: q === '' ? null : q,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw friendlyRpcError(error)
  if (!Array.isArray(data)) return { rows: [], hasMore: false }
  const rows = data.filter(isRecord).map(parseAuditRow)
  return { rows, hasMore: rows.length === limit }
}

/**
 * Daftar SEMUA percakapan SINEBOT untuk dukungan (048). RPC mencatat
 * akses ke audit log (sinebot_conversation_viewed) sebelum data
 * dikembalikan — halaman wajib menampilkan peringatan itu.
 */
export async function listSupportConversations(): Promise<SupportConversation[]> {
  const { data, error } = await supabase.rpc('list_sinebot_conversations_for_support')
  if (error) throw friendlyRpcError(error)
  if (!Array.isArray(data)) return []
  return data.filter(isRecord).map(parseSupportConversation)
}

/** Isi pesan satu percakapan untuk dukungan (048, p_conversation_id). */
export async function getSupportMessages(conversationId: string): Promise<SupportMessage[]> {
  const { data, error } = await supabase.rpc('get_sinebot_messages_for_support', {
    p_conversation_id: conversationId,
  })
  if (error) throw friendlyRpcError(error)
  if (!Array.isArray(data)) return []
  return data.filter(isRecord).map(parseSupportMessage)
}
