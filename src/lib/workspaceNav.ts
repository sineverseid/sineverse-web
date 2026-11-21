// SINEVERSE — daftar menu workspace per role (dipakai WorkspaceNav).
// Dipisah dari komponen agar tidak memicu peringatan fast-refresh.
import type { IconName } from '../components/icons'

export interface WorkspaceNavEntry {
  to: string
  label: string
  icon: IconName
  end?: boolean
}

// Menu Mentor Workspace (master prompt §09): Overview, Course Saya,
// Course Builder, Antrean Penilaian, Diskusi, Siswa, Office Hours, Analitik, RPS.
export const MENTOR_NAV: WorkspaceNavEntry[] = [
  { to: '/mentor', label: 'Overview', icon: 'mentor', end: true },
  { to: '/mentor/siswa', label: 'Siswa', icon: 'user' },
  { to: '/mentor/penilaian', label: 'Penilaian', icon: 'grade' },
  { to: '/mentor/diskusi', label: 'Diskusi', icon: 'message' },
  { to: '/mentor/analitik', label: 'Analitik', icon: 'chart' },
  { to: '/jam-kantor', label: 'Office Hours', icon: 'clock' },
  { to: '/admin/diskusi-mentor', label: 'Diskusi Admin', icon: 'message' },
  { to: '/rps', label: 'RPS', icon: 'rps' },
]

// Menu Admin Panel (master prompt §04): Dashboard, Pengguna, Acara &
// Festival, Pustaka, Moderasi, Diskusi Mentor, Editor RPS, Pengaturan.
export const ADMIN_NAV: WorkspaceNavEntry[] = [
  { to: '/admin', label: 'Dashboard', icon: 'admin', end: true },
  { to: '/admin/pengguna', label: 'Pengguna', icon: 'community' },
  { to: '/admin/acara', label: 'Acara & Festival', icon: 'event' },
  { to: '/admin/pustaka', label: 'Pustaka', icon: 'library' },
  { to: '/admin/moderasi', label: 'Moderasi', icon: 'admin' },
  { to: '/admin/diskusi-mentor', label: 'Diskusi Mentor', icon: 'message' },
  { to: '/admin/rps', label: 'Editor RPS', icon: 'rps' },
  { to: '/admin/pengaturan', label: 'Pengaturan', icon: 'settings' },
]
