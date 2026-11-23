// SINEVERSE — Editor RPS (admin only, 003): bobot pretest/posttest/
// tugas mingguan/tugas praktik akhir/diskusi (Tahap 3, migrasi 015),
// passing grade, judul, deskripsi. Daftar minggu (20 minggu) ditampilkan
// read-only — pengeditan minggu per minggu belum disediakan agar JSON
// minggu tidak rusak dari form.
import { useEffect, useRef, useState } from 'react'
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
  const [wPretest, setWPretest] = useState(5)
  const [wPosttest, setWPosttest] = useState(15)
  const [wTugasMingguan, setWTugasMingguan] = useState(30)
  const [wTugasAkhir, setWTugasAkhir] = useState(40)
  const [wDiskusi, setWDiskusi] = useState(10)
  const [passing, setPassing] = useState(70)
  // P78: busy guard — klik ganda tidak boleh menyimpan dua kali (duplikat
  // entri audit log rps.updated).
  const [saving, setSaving] = useState(false)
  // LB14: textarea Deskripsi auto-grow (tinggi mengikuti isi, bukan
  // 3 baris yang memotong teks di balik scrollbar).
  const descRef = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const el = descRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 96)}px`
  }, [desc])

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
          const row = data as unknown as Rps & { weights: Rps['weights'] }
          setRps(row)
          setTitle(row.title)
          setDesc(row.description ?? '')
          // Baris lama (sebelum migrasi 015) masih memakai kunci kuis/
          // tugas/ujian — tampilkan apa adanya bila kunci baru belum ada.
          setWPretest(row.weights?.pretest ?? GRADEBOOK_WEIGHTS.pretest * 100)
          setWPosttest(row.weights?.posttest ?? GRADEBOOK_WEIGHTS.posttest * 100)
          setWTugasMingguan(
            row.weights?.tugas_mingguan ?? GRADEBOOK_WEIGHTS.tugasMingguan * 100,
          )
          setWTugasAkhir(row.weights?.tugas_akhir ?? GRADEBOOK_WEIGHTS.tugasAkhir * 100)
          setWDiskusi(row.weights?.diskusi ?? GRADEBOOK_WEIGHTS.diskusi * 100)
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
    if (saving) return
    if (wPretest + wPosttest + wTugasMingguan + wTugasAkhir + wDiskusi !== 100) {
      setNotice('Total bobot pretest + posttest + tugas mingguan + tugas praktik akhir + diskusi harus 100%.')
      return
    }
    const newWeights = {
      pretest: wPretest,
      posttest: wPosttest,
      tugas_mingguan: wTugasMingguan,
      tugas_akhir: wTugasAkhir,
      diskusi: wDiskusi,
    }
    setSaving(true)
    try {
      const { error: updErr } = await supabase
        .from('rps')
        .update({
          title: title.trim(),
          description: desc.trim() || null,
          weights: newWeights,
          passing_grade: passing,
          updated_by: user?.id ?? null,
        })
        .eq('code', BRAND.rpsCode)
      if (updErr) setNotice(updErr.message)
      else {
        await logAudit('rps.updated', 'rps', BRAND.rpsCode, { weights: newWeights, passing_grade: passing })
        setNotice('RPS diperbarui.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    // LB14: .page-wide keluar dari batas .main (1140px) sampai hampir
    // tepi viewport — .page saja tidak cukup karena tidak punya aturan
    // lebar dan tetap terjepit di 1140px (~58% di 1919px). Field angka
    // di .form-grid supaya tetap enak dibaca di lebar penuh.
    <div className="page page-wide">
      <h1>Editor RPS — {BRAND.rpsCode}</h1>
      <WorkspaceNav entries={ADMIN_NAV} />
      <p className="muted">Hanya admin yang bisa mengubah RPS. Mentor melihat versi read-only.</p>
      {notice && <p className="notice-box">{notice}</p>}
      <form className="form" onSubmit={handleSave}>
        <label>Judul<input value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
        <label>Deskripsi<textarea ref={descRef} value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} style={{ overflow: 'hidden', resize: 'none' }} /></label>
        <div className="form-grid">
          <label>Bobot pretest (%)<input type="number" min={0} max={100} value={wPretest} onChange={(e) => setWPretest(Number(e.target.value))} required /></label>
          <label>Bobot posttest (%)<input type="number" min={0} max={100} value={wPosttest} onChange={(e) => setWPosttest(Number(e.target.value))} required /></label>
          <label>Bobot tugas mingguan (%)<input type="number" min={0} max={100} value={wTugasMingguan} onChange={(e) => setWTugasMingguan(Number(e.target.value))} required /></label>
          <label>Bobot tugas praktik akhir (%)<input type="number" min={0} max={100} value={wTugasAkhir} onChange={(e) => setWTugasAkhir(Number(e.target.value))} required /></label>
          <label>Bobot partisipasi diskusi (%)<input type="number" min={0} max={100} value={wDiskusi} onChange={(e) => setWDiskusi(Number(e.target.value))} required /></label>
          <label>Nilai lulus<input type="number" min={0} max={100} value={passing} onChange={(e) => setPassing(Number(e.target.value))} required /></label>
        </div>
        <p className="muted">Total bobot saat ini: {wPretest + wPosttest + wTugasMingguan + wTugasAkhir + wDiskusi}% (harus 100%).</p>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan RPS'}</button>
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
