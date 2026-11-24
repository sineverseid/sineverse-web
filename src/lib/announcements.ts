// SINEVERSE — Announcements & Notification Center, Fase 4 (migrasi 067).
//
// Pengumuman admin dengan target (semua siswa / semua mentor / peserta
// course / mentor course), lampiran di bucket privat announcement-files,
// pin, dan jadwal terbit (draf / terjadwal / terbit).
//
// Pola yang ditiru (ATM):
// - mentorGroup.ts: struktur lib + error berkode + upload bucket privat
//   (path <id>/<userId>/<uuid>-<nama-disaring>, upsert false, contentType;
//   buka lewat signed URL 3600 detik). TIDAK pakai uploadToBucket() (itu
//   public URL, salah untuk bucket privat).
// - studentCommunity.ts: validasi lampiran (tipe + 10 MB) + magic-byte check
//   lewat checkTicketAttachmentContent + sanitizeTicketFileName.
// - reminders.ts: sendNotification lewat RPC create_notification (di sini
//   notifikasi terbit dikirim trigger DB, bukan lib — lib hanya memanggil
//   publish_due_announcements() best-effort saat daftar dimuat, karena
//   tidak ada scheduler di aplikasi).
//
// RLS sudah mengatur siapa boleh baca (published + sesuai target) — fungsi
// di sini TIDAK memfilter manual yang bertentangan dengan RLS, kecuali
// filter status/publish_at untuk tampilan (belt-and-braces).
import { checkTicketAttachmentContent, sanitizeTicketFileName } from './attachmentValidation'
import { isMissingTableError } from './guarded'
import { logContentBlocked } from './moderation'
import { supabase } from './supabase'
import type { Announcement } from './types'

/** Bucket privat lampiran pengumuman (migrasi 067). */
export const ANNOUNCEMENT_BUCKET = 'announcement-files'

/** Lampiran: gambar / PDF / dokumen umum, maks 10 MB (sama seperti Fase 1/2). */
export const ANNOUNCEMENT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

