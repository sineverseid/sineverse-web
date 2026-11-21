-- SINEVERSE Academy fix (22 Nov 2026) — supersedes migration 019.
-- 019 inlined the member check as a plain EXISTS on final_project_members,
-- but that table's own SELECT policy has a branch reading final_projects
-- with RLS (the published check), so the two policies called each other
-- forever: Postgres 42P17 "infinite recursion detected in policy for
-- relation final_projects" on every insert (verified live with curl).
-- Correct shape: owner + mentor as DIRECT column checks on the row itself
-- (these are what make INSERT ... RETURNING pass — a STABLE function would
-- be evaluated against the pre-insert snapshot and return false), and the
-- member check via the security-definer helper is_final_project_member(id)
-- (its internal reads bypass RLS, so it cannot recurse; it works fine for
-- ordinary reads, and during an insert its false result is harmless
-- because the owner branch already passes).
-- Idempotent.

drop policy if exists "final_projects_select_published_or_member" on public.final_projects;
create policy "final_projects_select_published_or_member"
  on public.final_projects for select to authenticated
  using (
    status = 'published'
    or owner_id = auth.uid()
    or mentor_id = auth.uid()
    or public.is_final_project_member(id)
    or public.is_admin()
  );
