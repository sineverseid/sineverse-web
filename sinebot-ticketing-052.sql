-- SINEVERSE — Migration 052: SINEBOT Ticketing + human handoff (Tahap 4), 23 Nov 2026.
--
-- Tujuan: sistem tiket dukungan SINEBOT — pengguna membuat tiket, membalasnya,
-- dan admin menindaklanjuti (status / assign / prioritas) lewat RPC, dengan
-- notifikasi in-app untuk kedua belah pihak. Menutup cabang 'tickets' di
-- get_my_sinebot_status() (051) yang selama ini mengembalikan available=false
-- karena tabel support_tickets belum ada.
--
-- BATAS KERAS (jujur — baca sebelum memakai):
--   * Read/write rules: SELECT client hanya baris milik sendiri
--     (support_tickets: user_id = auth.uid(); support_ticket_messages: tiketnya
--     milik sendiri). TIDAK ADA policy admin_all di kedua tabel — admin membaca
--     dan menulis HANYA lewat RPC SECURITY DEFINER di bawah, yang mencatat
--     akses ke audit_log (pola 048). TIDAK ADA policy INSERT / UPDATE / DELETE
--     langsung untuk client di kedua tabel; semua tulis lewat RPC.
--   * Status 'closed' adalah terminal: tiket closed TIDAK boleh dibalas,
--     diubah statusnya, di-assign, atau diubah prioritasnya (semua RPC menolak
--     dengan exception 'ticket is closed'). TIDAK ADA jalan untuk membuka
--     kembali tiket closed di migrasi ini (reopen, bila dibutuhkan, adalah
--     pekerjaan terpisah dengan keputusan PO).
--   * TANPA SCAN MALWARE: lampiran hanya divalidasi dari sisi metadata yang
--     dikirim client (ekstensi dalam allowlist + ukuran <= 5 MB). TIDAK ADA
--     pemindaian isi file di migrasi ini — nama/tipe file yang dikirim client
--     bisa dipalsukan, dan bucket ticket-attachments tidak menjalankan antivirus.
--     Bila keamanan konten lampiran menjadi syarat, tambahkan pemindaian di
--     Edge Function / layanan terpisah sebelum file ditampilkan ke admin.
--   * Lampiran TIDAK dihapus/diubah via client: bucket tidak punya policy
--     UPDATE/DELETE. File yatim (diunggah tapi tiket gagal dibuat) tidak
--     dibersihkan otomatis oleh migrasi ini.
--   * Notifikasi memakai jalur resmi public.create_notification() (008).
--     notification_prefs dihormati untuk SEMUA notifikasi tiket (kontrak):
--     tanpa baris prefs = in_app default true; in_app=false = tidak dikirim.
--     Pemeriksaan dilakukan lewat helper notify_ticket_user() (bagian d) —
--     create_notification() (008) sendiri insert tanpa syarat, jadi TIDAK
--     boleh dipanggil langsung untuk notifikasi tiket.
--
-- Kontrak RPC (worker frontend membangun klien dari kontrak yang sama):
--   create_sinebot_ticket(...) RETURNS uuid
--   list_my_tickets() RETURNS SETOF public.support_tickets
--   get_sinebot_ticket(p_ticket_id uuid) RETURNS jsonb
--     {ticket: <row tiket>, messages: [<row pesan + sender_name
--     + sender_type ('admin'|'user')>]}
--   reply_to_sinebot_ticket(...) RETURNS uuid (id pesan)
--   admin_list_tickets(p_status, p_search, p_limit, p_offset)
--     RETURNS SETOF public.support_tickets
--   admin_set_ticket_status(p_ticket_id, p_status) RETURNS void
--   admin_assign_ticket(p_ticket_id, p_assignee_id) RETURNS void
--   admin_set_ticket_priority(p_ticket_id, p_priority) RETURNS void
--   admin_list_admins() RETURNS TABLE(id uuid, name text)
--   Semua SECURITY DEFINER, SET search_path = public (pola 048), dengan
--   REVOKE EXECUTE FROM public, anon + GRANT EXECUTE TO authenticated.
--   Allowlist lampiran: jpg, jpeg, png, webp, pdf. Batas ukuran: 5 MB
--   (5242880 byte). Validasi dilakukan di create_sinebot_ticket() dan
--   reply_to_sinebot_ticket(). DEVIASI TERDOKUMENTASI: klien mengirim
--   p_attachment_type sebagai MIME (image/jpeg, ...), bukan ekstensi —
--   kedua RPC menerima MIME maupun ekstensi dan menyimpan ekstensi yang
--   dinormalisasi (lihat laporan worker 052).
--
-- Yang dipakai dari migrasi lama (sudah ada, tidak dibuat ulang):
--   * public.profiles (001) — FK user_id / assigned_to / sender_id.
--     PERHATIAN: profiles TIDAK punya kolom display_name (grep migrasi
--     001–051 + src/: tidak ada). Kolom nama adalah profiles.name (text,
--     001). Karena itu admin_list_admins() memakai coalesce(name, 'Admin')
--     dan get_sinebot_ticket() memakai coalesce(p.name, 'Pengguna') sebagai
--     sender_name — BUKAN display_name.
--   * public.is_admin() (001) — guard admin di RPC.
--   * public.log_audit(...) (008) — pencatat akses/aksi admin.
--   * public.create_notification(...) (008) — satu-satunya jalur tulis
--     notifications (tidak ada policy INSERT langsung).
--   * public.notifications (008): id, user_id, kind, title, body, data
--     jsonb, is_read, created_at.
--   * public.notification_prefs (008): user_id unique, in_app bool
--     default true, categories jsonb.
--   * public.set_updated_at() (048) — trigger updated_at generik, dipakai
--     ulang untuk support_tickets.
--   * Pola bucket privat + storage policy (012 film-posters, 031
--     event-posters): INSERT hanya ke path <auth.uid()>/... via
--     (storage.foldername(name))[1] = auth.uid()::text.
--
-- Cara menerapkan: Supabase Dashboard -> SQL Editor -> paste file ini
-- -> Run. TIDAK diterapkan otomatis; parent yang menerapkan. Terapkan
-- SETELAH 048–051 (file ini memakai set_updated_at() dari 048 dan
-- menimpa get_my_sinebot_status() dari 051).
-- Idempotent sebisa mungkin (IF NOT EXISTS / DROP POLICY IF EXISTS /
-- CREATE OR REPLACE / DROP TRIGGER IF EXISTS / ON CONFLICT DO NOTHING).

