-- SINEVERSE migration 077 — Notification Center Fase 2: perbaiki typo migrasi 076.
--
-- Saat migrasi 076 diterapkan lewat SQL Editor, satu baris tersalin salah:
-- insert penilaian memakai `v_answers` (bukan `p_answers`). `v_answers`
-- tidak dideklarasikan di fungsi, jadi submit_exam_attempt() akan GAGAL
-- saat runtime pada ujian yang punya soal (cabang v_total = 0 tidak
-- terpengaruh — di sana sudah benar `p_answers`). Tipe return 4 kolom
-- dari 076 sudah benar dan tidak disentuh.
--
-- Perbaikan ini TIDAK mengetik ulang badan fungsi (risiko salah salin
-- lagi): baca definisi tersimpan, ganti satu kata itu, eksekusi ulang
-- definisinya. CREATE OR REPLACE dengan tanda tangan sama diizinkan,
-- jadi tidak perlu DROP. Setelah apply, verifikasi:
--   select pg_get_functiondef(oid) from pg_proc
--   where proname = 'submit_exam_attempt';
--   -- badan harus memuat `p_answers` dan TIDAK lagi memuat `v_answers`;
--   -- return tetap TABLE(score integer, passed boolean,
--   -- certificate_serial text, already_issued boolean).

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(oid) into v_def
  from pg_proc
  where proname = 'submit_exam_attempt';
  if v_def is null then
    raise exception 'submit_exam_attempt tidak ditemukan';
  end if;
  if position('v_answers' in v_def) = 0 then
    raise exception 'typo v_answers sudah tidak ada — tidak ada yang diperbaiki';
  end if;
  v_def := replace(v_def, 'v_answers', 'p_answers');
  execute v_def;
end $$;
