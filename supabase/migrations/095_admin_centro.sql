-- 095 — CENTRO DE CONTROLO MTM AUTO (/admin/centro): auditoria das acções, batimento dos crons,
--        flag de transição e índices para as leituras do painel.
--
-- O Centro funciona SEM esta migração: a auditoria cai nos logs da Vercel, os crons aparecem sem
-- «última execução» e as leituras usam os índices que já existem (tabelas pequenas a 15/09). Aplicar
-- quando se quiser a auditoria persistente. Aditiva e idempotente. NÃO APLICAR sem rever.
--
-- Carga (Supabase frágil desde 15/09): nada aqui escreve por segundo — só acções do admin (raras) e
-- um batimento por execução de cron (quando os crons forem ligados ao helper).

begin;

-- ── 1. auditoria das acções do Centro ────────────────────────────────────────
create table if not exists public.admin_centro_auditoria (
  id bigserial primary key,
  admin_id uuid not null,
  -- pausar_monitores | retomar_monitores | desligar_motor_copia | conta | trocar_fonte | flag_padrao
  acao text not null,
  -- 'site:<uuid>' | 'auto:<uuid>' | 'provider:<uuid>' | '*' | 'site_settings:<chave>'
  alvo text,
  -- pedido SEM a palavra de confirmação
  pedido jsonb not null default '{}'::jsonb,
  resultado jsonb,
  ok boolean not null default false,
  criado_em timestamptz not null default now()
);
create index if not exists admin_centro_auditoria_em_idx on public.admin_centro_auditoria (criado_em desc);
create index if not exists admin_centro_auditoria_alvo_idx on public.admin_centro_auditoria (alvo, criado_em desc);
alter table public.admin_centro_auditoria enable row level security;
revoke all on public.admin_centro_auditoria from anon, authenticated;
grant all on public.admin_centro_auditoria to service_role;
grant usage, select on sequence public.admin_centro_auditoria_id_seq to service_role;

-- A auditoria das contas MTM Funded (079) só tinha índice por conta; o Centro lê as últimas globais.
create index if not exists mtm_funded_admin_audit_em_idx on public.mtm_funded_admin_audit (criado_em desc);

-- ── 2. batimento dos crons da Vercel ─────────────────────────────────────────
-- Uma linha por caminho (upsert), escrita no fim de cada execução por lib/admin-centro/pulso-cron.ts.
create table if not exists public.cron_pulso (
  caminho text primary key,
  em timestamptz not null default now(),
  ok boolean not null default true,
  duracao_ms integer,
  detalhe text
);
alter table public.cron_pulso enable row level security;
revoke all on public.cron_pulso from anon, authenticated;
grant all on public.cron_pulso to service_role;

-- ── 3. flag de transição ─────────────────────────────────────────────────────
insert into public.site_settings (key, value, description)
values ('admin_centro_padrao', 'false'::jsonb,
        'true = /admin/mtmcopy redirecciona para /admin/centro (Centro de Controlo MTM Auto)')
on conflict (key) do nothing;

-- ── 4. índices das leituras do painel ────────────────────────────────────────
-- Janela de 24 h/30 d por data (hoje fazem seq scan; baratas porque as tabelas são pequenas).
create index if not exists mtmauto_signals_created_idx on public.mtmauto_signals (created_at desc);
create index if not exists mtmauto_executions_created_idx on public.mtmauto_executions (created_at desc);
-- Registo de contas inexistentes / travão de quota: só as linhas com bloqueio.
create index if not exists metaapi_simbolos_cache_bloqueio_idx
  on public.metaapi_simbolos_cache (metaapi_quota_bloqueio_ate) where metaapi_quota_bloqueio_ate is not null;

commit;
