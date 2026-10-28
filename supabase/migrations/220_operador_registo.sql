-- 28/10/2026 (pedido do Ricardo): o agente operador (AG-OPERADOR) trabalha sozinho no /admin/social,
-- na máquina de vendas e no radar, e tudo o que faz fica aqui para o dono auditar e desfazer.
-- Ver lib/operador/regras.ts (as decisões) e lib/operador/servidor.ts (a passagem).
create table if not exists operador_registo (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  agente text not null default 'AG-OPERADOR',
  -- posts · envios · comentarios
  area text not null,
  alvo_tabela text not null,
  alvo_id text not null,
  -- aprovar · rejeitar · saltar · publicado · deixar
  acao text not null,
  resumo text not null,
  motivo text,
  -- ensaio = o que faria (nada mudou) · feito = mudou mesmo
  modo text not null check (modo in ('ensaio', 'feito')),
  -- o necessário para desfazer (estado e horário antes da mudança)
  antes jsonb,
  desfeito_em timestamptz,
  desfeito_por text
);

create index if not exists operador_registo_criado_idx on operador_registo (criado_em desc);
create index if not exists operador_registo_alvo_idx on operador_registo (alvo_id);

-- Só o service role lê e escreve (as APIs admin e o cron).
alter table operador_registo enable row level security;

-- Nasce em ensaio: escreve o que faria, sem mudar nada, até o dono o ligar no painel.
insert into site_settings (key, value)
values ('operador', '{"modo":"ensaio","posts":true,"envios":true,"comentarios":true}'::jsonb)
on conflict (key) do nothing;
