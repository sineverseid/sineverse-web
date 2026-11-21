// SINEVERSE — Beranda.
// - Pengguna login peran siswa: dashboard anggota seperti artefak
//   (SiswaHome) — hero sapaan, Rekomendasi Untukmu, Kursus Aktifku,
//   Feedback Terbaru, Tugas & Tenggat, Proyekku & Rekrutmen Kru,
//   Event Mendatang. Semua data dari Supabase; empty state jujur.
// - Pengguna login peran mentor/admin: dashboard lama dipertahankan
//   (course saya, lanjutkan belajar, pengumuman).
// - Pengunjung logout: landing page (ACUAN FINAL Arif 21 Nov 2026):
//   hero foto + aksen diagonal mint + hanya tombol Daftar Gratis,
//   Apa Itu 2 kolom (nilai LEARN/CREATE/COLLABORATE di dalam
//   "Selengkapnya"), Jelajahi 2x2 sebagai kartu navigasi langsung,
//   CTA horizontal (teks kiri, tombol kanan).
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import '../index-homepage.css'
import CourseCard from '../components/CourseCard'
import Icon from '../components/icons'
import type { IconName } from '../components/icons'
import { useAuth } from '../context/AuthContext'
import { BRAND } from '../lib/brand'
import { fmtDate, fmtDateOnly, isMissingTableError } from '../lib/guarded'
import { topRecommendations } from '../lib/recommendations'
import {
  fetchAssignmentsForLessons,
  fetchCourseLessons,
  fetchCourses,
  fetchEnrollments,
  fetchLessonProgress,
  fetchSubmissions,
  supabase,
} from '../lib/supabase'
import type {
  Announcement,
  Assignment,
  Course,
  LessonProgress,
  Project,
  School,
  SineEvent,
  Submission,
} from '../lib/types'

// --- Data landing ---

// Slide carousel hero — path RELATIF './' dari public/.
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

