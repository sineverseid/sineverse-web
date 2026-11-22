-- SINEVERSE — Rate limiting untuk endpoint verifikasi sertifikat (migrasi 026), 22 Nov 2026.
--
-- Dipakai HANYA oleh Edge Function verify-certificate (service-role key).
-- IP klien tidak pernah disimpan mentah — hanya SHA-256-nya.
-- Tidak ada RLS di tabel ini (RLS tidak diaktifkan): hanya helper SECURITY
-- DEFINER di bawah yang menyentuhnya; jalur klien tidak punya akses.
-- Helper dipanggil Edge Function; anon/authenticated TIDAK boleh
-- mengeksekusinya langsung (revoke di bawah).

create table if not exists public.verification_rate_limits (
  ip_hash text primary key,
  window_start timestamptz not null,
  request_count int not null default 0
);
comment on table public.verification_rate_limits is 'Rate-limit state for the verify-certificate Edge Function. ip_hash is sha256(client ip); raw IPs are never stored.';

create or replace function public.check_verification_rate_limit(p_ip_hash text)
returns int
language plpgsql
security definer
as $$
declare
  v_count int;
begin
  insert into public.verification_rate_limits (ip_hash, window_start, request_count)
  values (p_ip_hash, now(), 1)
  on conflict (ip_hash) do update set
    request_count = case
      when verification_rate_limits.window_start < now() - interval '1 minute' then 1
      else verification_rate_limits.request_count + 1
    end,
    window_start = case
      when verification_rate_limits.window_start < now() - interval '1 minute' then now()
      else verification_rate_limits.window_start
    end
  returning request_count into v_count;
  return v_count;
end;
$$;
comment on function public.check_verification_rate_limit(text) is 'Atomic per-IP verification counter (1-minute window). Called only by the verify-certificate Edge Function via the service-role key.';
revoke execute on function public.check_verification_rate_limit(text) from anon, authenticated;
