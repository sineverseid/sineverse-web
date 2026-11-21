-- SINEVERSE Academy fix (found in Stage 5 live verification, 22 Nov 2026):
-- Creating a Final Project failed with 42501 even though the INSERT policy
-- (owner_id = auth.uid()) was satisfied and the row was then visible to a
-- separate SELECT. Root cause, reproduced with curl as Siswa Uji:
--   * INSERT + return=representation (status 'draft')  -> 403
--   * INSERT + return=minimal (status 'draft')         -> 201, row visible
--   * INSERT + return=representation (status 'published') -> 201
--   * RPC is_final_project_member(new row) as owner    -> true
-- The SELECT policy called is_final_project_member(id), a STABLE function.
-- During INSERT ... RETURNING Postgres evaluates that function against the
-- pre-insert snapshot, so the owner's own just-inserted draft row was
-- denied — while a later SELECT sees it fine. The app inserts with
-- .select().single() (PostgREST RETURNING), so every creation failed.
-- Fix: inline the owner + mentor checks on the row itself (no function
-- call) in the SELECT policy, keeping the members EXISTS subquery and
-- is_admin(). Child tables (members/tasks/files/reviews) are unaffected:
-- their policies check the PARENT project row, which already exists when
-- a child row is inserted.
-- Idempotent.

drop policy if exists "final_projects_select_published_or_member" on public.final_projects;
create policy "final_projects_select_published_or_member"
  on public.final_projects for select to authenticated
  using (
    status = 'published'
    or owner_id = auth.uid()
    or mentor_id = auth.uid()
    or exists (
      select 1 from public.final_project_members m
      where m.project_id = id and m.user_id = auth.uid()
    )
    or public.is_admin()
  );
