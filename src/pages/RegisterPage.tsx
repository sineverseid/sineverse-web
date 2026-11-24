// SINEVERSE — Pendaftaran Anggota (Siswa) & Mentor (Pengajar), sama dengan
// formulir pendaftaran artefak (aksi registerstudent / applymentor):
// foto profil OPSIONAL (tanpa batas ukuran; diperkecil di browser), nama,
// username (unik, disarankan otomatis dari nama), email, kata sandi (min.
// 8 karakter) + konfirmasi, telepon/WA, tanggal lahir, jenis kelamin,
// kota, lalu jalur Siswa: provinsi, kabupaten/kota, sekolah (pilih dari
// daftar terverifikasi atau ajukan manual untuk ditinjau admin), kelas
// (X/XI/XII), minat; jalur Mentor: formulir lamaran 6 info bersama
// (MentorApplicationForm). TIDAK ADA NIK/KTP/alamat rumah/dokumen sensitif.
// Akun dibuat sebagai siswa; lamaran mentor dikirim setelah email
// terverifikasi dan admin yang menyetujui (peran TIDAK langsung menjadi
// mentor).
//
// Verifikasi email (Supabase "Confirm email" AKTIF): setelah daftar, email
// konfirmasi dikirim oleh Supabase (lewat SMTP Gmail kustom). Ada dua cara
// mengaktifkan akun, dan keduanya dijelaskan jujur di layar — kode TIDAK
// PERNAH ditampilkan oleh aplikasi ini (tidak ada layanan email tiruan):
//   1. Klik tautan konfirmasi di email (selalu tersedia).
//   2. Masukkan kode 8 digit dari email yang sama (template email memuat
//      tautan dan kode; panjang kode mengikuti setelan Supabase).
// Foto file dititipkan di localStorage sampai pengguna masuk, baru diunggah
// ke bucket profile-photos (kebijakan bucket menuntut sesi terautentikasi).
// Setelah email terverifikasi, pengguna diarahkan otomatis ke Beranda.
// Lihat src/lib/registration.ts.
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import MentorApplicationForm from '../components/MentorApplicationForm'
import { useAuth } from '../context/AuthContext'
import { BRAND } from '../lib/brand'
import { photoExtFromFile, photoToDataUrl } from '../lib/photo'
import { triggerWelcomeEmailForCurrentUser } from '../lib/emailManagement'
import {
  completePendingRegistration,
  savePendingRegistration,
} from '../lib/registration'
import type { CompletionResult, RegistrationPayload } from '../lib/registration'
import {
  checkUsernameAvailable,
  fetchProvinces,
  fetchRegencies,
  searchSchools,
} from '../lib/supabase'
import type {
  MentorApplicationInput,
  RefProvince,
  RefRegency,
  School,
} from '../lib/types'

// Batas tanggal lahir (hari ini) — konstanta modul, bukan hasil render.
const TODAY = new Date().toISOString().slice(0, 10)

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/

/** Saran username dari nama: huruf kecil, spasi jadi '-', tanpa karakter lain. */
function slugifyUsername(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
}

