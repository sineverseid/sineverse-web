// SINEVERSE — auth state: session + profile, kept in sync with Supabase Auth.
//
// Registration relies on the database trigger (002): a profiles row is
// created automatically on signup, so the client never inserts into
// profiles. Supabase "Confirm email" is ON, so signUp returns no session
// until the user confirms via the email link.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { fetchProfile, supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

interface AuthContextValue {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (
    name: string,
    email: string,
    password: string,
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>
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
    return 'Kata sandi minimal 6 karakter.'
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

  const loadProfile = useCallback(async (userId: string) => {
    try {
      const p = await fetchProfile(userId)
      setProfile(p)
    } catch {
      setProfile(null)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setUser(data.session?.user ?? null)
      if (data.session?.user) void loadProfile(data.session.user.id)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return
      setSession(newSession)
      setUser(newSession?.user ?? null)
      if (newSession?.user) void loadProfile(newSession.user.id)
      else setProfile(null)
    })
    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? translateAuthError(error.message) : null }
  }, [])

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })
    if (error) return { error: translateAuthError(error.message), needsConfirmation: false }
    // With email confirmation ON, there is no session until the user clicks
    // the confirmation link.
    return { error: null, needsConfirmation: !data.session }
  }, [])

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
    () => ({ user, session, profile, loading, signIn, signUp, signOut, refreshProfile, changePassword }),
    [user, session, profile, loading, signIn, signUp, signOut, refreshProfile, changePassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider')
  return ctx
}
