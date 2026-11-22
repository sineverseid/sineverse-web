// SINEVERSE — Perkecil foto profil di browser (canvas) sebelum diunggah
// atau dititipkan.
//
// Aturan foto profil (Arif): TIDAK ADA batas ukuran (MB) — foto besar
// diperkecil otomatis di browser (sisi terpanjang 1024px, JPEG 0.85)
// supaya tetap muat di localStorage saat pendaftaran dan hemat bandwidth
// saat unggah. Dipakai RegisterPage (titip foto) dan ProfilePhotoUpload
// (ganti foto). Foto kecil dikembalikan apa adanya.

/** Sisi terpanjang maksimum foto profil setelah diperkecil. */
export const PHOTO_MAX_SIDE = 1024

function extFromFile(file: File): string {
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'image/jpeg') return 'jpg'
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  return ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? (ext === 'jpeg' ? 'jpg' : ext) : 'jpg'
}

export function photoExtFromFile(file: File): string {
  return extFromFile(file)
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Tidak dapat membaca file foto.'))
    reader.readAsDataURL(file)
  })
}

/**
 * Perkecil foto di browser bila sisinya melebihi PHOTO_MAX_SIDE, lalu
 * kembalikan data URL JPEG. Foto kecil dikembalikan apa adanya.
 */
export async function photoToDataUrl(file: File): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file)
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Tidak dapat membaca file foto.'))
    el.src = dataUrl
  })
  const longest = Math.max(img.naturalWidth, img.naturalHeight)
  if (longest <= PHOTO_MAX_SIDE) return dataUrl
  const scale = PHOTO_MAX_SIDE / longest
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}

/** Ubah data URL kembali menjadi Blob (untuk diunggah sebagai File). */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}
