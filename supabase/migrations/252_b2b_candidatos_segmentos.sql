-- 252 · Prospeção B2B automática (16/11/2026, ronda B2B do dono)
--
-- 1. Três segmentos novos: negocio_local (só Beacons/Linktree → landing + app), licenca_scanners
--    (empresas de educação em trading → pacote de 4 scanners por semestre) e parceria_redes
--    (colaborações com o @ricardogarciapt). E o país INT (textos em inglês).
-- 2. A fila `b2b_candidatos`: empresa + página pública. O cron /api/cron/b2b-recolha lê a página e
--    passa os emails de empresa para `b2b_prospectos`. Só o service role lê e escreve (RLS sem políticas).

alter table public.b2b_prospectos drop constraint if exists b2b_prospectos_segmento_check;
alter table public.b2b_prospectos add constraint b2b_prospectos_segmento_check
  check (segmento in ('ib_afiliado','comunidade','criador','escola','prop_firm','negocio_local','licenca_scanners','parceria_redes'));
alter table public.b2b_prospectos drop constraint if exists b2b_prospectos_pais_check;
alter table public.b2b_prospectos add constraint b2b_prospectos_pais_check check (pais in ('PT','BR','INT'));

create table if not exists public.b2b_candidatos (
  id uuid primary key default gen_random_uuid(),
  empresa text not null,
  url text not null unique check (url ~* '^https?://'),
  segmento text not null check (segmento in ('ib_afiliado','comunidade','criador','escola','prop_firm','negocio_local','licenca_scanners','parceria_redes')),
  pais text not null default 'PT' check (pais in ('PT','BR','INT')),
  pessoa_colectiva boolean not null default false,
  identificacao text,
  origem text not null default 'agente',
  nota text,
  estado text not null default 'pendente' check (estado in ('pendente','recolhido','sem_email','falhou','descartado')),
  motivo text,
  emails text[],
  tentativas int not null default 0,
  criado_em timestamptz not null default now(),
  tentado_em timestamptz
);
create index if not exists b2b_candidatos_estado_idx on public.b2b_candidatos (estado, criado_em);
alter table public.b2b_candidatos enable row level security;
