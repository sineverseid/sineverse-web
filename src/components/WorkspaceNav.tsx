// SINEVERSE — sub-navigasi workspace (Mentor Workspace & Admin Panel).
// Meniru menu per-role di artefak & master prompt: tautan horizontal yang
// bisa digeser di handphone, ikon + label, tautan aktif ditandai jelas.
// LB11: fade tepi mengikuti posisi scroll seperti .topnav (K1 di Layout) —
// fade kiri hanya saat nav sudah digeser, fade kanan hilang saat sudah
// mentok kanan; bila isi muat tanpa scroll, tidak ada fade sama sekali.
import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import Icon from './icons'
import type { WorkspaceNavEntry } from '../lib/workspaceNav'

export default function WorkspaceNav({ entries }: { entries: WorkspaceNavEntry[] }) {
  const navRef = useRef<HTMLElement | null>(null)
  const [navScrolled, setNavScrolled] = useState(false)
  const [navAtEnd, setNavAtEnd] = useState(false)
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const update = () => {
      setNavScrolled(nav.scrollLeft > 0)
      setNavAtEnd(nav.scrollWidth - nav.clientWidth - nav.scrollLeft <= 1)
    }
    update()
    nav.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(nav)
    window.addEventListener('resize', update)
    return () => {
      nav.removeEventListener('scroll', update)
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [entries])

  return (
    <nav
      ref={navRef}
      className={`workspace-nav${navScrolled ? ' is-scrolled' : ''}${navAtEnd ? ' is-end' : ''}`}
      aria-label="Menu workspace"
    >
      {entries.map((e) => (
        <NavLink key={e.to} to={e.to} end={e.end} className="workspace-nav-item">
          <Icon name={e.icon} size={17} />
          <span>{e.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
