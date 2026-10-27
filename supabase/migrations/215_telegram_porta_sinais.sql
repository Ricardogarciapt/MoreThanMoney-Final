-- Porta dos grupos de sinais do Telegram (27/10/2026, pedido do dono): só entra quem tem a conta da
-- corretora validada (telegram_leads.stage = 'granted') ou quem se confirma membro MTM.
-- Ver lib/telegram-porta-sinais.ts. Os membros que já estão nos grupos NÃO são tocados por isto.

-- Pedidos de adesão (chat_join_request) e entradas diretas vistas nos grupos de sinais.
create table if not exists public.telegram_sinais_pedidos (
  grupo_id text not null,
  tg_user_id text not null,
  nome text,
  username text,
  estado text not null default 'pendente'
    check (estado in ('pendente', 'aprovado', 'recusado', 'expulso', 'avisado')),
  via text,
  criado_em timestamptz not null default now(),
  tratado_em timestamptz,
  primary key (grupo_id, tg_user_id)
);
create index if not exists telegram_sinais_pedidos_user on public.telegram_sinais_pedidos (tg_user_id, estado);
alter table public.telegram_sinais_pedidos enable row level security;

-- Conta do Telegram ↔ perfil MTM, provada por código enviado ao email da conta.
create table if not exists public.telegram_membros_ligados (
  tg_user_id text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  ligado_em timestamptz not null default now()
);
create index if not exists telegram_membros_ligados_perfil on public.telegram_membros_ligados (profile_id);
alter table public.telegram_membros_ligados enable row level security;

-- Códigos de confirmação em curso (só o resumo sha256; 15 minutos; 5 tentativas).
create table if not exists public.telegram_membros_codigos (
  tg_user_id text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  codigo_hash text not null,
  expira_em timestamptz not null,
  tentativas int not null default 0,
  criado_em timestamptz not null default now()
);
alter table public.telegram_membros_codigos enable row level security;

-- Modo da porta para quem entra DIRETAMENTE por um link antigo (sem pedido):
--   'aviso'    → só avisa o admin (omissão: nada é removido sem o OK do dono);
--   'expulsar' → tira a pessoa do grupo (ban + unban: pode voltar a pedir) e explica-lhe o caminho.
insert into public.site_settings (key, value)
values ('telegram_porta_sinais', '{"modo":"aviso"}'::jsonb)
on conflict (key) do nothing;
