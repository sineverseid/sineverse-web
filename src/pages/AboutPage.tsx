// SINEVERSE — halaman informasi: Tentang, Kebijakan Privasi, Syarat dan
// Ketentuan. Satu komponen dengan prop section; dipakai footer dan tombol
// "Selengkapnya" di Beranda. Isi ditulis dari Master Prompt dan fakta
// platform — tanpa klaim palsu.
import { Link } from 'react-router-dom'

export type AboutSection = 'tentang' | 'privasi' | 'syarat'

const TABS: { id: AboutSection; label: string; to: string }[] = [
  { id: 'tentang', label: 'Tentang SINEVERSE', to: '/tentang' },
  { id: 'privasi', label: 'Kebijakan Privasi', to: '/privasi' },
  { id: 'syarat', label: 'Syarat dan Ketentuan', to: '/syarat' },
]

export default function AboutPage({ section }: { section: AboutSection }) {
  return (
    <div className="page">
      <p className="hero-eyebrow" style={{ color: 'var(--film-green)' }}>
        SINEVERSE
      </p>
      <h1>
        {section === 'tentang'
          ? 'Tentang SINEVERSE'
          : section === 'privasi'
            ? 'Kebijakan Privasi'
            : 'Syarat dan Ketentuan'}
      </h1>

      <div className="about-tabs" role="navigation" aria-label="Halaman informasi">
        {TABS.map((t) => (
          <Link
            key={t.id}
            to={t.to}
            className={`about-tab${section === t.id ? ' active' : ''}`}
            aria-current={section === t.id ? 'page' : undefined}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {section === 'tentang' && (
        <div className="about-body">
          <p>
            SINEVERSE adalah platform pendidikan dan komunitas perfilman yang dirancang untuk
            pelajar SMA/SMK di seluruh Indonesia.
          </p>
          <p>
            SINEVERSE menjadi ruang bagi generasi muda untuk belajar filmmaking, mengembangkan
            kreativitas, bertukar pengetahuan, menemukan teman berkarya, dan berkolaborasi
            menghasilkan film.
          </p>
          <p>
            Kami percaya bahwa setiap anak muda memiliki cerita yang layak untuk diceritakan.
            Melalui SINEVERSE, setiap pelajar memiliki kesempatan untuk mengenal dunia perfilman
            dan mengembangkan potensinya.
          </p>
          <h2>Latar Belakang</h2>
          <p>
            SINEVERSE dibangun dari keyakinan bahwa belajar film tidak seharusnya hanya bisa
            diakses segelintir orang. Banyak pelajar SMA/SMK yang tertarik dengan dunia film —
            menonton, merekam, mengedit — tetapi belum punya ruang terarah untuk belajar dari
            dasar, berlatih bersama mentor, dan berkarya dalam tim. SINEVERSE hadir untuk
            mengisi ruang itu: satu tempat untuk belajar, berkarya, dan berkolaborasi.
          </p>
          <h2>Visi</h2>
          <p>
            Generasi muda Indonesia yang melek film, percaya diri bercerita lewat karya, dan
            terhubung dalam komunitas kreatif yang saling mendukung.
          </p>
          <h2>Misi</h2>
          <ul>
            <li>Menyediakan pembelajaran filmmaking gratis dan terstruktur, dari dasar hingga lanjutan.</li>
            <li>Membangun komunitas filmmaker muda lintas sekolah dan daerah.</li>
            <li>Membuka ruang kolaborasi nyata untuk menghasilkan karya film.</li>
          </ul>
          <h2>Tujuan</h2>
          <p>
            Memberi pelajar akses belajar film yang terarah, melatih kemampuan produksi lewat
            tugas dan proyek nyata, serta menumbuhkan apresiasi terhadap karya film anggota.
          </p>
          <h2>Siapa yang Dapat Bergabung</h2>
          <p>
            Pelajar SMA/SMK di seluruh Indonesia, baik yang baru mengenal film maupun yang sudah
            berkarya. Mentor dan praktisi film dapat bergabung sebagai pengajar setelah
            diverifikasi admin. Sekolah dapat mendaftarkan klub filmnya.
          </p>
          <h2>Manfaat</h2>
          <ul>
            <li>Akses materi dan bimbingan mentor.</li>
            <li>Kesempatan berkarya dalam proyek kolaborasi lintas sekolah.</li>
            <li>Portofolio dan sertifikat atas capaian belajar dan karya.</li>
            <li>Jaringan filmmaker muda dari berbagai daerah.</li>
          </ul>
          <h2>Kontak</h2>
          <p>
            Email pengelola platform: sineverse.id@gmail.com
          </p>
          <p>
            <Link to="/register" className="btn btn-primary">
              Daftar Gratis
            </Link>
          </p>
        </div>
      )}

      {section === 'privasi' && (
        <div className="about-body">
          <p>
            Kebijakan ini menjelaskan data apa yang dikumpulkan SINEVERSE, untuk apa data itu
            dipakai, dan hak anggota atas datanya.
          </p>
          <h2>Data yang Dikumpulkan</h2>
          <ul>
            <li>Data akun: nama, username, email, kata sandi (disimpan dalam bentuk hash, bukan teks biasa), nomor telepon/WA, tanggal lahir, jenis kelamin, kota, provinsi, dan kabupaten/kota.</li>
            <li>Data pelajar: sekolah, kelas, dan minat.</li>
            <li>Data mentor: profesi, bidang keahlian, pengalaman, tautan portofolio (opsional), dan alasan menjadi mentor.</li>
            <li>Foto profil yang diunggah anggota.</li>
            <li>Data aktivitas belajar: course yang diambil, progres lesson, nilai kuis, tugas, dan ujian, serta karya dan proyek yang dibuat di platform.</li>
          </ul>
          <h2>Pengguna di Bawah 18 Tahun</h2>
          <p>
            SINEVERSE dirancang untuk pelajar SMA/SMK, dan sebagian anggota berusia di bawah 18
            tahun. Untuk mereka berlaku perlindungan tambahan:
          </p>
          <ul>
            <li>SINEVERSE tidak pernah meminta NIK, KTP, alamat rumah, atau dokumen sensitif apa pun — dari anggota mana pun, termasuk yang di bawah 18 tahun.</li>
            <li>Data yang dikumpulkan dari anggota di bawah 18 tahun sama dengan anggota lain (data akun, data pelajar, dan aktivitas belajar) dan hanya dipakai untuk keperluan platform.</li>
            <li>Orang tua/wali dianjurkan mengetahui pendaftaran anaknya. Bila ada yang perlu ditanyakan atau diminta — termasuk permintaan melihat, memperbaiki, atau menghapus data anak — orang tua/wali dapat menghubungi pengelola platform melalui email sineverse.id@gmail.com.</li>
            <li>Konten dan interaksi di platform dimoderasi; anggota dapat melaporkan konten atau perilaku yang tidak pantas kepada admin.</li>
          </ul>
          <h2>Penggunaan Data</h2>
          <p>
            Data dipakai untuk menjalankan platform: membuat dan mengamankan akun, menyelenggarakan
            pembelajaran dan penilaian, menerbitkan sertifikat, mengelola komunitas dan proyek,
            serta berkomunikasi dengan anggota mengenai kegiatan platform.
          </p>
          <h2>Pembagian Data</h2>
          <p>
            SINEVERSE tidak menjual atau membagikan data anggota kepada pihak ketiga untuk
            keperluan iklan. Data hanya terlihat oleh pihak yang memang memerlukannya di dalam
            platform — misalnya mentor melihat progres dan tugas anggota di course yang
            diampunya, dan admin mengelola platform — sesuai aturan akses yang berlaku.
          </p>
          <h2>Hak Anggota</h2>
          <p>
            Anggota dapat memperbarui data profilnya sendiri. Permintaan perubahan atau
            penghapusan akun dan data dapat disampaikan kepada pengelola platform melalui email
            sineverse.id@gmail.com.
          </p>
          <h2>Keamanan</h2>
          <p>
            Kata sandi disimpan dalam bentuk hash dan tidak pernah ditampilkan sebagai teks biasa.
            Akses ke data dibatasi berdasarkan peran (siswa, mentor, admin).
          </p>
        </div>
      )}

      {section === 'syarat' && (
        <div className="about-body">
          <p>
            Dengan membuat akun dan menggunakan SINEVERSE, anggota menyetujui ketentuan berikut.
          </p>
          <h2>Akun</h2>
          <ul>
            <li>Satu akun untuk satu orang; data yang diisi saat pendaftaran harus benar.</li>
            <li>Anggota bertanggung jawab menjaga kerahasiaan kata sandinya dan atas segala aktivitas di akunnya.</li>
            <li>Akun mentor aktif mengajar setelah diverifikasi oleh admin.</li>
            <li>Anggota di bawah 18 tahun diharapkan mendaftar dengan sepengetahuan orang tua/wali.</li>
          </ul>
          <h2>Karya dan Konten</h2>
          <ul>
            <li>Karya yang diunggah harus merupakan karya sendiri atau karya yang anggotanya berhak gunakan.</li>
            <li>Dilarang mengunggah konten yang mengandung SARA, kekerasan, pornografi, ujaran kebencian, atau plagiarisme.</li>
            <li>Anggota tetap memegang hak atas karyanya; dengan mengunggahnya ke Showcase atau proyek, anggota memberi SINEVERSE izin menampilkan karya tersebut di dalam platform.</li>
          </ul>
          <h2>Pembelajaran dan Sertifikat</h2>
          <ul>
            <li>Anggota mengikuti aturan course, kuis, tugas, dan ujian yang berlaku.</li>
            <li>Sertifikat diterbitkan bila anggota memenuhi syarat kelulusan yang ditetapkan (nilai lulus dan penyelesaian materi).</li>
          </ul>
          <h2>Perilaku di Komunitas</h2>
          <ul>
            <li>Anggota saling menghormati dalam diskusi, komunitas, dan proyek kolaborasi.</li>
            <li>Pelanggaran dapat ditindak admin melalui moderasi, pembatasan, atau penonaktifan akun.</li>
          </ul>
          <h2>Perubahan Ketentuan</h2>
          <p>
            Ketentuan ini dapat diperbarui seiring perkembangan platform. Versi terbaru berlaku
            setelah diumumkan kepada anggota.
          </p>
        </div>
      )}
    </div>
  )
}
