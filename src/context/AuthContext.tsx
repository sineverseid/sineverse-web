// SINEVERSE — auth state: session + profile, kept in sync with Supabase Auth.
//
// Registration relies on the database trigger (002/010): a profiles row is
// created automatically on signup, so the client never inserts into
// profiles. Supabase "Confirm email" is ON, so signUp returns no session
// until the user confirms via the email link or the 6-digit code
// (verifyOtp type 'signup'). Data pendaftaran lengkap dikirim lewat
// user_metadata; foto file dan lamaran mentor diselesaikan setelah masuk
// (lihat lib/registration.ts) karena butuh sesi terautentikasi.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { fetchProfile, supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'
import {
  completePendingRegistration,
  loadPendingRegistration,
} from '../lib/registration'

export interface SignUpInput {
  name: string
  email: string
  password: string
  /** Data profil lengkap (tanpa kata sandi) — disimpan ke user_metadata. */
  metadata?: Record<string, unknown>
}

interface AuthContextValue {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  /** Pemberitahuan jujur bila penyelesaian pendaftaran tertunda gagal
   *  (mis. foto belum terunggah karena bucket belum ada). */
  registrationNotice: string | null
  dismissRegistrationNotice: () => void
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (
    input: SignUpInput,
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>
  /** Verifikasi kode 6 digit dari email konfirmasi pendaftaran. */
  verifyOtpCode: (email: string, code: string) => Promise<{ error: string | null; user: User | null }>
  /** Kirim ulang email konfirmasi pendaftaran. */
  resendConfirmation: (email: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  changePassword: (newPassword: string) => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function translateAuthError(message: string): string {
  if (message.includes('Invalid login credentials')) {
    return 'Email atau kata sandi salah. Periksa kembali lalu coba lagi.'
  }
  if (message.includes('Email not confirmed')) {
    return 'Email belum dikonfirmasi. Periksa kotak masuk email kamu untuk tautan konfirmasi.'
  }
  if (message.includes('User already registered')) {
    return 'Email ini sudah terdaftar. Silakan masuk.'
  }
  if (message.includes('Password should be at least')) {
    return 'Kata sandi minimal 8 karakter.'
  }
  if (message.includes('Token has expired') || message.includes('expired')) {
    return 'Kode sudah kedaluwarsa. Minta kode baru lewat tombol kirim ulang.'
  }
  if (
    message.toLowerCase().includes('invalid') &&
    (message.toLowerCase().includes('otp') || message.toLowerCase().includes('token'))
  ) {
    return 'Kode salah. Periksa lagi kode 6 digit dari email kamu.'
  }
  if (message.includes('Email rate limit exceeded')) {
    return 'Terlalu sering meminta email. Tunggu sebentar lalu coba lagi.'
  }
  if (message.includes('Unable to validate email address')) {
    return 'Alamat email tidak valid.'
  }
  if (message.toLowerCase().includes('network') || message.toLowerCase().includes('fetch')) {
    return 'Tidak dapat terhubung ke server. Periksa koneksi internet kamu.'
  }
  return message
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [registrationNotice, setRegistrationNotice] = useState<string | null>(null)

  const loadProfile = useCallback(async (userId: string) => {
    try {
      const p = await fetchProfile(userId)
      setProfile(p)
    } catch {
      setProfile(null)
    }
  }, [])

  // Pengaman jalur tautan email: pengguna yang mengklik tautan konfirmasi
  // kembali ke aplikasi dengan sesi aktif (bukan di halaman pendaftaran).
  // Bila ada data pendaftaran yang tertunda untuk email ini, selesaikan
  // (unggah foto titipan, lengkapi profil, kirim lamaran mentor). Hanya
  // berjalan bila kuncinya ada; kunci dihapus setelah sukses.
  const runPendingCompletion = useCallback(async (u: User) => {
    if (!u.email) return
    if (!loadPendingRegistration(u.email)) return
    try {
      await completePendingRegistration(u.id, u.email)
      await loadProfile(u.id)
    } catch (err) {
      setRegistrationNotice(
        err instanceof Error
          ? err.message
          : 'Pendaftaran belum lengkap. Lengkapi lewat menu Profil.',
      )
    }
  }, [loadProfile])

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setUser(data.session?.user ?? null)
      if (data.session?.user) {
        void loadProfile(data.session.user.id)
        void runPendingCompletion(data.session.user)
      }
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return
      setSession(newSession)
      setUser(newSession?.user ?? null)
      if (newSession?.user) {
        void loadProfile(newSession.user.id)
        void runPendingCompletion(newSession.user)
      } else setProfile(null)
    })
    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [loadProfile, runPendingCompletion])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? translateAuthError(error.message) : null }
  }, [])

  const signUp = useCallback(async (input: SignUpInput) => {
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { name: input.name, ...(input.metadata ?? {}) } },
    })
    if (error) return { error: translateAuthError(error.message), needsConfirmation: false }
    // With email confirmation ON, there is no session until the user clicks
    // the confirmation link or confirms the 6-digit code.
    return { error: null, needsConfirmation: !data.session }
  }, [])

  const verifyOtpCode = useCallback(async (email: string, code: string) => {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'signup',
    })
    return { error: error ? translateAuthError(error.message) : null, user: data.user ?? null }
  }, [])

  const resendConfirmation = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    return { error: error ? translateAuthError(error.message) : null }
  }, [])

  const dismissRegistrationNotice = useCallback(() => setRegistrationNotice(null), [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setProfile(null)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id)
  }, [user, loadProfile])

  const changePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    return { error: error ? translateAuthError(error.message) : null }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      profile,
      loading,
      registrationNotice,
      dismissRegistrationNotice,
      signIn,
      signUp,
      verifyOtpCode,
      resendConfirmation,
      signOut,
      refreshProfile,
      changePassword,
    }),
    [
      user,
      session,
      profile,
      loading,
      registrationNotice,
      dismissRegistrationNotice,
      signIn,
      signUp,
      verifyOtpCode,
      resendConfirmation,
      signOut,
      refreshProfile,
      changePassword,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider')
  return ctx
}
