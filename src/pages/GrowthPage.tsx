// SINEVERSE, Growth (sama seperti artefak, GrowthView): 4 tab —
// Rekomendasi, Kolaborasi Lanjutan, Integrasi, PWA & Kesiapan.
// Tab Integrasi bersifat privat: hanya admin yang melihatnya
// (siswa dan mentor tidak melihat tab itu sama sekali).
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
  // Tab Integrasi bersifat privat: hanya admin yang melihatnya.
  const isAdmin = profile?.role === 'admin'
  const [tab, setTab] = useState<GrowthTab>('rekomendasi')
  const [courses, setCourses] = useState<Course[]>([])
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set())
  const [projects, setProjects] = useState<Project[]>([])
  const [myProjectIds, setMyProjectIds] = useState<Set<string>>(new Set())
  // Sekolah: TIDAK lagi memuat seluruh 26 ribu sekolah — daftar panjang
  // itu tidak relevan bagi siswa. Yang dimuat: jumlah total +
  // terverifikasi, sekolah siswa sendiri, nama sekolah untuk proyek
  // lintas sekolah, dan hasil pencarian (maks 20) saat siswa mengetik.
  const [schoolCounts, setSchoolCounts] = useState<{ total: number; verified: number } | null>(null)
  const [schoolError, setSchoolError] = useState(false)
  const [mySchool, setMySchool] = useState<School | null>(null)
  const [projectSchoolNames, setProjectSchoolNames] = useState<Map<string, string>>(new Map())
  const [schoolQuery, setSchoolQuery] = useState('')
  const [schoolResults, setSchoolResults] = useState<School[] | null>(null)
  const [schoolSearching, setSchoolSearching] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [coursesError, setCoursesError] = useState(false)
  const [collabError, setCollabError] = useState(false)

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
        // Semua sumber independen (course, proyek, hitungan sekolah,
        // sekolah saya, enrollment saya, keanggotaan proyek saya) — satu
        // Promise.all, bukan dua tahap berurutan.
        const [courseList, projectRes, schoolTotalRes, schoolVerifiedRes, mySchoolRes, enr, mem] = await Promise.all([
          fetchCourses().catch(() => {
            setCoursesError(true)
            return [] as Course[]
          }),
          supabase.from('projects').select('*').order('created_at', { ascending: false }),
          supabase.from('schools').select('id', { count: 'exact', head: true }),
          supabase.from('schools').select('id', { count: 'exact', head: true }).eq('is_verified', true),
          profile?.school_id
            ? supabase.from('schools').select('*').eq('id', profile.school_id).maybeSingle()
            : Promise.resolve({ data: null as School | null }),
          user ? fetchEnrollments(user.id) : Promise.resolve([]),
          user
            ? supabase.from('project_members').select('project_id').eq('user_id', user.id)
            : Promise.resolve({ data: [] } as { data: [] }),
        ])
        if (cancelled) return
        if (projectRes.error) setCollabError(true)
        if (schoolTotalRes.error || schoolVerifiedRes.error) setSchoolError(true)
        setCourses(courseList)
        setProjects(((projectRes.data ?? []) as Project[]))
        setSchoolCounts({
          total: schoolTotalRes.count ?? 0,
          verified: schoolVerifiedRes.count ?? 0,
        })
        if (mySchoolRes.data) setMySchool(mySchoolRes.data as School)
        // Nama sekolah hanya untuk proyek lintas sekolah (bukan seluruh daftar).
        const projSchoolIds = [
          ...new Set(
            ((projectRes.data ?? []) as Project[])
              .map((p) => p.school_id)
              .filter((id): id is string => !!id),
          ),
        ]
        if (projSchoolIds.length > 0) {
          const { data: psNames } = await supabase
            .from('schools')
            .select('id,name')
            .in('id', projSchoolIds)
          if (!cancelled && psNames) {
            setProjectSchoolNames(
              new Map((psNames as { id: string; name: string }[]).map((s) => [s.id, s.name])),
            )
          }
        }
        if (user) {
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
  }, [user, profile?.school_id])

  // Pencarian sekolah (nama atau NPSN), maks 20 hasil — jalan saat siswa
  // mengetik (debounce 300 ms). Tanpa pencarian, tidak ada daftar yang
  // dimuat sama sekali.
  useEffect(() => {
    const q = schoolQuery.trim()
    if (q.length < 2) {
      setSchoolResults(null)
      setSchoolSearching(false)
      return
    }
    setSchoolSearching(true)
    const safe = q.replace(/[%(),]/g, '')
    const t = setTimeout(() => {
      void supabase
        .from('schools')
        .select('id,name,city,is_verified,npsn')
        .or(`name.ilike.%${safe}%,npsn.eq.${q}`)
        .order('name')
        .limit(20)
        .then(({ data }) => {
          setSchoolResults((data ?? []) as School[])
          setSchoolSearching(false)
        })
    }, 300)
    return () => clearTimeout(t)
  }, [schoolQuery])

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

  // Rekomendasi course, satu logika skor dengan Beranda siswa
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

  const schoolName = (id: string | null) => (id ? projectSchoolNames.get(id) ?? '—' : '—')

  const recommendationEmptyMessage = coursesError
    ? 'Rekomendasi gagal dimuat.'
    : courses.length === 0
      ? 'Belum ada course tersedia.'
      : 'Kamu sudah mengambil semua course yang tersedia.'

  if (loading) return <div className="page"><p className="muted">Memuat Growth…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>

  return (
    <div className="page">
      <PageHeader
        icon="growth"
        title="Growth"
        subtitle={
          isAdmin
            ? 'Rekomendasi belajar, kolaborasi lintas sekolah, integrasi, dan kesiapan aplikasi.'
            : 'Rekomendasi belajar, kolaborasi lintas sekolah, dan kesiapan aplikasi.'
        }
      />

      <div className="about-tabs" role="tablist" aria-label="Tab Growth">
        {TABS.filter((t) => t.id !== 'integrasi' || isAdmin).map((t) => (
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
              <EmptyState message={recommendationEmptyMessage} />
            ) : (
              <ul className="course-list">
                {recommendations.map((r) => (
                  <li key={r.course.id} className="course-card">
                    <Link to={`/course/${r.course.id}`}>
                      <div className="course-card-body">
                      <h3>{r.course.title}</h3>
                      <p>{r.course.description ?? ''}</p>
                      <p className="muted">{r.reason}</p>
                      </div>
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
                      <div className="course-card-body">
                      <h3>{p.title}</h3>
                      <p>{p.description ?? ''}</p>
                      <p className="muted">Proyek terbuka, bisa langsung bergabung.</p>
                      </div>
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
              Proyek yang terafiliasi dengan sekolah, kolaborasi antar sekolah dan klub film.
            </p>
            {collabError ? (
              <p className="error-box">Kolaborasi gagal dimuat. Coba muat ulang halaman ini.</p>
            ) : crossSchoolProjects.length === 0 ? (
              <EmptyState message="Belum ada proyek lintas sekolah. Proyek yang dibuat dengan afiliasi sekolah akan tampil di sini." />
            ) : (
              <ul className="course-list">
                {crossSchoolProjects.map((p) => (
                  <li key={p.id} className="course-card">
                    <Link to={`/proyek/${p.id}`}>
                      <div className="course-card-body">
                      <h3>{p.title}</h3>
                      <p>{p.description ?? ''}</p>
                      <p className="muted">Sekolah: {schoolName(p.school_id)}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="section">
            <h2>Sekolah &amp; Klub Terdaftar</h2>
            {schoolError ? (
              <p className="error-box">Data sekolah gagal dimuat. Coba muat ulang halaman ini.</p>
            ) : (
              <p className="muted">
                {schoolCounts
                  ? `${schoolCounts.total.toLocaleString('id-ID')} sekolah terdaftar di SINEVERSE, ${schoolCounts.verified.toLocaleString('id-ID')} di antaranya terverifikasi.`
                  : 'Memuat data sekolah…'}
              </p>
            )}
            {mySchool && (
              <div className="list-row" style={{ marginBottom: '0.75rem' }}>
                <div className="list-row-main">
                  <p className="list-row-title">{mySchool.name}</p>
                  <span className={mySchool.is_verified ? 'pill-active' : 'pill-waiting'}>
                    Sekolahmu{mySchool.is_verified ? ' · Terverifikasi' : ' · Belum terverifikasi'}
                    {mySchool.city ? ` · ${mySchool.city}` : ''}
                  </span>
                </div>
                <Link to="/sekolah" className="btn btn-ghost btn-small list-row-action">
                  Lihat Sekolah
                </Link>
              </div>
            )}
            <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.5rem' }}>
              Cari sekolah
              <input
                className="search-input"
                style={{ marginTop: '0.35rem' }}
                value={schoolQuery}
                onChange={(e) => setSchoolQuery(e.target.value)}
                placeholder="Ketik nama sekolah atau NPSN…"
                aria-label="Cari sekolah berdasarkan nama atau NPSN"
              />
            </label>
            {schoolQuery.trim().length >= 2 ? (
              schoolSearching ? (
                <p className="muted">Mencari…</p>
              ) : schoolResults && schoolResults.length === 0 ? (
                <p className="empty">Tidak ada sekolah yang cocok dengan pencarianmu.</p>
              ) : (
                <ul className="list">
                  {schoolResults?.map((s) => (
                    <li key={s.id} className="list-row">
                      <div className="list-row-main">
                        <p className="list-row-title">{s.name}</p>
                        <span className={s.is_verified ? 'pill-active' : 'pill-waiting'}>
                          {s.is_verified ? 'Terverifikasi' : 'Belum terverifikasi'}
                          {s.city ? ` · ${s.city}` : ''}
                        </span>
                      </div>
                      <Link to="/sekolah" className="btn btn-ghost btn-small list-row-action">
                        Lihat
                      </Link>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <p className="muted">
                Ketik minimal 2 huruf untuk mencari sekolah — daftar lengkapnya ada di halaman
                Sekolah.
              </p>
            )}
            <div className="action-grid">
              <Link to="/sekolah" className="btn btn-secondary">Lihat Daftar Sekolah →</Link>
              <Link to="/kru" className="btn btn-primary">Cari Kru untuk Kolaborasi →</Link>
              <Link to="/proyek" className="btn btn-secondary">Lihat Semua Proyek</Link>
            </div>
          </section>
        </div>
      )}

      {tab === 'integrasi' && isAdmin && (
        <div>
          <section className="section">
            <h2>Integrasi yang Terhubung</h2>
            <ul className="discussion-list">
              <li className="discussion-item">
                <h3>Supabase, Database, Auth &amp; Storage</h3>
                <p className="muted">Terhubung. Semua data SINEVERSE (course, proyek, komunitas, sertifikat) tersimpan di Supabase.</p>
              </li>
              <li className="discussion-item">
                <h3>GitHub Pages, Hosting</h3>
                <p className="muted">Terhubung. Situs ini ditayangkan dari GitHub Pages.</p>
              </li>
              <li className="discussion-item">
                <h3>Email (SMTP Gmail), Email Konfirmasi</h3>
                <p className="muted">Terhubung. Email konfirmasi pendaftaran dikirim lewat SMTP Gmail akun SINEVERSE.</p>
              </li>
            </ul>
          </section>
          <section className="section">
            <h2>Belum Dikonfigurasi</h2>
            <ul className="discussion-list">
              <li className="discussion-item">
                <h3>Pembayaran</h3>
                <p className="muted">Belum dikonfigurasi, SINEVERSE saat ini gratis, tidak ada pembayaran di aplikasi.</p>
              </li>
              <li className="discussion-item">
                <h3>Analitik Pihak Ketiga</h3>
                <p className="muted">Belum dikonfigurasi, tidak ada pelacak analitik eksternal.</p>
              </li>
              <li className="discussion-item">
                <h3>Login Google / Media Sosial</h3>
                <p className="muted">Belum dikonfigurasi, masuk hanya memakai email dan kata sandi.</p>
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
                    ? 'Ya, aplikasi sedang berjalan sebagai aplikasi terpasang (mode standalone).'
                    : 'Belum, aplikasi sedang dibuka lewat browser.'}
                </p>
              </li>
              <li className="discussion-item">
                <h3>Service Worker</h3>
                <p className="muted">
                  {swActive === null
                    ? 'Memeriksa…'
                    : swActive
                      ? 'Aktif, service worker mengendalikan halaman ini (dukungan offline).'
                      : 'Tidak aktif, service worker belum mengendalikan halaman ini.'}
                </p>
              </li>
              <li className="discussion-item">
                <h3>Manifest Aplikasi</h3>
                <p className="muted">
                  {manifestOk === null
                    ? 'Memeriksa…'
                    : manifestOk
                      ? 'Ditemukan, manifest PWA tersedia.'
                      : 'Tidak ditemukan, manifest PWA tidak termuat.'}
                </p>
              </li>
              <li className="discussion-item">
                <h3>Halaman Offline</h3>
                <p className="muted">
                  {offlineOk === null
                    ? 'Memeriksa…'
                    : offlineOk
                      ? 'Tersedia, halaman offline siap ditampilkan saat tidak ada koneksi.'
                      : 'Tidak tersedia, halaman offline tidak termuat.'}
                </p>
              </li>
              <li className="discussion-item">
                <h3>Siap Dipasang</h3>
                <p className="muted">
                  {standalone
                    ? 'Aplikasi sudah terpasang di perangkat ini.'
                    : installReady
                      ? 'Siap dipasang, browser menawarkan pemasangan aplikasi.'
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
