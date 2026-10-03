-- O MARKETPLACE DOS EDUCADORES — onde um membro compra o produto de OUTRA pessoa.
--
-- PORQUE É QUE ISTO EXISTE
--
-- A landing /criadores promete, por escrito e em público: «alojamos e vendemos o teu curso ou
-- mentoria e ficas com 90–95% do que vender, sem entrada e sem exclusividade». Essa promessa não
-- tinha uma única linha de código por trás. O conteúdo dos educadores vive hoje em
-- `lms_educator_playlists` — links, com um `access_tier` — e o educador não recebe nada por venda:
-- o membro paga a subscrição MTM e o educador entra no pacote. Quem lê a landing e se candidata
-- está a candidatar-se a uma coisa que não existia.
--
-- Isto é essa coisa. Tudo aqui é sobre produtos que NÃO são da casa.
--
-- AS QUATRO TABELAS, E PORQUE SÃO QUATRO
--
--   marketplace_educadores — quem vende, e o interruptor dele. Uma linha por educador que vende.
--     Separada de `lms_educators` de propósito: ser educador (dar aulas ao vivo) e ser vendedor
--     (ter produtos à venda) são duas decisões diferentes, e três dos cinco educadores vivos hoje
--     são contas da casa (fitness@, social@, mindset@) que não vendem nada de ninguém. Uma coluna
--     `vende` em `lms_educators` obrigava a responder por todos.
--
--   marketplace_produtos — o produto. Rascunho → em revisão → publicado → retirado.
--
--   marketplace_compras — o que foi vendido, a quem, e por quanto. É ao mesmo tempo o recibo, a
--     chave de acesso do comprador e o livro-razão da partilha. Uma tabela e não três porque as
--     três perguntas ("ele comprou?", "quanto recebe o educador?", "quanto ficou para a casa?")
--     respondem-se todas com a mesma linha, e separá-las era convidá-las a discordar.
--
--   marketplace_payouts — o que já foi pago ao educador. Não paga nada: regista.
--
-- A PARTILHA FICA CONGELADA NA COMPRA
--
-- `parte_educador_pct` é copiada para a linha da compra no momento em que ela acontece. Se o
-- educador renegociar de 90 para 95 amanhã, as vendas de ontem continuam a valer o que valiam
-- ontem. Um extracto que muda sozinho quando alguém edita uma percentagem não é um extracto.
--
-- `comissao_loja_cents` existe para o caso Apple. Quando a venda passa pela App Store, a Apple
-- leva 15–30% ANTES de o dinheiro chegar cá, e os 90–95% do educador têm de ser calculados sobre
-- o que sobrou — senão a casa paga do bolso a comissão da Apple. É a mesma decomposição que a
-- `mtmauto_revenue_ledger` já faz (bruto → comissão da loja → líquido → parte), e é de lá que
-- este desenho vem.
--
-- RLS EM TODAS. A regra da casa depois dos incidentes das tabelas abertas: nenhuma tabela nova
-- nasce legível por `anon`. A vitrine pública é servida por rotas com chave de serviço, que
-- filtram o que se mostra; o `conteudo_url` de um produto pago NUNCA sai numa listagem.

-- ── Quem vende ────────────────────────────────────────────────────────────────────────────

