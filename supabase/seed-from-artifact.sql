-- SINEVERSE web publik — Seed data dari artefak (data asli, bukan rekaan)
-- =====================================================================
-- CARA PAKAI: jalankan file ini di Supabase SQL Editor (proyek sineverse,
-- ref twdnlfzorenqitiixher). Bukan lewat aplikasi — jalankan sekali.
-- Idempotent: semua INSERT memakai ON CONFLICT (id) DO NOTHING, jadi aman
-- dijalankan ulang; baris yang sudah ada tidak ditimpa.
--
-- ISI: data seed asli dari artefak SINEVERSE (diambil lewat aksi artefak
-- listlibrary / listfilms / listevents / listcompetitions /
-- listcommunities / getbootstrap, 21 Nov 2026):
--   5 sekolah, 5 komunitas, 7 item Pustaka, 4 acara, 1 kompetisi, 4 film.
--
-- SYARAT: akun admin (profil role='admin') harus sudah ada sebelum bagian
-- FILM dijalankan — owner_id film diambil dari profil admin. Kalau belum
-- ada admin, bagian FILM gagal (owner_id NOT NULL); jalankan bagian lain
-- dulu, buat admin, lalu jalankan ulang bagian FILM saja.
--
-- YANG TIDAK IKUT (keterbatasan skema Supabase — dicatat jujur):
--   * Deskripsi singkat item Pustaka (tidak ada kolom description di
--     library_items) — isi lengkap (body) tetap disalin apa adanya.
--   * source_url item Pustaka: artefak menyimpannya kosong ("") — diset NULL.
--   * image_url item Pustaka: artefak memakai visualKey (ilustrasi bawaan),
--     bukan URL — diset NULL sampai ada berkas ilustrasi yang diunggah.
--   * hue film/komunitas, jenis acara (Festival/Workshop/Webinar/
--     Screening), jenis komunitas (sekolah/minat/wilayah), dan jenis
--     sekolah (SMA/SMK) — tidak ada kolomnya di skema Supabase. Jenis
--     sekolah dicatat di kolom description; jenis acara sudah tersirat di
--     judul acara. Hue film diturunkan client-side dari id film.
--   * Sesi/rundown acara (Festival 5 sesi, Workshop 2 sesi): artefak
--     hanya memberi jumlah sesi, bukan isi sesi — tidak disalin.
--   * Kriteria penilaian kompetisi (5 kriteria berbobot): tidak dikembalikan
--     aksi listcompetitions — kolom criteria diset NULL.
--   * Kompetisi ini terikat ke Festival (eventId 1) di artefak, tapi tabel
--     competitions Supabase tidak punya kolom event_id.
--   * Film "Sinyal Terakhir" di artefak TIDAK punya tautan video
--     (trailerUrl "") — film_url diset NULL, sama seperti artefak.
--   * Kompetisi berstatus 'dibuka' dengan deadline 20 Nov 2026 yang sudah
--     lewat — disalin apa adanya agar sama dengan artefak (artefak juga
--     masih menampilkan 'dibuka').

-- ============================ SEKOLAH (5) ============================
insert into public.schools (id, name, city, description, is_verified)
values
  ('40000000-0000-0000-0000-000000000001', 'SMAN 8 Jakarta', 'Jakarta', 'Sekolah Menengah Atas', true),
  ('40000000-0000-0000-0000-000000000002', 'SMKN 1 Yogyakarta', 'Yogyakarta', 'Sekolah Menengah Kejuruan', true),
  ('40000000-0000-0000-0000-000000000003', 'SMAN 3 Bandung', 'Bandung', 'Sekolah Menengah Atas', true),
  ('40000000-0000-0000-0000-000000000004', 'SMKN 4 Surabaya', 'Surabaya', 'Sekolah Menengah Kejuruan', true),
  ('40000000-0000-0000-0000-000000000005', 'SMA Nusantara Semarang', 'Semarang', 'Sekolah Menengah Atas', true)
on conflict (id) do nothing;

