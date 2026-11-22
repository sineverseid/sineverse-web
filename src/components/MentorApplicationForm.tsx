// SINEVERSE — Formulir lamaran mentor (dipakai bersama).
//
// Dipakai di dua tempat: jalur mentor di RegisterPage (saat mendaftar)
// dan halaman MentorPage ("Gabung sebagai Mentor", siswa yang sudah
// masuk). Enam info yang diminta master prompt "Pendaftaran Siswa dan
// Mentor" §2 — TIDAK ADA CV/KTP/sertifikat/surat/dokumen wajib; portofolio
// hanya berupa tautan opsional. Peran mentor baru aktif setelah admin
// menyetujui (trigger database 008).

import { useEffect, useRef, useState } from 'react'
import type { MentorApplicationInput } from '../lib/types'

/** 12 bidang keahlian (master prompt §2; multi-pilih, minimal 1). */
export const MENTOR_EXPERTISE_OPTIONS = [
  'Sinematografi',
  'Penulisan Skenario',
  'Pembuatan Storyboard',
  'Penyutradaraan',
  'Editing Film',
  'Tata Suara dan Musik Film',
  'Film Dokumenter',
  'Produksi dan Manajemen Film',
  'Akting untuk Kamera',
  'Lighting',
  'Art Department',
  'Visual Effects (VFX)',
] as const

/** Pilihan "Lainnya" di bidang keahlian — isian bebas (perintah Founder 22 Nov 18:23). */
export const OTHER_EXPERTISE_LABEL = 'Lainnya'

/** Pilihan pengalaman (master prompt §2). */
export const MENTOR_EXPERIENCE_OPTIONS = [
  'Pemula / masih belajar',
  '1–2 tahun',
  '3–5 tahun',
  'Lebih dari 5 tahun',
] as const

/** Pernyataan sukarela — teks persis dari master prompt §2. */
export const MENTOR_VOLUNTEER_STATEMENT =
  'Saya memahami bahwa keikutsertaan sebagai mentor SINEVERSE bersifat sukarela dan tidak mendapatkan gaji atau honorarium tetap. Saya bersedia berbagi pengetahuan serta membimbing pelajar sesuai kemampuan dan ketersediaan waktu saya. Saya bersedia mengikuti kode etik dan ketentuan perlindungan pengguna SINEVERSE.'

interface MentorApplicationFormProps {
  /** Nilai awal (untuk ajukan ulang setelah revisi). */
  initial?: Partial<MentorApplicationInput>
  /** Dipakai saat formulir berdiri sendiri (MentorPage). */
  onSubmit?: (values: MentorApplicationInput) => void | Promise<void>
  submitting?: boolean
  submitLabel?: string
  /**
   * Dipakai saat formulir tertanam di formulir lain (RegisterPage): tanpa
   * pembungkus <form> dan tanpa tombol kirim sendiri; nilai dilaporkan
   * lewat onValuesChange setiap kali berubah, dan validasi akhir jadi
   * tanggung jawab formulir induk.
   */
  embedded?: boolean
  onValuesChange?: (values: MentorApplicationInput, valid: boolean) => void
}

