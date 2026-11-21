// SINEVERSE — Editor RPS (admin only, 003): bobot kuis/tugas/ujian,
// passing grade, judul, deskripsi. Daftar minggu (20 minggu) ditampilkan
// read-only — pengeditan minggu per minggu belum disediakan agar JSON
// minggu tidak rusak dari form.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { BRAND, GRADEBOOK_WEIGHTS, PASSING_GRADE } from '../lib/brand'
import { isMissingTableError } from '../lib/guarded'
import { logAudit, supabase } from '../lib/supabase'
import type { Rps } from '../lib/types'
import WorkspaceNav from '../components/WorkspaceNav'
import { ADMIN_NAV } from '../lib/workspaceNav'

export default function RpsEditorPage() {
  const { user, profile } = useAuth()
  const [rps, setRps] = useState<Rps | null>(null)
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [wKuis, setWKuis] = useState(20)
  const [wTugas, setWTugas] = useState(50)
  const [wUjian, setWUjian] = useState(30)
  const [passing, setPassing] = useState(70)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data, error: qErr } = await supabase
          .from('rps')
          .select('*')
          .eq('code', BRAND.rpsCode)
          .maybeSingle()
        if (qErr) {
          if (isMissingTableError(qErr)) {
            if (!cancelled) setMissing(true)
            return
          }
          throw qErr
        }
        if (cancelled) return
        if (data) {
          const row = data as unknown as Rps & { weights: { kuis: number; tugas: number; ujian: number } }
          setRps(row)
          setTitle(row.title)
          setDesc(row.description ?? '')
          setWKuis(row.weights?.kuis ?? GRADEBOOK_WEIGHTS.kuis * 100)
          setWTugas(row.weights?.tugas ?? GRADEBOOK_WEIGHTS.tugas * 100)
          setWUjian(row.weights?.ujian ?? GRADEBOOK_WEIGHTS.ujian * 100)
          setPassing(row.passing_grade ?? PASSING_GRADE)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat RPS.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  if (profile?.role !== 'admin') {
    return (
      <div className="page">
        <h1>Editor RPS</h1>
        <p className="empty">Halaman ini hanya untuk admin. Mentor bisa melihat RPS di <Link to="/rps">halaman RPS</Link> (read-only).</p>
      </div>
    )
  }
  if (loading) return <div className="page"><p className="muted">Memuat RPS…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (missing) return <div className="page"><h1>Editor RPS</h1><MigrationNotice migration="003" /></div>
  if (!rps) {
    return (
      <div className="page">
        <h1>Editor RPS</h1>
        <p className="empty">Baris RPS {BRAND.rpsCode} belum ada di database. Jalankan migrasi 003 (yang men-seed baris ini), lalu buka kembali halaman ini.</p>
      </div>
    )
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (wKuis + wTugas + wUjian !== 100) {
      setNotice('Total bobot kuis + tugas + ujian harus 100%.')
      return
    }
    const { error: updErr } = await supabase
      .from('rps')
      .update({
        title: title.trim(),
        description: desc.trim() || null,
        weights: { kuis: wKuis, tugas: wTugas, ujian: wUjian },
        passing_grade: passing,
        updated_by: user?.id ?? null,
      })
      .eq('code', BRAND.rpsCode)
    if (updErr) setNotice(updErr.message)
    else {
      await logAudit('rps.updated', 'rps', BRAND.rpsCode, { weights: { kuis: wKuis, tugas: wTugas, ujian: wUjian }, passing_grade: passing })
      setNotice('RPS diperbarui.')
    }
  }

  return (
    <div className="page page-narrow">
      <h1>Editor RPS — {BRAND.rpsCode}</h1>
      <WorkspaceNav entries={ADMIN_NAV} />
      <p className="muted">Hanya admin yang bisa mengubah RPS. Mentor melihat versi read-only.</p>
      {notice && <p className="notice-box">{notice}</p>}
      <form className="form" onSubmit={handleSave}>
        <label>Judul<input value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
        <label>Deskripsi<textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} /></label>
        <label>Bobot kuis (%)<input type="number" min={0} max={100} value={wKuis} onChange={(e) => setWKuis(Number(e.target.value))} required /></label>
        <label>Bobot tugas (%)<input type="number" min={0} max={100} value={wTugas} onChange={(e) => setWTugas(Number(e.target.value))} required /></label>
        <label>Bobot ujian (%)<input type="number" min={0} max={100} value={wUjian} onChange={(e) => setWUjian(Number(e.target.value))} required /></label>
        <p className="muted">Total bobot saat ini: {wKuis + wTugas + wUjian}% (harus 100%).</p>
        <label>Nilai lulus<input type="number" min={0} max={100} value={passing} onChange={(e) => setPassing(Number(e.target.value))} required /></label>
        <button type="submit" className="btn btn-primary">Simpan RPS</button>
      </form>
      <section className="section">
        <h2>Minggu (read-only di editor ini)</h2>
        {rps.weeks.length === 0 ? (
          <p className="empty">Belum ada daftar minggu di baris RPS ini.</p>
        ) : (
          <ol className="week-list">
            {rps.weeks.map((w) => (
              <li key={w.week}>Minggu {w.week}: {w.topic}</li>
            ))}
          </ol>
        )}
        <p><Link to="/rps">Lihat RPS (read-only) →</Link></p>
      </section>
    </div>
  )
}
