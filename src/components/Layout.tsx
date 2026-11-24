// SINEVERSE, shared layout: top nav (desktop), bottom navigation
// (handphone), footer. Menu mengikuti artefak persis (App.tsx navItems):
// 12 menu utama + Penilaian/Workspace (mentor saja) + Admin (admin saja).
// Bottom nav 4 item + Lainnya, berbeda per peran. Notifikasi menjadi lonceng
// di header (bukan menu), Profil dijangkau dari header dan Portofolio.
// Bell menampilkan jumlah belum dibaca (tabel notifications, migrasi 008);
// bila tabel belum ada, lonceng tampil tanpa angka.
// Saat belum login: header hanya logo + tombol Masuk (tanpa nav).
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchCommunities, fetchCourses, fetchLibraryItems, fetchUnreadCount, NOTIFICATIONS_READ_EVENT, subscribeToNotifications } from '../lib/supabase'
import { checkDueReminders } from '../lib/reminders'
import Icon, { type IconName } from './icons'
import InstallPrompt from './InstallPrompt'
import SinebotFab from './SinebotFab'

type Role = 'siswa' | 'mentor' | 'admin'

type NavEntry = {
  to: string
  label: string
  icon: IconName
  end?: boolean
  roles?: Role[]
  // Rute fitur utama: item nav tetap aktif saat pengguna di halaman intro
  // (/x/perkenalan) maupun di halaman fitur (/x, /x/:id).
  activePrefix?: string
}

// Menu utama, sama persis dengan navItems artefak (urutan dan label).
// Keempat fitur menaut ke halaman perkenalan publiknya; halaman fitur
// tetap dijangkau dari tombol di dalam halaman perkenalan itu sendiri.
const NAV_ITEMS: NavEntry[] = [
  { to: '/', label: 'Beranda', icon: 'home', end: true },
  { to: '/akademi/perkenalan', label: 'Akademi', icon: 'academy', activePrefix: '/akademi' },
  { to: '/proyek/perkenalan', label: 'Proyek', icon: 'project', activePrefix: '/proyek' },
  { to: '/proyek-akhir', label: 'Proyek Akhir', icon: 'project' },
  { to: '/kru', label: 'Pencari Kru', icon: 'crew' },
  { to: '/sekolah', label: 'Sekolah', icon: 'school' },
  { to: '/komunitas/perkenalan', label: 'Komunitas', icon: 'community', activePrefix: '/komunitas' },
  { to: '/showcase/perkenalan', label: 'Etalase', icon: 'showcase', activePrefix: '/showcase' },
  { to: '/acara', label: 'Acara', icon: 'event' },
  { to: '/growth', label: 'Pertumbuhan', icon: 'growth' },
  { to: '/pustaka', label: 'Pustaka', icon: 'library' },
  { to: '/mentors', label: 'Mentor', icon: 'mentor' },
  { to: '/portofolio', label: 'Portofolio', icon: 'portfolio' },
  // Menu khusus peran (artefak): Penilaian + Workspace mentor dan admin.
  { to: '/mentor/penilaian', label: 'Penilaian', icon: 'grade', roles: ['mentor', 'admin'] },
  { to: '/mentor', label: 'Ruang Kerja', icon: 'mentor', roles: ['mentor', 'admin'] },
  // Admin hanya admin.
  { to: '/admin', label: 'Admin', icon: 'admin', roles: ['admin'] },
]

// Bottom navigation handphone (artefak): 4 menu utama + Lainnya, per peran.
// Kunci 'to' harus sama persis dengan NAV_ITEMS (kini rute perkenalan).
const BOTTOM_NAV: Record<Role, string[]> = {
  siswa: ['/', '/akademi/perkenalan', '/proyek/perkenalan', '/komunitas/perkenalan'],
  mentor: ['/', '/akademi/perkenalan', '/mentor/penilaian', '/mentor'],
  admin: ['/', '/akademi/perkenalan', '/admin', '/komunitas/perkenalan'],
}

