// SINEVERSE, shared layout: top nav (desktop), bottom navigation
// (handphone), footer. Menu mengikuti artefak persis (App.tsx navItems):
// 12 menu utama + Penilaian/Workspace (mentor saja) + Admin (admin saja).
// Bottom nav 4 item + Lainnya, berbeda per peran. Notifikasi menjadi lonceng
// di header (bukan menu), Profil dijangkau dari header dan Portofolio.
// Bell menampilkan jumlah belum dibaca (tabel notifications, migrasi 008);
// bila tabel belum ada, lonceng tampil tanpa angka.
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

// Menu utama, sama persis dengan navItems artefak (urutan dan label).
const NAV_ITEMS: NavEntry[] = [
  { to: '/', label: 'Beranda', icon: 'home', end: true },
  { to: '/akademi', label: 'Academy', icon: 'academy' },
  { to: '/proyek', label: 'Projects', icon: 'project' },
  { to: '/kru', label: 'Crew Finder', icon: 'crew' },
  { to: '/sekolah', label: 'Sekolah', icon: 'school' },
  { to: '/komunitas', label: 'Community', icon: 'community' },
  { to: '/showcase', label: 'Showcase', icon: 'showcase' },
  { to: '/acara', label: 'Events', icon: 'event' },
  { to: '/growth', label: 'Growth', icon: 'growth' },
  { to: '/pustaka', label: 'Library', icon: 'library' },
  { to: '/mentors', label: 'Mentors', icon: 'mentor' },
  { to: '/portofolio', label: 'Portofolio', icon: 'portfolio' },
  // Menu khusus peran (artefak): Penilaian + Workspace mentor dan admin.
  { to: '/mentor/penilaian', label: 'Penilaian', icon: 'grade', roles: ['mentor', 'admin'] },
  { to: '/mentor', label: 'Workspace', icon: 'mentor', roles: ['mentor', 'admin'] },
  // Admin hanya admin.
  { to: '/admin', label: 'Admin', icon: 'admin', roles: ['admin'] },
]

// Bottom navigation handphone (artefak): 4 menu utama + Lainnya, per peran.
const BOTTOM_NAV: Record<Role, string[]> = {
  siswa: ['/', '/akademi', '/proyek', '/komunitas'],
  mentor: ['/', '/akademi', '/mentor/penilaian', '/mentor'],
  admin: ['/', '/akademi', '/admin', '/komunitas'],
}

export default function Layout() {
  const { user, profile, signOut, registrationNotice, dismissRegistrationNotice } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [unread, setUnread] = useState<number | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)

  // (Lembar "Lainnya" ditutup lewat onClick di tiap tautan, tanpa effect.)

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
  const allEntries = NAV_ITEMS.filter(visible)
  const bottomEntries = BOTTOM_NAV[role]
    .map((to) => NAV_ITEMS.find((e) => e.to === to))
    .filter((e): e is NavEntry => !!e && visible(e))

  return (
    <div className={`app-shell${user ? ' has-bottomnav' : ''}`}>
      <header className="topbar">
        <Link to="/" className="brand">
          <img src="./pwa-192x192.png" alt="Logo SINEVERSE" className="brand-logo" />
          <span className="brand-name">SINEVERSE</span>
        </Link>
        {user ? (
          <>
            <nav className="topnav" aria-label="Navigasi utama">
              {allEntries.map((e) => (
                <NavLink key={e.to} to={e.to} end={e.end}>
                  <Icon name={e.icon} size={17} />
                  <span>{e.label}</span>
                </NavLink>
              ))}
            </nav>
            <div className="header-actions">
              <Link to="/notifikasi" className="header-bell" aria-label="Notifikasi">
                <Icon name="bell" size={20} />
                {unread !== null && unread > 0 ? (
                  <span className="nav-badge">{unread}</span>
                ) : null}
              </Link>
              <Link to="/profil" className="header-profile" aria-label="Profil saya">
                {profile?.photo_url ? (
                  <img src={profile.photo_url} alt="" className="header-avatar" />
                ) : (
                  <Icon name="user" size={20} />
                )}
                <span className="header-profile-name">{profile?.name ?? 'Profil'}</span>
              </Link>
              <button
                type="button"
                className="header-logout"
                aria-label="Keluar"
                title="Keluar"
                onClick={handleSignOut}
              >
                <Icon name="logout" size={20} />
              </button>
            </div>
          </>
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
        <p className="footer-sub">© SINEVERSE 2026</p>
      </footer>

      {user && (
        <nav className="bottomnav" aria-label="Navigasi bawah">
          {bottomEntries.map((e) => (
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
            {allEntries.map((e) => (
              <NavLink
                key={e.to}
                to={e.to}
                end={e.end}
                className="more-sheet-item"
                onClick={() => setMoreOpen(false)}
              >
                <Icon name={e.icon} size={20} />
                <span>{e.label}</span>
              </NavLink>
            ))}
          </div>
          <div className="more-sheet-section">
            <strong className="more-sheet-section-title">Tentang &amp; Ketentuan</strong>
            <div className="more-sheet-grid">
              <NavLink to="/tentang" className="more-sheet-item" onClick={() => setMoreOpen(false)}>
                <Icon name="book" size={20} />
                <span>Tentang</span>
              </NavLink>
              <NavLink to="/privasi" className="more-sheet-item" onClick={() => setMoreOpen(false)}>
                <Icon name="book" size={20} />
                <span>Privasi</span>
              </NavLink>
              <NavLink to="/syarat" className="more-sheet-item" onClick={() => setMoreOpen(false)}>
                <Icon name="book" size={20} />
                <span>Syarat</span>
              </NavLink>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-block" onClick={handleSignOut}>
            Keluar
          </button>
        </div>
      )}
    </div>
  )
}
