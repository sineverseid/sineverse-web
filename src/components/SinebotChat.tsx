// SINEVERSE — SINEBOT chat panel (Tahap 2).
//
// Bottom sheet di handphone, panel kanan di desktop (CSS .sinebot-panel).
// Tamu: percakapan hanya hidup di memori sesi ini (tidak dimuat ulang
// setelah refresh — RLS tidak mengizinkan tamu membaca kembali percakapan
// tamu). Pengguna login: riwayat tersimpan, bisa dibuka lagi dan dihapus.
// Ticketing penuh baru Tahap 4 — untuk sementara "Hubungi Admin" memakai
// mailto ke sineverse.id@gmail.com.
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Icon from './icons'
import {
  SinebotError,
  createConversation,
  deleteConversation,
  getMessages,
  listConversations,
  sendMessage,
  sinebotAdminMailto,
  submitFeedback,
} from '../lib/sinebot'
import type { SinebotConversation, SinebotRole, SinebotSource } from '../lib/sinebot'

const QUICK_PROMPTS = [
  'Cara ikut kelas',
  'Cara mengumpulkan tugas',
  'Sertifikat',
  'Kendala login',
  'Hubungi admin',
  'Cek status enrollment saya',
] as const

const WELCOME_TEXT =
  'Halo! Aku SINEBOT, asisten filmmaking SINEVERSE. Tanya apa saja seputar kelas, tugas, sertifikat, atau kendala saat memakai platform ini.'

interface ChatMsg {
  id: string
  persistedId: string | null
  sender: 'user' | 'ai'
  content: string
  sources: SinebotSource[]
}

let localIdCounter = 0
function localId(prefix: string): string {
  localIdCounter += 1
  return `${prefix}-${Date.now()}-${localIdCounter}`
}

