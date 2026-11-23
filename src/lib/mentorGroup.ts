// SINEVERSE — Mentor Community, Fase 1 (migrasi 060 + 061).
//
// Grup chat resmi: admin + mentor approved & aktif (satu grup, GROUP_ID
// tetap). Keanggotaan otomatis lewat trigger profiles.role; revoked_at
// null = aktif. RLS sudah mengatur siapa boleh baca/kirim — fungsi di
// sini TIDAK memfilter manual yang bertentangan dengan RLS, kecuali
// hitung unread (pesan terhapus tidak dihitung).
//
// Pola yang ditiru (ATM):
// - Upload bucket privat: sinebotTicketsAdmin.ts — path
//   <userId>/<uuid>-<nama-disaring>, upsert false, contentType; buka
//   lewat signed URL 3600 detik saat diklik. TIDAK pakai uploadToBucket()
//   (itu public URL, salah untuk bucket privat).
// - Nama penulis: fetchProfileNames + lampirkan profil seperti
//   CommunityDetailPage (author diisi dari profiles).
// - Tabel belum ada: isMissingTableError dari lib/guarded.
import { checkTicketAttachmentContent, sanitizeTicketFileName } from './sinebot'
import { isMissingTableError } from './guarded'
import { supabase } from './supabase'

/** Satu-satunya grup resmi Mentor Community (migrasi 060). */
export const MENTOR_GROUP_ID = '00000000-0000-0000-0000-000000000001'

export const MENTOR_GROUP_BUCKET = 'mentor-group-files'

/** Emoji reaksi yang tersedia (tetap — tidak ada emoji bebas). */
export const MENTOR_GROUP_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const

export const MENTOR_GROUP_PAGE_SIZE = 50

/** Lampiran: PDF / gambar / dokumen umum, maks 10 MB (spe k PDF Fase 1). */
export const MENTOR_GROUP_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

const MENTOR_GROUP_ATTACHMENT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
}

export class MentorGroupError extends Error {
  code: 'not_member' | 'not_ready' | 'network' | 'unauthorized' | 'generic'

