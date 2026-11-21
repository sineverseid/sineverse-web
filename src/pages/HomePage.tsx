// SINEVERSE — Beranda.
// - Pengguna login: dashboard per peran (course saya, lanjutkan belajar,
//   pengumuman) — dipertahankan dari versi sebelumnya.
// - Pengunjung logout: landing page redesign (Master Prompt 21 Nov 2026):
//   hero sinematik, Apa Itu SINEVERSE, Jelajahi Dunia Filmmaking
//   (4 menu interaktif), ajakan bergabung.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import CourseCard from '../components/CourseCard'
import Icon from '../components/icons'
import type { IconName } from '../components/icons'
import { useAuth } from '../context/AuthContext'
import { BRAND } from '../lib/brand'
import { fmtDate, isMissingTableError } from '../lib/guarded'
import {
  fetchCourseLessons,
  fetchCourses,
  fetchEnrollments,
  fetchLessonProgress,
  supabase,
} from '../lib/supabase'
import type { Announcement, Course, LessonProgress } from '../lib/types'

// --- Data landing (teks dari Master Prompt redesign homepage) ---

const VALUES = [
  {
    icon: 'book' as IconName,
    title: 'LEARN',
    desc: 'Akses pembelajaran perfilman gratis, mulai dari dasar hingga lanjutan.',
  },
  {
    icon: 'film' as IconName,
    title: 'CREATE',
    desc: 'Kembangkan ide, kreativitas, dan kemampuan untuk menghasilkan karya film.',
  },
  {
    icon: 'community' as IconName,
    title: 'COLLABORATE',
    desc: 'Terhubung dengan filmmaker muda dari berbagai sekolah dan daerah.',
  },
]

type ExploreId = 'academy' | 'community' | 'projects' | 'showcase'

