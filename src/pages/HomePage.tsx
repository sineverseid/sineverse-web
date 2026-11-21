// SINEVERSE, Beranda.
// - Pengguna login peran siswa: dashboard anggota seperti artefak
//   (SiswaHome), hero sapaan, Rekomendasi Untukmu, Kursus Aktifku,
//   Feedback Terbaru, Tugas & Tenggat, Proyekku & Rekrutmen Kru,
//   Event Mendatang. Semua data dari Supabase; empty state jujur.
// - Pengguna login peran mentor: MentorHome, hero Mentor Workspace
//   (course diampu, siswa, submission menunggu dinilai), Antrean
//   Penilaian Terbaru, Kursus yang Kamu Ampu, Kursus Tanpa Pengampu
//   (Ajukan untuk Mengampu), Baru Dinilai, Pesanan Mentoring Berikutnya
//   (bila ada), Pengumuman. Semua data dari Supabase.
// - Pengguna login peran admin: AdminHome, hero Ringkasan SINEVERSE,
//   4 kartu statistik + daftar tindakan (lamaran mentor, sekolah belum
//   terverifikasi, laporan terbuka), aktivitas terbaru, Pengumuman.
// - Pengunjung logout: landing page (ACUAN FINAL Arif 21 Nov 2026):
//   hero foto + aksen diagonal mint + hanya tombol Daftar Gratis,
//   Apa Itu 2 kolom (nilai LEARN/CREATE/COLLABORATE di dalam
//   "Selengkapnya"), Jelajahi 2x2 sebagai kartu navigasi langsung,
//   CTA horizontal (teks kiri, tombol kanan).
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import '../index-homepage.css'
import Icon from '../components/icons'
import type { IconName } from '../components/icons'
import { useAuth } from '../context/AuthContext'
import { fmtDate, fmtDateOnly, isMissingTableError } from '../lib/guarded'
import { topRecommendations } from '../lib/recommendations'
import {
  fetchAssignmentsForLessons,
  fetchCourseLessons,
  fetchCourses,
  fetchEnrollments,
  fetchLessonProgress,
  fetchProfileNames,
  fetchSubmissions,
  logAudit,
  supabase,
} from '../lib/supabase'
import type {
  Announcement,
  Assignment,
  AuditLogRow,
  Course,
  CourseClaim,
  DiscussionReport,
  Enrollment,
  Lesson,
  LessonProgress,
  MentorApplication,
  ModerationReport,
  OfficeHour,
  OfficeHourBooking,
  Project,
  School,
  SineEvent,
  Submission,
} from '../lib/types'

// --- Data landing ---

// Slide carousel hero, path RELATIF './' dari public/.
// (inline style & <img> tidak diproses Vite; path absolut '/...' salah
// arah ke root domain. Yang butuh path absolut hanya url() di file CSS.)
const HERO_SLIDES = [
  { src: './home-hero-cinematic.webp', alt: 'Pelajar dengan kamera di tripod di lokasi syuting' },
  { src: './home-hero-shoot.webp', alt: 'Pelajar SMA/SMK sedang syuting film pendek di luar ruangan' },
  { src: './home-hero-screening.webp', alt: 'Pemutaran film malam di lapangan dengan layar besar' },
]

const VALUES = [
  {
    img: './value-learn.webp',
    icon: 'book' as IconName,
    title: 'LEARN',
    desc: 'Akses pembelajaran perfilman gratis, mulai dari dasar hingga lanjutan.',
  },
  {
    img: './value-create.webp',
    icon: 'film' as IconName,
    title: 'CREATE',
    desc: 'Kembangkan ide, kreativitas, dan kemampuan untuk menghasilkan karya film.',
  },
  {
    img: './value-collaborate.webp',
    icon: 'community' as IconName,
    title: 'COLLABORATE',
    desc: 'Terhubung dengan filmmaker muda dari berbagai sekolah dan daerah.',
  },
]

// Menu Jelajahi, kartu navigasi langsung ke halaman masing-masing
// (sesuai acuan final: tanpa panel detail di bawah grid).
const EXPLORE_MENUS: {
  id: string
  icon: IconName
  name: string
  short: string
  to: string
  featured?: boolean
}[] = [
  {
    id: 'academy',
    icon: 'academy',
    name: 'Academy',
    short: 'Belajar filmmaking',
    to: '/akademi',
    featured: true,
  },
  {
    id: 'community',
    icon: 'community',
    name: 'Community',
    short: 'Temukan komunitas',
    to: '/komunitas',
  },
  {
    id: 'projects',
    icon: 'project',
    name: 'Projects',
    short: 'Berkolaborasi membuat film',
    to: '/proyek',
  },
  {
    id: 'showcase',
    icon: 'trophy',
    name: 'Showcase',
    short: 'Pamerkan karya dan ikuti event',
    to: '/showcase',
  },
]

