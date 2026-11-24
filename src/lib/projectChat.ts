// SINEVERSE — Project Team Chat, Fase 3 (migrasi 068).
//
// Chat privat per proyek: hanya anggota proyek (project_members) + pemilik
// proyek; admin boleh MEMBACA semua (pengawasan) tapi mengirim hanya bila
// juga anggota (keputusan Arif 24 Nov 2026 10:41). Pin: pemilik proyek +
// anggota role='mentor' (trigger). Notifikasi: mention / pesan baru, hormat
// prefs kategori 'komunitas', dedup per pesan per pengguna.
//
// Pola yang ditiru (ATM): src/lib/mentorGroup.ts (Fase 1) — struktur fungsi,
// validasi lampiran 10 MB + magic-byte check, signed URL 3600 detik,
// Realtime postgres_changes, soft delete lewat RPC (bukan UPDATE langsung).
// Perbedaan: keanggotaan dari project_members + owner (bukan tabel grup);
// tandai-baca satu baris per (proyek, pengguna) di project_chat_reads
// (last_read_message_id), bukan satu baris per pesan.
import { checkTicketAttachmentContent, sanitizeTicketFileName } from './sinebot'
import { isMissingTableError } from './guarded'
import { logContentBlocked } from './moderation'
import { supabase } from './supabase'

/** Bucket privat file proyek (sudah ada, dipakai juga file produksi). */
export const PROJECT_CHAT_BUCKET = 'project-files'

/** Emoji reaksi yang tersedia (tetap — tidak ada emoji bebas). */
export const PROJECT_CHAT_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const

export const PROJECT_CHAT_PAGE_SIZE = 50

/** Lampiran: PDF / gambar / dokumen umum, maks 10 MB (pola Fase 1/2). */
export const PROJECT_CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

