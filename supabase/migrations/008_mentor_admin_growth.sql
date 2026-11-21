-- ============================================================================
-- SINEVERSE — Migration 008: Mentor / Admin / Growth / Notifikasi
-- Project: sineverse (Supabase, Singapore, Postgres 15)
-- Source of truth: ~/workspace/sineverse-app/REBUILD_PLAN.md §2, Migrasi 008
--
-- What it adds (11 tables):
--   office_hours, office_hour_bookings, course_claims, mentor_applications,
--   admin_discussions, admin_discussion_replies, moderation_reports,
--   audit_log, notifications, notification_prefs, recommendations_dismissed
--
-- How to apply:
--   Supabase Dashboard -> SQL Editor -> paste this file -> Run.
--   Apply in order 003 -> 008. Requires 001 (profiles/courses +
--   is_admin()), 007 (is_mentor() helper, reused here) and 003
--   (is_course_teacher(), reused for course_claims visibility).
--
-- Notes:
--   * RLS pattern follows 001 exactly: own-row user_id = auth.uid(),
--     admin via public.is_admin(), public catalog read for authenticated.
--   * MENTOR PROMOTION IS SERVER-SIDE: when an admin updates a
--     mentor_applications row to status = 'approved', the trigger
--     mentor_applications_promote sets profiles.role = 'mentor' for
--     that user. No client code is involved and no client can promote
--     itself (see the role-guard trigger below).
--   * ROLE GUARD (hardening, fills a hole in 001): migration 001's
--     profiles_update_own policy lets a user update their own profile
--     row, which includes the role column — so any user could set
--     role = 'admin' on themselves. The trigger
--     profiles_role_change_admin_only blocks ANY role change unless
--     the caller is an admin. The mentor-promotion trigger above runs
--     as part of an admin's approval update, so it still passes.
--   * audit_log + notifications: NO direct-insert policy exists for
--     authenticated users, so a client INSERT is always rejected by
--     RLS. Writes go only through the security-definer RPCs
--     public.log_audit() and public.create_notification() below.
--   * course_claims approval does NOT auto-assign the course mentor:
--     the plan does not specify it, so after approving a claim the
--     admin still sets courses.mentor_id (Admin Panel, K6). If auto-
--     assign is wanted later, add a trigger on course_claims that sets
--     courses.mentor_id only when it is currently null.
--   * No secrets, passwords, or service_role keys are in this file.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.office_hours (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  capacity int,
  created_at timestamptz not null default now()
);

