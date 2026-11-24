// src/lib/moderation.ts — Fase 6 (Moderasi & Keamanan).
//
// Klien untuk tabel migrasi 070: user_blocks, moderation_actions,
// moderation_permissions, moderation_filters, plus RPC set_content_hidden,
// log_content_blocked, log_admin_view_private_room. Laporan memakai tabel
// moderation_reports yang sudah ada (008) — TIDAK diduplikat.
//
// Catatan keamanan: semua penegakan ada di server (trigger + RLS + RPC
// SECURITY DEFINER). Fungsi-fungsi di sini hanya memanggilnya; bila
// server menolak, error trigger diteruskan apa adanya lewat friendlyError
// di tiap lib pengirim (mentorGroup / projectChat / studentCommunity /
// announcements) supaya pesannya jelas di UI.

import { supabase, fetchProfileNames } from './supabase';

export type ModerationTargetType =
  | 'mentor_group_message'
  | 'community_post'
  | 'community_reply'
  | 'project_chat_message'
  | 'announcement'
  | 'user';

export interface UserBlock {
  id: string;
  blocker_id: string;
  blocked_id: string;
  reason: string | null;
  created_at: string;
  blocked_name?: string;
}

export interface ModerationAction {
  id: string;
  actor_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  reason: string | null;
  created_at: string;
  actor_name?: string;
}

export interface MentorModerationPermission {
  mentor_id: string;
  can_pin: boolean;
  can_hide: boolean;
  can_warn: boolean;
  updated_by: string | null;
  updated_at: string;
  mentor_name?: string;
}

