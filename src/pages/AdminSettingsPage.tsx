// SINEVERSE — Admin Panel: Pengaturan.
// Pengaturan sistem (master prompt §04: System Settings). Menampilkan
// identitas platform, versi aplikasi, dan tautan ke area pengelolaan.
// Tidak ada pengaturan yang mengubah perilaku auth/database dari client.
// Tidak ada fungsi backup data, jadi tidak ada item Backup Data.
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Icon from '../components/icons'
import type { IconName } from '../components/icons'
import { BRAND } from '../lib/brand'
import PageHeader from '../components/PageHeader'
import WorkspaceNav from '../components/WorkspaceNav'
import { ADMIN_NAV } from '../lib/workspaceNav'

function SettingsLink({ to, icon, label, sub }: { to: string; icon: IconName; label: string; sub?: string }) {
  return (
    <li>
      <Link to={to} className="profile-menu-item">
        <span className="profile-menu-icon"><Icon name={icon} /></span>
        <span>
          {label}
          {sub && <span className="muted" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 400 }}>{sub}</span>}
        </span>
        <span className="chev"><Icon name="chevronRight" /></span>
      </Link>
    </li>
  )
}

export default function AdminSettingsPage() {
  const { signOut, profile } = useAuth()
  // P73: penjaga peran di dalam halaman (pola yang sama seperti halaman
  // admin lain) — jangan hanya mengandalkan RoleRoute di App.tsx.
  if (profile?.role !== 'admin') {
    return (
      <div className="page">
        <h1>Pengaturan Sistem</h1>
        <p className="empty">Halaman ini hanya untuk admin.</p>
      </div>
    )
  }
  return (
    <div className="page">
      <PageHeader
        icon="settings"
        title="Pengaturan Sistem"
        subtitle="Identitas platform dan tautan pengelolaan. Pengaturan sensitif (auth, database) hanya diubah lewat dashboard Supabase."
      />
      <WorkspaceNav entries={ADMIN_NAV} />

      <section className="section">
        <div className="dash-section-head"><h2>Pengaturan</h2></div>
        <ul className="profile-menu">
          <li className="profile-menu-item">
            <span className="profile-menu-icon"><Icon name="info" /></span>
            <span>
              Informasi Aplikasi
              <span className="muted" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 400 }}>
                SINEVERSE · Versi {BRAND.version} · sineverse.id@gmail.com
              </span>
            </span>
            {/* LC12: chevron seperti semua baris saudaranya. */}
            <span className="chev"><Icon name="chevronRight" /></span>
          </li>
          <SettingsLink to="/notifikasi/pengaturan" icon="bell" label="Notifikasi" sub="Atur notifikasi aplikasi" />
          <SettingsLink to="/profil" icon="shield" label="Keamanan" sub="Ubah kata sandi di Profil" />
          <SettingsLink to="/tentang" icon="info" label="Tentang SINEVERSE" sub="Tentang platform SINEVERSE" />
          <li>
            <button type="button" className="profile-menu-item danger" onClick={() => void signOut()}>
              <span className="profile-menu-icon"><Icon name="logout" /></span>
              Keluar
            </button>
          </li>
        </ul>
      </section>

      <section className="section">
        <div className="dash-section-head"><h2>Area Pengelolaan</h2></div>
        <ul className="profile-menu">
          <SettingsLink to="/admin" icon="admin" label="Dashboard Admin" sub="Ringkasan pengguna, lamaran mentor, klaim mengampu" />
          <SettingsLink to="/admin/pengguna" icon="community" label="Pengguna" sub="Daftar semua akun per role" />
          <SettingsLink to="/admin/rps" icon="rps" label="Editor RPS" sub="Ubah RPS Semester 1 (bobot penilaian, passing grade)" />
          <SettingsLink to="/admin/moderasi" icon="admin" label="Moderasi dan Audit Log" sub="Laporan diskusi dan jejak audit" />
          <SettingsLink to="/admin/acara" icon="event" label="Acara dan Festival" sub="Kelola acara dan kompetisi" />
          <SettingsLink to="/admin/pustaka" icon="library" label="Kelola Pustaka" sub="Tambah dan hapus item Pustaka" />
        </ul>
      </section>

      <section className="section">
        <div className="dash-section-head"><h2>Pengaturan Academy</h2></div>
        <ul className="profile-menu">
          <SettingsLink to="/admin/rps" icon="rps" label="Editor RPS" sub="Bobot penilaian dan passing grade (RPS SVS-SEM1)" />
          <SettingsLink to="/admin/sections" icon="academy" label="Sections dan Lesson" sub="Kelola section dan lesson tiap course" />
          <SettingsLink to="/admin/enrollment" icon="user" label="Enrollment" sub="Kelola pendaftaran siswa ke course" />
          <SettingsLink to="/admin/tugas" icon="fileText" label="Tugas" sub="Kelola tugas dan penilaiannya" />
          <SettingsLink to="/admin/kuis" icon="exam" label="Kuis" sub="Kelola kuis, pretest, dan posttest" />
          <SettingsLink to="/admin/sertifikat" icon="certificate" label="Sertifikat" sub="Kelola penerbitan sertifikat course" />
          <SettingsLink to="/admin/materi" icon="book" label="Materi" sub="Kelola materi tambahan tiap lesson" />
          <SettingsLink to="/admin/analitik" icon="chart" label="Analytics dan Reports" sub="Laporan per course dan ringkasan platform" />
        </ul>
        <p className="muted">
          Tidak ada pengaturan Academy lain yang bisa diubah dari aplikasi. Default akses course
          (direct/sequential) diatur per course di Course Builder; bobot + passing grade di Editor RPS.
        </p>
      </section>

      <section className="section">
        <div className="dash-section-head"><h2>Catatan Keamanan</h2></div>
        <p className="muted">
          Hak akses ditegakkan di database (RLS), bukan hanya di tampilan. Peran mentor diubah
          otomatis oleh trigger saat lamaran disetujui. Admin tidak mengubah role langsung dari
          aplikasi. Kata sandi pengguna tidak pernah ditampilkan atau disimpan sebagai teks biasa.
        </p>
      </section>
    </div>
  )
}
