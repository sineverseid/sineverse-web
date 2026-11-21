# SINEVERSE — Supabase migrations (public web app)

Backend: Supabase project **sineverse** (Singapore, Postgres 15).
Brand: Deep Navy `#172438`, Film Green `#16865E`, Mint `#A3E6C4`.

Source of truth for tables/columns/RLS: `~/workspace/sineverse-app/REBUILD_PLAN.md` §2
("Tabel Supabase yang dibutuhkan"), followed exactly.

## Run order

Apply in the Supabase Dashboard → **SQL Editor** → paste one file → **Run**,
in this order:

| # | File | Status | Tables added |
|---|---|---|---|
| 001 | `migrations/001_initial_schema.sql` | ✅ Already applied live — do NOT re-run | 12 (profiles, courses, modules, lessons, enrollments, lesson_progress, assignments, submissions, quizzes, quiz_attempts, certificates, discussions) |
| 002 | `migrations/002_profile_trigger.sql` | ✅ Already applied live — do NOT re-run | 0 (trigger `on_auth_user_created` auto-creates a profile on signup) |
| 003 | `migrations/003_academy_lms.sql` | ⏳ To run | 11: course_teachers, course_announcements, announcements, waitlist, lesson_resources, competency_exams, exam_attempts, quiz_questions, discussion_reactions, discussion_reports, rps |
| 004 | `migrations/004_community_schools_clubs.sql` | ⏳ To run | 10: communities, community_members, community_proposals, community_posts, community_post_replies, schools, school_members, film_clubs, club_members, club_activities |
| 005 | `migrations/005_projects_crew.sql` | ⏳ To run | 9: projects, project_members, project_invites, project_join_requests, project_milestones, project_tasks, project_files, project_updates, project_templates |
| 006 | `migrations/006_showcase_portfolio_library.sql` | ⏳ To run | 5: films, film_reviews, portfolio_items, library_items, library_bookmarks |
| 007 | `migrations/007_events_competitions.sql` | ⏳ To run | 8: events, event_sessions, event_registrations, competitions, competition_judges, competition_submissions, competition_scores, competition_winners |
| 008 | `migrations/008_mentor_admin_growth.sql` | ⏳ To run | 11: office_hours, office_hour_bookings, course_claims, mentor_applications, admin_discussions, admin_discussion_replies, moderation_reports, audit_log, notifications, notification_prefs, recommendations_dismissed |
| 009 | `migrations/009_quiz_scoring.sql` | ⏳ To run (after 003–008) | 1 table (`exam_questions`) + 4 RPCs (`get_exam_questions`, `submit_quiz_attempt`, `submit_exam_attempt`) + columns: `assignments.due_date/rubric`, `submissions.is_draft/version/is_late`, `quizzes.max_attempts`. Added by the web build (Fase B): 003 ships `get_quiz_questions()` but no scoring RPC, and no exam-question table at all, so server-side auto-scoring and taking a competency exam were impossible without it. The UI degrades honestly when 009 is absent (answers are saved unscored + a notice is shown). |

**Total after all 9: 67 tables** (12 existing + 54 new in 003–008 + 1 in 009). Every file is
idempotent (re-runnable): `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT
EXISTS`, `DROP POLICY IF EXISTS` before each policy, `ALTER TABLE ... ADD
COLUMN IF NOT EXISTS`, seeds with `ON CONFLICT DO NOTHING`.

Only **003–009 still need running**. 001–002 are copied here so the full
history lives in this folder; they are already applied live.

## Seeds included

- **003**: `rps` row `SVS-SEM1` — 20-week plan (2 weeks per course), weights
  `{"kuis": 20, "tugas": 50, "ujian": 30}`, `passing_grade` 70.
- **005**: 4 system project templates — `film-pendek-fiksi` (Film Pendek
  Fiksi), `dokumenter-sekolah` (Dokumenter Sekolah), `video-musik-klip`
  (Video Musik/Klip), `animasi-pendek` (Animasi Pendek).

## Seeds deliberately NOT included

