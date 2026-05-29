alter table if exists public.lms_streams
  add column if not exists youtube_key text,
  add column if not exists youtube_enabled boolean not null default false;

