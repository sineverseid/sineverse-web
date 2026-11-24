// SINEVERSE — Student Community, Fase 2 (migrasi 063).
//
// Satu ruang bersama: siswa + mentor approved + admin. Mentor membimbing,
// BUKAN otomatis admin. Ruang ini TIDAK memengaruhi nilai — hanya Academy
// Discussion yang dinilai (tabel discussions tidak disentuh).
// Tamu tidak bisa masuk: semua kebijakan RLS hanya untuk authenticated,
// feed hanya dibaca anggota (pola 004).
//
// Pola yang ditiru (ATM):
// - mentorGroup.ts: struktur lib + friendlyError + upload bucket privat
//   (path <userId>/... di sini ditambah awalan community/<community_id>)
//   + signed URL 3600 detik + subscribe Realtime + isMissingTableError.
// - CommunityDetailPage: nama penulis dilampirkan dari profiles.
// - sinebot.ts: checkTicketAttachmentContent + sanitizeTicketFileName
//   untuk validasi isi file (magic byte).
import { checkTicketAttachmentContent, sanitizeTicketFileName } from './sinebot'
import { isMissingTableError } from './guarded'
import { logContentBlocked } from './moderation'
import { supabase } from './supabase'

/** 11 kategori awal (Master Prompt Bagian I §3, urutan sesuai PDF). */
export const STUDENT_COMMUNITY_CATEGORIES = [
  'General Discussion',
  'Filmmaking',
  'Cinematography',
  'Screenwriting',
  'Directing',
  'Editing',
  'Sound Design',
  'Film Production',
  'Film Review',
  'Collaboration',
  'Sharing Works',
] as const

export const STUDENT_COMMUNITY_BUCKET = 'community-post-files'

/** Emoji reaksi yang tersedia (tetap — tidak ada emoji bebas). */
export const STUDENT_COMMUNITY_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const

export const STUDENT_COMMUNITY_PAGE_SIZE = 20

/** Lampiran postingan: gambar / PDF, maks 10 MB (sama seperti Fase 1). */
export const STUDENT_COMMUNITY_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

const STUDENT_COMMUNITY_ATTACHMENT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
}

export class StudentCommunityError extends Error {
  code: 'not_member' | 'not_ready' | 'network' | 'unauthorized' | 'generic'

