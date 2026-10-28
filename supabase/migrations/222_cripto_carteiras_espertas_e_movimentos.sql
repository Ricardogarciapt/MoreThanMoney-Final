-- AGENTE CRIPTO: carteiras espertas (seguir quem ganha dinheiro) e movimentos entre carteiras.
--
-- Só endereços PÚBLICOS e números. As chaves das carteiras do agente continuam cifradas na VPS.
-- Só o service role lê e escreve (o agente corre no mtm-vigias, o executor na VPS, o ecrã passa
-- por /api/admin/cripto). Desfaz-se com drop das três tabelas.

-- Carteiras Solana que o agente segue. Nascem «candidatas» (vistas a comprar cedo um token que
-- depois subiu) e só passam a «esperta» com compras medidas DEPOIS de começarem a ser seguidas,
-- porque a descoberta escolhe por definição quem já acertou (viés de sobrevivência).
create table if not exists public.cripto_carteiras_seguidas (
  endereco text primary key,
  origem text not null,
  estado text not null default 'candidata' check (estado in ('candidata', 'esperta', 'descartada')),
  -- Só compras seguidas e avaliadas (retorno a 1 h): a pontuação que decide o estado.
  n int not null default 0,
  ganhos int not null default 0,
  soma_retorno_pct numeric not null default 0,
  ultima_assinatura text,
  vista_em timestamptz,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);
create index if not exists cripto_carteiras_seguidas_estado on public.cripto_carteiras_seguidas (estado, atualizada_em desc);

-- Cada compra observada. «descoberta» = vista no histórico de uma pool (só semeia a lista);
-- «seguida» = apanhada ao vivo numa carteira seguida (é a que conta para a pontuação).
create table if not exists public.cripto_carteira_compras (
  id uuid primary key default gen_random_uuid(),
  carteira text not null references public.cripto_carteiras_seguidas (endereco) on delete cascade,
  mint text not null,
  simbolo text,
  preco_usd numeric not null check (preco_usd > 0),
  em timestamptz not null default now(),
  fonte text not null check (fonte in ('descoberta', 'seguida')),
  assinatura text unique,
  retorno_1h_pct numeric,
  avaliada_em timestamptz
);
create index if not exists cripto_carteira_compras_por_avaliar on public.cripto_carteira_compras (em) where avaliada_em is null and fonte = 'seguida';
create index if not exists cripto_carteira_compras_carteira on public.cripto_carteira_compras (carteira, em desc);

-- Cada movimento de dinheiro do executor entre carteiras do agente e para o endereço dos lucros,
-- incluindo os RECUSADOS (um destino fora da lista fica aqui, com o motivo, e dá alerta).
create table if not exists public.cripto_movimentos (
  id uuid primary key default gen_random_uuid(),
  em timestamptz not null default now(),
  rede text not null default 'solana',
  de text not null,
  para text not null,
  token text not null,
  valor numeric not null check (valor > 0),
  motivo text not null,
  estado text not null check (estado in ('feito', 'recusado', 'falhado')),
  tx text,
  erro text
);
create index if not exists cripto_movimentos_em on public.cripto_movimentos (em desc);

alter table public.cripto_carteiras_seguidas enable row level security;
alter table public.cripto_carteira_compras enable row level security;
alter table public.cripto_movimentos enable row level security;
revoke all on public.cripto_carteiras_seguidas, public.cripto_carteira_compras, public.cripto_movimentos from anon, authenticated;
grant all on public.cripto_carteiras_seguidas, public.cripto_carteira_compras, public.cripto_movimentos to service_role;
