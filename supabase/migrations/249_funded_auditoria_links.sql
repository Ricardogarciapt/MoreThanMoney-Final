-- 249 — Links públicos de auditoria de contas MTM Funded (tipo «track record» verificável).
--
-- Cada dono pode gerar UM link activo por conta; revogar desliga-o e um novo token nasce ao gerar
-- de novo. O token não tem ligação ao id nem ao login. Só o service role lê e escreve (as rotas da
-- API validam o dono); RLS ligada e sem políticas = fechado ao público pelo PostgREST.

create table if not exists public.funded_auditoria_links (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.mtm_trading_accounts(id) on delete cascade,
  token text not null unique,
  ativo boolean not null default true,
  mostrar_login boolean not null default false,
  criado_por uuid,
  created_at timestamptz not null default now(),
  revogado_em timestamptz,
  visitas integer not null default 0
);

create unique index if not exists funded_auditoria_links_um_ativo
  on public.funded_auditoria_links (account_id) where ativo and revogado_em is null;

alter table public.funded_auditoria_links enable row level security;
revoke all on public.funded_auditoria_links from anon, authenticated;

-- Contador de visitas da página pública (chamado pelo servidor com o service role).
create or replace function public.incrementar_visita_auditoria(p_token text)
returns void language sql security definer set search_path = public as $$
  update public.funded_auditoria_links set visitas = visitas + 1
   where token = p_token and ativo and revogado_em is null;
$$;
revoke all on function public.incrementar_visita_auditoria(text) from public, anon, authenticated;
