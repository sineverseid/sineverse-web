// SINEVERSE — SINEBOT admin Knowledge Base (Tahap 5, frontend).
//
// Wrapper RPC admin untuk editor KB (artikel + FAQ). Semua RPC
// didefinisikan oleh pekerja backend Tahap 5 (migrasi 054) dari kontrak
// yang sama — nama fungsi dan parameter di bawah ini MENGIKUTI kontrak
// persis; jangan mengubah nama sendiri bila ada yang terasa janggal,
// catat di laporan koordinator.
//
// Kontrak RPC:
// - admin_list_kb_articles(p_status, p_search, p_limit, p_offset)
//   -> array {id,title,category,status,audience_roles,version,owner_id,
//   owner_name,published_at,updated_at}
// - admin_list_faqs(p_status, p_search, p_limit, p_offset)
//   -> array {id,question,category,status,audience_roles,version,
//   updated_at}
// - admin_get_kb_article(p_id) -> objek atau null
// - admin_get_faq(p_id) -> objek atau null
// - admin_save_kb_article(p_id|null, p_title, p_category, p_content,
//   p_audience_roles, p_status) -> uuid (insert baru menaikkan version
//   lewat trigger; update menaikkan version + menulis riwayat)
// - admin_save_faq(p_id|null, p_question, p_answer, p_category,
//   p_audience_roles, p_status) -> uuid
// - admin_set_kb_status(p_kind 'article'|'faq', p_id, p_status) -> boolean
// - admin_list_kb_history(p_kind, p_id, p_limit)
//   -> array {version,title,content,category,audience_roles,status,
//   changed_by,changed_by_name,changed_at}
//
// Catatan skema (terverifikasi, jangan ditebak ulang):
// ai_knowledge_base TIDAK punya created_at; title UNIQUE; status
// ('draft','published','archived') default 'draft'; version int
// default 1. ai_faq TIDAK punya created_at/version/owner_id; question
// UNIQUE; status default 'published'.
// TIDAK ADA penghapusan permanen di Tahap 5 — arsip hanya perubahan
// status dan bisa dikembalikan.
import { supabase } from './supabase'

export type KbStatus = 'draft' | 'published' | 'archived'

export type KbKind = 'article' | 'faq'

export const KB_STATUSES: KbStatus[] = ['draft', 'published', 'archived']

/** Kategori KB — HARUS sama persis dengan seed 049 / HelpCenterPage. */
export const KB_CATEGORIES: string[] = [
  'Akun',
  'Academy',
  'Penilaian',
  'Sertifikat',
  'Showcase',
  'Proyek',
  'Komunitas',
  'Acara',
  'Mentor',
  'Admin',
  'Umum',
]

/** Peran audience — nilai mentah yang disimpan di audience_roles. */
export const KB_AUDIENCE_ROLES: string[] = ['guest', 'siswa', 'mentor', 'admin']

/** Label Bahasa Indonesia untuk status KB (bukan mentah "draft"). */
export function kbStatusLabel(status: string): string {
  if (status === 'draft') return 'Draft'
  if (status === 'published') return 'Terbit'
  if (status === 'archived') return 'Arsip'
  return status
}

/** Label Bahasa Indonesia untuk satu peran audience. */
export function kbAudienceLabel(role: string): string {
  if (role === 'guest') return 'Tamu'
  if (role === 'siswa') return 'Siswa'
  if (role === 'mentor') return 'Mentor'
  if (role === 'admin') return 'Admin'
  return role
}

export interface KbAdminArticle {
  id: string
  title: string
  category: string
  // Isi penuh — hanya diisi admin_get_kb_article (daftar tidak
  // mengembalikannya); kosong ('') bila baris berasal dari daftar.
  content: string
  status: KbStatus
  audience_roles: string[]
  version: number
  owner_id: string | null
  owner_name: string | null
  published_at: string | null
  updated_at: string
}

export interface KbAdminFaq {
  id: string
  question: string
  category: string
  // Jawaban penuh — hanya diisi admin_get_faq (daftar tidak
  // mengembalikannya); kosong ('') bila baris berasal dari daftar.
  answer: string
  status: KbStatus
  audience_roles: string[]
  version: number
  updated_at: string
}

export interface KbHistoryEntry {
  version: number
  title: string
  content: string
  category: string
  audience_roles: string[]
  status: string
  changed_by: string | null
  changed_by_name: string | null
  changed_at: string
}

export interface KbArticleSaveInput {
  id?: string | null
  title: string
  category: string
  content: string
  audience_roles: string[]
  status: KbStatus
}

export interface KbFaqSaveInput {
  id?: string | null
  question: string
  category: string
  answer: string
  audience_roles: string[]
  status: KbStatus
}

