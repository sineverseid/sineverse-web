-- ============================================================================
-- SINEVERSE — Migration 006: Showcase / Portofolio / Library
-- Project: sineverse (Supabase, Singapore, Postgres 15)
-- Source of truth: ~/workspace/sineverse-app/REBUILD_PLAN.md §2, Migrasi 006
--
-- What it adds (5 tables):
--   films, film_reviews, portfolio_items, library_items, library_bookmarks
--
-- How to apply:
--   Supabase Dashboard -> SQL Editor -> paste this file -> Run.
--   Apply in order 003 -> 008. Requires 001 (profiles/courses/
--   certificates + is_admin()), 004 (schools) and 005 (projects not
--   required, but apply in order anyway).
--
-- Notes:
--   * RLS pattern follows 001 exactly: own-row user_id = auth.uid(),
--     admin via public.is_admin(), public catalog read for authenticated.
--   * Portfolio privacy (G7): in-progress learning + the full certificate
--     list are owner/admin-only in the app. portfolio_items rows marked
--     'private' are owner/admin-only at the RLS level; the app must not
--     create a public portfolio item that exposes in-progress learning
--     or a certificate list.
--   * portfolio_items.visibility = 'community' has NO community_id
--     column in the plan, so there is no "which community" to check
--     against. It is treated here as "any logged-in member" (same as
--     'members'). If a community-scoped portfolio is needed later, add
--     a community_id column + a membership check first.
--   * Library legal-basis rule (G10): a screenplay (naskah) without
--     legal_basis must be rejected IN THE APP (per the plan). No DB
--     CHECK is added, because the plan does not enumerate the category
--     values and a hard check could block legitimate items.
--   * NO seed rows in this file. REBUILD_PLAN.md §0/§2 names only the
--     counts ("7 item Library", "4 film") and never gives their exact
--     titles, bodies, legal bases, or attributions, so seeding here
--     would invent content. Seed the 7 Library items + 4 films from the
--     web app's real seed data when the content is copied over (Fase C).
--   * No secrets, passwords, or service_role keys are in this file.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.films (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  school_id uuid references public.schools (id) on delete set null,
  trailer_url text,
  film_url text,
  poster_url text,
  visibility text not null default 'public'
    check (visibility in ('public', 'private')),
  show_school boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'published')),
  created_at timestamptz not null default now()
);

create table if not exists public.film_reviews (
  id uuid primary key default gen_random_uuid(),
  film_id uuid not null references public.films (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  body text,
  created_at timestamptz not null default now(),
  unique (film_id, user_id)
);

create table if not exists public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null
    check (kind in ('work', 'role', 'skill', 'course', 'certificate', 'achievement')),
  title text not null,
  description text,
  film_id uuid references public.films (id) on delete set null,
  course_id uuid references public.courses (id) on delete set null,
  certificate_id uuid references public.certificates (id) on delete set null,
  visibility text not null default 'members'
    check (visibility in ('public', 'members', 'community', 'private')),
  created_at timestamptz not null default now()
);

