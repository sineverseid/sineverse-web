// SINEVERSE — Grade Book per course (D25, pola Mentari, migrasi 088).
//
// ATM dari screenshot Mentari "Grade Book" (referensi-20261128-08):
// tab COURSE | Participant | Grade Book, tombol DOWNLOAD EXCEL, lalu SATU
// kartu per peserta — nama HURUF BESAR + tabel per jenis aktivitas dengan
// sel "x/21" + pil "Score: 84.76". Yang diubah agar pas dengan SINEVERSE:
// tombol + pil hijau (bukan biru Mentari); tanpa kolom NIM (keputusan Arif
// 28 Nov 2026 — peserta tetap Provinsi/Sekolah, tanpa NIS); kolom = 7
// aktivitas pilot (Pretest, Posttest, Penugasan, Forum Diskusi, Kuesioner,
// Materi) + Nilai Akhir berbobot; LINK VCON TIDAK punya kolom nilai karena
// kehadirannya tidak tercatat di database (LAPORAN §7.3) — hanya catatan
// kaki + jumlah kelas live terjadwal.
//
// Data ASLI dari RPC get_course_gradebook (migrasi 088): mentor/admin
// melihat semua peserta, siswa hanya barisnya sendiri (dibatasi di RPC).
// Nilai Akhir memakai rumus yang sama dengan "Nilai Saya"
// (lib/grading.buildGradeComponents — Pretest 5% + Posttest 15% + Tugas
// mingguan 30% + Tugas praktik akhir 40% + Diskusi 10%, dinormalisasi ulang
// atas komponen yang ada nilainya; lulus >= 70). "—" = belum ada nilai,
// bukan 0.
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { GRADEBOOK_WEIGHTS, PASSING_GRADE } from '../lib/brand'
import { buildGradeComponents } from '../lib/grading'
import { fetchCourse, fetchCourseGradebook } from '../lib/supabase'
import { downloadXlsx, type XlsxCell } from '../lib/xlsx'
import type {
  Course,
  CourseGradeBook,
  GradeBookParticipant,
} from '../lib/types'
import PageHeader from '../components/PageHeader'
import Icon from '../components/icons'

function finalFor(p: GradeBookParticipant) {
  const hasAnyGrade =
    p.pretest.avg !== null ||
    p.posttest.avg !== null ||
    p.tugas.avg_weekly !== null ||
    p.tugas.avg_final !== null ||
    p.forum.discussion_score !== null
  const components = buildGradeComponents(
    {
      pretest: p.pretest.avg,
      posttest: p.posttest.avg,
      weeklyAssignments: p.tugas.avg_weekly,
      finalPractice: p.tugas.avg_final,
      discussion: p.forum.discussion_score,
    },
    GRADEBOOK_WEIGHTS,
    PASSING_GRADE,
  )
  return { hasAnyGrade, components }
}

function scorePill(avg: number | null, label: string) {
  if (avg === null) return <span className="muted">—</span>
  return (
    <span className="badge-outline-pass">
      {label}: {avg.toFixed(1)}
    </span>
  )
}

function countCell(done: number, total: number) {
  return (
    <strong>
      {done}/{total}
    </strong>
  )
}

function identityLine(p: GradeBookParticipant) {
  const parts = [p.province, p.regency, p.school].filter(
    (x): x is string => x !== null && x.trim() !== '',
  )
  return parts.length > 0 ? parts.join(' · ') : '—'
}

