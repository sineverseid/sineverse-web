-- ============================================================================
-- SINEVERSE — Migration 007: Events / Kompetisi
-- Project: sineverse (Supabase, Singapore, Postgres 15)
-- Source of truth: ~/workspace/sineverse-app/REBUILD_PLAN.md §2, Migrasi 007
--
-- What it adds (8 tables):
--   events, event_sessions, event_registrations, competitions,
--   competition_judges, competition_submissions, competition_scores,
--   competition_winners
--
-- How to apply:
--   Supabase Dashboard -> SQL Editor -> paste this file -> Run.
--   Apply in order 003 -> 008. Requires 001 (profiles + is_admin())
--   and 006 (films) for competition_submissions.film_id.
--
-- Notes:
--   * RLS pattern follows 001 exactly: own-row user_id = auth.uid(),
--     admin via public.is_admin(), public catalog read for authenticated.
--   * COMPETITION-SCORE GATING (critical, H9 / rule §5): scores are
--     visible ONLY to the competition's judges and admins until the
--     competition status = 'selesai'. After 'selesai', a participant may
--     see the scores of THEIR OWN submission only — never another
--     participant's. This is enforced in the competition_scores SELECT
--     policy below, not in the app.
--   * Judges may insert/update scores ONLY while the competition status
--     is 'penjurian' (enforced in the WITH CHECK / USING clauses).
--   * competition_submissions may be inserted ONLY while the competition
--     is 'dibuka', before its deadline, and with BOTH consents true
--     (copyright_consent + usage_consent) — enforced in WITH CHECK.
--   * Event capacity is NOT enforced in RLS (a count check races under
--     concurrency); the app must check the registration count before
--     inserting, or a capacity-checking RPC must be added later.
--   * External events: no in-app registration — users follow the
--     organizer's official_link (H5). The app must hide the register
--     button when kind = 'external'.
--   * No secrets, passwords, or service_role keys are in this file.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  kind text not null default 'internal'
    check (kind in ('internal', 'external')),
  organizer text,
  official_link text,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  capacity int,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.event_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  title text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  description text,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  attended boolean not null default false,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'draft'
    check (status in ('draft', 'dibuka', 'penjurian', 'selesai')),
  deadline timestamptz,
  categories jsonb,
  criteria jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.competition_judges (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  judge_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (competition_id, judge_id)
);

create table if not exists public.competition_submissions (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  film_id uuid references public.films (id) on delete set null,
  link text,
  category text,
  copyright_consent boolean not null default false,
  usage_consent boolean not null default false,
  status text not null default 'submitted',
  created_at timestamptz not null default now()
);

create table if not exists public.competition_scores (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.competition_submissions (id) on delete cascade,
  judge_id uuid not null references public.profiles (id) on delete cascade,
  criterion text not null,
  score int,
  comment text,
  created_at timestamptz not null default now(),
  unique (submission_id, judge_id, criterion)
);

create table if not exists public.competition_winners (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  submission_id uuid not null references public.competition_submissions (id) on delete cascade,
  category text,
  rank int,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper functions (moved after tables: SQL-language functions are
-- validated at creation, so they must be defined after the tables they query)
-- ---------------------------------------------------------------------------
create or replace function public.is_mentor()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'mentor'
  );
$$;

create or replace function public.is_competition_judge(p_competition_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.competition_judges
    where competition_id = p_competition_id and judge_id = auth.uid()
  );
$$;

