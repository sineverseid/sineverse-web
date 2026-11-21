// SINEVERSE — Pendaftaran Anggota (Siswa) & Mentor (Pengajar), sama dengan
// formulir pendaftaran artefak (aksi registerstudent / applymentor):
// foto profil WAJIB, nama, email, kata sandi (min. 8 karakter) + konfirmasi,
// telepon/WA, tanggal lahir, jenis kelamin, kota, alamat (opsional), lalu
// jalur Siswa: sekolah, kelas, minat; jalur Mentor: keahlian, pengalaman,
// tautan portofolio. Akun dibuat sebagai siswa; lamaran mentor dikirim
// setelah email terverifikasi dan admin yang menyetujui (peran TIDAK
// langsung menjadi mentor).
//
// Verifikasi email (Supabase "Confirm email" AKTIF): setelah daftar, email
// konfirmasi dikirim oleh Supabase (lewat SMTP Gmail kustom). Ada dua cara
// mengaktifkan akun, dan keduanya dijelaskan jujur di layar — kode TIDAK
// PERNAH ditampilkan oleh aplikasi ini (tidak ada layanan email tiruan):
//   1. Klik tautan konfirmasi di email (selalu tersedia).
//   2. Masukkan kode 8 digit dari email yang sama (template email memuat
//      tautan dan kode; panjang kode mengikuti setelan Supabase).
// Foto file dititipkan di localStorage sampai pengguna masuk, baru diunggah
// ke bucket profile-photos (kebijakan bucket menuntut sesi terautentikasi).
// Lihat src/lib/registration.ts.
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { BRAND } from '../lib/brand'
import {
  completePendingRegistration,
  savePendingRegistration,
} from '../lib/registration'
import type { CompletionResult, RegistrationPayload } from '../lib/registration'

const MAX_PHOTO_BYTES = 2 * 1024 * 1024 // 2 MB — muat dititipkan di localStorage

// Batas tanggal lahir (hari ini) — konstanta modul, bukan hasil render.
const TODAY = new Date().toISOString().slice(0, 10)

function extFromFile(file: File): string {
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'image/jpeg') return 'jpg'
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  return ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? (ext === 'jpeg' ? 'jpg' : ext) : 'jpg'
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Tidak dapat membaca file foto.'))
    reader.readAsDataURL(file)
  })
}