function slugify(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export default function CourseGradeBookPage() {
  const { id: courseId } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [course, setCourse] = useState<Course | null>(null)
  const [book, setBook] = useState<CourseGradeBook | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user || !courseId) return
    const currentCourseId = courseId
    let cancelled = false
    async function load() {
      try {
        const [c, b] = await Promise.all([
          fetchCourse(currentCourseId),
          fetchCourseGradebook(currentCourseId),
        ])
        if (cancelled) return
        setCourse(c)
        setBook(b)
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Gagal memuat Grade Book.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user, courseId])

  if (loading) {
    return (
      <div className="page">
        <p className="muted">Memuat Grade Book…</p>
      </div>
    )
  }

  if (error || !book || !course) {
    return (
      <div className="page">
        <p className="error-box">{error ?? 'Grade Book tidak ditemukan.'}</p>
        <p>
          <Link to="/akademi">Kembali ke Akademi</Link>
        </p>
      </div>
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  const downloadExcel = () => {
    const rows: XlsxCell[][] = [
      [
        'Nama',
        'Provinsi',
        'Kab/Kota',
        'Asal Sekolah',
        'Pretest',
        'Skor Pretest',
        'Posttest',
        'Skor Posttest',
        'Penugasan',
        'Skor Tugas Mingguan',
        'Skor Tugas Akhir',
        'Forum Diskusi',
        'Postingan Forum',
        'Skor Diskusi',
        'Kuesioner',
        'Materi',
        'Nilai Akhir',
        'Status',
      ],
      ...book.participants.map((p) => {
        const { hasAnyGrade, components } = finalFor(p)
        return [
          p.name ?? '—',
          p.province ?? '—',
          p.regency ?? '—',
          p.school ?? '—',
          `${p.pretest.done}/${p.pretest.total}`,
          p.pretest.avg,
          `${p.posttest.done}/${p.posttest.total}`,
          p.posttest.avg,
          `${p.tugas.done}/${p.tugas.total}`,
          p.tugas.avg_weekly,
          p.tugas.avg_final,
          `${p.forum.done}/${p.forum.total}`,
          p.forum.posts,
          p.forum.discussion_score,
          `${p.kuesioner.done}/${p.kuesioner.total}`,
          `${p.materi.done}/${p.materi.total}`,
          hasAnyGrade ? components.final : null,
          hasAnyGrade ? (components.passed ? 'Lulus' : 'Belum lulus') : 'Belum ada nilai',
        ] as XlsxCell[]
      }),
    ]
    downloadXlsx(`grade-book-${slugify(book.course_title)}-${today}.xlsx`, 'Grade Book', rows)
  }

  return (
    <div className="page">
      <PageHeader
        icon="grade"
        title={`Grade Book — ${book.course_title}`}
        subtitle={
          book.viewer_scope === 'all'
            ? `Rekap nilai per aktivitas untuk ${book.participants.length} peserta (${book.lessons_total} pertemuan). Mentor/admin melihat semua peserta.`
            : `Rekap nilaimu per aktivitas (${book.lessons_total} pertemuan). Hanya nilaimu sendiri yang ditampilkan di sini.`
        }
      />

      {/* Tab ala Mentari: COURSE | Grade Book (aktif). */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
        }}
      >
        <div className="pill-tabs" style={{ marginBottom: 0 }}>
          <Link className="pill-tab" to={`/course/${book.course_id}`}>
            Course
          </Link>
          <span className="pill-tab active">Grade Book</span>
        </div>
        <button type="button" className="btn btn-primary" onClick={downloadExcel}>
          <Icon name="download" size={18} /> Download Excel
        </button>
      </div>

      {book.participants.length === 0 ? (
        <p className="empty">Belum ada peserta di course ini.</p>
      ) : (
        book.participants.map((p) => {
          const { hasAnyGrade, components } = finalFor(p)
          return (
            <section key={p.user_id} className="activity-card" aria-label={p.name ?? 'Peserta'}>
              <p
                style={{
                  margin: '0 0 0.25rem',
                  fontSize: '1.15rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                }}
              >
                {p.name ?? '—'}
              </p>
              <p className="muted" style={{ margin: '0 0 0.75rem' }}>
                {identityLine(p)}
              </p>
              <div className="grade-table-wrap">
                <table className="grade-table">
                  <thead>
                    <tr>
                      <th style={{ whiteSpace: 'nowrap' }}>Pretest</th>
                      <th style={{ whiteSpace: 'nowrap' }}>Posttest</th>
                      <th style={{ whiteSpace: 'nowrap' }}>Penugasan</th>
                      <th style={{ whiteSpace: 'nowrap' }}>Forum Diskusi</th>
                      <th style={{ whiteSpace: 'nowrap' }}>Kuesioner</th>
                      <th style={{ whiteSpace: 'nowrap' }}>Materi</th>
                      <th style={{ whiteSpace: 'nowrap' }}>Nilai Akhir</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        {countCell(p.pretest.done, p.pretest.total)}
                        <br />
                        {scorePill(p.pretest.avg, 'Score')}
                      </td>
                      <td>
                        {countCell(p.posttest.done, p.posttest.total)}
                        <br />
                        {scorePill(p.posttest.avg, 'Score')}
                      </td>
                      <td>
                        {countCell(p.tugas.done, p.tugas.total)}
                        <br />
                        {scorePill(
                          p.tugas.avg_weekly ?? p.tugas.avg_final,
                          'Score',
                        )}
                      </td>
                      <td>
                        {countCell(p.forum.done, p.forum.total)}
                        <br />
                        <span className="muted" style={{ fontSize: '0.85rem' }}>
                          {p.forum.posts} postingan
                        </span>
                        <br />
                        {scorePill(p.forum.discussion_score, 'Score')}
                      </td>
                      <td>{countCell(p.kuesioner.done, p.kuesioner.total)}</td>
                      <td>{countCell(p.materi.done, p.materi.total)}</td>
                      <td>
                        {hasAnyGrade ? (
                          <>
                            <strong>{components.final.toFixed(1)}</strong>{' '}
                            <span
                              className={components.passed ? 'badge-pass' : 'badge-fail'}
                            >
                              {components.passed ? 'Lulus' : 'Belum lulus'}
                            </span>
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )
        })
      )}

      <p className="muted">
        x/y = pertemuan yang selesai / pertemuan yang punya aktivitas itu. Tanda
        &ldquo;—&rdquo; berarti belum ada nilai (bukan 0). Materi = pertemuan yang
        sudah dibuka. Kuesioner menilai mentor, bukan materi.
      </p>
      <p className="muted">
        {book.vcon_scheduled === 0
          ? 'Tidak ada kelas live yang dijadwalkan di course ini — kolom LINK VCON tidak ditampilkan karena kehadiran VCON tidak tercatat di database (klik join hanya tercatat di sesi ini).'
          : `${book.vcon_scheduled} kelas live terjadwal di course ini — kehadiran VCON tidak tercatat di database (klik join hanya tercatat di sesi ini), jadi kolom LINK VCON tidak ditampilkan.`}
      </p>
      <p className="muted">
        Nilai Akhir = Pretest 5% + Posttest 15% + Tugas mingguan 30% + Tugas
        praktik akhir 40% + Diskusi 10%, dihitung ulang dari komponen yang
        sudah ada nilainya saja. Lulus bila &ge; {PASSING_GRADE}.
      </p>
    </div>
  )
}
