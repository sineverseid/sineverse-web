// SINEVERSE — Data pendaftaran yang menunggu verifikasi email.
//
// Masalah yang dipecahkan file ini:
//  1. Supabase "Confirm email" AKTIF: signUp tidak mengembalikan sesi,
//     jadi client belum bisa menulis apa pun sebagai pengguna terautentikasi
//     (upload foto ke bucket profile-photos butuh sesi; insert lamaran
//     mentor juga butuh sesi).
//  2. Foto profil bersifat OPSIONAL (migrasi 027); bila ada, file foto
//     tidak bisa diunggah sebelum akun terverifikasi dan masuk.
//  3. Data teks profil dikirim lewat user_metadata saat signUp dan diisi
//     trigger database (migrasi 010). Bila migrasi 010 belum diterapkan,
//     data itu tetap harus sampai ke tabel profiles.
//
// Alurnya: saat submit pendaftaran, payload (tanpa kata sandi) disimpan di
// localStorage dengan kunci per-email. Setelah pengguna terverifikasi dan
// masuk (lewat kode OTP di halaman ini ATAU lewat tautan email yang
// mengembalikan ke aplikasi), completePendingRegistration() dijalankan:
// mengunggah foto yang dititipkan, melengkapi kolom profil yang masih
// kosong, mengajukan sekolah manual bila ada, dan — untuk jalur mentor —
// mengirim lamaran mentor. Semua langkah idempotent: foto diunggah dengan
// upsert ke path yang sama, lamaran dicek dulu agar tidak ganda, dan kunci
// localStorage dihapus setelah sukses.
//
// TIDAK ADA kata sandi yang disimpan di sini — payload hanya berisi data
// profil dan (untuk foto file) data URL gambar yang dititipkan sementara.
//
// Catatan migrasi 027: username TIDAK dikirim lewat metadata signup — bila
// username sudah dipakai, trigger database akan menggagalkan seluruh
// pembuatan akun. Username ditulis lewat patch profil di sini, sehingga
// kegagalan hanya berupa pesan yang bisa ditampilkan.

import { dataUrlToBlob } from './photo'
import { submitMentorApplication, submitSchoolSubmission, supabase, updatePhotoUrl, uploadToBucket } from './supabase'
import type { MentorApplicationInput } from './types'

export interface RegistrationPayload {
  name: string
  email: string
  phone: string
  birthDate: string
  gender: string
  city: string
  /** Jalur pendaftaran: 'siswa' atau 'mentor'. */
  role: 'siswa' | 'mentor'
  // --- Jalur siswa ---
  school: string
  kelas: string
  interests: string[]
  // --- Jalur mentor (lamaran 6 info, diajukan setelah verifikasi) ---
  mentor: MentorApplicationInput | null
  /** Foto: file yang dititipkan (data URL, sudah diperkecil di browser bila besar). Tidak ada lagi foto lewat URL/link. */
  photo: { kind: 'file'; dataUrl: string; ext: string } | null
  /** Migrasi 027: pendaftaran Siswa & Mentor. */
  username: string
  province: string
  regency: string
  /** Id sekolah terpilih (null bila mengajukan sekolah manual). */
  schoolId: string | null
  /** Sekolah manual yang diajukan (null bila memilih dari daftar). */
  schoolManual: { name: string; npsn: string | null } | null
  termsAgreed: boolean
}

const KEY_PREFIX = 'sineverse-pending-registration:'

function keyFor(email: string): string {
  return KEY_PREFIX + email.trim().toLowerCase()
}

export function savePendingRegistration(payload: RegistrationPayload): void {
  try {
    localStorage.setItem(keyFor(payload.email), JSON.stringify(payload))
  } catch {
    // localStorage penuh (foto besar) — foto sudah diperkecil sebelum
    // sampai ke sini; pengguna bisa melengkapi profil nanti.
  }
}

export function loadPendingRegistration(email: string): RegistrationPayload | null {
  try {
    const raw = localStorage.getItem(keyFor(email))
    if (!raw) return null
    return JSON.parse(raw) as RegistrationPayload
  } catch {
    return null
  }
}

export function clearPendingRegistration(email: string): void {
  try {
    localStorage.removeItem(keyFor(email))
  } catch {
    // Abaikan: kunci hilang tidak menghambat apa pun.
  }
}

export interface CompletionResult {
  photoUploaded: boolean
  profileCompleted: boolean
  mentorApplied: boolean
  schoolSubmitted: boolean
}

// Kunci antar-pemanggil: halaman verifikasi (jalur kode OTP) dan AuthProvider
// (jalur tautan email) bisa memanggil penyelesaian untuk email yang sama
// hampir bersamaan. Pemanggil kedua menunggu janji yang sama, bukan
// menjalankan ulang — mencegah lamaran mentor ganda dan unggahan ganda.
const inFlight = new Map<string, Promise<CompletionResult>>()

/**
 * Menyelesaikan pendaftaran yang tertunda setelah pengguna masuk.
 * Dipanggil dari halaman verifikasi (jalur kode OTP) dan dari AuthProvider
 * (jalur tautan email — pengguna kembali ke aplikasi dengan sesi aktif).
 * Melempar Error dengan pesan yang bisa ditampilkan bila ada langkah gagal.
 */
