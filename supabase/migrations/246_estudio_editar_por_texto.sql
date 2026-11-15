-- Estúdio · editar pelo texto (10/11/2026, ideias do OpenCut-AI, MIT).
-- O Mac transcreve cada take (faster-whisper, palavras com tempos); no /estudio o Ricardo risca
-- palavras, bengalas e pausas, e o editor corta essas zonas. `estilo` guarda legenda e música.
alter table public.estudio_gravacoes add column if not exists transcricao jsonb;
alter table public.estudio_gravacoes add column if not exists transcricao_estado text
  check (transcricao_estado is null or transcricao_estado in ('a_transcrever', 'pronta', 'falhou'));
alter table public.estudio_gravacoes add column if not exists transcricao_reclamada_em timestamptz;
alter table public.estudio_gravacoes add column if not exists cortes jsonb;
alter table public.estudio_gravacoes add column if not exists estilo jsonb;