export default function HomePage() {
  const { user, profile, loading: authLoading } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [enrolledIds, setEnrolledIds] = useState<string[]>([])
  const [progress, setProgress] = useState<LessonProgress[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [coursesError, setCoursesError] = useState<string | null>(null)
  const [exploreNotice, setExploreNotice] = useState<string | null>(null)
  const navigate = useNavigate()
  const [aboutOpen, setAboutOpen] = useState(false)
  // Carousel hero (landing logout): slide aktif + jeda saat hover/fokus.
  const [slide, setSlide] = useState(0)
  const [heroPaused, setHeroPaused] = useState(false)
  // Data dashboard siswa (diisi saat login; mentor/admin tidak memakainya).
  const [projects, setProjects] = useState<Project[]>([])
  const [myProjectIds, setMyProjectIds] = useState<Set<string>>(new Set())
  const [schools, setSchools] = useState<School[]>([])
  const [events, setEvents] = useState<SineEvent[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [lessonCourse, setLessonCourse] = useState<Map<string, string>>(new Map())
  const [lessonTotals, setLessonTotals] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    if (heroPaused) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = window.setInterval(() => {
      setSlide((s) => (s + 1) % HERO_SLIDES.length)
    }, 6000)
    return () => window.clearInterval(t)
  }, [heroPaused])

  useEffect(() => {
    let cancelled = false
    async function load() {
      // Semua fetch independen dimulai BERSAMAAN (bukan berurutan):
      // course, pengumuman, enrollment, dan progres. Sebelumnya lima tahap
      // berjalan berurutan (course → pengumuman → enrollment/progres →
      // lesson → tugas/proyek/dll), sehingga waktunya dijumlah — itu yang
      // bikin Beranda paling lambat (1,6–2,8 detik). Kini tahap independen
      // berjalan paralel dan enrollment hanya diambil sekali (dipakai juga
      // untuk filter pengumuman).
      const coursesP = fetchCourses()
      const annP = supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3)
      const enrP = user ? fetchEnrollments(user.id) : Promise.resolve([] as Enrollment[])
      const progP = user ? fetchLessonProgress(user.id) : Promise.resolve([] as LessonProgress[])

      // Kursus dimuat sendiri: bila gagal, halaman tetap tampil dan hanya
      // muncul pemberitahuan inline, bukan error seluruh halaman.
      let all: Course[] = []
      try {
        all = await coursesP
        if (cancelled) return
        setCourses(all)
      } catch {
        if (!cancelled) setCoursesError('Kursus gagal dimuat.')
      }

      // Pengumuman terbaru (platform + course yang diikuti), sama seperti
      // halaman Pengumuman, bukan teks kosong hardcode.
      let enr: Enrollment[] = []
      let prog: LessonProgress[] = []
      try {
        const [annRes, enrRes, progRes] = await Promise.all([annP, enrP, progP])
        if (cancelled) return
        enr = enrRes
        prog = progRes
        if (annRes.error) {
          if (isMissingTableError(annRes.error)) {
            if (!cancelled) setAnnouncements(null)
          } else {
            throw annRes.error
          }
        } else {
          let rows = (annRes.data ?? []) as Announcement[]
          if (user) {
            const mine = new Set(enr.map((e) => e.course_id))
            rows = rows.filter(
              (a) => a.scope === 'platform' || (a.course_id && mine.has(a.course_id)),
            )
          } else {
            rows = rows.filter((a) => a.scope === 'platform')
          }
          if (!cancelled) setAnnouncements(rows)
        }
      } catch {
        if (!cancelled) setAnnouncements([])
        // Enrollment/progres gagal → lanjut dengan daftar kosong; bagian
        // dashboard di bawah memakai nilai yang sudah didapat (atau kosong).
        try {
          enr = await enrP.catch(() => [] as Enrollment[])
          prog = await progP.catch(() => [] as LessonProgress[])
        } catch {
          enr = []
          prog = []
        }
      }

      if (user) {
        try {
          if (cancelled) return
          setEnrolledIds(enr.map((e) => e.course_id))
          setProgress(prog)
          // Lesson tiap course yang diambil: untuk "Lanjutkan belajar",
          // hitung progres per course, dan daftar tugasnya. Diambil paralel
          // (bukan satu per satu) supaya Beranda tidak lama memuat.
          const lessonCourseMap = new Map<string, string>()
          const lessonIds: string[] = []
          const totals = new Map<string, number>()
          const lessonsPerCourse = await Promise.all(
            enr.map(async (e) => ({ courseId: e.course_id, lessons: await fetchCourseLessons(e.course_id) })),
          )
          for (const { courseId, lessons } of lessonsPerCourse) {
            totals.set(courseId, lessons.length)
            for (const l of lessons) {
              lessonCourseMap.set(l.id, courseId)
              lessonIds.push(l.id)
            }
          }
          if (cancelled) return
          setLessonCourse(lessonCourseMap)
          setLessonTotals(totals)
          // Dashboard siswa: tugas, feedback, proyek, sekolah, event.
          // Semua best-effort: tabel yang belum ada → daftar kosong.
          const [assigns, subs, projRes, memRes, schRes, evRes] = await Promise.all([
            fetchAssignmentsForLessons(lessonIds).catch(() => [] as Assignment[]),
            fetchSubmissions(user.id).catch(() => [] as Submission[]),
            supabase.from('projects').select('*').order('created_at', { ascending: false }),
            supabase.from('project_members').select('project_id').eq('user_id', user.id),
            supabase.from('schools').select('id,name').order('name'),
            supabase.from('events').select('*').order('starts_at', { ascending: true }),
          ])
          if (cancelled) return
          setAssignments(assigns)
          setSubmissions(subs)
          setProjects(
            projRes.error && isMissingTableError(projRes.error)
              ? []
              : ((projRes.data ?? []) as Project[]),
          )
          setMyProjectIds(
            new Set(
              ((memRes.data ?? []) as { project_id: string }[]).map((m) => m.project_id),
            ),
          )
          setSchools((schRes.data ?? []) as School[])
          setEvents(
            evRes.error && isMissingTableError(evRes.error)
              ? []
              : ((evRes.data ?? []) as SineEvent[]),
          )
          } catch {
            if (!cancelled) setError('Gagal memuat data dashboard. Coba muat ulang halaman.')
          }
        }
      if (!cancelled) setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user])

  if (authLoading || loading) {
    return (
      <div className="page">
        <p className="muted">Memuat…</p>
      </div>
    )
  }

  const myCourses = courses.filter((c) => enrolledIds.includes(c.id))
  const isSiswa = profile?.role !== 'mentor' && profile?.role !== 'admin'

  return (
    <div className="page">
      {coursesError && <p className="notice-box">{coursesError}</p>}
      {error && <p className="error-box">{error}</p>}
      {user ? (
        isSiswa ? (
          <SiswaHome
            profileName={profile?.name ?? ''}
            school={profile?.school ?? null}
            kelas={profile?.kelas ?? null}
            courses={courses}
            myCourses={myCourses}
            enrolledIds={enrolledIds}
            progress={progress}
            lessonCourse={lessonCourse}
            lessonTotals={lessonTotals}
            interests={profile?.interests ?? []}
            projects={projects}
            myProjectIds={myProjectIds}
            schools={schools}
            events={events}
            submissions={submissions}
            assignments={assignments}
          />
        ) : profile?.role === 'mentor' ? (
          <MentorHome
            userId={user.id}
            profileName={profile?.name ?? profile?.email ?? 'Mentor'}
            courses={courses}
            announcements={announcements}
          />
        ) : (
          <AdminHome
            userId={user.id}
            profileName={profile?.name ?? profile?.email ?? 'Admin'}
            courses={courses}
            announcements={announcements}
          />
        )
      ) : (
        <>
          {/* B. Hero, carousel sinematik 3 slide, aksen diagonal mint,
              hanya tombol Daftar Gratis (sesuai acuan final). */}
          <section
            className="landing-hero landing-hero-carousel"
            aria-label="Perkenalan SINEVERSE"
            onMouseEnter={() => setHeroPaused(true)}
            onMouseLeave={() => setHeroPaused(false)}
            onFocus={() => setHeroPaused(true)}
            onBlur={() => setHeroPaused(false)}
          >
            <div className="hero-slides" aria-hidden="true">
              {HERO_SLIDES.map((s, i) => (
                <div
                  key={s.src}
                  className={`hero-slide${i === slide ? ' active' : ''}`}
                  style={{ backgroundImage: `url('${s.src}')` }}
                />
              ))}
            </div>
            <div className="hero-shade" aria-hidden="true" />
            <div className="hero-accent" aria-hidden="true" />
            <div className="hero-content">
              <p className="landing-hero-eyebrow">YOUR WORLD OF FILMMAKING</p>
              <h1 className="landing-hero-title">Temukan Dunia Kreatifmu di Balik Layar.</h1>
              <p className="landing-hero-sub">
                Platform belajar dan komunitas perfilman bagi pelajar SMA/SMK.
              </p>
              <div className="landing-hero-actions">
                <Link to="/register" className="btn btn-hero">
                  Daftar Gratis
                  <span aria-hidden="true"> →</span>
                </Link>
                <Link to="/login" className="btn btn-outline-light">
                  Masuk
                </Link>
              </div>
            </div>
            <div className="landing-hero-dots" role="group" aria-label="Pilih foto hero">
              {HERO_SLIDES.map((s, i) => (
                <button
                  key={s.src}
                  type="button"
                  className={`dot${i === slide ? ' active' : ''}`}
                  onClick={() => setSlide(i)}
                  aria-label={`Foto ${i + 1}: ${s.alt}`}
                  aria-current={i === slide}
                />
              ))}
            </div>
          </section>

          {/* C. Apa Itu SINEVERSE?, 2 kolom (teks + ilustrasi) di semua
              lebar, sesuai acuan. Nilai LEARN/CREATE/COLLABORATE pindah
              ke dalam "Selengkapnya" agar tampilan awal sama seperti acuan. */}
          <section className="landing-about" aria-label="Apa Itu SINEVERSE?">
            <div className="landing-about-head">
              <h2>Apa Itu SINEVERSE?</h2>
              <button
                type="button"
                className="link-button landing-more"
                onClick={() => setAboutOpen((v) => !v)}
                aria-expanded={aboutOpen}
              >
                {aboutOpen ? 'Tutup' : 'Selengkapnya'}
                <span aria-hidden="true"> →</span>
              </button>
            </div>
            <div className="landing-about-body">
              <p className="landing-about-desc">
                SINEVERSE adalah ruang belajar, berkarya, dan berkolaborasi bagi generasi muda
                pecinta film di Indonesia.
              </p>
              <img
                src="./clapperboard-mint.webp"
                alt="Clapperboard SINEVERSE"
                className="landing-about-img"
              />
            </div>
            {aboutOpen && (
              <div className="landing-about-more">
                <p>
                  SINEVERSE adalah platform pendidikan dan komunitas perfilman yang dirancang
                  untuk pelajar SMA/SMK di seluruh Indonesia.
                </p>
                <p>
                  SINEVERSE menjadi ruang bagi generasi muda untuk belajar filmmaking,
                  mengembangkan kreativitas, bertukar pengetahuan, menemukan teman berkarya, dan
                  berkolaborasi menghasilkan film.
                </p>
                <p>
                  Kami percaya bahwa setiap anak muda memiliki cerita yang layak untuk
                  diceritakan. Melalui SINEVERSE, setiap pelajar memiliki kesempatan untuk
                  mengenal dunia perfilman dan mengembangkan potensinya.
                </p>
                <div className="landing-values">
                  {VALUES.map((v) => (
                    <div key={v.title} className="landing-value">
                      <img
                        className="landing-value-img"
                        src={v.img}
                        alt=""
                        loading="lazy"
                      />
                      <h3>{v.title}</h3>
                      <p>{v.desc}</p>
                    </div>
                  ))}
                </div>
                <h3>Latar Belakang</h3>
                <p>
                  SINEVERSE dibangun dari keyakinan bahwa belajar film tidak seharusnya hanya
                  bisa diakses segelintir orang. Banyak pelajar SMA/SMK yang tertarik dengan
                  dunia film, menonton, merekam, mengedit, tetapi belum punya ruang terarah
                  untuk belajar dari dasar, berlatih bersama mentor, dan berkarya dalam tim.
                  SINEVERSE hadir untuk mengisi ruang itu: satu tempat untuk belajar, berkarya,
                  dan berkolaborasi.
                </p>
                <h3>Visi</h3>
                <p>
                  Generasi muda Indonesia yang melek film, percaya diri bercerita lewat karya,
                  dan terhubung dalam komunitas kreatif yang saling mendukung.
                </p>
                <h3>Misi</h3>
                <ul>
                  <li>Menyediakan pembelajaran filmmaking gratis dan terstruktur, dari dasar hingga lanjutan.</li>
                  <li>Membangun komunitas filmmaker muda lintas sekolah dan daerah.</li>
                  <li>Membuka ruang kolaborasi nyata untuk menghasilkan karya film.</li>
                </ul>
                <h3>Tujuan</h3>
                <p>
                  Memberi pelajar akses belajar film yang terarah, melatih kemampuan produksi
                  lewat tugas dan proyek nyata, serta menumbuhkan apresiasi terhadap karya film
                  anggota.
                </p>
                <h3>Siapa yang Dapat Bergabung</h3>
                <p>
                  Pelajar SMA/SMK di seluruh Indonesia, baik yang baru mengenal film maupun yang
                  sudah berkarya. Mentor dan praktisi film dapat bergabung sebagai pengajar
                  setelah diverifikasi admin. Sekolah dapat mendaftarkan klub filmnya.
                </p>
                <h3>Manfaat</h3>
                <ul>
                  <li>Akses materi dan bimbingan mentor.</li>
                  <li>Kesempatan berkarya dalam proyek kolaborasi lintas sekolah.</li>
                  <li>Portofolio dan sertifikat atas capaian belajar dan karya.</li>
                  <li>Jaringan filmmaker muda dari berbagai daerah.</li>
                </ul>
                <p>
                  <Link to="/tentang">Baca halaman Tentang SINEVERSE</Link>
                </p>
              </div>
            )}
          </section>

          {/* D. Jelajahi Dunia Filmmaking, grid 2x2 di semua lebar,
              kartu navigasi langsung (sesuai acuan final). */}
          <section className="landing-explore" id="jelajahi" aria-label="Jelajahi Dunia Filmmaking">
            <h2>Jelajahi Dunia Filmmaking</h2>
            {exploreNotice && (
              <p className="notice-box" role="status">
                {exploreNotice}
              </p>
            )}
            <div className="explore-grid">
              {EXPLORE_MENUS.map((m) => {
                // Community dan Projects butuh login: beri tahu pengunjung
                // logout sebelum mengarahkannya ke halaman masuk.
                const needsLogin = !user && (m.id === 'community' || m.id === 'projects')
                return (
                  <Link
                    key={m.id}
                    to={m.to}
                    className={`explore-card${m.featured ? ' featured' : ''}`}
                    onClick={
                      needsLogin
                        ? (e) => {
                            e.preventDefault()
                            setExploreNotice(
                              'Masuk terlebih dahulu untuk membuka Community/Projects.',
                            )
                            window.setTimeout(() => navigate('/login'), 1600)
                          }
                        : undefined
                    }
                  >
                    <span className="explore-icon">
                      <Icon name={m.icon} size={28} />
                    </span>
                    <span className="explore-text">
                      <span className="explore-name">{m.name}</span>
                      <span className="explore-short">{m.short}</span>
                      {needsLogin && (
                        <span
                          className="explore-badge"
                          style={{
                            display: 'inline-block',
                            marginTop: '0.25rem',
                            padding: '0.1rem 0.5rem',
                            borderRadius: '999px',
                            background: '#fff3cd',
                            color: '#7a5b00',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                            alignSelf: 'flex-start',
                          }}
                        >
                          Butuh masuk
                        </span>
                      )}
                    </span>
                    <Icon name="chevronRight" size={20} className="explore-chevron" />
                  </Link>
                )
              })}
            </div>
          </section>

          {/* E. Ajakan bergabung, horizontal: teks kiri, tombol kanan. */}
          <section className="landing-cta" aria-label="Ajakan bergabung">
            <div className="landing-cta-text">
              <h2>Satu Ruang, Banyak Cerita.</h2>
              <p>Bergabunglah bersama komunitas filmmaker muda Indonesia.</p>
            </div>
            <Link to="/register" className="btn btn-hero">
              Gabung Sekarang
              <span aria-hidden="true"> →</span>
            </Link>
          </section>
        </>
      )}
    </div>
  )
}

