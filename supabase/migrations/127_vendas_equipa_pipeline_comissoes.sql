-- 127 · Equipa de vendas: pipeline, tarefas, regras de comissão e livro de comissões
--
-- PORQUÊ
-- Até aqui só havia UMA forma de alguém ganhar dinheiro com uma venda: o MLM binário
-- (`mlm_nodes` + `mlm_commissions`), que paga a quem PATROCINOU o comprador. Isso não descreve
-- uma equipa de vendas: numa venda feita por equipa há um prospector que a encontrou, um setter
-- que marcou a reunião, um closer que fechou e um team leader por cima — quatro pessoas
-- diferentes do patrocinador, e nenhuma delas tem sítio na árvore binária.
--
-- O dono decidiu manter as DUAS coisas a par: o MLM fica como está, e a equipa por papéis nasce
-- ao lado. O que NÃO pode haver são dois extractos: quem recebe tem de ver num só sítio o que
-- ganhou, de onde veio e o que já foi pago. Daí a vista `vendas_extracto` no fim deste ficheiro,
-- que soma as duas origens sem as misturar.
--
-- AS REGRAS DO DINHEIRO, escritas onde vivem os dados
--
--  1. ZERO números no código. As percentagens são do dono e vivem em `vendas_regras_comissao`.
--     Sem regra para um (papel, pack), não se calcula nada e diz-se porquê — nunca se inventa
--     uma percentagem por defeito. Uma comissão calculada com um número que ninguém decidiu é
--     uma dívida que o dono não sabe que tem.
--
--  2. Mudar uma percentagem HOJE não reescreve o que foi calculado ONTEM. As regras são
--     IMUTÁVEIS: editar = fechar a linha em vigor (`valido_ate`) e inserir outra. Cada comissão
--     guarda o `regra_id` E a percentagem com que foi feita — se a regra mudar, o histórico não
--     muda com ela.
--
--  3. Uma comissão só nasce de um PAGAMENTO CONFIRMADO. É por isso que existe `vendas_vendas`:
--     uma venda é uma linha que só aparece quando o Stripe (ou a Apple, ou um registo manual
--     com prova) confirma que o dinheiro entrou. O estado do negócio no ecrã não cria dinheiro.
--
--  4. Devolução e chargeback REVERTEM. `vendas_vendas.estornada_em` marca a venda e as comissões
--     dela passam a 'estornada'. Se já tinham sido pagas, ficam pagas E marcadas — vira um valor
--     a descontar no próximo pagamento, que é a verdade, em vez de um pagamento a fingir que não
--     aconteceu. Um sistema que só sabe somar acaba a pagar sobre dinheiro devolvido.
--
--  5. Nunca se paga sozinho. Não há aqui nada que passe uma comissão a 'paga' — só a acção
--     humana no admin o faz, e `vendas_comissoes_historico` guarda quem, quando e de que estado
--     para qual.
--
-- MOEDA E ARREDONDAMENTO: tudo em CÊNTIMOS INTEIROS (`_cents`), nunca em euros decimais. O
-- arredondamento é meio-para-cima e faz-se UMA vez, no cálculo de cada comissão
-- (`lib/vendas/calculo.ts`). Cêntimos perdidos entre floats viram queixas de quem recebe.
--
-- PAPÉIS: os nomes ('afiliado','setter','closer','prospector','team_leader') estão em CHECK e
-- não em tabela própria de propósito — quem manda nos papéis de cada PESSOA é o backoffice de
-- permissões (outro lado da casa). Aqui só se guarda o papel COM QUE alguém participou nesta
-- venda, que é um facto histórico e não uma permissão: retirar o papel de closer a alguém amanhã
-- não pode apagar que foi ele que fechou esta venda.

begin;

-- ═══════════════════════════ 1. O NEGÓCIO (pipeline) ═══════════════════════════
--
-- Um negócio é o percurso de uma pessoa do lead ao fecho, e sobretudo QUEM fez o quê — é esta
-- atribuição que depois paga. Os cinco papéis ficam em colunas e não numa tabela-ponte porque
-- são exactamente cinco, um de cada, e a pergunta que se faz é sempre "quem fechou este".

