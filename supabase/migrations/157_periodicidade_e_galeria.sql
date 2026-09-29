-- ============================================================================
-- 157 — QUANTAS VEZES SE PAGA, E MAIS DO QUE UMA IMAGEM
-- ============================================================================
--
-- ═══ 1) PERIODICIDADE ════════════════════════════════════════════════════════
--
-- `recorrente` é um booleano e responde a «paga-se outra vez?». Não responde a «de quanto em
-- quanto tempo?», e a diferença custou caro duas vezes no mesmo dia (29/09/2026):
--
--  · a MONTRA escrevia «336,00 €/mês» no Membro ANUAL e «624,00 €/mês» no Premium ANUAL, porque
--    `recorrente = true` foi lido como mensal. Um preço anual mostrado como mensal é publicidade
--    enganosa, e são os dois produtos mais caros do catálogo;
--
--  · e, pior, `sincronizarPrecoNoStripe` cria sempre `interval: 'month'`. Nos quatro produtos
--    anuais o preço do Stripe «não batia certo», logo o caminho normal era criar um preço MENSAL
--    de 624 € e ARQUIVAR o anual que os clientes estão a pagar. Um clique chegava.
--
-- Há hoje uma guarda que trava isso (um preço que não nasceu aqui não se sincroniza daqui), mas a
-- guarda protege os catorze produtos da casa — não resolve o produto de um educador que queira
-- vender uma mentoria anual. Para esse, é preciso a coluna.
--
-- `unica` é o valor de nascença e não `mensal`: um produto sem periodicidade declarada é uma venda
-- única, que é o caso que não cobra ninguém duas vezes por engano.
--
-- ═══ 2) GALERIA ══════════════════════════════════════════════════════════════
--
-- Pedido do dono a 29/09: «permite ter várias imagens nos produtos de marketplace».
--
-- `imagem_url` FICA e continua a ser a CAPA — é ela que a montra desenha, e uma montra em que cada
-- cartão escolhe uma imagem diferente da galeria é uma montra que muda de aspecto a cada
-- recarregamento. `imagens` é o resto, pela ordem em que o autor as pôs.
--
-- A capa não se duplica na galeria: quem lê mostra a capa primeiro e a seguir `imagens`. Guardar a
-- mesma URL nos dois sítios daria uma ficha com a primeira imagem repetida.
--
-- Tecto de 8: sem limite, um educador entusiasmado põe quarenta e a ficha passa a demorar a abrir
-- num telemóvel — que é onde a maioria compra.

alter table public.marketplace_produtos
  add column if not exists periodicidade text not null default 'unica',
  add column if not exists imagens jsonb not null default '[]'::jsonb;

alter table public.marketplace_produtos drop constraint if exists marketplace_produtos_periodicidade_check;
alter table public.marketplace_produtos add constraint marketplace_produtos_periodicidade_check
  check (periodicidade in ('unica', 'mensal', 'trimestral', 'semestral', 'anual'));

-- Uma venda única não tem periodicidade, e uma recorrente tem de a declarar. Sem isto voltava a
-- ser possível ter `recorrente = true` e ninguém saber de quanto em quanto tempo se cobra.
alter table public.marketplace_produtos drop constraint if exists marketplace_produtos_periodicidade_coerente;
alter table public.marketplace_produtos add constraint marketplace_produtos_periodicidade_coerente
  check (
    (recorrente = false and periodicidade = 'unica') or
    (recorrente = true  and periodicidade <> 'unica')
  );

alter table public.marketplace_produtos drop constraint if exists marketplace_produtos_imagens_check;
alter table public.marketplace_produtos add constraint marketplace_produtos_imagens_check
  check (jsonb_typeof(imagens) = 'array' and jsonb_array_length(imagens) <= 8);

comment on column public.marketplace_produtos.periodicidade is
  'De quanto em quanto tempo se cobra. «unica» = pagamento único. É esta que decide o `interval` do Stripe — `recorrente` só diz SE repete.';
comment on column public.marketplace_produtos.imagens is
  'Galeria, sem a capa. A capa é `imagem_url` e não se repete aqui. Máximo 8, para a ficha abrir depressa no telemóvel.';

-- ── Os catorze da casa: a periodicidade que já têm no Stripe ────────────────
--
-- Lida dos preços reais a 29/09, não adivinhada:
--   Membro 35 €/mês · Membro anual 336 €/ano · Premium 65 €/mês · Premium anual 624 €/ano
--   Scanners 35 €/mês · MTM Scanner 12,50 €/mês · Sensei EA 297 €/ano · Sensei Scalp 200 €/ano
-- Os vitalícios e o semestral são pagamento único (`recorrente = false`), e ficam em «unica».

update public.marketplace_produtos set periodicidade = 'mensal'
 where recorrente = true and slug in ('membro-mensal', 'premium-mensal', 'scanners-mensal', 'mtm-scanner-mensal');

update public.marketplace_produtos set periodicidade = 'anual'
 where recorrente = true and slug in ('membro-anual', 'premium-anual', 'sensei-ea-anual', 'sensei-scalp-anual');

-- Rede de segurança: se sobrar algum recorrente sem periodicidade, fica mensal — é o caso mais
-- comum e, ao contrário de «unica», não viola a restrição acima. Quem o tiver, corrige-o à mão.
update public.marketplace_produtos set periodicidade = 'mensal'
 where recorrente = true and periodicidade = 'unica';
