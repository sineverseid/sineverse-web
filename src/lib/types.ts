// SINEVERSE — shared row types for migrations 003–008.
// Migrations 003–008 are written but NOT applied live yet (only 001–002 +
// 12 tables exist). Every type below mirrors the written schema exactly;
// the UI must degrade gracefully when a table is absent (see guarded.ts).
// Never invent rows: pages render only what Supabase returns.

export type Role = 'siswa' | 'mentor' | 'admin'

export interface Profile {
  id: string
  email: string | null
  name: string | null
  role: Role
  photo_url: string | null
  phone: string | null
  city: string | null
  bio?: string | null
  birth_date?: string | null
  gender?: string | null
  address?: string | null
  /** Migrasi 010 — data pendaftaran artefak (jalur Anggota). */
  school?: string | null
  kelas?: string | null
  // Migration 005 (Crew Finder) — public-safe fields only; never email.
  skills?: string[] | null
  interests?: string[] | null
  availability?: string | null
  is_open_to_crew?: boolean | null
  created_at: string
}

export interface Course {
  id: string
  title: string
  description: string | null
  category: string | null
  level: string | null
  mentor_id: string | null
  cover_url: string | null
  created_at: string
  enrollment_key?: string | null
  passing_grade?: number | null
}

export interface Module {
  id: string
  course_id: string
  title: string
  order_index: number
  created_at: string
  is_published?: boolean | null
  release_label?: string | null
}

export interface Lesson {
  id: string
  module_id: string
  title: string
  order_index: number
  video_url: string | null
  content: string | null
  created_at: string
  lesson_code?: string | null
}

export interface Enrollment {
  id: string
  user_id: string
  course_id: string
  enrolled_at: string
}

export type LessonProgressStatus = 'not_started' | 'in_progress' | 'completed'

export interface LessonProgress {
  id: string
  user_id: string
  lesson_id: string
  status: LessonProgressStatus
  completed_at: string | null
  started_at?: string | null
}

export interface Assignment {
  id: string
  lesson_id: string
  title: string
  description: string | null
  max_score: number
  created_at: string
  // NOT in the written schema (001): no due_date / rubric columns exist.
  // The UI treats description as the rubric text and states honestly
  // that no deadline is recorded for the assignment.
}

export interface Submission {
  id: string
  assignment_id: string
  user_id: string
  content: string | null
  file_url: string | null
  score: number | null
  feedback: string | null
  submitted_at: string
  graded_at: string | null
}

export interface Quiz {
  id: string
  lesson_id: string
  title: string
  passing_score: number
  created_at: string
  // NOT in the written schema: quizzes have no max_attempts column
  // (only competency_exams do). Quiz history is shown; no cap is enforced.
}

export interface QuizQuestion {
  id: string
  quiz_id: string
  kind: 'mc' | 'true_false' | 'short'
  question: string
  options: string[] | null
  explanation: string | null
  order_index: number
  created_at: string
  // correct_answer is NEVER present here: students load questions only
  // via the get_quiz_questions() RPC, which omits it.
}

export interface QuizAttempt {
  id: string
  quiz_id: string
  user_id: string
  score: number | null
  answers: unknown
  attempted_at: string
}

export interface CompetencyExam {
  id: string
  course_id: string | null
  title: string
  description: string | null
  passing_score: number
  max_attempts: number | null
  created_by: string | null
  created_at: string
}

export interface ExamAttempt {
  id: string
  exam_id: string
  user_id: string
  score: number | null
  passed: boolean | null
  attempted_at: string
}

export interface Discussion {
  id: string
  lesson_id: string
  user_id: string
  parent_id: string | null
  body: string
  created_at: string
  is_pinned?: boolean | null
  is_resolved?: boolean | null
  accepted_answer_id?: string | null
  author?: { name: string | null; photo_url: string | null } | null
}

export interface DiscussionReaction {
  id: string
  discussion_id: string
  user_id: string
  kind: string
  created_at: string
}

export interface DiscussionReport {
  id: string
  discussion_id: string
  reporter_id: string
  reason: string | null
  status: 'open' | 'resolved' | 'dismissed'
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
}

export interface LessonResource {
  id: string
  lesson_id: string
  kind: 'reading' | 'image' | 'pdf' | 'video' | 'file' | 'link'
  title: string
  url: string | null
  body: string | null
  created_at: string
}

