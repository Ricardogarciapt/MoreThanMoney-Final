-- 165b — O ESTADO «REFORMADO»
--
-- Decisão do dono (01/10): se um filho render mais do que o pai, o filho reforma o pai.
--
-- `reformado` é um estado À PARTE de `parado`, e a diferença não é cosmética: **parado é falhanço,
-- reformado é sucesso.** Um agente reforma-se porque deixou descendência melhor, que é o melhor
-- fim possível para um agente. Juntar os dois no mesmo estado perdia a única informação que
-- distingue uma linhagem que evoluiu de uma que morreu — e é essa que diz se vale a pena continuar
-- a investir naquele pilar.
--
-- A comparação está em `lib/agentes/vida.ts::deveReformarOPai` e é por RITMO (lucro por hora de
-- vida), não por lucro acumulado: o filho nasce sempre depois, por isso comparar acumulados era
-- escrever uma regra que nunca dispararia — e ninguém daria por isso durante meses.
alter table public.agentes_equipa drop constraint if exists agentes_equipa_estado_check;
alter table public.agentes_equipa add constraint agentes_equipa_estado_check
  check (estado in ('vivo','em_risco','parado','pausado','reformado'));

alter table public.agentes_eventos drop constraint if exists agentes_eventos_tipo_check;
alter table public.agentes_eventos add constraint agentes_eventos_tipo_check
  check (tipo in ('nasceu','gastou','receita','avaliado','avisado','parou','retomado','clonou','trabalho','reformado'));

-- Quem o reformou. Sem isto, um pai reformado é indistinguível de um pai parado quando se olha
-- para a linha meses depois.
alter table public.agentes_equipa add column if not exists reformado_por uuid
  references public.agentes_equipa(id) on delete set null;
alter table public.agentes_equipa add column if not exists reformado_em timestamptz;
