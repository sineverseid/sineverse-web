-- ============================================================================
-- SINEVERSE — Migration 004: Community / Sekolah / Klub Film
-- Project: sineverse (Supabase, Singapore, Postgres 15)
-- Source of truth: ~/workspace/sineverse-app/REBUILD_PLAN.md §2, Migrasi 004
--
-- What it adds (10 tables):
--   communities, community_members, community_proposals, community_posts,
--   community_post_replies, schools, school_members, film_clubs,
--   club_members, club_activities
--
-- How to apply:
--   Supabase Dashboard -> SQL Editor -> paste this file -> Run.
--   Apply in order 003 -> 008. Requires 001 (profiles + is_admin()).
--
-- Notes:
--   * RLS pattern follows 001 exactly: own-row user_id = auth.uid(),
--     admin via public.is_admin(). Membership checks use security-definer
--     helpers (is_community_member / is_school_member / is_club_member)
--     so a policy never queries the same membership table it protects
--     (that would recurse under RLS).
--   * School roster is members-only (E5): school_members rows are visible
--     only to members of that school + admin.
--   * is_approved (communities) and is_verified (schools) may only change
--     by an admin: enforced by BEFORE UPDATE triggers below, because an
--     RLS policy alone cannot restrict a single column.
--   * NO seed rows in this file. REBUILD_PLAN.md §0/§2 names only the
--     counts ("5 komunitas", "5 sekolah") and never gives their exact
--     names/descriptions, so seeding here would invent data. Seed the
--     5 communities + 5 schools from the web app's real seed data when
--     the content is copied over (Fase C).
--   * No secrets, passwords, or service_role keys are in this file.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  cover_url text,
  created_by uuid references public.profiles (id) on delete set null,
  is_approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.community_members (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  unique (community_id, user_id)
);

create table if not exists public.community_proposals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  proposer_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.community_post_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  description text,
  is_verified boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.school_members (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (school_id, user_id)
);

create table if not exists public.film_clubs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools (id) on delete set null,
  name text not null,
  description text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.club_members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.film_clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (club_id, user_id)
);

