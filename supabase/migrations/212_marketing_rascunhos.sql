-- 212 — RASCUNHOS DO MARKETING (kits de lançamento e campanhas Meta propostos pela IA)
--
-- O assistente de marketing pode PROPOR, nunca fazer: um kit de lançamento (formulário +
-- automação do Instagram + funil + etiquetas do pipeline) ou uma campanha Meta. A proposta fica
-- aqui como rascunho; o dono lê-a em Gestão → Marketing → Rascunhos e carrega em «Aplicar».
-- Aplicar cria as peças desligadas/em pausa — ligar continua a ser um segundo gesto.

create table if not exists public.marketing_rascunhos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('lancamento', 'campanha_meta')),
  titulo text not null,
  conteudo jsonb not null,
  estado text not null default 'rascunho' check (estado in ('rascunho', 'aplicado', 'descartado', 'falhou')),
  resultado jsonb,
  origem text,
  criado_em timestamptz not null default now(),
  decidido_em timestamptz,
  decidido_por uuid
);

create index if not exists marketing_rascunhos_estado_idx on public.marketing_rascunhos (estado, criado_em desc);

-- Só o servidor (service role) lê e escreve: as rotas da Gestão guardam o acesso.
alter table public.marketing_rascunhos enable row level security;

comment on table public.marketing_rascunhos is 'Propostas do assistente de marketing (kits de lançamento, campanhas Meta) à espera do dono. Aplicar cria tudo desligado/em pausa.';