  constructor(code: StudentCommunityError['code'], message: string) {
    super(message)
    this.name = 'StudentCommunityError'
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Terjemahkan error Supabase/PostgREST ke pesan Bahasa Indonesia yang jujur. */
function friendlyError(error: { message: string; code?: string }, action: string): StudentCommunityError {
  if (isMissingTableError(error)) {
    return new StudentCommunityError(
      'not_ready',
      'Komunitas siswa belum aktif di server (migrasi 063 belum diterapkan). Beri tahu admin.',
    )
  }
  const msg = error.message.toLowerCase()
  const code = String(error.code ?? '')
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return new StudentCommunityError(
      'network',
      'Tidak dapat terhubung ke SINEVERSE. Periksa koneksi internet lalu coba lagi.',
    )
  }
  if (msg.includes('jwt') || msg.includes('unauthorized') || msg.includes('not authenticated')) {
    return new StudentCommunityError(
      'unauthorized',
      'Sesi kamu sudah berakhir. Masuk lagi untuk membuka komunitas ini.',
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
    return new StudentCommunityError('generic', error.message)
  }
  if (
    code === '42501' ||
    msg.includes('permission denied') ||
    msg.includes('row-level security') ||
    msg.includes('not a member') ||
    msg.includes('only an admin')
  ) {
    return new StudentCommunityError(
      'not_member',
      'Kamu bukan anggota komunitas ini, atau aksi itu hanya untuk admin/pembuat komunitas.',
    )
  }
  return new StudentCommunityError('generic', `${action} Coba lagi sebentar lagi.`)
}

/** Label badge peran (Master Prompt: Student / Mentor / Admin terlihat). */
export function roleBadgeLabel(role: string | null | undefined): 'Student' | 'Mentor' | 'Admin' {
  if (role === 'mentor') return 'Mentor'
  if (role === 'admin') return 'Admin'
  return 'Student'
}

export interface StudentCommunityAuthor {
  name: string
  role: string
  photo_url: string | null
}

export interface StudentCommunityPost {
  id: string
  community_id: string
  user_id: string
  title: string | null
  category: string | null
  body: string
  is_pinned: boolean
  attachment_path: string | null
  attachment_name: string | null
  attachment_type: string | null
  mentioned_user_ids: string[]
  created_at: string
  /** Fase 6 (070): disembunyikan admin/mentor berwenang; bukan-admin
      tidak melihat baris ini (RLS), admin melihat dengan lencana. */
  is_hidden?: boolean
  hidden_by?: string | null
  hidden_at?: string | null
  /** Dilampirkan dari profiles (pola CommunityDetailPage). */
  author: StudentCommunityAuthor | null
}

export interface StudentCommunityReply {
  id: string
  post_id: string
  parent_id: string | null
  user_id: string
  body: string
  mentioned_user_ids: string[]
  created_at: string
  /** Fase 6 (070): lihat StudentCommunityPost. */
  is_hidden?: boolean
  hidden_by?: string | null
  hidden_at?: string | null
  author: StudentCommunityAuthor | null
}

export interface StudentCommunityReactionSummary {
  emoji: string
  count: number
  mine: boolean
}

export interface StudentCommunityMember {
  user_id: string
  role: string
  name: string
  photo_url: string | null
  /** Role profil (siswa/mentor/admin) — untuk badge peran. */
  profileRole: string
}

function parsePostRow(row: Record<string, unknown>): StudentCommunityPost {
  return {
    id: typeof row.id === 'string' ? row.id : '',
    community_id: typeof row.community_id === 'string' ? row.community_id : '',
    user_id: typeof row.user_id === 'string' ? row.user_id : '',
    title: typeof row.title === 'string' ? row.title : null,
    category: typeof row.category === 'string' ? row.category : null,
    body: typeof row.body === 'string' ? row.body : '',
    is_pinned: row.is_pinned === true,
    attachment_path: typeof row.attachment_path === 'string' ? row.attachment_path : null,
    attachment_name: typeof row.attachment_name === 'string' ? row.attachment_name : null,
    attachment_type: typeof row.attachment_type === 'string' ? row.attachment_type : null,
    mentioned_user_ids: Array.isArray(row.mentioned_user_ids)
      ? (row.mentioned_user_ids.filter((v) => typeof v === 'string') as string[])
      : [],
    created_at: typeof row.created_at === 'string' ? row.created_at : '',
    is_hidden: row.is_hidden === true,
    hidden_by: typeof row.hidden_by === 'string' ? row.hidden_by : null,
    hidden_at: typeof row.hidden_at === 'string' ? row.hidden_at : null,
    author: null,
  }
}

function parseReplyRow(row: Record<string, unknown>): StudentCommunityReply {
  return {
    id: typeof row.id === 'string' ? row.id : '',
    post_id: typeof row.post_id === 'string' ? row.post_id : '',
    parent_id: typeof row.parent_id === 'string' ? row.parent_id : null,
    user_id: typeof row.user_id === 'string' ? row.user_id : '',
    body: typeof row.body === 'string' ? row.body : '',
    mentioned_user_ids: Array.isArray(row.mentioned_user_ids)
      ? (row.mentioned_user_ids.filter((v) => typeof v === 'string') as string[])
      : [],
    created_at: typeof row.created_at === 'string' ? row.created_at : '',
    is_hidden: row.is_hidden === true,
    hidden_by: typeof row.hidden_by === 'string' ? row.hidden_by : null,
    hidden_at: typeof row.hidden_at === 'string' ? row.hidden_at : null,
    author: null,
  }
}

async function fetchAuthors(
  ids: string[],
): Promise<Map<string, StudentCommunityAuthor>> {
  const out = new Map<string, StudentCommunityAuthor>()
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return out
  const { data, error } = await supabase
    .from('public_profiles')
    .select('id,name,role,photo_url')
    .in('id', unique)
  if (error) throw error
  for (const p of (data ?? []) as {
    id: string
    name: string | null
    role: string
    photo_url: string | null
  }[]) {
    out.set(p.id, {
      name: p.name ?? 'Anggota',
      role: p.role ?? 'siswa',
      photo_url: p.photo_url ?? null,
    })
  }
  return out
}

export interface OfficialCommunityResult {
  community: { id: string; name: string } | null
  /** true bila kolom is_student_community belum ada / query gagal. */
  notReady: boolean
}

/**
 * Ruang resmi Student Community (satu komunitas yang ditandai admin).
 * Tidak pernah melempar — bila migrasi 063 belum diterapkan, kartu
 * dashboard menampilkan pesan jujur lewat notReady.
 */
export async function fetchOfficialCommunity(): Promise<OfficialCommunityResult> {
  try {
    const { data, error } = await supabase
      .from('communities')
      .select('id,name')
      .eq('is_student_community', true)
      .eq('is_approved', true)
      .maybeSingle()
    if (error) return { community: null, notReady: true }
    const row = data as { id: string; name: string } | null
    return { community: row ?? null, notReady: false }
  } catch {
    return { community: null, notReady: true }
  }
}

/** Daftar kategori aktif dari tabel (fallback ke 11 nama PDF bila tabel belum ada). */
export async function fetchCategories(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('community_categories')
      .select('name')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (error) return [...STUDENT_COMMUNITY_CATEGORIES]
    const names = ((data ?? []) as { name: string }[])
      .map((r) => r.name)
      .filter(Boolean)
    return names.length > 0 ? names : [...STUDENT_COMMUNITY_CATEGORIES]
  } catch {
    return [...STUDENT_COMMUNITY_CATEGORIES]
  }
}

export interface FetchPostsOptions {
  category?: string | null
  search?: string
  beforeCreatedAt?: string | null
  limit?: number
}

/** Postingan komunitas, disematkan dulu lalu terbaru. */
export async function fetchPosts(
  communityId: string,
  options: FetchPostsOptions = {},
): Promise<StudentCommunityPost[]> {
  const limit = options.limit ?? STUDENT_COMMUNITY_PAGE_SIZE
  const search = (options.search ?? '').trim()
  const category = (options.category ?? '').trim()
  let query = supabase
    .from('community_posts')
    .select('*')
    .eq('community_id', communityId)
  if (category !== '') query = query.eq('category', category)
  if (search !== '') {
    // Lindungi karakter wildcard LIKE supaya dicari harfiah.
    const escaped = search.replace(/[%_\\]/g, (c) => `\\${c}`)
    query = query.or(`title.ilike.%${escaped}%,body.ilike.%${escaped}%`)
  } else if (options.beforeCreatedAt) {
    query = query.lt('created_at', options.beforeCreatedAt)
  }
  const { data, error } = await query
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)
  if (error) throw friendlyError(error, 'Gagal memuat postingan.')
  const posts = ((data ?? []) as Record<string, unknown>[])
    .filter(isRecord)
    .map(parsePostRow)
  try {
    const authors = await fetchAuthors(posts.map((p) => p.user_id))
    for (const p of posts) p.author = authors.get(p.user_id) ?? null
  } catch (err) {
    if (err instanceof Error) throw friendlyError(err, 'Gagal memuat postingan.')
    throw err
  }
  return posts
}