const PROJECT_CHAT_ATTACHMENT_TYPES: Record<string, string> = {
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

export class ProjectChatError extends Error {
  code: 'not_member' | 'not_ready' | 'network' | 'unauthorized' | 'generic'

  constructor(code: ProjectChatError['code'], message: string) {
    super(message)
    this.name = 'ProjectChatError'
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Terjemahkan error Supabase/PostgREST ke pesan Bahasa Indonesia yang jujur. */
function friendlyError(error: { message: string; code?: string }, action: string): ProjectChatError {
  if (isMissingTableError(error)) {
    return new ProjectChatError(
      'not_ready',
      'Chat tim proyek ini belum aktif di server (migrasi 068 belum diterapkan). Beri tahu admin.',
    )
  }
  const msg = error.message.toLowerCase()
  const code = String(error.code ?? '')
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return new ProjectChatError(
      'network',
      'Tidak dapat terhubung ke SINEVERSE. Periksa koneksi internet lalu coba lagi.',
    )
  }
  if (msg.includes('jwt') || msg.includes('unauthorized') || msg.includes('not authenticated')) {
    return new ProjectChatError(
      'unauthorized',
      'Sesi kamu sudah berakhir. Masuk lagi untuk membuka chat ini.',
    )
  }
  // Fase 6 (070): pesan penolakan trigger moderasi (filter konten,
  // mention pengguna diblokir, pengirim diblokir, izin sembunyikan) —
  // tampilkan apa adanya: sudah Bahasa Indonesia dan menjelaskan alasan.
  if (
    msg.includes('tidak diizinkan') ||
    msg.includes('tidak bisa menyebut') ||
    msg.includes('sedang diblokir') ||
    msg.includes('diberi wewenang')
  ) {
    return new ProjectChatError('generic', error.message)
  }
  if (
    code === '42501' ||
    msg.includes('permission denied') ||
    msg.includes('row-level security') ||
    msg.includes('not a member') ||
    msg.includes('only the project owner')
  ) {
    return new ProjectChatError(
      'not_member',
      'Kamu bukan anggota proyek ini, atau aksi itu hanya untuk pemilik proyek / mentor proyek.',
    )
  }
  return new ProjectChatError('generic', `${action} Coba lagi sebentar lagi.`)
}

export interface ProjectChatMember {
  user_id: string
  /** Role di project_members ('mentor' / 'member' / …; null bila pemilik tanpa baris members). */
  role: string | null
  /** Role global di profiles ('siswa' / 'mentor' / 'admin'). */
  global_role: string
  name: string
  photo_url: string | null
  joined_at: string
  is_owner: boolean
}

export interface ProjectChatSender {
  name: string
  role: string
  photo_url: string | null
}

export interface ProjectChatMessage {
  id: string
  project_id: string
  sender_id: string
  body: string
  parent_id: string | null
  attachment_path: string | null
  attachment_name: string | null
  attachment_type: string | null
  mentioned_user_ids: string[]
  is_pinned: boolean
  pinned_by: string | null
  pinned_at: string | null
  deleted_at: string | null
  created_at: string
  /** Fase 6 (070): disembunyikan admin/mentor berwenang; bukan-admin
      tidak melihat baris ini (RLS), admin melihat dengan lencana. */
  is_hidden?: boolean
  hidden_by?: string | null
  hidden_at?: string | null
  /** Dilampirkan dari profiles (pola MentorGroupPage). */
  sender: ProjectChatSender | null
}

export interface ProjectChatReactionSummary {
  emoji: string
  count: number
  mine: boolean
}

function parseMessageRow(row: Record<string, unknown>): ProjectChatMessage {
  return {
    id: typeof row.id === 'string' ? row.id : '',
    project_id: typeof row.project_id === 'string' ? row.project_id : '',
    sender_id: typeof row.sender_id === 'string' ? row.sender_id : '',
    body: typeof row.body === 'string' ? row.body : '',
    parent_id: typeof row.parent_id === 'string' ? row.parent_id : null,
    attachment_path: typeof row.attachment_path === 'string' ? row.attachment_path : null,
    attachment_name: typeof row.attachment_name === 'string' ? row.attachment_name : null,
    attachment_type: typeof row.attachment_type === 'string' ? row.attachment_type : null,
    mentioned_user_ids: Array.isArray(row.mentioned_user_ids)
      ? (row.mentioned_user_ids.filter((v) => typeof v === 'string') as string[])
      : [],
    is_pinned: row.is_pinned === true,
    pinned_by: typeof row.pinned_by === 'string' ? row.pinned_by : null,
    pinned_at: typeof row.pinned_at === 'string' ? row.pinned_at : null,
    deleted_at: typeof row.deleted_at === 'string' ? row.deleted_at : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : '',
    is_hidden: row.is_hidden === true,
    hidden_by: typeof row.hidden_by === 'string' ? row.hidden_by : null,
    hidden_at: typeof row.hidden_at === 'string' ? row.hidden_at : null,
    sender: null,
  }
}

async function attachSenders(messages: ProjectChatMessage[]): Promise<void> {
  const ids = [...new Set(messages.map((m) => m.sender_id).filter(Boolean))]
  if (ids.length === 0) return
  const { data, error } = await supabase
    .from('public_profiles')
    .select('id,name,role,photo_url')
    .in('id', ids)
  if (error) throw error
  const byId = new Map(
    ((data ?? []) as { id: string; name: string | null; role: string; photo_url: string | null }[]).map(
      (p) => [
        p.id,
        {
          name: p.name ?? 'Anggota',
          role: p.role ?? 'siswa',
          photo_url: p.photo_url ?? null,
        } satisfies ProjectChatSender,
      ],
    ),
  )
  for (const m of messages) m.sender = byId.get(m.sender_id) ?? null
}

/**
 * Anggota proyek beserta nama + role. Pemilik proyek SELALU termasuk meski
 * tidak punya baris project_members (is_project_member mencakup owner).
 */
export async function fetchMembers(projectId: string): Promise<ProjectChatMember[]> {
  const { data: projData, error: projErr } = await supabase
    .from('projects')
    .select('owner_id,created_at')
    .eq('id', projectId)
    .maybeSingle()
  if (projErr) throw friendlyError(projErr, 'Gagal memuat daftar anggota.')
  const ownerId =
    projData && isRecord(projData) && typeof projData.owner_id === 'string'
      ? projData.owner_id
      : null
  const projectCreatedAt =
    projData && isRecord(projData) && typeof projData.created_at === 'string'
      ? projData.created_at
      : new Date().toISOString()

  const { data, error } = await supabase
    .from('project_members')
    .select('user_id,role,created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
  if (error) throw friendlyError(error, 'Gagal memuat daftar anggota.')
  const rows = (data ?? []) as { user_id: string; role: string | null; created_at: string }[]
  const ids = [...new Set([...rows.map((r) => r.user_id), ...(ownerId ? [ownerId] : [])])]
  if (ids.length === 0) return []
  const { data: profs, error: profErr } = await supabase
    .from('public_profiles')
    .select('id,name,role,photo_url')
    .in('id', ids)
  if (profErr) throw friendlyError(profErr, 'Gagal memuat daftar anggota.')
  const byId = new Map(
    ((profs ?? []) as { id: string; name: string | null; role: string; photo_url: string | null }[]).map(
      (p) => [p.id, p],
    ),
  )
  const out: ProjectChatMember[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    const p = byId.get(r.user_id)
    seen.add(r.user_id)
    out.push({
      user_id: r.user_id,
      role: r.role,
      global_role: p?.role ?? 'siswa',
      name: p?.name ?? 'Anggota',
      photo_url: p?.photo_url ?? null,
      joined_at: r.created_at,
      is_owner: r.user_id === ownerId,
    })
  }
  // Pemilik tanpa baris project_members: tambahkan di depan.
  if (ownerId && !seen.has(ownerId)) {
    const p = byId.get(ownerId)
    out.unshift({
      user_id: ownerId,
      role: null,
      global_role: p?.role ?? 'siswa',
      name: p?.name ?? 'Anggota',
      photo_url: p?.photo_url ?? null,
      joined_at: projectCreatedAt,
      is_owner: true,
    })
  }
  return out
}

/** Info proyek minimal untuk header chat (judul + pemilik). */
export async function fetchProjectInfo(
  projectId: string,
): Promise<{ title: string; owner_id: string } | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('title,owner_id')
    .eq('id', projectId)
    .maybeSingle()
  if (error) throw friendlyError(error, 'Gagal memuat proyek.')
  if (!data || !isRecord(data)) return null
  return {
    title: typeof data.title === 'string' ? data.title : 'Proyek',
    owner_id: typeof data.owner_id === 'string' ? data.owner_id : '',
  }
}

export interface FetchMessagesOptions {
  /** Ambil pesan yang lebih lama dari ini (cursor created_at). */
  beforeCreatedAt?: string | null
  /** Pencarian isi pesan (ilike body). Bila diisi, cursor diabaikan. */
  search?: string
  limit?: number
}

/**
 * Pesan chat proyek, terbaru dulu di hasil. RLS yang memutuskan pesan
 * terhapus terlihat atau tidak (anggota tidak melihatnya, admin melihatnya)
 * — fungsi ini sengaja tidak memfilter deleted_at.
 */
export async function fetchMessages(
  projectId: string,
  options: FetchMessagesOptions = {},
): Promise<ProjectChatMessage[]> {
  const limit = options.limit ?? PROJECT_CHAT_PAGE_SIZE
  const search = (options.search ?? '').trim()
  let query = supabase
    .from('project_chat_messages')
    .select('*')
    .eq('project_id', projectId)
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

/** Pesan yang disematkan (pemilik / mentor proyek), terbaru dulu. */
export async function fetchPinned(projectId: string): Promise<ProjectChatMessage[]> {
  const { data, error } = await supabase
    .from('project_chat_messages')
    .select('*')
    .eq('project_id', projectId)
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
): Promise<Map<string, ProjectChatReactionSummary[]>> {
  const out = new Map<string, ProjectChatReactionSummary[]>()
  const ids = [...new Set(messageIds.filter(Boolean))]
  if (ids.length === 0) return out
  const { data, error } = await supabase
    .from('project_chat_reactions')
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
    PROJECT_CHAT_EMOJIS.map((e, i) => [e as string, i]),
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
export function validateChatAttachment(file: File): string | null {
  if (!file || file.size <= 0) return 'File lampiran tidak bisa dibaca. Pilih file lain.'
  if (file.size > PROJECT_CHAT_ATTACHMENT_MAX_BYTES) {
    return 'Ukuran lampiran maksimal 10 MB.'
  }
  if (!PROJECT_CHAT_ATTACHMENT_TYPES[(file.type || '').toLowerCase()]) {
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
  projectId: string
  body: string
  replyTo?: string | null
  mentionedUserIds?: string[]
  file?: File | null
}

/**
 * Kirim pesan. Lampiran (opsional, 1 file) diunggah DULU ke bucket privat
 * project-files dengan path project/<project_id>/<user_id>/<uuid>-<nama>,
 * baru pesan di-insert — bila insert gagal, file yatim tetap di bucket
 * (tidak ada penghapus otomatis). Pesan boleh hanya lampiran tanpa teks.
 */
export async function sendMessage(input: SendMessageInput): Promise<ProjectChatMessage> {
  const text = input.body.trim()
  const file = input.file ?? null
  if (text === '' && !file) {
    throw new ProjectChatError('generic', 'Tulis pesan atau lampirkan file dulu sebelum mengirim.')
  }
  if (text.length > 5000) {
    throw new ProjectChatError('generic', 'Pesan terlalu panjang (maksimal 5000 karakter).')
  }
  let attachment: { path: string; name: string; type: string } | null = null
  if (file) {
    const problem = validateChatAttachment(file)
    if (problem) throw new ProjectChatError('generic', problem)
    // Isi file gambar/PDF dicek magic byte-nya (pola tiket Tahap 4/6);
    // dokumen Office/teks lolos tanpa cek isi.
    const contentProblem = await checkTicketAttachmentContent(file)
    if (contentProblem) throw new ProjectChatError('generic', contentProblem)
    const path = `project/${input.projectId}/${input.userId}/${randomId()}-${sanitizeTicketFileName(file.name)}`
    const { error: upErr } = await supabase.storage.from(PROJECT_CHAT_BUCKET).upload(path, file, {
      upsert: false,
      contentType: file.type,
    })
    if (upErr) {
      throw new ProjectChatError(
        'generic',
        'Lampiran gagal diunggah. Coba lagi, atau kirim pesan tanpa lampiran.',
      )
    }
    attachment = { path, name: file.name, type: file.type }
  }
  const { data, error } = await supabase
    .from('project_chat_messages')
    .insert({
      project_id: input.projectId,
      sender_id: input.userId,
      body: text,
      parent_id: input.replyTo ?? null,
      attachment_path: attachment?.path ?? null,
      attachment_name: attachment?.name ?? null,
      attachment_type: attachment?.type ?? null,
      mentioned_user_ids: input.mentionedUserIds ?? [],
    })
    .select()
    .single()
  if (error) {
    // Filter konten menolak di transaksi yang sama — catat ke audit_log
    // (best-effort, tidak mengganggu pengguna).
    if (error.message.toLowerCase().includes('tidak diizinkan')) {
      void logContentBlocked('project_chat_message', { reason: 'filter' })
    }
    throw friendlyError(error, 'Gagal mengirim pesan.')
  }
  if (!isRecord(data)) {
    throw new ProjectChatError('generic', 'Gagal mengirim pesan. Coba lagi sebentar lagi.')
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
  if (!PROJECT_CHAT_EMOJIS.includes(emoji as (typeof PROJECT_CHAT_EMOJIS)[number])) {
    throw new ProjectChatError('generic', 'Reaksi itu tidak tersedia di chat ini.')
  }
  const { data, error } = await supabase
    .from('project_chat_reactions')
    .select('id')
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('emoji', emoji)
    .maybeSingle()
  if (error) throw friendlyError(error, 'Gagal mengubah reaksi.')
  if (data && isRecord(data) && typeof data.id === 'string') {
    const { error: delErr } = await supabase
      .from('project_chat_reactions')
      .delete()
      .eq('id', data.id)
    if (delErr) throw friendlyError(delErr, 'Gagal mengubah reaksi.')
    return 'removed'
  }
  const { error: insErr } = await supabase.from('project_chat_reactions').insert({
    message_id: messageId,
    user_id: userId,
    emoji,
  })
  if (insErr) throw friendlyError(insErr, 'Gagal mengubah reaksi.')
  return 'added'
}

/**
 * Tandai chat sudah dibaca sampai pesan ini (upsert satu baris per
 * proyek+pengguna — aman dipanggil berulang).
 */
export async function markRead(
  projectId: string,
  lastReadMessageId: string,
  userId: string,
): Promise<void> {
  if (!lastReadMessageId || !userId || !projectId) return
  const { error } = await supabase.from('project_chat_reads').upsert(
    {
      project_id: projectId,
      user_id: userId,
      last_read_message_id: lastReadMessageId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'project_id,user_id' },
  )
  if (error) throw friendlyError(error, 'Gagal menandai pesan sudah dibaca.')
}

/**
 * Jumlah pesan yang belum saya baca (bukan pesan saya, belum terhapus,
 * lebih baru dari last_read_message_id). Daftar diambil terbaru dulu
 * (maks 1000) lalu dihitung di klien — pola mentorGroup.
 */
export async function fetchUnreadCount(projectId: string, userId: string): Promise<number> {
  const { data: msgData, error: msgErr } = await supabase
    .from('project_chat_messages')
    .select('id,sender_id,deleted_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1000)
  if (msgErr) throw friendlyError(msgErr, 'Gagal menghitung pesan belum dibaca.')
  const { data: readData, error: readErr } = await supabase
    .from('project_chat_reads')
    .select('last_read_message_id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  if (readErr) throw friendlyError(readErr, 'Gagal menghitung pesan belum dibaca.')
  const lastReadId =
    readData && isRecord(readData) && typeof readData.last_read_message_id === 'string'
      ? readData.last_read_message_id
      : null
  const rows = (msgData ?? []) as { id: string; sender_id: string; deleted_at: string | null }[]
  const lastReadIndex = lastReadId ? rows.findIndex((r) => r.id === lastReadId) : -1
  // Pesan yang lebih baru dari yang terakhir dibaca = yang indeksnya
  // LEBIH KECIL (daftar terbaru dulu). Tanpa baris baca, semuanya dihitung.
  const newer = lastReadIndex === -1 ? rows : rows.slice(0, lastReadIndex)
  let count = 0
  for (const row of newer) {
    if (row.sender_id === userId) continue
    if (row.deleted_at) continue
    count += 1
  }
  return count
}

export interface ProjectChatSummary {
  unread: number
  latest: { body: string; senderName: string; createdAt: string } | null
}

/** Ringkasan untuk kartu Chat Tim: unread + pesan terakhir. */
export async function fetchProjectChatSummary(
  projectId: string,
  userId: string,
): Promise<ProjectChatSummary> {
  const [unread, latestRows] = await Promise.all([
    fetchUnreadCount(projectId, userId),
    supabase
      .from('project_chat_messages')
      .select('body,sender_id,created_at,deleted_at')
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1),
  ])
  const latestRow = (latestRows.data ?? [])[0] as
    | { body: string; sender_id: string; created_at: string }
    | undefined
  if (latestRows.error) throw friendlyError(latestRows.error, 'Gagal memuat ringkasan chat.')
  let senderName = 'Anggota'
  if (latestRow) {
    try {
      const { data } = await supabase
        .from('public_profiles')
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

/**
 * Sematkan pesan (pemilik proyek / mentor proyek — RPC menolak yang lain).
 * Lewat RPC set_project_chat_pin, BUKAN UPDATE langsung: kebijakan UPDATE
 * hanya mengizinkan pengirim sendiri atau admin, sehingga pemilik/mentor
 * yang bukan pengirim tidak bisa pin lewat UPDATE (RLS 42501).
 */
export async function pinMessage(messageId: string): Promise<void> {
  const { error } = await supabase.rpc('set_project_chat_pin', {
    p_message_id: messageId,
    p_pinned: true,
  })
  if (error) throw friendlyError(error, 'Gagal menyematkan pesan.')
}

/** Lepas sematan (pemilik proyek / mentor proyek). */
export async function unpinMessage(messageId: string): Promise<void> {
  const { error } = await supabase.rpc('set_project_chat_pin', {
    p_message_id: messageId,
    p_pinned: false,
  })
  if (error) throw friendlyError(error, 'Gagal melepas sematan.')
}

/**
 * Hapus pesan (pengirim sendiri atau admin — soft delete via deleted_at).
 * Lewat RPC delete_own_project_chat_message, BUKAN UPDATE langsung: UPDATE
 * deleted_at selalu ditolak 42501 untuk non-admin karena kebijakan SELECT
 * mensyaratkan deleted_at IS NULL (lihat migrasi 068, pelajaran 065/066).
 */
export async function deleteMessage(messageId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_own_project_chat_message', {
    p_message_id: messageId,
  })
  if (error) throw friendlyError(error, 'Gagal menghapus pesan.')
}

/** Tautan signed URL (3600 detik) untuk lampiran di bucket privat. */
export async function signedChatAttachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(PROJECT_CHAT_BUCKET)
    .createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) {
    throw new ProjectChatError(
      'generic',
      'Lampiran tidak bisa dibuka saat ini. Coba lagi sebentar lagi.',
    )
  }
  return data.signedUrl
}

export type RealtimeStatus = 'ok' | 'error'

export interface ProjectChatRealtimeEvent {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  message: ProjectChatMessage | null
  messageId: string
}

function parseRealtimeRow(row: unknown): ProjectChatMessage | null {
  if (!isRecord(row) || typeof row.id !== 'string') return null
  return parseMessageRow(row)
}

/**
 * Langganan Realtime untuk pesan chat satu proyek (postgres_changes).
 * onEvent dipanggil untuk INSERT/UPDATE/DELETE; onStatus memberi tahu
 * apakah langganan berhasil ('ok') atau gagal ('error' — halaman
 * menampilkan notice jujur + tombol muat ulang manual).
 * Mengembalikan fungsi unsubscribe.
 */
export function subscribeToProject(
  projectId: string,
  onEvent: (event: ProjectChatRealtimeEvent) => void,
  onStatus?: (status: RealtimeStatus) => void,
): () => void {
  const channel = supabase
    .channel(`project-chat-${projectId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'project_chat_messages',
        filter: `project_id=eq.${projectId}`,
      },
      (payload) => {
        const eventType = payload.eventType as ProjectChatRealtimeEvent['eventType']
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