create table if not exists public.office_hour_bookings (
  id uuid primary key default gen_random_uuid(),
  office_hour_id uuid not null references public.office_hours (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'booked'
    check (status in ('booked', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (office_hour_id, user_id)
);

create table if not exists public.course_claims (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  mentor_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (course_id, mentor_id)
);

create table if not exists public.mentor_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  expertise text,
  experience text,
  portfolio_link text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_discussions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles (id) on delete cascade,
  mentor_id uuid references public.profiles (id) on delete cascade,
  title text not null,
  body text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_discussion_replies (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.admin_discussions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id uuid,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text,
  status text not null default 'open'
    check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  detail jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  data jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_prefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  in_app boolean not null default true,
  categories jsonb,
  created_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.recommendations_dismissed (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_type text not null,
  item_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, item_type, item_id)
);

-- ---------------------------------------------------------------------------
-- Server-side mentor promotion (trigger on mentor_applications).
-- Fires only on the transition TO 'approved'. Security definer so the
-- profiles update bypasses RLS; the caller is the admin who approved.
-- ---------------------------------------------------------------------------
create or replace function public.promote_mentor_on_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved'
     and old.status is distinct from 'approved' then
    update public.profiles
    set role = 'mentor'
    where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists mentor_applications_promote on public.mentor_applications;
create trigger mentor_applications_promote
  after update on public.mentor_applications
  for each row execute function public.promote_mentor_on_approval();

-- ---------------------------------------------------------------------------
-- Role-change guard (see header): a non-admin may never change a
-- profiles.role value, including their own row.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_role_change_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role is distinct from new.role
     and not public.is_admin() then
    raise exception 'only an admin can change a profile role';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_role_change_admin_only on public.profiles;
create trigger profiles_role_change_admin_only
  before update of role on public.profiles
  for each row execute function public.enforce_role_change_admin_only();

-- ---------------------------------------------------------------------------
-- Security-definer writers for audit_log and notifications.
-- These are the ONLY write paths: there is no direct-insert RLS policy
-- for authenticated users on either table, so client INSERTs fail.
-- ---------------------------------------------------------------------------
create or replace function public.log_audit(
  p_action text,
  p_target_type text default null,
  p_target_id uuid default null,
  p_detail jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_detail)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.create_notification(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text default null,
  p_data jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  insert into public.notifications (user_id, kind, title, body, data)
  values (p_user_id, p_kind, p_title, p_body, p_data)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.log_audit(text, text, uuid, jsonb) to authenticated;
grant execute on function public.create_notification(uuid, text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Indexes on foreign keys
-- ---------------------------------------------------------------------------
create index if not exists office_hours_mentor_id_idx
  on public.office_hours (mentor_id);
create index if not exists office_hour_bookings_office_hour_id_idx
  on public.office_hour_bookings (office_hour_id);
create index if not exists office_hour_bookings_user_id_idx
  on public.office_hour_bookings (user_id);
create index if not exists course_claims_course_id_idx
  on public.course_claims (course_id);
create index if not exists course_claims_mentor_id_idx
  on public.course_claims (mentor_id);
create index if not exists course_claims_decided_by_idx
  on public.course_claims (decided_by);
create index if not exists mentor_applications_user_id_idx
  on public.mentor_applications (user_id);
create index if not exists mentor_applications_decided_by_idx
  on public.mentor_applications (decided_by);
create index if not exists admin_discussions_admin_id_idx
  on public.admin_discussions (admin_id);
create index if not exists admin_discussions_mentor_id_idx
  on public.admin_discussions (mentor_id);
create index if not exists admin_discussion_replies_thread_id_idx
  on public.admin_discussion_replies (thread_id);
create index if not exists admin_discussion_replies_user_id_idx
  on public.admin_discussion_replies (user_id);
create index if not exists moderation_reports_reporter_id_idx
  on public.moderation_reports (reporter_id);
create index if not exists moderation_reports_resolved_by_idx
  on public.moderation_reports (resolved_by);
create index if not exists audit_log_actor_id_idx
  on public.audit_log (actor_id);
create index if not exists notifications_user_id_idx
  on public.notifications (user_id);
create index if not exists notification_prefs_user_id_idx
  on public.notification_prefs (user_id);
create index if not exists recommendations_dismissed_user_id_idx
  on public.recommendations_dismissed (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — on for every table
-- ---------------------------------------------------------------------------
alter table public.office_hours enable row level security;
alter table public.office_hour_bookings enable row level security;
alter table public.course_claims enable row level security;
alter table public.mentor_applications enable row level security;
alter table public.admin_discussions enable row level security;
alter table public.admin_discussion_replies enable row level security;
alter table public.moderation_reports enable row level security;
alter table public.audit_log enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.recommendations_dismissed enable row level security;

-- ---------------------------------------------------------------------------
-- Policies — office_hours
-- ---------------------------------------------------------------------------
-- Anyone logged in can read office hours.
drop policy if exists "office_hours_select_authenticated" on public.office_hours;
create policy "office_hours_select_authenticated"
  on public.office_hours for select to authenticated using (true);

-- A mentor creates their own office hours.
drop policy if exists "office_hours_insert_mentor" on public.office_hours;
create policy "office_hours_insert_mentor"
  on public.office_hours for insert to authenticated
  with check (mentor_id = auth.uid());

-- A mentor edits / deletes only their own office hours.
drop policy if exists "office_hours_update_mentor" on public.office_hours;
create policy "office_hours_update_mentor"
  on public.office_hours for update to authenticated
  using (mentor_id = auth.uid()) with check (mentor_id = auth.uid());

drop policy if exists "office_hours_delete_mentor" on public.office_hours;
create policy "office_hours_delete_mentor"
  on public.office_hours for delete to authenticated
  using (mentor_id = auth.uid());

-- Admins can do everything.
drop policy if exists "office_hours_admin_all" on public.office_hours;
create policy "office_hours_admin_all"
  on public.office_hours for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — office_hour_bookings
-- ---------------------------------------------------------------------------
-- A user sees their own bookings; the mentor of that office hour sees
-- theirs too.
drop policy if exists "office_hour_bookings_select_party" on public.office_hour_bookings;
create policy "office_hour_bookings_select_party"
  on public.office_hour_bookings for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.office_hours
      where id = office_hour_id and mentor_id = auth.uid()
    )
  );

-- A user books only as themselves.
drop policy if exists "office_hour_bookings_insert_own" on public.office_hour_bookings;
create policy "office_hour_bookings_insert_own"
  on public.office_hour_bookings for insert to authenticated
  with check (user_id = auth.uid());

-- A user cancels only their own booking; the mentor may also update it.
drop policy if exists "office_hour_bookings_update_party" on public.office_hour_bookings;
create policy "office_hour_bookings_update_party"
  on public.office_hour_bookings for update to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.office_hours
      where id = office_hour_id and mentor_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.office_hours
      where id = office_hour_id and mentor_id = auth.uid()
    )
  );

-- Admins can do everything.
drop policy if exists "office_hour_bookings_admin_all" on public.office_hour_bookings;
create policy "office_hour_bookings_admin_all"
  on public.office_hour_bookings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — course_claims ("Ajukan untuk Mengampu")
-- ---------------------------------------------------------------------------
-- The claimant sees their own claims; the course teacher and admin see
-- claims on that course too.
drop policy if exists "course_claims_select_party" on public.course_claims;
create policy "course_claims_select_party"
  on public.course_claims for select to authenticated
  using (
    mentor_id = auth.uid()
    or public.is_course_teacher(course_id)
  );

-- A verified mentor files a claim as themselves.
drop policy if exists "course_claims_insert_mentor" on public.course_claims;
create policy "course_claims_insert_mentor"
  on public.course_claims for insert to authenticated
  with check (mentor_id = auth.uid() and public.is_mentor());

-- Only admins decide (approve / reject) claims.
drop policy if exists "course_claims_admin_all" on public.course_claims;
create policy "course_claims_admin_all"
  on public.course_claims for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — mentor_applications
-- ---------------------------------------------------------------------------
-- The applicant sees their own application.
drop policy if exists "mentor_applications_select_own" on public.mentor_applications;
create policy "mentor_applications_select_own"
  on public.mentor_applications for select to authenticated
  using (user_id = auth.uid());

-- Anyone logged in can apply as themselves.
drop policy if exists "mentor_applications_insert_own" on public.mentor_applications;
create policy "mentor_applications_insert_own"
  on public.mentor_applications for insert to authenticated
  with check (user_id = auth.uid());

-- Only admins decide (approve / reject). Approval promotes the user to
-- 'mentor' via the trigger above — never from the client.
drop policy if exists "mentor_applications_admin_all" on public.mentor_applications;
create policy "mentor_applications_admin_all"
  on public.mentor_applications for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — admin_discussions (Admin <-> Mentor threads)
-- ---------------------------------------------------------------------------
-- Admins see all threads. A mentor sees a thread addressed to them, or
-- a broadcast thread (mentor_id is null).
drop policy if exists "admin_discussions_select_party" on public.admin_discussions;
create policy "admin_discussions_select_party"
  on public.admin_discussions for select to authenticated
  using (
    mentor_id = auth.uid()
    or (mentor_id is null and public.is_mentor())
  );

-- Only admins start a thread, as themselves.
drop policy if exists "admin_discussions_insert_admin" on public.admin_discussions;
create policy "admin_discussions_insert_admin"
  on public.admin_discussions for insert to authenticated
  with check (public.is_admin() and admin_id = auth.uid());

-- Only admins edit / delete threads.
drop policy if exists "admin_discussions_admin_all" on public.admin_discussions;
create policy "admin_discussions_admin_all"
  on public.admin_discussions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — admin_discussion_replies
-- ---------------------------------------------------------------------------
-- A thread participant reads its replies: admins, the addressed mentor,
-- or any mentor for a broadcast thread.
drop policy if exists "admin_discussion_replies_select_party" on public.admin_discussion_replies;
create policy "admin_discussion_replies_select_party"
  on public.admin_discussion_replies for select to authenticated
  using (exists (
    select 1 from public.admin_discussions t
    where t.id = thread_id
      and (t.mentor_id = auth.uid()
           or (t.mentor_id is null and public.is_mentor()))
  ));

-- A thread participant replies as themselves.
drop policy if exists "admin_discussion_replies_insert_party" on public.admin_discussion_replies;
create policy "admin_discussion_replies_insert_party"
  on public.admin_discussion_replies for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from public.admin_discussions t
    where t.id = thread_id
      and (t.mentor_id = auth.uid()
           or (t.mentor_id is null and public.is_mentor()))
  ));