  constructor(code: MentorGroupError['code'], message: string) {
    super(message)
    this.name = 'MentorGroupError'
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Terjemahkan error Supabase/PostgREST ke pesan Bahasa Indonesia yang jujur. */
function friendlyError(error: { message: string; code?: string }, action: string): MentorGroupError {
  if (isMissingTableError(error)) {
    return new MentorGroupError(
      'not_ready',
      'Ruang Komunikasi Mentor belum aktif di server (migrasi 060/061 belum diterapkan). Beri tahu admin.',
    )
  }
  const msg = error.message.toLowerCase()
  const code = String(error.code ?? '')
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return new MentorGroupError(
      'network',
      'Tidak dapat terhubung ke SINEVERSE. Periksa koneksi internet lalu coba lagi.',
    )
  }
  if (msg.includes('jwt') || msg.includes('unauthorized') || msg.includes('not authenticated')) {
    return new MentorGroupError(
      'unauthorized',
      'Sesi kamu sudah berakhir. Masuk lagi untuk membuka grup ini.',
    )
  }
  if (
    code === '42501' ||
    msg.includes('permission denied') ||
    msg.includes('row-level security') ||
    msg.includes('not a member') ||
    msg.includes('only an admin')
  ) {
    return new MentorGroupError(
      'not_member',
      'Kamu bukan anggota aktif grup ini, atau aksi itu hanya untuk admin.',
    )
  }
  return new MentorGroupError('generic', `${action} Coba lagi sebentar lagi.`)
}

export interface MentorGroupMember {
  user_id: string
  role: string
  name: string
  photo_url: string | null
  joined_at: string
}

export interface MentorGroupSender {
  name: string
  role: string
  photo_url: string | null
}

export interface MentorGroupMessage {
  id: string
  group_id: string
  sender_id: string
  body: string
  reply_to: string | null
  is_announcement: boolean
  attachment_path: string | null
  attachment_name: string | null
  attachment_type: string | null
  created_at: string
  edited_at: string | null
  deleted_at: string | null
  is_pinned: boolean
  pinned_by: string | null
  pinned_at: string | null
  mentioned_user_ids: string[]
  /** Dilampirkan dari profiles (pola CommunityDetailPage). */
  sender: MentorGroupSender | null
}

export interface MentorGroupReactionSummary {
  emoji: string
  count: number
  mine: boolean
}

function parseMessageRow(row: Record<string, unknown>): MentorGroupMessage {
  return {
    id: typeof row.id === 'string' ? row.id : '',
    group_id: typeof row.group_id === 'string' ? row.group_id : MENTOR_GROUP_ID,
    sender_id: typeof row.sender_id === 'string' ? row.sender_id : '',
    body: typeof row.body === 'string' ? row.body : '',
    reply_to: typeof row.reply_to === 'string' ? row.reply_to : null,
    is_announcement: row.is_announcement === true,
    attachment_path: typeof row.attachment_path === 'string' ? row.attachment_path : null,
    attachment_name: typeof row.attachment_name === 'string' ? row.attachment_name : null,
    attachment_type: typeof row.attachment_type === 'string' ? row.attachment_type : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : '',
    edited_at: typeof row.edited_at === 'string' ? row.edited_at : null,
    deleted_at: typeof row.deleted_at === 'string' ? row.deleted_at : null,
    is_pinned: row.is_pinned === true,
    pinned_by: typeof row.pinned_by === 'string' ? row.pinned_by : null,
    pinned_at: typeof row.pinned_at === 'string' ? row.pinned_at : null,
    mentioned_user_ids: Array.isArray(row.mentioned_user_ids)
      ? (row.mentioned_user_ids.filter((v) => typeof v === 'string') as string[])
      : [],
    sender: null,
  }
}

async function attachSenders(messages: MentorGroupMessage[]): Promise<void> {
  const ids = [...new Set(messages.map((m) => m.sender_id).filter(Boolean))]
  if (ids.length === 0) return
  const { data, error } = await supabase
    .from('profiles')
    .select('id,name,role,photo_url')
    .in('id', ids)
  if (error) throw error
  const byId = new Map(
    ((data ?? []) as { id: string; name: string | null; role: string; photo_url: string | null }[]).map(
      (p) => [
        p.id,
        {
          name: p.name ?? 'Anggota',
          role: p.role ?? 'mentor',
          photo_url: p.photo_url ?? null,
        } satisfies MentorGroupSender,
      ],
    ),
  )
  for (const m of messages) m.sender = byId.get(m.sender_id) ?? null
}

/** Anggota aktif grup (revoked_at null) beserta nama + role. */
export async function fetchMembers(): Promise<MentorGroupMember[]> {
  const { data, error } = await supabase
    .from('mentor_group_members')
    .select('user_id,joined_at,revoked_at')
    .eq('group_id', MENTOR_GROUP_ID)
    .is('revoked_at', null)
    .order('joined_at', { ascending: true })
  if (error) throw friendlyError(error, 'Gagal memuat daftar anggota.')
  const rows = (data ?? []) as { user_id: string; joined_at: string }[]
  if (rows.length === 0) return []
  const { data: profs, error: profErr } = await supabase
    .from('profiles')
    .select('id,name,role,photo_url')
    .in('id', rows.map((r) => r.user_id))
  if (profErr) throw friendlyError(profErr, 'Gagal memuat daftar anggota.')
  const byId = new Map(
    ((profs ?? []) as { id: string; name: string | null; role: string; photo_url: string | null }[]).map(
      (p) => [p.id, p],
    ),
  )
  return rows.map((r) => {
    const p = byId.get(r.user_id)
    return {
      user_id: r.user_id,
      role: p?.role ?? 'mentor',
      name: p?.name ?? 'Anggota',
      photo_url: p?.photo_url ?? null,
      joined_at: r.joined_at,
    }
  })
}

export interface FetchMessagesOptions {
  /** Ambil pesan yang lebih lama dari ini (cursor created_at). */
  beforeCreatedAt?: string | null
  /** Pencarian isi pesan (ilike body). Bila diisi, cursor diabaikan. */
  search?: string
  limit?: number
}

/**
 * Pesan grup, terbaru dulu di hasil. RLS yang memutuskan pesan terhapus
 * terlihat atau tidak (anggota tidak melihatnya, admin melihatnya) —
 * fungsi ini sengaja tidak memfilter deleted_at.
 */
export async function fetchMessages(
  options: FetchMessagesOptions = {},
): Promise<MentorGroupMessage[]> {
  const limit = options.limit ?? MENTOR_GROUP_PAGE_SIZE
  const search = (options.search ?? '').trim()
  let query = supabase
    .from('mentor_group_messages')
    .select('*')
    .eq('group_id', MENTOR_GROUP_ID)
  if (search !== '') {
    // Lindungi karakter wildcard LIKE supaya dicari harfiah.
    const escaped = search.replace(/[%_\\]/g, (c) => `\\${c}`)
    query = query.ilike('body', `%${escaped}%`)
  } else if (options.beforeCreatedAt) {
    query = query.lt('created_at', options.beforeCreatedAt)
  }
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)
  if (error) throw friendlyError(error, 'Gagal memuat pesan.')
  const messages = ((data ?? []) as Record<string, unknown>[])
    .filter(isRecord)
    .map(parseMessageRow)
  try {
    await attachSenders(messages)
  } catch (err) {
    if (err instanceof Error) throw friendlyError(err, 'Gagal memuat pesan.')
    throw err
  }
  return messages
}

