-- 079 · Gestão de uma conta MTM Funded pelo admin (/admin?tab=mtmfunded → clicar na conta)
--
-- 1. PAUSA do admin em coluna própria. A conta continua `estado = 'ativa'` — o motor do VPS só
--    olha para contas activas, e é ele que gere SL/TP, trailing e stop-out das posições abertas.
--    As portas de ordens novas do site (abrirPosicao/criarPendente) lêem `pausada_em`.
--    Não vai nas `metricas`: o motor reescreve esse jsonb inteiro (ler-juntar-gravar) e uma pausa
--    escrita no meio perdia-se.
-- 2. PRAZO EXTRA por conta (dias somados ao `dias_maximos` das regras). O motor ainda não o lê.
-- 3. AUDITORIA de cada acção do admin, com antes/depois e a chave de idempotência (única): um
--    duplo clique ou uma rede que repete devolve o que a primeira fez em vez de o fazer outra vez.
-- 4. RESET atómico (fechar posições a zero, cancelar pendentes, repor saldo) numa só transacção.
-- 5. Índices para as leituras do modal (conta → ordens, levantamentos, ligações).
--
-- NÃO APLICADA automaticamente. Até ser aplicada: as acções do modal respondem 503, as ordens
-- continuam a funcionar (a verificação da pausa ignora a coluna em falta).

-- ── 1 + 2. colunas ───────────────────────────────────────────────────────────
alter table public.mtm_trading_accounts
  add column if not exists pausada_em timestamptz,
  add column if not exists pausa_motivo text,
  add column if not exists pausada_por uuid,
  add column if not exists prazo_extra_dias int not null default 0;

comment on column public.mtm_trading_accounts.pausada_em is
  'Pausa do admin: não aceita ordens novas; o motor continua a gerir SL/TP (estado mantém-se ativa).';
comment on column public.mtm_trading_accounts.prazo_extra_dias is
  'Dias somados a regras.dias_maximos para esta conta (estender prazo pelo admin).';

create index if not exists mtm_trading_accounts_pausadas_idx
  on public.mtm_trading_accounts (id) where pausada_em is not null;

-- ── 3. auditoria ─────────────────────────────────────────────────────────────
create table if not exists public.mtm_funded_admin_audit (
  id bigserial primary key,
  -- Sem FK: o registo sobrevive à conta (uma conta apagada é exactamente quando se pergunta quem fez o quê).
  account_id uuid not null,
  admin_id uuid not null,
  admin_email text,
  accao text not null,
  motivo text,
  pedido jsonb not null default '{}'::jsonb,
  antes jsonb,
  depois jsonb,
  resultado jsonb,
  estado text not null default 'em_curso' check (estado in ('em_curso', 'ok', 'falhou')),
  chave_idempotencia text not null,
  criado_em timestamptz not null default now(),
  concluido_em timestamptz
);
create unique index if not exists mtm_funded_admin_audit_chave_uniq
  on public.mtm_funded_admin_audit (chave_idempotencia);
create index if not exists mtm_funded_admin_audit_conta_idx
  on public.mtm_funded_admin_audit (account_id, criado_em desc);

alter table public.mtm_funded_admin_audit enable row level security;
revoke all on public.mtm_funded_admin_audit from anon, authenticated;
grant all on public.mtm_funded_admin_audit to service_role;
grant usage, select on sequence public.mtm_funded_admin_audit_id_seq to service_role;

-- ── 4. reset atómico ─────────────────────────────────────────────────────────
create or replace function public.funded_admin_reset_conta(p_conta uuid, p_saldo numeric)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c record;
  v_pos int;
  v_ord int;
  v_manter jsonb;
begin
  if p_saldo is null or p_saldo < 100 then
    raise exception 'saldo inválido';
  end if;
  select id, motor, metricas into c from public.mtm_trading_accounts where id = p_conta for update;
  if not found then raise exception 'conta não encontrada'; end if;
  if c.motor <> 'sim' then raise exception 'reset só em contas simuladas'; end if;

  update public.funded_orders set estado = 'cancelada'
   where account_id = p_conta and estado = 'pendente';
  get diagnostics v_ord = row_count;

  -- Fechadas ao preço de entrada e com lucro zero: o saldo é reposto a seguir, e um P&L inventado
  -- ao fechar sujava as estatísticas. `fim_de_ciclo` diz no histórico porque fecharam.
  update public.funded_positions
     set estado = 'fechada', preco_fecho = preco_entrada, pnl = 0, motivo_fecho = 'fim_de_ciclo', fechada_em = now()
   where account_id = p_conta and estado = 'aberta';
  get diagnostics v_pos = row_count;

  v_manter := jsonb_strip_nulls(jsonb_build_object(
    'fase', c.metricas->'fase',
    'analise', c.metricas->'analise',
    'teste', c.metricas->'teste',
    'notificado_em', c.metricas->'notificado_em'
  ));

  update public.mtm_trading_accounts set
    saldo_inicial = p_saldo,
    sim_saldo = p_saldo, sim_equity = p_saldo, sim_margem = 0,
    sim_ancora_dia = p_saldo, sim_ancora_em = now(), sim_pico_equity = p_saldo,
    sim_dias_negociados = 0, sim_ultimo_dia = null,
    estado = 'ativa', quebrou_regra = null, quebrada_em = null,
    metricas = v_manter || jsonb_build_object('resetEm', now()),
    updated_at = now()
  where id = p_conta;

  return jsonb_build_object('posicoesFechadas', v_pos, 'ordensCanceladas', v_ord, 'saldo', p_saldo);
end;
$$;
revoke all on function public.funded_admin_reset_conta(uuid, numeric) from public, anon, authenticated;
grant execute on function public.funded_admin_reset_conta(uuid, numeric) to service_role;

-- ── 5. índices das leituras do modal ─────────────────────────────────────────
create index if not exists funded_orders_conta_estado_idx
  on public.funded_orders (account_id, estado);
create index if not exists funded_positions_conta_fechada_idx
  on public.funded_positions (account_id, fechada_em desc) where estado = 'fechada';
create index if not exists mtm_funded_withdrawals_conta_idx
  on public.mtm_funded_withdrawals (account_id, criado_em desc);
create index if not exists mtmauto_accounts_funded_conta_idx
  on public.mtmauto_accounts (funded_account_id) where funded_account_id is not null;
