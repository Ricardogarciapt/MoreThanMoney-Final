-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 182 — ENVIOS POR APROVAR: o que a máquina quer mandar por iniciativa própria espera por uma pessoa.
--
-- (O 181 fica para a migração paralela dos códigos de agente AG-PROSPECTOR/SETTER/CLOSER/SOCIAL/EMAIL.)
--
-- A REGRA (06/10, conformidade)
--   · A pessoa começou (escreveu ao bot, mandou DM, a resposta é pública debaixo do comentário
--     dela) → a resposta sai automática.
--   · A máquina começa (DM do setter a quem só comentou, follow-up a um lead calado, email de
--     recuperação de checkout) → rascunho `pendente`; só sai depois de `aprovado`.
--   Ver lib/envios-aprovacao.ts (a regra) e lib/envios-fila.ts (a fila).
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

-- ── 1. O setter do Instagram ganha o estado que lhe faltava ──────────────────────────────────────
-- Até aqui o fluxo ia de `rascunho` direito a `enviado`: com `enviar_dm = true` as DMs saíam sem
-- passar por ninguém. `pendente` é o rascunho À ESPERA DE DECISÃO; `rascunho` fica aceite só para
-- as linhas antigas. `falhou` distingue «aprovado e a Meta recusou» de «ainda por aprovar».
alter table public.ig_setter_rascunhos drop constraint if exists ig_setter_rascunhos_estado_check;
alter table public.ig_setter_rascunhos add constraint ig_setter_rascunhos_estado_check
  check (estado in ('rascunho','pendente','aprovado','enviado','falhou','descartado','encerrado'));

-- A resposta pública pode sair sozinha e a DM não: são dois momentos, e a linha tem de saber se a
-- pública já saiu para quem aprova a DM não a mandar outra vez.
alter table public.ig_setter_rascunhos add column if not exists publica_enviada_em timestamptz;
-- Quem decidiu: o email do admin ou `agente:<id>` quando foi pela API do agente.
alter table public.ig_setter_rascunhos add column if not exists decidido_por text;

-- ── 2. A fila genérica: aios_tasks ────────────────────────────────────────────────────────────────
-- Escolhida porque é a que a API do agente já lê e escreve e o AIOS local já mostra (estava vazia).
-- Os envios distinguem-se das tarefas internas pelo kind `envio:*`.
alter table public.aios_tasks add column if not exists chave text;
alter table public.aios_tasks add column if not exists payload jsonb;
alter table public.aios_tasks add column if not exists decidido_por text;
alter table public.aios_tasks add column if not exists decidido_em timestamptz;
alter table public.aios_tasks add column if not exists enviado_em timestamptz;
alter table public.aios_tasks add column if not exists erro text;

-- Um lembrete por sessão de checkout, um rascunho por toque de follow-up: a chave é o selo.
create unique index if not exists aios_tasks_chave_unica on public.aios_tasks (chave) where chave is not null;
create index if not exists aios_tasks_envios_por_decidir on public.aios_tasks (status, created_at desc) where kind like 'envio:%';

-- Um envio só sai de `aprovado`; os estados válidos de um envio estão fechados. As tarefas internas
-- (kind sem `envio:`) continuam livres como estavam.
alter table public.aios_tasks drop constraint if exists aios_tasks_envio_estado_check;
alter table public.aios_tasks add constraint aios_tasks_envio_estado_check
  check (kind not like 'envio:%' or status in ('pendente','aprovado','enviado','rejeitado','falhou','obsoleto'));

-- Mensagens por aprovar têm emails e conversas de pessoas reais. Só o service role.
alter table public.aios_tasks enable row level security;
revoke all on public.aios_tasks from anon, authenticated;
