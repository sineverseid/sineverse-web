// SINEVERSE — Login email + password, sama dengan layar login artefak:
// hero navy di atas (eyebrow, judul, deskripsi, pil slogan, ilustrasi kru
// film), kartu login dengan penjelasan lengkap, baris versi, dua tombol
// daftar (Anggota / Mentor), dan catatan admin.
//
// Lupa kata sandi (Fase pendamping, 24 Nov 2026): alur 3 langkah memakai
// kode pemulihan native Supabase — (1) masukkan email terdaftar,
// (2) masukkan kode 6 digit dari email, (3) buat kata sandi baru.
// Verifikasi memakai email terdaftar (identitas login) — bukan username,
// supaya alamat email akun lain tidak bisa ditebak/dibocorkan.
// Kode dikirim bila template email "Reset Password" di Dashboard memuat
// {{ .Token }}; tautan pemulihan di email yang sama tetap berfungsi.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { BRAND } from '../lib/brand'

type Mode = 'login' | 'forgot'

export default function LoginPage() {
  const { signIn, signOut, user, requestPasswordReset, verifyRecoveryCode, changePassword } =
    useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loginNotice, setLoginNotice] = useState<string | null>(null)

  // --- Lupa kata sandi ---
  const [mode, setMode] = useState<Mode>('login')
  const [forgotStep, setForgotStep] = useState<1 | 2 | 3>(1)
  const [resetEmail, setResetEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetNotice, setResetNotice] = useState<string | null>(null)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetDone, setResetDone] = useState(false)

  // P23: redirect saat render memanggil navigate di luar effect — pindah
  // ke effect supaya tidak ada efek samping di body render.
  // Mode 'forgot' dikecualikan: setelah kode diverifikasi, Supabase memberi
  // sesi pemulihan (user terisi) — pengguna harus tetap di halaman ini
  // sampai kata sandi baru disimpan.
  useEffect(() => {
    if (user && mode === 'login') navigate(from, { replace: true })
  }, [user, from, navigate, mode])

  if (user && mode === 'login') {
    return null
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError('Isi email dan kata sandi kamu.')
      return
    }
    setBusy(true)
    const { error: err } = await signIn(email.trim(), password)
    setBusy(false)
    if (err) {
      setError(err)
      return
    }
    navigate(from, { replace: true })
  }

  function openForgot() {
    setMode('forgot')
    setForgotStep(1)
    setResetEmail(email.trim())
    setCode('')
    setNewPassword('')
    setConfirmPassword('')
    setResetError(null)
    setResetNotice(null)
    setResetDone(false)
  }

  function backToLogin() {
    setMode('login')
    setResetError(null)
    setResetNotice(null)
  }

  async function handleForgotEmail(e: FormEvent) {
    e.preventDefault()
    setResetError(null)
    setResetNotice(null)
    if (!resetEmail.trim()) {
      setResetError('Isi email terdaftar kamu.')
      return
    }
    setResetBusy(true)
    const { error: err } = await requestPasswordReset(resetEmail.trim())
    setResetBusy(false)
    if (err) {
      setResetError(err)
      return
    }
    // Pesan generik dengan sengaja: tidak membocorkan apakah email terdaftar.
    setResetNotice(
      'Jika email itu terdaftar, kode verifikasi 6 digit telah dikirim ke email kamu. Kode berlaku 1 jam — periksa kotak masuk (dan folder spam).',
    )
    setForgotStep(2)
  }

  async function handleForgotCode(e: FormEvent) {
    e.preventDefault()
    setResetError(null)
    if (code.trim().length < 6) {
      setResetError('Masukkan kode 6 digit dari email kamu.')
      return
    }
    setResetBusy(true)
    const { error: err } = await verifyRecoveryCode(resetEmail.trim(), code.trim())
    setResetBusy(false)
    if (err) {
      setResetError(err)
      return
    }
    setResetNotice(null)
    setForgotStep(3)
  }

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault()
    setResetError(null)
    if (newPassword.length < 8) {
      setResetError('Kata sandi baru minimal 8 karakter.')
      return
    }
    if (newPassword !== confirmPassword) {
      setResetError('Konfirmasi kata sandi tidak cocok dengan kata sandi baru.')
      return
    }
    setResetBusy(true)
    const { error: err } = await changePassword(newPassword)
    setResetBusy(false)
    if (err) {
      setResetError(err)
      return
    }
    setResetDone(true)
  }

  async function handleResetDone() {
    // Keluar dari sesi pemulihan supaya pengguna masuk ulang dengan kata
    // sandi baru — menegaskan bahwa pergantian berhasil.
    await signOut()
    setMode('login')
    setForgotStep(1)
    setResetDone(false)
    setLoginNotice('Kata sandi berhasil diubah. Silakan masuk dengan kata sandi baru.')
  }

  async function handleResendCode() {
    setResetError(null)
    setResetBusy(true)
    const { error: err } = await requestPasswordReset(resetEmail.trim())
    setResetBusy(false)
    if (err) {
      setResetError(err)
      return
    }
    setResetNotice('Kode baru dikirim ke email kamu. Kode berlaku 1 jam.')
  }

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
        {mode === 'login' ? (
          <form className="form login-form" onSubmit={handleSubmit}>
            <h2>Masuk ke SINEVERSE</h2>
            <p className="muted">
              Masuk dengan email dan kata sandi yang kamu buat saat pertama kali mendaftar. Setiap
              role memiliki dashboard dan hak akses berbeda — siswa tidak dapat menilai, mentor
              hanya mengelola kursusnya, dan mentor baru aktif mengajar setelah diverifikasi admin.
            </p>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
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
                  autoComplete="current-password"
                  required
                  placeholder="Kata sandi akunmu"
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
            <p className="login-forgot">
              <button type="button" className="link-button" onClick={openForgot}>
                Lupa kata sandi?
              </button>
            </p>
            {loginNotice && <p className="notice-box">{loginNotice}</p>}
            {error && <p className="error-box">{error}</p>}
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Memeriksa…' : 'Masuk'}
            </button>
            <p className="login-version">
              Versi aplikasi {BRAND.version} • Aplikasi PWA • diperbarui {BRAND.versionUpdated}
            </p>
          </form>
        ) : (
          <form
            className="form login-form"
            onSubmit={
              resetDone
                ? undefined
                : forgotStep === 1
                  ? handleForgotEmail
                  : forgotStep === 2
                    ? handleForgotCode
                    : handleForgotPassword
            }
          >
            <h2>Lupa Kata Sandi</h2>
            {resetDone ? (
              <>
                <p className="notice-box">
                  Kata sandi kamu berhasil diubah. Silakan masuk dengan kata sandi baru.
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={handleResetDone}
                >
                  Masuk dengan Kata Sandi Baru
                </button>
              </>
            ) : forgotStep === 1 ? (
              <>
                <p className="muted">
                  Masukkan email yang kamu pakai saat mendaftar (siswa maupun mentor). Kami akan
                  mengirim kode verifikasi 6 digit ke email itu.
                </p>
                <label>
                  Email Terdaftar
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    autoComplete="email"
                    required
                    placeholder="nama@email.com"
                  />
                </label>
                {resetError && <p className="error-box">{resetError}</p>}
                <button type="submit" className="btn btn-primary btn-block" disabled={resetBusy}>
                  {resetBusy ? 'Mengirim…' : 'Kirim Kode Verifikasi'}
                </button>
              </>
            ) : forgotStep === 2 ? (
              <>
                <p className="muted">
                  Masukkan kode 6 digit yang dikirim ke <strong>{resetEmail}</strong>. Kode
                  berlaku 1 jam.
                </p>
                <label>
                  Kode Verifikasi
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                    required
                    placeholder="123456"
                  />
                </label>
                {resetNotice && <p className="notice-box">{resetNotice}</p>}
                {resetError && <p className="error-box">{resetError}</p>}
                <button type="submit" className="btn btn-primary btn-block" disabled={resetBusy}>
                  {resetBusy ? 'Memeriksa…' : 'Verifikasi Kode'}
                </button>
                <p className="login-forgot">
                  <button
                    type="button"
                    className="link-button"
                    onClick={handleResendCode}
                    disabled={resetBusy}
                  >
                    Kirim ulang kode
                  </button>
                  {' • '}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      setForgotStep(1)
                      setResetError(null)
                    }}
                  >
                    Ganti email
                  </button>
                </p>
              </>
            ) : (
              <>
                <p className="muted">
                  Kode terverifikasi. Buat kata sandi baru untuk akun <strong>{resetEmail}</strong>
                  .
                </p>
                <label>
                  Kata Sandi Baru
                  <span className="password-field">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                      placeholder="Minimal 8 karakter"
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => setShowNewPassword((v) => !v)}
                      aria-label={showNewPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                    >
                      {showNewPassword ? 'Sembunyikan' : 'Lihat'}
                    </button>
                  </span>
                </label>
                <label>
                  Konfirmasi Kata Sandi Baru
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    placeholder="Ulangi kata sandi baru"
                  />
                </label>
                {resetError && <p className="error-box">{resetError}</p>}
                <button type="submit" className="btn btn-primary btn-block" disabled={resetBusy}>
                  {resetBusy ? 'Menyimpan…' : 'Simpan Kata Sandi Baru'}
                </button>
              </>
            )}
            {!resetDone && (
              <p className="login-forgot">
                <button type="button" className="link-button" onClick={backToLogin}>
                  ← Kembali masuk
                </button>
              </p>
            )}
            <p className="login-version">
              Versi aplikasi {BRAND.version} • Aplikasi PWA • diperbarui {BRAND.versionUpdated}
            </p>
          </form>
        )}

        <div className="login-register">
          <Link to="/register" className="btn btn-primary btn-block">
            + Daftar sebagai Anggota (Siswa)
          </Link>
          <Link to="/register?role=mentor" className="btn btn-secondary btn-block">
            + Daftar sebagai Mentor (Pengajar)
          </Link>
        </div>
        <p className="muted login-admin-note">
          Admin bukan jalur pendaftaran publik — akun admin ditetapkan oleh pengelola platform.
        </p>
      </div>
    </div>
  )
}
