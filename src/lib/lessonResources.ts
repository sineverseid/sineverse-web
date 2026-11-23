// SINEVERSE — Upload + pratinjau inline materi lesson (migrasi 062).
//
// Form "Tambah Materi Lesson" di CourseBuilderPage dan seksi "Media lesson"
// di form edit lesson memakai modul ini. Bucket PUBLIK 'lesson-resources'
// (seperti film-posters): file materi memang ditujukan untuk dilihat siswa;
// path memakai UUID acak sehingga tidak bisa ditebak. Konvensi path:
// lesson/<lesson_id>/<user_id>/<uuid>-<nama-file> (wajib — kebijakan
// storage migrasi 062 memeriksa folder ke-3 = auth.uid()).
//
// Pola yang ditiru (ATM): upload mentorGroup.ts — upload DULU baru insert
// baris, sanitize nama file, upsert false, contentType. Bedanya: bucket
// ini publik, jadi URL diambil dari getPublicUrl (bukan signed URL).
// Cek magic byte gambar/PDF memakai ulang checkTicketAttachmentContent
// dari lib/sinebot (temuan LMP-04 Tahap 6).
import { checkTicketAttachmentContent, sanitizeTicketFileName } from './sinebot'
import { supabase } from './supabase'
import type { LessonResource } from './types'

/** Bucket publik materi lesson (migrasi 062). */
export const LESSON_RESOURCES_BUCKET = 'lesson-resources'

/** Batas ukuran upload materi lesson. */
export const LESSON_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const LESSON_PDF_MAX_BYTES = 20 * 1024 * 1024
export const LESSON_VIDEO_MAX_BYTES = 100 * 1024 * 1024
export const LESSON_FILE_MAX_BYTES = 20 * 1024 * 1024

export type LessonUploadKind = 'image' | 'video' | 'pdf' | 'file'

export class LessonResourceError extends Error {
  code: 'not_ready' | 'network' | 'unauthorized' | 'generic'

  constructor(code: LessonResourceError['code'], message: string) {
    super(message)
    this.name = 'LessonResourceError'
    this.code = code
  }
}

/** Jenis materi dari MIME file: gambar, video, PDF, sisanya file umum. */
export function kindForFile(file: File): LessonUploadKind {
  const type = (file.type || '').toLowerCase()
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type === 'application/pdf') return 'pdf'
  return 'file'
}

/** Nilai accept untuk input file menurut jenis materi. */
export function acceptForKind(kind: LessonResource['kind']): string {
  if (kind === 'image') return 'image/*'
  if (kind === 'video') return 'video/*'
  if (kind === 'pdf') return 'application/pdf'
  return ''
}

/** Batas ukuran (byte) menurut jenis materi. */
export function maxBytesForKind(kind: LessonUploadKind): number {
  if (kind === 'image') return LESSON_IMAGE_MAX_BYTES
  if (kind === 'pdf') return LESSON_PDF_MAX_BYTES
  if (kind === 'video') return LESSON_VIDEO_MAX_BYTES
  return LESSON_FILE_MAX_BYTES
}

/** Apakah MIME file cocok dengan jenis materi (cek sinkron, tanpa baca isi). */
export function fileMatchesKind(file: File, kind: LessonResource['kind']): boolean {
  const type = (file.type || '').toLowerCase()
  if (kind === 'image') return type.startsWith('image/')
  if (kind === 'video') return type.startsWith('video/')
  if (kind === 'pdf') return type === 'application/pdf'
  if (kind === 'file') return true
  return false
}

function kindLabel(kind: LessonResource['kind']): string {
  if (kind === 'image') return 'gambar'
  if (kind === 'video') return 'video'
  if (kind === 'pdf') return 'PDF'
  return 'file'
}

/**
 * Validasi file sebelum diunggah. Null = boleh diunggah. Bila kind
 * diberikan, MIME harus cocok dengan jenis itu (file gambar tidak cocok
 * dengan jenis PDF). Isi file gambar/PDF dicek magic byte-nya.
 */
export async function validateLessonFile(
  file: File,
  kind?: LessonResource['kind'],
): Promise<string | null> {
  if (!file || file.size <= 0) return 'File tidak bisa dibaca. Pilih file lain.'
  // Batas ukuran mengikuti jenis yang dipilih (bila ada), kalau tidak
  // mengikuti jenis file yang terdeteksi.
  const effective: LessonUploadKind =
    kind === 'image' || kind === 'video' || kind === 'pdf' || kind === 'file'
      ? kind
      : kindForFile(file)
  if (kind && !fileMatchesKind(file, kind)) {
    return `File yang dipilih bukan ${kindLabel(kind)}. Pilih file yang sesuai, atau ubah Jenis.`
  }
  const max = maxBytesForKind(effective)
  if (file.size > max) {
    return `Ukuran file maksimal ${formatFileSize(max)} untuk ${kindLabel(effective)}.`
  }
  // Gambar/PDF: pastikan isinya benar-benar sesuai format yang diklaim.
  if (effective === 'image' || effective === 'pdf') {
    return checkTicketAttachmentContent(file)
  }
  return null
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Unggah file materi ke bucket publik. Kembalikan URL publik + path
 * storage (path disimpan ke lesson_resources.file_path). Error dilempar
 * sebagai LessonResourceError berbahasa Indonesia.
 */
export async function uploadLessonFile(
  file: File,
  lessonId: string,
  userId: string,
): Promise<{ url: string; path: string }> {
  const detected = kindForFile(file)
  const problem = await validateLessonFile(file, detected)
  if (problem) throw new LessonResourceError('generic', problem)
  const path = `lesson/${lessonId}/${userId}/${randomId()}-${sanitizeTicketFileName(file.name)}`
  const { error } = await supabase.storage.from(LESSON_RESOURCES_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type,
  })
  if (error) {
    throw new LessonResourceError(
      'generic',
      'File gagal diunggah. Periksa koneksi internet lalu coba lagi.',
    )
  }
  const { data } = supabase.storage.from(LESSON_RESOURCES_BUCKET).getPublicUrl(path)
  return { url: data.publicUrl, path }
}

/** Hapus file dari bucket (best-effort — abaikan bila sudah tidak ada). */
export async function deleteLessonFile(path: string): Promise<void> {
  if (!path) return
  try {
    await supabase.storage.from(LESSON_RESOURCES_BUCKET).remove([path])
  } catch {
    // File yatim di bucket bukan kegagalan hapus materi — abaikan.
  }
}

/** Judul materi dari nama file: tanpa ekstensi, tanpa garis bawah. */
export function titleFromFileName(name: string): string {
  const base = (name || 'materi').split(/[\\/]/).pop() || 'materi'
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  const title = stem.replace(/[_-]+/g, ' ').trim()
  return title === '' ? 'Materi' : title
}

/** Ukuran file untuk pratinjau (B/KB/MB, desimal koma ala id-ID). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}
