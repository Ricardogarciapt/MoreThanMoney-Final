-- 233 · Limpeza do Storage (5/11/2026, pedido do Ricardo: storage a 1,13 GB do plano de 1 GB).
--
-- Devolve os ficheiros que podem sair do Storage. Quem apaga é o cron
-- /api/cron/limpeza-storage, pela API do Storage (o Supabase proíbe DELETE directo em
-- storage.objects, e com razão: deixava o ficheiro órfão no disco).
--
-- Três regras, e nada mais:
--   tts_live      · mp3 da dobragem das lives (bucket lms-tts) com mais de p_dias. Só servem
--                   durante a live; as repetições estão no YouTube. A cache da voz
--                   (voz-cache/) fica sempre: regenera-se sozinha mas custa dinheiro.
--   publicado_ig  · média de posts já publicados no Instagram há mais de p_dias_publicado e
--                   que nada mais usa. O Instagram guarda a sua cópia.
--   solto         · uploads / chat-images com mais de p_dias que nenhuma tabela referencia.
--
-- «Referenciado» = o caminho aparece num URL do Storage nalguma coluna que guarda URLs
-- (levantamento de 5/11 sobre todas as colunas text/json do schema public). lms-assets
-- (capas, educadores, salas) e mtmauto-marca nunca entram.

create or replace function public.limpeza_storage_candidatos(
  p_dias int default 60,
  p_dias_publicado int default 7,
  p_limite int default 1000
) returns table(bucket text, path text, motivo text, bytes bigint)
language sql
stable
security definer
set search_path = public, storage
as $$
  with src(t) as (
    select media_urls::text from social_scheduled_posts where status <> 'published'
    union all select image_url from chat_messages where image_url is not null
    union all select media_url from posts
    union all select media_urls::text from posts
    union all select video_url from reels_auto
    union all select capa_url from reels_auto
    union all select imagem_url from marketplace_produtos
    union all select thumbnail_url from lms_streams
    union all select square_image_url from lms_streams
    union all select thumbnail_url from videocliper_clips
    union all select video_url from videocliper_clips
    union all select cover_url from lms_academies
    union all select avatar_url from lms_educators
    union all select studio_layout::text from lms_educators
    union all select image_url from social_posts
    union all select urls::text from estudio_pecas
    union all select params::text from estudio_pecas
    union all select urls::text from mtm_social_pecas
    union all select value::text from site_settings
    union all select logo_url from mtmauto_tenants
    union all select logo_quadrado_url from mtmauto_tenants
    union all select image_url from lms_educator_playlists
  ),
  refs as (
    select distinct m[1] as b, replace(m[2], '%20', ' ') as p
    from src, regexp_matches(t, 'storage/v1/object/(?:public|sign|authenticated)/([a-z0-9_-]+)/([^"?\s,\\{}()]+)', 'g') m
  ),
  publicados as (
    select distinct m[1] as b, replace(m[2], '%20', ' ') as p
    from social_scheduled_posts s,
         regexp_matches(s.media_urls::text, 'storage/v1/object/public/([a-z0-9_-]+)/([^"?\s,\\{}()]+)', 'g') m
    where s.status = 'published'
      and coalesce(s.updated_at, s.created_at) < now() - make_interval(days => p_dias_publicado)
  ),
  cand as (
    select o.bucket_id::text as bucket, o.name::text as path,
           coalesce((o.metadata->>'size')::bigint, 0) as bytes,
           case
             when o.bucket_id = 'lms-tts' and o.name not like 'voz-cache/%'
                  and o.created_at < now() - make_interval(days => p_dias) then 'tts_live'
             when o.bucket_id = 'uploads' and r.p is null and pu.p is not null then 'publicado_ig'
             when o.bucket_id in ('uploads', 'chat-images') and r.p is null
                  and o.created_at < now() - make_interval(days => p_dias) then 'solto'
           end as motivo
    from storage.objects o
    left join refs r on r.b = o.bucket_id and r.p = o.name
    left join publicados pu on pu.b = o.bucket_id and pu.p = o.name
  )
  select bucket, path, motivo, bytes from cand
  where motivo is not null
  order by bytes desc
  limit greatest(p_limite, 1);
$$;

revoke all on function public.limpeza_storage_candidatos(int, int, int) from public, anon, authenticated;
grant execute on function public.limpeza_storage_candidatos(int, int, int) to service_role;
