-- SINEVERSE migration 087 — tanggal penutupan forum + durasi pengerjaan kuis
-- (D24.14, keputusan Arif 28 Nov 2026, 07:05).
--
-- Isi:
--   (1) lessons.closes_at timestamptz NULL — tenggat penutupan forum
--       diskusi satu pertemuan.
--   (2) quiz_attempts.duration_seconds int NULL — durasi pengerjaan satu
--       attempt, detik (diukur client-side sejak tampilan soal dibuka).
--   (3) RPC set_lesson_forum_closes_at() — penulis closes_at yang
--       dibatasi kolom (hanya closes_at yang berubah).
--   (4) submit_quiz_attempt() 3-arg (menggantikan versi 2-arg dari 009
--       yang diganti 022) — menerima + menyimpan p_duration_seconds.
--   (5) get_quiz_participants() (085) — mengembalikan duration_seconds
--       attempt terbaru tiap peserta, untuk "Waktu Penyelesaian" di kartu
--       peserta.
--
-- Pilihan tabel closes_at: LESSONS, bukan discussions.
--   * Forum SINEVERSE bersifat per-lesson: satu seksi forum per pertemuan,
--     dan tenggat Mentari pun per-pertemuan ("Forum diskusi pertemuan
--     ke-18 akan ditutup Sabtu, 28 November 2026, pukul 19.00 WIB").
--   * discussions adalah per-THREAD (tiap postingan/balasan satu baris);
--     menaruh closes_at di sana berarti menduplikasi satu tenggat yang
--     sama ke semua thread dan UI harus memilih satu baris acak untuk
--     membacanya — granularitas yang salah.
--   * lessons sudah membawa metadata per-pertemuan (title, video_url,
--     content) dan fetchLesson memakai select('*'), jadi closes_at
--     mengalir ke UI tanpa query tambahan.
--
-- RLS (tidak ada policy baru yang dibutuhkan — yang sudah ada sudah tepat):
--   * lessons UPDATE: "lessons_update_mentor" (001) mengizinkan mentor
--     pengampu course meng-update baris lesson course-nya, dan
--     "lessons_admin_all" (001) mengizinkan admin. Siswa TIDAK punya
--     policy UPDATE di lessons (hanya select) — jadi siswa hanya baca.
--   * RPC set_lesson_forum_closes_at() tetap dibuat sebagai penulis yang
--     dibatasi kolom (defense in depth): lewat RPC, mentor/admin hanya
--     bisa mengubah closes_at — bukan title/content lesson. UI memakai
--     RPC ini, bukan update langsung.
--   * quiz_attempts INSERT: "quiz_attempts_insert_own" (001) mengizinkan
--     pemilik attempt memasukkan barisnya sendiri (termasuk durasi);
--     SELECT: "quiz_attempts_select_own" (001) + "quiz_attempts_select_mentor"
--     (018) + admin_all. RPC submit/get_participants adalah SECURITY
--     DEFINER dengan guard eksplisit (seperti versi sebelumnya).
--
-- TIDAK diterapkan ke live sebelum parent apply (file staged).
-- Urutan deploy: apply migrasi ini DULU (atau bersamaan) sebelum deploy
-- kode D24 — kode baru memanggil submit_quiz_attempt 3-arg; bila RPC
-- 3-arg belum ada, frontend jatuh ke RPC 2-arg lama (submit tetap jalan,
-- durasi saja tidak tercatat), jadi jendela tanpa migrasi tidak merusak
-- submit. Sebaliknya, UI closes_at menampilkan instruksi ke-4 hanya bila
-- kolom terisi — sebelum migrasi, kolom tidak ada dan UI tidak menampilkan
-- apa pun (fetchLesson select('*') gagal? TIDAK: select('*') tetap jalan,
-- kolom closes_at tidak ada di hasil, jadi lesson.closes_at undefined dan
-- instruksi ke-4 tidak tampil — TETAPI TypeScript/JS tidak error; yang
-- akan error hanyalah pemanggilan RPC set_lesson_forum_closes_at bila
-- mentor mencoba menyimpan sebelum migrasi di-apply — error itu jujur
-- dan ditampilkan ke mentor sebagai pesan gagal simpan).
-- ---------------------------------------------------------------------------

-- (1) Tanggal penutupan forum per pertemuan.
alter table public.lessons
  add column if not exists closes_at timestamptz;

comment on column public.lessons.closes_at is
  'Tenggat penutupan forum diskusi pertemuan ini (D24.14, Mentari). NULL = tidak ada tenggat; instruksi ke-4 forum hanya tampil bila terisi. Diisi mentor pengampu course / admin.';

-- (2) Durasi pengerjaan attempt kuis, detik.
alter table public.quiz_attempts
  add column if not exists duration_seconds int
  check (duration_seconds is null or duration_seconds >= 0);

comment on column public.quiz_attempts.duration_seconds is
  'Durasi pengerjaan attempt ini, detik (D24.14). Diukur client-side sejak tampilan soal dibuka sampai submit. NULL = attempt lama tanpa durasi tercatat — UI menampilkan "—".';

-- ---------------------------------------------------------------------------
-- (3) set_lesson_forum_closes_at(): ubah HANYA closes_at satu lesson.
--     Boleh: admin, atau mentor pengampu course pemilik lesson.
--     Mengembalikan closes_at baru (null bila tenggat dihapus).
-- ---------------------------------------------------------------------------
create or replace function public.set_lesson_forum_closes_at(
  p_lesson_id uuid,
  p_closes_at timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_mentor uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  select c.mentor_id into v_course_mentor
  from public.lessons l
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id
  where l.id = p_lesson_id;
  if not found then
    raise exception 'lesson tidak ditemukan';
  end if;
  if not public.is_admin() and v_course_mentor is distinct from auth.uid() then
    raise exception 'hanya mentor pengampu course atau admin yang dapat mengatur tanggal penutupan forum';
  end if;
  update public.lessons set closes_at = p_closes_at where id = p_lesson_id;
  return p_closes_at;
end;
$$;

grant execute on function public.set_lesson_forum_closes_at(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- (4) submit_quiz_attempt() 3-arg — pengganti versi 2-arg (009, diganti
--     022 dengan guard admin). Isi disalin dari 022 + p_duration_seconds.
--     Parameter ketiga punya DEFAULT null, jadi pemanggilan 2-arg lama
--     tetap resolve ke fungsi ini — TETAPI Postgres menolak ambiguitas
--     bila kedua overload hidup bersamaan, jadi versi 2-arg di-drop dulu.
-- ---------------------------------------------------------------------------
drop function if exists public.submit_quiz_attempt(uuid, jsonb);

create or replace function public.submit_quiz_attempt(
  p_quiz_id uuid,
  p_answers jsonb,
  p_duration_seconds int default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max int;
  v_count int;
  v_total int;
  v_correct int;
  v_score int;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  -- (022) Admin memantau, bukan peserta: tidak boleh mengerjakan kuis.
  if public.is_admin() then
    raise exception 'admin tidak dapat mengerjakan kuis sebagai peserta';
  end if;
  if p_duration_seconds is not null and p_duration_seconds < 0 then
    raise exception 'durasi tidak valid';
  end if;
  select max_attempts into v_max from public.quizzes where id = p_quiz_id;
  if v_max is not null then
    select count(*) into v_count
    from public.quiz_attempts where quiz_id = p_quiz_id and user_id = auth.uid();
    if v_count >= v_max then
      raise exception 'batas percobaan kuis sudah tercapai';
    end if;
  end if;
  select count(*) into v_total from public.quiz_questions where quiz_id = p_quiz_id;
  if v_total = 0 then
    insert into public.quiz_attempts (quiz_id, user_id, score, answers, duration_seconds)
    values (p_quiz_id, auth.uid(), null, p_answers, p_duration_seconds);
    return null;
  end if;
  select count(*) into v_correct
  from public.quiz_questions q
  where q.quiz_id = p_quiz_id
    and (
      (q.kind in ('mc', 'true_false') and q.correct_answer = (p_answers ->> q.id::text))
      or (q.kind = 'short' and lower(btrim(q.correct_answer)) = lower(btrim(p_answers ->> q.id::text)))
    );
  v_score := round(v_correct::numeric * 100 / v_total);
  insert into public.quiz_attempts (quiz_id, user_id, score, answers, duration_seconds)
  values (p_quiz_id, auth.uid(), v_score, p_answers, p_duration_seconds);
  return v_score;
end;
$$;

grant execute on function public.submit_quiz_attempt(uuid, jsonb, int) to authenticated;

-- ---------------------------------------------------------------------------
-- (5) get_quiz_participants() — salinan 085 + duration_seconds.
--     PERBAIKAN 28 Nov (parent, pasca-gagal apply): CREATE OR REPLACE
--     TIDAK bisa mengubah return type — versi baru menambah kolom
--     duration_seconds ke RETURNS TABLE, jadi fungsi lama HARUS di-drop
--     dulu (error 42P13 pada percobaan apply pertama; transaksi
--     di-rollback penuh, tidak ada yang berubah di live).
-- ---------------------------------------------------------------------------
drop function if exists public.get_quiz_participants(uuid);

create or replace function public.get_quiz_participants(p_quiz_id uuid)
returns table (
  user_id uuid,
  name text,
  score int,
  attempted_at timestamptz,
  has_attempt boolean,
  province text,
  regency text,
  school text,
  duration_seconds int
)
language sql
security definer
stable
as $$
  select
    e.user_id,
    p.name,
    max(a.score) as score,
    max(a.attempted_at) as attempted_at,
    count(a.id) > 0 as has_attempt,
    coalesce(rp.name, s.province) as province,
    coalesce(rr.name, s.regency) as regency,
    coalesce(s.name, p.school) as school,
    (
      select a2.duration_seconds
      from public.quiz_attempts a2
      -- PERBAIKAN 28 Nov (parent, pasca-gagal apply): memakai parameter
      -- p_quiz_id, BUKAN q.id — q.id adalah kolom outer yang tidak masuk
      -- GROUP BY sehingga subquery korelasi ditolak Postgres (error 42803).
      where a2.quiz_id = p_quiz_id and a2.user_id = e.user_id
      order by a2.attempted_at desc, a2.id desc
      limit 1
    ) as duration_seconds
  from public.quizzes q
  join public.lessons l on l.id = q.lesson_id
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id
  join public.enrollments e on e.course_id = c.id
  join public.profiles p on p.id = e.user_id
  left join public.schools s on s.id = p.school_id
  left join public.ref_provinces rp on rp.code = p.province
  left join public.ref_regencies rr on rr.code = p.regency
  left join public.quiz_attempts a
    on a.quiz_id = q.id and a.user_id = e.user_id
  where q.id = p_quiz_id
    and (
      public.is_admin()
      or c.mentor_id = auth.uid()
      or exists (
        select 1 from public.enrollments me
        where me.course_id = c.id and me.user_id = auth.uid()
      )
    )
  group by
    e.user_id,
    p.name,
    coalesce(rp.name, s.province),
    coalesce(rr.name, s.regency),
    coalesce(s.name, p.school)
  order by p.name;
$$;

grant execute on function public.get_quiz_participants(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Verifikasi (SQL Editor, JANGAN jalankan blok ini sebagai bagian migrasi):
--   select column_name from information_schema.columns
--     where table_schema = 'public' and table_name = 'lessons'
--       and column_name = 'closes_at'; -- 1
--   select column_name from information_schema.columns
--     where table_schema = 'public' and table_name = 'quiz_attempts'
--       and column_name = 'duration_seconds'; -- 1
--   select proname, pg_get_function_arguments(oid)
--     from pg_proc where proname in
--       ('set_lesson_forum_closes_at', 'submit_quiz_attempt',
--        'get_quiz_participants');
--   -- submit_quiz_attempt harus 1 baris (uuid, jsonb, int default null);
--   -- bila masih ada overload 2-arg, drop di atas gagal — periksa.
-- Rollback:
--   drop function if exists public.set_lesson_forum_closes_at(uuid, timestamptz);
--   alter table public.quiz_attempts drop column if exists duration_seconds;
--   alter table public.lessons drop column if exists closes_at;
--   -- (submit_quiz_attempt / get_quiz_participants kembali ke versi 009+022
--   --  / 085 dengan menjalankan ulang file migrasi tersebut.)
-- ---------------------------------------------------------------------------
