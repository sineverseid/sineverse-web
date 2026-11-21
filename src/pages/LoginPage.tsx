// SINEVERSE — Login email + password, sama dengan layar login artefak:
// hero navy di atas (eyebrow, judul, deskripsi, pil slogan, ilustrasi kru
// film), kartu login dengan penjelasan lengkap, baris versi, dua tombol
// daftar (Anggota / Mentor), dan catatan admin.
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { BRAND } from '../lib/brand'

export default function LoginPage() {
  const { signIn, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (user) {
    navigate(from, { replace: true })
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
          {error && <p className="error-box">{error}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Memeriksa…' : 'Masuk'}
          </button>
          <p className="login-version">
            Versi aplikasi {BRAND.version} • Aplikasi PWA • diperbarui {BRAND.versionUpdated}
          </p>
        </form>

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