The plan names only counts, never exact names/content, so inventing seed
rows would be fake data. Seed these from the web app's real seed data in
Fase C instead:

- **004**: the 5 communities + 5 schools (plan §0/§2: counts only, no names).
- **006**: the 7 Library items + 4 films (plan §0/§2: counts only, no
  titles/bodies/legal bases/attributions).

## Storage buckets (create in the Dashboard)

Storage → **Create bucket** (all **private** except where noted; access is
controlled by the policies below, not by bucket publicity). Then, for each
bucket, Storage → Policies → **New policy** (or run the SQL in the SQL
Editor — the `storage.objects` table is where bucket policies live).

> Bucket policies are **not** part of migrations 003–008 (Storage lives
> outside SQL migrations). Create the buckets in the Dashboard first, then
> add the policies.

### 1. `profile-photos` — profile photos (mandatory, replace-only)

- Upload: the user, only into their own path (`<user-id>/...`).
- Read: public.
- Delete: **none** (per the web rule: a photo can only be replaced, never deleted).

```sql
-- INSERT: own path only
create policy "profile_photos_insert_own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- SELECT: public read
create policy "profile_photos_select_public" on storage.objects
for select to anon, authenticated
using (bucket_id = 'profile-photos');

-- No DELETE policy on purpose.
```

### 2. `submission-files` — assignment files

- Upload: a participant of the course the assignment belongs to.
- Read: participants + the course teacher + admin.
- (Enforced in the app by path convention
  `<course-id>/<assignment-id>/<user-id>/...`; the SQL below is the
  storage-level baseline — upload own path, read own path or teacher/admin.
  Tighten per-course checks in the app/RPC if a stricter boundary is needed.)

```sql
-- INSERT: own path only
create policy "submission_files_insert_own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'submission-files'
  and (storage.foldername(name))[3] = auth.uid()::text
);

-- SELECT: own files, or course teacher / admin
create policy "submission_files_select_party" on storage.objects
for select to authenticated
using (
  bucket_id = 'submission-files'
  and (
    (storage.foldername(name))[3] = auth.uid()::text
    or public.is_course_teacher(((storage.foldername(name))[1])::uuid)
    or public.is_admin()
  )
);
```

### 3. `project-files` — project files (storyboard, shot-list, references)

- Upload / read: project members only.
- (Enforced in the app by path convention `<project-id>/...`; the SQL below
  is the storage-level baseline using the `is_project_member` helper from
  migration 005.)

```sql
create policy "project_files_insert_member" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'project-files'
  and public.is_project_member(((storage.foldername(name))[1])::uuid)
);

create policy "project_files_select_member" on storage.objects
for select to authenticated
using (
  bucket_id = 'project-files'
  and public.is_project_member(((storage.foldername(name))[1])::uuid)
);
```

### 4. `library-images` — Library item illustrations

- Upload: admin only.
- Read: public.

```sql
-- INSERT: admin only
create policy "library_images_insert_admin" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'library-images'
  and public.is_admin()
);

-- SELECT: public read
create policy "library_images_select_public" on storage.objects
for select to anon, authenticated
using (bucket_id = 'library-images');
```

## Things the app must enforce (not enforceable by RLS alone)

- **`quiz_questions.correct_answer` must never reach a student client.**
  The RLS select policy allows full rows only to the course teacher/admin.
  Students fetch questions via `public.get_quiz_questions(quiz_id)` (003),
  which omits `correct_answer`.
- **Event capacity**: checked in the app before inserting into
  `event_registrations` (a count check races under concurrency; add a
  capacity-checking RPC later if strict enforcement is needed).
- **Library legal basis**: a screenplay (naskah) without `legal_basis`
  must be rejected in the app (006, rule G10).
- **Crew Finder privacy**: select only the safe-public profile columns
  (`name`, `city`, `photo_url`, `skills`, `interests`, `availability`,
  `is_open_to_crew`) — never `select *` from `profiles` (email/phone).
- **Portfolio privacy**: in-progress learning + the full certificate list
  are owner/admin-only in the app (006, rule G7).
