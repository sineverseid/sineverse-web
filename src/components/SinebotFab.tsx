// SINEVERSE — tombol mengambang SINEBOT (Tahap 2).
//
// Fixed bottom-right, di atas bottom nav 64px + safe-area. Panel chat
// dikelola di sini (bukan di tiap halaman) dan dirender Layout sekali
// untuk seluruh aplikasi. Disembunyikan di /login dan /register supaya
// tidak menutupi tombol masuk/daftar.
//
// Panel chat dimuat malas (React.lazy): modul SinebotChat + lib/sinebot
// TIDAK ikut bundle awal — tombolnya ringan, panel baru diunduh saat
// pertama dibuka (atau saat tombol di-hover/fokus, supaya bukaan pertama
// tetap terasa instan). Sebelumnya panel ikut termuat di setiap muat
// ulang padahal hampir selalu tertutup.
import { Suspense, lazy, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Icon from './icons'

const SinebotChat = lazy(() => import('./SinebotChat'))

// Panaskan chunk panel saat pengguna mengarahkan kursor/fokus ke tombol —
// unduhan mulai sebelum klik, jadi panel tampil tanpa jeda unduh.
function preloadSinebotChat() {
  void import('./SinebotChat')
}

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
        onMouseEnter={preloadSinebotChat}
        onFocus={preloadSinebotChat}
      >
        <Icon name="message" size={22} />
        <span>SINEBOT</span>
      </button>
      <Suspense fallback={null}>
        <SinebotChat open={open} onClose={() => setOpen(false)} />
      </Suspense>
    </>
  )
}