-- ---------------------------------------------------------------------------
-- (a) Tabel
-- ---------------------------------------------------------------------------

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null
    check (category in ('akun', 'academy', 'tugas', 'sertifikat', 'komunitas', 'teknis', 'lainnya')),
  subject text not null,
  description text not null,
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open'
    check (status in ('open', 'assigned', 'in_progress', 'waiting_for_user', 'resolved', 'closed')),
  assigned_to uuid references public.profiles (id) on delete set null,
  page_context text,
  attachment_path text,
  attachment_name text,
  attachment_size int,
  attachment_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.support_tickets is 'SINEBOT support tickets (Tahap 4). Written only via RPC (create_sinebot_ticket / admin_*); no direct client INSERT/UPDATE/DELETE policy. Status closed is terminal.';
comment on column public.support_tickets.attachment_path is 'Storage path inside the private ticket-attachments bucket (<user-id>/...). Metadata only — no malware scan is performed (see file header).';
comment on column public.support_tickets.page_context is 'Where the user was when they opened the ticket (page/route), for admin context. Free text from the client.';

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  message text not null,
  attachment_path text,
  attachment_name text,
  attachment_size int,
  attachment_type text,
  created_at timestamptz not null default now()
);
comment on table public.support_ticket_messages is 'Messages inside a support ticket (owner <-> admin). Written only via reply_to_sinebot_ticket(); no direct client INSERT/UPDATE/DELETE policy.';

-- ---------------------------------------------------------------------------
-- Indeks
-- ---------------------------------------------------------------------------
create index if not exists support_tickets_user_id_idx
  on public.support_tickets (user_id);
create index if not exists support_tickets_assigned_to_idx
  on public.support_tickets (assigned_to);
create index if not exists support_tickets_status_idx
  on public.support_tickets (status);
create index if not exists support_tickets_created_at_idx
  on public.support_tickets (created_at desc);
create index if not exists support_ticket_messages_ticket_id_idx
  on public.support_ticket_messages (ticket_id);
create index if not exists support_ticket_messages_sender_id_idx
  on public.support_ticket_messages (sender_id);

-- ---------------------------------------------------------------------------
-- Trigger updated_at (fungsi generik dari 048)
-- ---------------------------------------------------------------------------
drop trigger if exists support_tickets_updated_at on public.support_tickets;
create trigger support_tickets_updated_at
  before update on public.support_tickets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- (b) Row Level Security
-- ---------------------------------------------------------------------------
alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;

-- --- support_tickets ---
-- Baca hanya tiket milik sendiri. SENGAJA tidak ada policy admin_all:
-- admin membaca tiket hanya lewat RPC get/admin_list_* yang mencatat
-- akses ke audit_log. TIDAK ADA policy INSERT / UPDATE / DELETE untuk
-- client — semua tulis lewat RPC SECURITY DEFINER.
drop policy if exists "support_tickets_select_own" on public.support_tickets;
create policy "support_tickets_select_own"
  on public.support_tickets for select to authenticated
  using (user_id = auth.uid());