export default function RegisterPage() {
  const { signUp, verifyOtpCode, resendConfirmation, user, registrationNotice } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Jalur pendaftaran dari halaman login: siswa atau mentor. Form-nya
  // berbeda sungguhan (bukan sekadar label) — mengikuti aksi artefak.
  const isMentorPath = searchParams.get('role') === 'mentor'

  // --- Form ---
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [phone, setPhone] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [gender, setGender] = useState('')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [school, setSchool] = useState('')
  const [kelas, setKelas] = useState('')
  const [interests, setInterests] = useState('')
  const [expertise, setExpertise] = useState('')
  const [experience, setExperience] = useState('')
  const [portfolioLink, setPortfolioLink] = useState('')
  const [photoFile, setPhotoFile] = useState<{ dataUrl: string; ext: string } | null>(null)
  const [photoUrl, setPhotoUrl] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // --- Verifikasi email ---
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null)
  const [registeredRole, setRegisteredRole] = useState<'siswa' | 'mentor'>('siswa')
  const [code, setCode] = useState('')
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [verified, setVerified] = useState(false)
  const [skippedVerification, setSkippedVerification] = useState(false)
  const [completion, setCompletion] = useState<CompletionResult | null>(null)
  const [completionError, setCompletionError] = useState<string | null>(null)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [resendNotice, setResendNotice] = useState<string | null>(null)
  const completionStarted = useRef(false)

  // Hitung mundur kirim ulang (aturan artefak: jeda 60 detik).
  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = window.setTimeout(() => setResendCooldown((v) => v - 1), 1000)
    return () => window.clearTimeout(t)
  }, [resendCooldown])

  // Bila pengguna sudah masuk dan TIDAK sedang memverifikasi, ke Beranda.
  if (user && !registeredEmail) {
    navigate('/', { replace: true })
    return null
  }

  async function handlePhotoFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Pilih file gambar (JPG/PNG/WebP).')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError(
        'Ukuran foto maksimal 2 MB untuk pendaftaran. Pilih foto yang lebih kecil, atau tempel tautan foto di kolom bawah.',
      )
      return
    }
    setError(null)
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setPhotoFile({ dataUrl, ext: extFromFile(file) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tidak dapat membaca file foto.')
    }
  }

  function validate(): string | null {
    if (!photoFile && !photoUrl.trim()) {
      return 'Foto profil wajib diisi — pilih file foto atau tempel tautan foto.'
    }
    if (photoUrl.trim() && !/^https?:\/\/.{6,}$/.test(photoUrl.trim())) {
      return 'Tautan foto tidak valid. Awali dengan http:// atau https://.'
    }
    if (name.trim().length < 2) return 'Nama lengkap minimal 2 karakter.'
    if (!email.trim()) return 'Isi alamat email kamu.'
    if (password.length < 8) return 'Kata sandi minimal 8 karakter.'
    if (password !== confirm) return 'Konfirmasi kata sandi tidak cocok.'
    if (phone.trim().length < 9) return 'Nomor telepon/WA minimal 9 karakter.'
    if (!birthDate) return 'Isi tanggal lahir kamu.'
    if (birthDate > TODAY) {
      return 'Tanggal lahir tidak boleh di masa depan.'
    }
    if (!gender) return 'Pilih jenis kelamin.'
    if (city.trim().length < 2) return 'Nama kota minimal 2 karakter.'
    if (isMentorPath) {
      if (expertise.trim().length < 2) return 'Bidang keahlian minimal 2 karakter.'
      if (experience.trim().length < 10) return 'Ceritakan pengalaman mengajar/kerja kamu (minimal 10 karakter).'
      if (portfolioLink.trim().length < 5) return 'Isi tautan portofolio kamu.'
    } else {
      if (school.trim().length < 2) return 'Nama sekolah minimal 2 karakter.'
      if (kelas.trim().length < 1) return 'Isi kelas kamu.'
      if (interests.trim().length < 2) return 'Isi minat kamu (mis. sinematografi, editing).'
    }
    return null
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    const cleanEmail = email.trim()
    const interestList = isMentorPath
      ? []
      : interests.split(',').map((s) => s.trim()).filter(Boolean)
    // Data profil lengkap dikirim sebagai user_metadata — trigger database
    // (migrasi 010) mengisinya ke tabel profiles saat akun dibuat.
    const metadata: Record<string, unknown> = {
      phone: phone.trim(),
      city: city.trim(),
      birth_date: birthDate,
      gender,
      address: address.trim(),
      school: isMentorPath ? '' : school.trim(),
      kelas: isMentorPath ? '' : kelas.trim(),
      interests: interestList,
      photo_url: photoFile ? '' : photoUrl.trim(),
    }
    const payload: RegistrationPayload = {
      name: name.trim(),
      email: cleanEmail,
      phone: phone.trim(),
      birthDate,
      gender,
      city: city.trim(),
      address: address.trim(),
      role: isMentorPath ? 'mentor' : 'siswa',
      school: isMentorPath ? '' : school.trim(),
      kelas: isMentorPath ? '' : kelas.trim(),
      interests: interestList,
      expertise: expertise.trim(),
      experience: experience.trim(),
      portfolioLink: portfolioLink.trim(),
      photo: photoFile
        ? { kind: 'file', dataUrl: photoFile.dataUrl, ext: photoFile.ext }
        : photoUrl.trim()
          ? { kind: 'url', url: photoUrl.trim() }
          : null,
    }
    setBusy(true)
    const { error: err, needsConfirmation } = await signUp({
      name: name.trim(),
      email: cleanEmail,
      password,
      metadata,
    })
    setBusy(false)
    if (err) {
      setError(err)
      return
    }
    // Titipkan payload (tanpa kata sandi) untuk diselesaikan setelah masuk:
    // foto file diunggah ke bucket, profil dilengkapi, lamaran mentor dikirim.
    savePendingRegistration(payload)
    setRegisteredRole(payload.role)
    if (needsConfirmation) {
      setRegisteredEmail(cleanEmail)
      setResendCooldown(60)
    } else {
      // Konfirmasi email ternyata nonaktif: akun langsung aktif.
      setRegisteredEmail(cleanEmail)
      setVerified(true)
      setSkippedVerification(true)
    }
  }

  async function handleVerifyCode(e: FormEvent) {
    e.preventDefault()
    setVerifyError(null)
    if (!registeredEmail) return
    if (!/^\d{8}$/.test(code.trim())) {
      setVerifyError('Masukkan kode 8 digit dari email kamu.')
      return
    }
    setVerifyBusy(true)
    const { error: err, user: verifiedUser } = await verifyOtpCode(registeredEmail, code.trim())
    setVerifyBusy(false)
    if (err) {
      setVerifyError(err)
      return
    }
    setVerified(true)
    // Sesi sudah aktif — selesaikan pendaftaran tertunda (foto, profil,
    // lamaran mentor). AuthProvider juga menjalankannya sebagai pengaman;
    // pemanggil kedua menunggu janji yang sama, bukan mengulang.
    if (verifiedUser && !completionStarted.current) {
      completionStarted.current = true
      try {
        const done = await completePendingRegistration(verifiedUser.id, registeredEmail)
        setCompletion(done)
      } catch (err) {
        setCompletionError(err instanceof Error ? err.message : 'Penyelesaian pendaftaran gagal.')
      }
    }
  }

  async function handleResend() {
    if (!registeredEmail || resendCooldown > 0) return
    setResendNotice(null)
    setVerifyError(null)
    const { error: err } = await resendConfirmation(registeredEmail)
    if (err) {
      setVerifyError(err)
      return
    }
    setResendCooldown(60)
    setResendNotice('Email konfirmasi baru dikirim. Periksa kotak masuk (dan folder spam).')
  }

  // --- Layar verifikasi email ---
  if (registeredEmail) {
    return (
      <div className="page login-page">
        <section className="login-hero">
          <p className="login-eyebrow">YOUR WORLD OF FILMMAKING</p>
          <h1 className="login-title">SINEVERSE</h1>
          <p className="login-desc">
            Satu langkah lagi — verifikasi email kamu untuk mengaktifkan akun.
          </p>
          <p className="login-slogan-pill">{BRAND.slogan}</p>
        </section>

        <div className="login-card-wrap">
          <div className="form">
            <h2>Periksa Email Kamu</h2>
            {!verified ? (
              <>
                <p>
                  Pendaftaran berhasil. Kami mengirim email konfirmasi ke{' '}
                  <strong>{registeredEmail}</strong>.
                </p>
                <p className="muted">
                  Buka email itu dan klik tautan konfirmasi — akunmu langsung aktif dan kamu
                  akan kembali ke aplikasi. Kalau tidak sempat klik tautan, masukkan kode
                  8 digit dari email yang sama di bawah ini.
                </p>
                <form onSubmit={handleVerifyCode}>
                  <label>
                    Kode 8 digit dari email
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
                      placeholder="12345678"
                      className="otp-input"
                    />
                  </label>
                  {verifyError && <p className="error-box">{verifyError}</p>}
                  {resendNotice && <p className="notice-box">{resendNotice}</p>}
                  <button type="submit" className="btn btn-primary btn-block" disabled={verifyBusy}>
                    {verifyBusy ? 'Memverifikasi…' : 'Verifikasi Kode'}
                  </button>
                </form>
                <p className="muted">
                  Email kamu berisi tautan konfirmasi dan kode 8 digit — dua-duanya bisa
                  dipakai. Klik tautan, atau masukkan kodenya di atas.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  onClick={handleResend}
                  disabled={resendCooldown > 0}
                >
                  {resendCooldown > 0
                    ? `Kirim ulang email (${resendCooldown} dtk)`
                    : 'Kirim Ulang Email Konfirmasi'}
                </button>
                <p className="muted">
                  Belum menerima email? Periksa folder spam. Setelah klik tautan di email,
                  kamu akan kembali ke aplikasi dan bisa langsung masuk.
                </p>
              </>
            ) : (
              <>
                <p className="notice-box">
                  {skippedVerification
                    ? 'Akun kamu aktif.'
                    : 'Email terverifikasi — akun kamu aktif.'}
                  {registeredRole === 'mentor' && (
                    <>
                      {' '}
                      Lamaran mentor kamu sudah dikirim dan menunggu persetujuan admin; sampai
                      disetujui, akunmu berperan sebagai anggota.
                    </>
                  )}
                  {completion?.photoUploaded && (
                    <> Foto profil kamu sudah terunggah.</>
                  )}
                </p>
                {completionError && <p className="error-box">{completionError}</p>}
                {registrationNotice && <p className="error-box">{registrationNotice}</p>}
                <Link to="/" className="btn btn-primary btn-block">
                  Masuk ke Beranda
                </Link>
              </>
            )}
          </div>
          <p className="muted login-admin-note">
            Sudah punya akun? <Link to="/login">Masuk di sini</Link>
          </p>
        </div>
      </div>
    )
  }

  // --- Formulir pendaftaran ---
  return (
    <div className="page login-page">
      <section className="login-hero">
        <p className="login-eyebrow">YOUR WORLD OF FILMMAKING</p>
        <h1 className="login-title">SINEVERSE</h1>
        <p className="login-desc">
          Platform nasional untuk pelajar SMA/SMK Indonesia: belajar film di Academy, berdiskusi
          di setiap lesson, membuat proyek lintas sekolah, dan memamerkan karya di Showcase.
        </p>
        <p className="login-slogan-pill">{BRAND.slogan}</p>
        <img
          src="./login-hero-film-crew.webp"
          alt="Kru film pelajar SINEVERSE: kamera, clapperboard, dan boom mic di taman"
          className="login-hero-img"
        />
      </section>

      <div className="login-card-wrap">
        <div className="login-register">
          <Link
            to="/register"
            className={`btn btn-block ${isMentorPath ? 'btn-secondary' : 'btn-primary'}`}
          >
            Daftar sebagai Anggota (Siswa)
          </Link>
          <Link
            to="/register?role=mentor"
            className={`btn btn-block ${isMentorPath ? 'btn-primary' : 'btn-secondary'}`}
          >
            Daftar sebagai Mentor (Pengajar)
          </Link>
        </div>

        <form className="form" onSubmit={handleSubmit}>
          <h2>{isMentorPath ? 'Daftar sebagai Mentor (Pengajar)' : 'Daftar sebagai Anggota (Siswa)'}</h2>
          {isMentorPath ? (
            <p className="muted">
              Buat akun dulu, verifikasi email, lalu lamaran mentor kamu dikirim otomatis.
              Mentor baru aktif mengajar setelah diverifikasi admin.
            </p>
          ) : (
            <p className="muted">
              Buat akun untuk mulai belajar filmmaking. Foto profil wajib diisi.
            </p>
          )}

          <label>
            Foto Profil (wajib)
            <span className="photo-field">
              <span className="btn btn-secondary btn-small" style={{ cursor: 'pointer' }}>
                {photoFile ? 'Ganti Foto' : 'Pilih Foto'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoFile}
                  style={{ display: 'none' }}
                />
              </span>
              {photoFile && (
                <img src={photoFile.dataUrl} alt="Pratinjau foto profil" className="photo-preview" />
              )}
            </span>
            <span className="muted" style={{ fontWeight: 400 }}>
              JPG/PNG/WebP, maksimal 2 MB. Atau tempel tautan foto di bawah ini.
            </span>
            <input
              type="url"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="https://… (tautan foto, bila tidak mengunggah file)"
            />
          </label>

          <label>
            Nama Lengkap
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              minLength={2}
              maxLength={80}
              placeholder="Nama kamu"
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              maxLength={120}
              placeholder="nama@email.com"
            />
          </label>
          <label>
            Kata Sandi
            <span className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={100}
                placeholder="Minimal 8 karakter"
              />
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
              >
                {showPassword ? 'Sembunyikan' : 'Lihat'}
              </button>
            </span>
          </label>
          <label>
            Konfirmasi Kata Sandi
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={100}
              placeholder="Ulangi kata sandi"
            />
          </label>
          <label>
            Nomor Telepon / WA
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              required
              minLength={9}
              maxLength={20}
              placeholder="08xxxxxxxxxx"
            />
          </label>
          <label>
            Tanggal Lahir
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              required
              max={TODAY}
            />
          </label>
          <label>
            Jenis Kelamin
            <select value={gender} onChange={(e) => setGender(e.target.value)} required>
              <option value="">Pilih jenis kelamin</option>
              <option value="Laki-laki">Laki-laki</option>
              <option value="Perempuan">Perempuan</option>
            </select>
          </label>
          <label>
            Kota
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              autoComplete="address-level2"
              required
              minLength={2}
              maxLength={80}
              placeholder="Kota tempat tinggal"
            />
          </label>

          {isMentorPath ? (
            <>
              <label>
                Bidang Keahlian
                <input
                  type="text"
                  value={expertise}
                  onChange={(e) => setExpertise(e.target.value)}
                  required
                  minLength={2}
                  maxLength={200}
                  placeholder="Mis. Sinematografi, penyutradaraan"
                />
              </label>
              <label>
                Pengalaman Mengajar / Kerja
                <textarea
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  required
                  minLength={10}
                  maxLength={2000}
                  rows={4}
                  placeholder="Ceritakan pengalaman mengajar atau kerja kamu di bidang film."
                />
              </label>
              <label>
                Tautan Portofolio
                <input
                  type="url"
                  value={portfolioLink}
                  onChange={(e) => setPortfolioLink(e.target.value)}
                  required
                  minLength={5}
                  maxLength={1000}
                  placeholder="https://… (tautan karya atau profil kamu)"
                />
              </label>
            </>
          ) : (
            <>
              <label>
                Sekolah
                <input
                  type="text"
                  value={school}
                  onChange={(e) => setSchool(e.target.value)}
                  required
                  minLength={2}
                  maxLength={120}
                  placeholder="Nama sekolah kamu"
                />
              </label>
              <label>
                Kelas
                <input
                  type="text"
                  value={kelas}
                  onChange={(e) => setKelas(e.target.value)}
                  required
                  minLength={1}
                  maxLength={20}
                  placeholder="Mis. X-1 / 10 RPL 1"
                />
              </label>
              <label>
                Minat
                <input
                  type="text"
                  value={interests}
                  onChange={(e) => setInterests(e.target.value)}
                  required
                  minLength={2}
                  maxLength={200}
                  placeholder="Mis. Sinematografi, penyutradaraan, editing (pisahkan dengan koma)"
                />
              </label>
            </>
          )}

          <label>
            Alamat (opsional)
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Alamat lengkap (boleh dikosongkan)"
            />
          </label>

          {error && <p className="error-box">{error}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Mendaftar…' : 'Daftar'}
          </button>
          <p className="login-version">
            Versi aplikasi {BRAND.version} • Aplikasi PWA • diperbarui {BRAND.versionUpdated}
          </p>
        </form>
        <p className="muted login-admin-note">
          Sudah punya akun? <Link to="/login">Masuk di sini</Link>
          <br />
          Admin bukan jalur pendaftaran publik — akun admin ditetapkan oleh pengelola platform.
        </p>
      </div>
    </div>
  )
}
