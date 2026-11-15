-- Público virtual (07/11/2026): pedidos de teste com uma multidão simulada (MiroFish no Mac do dono).
-- O site só guarda o pedido e o relatório; a simulação corre no Mac (aios/publico_virtual, IA local).
-- O Mac traz os pedidos 'pendente' com Bearer AGENT_SITE_API_KEY e devolve o relatório.

create table if not exists public.publico_virtual_testes (
  id uuid primary key default gen_random_uuid(),
  alvo text not null,
  url text,
  texto text,
  pergunta text,
  rondas int not null default 8 check (rondas between 2 and 20),
  pedido_por text not null default 'dono',
  estado text not null default 'pendente' check (estado in ('pendente', 'fila', 'recusado', 'feito', 'falhou')),
  motivo text,
  relatorio text,
  criado_em timestamptz not null default now(),
  actualizado_em timestamptz not null default now()
);
create index if not exists publico_virtual_testes_estado_idx on public.publico_virtual_testes (estado, criado_em);

-- Só o servidor (service role). Nada de acesso directo do browser.
alter table public.publico_virtual_testes enable row level security;
