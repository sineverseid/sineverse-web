// SINEVERSE — Katalog Akademi: 10 course Semester 1 (data asli Supabase),
// chip kategori + pencarian.
import { useEffect, useMemo, useState } from 'react'
import CourseCard from '../components/CourseCard'
import { fetchCourses } from '../lib/supabase'
import type { Course } from '../lib/types'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

export default function AkademiPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('Semua')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchCourses()
      .then((data) => {
        if (!cancelled) setCourses(data)
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
        title="Akademi"
        subtitle={`Kurikulum Semester 1 — ${courses.length} course. Kategori → Course → Module → Lesson.`}
      />

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
