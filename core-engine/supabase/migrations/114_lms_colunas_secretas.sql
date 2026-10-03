-- 114 · LMS: as colunas de reprodução e as chaves deixam de ser legíveis pela chave pública
--
-- NÃO APLICADA. Escrita no ramo `fechar-fugas-premium` para o dono aplicar.
--
-- Porquê: o cadeado das salas Premium/VIP passou a ser do SERVIDOR (/api/live-sessions/streams só
-- devolve playback_url / HLS a quem tem acesso ao nível da sala). Mas a RLS de `lms_streams` é
-- `using (true)` e `anon`/`authenticated` têm SELECT na tabela inteira — qualquer pessoa com a chave
-- anon (está no bundle do site) lia directamente pela REST:
--
--   • lms_streams.stream_key / rtmps_url / youtube_key  → a chave de INGESTÃO (transmitir por cima
--     da aula) e o endereço HLS de qualquer sala, Premium ou VIP;
--   • lms_educators.password_hash, email, stream_key_fixed, youtube_stream_key, restream_stream_key,
--     tiktok_stream_key, restream_ingest_url → credenciais dos educadores.
--
-- Verificado a 2026-09-18 (só leitura): nenhum componente de browser, nem as apps iOS/Android, nem o
-- MTM Auto lê estas tabelas com a chave pública — tudo passa pelas rotas do site com a chave de
-- serviço, que não é afectada por isto. `lms_streams` não está na publicação realtime.
--
-- Como: o GRANT ao nível da tabela cobre todas as colunas, por isso revogar coluna a coluna não
-- chega. Revoga-se o SELECT da tabela e volta a dar-se SELECT só nas colunas de montra.

begin;

-- ── lms_streams ────────────────────────────────────────────────────────────────────────────
revoke select on table public.lms_streams from anon, authenticated;
grant select (
  id, academy_id, educator_id, title, description, thumbnail_url, chat_enabled, is_live,
  live_started_at, live_ended_at, created_at, updated_at, youtube_enabled, category,
  scheduled_start_at, viewer_count, playback_mode, ingest_provider, access_tier, square_image_url,
  playlist_access_tier, playlist_title, captions_enabled, caption_source_language, nunca_ao_vivo,
  dvr_playlist_title, operador_educator_id, gravacao_iniciada_em, gravacao_titulo
) on public.lms_streams to anon, authenticated;
-- Ficam de fora: stream_key, rtmps_url, playback_url, youtube_key, restream_embed_url,
-- playlist_url, dvr_playlist_url, chave_sistema.

-- ── lms_educators ──────────────────────────────────────────────────────────────────────────
revoke select on table public.lms_educators from anon, authenticated;
grant select (
  id, display_name, bio, avatar_url, academy_id, is_active, created_at, updated_at, specialty,
  youtube_enabled, restream_enabled, language, tiktok_enabled
) on public.lms_educators to anon, authenticated;
-- Ficam de fora: email, password_hash, stream_key_fixed, youtube_stream_key, restream_ingest_url,
-- restream_stream_key, restream_embed_url, tiktok_stream_key, tiktok_server, profile_id,
-- fish_voice_id, studio_layout.

commit;

-- Verificação (deve devolver 0 linhas depois de aplicar):
--   select grantee, table_name, column_name from information_schema.column_privileges
--   where table_name in ('lms_streams','lms_educators') and grantee in ('anon','authenticated')
--     and privilege_type = 'SELECT'
--     and column_name in ('stream_key','rtmps_url','playback_url','youtube_key','password_hash',
--       'email','stream_key_fixed','youtube_stream_key','restream_stream_key','tiktok_stream_key');
