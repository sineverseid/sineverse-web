// SINEVERSE, Katalog Akademi: 10 course Semester 1 (data asli Supabase),
// chip kategori + pencarian. Nilai, tenggat, dan ujian dijangkau dari sini
// (bukan lagi menu utama), sesuai artefak.
//
// Blok Kurikulum Semester 1 di atas katalog: 10 course wajib sesuai
// SVS-SEM1 (20 minggu) dalam urutan RPS, lengkap dengan status mentor.
// Status mentor tampil di barisnya sendiri di bawah judul, judul tidak
// pernah terpotong di layar HP (tidak seperti artefak yang memadatkan
// judul + pil status dalam satu baris).
//
// Bagian data (22 Nov 2026): Kursus Saya (Aktif/Selesai dari
// enrollments + lesson_progress asli), Rekomendasi (course yang belum
// diambil, urutan RPS, maks 4), tab admin Aktif/Nonaktif, dan
// Pengajuan mentor (course_claims) — semuanya dari Supabase, tanpa
// angka buatan. Catatan: tabel courses tidak punya kolom status, jadi
// Aktif = sudah ada mentor (Siap Dimulai, Master Prompt §6),
// Nonaktif = belum ada mentor.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import CourseCard from '../components/CourseCard'
import Icon from '../components/icons'
import { useAuth } from '../context/AuthContext'
import { RPS_COURSE_ORDER, rpsWeekLabel } from '../lib/brand'
import { fetchCourses, fetchProfileNames, supabase } from '../lib/supabase'
import type { Course } from '../lib/types'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

const KURIKULUM_INTRO =
  'Sepuluh course wajib sesuai SVS-SEM1 (20 minggu), semuanya sudah muncul di kurikulum. Course yang belum memiliki mentor belum dapat dimulai, tetapi kamu dapat mengikuti untuk bergabung dan akan diberi tahu begitu mentor ditetapkan.'

