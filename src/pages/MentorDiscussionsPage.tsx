// SINEVERSE — Mentor Workspace: Diskusi.
// Daftar diskusi lesson terbaru di course yang diampu mentor (master prompt
// §09: mentor memantau diskusi lesson, pertanyaan siswa, moderasi, pin,
// accepted answer). Klik diskusi membuka lesson-nya.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchCourses, fetchProfileNames, supabase } from '../lib/supabase'
import type { Course, Discussion } from '../lib/types'
import PageHeader from '../components/PageHeader'
import WorkspaceNav from '../components/WorkspaceNav'
import { MENTOR_NAV } from '../lib/workspaceNav'
import EmptyState from '../components/EmptyState'

interface DiscussionRow extends Discussion {
  lessonTitle: string
  courseTitle: string
  authorName: string
}

export default function MentorDiscussionsPage() {
  const { user, profile } = useAuth()
  const [rows, setRows] = useState<DiscussionRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function load() {
      try {
        const courses = await fetchCourses()
        const mine =
          profile?.role === 'admin'
            ? courses
            : courses.filter((c) => c.mentor_id === user!.id)
        if (mine.length === 0) {
          if (!cancelled) setRows([])
          return
        }
        const courseById = new Map(mine.map((c) => [c.id, c]))
        const { data: mods } = await supabase
          .from('modules')
          .select('id,course_id')
          .in('course_id', mine.map((c) => c.id))
        const modRows = (mods ?? []) as { id: string; course_id: string }[]
        if (modRows.length === 0) {
          if (!cancelled) setRows([])
          return
        }
        const modCourse = new Map(modRows.map((m) => [m.id, m.course_id]))
        const { data: lessons } = await supabase
          .from('lessons')
          .select('id,module_id,title')
          .in('module_id', modRows.map((m) => m.id))
        const lessonRows = (lessons ?? []) as { id: string; module_id: string; title: string }[]
        if (lessonRows.length === 0) {
          if (!cancelled) setRows([])
          return
        }
        const lessonInfo = new Map(
          lessonRows.map((l) => [l.id, { title: l.title, courseId: modCourse.get(l.module_id) ?? '' }]),
        )
        const { data: discs } = await supabase
          .from('discussions')
          .select('*')
          .in('lesson_id', lessonRows.map((l) => l.id))
          .order('created_at', { ascending: false })
          .limit(100)
        const discRows = (discs ?? []) as Discussion[]
        const names = await fetchProfileNames(discRows.map((d) => d.user_id))
        const out: DiscussionRow[] = discRows.map((d) => {
          const info = lessonInfo.get(d.lesson_id) ?? { title: 'Lesson', courseId: '' }
          const course: Course | undefined = courseById.get(info.courseId)
          return {
            ...d,
            lessonTitle: info.title,
            courseTitle: course?.title ?? 'Course',
            authorName: names.get(d.user_id) ?? 'Anggota',
          }
        })
        if (!cancelled) setRows(out)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat diskusi.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user, profile?.role])

  return (
    <div className="page">
      <PageHeader
        icon="message"
        title="Diskusi Course Saya"
        subtitle="Pertanyaan dan diskusi siswa di lesson course yang kamu ampu."
      />
      <WorkspaceNav entries={MENTOR_NAV} />
      {loading && <p className="muted">Memuat diskusi…</p>}
      {error && <p className="error-box">{error}</p>}
      {!loading && !error && rows !== null && rows.length === 0 && (
        <EmptyState
          message="Belum ada diskusi. Belum ada siswa yang bertanya di lesson course kamu."
        />
      )}
      {!loading && !error && rows !== null && rows.length > 0 && (
        <ul className="discussion-list">
          {rows.map((d) => (
            <li key={d.id} className="discussion-item">
              <p className="discussion-meta">
                {d.courseTitle} · {d.lessonTitle} · {d.authorName} ·{' '}
                {new Date(d.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                {d.is_pinned ? ' · Disematkan' : ''}
                {d.is_resolved ? ' · Terjawab' : ''}
              </p>
              <p>
                <Link to={`/lesson/${d.lesson_id}`}>{d.body}</Link>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