// Pengingat H-1 (Tahap 6): sudah dicek untuk user ini di sesi ini atau belum.
// Set di luar komponen supaya tidak ter-reset saat Layout di-render ulang.
const remindersCheckedFor = new Set<string>()

export default function Layout() {
  const { user, profile, signOut, registrationNotice, dismissRegistrationNotice } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [unread, setUnread] = useState<number | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)

  // K1 tepi kiri: .topnav meluber di desktop — fade kiri hanya muncul
  // saat nav sudah digeser (scrollLeft > 0), fade kanan hilang saat
  // sudah mentok kanan; bila isi muat, tidak ada fade sama sekali.
  const navRef = useRef<HTMLElement | null>(null)
  const [navScrolled, setNavScrolled] = useState(false)
  const [navAtEnd, setNavAtEnd] = useState(false)
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const update = () => {
      setNavScrolled(nav.scrollLeft > 0)
      setNavAtEnd(nav.scrollWidth - nav.clientWidth - nav.scrollLeft <= 1)
    }
    update()
    nav.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(nav)
    window.addEventListener('resize', update)
    return () => {
      nav.removeEventListener('scroll', update)
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [user, profile?.role])

  // K1: gulir item aktif ke tampilan seminimal mungkin (inline 'nearest')
  // — tidak mendorong Beranda keluar layar bila item sudah terlihat.
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const active = nav.querySelector('a.active') as HTMLElement | null
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [location.pathname])

  // (Lembar "Lainnya" ditutup lewat onClick di tiap tautan, tanpa effect.)

  // Lonceng notifikasi: hitung sekali per login, lalu segarkan hanya saat
  // aplikasi kembali ke foreground. Sebelumnya dependensi menyertakan
  // location.pathname, sehingga satu request terkirim di SETIAP pindah menu.
  useEffect(() => {
    if (!user) {
      setUnread(null)
      return
    }
    let cancelled = false
    const refresh = () => {
      fetchUnreadCount(user.id)
        .then((n) => {
          if (!cancelled) setUnread(n)
        })
        .catch(() => {
          if (!cancelled) setUnread(null)
        })
    }
    refresh()
    // Pengingat H-1 (Tahap 6): sekali per login, kirim pengingat tugas,
    // kelas live, dan acara yang jatuh tempo ≤24 jam. Dedup per hari dan
    // preferensi notifikasi dihormati di dalam checkDueReminders.
    // Fire-and-forget, lalu segarkan lonceng supaya pengingat terlihat.
    if (!remindersCheckedFor.has(user.id)) {
      remindersCheckedFor.add(user.id)
      void checkDueReminders(user.id)
        .then(() => refresh())
        .catch(() => undefined)
    }
    const onVisible = () => {
      if (!document.hidden) refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    // Tandai-baca dari halaman Notifikasi menyiarkan event ini — lonceng
    // langsung menyegarkan tanpa menunggu pindah halaman atau foreground.
    const onNotificationsRead = () => refresh()
    window.addEventListener(NOTIFICATIONS_READ_EVENT, onNotificationsRead)
    // Realtime (Notification Center Fase 1, migrasi 075): INSERT notifikasi
    // milik sendiri langsung menyegarkan lonceng tanpa menunggu foreground.
    // Nama channel HARUS beda dari halaman Notifikasi ('notifications-page')
    // — nama sama = channel yang sama, dan menambah handler setelah
    // subscribe() melempar error (blank 24 Nov 2026).
    const unsubscribeNotifications = subscribeToNotifications(
      user.id,
      () => refresh(),
      undefined,
      'notifications-bell',
    )
    // Panaskan cache katalog di latar belakang sekali per login, supaya
    // menu Academy, Library, dan Community langsung tampil tanpa menunggu
    // jaringan saat pertama kali dibuka. Gagal dimuat di sini tidak apa-apa
    // — halaman tujuan akan mengambilnya sendiri.
    void fetchCourses().catch(() => undefined)
    void fetchLibraryItems().catch(() => undefined)
    void fetchCommunities().catch(() => undefined)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(NOTIFICATIONS_READ_EVENT, onNotificationsRead)
      unsubscribeNotifications()
    }
  }, [user])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const role = (profile?.role ?? 'siswa') as Role
  const visible = (e: NavEntry) => !e.roles || e.roles.includes(role)
  // Aktif juga saat di halaman fitur utama (/x, /x/:id), bukan hanya di
  // halaman intro (/x/perkenalan) yang dituju NavLink. Perbandingan memakai
  // batas segmen ('/x' atau '/x/...') supaya '/proyek-akhir' tidak ikut
  // menyalakan item Proyek.
  const isPrefixActive = (e: NavEntry) =>
    !!e.activePrefix &&
    (location.pathname === e.activePrefix ||
      location.pathname.startsWith(`${e.activePrefix}/`))
  const allEntries = NAV_ITEMS.filter(visible)
  const bottomEntries = BOTTOM_NAV[role]
    .map((to) => NAV_ITEMS.find((e) => e.to === to))
    .filter((e): e is NavEntry => !!e && visible(e))

  return (
    <div className={`app-shell${user ? ' has-bottomnav' : ''}`}>
      <header className="topbar">
        <Link to="/" className="brand">
          <img src="./pwa-192x192.png" alt="Logo SINEVERSE" className="brand-logo" />
          <span className="brand-text">
            <span className="brand-name">SINEVERSE</span>
            <span className="brand-tagline">LEARN. CREATE. COLLABORATE.</span>
          </span>
        </Link>
        {user ? (
          <>
            <nav
              ref={navRef}
              className={`topnav${navScrolled ? ' is-scrolled' : ''}${navAtEnd ? ' is-end' : ''}`}
              aria-label="Navigasi utama"
            >
              {allEntries.map((e) => (
                // className fungsi MENGGANTIKAN perilaku 'active' default
                // NavLink — jadi 'active' harus dikembalikan sendiri bila
                // isActive ATAU halaman berada di bawah activePrefix.
                // (.topnav a.active di index.css)
                <NavLink
                  key={e.to}
                  to={e.to}
                  end={e.end}
                  className={({ isActive }) =>
                    isActive || isPrefixActive(e) ? 'active' : ''
                  }
                >
                  <Icon name={e.icon} size={17} />
                  <span>{e.label}</span>
                </NavLink>
              ))}
            </nav>
            <div className="header-actions">
              <Link to="/akademi" className="header-bell" aria-label="Cari kursus">
                <Icon name="search" size={20} />
              </Link>
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
      <SinebotFab />

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
              // (.bottomnav-item.active di index.css; className fungsi
              // menggantikan perilaku 'active' default NavLink.)
              className={({ isActive }) =>
                `bottomnav-item${isActive || isPrefixActive(e) ? ' active' : ''}`
              }
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
                // (.more-sheet-item.active di index.css; className fungsi
                // menggantikan perilaku 'active' default NavLink.)
                className={({ isActive }) =>
                  `more-sheet-item${isActive || isPrefixActive(e) ? ' active' : ''}`
                }
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
                <Icon name="info" size={20} />
                <span>Tentang</span>
              </NavLink>
              <NavLink to="/privasi" className="more-sheet-item" onClick={() => setMoreOpen(false)}>
                <Icon name="shield" size={20} />
                <span>Privasi</span>
              </NavLink>
              <NavLink to="/syarat" className="more-sheet-item" onClick={() => setMoreOpen(false)}>
                <Icon name="fileText" size={20} />
                <span>Syarat</span>
              </NavLink>
              <NavLink to="/bantuan" className="more-sheet-item" onClick={() => setMoreOpen(false)}>
                <Icon name="message" size={20} />
                <span>Bantuan &amp; FAQ</span>
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
