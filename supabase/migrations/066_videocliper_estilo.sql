-- 066 — Estilo visual dos clipes do videocliper + palavras-chave (ênfase) por clipe.
--
-- videocliper_jobs.estilo   : preset de lib/videocliper/estilos.ts ('ricardogarciapt' | 'morethanmoney').
-- videocliper_clips.estilo  : sobreposição opcional por clipe (null = usa o do vídeo).
-- videocliper_clips.enfase  : [{palavra, emoji?}] — até 3 palavras-chave que a legenda destaca
--                             (cor de acento, maiores, sozinhas no ecrã) e onde cai o punch-in.
alter table public.videocliper_jobs add column if not exists estilo text not null default 'ricardogarciapt';
alter table public.videocliper_clips add column if not exists estilo text;
alter table public.videocliper_clips add column if not exists enfase jsonb not null default '[]'::jsonb;