const EXPLORE_MENUS: {
  id: ExploreId
  icon: IconName
  name: string
  short: string
  detail: string
  features: string[]
  ctaLabel: string
  ctaTo: string
  extraLink?: { label: string; to: string }
}[] = [
  {
    id: 'academy',
    icon: 'book',
    name: 'Academy',
    short: 'Belajar filmmaking',
    detail:
      'Academy merupakan ruang pembelajaran SINEVERSE yang menyediakan materi edukasi mengenai berbagai aspek perfilman. Anggota dapat mempelajari teori, mengikuti pembelajaran, mengerjakan tugas praktik, dan berdiskusi bersama mentor.',
    features: [
      'Sinematografi dan videografi',
      'Penulisan skenario',
      'Penyutradaraan',
      'Produksi film',
      'Editing dan post-production',
      'Video pembelajaran dan materi',
      'Kuis dan tugas praktik',
      'Diskusi setiap materi pembelajaran',
    ],
    ctaLabel: 'Mulai Belajar',
    ctaTo: '/akademi',
  },
  {
    id: 'community',
    icon: 'community',
    name: 'Community',
    short: 'Temukan komunitas',
    detail:
      'Community merupakan ruang interaksi bagi pelajar dan pecinta film untuk berdiskusi, berbagi pengalaman, bertukar ide, dan membangun jaringan dengan komunitas perfilman dari berbagai sekolah.',
    features: [
      'Forum diskusi perfilman',
      'Komunitas berdasarkan minat',
      'Klub film sekolah',
      'Berbagi pengalaman dan pengetahuan',
      'Tanya jawab',
      'Membangun jaringan filmmaker muda',
    ],
    ctaLabel: 'Jelajahi Komunitas',
    ctaTo: '/komunitas',
  },
  {
    id: 'projects',
    icon: 'project',
    name: 'Film Projects',
    short: 'Berkolaborasi membuat film',
    detail:
      'Film Projects merupakan ruang kolaborasi yang memungkinkan anggota SINEVERSE membangun proyek film bersama. Pelajar dapat mencari anggota kru, membentuk tim produksi, dan bekerja sama dengan anggota dari sekolah berbeda.',
    features: [
      'Membuat proyek film',
      'Mencari anggota kru',
      'Mencari sutradara, penulis, editor, sinematografer, dan peran lainnya',
      'Kolaborasi lintas sekolah',
      'Manajemen tugas produksi',
      'Storyboard dan dokumen produksi',
      'Pemantauan perkembangan proyek',
    ],
    ctaLabel: 'Temukan Proyek',
    ctaTo: '/proyek',
  },
  {
    id: 'showcase',
    icon: 'trophy',
    name: 'Showcase & Events',
    short: 'Pamerkan karya dan ikuti event',
    detail:
      'Showcase & Events merupakan ruang apresiasi bagi karya anggota SINEVERSE sekaligus pusat informasi berbagai kegiatan perfilman, seperti festival, kompetisi, workshop, dan kegiatan kreatif lainnya.',
    features: [
      'Galeri karya film anggota',
      'Portofolio filmmaker',
      'Informasi festival film',
      'Kompetisi perfilman',
      'Workshop dan kegiatan',
      'Pendaftaran event',
      'Sertifikat dan penghargaan',
    ],
    ctaLabel: 'Lihat Karya & Event',
    ctaTo: '/showcase',
    extraLink: { label: 'Lihat Acara', to: '/acara' },
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
  const [activeMenu, setActiveMenu] = useState<ExploreId>('academy')

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
          // Lanjutkan belajar: lesson pertama yang belum selesai di course
          // pertama yang sedang diambil.
          for (const e of enr) {
            const lessons = await fetchCourseLessons(e.course_id)
            const done = new Set(
              prog.filter((p) => p.status === 'completed').map((p) => p.lesson_id),
            )
            const next = lessons.find((l) => !done.has(l.id))
            if (next) {
              if (cancelled) return
              const course = all.find((c) => c.id === e.course_id)
              setContinueTo({
                courseId: e.course_id,
                lessonId: next.id,
                title: `${course?.title ?? 'Course'} — ${next.title}`,
              })
              break
            }
          }
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
  const active = EXPLORE_MENUS.find((m) => m.id === activeMenu) ?? EXPLORE_MENUS[0]

  const scrollToExplore = () => {
    document.getElementById('jelajahi')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="page">
      {user ? (
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
      ) : (
        <>
          {/* B. Hero — kartu navy dengan foto sinematik */}
          <section className="landing-hero" aria-label="Perkenalan SINEVERSE">
            <p className="landing-hero-eyebrow">YOUR WORLD OF FILMMAKING</p>
            <h1 className="landing-hero-title">Temukan Dunia Kreatifmu di Balik Layar.</h1>
            <p className="landing-hero-sub">
              Platform belajar dan komunitas perfilman bagi pelajar SMA/SMK di seluruh Indonesia.
            </p>
            <div className="landing-hero-actions">
              <Link to="/register" className="btn btn-hero">
                Daftar Gratis
                <span aria-hidden="true"> →</span>
              </Link>
              <button type="button" className="btn btn-hero-outline" onClick={scrollToExplore}>
                Jelajahi SINEVERSE
              </button>
            </div>
            <div className="landing-hero-dots" aria-hidden="true">
              <span className="dot active" />
              <span className="dot" />
              <span className="dot" />
            </div>
          </section>

          {/* C. Apa Itu SINEVERSE? */}
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
            <div className="landing-values">
              {VALUES.map((v) => (
                <div key={v.title} className="landing-value">
                  <span className="landing-value-icon">
                    <Icon name={v.icon} size={24} />
                  </span>
                  <h3>{v.title}</h3>
                  <p>{v.desc}</p>
                </div>
              ))}
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

          {/* D. Jelajahi Dunia Filmmaking — 4 menu interaktif */}
          <section className="landing-explore" id="jelajahi" aria-label="Jelajahi Dunia Filmmaking">
            <h2>Jelajahi Dunia Filmmaking</h2>
            <p className="muted">
              Temukan ruang belajar, komunitas, dan kesempatan berkarya bersama SINEVERSE.
            </p>
            <div className="explore-grid" role="group" aria-label="Menu utama SINEVERSE">
              {EXPLORE_MENUS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`explore-card${activeMenu === m.id ? ' active' : ''}`}
                  onClick={() => setActiveMenu(m.id)}
                  aria-pressed={activeMenu === m.id}
                >
                  <span className="explore-icon">
                    <Icon name={m.icon} size={28} />
                  </span>
                  <span className="explore-text">
                    <span className="explore-name">{m.name}</span>
                    <span className="explore-short">{m.short}</span>
                  </span>
                  <Icon name="chevronRight" size={20} className="explore-chevron" />
                </button>
              ))}
            </div>
            <div className="explore-detail" aria-live="polite">
              <div className="explore-detail-head">
                <span className="explore-icon">
                  <Icon name={active.icon} size={28} />
                </span>
                <h3>{active.name}</h3>
              </div>
              <p>{active.detail}</p>
              <ul className="explore-features">
                {active.features.map((f) => (
                  <li key={f}>
                    <Icon name="check" size={16} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="explore-detail-actions">
                <Link to={active.ctaTo} className="btn btn-primary">
                  {active.ctaLabel}
                </Link>
                {active.extraLink && (
                  <Link to={active.extraLink.to} className="btn btn-ghost">
                    {active.extraLink.label}
                  </Link>
                )}
              </div>
            </div>
          </section>

          {/* E. Ajakan bergabung */}
          <section className="landing-cta" aria-label="Ajakan bergabung">
            <h2>Satu Ruang, Banyak Cerita.</h2>
            <p>
              Bergabunglah bersama komunitas filmmaker muda Indonesia. Mulai perjalananmu untuk
              belajar, berkarya, dan berkolaborasi bersama SINEVERSE.
            </p>
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
