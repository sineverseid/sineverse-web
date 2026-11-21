// SINEVERSE — Komunitas: direktori komunitas yang disetujui + gabung/
// keluar + usulan komunitas baru dari anggota (004). Persetujuan admin
// membuat komunitas + menggabungkan pengusul (ditangani admin di Admin
// Panel; di sini usulan tercatat sebagai community_proposals 'pending').
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import MigrationNotice from '../components/MigrationNotice'
import { useAuth } from '../context/AuthContext'
import { isMissingTableError } from '../lib/guarded'
import { supabase } from '../lib/supabase'
import type { Community, CommunityMember } from '../lib/types'

export default function CommunitiesPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<Community[] | null>(null)
  const [mine, setMine] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')

  async function load() {
    try {
      const { data, error: qErr } = await supabase
        .from('communities')
        .select('*')
        .eq('is_approved', true)
        .order('name')
      if (qErr) {
        if (isMissingTableError(qErr)) setItems(null)
        else throw qErr
        return
      }
      setItems((data ?? []) as Community[])
      if (user) {
        const { data: mem } = await supabase
          .from('community_members')
          .select('community_id')
          .eq('user_id', user.id)
        setMine(new Set(((mem ?? []) as CommunityMember[]).map((m) => m.community_id)))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat komunitas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  async function toggleJoin(id: string, joined: boolean) {
    if (!user) return
    if (joined) {
      const { error } = await supabase
        .from('community_members')
        .delete()
        .eq('community_id', id)
        .eq('user_id', user.id)
      if (error) setNotice(error.message)
      else setMine((m) => { const n = new Set(m); n.delete(id); return n })
    } else {
      const { error } = await supabase
        .from('community_members')
        .insert({ community_id: id, user_id: user.id, role: 'member' })
      if (error) setNotice(error.message)
      else setMine((m) => new Set(m).add(id))
    }
  }

  async function handlePropose(e: FormEvent) {
    e.preventDefault()
    if (!user || !name.trim()) return
    const { error } = await supabase.from('community_proposals').insert({
      name: name.trim(),
      description: desc.trim() || null,
      proposer_id: user.id,
      status: 'pending',
    })
    if (error) setNotice(error.message)
    else {
      setNotice('Usulan komunitas terkirim. Admin akan meninjau — bila disetujui, komunitas dibuat dan kamu langsung menjadi anggotanya.')
      setName('')
      setDesc('')
    }
  }

  if (loading) return <div className="page"><p className="muted">Memuat komunitas…</p></div>
  if (error) return <div className="page"><p className="error-box">{error}</p></div>
  if (items === null) return <div className="page"><h1>Komunitas</h1><MigrationNotice migration="004" /></div>

  return (
    <div className="page">
      <h1>Komunitas</h1>
      <p className="muted">Bergabung dengan komunitas filmmaker pelajar di seluruh Indonesia.</p>
      {notice && <p className="notice-box">{notice}</p>}
      {items.length === 0 ? (
        <p className="empty">Belum ada komunitas yang disetujui.</p>
      ) : (
        <ul className="course-list">
          {items.map((c) => (
            <li key={c.id} className="course-card">
              <Link to={`/komunitas/${c.id}`}>
                <h3>{c.name}</h3>
                <p>{c.description ?? 'Komunitas SINEVERSE.'}</p>
              </Link>
              {user && (
                <div style={{ padding: '0 1.25rem 1rem' }}>
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => void toggleJoin(c.id, mine.has(c.id))}>
                    {mine.has(c.id) ? 'Keluar' : 'Gabung'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {user && (
        <section className="section">
          <h2>Usulkan Komunitas Baru</h2>
          <form className="form" onSubmit={handlePropose}>
            <label>
              Nama komunitas
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Mis. Klub Film Bandung" />
            </label>
            <label>
              Deskripsi
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="Komunitas ini tentang…" />
            </label>
            <button type="submit" className="btn btn-primary">Kirim Usulan</button>
          </form>
        </section>
      )}
    </div>
  )
}
