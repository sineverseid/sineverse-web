-- SINEVERSE migration 013 — Academy Stage 1: mode akses course.
--
-- access_mode menentukan apakah semua section course bisa dibuka langsung
-- ('direct', bawaan) atau Section 2 baru terbuka setelah seluruh lesson
-- Section 1 selesai ('sequential'). Dipakai LessonDetailPage (kunci
-- Section 2) dan CourseBuilderPage (pilihan mentor/admin).
-- Idempotent: aman dijalankan berulang di SQL Editor.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'courses'
      AND column_name = 'access_mode'
  ) THEN
    ALTER TABLE public.courses
      ADD COLUMN access_mode text NOT NULL DEFAULT 'direct'
      CHECK (access_mode IN ('direct', 'sequential'));
  END IF;
END $$;
