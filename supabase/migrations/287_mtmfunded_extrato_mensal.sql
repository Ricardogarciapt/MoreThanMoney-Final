-- 287 — MTM Funded: extrato mensal (statement) por conta. Versão aplicada em 24/11/2026.
--
-- 1. `mtm_funded_extrato(conta, ini, fim)` — só lê. Devolve em JSON o resumo da conta num período
--    e a CONCILIAÇÃO: o saldo reconstruído a partir dos movimentos tem de bater com `sim_saldo`.
--    Se não bate, o extrato não se envia (estado `por_conciliar`).
-- 2. `mtm_funded_extratos_envios` — um registo por conta e mês (idempotência).
--
-- Regra do saldo simulado (verificada em 24/11/2026):
--   sim_saldo = saldo_inicial + Σ pnl (fechadas) − Σ comissões − Σ ajustes aplicados − Σ levantamentos pagos
-- Nota: a versão inicial usava tabela temporária dentro de função STABLE, o que o Postgres recusa.
-- Esta versão usa CTE e funciona como STABLE.

create or replace function public.mtm_funded_extrato(p_account uuid, p_ini timestamptz, p_fim timestamptz)
returns jsonb
language plpgsql
stable
as $$
declare
  a record;
  v jsonb;
begin
  select id, etiqueta, tipo, saldo_inicial, sim_saldo, sim_equity, sim_pico_equity
    into a from public.mtm_trading_accounts where id = p_account;
  if not found then return null; end if;

  with mov as (
    select fechada_em as t, coalesce(pnl, 0) as x, 'resultado'::text as k
      from public.funded_positions
     where account_id = p_account and estado = 'fechada' and fechada_em is not null
    union all
    select aberta_em, -coalesce(comissao, 0), 'comissao'
      from public.funded_positions
     where account_id = p_account and aberta_em is not null and coalesce(comissao, 0) <> 0
    union all
    select aplicado_em, delta, 'ajuste'
      from public.mtm_funded_ajustes_saldo
     where account_id = p_account and estado = 'aplicado' and aplicado_em is not null
    union all
    select pago_em, -coalesce(valor_usd, 0), 'levantamento'
      from public.mtm_funded_withdrawals
     where account_id = p_account and pago_em is not null
  ),
  per as (
    select
      coalesce(sum(x) filter (where t < p_ini), 0) as antes,
      coalesce(sum(x) filter (where t >= p_ini and t < p_fim and k = 'resultado'), 0) as res,
      coalesce(sum(x) filter (where t >= p_ini and t < p_fim and k = 'comissao'), 0) as com,
      coalesce(sum(x) filter (where t >= p_ini and t < p_fim and k = 'ajuste'), 0) as aj,
      coalesce(sum(x) filter (where t >= p_ini and t < p_fim and k = 'levantamento'), 0) as lev,
      coalesce(sum(x), 0) as tot
    from mov
  ),
  ops as (
    select count(*) as n,
           count(*) filter (where pnl > 0) as g,
           count(*) filter (where pnl < 0) as p,
           coalesce(sum(pnl) filter (where pnl > 0), 0) as gb,
           coalesce(sum(pnl) filter (where pnl < 0), 0) as pb,
           max(pnl) as mx, min(pnl) as mn
      from public.funded_positions
     where account_id = p_account and estado = 'fechada' and fechada_em >= p_ini and fechada_em < p_fim
  ),
  ab as (
    select count(*) as n from public.funded_positions where account_id = p_account and estado = 'aberta'
  )
  select jsonb_build_object(
    'conta_id', a.id, 'etiqueta', a.etiqueta, 'tipo', a.tipo,
    'capital_inicial', a.saldo_inicial,
    'saldo_inicio', round(a.saldo_inicial + per.antes, 2),
    'resultado', round(per.res, 2),
    'comissoes', round(per.com, 2),
    'ajustes', round(per.aj, 2),
    'levantamentos', round(per.lev, 2),
    'saldo_fim', round(a.saldo_inicial + per.antes + per.res + per.com + per.aj + per.lev, 2),
    'saldo_atual', a.sim_saldo, 'equity_atual', a.sim_equity, 'pico_equity', a.sim_pico_equity,
    'abertas_agora', ab.n,
    'operacoes', ops.n, 'ganhos', ops.g, 'perdas', ops.p,
    'ganho_bruto', round(ops.gb, 2), 'perda_bruta', round(ops.pb, 2),
    'melhor', ops.mx, 'pior', ops.mn,
    'diferenca_conciliacao', round(a.saldo_inicial + per.tot - coalesce(a.sim_saldo, 0), 2),
    'conciliado', abs(a.saldo_inicial + per.tot - coalesce(a.sim_saldo, 0)) < 0.05
  ) into v
  from per, ops, ab;

  return v;
end;
$$;

comment on function public.mtm_funded_extrato(uuid, timestamptz, timestamptz) is
  'Extrato mensal de uma conta MTM Funded: saldos, movimentos, operações e conciliação com sim_saldo.';

create table if not exists public.mtm_funded_extratos_envios (
  account_id uuid not null references public.mtm_trading_accounts(id) on delete cascade,
  periodo text not null check (periodo ~ '^[0-9]{4}-[0-9]{2}$'),
  estado text not null check (estado in ('enviado', 'falhou', 'por_conciliar', 'sem_email')),
  destinatario text,
  assunto text,
  erro text,
  enviado_em timestamptz not null default now(),
  primary key (account_id, periodo)
);

alter table public.mtm_funded_extratos_envios enable row level security;
-- Sem políticas: só o service role (cron) lê e escreve.
