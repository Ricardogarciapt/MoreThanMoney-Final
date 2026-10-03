-- O MARKETPLACE, SEGUNDA PARTE — o catálogo a sério, as campanhas, e quem passou por aqui.
--
-- A 151 pôs de pé o esqueleto: quem vende, o que vende, o que foi vendido, o que falta pagar.
-- Isto é o que faltava para a coisa se poder chamar uma loja.
--
-- ── 1. CATEGORIAS: de cinco para doze ─────────────────────────────────────────────────────
--
-- A 151 nasceu com `tipo in ('curso','mentoria','ebook','comunidade','outro')` — cinco valores,
-- escolhidos quando o marketplace ainda era «os cursos dos educadores». O que o dono quer vender
-- aqui é mais largo: mentorias, masterclasses, EAs, serviços, produtos personalizáveis,
-- merchandise, aplicações e subscrições. Um EA metido em 'outro' não é uma categoria — é uma
-- categoria em falta, e uma montra que não consegue dizer o que está a vender não filtra, não
-- ordena e não se navega.
--
-- Os cinco antigos FICAM. Não custam nada e apagá-los era partir o que já lá está escrito.
--
-- ── 2. A CATEGORIA MUDA O QUE O CHECKOUT FAZ ──────────────────────────────────────────────
--
-- Não é decoração. Uma subscrição cobra-se em `mode: 'subscription'` no Stripe e um curso em
-- `mode: 'payment'` — a mesma chamada com o modo errado ou cobra uma vez o que devia ser mensal,
-- ou põe a cobrar todos os meses o que se vendeu uma vez. E merchandise é uma caixa que alguém
-- tem de enviar para algum lado, por isso o checkout tem de pedir morada; um curso não.
--
-- Por isso `recorrente` e `requer_morada` são colunas e não um `if` sobre o `tipo` espalhado por
-- três rotas. O valor de nascença deriva da categoria, mas fica editável: há merchandise digital
-- e há mentorias cobradas ao mês, e obrigar a categoria a decidir isso sozinha era garantir que
-- mais cedo ou mais tarde alguém escolhia a categoria errada para conseguir o modo certo.
--
-- ── 3. PRODUTOS DA CASA, AO LADO DOS DOS EDUCADORES ───────────────────────────────────────
--
-- Hoje a tabela tem ZERO produtos e `marketplace_educadores` tem ZERO vendedores. Um marketplace
-- que abre vazio não é um marketplace: é uma prateleira. O que já vende nesta casa — scanners,
-- subscrições, licenças de EA — é o que lá tem de estar no primeiro dia.
--
-- `dono` diz de quem é o produto. `'casa'` é a MTM, e um produto da casa NÃO tem educador: o
-- `educator_id` passa a poder ser nulo, e é nulo de propósito em vez de apontar para um educador
-- de mentira chamado «MoreThanMoney». Inventar essa linha punha um vendedor falso na lista de
-- payouts do dono e obrigava toda a gente a lembrar-se de o excluir; o `check` abaixo diz a
-- verdade e a base de dados guarda-a por nós.
--
-- A partilha de um produto da casa é 100% casa. Isso não se escreve aqui como percentagem —
-- escreve-se em `regras.ts`, onde `dono === 'casa'` salta a conta da partilha toda. Pôr 0 na
-- coluna obrigava a afrouxar o `check (partilha_pct >= 90)`, que é a guarda da promessa pública
-- da /criadores, e essa guarda vale mais do que a conveniência.
--
-- `checkout_externo_url` é a rede de segurança do dia da mudança: um produto da casa pode
-- aparecer na montra e mandar o comprador para o caminho de compra que JÁ VENDE HOJE, em vez de
-- para o checkout novo. Os scanners e as licenças de EA vendem-se todos os dias; migrá-los é
-- mostrá-los aqui primeiro e só depois, quando o caminho novo estiver provado, tirar o link
-- antigo. Um produto com `stripe_price_id` usa o caminho novo; um com `checkout_externo_url`
-- usa o antigo. Coexistem, e é essa a intenção.
--
-- ── 4. CAMPANHAS ──────────────────────────────────────────────────────────────────────────
--
-- «Desconto de x% para membro, com prazo.» O reflexo era reaproveitar `coupons` — mas `coupons`
-- é outra coisa: é um CÓDIGO que alguém escreve, com `plan_override`, `grant_days` e `grants_vip`,
-- desenhado para dar packs e VIP. Não tem âmbito de produto e não tem a noção de «aplica-se
-- sozinho a quem cá está». Uma campanha de marketplace é o contrário: ninguém escreve nada, o
-- preço aparece já descontado a quem tem direito, e acaba na data marcada.
--
-- Por isso vive no produto. Uma campanha é do produto; sem tabela, sem junção, e sem duas fontes
-- a discordarem sobre quanto custa a mesma coisa.
--
-- `campanha_tier` usa os valores que `perfil-ui.ts` já conhece ('all','app_member','premium',
-- 'vip') e que `podeAcederAoTier` já sabe responder. Inventar aqui um vocabulário novo de níveis
-- era criar a terceira definição de «membro» nesta casa — e a segunda já custou sinais perdidos
-- (o VIP que vive em dois campos).
--
-- `campanha_stripe_coupon_id` existe porque no Stripe um preço não se desconta: aplica-se um
-- cupão à sessão de checkout. Guardar o id evita criar um cupão novo a cada clique.
--
-- ── 5. QUEM PASSOU POR AQUI ───────────────────────────────────────────────────────────────
--
-- `marketplace_leads` é o funil por dentro. Não há nada nesta casa que sirva: `funil_percursos` é
-- uma máquina de estados de automações (Telegram, Instagram), com `acordar_em` e `no_atual` — um
-- motor que EXECUTA um funil, não um registo do que aconteceu numa montra.
--
-- Cada passo fica escrito: viu a ficha, clicou em comprar, pagou, desistiu. Serve para a pergunta
-- que o dono vai fazer no segundo mês — «quantos chegaram ao pagamento e não pagaram?» — e que
-- sem isto não tem resposta nenhuma, porque a única coisa que fica é a venda que aconteceu.
--
-- RLS fechada, como tudo o que nasce aqui desde os incidentes das tabelas abertas.