- **External events**: no in-app registration — link out to
  `official_link` only (007, rule H5).
- **Course-claim approval does not auto-assign the mentor**: after
  approving a `course_claims` row, the admin still sets
  `courses.mentor_id` (Admin Panel, K6). The plan does not specify
  auto-assign.

## Server-side mechanisms (no client involvement)

- **Mentor promotion** (008): approving a `mentor_applications` row
  (`status` → `'approved'`) fires trigger `mentor_applications_promote`,
  which sets `profiles.role = 'mentor'`.
- **Role guard** (008, hardening): trigger `profiles_role_change_admin_only`
  blocks any `profiles.role` change by a non-admin. This fills a hole in
  001, whose `profiles_update_own` policy otherwise lets any user set
  their own role (including `'admin'`).
- **Audit + notifications** (008): no direct-insert RLS policy exists on
  `audit_log` or `notifications`. Writes go only through the
  security-definer RPCs `public.log_audit(...)` and
  `public.create_notification(...)`.
- **Community approval / school verification** (004): triggers
  `communities_approval_admin_only` /
  `schools_verification_admin_only` block non-admins from flipping
  `is_approved` / `is_verified` (RLS alone cannot restrict one column).
- **Competition-score gating** (007): `competition_scores` are visible to
  judges/admin only until the competition `status = 'selesai'`; after that,
  a participant sees only their own submission's scores. Enforced in the
  SELECT policy, not the app.

## Verification checklist

After running 003–008, in the Supabase Dashboard:

- [ ] **Table count**: Table Editor shows **66 tables**
      (12 from 001 + 11 + 10 + 9 + 5 + 8 + 11).
- [ ] **RLS on**: every table shows RLS enabled (Authentication → Policies).
      Spot-check one new table per migration.
- [ ] **Seed rows**: `rps` has 1 row (`code = 'SVS-SEM1'`, weights
      `{"kuis": 20, "tugas": 50, "ujian": 30}`, `passing_grade` 70);
      `project_templates` has 4 rows (slugs `film-pendek-fiksi`,
      `dokumenter-sekolah`, `video-musik-klip`, `animasi-pendek`).
- [ ] **New columns**: `courses` has `enrollment_key` + `passing_grade`;
      `modules` has `is_published` + `release_label`; `lessons` has
      `lesson_code`; `lesson_progress` has `started_at`; `discussions`
      has `is_pinned`, `is_resolved`, `accepted_answer_id`; `profiles`
      has `birth_date`, `gender`, `address`, `bio`, `skills`,
      `interests`, `availability`, `is_open_to_crew`.
- [ ] **Helpers exist**: `is_admin`, `is_mentor`, `is_course_teacher`,
      `is_course_participant`, `is_community_member`, `is_school_member`,
      `is_club_member`, `is_project_member`, `is_project_owner`,
      `is_competition_judge`, `get_quiz_questions`, `log_audit`,
      `create_notification` (Database → Functions).
- [ ] **Triggers exist**: `on_auth_user_created` (002),
      `mentor_applications_promote`, `profiles_role_change_admin_only`,
      `communities_approval_admin_only`,
      `schools_verification_admin_only` (Database → Triggers).
- [ ] **Score gating spot-check**: as a participant, `SELECT` on
      `competition_scores` for another participant's submission (or
      before `selesai`) returns 0 rows; as a judge it returns rows.
- [ ] **Promotion spot-check**: as admin, set a `mentor_applications`
      row to `'approved'` → that user's `profiles.role` becomes `'mentor'`.
- [ ] **Role-guard spot-check**: as a non-admin,
      `UPDATE profiles SET role = 'admin'` on your own row must fail.
- [ ] **RPC spot-check**: as a normal user, direct `INSERT` into
      `audit_log` / `notifications` must fail, while
      `SELECT public.log_audit(...)` and
      `SELECT public.create_notification(...)` succeed.
- [ ] **Buckets**: the 4 buckets above exist with their policies
      (Storage → Buckets / Policies).
- [ ] **Re-run safety**: re-running any of 003–008 succeeds without
      errors (all statements idempotent).
