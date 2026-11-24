// SINEVERSE — Email Management (Fase 5, frontend).
//
// Jalur tulis ke tabel email_* (migrasi 069): admin saja (RLS). Fungsi di
// sini TIDAK PERNAH mengirim email langsung — pengiriman selalu lewat Edge
// Function send-welcome-email (mode 'self' / 'admin' / 'queue' / 'test' /
// 'process-queued'), yang memegang kredensial SMTP di server.
//
// Pola pemanggilan Edge Function mengikuti sinebot.ts: header `apikey` =
// publishable key + header Authorization = token sesi pemanggil (bukan
// publishable key sebagai Bearer — itu dianggap token sesi dan ditolak).
// Semua pemanggilan di sini best-effort-safe: pemanggil (RegisterPage /
// AdminPage) menelan error supaya kegagalan email TIDAK PERNAH menggagalkan
// registrasi / keputusan lamaran.
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from './supabase'
import { checkTicketAttachmentContent, sanitizeTicketFileName } from './attachmentValidation'

export const EMAIL_ATTACHMENTS_BUCKET = 'email-attachments'
export const EMAIL_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
export const ADMIN_TEST_EMAIL_DEFAULT = 'arifhidayat1732@gmail.com'

export type EmailTemplateKey = 'welcome_student' | 'welcome_mentor' | 'mentor_rejected'

export const EMAIL_TEMPLATE_KEYS: EmailTemplateKey[] = [
  'welcome_student',
  'welcome_mentor',
  'mentor_rejected',
]

export function emailTemplateLabel(key: string): string {
  if (key === 'welcome_student') return 'Welcome Siswa'
  if (key === 'welcome_mentor') return 'Welcome Mentor'
  if (key === 'mentor_rejected') return 'Penolakan Mentor'
  if (key.startsWith('test_')) return `Test ${emailTemplateLabel(key.slice(5))}`
  return key
}

export function emailStatusLabel(status: string): string {
  if (status === 'queued') return 'Antre'
  if (status === 'sent') return 'Terkirim'
  if (status === 'delivered') return 'Diterima'
  if (status === 'bounced') return 'Mental'
  if (status === 'failed') return 'Gagal'
  if (status === 'retrying') return 'Mencoba lagi'
  return status
}

export class EmailManagementError extends Error {}

export interface EmailTemplate {
  id: string
  key: EmailTemplateKey
  subject: string
  body_html: string
  is_active: boolean
  updated_at: string
}

export interface EmailAttachment {
  id: string
  template_key: EmailTemplateKey
  course_id: string | null
  file_path: string
  file_name: string
  file_size: number | null
  created_at: string
}

export interface EmailLog {
  id: string
  user_id: string | null
  event: string
  template_key: string
  recipient_email: string
  status: string
  provider_message_id: string | null
  error: string | null
  attempts: number
  created_at: string
}

async function accessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) return null
  return data.session.access_token
}

interface FunctionResult {
  ok?: boolean
  error?: string
  log_id?: string
  status?: string
  deduped?: boolean
  provider_message_id?: string
  template_active?: boolean
  processed?: number
}

