import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../lib/types'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="page">
        <p className="muted">Memuat…</p>
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}

/** Route guard by role (mentor/admin pages). The role is enforced in the
 *  UI only as a convenience — RLS in the database is what really protects
 *  the data. */
export function RoleRoute({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="page">
        <p className="muted">Memuat…</p>
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (!profile) {
    return (
      <div className="page">
        <p className="muted">Memuat profil…</p>
      </div>
    )
  }
  if (!roles.includes(profile.role)) {
    return (
      <div className="page">
        <h1>Akses terbatas</h1>
        <p className="empty">
          Halaman ini hanya untuk peran {roles.join(' / ')}. Peran kamu saat ini: {profile.role}.
        </p>
      </div>
    )
  }
  return <>{children}</>
}