// --- Dashboard anggota (siswa), seperti SiswaHome di artefak -----------

interface SiswaHomeProps {
  profileName: string
  school: string | null
  kelas: string | null
  courses: Course[]
  myCourses: Course[]
  enrolledIds: string[]
  progress: LessonProgress[]
  lessonCourse: Map<string, string>
  lessonTotals: Map<string, number>
  interests: string[]
  projects: Project[]
  myProjectIds: Set<string>
  schools: School[]
  events: SineEvent[]
  submissions: Submission[]
  assignments: Assignment[]
}

function SiswaHome(props: SiswaHomeProps) {
  const {
    profileName,
    school,
    kelas,
    courses,
    myCourses,
    enrolledIds,
    progress,
    lessonCourse,
    lessonTotals,
    interests,
    projects,
    myProjectIds,
    schools,
    events,
    submissions,
    assignments,
  } = props

  const firstName = profileName.trim().split(/\s+/)[0] || ''
  const schoolParts: string[] = []
  if (school) schoolParts.push(school)
  if (kelas) schoolParts.push(`Kelas ${kelas}`)
  const heroSub = schoolParts.length > 0
    ? `${schoolParts.join(' • ')}. Hari ini mau belajar, berkarya, atau berkolaborasi apa?`
    : 'Hari ini mau belajar, berkarya, atau berkolaborasi apa?'

  const enrolledIdSet = useMemo(() => new Set(enrolledIds), [enrolledIds])

  const recommendations = useMemo(
    () => topRecommendations(courses, enrolledIdSet, projects, myProjectIds, interests, 3),
    [courses, enrolledIdSet, projects, myProjectIds, interests],
  )

  const schoolName = useMemo(() => {
    const byId = new Map(schools.map((s) => [s.id, s.name]))
    return (id: string | null): string | null => (id ? (byId.get(id) ?? null) : null)
  }, [schools])

  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses])
  const assignmentById = useMemo(
    () => new Map(assignments.map((a) => [a.id, a])),
    [assignments],
  )

  // Feedback terbaru: submission yang sudah dinilai mentor.
  const feedback = useMemo(
    () =>
      submissions
        .filter((s) => s.feedback)
        .sort((a, b) =>
          (b.graded_at ?? b.submitted_at).localeCompare(a.graded_at ?? a.submitted_at),
        )
        .slice(0, 3),
    [submissions],
  )

  // Tugas & tenggat: tugas dari course yang diikuti, tenggat terdekat dulu.
  const tasks = useMemo(
    () =>
      [...assignments]
        .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
        .slice(0, 5),
    [assignments],
  )

  // Proyekku (pemilik/anggota) + panggilan kru terbuka (bukan punyaku).
  const myProjects = useMemo(
    () => projects.filter((p) => myProjectIds.has(p.id)),
    [projects, myProjectIds],
  )
  const openCrew = useMemo(
    () =>
      projects.filter((p) => p.access_mode === 'open' && !myProjectIds.has(p.id)).slice(0, 4),
    [projects, myProjectIds],
  )

  // Event mendatang: starts_at ke depan, terdekat dulu.
  // "Sekarang" ditangkap sekali saat komponen dipasang (bukan di useMemo).
  const [now] = useState(() => Date.now())
  const upcomingEvents = useMemo(() => {
    return events
      .filter((e) => e.starts_at && new Date(e.starts_at).getTime() >= now)
      .sort((a, b) => (a.starts_at ?? '').localeCompare(b.starts_at ?? ''))
      .slice(0, 3)
  }, [events, now])

  const doneCount = (courseId: string): number =>
    progress.filter((p) => p.status === 'completed' && lessonCourse.get(p.lesson_id) === courseId)
      .length

  return (
    <>
      <section className="hero">
        <p className="hero-eyebrow">YOUR WORLD OF FILMMAKING</p>
        <h1>{firstName ? `Halo, ${firstName}!` : 'Halo!'}</h1>
        <p className="hero-sub">{heroSub}</p>
        <div className="hero-actions">
          <Link to="/akademi" className="btn btn-primary">
            Jelajahi Academy
          </Link>
          <Link to="/proyek" className="btn btn-outline-light">
            Cari Proyek &amp; Kru
          </Link>
        </div>
        {myCourses.length === 0 && (
          <p className="hero-note">
            Kamu belum mengikuti kursus. Mulai dari{' '}
            <Link to="/akademi">katalog Academy</Link>, semua kursus inti gratis.
          </p>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Rekomendasi Untukmu</h2>
          <Link to="/growth">Buka Growth →</Link>
        </div>
        {recommendations.length === 0 ? (
          <p className="empty">Tidak ada rekomendasi saat ini.</p>
        ) : (
          <ul className="rec-list">
            {recommendations.map((r) => (
              <li key={`${r.kind}-${r.id}`} className="rec-row">
                <Link to={r.to}>
                  <p className="rec-label">
                    {r.kind === 'course' ? 'KURSUS' : 'PROYEK MENCARI KRU'} • Skor kecocokan{' '}
                    {r.score} dari {r.kind === 'course' ? 20 : 25}
                  </p>
                  <h3>{r.title}</h3>
                  <p className="rec-desc">{r.description ?? r.reason}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Kursus Aktifku</h2>
          <Link to="/akademi">Semua kursus →</Link>
        </div>
        {myCourses.length === 0 ? (
          <div className="empty-card">
            <h3>Belum ada kursus aktif</h3>
            <p>Ikuti kursus pertamamu dari katalog Academy.</p>
          </div>
        ) : (
          <ul className="course-list">
            {myCourses.map((c) => {
              const total = lessonTotals.get(c.id) ?? 0
              const done = doneCount(c.id)
              const pct = total > 0 ? Math.round((done / total) * 100) : 0
              return (
                <li key={c.id} className="course-card">
                  <Link to={`/course/${c.id}`}>
                    <div className="course-card-body">
                      <h3>{c.title}</h3>
                      <p>
                        {done}/{total} lesson selesai
                      </p>
                      <div
                        className="progress-track"
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Progres ${c.title}: ${pct} persen`}
                      >
                        <div className="progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Feedback Terbaru</h2>
        {feedback.length === 0 ? (
          <div className="empty-card">
            <h3>Belum ada feedback</h3>
            <p>Feedback dan nilai dari mentor akan muncul di sini setelah tugasmu dinilai.</p>
          </div>
        ) : (
          <ul className="discussion-list">
            {feedback.map((s) => (
              <li key={s.id} className="discussion-item">
                <p className="discussion-meta">
                  {assignmentById.get(s.assignment_id)?.title ?? 'Tugas'}
                  {s.score !== null ? ` · Nilai ${s.score}` : ''} ·{' '}
                  {fmtDate(s.graded_at ?? s.submitted_at)}
                </p>
                <p>{s.feedback}</p>
                <p>
                  <Link to={`/tugas/${s.assignment_id}`}>Lihat tugas →</Link>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Tugas &amp; Tenggat</h2>
        {tasks.length === 0 ? (
          <div className="empty-card">
            <h3>Tidak ada tugas</h3>
            <p>Tugas dari kursus yang kamu ikuti akan tampil di sini.</p>
          </div>
        ) : (
          <ul className="discussion-list">
            {tasks.map((a) => {
              const courseId = a.lesson_id ? lessonCourse.get(a.lesson_id) : undefined
              const course = courseId ? courseById.get(courseId) : undefined
              return (
                <li key={a.id} className="discussion-item">
                  <p className="discussion-meta">
                    {course ? `${course.title} · ` : ''}
                    {a.due_date ? `Tenggat ${fmtDateOnly(a.due_date)}` : 'Tanpa tenggat'}
                  </p>
                  <h3>{a.title}</h3>
                  {a.description && <p>{a.description}</p>}
                  <p>
                    <Link to={`/tugas/${a.id}`}>Kerjakan tugas →</Link>
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Proyekku &amp; Rekrutmen Kru</h2>
        {myProjects.length === 0 && openCrew.length === 0 ? (
          <p className="empty">
            Belum ada proyek atau panggilan kru.{' '}
            <Link to="/proyek">Lihat Projects</Link>
          </p>
        ) : (
          <ul className="discussion-list">
            {myProjects.map((p) => (
              <li key={p.id} className="discussion-item">
                <p className="discussion-meta">
                  Proyekku
                  {schoolName(p.school_id) ? ` · ${schoolName(p.school_id)}` : ''}
                </p>
                <h3>{p.title}</h3>
                {p.description && <p>{p.description}</p>}
                <p>
                  <Link to={`/proyek/${p.id}`}>Lihat Proyek →</Link>
                </p>
              </li>
            ))}
            {openCrew.map((p) => (
              <li key={`crew-${p.id}`} className="discussion-item">
                <p className="discussion-meta">
                  Sedang mencari kru
                  {schoolName(p.school_id) ? ` · ${schoolName(p.school_id)}` : ''}
                </p>
                <h3>{p.title} sedang mencari kru</h3>
                {p.description && <p>{p.description}</p>}
                <p>
                  <Link to={`/proyek/${p.id}`}>Lihat Proyek →</Link>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Event Mendatang</h2>
          <Link to="/acara">Semua event →</Link>
        </div>
        {upcomingEvents.length === 0 ? (
          <p className="empty">Belum ada event mendatang.</p>
        ) : (
          <ul className="discussion-list">
            {upcomingEvents.map((e) => (
              <li key={e.id} className="discussion-item">
                <p className="discussion-meta">
                  {e.starts_at ? fmtDate(e.starts_at) : ''}
                  {e.location ? ` · ${e.location}` : ''}
                </p>
                <h3>{e.title}</h3>
                {e.description && <p>{e.description}</p>}
                <p>
                  <Link to={`/acara/${e.id}`}>Lihat event →</Link>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

// --- Pembantu best-effort: kueri opsional gagal → nilai ganti, bukan crash.
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch {
    return fallback
  }
}

// Status pengajuan mengampu dalam Bahasa Indonesia (bukan mentah "pending").
function claimStatusLabel(status: string): string {
  if (status === 'pending') return 'Menunggu persetujuan'
  if (status === 'approved') return 'Disetujui'
  if (status === 'rejected') return 'Ditolak'
  return status
}

// Jenis target laporan moderasi dalam Bahasa Indonesia.
function targetTypeLabel(t: string): string {
  if (t === 'community_post' || t === 'post') return 'Postingan community'
  if (t === 'community') return 'Komunitas'
  if (t === 'discussion') return 'Diskusi'
  if (t === 'film') return 'Film'
  if (t === 'project') return 'Proyek'
  if (t === 'profile' || t === 'user') return 'Pengguna'
  return t
}

// Status laporan dalam Bahasa Indonesia.
function reportStatusLabel(s: string): string {
  if (s === 'open') return 'Terbuka'
  if (s === 'resolved') return 'Diselesaikan'
  if (s === 'dismissed') return 'Ditolak'
  return s
}

// --- Dashboard mentor, seperti MentorHome di artefak ----------------------

interface MentorQueueRow {
  submission: Submission
  assignment: Assignment
  course: Course
  studentName: string
}

interface MentorCourseRow {
  course: Course
  students: number
  pending: number
}

interface MentorBookingRow {
  hour: OfficeHour
  booking: OfficeHourBooking
  studentName: string
}

function MentorHome(props: {
  userId: string
  profileName: string
  courses: Course[]
  announcements: Announcement[] | null
}) {
  const { userId, profileName, courses, announcements } = props
  const [rows, setRows] = useState<MentorCourseRow[]>([])
  const [queue, setQueue] = useState<MentorQueueRow[]>([])
  const [pendingTotal, setPendingTotal] = useState(0)
  const [graded, setGraded] = useState<MentorQueueRow[]>([])
  const [unassigned, setUnassigned] = useState<Course[]>([])
  const [claims, setClaims] = useState<CourseClaim[]>([])
  const [bookings, setBookings] = useState<MentorBookingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [claimingId, setClaimingId] = useState<string | null>(null)

  async function load() {
    try {
      const mine = courses.filter((c) => c.mentor_id === userId)
      // Semua course mentor dimuat paralel (bukan satu per satu): enrollment,
      // lesson, assignment, dan submission menunggu dinilai diambil dalam
      // query batch, lalu dihitung per course di JS.
      const courseIds = mine.map((c) => c.id)
      const [enrAll, lessonsPerCourse] = await Promise.all([
        courseIds.length
          ? supabase.from('enrollments').select('course_id').in('course_id', courseIds)
          : Promise.resolve({ data: [] as { course_id: string }[] }),
        Promise.all(
          mine.map(async (course) => ({
            courseId: course.id,
            lessons: await fetchCourseLessons(course.id).catch(() => [] as Lesson[]),
          })),
        ),
      ])
      const studentsByCourse = new Map<string, number>()
      for (const e of (enrAll.data ?? []) as { course_id: string }[]) {
        studentsByCourse.set(e.course_id, (studentsByCourse.get(e.course_id) ?? 0) + 1)
      }
      const lessonIds = lessonsPerCourse.flatMap((x) => x.lessons.map((l) => l.id))
      const courseByLesson = new Map<string, string>()
      for (const x of lessonsPerCourse) {
        for (const l of x.lessons) courseByLesson.set(l.id, x.courseId)
      }
      const assignmentCourse = new Map<string, { assignment: Assignment; course: Course }>()
      const courseById = new Map(mine.map((c) => [c.id, c]))
      let pendingByCourse = new Map<string, number>()
      if (lessonIds.length > 0) {
        const assigns = await safe(
          async () => {
            const { data } = await supabase
              .from('assignments')
              .select('*')
              .in('lesson_id', lessonIds)
            return (data ?? []) as Assignment[]
          },
          [] as Assignment[],
        )
        for (const a of assigns) {
          const course = courseById.get(courseByLesson.get(a.lesson_id) ?? '')
          if (course) assignmentCourse.set(a.id, { assignment: a, course })
        }
        if (assigns.length > 0) {
          const { data: pendSubs } = await supabase
            .from('submissions')
            .select('assignment_id')
            .in('assignment_id', assigns.map((a) => a.id))
            .is('score', null)
          pendingByCourse = new Map<string, number>()
          for (const s of (pendSubs ?? []) as { assignment_id: string }[]) {
            const courseId = courseByLesson.get(
              assignmentCourse.get(s.assignment_id)?.assignment.lesson_id ?? '',
            )
            if (courseId) {
              pendingByCourse.set(courseId, (pendingByCourse.get(courseId) ?? 0) + 1)
            }
          }
        }
      }
      const out: MentorCourseRow[] = mine.map((course) => ({
        course,
        students: studentsByCourse.get(course.id) ?? 0,
        pending: pendingByCourse.get(course.id) ?? 0,
      }))
      setRows(out)
      setUnassigned(courses.filter((c) => !c.mentor_id))

      // Antrean penilaian (score null, terbaru dulu) + baru dinilai.
      const allAIds = [...assignmentCourse.keys()]
      if (allAIds.length > 0) {
        const [{ data: pend }, { data: grd }] = await Promise.all([
          supabase
            .from('submissions')
            .select('*')
            .in('assignment_id', allAIds)
            .is('score', null)
            .order('submitted_at', { ascending: false }),
          supabase
            .from('submissions')
            .select('*')
            .in('assignment_id', allAIds)
            .not('score', 'is', null)
            .not('graded_at', 'is', null)
            .order('graded_at', { ascending: false })
            .limit(4),
        ])
        const pendRows = (pend ?? []) as Submission[]
        const grdRows = (grd ?? []) as Submission[]
        const studentIds = [
          ...new Set([...pendRows, ...grdRows].map((s) => s.user_id)),
        ]
        const names = await fetchProfileNames(studentIds).catch(
          () => new Map<string, string>(),
        )
        const toRow = (s: Submission): MentorQueueRow | null => {
          const ac = assignmentCourse.get(s.assignment_id)
          if (!ac) return null
          return {
            submission: s,
            assignment: ac.assignment,
            course: ac.course,
            studentName: names.get(s.user_id) ?? 'Siswa',
          }
        }
        setPendingTotal(pendRows.length)
        setQueue(
          pendRows
            .map(toRow)
            .filter((r): r is MentorQueueRow => !!r)
            .slice(0, 4),
        )
        setGraded(grdRows.map(toRow).filter((r): r is MentorQueueRow => !!r))
      }

      // Klaim mengampu saya (course_claims).
      const cl = await safe(
        async () => {
          const { data } = await supabase
            .from('course_claims')
            .select('*')
            .eq('mentor_id', userId)
            .order('created_at', { ascending: false })
          return (data ?? []) as CourseClaim[]
        },
        [] as CourseClaim[],
      )
      setClaims(cl)

      // Pesanan mentoring berikutnya: office hour saya yang sudah dipesan
      // dan waktunya masih di depan.
      const hours = await safe(
        async () => {
          const { data } = await supabase
            .from('office_hours')
            .select('*')
            .eq('mentor_id', userId)
          return (data ?? []) as OfficeHour[]
        },
        [] as OfficeHour[],
      )
      if (hours.length > 0) {
        const bRows = await safe(
          async () => {
            const { data } = await supabase
              .from('office_hour_bookings')
              .select('*')
              .in(
                'office_hour_id',
                hours.map((h) => h.id),
              )
              .eq('status', 'booked')
            return (data ?? []) as OfficeHourBooking[]
          },
          [] as OfficeHourBooking[],
        )
        const hourById = new Map(hours.map((h) => [h.id, h]))
        const now = Date.now()
        const upcoming = bRows
          .map((b) => ({ hour: hourById.get(b.office_hour_id), booking: b }))
          .filter(
            (
              x,
            ): x is { hour: OfficeHour; booking: OfficeHourBooking } =>
              !!x.hour &&
              !!x.hour.starts_at &&
              new Date(x.hour.starts_at).getTime() >= now,
          )
          .sort((a, b) => (a.hour.starts_at ?? '').localeCompare(b.hour.starts_at ?? ''))
          .slice(0, 3)
        const bNames = await fetchProfileNames(
          upcoming.map((x) => x.booking.user_id),
        ).catch(() => new Map<string, string>())
        setBookings(
          upcoming.map((x) => ({
            hour: x.hour,
            booking: x.booking,
            studentName: bNames.get(x.booking.user_id) ?? 'Siswa',
          })),
        )
      }
    } catch {
      setError('Gagal memuat Mentor Workspace. Coba muat ulang halaman.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, courses])

  async function handleClaim(courseId: string) {
    if (claimingId) return
    setClaimingId(courseId)
    setNotice(null)
    const { error: insErr } = await supabase.from('course_claims').insert({
      course_id: courseId,
      mentor_id: userId,
      status: 'pending',
    })
    setClaimingId(null)
    if (insErr) {
      setNotice('Pengajuan gagal terkirim. Coba lagi.')
      return
    }
    setNotice(
      'Pengajuan mengampu terkirim. Admin akan meninjau, setelah disetujui, admin menetapkan kamu sebagai mentor course itu (lihat Admin Panel).',
    )
    const { data } = await supabase
      .from('course_claims')
      .select('*')
      .eq('mentor_id', userId)
      .order('created_at', { ascending: false })
    setClaims((data ?? []) as CourseClaim[])
  }

  if (loading) return <p className="muted">Memuat Mentor Workspace…</p>
  if (error) return <p className="error-box">{error}</p>

  const firstName = profileName.trim().split(/\s+/)[0] || 'Mentor'
  const totalStudents = rows.reduce((n, r) => n + r.students, 0)

  return (
    <>
      <section className="hero">
        <p className="hero-eyebrow">MENTOR WORKSPACE</p>
        <h1>Halo, {firstName}!</h1>
        <p className="hero-sub">
          {rows.length} course diampu · {totalStudents} siswa · {pendingTotal} submission
          menunggu dinilai
        </p>
        <div className="hero-actions">
          <Link to="/mentor/penilaian" className="btn btn-primary">
            Buka Antrean Penilaian
          </Link>
          <Link to="/mentor/course-builder" className="btn btn-outline-light">
            Course Builder
          </Link>
        </div>
      </section>

      {notice && <p className="notice-box">{notice}</p>}

      <section className="section">
        <div className="section-head">
          <h2>Antrean Penilaian Terbaru</h2>
          <Link to="/mentor/penilaian">Lihat semua →</Link>
        </div>
        <p className="muted">{pendingTotal} submission menunggu dinilai.</p>
        {queue.length === 0 ? (
          <p className="empty">Tidak ada submission yang menunggu penilaian.</p>
        ) : (
          <ul className="discussion-list">
            {queue.map((row) => (
              <li key={row.submission.id} className="discussion-item">
                <p className="discussion-meta">
                  {row.course.title} · {row.assignment.title} · {row.studentName} ·{' '}
                  {fmtDate(row.submission.submitted_at)}
                </p>
                <p
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {row.submission.content ?? '—'}
                </p>
                <p>
                  <Link to="/mentor/penilaian">Buka Antrean →</Link>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Kursus yang Kamu Ampu</h2>
        {rows.length === 0 ? (
          <p className="empty">
            Kamu belum mengampu course apa pun. Ajukan course tanpa mentor di bawah.
          </p>
        ) : (
          <ul className="course-list">
            {rows.map((r) => (
              <li key={r.course.id} className="course-card">
                <Link to={`/mentor/course/${r.course.id}`}>
                  <h3>{r.course.title}</h3>
                  <p className="muted">
                    {r.students} siswa · {r.pending} submission menunggu penilaian
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p>
          <Link to="/mentor/siswa" className="btn btn-secondary">
            Siswa
          </Link>{' '}
          <Link to="/mentor/diskusi" className="btn btn-secondary">
            Diskusi
          </Link>{' '}
          <Link to="/mentor/analitik" className="btn btn-secondary">
            Analitik
          </Link>{' '}
          <Link to="/rps" className="btn btn-ghost">
            Lihat RPS (read-only)
          </Link>
        </p>
      </section>

      <section className="section">
        <h2>Kursus Tanpa Pengampu</h2>
        {unassigned.length === 0 ? (
          <p className="empty">Tidak ada course tanpa mentor saat ini.</p>
        ) : (
          <ul
            className="plain-list"
            style={{ listStyle: 'none', margin: 0, padding: 0 }}
          >
            {unassigned.map((c) => {
              const claim = claims.find((cl) => cl.course_id === c.id)
              return (
                <li key={c.id} style={{ marginBottom: '0.75rem' }}>
                  {c.title}{' '}
                  {claim ? (
                    <span className="muted">— pengajuan: {claimStatusLabel(claim.status)}</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      disabled={claimingId === c.id}
                      onClick={() => void handleClaim(c.id)}
                    >
                      {claimingId === c.id ? 'Mengajukan…' : 'Ajukan untuk Mengampu'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Baru Dinilai</h2>
        {graded.length === 0 ? (
          <p className="empty">Belum ada submission yang kamu nilai.</p>
        ) : (
          <ul className="discussion-list">
            {graded.map((row) => (
              <li key={row.submission.id} className="discussion-item">
                <p className="discussion-meta">
                  {row.course.title} · {row.assignment.title} · {row.studentName}
                  {row.submission.score !== null ? ` · Nilai ${row.submission.score}` : ''} ·{' '}
                  {fmtDate(row.submission.graded_at ?? row.submission.submitted_at)}
                </p>
                <p>{row.submission.feedback ?? '—'}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {bookings.length > 0 && (
        <section className="section">
          <h2>Pesanan Mentoring Berikutnya</h2>
          <ul className="discussion-list">
            {bookings.map((b) => (
              <li key={b.booking.id} className="discussion-item">
                <p className="discussion-meta">
                  {b.hour.starts_at ? fmtDate(b.hour.starts_at) : ''}
                </p>
                <h3>{b.hour.title}</h3>
                <p>{b.studentName}</p>
                <p>
                  <Link to="/jam-kantor">Lihat Office Hours →</Link>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Pengumuman</h2>
          <Link to="/pengumuman">Lihat semua</Link>
        </div>
        {announcements === null ? (
          <p className="empty">Pengumuman belum tersedia.</p>
        ) : announcements.length === 0 ? (
          <p className="empty">Belum ada pengumuman.</p>
        ) : (
          <ul className="discussion-list">
            {announcements.map((a) => (
              <li key={a.id} className="discussion-item">
                <p className="discussion-meta">
                  {a.scope === 'platform' ? 'Platform' : 'Course'} · {fmtDate(a.created_at)}
                </p>
                <h3>{a.title}</h3>
                {a.body && <p>{a.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

// --- Dashboard admin, seperti AdminHome di artefak -------------------------

interface AdminActivityRow {
  id: string
  actor: string
  action: string
  created_at: string
}

function AdminHome(props: {
  userId: string
  profileName: string
  courses: Course[]
  announcements: Announcement[] | null
}) {
  const { userId, profileName, courses, announcements } = props
  const [counts, setCounts] = useState({
    users: 0,
    siswa: 0,
    mentor: 0,
    admin: 0,
    schools: 0,
    films: 0,
    enrollments: 0,
    pendingApps: 0,
    openReports: 0,
    unverifiedSchools: 0,
  })
  const [usersError, setUsersError] = useState<string | null>(null)
  const [targetLabels, setTargetLabels] = useState<
    Map<string, { label: string; to: string | null }>
  >(new Map())
  const [apps, setApps] = useState<MentorApplication[]>([])
  const [schools, setSchools] = useState<School[]>([])
  const [discReports, setDiscReports] = useState<DiscussionReport[]>([])
  const [modReports, setModReports] = useState<ModerationReport[]>([])
  const [activity, setActivity] = useState<AdminActivityRow[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function load() {
    try {
      const { data: profiles, error: profilesErr } = await supabase
        .from('profiles')
        .select('id,name,role')
      // Kegagalan memuat profil jangan disamarkan sebagai 0 pengguna.
      if (profilesErr) {
        setUsersError('Data pengguna gagal dimuat.')
      } else {
        setUsersError(null)
      }
      const profs = (profiles ?? []) as { id: string; name: string | null; role: string }[]
      const { count: filmCount } = await safe(
        async () =>
          supabase.from('films').select('id', { count: 'exact', head: true }),
        { count: 0 } as { count: number | null },
      )
      const { count: enrCount } = await safe(
        async () =>
          supabase.from('enrollments').select('id', { count: 'exact', head: true }),
        { count: 0 } as { count: number | null },
      )
      const appData = await safe(
        async () => {
          const { data } = await supabase
            .from('mentor_applications')
            .select('*')
            .eq('status', 'pending')
            .order('created_at')
          return (data ?? []) as MentorApplication[]
        },
        [] as MentorApplication[],
      )
      const schoolData = await safe(
        async () => {
          const { data } = await supabase.from('schools').select('*').order('name')
          return (data ?? []) as School[]
        },
        [] as School[],
      )
      const dData = await safe(
        async () => {
          const { data } = await supabase
            .from('discussion_reports')
            .select('*')
            .eq('status', 'open')
            .order('created_at', { ascending: false })
          return (data ?? []) as DiscussionReport[]
        },
        [] as DiscussionReport[],
      )
      const mData = await safe(
        async () => {
          const { data } = await supabase
            .from('moderation_reports')
            .select('*')
            .eq('status', 'open')
            .order('created_at', { ascending: false })
          return (data ?? []) as ModerationReport[]
        },
        [] as ModerationReport[],
      )
      setNames(await fetchProfileNames(profs.map((p) => p.id)))
      setCounts({
        users: profs.length,
        siswa: profs.filter((p) => p.role === 'siswa').length,
        mentor: profs.filter((p) => p.role === 'mentor').length,
        admin: profs.filter((p) => p.role === 'admin').length,
        schools: schoolData.length,
        films: filmCount ?? 0,
        enrollments: enrCount ?? 0,
        pendingApps: appData.length,
        openReports: dData.length + mData.length,
        unverifiedSchools: schoolData.filter((s) => !s.is_verified).length,
      })
      setApps(appData)
      setSchools(schoolData)
      setDiscReports(dData)
      setModReports(mData)

      // Selesaikan target laporan moderasi menjadi label yang bisa dibaca
      // manusia (judul/nama + tautan), bukan UUID mentah. Bila target tidak
      // bisa diselesaikan, tampilkan jenisnya + ID pendek saja.
      const labels = new Map<string, { label: string; to: string | null }>()
      for (const r of mData) {
        const key = `${r.target_type}:${r.target_id ?? ''}`
        const fallback = { label: targetTypeLabel(r.target_type), to: null as string | null }
        if (!r.target_id) {
          labels.set(key, fallback)
          continue
        }
        try {
          if (r.target_type === 'community_post' || r.target_type === 'post') {
            const { data } = await supabase
              .from('community_posts')
              .select('body,community_id')
              .eq('id', r.target_id)
              .maybeSingle()
            const row = data as { body: string | null; community_id: string } | null
            labels.set(
              key,
              row
                ? {
                    label: row.body ? row.body.slice(0, 60) : targetTypeLabel(r.target_type),
                    to: `/komunitas/${row.community_id}`,
                  }
                : fallback,
            )
          } else if (r.target_type === 'community') {
            const { data } = await supabase
              .from('communities')
              .select('name')
              .eq('id', r.target_id)
              .maybeSingle()
            const row = data as { name: string } | null
            labels.set(
              key,
              row ? { label: row.name, to: `/komunitas/${r.target_id}` } : fallback,
            )
          } else if (r.target_type === 'discussion') {
            const { data } = await supabase
              .from('discussions')
              .select('body,lesson_id')
              .eq('id', r.target_id)
              .maybeSingle()
            const row = data as { body: string | null; lesson_id: string } | null
            labels.set(
              key,
              row
                ? {
                    label: row.body ? row.body.slice(0, 60) : targetTypeLabel(r.target_type),
                    to: `/lesson/${row.lesson_id}`,
                  }
                : fallback,
            )
          } else if (r.target_type === 'film') {
            const { data } = await supabase
              .from('films')
              .select('title')
              .eq('id', r.target_id)
              .maybeSingle()
            const row = data as { title: string } | null
            labels.set(
              key,
              row ? { label: row.title, to: `/showcase/${r.target_id}` } : fallback,
            )
          } else if (r.target_type === 'project') {
            const { data } = await supabase
              .from('projects')
              .select('title')
              .eq('id', r.target_id)
              .maybeSingle()
            const row = data as { title: string } | null
            labels.set(
              key,
              row ? { label: row.title, to: `/proyek/${r.target_id}` } : fallback,
            )
          } else {
            labels.set(key, fallback)
          }
        } catch {
          labels.set(key, fallback)
        }
      }
      setTargetLabels(labels)

      // Aktivitas terbaru: audit log; bila tabel tidak ada, pakai
      // pendaftaran terbaru sebagai gantinya (data asli saja).
      const aRows = await safe(
        async () => {
          const { data } = await supabase
            .from('audit_log')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5)
          return (data ?? []) as AuditLogRow[]
        },
        null as AuditLogRow[] | null,
      )
      if (aRows && aRows.length > 0) {
        const actorNames = await fetchProfileNames(
          aRows.map((r) => r.actor_id).filter((id): id is string => !!id),
        ).catch(() => new Map<string, string>())
        setActivity(
          aRows.map((r) => ({
            id: r.id,
            actor: (r.actor_id && actorNames.get(r.actor_id)) ?? 'Sistem',
            action: r.action,
            created_at: r.created_at,
          })),
        )
      } else {
        const newest = await safe(
          async () => {
            const { data } = await supabase
              .from('profiles')
              .select('id,name,role,created_at')
              .order('created_at', { ascending: false })
              .limit(5)
            return (data ?? []) as { id: string; name: string | null; role: string; created_at: string }[]
          },
          [] as { id: string; name: string | null; role: string; created_at: string }[],
        )
        setActivity(
          newest.map((p) => ({
            id: p.id,
            actor: p.name ?? 'Anggota baru',
            action: `Mendaftar sebagai ${p.role === 'mentor' ? 'mentor' : p.role === 'admin' ? 'admin' : 'siswa'}`,
            created_at: p.created_at,
          })),
        )
      }
    } catch {
      setError('Gagal memuat Ringkasan SINEVERSE. Coba muat ulang halaman.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function decideApp(app: MentorApplication, approve: boolean) {
    const { error: updErr } = await supabase
      .from('mentor_applications')
      .update({ status: approve ? 'approved' : 'rejected', decided_by: userId })
      .eq('id', app.id)
    if (updErr) {
      setNotice('Gagal menyimpan keputusan. Coba lagi.')
      return
    }
    await logAudit(
      approve ? 'mentor_application.approved' : 'mentor_application.rejected',
      'mentor_applications',
      app.id,
      { user_id: app.user_id },
    )
    setNotice(
      approve
        ? 'Lamaran mentor disetujui. Peran diubah menjadi mentor oleh trigger database.'
        : 'Lamaran mentor ditolak.',
    )
    await load()
  }

  async function handleVerifySchool(school: School, verify: boolean) {
    const { error: updErr } = await supabase
      .from('schools')
      .update({ is_verified: verify })
      .eq('id', school.id)
    if (updErr) {
      setNotice('Gagal mengubah status verifikasi sekolah. Coba lagi.')
      return
    }
    await logAudit(verify ? 'school.verified' : 'school.unverified', 'schools', school.id, {})
    setNotice(`Sekolah ${school.name} ${verify ? 'diverifikasi' : 'batal diverifikasi'}.`)
    await load()
  }

  async function resolveDiscussion(r: DiscussionReport, status: 'resolved' | 'dismissed') {
    const { error: updErr } = await supabase
      .from('discussion_reports')
      .update({ status, resolved_by: userId, resolved_at: new Date().toISOString() })
      .eq('id', r.id)
    if (updErr) {
      setNotice('Gagal menyelesaikan laporan. Coba lagi.')
      return
    }
    await logAudit(
      `discussion_report.${status}`,
      'discussion_reports',
      r.id,
      { discussion_id: r.discussion_id },
    )
    setNotice(`Laporan diskusi ${status === 'resolved' ? 'diselesaikan' : 'ditolak'}.`)
    await load()
  }

  async function resolveModeration(r: ModerationReport, status: 'resolved' | 'dismissed') {
    const { error: updErr } = await supabase
      .from('moderation_reports')
      .update({ status, resolved_by: userId, resolved_at: new Date().toISOString() })
      .eq('id', r.id)
    if (updErr) {
      setNotice('Gagal menyelesaikan laporan. Coba lagi.')
      return
    }
    await logAudit(
      `moderation_report.${status}`,
      'moderation_reports',
      r.id,
      { target_type: r.target_type, target_id: r.target_id },
    )
    setNotice(`Laporan moderasi ${status === 'resolved' ? 'diselesaikan' : 'ditolak'}.`)
    await load()
  }

  if (loading) return <p className="muted">Memuat Ringkasan SINEVERSE…</p>
  if (error) return <p className="error-box">{error}</p>

  const firstName = profileName.trim().split(/\s+/)[0] || 'Admin'
  const unverified = schools.filter((s) => !s.is_verified)

  return (
    <>
      <section className="hero">
        <p className="hero-eyebrow">ADMIN PANEL</p>
        <h1>Ringkasan SINEVERSE</h1>
        <p className="hero-sub">
          Halo, {firstName}! {counts.users} pengguna · {counts.schools} sekolah ·{' '}
          {courses.length} course · {counts.films} film · {counts.enrollments} enrollment
        </p>
        <div className="hero-actions">
          <Link to="/admin" className="btn btn-primary">
            Buka Admin Panel
          </Link>
        </div>
      </section>

      {notice && <p className="notice-box">{notice}</p>}
      {usersError && <p className="error-box">{usersError}</p>}

      <section className="section" aria-label="Statistik platform">
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-num">{counts.pendingApps}</span>
            <span className="stat-label">Mentor menunggu verifikasi</span>
            <Link to="/admin#lamaran-mentor">Tinjau →</Link>
          </div>
          <div className="stat-card">
            <span className="stat-num">{counts.openReports}</span>
            <span className="stat-label">Laporan terbuka</span>
            <Link to="/admin/moderasi">Tinjau →</Link>
          </div>
          <div className="stat-card">
            <span className="stat-num">{counts.unverifiedSchools}</span>
            <span className="stat-label">Sekolah belum terverifikasi</span>
            <Link to="/admin#verifikasi-sekolah">Tinjau →</Link>
          </div>
          <div className="stat-card">
            <span className="stat-num">{counts.users}</span>
            <span className="stat-label">
              Total pengguna (Siswa {counts.siswa} · Mentor {counts.mentor} · Admin{' '}
              {counts.admin})
            </span>
            <Link to="/admin/pengguna">Lihat →</Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Lamaran Mentor ({apps.length} pending)</h2>
          <Link to="/admin#lamaran-mentor">Admin Panel →</Link>
        </div>
        {apps.length === 0 ? (
          <p className="empty">Tidak ada lamaran mentor yang menunggu.</p>
        ) : (
          <ul className="discussion-list">
            {apps.map((a) => (
              <li key={a.id} className="discussion-item">
                <p>
                  <strong>{names.get(a.user_id) ?? 'Pelamar'}</strong>
                </p>
                <p>Keahlian: {a.expertise ?? '—'}</p>
                <p>Pengalaman: {a.experience ?? '—'}</p>
                {a.portfolio_link && (
                  <p>
                    <a href={a.portfolio_link} target="_blank" rel="noreferrer">
                      Portofolio
                    </a>
                  </p>
                )}
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-small"
                    onClick={() => void decideApp(a, true)}
                  >
                    Setujui
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => void decideApp(a, false)}
                  >
                    Tolak
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Sekolah Belum Terverifikasi ({unverified.length})</h2>
          <Link to="/admin#verifikasi-sekolah">Admin Panel →</Link>
        </div>
        {unverified.length === 0 ? (
          <p className="empty">Semua sekolah sudah terverifikasi.</p>
        ) : (
          <ul className="discussion-list">
            {unverified.map((s) => (
              <li key={s.id} className="discussion-item">
                <h3>{s.name}</h3>
                {s.city && <p className="muted">{s.city}</p>}
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-small"
                    onClick={() => void handleVerifySchool(s, true)}
                  >
                    Verifikasi
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Laporan Terbuka ({discReports.length + modReports.length})</h2>
          <Link to="/admin/moderasi">Moderasi →</Link>
        </div>
        {discReports.length === 0 && modReports.length === 0 ? (
          <p className="empty">Tidak ada laporan terbuka.</p>
        ) : (
          <ul className="discussion-list">
            {discReports.map((r) => (
              <li key={`d-${r.id}`} className="discussion-item">
                <p className="discussion-meta">
                  Laporan diskusi · {fmtDate(r.created_at)} · Status:{' '}
                  {reportStatusLabel(r.status)}
                </p>
                <p>Alasan: {r.reason ?? '—'}</p>
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-small"
                    onClick={() => void resolveDiscussion(r, 'resolved')}
                  >
                    Selesaikan
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => void resolveDiscussion(r, 'dismissed')}
                  >
                    Tolak Laporan
                  </button>
                </div>
              </li>
            ))}
            {modReports.map((r) => {
              const info = targetLabels.get(`${r.target_type}:${r.target_id ?? ''}`)
              const typeLabel = targetTypeLabel(r.target_type)
              return (
                <li key={`m-${r.id}`} className="discussion-item">
                  <p className="discussion-meta">
                    Laporan moderasi · {typeLabel}
                    {info && info.to ? (
                      <>
                        {' · '}
                        <Link to={info.to}>{info.label}</Link>
                      </>
                    ) : (
                      <>{r.target_id ? ` · ID ${r.target_id.slice(0, 8)}` : ''}</>
                    )}
                    {' · '}
                    {fmtDate(r.created_at)} · Status: {reportStatusLabel(r.status)}
                  </p>
                  <p>Alasan: {r.reason ?? '—'}</p>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      onClick={() => void resolveModeration(r, 'resolved')}
                    >
                      Selesaikan
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => void resolveModeration(r, 'dismissed')}
                    >
                      Tolak Laporan
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Aktivitas Terbaru</h2>
        {activity.length === 0 ? (
          <p className="empty">Belum ada aktivitas.</p>
        ) : (
          <ul className="discussion-list">
            {activity.map((a) => (
              <li key={a.id} className="discussion-item">
                <p className="discussion-meta">
                  {a.actor} · {fmtDate(a.created_at)}
                </p>
                <p>{a.action}</p>
              </li>
            ))}
          </ul>
        )}
        <p>
          <Link to="/admin#pengumuman" className="btn btn-secondary">
            Buat Pengumuman
          </Link>{' '}
          <Link to="/admin#buat-course" className="btn btn-secondary">
            Buat Course
          </Link>{' '}
          <Link to="/admin#verifikasi-sekolah" className="btn btn-secondary">
            Verifikasi Sekolah
          </Link>
        </p>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Pengumuman</h2>
          <Link to="/pengumuman">Lihat semua</Link>
        </div>
        {announcements === null ? (
          <p className="empty">Pengumuman belum tersedia.</p>
        ) : announcements.length === 0 ? (
          <p className="empty">Belum ada pengumuman.</p>
        ) : (
          <ul className="discussion-list">
            {announcements.map((a) => (
              <li key={a.id} className="discussion-item">
                <p className="discussion-meta">
                  {a.scope === 'platform' ? 'Platform' : 'Course'} · {fmtDate(a.created_at)}
                </p>
                <h3>{a.title}</h3>
                {a.body && <p>{a.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