export async function completePendingRegistration(
  userId: string,
  email: string,
): Promise<CompletionResult> {
  const key = keyFor(email)
  const running = inFlight.get(key)
  if (running) return running
  const job = runCompletion(userId, email)
  inFlight.set(key, job)
  try {
    return await job
  } finally {
    inFlight.delete(key)
  }
}

async function runCompletion(userId: string, email: string): Promise<CompletionResult> {
  const payload = loadPendingRegistration(email)
  if (!payload) {
    return { photoUploaded: false, profileCompleted: false, mentorApplied: false, schoolSubmitted: false }
  }

  const result: CompletionResult = {
    photoUploaded: false,
    profileCompleted: false,
    mentorApplied: false,
    schoolSubmitted: false,
  }

  // 1. Foto file yang dititipkan -> unggah ke bucket (replace-only, upsert
  //    ke path yang sama), lalu simpan URL-nya di profil.
  let photoUrl: string | null = null
  if (payload.photo?.kind === 'file') {
    const blob = await dataUrlToBlob(payload.photo.dataUrl)
    // photoToDataUrl mengubah foto besar menjadi JPEG; samakan ekstensi
    // nama file dengan isi sebenarnya.
    const ext = payload.photo.dataUrl.startsWith('data:image/jpeg') ? 'jpg' : payload.photo.ext
    const file = new File([blob], `photo.${ext}`, { type: blob.type })
    const url = await uploadToBucket('profile-photos', `${userId}/photo.${ext}`, file)
    if (!url) {
      throw new Error(
        'Foto profil belum terunggah: bucket profile-photos belum tersedia. Unggah fotonya lewat menu Profil setelah masuk.',
      )
    }
    photoUrl = url
    await updatePhotoUrl(userId, url)
    result.photoUploaded = true
  }

  // 2. Lengkapi kolom profil dari payload (menutup celah bila migrasi 010
  //    belum diterapkan sehingga trigger hanya mengisi nama). Nilai yang
  //    sudah terisi trigger tidak diubah kecuali foto.
  // 3. Jalur mentor: kirim lamaran 6 info (hindari ganda bila sudah ada
  //    yang pending/disetujui). Peran tetap 'siswa' sampai admin menyetujui.
  // 4. Sekolah manual: ajukan untuk ditinjau admin (TIDAK langsung masuk
  //    daftar sekolah resmi).
  // Langkah 2–4 menyentuh tabel berbeda dan independen — dijalankan
  // paralel; error profil tetap diutamakan (di-await dulu) supaya pesan
  // yang muncul sama seperti sebelumnya.
  const patch: Record<string, unknown> = {}
  if (photoUrl) patch['photo_url'] = photoUrl
  const textFields: [string, string][] = [
    ['phone', payload.phone],
    ['city', payload.city],
    ['birth_date', payload.birthDate],
    ['gender', payload.gender],
    ['school', payload.school],
    ['kelas', payload.kelas],
  ]
  for (const [col, val] of textFields) {
    if (val) patch[col] = val
  }
  if (payload.interests.length > 0) patch['interests'] = payload.interests
  if (payload.username.trim()) patch['username'] = payload.username.trim()
  if (payload.province) patch['province'] = payload.province
  if (payload.regency) patch['regency'] = payload.regency
  if (payload.schoolId) patch['school_id'] = payload.schoolId
  if (payload.termsAgreed) patch['terms_agreed_at'] = new Date().toISOString()
  const profileJob = (async () => {
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
      if (error) {
        const msg = String(error.message ?? '').toLowerCase()
        if (msg.includes('duplicate') && msg.includes('username')) {
          throw new Error(
            'Username yang kamu pilih sudah dipakai pengguna lain. Silakan ubah username di halaman Profil.',
          )
        }
        throw new Error(`Data profil belum tersimpan: ${error.message}`)
      }
      result.profileCompleted = true
    }
  })()
  const mentorJob = (async () => {
    if (payload.role === 'mentor' && payload.mentor) {
      try {
        await submitMentorApplication(userId, payload.mentor)
        result.mentorApplied = true
      } catch (err) {
        throw new Error(
          `Lamaran mentor belum terkirim: ${err instanceof Error ? err.message : 'Terjadi kesalahan.'}`,
        )
      }
    }
  })()
  const schoolJob = (async () => {
    if (payload.schoolManual?.name.trim()) {
      try {
        const { data: existing } = await supabase
          .from('school_submissions')
          .select('id')
          .eq('user_id', userId)
          .ilike('name', payload.schoolManual.name.trim())
          .limit(1)
        if (!existing || existing.length === 0) {
          await submitSchoolSubmission({
            userId,
            name: payload.schoolManual.name.trim(),
            npsn: payload.schoolManual.npsn,
            province: payload.province || null,
            regency: payload.regency || null,
          })
        }
        result.schoolSubmitted = true
      } catch {
        // Pendaftaran tetap selesai; pengajuan sekolah bisa diulang dari
        // halaman Profil bila perlu.
      }
    }
  })()
  await profileJob
  await mentorJob
  await schoolJob

  clearPendingRegistration(email)
  return result
}
