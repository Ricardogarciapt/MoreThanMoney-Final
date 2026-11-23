-- Estado do Short do YouTube de cada reel (23/11/2026, Ricardo: ver o Short ao lado do reel em /admin/social).
-- Preenche-se no cron ig-publish logo a seguir ao REELS sair no Instagram (lib/youtube/shorts-reel.ts).
-- Tudo nulo = o reel ainda não tentou o YouTube (ou o interruptor YOUTUBE_SHORTS_REELS=0 estava desligado).
alter table social_scheduled_posts add column if not exists youtube_short_id text;
alter table social_scheduled_posts add column if not exists youtube_short_url text;
alter table social_scheduled_posts add column if not exists youtube_erro text;
