// SINEVERSE — Pusat Bantuan / Help Center (Tahap 2, publik; filter role Tahap 3).
//
// Daftar artikel + FAQ difilter berdasarkan role dari session resmi
// (profile?.role ?? 'guest') memakai kolom audience_roles — di query
// Supabase (.contains) dan dicek ulang di client sebagai lapis kedua.
// Pencarian memakai RPC search_sinebot_kb yang sudah memfilter per role.
// Bila knowledge base masih kosong (belum ada artikel/FAQ yang
// diterbitkan), tampilkan empty state yang rapi — jangan pernah
// menampilkan data palsu. Riwayat percakapan hanya untuk pengguna login;
// tamu melihat ajakan login. Tiket dukungan penuh (Tahap 4): form "Buat
// Tiket" + "Tiket Saya" di bawah, hanya untuk pengguna login; identitas
// + role terisi otomatis dari session — tidak ada field nama/email/role
// yang bisa diketik. "Butuh bantuan manusia?" tetap memakai mailto ke
// admin sebagai jalan lain.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import Icon from '../components/icons'
import { supabase } from '../lib/supabase'
import {
  SinebotError,
  createTicket,
  createTicketAttachmentUrl,
  deleteConversation,
  getTicket,
  listConversations,
  listMyTickets,
  replyToTicket,
  searchKb,
  sinebotAdminMailto,
  validateTicketAttachment,
} from '../lib/sinebot'
import type {
  KbResult,
  SinebotConversation,
  SinebotRole,
  Ticket,
  TicketCategory,
  TicketDetail,
  TicketPriority,
  TicketStatus,
} from '../lib/sinebot'

// Urutan tampil kategori. Nilai di sini HARUS sama persis dengan nilai
// `category` di seed 049 (mis. 'Akun', bukan 'Akun & Login') — chip yang
// tidak cocok dengan satu pun kategori tidak akan pernah menampilkan
// konten. Hanya kategori yang masih punya konten SETELAH filter role yang
// dirender (lihat visibleCategories di bawah); kategori kosong tidak
// ditampilkan sama sekali.
const CATEGORY_ORDER = [
  'Akun',
  'Academy',
  'Penilaian',
  'Sertifikat',
  'Showcase',
  'Proyek',
  'Komunitas',
  'Acara',
  'Mentor',
  'Admin',
  'Umum',
] as const

interface KbArticle {
  id: string
  title: string
  category: string
  content: string
  audience_roles: string[]
}

interface FaqItem {
  id: string
  question: string
  answer: string
  category: string
  audience_roles: string[]
}

// Kategori tiket: label yang tampil → nilai kontrak RPC (CHECK
// constraint support_tickets.category). Jangan ubah nilai tanpa migrasi.
const TICKET_CATEGORIES: { value: TicketCategory; label: string }[] = [
  { value: 'akun', label: 'Akun & Login' },
  { value: 'academy', label: 'Academy' },
  { value: 'tugas', label: 'Tugas & Penilaian' },
  { value: 'sertifikat', label: 'Sertifikat' },
  { value: 'komunitas', label: 'Komunitas' },
  { value: 'teknis', label: 'Teknis' },
  { value: 'lainnya', label: 'Lainnya' },
]

const TICKET_PRIORITIES: { value: TicketPriority; label: string; hint: string }[] = [
  { value: 'low', label: 'Low', hint: 'Tidak mendesak, bisa menunggu.' },
  { value: 'medium', label: 'Medium', hint: 'Perlu ditangani dalam beberapa hari.' },
  { value: 'high', label: 'High', hint: 'Mengganggu aktivitas belajarmu.' },
  { value: 'critical', label: 'Critical', hint: 'Platform tidak bisa dipakai sama sekali.' },
]

const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Baru',
  assigned: 'Ditugaskan',
  in_progress: 'Sedang Ditangani',
  waiting_user: 'Menunggu Kamu',
  resolved: 'Terselesaikan',
  closed: 'Ditutup',
}

const TICKET_STATUS_CLASS: Record<TicketStatus, string> = {
  open: 'sinebot-ticket-status-open',
  assigned: 'sinebot-ticket-status-assigned',
  in_progress: 'sinebot-ticket-status-progress',
  waiting_user: 'sinebot-ticket-status-waiting',
  resolved: 'sinebot-ticket-status-resolved',
  closed: 'sinebot-ticket-status-closed',
}

