-- 231 · Contas pequenas: lote mínimo até um saldo (pedido do Ricardo, 04/11/2026)
--
-- «Não coloques máximo de posições nem percentagem de risco quando as contas estão abaixo de
-- 1000 $.» Enquanto a equity da conta está abaixo de `conta_pequena_ate`, o motor copia no lote
-- mínimo (lote_fixo_forcado = 0,01) sem máximo de posições. Quando a equity passa o limiar, o
-- vigia `/api/cron/contas-pequenas` avisa o admin UMA vez (conta_pequena_lembrete_em) para passar
-- a conta a risco %. A troca NÃO é automática: é o admin que decide o % na ficha da conta.
alter table public.mestres_contas
  add column if not exists conta_pequena_ate numeric
    check (conta_pequena_ate is null or (conta_pequena_ate > 0 and conta_pequena_ate <= 1000000)),
  add column if not exists conta_pequena_lembrete_em timestamptz;

comment on column public.mestres_contas.conta_pequena_ate is
  'Conta pequena: lote mínimo 0,01 sem máx. de posições até a equity chegar a este valor (moeda da conta). null = regra desligada.';
comment on column public.mestres_contas.conta_pequena_lembrete_em is
  'Quando o vigia avisou o admin de que a conta passou o limiar. null = ainda não avisou.';

-- As 5 contas que o Ricardo pôs em lote mínimo a 04/11 17:45 UTC ficam com a regra a 1000.
update public.mestres_contas set conta_pequena_ate = 1000
where conta_chave in ('mt:39551424@puprime-live6','mt:35849438@puprime-live6','mt:30087061@trademaxglobal-live2','mt:8049310@fxify-server','mt:8049305@fxify-server');
