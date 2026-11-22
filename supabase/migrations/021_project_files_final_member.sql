-- SINEVERSE Academy fix (found in Stage 5 re-verification, 22 Nov 2026):
-- Final Project file uploads to the `project-files` storage bucket always
-- failed with 403 "new row violates row-level security policy" (verified
-- live with curl as Siswa Uji: storage upload 403, while the
-- final_project_files DB row itself inserts fine).
-- Root cause: the live storage policies (README baseline) check only
-- is_project_member(), the helper from migration 005 for GENERAL projects
-- (project_members / projects tables). A FINAL project id never matches
-- those tables, so the check is always false for Final Project files.
-- Fix: add two permissive policies that mirror the DB-level
-- final_project_files policies (member + mentor + admin) using the
-- is_final_project_member / is_final_project_mentor helpers. The existing
-- general-project policies are left untouched, so both project types work.
-- Idempotent.

drop policy if exists "project_files_insert_final_member" on storage.objects;
create policy "project_files_insert_final_member" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'project-files'
  and (
    public.is_final_project_member(((storage.foldername(name))[1])::uuid)
    or public.is_final_project_mentor(((storage.foldername(name))[1])::uuid)
    or public.is_admin()
  )
);

drop policy if exists "project_files_select_final_member" on storage.objects;
create policy "project_files_select_final_member" on storage.objects
for select to authenticated
using (
  bucket_id = 'project-files'
  and (
    public.is_final_project_member(((storage.foldername(name))[1])::uuid)
    or public.is_final_project_mentor(((storage.foldername(name))[1])::uuid)
    or public.is_admin()
  )
);
