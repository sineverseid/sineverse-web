-- SINEVERSE — Migration 054: SINEBOT Admin & Analytics (Tahap 5), 23 Nov 2026.
--
-- Tujuan: panel admin SINEBOT — pengaturan runtime (ai_settings), riwayat
-- versi artikel/FAQ (ai_kb_history), dan RPC admin untuk overview,
-- timeseries, kualitas jawaban, audit log, serta CRUD KB/FAQ berversi.
-- Semua tulis dari console TETAP lewat RPC di bawah (versioning + audit),
-- bukan direct write — mengikuti pola 048/052.
--
-- Yang dipakai dari migrasi lama (sudah ada, tidak dibuat ulang):
--   * public.profiles (001) — FK updated_by / changed_by / owner_id;
--     kolom nama adalah profiles.name (TIDAK ada display_name).
--   * public.is_admin() (001) — guard admin di policy + RPC.
--   * public.log_audit(...) (008) — pencatat aksi admin ke audit_log
--     (kolom: actor_id, action, target_type, target_id, detail, created_at).
--   * public.set_updated_at() (048) — trigger updated_at generik.
--   * Tabel 048: ai_conversations, ai_messages, ai_knowledge_base,
--     ai_faq, ai_feedback. Tabel 052: support_tickets,
--     support_ticket_messages (kolom pengirimnya sender_id, BUKAN
--     sender_type).
--
-- BATASAN JUJUR (baca sebelum memakai):
--   * tickets_avg_resolution_hours di admin_sinebot_overview() adalah
--     PERKIRAAN dari updated_at - created_at untuk tiket resolved/closed:
--     support_tickets TIDAK punya kolom resolved_at, dan updated_at ikut
--     berubah pada setiap update (balasan, assign, prioritas), jadi angka
--     ini melebih-lebihkan durasi bila tiket disentuh setelah resolved.
--     Bila durasi resolusi akurat menjadi syarat, tambahkan kolom
--     resolved_at (pekerjaan terpisah).
--   * prompt_version di ai_settings HANYA label: Edge Function tidak
--     mengubah teks system prompt berdasarkan nilainya.
--   * feature_flags di ai_settings disimpan/ditampilkan saja dan TIDAK
--     ditegakkan oleh Edge Function.
--   * admin_sinebot_quality() mengembalikan question NULL untuk setiap
--     jawaban AI tanpa sumber. Alasannya ada di komentar fungsi itu:
--     ai_messages tidak punya kolom urutan — hanya created_at
--     (timestamptz, resolusi mikrodetik, tidak dijamin unik/monoton) —
--     sehingga "pesan user tepat sebelumnya" tidak bisa diidentifikasi
--     dengan pasti; mengembalikannya berarti berpotensi salah atribusi.
--     Admin tetap mendapat conversation_id + asked_at untuk membuka
--     percakapan itu.
--   * tickets_open di overview = tiket berstatus open, assigned,
--     in_progress, atau waiting_for_user (belum resolved/closed).
--   * Versi FAQ TIDAK disimpan di ai_faq (tabel itu tidak punya kolom
--     version — lihat 048); versi FAQ hidup HANYA di ai_kb_history
--     (kind='faq'). admin_list_faqs() menampilkan max(version) history
--     atau 1 bila belum ada history (mis. FAQ seed 049 yang belum pernah
--     diedit lewat RPC Tahap 5).
--   * DEVIASI dari spek tugas (wajib, bukan pilihan): PostgreSQL
--     mengharuskan parameter ber-default berada di posisi trailing —
--     "input parameters after one with a default value must also have
--     defaults". Karena itu admin_save_kb_article() /
--     admin_save_faq() mendeklarasikan p_title/p_question dan kawan-kawan
--     dengan DEFAULT NULL juga; validasi non-empty di dalam fungsi tetap
--     menolak pemanggilan tanpa nilai tersebut. Tanda tangan
--     (nama + tipe parameter) tetap sama seperti spek.
--   * TIDAK ADA artikel/FAQ uji di migrasi ini — hanya seed ai_settings.
--
-- Cara menerapkan: Supabase Dashboard -> SQL Editor -> paste file ini
-- -> Run. TIDAK diterapkan otomatis; parent yang menerapkan. Terapkan
-- SETELAH 048–053.
-- Idempotent sebisa mungkin (IF NOT EXISTS / DROP POLICY IF EXISTS /
-- CREATE OR REPLACE / ON CONFLICT DO NOTHING).
--
-- CATATAN PASTE: file ini TIDAK mengandung satu pun karakter backslash
-- (pencarian memakai position(), bukan LIKE ... ESCAPE) — jalur paste
-- SQL Editor pernah menggandakan backslash (lihat 052).

-- ---------------------------------------------------------------------------
-- (a) Tabel ai_settings — pengaturan runtime SINEBOT (11 kunci, lihat seed)
-- ---------------------------------------------------------------------------