-- A user edits / deletes only their own replies.
drop policy if exists "admin_discussion_replies_update_own" on public.admin_discussion_replies;
create policy "admin_discussion_replies_update_own"
  on public.admin_discussion_replies for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "admin_discussion_replies_delete_own" on public.admin_discussion_replies;
create policy "admin_discussion_replies_delete_own"
  on public.admin_discussion_replies for delete to authenticated
  using (user_id = auth.uid());

-- Admins can do everything.
drop policy if exists "admin_discussion_replies_admin_all" on public.admin_discussion_replies;
create policy "admin_discussion_replies_admin_all"
  on public.admin_discussion_replies for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — moderation_reports
-- ---------------------------------------------------------------------------
-- Anyone logged in can file a report as themselves.
drop policy if exists "moderation_reports_insert_own" on public.moderation_reports;
create policy "moderation_reports_insert_own"
  on public.moderation_reports for insert to authenticated
  with check (reporter_id = auth.uid());

-- Only admins read and resolve reports.
drop policy if exists "moderation_reports_admin_all" on public.moderation_reports;
create policy "moderation_reports_admin_all"
  on public.moderation_reports for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — audit_log
-- ---------------------------------------------------------------------------
-- Only admins read the audit log. There is deliberately NO insert /
-- update / delete policy for authenticated users: writes go only through
-- public.log_audit() (security definer).
drop policy if exists "audit_log_select_admin" on public.audit_log;
create policy "audit_log_select_admin"
  on public.audit_log for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — notifications
