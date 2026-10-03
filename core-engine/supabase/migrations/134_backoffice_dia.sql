-- 134 — O motor do dia: o que falta na base para preparar o trabalho da equipa
--
-- PORQUÊ
-- O backoffice tem pipeline, tarefas, equipa e comissões — e tinha ZERO negócios lá dentro. Uma
-- casa bonita onde não entrava ninguém. Ao lado: leads a chegar pelo Telegram e pelo Instagram sem
-- ninguém a trabalhá-los, 134 perfis, e o `equipa-vigia` a vigiar negócios parados que nunca
-- chegaram a existir.
--
-- Esta migração dá à base as três coisas que faltavam para um motor diário poder existir:
-- uma chave que impeça tarefas repetidas, um sítio para falar com cada pessoa da equipa, e índices
-- para as perguntas que esse motor faz todas as manhãs.

-- ── 1. Idempotência das tarefas ──────────────────────────────────────────────
--
-- O motor corre de manhã, mas também pode ser corrido à mão, falhar a meio e ser repetido, ou ser
-- disparado duas vezes pela Vercel. Sem chave, a pessoa abria o backoffice e via a mesma tarefa
-- três vezes — e uma lista em que não se confia é uma lista que não se usa.
--
-- A coluna aceita NULO porque as tarefas escritas por pessoas não têm chave nenhuma: só as que o
-- motor gera é que precisam de se reconhecer. O índice é PARCIAL por isso mesmo — duas tarefas
-- manuais iguais são problema de quem as escreveu, não da base.
alter table public.vendas_tarefas add column if not exists chave text;

create unique index if not exists vendas_tarefas_chave_unica
  on public.vendas_tarefas (chave)
  where chave is not null;

-- ── 2. Por onde se fala com cada pessoa da equipa ────────────────────────────
--
-- Os perfis não guardam Telegram. Sem isto, o motor prepara o dia de alguém e depois não tem como
-- lho dizer — a pessoa só saberia se se lembrasse de abrir o backoffice, que é precisamente o
-- hábito que ainda não existe.
--
-- Tabela à parte e não uma coluna em `profiles` porque isto é do backoffice e só do backoffice:
-- quem não trabalha na equipa não tem linha aqui, e o dia em que o backoffice deixar de existir
-- esta tabela vai com ele sem deixar uma coluna órfã na tabela mais usada do sistema.
create table if not exists public.backoffice_contactos (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  telegram_chat_id text,
  -- Um interruptor por pessoa. Quem não quer ser acordado às 7h desliga isto e continua a ver o
  -- trabalho no backoffice — o motor não deixa de o preparar, deixa só de o anunciar.
  avisos_ligados   boolean not null default true,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

alter table public.backoffice_contactos enable row level security;

-- Cada um vê e trata do seu. A escrita em massa é do motor, que corre com service role e não passa
-- por aqui. Políticas separadas por comando: um `for all` com `using` daria também o direito de
-- inserir linhas para outra pessoa, e o contacto de outra pessoa não é de ninguém.
drop policy if exists backoffice_contactos_ver_o_seu on public.backoffice_contactos;
create policy backoffice_contactos_ver_o_seu
  on public.backoffice_contactos for select
  using (user_id = auth.uid());

drop policy if exists backoffice_contactos_criar_o_seu on public.backoffice_contactos;
create policy backoffice_contactos_criar_o_seu
  on public.backoffice_contactos for insert
  with check (user_id = auth.uid());

drop policy if exists backoffice_contactos_mudar_o_seu on public.backoffice_contactos;
create policy backoffice_contactos_mudar_o_seu
  on public.backoffice_contactos for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── 3. Os índices das perguntas que o motor faz todas as manhãs ──────────────
--
-- Sem eles isto funciona à mesma — com 0 negócios tudo é rápido. Ficam agora porque o dia em que
-- o pipeline tiver milhares é o dia em que ninguém se vai lembrar de os criar, e a manhã fica
-- lenta exactamente quando passou a haver trabalho a sério.

-- «que negócios estão vivos, e por ordem de quem está parado há mais tempo?»
create index if not exists vendas_negocios_vivos_idx
  on public.vendas_negocios (estado, atualizado_em)
  where estado not in ('ganho', 'perdido');

-- «este lead já entrou no pipeline?» — a pergunta da ingestão, uma vez por lead, todas as manhãs.
create index if not exists vendas_negocios_telegram_idx
  on public.vendas_negocios (telegram_id)
  where telegram_id is not null;

create index if not exists vendas_negocios_email_idx
  on public.vendas_negocios (lower(email))
  where email is not null;

-- «o que é que esta pessoa tem para hoje?» — a pergunta de cada pessoa, várias vezes por dia.
create index if not exists vendas_tarefas_responsavel_idx
  on public.vendas_tarefas (responsavel_id, estado, prazo);

-- «quantas vezes já se tocou neste negócio?» — o que decide se a mensagem muda de tom.
create index if not exists vendas_tarefas_negocio_idx
  on public.vendas_tarefas (negocio_id, criado_em);

-- ── 4. O interruptor ─────────────────────────────────────────────────────────
--
-- Nasce DESLIGADO, como o motor dos funis. Isto prepara trabalho para pessoas reais e escreve-lhes
-- ao princípio do dia: ligar-se sozinho no deploy seria a pior forma possível de o apresentar à
-- equipa. Liga-se quando o Ricardo decidir, e em `site_settings` para não precisar de deploy.
insert into public.site_settings (key, value)
values ('backoffice_motor_dia_ligado', 'false'::jsonb)
on conflict (key) do nothing;
