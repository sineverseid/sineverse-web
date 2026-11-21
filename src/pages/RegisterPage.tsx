// SINEVERSE — Registrasi: nama, email, kata sandi + konfirmasi (min. 6 karakter).
// Profil dibuat otomatis oleh trigger database — client tidak menulis ke
// tabel profiles. Karena "Confirm email" aktif di Supabase, pendaftaran
// berhasil menampilkan pemberitahuan konfirmasi email, bukan sesi langsung.
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function RegisterPage() {
  const { signUp, user } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null)

  if (user) {
    navigate('/', { replace: true })
    return null
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim() || !email.trim() || !password || !confirm) {
      setError('Lengkapi semua kolom.')
      return
    }
    if (password.length < 6) {
      setError('Kata sandi minimal 6 karakter.')
      return
    }
    if (password !== confirm) {
      setError('Konfirmasi kata sandi tidak cocok.')
      return
    }
    setBusy(true)
    const { error: err, needsConfirmation } = await signUp(name.trim(), email.trim(), password)
    setBusy(false)
    if (err) {
      setError(err)
      return
    }
    if (needsConfirmation) {
      setRegisteredEmail(email.trim())
    } else {
      navigate('/', { replace: true })
    }
  }

  if (registeredEmail) {
    return (
      <div className="page page-narrow">
        <h1>Periksa Email Kamu</h1>
        <p>
          Pendaftaran berhasil. Kami mengirim tautan konfirmasi ke{' '}
          <strong>{registeredEmail}</strong>.
        </p>
        <p className="muted">
          Klik tautan di email tersebut untuk mengaktifkan akun, lalu masuk. Jika tidak ada di
          kotak masuk, periksa folder spam.
        </p>
        <Link to="/login" className="btn btn-primary">
          Ke Halaman Masuk
        </Link>
      </div>
    )
  }

  return (
    <div className="page page-narrow">
      <h1>Daftar ke SINEVERSE</h1>
      <p className="muted">Buat akun untuk mulai belajar filmmaking.</p>
      <form className="form" onSubmit={handleSubmit}>
        <label>
          Nama Lengkap
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
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
              minLength={6}
              placeholder="Minimal 6 karakter"
            />
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
            >
              {showPassword ? 'Sembunyikan' : 'Tampilkan'}
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
            minLength={6}
            placeholder="Ulangi kata sandi"
          />
        </label>
        {error && <p className="error-box">{error}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Mendaftar…' : 'Daftar'}
        </button>
      </form>
      <p className="muted">
        Sudah punya akun? <Link to="/login">Masuk di sini</Link>
      </p>
    </div>
  )
}