-- =========================== KOMUNITAS (5) ===========================
insert into public.communities (id, name, description, is_approved)
values
  ('50000000-0000-0000-0000-000000000001', 'Klub Film SMAN 8 Jakarta',
   'Ruang klub film SMAN 8 Jakarta: jadwal latihan, pembagian kru, dan arsip karya ekstrakurikuler.', true),
  ('50000000-0000-0000-0000-000000000002', 'Sineas Dokumenter Muda',
   'Komunitas lintas sekolah untuk pembuat dokumenter pelajar: berbagi subjek, izin lokasi, dan bedah karya.', true),
  ('50000000-0000-0000-0000-000000000003', 'Screenwriting Circle',
   'Lingkaran penulis skenario pelajar. Tantangan logline mingguan dan sesi baca naskah bersama.', true),
  ('50000000-0000-0000-0000-000000000004', 'Editor & Colorist Pelajar',
   'Tempat editor pelajar berbagi preset, workflow, dan meminta feedback rough cut.', true),
  ('50000000-0000-0000-0000-000000000005', 'Sineas Jawa Timur',
   'Jejaring sineas pelajar Jawa Timur: info screening, festival daerah, dan kolaborasi antar kota.', true)
on conflict (id) do nothing;

-- =========================== PUSTAKA (7) =============================
-- Kategori memakai label Indonesia; naskah memakai kategori "Naskah" agar
-- penegakan dasar hukum di UI (isScript) tetap bekerja.

