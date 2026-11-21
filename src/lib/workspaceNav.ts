// SINEVERSE — daftar menu workspace per role (dipakai WorkspaceNav).
// Dipisah dari komponen agar tidak memicu peringatan fast-refresh.
import type { IconName } from '../components/icons'

export interface WorkspaceNavEntry {
  to: string
  label: string
  icon: IconName
  end?: boolean
}

// Menu Mentor Workspace — sama seperti artefak: 2 tab, Overview dan
// Course Builder. Penilaian kini menu utama (nav atas/bawah, mentor saja),
// bukan tab workspace; RPS dibaca dari tautan di halaman Overview, dan
// Siswa/Diskusi/Analitik/Office Hours dijangkau dari kartu di Overview.
export const MENTOR_NAV: WorkspaceNavEntry[] = [
  { to: '/mentor', label: 'Overview', icon: 'mentor', end: true },
  { to: '/mentor/course-builder', label: 'Course Builder', icon: 'academy' },
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