async function callWelcomeFunction(
  payload: Record<string, unknown>,
): Promise<FunctionResult> {
  const token = await accessToken()
  let res: Response
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/send-welcome-email`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new EmailManagementError('Tidak dapat terhubung ke layanan email. Periksa koneksi internet lalu coba lagi.')
  }
  let parsed: FunctionResult = {}
  try {
    parsed = (await res.json()) as FunctionResult
  } catch {
    parsed = {}
  }
  if (!res.ok) {
    const code = parsed.error ?? `http_${res.status}`
    if (code === 'smtp_not_configured') {
      throw new EmailManagementError('SMTP belum dikonfigurasi di Edge Function. Minta admin mengatur secret SMTP di Dashboard.')
    }
    if (code === 'lampiran_belum_tersedia' || (typeof code === 'string' && code.startsWith('lampiran_belum_tersedia'))) {
      throw new EmailManagementError('Lampiran mentor belum tersedia. Unggah dulu RPS dan Kode Etik Mentor di Email Management.')
    }
    if (code === 'template_nonaktif') {
      throw new EmailManagementError('Template email ini sedang nonaktif. Aktifkan dulu sebelum mengirim.')
    }
    if (code === 'unauthorized') {
      throw new EmailManagementError('Sesi kamu sudah berakhir. Masuk ulang lalu coba lagi.')
    }
    if (code === 'forbidden') {
      throw new EmailManagementError('Kamu tidak punya izin untuk tindakan ini.')
    }
    throw new EmailManagementError(`Layanan email mengembalikan kesalahan (${code}).`)
  }
  return parsed
}

/** Jalur fallback siswa: setelah verifikasi kode di RegisterPage. */
export async function triggerWelcomeEmailForCurrentUser(): Promise<FunctionResult> {
  return callWelcomeFunction({ mode: 'self', event: 'welcome_student' })
}

/** Jalur fallback admin: setelah keputusan lamaran mentor di AdminPage. */
export async function invokeWelcomeEmailForUser(
  event: 'welcome_student' | 'welcome_mentor' | 'mentor_rejected',
  userId: string,
  courseId?: string | null,
): Promise<FunctionResult> {
  return callWelcomeFunction({ mode: 'admin', event, user_id: userId, course_id: courseId ?? null })
}

/** Test email (admin): kirim template ke alamat uji. */
export async function sendTestEmail(
  templateKey: EmailTemplateKey,
  to: string,
  courseId?: string | null,
): Promise<FunctionResult> {
  return callWelcomeFunction({ mode: 'test', template_key: templateKey, to, course_id: courseId ?? null })
}

/** Resend satu baris log yang gagal/mengantre (admin). */
export async function resendEmail(logId: string): Promise<FunctionResult> {
  return callWelcomeFunction({ mode: 'queue', log_id: logId })
}

/** Proses semua antrean tertunda (admin). */
export async function processQueuedEmails(): Promise<FunctionResult> {
  return callWelcomeFunction({ mode: 'process-queued' })
}

export async function fetchTemplates(): Promise<EmailTemplate[]> {
  const { data, error } = await supabase
    .from('email_templates')
    .select('id,key,subject,body_html,is_active,updated_at')
    .order('key')
  if (error) throw new EmailManagementError(error.message)
  return (data ?? []) as EmailTemplate[]
}

export async function updateTemplate(
  key: EmailTemplateKey,
  patch: { subject?: string; body_html?: string; is_active?: boolean },
): Promise<void> {
  const { error } = await supabase
    .from('email_templates')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('key', key)
  if (error) throw new EmailManagementError(error.message)
}

export async function fetchLogs(limit = 50): Promise<EmailLog[]> {
  const { data, error } = await supabase
    .from('email_logs')
    .select('id,user_id,event,template_key,recipient_email,status,provider_message_id,error,attempts,created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new EmailManagementError(error.message)
  return (data ?? []) as EmailLog[]
}

export async function fetchAttachments(
  templateKey: EmailTemplateKey,
): Promise<EmailAttachment[]> {
  const { data, error } = await supabase
    .from('email_attachments')
    .select('id,template_key,course_id,file_path,file_name,file_size,created_at')
    .eq('template_key', templateKey)
    .order('created_at')
  if (error) throw new EmailManagementError(error.message)
  return (data ?? []) as EmailAttachment[]
}

/** Validasi lampiran mentor sebelum upload. Null = boleh diunggah. */
export function validateEmailAttachment(file: File): string | null {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
    return 'Lampiran mentor harus file PDF.'
  }
  if (file.size > EMAIL_ATTACHMENT_MAX_BYTES) {
    return 'Ukuran lampiran maksimal 10 MB.'
  }
  return null
}

/**
 * Unggah lampiran mentor (PDF) ke bucket email-attachments + catat barisnya.
 * "Ganti": bila sudah ada lampiran dengan nama file yang sama pada scope
 * yang sama (default / course yang sama), yang lama dihapus dulu (file +
 * baris) supaya hanya satu dokumen resmi per nama.
 */
export async function uploadAttachment(
  templateKey: EmailTemplateKey,
  file: File,
  courseId: string | null,
  userId: string,
): Promise<EmailAttachment> {
  const problem = validateEmailAttachment(file)
  if (problem) throw new EmailManagementError(problem)
  const contentProblem = await checkTicketAttachmentContent(file)
  if (contentProblem) throw new EmailManagementError(contentProblem)
  const scope = courseId ? `course/${courseId}` : 'mentor'
  const path = `${scope}/${crypto.randomUUID()}-${sanitizeTicketFileName(file.name)}`
  const { error: upErr } = await supabase.storage
    .from(EMAIL_ATTACHMENTS_BUCKET)
    .upload(path, file, { contentType: 'application/pdf', upsert: false })
  if (upErr) throw new EmailManagementError(upErr.message)

  // Ganti lampiran lama dengan nama file yang sama di scope yang sama.
  let oldQuery = supabase
    .from('email_attachments')
    .select('id,file_path')
    .eq('template_key', templateKey)
    .eq('file_name', file.name)
  if (courseId) oldQuery = oldQuery.eq('course_id', courseId)
  else oldQuery = oldQuery.is('course_id', null)
  const { data: oldRows } = await oldQuery
  for (const old of (oldRows ?? []) as { id: string; file_path: string }[]) {
    await supabase.storage.from(EMAIL_ATTACHMENTS_BUCKET).remove([old.file_path])
    await supabase.from('email_attachments').delete().eq('id', old.id)
  }

  const { data, error } = await supabase
    .from('email_attachments')
    .insert({
      template_key: templateKey,
      course_id: courseId,
      file_path: path,
      file_name: file.name,
      file_size: file.size,
      uploaded_by: userId,
    })
    .select('id,template_key,course_id,file_path,file_name,file_size,created_at')
    .single()
  if (error) {
    await supabase.storage.from(EMAIL_ATTACHMENTS_BUCKET).remove([path])
    throw new EmailManagementError(error.message)
  }
  return data as EmailAttachment
}

export async function deleteAttachment(id: string): Promise<void> {
  const { data } = await supabase
    .from('email_attachments')
    .select('file_path')
    .eq('id', id)
    .maybeSingle()
  const filePath = (data as { file_path?: string } | null)?.file_path
  const { error } = await supabase.from('email_attachments').delete().eq('id', id)
  if (error) throw new EmailManagementError(error.message)
  if (filePath) {
    await supabase.storage.from(EMAIL_ATTACHMENTS_BUCKET).remove([filePath])
  }
}
