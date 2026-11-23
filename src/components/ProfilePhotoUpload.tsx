// SINEVERSE — Upload foto profil (bucket profile-photos, replace-only).
// Foto hanya bisa DIGANTI, tidak pernah dihapus — tidak ada tombol hapus
// di mana pun. TIDAK ADA batas ukuran foto (Arif, 21 Nov 2026): foto besar
// diperkecil otomatis di browser (sisi terpanjang 1024px, JPEG 0.85)
// sebelum diunggah. Bila bucket belum ada, tampilkan pesan jujur, bukan
// gagal diam-diam.
import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { dataUrlToBlob, photoToDataUrl } from '../lib/photo'
import { updatePhotoUrl, uploadToBucket } from '../lib/supabase'

export default function ProfilePhotoUpload() {
  const { user, profile, refreshProfile } = useAuth()
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    if (!file.type.startsWith('image/')) {
      setNotice('Pilih file gambar (JPG/PNG/WebP).')
      return
    }
    // Tidak ada batas ukuran: foto besar diperkecil otomatis di browser.
    setBusy(true)
    setNotice(null)
    try {
      const dataUrl = await photoToDataUrl(file)
      // photoToDataUrl mengubah foto besar menjadi JPEG; samakan ekstensi
      // nama file dengan isi sebenarnya.
      const ext = dataUrl.startsWith('data:image/jpeg')
        ? 'jpg'
        : dataUrl.startsWith('data:image/png')
          ? 'png'
          : dataUrl.startsWith('data:image/webp')
            ? 'webp'
            : (file.name.split('.').pop() ?? 'jpg')
      const blob = await dataUrlToBlob(dataUrl)
      const uploadFile = new File([blob], `photo.${ext}`, { type: blob.type })
      const url = await uploadToBucket('profile-photos', `${user.id}/photo.${ext}`, uploadFile)
      if (!url) {
        setNotice('Bucket profile-photos belum tersedia — foto tidak bisa diunggah. Minta admin membuat bucket-nya di Dashboard Supabase (lihat supabase/README.md). Foto lama tetap dipakai.')
        return
      }
      try {
        await updatePhotoUrl(user.id, url)
        await refreshProfile()
        setNotice(
          profile?.photo_url
            ? 'Foto profil diganti dengan foto baru.'
            : 'Foto profil diunggah.',
        )
      } catch (err) {
        setNotice(err instanceof Error ? err.message : 'Gagal menyimpan foto profil.')
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Tidak dapat membaca file foto.')
    } finally {
      // B74: seluruh proses unggah (baca + konversi + upload) dibungkus
      // satu try/finally — tombol tidak pernah macet di "Mengunggah…".
      setBusy(false)
    }
  }

  return (
    <div>
      <label className="btn btn-secondary btn-small" style={{ cursor: 'pointer' }}>
        {busy ? 'Mengunggah…' : profile?.photo_url ? 'Ganti Foto Profil' : 'Unggah Foto Profil'}
        <input type="file" accept="image/*" onChange={handleFile} disabled={busy} style={{ display: 'none' }} />
      </label>
      <p className="muted" style={{ marginTop: '0.5rem' }}>
        Foto profil hanya bisa diganti dengan foto baru — tidak bisa dihapus. Tanpa batas
        ukuran (foto besar diperkecil otomatis).
      </p>
      {notice && <p className="notice-box">{notice}</p>}
    </div>
  )
}
