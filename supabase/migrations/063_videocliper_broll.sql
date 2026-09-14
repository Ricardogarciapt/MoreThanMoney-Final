-- 063 — B-roll nos clips do videocliper: [{inicio, fim, descricao}] em segundos relativos ao clipe.
alter table public.videocliper_clips add column if not exists broll jsonb not null default '[]'::jsonb;
