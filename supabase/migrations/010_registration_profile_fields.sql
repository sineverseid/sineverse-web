-- 010 — Registration profile fields (paritas dengan artefak SINEVERSE).
--
-- Masalah: formulir pendaftaran artefak (registerstudent / applymentor)
-- mengumpulkan data yang belum punya kolom di public.profiles:
--   * school (sekolah) dan kelas — hanya untuk jalur Anggota (Siswa).
-- Kolom lain sudah ada: birth_date, gender, address (003); phone, city,
-- photo_url (001); interests text[] (005). Data mentor (expertise,
-- experience, portfolio_link) TIDAK disimpan di profiles — melainkan di
-- mentor_applications (008), yang diisi setelah email terverifikasi.
--
-- Perubahan di sini:
--   1. Tambah kolom school + kelas di profiles (idempotent).
--   2. Perbarui trigger handle_new_user (002) agar mengisi profil dari
--      raw_user_meta_data yang dikirim client saat signUp: phone, city,
--      birth_date, gender, address, school, kelas, interests, photo_url.
--      Interests diterima sebagai array JSON atau string pisah-koma.
--      Role tetap 'siswa' — mentor HANYA lewat lamaran + persetujuan admin.
--
-- Cara pakai: Supabase Dashboard -> SQL Editor -> paste file ini -> Run.
-- Client TIDAK bergantung pada migrasi ini: bila belum diterapkan, profil
-- tetap dibuat trigger lama (nama saja) dan aplikasi melengkapi data dari
-- payload pendaftaran yang tersimpan setelah pengguna masuk pertama kali.
-- ============================================================================

alter table public.profiles
  add column if not exists school text;
alter table public.profiles
  add column if not exists kelas text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_interests text[] := null;
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  -- interests: array JSON (["a","b"]) atau string pisah-koma ("a, b").
  if v_meta ? 'interests' then
    if jsonb_typeof(v_meta -> 'interests') = 'array' then
      select array_agg(trim(x)) into v_interests
      from jsonb_array_elements_text(v_meta -> 'interests') as x
      where trim(x) <> '';
    elsif jsonb_typeof(v_meta -> 'interests') = 'string' then
      select array_agg(trim(x)) into v_interests
      from unnest(string_to_array(v_meta ->> 'interests', ',')) as x
      where trim(x) <> '';
    end if;
  end if;

  insert into public.profiles
    (id, email, name, role, phone, city, birth_date, gender, address,
     school, kelas, interests, photo_url)
  values (
    new.id,
    new.email,
    coalesce(v_meta ->> 'name', split_part(new.email, '@', 1)),
    'siswa',
    nullif(v_meta ->> 'phone', ''),
    nullif(v_meta ->> 'city', ''),
    nullif(v_meta ->> 'birth_date', '')::date,
    nullif(v_meta ->> 'gender', ''),
    nullif(v_meta ->> 'address', ''),
    nullif(v_meta ->> 'school', ''),
    nullif(v_meta ->> 'kelas', ''),
    v_interests,
    nullif(v_meta ->> 'photo_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Trigger on_auth_user_created (dari 002) tetap dipakai — tidak diubah.
-- Verifikasi setelah Run:
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles'
--   and column_name in ('school', 'kelas', 'birth_date', 'gender',
--                        'address', 'interests');
