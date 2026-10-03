-- 125 — GESTÃO AUTOMÁTICA DAS POSIÇÕES DE CORRETORA NO WEBTRADER
--
-- PORQUÊ: o Auto BE e o Auto Trailing só funcionavam nas contas MTM Funded, porque a gestão dessas
-- posições vive em colunas de `funded_positions` e o motor do VPS lê-as a cada preço. Nas contas de
-- corretora (TradeLocker/MT5) os mesmos botões só escreviam no localStorage do browser
-- (`webtrader_gestao_auto_real:<ref>`): ninguém do outro lado lia nada, por isso NADA acontecia.
-- Uma posição da TradeLocker com «Auto BE» ligado ficava exactamente como estava.
--
-- Esta tabela é o «funded_positions» das contas de corretora, só para a gestão: guarda a
-- configuração EXPLÍCITA do dono por posição, e é a única coisa que autoriza o servidor a mexer num
-- SL de dinheiro real. Sem linha aqui, ninguém toca na posição.
--
-- Fica com a chave de serviço (RLS a negar tudo): quem escreve é a rota /api/webtrader/…/gestao-auto
-- depois de verificar o dono da conta, e quem lê é o executor. Nunca o browser directamente — uma
-- linha forjada por um cliente seria uma ordem de mover um SL real.

create table if not exists public.webtrader_gestao_auto (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- A referência da conta tal como viaja no WebTrader: «tradelocker:site:<uuid>», «mt5:auto:<uuid>»…
  conta_ref text not null,
  plataforma text not null check (plataforma in ('tradelocker', 'mt5', 'mtmfunded')),
  -- O id da posição NA CORRETORA (é o que o adaptador devolve e o que a modificação usa).
  position_id text not null,
  symbol text not null,
  direcao text not null check (direcao in ('buy', 'sell')),
  -- Casas decimais com que os níveis foram calculados (o arredondamento tem de ser o mesmo depois).
  digits smallint not null default 5,

  -- A gestão, em PREÇO (a mesma convenção do motor simulado: ver lib/mtmfunded/simulado/avancadas.ts).
  trailing_distancia numeric,
  trailing_ativacao numeric,
  be_gatilho numeric,
  be_offset numeric not null default 0,
  -- O break-even acontece UMA vez: sem isto, cada passagem voltava a puxar o SL para a entrada
  -- depois de o trailing já o ter levado mais longe.
  be_feito boolean not null default false,

  -- Diagnóstico honesto para o ecrã: o que o executor fez e o que falhou.
  sl_aplicado numeric,
  ultimo_motivo text,
  ultima_passagem timestamptz,
  ultimo_erro text,
  -- Contas TradeLocker abertas por sessão do separador não têm credenciais no servidor: só são
  -- geridas com o WebTrader aberto. A coluna existe para o ecrã poder DIZER isso ao trader.
  so_com_separador boolean not null default false,
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uma posição tem uma configuração e só uma.
create unique index if not exists webtrader_gestao_auto_posicao
  on public.webtrader_gestao_auto (conta_ref, position_id);
-- O executor varre por conta; o cron varre as activas.
create index if not exists webtrader_gestao_auto_conta on public.webtrader_gestao_auto (conta_ref) where ativa;
create index if not exists webtrader_gestao_auto_ativas on public.webtrader_gestao_auto (ativa, updated_at) where ativa;

alter table public.webtrader_gestao_auto enable row level security;
-- Sem políticas de propósito: nem anon nem authenticated chegam aqui. Só a chave de serviço.
revoke all on public.webtrader_gestao_auto from anon, authenticated;
