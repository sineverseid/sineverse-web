// SINEVERSE — Drawer "Course Index" (D24.13, pola Mentari).
// Panel samping: judul "Course Index" + tombol X hijau SINEVERSE,
// daftar "General" + "Pertemuan 1..N", masing-masing dengan chevron
// expand yang membuka daftar 11 langkah pertemuan itu. Klik baris
// melompat ke seksi/lesson yang bersangkutan; klik langkah melompat
// ke langkah itu. Pertemuan aktif di-highlight abu-abu. Tanpa biru.
import { useState } from 'react'
import Icon from './icons'

/** 11 langkah alur Mentari, dipakai sebagai isi expand tiap pertemuan. */
export const COURSE_INDEX_STEPS = [
  'Pretest',
  'Buku ISBN',
  'Video Ajar',
  'Power Point',
  'Artikel Riset',
  'Materi Lainnya',
  'Penugasan Terstruktur',
  'LINK VCON',
  'Forum Diskusi',
  'Posttest',
  'Kuesioner',
]

export interface CourseIndexItem {
  /** id lesson (atau id unik lain yang dikenali pemanggil). */
  id: string
  meetingNumber: number | null
  title: string
}

interface CourseIndexDrawerProps {
  open: boolean
  onClose: () => void
  courseTitle: string
  items: CourseIndexItem[]
  /** id item yang sedang aktif (lesson yang dibuka / seksi yang dipilih). */
  activeId: string | null
  onSelectGeneral: () => void
  onSelectItem: (item: CourseIndexItem) => void
  onSelectStep: (item: CourseIndexItem, stepIndex: number) => void
}

export default function CourseIndexDrawer({
  open,
  onClose,
  courseTitle,
  items,
  activeId,
  onSelectGeneral,
  onSelectItem,
  onSelectStep,
}: CourseIndexDrawerProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  if (!open) return null
  const toggleExpand = (itemId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }
  return (
    <>
      <div className="course-index-overlay" onClick={onClose} aria-hidden="true" />
      <aside className="course-index-drawer" aria-label={`Course Index — ${courseTitle}`}>
        <div className="course-index-head">
          <h2>Course Index</h2>
          <button type="button" className="btn btn-primary btn-small" onClick={onClose} aria-label="Tutup Course Index">
            ✕
          </button>
        </div>
        <button
          type="button"
          className="course-index-row"
          onClick={() => {
            onSelectGeneral()
            onClose()
          }}
        >
          <span aria-hidden="true">☰</span>
          <span className="course-index-row-label">General</span>
        </button>
        {items.map((item) => {
          const isActive = item.id === activeId
          const isExpanded = expanded.has(item.id)
          return (
            <div key={item.id}>
              <div className={`course-index-row${isActive ? ' active' : ''}`}>
                <button
                  type="button"
                  className="course-index-row-main"
                  onClick={() => {
                    onSelectItem(item)
                    onClose()
                  }}
                >
                  <span aria-hidden="true">☰</span>
                  <span className="course-index-row-label">
                    {item.meetingNumber !== null ? `Pertemuan ${item.meetingNumber}` : item.title}
                  </span>
                </button>
                <button
                  type="button"
                  className="course-index-chevron"
                  onClick={() => toggleExpand(item.id)}
                  aria-label={isExpanded ? 'Tutup langkah' : 'Buka langkah'}
                  aria-expanded={isExpanded}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      transform: isExpanded ? 'rotate(90deg)' : 'none',
                      transition: 'transform 0.15s ease',
                    }}
                  >
                    <Icon name="chevronRight" size={16} />
                  </span>
                </button>
              </div>
              {isExpanded && (
                <ul className="course-index-steps">
                  {COURSE_INDEX_STEPS.map((step, i) => (
                    <li key={step}>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => {
                          onSelectStep(item, i)
                          onClose()
                        }}
                      >
                        {i + 1}. {step}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </aside>
    </>
  )
}
