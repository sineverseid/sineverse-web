// SINEVERSE, Profil: foto (bila ada), data diri, ganti kata sandi.
// Upload foto profil: bucket profile-photos, replace-only (tidak bisa hapus).
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/icons'
import type { IconName } from '../components/icons'
import ProfilePhotoUpload from '../components/ProfilePhotoUpload'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'

export default function ProfilePage() {
  const { user, profile, changePassword, refreshProfile, signOut } = useAuth()
  const [photoBroken, setPhotoBroken] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwMessage, setPwMessage] = useState<string | null>(null)
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwBusy, setPwBusy] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null)

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    setPwMessage(null)
    setPwError(null)
    if (newPassword.length < 6) {
      setPwError('Kata sandi baru minimal 6 karakter.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPwError('Konfirmasi kata sandi tidak cocok.')
      return
    }
    setPwBusy(true)
    const { error } = await changePassword(newPassword)
    setPwBusy(false)
    if (error) {
      setPwError('Gagal mengubah kata sandi. Coba lagi.')
      return
    }
    setPwMessage('Kata sandi berhasil diubah.')
    setNewPassword('')
    setConfirmPassword('')
  }

  // K20: role kosong ('') lolos dari `??` dan me-render Peran kosong
  // (yang terlihat live pada Mentor Uji) — pakai `||` supaya string
  // kosong/null sama-sama jatuh ke 'siswa'. Label tampil Indonesia.
  const role = profile?.role || 'siswa'
  const ROLE_LABEL: Record<string, string> = { siswa: 'Siswa', mentor: 'Mentor', admin: 'Admin' }
  const roleLabelShort = ROLE_LABEL[role] ?? role
  const roleLabel =
    role === 'admin'
      ? 'Admin SINEVERSE'
      : role === 'mentor'
        ? 'Mentor SINEVERSE'
        : `Siswa${profile?.school ? ` • ${profile.school}` : ''}`

  function menuItem(to: string, icon: IconName, label: string) {
    return (
      <li key={to + label}>
        <Link to={to} className="profile-menu-item">
          <span className="profile-menu-icon">
            <Icon name={icon} size={20} />
          </span>
          <span>{label}</span>
          <span className="chev">
            <Icon name="chevronRight" size={20} />
          </span>
        </Link>
      </li>
    )
  }

  return (
    <div className="page page-narrow">
      <PageHeader icon="user" title="Profil Saya" />
      <div className="profile-hero">
        {profile?.photo_url && !photoBroken ? (
          <img
            src={profile.photo_url}
            alt="Foto profil"
            className="profile-avatar-lg"
            onError={() => setPhotoBroken(true)}
          />
        ) : (
          <div className="profile-avatar-lg" aria-label="Belum ada foto profil">
            {(profile?.name ?? '?').charAt(0).toUpperCase()}
          </div>
        )}
        <p className="profile-name">{profile?.name ?? '—'}</p>
        <p className="profile-sub">{roleLabel}</p>
        <ProfilePhotoUpload />
      </div>

      <ul className="profile-menu">
        {role === 'siswa' && (
          <>
            {menuItem('/profil/edit', 'user', 'Data Akun')}
            {menuItem('/growth', 'chart', 'Progress Belajar')}
            {menuItem('/sertifikat', 'certificate', 'Sertifikat Saya')}
            {menuItem('/notifikasi/pengaturan', 'settings', 'Pengaturan')}
            {menuItem('/tentang', 'info', 'Bantuan & FAQ')}
          </>
        )}
        {role === 'mentor' && (
          <>
            {menuItem('/profil/edit', 'user', 'Informasi Akun')}
            {menuItem('/akademi', 'academy', 'Course yang Diampu')}
            {menuItem('/mentor/penilaian', 'grade', 'Riwayat Aktivitas')}
            {menuItem('/sertifikat', 'certificate', 'Sertifikat Saya')}
            {menuItem('/tentang', 'info', 'Bantuan & FAQ')}
          </>
        )}
        {role === 'admin' && (
          <>
            {menuItem('/profil/edit', 'user', 'Informasi Akun')}
            {menuItem('/admin', 'admin', 'Dashboard Admin')}
            {menuItem('/admin/pengaturan', 'settings', 'Pengaturan')}
            {menuItem('/sertifikat', 'certificate', 'Sertifikat Saya')}
            {menuItem('/tentang', 'info', 'Bantuan & FAQ')}
          </>
        )}
        <li>
          <button
            type="button"
            className="profile-menu-item danger"
            onClick={() => void signOut()}
          >
            <span className="profile-menu-icon">
              <Icon name="logout" size={20} />
            </span>
            <span>Keluar</span>
          </button>
        </li>
      </ul>

      <section className="section">
        <div className="dash-section-head">
          <h2>Data Akun</h2>
        </div>
        <dl className="profile-list">
          <div>
            <dt>Nama</dt>
            <dd>{profile?.name ?? '—'}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{profile?.email ?? user?.email ?? '—'}</dd>
          </div>
          <div>
            <dt>Peran</dt>
            <dd>{roleLabelShort}</dd>
          </div>
          <div>
            <dt>Sekolah</dt>
            <dd>{profile?.school ?? '—'}</dd>
          </div>
          <div>
            <dt>Kelas</dt>
            <dd>{profile?.kelas ?? '—'}</dd>
          </div>
          <div>
            <dt>Minat</dt>
            <dd>
              {profile?.interests && profile.interests.length > 0
                ? profile.interests.join(', ')
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Tanggal Lahir</dt>
            <dd>
              {profile?.birth_date
                ? (() => {
                    const d = new Date(profile.birth_date)
                    return Number.isNaN(d.getTime())
                      ? profile.birth_date
                      : d.toLocaleDateString('id-ID', { dateStyle: 'long' })
                  })()
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Jenis Kelamin</dt>
            <dd>{profile?.gender ?? '—'}</dd>
          </div>
          <div>
            <dt>Telepon / WA</dt>
            <dd>{profile?.phone ?? '—'}</dd>
          </div>
          <div>
            <dt>Kota</dt>
            <dd>{profile?.city ?? '—'}</dd>
          </div>
          <div>
            <dt>Bio</dt>
            <dd>{profile?.bio ?? '—'}</dd>
          </div>
        </dl>
        {refreshMessage && <p className="notice-box">{refreshMessage}</p>}
        <p className="muted">
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setRefreshMessage(null)
              void refreshProfile().then(() => setRefreshMessage('Profil dimuat ulang.'))
            }}
          >
            Muat ulang profil
          </button>
        </p>
        <p>
          <Link to="/profil/edit" className="btn btn-secondary">
            Edit Profil
          </Link>
        </p>
      </section>

      <section className="section">
        <h2>Ganti Kata Sandi</h2>
        <form className="form" onSubmit={handleChangePassword}>
          <label>
            Kata Sandi Baru
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
              placeholder="Minimal 6 karakter"
            />
          </label>
          <label>
            Konfirmasi Kata Sandi Baru
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
              placeholder="Ulangi kata sandi baru"
            />
          </label>
          {pwError && <p className="error-box">{pwError}</p>}
          {pwMessage && <p className="notice-box">{pwMessage}</p>}
          <button type="submit" className="btn btn-primary" disabled={pwBusy}>
            {pwBusy ? 'Menyimpan…' : 'Ubah Kata Sandi'}
          </button>
        </form>
      </section>
    </div>
  )
}
