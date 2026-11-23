// SINEVERSE — install banner: shows when the browser fires
// beforeinstallprompt; on iOS shows the "Bagikan → Tambah ke Layar Utama"
// guidance instead (iOS has no install prompt event).
import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

// P68: status dismiss disimpan di localStorage supaya banner tidak muncul
// lagi di setiap reload.
const DISMISSED_KEY = 'sineverse-install-dismissed'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(readDismissed)
  const [showIos, setShowIos] = useState(false)

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // localStorage tidak tersedia — banner cukup disembunyikan sesi ini.
    }
    setDismissed(true)
  }

  useEffect(() => {
    if (isStandalone()) return
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    if (isIos()) setShowIos(true)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (dismissed || isStandalone()) return null

  if (deferred) {
    return (
      <div className="install-banner" role="region" aria-label="Pasang aplikasi">
        <div>
          <strong>Pasang Aplikasi SINEVERSE</strong>
          <p>Akses belajar filmmaking lebih cepat, langsung dari layar utama.</p>
        </div>
        <div className="install-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              await deferred.prompt()
              await deferred.userChoice
              setDeferred(null)
            }}
          >
            Pasang Aplikasi
          </button>
          <button type="button" className="btn btn-ghost" onClick={dismiss}>
            Nanti
          </button>
        </div>
      </div>
    )
  }

  if (showIos) {
    return (
      <div className="install-banner" role="region" aria-label="Pasang aplikasi di iOS">
        <div>
          <strong>Pasang Aplikasi SINEVERSE</strong>
          <p>
            Ketuk tombol Bagikan di Safari, lalu pilih &ldquo;Tambah ke Layar Utama&rdquo;.
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={dismiss}>
          Tutup
        </button>
      </div>
    )
  }

  return null
}