insert into public.library_items (id, title, category, body, source_url, legal_basis, attribution, usage_limits, image_url)
values
  ('60000000-0000-0000-0000-000000000001',
   'A Trip to the Moon (Le Voyage dans la Lune, 1902) — Naskah & Film',
   'Naskah',
   $lib$## Tentang karya ini

Le Voyage dans la Lune (1902) karya Georges Méliès adalah salah satu film fiksi ilmiah pertama di dunia. Sekelompok astronom berangkat ke Bulan dengan kapsul yang ditembakkan dari meriam raksasa, bertemu makhluk Bulan (Selenites), lalu kembali ke Bumi dan diarak sebagai pahlawan. Film bisu berdurasi sekitar 14 menit ini terinspirasi lepas dari novel Jules Verne dan H. G. Wells, dan dibangun hampir tanpa dialog — seluruh cerita disampaikan lewat gambar, gerak tubuh, dan trik kamera.

## Teknik yang bisa kamu pelajari

Substitution splice (stop trick): kamera dihentikan, benda atau tokoh diubah, kamera dijalankan lagi — hasilnya benda tampak berubah atau lenyap seketika. Méliès memakai teknik ini berulang kali, misalnya saat payung berubah menjadi jamur raksasa.
Dissolve dan multiple exposure: dua gambar ditumpuk atau dilebur untuk berpindah tempat dan menampilkan sosok gaib.
Set panggung teatrikal: latar dilukis di kanvas datar dan kamera diam di satu posisi seperti penonton teater — perhatikan bagaimana Méliès tetap membuat gambar terasa hidup lewat gerakan di dalam frame.
Pewarnaan tangan: sebagian salinan film ini diwarnai frame demi frame dengan kuas, bukti bahwa warna sudah dianggap bagian dari penceritaan sejak era film paling awal.

## Cara memakai materi ini

Tonton filmnya dari sumber yang tercantum pada kartu item ini (Internet Archive, domain publik). Sambil menonton, catat setiap kali kamu melihat trik kamera: menit ke berapa, trik apa, dan efek ceritanya apa. Setelah itu pilih satu trik dan rencanakan versi produksimu sendiri dengan peralatan sekolah — hampir semua trik Méliès bisa ditiru dengan kamera HP dan editing sederhana.

## Pertanyaan diskusi

1. Adegan mana yang paling jelas menyampaikan cerita tanpa satu pun kata? Apa yang membuatnya berhasil?
2. Apa beda efek substitution splice dengan cut biasa pada film modern?
3. Kalau kamu membuat ulang satu adegan film ini hari ini, trik apa yang kamu pertahankan dan apa yang kamu ganti?$lib$,
   null,
   'Karya terbit 1902; hak cipta telah berakhir dan karya berada di domain publik.',
   'Georges Méliès (1902), via Internet Archive',
   'Bebas dipelajari dan dikutip untuk pendidikan. Periksa status domain publik di yurisdiksi lain sebelum distribusi komersial.',
   null),

  ('60000000-0000-0000-0000-000000000002',
   'Nosferatu (1922) — Skenario Henrik Galeen',
   'Naskah',
   $lib$## Tentang karya ini

Nosferatu (1922), disutradarai F. W. Murnau dan diproduksi Prana Film, adalah adaptasi tidak resmi dari novel Dracula karya Bram Stoker — karena tidak mendapat izin, nama-nama tokohnya diganti: Count Dracula menjadi Count Orlok, Jonathan Harker menjadi Hutter, dan Mina menjadi Ellen. Skenario Henrik Galeen adalah bahan studi yang sangat baik untuk melihat bagaimana ketegangan ditulis di atas kertas sebelum kamera menyala.

## Yang bisa dipelajari dari naskah ini

Menulis ancaman lewat deskripsi visual: Orlok jarang dijelaskan dengan kata sifat menakutkan; rasa ngeri dibangun dari bayangan yang naik di tangga, tangan yang mencengkeram, dan pintu yang terbuka sendiri.
Adegan nyaris tanpa dialog: intertitle (kartu teks) dipakai seperlunya, sisanya diserahkan pada gambar — pelajaran penting untuk film pendek pelajar yang sering kelebihan dialog.
Struktur perjalanan: naskah bergerak dari kota yang tertib (Wisborg) ke kastel yang asing (Karpatia) dan kembali lagi, membawa ancaman pulang — pola pergi–pulang yang masih dipakai film horor sampai sekarang.
Motif wabah: tikus, peti mati berisi tanah, dan kapal yang tiba tanpa awak hidup mengubah vampir dari monster pribadi menjadi bencana satu kota.

## Cara memakai materi ini

Baca satu rangkaian adegan dari naskah (tersedia di sumber yang tercantum pada kartu item ini, Internet Archive), lalu tonton rangkaian yang sama pada filmnya. Tandai tiga hal: apa yang ditulis Galeen tetapi diubah Murnau, apa yang ditambahkan kamera dan cahaya, dan adegan mana yang menurutmu lebih kuat di naskah daripada di film — beserta alasannya.

## Pertanyaan diskusi

1. Bagaimana naskah membangun ketegangan tanpa musik dan tanpa dialog panjang?
2. Mengapa perubahan nama tokoh tidak mengubah rasa cerita Dracula-nya?
3. Adegan bayangan Orlok di tangga: apa yang tertulis di naskah, dan apa yang merupakan keputusan visual sutradara/kamerawan?$lib$,
   null,
   'Film dan skenario terbit 1922; berada di domain publik.',
   'Skenario Henrik Galeen (1922), via Internet Archive',
   'Untuk studi dan pembelajaran. Edisi restorasi tertentu dapat memiliki hak atas restorasi — gunakan berkas sumber resmi yang tercantum.',
   null),

  ('60000000-0000-0000-0000-000000000003',
   'Glossary: Shot Size — ELS sampai ECU',
   'Glosarium',
   $lib$## Mengapa shot size penting

Shot size adalah seberapa besar subjek tampak di dalam frame. Pilihan shot size menentukan apa yang dirasakan penonton: jarak emosional, informasi ruang, dan titik perhatian. Berikut tangga shot size dari yang terlebar sampai terketat, beserta fungsi dan contoh pemakaiannya dalam produksi pelajar.

## Extreme Long Shot (ELS)

Subjek sangat kecil atau bahkan tidak tampak; yang berbicara adalah tempatnya. Fungsi: establishing shot (memperkenalkan lokasi dan skala), menunjukkan kesendirian atau keterasingan tokoh. Contoh: seorang siswa tampak kecil di lapangan sekolah yang kosong sepulang jam pelajaran.

## Long Shot (LS / Wide Shot)

Seluruh tubuh subjek terlihat dari kepala sampai kaki, masih dengan ruang lingkungan yang lega. Fungsi: menunjukkan hubungan tokoh dengan tempatnya dan membuka adegan. Contoh: tokoh masuk gerbang sekolah dan berjalan menuju kamera.

## Medium Long Shot (MLS)

Subjek terpotong kira-kira sebatas lutut ke atas (sering disebut American shot). Fungsi: transisi antara konteks ruang dan ekspresi; nyaman untuk tokoh yang berjalan sambil berbicara.

## Medium Shot (MS)

Subjek terpotong sebatas pinggang ke atas. Fungsi: shot kerja untuk dialog — gestur tangan dan ekspresi masih sama-sama terbaca. Contoh: dua siswa mengobrol di meja kantin.

## Medium Close Up (MCU)

Subjek terpotong sebatas dada ke atas. Fungsi: dialog yang lebih intim; latar mulai tidak penting. Penonton mulai membaca emosi, bukan lagi situasi.

## Close Up (CU)

Wajah atau satu objek mengisi sebagian besar frame. Fungsi: puncak emosi, reaksi, dan detail penting cerita (tangan gemetar, layar HP, kunci di atas meja). Contoh: wajah tokoh yang baru membaca pesan mengejutkan.

## Extreme Close Up (ECU)

Hanya sebagian kecil subjek: mata, bibir, ujung jari, angka pada jam. Fungsi: tekanan maksimum dan detail yang tidak boleh terlewat. Pakai hemat — ECU yang terlalu sering kehilangan dayanya.

## Latihan cepat

Ambil satu kalimat cerita, misalnya "Rani akhirnya berani masuk ruang OSIS sendirian." Rekam kalimat itu dalam lima shot size berbeda (ELS, LS, MS, CU, ECU) tanpa mengubah dialog. Putar berurutan dan diskusikan: versi mana yang paling bercerita, dan kenapa?$lib$,
   null,
   'Materi orisinal Tim Kurikulum SINEVERSE, diterbitkan di bawah lisensi CC BY-SA 4.0.',
   'Tim Kurikulum SINEVERSE — CC BY-SA 4.0',
   'Boleh dibagikan dan diadaptasi dengan atribusi dan lisensi yang sama.',
   null),

  ('60000000-0000-0000-0000-000000000004',
   'Glossary: Aturan 180 Derajat & Rule of Thirds',
   'Glosarium',
   $lib$## Aturan 180 derajat (axis line)

Saat dua tokoh berinteraksi, ada garis imajiner yang menghubungkan keduanya — disebut sumbu aksi atau axis line. Kamera harus tetap berada di satu sisi garis itu selama satu rangkaian adegan. Hasilnya: tokoh A selalu menatap ke kanan dan tokoh B selalu menatap ke kiri di layar, sehingga penonton tidak bingung siapa menghadap ke mana.

## Apa yang terjadi kalau dilanggar

Melintasi garis (crossing the line) membuat arah tatap dan posisi tokoh tampak bertukar tempat secara tiba-tiba. Penonton merasakan "ada yang salah" walaupun tidak bisa menjelaskan apa. Pelanggaran yang disengaja memang ada (misalnya untuk menunjukkan kebingungan tokoh), tetapi untuk produksi pelajar, kuasai dulu aturannya sebelum melanggarnya dengan alasan.

## Cara menjaganya di lokasi

1. Tentukan sumbu aksi sebelum kamera dipasang: berdiri di antara dua tokoh, tarik garis lurus di antara mereka.
2. Gambar denah sederhana (peta blocking) dan tandai area kamera yang aman — setengah lingkaran di satu sisi garis.
3. Rekam satu master shot lebar sebagai jangkar; semua shot berikutnya mengacu padanya.
4. Kalau memang harus pindah sisi, lakukan dengan gerakan kamera yang terlihat (dolly/tracking melewati garis di dalam satu shot) atau sisipkan shot netral tepat di atas garis.

## Rule of thirds

Bagi frame menjadi sembilan kotak sama besar dengan dua garis vertikal dan dua garis horizontal. Letakkan subjek atau titik penting pada garis dan titik potongnya, bukan selalu di tengah. Mata tokoh pada shot dialog biasanya diletakkan di garis horizontal atas, dan ruang kosong (lead room) disisakan di arah tatapan atau arah gerak tokoh.

## Menggabungkan keduanya

Rule of thirds mengatur komposisi di dalam satu frame; aturan 180 derajat mengatur konsistensi antar-frame. Adegan dialog yang rapi biasanya memakai keduanya sekaligus: kamera tetap di satu sisi sumbu, tokoh A duduk di sepertiga kiri menatap kanan, tokoh B di sepertiga kanan menatap kiri — arah tatap bertemu, komposisi seimbang, dan penonton bisa fokus ke akting, bukan menebak ruang.$lib$,
   null,
   'Materi orisinal Tim Kurikulum SINEVERSE, diterbitkan di bawah lisensi CC BY-SA 4.0.',
   'Tim Kurikulum SINEVERSE — CC BY-SA 4.0',
   'Boleh dibagikan dan diadaptasi dengan atribusi dan lisensi yang sama.',
   null)