grant execute on function public.is_mentor() to authenticated;
grant execute on function public.is_competition_judge(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- Indexes on foreign keys
-- ---------------------------------------------------------------------------
create index if not exists events_created_by_idx
  on public.events (created_by);
create index if not exists event_sessions_event_id_idx
  on public.event_sessions (event_id);
create index if not exists event_registrations_event_id_idx
  on public.event_registrations (event_id);
create index if not exists event_registrations_user_id_idx
  on public.event_registrations (user_id);
create index if not exists competitions_created_by_idx
  on public.competitions (created_by);
create index if not exists competition_judges_competition_id_idx
  on public.competition_judges (competition_id);
create index if not exists competition_judges_judge_id_idx
  on public.competition_judges (judge_id);
create index if not exists competition_submissions_competition_id_idx
  on public.competition_submissions (competition_id);
create index if not exists competition_submissions_user_id_idx
  on public.competition_submissions (user_id);
create index if not exists competition_submissions_film_id_idx
  on public.competition_submissions (film_id);
create index if not exists competition_scores_submission_id_idx
  on public.competition_scores (submission_id);
create index if not exists competition_scores_judge_id_idx
  on public.competition_scores (judge_id);
create index if not exists competition_winners_competition_id_idx
  on public.competition_winners (competition_id);
create index if not exists competition_winners_submission_id_idx
  on public.competition_winners (submission_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — on for every table
-- ---------------------------------------------------------------------------
alter table public.events enable row level security;
alter table public.event_sessions enable row level security;
alter table public.event_registrations enable row level security;
alter table public.competitions enable row level security;
alter table public.competition_judges enable row level security;
alter table public.competition_submissions enable row level security;
alter table public.competition_scores enable row level security;
alter table public.competition_winners enable row level security;

-- ---------------------------------------------------------------------------
-- Policies — events
-- ---------------------------------------------------------------------------
-- Anyone logged in can read the event list.
drop policy if exists "events_select_authenticated" on public.events;
create policy "events_select_authenticated"
  on public.events for select to authenticated using (true);

-- A mentor (or admin) creates events as themselves.
drop policy if exists "events_insert_mentor" on public.events;
create policy "events_insert_mentor"
  on public.events for insert to authenticated
  with check (
    created_by = auth.uid()
    and (public.is_mentor() or public.is_admin())
  );

-- The creator edits / deletes their own events.
drop policy if exists "events_update_creator" on public.events;
create policy "events_update_creator"
  on public.events for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "events_delete_creator" on public.events;
create policy "events_delete_creator"
  on public.events for delete to authenticated
  using (created_by = auth.uid());

-- Admins can do everything.
drop policy if exists "events_admin_all" on public.events;
create policy "events_admin_all"
  on public.events for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — event_sessions
-- ---------------------------------------------------------------------------
-- Anyone logged in can read the rundown.
drop policy if exists "event_sessions_select_authenticated" on public.event_sessions;
create policy "event_sessions_select_authenticated"
  on public.event_sessions for select to authenticated using (true);

-- The event creator manages its sessions.
drop policy if exists "event_sessions_insert_creator" on public.event_sessions;
create policy "event_sessions_insert_creator"
  on public.event_sessions for insert to authenticated
  with check (exists (
    select 1 from public.events
    where id = event_id and created_by = auth.uid()
  ));

drop policy if exists "event_sessions_update_creator" on public.event_sessions;
create policy "event_sessions_update_creator"
  on public.event_sessions for update to authenticated
  using (exists (
    select 1 from public.events
    where id = event_id and created_by = auth.uid()
  ))
  with check (exists (
    select 1 from public.events
    where id = event_id and created_by = auth.uid()
  ));

drop policy if exists "event_sessions_delete_creator" on public.event_sessions;
create policy "event_sessions_delete_creator"
  on public.event_sessions for delete to authenticated
  using (exists (
    select 1 from public.events
    where id = event_id and created_by = auth.uid()
  ));

-- Admins can do everything.
drop policy if exists "event_sessions_admin_all" on public.event_sessions;
create policy "event_sessions_admin_all"
  on public.event_sessions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — event_registrations
-- ---------------------------------------------------------------------------
-- A user sees their own registrations; the event creator sees all of them.
drop policy if exists "event_registrations_select_own_or_creator" on public.event_registrations;
create policy "event_registrations_select_own_or_creator"
  on public.event_registrations for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.events
      where id = event_id and created_by = auth.uid()
    )
  );

-- A user registers only as themselves (capacity is checked in the app).
drop policy if exists "event_registrations_insert_own" on public.event_registrations;
create policy "event_registrations_insert_own"
  on public.event_registrations for insert to authenticated
  with check (user_id = auth.uid());

-- The event creator marks attendance.
drop policy if exists "event_registrations_update_creator" on public.event_registrations;
create policy "event_registrations_update_creator"
  on public.event_registrations for update to authenticated
  using (exists (
    select 1 from public.events
    where id = event_id and created_by = auth.uid()
  ))
  with check (exists (
    select 1 from public.events
    where id = event_id and created_by = auth.uid()
  ));

-- A user cancels only their own registration.
drop policy if exists "event_registrations_delete_own" on public.event_registrations;
create policy "event_registrations_delete_own"
  on public.event_registrations for delete to authenticated
  using (user_id = auth.uid());

-- Admins can do everything.
drop policy if exists "event_registrations_admin_all" on public.event_registrations;
create policy "event_registrations_admin_all"
  on public.event_registrations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — competitions
-- ---------------------------------------------------------------------------
-- Anyone logged in can read the competition list.
drop policy if exists "competitions_select_authenticated" on public.competitions;
create policy "competitions_select_authenticated"
  on public.competitions for select to authenticated using (true);

-- A mentor (or admin) creates competitions as themselves.
drop policy if exists "competitions_insert_mentor" on public.competitions;
create policy "competitions_insert_mentor"
  on public.competitions for insert to authenticated
  with check (
    created_by = auth.uid()
    and (public.is_mentor() or public.is_admin())
  );

-- The creator edits / deletes their own competitions.
drop policy if exists "competitions_update_creator" on public.competitions;
create policy "competitions_update_creator"
  on public.competitions for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "competitions_delete_creator" on public.competitions;
create policy "competitions_delete_creator"
  on public.competitions for delete to authenticated
  using (created_by = auth.uid());

-- Admins can do everything.
drop policy if exists "competitions_admin_all" on public.competitions;
create policy "competitions_admin_all"
  on public.competitions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — competition_judges
-- ---------------------------------------------------------------------------
-- A judge sees their own assignment; the competition creator sees the panel.
drop policy if exists "competition_judges_select_party" on public.competition_judges;
create policy "competition_judges_select_party"
  on public.competition_judges for select to authenticated
  using (
    judge_id = auth.uid()
    or exists (
      select 1 from public.competitions
      where id = competition_id and created_by = auth.uid()
    )
  );