// Gaya inline untuk pil status (index.css bukan file milik worker ini,
// jadi warna pil didefinisikan di sini, mengikuti palet SINEVERSE).
const TICKET_STATUS_PILL: CSSProperties = {
  display: 'inline-block',
  padding: '0.1rem 0.55rem',
  borderRadius: '999px',
  fontSize: '0.8rem',
  fontWeight: 700,
}

const TICKET_STATUS_STYLE: Record<TicketStatus, CSSProperties> = {
  open: { ...TICKET_STATUS_PILL, background: '#E8EDF3', color: '#172438' },
  assigned: { ...TICKET_STATUS_PILL, background: '#FEF3C7', color: '#92400E' },
  in_progress: { ...TICKET_STATUS_PILL, background: '#DBEAFE', color: '#1E40AF' },
  waiting_user: { ...TICKET_STATUS_PILL, background: '#FDE68A', color: '#78350F' },
  resolved: { ...TICKET_STATUS_PILL, background: '#A3E6C4', color: '#14532D' },
  closed: { ...TICKET_STATUS_PILL, background: '#E8EDF3', color: '#5B6B7C' },
}

const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
}

function formatTicketFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTicketDate(value: string): string {
  if (!value) return ''
  return new Date(value).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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

  // Daftar artikel + FAQ published, DIFILTER BERDASARKAN ROLE (Tahap 3).
  // Role dari session resmi: profile?.role ?? 'guest' ('guest' | 'siswa'
  // | 'mentor' | 'admin'). Filter utama di query Supabase
  // (.contains('audience_roles', [role]) → audience_roles=cs.{role} di
  // PostgREST; perilaku operator ini dibuktikan via REST API live, 23 Nov
  // 2026: siswa = 14 artikel, mentor = 6, tamu = 5, admin = 1).
  // audience_roles ikut di-select dan dicek ulang di client sebagai lapis
  // kedua, supaya baris yang lolos query secara tak sengaja tetap tidak
  // tampil bila role tidak ada di audience-nya. Effect bergantung pada
  // `role`: bila role berubah (login/logout, atau profil selesai dimuat)
  // daftar dimuat ulang dengan filter baru — daftar lama TIDAK boleh
  // bertahan melewati pergantian role. Tabel belum ada (migrasi Tahap 2
  // belum jalan) berarti KB kosong — bukan error yang harus dilempar ke
  // pengguna; halaman tetap tampil dengan empty state.
  useEffect(() => {
    let cancelled = false
    setKbLoading(true)
    // Pergantian role menutup detail yang sedang terbuka dan mengembalikan
    // filter kategori ke 'Semua' (kategori lama bisa jadi kosong untuk
    // role baru).
    setExpandedId(null)
    setCategory('Semua')
    Promise.all([
      supabase
        .from('ai_knowledge_base')
        .select('id,title,category,content,audience_roles')
        .eq('status', 'published')
        .contains('audience_roles', [role])
        .order('updated_at', { ascending: false }),
      supabase
        .from('ai_faq')
        .select('id,question,answer,category,audience_roles')
        .eq('status', 'published')
        .contains('audience_roles', [role])
        .order('updated_at', { ascending: false }),
    ])
      .then(([kbRes, faqRes]) => {
        if (cancelled) return
        if (!kbRes.error && Array.isArray(kbRes.data)) {
          setArticles(
            kbRes.data
              .filter(isRecord)
              .map((r) => ({
                id: typeof r.id === 'string' ? r.id : '',
                title: typeof r.title === 'string' ? r.title : '',
                category: typeof r.category === 'string' ? r.category : '',
                content: typeof r.content === 'string' ? r.content : '',
                audience_roles: Array.isArray(r.audience_roles)
                  ? r.audience_roles.filter(
                      (v): v is string => typeof v === 'string',
                    )
                  : [],
              }))
              // Lapis kedua: hanya tampil bila role ada di audience_roles.
              .filter((a) => a.audience_roles.includes(role)),
          )
        }
        if (!faqRes.error && Array.isArray(faqRes.data)) {
          setFaqs(
            faqRes.data
              .filter(isRecord)
              .map((r) => ({
                id: typeof r.id === 'string' ? r.id : '',
                question: typeof r.question === 'string' ? r.question : '',
                answer: typeof r.answer === 'string' ? r.answer : '',
                category: typeof r.category === 'string' ? r.category : '',
                audience_roles: Array.isArray(r.audience_roles)
                  ? r.audience_roles.filter(
                      (v): v is string => typeof v === 'string',
                    )
                  : [],
              }))
              .filter((f) => f.audience_roles.includes(role)),
          )
        }
      })
      .finally(() => {
        if (!cancelled) setKbLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [role])

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

  // ---- Tiket dukungan (Tahap 4) — hanya untuk pengguna login. ----
  // Dibuka otomatis bila URL membawa ?tab=tiket — dipakai tombol
  // "Hubungi Admin" di panel SINEBOT (lihat SinebotChat.tsx). Query
  // param dipilih (bukan location state) supaya tautan bisa dibagikan
  // dan tetap membuka section tiket setelah refresh.
  const ticketRequested = searchParams.get('tab') === 'tiket'
  const ticketSectionRef = useRef<HTMLElement | null>(null)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [ticketsLoading, setTicketsLoading] = useState(false)
  const [ticketsError, setTicketsError] = useState<string | null>(null)
  const [ticketCategory, setTicketCategory] = useState<TicketCategory>('akun')
  const [ticketSubject, setTicketSubject] = useState('')
  const [ticketDescription, setTicketDescription] = useState('')
  const [ticketPageContext, setTicketPageContext] = useState('')
  const [ticketPriority, setTicketPriority] = useState<TicketPriority>('medium')
  const [ticketFile, setTicketFile] = useState<File | null>(null)
  const [ticketFileError, setTicketFileError] = useState<string | null>(null)
  const [formBusy, setFormBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [ticketDetail, setTicketDetail] = useState<TicketDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replyFile, setReplyFile] = useState<File | null>(null)
  const [replyFileError, setReplyFileError] = useState<string | null>(null)
  const [replyBusy, setReplyBusy] = useState(false)
  const [replyError, setReplyError] = useState<string | null>(null)
  const [attachmentBusy, setAttachmentBusy] = useState<string | null>(null)
  const ticketFileInputRef = useRef<HTMLInputElement | null>(null)
  const replyFileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!ticketRequested || !ticketSectionRef.current) return
    ticketSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [ticketRequested])

  async function loadTickets(): Promise<void> {
    setTicketsLoading(true)
    setTicketsError(null)
    try {
      setTickets(await listMyTickets())
    } catch (err: unknown) {
      setTicketsError(
        err instanceof SinebotError
          ? err.message
          : 'Daftar tiket tidak bisa dimuat. Coba lagi nanti.',
      )
    } finally {
      setTicketsLoading(false)
    }
  }

  useEffect(() => {
    if (!user) return
    void loadTickets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function openTicketDetail(id: string): Promise<void> {
    setSelectedTicketId(id)
    setTicketDetail(null)
    setDetailError(null)
    setReplyText('')
    setReplyFile(null)
    setReplyFileError(null)
    setReplyError(null)
    setDetailLoading(true)
    try {
      setTicketDetail(await getTicket(id))
    } catch (err: unknown) {
      setDetailError(
        err instanceof SinebotError
          ? err.message
          : 'Detail tiket tidak bisa dimuat. Coba lagi nanti.',
      )
    } finally {
      setDetailLoading(false)
    }
  }

  function handleTicketFileChange(file: File | null): void {
    setTicketFileError(null)
    if (!file) {
      setTicketFile(null)
      return
    }
    const error = validateTicketAttachment(file)
    if (error) {
      setTicketFileError(error)
      setTicketFile(null)
      if (ticketFileInputRef.current) ticketFileInputRef.current.value = ''
      return
    }
    setTicketFile(file)
  }

  function handleReplyFileChange(file: File | null): void {
    setReplyFileError(null)
    if (!file) {
      setReplyFile(null)
      return
    }
    const error = validateTicketAttachment(file)
    if (error) {
      setReplyFileError(error)
      setReplyFile(null)
      if (replyFileInputRef.current) replyFileInputRef.current.value = ''
      return
    }
    setReplyFile(file)
  }

  async function handleCreateTicket(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (formBusy) return // busy guard: cegah double-submit
    setFormError(null)
    setFormSuccess(null)
    setFormBusy(true)
    try {
      const id = await createTicket(
        ticketCategory,
        ticketSubject,
        ticketDescription,
        ticketPageContext,
        ticketPriority,
        ticketFile,
      )
      setFormSuccess('Tiket berhasil dibuat. Admin akan menindaklanjutinya — pantau balasannya di bawah.')
      setTicketSubject('')
      setTicketDescription('')
      setTicketPageContext('')
      setTicketPriority('medium')
      setTicketFile(null)
      setTicketFileError(null)
      if (ticketFileInputRef.current) ticketFileInputRef.current.value = ''
      await loadTickets()
      await openTicketDetail(id)
    } catch (err: unknown) {
      setFormError(
        err instanceof SinebotError
          ? err.message
          : 'Tiket tidak bisa dibuat. Coba lagi sebentar lagi.',
      )
    } finally {
      setFormBusy(false)
    }
  }

  async function handleReplyTicket(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (replyBusy || !selectedTicketId || !ticketDetail) return
    if (ticketDetail.ticket.status === 'closed') return
    setReplyError(null)
    setReplyBusy(true)
    try {
      await replyToTicket(selectedTicketId, replyText, replyFile)
      setReplyText('')
      setReplyFile(null)
      setReplyFileError(null)
      if (replyFileInputRef.current) replyFileInputRef.current.value = ''
      await loadTickets()
      await openTicketDetail(selectedTicketId)
    } catch (err: unknown) {
      setReplyError(
        err instanceof SinebotError
          ? err.message
          : 'Balasan tidak bisa dikirim. Coba lagi sebentar lagi.',
      )
    } finally {
      setReplyBusy(false)
    }
  }

  async function handleOpenAttachment(path: string): Promise<void> {
    if (attachmentBusy) return
    setAttachmentBusy(path)
    try {
      // Signed URL berumur 1 jam, dibuat saat diklik dan langsung dibuka
      // di tab baru — tidak disimpan di state.
      const url = await createTicketAttachmentUrl(path, 3600)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err: unknown) {
      setDetailError(
        err instanceof SinebotError
          ? err.message
          : 'Lampiran tidak bisa dibuka. Coba lagi nanti.',
      )
    } finally {
      setAttachmentBusy(null)
    }
  }

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

  // Kategori yang ditampilkan sebagai chip: hanya kategori yang masih
  // punya konten (artikel atau FAQ) SETELAH filter role. Urutan mengikuti
  // CATEGORY_ORDER; kategori yang tidak ada di daftar itu (bila seed
  // bertambah) ditambahkan di akhir sesuai urutan kemunculan.
  const visibleCategories = useMemo(() => {
    const present = new Set<string>()
    for (const a of articles) if (a.category) present.add(a.category)
    for (const f of faqs) if (f.category) present.add(f.category)
    const ordered: string[] = CATEGORY_ORDER.filter((c) => present.has(c))
    for (const c of present) if (!ordered.includes(c)) ordered.push(c)
    return ordered
  }, [articles, faqs])

  function toggleExpanded(id: string): void {
    // Detail (expand-in-place) hanya untuk item yang sedang tampil — dan
    // yang tampil sudah lolos filter role. Tidak ada route, modal, atau
    // deep-link ke detail artikel di halaman ini, jadi tidak ada jalur lain
    // untuk membuka konten di luar audience: pengaman ini menutup celah
    // bila toggle dipanggil dengan id yang tidak ada di daftar saat ini
    // (mis. id artikel admin yang ditebak/diketik manual).
    const isVisible = searchResults
      ? searchResults.some((r) => r.id === id)
      : articles.some((a) => a.id === id) || faqs.some((f) => f.id === id)
    if (!isVisible) return
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
        {visibleCategories.map((c) => (
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

      <section
        ref={ticketSectionRef}
        className="section"
        aria-label="Tiket dukungan"
        id="tiket"
      >
        <h2>Tiket Dukungan</h2>
        {user ? (
          <>
            <form className="form" onSubmit={(e) => void handleCreateTicket(e)}>
              <h3>Buat Tiket</h3>
              <p className="muted">
                Tiket dikirim atas nama akunmu yang sedang login
                {user.email ? ` (${user.email})` : ''} — tidak perlu mengisi nama atau email.
              </p>
              <label>
                Kategori
                <select
                  value={ticketCategory}
                  onChange={(e) => setTicketCategory(e.target.value as TicketCategory)}
                  disabled={formBusy}
                >
                  {TICKET_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Subjek
                <input
                  type="text"
                  value={ticketSubject}
                  onChange={(e) => setTicketSubject(e.target.value)}
                  placeholder="Ringkasan singkat masalahmu"
                  maxLength={200}
                  disabled={formBusy}
                  required
                />
                <span className="muted">{ticketSubject.length}/200 karakter</span>
              </label>
              <label>
                Deskripsi
                <textarea
                  value={ticketDescription}
                  onChange={(e) => setTicketDescription(e.target.value)}
                  placeholder="Jelaskan masalahmu sedetail mungkin: apa yang terjadi, kapan, dan langkah apa yang sudah kamu coba."
                  rows={5}
                  maxLength={2000}
                  disabled={formBusy}
                  required
                />
                <span className="muted">{ticketDescription.length}/2000 karakter</span>
              </label>
              <label>
                Halaman / fitur terkait (opsional)
                <input
                  type="text"
                  value={ticketPageContext}
                  onChange={(e) => setTicketPageContext(e.target.value)}
                  placeholder="Misalnya: halaman Tugas kelas Sinematografi"
                  maxLength={200}
                  disabled={formBusy}
                />
              </label>
              <label>
                Prioritas
                <select
                  value={ticketPriority}
                  onChange={(e) => setTicketPriority(e.target.value as TicketPriority)}
                  disabled={formBusy}
                >
                  {TICKET_PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label} — {p.hint}
                    </option>
                  ))}
                </select>
                <span className="muted">
                  {TICKET_PRIORITIES.find((p) => p.value === ticketPriority)?.hint}
                </span>
              </label>
              <label>
                Lampiran (opsional, 1 file)
                <input
                  ref={ticketFileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  onChange={(e) => handleTicketFileChange(e.target.files?.[0] ?? null)}
                  disabled={formBusy}
                />
                <span className="muted">
                  Hanya JPG, PNG, WebP, atau PDF, maksimal 5 MB.
                </span>
              </label>
              {ticketFile && (
                <p>
                  File dipilih: <strong>{ticketFile.name}</strong> (
                  {formatTicketFileSize(ticketFile.size)}){' '}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => handleTicketFileChange(null)}
                    disabled={formBusy}
                  >
                    Hapus pilihan
                  </button>
                </p>
              )}
              {ticketFileError && <p className="error-box">{ticketFileError}</p>}
              {formError && <p className="error-box">{formError}</p>}
              {formSuccess && (
                <p className="sinebot-ticket-success" role="status" style={{ color: '#16865E', fontWeight: 700 }}>
                  {formSuccess}
                </p>
              )}
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={formBusy}>
                  {formBusy ? 'Mengirim…' : 'Buat Tiket'}
                </button>
              </div>
            </form>

            <h3>Tiket Saya</h3>
            {selectedTicketId ? (
              <div>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => {
                    setSelectedTicketId(null)
                    setTicketDetail(null)
                    setDetailError(null)
                  }}
                >
                  ← Kembali ke daftar tiket
                </button>
                {detailLoading ? (
                  <p className="muted">Memuat detail tiket…</p>
                ) : detailError ? (
                  <p className="error-box">{detailError}</p>
                ) : ticketDetail ? (
                  <div className="sinebot-ticket-detail">
                    <h4>{ticketDetail.ticket.subject}</h4>
                    <p className="muted">
                      <span
                        className={`sinebot-ticket-status ${TICKET_STATUS_CLASS[ticketDetail.ticket.status]}`}
                        style={TICKET_STATUS_STYLE[ticketDetail.ticket.status]}
                      >
                        {TICKET_STATUS_LABELS[ticketDetail.ticket.status]}
                      </span>{' '}
                      · Prioritas {TICKET_PRIORITY_LABELS[ticketDetail.ticket.priority]} ·{' '}
                      {formatTicketDate(ticketDetail.ticket.created_at)}
                    </p>
                    {ticketDetail.ticket.page_context && (
                      <p className="muted">
                        Halaman / fitur terkait: {ticketDetail.ticket.page_context}
                      </p>
                    )}
                    <p className="sinebot-article-body">{ticketDetail.ticket.description}</p>
                    {ticketDetail.ticket.attachment_path && (
                      <p>
                        <button
                          type="button"
                          className="link-button"
                          disabled={attachmentBusy === ticketDetail.ticket.attachment_path}
                          onClick={() =>
                            void handleOpenAttachment(
                              ticketDetail.ticket.attachment_path as string,
                            )
                          }
                        >
                          Lihat lampiran: {ticketDetail.ticket.attachment_name ?? 'lampiran'}
                          {typeof ticketDetail.ticket.attachment_size === 'number'
                            ? ` (${formatTicketFileSize(ticketDetail.ticket.attachment_size)})`
                            : ''}
                        </button>
                      </p>
                    )}
                    <h4>Balasan</h4>
                    {ticketDetail.messages.length === 0 ? (
                      <p className="muted">
                        Belum ada balasan. Admin akan membalas tiketmu di sini.
                      </p>
                    ) : (
                      <ul className="sinebot-ticket-replies">
                        {ticketDetail.messages.map((m) => (
                          <li
                            key={m.id}
                            className={
                              m.sender_type === 'admin'
                                ? 'sinebot-ticket-reply-admin'
                                : 'sinebot-ticket-reply-own'
                            }
                          >
                            <p className="muted">
                              <strong>
                                {m.sender_type === 'admin' ? 'Admin SINEVERSE' : 'Kamu'}
                              </strong>{' '}
                              · {formatTicketDate(m.created_at)}
                            </p>
                            <p className="sinebot-article-body">{m.message}</p>
                            {m.attachment_path && (
                              <p>
                                <button
                                  type="button"
                                  className="link-button"
                                  disabled={attachmentBusy === m.attachment_path}
                                  onClick={() =>
                                    void handleOpenAttachment(m.attachment_path as string)
                                  }
                                >
                                  Lihat lampiran: {m.attachment_name ?? 'lampiran'}
                                  {typeof m.attachment_size === 'number'
                                    ? ` (${formatTicketFileSize(m.attachment_size)})`
                                    : ''}
                                </button>
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {ticketDetail.ticket.status === 'closed' ? (
                      <p className="muted">
                        Tiket ini sudah Ditutup dan tidak bisa dibalas. Bila masalahmu belum
                        selesai, buat tiket baru.
                      </p>
                    ) : (
                      <form className="form" onSubmit={(e) => void handleReplyTicket(e)}>
                        <label>
                          Balas tiket
                          <textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Tulis balasanmu untuk admin…"
                            rows={4}
                            maxLength={2000}
                            disabled={replyBusy}
                            required
                          />
                        </label>
                        <label>
                          Lampiran balasan (opsional, 1 file)
                          <input
                            ref={replyFileInputRef}
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp,.pdf"
                            onChange={(e) => handleReplyFileChange(e.target.files?.[0] ?? null)}
                            disabled={replyBusy}
                          />
                          <span className="muted">
                            Hanya JPG, PNG, WebP, atau PDF, maksimal 5 MB.
                          </span>
                        </label>
                        {replyFile && (
                          <p>
                            File dipilih: <strong>{replyFile.name}</strong> (
                            {formatTicketFileSize(replyFile.size)}){' '}
                            <button
                              type="button"
                              className="link-button"
                              onClick={() => handleReplyFileChange(null)}
                              disabled={replyBusy}
                            >
                              Hapus pilihan
                            </button>
                          </p>
                        )}
                        {replyFileError && <p className="error-box">{replyFileError}</p>}
                        {replyError && <p className="error-box">{replyError}</p>}
                        <div className="form-actions">
                          <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={replyBusy}
                          >
                            {replyBusy ? 'Mengirim…' : 'Kirim Balasan'}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                ) : null}
              </div>
            ) : ticketsLoading ? (
              <p className="muted">Memuat tiket…</p>
            ) : ticketsError ? (
              <p className="error-box">{ticketsError}</p>
            ) : tickets.length === 0 ? (
              <p className="muted">
                Belum ada tiket. Bila SINEBOT belum bisa membantumu, buat tiket di atas dan
                admin akan menindaklanjutinya.
              </p>
            ) : (
              <ul className="sinebot-article-list">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className="sinebot-article-head"
                      onClick={() => void openTicketDetail(t.id)}
                    >
                      <span>
                        <strong>{t.subject}</strong>
                        <span className="muted sinebot-article-meta">
                          <span
                            className={`sinebot-ticket-status ${TICKET_STATUS_CLASS[t.status]}`}
                            style={TICKET_STATUS_STYLE[t.status]}
                          >
                            {TICKET_STATUS_LABELS[t.status]}
                          </span>{' '}
                          · Prioritas {TICKET_PRIORITY_LABELS[t.priority]} ·{' '}
                          {formatTicketDate(t.created_at)}
                        </span>
                      </span>
                      <Icon name="chevronRight" size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="muted">
            <Link to="/login">Login</Link> untuk membuat tiket dukungan dan melihat tiketmu —
            admin SINEVERSE akan menindaklanjutinya.
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
