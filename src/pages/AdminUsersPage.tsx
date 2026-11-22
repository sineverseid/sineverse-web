// SINEVERSE — Admin Panel: Pengguna.
// Manajemen pengguna (master prompt §04: User Management). Admin melihat
// semua profil, bisa memfilter per role dan mencari nama/email, dan
// mengubah peran pengguna dari tabel (K18). Setiap perubahan peran
// dicatat lewat logAudit; admin tidak bisa mengubah perannya sendiri.
// Peran mentor juga tetap berubah otomatis lewat trigger database saat
// lamaran mentor disetujui (lihat Admin Panel). Perubahan peran lewat
// sini memakai jalur update profiles yang sama, dijaga trigger
// enforce_role_change_admin_only (migrasi 008) — hanya admin yang bisa.
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { logAudit, supabase } from '../lib/supabase'
import type { Profile, Role } from '../lib/types'
import PageHeader from '../components/PageHeader'
import WorkspaceNav from '../components/WorkspaceNav'
import { ADMIN_NAV } from '../lib/workspaceNav'
import EmptyState from '../components/EmptyState'

const ROLE_LABEL: Record<Role, string> = { siswa: 'Siswa', mentor: 'Mentor', admin: 'Admin' }

export default function AdminUsersPage() {
  const { user } = useAuth()
  const [profiles, setProfiles] = useState<Profile[] | null>(null)
  const [filter, setFilter] = useState<'semua' | Role>('semua')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function handleRoleChange(p: Profile, nextRole: Role) {
    if (!user || p.id === user.id || nextRole === p.role || busyId) return
    if (
      !window.confirm(
        `Ubah peran ${p.name ?? p.email ?? ''} dari ${ROLE_LABEL[p.role]} menjadi ${ROLE_LABEL[nextRole]}? Perubahan ini tercatat di audit log.`,
      )
    )
      return
    setBusyId(p.id)
    const prevRole = p.role
    const { error: updErr } = await supabase.from('profiles').update({ role: nextRole }).eq('id', p.id)
    if (updErr) {
      setNotice(`Gagal mengubah peran: ${updErr.message}`)
      setBusyId(null)
      return
    }
    // Audit log best-effort (logAudit tidak pernah melempar).
    await logAudit('user.role_changed', 'profiles', p.id, { user_id: p.id, from: prevRole, to: nextRole })
    setProfiles((prev) => (prev ?? []).map((row) => (row.id === p.id ? { ...row, role: nextRole } : row)))
    setNotice(`Peran ${p.name ?? p.email ?? ''} diubah menjadi ${ROLE_LABEL[nextRole]}.`)
    setBusyId(null)
  }

  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function load() {
      try {
        const { data, error: qErr } = await supabase
          .from('profiles')
          .select('id,email,name,username,role,photo_url,phone,city,school,kelas,created_at')
          .order('created_at', { ascending: false })
        if (qErr) throw qErr
        if (!cancelled) setProfiles((data ?? []) as Profile[])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat pengguna.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user])

  const filtered = useMemo(() => {
    if (!profiles) return []
    const q = query.trim().toLowerCase()
    return profiles.filter((p) => {
      if (filter !== 'semua' && p.role !== filter) return false
      if (!q) return true
      return (
        (p.name ?? '').toLowerCase().includes(q) ||
        (p.username ?? '').toLowerCase().includes(q) ||
        (p.email ?? '').toLowerCase().includes(q) ||
        (p.city ?? '').toLowerCase().includes(q)
      )
    })
  }, [profiles, filter, query])

  const counts = useMemo(() => {
    if (!profiles) return { semua: 0, siswa: 0, mentor: 0, admin: 0 }
    return {
      semua: profiles.length,
      siswa: profiles.filter((p) => p.role === 'siswa').length,
      mentor: profiles.filter((p) => p.role === 'mentor').length,
      admin: profiles.filter((p) => p.role === 'admin').length,
    }
  }, [profiles])

  return (
    <div className="page">
      <PageHeader
        icon="community"
        title="Pengguna"
        subtitle="Semua akun terdaftar di platform, per role. Admin dapat mengubah peran pengguna dari tabel; setiap perubahan tercatat di audit log."
      />
      <WorkspaceNav entries={ADMIN_NAV} />
      {notice && <p className="notice-box">{notice}</p>}
      <p className="muted">Peranmu sendiri tidak bisa diubah dari halaman ini. Peran mentor juga berubah otomatis saat lamaran disetujui.</p>
      {loading && <p className="muted">Memuat pengguna…</p>}
      {error && <p className="error-box">{error}</p>}
      {!loading && !error && profiles !== null && (
        <>
          <div className="dash-section-head"><h2>Daftar Pengguna</h2></div>
          <div className="pill-tabs" role="tablist" aria-label="Filter pengguna per peran">
            <button type="button" className={filter === 'semua' ? 'pill-tab active' : 'pill-tab'} onClick={() => setFilter('semua')}>Semua ({counts.semua})</button>
            <button type="button" className={filter === 'siswa' ? 'pill-tab active' : 'pill-tab'} onClick={() => setFilter('siswa')}>Siswa ({counts.siswa})</button>
            <button type="button" className={filter === 'mentor' ? 'pill-tab active' : 'pill-tab'} onClick={() => setFilter('mentor')}>Mentor ({counts.mentor})</button>
            <button type="button" className={filter === 'admin' ? 'pill-tab active' : 'pill-tab'} onClick={() => setFilter('admin')}>Admin ({counts.admin})</button>
          </div>
          <p className="muted">Pilih peran baru di kolom Peran untuk mengubahnya (konfirmasi dulu). Baris akunmu sendiri terkunci.</p>
          <div className="form" style={{ marginBottom: '1rem' }}>
            <label>
              Cari nama / username / email / kota
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Mis. Nadia, nadia-01, sineverse.id@gmail.com, Tangerang"
              />
            </label>
          </div>
          {filtered.length === 0 ? (
            <EmptyState message="Tidak ada pengguna. Tidak ada pengguna yang cocok dengan filter ini." />
          ) : (
            <div className="grade-table-wrap">
              <table className="grade-table">
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Peran</th>
                    <th>Kota</th>
                    <th>Sekolah / Kelas</th>
                    <th>Terdaftar</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name ?? '—'}</td>
                      <td>{p.username ?? '—'}</td>
                      <td>{p.email ?? '—'}</td>
                      <td>
                        {p.id === user?.id ? (
                          <span className="chip">{ROLE_LABEL[p.role]} (kamu)</span>
                        ) : (
                          <select
                            value={p.role}
                            disabled={busyId === p.id}
                            onChange={(e) => void handleRoleChange(p, e.target.value as Role)}
                            aria-label={`Ubah peran ${p.name ?? p.email ?? ''}`}
                            style={{ fontFamily: 'inherit', padding: '0.5rem 0.7rem', borderRadius: 8, border: '1px solid var(--light-grey)' }}
                          >
                            <option value="siswa">Siswa</option>
                            <option value="mentor">Mentor</option>
                            <option value="admin">Admin</option>
                          </select>
                        )}
                      </td>
                      <td>{p.city ?? '—'}</td>
                      <td>
                        {p.school ?? '—'}
                        {p.kelas ? ` · ${p.kelas}` : ''}
                      </td>
                      <td>
                        {new Date(p.created_at).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
