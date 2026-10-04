-- 175 — O LIVRO DA IA: uma linha por chamada a um modelo.
--
-- ═══ PORQUÊ ══════════════════════════════════════════════════════════════════════════════════
-- 04/10: o dono descobriu que a conta Anthropic estava sem crédito pelo 400 cru no Terminal MTM.
-- Não havia sítio nenhum onde ver «quanto estou a gastar» nem «quem está a falhar». A partir de
-- agora toda a IA do site passa por lib/ia/chamar.ts, e cada chamada deixa aqui uma linha —
-- com sucesso ou sem ele.
--
-- Escreve só a service role (lib/ia/livro.ts). RLS ligado sem políticas: ninguém lê pelo anon.
-- O livro nunca impede uma resposta: se este insert falhar, a IA responde na mesma.

create table if not exists public.ia_chamadas (
  id             bigint generated always as identity primary key,
  criado_em      timestamptz not null default now(),
  tarefa         text not null,                 -- 'mtm-terminal', 'mentor', 'mtmsocial', …
  fornecedor     text,                          -- quem respondeu; null se todos falharam
  modelo         text,
  em_reserva     boolean not null default false, -- true = não foi o 1.º da cadeia a responder
  tentativas     jsonb not null default '[]'::jsonb, -- [{fornecedor, erro}] dos que falharam antes
  saltados       jsonb not null default '[]'::jsonb, -- sem chave / sem visão (não contam como falha)
  tokens_entrada integer,
  tokens_saida   integer,
  custo_cents    numeric(10,4) not null default 0, -- 0 nos grátis; ESTIMADO nos pagos
  duracao_ms     integer not null default 0,
  sucesso        boolean not null default true,
  erro           text                           -- motivo final, quando todos falharam
);

comment on table public.ia_chamadas is
  'Livro da IA do site: uma linha por chamada (lib/ia/chamar.ts). Permite ver custo e quem falha.';

create index if not exists ia_chamadas_criado_em_idx on public.ia_chamadas (criado_em desc);
create index if not exists ia_chamadas_tarefa_idx on public.ia_chamadas (tarefa, criado_em desc);

alter table public.ia_chamadas enable row level security;

-- Leitura rápida para o dono: últimos 30 dias por fornecedor e tarefa.
create or replace view public.ia_chamadas_resumo as
select
  tarefa,
  coalesce(fornecedor, '(falhou)') as fornecedor,
  count(*)                              as chamadas,
  count(*) filter (where em_reserva)    as em_reserva,
  count(*) filter (where not sucesso)   as falhas,
  round(sum(custo_cents)::numeric, 2)   as custo_cents,
  round(avg(duracao_ms))                as duracao_media_ms
from public.ia_chamadas
where criado_em > now() - interval '30 days'
group by tarefa, coalesce(fornecedor, '(falhou)')
order by chamadas desc;

revoke all on public.ia_chamadas from anon, authenticated;
revoke all on public.ia_chamadas_resumo from anon, authenticated;