export default function AkademiPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [mentorNames, setMentorNames] = useState<Map<string, string>>(new Map())
  const [mentorNamesLoaded, setMentorNamesLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('Semua')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Penanda muat awal katalog selesai — dipakai supaya pesan kosong tidak
  // sempat tampil saat daftar course masih dimuat (lihat "Semua Kursus").
  const [coursesLoaded, setCoursesLoaded] = useState(false)
  // Progres Academy (admin saja): per course jumlah siswa + lesson selesai.
  const [adminStats, setAdminStats] = useState<Map<
    string,
    { students: number; completed: number; total: number }
  > | null>(null)
  const [adminTotals, setAdminTotals] = useState({ enrollments: 0, completed: 0, withoutMentor: 0 })
  // Kursus Saya (siswa): enrollment + progres per course
  // (null = belum dimuat). Selesai = semua lesson course selesai.
  const [myEnrolledIds, setMyEnrolledIds] = useState<Set<string> | null>(null)
  const [myCourseProgress, setMyCourseProgress] = useState<Map<
    string,
    { done: number; total: number }
  > | null>(null)
  const [myTab, setMyTab] = useState<'aktif' | 'selesai'>('aktif')
  // Tab status course (admin): Aktif = ada mentor, Nonaktif = tanpa mentor.
  const [adminStatusTab, setAdminStatusTab] = useState<'semua' | 'aktif' | 'nonaktif'>('semua')
  // Klaim mengampu saya per course (mentor saja; null = belum dimuat).
  const [myClaims, setMyClaims] = useState<Map<
    string,
    { status: string; decision_note: string | null }
  > | null>(null)

  const isSiswa = profile?.role === 'siswa'
  const isMentor = profile?.role === 'mentor'
  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    let cancelled = false
    fetchCourses()
      .then(async (data) => {
        if (cancelled) return
        setCourses(data)
        setCoursesLoaded(true)
        const mentorIds = data.map((c) => c.mentor_id).filter((id): id is string => !!id)
        if (mentorIds.length > 0) {
          const names = await fetchProfileNames(mentorIds).catch(() => new Map<string, string>())
          if (!cancelled) {
            setMentorNames(names)
            setMentorNamesLoaded(true)
          }
        } else if (!cancelled) {
          setMentorNamesLoaded(true)
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
  // per course, dihitung dari enrollments + lesson_progress asli.
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

  // Kursus Saya (siswa): enrollment saya + lesson selesai saya per
  // course, dihitung dari enrollments + lesson_progress asli. Satu
  // query per tabel untuk semua course (bukan satu per course).
  useEffect(() => {
    if (!user || !isSiswa || courses.length === 0) return
    const uid = user.id
    let cancelled = false
    async function loadMine() {
      try {
        const [{ data: mods }, { data: less }, { data: enr }, { data: prog }] =
          await Promise.all([
            supabase.from('modules').select('id,course_id'),
            supabase.from('lessons').select('id,module_id'),
            supabase.from('enrollments').select('course_id').eq('user_id', uid),
            supabase
              .from('lesson_progress')
              .select('lesson_id')
              .eq('user_id', uid)
              .eq('status', 'completed'),
          ])
        if (cancelled) return
        const moduleCourse = new Map(
          ((mods ?? []) as { id: string; course_id: string }[]).map((m) => [m.id, m.course_id]),
        )
        const completedLessonIds = new Set(
          ((prog ?? []) as { lesson_id: string }[]).map((p) => p.lesson_id),
        )
        const per = new Map<string, { done: number; total: number }>()
        for (const c of courses) per.set(c.id, { done: 0, total: 0 })
        for (const l of (less ?? []) as { id: string; module_id: string }[]) {
          const cid = moduleCourse.get(l.module_id)
          const row = cid ? per.get(cid) : undefined
          if (row) {
            row.total += 1
            if (completedLessonIds.has(l.id)) row.done += 1
          }
        }
        if (cancelled) return
        setMyEnrolledIds(
          new Set(((enr ?? []) as { course_id: string }[]).map((e) => e.course_id)),
        )
        setMyCourseProgress(per)
      } catch {
        if (!cancelled) {
          setMyEnrolledIds(new Set())
          setMyCourseProgress(new Map())
        }
      }
    }
    void loadMine()
    return () => {
      cancelled = true
    }
  }, [user?.id, isSiswa, courses])

  // Pengajuan mengampu saya per course (mentor saja): satu baris
  // course_claims terbaru per course — klaim ditolak yang diajukan
  // ulang memperbarui baris yang sama, jadi tidak ada duplikat.
  useEffect(() => {
    if (!user || !isMentor) return
    const uid = user.id
    let cancelled = false
    async function loadClaims() {
      try {
        const { data, error } = await supabase
          .from('course_claims')
          .select('course_id,status,decision_note,created_at')
          .eq('mentor_id', uid)
          .order('created_at', { ascending: false })
        if (error) throw error
        if (cancelled) return
        const map = new Map<string, { status: string; decision_note: string | null }>()
        for (const r of (data ?? []) as {
          course_id: string
          status: string
          decision_note: string | null
        }[]) {
          if (!map.has(r.course_id)) {
            map.set(r.course_id, { status: r.status, decision_note: r.decision_note })
          }
        }
        setMyClaims(map)
      } catch {
        if (!cancelled) setMyClaims(new Map())
      }
    }
    void loadClaims()
    return () => {
      cancelled = true
    }
  }, [user?.id, isMentor])

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

  // Kursus Saya (siswa): course yang saya ambil, dalam urutan RPS
  // (courses sudah terurut RPS oleh fetchCourses). Selesai = semua
  // lesson course selesai dan course punya minimal 1 lesson; course
  // tanpa lesson tidak pernah dihitung selesai.
  const myCoursesList = useMemo(
    () => (myEnrolledIds ? courses.filter((c) => myEnrolledIds.has(c.id)) : []),
    [courses, myEnrolledIds],
  )
  const myActiveCourses = useMemo(
    () =>
      myCoursesList.filter((c) => {
        const p = myCourseProgress?.get(c.id)
        return !(p && p.total > 0 && p.done >= p.total)
      }),
    [myCoursesList, myCourseProgress],
  )
  const myDoneCourses = useMemo(
    () =>
      myCoursesList.filter((c) => {
        const p = myCourseProgress?.get(c.id)
        return !!p && p.total > 0 && p.done >= p.total
      }),
    [myCoursesList, myCourseProgress],
  )
  const myShownCourses = myTab === 'aktif' ? myActiveCourses : myDoneCourses

  // Rekomendasi (siswa): course kurikulum yang belum saya ambil,
  // urutan RPS, maks 4. Bagian disembunyikan bila tidak ada.
  const recommendations = useMemo(
    () =>
      myEnrolledIds
        ? kurikulumCourses.filter((c) => !myEnrolledIds.has(c.id)).slice(0, 4)
        : [],
    [kurikulumCourses, myEnrolledIds],
  )

  // Course tanpa mentor (untuk Pengajuan mentor, mentor saja).
  const mentorlessCourses = useMemo(
    () => courses.filter((c) => !c.mentor_id),
    [courses],
  )

  // Hitungan tab status admin: Aktif = sudah ada mentor.
  const adminActiveCount = useMemo(
    () => courses.filter((c) => c.mentor_id).length,
    [courses],
  )
  const adminNonActiveCount = courses.length - adminActiveCount

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return visibleCourses.filter((c) => {
      if (isAdmin) {
        if (adminStatusTab === 'aktif' && !c.mentor_id) return false
        if (adminStatusTab === 'nonaktif' && c.mentor_id) return false
      }
      if (category !== 'Semua' && (c.category ?? 'Lainnya') !== category) return false
      if (!q) return true
      const mentorName = c.mentor_id ? (mentorNames.get(c.mentor_id) ?? '') : ''
      return (
        c.title.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q) ||
        (c.category ?? '').toLowerCase().includes(q) ||
        mentorName.toLowerCase().includes(q)
      )
    })
  }, [visibleCourses, query, category, mentorNames, isAdmin, adminStatusTab])

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
            ? adminStats === null
              ? 'Progres Academy, Memuat statistik…'
              : `Progres Academy, ${courses.length} course · ${adminTotals.enrollments} enrollment · ${adminTotals.withoutMentor} tanpa mentor.`
            : isMentor
              ? `Course yang kamu ampu, ${myCourses.length} course. Kategori → Course → Module → Lesson.`
              : `Kurikulum Semester 1, ${courses.length} course. Kategori → Course → Module → Lesson.`
        }
      />

      {isAdmin && (
        <section className="section" aria-label="Progres Academy">
          <div className="dash-section-head">
            <h2>Progres Academy</h2>
          </div>
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
          <h2>Kurikulum Semester 1, Dasar-Dasar Perfilman</h2>
          <p className="muted">{KURIKULUM_INTRO}</p>
          <ol className="kurikulum-list">
            {kurikulumCourses.map((c, i) => {
              const week = rpsWeekLabel(c.id)
              const mentorName = c.mentor_id ? mentorNames.get(c.mentor_id) : undefined
              const isMine = isMentor && c.mentor_id === user?.id
              const status = c.mentor_id
                ? mentorName
                  ? `Mentor: ${mentorName}, bisa dimulai`
                  : mentorNamesLoaded
                    ? 'Mentor: tidak diketahui'
                    : 'Memuat info mentor…'
                : 'Belum ada mentor, ikuti untuk bergabung'
              return (
                <li key={c.id} className="kurikulum-row">
                  <span className="kurikulum-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div className="kurikulum-main">
                    <p className="kurikulum-title">
                      {isMentor && !isMine ? (
                        <span>{c.title}</span>
                      ) : (
                        <Link to={`/course/${c.id}`}>{c.title}</Link>
                      )}
                      {week && <span className="muted"> · {week}</span>}{' '}
                      {c.mentor_id ? (
                        <span className="pill-active">Bisa dimulai</span>
                      ) : (
                        <span className="pill-waiting">Menunggu mentor</span>
                      )}
                    </p>
                    <p className="kurikulum-status">{status}</p>
                    {isMentor && isMine && (
                      <p className="kurikulum-status">
                        <strong>Kamu mengampu course ini</strong>
                      </p>
                    )}
                    {isMentor && !isMine && (
                      <p className="kurikulum-status">Bukan course kamu</p>
                    )}
                  </div>
                  {!(isMentor && !isMine) && (
                    <span className="kurikulum-chevron" aria-hidden="true">
                      <Icon name="chevronRight" size={18} />
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {isMentor && mentorlessCourses.length > 0 && (
        <section className="section" aria-label="Pengajuan mentor">
          <div className="dash-section-head">
            <h2>Pengajuan Mentor</h2>
          </div>
          <p className="muted">
            Course yang belum memiliki mentor. Ajukan untuk mengampu dari halaman course.
          </p>
          <ol className="kurikulum-list">
            {mentorlessCourses.map((c, i) => {
              const week = rpsWeekLabel(c.id)
              const claim = myClaims?.get(c.id)
              const claimText =
                myClaims === null
                  ? 'Memuat status pengajuan…'
                  : !claim
                    ? 'Belum ada pengajuan mengampu dari kamu.'
                    : claim.status === 'pending'
                      ? 'Pengajuanmu: Menunggu — admin sedang meninjau.'
                      : claim.status === 'approved'
                        ? 'Pengajuanmu: Disetujui.'
                        : claim.status === 'rejected'
                          ? `Pengajuanmu: Ditolak${claim.decision_note ? ` — ${claim.decision_note}` : '.'}`
                          : `Pengajuanmu: ${claim.status}.`
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
                    <p className="kurikulum-status">{claimText}</p>
                    {myClaims !== null && (!claim || claim.status === 'rejected') && (
                      <p className="kurikulum-status">
                        <Link to={`/course/${c.id}`}>
                          {claim?.status === 'rejected' ? 'Ajukan Lagi' : 'Ajukan untuk Mengampu'}
                        </Link>
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {user && isSiswa && (
        <section className="section" aria-label="Kursus Saya">
          <div className="dash-section-head">
            <h2>Kursus Saya</h2>
          </div>
          {myEnrolledIds === null || myCourseProgress === null ? (
            <p className="muted">Memuat kursus kamu…</p>
          ) : myCoursesList.length === 0 ? (
            <EmptyState message="Kamu belum mengambil course apa pun. Lihat rekomendasi di bawah ini." />
          ) : (
            <>
              <div className="pill-tabs" role="group" aria-label="Filter kursus saya">
                <button
                  type="button"
                  className={`pill-tab ${myTab === 'aktif' ? 'active' : ''}`}
                  onClick={() => setMyTab('aktif')}
                  aria-pressed={myTab === 'aktif'}
                >
                  Aktif ({myActiveCourses.length})
                </button>
                <button
                  type="button"
                  className={`pill-tab ${myTab === 'selesai' ? 'active' : ''}`}
                  onClick={() => setMyTab('selesai')}
                  aria-pressed={myTab === 'selesai'}
                >
                  Selesai ({myDoneCourses.length})
                </button>
              </div>
              {myShownCourses.length === 0 ? (
                <p className="empty">
                  {myTab === 'aktif'
                    ? 'Tidak ada course aktif. Semua course kamu sudah selesai.'
                    : 'Belum ada course yang selesai.'}
                </p>
              ) : (
                <div className="course-list">
                  {myShownCourses.map((c) => {
                    const p = myCourseProgress?.get(c.id)
                    const done =
                      !!p && p.total > 0 && p.done >= p.total
                    const status: 'Aktif' | 'Selesai' | null = done
                      ? 'Selesai'
                      : c.mentor_id
                        ? 'Aktif'
                        : null
                    return (
                      <div key={c.id}>
                        <CourseCard
                          course={c}
                          status={status}
                          progress={p ?? null}
                          mentorName={
                            c.mentor_id ? mentorNames.get(c.mentor_id) : undefined
                          }
                        />
                        {!c.mentor_id && !done && (
                          <p className="muted">
                            Menunggu mentor — lesson belum bisa dimulai.
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {user && isSiswa && myEnrolledIds !== null && recommendations.length > 0 && (
        <section className="section" aria-label="Rekomendasi">
          <div className="dash-section-head">
            <h2>Rekomendasi Untukmu</h2>
          </div>
          <p className="muted">
            Course Semester 1 yang belum kamu ambil, sesuai urutan kurikulum.
          </p>
          <div className="course-list">
            {recommendations.map((c) => (
              <CourseCard
                key={c.id}
                course={c}
                mentorName={c.mentor_id ? mentorNames.get(c.mentor_id) : undefined}
              />
            ))}
          </div>
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

      <section id="semua-kursus" className="section" aria-label="Semua Kursus">
        <div className="dash-section-head">
          <h2>Semua Kursus</h2>
        </div>
        {isAdmin && (
          <>
            <div className="pill-tabs" role="group" aria-label="Filter status course">
              <button
                type="button"
                className={`pill-tab ${adminStatusTab === 'semua' ? 'active' : ''}`}
                onClick={() => setAdminStatusTab('semua')}
                aria-pressed={adminStatusTab === 'semua'}
              >
                Semua ({courses.length})
              </button>
              <button
                type="button"
                className={`pill-tab ${adminStatusTab === 'aktif' ? 'active' : ''}`}
                onClick={() => setAdminStatusTab('aktif')}
                aria-pressed={adminStatusTab === 'aktif'}
              >
                Aktif ({adminActiveCount})
              </button>
              <button
                type="button"
                className={`pill-tab ${adminStatusTab === 'nonaktif' ? 'active' : ''}`}
                onClick={() => setAdminStatusTab('nonaktif')}
                aria-pressed={adminStatusTab === 'nonaktif'}
              >
                Nonaktif ({adminNonActiveCount})
              </button>
            </div>
            <p className="muted">
              Aktif = sudah ada mentor (Siap Dimulai); Nonaktif = belum ada mentor.
            </p>
          </>
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

        {!coursesLoaded ? (
          <p className="muted">Memuat course…</p>
        ) : filtered.length === 0 ? (
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
          <div className="course-list">
            {filtered.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
