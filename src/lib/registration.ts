// SINEVERSE — Data pendaftaran yang menunggu verifikasi email.
//
// Masalah yang dipecahkan file ini:
//  1. Supabase "Confirm email" AKTIF: signUp tidak mengembalikan sesi,
//     jadi client belum bisa menulis apa pun sebagai pengguna terautentikasi
//     (upload foto ke bucket profile-photos butuh sesi; insert lamaran
//     mentor juga butuh sesi).
//  2. Foto profil WAJIB di pendaftaran (aturan artefak v10), tapi file foto
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
// kosong, dan — untuk jalur mentor — mengirim lamaran mentor. Semua langkah
// idempotent: foto diunggah dengan upsert ke path yang sama, lamaran dicek
// dulu agar tidak ganda, dan kunci localStorage dihapus setelah sukses.
//
// TIDAK ADA kata sandi yang disimpan di sini — payload hanya berisi data
// profil dan (untuk foto file) data URL gambar yang dititipkan sementara.

import { supabase, updatePhotoUrl, uploadToBucket } from './supabase'

export interface RegistrationPayload {
  name: string
  email: string
  phone: string
  birthDate: string
  gender: string
  city: string
  address: string
  /** Jalur pendaftaran: 'siswa' atau 'mentor'. */
  role: 'siswa' | 'mentor'
  // --- Jalur siswa ---
  school: string
  kelas: string
  interests: string[]
  // --- Jalur mentor (lamaran diajukan setelah verifikasi) ---
  expertise: string
  experience: string
  portfolioLink: string
  /** Foto: file yang dititipkan (data URL, maks ~2 MB) atau tautan. */
  photo: { kind: 'file'; dataUrl: string; ext: string } | { kind: 'url'; url: string } | null
}

const KEY_PREFIX = 'sineverse-pending-registration:'

function keyFor(email: string): string {
  return KEY_PREFIX + email.trim().toLowerCase()
}

export function savePendingRegistration(payload: RegistrationPayload): void {
  try {
    localStorage.setItem(keyFor(payload.email), JSON.stringify(payload))
  } catch {
    // localStorage penuh (foto besar) — foto tetap wajib, jadi pemanggil
    // sudah membatasi ukuran file sebelum sampai ke sini.
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
    return { photoUploaded: false, profileCompleted: false, mentorApplied: false }
  }

  const result: CompletionResult = {
    photoUploaded: false,
    profileCompleted: false,
    mentorApplied: false,
  }

  // 1. Foto file yang dititipkan -> unggah ke bucket (replace-only, upsert
  //    ke path yang sama), lalu simpan URL-nya di profil. Foto berupa tautan
  //    sudah masuk lewat user_metadata + trigger; tidak perlu diunggah.
  let photoUrl: string | null = null
  if (payload.photo?.kind === 'file') {
    const res = await fetch(payload.photo.dataUrl)
    const blob = await res.blob()
    const file = new File([blob], `photo.${payload.photo.ext}`, { type: blob.type })
    const url = await uploadToBucket('profile-photos', `${userId}/photo.${payload.photo.ext}`, file)
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
  const patch: Record<string, unknown> = {}
  if (photoUrl) patch['photo_url'] = photoUrl
  const textFields: [string, string][] = [
    ['phone', payload.phone],
    ['city', payload.city],
    ['birth_date', payload.birthDate],
    ['gender', payload.gender],
    ['address', payload.address],
    ['school', payload.school],
    ['kelas', payload.kelas],
  ]
  for (const [col, val] of textFields) {
    if (val) patch[col] = val
  }
  if (payload.interests.length > 0) patch['interests'] = payload.interests
  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
    if (error) throw new Error(`Data profil belum tersimpan: ${error.message}`)
    result.profileCompleted = true
  }

  // 3. Jalur mentor: kirim lamaran (hindari ganda bila sudah ada yang
  //    pending/disetujui). Peran tetap 'siswa' sampai admin menyetujui.
  if (payload.role === 'mentor') {
    const { data: existing } = await supabase
      .from('mentor_applications')
      .select('id')
      .eq('user_id', userId)
      .in('status', ['pending', 'approved'])
      .maybeSingle()
    if (!existing) {
      const { error } = await supabase.from('mentor_applications').insert({
        user_id: userId,
        expertise: payload.expertise || null,
        experience: payload.experience || null,
        portfolio_link: payload.portfolioLink || null,
        status: 'pending',
      })
      if (error) throw new Error(`Lamaran mentor belum terkirim: ${error.message}`)
    }
    result.mentorApplied = true
  }

  clearPendingRegistration(email)
  return result
}