create table if not exists public.vendas_negocios (
  id            uuid primary key default gen_random_uuid(),

  -- QUEM se está a vender. O comprador pode ainda não ter conta no site (é o caso normal no
  -- início do funil), por isso o identificador humano vive aqui e o `comprador_id` só aparece
  -- quando a conta existe.
  nome          text        not null,
  email         text,
  telefone      text,
  telegram_id   text,
  comprador_id  uuid references public.profiles(id) on delete set null,

  -- O QUE se espera vender. É o `planId` da escada (`lib/stripe-prices.ts`) e serve para
  -- previsão; o pack que PAGA é o que vier na venda confirmada, não este.
  pack_previsto text,

  -- ONDE começou (instagram, telegram, indicação, evento…). Texto livre: a lista de origens
  -- muda todas as semanas e um CHECK aqui só daria erros no admin.
  origem        text,

  -- ATRIBUIÇÃO — quem paga a quem. Nenhum é obrigatório: há vendas em que ninguém prospectou
  -- (chegou sozinha) e vendas sem setter (o closer marcou e fechou). Um campo vazio é "não
  -- houve", e não se paga nada por ele.
  prospector_id  uuid references public.profiles(id) on delete set null,
  setter_id      uuid references public.profiles(id) on delete set null,
  closer_id      uuid references public.profiles(id) on delete set null,
  team_leader_id uuid references public.profiles(id) on delete set null,
  -- O afiliado é o quinto papel e vive aqui pelo mesmo motivo dos outros: quem trouxe o lead com
  -- o seu link tem direito à sua percentagem por pack, e isso é diferente do patrocinador da
  -- árvore binária (que continua a ser pago pelo MLM). A mesma pessoa pode ser as duas coisas e
  -- receber pelas duas — o extracto único mostra as duas linhas com a origem à vista.
  afiliado_id    uuid references public.profiles(id) on delete set null,

  -- O ESTADO, por ordem de avanço. 'ganho' NÃO significa que entrou dinheiro — significa que o
  -- closer diz que fechou. O dinheiro é `vendas_vendas`.
  estado        text        not null default 'lead'
    check (estado in ('lead','contactado','qualificado','marcado','no_show','apresentado','ganho','perdido')),
  -- Porque se perdeu. Um pipeline sem motivos de perda não ensina nada a quem vende.
  motivo_perda  text,

  nota          text,
  criado_por    uuid references public.profiles(id) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  fechado_em    timestamptz
);

-- As duas leituras que o backoffice faz sempre: o pipeline por estado, e "os meus negócios".
create index if not exists idx_vendas_negocios_estado on public.vendas_negocios (estado, atualizado_em desc);
create index if not exists idx_vendas_negocios_closer on public.vendas_negocios (closer_id, atualizado_em desc);
create index if not exists idx_vendas_negocios_setter on public.vendas_negocios (setter_id, atualizado_em desc);
create index if not exists idx_vendas_negocios_comprador on public.vendas_negocios (comprador_id);

-- O PERCURSO. Sem isto o negócio só sabe onde está, e a pergunta que se faz a uma equipa é
-- quanto tempo levou de marcado a fechado, e quem o mexeu.
create table if not exists public.vendas_negocio_eventos (
  id         bigserial primary key,
  negocio_id uuid        not null references public.vendas_negocios(id) on delete cascade,
  de         text,
  para       text        not null,
  por        uuid references public.profiles(id) on delete set null,
  nota       text,
  em         timestamptz not null default now()
);
create index if not exists idx_vendas_negocio_eventos_negocio
  on public.vendas_negocio_eventos (negocio_id, em desc);

-- ═══════════════════════════ 2. TAREFAS ═══════════════════════════
--
-- O que cada pessoa tem para fazer e o que já fez. Deliberadamente pequeno: não é um CRM, é a
-- lista de quem vende. Ligar a um negócio é opcional — "ligar ao João" é uma tarefa de negócio,
-- "ver a formação de objecções" não é.