// Menu Jelajahi — kartu navigasi langsung ke halaman masing-masing
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
    icon: 'book',
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
  const [continueTo, setContinueTo] = useState<{ courseId: string; lessonId: string; title: string } | null>(null)
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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
      try {
        const all = await fetchCourses()
        if (cancelled) return
        setCourses(all)
        // Pengumuman terbaru (platform + course yang diikuti) — sama seperti
        // halaman Pengumuman, bukan teks kosong hardcode.
        try {
          const { data: ann, error: annErr } = await supabase
            .from('announcements')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(3)
          if (annErr) {
            if (!isMissingTableError(annErr)) throw annErr
            if (!cancelled) setAnnouncements(null)
          } else {
            let rows = (ann ?? []) as Announcement[]
            if (user) {
              const enr0 = await fetchEnrollments(user.id)
              const mine = new Set(enr0.map((e) => e.course_id))
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
        }
        if (user) {
          const [enr, prog] = await Promise.all([
            fetchEnrollments(user.id),
            fetchLessonProgress(user.id),
          ])
          if (cancelled) return
          setEnrolledIds(enr.map((e) => e.course_id))
          setProgress(prog)
          // Lesson tiap course yang diambil: untuk "Lanjutkan belajar",
          // hitung progres per course, dan daftar tugasnya.
          const doneSet = new Set(
            prog.filter((p) => p.status === 'completed').map((p) => p.lesson_id),
          )
          const lessonCourseMap = new Map<string, string>()
          const lessonIds: string[] = []
          const totals = new Map<string, number>()
          let foundContinue = false
          for (const e of enr) {
            const lessons = await fetchCourseLessons(e.course_id)
            totals.set(e.course_id, lessons.length)
            for (const l of lessons) {
              lessonCourseMap.set(l.id, e.course_id)
              lessonIds.push(l.id)
            }
            if (!foundContinue) {
              const next = lessons.find((l) => !doneSet.has(l.id))
              if (next) {
                foundContinue = true
                const course = all.find((c) => c.id === e.course_id)
                setContinueTo({
                  courseId: e.course_id,
                  lessonId: next.id,
                  title: `${course?.title ?? 'Course'} — ${next.title}`,
                })
              }
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
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat data.')
      } finally {
        if (!cancelled) setLoading(false)
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

  if (error) {
    return (
      <div className="page">
        <p className="error-box">{error}</p>
      </div>
    )
  }

  const myCourses = courses.filter((c) => enrolledIds.includes(c.id))
  const roleLabel =
    profile?.role === 'admin' ? 'Admin' : profile?.role === 'mentor' ? 'Mentor' : 'Siswa'
  const isSiswa = profile?.role !== 'mentor' && profile?.role !== 'admin'

  return (
    <div className="page">
      {user ? (
        isSiswa ? (
          <SiswaHome
            profileName={profile?.name ?? profile?.email ?? 'SINEVERSE'}
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
        ) : (
          <>
            <section className="hero">
              <p className="hero-eyebrow">SINEVERSE</p>
              <h1>Your World of Filmmaking</h1>
              <p className="hero-sub">
                Platform pendidikan filmmaking nasional untuk pelajar SMA/SMK di seluruh Indonesia.
              </p>
              <p className="hero-slogan">{BRAND.slogan}</p>
              <img
                src="./home-hero-film-crew.webp"
                alt="Kru film pelajar SINEVERSE di lokasi syuting"
                className="hero-img"
              />
            </section>

            <section className="section">
              <h2>Selamat datang, {profile?.name ?? profile?.email ?? 'SINEVERSE'}</h2>
              <p className="muted">
                Peran: {roleLabel}
                {profile?.city ? ` · ${profile.city}` : ''}
              </p>
              {continueTo && (
                <div className="continue-card">
                  <p className="muted">Lanjutkan belajar</p>
                  <p className="continue-title">{continueTo.title}</p>
                  <Link to={`/lesson/${continueTo.lessonId}`} className="btn btn-primary">
                    Lanjutkan
                  </Link>
                </div>
              )}
              {enrolledIds.length > 0 && !continueTo && (
                <p className="muted">Semua lesson di course kamu sudah selesai. Kerja bagus.</p>
              )}
            </section>

            <section className="section">
              <div className="section-head">
                <h2>Course Saya</h2>
                <Link to="/akademi">Lihat semua</Link>
              </div>
              {myCourses.length === 0 ? (
                <p className="empty">
                  Kamu belum mengambil course apa pun.{' '}
                  <Link to="/akademi">Jelajahi Akademi</Link> untuk memulai.
                </p>
              ) : (
                <ul className="course-list">
                  {myCourses.map((c) => (
                    <CourseCard key={c.id} course={c} />
                  ))}
                </ul>
              )}
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

            <section className="section">
              <h2>Ringkasan</h2>
              <p className="muted">
                {myCourses.length} course diambil · {progress.filter((p) => p.status === 'completed').length}{' '}
                lesson selesai
              </p>
              <p>
                <Link to="/nilai">Lihat Nilai Saya</Link>
                {' · '}
                <Link to="/rps">Lihat RPS Semester 1</Link>
              </p>
            </section>
          </>
        )
      ) : (
        <>
          {/* B. Hero — carousel sinematik 3 slide, aksen diagonal mint,
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

          {/* C. Apa Itu SINEVERSE? — 2 kolom (teks + ilustrasi) di semua
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
                  dunia film — menonton, merekam, mengedit — tetapi belum punya ruang terarah
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

          {/* D. Jelajahi Dunia Filmmaking — grid 2x2 di semua lebar,
              kartu navigasi langsung (sesuai acuan final). */}
          <section className="landing-explore" id="jelajahi" aria-label="Jelajahi Dunia Filmmaking">
            <h2>Jelajahi Dunia Filmmaking</h2>
            <div className="explore-grid">
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

          {/* E. Ajakan bergabung — horizontal: teks kiri, tombol kanan. */}
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

  const firstName = profileName.trim().split(/\s+/)[0] || 'SINEVERSE'
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
        <h1>Halo, {firstName}!</h1>
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
            <Link to="/akademi">katalog Academy</Link> — semua kursus inti gratis.
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
                    {r.kind === 'course' ? 'KURSUS' : 'PROYEK MENCARI KRU'} • SKOR {r.score}
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
