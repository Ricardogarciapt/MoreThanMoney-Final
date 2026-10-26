-- Reels diários dos educadores (lib/reels-educadores): o que se desenhou, para quando, e a nota
-- que o Instagram lhe deu — é esta tabela a memória que faz os roteiros evoluírem.
create table if not exists public.reels_auto (
  id uuid primary key default gen_random_uuid(),
  dia date not null,
  slot smallint not null,
  tipo text not null check (tipo in ('animado','corte')),
  educador text not null,
  tema text,
  gancho text,
  roteiro jsonb,
  estado text not null default 'roteiro' check (estado in ('roteiro','a_render','agendado','rascunho','erro')),
  video_url text,
  capa_url text,
  post_id uuid,
  clip_id uuid,
  metricas jsonb,
  nota numeric,
  metricas_em timestamptz,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dia, slot)
);
create index if not exists reels_auto_educador_idx on public.reels_auto (educador, created_at desc);
alter table public.reels_auto enable row level security;

-- Os vídeos que o robô pediu ao videocliper sabem de que educador são.
alter table public.videocliper_jobs add column if not exists reels_educador text;