export class KbAdminError extends Error {
  code: 'validation' | 'not_admin' | 'not_ready' | 'not_found' | 'duplicate' | 'network' | 'unauthorized' | 'generic'

  constructor(code: KbAdminError['code'], message: string) {
    super(message)
    this.name = 'KbAdminError'
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

function asNumber(value: unknown, fallback = 1): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

function parseStatus(value: unknown): KbStatus {
  return KB_STATUSES.includes(value as KbStatus) ? (value as KbStatus) : 'draft'
}

/**
 * Pesan ramah untuk kegagalan RPC admin KB. Pesan mentah PostgREST /
 * Supabase tidak ditampilkan apa adanya ke admin.
 */
function friendlyRpcError(error: { message: string; code?: string }): KbAdminError {
  const msg = error.message.toLowerCase()
  const code = String(error.code ?? '')
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return new KbAdminError(
      'network',
      'Tidak dapat terhubung ke SINEVERSE. Periksa koneksi internet lalu coba lagi.',
    )
  }
  // RPC belum ada di database (migrasi 054 belum di-apply): bukan salah admin.
  if (
    code === '42883' ||
    code === '42P01' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the function') ||
    (msg.includes('relation') && msg.includes('does not exist'))
  ) {
    return new KbAdminError(
      'not_ready',
      'Fitur admin KB belum aktif di server. Migrasi Tahap 5 (054) belum diterapkan — beri tahu koordinator.',
    )
  }
  if (code === '23505' || msg.includes('duplicate key') || msg.includes('already exists')) {
    return new KbAdminError(
      'duplicate',
      'Judul atau pertanyaan ini sudah dipakai oleh entri lain. Ubah judul/pertanyaan lalu simpan lagi.',
    )
  }
  if (
    msg.includes('not admin') ||
    msg.includes('only admin') ||
    msg.includes('is_admin')
  ) {
    return new KbAdminError(
      'not_admin',
      'Akunmu bukan admin, jadi perubahan KB tidak bisa disimpan.',
    )
  }
  if (code === 'PGRST301' || code === '42501' || msg.includes('permission denied')) {
    return new KbAdminError(
      'unauthorized',
      'Kamu tidak punya izin untuk mengubah Knowledge Base. Login ulang sebagai admin bila ini keliru.',
    )
  }
  if (msg.includes('not found') || msg.includes('no rows') || code === 'PGRST116') {
    return new KbAdminError('not_found', 'Entri KB tidak ditemukan — mungkin sudah diubah admin lain.')
  }
  return new KbAdminError('generic', 'Perubahan KB gagal disimpan. Coba lagi sebentar lagi.')
}

function parseArticleRow(row: Record<string, unknown>): KbAdminArticle {
  return {
    id: asString(row.id),
    title: asString(row.title, '(Tanpa judul)'),
    category: asString(row.category, 'Umum'),
    content: asString(row.content),
    status: parseStatus(row.status),
    audience_roles: asStringArray(row.audience_roles),
    version: asNumber(row.version, 1),
    owner_id: asStringOrNull(row.owner_id),
    owner_name: asStringOrNull(row.owner_name),
    published_at: asStringOrNull(row.published_at),
    updated_at: asString(row.updated_at),
  }
}

function parseFaqRow(row: Record<string, unknown>): KbAdminFaq {
  return {
    id: asString(row.id),
    question: asString(row.question, '(Tanpa pertanyaan)'),
    category: asString(row.category, 'Umum'),
    answer: asString(row.answer),
    status: parseStatus(row.status),
    audience_roles: asStringArray(row.audience_roles),
    version: asNumber(row.version, 1),
    updated_at: asString(row.updated_at),
  }
}

function parseHistoryRow(row: Record<string, unknown>): KbHistoryEntry {
  return {
    version: asNumber(row.version, 1),
    title: asString(row.title, '(Tanpa judul)'),
    content: asString(row.content ?? row.answer),
    category: asString(row.category, 'Umum'),
    audience_roles: asStringArray(row.audience_roles),
    status: asString(row.status),
    changed_by: asStringOrNull(row.changed_by),
    changed_by_name: asStringOrNull(row.changed_by_name),
    changed_at: asString(row.changed_at),
  }
}

/** Ambil baris pertama dari hasil RPC — RPC get_* mengembalikan objek atau null. */
function firstRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    const row = data[0]
    return isRecord(row) ? row : null
  }
  return isRecord(data) ? data : null
}

function asRowArray(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return []
  return data.filter(isRecord)
}

