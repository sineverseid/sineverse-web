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
import { fetchCourses, fetchProfileNames, supabase } from '../lib/supabase'
import type { Course } from '../lib/types'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

const KURIKULUM_INTRO =
  'Sepuluh course wajib sesuai SVS-SEM1 (20 minggu) — semuanya sudah muncul di kurikulum. Course yang belum memiliki mentor belum dapat dimulai, tetapi kamu dapat mengikuti untuk bergabung dan akan diberi tahu begitu mentor ditetapkan.'

export default function AkademiPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [mentorNames, setMentorNames] = useState<Map<string, string>>(new Map())
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('Semua')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Progres Academy (admin saja): per course jumlah siswa + lesson selesai.
  const [adminStats, setAdminStats] = useState<Map<
    string,
    { students: number; completed: number; total: number }
  > | null>(null)
  const [adminTotals, setAdminTotals] = useState({ enrollments: 0, completed: 0, withoutMentor: 0 })

  const isMentor = profile?.role === 'mentor'
  const isAdmin = profile?.role === 'admin'

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

  // Progres Academy untuk admin: siswa, lesson selesai, dan total lesson
  // per course — dihitung dari enrollments + lesson_progress asli.
  // Hanya progres siswa dan mentor yang dihitung: sebuah lesson selesai
  // dihitung bila yang menyelesaikannya terdaftar di course itu (siswa)
  // atau mengampu course itu (mentor). Admin hanya memantau dan tidak
  // mengambil course, jadi aktivitas admin tidak masuk hitungan.
  useEffect(() => {
    if (!isAdmin || courses.length === 0) return
    let cancelled = false
    async function loadStats() {
      try {
        const [{ data: mods }, { data: less }, { data: enr }, { data: prog }] =
          await Promise.all([
            supabase.from('modules').select('id,course_id'),
            supabase.from('lessons').select('id,module_id'),
            supabase.from('enrollments').select('course_id,user_id'),
            supabase.from('lesson_progress').select('lesson_id,user_id,status'),
          ])
        if (cancelled) return
        const moduleCourse = new Map(
          ((mods ?? []) as { id: string; course_id: string }[]).map((m) => [m.id, m.course_id]),
        )
        const lessonCourse = new Map(
          ((less ?? []) as { id: string; module_id: string }[]).map((l) => [
            l.id,
            moduleCourse.get(l.module_id) ?? '',
          ]),
        )
        // Siapa terdaftar di course mana, dan siapa mentor tiap course.
        const enrolledSet = new Set(
          ((enr ?? []) as { course_id: string; user_id: string }[]).map(
            (e) => `${e.user_id}:${e.course_id}`,
          ),
        )
        const mentorByCourse = new Map(
          courses.map((c) => [c.id, c.mentor_id as string | null]),
        )
        const stats = new Map<string, { students: number; completed: number; total: number }>()
        for (const c of courses) stats.set(c.id, { students: 0, completed: 0, total: 0 })
        for (const l of (less ?? []) as { id: string; module_id: string }[]) {
          const cid = moduleCourse.get(l.module_id)
          const row = cid ? stats.get(cid) : undefined
          if (row) row.total += 1
        }
        for (const e of (enr ?? []) as { course_id: string }[]) {
          const row = stats.get(e.course_id)
          if (row) row.students += 1
        }
        let completedTotal = 0
        for (const p of (prog ?? []) as { lesson_id: string; user_id: string; status: string }[]) {
          if (p.status !== 'completed') continue
          const cid = lessonCourse.get(p.lesson_id)
          if (!cid) continue
          // Hanya hitung bila penyelesainya siswa terdaftar di course ini
          // atau mentor yang mengampu course ini (bukan admin).
          const isStudent = enrolledSet.has(`${p.user_id}:${cid}`)
          const isMentor = mentorByCourse.get(cid) === p.user_id
          if (!isStudent && !isMentor) continue
          const row = stats.get(cid)
          if (row) {
            row.completed += 1
            completedTotal += 1
          }
        }
        if (cancelled) return
        setAdminStats(stats)
        setAdminTotals({
          enrollments: (enr ?? []).length,
          completed: completedTotal,
          withoutMentor: courses.filter((c) => !c.mentor_id).length,
        })
      } catch {
        if (!cancelled) setAdminStats(new Map())
      }
    }
    void loadStats()
    return () => {
      cancelled = true
    }
  }, [isAdmin, courses])

  // Mentor hanya melihat course yang diampunya; siswa dan admin melihat
  // semua course (admin memakai katalog di bawah Progres Academy).
  const myCourses = useMemo(
    () => courses.filter((c) => c.mentor_id === user?.id),
    [courses, user?.id],
  )
  const visibleCourses = isMentor ? myCourses : courses

  const categories = useMemo(() => {
    const cats = [...new Set(visibleCourses.map((c) => c.category ?? 'Lainnya'))]
    return ['Semua', ...cats]
  }, [visibleCourses])

  // 10 course kurikulum Semester 1, dalam urutan RPS (bukan alfabetis).
  const kurikulumCourses = useMemo(() => {
    const byId = new Map(courses.map((c) => [c.id, c]))
    return (RPS_COURSE_ORDER as readonly string[])
      .map((id) => byId.get(id))
      .filter((c): c is Course => !!c)
  }, [courses])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return visibleCourses.filter((c) => {
      if (category !== 'Semua' && (c.category ?? 'Lainnya') !== category) return false
      if (!q) return true
      return (
        c.title.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q)
      )
    })
  }, [visibleCourses, query, category])

  if (loading || authLoading) {
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
        subtitle={
          isAdmin
            ? `Progres Academy — ${courses.length} course · ${adminTotals.enrollments} enrollment · ${adminTotals.withoutMentor} tanpa mentor.`
            : isMentor
              ? `Course yang kamu ampu — ${myCourses.length} course. Kategori → Course → Module → Lesson.`
              : `Kurikulum Semester 1 — ${courses.length} course. Kategori → Course → Module → Lesson.`
        }
      />

      {isAdmin && (
        <section className="section" aria-label="Progres Academy">
          <h2>Progres Academy</h2>
          <p className="muted">
            {adminTotals.enrollments} enrollment · {adminTotals.completed} lesson diselesaikan ·{' '}
            {adminTotals.withoutMentor} dari {courses.length} course belum punya mentor.
          </p>
          {kurikulumCourses.length === 0 ? (
            <p className="empty">Belum ada course di kurikulum.</p>
          ) : (
            <ol className="kurikulum-list">
              {kurikulumCourses.map((c, i) => {
                const week = rpsWeekLabel(c.id)
                const mentorName = c.mentor_id ? mentorNames.get(c.mentor_id) : undefined
                const st = adminStats?.get(c.id)
                const status = !c.mentor_id
                  ? 'Tanpa mentor'
                  : (st?.students ?? 0) === 0
                    ? 'Belum dimulai'
                    : 'Berjalan'
                const pct =
                  st && st.students > 0 && st.total > 0
                    ? Math.round((st.completed / (st.students * st.total)) * 100)
                    : 0
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
                      <p className="kurikulum-status">
                        {mentorName ? `Mentor: ${mentorName}` : 'Belum ada mentor'} ·{' '}
                        {st
                          ? `${st.students} siswa · ${st.completed} lesson selesai · ${st.total} lesson di course`
                          : 'Data progres belum tersedia'}{' '}
                        · {status}
                      </p>
                      {st && st.students > 0 && st.total > 0 && (
                        <div
                          className="progress-track"
                          role="progressbar"
                          aria-valuenow={pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`Progres ${c.title}: ${pct} persen`}
                        >
                          <div className="progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      )}

      {isMentor && (
        <p>
          <Link to="/mentor/course-builder" className="btn btn-primary">
            Course Builder
          </Link>
        </p>
      )}

      {!isAdmin && kurikulumCourses.length > 0 && (
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
                    {isMentor && c.mentor_id === user?.id && (
                      <p className="kurikulum-status">
                        <strong>Kamu mengampu course ini</strong>
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {user && !isMentor && !isAdmin && (
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
            visibleCourses.length === 0
              ? isMentor
                ? 'Kamu belum mengampu course apa pun.'
                : 'Belum ada course yang tersedia.'
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