export interface ModerationFilter {
  id: string;
  pattern: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface MentorLite {
  id: string;
  name: string | null;
}

const CONTENT_TABLES = [
  'mentor_group_messages',
  'community_posts',
  'community_post_replies',
  'project_chat_messages',
  'announcements',
] as const;

export type ContentTable = (typeof CONTENT_TABLES)[number];

export const TARGET_TABLE: Record<ModerationTargetType, ContentTable | null> = {
  mentor_group_message: 'mentor_group_messages',
  community_post: 'community_posts',
  community_reply: 'community_post_replies',
  project_chat_message: 'project_chat_messages',
  announcement: 'announcements',
  user: null,
};

export function targetTypeLabel(t: string | null | undefined): string {
  switch (t) {
    case 'mentor_group_message':
      return 'Pesan grup mentor';
    case 'community_post':
      return 'Postingan community';
    case 'community_reply':
      return 'Balasan community';
    case 'project_chat_message':
      return 'Pesan chat proyek';
    case 'announcement':
      return 'Pengumuman';
    case 'user':
      return 'Pengguna';
    case 'community':
      return 'Community';
    case 'profile':
      return 'Pengguna';
    default:
      return t || 'Konten';
  }
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Kamu harus masuk dulu.');
  return data.user.id;
}

// ---------------------------------------------------------------------------
// Laporan (moderation_reports, 008)
// ---------------------------------------------------------------------------

export async function reportContent(
  targetType: ModerationTargetType,
  targetId: string,
  reason: string,
): Promise<void> {
  const reporterId = await currentUserId();
  const { error } = await supabase.from('moderation_reports').insert({
    target_type: targetType,
    target_id: targetId,
    reporter_id: reporterId,
    reason: reason.trim(),
    status: 'open',
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Blokir pengguna (admin)
// ---------------------------------------------------------------------------

export async function fetchUserBlocks(): Promise<UserBlock[]> {
  const { data, error } = await supabase
    .from('user_blocks')
    .select('id, blocker_id, blocked_id, reason, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as UserBlock[];
  const names = await fetchProfileNames(rows.map((r) => r.blocked_id));
  return rows.map((r) => ({ ...r, blocked_name: names.get(r.blocked_id) ?? r.blocked_id }));
}

export async function blockUser(userId: string, reason: string): Promise<void> {
  const adminId = await currentUserId();
  const { error: blockError } = await supabase.from('user_blocks').insert({
    blocker_id: adminId,
    blocked_id: userId,
    reason: reason.trim() || null,
  });
  if (blockError) throw blockError;
  const { error: actionError } = await supabase.from('moderation_actions').insert({
    actor_id: adminId,
    action: 'blokir',
    target_type: 'user',
    target_id: userId,
    reason: reason.trim() || null,
  });
  if (actionError) throw actionError;
}

export async function unblockUser(blockId: string, userId: string): Promise<void> {
  const adminId = await currentUserId();
  const { error: deleteError } = await supabase.from('user_blocks').delete().eq('id', blockId);
  if (deleteError) throw deleteError;
  const { error: actionError } = await supabase.from('moderation_actions').insert({
    actor_id: adminId,
    action: 'buka_blokir',
    target_type: 'user',
    target_id: userId,
    reason: null,
  });
  if (actionError) throw actionError;
}

export async function fetchMentors(): Promise<MentorLite[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('role', 'mentor')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as MentorLite[];
}

// ---------------------------------------------------------------------------
// Riwayat tindakan moderasi (admin)
// ---------------------------------------------------------------------------

export async function fetchModerationActions(): Promise<ModerationAction[]> {
  const { data, error } = await supabase
    .from('moderation_actions')
    .select('id, actor_id, action, target_type, target_id, reason, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  const rows = (data ?? []) as ModerationAction[];
  const names = await fetchProfileNames(rows.map((r) => r.actor_id));
  return rows.map((r) => ({ ...r, actor_name: names.get(r.actor_id) ?? r.actor_id }));
}

export async function createModerationAction(
  action: string,
  targetType: ModerationTargetType | null,
  targetId: string | null,
  reason: string | null,
): Promise<void> {
  const actorId = await currentUserId();
  const { error } = await supabase.from('moderation_actions').insert({
    actor_id: actorId,
    action,
    target_type: targetType,
    target_id: targetId,
    reason: reason?.trim() || null,
  });
  if (error) throw error;
}

// Peringatan ke pengguna (admin; mentor butuh can_warn — ditegakkan RLS).
export async function warnUser(userId: string, reason: string): Promise<void> {
  await createModerationAction('peringatan', 'user', userId, reason);
}

// ---------------------------------------------------------------------------
// Sembunyikan / tampilkan kembali (admin, atau mentor dengan can_hide)
// ---------------------------------------------------------------------------

export async function hideContent(
  table: ContentTable,
  contentId: string,
  hidden: boolean,
  reason?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('set_content_hidden', {
    p_table: table,
    p_content_id: contentId,
    p_hidden: hidden,
    p_reason: reason?.trim() || null,
  });
  if (error) throw error;
}

// Hapus paksa oleh admin (hard delete; kebijakan DELETE admin ada di
// kelima tabel konten). Mencatat tindakan setelah berhasil.
export async function forceDeleteContent(
  table: ContentTable,
  targetType: ModerationTargetType,
  contentId: string,
  reason?: string | null,
): Promise<void> {
  const { error } = await supabase.from(table).delete().eq('id', contentId);
  if (error) throw error;
  await createModerationAction('hapus_pesan', targetType, contentId, reason ?? null);
}

// ---------------------------------------------------------------------------
// Hak moderasi per mentor (admin mengatur; mentor membaca barisnya sendiri)
// ---------------------------------------------------------------------------

export async function fetchMentorPermissions(): Promise<MentorModerationPermission[]> {
  const { data, error } = await supabase
    .from('moderation_permissions')
    .select('mentor_id, can_pin, can_hide, can_warn, updated_by, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as MentorModerationPermission[];
  const names = await fetchProfileNames(rows.map((r) => r.mentor_id));
  return rows.map((r) => ({ ...r, mentor_name: names.get(r.mentor_id) ?? r.mentor_id }));
}

export async function fetchMyModerationPermission(): Promise<MentorModerationPermission | null> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('moderation_permissions')
    .select('mentor_id, can_pin, can_hide, can_warn, updated_by, updated_at')
    .eq('mentor_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as MentorModerationPermission | null;
}

export async function setMentorPermission(
  mentorId: string,
  patch: Partial<Pick<MentorModerationPermission, 'can_pin' | 'can_hide' | 'can_warn'>>,
): Promise<void> {
  const adminId = await currentUserId();
  const { error } = await supabase.from('moderation_permissions').upsert(
    {
      mentor_id: mentorId,
      can_pin: patch.can_pin ?? true,
      can_hide: patch.can_hide ?? false,
      can_warn: patch.can_warn ?? false,
      updated_by: adminId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'mentor_id' },
  );
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Filter konten (admin)
// ---------------------------------------------------------------------------

export async function fetchModerationFilters(): Promise<ModerationFilter[]> {
  const { data, error } = await supabase
    .from('moderation_filters')
    .select('id, pattern, is_active, created_by, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ModerationFilter[];
}

export async function createModerationFilter(pattern: string): Promise<void> {
  const adminId = await currentUserId();
  const { error } = await supabase.from('moderation_filters').insert({
    pattern: pattern.trim(),
    is_active: true,
    created_by: adminId,
  });
  if (error) throw error;
}

export async function setModerationFilterActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase
    .from('moderation_filters')
    .update({ is_active: active })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteModerationFilter(id: string): Promise<void> {
  const { error } = await supabase.from('moderation_filters').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Audit (best-effort dari client — tidak pernah melempar ke UI)
// ---------------------------------------------------------------------------

// Dipanggil saat kirim ditolak filter konten: trigger menolak di transaksi
// yang sama, jadi pencatatan harus dilakukan client setelahnya.
export async function logContentBlocked(
  targetType: string,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.rpc('log_content_blocked', {
      p_target_type: targetType,
      p_target_id: null,
      p_detail: detail,
    });
  } catch {
    // best-effort: kegagalan audit tidak boleh mengganggu pengguna.
  }
}

// Admin membuka halaman chat/komunitas yang BUKAN anggotanya. Dipanggil
// sekali per mount (guard ref di halaman), bukan per render.
export async function logAdminViewPrivateRoom(
  roomType: 'mentor_group' | 'community' | 'project_chat',
  roomId: string,
): Promise<void> {
  try {
    await supabase.rpc('log_admin_view_private_room', {
      p_room_type: roomType,
      p_room_id: roomId,
    });
  } catch {
    // best-effort.
  }
}
