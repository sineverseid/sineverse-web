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
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from './supabase'

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

  constructor(code: SinebotErrorCode, message: string) {
    super(message)
    this.name = 'SinebotError'
    this.code = code
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
    throw new SinebotError(
      'quota_exhausted',
      'SINEBOT sedang mencapai batas pemakaian hari ini. Coba lagi nanti, atau hubungi admin bila pertanyaanmu mendesak.',
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
  return {
    reply: data.reply,
    sources: parseSources(data.sources),
    provider: typeof data.provider === 'string' ? data.provider : '',
    conversation_id:
      typeof data.conversation_id === 'string' ? data.conversation_id : conversationId,
    quota_exhausted: data.quota_exhausted === true,
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
  const { error } = await supabase.rpc('submit_sinebot_feedback', {
    p_message_id: messageId,
    p_rating: rating,
    p_comment: comment ?? null,
  })
  if (error) throw friendlySupabaseError(error)
}
