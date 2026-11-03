-- 230 — Acesso a estratégias concedido à mão pelo admin (03/11/2026).
--
-- Pedido do Ricardo: Fábio, Aanssi, Lucas, Sandra e Vítor passam ao MTM Auto Premium II mesmo sem
-- cumprirem a regra (Premium 65 €, MTM Auto pago ou corretora validada). A regra
-- (lib/acesso-estrategias.ts) passa a aceitar estratégias concedidas por utilizador.
create table if not exists public.acesso_estrategias_concedido (
  user_id uuid not null references auth.users(id) on delete cascade,
  estrategia_slug text not null,
  concedido_por text,
  motivo text,
  criado_em timestamptz not null default now(),
  primary key (user_id, estrategia_slug)
);
alter table public.acesso_estrategias_concedido enable row level security;
-- Sem políticas: só o service role lê e escreve.
