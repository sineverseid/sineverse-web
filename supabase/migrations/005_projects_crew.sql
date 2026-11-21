-- ============================================================================
-- SINEVERSE — Migration 005: Projects / Crew Finder
-- Project: sineverse (Supabase, Singapore, Postgres 15)
-- Source of truth: ~/workspace/sineverse-app/REBUILD_PLAN.md §2, Migrasi 005
--
-- What it adds (9 tables):
--   projects, project_members, project_invites, project_join_requests,
--   project_milestones, project_tasks, project_files, project_updates,
--   project_templates
-- Plus ALTER TABLE additions on profiles (skills, interests, availability,
-- is_open_to_crew) for Crew Finder.
-- Seeds: the 4 system project templates (Film Pendek Fiksi, Dokumenter
-- Sekolah, Video Musik/Klip, Animasi Pendek), idempotent by slug.
--
-- How to apply:
--   Supabase Dashboard -> SQL Editor -> paste this file -> Run.
--   Apply in order 003 -> 008. Requires 001 (profiles + is_admin())
--   and 004 (schools, film_clubs) for the project school/club links.
--
-- Notes:
--   * RLS pattern follows 001 exactly: own-row user_id = auth.uid(),
--     admin via public.is_admin(). Project membership checks use the
--     security-definer helpers below so a policy never queries the same
--     membership table it protects (that would recurse under RLS).
--   * project_milestones / project_tasks: the plan says "tulis: anggota
--     dengan permission". The fine-grained per-role permission JSON
--     (project_members.permissions) is enforced in the app; RLS here
--     admits any project member to write, which is the enforceable
--     server-side boundary without a permission-checking RPC.
--   * Crew Finder reads only the safe-public profile fields (skills,
--     interests, availability, is_open_to_crew, name, city, photo_url).
--     The app must NOT select * from profiles for Crew Finder — email
--     and phone must never be exposed there.
--   * No secrets, passwords, or service_role keys are in this file.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  access_mode text not null default 'open'
    check (access_mode in ('open', 'approval', 'invite_only')),
  template text,
  school_id uuid references public.schools (id) on delete set null,
  club_id uuid references public.film_clubs (id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text,
  permissions jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create table if not exists public.project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now()
);

create table if not exists public.project_join_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  message text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  is_done boolean not null default false,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  milestone_id uuid references public.project_milestones (id) on delete set null,
  title text not null,
  description text,
  status text not null default 'rencana'
    check (status in ('rencana', 'dikerjakan', 'tinjauan', 'selesai')),
  priority text,
  due_date date,
  assignee_id uuid references public.profiles (id) on delete set null,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null default 'other'
    check (kind in ('reference', 'storyboard', 'shot_list', 'production', 'other')),
  title text not null,
  url text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.project_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  stages jsonb,
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper functions (moved after tables: SQL-language functions are
-- validated at creation, so they must be defined after the tables they query)
-- ---------------------------------------------------------------------------
create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id and user_id = auth.uid()
  )
  or exists (
    select 1 from public.projects
    where id = p_project_id and owner_id = auth.uid()
  );
$$;

create or replace function public.is_project_owner(p_project_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.projects
    where id = p_project_id and owner_id = auth.uid()
  );
$$;

