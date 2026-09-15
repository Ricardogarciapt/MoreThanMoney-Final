-- 097 · MTM Funded: plataforma escolhida no checkout (MTM Funded simulado | MT5 corretora)
--
-- A escolha viaja pelos metadados do Stripe e manda no motor da conta (lib/mtmfunded/plataforma.ts).
-- Fica também gravada na compra para o admin e para relatórios. Nulo = compra anterior à escolha
-- (seguiu a regra do lançamento). O motor real da conta continua em mtm_trading_accounts.motor.
-- A config `mt5_a_venda` vive no JSON de site_settings.mtmfunded_config (sem migração).

alter table public.mtm_funded_purchases
  add column if not exists plataforma text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mtm_funded_purchases_plataforma_check'
  ) then
    alter table public.mtm_funded_purchases
      add constraint mtm_funded_purchases_plataforma_check
      check (plataforma is null or plataforma in ('mtmfunded', 'mt5'));
  end if;
end $$;

-- Preenche as compras já pagas pelo motor da conta que emitiram.
update public.mtm_funded_purchases p
   set plataforma = case when a.motor = 'sim' then 'mtmfunded' else 'mt5' end
  from public.mtm_trading_accounts a
 where p.account_id = a.id
   and p.plataforma is null;

comment on column public.mtm_funded_purchases.plataforma is
  'Plataforma escolhida no checkout: mtmfunded (motor sim) | mt5 (fila do agente, MetaApi). Nulo = anterior à escolha.';