create table if not exists public.ai_settings (
  "key" text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
comment on table public.ai_settings is 'SINEBOT runtime settings (Tahap 5). Read by the sinebot-chat Edge Function every request; written only via admin_set_setting(). Keys seeded below mirror the live Edge Function defaults.';
comment on column public.ai_settings."key" is 'Setting key (allowlist of 11 keys, enforced in admin_set_setting()).';
comment on column public.ai_settings.value is 'Setting value as JSON (object / number / string / array per key).';

alter table public.ai_settings enable row level security;

-- SATU policy SELECT admin-only. TIDAK ADA policy INSERT/UPDATE/DELETE
-- untuk client — tulis hanya lewat RPC admin_set_setting().
drop policy if exists "ai_settings_select_admin" on public.ai_settings;
create policy "ai_settings_select_admin"
  on public.ai_settings for select to authenticated
  using (public.is_admin());

-- Seed: 11 kunci = config live Edge Function saat ini. ON CONFLICT DO
-- NOTHING supaya nilai yang sudah diubah admin tidak pernah tertimpa
-- bila migrasi dijalankan ulang.
insert into public.ai_settings ("key", value) values
  ('provider_primary', '{"provider": "groq", "model": "openai/gpt-oss-120b"}'::jsonb),
  ('provider_fallbacks', '[{"provider": "openrouter", "model": "openai/gpt-oss-120b:free"}, {"provider": "sambanova", "model": "Meta-Llama-3.3-70B-Instruct"}]'::jsonb),
  ('provider_timeout_ms', '25000'::jsonb),
  ('provider_temperature', '0.3'::jsonb),
  ('provider_max_tokens', '600'::jsonb),
  ('rate_limit_messages', '20'::jsonb),
  ('rate_limit_window_minutes', '60'::jsonb),
  ('kb_result_limit', '5'::jsonb),
  ('prompt_version', '"v1"'::jsonb),
  ('quota_exhaustion', '{"mode": "stop_and_offer_ticket"}'::jsonb),
  ('feature_flags', '{"ticketing": true, "status_check": true, "kb_search": true}'::jsonb)
on conflict ("key") do nothing;

-- ---------------------------------------------------------------------------
-- (b) Tabel ai_kb_history — snapshot versi artikel/FAQ
-- ---------------------------------------------------------------------------

create table if not exists public.ai_kb_history (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('article', 'faq')),
  kb_id uuid not null,
  version int not null,
  title text not null,
  content text not null,
  category text not null,
  audience_roles text[] not null,
  status text not null,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);
comment on table public.ai_kb_history is 'Version snapshots of KB articles and FAQs (Tahap 5). One row per save/status change; the snapshot holds the NEW row state. FAQ versions live ONLY here (ai_faq has no version column).';
comment on column public.ai_kb_history.kb_id is 'Id of the article (ai_knowledge_base) or FAQ (ai_faq). Deliberately NO foreign key: history must survive even if the article/FAQ row is deleted (audit trail).';
comment on column public.ai_kb_history.title is 'Article title, or FAQ question when kind = faq.';
comment on column public.ai_kb_history.content is 'Article content, or FAQ answer when kind = faq.';

alter table public.ai_kb_history enable row level security;

-- SATU policy SELECT admin-only. TIDAK ADA policy tulis untuk client —
-- baris ditulis hanya oleh RPC admin_save_*/admin_set_kb_status().
drop policy if exists "ai_kb_history_select_admin" on public.ai_kb_history;
create policy "ai_kb_history_select_admin"
  on public.ai_kb_history for select to authenticated
  using (public.is_admin());

create index if not exists ai_kb_history_kind_kb_idx
  on public.ai_kb_history (kind, kb_id, version desc);

-- ---------------------------------------------------------------------------
-- (c) RPC SECURITY DEFINER (set search_path = public, pola 048/052)
--     Semua: guard is_admin() eksplisit, REVOKE EXECUTE FROM public, anon
--     + GRANT EXECUTE TO authenticated.
-- ---------------------------------------------------------------------------

-- Semua pengaturan sebagai {key, value, updated_at, updated_by}, urut key.
create or replace function public.admin_get_settings()
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'only an admin can view SINEBOT settings';
  end if;
  return query
    select jsonb_build_object(
      'key', s."key",
      'value', s.value,
      'updated_at', s.updated_at,
      'updated_by', s.updated_by
    )
    from public.ai_settings s
    order by s."key" asc;
end;
$$;
comment on function public.admin_get_settings() is 'Admin-only: all ai_settings rows as {key, value, updated_at, updated_by}, ordered by key.';
revoke execute on function public.admin_get_settings() from public, anon;
grant execute on function public.admin_get_settings() to authenticated;

