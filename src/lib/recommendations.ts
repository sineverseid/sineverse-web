// SINEVERSE — rekomendasi belajar & proyek (satu sumber skor).
//
// Dipakai Beranda siswa ("Rekomendasi Untukmu") dan tab Rekomendasi Growth.
// Skor = kecocokan dengan minat profil + kategori course yang sudah diambil.
// Skala: course 10 (dasar) + 10 (cocok minat) / +5 (satu kategori dengan
// course yang sudah diambil); proyek terbuka 15 (dasar) + 10 (cocok minat).
// Alasan (reason) menjelaskan skornya; Growth menampilkan alasan yang sama.
import { RPS_COURSE_ORDER } from './brand'
import type { Course, Project } from './types'

export interface CourseRec {
  course: Course
  score: number
  reason: string
}

export interface ProjectRec {
  project: Project
  score: number
  reason: string
}

export type Recommendation =
  | {
      kind: 'course'
      id: string
      title: string
      description: string | null
      score: number
      reason: string
      to: string
    }
  | {
      kind: 'project'
      id: string
      title: string
      description: string | null
      score: number
      reason: string
      to: string
    }

function rpsIndex(courseId: string): number {
  const idx = (RPS_COURSE_ORDER as readonly string[]).indexOf(courseId)
  return idx === -1 ? 999 : idx
}

/** Escape karakter khusus regex di dalam satu minat. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchInterest(hay: string, interests: string[]): string | null {
  // P7 (audit 23 Nov 2026): cocokkan berdasarkan KATA UTUH (word boundary),
  // bukan substring — minat "AI" tidak lagi cocok dengan "lain"/"baik".
  return (
    interests
      .map((s) => s.trim().toLowerCase())
      .filter((it) => it.length > 1)
      .find((it) => new RegExp(`\\b${escapeRegExp(it)}\\b`, 'i').test(hay)) ?? null
  )
}

export function scoreCourses(
  courses: Course[],
  enrolledIds: Set<string>,
  interests: string[],
): CourseRec[] {
  const enrolledCategories = new Set(
    courses
      .filter((c) => enrolledIds.has(c.id))
      .map((c) => (c.category ?? '').toLowerCase()),
  )
  return courses
    .filter((c) => !enrolledIds.has(c.id))
    .map((c) => {
      let score = 10
      let reason = 'Course Semester 1 — ikuti sesuai urutan kurikulum.'
      const hay = `${c.title} ${c.description ?? ''} ${c.category ?? ''}`
      const matched = matchInterest(hay, interests)
      if (matched) {
        score += 10
        reason = `Sesuai minat kamu: ${matched}.`
      } else if (c.category && enrolledCategories.has(c.category.toLowerCase())) {
        score += 5
        reason = `Satu kategori dengan course yang sudah kamu ambil: ${c.category}.`
      }
      return { course: c, score, reason }
    })
    .sort((a, b) => b.score - a.score || rpsIndex(a.course.id) - rpsIndex(b.course.id))
}

export function scoreProjects(
  projects: Project[],
  myProjectIds: Set<string>,
  interests: string[],
): ProjectRec[] {
  return projects
    .filter((p) => p.access_mode === 'open' && !myProjectIds.has(p.id))
    .map((p) => {
      let score = 15
      let reason = 'Proyek terbuka — bisa langsung bergabung.'
      const matched = matchInterest(`${p.title} ${p.description ?? ''}`, interests)
      if (matched) {
        score += 10
        reason = `Sesuai minat kamu: ${matched}.`
      }
      return { project: p, score, reason }
    })
    .sort(
      (a, b) =>
        b.score - a.score || b.project.created_at.localeCompare(a.project.created_at),
    )
}

/** Gabungan course + proyek terbuka, skor tertinggi dulu, maksimal `limit`. */
export function topRecommendations(
  courses: Course[],
  enrolledIds: Set<string>,
  projects: Project[],
  myProjectIds: Set<string>,
  interests: string[],
  limit = 3,
): Recommendation[] {
  const courseRecs: Recommendation[] = scoreCourses(courses, enrolledIds, interests).map(
    (r) => ({
      kind: 'course' as const,
      id: r.course.id,
      title: r.course.title,
      description: r.course.description,
      score: r.score,
      reason: r.reason,
      to: `/course/${r.course.id}`,
    }),
  )
  const projectRecs: Recommendation[] = scoreProjects(projects, myProjectIds, interests).map(
    (r) => ({
      kind: 'project' as const,
      id: r.project.id,
      title: r.project.title,
      description: r.project.description,
      score: r.score,
      reason: r.reason,
      to: `/proyek/${r.project.id}`,
    }),
  )
  const order = (r: Recommendation): number => (r.kind === 'course' ? rpsIndex(r.id) : 999)
  return [...courseRecs, ...projectRecs]
    .sort((a, b) => b.score - a.score || order(a) - order(b))
    .slice(0, limit)
}
