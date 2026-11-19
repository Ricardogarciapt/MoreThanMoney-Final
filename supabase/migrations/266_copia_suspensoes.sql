-- 266 · Cópia em pausa por falta de pagamento (pedido do Ricardo, 19/11/2026).
--
-- Uma linha por suspensão. Guarda EXACTAMENTE o que estava ligado no momento da pausa, para que
-- ao pagar se religue só isso (e nada que o cliente ou o admin tenham desligado por outra razão).
-- Regras em lib/cobranca/suspender-copia-regras.ts; executa-se no cron /api/cron/cobranca-recuperar.

create table if not exists public.copia_suspensoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  motivo text not null,
  suspensa_em timestamptz not null default now(),
  -- { site: [ids de mtmcopy_connections], auto: [ids de mtmauto_accounts], subs: [ids de mtmauto_subscriptions],
  --   metaapi: [{ id, origem: 'site'|'auto' }] (só as que estavam DEPLOYED e foram postas em undeploy) }
  desligado jsonb not null default '{}'::jsonb,
  email_suspensao_em timestamptz,
  religada_em timestamptz,
  religada_motivo text,
  erros text[] not null default '{}'
);

-- Uma suspensão aberta por pessoa.
create unique index if not exists copia_suspensoes_aberta_uq on public.copia_suspensoes (user_id) where religada_em is null;

alter table public.copia_suspensoes enable row level security;
-- Só o servidor (service role) lê e escreve. Sem políticas para anon/authenticated.

-- Interruptor e último resumo. Começa em SOMBRA: calcula a lista e não toca em nada até o Ricardo dar OK.
insert into public.site_settings (key, value, description, updated_at)
values (
  'copia_suspensao',
  '{"modo":"sombra","excecoes":[]}'::jsonb,
  'Pausa da cópia (MTM Auto/MTM Funded/MetaApi) por falta de pagamento: modo sombra|live, excecoes (emails ou user_ids) e último resumo',
  now()
)
on conflict (key) do nothing;
