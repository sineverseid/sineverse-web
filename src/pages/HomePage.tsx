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
//   statistik platform dari data asli (Total Siswa, Total Mentor, Total
//   Course, Sertifikat Diterbitkan) dengan filter periode 7D/30D/90D +
//   delta vs periode sebelumnya bila bisa dihitung, ring Progress Academy
//   dari progres lesson semua enrollment, lalu 4 kartu tindakan (lamaran
//   mentor, sekolah belum terverifikasi, laporan terbuka), aktivitas
//   terbaru, Pengumuman. Admin tidak pernah enrol/mengerjakan course
//   (migrasi 022) — tidak ada jalur itu di sini.
// - Pengunjung logout: landing page (ACUAN FINAL Arif 21 Nov 2026):
//   hero foto + aksen diagonal mint + hanya tombol Daftar Gratis,
//   Apa Itu 2 kolom (nilai LEARN/CREATE/COLLABORATE di dalam
//   "Selengkapnya"), Jelajahi 2x2 sebagai kartu navigasi langsung,
//   CTA horizontal (teks kiri, tombol kanan).
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import '../index-homepage.css'
import Icon from '../components/icons'
import type { IconName } from '../components/icons'
import { useAuth } from '../context/AuthContext'
import { activityLabel } from '../lib/activityLabels'
import { fmtDate, fmtDateOnly, isMissingTableError } from '../lib/guarded'
import { fetchMentorGroupSummary } from '../lib/mentorGroup'
import type { MentorGroupSummary } from '../lib/mentorGroup'
import { topRecommendations } from '../lib/recommendations'
import { courseIllustration, rpsWeekLabel } from '../lib/brand'
import { countEnrollments, countUsersByRole, formatCountId } from '../lib/counts'
import {
  decideMentorApplication,
  decideSchoolSubmission,
  fetchAssignmentsForLessons,
  fetchCourseLessons,
  fetchCourses,
  fetchEnrollments,
  fetchLessonProgress,
  fetchMentorApplications,
  fetchProfileNames,
  fetchRefNameMap,
  fetchSchoolSubmissions,
  fetchSchoolTotals,
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
  SchoolSubmission,
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
    to: '/akademi/perkenalan',
    featured: true,
  },
  {
    id: 'community',
    icon: 'community',
    name: 'Community',
    short: 'Temukan komunitas',
    to: '/komunitas/perkenalan',
  },
  {
    id: 'projects',
    icon: 'project',
    name: 'Projects',
    short: 'Berkolaborasi membuat film',
    to: '/proyek/perkenalan',
  },
  {
    id: 'showcase',
    icon: 'trophy',
    name: 'Showcase',
    short: 'Pamerkan karya dan ikuti event',
    to: '/showcase/perkenalan',
  },
]