-- Ubah satu pengaturan (allowlist 11 kunci + validasi tipe/rentang per
-- kunci). Mengembalikan baris ter-update sebagai jsonb. Aksi dicatat ke
-- audit_log (sinebot_settings_changed, detail {key}).
create or replace function public.admin_set_setting(
  p_key text,
  p_value jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_num numeric;
  v_text text;
  v_key text;
  v_value jsonb;
  v_updated_at timestamptz;
  v_updated_by uuid;
begin
  if not public.is_admin() then
    raise exception 'only an admin can change SINEBOT settings';
  end if;
  if p_key is null or p_key not in (
    'provider_primary', 'provider_fallbacks', 'provider_timeout_ms',
    'provider_temperature', 'provider_max_tokens', 'rate_limit_messages',
    'rate_limit_window_minutes', 'kb_result_limit', 'prompt_version',
    'quota_exhaustion', 'feature_flags'
  ) then
    raise exception 'unknown setting key: %', p_key;
  end if;
  if p_value is null then
    raise exception 'setting value must not be null';
  end if;

  -- Validasi tipe/rentang per kunci.
  if p_key = 'provider_primary' then
    if jsonb_typeof(p_value) <> 'object'
       or coalesce(btrim(p_value ->> 'provider'), '') = ''
       or coalesce(btrim(p_value ->> 'model'), '') = '' then
      raise exception 'provider_primary must be an object with non-empty provider and model strings';
    end if;
  elsif p_key = 'provider_fallbacks' then
    if jsonb_typeof(p_value) <> 'array' then
      raise exception 'provider_fallbacks must be an array of provider objects';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(p_value) as e(elem)
      where jsonb_typeof(e.elem) <> 'object'
         or coalesce(btrim(e.elem ->> 'provider'), '') = ''
         or coalesce(btrim(e.elem ->> 'model'), '') = ''
    ) then
      raise exception 'each provider_fallbacks entry must be an object with non-empty provider and model strings';
    end if;
  elsif p_key = 'provider_timeout_ms' then
    if jsonb_typeof(p_value) <> 'number' then
      raise exception 'provider_timeout_ms must be a number';
    end if;
    v_num := (p_value::text)::numeric;
    if v_num <> trunc(v_num) or v_num < 5000 or v_num > 60000 then
      raise exception 'provider_timeout_ms must be an integer between 5000 and 60000';
    end if;
  elsif p_key = 'provider_temperature' then
    if jsonb_typeof(p_value) <> 'number' then
      raise exception 'provider_temperature must be a number';
    end if;
    v_num := (p_value::text)::numeric;
    if v_num < 0 or v_num > 1 then
      raise exception 'provider_temperature must be between 0 and 1';
    end if;
  elsif p_key = 'provider_max_tokens' then
    if jsonb_typeof(p_value) <> 'number' then
      raise exception 'provider_max_tokens must be a number';
    end if;
    v_num := (p_value::text)::numeric;
    if v_num <> trunc(v_num) or v_num < 50 or v_num > 4000 then
      raise exception 'provider_max_tokens must be an integer between 50 and 4000';
    end if;
  elsif p_key = 'rate_limit_messages' then
    if jsonb_typeof(p_value) <> 'number' then
      raise exception 'rate_limit_messages must be a number';
    end if;
    v_num := (p_value::text)::numeric;
    if v_num <> trunc(v_num) or v_num < 1 or v_num > 100 then
      raise exception 'rate_limit_messages must be an integer between 1 and 100';
    end if;
  elsif p_key = 'rate_limit_window_minutes' then
    if jsonb_typeof(p_value) <> 'number' then
      raise exception 'rate_limit_window_minutes must be a number';
    end if;
    v_num := (p_value::text)::numeric;
    if v_num <> trunc(v_num) or v_num < 1 or v_num > 1440 then
      raise exception 'rate_limit_window_minutes must be an integer between 1 and 1440';
    end if;
  elsif p_key = 'kb_result_limit' then
    if jsonb_typeof(p_value) <> 'number' then
      raise exception 'kb_result_limit must be a number';
    end if;
    v_num := (p_value::text)::numeric;
    if v_num <> trunc(v_num) or v_num < 1 or v_num > 10 then
      raise exception 'kb_result_limit must be an integer between 1 and 10';
    end if;
  elsif p_key = 'prompt_version' then
    if jsonb_typeof(p_value) <> 'string' then
      raise exception 'prompt_version must be a string';
    end if;
    v_text := p_value #>> '{}';
    if v_text is null or btrim(v_text) = '' or length(v_text) > 20 then
      raise exception 'prompt_version must be a non-empty string of at most 20 characters';
    end if;
  elsif p_key = 'quota_exhaustion' then
    if jsonb_typeof(p_value) <> 'object'
       or (p_value ->> 'mode') <> 'stop_and_offer_ticket' then
      raise exception 'quota_exhaustion.mode must be stop_and_offer_ticket';
    end if;
  elsif p_key = 'feature_flags' then
    if jsonb_typeof(p_value) <> 'object' then
      raise exception 'feature_flags must be an object of booleans';
    end if;
    if exists (
      select 1
      from jsonb_each(p_value) as f(k, v)
      where jsonb_typeof(f.v) <> 'boolean'
    ) then
      raise exception 'feature_flags values must be boolean';
    end if;
  end if;

  insert into public.ai_settings ("key", value, updated_at, updated_by)
  values (p_key, p_value, now(), auth.uid())
  on conflict ("key") do update
    set value = excluded.value,
        updated_at = now(),
        updated_by = auth.uid()
  returning "key", value, updated_at, updated_by
    into v_key, v_value, v_updated_at, v_updated_by;

  perform public.log_audit(
    'sinebot_settings_changed',
    'ai_settings',
    null,
    jsonb_build_object('key', p_key)
  );

  return jsonb_build_object(
    'key', v_key,
    'value', v_value,
    'updated_at', v_updated_at,
    'updated_by', v_updated_by
  );
end;
$$;
comment on function public.admin_set_setting(text, jsonb) is 'Admin-only: upsert one ai_settings row (allowlist of 11 keys, per-key type/range validation). Logs sinebot_settings_changed to audit_log. Returns the updated row as {key, value, updated_at, updated_by}.';
revoke execute on function public.admin_set_setting(text, jsonb) from public, anon;
grant execute on function public.admin_set_setting(text, jsonb) to authenticated;

