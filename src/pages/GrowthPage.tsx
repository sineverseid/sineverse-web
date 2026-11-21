// SINEVERSE — Growth (sama seperti artefak, GrowthView): 4 tab —
// Rekomendasi, Kolaborasi Lanjutan, Integrasi, PWA & Kesiapan.
// Semua isi dihitung dari data Supabase yang sebenarnya atau status
// perangkat yang sebenarnya; tidak ada data karangan. Bila tidak ada
// data, tampilkan empty state yang jujur.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { BRAND } from '../lib/brand'
import { scoreCourses } from '../lib/recommendations'
import { appBaseUrl, fetchCourses, fetchEnrollments, supabase } from '../lib/supabase'
import type { Course, Project, School } from '../lib/types'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

type GrowthTab = 'rekomendasi' | 'kolaborasi' | 'integrasi' | 'pwa'

const TABS: { id: GrowthTab; label: string }[] = [
  { id: 'rekomendasi', label: 'Rekomendasi' },
  { id: 'kolaborasi', label: 'Kolaborasi Lanjutan' },
  { id: 'integrasi', label: 'Integrasi' },
  { id: 'pwa', label: 'PWA & Kesiapan' },
]

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export default function GrowthPage() {
  const { user, profile } = useAuth()
  const [tab, setTab] = useState<GrowthTab>('rekomendasi')
  const [courses, setCourses] = useState<Course[]>([])
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set())
  const [projects, setProjects] = useState<Project[]>([])
  const [myProjectIds, setMyProjectIds] = useState<Set<string>>(new Set())
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // PWA & kesiapan (status perangkat + file aplikasi, dicek langsung).
  const [standalone] = useState(() => isStandalone())
  const [swActive, setSwActive] = useState<boolean | null>(() =>
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? null : false,
  )
  const [manifestOk, setManifestOk] = useState<boolean | null>(null)
  const [offlineOk, setOfflineOk] = useState<boolean | null>(null)
  const [installReady, setInstallReady] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<(Event & { prompt: () => Promise<void> }) | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [courseList, projectRes, schoolRes] = await Promise.all([
          fetchCourses(),
          supabase.from('projects').select('*').order('created_at', { ascending: false }),
          supabase.from('schools').select('*').order('name'),
        ])
        if (cancelled) return
        setCourses(courseList)
        setProjects(((projectRes.data ?? []) as Project[]))
        setSchools(((schoolRes.data ?? []) as School[]))
        if (user) {
          const [enr, mem] = await Promise.all([
            fetchEnrollments(user.id),
            supabase.from('project_members').select('project_id').eq('user_id', user.id),
          ])
          if (cancelled) return
          setEnrolledIds(new Set(enr.map((e) => e.course_id)))
          setMyProjectIds(new Set(((mem.data ?? []) as { project_id: string }[]).map((m) => m.project_id)))
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat data Growth.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user])

  // Cek kesiapan PWA (hanya di browser).
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((reg) => setSwActive(!!reg.active))
        .catch(() => setSwActive(false))
    }
    const base = appBaseUrl()
    void fetch(`${base}manifest.webmanifest`, { method: 'GET' })
      .then((r) => setManifestOk(r.ok))
      .catch(() => setManifestOk(false))
    void fetch(`${base}offline.html`, { method: 'GET' })
      .then((r) => setOfflineOk(r.ok))
      .catch(() => setOfflineOk(false))
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as Event & { prompt: () => Promise<void> })
      setInstallReady(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Rekomendasi course — satu logika skor dengan Beranda siswa
  // (lihat src/lib/recommendations.ts). Alasan dan urutannya sama seperti
  // sebelumnya; Growth tidak menampilkan angka skornya.
  const recommendations = useMemo(
    () =>
      scoreCourses(
        courses,
        enrolledIds,
        (profile?.interests ?? []).map((s) => s.toLowerCase()).filter(Boolean),
      ).slice(0, 6),
    [courses, enrolledIds, profile?.interests],
  )

  const openProjects = useMemo(
    () => projects.filter((p) => p.access_mode === 'open' && !myProjectIds.has(p.id)).slice(0, 4),
    [projects, myProjectIds],
  )

  const crossSchoolProjects = useMemo(
    () => projects.filter((p) => p.school_id),
    [projects],
  )

  const schoolName = (id: string | null) => schools.find((s) => s.id === id)?.name ?? 'Sekolah'

  if (loading) return <div className="page"><p className="muted">Memuat Growth…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>

  return (
    <div className="page">
      <PageHeader
        icon="growth"
        title="Growth"
        subtitle="Rekomendasi belajar, kolaborasi lintas sekolah, integrasi, dan kesiapan aplikasi."
      />

      <div className="about-tabs" role="tablist" aria-label="Tab Growth">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`about-tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'rekomendasi' && (
        <div>
          {!user && (
            <p className="notice-box">
              <Link to="/login">Masuk</Link> untuk rekomendasi yang disesuaikan dengan minat dan
              course yang sudah kamu ambil. Di bawah ini jalur belajar Semester 1.
            </p>
          )}
          <section className="section">
            <h2>Course yang Direkomendasikan</h2>
            {recommendations.length === 0 ? (
              <EmptyState message="Kamu sudah mengambil semua course yang tersedia." />
            ) : (
              <ul className="course-list">
                {recommendations.map((r) => (
                  <li key={r.course.id} className="course-card">
                    <Link to={`/course/${r.course.id}`}>
                      <h3>{r.course.title}</h3>
                      <p>{r.course.description ?? ''}</p>
                      <p className="muted">{r.reason}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="section">
            <h2>Proyek Terbuka untuk Diikuti</h2>
            {openProjects.length === 0 ? (
              <p className="empty">
                {user
                  ? 'Tidak ada proyek terbuka yang belum kamu ikuti saat ini.'
                  : 'Masuk untuk melihat proyek terbuka yang bisa kamu ikuti.'}
              </p>
            ) : (
              <ul className="course-list">
                {openProjects.map((p) => (
                  <li key={p.id} className="course-card">
                    <Link to={`/proyek/${p.id}`}>
                      <h3>{p.title}</h3>
                      <p>{p.description ?? ''}</p>
                      <p className="muted">Proyek terbuka — bisa langsung bergabung.</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === 'kolaborasi' && (
        <div>
          <section className="section">
            <h2>Proyek Lintas Sekolah</h2>
            <p className="muted">
              Proyek yang terafiliasi dengan sekolah — kolaborasi antar sekolah dan klub film.
            </p>
            {crossSchoolProjects.length === 0 ? (
              <EmptyState message="Belum ada proyek lintas sekolah. Proyek yang dibuat dengan afiliasi sekolah akan tampil di sini." />
            ) : (
              <ul className="course-list">
                {crossSchoolProjects.map((p) => (
                  <li key={p.id} className="course-card">
                    <Link to={`/proyek/${p.id}`}>
                      <h3>{p.title}</h3>
                      <p>{p.description ?? ''}</p>
                      <p className="muted">Sekolah: {schoolName(p.school_id)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="section">
            <h2>Sekolah &amp; Klub Terdaftar</h2>
            {schools.length === 0 ? (
              <p className="empty">Belum ada sekolah yang terdaftar.</p>
            ) : (
              <ul>
                {schools.map((s) => (
                  <li key={s.id}>
                    <Link to="/sekolah">{s.name}</Link>
                    {s.city ? ` — ${s.city}` : ''}
                    {s.is_verified ? ' · Terverifikasi' : ''}
                  </li>
                ))}
              </ul>
            )}
            <p>
              <Link to="/kru" className="btn btn-primary">Cari Kru untuk Kolaborasi →</Link>{' '}
              <Link to="/proyek" className="btn btn-secondary">Lihat Semua Proyek</Link>
            </p>
          </section>
        </div>
      )}

      {tab === 'integrasi' && (
        <div>
          <section className="section">
            <h2>Integrasi yang Terhubung</h2>
            <ul className="discussion-list">
              <li className="discussion-item">
                <h3>Supabase — Database, Auth &amp; Storage</h3>
                <p className="muted">Terhubung. Semua data SINEVERSE (course, proyek, komunitas, sertifikat) tersimpan di Supabase.</p>
              </li>
              <li className="discussion-item">
                <h3>GitHub Pages — Hosting</h3>
                <p className="muted">Terhubung. Situs ini ditayangkan dari GitHub Pages.</p>
              </li>
              <li className="discussion-item">
                <h3>Email (SMTP Gmail) — Email Konfirmasi</h3>
                <p className="muted">Terhubung. Email konfirmasi pendaftaran dikirim lewat SMTP Gmail akun SINEVERSE.</p>
              </li>
            </ul>
          </section>
          <section className="section">
            <h2>Belum Dikonfigurasi</h2>
            <ul className="discussion-list">
              <li className="discussion-item">
                <h3>Pembayaran</h3>
                <p className="muted">Belum dikonfigurasi — SINEVERSE saat ini gratis, tidak ada pembayaran di aplikasi.</p>
              </li>
              <li className="discussion-item">
                <h3>Analitik Pihak Ketiga</h3>
                <p className="muted">Belum dikonfigurasi — tidak ada pelacak analitik eksternal.</p>
              </li>
              <li className="discussion-item">
                <h3>Login Google / Media Sosial</h3>
                <p className="muted">Belum dikonfigurasi — masuk hanya memakai email dan kata sandi.</p>
              </li>
            </ul>
            <p className="muted">Belum ada integrasi lain yang dikonfigurasi di SINEVERSE.</p>
          </section>
        </div>
      )}

      {tab === 'pwa' && (
        <div>
          <section className="section">
            <h2>PWA &amp; Kesiapan Aplikasi</h2>
            <p className="muted">
              Status aplikasi sebagai Progressive Web App di perangkat ini, dicek langsung dari
              browser kamu. Versi aplikasi: {BRAND.version} · diperbarui {BRAND.versionUpdated}.
            </p>
            <ul className="discussion-list">
              <li className="discussion-item">
                <h3>Terpasang di Perangkat</h3>
                <p className="muted">
                  {standalone
                    ? 'Ya — aplikasi sedang berjalan sebagai aplikasi terpasang (mode standalone).'
                    : 'Belum — aplikasi sedang dibuka lewat browser.'}
                </p>
              </li>
              <li className="discussion-item">
                <h3>Service Worker</h3>
                <p className="muted">
                  {swActive === null
                    ? 'Memeriksa…'
                    : swActive
                      ? 'Aktif — service worker mengendalikan halaman ini (dukungan offline).'
                      : 'Tidak aktif — service worker belum mengendalikan halaman ini.'}
                </p>
              </li>
              <li className="discussion-item">
                <h3>Manifest Aplikasi</h3>
                <p className="muted">
                  {manifestOk === null
                    ? 'Memeriksa…'
                    : manifestOk
                      ? 'Ditemukan — manifest PWA tersedia.'
                      : 'Tidak ditemukan — manifest PWA tidak termuat.'}
                </p>
              </li>
              <li className="discussion-item">
                <h3>Halaman Offline</h3>
                <p className="muted">
                  {offlineOk === null
                    ? 'Memeriksa…'
                    : offlineOk
                      ? 'Tersedia — halaman offline siap ditampilkan saat tidak ada koneksi.'
                      : 'Tidak tersedia — halaman offline tidak termuat.'}
                </p>
              </li>
              <li className="discussion-item">
                <h3>Siap Dipasang</h3>
                <p className="muted">
                  {standalone
                    ? 'Aplikasi sudah terpasang di perangkat ini.'
                    : installReady
                      ? 'Siap dipasang — browser menawarkan pemasangan aplikasi.'
                      : 'Browser belum menawarkan pemasangan di sesi ini (mis. sudah pernah ditolak, atau tidak didukung).'}
                </p>
                {!standalone && deferredPrompt && (
                  <button
                    type="button"
                    className="btn btn-primary btn-small"
                    onClick={() => void deferredPrompt.prompt()}
                  >
                    Pasang Aplikasi
                  </button>
                )}
              </li>
            </ul>
          </section>
        </div>
      )}
    </div>
  )
}
