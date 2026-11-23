// SINEVERSE — tombol mengambang SINEBOT (Tahap 2).
//
// Fixed bottom-right, di atas bottom nav 64px + safe-area. Panel chat
// dikelola di sini (bukan di tiap halaman) dan dirender Layout sekali
// untuk seluruh aplikasi. Disembunyikan di /login dan /register supaya
// tidak menutupi tombol masuk/daftar.
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import Icon from './icons'
import SinebotChat from './SinebotChat'

const HIDDEN_ROUTES = ['/login', '/register']

export default function SinebotFab() {
  const location = useLocation()
  const [open, setOpen] = useState(false)

  if (HIDDEN_ROUTES.includes(location.pathname)) return null

  return (
    <>
      <button
        type="button"
        className="sinebot-fab"
        aria-label={open ? 'Tutup chat SINEBOT' : 'Buka chat SINEBOT'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="message" size={22} />
        <span>SINEBOT</span>
      </button>
      <SinebotChat open={open} onClose={() => setOpen(false)} />
    </>
  )
}