on conflict (id) do nothing;

insert into public.library_items (id, title, category, body, source_url, legal_basis, attribution, usage_limits, image_url)
values
  ('60000000-0000-0000-0000-000000000005',
   'Template Shot List Produksi',
   'Template',
   $lib$## Apa itu shot list

Shot list adalah daftar semua shot yang akan direkam, disusun sebelum hari syuting. Dokumen ini menjembatani naskah dan jadwal: sutradara menulis kebutuhan gambarnya, lalu tim produksi mengurutkannya menjadi urutan rekam yang efisien (biasanya dikelompokkan per lokasi dan per setup kamera, bukan per urutan cerita).

## Kolom yang dipakai

No. Shot: kode unik, format Adegan–Shot (mis. 3-02 = adegan 3, shot 2).
Adegan: nomor dan nama adegan sesuai naskah.
Shot Size: ELS / LS / MS / MCU / CU / ECU.
Angle: eye level, low angle, high angle, Dutch, POV, over-the-shoulder.
Gerakan: static, pan, tilt, tracking, handheld.
Aksi/Visual: apa yang terjadi di dalam frame, ditulis singkat dan konkret.
Dialog/Suara: potongan dialog, ambience, atau kebutuhan suara lain.
Durasi: perkiraan detik per shot, untuk menghitung total durasi adegan.
Catatan: properti, kostum, efek, atau risiko yang harus disiapkan.

## Contoh terisi — adegan kantin

4-01 | Adegan 4 — Kantin | LS | Eye level | Static | Kantin ramai; RANI masuk dari pintu kiri membawa nampan | Ambience kantin, tanpa dialog | 6 dtk | Ekstra 10 siswa, nampan + gelas plastik
4-02 | Adegan 4 — Kantin | MS | Eye level | Pan pelan | RANI memindai meja, menemukan meja kosong di pojok | Ambience menurun | 5 dtk | Arah tatap RANI konsisten ke kanan frame
4-03 | Adegan 4 — Kantin | CU | High angle ringan | Static | Tangan RANI meletakkan nampan; HP di nampan bergetar | Bunyi getar HP jelas | 3 dtk | Properti HP cadangan, layar menampilkan pesan masuk

## Langkah pengisian

1. Bedah naskah per adegan dan tandai momen yang wajib terlihat penonton.
2. Tentukan shot pembuka (biasanya terlebar) dan shot penutup setiap adegan.
3. Isi shot di antaranya dari terlebar ke terketat agar cakupan (coverage) lengkap.
4. Serahkan ke asisten sutradara/produser untuk diurutkan menjadi jadwal rekam per lokasi.
5. Cetak dan bawa ke lokasi; coret shot yang selesai direkam, catat take terbaik di kolom catatan.$lib$,
   null,
   'Template orisinal SINEVERSE, gratis untuk penggunaan pendidikan.',
   'Tim Kurikulum SINEVERSE',
   'Gratis untuk produksi pelajar dan kegiatan belajar; tidak untuk dijual kembali.',
   null),

  ('60000000-0000-0000-0000-000000000006',
   'Template Call Sheet Harian',
   'Template',
   $lib$## Apa itu call sheet

Call sheet adalah lembar panggilan resmi untuk satu hari syuting. Semua pemain dan kru bekerja dari dokumen yang sama: jam kumpul, lokasi, urutan adegan, dan siapa saja yang dipanggil. Call sheet dibagikan malam sebelumnya — bukan pagi hari syuting.

## Bagian-bagian call sheet

Kepala dokumen: judul produksi, nomor hari syuting (mis. Hari 2 dari 3), tanggal, dan nama produser/koordinator.
Jam kumpul: jam kumpul umum kru (general call), jam panggilan per pemain (cast call), dan perkiraan jam selesai.
Lokasi: alamat lengkap, titik kumpul, tempat parkir/istirahat, dan lokasi cadangan bila hujan.
Urutan adegan: nomor adegan, interior/eksterior, siang/malam, lokasi set, dan ringkasan satu baris — diurutkan menurut jadwal rekam, bukan urutan naskah.
Pemain & kru yang dipanggil: nama, peran/jabatan, jam tiba, kebutuhan khusus (kostum, tata rias, properti pribadi).
Perlengkapan: kamera, suara, properti, kostum, dan kendaraan yang harus sudah siap sebelum jam kumpul.
Catatan: prakiraan cuaca, aturan lokasi (izin, jam tenang), dan hal keselamatan yang relevan hari itu.

## Contoh ringkas

Produksi: "Sinyal Terakhir" — Hari 2 dari 3 — Sabtu, 14 Februari 2026
Jam kumpul kru: 06.30 di gerbang sekolah. Panggilan pemain: 07.00. Perkiraan selesai: 15.00.
Lokasi: Kantin & koridor lantai 1 (izin sekolah berlaku sampai 16.00).
Urutan rekam: Adegan 4 (kantin, siang) → Adegan 5 (koridor, siang) → Adegan 2 sisipan (tangga, sore).
Dipanggil: Raka (sutradara), Nadia (pemain), Bima (kamera), Putri (pemain), 10 figuran kantin.
Catatan: prakiraan hujan pukul 13.00 — adegan luar dipindah ke koridor bila hujan; dilarang merekam di area kelas yang sedang ujian.

## Aturan keamanan berbagi

Call sheet memuat nama dan kadang nomor kontak koordinator. Bagikan hanya ke anggota tim produksi yang terlibat pada hari itu — jangan diunggah ke media sosial atau grup terbuka. Versi untuk arsip SINEVERSE sebaiknya menghapus nomor kontak pribadi.$lib$,
   null,
   'Template orisinal SINEVERSE, gratis untuk penggunaan pendidikan.',
   'Tim Kurikulum SINEVERSE',
   'Gratis untuk produksi pelajar. Call sheet terisi berisi data tim — bagikan hanya di internal tim produksi.',
   null),

  ('60000000-0000-0000-0000-000000000007',
   'Membaca Film: Pengantar Analisis Visual',
   'Bacaan',
   $lib$## Cara memakai daftar ini

Daftar bacaan pengantar untuk mulai membaca film sebagai bahasa visual, bukan sekadar cerita. Semua judul tersedia melalui perpustakaan sekolah, perpustakaan umum, atau toko buku resmi — pinjam atau beli dari sumber resmi, sesuai catatan lisensi pada kartu item ini. Baca berurutan dari nomor 1; setiap buku membangun buku berikutnya.

## 1. Film Art: An Introduction — David Bordwell, Kristin Thompson, & Jeff Smith

Buku fondasi analisis film yang dipakai di banyak sekolah dan kampus film dunia. Membahas empat unsur bentuk film secara sistematis: mise-en-scène, sinematografi, penyuntingan, dan suara — lengkap dengan contoh frame dan latihan analisis di akhir bab. Mulai dari bab mise-en-scène dan sinematografi bila kamu sedang mengambil kursus kamera.

## 2. The Visual Story — Bruce Block

Menjelaskan komponen visual yang bisa dikendalikan pembuat film: ruang, garis, bentuk, nada (tone), warna, gerakan, dan ritme — serta bagaimana intensitas setiap komponen membangun emosi penonton. Sangat berguna untuk merancang tampilan film pendek sebelum syuting, bukan memperbaikinya sesudahnya.

## 3. Film Directing Shot by Shot — Steven D. Katz

Panduan visualisasi bagi sutradara: mengubah naskah menjadi storyboard, denah kamera, dan daftar shot. Pasangan praktik yang tepat untuk template shot list di Library ini — baca bab visualisasi, lalu terapkan langsung pada naskah proyekmu.

## 4. In the Blink of an Eye — Walter Murch

Esai pendek dan padat dari editor film legendaris tentang mengapa sebuah cut berhasil atau gagal. Murch menawarkan "Rule of Six" — urutan prioritas alasan memotong gambar, dengan emosi penonton di peringkat pertama, jauh di atas kontinuitas teknis. Bacaan satu-dua malam yang mengubah cara editor pelajar mengambil keputusan.

## 5. The Filmmaker's Handbook — Steven Ascher & Edward Pincus

Referensi teknis menyeluruh: kamera, pencahayaan, suara, sampai pascaproduksi dan distribusi. Bukan buku yang dibaca dari awal sampai akhir — jadikan kamus produksi: buka bab yang relevan setiap kali timmu menghadapi masalah teknis baru di lokasi.

## Langkah lanjutan

Setelah satu buku selesai, tulis ulasan bacaan 300–500 kata di komunitas SINEVERSE: satu konsep utama, satu contoh penerapannya pada film yang pernah kamu tonton, dan satu hal yang ingin kamu coba di proyek berikutnya. Bacaan yang dibagikan menjadi jauh lebih melekat daripada bacaan yang disimpan sendiri.$lib$,
   null,
   'SINEVERSE tidak mengunggah isi buku berhak cipta; entri ini hanya daftar rujukan ke perpustakaan dan penerbit resmi.',
   'Daftar bacaan kurasi SINEVERSE',
   'Pinjam atau beli dari sumber resmi. Jangan mengunggah salinan buku ke platform.',
   null)
