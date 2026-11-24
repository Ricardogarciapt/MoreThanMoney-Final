-- 287 — MTM Funded: extrato mensal (statement) por conta.
--
-- Duas peças:
--  1. `mtm_funded_extrato(conta, ini, fim)` — devolve, em JSON, o resumo de uma conta num período
--     (saldo de abertura, resultado, comissões, ajustes, levantamentos, saldo de fecho, operações,
--     ganhos/perdas) e a CONCILIAÇÃO: o saldo reconstruído a partir dos movimentos tem de bater com
--     `sim_saldo`. Se não bate, o extrato NÃO se envia (fica `por_conciliar` e avisa-se o admin).
--  2. `mtm_funded_extratos_envios` — registo de cada envio (idempotência: uma conta, um mês).
--
-- Regra do saldo simulado (verificada em 24/11/2026 numa conta real):
--   sim_saldo = saldo_inicial + Σ pnl das posições fechadas − Σ comissões − Σ ajustes aplicados
--               − Σ levantamentos pagos
-- Qualquer outra escrita no saldo quebra a conciliação, e a conciliação é o que nos protege.

create or replace function public.mtm_funded_extrato(
  p_account uuid,
  p_ini timestamptz,
  p_fim timestamptz
)
returns jsonb
language plpgsql
stable
as $$
declare
  a record;
  v_antes numeric := 0;
  v_periodo_resultado numeric := 0;
  v_periodo_comissao numeric := 0;
  v_periodo_ajuste numeric := 0;
  v_periodo_levant numeric := 0;
  v_total_movimentos numeric := 0;
  v_ops int := 0;
  v_ganhos int := 0;
  v_perdas int := 0;
  v_ganho_bruto numeric := 0;
  v_perda_bruta numeric := 0;
  v_melhor numeric := null;
  v_pior numeric := null;
  v_abertas int := 0;
  v_saldo_inicio numeric;
  v_saldo_fim numeric;
  v_reconstruido numeric;
begin
  select id, etiqueta, tipo, saldo_inicial, sim_saldo, sim_equity, sim_pico_equity
    into a
    from public.mtm_trading_accounts
   where id = p_account;
  if not found then
    return null;
  end if;

  -- Movimentos do saldo: (instante, valor, natureza). Cada um entra uma vez.
  create temp table if not exists _extrato_mov (t timestamptz, v numeric, k text) on commit drop;
  delete from _extrato_mov;

  insert into _extrato_mov
  select fechada_em, coalesce(pnl, 0), 'resultado'
    from public.funded_positions
   where account_id = p_account and estado = 'fechada' and fechada_em is not null;

  insert into _extrato_mov
  select aberta_em, -coalesce(comissao, 0), 'comissao'
    from public.funded_positions
   where account_id = p_account and aberta_em is not null and coalesce(comissao, 0) <> 0;

  insert into _extrato_mov
  select aplicado_em, delta, 'ajuste'
    from public.mtm_funded_ajustes_saldo
   where account_id = p_account and estado = 'aplicado' and aplicado_em is not null;

  insert into _extrato_mov
  select pago_em, -coalesce(valor_usd, 0), 'levantamento'
    from public.mtm_funded_withdrawals
   where account_id = p_account and pago_em is not null;

  select coalesce(sum(v) filter (where t < p_ini), 0),
         coalesce(sum(v) filter (where t >= p_ini and t < p_fim and k = 'resultado'), 0),
         coalesce(sum(v) filter (where t >= p_ini and t < p_fim and k = 'comissao'), 0),
         coalesce(sum(v) filter (where t >= p_ini and t < p_fim and k = 'ajuste'), 0),
         coalesce(sum(v) filter (where t >= p_ini and t < p_fim and k = 'levantamento'), 0),
         coalesce(sum(v), 0)
    into v_antes, v_periodo_resultado, v_periodo_comissao, v_periodo_ajuste, v_periodo_levant, v_total_movimentos
    from _extrato_mov;

  v_saldo_inicio := a.saldo_inicial + v_antes;
  v_saldo_fim := v_saldo_inicio + v_periodo_resultado + v_periodo_comissao + v_periodo_ajuste + v_periodo_levant;
  v_reconstruido := a.saldo_inicial + v_total_movimentos;

  -- Operações fechadas no período (fechos parciais contam como fecho).
  select count(*),
         count(*) filter (where coalesce(pnl, 0) > 0),
         count(*) filter (where coalesce(pnl, 0) < 0),
         coalesce(sum(pnl) filter (where pnl > 0), 0),
         coalesce(sum(pnl) filter (where pnl < 0), 0),
         max(pnl),
         min(pnl)
    into v_ops, v_ganhos, v_perdas, v_ganho_bruto, v_perda_bruta, v_melhor, v_pior
    from public.funded_positions
   where account_id = p_account and estado = 'fechada'
     and fechada_em >= p_ini and fechada_em < p_fim;

  select count(*) into v_abertas
    from public.funded_positions
   where account_id = p_account and estado = 'aberta';

  return jsonb_build_object(
    'conta_id', a.id,
    'etiqueta', a.etiqueta,
    'tipo', a.tipo,
    'capital_inicial', a.saldo_inicial,
    'saldo_inicio', round(v_saldo_inicio, 2),
    'resultado', round(v_periodo_resultado, 2),
    'comissoes', round(v_periodo_comissao, 2),
    'ajustes', round(v_periodo_ajuste, 2),
    'levantamentos', round(v_periodo_levant, 2),
    'saldo_fim', round(v_saldo_fim, 2),
    'saldo_atual', a.sim_saldo,
    'equity_atual', a.sim_equity,
    'pico_equity', a.sim_pico_equity,
    'abertas_agora', v_abertas,
    'operacoes', v_ops,
    'ganhos', v_ganhos,
    'perdas', v_perdas,
    'ganho_bruto', round(v_ganho_bruto, 2),
    'perda_bruta', round(v_perda_bruta, 2),
    'melhor', v_melhor,
    'pior', v_pior,
    'diferenca_conciliacao', round(v_reconstruido - coalesce(a.sim_saldo, 0), 2),
    'conciliado', abs(v_reconstruido - coalesce(a.sim_saldo, 0)) < 0.05
  );
end;
$$;

comment on function public.mtm_funded_extrato(uuid, timestamptz, timestamptz) is
  'Extrato mensal de uma conta MTM Funded: saldos, movimentos, operações e conciliação com sim_saldo.';

-- Registo dos envios: uma linha por conta e mês. `enviado` é final; os outros estados podem repetir-se.
create table if not exists public.mtm_funded_extratos_envios (
  account_id uuid not null references public.mtm_trading_accounts(id) on delete cascade,
  periodo text not null check (periodo ~ '^[0-9]{4}-[0-9]{2}$'),
  estado text not null check (estado in ('enviado', 'falhou', 'por_conciliar', 'sem_email', 'a_enviar')),
  destinatario text,
  assunto text,
  erro text,
  enviado_em timestamptz not null default now(),
  primary key (account_id, periodo)
);

alter table public.mtm_funded_extratos_envios enable row level security;
-- Sem políticas: só o service role (cron) lê e escreve.
