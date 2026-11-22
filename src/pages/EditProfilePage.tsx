// SINEVERSE, Edit profil: nama, sekolah, kelas, minat, tanggal lahir,
// jenis kelamin, telepon, kota, bio.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ProfilePhotoUpload from '../components/ProfilePhotoUpload'
import { fetchProvinces, fetchRegencies, searchSchools, updateProfile } from '../lib/supabase'
import type { RefProvince, RefRegency, School } from '../lib/types'

export default function EditProfilePage() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  // K10: sekolah memakai picker per-kabupaten yang SAMA seperti pendaftaran
  // (provinsi → kabupaten/kota → daftar sekolah terverifikasi), bukan teks
  // bebas — supaya school_id dan school tertulis bersamaan dan halaman
  // Sekolah tidak lagi mengabaikan sekolah yang diketik di sini.
  const [provinces, setProvinces] = useState<RefProvince[]>([])
  const [regencies, setRegencies] = useState<RefRegency[]>([])
  const [province, setProvince] = useState('')
  const [regency, setRegency] = useState('')
  const [schoolQuery, setSchoolQuery] = useState('')
  const [schoolResults, setSchoolResults] = useState<School[]>([])
  const [schoolSearching, setSchoolSearching] = useState(false)
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null)
  const [manualSchool, setManualSchool] = useState(false)
  const [manualSchoolName, setManualSchoolName] = useState('')
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
      // Sekolah lama: bila school_id ada, sekolah itu terpilih dari daftar;
      // bila hanya ada teks bebas (tanpa school_id), tampil sebagai
      // isian manual supaya tidak hilang.
      if (profile.school_id && profile.school) {
        setSelectedSchool({ id: profile.school_id, name: profile.school } as School)
        setSchoolQuery(profile.school)
        setManualSchool(false)
        setManualSchoolName('')
      } else if (profile.school) {
        setSelectedSchool(null)
        setSchoolQuery('')
        setManualSchool(true)
        setManualSchoolName(profile.school)
      } else {
        setSelectedSchool(null)
        setSchoolQuery('')
        setManualSchool(false)
        setManualSchoolName('')
      }
      setProvince(profile.province ?? '')
      setRegency(profile.regency ?? '')
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

  // Daftar provinsi (sekali) — pola yang sama dengan RegisterPage.
  useEffect(() => {
    let cancelled = false
    fetchProvinces()
      .then((rows) => {
        if (!cancelled) setProvinces(rows)
      })
      .catch(() => {
        // Gagal memuat: pilihan tetap kosong, sekolah bisa diisi manual.
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Kabupaten/kota mengikuti provinsi yang dipilih.
  useEffect(() => {
    if (!province) {
      setRegencies([])
      return
    }
    let cancelled = false
    fetchRegencies(province)
      .then((rows) => {
        if (!cancelled) setRegencies(rows)
      })
      .catch(() => {
        if (!cancelled) setRegencies([])
      })
    return () => {
      cancelled = true
    }
  }, [province])

  // Nama kabupaten/kota yang dipilih (schools.regency menyimpan nama
  // referensi, bukan kode) — untuk membatasi daftar sekolah ke daerah itu.
  const regencyName = regencies.find((r) => r.code === regency)?.name ?? ''

  // Cari sekolah terverifikasi di kabupaten/kota yang dipilih (debounce;
  // nama atau NPSN). Begitu kabupaten/kota dipilih, daftar sekolah di
  // daerah itu langsung dimuat tanpa perlu mengetik.
  useEffect(() => {
    if (manualSchool || selectedSchool) {
      setSchoolResults([])
      return
    }
    if (!regencyName) {
      setSchoolResults([])
      return
    }
    const q = schoolQuery.trim()
    if (q.length < 2) {
      let cancelled = false
      setSchoolSearching(true)
      searchSchools('', regencyName)
        .then((rows) => {
          if (!cancelled) setSchoolResults(rows)
        })
        .catch(() => {
          if (!cancelled) setSchoolResults([])
        })
        .finally(() => {
          if (!cancelled) setSchoolSearching(false)
        })
      return () => {
        cancelled = true
      }
    }
    setSchoolSearching(true)
    const t = window.setTimeout(async () => {
      try {
        setSchoolResults(await searchSchools(q, regencyName))
      } catch {
        setSchoolResults([])
      }
      setSchoolSearching(false)
    }, 400)
    return () => window.clearTimeout(t)
  }, [schoolQuery, manualSchool, selectedSchool, regencyName])

  function handleSchoolQueryChange(value: string) {
    setSchoolQuery(value)
    if (selectedSchool) setSelectedSchool(null)
  }

  function selectSchool(school: School) {
    setSelectedSchool(school)
    setSchoolQuery(school.name)
    setSchoolResults([])
  }

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
      // K10: school_id + school ditulis BERSAMAAN. Sekolah dari daftar →
      // keduanya terisi; sekolah manual → school_id null + teks bebas;
      // dikosongkan → keduanya null (sekolah lama tidak lagi nyangkut).
      const schoolName = manualSchool
        ? manualSchoolName.trim()
        : (selectedSchool?.name ?? '')
      await updateProfile(user.id, {
        name: name.trim(),
        school: schoolName || null,
        school_id: manualSchool ? null : (selectedSchool?.id ?? null),
        province: province || null,
        regency: regency || null,
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
          Provinsi
          <select
            value={province}
            onChange={(e) => {
              setProvince(e.target.value)
              setRegency('')
              setSelectedSchool(null)
              setSchoolQuery('')
              setSchoolResults([])
            }}
          >
            <option value="">—</option>
            {provinces.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Kabupaten / Kota
          <select
            value={regency}
            onChange={(e) => {
              setRegency(e.target.value)
              setSelectedSchool(null)
              setSchoolQuery('')
              setSchoolResults([])
            }}
            disabled={!province}
          >
            <option value="" disabled>
              {province ? 'Pilih kabupaten/kota' : 'Pilih provinsi dulu'}
            </option>
            {regencies.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        {manualSchool ? (
          <>
            <label>
              Sekolah
              <input
                type="text"
                value={manualSchoolName}
                onChange={(e) => setManualSchoolName(e.target.value)}
                autoComplete="organization"
                placeholder="Nama sekolah"
              />
            </label>
            <p className="muted">
              Sekolah yang diketik manual belum masuk daftar resmi — pilih dari daftar bila
              sekolahmu sudah terdaftar.
            </p>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => {
                setManualSchool(false)
                setManualSchoolName('')
              }}
            >
              Pilih dari daftar sekolah
            </button>
          </>
        ) : (
          <>
            <label>
              Sekolah
              <input
                type="text"
                value={schoolQuery}
                onChange={(e) => handleSchoolQueryChange(e.target.value)}
                autoComplete="off"
                placeholder={
                  regencyName ? 'Ketik nama sekolah atau NPSN…' : 'Pilih provinsi dan kabupaten/kota dulu'
                }
                disabled={!regencyName}
              />
              <span className="muted" style={{ fontWeight: 400 }}>
                {schoolSearching
                  ? 'Mencari…'
                  : selectedSchool
                    ? `Terpilih: ${selectedSchool.name}`
                    : regencyName
                      ? `Sekolah di ${regencyName} — ketik untuk mencari.`
                      : 'Pilih provinsi dan kabupaten/kota dulu — sekolah di daerahmu akan muncul di sini.'}
              </span>
            </label>
            {schoolResults.length > 0 && (
              <ul className="school-results">
                {schoolResults.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => selectSchool(s)}>
                      {s.name}
                      {s.npsn ? ` — NPSN ${s.npsn}` : ''}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!selectedSchool && regencyName && !schoolSearching && schoolQuery.trim().length >= 2 && schoolResults.length === 0 && (
              <p className="muted">Tidak ditemukan di {regencyName}.</p>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => {
                setManualSchool(true)
                setSelectedSchool(null)
                setSchoolResults([])
              }}
            >
              Sekolah saya belum terdaftar
            </button>
          </>
        )}
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
