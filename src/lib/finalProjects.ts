// SINEVERSE — Final Project workspace (Tahap 5, migrasi 016).
// Tipe + helper untuk final_projects dan tabel turunannya. Tipe didefinisikan
// di sini (bukan src/lib/types.ts yang sedang frozen untuk deploy Tahap 3)
// — setelah deploy, tipe ini bisa dipindah ke types.ts bila diinginkan.
// Alur status: draft → in_progress → submitted (film dikirim untuk dinilai)
// → under_review → revision / approved → published.
// 'published' berarti karya final sudah dipublikasikan: film dimasukkan ke
// antrean penilaian admin Showcase (status film 'draft') dan proyek
// ditandai published. Film baru tampil di Showcase setelah admin menyetujui.
import { supabase, uploadToBucket } from './supabase'

export type FinalProjectStatus =
  | 'draft'
  | 'in_progress'
  | 'submitted'
  | 'under_review'
  | 'revision'
  | 'approved'
  | 'published'
  | 'rejected'

export const FINAL_PROJECT_STATUS_LABEL: Record<FinalProjectStatus, string> = {
  draft: 'Draf',
  in_progress: 'Dikerjakan',
  submitted: 'Dikirim untuk dinilai',
  under_review: 'Sedang dinilai',
  revision: 'Perlu revisi',
  approved: 'Disetujui mentor',
  published: 'Dipublikasikan',
  rejected: 'Ditolak',
}

/** 10 langkah produksi film pendek (master prompt §8). */
export const FINAL_PROJECT_STEPS: { step: number; title: string; hint: string }[] = [
  { step: 1, title: 'Mengembangkan ide', hint: 'Premis, tema, dan logline film.' },
  { step: 2, title: 'Menulis skenario', hint: 'Naskah lengkap — unggah sebagai berkas.' },
  { step: 3, title: 'Menyusun storyboard', hint: 'Panel visual per adegan — unggah sebagai berkas.' },
  { step: 4, title: 'Membentuk tim produksi', hint: 'Undang anggota lintas sekolah.' },
  { step: 5, title: 'Menentukan sutradara dan kru', hint: 'Bagi jobdesk tiap anggota tim.' },
  { step: 6, title: 'Menyusun production plan', hint: 'Shot list dan jadwal produksi.' },
  { step: 7, title: 'Melaksanakan shooting', hint: 'Produksi sesuai jadwal.' },
  { step: 8, title: 'Editing dan sound design', hint: 'Rough cut, final cut, tata suara.' },
  { step: 9, title: 'Menyelesaikan film', hint: 'Film final siap dinilai.' },
  { step: 10, title: 'Presentasi dan evaluasi', hint: 'Presentasi bersama mentor.' },
]

export interface FinalProject {
  id: string
  title: string
  description: string | null
  owner_id: string
  mentor_id: string | null
  school_id: string | null
  status: FinalProjectStatus
  film_id: string | null
  created_at: string
  updated_at: string
}

export interface FinalProjectMember {
  id: string
  project_id: string
  user_id: string
  role: string | null
  created_at: string
}

export type FinalProjectTaskStatus = 'todo' | 'doing' | 'done'

export const TASK_STATUS_LABEL: Record<FinalProjectTaskStatus, string> = {
  todo: 'Rencana',
  doing: 'Dikerjakan',
  done: 'Selesai',
}

export interface FinalProjectTask {
  id: string
  project_id: string
  title: string
  description: string | null
  step: number
  status: FinalProjectTaskStatus
  assignee_id: string | null
  due_date: string | null
  order_index: number
  created_at: string
}

export type FinalProjectFileKind = 'screenplay' | 'storyboard' | 'shot_list' | 'schedule' | 'other'

export const FILE_KIND_LABEL: Record<FinalProjectFileKind, string> = {
  screenplay: 'Skenario',
  storyboard: 'Storyboard',
  shot_list: 'Shot List',
  schedule: 'Jadwal Produksi',
  other: 'Lainnya',
}

export interface FinalProjectFile {
  id: string
  project_id: string
  file_path: string
  file_name: string
  file_size: number | null
  kind: FinalProjectFileKind
  uploaded_by: string | null
  uploaded_at: string
}

