// SINEVERSE — kartu course bersama (Beranda + Akademi).
//
// Tampilan mengikuti kartu course di artefak: sampul visual di atas,
// judul, deskripsi, lalu chip kategori/level + status mentor.
// Sampul memakai pita brand + label minggu RPS karena Supabase tidak
// menyimpan gambar sampul (cover_url null untuk semua course seed).
import { Link } from 'react-router-dom'
import { courseCoverKey, rpsWeekLabel } from '../lib/brand'
import type { Course } from '../lib/types'

export default function CourseCard({ course }: { course: Course }) {
  const week = rpsWeekLabel(course.id)
  const coverKey = courseCoverKey(course.title)
  return (
    <li className="course-card">
      <Link to={`/course/${course.id}`}>
        <div className={`course-cover cover-${coverKey}`} aria-hidden="true">
          {week && <span className="course-cover-week">{week}</span>}
          <span className="course-cover-cat">{course.category ?? 'Perfilman'}</span>
        </div>
        <div className="course-card-body">
          <h3>{course.title}</h3>
          <p>{course.description}</p>
          <span className="chip">{course.category ?? 'Lainnya'}</span>{' '}
          <span className="chip">{course.level ?? 'Semua level'}</span>
          {course.mentor_id === null && <span className="chip chip-waitlist">Tanpa mentor</span>}
        </div>
      </Link>
    </li>
  )
}
