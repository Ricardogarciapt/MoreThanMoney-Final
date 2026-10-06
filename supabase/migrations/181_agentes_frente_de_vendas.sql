-- 181 — A FRENTE DE VENDAS: cinco filhos novos do CEO (06/10/2026)
--
-- Pedido do dono, a partir do AIOS v2 local: a equipa ganha cinco agentes de vendas —
-- Prospector, Setter, Closer, Social e Email —, todos FILHOS DO CEO e com a MESMA regra de vida
-- dos outros seis (48 h sem receita atribuída → morto e arquivado, desde a 183; lib/agentes/vida.ts). Não há excepção:
-- o único imortal continua a ser o CEO, por pilar='ceo' E ausência de pai.
--
-- ═══ O PILAR «vendas» ════════════════════════════════════════════════════════════════════
--
-- O check da 165 só aceitava ceo/trading/educacao/desenvolvimento. Meter estes cinco em
-- «educacao» (ao lado da Vendas de Formação) era mentir sobre o que fazem: vendem o ecossistema
-- inteiro, não só a formação. Abre-se o pilar. O código foi acompanhado na mesma alteração
-- (lib/agentes/vida.ts, motor.ts, arvore.ts, app/admin/agentes, components/admin/agentes-equipa):
-- sem isso, motor.ts lia «vendas» e caía em «desenvolvimento» sem dar erro.
--
-- ═══ O PAI PROCURA-SE POR pilar E NÃO POR nome ═══════════════════════════════════════════
--
-- O CEO pode ser renomeado no painel (os filhos já foram: Sensei, Vendedora, Professora…). Uma
-- subconsulta `where nome = 'CEO'` deixava de o encontrar e punha os cinco ÓRFÃOS sem erro
-- nenhum. Procura-se pelo que não muda: pilar='ceo' e sem pai.
--
-- ═══ IDEMPOTENTE ═════════════════════════════════════════════════════════════════════════
--
-- Pode correr duas vezes: o agente entra se a chave_receita ainda não existir, o cupão entra se
-- o código não existir, o evento «nasceu» entra se não houver um. Nada se apaga nem reescreve.
--
-- ═══ O QUE ESTA MIGRAÇÃO NÃO FAZ ═════════════════════════════════════════════════════════
--
-- Não dá a nenhum destes agentes forma de cobrar ou publicar. Mensagens a clientes: desde a
-- decisão do dono de 06/10 saem sozinhas SÓ nas bases legais que o motor verifica
-- (lib/agentes/contacto-inicial.ts: resposta, soft opt-in, consentimento, B2B); o resto é rascunho
-- e passa pela aprovação do dono (fila do AIOS / envios por aprovar).
-- A receita começa a zero e só se mede quando houver links com ?ag=<código> em circulação.

-- ── 1. O pilar ──────────────────────────────────────────────────────────────────────────
alter table public.agentes_equipa drop constraint if exists agentes_equipa_pilar_check;
alter table public.agentes_equipa add constraint agentes_equipa_pilar_check
  check (pilar in ('ceo', 'trading', 'educacao', 'desenvolvimento', 'vendas'));

-- ── 2. Os cinco ─────────────────────────────────────────────────────────────────────────
insert into public.agentes_equipa (nome, papel, pilar, pai_id, estado, orcamento, chave_receita, instrucoes)
select v.nome, v.papel, 'vendas',
       (select id from public.agentes_equipa where pilar = 'ceo' and pai_id is null
        order by criado_em limit 1),
       'vivo', 10, v.chave_receita, v.instrucoes
