-- Gestão → Telegram → Forwarder: as rotas do gmi-relay passam a viver aqui em vez do RELAY_ROUTES
-- do .env da VPS. O relay lê-as por /api/telegram/relay-rotas (Bearer CRON_SECRET) de 2 em 2 min.
-- Só o service role lê e escreve (o backoffice passa pela API, com exigirGestao 'bo.dono').
create table if not exists public.telegram_rotas (
  id uuid primary key default gen_random_uuid(),
  relay text not null default 'gmi-relay',
  nome text not null,
  fonte text not null,
  destino text not null,
  filtro text not null default 'gold' check (filtro in ('gold', 'all', 'astro')),
  cabecalho text,
  app_only boolean not null default false,
  activa boolean not null default true,
  -- Rota nova começa na última mensagem da fonte em vez de republicar as últimas horas.
  so_novas boolean not null default true,
  notas text,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  actualizado_em timestamptz not null default now(),
  unique (relay, nome)
);

alter table public.telegram_rotas enable row level security;

-- A rota que corre hoje na VPS (RELAY_ROUTES de 15/09). Mesmo nome → o relay mantém o last_id.
insert into public.telegram_rotas (relay, nome, fonte, destino, filtro, so_novas, notas)
values ('gmi-relay', 'signal-master-elite', '-1003671953091', '-1002424441843', 'gold', false,
        'Signal Master Elite → Premium. Rota única desde 15/09.')
on conflict (relay, nome) do nothing;