create table if not exists public.vendas_tarefas (
  id            uuid primary key default gen_random_uuid(),
  titulo        text        not null,
  descricao     text,
  responsavel_id uuid       not null references public.profiles(id) on delete cascade,
  negocio_id    uuid references public.vendas_negocios(id) on delete set null,
  -- Com que papel esta tarefa conta (um setter e um closer têm listas diferentes no mesmo negócio).
  papel         text check (papel in ('afiliado','setter','closer','prospector','team_leader')),
  prazo         date,
  estado        text        not null default 'aberta' check (estado in ('aberta','feita','cancelada')),
  feita_em      timestamptz,
  criado_por    uuid references public.profiles(id) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- A lista de uma pessoa lê-se sempre igual: as abertas, as mais urgentes primeiro.
create index if not exists idx_vendas_tarefas_pessoa
  on public.vendas_tarefas (responsavel_id, estado, prazo nulls last);
create index if not exists idx_vendas_tarefas_negocio on public.vendas_tarefas (negocio_id);

-- ═══════════════════════════ 3. REGRAS DE COMISSÃO ═══════════════════════════
--
-- Papel × pack × percentagem, decidido pelo dono no admin. IMUTÁVEL: a linha em vigor é a que
-- tem `valido_ate` nulo; mudar a percentagem fecha essa e abre outra. Assim uma comissão de
-- Setembro continua a poder ser explicada com a regra de Setembro.
--
-- `pack = '*'` significa TODOS os packs, e é uma escolha explícita do dono no admin — não um
-- valor por defeito do código. Na resolução, a regra do pack exacto ganha sempre à do '*'.

create table if not exists public.vendas_regras_comissao (
  id          uuid primary key default gen_random_uuid(),
  papel       text        not null
    check (papel in ('afiliado','setter','closer','prospector','team_leader')),
  -- planId da escada (ex: 'premium_monthly', 'elite_annual') ou '*' para todos.
  pack        text        not null,
  -- Percentagem sobre o valor da venda. NUMERIC e não float: 12.5 tem de ser 12,5 exactamente.
  pct         numeric(6,3) not null check (pct >= 0 and pct <= 100),
  -- Se a regra se aplica a renovações, a primeiras compras, ou às duas. Quem fecha uma venda
  -- nova e quem a mantém viva não recebem necessariamente o mesmo.
  aplica_a    text        not null default 'ambos' check (aplica_a in ('primeira','renovacao','ambos')),
  valido_de   timestamptz not null default now(),
  valido_ate  timestamptz,
  nota        text,
  criado_por  uuid references public.profiles(id) on delete set null,
  criado_em   timestamptz not null default now()
);

-- SÓ UMA regra em vigor por (papel, pack, aplica_a). Duas regras vivas para o mesmo caso é uma
-- discussão futura sobre qual delas contava.
create unique index if not exists uq_vendas_regras_em_vigor
  on public.vendas_regras_comissao (papel, pack, aplica_a)
  where valido_ate is null;

create index if not exists idx_vendas_regras_historico
  on public.vendas_regras_comissao (papel, pack, valido_de desc);

-- ═══════════════════════════ 4. A VENDA CONFIRMADA ═══════════════════════════
--
-- Esta tabela é a fronteira entre "achamos que vendemos" e "entrou dinheiro". Nada a escreve
-- senão um pagamento confirmado: o webhook do Stripe, a Apple, ou um registo manual que o admin
-- assume (`fonte='manual'`, com nota — porque um lançamento manual sem rasto é uma comissão que
-- ninguém consegue explicar).
--
-- A unicidade (fonte, referencia) é o que torna o webhook seguro: o Stripe reenvia eventos, e
-- reenviar não pode pagar duas vezes.

create table if not exists public.vendas_vendas (
  id            uuid primary key default gen_random_uuid(),
  fonte         text        not null check (fonte in ('stripe','apple','manual')),
  -- checkout session id, invoice id, transaction id da Apple, ou uma referência que o admin dá.
  referencia    text        not null,
  comprador_id  uuid references public.profiles(id) on delete set null,
  negocio_id    uuid references public.vendas_negocios(id) on delete set null,
  -- O pack que foi PAGO (planId). É este que escolhe a regra, não o `pack_previsto` do negócio.
  pack          text,
  -- Valor bruto recebido, em cêntimos. Bruto e não líquido: as taxas do Stripe não se descontam
  -- porque as percentagens que o dono define já são pensadas sobre o preço anunciado. Se ele
  -- decidir o contrário, muda-se aqui e diz-se ao livro — mas tem de ser uma decisão, não um
  -- detalhe que ninguém viu.
  valor_cents   integer     not null check (valor_cents >= 0),
  moeda         text        not null default 'EUR',
  -- 'primeira' compra ou 'renovacao' — muda a regra que se aplica.
  tipo          text        not null default 'primeira' check (tipo in ('primeira','renovacao')),
  pago_em       timestamptz not null default now(),
  -- DEVOLUÇÃO / CHARGEBACK. Marcar aqui é o que dispara a reversão das comissões.
  estornada_em  timestamptz,
  estorno_motivo text,
  estorno_cents integer check (estorno_cents >= 0),
  nota          text,
  criado_em     timestamptz not null default now()
);

create unique index if not exists uq_vendas_vendas_referencia
  on public.vendas_vendas (fonte, referencia);
create index if not exists idx_vendas_vendas_pack on public.vendas_vendas (pack, pago_em desc);
create index if not exists idx_vendas_vendas_comprador on public.vendas_vendas (comprador_id, pago_em desc);
create index if not exists idx_vendas_vendas_negocio on public.vendas_vendas (negocio_id);

-- ═══════════════════════════ 5. O LIVRO DE COMISSÕES (papéis) ═══════════════════════════
--
-- Uma linha por (venda × papel × pessoa). Guarda a regra e a percentagem COM QUE foi feita: é
-- isto que permite responder a "porque é que recebi 39 € e não 45 €" um ano depois.

create table if not exists public.vendas_comissoes (
  id            uuid primary key default gen_random_uuid(),
  venda_id      uuid        not null references public.vendas_vendas(id) on delete cascade,
  negocio_id    uuid references public.vendas_negocios(id) on delete set null,
  beneficiario_id uuid      not null references public.profiles(id) on delete cascade,
  papel         text        not null
    check (papel in ('afiliado','setter','closer','prospector','team_leader')),

  -- O RASTO DO CÁLCULO. base × pct = valor, com a regra identificada.
  regra_id      uuid references public.vendas_regras_comissao(id) on delete set null,
  pct           numeric(6,3) not null,
  base_cents    integer     not null check (base_cents >= 0),
  valor_cents   integer     not null check (valor_cents >= 0),
  moeda         text        not null default 'EUR',

  estado        text        not null default 'pendente'
    check (estado in ('pendente','aprovada','paga','cancelada','estornada')),
  aprovada_em   timestamptz,
  aprovada_por  uuid references public.profiles(id) on delete set null,
  paga_em       timestamptz,
  paga_por      uuid references public.profiles(id) on delete set null,
  -- Como foi pago fora do sistema (transferência, MB Way, nota de crédito). O sistema propõe;
  -- pagar é um acto humano, e este campo é o recibo dele.
  pagamento_ref text,
  -- Devolução depois de já estar paga: fica paga E marcada, e o valor passa a descontar no
  -- próximo pagamento. Ver `vendas_extracto`.
  estornada_em  timestamptz,
  estorno_motivo text,
  nota          text,
  criado_em     timestamptz not null default now()
);

-- Uma pessoa não recebe duas vezes pelo mesmo papel na mesma venda.
create unique index if not exists uq_vendas_comissoes_venda_papel
  on public.vendas_comissoes (venda_id, papel, beneficiario_id);
create index if not exists idx_vendas_comissoes_pessoa
  on public.vendas_comissoes (beneficiario_id, criado_em desc);
create index if not exists idx_vendas_comissoes_estado
  on public.vendas_comissoes (estado, criado_em desc);

-- O RASTO DOS ESTADOS. Quem aprovou, quem pagou, quem cancelou — e quando. Uma comissão sem
-- rasto é uma discussão futura com uma pessoa da equipa.
create table if not exists public.vendas_comissoes_historico (
  id           bigserial primary key,
  comissao_id  uuid        not null references public.vendas_comissoes(id) on delete cascade,
  de           text,
  para         text        not null,
  por          uuid references public.profiles(id) on delete set null,
  nota         text,
  em           timestamptz not null default now()
);
create index if not exists idx_vendas_comissoes_historico_comissao
  on public.vendas_comissoes_historico (comissao_id, em desc);

-- ═══════════ 6. O MLM ganha marca de estorno (sem lhe mudar o funcionamento) ═══════════
--
-- O MLM já sabia somar e pagar; não sabia devolver. Uma devolução no Stripe deixava a comissão
-- do patrocinador de pé sobre dinheiro que voltou para o cliente. Duas colunas resolvem-no sem
-- tocar em nada do que já funciona: quem ainda não recebeu passa a 'cancelled' (estado que a
-- tabela já tem), quem já recebeu fica marcado aqui.
alter table public.mlm_commissions
  add column if not exists estornada_em   timestamptz,
  add column if not exists estorno_motivo text;

-- ═══════════════════════════ 7. O EXTRACTO ÚNICO ═══════════════════════════
--
-- O pedido do dono: «uma pessoa pode ganhar pelos dois, mas tem de ver UM só extracto». Esta
-- vista junta as duas origens sem as confundir — `origem` diz de onde veio cada linha, e o
-- valor vem sempre em cêntimos (o MLM guarda euros decimais; converte-se aqui, num sítio só).
--
-- `sinal` é +1 no que se ganha e -1 no que foi estornado DEPOIS de pago: é assim que o saldo de
-- uma pessoa reflecte uma devolução em vez de a esconder.
create or replace view public.vendas_extracto as
  select
    c.id::text                                  as id,
    'papel'::text                               as origem,
    c.papel                                     as detalhe,
    c.beneficiario_id                            as pessoa_id,
    c.valor_cents                                as valor_cents,
    c.moeda                                      as moeda,
    c.estado                                     as estado,
    c.criado_em                                  as em,
    c.paga_em                                    as paga_em,
    c.estornada_em                               as estornada_em,
    case when c.estornada_em is not null and c.paga_em is not null then -1 else 1 end as sinal,
    v.pack                                       as pack,
    v.referencia                                 as referencia
  from public.vendas_comissoes c
  join public.vendas_vendas v on v.id = c.venda_id
  union all
  select
    m.id::text                                  as id,
    'mlm'::text                                 as origem,
    m.type                                      as detalhe,
    m.beneficiary_id                            as pessoa_id,
    round(coalesce(m.amount, 0) * 100)::integer as valor_cents,
    coalesce(m.currency, 'EUR')                 as moeda,
    m.status                                    as estado,
    m.created_at                                as em,
    m.paid_at                                   as paga_em,
    m.estornada_em                              as estornada_em,
    case when m.estornada_em is not null and m.paid_at is not null then -1 else 1 end as sinal,
    m.source_plan                               as pack,
    coalesce(m.stripe_session_id, m.stripe_invoice_id) as referencia
  from public.mlm_commissions m;

-- ═══════════════════════════ 8. RLS ═══════════════════════════
--
-- Tudo fechado: só o service_role escreve e lê (as rotas do admin e o webhook). A chave anon vai
-- no JavaScript do site — quem ganha quanto não é coisa que se sirva ao browser. Quem pode ver o
-- extracto de quem decide-se nas rotas, com os papéis do backoffice de permissões.
alter table public.vendas_negocios           enable row level security;
alter table public.vendas_negocio_eventos    enable row level security;
alter table public.vendas_tarefas            enable row level security;
alter table public.vendas_regras_comissao    enable row level security;
alter table public.vendas_vendas             enable row level security;
alter table public.vendas_comissoes          enable row level security;
alter table public.vendas_comissoes_historico enable row level security;

revoke all on public.vendas_negocios            from anon, authenticated;
revoke all on public.vendas_negocio_eventos     from anon, authenticated;
revoke all on public.vendas_tarefas             from anon, authenticated;
revoke all on public.vendas_regras_comissao     from anon, authenticated;
revoke all on public.vendas_vendas              from anon, authenticated;
revoke all on public.vendas_comissoes           from anon, authenticated;
revoke all on public.vendas_comissoes_historico from anon, authenticated;
revoke all on public.vendas_extracto            from anon, authenticated;

commit;

-- NOTA PARA QUEM APLICA: não se semeia NENHUMA regra de comissão aqui de propósito. As
-- percentagens são do dono e ele ainda não as definiu. Uma linha semeada com um número
-- inventado seria pior do que tabela vazia: passava a pagar-se sobre ela sem ninguém decidir.
