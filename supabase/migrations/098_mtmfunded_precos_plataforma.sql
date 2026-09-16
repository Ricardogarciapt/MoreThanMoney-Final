-- 098 · MTM Funded: preço por plataforma
--
-- A plataforma MTM Funded (motor simulado) é mais barata do que a MT5 (conta na corretora, fila do
-- agente + horas de MetaApi). O MT5 mantém os preços e os produtos Stripe de sempre em
-- `preco_cents`/`stripe_price_id`; a MTM Funded ganha colunas próprias.
--
-- Sem `preco_cents_mtmfunded`, a plataforma MTM Funded NÃO se vende nesse programa (fica escondida
-- no checkout) — ver lib/mtmfunded/precos.ts. Os ids de preço do Stripe são criados à parte, pelo
-- script scripts/mtmfunded-precos-plataforma.ts --aplicar (esta migração não fala com o Stripe).

alter table public.mtm_funded_programs
  add column if not exists preco_cents_mtmfunded integer,
  add column if not exists stripe_price_id_mtmfunded text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mtm_funded_programs_preco_mtmfunded_check'
  ) then
    alter table public.mtm_funded_programs
      add constraint mtm_funded_programs_preco_mtmfunded_check
      check (preco_cents_mtmfunded is null or preco_cents_mtmfunded between 0 and 500000);
  end if;
end $$;

-- A tabela decidida pelo dono (2026-09-16). MT5 fica como está; MTM Funded ~0,6× do MT5.
update public.mtm_funded_programs set preco_cents_mtmfunded = v.cents
  from (values
    -- uma fase
    ('1k-1f', 1900), ('3k-1f', 4500), ('5k-1f', 6500), ('10k-1f', 10900), ('25k-1f', 19500),
    -- duas fases
    ('1k-2f', 1200), ('3k-2f', 2900), ('5k-2f', 3900), ('10k-2f', 6900), ('25k-2f', 12900),
    -- campanha de lançamento: 10 € nas duas plataformas
    ('launch-10k-2f', 1000)
  ) as v(slug, cents)
 where mtm_funded_programs.slug = v.slug;

comment on column public.mtm_funded_programs.preco_cents_mtmfunded is
  'Preço (cêntimos) na plataforma MTM Funded (motor simulado). Nulo = plataforma não vendida neste programa; preco_cents é o do MT5.';
comment on column public.mtm_funded_programs.stripe_price_id_mtmfunded is
  'Price id do Stripe para o preço MTM Funded. Criado por scripts/mtmfunded-precos-plataforma.ts --aplicar.';