-- ── 1+2. Categorias, e o que elas mudam no checkout ───────────────────────────────────────

alter table public.marketplace_produtos drop constraint if exists marketplace_produtos_tipo_check;
alter table public.marketplace_produtos add constraint marketplace_produtos_tipo_check
  check (tipo in (
    'curso', 'mentoria', 'masterclass', 'ea', 'servico', 'personalizavel',
    'merchandise', 'aplicacao', 'subscricao',
    -- Os cinco da 151. 'ebook' e 'comunidade' ficam porque já existiam.
    'ebook', 'comunidade', 'outro'
  ));

alter table public.marketplace_produtos
  -- Cobra-se todos os meses? Muda o `mode` da sessão Stripe, e não há maneira de o corrigir
  -- depois de a primeira cobrança sair errada.
  add column if not exists recorrente boolean not null default false,
  -- Há uma caixa para enviar. O checkout passa a pedir morada.
  add column if not exists requer_morada boolean not null default false,
  -- O produto no Stripe. Os PREÇOS no Stripe são imutáveis: mudar o preço é criar um preço novo
  -- e arquivar o antigo. Sem o produto guardado, cada edição de preço criava também um produto
  -- novo, e o catálogo Stripe enchia-se de duplicados do mesmo curso.
  add column if not exists stripe_product_id text;

-- ── 3. De quem é o produto ────────────────────────────────────────────────────────────────

alter table public.marketplace_produtos
  add column if not exists dono text not null default 'educador'
    check (dono in ('educador', 'casa')),
  add column if not exists checkout_externo_url text;

alter table public.marketplace_produtos alter column educator_id drop not null;

-- A afirmação que não se pode perder: um produto de educador TEM educador. Um da casa não tem.
alter table public.marketplace_produtos drop constraint if exists marketplace_produtos_dono_coerente;
alter table public.marketplace_produtos add constraint marketplace_produtos_dono_coerente
  check (
    (dono = 'educador' and educator_id is not null) or
    (dono = 'casa'     and educator_id is null)
  );

-- A compra de um produto da casa não tem educador a quem pagar. A coluna existe na mesma (a
-- esmagadora maioria das vendas terá lá alguém) mas deixa de ser obrigatória.
alter table public.marketplace_compras alter column educator_id drop not null;

