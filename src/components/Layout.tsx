// SINEVERSE — shared layout: top nav, bottom mobile nav, footer.
// Bell notifikasi menampilkan jumlah belum dibaca (tabel notifications,
// migrasi 008); bila tabel belum ada, lonceng tampil tanpa angka.
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchUnreadCount } from '../lib/supabase'
import InstallPrompt from './InstallPrompt'

export default function Layout() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [unread, setUnread] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  // Tutup menu mobile setiap kali pindah halaman.
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!user) {
      setUnread(null)
      return
    }
    let cancelled = false
    fetchUnreadCount(user.id)
      .then((n) => {
        if (!cancelled) setUnread(n)
      })
      .catch(() => {
        if (!cancelled) setUnread(null)
      })
    return () => {
      cancelled = true
    }
  }, [user, location.pathname])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <img src="./pwa-192x192.png" alt="Logo SINEVERSE" className="brand-logo" />
          <span className="brand-name">SINEVERSE</span>
        </Link>
        {user ? (
          <>
            <button
              type="button"
              className="menu-toggle"
              aria-label={menuOpen ? 'Tutup menu' : 'Buka menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? '✕' : '☰'}
            </button>
            <nav className={menuOpen ? 'topnav open' : 'topnav'} aria-label="Navigasi utama">
              <NavLink to="/" end>
                Beranda
              </NavLink>
              <NavLink to="/akademi">Akademi</NavLink>
              <NavLink to="/rps">RPS</NavLink>
              <NavLink to="/komunitas">Komunitas</NavLink>
              <NavLink to="/sekolah">Sekolah & Klub</NavLink>
              <NavLink to="/proyek">Proyek</NavLink>
              <NavLink to="/showcase">Showcase</NavLink>
              <NavLink to="/pustaka">Pustaka</NavLink>
              <NavLink to="/acara">Acara</NavLink>
              <NavLink to="/kompetisi">Kompetisi</NavLink>
              <NavLink to="/pengumuman">Pengumuman</NavLink>
              <NavLink to="/nilai">Nilai Saya</NavLink>
              <NavLink to="/ujian">Ujian</NavLink>
              <NavLink to="/sertifikat">Sertifikat</NavLink>
              <NavLink to="/notifikasi">
                Notifikasi{unread !== null && unread > 0 ? ` (${unread})` : ''}
              </NavLink>
              {(profile?.role === 'mentor' || profile?.role === 'admin') && (
                <NavLink to="/mentor">Mentor</NavLink>
              )}
              {profile?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
              <NavLink to="/profil">Profil</NavLink>
            </nav>
          </>
        ) : (
          <NavLink to="/login" className="nav-cta">
            Masuk
          </NavLink>
        )}
      </header>

      <main className="main">
        <Outlet />
      </main>

      <InstallPrompt />

      <footer className="footer">
        <p>
          <strong>SINEVERSE</strong> — Your World of Filmmaking
        </p>
        <p className="footer-sub">
          Platform pendidikan filmmaking nasional untuk pelajar SMA/SMK di seluruh Indonesia.
        </p>
        {user && profile && (
          <p className="footer-sub">
            Masuk sebagai {profile.name ?? profile.email} ({profile.role})
            {' · '}
            <button type="button" className="link-button" onClick={handleSignOut}>
              Keluar
            </button>
          </p>
        )}
      </footer>
    </div>
  )
}