grant execute on function public.is_project_member(uuid) to authenticated;
grant execute on function public.is_project_owner(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- Column additions on profiles (Crew Finder)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists skills text[];
alter table public.profiles
  add column if not exists interests text[];
alter table public.profiles
  add column if not exists availability text;
alter table public.profiles
  add column if not exists is_open_to_crew boolean not null default false;

-- ---------------------------------------------------------------------------
-- Indexes on foreign keys
-- ---------------------------------------------------------------------------
create index if not exists projects_owner_id_idx
  on public.projects (owner_id);
create index if not exists projects_school_id_idx
  on public.projects (school_id);
create index if not exists projects_club_id_idx
  on public.projects (club_id);
create index if not exists project_members_project_id_idx
  on public.project_members (project_id);
create index if not exists project_members_user_id_idx
  on public.project_members (user_id);
create index if not exists project_invites_project_id_idx
  on public.project_invites (project_id);
create index if not exists project_invites_inviter_id_idx
  on public.project_invites (inviter_id);
create index if not exists project_invites_invitee_id_idx
  on public.project_invites (invitee_id);
create index if not exists project_join_requests_project_id_idx
  on public.project_join_requests (project_id);
create index if not exists project_join_requests_user_id_idx
  on public.project_join_requests (user_id);
create index if not exists project_join_requests_decided_by_idx
  on public.project_join_requests (decided_by);
create index if not exists project_milestones_project_id_idx
  on public.project_milestones (project_id);
create index if not exists project_tasks_project_id_idx
  on public.project_tasks (project_id);
create index if not exists project_tasks_milestone_id_idx
  on public.project_tasks (milestone_id);
create index if not exists project_tasks_assignee_id_idx
  on public.project_tasks (assignee_id);
create index if not exists project_files_project_id_idx
  on public.project_files (project_id);
create index if not exists project_files_uploaded_by_idx
  on public.project_files (uploaded_by);
create index if not exists project_updates_project_id_idx
  on public.project_updates (project_id);
create index if not exists project_updates_user_id_idx
  on public.project_updates (user_id);
create index if not exists project_templates_slug_idx
  on public.project_templates (slug);

-- ---------------------------------------------------------------------------
-- Row Level Security — on for every table
-- ---------------------------------------------------------------------------
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_invites enable row level security;
alter table public.project_join_requests enable row level security;
alter table public.project_milestones enable row level security;
alter table public.project_tasks enable row level security;
alter table public.project_files enable row level security;
alter table public.project_updates enable row level security;
alter table public.project_templates enable row level security;

-- ---------------------------------------------------------------------------
-- Policies — projects
-- ---------------------------------------------------------------------------
-- Open projects are visible to everyone logged in; restricted projects
-- only to their members (the owner counts as a member via the helper).
drop policy if exists "projects_select_visible" on public.projects;
create policy "projects_select_visible"
  on public.projects for select to authenticated
  using (access_mode = 'open' or public.is_project_member(id));

-- Anyone logged in can create a project as themselves.
drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own"
  on public.projects for insert to authenticated
  with check (owner_id = auth.uid());

-- The owner edits / deletes their own project.
drop policy if exists "projects_update_owner" on public.projects;
create policy "projects_update_owner"
  on public.projects for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "projects_delete_owner" on public.projects;
create policy "projects_delete_owner"
  on public.projects for delete to authenticated
  using (owner_id = auth.uid());

-- Admins can do everything.
drop policy if exists "projects_admin_all" on public.projects;
create policy "projects_admin_all"
  on public.projects for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — project_members
-- ---------------------------------------------------------------------------
-- Only project members see the roster.
drop policy if exists "project_members_select_member" on public.project_members;
create policy "project_members_select_member"
  on public.project_members for select to authenticated
  using (public.is_project_member(project_id));

-- The owner adds members (invite / approve); anyone may join an open
-- project as themselves.
drop policy if exists "project_members_insert_owner_or_open" on public.project_members;
create policy "project_members_insert_owner_or_open"
  on public.project_members for insert to authenticated
  with check (
    public.is_project_owner(project_id)
    or (user_id = auth.uid() and exists (
      select 1 from public.projects
      where id = project_id and access_mode = 'open'
    ))
  );

-- The owner changes roles / permissions.
drop policy if exists "project_members_update_owner" on public.project_members;
create policy "project_members_update_owner"
  on public.project_members for update to authenticated
  using (public.is_project_owner(project_id))
  with check (public.is_project_owner(project_id));

-- The owner removes a member; a member leaves by themselves.
drop policy if exists "project_members_delete_owner_or_own" on public.project_members;
create policy "project_members_delete_owner_or_own"
  on public.project_members for delete to authenticated
  using (public.is_project_owner(project_id) or user_id = auth.uid());

-- Admins can do everything.
drop policy if exists "project_members_admin_all" on public.project_members;
create policy "project_members_admin_all"
  on public.project_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — project_invites
-- ---------------------------------------------------------------------------
-- Inviter, invitee, project owner, and admin can see an invite.
drop policy if exists "project_invites_select_party" on public.project_invites;
create policy "project_invites_select_party"
  on public.project_invites for select to authenticated
  using (
    inviter_id = auth.uid()
    or invitee_id = auth.uid()
    or public.is_project_owner(project_id)
  );

-- Only the project owner invites, as themselves.
drop policy if exists "project_invites_insert_owner" on public.project_invites;
create policy "project_invites_insert_owner"
  on public.project_invites for insert to authenticated
  with check (
    inviter_id = auth.uid()
    and public.is_project_owner(project_id)
  );

-- The invitee answers (accept / decline); the owner may also update.
drop policy if exists "project_invites_update_invitee" on public.project_invites;
create policy "project_invites_update_invitee"
  on public.project_invites for update to authenticated
  using (invitee_id = auth.uid() or public.is_project_owner(project_id))
  with check (invitee_id = auth.uid() or public.is_project_owner(project_id));

-- Admins can do everything.
drop policy if exists "project_invites_admin_all" on public.project_invites;
create policy "project_invites_admin_all"
  on public.project_invites for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — project_join_requests
-- ---------------------------------------------------------------------------
-- The requester, the project owner, and admin can see a request.
drop policy if exists "project_join_requests_select_party" on public.project_join_requests;
create policy "project_join_requests_select_party"
  on public.project_join_requests for select to authenticated
  using (user_id = auth.uid() or public.is_project_owner(project_id));

-- Anyone logged in can request to join as themselves.
drop policy if exists "project_join_requests_insert_own" on public.project_join_requests;
create policy "project_join_requests_insert_own"
  on public.project_join_requests for insert to authenticated
  with check (user_id = auth.uid());

-- The project owner decides (approve / reject).
drop policy if exists "project_join_requests_update_owner" on public.project_join_requests;
create policy "project_join_requests_update_owner"
  on public.project_join_requests for update to authenticated
  using (public.is_project_owner(project_id))
  with check (public.is_project_owner(project_id));

-- Admins can do everything.
drop policy if exists "project_join_requests_admin_all" on public.project_join_requests;
create policy "project_join_requests_admin_all"
  on public.project_join_requests for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — project_milestones
-- ---------------------------------------------------------------------------
-- Only project members read milestones.
drop policy if exists "project_milestones_select_member" on public.project_milestones;
create policy "project_milestones_select_member"
  on public.project_milestones for select to authenticated
  using (public.is_project_member(project_id));

-- Members write milestones (fine-grained role permissions live in
-- project_members.permissions and are enforced in the app).
drop policy if exists "project_milestones_insert_member" on public.project_milestones;
create policy "project_milestones_insert_member"
  on public.project_milestones for insert to authenticated
  with check (public.is_project_member(project_id));

drop policy if exists "project_milestones_update_member" on public.project_milestones;
create policy "project_milestones_update_member"
  on public.project_milestones for update to authenticated
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

drop policy if exists "project_milestones_delete_member" on public.project_milestones;
create policy "project_milestones_delete_member"
  on public.project_milestones for delete to authenticated
  using (public.is_project_member(project_id));

-- Admins can do everything.
drop policy if exists "project_milestones_admin_all" on public.project_milestones;
create policy "project_milestones_admin_all"
  on public.project_milestones for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — project_tasks (kanban)
-- ---------------------------------------------------------------------------
-- Only project members read tasks.
drop policy if exists "project_tasks_select_member" on public.project_tasks;
create policy "project_tasks_select_member"
  on public.project_tasks for select to authenticated
  using (public.is_project_member(project_id));

-- Members write tasks (fine-grained role permissions enforced in the app).
drop policy if exists "project_tasks_insert_member" on public.project_tasks;
create policy "project_tasks_insert_member"
  on public.project_tasks for insert to authenticated
  with check (public.is_project_member(project_id));

drop policy if exists "project_tasks_update_member" on public.project_tasks;
create policy "project_tasks_update_member"
  on public.project_tasks for update to authenticated
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

drop policy if exists "project_tasks_delete_member" on public.project_tasks;
create policy "project_tasks_delete_member"
  on public.project_tasks for delete to authenticated
  using (public.is_project_member(project_id));

-- Admins can do everything.
drop policy if exists "project_tasks_admin_all" on public.project_tasks;
create policy "project_tasks_admin_all"
  on public.project_tasks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — project_files
-- ---------------------------------------------------------------------------
-- Only project members read files.
drop policy if exists "project_files_select_member" on public.project_files;
create policy "project_files_select_member"
  on public.project_files for select to authenticated
  using (public.is_project_member(project_id));

-- Members upload files as themselves.
drop policy if exists "project_files_insert_member" on public.project_files;
create policy "project_files_insert_member"
  on public.project_files for insert to authenticated
  with check (public.is_project_member(project_id) and uploaded_by = auth.uid());

-- Members edit / delete files.
drop policy if exists "project_files_update_member" on public.project_files;
create policy "project_files_update_member"
  on public.project_files for update to authenticated
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

drop policy if exists "project_files_delete_member" on public.project_files;
create policy "project_files_delete_member"
  on public.project_files for delete to authenticated
  using (public.is_project_member(project_id));

-- Admins can do everything.
drop policy if exists "project_files_admin_all" on public.project_files;
create policy "project_files_admin_all"
  on public.project_files for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — project_updates
-- ---------------------------------------------------------------------------
-- Only project members read updates.
drop policy if exists "project_updates_select_member" on public.project_updates;
create policy "project_updates_select_member"
  on public.project_updates for select to authenticated
  using (public.is_project_member(project_id));

-- Members post updates as themselves.
drop policy if exists "project_updates_insert_member" on public.project_updates;
create policy "project_updates_insert_member"
  on public.project_updates for insert to authenticated
  with check (user_id = auth.uid() and public.is_project_member(project_id));

-- A member edits / deletes only their own updates.
drop policy if exists "project_updates_update_own" on public.project_updates;
create policy "project_updates_update_own"
  on public.project_updates for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "project_updates_delete_own" on public.project_updates;
create policy "project_updates_delete_own"
  on public.project_updates for delete to authenticated
  using (user_id = auth.uid());

-- Admins can do everything.
drop policy if exists "project_updates_admin_all" on public.project_updates;
create policy "project_updates_admin_all"
  on public.project_updates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — project_templates
-- ---------------------------------------------------------------------------
-- Anyone logged in can read the templates.
drop policy if exists "project_templates_select_authenticated" on public.project_templates;
create policy "project_templates_select_authenticated"
  on public.project_templates for select to authenticated using (true);

-- Only admins manage templates.
drop policy if exists "project_templates_admin_all" on public.project_templates;
create policy "project_templates_admin_all"
  on public.project_templates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Seed: the 4 system project templates from the web app.
-- Idempotent: safe to re-run (ON CONFLICT DO NOTHING on slug).
-- ---------------------------------------------------------------------------
insert into public.project_templates (slug, title, description, stages, is_system)
values
  ('film-pendek-fiksi', 'Film Pendek Fiksi',
   'Template produksi film pendek fiksi: dari ide cerita sampai film selesai dan siap dipublikasikan ke Showcase.',
   '["Ide & Sinopsis", "Penulisan Skenario", "Storyboard & Shot List", "Pra-Produksi", "Syuting", "Editing & Sound", "Publikasi"]'::jsonb,
   true),
  ('dokumenter-sekolah', 'Dokumenter Sekolah',
   'Template film dokumenter tentang kehidupan sekolah: riset lapangan, wawancara, dan penyusunan kisah nyata.',
   '["Riset & Observasi", "Perencanaan Liputan", "Wawancara", "Syuting Lapangan", "Editing", "Publikasi"]'::jsonb,
   true),
  ('video-musik-klip', 'Video Musik/Klip',
   'Template video musik atau klip: konsep visual, sinkronisasi dengan lagu, dan editing berirama.',
   '["Konsep & Referensi", "Storyboard Visual", "Pra-Produksi", "Syuting", "Editing & Grading", "Publikasi"]'::jsonb,
   true),
  ('animasi-pendek', 'Animasi Pendek',
   'Template animasi pendek: dari sketsa karakter dan storyboard sampai animasi dan sound design.',
   '["Ide & Sketsa", "Storyboard", "Desain Karakter & Aset", "Animasi", "Suara & Musik", "Rendering & Publikasi"]'::jsonb,
   true)
on conflict (slug) do nothing;

-- ============================================================================
-- Done. Verify in the Supabase Dashboard:
--   * Table Editor shows the 9 new tables above.
--   * Table Editor -> project_templates shows 4 rows (the system templates).
--   * Authentication -> Policies shows RLS enabled with policies per table.
-- Next: 006_showcase_portfolio_library.sql
-- ============================================================================
