// SINEVERSE — Beranda.
// - Pengguna login: dashboard per peran (course saya, lanjutkan belajar,
//   pengumuman) — dipertahankan dari versi sebelumnya.
// - Pengunjung logout: landing page (ACUAN FINAL Arif 21 Nov 2026):
//   hero foto + aksen diagonal mint + hanya tombol Daftar Gratis,
//   Apa Itu 2 kolom (nilai LEARN/CREATE/COLLABORATE di dalam
//   "Selengkapnya"), Jelajahi 2x2 sebagai kartu navigasi langsung,
//   CTA horizontal (teks kiri, tombol kanan).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import '../index-homepage.css'
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