export interface RpsWeek {
  week: number
  topic: string
  course?: string
  activity?: string
}

export interface Rps {
  code: string
  title: string
  description: string | null
  weights: { kuis: number; tugas: number; ujian: number }
  passing_grade: number
  weeks: RpsWeek[]
}

export interface Certificate {
  id: string
  user_id: string
  course_id: string
  type: 'course' | 'exam' | 'work'
  serial: string
  score: number | null
  issued_at: string
}

// --- 004: Community / Schools / Clubs --------------------------------------
export interface Community {
  id: string
  name: string
  description: string | null
  cover_url: string | null
  created_by: string | null
  is_approved: boolean
  created_at: string
}

export interface CommunityMember {
  id: string
  community_id: string
  user_id: string
  role: string
  created_at: string
}

export interface CommunityProposal {
  id: string
  name: string
  description: string | null
  proposer_id: string
  status: 'pending' | 'approved' | 'rejected'
  decided_by: string | null
  created_at: string
}

export interface CommunityPost {
  id: string
  community_id: string
  user_id: string
  body: string
  is_pinned: boolean
  created_at: string
  author?: { name: string | null; photo_url: string | null } | null
}

export interface CommunityPostReply {
  id: string
  post_id: string
  user_id: string
  body: string
  created_at: string
  author?: { name: string | null; photo_url: string | null } | null
}

export interface School {
  id: string
  name: string
  city: string | null
  description: string | null
  is_verified: boolean
  created_by: string | null
  created_at: string
}

export interface SchoolMember {
  id: string
  school_id: string
  user_id: string
  created_at: string
}

export interface FilmClub {
  id: string
  school_id: string | null
  name: string
  description: string | null
  created_by: string | null
  created_at: string
}

export interface ClubMember {
  id: string
  club_id: string
  user_id: string
  created_at: string
}

export interface ClubActivity {
  id: string
  club_id: string
  title: string
  description: string | null
  starts_at: string | null
  created_by: string | null
  created_at: string
}

// --- 005: Projects / Crew Finder -------------------------------------------
export type ProjectAccessMode = 'open' | 'approval' | 'invite_only'
export type ProjectTaskStatus = 'rencana' | 'dikerjakan' | 'tinjauan' | 'selesai'

export interface Project {
  id: string
  title: string
  description: string | null
  owner_id: string
  access_mode: ProjectAccessMode
  template: string | null
  school_id: string | null
  club_id: string | null
  status: string
  created_at: string
}

export interface ProjectMember {
  id: string
  project_id: string
  user_id: string
  role: string | null
  permissions: Record<string, unknown> | null
  created_at: string
}

export interface ProjectInvite {
  id: string
  project_id: string
  inviter_id: string
  invitee_id: string
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
}

export interface ProjectJoinRequest {
  id: string
  project_id: string
  user_id: string
  message: string | null
  status: 'pending' | 'approved' | 'rejected'
  decided_by: string | null
  created_at: string
}

export interface ProjectMilestone {
  id: string
  project_id: string
  title: string
  description: string | null
  due_date: string | null
  is_done: boolean
  order_index: number
  created_at: string
}

export interface ProjectTask {
  id: string
  project_id: string
  milestone_id: string | null
  title: string
  description: string | null
  status: ProjectTaskStatus
  priority: string | null
  due_date: string | null
  assignee_id: string | null
  order_index: number
  created_at: string
}

export interface ProjectFile {
  id: string
  project_id: string
  kind: 'reference' | 'storyboard' | 'shot_list' | 'production' | 'other'
  title: string
  url: string | null
  uploaded_by: string | null
  created_at: string
}

export interface ProjectUpdate {
  id: string
  project_id: string
  user_id: string
  body: string
  created_at: string
}

export interface ProjectTemplate {
  id: string
  slug: string
  title: string
  description: string | null
  stages: unknown
  is_system: boolean
  created_at: string
}

// --- 006: Showcase / Portfolio / Library ------------------------------------
export interface Film {
  id: string
  title: string
  description: string | null
  owner_id: string
  school_id: string | null
  trailer_url: string | null
  film_url: string | null
  poster_url: string | null
  visibility: 'public' | 'private'
  show_school: boolean
  status: 'draft' | 'published'
  created_at: string
}

export interface FilmReview {
  id: string
  film_id: string
  user_id: string
  rating: number
  body: string | null
  created_at: string
  author?: { name: string | null } | null
}