create table if not exists public.club_activities (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.film_clubs (id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper functions (moved after tables: SQL-language functions are
-- validated at creation, so they must be defined after the tables they query)
-- ---------------------------------------------------------------------------
create or replace function public.is_community_member(p_community_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.community_members
    where community_id = p_community_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_school_member(p_school_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.school_members
    where school_id = p_school_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_club_member(p_club_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.club_members
    where club_id = p_club_id and user_id = auth.uid()
  );
$$;

grant execute on function public.is_community_member(uuid) to authenticated;
grant execute on function public.is_school_member(uuid) to authenticated;
grant execute on function public.is_club_member(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- Admin-only flag guards (RLS cannot restrict a single column, so a trigger
-- enforces it server-side).
-- ---------------------------------------------------------------------------
create or replace function public.enforce_community_approval_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_approved is distinct from new.is_approved
     and not public.is_admin() then
    raise exception 'only an admin can change is_approved';
  end if;
  return new;
end;
$$;

drop trigger if exists communities_approval_admin_only on public.communities;
create trigger communities_approval_admin_only
  before update on public.communities
  for each row execute function public.enforce_community_approval_admin_only();

create or replace function public.enforce_school_verification_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_verified is distinct from new.is_verified
     and not public.is_admin() then
    raise exception 'only an admin can change is_verified';
  end if;
  return new;
end;
$$;

drop trigger if exists schools_verification_admin_only on public.schools;
create trigger schools_verification_admin_only
  before update on public.schools
  for each row execute function public.enforce_school_verification_admin_only();

-- ---------------------------------------------------------------------------
-- Indexes on foreign keys
-- ---------------------------------------------------------------------------
create index if not exists communities_created_by_idx
  on public.communities (created_by);
create index if not exists community_members_community_id_idx
  on public.community_members (community_id);
create index if not exists community_members_user_id_idx
  on public.community_members (user_id);
create index if not exists community_proposals_proposer_id_idx
  on public.community_proposals (proposer_id);
create index if not exists community_proposals_decided_by_idx
  on public.community_proposals (decided_by);
create index if not exists community_posts_community_id_idx
  on public.community_posts (community_id);
create index if not exists community_posts_user_id_idx
  on public.community_posts (user_id);
create index if not exists community_post_replies_post_id_idx
  on public.community_post_replies (post_id);
create index if not exists community_post_replies_user_id_idx
  on public.community_post_replies (user_id);
create index if not exists schools_created_by_idx
  on public.schools (created_by);
create index if not exists school_members_school_id_idx
  on public.school_members (school_id);
create index if not exists school_members_user_id_idx
  on public.school_members (user_id);
create index if not exists film_clubs_school_id_idx
  on public.film_clubs (school_id);
create index if not exists film_clubs_created_by_idx
  on public.film_clubs (created_by);
create index if not exists club_members_club_id_idx
  on public.club_members (club_id);
create index if not exists club_members_user_id_idx
  on public.club_members (user_id);
create index if not exists club_activities_club_id_idx
  on public.club_activities (club_id);
create index if not exists club_activities_created_by_idx
  on public.club_activities (created_by);

-- ---------------------------------------------------------------------------
-- Row Level Security — on for every table
-- ---------------------------------------------------------------------------
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.community_proposals enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_post_replies enable row level security;
alter table public.schools enable row level security;
alter table public.school_members enable row level security;
alter table public.film_clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.club_activities enable row level security;

-- ---------------------------------------------------------------------------
-- Policies — communities
-- ---------------------------------------------------------------------------
-- Approved communities are visible to everyone; a creator also sees their
-- own not-yet-approved community.
drop policy if exists "communities_select_approved" on public.communities;
create policy "communities_select_approved"
  on public.communities for select to authenticated
  using (is_approved or created_by = auth.uid());

-- Anyone logged in can propose a community (starts unapproved).
drop policy if exists "communities_insert_own" on public.communities;
create policy "communities_insert_own"
  on public.communities for insert to authenticated
  with check (created_by = auth.uid());

-- The creator edits their own community (is_approved itself is guarded
-- by the trigger above: only admins can flip it).
drop policy if exists "communities_update_creator" on public.communities;
create policy "communities_update_creator"
  on public.communities for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

-- The creator deletes their own community.
drop policy if exists "communities_delete_creator" on public.communities;
create policy "communities_delete_creator"
  on public.communities for delete to authenticated
  using (created_by = auth.uid());

-- Admins can do everything (approve, edit, delete incl. cascade).
drop policy if exists "communities_admin_all" on public.communities;
create policy "communities_admin_all"
  on public.communities for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — community_members
-- ---------------------------------------------------------------------------
-- Only members of the community (and admins) see its roster.
drop policy if exists "community_members_select_member" on public.community_members;
create policy "community_members_select_member"
  on public.community_members for select to authenticated
  using (public.is_community_member(community_id));

-- A user joins only as themselves.
drop policy if exists "community_members_insert_own" on public.community_members;
create policy "community_members_insert_own"
  on public.community_members for insert to authenticated
  with check (user_id = auth.uid());

-- A user leaves only themselves.
drop policy if exists "community_members_delete_own" on public.community_members;
create policy "community_members_delete_own"
  on public.community_members for delete to authenticated
  using (user_id = auth.uid());

-- Admins can do everything (incl. role changes).
drop policy if exists "community_members_admin_all" on public.community_members;
create policy "community_members_admin_all"
  on public.community_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — community_proposals
-- ---------------------------------------------------------------------------
-- The proposer sees their own proposal; everyone sees approved ones.
drop policy if exists "community_proposals_select_visible" on public.community_proposals;
create policy "community_proposals_select_visible"
  on public.community_proposals for select to authenticated
  using (proposer_id = auth.uid() or status = 'approved');

-- Anyone logged in can propose a community as themselves.
drop policy if exists "community_proposals_insert_own" on public.community_proposals;
create policy "community_proposals_insert_own"
  on public.community_proposals for insert to authenticated
  with check (proposer_id = auth.uid());

-- Only admins decide (approve / reject) proposals.
drop policy if exists "community_proposals_admin_all" on public.community_proposals;
create policy "community_proposals_admin_all"
  on public.community_proposals for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — community_posts
-- ---------------------------------------------------------------------------
-- Only members of the community read its feed.
drop policy if exists "community_posts_select_member" on public.community_posts;
create policy "community_posts_select_member"
  on public.community_posts for select to authenticated
  using (public.is_community_member(community_id));

-- Only a member posts, as themselves.
drop policy if exists "community_posts_insert_member" on public.community_posts;
create policy "community_posts_insert_member"
  on public.community_posts for insert to authenticated
  with check (user_id = auth.uid() and public.is_community_member(community_id));

-- A user edits only their own posts.
drop policy if exists "community_posts_update_own" on public.community_posts;
create policy "community_posts_update_own"
  on public.community_posts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- A user deletes only their own posts.
drop policy if exists "community_posts_delete_own" on public.community_posts;
create policy "community_posts_delete_own"
  on public.community_posts for delete to authenticated
  using (user_id = auth.uid());

-- Admins can do everything (incl. pinning / moderation).
drop policy if exists "community_posts_admin_all" on public.community_posts;
create policy "community_posts_admin_all"
  on public.community_posts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — community_post_replies
-- ---------------------------------------------------------------------------
-- Only members of the post's community read replies.
drop policy if exists "community_post_replies_select_member" on public.community_post_replies;
create policy "community_post_replies_select_member"
  on public.community_post_replies for select to authenticated
  using (exists (
    select 1 from public.community_posts p
    where p.id = post_id and public.is_community_member(p.community_id)
  ));

-- Only a member of that community replies, as themselves.
drop policy if exists "community_post_replies_insert_member" on public.community_post_replies;
create policy "community_post_replies_insert_member"
  on public.community_post_replies for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from public.community_posts p
    where p.id = post_id and public.is_community_member(p.community_id)
  ));

-- A user edits / deletes only their own replies.
drop policy if exists "community_post_replies_update_own" on public.community_post_replies;
create policy "community_post_replies_update_own"
  on public.community_post_replies for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "community_post_replies_delete_own" on public.community_post_replies;
create policy "community_post_replies_delete_own"
  on public.community_post_replies for delete to authenticated
  using (user_id = auth.uid());

-- Admins can do everything.
drop policy if exists "community_post_replies_admin_all" on public.community_post_replies;
create policy "community_post_replies_admin_all"
  on public.community_post_replies for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — schools
-- ---------------------------------------------------------------------------
-- Anyone logged in can read the school directory.
drop policy if exists "schools_select_authenticated" on public.schools;
create policy "schools_select_authenticated"
  on public.schools for select to authenticated using (true);

-- Anyone logged in can register a school as themselves.
drop policy if exists "schools_insert_own" on public.schools;
create policy "schools_insert_own"
  on public.schools for insert to authenticated
  with check (created_by = auth.uid());

-- The creator edits their own school (is_verified itself is guarded by
-- the trigger above: only admins can flip it).
drop policy if exists "schools_update_creator" on public.schools;
create policy "schools_update_creator"
  on public.schools for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

-- The creator deletes their own school.
drop policy if exists "schools_delete_creator" on public.schools;
create policy "schools_delete_creator"
  on public.schools for delete to authenticated
  using (created_by = auth.uid());

-- Admins can do everything (incl. verification).
drop policy if exists "schools_admin_all" on public.schools;
create policy "schools_admin_all"
  on public.schools for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — school_members (roster: members + admin only)
-- ---------------------------------------------------------------------------
drop policy if exists "school_members_select_member" on public.school_members;
create policy "school_members_select_member"
  on public.school_members for select to authenticated
  using (public.is_school_member(school_id));

-- A user joins a school workspace only as themselves.
drop policy if exists "school_members_insert_own" on public.school_members;
create policy "school_members_insert_own"
  on public.school_members for insert to authenticated
  with check (user_id = auth.uid());

-- A user leaves only themselves.
drop policy if exists "school_members_delete_own" on public.school_members;
create policy "school_members_delete_own"
  on public.school_members for delete to authenticated
  using (user_id = auth.uid());

-- Admins can do everything.
drop policy if exists "school_members_admin_all" on public.school_members;
create policy "school_members_admin_all"
  on public.school_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — film_clubs
-- ---------------------------------------------------------------------------
-- Anyone logged in can read the club directory.
drop policy if exists "film_clubs_select_authenticated" on public.film_clubs;
create policy "film_clubs_select_authenticated"
  on public.film_clubs for select to authenticated using (true);

-- Anyone logged in can create a club as themselves.
drop policy if exists "film_clubs_insert_own" on public.film_clubs;
create policy "film_clubs_insert_own"
  on public.film_clubs for insert to authenticated
  with check (created_by = auth.uid());

-- The creator edits / deletes their own club.
drop policy if exists "film_clubs_update_creator" on public.film_clubs;
create policy "film_clubs_update_creator"
  on public.film_clubs for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "film_clubs_delete_creator" on public.film_clubs;
create policy "film_clubs_delete_creator"
  on public.film_clubs for delete to authenticated
  using (created_by = auth.uid());

-- Admins can do everything.
drop policy if exists "film_clubs_admin_all" on public.film_clubs;
create policy "film_clubs_admin_all"
  on public.film_clubs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — club_members
-- ---------------------------------------------------------------------------
-- Only club members (and admins) see the roster.
drop policy if exists "club_members_select_member" on public.club_members;
create policy "club_members_select_member"
  on public.club_members for select to authenticated
  using (public.is_club_member(club_id));

-- A user joins only as themselves.
drop policy if exists "club_members_insert_own" on public.club_members;
create policy "club_members_insert_own"
  on public.club_members for insert to authenticated
  with check (user_id = auth.uid());

-- A user leaves only themselves.
drop policy if exists "club_members_delete_own" on public.club_members;
create policy "club_members_delete_own"
  on public.club_members for delete to authenticated
  using (user_id = auth.uid());

-- Admins can do everything.
drop policy if exists "club_members_admin_all" on public.club_members;
create policy "club_members_admin_all"
  on public.club_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — club_activities
-- ---------------------------------------------------------------------------
-- Only club members read its activities.
drop policy if exists "club_activities_select_member" on public.club_activities;
create policy "club_activities_select_member"
  on public.club_activities for select to authenticated
  using (public.is_club_member(club_id));

-- The club creator (or an admin) posts activities.
drop policy if exists "club_activities_insert_creator" on public.club_activities;
create policy "club_activities_insert_creator"
  on public.club_activities for insert to authenticated
  with check (created_by = auth.uid() and exists (
    select 1 from public.film_clubs
    where id = club_id and created_by = auth.uid()
  ));

drop policy if exists "club_activities_update_creator" on public.club_activities;
create policy "club_activities_update_creator"
  on public.club_activities for update to authenticated
  using (exists (
    select 1 from public.film_clubs
    where id = club_id and created_by = auth.uid()
  ))
  with check (exists (
    select 1 from public.film_clubs
    where id = club_id and created_by = auth.uid()
  ));

drop policy if exists "club_activities_delete_creator" on public.club_activities;
create policy "club_activities_delete_creator"
  on public.club_activities for delete to authenticated
  using (exists (
    select 1 from public.film_clubs
    where id = club_id and created_by = auth.uid()
  ));

-- Admins can do everything.
drop policy if exists "club_activities_admin_all" on public.club_activities;
create policy "club_activities_admin_all"
  on public.club_activities for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- Done. Verify in the Supabase Dashboard:
--   * Table Editor shows the 10 new tables above.
--   * Authentication -> Policies shows RLS enabled with policies per table.
--   * No seed rows are expected yet (see header note): seed the 5
--     communities + 5 schools from the web app's real seed data in Fase C.
-- Next: 005_projects_crew.sql
-- ============================================================================
