-- APOIO AO CLIENTE (balão de apoio) — o CRM de suporte.
--
-- Uma conversa por visitante (ou membro), com a triagem por assunto, o estado e os prazos
-- (15 min / 1 h) de quando fica à espera de uma pessoa. Só o servidor lê e escreve (service role):
-- RLS ligado e sem políticas, de propósito. O visitante prova que a conversa é dele com uma chave
-- aleatória guardada no browser; aqui fica só o hash dela.

create table if not exists public.suporte_conversas (
  id uuid primary key default gen_random_uuid(),
  chave_hash text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  nome text,
  email text,
  assunto text not null default 'outro'
    check (assunto in ('acessos','pagamentos','app','vendas','capital','reclamacao','reembolso','outro')),
  estado text not null default 'com_agente'
    check (estado in ('com_agente','a_aguardar_equipa','escalada','resolvida')),
  escalada boolean not null default false,
  escalada_motivo text,
  -- Prazos: quando entrou em espera, o próximo prazo e quantos avisos já se deram (0, 1, 2).
  em_espera_desde timestamptz,
  prazo_em timestamptz,
  nivel_aviso int not null default 0,
  primeira_resposta_em timestamptz,
  ultima_mensagem_em timestamptz not null default now(),
  ultima_resposta_equipa_em timestamptz,
  respondida_por uuid references auth.users(id) on delete set null,
  site text,
  pagina_origem text,
  notas text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists suporte_conversas_estado_idx on public.suporte_conversas (estado, ultima_mensagem_em desc);
create index if not exists suporte_conversas_prazo_idx on public.suporte_conversas (prazo_em) where prazo_em is not null;

create table if not exists public.suporte_mensagens (
  id bigint generated always as identity primary key,
  conversa_id uuid not null references public.suporte_conversas(id) on delete cascade,
  autor text not null check (autor in ('cliente','agente','equipa','sistema')),
  texto text not null,
  fornecedor_ia text,
  autor_user_id uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);

create index if not exists suporte_mensagens_conversa_idx on public.suporte_mensagens (conversa_id, id);

alter table public.suporte_conversas enable row level security;
alter table public.suporte_mensagens enable row level security;

-- A regra do reembolso automático, guardada e DESLIGADA (decisão do dono, 16/11/2026):
-- só pode ligar com faturação ≥ 5.000 €/mês, e só abaixo de 50 €. O código limita os tectos
-- mesmo que alguém escreva outros números aqui (lib/suporte/regras.ts).
insert into public.site_settings (key, value, description)
values (
  'suporte_regras',
  jsonb_build_object(
    'reembolso_automatico', jsonb_build_object('ligado', false, 'limite_eur', 50, 'faturacao_minima_mensal_eur', 5000),
    'prazos_min', jsonb_build_array(15, 60),
    'escalar_sempre', jsonb_build_array('reclamacao', 'reembolso')
  ),
  'Apoio no site: reembolso automático (desligado; só com faturação >= 5000 €/mês e < 50 €) e prazos 15 min / 1 h'
)
on conflict (key) do nothing;
