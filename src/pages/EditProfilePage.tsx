// SINEVERSE, Edit profil: nama, sekolah, kelas, minat, tanggal lahir,
// jenis kelamin, telepon, kota, bio.
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
  const [school, setSchool] = useState('')
  const [kelas, setKelas] = useState('')
  const [interestsText, setInterestsText] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [gender, setGender] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [bio, setBio] = useState('')
  const [ready, setReady] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? '')
      setSchool(profile.school ?? '')
      setKelas(profile.kelas ?? '')
      setInterestsText((profile.interests ?? []).join(', '))
      setBirthDate(profile.birth_date ? profile.birth_date.slice(0, 10) : '')
      setGender(profile.gender ?? '')
      setPhone(profile.phone ?? '')
      setCity(profile.city ?? '')
      setBio(profile.bio ?? '')
      setReady(true)
    }
  }, [profile])

  // Jangan menunggu profil selamanya: bila setelah ~5 detik profil belum
  // berhasil dimuat, tampilkan pesan error, bukan "Memuat profil…" terus.
  useEffect(() => {
    if (ready) return
    const t = window.setTimeout(() => setLoadFailed(true), 5000)
    return () => window.clearTimeout(t)
  }, [ready])

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
      const interests = interestsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      await updateProfile(user.id, {
        name: name.trim(),
        school: school.trim() || null,
        kelas: kelas.trim() || null,
        interests,
        birth_date: birthDate || null,
        gender: gender || null,
        phone: phone.trim() || null,
        city: city.trim() || null,
        bio: bio.trim() || null,
      })
      await refreshProfile()
      navigate('/profil')
    } catch {
      setError('Gagal menyimpan profil. Coba lagi.')
    } finally {
      setBusy(false)
    }
  }

  if (!ready && loadFailed) {
    return (
      <div className="page page-narrow">
        <h1>Edit Profil</h1>
        <p className="error-box">Gagal memuat profil. Coba muat ulang halaman.</p>
        <p>
          <Link to="/profil" className="btn btn-secondary">
            Kembali
          </Link>
        </p>
      </div>
    )
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
          Sekolah
          <input
            type="text"
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            autoComplete="organization"
            placeholder="Nama sekolah"
          />
        </label>
        <label>
          Kelas
          <input
            type="text"
            value={kelas}
            onChange={(e) => setKelas(e.target.value)}
            placeholder="Contoh: 11 RPL 1"
          />
        </label>
        <label>
          Minat
          <input
            type="text"
            value={interestsText}
            onChange={(e) => setInterestsText(e.target.value)}
            placeholder="Pisahkan dengan koma, contoh: sinematografi, penyutradaraan"
          />
        </label>
        <label>
          Tanggal Lahir
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
        </label>
        <label>
          Jenis Kelamin
          <select value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">—</option>
            <option value="Laki-laki">Laki-laki</option>
            <option value="Perempuan">Perempuan</option>
          </select>
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