/** Validasi client-side bersama sebelum simpan — RPC tidak boleh dipanggil bila ini gagal. */
function validateSaveInput(
  heading: string,
  body: string,
  category: string,
  audienceRoles: string[],
): void {
  if (heading.trim() === '') {
    throw new KbAdminError('validation', 'Judul/pertanyaan wajib diisi.')
  }
  if (body.trim() === '') {
    throw new KbAdminError('validation', 'Isi/jawaban wajib diisi.')
  }
  if (!KB_CATEGORIES.includes(category)) {
    throw new KbAdminError('validation', 'Pilih kategori yang tersedia di daftar.')
  }
  if (audienceRoles.length === 0) {
    throw new KbAdminError(
      'validation',
      'Pilih minimal satu peran audience (Tamu/Siswa/Mentor/Admin).',
    )
  }
  const unknown = audienceRoles.filter((r) => !KB_AUDIENCE_ROLES.includes(r))
  if (unknown.length > 0) {
    throw new KbAdminError('validation', `Peran audience tidak dikenal: ${unknown.join(', ')}.`)
  }
}

export async function listKbArticles(
  status?: KbStatus | null,
  search?: string | null,
  limit = 20,
  offset = 0,
): Promise<KbAdminArticle[]> {
  const { data, error } = await supabase.rpc('admin_list_kb_articles', {
    p_status: status ?? null,
    p_search: search?.trim() ? search.trim() : null,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw friendlyRpcError(error)
  return asRowArray(data).map(parseArticleRow)
}

export async function listFaqs(
  status?: KbStatus | null,
  search?: string | null,
  limit = 20,
  offset = 0,
): Promise<KbAdminFaq[]> {
  const { data, error } = await supabase.rpc('admin_list_faqs', {
    p_status: status ?? null,
    p_search: search?.trim() ? search.trim() : null,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw friendlyRpcError(error)
  return asRowArray(data).map(parseFaqRow)
}

export async function getKbArticle(id: string): Promise<KbAdminArticle | null> {
  const { data, error } = await supabase.rpc('admin_get_kb_article', { p_id: id })
  if (error) throw friendlyRpcError(error)
  const row = firstRow(data)
  return row ? parseArticleRow(row) : null
}

export async function getFaq(id: string): Promise<KbAdminFaq | null> {
  const { data, error } = await supabase.rpc('admin_get_faq', { p_id: id })
  if (error) throw friendlyRpcError(error)
  const row = firstRow(data)
  return row ? parseFaqRow(row) : null
}

/** Simpan artikel (baru bila id kosong, update bila ada). Mengembalikan id artikel. */
export async function saveKbArticle(input: KbArticleSaveInput): Promise<string> {
  validateSaveInput(input.title, input.content, input.category, input.audience_roles)
  const { data, error } = await supabase.rpc('admin_save_kb_article', {
    p_id: input.id ?? null,
    p_title: input.title.trim(),
    p_category: input.category,
    p_content: input.content.trim(),
    p_audience_roles: input.audience_roles,
    p_status: input.status,
  })
  if (error) throw friendlyRpcError(error)
  if (typeof data === 'string' && data !== '') return data
  const row = firstRow(data)
  if (row && typeof row.id === 'string' && row.id !== '') return row.id
  throw new KbAdminError('generic', 'Artikel tidak bisa disimpan — server tidak mengembalikan id.')
}

/** Simpan FAQ (baru bila id kosong, update bila ada). Mengembalikan id FAQ. */
export async function saveFaq(input: KbFaqSaveInput): Promise<string> {
  validateSaveInput(input.question, input.answer, input.category, input.audience_roles)
  const { data, error } = await supabase.rpc('admin_save_faq', {
    p_id: input.id ?? null,
    p_question: input.question.trim(),
    p_category: input.category,
    p_answer: input.answer.trim(),
    p_audience_roles: input.audience_roles,
    p_status: input.status,
  })
  if (error) throw friendlyRpcError(error)
  if (typeof data === 'string' && data !== '') return data
  const row = firstRow(data)
  if (row && typeof row.id === 'string' && row.id !== '') return row.id
  throw new KbAdminError('generic', 'FAQ tidak bisa disimpan — server tidak mengembalikan id.')
}

export async function setKbStatus(
  kind: KbKind,
  id: string,
  status: KbStatus,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('admin_set_kb_status', {
    p_kind: kind,
    p_id: id,
    p_status: status,
  })
  if (error) throw friendlyRpcError(error)
  return data === true
}

export async function listKbHistory(
  kind: KbKind,
  id: string,
  limit = 10,
): Promise<KbHistoryEntry[]> {
  const { data, error } = await supabase.rpc('admin_list_kb_history', {
    p_kind: kind,
    p_id: id,
    p_limit: limit,
  })
  if (error) throw friendlyRpcError(error)
  return asRowArray(data).map(parseHistoryRow)
}
