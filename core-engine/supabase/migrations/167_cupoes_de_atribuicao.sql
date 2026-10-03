-- 167 — CÓDIGOS DE ATRIBUIÇÃO: medir quem trouxe a venda, sem dar desconto
--
-- A equipa de agentes mede-se pela receita que traz, e a receita reconhece-se por um código na
-- compra (`marketplace_compras.cupao_codigo`). Faltavam os códigos.
--
-- ═══ PORQUE É QUE ISTO NÃO VAI AO STRIPE ═══════════════════════════════════════════════════
--
-- No Stripe, um cupão OBRIGA a um desconto: não existe cupão de 0%. Criar sete códigos de
-- desconto só para saber quem trouxe a venda custava dinheiro real em cada venda — pagar para
-- medir, e pagar para sempre.
--
-- A tabela de cupões desta casa não tem esse problema: `discount_value` já aceita 0. O código é
-- validado aqui e gravado na compra, e é daqui que `lib/agentes/receita.ts` o lê. O Stripe recebe
-- o pagamento pelo valor cheio e não sabe nada disto — que é exactamente o que se quer.
--
-- ═══ UM TIPO PRÓPRIO, E NÃO UM «DESCONTO DE 0%» ════════════════════════════════════════════
--
-- Dava para usar `discount_pct` com valor 0 e poupar esta migração. Não se faz: daqui a seis meses
-- alguém abre o painel, vê «desconto 0%» e ou o apaga por lhe parecer um erro, ou «corrige-o» para
-- 10. Um tipo chamado `atribuicao` diz o que é e protege-se sozinho.
--
-- O caminho do lado do código está em `lib/marketplace/cupoes.ts`, com guarda em
-- `referral.check.ts`: sem uma saída própria, estes códigos caíam no ramo do desconto e eram
-- recusados com «sem_desconto» — existiam, pareciam válidos, e não funcionavam.
alter table public.coupons drop constraint if exists coupons_type_check;
alter table public.coupons add constraint coupons_type_check
  check (type = any (array['discount_pct','free_months','free_subscription','partnership','atribuicao']));

-- Um código por agente, com o mesmo nome que está em `agentes_equipa.chave_receita`.
-- `on conflict (code) do nothing`: correr isto duas vezes não duplica nem reescreve o que exista.
insert into public.coupons (code, type, discount_value, description, is_active, max_uses)
select c.code, 'atribuicao', 0, c.descricao, true, null
from (values
  ('CEO-MTM',      'Atribuição — agente CEO. Não dá desconto: serve para saber que a venda veio dele.'),
  ('AG-TRADER',    'Atribuição — agente Trader Papel.'),
  ('AG-SCANNER',   'Atribuição — agente Analista de Scanners.'),
  ('AG-LMS',       'Atribuição — agente Conteúdo LMS.'),
  ('AG-FORMACAO',  'Atribuição — agente Vendas de Formação.'),
  ('AG-SAAS',      'Atribuição — agente Produto SaaS.'),
  ('AG-SITE',      'Atribuição — agente Manutenção do Site.')
) as c(code, descricao)
on conflict (code) do nothing;
