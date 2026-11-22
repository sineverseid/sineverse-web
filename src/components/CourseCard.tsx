// SINEVERSE — kartu course horizontal (desain dashboard): sampul kiri,
// judul, meta, bilah progres, tombol putar navy.
// Sampul memakai cover_url bila ada; bila tidak, gradasi navy + ikon film
// (Supabase tidak menyimpan gambar sampul untuk course seed).
// Props baru bersifat opsional: pemanggil lama yang tidak mengopernya
// tetap mendapat kartu tanpa pil status dan tanpa bilah progres.
import { Link } from 'react-router-dom'
import Icon from './icons'
import type { Course } from '../lib/types'

export type CourseStatus = 'Aktif' | 'Selesai'

export interface CourseCardProps {
  course: Course
  status?: CourseStatus | null
  progress?: { done: number; total: number } | null
  mentorName?: string | null
}

export default function CourseCard({ course, status, progress, mentorName }: CourseCardProps) {
  const pct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  const meta = [course.category ?? 'Perfilman', course.level ?? 'Semua level', mentorName ?? null]
    .filter((v): v is string => !!v)
    .join(' • ')
  return (
    <Link to={`/course/${course.id}`} className="dash-course">
      <div className="dash-course-cover">
        {course.cover_url ? (
          <img src={course.cover_url} alt="" loading="lazy" />
        ) : (
          <Icon name="film" size={36} />
        )}
        {status && <span className="dash-course-status">{status}</span>}
      </div>
      <div className="dash-course-body">
        <h3>{course.title}</h3>
        <p className="dash-course-meta">{meta}</p>
        {progress && progress.total > 0 && (
          <div
            className="progress-track"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progres ${course.title}: ${pct} persen`}
          >
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <span className="dash-course-play">
        <Icon name="play" size={20} />
      </span>
    </Link>
  )
}