-- O extracto e a lista de payouts perguntam sempre «as vendas DESTE educador»; as da casa não
-- entram em extracto nenhum, e um índice parcial não as carrega.
create index if not exists marketplace_compras_educador_real_idx
  on public.marketplace_compras (educator_id, pago_em desc)
  where educator_id is not null;

-- A montra filtra por categoria a toda a hora; sem isto é uma varredura da tabela por clique.
create index if not exists marketplace_produtos_categoria_idx
  on public.marketplace_produtos (tipo, publicado_em desc)
  where estado = 'publicado' and activo;

-- ── 4. Campanhas ──────────────────────────────────────────────────────────────────────────

alter table public.marketplace_produtos
  -- 0 = não há campanha. O limite superior é 90 e não 100 de propósito: um produto a 100% de
  -- desconto não é uma campanha, é uma oferta, e uma oferta faz-se com uma compra de fonte
  -- 'oferta' (que já existe) e não com um checkout de zero euros que o Stripe recusa.
  add column if not exists campanha_pct numeric(5,2) not null default 0
    check (campanha_pct >= 0 and campanha_pct <= 90),
  -- Nulo nos dois lados = a campanha vale desde já e não acaba. É o caso do desconto permanente
  -- de membro, que é uma campanha sem prazo e não um caso à parte.
  add column if not exists campanha_inicio timestamptz,
  add column if not exists campanha_fim timestamptz,
  -- Quem apanha o desconto. Os valores são os de `perfil-ui.ts`, não um vocabulário novo.
  add column if not exists campanha_tier text not null default 'app_member'
    check (campanha_tier in ('all', 'app_member', 'premium', 'vip')),
  add column if not exists campanha_stripe_coupon_id text;

-- Uma campanha ao contrário (acaba antes de começar) nunca se aplica a ninguém e ninguém percebe
-- porquê. Mais vale não deixar gravar.
alter table public.marketplace_produtos drop constraint if exists marketplace_produtos_campanha_ordem;
alter table public.marketplace_produtos add constraint marketplace_produtos_campanha_ordem
  check (campanha_inicio is null or campanha_fim is null or campanha_fim > campanha_inicio);

comment on column public.marketplace_produtos.campanha_pct is
  'Desconto automático em %, 0 = nenhum. Aplica-se sozinho a quem tem o tier; não é um código.';

-- ── 5. O funil por dentro ─────────────────────────────────────────────────────────────────

create table if not exists public.marketplace_leads (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid references public.marketplace_produtos(id) on delete set null,
  -- Nulo quando ainda não sabemos quem é. A montra está atrás de login hoje, mas o dia em que
  -- abrir ao público é o dia em que isto passa a ser a coluna mais interessante da tabela.
  user_id uuid references public.profiles(id) on delete set null,
  email text,
  etapa text not null check (etapa in (
    'viu_montra',      -- entrou no /marketplace
    'viu_ficha',       -- abriu a ficha de um produto
    'iniciou_checkout',-- clicou em comprar e a sessão Stripe foi criada
    'pagou',           -- o webhook confirmou
    'desistiu'         -- voltou pelo cancel_url
  )),
  -- O id da sessão Stripe, quando há. É o que liga 'iniciou_checkout' a 'pagou' e o que permite
  -- responder «quantos começaram e não acabaram» sem adivinhar.
  referencia text,
  origem text,
  contexto jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists marketplace_leads_produto_idx
  on public.marketplace_leads (produto_id, etapa, created_at desc);
create index if not exists marketplace_leads_pessoa_idx
  on public.marketplace_leads (user_id, created_at desc);
create index if not exists marketplace_leads_referencia_idx
  on public.marketplace_leads (referencia)
  where referencia is not null;

comment on table public.marketplace_leads is
  'Cada passo do funil de compra do marketplace. Só escrito pelo servidor; ninguém lê por RLS.';

-- ── RLS ───────────────────────────────────────────────────────────────────────────────────
--
-- Fechada, e sem uma única política de leitura. Isto é um registo de comportamento de pessoas: o
-- dono lê-o por rota de admin, com a chave de serviço. Não há caso nenhum em que o browser de
-- alguém precise de ver por onde os outros andaram.

alter table public.marketplace_leads enable row level security;
revoke all on public.marketplace_leads from anon, authenticated;
