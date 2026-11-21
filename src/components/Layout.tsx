// SINEVERSE — shared layout: top nav (desktop, berikon), bottom navigation
// (handphone: 4–5 menu utama + Lainnya, sesuai artefak & master prompt),
// footer. Bell notifikasi menampilkan jumlah belum dibaca (tabel
// notifications, migrasi 008); bila tabel belum ada, lonceng tampil tanpa angka.
// Saat belum login: header hanya logo + tombol Masuk (tanpa nav).
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchUnreadCount } from '../lib/supabase'
import Icon, { type IconName } from './icons'
import InstallPrompt from './InstallPrompt'

type Role = 'siswa' | 'mentor' | 'admin'

type NavEntry = {
  to: string
  label: string
  icon: IconName
  end?: boolean
  roles?: Role[]
}

// Menu utama (bottom navigation handphone + bagian depan top nav desktop).
const NAV_MAIN: NavEntry[] = [
  { to: '/', label: 'Beranda', icon: 'home', end: true },
  { to: '/akademi', label: 'Akademi', icon: 'academy' },
  { to: '/proyek', label: 'Proyek', icon: 'project' },
  { to: '/komunitas', label: 'Komunitas', icon: 'community' },
  { to: '/acara', label: 'Acara', icon: 'event' },
]

// Menu lain (lembar "Lainnya" di handphone + lanjutan top nav desktop).
const NAV_MORE: NavEntry[] = [
  { to: '/showcase', label: 'Showcase', icon: 'showcase' },
  { to: '/pustaka', label: 'Pustaka', icon: 'library' },
  { to: '/kompetisi', label: 'Kompetisi', icon: 'trophy' },
  { to: '/rps', label: 'RPS', icon: 'rps' },
  { to: '/pengumuman', label: 'Pengumuman', icon: 'announcement' },
  { to: '/portofolio', label: 'Portofolio', icon: 'portfolio' },
  { to: '/mentors', label: 'Daftar Mentor', icon: 'mentor' },
  { to: '/kru', label: 'Crew Finder', icon: 'crew' },
  { to: '/sekolah', label: 'Sekolah & Klub', icon: 'school' },
  { to: '/nilai', label: 'Nilai Saya', icon: 'grade' },
  { to: '/tenggat', label: 'Tenggat Saya', icon: 'clock' },
  { to: '/ujian', label: 'Ujian', icon: 'exam' },
  { to: '/sertifikat', label: 'Sertifikat', icon: 'certificate' },
  { to: '/notifikasi', label: 'Notifikasi', icon: 'bell' },
  { to: '/profil', label: 'Profil', icon: 'user' },
  { to: '/mentor', label: 'Mentor', icon: 'mentor', roles: ['mentor', 'admin'] },
  { to: '/admin', label: 'Admin', icon: 'admin', roles: ['admin'] },
]

export default function Layout() {
  const { user, profile, signOut, registrationNotice, dismissRegistrationNotice } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [unread, setUnread] = useState<number | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)

  // (Lembar "Lainnya" ditutup lewat onClick di tiap tautan — tanpa effect.)

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

  const role = (profile?.role ?? 'siswa') as Role
  const visible = (e: NavEntry) => !e.roles || e.roles.includes(role)
  const moreEntries = NAV_MORE.filter(visible)
  const allEntries = [...NAV_MAIN, ...moreEntries]

  return (
    <div className={`app-shell${user ? ' has-bottomnav' : ''}`}>
      <header className="topbar">
        <Link to="/" className="brand">
          <img src="./pwa-192x192.png" alt="Logo SINEVERSE" className="brand-logo" />
          <span className="brand-name">SINEVERSE</span>
        </Link>
        {user ? (
          <nav className="topnav" aria-label="Navigasi utama">
            {allEntries.map((e) => (
              <NavLink key={e.to} to={e.to} end={e.end}>
                <Icon name={e.icon} size={17} />
                <span>{e.label}</span>
                {e.to === '/notifikasi' && unread !== null && unread > 0 ? (
                  <span className="nav-badge">{unread}</span>
                ) : null}
              </NavLink>
            ))}
          </nav>
        ) : (
          <NavLink to="/login" className="nav-cta">
            Masuk
          </NavLink>
        )}
      </header>

      {registrationNotice && (
        <div className="notice-box registration-notice" role="status">
          {registrationNotice}{' '}
          <button
            type="button"
            className="link-button"
            onClick={dismissRegistrationNotice}
          >
            Tutup
          </button>
        </div>
      )}

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
        <nav className="footer-nav" aria-label="Tautan footer">
          <Link to="/tentang">Tentang SINEVERSE</Link>
          <Link to="/akademi">Academy</Link>
          <Link to="/komunitas">Community</Link>
          <Link to="/proyek">Film Projects</Link>
          <Link to="/showcase">Showcase &amp; Events</Link>
          <Link to="/privasi">Kebijakan Privasi</Link>
          <Link to="/syarat">Syarat dan Ketentuan</Link>
        </nav>
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

      {user && (
        <nav className="bottomnav" aria-label="Navigasi bawah">
          {NAV_MAIN.map((e) => (
            <NavLink
              key={e.to}
              to={e.to}
              end={e.end}
              className="bottomnav-item"
              onClick={() => setMoreOpen(false)}
            >
              <Icon name={e.icon} size={22} />
              <span>{e.label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            className={`bottomnav-item${moreOpen ? ' active' : ''}`}
            aria-expanded={moreOpen}
            aria-label="Menu lainnya"
            onClick={() => setMoreOpen((v) => !v)}
          >
            <Icon name="more" size={22} />
            <span>Lainnya</span>
          </button>
        </nav>
      )}

      {user && moreOpen && (
        <div
          className="more-sheet-backdrop"
          onClick={() => setMoreOpen(false)}
          aria-hidden="true"
        />
      )}
      {user && moreOpen && (
        <div className="more-sheet" role="dialog" aria-label="Menu lainnya">
          <div className="more-sheet-head">
            <strong>Menu Lainnya</strong>
            <button
              type="button"
              className="more-sheet-close"
              aria-label="Tutup menu"
              onClick={() => setMoreOpen(false)}
            >
              <Icon name="close" size={20} />
            </button>
          </div>
          <div className="more-sheet-grid">
            {moreEntries.map((e) => (
              <NavLink
                key={e.to}
                to={e.to}
                end={e.end}
                className="more-sheet-item"
                onClick={() => setMoreOpen(false)}
              >
                <Icon name={e.icon} size={20} />
                <span>{e.label}</span>
                {e.to === '/notifikasi' && unread !== null && unread > 0 ? (
                  <span className="nav-badge">{unread}</span>
                ) : null}
              </NavLink>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-block" onClick={handleSignOut}>
            Keluar
          </button>
        </div>
      )}
    </div>
  )
}