on conflict (id) do nothing;

-- ============================ ACARA (4) ==============================
-- Waktu WIB diubah ke UTC (WIB = UTC+7). Jenis acara (Festival/Workshop/
-- Webinar/Screening) sudah tersirat di judul; kolom kind hanya menyimpan
-- asal (internal).
insert into public.events (id, title, description, kind, organizer, official_link, starts_at, ends_at, location, capacity)
values
  ('70000000-0000-0000-0000-000000000001',
   'Festival Film Pelajar Nusantara 2026',
   'Festival tahunan film pelajar SMA/SMK se-Indonesia. Kategori: Fiksi, Dokumenter, dan Animasi. Karya finalis ditayangkan dan didiskusikan bersama juri praktisi. Hak cipta karya tetap milik pembuatnya; penyelenggara hanya memakai cuplikan untuk promosi festival dengan izin tertulis.',
   'internal', null, null,
   '2026-12-11T17:00:00Z', '2026-12-14T16:59:00Z',
   'Jakarta & daring', null),
  ('70000000-0000-0000-0000-000000000002',
   'Workshop Sinematografi: Memanfaatkan Cahaya Alami',
   'Praktik langsung menata cahaya jendela untuk adegan dialog, dipandu mentor SINEVERSE Academy. Peserta menyiapkan satu ruangan dengan jendela dan satu tokoh sukarelawan.',
   'internal', null, null,
   '2026-11-28T02:00:00Z', null,
   'Daring (video conference)', null),
  ('70000000-0000-0000-0000-000000000003',
   'Webinar: Menulis Dialog yang Hidup',
   'Sesi tanya jawab dan bedah dialog dari naskah peserta terpilih bersama mentor screenwriting SINEVERSE.',
   'internal', null, null,
   '2026-12-02T12:00:00Z', null,
   'Daring (video conference)', null),
  ('70000000-0000-0000-0000-000000000004',
   'Screening & Diskusi: Film Pelajar Pilihan November',
   'Pemutaran empat film dari SINEVERSE Showcase bulan ini, dilanjutkan diskusi dengan para pembuatnya.',
   'internal', null, null,
   '2026-12-06T08:00:00Z', null,
   'Aula SMAN 8 Jakarta & daring', null)
