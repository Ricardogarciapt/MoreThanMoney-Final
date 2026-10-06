-- 190 · OS AGENTES DE VENDAS TRABALHAM NO PIPELINE DO BACKOFFICE, ao lado dos humanos (06/10/2026).
--
-- O que muda, e só isto:
--  1. `vendas_negocios.agente_id` — o agente IA responsável por um negócio da bolsa. Não substitui
--     nenhuma das cinco colunas humanas (que têm FK para `profiles` e mandam nas comissões): um
--     agente não é uma pessoa, não tem perfil e não recebe comissão. Quando um humano pega no
--     negócio, o agente passa a só poder escrever notas (regra em lib/agentes/pipeline-agentes.ts).
--  2. `agente_pontuacao` / `agente_qualificacao` — a qualificação do agente, em colunas suas, para
--     nunca pisar a `nota` (a prosa livre do closer).
--  3. `vendas_negocio_eventos.agente_id` — o histórico passa a dizer quando foi um agente.
--  4. `vendas_tarefas`: tarefas de um agente (`agente_id`) sem `responsavel_id`; uma tarefa tem
--     sempre UM dono, pessoa OU agente.
--  5. `vendas_agentes_accoes` — o REGISTO de cada acção (agente, antes, depois), só de acrescentar:
--     um gatilho recusa UPDATE e DELETE. É dele que sai o tecto diário.

alter table public.vendas_negocios
  add column if not exists agente_id uuid references public.agentes_equipa(id) on delete set null,
  add column if not exists agente_pontuacao smallint check (agente_pontuacao between 0 and 100),
  add column if not exists agente_qualificacao text;

create index if not exists vendas_negocios_agente_idx
  on public.vendas_negocios (agente_id, atualizado_em desc) where agente_id is not null;

alter table public.vendas_negocio_eventos
  add column if not exists agente_id uuid references public.agentes_equipa(id) on delete set null;

alter table public.vendas_tarefas
  add column if not exists agente_id uuid references public.agentes_equipa(id) on delete set null;
alter table public.vendas_tarefas alter column responsavel_id drop not null;
alter table public.vendas_tarefas drop constraint if exists vendas_tarefas_um_dono;
alter table public.vendas_tarefas
  add constraint vendas_tarefas_um_dono check (responsavel_id is not null or agente_id is not null);
create index if not exists vendas_tarefas_agente_idx
  on public.vendas_tarefas (agente_id, estado, prazo) where agente_id is not null;

create table if not exists public.vendas_agentes_accoes (
  id bigserial primary key,
  agente_id uuid not null references public.agentes_equipa(id) on delete restrict,
  agente_codigo text,
  accao text not null check (accao in (
    'criar_lead', 'assumir', 'qualificar', 'nota', 'mudar_etapa', 'criar_tarefa', 'fechar_tarefa',
    'agendar_followup', 'passar_a_humano', 'registar_actividade', 'rascunho_mensagem',
    'fora_do_catalogo'
  )),
  ok boolean not null,
  erro text,
  negocio_id uuid references public.vendas_negocios(id) on delete set null,
  tarefa_id uuid references public.vendas_tarefas(id) on delete set null,
  antes jsonb,
  depois jsonb,
  texto text,
  pedido jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists vendas_agentes_accoes_dia_idx on public.vendas_agentes_accoes (agente_id, criado_em desc);
create index if not exists vendas_agentes_accoes_negocio_idx on public.vendas_agentes_accoes (negocio_id, criado_em desc) where negocio_id is not null;

alter table public.vendas_agentes_accoes enable row level security;
-- Sem políticas: só o service role (a rota do motor e as páginas do backoffice no servidor) lê e escreve.

create or replace function public.vendas_agentes_accoes_so_acrescentar()
returns trigger language plpgsql set search_path = public as $$
begin
  -- O ON DELETE SET NULL das FKs para negócios/tarefas tem de continuar a funcionar.
  if tg_op = 'UPDATE'
     and new.id = old.id and new.agente_id = old.agente_id and new.accao = old.accao
     and new.ok = old.ok and new.antes is not distinct from old.antes
     and new.depois is not distinct from old.depois and new.texto is not distinct from old.texto
     and new.criado_em = old.criado_em
     and (new.negocio_id is null or new.negocio_id = old.negocio_id)
     and (new.tarefa_id is null or new.tarefa_id = old.tarefa_id) then
    return new;
  end if;
  raise exception 'vendas_agentes_accoes é um registo: não se altera nem se apaga';
end $$;

drop trigger if exists vendas_agentes_accoes_so_acrescentar on public.vendas_agentes_accoes;
create trigger vendas_agentes_accoes_so_acrescentar
  before update or delete on public.vendas_agentes_accoes
  for each row execute function public.vendas_agentes_accoes_so_acrescentar();