/** Semua balasan untuk postingan-postingan ini, terlama dulu. */
export async function fetchReplies(postIds: string[]): Promise<StudentCommunityReply[]> {
  const ids = [...new Set(postIds.filter(Boolean))]
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('community_post_replies')
    .select('*')
    .in('post_id', ids)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw friendlyError(error, 'Gagal memuat balasan.')
  const replies = ((data ?? []) as Record<string, unknown>[])
    .filter(isRecord)
    .map(parseReplyRow)
  const authors = await fetchAuthors(replies.map((r) => r.user_id))
  for (const r of replies) r.author = authors.get(r.user_id) ?? null
  return replies
}

/** Kunci target reaksi: 'post:<id>' atau 'reply:<id>'. */
export function reactionKey(target: { postId?: string; replyId?: string }): string {
  if (target.replyId) return `reply:${target.replyId}`
  return `post:${target.postId ?? ''}`
}

/** Ringkasan reaksi per target: jumlah per emoji + apakah saya sudah memberi. */
export async function fetchReactions(
  postIds: string[],
  replyIds: string[],
  myUserId: string,
): Promise<Map<string, StudentCommunityReactionSummary[]>> {
  const out = new Map<string, StudentCommunityReactionSummary[]>()
  const posts = [...new Set(postIds.filter(Boolean))]
  const replies = [...new Set(replyIds.filter(Boolean))]
  if (posts.length === 0 && replies.length === 0) return out
  let rows: { post_id: string | null; reply_id: string | null; user_id: string; emoji: string }[] = []
  if (posts.length > 0) {
    const { data, error } = await supabase
      .from('community_post_reactions')
      .select('post_id,reply_id,user_id,emoji')
      .in('post_id', posts)
    if (error) throw friendlyError(error, 'Gagal memuat reaksi.')
    rows = rows.concat((data ?? []) as typeof rows)
  }
  if (replies.length > 0) {
    const { data, error } = await supabase
      .from('community_post_reactions')
      .select('post_id,reply_id,user_id,emoji')
      .in('reply_id', replies)
    if (error) throw friendlyError(error, 'Gagal memuat reaksi.')
    rows = rows.concat((data ?? []) as typeof rows)
  }
  const grouped = new Map<string, Map<string, { count: number; mine: boolean }>>()
  for (const row of rows) {
    const key = row.reply_id ? `reply:${row.reply_id}` : `post:${row.post_id ?? ''}`
    let perEmoji = grouped.get(key)
    if (!perEmoji) {
      perEmoji = new Map()
      grouped.set(key, perEmoji)
    }
    const current = perEmoji.get(row.emoji) ?? { count: 0, mine: false }
    current.count += 1
    if (row.user_id === myUserId) current.mine = true
    perEmoji.set(row.emoji, current)
  }
  const emojiRank = new Map<string, number>(
    STUDENT_COMMUNITY_EMOJIS.map((e, i) => [e as string, i]),
  )
  for (const [key, perEmoji] of grouped) {
    out.set(
      key,
      [...perEmoji.entries()]
        .map(([emoji, v]) => ({ emoji, count: v.count, mine: v.mine }))
        .sort((a, b) => (emojiRank.get(a.emoji) ?? 99) - (emojiRank.get(b.emoji) ?? 99)),
    )
  }
  return out
}