-- ---------------------------------------------------------------------------
-- A user reads only their own notifications.
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

-- A user marks their own notifications read (is_read) and deletes them.
-- There is deliberately NO insert policy: writes go only through
-- public.create_notification() (security definer).
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own"
  on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- Admins can read everything (support / debugging); they still cannot
-- insert directly — public.create_notification() is the write path.
drop policy if exists "notifications_select_admin" on public.notifications;
create policy "notifications_select_admin"
  on public.notifications for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — notification_prefs
-- ---------------------------------------------------------------------------
-- A user reads only their own preferences.
drop policy if exists "notification_prefs_select_own" on public.notification_prefs;
create policy "notification_prefs_select_own"
  on public.notification_prefs for select to authenticated
  using (user_id = auth.uid());

-- A user creates their own preferences row.
drop policy if exists "notification_prefs_insert_own" on public.notification_prefs;
create policy "notification_prefs_insert_own"
  on public.notification_prefs for insert to authenticated
  with check (user_id = auth.uid());

-- A user updates only their own preferences.
drop policy if exists "notification_prefs_update_own" on public.notification_prefs;
create policy "notification_prefs_update_own"
  on public.notification_prefs for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Admins can do everything.
drop policy if exists "notification_prefs_admin_all" on public.notification_prefs;
create policy "notification_prefs_admin_all"
  on public.notification_prefs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — recommendations_dismissed
-- ---------------------------------------------------------------------------
-- A user sees only their own dismissals.
drop policy if exists "recommendations_dismissed_select_own" on public.recommendations_dismissed;
create policy "recommendations_dismissed_select_own"
  on public.recommendations_dismissed for select to authenticated
  using (user_id = auth.uid());

-- A user dismisses recommendations only as themselves.
drop policy if exists "recommendations_dismissed_insert_own" on public.recommendations_dismissed;
create policy "recommendations_dismissed_insert_own"
  on public.recommendations_dismissed for insert to authenticated
  with check (user_id = auth.uid());

-- A user un-dismisses only their own rows.
drop policy if exists "recommendations_dismissed_delete_own" on public.recommendations_dismissed;
create policy "recommendations_dismissed_delete_own"
  on public.recommendations_dismissed for delete to authenticated
  using (user_id = auth.uid());

-- Admins can do everything.
drop policy if exists "recommendations_dismissed_admin_all" on public.recommendations_dismissed;
create policy "recommendations_dismissed_admin_all"
  on public.recommendations_dismissed for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- Done. Verify in the Supabase Dashboard:
--   * Table Editor shows the 11 new tables above (66 tables total
--     with 001-007: 12 + 11 + 10 + 9 + 5 + 8 + 11).
--   * Authentication -> Policies shows RLS enabled with policies per table.
--   * Spot-check promotion: as admin, set a mentor_applications row to
--     'approved' and confirm that user's profiles.role becomes 'mentor'.
--   * Spot-check the guard: as a non-admin, UPDATE profiles SET
--     role = 'admin' on your own row must fail.
--   * Spot-check the RPCs: as a normal user, INSERT into audit_log or
--     notifications directly must fail; SELECT public.log_audit(...) and
--     SELECT public.create_notification(...) must succeed.
-- All migrations 003-008 are now applied. See ../README.md for the
-- Storage buckets + full verification checklist.
-- ============================================================================
