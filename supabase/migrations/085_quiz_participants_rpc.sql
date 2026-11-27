-- SINEVERSE migration 085 — RPC daftar peserta kuis (pilot pola Mentari).
--
-- Latar (Arif, 28 Nov 2026, screenshot Mentari "Pretest - Pertemuan 18"):
-- halaman detail kuis menampilkan "List Data Peserta" — nama, badge Sudah /
-- Belum Mengerjakan Quiz, Grade, Selesai — dan screenshot itu diambil dari
-- AKUN SISWA, jadi daftar ini tampil juga untuk siswa.
--
-- Masalah: RLS quiz_attempts hanya select own + admin, jadi siswa tidak bisa
-- membaca attempt teman sekelasnya lewat query biasa. RPC SECURITY DEFINER
-- ini mengembalikan SATU baris per siswa terdaftar di course pemilik kuis,
-- dengan nilai terbaik + waktu attempt terbaru (atau NULL bila belum
-- mengerjakan). Akses dibatasi di dalam fungsi: admin, mentor course, atau
-- siswa terdaftar di course itu. Orang luar course mendapat 0 baris.
--
-- TIDAK ada kolom durasi di quiz_attempts (hanya attempted_at), jadi RPC ini
-- tidak mengembalikan durasi — UI menampilkan "—" untuk Waktu Penyelesaian.
-- TIDAK ada kolom NIM di profiles, jadi RPC ini tidak mengembalikan NIM.
--
-- Provinsi / Kab-Kota / Asal Sekolah (keputusan Arif, 28 Nov 2026):
-- profiles.province + profiles.regency menyimpan KODE wilayah (bukan nama),
-- jadi diselesaikan ke NAMA lewat ref_provinces / ref_regencies; bila kode
-- kosong, fallback ke schools.province / schools.regency (NAMA) via
-- profiles.school_id; sekolah = schools.name via school_id, fallback terakhir
-- profiles.school (nama manual). Semua kolom ini nullable — yang kosong
-- tetap NULL dan UI menampilkan "—". TIDAK ADA data karangan di sini:
-- tidak ada nama wilayah/sekolah yang dibuat-buat, tidak ada awalan
-- "Kota "/"Kabupaten " yang ditambahkan (nama regency di ref_regencies
-- sudah mengandung awalan itu apa adanya).
-- profiles.city TIDAK dipakai — itu field bebas yang berbeda, bukan kab/kota.
--
-- TIDAK diterapkan ke live sebelum Arif setuju (pilot staged).
-- ---------------------------------------------------------------------------

create or replace function public.get_quiz_participants(p_quiz_id uuid)
returns table (
  user_id uuid,
  name text,
  score int,
  attempted_at timestamptz,
  has_attempt boolean,
  province text,
  regency text,
  school text
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
    coalesce(s.name, p.school) as school
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
--   select proname from pg_proc where proname = 'get_quiz_participants'; -- 1
-- Rollback:
--   drop function if exists public.get_quiz_participants(uuid);
-- ---------------------------------------------------------------------------