/** Beri atau cabut reaksi saya pada satu postingan / balasan. */
export async function toggleReaction(
  target: { postId?: string; replyId?: string },
  userId: string,
  emoji: string,
): Promise<'added' | 'removed'> {
  if (!STUDENT_COMMUNITY_EMOJIS.includes(emoji as (typeof STUDENT_COMMUNITY_EMOJIS)[number])) {
    throw new StudentCommunityError('generic', 'Reaksi itu tidak tersedia di komunitas ini.')
  }
  const isReply = Boolean(target.replyId)
  let query = supabase
    .from('community_post_reactions')
    .select('id')
    .eq('user_id', userId)
    .eq('emoji', emoji)
  query = isReply ? query.eq('reply_id', target.replyId as string) : query.eq('post_id', target.postId as string)
  const { data, error } = await query.maybeSingle()
  if (error) throw friendlyError(error, 'Gagal mengubah reaksi.')
  if (data && isRecord(data) && typeof data.id === 'string') {
    const { error: delErr } = await supabase
      .from('community_post_reactions')
      .delete()
      .eq('id', data.id)
    if (delErr) throw friendlyError(delErr, 'Gagal mengubah reaksi.')
    return 'removed'
  }
  const { error: insErr } = await supabase.from('community_post_reactions').insert({
    post_id: isReply ? null : (target.postId as string),
    reply_id: isReply ? (target.replyId as string) : null,
    user_id: userId,
    emoji,
  })
  if (insErr) throw friendlyError(insErr, 'Gagal mengubah reaksi.')
  return 'added'
}