export default function MentorApplicationForm({
  initial,
  onSubmit,
  submitting,
  submitLabel = 'Kirim Lamaran Mentor',
  embedded = false,
  onValuesChange,
}: MentorApplicationFormProps) {
  const [profession, setProfession] = useState(initial?.profession ?? '')
  // Bidang keahlian di luar 12 pilihan tetap (mis. dari lamaran lama)
  // masuk ke isian bebas "Lainnya", dipisah koma bila lebih dari satu.
  const initialKnown = (initial?.expertise ?? []).filter((x) =>
    (MENTOR_EXPERTISE_OPTIONS as readonly string[]).includes(x),
  )
  const initialOther = (initial?.expertise ?? []).filter(
    (x) => !(MENTOR_EXPERTISE_OPTIONS as readonly string[]).includes(x),
  )
  const [expertise, setExpertise] = useState<string[]>([
    ...initialKnown,
    ...(initialOther.length > 0 ? [OTHER_EXPERTISE_LABEL] : []),
  ])
  const [otherExpertise, setOtherExpertise] = useState(initialOther.join(', '))
  const [experience, setExperience] = useState(initial?.experience ?? '')
  const [portfolioLink, setPortfolioLink] = useState(initial?.portfolio_link ?? '')
  const [reason, setReason] = useState(initial?.reason ?? '')
  const [volunteerAgreed, setVolunteerAgreed] = useState(initial?.volunteer_agreed ?? false)
  const [error, setError] = useState('')

  // "Lainnya" yang dicentang diganti teks isiannya (boleh beberapa,
  // dipisah koma); kalau tidak dicentang, teks isian diabaikan.
  const otherChecked = expertise.includes(OTHER_EXPERTISE_LABEL)
  const otherSkills = otherChecked
    ? otherExpertise.split(',').map((s) => s.trim()).filter(Boolean)
    : []
  const resolvedExpertise = [
    ...expertise.filter((x) => x !== OTHER_EXPERTISE_LABEL),
    ...otherSkills,
  ]
  const values: MentorApplicationInput = {
    profession: profession.trim(),
    expertise: resolvedExpertise,
    experience,
    portfolio_link: portfolioLink.trim() || null,
    reason: reason.trim(),
    volunteer_agreed: volunteerAgreed,
  }
  const valid =
    values.profession.length > 0 &&
    values.expertise.length > 0 &&
    (!otherChecked || otherExpertise.trim().length > 0) &&
    values.experience.length > 0 &&
    values.reason.length > 0 &&
    values.volunteer_agreed

  // Mode tertanam: laporkan nilai + keabsahan ke formulir induk.
  const onValuesChangeRef = useRef(onValuesChange)
  onValuesChangeRef.current = onValuesChange
  useEffect(() => {
    if (!embedded) return
    onValuesChangeRef.current?.(values, valid)
    // Sengaja: hanya nilai yang berubah yang memicu laporan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded, profession, expertise, otherExpertise, experience, portfolioLink, reason, volunteerAgreed])

  function toggleExpertise(item: string) {
    if (item === OTHER_EXPERTISE_LABEL && expertise.includes(item)) {
      setOtherExpertise('')
    }
    setExpertise((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item],
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (values.expertise.length === 0) {
      setError('Pilih minimal satu bidang keahlian.')
      return
    }
    if (otherChecked && otherExpertise.trim().length === 0) {
      setError('Tulis bidang keahlian lainnya.')
      return
    }
    if (!volunteerAgreed) {
      setError('Centang pernyataan kesediaan menjadi mentor sukarela.')
      return
    }
    setError('')
    await onSubmit?.(values)
  }

  const fields = (
    <>
      <label>
        Profesi
        <input
          value={profession}
          onChange={(e) => setProfession(e.target.value)}
          required
          placeholder="Mis. Videografer, guru, mahasiswa film"
        />
      </label>
      <fieldset>
        <legend>Bidang keahlian (pilih minimal satu)</legend>
        <div className="checkbox-grid">
          {MENTOR_EXPERTISE_OPTIONS.map((item) => (
            <label key={item} className="checkbox-item">
              <input
                type="checkbox"
                checked={expertise.includes(item)}
                onChange={() => toggleExpertise(item)}
              />
              {item}
            </label>
          ))}
          <label className="checkbox-item">
            <input
              type="checkbox"
              checked={otherChecked}
              onChange={() => toggleExpertise(OTHER_EXPERTISE_LABEL)}
            />
            {OTHER_EXPERTISE_LABEL}
          </label>
        </div>
        {otherChecked && (
          <label>
            Tulis bidang keahlian lainnya
            <input
              value={otherExpertise}
              onChange={(e) => setOtherExpertise(e.target.value)}
              required
              placeholder="Mis. Color grading, sound design"
            />
          </label>
        )}
      </fieldset>
      <label>
        Pengalaman
        <select value={experience} onChange={(e) => setExperience(e.target.value)} required>
          <option value="" disabled>
            Pilih pengalaman
          </option>
          {MENTOR_EXPERIENCE_OPTIONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <label>
        Tautan portofolio (opsional)
        <input
          type="url"
          value={portfolioLink}
          onChange={(e) => setPortfolioLink(e.target.value)}
          placeholder="https://…"
        />
      </label>
      <label>
        Alasan menjadi mentor
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          required
          placeholder="Ceritakan mengapa kamu ingin membimbing pelajar SINEVERSE…"
        />
      </label>
      <label className="checkbox-item">
        <input
          type="checkbox"
          checked={volunteerAgreed}
          onChange={(e) => setVolunteerAgreed(e.target.checked)}
          required
        />
        {MENTOR_VOLUNTEER_STATEMENT}
      </label>
      <p className="muted">
        Lamaranmu ditinjau admin. Bila disetujui, peran mentor aktif di akun yang sama dan
        Mentor Dashboard terbuka. Tidak ada dokumen yang perlu diunggah.
      </p>
    </>
  )

  if (embedded) {
    return <>{fields}</>
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      {fields}
      {error && <p className="error-box">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? 'Mengirim…' : submitLabel}
      </button>
    </form>
  )
}