on conflict (id) do nothing;

-- ========================== KOMPETISI (1) ============================
-- Deadline 20 Nov 2026 23.59 WIB = 2026-11-20T16:59:00Z. Status 'dibuka'
-- disalin apa adanya dari artefak (sudah lewat deadline tapi masih dibuka).
insert into public.competitions (id, title, description, status, deadline, categories, criteria)
values
  ('80000000-0000-0000-0000-000000000001',
   'Kompetisi Film Pelajar — Festival Film Pelajar Nusantara 2026',
   'Kompetisi utama Festival Film Pelajar Nusantara 2026 untuk siswa SMA/SMK se-Indonesia. Kirim film pendek terbaikmu, dinilai panel juri dengan kriteria dan bobot yang transparan.',
   'dibuka',
   '2026-11-20T16:59:00Z',
   '["Fiksi", "Dokumenter", "Animasi"]'::jsonb,
   null)
on conflict (id) do nothing;

-- ============================= FILM (4) ==============================
-- owner_id diambil dari profil admin (Arif) — siswa seed artefak (Nadia,
-- Bima, Putri, Raka) tidak ada di Supabase. Nama pemilik TIDAK ditampilkan
-- di halaman Showcase/Detail web publik, jadi tidak ada atribusi yang
-- keliru di layar; owner_id hanya dipakai untuk "Film Saya" dan hak ubah.
-- school_id merujuk ke sekolah seed di atas. trailer_url/film_url NULL
-- karena artefak memang tidak menyimpan tautan video untuk keempat film
-- ini ("Sinyal Terakhir" tidak bisa ditonton di artefak — sama di sini).
insert into public.films (id, title, description, owner_id, school_id, trailer_url, film_url, poster_url, visibility, show_school, status)
select
  v.id, v.title, v.description,
  (select p.id from public.profiles p where p.role = 'admin' limit 1),
  v.school_id, null, null, null, 'public', true, 'published'
