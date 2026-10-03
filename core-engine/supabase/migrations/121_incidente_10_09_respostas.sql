-- 121 — Respostas dos clientes ao comunicado do incidente de 10/09/2026 (MTM Auto Premium).
-- Cada destinatário recebe um link com um token próprio; o botão do email abre o formulário e a
-- resposta (aceita / não aceita as condições + a solução que prefere na PU Prime) fica aqui.
-- Só o servidor lê e escreve (service role): RLS ligada e nenhuma política.

create table if not exists public.incidente_10_09_respostas (
  id              uuid primary key default gen_random_uuid(),
  token           text not null unique,
  user_id         uuid references public.profiles(id) on delete set null,
  email           text not null,
  nome            text,
  idioma          text not null default 'pt' check (idioma in ('pt', 'en')),
  capital_usd     numeric,
  decisao         text check (decisao in ('aceito', 'nao_aceito')),
  opcao_pu_prime  text check (opcao_pu_prime in ('estorno', 'encerramento', 'separacao')),
  comentario      text,
  respondido_em   timestamptz,
  ip              text,
  user_agent      text,
  created_at      timestamptz not null default now()
);

create index if not exists incidente_10_09_respostas_email_idx on public.incidente_10_09_respostas (lower(email));

alter table public.incidente_10_09_respostas enable row level security;