-- Ringkasan angka SINEBOT: percakapan, pesan, tiket (terbuka/kritis,
-- per status/kategori/prioritas), feedback, KB/FAQ per status, rata-rata
-- durasi resolusi tiket, dan status layanan. Semua dari COUNT nyata;
-- 0 bila kosong; rate null bila belum ada feedback.
-- tickets_open = open/assigned/in_progress/waiting_for_user.
-- tickets_avg_resolution_hours adalah PERKIRAAN dari updated_at (tidak
-- ada kolom resolved_at — lihat header file).
create or replace function public.admin_sinebot_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'only an admin can view SINEBOT analytics';
  end if;

  select jsonb_build_object(
    'conversations_total', (select count(*) from public.ai_conversations),
    'conversations_today', (select count(*) from public.ai_conversations where created_at >= current_date),
    'messages_total', (select count(*) from public.ai_messages),
    'tickets_open', (select count(*) from public.support_tickets where status in ('open', 'assigned', 'in_progress', 'waiting_for_user')),
    'tickets_critical', (select count(*) from public.support_tickets where priority = 'critical'),
    'tickets_by_status', jsonb_build_object(
      'open', (select count(*) from public.support_tickets where status = 'open'),
      'assigned', (select count(*) from public.support_tickets where status = 'assigned'),
      'in_progress', (select count(*) from public.support_tickets where status = 'in_progress'),
      'waiting_for_user', (select count(*) from public.support_tickets where status = 'waiting_for_user'),
      'resolved', (select count(*) from public.support_tickets where status = 'resolved'),
      'closed', (select count(*) from public.support_tickets where status = 'closed')
    ),
    'tickets_by_category', coalesce(
      (select jsonb_object_agg(category, cnt) from (select category, count(*) as cnt from public.support_tickets group by category) c),
      '{}'::jsonb
    ),
    'tickets_by_priority', coalesce(
      (select jsonb_object_agg(priority, cnt) from (select priority, count(*) as cnt from public.support_tickets group by priority) p),
      '{}'::jsonb
    ),
    'feedback_helpful', (select count(*) from public.ai_feedback where rating = 'helpful'),
    'feedback_not_helpful', (select count(*) from public.ai_feedback where rating = 'not_helpful'),
    'feedback_helpful_rate', (
      select case when count(*) = 0 then null
        else round(count(*) filter (where rating = 'helpful')::numeric / count(*), 4)
      end
      from public.ai_feedback
    ),
    'kb_published', (select count(*) from public.ai_knowledge_base where status = 'published'),
    'kb_draft', (select count(*) from public.ai_knowledge_base where status = 'draft'),
    'kb_archived', (select count(*) from public.ai_knowledge_base where status = 'archived'),
    'faq_published', (select count(*) from public.ai_faq where status = 'published'),
    'faq_draft', (select count(*) from public.ai_faq where status = 'draft'),
    'faq_archived', (select count(*) from public.ai_faq where status = 'archived'),
    'tickets_avg_resolution_hours', (
      select case when count(*) = 0 then null
        else round(avg(extract(epoch from (updated_at - created_at)) / 3600)::numeric, 2)
      end
      from public.support_tickets
      where status in ('resolved', 'closed')
    ),
    'service_status', 'operasional'
  ) into v_result;

  return v_result;
end;
$$;
comment on function public.admin_sinebot_overview() is 'Admin-only: SINEBOT headline numbers (conversations, messages, tickets open/critical/by status/category/priority, feedback + helpful rate, KB/FAQ by status, avg ticket resolution hours, service status). Counts are real; 0 when empty; rates null when no data. Resolution hours is an estimate from updated_at (no resolved_at column exists).';
revoke execute on function public.admin_sinebot_overview() from public, anon;
grant execute on function public.admin_sinebot_overview() to authenticated;

-- Deret harian {day, conversations, messages, tickets} selama p_days hari
-- terakhir (termasuk hari ini). Hari tanpa aktivitas tetap muncul dengan 0.
create or replace function public.admin_sinebot_timeseries(
  p_days int default 14
)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'only an admin can view SINEBOT analytics';
  end if;
  if p_days is null then
    p_days := 14;
  end if;
  if p_days < 1 or p_days > 90 then
    raise exception 'p_days must be between 1 and 90';
  end if;

  return query
    select jsonb_build_object(
      'day', gs.day::date,
      'conversations', (select count(*) from public.ai_conversations c where c.created_at::date = gs.day::date),
      'messages', (select count(*) from public.ai_messages m where m.created_at::date = gs.day::date),
      'tickets', (select count(*) from public.support_tickets t where t.created_at::date = gs.day::date)
    )
    from generate_series(
      (current_date - (p_days - 1))::timestamp,
      current_date::timestamp,
      interval '1 day'
    ) as gs(day)
    order by gs.day asc;
end;
$$;
comment on function public.admin_sinebot_timeseries(int) is 'Admin-only: daily {day, conversations, messages, tickets} for the last p_days days (1..90, default 14), including zero-activity days. Counts are by created_at date.';
revoke execute on function public.admin_sinebot_timeseries(int) from public, anon;
grant execute on function public.admin_sinebot_timeseries(int) to authenticated;

-- Kualitas jawaban AI: total jawaban AI, berapa yang memakai sumber
-- (sources bukan array kosong) + persentasenya, berapa yang tanpa sumber,
-- feedback, jumlah tiket sebagai proksi eskalasi, dan daftar jawaban tanpa
-- sumber (maks 20, terbaru dulu).
-- question SENGAJA NULL (bukan hasil join): ai_messages tidak punya kolom
-- urutan — hanya created_at (timestamptz; now() beresolusi mikrodetik dan
-- tidak dijamin unik/monoton antar-insert, dan dua pesan bisa berbagi nilai
-- yang sama). Karena itu "pesan user tepat sebelumnya dalam percakapan
-- yang sama" tidak bisa diidentifikasi dengan pasti dari created_at saja;
-- mengembalikan isi pesan hasil tebak-join berarti berpotensi
-- mengatribusikan pertanyaan yang salah ke jawaban ini. Admin memakai
-- conversation_id + asked_at (created_at jawaban AI itu) untuk membuka
-- percakapan dan membaca pertanyaan aslinya.
create or replace function public.admin_sinebot_quality()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'only an admin can view SINEBOT analytics';
  end if;

  select jsonb_build_object(
    'ai_messages_total', (select count(*) from public.ai_messages where sender_type = 'ai'),
    'ai_sourced', (select count(*) from public.ai_messages where sender_type = 'ai' and sources <> '[]'::jsonb),
    'ai_sourced_pct', (
      select case when count(*) = 0 then null
        else round(count(*) filter (where sources <> '[]'::jsonb)::numeric / count(*), 4)
      end
      from public.ai_messages where sender_type = 'ai'
    ),
    'ai_unsourced', (select count(*) from public.ai_messages where sender_type = 'ai' and sources = '[]'::jsonb),
    'feedback_helpful', (select count(*) from public.ai_feedback where rating = 'helpful'),
    'feedback_not_helpful', (select count(*) from public.ai_feedback where rating = 'not_helpful'),
    'escalations_to_ticket', (select count(*) from public.support_tickets),
    'unanswered', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'conversation_id', m.conversation_id,
          'question', null::text,
          'asked_at', m.created_at
        )
        order by m.created_at desc
      )
      from (
        select conversation_id, created_at
        from public.ai_messages
        where sender_type = 'ai' and sources = '[]'::jsonb
        order by created_at desc
        limit 20
      ) m
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
comment on function public.admin_sinebot_quality() is 'Admin-only: AI answer quality (AI messages total/sourced/sourced pct/unsourced, feedback, ticket count as escalation proxy, up to 20 unsourced answers as {conversation_id, question, asked_at}). question is always null by design: ai_messages has no ordering column, so the preceding user message cannot be identified with certainty from created_at alone (see function comment).';
revoke execute on function public.admin_sinebot_quality() from public, anon;
grant execute on function public.admin_sinebot_quality() to authenticated;

