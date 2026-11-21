// SINEVERSE — RPS Semester 1 (kode SVS-SEM1), tampil read-only.
//
// Sumber utama: baris `rps` di Supabase (kode SVS-SEM1) bila tabelnya sudah
// ada. Bila tabel RPS belum tersedia (migrasi 003 belum diterapkan), halaman
// ini menyusun tampilan 20 minggu dari 10 course Semester 1 yang sudah ada
// di database (2 minggu per course, sesuai urutan seed) dan menandainya
// dengan jelas — bukan dari data karangan.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BRAND, GRADEBOOK_WEIGHTS, PASSING_GRADE } from '../lib/brand'
import { fetchCourses, supabase } from '../lib/supabase'
import type { Rps, RpsWeek } from '../lib/types'
import PageHeader from '../components/PageHeader'

export default function RpsPage() {
  const [rps, setRps] = useState<Rps | null>(null)
  const [fallbackWeeks, setFallbackWeeks] = useState<RpsWeek[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data, error: rpsError } = await supabase
          .from('rps')
          .select('*')
          .eq('code', BRAND.rpsCode)
          .maybeSingle()
        if (!cancelled && data && !rpsError) {
          const row = data as unknown as {
            code: string
            title: string
            description: string | null
            weights: { kuis: number; tugas: number; ujian: number }
            passing_grade: number
            weeks: RpsWeek[]
          }
          setRps({
            code: row.code,
            title: row.title,
            description: row.description,
            weights: row.weights ?? {
              kuis: GRADEBOOK_WEIGHTS.kuis * 100,
              tugas: GRADEBOOK_WEIGHTS.tugas * 100,
              ujian: GRADEBOOK_WEIGHTS.ujian * 100,
            },
            passing_grade: row.passing_grade ?? PASSING_GRADE,
            weeks: Array.isArray(row.weeks) ? row.weeks : [],
          })
          return
        }
        // Fallback: susun 20 minggu dari 10 course Semester 1 yang live.
        const courses = await fetchCourses()
        if (cancelled) return
        const weeks: RpsWeek[] = []
        courses.forEach((c, i) => {
          weeks.push({ week: i * 2 + 1, topic: `${c.title} — Pengantar & Konsep Dasar` })
          weeks.push({ week: i * 2 + 2, topic: `${c.title} — Praktik & Latihan` })
        })
        setFallbackWeeks(weeks)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat RPS.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="page">
        <p className="muted">Memuat RPS…</p>
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

  const weeks = rps?.weeks ?? fallbackWeeks ?? []
  const weights = rps?.weights ?? {
    kuis: GRADEBOOK_WEIGHTS.kuis * 100,
    tugas: GRADEBOOK_WEIGHTS.tugas * 100,
    ujian: GRADEBOOK_WEIGHTS.ujian * 100,
  }

  return (
    <div className="page">
      <PageHeader
        icon="rps"
        title="RPS Semester 1"
        subtitle={
          <>
            Kode: {BRAND.rpsCode} · {rps?.title ?? 'Rencana Pembelajaran Semester — Filmmaking'}
          </>
        }
      />
      {rps?.description && <p>{rps.description}</p>}
      {!rps && (
        <p className="notice-box">
          Baris RPS {BRAND.rpsCode} belum tersedia di database Supabase. Tampilan 20 minggu di
          bawah disusun otomatis dari 10 course Semester 1 yang sudah ada di Akademi (2 minggu
          per course).
        </p>
      )}
      <section className="section">
        <h2>Bobot Penilaian</h2>
        <ul>
          <li>Kuis: {weights.kuis}%</li>
          <li>Tugas: {weights.tugas}%</li>
          <li>Ujian: {weights.ujian}%</li>
          <li>Nilai lulus: {rps?.passing_grade ?? PASSING_GRADE}</li>
        </ul>
      </section>
      <section className="section">
        <h2>Rencana 20 Minggu</h2>
        {weeks.length === 0 ? (
          <p className="empty">Belum ada rincian minggu untuk RPS ini.</p>
        ) : (
          <ol className="week-list">
            {weeks.map((w) => (
              <li key={w.week}>
                <strong>Minggu {w.week}:</strong> {w.course ? `${w.course} — ` : ''}
                {w.topic}
                {w.activity ? ` — ${w.activity}` : ''}
              </li>
            ))}
          </ol>
        )}
      </section>
      <p>
        <Link to="/akademi">Lihat Course Semester 1 di Akademi</Link>
      </p>
    </div>
  )
}
