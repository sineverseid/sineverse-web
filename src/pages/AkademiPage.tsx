// SINEVERSE — Katalog Akademi: 10 course Semester 1 (data asli Supabase),
// chip kategori + pencarian. Nilai, tenggat, dan ujian dijangkau dari sini
// (bukan lagi menu utama) — sesuai artefak.
//
// Blok Kurikulum Semester 1 di atas katalog: 10 course wajib sesuai
// SVS-SEM1 (20 minggu) dalam urutan RPS, lengkap dengan status mentor.
// Status mentor tampil di barisnya sendiri di bawah judul — judul tidak
// pernah terpotong di layar HP (tidak seperti artefak yang memadatkan
// judul + pil status dalam satu baris).
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import CourseCard from '../components/CourseCard'
import { useAuth } from '../context/AuthContext'
import { RPS_COURSE_ORDER, rpsWeekLabel } from '../lib/brand'
import { fetchCourses, fetchProfileNames } from '../lib/supabase'
import type { Course } from '../lib/types'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

const KURIKULUM_INTRO =
  'Sepuluh course wajib sesuai SVS-SEM1 (20 minggu) — semuanya sudah muncul di kurikulum. Course yang sudah memiliki mentor belum dapat dimulai, tetapi kamu dapat mengikuti untuk bergabung dan akan diberi tahu begitu mentor ditetapkan.'

export default function AkademiPage() {
  const { user } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [mentorNames, setMentorNames] = useState<Map<string, string>>(new Map())
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('Semua')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchCourses()
      .then(async (data) => {
        if (cancelled) return
        setCourses(data)
        const mentorIds = data.map((c) => c.mentor_id).filter((id): id is string => !!id)
        if (mentorIds.length > 0) {
          const names = await fetchProfileNames(mentorIds).catch(() => new Map<string, string>())
          if (!cancelled) setMentorNames(names)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat course.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const categories = useMemo(() => {
    const cats = [...new Set(courses.map((c) => c.category ?? 'Lainnya'))]
    return ['Semua', ...cats]
  }, [courses])

  // 10 course kurikulum Semester 1, dalam urutan RPS (bukan alfabetis).
  const kurikulumCourses = useMemo(() => {
    const byId = new Map(courses.map((c) => [c.id, c]))
    return (RPS_COURSE_ORDER as readonly string[])
      .map((id) => byId.get(id))
      .filter((c): c is Course => !!c)
  }, [courses])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return courses.filter((c) => {
      if (category !== 'Semua' && (c.category ?? 'Lainnya') !== category) return false
      if (!q) return true
      return (
        c.title.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q)
      )
    })
  }, [courses, query, category])

  if (loading) {
    return (
      <div className="page">
        <p className="muted">Memuat course…</p>
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

  return (
    <div className="page">
      <PageHeader
        icon="academy"
        title="Academy"
        subtitle={`Kurikulum Semester 1 — ${courses.length} course. Kategori → Course → Module → Lesson.`}
      />

      {kurikulumCourses.length > 0 && (
        <section className="section kurikulum" aria-label="Kurikulum Semester 1">
          <h2>Kurikulum Semester 1 — Dasar-Dasar Perfilman</h2>
          <p className="muted">{KURIKULUM_INTRO}</p>
          <ol className="kurikulum-list">
            {kurikulumCourses.map((c, i) => {
              const week = rpsWeekLabel(c.id)
              const mentorName = c.mentor_id ? mentorNames.get(c.mentor_id) : undefined
              const status = c.mentor_id
                ? mentorName
                  ? `Mentor: ${mentorName} — bisa dimulai`
                  : 'Mentor sudah ditetapkan — bisa dimulai'
                : 'Belum ada mentor — ikuti untuk bergabung'
              return (
                <li key={c.id} className="kurikulum-row">
                  <span className="kurikulum-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div className="kurikulum-main">
                    <p className="kurikulum-title">
                      <Link to={`/course/${c.id}`}>{c.title}</Link>
                      {week && <span className="muted"> · {week}</span>}
                    </p>
                    <p className="kurikulum-status">{status}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {user && (
        <p className="muted">
          Perkembangan saya:{' '}
          <Link to="/nilai">Nilai Saya</Link>
          {' · '}
          <Link to="/tenggat">Tenggat Saya</Link>
          {' · '}
          <Link to="/ujian">Ujian Kompetensi</Link>
        </p>
      )}

      <div className="filters">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari course…"
          aria-label="Cari course"
          className="search-input"
        />
        <div className="chip-row" role="group" aria-label="Filter kategori">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`chip chip-button ${category === cat ? 'chip-active' : ''}`}
              onClick={() => setCategory(cat)}
              aria-pressed={category === cat}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          message={
            courses.length === 0
              ? 'Belum ada course yang tersedia.'
              : 'Tidak ada course yang cocok dengan pencarian kamu.'
          }
        />
      ) : (
        <ul className="course-list">
          {filtered.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </ul>
      )}
    </div>
  )
}