/** Validasi lampiran sebelum upload. Null = boleh diunggah. */
export function validatePostAttachment(file: File): string | null {
  if (!file || file.size <= 0) return 'File lampiran tidak bisa dibaca. Pilih file lain.'
  if (file.size > STUDENT_COMMUNITY_ATTACHMENT_MAX_BYTES) {
    return 'Ukuran lampiran maksimal 10 MB.'
  }
  if (!STUDENT_COMMUNITY_ATTACHMENT_TYPES[(file.type || '').toLowerCase()]) {
    return 'Lampiran hanya boleh berupa gambar (JPG, PNG, WebP, GIF) atau PDF.'
  }
  return null
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export interface SendPostInput {
  communityId: string
  userId: string
  title?: string | null
  category?: string | null
  body: string
  mentionedUserIds?: string[]
  file?: File | null
}

/**
 * Kirim postingan. Lampiran (opsional, 1 file) diunggah DULU ke bucket
 * privat, baru postingan di-insert — bila insert gagal, file yatim tetap
 * di bucket (tidak ada penghapus otomatis). Postingan boleh hanya lampiran
 * tanpa teks (judul + lampiran cukup).
 */
export async function sendPost(input: SendPostInput): Promise<StudentCommunityPost> {
  const text = input.body.trim()
  const title = (input.title ?? '').trim()
  const category = (input.category ?? '').trim()
  const file = input.file ?? null
  if (text === '' && !file) {
    throw new StudentCommunityError('generic', 'Tulis postingan atau lampirkan file dulu sebelum mengirim.')
  }
  if (title.length > 120) {
    throw new StudentCommunityError('generic', 'Judul terlalu panjang (maksimal 120 karakter).')
  }
  if (text.length > 5000) {
    throw new StudentCommunityError('generic', 'Postingan terlalu panjang (maksimal 5000 karakter).')
  }
  if (category !== '' && !(STUDENT_COMMUNITY_CATEGORIES as readonly string[]).includes(category)) {
    throw new StudentCommunityError('generic', 'Kategori itu tidak tersedia di komunitas ini.')
  }
  let attachment: { path: string; name: string; type: string } | null = null
  if (file) {
    const problem = validatePostAttachment(file)
    if (problem) throw new StudentCommunityError('generic', problem)
    const contentProblem = await checkTicketAttachmentContent(file)
    if (contentProblem) throw new StudentCommunityError('generic', contentProblem)
    const path = `community/${input.communityId}/${input.userId}/${randomId()}-${sanitizeTicketFileName(file.name)}`
    const { error: upErr } = await supabase.storage.from(STUDENT_COMMUNITY_BUCKET).upload(path, file, {
      upsert: false,
      contentType: file.type,
    })
    if (upErr) {
      throw new StudentCommunityError(
        'generic',
        'Lampiran gagal diunggah. Coba lagi, atau kirim postingan tanpa lampiran.',
      )
    }
    attachment = { path, name: file.name, type: file.type }
  }
  const { data, error } = await supabase
    .from('community_posts')
    .insert({
      community_id: input.communityId,
      user_id: input.userId,
      title: title === '' ? null : title,
      category: category === '' ? null : category,
      body: text,
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
      void logContentBlocked('community_post', { reason: 'filter' })
    }
    throw friendlyError(error, 'Gagal mengirim postingan.')
  }
  if (!isRecord(data)) {
    throw new StudentCommunityError('generic', 'Gagal mengirim postingan. Coba lagi sebentar lagi.')
  }
  const post = parsePostRow(data)
  const authors = await fetchAuthors([post.user_id])
  post.author = authors.get(post.user_id) ?? null
  return post
}

export interface SendReplyInput {
  postId: string
  userId: string
  body: string
  parentId?: string | null
  mentionedUserIds?: string[]
}

/** Kirim balasan (langsung ke postingan, atau bertingkat via parentId). */
export async function sendReply(input: SendReplyInput): Promise<StudentCommunityReply> {
  const text = input.body.trim()
  if (text === '') {
    throw new StudentCommunityError('generic', 'Tulis balasan dulu sebelum mengirim.')
  }
  if (text.length > 2000) {
    throw new StudentCommunityError('generic', 'Balasan terlalu panjang (maksimal 2000 karakter).')
  }
  const { data, error } = await supabase
    .from('community_post_replies')
    .insert({
      post_id: input.postId,
      parent_id: input.parentId ?? null,
      user_id: input.userId,
      body: text,
      mentioned_user_ids: input.mentionedUserIds ?? [],
    })
    .select()
    .single()
  if (error) {
    // Filter konten menolak di transaksi yang sama — catat ke audit_log
    // (best-effort, tidak mengganggu pengguna).
    if (error.message.toLowerCase().includes('tidak diizinkan')) {
      void logContentBlocked('community_reply', { reason: 'filter' })
    }
    throw friendlyError(error, 'Gagal mengirim balasan.')
  }
  if (!isRecord(data)) {
    throw new StudentCommunityError('generic', 'Gagal mengirim balasan. Coba lagi sebentar lagi.')
  }
  const reply = parseReplyRow(data)
  const authors = await fetchAuthors([reply.user_id])
  reply.author = authors.get(reply.user_id) ?? null
  return reply
}

/** Hapus postingan (pemilik atau admin — RLS yang memutuskan). */
export async function deletePost(postId: string): Promise<void> {
  const { error } = await supabase.from('community_posts').delete().eq('id', postId)
  if (error) throw friendlyError(error, 'Gagal menghapus postingan.')
}

/** Hapus balasan (pemilik atau admin — RLS yang memutuskan). */
export async function deleteReply(replyId: string): Promise<void> {
  const { error } = await supabase.from('community_post_replies').delete().eq('id', replyId)
  if (error) throw friendlyError(error, 'Gagal menghapus balasan.')
}

/** Anggota komunitas beserta nama + role profil (untuk badge + mention). */
export async function fetchMembers(communityId: string): Promise<StudentCommunityMember[]> {
  const { data, error } = await supabase
    .from('community_members')
    .select('user_id,role')
    .eq('community_id', communityId)
    .order('created_at', { ascending: true })
  if (error) throw friendlyError(error, 'Gagal memuat daftar anggota.')
  const rows = (data ?? []) as { user_id: string; role: string }[]
  if (rows.length === 0) return []
  const authors = await fetchAuthors(rows.map((r) => r.user_id))
  return rows.map((r) => {
    const a = authors.get(r.user_id)
    return {
      user_id: r.user_id,
      role: r.role ?? 'member',
      name: a?.name ?? 'Anggota',
      photo_url: a?.photo_url ?? null,
      profileRole: a?.role ?? 'siswa',
    }
  })
}

export interface StudentCommunitySummary {
  communityId: string | null
  communityName: string | null
  /** true bila migrasi 063 belum diterapkan / belum ada ruang resmi. */
  notReady: boolean
  /** Postingan baru 7 hari terakhir di ruang resmi. */
  newCount: number
  /** Notifikasi komunitas belum dibaca (balasan + mention). */
  unread: number
  latest: { title: string | null; body: string; authorName: string; createdAt: string } | null
}

/** Ringkasan untuk kartu dashboard siswa: aktivitas terbaru + unread. */
export async function fetchStudentCommunitySummary(
  userId: string,
): Promise<StudentCommunitySummary> {
  const official = await fetchOfficialCommunity()
  if (!official.community) {
    return {
      communityId: null,
      communityName: null,
      notReady: official.notReady,
      newCount: 0,
      unread: 0,
      latest: null,
    }
  }
  const communityId = official.community.id
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const [countRes, latestRes, unreadRes] = await Promise.all([
    supabase
      .from('community_posts')
      .select('id', { count: 'exact', head: true })
      .eq('community_id', communityId)
      .gte('created_at', sevenDaysAgo),
    supabase
      .from('community_posts')
      .select('title,body,user_id,created_at')
      .eq('community_id', communityId)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false)
      .in('kind', ['community_post_reply', 'community_post_mention']),
  ])
  if (countRes.error) throw friendlyError(countRes.error, 'Gagal memuat ringkasan komunitas.')
  if (latestRes.error) throw friendlyError(latestRes.error, 'Gagal memuat ringkasan komunitas.')
  if (unreadRes.error) throw friendlyError(unreadRes.error, 'Gagal memuat ringkasan komunitas.')
  const latestRow = (latestRes.data ?? [])[0] as
    | { title: string | null; body: string; user_id: string; created_at: string }
    | undefined
  let authorName = 'Anggota'
  if (latestRow) {
    const authors = await fetchAuthors([latestRow.user_id])
    authorName = authors.get(latestRow.user_id)?.name ?? 'Anggota'
  }
  return {
    communityId,
    communityName: official.community.name,
    notReady: false,
    newCount: countRes.count ?? 0,
    unread: unreadRes.count ?? 0,
    latest: latestRow
      ? {
          title: latestRow.title,
          body: latestRow.body,
          authorName,
          createdAt: latestRow.created_at,
        }
      : null,
  }
}

/** Tautan signed URL (3600 detik) untuk lampiran di bucket privat. */
export async function signedPostAttachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(STUDENT_COMMUNITY_BUCKET)
    .createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) {
    throw new StudentCommunityError(
      'generic',
      'Lampiran tidak bisa dibuka saat ini. Coba lagi sebentar lagi.',
    )
  }
  return data.signedUrl
}

export type RealtimeStatus = 'ok' | 'error'

/**
 * Langganan Realtime untuk postingan + balasan satu komunitas.
 * onChange dipanggil untuk perubahan apa pun (halaman memuat ulang feed);
 * onStatus memberi tahu apakah langganan berhasil ('ok') atau gagal
 * ('error' — halaman menampilkan notice jujur + tombol muat ulang manual).
 * Mengembalikan fungsi unsubscribe.
 */
export function subscribeToCommunity(
  communityId: string,
  onChange: () => void,
  onStatus?: (status: RealtimeStatus) => void,
): () => void {
  const channel = supabase
    .channel(`student-community-${communityId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'community_posts',
        filter: `community_id=eq.${communityId}`,
      },
      () => onChange(),
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'community_post_replies',
      },
      () => onChange(),
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