create table if not exists public.marketplace_educadores (
  educator_id uuid primary key references public.lms_educators(id) on delete cascade,
  -- O interruptor por educador. Nasce DESLIGADO: um educador criado para dar aulas não passa a
  -- vendedor por ter sido criado. Quem o liga é o dono, no admin.
  activo boolean not null default false,
  -- 90–95 é o intervalo prometido. O valor de nascença é 95: entre dois números prometidos em
  -- público, o que se aplica por omissão é o que favorece o educador. Baixar é uma decisão que
  -- alguém tem de tomar à mão, produto a produto ou educador a educador.
  partilha_pct numeric(5,2) not null default 95 check (partilha_pct >= 90 and partilha_pct <= 100),
  -- Conta Stripe Connect do educador (o mesmo mecanismo Express que os afiliados já usam).
  -- Vazia = ainda não há para onde transferir, e o payout fica retido em vez de falhar.
  stripe_connect_account_id text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.marketplace_educadores is
  'Quem vende no marketplace e com que partilha. Nasce desligado; o dono liga no /admin/centro.';

-- ── O produto ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.marketplace_produtos (
  id uuid primary key default gen_random_uuid(),
  educator_id uuid not null references public.lms_educators(id) on delete cascade,
  -- O slug é o endereço público (/marketplace/o-meu-curso). Único porque é um endereço.
  slug text not null unique,
  titulo text not null,
  subtitulo text,
  descricao text,
  tipo text not null default 'curso' check (tipo in ('curso','mentoria','ebook','comunidade','outro')),
  imagem_url text,
  -- Preço em cêntimos, como em todo o resto da casa (Stripe, livro de vendas, revenue ledger).
  -- Gratuito (0) é permitido de propósito: um produto de entrada do educador continua a precisar
  -- de uma linha de compra para o acesso funcionar da mesma maneira.
  preco_cents integer not null default 0 check (preco_cents >= 0),
  moeda text not null default 'eur',
  -- Para onde vai o comprador depois de pagar. NUNCA sai numa listagem pública — só na rota de
  -- acesso, e só a quem tem uma compra.
  conteudo_url text,
  conteudo_nota text,
  estado text not null default 'rascunho'
    check (estado in ('rascunho','em_revisao','publicado','retirado')),
  -- Partilha deste produto. Null = herda a do educador. Existir permite ao dono negociar um
  -- produto em particular sem mexer no acordo geral da pessoa.
  partilha_pct numeric(5,2) check (partilha_pct >= 90 and partilha_pct <= 100),
  -- O terceiro interruptor (global, por educador, por produto). Este é do dono: retirar um
  -- produto de circulação sem o apagar e sem mudar o estado que o educador vê.
  activo boolean not null default true,
  -- Preenchidos pelo dono quando ligar a cobrança a sério. Vazios = não há caminho de compra.
  stripe_price_id text,
  apple_product_id text,
  revisto_por uuid,
  revisto_em timestamptz,
  motivo_recusa text,
  publicado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_produtos_educador_idx
  on public.marketplace_produtos (educator_id, estado);
-- A vitrine pergunta sempre a mesma coisa: o que está publicado e ligado, mais recente primeiro.
create index if not exists marketplace_produtos_vitrine_idx
  on public.marketplace_produtos (publicado_em desc)
  where estado = 'publicado' and activo;

comment on column public.marketplace_produtos.conteudo_url is
  'O que o comprador recebe. Só sai pela rota de acesso, e só a quem tem compra paga.';

-- ── A compra: recibo, chave de acesso e livro-razão na mesma linha ────────────────────────

create table if not exists public.marketplace_compras (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.marketplace_produtos(id) on delete restrict,
  -- Desnormalizado de propósito: é a quem se paga ESTA venda. Se o produto mudar de dono, ou for
  -- apagado, o extracto de quem vendeu não pode mudar de ideias.
  educator_id uuid not null references public.lms_educators(id) on delete restrict,
  comprador_id uuid not null references public.profiles(id) on delete cascade,
  fonte text not null check (fonte in ('stripe','apple','manual','oferta')),
  -- Idempotência. É o id da sessão Stripe / a transacção Apple / o que o admin escreveu. O
  -- webhook do Stripe reentrega o mesmo evento quando a nossa resposta demora: sem isto, o
  -- educador via a mesma venda duas vezes e o comprador pagava uma.
  referencia text not null,
  estado text not null default 'paga' check (estado in ('paga','reembolsada','anulada')),
  bruto_cents integer not null default 0 check (bruto_cents >= 0),
  comissao_loja_cents integer not null default 0 check (comissao_loja_cents >= 0),
  liquido_cents integer not null default 0 check (liquido_cents >= 0),
  -- Congelada no momento da venda (ver o cabeçalho).
  parte_educador_pct numeric(5,2) not null default 95,
  parte_educador_cents integer not null default 0 check (parte_educador_cents >= 0),
  parte_casa_cents integer not null default 0 check (parte_casa_cents >= 0),
  moeda text not null default 'eur',
  -- Null = acesso sem fim. Uma mentoria de 3 meses põe data aqui.
  acesso_expira_em timestamptz,
  pago_em timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists marketplace_compras_referencia_idx
  on public.marketplace_compras (fonte, referencia);
-- «Este membro já comprou isto?» é a pergunta mais feita do marketplace: é ela que decide se a
-- ficha do produto mostra «Comprar» ou «Abrir».
create index if not exists marketplace_compras_comprador_idx
  on public.marketplace_compras (comprador_id, produto_id);
create index if not exists marketplace_compras_educador_idx
  on public.marketplace_compras (educator_id, pago_em desc);

-- ── O que já foi pago ao educador ─────────────────────────────────────────────────────────

create table if not exists public.marketplace_payouts (
  id uuid primary key default gen_random_uuid(),
  educator_id uuid not null references public.lms_educators(id) on delete restrict,
  periodo_inicio date not null,
  periodo_fim date not null,
  total_cents integer not null default 0 check (total_cents >= 0),
  moeda text not null default 'eur',
  -- Nasce pendente e fica pendente até alguém aprovar. A mesma doutrina do livro de vendas da
  -- equipa: nada aqui paga sozinho.
  estado text not null default 'pendente' check (estado in ('pendente','aprovado','pago','anulado')),
  transferencia_stripe text,
  aprovado_por uuid,
  aprovado_em timestamptz,
  pago_em timestamptz,
  nota text,
  created_at timestamptz not null default now()
);

create index if not exists marketplace_payouts_educador_idx
  on public.marketplace_payouts (educator_id, periodo_fim desc);

-- ── RLS ───────────────────────────────────────────────────────────────────────────────────
--
-- Fechado por omissão nas quatro. A chave de serviço ignora RLS e é por ela que todas as rotas
-- passam; o que fica aqui é o que acontece se alguém apontar a chave `anon` (que está no bundle
-- do browser) a estas tabelas — e a resposta tem de ser «nada».
--
-- A ÚNICA excepção é o comprador ver as compras dele. Não porque o site precise (as rotas usam
-- service role), mas porque é a afirmação que queremos presa no schema: as compras de uma pessoa
-- são dela. Se amanhã alguém ligar o PostgREST à tabela, é esta a regra que fica de pé.

alter table public.marketplace_educadores enable row level security;
alter table public.marketplace_produtos   enable row level security;
alter table public.marketplace_compras    enable row level security;
alter table public.marketplace_payouts    enable row level security;

revoke all on public.marketplace_educadores from anon, authenticated;
revoke all on public.marketplace_produtos   from anon, authenticated;
revoke all on public.marketplace_compras    from anon, authenticated;
revoke all on public.marketplace_payouts    from anon, authenticated;

grant select on public.marketplace_compras to authenticated;

drop policy if exists marketplace_compras_do_dono on public.marketplace_compras;
create policy marketplace_compras_do_dono
  on public.marketplace_compras
  for select
  to authenticated
  using (comprador_id = auth.uid());

-- ── O interruptor geral ───────────────────────────────────────────────────────────────────
--
-- Em `site_settings`, como todos os outros da casa. Nasce desligado: um marketplace vazio que
-- aparece no menu ensina quem lá entra que o menu mente.
--
-- `ios_vitrine` é a decisão da Apple, escrita onde se pode mudar sem deploy:
--   'ver_sem_comprar' — mostra os produtos na app iOS sem qualquer caminho de compra (é o que o
--                       /live já faz com as aulas pagas, e passou revisão);
--   'esconder'        — o separador nem aparece na app iOS.
-- Não existe uma terceira opção que abra checkout externo dentro da app. É a 3.1.1.

insert into public.site_settings (key, value, description)
values (
  'marketplace',
  '{"ligado": false, "revisao_obrigatoria": true, "ios_vitrine": "ver_sem_comprar"}'::jsonb,
  'Marketplace dos educadores: interruptor geral, revisão de produtos e comportamento na app iOS.'
)
on conflict (key) do nothing;
