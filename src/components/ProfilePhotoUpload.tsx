// SINEVERSE — Upload foto profil (bucket profile-photos, replace-only).
// Foto hanya bisa DIGANTI, tidak pernah dihapus — tidak ada tombol hapus
// di mana pun. Bila bucket belum ada, tampilkan pesan jujur, bukan gagal
// diam-diam.
import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { useAuth } from '../context/AuthContext'
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
    if (file.size > 5 * 1024 * 1024) {
      setNotice('Ukuran foto maksimal 5 MB.')
      return
    }
    setBusy(true)
    setNotice(null)
    const ext = file.name.split('.').pop() ?? 'jpg'
    const url = await uploadToBucket('profile-photos', `${user.id}/photo.${ext}`, file)
    if (!url) {
      setNotice('Bucket profile-photos belum tersedia — foto tidak bisa diunggah. Minta admin membuat bucket-nya di Dashboard Supabase (lihat supabase/README.md). Foto lama tetap dipakai.')
      setBusy(false)
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
    } finally {
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
        Foto profil hanya bisa diganti dengan foto baru — tidak bisa dihapus.
      </p>
      {notice && <p className="notice-box">{notice}</p>}
    </div>
  )
}
