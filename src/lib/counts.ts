// SINEVERSE — penghitung bersama (K13): satu sumber kebenaran untuk angka
// yang sama tampil di beberapa halaman (pengguna per peran, sekolah,
// enrollment). Semua helper murni atas baris yang sudah dimuat — tidak ada
// query baru di sini, supaya definisinya sama di mana pun dipakai.
// Aturan definisi (disepakati saat perbaikan K13):
//   - "enrollment" = baris enrollments (siswa TERDAFTAR). Waitlist BUKAN
//     enrollment; pipeline = terdaftar + waitlist.
//   - Total sekolah dihitung dari hitung server (count exact), BUKAN dari
//     panjang array hasil select('*') — PostgREST membatasi select tanpa
//     limit ke 1000 baris, jadi panjang array bisa memotong total (dulu
//     hero admin menampilkan "1000 sekolah" padahal ada 26.662).
//   - "Sekolah belum terverifikasi" = baris schools dengan
//     is_verified = false (direktori sekolah), BUKAN pengajuan sekolah
//     manual yang menunggu (school_submissions status pending).

export interface RoleCounts {
  total: number
  siswa: number
  mentor: number
  admin: number
  lain: number
}

/** Hitung pengguna per peran dari baris profiles yang sudah dimuat. */
export function countUsersByRole(profiles: readonly { role: string }[]): RoleCounts {
  const out: RoleCounts = { total: profiles.length, siswa: 0, mentor: 0, admin: 0, lain: 0 }
  for (const p of profiles) {
    if (p.role === 'siswa') out.siswa += 1
    else if (p.role === 'mentor') out.mentor += 1
    else if (p.role === 'admin') out.admin += 1
    else out.lain += 1
  }
  return out
}

/** Label ringkasan peran, selalu menyebut admin: "7 (Siswa 3 · Mentor 1 · Admin 3)". */
export function userBreakdownLabel(c: RoleCounts): string {
  const parts = [`Siswa ${c.siswa}`, `Mentor ${c.mentor}`, `Admin ${c.admin}`]
  if (c.lain > 0) parts.push(`Lainnya ${c.lain}`)
  return `${c.total} (${parts.join(' · ')})`
}

export interface SchoolCounts {
  total: number
  verified: number
  unverified: number
}

/** Hitung sekolah dari baris schools yang sudah dimuat. HANYA dipakai bila
 *  seluruh baris memang dimuat; untuk total direktori (26 ribu baris)
 *  pakai hitung server (fetchSchoolTotals di lib/supabase.ts), bukan ini. */
export function countSchools(schools: readonly { is_verified?: boolean | null }[]): SchoolCounts {
  const out: SchoolCounts = { total: schools.length, verified: 0, unverified: 0 }
  for (const s of schools) {
    if (s.is_verified) out.verified += 1
    else out.unverified += 1
  }
  return out
}

export interface EnrollmentCounts {
  /** Siswa terdaftar (baris enrollments). */
  enrolled: number
  /** Pendaftar menunggu (baris waitlist). */
  waitlisted: number
  /** Seluruh pipeline: terdaftar + waitlist. */
  pipeline: number
}

/** Hitung enrollment dari baris enrollments + waitlist yang sudah dimuat. */
export function countEnrollments(
  enrollments: readonly unknown[],
  waitlist: readonly unknown[] = [],
): EnrollmentCounts {
  return {
    enrolled: enrollments.length,
    waitlisted: waitlist.length,
    pipeline: enrollments.length + waitlist.length,
  }
}

/** Hitung enrollment satu course dari baris yang sudah dimuat. */
export function countCourseEnrollments(
  enrollments: readonly { course_id: string }[],
  waitlist: readonly { course_id: string }[],
  courseId: string,
): EnrollmentCounts {
  return countEnrollments(
    enrollments.filter((e) => e.course_id === courseId),
    waitlist.filter((w) => w.course_id === courseId),
  )
}
