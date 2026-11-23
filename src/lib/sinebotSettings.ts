// SINEVERSE — SINEBOT admin AI Settings (Tahap 5, frontend).
//
// Wrapper RPC admin untuk pengaturan AI (tabel ai_settings). RPC
// didefinisikan oleh pekerja backend Tahap 5 (migrasi 054) — nama fungsi
// dan parameter di bawah ini MENGIKUTI kontrak persis.
//
// Kontrak RPC:
// - admin_get_settings() -> array {key, value, updated_at, updated_by}
// - admin_set_setting(p_key, p_value) -> objek baris ter-update
//
// Kunci API TIDAK tersimpan di sini dan tidak pernah ditampilkan —
// kunci hanya ada di server (Supabase Secrets). Nilai `value` di
// ai_settings adalah JSON (string, number, objek, atau array) dan
// diteruskan apa adanya ke RPC; parsing per kunci dilakukan di halaman
// pengaturan (AdminSinebotSettingsTab), bukan di wrapper ini.
import { supabase } from './supabase'

export interface AiSetting {
  key: string
  value: unknown
  updated_at: string
  updated_by: string | null
}

export class SettingsError extends Error {
  code: 'not_admin' | 'not_ready' | 'network' | 'unauthorized' | 'generic'

  constructor(code: SettingsError['code'], message: string) {
    super(message)
    this.name = 'SettingsError'
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * Pesan ramah untuk kegagalan RPC pengaturan. Pesan mentah PostgREST /
 * Supabase tidak ditampilkan apa adanya ke admin.
 */
function friendlyRpcError(error: { message: string; code?: string }): SettingsError {
  const msg = error.message.toLowerCase()
  const code = String(error.code ?? '')
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return new SettingsError(
      'network',
      'Tidak dapat terhubung ke SINEVERSE. Periksa koneksi internet lalu coba lagi.',
    )
  }
  // RPC belum ada di database (migrasi 054 belum di-apply): bukan salah admin.
  if (
    code === '42883' ||
    code === '42P01' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the function') ||
    (msg.includes('relation') && msg.includes('does not exist'))
  ) {
    return new SettingsError(
      'not_ready',
      'Pengaturan AI belum aktif di server. Migrasi Tahap 5 (054) belum diterapkan — beri tahu koordinator.',
    )
  }
  if (
    msg.includes('not admin') ||
    msg.includes('only admin') ||
    msg.includes('is_admin')
  ) {
    return new SettingsError(
      'not_admin',
      'Akunmu bukan admin, jadi pengaturan AI tidak bisa diubah.',
    )
  }
  if (code === 'PGRST301' || code === '42501' || msg.includes('permission denied')) {
    return new SettingsError(
      'unauthorized',
      'Kamu tidak punya izin untuk mengubah pengaturan AI. Login ulang sebagai admin bila ini keliru.',
    )
  }
  return new SettingsError('generic', 'Pengaturan AI gagal dimuat/disimpan. Coba lagi sebentar lagi.')
}

function parseSettingRow(row: Record<string, unknown>): AiSetting {
  return {
    key: asString(row.key),
    value: row.value ?? null,
    updated_at: asString(row.updated_at),
    updated_by: asStringOrNull(row.updated_by),
  }
}

/** Ambil seluruh pengaturan AI sebagai daftar baris {key, value, ...}. */
export async function getSettings(): Promise<AiSetting[]> {
  const { data, error } = await supabase.rpc('admin_get_settings')
  if (error) throw friendlyRpcError(error)
  if (!Array.isArray(data)) return []
  return data.filter(isRecord).map(parseSettingRow)
}

/** Simpan satu kunci pengaturan. Mengembalikan baris yang ter-update. */
export async function setSetting(key: string, value: unknown): Promise<AiSetting> {
  const { data, error } = await supabase.rpc('admin_set_setting', {
    p_key: key,
    p_value: value,
  })
  if (error) throw friendlyRpcError(error)
  if (isRecord(data)) return parseSettingRow(data)
  if (Array.isArray(data)) {
    const row = data.find(isRecord)
    if (row) return parseSettingRow(row)
  }
  // RPC mengembalikan baris ter-update menurut kontrak; bila bentuknya
  // tidak dikenali, kembalikan apa yang baru saja dikirim supaya UI
  // tetap bisa menampilkan nilai baru (updated_at dikosongkan).
  return { key, value, updated_at: '', updated_by: null }
}
