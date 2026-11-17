-- 264 · Resultado REAL de cada cópia no MT5 vs a mestre MTM Funded, em pips (17/11/2026).
-- Escrito pelo cron /api/cron/copia-resultados (lib/copia-contas/servidor/resultados.ts) a partir
-- dos deals da MetaApi. Só leitura das contas: nada aqui abre, mexe ou fecha posições.
-- pips_sombra_b = estimativa «sair com a mestre» (teste em sombra da proposta B).
create table if not exists public.copia_resultados (
  copia_posicao_id uuid primary key references public.copia_posicoes(id) on delete cascade,
  rota_id uuid not null,
  destino_chave text not null,
  estrategia text,
  destino_posicao_id text not null,
  origem_posicao_id text,
  simbolo text,
  direcao text,
  volume numeric,
  preco_entrada numeric,
  preco_fecho numeric,
  lucro numeric,
  motivo text,
  fechada_em timestamptz,
  mestre_preco_entrada numeric,
  mestre_preco_fecho numeric,
  mestre_motivo text,
  mestre_fechada_em timestamptz,
  pips_copia numeric,
  pips_mestre numeric,
  divergencia_pips numeric,
  custo_entrada_pips numeric,
  saiu_antes boolean not null default false,
  pips_sombra_b numeric,
  lido_em timestamptz not null default now()
);
create index if not exists copia_resultados_conta_idx on public.copia_resultados (destino_chave, fechada_em desc);
alter table public.copia_resultados enable row level security;
-- só service role (sem políticas): dados de contas de clientes.
