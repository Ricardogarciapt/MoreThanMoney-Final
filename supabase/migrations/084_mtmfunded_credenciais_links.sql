-- 084 — LINKS SEGUROS DAS CREDENCIAIS MTM FUNDED
--
-- O email da conta simulada leva o login e o servidor, NUNCA a password. Leva um link «Ver
-- credenciais» que abre as passwords UMA vez, dentro da app, a quem tiver sessão como DONO da conta.
--
--   email ──link /mtmfunded/credenciais#t=<token>──▶ página (sessão MTM) ──POST token──▶ rota
--                                                                       │ assinatura + prazo (sem BD)
--                                                                       │ linha por id, hash igual
--                                                                       │ dono = sessão (senão 404, o link NÃO se gasta)
--                                                                       └ usado_em = now() WHERE usado_em IS NULL (atómico)
--
-- Guarda-se o HASH do token (sha256), não o token: quem ler a tabela não abre link nenhum.
-- O token vai no FRAGMENTO do URL (#t=), que o browser nunca manda ao servidor — não fica em
-- registos de acesso nem no Referer.
--
-- Aditiva e idempotente. Só o service role lê/escreve (RLS ligado, sem políticas).

begin;

create table if not exists public.mtm_funded_credenciais_links (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.mtm_trading_accounts(id) on delete cascade,
  user_id uuid not null,
  -- criacao · fase · regeneracao · reenvio · backfill · pedido (o dono pediu no painel)
  motivo text not null check (motivo in ('criacao', 'fase', 'regeneracao', 'reenvio', 'backfill', 'pedido')),
  token_hash text not null unique,
  expira_em timestamptz not null,
  usado_em timestamptz,
  email_enviado_em timestamptz,
  criado_em timestamptz not null default now()
);

comment on table public.mtm_funded_credenciais_links is
  'links de uso único (24 h, só o dono) que revelam as passwords de uma conta MTM Funded simulada — 084; lib/mtmfunded/credenciais-link.ts';

-- O envio e o limite de pedidos lêem por conta e por data; o backfill lê «já enviado?» por conta.
create index if not exists mtm_funded_credenciais_links_conta_idx
  on public.mtm_funded_credenciais_links (account_id, criado_em desc);

alter table public.mtm_funded_credenciais_links enable row level security;
revoke all on public.mtm_funded_credenciais_links from anon, authenticated;

commit;
