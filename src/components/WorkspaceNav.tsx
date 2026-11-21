// SINEVERSE — sub-navigasi workspace (Mentor Workspace & Admin Panel).
// Meniru menu per-role di artefak & master prompt: tautan horizontal yang
// bisa digeser di handphone, ikon + label, tautan aktif ditandai jelas.
import { NavLink } from 'react-router-dom'
import Icon from './icons'
import type { WorkspaceNavEntry } from '../lib/workspaceNav'

export default function WorkspaceNav({ entries }: { entries: WorkspaceNavEntry[] }) {
  return (
    <nav className="workspace-nav" aria-label="Menu workspace">
      {entries.map((e) => (
        <NavLink key={e.to} to={e.to} end={e.end} className="workspace-nav-item">
          <Icon name={e.icon} size={17} />
          <span>{e.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