/** Pesan yang disematkan (admin), terbaru yang disematkan dulu. */
export async function fetchPinned(): Promise<MentorGroupMessage[]> {
  const { data, error } = await supabase
    .from('mentor_group_messages')
    .select('*')
    .eq('group_id', MENTOR_GROUP_ID)
    .eq('is_pinned', true)
    .is('deleted_at', null)
    .order('pinned_at', { ascending: false })
    .limit(10)
  if (error) throw friendlyError(error, 'Gagal memuat pesan yang disematkan.')
  const messages = ((data ?? []) as Record<string, unknown>[])
    .filter(isRecord)
    .map(parseMessageRow)
  await attachSenders(messages)
  return messages
}

/** Ringkasan reaksi per pesan: jumlah per emoji + apakah saya sudah memberi. */
export async function fetchReactions(
  messageIds: string[],
  myUserId: string,
): Promise<Map<string, MentorGroupReactionSummary[]>> {
  const out = new Map<string, MentorGroupReactionSummary[]>()
  const ids = [...new Set(messageIds.filter(Boolean))]
  if (ids.length === 0) return out
  const { data, error } = await supabase
    .from('mentor_group_reactions')
    .select('message_id,user_id,emoji')
    .in('message_id', ids)
  if (error) throw friendlyError(error, 'Gagal memuat reaksi.')
  const grouped = new Map<string, Map<string, { count: number; mine: boolean }>>()
  for (const row of (data ?? []) as { message_id: string; user_id: string; emoji: string }[]) {
    let perEmoji = grouped.get(row.message_id)
    if (!perEmoji) {
      perEmoji = new Map()
      grouped.set(row.message_id, perEmoji)
    }
    const current = perEmoji.get(row.emoji) ?? { count: 0, mine: false }
    current.count += 1
    if (row.user_id === myUserId) current.mine = true
    perEmoji.set(row.emoji, current)
  }
  const emojiRank = new Map<string, number>(
    MENTOR_GROUP_EMOJIS.map((e, i) => [e as string, i]),
  )
  for (const [messageId, perEmoji] of grouped) {
    out.set(
      messageId,
      [...perEmoji.entries()]
        .map(([emoji, v]) => ({ emoji, count: v.count, mine: v.mine }))
        .sort((a, b) => (emojiRank.get(a.emoji) ?? 99) - (emojiRank.get(b.emoji) ?? 99)),
    )
  }
  return out
}