-- --- support_ticket_messages ---
-- Baca hanya bila tiketnya milik sendiri. TIDAK ADA policy INSERT /
-- UPDATE / DELETE untuk client — pesan ditulis lewat RPC
-- reply_to_sinebot_ticket().
drop policy if exists "support_ticket_messages_select_owner" on public.support_ticket_messages;
create policy "support_ticket_messages_select_owner"
  on public.support_ticket_messages for select to authenticated
  using (exists (
    select 1 from public.support_tickets t
    where t.id = support_ticket_messages.ticket_id
      and t.user_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- (c) Bucket privat ticket-attachments + storage policies (pola 012/031)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('ticket-attachments', 'ticket-attachments', false)
on conflict (id) do nothing;

-- INSERT: pengguna login, hanya ke path miliknya (<user-id>/...).
drop policy if exists "ticket_attachments_insert_own" on storage.objects;
create policy "ticket_attachments_insert_own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'ticket-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- SELECT: pemilik file ATAU admin. Tamu (anon) tidak bisa membaca apa pun.
drop policy if exists "ticket_attachments_select_owner_or_admin" on storage.objects;
create policy "ticket_attachments_select_owner_or_admin" on storage.objects
for select to authenticated
using (
  bucket_id = 'ticket-attachments'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

-- TIDAK ADA policy UPDATE / DELETE: lampiran tidak diubah/dihapus via client.

-- ---------------------------------------------------------------------------
-- (d) RPC SECURITY DEFINER (set search_path = public, pola 048)
-- ---------------------------------------------------------------------------

-- Helper notifikasi tiket yang menghormati notification_prefs.
-- create_notification() (008) insert tanpa syarat, jadi pemeriksaan prefs
-- harus dilakukan di sini: tanpa baris prefs = in_app default true; baris
-- prefs dengan in_app=false = JANGAN kirim. Dipakai semua notifikasi tiket
-- ke satu penerima (pemilik tiket / admin yang ditugaskan). Notifikasi
-- broadcast ke semua admin di create_sinebot_ticket sudah mengecek prefs
-- inline lewat LEFT JOIN — polanya sama.
create or replace function public.notify_ticket_user(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text default null,
  p_data jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.notification_prefs
    where user_id = p_user_id and in_app = false
  ) then
    return;
  end if;
  perform public.create_notification(p_user_id, p_kind, p_title, p_body, p_data);
end;
$$;
revoke execute on function public.notify_ticket_user(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.notify_ticket_user(uuid, text, text, text, jsonb) to authenticated;

-- Buat tiket dukungan. Auth wajib; category + priority divalidasi; subject /
-- description tidak boleh kosong; lampiran (bila diisi) harus dalam allowlist
-- jpg/jpeg/png/webp/pdf dan ukuran <= 5 MB. Setelah insert, semua admin
-- diberi notifikasi kind 'sinebot_ticket_new' — dihormati notification_prefs:
-- hanya admin yang in_app-nya true ATAU belum punya baris prefs (default true).
-- Mengembalikan id tiket.
create or replace function public.create_sinebot_ticket(
  p_category text,
  p_subject text,
  p_description text,
  p_page_context text default null,
  p_priority text default 'medium',
  p_attachment_path text default null,
  p_attachment_name text default null,
  p_attachment_size int default null,
  p_attachment_type text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_subject text := nullif(btrim(coalesce(p_subject, '')), '');
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_ticket_id uuid;
  v_admin record;
  v_attachment_type text;
begin
  if v_caller is null then
    raise exception 'authentication required';
  end if;
  if p_category is null or p_category not in ('akun', 'academy', 'tugas', 'sertifikat', 'komunitas', 'teknis', 'lainnya') then
    raise exception 'category must be akun, academy, tugas, sertifikat, komunitas, teknis, or lainnya';
  end if;
  if p_priority is null or p_priority not in ('low', 'medium', 'high', 'critical') then
    raise exception 'priority must be low, medium, high, or critical';
  end if;
  if v_subject is null then
    raise exception 'subject must not be empty';
  end if;
  if v_description is null then
    raise exception 'description must not be empty';
  end if;
  -- Normalisasi tipe lampiran (DEVIASI TERDOKUMENTASI, lihat laporan):
  -- kontrak menyebut allowlist ekstensi (jpg/jpeg/png/webp/pdf), tetapi
  -- klien mengirim file.type = MIME (image/jpeg, image/png, image/webp,
  -- application/pdf). Terima KEDUANYA, simpan sebagai ekstensi. Nilai di
  -- luar keduanya tetap ditolak.
  v_attachment_type := case lower(btrim(coalesce(p_attachment_type, '')))
    when 'image/jpeg' then 'jpeg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    when 'application/pdf' then 'pdf'
    when 'jpg' then 'jpg'
    when 'jpeg' then 'jpeg'
    when 'png' then 'png'
    when 'webp' then 'webp'
    when 'pdf' then 'pdf'
    when '' then null
    else null
  end;
  if p_attachment_type is not null and v_attachment_type is null then
    raise exception 'attachment type must be jpg, jpeg, png, webp, or pdf';
  end if;
  if p_attachment_size is not null and p_attachment_size > 5242880 then
    raise exception 'attachment size must not exceed 5 MB';
  end if;

  insert into public.support_tickets (
    user_id, category, subject, description, priority,
    page_context, attachment_path, attachment_name, attachment_size, attachment_type
  )
  values (
    v_caller, p_category, v_subject, v_description, p_priority,
    nullif(btrim(coalesce(p_page_context, '')), ''),
    nullif(btrim(coalesce(p_attachment_path, '')), ''),
    nullif(btrim(coalesce(p_attachment_name, '')), ''),
    p_attachment_size,
    v_attachment_type
  )
  returning id into v_ticket_id;

  -- Beri tahu SEMUA admin (hormati notification_prefs: tanpa baris prefs =
  -- in_app default true; dengan baris prefs, hanya bila in_app true).
  for v_admin in
    select p.id
    from public.profiles p
    left join public.notification_prefs np on np.user_id = p.id
    where p.role = 'admin'
      and (np.user_id is null or np.in_app)
  loop
    perform public.create_notification(
      v_admin.id,
      'sinebot_ticket_new',
      'Tiket baru: ' || v_subject,
      left(v_description, 200),
      jsonb_build_object('ticket_id', v_ticket_id)
    );
  end loop;

  return v_ticket_id;
end;
$$;
comment on function public.create_sinebot_ticket(text, text, text, text, text, text, text, int, text) is 'Create a SINEBOT support ticket (status open). Validates category/priority, non-empty subject/description, attachment allowlist (jpg/jpeg/png/webp/pdf) and size <= 5 MB. Notifies all admins (respecting notification_prefs in_app) via kind sinebot_ticket_new. Returns the ticket id.';
revoke execute on function public.create_sinebot_ticket(text, text, text, text, text, text, text, int, text) from public, anon;
grant execute on function public.create_sinebot_ticket(text, text, text, text, text, text, text, int, text) to authenticated;

-- Daftar tiket milik pemanggil, terbaru dulu. Hanya milik auth.uid().
create or replace function public.list_my_tickets()
returns setof public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'authentication required';
  end if;
  return query
    select * from public.support_tickets
    where user_id = v_caller
    order by created_at desc;
end;
$$;
comment on function public.list_my_tickets() is 'List the caller own support tickets, newest first. Own-rows only (user_id = auth.uid()).';
revoke execute on function public.list_my_tickets() from public, anon;
grant execute on function public.list_my_tickets() to authenticated;

-- Satu tiket + seluruh pesannya. Pemanggil harus pemilik tiket ATAU admin;
-- bila bukan, exception 'not found or not yours' (sengaja sama untuk tiket
-- yang tidak ada dan tiket orang lain — tidak membocorkan keberadaan tiket).
-- Bila admin, akses dicatat ke audit_log SEBELUM data dikembalikan.
-- Return: {"ticket": <row tiket>, "messages": [<row pesan + sender_name
-- + sender_type>]}. sender_type = 'admin' bila pengirim role admin, 'user'
-- bila bukan (klien memakai ini untuk membedakan balasan admin/pemilik).
-- sender_name berasal dari profiles.name (profiles TIDAK punya display_name).
create or replace function public.get_sinebot_ticket(
  p_ticket_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_ticket public.support_tickets;
  v_is_admin boolean := public.is_admin();
  v_messages jsonb;
begin
  if v_caller is null then
    raise exception 'authentication required';
  end if;

  select * into v_ticket
  from public.support_tickets
  where id = p_ticket_id;
  if not found then
    raise exception 'not found or not yours';
  end if;
  if v_ticket.user_id <> v_caller and not v_is_admin then
    raise exception 'not found or not yours';
  end if;

  if v_is_admin then
    perform public.log_audit(
      'sinebot_ticket_viewed',
      'support_tickets',
      p_ticket_id,
      jsonb_build_object('scope', 'detail')
    );
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'ticket_id', m.ticket_id,
      'sender_id', m.sender_id,
      'sender_name', coalesce(p.name, 'Pengguna'),
      'sender_type', case when p.role = 'admin' then 'admin' else 'user' end,
      'message', m.message,
      'attachment_path', m.attachment_path,
      'attachment_name', m.attachment_name,
      'attachment_size', m.attachment_size,
      'attachment_type', m.attachment_type,
      'created_at', m.created_at
    )
    order by m.created_at asc
  ), '[]'::jsonb)
  into v_messages
  from public.support_ticket_messages m
  left join public.profiles p on p.id = m.sender_id
  where m.ticket_id = p_ticket_id;

  return jsonb_build_object(
    'ticket', to_jsonb(v_ticket),
    'messages', v_messages
  );
end;
$$;
comment on function public.get_sinebot_ticket(uuid) is 'One ticket + its messages as {ticket, messages[]}. Caller must be the ticket owner or an admin (otherwise not found or not yours). Admin access is written to audit_log (sinebot_ticket_viewed, scope detail) before data is returned. messages carry sender_name from profiles.name and sender_type admin/user from the sender profile role.';
revoke execute on function public.get_sinebot_ticket(uuid) from public, anon;
grant execute on function public.get_sinebot_ticket(uuid) to authenticated;

-- Balas tiket. Pemanggil harus pemilik ATAU admin; pesan tidak boleh kosong;
-- validasi lampiran sama seperti create_sinebot_ticket; tiket 'closed'
-- menolak dengan exception 'ticket is closed'. Bila pengirim admin,
-- pemilik tiket diberi notifikasi kind 'sinebot_ticket_update'; bila
-- pengirim pemilik, admin yang assigned_to (bila ada) diberi notifikasi
-- yang sama. Mengembalikan id pesan.
create or replace function public.reply_to_sinebot_ticket(
  p_ticket_id uuid,
  p_message text,
  p_attachment_path text default null,
  p_attachment_name text default null,
  p_attachment_size int default null,
  p_attachment_type text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_ticket public.support_tickets;
  v_is_admin boolean := public.is_admin();
  v_body text := nullif(btrim(coalesce(p_message, '')), '');
  v_message_id uuid;
  v_attachment_type text;
begin
  if v_caller is null then
    raise exception 'authentication required';
  end if;
  if v_body is null then
    raise exception 'message must not be empty';
  end if;
  -- Normalisasi tipe lampiran seperti create_sinebot_ticket (MIME atau
  -- ekstensi -> simpan ekstensi; nilai lain ditolak).
  v_attachment_type := case lower(btrim(coalesce(p_attachment_type, '')))
    when 'image/jpeg' then 'jpeg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    when 'application/pdf' then 'pdf'
    when 'jpg' then 'jpg'
    when 'jpeg' then 'jpeg'
    when 'png' then 'png'
    when 'webp' then 'webp'
    when 'pdf' then 'pdf'
    when '' then null
    else null
  end;
  if p_attachment_type is not null and v_attachment_type is null then
    raise exception 'attachment type must be jpg, jpeg, png, webp, or pdf';
  end if;
  if p_attachment_size is not null and p_attachment_size > 5242880 then
    raise exception 'attachment size must not exceed 5 MB';
  end if;

  select * into v_ticket
  from public.support_tickets
  where id = p_ticket_id;
  if not found then
    raise exception 'not found or not yours';
  end if;
  if v_ticket.user_id <> v_caller and not v_is_admin then
    raise exception 'not found or not yours';
  end if;
  if v_ticket.status = 'closed' then
    raise exception 'ticket is closed';
  end if;

  insert into public.support_ticket_messages (
    ticket_id, sender_id, message,
    attachment_path, attachment_name, attachment_size, attachment_type
  )
  values (
    p_ticket_id, v_caller, v_body,
    nullif(btrim(coalesce(p_attachment_path, '')), ''),
    nullif(btrim(coalesce(p_attachment_name, '')), ''),
    p_attachment_size,
    v_attachment_type
  )
  returning id into v_message_id;

  if v_is_admin then
    -- Balasan admin -> beri tahu pemilik tiket (hormati prefs).
    perform public.notify_ticket_user(
      v_ticket.user_id,
      'sinebot_ticket_update',
      'Balasan baru untuk tiketmu: ' || v_ticket.subject,
      left(v_body, 200),
      jsonb_build_object('ticket_id', p_ticket_id)
    );
  elsif v_ticket.assigned_to is not null then
    -- Balasan pemilik -> beri tahu admin yang ditugaskan (bila ada, hormati prefs).
    perform public.notify_ticket_user(
      v_ticket.assigned_to,
      'sinebot_ticket_update',
      'Balasan baru pada tiket: ' || v_ticket.subject,
      left(v_body, 200),
      jsonb_build_object('ticket_id', p_ticket_id)
    );
  end if;

  return v_message_id;
end;
$$;
comment on function public.reply_to_sinebot_ticket(uuid, text, text, text, int, text) is 'Reply to a support ticket (owner or admin). Same attachment validation as create_sinebot_ticket. Closed tickets reject with ticket is closed. Notifies the other side via kind sinebot_ticket_update. Returns the message id.';
revoke execute on function public.reply_to_sinebot_ticket(uuid, text, text, text, int, text) from public, anon;
grant execute on function public.reply_to_sinebot_ticket(uuid, text, text, text, int, text) to authenticated;

-- Daftar tiket untuk dukungan admin. Guard is_admin(); filter status bila
-- diisi (divalidasi); search mencocokkan subject/description (ILIKE, dengan
-- escape % _ dan backslash). Akses dicatat ke audit_log SEBELUM data
-- dikembalikan (pola 048).
create or replace function public.admin_list_tickets(
  p_status text default null,
  p_search text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns setof public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_search text;
begin
  if not public.is_admin() then
    raise exception 'only an admin can view support tickets';
  end if;
  if p_status is not null
     and p_status not in ('open', 'assigned', 'in_progress', 'waiting_for_user', 'resolved', 'closed') then
    raise exception 'status must be open, assigned, in_progress, waiting_for_user, resolved, or closed';
  end if;
  if p_limit is null or p_limit < 1 then
    raise exception 'limit must be at least 1';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception 'offset must not be negative';
  end if;

  -- Escape karakter LIKE (backslash dulu, lalu % dan _) supaya search
  -- diperlakukan sebagai teks literal.
  if p_search is not null and btrim(p_search) <> '' then
    v_search := replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_');
  end if;

  perform public.log_audit(
    'sinebot_ticket_viewed',
    'support_tickets',
    null,
    jsonb_build_object('scope', 'list')
  );

  return query
    select * from public.support_tickets
    where (p_status is null or status = p_status)
      and (v_search is null
           or subject ilike '%' || v_search || '%' escape '\'
           or description ilike '%' || v_search || '%' escape '\')
    order by created_at desc
    limit p_limit
    offset p_offset;
end;
$$;
comment on function public.admin_list_tickets(text, text, int, int) is 'Admin-only support ticket list with optional status filter and ILIKE search over subject/description (%, _ escaped). Every call is written to audit_log (sinebot_ticket_viewed, scope list) before data is returned.';
revoke execute on function public.admin_list_tickets(text, text, int, int) from public, anon;
grant execute on function public.admin_list_tickets(text, text, int, int) to authenticated;

-- Ubah status tiket (admin). Validasi status; tiket 'closed' tidak boleh
-- diubah lagi; old_status diambil dulu untuk log + notifikasi. Catat
-- log_audit('sinebot_ticket_status_changed', ..., {old_status, new_status}),
-- update status + updated_at, beri tahu pemilik.
create or replace function public.admin_set_ticket_status(
  p_ticket_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.support_tickets;
begin
  if not public.is_admin() then
    raise exception 'only an admin can change a support ticket status';
  end if;
  if p_status is null
     or p_status not in ('open', 'assigned', 'in_progress', 'waiting_for_user', 'resolved', 'closed') then
    raise exception 'status must be open, assigned, in_progress, waiting_for_user, resolved, or closed';
  end if;

  select * into v_ticket
  from public.support_tickets
  where id = p_ticket_id
  for update;
  if not found then
    raise exception 'ticket not found';
  end if;
  if v_ticket.status = 'closed' then
    raise exception 'ticket is closed';
  end if;

  perform public.log_audit(
    'sinebot_ticket_status_changed',
    'support_tickets',
    p_ticket_id,
    jsonb_build_object('old_status', v_ticket.status, 'new_status', p_status)
  );

  update public.support_tickets
  set status = p_status,
      updated_at = now()
  where id = p_ticket_id;

  perform public.notify_ticket_user(
    v_ticket.user_id,
    'sinebot_ticket_update',
    'Status tiketmu berubah: ' || v_ticket.subject,
    'Status tiket berubah dari ' || v_ticket.status || ' menjadi ' || p_status || '.',
    jsonb_build_object('ticket_id', p_ticket_id, 'old_status', v_ticket.status, 'new_status', p_status)
  );
end;
$$;
comment on function public.admin_set_ticket_status(uuid, text) is 'Admin-only ticket status change. Closed tickets cannot be changed. Logs sinebot_ticket_status_changed with old/new status and notifies the owner (sinebot_ticket_update).';
revoke execute on function public.admin_set_ticket_status(uuid, text) from public, anon;
grant execute on function public.admin_set_ticket_status(uuid, text) to authenticated;

-- Tugaskan tiket ke admin. Assignee harus ada di profiles DAN role='admin';
-- tiket 'closed' menolak. Catat log_audit('sinebot_ticket_assigned', ...,
-- {assigned_to} — plus old_status/new_status bila status ikut berubah
-- 'open' -> 'assigned'), update assigned_to + updated_at, beri tahu pemilik.
create or replace function public.admin_assign_ticket(
  p_ticket_id uuid,
  p_assignee_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.support_tickets;
  v_is_admin_assignee boolean;
  v_new_status text;
  v_detail jsonb;
begin
  if not public.is_admin() then
    raise exception 'only an admin can assign a support ticket';
  end if;

  select exists (
    select 1 from public.profiles
    where id = p_assignee_id and role = 'admin'
  ) into v_is_admin_assignee;
  if not coalesce(v_is_admin_assignee, false) then
    raise exception 'assignee must be an admin';
  end if;

  select * into v_ticket
  from public.support_tickets
  where id = p_ticket_id
  for update;
  if not found then
    raise exception 'ticket not found';
  end if;
  if v_ticket.status = 'closed' then
    raise exception 'ticket is closed';
  end if;

  -- Bila tiket masih 'open', penugasan sekaligus mengubahnya 'assigned'.
  v_new_status := case when v_ticket.status = 'open' then 'assigned' else v_ticket.status end;
  v_detail := jsonb_build_object('assigned_to', p_assignee_id);
  if v_new_status <> v_ticket.status then
    v_detail := v_detail || jsonb_build_object('old_status', v_ticket.status, 'new_status', v_new_status);
  end if;

  perform public.log_audit(
    'sinebot_ticket_assigned',
    'support_tickets',
    p_ticket_id,
    v_detail
  );

  update public.support_tickets
  set assigned_to = p_assignee_id,
      status = v_new_status,
      updated_at = now()
  where id = p_ticket_id;

  perform public.notify_ticket_user(
    v_ticket.user_id,
    'sinebot_ticket_update',
    'Tiketmu ditugaskan ke admin: ' || v_ticket.subject,
    'Tiketmu kini ditangani oleh admin.',
    jsonb_build_object('ticket_id', p_ticket_id, 'assigned_to', p_assignee_id)
  );
end;
$$;
comment on function public.admin_assign_ticket(uuid, uuid) is 'Admin-only ticket assignment. Assignee must exist in profiles with role admin. Closed tickets reject. An open ticket becomes assigned on assignment (recorded in the audit detail). Logs sinebot_ticket_assigned and notifies the owner.';
revoke execute on function public.admin_assign_ticket(uuid, uuid) from public, anon;
grant execute on function public.admin_assign_ticket(uuid, uuid) to authenticated;

-- Ubah prioritas tiket (admin). Validasi prioritas; tiket 'closed' menolak.
-- Catat log_audit('sinebot_ticket_priority_changed', ..., {old_priority,
-- new_priority}), update + updated_at, beri tahu pemilik.
create or replace function public.admin_set_ticket_priority(
  p_ticket_id uuid,
  p_priority text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.support_tickets;
begin
  if not public.is_admin() then
    raise exception 'only an admin can change a support ticket priority';
  end if;
  if p_priority is null or p_priority not in ('low', 'medium', 'high', 'critical') then
    raise exception 'priority must be low, medium, high, or critical';
  end if;

  select * into v_ticket
  from public.support_tickets
  where id = p_ticket_id
  for update;
  if not found then
    raise exception 'ticket not found';
  end if;
  if v_ticket.status = 'closed' then
    raise exception 'ticket is closed';
  end if;

  perform public.log_audit(
    'sinebot_ticket_priority_changed',
    'support_tickets',
    p_ticket_id,
    jsonb_build_object('old_priority', v_ticket.priority, 'new_priority', p_priority)
  );

  update public.support_tickets
  set priority = p_priority,
      updated_at = now()
  where id = p_ticket_id;

  perform public.notify_ticket_user(
    v_ticket.user_id,
    'sinebot_ticket_update',
    'Prioritas tiketmu berubah: ' || v_ticket.subject,
    'Prioritas tiket berubah dari ' || v_ticket.priority || ' menjadi ' || p_priority || '.',
    jsonb_build_object('ticket_id', p_ticket_id, 'old_priority', v_ticket.priority, 'new_priority', p_priority)
  );
end;
$$;
comment on function public.admin_set_ticket_priority(uuid, text) is 'Admin-only ticket priority change. Closed tickets reject. Logs sinebot_ticket_priority_changed with old/new priority and notifies the owner (sinebot_ticket_update).';
revoke execute on function public.admin_set_ticket_priority(uuid, text) from public, anon;
grant execute on function public.admin_set_ticket_priority(uuid, text) to authenticated;

-- Daftar semua admin (untuk dropdown assign di panel admin). Guard is_admin().
-- name = coalesce(profiles.name, 'Admin') — profiles TIDAK punya kolom
-- display_name (verifikasi grep migrasi 001–051 + src/).
create or replace function public.admin_list_admins()
returns table (
  id uuid,
  name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'only an admin can list admins';
  end if;
  return query
    select p.id, coalesce(p.name, 'Admin')::text as name
    from public.profiles p
    where p.role = 'admin'
    order by name asc;
end;
$$;
comment on function public.admin_list_admins() is 'Admin-only list of all admin profiles (id, name) for the ticket-assignment picker. name comes from profiles.name (no display_name column exists in profiles).';
revoke execute on function public.admin_list_admins() from public, anon;
grant execute on function public.admin_list_admins() to authenticated;

-- ---------------------------------------------------------------------------
-- (e) get_my_sinebot_status() — CREATE OR REPLACE dari 051, HANYA cabang
--     'tickets' yang diubah (kini membaca support_tickets). Semua cabang
--     lain disalin VERBATIM dari 051; diff diverifikasi saat penulisan
--     (lihat laporan worker 052). Komentar fungsi diperbarui: tickets kini
--     tersedia.
-- ---------------------------------------------------------------------------
create or replace function public.get_my_sinebot_status(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_items jsonb := '[]'::jsonb;
  v_note text;
  v_available boolean := true;
begin
  -- 1. Validasi kind dulu (sebelum guard login, supaya kind tak dikenal
  --    ditolak sama untuk tamu maupun pengguna login).
  if p_kind is null or p_kind not in (
    'enrollment', 'assignments', 'certificates',
    'mentor_application', 'tickets', 'service'
  ) then
    raise exception 'unknown status kind';
  end if;

  -- 2. Guard login. Pengecualian: 'service' adalah status layanan umum
  --    tanpa data pribadi, jadi boleh dipanggil tamu tanpa login.
  if v_caller is null and p_kind <> 'service' then
    raise exception 'authentication required';
  end if;

  -- 3. Satu cabang per kind. Semua cabang data memakai
  --    user_id = v_caller (own-rows-only, lihat header).
  if p_kind = 'enrollment' then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'course_id', e.course_id,
        'course', c.title,
        'enrolled_at', e.enrolled_at
      )
      order by e.enrolled_at desc
    ), '[]'::jsonb)
    into v_items
    from public.enrollments e
    join public.courses c on c.id = e.course_id
    where e.user_id = v_caller;

    v_note := case
      when jsonb_array_length(v_items) = 0
        then 'Kamu belum terdaftar di course apa pun.'
      else 'Kamu terdaftar di ' || jsonb_array_length(v_items)::text || ' course.'
    end;

  elsif p_kind = 'assignments' then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'title', a.title,
        'score', s.score,
        'feedback', s.feedback,
        'submitted_at', s.submitted_at,
        'graded_at', s.graded_at
      )
      order by s.submitted_at desc
    ), '[]'::jsonb)
    into v_items
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    where s.user_id = v_caller;

    v_note := case
      when jsonb_array_length(v_items) = 0
        then 'Belum ada tugas yang kamu kumpulkan.'
      else 'Kamu sudah mengumpulkan ' || jsonb_array_length(v_items)::text || ' tugas.'
    end;

  elsif p_kind = 'certificates' then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'type', cert.type,
        'serial', cert.serial,
        'course', coalesce(c.title, cert.program_name),
        'score', cert.score,
        'issued_at', cert.issued_at,
        'status', cert.status
      )
      order by cert.issued_at desc
    ), '[]'::jsonb)
    into v_items
    from public.certificates cert
    left join public.courses c on c.id = cert.course_id
    where cert.user_id = v_caller;

    v_note := case
      when jsonb_array_length(v_items) = 0
        then 'Belum ada sertifikat atas namamu.'
      else 'Kamu memiliki ' || jsonb_array_length(v_items)::text || ' sertifikat.'
    end;

  elsif p_kind = 'mentor_application' then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'status', ma.status,
        'expertise', ma.expertise,
        'created_at', ma.created_at
      )
      order by ma.created_at desc
    ), '[]'::jsonb)
    into v_items
    from public.mentor_applications ma
    where ma.user_id = v_caller;

    v_note := case
      when jsonb_array_length(v_items) = 0
        then 'Kamu belum pernah mengajukan diri sebagai mentor.'
      else 'Status pengajuan mentormu: ' ||
        (v_items -> 0 ->> 'status') || '.'
    end;

  elsif p_kind = 'tickets' then
    -- Tahap 4 (052): support_tickets kini ada — baca tiket milik pemanggil.
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'subject', t.subject,
        'category', t.category,
        'priority', t.priority,
        'status', t.status,
        'assigned_to', t.assigned_to,
        'created_at', t.created_at,
        'updated_at', t.updated_at
      )
      order by t.created_at desc
    ), '[]'::jsonb)
    into v_items
    from public.support_tickets t
    where t.user_id = v_caller;

    v_note := case
      when jsonb_array_length(v_items) = 0
        then 'Belum ada tiket dukungan.'
      else 'Kamu memiliki ' || jsonb_array_length(v_items)::text || ' tiket.'
    end;

  elsif p_kind = 'service' then
    -- Status umum statis, tanpa data pribadi. Boleh dipanggil tanpa login.
    v_items := jsonb_build_array(
      jsonb_build_object('layanan', 'SINEVERSE', 'status', 'operasional')
    );
    v_note := 'Layanan SINEVERSE beroperasi normal.';
  end if;

  return jsonb_build_object(
    'kind', p_kind,
    'available', v_available,
    'count', jsonb_array_length(v_items),
    'items', v_items,
    'note', v_note
  );
