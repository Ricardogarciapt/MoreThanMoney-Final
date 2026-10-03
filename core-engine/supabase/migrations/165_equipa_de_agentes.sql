-- 165 — A EQUIPA DE AGENTES
--
-- Um CEO que trabalha com o Ricardo, e sub-agentes repartidos por três pilares: Trading, Educação,
-- Desenvolvimento. Cada um tem orçamento, mede-se pelo que traz, e pára se não se pagar.
--
-- ═══ PORQUE É QUE «PARADO» E NÃO «APAGADO» ═══════════════════════════════════════════════
--
-- O pedido era que o agente se apagasse. O efeito é o mesmo — deixa de trabalhar e de gastar —
-- mas a linha fica. Três razões:
--  · a medição de receita vai errar alguma vez, e um agente bom cujo cupão ninguém usou parece
--    inútil nos números. Parado volta com um clique; apagado não volta;
--  · apagar é irreversível e nunca é só o que se pensa;
--  · o histórico é o que ensina: três agentes de conteúdo mortos ao segundo dia dizem que o
--    problema era o pilar, não o agente. Sem histórico, repete-se a experiência.
create table if not exists public.agentes_equipa (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  papel text not null,
  pilar text not null check (pilar in ('ceo','trading','educacao','desenvolvimento')),
  -- Quem o criou: o CEO cria sub-agentes, um sub-agente lucrativo clona-se.
  pai_id uuid references public.agentes_equipa(id) on delete set null,
  estado text not null default 'vivo' check (estado in ('vivo','em_risco','parado','pausado')),
  -- Pausado PELO DONO. É diferente de parado: a regra das 48 h não corre em agentes pausados,
  -- porque a supervisão humana ganha sempre à regra automática.
  pausado boolean not null default false,
  instrucoes text,
  -- Contabilidade em dólares. Ninguém transfere nada: isto mede, não paga.
  orcamento numeric(12,2) not null default 10,
  gasto numeric(12,2) not null default 0,
  receita numeric(12,2) not null default 0,
  -- Como é que a receita deste agente se reconhece no Stripe. Sem isto a receita é SEMPRE zero, e
  -- um agente sem forma de ser medido não devia nascer.
  chave_receita text,
  avaliado_em timestamptz,
  parado_em timestamptz,
  parado_porque text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- O livro do que aconteceu a cada agente: nasceu, gastou, vendeu, foi avisado, parou.
-- Separado da linha do agente de propósito: a linha diz como ele está AGORA, o livro diz porquê.
create table if not exists public.agentes_eventos (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid not null references public.agentes_equipa(id) on delete cascade,
  tipo text not null check (tipo in ('nasceu','gastou','receita','avaliado','avisado','parou','retomado','clonou','trabalho')),
  valor numeric(12,2),
  detalhe text,
  criado_em timestamptz not null default now()
);

alter table public.agentes_equipa enable row level security;
alter table public.agentes_eventos enable row level security;

create index if not exists agentes_equipa_pilar_idx on public.agentes_equipa (pilar, estado);
create index if not exists agentes_eventos_agente_idx on public.agentes_eventos (agente_id, criado_em desc);
