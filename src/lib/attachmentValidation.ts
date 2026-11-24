// SINEVERSE — validasi lampiran tiket (pure helpers, tanpa dependensi).
//
// Dipindah verbatim dari lib/sinebot.ts: dua fungsi ini dipakai modul yang
// termuat di bundle awal (mentorGroup, studentCommunity, announcements,
// projectChat, emailManagement, lessonResources) — padahal lib/sinebot
// sendiri hanya dibutuhkan panel chat SINEBOT. Dengan pindah ke sini,
// lib/sinebot bisa dimuat malas bersama SinebotChat dan bundle awal
// mengecil. Isi fungsi TIDAK diubah — hanya lokasinya.

// Tanda tangan byte (magic bytes) tiap format yang diizinkan. Validasi
// ekstensi/MIME saja bisa dibohongi (mis. file teks diganti nama jadi .pdf
// — temuan LMP-04, Tahap 6). Fungsi ini membaca 12 byte pertama file dan
// memastikan isinya benar-benar sesuai format yang diklaim. Dipakai di
// onChange (HelpCenterPage, AdminTicketsPage) DAN di jalur upload sebagai
// lapis kedua, sebelum file menyentuh Storage.
const ATTACHMENT_MAGIC_BYTES: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // 'RIFF' — ditambah 'WEBP' di offset 8
  'application/pdf': [0x25, 0x50, 0x44, 0x46], // '%PDF'
}

export async function checkTicketAttachmentContent(file: File): Promise<string | null> {
  const type = (file.type || '').toLowerCase()
  const signature = ATTACHMENT_MAGIC_BYTES[type]
  if (!signature) return null // tipe tak dikenal sudah ditolak validateTicketAttachment
  try {
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    const matches = signature.every((b, i) => bytes[i] === b)
    if (type === 'image/webp') {
      const webpMarker = bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
      if (!matches || !webpMarker) return 'Isi file bukan gambar WebP yang valid. Pilih file lain.'
    } else if (!matches) {
      return 'Isi file tidak sesuai dengan formatnya. Pastikan file benar-benar JPG, PNG, WebP, atau PDF.'
    }
    return null
  } catch {
    return 'File lampiran tidak bisa dibaca. Pilih file lain.'
  }
}

/**
 * Saring nama file untuk path Storage: hilangkan karakter aneh, batasi
 * panjang nama dasar (maks 60 karakter), pertahankan ekstensi.
 */
export function sanitizeTicketFileName(name: string): string {
  const base = (name || 'lampiran').split(/[\\/]/).pop() || 'lampiran'
  const dot = base.lastIndexOf('.')
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : ''
  const stem = (dot > 0 ? base.slice(0, dot) : base)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 60) || 'lampiran'
  return ext ? `${stem}.${ext}` : stem
}
