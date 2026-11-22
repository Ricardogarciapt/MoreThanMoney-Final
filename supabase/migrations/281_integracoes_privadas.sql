-- Segredos de integrações (sessão do Skool, chave do conector MCP do Skool, …).
-- site_settings é legível por qualquer pessoa (políticas SELECT true), por isso NÃO serve para
-- segredos. Esta tabela tem RLS ligado e nenhuma política: só a service role (servidor) lhe toca.
create table if not exists public.integracoes_privadas (
  chave text primary key,
  valor jsonb not null,
  atualizado_em timestamptz not null default now()
);
alter table public.integracoes_privadas enable row level security;
revoke all on public.integracoes_privadas from anon, authenticated;
