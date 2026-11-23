// SINEVERSE — Pusat Bantuan / Help Center (Tahap 2, publik).
//
// Pencarian + artikel memakai RPC search_sinebot_kb; daftar FAQ dibaca
// dari tabel ai_faq (status published). Bila knowledge base masih kosong
// (belum ada artikel/FAQ yang diterbitkan), tampilkan empty state yang
// rapi — jangan pernah menampilkan data palsu. Riwayat percakapan hanya
// untuk pengguna login; tamu melihat ajakan login. Ticketing penuh baru
// Tahap 4 — "Butuh bantuan manusia?" memakai mailto ke admin.
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import Icon from '../components/icons'
import { supabase } from '../lib/supabase'
import {
  SinebotError,
  deleteConversation,
  listConversations,
  searchKb,
  sinebotAdminMailto,
} from '../lib/sinebot'
import type { KbResult, SinebotConversation, SinebotRole } from '../lib/sinebot'

const CATEGORIES = [
  'Akun & Login',
  'Academy',
  'Tugas & Penilaian',
  'Sertifikat',
  'Proyek & Kru',
  'Komunitas & Showcase',
  'Mentor',
  'Admin',
] as const

interface KbArticle {
  id: string
  title: string
  category: string
  content: string
}

interface FaqItem {
  id: string
  question: string
  answer: string
  category: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export default function HelpCenterPage() {
  const { user, profile } = useAuth()
  const role: SinebotRole = profile?.role ?? 'guest'
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [searchResults, setSearchResults] = useState<KbResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [articles, setArticles] = useState<KbArticle[]>([])
  const [faqs, setFaqs] = useState<FaqItem[]>([])
  const [kbLoading, setKbLoading] = useState(true)
  const [category, setCategory] = useState<string>('Semua')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<SinebotConversation[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  // Daftar artikel + FAQ published. Tabel belum ada (migrasi Tahap 2
  // belum jalan) berarti KB kosong — bukan error yang harus dilempar ke
  // pengguna; halaman tetap tampil dengan empty state.
  useEffect(() => {
    let cancelled = false
    setKbLoading(true)
    Promise.all([
      supabase
        .from('ai_knowledge_base')
        .select('id,title,category,content')
        .eq('status', 'published')
        .order('updated_at', { ascending: false }),
      supabase
        .from('ai_faq')
        .select('id,question,answer,category')
        .eq('status', 'published')
        .order('updated_at', { ascending: false }),
    ])
      .then(([kbRes, faqRes]) => {
        if (cancelled) return
        if (!kbRes.error && Array.isArray(kbRes.data)) {
          setArticles(
            kbRes.data.filter(isRecord).map((r) => ({
              id: typeof r.id === 'string' ? r.id : '',
              title: typeof r.title === 'string' ? r.title : '',
              category: typeof r.category === 'string' ? r.category : '',
              content: typeof r.content === 'string' ? r.content : '',
            })),
          )
        }
        if (!faqRes.error && Array.isArray(faqRes.data)) {
          setFaqs(
            faqRes.data.filter(isRecord).map((r) => ({
              id: typeof r.id === 'string' ? r.id : '',
              question: typeof r.question === 'string' ? r.question : '',
              answer: typeof r.answer === 'string' ? r.answer : '',
              category: typeof r.category === 'string' ? r.category : '',
            })),
          )
        }
      })
      .finally(() => {
        if (!cancelled) setKbLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Pencarian KB (debounce singkat). Query kosong = kembali ke daftar.
  useEffect(() => {
    const q = query.trim()
    if (q === '') {
      setSearchResults(null)
      setSearchError(null)
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = window.setTimeout(() => {
      searchKb(q, role)
        .then((rows) => {
          if (!cancelled) {
            setSearchResults(rows)
            setSearchError(null)
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setSearchResults([])
            setSearchError(
              err instanceof SinebotError
                ? err.message
                : 'Pencarian tidak bisa dilakukan saat ini. Coba lagi sebentar lagi.',
            )
          }
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, role])

  // Riwayat percakapan — hanya untuk pengguna login.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    setHistoryLoading(true)
    listConversations()
      .then((rows) => {
        if (!cancelled) setConversations(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setHistoryError(
            err instanceof SinebotError
              ? err.message
              : 'Riwayat percakapan tidak bisa dimuat. Coba lagi nanti.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  async function handleDeleteConversation(id: string): Promise<void> {
    if (!window.confirm('Hapus percakapan ini? Riwayatnya tidak bisa dikembalikan.')) return
    try {
      await deleteConversation(id)
      setConversations((rows) => rows.filter((c) => c.id !== id))
    } catch (err: unknown) {
      setHistoryError(
        err instanceof SinebotError
          ? err.message
          : 'Percakapan tidak bisa dihapus. Coba lagi nanti.',
      )
    }
  }

  const kbEmpty = !kbLoading && articles.length === 0 && faqs.length === 0
  const filteredArticles =
    category === 'Semua' ? articles : articles.filter((a) => a.category === category)
  const filteredFaqs =
    category === 'Semua' ? faqs : faqs.filter((f) => f.category === category)

  function toggleExpanded(id: string): void {
    setExpandedId((current) => (current === id ? null : id))
  }

  return (
    <div className="page page-narrow">
      <PageHeader
        icon="message"
        title="Pusat Bantuan"
        subtitle="Cari panduan resmi SINEVERSE, baca FAQ, atau tanya SINEBOT lewat tombol chat."
      />

      <div className="sinebot-search" role="search">
        <Icon name="search" size={20} />
        <label className="sinebot-input-label" htmlFor="help-search">
          Cari panduan atau FAQ
        </label>
        <input
          id="help-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Misalnya: cara mengumpulkan tugas"
          autoComplete="off"
        />
      </div>

      <div className="sinebot-chips" aria-label="Filter kategori">
        <button
          type="button"
          className={`sinebot-chip${category === 'Semua' ? ' is-active' : ''}`}
          aria-pressed={category === 'Semua'}
          onClick={() => setCategory('Semua')}
        >
          Semua
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`sinebot-chip${category === c ? ' is-active' : ''}`}
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {searchError && <p className="error-box">{searchError}</p>}

      {query.trim() !== '' ? (
        <section className="section" aria-label="Hasil pencarian">
          <h2>Hasil pencarian</h2>
          {searching ? (
            <p className="muted">Mencari panduan…</p>
          ) : searchResults && searchResults.length === 0 ? (
            <p className="muted">
              Tidak ada panduan yang cocok dengan pencarianmu. Coba kata kunci lain, atau
              hubungi admin.
            </p>
          ) : (
            <ul className="sinebot-article-list">
              {(searchResults ?? []).map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="sinebot-article-head"
                    aria-expanded={expandedId === r.id}
                    onClick={() => toggleExpanded(r.id)}
                  >
                    <span>
                      <strong>{r.title}</strong>
                      <span className="muted sinebot-article-meta">
                        {r.kind === 'faq' ? 'FAQ' : 'Panduan'}
                        {r.category ? ` · ${r.category}` : ''}
                      </span>
                    </span>
                    <Icon name="chevronRight" size={18} />
                  </button>
                  {expandedId === r.id && <p className="sinebot-article-body">{r.content}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : kbLoading ? (
        <p className="muted">Memuat panduan…</p>
      ) : kbEmpty ? (
        <EmptyState message="Panduan sedang disiapkan. Sementara itu, kamu bisa bertanya langsung ke SINEBOT lewat tombol chat di kanan bawah, atau hubungi admin." />
      ) : (
        <>
          {filteredArticles.length > 0 && (
            <section className="section" aria-label="Panduan">
              <h2>Panduan</h2>
              <ul className="sinebot-article-list">
                {filteredArticles.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="sinebot-article-head"
                      aria-expanded={expandedId === a.id}
                      onClick={() => toggleExpanded(a.id)}
                    >
                      <span>
                        <strong>{a.title}</strong>
                        {a.category ? (
                          <span className="muted sinebot-article-meta">{a.category}</span>
                        ) : null}
                      </span>
                      <Icon name="chevronRight" size={18} />
                    </button>
                    {expandedId === a.id && <p className="sinebot-article-body">{a.content}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {filteredFaqs.length > 0 && (
            <section className="section" aria-label="Pertanyaan yang sering ditanyakan">
              <h2>Pertanyaan yang Sering Ditanyakan</h2>
              <ul className="sinebot-article-list">
                {filteredFaqs.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      className="sinebot-article-head"
                      aria-expanded={expandedId === f.id}
                      onClick={() => toggleExpanded(f.id)}
                    >
                      <span>
                        <strong>{f.question}</strong>
                        {f.category ? (
                          <span className="muted sinebot-article-meta">{f.category}</span>
                        ) : null}
                      </span>
                      <Icon name="chevronRight" size={18} />
                    </button>
                    {expandedId === f.id && <p className="sinebot-article-body">{f.answer}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {filteredArticles.length === 0 && filteredFaqs.length === 0 && (
            <p className="muted">
              Belum ada panduan pada kategori ini. Coba kategori lain, atau cari dengan kata
              kunci.
            </p>
          )}
        </>
      )}

      <section className="section" aria-label="Riwayat percakapan">
        <h2>Riwayat Percakapan</h2>
        {user ? (
          historyLoading ? (
            <p className="muted">Memuat riwayat…</p>
          ) : historyError ? (
            <p className="error-box">{historyError}</p>
          ) : conversations.length === 0 ? (
            <p className="muted">
              Belum ada percakapan. Buka chat SINEBOT lewat tombol di kanan bawah untuk mulai
              bertanya.
            </p>
          ) : (
            <ul className="sinebot-history-list">
              {conversations.map((c) => (
                <li key={c.id}>
                  <span className="sinebot-history-item">
                    <span className="sinebot-history-title">{c.title}</span>
                    <span className="muted sinebot-history-date">
                      {c.updated_at
                        ? new Date(c.updated_at).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : ''}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="sinebot-history-delete"
                    aria-label={`Hapus percakapan ${c.title}`}
                    onClick={() => void handleDeleteConversation(c.id)}
                  >
                    <Icon name="close" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <p className="muted">
            <Link to="/login">Login</Link> untuk menyimpan dan melihat riwayat percakapanmu
            dengan SINEBOT.
          </p>
        )}
      </section>

      <section className="sinebot-human-card" aria-label="Butuh bantuan manusia">
        <Icon name="message" size={24} />
        <div>
          <h2>Butuh bantuan manusia?</h2>
          <p className="muted">
            SINEBOT belum bisa menjawab pertanyaanmu? Kirim email ke tim SINEVERSE — admin
            akan membalas secepatnya.
          </p>
        </div>
        <a className="btn btn-primary" href={sinebotAdminMailto('Butuh bantuan SINEVERSE')}>
          Hubungi Admin
        </a>
      </section>
    </div>
  )
}
