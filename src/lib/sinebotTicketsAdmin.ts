// SINEVERSE — SINEBOT admin tiket (Tahap 4, frontend).
//
// Wrapper RPC admin untuk helpdesk tiket. Semua RPC didefinisikan oleh
// pekerja backend Tahap 4 dari kontrak yang sama — nama fungsi dan
// parameter di bawah ini MENGIKUTI kontrak persis; jangan mengubah nama
// sendiri bila ada yang terasa janggal, catat di laporan koordinator.
//
// Kontrak RPC (admin_* + get_sinebot_ticket + reply_to_sinebot_ticket):
// - admin_list_tickets(p_status, p_search, p_limit, p_offset)
//   -> SETOF support_tickets (semua pengguna; guard is_admin() + audit
//   log di dalam RPC).
// - get_sinebot_ticket(p_ticket_id) -> jsonb {ticket, messages[]}
// - reply_to_sinebot_ticket(p_ticket_id, p_message, p_attachment_path,
//   p_attachment_name, p_attachment_size, p_attachment_type) -> uuid
// - admin_set_ticket_status(p_ticket_id, p_status) -> void
//   ('closed' tidak bisa diubah lagi — RPC melempar error).
// - admin_assign_ticket(p_ticket_id, p_assignee_id) -> void
//   (assignee harus admin; 'open' otomatis jadi 'assigned').
// - admin_set_ticket_priority(p_ticket_id, p_priority) -> void
// - admin_list_admins() -> TABLE(id uuid, name text)
//
// Tipe didefinisikan lokal di file ini: src/lib/sinebot.ts (milik worker
// lain, JANGAN diedit) tidak punya tipe tiket, jadi tidak ada yang bisa
// diimpor ulang. Parsing dibuat defensif (kolom dibaca apa adanya dari
// baris RPC) karena bentuk persis support_tickets /
// support_ticket_messages ditentukan migrasi backend Tahap 4.
import { checkTicketAttachmentContent } from './attachmentValidation'
import { supabase } from './supabase'

export type TicketStatus =
  | 'open'
  | 'assigned'
  | 'in_progress'
  | 'waiting_for_user'
  | 'resolved'
  | 'closed'

export type TicketPriority = 'low' | 'medium' | 'high' | 'critical'

export const TICKET_STATUSES: TicketStatus[] = [
  'open',
  'assigned',
  'in_progress',
  'waiting_for_user',
  'resolved',
  'closed',
]

export const TICKET_PRIORITIES: TicketPriority[] = ['low', 'medium', 'high', 'critical']

/** Label Bahasa Indonesia untuk status tiket (bukan mentah "open"). */
export function ticketStatusLabel(status: string): string {
  if (status === 'open') return 'Baru'
  if (status === 'assigned') return 'Ditugaskan'
  if (status === 'in_progress') return 'Sedang Ditangani'
  if (status === 'waiting_for_user') return 'Menunggu Pengguna'
  if (status === 'resolved') return 'Terselesaikan'
  if (status === 'closed') return 'Ditutup'
  return status
}

/** Label Bahasa Indonesia untuk prioritas tiket. */
export function ticketPriorityLabel(priority: string): string {
  if (priority === 'low') return 'Rendah'
  if (priority === 'medium') return 'Sedang'
  if (priority === 'high') return 'Tinggi'
  if (priority === 'critical') return 'Kritis'
  return priority
}

export interface TicketAttachment {
  path: string
  name: string
  size: number | null
  type: string | null
}

export interface TicketAdmin {
  id: string
  user_id: string
  subject: string
  description: string
  category: string | null
  status: TicketStatus
  priority: TicketPriority
  assigned_to: string | null
  attachment: TicketAttachment | null
  created_at: string
  updated_at: string
}

export interface TicketAdminMessage {
  id: string
  ticket_id: string
  sender_type: 'admin' | 'user'
  sender_id: string | null
  // Nama pengirim dari RPC get_sinebot_ticket (kontrak Tahap 4) —
  // dipakai langsung untuk label balasan; lookup profil hanya fallback
  // bila RPC tidak mengembalikannya.
  sender_name: string | null
  content: string
  attachment: TicketAttachment | null
  created_at: string
}

export interface TicketAdminDetail {
  ticket: TicketAdmin
  messages: TicketAdminMessage[]
}

export interface AdminListUser {
  id: string
  name: string
}

export class TicketAdminError extends Error {
  code: 'not_admin' | 'not_ready' | 'network' | 'unauthorized' | 'generic'

