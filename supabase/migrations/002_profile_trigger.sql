-- 002 — Auto-create a profile row when a new auth user signs up.
--
-- Problem: the app inserted into public.profiles right after signUp, but
-- when email confirmation is on, signUp returns no session, so the insert
-- ran as `anon` and violated the profiles_insert_own RLS policy
-- ("new row violates row-level security policy for table profiles").
-- A trigger on auth.users creates the profile server-side (security
-- definer, bypasses RLS), so signup works with or without confirmation.
-- The app no longer inserts into profiles itself (see AuthContext).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    'siswa'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
