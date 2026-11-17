-- 261 · O FUNIL de cada negócio (CRM Fase 3, 17/11/2026).
--
-- A Conduta v2 separa a venda em três funis — Educação (Membro/Premium), Rota Corretora e
-- MTM Funded — e o B2B corre ao lado. Até aqui o negócio não dizia a qual pertencia, e o pipeline
-- misturava os quatro numa só lista. `null` é «por classificar», e é dito assim no quadro: inventar
-- um funil para os 3.969 contactos importados do WhatsApp era esconder que ninguém sabe ainda.
alter table public.vendas_negocios
  add column if not exists funil text
  check (funil is null or funil in ('educacao', 'corretora', 'funded', 'b2b'));

create index if not exists vendas_negocios_funil_estado_idx
  on public.vendas_negocios (funil, estado);

-- O que já se sabe sem adivinhar: quem veio da corretora está na Rota Corretora; quem tem um pack
-- de Membro/Premium previsto está na Educação.
update public.vendas_negocios set funil = 'corretora'
  where funil is null and origem = 'corretora';
update public.vendas_negocios set funil = 'educacao'
  where funil is null and pack_previsto in ('membro', 'premium');
