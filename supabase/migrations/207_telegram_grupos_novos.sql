-- Gestão → Telegram → Grupos novos: pedidos de criação de grupos e canais. O Bot API não cria
-- grupos; quem os cria é o gmi-relay da VPS, com a sessão pessoal do dono, que lê os pedidos por
-- /api/telegram/relay-pedidos (Bearer CRON_SECRET) e devolve o resultado (chat_id, convite).
-- No máximo 3 por dia (limite no site E no relay): criar grupos em série é o que a Telegram limita.
create table if not exists public.telegram_grupos_novos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('grupo', 'canal')),
  titulo text not null,
  descricao text,
  -- @username do bot que entra como administrador; null = nenhum.
  bot text,
  estado text not null default 'pendente' check (estado in ('pendente', 'a_criar', 'criado', 'falhou', 'cancelado')),
  chat_id text,
  convite text,
  erro text,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  tratado_em timestamptz
);
create index if not exists telegram_grupos_novos_estado on public.telegram_grupos_novos (estado, criado_em);
alter table public.telegram_grupos_novos enable row level security;

-- Bots registados no painel (criados à mão no @BotFather). O token vai cifrado (AES-GCM,
-- lib/mtmfunded/credenciais.ts) e nunca sai da API; o relay só recebe o @username.
create table if not exists public.telegram_bots (
  id uuid primary key default gen_random_uuid(),
  bot_id bigint not null unique,
  username text not null,
  nome text not null,
  token_cifrado text not null,
  notas text,
  criado_por uuid,
  criado_em timestamptz not null default now()
);
alter table public.telegram_bots enable row level security;
