-- Legendas ao vivo (closed captions) com tradução para sessões LMS.
-- Fonte: trabalhador no VPS capta o áudio HLS → OpenAI transcreve (idioma de origem)
-- → grava cues aqui + traduz (Claude) para um conjunto fixo + idioma de origem.
-- Clientes (web/iOS/Android) leem por idioma escolhido (cookie mtm_lang).

alter table public.lms_streams
  add column if not exists captions_enabled boolean not null default false,
  add column if not exists caption_source_language text; -- null → usa lms_educators.language

create table if not exists public.lms_stream_captions (
  id            uuid primary key default gen_random_uuid(),
  stream_id     uuid not null references public.lms_streams(id) on delete cascade,
  seq           integer not null,                    -- ordem monotónica por stream
  t_start_ms    integer,                             -- offset desde o início do live (opcional)
  t_end_ms      integer,
  source_language text not null default 'pt',
  source_text   text not null,                       -- transcrição no idioma de origem
  translations  jsonb not null default '{}'::jsonb,  -- { "en": "...", "es": "...", ... }
  is_final      boolean not null default true,       -- false = cue parcial (interim)
  created_at    timestamptz not null default now(),
  unique (stream_id, seq)
);

create index if not exists lms_stream_captions_stream_seq_idx
  on public.lms_stream_captions (stream_id, seq);
create index if not exists lms_stream_captions_stream_created_idx
  on public.lms_stream_captions (stream_id, created_at desc);

alter table public.lms_stream_captions enable row level security;

-- Leitura pública dentro da app (as legendas não são sensíveis; o acesso ao vídeo já é
-- controlado pelo access_tier do stream). Escrita só via service role (ingest do worker).
drop policy if exists lms_stream_captions_read on public.lms_stream_captions;
create policy lms_stream_captions_read
  on public.lms_stream_captions for select
  using (true);

-- Realtime: permite CDC nesta tabela (o web já usa supabase.channel para lms_streams).
alter publication supabase_realtime add table public.lms_stream_captions;
