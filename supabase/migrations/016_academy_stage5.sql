-- SINEVERSE Academy Stage 5 — course certificates (SVS-CRS) + Final Project
-- Part A: issue_course_certificate() RPC (security definer). The caller must
-- be an admin or a teacher of the course (courses.mentor_id or
-- course_teachers). Eligibility is computed SERVER-SIDE from the same
-- 5-component formula as GradebookPage / lib/grading.ts, so a score is
-- never invented by the client:
--   final = Pretest 5% + Posttest 15% + tugas mingguan 30%
--         + tugas praktik akhir 40% + partisipasi diskusi 10%
--   (weights + passing grade read from the rps row SVS-SEM1, with the
--   master-prompt defaults as fallback; null components are excluded and
--   the remaining weights are renormalized).
-- Discussion score = min(100, distinctLessons * 10 + totalPosts * 2).
-- Serials follow the exam pattern: SVS-CRS-YYYY-NNNN, count-based with a
-- retry-safe fallback on conflict.
-- Part B: final_projects + final_project_members / _tasks / _files /
-- _reviews tables with RLS (team members + mentor + admin write; everyone
-- else reads only published projects).
-- Idempotent: create table/function if not exists + drop/create policies.
-- No certificate_templates / certificate_verifications tables: the three
-- certificate designs already live in CertificatesPage (per type), and
-- verification is a serial lookup on the certificates table — a separate
-- log table adds nothing the UI needs. No final_project_roles table:
-- the jobdesk is free text on final_project_members.role.

-- ---------------------------------------------------------------------------
-- Part A — issue_course_certificate(p_course_id, p_user_id)
-- Returns: serial text, score int, already_issued boolean.
-- ---------------------------------------------------------------------------
create or replace function public.issue_course_certificate(p_course_id uuid, p_user_id uuid)
returns table (serial text, score int, already_issued boolean)
language plpgsql
security definer
as $$
-- BUGFIX 2 (22 Nov 2026): nama parameter output "serial" bertabrakan dengan
-- kolom certificates.serial. Setelah query count diperbaiki (kualifikasi
-- public.certificates.serial), ambiguitas BERIKUTNYA muncul di
-- "on conflict (serial)" — PL/pgSQL menganggapnya bisa variabel atau kolom
-- (error 42702 yang sama). Dua lapis perbaikan: (a) direktif di bawah
-- memaksa semua referensi ambigu di fungsi ini dibaca sebagai KOLOM;
-- (b) on conflict memakai nama constraint, bukan nama kolom.
#variable_conflict use_column
declare
  v_caller uuid := auth.uid();
  v_is_admin boolean := public.is_admin();
  v_is_teacher boolean := public.is_course_teacher(p_course_id);
  v_enrolled boolean;
  v_existing record;
  v_weights jsonb;
  v_passing numeric := 70;
  v_w_pretest numeric := 5;
  v_w_posttest numeric := 15;
  v_w_weekly numeric := 30;
  v_w_final numeric := 40;
  v_w_discussion numeric := 10;
  v_pretest numeric;
  v_posttest numeric;
  v_weekly numeric;
  v_final_practice numeric;
  v_discussion numeric;
  v_post_count int := 0;
  v_distinct_lessons int := 0;
  v_final numeric := 0;
  v_weight_sum numeric := 0;
  v_seq int;
  v_serial text;
  v_year text := extract(year from now())::text;
