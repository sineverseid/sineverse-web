// SINEVERSE — Admin Panel: Pengaturan.
// Pengaturan sistem (master prompt §04: System Settings). Menampilkan
// identitas platform, versi aplikasi, dan tautan ke area pengelolaan.
// Tidak ada pengaturan yang mengubah perilaku auth/database dari client.
import { Link } from 'react-router-dom'
import { BRAND } from '../lib/brand'
import PageHeader from '../components/PageHeader'
import WorkspaceNav from '../components/WorkspaceNav'
import { ADMIN_NAV } from '../lib/workspaceNav'

export default function AdminSettingsPage() {
  return (
    <div className="page">
      <PageHeader
        icon="settings"
        title="Pengaturan Sistem"
        subtitle="Identitas platform dan tautan pengelolaan. Pengaturan sensitif (auth, database) hanya diubah lewat dashboard Supabase."
      />
      <WorkspaceNav entries={ADMIN_NAV} />

      <section className="section">
        <h2>Identitas Platform</h2>
        <dl className="profile-list">
          <div>
            <dt>Nama</dt>
            <dd>SINEVERSE</dd>
          </div>
          <div>
            <dt>Tagline</dt>
            <dd>Your World of Filmmaking</dd>
          </div>
          <div>
            <dt>Slogan</dt>
            <dd>{BRAND.slogan}</dd>
          </div>
          <div>
            <dt>Versi aplikasi</dt>
            <dd>{BRAND.version}</dd>
          </div>
          <div>
            <dt>Email pengelola</dt>
            <dd>sineverse.id@gmail.com</dd>
          </div>
        </dl>
      </section>

      <section className="section">
        <h2>Area Pengelolaan</h2>
        <ul>
          <li>
            <Link to="/admin">Dashboard Admin</Link> — ringkasan pengguna, lamaran mentor, klaim mengampu.
          </li>
          <li>
            <Link to="/admin/pengguna">Pengguna</Link> — daftar semua akun per role.
          </li>
          <li>
            <Link to="/admin/rps">Editor RPS</Link> — ubah RPS Semester 1 (bobot penilaian, passing grade).
          </li>
          <li>
            <Link to="/admin/moderasi">Moderasi &amp; Audit Log</Link> — laporan diskusi dan jejak audit.
          </li>
          <li>
            <Link to="/admin/acara">Acara &amp; Festival</Link> — kelola acara dan kompetisi.
          </li>
          <li>
            <Link to="/admin/pustaka">Kelola Pustaka</Link> — tambah/hapus item Pustaka.
          </li>
          <li>
            <Link to="/admin/diskusi-mentor">Diskusi Admin ↔ Mentor</Link> — thread dengan mentor.
          </li>
        </ul>
      </section>

      <section className="section">
        <h2>Pengaturan Academy</h2>
        <ul>
          <li>
            <Link to="/admin/rps">Editor RPS</Link> — bobot penilaian dan passing grade (RPS SVS-SEM1).
          </li>
          <li>
            <Link to="/admin/sections">Sections &amp; Lesson</Link> — kelola section dan lesson tiap course.
          </li>
          <li>
            <Link to="/admin/enrollment">Enrollment</Link> — kelola pendaftaran siswa ke course.
          </li>
          <li>
            <Link to="/admin/tugas">Tugas</Link> — kelola tugas dan penilaiannya.
          </li>
          <li>
            <Link to="/admin/kuis">Kuis</Link> — kelola kuis, pretest, dan posttest.
          </li>
          <li>
            <Link to="/admin/sertifikat">Sertifikat</Link> — kelola penerbitan sertifikat course.
          </li>
          <li>
            <Link to="/admin/materi">Materi</Link> — kelola materi tambahan tiap lesson.
          </li>
          <li>
            <Link to="/admin/analitik">Analytics &amp; Reports</Link> — laporan per course dan ringkasan platform.
          </li>
        </ul>
        <p className="muted">
          Tidak ada pengaturan Academy lain yang bisa diubah dari aplikasi — default akses course
          (direct/sequential) diatur per course di Course Builder; bobot + passing grade di Editor RPS.
        </p>
      </section>

      <section className="section">
        <h2>Catatan Keamanan</h2>
        <p className="muted">
          Hak akses ditegakkan di database (RLS), bukan hanya di tampilan. Peran mentor diubah
          otomatis oleh trigger saat lamaran disetujui — admin tidak mengubah role langsung dari
          aplikasi. Kata sandi pengguna tidak pernah ditampilkan atau disimpan sebagai teks biasa.
        </p>
      </section>
    </div>
  )
}