from (values
  ('90000000-0000-0000-0000-000000000001'::uuid,
   'Kala Senja',
   'Seorang siswi dan kakeknya memperbaiki radio tua sambil menunggu kabar yang tak kunjung datang.',
   '40000000-0000-0000-0000-000000000001'::uuid),
  ('90000000-0000-0000-0000-000000000002'::uuid,
   'Antre',
   'Satu antrean kantin, lima strategi, dan sepiring ayam geprek terakhir.',
   '40000000-0000-0000-0000-000000000002'::uuid),
  ('90000000-0000-0000-0000-000000000003'::uuid,
   'Jejak Pasar',
   'Potret para pedagang pasar yang memulai hari saat kota masih tidur.',
   '40000000-0000-0000-0000-000000000003'::uuid),
  ('90000000-0000-0000-0000-000000000004'::uuid,
   'Sinyal Terakhir',
   'Di sekolah yang seluruh siswanya memakai penerjemah otomatis, satu siswa kehilangan sinyalnya — dan harus benar-benar berbicara.',
   '40000000-0000-0000-0000-000000000004'::uuid)
) as v(id, title, description, school_id)
on conflict (id) do nothing;

-- Verifikasi cepat setelah menjalankan (jalankan terpisah di SQL Editor):
-- select 'schools', count(*) from public.schools
-- union all select 'communities', count(*) from public.communities
-- union all select 'library_items', count(*) from public.library_items
-- union all select 'events', count(*) from public.events
-- union all select 'competitions', count(*) from public.competitions
-- union all select 'films', count(*) from public.films;
-- Harapan: 5 / 5 / 7 / 4 / 1 / 4.
