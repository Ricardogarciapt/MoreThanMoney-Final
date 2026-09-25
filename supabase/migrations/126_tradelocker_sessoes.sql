-- FICHAS DE SESSÃO DA TRADELOCKER — para não fazer login novo a cada execução.
--
-- 2026-09-25: o dono foi EXPULSO da sua própria TradeLocker. A cache de fichas do cliente vive na
-- memória do processo e, na Vercel, cada execução pode cair numa instância nova: o cron da gestão
-- automática fazia, de minuto a minuto, um LOGIN COMPLETO com as credenciais dele. A TradeLocker
-- admite uma sessão por utilizador — cada login nosso deitava abaixo a que ele tinha aberta.
--
-- Com esta tabela a ficha sobrevive entre execuções e o cliente passa a RENOVAR (refreshToken) em
-- vez de autenticar. O login completo passa a ser a excepção.
--
-- Segurança: `tokens_cifrados` leva o JSON da ficha cifrado em AES-256-GCM com a MESMA chave das
-- passwords (MTMFUNDED_CRED_KEY). A `chave` é o HASH de `ambiente|servidor|email`, nunca o email em
-- claro — quem olhe para esta tabela não fica com a lista de quem tem corretora ligada. RLS ligado
-- e SEM políticas: só a chave de serviço lhe toca. Uma ficha caduca sozinha; a password, que já
-- estava guardada ao lado, não.
create table if not exists public.tradelocker_sessoes (
  chave text primary key,
  tokens_cifrados text not null,
  expira_em timestamptz,
  atualizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);

alter table public.tradelocker_sessoes enable row level security;

-- Sem políticas de propósito: nenhum utilizador autenticado lê ou escreve aqui.
revoke all on public.tradelocker_sessoes from anon, authenticated;

comment on table public.tradelocker_sessoes is
  'Fichas de sessão TradeLocker, cifradas. Evita o login completo a cada execução sem memória (ver lib/tradelocker/cofre-tokens.ts).';
comment on column public.tradelocker_sessoes.chave is
  'sha256 de ambiente|servidor|email — a mesma chave da cache do cliente, mas sem o email em claro.';