export default function SinebotChat({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, profile } = useAuth()
  const [view, setView] = useState<'chat' | 'history'>('chat')
  const [conversations, setConversations] = useState<SinebotConversation[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<SinebotError | null>(null)
  const [failedText, setFailedText] = useState<string | null>(null)
  const [feedbackSent, setFeedbackSent] = useState<Set<string>>(new Set())
  const [feedbackBusy, setFeedbackBusy] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Muat daftar riwayat saat panel dibuka (hanya untuk pengguna login).
  useEffect(() => {
    if (!open || !user) return
    let cancelled = false
    setHistoryLoading(true)
    setHistoryError(null)
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
  }, [open, user])

  // Muat pesan saat percakapan aktif dipilih.
  useEffect(() => {
    if (!open || !user || !activeId) return
    let cancelled = false
    setMessagesLoading(true)
    getMessages(activeId)
      .then((rows) => {
        if (cancelled) return
        // Pemuatan berhasil: bersihkan error panel yang mungkin tertinggal
        // dari kegagalan sementara sebelumnya (mis. feedback gagal) supaya
        // spanduk merah tidak menempel padahal semuanya sudah normal.
        setError(null)
        setMessages(
          rows
            .filter((m) => m.sender_type === 'user' || m.sender_type === 'ai')
            .map((m) => ({
              id: m.id,
              persistedId: m.id,
              sender: m.sender_type === 'ai' ? 'ai' : 'user',
              content: m.content,
              sources: m.sources,
            })),
        )
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            new SinebotError(
              'generic',
              'Pesan percakapan ini tidak bisa dimuat. Coba lagi sebentar lagi.',
            ),
          )
        }
      })
      .finally(() => {
        if (!cancelled) setMessagesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, user, activeId])

  // Gulir ke pesan terbaru.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, sending, open])

  // Fokus ke input saat panel dibuka.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  if (!open) return null

  const serviceDown = error?.code === 'not_active'

  function startNewConversation(): void {
    setActiveId(null)
    setMessages([])
    setError(null)
    setFailedText(null)
    setView('chat')
    inputRef.current?.focus()
  }

  function openConversation(id: string): void {
    // Klik entri riwayat yang SUDAH aktif tidak boleh menghapus transkrip:
    // setActiveId(id-yang-sama) tidak mengubah state, jadi effect pemuat
    // pesan tidak jalan lagi — sementara setMessages([]) sudah menghapus
    // yang tampil. Sebelum perbaikan ini, klik riwayat aktif selalu
    // menampilkan panel kosong (temuan verifikasi live Tahap 2 ronde 2).
    if (id === activeId) {
      setView('chat')
      return
    }
    setActiveId(id)
    setMessages([])
    setError(null)
    setFailedText(null)
    setView('chat')
  }

  async function handleDeleteConversation(id: string): Promise<void> {
    if (!window.confirm('Hapus percakapan ini? Riwayatnya tidak bisa dikembalikan.')) return
    try {
      await deleteConversation(id)
      setConversations((rows) => rows.filter((c) => c.id !== id))
      if (activeId === id) startNewConversation()
    } catch (err: unknown) {
      setHistoryError(
        err instanceof SinebotError
          ? err.message
          : 'Percakapan tidak bisa dihapus. Coba lagi nanti.',
      )
    }
  }

  async function handleSend(text: string): Promise<void> {
    const question = text.trim()
    if (!question || sending) return
    setInput('')
    setError(null)
    setFailedText(null)
    setSending(true)
    const userMsg: ChatMsg = {
      id: localId('local-user'),
      persistedId: null,
      sender: 'user',
      content: question,
      sources: [],
    }
    setMessages((prev) => [...prev, userMsg])
    try {
      // Pengguna login TANPA percakapan aktif (mis. riwayat kosong) harus
      // dibuatkan percakapannya dulu: Edge Function menolak conversation_id
      // null untuk pengguna login (400). Sebelum perbaikan ini, pesan
      // pertama pengguna login selalu gagal dengan error generik (temuan
      // verifikasi live Tahap 2, 23 Nov 2026). Tamu tetap memakai null —
      // percakapannya dibuat oleh Edge Function.
      let convId = activeId
      if (user && !convId) {
        const created = await createConversation(
          (profile?.role as SinebotRole | undefined) ?? 'siswa',
          question.slice(0, 60),
        )
        convId = created.id
        setActiveId(created.id)
      }
      const reply = await sendMessage(user ? convId : null, question)
      if (user && reply.conversation_id) {
        // Ambil ulang pesan tersimpan supaya jawaban AI punya id asli
        // (dibutuhkan tombol feedback) dan riwayat ikut terbarui. Bila
        // pemuatan ulang gagal (mis. tabel belum tersedia), jawaban tetap
        // ditampilkan dari respons Edge Function.
        setActiveId(reply.conversation_id)
        try {
          const rows = await getMessages(reply.conversation_id)
          setMessages(
            rows
              .filter((m) => m.sender_type === 'user' || m.sender_type === 'ai')
              .map((m) => ({
                id: m.id,
                persistedId: m.id,
                sender: m.sender_type === 'ai' ? 'ai' : 'user',
                content: m.content,
                sources: m.sources,
              })),
          )
          const fresh = await listConversations()
          setConversations(fresh)
        } catch {
          setMessages((prev) => [
            ...prev,
            {
              id: localId('local-ai'),
              persistedId: null,
              sender: 'ai',
              content: reply.reply,
              sources: reply.sources,
            },
          ])
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: localId('local-ai'),
            persistedId: null,
            sender: 'ai',
            content: reply.reply,
            sources: reply.sources,
          },
        ])
      }
      if (reply.quota_exhausted) {
        setError(
          new SinebotError(
            'quota_exhausted',
            'Kuota jawaban AI hari ini sudah habis, tapi pertanyaanmu tetap tersimpan. Hubungi admin bila pertanyaanmu mendesak.',
          ),
        )
      }
    } catch (err: unknown) {
      // Pertanyaan yang gagal dikirim dihapus dari daftar (tidak ada
      // duplikat saat "Coba Lagi") dan disimpan di failedText untuk retry.
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id))
      setFailedText(question)
      if (err instanceof SinebotError) {
        setError(err)
      } else {
        setError(
          new SinebotError(
            'generic',
            'SINEBOT sedang mengalami kendala. Coba lagi sebentar lagi.',
          ),
        )
      }
    } finally {
      setSending(false)
    }
  }

  async function handleFeedback(messageId: string, rating: 1 | -1): Promise<void> {
    if (feedbackBusy) return
    setFeedbackBusy(messageId)
    try {
      await submitFeedback(messageId, rating)
      setFeedbackSent((prev) => new Set(prev).add(messageId))
    } catch (err: unknown) {
      setError(
        err instanceof SinebotError
          ? err
          : new SinebotError('generic', 'Feedback tidak bisa dikirim. Coba lagi nanti.'),
      )
    } finally {
      setFeedbackBusy(null)
    }
  }

  function handleSubmit(e: FormEvent): void {
    e.preventDefault()
    void handleSend(input)
  }

  return (
    <div className="sinebot-panel" role="dialog" aria-label="Chat SINEBOT">
      <div className="sinebot-head">
        <span className="sinebot-avatar" aria-hidden="true">
          <Icon name="message" size={20} />
        </span>
        <div className="sinebot-head-text">
          <strong>SINEBOT</strong>
          <span className="sinebot-tagline">Your Filmmaking Assistant</span>
          <span className={`sinebot-status${serviceDown ? ' is-down' : ''}`}>
            {serviceDown ? 'Layanan belum aktif' : 'Siap membantu'}
          </span>
        </div>
        <div className="sinebot-head-actions">
          {user && (
            <button
              type="button"
              className="sinebot-icon-btn"
              aria-label={view === 'history' ? 'Kembali ke chat' : 'Lihat riwayat percakapan'}
              title={view === 'history' ? 'Kembali ke chat' : 'Riwayat percakapan'}
              onClick={() => setView(view === 'history' ? 'chat' : 'history')}
            >
              <Icon name="clock" size={18} />
            </button>
          )}
          {user && (
            <button
              type="button"
              className="sinebot-icon-btn"
              aria-label="Percakapan baru"
              title="Percakapan baru"
              onClick={startNewConversation}
            >
              <Icon name="plus" size={18} />
            </button>
          )}
          <button
            type="button"
            className="sinebot-icon-btn"
            aria-label="Tutup chat SINEBOT"
            onClick={onClose}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      </div>

      {view === 'history' && user ? (
        <div className="sinebot-history">
          <h2>Riwayat Percakapan</h2>
          {historyLoading ? (
            <p className="muted">Memuat riwayat…</p>
          ) : historyError ? (
            <p className="error-box">{historyError}</p>
          ) : conversations.length === 0 ? (
            <p className="muted">Belum ada percakapan. Mulai percakapan baru untuk bertanya ke SINEBOT.</p>
          ) : (
            <ul className="sinebot-history-list">
              {conversations.map((c) => (
                <li key={c.id} className={c.id === activeId ? 'is-active' : ''}>
                  <button
                    type="button"
                    className="sinebot-history-item"
                    onClick={() => openConversation(c.id)}
                  >
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
                  </button>
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
          )}
          <button type="button" className="btn btn-primary btn-block" onClick={startNewConversation}>
            Percakapan Baru
          </button>
        </div>
      ) : (
        <>
          <div className="sinebot-messages" ref={listRef} aria-live="polite">
            {messagesLoading ? (
              <p className="muted">Memuat pesan…</p>
            ) : (
              <>
                {messages.length === 0 && (
                  <div className="sinebot-msg sinebot-msg-ai">
                    <div className="sinebot-bubble">{WELCOME_TEXT}</div>
                    <div className="sinebot-quick" aria-label="Pertanyaan cepat">
                      {QUICK_PROMPTS.map((q) => (
                        <button
                          key={q}
                          type="button"
                          className="sinebot-chip"
                          disabled={sending}
                          onClick={() => void handleSend(q === 'Hubungi admin' ? 'Saya ingin menghubungi admin' : q)}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`sinebot-msg sinebot-msg-${m.sender}`}
                  >
                    <div className="sinebot-bubble">{m.content}</div>
                    {m.sender === 'ai' && m.sources.length > 0 && (
                      <div className="sinebot-sources" aria-label="Sumber panduan">
                        <span className="sinebot-sources-title">Sumber panduan:</span>
                        {m.sources.map((s) => (
                          <Link
                            key={s.id}
                            to={`/bantuan?q=${encodeURIComponent(s.title)}`}
                            className="sinebot-source-card"
                            onClick={onClose}
                          >
                            <Icon name="book" size={16} />
                            <span>
                              <strong>{s.title}</strong>
                              {s.category ? <span className="muted"> · {s.category}</span> : null}
                            </span>
                            <span className="sinebot-source-open">Buka panduan</span>
                          </Link>
                        ))}
                      </div>
                    )}
                    {m.sender === 'ai' && user && m.persistedId && (
                      <div className="sinebot-feedback">
                        {feedbackSent.has(m.persistedId) ? (
                          <span className="muted">Terima kasih atas feedback-mu.</span>
                        ) : (
                          <>
                            <span className="muted">Apakah jawaban ini membantu?</span>
                            <button
                              type="button"
                              className="sinebot-feedback-btn"
                              disabled={feedbackBusy === m.persistedId}
                              onClick={() => void handleFeedback(m.persistedId as string, 1)}
                            >
                              <Icon name="check" size={15} />
                              Membantu
                            </button>
                            <button
                              type="button"
                              className="sinebot-feedback-btn"
                              disabled={feedbackBusy === m.persistedId}
                              onClick={() => void handleFeedback(m.persistedId as string, -1)}
                            >
                              <Icon name="close" size={15} />
                              Tidak membantu
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {sending && (
                  <div className="sinebot-msg sinebot-msg-ai">
                    <div className="sinebot-bubble sinebot-typing">
                      SINEBOT sedang mengetik<span aria-hidden="true">…</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {error && (
            <div className="sinebot-error" role="alert">
              <p>{error.message}</p>
              <div className="sinebot-error-actions">
                {failedText && error.code !== 'not_active' && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={sending}
                    onClick={() => void handleSend(failedText)}
                  >
                    Coba Lagi
                  </button>
                )}
                <a className="btn btn-primary" href={sinebotAdminMailto('Butuh bantuan SINEVERSE')}>
                  Hubungi Admin
                </a>
              </div>
            </div>
          )}

          <form className="sinebot-input-row" onSubmit={handleSubmit}>
            <label className="sinebot-input-label" htmlFor="sinebot-input">
              Tulis pertanyaanmu
            </label>
            <input
              id="sinebot-input"
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tanya SINEBOT…"
              maxLength={1000}
              autoComplete="off"
              disabled={sending}
            />
            <button type="submit" className="btn btn-primary" disabled={sending || input.trim() === ''}>
              {sending ? 'Mengirim…' : 'Kirim'}
            </button>
          </form>
          {!user && (
            <p className="sinebot-guest-note">
              <Link to="/login" onClick={onClose}>
                Login
              </Link>{' '}
              untuk menyimpan riwayat percakapan dan bantuan seputar akunmu.
            </p>
          )}
        </>
      )}
    </div>
  )
}