/** Validasi lampiran sebelum upload. Null = boleh diunggah. */
export function validateGroupAttachment(file: File): string | null {
  if (!file || file.size <= 0) return 'File lampiran tidak bisa dibaca. Pilih file lain.'
  if (file.size > MENTOR_GROUP_ATTACHMENT_MAX_BYTES) {
    return 'Ukuran lampiran maksimal 10 MB.'
  }
  if (!MENTOR_GROUP_ATTACHMENT_TYPES[(file.type || '').toLowerCase()]) {
    return 'Lampiran hanya boleh berupa PDF, gambar (JPG, PNG, WebP, GIF), atau dokumen (DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT).'
  }
  return null
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export interface SendMessageInput {
  userId: string
  body: string
  replyTo?: string | null
  mentionedUserIds?: string[]
  isAnnouncement?: boolean
  file?: File | null
}

/**
 * Kirim pesan. Lampiran (opsional, 1 file) diunggah DULU ke bucket privat,
 * baru pesan di-insert — bila insert gagal, file yatim tetap di bucket
 * (tidak ada penghapus otomatis). Pesan boleh hanya lampiran tanpa teks.
 */
export async function sendMessage(input: SendMessageInput): Promise<MentorGroupMessage> {
  const text = input.body.trim()
  const file = input.file ?? null
  if (text === '' && !file) {
    throw new MentorGroupError('generic', 'Tulis pesan atau lampirkan file dulu sebelum mengirim.')
  }
  if (text.length > 5000) {
    throw new MentorGroupError('generic', 'Pesan terlalu panjang (maksimal 5000 karakter).')
  }
  let attachment: { path: string; name: string; type: string } | null = null
  if (file) {
    const problem = validateGroupAttachment(file)
    if (problem) throw new MentorGroupError('generic', problem)
    // Isi file gambar/PDF dicek magic byte-nya (pola tiket Tahap 4/6);
    // dokumen Office/teks lolos tanpa cek isi.
    const contentProblem = await checkTicketAttachmentContent(file)
    if (contentProblem) throw new MentorGroupError('generic', contentProblem)
    const path = `${input.userId}/${randomId()}-${sanitizeTicketFileName(file.name)}`
    const { error: upErr } = await supabase.storage.from(MENTOR_GROUP_BUCKET).upload(path, file, {
      upsert: false,
      contentType: file.type,
    })
    if (upErr) {
      throw new MentorGroupError(
        'generic',
        'Lampiran gagal diunggah. Coba lagi, atau kirim pesan tanpa lampiran.',
      )
    }
    attachment = { path, name: file.name, type: file.type }
  }
  const { data, error } = await supabase
    .from('mentor_group_messages')
    .insert({
      group_id: MENTOR_GROUP_ID,
      sender_id: input.userId,
      body: text,
      reply_to: input.replyTo ?? null,
      is_announcement: input.isAnnouncement === true,
      attachment_path: attachment?.path ?? null,
      attachment_name: attachment?.name ?? null,
      attachment_type: attachment?.type ?? null,
      mentioned_user_ids: input.mentionedUserIds ?? [],
    })
    .select()
    .single()
  if (error) throw friendlyError(error, 'Gagal mengirim pesan.')
  if (!isRecord(data)) {
    throw new MentorGroupError('generic', 'Gagal mengirim pesan. Coba lagi sebentar lagi.')
  }
  const message = parseMessageRow(data)
  await attachSenders([message])
  return message
}

/** Beri atau cabut reaksi saya pada satu pesan. */
export async function toggleReaction(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<'added' | 'removed'> {
  if (!MENTOR_GROUP_EMOJIS.includes(emoji as (typeof MENTOR_GROUP_EMOJIS)[number])) {
    throw new MentorGroupError('generic', 'Reaksi itu tidak tersedia di grup ini.')
  }
  const { data, error } = await supabase
    .from('mentor_group_reactions')
    .select('id')
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('emoji', emoji)
    .maybeSingle()
  if (error) throw friendlyError(error, 'Gagal mengubah reaksi.')
  if (data && isRecord(data) && typeof data.id === 'string') {
    const { error: delErr } = await supabase
      .from('mentor_group_reactions')
      .delete()
      .eq('id', data.id)
    if (delErr) throw friendlyError(delErr, 'Gagal mengubah reaksi.')
    return 'removed'
  }
  const { error: insErr } = await supabase.from('mentor_group_reactions').insert({
    message_id: messageId,
    user_id: userId,
    emoji,
  })
  if (insErr) throw friendlyError(insErr, 'Gagal mengubah reaksi.')
  return 'added'
}

/** Tandai pesan-pesan sudah dibaca (upsert — aman dipanggil berulang). */
export async function markRead(messageIds: string[], userId: string): Promise<void> {
  const ids = [...new Set(messageIds.filter(Boolean))]
  if (ids.length === 0 || !userId) return
  const now = new Date().toISOString()
  const { error } = await supabase.from('mentor_group_reads').upsert(
    ids.map((message_id) => ({ message_id, user_id: userId, read_at: now })),
    { onConflict: 'message_id,user_id' },
  )
  if (error) throw friendlyError(error, 'Gagal menandai pesan sudah dibaca.')
}

/** Jumlah pesan yang belum saya baca (bukan pesan saya, belum terhapus). */
export async function fetchUnreadCount(userId: string): Promise<number> {
  const { data: msgData, error: msgErr } = await supabase
    .from('mentor_group_messages')
    .select('id,sender_id,deleted_at')
    .eq('group_id', MENTOR_GROUP_ID)
    .order('created_at', { ascending: false })
    .limit(1000)
  if (msgErr) throw friendlyError(msgErr, 'Gagal menghitung pesan belum dibaca.')
  const { data: readData, error: readErr } = await supabase
    .from('mentor_group_reads')
    .select('message_id')
    .eq('user_id', userId)
    .limit(1000)
  if (readErr) throw friendlyError(readErr, 'Gagal menghitung pesan belum dibaca.')
  const readSet = new Set(((readData ?? []) as { message_id: string }[]).map((r) => r.message_id))
  let count = 0
  for (const row of (msgData ?? []) as { id: string; sender_id: string; deleted_at: string | null }[]) {
    if (row.sender_id === userId) continue
    if (row.deleted_at) continue
    if (readSet.has(row.id)) continue
    count += 1
  }
  return count
}

export interface MentorGroupSummary {
  unread: number
  latest: { body: string; senderName: string; createdAt: string } | null
}

/** Ringkasan untuk kartu dashboard: unread + pesan terakhir. */
export async function fetchMentorGroupSummary(userId: string): Promise<MentorGroupSummary> {
  const [unread, latestRows] = await Promise.all([
    fetchUnreadCount(userId),
    supabase
      .from('mentor_group_messages')
      .select('body,sender_id,created_at,deleted_at')
      .eq('group_id', MENTOR_GROUP_ID)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1),
  ])
  const latestRow = (latestRows.data ?? [])[0] as
    | { body: string; sender_id: string; created_at: string }
    | undefined
  if (latestRows.error) throw friendlyError(latestRows.error, 'Gagal memuat ringkasan grup.')
  let senderName = 'Anggota'
  if (latestRow) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', latestRow.sender_id)
        .maybeSingle()
      if (data && isRecord(data) && typeof data.name === 'string' && data.name !== '') {
        senderName = data.name
      }
    } catch {
      // Nama pengirim gagal dimuat — ringkasan tetap tampil tanpa nama.
    }
  }
  return {
    unread,
    latest: latestRow
      ? { body: latestRow.body, senderName, createdAt: latestRow.created_at }
      : null,
  }
}