end;
$$;
comment on function public.get_my_sinebot_status(text) is 'SINEBOT troubleshooting (read-only, own-rows-only). Returns {kind, available, count, items, note} for enrollment | assignments | certificates | mentor_application | tickets | service. tickets reads the caller own support_tickets (Tahap 4, migration 052); service is a static public status and needs no login.';
-- Hanya pengguna login yang boleh mengeksekusi. REVOKE dari public/anon
-- dulu (fungsi Postgres default-nya EXECUTE TO PUBLIC), lalu GRANT
-- eksplisit ke authenticated. Tamu tetap bisa memanggil kind service
-- HANYA lewat Edge Function (service-role), bukan langsung sebagai anon.
revoke execute on function public.get_my_sinebot_status(text) from public, anon;
grant execute on function public.get_my_sinebot_status(text) to authenticated;

-- ============================================================================
-- Done. Verifikasi SETELAH parent menerapkan (lihat laporan worker 052
-- untuk skrip uji lengkap — termasuk lifecycle status, lintas-pengguna,
-- notifikasi, cabang tickets, dan pembersihan data uji):
--   * Table Editor menunjukkan support_tickets + support_ticket_messages.
--   * Storage menunjukkan bucket privat ticket-attachments.
--   * Spot-check: anon SELECT support_tickets gagal; authenticated INSERT
--     langsung ke support_tickets gagal; pemilik SELECT tiketnya berhasil.
--   * Spot-check RPC: create sebagai Siswa Uji berhasil + notifikasi admin
--     tercipta; prioritas/tipe lampiran invalid ditolak; Mentor Uji TIDAK
--     bisa membaca/membalas tiket Siswa Uji; tamu TIDAK bisa membuat tiket.
--   * Spot-check admin: lifecycle Open -> Assigned -> In Progress ->
--     Waiting for User -> Resolved -> Closed; ubah tiket closed ditolak;
--     setiap aksi admin tercatat di audit_log.
--   * Spot-check get_my_sinebot_status('tickets') mengembalikan tiket nyata
--     milik pemanggil dengan available=true.
-- ============================================================================
