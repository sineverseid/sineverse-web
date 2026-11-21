// SINEVERSE — Edit profil: nama, telepon, kota, bio.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ProfilePhotoUpload from '../components/ProfilePhotoUpload'
import { updateProfile } from '../lib/supabase'

export default function EditProfilePage() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [bio, setBio] = useState('')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? '')
      setPhone(profile.phone ?? '')
      setCity(profile.city ?? '')
      setBio(profile.bio ?? '')
      setReady(true)
    }
  }, [profile])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setError(null)
    if (!name.trim()) {
      setError('Nama tidak boleh kosong.')
      return
    }
    setBusy(true)
    try {
      await updateProfile(user.id, {
        name: name.trim(),
        phone: phone.trim() || null,
        city: city.trim() || null,
        bio: bio.trim() || null,
      })
      await refreshProfile()
      navigate('/profil')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan profil.')
    } finally {
      setBusy(false)
    }
  }

  if (!ready) {
    return (
      <div className="page page-narrow">
        <p className="muted">Memuat profil…</p>
      </div>
    )
  }

  return (
    <div className="page page-narrow">
      <h1>Edit Profil</h1>
      <ProfilePhotoUpload />
      <form className="form" onSubmit={handleSubmit}>
        <label>
          Nama Lengkap
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
          />
        </label>
        <label>
          Telepon / WA
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            placeholder="08xxxxxxxxxx"
          />
        </label>
        <label>
          Kota
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            autoComplete="address-level2"
            placeholder="Kota tempat tinggal"
          />
        </label>
        <label>
          Bio
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            placeholder="Ceritakan sedikit tentang kamu dan minat filmmaking kamu."
          />
        </label>
        {error && <p className="error-box">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan Profil'}
          </button>
          <Link to="/profil" className="btn btn-ghost">
            Batal
          </Link>
        </div>
      </form>
    </div>
  )
}
