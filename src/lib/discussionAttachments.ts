// SINEVERSE — Lampiran gambar/file di postingan diskusi (migrasi 086,
// pilot Mentari).
//
// Referensi (Arif, 28 Nov 2026, screenshot Mentari): postingan pembuka
// memuat gambar infografik besar inline di dalam kartu; balasan punya ikon
// download untuk lampirannya.
//
// Pola yang ditiru (ATM): lessonResources.ts — upload DULU baru insert
// baris, sanitize nama file, upsert false, contentType, bucket PUBLIK
// (file diskusi memang ditujukan untuk dilihat peserta lesson; path memakai
// UUID acak sehingga tidak bisa ditebak). Konvensi path:
// discussion/<lesson_id>/<user_id>/<uuid>-<nama-file> (wajib — kebijakan
// storage migrasi 086 memeriksa folder ke-3 = auth.uid()).
// Bedanya dengan lessonResources: pengunggah di sini peserta lesson (siswa
// terdaftar / mentor course / admin), bukan hanya pengajar; batas ukuran
// 20 MB (sama dengan batas tugas Mentari). Cek magic byte gambar/PDF memakai
// ulang checkTicketAttachmentContent dari lib/sinebot (temuan LMP-04 Tahap 6).
import { checkTicketAttachmentContent, sanitizeTicketFileName } from './attachmentValidation'
import { supabase } from './supabase'
import type { DiscussionAttachment } from './types'

/** Bucket publik lampiran diskusi (migrasi 086). */
export const DISCUSSION_ATTACHMENTS_BUCKET = 'discussion-attachments'

/** Batas ukuran lampiran diskusi: 20 MB (sama dengan batas tugas Mentari). */
export const DISCUSSION_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024

/** Satu lampiran per postingan di pilot. */
export const DISCUSSION_ATTACHMENT_MAX_COUNT = 1

export class DiscussionAttachmentError extends Error {
  code: 'not_ready' | 'network' | 'unauthorized' | 'generic'

  constructor(code: DiscussionAttachmentError['code'], message: string) {
    super(message)
    this.name = 'DiscussionAttachmentError'
    this.code = code
  }
}

/** Apakah file ini gambar (tampil inline) atau file umum (tautan unduh). */
export function isImageAttachment(mimeType: string | null | undefined): boolean {
  return (mimeType ?? '').toLowerCase().startsWith('image/')
}

/** Label ukuran file yang ramah dibaca, mis. "1,2 MB". */
export function formatAttachmentSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

/**
 * Validasi lampiran sebelum diunggah. Null = boleh diunggah.
 * Gambar/PDF dicek magic byte-nya.
 */
export async function validateDiscussionFile(file: File): Promise<string | null> {
  if (!file || file.size <= 0) return 'File tidak bisa dibaca. Pilih file lain.'
  if (file.size > DISCUSSION_ATTACHMENT_MAX_BYTES) {
    return 'Ukuran lampiran maksimal 20 MB.'
  }
  const type = (file.type || '').toLowerCase()
  if (type.startsWith('image/') || type === 'application/pdf') {
    return checkTicketAttachmentContent(file)
  }
  return null
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Unggah lampiran untuk satu postingan diskusi yang SUDAH dibuat, lalu
 * catat barisnya di discussion_attachments. Kembalikan baris lampiran
 * (dengan URL publik). Error dilempar sebagai DiscussionAttachmentError
 * berbahasa Indonesia.
 */
export async function uploadDiscussionAttachment(
  file: File,
  lessonId: string,
  userId: string,
  discussionId: string,
): Promise<DiscussionAttachment> {
  const problem = await validateDiscussionFile(file)
  if (problem) throw new DiscussionAttachmentError('generic', problem)
  const path = `discussion/${lessonId}/${userId}/${randomId()}-${sanitizeTicketFileName(file.name)}`
  const { error: upErr } = await supabase.storage
    .from(DISCUSSION_ATTACHMENTS_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type })
  if (upErr) {
    const detail = (upErr as { message?: string }).message?.trim()
    throw new DiscussionAttachmentError(
      'generic',
      detail
        ? `Lampiran gagal diunggah (${detail}).`
        : 'Lampiran gagal diunggah. Periksa koneksi internet lalu coba lagi.',
    )
  }
  const { data: urlData } = supabase.storage
    .from(DISCUSSION_ATTACHMENTS_BUCKET)
    .getPublicUrl(path)
  const { data, error: insErr } = await supabase
    .from('discussion_attachments')
    .insert({
      discussion_id: discussionId,
      file_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
    })
    .select()
    .single()
  if (insErr) {
    // Baris gagal dicatat: hapus file yatim best-effort, lalu lempar.
    void supabase.storage.from(DISCUSSION_ATTACHMENTS_BUCKET).remove([path]).catch(() => undefined)
    throw new DiscussionAttachmentError('generic', 'Lampiran gagal dicatat. Coba lagi.')
  }
  return { ...(data as DiscussionAttachment), url: urlData.publicUrl }
}

/** Hapus lampiran (baris + file di bucket, best-effort). */
export async function deleteDiscussionAttachment(
  attachment: DiscussionAttachment,
): Promise<void> {
  try {
    await supabase.from('discussion_attachments').delete().eq('id', attachment.id)
  } catch {
    // Baris tidak terhapus bukan alasan menggagalkan UI — abaikan.
  }
  try {
    await supabase.storage.from(DISCUSSION_ATTACHMENTS_BUCKET).remove([attachment.file_path])
  } catch {
    // File yatim di bucket bukan kegagalan hapus — abaikan.
  }
}
