// SINEVERSE — Avatar komunitas (foto profil komunitas).
//
// Arif (22 Nov 2026): komunitas dibuat seperti foto profil — anggota bisa
// memakai avatar yang tersedia ATAU memasukkan foto sendiri. Avatar
// disimpan di kolom communities.cover_url (migrasi 004) dan, untuk usulan
// yang belum disetujui, di community_proposals.cover_url (migrasi 031).
//
// ---------------------------------------------------------------------------
// KONVENSI cover_url — baca ini sebelum mengubah apa pun:
// ---------------------------------------------------------------------------
// cover_url hanya punya tiga bentuk:
//   1. URL http(s)  — foto yang diunggah anggota ke bucket Storage
//      'community-avatars' (lihat uploadCommunityAvatar di bawah).
//      Resolver mengembalikannya apa adanya sebagai { kind: 'image' }.
//   2. "preset:<id>" — BUKAN URL, melainkan kode preset warna, mis.
//      "preset:mint". <id> harus salah satu id di
//      COMMUNITY_AVATAR_PRESETS. Resolver mengubahnya menjadi ubin
//      inisial (huruf pertama nama komunitas) dengan warna preset itu.
//   3. null / string kosong / "preset:<id-tidak-dikenal>" — tidak ada
//      avatar yang dipilih: resolver memakai ubin inisial baku (navy).
//      Komunitas seed yang belum memilih avatar tampil seperti ini;
//      JANGAN mengisi foto karangan untuk mereka.
// Nilai "preset:..." tidak pernah dikirim sebagai src <img>: resolver
// selalu mengubahnya dulu menjadi warna. Bila preset dihapus dari daftar
// di kemudian hari, komunitas yang memakainya jatuh kembali ke ubin
// inisial baku, bukan error.
// ---------------------------------------------------------------------------

import { dataUrlToBlob, photoToDataUrl } from './photo'
import { uploadToBucket } from './supabase'

/** Bucket Storage untuk foto avatar komunitas (migrasi 031, publik). */
export const COMMUNITY_AVATAR_BUCKET = 'community-avatars'

/** Awalan yang menandai cover_url sebagai kode preset, bukan URL foto. */
export const PRESET_AVATAR_PREFIX = 'preset:'

/** Satu pilihan avatar siap pakai: ubin inisial dengan warna preset. */
export interface CommunityAvatarPreset {
  /** id yang disimpan setelah awalan "preset:" di cover_url. */
  id: string
  /** Label yang tampil sebagai tooltip di picker. */
  label: string
  /** Warna latar ubin. */
  bg: string
  /** Warna huruf inisial di atas latar. */
  fg: string
}

/**
 * 8 preset warna, selaras palet SINEVERSE (Deep Navy #172438, Soft White
 * #F5F7FA, Film Green #16865E, Mint #A3E6C4) + variasi senada: teal laut,
 * hijau rimba, emas, oranye senja, slate. CSS/inline style saja, tanpa
 * aset baru.
 */
export const COMMUNITY_AVATAR_PRESETS: CommunityAvatarPreset[] = [
  { id: 'navy', label: 'Navy', bg: '#172438', fg: '#F5F7FA' },
  { id: 'mint', label: 'Mint', bg: '#A3E6C4', fg: '#172438' },
  { id: 'hijau', label: 'Hijau Film', bg: '#16865E', fg: '#FFFFFF' },
  { id: 'laut', label: 'Laut', bg: '#1F6F6B', fg: '#F5F7FA' },
  { id: 'rimba', label: 'Rimba', bg: '#2F6B3A', fg: '#F5F7FA' },
  { id: 'emas', label: 'Emas', bg: '#C9A227', fg: '#172438' },
  { id: 'senja', label: 'Senja', bg: '#C96A2B', fg: '#FFFFFF' },
  { id: 'slate', label: 'Slate', bg: '#46586E', fg: '#F5F7FA' },
]

/** Ubin inisial baku bila komunitas belum memilih avatar (navy). */
export const DEFAULT_AVATAR_COLORS = { bg: '#172438', fg: '#F5F7FA' }

/** Hasil resolver: foto, atau ubin inisial dengan warnanya. */
export type CommunityAvatar =
  | { kind: 'image'; url: string }
  | { kind: 'initial'; letter: string; bg: string; fg: string }

/** Huruf pertama nama komunitas (kapital), '?' bila nama kosong. */
export function communityAvatarLetter(name: string): string {
  const letter = name.trim().charAt(0)
  return letter ? letter.toUpperCase() : '?'
}

/**
 * Ubah cover_url + nama komunitas menjadi avatar yang bisa dirender:
 * URL http(s) -> foto; "preset:<id>" -> ubin inisial warna preset;
 * kosong / preset tak dikenal -> ubin inisial navy baku.
 */
export function resolveCommunityAvatar(
  coverUrl: string | null | undefined,
  name: string,
): CommunityAvatar {
  const letter = communityAvatarLetter(name)
  const value = (coverUrl ?? '').trim()
  if (value.startsWith(PRESET_AVATAR_PREFIX)) {
    const preset = COMMUNITY_AVATAR_PRESETS.find(
      (p) => p.id === value.slice(PRESET_AVATAR_PREFIX.length),
    )
    if (preset) return { kind: 'initial', letter, bg: preset.bg, fg: preset.fg }
    // Preset tak dikenal: jatuh ke ubin baku, bukan error.
  } else if (/^https?:\/\//i.test(value)) {
    return { kind: 'image', url: value }
  }
  return { kind: 'initial', letter, bg: DEFAULT_AVATAR_COLORS.bg, fg: DEFAULT_AVATAR_COLORS.fg }
}

/**
 * Nilai cover_url dari pilihan picker: foto yang diunggah menang atas
 * preset; bila keduanya kosong, null (ubin inisial baku).
 */
export function coverValueFromChoice(
  uploadUrl: string | null,
  presetId: string | null,
): string | null {
  if (uploadUrl) return uploadUrl
  if (presetId) return `${PRESET_AVATAR_PREFIX}${presetId}`
  return null
}

/**
 * Unggah foto avatar komunitas: diperkecil dulu di browser (sisi
 * terpanjang max 1024px, JPEG 0.85 — aturan foto Arif, lihat photo.ts),
 * lalu diunggah ke bucket 'community-avatars' di path milik pengunggah.
 * Mengembalikan URL publik, atau null bila bucket belum tersedia
 * (migrasi 031 belum diterapkan) — pemanggil menampilkan pesan jujur.
 */
export async function uploadCommunityAvatar(
  userId: string,
  file: File,
): Promise<string | null> {
  const dataUrl = await photoToDataUrl(file)
  const blob = await dataUrlToBlob(dataUrl)
  // P8 (audit 23 Nov 2026): photoToDataUrl mengubah foto besar menjadi
  // JPEG — samakan ekstensi dengan isi blob sebenarnya (pola yang sama
  // dipakai registration.ts dan uploadEventPoster), bukan dari file asli.
  // Kalau tidak, file PNG besar tersimpan sebagai `.png` berisi byte JPEG.
  const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'
  const uploadFile = new File([blob], `avatar.${ext}`, {
    type: blob.type || 'image/jpeg',
  })
  return uploadToBucket(
    COMMUNITY_AVATAR_BUCKET,
    `${userId}/${Date.now()}.${ext}`,
    uploadFile,
  )
}
