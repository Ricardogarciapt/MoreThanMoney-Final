-- 058 — Permitir o tier "free" (público /FreeSession) nas constraints de acesso do LMS.
-- Sem isto, escolher "Gratuito — público" no studio/admin era rejeitado pela BD e ficava "all".
alter table public.lms_streams drop constraint if exists lms_streams_access_tier_check;
alter table public.lms_streams add constraint lms_streams_access_tier_check
  check (access_tier = any (array['free','all','app_member','premium','vip']::text[]));

alter table public.lms_streams drop constraint if exists lms_streams_playlist_access_tier_check;
alter table public.lms_streams add constraint lms_streams_playlist_access_tier_check
  check (playlist_access_tier is null or playlist_access_tier = any (array['free','all','app_member','premium','vip']::text[]));

alter table public.lms_stream_schedules drop constraint if exists lms_stream_schedules_access_tier_check;
alter table public.lms_stream_schedules add constraint lms_stream_schedules_access_tier_check
  check (access_tier is null or access_tier = any (array['free','all','app_member','premium','vip']::text[]));
