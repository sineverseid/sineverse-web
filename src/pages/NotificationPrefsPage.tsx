// SINEVERSE — Preferensi notifikasi (008): in-app on/off + kategori.
// Preferensi hanya dibaca/ditulis oleh pemiliknya sendiri.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { fetchNotificationPrefs, saveNotificationPrefs } from '../lib/supabase'

const CATEGORIES = [
  { key: 'pengumuman', label: 'Pengumuman platform & course' },
  { key: 'nilai', label: 'Nilai tugas & ujian' },
  { key: 'diskusi', label: 'Balasan diskusi' },
  { key: 'acara', label: 'Acara & kompetisi' },
  { key: 'komunitas', label: 'Komunitas & proyek' },
] as const

export default function NotificationPrefsPage() {
  const { user } = useAuth()
  const [inApp, setInApp] = useState(true)
  const [cats, setCats] = useState<Record<string, boolean>>({
    pengumuman: true,
    nilai: true,
    diskusi: true,
    acara: true,
    komunitas: true,
  })
  const [missing, setMissing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    const currentUser = user
    let cancelled = false
    async function load() {
      try {
        const prefs = await fetchNotificationPrefs(currentUser.id)
        if (cancelled) return
        if (prefs === null) {
          setMissing(true)
          return
        }
        if (prefs) {
          setInApp(prefs.in_app)
          if (prefs.categories && typeof prefs.categories === 'object' && !Array.isArray(prefs.categories)) {
            setCats((c) => ({ ...c, ...(prefs.categories as Record<string, boolean>) }))
          }
        }
      } catch (err) {
        // K9: gagal memuat (bukan tabel hilang) tampil sebagai error,
        // bukan sebagai MigrationNotice — keduanya beda penyebab.
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Gagal memuat preferensi.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setBusy(true)
    try {
      await saveNotificationPrefs(user.id, { in_app: inApp, categories: cats })
      setNotice('Preferensi notifikasi tersimpan.')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal menyimpan preferensi.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="page"><p className="muted">Memuat pengaturan…</p></div>
  if (loadError) return <div className="page"><h1>Pengaturan Notifikasi</h1><p className="error-box">{loadError}</p></div>
  if (missing) return <div className="page"><h1>Pengaturan Notifikasi</h1><MigrationNotice migration="008" /></div>

  return (
    <div className="page page-narrow">
      <h1>Pengaturan Notifikasi</h1>
      <form className="form" onSubmit={handleSave}>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
          <input type="checkbox" checked={inApp} onChange={(e) => setInApp(e.target.checked)} />
          Notifikasi di dalam aplikasi aktif
        </label>
        <fieldset style={{ border: '1px solid var(--light-grey)', borderRadius: 8, padding: '0.75rem' }}>
          <legend><strong>Kategori</strong></legend>
          {CATEGORIES.map((c) => (
            <label key={c.key} style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={cats[c.key] ?? true}
                onChange={(e) => setCats((prev) => ({ ...prev, [c.key]: e.target.checked }))}
              />
              {c.label}
            </label>
          ))}
        </fieldset>
        {notice && <p className="notice-box">{notice}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Menyimpan…' : 'Simpan Pengaturan'}
        </button>
      </form>
    </div>
  )
}