-- Only admins manage the judge panel.
drop policy if exists "competition_judges_admin_all" on public.competition_judges;
create policy "competition_judges_admin_all"
  on public.competition_judges for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — competition_submissions
-- ---------------------------------------------------------------------------
-- A user sees their own submissions; judges and the competition creator
-- see all submissions of that competition.
drop policy if exists "competition_submissions_select_party" on public.competition_submissions;
create policy "competition_submissions_select_party"
  on public.competition_submissions for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_competition_judge(competition_id)
    or exists (
      select 1 from public.competitions
      where id = competition_id and created_by = auth.uid()
    )
  );

-- A user submits only as themselves, ONLY while the competition is
-- 'dibuka', before its deadline, and with BOTH consents given.
drop policy if exists "competition_submissions_insert_own_open" on public.competition_submissions;
create policy "competition_submissions_insert_own_open"
  on public.competition_submissions for insert to authenticated
  with check (
    user_id = auth.uid()
    and copyright_consent is true
    and usage_consent is true
    and exists (
      select 1 from public.competitions
      where id = competition_id
        and status = 'dibuka'
        and (deadline is null or now() < deadline)
    )
  );

-- The submitter may edit their own submission (link / category); the
-- competition creator may also update it.
drop policy if exists "competition_submissions_update_party" on public.competition_submissions;
create policy "competition_submissions_update_party"
  on public.competition_submissions for update to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.competitions
      where id = competition_id and created_by = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.competitions
      where id = competition_id and created_by = auth.uid()
    )
  );

-- Admins can do everything.
drop policy if exists "competition_submissions_admin_all" on public.competition_submissions;
create policy "competition_submissions_admin_all"
  on public.competition_submissions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — competition_scores (GATING IS CRITICAL — see header)
-- ---------------------------------------------------------------------------
-- READ: judges of the competition and admins always. A participant sees
-- scores ONLY for their own submission AND ONLY after the competition
-- status is 'selesai'. Nobody else sees any score, ever.
drop policy if exists "competition_scores_select_gated" on public.competition_scores;
create policy "competition_scores_select_gated"
  on public.competition_scores for select to authenticated
  using (exists (
    select 1
    from public.competition_submissions s
    join public.competitions c on c.id = s.competition_id
    where s.id = submission_id
      and (
        public.is_competition_judge(s.competition_id)
        or (s.user_id = auth.uid() and c.status = 'selesai')
      )
  ));

-- WRITE: only a judge of that competition, only while its status is
-- 'penjurian', and only as themselves.
drop policy if exists "competition_scores_insert_judge" on public.competition_scores;
create policy "competition_scores_insert_judge"
  on public.competition_scores for insert to authenticated
  with check (
    judge_id = auth.uid()
    and exists (
      select 1
      from public.competition_submissions s
      join public.competitions c on c.id = s.competition_id
      where s.id = submission_id
        and c.status = 'penjurian'
        and public.is_competition_judge(s.competition_id)
    )
  );

drop policy if exists "competition_scores_update_judge" on public.competition_scores;
create policy "competition_scores_update_judge"
  on public.competition_scores for update to authenticated
  using (
    judge_id = auth.uid()
    and exists (
      select 1
      from public.competition_submissions s
      join public.competitions c on c.id = s.competition_id
      where s.id = submission_id
        and c.status = 'penjurian'
        and public.is_competition_judge(s.competition_id)
    )
  )
  with check (
    judge_id = auth.uid()
    and exists (
      select 1
      from public.competition_submissions s
      join public.competitions c on c.id = s.competition_id
      where s.id = submission_id
        and c.status = 'penjurian'
        and public.is_competition_judge(s.competition_id)
    )
  );

-- Admins can do everything (incl. reading scores before 'selesai' and
-- deleting a wrongly entered score).
drop policy if exists "competition_scores_admin_all" on public.competition_scores;
create policy "competition_scores_admin_all"
  on public.competition_scores for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Policies — competition_winners
-- ---------------------------------------------------------------------------
-- Winners are visible to everyone logged in ONLY once the competition is
-- 'selesai'; before that, only the competition creator sees them.
drop policy if exists "competition_winners_select_finished" on public.competition_winners;
create policy "competition_winners_select_finished"
  on public.competition_winners for select to authenticated
  using (exists (
    select 1 from public.competitions
    where id = competition_id
      and (status = 'selesai' or created_by = auth.uid())
  ));

-- Only admins declare winners.
drop policy if exists "competition_winners_admin_all" on public.competition_winners;
create policy "competition_winners_admin_all"
  on public.competition_winners for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- Done. Verify in the Supabase Dashboard:
--   * Table Editor shows the 8 new tables above.
--   * Authentication -> Policies shows RLS enabled with policies per table.
--   * Spot-check the gating: as a participant, SELECT on
--     competition_scores of another participant's submission (or before
--     'selesai') must return 0 rows; as a judge it must return rows.
-- Next: 008_mentor_admin_growth.sql
-- ============================================================================