-- Audit log SINEBOT: tanpa p_action, hanya aksi SINEBOT/tiket
-- (action LIKE sinebot% ATAU ILIKE %ticket%); bila p_action diisi, filter
-- action = p_action persis. Terbaru dulu. actor_name dari profiles.name.
create or replace function public.admin_sinebot_audit_log(
  p_action text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'only an admin can view the SINEBOT audit log';
  end if;
  if p_limit is null then
    p_limit := 50;
  end if;
  if p_limit < 1 or p_limit > 100 then
    raise exception 'limit must be between 1 and 100';
  end if;
  if p_offset is null then
    p_offset := 0;
  end if;
  if p_offset < 0 then
    raise exception 'offset must not be negative';
  end if;

  return query
    select jsonb_build_object(
      'id', a.id,
      'actor_id', a.actor_id,
      'actor_name', coalesce(p.name, '—'),
      'action', a.action,
      'target_type', a.target_type,
      'target_id', a.target_id,
      'detail', a.detail,
      'created_at', a.created_at
    )
    from public.audit_log a
    left join public.profiles p on p.id = a.actor_id
    where (p_action is null
           and (a.action like 'sinebot%' or a.action ilike '%ticket%'))
       or (p_action is not null and a.action = p_action)
    order by a.created_at desc
    limit p_limit
    offset p_offset;
end;
$$;
comment on function public.admin_sinebot_audit_log(text, int, int) is 'Admin-only: audit_log rows for SINEBOT/ticket actions (newest first), with actor_name from profiles.name. Without p_action, filters action LIKE sinebot% OR ILIKE %ticket%; with p_action, filters action = p_action exactly. Limit 1..100, offset >= 0.';
revoke execute on function public.admin_sinebot_audit_log(text, int, int) from public, anon;
grant execute on function public.admin_sinebot_audit_log(text, int, int) to authenticated;

-- Daftar artikel KB (admin): filter status + pencarian substring
-- case-insensitive pada title via position() (tanpa LIKE, tanpa escape).
create or replace function public.admin_list_kb_articles(
  p_status text default null,
  p_search text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_search text;
begin
  if not public.is_admin() then
    raise exception 'only an admin can list knowledge base articles';
  end if;
  if p_status is not null and p_status not in ('draft', 'published', 'archived') then
    raise exception 'status must be draft, published, or archived';
  end if;
  if p_limit is null then
    p_limit := 50;
  end if;
  if p_limit < 1 or p_limit > 100 then
    raise exception 'limit must be between 1 and 100';
  end if;
  if p_offset is null then
    p_offset := 0;
  end if;
  if p_offset < 0 then
    raise exception 'offset must not be negative';
  end if;
  if p_search is not null and btrim(p_search) <> '' then
    v_search := lower(btrim(p_search));
  end if;

  return query
    select jsonb_build_object(
      'id', k.id,
      'title', k.title,
      'category', k.category,
      'status', k.status,
      'audience_roles', k.audience_roles,
      'version', k.version,
      'owner_id', k.owner_id,
      'owner_name', p.name,
      'published_at', k.published_at,
      'updated_at', k.updated_at
    )
    from public.ai_knowledge_base k
    left join public.profiles p on p.id = k.owner_id
    where (p_status is null or k.status = p_status)
      and (v_search is null or position(v_search in lower(k.title)) > 0)
    order by k.updated_at desc
    limit p_limit
    offset p_offset;
end;
$$;
comment on function public.admin_list_kb_articles(text, text, int, int) is 'Admin-only: KB article list with optional status filter and case-insensitive literal substring search over title (position, no LIKE wildcards). Newest-updated first. Limit 1..100, offset >= 0.';
revoke execute on function public.admin_list_kb_articles(text, text, int, int) from public, anon;
grant execute on function public.admin_list_kb_articles(text, text, int, int) to authenticated;

-- Daftar FAQ (admin): pola sama dengan artikel; version = max(version)
-- di ai_kb_history kind=faq, atau 1 bila belum ada history (ai_faq tidak
-- punya kolom version).
create or replace function public.admin_list_faqs(
  p_status text default null,
  p_search text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_search text;
begin
  if not public.is_admin() then
    raise exception 'only an admin can list FAQs';
  end if;
  if p_status is not null and p_status not in ('draft', 'published', 'archived') then
    raise exception 'status must be draft, published, or archived';
  end if;
  if p_limit is null then
    p_limit := 50;
  end if;
  if p_limit < 1 or p_limit > 100 then
    raise exception 'limit must be between 1 and 100';
  end if;
  if p_offset is null then
    p_offset := 0;
  end if;
  if p_offset < 0 then
    raise exception 'offset must not be negative';
  end if;
  if p_search is not null and btrim(p_search) <> '' then
    v_search := lower(btrim(p_search));
  end if;

  return query
    select jsonb_build_object(
      'id', f.id,
      'question', f.question,
      'category', f.category,
      'status', f.status,
      'audience_roles', f.audience_roles,
      'version', coalesce((
        select max(h.version)
        from public.ai_kb_history h
        where h.kind = 'faq' and h.kb_id = f.id
      ), 1),
      'updated_at', f.updated_at
    )
    from public.ai_faq f
    where (p_status is null or f.status = p_status)
      and (v_search is null or position(v_search in lower(f.question)) > 0)
    order by f.updated_at desc
    limit p_limit
    offset p_offset;
end;
$$;
comment on function public.admin_list_faqs(text, text, int, int) is 'Admin-only: FAQ list with optional status filter and case-insensitive literal substring search over question (position, no LIKE wildcards). version is max(ai_kb_history) for kind=faq, or 1 when no history exists. Newest-updated first. Limit 1..100, offset >= 0.';
revoke execute on function public.admin_list_faqs(text, text, int, int) from public, anon;
grant execute on function public.admin_list_faqs(text, text, int, int) to authenticated;

-- Satu artikel KB: seluruh baris + owner_name. Null bila tidak ada
-- (bukan exception).
create or replace function public.admin_get_kb_article(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'only an admin can view a knowledge base article';
  end if;
  select to_jsonb(k) || jsonb_build_object('owner_name', p.name)
    into v_result
  from public.ai_knowledge_base k
  left join public.profiles p on p.id = k.owner_id
  where k.id = p_id;
  return v_result;
end;
$$;
comment on function public.admin_get_kb_article(uuid) is 'Admin-only: one KB article row + owner_name. Returns null (not an exception) when the id does not exist.';
revoke execute on function public.admin_get_kb_article(uuid) from public, anon;
grant execute on function public.admin_get_kb_article(uuid) to authenticated;

-- Satu FAQ: seluruh baris. Null bila tidak ada (bukan exception).
create or replace function public.admin_get_faq(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'only an admin can view an FAQ';
  end if;
  select to_jsonb(f)
    into v_result
  from public.ai_faq f
  where f.id = p_id;
  return v_result;
end;
$$;
comment on function public.admin_get_faq(uuid) is 'Admin-only: one FAQ row. Returns null (not an exception) when the id does not exist.';
revoke execute on function public.admin_get_faq(uuid) from public, anon;
grant execute on function public.admin_get_faq(uuid) to authenticated;

-- Simpan artikel KB (insert bila p_id null, update bila ada). Insert:
-- version 1, owner_id = pemanggil, published_at = now() bila published.
-- Update: version + 1, published_at = now() hanya bila transisi ke
-- published dari status lain. Setiap simpan menulis satu baris history
-- kind=article berisi snapshot baris BARU, dan log_audit
-- sinebot_kb_created / sinebot_kb_updated. Judul duplikat -> exception
-- 'judul sudah digunakan'.
-- CATATAN: p_title/p_category/p_content/p_audience_roles ikut diberi
-- DEFAULT NULL karena PostgreSQL mengharuskan parameter ber-default
-- berada di posisi trailing (p_id sudah ber-default NULL); validasi
-- non-empty di bawah tetap menolak pemanggilan tanpa nilai tersebut.
create or replace function public.admin_save_kb_article(
  p_id uuid default null,
  p_title text default null,
  p_category text default null,
  p_content text default null,
  p_audience_roles text[] default null,
  p_status text default 'draft'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_category text := nullif(btrim(coalesce(p_category, '')), '');
  v_content text := nullif(btrim(coalesce(p_content, '')), '');
  v_old public.ai_knowledge_base;
  v_id uuid;
  v_version int;
  v_published_at timestamptz;
  v_action text;
begin
  if not public.is_admin() then
    raise exception 'only an admin can save a knowledge base article';
  end if;
  if v_title is null then
    raise exception 'title must not be empty';
  end if;
  if length(v_title) > 200 then
    raise exception 'title must not exceed 200 characters';
  end if;
  if v_content is null then
    raise exception 'content must not be empty';
  end if;
  if v_category is null then
    raise exception 'category must not be empty';
  end if;
  if length(v_category) > 50 then
    raise exception 'category must not exceed 50 characters';
  end if;
  if p_audience_roles is null or cardinality(p_audience_roles) = 0 then
    raise exception 'audience_roles must not be empty';
  end if;
  if not (p_audience_roles <@ array['guest', 'siswa', 'mentor', 'admin']) then
    raise exception 'audience_roles must only contain guest, siswa, mentor, or admin';
  end if;
  if p_status is null or p_status not in ('draft', 'published', 'archived') then
    raise exception 'status must be draft, published, or archived';
  end if;

  if p_id is null then
    v_action := 'sinebot_kb_created';
    begin
      insert into public.ai_knowledge_base (title, category, content, audience_roles, status, owner_id, published_at)
      values (
        v_title, v_category, v_content, p_audience_roles, p_status, auth.uid(),
        case when p_status = 'published' then now() else null end
      )
      returning id, version, published_at into v_id, v_version, v_published_at;
    exception when unique_violation then
      raise exception 'judul sudah digunakan';
    end;
  else
    select * into v_old
    from public.ai_knowledge_base
    where id = p_id
    for update;
    if not found then
      raise exception 'kb article not found';
    end if;
    v_action := 'sinebot_kb_updated';
    v_version := v_old.version + 1;
    v_published_at := case
      when p_status = 'published' and v_old.status <> 'published' then now()
      else v_old.published_at
    end;
    begin
      update public.ai_knowledge_base
      set title = v_title,
          category = v_category,
          content = v_content,
          audience_roles = p_audience_roles,
          status = p_status,
          version = v_version,
          published_at = v_published_at,
          updated_at = now()
      where id = p_id
      returning id into v_id;
    exception when unique_violation then
      raise exception 'judul sudah digunakan';
    end;
  end if;

  insert into public.ai_kb_history (kind, kb_id, version, title, content, category, audience_roles, status, changed_by)
  values ('article', v_id, v_version, v_title, v_content, v_category, p_audience_roles, p_status, auth.uid());

  perform public.log_audit(
    v_action,
    'ai_knowledge_base',
    v_id,
    jsonb_build_object('title', v_title, 'version', v_version, 'status', p_status)
  );

  return v_id;
end;
$$;
comment on function public.admin_save_kb_article(uuid, text, text, text, text[], text) is 'Admin-only: insert/update a KB article (version +1 on update, published_at stamped only on transition to published). Writes one ai_kb_history snapshot (kind=article) of the NEW row and logs sinebot_kb_created/sinebot_kb_updated. Duplicate title raises judul sudah digunakan. Returns the article id.';
revoke execute on function public.admin_save_kb_article(uuid, text, text, text, text[], text) from public, anon;
grant execute on function public.admin_save_kb_article(uuid, text, text, text, text[], text) to authenticated;

-- Simpan FAQ: pola sama dengan artikel. Versi FAQ hidup hanya di
-- ai_kb_history: insert = 1, update = max(version history) + 1 (atau 1
-- bila FAQ lama belum punya history). History kind=faq menyimpan
-- title=question, content=answer. Pertanyaan duplikat -> exception
-- 'pertanyaan sudah ada'. CATATAN DEFAULT NULL sama seperti
-- admin_save_kb_article (parameter ber-default harus trailing).
create or replace function public.admin_save_faq(
  p_id uuid default null,
  p_question text default null,
  p_answer text default null,
  p_category text default null,
  p_audience_roles text[] default null,
  p_status text default 'draft'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question text := nullif(btrim(coalesce(p_question, '')), '');
  v_answer text := nullif(btrim(coalesce(p_answer, '')), '');
  v_category text := nullif(btrim(coalesce(p_category, '')), '');
  v_old public.ai_faq;
  v_id uuid;
  v_version int;
  v_action text;
begin
  if not public.is_admin() then
    raise exception 'only an admin can save an FAQ';
  end if;
  if v_question is null then
    raise exception 'question must not be empty';
  end if;
  if length(v_question) > 200 then
    raise exception 'question must not exceed 200 characters';
  end if;
  if v_answer is null then
    raise exception 'answer must not be empty';
  end if;
  if v_category is null then
    raise exception 'category must not be empty';
  end if;
  if length(v_category) > 50 then
    raise exception 'category must not exceed 50 characters';
  end if;
  if p_audience_roles is null or cardinality(p_audience_roles) = 0 then
    raise exception 'audience_roles must not be empty';
  end if;
  if not (p_audience_roles <@ array['guest', 'siswa', 'mentor', 'admin']) then
    raise exception 'audience_roles must only contain guest, siswa, mentor, or admin';
  end if;
  if p_status is null or p_status not in ('draft', 'published', 'archived') then
    raise exception 'status must be draft, published, or archived';
  end if;

  if p_id is null then
    v_action := 'sinebot_kb_created';
    v_version := 1;
    begin
      insert into public.ai_faq (question, answer, category, audience_roles, status)
      values (v_question, v_answer, v_category, p_audience_roles, p_status)
      returning id into v_id;
    exception when unique_violation then
      raise exception 'pertanyaan sudah ada';
    end;
  else
    select * into v_old
    from public.ai_faq
    where id = p_id
    for update;
    if not found then
      raise exception 'faq not found';
    end if;
    v_action := 'sinebot_kb_updated';
    v_version := coalesce((
      select max(version)
      from public.ai_kb_history
      where kind = 'faq' and kb_id = p_id
    ), 0) + 1;
    begin
      update public.ai_faq
      set question = v_question,
          answer = v_answer,
          category = v_category,
          audience_roles = p_audience_roles,
          status = p_status,
          updated_at = now()
      where id = p_id
      returning id into v_id;
    exception when unique_violation then
      raise exception 'pertanyaan sudah ada';
    end;
  end if;

  insert into public.ai_kb_history (kind, kb_id, version, title, content, category, audience_roles, status, changed_by)
  values ('faq', v_id, v_version, v_question, v_answer, v_category, p_audience_roles, p_status, auth.uid());

  perform public.log_audit(
    v_action,
    'ai_faq',
    v_id,
    jsonb_build_object('question', v_question, 'version', v_version, 'status', p_status)
  );

  return v_id;
end;
$$;
comment on function public.admin_save_faq(uuid, text, text, text, text[], text) is 'Admin-only: insert/update an FAQ (version lives only in ai_kb_history: 1 on insert, max+1 on update). Writes one ai_kb_history snapshot (kind=faq, title=question, content=answer) and logs sinebot_kb_created/sinebot_kb_updated. Duplicate question raises pertanyaan sudah ada. Returns the FAQ id.';
revoke execute on function public.admin_save_faq(uuid, text, text, text, text[], text) from public, anon;
grant execute on function public.admin_save_faq(uuid, text, text, text, text[], text) to authenticated;

-- Ubah status saja (artikel atau FAQ): version TIDAK naik; published_at
-- di artikel di-stempel hanya bila transisi ke published. Menulis satu
-- baris history dengan status baru + log_audit sinebot_kb_status_changed.
-- Mengembalikan true bila baris ada, false bila tidak ada (bukan exception).
create or replace function public.admin_set_kb_status(
  p_kind text,
  p_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_article public.ai_knowledge_base;
  v_faq public.ai_faq;
  v_version int;
  v_published_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'only an admin can change a knowledge base status';
  end if;
  if p_kind is null or p_kind not in ('article', 'faq') then
    raise exception 'kind must be article or faq';
  end if;
  if p_status is null or p_status not in ('draft', 'published', 'archived') then
    raise exception 'status must be draft, published, or archived';
  end if;

  if p_kind = 'article' then
    select * into v_article
    from public.ai_knowledge_base
    where id = p_id
    for update;
    if not found then
      return false;
    end if;
    v_published_at := case
      when p_status = 'published' and v_article.status <> 'published' then now()
      else v_article.published_at
    end;
    update public.ai_knowledge_base
    set status = p_status,
        published_at = v_published_at,
        updated_at = now()
    where id = p_id;
    insert into public.ai_kb_history (kind, kb_id, version, title, content, category, audience_roles, status, changed_by)
    values ('article', p_id, v_article.version, v_article.title, v_article.content, v_article.category, v_article.audience_roles, p_status, auth.uid());
    perform public.log_audit(
      'sinebot_kb_status_changed',
      'ai_knowledge_base',
      p_id,
      jsonb_build_object('status', p_status, 'version', v_article.version)
    );
    return true;
  else
    select * into v_faq
    from public.ai_faq
    where id = p_id
    for update;
    if not found then
      return false;
    end if;
    update public.ai_faq
    set status = p_status,
        updated_at = now()
    where id = p_id;
    v_version := coalesce((
      select max(version)
      from public.ai_kb_history
      where kind = 'faq' and kb_id = p_id
    ), 1);
    insert into public.ai_kb_history (kind, kb_id, version, title, content, category, audience_roles, status, changed_by)
    values ('faq', p_id, v_version, v_faq.question, v_faq.answer, v_faq.category, v_faq.audience_roles, p_status, auth.uid());
    perform public.log_audit(
      'sinebot_kb_status_changed',
      'ai_faq',
      p_id,
      jsonb_build_object('status', p_status, 'version', v_version)
    );
    return true;
  end if;
end;
$$;
comment on function public.admin_set_kb_status(text, uuid, text) is 'Admin-only: status-only change for an article or FAQ (version does NOT increase; article published_at stamped only on transition to published). Writes one ai_kb_history row with the new status and logs sinebot_kb_status_changed. Returns true when the row exists, false when it does not.';
revoke execute on function public.admin_set_kb_status(text, uuid, text) from public, anon;
grant execute on function public.admin_set_kb_status(text, uuid, text) to authenticated;

-- Riwayat versi satu artikel/FAQ, version terbaru dulu.
create or replace function public.admin_list_kb_history(
  p_kind text,
  p_id uuid,
  p_limit int default 20
)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'only an admin can view knowledge base history';
  end if;
  if p_kind is null or p_kind not in ('article', 'faq') then
    raise exception 'kind must be article or faq';
  end if;
  if p_limit is null then
    p_limit := 20;
  end if;
  if p_limit < 1 or p_limit > 100 then
    raise exception 'limit must be between 1 and 100';
  end if;

  return query
    select jsonb_build_object(
      'version', h.version,
      'title', h.title,
      'content', h.content,
      'category', h.category,
      'audience_roles', h.audience_roles,
      'status', h.status,
      'changed_by', h.changed_by,
      'changed_by_name', coalesce(p.name, '—'),
      'changed_at', h.changed_at
    )
    from public.ai_kb_history h
    left join public.profiles p on p.id = h.changed_by
    where h.kind = p_kind and h.kb_id = p_id
    order by h.version desc, h.changed_at desc
    limit p_limit;
end;
$$;
comment on function public.admin_list_kb_history(text, uuid, int) is 'Admin-only: version history of one KB article or FAQ (newest version first), with changed_by_name from profiles.name. Limit 1..100, default 20.';
revoke execute on function public.admin_list_kb_history(text, uuid, int) from public, anon;
grant execute on function public.admin_list_kb_history(text, uuid, int) to authenticated;

-- ============================================================================
-- Done. Verifikasi SETELAH parent menerapkan (lihat laporan worker 054
-- untuk skrip uji lengkap):
--   * Table Editor menunjukkan ai_settings (11 baris seed) + ai_kb_history.
--   * Spot-check RLS: anon/authenticated non-admin SELECT ai_settings /
--     ai_kb_history gagal; admin SELECT berhasil; INSERT langsung sebagai
--     authenticated gagal (tanpa policy tulis).
--   * Spot-check RPC: admin_get_settings mengembalikan 11 kunci;
--     admin_set_setting menolak kunci tak dikenal + nilai di luar rentang,
--     dan menulis audit_log sinebot_settings_changed; non-admin memanggil
--     RPC apa pun di file ini ditolak 'only an admin can ...'.
--   * Spot-check overview/timeseries/quality/audit_log dengan data nyata.
--   * Spot-check KB: save artikel baru (version 1) -> update (version 2)
--     -> history 2 baris; save FAQ -> version tampil 1; set status ->
--     version tetap, history bertambah; judul/pertanyaan duplikat ditolak;
--     get id tak dikenal mengembalikan null.
--   * TIDAK ADA artikel/FAQ uji yang di-insert migrasi ini.
-- ============================================================================