export default function HomePage() {
  const { user, profile, loading: authLoading, profileLoading, refreshProfile } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [enrolledIds, setEnrolledIds] = useState<string[]>([])
  const [progress, setProgress] = useState<LessonProgress[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null)
  const [loading, setLoading] = useState(true)
  // dataLoading = data milik pengguna (lesson, tugas, proyek, event) masih
  // dimuat di latar belakang. Halaman ditampilkan begitu batch pertama
  // (course + pengumuman + enrollment + progres) selesai, dan seksi-seksi
  // ini menampilkan "Memuat…" sampai datanya tiba — supaya Beranda terasa
  // di bawah 1 detik, bukan menunggu semua query selesai.
  const [dataLoading, setDataLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [coursesError, setCoursesError] = useState<string | null>(null)
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
  // P72: profil gagal dimuat tidak boleh jatuh ke dashboard siswa.
  // Sinyal "masih dimuat" datang dari AuthContext (profileLoading), bukan
  // heuristik tenggat — setelah fetch profil selesai dan profil tetap null,
  // tampilkan error state.

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
          // Batch pertama selesai — tampilkan halaman SEKARANG (hero,
          // rekomendasi dari course yang sudah di-cache, dan Kursus Aktifku
          // dari enrollment). Data milik pengguna (lesson, tugas, proyek,
          // event) lanjut dimuat di latar belakang dan mengisi seksi-seksi
          // di bawah begitu tiba.
          if (!cancelled) setLoading(false)
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
      if (!cancelled) {
        setLoading(false)
        setDataLoading(false)
      }
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

  // P72: pengguna login tanpa profil = error state, bukan SiswaHome.
  // Tamu (user null) tidak kena cabang ini — mereka melihat landing.
  if (user && !profile) {
    if (profileLoading) {
      return (
        <div className="page">
          <p className="muted">Memuat profil…</p>
        </div>
      )
    }
    return (
      <div className="page">
        <p className="error-box">
          Profil gagal dimuat. Dashboard tidak bisa ditampilkan tanpa data peranmu.
        </p>
        <p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              void refreshProfile()
            }}
          >
            Coba lagi
          </button>{' '}
          <button type="button" className="btn btn-ghost" onClick={() => window.location.reload()}>
            Muat ulang halaman
          </button>
        </p>
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
            announcements={announcements}
            dataLoading={dataLoading}
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
            <div className="explore-grid">
              {/* Kartu menaut ke halaman perkenalan publik masing-masing
                  fitur — guest bisa membacanya tanpa login; tombol di dalam
                  halaman perkenalan yang mengarah ke fitur itu sendiri. */}
              {EXPLORE_MENUS.map((m) => (
                <Link
                  key={m.id}
                  to={m.to}
                  className={`explore-card${m.featured ? ' featured' : ''}`}
                >
                  <span className="explore-icon">
                    <Icon name={m.icon} size={28} />
                  </span>
                  <span className="explore-text">
                    <span className="explore-name">{m.name}</span>
                    <span className="explore-short">{m.short}</span>
                  </span>
                  <Icon name="chevronRight" size={20} className="explore-chevron" />
                </Link>
              ))}
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
  announcements: Announcement[] | null
  dataLoading: boolean
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
    announcements,
    dataLoading,
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

  // Pengumuman terbaru untuk banner (sudah dimuat HomePage, limit 3,
  // filter scope sama seperti halaman Pengumuman).
  const latestAnnouncement = announcements?.[0] ?? null
  const latestExcerpt =
    latestAnnouncement?.body && latestAnnouncement.body.length > 120
      ? `${latestAnnouncement.body.slice(0, 120).trimEnd()}…`
      : (latestAnnouncement?.body ?? '')

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

  // Progress Belajar (data asli): lesson selesai / total lesson di semua
  // course yang diikuti. Ring disembunyikan bila siswa belum punya
  // enrollment; "—" bila course yang diikuti belum punya materi.
  const RING_CIRC = 2 * Math.PI * 42
  const totalLessonsAll = enrolledIds.reduce(
    (n, id) => n + (lessonTotals.get(id) ?? 0),
    0,
  )
  const doneAll = progress.filter(
    (p) =>
      p.status === 'completed' &&
      lessonCourse.get(p.lesson_id) !== undefined &&
      enrolledIdSet.has(lessonCourse.get(p.lesson_id) as string),
  ).length
  const progressPct =
    enrolledIds.length === 0 || totalLessonsAll === 0
      ? null
      : Math.round((doneAll / totalLessonsAll) * 100)

  return (
    <>
      <section className="dash-hero">
        <img
          src="./home-hero-cinematic.webp"
          alt="Pelajar dengan kamera di tripod di lokasi syuting"
          className="dash-hero-photo"
        />
        <div className="dash-hero-shade" aria-hidden="true" />
        <div className="dash-hero-accent" aria-hidden="true" />
        <div className="dash-hero-content">
          <h1>{firstName ? `Halo, ${firstName}!` : 'Halo!'}</h1>
          <p>{heroSub}</p>
          <div className="dash-hero-actions">
            <Link to="/akademi" className="btn-mint">
              Lanjut Belajar →
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
        </div>
      </section>

      <nav className="quick-grid" aria-label="Jalan pintas">
        <Link to="/akademi/perkenalan" className="quick-tile">
          <Icon name="academy" size={24} />
          Kursus Saya
        </Link>
        <Link to="/tenggat" className="quick-tile">
          <Icon name="fileText" size={24} />
          Tugas
        </Link>
        <Link to="/nilai" className="quick-tile">
          <Icon name="chart" size={24} />
          Nilai
        </Link>
        <Link to="/pustaka" className="quick-tile">
          <Icon name="library" size={24} />
          Materi
        </Link>
        <Link to="/komunitas/perkenalan" className="quick-tile">
          <Icon name="community" size={24} />
          Komunitas
        </Link>
        <Link to="/acara" className="quick-tile">
          <Icon name="event" size={24} />
          Acara
        </Link>
        <Link to="/portofolio" className="quick-tile">
          <Icon name="portfolio" size={24} />
          Portofolio
        </Link>
        <Link to="/profil" className="quick-tile">
          <Icon name="user" size={24} />
          Profil
        </Link>
      </nav>

      {enrolledIds.length > 0 && (
        <section className="ring-card" aria-label="Progress belajar">
          <div className="ring-wrap">
            <svg className="ring-svg" viewBox="0 0 96 96" aria-hidden="true">
              <circle className="ring-bg" cx="48" cy="48" r="42" />
              <circle
                className="ring-fg"
                cx="48"
                cy="48"
                r="42"
                strokeDasharray={RING_CIRC}
                strokeDashoffset={
                  progressPct === null ? RING_CIRC : RING_CIRC * (1 - progressPct / 100)
                }
              />
            </svg>
            <span className="ring-num">{progressPct === null ? '—' : `${progressPct}%`}</span>
          </div>
          <div className="ring-body">
            <h3>Progress Belajar</h3>
            <p>
              {progressPct === null
                ? 'Kursus yang kamu ikuti belum punya materi.'
                : `${doneAll} dari ${totalLessonsAll} materi selesai di ${enrolledIds.length} kursus.`}
            </p>
            {progressPct !== null && (
              <div
                className="progress-track"
                role="progressbar"
                aria-valuenow={progressPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Progress belajar: ${progressPct} persen`}
              >
                <div className="progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
            )}
          </div>
          <span className="ring-action">
            <Link to="/akademi" className="btn btn-ghost btn-small">
              Lihat Academy →
            </Link>
          </span>
        </section>
      )}

      <section className="section">
        <div className="dash-section-head">
          <h2>Kursus Aktif</h2>
          <Link to="/akademi" className="dash-more">
            Lihat Semua →
          </Link>
        </div>
        {dataLoading ? (
          <p className="muted">Memuat progres kursus…</p>
        ) : myCourses.length === 0 ? (
          <div className="empty-card">
            <h3>Belum ada kursus aktif</h3>
            <p>Ikuti kursus pertamamu dari katalog Academy.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {myCourses.map((c) => {
              const total = lessonTotals.get(c.id) ?? 0
              const done = doneCount(c.id)
              const pct = total > 0 ? Math.round((done / total) * 100) : 0
              return (
                <Link key={c.id} to={`/course/${c.id}`} className="dash-course">
                  <div className="dash-course-cover">
                    {c.cover_url ? (
                      <img src={c.cover_url} alt="" />
                    ) : (
                      <Icon name="film" size={32} />
                    )}
                    <span className="dash-course-status">
                      {pct === 100 ? 'Selesai' : 'Aktif'}
                    </span>
                  </div>
                  <div className="dash-course-body">
                    <h3>{c.title}</h3>
                    <p className="dash-course-meta">
                      {done} dari {total} materi
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
                  <span className="dash-course-play">
                    <Icon name="play" size={20} />
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {latestAnnouncement && (
        <Link to="/pengumuman" className="announce-banner">
          <span className="announce-icon">
            <Icon name="announcement" size={24} />
          </span>
          <span className="announce-body">
            <strong>{latestAnnouncement.title}</strong>
            {latestExcerpt && <span>{latestExcerpt}</span>}
          </span>
          <span className="announce-chevron">
            <Icon name="chevronRight" size={20} />
          </span>
        </Link>
      )}

      <section className="section">
        <div className="dash-section-head">
          <h2>Rekomendasi Untukmu</h2>
          <Link to="/akademi" className="dash-more">
            Lihat Semua →
          </Link>
        </div>
        {recommendations.length === 0 ? (
          <p className="empty">Tidak ada rekomendasi saat ini.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {recommendations.map((r) => {
              // Kartu rekomendasi memakai treatment kartu kursus dashboard:
              // thumbnail asli, judul, meta, tombol putar/chevron. Alasan
              // (reason) menjelaskan kenapa direkomendasikan — skor angka
              // internal tidak ditampilkan karena tidak bermakna bagi siswa.
              const course = r.kind === 'course' ? courseById.get(r.id) : undefined
              const cover =
                course?.cover_url ??
                (r.kind === 'course' ? courseIllustration(r.id) : null)
              const week = r.kind === 'course' ? rpsWeekLabel(r.id) : null
              const meta =
                r.kind === 'course'
                  ? [week, course?.category ?? 'Kursus'].filter(Boolean).join(' · ')
                  : 'Proyek mencari kru'
              return (
                <Link key={`${r.kind}-${r.id}`} to={r.to} className="dash-course">
                  <div className="dash-course-cover">
                    {cover ? (
                      <img src={cover} alt="" loading="lazy" />
                    ) : (
                      <Icon name={r.kind === 'course' ? 'film' : 'crew'} size={32} />
                    )}
                  </div>
                  <div className="dash-course-body">
                    <h3>{r.title}</h3>
                    <p className="dash-course-meta">{meta}</p>
                    <p className="dash-course-meta">{r.reason}</p>
                  </div>
                  <span className="dash-course-play">
                    <Icon name={r.kind === 'course' ? 'play' : 'chevronRight'} size={20} />
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      <section className="section">
        <h2>Feedback Terbaru</h2>
        {dataLoading ? (
          <p className="muted">Memuat feedback…</p>
        ) : feedback.length === 0 ? (
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
        {dataLoading ? (
          <p className="muted">Memuat tugas…</p>
        ) : tasks.length === 0 ? (
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
        {dataLoading ? (
          <p className="muted">Memuat proyek…</p>
        ) : myProjects.length === 0 && openCrew.length === 0 ? (
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
        <div className="dash-section-head">
          <h2>Event Mendatang</h2>
          <Link to="/acara" className="dash-more">
            Lihat Semua →
          </Link>
        </div>
        {dataLoading ? (
          <p className="muted">Memuat event…</p>
        ) : upcomingEvents.length === 0 ? (
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

// Status lamaran mentor dalam Bahasa Indonesia (bukan mentah "pending").
function mentorStatusLabel(status: string): string {
  if (status === 'pending') return 'Menunggu persetujuan'
  if (status === 'approved') return 'Disetujui'
  if (status === 'rejected') return 'Ditolak'
  if (status === 'revision_required') return 'Diminta revisi'
  return status
}

// Status pengajuan sekolah dalam Bahasa Indonesia.
function schoolSubmissionStatusLabel(status: string): string {
  if (status === 'pending') return 'Menunggu'
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
  // Ringkasan Ruang Komunikasi Mentor (Fase 1, migrasi 060/061).
  const [groupSummary, setGroupSummary] = useState<MentorGroupSummary | null>(null)
  const [groupSummaryFailed, setGroupSummaryFailed] = useState(false)

  async function load() {
    try {
      const mine = courses.filter((c) => c.mentor_id === userId)
      // LB1: klaim mengampu + office hours TIDAK bergantung pada rantai
      // statistik course (enrollment → lesson → tugas → antrean) — keduanya
      // diluncurkan BERSAMAAN dengan rantai itu, bukan sesudahnya.
      // Sebelumnya ~9 round-trip berjalan berurutan dan Mentor Workspace
      // stuck di "Memuat…" ±10 detik; kini hanya rantai terpanjang yang
      // menentukan waktu muat.
      const claimsP = safe(
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
      const hoursP = (async () => {
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
        if (hours.length === 0) return [] as MentorBookingRow[]
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
        return upcoming.map((x) => ({
          hour: x.hour,
          booking: x.booking,
          studentName: bNames.get(x.booking.user_id) ?? 'Siswa',
        }))
      })()
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

      // Klaim + pesanan mentoring sudah diluncurkan paralel di atas —
      // tinggal tunggu hasilnya bersamaan di akhir.
      const [cl, hourBookings] = await Promise.all([claimsP, hoursP])
      setClaims(cl)
      setBookings(hourBookings)
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
  // Ringkasan grup mentor dimuat terpisah dan TIDAK boleh merusak halaman:
  // bila migrasi 060/061 belum ada, kartu menampilkan pesan jujur.
  useEffect(() => {
    let cancelled = false
    fetchMentorGroupSummary(userId)
      .then((s) => {
        if (!cancelled) setGroupSummary(s)
      })
      .catch(() => {
        if (!cancelled) setGroupSummaryFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  async function handleClaim(courseId: string) {
    if (claimingId) return
    setClaimingId(courseId)
    setNotice(null)
    // Klaim yang ditolak boleh diajukan ulang (migrasi 022): baris yang
    // sama dikembalikan ke 'pending', bukan insert duplikat.
    const existing = claims.find((cl) => cl.course_id === courseId)
    if (existing?.status === 'rejected') {
      const { error: updErr } = await supabase.from('course_claims')
        .update({ status: 'pending' })
        .eq('id', existing.id)
      setClaimingId(null)
      if (updErr) {
        setNotice('Pengajuan gagal dikirim ulang. Coba lagi.')
        return
      }
      setNotice('Pengajuan mengampu dikirim ulang. Admin akan meninjau kembali.')
    } else {
      const { error: insErr } = await supabase.from('course_claims').insert({
        course_id: courseId,
        mentor_id: userId,
        status: 'pending',
      })
      setClaimingId(null)
      if (insErr) {
        setNotice(/duplicate|unique|23505/i.test(insErr.message)
          ? 'Pengajuan kamu masih menunggu persetujuan.'
          : 'Pengajuan gagal terkirim. Coba lagi.')
        return
      }
      setNotice(
        'Pengajuan mengampu terkirim. Setelah disetujui admin, kamu otomatis menjadi mentor kursus itu.',
      )
    }
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
      <section className="dash-hero">
        <img
          src="./home-hero-shoot.webp"
          alt="Pelajar SMA/SMK sedang syuting film pendek di luar ruangan"
          className="dash-hero-photo"
        />
        <div className="dash-hero-shade" aria-hidden="true" />
        <div className="dash-hero-accent" aria-hidden="true" />
        <div className="dash-hero-content">
          <p className="landing-hero-eyebrow" style={{ color: 'var(--mint)' }}>
            MENTOR WORKSPACE
          </p>
          <h1>Halo, {firstName}!</h1>
          <div style={{ marginBottom: '0.75rem' }}>
            <span className="pill-active">Mentor</span>
          </div>
          <p>
            <span style={{ whiteSpace: 'nowrap' }}>{rows.length} kursus diampu</span>
            {' · '}
            <span style={{ whiteSpace: 'nowrap' }}>{totalStudents} siswa</span>
            {' · '}
            <span style={{ whiteSpace: 'nowrap' }}>
              {pendingTotal} tugas menunggu dinilai
            </span>
          </p>
          <div className="dash-hero-actions">
            <Link to="/mentor/penilaian" className="btn-mint">
              Buka Antrean Penilaian
            </Link>
            <Link to="/mentor/course-builder" className="btn btn-outline-light">
              Course Builder
            </Link>
          </div>
        </div>
      </section>

      {notice && <p className="notice-box">{notice}</p>}

      {/* Ringkasan Aktivitas — semuanya hitungan asli: course yang diampu,
          siswa distinct di course itu, dan submission menunggu dinilai. */}
      <section className="section" aria-label="Ringkasan aktivitas">
        <div className="dash-section-head">
          <h2>Ringkasan Aktivitas</h2>
        </div>
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-num">{rows.length}</span>
            <span className="stat-label">Kursus diampu</span>
          </div>
          <div className="stat-card">
            <span className="stat-num">{totalStudents}</span>
            <span className="stat-label">Total siswa</span>
            <Link to="/mentor/siswa">Lihat siswa →</Link>
          </div>
          <div className="stat-card">
            <span className="stat-num">{pendingTotal}</span>
            <span className="stat-label">Tugas menunggu dinilai</span>
            <Link to="/mentor/penilaian">Buka antrean →</Link>
          </div>
        </div>
      </section>

      {/* Ruang Komunikasi Mentor (Fase 1, migrasi 060/061) — grup resmi
          admin + mentor; ringkasan unread + pesan terakhir. */}
      <section className="section">
        <div className="dash-section-head">
          <h2>Ruang Komunikasi Mentor</h2>
        </div>
        {groupSummaryFailed ? (
          <p className="muted">
            Ringkasan grup belum bisa dimuat — grup chat mentor belum aktif di server.
          </p>
        ) : !groupSummary ? (
          <p className="muted">Memuat ringkasan grup…</p>
        ) : (
          <>
            <p>
              {groupSummary.unread > 0
                ? `${groupSummary.unread} pesan belum dibaca.`
                : 'Semua pesan sudah dibaca.'}
            </p>
            {groupSummary.latest ? (
              <p className="muted">
                Terakhir dari {groupSummary.latest.senderName} ·{' '}
                {fmtDate(groupSummary.latest.createdAt)}: {groupSummary.latest.body.slice(0, 120)}
                {groupSummary.latest.body.length > 120 ? '…' : ''}
              </p>
            ) : (
              <p className="muted">Belum ada pesan di grup.</p>
            )}
          </>
        )}
        <p>
          <Link to="/komunitas-mentor" className="btn btn-primary">
            Buka Ruang Komunikasi Mentor
          </Link>
        </p>
      </section>

      <section className="section">
        <div className="dash-section-head">
          <h2>Course Anda</h2>
          <Link to="/akademi" className="dash-more">
            Lihat Semua →
          </Link>
        </div>
        {rows.length === 0 ? (
          <p className="empty">
            Kamu belum mengampu kursus apa pun. Ajukan kursus tanpa mentor di bawah.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {rows.map((r) => (
              <Link
                key={r.course.id}
                to={`/mentor/course/${r.course.id}`}
                className="dash-course"
              >
                <div className="dash-course-cover">
                  {r.course.cover_url ? (
                    <img src={r.course.cover_url} alt="" />
                  ) : (
                    <Icon name="academy" size={32} />
                  )}
                </div>
                <div className="dash-course-body">
                  <h3>{r.course.title}</h3>
                  <p className="dash-course-meta">
                    {r.students} siswa • {r.pending} tugas menunggu penilaian
                  </p>
                </div>
                <span className="dash-course-play">
                  <Icon name="play" size={20} />
                </span>
              </Link>
            ))}
          </div>
        )}
        <div className="action-grid">
          <Link to="/mentor/siswa" className="btn btn-secondary">
            Siswa
          </Link>
          <Link to="/mentor/diskusi" className="btn btn-secondary">
            Diskusi
          </Link>
          <Link to="/mentor/analitik" className="btn btn-secondary">
            Analitik
          </Link>
          <Link to="/rps" className="btn btn-ghost">
            Lihat RPS (read-only)
          </Link>
        </div>
      </section>

      <div className="grade-motivation" style={{ marginBottom: '1.25rem' }}>
        <span className="announce-icon">
          <Icon name="star" size={24} />
        </span>
        <span>Terima kasih atas kontribusimu di SINEVERSE!</span>
      </div>

      <section className="section">
        <div className="dash-section-head">
          <h2>Antrean Penilaian Terbaru</h2>
          <Link to="/mentor/penilaian" className="dash-more">
            Lihat Semua →
          </Link>
        </div>
        <p className="muted">{pendingTotal} tugas menunggu dinilai.</p>
        {queue.length === 0 ? (
          <p className="empty">Tidak ada tugas yang menunggu penilaian.</p>
        ) : (
          <ul className="list">
            {queue.map((row) => (
              <li key={row.submission.id} className="task-card">
                <span className="task-icon">
                  <Icon name="fileText" size={24} />
                </span>
                <div className="task-body">
                  <h3>{row.assignment.title}</h3>
                  <p>
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
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Kursus Tanpa Pengampu</h2>
        {unassigned.length === 0 ? (
          <p className="empty">Tidak ada kursus tanpa mentor saat ini.</p>
        ) : (
          <ul className="list">
            {unassigned.map((c) => {
              const claim = claims.find((cl) => cl.course_id === c.id)
              return (
                <li key={c.id} className="list-row">
                  <span>{c.title}</span>
                  <span>
                    {claim ? (
                      claim.status === 'rejected' ? (
                        <>
                          <span className="muted">
                            Pengajuan: Ditolak
                            {claim.decision_note ? `: ${claim.decision_note}` : ''}
                          </span>{' '}
                          <button
                            type="button"
                            className="btn btn-ghost btn-small"
                            disabled={claimingId === c.id}
                            onClick={() => void handleClaim(c.id)}
                          >
                            {claimingId === c.id ? 'Mengajukan…' : 'Ajukan Lagi'}
                          </button>
                        </>
                      ) : (
                        <span className="muted">
                          Pengajuan: {claimStatusLabel(claim.status)}
                        </span>
                      )
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
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Baru Dinilai</h2>
        {graded.length === 0 ? (
          <p className="empty">Belum ada tugas yang kamu nilai.</p>
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
        <div className="dash-section-head">
          <h2>Pengumuman</h2>
          <Link to="/pengumuman" className="dash-more">
            Lihat Semua →
          </Link>
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
  // B64 (K13): sumber data yang gagal dimuat (bukan profil) — ditampilkan
  // sebagai penanda per sumber, bukan disamarkan sebagai angka 0.
  const [loadWarnings, setLoadWarnings] = useState<string[]>([])
  const [targetLabels, setTargetLabels] = useState<
    Map<string, { label: string; to: string | null }>
  >(new Map())
  const [apps, setApps] = useState<MentorApplication[]>([])
  const [schools, setSchools] = useState<School[]>([])
  // Pengajuan sekolah manual + nama wilayah untuk tampilannya (migrasi 027).
  const [schoolSubs, setSchoolSubs] = useState<SchoolSubmission[]>([])
  const [provinceNames, setProvinceNames] = useState<Map<string, string>>(new Map())
  const [regencyNames, setRegencyNames] = useState<Map<string, string>>(new Map())
  // Penolakan/revisi lamaran mentor meminta catatan (migrasi 027).
  const [appAction, setAppAction] = useState<{ id: string; kind: 'reject' | 'revision' } | null>(null)
  const [appNote, setAppNote] = useState('')
  // Penolakan pengajuan sekolah meminta alasan (migrasi 027).
  const [rejectingSubId, setRejectingSubId] = useState<string | null>(null)
  const [subNote, setSubNote] = useState('')
  const [discReports, setDiscReports] = useState<DiscussionReport[]>([])
  const [modReports, setModReports] = useState<ModerationReport[]>([])
  const [activity, setActivity] = useState<AdminActivityRow[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // B65: satu kunci busy per aksi keputusan admin di Beranda.
  const [busyKey, setBusyKey] = useState<string | null>(null)
  // Statistik platform (data asli): filter periode + ring Progress Academy.
  const [period, setPeriod] = useState<'all' | '7' | '30' | '90'>('all')
  const [profileTimestamps, setProfileTimestamps] = useState<
    { role: string; created_at: string }[]
  >([])
  const [certIssuedAt, setCertIssuedAt] = useState<string[]>([])
  const [academyProgress, setAcademyProgress] = useState<{
    pct: number | null
    done: number
    total: number
  } | null>(null)
  // Ringkasan Ruang Komunikasi Mentor (Fase 1, migrasi 060/061).
  const [groupSummary, setGroupSummary] = useState<MentorGroupSummary | null>(null)
  const [groupSummaryFailed, setGroupSummaryFailed] = useState(false)

  async function load() {
    try {
      // B64 (K13): fetch best-effort yang gagal TETAP dicatat sumbernya —
      // fallback dipakai untuk angka, tapi kegagalannya ditampilkan sebagai
      // penanda, bukan disamarkan sebagai 0.
      const failedSources: string[] = []
      async function tracked<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
        try {
          return await fn()
        } catch {
          failedSources.push(label)
          return fallback
        }
      }
      // Tujuh fetch independen dijalankan PARALEL dalam satu batch, bukan
      // berurutan — sebelumnya delapan await berurutan membuat Beranda admin
      // paling lambat. fetchProfileNames menyusul setelah profil didapat.
      const [
        { data: profiles, error: profilesErr },
        { count: filmCount },
        enrRows,
        certRows,
        appData,
        subData,
        schoolData,
        dData,
        mData,
        schoolTotals,
      ] = await Promise.all([
        supabase.from('profiles').select('id,name,role,created_at'),
        tracked(
          'film',
          async () => {
            const { count, error } = await supabase.from('films').select('id', { count: 'exact', head: true })
            if (error) throw error
            return { count }
          },
          { count: 0 } as { count: number | null },
        ),
        // Enrollment + sertifikat diambil sebagai baris (bukan hitung saja)
        // supaya bisa difilter periode lewat enrolled_at / issued_at.
        tracked(
          'enrollment',
          async () => {
            const { data, error } = await supabase
              .from('enrollments')
              .select('id,user_id,course_id,enrolled_at')
            if (error) throw error
            return (data ?? []) as {
              id: string
              user_id: string
              course_id: string
              enrolled_at: string
            }[]
          },
          [] as { id: string; user_id: string; course_id: string; enrolled_at: string }[],
        ),
        tracked(
          'sertifikat',
          async () => {
            const { data, error } = await supabase.from('certificates').select('id,issued_at')
            if (error) throw error
            return (data ?? []) as { id: string; issued_at: string }[]
          },
          [] as { id: string; issued_at: string }[],
        ),
        tracked('lamaran mentor', async () => fetchMentorApplications(), [] as MentorApplication[]),
        tracked('pengajuan sekolah', async () => fetchSchoolSubmissions(), [] as SchoolSubmission[]),
        tracked(
          'sekolah',
          async () => {
            const { data, error } = await supabase.from('schools').select('*').order('name')
            if (error) throw error
            return (data ?? []) as School[]
          },
          [] as School[],
        ),
        tracked(
          'laporan diskusi',
          async () => {
            const { data, error } = await supabase
              .from('discussion_reports')
              .select('*')
              .eq('status', 'open')
              .order('created_at', { ascending: false })
            if (error) throw error
            return (data ?? []) as DiscussionReport[]
          },
          [] as DiscussionReport[],
        ),
        tracked(
          'laporan moderasi',
          async () => {
            const { data, error } = await supabase
              .from('moderation_reports')
              .select('*')
              .eq('status', 'open')
              .order('created_at', { ascending: false })
            if (error) throw error
            return (data ?? []) as ModerationReport[]
          },
          [] as ModerationReport[],
        ),
        // K13: total sekolah dari hitung server (count exact) — panjang
        // array select('*') di atas terpotong di 1000 baris oleh PostgREST
        // dan pernah membuat hero menampilkan "1000 sekolah".
        tracked('total sekolah', async () => fetchSchoolTotals(), { total: 0, verified: 0, unverified: 0 }),
      ])
      // Kegagalan memuat profil jangan disamarkan sebagai 0 pengguna.
      if (profilesErr) {
        setUsersError('Data pengguna gagal dimuat.')
      } else {
        setUsersError(null)
      }
      const profs = (profiles ?? []) as {
        id: string
        name: string | null
        role: string
        created_at: string
      }[]
      setProfileTimestamps(
        profs.map((p) => ({ role: p.role, created_at: p.created_at })),
      )
      setCertIssuedAt(certRows.map((c) => c.issued_at))
      setNames(await fetchProfileNames(profs.map((p) => p.id)))
      const [provMap, regMap] = await Promise.all([
        fetchRefNameMap('ref_provinces'),
        fetchRefNameMap('ref_regencies'),
      ])
      setProvinceNames(provMap)
      setRegencyNames(regMap)
      // K13: angka ringkasan lewat helper bersama (lib/counts.ts); total +
      // belum-terverifikasi sekolah dari hitung server, bukan panjang
      // array (terpotong 1000 baris).
      const roleCounts = countUsersByRole(profs)
      setCounts({
        users: roleCounts.total,
        siswa: roleCounts.siswa,
        mentor: roleCounts.mentor,
        admin: roleCounts.admin,
        schools: schoolTotals.total,
        films: filmCount ?? 0,
        enrollments: countEnrollments(enrRows).enrolled,
        pendingApps: appData.filter((a) => a.status === 'pending').length,
        openReports: dData.length + mData.length,
        unverifiedSchools: schoolTotals.unverified,
      })
      setApps(appData)
      setSchoolSubs(subData)
      setSchools(schoolData)
      setDiscReports(dData)
      setModReports(mData)

      // Progress Academy (data asli): lesson selesai / (siswa terdaftar ×
      // lesson) di semua course. Hanya progres siswa yang terdaftar di
      // course lesson itu yang dihitung; gagal memuat → null ("—").
      const academy = await tracked('progres academy',
        async () => {
          // B64: .error tiap sub-query diperiksa — gagal = penanda sumber,
          // bukan progres 0 yang menyamarkan kegagalan.
          const { data: modData, error: modErr } = await supabase
            .from('modules')
            .select('id,course_id')
          if (modErr) throw modErr
          const mods = (modData ?? []) as { id: string; course_id: string }[]
          if (mods.length === 0) return { pct: null, done: 0, total: 0 }
          const { data: lesData, error: lesErr } = await supabase
            .from('lessons')
            .select('id,module_id')
            .in(
              'module_id',
              mods.map((m) => m.id),
            )
          if (lesErr) throw lesErr
          const lessons = (lesData ?? []) as { id: string; module_id: string }[]
          if (lessons.length === 0) return { pct: null, done: 0, total: 0 }
          const modCourse = new Map(mods.map((m) => [m.id, m.course_id]))
          const lessonCourseMap = new Map(
            lessons.map((l) => [l.id, modCourse.get(l.module_id) ?? '']),
          )
          const lessonsByCourse = new Map<string, number>()
          for (const l of lessons) {
            const cid = lessonCourseMap.get(l.id) ?? ''
            lessonsByCourse.set(cid, (lessonsByCourse.get(cid) ?? 0) + 1)
          }
          const enrolledByCourse = new Map<string, Set<string>>()
          for (const e of enrRows) {
            if (!enrolledByCourse.has(e.course_id)) {
              enrolledByCourse.set(e.course_id, new Set())
            }
            enrolledByCourse.get(e.course_id)?.add(e.user_id)
          }
          let total = 0
          for (const [cid, users] of enrolledByCourse) {
            total += users.size * (lessonsByCourse.get(cid) ?? 0)
          }
          if (total === 0) return { pct: null, done: 0, total: 0 }
          const { data: progData, error: progErr } = await supabase
            .from('lesson_progress')
            .select('lesson_id,user_id')
            .eq('status', 'completed')
            .in(
              'lesson_id',
              lessons.map((l) => l.id),
            )
          if (progErr) throw progErr
          let done = 0
          for (const p of (progData ?? []) as { lesson_id: string; user_id: string }[]) {
            const cid = lessonCourseMap.get(p.lesson_id) ?? ''
            if (enrolledByCourse.get(cid)?.has(p.user_id)) done += 1
          }
          return { pct: Math.round((done / total) * 100), done, total }
        },
        null as { pct: number | null; done: number; total: number } | null,
      )
      setAcademyProgress(academy)

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
      const aRows = await tracked('audit log',
        async () => {
          const { data, error } = await supabase
            .from('audit_log')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5)
          if (error) throw error
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
        const newest = await tracked('pendaftaran terbaru',
          async () => {
            const { data, error } = await supabase
              .from('profiles')
              .select('id,name,role,created_at')
              .order('created_at', { ascending: false })
              .limit(5)
            if (error) throw error
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
      // B64: tampilkan sumber data yang gagal dimuat sebagai penanda.
      setLoadWarnings(failedSources)
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
  // Ringkasan grup mentor dimuat terpisah dan TIDAK boleh merusak halaman:
  // bila migrasi 060/061 belum ada, kartu menampilkan pesan jujur.
  useEffect(() => {
    let cancelled = false
    fetchMentorGroupSummary(userId)
      .then((s) => {
        if (!cancelled) setGroupSummary(s)
      })
      .catch(() => {
        if (!cancelled) setGroupSummaryFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  async function decideApp(
    app: MentorApplication,
    decision: 'approved' | 'rejected' | 'revision_required',
    note = '',
  ) {
    // B65: tolak pemanggilan kedua selagi satu keputusan masih berjalan.
    const key = `app-${app.id}-${decision}`
    if (busyKey) return
    setBusyKey(key)
    try {
      // Hanya status + catatan yang diubah dari client. Trigger
      // promote_mentor_on_approval di database yang mengubah profiles.role
      // menjadi 'mentor' saat lamaran disetujui.
      try {
        await decideMentorApplication(app, decision, note, userId)
      } catch {
        setNotice('Gagal menyimpan keputusan. Coba lagi.')
        return
      }
      await logAudit(
        decision === 'approved'
          ? 'mentor_application.approved'
          : decision === 'rejected'
            ? 'mentor_application.rejected'
            : 'mentor_application.revision_required',
        'mentor_applications',
        app.id,
        { user_id: app.user_id },
      )
      setNotice(
        decision === 'approved'
          ? 'Lamaran mentor disetujui. Peran diubah menjadi mentor oleh trigger database.'
          : decision === 'rejected'
            ? 'Lamaran mentor ditolak. Alasan tersimpan dan terlihat oleh pelamar.'
            : 'Lamaran diminta revisi. Catatan tersimpan dan terlihat oleh pelamar.',
      )
      setAppAction(null)
      setAppNote('')
      await load()
    } finally {
      setBusyKey(null)
    }
  }

  async function decideSub(sub: SchoolSubmission, decision: 'approved' | 'rejected', note = '') {
    // B65: kunci busy per baris keputusan.
    const key = `sub-${sub.id}-${decision}`
    if (busyKey) return
    setBusyKey(key)
    try {
      // Setujui: sekolah dibuat (bila belum ada yang cocok) lalu ditautkan
      // ke pengajuan + profil pengaju. Tolak: alasan tersimpan.
      try {
        await decideSchoolSubmission(sub, decision, note, userId)
      } catch {
        setNotice('Gagal menyimpan keputusan. Coba lagi.')
        return
      }
      await logAudit(
        decision === 'approved' ? 'school_submission.approved' : 'school_submission.rejected',
        'school_submissions',
        sub.id,
        { user_id: sub.user_id },
      )
      setNotice(
        decision === 'approved'
          ? 'Pengajuan sekolah disetujui — sekolah ditambahkan dan ditautkan ke pengaju.'
          : 'Pengajuan sekolah ditolak. Alasan tersimpan dan terlihat oleh pengaju.',
      )
      setRejectingSubId(null)
      setSubNote('')
      await load()
    } finally {
      setBusyKey(null)
    }
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

  // --- Statistik platform per periode (data asli) ---
  // Window: profiles.created_at (siswa/mentor), certificates.issued_at.
  // Total Course TIDAK difilter — itu jumlah katalog, bukan kejadian.
  // Progress Academy TIDAK difilter — penyelesaian bersifat kumulatif;
  // memotong pembilang (completed_at) tanpa penyebut yang sepadan akan
  // menghasilkan persentase yang salah.
  const periodDays = period === 'all' ? null : Number(period)
  const periodCutoff = periodDays === null ? null : Date.now() - periodDays * 86400000
  const inWindow = (ts: string) =>
    periodCutoff !== null && new Date(ts).getTime() >= periodCutoff
  const inPrevWindow = (ts: string) =>
    periodCutoff !== null &&
    periodDays !== null &&
    new Date(ts).getTime() >= periodCutoff - periodDays * 86400000 &&
    new Date(ts).getTime() < periodCutoff
  const countIn = (rows: { created_at: string; role: string }[], role: string, win: (ts: string) => boolean) =>
    rows.filter((r) => r.role === role && win(r.created_at)).length
  const siswaPeriod =
    periodCutoff === null ? counts.siswa : countIn(profileTimestamps, 'siswa', inWindow)
  const mentorPeriod =
    periodCutoff === null ? counts.mentor : countIn(profileTimestamps, 'mentor', inWindow)
  const certPeriod =
    periodCutoff === null ? certIssuedAt.length : certIssuedAt.filter(inWindow).length
  // Delta vs jendela sebelumnya yang sama panjang; null bila jendela
  // sebelumnya kosong (tidak bisa dihitung) atau periode "Semua" — garis
  // delta dihilangkan, bukan dikarang.
  const deltaPct = (curr: number, prev: number): number | null =>
    periodDays === null || prev <= 0 ? null : Math.round(((curr - prev) / prev) * 100)
  const siswaDelta = deltaPct(
    siswaPeriod,
    countIn(profileTimestamps, 'siswa', inPrevWindow),
  )
  const mentorDelta = deltaPct(
    mentorPeriod,
    countIn(profileTimestamps, 'mentor', inPrevWindow),
  )
  const certDelta = deltaPct(
    certPeriod,
    certIssuedAt.filter(inPrevWindow).length,
  )
  const deltaLine = (d: number | null) =>
    d === null || periodDays === null ? null : (
      <span
        className="muted"
        style={{ display: 'block', fontSize: '0.85rem', marginTop: '0.25rem' }}
      >
        {d >= 0 ? '↑' : '↓'} {Math.abs(d)}% dari {periodDays} hari sebelumnya
      </span>
    )
  const RING_CIRC = 2 * Math.PI * 42
  const academyPct = academyProgress?.pct ?? null

  return (
    <>
      <section className="dash-hero">
        <img
          src="./home-hero-screening.webp"
          alt="Pemutaran film malam di lapangan dengan layar besar"
          className="dash-hero-photo"
        />
        <div className="dash-hero-shade" aria-hidden="true" />
        <div className="dash-hero-accent" aria-hidden="true" />
        <div className="dash-hero-content">
          <p className="landing-hero-eyebrow" style={{ color: 'var(--mint)' }}>
            ADMIN PANEL
          </p>
          <h1>Ringkasan SINEVERSE</h1>
          <p>
            Halo, {firstName}! {formatCountId(counts.users)} pengguna ·{' '}
            {formatCountId(counts.schools)} sekolah · {formatCountId(courses.length)} kursus ·{' '}
            {formatCountId(counts.films)} film · {formatCountId(counts.enrollments)} pendaftaran
            kursus
          </p>
          <div className="dash-hero-actions">
            <Link to="/admin" className="btn-mint">
              Buka Admin Panel
            </Link>
          </div>
        </div>
      </section>

      {notice && <p className="notice-box">{notice}</p>}
      {usersError && <p className="error-box">{usersError}</p>}
      {loadWarnings.length > 0 && (
        <p className="error-box">
          Sebagian data gagal dimuat: {loadWarnings.join(', ')}. Angka dari sumber tersebut mungkin
          menampilkan 0 — coba muat ulang halaman.
        </p>
      )}

            {/* Ruang Komunikasi Mentor (Fase 1, migrasi 060/061) — grup resmi
          admin + mentor; ringkasan unread + pesan terakhir. */}
      <section className="section">
        <div className="dash-section-head">
          <h2>Ruang Komunikasi Mentor</h2>
        </div>
        {groupSummaryFailed ? (
          <p className="muted">
            Ringkasan grup belum bisa dimuat — grup chat mentor belum aktif di server.
          </p>
        ) : !groupSummary ? (
          <p className="muted">Memuat ringkasan grup…</p>
        ) : (
          <>
            <p>
              {groupSummary.unread > 0
                ? `${groupSummary.unread} pesan belum dibaca.`
                : 'Semua pesan sudah dibaca.'}
            </p>
            {groupSummary.latest ? (
              <p className="muted">
                Terakhir dari {groupSummary.latest.senderName} ·{' '}
                {fmtDate(groupSummary.latest.createdAt)}: {groupSummary.latest.body.slice(0, 120)}
                {groupSummary.latest.body.length > 120 ? '…' : ''}
              </p>
            ) : (
              <p className="muted">Belum ada pesan di grup.</p>
            )}
          </>
        )}
        <p>
          <Link to="/komunitas-mentor" className="btn btn-primary">
            Buka Ruang Komunikasi Mentor
          </Link>
        </p>
      </section>

<section className="section" aria-label="Statistik platform">
        <div className="dash-section-head">
          <h2>Statistik Platform</h2>
        </div>
        <div
          role="group"
          aria-label="Filter periode"
          style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}
        >
          {(['all', '7', '30', '90'] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={period === p ? 'btn btn-primary btn-small' : 'btn btn-ghost btn-small'}
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
            >
              {p === 'all' ? 'Semua' : `${p}D`}
            </button>
          ))}
        </div>
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-num">{siswaPeriod}</span>
            <span className="stat-label">
              {period === 'all' ? 'Total Siswa' : `Siswa baru (${period} hari terakhir)`}
            </span>
            {deltaLine(siswaDelta)}
            <Link to="/admin/pengguna">Lihat →</Link>
          </div>
          <div className="stat-card">
            <span className="stat-num">{mentorPeriod}</span>
            <span className="stat-label">
              {period === 'all' ? 'Total Mentor' : `Mentor baru (${period} hari terakhir)`}
            </span>
            {deltaLine(mentorDelta)}
            <Link to="/admin/pengguna">Lihat →</Link>
          </div>
          <div className="stat-card">
            <span className="stat-num">{courses.length}</span>
            <span className="stat-label">Total Course</span>
            <Link to="/akademi">Lihat →</Link>
          </div>
          <div className="stat-card">
            <span className="stat-num">{certPeriod}</span>
            <span className="stat-label">
              {period === 'all'
                ? 'Sertifikat Diterbitkan'
                : `Sertifikat diterbitkan (${period} hari terakhir)`}
            </span>
            {deltaLine(certDelta)}
            <Link to="/admin/sertifikat">Lihat →</Link>
          </div>
        </div>
        <div className="ring-card" aria-label="Progress Academy">
          <div className="ring-wrap">
            <svg className="ring-svg" viewBox="0 0 96 96" aria-hidden="true">
              <circle className="ring-bg" cx="48" cy="48" r="42" />
              <circle
                className="ring-fg"
                cx="48"
                cy="48"
                r="42"
                strokeDasharray={RING_CIRC}
                strokeDashoffset={
                  academyPct === null ? RING_CIRC : RING_CIRC * (1 - academyPct / 100)
                }
              />
            </svg>
            <span className="ring-num">{academyPct === null ? '—' : `${academyPct}%`}</span>
          </div>
          <div className="ring-body">
            <h3>Progress Academy</h3>
            <p>
              {academyProgress === null
                ? 'Data progres belum tersedia.'
                : academyPct === null
                  ? 'Belum ada enrollment — progres muncul setelah siswa mendaftar course.'
                  : `${academyProgress.done} dari ${academyProgress.total} lesson selesai di semua enrollment.`}
            </p>
            {academyPct !== null && (
              <div
                className="progress-track"
                role="progressbar"
                aria-valuenow={academyPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Progress Academy: ${academyPct} persen`}
              >
                <div className="progress-fill" style={{ width: `${academyPct}%` }} />
              </div>
            )}
          </div>
          <span className="ring-action">
            <Link to="/admin/analitik" className="btn btn-ghost btn-small">
              Analitik →
            </Link>
          </span>
        </div>
        <p className="muted">
          Total Course tidak difilter periode (jumlah katalog). Progress Academy bersifat
          kumulatif dan tidak difilter periode.
        </p>
      </section>

      <section className="section" aria-label="Tindakan yang menunggu">
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
            <span className="stat-label">Sekolah di direktori belum terverifikasi</span>
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
        <div className="dash-section-head">
          <h2>Lamaran Mentor ({apps.filter((a) => a.status === 'pending').length} menunggu)</h2>
          <Link to="/admin#lamaran-mentor" className="dash-more">
            Lihat Semua →
          </Link>
        </div>
        {apps.length === 0 ? (
          <p className="empty">Tidak ada lamaran mentor.</p>
        ) : (
          <ul className="discussion-list">
            {apps.map((a) => (
              <li key={a.id} className="discussion-item">
                <p>
                  <strong>{names.get(a.user_id) ?? 'Pelamar'}</strong> — {mentorStatusLabel(a.status)}
                </p>
                <p>Profesi: {a.profession ?? '—'}</p>
                <p>Keahlian: {(a.expertise ?? []).join(', ') || '—'}</p>
                <p>Pengalaman: {a.experience ?? '—'}</p>
                {a.portfolio_link && (
                  <p>
                    <a href={a.portfolio_link} target="_blank" rel="noreferrer">
                      Portofolio
                    </a>
                  </p>
                )}
                <p>Alasan: {a.reason ?? '—'}</p>
                <p>Sukarela: {a.volunteer_agreed ? 'Ya — menyetujui pernyataan sukarela' : 'Belum menyetujui'}</p>
                {a.decided_at && (
                  <p className="muted">
                    Diputuskan {fmtDate(a.decided_at)}
                    {a.decided_by ? ` oleh ${names.get(a.decided_by) ?? 'admin'}` : ''}
                    {a.decision_note ? ` — ${a.decision_note}` : ''}
                  </p>
                )}
                {a.status === 'pending' && (
                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      disabled={busyKey !== null}
                      onClick={() => void decideApp(a, 'approved')}
                    >
                      {busyKey === `app-${a.id}-approved` ? 'Memproses…' : 'Setujui'}
                    </button>{' '}
                    {appAction?.id === a.id && appAction.kind === 'reject' ? (
                      <>
                        {/* B70: label textarea mengambil baris penuh sendiri. */}
                        <label style={{ flex: '1 1 100%' }}>
                          Alasan penolakan (wajib)
                          <textarea value={appNote} onChange={(e) => setAppNote(e.target.value)} rows={2} placeholder="Tulis alasan penolakan — terlihat oleh pelamar." />
                        </label>{' '}
                        <button type="button" className="btn btn-primary btn-small" disabled={!appNote.trim() || busyKey !== null} onClick={() => void decideApp(a, 'rejected', appNote)}>{busyKey === `app-${a.id}-rejected` ? 'Memproses…' : 'Konfirmasi Tolak'}</button>{' '}
                        <button type="button" className="btn btn-ghost btn-small" onClick={() => { setAppAction(null); setAppNote('') }}>Batal</button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        disabled={busyKey !== null}
                        onClick={() => { setAppAction({ id: a.id, kind: 'reject' }); setAppNote('') }}
                      >
                        Tolak
                      </button>
                    )}{' '}
                    {appAction?.id === a.id && appAction.kind === 'revision' ? (
                      <>
                        {/* B70: label textarea mengambil baris penuh sendiri. */}
                        <label style={{ flex: '1 1 100%' }}>
                          Catatan revisi (wajib)
                          <textarea value={appNote} onChange={(e) => setAppNote(e.target.value)} rows={2} placeholder="Tulis yang perlu diperbaiki pelamar — terlihat oleh pelamar." />
                        </label>{' '}
                        <button type="button" className="btn btn-primary btn-small" disabled={!appNote.trim() || busyKey !== null} onClick={() => void decideApp(a, 'revision_required', appNote)}>{busyKey === `app-${a.id}-revision_required` ? 'Memproses…' : 'Konfirmasi Minta Revisi'}</button>{' '}
                        <button type="button" className="btn btn-ghost btn-small" onClick={() => { setAppAction(null); setAppNote('') }}>Batal</button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        disabled={busyKey !== null}
                        onClick={() => { setAppAction({ id: a.id, kind: 'revision' }); setAppNote('') }}
                      >
                        Minta Revisi
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <div className="dash-section-head">
          <h2>Pengajuan Sekolah Manual ({schoolSubs.filter((s) => s.status === 'pending').length} menunggu)</h2>
          <Link to="/admin#pengajuan-sekolah" className="dash-more">
            Lihat Semua →
          </Link>
        </div>
        {schoolSubs.length === 0 ? (
          <p className="empty">Tidak ada pengajuan sekolah.</p>
        ) : (
          <ul className="discussion-list">
            {schoolSubs.map((s) => (
              <li key={s.id} className="discussion-item">
                <p>
                  <strong>{s.name}</strong>
                  {s.npsn ? ` — NPSN ${s.npsn}` : ''}
                </p>
                <p>
                  Wilayah: {s.province ? provinceNames.get(s.province) ?? s.province : '—'}
                  {' / '}
                  {s.regency ? regencyNames.get(s.regency) ?? s.regency : '—'}
                </p>
                <p>Pengaju: {names.get(s.user_id) ?? '—'}</p>
                <p>Status: {schoolSubmissionStatusLabel(s.status)}{s.decision_note ? ` — ${s.decision_note}` : ''}</p>
                {s.decided_at && (
                  <p className="muted">
                    Diputuskan {fmtDate(s.decided_at)}
                    {s.decided_by ? ` oleh ${names.get(s.decided_by) ?? 'admin'}` : ''}
                  </p>
                )}
                {s.status === 'pending' && (
                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      disabled={busyKey !== null}
                      onClick={() => void decideSub(s, 'approved')}
                    >
                      {busyKey === `sub-${s.id}-approved` ? 'Memproses…' : 'Setujui & Tambah Sekolah'}
                    </button>{' '}
                    {rejectingSubId === s.id ? (
                      <>
                        {/* B70: label textarea mengambil baris penuh sendiri. */}
                        <label style={{ flex: '1 1 100%' }}>
                          Alasan penolakan (wajib)
                          <textarea value={subNote} onChange={(e) => setSubNote(e.target.value)} rows={2} placeholder="Tulis alasan penolakan — terlihat oleh pengaju." />
                        </label>{' '}
                        <button type="button" className="btn btn-primary btn-small" disabled={!subNote.trim() || busyKey !== null} onClick={() => void decideSub(s, 'rejected', subNote)}>{busyKey === `sub-${s.id}-rejected` ? 'Memproses…' : 'Konfirmasi Tolak'}</button>{' '}
                        <button type="button" className="btn btn-ghost btn-small" onClick={() => { setRejectingSubId(null); setSubNote('') }}>Batal</button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        disabled={busyKey !== null}
                        onClick={() => { setRejectingSubId(s.id); setSubNote('') }}
                      >
                        Tolak
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <div className="dash-section-head">
          <h2>Sekolah di Direktori Belum Terverifikasi ({counts.unverifiedSchools})</h2>
          <Link to="/admin#verifikasi-sekolah" className="dash-more">
            Lihat Semua →
          </Link>
        </div>
        {counts.unverifiedSchools === 0 ? (
          <p className="empty">Semua sekolah sudah terverifikasi.</p>
        ) : unverified.length === 0 ? (
          <p className="empty">
            Daftar sekolah belum terverifikasi tidak dapat dimuat di sini — buka Verifikasi
            Sekolah untuk melihat {counts.unverifiedSchools} sekolah tersebut.
          </p>
        ) : (
          <>
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
            {counts.unverifiedSchools > unverified.length && (
              <p className="muted">
                Menampilkan {unverified.length} dari {counts.unverifiedSchools} sekolah belum
                terverifikasi — lihat semua di Verifikasi Sekolah.
              </p>
            )}
          </>
        )}
      </section>

      <section className="section">
        <div className="dash-section-head">
          <h2>Laporan Terbuka ({discReports.length + modReports.length})</h2>
          <Link to="/admin/moderasi" className="dash-more">
            Lihat Semua →
          </Link>
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
                {/* LB8: kunci event mentah dipetakan ke label Indonesia. */}
                <p>{activityLabel(a.action)}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="action-grid">
          <Link to="/admin#pengumuman" className="btn btn-secondary">
            Buat Pengumuman
          </Link>
          <Link to="/admin#buat-course" className="btn btn-secondary">
            Buat Course
          </Link>
          <Link to="/admin#verifikasi-sekolah" className="btn btn-secondary">
            Verifikasi Sekolah
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="dash-section-head">
          <h2>Pengumuman</h2>
          <Link to="/pengumuman" className="dash-more">
            Lihat Semua →
          </Link>
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