begin
  if v_caller is null then
    raise exception 'harus login untuk menerbitkan sertifikat';
  end if;
  if not v_is_admin and not v_is_teacher then
    raise exception 'hanya admin atau mentor course ini yang bisa menerbitkan sertifikat';
  end if;

  select exists (
    select 1 from public.enrollments
    where course_id = p_course_id and user_id = p_user_id
  ) into v_enrolled;
  if not v_enrolled then
    raise exception 'siswa belum terdaftar di course ini';
  end if;

  select c.serial, c.score into v_existing
  from public.certificates c
  where c.course_id = p_course_id and c.user_id = p_user_id and c.type = 'course'
  limit 1;
  if found then
    return query select v_existing.serial, v_existing.score, true;
    return;
  end if;

  -- Weights + passing grade from the RPS row; master-prompt defaults
  -- when the row (or a key) is missing.
  select r.weights, r.passing_grade into v_weights, v_passing
  from public.rps r where r.code = 'SVS-SEM1' limit 1;
  if v_weights is not null then
    v_w_pretest := coalesce((v_weights ->> 'pretest')::numeric, 5);
    v_w_posttest := coalesce((v_weights ->> 'posttest')::numeric, 15);
    v_w_weekly := coalesce((v_weights ->> 'tugas_mingguan')::numeric, 30);
    v_w_final := coalesce((v_weights ->> 'tugas_akhir')::numeric, 40);
    v_w_discussion := coalesce((v_weights ->> 'diskusi')::numeric, 10);
  end if;
  v_passing := coalesce(v_passing, 70);

  -- Pretest: average of the best attempt per pretest quiz in this course.
  select avg(b.best_score) into v_pretest
  from (
    select a.quiz_id, max(a.score) as best_score
    from public.quiz_attempts a
    join public.quizzes q on q.id = a.quiz_id
    join public.lessons l on l.id = q.lesson_id
    join public.modules m on m.id = l.module_id
    where m.course_id = p_course_id
      and q.kind = 'pretest'
      and a.user_id = p_user_id
      and a.score is not null
    group by a.quiz_id
  ) b;

  select avg(b.best_score) into v_posttest
  from (
    select a.quiz_id, max(a.score) as best_score
    from public.quiz_attempts a
    join public.quizzes q on q.id = a.quiz_id
    join public.lessons l on l.id = q.lesson_id
    join public.modules m on m.id = l.module_id
    where m.course_id = p_course_id
      and q.kind = 'posttest'
      and a.user_id = p_user_id
      and a.score is not null
    group by a.quiz_id
  ) b;

  select avg(s.score) into v_weekly
  from public.submissions s
  join public.assignments a on a.id = s.assignment_id
  join public.lessons l on l.id = a.lesson_id
  join public.modules m on m.id = l.module_id
  where m.course_id = p_course_id
    and coalesce(a.kind, 'weekly') = 'weekly'
    and s.user_id = p_user_id
    and s.score is not null;

  select avg(s.score) into v_final_practice
  from public.submissions s
  join public.assignments a on a.id = s.assignment_id
  join public.lessons l on l.id = a.lesson_id
  join public.modules m on m.id = l.module_id
  where m.course_id = p_course_id
    and a.kind = 'final_practice'
    and s.user_id = p_user_id
    and s.score is not null;

  -- Discussion: null when the student never posted (matches lib/grading.ts);
  -- otherwise min(100, distinctLessons * 10 + totalPosts * 2).
  select count(*), count(distinct d.lesson_id) into v_post_count, v_distinct_lessons
  from public.discussions d
  join public.lessons l on l.id = d.lesson_id
  join public.modules m on m.id = l.module_id
  where m.course_id = p_course_id
    and d.user_id = p_user_id;
  if v_post_count > 0 then
    v_discussion := least(100, v_distinct_lessons * 10 + v_post_count * 2);
  end if;

  -- Renormalized final over the components that exist.
  if v_pretest is not null then v_final := v_final + v_pretest * v_w_pretest; v_weight_sum := v_weight_sum + v_w_pretest; end if;
  if v_posttest is not null then v_final := v_final + v_posttest * v_w_posttest; v_weight_sum := v_weight_sum + v_w_posttest; end if;
  if v_weekly is not null then v_final := v_final + v_weekly * v_w_weekly; v_weight_sum := v_weight_sum + v_w_weekly; end if;
  if v_final_practice is not null then v_final := v_final + v_final_practice * v_w_final; v_weight_sum := v_weight_sum + v_w_final; end if;
  if v_discussion is not null then v_final := v_final + v_discussion * v_w_discussion; v_weight_sum := v_weight_sum + v_w_discussion; end if;
  if v_weight_sum > 0 then v_final := v_final / v_weight_sum; else v_final := 0; end if;

  if v_final < v_passing then
    raise exception 'siswa belum lulus: nilai akhir % (ambang lulus %)', round(v_final, 1), v_passing;
  end if;

  -- Serial unik dengan retry loop: bila dua penerbitan bersamaan mengambil
  -- nomor yang sama, coba nomor berikutnya (maks. 10 percobaan) dan gagal
  -- dengan jelas bila semuanya bentrok — jangan pernah mengembalikan
  -- serial yang tidak benar-benar ter-insert.
  -- BUGFIX (22 Nov 2026, verifikasi live Tahap 5): kolom "serial" di bawah
  -- ini AMBIGU karena RETURNS TABLE punya parameter output bernama "serial".
  -- Postgres error 42702 membuat RPC gagal di SETIAP penerbitan. Kualifikasi
  -- dengan nama tabel menyelesaikan konflik (juga untuk "type" sekalian).
  select count(*) into v_seq
  from public.certificates
  where public.certificates.type = 'course'
    and public.certificates.serial like 'SVS-CRS-' || v_year || '-%';
  v_serial := null;
  for i in 1..10 loop
    v_serial := 'SVS-CRS-' || v_year || '-' || lpad((v_seq + i)::text, 4, '0');
    insert into public.certificates (user_id, course_id, type, serial, score)
    values (p_user_id, p_course_id, 'course', v_serial, round(v_final)::int)
    on conflict on constraint certificates_serial_key do nothing;
    exit when found;
    v_serial := null;
  end loop;
  if v_serial is null then
    raise exception 'gagal membuat nomor serial sertifikat (bentrok berulang)';
  end if;

  return query select v_serial, round(v_final)::int, false;
