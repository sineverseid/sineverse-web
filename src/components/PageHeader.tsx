// SINEVERSE — header halaman konsisten (seperti di artefak): ubin ikon
// navy + judul + subjudul. Dipakai semua halaman daftar.
import type { ReactNode } from 'react'
import Icon, { type IconName } from './icons'

export default function PageHeader({
  icon,
  title,
  subtitle,
}: {
  icon: IconName
  title: string
  subtitle?: ReactNode
}) {
  return (
    <div className="page-header">
      <span className="page-header-icon" aria-hidden="true">
        <Icon name={icon} size={26} />
      </span>
      <div className="page-header-text">
        <h1>{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
    </div>
  )
}