const ANNOUNCEMENT_ATTACHMENT_TYPES: Record<string, string> = {
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

export type AnnouncementTarget =
  | 'all_students'
  | 'all_mentors'
  | 'course_students'
  | 'course_mentors'

export type AnnouncementStatus = 'draft' | 'scheduled' | 'published'

export const ANNOUNCEMENT_TARGETS: { value: AnnouncementTarget; label: string }[] = [
  { value: 'all_students', label: 'Semua Siswa' },
  { value: 'all_mentors', label: 'Semua Mentor' },
  { value: 'course_students', label: 'Peserta Course' },
  { value: 'course_mentors', label: 'Mentor Course' },
]

export const ANNOUNCEMENT_STATUSES: { value: AnnouncementStatus; label: string }[] = [
  { value: 'draft', label: 'Draf' },
  { value: 'scheduled', label: 'Terjadwal' },
  { value: 'published', label: 'Terbit' },
]

export function announcementTargetLabel(target: string | null | undefined): string {
  if (!target) return 'Semua Pengguna'
  const found = ANNOUNCEMENT_TARGETS.find((t) => t.value === target)
  return found ? found.label : target
}

export function announcementStatusLabel(status: string | null | undefined): string {
  const found = ANNOUNCEMENT_STATUSES.find((s) => s.value === status)
  return found ? found.label : (status ?? 'Draf')
}

/** Scope lama (003) diturunkan dari target supaya filter scope lama tetap jalan. */
export function announcementScopeFor(target: AnnouncementTarget): 'platform' | 'course' {
  return target === 'course_students' || target === 'course_mentors' ? 'course' : 'platform'
}

export function announcementTargetNeedsCourse(target: AnnouncementTarget): boolean {
  return target === 'course_students' || target === 'course_mentors'
}

export class AnnouncementError extends Error {
  code: 'not_ready' | 'network' | 'unauthorized' | 'generic'

  constructor(code: AnnouncementError['code'], message: string) {
    super(message)
    this.name = 'AnnouncementError'
    this.code = code
  }
}

function friendlyError(err: unknown, fallback: string): AnnouncementError {
  if (err instanceof AnnouncementError) return err
  if (err instanceof Error) {
    const msg = err.message || fallback
    // Fase 6 (070): pesan penolakan trigger moderasi (filter konten,
    // pengirim diblokir, izin sembunyikan) — tampilkan apa adanya: sudah
    // Bahasa Indonesia dan menjelaskan alasan.
    if (/tidak diizinkan|tidak bisa menyebut|sedang diblokir|diberi wewenang/i.test(msg)) {
      return new AnnouncementError('generic', msg)
    }
    if (/row-level security/i.test(msg) || /42501/.test(msg)) {
      return new AnnouncementError('unauthorized', 'Aksi ini hanya untuk admin.')
    }
    return new AnnouncementError('generic', `${fallback} (${msg})`)
  }
  return new AnnouncementError('generic', fallback)
}

/** Validasi lampiran sebelum upload. Null = boleh diunggah. */
export function validateAnnouncementAttachment(file: File): string | null {
  if (!file || file.size <= 0) return 'File lampiran tidak bisa dibaca. Pilih file lain.'
  if (file.size > ANNOUNCEMENT_ATTACHMENT_MAX_BYTES) {
    return 'Ukuran lampiran maksimal 10 MB.'
  }
  if (!ANNOUNCEMENT_ATTACHMENT_TYPES[(file.type || '').toLowerCase()]) {
    return 'Lampiran hanya boleh berupa gambar (JPG, PNG, WebP, GIF), PDF, atau dokumen (DOC, XLS, PPT, TXT).'
  }
  return null
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Status akhir dari pilihan admin + jadwal. Terbitkan tanpa jadwal (atau
 * jadwal sudah lewat) = 'published'; terbitkan dengan jadwal masa depan =
 * 'scheduled'; simpan = 'draft'.
 */
export function resolveAnnouncementStatus(
  action: 'draft' | 'publish',
  publishAtIso: string | null,
): AnnouncementStatus {
  if (action === 'draft') return 'draft'
  if (publishAtIso && new Date(publishAtIso).getTime() > Date.now()) return 'scheduled'
  return 'published'
}

export interface CreateAnnouncementInput {
  userId: string
  title: string
  body?: string | null
  target: AnnouncementTarget
  courseId?: string | null
  file?: File | null
  /** ISO string; kosong = terbit langsung. */
  publishAt?: string | null
  isPinned?: boolean
  action: 'draft' | 'publish'
}

async function uploadAttachment(
  announcementId: string,
  userId: string,
  file: File,
): Promise<{ path: string; name: string }> {
  const problem = validateAnnouncementAttachment(file)
  if (problem) throw new AnnouncementError('generic', problem)
  const contentProblem = await checkTicketAttachmentContent(file)
  if (contentProblem) throw new AnnouncementError('generic', contentProblem)
  const path = `announcement/${announcementId}/${userId}/${randomId()}-${sanitizeTicketFileName(file.name)}`
  const { error: upErr } = await supabase.storage.from(ANNOUNCEMENT_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type,
  })
  if (upErr) {
    throw new AnnouncementError(
      'generic',
      'Lampiran gagal diunggah. Pengumuman tersimpan sebagai draf — edit untuk mencoba lagi.',
    )
  }
  return { path, name: file.name }
}

/**
 * Buat pengumuman. Baris dibuat dulu sebagai draf (supaya ada id untuk
 * path lampiran), lampiran diunggah bila ada, lalu status akhir dipasang —
 * perubahan ke 'published' di sinilah yang memicu trigger notifikasi.
 */
export async function createAnnouncement(input: CreateAnnouncementInput): Promise<Announcement> {
  const title = input.title.trim()
  if (title === '') throw new AnnouncementError('generic', 'Judul pengumuman tidak boleh kosong.')
  if (title.length > 200) throw new AnnouncementError('generic', 'Judul terlalu panjang (maksimal 200 karakter).')
  if (announcementTargetNeedsCourse(input.target) && !input.courseId) {
    throw new AnnouncementError('generic', 'Pilih course dulu untuk target ini.')
  }
  const publishAt = input.publishAt ? new Date(input.publishAt).toISOString() : null
  const finalStatus = resolveAnnouncementStatus(input.action, publishAt)
  const { data: inserted, error: insErr } = await supabase
    .from('announcements')
    .insert({
      scope: announcementScopeFor(input.target),
      course_id: announcementTargetNeedsCourse(input.target) ? (input.courseId ?? null) : null,
      title,
      body: (input.body ?? '').trim() || null,
      created_by: input.userId,
      target: input.target,
      is_pinned: input.isPinned ?? false,
      publish_at: publishAt,
      status: 'draft',
    })
    .select('*')
    .single()
  if (insErr || !inserted) {
    // Filter konten menolak di transaksi yang sama — catat ke audit_log
    // (best-effort, tidak mengganggu pengguna).
    if (insErr && insErr.message.toLowerCase().includes('tidak diizinkan')) {
      void logContentBlocked('announcement', { reason: 'filter' })
    }
    throw friendlyError(insErr, 'Gagal membuat pengumuman.')
  }
  const row = inserted as Announcement
  if (input.file) {
    try {
      const att = await uploadAttachment(row.id, input.userId, input.file)
      const { error: attErr } = await supabase
        .from('announcements')
        .update({ attachment_path: att.path, attachment_name: att.name })
        .eq('id', row.id)
      if (attErr) throw attErr
      row.attachment_path = att.path
      row.attachment_name = att.name
    } catch (err) {
      // Baris sudah tersimpan sebagai draf — kegagalan lampiran tidak
      // menghapus pengumuman, admin bisa mengeditnya untuk mencoba lagi.
      throw friendlyError(err, 'Lampiran gagal diunggah.')
    }
  }
  if (finalStatus !== 'draft') {
    const { error: pubErr } = await supabase
      .from('announcements')
      .update({ status: finalStatus })
      .eq('id', row.id)
    if (pubErr) throw friendlyError(pubErr, 'Pengumuman tersimpan sebagai draf, tetapi gagal diterbitkan.')
    row.status = finalStatus
  }
  return row
}

export interface UpdateAnnouncementInput {
  title?: string
  body?: string | null
  target?: AnnouncementTarget
  courseId?: string | null
  file?: File | null
  /** Bila true, lampiran lama dihapus (file + kolom). */
  removeAttachment?: boolean
  publishAt?: string | null
  /** Bila null, jadwal tidak diubah. */
  publishAtTouched?: boolean
  isPinned?: boolean
  action?: 'draft' | 'publish'
}

/**
 * Ubah pengumuman. Lampiran baru menggantikan lampiran lama (file lama
 * dihapus best-effort). Perubahan status ke 'published' memicu trigger
 * notifikasi; perubahan 'published' -> 'draft'/'scheduled' membatalkan
 * terbit tanpa notifikasi baru.
 */
export async function updateAnnouncement(
  id: string,
  userId: string,
  input: UpdateAnnouncementInput,
): Promise<Announcement> {
  const patch: Record<string, unknown> = {}
  if (input.title !== undefined) {
    const title = input.title.trim()
    if (title === '') throw new AnnouncementError('generic', 'Judul pengumuman tidak boleh kosong.')
    patch.title = title
  }
  if (input.body !== undefined) patch.body = (input.body ?? '').trim() || null
  if (input.target !== undefined) {
    if (announcementTargetNeedsCourse(input.target) && !input.courseId) {
      throw new AnnouncementError('generic', 'Pilih course dulu untuk target ini.')
    }
    patch.target = input.target
    patch.scope = announcementScopeFor(input.target)
    patch.course_id = announcementTargetNeedsCourse(input.target) ? (input.courseId ?? null) : null
  }
  if (input.isPinned !== undefined) patch.is_pinned = input.isPinned
  if (input.publishAtTouched) {
    patch.publish_at = input.publishAt ? new Date(input.publishAt).toISOString() : null
  }
  if (input.action !== undefined) {
    // Status dihitung dari jadwal yang dikirim form (bila disentuh) —
    // bila jadwal tidak disentuh, 'publish' berarti terbit sekarang.
    const publishAtIso = input.publishAtTouched ? (input.publishAt ?? null) : null
    patch.status = resolveAnnouncementStatus(
      input.action,
      typeof publishAtIso === 'string' ? publishAtIso : null,
    )
  }
  // Lampiran baru: unggah dulu, baru pasang kolomnya.
  if (input.file) {
    const att = await uploadAttachment(id, userId, input.file)
    patch.attachment_path = att.path
    patch.attachment_name = att.name
  } else if (input.removeAttachment) {
    patch.attachment_path = null
    patch.attachment_name = null
  }
  if (Object.keys(patch).length === 0) {
    const current = await getAnnouncement(id)
    if (!current) throw new AnnouncementError('generic', 'Pengumuman tidak ditemukan.')
    return current
  }
  // Bila lampiran diganti/dihapus, hapus file lama best-effort (jangan gagalkan update).
  if (input.file || input.removeAttachment) {
    try {
      const current = await getAnnouncement(id)
      if (current?.attachment_path) {
        await supabase.storage.from(ANNOUNCEMENT_BUCKET).remove([current.attachment_path])
      }
    } catch {
      // Abaikan — file yatim bisa dibersihkan dari Storage.
    }
  }
  const { data, error } = await supabase
    .from('announcements')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) {
    // Filter konten menolak di transaksi yang sama — catat ke audit_log
    // (best-effort, tidak mengganggu pengguna).
    if (error && error.message.toLowerCase().includes('tidak diizinkan')) {
      void logContentBlocked('announcement', { reason: 'filter' })
    }
    throw friendlyError(error, 'Gagal mengubah pengumuman.')
  }
  return data as Announcement
}