end;
$$;

grant execute on function public.issue_course_certificate(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- publish_final_project(p_project_id, p_film_url, p_poster_url, p_description)
-- Publikasi atomik ke Showcase: insert baris film (status 'draft' — masuk
-- antrean penilaian admin, mengikuti alur Showcase) + tautkan film ke
-- proyek + tandai proyek 'published', semua dalam satu transaksi. Tanpa
-- RPC ini, film bisa yatim di antrean bila update proyek gagal setelah
-- insert film. Pemanggil harus anggota tim / mentor proyek / admin, dan
-- proyek harus berstatus 'approved' dan belum punya film.
-- ---------------------------------------------------------------------------
create or replace function public.publish_final_project(
  p_project_id uuid,
  p_film_url text,
  p_poster_url text,
  p_description text
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_caller uuid := auth.uid();
  v_project record;
  v_film_id uuid;
begin
  if v_caller is null then
    raise exception 'harus login untuk mempublikasikan Final Project';
  end if;
  select * into v_project from public.final_projects where id = p_project_id;
  if not found then
    raise exception 'Final Project tidak ditemukan';
  end if;
  if not (
    public.is_final_project_member(p_project_id)
    or public.is_final_project_mentor(p_project_id)
    or public.is_admin()
  ) then
    raise exception 'hanya tim proyek, mentor, atau admin yang bisa mempublikasikan';
  end if;
  if v_project.status <> 'approved' then
    raise exception 'proyek harus disetujui mentor dulu (status saat ini: %)', v_project.status;
  end if;
  if v_project.film_id is not null then
    raise exception 'proyek ini sudah punya film Showcase';
  end if;

  insert into public.films (title, description, owner_id, film_url, poster_url, visibility, show_school, status)
  values (
    v_project.title,
    coalesce(nullif(btrim(p_description), ''), v_project.description),
    v_project.owner_id,
    nullif(btrim(p_film_url), ''),
    p_poster_url,
    'public',
    false,
    'draft'
  )
  returning id into v_film_id;

  update public.final_projects
  set film_id = v_film_id, status = 'published', updated_at = now()
  where id = p_project_id;

  return v_film_id;
end;
$$;

grant execute on function public.publish_final_project(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Part B — Final Project tables
-- 10-step short-film production workspace (master prompt §8):
-- 1 ide, 2 skenario, 3 storyboard, 4 tim produksi, 5 sutradara & kru,
-- 6 production plan, 7 shooting, 8 editing & sound design,
-- 9 film selesai, 10 presentasi & evaluasi bersama mentor.
-- ---------------------------------------------------------------------------
create table if not exists public.final_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  mentor_id uuid references public.profiles (id) on delete set null,
  school_id uuid references public.schools (id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'in_progress', 'submitted', 'under_review', 'revision', 'approved', 'published', 'rejected')),
  film_id uuid references public.films (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.final_project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.final_projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create table if not exists public.final_project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.final_projects (id) on delete cascade,
  title text not null,
  description text,
  step int not null default 1 check (step between 1 and 10),
  status text not null default 'todo'
    check (status in ('todo', 'doing', 'done')),
  assignee_id uuid references public.profiles (id) on delete set null,
  due_date date,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.final_project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.final_projects (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  file_size int,
  kind text not null default 'other'
    check (kind in ('screenplay', 'storyboard', 'shot_list', 'schedule', 'other')),
  uploaded_by uuid references public.profiles (id) on delete set null,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.final_project_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.final_projects (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  score int check (score is null or (score >= 0 and score <= 100)),
  feedback text,
  created_at timestamptz not null default now()
);

create index if not exists final_projects_owner_id_idx
  on public.final_projects (owner_id);
create index if not exists final_projects_mentor_id_idx
  on public.final_projects (mentor_id);
create index if not exists final_projects_status_idx
  on public.final_projects (status);
create index if not exists final_project_members_project_id_idx
  on public.final_project_members (project_id);
create index if not exists final_project_tasks_project_id_idx
  on public.final_project_tasks (project_id);
create index if not exists final_project_files_project_id_idx
  on public.final_project_files (project_id);
create index if not exists final_project_reviews_project_id_idx
  on public.final_project_reviews (project_id);

-- ---------------------------------------------------------------------------
-- Helpers for Final Project RLS
-- ---------------------------------------------------------------------------
create or replace function public.is_final_project_member(p_project_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.final_projects p
    where p.id = p_project_id and p.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.final_project_members m
    where m.project_id = p_project_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_final_project_mentor(p_project_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.final_projects p
    where p.id = p_project_id and p.mentor_id = auth.uid()
  );
$$;

grant execute on function public.is_final_project_member(uuid) to authenticated;
grant execute on function public.is_final_project_mentor(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security — on for every table
-- ---------------------------------------------------------------------------
alter table public.final_projects enable row level security;
alter table public.final_project_members enable row level security;
alter table public.final_project_tasks enable row level security;
alter table public.final_project_files enable row level security;
alter table public.final_project_reviews enable row level security;

-- final_projects ------------------------------------------------------------
-- Anyone logged in reads published projects; members/mentor read their own.
drop policy if exists "final_projects_select_published_or_member" on public.final_projects;
create policy "final_projects_select_published_or_member"
  on public.final_projects for select to authenticated
  using (
    status = 'published'
    or public.is_final_project_member(id)
    or public.is_final_project_mentor(id)
    or public.is_admin()
  );

-- Any logged-in user may register (create) a Final Project as its owner.
drop policy if exists "final_projects_insert_own" on public.final_projects;
create policy "final_projects_insert_own"
  on public.final_projects for insert to authenticated
  with check (owner_id = auth.uid());

-- Members, the assigned mentor and admins may update (status changes are
-- gated in the UI: only the mentor/admin may approve/publish).
drop policy if exists "final_projects_update_member_mentor" on public.final_projects;
create policy "final_projects_update_member_mentor"
  on public.final_projects for update to authenticated
  using (
    public.is_final_project_member(id)
    or public.is_final_project_mentor(id)
    or public.is_admin()
  )
  with check (
    public.is_final_project_member(id)
    or public.is_final_project_mentor(id)
    or public.is_admin()
  );

-- Only the owner (or an admin) deletes a project.
drop policy if exists "final_projects_delete_owner" on public.final_projects;
create policy "final_projects_delete_owner"
  on public.final_projects for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- Admins can do everything.
drop policy if exists "final_projects_admin_all" on public.final_projects;
create policy "final_projects_admin_all"
  on public.final_projects for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- final_project_members -----------------------------------------------------
drop policy if exists "final_project_members_select_member" on public.final_project_members;
create policy "final_project_members_select_member"
  on public.final_project_members for select to authenticated
  using (
    public.is_final_project_member(project_id)
    or public.is_final_project_mentor(project_id)
    or public.is_admin()
    or exists (select 1 from public.final_projects p where p.id = project_id and p.status = 'published')
  );

-- Members add teammates (invite/accept writes their own row); mentor/admin too.
drop policy if exists "final_project_members_insert_member" on public.final_project_members;
create policy "final_project_members_insert_member"
  on public.final_project_members for insert to authenticated
  with check (
    public.is_final_project_member(project_id)
    or public.is_final_project_mentor(project_id)
    or public.is_admin()
  );

drop policy if exists "final_project_members_update_member" on public.final_project_members;
create policy "final_project_members_update_member"
  on public.final_project_members for update to authenticated
  using (
    public.is_final_project_member(project_id)
    or public.is_final_project_mentor(project_id)
    or public.is_admin()
  )
  with check (
    public.is_final_project_member(project_id)
    or public.is_final_project_mentor(project_id)
    or public.is_admin()
  );

drop policy if exists "final_project_members_delete_member" on public.final_project_members;
create policy "final_project_members_delete_member"
  on public.final_project_members for delete to authenticated
  using (
    user_id = auth.uid()
    or public.is_final_project_member(project_id)
    or public.is_final_project_mentor(project_id)
    or public.is_admin()
  );

drop policy if exists "final_project_members_admin_all" on public.final_project_members;
create policy "final_project_members_admin_all"
  on public.final_project_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- final_project_tasks -------------------------------------------------------
drop policy if exists "final_project_tasks_select_member" on public.final_project_tasks;
create policy "final_project_tasks_select_member"
  on public.final_project_tasks for select to authenticated
  using (
    public.is_final_project_member(project_id)
    or public.is_final_project_mentor(project_id)
    or public.is_admin()
    or exists (select 1 from public.final_projects p where p.id = project_id and p.status = 'published')
  );

drop policy if exists "final_project_tasks_insert_member" on public.final_project_tasks;
create policy "final_project_tasks_insert_member"
  on public.final_project_tasks for insert to authenticated
  with check (
    public.is_final_project_member(project_id)
    or public.is_final_project_mentor(project_id)
    or public.is_admin()
  );

drop policy if exists "final_project_tasks_update_member" on public.final_project_tasks;
create policy "final_project_tasks_update_member"
  on public.final_project_tasks for update to authenticated
  using (
    public.is_final_project_member(project_id)
    or public.is_final_project_mentor(project_id)
    or public.is_admin()
  )
  with check (
    public.is_final_project_member(project_id)
    or public.is_final_project_mentor(project_id)
    or public.is_admin()
  );

drop policy if exists "final_project_tasks_delete_member" on public.final_project_tasks;
create policy "final_project_tasks_delete_member"
  on public.final_project_tasks for delete to authenticated
  using (
    public.is_final_project_member(project_id)
    or public.is_final_project_mentor(project_id)
    or public.is_admin()
  );

drop policy if exists "final_project_tasks_admin_all" on public.final_project_tasks;
create policy "final_project_tasks_admin_all"
  on public.final_project_tasks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- final_project_files -------------------------------------------------------
drop policy if exists "final_project_files_select_member" on public.final_project_files;
create policy "final_project_files_select_member"
  on public.final_project_files for select to authenticated
  using (
    public.is_final_project_member(project_id)
    or public.is_final_project_mentor(project_id)
    or public.is_admin()
    or exists (select 1 from public.final_projects p where p.id = project_id and p.status = 'published')
  );

drop policy if exists "final_project_files_insert_member" on public.final_project_files;
create policy "final_project_files_insert_member"
  on public.final_project_files for insert to authenticated
  with check (
    public.is_final_project_member(project_id)
    or public.is_final_project_mentor(project_id)
    or public.is_admin()
  );

drop policy if exists "final_project_files_delete_member" on public.final_project_files;
create policy "final_project_files_delete_member"
  on public.final_project_files for delete to authenticated
  using (
    public.is_final_project_member(project_id)
    or public.is_final_project_mentor(project_id)
    or public.is_admin()
  );

drop policy if exists "final_project_files_admin_all" on public.final_project_files;
create policy "final_project_files_admin_all"
  on public.final_project_files for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- final_project_reviews -----------------------------------------------------
-- Members/mentor/admin read reviews on their project.
drop policy if exists "final_project_reviews_select_member" on public.final_project_reviews;
create policy "final_project_reviews_select_member"
  on public.final_project_reviews for select to authenticated
  using (
    public.is_final_project_member(project_id)
    or public.is_final_project_mentor(project_id)
    or public.is_admin()
  );

-- Only the assigned mentor (or an admin) writes a review/assessment.
drop policy if exists "final_project_reviews_insert_mentor" on public.final_project_reviews;
create policy "final_project_reviews_insert_mentor"
  on public.final_project_reviews for insert to authenticated
  with check (
    (public.is_final_project_mentor(project_id) and reviewer_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists "final_project_reviews_admin_all" on public.final_project_reviews;
create policy "final_project_reviews_admin_all"
  on public.final_project_reviews for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