/** Sematkan pesan (admin saja — trigger menolak bila bukan admin). */
export async function pinMessage(messageId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('mentor_group_messages')
    .update({ is_pinned: true, pinned_by: userId, pinned_at: new Date().toISOString() })
    .eq('id', messageId)
  if (error) throw friendlyError(error, 'Gagal menyematkan pesan.')
}

/** Lepas sematan (admin saja). */
export async function unpinMessage(messageId: string): Promise<void> {
  const { error } = await supabase
    .from('mentor_group_messages')
    .update({ is_pinned: false, pinned_by: null, pinned_at: null })
    .eq('id', messageId)
  if (error) throw friendlyError(error, 'Gagal melepas sematan.')
}

/** Hapus pesan (admin saja — soft delete via deleted_at). */
export async function deleteMessage(messageId: string): Promise<void> {
  const { error } = await supabase
    .from('mentor_group_messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId)
  if (error) throw friendlyError(error, 'Gagal menghapus pesan.')
}

/** Tautan signed URL (3600 detik) untuk lampiran di bucket privat. */
export async function signedGroupAttachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(MENTOR_GROUP_BUCKET)
    .createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) {
    throw new MentorGroupError(
      'generic',
      'Lampiran tidak bisa dibuka saat ini. Coba lagi sebentar lagi.',
    )
  }
  return data.signedUrl
}

export type RealtimeStatus = 'ok' | 'error'

export interface GroupRealtimeEvent {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  message: MentorGroupMessage | null
  messageId: string
}

function parseRealtimeRow(row: unknown): MentorGroupMessage | null {
  if (!isRecord(row) || typeof row.id !== 'string') return null
  return parseMessageRow(row)
}

/**
 * Langganan Realtime untuk pesan grup (postgres_changes, hanya grup ini).
 * onEvent dipanggil untuk INSERT/UPDATE/DELETE; onStatus memberi tahu
 * apakah langganan berhasil ('ok') atau gagal ('error' — halaman
 * menampilkan notice jujur + tombol muat ulang manual).
 * Mengembalikan fungsi unsubscribe.
 */
export function subscribeToGroup(
  onEvent: (event: GroupRealtimeEvent) => void,
  onStatus?: (status: RealtimeStatus) => void,
): () => void {
  const channel = supabase
    .channel('mentor-group')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'mentor_group_messages',
        filter: `group_id=eq.${MENTOR_GROUP_ID}`,
      },
      (payload) => {
        const eventType = payload.eventType as GroupRealtimeEvent['eventType']
        if (eventType === 'DELETE') {
          const oldRow = (payload as { old?: unknown }).old
          const messageId =
            isRecord(oldRow) && typeof oldRow.id === 'string' ? oldRow.id : ''
          if (messageId !== '') onEvent({ eventType, message: null, messageId })
          return
        }
        const message = parseRealtimeRow((payload as { new?: unknown }).new)
        if (!message) return
        onEvent({ eventType, message, messageId: message.id })
      },
    )
    .subscribe((status) => {
      if (!onStatus) return
      if (status === 'SUBSCRIBED') onStatus('ok')
      else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
        onStatus('error')
      }
    })
  return () => {
    void supabase.removeChannel(channel)
  }
}
