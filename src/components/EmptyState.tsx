// SINEVERSE — state kosong konsisten (seperti di artefak): ilustrasi
// kursi bioskop + pesan + aksi opsional. Dipakai halaman daftar saat
// tidak ada data.
import { Link } from 'react-router-dom'

export default function EmptyState({
  message,
  actionLabel,
  actionTo,
}: {
  message: string
  actionLabel?: string
  actionTo?: string
}) {
  return (
    <div className="empty-state">
      <img
        src="./empty-state-cinema.webp"
        alt=""
        className="empty-state-img"
        loading="lazy"
      />
      <p className="empty-state-text">{message}</p>
      {actionLabel && actionTo ? (
        <Link to={actionTo} className="btn btn-primary">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  )
}