export interface FinalProjectReview {
  id: string
  project_id: string
  reviewer_id: string
  score: number | null
  feedback: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Proyek yang saya miliki atau saya ikuti sebagai anggota tim. */
export async function fetchMyFinalProjects(userId: string): Promise<FinalProject[]> {
  const [owned, member] = await Promise.all([
    (async () => {
      const { data, error } = await supabase
        .from('final_projects')
        .select('*')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as FinalProject[]
    })(),
    (async () => {
      const { data, error } = await supabase
        .from('final_project_members')
        .select('project_id')
        .eq('user_id', userId)
      if (error) throw error
      const ids = ((data ?? []) as { project_id: string }[]).map((r) => r.project_id)
      if (ids.length === 0) return [] as FinalProject[]
      const { data: rows, error: pErr } = await supabase
        .from('final_projects')
        .select('*')
        .in('id', ids)
        .order('created_at', { ascending: false })
      if (pErr) throw pErr
      return (rows ?? []) as FinalProject[]
    })(),
  ])
  const merged = new Map<string, FinalProject>()
  for (const p of [...owned, ...member]) merged.set(p.id, p)
  return [...merged.values()].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

/** Proyek yang dibimbing mentor ini — untuk tampilan review mentor (K14).
 *  RLS select mengizinkan mentor membaca proyek yang mentor_id-nya dirinya. */
export async function fetchMentoredFinalProjects(mentorId: string): Promise<FinalProject[]> {
  const { data, error } = await supabase
    .from('final_projects')
    .select('*')
    .eq('mentor_id', mentorId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as FinalProject[]
}

/** Proyek yang sudah dikirim untuk dinilai — untuk tampilan review admin (K14). */
export async function fetchSubmittedFinalProjects(): Promise<FinalProject[]> {
  const { data, error } = await supabase
    .from('final_projects')
    .select('*')
    .in('status', ['submitted', 'under_review', 'revision', 'approved'])
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as FinalProject[]
}

/** Proyek yang sudah dipublikasikan (untuk semua anggota). */
export async function fetchPublishedFinalProjects(): Promise<FinalProject[]> {
  const { data, error } = await supabase
    .from('final_projects')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as FinalProject[]
}

export async function fetchFinalProject(id: string): Promise<FinalProject | null> {
  const { data, error } = await supabase.from('final_projects').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as FinalProject | null
}

export async function fetchProjectMembers(projectId: string): Promise<FinalProjectMember[]> {
  const { data, error } = await supabase
    .from('final_project_members')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as FinalProjectMember[]
}

export async function fetchProjectTasks(projectId: string): Promise<FinalProjectTask[]> {
  const { data, error } = await supabase
    .from('final_project_tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('step', { ascending: true })
    .order('order_index', { ascending: true })
  if (error) throw error
  return (data ?? []) as FinalProjectTask[]
}

export async function fetchProjectFiles(projectId: string): Promise<FinalProjectFile[]> {
  const { data, error } = await supabase
    .from('final_project_files')
    .select('*')
    .eq('project_id', projectId)
    .order('uploaded_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as FinalProjectFile[]
}

export async function fetchProjectReviews(projectId: string): Promise<FinalProjectReview[]> {
  const { data, error } = await supabase
    .from('final_project_reviews')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as FinalProjectReview[]
}

/** Jumlah course berbeda yang sudah diselesaikan siswa (sertifikat course).
 *  Dipakai sebagai panduan "X/10 course selesai" — bukan gerbang keras. */
export async function fetchMyCompletedCourseCount(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('certificates')
    .select('course_id')
    .eq('user_id', userId)
    .eq('type', 'course')
  if (error) throw error
  return new Set(((data ?? []) as { course_id: string }[]).map((r) => r.course_id)).size
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createFinalProject(input: {
  title: string
  description: string | null
  ownerId: string
  mentorId: string | null
}): Promise<FinalProject> {
  const { data, error } = await supabase
    .from('final_projects')
    .insert({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      owner_id: input.ownerId,
      mentor_id: input.mentorId,
      status: 'draft',
    })
    .select()
    .single()
  if (error) throw error
  return data as FinalProject
}

export async function updateProjectStatus(
  projectId: string,
  status: FinalProjectStatus,
): Promise<void> {
  const { error } = await supabase
    .from('final_projects')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', projectId)
  if (error) throw error
}

export async function setProjectMentor(projectId: string, mentorId: string | null): Promise<void> {
  const { error } = await supabase
    .from('final_projects')
    .update({ mentor_id: mentorId, updated_at: new Date().toISOString() })
    .eq('id', projectId)
  if (error) throw error
}

export async function deleteFinalProject(projectId: string): Promise<void> {
  // Hapus objek Storage dulu (best-effort), baru baris proyek — kalau tidak,
  // berkas proyek akan yatim di bucket project-files.
  const files = await fetchProjectFiles(projectId)
  if (files.length > 0) {
    await supabase.storage
      .from('project-files')
      .remove(files.map((f) => f.file_path))
      .catch(() => undefined)
  }
  const { error } = await supabase.from('final_projects').delete().eq('id', projectId)
  if (error) throw error
}

export async function addProjectMember(
  projectId: string,
  userId: string,
  role: string | null,
): Promise<FinalProjectMember> {
  const { data, error } = await supabase
    .from('final_project_members')
    .insert({ project_id: projectId, user_id: userId, role: role?.trim() || null })
    .select()
    .single()
  if (error) throw error
  return data as FinalProjectMember
}

export async function updateMemberRole(memberId: string, role: string | null): Promise<void> {
  const { error } = await supabase
    .from('final_project_members')
    .update({ role: role?.trim() || null })
    .eq('id', memberId)
  if (error) throw error
}

export async function removeProjectMember(memberId: string): Promise<void> {
  const { error } = await supabase.from('final_project_members').delete().eq('id', memberId)
  if (error) throw error
}

export async function createProjectTask(input: {
  projectId: string
  title: string
  description: string | null
  step: number
  assigneeId: string | null
  dueDate: string | null
}): Promise<FinalProjectTask> {
  const { data, error } = await supabase
    .from('final_project_tasks')
    .insert({
      project_id: input.projectId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      step: input.step,
      status: 'todo',
      assignee_id: input.assigneeId,
      due_date: input.dueDate || null,
    })
    .select()
    .single()
  if (error) throw error
  return data as FinalProjectTask
}

export async function updateTaskStatus(
  taskId: string,
  status: FinalProjectTaskStatus,
): Promise<void> {
  const { error } = await supabase.from('final_project_tasks').update({ status }).eq('id', taskId)
  if (error) throw error
}

export async function deleteProjectTask(taskId: string): Promise<void> {
  const { error } = await supabase.from('final_project_tasks').delete().eq('id', taskId)
  if (error) throw error
}

/** Unggah berkas ke bucket project-files lalu catat di final_project_files.
 *  Mengembalikan null bila bucket belum tersedia (pemanggil menampilkan
 *  pesan jujur, mengikuti pola ProjectDetailPage). */
export async function uploadProjectFile(
  projectId: string,
  file: File,
  kind: FinalProjectFileKind,
  uploadedBy: string,
): Promise<FinalProjectFile | null> {
  const path = `${projectId}/final/${Date.now()}-${file.name}`
  const url = await uploadToBucket('project-files', path, file)
  if (url === null) return null
  const { data, error } = await supabase
    .from('final_project_files')
    .insert({
      project_id: projectId,
      file_path: path,
      file_name: file.name,
      file_size: file.size,
      kind,
      uploaded_by: uploadedBy,
    })
    .select()
    .single()
  if (error) throw error
  return data as FinalProjectFile
}

export async function deleteProjectFile(fileId: string): Promise<void> {
  // Hapus objek Storage dulu (best-effort), baru baris DB — kalau tidak,
  // berkas akan yatim di bucket project-files.
  const { data } = await supabase
    .from('final_project_files')
    .select('file_path')
    .eq('id', fileId)
    .maybeSingle()
  const path = (data as { file_path?: string } | null)?.file_path
  if (path) {
    await supabase.storage
      .from('project-files')
      .remove([path])
      .catch(() => undefined)
  }
  const { error } = await supabase.from('final_project_files').delete().eq('id', fileId)
  if (error) throw error
}

export async function addProjectReview(input: {
  projectId: string
  reviewerId: string
  score: number | null
  feedback: string | null
}): Promise<FinalProjectReview> {
  const { data, error } = await supabase
    .from('final_project_reviews')
    .insert({
      project_id: input.projectId,
      reviewer_id: input.reviewerId,
      score: input.score,
      feedback: input.feedback?.trim() || null,
    })
    .select()
    .single()
  if (error) throw error
  return data as FinalProjectReview
}

/** Publikasikan ke Showcase via RPC publish_final_project (migrasi 016):
 *  insert baris film (status 'draft' — masuk antrean penilaian admin,
 *  mengikuti alur Showcase yang sudah ada) + tautkan ke proyek + tandai
 *  proyek 'published', semua dalam satu transaksi. Film baru tampil di
 *  Showcase setelah admin menyetujuinya. */
export async function publishProjectToShowcase(input: {
  project: FinalProject
  filmUrl: string
  posterUrl: string
  description: string | null
}): Promise<{ filmId: string }> {
  const { data, error } = await supabase.rpc('publish_final_project', {
    p_project_id: input.project.id,
    p_film_url: input.filmUrl.trim(),
    p_poster_url: input.posterUrl,
    p_description: input.description?.trim() || null,
  })
  if (error) throw error
  const filmId = data as string | null
  if (!filmId) throw new Error('RPC publish_final_project tidak mengembalikan id film.')
  return { filmId }
}