  constructor(code: TicketAdminError['code'], message: string) {
    super(message)
    this.name = 'TicketAdminError'
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

function asNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseStatus(value: unknown): TicketStatus {
  return TICKET_STATUSES.includes(value as TicketStatus) ? (value as TicketStatus) : 'open'
}

function parsePriority(value: unknown): TicketPriority {
  return TICKET_PRIORITIES.includes(value as TicketPriority) ? (value as TicketPriority) : 'medium'
}

function parseAttachment(row: Record<string, unknown>): TicketAttachment | null {
  const path = asStringOrNull(row.attachment_path ?? row.file_path)
  if (!path) return null
  return {
    path,
    name: asString(row.attachment_name ?? row.file_name, 'Lampiran'),
    size: asNumberOrNull(row.attachment_size ?? row.file_size),
    type: asStringOrNull(row.attachment_type ?? row.file_type),
  }
}

function parseTicketRow(row: Record<string, unknown>): TicketAdmin {
  return {
    id: asString(row.id),
    user_id: asString(row.user_id),
    subject: asString(row.subject, '(Tanpa subjek)'),
    description: asString(row.description ?? row.body),
    category: asStringOrNull(row.category),
    status: parseStatus(row.status),
    priority: parsePriority(row.priority),
    assigned_to: asStringOrNull(row.assigned_to ?? row.assignee_id),
    attachment: parseAttachment(row),
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at ?? row.created_at),
  }
}

function parseMessageRow(row: Record<string, unknown>): TicketAdminMessage {
  const sender = asString(row.sender_type ?? row.sender_role)
  return {
    id: asString(row.id),
    ticket_id: asString(row.ticket_id),
    sender_type: sender === 'admin' || sender === 'support' ? 'admin' : 'user',
    sender_id: asStringOrNull(row.sender_id ?? row.user_id),
    sender_name: asStringOrNull(row.sender_name),
    content: asString(row.content ?? row.message ?? row.body),
    attachment: parseAttachment(row),
    created_at: asString(row.created_at),
  }
}

/**
 * Pesan ramah untuk kegagalan RPC admin. Pesan mentah PostgREST/Supabase
 * (mis. "permission denied", "function does not exist") tidak ditampilkan
 * apa adanya ke admin — diterjemahkan ke Bahasa Indonesia.
 */
function friendlyRpcError(error: { message: string; code?: string }): TicketAdminError {
  const msg = error.message.toLowerCase()
  const code = String(error.code ?? '')
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return new TicketAdminError(
      'network',
      'Tidak dapat terhubung ke SINEVERSE. Periksa koneksi internet lalu coba lagi.',
    )
  }
  // RPC belum ada di database (migrasi Tahap 4 belum di-apply) atau
  // tabel support_tickets belum ada: bukan salah admin.
  if (
    code === '42883' ||
    code === '42P01' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the function') ||
    msg.includes('relation') && msg.includes('does not exist')
  ) {
    return new TicketAdminError(
      'not_ready',
      'Fitur tiket admin belum aktif di server. Migrasi Tahap 4 belum diterapkan — beri tahu koordinator.',
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
    return new TicketAdminError(
      'not_admin',
      'Halaman ini hanya untuk admin. Akun kamu tidak memiliki akses admin untuk mengelola tiket.',
    )
  }
  if (msg.includes('jwt') || msg.includes('unauthorized') || msg.includes('not authenticated')) {
    return new TicketAdminError(
      'unauthorized',
      'Sesi kamu sudah berakhir. Masuk lagi untuk mengelola tiket.',
    )
  }
  return new TicketAdminError(
    'generic',
    'Terjadi kendala saat memuat tiket. Coba lagi sebentar lagi.',
  )
}

/**
 * Daftar tiket SEMUA pengguna (admin). p_status null = semua status;
 * p_search null/kosong = tanpa pencarian (subjek/deskripsi, di server).
 */
export async function listTickets(
  status: TicketStatus | null,
  search: string,
  limit = 20,
  offset = 0,
): Promise<TicketAdmin[]> {
  const q = search.trim()
  const { data, error } = await supabase.rpc('admin_list_tickets', {
    p_status: status,
    p_search: q === '' ? null : q,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw friendlyRpcError(error)
  if (!Array.isArray(data)) return []
  return data.filter(isRecord).map(parseTicketRow)
}

/** Satu tiket + seluruh balasannya (admin boleh membuka tiket mana pun). */
export async function getTicket(ticketId: string): Promise<TicketAdminDetail> {
  const { data, error } = await supabase.rpc('get_sinebot_ticket', {
    p_ticket_id: ticketId,
  })
  if (error) throw friendlyRpcError(error)
  if (!isRecord(data) || !isRecord(data.ticket)) {
    throw new TicketAdminError('generic', 'Tiket tidak ditemukan atau tidak bisa dibaca.')
  }
  const messages = Array.isArray(data.messages)
    ? data.messages.filter(isRecord).map(parseMessageRow)
    : []
  return { ticket: parseTicketRow(data.ticket), messages }
}

export interface TicketReplyAttachment {
  path: string
  name: string
  size: number
  type: string
}

// Lampiran balasan admin — sama seperti pengguna (kontrak Tahap 4):
// jpg/jpeg/png/webp/pdf, maks 5 MB, 1 file per balasan.
export const TICKET_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024
export const TICKET_ATTACHMENT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

export function validateTicketAttachment(file: File): string | null {
  if (!TICKET_ATTACHMENT_TYPES[file.type]) {
    return 'Lampiran hanya boleh berupa gambar (JPG, PNG, WebP) atau PDF.'
  }
  if (file.size > TICKET_ATTACHMENT_MAX_BYTES) {
    return 'Ukuran lampiran maksimal 5 MB.'
  }
  return null
}

function sanitizeFileName(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
  return base === '' || base === '.' ? 'lampiran' : base
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Unggah lampiran balasan admin ke bucket privat 'ticket-attachments'
 * (path <user_id>/<uuid>-<nama-file-disaring>), lalu kembalikan
 * metadata untuk diteruskan ke RPC. Upload dilakukan DULU, RPC
 * dipanggil sesudahnya — bila RPC gagal, file yatim tetap di bucket
 * (tidak ada penghapus otomatis; laporkan ke koordinator bila terjadi).
 * TIDAK memakai uploadToBucket() dari lib/supabase: helper itu
 * mengembalikan public URL, yang salah untuk bucket privat.
 */
export async function uploadTicketAttachment(
  userId: string,
  file: File,
): Promise<TicketReplyAttachment> {
  const problem = validateTicketAttachment(file)
  if (problem) throw new TicketAdminError('generic', problem)
  const contentProblem = await checkTicketAttachmentContent(file)
  if (contentProblem) throw new TicketAdminError('generic', contentProblem)
  const path = `${userId}/${randomId()}-${sanitizeFileName(file.name)}`
  const { error } = await supabase.storage.from('ticket-attachments').upload(path, file, {
    upsert: false,
    contentType: file.type,
  })
  if (error) {
    throw new TicketAdminError(
      'generic',
      'Lampiran gagal diunggah. Coba lagi, atau kirim balasan tanpa lampiran.',
    )
  }
  return { path, name: file.name, size: file.size, type: file.type }
}

/**
 * Balas tiket sebagai admin. Lampiran opsional (1 file): diunggah dulu,
 * lalu RPC dipanggil dengan metadata-nya. Mengembalikan id pesan balasan.
 */
export async function replyToTicket(
  ticketId: string,
  message: string,
  attachment: TicketReplyAttachment | null,
): Promise<string> {
  const text = message.trim()
  if (!text) {
    throw new TicketAdminError('generic', 'Tulis dulu balasanmu sebelum mengirim.')
  }
  const { data, error } = await supabase.rpc('reply_to_sinebot_ticket', {
    p_ticket_id: ticketId,
    p_message: text,
    p_attachment_path: attachment?.path ?? null,
    p_attachment_name: attachment?.name ?? null,
    p_attachment_size: attachment?.size ?? null,
    p_attachment_type: attachment?.type ?? null,
  })
  if (error) throw friendlyRpcError(error)
  return typeof data === 'string' ? data : ''
}

/** Ubah status tiket (lifecycle). 'closed' tidak bisa diubah lagi (RPC menolak). */
export async function setTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
  const { error } = await supabase.rpc('admin_set_ticket_status', {
    p_ticket_id: ticketId,
    p_status: status,
  })
  if (error) {
    // Pesan "closed" dari RPC diteruskan apa adanya bila sudah ramah.
    if (error.message.toLowerCase().includes('closed')) {
      throw new TicketAdminError(
        'generic',
        'Tiket yang sudah ditutup tidak bisa diubah lagi statusnya.',
      )
    }
    throw friendlyRpcError(error)
  }
}

/** Tugaskan tiket ke admin lain. Status 'open' otomatis jadi 'assigned' (di RPC). */
export async function assignTicket(ticketId: string, assigneeId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_assign_ticket', {
    p_ticket_id: ticketId,
    p_assignee_id: assigneeId,
  })
  if (error) throw friendlyRpcError(error)
}

/** Ubah prioritas tiket. */
export async function setTicketPriority(ticketId: string, priority: TicketPriority): Promise<void> {
  const { error } = await supabase.rpc('admin_set_ticket_priority', {
    p_ticket_id: ticketId,
    p_priority: priority,
  })
  if (error) throw friendlyRpcError(error)
}

/** Daftar semua admin (untuk dropdown assignment). */
export async function listAdmins(): Promise<AdminListUser[]> {
  const { data, error } = await supabase.rpc('admin_list_admins')
  if (error) throw friendlyRpcError(error)
  if (!Array.isArray(data)) return []
  const out: AdminListUser[] = []
  for (const row of data) {
    if (!isRecord(row)) continue
    if (typeof row.id !== 'string') continue
    out.push({ id: row.id, name: typeof row.name === 'string' && row.name !== '' ? row.name : 'Admin' })
  }
  return out
}

/**
 * Tautan signed URL (3600 detik) untuk satu lampiran di bucket privat
 * 'ticket-attachments'. Dipanggil saat admin mengklik lampiran — URL
 * TIDAK pernah ditampilkan permanen atau disimpan di state.
 */
export async function signedAttachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('ticket-attachments')
    .createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) {
    throw new TicketAdminError(
      'generic',
      'Lampiran tidak bisa dibuka saat ini. Coba lagi sebentar lagi.',
    )
  }
  return data.signedUrl
}