export interface PortfolioItem {
  id: string
  user_id: string
  kind: 'work' | 'role' | 'skill' | 'course' | 'certificate' | 'achievement'
  title: string
  description: string | null
  film_id: string | null
  course_id: string | null
  certificate_id: string | null
  visibility: 'public' | 'members' | 'community' | 'private'
  created_at: string
}

export interface LibraryItem {
  id: string
  title: string
  category: string | null
  body: string | null
  source_url: string | null
  legal_basis: string | null
  attribution: string | null
  usage_limits: string | null
  image_url: string | null
  created_at: string
}

export interface LibraryBookmark {
  id: string
  library_item_id: string
  user_id: string
  created_at: string
}

// --- 007: Events / Competitions ---------------------------------------------
export interface SineEvent {
  id: string
  title: string
  description: string | null
  kind: 'internal' | 'external'
  organizer: string | null
  official_link: string | null
  starts_at: string | null
  ends_at: string | null
  location: string | null
  capacity: number | null
  created_by: string | null
  created_at: string
}

export interface EventSession {
  id: string
  event_id: string
  title: string
  starts_at: string | null
  ends_at: string | null
  description: string | null
  order_index: number
  created_at: string
}

export interface EventRegistration {
  id: string
  event_id: string
  user_id: string
  attended: boolean
  created_at: string
}

export type CompetitionStatus = 'draft' | 'dibuka' | 'penjurian' | 'selesai'

export interface Competition {
  id: string
  title: string
  description: string | null
  status: CompetitionStatus
  deadline: string | null
  categories: string[] | null
  criteria: { name: string; weight: number }[] | null
  created_by: string | null
  created_at: string
}

export interface CompetitionSubmission {
  id: string
  competition_id: string
  user_id: string
  film_id: string | null
  link: string | null
  category: string | null
  copyright_consent: boolean
  usage_consent: boolean
  status: string
  created_at: string
}

export interface CompetitionScore {
  id: string
  submission_id: string
  judge_id: string
  criterion: string
  score: number | null
  comment: string | null
  created_at: string
}

export interface CompetitionWinner {
  id: string
  competition_id: string
  submission_id: string
  category: string | null
  rank: number | null
  created_at: string
}

// --- 008: Mentor / Admin / Growth / Notifications ---------------------------
export interface OfficeHour {
  id: string
  mentor_id: string
  title: string
  starts_at: string | null
  ends_at: string | null
  capacity: number | null
  created_at: string
}

export interface OfficeHourBooking {
  id: string
  office_hour_id: string
  user_id: string
  status: 'booked' | 'cancelled'
  created_at: string
}

export interface CourseClaim {
  id: string
  course_id: string
  mentor_id: string
  status: 'pending' | 'approved' | 'rejected'
  decided_by: string | null
  created_at: string
}

export interface MentorApplication {
  id: string
  user_id: string
  expertise: string | null
  experience: string | null
  portfolio_link: string | null
  status: 'pending' | 'approved' | 'rejected'
  decided_by: string | null
  created_at: string
}

export interface AdminDiscussion {
  id: string
  admin_id: string
  mentor_id: string | null
  title: string
  body: string | null
  created_at: string
}

export interface AdminDiscussionReply {
  id: string
  thread_id: string
  user_id: string
  body: string
  created_at: string
  author?: { name: string | null } | null
}

export interface ModerationReport {
  id: string
  target_type: string
  target_id: string | null
  reporter_id: string
  reason: string | null
  status: 'open' | 'resolved' | 'dismissed'
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
}

export interface AuditLogRow {
  id: string
  actor_id: string | null
  action: string
  target_type: string | null
  target_id: string | null
  detail: Record<string, unknown> | null
  created_at: string
}

export interface AppNotification {
  id: string
  user_id: string
  kind: string
  title: string
  body: string | null
  data: Record<string, unknown> | null
  is_read: boolean
  created_at: string
}

export interface NotificationPrefs {
  id: string
  user_id: string
  in_app: boolean
  categories: Record<string, unknown> | string[] | null
  created_at: string
}

export interface Announcement {
  id: string
  scope: 'platform' | 'course'
  course_id: string | null
  title: string
  body: string | null
  created_by: string | null
  created_at: string
}

export interface CourseAnnouncement {
  id: string
  course_id: string
  title: string
  body: string | null
  created_by: string | null
  created_at: string
}