export default function RegisterPage() {
  const { signUp, verifyOtpCode, resendConfirmation, user, registrationNotice } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Jalur pendaftaran dari halaman login: siswa atau mentor. Form-nya
  // berbeda sungguhan (bukan sekadar label) — mengikuti aksi artefak.
  const isMentorPath = searchParams.get('role') === 'mentor'

  // --- Form ---
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [phone, setPhone] = useState('')
  const [birthDate, setBirthDate] = useState('')
  // LC9: tanggal lahir tiga field terpisah (tanggal/bulan/tahun) — input
  // type="date" membuat ketikan digit-per-digit jatuh ke segmen yang salah.
  const [dobDay, setDobDay] = useState('')
  const [dobMonth, setDobMonth] = useState('')
  const [dobYear, setDobYear] = useState('')
  const [dobError, setDobError] = useState<string | null>(null)
  const [gender, setGender] = useState('')
  // Migrasi 027: username + wilayah + sekolah.
  const [username, setUsername] = useState('')
  const [usernameEdited, setUsernameEdited] = useState(false)
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'error'>('idle')
  const usernameRef = useRef('')
  usernameRef.current = username
  const [provinces, setProvinces] = useState<RefProvince[]>([])
  const [regencies, setRegencies] = useState<RefRegency[]>([])
  const [province, setProvince] = useState('')
  const [regency, setRegency] = useState('')
  const [schoolQuery, setSchoolQuery] = useState('')
  const [schoolResults, setSchoolResults] = useState<School[]>([])
  const [schoolSearching, setSchoolSearching] = useState(false)
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null)
  const [manualSchool, setManualSchool] = useState(false)
  const [manualSchoolName, setManualSchoolName] = useState('')
  const [manualSchoolNpsn, setManualSchoolNpsn] = useState('')
  const [kelas, setKelas] = useState('')
  const [interests, setInterests] = useState('')
  const [termsAgreed, setTermsAgreed] = useState(false)
  // Jalur mentor: nilai dari formulir bersama (mode tertanam).
  const [mentorValues, setMentorValues] = useState<MentorApplicationInput | null>(null)
  const [mentorValid, setMentorValid] = useState(false)
  const [photoFile, setPhotoFile] = useState<{ dataUrl: string; ext: string } | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // --- Verifikasi email ---
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null)
  const [registeredRole, setRegisteredRole] = useState<'siswa' | 'mentor'>('siswa')
  const [code, setCode] = useState('')
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [verified, setVerified] = useState(false)
  const [skippedVerification, setSkippedVerification] = useState(false)
  const [completion, setCompletion] = useState<CompletionResult | null>(null)
  const [completionError, setCompletionError] = useState<string | null>(null)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [resendNotice, setResendNotice] = useState<string | null>(null)
  const completionStarted = useRef(false)

  // Hitung mundur kirim ulang (aturan artefak: jeda 60 detik).
  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = window.setTimeout(() => setResendCooldown((v) => v - 1), 1000)
    return () => window.clearTimeout(t)
  }, [resendCooldown])

  // Daftar provinsi (sekali, untuk kedua jalur pendaftaran).
  useEffect(() => {
    let cancelled = false
    fetchProvinces()
      .then((rows) => {
        if (!cancelled) setProvinces(rows)
      })
      .catch(() => {
        // Gagal memuat: pilihan tetap kosong, validasi akan menahan submit.
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Kabupaten/kota mengikuti provinsi yang dipilih.
  useEffect(() => {
    if (!province) {
      setRegencies([])
      return
    }
    let cancelled = false
    fetchRegencies(province)
      .then((rows) => {
        if (!cancelled) setRegencies(rows)
      })
      .catch(() => {
        if (!cancelled) setRegencies([])
      })
    return () => {
      cancelled = true
    }
  }, [province])

  // Cek keunikan username (debounce; RPC security definer, bisa tanpa login).
  useEffect(() => {
    const u = username.trim()
    if (u.length < 3 || !USERNAME_PATTERN.test(u)) {
      setUsernameStatus('idle')
      return
    }
    setUsernameStatus('checking')
    const t = window.setTimeout(async () => {
      try {
        const ok = await checkUsernameAvailable(u)
        // Abaikan jawaban basi bila pengguna sudah mengetik username lain.
        if (usernameRef.current.trim() !== u) return
        setUsernameStatus(ok ? 'available' : 'taken')
      } catch {
        if (usernameRef.current.trim() !== u) return
        setUsernameStatus('error')
      }
    }, 500)
    return () => window.clearTimeout(t)
  }, [username])

  // Nama kabupaten/kota yang dipilih (schools.regency menyimpan nama
  // referensi, bukan kode) — untuk membatasi daftar sekolah ke daerah
  // siswa di formulir pendaftaran.
  const regencyName = regencies.find((r) => r.code === regency)?.name ?? ''

  // Cari sekolah terverifikasi di kabupaten/kota yang dipilih (debounce;
  // nama atau NPSN). Begitu kabupaten/kota dipilih, daftar sekolah di
  // daerah itu langsung dimuat tanpa perlu mengetik.
  useEffect(() => {
    if (manualSchool || selectedSchool) {
      setSchoolResults([])
      return
    }
    // Belum pilih kabupaten/kota: tidak ada daftar yang dimuat.
    if (!regencyName) {
      setSchoolResults([])
      return
    }
    const q = schoolQuery.trim()
    if (q.length < 2) {
      // Query pendek: tampilkan 20 sekolah pertama di daerah ini.
      let cancelled = false
      setSchoolSearching(true)
      searchSchools('', regencyName)
        .then((rows) => {
          if (!cancelled) setSchoolResults(rows)
        })
        .catch(() => {
          if (!cancelled) setSchoolResults([])
        })
        .finally(() => {
          if (!cancelled) setSchoolSearching(false)
        })
      return () => {
        cancelled = true
      }
    }
    setSchoolSearching(true)
    const t = window.setTimeout(async () => {
      try {
        setSchoolResults(await searchSchools(q, regencyName))
      } catch {
        setSchoolResults([])
      }
      setSchoolSearching(false)
    }, 400)
    return () => window.clearTimeout(t)
  }, [schoolQuery, manualSchool, selectedSchool, regencyName])

  // Selesaikan pendaftaran tertunda bila pengguna masuk lewat jalur yang
  // tidak melewati handleVerifyCode (mis. konfirmasi email ternyata
  // nonaktif, atau kembali lewat tautan email). Dijaga completionStarted
  // supaya tidak berjalan dua kali.
  useEffect(() => {
    if (!verified || !user || !registeredEmail || completionStarted.current) return
    completionStarted.current = true
    completePendingRegistration(user.id, registeredEmail)
      .then((done) => setCompletion(done))
      .catch((err) =>
        setCompletionError(err instanceof Error ? err.message : 'Penyelesaian pendaftaran gagal.'),
      )
  }, [verified, user, registeredEmail])

  // Setelah email terverifikasi, arahkan otomatis ke Beranda (tombol
  // "Masuk ke Beranda" tetap tersedia sebagai jalan manual).
  useEffect(() => {
    if (!verified) return
    const t = window.setTimeout(() => navigate('/', { replace: true }), 3000)
    return () => window.clearTimeout(t)
  }, [verified, navigate])

  // Bila pengguna sudah masuk dan TIDAK sedang memverifikasi, ke Beranda.
  // P23: navigate tidak boleh dipanggil di body render — pindah ke effect.
  useEffect(() => {
    if (user && !registeredEmail) navigate('/', { replace: true })
  }, [user, registeredEmail, navigate])

  if (user && !registeredEmail) {
    return null
  }

  function handleNameChange(value: string) {
    setName(value)
    if (!usernameEdited) setUsername(slugifyUsername(value))
  }

  function handleUsernameChange(value: string) {
    setUsernameEdited(true)
    setUsername(value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))
  }

  function handleSchoolQueryChange(value: string) {
    setSchoolQuery(value)
    if (selectedSchool) setSelectedSchool(null)
  }

  function selectSchool(school: School) {
    setSelectedSchool(school)
    setSchoolQuery(school.name)
    setSchoolResults([])
  }

  async function handlePhotoFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Pilih file gambar (JPG/PNG/WebP).')
      return
    }
    // Tidak ada batas ukuran: foto besar diperkecil otomatis di browser.
    setError(null)
    try {
      const dataUrl = await photoToDataUrl(file)
      setPhotoFile({ dataUrl, ext: photoExtFromFile(file) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tidak dapat membaca file foto.')
    }
  }

  // LC9: gabungkan tiga field tanggal lahir menjadi ISO (YYYY-MM-DD).
  // birthDate tetap sumber kebenaran untuk validate() + pengiriman.
  function composeDob(day: string, month: string, year: string) {
    setDobDay(day)
    setDobMonth(month)
    setDobYear(year)
    if (!day || !month || !year) {
      setDobError(null)
      setBirthDate('')
      return
    }
    const d = Number(day)
    const m = Number(month)
    const y = Number(year)
    const currentYear = new Date().getFullYear()
    if (
      !Number.isInteger(d) || d < 1 || d > 31 ||
      !Number.isInteger(m) || m < 1 || m > 12 ||
      !Number.isInteger(y) || y < 1900 || y > currentYear
    ) {
      setDobError('Tanggal lahir tidak valid. Periksa tanggal, bulan, dan tahun.')
      setBirthDate('')
      return
    }
    const dt = new Date(y, m - 1, d)
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
      setDobError('Tanggal itu tidak ada di bulan tersebut.')
      setBirthDate('')
      return
    }
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (iso > TODAY) {
      setDobError('Tanggal lahir tidak boleh di masa depan.')
      setBirthDate('')
      return
    }
    setDobError(null)
    setBirthDate(iso)
  }

  function validate(): string | null {
    if (name.trim().length < 2) return 'Nama lengkap minimal 2 karakter.'
    const u = username.trim()
    if (u.length < 3) return 'Username minimal 3 karakter.'
    if (!USERNAME_PATTERN.test(u)) {
      return 'Username hanya boleh berisi huruf kecil, angka, tanda hubung (-), dan garis bawah (_).'
    }
    if (usernameStatus === 'taken') return 'Username sudah dipakai. Pilih username lain.'
    if (usernameStatus === 'checking') return 'Tunggu sebentar — username sedang diperiksa.'
    if (!email.trim()) return 'Isi alamat email kamu.'
    if (password.length < 8) return 'Kata sandi minimal 8 karakter.'
    if (password !== confirm) return 'Konfirmasi kata sandi tidak cocok.'
    if (phone.trim().length < 9) return 'Nomor telepon/WA minimal 9 karakter.'
    if (dobError) return dobError
    if (!birthDate) return 'Isi tanggal lahir kamu.'
    if (birthDate > TODAY) {
      return 'Tanggal lahir tidak boleh di masa depan.'
    }
    if (!gender) return 'Pilih jenis kelamin.'
    // Wilayah berlaku untuk kedua jalur (siswa dan mentor).
    if (!province) return 'Pilih provinsi.'
    if (!regency) return 'Pilih kabupaten/kota.'
    if (!termsAgreed) return 'Centang persetujuan Syarat & Ketentuan dan Kebijakan Privasi.'
    if (isMentorPath) {
      if (!mentorValid || !mentorValues) {
        return 'Lengkapi lamaran mentor: profesi, minimal satu bidang keahlian, pengalaman, alasan, dan centang pernyataan sukarela.'
      }
    } else {
      if (manualSchool) {
        if (manualSchoolName.trim().length < 2) return 'Nama sekolah minimal 2 karakter.'
        if (manualSchoolNpsn.trim() && !/^\d{8}$/.test(manualSchoolNpsn.trim())) {
          return 'NPSN terdiri dari 8 digit angka.'
        }
      } else if (!selectedSchool) {
        return 'Pilih sekolah dari daftar pencarian, atau pilih "Sekolah saya belum terdaftar".'
      }
      if (!kelas) return 'Pilih kelas.'
      if (interests.trim().length < 2) return 'Isi minat kamu (mis. sinematografi, editing).'
    }
    return null
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    const cleanEmail = email.trim()
    const interestList = isMentorPath
      ? []
      : interests.split(',').map((s) => s.trim()).filter(Boolean)
    const displaySchool = isMentorPath
      ? ''
      : (selectedSchool?.name ?? manualSchoolName.trim())
    // Kota tempat tinggal tidak lagi ditanya terpisah (perintah Founder
    // 22 Nov 18:19): kota profil diisi dari nama kabupaten/kota yang
    // dipilih, berlaku untuk jalur siswa maupun mentor.
    const cityValue = regencies.find((r) => r.code === regency)?.name ?? ''
    // Data profil lengkap dikirim sebagai user_metadata — trigger database
    // (migrasi 010) mengisinya ke tabel profiles saat akun dibuat.
    // Username TIDAK lewat metadata (duplikat akan menggagalkan signup);
    // username ditulis lewat patch profil setelah pengguna masuk.
    const metadata: Record<string, unknown> = {
      phone: phone.trim(),
      city: cityValue,
      birth_date: birthDate,
      gender,
      school: displaySchool,
      kelas: isMentorPath ? '' : kelas,
      interests: interestList,
    }
    const payload: RegistrationPayload = {
      name: name.trim(),
      email: cleanEmail,
      phone: phone.trim(),
      birthDate,
      gender,
      city: cityValue,
      role: isMentorPath ? 'mentor' : 'siswa',
      school: displaySchool,
      kelas: isMentorPath ? '' : kelas,
      interests: interestList,
      mentor: isMentorPath ? mentorValues : null,
      photo: photoFile
        ? { kind: 'file', dataUrl: photoFile.dataUrl, ext: photoFile.ext }
        : null,
      username: username.trim(),
      province,
      regency,
      schoolId: selectedSchool?.id ?? null,
      schoolManual:
        !isMentorPath && manualSchool
          ? { name: manualSchoolName.trim(), npsn: manualSchoolNpsn.trim() || null }
          : null,
      termsAgreed,
    }
    setBusy(true)
    const { error: err, needsConfirmation } = await signUp({
      name: name.trim(),
      email: cleanEmail,
      password,
      metadata,
    })
    setBusy(false)
    if (err) {
      setError(err)
      return
    }
    // Titipkan payload (tanpa kata sandi) untuk diselesaikan setelah masuk:
    // foto file diunggah ke bucket, profil dilengkapi, pengajuan sekolah
    // manual dikirim, lamaran mentor dikirim.
    // B16-followup: savePendingRegistration kini melempar bila localStorage
    // gagal — tangkap supaya layar sukses pasca-signup tetap tampil.
    try {
      savePendingRegistration(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan data pendaftaran. Coba lagi.')
      return
    }
    setRegisteredRole(payload.role)
    if (needsConfirmation) {
      setRegisteredEmail(cleanEmail)
      setResendCooldown(60)
    } else {
      // Konfirmasi email ternyata nonaktif: akun langsung aktif.
      setRegisteredEmail(cleanEmail)
      setVerified(true)
      setSkippedVerification(true)
    }
  }

  async function handleVerifyCode(e: FormEvent) {
    e.preventDefault()
    setVerifyError(null)
    if (!registeredEmail) return
    if (!/^\d{8}$/.test(code.trim())) {
      setVerifyError('Masukkan kode 8 digit dari email kamu.')
      return
    }
    setVerifyBusy(true)
    const { error: err, user: verifiedUser } = await verifyOtpCode(registeredEmail, code.trim())
    setVerifyBusy(false)
    if (err) {
      setVerifyError(err)
      return
    }
    setVerified(true)
    // Fase 5 (fallback jalur 2): trigger database sudah mengantre welcome
    // email saat email terverifikasi; pemanggilan ini memastikan email
    // terkirim walau pg_net belum dikonfigurasi. Best-effort — kegagalan
    // email TIDAK BOLEH mengganggu alur pendaftaran (idempotency di server
    // mencegah kirim ganda bila trigger + fallback sama-sama jalan).
    void triggerWelcomeEmailForCurrentUser().catch(() => {
      /* ditelan — baris 'queued' tetap bisa diproses admin dari Email History */
    })
    // Sesi sudah aktif — selesaikan pendaftaran tertunda (foto, profil,
    // pengajuan sekolah, lamaran mentor). AuthProvider juga menjalankannya
    // sebagai pengaman; pemanggil kedua menunggu janji yang sama, bukan
    // mengulang.
    if (verifiedUser && !completionStarted.current) {
      completionStarted.current = true
      try {
        const done = await completePendingRegistration(verifiedUser.id, registeredEmail)
        setCompletion(done)
      } catch (err) {
        setCompletionError(err instanceof Error ? err.message : 'Penyelesaian pendaftaran gagal.')
      }
    }
  }

  async function handleResend() {
    if (!registeredEmail || resendCooldown > 0) return
    setResendNotice(null)
    setVerifyError(null)
    const { error: err } = await resendConfirmation(registeredEmail)
    if (err) {
      setVerifyError(err)
      return
    }
    setResendCooldown(60)
    setResendNotice('Email konfirmasi baru dikirim. Periksa kotak masuk (dan folder spam).')
  }

  // --- Layar verifikasi email ---
  if (registeredEmail) {
    return (
      <div className="page login-page">
        <section className="login-hero">
          <p className="login-eyebrow">YOUR WORLD OF FILMMAKING</p>
          <h1 className="login-title">SINEVERSE</h1>
          <p className="login-desc">
            Satu langkah lagi — verifikasi email kamu untuk mengaktifkan akun.
          </p>
          <p className="login-slogan-pill">{BRAND.slogan}</p>
        </section>

        <div className="login-card-wrap">
          <div className="form">
            <h2>Periksa Email Kamu</h2>
            {!verified ? (
              <>
                <p>
                  Pendaftaran berhasil. Kami mengirim email konfirmasi ke{' '}
                  <strong>{registeredEmail}</strong>.
                </p>
                <p className="muted">
                  Buka email itu dan klik tautan konfirmasi — akunmu langsung aktif dan kamu
                  akan kembali ke aplikasi. Kalau tidak sempat klik tautan, masukkan kode
                  8 digit dari email yang sama di bawah ini.
                </p>
                <form onSubmit={handleVerifyCode}>
                  <label>
                    Kode 8 digit dari email
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
                      placeholder="12345678"
                      className="otp-input"
                    />
                  </label>
                  {verifyError && <p className="error-box">{verifyError}</p>}
                  {resendNotice && <p className="notice-box">{resendNotice}</p>}
                  <button type="submit" className="btn btn-primary btn-block" disabled={verifyBusy}>
                    {verifyBusy ? 'Memverifikasi…' : 'Verifikasi Kode'}
                  </button>
                </form>
                <p className="muted">
                  Email kamu berisi tautan konfirmasi dan kode 8 digit — dua-duanya bisa
                  dipakai. Klik tautan, atau masukkan kodenya di atas.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  onClick={handleResend}
                  disabled={resendCooldown > 0}
                >
                  {resendCooldown > 0
                    ? `Kirim ulang email (${resendCooldown} dtk)`
                    : 'Kirim Ulang Email Konfirmasi'}
                </button>
                <p className="muted">
                  Belum menerima email? Periksa folder spam. Setelah klik tautan di email,
                  kamu akan kembali ke aplikasi dan bisa langsung masuk.
                </p>
              </>
            ) : (
              <>
                <p className="notice-box">
                  {skippedVerification
                    ? 'Akun kamu aktif.'
                    : 'Email terverifikasi — akun kamu aktif.'}
                  {registeredRole === 'mentor' && (
                    <>
                      {' '}
                      Lamaran mentor kamu sudah dikirim dan menunggu persetujuan admin; sampai
                      disetujui, akunmu berperan sebagai anggota.
                    </>
                  )}
                  {completion?.photoUploaded && (
                    <> Foto profil kamu sudah terunggah.</>
                  )}
                  {completion?.schoolSubmitted && (
                    <> Pengajuan sekolahmu sedang ditinjau admin.</>
                  )}
                </p>
                {completionError && <p className="error-box">{completionError}</p>}
                {registrationNotice && <p className="error-box">{registrationNotice}</p>}
                <Link to="/" className="btn btn-primary btn-block">
                  Masuk ke Beranda
                </Link>
                <p className="muted">
                  Kamu akan diarahkan ke Beranda secara otomatis dalam beberapa detik.
                </p>
              </>
            )}
          </div>
          <p className="muted login-admin-note">
            Sudah punya akun? <Link to="/login">Masuk di sini</Link>
          </p>
        </div>
      </div>
    )
  }

  // --- Formulir pendaftaran ---
  return (
    <div className="page login-page">
      <section className="login-hero">
        <p className="login-eyebrow">YOUR WORLD OF FILMMAKING</p>
        <h1 className="login-title">SINEVERSE</h1>
        <p className="login-desc">
          Platform nasional untuk pelajar SMA/SMK Indonesia: belajar film di Academy, berdiskusi
          di setiap lesson, membuat proyek lintas sekolah, dan memamerkan karya di Showcase.
        </p>
        <p className="login-slogan-pill">{BRAND.slogan}</p>
        <img
          src="./login-hero-film-crew.webp"
          alt="Kru film pelajar SINEVERSE: kamera, clapperboard, dan boom mic di taman"
          className="login-hero-img"
        />
      </section>

      <div className="login-card-wrap">
        <div className="login-register">
          <Link
            to="/register"
            className={`btn btn-block ${isMentorPath ? 'btn-secondary' : 'btn-primary'}`}
          >
            Daftar sebagai Anggota (Siswa)
          </Link>
          <Link
            to="/register?role=mentor"
            className={`btn btn-block ${isMentorPath ? 'btn-primary' : 'btn-secondary'}`}
          >
            Daftar sebagai Mentor (Pengajar)
          </Link>
        </div>

        <form className="form" onSubmit={handleSubmit}>
          <h2>{isMentorPath ? 'Daftar sebagai Mentor (Pengajar)' : 'Daftar sebagai Anggota (Siswa)'}</h2>
          {isMentorPath ? (
            <p className="muted">
              Buat akun dulu, verifikasi email, lalu lamaran mentor kamu dikirim otomatis.
              Mentor baru aktif mengajar setelah diverifikasi admin.
            </p>
          ) : (
            <p className="muted">
              Buat akun untuk mulai belajar filmmaking. Foto profil opsional — bisa ditambahkan
              nanti di Profil.
            </p>
          )}

          <label>
            Foto Profil (opsional)
            <span className="photo-field">
              <span className="btn btn-secondary btn-small" style={{ cursor: 'pointer' }}>
                {photoFile ? 'Ganti Foto' : 'Pilih Foto'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoFile}
                  style={{ display: 'none' }}
                />
              </span>
              {photoFile && (
                <img src={photoFile.dataUrl} alt="Pratinjau foto profil" className="photo-preview" />
              )}
            </span>
            <span className="muted" style={{ fontWeight: 400 }}>
              JPG/PNG/WebP, tanpa batas ukuran (foto besar diperkecil otomatis). Boleh
              dikosongkan.
            </span>
          </label>

          <label>
            Nama Lengkap
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              autoComplete="name"
              required
              minLength={2}
              maxLength={80}
              placeholder="Nama kamu"
            />
          </label>
          <label>
            Username
            <input
              type="text"
              value={username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              autoComplete="username"
              required
              minLength={3}
              maxLength={30}
              placeholder="username-kamu"
            />
            <span className="muted" style={{ fontWeight: 400 }}>
              {usernameStatus === 'checking' && 'Memeriksa ketersediaan username…'}
              {usernameStatus === 'available' && 'Username tersedia.'}
              {usernameStatus === 'taken' && 'Username sudah dipakai — pilih yang lain.'}
              {usernameStatus === 'error' && 'Tidak dapat memeriksa username saat ini — tetap bisa lanjut, sistem akan memberi tahu bila sudah dipakai.'}
              {usernameStatus === 'idle' &&
                'Nama pengguna unik kamu: huruf kecil, angka, tanda hubung (-), dan garis bawah (_). Terisi otomatis dari nama — boleh diubah.'}
            </span>
          </label>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              maxLength={120}
              placeholder="nama@email.com"
            />
          </label>
          <label>
            Kata Sandi
            <span className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={100}
                placeholder="Minimal 8 karakter"
              />
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
              >
                {showPassword ? 'Sembunyikan' : 'Lihat'}
              </button>
            </span>
          </label>
          <label>
            Konfirmasi Kata Sandi
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={100}
              placeholder="Ulangi kata sandi"
            />
          </label>
          <label>
            Nomor Telepon / WA
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              required
              minLength={9}
              maxLength={20}
              placeholder="08xxxxxxxxxx"
            />
          </label>
          {/* LC9: tiga field terpisah supaya tanggal lahir bisa diketik
              angka per angka tanpa jatuh ke segmen yang salah. */}
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend>Tanggal Lahir</legend>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <label style={{ flex: '0 0 4.5rem' }}>
                <span className="muted">Tanggal</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  placeholder="1"
                  value={dobDay}
                  onChange={(e) => composeDob(e.target.value, dobMonth, dobYear)}
                  required
                />
              </label>
              <label style={{ flex: 1 }}>
                <span className="muted">Bulan</span>
                <select
                  value={dobMonth}
                  onChange={(e) => composeDob(dobDay, e.target.value, dobYear)}
                  required
                >
                  <option value="">Pilih bulan</option>
                  {['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'].map((name, i) => (
                    <option key={name} value={String(i + 1)}>{name}</option>
                  ))}
                </select>
              </label>
              <label style={{ flex: '0 0 5.5rem' }}>
                <span className="muted">Tahun</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1900}
                  max={new Date().getFullYear()}
                  placeholder="2000"
                  value={dobYear}
                  onChange={(e) => composeDob(dobDay, dobMonth, e.target.value)}
                  required
                />
              </label>
            </div>
            {dobError && <p className="error-box" style={{ marginTop: '0.5rem' }}>{dobError}</p>}
          </fieldset>
          <label>
            Jenis Kelamin
            <select value={gender} onChange={(e) => setGender(e.target.value)} required>
              <option value="">Pilih jenis kelamin</option>
              <option value="Laki-laki">Laki-laki</option>
              <option value="Perempuan">Perempuan</option>
            </select>
          </label>
          <label>
            Provinsi
            <select value={province} onChange={(e) => { setProvince(e.target.value); setRegency(''); setSelectedSchool(null); setSchoolQuery(''); setSchoolResults([]) }} required>
              <option value="" disabled>
                Pilih provinsi
              </option>
              {provinces.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kabupaten / Kota
            <select
              value={regency}
              onChange={(e) => { setRegency(e.target.value); setSelectedSchool(null); setSchoolQuery(''); setSchoolResults([]) }}
              required
              disabled={!province}
            >
              <option value="" disabled>
                {province ? 'Pilih kabupaten/kota' : 'Pilih provinsi dulu'}
              </option>
              {regencies.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>

          {isMentorPath ? (
            <MentorApplicationForm
              embedded
              onValuesChange={(values, valid) => {
                setMentorValues(values)
                setMentorValid(valid)
              }}
            />
          ) : (
            <>
              {manualSchool ? (
                <>
                  <label>
                    Nama Sekolah
                    <input
                      type="text"
                      value={manualSchoolName}
                      onChange={(e) => setManualSchoolName(e.target.value)}
                      required
                      minLength={2}
                      maxLength={120}
                      placeholder="Nama sekolah kamu"
                    />
                  </label>
                  <label>
                    NPSN (opsional)
                    <input
                      type="text"
                      inputMode="numeric"
                      value={manualSchoolNpsn}
                      onChange={(e) => setManualSchoolNpsn(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
                      maxLength={8}
                      placeholder="8 digit angka, bila tahu"
                    />
                  </label>
                  <p className="muted">
                    Sekolahmu akan diajukan ke admin untuk ditinjau — belum langsung masuk
                    daftar resmi. Kamu tetap bisa belajar sambil menunggu.
                  </p>
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => setManualSchool(false)}
                  >
                    Pilih dari daftar sekolah
                  </button>
                </>
              ) : (
                <>
                  <label>
                    Sekolah
                    <input
                      type="text"
                      value={schoolQuery}
                      onChange={(e) => handleSchoolQueryChange(e.target.value)}
                      maxLength={120}
                      placeholder={
                        regencyName
                          ? 'Ketik nama sekolah atau NPSN…'
                          : 'Pilih provinsi dan kabupaten/kota dulu'
                      }
                      autoComplete="off"
                      disabled={!regencyName}
                    />
                    <span className="muted" style={{ fontWeight: 400 }}>
                      {schoolSearching
                        ? 'Mencari…'
                        : selectedSchool
                          ? `Terpilih: ${selectedSchool.name}`
                          : regencyName
                            ? `Sekolah di ${regencyName} — ketik untuk mencari.`
                            : 'Pilih provinsi dan kabupaten/kota dulu — sekolah di daerahmu akan muncul di sini.'}
                    </span>
                  </label>
                  {schoolResults.length > 0 && (
                    <ul className="school-results">
                      {schoolResults.map((s) => (
                        <li key={s.id}>
                          <button type="button" onClick={() => selectSchool(s)}>
                            {s.name}
                            {s.npsn ? ` — NPSN ${s.npsn}` : ''}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!selectedSchool && regencyName && !schoolSearching && schoolQuery.trim().length >= 2 && schoolResults.length === 0 && (
                    <p className="muted">Tidak ditemukan di {regencyName}.</p>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => {
                      setManualSchool(true)
                      setSelectedSchool(null)
                      setSchoolResults([])
                    }}
                  >
                    Sekolah saya belum terdaftar
                  </button>
                </>
              )}
              <label>
                Kelas
                <select value={kelas} onChange={(e) => setKelas(e.target.value)} required>
                  <option value="" disabled>
                    Pilih kelas
                  </option>
                  <option value="X">X</option>
                  <option value="XI">XI</option>
                  <option value="XII">XII</option>
                </select>
              </label>
              <label>
                Minat
                <input
                  type="text"
                  value={interests}
                  onChange={(e) => setInterests(e.target.value)}
                  required
                  minLength={2}
                  maxLength={200}
                  placeholder="Mis. Sinematografi, penyutradaraan, editing (pisahkan dengan koma)"
                />
              </label>
            </>
          )}

          <div className="notice-box">
            <strong>Perlindungan data &amp; pengguna di bawah 18 tahun.</strong> SINEVERSE tidak
            pernah meminta NIK, KTP, alamat rumah, atau dokumen sensitif apa pun. Data yang kamu
            isi hanya dipakai untuk akun belajar dan ditampilkan seperlunya (nama, username,
            sekolah, foto profil). Bila kamu di bawah 18 tahun, pastikan orang tua/wali
            mengetahui pendaftaran ini — mereka dapat menghubungi pengelola lewat halaman{' '}
            <Link to="/tentang">Tentang</Link> bila ada yang perlu ditanyakan.
          </div>
          <label className="checkbox-item">
            <input
              type="checkbox"
              checked={termsAgreed}
              onChange={(e) => setTermsAgreed(e.target.checked)}
              required
            />
            <span>
              Saya menyetujui <Link to="/syarat">Syarat &amp; Ketentuan</Link> dan{' '}
              <Link to="/privasi">Kebijakan Privasi</Link> SINEVERSE.
            </span>
          </label>

          {error && <p className="error-box">{error}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Mendaftar…' : 'Daftar'}
          </button>
          <p className="login-version">
            Versi aplikasi {BRAND.version} • Aplikasi PWA • diperbarui {BRAND.versionUpdated}
          </p>
        </form>
        <p className="muted login-admin-note">
          Sudah punya akun? <Link to="/login">Masuk di sini</Link>
          <br />
          Admin bukan jalur pendaftaran publik — akun admin ditetapkan oleh pengelola platform.
        </p>
      </div>
    </div>
  )
}
