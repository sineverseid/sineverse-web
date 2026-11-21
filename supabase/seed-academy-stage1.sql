-- ============================================================================
-- SINEVERSE Academy — Stage 1 seed (Tahap 1: Section, Lesson, Learning Material)
-- 10 courses x 2 sections x 5 lessons = 100 lessons + 20 section modules.
-- Modul "Orientasi" (order 0) dan lesson sambutan yang sudah ada TIDAK disentuh.
-- Judul lesson mengikuti Master Prompt Academy persis; materi belajar
-- diringkas dari 10 modul PDF kurikulum (~/workspace/sineverse-kurikulum/modul/).
-- Pelajaran yang materinya tidak tercakup modul ditandai "[Perlu ditinjau mentor]".
-- Idempotent: setiap INSERT memakai ON CONFLICT (id) DO NOTHING.
-- Jalankan di Supabase SQL Editor SETELAH migrasi 013_academy_stage1.sql.
-- ============================================================================

-- ============================================================
-- SINEVERSE Academy — Stage 1 seed
-- Course 1 "Dasar Sinematografi" dan Course 2 "Penulisan Skenario"
-- Sumber materi: Modul 01 Dasar Sinematografi dan Modul 02 Penulisan Skenario
-- Setiap lesson berisi: Tujuan, Penjelasan, Contoh, Ringkasan.
-- Pelajaran yang materinya tidak tercakup modul ditandai "[Perlu ditinjau mentor]" di akhir kontennya.
-- Idempotent: insert dilewati bila id sudah ada.
-- ============================================================

-- ==================== COURSE 1: DASAR SINEMATOGRAFI ====================

insert into public.modules (id, course_id, title, order_index) values
('21000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Section 1 — Minggu 1', 1)
on conflict (id) do nothing;

insert into public.modules (id, course_id, title, order_index) values
('22000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Section 2 — Minggu 2', 2)
on conflict (id) do nothing;

-- Course 1, Lesson 1: Pengenalan sinematografi dan bahasa visual
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000101', '21000000-0000-4000-8000-000000000001', 'Pengenalan sinematografi dan bahasa visual', 1, NULL, $$Tujuan:
Setelah pelajaran ini, kamu bisa menjelaskan apa itu sinematografi dan bagaimana sebuah gambar bercerita tanpa satu kata pun, serta menyebutkan peran seorang sinematografer dalam sebuah produksi film.

Penjelasan:
Bayangkan dua foto orang yang sama. Di foto pertama, orang itu kecil sekali di tengah sawah yang luas. Di foto kedua, hanya matanya yang memenuhi layar. Ceritanya langsung berbeda: foto pertama bercerita tentang kesepian dan tempat, foto kedua tentang perasaan yang intens. Tidak ada kata yang berubah, hanya jarak kamera. Itulah sinematografi.

Sinematografi adalah bahasa gambar. Ia mencakup semua yang berhubungan dengan kerja, posisi, dan pengoperasian kamera: framing (seberapa ketat gambar dipotong), jarak kamera, tinggi kamera, dan sudut kamera. Seorang sinematografer, atau director of photography (DP), memutuskan semua itu bersama sutradara, supaya setiap gambar mendukung cerita.

Kabar baiknya, kamu tidak butuh kamera mahal untuk belajar bahasa ini. Semua latihan di course ini bisa dikerjakan dengan HP. Yang kamu latih adalah mata, bukan alat. Kamera yang bagus tidak menyelamatkan gambar yang tidak dipikirkan, dan gambar yang dipikirkan dengan baik tetap kuat walau direkam HP lama.

Sinematografi bekerja sebelum dialog dimulai. Sebelum satu kata pun diucapkan, jarak kamera, sudut, dan cahaya sudah memberi tahu penonton siapa yang berkuasa, siapa yang rentan, dan apakah dunia tokoh sedang baik-baik saja. Karena itu seorang sinematografer selalu bertanya: apa yang harus penonton rasakan di detik ini?

Dalam sebuah produksi, sinematografer tidak bekerja sendiri. Ia berdiskusi dengan sutradara tentang gaya visual film, dengan penata cahaya tentang arah dan warna cahaya, dan dengan operator kamera tentang gerakan setiap shot. Alatnya adalah kamera, lensa, cahaya, dan gerakan, tetapi tujuannya selalu sama: membuat gambar yang bercerita. Dua film dengan naskah yang sama bisa terasa sangat berbeda hanya karena pilihan gambarnya berbeda.

Contoh:
Tonton satu adegan film favoritmu selama 5 menit dengan suara dimatikan. Catat tiga hal untuk setiap shot: seberapa besar tokoh di dalam frame, dari sudut mana kamera memandang, dan dari mana cahaya datang. Kamu akan kaget betapa banyak cerita yang disampaikan tanpa dialog sama sekali.

Ringkasan:
Sinematografi adalah bahasa visual film: jarak, sudut, dan cahaya menyampaikan cerita dan perasaan tanpa kata-kata. Sinematografer memutuskan semua itu bersama sutradara agar setiap gambar mendukung cerita. Kamu bisa mempelajarinya mulai sekarang, hanya dengan HP dan mata yang terlatih.$$)
on conflict (id) do nothing;

-- Course 1, Lesson 2: Jenis kamera, lensa, sensor, resolusi
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000102', '21000000-0000-4000-8000-000000000001', 'Jenis kamera, lensa, sensor, resolusi', 2, NULL, $$Tujuan:
Setelah pelajaran ini, kamu bisa membedakan jenis-jenis kamera dan lensa, menjelaskan peran sensor dan resolusi, serta memilih alat yang tepat untuk kebutuhan syutingmu.

Penjelasan:
Kamera film ada banyak jenisnya, tetapi untuk pemula yang paling penting adalah memahami fungsinya, bukan harganya. HP yang kamu punya sekarang sudah cukup untuk belajar: ia bisa merekam 1080p, punya mode manual di banyak aplikasi, dan selalu ada di sakumu. Di atas itu ada kamera mirrorless dan DSLR yang lensanya bisa diganti, lalu kamera sinema profesional yang dipakai produksi besar. Perbedaannya terutama pada kendali manual, kualitas gambar di cahaya redup, dan fleksibilitas lensa.

Lensa menentukan bagaimana dunia terlihat di dalam frame. Lensa wide (sudut lebar) menangkap ruang yang luas dan membuat jarak terasa jauh, cocok untuk menunjukkan tempat. Lensa normal meniru pandangan mata manusia. Lensa tele (panjang) mendekatkan subjek yang jauh dan memampatkan latar, sehingga latar tampak menempel di belakang tokoh. Panjang lensa diukur dalam milimeter: angka kecil berarti wide, angka besar berarti tele.

Sensor adalah bagian kamera yang menangkap cahaya dan mengubahnya menjadi gambar. Semakin besar sensor, semakin banyak cahaya yang ditangkap, sehingga gambar lebih bersih di tempat gelap dan latar lebih mudah dibuat blur. Itulah sebabnya kamera besar terlihat lebih "sinematik" daripada HP di kondisi yang sama, walau HP modern sudah sangat pintar mengakalinya dengan perangkat lunak.

Resolusi adalah jumlah piksel dalam gambar. 1080p (Full HD) berarti gambar selebar 1920 piksel, sedangkan 4K berarti sekitar 3840 piksel. Resolusi lebih tinggi memberi detail lebih banyak dan kebebasan memotong gambar saat editing, tetapi juga membuat ukuran file membesar dan laptop bekerja lebih berat. Untuk film pendek sekolah, 1080p sudah lebih dari cukup.

Contoh:
Dengan HP-mu, foto satu teman dari jarak yang sama dua kali: sekali dengan lensa wide (0,5x) dan sekali dengan zoom 2x atau 3x. Perhatikan bagaimana latar berubah: pada lensa wide, latar terasa jauh dan luas; pada zoom, latar tampak dekat dan padat di belakang temanmu. Itulah karakter lensa yang sedang bekerja.

Ringkasan:
Kamera, lensa, sensor, dan resolusi adalah empat hal dasar alat perekam gambar. Lensa mengatur sudut pandang, sensor menangkap cahaya, dan resolusi menentukan detail gambar. Untuk belajar, HP yang kamu punya sudah cukup; yang penting kamu paham fungsi tiap alat, bukan harganya.

[Perlu ditinjau mentor]$$)
on conflict (id) do nothing;

-- Course 1, Lesson 3: Exposure: ISO, aperture, shutter speed
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000103', '21000000-0000-4000-8000-000000000001', 'Exposure: ISO, aperture, shutter speed', 3, NULL, $$Tujuan:
Setelah pelajaran ini, kamu bisa menjelaskan segitiga eksposur (ISO, aperture, shutter speed) dan mengatur ketiganya untuk mendapatkan gambar dengan kecerahan yang tepat.

Penjelasan:
Exposure adalah seberapa terang atau gelap gambarmu. Tiga pengaturan mengendalikannya, dan ketiganya saling terkait seperti segitiga: mengubah satu berarti kamu harus menyesuaikan yang lain. Ketiga pengaturan itu adalah ISO, aperture, dan shutter speed.

ISO adalah sensitivitas sensor terhadap cahaya. ISO rendah (misalnya 100) memberi gambar yang bersih dan tajam, cocok untuk siang hari yang terang. ISO tinggi (misalnya 1600 atau 3200) membuat sensor lebih peka sehingga kamu bisa merekam di tempat gelap, tetapi harganya adalah noise, yaitu bintik-bintik kasar yang merusak gambar. Aturannya sederhana: pakai ISO serendah mungkin selama gambar masih cukup terang.

Aperture adalah bukaan lensa, yaitu seberapa lebar lubang tempat cahaya masuk. Aperture ditulis dengan angka-f: f/1.8 berarti bukaan lebar, f/16 berarti bukaan sempit. Bukaan lebar memasukkan banyak cahaya dan membuat latar blur, sedangkan bukaan sempit memasukkan sedikit cahaya tetapi membuat hampir semua yang ada di frame tajam. Aperture juga menentukan depth of field, yang akan kamu pelajari lebih dalam di pelajaran berikutnya.

Shutter speed adalah lamanya sensor menangkap cahaya untuk satu frame. Shutter yang cepat (misalnya 1/500 detik) membekukan gerakan, cocok untuk adegan aksi. Shutter yang lambat (misalnya 1/30 detik) membuat gerakan tampak blur dan mengalir, tetapi gambar menjadi lebih terang dan berisiko goyang. Untuk video, patokan umumnya adalah shutter speed sekitar dua kali frame rate: kalau merekam 24 fps, pakai sekitar 1/50 detik.

Ketiga pengaturan ini selalu berkompromi. Di ruangan yang gelap, kamu bisa menaikkan ISO, tetapi gambar menjadi berbintik; membuka aperture, tetapi latar menjadi blur dan fokus makin sulit; atau memperlambat shutter, tetapi gerakan menjadi blur. Tidak ada kombinasi yang benar secara mutlak, yang ada adalah kombinasi yang tepat untuk ceritamu. Itulah sebabnya fotografer dan sinematografer selalu bertanya dulu: gambar seperti apa yang saya inginkan, baru mengatur segitiganya.

Contoh:
Di siang hari yang terang, atur ISO 100 dan shutter 1/50, lalu coba dua aperture: f/1.8 dan f/8. Perhatikan dua hal yang berubah sekaligus: kecerahan gambar dan seberapa blur latar di belakang temanmu. Itulah bukti bahwa satu pengaturan mengubah dua hal sekaligus.

Ringkasan:
ISO mengatur sensitivitas sensor, aperture mengatur bukaan lensa, dan shutter speed mengatur lamanya cahaya ditangkap. Ketiganya membentuk segitiga eksposur yang saling memengaruhi. Kuasai ketiganya, dan kamu bisa membuat gambar terang yang benar dalam kondisi cahaya apa pun.

[Perlu ditinjau mentor]$$)
on conflict (id) do nothing;

-- Course 1, Lesson 4: White balance, fokus, depth of field
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000104', '21000000-0000-4000-8000-000000000001', 'White balance, fokus, depth of field', 4, NULL, $$Tujuan:
Setelah pelajaran ini, kamu bisa mengatur white balance agar warna kulit terlihat natural, mengunci fokus pada subjek, dan mengendalikan depth of field untuk mengarahkan perhatian penonton.

Penjelasan:
White balance adalah pengaturan yang membuat warna putih terlihat putih dalam cahaya apa pun. Cahaya matahari pagi berwarna hangat kekuningan, sedangkan cahaya langit mendung berwarna dingin kebiruan. Mata manusia menyesuaikan diri secara otomatis, tetapi kamera tidak: kalau white balance salah, kulit tokoh bisa terlihat terlalu kuning atau terlalu biru. Karena itu, kunci white balance secara manual sebelum merekam dan jangan diubah di tengah adegan, supaya warna kulit konsisten dari shot ke shot.

Fokus menentukan bagian mana dari gambar yang tajam. Di HP, kamu bisa mengetuk subjek di layar untuk memfokuskan kamera padanya, lalu menahan ketukan untuk mengunci fokus dan eksposur (biasanya muncul tulisan AE/AF Lock). Mengunci fokus itu penting: kamera HP yang mengubah fokus sendiri di tengah shot akan membuat editor pusing, dan editor itu adalah kamu minggu depan. Teknik lanjutan adalah rack focus, yaitu memindahkan fokus dari satu subjek ke subjek lain di tengah shot untuk mengalihkan perhatian penonton.

Depth of field adalah seberapa dalam area yang tajam di dalam gambar. Depth of field dangkal berarti hanya tokoh yang tajam dan latarnya blur, sehingga mata penonton langsung tertuju pada tokoh. Depth of field dalam berarti hampir semua tajam, dari tokoh sampai latar di belakangnya. Tiga hal memengaruhi depth of field: aperture (bukaan lebar membuat depth of field dangkal), jarak kamera ke subjek (makin dekat, makin dangkal), dan panjang lensa (lensa tele membuat depth of field lebih dangkal).

Ketiga hal ini bekerja bersama. Bukaan lebar memberi latar blur yang cantik, tetapi fokus jadi lebih sulit dijaga karena area tajamnya tipis. White balance yang salah bisa merusak shot yang fokus dan eksposurnya sudah benar. Karena itu biasakan memeriksa ketiganya sebelum menekan tombol rekam: warna sudah benar, fokus terkunci, dan depth of field sesuai dengan ceritamu.

Contoh:
Foto temanmu di depan gerbang sekolah dua kali. Pertama dari jarak 3 meter dengan bukaan kecil, sehingga gerbang di belakangnya masih tajam. Kedua dari jarak 1 meter dengan bukaan lebar, sehingga gerbang menjadi blur dan temanmu menonjol. Bandingkan: cerita mana yang lebih kuat, dan kapan kamu memakai masing-masing?

Ringkasan:
White balance menjaga warna tetap natural, fokus menentukan apa yang tajam, dan depth of field mengatur seberapa banyak yang tajam. Ketiganya adalah alat untuk mengarahkan mata penonton. Periksa ketiganya sebelum merekam, dan kunci pengaturannya supaya tidak berubah sendiri di tengah shot.

[Perlu ditinjau mentor]$$)
on conflict (id) do nothing;

-- Course 1, Lesson 5: Camera shot: wide, medium, close-up
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000105', '21000000-0000-4000-8000-000000000001', 'Camera shot: wide, medium, close-up', 5, NULL, $$Tujuan:
Setelah pelajaran ini, kamu bisa menyebut dan memakai tujuh shot size standar dengan framing yang benar, serta menjelaskan fungsi masing-masing ukuran dalam sebuah adegan.

Penjelasan:
Shot size menjelaskan seberapa banyak subjek, biasanya manusia, mengisi frame. Definisi standarnya memakai tubuh manusia sebagai penggaris. Extreme Long Shot (ELS) membuat tokoh sangat kecil atau nyaris tak terlihat karena lingkungan mendominasi; ia dipakai sebagai establishing shot untuk menunjukkan tempat, skala, dan rasa sepi. Long Shot atau Wide Shot (LS) menampilkan seluruh tubuh dari kepala sampai kaki dengan lingkungan yang masih banyak, cocok untuk geografi adegan dan aksi. Full Shot (FS) membuat seluruh tubuh memenuhi tinggi frame, bagus untuk bahasa tubuh, gerakan, dan kostum.

Medium Long Shot (MLS), yang juga disebut cowboy shot, memframing dari sekitar lutut ke atas dan cocok untuk percakapan kelompok. Medium Shot (MS) dari pinggang ke atas adalah ukuran standar dialog sehari-hari karena menampilkan gerak tangan sekaligus ekspresi. Medium Close-Up (MCU) dari pertengahan dada ke atas dipakai untuk dialog yang lebih emosional dan menjadi andalan coverage. Close-Up (CU) dari bahu ke atas membuat wajah memenuhi frame untuk menekankan emosi dan reaksi. Extreme Close-Up (ECU) hanya menampilkan satu detail, seperti mata atau bibir, untuk ketegangan, detail kunci, atau kejutan.

Ada tiga aturan praktis yang dipakai para profesional. Pertama, jangan memotong tokoh tepat di sendi alami tubuh seperti lutut atau siku, karena potongan di situ terlihat janggal; potonglah di antara sendi, misalnya pertengahan paha atau pertengahan lengan bawah. Kedua, shot size bisa dicapai dengan mendekatkan kamera atau memakai lensa yang lebih panjang, dan hasilnya berbeda: lensa panjang memampatkan latar, sedangkan kamera yang mendekat mengubah perspektif. Ketiga, pikirkan progresi: adegan sering dibuka lebar (ELS/LS), lalu makin mendekat (MS, CU) ketika emosi memuncak.

Batas antar ukuran tidak mutlak. Seorang DP bisa menyebut close-up apa yang disebut DP lain medium close-up. Yang penting adalah kamu konsisten dan tahu fungsi masing-masing ukuran.

Contoh:
Foto satu objek yang sama (teman, sepeda, atau gerbang sekolah) dalam lima ukuran: ELS, LS, MS, CU, dan ECU. Tulis satu kalimat per foto: apa yang berubah dari ceritanya? Kamu akan melihat bahwa objek yang sama bisa bercerita tentang tempat, tentang tindakan, atau tentang perasaan, hanya dengan mengubah jarak.

Ringkasan:
Shot size memakai tubuh manusia sebagai penggaris, dari ELS yang menunjukkan tempat sampai ECU yang menunjukkan detail emosi. Setiap ukuran punya fungsi, dan adegan yang baik bergerak dari lebar ke dekat mengikuti naiknya emosi. Jangan memotong tokoh di sendi, dan pilih ukuran shot dengan sengaja, bukan asal-asalan.$$)
on conflict (id) do nothing;

-- Course 1, Lesson 6: Camera angle dan camera movement
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000101', '22000000-0000-4000-8000-000000000001', 'Camera angle dan camera movement', 1, NULL, $$Tujuan:
Setelah pelajaran ini, kamu bisa membedakan camera angle dan camera movement, menjelaskan kesan yang ditimbulkan tiap sudut dan gerakan, serta memilih keduanya dengan alasan cerita.

Penjelasan:
Shot size menjawab "seberapa dekat", angle menjawab "dari mana". Keduanya pilihan yang berbeda dan bisa digabung: ada low-angle close-up, high-angle wide shot, dan eye-level medium shot. Sudut kamera adalah tuas psikologis: sebelum satu kata pun diucapkan, sudut sudah memberi tahu penonton siapa yang berkuasa, siapa yang rentan, dan apakah dunia tokoh sedang baik-baik saja.

Eye level, kamera setinggi mata tokoh dan sejajar dengannya, terasa netral dan setara; ini standar dialog, tetapi terasa datar kalau dipakai terus tanpa variasi. Low angle, kamera di bawah tokoh dan mendongak ke atas, membuat tokoh tampak besar, berkuasa, heroik, atau mengancam. High angle, kamera di atas tokoh dan menunduk ke bawah, membuat tokoh tampak kecil, rentan, atau kalah, tetapi bisa juga sekadar menunjukkan denah ruangan. Bird's-eye atau overhead, kamera tepat di atas dan menatap lurus ke bawah, menunjukkan pola, keteraturan, atau takdir dengan rasa menjaga jarak. Dutch angle, kamera dimiringkan sehingga horizon miring, memberi rasa gelisah dan tidak stabil, dan dipakai film noir serta thriller. Over-the-shoulder (OTS) mengambil dari belakang bahu satu tokoh ke tokoh lain, sehingga penonton ikut duduk di tengah dialog. Point of view (POV) menempatkan kamera tepat di posisi mata tokoh, sehingga penonton melihat apa yang tokoh lihat.

Hati-hati dengan pembacaan yang terlalu kaku. High angle tidak selalu berarti lemah, ia bisa sekadar memberi jarak observasi, seperti mengawasi dari jauh. Low angle tidak selalu berarti kuat, karena konteks dan akting bisa membalik maknanya. Angle adalah petunjuk, bukan vonis.

Gerakan kamera pun punya bahasanya sendiri. Pan adalah kamera diam di tripod yang menoleh kiri-kanan, dipakai untuk mengikuti gerakan atau memperkenalkan ruangan. Tilt adalah kamera diam yang menengadah atau menunduk, dipakai untuk menunjukkan tinggi, dari sepatu ke wajah atau dari lantai ke langit-langit. Dolly atau tracking adalah kamera yang bergerak maju, mundur, atau menyamping, dipakai untuk mendekati emosi tokoh atau menemani perjalanannya. Zoom hanya mengubah focal length lensa tanpa menggerakkan kamera, dan jarang dipakai di film cerita karena terasa artifisial; lebih baik dolly. Handheld adalah kamera yang dipegang tangan, memberi rasa dokumenter, gelisah, atau intim, tetapi butuh alasan, bukan karena malas memakai tripod.

Prinsip yang membedakan amatir dan profesional: gerakan kamera harus punya alasan cerita. Dolly-in ke wajah tokoh berarti "perhatikan, ini penting". Handheld yang bergetar berarti "dunia tokoh sedang tidak stabil". Gerakan tanpa alasan hanya membuat penonton mabuk. Sebelum merekam, tulis satu kalimat: gerakan ini membuat penonton merasakan apa?

Contoh:
Rekam temanmu yang sedang membaca pesan penting dengan dua versi. Versi pertama: eye level, kamera statis, medium shot. Versi kedua: low angle dengan dolly-in pelan ke close-up. Bandingkan: versi mana yang membuat pesan itu terasa lebih penting, dan kenapa? Tulis satu kalimat alasan untuk gerakan yang kamu pilih.

Ringkasan:
Angle menentukan dari mana kamera memandang dan kesan psikologisnya, sedangkan movement menentukan bagaimana kamera bergerak dan apa yang dirasakan penonton. Keduanya harus dipilih dengan alasan cerita, bukan karena terlihat keren. Satu sudut berani dan satu gerakan bermakna per adegan sudah cukup untuk membuat gambarmu hidup.$$)
on conflict (id) do nothing;

-- Course 1, Lesson 7: Komposisi: rule of thirds, leading lines, framing
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000102', '22000000-0000-4000-8000-000000000001', 'Komposisi: rule of thirds, leading lines, framing', 2, NULL, $$Tujuan:
Setelah pelajaran ini, kamu bisa mengomposisi gambar dengan rule of thirds, leading lines, dan framing, serta menjelaskan kapan aturan komposisi boleh dilanggar dengan sengaja.

Penjelasan:
Rule of thirds adalah panduan komposisi, bukan hukum: bayangkan frame dibagi sembilan bagian sama besar oleh dua garis horizontal dan dua garis vertikal yang berjarak sama. Elemen penting diletakkan di sepanjang garis-garis itu atau di titik potongnya, empat titik yang kadang disebut power point. Menempatkan subjek di titik itu menciptakan ketegangan dan ketertarikan visual yang lebih besar daripada menaruhnya tepat di tengah.

Untuk orang, kebiasaan yang sudah teruji adalah menyejajarkan tubuh dengan garis vertikal, dan mata dengan garis horizontal atas. Untuk lanskap, letakkan horizon di garis atas atau garis bawah, jangan di tengah, karena horizon di tengah membelah gambar jadi dua dan terasa membosankan. Untuk subjek yang bergerak atau memandang ke satu arah, sisakan ruang kosong di depan arah gerak atau arah pandang itu; ini disebut leading room atau looking space.

Leading lines adalah garis-garis di dalam gambar yang mengarahkan mata penonton ke subjek: jalan, pagar, rel, sungai, atau tepi bangunan. Garis yang mengarah ke tokoh membuat penonton menemukan tokoh tanpa disadari, dan memberi kedalaman pada gambar yang datar. Carilah garis yang sudah ada di lokasi syutingmu, lalu posisikan kamera supaya garis itu menunjuk ke subjek.

Framing adalah cara memakai elemen di sekitar untuk membingkai subjek: jendela, pintu, dahan pohon, atau lorong. Bingkai alami ini memusatkan perhatian, memberi kedalaman, dan membuat gambar terasa seperti sebuah dunia tersendiri. Dalam film The Godfather Part II (1974), Michael Corleone yang berhadapan dengan Fredo diframing off-center mengikuti rule of thirds, sehingga ketegangan di antara mereka, bukan hanya wajah mereka, yang memenuhi layar.

Kapan aturan ini boleh dilanggar? Pusat frame justru kuat untuk simetri yang disengaja, untuk tokoh yang terisolasi, atau untuk menegaskan keteraturan. Melanggar aturan dengan sengaja, dan tahu kenapa, adalah bagian dari gaya. Melanggar karena tidak tahu, biasanya hanya terlihat ceroboh.

Contoh:
Foto satu teman dua kali di lokasi yang sama. Pertama, temanmu di tengah frame. Kedua, temanmu di titik potong rule of thirds dengan mata di garis horizontal atas dan ruang pandang di depan arah pandangnya. Bandingkan kedua foto itu: mana yang lebih hidup, dan apa yang berubah dari ceritanya?

Ringkasan:
Rule of thirds menaruh elemen penting di garis atau titik potong, leading lines mengarahkan mata ke subjek, dan framing membingkai subjek dengan elemen sekitar. Ketiganya membuat gambar lebih hidup daripada sekadar menaruh subjek di tengah. Kuasai aturannya dulu, lalu langgar dengan sengaja saat ceritamu membutuhkannya.$$)
on conflict (id) do nothing;

-- Course 1, Lesson 8: Lighting dasar dan natural light
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000103', '22000000-0000-4000-8000-000000000001', 'Lighting dasar dan natural light', 3, NULL, $$Tujuan:
Setelah pelajaran ini, kamu bisa menata pencahayaan tiga titik dengan lampu rumah atau cahaya matahari, serta memakai cahaya alami pada waktu yang tepat.

Penjelasan:
Three-point lighting adalah metode standar di film, video, foto, teater, sampai grafis 3D: tiga lampu pada tiga posisi berbeda menerangi subjek, mengontrol bayangan, highlight, dan kontras, sekaligus memberi kesan tiga dimensi yang terasa natural, mirip cara mata kita melihat dunia nyata.

Key light adalah lampu utama dan paling terang, diletakkan di satu sisi kamera, 30 sampai 45 derajat dari sumbu kamera-subjek dan 30 sampai 45 derajat di atasnya. Ia menentukan arah cahaya, mood, dan eksposur keseluruhan. Fill light diletakkan di sisi berlawanan dari key, dekat kamera dan lebih rendah dari key; tugasnya melembutkan bayangan yang dibuat key, dengan kekuatan sekitar setengah key (rasio 2:1). Fill bisa diganti reflektor atau kertas putih. Back light diletakkan di belakang tokoh dari atas, biasanya di sisi berlawanan key; ia membuat garis cahaya (rim) di rambut dan bahu, sehingga tokoh terpisah dari latar.

Rasio key dan fill menentukan mood. Rasio rendah (2:1, fill separuh key) memberi gambar yang seimbang dan terang, cocok untuk komedi dan wawancara. Rasio tinggi (8:1, fill sangat redup) memberi kontras tinggi dan bayangan dalam, gaya film noir. Tidak ada fill sama sekali pun bisa menjadi pilihan: bayangan yang dalam terasa dramatis, asal disengaja.

Latihan dengan nol rupiah: key dari jendela di siang hari, karena matahari adalah key light gratis yang kuat; fill dari kertas putih atau dinding putih di sisi berlawanan; back dari lampu meja di belakang tokoh. Yang wajib sama adalah suhu warna semua sumber cahaya: jangan campur lampu kuning dan cahaya biru siang hari tanpa sadar, karena kulit tokoh akan terlihat belang.

Kamu tidak punya lampu studio? Kamu punya matahari, dan matahari adalah sumber cahaya paling kuat dan paling gratis yang pernah ada. Yang perlu kamu pelajari adalah jamnya. Golden hour, satu jam setelah matahari terbit dan satu jam sebelum terbenam, memberi cahaya hangat, lembut, dan datang dari samping sehingga wajah memiliki bentuk. Di tengah hari, matahari tepat di atas kepala: cahaya keras, bayangan tajam di bawah mata dan hidung, dan tokoh menyipitkan mata. Itu bukan cahaya yang buruk, itu cahaya yang cocok untuk adegan yang keras dan terik.

Tiga cara memakai cahaya alami dengan benar. Pertama, jangan memotret orang dengan matahari tepat di belakangnya tanpa fill, karena wajahnya akan gelap total (siluet); kalau kamu memang mau siluet, pastikan bentuknya jelas dan disengaja. Kedua, cahaya jendela adalah softbox gratis: tokoh yang duduk menghadap jendela mendapat key light yang lembut dari satu sisi, dan dinding di seberangnya menjadi fill alami. Ketiga, awan adalah diffuser raksasa: hari berawan memberi cahaya yang rata dan lembut, sangat cocok untuk wawancara, karena tidak ada bayangan keras di wajah.

Contoh:
Rekam wawancara 30 detik dengan pencahayaan tiga titik memakai lampu rumah atau jendela. Rekam dua versi: rasio rendah (fill terang) dan rasio tinggi (fill redup). Tonton keduanya dan tulis satu kalimat: mana yang cocok untuk topik wawancaramu, dan kenapa?

Ringkasan:
Three-point lighting memakai key, fill, dan back untuk membentuk wajah dan memisahkan tokoh dari latar, dan rasionya menentukan mood. Cahaya matahari adalah studio gratis: golden hour memberi cahaya hangat yang lembut, jendela menjadi softbox, dan awan menjadi diffuser. Pahami jam dan arah cahaya, dan kamu bisa menerangi adegan apa pun tanpa membeli lampu.$$)
on conflict (id) do nothing;

-- Course 1, Lesson 9: Praktik berbagai jenis shot
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000104', '22000000-0000-4000-8000-000000000001', 'Praktik berbagai jenis shot', 4, NULL, $$Tujuan:
Setelah pelajaran ini, kamu bisa mempraktikkan lima shot size dan tiga camera angle yang berbeda, serta menyusun shot list 10 baris untuk satu adegan pendek.

Penjelasan:
Teori sinematografi hanya menjadi milikmu setelah kamu mempraktikkannya. Latihan pertama adalah lima foto, lima bahasa: foto satu objek yang sama (teman, sepeda, atau gerbang sekolah) dalam ELS, LS, MS, CU, dan ECU. Tulis satu kalimat per foto tentang apa yang berubah dari ceritanya. Latihan ini mengajarkan bahwa jarak kamera bukan soal teknis, melainkan soal cerita: objek yang sama bisa bercerita tentang tempat, tentang tindakan, atau tentang perasaan.

Latihan kedua adalah tiga foto angle: satu eye level, satu low angle, dan satu high angle pada subjek yang sama. Tulis kesan apa yang berubah, dan apakah angle itu cocok dengan karakter subjekmu. Kamu akan merasakan langsung bahwa low angle membuat temanmu tampak berwibawa, sedangkan high angle membuatnya tampak kecil dan rentan, padahal orangnya sama dan cahayanya sama.

Latihan ketiga adalah video 30 detik: satu dolly-in (kamera maju pelan) ke wajah teman yang sedang membaca pesan penting. Sebelum merekam, tulis satu kalimat alasan gerakan itu. Gerakan kamera tanpa alasan hanya membuat penonton mabuk; gerakan dengan alasan membuat penonton merasakan sesuatu.

Semua latihan itu bermuara pada shot list, yaitu daftar shot yang akan diambil, diurutkan sesuai kebutuhan syuting (bukan urutan cerita). Satu baris shot list berisi nomor adegan, shot size, angle, gerakan kamera, dan catatan isi. Untuk film pendek sekolah, shot list 8 sampai 12 baris sudah cukup. Shot list menghemat waktu di lokasi dan memastikan editor punya bahan yang cukup. Sutradara yang tidak punya shot list biasanya pulang dengan 40 take yang sama dan kehilangan satu angle penting.

Contoh shot list untuk adegan "seseorang menunggu kabar penting di halte": dibuka dengan ELS statis yang menunjukkan halte di tengah hujan, lalu LS dengan pan pelan saat anak duduk di halte, MS saat ia membuka HP dan menghapus pesannya, CU pada matanya yang menatap layar, dan ECU pada jempol yang bergetar di atas tombol kirim. Perhatikan progresinya: dibuka lebar, lalu makin dekat mengikuti ketegangan. Di tengahnya ada satu Dutch angle ringan saat ia menoleh ke suara bus, karena di momen itu dunianya goyah. Efek yang dipakai sekali adalah penekanan; efek yang dipakai terus adalah kebiasaan buruk.

Contoh:
Buat shot list 10 baris untuk adegan "seseorang menunggu kabar penting di halte". Sertakan shot size, angle, dan gerakan per baris, lalu rekam tiga shot pertamamu dari daftar itu. Bandingkan hasil rekaman dengan rencanamu: apakah shot list itu membantumu, atau ada shot yang ternyata tidak kamu butuhkan?

Ringkasan:
Praktik adalah tempat teori menjadi keterampilan: lima foto shot size, tiga foto angle, satu video dolly-in, dan satu shot list 10 baris. Shot list adalah rencanamu sebelum menekan tombol rekam, dan ia menghemat waktu sekaligus memastikan tidak ada angle penting yang hilang. Mulailah dari yang kamu punya, dan biarkan setiap latihan menjawab satu pertanyaan cerita.$$)
on conflict (id) do nothing;

-- Course 1, Lesson 10: Evaluasi visual dan analisis gambar
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000105', '22000000-0000-4000-8000-000000000001', 'Evaluasi visual dan analisis gambar', 5, NULL, $$Tujuan:
Setelah pelajaran ini, kamu bisa menganalisis sebuah gambar atau foto seperti sinematografer, menyebutkan kesalahan umum pemula, dan menilai seri fotomu sendiri dengan kriteria yang jelas.

Penjelasan:
Seorang sinematografer tidak bertanya "apakah fotonya bagus?" Ia bertanya "apa yang gambar ini katakan, dan bagaimana ia mengatakannya?" Lihat foto ini dalam bayanganmu: seorang anak berdiri di halte bus saat hujan, memegang HP, di belakangnya jalan yang kosong dan lampu kota yang buram. Kalau anak itu difoto dengan ELS, ceritanya adalah tentang tempat dan kesepian: manusia kecil di dunia yang besar dan basah. Kalau difoto dengan CU, ceritanya adalah tentang perasaan: mata yang menatap layar HP, menunggu kabar. Kalau difoto dari low angle, anak itu terasa tegar dan tidak menyerah; dari high angle, ia terasa kecil dan kalah oleh hujan. Objeknya sama, cahayanya sama, hanya jarak dan sudut yang berubah, dan ceritanya berubah total.

Latihan membaca gambar seperti ini adalah latihan sinematografi yang paling murah dan paling penting. Sebelum kamu merekam apa pun, biasakan menonton film dengan suara dimatikan selama 5 menit dan mencatat: shot size apa yang dipakai, dari angle mana, dan ke mana cahayanya datang.

Ada enam kesalahan umum pemula yang perlu kamu kenali pada karyamu sendiri. Pertama, semua shot dari eye level dan MS, sehingga hasilnya datar seperti rekaman CCTV; variasikan dengan LS di awal, CU saat emosi naik, dan satu angle berani per adegan. Kedua, subjek selalu di tengah frame; coba rule of thirds dan beri ruang pandang di arah tokoh memandang. Ketiga, memotong tokoh di lutut atau siku; potong di antara sendi, misalnya pertengahan paha. Keempat, cahaya dari atas kepala saja, karena lampu plafon membuat bayangan keras di bawah mata (efek "panda"); pindahkan sumber cahaya ke depan-samping tokoh, setinggi mata atau sedikit di atas. Kelima, zoom in-out tanpa alasan; kalau ingin mendekat, gerakkan kameranya (dolly) atau potong ke shot yang lebih dekat. Keenam, merekam tanpa shot list, sehingga kamu pulang dengan 40 take yang sama dan kehilangan satu angle penting.

Untuk menilai karyamu, pakai kriteria yang jelas. Seri foto bercerita yang baik memakai 6 ukuran shot dengan framing benar dan progresi lebar ke dekat yang terasa. Komposisinya memakai rule of thirds dan ruang pandang secara konsisten. Cahayanya memakai tiga titik atau cahaya alami dengan sadar, dan wajah terbaca jelas. Urutan fotonya bercerita jelas tanpa teks. Dan shot list 10 barisnya lengkap dan benar-benar diikuti di lapangan.

Contoh:
Pilih satu foto dari latihanmu minggu ini, lalu analisis dengan empat pertanyaan: shot size apa yang dipakai dan apakah cocok dengan ceritanya? Dari angle mana kamera memandang dan kesan apa yang ditimbulkannya? Bagaimana komposisi dan ruang pandangnya? Dari mana cahaya datang dan apakah wajah terbaca jelas? Tulis jawabanmu dalam empat kalimat, lalu tulis satu hal yang akan kamu perbaiki kalau memotret ulang.

Ringkasan:
Menganalisis gambar berarti bertanya apa yang gambar katakan dan bagaimana ia mengatakannya, lewat jarak, sudut, komposisi, dan cahaya. Kesalahan pemula yang paling umum adalah semua shot datar dari eye level, subjek selalu di tengah, dan merekam tanpa rencana. Nilai karyamu dengan kriteria yang jelas, perbaiki satu hal terlemah, dan ulangi: fondasi yang goyah akan terasa di course berikutnya.$$)
on conflict (id) do nothing;

-- ==================== COURSE 2: PENULISAN SKENARIO ====================

insert into public.modules (id, course_id, title, order_index) values
('21000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Section 1 — Minggu 1', 1)
on conflict (id) do nothing;

insert into public.modules (id, course_id, title, order_index) values
('22000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Section 2 — Minggu 2', 2)
on conflict (id) do nothing;

-- Course 2, Lesson 1: Ide, tema, premis
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000201', '21000000-0000-4000-8000-000000000002', 'Ide, tema, premis', 1, NULL, $$Tujuan:
Setelah pelajaran ini, kamu bisa membedakan ide, tema, dan premis, serta menulis premis satu kalimat yang berisi tokoh, tujuan, dan halangan untuk film pendekmu.

Penjelasan:
Semua film yang kamu suka berawal dari lembaran kertas: sebuah skenario. Dan semua skenario berawal dari sesuatu yang lebih kecil lagi, yaitu ide. Ide bisa datang dari mana saja: kejadian di kantin sekolah, surat yang tidak pernah dikirim, HP rusak yang masih berdering setiap jam 7 malam, atau kakek yang tidak bisa membaca dan meminta cucunya membacakan surat. Ide adalah benihnya; ia belum menjadi cerita.

Tema adalah apa yang ingin kamu katakan lewat cerita itu. Tema adalah pesan atau pertanyaan besar yang hidup di balik kejadian: tentang keberanian, tentang rasa malu, tentang keluarga, tentang suara yang akhirnya didengar. Satu ide bisa melahirkan banyak tema, dan tema yang sama bisa diceritakan lewat seribu ide yang berbeda. Tema membuat ceritamu punya alasan untuk diceritakan, bukan sekadar rangkaian kejadian.

Premis adalah jembatan antara ide dan cerita. Premis menjawab tiga hal dalam satu kalimat: siapa tokohnya, apa yang ia inginkan, dan apa yang menghalanginya. Contoh: "Seorang siswi pendiam yang ingin memenangkan lomba pidato harus berhadapan dengan kakak kelas yang dulu mempermalukannya." Kalau premismu tidak bisa diringkas jadi satu kalimat, ceritamu belum jelas, dan itu kabar baik, karena kamu menemukannya sekarang, bukan setelah menulis 40 halaman.

Dari premis lahir pertanyaan dramatik (dramatic question): pertanyaan besar yang hanya terjawab di klimaks. "Apakah ia akan menang?" atau "Apakah ia akan berani bicara?" Pertanyaan inilah yang membuat penonton bertahan sampai akhir. Kalau pertanyaanmu terjawab di tengah film, penonton tidak punya alasan untuk menonton sisanya.

Contoh:
Ambil satu prompt ini: seorang penjaga kantin sekolah menemukan surat yang tidak pernah dikirim, 10 tahun setelah ditulis. Tulis premis satu kalimat untuknya: siapa tokohnya, apa yang ia inginkan, dan apa yang menghalanginya? Lalu tulis pertanyaan dramatiknya dalam satu kalimat. Kalau kamu bisa menjawab kedua kalimat itu, ceritamu sudah punya tulang punggung.

Ringkasan:
Ide adalah benih cerita, tema adalah pesan yang ingin kamu sampaikan, dan premis adalah cerita dalam satu kalimat yang berisi tokoh, tujuan, dan halangan. Premis yang jelas melahirkan pertanyaan dramatik yang membuat penonton bertahan sampai klimaks. Rancang dulu, baru menulis: struktur bukan musuh kreativitas, melainkan alat supaya kreativitasmu sampai ke penonton.$$)
on conflict (id) do nothing;

-- Course 2, Lesson 2: Logline dan sinopsis
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000202', '21000000-0000-4000-8000-000000000002', 'Logline dan sinopsis', 2, NULL, $$Tujuan:
Setelah pelajaran ini, kamu bisa menulis logline satu kalimat yang menjual ceritamu dan sinopsis satu paragraf yang merangkum awal, tengah, dan akhir cerita.

Penjelasan:
Sebelum skenario, penulis biasanya menulis dua dokumen pendek. Logline adalah premis dalam satu kalimat yang menjual cerita. Contoh: "Seorang siswi pendiam harus memenangkan lomba pidato untuk membuktikan pada kakak kelas yang mempermalukannya bahwa suaranya layak didengar." Logline yang baik menyebut tokoh, tujuan, halangan, dan taruhannya, tanpa menyebut akhir cerita. Logline adalah tes pertama kualitas cerita: kalau logline-mu kabur, ceritamu kemungkinan besar juga kabur.

Sinopsis satu paragraf adalah cerita lengkap dalam 5 sampai 8 kalimat: awal, tengah, akhir, termasuk bagaimana cerita berakhir. Berbeda dengan logline, sinopsis boleh dan harus menyebut akhirnya. Kalau kamu tidak bisa menulis sinopsis tanpa merasa ada yang hilang, struktur ceritamu belum lengkap.

Latihan yang dipakai banyak penulis: tulis logline untuk tiga film favoritmu. Kamu akan menemukan bahwa film yang kamu anggap "sederhana" ternyata memiliki logline yang sangat jelas, dan film yang kamu anggap "membingungkan" biasanya logline-nya kabur. Kejelasan logline adalah cermin kejelasan cerita.

Logline dan sinopsis juga alat kerja, bukan sekadar tugas. Saat kamu buntu di tengah menulis naskah, kembalilah ke logline-mu: apakah adegan yang sedang kamu tulis masih melayani logline itu? Kalau tidak, adegan itu mungkin perlu dipotong atau ditulis ulang. Penulis profesional memakai logline sebagai kompas selama berbulan-bulan penulisan.

Keduanya juga dipakai di luar ruang penulisan. Logline adalah kalimat pertama yang kamu ucapkan saat pitching idemu ke teman, guru, atau juri lomba: dalam sepuluh detik mereka harus paham film tentang apa dan kenapa menarik. Sinopsis dipakai saat mendaftarkan film ke festival atau lomba, supaya panitia tahu ceritamu utuh sebelum menonton. Karena itu, latihlah keduanya sampai kamu bisa mengucapkannya tanpa membaca catatan.

Contoh:
Tulis logline untuk film favoritmu dalam satu kalimat, lalu tulis sinopsisnya dalam 5 sampai 8 kalimat yang menyebut awal, tengah, dan akhir. Setelah itu, bandingkan logline-mu dengan premis yang kamu tulis di pelajaran sebelumnya: apakah tokoh, tujuan, dan halangannya sama? Kalau berbeda, putuskan mana yang lebih kuat dan pakai yang itu.

Ringkasan:
Logline adalah cerita dalam satu kalimat yang menjual film tanpa membocorkan akhirnya, sedangkan sinopsis satu paragraf merangkum cerita lengkap dari awal sampai akhir. Keduanya adalah kompas penulisan: kalau logline-mu jelas, ceritamu punya arah; kalau sinopsismu terasa ada yang hilang, strukturmu belum lengkap.$$)
on conflict (id) do nothing;

-- Course 2, Lesson 3: Struktur awal, tengah, akhir
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000203', '21000000-0000-4000-8000-000000000002', 'Struktur awal, tengah, akhir', 3, NULL, $$Tujuan:
Setelah pelajaran ini, kamu bisa menjelaskan fungsi awal, tengah, dan akhir sebuah cerita, serta menguraikan film pendekmu ke dalam tiga bagian tersebut.

Penjelasan:
Banyak pemula menulis skenario dengan cara yang terbalik: langsung menulis dialog halaman demi halaman, lalu bingung kenapa ceritanya terasa datar. Penulis profesional bekerja sebaliknya: mereka merancang dulu, siapa tokohnya, apa yang ia inginkan, apa yang menghalanginya, dan bagaimana ia berubah, baru menulis adegan. Struktur bukan musuh kreativitas; struktur adalah alat supaya kreativitasmu sampai ke penonton.

Struktur paling dasar adalah awal, tengah, dan akhir. Awal (setup) memperkenalkan tokoh, dunia normalnya, dan hubungan-hubungannya. Penonton perlu tahu seperti apa hidup tokoh sebelum cerita dimulai, supaya mereka merasakan ketika hidup itu berubah. Di sinilah kita bertemu Rani, siswi pendiam yang selalu duduk di bangku paling belakang, tidak pernah mengangkat tangan, dan menyimpan naskah pidato di tasnya selama tiga minggu.

Tengah (konfrontasi) adalah bagian terpanjang: tokoh mengejar tujuannya dan membayar harganya, sementara situasi makin memburuk. Rani berlatih di kamar mandi, di halte, di depan cermin, dan gagal terus. Di tengah cerita, ia menemukan rekaman video dirinya yang direkam teman tanpa izin, dan untuk pertama kalinya ia melihat dirinya dari luar: ternyata ia tidak seburuk yang ia kira. Ia mulai berlatih dengan sungguh-sungguh, tetapi di hari lomba, kakak kelas yang dulu mempermalukannya duduk di baris depan dan tersenyum sinis.

Akhir (resolusi) adalah tempat konflik diputuskan dan pertanyaan dramatik terjawab. Rani menatap kertas pidatonya, lalu melipatnya dan memasukkannya ke saku. Ia berbicara tanpa teks, dengan suaranya sendiri, gemetar di awal, lalu mantap. Ia tidak menang juara satu, ia juara tiga. Tetapi di halte sepulang lomba, ia mengangkat tangan dan menyapa kakak kelas itu duluan. Dunia barunya: ia bukan lagi orang yang bersembunyi.

Perhatikan bahwa akhir yang baik tidak selalu berarti tokoh mendapatkan apa yang ia inginkan. Rani menginginkan juara satu, tetapi yang ia dapatkan adalah keberanian untuk memakai suaranya sendiri. Akhir yang memuaskan adalah akhir yang menjawab pertanyaan dramatik dan menunjukkan perubahan tokoh, bukan akhir yang sekadar bahagia.

Contoh:
Pilih satu film pendek favoritmu dan tulis outline tiga bagian dalam 9 sampai 12 baris: apa yang terjadi di awal, apa yang memburuk di tengah, dan bagaimana konflik diputuskan di akhir. Tandai satu kalimat untuk tiap bagian yang menjadi titik baliknya. Kalau kamu kesulitan menemukan titik balik itu, mungkin film itu memang punya struktur yang longgar, dan itu pelajaran juga.

Ringkasan:
Awal memperkenalkan tokoh dan dunia normalnya, tengah membuat tokoh mengejar tujuan sambil membayar harga yang makin mahal, dan akhir memutuskan konflik lewat pilihan tokoh sendiri. Akhir yang memuaskan menjawab pertanyaan dramatik dan menunjukkan perubahan tokoh, walau tokoh tidak selalu mendapatkan apa yang ia inginkan.$$)
on conflict (id) do nothing;

-- Course 2, Lesson 4: Three-act structure
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000204', '21000000-0000-4000-8000-000000000002', 'Three-act structure', 4, NULL, $$Tujuan:
Setelah pelajaran ini, kamu bisa menguraikan struktur tiga babak lengkap dengan inciting incident, plot point 1, midpoint, plot point 2, dan klimaks, serta memakai proporsi 25-50-25 sebagai panduan.

Penjelasan:
Modul ini memakai model yang paling banyak dipakai di dunia film: struktur tiga babak dari Syd Field, yang ia uraikan dalam buku Screenplay: The Foundations of Screenwriting (1979). Field membaca lebih dari 2.000 skenario dalam dua tahun sebagai kepala departemen cerita, dan dari sanalah ia merumuskan polanya. Model ini bukan satu-satunya cara bercerita, tetapi ia adalah fondasi yang paling aman untuk film pertamamu.

Struktur tiga babak membagi cerita menjadi Setup (Pengenalan), Confrontation (Konfrontasi), dan Resolution (Resolusi). Sebagai panduan kasar, Babak 1 sekitar 25 persen cerita, Babak 2 sekitar 50 persen, dan Babak 3 sekitar 25 persen. Yang memisahkan babak-babak itu bukanlah durasi, melainkan dua titik balik (plot point): momen ketika tokoh memutuskan bertindak, dan momen ketika pilihan mudah terakhir menghilang.

Babak 1 memperkenalkan tokoh, dunia normalnya, dan hubungan-hubungannya. Di dalamnya ada inciting incident, peristiwa yang merusak dunia normal, lalu Plot Point 1, saat tokoh masuk ke perjalanan baru dan hidupnya tidak akan sama lagi. Dalam contoh "Hujan di Halte", inciting incident adalah pengumuman lomba pidato yang ditempel di papan kelas dan Bu Sinta yang menatap Rani sambil berkata, "Kamu ikut, ya?" Plot Point 1 adalah Rani yang mengambil formulir pendaftaran dari meja guru: ia sudah berkomitmen, dan semua orang melihatnya.

Babak 2 adalah bagian terpanjang: tokoh mengejar tujuan dan membayar harganya, situasi makin memburuk. Di tengah babak ada midpoint, penemuan atau pembalikan yang mengubah arah cerita. Rani menemukan rekaman video dirinya dan untuk pertama kalinya melihat dirinya dari luar: ternyata ia tidak seburuk yang ia kira. Babak 2 diakhiri Plot Point 2, titik harapan terendah atau tekanan tertinggi: Rani melihat kakak kelas itu di baris depan, tangannya bergetar, dan ia hampir turun dari panggung.

Babak 3 adalah resolusi: konflik diputuskan dan pertanyaan dramatik terjawab. Klimaks adalah adegan ketika konflik utama diputuskan oleh pilihan atau tindakan tokoh, bukan oleh kebetulan. Rani melipat kertas pidatonya dan berbicara tanpa teks. Setelah klimaks, ada dunia baru tokoh (new normal): ia juara tiga, tetapi di halte ia menyapa kakak kelas itu duluan.

Dua kesalahan yang paling sering terjadi. Pertama, Babak 2 yang mengendur: penulis hanya menumpuk rintangan tanpa menaikkan harga yang harus dibayar tokoh. Yang harus naik adalah biaya, apa yang dipertaruhkan, apa yang hilang kalau gagal. Kedua, klimaks yang diselesaikan oleh keberuntungan atau tokoh lain. Klimaks harus diputuskan oleh pilihan tokoh utama sendiri; kalau tidak, penonton merasa ditipu. Field sendiri menekankan bahwa yang penting adalah bentuknya, bukan nomor halamannya: patokan 25-50-25 adalah panduan, bukan hukum.

Contoh:
Buat outline tiga babak untuk film pendekmu dalam 9 sampai 12 baris. Tulis inciting incident, Plot Point 1, midpoint, Plot Point 2, dan klimaks. Tandai klimaksmu dan jawab dengan jujur: apakah klimaks itu diputuskan oleh pilihan tokoh sendiri, atau oleh kebetulan? Kalau oleh kebetulan, tulis ulang klimaksnya sekarang.

Ringkasan:
Three-act structure membagi cerita menjadi Setup (25 persen), Konfrontasi (50 persen), dan Resolusi (25 persen), dengan dua plot point sebagai pemisah dan klimaks di Babak 3. Midpoint mengubah arah di tengah Babak 2, dan Plot Point 2 membawa tokoh ke titik terendah sebelum klimaks. Klimaks yang baik selalu diputuskan oleh pilihan tokoh utama sendiri, bukan oleh keberuntungan.$$)
on conflict (id) do nothing;

-- Course 2, Lesson 5: Karakter dan karakterisasi
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000205', '21000000-0000-4000-8000-000000000002', 'Karakter dan karakterisasi', 5, NULL, $$Tujuan:
Setelah pelajaran ini, kamu bisa membangun profil tokoh utama dengan want, need, flaw, dan arc, serta menjelaskan perbedaan ketiganya lewat contoh.

Penjelasan:
Tokoh yang kuat bersifat aktif: ia membuat keputusan, mengambil risiko, dan menyebabkan sesuatu terjadi. Tokoh yang hanya bereaksi terhadap kejadian membuat cerita terasa hanyut. Dua konsep membedakan penulis pemula dan penulis yang matang: want dan need.

Want (keinginan) adalah tujuan luar yang disadari tokoh dan bisa difilmkan, misalnya memenangkan lomba pidato. Need (kebutuhan) adalah perubahan dalam diri yang harus terjadi supaya tokoh utuh, misalnya belajar percaya pada suaranya sendiri. Flaw atau wound (cacat atau luka) adalah sifat yang menimbulkan masalah, sering berakar pada pengalaman masa lalu, misalnya takut dipermalukan sejak diejek di depan kelas. Arc (busur karakter) adalah perubahan tokoh dari awal sampai akhir cerita, yang terlihat lewat pilihan-pilihannya.

Perubahan tokoh harus terlihat lewat pilihan di bawah tekanan, bukan lewat dandanan baru atau monolog panjang. Kalau tokohmu berganti baju tetapi keputusannya sama, ia tidak berubah, ia hanya berbelanja. Perubahan yang meyakinkan dibangun bertahap: tokoh menolak berubah di Babak 1, mencoba perilaku baru di Babak 2, jatuh kembali di titik terendah, lalu memilih secara berbeda di klimaks.

Ada tiga jenis arc. Arc positif adalah yang paling umum: tokoh menghadapi konflik, belajar, dan berubah menjadi lebih baik. Contoh klasiknya adalah Scrooge dalam A Christmas Carol. Arc negatif adalah kisah kejatuhan: tokoh gagal, terkorupsi, atau menjadi korban cacatnya sendiri. Michael Corleone dalam The Godfather adalah contoh yang paling sering dikutip. Arc datar berarti tokoh hampir tidak berubah, tetapi keteguhannya mengubah orang dan dunia di sekitarnya; banyak film detektif dan film aksi memakai pola ini. Ketiganya sah; yang penting arc-nya jelas dan diperoleh dengan susah payah, bukan tiba-tiba.

Karakterisasi adalah cara kamu menunjukkan semua itu kepada penonton, bukan dengan menjelaskannya, melainkan lewat tindakan, pilihan, dialog, dan reaksi tokoh terhadap tekanan. Penonton tidak perlu diberi tahu bahwa Rani pemalu; mereka melihatnya dari bangku paling belakang, dari naskah pidato yang disimpan tiga minggu, dan dari tangan yang bergetar di atas formulir pendaftaran.

Contoh:
Buat profil tokoh utama film pendekmu: tulis satu kalimat untuk want, satu kalimat untuk need, satu kalimat untuk flaw atau wound, dan satu kalimat untuk jenis arc-nya (positif, negatif, atau datar). Lalu tulis satu adegan kecil, dua sampai tiga baris, yang menunjukkan flaw tokoh itu lewat tindakan, bukan lewat penjelasan.

Ringkasan:
Tokoh yang kuat bersifat aktif dan berubah lewat pilihan di bawah tekanan. Want adalah tujuan luar yang disadari, need adalah perubahan dalam yang dibutuhkan, flaw adalah luka yang menimbulkan masalah, dan arc adalah perubahan yang terlihat dari awal sampai akhir. Arc bisa positif, negatif, atau datar, tetapi semuanya harus diperoleh dengan susah payah, bukan tiba-tiba.$$)
on conflict (id) do nothing;

-- Course 2, Lesson 6: Konflik, tujuan, motivasi karakter
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000201', '22000000-0000-4000-8000-000000000002', 'Konflik, tujuan, motivasi karakter', 1, NULL, $$Tujuan:
Setelah pelajaran ini, kamu bisa menjelaskan sumber konflik dalam cerita, membedakan tujuan dan motivasi tokoh, dan menaikkan taruhan cerita dari babak ke babak.

Penjelasan:
Cerita tanpa konflik adalah laporan, bukan drama. Konflik lahir ketika tokoh menginginkan sesuatu dan ada halangan yang menghalanginya. Halangan itu bisa berupa orang lain, misalnya kakak kelas yang dulu mempermalukan Rani dan kini duduk di baris depan saat lomba; bisa berupa keadaan, misalnya waktu yang tinggal sepuluh menit; dan bisa berupa diri tokoh sendiri, misalnya rasa takut dipermalukan yang membuatnya menyimpan naskah pidato selama tiga minggu. Konflik yang paling kuat biasanya menggabungkan ketiganya: halangan luar menekan tokoh, dan tekanan itu membangkitkan konflik dalam dirinya.

Tujuan adalah apa yang tokoh kejar, dan ia harus spesifik dan bisa difilmkan. "Menjadi berani" bukan tujuan yang baik karena tidak terlihat; "memenangkan lomba pidato" adalah tujuan yang baik karena penonton bisa melihat apakah tokoh berhasil atau gagal. Motivasi adalah alasan di balik tujuan itu: kenapa tokoh menginginkan hal itu, dan apa yang terjadi kalau ia gagal. Motivasi yang kuat membuat penonton peduli, bahkan ketika tujuannya sederhana.

Di sinilah want dan need bekerja bersama. Want Rani adalah memenangkan lomba, need-nya adalah percaya pada suaranya sendiri. Film yang baik sering memberi tokoh need-nya, bukan want-nya: Rani hanya juara tiga, tetapi ia pulang sebagai orang yang berani menyapa duluan. Penonton merasa puas bukan karena tokoh menang, melainkan karena tokoh berubah.

Yang harus naik dari babak ke babak bukanlah jumlah rintangan, melainkan harga yang harus dibayar. Di Babak 1, Rani hanya mempertaruhkan rasa malu. Di Babak 2, ia mempertaruhkan harga dirinya di depan orang yang pernah mempermalukannya. Di klimaks, ia mempertaruhkan segalanya dengan melipat kertas pidato dan berbicara tanpa teks. Kalau harga yang dipertaruhkan tidak naik, Babak 2 akan terasa mengendur, walau adegannya banyak.

Antagonis atau halangan tidak harus jahat. Kakak kelas Rani tidak perlu menjadi penjahat; cukup ia tersenyum sinis di baris depan, dan rasa takut Rani yang mengerjakan sisanya. Halangan yang baik adalah halangan yang memaksa tokoh memilih: menyerah dan pulang, atau bertahan dan berubah.

Contoh:
Tulis tiga hal untuk tokoh utamamu: tujuannya dalam satu kalimat yang spesifik dan bisa difilmkan, motivasinya dalam satu kalimat, dan halangan terbesarnya dalam satu kalimat. Lalu tulis bagaimana harga yang dipertaruhkan naik dari Babak 1 ke Babak 2: apa yang tokoh pertaruhkan di awal, dan apa yang ia pertaruhkan di titik terendah?

Ringkasan:
Konflik adalah benturan antara keinginan tokoh dan halangan yang menghadangnya, dari luar maupun dari dalam dirinya. Tujuan harus spesifik dan terlihat, motivasi menjelaskan kenapa tujuan itu penting, dan taruhan harus naik dari babak ke babak. Cerita yang kuat tidak menumpuk rintangan, melainkan menaikkan harga yang harus dibayar tokoh.$$)
on conflict (id) do nothing;

-- Course 2, Lesson 7: Dialog dan subteks
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000202', '22000000-0000-4000-8000-000000000002', 'Dialog dan subteks', 2, NULL, $$Tujuan:
Setelah pelajaran ini, kamu bisa menulis dialog yang terdengar seperti orang bicara dan memakai subteks, yaitu makna yang tersembunyi di balik kata-kata tokoh.

Penjelasan:
Dialog yang baik terdengar seperti orang bicara: kalimat pendek, terpotong, tidak selesai, kadang mengulang. Dialog yang buruk terdengar seperti esai: tokoh menjelaskan hal yang sudah mereka ketahui hanya demi penonton, misalnya "Seperti yang kau tahu, kita bersaudara sejak kecil." Itu disebut exposition yang malas. Informasi harus muncul karena tokoh membutuhkannya saat itu, bukan karena penonton membutuhkannya.

Subteks adalah makna yang tidak diucapkan, tetapi hidup di balik kata-kata. Ketika Bu Sinta berkata pelan, "Waktunya tinggal sepuluh menit," yang ia sampaikan bukan sekadar informasi waktu, melainkan dorongan: aku percaya kamu bisa, dan aku sedang menunggumu. Ketika Rani menjawab dengan diam dan tangan yang berhenti bergetar, diam itu adalah subteks: aku takut, tetapi aku akan mencoba. Dialog yang hanya berisi apa yang diucapkan terasa datar; dialog yang punya subteks terasa hidup, karena penonton ikut menebak apa yang sebenarnya dirasakan tokoh.

Tiga latihan dialog yang ampuh. Pertama, baca dialogmu keras-keras; kalau lidahmu tersandung, dialogmu belum natural. Kedua, hapus sepertiga dialogmu dan lihat apakah adegan masih bisa dipahami; seringkali jawabannya ya, dan adegan itu menjadi lebih kuat, karena yang dihapus adalah penjelasan yang sebenarnya sudah disampaikan gambar. Ketiga, beri setiap tokoh "filter" bicara yang berbeda: pilihan kata, panjang kalimat, dan kebiasaan yang membuatmu bisa menebak siapa yang bicara tanpa melihat nama tokohnya.

Perhatikan juga apa yang tidak diucapkan. Tokoh yang sedang marah jarang berkata "aku marah"; ia berkata singkat, memotong kalimat orang lain, atau diam sama sekali. Tokoh yang menyembunyikan sesuatu menjawab dengan pertanyaan lain. Subteks lahir dari jurang antara apa yang tokoh katakan dan apa yang ia rasakan, dan penonton merasakan jurang itu walau tidak bisa menjelaskannya.

Contoh:
Tulis ulang dialog ini menjadi dialog yang natural dengan subteks. Dialog lama: "Rani, kamu harus berani. Kamu sudah berlatih selama tiga minggu dan kamu sebenarnya pintar berbicara di depan umum, jadi kamu pasti bisa memenangkan lomba ini." Tulis ulang dalam dua sampai tiga kalimat pendek, seperti orang bicara sungguhan. Lalu tulis satu kalimat subteks di bawahnya: apa yang sebenarnya dirasakan tokoh yang mengucapkan kalimat itu?

Ringkasan:
Dialog yang baik terdengar seperti orang bicara: pendek, terpotong, dan tidak menjelaskan hal yang sudah diketahui tokoh. Subteks adalah makna di balik kata-kata, yang membuat penonton ikut merasakan apa yang tidak diucapkan. Baca dialogmu keras-keras, hapus sepertiganya, dan beri setiap tokoh suara yang berbeda.$$)
on conflict (id) do nothing;

-- Course 2, Lesson 8: Format penulisan skenario
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000203', '22000000-0000-4000-8000-000000000002', 'Format penulisan skenario', 3, NULL, $$Tujuan:
Setelah pelajaran ini, kamu bisa menulis skenario dalam format standar: slugline, action, character cue, dialog, dan parenthetical, dengan font Courier 12.

Penjelasan:
Skenario memakai format yang baku di seluruh industri, dan format itu punya fungsi: satu halaman skenario yang diformat dengan benar kira-kira sama dengan satu menit waktu layar. Itulah sebabnya font-nya wajib Courier 12 point, font monospace di mana setiap karakter memiliki lebar yang sama, sehingga jumlah huruf per baris dan per halaman selalu konsisten. Naskah film panjang biasanya 90 sampai 120 halaman, alias 90 sampai 120 menit.

Slugline, atau scene heading, membuka setiap adegan dengan huruf besar semua: INT. atau EXT., lalu lokasi, lalu waktu. Contoh: INT. RUANG KELAS - SIANG. INT. berarti interior (di dalam ruangan), EXT. berarti eksterior (di luar ruangan). Slugline memberi tahu kru di mana dan kapan adegan itu terjadi, tanpa satu kalimat penjelasan pun.

Action line adalah deskripsi yang terlihat dan terdengar, ditulis dalam present tense (waktu sekarang). Contoh: "Rani menatap kertas soal. Tangannya bergetar." Action hanya menulis yang bisa dilihat atau didengar penonton. Satu hal yang membedakan skenario dari cerpen: skenario tidak boleh menulis isi pikiran tokoh, seperti "Rani merasa sedih", dan tidak boleh menulis yang tidak bisa difilmkan. Kesedihan ditulis sebagai tindakan: Rani menatap kertas, lalu melipatnya pelan-pelan.

Character cue adalah nama tokoh dengan huruf besar, di tengah halaman, tepat di atas dialognya. Dialog ditulis di bawah nama tokoh, menjorok ke dalam. Parenthetical adalah petunjuk singkat di antara nama dan dialog, misalnya "(pelan)" atau "(menahan tangis)", dan dipakai hemat. Transition, misalnya CUT TO: atau FADE OUT, dipakai seperlunya saja, di ujung adegan.

Aturan margin yang perlu kamu tahu: margin kiri 1,5 inci (untuk jilid), margin kanan, atas, dan bawah 1 inci; nomor halaman di kanan atas, dan halaman pertama tidak diberi nomor. Kamu tidak perlu menghafal semua angka ini: aplikasi seperti Celtx, WriterSolo, atau bahkan template Google Docs sudah mengaturnya. Yang wajib kamu hafal adalah logikanya: slugline untuk tempat dan waktu, action untuk yang terlihat, dialog hanya untuk yang diucapkan.

Contoh:
Perhatikan bentuk adegan ini, bukan dialognya. INT. RUANG KELAS - SIANG. Rani (16) duduk di bangku paling belakang. Di depannya, kertas soal yang masih kosong. Di luar jendela, hujan. Bu Sinta meletakkan soal tambahan di meja Rani. Rani tidak mengangkat kepala. BU SINTA (pelan): "Waktunya tinggal sepuluh menit." Rani menatap kertas itu. Tangannya berhenti bergetar. Ia menulis, satu kata, lalu satu kalimat. CUT TO: Perhatikan apa yang tidak ada di adegan itu: tidak ada "Rani merasa takut", tidak ada penjelasan panjang tentang hujan. Semua emosi disampaikan lewat tindakan yang bisa difilmkan.

Ringkasan:
Format skenario memakai Courier 12 supaya satu halaman kira-kira sama dengan satu menit layar. Slugline membuka adegan dengan tempat dan waktu, action menulis yang terlihat dalam present tense, dan dialog hanya berisi yang diucapkan. Jangan menulis isi pikiran tokoh: kalau penonton tidak bisa melihat atau mendengarnya, jangan tulis.$$)
on conflict (id) do nothing;

-- Course 2, Lesson 9: Menulis skenario film pendek
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000204', '22000000-0000-4000-8000-000000000002', 'Menulis skenario film pendek', 4, NULL, $$Tujuan:
Setelah pelajaran ini, kamu bisa menulis skenario film pendek 5 sampai 8 halaman dalam format standar, dari premis dan outline yang sudah kamu rancang.

Penjelasan:
Sekarang semua yang kamu pelajari bertemu di satu tempat: premis satu kalimat, profil tokoh, outline tiga babak, dan format skenario. Urutan kerjanya penting. Jangan langsung menulis dialog. Mulailah dari premis, lalu profil tokoh (want, need, flaw, arc), lalu outline tiga babak dalam 9 sampai 12 baris, dan baru setelah itu tulis naskahnya. Penulis yang melompat langsung ke dialog biasanya menulis 40 halaman yang datar; penulis yang merancang dulu menulis 8 halaman yang hidup.

Satu halaman skenario kira-kira sama dengan satu menit waktu layar, jadi skenario film pendek 5 sampai 8 halaman akan menjadi film berdurasi 5 sampai 8 menit. Panjang itu bukan kebetulan: ia cukup untuk satu konflik utama yang utuh, dan cukup pendek untuk kamu syuting dengan teman dan lokasi yang kamu punya. Naskah ini akan kamu sutradarai di Course 3, jadi tulis adegan yang bisa kamu syuting, bukan adegan yang butuh 50 figuran dan helikopter.

Batasan bukan musuh penulis pemula, batasan adalah hadiah. Film pendek terbaik yang dibuat pelajar hampir selalu memakai satu lokasi dan dua tokoh, bukan karena penulisnya tidak punya imajinasi, melainkan karena batasan memaksa cerita menjadi dalam, bukan lebar. Dengan satu lokasi, kamu tidak bisa bersembunyi di balik pemandangan baru; kamu harus menggali konflik dari hubungan kedua tokoh itu. Dengan dua tokoh, setiap dialog harus bekerja keras: tidak ada tokoh ketiga yang bisa datang menyelamatkan adegan yang membosankan.

Coba latihan ini: tulis cerita yang terjadi seluruhnya di satu halte bus, dengan dua tokoh, dalam waktu cerita 10 menit. Kamu akan menemukan bahwa batasan itu justru membebaskanmu dari keputusan yang tidak penting. Aturan praktis untuk naskah pertamamu: maksimal 3 lokasi, maksimal 4 tokoh bicara, dan satu konflik utama. Kalau idemu butuh lebih dari itu, simpan ide itu untuk film keduamu. Film pertama yang selesai, walau sederhana, jauh lebih berharga daripada film ambisius yang tidak pernah selesai ditulis.

Saat menulis, ingat dua aturan dari pelajaran sebelumnya. Pertama, action line hanya menulis yang terlihat dan terdengar, dalam present tense. Kedua, dialog ditulis seperti orang bicara: pendek, terpotong, dan sudah dibaca keras-keras. Kalau sebuah adegan terasa panjang, tanyakan: apakah adegan ini memajukan cerita atau mengubah tokoh? Kalau tidak, tandai untuk dipotong di putaran revisi.

Contoh:
Kerjakan proyek akhir course ini: serahkan skenario film pendek 5 sampai 8 halaman dalam format standar, lengkap dengan logline, profil tokoh (want, need, flaw, arc), dan outline tiga babak satu halaman. Mulailah dari outline "Hujan di Halte" yang sudah kamu buat di pelajaran sebelumnya, lalu kembangkan menjadi adegan demi adegan. Tulis satu adegan hari ini, dan satu adegan lagi besok; naskah yang ditulis sedikit demi sedikit lebih mudah selesai daripada naskah yang ditunggu sampai inspirasi datang.

Ringkasan:
Menulis skenario film pendek dimulai dari rancangan, bukan dari dialog: premis, profil tokoh, outline tiga babak, baru naskah 5 sampai 8 halaman. Satu halaman kira-kira satu menit layar. Batasan satu lokasi dan dua tokoh membuat ceritamu dalam, bukan lebar, dan film pertama yang selesai jauh lebih berharga daripada film ambisius yang tidak pernah selesai.$$)
on conflict (id) do nothing;

-- Course 2, Lesson 10: Revisi dan pengembangan skenario
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000205', '22000000-0000-4000-8000-000000000002', 'Revisi dan pengembangan skenario', 5, NULL, $$Tujuan:
Setelah pelajaran ini, kamu bisa merevisi naskahmu dengan metode kartu adegan dan checklist revisi, serta mengembangkan draf pertama menjadi naskah yang siap diproduksi.

Penjelasan:
Draf pertama selalu jelek, dan itu normal, bahkan untuk penulis profesional. Revisi bukan memperbaiki ejaan; revisi adalah bertanya pada setiap adegan: apakah adegan ini memajukan cerita atau mengubah tokoh? Kalau tidak, potong, tidak peduli sebagus apa dialognya. Penulis yang baik membunuh adegan kesayangannya demi cerita yang utuh.

Cara revisi yang praktis untuk film pendek: cetak naskahmu, baca sekali tanpa pulpen, lalu tulis satu kalimat per adegan di kartu kecil. Susun kartu itu di meja dan lihat alurnya: apakah ketegangan naik? Apakah ada adegan yang mengulang fungsi adegan lain? Kartu yang fungsinya ganda adalah kandidat pertama untuk dipotong atau digabung. Metode kartu ini membuat masalah struktur terlihat secara fisik: kamu bisa menggeser, membuang, atau menukar adegan dengan tanganmu sendiri.

Satu putaran revisi yang baik memakan waktu satu malam tidur. Tulis draf, tidurkan semalam, baca lagi keesokan paginya dengan mata segar. Naskah yang dibaca ulang keesokan harinya hampir selalu menunjukkan masalah yang tidak terlihat semalam, dan itu normal. Jangan merevisi di malam yang sama saat kamu menulis; kamu masih terlalu dekat dengan naskahmu untuk melihatnya dengan jujur.

Sebelum menyatakan naskahmu selesai, jawablah checklist ini dengan jujur. Satu "tidak" berarti satu putaran revisi lagi. Apakah premisku bisa diucapkan dalam satu kalimat yang menyebut tokoh, tujuan, dan halangan? Apakah tokoh utamaku aktif, yaitu menyebabkan sesuatu, bukan hanya bereaksi? Apakah want dan need tokohku berbeda, dan keduanya terlihat di klimaks? Apakah setiap adegan memajukan cerita atau mengubah tokoh? Apakah klimaks diputuskan oleh pilihan tokoh sendiri, bukan oleh kebetulan atau tokoh lain? Apakah dialogku terdengar seperti orang bicara, sudah dibaca keras-keras dan dipendekkan? Apakah action line-ku hanya menulis yang terlihat dan terdengar? Apakah formatku benar: Courier 12, slugline benar, action present tense, dan satu halaman kira-kira satu menit?

Pengembangan naskah juga berarti meminta umpan balik. Tukar naskah dengan teman, minta ia menulis satu kalimat per adegan di kartu, lalu diskusikan: adegan mana yang bisa dipotong tanpa merusak cerita? Pendapat pembaca pertama sering menyakitkan, tetapi ia melihat naskahmu seperti penonton kelak melihat filmmu. Revisi yang baik bukan membuat naskahmu sempurna, melainkan membuat naskahmu jujur: setiap adegan punya alasan untuk ada.

Contoh:
Cetak naskah film pendekmu dan buat kartu adegan: satu kalimat per adegan di kartu kecil. Susun kartu itu di meja, lalu cari dua hal: satu adegan yang fungsinya sama dengan adegan lain (potong atau gabung), dan satu tempat di mana ketegangan turun padahal seharusnya naik (tulis ulang atau pindahkan adegan). Tulis hasil revisimu dalam tiga kalimat: adegan apa yang dipotong, adegan apa yang diubah, dan kenapa.

Ringkasan:
Revisi adalah menulis ulang dengan mata segar: potong adegan yang tidak memajukan cerita atau mengubah tokoh, walau dialognya bagus. Metode kartu adegan membuat struktur terlihat, tidur semalam membuatmu membaca dengan jujur, dan checklist delapan pertanyaan memastikan naskahmu siap. Draf pertama yang jelek bukan kegagalan, melainkan bahan baku revisi.$$)
on conflict (id) do nothing;

-- ============================================================
-- SINEVERSE Academy — Stage 1 seed
-- Course 3 "Pembuatan Storyboard" dan Course 4 "Penyutradaraan"
-- Sumber materi: Modul 09 Pembuatan Storyboard dan Modul 03 Penyutradaraan
-- Setiap lesson berisi: Tujuan, Penjelasan, Contoh, Ringkasan.
-- Idempotent: insert dilewati bila id sudah ada.
-- ============================================================

-- ==================== COURSE 3: PEMBUATAN STORYBOARD ====================

insert into public.modules (id, course_id, title, order_index) values
('21000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'Section 1 — Minggu 1', 1)
on conflict (id) do nothing;

insert into public.modules (id, course_id, title, order_index) values
('22000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'Section 2 — Minggu 2', 2)
on conflict (id) do nothing;

-- Course 3, Lesson 1: Pengertian dan fungsi storyboard
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000301', '21000000-0000-4000-8000-000000000003', 'Pengertian dan fungsi storyboard', 1, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu dapat menjelaskan apa itu storyboard dan menyebutkan fungsinya bagi sutradara, sinematografer, dan editor dalam tahap pra-produksi.

Penjelasan:
Storyboard adalah rangkaian gambar sederhana yang disusun berurutan untuk memvisualisasikan film shot demi shot sebelum film itu dibuat. Satu panel mewakili satu shot: sebuah gambar di dalam kotak dengan rasio aspek hasil akhir, yaitu 16:9 untuk layar biasa, 2.39:1 untuk sinema lebar, atau 9:16 untuk video vertikal, ditambah catatan tentang apa yang terjadi, apa yang terdengar, dan berapa lama shot itu tampil di layar.

Bentuk storyboard yang kita kenal sekarang lahir dari dunia animasi. Pada awal 1930-an, animator Walt Disney bernama Webb Smith menggambar adegan pada lembaran kertas terpisah lalu menempelkannya berurutan di papan pengumuman, sehingga seluruh cerita bisa dilihat sekaligus. Storyboard lengkap pertama dibuat untuk film pendek Three Little Pigs (1933), dan pada 1937-1938 semua studio animasi Amerika sudah memakainya. Film live action pertama yang dirancang menyeluruh dengan storyboard adalah Gone with the Wind (1939), yang setiap shot-nya dirancang oleh perancang produksi William Cameron Menzies.

Storyboard dibuat oleh storyboard artist yang bekerja bersama sutradara berdasarkan skenario, lalu dipakai banyak orang. Sutradara memakainya untuk menguji apakah ceritanya mengalir sebelum uang produksi dikeluarkan. Sinematografer dan kru kamera melihat dari mana kamera ditempatkan dan bagaimana ia bergerak di setiap shot. Editor memakainya sebagai peta awal tentang urutan shot, durasi, dan transisi. Skenario bisa dibaca sepuluh orang dengan sepuluh bayangan berbeda, tetapi storyboard menyatukan bayangan itu menjadi satu gambar yang sama untuk semua orang.

Aturan emasnya: storyboard adalah tempat termurah untuk memecahkan masalah visual. Menggeser satu shot di kertas hanya butuh penghapus, sedangkan menggesernya di hari syuting menghabiskan jam kerja seluruh kru. Di animasi, biayanya bisa berhari-hari kerja ulang. Karena itu storyboard dibuat sebelum syuting, bukan sesudahnya.

Contoh:
Contoh paling terkenal datang dari Alfred Hitchcock. Untuk adegan mandi dalam film Psycho (1960), ia meminta desainer grafis Saul Bass membuat storyboard sebanyak 48 panel yang merencanakan setiap potongan gambar: siluet penyerang, close-up pisau, tirai yang ditarik, sampai match cut dari lubang saluran air ke mata Marion Crane yang mati. Adegan berdurasi kurang dari satu menit itu dibangun dari lebih dari 70 shot, dan hampir semuanya sudah direncanakan di atas kertas sebelum syuting dimulai. Latihan kecil: pilih satu adegan dari film favoritmu yang berdurasi sekitar 30 detik, lalu tuliskan dalam satu kalimat apa yang terjadi di setiap potongan gambar yang kamu ingat. Itulah cara berpikir storyboard.

Ringkasan:
Storyboard adalah film yang sudah bisa ditonton di atas kertas, jauh sebelum kamera menyala. Ia menyatukan bayangan seluruh kru menjadi satu gambar yang sama, dan menjadi tempat termurah untuk memperbaiki masalah visual. Storyboard bukan ujian menggambar: panel yang bagus adalah panel yang paling jelas dibaca orang lain.$$)
on conflict (id) do nothing;

-- Course 3, Lesson 2: Membaca skenario menjadi adegan
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000302', '21000000-0000-4000-8000-000000000003', 'Membaca skenario menjadi adegan', 2, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu dapat membaca sebuah skenario, menandai batas adegan dan beat di dalamnya, lalu mengubahnya menjadi rencana gambar shot demi shot.

Penjelasan:
Jangan mulai menggambar sebelum skenariomu selesai. Storyboard dari skenario yang masih berubah berarti menggambar ulang. Baca skenariomu dua kali: pertama untuk ceritanya, kedua dengan pensil di tangan. Pada bacaan kedua, tandai setiap perubahan lokasi atau waktu, karena itulah batas adegan. Adegan baru dimulai setiap kali tokoh berpindah tempat atau waktu berganti, misalnya dari ruang kelas pagi hari ke gerbang sekolah siang hari.

Lalu tandai beat, yaitu momen ketika sesuatu berubah: tokoh masuk, tatapan berubah, atau keputusan diambil. Setiap beat biasanya butuh minimal satu shot, karena beat adalah alasan kamera berpindah atau mendekat. Kalau kamu tidak menemukan beat dalam sebuah adegan, kemungkinan adegan itu memang datar dan perlu dipikirkan ulang isinya.

Pisahkan juga apa yang terlihat dari apa yang terdengar. Skenario menulis keduanya bercampur, tetapi storyboard memisahnya: gambar di panel, suara di catatan bawah. Dialog yang panjang belum tentu butuh banyak shot. Satu close-up yang menahan reaksi tokoh bisa lebih kuat daripada lima potongan gambar. Sebaliknya, aksi tanpa dialog, seperti tokoh melipat kertas ujian pelan-pelan, justru sering butuh beberapa shot untuk menunjukkan setiap langkahnya.

Membaca skenario sebagai storyboard artist berarti membaca dengan mata kamera. Setiap baris skenario kamu tanyakan: apa yang dilihat penonton di sini, dari mana kamera melihatnya, dan berapa lama gambar itu bertahan? Jawaban dari tiga pertanyaan itulah yang nanti menjadi panel-panel storyboardmu.

Contoh:
Ambil adegan pendek ini: INT. RUANG KELAS - PAGI. Dina (16) duduk di bangku paling belakang, menatap kertas ujian di tangannya. Teman-temannya sudah keluar kelas. Dina melipat kertas itu pelan-pelan, memasukkannya ke tas, lalu berdiri. Di ambang pintu ia berhenti, menoleh ke papan tulis yang masih penuh rumus, dan tersenyum kecil. Bacalah dua kali, lalu tandai beat-nya: pertama, Dina menatap kertas ujian; kedua, ia melipat kertas dan memasukkannya ke tas; ketiga, ia berhenti di pintu dan menoleh ke papan tulis; keempat, ia tersenyum kecil. Empat beat ini menjadi dasar empat shot atau lebih. Coba kerjakan dengan satu adegan dari skenariomu sendiri di Course 2.

Ringkasan:
Membaca skenario menjadi adegan berarti membaca dua kali: sekali untuk cerita, sekali dengan pensil untuk menandai batas adegan dan beat. Pisahkan apa yang terlihat dari apa yang terdengar, dan tanyakan pada setiap baris apa yang dilihat kamera. Dari sinilah storyboard yang setia pada naskah lahir.$$)
on conflict (id) do nothing;

-- Course 3, Lesson 3: Menentukan shot dan angle
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000303', '21000000-0000-4000-8000-000000000003', 'Menentukan shot dan angle', 3, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu dapat memilih shot size dan angle kamera yang tepat untuk setiap shot, serta menjelaskan efeknya terhadap emosi penonton.

Penjelasan:
Shot size menjelaskan seberapa banyak subjek mengisi frame, diukur dari tubuh manusia. Tangga shot size yang kamu kenal dari Course 1 adalah: ELS (extreme long shot) yang menunjukkan lingkungan luas, LS (long shot) yang menunjukkan seluruh tubuh tokoh beserta sekitarnya, FS (full shot) yang menampilkan tubuh penuh, MS (medium shot) yang memotong dari pinggang ke atas, CU (close-up) yang menampilkan wajah, dan ECU (extreme close-up) yang hanya menunjukkan detail kecil seperti mata atau jarum jam. Di storyboard, shot size tidak ditulis panjang-lebar, melainkan digambar: seberapa besar oval kepala dan seberapa banyak tubuh yang masuk ke dalam kotak panel.

Angle adalah tinggi kamera terhadap subjek. Eye level berarti kamera sejajar mata tokoh dan terasa netral. Low angle berarti kamera rendah dan memandang ke atas, sehingga tokoh terasa berkuasa atau mengancam. High angle berarti kamera tinggi dan memandang ke bawah, sehingga tokoh terasa kecil atau tak berdaya. Garis horizon selalu sejajar tinggi kamera: melewati mata tokoh berarti eye level, berada di lutut berarti kamera rendah, dan berada di atas kepala berarti kamera tinggi.

Variasikan shot size di dalam satu adegan. Buka dengan shot lebar supaya penonton tahu di mana mereka berada, masuk ke medium saat dialog berjalan, dan simpan close-up untuk momen emosi memuncak. Makin dekat kamera, makin besar emosi yang terasa. Adegan yang seluruhnya medium shot dari eye level terasa datar seperti rekaman CCTV, karena tidak ada perubahan jarak dan sudut yang menuntun perasaan penonton.

Pilihan shot dan angle harus punya alasan cerita, bukan sekadar variasi. Close-up dipakai saat reaksi tokoh lebih penting daripada tempatnya berada. Shot lebar dipakai saat lokasi atau jarak antar tokoh adalah informasi utama. Tanyakan pada setiap shot: apa yang harus dirasakan penonton di sini, dan jarak serta sudut apa yang paling jujur menyampaikan perasaan itu?

Contoh:
Lihat adegan "Rani Terlambat" di depan gerbang sekolah. Shot 1 memakai ELS eye level: gerbang sekolah pagi hari, jalan sepi, durasi 3 detik, supaya penonton tahu tempatnya. Shot 4 memakai CU eye level: Rani menatap jam dengan napas terengah, durasi 3 detik, karena yang penting adalah kepanikannya. Shot 5 memakai ECU: jarum jam menunjukkan pukul 07.01, durasi 2 detik, karena detail kecil itulah sumber masalahnya. Shot 6 memakai MS low angle dengan tilt naik: Rani menengadah ke gerbang, durasi 3 detik, supaya gerbang terasa besar dan mengintimidasi. Satu adegan, empat jarak berbeda, masing-masing dengan alasan. Sekarang coba: ambil satu adegan dari skenariomu dan tentukan shot size serta angle untuk lima shot pertamanya, lengkap dengan alasanmu.

Ringkasan:
Shot size mengatur seberapa dekat kamera dengan tokoh, dari ELS sampai ECU, sedangkan angle mengatur dari ketinggian mana kamera memandang. Variasikan keduanya di dalam satu adegan: buka lebar, masuk ke medium untuk dialog, dan simpan close-up untuk puncak emosi. Setiap pilihan shot dan angle harus punya alasan cerita.$$)
on conflict (id) do nothing;

-- Course 3, Lesson 4: Menggambar panel storyboard
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000304', '21000000-0000-4000-8000-000000000003', 'Menggambar panel storyboard', 4, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu dapat menggambar satu panel storyboard yang lengkap dengan delapan elemen standarnya, sehingga orang lain bisa memahami shot itu tanpa penjelasan lisan.

Penjelasan:
Setiap panel memuat gambar dan catatan. Ada delapan elemen standar sebuah panel, dan kalau ada yang kosong, panel itu belum selesai. Pertama, nomor shot: nomor adegan ditambah nomor shot di dalamnya, misalnya Adegan 2, Shot 3. Kedua, gambar: sketsa frame dalam rasio aspek hasil akhir. Ketiga, shot size: seberapa besar subjek mengisi frame, misalnya MS atau CU. Keempat, angle: tinggi kamera terhadap subjek, misalnya eye level atau low angle. Kelima, gerakan kamera: apa yang dilakukan kamera selama shot, misalnya pan kanan atau statis. Keenam, aksi: satu kalimat kini tentang apa yang terjadi, misalnya Rani berlari ke gerbang. Ketujuh, dialog atau suara: kata yang diucapkan atau suara kunci, misalnya "Aku terlambat!". Kedelapan, durasi dan transisi: lama shot ditambah sambungan ke shot berikut, misalnya 4 detik, CUT ke Shot 4.

Gambar boleh kasar. Yang wajib jelas adalah komposisi: di mana tokoh berdiri, ke mana ia memandang, dan di mana garis horizon berada. Kepala digambar sebagai oval, dan ukuran oval itu menentukan shot size. Tubuh cukup digariskan, meja cukup berupa persegi panjang, mobil cukup berupa kotak dengan dua lingkaran. Tidak ada yang menilai keindahan gambarmu; yang dinilai adalah apakah orang lain bisa membaca apa yang dilihat kamera.

Sebelum menggambar panel final, buatlah thumbnail: sketsa sekecil kartu nama, 4 sampai 6 frame per halaman, untuk menguji komposisi dengan cepat. Gambar dalam 30 detik per frame; kalau komposisinya tidak terbaca dalam 30 detik, ia tidak akan terbaca dalam ukuran besar. Coba dua atau tiga versi untuk shot yang sama, lalu pilih satu. Mulailah dengan garis horizon, karena garis itu menentukan tinggi kamera dan perspektif sebelum apa pun digambar.

Terakhir, beri label pada yang tidak jelas. Panah di dalam gambar menandai gerakan tokoh atau benda, sedangkan panah di tepi atau di luar gambar menandai gerakan kamera. Kalau ada yang hanya kamu yang paham, tulis. Storyboard dibaca orang lain, bukan disimpan sendiri.

Contoh:
Gambar satu panel untuk shot ini: Adegan 2, Shot 3, MS Rani di depan gerbang, eye level, pan kanan mengikuti langkahnya, aksi "Rani berlari kecil ke gerbang", dialog "Aku terlambat!", durasi 4 detik, CUT ke Shot 4. Kotaknya 16:9. Rani digambar sebagai oval kepala dan garis tubuh di tengah frame, gerbang sebagai persegi panjang di belakangnya, garis horizon setinggi matanya, dan panah horizontal di tepi bawah kotak menandai pan kanan. Di bawah gambar, tuliskan delapan elemennya satu per satu. Sekarang bandingkan dengan temanmu: bisakah ia menceritakan kembali shot itu hanya dari panelmu, tanpa kamu menjelaskan apa pun? Kalau belum, cari elemen mana yang hilang.

Ringkasan:
Satu panel storyboard yang lengkap memuat delapan elemen: nomor shot, gambar, shot size, angle, gerakan kamera, aksi, dialog atau suara, serta durasi dan transisi. Gambar boleh kasar, asal komposisinya jelas. Ujilah komposisi dengan thumbnail cepat sebelum menggambar panel final, dan beri label pada apa pun yang tidak jelas, karena storyboard dibaca orang lain.$$)
on conflict (id) do nothing;

-- Course 3, Lesson 5: Komposisi dan pergerakan
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000305', '21000000-0000-4000-8000-000000000003', 'Komposisi dan pergerakan', 5, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu dapat menyusun komposisi panel yang jelas dan menggambarkan pergerakan tokoh maupun kamera dengan simbol panah yang benar.

Penjelasan:
Komposisi adalah susunan segala sesuatu di dalam frame: di mana tokoh berdiri, ke mana ia memandang, dan di mana garis horizon berada. Tiga hal ini adalah fondasi setiap panel. Garis horizon selalu digambar pertama, karena ia menentukan tinggi kamera dan perspektif seluruh gambar. Tokoh yang menatap ke arah luar frame membuat penonton penasaran dengan apa yang ia lihat, sedangkan tokoh yang menatap langsung ke arah kamera menciptakan konfrontasi. Di mana kamu menaruh tokoh di dalam kotak, dan ke mana ia memandang, adalah keputusan cerita, bukan sekadar hiasan.

Pergerakan adalah masalah storyboard yang paling unik: storyboard adalah gambar diam yang harus menjelaskan gambar bergerak. Paradoks itu dipecahkan dengan satu bahasa, yaitu panah. Setiap panah harus menjawab empat pertanyaan: apa yang bergerak, ke arah mana, sejauh apa, dan kapan terjadinya. Dua aturan penempatan berlaku hampir di semua studio: panah kamera diletakkan di tepi atau di luar frame, sedangkan panah tokoh atau benda diletakkan di dalam frame, menempel pada yang bergerak.

Gerakan kamera yang paling sering dipakai ada enam. Pan berarti kamera berputar kiri-kanan di tempat, ditandai panah horizontal dan label PAN L atau R, dipakai untuk mengungkap atau mengikuti tokoh. Tilt berarti kamera menengadah atau menunduk di tempat, ditandai panah vertikal dan label TILT U atau D, dipakai untuk menunjukkan tinggi. Dolly atau push-in berarti kamera maju mendekat, ditandai panah sudut ke dalam, dipakai untuk mendekati emosi tokoh. Truck atau tracking berarti kamera bergeser menyamping, ditandai panah lateral di tepi bawah, dipakai untuk menemani perjalanan tokoh. Crane berarti kamera naik atau turun di lengan crane, ditandai panah melengkung dan label CRANE UP atau DOWN, dipakai untuk membuka skala. Zoom berarti lensa berubah sementara kamera diam, ditandai panah empat sudut dan label Z.

Ingat perbedaan yang paling sering tertukar: dolly-in menggerakkan kameranya sehingga ruang ikut berubah dan latar bergeser, sedangkan zoom hanya mengubah lensa sehingga gambar membesar tanpa perpindahan ruang. Karena itu zoom terasa artifisial dan jarang dipakai di film cerita. Kalau mau mendekat, lebih baik dolly.

Contoh:
Gambar thumbnail untuk shot ini: seorang siswa berjalan dari kiri ke kanan melewati koridor, sementara kamera melakukan tracking menyamping mengikutinya. Di dalam frame, gambar siswa sebagai garis dan oval, dengan panah horizontal kecil menempel di tubuhnya ke arah kanan. Di tepi bawah frame, gambar panah lateral panjang dengan label TRUCK R. Sekarang gambar versi keduanya: siswa yang sama berhenti, lalu kamera push-in ke wajahnya. Panah tokoh hilang karena ia diam, dan panah sudut ke dalam muncul di keempat sudut frame. Bandingkan kedua thumbnail itu: tanpa satu kata pun, orang lain harus bisa membedakan shot mana yang kameranya bergerak menyamping dan shot mana yang kameranya mendekat.

Ringkasan:
Komposisi dimulai dari garis horizon, posisi tokoh, dan arah pandangnya, karena ketiganya menentukan apa yang dirasakan penonton. Pergerakan dijelaskan dengan panah: panah di dalam frame untuk tokoh atau benda, panah di tepi frame untuk kamera. Kenali enam gerakan kamera dan bedakan dolly dengan zoom, karena keduanya menghasilkan gambar yang terasa sangat berbeda.$$)
on conflict (id) do nothing;

-- Course 3, Lesson 6: Camera direction dan continuity
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000301', '22000000-0000-4000-8000-000000000003', 'Camera direction dan continuity', 1, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu dapat menulis camera direction pada storyboard dan menjaga continuity antar shot supaya adegan tidak terasa patah.

Penjelasan:
Camera direction adalah instruksi tertulis di panel tentang apa yang dilakukan kamera selama shot berlangsung: statis, pan kiri, tilt naik, dolly-in, truck kanan, crane up, atau zoom. Instruksi ini selalu dipasangkan dengan simbol panah, karena panah menunjukkan arahnya dan kata menunjukkan jenisnya. Tanpa label, panah horizontal bisa berarti pan, truck, atau tokoh yang berjalan. Tuliskan keduanya: panah di tepi frame dan label seperti PAN R, TILT U, atau DOLLY IN di sampingnya.

Continuity adalah kesesuaian antar shot: apa yang tersambung di shot 3 harus tetap tersambung di shot 4. Ada dua continuity yang paling sering dilanggar pemula. Pertama, screen direction: arah gerak tokoh harus konsisten. Tokoh yang keluar frame ke kanan harus masuk lagi dari kiri di shot berikutnya, dan tetap berjalan ke kanan. Kalau ia tiba-tiba berjalan ke kiri, penonton merasa ia berbalik arah padahal tidak. Kedua, kesinambungan benda dan posisi: gelas yang dipegang tangan kanan di satu shot tidak boleh tiba-tiba berada di tangan kiri di shot berikutnya, dan tokoh yang berdiri di sisi kiri frame tidak boleh berpindah ke sisi kanan tanpa alasan.

Transisi antar shot adalah bagian dari continuity, dan ia ditulis di antara dua panel dengan kata yang sama setiap kali: CUT, DISSOLVE, FADE IN, FADE OUT, atau WIPE. Transisi bukan hiasan, ia kalimat tentang waktu. Cut berarti sekarang, satu gambar langsung berganti, dan ini adalah default: kalau tidak ada alasan memakai transisi lain, tulis CUT atau tidak usah menulis apa-apa, karena editor menganggap setiap sambungan adalah cut. Dissolve berarti waktu berlalu, tempat berubah, atau kenangan muncul, ditandai garis silang di antara panel. Fade in dan fade out berarti gambar muncul dari atau menghilang ke hitam, ditandai simbol lebih kecil dari dan lebih besar dari, dipakai untuk membuka atau menutup adegan, babak, atau film. Wipe berarti shot baru mendorong shot lama keluar, dipakai untuk gaya lama atau komik.

Dua catatan praktis. Pertama, dissolve atau wipe yang dipakai di setiap sambungan kehilangan maknanya, sama seperti tanda seru di setiap kalimat. Kedua, jaga agar camera direction dan transisi selalu punya alasan cerita: gerakan kamera mengikuti emosi atau aksi tokoh, dan transisi menandai perubahan waktu atau babak, bukan sekadar variasi.

Contoh:
Periksa urutan tiga panel ini. Panel 1: Rani berlari ke kanan, keluar frame ke kanan, pan kanan mengikuti. Panel 2: Rani masuk dari kiri frame, tetap berlari ke kanan menuju gerbang. Panel 3: close-up Rani menatap jam, lalu DISSOLVE ke panel 4, yaitu gerbang sekolah yang sama tetapi langit sudah lebih gelap. Apa yang benar di sini? Screen direction terjaga dari panel 1 ke panel 2, dan dissolve di panel 3 menandai waktu berlalu dengan jujur. Sekarang bayangkan panel 2 diganti: Rani masuk dari kanan dan berlari ke kiri. Adegan langsung terasa patah, seolah ia berbalik pulang. Latihan: ambil storyboard 6 panelmu dari minggu lalu dan periksa setiap sambungan: apakah arah gerak tokoh konsisten, dan apakah setiap transisi selain cut punya alasan waktu atau babak?

Ringkasan:
Camera direction ditulis sebagai panah plus label, supaya jenis dan arah gerakan kamera tidak bisa ditebak-tebak. Continuity dijaga lewat screen direction yang konsisten dan kesinambungan benda serta posisi antar shot. Transisi adalah kalimat tentang waktu: cut untuk sekarang, dissolve untuk waktu berlalu, fade untuk membuka atau menutup babak, dan setiap transisi selain cut harus punya alasan.$$)
on conflict (id) do nothing;

-- Course 3, Lesson 7: Shot list dan shooting breakdown
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000302', '22000000-0000-4000-8000-000000000003', 'Shot list dan shooting breakdown', 2, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu dapat menyusun shot list yang lengkap dan mengubahnya menjadi shooting breakdown, yaitu rencana kerja syuting yang dikelompokkan secara efisien.

Penjelasan:
Shot list adalah daftar semua shot yang akan diambil, ditulis sebelum satu panel pun digambar. Satu baris berisi nomor adegan dan shot, ukuran shot, sudut kamera, gerakan kamera, durasi perkiraan, dan isi atau dialognya. Untuk film pendek sekolah, 8 sampai 12 baris sudah cukup. Shot list memaksamu memutuskan framing sebelum menggambar, sehingga panelmu tidak asal jadi. Ia juga menjadi bahasa bersama kru: semua orang membaca daftar yang sama tentang apa yang harus diambil.

Penomoran yang tahan revisi memakai nomor adegan lalu nomor shot di dalamnya, misalnya 2-1, 2-2, dan 2-3. Kalau shot baru disisipkan belakangan, beri huruf, misalnya 2-3A, supaya tidak perlu menomori ulang seluruh film. Nomor yang sama dipakai di shot list, storyboard, dan di lokasi pada slate kamera, sehingga tidak ada yang kebingungan mencari shot yang dimaksud.

Durasi di shot list bukan hiasan. Jumlahkan durasi keenam shot dalam satu adegan, dan totalnya harus mendekati durasi adegan di layar. Adegan 1 menit dengan shot berdurasi 3 sampai 5 detik biasanya membutuhkan 12 sampai 20 panel. Kalau jumlah durasimu jauh dari target, kamu langsung tahu ada yang salah: entah adeganmu terlalu padat, atau shot-shotmu terlalu lama dan akan membosankan.

Shooting breakdown adalah langkah berikutnya: shot list diubah menjadi rencana kerja syuting. Shot-shot dikelompokkan bukan berdasarkan urutan cerita, melainkan berdasarkan apa yang efisien di lokasi: semua shot di lokasi yang sama diambil berbarengan, semua shot dengan pencahayaan yang sama diambil berbarengan, dan semua shot dengan aktor yang sama diambil berbarengan. Misalnya, semua shot di gerbang sekolah diambil dalam satu sesi pagi, meskipun di cerita mereka tersebar di tiga adegan berbeda. Breakdown juga mencatat kebutuhan setiap shot: aktor, properti, kostum, dan peralatan, sehingga tidak ada yang tertinggal di hari syuting.

Contoh:
Ini shot list untuk adegan pendek "Rani Terlambat", adegan 2, pagi hari di depan gerbang sekolah. Shot 2-1: ELS, eye level, statis, gerbang sekolah pagi hari dan jalan sepi, 3 detik. Shot 2-2: LS, eye level, pan kanan, Rani muncul dari ujung jalan, 4 detik. Shot 2-3: MS, eye level, pan kanan, Rani berlari kecil ke gerbang sambil berkata "Aku terlambat!", 4 detik. Shot 2-4: CU, eye level, statis, Rani menatap jam dengan napas terengah, 3 detik. Shot 2-5: ECU, eye level, statis, jarum jam menunjukkan pukul 07.01, 2 detik. Shot 2-6: MS, low angle, tilt naik, Rani menengadah ke gerbang, 3 detik. Totalnya 19 detik. Sekarang buat shooting breakdown-nya: shot 2-1, 2-2, 2-3, dan 2-6 memakai lokasi dan pencahayaan pagi yang sama, jadi diambil dalam satu sesi; shot 2-4 dan 2-5 adalah close-up yang bisa diambil setelahnya dengan kamera yang sama. Tuliskan breakdown untuk satu adegan dari skenariomu dengan cara yang sama.

Ringkasan:
Shot list adalah daftar shot yang ditulis sebelum menggambar, berisi nomor, ukuran, sudut, gerakan, durasi, dan isi setiap shot. Penomoran memakai format adegan-shot, misalnya 2-1, dan shot sisipan memakai huruf, misalnya 2-3A. Shooting breakdown mengelompokkan shot-shot itu berdasarkan lokasi, cahaya, dan aktor yang sama, supaya hari syuting berjalan efisien dan tidak ada kebutuhan yang tertinggal.$$)
on conflict (id) do nothing;

-- Course 3, Lesson 8: Storyboard digital
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000303', '22000000-0000-4000-8000-000000000003', 'Storyboard digital', 3, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu dapat menjelaskan kelebihan storyboard digital, memilih aplikasi yang sesuai untuk film pendek sekolah, dan memindahkan panel kertasmu ke format digital.

Penjelasan:
Storyboard digital adalah storyboard yang dibuat dan disusun di aplikasi, bukan di atas kertas. Isinya sama persis dengan storyboard kertas: satu panel mewakili satu shot, lengkap dengan nomor, aksi, dialog, gerakan kamera, durasi, dan transisi. Yang berubah adalah cara membuatnya dan cara mengubahnya. Di kertas, memperbaiki satu panel berarti menghapus dan menggambar ulang. Di aplikasi, panel bisa digeser, diduplikasi, diperbesar, dan diberi warna tanpa menggambar ulang dari nol.

Ada beberapa jenis aplikasi yang bisa kamu pakai. Aplikasi khusus storyboard, seperti Storyboarder yang gratis, menyediakan template panel, alat gambar sederhana, dan ekspor langsung ke animatic. Aplikasi gambar umum, seperti Procreate atau MediBang, memberi kebebasan menggambar lebih detail, tetapi kamu harus mengatur sendiri tata letak panel dan catatannya. Aplikasi presentasi dan desain, seperti Canva, cocok untuk menyusun panel yang sudah digambar menjadi lembar storyboard yang rapi dan mudah dibagikan ke kru. Pilihlah berdasarkan kebutuhanmu: kalau kamu butuh cepat dan rapi, pakai aplikasi khusus storyboard; kalau kamu suka menggambar detail, pakai aplikasi gambar.

Kelebihan terbesar storyboard digital ada tiga. Pertama, revisi yang murah: sutradara meminta satu shot diubah, kamu tinggal menggeser atau menggambar ulang satu panel, bukan seluruh halaman. Kedua, berbagi yang instan: file storyboard bisa dikirim ke seluruh kru lewat ponsel, dan semua orang membaca versi terbaru yang sama. Ketiga, jalan langsung ke animatic: panel digital bisa diimpor ke CapCut atau DaVinci Resolve, diatur durasinya sesuai catatan panel, lalu ditambah suara sementara, sehingga storyboardmu bisa diputar dan diuji ritmenya.

Namun ada hal yang tidak berubah. Aplikasi tidak menggantikan keputusan cerita: shot size, angle, dan urutan shot tetap harus kamu tentukan sendiri. Panel digital yang bagus tetap mengikuti delapan elemen standar, tetap memakai simbol panah yang sama, dan tetap digambar dalam rasio aspek hasil akhir. Dan ada satu kebiasaan baik yang patut dipertahankan: sebelum menggambar panel final di aplikasi, buatlah thumbnail cepat di kertas, karena menguji komposisi dalam 30 detik per frame tetap lebih cepat di kertas daripada di layar.

Contoh:
Coba alur kerja ini dengan storyboard 6 panelmu dari minggu lalu. Pertama, foto keenam panel kertasmu dengan ponsel. Kedua, buka aplikasi Storyboarder atau Canva, buat proyek baru dengan rasio 16:9, dan susun keenam foto itu berurutan dalam satu halaman. Ketiga, tambahkan teks di bawah setiap panel: nomor shot, aksi, dialog, durasi, dan transisi. Keempat, kirim file itu ke satu teman dan minta ia menceritakan kembali adeganmu hanya dari file tersebut. Kalau ia bisa, storyboard digitalmu sudah bekerja. Kalau ada panel yang membingungkan, perbaiki panel itu di aplikasi: geser posisinya, perbesar gambarnya, atau tambahkan label panah, lalu kirim ulang. Bandingkan waktu yang kamu butuhkan dengan waktu memperbaiki panel yang sama di kertas.

Ringkasan:
Storyboard digital memakai isi dan aturan yang sama dengan storyboard kertas, tetapi revisi, berbagi, dan pembuatan animatic menjadi jauh lebih cepat. Pilih aplikasi sesuai kebutuhanmu, dari Storyboarder yang gratis sampai Canva untuk penyusunan yang rapi. Yang tidak berubah adalah keputusan ceritanya: shot size, angle, dan urutan shot tetap ditentukan olehmu, dan thumbnail cepat di kertas tetap cara tercepat menguji komposisi.

[Perlu ditinjau mentor]$$)
on conflict (id) do nothing;

-- Course 3, Lesson 9: Praktik storyboard berdasarkan skenario
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000304', '22000000-0000-4000-8000-000000000003', 'Praktik storyboard berdasarkan skenario', 4, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu dapat membuat storyboard lengkap 6 panel dari satu adegan skenario, dengan shot list, durasi, dan transisi yang benar.

Penjelasan:
Sekarang semua potongan sudah kamu kuasai: membaca skenario, menentukan shot dan angle, menggambar panel, mengatur komposisi dan pergerakan, serta menjaga continuity. Lesson ini adalah tempat semuanya digabungkan dalam satu praktik utuh, memakai adegan dari skenariomu sendiri di Course 2.

Langkah pertama adalah membaca adegan pilihanmu dua kali dan menandai beat-nya, seperti di lesson 2. Pilih adegan berdurasi sekitar 20 sampai 30 detik di layar, karena itu cukup untuk 6 panel. Adegan yang terlalu panjang akan membuatmu menggambar terlalu banyak panel, sedangkan adegan yang terlalu pendek tidak memberi ruang untuk variasi shot.

Langkah kedua adalah membuat shot list 6 baris. Satu baris berisi nomor adegan dan shot, ukuran shot, sudut kamera, gerakan kamera, durasi perkiraan, dan isi atau dialognya. Pastikan ada variasi: buka dengan shot lebar supaya penonton tahu tempatnya, masuk ke medium saat dialog atau aksi berjalan, dan simpan close-up untuk momen emosi memuncak. Pastikan juga ada minimal satu gerakan kamera, karena adegan yang seluruhnya statis terasa kaku.

Langkah ketiga adalah menggambar 6 panel, satu shot per panel. Jangan menggambar dua shot dalam satu kotak, karena satu panel mewakili satu shot. Setiap panel memuat delapan elemen: nomor shot, gambar, shot size, angle, gerakan kamera, aksi, dialog atau suara, serta durasi dan transisi. Gambar boleh kasar, asal komposisinya jelas: garis horizon dulu, kepala sebagai oval, panah di dalam frame untuk tokoh dan panah di tepi frame untuk kamera.

Langkah keempat adalah memeriksa hasilmu sebelum menganggapnya selesai. Tulis durasi tiap panel, lalu jumlahkan: totalnya harus 20 sampai 30 detik. Periksa screen direction: tokoh yang keluar frame ke kanan harus masuk lagi dari kiri. Periksa nomornya: berurutan tanpa lompat, dan shot sisipan memakai huruf. Terakhir, berikan storyboardmu kepada teman dan minta ia menceritakan adegan itu hanya dari panel-panelmu. Kalau ia bisa, storyboardmu sudah bekerja.

Contoh:
Pakai adegan pendek berikut. ADEGAN 3, INT. RUANG KELAS, PAGI. Dina (16) duduk di bangku paling belakang, menatap kertas ujian di tangannya. Teman-temannya sudah keluar kelas. Dina melipat kertas itu pelan-pelan, memasukkannya ke tas, lalu berdiri. Di ambang pintu ia berhenti, menoleh ke papan tulis yang masih penuh rumus, dan tersenyum kecil. Buat shot list 6 baris, lalu gambar 6 panel. Misalnya: shot 1 LS ruang kelas yang sudah kosong kecuali Dina di bangku belakang, 4 detik; shot 2 CU Dina menatap kertas ujian, 4 detik; shot 3 MS Dina melipat kertas pelan-pelan, 4 detik; shot 4 MS Dina berdiri dan berjalan ke pintu, truck mengikuti, 5 detik; shot 5 CU Dina menoleh ke papan tulis, 3 detik; shot 6 CU Dina tersenyum kecil, lalu FADE OUT, 4 detik. Totalnya 24 detik. Perhatikan: close-up disimpan untuk emosi, dan fade out menutup adegan. Sekarang kerjakan dengan adeganmu sendiri dan simpan hasilnya dalam folder Storyboard_Nama.

Ringkasan:
Praktik storyboard mengikuti empat langkah: tandai beat dalam adegan, buat shot list 6 baris dengan variasi shot dan satu gerakan kamera, gambar 6 panel lengkap dengan delapan elemen, lalu periksa durasi, screen direction, dan kejelasan gambar. Satu panel selalu mewakili satu shot, dan total durasi harus sesuai dengan durasi adegan di layar. Storyboard ini akan kamu bawa ke Course 4 sebagai panduan shot saat menyutradarai.$$)
on conflict (id) do nothing;

-- Course 3, Lesson 10: Presentasi dan evaluasi
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000305', '22000000-0000-4000-8000-000000000003', 'Presentasi dan evaluasi', 5, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu dapat mempresentasikan storyboardmu kepada orang lain dan menilainya dengan kriteria yang jelas, lalu memperbaiki bagian yang masih lemah.

Penjelasan:
Storyboard yang baik bukan hanya digambar, tetapi juga dipresentasikan. Presentasi berarti kamu menceritakan adeganmu panel demi panel kepada orang lain, tanpa menjelaskan dengan kata-kata apa yang seharusnya sudah jelas dari gambar. Susun panelmu berurutan, satu adegan per halaman, 6 panel per halaman dalam format lanskap, dibaca dari kiri ke kanan, baris atas dulu lalu baris bawah, seperti membaca komik. Setiap halaman diberi kepala: judul produksi, nomor adegan, nomor halaman, dan slugline adegan. Untuk video vertikal, panel dibuat sempit dengan rasio 9:16 dan disusun 4 sampai 5 panel per baris.

Saat presentasi, perhatikan reaksi pendengarmu. Kalau mereka bertanya "ini siapa?" atau "kameranya ke mana?", itu bukan kegagalan, itu informasi: ada panel yang belum jelas. Catat setiap pertanyaan, karena pertanyaan yang sama akan muncul di lokasi syuting dari kru yang membaca storyboardmu. Presentasi yang baik juga memakai animatic: storyboard yang diputar berurutan, tiap panel tampil selama durasinya, ditambah suara sementara berupa dialog yang dibaca seadanya, efek suara, dan musik. Animatic adalah ujian terakhir sebelum syuting, karena di sinilah ketahuan apakah adeganmu terasa terlalu panjang, terlalu cepat, atau membingungkan.

Evaluasi memakai lima kriteria, masing-masing bernilai 1 sampai 3, dengan total maksimal 15. Pertama, kelengkapan panel: semua panel memuat delapan elemen lengkap. Kedua, kejelasan gambar: orang lain bisa menceritakan adegan hanya dari panel. Ketiga, gerakan dan transisi: panah dan transisi memakai simbol standar dan punya alasan. Keempat, animatic: durasi dijumlahkan sesuai durasi adegan. Kelima, keterkaitan: storyboard dibuat dari skenario Course 2 dan siap dipakai di Course 4. Skor 13 sampai 15 berarti siap lanjut ke Course 4. Skor 10 sampai 12 berarti bagus, perbaiki satu kriteria terlemah. Di bawah 10 berarti ulangi satu latihan minggu sebelum lanjut, karena fondasi yang goyah akan terasa di course berikutnya.

Sebelum lanjut ke Course 4, periksa ceklis ini: shot list 8 baris, 6 panel latihan minggu 5, storyboard 8 sampai 12 panel, dan 1 animatic 1 menit, semuanya dalam satu folder bernama Storyboard_Nama. Di Course 4 kamu menyutradarai adegan dari naskahmu sendiri, dan storyboard ini memastikan semua orang di lokasi melihat film yang sama dengan yang kamu bayangkan.

Contoh:
Lakukan evaluasi mandiri untuk storyboard 8 sampai 12 panelmu. Nilai kelima kriteria itu satu per satu dengan jujur. Misalnya, kamu memberi skor 3 untuk kelengkapan panel karena delapan elemen selalu terisi, tetapi skor 1 untuk kejelasan gambar karena dua temanmu tidak bisa menebak siapa tokoh di panel 4. Maka perbaikanmu jelas: bukan menambah panel, melainkan memberi label dan memperjelas posisi tokoh di panel 4. Sekarang presentasikan storyboardmu di depan satu teman: ceritakan adegan itu panel demi panel tanpa penjelasan tambahan, lalu minta ia mengulang ceritanya dengan kata-katanya sendiri. Bandingkan dengan maksud aslimu dan catat satu hal yang harus diperbaiki sebelum kamu membuat animatic.

Ringkasan:
Presentasikan storyboardmu panel demi panel dan perhatikan pertanyaan pendengar, karena itulah cermin kejelasan gambarmu. Uji ritmenya dengan animatic, lalu nilai dengan lima kriteria: kelengkapan panel, kejelasan gambar, gerakan dan transisi, animatic, dan keterkaitan dengan skenario. Skor 13 sampai 15 berarti siap lanjut ke Course 4, dan storyboard ini menjadi panduan shotmu saat menyutradarai.$$)
on conflict (id) do nothing;

-- ==================== COURSE 4: PENYUTRADARAAN ====================

insert into public.modules (id, course_id, title, order_index) values
('21000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'Section 1 — Minggu 1', 1)
on conflict (id) do nothing;

insert into public.modules (id, course_id, title, order_index) values
('22000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'Section 2 — Minggu 2', 2)
on conflict (id) do nothing;

-- Course 4, Lesson 1: Peran dan tanggung jawab sutradara
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000401', '21000000-0000-4000-8000-000000000004', 'Peran dan tanggung jawab sutradara', 1, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu dapat menjelaskan peran dan tanggung jawab sutradara dalam pra-produksi, produksi, dan hubungannya dengan kru serta aktor.

Penjelasan:
Banyak orang mengira sutradara hanya berteriak "Action!" dan "Cut!". Kenyataannya, sebagian besar pekerjaan sutradara terjadi sebelum kamera menyala. Ia membaca naskah berkali-kali, memutuskan apa yang sebenarnya terjadi di setiap adegan, mengatur di mana aktor berdiri dan bergerak, dan memutuskan dari sudut mana kamera melihatnya. Di lokasi, sutradara adalah penjaga cerita: setiap keputusan, mulai dari posisi aktor, pilihan lensa, sampai nada suara pemain, ditimbang terhadap satu pertanyaan, "apakah ini melayani cerita?"

Sutradara bertanggung jawab atas visi keseluruhan film. Ia menerjemahkan kata-kata di skenario menjadi gambar dan suara yang dirasakan penonton. Untuk itu ia bekerja dengan banyak orang: dengan penulis naskah untuk memahami maksud cerita, dengan sinematografer untuk menentukan tampilan gambar, dengan aktor untuk membangun tokoh, dan dengan editor untuk menentukan ritme akhir film. Sutradara tidak melakukan semua pekerjaan itu sendiri, tetapi ia yang memastikan semua pekerjaan itu mengarah ke cerita yang sama.

Ada satu pertanyaan yang dijawab sutradara untuk setiap adegan: bagaimana caranya agar penonton merasakan apa yang harus mereka rasakan? Jawaban itu ia wujudkan lewat keputusan konkret: kapan kamera mendekat, kapan aktor bergerak, kapan adegan dibiarkan hening. Karena itu sutradara harus bisa mengomunikasikan keputusannya dengan jelas. Kru yang tahu rencana akan bekerja cepat, sedangkan kru yang menebak-nebak akan mengulang setup yang sama tiga kali.

Tanggung jawab sutradara juga mencakup suasana kerja di lokasi. Ia melindungi aktor supaya berani mencoba, menjaga jadwal supaya kru tidak kelelahan, dan tetap tenang ketika rencana runtuh. Sutradara yang baik bukan yang rencananya sempurna, melainkan yang tenang ketika rencana itu runtuh, karena syuting tidak pernah berjalan sesuai rencana.

Contoh:
Bayangkan kamu menyutradarai adegan dialog 1 menit dengan dua aktor di sebuah halte. Sebagai sutradara, kamu yang memutuskan: adegan ini tentang Rani yang menunggu kabar lomba pidato sambil berpura-pura tenang. Kamu yang menentukan blockingnya, yaitu Rani duduk di ujung bangku, jauh dari orang lain. Kamu yang menentukan kamera mulai dari medium shot yang statis, lalu mendekat menjadi close-up setelah HP-nya bergetar. Kamu yang memberi arahan kepada aktornya, dan kamu yang memutuskan kapan satu take sudah cukup bagus untuk disimpan. Sinematografer yang menata cahaya dan editor yang memotong gambar bekerja dari keputusan-keputusanmu itu. Latihan: tulis dalam tiga kalimat, apa tanggung jawab sutradara yang paling sulit menurutmu, dan kenapa?

Ringkasan:
Sutradara adalah penjaga cerita yang bekerja paling banyak sebelum kamera menyala: membaca naskah, memutuskan makna setiap adegan, mengatur blocking, dan merencanakan kamera. Di lokasi ia memimpin aktor dan kru dengan keputusan yang jelas, selalu ditimbang dengan pertanyaan apakah keputusan itu melayani cerita. Ia juga bertanggung jawab menjaga suasana kerja dan tetap tenang ketika rencana berubah.$$)
on conflict (id) do nothing;

-- Course 4, Lesson 2: Interpretasi skenario
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000402', '21000000-0000-4000-8000-000000000004', 'Interpretasi skenario', 2, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu dapat menganalisis satu adegan: apa yang diinginkan setiap tokoh, apa yang menghalanginya, di mana titik baliknya, dan apa subtext di balik dialognya.

Penjelasan:
Sebelum mengatur apa pun, sutradara bertanya pada setiap adegan: apa yang diinginkan tokoh A, apa yang diinginkan tokoh B, dan kenapa keduanya tidak bisa mendapatkannya sekaligus? Itulah konflik adegan. Adegan tanpa konflik, misalnya dua orang yang setuju tentang segala hal, hampir selalu membosankan, tidak peduli sebagus apa dialognya. Konflik tidak harus berarti pertengkaran: seorang siswa yang ingin terlihat tenang sementara ia sebenarnya cemas juga sedang berkonflik, dengan dirinya sendiri.

Lalu cari titik balik atau beat adegan: momen ketika kekuasaan berpindah, atau ketika satu tokoh mengetahui sesuatu yang mengubah segalanya. Dalam adegan dialog 1 menit pun biasanya ada satu titik balik. Sutradara menandai titik itu karena di situlah kamera dan aktor harus berubah: shot yang lebih dekat, gerakan baru, atau jeda yang lebih panjang. Kalau kamu tidak tahu di mana titik balik adeganmu, kamu akan menyutradarai semua bagiannya dengan nada yang sama, dan penonton akan tertidur.

Terakhir, tentukan subtext: apa yang tokoh katakan versus apa yang sebenarnya ia maksud. Dialog "Silakan duduk" bisa berarti sambutan hangat, ancaman, atau jebakan, tergantung siapa yang mengatakannya dan apa yang ia inginkan. Blocking dan angle adalah cara sutradara menunjukkan subtext itu tanpa menjelaskannya lewat kata-kata. Tokoh yang berkata "Aku tidak apa-apa" sambil menggenggam HP erat-erat sedang bercerita lewat tubuhnya, bukan lewat kalimatnya.

Interpretasi yang baik lahir dari membaca naskah tiga kali dengan tiga pertanyaan berbeda. Bacaan pertama: apa yang diinginkan tiap tokoh? Bacaan kedua: di mana titik baliknya? Bacaan ketiga: apa subtext-nya? Tiga bacaan ini mengubah skenario dari sekadar dialog menjadi peta keputusan: di mana kamera harus berubah, di mana aktor harus bergerak, dan di mana adegan harus ditahan.

Contoh:
Ambil adegan "Menunggu Kabar": Rani menunggu hasil lomba pidato di halte. Bacaan pertama: Rani ingin kabar baik, dan ia juga ingin terlihat tenang. Bacaan kedua: titik baliknya adalah saat HP bergetar. Sebelum itu ia berpura-pura tenang, sesudah itu ia tidak bisa lagi berpura-pura. Bacaan ketiga: subtext-nya adalah Rani berkata "Aku tidak apa-apa" sambil menggenggam HP erat-erat; kalimatnya tenang, tubuhnya tidak. Dari analisis ini, blocking hampir menulis dirinya sendiri: sebelum HP bergetar, Rani duduk di ujung bangku halte, jauh dari orang lain, menatap jalan; setelah HP bergetar, ia berdiri dan berjalan dua langkah ke arah jalan, lalu berhenti. Sekarang lakukan hal yang sama untuk satu adegan dari skenariomu: tulis tujuan tiap tokoh, halangannya, titik baliknya, dan subtext-nya dalam satu paragraf.

Ringkasan:
Interpretasi skenario berarti menemukan konflik adegan dari keinginan tokoh yang bertabrakan, menandai titik balik tempat kekuasaan berpindah, dan membaca subtext di balik dialog. Ketiga hal ini menentukan kapan kamera berubah, kapan aktor bergerak, dan kapan adegan ditahan. Sutradara yang tidak tahu titik balik adegannya akan menyutradarai semua bagian dengan nada yang sama.$$)
on conflict (id) do nothing;

-- Course 4, Lesson 3: Director's vision dan konsep visual
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000403', '21000000-0000-4000-8000-000000000004', 'Director''s vision dan konsep visual', 3, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu dapat merumuskan director's vision untuk sebuah adegan dan mengubahnya menjadi konsep visual yang bisa dikomunikasikan kepada kru.

Penjelasan:
Director's vision adalah jawaban sutradara atas satu pertanyaan: film ini harus membuat penonton merasakan apa? Vision bukan ringkasan cerita, melainkan perasaan yang ingin ditinggalkan film di dada penonton. Misalnya, vision sebuah adegan bisa berbunyi: "Penonton harus merasakan cemasnya menunggu, lalu lega yang tertahan ketika kabar baik akhirnya datang." Kalimat seperti ini menjadi kompas untuk semua keputusan berikutnya: kalau sebuah pilihan gambar tidak melayani perasaan itu, pilihan itu dibuang, sebagus apa pun tampilannya.

Dari vision, sutradara menyusun konsep visual: bagaimana perasaan itu diterjemahkan menjadi gambar. Konsep visual mencakup beberapa keputusan. Pertama, tone atau nada keseluruhan: apakah filmmu hangat atau dingin, terang atau gelap, tenang atau gelisah? Kedua, palet warna dan cahaya: warna apa yang dominan, dan apakah cahayanya keras atau lembut? Ketiga, bahasa kamera: apakah kameramu banyak bergerak atau kebanyakan statis, apakah shot-shotmu lebar atau dekat? Keempat, referensi: film, foto, atau gambar lain yang paling dekat dengan perasaan yang kamu maksud.

Konsep visual harus bisa dikomunikasikan. Sutradara tidak bisa hanya menyimpan vision di kepala, karena sinematografer, penata artistik, dan editor harus bekerja dari gambaran yang sama. Cara paling sederhana adalah membuat moodboard: kumpulkan 5 sampai 10 gambar referensi, foto lokasi, contoh warna, dan satu atau dua potongan adegan dari film lain, lalu tuliskan satu kalimat vision di atasnya. Moodboard ini dibawa ke setiap diskusi pra-produksi, sehingga kalau ada yang bertanya "seperti apa sih filmnya?", jawabannya bisa ditunjukkan, bukan hanya dijelaskan.

Vision juga harus diuji terhadap naskah. Kalau visionmu adalah "penonton harus merasa cemas", tetapi adeganmu ditulis dengan dialog yang santai dan blocking yang statis, maka ada yang tidak cocok antara vision dan naskah. Sutradara yang baik menyesuaikan keduanya: entah mengubah vision, atau mengubah cara adegan itu dimainkan lewat blocking dan kamera, supaya perasaan yang diinginkan benar-benar sampai.

Contoh:
Kembali ke adegan "Menunggu Kabar". Vision-nya: "Penonton harus merasakan cemasnya menunggu kabar yang menentukan masa depan, lalu lega yang masih tertahan." Konsep visualnya: sebelum HP bergetar, kamera memakai medium shot yang statis dari eye level, warna cenderung dingin, dan Rani dijaga jauh dari orang lain di frame, supaya penonton merasakan jarak dan kesepiannya. Setelah HP bergetar, kamera mendekat dengan dolly-in pelan ke close-up, dan warna terasa sedikit lebih hangat. Satu perubahan kamera dan satu perubahan jarak sudah cukup untuk menunjukkan perubahan perasaan, tanpa satu kata penjelasan pun. Sekarang buat vision dan konsep visual untuk satu adegan dari skenariomu: satu kalimat vision, lalu tiga keputusan visual yang melayaninya.

Ringkasan:
Director's vision adalah perasaan yang ingin ditinggalkan film pada penonton, dan ia menjadi kompas semua keputusan sutradara. Konsep visual menerjemahkan vision itu menjadi tone, warna, cahaya, dan bahasa kamera yang konkret. Vision harus bisa ditunjukkan lewat moodboard kepada kru, dan harus diuji terhadap naskah supaya perasaan yang diinginkan benar-benar sampai di layar.$$)
on conflict (id) do nothing;

-- Course 4, Lesson 4: Mengarahkan aktor
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000404', '21000000-0000-4000-8000-000000000004', 'Mengarahkan aktor', 4, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu dapat mengarahkan aktor dengan kata kerja yang bisa dimainkan, memberi umpan balik yang spesifik, dan bekerja dengan pemain yang bukan aktor terlatih.

Penjelasan:
Kesalahan paling umum sutradara pemula adalah memberi arahan berupa kata sifat: "Lebih sedih!", "Lebih marah!", "Lebih natural!". Aktor tidak bisa memainkan kata sifat, ia hanya bisa memainkan tindakan. Ganti dengan kata kerja yang bisa dimainkan: "Bujuk dia", "Ancam dia", "Abaikan dia", "Rayu dia supaya tinggal". Kata kerja memberi aktor sesuatu untuk dilakukan, sedangkan kata sifat hanya memberinya tekanan. Aktor yang disuruh "lebih sedih" akan bingung harus berbuat apa, tetapi aktor yang disuruh "bujuk dia supaya tidak pergi" langsung tahu ke mana ia harus menggerakkan tubuh dan suaranya.

Ada tiga kebiasaan sutradara yang baik di lokasi. Pertama, beri aktor tujuan adegan sebelum take, bukan setelah take yang buruk. Misalnya: "Di adegan ini kamu ingin dia mengaku, dan kamu tahu ia berbohong." Aktor yang tahu tujuannya bisa bermain dengan arah, sedangkan aktor yang hanya dikoreksi setelah gagal akan bermain dengan takut. Kedua, beri umpan balik yang spesifik dan bisa diulang: "Tahan jeda itu dua detik lebih lama sebelum menjawab" jauh lebih berguna daripada "Bagus, sekali lagi." Ketiga, lindungi penampilan terbaik: kalau satu take sudah sangat bagus, jangan mengulang sepuluh kali demi kesempurnaan teknis. Energi aktor akan habis dan take terbaikmu justru hilang.

Sutradara juga harus tahu kapan diam. Setelah memberi arahan yang jelas, biarkan aktor mencoba. Mengoreksi setiap detik akan membuat aktor bermain untuk menyenangkanmu, bukan untuk memerankan tokohnya. Tiga take yang jujur lebih baik daripada sepuluh take yang diarahkan kata per kata. Dan jangan pernah mempermalukan aktor di depan kru: kalimat "Take itu bagus, kita simpan. Satu lagi untuk pengaman" menjaga keberaniannya, sedangkan "Jelek! Ulangi!" mematikannya.

Di film sekolah, pemainmu biasanya teman sekelas, bukan aktor terlatih. Itu bukan kekurangan, itu kondisi kerja yang harus kamu pahami. Non-aktor paling kuat ketika mereka memainkan sesuatu yang dekat dengan diri mereka: jangan minta temanmu yang pemalu memerankan penjahat yang meledak-ledak di film pertamamu. Pilih peran yang satu atau dua langkah dari kepribadian mereka, bukan sepuluh langkah. Jangan beri mereka naskah untuk dihafal kata per kata; beri mereka tujuan adegan dan biarkan mereka mengatakannya dengan kata-kata sendiri, lalu rapikan di take berikutnya. Syutinglah dengan sedikit take tetapi rehearsal yang cukup, karena non-aktor kehabisan energi lebih cepat, dan take ke-12 mereka hampir selalu lebih buruk daripada take ke-3.

Contoh:
Latih adegan ini dengan dua temanmu. Adegan: Rani menunggu kabar lomba di halte, temannya Dimas datang dan bertanya, "Sudah ada kabar?" Jangan katakan kepada pemeran Rani, "Lebih cemas!" Katakan: "Kamu ingin Dimas pergi supaya kamu bisa tenang, tetapi kamu juga ingin ia tinggal karena kamu takut sendirian. Sembunyikan HP-mu darinya." Kepada pemeran Dimas, katakan: "Bujuk Rani supaya ia jujur bahwa ia takut." Rekam satu take, lalu beri umpan balik yang spesifik: "Jeda sebelum kamu menjawab tadi bagus, tahan dua detik lebih lama." Rekam satu take lagi dan bandingkan. Tulis tiga kata kerja yang kamu berikan ke tiap aktor, dan catat apakah kata kerja itu terlihat di hasil rekaman.

Ringkasan:
Arahkan aktor dengan kata kerja yang bisa dimainkan, bukan dengan kata sifat yang hanya memberi tekanan. Beri tujuan sebelum take, beri umpan balik yang spesifik dan bisa diulang, dan lindungi take terbaik dengan tidak mengulang tanpa perlu. Dengan non-aktor, pilih peran yang dekat dengan diri mereka, beri tujuan bukan hafalan kata per kata, dan jaga energi mereka dengan sedikit take tetapi rehearsal yang cukup.$$)
on conflict (id) do nothing;

-- Course 4, Lesson 5: Blocking dan staging
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000405', '21000000-0000-4000-8000-000000000004', 'Blocking dan staging', 5, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu dapat merancang blocking yang bermakna untuk sebuah adegan dan menggambar denah blocking dari atas.

Penjelasan:
Blocking adalah seni menempatkan dan menggerakkan aktor di dalam adegan, dalam hubungannya dengan kamera dan satu sama lain. Staging adalah penataan ruang adegan secara keseluruhan: posisi aktor, furnitur, dan kamera. Blocking yang baik mengubah percakapan statis menjadi adegan yang hidup: tokoh bergerak karena ada alasan. Ia mendekat karena ingin mengancam, menjauh karena takut, atau berbalik karena tidak sanggup menatap lawan bicaranya. Gerakan yang bermakna membuat penonton membaca emosi tanpa perlu dialog tambahan.

Aturan praktis yang dipakai para sutradara: jangan biarkan adegan diam terlalu lama. Tokoh sebaiknya bergerak atau mengubah posisi setiap 20 sampai 30 detik, entah karena dorongan cerita atau karena blocking yang direncanakan. Gerakan juga mengatur jarak antar tokoh, dan jarak adalah bahasa. Dua orang yang berdiri berdekatan terasa intim atau mengancam, sedangkan dua orang yang menjaga jarak terasa dingin atau sopan. Satu langkah mundur bisa bercerita lebih banyak daripada satu paragraf dialog.

Denah blocking digambar dari atas, seperti peta. Di atas kertas, gambar ruangan dari atas, tandai posisi awal setiap aktor, gambar panah untuk setiap gerakan, tandai posisi kamera, dan tarik garis aksi di antara tokoh yang berbicara. Denah ini bukan hiasan: ia adalah alat komunikasi dengan kru dan alat berpikir untukmu sendiri. Ketika kamu menggambar denah, kamu akan menemukan masalah sebelum syuting, misalnya dua aktor yang saling menutupi, atau kamera yang tidak punya ruang untuk bergerak.

Urutan kerja di lokasi yang efisien adalah: mulai dari blocking, lalu sinematografer dan tim cahaya menata pencahayaan dan framing berdasarkan blocking itu, sering memakai stand-in, yaitu pengganti aktor yang berdiri di posisinya supaya aktor tidak kelelahan berdiri di bawah lampu. Setelah komposisi dikunci, aktor kembali dan memainkan adegan. Membalik urutan ini, yaitu menata cahaya dulu baru memikirkan gerakan, hampir selalu membuang waktu, karena cahaya yang sudah ditata harus diubah lagi mengikuti gerakan aktor.

Contoh:
Lihat denah blocking adegan "Menunggu Kabar" dari atas. Rani duduk di ujung bangku halte, jauh dari penumpang lain. Garis aksi ditarik antara Rani dan penumpang itu. Sebelum HP bergetar, Rani duduk diam dan menatap jalan. Setelah HP bergetar, ia berdiri, berjalan dua langkah ke arah jalan, lalu berhenti. Satu gerakan, dua informasi: ia ingin berlari tetapi menahan diri. Kamera diletakkan di satu sisi garis aksi, menghadap Rani. Sekarang gambar denah blocking untuk satu adegan dari skenariomu: posisi awal aktor, panah gerakan, posisi kamera, dan garis aksi. Foto denahmu, lalu tulis satu paragraf: kenapa kamu menaruh kamera di sisi garis itu, dan gerakan apa yang menunjukkan subtext adeganmu?

Ringkasan:
Blocking adalah penempatan dan gerakan aktor yang bercerita, sedangkan staging adalah penataan seluruh ruang adegan. Gerakan harus punya alasan dan terjadi setiap 20 sampai 30 detik, karena jarak antar tokoh adalah bahasa emosi. Gambar denah blocking dari atas sebelum syuting, dan kerjakan dengan urutan blocking dulu, lalu cahaya, baru aktor memainkan adegan.$$)
on conflict (id) do nothing;

-- Course 4, Lesson 6: Mengarahkan kamera dan kru
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000401', '22000000-0000-4000-8000-000000000004', 'Mengarahkan kamera dan kru', 1, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu dapat mengomunikasikan rencana syuting kepada kru kamera dan kru lainnya dengan jelas, serta menyusun jadwal syuting satu hari yang realistis.

Penjelasan:
Sutradara juga mengarahkan kru, bukan hanya aktor. Keputusanmu harus bisa dikomunikasikan dengan jelas dan bisa diulang. Kalimat "Kita ambil master dulu, lalu over-the-shoulder Rani, lalu close-up Rani, baru berbalik ke Dimas" memberi kru sebuah rencana yang bisa mereka ikuti. Kalimat "Kita lihat saja nanti" membuat kru menebak-nebak dan mengulang setup yang sama tiga kali. Shot list dan denah blocking yang kamu gambar di minggu pertama adalah alat komunikasimu: tunjukkan keduanya kepada kru sebelum syuting dimulai, supaya semua orang bekerja dari gambar yang sama.

Urutan kerja yang efisien di lokasi sudah teruji: mulai dari blocking bersama aktor, lalu tim cahaya menata pencahayaan dan framing berdasarkan blocking itu, sering memakai stand-in supaya aktor tidak kelelahan. Setelah komposisi dikunci, aktor kembali dan memainkan adegan. Untuk coverage, urutannya adalah master shot dulu, lalu angle yang lebih dekat, satu sisi demi satu sisi. Keuntungannya, pencahayaan hanya ditata sekali per arah. Sampaikan urutan ini di awal hari, supaya kru tahu apa yang terjadi setelah setiap setup dan bisa menyiapkan peralatan berikutnya selagi syuting berjalan.

Jadwal syuting film pendek sekolah biasanya satu hari, 6 sampai 8 jam. Contoh jadwal untuk adegan dialog 1 menit dengan dua aktor: pukul 07.00 sampai 07.30 tiba di lokasi, cek cahaya dan suara, dan rekam 30 detik suara ruangan atau room tone yang dibutuhkan editor. Pukul 07.30 sampai 08.00 blocking adegan dengan aktor, tentukan gerakan dan titik balik, lalu gambar denah dari atas. Pukul 08.00 sampai 08.45 tata cahaya dan framing master shot dengan stand-in. Pukul 08.45 sampai 09.30 syuting master shot 3 sampai 4 take, mainkan seluruh adegan tanpa memotong di tengah. Pukul 09.30 sampai 10.00 istirahat dan pindah setup, cek hasil master di layar sebelum pindah. Pukul 10.00 sampai 11.00 ambil over-the-shoulder, single, dan close-up aktor pertama. Pukul 11.00 sampai 12.00 ambil angle yang sama untuk aktor kedua, jaga eyeline supaya konsisten. Pukul 12.00 sampai 12.30 ambil insert dan reaction shot. Pukul 12.30 sampai 13.00 cek semua bahan, rekam room tone, dan foto behind the scenes.

Satu hal yang membedakan jadwal yang berhasil dan yang gagal adalah waktu cadangan. Selalu sisakan 30 menit kosong di akhir. Setup yang "hanya 10 menit" hampir selalu memakan 30 menit, dan syuting yang dikejar-kejar waktu menghasilkan take yang terburu-buru, yang tidak bisa diperbaiki di editing. Dan ingatlah prinsip ketika semua berjalan salah di lokasi: lindungi cerita, bukan rencananya. Kalau satu adegan tidak bisa diambil seperti yang kamu bayangkan, tanyakan apa fungsi adegan itu dalam cerita, karena fungsi itu hampir selalu bisa dicapai dengan cara lain.

Contoh:
Buat jadwal syuting satu hari untuk adegan dialog dari skenariomu. Tulis jam, kegiatan, dan catatan untuk setiap blok, mengikuti contoh di atas: tiba dan cek lokasi, blocking, tata cahaya master, syuting master, pindah setup, angle aktor pertama, angle aktor kedua, insert dan reaksi, lalu cek bahan. Tambahkan 30 menit cadangan di akhir dan tuliskan untuk apa cadangan itu kamu siapkan. Sekarang bayangkan satu masalah: aktor utamamu terlambat satu jam. Tulis rencanamu: angle apa yang bisa kamu syuting dulu tanpa dia, misalnya insert dan reaksi pemain lain, dan adegan mana yang dijadwalkan ulang? Rencana cadangan seperti ini adalah bagian dari mengarahkan kru.

Ringkasan:
Mengarahkan kru berarti mengomunikasikan rencana dengan kalimat yang jelas dan bisa diulang, memakai shot list dan denah blocking sebagai alat bersama. Kerjakan dengan urutan blocking, cahaya, lalu aktor, dan ambil coverage dari master ke angle yang lebih dekat. Susun jadwal satu hari yang realistis, sisakan 30 menit cadangan, dan ketika rencana runtuh, lindungi cerita, bukan rencananya.$$)
on conflict (id) do nothing;

-- Course 4, Lesson 7: Shot planning dan coverage
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000402', '22000000-0000-4000-8000-000000000004', 'Shot planning dan coverage', 2, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu dapat menyusun shot plan dan coverage lengkap untuk adegan dialog, dari master shot sampai insert, dengan urutan syuting yang efisien.

Penjelasan:
Coverage adalah seluruh set shot yang direkam untuk satu adegan: master shot, two-shot, over-the-shoulder, single, close-up, insert, dan reaksi. Setiap angle mengulang aksi yang sama, sehingga editor bisa memilih tempo, penekanan, dan penampilan terbaik di setiap momen, bukan terkunci pada satu take. Coverage yang lengkap adalah hadiah sutradara untuk editor; coverage yang tidak lengkap adalah utang yang dibayar di ruang editing, dengan mahal.

Setiap shot dalam coverage punya fungsi. Master shot adalah shot lebar yang menampung semua tokoh dan memainkan seluruh adegan; ia menunjukkan geografi adegan dan menjadi pengaman kalau angle lain gagal. Two-shot menampung dua tokoh dalam satu frame, lebih dekat dari master, dan menunjukkan hubungan keduanya dalam satu gambar. Over-the-shoulder atau OTS diambil dari balik bahu satu tokoh ke tokoh lain, membuat dialog terasa intim karena penonton ikut berada di antara mereka. Single atau close-up menampilkan satu wajah per shot dengan ukuran yang sama di kedua sisi, dipotong bolak-balik dalam pola shot reverse shot untuk menunjukkan emosi dan reaksi tiap tokoh. Reaction shot menampilkan wajah tokoh yang mendengarkan, dan inilah yang membuat dialog terasa hidup: potong ke pendengar, bukan hanya ke pembicara. Insert menampilkan benda penting seperti HP, surat, atau minuman, yang membawa informasi plot dan detail yang tidak boleh terlewat.

Urutan syuting coverage yang efisien dan sudah teruji adalah: mulai dari master yang lebar, lalu two-shot, lalu semua angle yang menghadap aktor A, baru berbalik untuk aktor B. Keuntungannya, pencahayaan hanya ditata sekali per arah. Pasangkan angle yang berhadapan: lensa, tinggi, dan jarak yang sama di kedua sisi, misalnya OTS 50mm di kedua arah dan close-up 85mm di kedua arah, supaya potongan bolak-balik terasa seimbang dan tidak ada tokoh yang tiba-tiba terlihat lebih besar dari pasangannya.

Dua detail yang sering dilupakan pemula. Pertama, eyeline: saat mengambil single, aktor harus memandang sedikit melewati lensa, ke arah posisi tokoh lain yang sebenarnya, dan pada ketinggian yang wajar. Aktor yang menatap lurus ke lensa atau ke arah yang salah akan memutus hubungan antar tokoh. Kedua, overlap aksi: mulai setiap setup beberapa baris lebih awal, dan ulangi gerakan kecil seperti menyeruput minuman atau menggeser kursi pada kata yang sama di setiap take, supaya potongan di tengah gerakan tersambung mulus. Inilah yang disebut cutting on action: memotong saat tokoh sedang bergerak, bukan sebelum atau sesudahnya.

Contoh:
Buat shot list coverage untuk adegan dialogmu. Untuk adegan "Menunggu Kabar", coverage-nya adalah: master yang menampilkan halte dan jalan, two-shot Rani dengan satu penumpang lain, over-the-shoulder dari balik bahu penumpang ke Rani, single Rani, close-up HP yang bergetar sebagai insert, dan reaction shot penumpang yang melirik. Enam setup, satu adegan, dan editor punya semua bahan untuk membangun ketegangan, atau justru menahannya. Sekarang buat coverage untuk adegan dialogmu sendiri: master, two-shot, over-the-shoulder tiap arah, single atau close-up tiap arah, satu reaksi, dan satu insert. Tulis lensa atau ukuran yang sama untuk setiap pasangan angle, dan tandai urutan syutingnya dari lebar ke dekat.

Ringkasan:
Coverage adalah seluruh set shot satu adegan, dari master sampai insert, yang memberi editor pilihan tempo dan penekanan. Ambil coverage dari lebar ke dekat, satu sisi demi satu sisi, dan pasangkan angle yang berhadapan dengan lensa dan jarak yang sama. Jaga eyeline aktor dan ulangi gerakan kecil pada kata yang sama di setiap take, supaya potongan di tengah gerakan tersambung mulus.$$)
on conflict (id) do nothing;

-- Course 4, Lesson 8: Continuity dan penyampaian emosi
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000403', '22000000-0000-4000-8000-000000000004', 'Continuity dan penyampaian emosi', 3, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu dapat menjelaskan dan memakai aturan 180 derajat, menjaga continuity antar shot, dan mengarahkan emosi tokoh supaya tersampaikan secara konsisten.

Penjelasan:
Aturan 180 derajat adalah aturan kontinuitas yang paling penting untuk pemula. Bayangkan garis lurus yang ditarik melalui dua tokoh yang sedang berbicara, yang disebut garis aksi atau axis of action. Kamera harus selalu berada di satu sisi garis itu untuk semua shot dalam adegan yang sama. Selama kamu di satu sisi, arah pandang tokoh konsisten di layar: tokoh A selalu melihat ke kanan layar, tokoh B selalu melihat ke kiri layar, dan mata mereka bertemu ketika dipotong. Inilah yang membuat dialog terasa seperti percakapan sungguhan.

Kalau kamera melompat ke sisi lain garis, kedua tokoh tiba-tiba terlihat memandang ke arah yang sama, seolah mereka tidak lagi berbicara satu sama lain, atau seolah mereka bertukar tempat. Penonton mungkin tidak bisa menjelaskan apa yang salah, tetapi mereka merasakannya: adegan itu terasa patah. Cara memindahkan garis dengan sah ada dua: gerakkan kamera secara fisik selama shot berlangsung sehingga penonton melihat perpindahan itu, atau pakai shot netral, misalnya tokoh menatap langsung ke kamera, atau kendaraan datang lurus ke arah kamera.

Aturan ini boleh dilanggar, tetapi dengan sadar dan dengan alasan. Melompati garis dengan sengaja bisa mengejutkan penonton, misalnya di titik balik cerita atau saat hubungan tokoh berubah total. Tetapi pelanggarannya harus terasa disengaja, bukan kecelakaan. Untuk film pertamamu, patuhi dulu, langgar nanti. Begitu juga dengan screen direction secara umum: tokoh yang berjalan ke kanan di satu shot harus tetap berjalan ke kanan di shot berikutnya, dan benda yang dipegang tangan kanan tidak boleh berpindah ke tangan kiri tanpa alasan.

Continuity emosi sama pentingnya dengan continuity gambar. Emosi tokoh harus tersambung antar shot dan antar take, meskipun shot-shot itu diambil berjam-jam terpisah. Di sinilah sutradara menjaga penampilan aktor: ingatkan aktor di mana emosi adegan berada sebelum setiap setup, dan pastikan reaksi pendengar, bukan hanya pembicara, ikut terekam. Dialog terasa hidup karena penonton melihat orang yang mendengarkan, bukan hanya orang yang berbicara. Jaga juga eyeline: aktor yang memandang sedikit melewati lensa ke arah posisi tokoh lain yang sebenarnya akan membuat potongan bolak-balik tersambung, sedangkan aktor yang menatap lurus ke lensa akan memutus hubungan itu.

Contoh:
Tonton satu adegan dialog dari film favoritmu dan gambar denah sederhananya: di mana garis aksi berada, dan di sisi mana kamera diletakkan pada setiap shot? Hitung berapa angle yang dipakai dan periksa apakah semuanya berada di satu sisi garis. Sekarang perhatikan emosi tokohnya: apakah reaksi pendengar ikut ditampilkan, dan apakah emosi itu naik atau turun secara bertahap? Bandingkan dengan adegan dialogmu sendiri. Latihan di lokasi: syuting adegan dialog 1 menit dengan dua teman, lalu periksa hasilmu: apakah ada shot yang melompati garis, apakah eyeline konsisten, dan apakah emosi tokoh di close-up terakhir masih tersambung dengan emosi di master shot yang diambil tiga jam sebelumnya?

Ringkasan:
Aturan 180 derajat menjaga semua kamera di satu sisi garis aksi, supaya arah pandang tokoh konsisten dan dialog tidak terasa patah. Garis hanya boleh dipindah dengan gerakan kamera yang terlihat atau lewat shot netral, dan pelanggaran harus disengaja, bukan kecelakaan. Continuity emosi dijaga dengan mengingatkan aktor pada posisi emosi adegan di setiap setup, menampilkan reaksi pendengar, dan menjaga eyeline yang konsisten antar shot.$$)
on conflict (id) do nothing;

-- Course 4, Lesson 9: Simulasi penyutradaraan adegan
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000404', '22000000-0000-4000-8000-000000000004', 'Simulasi penyutradaraan adegan', 4, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu dapat menjalankan simulasi penyutradaraan sebuah adegan, dari rehearsal tanpa kamera sampai syuting coverage lengkap berdurasi 1 menit.

Penjelasan:
Sutradara profesional tidak langsung menyalakan kamera. Mereka rehearsal: aktor memainkan adegan berkali-kali tanpa kamera, kadang hanya duduk melingkar membaca naskah yang disebut table read, kadang berdiri dan mencoba blocking di ruangan kosong. Rehearsal punya tiga tujuan. Pertama, menemukan masalah naskah: dialog yang terdengar kaku saat dibaca keras hampir selalu memang kaku. Kedua, menemukan blocking yang jujur: gerakan yang muncul dari keinginan tokoh, bukan dari gambar yang direncanakan sutradara di kepala. Ketiga, membangun kepercayaan: aktor yang sudah mencoba dan gagal di rehearsal akan berani mencoba di lokasi.

Untuk film sekolah, rehearsal bisa sangat sederhana: satu kali table read, yaitu membaca naskah bersama tanpa akting berlebihan, lalu satu kali blocking di lokasi sebenarnya dengan ponsel dimatikan, hanya berjalan dan berbicara. Dua jam rehearsal menghemat empat jam di lokasi syuting, karena aktor sudah tahu ke mana mereka bergerak dan kru sudah tahu ke mana kamera menghadap. Sutradara yang melewatkan rehearsal biasanya menghabiskan hari syuting untuk mengulang hal yang sama sambil berpikir.

Simulasi penyutradaraan menggabungkan semua yang sudah kamu pelajari menjadi satu latihan utuh. Mulailah dari analisis adegan: apa yang diinginkan tiap tokoh, apa halangannya, di mana titik baliknya, dan apa subtext-nya. Lalu gambar denah blocking dari atas dan tentukan garis aksi. Susun shot list coverage: master, two-shot, over-the-shoulder tiap arah, single atau close-up tiap arah, satu reaksi, dan satu insert. Sampaikan rencana itu kepada kru dan aktor dengan kalimat yang jelas, lalu jalankan syuting dengan urutan master dulu, angle yang lebih dekat setelahnya, satu sisi demi satu sisi.

Selama simulasi, perhatikan tiga hal. Pertama, apakah blockingmu benar-benar terjadi seperti yang kamu gambar, atau aktor menemukan gerakan yang lebih jujur di lokasi? Kalau yang kedua, ikuti aktor, karena blocking yang lahir dari keinginan tokoh selalu lebih baik daripada blocking yang dipaksakan dari denah. Kedua, apakah setiap setup dimulai beberapa baris lebih awal dan gerakan kecil diulang pada kata yang sama, supaya cutting on action bisa bekerja? Ketiga, apakah kamu melindungi take terbaik dengan tidak mengulang sepuluh kali demi kesempurnaan teknis? Setelah syuting, tonton semua bahan dan catat: angle apa yang hilang, emosi mana yang tidak tersambung, dan apa yang akan kamu ubah di simulasi berikutnya.

Contoh:
Jalankan simulasi ini dengan adegan "Menunggu Kabar" atau satu adegan dialog dari skenariomu. Hari pertama: table read 30 menit bersama dua teman, lalu blocking 30 menit di lokasi sebenarnya tanpa kamera. Hari kedua: syuting mengikuti jadwal satu hari, dari master sampai insert, dengan total hasil akhir 1 menit. Rekam room tone 30 detik sebelum pulang. Setelah itu, tonton hasilmu dan jawab tiga pertanyaan: apakah titik balik adegan terasa lewat perubahan shot dan gerakan? Apakah semua kamera berada di satu sisi garis aksi? Apakah ada reaksi pendengar yang membuat dialog terasa hidup? Tulis jawabanmu dalam satu halaman catatan pengarahan, lengkap dengan tiga kata kerja yang kamu berikan ke tiap aktor dan apakah kata kerja itu terlihat di hasil rekaman.

Ringkasan:
Simulasi penyutradaraan dimulai dari rehearsal: table read untuk menemukan masalah naskah, lalu blocking tanpa kamera untuk menemukan gerakan yang jujur. Setelah itu jalankan syuting coverage lengkap dari master ke close-up, dengan urutan yang efisien dan arahan yang jelas. Dua jam rehearsal menghemat empat jam di lokasi, dan evaluasi setelah syuting, tentang titik balik, garis aksi, dan reaksi pendengar, adalah bahan belajar untuk adegan berikutnya.$$)
on conflict (id) do nothing;

-- Course 4, Lesson 10: Evaluasi hasil penyutradaraan
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000405', '22000000-0000-4000-8000-000000000004', 'Evaluasi hasil penyutradaraan', 5, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu dapat mengevaluasi hasil penyutradaraan sebuah adegan dengan kriteria yang jelas dan menentukan apa yang harus diperbaiki atau diambil ulang.

Penjelasan:
Evaluasi dimulai setelah semua bahan terkumpul: video adegan dialog 1 menit, denah blocking, dan shot list coverage. Tonton hasilmu dua kali. Tontonan pertama untuk merasakan: apakah adegan itu bekerja sebagai cerita? Apakah kamu merasakan apa yang seharusnya dirasakan penonton? Tontonan kedua untuk memeriksa: tonton dengan daftar kriteria di tangan dan beri skor pada setiap kriteria. Evaluasi yang hanya mengandalkan perasaan akan melewatkan masalah teknis, sedangkan evaluasi yang hanya memeriksa teknis akan melewatkan apakah adegannya terasa hidup.

Ada lima kriteria, masing-masing bernilai 1 sampai 3, dengan total maksimal 15. Pertama, analisis adegan: apakah tujuan tokoh dan titik balik tertulis jelas dan terlihat di hasil akhir? Adegan yang dimainkan tanpa tahu titik baliknya akan terasa datar, karena semua bagian dimainkan dengan nada yang sama. Kedua, blocking: apakah gerakan bermakna dan sesuai subtext, dan apakah denah dari atas lengkap? Aktor yang berdiri diam atau bergerak tanpa alasan menunjukkan blocking yang belum dipikirkan. Ketiga, aturan 180 derajat: apakah semua kamera berada di satu sisi garis aksi dan eyeline konsisten? Garis yang dilompati tanpa sadar akan membuat adegan terasa patah. Keempat, coverage: apakah set lengkap, dari master sampai insert, dan apakah pasangan angle cocok lensa dan jaraknya? Kalau hanya ada master dan satu close-up, editor tidak punya pilihan. Kelima, pengarahan aktor: apakah arahan berupa kata kerja dan apakah penampilan terasa jujur? Arahan berupa kata sifat hampir selalu menghasilkan akting yang terasa dibuat-buat.

Skor 13 sampai 15 berarti siap lanjut ke course berikutnya. Skor 10 sampai 12 berarti bagus, perbaiki satu kriteria terlemah. Di bawah 10 berarti syuting ulang satu angle yang hilang sebelum lanjut, karena editing tidak bisa menciptakan bahan yang tidak pernah direkam. Perbaikan yang paling sering dibutuhkan pemula adalah satu dari tiga hal: menambah reaction shot yang terlupakan, mengambil ulang close-up yang emosinya tidak tersambung dengan master, atau memperbaiki eyeline yang patah.

Evaluasi juga mencakup hal-hal di luar gambar: apakah jadwal berjalan sesuai rencana, apakah kru memahami arahanmu, dan apakah aktor merasa aman untuk mencoba? Sutradara yang baik mengevaluasi dirinya sendiri sama jujurnya dengan mengevaluasi gambar. Tulis satu halaman catatan: apa yang berhasil, apa yang gagal, dan satu hal konkret yang akan kamu lakukan berbeda di adegan berikutnya. Catatan ini adalah bahan baku course berikutnya, di mana kamu akan memotong video 1 menit ini menjadi adegan yang utuh, memilih take terbaik, dan memutuskan ritmenya.

Contoh:
Evaluasi video adegan dialog 1 menitmu dengan lima kriteria di atas. Misalnya, kamu memberi skor 3 untuk analisis adegan karena titik baliknya jelas terasa saat HP bergetar, skor 2 untuk blocking karena satu gerakan aktor terasa dipaksakan, skor 3 untuk aturan 180 derajat karena semua kamera satu sisi, skor 1 untuk coverage karena reaction shot terlupakan, dan skor 2 untuk pengarahan aktor karena satu arahan masih berupa kata sifat. Totalmu 11: bagus, tetapi perbaikanmu jelas, yaitu syuting ulang reaction shot dan perbaiki satu gerakan blocking. Sekarang tonton ulang videomu bersama teman yang menjadi aktor dan tanyakan: arahan mana yang paling membantumu, dan arahan mana yang membingungkan? Jawaban mereka adalah evaluasi yang tidak bisa kamu dapatkan dari menonton sendirian.

Ringkasan:
Evaluasi hasil penyutradaraan memakai lima kriteria: analisis adegan, blocking, aturan 180 derajat, coverage, dan pengarahan aktor, masing-masing bernilai 1 sampai 3 dengan total maksimal 15. Skor 13 sampai 15 berarti siap lanjut, skor 10 sampai 12 berarti perbaiki satu kriteria terlemah, dan di bawah 10 berarti syuting ulang angle yang hilang, karena editing tidak bisa menciptakan bahan yang tidak pernah direkam. Evaluasi yang jujur, termasuk mendengar pendapat aktor dan kru, adalah bekal untuk adegan berikutnya.$$)
on conflict (id) do nothing;

-- SINEVERSE Academy — Stage 1 seed: Learning Material (materi pelajaran)
-- Courses 5 (Editing Film) dan 6 (Tata Suara dan Musik Film)
-- =====================================================================
-- CARA PAKAI: jalankan file ini di Supabase SQL Editor (proyek sineverse,
-- ref twdnlfzorenqitiixher). Idempotent: semua INSERT memakai
-- ON CONFLICT (id) DO NOTHING, jadi aman dijalankan ulang.
-- ISI: 2 course x 2 section (module) = 4 module, dan 20 lesson
-- (10 per course). Judul lesson mengikuti RPS Semester 1 v3.
-- SUMBER MATERI: Modul 04 "Editing Film" dan Modul 05 "Tata Suara dan
-- Musik Film" (~/workspace/sineverse-kurikulum/modul/). Lesson yang
-- materinya tidak dibahas di modul PDF ditulis dari pengetahuan umum
-- perfilman dan diakhiri tanda "[Perlu ditinjau mentor]".
-- CATATAN: konten memakai dollar-quoted string; tidak ada "$$" di dalam
-- konten mana pun. video_url NULL untuk semua lesson tahap ini.

-- ============================================================
-- COURSE 5 — Editing Film
-- ============================================================

insert into public.modules (id, course_id, title, order_index) values
  ('21000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', 'Section 1 — Minggu 1', 1)
on conflict (id) do nothing;

insert into public.modules (id, course_id, title, order_index) values
  ('22000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', 'Section 2 — Minggu 2', 2)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('31000000-0000-4000-8000-000000000501', '21000000-0000-4000-8000-000000000005', 'Pengenalan post-production', 1, NULL, $$
Tujuan: Setelah lesson ini, kamu bisa menjelaskan apa itu post-production dan mengapa editing sering disebut sebagai penulisan ulang film yang ketiga, serta menyebutkan tahapan utama setelah syuting selesai.

Penjelasan: Ada pepatah di dunia film: film ditulis tiga kali. Pertama di naskah, kedua di lokasi syuting, dan ketiga di ruang editing. Post-production adalah semua pekerjaan yang dilakukan setelah syuting selesai, mulai dari memilih dan menyusun gambar, mengolah suara, memberi warna, sampai mengekspor film yang siap ditonton. Di sinilah cerita benar-benar terbentuk. Adegan yang membosankan bisa dipotong menjadi tegang, dan penampilan biasa bisa menjadi luar biasa, hanya lewat keputusan memotong dan menyusun.

Editing bukan sekadar merapikan file. Editor memutuskan kapan kita melihat wajah yang berbicara dan kapan kita melihat wajah yang mendengarkan, kapan adegan dipotong cepat dan kapan ditahan lama. Semua keputusan itu adalah keputusan cerita, bukan keputusan teknis. Karena itu editor yang baik berpikir seperti penulis cerita, bukan seperti tukang potong.

Alur kerja post-production bergerak dalam beberapa tahap. Pertama, semua bahan dikumpulkan dan disusun mengikuti naskah (assembly). Lalu cerita dirapikan dengan membuang bagian yang lemah (rough cut), kemudian ritme dipoles frame demi frame (fine cut), sampai gambar dikunci dan tidak boleh berubah lagi (picture lock). Baru setelah picture lock, tim suara dan warna bekerja di atas gambar yang sudah final. Urutan ini penting: mengerjakan warna sebelum gambar dikunci berarti mengulang pekerjaan setiap kali ada potongan yang berubah.

Untuk belajar editing kamu tidak butuh alat mahal. HP berkamera dan aplikasi editing gratis seperti CapCut atau DaVinci Resolve sudah cukup. Yang paling penting adalah bahan latihan: sebuah adegan dialog sederhana berdurasi satu menit, direkam dari satu master shot dan dua close-up. Tanpa bahan, modul ini hanya teori.

Contoh: Bayangkan kamu merekam dua teman berbicara di halte selama 12 menit dari enam sudut berbeda. Bahan mentahnya panjang dan berantakan, tetapi setelah editing, adegan itu bisa menjadi satu menit yang tegang dan jelas: dibuka dengan close-up HP yang diam, dipotong ke wajah Rani, lalu langsung ke dialog inti. Cerita yang sama, rasanya sangat berbeda, hanya karena keputusan editing.

Ringkasan: Post-production adalah tahap setelah syuting tempat film ditulis ulang untuk ketiga kalinya. Editing adalah keputusan cerita, bukan sekadar teknis. Alurnya bergerak dari assembly, rough cut, fine cut, sampai picture lock, lalu dilanjutkan suara dan warna. Kamu bisa mulai dengan HP dan aplikasi gratis, asal punya bahan latihan yang nyata.
$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('31000000-0000-4000-8000-000000000502', '21000000-0000-4000-8000-000000000005', 'Mengenal software editing', 2, NULL, $$
Tujuan: Setelah lesson ini, kamu bisa menyebutkan tiga aplikasi editing gratis yang dipakai di course ini, menjelaskan perbedaan utama di antara ketiganya, dan memilih aplikasi yang cocok untuk perangkat yang kamu punya.

Penjelasan: Aplikasi editing apa pun yang kamu pakai, langkah kerjanya sama: import bahan, susun di timeline, potong, rapikan suara, beri warna, lalu ekspor. Yang berbeda hanya nama tombol dan tampilannya. Karena itu jangan takut pindah aplikasi: sekali kamu paham logikanya, kamu bisa memakai aplikasi apa saja.

CapCut adalah aplikasi editing yang paling ramah untuk pemula dan berjalan di HP. Antarmukanya sederhana, banyak template dan efek siap pakai, dan proses ekspornya cepat. Kelemahannya, kontrol halusnya terbatas: untuk potongan yang presisi frame demi frame atau color grading yang detail, CapCut terasa sempit. CapCut cocok untuk tugas pertama dan untuk mengedit cepat di HP.

DaVinci Resolve adalah aplikasi gratis di laptop yang dipakai juga oleh editor profesional. Ia punya timeline yang lengkap, alat warna yang sangat kuat, serta halaman khusus untuk audio (Fairlight) dan efek visual (Fusion). Kekurangannya, ia butuh laptop yang cukup kuat dan waktu belajar yang lebih lama. Kalau kamu serius ingin mendalami editing, DaVinci Resolve adalah tujuan jangka panjangmu.

Kdenlive adalah aplikasi editing gratis dan ringan yang berjalan di laptop dengan spesifikasi biasa. Fiturnya lengkap untuk kebutuhan dasar sampai menengah: multi-track video dan audio, transisi, serta keyframe sederhana. Ia tidak sepopuler dua aplikasi di atas, tetapi menjadi pilihan yang baik kalau laptopmu tidak kuat menjalankan DaVinci Resolve.

Prinsip memilihnya sederhana: pakai aplikasi yang bisa berjalan lancar di perangkatmu dan yang kamu mau pelajari sungguh-sungguh. Editor yang hebat tidak ditentukan oleh harga aplikasinya, melainkan oleh keputusan potongannya.

Contoh: Kamu punya HP dan laptop lama. Untuk tugas film pendek pertama, edit di CapCut di HP sampai rough cut selesai, lalu pindahkan ke Kdenlive di laptop kalau kamu ingin memoles warna dan suara dengan lebih teliti. Catat di jurnalmu: aplikasi apa yang kamu pakai, dan satu hal yang terasa sulit di aplikasi itu.

Ringkasan: CapCut cocok untuk pemula di HP, DaVinci Resolve adalah standar profesional gratis di laptop, dan Kdenlive adalah pilihan ringan untuk laptop biasa. Logika editingnya sama di semua aplikasi, jadi pilih yang berjalan lancar di perangkatmu dan kuasai satu aplikasi dulu sebelum pindah.

[Perlu ditinjau mentor]
$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('31000000-0000-4000-8000-000000000503', '21000000-0000-4000-8000-000000000005', 'Import dan pengelolaan footage', 3, NULL, $$
Tujuan: Setelah lesson ini, kamu bisa mengimpor footage ke dalam project editing dengan aman, memberi nama file yang jelas, dan mengorganisasi bahan per adegan supaya tidak kehilangan file di tengah pengerjaan.

Penjelasan: Langkah pertama dalam setiap project editing adalah import dan backup. Salin semua file video dan audio ke satu folder project di perangkatmu, dan jangan pernah mengedit langsung dari kartu memori atau flashdisk. Kartu memori bisa tercabut atau rusak, dan aplikasi editing akan kehilangan jejak file kalau sumbernya berpindah. Simpan juga satu salinan cadangan di tempat lain, misalnya di folder Drive atau harddisk eksternal.

Beri nama file yang jelas sejak awal. Nama seperti Video001.mp4 atau Audio 001 akan hilang di antara ratusan file dan membuatmu membuang waktu mencari. Gunakan pola yang konsisten, misalnya Adegan1_Master_Take2.mp4, Adegan1_CU_Rani_Take1.mp4, atau Adegan2_Ambience_Halte.mp4. Dari namanya saja kamu sudah tahu isi file itu adegan apa, shot apa, dan take ke berapa.

Setelah import, tonton semua bahan dari awal sampai akhir sebelum memotong apa pun. Sambil menonton, beri tanda pada take terbaik, misalnya bintang atau warna di aplikasi editingmu, dan buang take yang gagal fokus atau goyang parah. Kemudian buat folder atau bin per adegan di dalam aplikasi, supaya bahan tiap adegan terpisah rapi. Kebiasaan ini membedakan editor yang rapi dengan editor yang kehilangan file di tengah deadline.

Satu kebiasaan penting lainnya: simpan setiap tahap editing sebagai versi baru, misalnya Film_v1_assembly, Film_v2_rough, Film_v3_fine, dan jangan pernah menimpa file lama. Versi lama adalah penyelamat ketika revisi ternyata lebih buruk dari sebelumnya.

Contoh: Kamu baru selesai syuting adegan dialog di halte. Malam itu juga, salin semua file ke folder Project_Halte di laptop dan satu salinan ke Drive. Ubah nama file menjadi Adegan1_Master_Take1.mp4 dan seterusnya, tonton semuanya, beri bintang pada take terbaik tiap setup, lalu susun ke dalam bin Adegan 1. Besok pagi kamu bisa langsung mulai assembly tanpa mencari-cari file.

Ringkasan: Import berarti menyalin semua bahan ke satu folder project dan mencadangkannya, bukan mengedit dari kartu memori. Beri nama file yang jelas dan konsisten, tonton semua bahan, tandai take terbaik, dan susun per adegan. Simpan setiap tahap sebagai versi baru agar pekerjaanmu selalu bisa kembali ke titik aman.
$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('31000000-0000-4000-8000-000000000504', '21000000-0000-4000-8000-000000000005', 'Timeline dan basic cutting', 4, NULL, $$
Tujuan: Setelah lesson ini, kamu bisa menjelaskan fungsi timeline dalam aplikasi editing, melakukan potongan dasar (cut, trim, dan split), serta menyusun shot mengikuti urutan cerita di naskah.

Penjelasan: Timeline adalah meja kerja editor. Di sinilah semua shot disusun dari kiri ke kanan mengikuti urutan waktu cerita. Setiap baris di timeline disebut track: track video untuk gambar, track audio untuk suara. Biasanya ada beberapa track video dan audio yang bertumpuk, misalnya track video utama untuk adegan, track di atasnya untuk judul atau cutaway, dan track audio terpisah untuk dialog, musik, dan efek suara. Garis vertikal yang bergerak saat video diputar disebut playhead, dan ia menunjukkan posisi waktu yang sedang kamu lihat.

Potongan paling dasar adalah cut: membagi satu klip menjadi dua bagian di titik playhead, atau membuang bagian yang tidak dibutuhkan. Teknik yang menyertainya adalah trim, yaitu memanjangkan atau memendekkan ujung sebuah klip dengan menyeret tepinya. Ada juga split, yaitu memotong klip di tengah untuk menyisipkan shot lain di antaranya. Tiga gerakan ini saja sudah cukup untuk merakit hampir seluruh film pendek pertamamu.

Saat menyusun, patokan pertamamu adalah naskah: susun take terbaik mengikuti urutan adegan, apa adanya, tanpa memotong dulu. Inilah tahap assembly. Jangan tergoda memoles ritme sebelum urutan cerita lengkap, karena memoles adegan yang strukturnya salah adalah pekerjaan sia-sia. Setelah assembly utuh, barulah kamu mulai memotong: buang basa-basi pembuka, buang pengulangan dialog, dan persingkat bagian yang bertele-tele. Target yang sehat untuk rough cut adalah membuang minimal 30 persen durasi assembly.

Satu hal teknis yang sering merusak film pemula: mencampur frame rate, misalnya sebagian klip 24 fps dan sebagian 30 fps dalam satu timeline, sehingga gerakannya tersendat. Pastikan pengaturan timeline sama dengan pengaturan saat syuting, biasanya 24 atau 30 fps.

Contoh: Buka aplikasi editingmu dan susun adegan dialog halte: letakkan master shot di track video 1, lalu potong dan ganti bagian tertentu dengan close-up Rani dan Dimas. Potong di tengah gerakan, misalnya saat Rani menoleh, supaya sambungannya nyaris tidak terlihat. Putar hasilnya dari awal: kalau ceritanya sudah bisa diikuti, assembly-mu berhasil.

Ringkasan: Timeline adalah tempat shot disusun mengikuti waktu cerita, dengan track terpisah untuk video dan audio. Potongan dasarnya adalah cut, trim, dan split. Susun dulu assembly mengikuti naskah tanpa memotong, lalu rapikan di rough cut dengan membuang minimal 30 persen durasi. Jaga frame rate timeline tetap sama dengan saat syuting.

[Perlu ditinjau mentor]
$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('31000000-0000-4000-8000-000000000505', '21000000-0000-4000-8000-000000000005', 'Continuity editing', 5, NULL, $$
Tujuan: Setelah lesson ini, kamu bisa menjelaskan apa itu continuity editing dan memakai tiga tekniknya, yaitu match on action, cutaway, dan cross-cutting, supaya penonton merasa waktu dan ruang berjalan tanpa putus.

Penjelasan: Continuity editing adalah gaya editing yang membuat penonton merasa waktu dan ruang berjalan terus tanpa putus. Penonton tidak boleh sadar bahwa mereka sedang menonton potongan-potongan gambar dari sudut yang berbeda. Editing yang baik sering disebut invisible editing: penonton merasakan cerita, bukan potongannya. Untuk mencapai itu, editor memakai dua strategi besar: memakai establishing shot untuk membangun ruang tempat aksi berkembang, dan mengikuti aksi manusia sehingga waktu terasa seperti waktu nyata.

Teknik pertama adalah match on action. Gerakan yang dimulai di satu shot diselesaikan di shot berikutnya, sehingga potongan menghilang di dalam gerakan. Misalnya tangan meraih gelas di shot lebar, lalu potong ke close-up saat tangan itu menggenggam gelas. Aturan praktisnya: potonglah saat tokoh sedang bergerak. Tangan yang meraih gelas, kepala yang menoleh, pintu yang dibuka, potongan di tengah gerakan hampir tidak terlihat karena mata penonton mengikuti gerakan, bukan sambungannya. Sebaliknya, memotong saat tokoh diam total membuat sambungan terasa menonjol.

Teknik kedua adalah cutaway, yaitu shot singkat yang terkait dengan adegan, disisipkan sebentar lalu kembali ke aksi utama. Cutaway berguna untuk menutupi lompatan waktu atau take yang rusak, misalnya potong ke jam dinding atau ke gelas di meja saat dialog melompat beberapa detik. Penonton menerimanya karena cutaway masih bagian dari dunia adegan itu.

Teknik ketiga adalah cross-cutting atau parallel editing, yaitu dua adegan di tempat berbeda yang dipotong bergantian untuk membangun ketegangan. Misalnya dua orang yang sama-sama bergegas menuju tempat yang sama, dipotong silih berganti sampai mereka bertemu. Semakin cepat pergantiannya, semakin besar rasa mendesak yang dirasakan penonton.

Contoh: Rekam gerakan membuka pintu dari dua angle: satu dari depan, satu dari samping. Di editing, mulai dari angle pertama saat tangan menyentuh gagang, lalu potong ke angle kedua tepat di tengah gerakan mendorong. Tonton hasilnya: kalau potongannya tidak terasa, match on action-mu berhasil. Sekarang coba potong saat tangan diam sebelum menyentuh gagang, dan bandingkan betapa menonjolnya sambungan itu.

Ringkasan: Continuity editing menjaga waktu dan ruang terasa utuh sehingga editing menjadi tidak terlihat. Match on action menyembunyikan potongan di dalam gerakan, cutaway menutupi lompatan dengan shot terkait, dan cross-cutting membangun ketegangan dengan memotong dua adegan secara bergantian. Kuncinya: potong saat tokoh bergerak, bukan saat diam.
$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('32000000-0000-4000-8000-000000000501', '22000000-0000-4000-8000-000000000005', 'Transisi dan pacing', 1, NULL, $$
Tujuan: Setelah lesson ini, kamu bisa memilih transisi yang tepat untuk tiap sambungan, menjelaskan apa yang dikatakan setiap jenis transisi tentang waktu, dan mengatur pacing film lewat panjang shot.

Penjelasan: Transisi adalah cara satu shot berganti ke shot berikutnya, dan setiap jenis transisi mengatakan sesuatu yang berbeda tentang waktu dan tempat. Cut adalah sambungan default: satu gambar langsung diganti gambar lain, dan penonton membacanya sebagai saat berikutnya. Dalam satu film panjang jumlah cut bisa ribuan, dan justru karena cut begitu umum, ia menjadi tidak terlihat. Prinsip umumnya: transisi yang paling sering kamu pakai seharusnya yang paling tidak terlihat, yaitu cut. Pakai cut untuk sekitar 90 persen sambunganmu.

Dissolve atau lap dissolve adalah transisi bertahap: gambar A memudar sementara gambar B muncul, dan keduanya terlihat sebentar. Dissolve menandakan berlalunya waktu, kenangan, atau mimpi. Hati-hati memakainya di tengah percakapan yang berlangsung terus, karena penonton akan bingung apakah waktunya melompat. Fade in dan fade out membuat gambar perlahan menjadi warna solid, biasanya hitam, atau sebaliknya. Fade menandai awal atau akhir segmen besar cerita, jadi pakailah hemat: film panjang rata-rata hanya punya beberapa fade. Wipe mendorong gambar lama keluar frame dan terasa kuno atau bergaya, jadi pakai hanya kalau gaya itu memang kamu cari. Match cut menyambung dua shot karena bentuk, gerakan, atau suara yang mirip, dan jump cut memotong di dalam shot yang sama sehingga waktu terasa melompat.

Ada dua transisi suara yang sangat berguna. J-cut adalah ketika audio adegan berikutnya terdengar lebih dulu sebelum gambarnya muncul, dan L-cut adalah ketika audio adegan lama masih terdengar setelah gambar berganti. Keduanya membuat sambungan terasa halus, karena telinga tiba sebelum atau sesudah mata.

Pacing atau ritme adalah kecepatan potongan, dan kecepatan itu adalah perasaan waktu penonton. Shot yang ditahan lama membuat penonton merenung, tegang, atau tidak nyaman; shot yang dipotong cepat membuat penonton bersemangat, cemas, atau kewalahan. Editor yang baik mengubah ritme mengikuti emosi adegan, misalnya memotong pelan di dialog yang intim dan cepat di adegan kejar-kejaran. Banyak film mempercepat ritme menjelang klimaks, lalu tiba-tiba melambat tepat di klimaks supaya penonton merasakan bobot momen itu.

Contoh: Potong adegan dialog satu menitmu tiga kali. Pertama hanya dengan cut, kedua dengan satu dissolve di tengah, ketiga dengan J-cut di awal. Tonton ketiganya dan tulis: versi mana yang paling halus, dan kenapa. Perhatikan juga di mana kamu merasa ingin melihat HP saat menonton: di situlah ritmemu bermasalah.

Ringkasan: Cut adalah transisi default yang paling tidak terlihat, dissolve menandai waktu berlalu, fade menandai awal atau akhir segmen besar, dan J-cut serta L-cut menghaluskan sambungan lewat suara. Pacing diatur lewat panjang shot mengikuti emosi adegan, dan kontras antara cepat dan lambat membuat klimaks terasa besar. Jangan memakai transisi mewah di setiap sambungan.
$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('32000000-0000-4000-8000-000000000502', '22000000-0000-4000-8000-000000000005', 'Audio editing dasar', 2, NULL, $$
Tujuan: Setelah lesson ini, kamu bisa menjelaskan peran suara dalam film, membersihkan dialog, menyamakan level audio antar shot, dan menempatkan musik serta efek suara di timeline tanpa menenggelamkan dialog.

Penjelasan: Penonton memaafkan gambar yang sedikit goyang, tetapi jarang memaafkan suara yang buruk. Sound design adalah separuh film yang tidak terlihat: dialog yang bersih, suara lingkungan yang membuat ruangan terasa nyata, efek suara yang menjual aksi, dan musik yang mengatur emosi. Aturan praktis yang paling penting: suara harus direkam sebaik mungkin di lokasi, karena suara yang direkam buruk hampir tidak bisa diperbaiki di editing, sedangkan gambar yang kurang terang masih bisa diselamatkan.

Langkah audio editing dimulai dengan membersihkan dialog. Dengarkan setiap klip dengan headphone dan potong bagian yang rusak, samakan level volume antar shot supaya tidak ada dialog yang tiba-tiba pelan atau keras, dan periksa apakah ada bunyi yang mengganggu seperti dengung AC atau motor lewat. Kalau ada jeda sunyi yang terasa aneh di antara potongan dialog, selipkan room tone, yaitu rekaman 30 detik suara ruangan yang diam, di bawah potongan itu supaya tidak ada keheningan digital yang terdengar seperti bunyi klik.

Setelah dialog bersih, tambahkan lapisan suara lainnya. Ambience memberi tahu penonton di mana adegan terjadi tanpa penjelasan. Efek suara seperti langkah kaki, pintu, atau hujan membuat aksi terasa nyata. Musik masuk terakhir dan diletakkan di bawah dialog: untuk film sekolah, standar yang aman adalah dialog terdengar jelas di HP tanpa earphone, musik tidak menenggelamkan dialog, dan level akhir sekitar minus 14 LUFS untuk platform seperti YouTube. Angka pastinya tidak wajib dihafal; yang penting, putar filmmu di HP dan di laptop, dan pastikan dialog tetap jelas di keduanya.

Tiga prinsip memakai musik: musik seharusnya mendukung emosi yang sudah ada di adegan, bukan menciptakannya dari nol. Musik yang masuk di momen yang tepat terasa jauh lebih kuat daripada musik yang berbunyi terus dari awal sampai akhir. Dan perhatikan hak cipta: untuk film yang diunggah ke internet, pakai musik bebas lisensi, misalnya dari YouTube Audio Library atau Free Music Archive, atau musik yang dibuat temanmu sendiri.

Contoh: Ambil adegan dialogmu dan buat dua versi audio. Versi pertama: dialog saja, tanpa musik dan tanpa room tone. Versi kedua: dialog yang sama ditambah room tone di bawah potongan dan satu musik pelan yang masuk tepat setelah kalimat penting. Putar keduanya di speaker HP. Catat perbedaan yang kamu rasakan, dan perhatikan apakah versi kedua terasa lebih hidup tanpa membuat dialog sulit didengar.

Ringkasan: Suara adalah separuh film yang tidak terlihat, dan suara yang direkam buruk sulit diperbaiki. Bersihkan dialog dulu, samakan levelnya, tambal jeda dengan room tone, lalu letakkan musik dan efek di bawah dialog. Musik mendukung emosi yang sudah ada, bukan menciptakannya, dan selalu pakai musik yang bebas lisensi untuk film yang diunggah.
$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('32000000-0000-4000-8000-000000000503', '22000000-0000-4000-8000-000000000005', 'Color correction dan color grading', 3, NULL, $$
Tujuan: Setelah lesson ini, kamu bisa membedakan color correction dan color grading, menyeragamkan warna antar shot, dan memberi karakter warna yang konsisten pada film pendekmu.

Penjelasan: Color correction dan color grading adalah dua langkah berbeda yang sering dicampuradukkan. Color correction adalah perbaikan: menyeragamkan warna antar shot supaya tidak ada yang tiba-tiba kuning atau biru, memperbaiki exposure yang terlalu gelap atau terang, dan menyeimbangkan white balance supaya warna kulit terlihat natural. Tujuannya adalah konsistensi, yaitu semua shot dalam satu adegan terlihat berasal dari tempat dan waktu yang sama.

Color grading adalah penataan karakter setelah warna seragam. Di sinilah kamu memberi suasana pada film: warna hangat untuk kenangan yang nyaman, warna dingin dan kebiruan untuk suasana tegang atau sedih, atau kontras tinggi untuk adegan yang dramatis. Grading adalah keputusan cerita, sama seperti editing: warna seharusnya memperkuat emosi yang sudah ada di adegan, bukan sekadar membuat gambar terlihat keren.

Urutan pengerjaannya penting. Warna dikerjakan setelah picture lock, yaitu setelah gambar dikunci dan tidak boleh berubah lagi. Mengerjakan warna sebelum gambar dikunci berarti mengulang pekerjaan setiap kali ada potongan yang berubah. Dalam alur kerja profesional, setelah picture lock barulah sound design, color grading, dan judul dikerjakan di atas gambar yang sudah final.

Ada batasnya: shot yang gelap masih bisa dicerahkan satu atau dua stop, tetapi shot yang terlalu terang dan kehilangan detail (overexposed) hampir tidak bisa dikembalikan. Karena itu selalu periksa exposure saat syuting, dan saat grading, kerjakan dengan mata yang segar: bandingkan shot pertama dan terakhir dalam satu adegan secara berdampingan, lalu periksa hasilnya di perangkat yang berbeda, karena warna bisa terlihat berbeda di HP dan di laptop.

Contoh: Ambil tiga shot dari adegan yang sama yang direkam di waktu berbeda: satu terlihat kekuningan, satu kebiruan, satu normal. Lakukan color correction dulu sampai ketiganya terlihat berasal dari ruangan yang sama, lalu beri grading yang sama pada ketiganya, misalnya sedikit hangat untuk suasana sore. Ekspor dan tonton di HP: kalau tidak ada shot yang meloncat warnanya, correction-mu berhasil.

Ringkasan: Color correction menyeragamkan warna antar shot, color grading memberi karakter dan suasana setelah warna seragam. Keduanya dikerjakan setelah picture lock supaya tidak diulang. Periksa hasilnya di beberapa perangkat, dan ingat bahwa shot yang overexposed hampir tidak bisa diselamatkan.

[Perlu ditinjau mentor]
$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('32000000-0000-4000-8000-000000000504', '22000000-0000-4000-8000-000000000005', 'Export dan format video', 4, NULL, $$
Tujuan: Setelah lesson ini, kamu bisa mengekspor film pendek dengan pengaturan yang benar, yaitu resolusi 1080p, frame rate yang sama dengan saat syuting, dan format MP4 H.264, serta menyimpan salinan master dan file project.

Penjelasan: Export adalah langkah terakhir yang mengubah project editingmu menjadi file video yang bisa ditonton orang lain. Pengaturan ekspor yang salah bisa merusak film yang sudah bagus: gambar tersendat, audio hilang, atau warna berubah. Karena itu periksa pengaturannya sebelum menekan tombol export, bukan sesudahnya.

Untuk film sekolah, standar ekspor yang aman adalah resolusi 1080p, yaitu 1920 kali 1080 piksel, frame rate yang sama dengan saat syuting, biasanya 24 atau 30 fps, dan format MP4 dengan codec H.264. Format ini bisa diputar di hampir semua perangkat dan diterima semua platform seperti YouTube dan TikTok. Jangan mencampur frame rate di dalam satu project: sebagian klip 24 fps dan sebagian 30 fps akan membuat gerakan tersendat di hasil akhir.

Sebelum mengekspor, lakukan uji tonton. Tunjukkan film ke dua atau tiga orang yang belum pernah membaca naskahmu, dan perhatikan bukan apa yang mereka katakan, melainkan kapan mereka melihat HP, kapan mereka tertawa, dan kapan mereka bertanya tadi itu siapa. Penonton yang bingung di menit pertama biasanya bingung karena informasi penting datang terlambat atau tidak pernah datang. Catat tiga hal dari uji tonton, perbaiki yang paling besar dulu, lalu uji lagi.

Setelah ekspor selesai, jangan langsung membagikan file itu. Tonton hasil ekspor sekali penuh dari awal sampai akhir, dan kalau bisa di perangkat lain. File project dan file ekspor bisa berbeda: audio bisa hilang atau warna berubah saat render. Kesalahan yang paling sering terjadi adalah mengekspor dengan audio yang terlalu pelan karena mengedit sambil memakai earphone dengan volume kecil. Periksa juga daftar ini: cerita bisa dipahami tanpa penjelasan, dialog jelas di speaker HP, musik tidak menenggelamkan dialog, warna antar shot seragam, judul dan credit ejaannya benar, dan durasi sesuai target.

Terakhir, simpan satu salinan master hasil ekspor dan satu salinan file project-nya, bukan hanya hasil ekspornya. Tanpa file project, kamu tidak bisa memperbaiki apa pun nanti.

Contoh: Ekspor film pendekmu dengan pengaturan 1080p, 24 fps, MP4 H.264. Tonton file hasil ekspor di HP temanmu dari awal sampai akhir dan catat tiga hal yang perlu diperbaiki. Perbaiki yang paling besar, ekspor ulang dengan nama versi baru, dan simpan file project serta master-nya di folder yang sama.

Ringkasan: Ekspor film sekolah dengan 1080p, frame rate yang sama dengan saat syuting, dan MP4 H.264. Lakukan uji tonton sebelum ekspor dan tonton hasil ekspor sekali penuh di perangkat lain sesudahnya. Simpan master dan file project, bukan hanya hasil ekspornya.
$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('32000000-0000-4000-8000-000000000505', '22000000-0000-4000-8000-000000000005', 'Praktik editing film pendek', 5, NULL, $$
Tujuan: Setelah lesson ini, kamu bisa menyelesaikan film pendek berdurasi 1 sampai 3 menit dari bahan adegan Course 3, lengkap dengan tiga versi editing, musik bebas lisensi, color grading dasar, dan poster sederhana.

Penjelasan: Proyek akhir course ini adalah film pendek 1 sampai 3 menit hasil editanmu sendiri dari adegan dialog Course 3. Film ini menutup Semester 1, jadi ia harus bisa ditonton orang yang belum pernah membaca naskahmu dan tetap dipahami. Serahkan file project dan tiga versi editing: assembly, rough cut, dan fine cut, ditambah musik bebas lisensi, color grading dasar, serta poster atau cover sederhana.

Mulailah dari studi kasus yang sudah kamu pelajari. Bayangkan bahanmu: adegan Rani dan Dimas di halte, enam setup, total bahan mentah 12 menit. Assembly-mu mungkin berdurasi 4 menit, terlalu panjang karena setiap take dimainkan penuh. Di rough cut pertama kamu membuang basa-basi pembuka dan satu pengulangan dialog, tersisa 2 menit 10 detik. Masih panjang. Lalu kamu menemukan masalah sebenarnya: titik balik adegan, yaitu HP yang bergetar, baru terjadi di menit ke-1:40, terlalu lambat. Di rough cut kedua, kamu memotong 40 detik pertama menjadi 15 detik: buka dengan close-up HP yang diam, potong ke medium shot Rani, lalu langsung ke dialog inti. Sekarang titik balik terjadi di detik ke-35 dan adegan berdurasi 1 menit 5 detik.

Di fine cut, kamu memoles detailnya: menahan close-up Rani dua detik lebih lama setelah HP bergetar karena emosi butuh waktu, memakai J-cut supaya suara bus terdengar sebelum gambarnya muncul, dan memotong ke reaction shot Dimas tepat saat Rani berkata aku tidak apa-apa, karena wajah Dimas yang tidak percaya itulah yang memberi tahu penonton bahwa Rani berbohong. Itulah editing: bukan memotong yang jelek, melainkan memilih momen yang benar.

Sebelum menyerahkan, nilai filmmu dengan lima kriteria. Cerita: bisa dipahami tanpa penjelasan dan klimaksnya terbayar. Potongan: cut bermakna dan emosi didahulukan. Ritme: panjang shot sesuai emosi, tidak ada bagian membosankan. Suara: dialog jelas dan musik mendukung tanpa menenggelamkan. Penyelesaian: picture lock dipatuhi, ekspor 1080p benar, dan file tersimpan rapi. Jumlahkan skormu dari 15: 13 sampai 15 berarti Semester 1 tuntas dengan baik, 10 sampai 12 berarti perbaiki satu kriteria terlemah, dan di bawah 10 berarti pilih satu masalah terbesar, biasanya cerita atau suara, dan perbaiki itu dulu.

Contoh: Kerjakan filmmu mengikuti langkah delapan tahap: import dan backup, organisasi, assembly, rough cut dengan target membuang minimal 30 persen durasi, transisi dan ritme, suara, warna dan judul, lalu ekspor. Uji tonton ke dua teman, catat tiga hal yang membingungkan mereka, perbaiki yang paling besar, lalu ekspor versi final dan buat poster sederhana untuk filmmu.

Ringkasan: Film pendek akhir berdurasi 1 sampai 3 menit dari adegan Course 3, diserahkan bersama tiga versi editing, musik bebas lisensi, grading dasar, dan poster. Rough cut adalah proses pengurangan sampai titik balik datang lebih cepat, fine cut memoles emosi lewat durasi shot dan J-cut. Nilai hasilnya dengan lima kriteria: cerita, potongan, ritme, suara, dan penyelesaian.
$$)
on conflict (id) do nothing;

-- ============================================================
-- COURSE 6 — Tata Suara dan Musik Film
-- ============================================================

insert into public.modules (id, course_id, title, order_index) values
  ('21000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000006', 'Section 1 — Minggu 1', 1)
on conflict (id) do nothing;

insert into public.modules (id, course_id, title, order_index) values
  ('22000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000006', 'Section 2 — Minggu 2', 2)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('31000000-0000-4000-8000-000000000601', '21000000-0000-4000-8000-000000000006', 'Pengenalan audio dalam film', 1, NULL, $$
Tujuan: Setelah lesson ini, kamu bisa menjelaskan mengapa suara adalah separuh dari pengalaman menonton film dan menyebutkan lima lapisan soundtrack film beserta fungsi masing-masing.

Penjelasan: Tutup matamu dan bayangkan adegan ini: seorang pelajar berjalan pulang melewati gang sempit di malam hari. Tanpa suara, yang kamu lihat hanyalah gambar orang berjalan. Tambahkan langkah kaki yang bergema, suara jangkrik, lalu denting musik pelan yang makin cepat, tiba-tiba adegan itu terasa menegangkan. Itulah kerja tata suara: separuh dari pengalaman menonton film sesungguhnya datang dari telinga, bukan mata.

Penonton biasanya memaafkan gambar yang sedikit goyang. Tetapi suara dialog yang tidak jelas, musik yang menutupi percakapan, atau suasana yang terdengar kosong akan langsung membuat penonton kehilangan minat. Karena itu, kru film profesional menempatkan perekam suara dan penata suara sebagai posisi kunci, sejajar dengan kamera. Suara yang direkam buruk hampir tidak bisa diperbaiki di editing, sedangkan gambar yang kurang terang masih bisa diselamatkan.

Setiap soundtrack film dibangun dari lapisan-lapisan yang bisa diperbaiki satu per satu tanpa merusak lapisan lain. Lima lapisan utamanya adalah dialog, yaitu kata-kata aktor dan jangkar campuran suara; ambience, yaitu suara suasana sebuah tempat seperti angin atau lalu lintas jauh yang memberi tahu penonton di mana adegan terjadi; efek suara, yaitu suara aksi dan benda tertentu seperti pintu dibanting atau gelas pecah; Foley, yaitu efek suara yang direkam ulang di studio pascaproduksi sambil menonton gambar, misalnya langkah kaki dan gesekan baju; dan musik, yaitu skor yang digubah khusus atau lagu yang sudah ada. Di atas semua itu ada keheningan: adegan tanpa suara setelah keramaian bisa terasa lebih kuat daripada musik keras.

Suara adalah getaran yang merambat lewat udara. Dua sifat gelombang yang wajib kamu pahami: frekuensi menentukan tinggi-rendahnya nada dan diukur dalam Hertz, sedangkan amplitudo menentukan keras-pelannya suara dan diukur dalam desibel. Percakapan normal sekitar 60 desibel, dan suara di atas 85 desibel dalam waktu lama bisa merusak pendengaran. Saat merekam, jaga puncak level tetap di bawah 0 desibel agar suara tidak pecah; patokan praktis untuk dialog adalah puncak di sekitar minus 12 sampai minus 6 desibel.

Contoh: Tonton satu adegan film favoritmu dua kali. Pertama dengan suara normal, kedua dengan mata tertutup. Catat suara apa saja yang kamu dengar: dialog, langkah, suasana, musik. Kamu akan kaget betapa ramainya soundtrack yang selama ini tidak kamu sadari, dan betapa banyak informasi cerita yang ternyata datang dari telinga.

Ringkasan: Suara adalah separuh pengalaman menonton: penonton memaafkan gambar goyang, tetapi tidak memaafkan dialog yang tidak jelas. Soundtrack terdiri dari lima lapisan, yaitu dialog, ambience, efek suara, Foley, dan musik, ditambah keheningan sebagai alat. Frekuensi menentukan nada dan amplitudo menentukan kekerasan suara, dengan puncak dialog yang aman di sekitar minus 12 sampai minus 6 desibel.
$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('31000000-0000-4000-8000-000000000602', '21000000-0000-4000-8000-000000000006', 'Jenis mikrofon dan fungsinya', 2, NULL, $$
Tujuan: Setelah lesson ini, kamu bisa menjelaskan lima pola tangkap mikrofon dan memilih mikrofon yang tepat berdasarkan situasi perekaman, dari wawancara sampai dialog di lokasi syuting.

Penjelasan: Pola tangkap atau polar pattern adalah peta arah dari mana mikrofon paling peka menangkap suara. Memilih pola yang salah sama saja dengan mengarahkan kamera ke arah yang salah. Ada lima pola yang perlu kamu kenal, dan masing-masing punya situasi terbaiknya.

Omnidirectional menangkap sama kuat dari semua arah, grafiknya berbentuk lingkaran. Pola ini cocok untuk suasana ruangan dan rekaman kelompok, saat sumber suara bergerak ke segala arah. Mikrofon lavalier atau mikrofon jepit umumnya omnidirectional, karena posisinya menempel di baju dan tidak selalu menghadap mulut.

Cardioid paling peka dari depan dan menolak suara dari belakang; bentuk grafiknya seperti hati. Pola ini paling umum dipakai untuk vokal, wawancara, dan podcast, karena ia menangkap suara orang yang ada di depannya sambil mengurangi suara dari belakang. Supercardioid dan hypercardioid adalah versi cardioid yang lebih sempit ke depan, dengan sedikit tangkapan dari belakang, dan cocok dipakai di tempat ramai.

Figure-of-eight atau bi-directional menangkap dari depan dan belakang, tetapi menolak suara dari samping. Pola ini cocok untuk wawancara dua orang yang berhadapan, karena satu mikrofon bisa menangkap kedua pembicara sekaligus.

Shotgun punya pola lobar yang sangat terarah ke depan berkat tabung interferensi, sehingga bisa merekam dialog bersih dari jarak jauh. Inilah mikrofon yang kamu lihat di ujung boom pole di lokasi syuting. Kelemahannya, ia harus dibidik tepat: sedikit meleset saja kualitasnya langsung turun.

Untuk film pelajar, mikrofon HP sebenarnya sudah cukup untuk latihan, asal jaraknya dekat dan lokasinya tenang. Tetapi untuk dialog penting, mikrofon eksternal tetap jauh lebih baik. Apapun mikrofonnya, prinsipnya sama: dekatkan mikrofon ke sumber suara, bukan menaikkan volumenya.

Contoh: Kamu merekam wawancara dua orang yang duduk berhadapan di kantin yang ramai. Mikrofon cardioid yang diarahkan ke satu orang akan menangkap banyak suara kantin dari samping, sedangkan figure-of-eight yang diletakkan di antara keduanya menangkap kedua pembicara dan menolak suara dari samping. Untuk dialog di lapangan yang luas, shotgun di ujung boom adalah pilihan yang tepat.

Ringkasan: Pola tangkap menentukan dari arah mana mikrofon mendengar. Omnidirectional menangkap dari semua arah dan cocok untuk suasana, cardioid menangkap dari depan untuk wawancara, figure-of-eight menangkap depan dan belakang untuk dua orang berhadapan, dan shotgun sangat terarah untuk dialog dari jarak jauh. Pilih pola yang sesuai situasi, dan selalu dekatkan mikrofon ke sumber suara.
$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('31000000-0000-4000-8000-000000000603', '21000000-0000-4000-8000-000000000006', 'Teknik recording dialog', 3, NULL, $$
Tujuan: Setelah lesson ini, kamu bisa merekam dialog yang bersih di lokasi dengan teknik boom dan lavalier, termasuk menjaga jarak mikrofon yang benar dan memantau hasil rekaman dengan headphone.

Penjelasan: Dialog adalah jangkar campuran suara film: kalau penonton kehilangan satu kalimat penting, semua kerja lain terasa sia-sia. Karena itu dialog harus direkam sebaik mungkin di lokasi. Satu take yang suaranya rusak tidak bisa diperbaiki dengan editing, jadi teknik merekam yang benar jauh lebih penting daripada alat editing yang canggih.

Teknik pertama adalah boom, yaitu mikrofon shotgun di ujung tongkat yang dipegang di atas kepala aktor, di luar frame, mengarah ke mulut. Jarak ideal sekitar 30 sampai 60 cm dari mulut. Operator boom harus sabar dan kuat: lengan pegal itu wajar. Boom memberi suara yang natural karena mikrofon berada di udara, bukan menempel di badan, dan ia bisa berpindah mengikuti aktor yang bergerak.

Teknik kedua adalah lavalier, yaitu mikrofon kecil yang dijepit di baju, dekat mulut. Lavalier praktis untuk adegan bergerak dan untuk aktor yang berjalan jauh dari kamera, tetapi rawan bunyi gesekan kain. Selalu uji dulu sebelum take: minta aktor bergerak seperti saat adegan berjalan, dan dengarkan apakah ada bunyi kain yang mengganggu. Kalau ada, pindahkan posisi jepit atau selipkan pelindung di antara mikrofon dan kain.

Jarak adalah segalanya. Mikrofon yang terlalu jauh menangkap lebih banyak gema ruangan daripada suara aktor, sehingga dialog terdengar bergema dan jauh. Itu juga sebabnya dialog yang direkam di ruangan kosong berdinding keras sering bermasalah: tambahkan benda penyerap suara seperti gorden, kasur, atau karpet, dan dekatkan mikrofonnya. Jangan pernah mengandalkan menaikkan volume untuk menambal mikrofon yang jauh.

Tiga kebiasaan yang wajib dilakukan di setiap sesi rekaman. Pertama, cek dengan headphone, jangan percaya meter level saja. Dengarkan: ada dengung AC, ada motor lewat, ada suara angin? Pasang windscreen berbulu saat merekam di luar ruangan. Kedua, rekam cadangan kalau bisa, misalnya dengan perekam HP sebagai pengaman. Ketiga, jaga level puncak dialog di sekitar minus 12 sampai minus 6 desibel, karena puncak yang menyentuh 0 desibel akan pecah dan tidak bisa diperbaiki.

Contoh: Rekam dialog yang sama dua kali dengan HP: sekali dari jarak 2 meter, sekali dari jarak 30 cm. Dengarkan perbedaannya dengan headphone dan tulis: mana yang dialognya lebih jelas, mana yang gemanya lebih terasa, dan suara ruangan apa yang ikut terekam di tiap versi. Pengalaman ini akan mengubah caramu menempatkan mikrofon selamanya.

Ringkasan: Dialog direkam bersih di lokasi dengan boom dari jarak 30 sampai 60 cm atau lavalier yang dijepit di baju dan diuji dulu dari gesekan kain. Jarak menentukan segalanya: mikrofon jauh menangkap gema, bukan suara aktor. Selalu pantau dengan headphone, rekam cadangan, dan jaga puncak level di sekitar minus 12 sampai minus 6 desibel.
$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('31000000-0000-4000-8000-000000000604', '21000000-0000-4000-8000-000000000006', 'Ambient sound dan room tone', 4, NULL, $$
Tujuan: Setelah lesson ini, kamu bisa menjelaskan fungsi ambient sound dan room tone, merekam room tone di setiap lokasi, dan memakainya di editing supaya potongan dialog tidak terdengar seperti bunyi klik.

Penjelasan: Ambience adalah suara suasana sebuah tempat: angin, lalu lintas jauh, dengung AC, suara jangkrik di malam hari. Lapisan ini memberi tahu penonton di mana adegan terjadi, tanpa perlu penjelasan. Adegan di kantin terdengar ramai, adegan di perpustakaan terdengar hening dan jauh, adegan di jalan raya terdengar bising. Tanpa ambience, adegan terasa kosong dan palsu, seperti tokoh yang berbicara di ruang hampa.

Di atas ambience ada room tone, yaitu suara dasar ruangan yang direkam di lokasi, biasanya 30 sampai 60 detik di awal atau akhir hari syuting, saat semua orang diam. Room tone terdengar seperti diam, tetapi sebenarnya tidak pernah diam: ada bunyi AC, kipas, jalan di luar, dan dengung listrik. Editor memakai room tone untuk menambal potongan dialog, supaya pergantian gambar tidak terdengar seperti bunyi klik atau keheningan digital yang aneh. Penonton tidak akan sadar room tone ada, tetapi mereka akan sadar kalau ia tidak ada.

Cara merekamnya sederhana: setelah adegan selesai, minta semua orang diam selama 30 sampai 60 detik dan rekam suara ruangan itu dengan mikrofon dan posisi yang sama seperti saat merekam dialog. Lakukan di setiap lokasi dan setiap kali suasana ruangan berubah, misalnya AC dimatikan atau jendela dibuka. Beri nama file yang jelas, misalnya Adegan1_RoomTone_Halte.mp4, supaya editor mudah menemukannya.

Di editing, room tone diletakkan di track audio tersendiri di bawah dialog, dengan level yang sangat pelan, dan dipanjangkan mengikuti durasi adegan. Kalau ada bunyi yang mengganggu saat merekam dialog, seperti kipas atau AC yang tidak bisa dimatikan, rekam room tone-nya agar editor bisa mengurangi noise secara konsisten di seluruh adegan.

Contoh: Rekam tiga suasana berbeda, yaitu kantin, jalan raya, dan perpustakaan, masing-masing 30 detik hanya dengan HP. Dengarkan kembali dan tulis: suara apa yang paling dominan di tiap tempat, dan bagaimana perasaanmu berubah saat mendengarnya. Lalu rekam room tone di kamarmu selama 30 detik dan putar dengan volume besar: itulah diam yang sebenarnya tidak pernah diam.

Ringkasan: Ambience memberi identitas lokasi dan membuat adegan terasa nyata, sedangkan room tone adalah suara dasar ruangan yang direkam 30 sampai 60 detik di setiap lokasi untuk menambal potongan dialog. Tanpa keduanya, adegan terdengar kosong dan potongan terdengar seperti bunyi klik. Rekam room tone di setiap lokasi dan beri nama file yang jelas.
$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('31000000-0000-4000-8000-000000000605', '21000000-0000-4000-8000-000000000006', 'Foley dan sound effects', 5, NULL, $$
Tujuan: Setelah lesson ini, kamu bisa membedakan Foley dan efek suara biasa, menjelaskan fungsi masing-masing, dan membuat satu efek Foley sendiri yang sinkron dengan gambar.

Penjelasan: Efek suara atau sound effects adalah suara aksi dan benda tertentu: pintu dibanting, gelas pecah, motor lewat, hujan turun. Efek ini memberi informasi tentang apa yang terjadi di layar dan membuat aksi terasa nyata. Sebagian efek direkam di lokasi bersama gambar, tetapi banyak juga yang ditambahkan atau diganti di pascaproduksi karena suara lokasi terlalu berisik atau tidak cukup jelas.

Foley adalah jenis efek suara yang istimewa: ia direkam ulang di studio pascaproduksi sambil menonton gambar, mengikuti gerakan tokoh frame demi frame. Misalnya langkah kaki, gesekan baju, dan benda yang dipegang. Foley memberi rasa fisik dan dekat pada adegan: penonton tidak hanya melihat tokoh berjalan, tetapi merasakan berat langkahnya, permukaan yang diinjak, dan jaraknya dari kamera. Tanpa Foley, adegan sering terasa ringan dan jauh, seperti tokoh yang melayang.

Perbedaan keduanya terletak pada cara dan tujuannya. Efek suara biasa sering diambil dari pustaka suara atau direkam terpisah, lalu ditempelkan ke momen tertentu. Foley selalu dibuat sambil menonton gambar, supaya setiap bunyi sinkron dengan gerakan yang terlihat. Karena itu Foley adalah pekerjaan yang teliti: seniman Foley menonton adegan berulang kali dan mengulang gerakannya sampai bunyinya terasa menyatu dengan gambar.

Foley juga murah dan bisa kamu lakukan sendiri. Langkah kaki di lantai, tanah, dan kerikil terdengar sangat berbeda, dan ketiganya bisa direkam dengan HP di halaman sekolah. Gesekan baju bisa direkam dengan menggerakkan kain di depan mikrofon. Kuncinya adalah menonton gambar sambil merekam, supaya ritme bunyinya mengikuti ritme gerakan di layar.

Contoh: Buat satu efek Foley sendiri. Rekam langkah kaki di tiga permukaan berbeda, yaitu lantai, tanah, dan kerikil, masing-masing selama 10 detik. Pasangkan tiap rekaman ke video langkah kaki yang sama dan tonton ketiganya. Perhatikan bagaimana permukaan yang berbeda mengubah kesan adegannya: lantai terasa di dalam ruangan, kerikil terasa di luar dan tergesa-gesa.

Ringkasan: Efek suara adalah bunyi aksi dan benda seperti pintu atau motor, sedangkan Foley adalah efek yang direkam ulang di studio sambil menonton gambar, seperti langkah kaki dan gesekan baju. Foley memberi rasa fisik dan dekat pada adegan. Keduanya bisa dibuat sendiri dengan HP, asal direkam sambil menonton gambar supaya sinkron.
$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('32000000-0000-4000-8000-000000000601', '22000000-0000-4000-8000-000000000006', 'Dialog editing dan noise reduction', 1, NULL, $$
Tujuan: Setelah lesson ini, kamu bisa membersihkan dialog di timeline, mengurangi noise yang mengganggu, menambal potongan dengan room tone, dan mengetahui kapan dialog harus direkam ulang lewat ADR.

Penjelasan: Dialog editing adalah pekerjaan merapikan semua rekaman percakapan menjadi satu alur yang bersih dan mudah diikuti. Langkah pertamanya adalah memilih take terbaik untuk setiap kalimat, lalu memotong bagian yang rusak: jeda yang terlalu panjang, bunyi napas yang mengganggu, atau kata yang tertutup suara lain. Potonglah di jeda napas atau di gerakan, bukan di tengah kata, supaya penonton tidak kehilangan informasi.

Langkah kedua adalah mengurangi noise. Noise adalah bunyi latar yang tidak diinginkan, misalnya dengung AC, desis kipas, atau suara jalan. Pencegahan selalu lebih baik daripada perbaikan: matikan AC atau kipas saat merekam dialog kalau bisa, dan dekatkan mikrofon ke aktor. Kalau noise sudah terlanjur terekam, alat noise reduction di aplikasi editing bisa menguranginya, tetapi ada batasnya. Pengurangan yang berlebihan membuat suara terdengar seperti di dalam kaleng atau seperti robot, jadi kurangi secukupnya dan dengarkan hasilnya dengan headphone.

Trik yang paling sering menyelamatkan dialog adalah room tone. Selipkan rekaman room tone di bawah potongan dialog supaya pergantian gambar tidak terdengar seperti bunyi klik dan keheningan digital yang aneh. Selain itu, samakan level volume antar shot, karena dialog yang tiba-tiba pelan atau keras akan langsung disadari penonton. Periksa juga potongan yang menutupi take rusak: kalau take terbaik aktor A rusak di tengah kalimat, potong ke wajah aktor B yang mendengarkan dan biarkan audio A tetap berjalan di bawahnya, penonton akan mengira potongan itu disengaja.

Kalau dialog di lokasi sudah rusak parah dan tidak bisa diperbaiki, solusinya adalah ADR, yaitu Automated Dialogue Replacement: dialog direkam ulang di studio yang sunyi sambil menonton gambar, sampai gerak bibir dan bunyinya sinkron. ADR adalah pekerjaan profesional yang butuh latihan, tetapi penting untuk kamu ketahui sebagai pilihan terakhir. Dan satu kejujuran yang perlu dipegang: audio yang pecah karena level melewati 0 desibel (clipping) tidak bisa diperbaiki, karena suaranya sudah hilang. Lebih baik merekam sedikit pelan daripada pecah.

Contoh: Ambil satu klip dialog yang ada dengung AC pelan di latarnya. Buat dua versi: versi pertama dibiarkan apa adanya, versi kedua diberi noise reduction ringan dan ditambah room tone di bawah potongannya. Putar keduanya di speaker HP dan di headphone, lalu tulis mana yang dialognya lebih jelas dan apakah versi kedua terdengar natural atau justru seperti robot.

Ringkasan: Dialog editing dimulai dari memilih take terbaik dan memotong di jeda napas, lalu mengurangi noise secukupnya tanpa membuat suara terdengar artifisial. Room tone menambal potongan supaya tidak berbunyi klik, dan level dialog disamakan antar shot. Kalau dialog rusak parah, rekam ulang lewat ADR, dan ingat bahwa audio yang clipping tidak bisa diperbaiki.

[Perlu ditinjau mentor]
$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('32000000-0000-4000-8000-000000000602', '22000000-0000-4000-8000-000000000006', 'Musik latar dan emotional scoring', 2, NULL, $$
Tujuan: Setelah lesson ini, kamu bisa menjelaskan fungsi musik dalam film, membedakan musik diegetik dan non-diegetik, serta memilih musik latar yang mendukung emosi adegan dan aman dari sisi hak cipta.

Penjelasan: Musik adalah jalan paling langsung menuju emosi penonton. Ia bisa menandai waktu dan tempat, mengungkap perasaan yang tidak diucapkan tokoh, membangun ketegangan, menjaga kesinambungan antar potongan, mengatur tempo editing, dan memberi sinyal genre. Karena itu, pikirkan musik sejak praproduksi, bukan sebagai tempelan terakhir yang dipasang saat film hampir selesai.

Kenali dua jenis musik film. Musik diegetik atau source music berasal dari dalam dunia cerita dan bisa didengar tokohnya: radio mobil, band di pesta, seseorang bernyanyi di kamar. Musik non-diegetik atau skor hanya didengar penonton: orkestra yang mengiringi adegan sedih, padahal tokohnya tidak mendengar apa-apa. Banyak film berpindah di antara keduanya, misalnya lagu radio yang membesar menjadi skor saat kamera menjauh dari mobil.

Skor adalah musik yang digubah khusus untuk filmmu, biasanya tanpa lirik agar tidak bersaing dengan dialog. Soundtrack adalah kumpulan lagu, asli atau berlisensi, yang muncul di film. Musik temp atau temp track adalah musik sementara yang dipasang editor saat merakit potongan awal. Temp berguna sebagai alat komunikasi, tetapi berbahaya: sutradara bisa jatuh cinta pada temp, yang disebut temp love, sampai skor asli terasa salah, dan temp yang tidak berizin bisa lolos ke penayangan publik dan menimbulkan masalah hukum.

Tiga prinsip memakai musik. Pertama, musik seharusnya mendukung emosi yang sudah ada di adegan, bukan menciptakannya dari nol: adegan yang tidak sedih tidak menjadi sedih hanya karena musiknya sedih. Kedua, musik yang masuk di momen yang tepat, misalnya tepat setelah kalimat penting, terasa jauh lebih kuat daripada musik yang berbunyi terus dari awal sampai akhir. Ketiga, perhatikan hak cipta: memakai lagu terkenal butuh izin sinkronisasi dan izin rekaman masternya. Untuk film pelajar, jalan amannya adalah musik orisinal dari teman, atau musik royalty-free dan berlisensi Creative Commons dari pustaka tepercaya, dan simpan bukti lisensinya.

Contoh: Ambil satu adegan bisu berdurasi 60 detik dari film pendekmu. Buat tiga versi musik: musik ceria, musik tegang, dan tanpa musik sama sekali. Tonton ketiganya dan tulis bagaimana perasaanmu berubah di tiap versi. Latihan ini membuktikan bahwa musik yang sama bisa mengubah cerita, dan bahwa adegan yang kuat seharusnya tetap bekerja meski tanpa musik.

Ringkasan: Musik menandai waktu dan tempat, mengungkap perasaan tokoh, membangun ketegangan, dan mengatur tempo editing. Musik diegetik terdengar oleh tokoh, sedangkan skor non-diegetik hanya didengar penonton. Musik mendukung emosi yang sudah ada dan masuk di momen yang tepat, dan untuk film pelajar selalu pakai musik orisinal atau berlisensi bebas dengan bukti lisensi yang disimpan.
$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('32000000-0000-4000-8000-000000000603', '22000000-0000-4000-8000-000000000006', 'Audio mixing dan balancing', 3, NULL, $$
Tujuan: Setelah lesson ini, kamu bisa melakukan mixing dasar, yaitu mengatur level dialog, musik, ambience, dan efek suara menjadi satu hasil akhir yang seimbang dan jelas di HP maupun headphone.

Penjelasan: Mixing adalah proses menyeimbangkan semua trek suara menjadi satu hasil akhir. Dalam film profesional, alur kerjanya berjalan seperti ini: rekam suara produksi yang bersih di lokasi termasuk room tone, kunci gambar setelah editing selesai, lalu adakan spotting session, yaitu menonton film bersama dan mencatat kebutuhan suara adegan demi adegan. Setelah itu editor suara merakit trek dialog, efek, ambience, dan Foley, lalu dilakukan pra-campur per kelompok suara, dan akhirnya final mix oleh re-recording mixer yang menyeimbangkan semuanya. Pada film pendek sekolah, kamu melakukan semua langkah ini sendiri, tetapi urutannya tetap sama.

Aturan pertama mixing: dialog dulu, sisanya mengikuti. Atur level dialog sampai jelas, baru masukkan musik dan efek di bawahnya. Dialog adalah jangkar campuran suara, jadi kalau penonton kehilangan satu kalimat penting, semua kerja lain terasa sia-sia. Turunkan musik 2 sampai 4 desibel di bawah dialog saat ada percakapan. Penonton tidak akan sadar penurunan kecil itu, tetapi dialog jadi jauh lebih mudah dipahami.

Aturan kedua: beri ruang. Jangan biarkan musik dan ambience berbunyi penuh terus-menerus; keheningan sesaat membuat momen penting terasa lebih besar. Musik yang tidak pernah berhenti membuat penonton kebal terhadapnya, dan sunyi yang disengaja adalah alat yang kuat. Gunakan fade masuk dan keluar selama 1 sampai 2 detik supaya musik yang muncul dan hilang tidak terdengar kasar.

Aturan ketiga: cek di dua perangkat. Dengarkan hasil mix di headphone dan di speaker HP. Kalau dialog jelas di keduanya, mix-mu aman. Banyak editor pemula hanya mengecek dengan earphone bervolume kecil, lalu hasil akhirnya terlalu pelan saat diputar di speaker HP. Untuk film sekolah, level akhir sekitar minus 14 LUFS untuk platform seperti YouTube adalah patokan yang aman, tetapi yang terpenting adalah dialog tetap jelas di perangkat apa pun.

Contoh: Susun rantai audio lengkap untuk satu adegan: dialog, room tone, satu efek suara, dan satu musik. Atur levelnya dengan urutan ini: dialog dulu sampai jelas, lalu turunkan musik 2 sampai 4 desibel di bawah dialog, lalu letakkan ambience dan efek pelan di bawah keduanya. Ekspor dan minta dua teman menilai: apakah dialognya jelas di HP dan di headphone?

Ringkasan: Mixing menyeimbangkan semua trek suara setelah picture lock, diawali spotting session yang memetakan kebutuhan suara tiap adegan. Dialog diatur dulu dan paling jelas, musik diturunkan 2 sampai 4 desibel di bawah dialog, dan keheningan diberi ruang dengan fade yang halus. Selalu cek hasil mix di headphone dan di speaker HP.
$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('32000000-0000-4000-8000-000000000604', '22000000-0000-4000-8000-000000000006', 'Sinkronisasi audio-video', 4, NULL, $$
Tujuan: Setelah lesson ini, kamu bisa menjelaskan mengapa audio dan video harus sinkron, menyinkronkan rekaman suara terpisah dengan gambar, dan memperbaiki ketidaksinkronan kecil di timeline.

Penjelasan: Sinkronisasi audio-video berarti suara dan gambar terjadi pada saat yang sama, seperti yang terjadi di dunia nyata: bibir bergerak tepat saat kata terucap, langkah kaki terdengar tepat saat kaki menyentuh tanah, dan pintu berbunyi tepat saat gagang diputar. Otak manusia sangat peka terhadap ketidaksesuaian ini. Dialog yang meleset hanya beberapa frame saja sudah terasa aneh, seperti menonton film yang di-dubbing dengan buruk. Karena itu sinkronisasi adalah fondasi dari semua pekerjaan suara.

Masalah sinkronisasi muncul karena suara dan gambar sering direkam oleh perangkat yang berbeda. Misalnya kamera merekam gambar, sedangkan perekam audio terpisah merekam dialog dengan kualitas lebih baik. Di editing, kedua rekaman ini harus disatukan. Cara yang paling mudah adalah dengan clapperboard atau tepukan tangan di awal take: bunyi tepuk yang tajam terlihat jelas di gambar dan terdengar jelas di bentuk gelombang audio, sehingga editor bisa menyelaraskan keduanya dengan tepat. Tanpa penanda seperti itu, menyelaraskan rekaman terpisah menjadi pekerjaan menebak-nebak yang melelahkan.

Di aplikasi editing, sinkronisasi dilakukan di tahap assembly, sebelum memotong. Sejajarkan puncak gelombang audio dari perekam eksternal dengan audio dari kamera, lalu kunci keduanya menjadi satu klip yang tersinkron. Setelah itu barulah kamu memotong dan menyusun cerita. Kalau kamu memotong dulu baru menyinkronkan, pekerjaanmu akan berantakan.

Ketidaksinkronan kecil bisa diperbaiki dengan menggeser klip audio beberapa frame ke kiri atau kanan, atau dengan memakai alat sinkronisasi otomatis yang membandingkan bentuk gelombang. Tetapi ada batasnya: rekaman yang direkam dengan frame rate berbeda, misalnya sebagian 24 fps dan sebagian 30 fps, akan meleset makin jauh seiring durasi, dan harus diperbaiki di sumbernya. Karena itu biasakan memberi penanda tepuk di setiap take dan menjaga frame rate tetap sama dari syuting sampai ekspor.

Contoh: Rekam satu kalimat dialog dengan HP sebagai kamera dan perekam suara lain sebagai perekam audio, diawali tepukan tangan. Di aplikasi editing, sejajarkan puncak tepukan di bentuk gelombang kedua rekaman itu, lalu putar hasilnya. Kalau bibir dan suara bergerak bersamaan, sinkronisasi-mu berhasil. Sekarang geser audio lima frame ke kanan dan putar lagi, untuk merasakan betapa cepatnya ketidaksinkronan merusak adegan.

Ringkasan: Sinkronisasi berarti suara dan gambar terjadi pada saat yang sama, dan otak penonton sangat peka terhadap melesetnya. Gunakan clapperboard atau tepukan tangan sebagai penanda di setiap take, sejajarkan bentuk gelombang di tahap assembly sebelum memotong, dan jaga frame rate tetap sama dari syuting sampai ekspor.

[Perlu ditinjau mentor]
$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('32000000-0000-4000-8000-000000000605', '22000000-0000-4000-8000-000000000006', 'Praktik sound design', 5, NULL, $$
Tujuan: Setelah lesson ini, kamu bisa membangun seluruh soundscape berdurasi 90 detik dari nol untuk satu klip bisu, lengkap dengan daftar trek yang menjelaskan setiap lapisan suara dan sumbernya.

Penjelasan: Proyek mini akhir course ini adalah soundscape 90 detik. Ambil satu klip bisu berdurasi 90 detik, boleh rekamanmu sendiri atau klip latihan, dan bangun seluruh suaranya dari nol: dialog atau voice-over, ambience, minimal tiga efek Foley, dan satu musik. Serahkan file video hasil mix beserta daftar trek atau track list yang menjelaskan setiap lapisan suara dan dari mana asalnya.

Rancangan terbaik dimulai dari studi kasus adegan tanpa dialog. Bayangkan adegan 30 detik: seorang pelajar membuka surat pengumuman beasiswa. Tidak ada dialog sama sekali. Coba rancang lapisannya: ambience ruang kelas yang sepi, suara kertas yang dibuka pelan, detak jam dinding, lalu satu nada piano yang masuk tepat saat matanya membesar. Di titik inilah desain suara bekerja paling murni: penonton memahami seluruh emosi tanpa satu kata pun. Sekarang bandingkan dengan adegan yang sama tetapi dengan musik riang yang keras sejak detik pertama: emosinya berubah total. Pelajaran di sini adalah musik yang dipasang terlalu awal memberi tahu penonton apa yang harus dirasakan, sebelum mereka sempat merasakannya sendiri. Penata suara yang baik menahan musik sampai momen yang tepat.

Kerjakan soundscape-mu mengikuti rantai audio yang benar. Mulai dari rekaman yang bersih, kunci gambar dulu, lalu adakan spotting session sendiri: tonton klip bisu itu dan catat kebutuhan suara adegan demi adegan. Rakit trek dialog, ambience, efek, dan Foley, lalu lakukan mixing dengan urutan dialog dulu, musik 2 sampai 4 desibel di bawah dialog, fade yang halus, dan cek di headphone serta speaker HP.

Penilaian proyek ini memakai empat aspek. Kejelasan dialog berbobot 30 persen: setiap kata terdengar jelas di headphone dan speaker HP. Ambience dan Foley berbobot 30 persen: suasana terasa hidup, langkah dan benda terdengar sinkron dengan gambar. Musik berbobot 20 persen: mendukung emosi tanpa menutupi dialog, dan lisensinya jelas. Mixing berbobot 20 persen: level rata, fade halus, tidak ada suara pecah atau bunyi klik. Sebelum menyerahkan, periksa daftar ini: apakah musikmu orisinal atau berlisensi bebas, apakah musiknya bersaing dengan dialog, apakah cocok dengan waktu dan tempat cerita, dan apakah kamu sudah mencoba adegan itu tanpa musik.

Contoh: Ambil klip bisu 90 detik dari film pendekmu sendiri. Buat track list seperti ini: track 1 dialog atau voice-over, track 2 ambience kantin, track 3 langkah kaki Foley di lantai, track 4 suara pintu dan kertas, track 5 musik piano yang masuk di detik ke-60. Rekam Foley-mu sendiri dengan HP, susun semuanya di timeline, ekspor, dan minta dua teman menilai dengan empat aspek di atas.

Ringkasan: Soundscape 90 detik dibangun dari nol dengan dialog, ambience, minimal tiga Foley, dan satu musik, diserahkan bersama track list yang menjelaskan tiap lapisan. Rancang lewat spotting session, tahan musik sampai momen yang tepat, dan mix dengan dialog paling jelas. Nilai hasilnya dari empat aspek: kejelasan dialog, ambience dan Foley, musik, serta mixing.
$$)
on conflict (id) do nothing;

-- SINEVERSE Academy Stage 1 — Seed data: Courses 7 & 8
-- Course 7: Film Dokumenter (RPS order 7)
-- Course 8: Mengenal Jobdesk Crew Film (RPS order 8)
-- Each course: 2 sections (Minggu 1 & Minggu 2), 5 lessons per section.
-- Sources: 06-Modul-Film-Dokumenter.pdf and 10-Modul-Mengenal-Jobdesk-Crew-Film.pdf
-- Lesson content format: Tujuan / Penjelasan / Contoh / Ringkasan (plain text).

-- ============ COURSE 7: Film Dokumenter ============
insert into public.modules (id, course_id, title, order_index) values
('21000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000007', 'Section 1 — Minggu 1', 1)
on conflict (id) do nothing;

insert into public.modules (id, course_id, title, order_index) values
('22000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000007', 'Section 2 — Minggu 2', 2)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000701', '21000000-0000-4000-8000-000000000007', 'Pengenalan film dokumenter', 1, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu mampu menjelaskan apa itu film dokumenter, membedakannya dari film fiksi, dan memahami janji kejujuran yang dibawa sebuah dokumenter kepada penontonnya.

Penjelasan:
Film fiksi mengajak penonton percaya pada dunia yang dibuat-buat. Film dokumenter melakukan hal sebaliknya: ia mengajak penonton percaya pada dunia yang nyata. Bedanya bukan pada kamera atau editing, melainkan pada janji. Dokumenter berjanji bahwa orang, tempat, dan peristiwa di layar sungguh ada. Janji itulah yang membuat dokumenter kuat, dan juga yang membuat tanggung jawab pembuatnya jauh lebih besar.

Nyata tidak berarti tanpa campur tangan. Pembuat dokumenter memilih siapa yang diwawancarai, dari sudut mana kamera diletakkan, dan potongan mana yang dipakai. Kejujuran dokumenter bukan berarti tidak ada pilihan kreatif, melainkan pilihan-pilihan itu tidak boleh memutarbalikkan fakta. Aturan praktisnya: kalau sebuah potongan membuat penonton menyimpulkan hal yang berlawanan dengan kenyataan, potongan itu tidak jujur, sebagus apa pun gambarnya.

Dokumenter bukan sekadar merekam apa adanya. Setiap dokumenter memilih sudut pandang, memilih apa yang ditunjukkan dan apa yang disembunyikan, dan menyusun kenyataan menjadi cerita. Karena itu dokumenter yang baik lahir dari riset yang kuat, bukan dari kamera yang mahal. Contoh klasiknya adalah Nanook of the North (1922) karya Robert Flaherty tentang kehidupan Inuit. Beberapa adegannya ternyata diarahkan, bukan spontan, sehingga sampai hari ini orang masih memperdebatkan apakah adegan yang diarahkan mengurangi kejujuran sebuah dokumenter.

Dalam dua minggu ini kamu akan belajar mengenali mode dokumenter, melakukan riset yang bisa dipertanggungjawabkan, mewawancarai narasumber dengan etis, dan menyusun dokumenter mini pertamamu. Bekal terpentingnya bukan peralatan mahal, melainkan rasa ingin tahu dan sikap jujur terhadap fakta.

Contoh:
Pilih satu dokumenter pendek di YouTube, misalnya tentang kehidupan sehari-hari di kotamu. Tonton sampai selesai, lalu jawab dalam tiga kalimat: apa yang film itu janjikan sebagai kenyataan, dan apakah kamu mempercayainya? Tulis satu momen yang menurutmu paling meyakinkan dan satu momen yang membuatmu ragu, beserta alasannya.

Ringkasan:
Dokumenter adalah film nonfiksi yang berjanji bahwa orang, tempat, dan peristiwa di layar sungguh ada. Pilihan kreatif tetap boleh dilakukan, tetapi tidak boleh memutarbalikkan fakta. Dokumenter yang baik lahir dari riset yang kuat dan sikap jujur terhadap kenyataan.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000702', '21000000-0000-4000-8000-000000000007', 'Jenis dan gaya dokumenter', 2, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu mampu menjelaskan enam mode dokumenter menurut Bill Nichols dan memilih mode yang paling cocok untuk cerita yang ingin kamu sampaikan.

Penjelasan:
Teoretisi dokumenter Bill Nichols, dalam buku Representing Reality (1991) dan Introduction to Documentary, membedakan enam mode, yaitu cara-cara berbeda dalam menyusun kebenaran di layar. Mode-mode ini bukan genre yang kaku: satu film bisa memakai lebih dari satu mode, tetapi biasanya ada satu mode yang paling dominan.

Mode puitis mengutamakan suasana, ritme, dan asosiasi daripada argumen atau kronologi. Contoh klasiknya adalah Koyaanisqatsi (1982), film tanpa narasi tentang kehidupan modern yang hanya mengandalkan gambar dan musik. Mode ekspositori menyampaikan argumen atau informasi lewat narasi suara (voice-over) yang otoritatif, dengan gambar sebagai penguat. Inilah mode dokumenter televisi klasik yang paling sering kamu temui.

Mode observasi membuat kamera mengintip tanpa campur tangan, tanpa voice-over dan tanpa wawancara. Aliran ini disebut juga direct cinema atau fly on the wall, lalat di dinding. Contohnya film-film Frederick Wiseman tentang institusi. Mode partisipatori justru sebaliknya: pembuat film berinteraksi langsung dengan subjek, biasanya lewat wawancara, sehingga peristiwa di depan kamera menjadi cermin interaksi antara pembuat film dan subjeknya. Contohnya Chronique d'un ete (1961).

Dua mode terakhir lebih eksperimental. Mode refleksif mempertanyakan proses pembuatan dokumenter itu sendiri dan hubungan pembuat film dengan penonton. Contoh paling terkenal adalah Man with a Movie Camera (1929) karya Dziga Vertov yang memperlihatkan proses syuting dan editing di dalam filmnya sendiri. Mode performatif mengutamakan pengalaman subjektif dan emosional pembuat film; kebenaran yang dibangun bersifat pribadi dan dirasakan, seperti dalam Tongues Untied (1989).

Cara cepat memilih mode adalah bertanya pada dirimu sendiri: apa yang paling ingin penonton rasakan dan pahami? Kalau jawabannya fakta yang jelas, pakai ekspositori. Kalau merasakan langsung kejadiannya, pakai observasi. Kalau mendengar langsung dari orangnya, pakai partisipatori.

Contoh:
Tonton satu dokumenter pendek dan tebak mode Nichols yang paling dominan. Tulis tiga bukti dari film itu yang mendukung tebakanmu, misalnya ada tidaknya voice-over, apakah pembuat film muncul di layar, dan apakah kamera terasa mengintip atau berinteraksi. Lalu bayangkan ceritamu sendiri: mode apa yang akan kamu pakai dan mengapa?

Ringkasan:
Enam mode dokumenter menurut Bill Nichols adalah puitis, ekspositori, observasi, partisipatori, refleksif, dan performatif. Setiap mode menyusun kebenaran dengan cara berbeda dan bisa digabung dalam satu film. Pilih mode berdasarkan apa yang paling ingin penonton rasakan dan pahami.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000703', '21000000-0000-4000-8000-000000000007', 'Menentukan topik dan isu', 3, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu mampu merumuskan pertanyaan riset yang baik tentang kehidupan di sekitarmu dan menjelaskan mengapa dokumenter harus berawal dari pertanyaan, bukan dari jawaban.

Penjelasan:
Dokumenter yang kuat selalu berawal dari pertanyaan, bukan dari jawaban. "Kenapa kantin sekolah selalu ramai padahal harganya naik?" adalah pertanyaan yang bagus. "Kantin sekolah itu mahal" adalah kesimpulan yang membosankan. Pertanyaan yang bagus membuatmu penasaran, dan rasa penasaran itu yang akan menular ke penonton.

Topik terbaik biasanya ada di dekatmu: sekolah, kampung, tempat kerja orang tuamu, atau komunitasmu. Kamu tidak perlu mencari isu besar berskala nasional untuk film pertamamu. Isu kecil yang kamu pahami betul sering kali menghasilkan film yang jauh lebih jujur daripada isu besar yang hanya kamu baca dari berita. Yang penting, topik itu punya orang-orang nyata yang terdampak dan punya sesuatu yang belum terjawab.

Pertanyaan yang baik punya tiga ciri. Pertama, ia terbuka: jawabannya belum kamu ketahui. Kedua, ia spesifik: cukup sempit untuk dijawab dalam film berdurasi 2-3 menit. Ketiga, ia penting bagi seseorang: ada tokoh nyata yang hidupnya bersentuhan dengan pertanyaan itu. Kalau pertanyaanmu bisa dijawab hanya dengan membuka satu artikel, ia terlalu sempit. Kalau jawabannya butuh penelitian bertahun-tahun, ia terlalu luas.

Setelah pertanyaan terbentuk, kenali tokohmu. Siapa yang paling tahu soal ini? Siapa yang terdampak langsung? Siapa yang sudut pandangnya berbeda? Daftar nama ini menentukan kualitas filmmu. Sebuah pertanyaan tentang harga kantin, misalnya, akan jauh lebih kaya kalau kamu mendengar penjaga kantin, siswa, dan guru, bukan hanya satu pihak.

Sebelum memutuskan, uji pertanyaanmu dengan satu percakapan singkat. Ceritakan pertanyaan itu kepada satu orang yang dekat dengan topiknya dan lihat reaksinya: apakah ia langsung punya cerita, atau justru bingung? Reaksi yang hidup adalah tanda pertanyaanmu punya bahan. Kalau ia hanya menjawab singkat dan tidak ada lanjutannya, pertanyaanmu mungkin terlalu tertutup atau terlalu jauh dari pengalaman orang.

Contoh:
Tulis tiga pertanyaan tentang kehidupan di sekitarmu dalam satu kalimat masing-masing. Contoh: "Kenapa lapangan sekolah sepi padahal dulu selalu ramai?" Pilih satu yang paling membuatmu penasaran, lalu tulis tiga nama calon narasumber: satu yang paling tahu, satu yang terdampak, dan satu yang sudut pandangnya mungkin berbeda.

Ringkasan:
Dokumenter yang kuat berawal dari pertanyaan yang terbuka, spesifik, dan penting bagi tokoh nyata. Pertanyaan memicu rasa penasaran dan riset, sedangkan jawaban yang sudah pasti membuat film membosankan dan tertutup terhadap temuan baru. Topik terbaik sering kali ada di sekitarmu sendiri.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000704', '21000000-0000-4000-8000-000000000007', 'Riset dan verifikasi informasi', 4, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu mampu menyusun dosier riset dari berbagai sumber, memeriksa silang fakta penting, dan menilai kredibilitas sebuah sumber sebelum memakainya dalam film.

Penjelasan:
Sebelum kamera menyala, riset harus sudah cukup. Susun dosier riset: kumpulkan latar belakang dari berbagai sumber seperti buku, artikel, arsip, data statistik, dan wawancara awal. Catat sumbernya satu per satu, lengkap dengan penulis, tanggal, dan tautannya. Saat ada yang mempertanyakan filmmu, dosier inilah buktinya.

Satu sumber saja tidak cukup. Fakta penting harus didukung minimal dua sumber independen. Inilah yang disebut periksa silang atau cross-check. Kalau sumbernya bertentangan, itu justru bahan cerita: tunjukkan kedua sisinya kepada penonton, jangan menyembunyikan salah satunya. Dokumenter yang jujur tidak takut pada perbedaan versi.

Tidak semua yang tertulis di internet bisa dipakai. Ajukan lima pertanyaan untuk setiap sumber. Pertama, siapa penulisnya dan apa kepentingannya? Kedua, kapan diterbitkan dan apakah datanya masih berlaku? Ketiga, apakah sumber ini mengutip sumber lain yang bisa dilacak? Keempat, apakah ada sumber independen yang mengatakan hal yang sama? Kelima, apakah sumber ini membedakan antara fakta dan opini?

Sumber primer umumnya lebih kuat daripada sumber sekunder. Wawancara langsung, dokumen resmi, dan rekaman asli adalah sumber primer. Tetapi sumber primer pun bisa bias: narasumber mengingat peristiwa dari sudut pandangnya sendiri. Karena itu bandingkan selalu ingatan seseorang dengan dokumen dan data. Sumber yang perlu diwaspadai antara lain unggahan media sosial tanpa sumber, artikel tanpa nama penulis, angka tanpa penjelasan cara menghitungnya, dan kesaksian tunggal tentang peristiwa yang sudah lama terjadi.

Simpan dosiermu dengan rapi sejak awal, misalnya dalam satu dokumen dengan kolom pertanyaan riset, sumber, dan fakta yang ditemukan, ditambah kolom apa yang masih diragukan. Setiap kali menemukan fakta baru, isi satu baris dan catat tanggal aksesnya. Kebiasaan kecil ini menyelamatkanmu nanti, ketika guru atau penonton mempertanyakan satu angka dalam filmmu dan kamu harus menunjukkan dari mana angka itu berasal.

Contoh:
Ambil satu fakta dari topik dokumentermu, misalnya "harga makanan di kantin naik 20 persen tahun ini". Cari dua sumber independen yang mendukung atau membantah angka itu: satu dari data atau dokumen, satu dari wawancara. Isi satu baris kartu riset: pertanyaan riset, sumber, fakta yang ditemukan, dan apa yang masih diragukan.

Ringkasan:
Riset dokumenter berarti mengumpulkan dosier dari berbagai sumber, memeriksa silang setiap fakta penting dengan minimal dua sumber independen, dan menilai kredibilitas sumber dengan lima pertanyaan. Sumber primer lebih kuat, tetapi tetap harus dibandingkan dengan dokumen dan data.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000705', '21000000-0000-4000-8000-000000000007', 'Konsep dan treatment', 5, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu mampu menulis treatment dokumenter satu halaman yang berisi judul, logline, sinopsis, tokoh kunci, dan gaya visual untuk filmmu sendiri.

Penjelasan:
Treatment adalah dokumen satu sampai dua halaman yang menggambarkan konsep dan cerita dokumentermu. Isinya: judul, logline, sinopsis, tokoh kunci, dan gaya visual. Treatment adalah cetak biru filmmu dan alat untuk meyakinkan orang lain, seperti guru, narasumber, atau calon penonton, bahwa idemu layak dibuat.

Logline adalah inti cerita dalam satu kalimat. Kalimat ini memaksa kamu menjawab pertanyaan paling sulit: film ini sebenarnya tentang apa? Logline yang baik menyebut tokoh, masalah, dan taruhannya. Contoh: "Seorang penjaga kantin sekolah berusaha mempertahankan usahanya ketika harga bahan naik dan siswa mulai beralih ke warung di luar gerbang." Satu kalimat itu saja sudah memberi gambaran tentang siapa, apa masalahnya, dan mengapa penonton harus peduli.

Sinopsis mengembangkan logline menjadi tiga paragraf pendek yang mengikuti struktur cerita: dunia dan tokoh diperkenalkan, masalah digali makin dalam, lalu penonton pulang dengan wawasan baru. Setelah sinopsis, daftarkan tiga tokoh kunci beserta peran mereka dalam cerita, lalu tentukan mode Nichols yang akan kamu pakai beserta alasannya. Pilihan mode ini juga menentukan gaya visual: apakah kamu akan banyak memakai wawancara, observasi diam-diam, atau narasi voice-over?

Treatment yang baik ditulis sebelum syuting, tetapi boleh berubah. Justru itulah gunanya: ia memberi arah di awal, dan ketika riset atau wawancara menemukan hal baru, kamu bisa merevisinya dengan sadar. Sebuah tim pelajar yang mendokumentasikan kantin sekolah, misalnya, awalnya berniat membuat film protes, tetapi setelah mewawancarai penjaga kantin mereka menemukan bahwa harga naik karena harga bahan naik. Film mereka berubah menjadi cerita tentang rantai harga yang menekan semua orang. Pembuat yang jujur mengikuti temuan, bukan memaksakan niat awal.

Contoh:
Tulis treatment satu halaman untuk topikmu: judul, logline satu kalimat, sinopsis tiga paragraf, daftar tiga tokoh, dan mode Nichols yang akan kamu pakai beserta alasannya. Bacakan logline itu kepada satu teman dan tanyakan: apakah ia langsung paham film ini tentang apa dan mengapa ia harus peduli?

Ringkasan:
Treatment adalah cetak biru dokumenter berisi judul, logline, sinopsis, tokoh kunci, dan gaya visual. Logline satu kalimat memaksa kamu merumuskan inti cerita dengan jelas. Treatment memberi arah sebelum syuting, tetapi boleh direvisi ketika riset menemukan hal baru.$$)
on conflict (id) do nothing;

-- ============ COURSE 7, Section 2 (Minggu 2) ============
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000701', '22000000-0000-4000-8000-000000000007', 'Teknik wawancara', 1, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu mampu melakukan wawancara dokumenter yang baik: menyiapkan pertanyaan terbuka, mendengarkan dengan sungguh-sungguh, dan mencatat momen kunci.

Penjelasan:
Wawancara adalah jantung sebagian besar dokumenter. Narasumber yang baik bukan yang paling pandai bicara, melainkan yang paling jujur. Kejujuran itu muncul kalau ia merasa aman. Karena itu wawancara adalah keterampilan mendengarkan, bukan keterampilan bertanya. Persiapan menentukan separuh hasilnya: pelajari dulu latar narasumbermu, susun pertanyaan, dan datangi lokasi dengan tenang.

Gunakan pertanyaan terbuka. Tanyakan "kenapa", "bagaimana", dan "bisakah ceritakan contohnya". Hindari pertanyaan yang jawabannya hanya "ya" atau "tidak", karena jawaban seperti itu tidak memberi bahan cerita. Pertanyaan yang baik mengundang narasumber bercerita, bukan sekadar mengonfirmasi dugaanmu. Kalau ia menjawab singkat, gali lagi dengan "lalu apa yang terjadi setelah itu?" atau "boleh diceritakan satu kejadian yang paling kamu ingat?"

Jangan memotong pembicaraan. Diam sejenak setelah jawaban selesai sering membuat narasumber menambahkan hal yang paling jujur, justru ketika ia merasa percakapan sudah selesai. Keheningan memang terasa canggung, tetapi dalam wawancara, keheningan adalah alat. Biarkan narasumber mengisi jeda itu dengan pikirannya sendiri.

Dua hal teknis yang tidak boleh dilupakan. Pertama, selalu rekam audio cadangan dengan HP. Wawancara yang tidak terekam dengan baik sama dengan wawancara yang tidak pernah terjadi. Kedua, pilih lokasi yang tenang, dengan latar yang bercerita tentang narasumber, misalnya bengkelnya, dapurnya, atau kelasnya. Latar yang tepat membuat penonton langsung memahami siapa orang ini, bahkan sebelum ia bicara.

Selama wawancara, catat momen kunci: kalimat yang mengejutkan, cerita yang membuat narasumber terdiam, atau detail yang mengubah pemahamanmu. Catatan ini membantumu di ruang edit, ketika kamu harus memilih potongan mana yang dipakai. Setelah wawancara selesai, luangkan lima menit untuk menulis kesanmu selagi masih segar: apa yang paling penting dari percakapan itu, dan apa yang masih perlu ditanyakan lagi?

Contoh:
Latih wawancara dengan temanmu selama lima menit tentang satu kebiasaan di sekolahnya. Gunakan hanya pertanyaan terbuka, jangan memotong, dan diam tiga detik setiap kali ia selesai menjawab. Rekam dengan HP, lalu dengarkan kembali: momen mana yang paling jujur, dan pertanyaan mana yang memancingnya?

Ringkasan:
Wawancara yang baik berawal dari persiapan dan rasa aman narasumber. Gunakan pertanyaan terbuka, jangan memotong, manfaatkan jeda diam, rekam audio cadangan, dan pilih lokasi tenang yang bercerita tentang narasumbermu.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000702', '22000000-0000-4000-8000-000000000007', 'Observasi dan pengambilan gambar', 2, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu mampu membedakan A-roll dan B-roll, melakukan observasi tanpa mengarahkan subjek, dan merekam gambar pendukung yang membuat penonton merasa berada di lokasi.

Penjelasan:
Dalam bahasa produksi, A-roll adalah materi utama pembawa cerita, biasanya wawancara dan narasi. B-roll adalah gambar pendukung: tangan yang bekerja, suasana tempat, dan detail benda. Dokumenter yang hanya berisi kepala berbicara akan membosankan. B-roll yang baik membuat penonton merasa berada di tempat kejadian, dan di ruang edit, B-roll menutupi potongan wawancara agar transisinya terasa mulus.

Saat observasi, jadilah lalat di dinding. Rekam kegiatan yang sedang berlangsung tanpa mengarahkan orangnya. Jangan meminta orang berpose atau mengulang adegan demi kamera, karena momen yang diarahkan kehilangan kejujurannya. Bersabarlah: momen terbaik sering datang setelah 20 menit menunggu, ketika orang-orang sudah lupa ada kamera dan kembali bersikap natural.

Tidak semua gambar harus kamu rekam sendiri. Dokumenter sering memakai materi arsip: foto lama, rekaman berita, potongan koran, dan data statistik. Materi arsip bisa menghidupkan masa lalu yang tidak bisa kamu syuting ulang. Tetapi setiap materi arsip punya pemilik dan konteks. Cantumkan sumbernya di credit, periksa keasliannya, karena foto lama sering salah diberi keterangan tahun, dan jangan memakai arsip untuk menggambarkan peristiwa yang berbeda dari aslinya. Satu foto arsip yang salah konteks bisa meruntuhkan kepercayaan penonton pada seluruh filmmu.

Perhatikan juga suara lokasi. Ambience, seperti suara pasar, suara kelas, atau suara jalan, adalah bukti bahwa kameramu benar-benar ada di sana. Rekam suara suasana beberapa detik di setiap lokasi, dan jangan menutupinya dengan musik yang terlalu keras.

Saat merekam B-roll, variasikan ukuran shot: satu shot luas untuk suasana, satu shot sedang untuk aktivitas, dan satu close-up untuk detail tangan atau benda. Variasi ini memberi editor bahan untuk membangun ritme. Rekam setiap shot beberapa detik lebih lama dari yang kamu kira perlu, karena potongan yang terlalu pendek sulit dipakai, sedangkan potongan yang panjang selalu bisa dipotong.

Contoh:
Datangi satu lokasi selama 15 menit, misalnya kantin saat jam istirahat. Rekam lima B-roll tanpa mengarahkan siapa pun: satu suasana luas, satu aktivitas tangan, satu detail benda, satu ekspresi wajah dari jauh, dan satu suara suasana. Tulis satu kalimat untuk setiap shot tentang apa yang ia ceritakan.

Ringkasan:
A-roll membawa cerita, B-roll membuat penonton merasa hadir di lokasi. Observasi yang baik dilakukan tanpa mengarahkan subjek dan butuh kesabaran. Materi arsip boleh dipakai, tetapi sumber dan konteksnya harus diperiksa dan dicantumkan.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000703', '22000000-0000-4000-8000-000000000007', 'Etika, izin, dan hak subjek', 3, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu mampu menerapkan tiga prinsip etika dokumenter: informed consent, tidak memanipulasi fakta, dan melindungi narasumber.

Penjelasan:
Kamera memberimu kuasa atas citra orang lain, dan kuasa itu harus dipakai dengan hati-hati. Tiga prinsip yang dipegang para dokumenteris profesional, termasuk dalam Kode Etik International Documentary Association (IDA), adalah informed consent, tidak memanipulasi, dan melindungi narasumber.

Informed consent berarti persetujuan yang diinformasikan. Jelaskan kepada narasumber tentang apa filmmu, di mana film akan ditayangkan, dan bagaimana ia akan digambarkan. Minta izin sebelum merekam, dan untuk topik sensitif, minta izin tertulis. Kalau narasumber menarik izin setelah syuting, hormati keputusannya dan diskusikan bagian mana yang mengganggunya. Kesepakatan tertulis di awal mencegah masalah ini.

Jangan memanipulasi. Jangan menyusun potongan wawancara sehingga narasumber seolah mengatakan hal yang tidak ia maksud. Jangan memakai musik atau gambar untuk memojokkan seseorang secara tidak adil. Dokumenter boleh memakai rekonstruksi, yaitu adegan yang diperankan ulang, tetapi harus diberi label yang jelas kepada penonton. Menyembunyikannya adalah manipulasi. Dokumenter harus jujur, bukan netral: pembuat boleh punya sudut pandang, asal fakta-faktanya akurat dan pihak yang berbeda diberi ruang yang adil.

Lindungi narasumber. Pikirkan dampak film terhadap orang yang kamu liput, terutama anak-anak dan kelompok rentan. Samarkan wajah atau nama bila perlu, dan jangan mempublikasikan informasi pribadi tanpa izin. Perhatikan contoh film Senyap atau The Look of Silence (2014) karya Joshua Oppenheimer, yang mengikuti keluarga korban 1965 menemui para pelaku: pembuat film harus melindungi narasumber yang rentan dalam setiap keputusan. Karena temanya berat, tontonlah film itu bersama guru.

Untuk anak-anak, izin harus datang dari orang tua atau wali, bukan hanya dari anak itu sendiri, dan wawancara dengan anak sebaiknya dilakukan dengan pendamping yang ia percaya. Pikirkan juga penayangan: film yang ditayangkan di kelas berbeda dampaknya dengan film yang diunggah ke media sosial dan dilihat ribuan orang. Jelaskan sejak awal di mana film akan ditayangkan, supaya narasumber membuat keputusan dengan informasi yang lengkap.

Contoh:
Buat satu lembar surat izin narasumber sederhana untuk filmmu: judul film, nama narasumber, penjelasan singkat tentang film dan di mana ia akan ditayangkan, serta ruang tanda tangan dan tanggal. Latih cara menjelaskannya secara lisan kepada temanmu dalam satu menit, seolah ia calon narasumbermu.

Ringkasan:
Etika dokumenter berdiri di atas tiga prinsip: informed consent sebelum merekam, tidak memanipulasi potongan atau konteks, dan melindungi narasumber terutama yang rentan. Izin tertulis di awal dan sikap jujur terhadap semua pihak adalah perlindungan terbaik bagi filmmu.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000704', '22000000-0000-4000-8000-000000000007', 'Produksi dan editing dokumenter', 4, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu mampu menyusun dokumenter dengan struktur tiga babak dan menjelaskan alur editing dari logging sampai rough cut.

Penjelasan:
Dokumenter tetap butuh struktur. Model tiga babak yang paling sering dipakai adalah sebagai berikut. Babak 1, Setup: perkenalkan dunia, tokoh, dan masalahnya, lalu beri hook, yaitu alasan penonton harus peduli. Babak 2, Konfrontasi: gali lapisan masalah lewat wawancara, arsip, dan data; tunjukkan konflik atau pertanyaan yang makin dalam. Babak 3, Resolusi: beri wawasan, perubahan, atau ajakan bertindak. Resolusi bukan berarti semua masalah selesai, tetapi penonton pulang dengan pemahaman baru.

Dalam dokumenter, cerita sesungguhnya baru ditemukan saat editing. Langkah kerjanya berurutan. Pertama, logging, yaitu mencatat isi semua rekaman. Kedua, paper edit, yaitu menyusun urutan adegan di atas kertas sebelum memotong. Ketiga, rough cut, yaitu potongan kasar pertama untuk melihat apakah strukturnya bekerja. Baru setelah itu perbaiki ritme, tambahkan musik dan B-roll, dan kunci gambar. Jangan takut membuang wawancara yang bagus kalau ia tidak melayani cerita. Membunuh kesayangan adalah bagian dari pekerjaan editor.

Perhatikan suara dan musik. Karena gambar dokumenter berasal dari dunia nyata, suaranya harus meyakinkan. Biarkan narasumber selesai bicara sebelum musik masuk, dan tanyakan pada dirimu apakah musik itu membantu penonton memahami, atau hanya membuat mereka merasa kasihan. Musik yang terlalu dramatis bisa membuat kesaksian narasumber terasa diarahkan. Narasi voice-over, bila dipakai, harus ditulis dari riset, bukan dari ingatan: setiap kalimat narasi harus bisa dilacak ke sumbernya.

Sebelum tayang, jalankan checklist verifikasi fakta: setiap angka dan tanggal sudah diperiksa ke sumber aslinya, setiap kutipan wawancara sudah dicek terhadap rekaman aslinya, narasumber sudah melihat potongan yang menampilkan dirinya, izin tampil dan izin lokasi sudah lengkap, sumber foto dan arsip sudah dicantumkan di credit, pihak yang sudut pandangnya berbeda sudah diberi kesempatan bicara, dan musik yang dipakai sudah jelas lisensinya. Kalau ada satu jawaban belum, film belum siap tayang.

Contoh:
Dari rekaman latihanmu, buat paper edit di atas kertas: tulis urutan adeganmu dalam tiga babak, lengkap dengan durasi perkiraan tiap adegan dan jenis materinya, wawancara atau B-roll. Baru setelah paper edit selesai, buka aplikasi editing dan susun rough cut mengikuti kertas itu.

Ringkasan:
Dokumenter disusun dalam tiga babak: setup, konfrontasi, dan resolusi. Editing berjalan dari logging ke paper edit lalu rough cut, dan editor harus berani membuang materi yang tidak melayani cerita. Musik dipakai secukupnya, dan checklist verifikasi fakta harus terjawab semua sebelum film tayang.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000705', '22000000-0000-4000-8000-000000000007', 'Presentasi film dokumenter', 5, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu mampu mempresentasikan dokumenter mini kepada penonton, mengumpulkan umpan balik yang berguna, dan menilai dokumenter lain dengan mata seorang pembuat.

Penjelasan:
Film yang tidak ditonton penonton belum selesai. Tayangkan dokumenter minumu ke tiga teman dan tanyakan dua hal: apa yang kamu pahami dari film ini, dan bagian mana yang membingungkan? Perbaiki berdasarkan jawaban mereka, bukan berdasarkan seleramu sendiri. Umpan balik penonton sering mengejutkan: bagian yang kamu anggap paling jelas bisa jadi justru yang paling membingungkan, dan momen kecil yang hampir kamu buang bisa jadi yang paling berkesan.

Sebelum menayangkan, latih dirimu menonton dokumenter seperti kritikus. Pilih satu dokumenter pendek dan jawab lima pertanyaan: apa pertanyaan yang dijawab film ini? Mode Nichols apa yang paling dominan, dan bagaimana kamu tahu? Siapa saja narasumbernya, dan siapa yang tidak diwawancarai? Adakah momen yang terasa diatur, dan kalau ya, apakah itu mengganggu kejujurannya? Apa yang kamu rasakan di akhir, dan suara atau gambar apa yang menimbulkan perasaan itu? Catatan dari latihan ini adalah bekal gaya untuk filmmu sendiri.

Perhatikan juga format pendek. Tidak semua dokumenter berdurasi 90 menit. Dokumenter pendek di bawah 10 menit dan dokumenter vertikal untuk media sosial mengikuti aturan yang sama, riset, kejujuran, dan etika, tetapi dengan cerita yang lebih fokus: satu pertanyaan, satu tokoh, satu lokasi. Justru karena durasinya pendek, setiap detik harus bekerja. Buang pengantar yang bertele-tele dan masuk langsung ke momen paling kuat. Banyak dokumenter pelajar yang bagus justru berdurasi 2-3 menit karena pembuatnya terpaksa memilih apa satu hal yang paling penting dari cerita ini.

Di media sosial, tiga detik pertama menentukan apakah penonton lanjut menonton atau menggeser layar. Karena itu dokumenter pendek sering membuka dengan momen paling kuat, satu kalimat wawancara yang mengejutkan atau satu gambar yang tidak biasa, baru kemudian menjelaskan konteksnya. Teknik ini disebut cold open. Tetapi hati-hati: cold open yang menyesatkan, yaitu momen yang diambil dari konteksnya, melanggar kejujuran dokumenter. Momen pembuka harus tetap benar dan mewakili isi film.

Contoh:
Tayangkan dokumenter minumu ke tiga teman. Minta mereka menulis dua jawaban: satu hal yang mereka pahami dan satu bagian yang membingungkan. Kumpulkan jawabannya, cari pola yang sama di antara ketiganya, dan tulis satu daftar perbaikan dengan tiga butir berdasarkan temuan itu.

Ringkasan:
Presentasi adalah bagian dari proses membuat dokumenter: tayangkan ke penonton, dengarkan apa yang mereka pahami dan apa yang membingungkan, lalu perbaiki. Dokumenter pendek menuntut fokus pada satu pertanyaan dan satu momen pembuka yang kuat tetapi tetap jujur.$$)
on conflict (id) do nothing;

-- ============ COURSE 8: Mengenal Jobdesk Crew Film ============
insert into public.modules (id, course_id, title, order_index) values
('21000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000008', 'Section 1 — Minggu 1', 1)
on conflict (id) do nothing;

insert into public.modules (id, course_id, title, order_index) values
('22000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000008', 'Section 2 — Minggu 2', 2)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000801', '21000000-0000-4000-8000-000000000008', 'Struktur organisasi produksi film', 1, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu mampu menjelaskan pembagian above the line dan below the line, menyebutkan departemen-departemen utama produksi film, dan menggambarkan rantai komando kru.

Penjelasan:
Film adalah kerja tim, bukan kerja satu orang jenius. Di produksi besar, kru film bisa berjumlah ratusan orang. Kru film Iron Man 3 (2013) tercatat lebih dari 3.000 orang. Setiap orang memegang satu potong pekerjaan yang harus nyambung dengan potongan orang lain. Satu peran hilang, produksi macet: tanpa script supervisor, editor kebingungan menyambung potongan; tanpa penata suara, dialog tidak bisa dipakai; tanpa 1st AD, tidak ada yang tahu adegan apa yang harus diambil jam berapa.

Industri film membagi kru menjadi dua kelompok besar. Above the line adalah orang-orang yang membentuk proyek dan dipekerjakan pertama: produser, sutradara, penulis, dan pemain utama. Below the line adalah semua kru lainnya, yang terbagi ke dalam departemen: produksi, kamera, listrik dan grip, suara, artistik, serta pascaproduksi. Setiap departemen dipimpin seorang kepala departemen yang melapor ke sutradara untuk urusan kreatif dan ke produser untuk urusan uang dan jadwal.

Ada dua rantai komando yang berjalan berdampingan. Rantai kreatif dipimpin sutradara: semua kepala departemen kreatif, seperti DOP, production designer, dan editor, bekerja mengikuti visinya. Rantai logistik dipimpin produser: anggaran, jadwal, izin, dan kontrak diatur dari sini. Di lokasi syuting, dua rantai ini bertemu pada 1st AD, yang menjalankan hari syuting sesuai jadwal sekaligus menjaga visi sutradara tetap bisa tercapai dalam waktu yang tersedia.

Kenapa mengenal struktur ini penting? Ada tiga alasan. Pertama, film pendekmu butuh pembagian kerja yang jelas. Kalau semua orang mengerjakan semuanya, tidak ada yang bertanggung jawab atas apa pun, dan yang paling sering hilang adalah suara yang bersih dan catatan kontinuitas. Kedua, kamu akan bekerja dengan orang lain. Kru yang tahu jobdesknya sendiri tidak mengerjakan pekerjaan orang lain dan tahu kepada siapa harus bertanya. Ketiga, ini pintu masuk industri. Hampir semua orang memulai karier film dari posisi paling bawah, runner atau production assistant, lalu naik ke departemen yang mereka sukai.

Contoh:
Tonton credit akhir satu film pendek di YouTube. Catat 10 jabatan kru yang muncul dan tebak departemen masing-masing: produksi, kamera, listrik dan grip, suara, artistik, atau pascaproduksi. Lalu gambar bagan sederhana: siapa melapor ke sutradara dan siapa melapor ke produser?

Ringkasan:
Kru film terbagi menjadi above the line, yang membentuk proyek, dan below the line, yang terbagi ke dalam departemen dengan kepala departemennya masing-masing. Rantai kreatif dipimpin sutradara dan rantai logistik dipimpin produser. Pembagian kerja yang jelas membuat produksi berjalan dan menjadi pintu masuk ke industri film.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000802', '21000000-0000-4000-8000-000000000008', 'Sutradara dan assistant director', 2, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu mampu menjelaskan tugas sutradara dan 1st AD di tiga tahap produksi serta membedakan siapa yang memimpin secara kreatif dan siapa yang menjalankan hari syuting.

Penjelasan:
Sutradara memegang visi kreatif film. Ia membaca dan menyempurnakan naskah bersama penulis, memilih pemain melalui casting, menentukan gaya visual bersama DOP, mengarahkan aktor di lokasi, dan duduk bersama editor di pascaproduksi. Di lokasi syuting, sutradara adalah pemimpin kreatif tertinggi, dan hanya sutradara yang memanggil "Action" dan "Cut". Tetapi ia bukan yang menjalankan jadwal. Itu tugas 1st AD.

Di praproduksi, sutradara menyempurnakan naskah, melakukan casting, menentukan gaya visual bersama DOP, dan rehearsal dengan pemain. Saat syuting, ia mengarahkan aktor dan memutuskan setiap take, diulang atau lanjut. Di pascaproduksi, ia duduk bersama editor, memutuskan potongan akhir, serta mengarahkan musik dan color grading. Sutradara melapor ke produser untuk jadwal dan anggaran, tetapi secara kreatif ia adalah pemimpin tertinggi di lokasi.

Ini peran yang paling sering disalahpahami pemula: yang menjalankan hari syuting adalah 1st AD, asisten sutradara pertama. Ia menyusun jadwal syuting dari naskah, memanggil kru bersiap, menjaga semua departemen tetap sesuai waktu, dan bertanggung jawab atas keselamatan dan ketertiban di lokasi. 1st AD adalah salah satu jabatan below the line tertinggi, dan biasanya orang pertama yang diganti kalau produksi meleset jauh dari jadwal atau anggaran.

Di praproduksi, 1st AD menyusun shooting schedule dan menyiapkan call sheet bersama 2nd AD, serta merencanakan urutan adegan per hari. Saat syuting, ia memanggil kru bersiap dengan perintah seperti "quiet on the set", "roll sound", dan "roll camera", menjaga jadwal, memimpin safety meeting, dan menyelesaikan masalah di lokasi. Di pascaproduksi, ia menyusun laporan harian produksi dan memastikan semua materi terserahkan ke editor. Pada produksi besar ia dibantu 2nd AD, yang membuat dan membagikan call sheet harian dan memastikan pemain hadir tepat waktu. 1st AD melapor ke sutradara dan produser.

Contoh:
Bayangkan satu adegan dialog dua menit di kantin sekolah. Tulis siapa melakukan apa: sutradara memutuskan blocking dan memanggil "Action", sementara 1st AD memastikan semua departemen siap, memanggil "quiet on the set", dan menjaga adegan selesai sesuai jadwal. Lalu tulis satu situasi darurat, misalnya pemain terlambat 30 menit, dan jelaskan siapa yang menanganinya.

Ringkasan:
Sutradara adalah pemimpin kreatif tertinggi di lokasi dan satu-satunya yang memanggil "Action" dan "Cut". 1st AD menjalankan hari syuting: menyusun jadwal, memanggil kru bersiap, menjaga waktu, dan memimpin keselamatan di lokasi. Keduanya bekerja berpasangan, satu menjaga cerita dan satu menjaga jadwal.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000803', '21000000-0000-4000-8000-000000000008', 'Penulis skenario dan script supervisor', 3, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu mampu menjelaskan tugas penulis skenario dan script supervisor serta memahami bagaimana catatan kontinuitas membantu editor merakit film.

Penjelasan:
Penulis skenario adalah orang yang mengubah ide menjadi naskah: cerita, dialog, dan deskripsi adegan yang bisa difilmkan. Naskah yang baik bukan sekadar cerita yang bagus, melainkan cerita yang bisa dieksekusi: setiap adegan jelas lokasinya, siapa yang ada di dalamnya, dan apa yang terjadi. Penulis bekerja paling intens di praproduksi, tetapi perannya tidak berhenti di sana. Selama syuting, sutradara sering berdiskusi dengan penulis ketika sebuah adegan perlu diubah karena lokasi, cuaca, atau improvisasi aktor. Penulis yang baik menulis dengan kesadaran bahwa naskahnya akan diubah, dan perubahan itu harus dicatat.

Di sinilah script supervisor bekerja. Script supervisor adalah penjaga kontinuitas: orang yang memastikan potongan-potongan film bisa disambung dengan wajar. Adegan film diambil tidak berurutan dan diulang berkali-kali dari sudut berbeda. Gelas yang penuh di satu shot harus tetap penuh di shot berikutnya, posisi tangan aktor harus sama, dan dialog yang diubah sedikit harus tercatat. Tanpa catatan ini, editor akan kebingungan menyambung potongan.

Di praproduksi, script supervisor membaca naskah, menyiapkan lembar kontinuitas, dan mencatat perkiraan durasi tiap adegan. Saat syuting, ia mencatat nomor adegan dan take, perubahan dialog, posisi dan benda, memotret detail kontinuitas, dan membuat lined script, yaitu naskah yang digarisi per take, untuk editor. Catatannya diserahkan ke editor setiap malam. Script supervisor melapor ke sutradara.

Hubungan keduanya sederhana: penulis menentukan apa yang seharusnya terjadi di dalam cerita, dan script supervisor memastikan apa yang direkam di lokasi tetap konsisten dengan cerita itu, take demi take. Pada kru kecil, peran script supervisor sering dilewatkan, dan editorlah yang membayar harganya di ruang edit. Karena itu, untuk film pendek pelajar, jangan lewatkan peran ini meskipun kru kalian hanya berlima.

Contoh:
Tonton satu adegan dari film favoritmu dan cari jejak script supervisor: apakah isi gelas, posisi tangan, dan letak benda sama di setiap potongan? Lalu tulis tiga baris catatan kontinuitas untuk satu adegan sederhana, misalnya seseorang menyeruput kopi sambil berbicara: posisi gelas, tangan yang memegang, dan kata-kata yang diucapkan.

Ringkasan:
Penulis skenario mengubah ide menjadi naskah yang bisa difilmkan, sementara script supervisor menjaga kontinuitas antartake lewat catatan adegan, dialog, posisi, dan benda. Catatan itu menjadi peta bagi editor untuk merakit film. [Perlu ditinjau mentor]$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000804', '21000000-0000-4000-8000-000000000008', 'DP dan camera department', 4, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu mampu menjelaskan tugas DOP, operator kamera, focus puller, dan 2nd AC, serta rantai komando di dalam departemen kamera.

Penjelasan:
DOP, Director of Photography, juga disebut sinematografer, adalah kepala departemen kamera. Ia bekerja paling dekat dengan sutradara untuk merancang tampilan visual film: pencahayaan, lensa, komposisi, dan gerakan kamera. Di bawahnya ada tiga jalur: kamera yang dipegang operator dan asisten kamera, listrik yang dipimpin gaffer, dan grip yang dipimpin key grip. Pada film pendek pelajar, DOP biasanya juga mengoperasikan kamera sendiri.

DOP menentukan gaya visual sejak praproduksi, memimpin penataan gambar dan cahaya di lokasi, dan mengawasi color grading di pascaproduksi. Ia melapor ke sutradara. Keputusan DOP memengaruhi perasaan penonton secara langsung: lensa yang berbeda, sudut yang berbeda, dan cahaya yang berbeda bisa membuat adegan yang sama terasa tegang, hangat, atau dingin.

Operator kamera mengoperasikan kamera secara fisik saat take dan menjalankan gerakan kamera sesuai arahan DOP. Ia melapor ke DOP, dan pada kru kecil peran ini dirangkap DOP. Di bawah operator ada 1st AC atau focus puller, yang menjaga fokus tetap tajam selama take, mengganti lensa, merawat kamera, dan menandai jarak fokus. Pekerjaan yang terlihat sepele ini menentukan: satu take dengan fokus meleset tidak bisa dipakai, sebagus apa pun aktingnya.

2nd AC adalah asisten kamera kedua. Ia memegang slate atau clapperboard di awal take, mencatat data setiap take, dan mengurus kartu memori serta cadangan data. Slate yang ditepuk di awal take memberi editor dua hal penting: penanda adegan dan take, serta bunyi tepukan untuk menyinkronkan gambar dan suara. 2nd AC melapor ke DOP melalui 1st AC. Tanpa catatan take yang rapi, editor akan menghabiskan waktu berjam-jam hanya untuk mencari potongan yang tepat.

Contoh:
Buat kartu jobdesk untuk empat peran departemen kamera: DOP, operator, 1st AC, dan 2nd AC. Untuk masing-masing, tulis tiga tugas: satu di praproduksi, satu saat syuting, dan satu di pascaproduksi, plus kepada siapa ia melapor. Lalu tandai peran mana yang paling sering dirangkap dalam kru pelajar.

Ringkasan:
DOP adalah kepala departemen kamera yang merancang tampilan visual bersama sutradara. Operator menjalankan kamera, 1st AC menjaga fokus tetap tajam, dan 2nd AC memegang slate serta mencatat data take. Semuanya melapor ke DOP, dan DOP melapor ke sutradara.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('31000000-0000-4000-8000-000000000805', '21000000-0000-4000-8000-000000000008', 'Lighting department', 5, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu mampu membedakan tugas gaffer dan key grip serta menjelaskan bagaimana departemen pencahayaan mendukung visi visual DOP.

Penjelasan:
Gaffer dan key grip adalah dua kepala departemen yang sering dicampuradukkan orang luar, tetapi tidak pernah dicampuradukkan orang dalam. Gaffer, chief lighting technician, adalah kepala listrik: ia menjalankan rencana pencahayaan DOP, menentukan lampu apa, di mana, dan dialiri daya dari mana, serta bertanggung jawab atas keselamatan listrik di lokasi. Tangan kanannya adalah best boy electric, yang mengurus kru dan logistik peralatan listrik.

Key grip adalah kepala grip: segala hal yang membentuk atau mengendalikan cahaya tanpa menjadi lampu, seperti flag, net, dan difusi, serta segala hal yang menopang atau menggerakkan kamera, seperti stand, rig, dolly, dan crane. Ia juga bertanggung jawab atas keselamatan rigging. Dolly grip memasang rel dan mendorong dolly agar gerakan kamera mendarat tepat di mark. Gaffer dan key grip sama-sama melapor ke DOP.

Perbedaan keduanya mudah diingat: gaffer mengurus listrik dan lampu, key grip mengurus rigging dan pembentuk cahaya. Kalau sesuatu menyala atau dialiri listrik, itu urusan gaffer. Kalau sesuatu menahan, membentuk, atau menopang, itu urusan grip. Keduanya bekerja dari rencana yang sama, yaitu rancangan pencahayaan DOP, tetapi dengan alat dan tanggung jawab yang berbeda.

Pada kru kecil, satu orang swing, gabungan grip dan listrik, mengerjakan keduanya. Ini wajar untuk film pelajar, tetapi ada batasnya: begitu ada lampu besar, kabel panjang, atau rigging di ketinggian, keselamatan listrik dan rigging tidak boleh dikerjakan sembarangan. Aturan praktisnya, kalau kamu tidak yakin sebuah instalasi aman, jangan memaksakan. Cahaya yang bagus tidak sebanding dengan risiko kecelakaan di lokasi.

Contoh:
Amati satu adegan film favoritmu dan tebak dari mana cahaya utamanya berasal. Apakah cahaya itu keras atau lembut, dari samping atau dari depan? Lalu tulis pembagian tugas untuk satu setup pencahayaan sederhana di kelas: apa yang dikerjakan gaffer, apa yang dikerjakan key grip, dan siapa yang memutuskan hasil akhirnya?

Ringkasan:
Gaffer adalah kepala listrik yang menjalankan rencana pencahayaan DOP dan menjaga keselamatan listrik. Key grip adalah kepala grip yang mengurus rigging, pembentuk cahaya, dan dukungan kamera. Keduanya melapor ke DOP, dan pada kru kecil peran mereka bisa dirangkap satu orang swing.$$)
on conflict (id) do nothing;

-- ============ COURSE 8, Section 2 (Minggu 2) ============
insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000801', '22000000-0000-4000-8000-000000000008', 'Sound department', 1, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu mampu menjelaskan tugas production sound mixer dan boom operator serta memahami mengapa suara lokasi yang buruk hampir tidak bisa diperbaiki di editing.

Penjelasan:
Departemen suara di lokasi dipimpin production sound mixer, yaitu penata suara lokasi. Ia memasang mikrofon ke aktor, merekam dialog yang bersih, memantau level dengan headphone, memberi tahu kru kalau ada suara pengganggu seperti kulkas, pesawat lewat, atau AC, merekam room tone, dan membuat sound report. Ia melapor ke sutradara, melalui 1st AD pada hari syuting.

Boom operator adalah tangan dan lengannya. Ia memegang mikrofon shotgun di ujung boom pole di atas kepala aktor, di luar frame, mengarah ke mulut. Pekerjaan ini jauh lebih berat daripada kelihatannya, karena lengan harus stabil berjam-jam. Boom yang turun ke dalam frame atau suara yang naik turun karena mikrofon bergerak akan merusak take yang sebenarnya bagus. Pada kru kecil, mixer merangkap boom operator. Boom operator melapor ke mixer.

Satu aturan dipegang semua kru suara: suara lokasi yang buruk hampir tidak bisa diperbaiki di pascaproduksi. Gambar yang sedikit goyang masih bisa dipotong, tetapi dialog yang tertutup suara bising hampir tidak bisa diselamatkan. Suara ulang atau ADR hanya dilakukan kalau terpaksa, karena hasilnya jarang senatural dialog asli di lokasi.

Di praproduksi, tim suara melakukan survei lokasi untuk mengetahui sumber bising apa saja, memilih mikrofon dan recorder, serta mengujinya di lokasi. Saat syuting, selain merekam dialog, mereka merekam room tone selama 30-60 detik, yaitu suara sunyi ruangan, yang nanti dipakai editor untuk menambal potongan. Di pascaproduksi, mereka menyerahkan rekaman dan laporan ke editor suara.

Contoh:
Datangi satu ruangan dan dengarkan selama satu menit dengan mata tertutup. Catat semua suara yang kamu dengar: kipas, lalu lintas, suara dari ruangan sebelah. Lalu rekam satu kalimat dialog dengan HP di ruangan itu dan dengarkan kembali: apakah dialognya masih jelas, dan suara apa yang paling mengganggu? Tulis satu cara untuk mengurangi suara itu saat syuting.

Ringkasan:
Production sound mixer merekam dialog yang bersih dan memantau suara pengganggu, sementara boom operator memegang mikrofon shotgun di atas kepala aktor. Suara lokasi yang buruk hampir tidak bisa diperbaiki di editing, jadi survei lokasi, room tone, dan sound report adalah bagian penting dari pekerjaan mereka.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000802', '22000000-0000-4000-8000-000000000008', 'Art department dan wardrobe', 2, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu mampu menjelaskan tugas production designer, art director, dan penata kostum serta memahami bagaimana dunia visual dan pakaian bercerita tentang tokoh.

Penjelasan:
Production designer menerjemahkan naskah menjadi dunia visual: set, warna, properti, kostum, dan makeup secara keseluruhan. Ia menjawab pertanyaan: bagaimana tempat ini terlihat, dan apa yang dikatakan tempat itu tentang tokohnya? Ia bekerja sejak praproduksi melalui riset visual, sketsa, dan moodboard, lalu mengawasi tampilan set selama syuting. Production designer melapor ke sutradara, dan ke produser untuk urusan anggaran.

Art director bekerja di bawah production designer. Ia membangun dan menata set, mencari properti, dan memastikan setiap benda di dalam frame sesuai dengan dunia yang dirancang. Kalau production designer menentukan dunia seperti apa yang harus tercipta, art director memastikan dunia itu benar-benar berdiri di lokasi syuting, dari dinding yang dicat sampai gelas di atas meja.

Penata kostum atau costume designer merancang atau mencari pakaian setiap tokoh. Pakaian adalah cerita: seragam yang kusut, jaket yang kebesaran, atau sepatu yang sudah usang langsung memberi tahu penonton tentang kehidupan tokohnya, bahkan sebelum ia bicara. Costume supervisor mengurus kelanjutannya di lokasi: fitting, cadangan atau multiples untuk adegan kotor atau basah, dan kontinuitas kostum antartake. Penata kostum melapor ke sutradara dan production designer.

Pada film pelajar, departemen artistik sering dianggap bisa dikerjakan sambil lalu, padahal penonton membaca dunia visual sebelum membaca dialog. Set yang salah, properti yang tidak konsisten, atau kostum yang tidak cocok dengan tokoh akan langsung terasa, meskipun penonton tidak bisa menjelaskan mengapa. Karena itu, luangkan waktu untuk riset visual: foto referensi, contoh warna, dan daftar properti sebelum hari syuting.

Contoh:
Pilih satu tokoh dari naskah film pendekmu. Buat moodboard sederhana berisi tiga foto referensi: satu untuk ruang tempat ia tinggal, satu untuk warna dominan dunia itu, dan satu untuk pakaiannya. Tulis satu kalimat untuk setiap foto tentang apa yang ia ceritakan tentang tokoh tersebut.

Ringkasan:
Production designer merancang dunia visual film secara keseluruhan, art director membangun dan menata set serta properti, dan penata kostum merancang pakaian yang bercerita tentang tokoh. Ketiganya bekerja mengikuti visi sutradara dan menentukan apa yang penonton rasakan tentang dunia cerita.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000803', '22000000-0000-4000-8000-000000000008', 'Production design dan makeup', 3, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu mampu menjelaskan bagaimana production design membangun dunia cerita dan bagaimana makeup serta rambut menjaga tampilan dan kontinuitas pemain.

Penjelasan:
Production design adalah pekerjaan merancang dunia tempat cerita tinggal. Production designer tidak sekadar mendekorasi ruangan; ia memutuskan bagaimana dunia itu terlihat dan apa yang dikatakan dunia itu tentang tokohnya. Sebuah kamar yang rapi dan terang bercerita lain dengan kamar yang penuh barang dan remang. Pilihan warna, tekstur, dan properti adalah bagian dari naskah visual yang penonton baca tanpa sadar.

Prosesnya dimulai jauh sebelum syuting. Production designer melakukan riset visual, membuat sketsa dan moodboard, lalu mengawasi tampilan set selama syuting. Ia bekerja dengan art director yang membangun dan menata set, serta berkoordinasi dengan DOP agar warna set selaras dengan pencahayaan. Ia melapor ke sutradara untuk urusan kreatif dan ke produser untuk urusan anggaran.

Penata rias dan rambut, yaitu makeup dan hair, menangani tampilan pemain. Tugasnya bukan hanya membuat pemain terlihat menarik, tetapi membuat tampilan itu konsisten dengan tokoh dan cerita: riasan lelah untuk tokoh yang begadang, luka untuk adegan kecelakaan, atau penuaan untuk lompatan waktu. Riasan khusus seperti luka dan penuaan membutuhkan perencanaan dan uji coba sebelum hari syuting. Yang sering dilupakan pemula adalah kontinuitas riasan: riasan di take pertama harus sama dengan di take kesepuluh, meskipun adegan itu diambil berjam-jam kemudian. Karena itu penata rias memotret tampilan pemain sebagai catatan.

Penata kostum dan penata rias bekerja berdekatan, keduanya melapor ke sutradara dan production designer. Bersama-sama mereka memastikan bahwa apa yang terlihat di layar, dari dinding set sampai garis di wajah pemain, bercerita tentang tokoh yang sama.

Contoh:
Pilih satu adegan dengan lompatan waktu, misalnya tokoh yang sama di pagi hari dan di malam hari setelah seharian bekerja. Tulis tiga perbedaan visual yang harus dijaga: satu pada set atau properti, satu pada kostum, dan satu pada riasan atau rambut. Lalu tulis bagaimana kamu akan mencatatnya agar konsisten di setiap take.

Ringkasan:
Production design membangun dunia cerita lewat riset visual, sketsa, dan set yang diawasi sejak praproduksi. Makeup dan rambut menangani tampilan pemain, termasuk riasan khusus dan kontinuitas riasan antartake. Keduanya melapor ke sutradara dan production designer, dan bersama kostum mereka menjaga dunia cerita tetap konsisten.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000804', '22000000-0000-4000-8000-000000000008', 'Producer dan production management', 4, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu mampu menjelaskan tugas produser di tiga tahap produksi dan memahami alat manajemen produksi seperti anggaran, jadwal syuting, dan call sheet.

Penjelasan:
Produser adalah orang yang membuat film itu ada. Ia mencari atau menyediakan dana, menyusun anggaran bersama line producer, merekrut sutradara dan kepala departemen, mengurus izin, kontrak, dan distribusi. Pepatah industri mengatakan produser adalah orang pertama yang bekerja pada sebuah film dan orang terakhir yang pulang: ia sudah bekerja jauh sebelum syuting dimulai dan masih bekerja setelah film selesai, sampai film itu sampai ke penonton.

Di praproduksi, produser mencari dana, menyusun anggaran, merekrut sutradara dan kru kunci, serta mengurus izin lokasi dan kontrak pemain. Saat syuting, ia memantau anggaran dan jadwal, menyelesaikan masalah logistik seperti lokasi batal, alat rusak, atau pemain terlambat, dan menjadi penghubung dengan penyandang dana. Di pascaproduksi, ia mengawasi penyelesaian editing serta mengurus distribusi, festival, dan penayangan. Produser melapor ke penyandang dana atau executive producer.

Pada film pendek pelajar, semua jenis produser biasanya dirangkap satu orang: executive producer yang mengurus dana, line producer yang mengelola anggaran harian, dan associate producer yang membantu. Production management adalah pekerjaan sehari-hari yang membuat semua itu berjalan: menyusun jadwal syuting, mengirim call sheet, mengatur transportasi dan konsumsi, serta memastikan setiap departemen tahu apa yang harus dibawa dan kapan harus datang.

Alat terpenting manajemen produksi adalah call sheet. Malam sebelumnya, 2nd AD mengirim call sheet: siapa dipanggil jam berapa, adegan apa, di mana, dan apa yang harus dibawa. Di balik call sheet ada shooting schedule yang disusun 1st AD dari naskah, serta anggaran yang dijaga line producer. Tanpa ketiga alat ini, produksi berjalan berdasarkan ingatan, dan ingatan adalah cara paling pasti untuk kehilangan satu adegan atau satu pemain di hari syuting.

Contoh:
Buat call sheet sederhana untuk satu hari syuting film pendekmu: tanggal, lokasi, jam crew call, tiga adegan dengan perkiraan durasi, pemain yang dipanggil untuk tiap adegan, dan kebutuhan tiap adegan, misalnya properti atau alat khusus. Tukar call sheet itu dengan temanmu dan minta ia mencari satu hal yang hilang atau tidak realistis.

Ringkasan:
Produser membuat film itu ada: mencari dana, menyusun anggaran, merekrut kru, mengurus izin, dan mengantar film sampai ke penonton. Production management menjalankan semua itu lewat jadwal syuting, anggaran harian, dan call sheet. Produser melapor ke penyandang dana, dan pada film pelajar semua jenis produser biasanya dirangkap satu orang.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
('32000000-0000-4000-8000-000000000805', '22000000-0000-4000-8000-000000000008', 'Simulasi pembagian jobdesk', 5, NULL, $$Tujuan:
Setelah mempelajari lesson ini, kamu mampu menyusun kru minimal 5-7 orang untuk film pendek pelajar, menjalankan simulasi satu hari syuting, dan membuat call sheet hari pertama.

Penjelasan:
Berapa orang yang kamu butuhkan untuk film pendek? Untuk film pendek sederhana, kru minimal 5-7 orang di luar pemain sudah cukup: sutradara yang juga penulis, produser yang juga 1st AD, DOP sekaligus operator kamera, penata suara yang merangkap boom operator, editor, dan satu runner atau PA yang juga membantu artistik. Film pendek yang lebih ambisius, dengan beberapa lokasi, banyak pemain, atau gaya visual khusus, lebih realistis dengan 10-15 orang. Produksi yang lengkap bekerja dengan 15-25 orang atau lebih. Patokannya bukan gengsi, melainkan kebutuhan: setiap peran tambahan harus menjawab satu masalah nyata di filmmu.

Tidak semua peran boleh dirangkap. DOP dan operator kamera boleh dirangkap, dan itu standar di film independen dan pelajar. Mixer dan boom operator boleh dirangkap, asal tidak ada adegan dengan banyak pemain bergerak. Tetapi produser dan sutradara sebaiknya tidak dirangkap: tidak ada yang menjaga jadwal saat sutradara menjaga cerita, dan sebaliknya. Sutradara dan editor juga sebaiknya tidak dirangkap, karena editor butuh mata penonton yang segar, bukan mata orang yang ada di lokasi. Script supervisor jangan dilewatkan, meskipun kru kecil: ia sering dilewatkan, dan editor yang membayar harganya.

Satu hari syuting berjalan dalam bingkai yang tetap: call sheet. Pagi harinya, kamera, listrik, dan grip datang paling awal untuk merakit kamera, menarik kabel, dan menata cahaya pertama. Lalu crew call: semua orang hadir dan absen ke 2nd AD. 1st AD memimpin safety meeting singkat tentang adegan hari ini, bahaya yang mungkin ada, rumah sakit terdekat, dan rencana kalau terjadi sesuatu. Setelah itu siklus yang diulang setiap setup: blocking, setup, rehearsal, take, cek hasil, lalu pindah ke setup berikutnya. Makan siang di tengah hari, lalu syuting sore, dan akhirnya wrap. Yang mengejutkan pemula: kamera hanya merekam sebagian kecil dari total jam kerja. Sebagian besar hari dihabiskan untuk persiapan.

Peran pendukung juga penting. Location manager mencari lokasi, mengurus izin dan biaya, serta menjadi penghubung dengan pemilik lokasi. Runner atau PA adalah posisi paling bawah dalam tangga produksi dan pintu masuk industri film: mengantar pesan, menjaga pintu set, membantu mengangkat alat, dan menjemput konsumsi. Catering menyediakan makanan dan minuman kru, karena kru yang lapar, haus, dan lelah membuat kesalahan, dan kesalahan di lokasi syuting harganya mahal.

Contoh:
Simulasikan satu hari syuting di kelas: bagi kelas menjadi kru enam orang, yaitu sutradara, produser merangkap 1st AD, DOP, penata suara, script supervisor, dan runner. Jalankan satu adegan dialog dua menit dengan urutan perintah lengkap dari "quiet on the set" sampai "cut", lalu tonton hasilnya bersama: siapa yang bingung tugasnya, dan apa yang harus diperbaiki sebelum syuting sungguhan?

Ringkasan:
Kru minimal 5-7 orang cukup untuk film pendek sederhana, dengan beberapa peran boleh dirangkap dan beberapa tidak, seperti produser dengan sutradara dan sutradara dengan editor. Satu hari syuting berjalan mengikuti call sheet, dari crew call dan safety meeting sampai siklus blocking, take, dan wrap. Simulasi sebelum syuting sungguhan menunjukkan siapa yang masih bingung dengan tugasnya.$$)
on conflict (id) do nothing;

-- SINEVERSE Academy Stage 1 — Seed: Courses 9 & 10
-- Course 9: Produksi & Manajemen Film (Minggu 13-14)
-- Course 10: Akting untuk Kamera (Minggu 15-16)
-- Sumber: 07-Modul-Produksi-dan-Manajemen-Film.pdf dan 08-Modul-Akting-untuk-Kamera.pdf
-- Setiap lesson berisi Tujuan, Penjelasan, Contoh, dan Ringkasan.

-- ==================== COURSE 9: Produksi & Manajemen Film ====================

insert into public.modules (id, course_id, title, order_index) values
  ('21000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000009', 'Section 1 — Minggu 1', 1)
on conflict (id) do nothing;

insert into public.modules (id, course_id, title, order_index) values
  ('22000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000009', 'Section 2 — Minggu 2', 2)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('31000000-0000-4000-8000-000000000901', '21000000-0000-4000-8000-000000000009', 'Tahapan produksi film', 1, null, $$Tujuan:
Setelah pelajaran ini, kamu dapat menyebutkan lima tahap produksi film secara berurutan dan menjelaskan apa yang terjadi di masing-masing tahap, serta menjelaskan mengapa tahap persiapan sering memakan waktu lebih lama daripada syuting itu sendiri.

Penjelasan:
Banyak film pendek pelajar gagal bukan karena idenya jelek, melainkan karena produksinya berantakan: lokasi belum dapat izin saat hari syuting, aktor datang tetapi kamera belum siap, atau uang habis sebelum editing selesai. Film adalah kerja tim yang terikat waktu dan uang, dan manajemen produksi adalah keterampilan yang membuat ide bagus benar-benar selesai menjadi film.

Industri membagi pembuatan film ke dalam lima tahap. Pertama, pengembangan (development): ide ditulis menjadi naskah, ruang lingkup ditentukan, dan pendanaan disiapkan. Tahap ini paling murah untuk diperbaiki dan paling mahal kalau salah, karena kesalahan di sini terbawa ke semua tahap berikutnya. Kedua, praproduksi (pre-production): semua persiapan sebelum syuting, seperti naskah final, casting, kru, lokasi dan izin, jadwal, anggaran, shot list, dan storyboard.

Ketiga, produksi (production) atau principal photography: pengambilan gambar utama, saat aktor berakting dan kru merekam gambar dan suara. Keempat, pascaproduksi (post-production): editing, desain suara, musik, color grading, judul, dan credit. Tahap ini bisa sama lamanya dengan syuting, bahkan lebih lama. Kelima, distribusi (distribution): film sampai ke penonton lewat pemutaran, festival, streaming, atau media fisik.

Dalam praktik, tahap-tahap ini sering tumpang tindih. Misalnya editing sudah dimulai selagi syuting masih berjalan, dan rekaman harian langsung dikirim ke tim edit. Namun urutannya tetap menjadi peta yang bisa kamu ikuti. Fakta yang mengejutkan pemula: sebuah film layar lebar bisa syuting hanya empat minggu setelah satu tahun persiapan. Hampir semua pekerjaan perfilman adalah bagian yang tidak pernah difoto.

Contoh:
Pilih satu film pendek di YouTube yang durasinya di bawah 10 menit. Tonton credit title-nya sampai habis, hitung berapa departemen yang terlibat, lalu tulis lima baris, satu baris untuk tiap tahap, berisi bukti bahwa tahap itu benar-benar dikerjakan. Misalnya, nama editor adalah bukti pascaproduksi, dan nama lokasi adalah bukti praproduksi. Bayangkan apa yang terjadi kalau satu departemen itu tidak ada.

Ringkasan:
Lima tahap produksi film adalah pengembangan, praproduksi, produksi, pascaproduksi, dan distribusi. Setiap tahap punya pekerjaan dan tanggung jawabnya sendiri, dan tahap-tahap itu bisa tumpang tindih tetapi urutannya tetap menjadi peta. Kunci film pelajar yang selesai adalah persiapan yang rapi, bukan syuting yang panjang.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('31000000-0000-4000-8000-000000000902', '21000000-0000-4000-8000-000000000009', 'Development dan pre-production', 2, null, $$Tujuan:
Setelah pelajaran ini, kamu dapat menjelaskan apa yang dikerjakan pada tahap development dan pre-production, serta menjelaskan mengapa memperbaiki kesalahan di tahap awal jauh lebih murah daripada memperbaikinya saat syuting sudah berjalan.

Penjelasan:
Tahap development adalah saat ide berubah menjadi rencana yang bisa dikerjakan. Di sini ide ditulis menjadi naskah, ruang lingkup ditentukan, dan pendanaan disiapkan. Ruang lingkup berarti keputusan-keputusan dasar: berapa durasi filmnya, berapa tokoh yang terlibat, berapa lokasi yang dipakai, dan berapa besar biaya yang masuk akal. Keputusan ini penting karena setiap tambahan tokoh atau lokasi menambah biaya, waktu, dan kerumitan. Tahap ini paling murah untuk diperbaiki: mengubah satu adegan di atas kertas tidak menghabiskan apa-apa, sedangkan mengubahnya di hari syuting bisa menghabiskan satu hari penuh.

Setelah naskah selesai, masuklah tahap pre-production, yaitu semua persiapan sebelum kamera mulai merekam. Daftarnya panjang: naskah final, casting pemain, pembentukan kru, survei lokasi dan pengurusan izin, penyusunan jadwal dan anggaran, pembuatan shot list, dan storyboard. Setiap butir di daftar ini saling terkait. Misalnya, kamu tidak bisa menyusun jadwal sebelum tahu lokasi mana saja yang dipakai, dan kamu tidak bisa menyusun anggaran sebelum tahu apa saja kebutuhan dari naskah.

Praproduksi sering dianggap birokrasi yang membosankan, padahal ia adalah asuransi. Sebuah tim film pelajar pernah merencanakan syuting di sebuah taman, lalu sehari sebelum syuting taman itu ditutup untuk acara. Karena mereka sudah punya rencana cadangan dan call sheet yang mencantumkan nomor kontak semua orang, 1st AD berhasil memberi tahu seluruh kru dalam satu jam dan syuting tetap berjalan. Tim lain yang tidak punya rencana cadangan kehilangan satu hari penuh. Semakin rapi rencanamu, semakin tenang kamu saat rencana itu berubah.

Contoh:
Ambil ide film pendekmu dan tulis dalam satu kalimat logline. Lalu tulis daftar keputusan development: durasi, jumlah tokoh, jumlah lokasi, dan perkiraan biaya. Setelah itu buat daftar cek praproduksi berisi delapan hal yang harus selesai sebelum hari syuting pertama, misalnya naskah final, izin lokasi, dan call sheet. Tandai mana yang sudah bisa kamu selesaikan minggu ini.

Ringkasan:
Development mengubah ide menjadi naskah dan ruang lingkup yang jelas, sedangkan pre-production menyiapkan segala sesuatu sebelum syuting, dari casting sampai storyboard. Memperbaiki kesalahan di atas kertas hampir tidak berbiaya, tetapi memperbaikinya di lokasi syuting sangat mahal. Praproduksi yang rapi bukan birokrasi, melainkan asuransi bagi filmmu.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('31000000-0000-4000-8000-000000000903', '21000000-0000-4000-8000-000000000009', 'Breakdown skenario', 3, null, $$Tujuan:
Setelah pelajaran ini, kamu dapat membuat script breakdown dari sebuah naskah pendek dan menjelaskan bagaimana breakdown menjadi dasar bagi shot list, storyboard, jadwal, dan anggaran.

Penjelasan:
Script breakdown adalah langkah pertama mengubah naskah menjadi rencana kerja. Kamu membaca naskah adegan demi adegan dan mencatat semua kebutuhan fisiknya: siapa pemainnya, di lokasi mana adegan itu terjadi, properti apa yang dipakai, kostum seperti apa, efek apa yang dibutuhkan, dan kebutuhan khusus lainnya. Inilah dasar dari jadwal dan anggaran: tanpa breakdown, kamu tidak tahu apa yang harus disiapkan, berapa biayanya, dan berapa lama syutingnya.

Dari breakdown, sutradara bersama sinematografer (DOP) menyusun shot list, yaitu daftar setiap shot yang akan diambil beserta ukuran shot, sudut kamera, gerakan, dan perlengkapannya. Shot list memastikan tidak ada shot penting yang terlupakan di lokasi dan membantu kru kamera menyiapkan peralatan yang tepat untuk setiap setup.

Langkah berikutnya adalah storyboard, yaitu sketsa visual shot demi shot. Tidak perlu bagus gambarnya; yang penting semua orang membayangkan adegan yang sama. Storyboard membantu sutradara, DOP, dan kru artistik menyepakati tampilan adegan sebelum hari syuting, sehingga perdebatan soal gambar tidak terjadi di lokasi saat waktu sedang berjalan.

Terakhir, ada stripboard, yaitu jadwal syuting dalam bentuk visual: satu strip untuk setiap adegan, dikelompokkan berdasarkan lokasi dan waktu cerita (siang atau malam, interior atau eksterior) agar syuting efisien. Adegan tidak diambil sesuai urutan cerita, melainkan sesuai logistik. Misalnya semua adegan di kelas diambil di hari yang sama, supaya kru tidak perlu membongkar dan memasang peralatan dua kali. Shot list juga membantu di sini: karena setiap shot sudah didaftar sebelumnya, kru kamera tahu persis peralatan apa yang harus disiapkan untuk setiap setup dan tidak ada waktu yang hilang karena menunggu alat yang tertinggal.

Contoh:
Ambil naskah pendek sepanjang 1-2 halaman. Buat tabel breakdown dengan kolom adegan, lokasi, pemain, properti, dan kostum, lalu isi untuk setiap adegan. Dari tabel itu, susun stripboard dua hari dengan mengelompokkan adegan berdasarkan lokasi, bukan urutan cerita. Tulis satu kalimat untuk menjelaskan alasan pengelompokanmu, lalu buat shot list singkat berisi tiga shot pertama dari adegan pembuka: ukuran shot, sudut kamera, dan gerakannya.

Ringkasan:
Script breakdown mengurai naskah menjadi daftar kebutuhan produksi per adegan. Dari breakdown lahir shot list dan storyboard yang menyepakati gambar, lalu stripboard yang menyusun adegan berdasarkan logistik lokasi dan waktu. Urutan kerja ini memastikan tidak ada kebutuhan yang terlupakan dan tidak ada waktu syuting yang terbuang.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('31000000-0000-4000-8000-000000000904', '21000000-0000-4000-8000-000000000009', 'Budgeting dan pengelolaan biaya', 4, null, $$Tujuan:
Setelah pelajaran ini, kamu dapat menyusun anggaran sederhana untuk film pendek dari hasil script breakdown dan menjelaskan mengapa anggaran harus selalu menyisakan dana cadangan.

Penjelasan:
Anggaran dibuat dari breakdown: setiap kebutuhan yang tercatat diberi harga. Prinsipnya adalah hitung kebutuhan nyata dulu, baru sesuaikan dengan uang yang ada, bukan sebaliknya. Kalau kamu memulai dari jumlah uang lalu memaksakan kebutuhan masuk ke dalamnya, biasanya ada kebutuhan penting yang terpotong diam-diam dan baru ketahuan di hari syuting. Mulailah dari daftar kebutuhan yang jujur, lalu cari cara menghematnya.

Kategori biaya film pendek biasanya meliputi kru dan konsumsi, lokasi dan izin, peralatan, properti dan kostum, transportasi, serta pascaproduksi seperti editing dan musik. Konsumsi bukan kemewahan: air minum, makanan ringan, dan waktu makan harus masuk anggaran dan jadwal, karena kru yang lapar dan kelelahan membuat kesalahan. Film pelajar bisa menekan banyak biaya dengan memakai lokasi gratis seperti sekolah, merangkap peran kru, dan meminjam peralatan, tetapi biaya yang ditekan harus dicatat dengan jujur supaya kamu tahu apa yang sebenarnya dibutuhkan filmmu.

Selalu sisakan dana cadangan untuk hal tak terduga. Hujan bisa membatalkan adegan luar ruangan, lokasi bisa tiba-tiba tidak bisa dipakai, peralatan bisa rusak. Contoh alokasi anggaran untuk film pendek 3-5 menit hanyalah ilustrasi, bukan aturan baku, tetapi satu hal yang tidak boleh ditawar: dana cadangan wajib ada. Tanpa cadangan, satu kejadian tak terduga bisa menghentikan seluruh produksi. Selama produksi berjalan, catat setiap pengeluaran harian dan bandingkan dengan anggaran: produser yang tahu ke mana uang pergi setiap hari tidak akan terkejut di akhir proyek, sedangkan tim yang baru menghitung di akhir biasanya menemukan uangnya sudah habis sebelum editing selesai.

Contoh:
Dari breakdown yang kamu buat di pelajaran sebelumnya, buat tabel anggaran: tiap kebutuhan, perkiraan harganya, dan totalnya. Sisakan minimal 10 persen dari total sebagai dana cadangan. Lalu tulis satu kalimat: apa yang akan kamu potong kalau totalnya melebihi uang yang ada, tanpa mengorbankan cerita?

Ringkasan:
Anggaran disusun dari breakdown dengan memberi harga pada setiap kebutuhan nyata, baru kemudian disesuaikan dengan uang yang tersedia. Konsumsi dan kebutuhan kru adalah biaya yang sah, bukan kemewahan. Dana cadangan wajib selalu ada, karena hal tak terduga seperti hujan, lokasi batal, dan peralatan rusak hampir selalu terjadi.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('31000000-0000-4000-8000-000000000905', '21000000-0000-4000-8000-000000000009', 'Scheduling dan shooting schedule', 5, null, $$Tujuan:
Setelah pelajaran ini, kamu dapat menyusun jadwal syuting dua hari dan menulis satu call sheet lengkap untuk hari syuting pertama.

Penjelasan:
Jadwal syuting disusun dari stripboard, bukan dari urutan cerita. Adegan dikelompokkan berdasarkan lokasi dan waktu cerita (siang atau malam, interior atau eksterior), supaya kru tidak membongkar dan memasang peralatan berulang kali. Misalnya, semua adegan di kelas diambil di hari yang sama, walaupun dalam cerita adegan-adegan itu terjadi di pagi, siang, dan sore yang berbeda. Itulah logika stripboard: hemat waktu, hemat tenaga, hemat uang.

Setiap hari syuting mengikuti ritme yang sama: blocking adegan bersama aktor, lalu lighting, lalu latihan, dan baru kemudian pengambilan gambar per setup. Setiap take ditandai dengan slate (clapperboard) agar gambar dan suara bisa disatukan di editing, sedangkan shot tanpa suara ditandai MOS. Satu hari syuting yang realistis untuk tim pelajar hanya mampu menyelesaikan 4-6 setup. Jangan menulis jadwal 15 adegan dalam sehari, karena jadwal yang tidak realistis akan runtuh di tengah hari dan membuat seluruh tim panik.

Dokumen yang mengatur satu hari syuting disebut call sheet. Ia dibagikan malam sebelum syuting dan berisi siapa yang dibutuhkan, adegan apa yang diambil dan dalam urutan apa, jam kedatangan tiap orang, lokasi, prakiraan cuaca, dan nomor darurat termasuk rumah sakit terdekat. Call sheet adalah satu-satunya sumber kebenaran di hari syuting: kalau ada yang bingung harus datang jam berapa atau adegan apa yang diambil dulu, jawabannya ada di call sheet.

Contoh:
Tulis satu call sheet lengkap untuk hari syuting pertama filmmu: tanggal, lokasi, jam kedatangan tiap orang, urutan adegan yang diambil, dan kontak darurat. Lalu buat stripboard dua hari seperti contoh di modul: hari 1 pagi adegan 3 di kelas, hari 1 siang adegan 1 di kelas, hari 1 sore adegan 5 di kantin, dan seterusnya. Tulis satu kalimat yang menjelaskan mengapa adegan-adegan itu kamu kelompokkan seperti itu.

Ringkasan:
Jadwal syuting disusun berdasarkan logistik lokasi dan waktu, bukan urutan cerita, dan satu hari yang realistis bagi tim pelajar hanya berisi 4-6 setup. Setiap hari mengikuti ritme blocking, lighting, latihan, lalu pengambilan gambar. Call sheet yang dibagikan malam sebelumnya mengatur siapa datang jam berapa, adegan apa yang diambil, dan nomor darurat yang harus dihubungi.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('32000000-0000-4000-8000-000000000901', '22000000-0000-4000-8000-000000000009', 'Lokasi, perizinan, logistik', 1, null, $$Tujuan:
Setelah pelajaran ini, kamu dapat menjelaskan langkah mendapatkan izin lokasi dan izin tampil, serta merencanakan logistik dan keselamatan untuk satu hari syuting.

Penjelasan:
Syuting di sekolah, pasar, atau rumah orang lain selalu butuh izin pemilik atau pengelolanya. Minta izin tertulis dan sampaikan jadwal, jumlah kru, dan apa yang akan direkam. Izin lisan yang dilupakan adalah sumber konflik paling umum di film pelajar: pemilik lokasi bisa berubah pikiran, atau orang lain yang merasa berhak atas tempat itu bisa datang dan menghentikan syuting. Izin tertulis melindungi tim dan pemilik lokasi sekaligus, karena semua pihak tahu apa yang disepakati.

Selain izin lokasi, ada izin tampil atau release form. Orang yang muncul jelas di filmmu sebaiknya menandatangani formulir persetujuan tampil. Untuk anak di bawah umur, minta tanda tangan orang tuanya. Ini penting terutama kalau filmmu akan diunggah ke platform daring atau dikirim ke festival, karena tanpa persetujuan, seseorang bisa meminta filmmu diturunkan.

Keselamatan adalah bagian dari logistik, bukan tambahan. Jangan syuting di jalan raya tanpa pengaman, jangan memanjat tanpa pengawas, dan siapkan kotak P3K. 1st AD bertanggung jawab atas keselamatan di lokasi. Cuaca juga harus direncanakan: selalu punya rencana B, supaya adegan luar ruangan yang batal karena hujan punya pengganti adegan dalam ruangan. Terakhir, jangan lupa logistik kecil yang sering menghentikan syuting: baterai kamera dan perekam terisi penuh plus cadangan, kartu memori kosong dan sudah diformat plus cadangan, serta air minum dan konsumsi untuk seluruh kru. Daftar periksa hari syuting di lampiran modul bisa kamu pakai sebagai patokan: izin lokasi, call sheet yang sudah dibagikan, baterai dan kartu memori, naskah dan shot list yang dibawa, konsumsi, kotak P3K dan nomor darurat, serta room tone yang direncanakan di setiap lokasi. Satu item yang terlewat bisa menghentikan satu hari syuting.

Contoh:
Buat daftar periksa logistik lokasi untuk satu hari syuting filmmu: izin lokasi tertulis, release form semua pemain, kotak P3K dan nomor darurat, baterai dan kartu memori cadangan, konsumsi dan air minum, serta rencana B kalau hujan. Centang mana yang sudah kamu siapkan, dan tulis tanggal kapan sisanya akan kamu urus.

Ringkasan:
Izin lokasi harus tertulis dan izin tampil harus ditandatangani, terutama untuk pemain di bawah umur yang membutuhkan persetujuan orang tua. Keselamatan, kotak P3K, dan rencana cadangan cuaca adalah tanggung jawab produksi, bukan urusan belakangan. Logistik kecil seperti baterai cadangan dan kartu memori yang sudah diformat sering menjadi penentu apakah satu hari syuting berjalan atau berhenti.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('32000000-0000-4000-8000-000000000902', '22000000-0000-4000-8000-000000000009', 'Manajemen kru dan komunikasi', 2, null, $$Tujuan:
Setelah pelajaran ini, kamu dapat menjelaskan struktur departemen kru film, dua rantai komando di lokasi syuting, dan aturan komunikasi yang membuat hari syuting berjalan tertib.

Penjelasan:
Kru film bekerja dalam sistem departemen, dan setiap departemen dipimpin seorang kepala departemen yang bertanggung jawab atas bidangnya. Departemen produksi dipimpin produser atau line producer dan mengurus uang, anggaran, jadwal, izin, dan keseluruhan proyek dari awal sampai selesai. Departemen penyutradaraan dipimpin sutradara bersama 1st AD: sutradara menjaga visi kreatif dan arahan pemain, sedangkan 1st AD menjalankan jadwal dan jalannya lokasi. Departemen kamera dipimpin DOP atau sinematografer yang merancang tampilan gambar, departemen suara dipimpin production sound mixer yang merekam dialog bersih dibantu operator boom, departemen artistik dipimpin production designer yang membangun dunia visual, dan pascaproduksi dipimpin editor.

Ada dua rantai komando yang berjalan sejajar. Rantai kreatif dipimpin sutradara dan menjawab pertanyaan film seperti apa yang kita buat, sedangkan rantai logistik dipimpin produser dan menjawab pertanyaan bagaimana hari ini bisa berjalan, soal uang, jadwal, dan izin. Fakta penting yang sering disalahpahami pemula: yang menjalankan hari syuting adalah Asisten Sutradara 1 (1st AD), bukan sutradara. 1st AD menyusun jadwal syuting dari breakdown, menulis call sheet, menjaga ketepatan waktu, dan bertanggung jawab atas keselamatan di lokasi.

Peran lain yang wajib kamu kenal adalah script supervisor yang mencatat kontinuitas setiap take, gaffer yang menjalankan rencana pencahayaan DOP, dan key grip yang mengurus penyangga kamera dan rigging. Dalam film pendek sekolah, satu orang boleh merangkap, misalnya sutradara merangkap editor, tetapi produser dan sutradara sebaiknya tetap dua orang berbeda, supaya ada yang menjaga visi dan ada yang menjaga jadwal.

Di lokasi berlaku aturan satu suara komando. Hanya 1st AD yang memanggil quiet on set dan roll sound serta mengatur giliran, sedangkan sutradara yang memanggil action dan cut. Kalau semua orang berteriak, lokasi menjadi kacau dan aktor tidak tahu harus mendengarkan siapa.

Contoh:
Untuk filmmu, buat bagan kru: tulis nama tiap anggota tim di samping satu peran utama dan satu peran rangkapnya. Lalu tulis aturan komunikasi lokasi dalam tiga kalimat: siapa yang boleh memanggil action, siapa yang mengatur waktu dan keselamatan, dan ke siapa kru melapor kalau ada masalah.

Ringkasan:
Kru film terbagi dalam departemen yang masing-masing dipimpin kepala departemen, dengan dua rantai komando yang sejajar: kreatif di bawah sutradara dan logistik di bawah produser. 1st AD-lah yang menjalankan hari syuting, dari jadwal sampai keselamatan. Di lokasi hanya ada satu suara komando, supaya aktor dan kru tahu instruksi siapa yang harus diikuti.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('32000000-0000-4000-8000-000000000903', '22000000-0000-4000-8000-000000000009', 'Produksi dan problem solving', 3, null, $$Tujuan:
Setelah pelajaran ini, kamu dapat mengelola hari syuting sesuai ritme yang benar dan menyelesaikan masalah yang muncul di lokasi tanpa panik.

Penjelasan:
Hari syuting yang baik dimulai sebelum aktor datang. Produser dan 1st AD memastikan lokasi siap lebih dulu, dan mereka datang paling awal serta pulang paling akhir. Setelah itu hari berjalan mengikuti ritme yang sama untuk setiap setup: blocking, lighting, latihan, lalu pengambilan gambar. Di akhir hari, tonton hasil rekaman hari itu, yang disebut dailies. Kesalahan yang ketahuan di hari yang sama masih bisa diperbaiki besok; yang ketahuan di ruang edit sudah terlambat. Jangan lupa konsumsi dan istirahat: kru yang lapar dan kelelahan membuat kesalahan, dan menjadwalkan makan adalah manajemen, bukan kemewahan.

Tidak ada syuting yang berjalan 100 persen sesuai rencana. Aktor sakit, lokasi tiba-tiba dipakai orang lain, hujan turun di adegan luar ruangan. Produser yang baik tidak panik: ia mengubah urutan adegan, memindahkan adegan yang bisa dipindah, dan memberi tahu semua orang tentang perubahan itu secepat mungkin. Aturan emasnya adalah kabari perubahan sebelum orang lain mengetahuinya dari orang lain. Kalau kru mendengar kabar dari gosip, bukan dari produser, kepercayaan pada pimpinan langsung runtuh.

Konflik antaranggota tim diselesaikan dengan kembali ke naskah dan jadwal: apa yang paling penting untuk cerita, dan apa yang bisa kita korbankan hari ini? Keputusan yang diambil bersama dan dicatat akan lebih mudah diterima daripada keputusan sepihak yang diumumkan tiba-tiba. Ingat studi kasus tim yang syutingnya diselamatkan praproduksi: karena mereka punya rencana cadangan dan call sheet berisi nomor kontak semua orang, taman yang ditutup mendadak tidak menghentikan syuting mereka. Pelajarannya adalah praproduksi bukan birokrasi, melainkan asuransi.

Contoh:
Tulis tiga skenario masalah untuk filmmu: aktor utama telat dua jam, hujan turun di adegan luar ruangan, dan kartu memori penuh di tengah hari. Untuk masing-masing, tulis langkah pertama yang kamu lakukan dalam sepuluh menit pertama. Lalu jawab: adegan mana yang tetap diambil hari ini, dan adegan mana yang dipindah ke hari lain?

Ringkasan:
Hari syuting berjalan dengan ritme blocking, lighting, latihan, dan pengambilan gambar, lalu ditutup dengan menonton dailies selagi kesalahan masih bisa diperbaiki. Masalah pasti muncul, dan penyelesaiannya adalah mengubah urutan adegan, memindahkan yang bisa dipindah, dan mengabari semua orang secepat mungkin. Konflik diselesaikan dengan kembali ke naskah dan jadwal, bukan dengan keputusan sepihak.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('32000000-0000-4000-8000-000000000904', '22000000-0000-4000-8000-000000000009', 'Post-production dan distribusi', 4, null, $$Tujuan:
Setelah pelajaran ini, kamu dapat menjelaskan urutan kerja pascaproduksi dari assembly cut sampai file master, dan merencanakan tiga jalur distribusi untuk film pendekmu.

Penjelasan:
Pascaproduksi dimulai sejak hari pertama syuting, saat rekaman harian dikirim ke tim edit. Menunggu sampai semua syuting selesai baru mulai editing adalah kesalahan umum pemula. Urutan kerjanya adalah assembly cut, yaitu semua materi dirangkai sesuai urutan naskah, lalu rough cut, yaitu potongan yang diperketat untuk menguji struktur dan ritme cerita. Berikutnya adalah picture lock: gambar dikunci dan tidak ada lagi perubahan potongan. Setelah picture lock, barulah tim suara, musik, dan color grading bekerja penuh. Terakhir dibuat judul, credit, dan file master untuk distribusi.

Aturan yang paling penting di tahap ini adalah jangan membiarkan revisi gambar terus berjalan setelah picture lock. Setiap perubahan gambar setelah gambar dikunci akan merusak pekerjaan suara dan musik yang sudah disesuaikan dengan potongan itu, sehingga tim suara harus mengulang pekerjaannya. Disiplin picture lock adalah tanda tim yang profesional.

Setelah film selesai, ia harus sampai ke penonton. Jalur pertama adalah pemutaran sekolah dan komunitas, cara tercepat mendapat penonton dan umpan balik jujur, dan siapkan sesi tanya jawab setelah pemutaran. Jalur kedua adalah festival film pelajar: baca syaratnya dengan teliti, seperti durasi maksimal, tahun produksi, format file, dan tenggat, lalu kirim jauh sebelum tenggat. Jalur ketiga adalah platform daring seperti YouTube dan media sosial, yang cocok untuk jangkauan luas, tetapi perhatikan hak musik dan izin narasumber serta lokasi sebelum mengunggah. Umpan balik adalah distribusi juga: catat reaksi penonton, adegan mana yang membingungkan, di mana mereka tertawa atau bosan, karena itu bahan perbaikan filmmu berikutnya.

Contoh:
Pilih dua festival film pelajar, satu di Indonesia dan satu internasional, lalu catat syarat, tenggat, dan biayanya, dan tulis mengapa filmmu cocok untuk masing-masing. Setelah itu buat pitch satu menit untuk filmmu: logline, kenapa cerita ini penting, dan siapa penontonnya. Latih sampai bisa disampaikan tanpa membaca.

Ringkasan:
Pascaproduksi berjalan dari assembly cut ke rough cut, lalu picture lock, dan baru setelah gambar dikunci tim suara, musik, dan color grading bekerja penuh. Revisi gambar setelah picture lock dilarang karena merusak pekerjaan tim lain. Distribusi film pendek bisa lewat pemutaran sekolah, festival pelajar, dan platform daring, dan reaksi penonton di setiap jalur itu adalah bahan perbaikan untuk film berikutnya.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('32000000-0000-4000-8000-000000000905', '22000000-0000-4000-8000-000000000009', 'Evaluasi dan laporan produksi', 5, null, $$Tujuan:
Setelah pelajaran ini, kamu dapat melakukan wrap dengan benar, memimpin evaluasi tim selama 30 menit, dan menulis laporan produksi satu halaman.

Penjelasan:
Hari terakhir syuting disebut wrap, dan pekerjaan di hari itu sering dilupakan pemula. Kembalikan peralatan yang disewa dalam kondisi baik dan catat kerusakannya, kembalikan lokasi seperti semula dan ucapkan terima kasih kepada pemiliknya, salin semua rekaman ke dua tempat penyimpanan yang berbeda, dan kumpulkan semua dokumen, seperti call sheet, catatan kontinuitas, dan formulir izin, dalam satu folder. Satu langkah yang terlewat di wrap bisa menimbulkan masalah berminggu-minggu kemudian, misalnya rekaman yang hanya tersimpan di satu kartu memori yang rusak.

Setelah wrap, adakan evaluasi tim selama 30 menit. Tiga pertanyaan yang dijawab bersama: apa yang berjalan baik, apa yang kacau, dan apa yang akan diubah di proyek berikutnya. Evaluasi ini ditulis satu halaman dan disimpan bersama paket praproduksi. Ia adalah warisan paling berharga untuk tim berikutnya, karena tim berikutnya tidak perlu mengulang kesalahan yang sama.

Laporan produksi adalah versi tertulis dari evaluasi itu, ditambah perbandingan rencana dan kenyataan. Isinya ringkas: jadwal yang direncanakan dibanding jadwal yang benar-benar terjadi, anggaran yang direncanakan dibanding pengeluaran nyata, masalah yang muncul dan cara penyelesaiannya, serta pelajaran yang dipetik. Laporan yang jujur, termasuk pengakuan soal jadwal yang molor atau biaya yang membengkak, jauh lebih berguna daripada laporan yang berpura-pura semuanya berjalan sempurna. Simpan laporan ini bersama paket praproduksi, call sheet, dan catatan kontinuitas dalam satu folder, supaya tim berikutnya bisa membacanya sebelum memulai proyek mereka dan tidak mengulang kesalahan yang sama.

Contoh:
Setelah syuting adeganmu, adakan evaluasi 30 menit bersama tim. Setiap anggota menulis tiga baris: satu hal yang berjalan baik, satu hal yang kacau, dan satu hal yang akan diubah di proyek berikutnya. Gabungkan jawaban itu menjadi laporan produksi satu halaman dan simpan bersama call sheet, catatan kontinuitas, dan formulir izinmu.

Ringkasan:
Wrap berarti mengembalikan peralatan dan lokasi dengan baik, menyalin rekaman ke dua tempat penyimpanan, dan mengumpulkan semua dokumen dalam satu folder. Evaluasi tim selama 30 menit menjawab apa yang berjalan baik, apa yang kacau, dan apa yang akan diubah, lalu ditulis menjadi laporan produksi satu halaman. Laporan yang jujur adalah warisan paling berharga untuk tim berikutnya.$$)
on conflict (id) do nothing;

-- ==================== COURSE 10: Akting untuk Kamera ====================

insert into public.modules (id, course_id, title, order_index) values
  ('21000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000a', 'Section 1 — Minggu 1', 1)
on conflict (id) do nothing;

insert into public.modules (id, course_id, title, order_index) values
  ('22000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000a', 'Section 2 — Minggu 2', 2)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('31000000-0000-4000-8000-000000000a01', '21000000-0000-4000-8000-00000000000a', 'Akting panggung vs kamera', 1, null, $$Tujuan:
Setelah pelajaran ini, kamu dapat menjelaskan perbedaan akting panggung dan akting kamera, serta menyesuaikan ukuran permainanmu dengan ukuran shot yang dipakai.

Penjelasan:
Akting panggung dan akting kamera adalah dua keterampilan yang berbeda. Di panggung, kamu bermain untuk penonton di baris paling belakang: suara harus sampai ke balkon dan gerakan harus terbaca dari jarak 30 meter. Di depan kamera, penontonmu adalah sebuah lensa yang berjarak satu meter dari wajahmu. Lensa itu menangkap keraguan di matamu, tarikan napasmu, dan kedipan yang bahkan tidak kamu sadari. Karena itu, akting kamera menuntut hal yang berlawanan dengan intuisi panggung: lebih kecil, lebih jujur, dan lebih terkendali.

Perbedaannya terlihat di banyak aspek. Penonton panggung itu hidup dan berjarak puluhan meter, sedangkan penonton kamera adalah lensa yang dekat lalu layar. Suara panggung harus diproyeksikan sampai baris belakang, sedangkan suara kamera cukup seperti percakapan biasa karena mikrofon yang bekerja. Ukuran permainan panggung harus besar agar terbaca dari balkon, sedangkan ukuran permainan kamera harus kecil dan jujur agar pas di close-up. Cerita panggung berjalan dari awal sampai akhir setiap malam, sedangkan adegan film diambil tidak berurutan. Pertunjukan panggung hanya tampil sekali, sedangkan momen yang sama di film diulang take demi take dari berbagai sudut. Naskah panggung biasanya sudah terkunci, sedangkan dialog film bisa berubah di hari syuting.

Latihan panggung tetap berguna: suara, napas, dan kehadiran panggung terbawa ke kamera. Yang berubah adalah ukurannya, dan itu penyesuaian pertama yang harus dikuasai setiap aktor panggung yang pindah ke layar. Aturan praktisnya adalah semakin dekat kamera, semakin kecil ekspresi yang dibutuhkan. Pada wide shot, seluruh tubuh dan ruang terlihat, jadi postur dan cara berjalan yang bercerita. Pada medium shot dari pinggang ke atas, tangan dan bahu mulai terbaca, jadi jaga gestur tetap di dalam frame. Pada close-up, pikiran yang terbaca: satu lirikan bisa menggantikan gestur besar di panggung. Pada extreme close-up mata atau mulut, yang dibutuhkan adalah keheningan, karena diam yang jujur lebih kuat daripada ekspresi yang dibuat-buat.

Contoh:
Pilih monolog satu menit, boleh dari naskah yang sudah kamu tulis. Rekam tiga kali: wide shot, medium shot, dan close-up. Tonton ketiganya dan tulis jawabanmu: gestur apa yang terasa berlebihan di close-up, dan apa yang hilang di wide shot? Bandingkan ukuran permainanmu di ketiga rekaman itu.

Ringkasan:
Panggung bermain untuk penonton yang jauh sehingga butuh suara dan gerakan besar, sedangkan kamera bermain untuk lensa yang dekat sehingga butuh permainan yang kecil, jujur, dan terkendali. Ukuran shot menentukan ukuran permainan: semakin dekat kamera, semakin kecil ekspresi yang dibutuhkan. Latihan panggung tetap berguna, tetapi ukurannya harus disesuaikan dengan lensa.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('31000000-0000-4000-8000-000000000a02', '21000000-0000-4000-8000-00000000000a', 'Memahami karakter', 2, null, $$Tujuan:
Setelah pelajaran ini, kamu dapat membangun karakter dengan menjawab tiga pertanyaan tentang tokohmu dan mengisi kartu karakter sebelum rehearsal pertama.

Penjelasan:
Sebelum menghafal dialog, jawab tiga pertanyaan tentang tokohmu. Pertama, apa yang paling diinginkan tokoh ini dalam adegan ini? Kedua, apa yang menghalanginya? Ketiga, apa yang akan ia lakukan untuk mendapatkannya? Jawaban atas tiga pertanyaan ini, yaitu tujuan, hambatan, dan tindakan, adalah bahan bakar akting yang sesungguhnya. Aktor yang hanya menghafal kata-kata akan terdengar seperti membaca, sedangkan aktor yang mengejar tujuan akan terdengar seperti hidup. Tulis jawabanmu dalam tiga kalimat dan tempel di naskahmu. Setiap kali kamu merasa aktingmu datar, kembali ke tiga kalimat itu.

Tiga pertanyaan itu kemudian dituangkan ke dalam kartu karakter, yaitu lembar kerja yang diisi untuk setiap tokoh sebelum rehearsal pertama. Kartu karakter mencatat tujuan tokoh dalam adegan, hambatan yang ia hadapi, dan tindakan yang ia lakukan, ditambah ciri fisik dan kebiasaan tokoh, seperti cara berjalan, cara bicara, dan benda yang selalu ia bawa. Detail kecil seperti itu membuat tokoh terasa nyata dan konsisten dari adegan ke adegan.

Aktor terbaik adalah pengamat manusia yang baik, dan pengamatan bisa dilatih di mana saja. Di kantin atau halte, amati satu orang selama dua menit tanpa menatap secara terang-terangan. Catat bagaimana ia berdiri saat menunggu, apa yang dilakukan tangannya, dan apa yang berubah saat yang ditunggu datang. Pilih satu kebiasaan kecil yang kamu amati, misalnya cara seseorang memegang gelas atau cara berjalan saat lelah, dan coba mainkan di depan cermin. Tujuannya bukan menertawakan orang itu, melainkan memahami bagaimana tubuh bercerita. Dengarkan juga nada percakapan di sekitarmu: kapan suara seseorang naik, kapan ia berhenti bicara. Nada sering lebih jujur daripada kata-kata.

Contoh:
Isi satu kartu karakter untuk tokoh filmmu: tujuan dalam adegan, hambatan, tindakan, plus tiga ciri fisik atau kebiasaan. Lalu jawab tiga pertanyaan karakter itu dalam tiga kalimat dan tempel di naskahmu. Setelah itu, amati satu orang di kantin selama dua menit dan catat satu kebiasaan kecilnya yang bisa kamu pinjam untuk tokohmu.

Ringkasan:
Karakter dibangun dari tiga pertanyaan: apa yang diinginkan tokoh, apa yang menghalanginya, dan apa yang akan ia lakukan. Jawaban itu ditulis dalam tiga kalimat, dituangkan ke kartu karakter beserta ciri fisik dan kebiasaan tokoh. Aktor yang mengejar tujuan terdengar hidup, sedangkan aktor yang hanya menghafal kata-kata terdengar seperti membaca.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('31000000-0000-4000-8000-000000000a03', '21000000-0000-4000-8000-00000000000a', 'Ekspresi dan emosi', 3, null, $$Tujuan:
Setelah pelajaran ini, kamu dapat memainkan emosi dengan ukuran yang tepat untuk kamera, terutama lewat mata dan ekspresi kecil yang jujur.

Penjelasan:
Bayangkan skala emosi dari 1 sampai 10. Di panggung, kamu sering harus bermain di angka 8 atau 9 supaya penonton di baris belakang merasakannya. Di depan kamera, close-up hanya butuh emosi kecil yang jujur, sering kali di angka 3 atau 4. Kamera yang berjarak satu meter dari wajahmu sudah menangkap detail terkecil: keraguan di mata, tarikan napas, dan kedipan. Ekspresi besar yang wajar di panggung akan terlihat dibuat-buat begitu masuk close-up.

Emosi yang baik juga naik bertahap, bukan langsung meledak. Dalam adegan pertengkaran panjang yang terkenal di film Marriage Story, emosi naik sedikit demi sedikit, dan jeda di antara kalimat sama pentingnya dengan kalimat itu sendiri. Jeda memberi penonton waktu merasakan apa yang dipikirkan tokoh, dan memberi aktor waktu untuk benar-benar memikirkan kalimat berikutnya, bukan sekadar menunggu giliran bicara.

Latihan yang paling langsung untuk close-up adalah latihan wajah. Di depan cermin, tunjukkan tiga emosi, yaitu ragu, lega, dan marah, hanya dengan mata dan alis, tanpa menggerakkan mulut. Ini melatihmu menyampaikan perasaan lewat bagian wajah yang paling dibaca kamera. Pada extreme close-up mata atau mulut, yang dibutuhkan bahkan adalah keheningan: diam yang jujur lebih kuat daripada ekspresi yang dibuat-buat. Film The Lunchbox adalah contoh akting yang sangat tenang dan kecil, di mana perasaan disampaikan lewat tatapan dan keheningan, bukan lewat dialog panjang.

Ingat juga bahwa emosi harus punya tujuan. Arahan seperti lebih sedih adalah penilaian, bukan sesuatu yang bisa dimainkan. Aktor membutuhkan situasi yang bisa diperankan, misalnya tokoh yang baru kehilangan barang berharga dan berusaha tidak menangis di depan adiknya. Dengan situasi itu, emosi muncul sendiri dari usaha tokoh menahan tangisnya, bukan dari perintah untuk bersedih.

Contoh:
Di depan cermin, mainkan tiga emosi, yaitu ragu, lega, dan marah, hanya dengan mata dan alis tanpa menggerakkan mulut. Rekam close-up 10 detik untuk tiap emosi, lalu tonton tanpa suara dan tanyakan ke temanmu: emosi apa yang mereka baca? Kalau tebakan mereka berbeda dengan maksudmu, ulangi dengan perubahan kecil pada tatapan atau alismu.

Ringkasan:
Close-up membutuhkan emosi kecil yang jujur, bukan ledakan besar, karena kamera yang dekat sudah menangkap detail wajah dan mata. Emosi yang baik naik bertahap, dan jeda di antara kalimat sama pentingnya dengan kalimat itu sendiri. Latihan wajah dengan mata dan alis melatihmu menyampaikan perasaan tanpa dialog, dan emosi harus selalu lahir dari situasi tokoh, bukan dari perintah untuk bersedih.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('31000000-0000-4000-8000-000000000a04', '21000000-0000-4000-8000-00000000000a', 'Gesture dan body language', 4, null, $$Tujuan:
Setelah pelajaran ini, kamu dapat menggunakan postur, gestur, dan cara berjalan untuk bercerita, dengan ukuran yang sesuai untuk setiap jenis shot.

Penjelasan:
Tubuh bercerita bahkan sebelum tokoh mengucapkan satu kata pun. Pada wide shot, seluruh tubuh dan ruang di sekitar aktor terlihat, jadi postur dan cara berjalan yang bercerita: bahu yang tegak, langkah yang cepat, atau punggung yang membungkuk langsung memberi tahu penonton siapa tokoh ini dan bagaimana perasaannya. Pada medium shot dari pinggang ke atas, tangan dan bahu mulai terbaca, jadi gestur harus dijaga tetap di dalam frame dan tidak berlebihan. Pada close-up, tubuh hampir tidak terlihat, sehingga gestur besar justru mengganggu dan harus diganti ekspresi wajah yang kecil.

Kesadaran tubuh bisa dilatih dalam tiga menit. Berdiri tegak, kendurkan bahu, lalu berjalan mengelilingi ruangan dengan tiga cara: tergesa-gesa, santai, dan lelah. Rasakan bagaimana cara berjalan mengubah perasaanmu. Saat berjalan tergesa-gesa, napasmu memendek dan bahumu menegang. Saat berjalan lelah, langkahmu menyeret dan kepalamu menunduk. Tubuh dan perasaan saling memengaruhi: mengubah cara berjalan bisa mengubah emosi yang kamu rasakan, dan itu adalah alat akting yang bisa kamu pakai secara sadar.

Contoh terbaik datang dari film 12 Angry Men, di mana dua belas aktor berada dalam satu ruangan. Perhatikan bagaimana setiap aktor membangun karakter hanya dari cara duduk, cara bicara, dan cara mendengarkan. Tidak ada yang berteriak atau bergerak besar, tetapi penonton bisa membedakan kedua belas tokoh itu hanya dari bahasa tubuh mereka. Gestur yang baik selalu punya tujuan: ia menunjukkan apa yang diinginkan tokoh atau apa yang ia sembunyikan, bukan sekadar hiasan di atas dialog.

Contoh:
Berjalan mengelilingi ruangan dengan tiga cara, yaitu tergesa-gesa, santai, dan lelah, sambil direkam dalam wide shot. Tonton rekamannya dan tulis: apa yang berubah di bahu, langkah, dan kecepatanmu pada tiap cara berjalan? Lalu pilih satu cara berjalan untuk tokoh filmmu dan jelaskan alasannya dalam dua kalimat.

Ringkasan:
Pada wide shot, postur dan cara berjalan yang bercerita, pada medium shot tangan dan bahu mulai terbaca, dan pada close-up gestur besar harus diganti ekspresi kecil. Cara berjalan mengubah perasaan, sehingga tubuh bisa dipakai secara sadar untuk membangun emosi tokoh. Gestur yang baik selalu punya tujuan dan menunjukkan apa yang diinginkan atau disembunyikan tokoh.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('31000000-0000-4000-8000-000000000a05', '21000000-0000-4000-8000-00000000000a', 'Dialog dan artikulasi', 5, null, $$Tujuan:
Setelah pelajaran ini, kamu dapat mengucapkan dialog dengan jelas dan natural di depan mikrofon, serta mengatasi lupa dialog di tengah take tanpa keluar dari karakter.

Penjelasan:
Suara untuk kamera berbeda dengan suara untuk panggung. Di panggung, suaramu harus diproyeksikan sampai baris belakang. Di depan kamera, cukup bicara seperti percakapan biasa, karena mikrofon yang bekerja. Justru suara yang terlalu keras dan terlalu jelas terdengar seperti pidato, bukan seperti orang sungguhan yang sedang berbicara. Yang dibutuhkan adalah artikulasi yang bersih pada volume percakapan, supaya setiap kata tertangkap mikrofon tanpa terdengar dibuat-buat.

Sebelum syuting, lakukan pemanasan suara selama tiga menit. Ucapkan vokal A-I-U-E-O dengan mulut terbuka lebar, lalu baca satu kalimat dengan tiga kecepatan berbeda: lambat, normal, dan cepat. Pemanasan ini melenturkan otot mulut dan rahang sehingga artikulasimu tidak kaku. Lengkapi dengan latihan pernapasan dua menit: tarik napas lewat hidung selama empat hitungan, tahan empat hitungan, buang lewat mulut enam hitungan, dan ulangi lima kali. Napas yang tenang membuat suara stabil di depan mikrofon dan meredakan gugup sebelum take pertama.

Soal hafalan, hafalkan maksud dan urutan pikiran tokoh, bukan setiap kata. Dialog yang dihafal kata per kata terdengar seperti dibaca, sedangkan dialog yang dipahami terdengar seperti diucapkan. Kalau lupa dialog di tengah take, jangan berhenti mendadak dan meminta maaf. Tetaplah dalam karakter, ulangi kalimat terakhir dengan kata-katamu sendiri, atau minta sutradara mengulang take. Editor bisa memotong bagian itu. Satu hal lagi: umumnya jangan melihat langsung ke kamera, kecuali gayanya memang menembus dinding keempat, seperti vlog atau adegan yang sengaja menyapa penonton. Dalam dialog biasa, tataplah lawan mainmu, bukan lensa.

Contoh:
Lakukan pemanasan napas dan vokal selama lima menit, lalu baca satu kalimat dari filmmu dengan tiga kecepatan: lambat, normal, dan cepat. Rekam ketiganya dan dengarkan: kecepatan mana yang paling natural untuk tokohmu, dan kata mana yang terdengar tidak jelas? Ulangi kalimat itu sekali lagi dengan kecepatan pilihanmu sambil menjaga napas tetap tenang.

Ringkasan:
Dialog kamera diucapkan seperti percakapan biasa dengan artikulasi yang bersih, karena mikrofon yang bekerja, bukan proyeksi suara. Pemanasan vokal dan pernapasan membuat suara stabil dan meredakan gugup. Hafalkan maksud dan urutan pikiran, bukan kata per kata, dan kalau lupa dialog di tengah take, tetaplah dalam karakter dan lanjutkan dengan kata-katamu sendiri.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('32000000-0000-4000-8000-000000000a01', '22000000-0000-4000-8000-00000000000a', 'Blocking aktor', 1, null, $$Tujuan:
Setelah pelajaran ini, kamu dapat melakukan blocking untuk kamera, termasuk memakai mark, menjaga eyeline, dan mematuhi aturan 180 derajat.

Penjelasan:
Blocking adalah rencana posisi dan gerakan aktor dalam adegan: siapa masuk kapan, siapa menyeberang ke jendela, siapa duduk, siapa berdiri. Di film, blocking dibuat bersama kamera, karena gerakan yang bagus membuat adegan terasa natural dan menunjukkan siapa yang berkuasa, tanpa sepatah kata dialog. Selama rehearsal, blocking diuji dengan kamera: apakah posisinya masuk akal, apakah gerakannya masih di dalam frame, dan apakah perpindahan itu membantu cerita atau justru mengacaukannya.

Agar aktor mendarat di tempat yang tepat, dipakai mark, yaitu tanda lakban di lantai, biasanya berbentuk T atau V, yang menandai tempat aktor berhenti. Mark memastikan aktor mendarat dalam fokus dan dalam cahaya yang sudah diatur. Berhenti tepat di mark, atau hitting your mark, adalah keterampilan dasar akting layar, dan ia dilatih dengan pengulangan sampai berhentinya konsisten.

Eyeline adalah arah pandangan aktor. Dalam close-up, aktor menatap sedikit ke samping lensa, ke arah posisi lawan mainnya, agar arah pandang kedua aktor cocok saat potongannya disambung. Kalau eyeline salah, penonton merasa kedua aktor tidak sedang berbicara satu sama lain, walaupun dialognya benar.

Aturan 180 derajat menjaga arah pandang itu tetap masuk akal. Bayangkan garis imajiner antara dua aktor yang berdialog. Kamera harus selalu berada di satu sisi garis itu. Kalau kamera melompat ke sisi lain, A dan B tiba-tiba terlihat bertukar posisi dan penonton bingung. Terakhir, ada cheat, yaitu menggeser sedikit posisi aktor atau benda dari tempat sebenarnya agar shot-nya bekerja. Kalau penonton tidak sadar, itu cheat yang bagus.

Contoh:
Tempel lakban berbentuk T di lantai. Berjalan masuk, berhenti tepat di mark, ucapkan satu kalimat, dan keluar. Ulangi lima kali sampai berhentimu konsisten. Lalu rekam dialog dua orang dengan aturan 180 derajat dan tonton hasilnya: apakah arah pandang kedua aktor saling cocok, dan apakah posisi mereka tetap konsisten dari shot ke shot?

Ringkasan:
Blocking merencanakan posisi dan gerakan aktor bersama kamera, dan diuji saat rehearsal. Mark memastikan aktor berhenti dalam fokus dan cahaya, eyeline memastikan arah pandang cocok saat potongan disambung, dan aturan 180 derajat menjaga kamera tetap di satu sisi garis antara dua aktor. Cheat yang tidak disadari penonton adalah alat yang sah untuk membuat shot bekerja.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('32000000-0000-4000-8000-000000000a02', '22000000-0000-4000-8000-00000000000a', 'Continuity dalam akting', 2, null, $$Tujuan:
Setelah pelajaran ini, kamu dapat menjaga kontinuitas penampilanmu antartake dan antaradegan, supaya potongan dari take yang berbeda tetap tersambung wajar.

Penjelasan:
Adegan film diambil tidak berurutan dan diulang berkali-kali dari sudut yang berbeda. Alasannya adalah logistik: syuting diatur menurut lokasi dan cahaya, bukan urutan cerita. Akibatnya, satu adegan bisa diambil pagi ini dalam medium shot, lalu diulang sorenya dalam close-up, dan adegan yang terjadi sebelumnya dalam cerita justru baru diambil besok. Tantangan bagi aktor adalah mengulang penampilan yang sama persis, take demi take: posisi tangan, isi gelas, nada suara, dan kecepatan berjalan harus sama.

Script supervisor mencatat detail kontinuitas ini, misalnya tangan mana yang memegang cangkir dan seberapa penuh gelasnya, dan catatannya dipakai editor. Tetapi aktor yang baik tidak hanya bergantung pada catatan orang lain: ia mengingat sendiri kontinuitasnya. Sebelum take baru dimulai, tanyakan pada dirimu sendiri: di mana tanganku di akhir take tadi? Bagaimana nada kalimat terakhirku? Latihan ini melatih kesadaran tubuh yang jarang dibutuhkan di panggung, di mana setiap pertunjukan boleh berbeda.

Kontinuitas juga berlaku untuk emosi. Kalau tokohmu baru saja menangis di adegan sebelumnya dalam cerita, tetapi adegan itu diambil tiga hari setelah adegan ini, kamu harus bisa menghadirkan emosi yang sama di hari yang berbeda. Di sinilah kartu karakter dan tiga pertanyaan tentang tujuan tokoh membantumu: selama kamu tahu apa yang diinginkan tokoh dan apa yang menghalanginya, emosi itu bisa dipanggil kembali dengan konsisten. Catatan script supervisor membantu editor menyambung potongan, tetapi aktor yang mengerti alasan emosional di balik setiap adegan tidak perlu menghafal posisi semata: ia memainkan kembali keadaan batin tokohnya, dan tubuhnya mengikuti dengan sendirinya.

Contoh:
Rekam satu adegan pendek dua kali dari dua sudut berbeda, misalnya medium shot lalu close-up. Sebelum take kedua, catat di kertas: posisi tanganmu, benda yang kamu pegang, dan nada kalimat terakhirmu. Tonton kedua take berdampingan dan periksa: apakah potongannya tersambung wajar, atau ada tangan yang tiba-tiba berpindah dan gelas yang tiba-tiba penuh?

Ringkasan:
Karena adegan diambil tidak berurutan dan diulang dari banyak sudut, aktor harus mengulang posisi, benda, nada, dan emosi yang sama di setiap take. Script supervisor mencatat detailnya, tetapi aktor yang baik mengingatnya sendiri dan bertanya sebelum take baru: di mana tanganku di akhir take tadi? Kontinuitas yang terjaga membuat potongan dari take berbeda tersambung wajar dan penonton tidak sadar ada potongan.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('32000000-0000-4000-8000-000000000a03', '22000000-0000-4000-8000-00000000000a', 'Casting dan audition', 3, null, $$Tujuan:
Setelah pelajaran ini, kamu dapat mempersiapkan diri menghadapi audisi film dan memahami apa yang sebenarnya dicari sutradara dalam casting.

Penjelasan:
Audisi adalah bagian normal dari dunia akting, bukan ujian yang harus ditakuti. Sutradara di audisi tidak mencari aktor yang sempurna, melainkan aktor yang tepat untuk tokoh itu dan enak diajak bekerja sama. Itu berarti audisi menilai lebih dari sekadar kemampuan berakting: ia menilai apakah energimu cocok dengan tokohnya dan apakah kamu bisa menerima arahan dengan baik.

Persiapan yang baik dimulai jauh sebelum hari audisi. Baca naskah adegan audisi berulang kali sampai kamu memahami tujuan tokohmu, bukan hanya kata-katanya. Siapkan dua monolog pendek, satu serius dan satu ringan, masing-masing sekitar satu menit, yang bisa kamu mainkan kapan saja tanpa persiapan panjang. Di hari audisi, datang lima belas menit lebih awal, bawa air minum dan naskahmu, dan kenali kamera audisi: audisi film sering direkam, jadi tanyakan di mana kameranya dan ke arah mana eyeline-mu seharusnya.

Selama audisi, dengarkan arahan yang diberikan di tempat. Sutradara sering mengubah arahan di tengah audisi untuk melihat apakah kamu bisa menyesuaikan diri, dan kemampuan menyesuaikan diri itu sering lebih menentukan daripada take pertamamu. Jangan meminta maaf sebelum mulai: meminta maaf membuat penilai menilaimu lebih rendah sebelum kamu mulai. Kalau ada kesalahan, lanjutkan saja dengan tenang.

Kalau kamu tidak terpilih, itu biasanya bukan karena aktingmu buruk, melainkan karena tokoh itu membutuhkan tinggi badan, usia, atau energi yang berbeda. Minta umpan balik singkat bila memungkinkan, ucapkan terima kasih, dan lanjut ke audisi berikutnya. Setiap audisi adalah latihan, dan aktor yang terus datang ke audisi adalah aktor yang terus belajar.

Contoh:
Siapkan dua monolog satu menit, satu serius dan satu ringan, lalu mainkan keduanya di depan kamera. Setelah itu, minta temanmu memberimu satu arahan baru yang berbeda, misalnya mainkan tokoh yang sama tetapi sedang menahan marah, dan mainkan ulang monolog itu dengan arahan tersebut. Latihan ini meniru momen di audisi sungguhan ketika sutradara mengubah arahan di tengah jalan.

Ringkasan:
Audisi mencari aktor yang tepat untuk tokohnya dan enak diajak bekerja sama, bukan aktor yang sempurna. Persiapannya adalah memahami tujuan tokoh, menyiapkan dua monolog pendek, datang lebih awal, dan mengenali kamera serta eyeline. Di dalam audisi, dengarkan arahan dan sesuaikan dirimu, jangan meminta maaf sebelum mulai, dan kalau tidak terpilih, minta umpan balik lalu lanjut ke audisi berikutnya.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('32000000-0000-4000-8000-000000000a04', '22000000-0000-4000-8000-00000000000a', 'Praktik adegan film', 4, null, $$Tujuan:
Setelah pelajaran ini, kamu dapat mempraktikkan satu adegan film lengkap bersama tim, dari rehearsal dan blocking sampai syuting dalam dua ukuran shot.

Penjelasan:
Rehearsal bukan menghafal dialog sampai lancar, melainkan menemukan kebenaran adegan. Sebagai sutradara, berikan arahan yang bisa dimainkan, bukan penilaian. Lebih sedih adalah penilaian: aktor tidak tahu harus berbuat apa. Kamu baru saja kehilangan barang yang paling berharga, dan kamu berusaha tidak menangis di depan adikmu adalah arahan yang bisa dimainkan, karena ada tujuan, ada hambatan, dan ada tindakan. Selama rehearsal, uji blocking dengan kamera: apakah mark-nya masuk akal, apakah eyeline-nya konsisten, dan apakah gerakannya masih di dalam frame?

Proyek mini untuk pelajaran ini adalah satu adegan dua orang berdurasi dua menit dengan satu konflik kecil, misalnya seseorang meminjam barang dan tidak mengembalikannya. Syuting dalam dua ukuran shot, yaitu medium dan close-up, dengan aturan 180 derajat yang benar. Serahkan video beserta kartu karakter kedua tokoh. Kartu karakter itu penting: tanpa tujuan, hambatan, dan tindakan yang jelas, adegan dua menit akan terasa datar walaupun dialognya dihafal dengan sempurna.

Saat syuting, ikuti ritme hari syuting yang sudah kamu pelajari: blocking, lighting, latihan, lalu ambil gambar per setup. Ikuti call sheet dan jangan lupa merekam room tone di setiap lokasi, yaitu suara ruangan yang hening selama tiga puluh detik, yang nanti dipakai editor untuk mengisi celah suara. Simpan salinan cadangan rekaman di dua tempat berbeda, karena satu kartu memori yang hilang bisa menghapus satu hari kerja tim.

Contoh:
Bersama satu teman, buat adegan dua orang dua menit dengan satu konflik kecil, misalnya seseorang meminjam barang dan tidak mengembalikannya. Isi kartu karakter kedua tokoh, latih blocking dan mark, lalu syuting dalam medium shot dan close-up dengan aturan 180 derajat. Tonton hasilnya dan catat tiga hal yang akan kamu perbaiki di take berikutnya: satu soal akting, satu soal kamera, dan satu soal kontinuitas.

Ringkasan:
Rehearsal adalah menemukan kebenaran adegan, bukan menghafal dialog, dan arahan sutradara harus bisa dimainkan, berisi tujuan, hambatan, dan tindakan. Adegan dua orang dua menit dengan satu konflik kecil adalah latihan yang tepat: syuting dalam medium dan close-up dengan aturan 180 derajat, lengkapi dengan kartu karakter kedua tokoh, dan ikuti ritme syuting serta call sheet sampai rekaman tersimpan cadangan di dua tempat.$$)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, title, order_index, video_url, content) values
  ('32000000-0000-4000-8000-000000000a05', '22000000-0000-4000-8000-00000000000a', 'Evaluasi penampilan aktor', 5, null, $$Tujuan:
Setelah pelajaran ini, kamu dapat mengevaluasi penampilan akting lewat umpan balik penonton dan menulis esai refleksi tentang prosesmu.

Penjelasan:
Pemutaran kelas bukan ujian, melainkan bagian dari proses. Setelah filmmu ditayangkan, penonton akan menjawab tiga pertanyaan: apa yang mereka pahami, bagian mana yang membingungkan, dan adegan apa yang paling mereka ingat. Dengarkan tanpa membela diri dan catat semuanya. Umpan balik yang paling berharga sering datang dari penonton yang bukan pembuat film, karena mereka menonton seperti penonton sungguhan: mereka tidak tahu betapa sulitnya take itu diambil, mereka hanya tahu apakah adegannya terasa jujur atau tidak.

Setelah pemutaran, tiap tim menulis satu paragraf tambahan di esai refleksi: satu hal yang akan diubah berdasarkan umpan balik penonton. Esai refleksi individu sepanjang 300-500 kata menjawab tiga hal: apa yang berhasil, apa yang gagal, dan apa yang akan diubah di film berikutnya, termasuk peranmu dan kesulitan terbesarmu. Refleksi yang jujur, termasuk mengakui adegan yang tidak berhasil, jauh lebih berguna daripada refleksi yang berpura-pura semuanya sempurna.

Penilaian proyek akhir film pendek 3-5 menit terbagi dalam lima aspek: cerita dan naskah 25 persen, akting 25 persen, teknik gambar dan suara 25 persen, produksi dan kerja tim 15 persen, dan refleksi 10 persen. Akting dinilai dari penampilan yang jujur dan konsisten, ukuran permainan yang sesuai shot, dan kontinuitas yang terjaga. Nilai akting yang sama besarnya dengan nilai cerita menunjukkan betapa pentingnya penampilan pemain bagi film pendek.

Film pendekmu adalah portofolio pertamamu. Simpan dengan rapi: file master, poster, sinopsis, dan credit lengkap. Tulis satu halaman buku harian produksi yang mencatat peranmu dan apa yang kamu pelajari. Pilih satu keterampilan yang paling lemah dalam proyek ini, misalnya kontinuitas atau eyeline, dan latih khusus selama dua minggu. Terakhir, ajukan filmmu ke satu festival pelajar dan satu pemutaran komunitas. Menang atau tidak, proses pengajuan itu sendiri adalah pelajaran distribusi. Ingat pesan terakhir Semester 1: film yang selesai selalu lebih berharga daripada film sempurna yang tidak pernah selesai.

Contoh:
Setelah menonton filmmu bersama teman yang belum pernah melihat prosesnya, minta mereka menjawab tiga pertanyaan pemutaran kelas: apa yang mereka pahami, bagian mana yang membingungkan, dan adegan apa yang paling mereka ingat. Tulis esai refleksi 300-500 kata tentang peranmu, kesulitan terbesar, dan satu hal yang akan kamu lakukan berbeda di film berikutnya, plus satu paragraf tentang apa yang akan kamu ubah berdasarkan umpan balik mereka.

Ringkasan:
Pemutaran kelas adalah bagian dari proses: penonton menjawab apa yang mereka pahami, apa yang membingungkan, dan adegan apa yang paling diingat, dan tim mendengarkan tanpa membela diri. Esai refleksi 300-500 kata mencatat apa yang berhasil, apa yang gagal, dan apa yang akan diubah, termasuk satu paragraf dari umpan balik penonton. Simpan filmmu sebagai portofolio, latih keterampilan terlemahmu selama dua minggu, dan ajukan film ke festival pelajar serta pemutaran komunitas.$$)
on conflict (id) do nothing;

