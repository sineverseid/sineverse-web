// Kode QR untuk tautan verifikasi sertifikat (kriteria 11 Master Prompt
// Academy: sertifikat bisa diverifikasi lewat QR, bukan hanya tautan + serial).
// Dibuat dari data URL — tidak ada panggilan jaringan tambahan.
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export default function QrCode({ value, size = 128 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    QRCode.toDataURL(value, { width: size, margin: 1 })
      .then((url) => {
        if (alive) setSrc(url)
      })
      .catch(() => {
        // QR gagal dibuat (mis. tautan terlalu panjang): sembunyikan saja,
        // tautan teks tetap tersedia di sampingnya.
        if (alive) setSrc(null)
      })
    return () => {
      alive = false
    }
  }, [value, size])

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
