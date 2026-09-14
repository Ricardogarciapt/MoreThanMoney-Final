-- 065 — MTM Funded: webhook do TradingView por conta simulada (M4).
--
-- Um alerta do TradingView (estratégia ou manual) chega a
--   /api/mtmfunded/simulado/webhook/<token>
-- e executa na conta pelas MESMAS funções do WebTrader (lib/mtmfunded/simulado/execucao).
--
-- O token é a password do webhook: mostra-se UMA vez e guarda-se só o sha256. Quem lê a tabela
-- (admin, backup, fuga) não consegue negociar na conta de ninguém.
--
-- Os campos de janela guardam o travão (30 pedidos/min) e a deduplicação (mesmo corpo em 5 s) na
-- própria linha: as funções serverless não partilham memória, e um travão em memória deixava
-- passar tudo o que caísse noutra instância.

create table if not exists public.funded_webhooks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.mtm_trading_accounts(id) on delete cascade,
  token_hash text not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  ultimo_em timestamptz,
  ultimo_erro text,
  ultimo_resultado jsonb,
  ultimo_hash text,
  janela_inicio timestamptz,
  janela_contagem int not null default 0
);
create index if not exists funded_webhooks_conta_idx on public.funded_webhooks (account_id);

-- Só o servidor (service role). Nem o dono lê o hash — o painel pergunta à API.
alter table public.funded_webhooks enable row level security;
revoke all on public.funded_webhooks from anon, authenticated;