create table if not exists public.library_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text,
  body text,
  source_url text,
  legal_basis text,
  attribution text,
  usage_limits text,
  image_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.library_bookmarks (
  id uuid primary key default gen_random_uuid(),
  library_item_id uuid not null references public.library_items (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (library_item_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Indexes on foreign keys
-- ---------------------------------------------------------------------------
create index if not exists films_owner_id_idx
  on public.films (owner_id);
create index if not exists films_school_id_idx
  on public.films (school_id);
create index if not exists film_reviews_film_id_idx
  on public.film_reviews (film_id);
create index if not exists film_reviews_user_id_idx
  on public.film_reviews (user_id);
create index if not exists portfolio_items_user_id_idx
  on public.portfolio_items (user_id);
create index if not exists portfolio_items_film_id_idx
  on public.portfolio_items (film_id);
create index if not exists portfolio_items_course_id_idx
  on public.portfolio_items (course_id);
create index if not exists portfolio_items_certificate_id_idx
  on public.portfolio_items (certificate_id);
create index if not exists library_bookmarks_library_item_id_idx
  on public.library_bookmarks (library_item_id);
create index if not exists library_bookmarks_user_id_idx
  on public.library_bookmarks (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — on for every table
-- ---------------------------------------------------------------------------
alter table public.films enable row level security;
alter table public.film_reviews enable row level security;
alter table public.portfolio_items enable row level security;
alter table public.library_items enable row level security;
alter table public.library_bookmarks enable row level security;

-- ---------------------------------------------------------------------------
-- Policies — films
-- ---------------------------------------------------------------------------
-- Public + published films are visible to everyone logged in; drafts and
-- private films only to their owner.
drop policy if exists "films_select_visible" on public.films;
create policy "films_select_visible"
  on public.films for select to authenticated
  using (
    (visibility = 'public' and status = 'published')
    or owner_id = auth.uid()
  );

-- Anyone logged in can publish a film as themselves (starts as draft).
drop policy if exists "films_insert_own" on public.films;
create policy "films_insert_own"
  on public.films for insert to authenticated
  with check (owner_id = auth.uid());

-- The owner edits / deletes their own films.
drop policy if exists "films_update_owner" on public.films;
create policy "films_update_owner"
  on public.films for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "films_delete_owner" on public.films;
create policy "films_delete_owner"
  on public.films for delete to authenticated
  using (owner_id = auth.uid());

-- Admins can do everything.
drop policy if exists "films_admin_all" on public.films;
create policy "films_admin_all"
  on public.films for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — film_reviews
-- ---------------------------------------------------------------------------
-- Reviews of a public + published film are readable by everyone logged
-- in; reviews of other films only by the reviewer, the film owner, admin.
drop policy if exists "film_reviews_select_visible" on public.film_reviews;
create policy "film_reviews_select_visible"
  on public.film_reviews for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.films f
      where f.id = film_id
        and ((f.visibility = 'public' and f.status = 'published')
             or f.owner_id = auth.uid())
    )
  );

-- Anyone logged in can leave one review per film, as themselves.
drop policy if exists "film_reviews_insert_own" on public.film_reviews;
create policy "film_reviews_insert_own"
  on public.film_reviews for insert to authenticated
  with check (user_id = auth.uid());

-- A user edits / deletes only their own review.
drop policy if exists "film_reviews_update_own" on public.film_reviews;
create policy "film_reviews_update_own"
  on public.film_reviews for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "film_reviews_delete_own" on public.film_reviews;
create policy "film_reviews_delete_own"
  on public.film_reviews for delete to authenticated
  using (user_id = auth.uid());

-- Admins can do everything (moderation).
drop policy if exists "film_reviews_admin_all" on public.film_reviews;
create policy "film_reviews_admin_all"
  on public.film_reviews for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — portfolio_items
-- ---------------------------------------------------------------------------
-- Visibility: 'public' / 'members' / 'community' -> any logged-in user
-- (see header note on 'community'); 'private' -> owner only.
drop policy if exists "portfolio_items_select_visible" on public.portfolio_items;
create policy "portfolio_items_select_visible"
  on public.portfolio_items for select to authenticated
  using (
    visibility in ('public', 'members', 'community')
    or user_id = auth.uid()
  );

-- A user creates portfolio items only as themselves.
drop policy if exists "portfolio_items_insert_own" on public.portfolio_items;
create policy "portfolio_items_insert_own"
  on public.portfolio_items for insert to authenticated
  with check (user_id = auth.uid());

-- A user edits / deletes only their own items.
drop policy if exists "portfolio_items_update_own" on public.portfolio_items;
create policy "portfolio_items_update_own"
  on public.portfolio_items for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "portfolio_items_delete_own" on public.portfolio_items;
create policy "portfolio_items_delete_own"
  on public.portfolio_items for delete to authenticated
  using (user_id = auth.uid());

-- Admins can do everything.
drop policy if exists "portfolio_items_admin_all" on public.portfolio_items;
create policy "portfolio_items_admin_all"
  on public.portfolio_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — library_items
-- ---------------------------------------------------------------------------
-- Anyone logged in can read the Library.
drop policy if exists "library_items_select_authenticated" on public.library_items;
create policy "library_items_select_authenticated"
  on public.library_items for select to authenticated using (true);

-- Only admins manage Library items.
drop policy if exists "library_items_admin_all" on public.library_items;
create policy "library_items_admin_all"
  on public.library_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — library_bookmarks
-- ---------------------------------------------------------------------------
-- A user sees only their own bookmarks.
drop policy if exists "library_bookmarks_select_own" on public.library_bookmarks;
create policy "library_bookmarks_select_own"
  on public.library_bookmarks for select to authenticated
  using (user_id = auth.uid());

-- A user bookmarks only as themselves.
drop policy if exists "library_bookmarks_insert_own" on public.library_bookmarks;
create policy "library_bookmarks_insert_own"
  on public.library_bookmarks for insert to authenticated
  with check (user_id = auth.uid());

-- A user removes only their own bookmark.
drop policy if exists "library_bookmarks_delete_own" on public.library_bookmarks;
create policy "library_bookmarks_delete_own"
  on public.library_bookmarks for delete to authenticated
  using (user_id = auth.uid());

-- Admins can do everything.
drop policy if exists "library_bookmarks_admin_all" on public.library_bookmarks;
create policy "library_bookmarks_admin_all"
  on public.library_bookmarks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- Done. Verify in the Supabase Dashboard:
--   * Table Editor shows the 5 new tables above.
--   * Authentication -> Policies shows RLS enabled with policies per table.
--   * No seed rows are expected yet (see header note): seed the 7 Library
--     items + 4 films from the web app's real seed data in Fase C.
-- Next: 007_events_competitions.sql
-- ============================================================================