/**
 * Terbitkan pengumuman terjadwal yang waktunya tiba. Best-effort: bila
 * RPC belum ada (migrasi 067 belum diterapkan), kembalikan 0 tanpa error
 * supaya daftar tetap bisa dimuat.
 */
export async function publishDueAnnouncements(): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('publish_due_announcements')
    if (error) return 0
    return typeof data === 'number' ? data : 0
  } catch {
    return 0
  }
}

/**
 * Daftar pengumuman. Admin melihat semua status; non-admin hanya yang
 * terbit dan waktunya sudah tiba (RLS juga menegakkannya — filter di sini
 * belt-and-braces). Tersemat dulu, lalu terbaru.
 */
export async function listAnnouncements(options?: { admin?: boolean }): Promise<Announcement[]> {
  try {
    await publishDueAnnouncements()
  } catch {
    // Abaikan — daftar tetap dimuat.
  }
  let query = supabase
    .from('announcements')
    .select('*')
    .order('is_pinned', { ascending: false })
    .order('publish_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(100)
  if (!options?.admin) {
    query = query.eq('status', 'published')
  }
  const { data, error } = await query
  if (error) {
    if (isMissingTableError(error)) return []
    throw friendlyError(error, 'Gagal memuat pengumuman.')
  }
  const rows = (data ?? []) as Announcement[]
  if (options?.admin) return rows
  const now = Date.now()
  return rows.filter((a) => {
    if ((a.status ?? 'published') !== 'published') return false
    if (a.publish_at && new Date(a.publish_at).getTime() > now) return false
    return true
  })
}

/** Satu pengumuman (untuk deep link notifikasi). RLS berlaku. */
export async function getAnnouncement(id: string): Promise<Announcement | null> {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    if (isMissingTableError(error)) return null
    throw friendlyError(error, 'Gagal memuat pengumuman.')
  }
  return (data as Announcement | null) ?? null
}

/** Tautan signed URL (3600 detik) untuk lampiran di bucket privat. */
export async function signedAnnouncementUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(ANNOUNCEMENT_BUCKET)
    .createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) {
    throw friendlyError(error, 'Lampiran tidak bisa dibuka saat ini.')
  }
  return data.signedUrl
}

/**
 * Hapus pengumuman (HARD delete — konsisten dengan pola admin yang sudah
 * ada: handleDeleteAnnouncement + MentorAnnouncementsPage sama-sama
 * .delete() baris. Tidak seperti pesan chat, pengumuman tidak butuh
 * placeholder "dihapus".). File lampiran dihapus best-effort dulu supaya
 * tidak yatim di bucket.
 */
export async function deleteAnnouncement(id: string): Promise<void> {
  try {
    const current = await getAnnouncement(id)
    if (current?.attachment_path) {
      await supabase.storage.from(ANNOUNCEMENT_BUCKET).remove([current.attachment_path])
    }
  } catch {
    // Abaikan — baris tetap dihapus.
  }
  const { error } = await supabase.from('announcements').delete().eq('id', id)
  if (error) throw friendlyError(error, 'Gagal menghapus pengumuman.')
}
