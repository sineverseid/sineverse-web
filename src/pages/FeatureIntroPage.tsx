// SINEVERSE — halaman pengenalan fitur (Academy, Community, Projects,
// Showcase). Teks diambil verbatim dari Master Prompt — jangan diubah,
// jangan diparafrase, jangan ditambah kata-kata sendiri.
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../components/icons'
import type { IconName } from '../components/icons'
import { useAuth } from '../context/AuthContext'

type IntroConfig = {
  icon: IconName
  heroSrc: string
  heroAlt: string
  title: string
  paragraphs: string[]
  items: string[]
  ctaLabel: string
  /** Tujuan CTA bila user sudah login (atau selalu, untuk fitur publik). */
  ctaTo: string
  /** true bila fitur tujuan butuh login — CTA mengantar ke /login dengan
      state.from bila user belum login (return-to, pola LoginPage). */
  requiresAuth: boolean
  support: string
}

function FeatureIntro({ config }: { config: IntroConfig }) {
  const navigate = useNavigate()
  const { user } = useAuth()

  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx
    if (typeof idx === 'number' && idx > 0) navigate(-1)
    else navigate('/')
  }

  const cta =
    !config.requiresAuth || user ? (
      <Link to={config.ctaTo} className="btn btn-primary btn-block intro-cta">
        {config.ctaLabel}
      </Link>
    ) : (
      <button
        type="button"
        className="btn btn-primary btn-block intro-cta"
        onClick={() => navigate('/login', { state: { from: config.ctaTo } })}
      >
        {config.ctaLabel}
      </button>
    )

  return (
    <div className="page intro-page">
      <button type="button" className="btn btn-ghost intro-back" onClick={goBack}>
        ← Kembali
      </button>

      <img className="intro-hero" src={config.heroSrc} alt={config.heroAlt} />

      <div className="intro-icon">
        <Icon name={config.icon} size={28} />
      </div>
      <h1 className="intro-title">{config.title}</h1>

      <div className="intro-desc">
        {config.paragraphs.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>

      <section className="intro-list-card" aria-label="Apa yang Bisa Kamu Lakukan?">
        <h2>Apa yang Bisa Kamu Lakukan?</h2>
        <ul className="intro-list">
          {config.items.map((item) => (
            <li key={item}>
              <span className="intro-check" aria-hidden="true">
                <Icon name="check" size={16} />
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {cta}
      <p className="intro-support">{config.support}</p>
    </div>
  )
}

export function IntroAcademyPage() {
  return (
    <FeatureIntro
      config={{
        icon: 'academy',
        heroSrc: './value-learn.webp',
        heroAlt: 'Kamera di atas buku terbuka',
        title: 'Mulai Perjalananmu di Dunia Filmmaking',
        paragraphs: [
          'Ingin belajar membuat film tetapi belum tahu harus mulai dari mana?',
          'Academy adalah tempat kamu mempelajari dunia filmmaking dari dasar hingga praktik produksi film.',
          'Pelajari berbagai bidang perfilman melalui materi pembelajaran, video, modul, diskusi, kuis, dan tugas praktik yang dibimbing oleh mentor.',
        ],
        items: [
          'Mengikuti 10 course pembelajaran filmmaking.',
          'Mempelajari sinematografi, penulisan skenario, storyboard, penyutradaraan, editing, tata suara, dokumenter, dan bidang perfilman lainnya.',
          'Mengakses materi, video pembelajaran, dan modul.',
          'Mengerjakan pretest, posttest, tugas, dan praktik.',
          'Berdiskusi dengan mentor dan peserta lainnya.',
          'Mendapatkan penilaian dan feedback.',
          'Memperoleh sertifikat setelah memenuhi persyaratan kelulusan.',
        ],
        ctaLabel: 'MULAI BELAJAR SEKARANG →',
        ctaTo: '/akademi',
        requiresAuth: false,
        support:
          'Bangun pengetahuan dan keterampilan filmmaking-mu, satu pelajaran dalam satu waktu.',
      }}
    />
  )
}

export function IntroCommunityPage() {
  return (
    <FeatureIntro
      config={{
        icon: 'community',
        heroSrc: './value-collaborate.webp',
        heroAlt: 'Tiga pelajar berdiskusi di sekitar storyboard',
        title: 'Berkembang Bersama Komunitas Film Indonesia',
        paragraphs: [
          'Belajar filmmaking tidak harus sendirian.',
          'Community adalah ruang bertemu, berbagi pengalaman, bertukar ide, dan membangun relasi dengan pelajar yang memiliki minat sama terhadap dunia perfilman dari berbagai daerah di Indonesia.',
          'Temukan teman baru, bergabung dengan komunitas sesuai minat, dan tumbuh bersama sebagai generasi kreatif perfilman Indonesia.',
        ],
        items: [
          'Menemukan komunitas film dari berbagai sekolah dan daerah.',
          'Bergabung dengan klub sesuai minat dan bidang filmmaking.',
          'Berdiskusi dan berbagi pengalaman.',
          'Membagikan tips, referensi, dan pengetahuan perfilman.',
          'Membuat forum diskusi dan berkolaborasi dengan anggota lain.',
          'Membangun jaringan pertemanan sesama filmmaker muda.',
        ],
        ctaLabel: 'GABUNG DENGAN KOMUNITAS →',
        ctaTo: '/komunitas',
        requiresAuth: true,
        support: 'Temukan orang-orang yang punya semangat dan mimpi yang sama denganmu.',
      }}
    />
  )
}

export function IntroProjectsPage() {
  return (
    <FeatureIntro
      config={{
        icon: 'project',
        heroSrc: './value-create.webp',
        heroAlt: 'Clapperboard film',
        title: 'Dari Ide Menjadi Karya Film Nyata',
        paragraphs: [
          'Punya ide cerita yang ingin dijadikan film?',
          'Projects adalah ruang untuk mewujudkan ide tersebut menjadi karya nyata bersama tim kreatif dari berbagai sekolah.',
          'Tidak perlu menunggu memiliki kru lengkap di sekolahmu. Temukan teman kolaborasi, bentuk tim produksi, bagi peran, dan mulai perjalanan membuat film bersama.',
        ],
        items: [
          'Membuat proyek film baru.',
          'Bergabung dengan proyek yang dibuat pengguna lain.',
          'Menemukan kru berdasarkan keahlian seperti sutradara, penulis skenario, kamerawan, editor, dan aktor.',
          'Membagi tugas dan tanggung jawab setiap anggota.',
          'Menyusun sinopsis, storyboard, dan shot list.',
          'Mengatur jadwal serta progres produksi.',
          'Mengunggah file dan berdiskusi bersama tim.',
          'Mendapatkan arahan dan feedback mentor jika tersedia.',
        ],
        ctaLabel: 'MULAI BUAT PROYEK FILM →',
        ctaTo: '/proyek',
        requiresAuth: true,
        support: 'Satu ide, banyak kreativitas, dan satu tim untuk menciptakan karya.',
      }}
    />
  )
}

export function IntroShowcasePage() {
  return (
    <FeatureIntro
      config={{
        icon: 'showcase',
        heroSrc: './home-hero-screening.webp',
        heroAlt: 'Pemutaran film malam di lapangan dengan layar besar',
        title: 'Saatnya Karyamu Dilihat Dunia',
        paragraphs: [
          'Setiap karya memiliki cerita dan proses di baliknya.',
          'Showcase adalah ruang untuk menampilkan hasil kreativitasmu kepada komunitas filmmaking SINEVERSE dan membangun jejak perjalananmu sebagai filmmaker muda.',
          'Bagikan film pendek, dokumenter, video kreatif, maupun karya audiovisual lainnya. Jadikan setiap karya sebagai kesempatan untuk mendapatkan apresiasi, masukan, dan inspirasi.',
        ],
        items: [
          'Mengunggah dan memamerkan karya film.',
          'Menonton karya dari pelajar sekolah lain.',
          'Memberikan apresiasi dan komentar.',
          'Menemukan inspirasi dari karya filmmaker muda lainnya.',
          'Mengikuti event, festival, dan kompetisi film yang tersedia.',
          'Membangun portofolio karya.',
          'Mendapatkan kesempatan memperkenalkan karya kepada komunitas yang lebih luas.',
        ],
        ctaLabel: 'JELAJAHI KARYA & EVENT →',
        ctaTo: '/showcase',
        requiresAuth: false,
        support:
          'Jangan hanya membuat karya. Tunjukkan, bagikan, dan biarkan ceritamu menginspirasi orang lain.',
      }}
    />
  )
}
