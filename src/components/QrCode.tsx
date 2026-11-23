// Kode QR untuk tautan verifikasi sertifikat (kriteria 11 Master Prompt
// Academy: sertifikat bisa diverifikasi lewat QR, bukan hanya tautan + serial).
// Dibuat dari data URL — tidak ada panggilan jaringan tambahan.
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export default function QrCode({ value, size = 128 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setSrc(null)
    setFailed(false)
    QRCode.toDataURL(value, { width: size, margin: 1 })
      .then((url) => {
        if (alive) setSrc(url)
      })
      .catch(() => {
        // QR gagal dibuat (mis. tautan terlalu panjang): tampilkan pesan
        // pengganti, jangan hilang diam-diam — tautan teks tetap tersedia
        // di sampingnya.
        if (alive) {
          setSrc(null)
          setFailed(true)
        }
      })
    return () => {
      alive = false
    }
  }, [value, size])

  // P69: bila QR gagal dibuat, beri tahu pengguna dan arahkan ke salin tautan.
  if (failed) {
    return <p className="muted">QR tidak dapat dibuat — gunakan tombol salin tautan.</p>
  }
  if (!src) return null
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt="Kode QR verifikasi sertifikat — pindai untuk memeriksa keaslian"
    />
  )
}