from (values
  (
    'Prospector',
    'Encontra leads que já levantaram a mão',
    'AG-PROSPECTOR',
    'Encontras leads para a casa. Nunca escreves a particulares sem consentimento: procuras quem já '
    || 'levantou a mão — comentou, pediu informação, marcou, abriu conta na corretora — nas redes, no '
    || 'Telegram e no pipeline (vendas_negocios em estado lead). Um lead sem origem declarada não '
    || 'conta. O primeiro contacto só sai sozinho quando o motor confirma uma base legal (cliente ou '
    || 'ex-cliente sobre produto semelhante, consentimento gravado no canal, ou empresa por email '
    || 'profissional); o resto fica em RASCUNHO para o Ricardo aprovar. Todo o link '
    || 'que preparas leva ?ag=AG-PROSPECTOR, porque receita sem código não se atribui a ninguém.'
  ),
  (
    'Setter',
    'Qualifica e marca chamadas pela agenda da casa',
    'AG-SETTER',
    'Qualificas os leads em duas ou três perguntas e marcas a chamada pela agenda própria da casa, '
    || 'o /agendar (morethanmoney.pt/agendar?ag=AG-SETTER), nunca por ferramenta de fora. Dizes a '
    || 'hora no fuso de quem marca. Lead não qualificado não ocupa a agenda do closer. Mensagens '
    || 'para leads só saem sozinhas nas bases legais que o motor verifica; o resto é RASCUNHO para o '
    || 'Ricardo aprovar.'
  ),
  (
    'Closer',
    'Fecha vendas a partir das chamadas marcadas',
    'AG-CLOSER',
    'Fechas vendas. A tua base é docs/mtm-sales-brain.md e a prova em pips de lib/pips-proof.ts, '
    || 'sempre com a ressalva legal: medido em conta de demonstração, resultados passados não '
    || 'garantem resultados futuros, não é aconselhamento financeiro. A escada não lidera com '
    || 'grátis: Membro 35 EUR, PU Prime 300 USD, Premium. Nunca prometes lucro e nunca escreves nada '
    || 'parecido com "+340% em 90 dias". No iPhone a compra é dentro da app (IAP), nunca link Stripe. '
    || 'Mensagens de fecho só saem sozinhas nas bases legais que o motor verifica; o resto é rascunho '
    || 'para o Ricardo aprovar. O link leva ?ag=AG-CLOSER.'
  ),
  (
    'Social',
    'Conteúdo para as redes e criadores',
    'AG-SOCIAL',
    'Preparas conteúdo para as redes (@morethanmoney.pt) e propões criadores e parcerias UGC. Cada '
    || 'publicação leva o código de atribuição no link (?ag=AG-SOCIAL), senão não se mede e não '
    || 'conta — a 01/10 havia 200 posts agendados e zero com código. Publicar é decisão do Ricardo: '
    || 'entregas rascunho. A paleta da casa é ouro sobre carvão e a prova mede-se em pips.'
  ),
  (
    'Email',
    'Sequências de email e recuperação',
    'AG-EMAIL',
    'Pensas em sequências, não em mensagens soltas: boas-vindas, recuperação de checkouts parados '
    || 'e de membros que esfriaram, avisos de renovação. Assunto curto, uma ideia por email, link com '
    || '?ag=AG-EMAIL. Um email só sai sozinho para quem tem consentimento, para clientes ou ex-clientes '
    || 'sobre produto semelhante, ou para empresas (B2B) — sempre com a MTM identificada e forma de '
    || 'sair; o resto fica para o Ricardo aprovar. A particulares sem consentimento nunca escreves, e '
    || 'quem pede para sair nunca mais recebe nada.'
  )
) as v(nome, papel, chave_receita, instrucoes)
where not exists (select 1 from public.agentes_equipa a where a.chave_receita = v.chave_receita)
  and not exists (select 1 from public.agentes_equipa a where a.nome = v.nome);

-- ── 3. O nascimento, no livro ───────────────────────────────────────────────────────────
insert into public.agentes_eventos (agente_id, tipo, valor, detalhe)
select a.id, 'nasceu', a.orcamento,
       'Nasceu com ' || a.orcamento || ' $ de orçamento, filho do CEO. Receita reconhece-se por '
       || a.chave_receita || ' (link ?ag=' || a.chave_receita || ').'
from public.agentes_equipa a
where a.chave_receita in ('AG-PROSPECTOR', 'AG-SETTER', 'AG-CLOSER', 'AG-SOCIAL', 'AG-EMAIL')
  and not exists (select 1 from public.agentes_eventos e where e.agente_id = a.id and e.tipo = 'nasceu');

-- ── 4. Os códigos de atribuição (?ag=) ──────────────────────────────────────────────────
-- Tipo 'atribuicao' (167): não dá desconto, serve só para saber que a venda veio deles.
insert into public.coupons (code, type, discount_value, description, is_active, max_uses)
select c.code, 'atribuicao', 0, c.descricao, true, null
from (values
  ('AG-PROSPECTOR', 'Atribuição — agente Prospector. Não dá desconto.'),
  ('AG-SETTER',     'Atribuição — agente Setter. Não dá desconto.'),
  ('AG-CLOSER',     'Atribuição — agente Closer. Não dá desconto.'),
  ('AG-SOCIAL',     'Atribuição — agente Social. Não dá desconto.'),
  ('AG-EMAIL',      'Atribuição — agente Email. Não dá desconto.')
) as c(code, descricao)
on conflict (code) do nothing;
