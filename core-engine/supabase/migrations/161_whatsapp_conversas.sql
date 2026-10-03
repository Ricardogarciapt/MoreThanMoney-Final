-- 161 — AS CONVERSAS DO WHATSAPP (o CRM)
--
-- O livro `whatsapp_mensagens` (146) guarda mensagem a mensagem. Não serve para trabalhar: para
-- saber quem está à espera era preciso varrer o livro todo e agrupar por número. Esta tabela é uma
-- linha por PESSOA, com o que se precisa de ver de manhã — quem escreveu por último, quantas
-- mensagens estão sem resposta, em que pé está o negócio e de quem é.
--
-- SEM POLÍTICAS, DE PROPÓSITO: RLS ligado e zero policies significa que só a service role entra.
-- É um CRM de vendas com números de telefone de gente real — não tem nada que ser legível pelo
-- cliente autenticado, e uma policy permissiva aqui seria a fuga que ninguém revê.
create table if not exists public.whatsapp_conversas (
  id uuid primary key default gen_random_uuid(),
  -- E.164, e ÚNICO: é o que impede duas linhas para a mesma pessoa quando chegam três mensagens
  -- no mesmo segundo. Sem isto o histórico parte-se em dois sítios e ninguém percebe porquê.
  telefone text not null unique,
  nome text,
  negocio_id uuid references public.vendas_negocios(id) on delete set null,
  -- DUAS chaves para `profiles` (esta e `responsavel`). É o caso que parte todos os embeds do
  -- PostgREST nesta tabela: nunca se lê `whatsapp_conversas` com `select(...profiles(...))`, lê-se
  -- o perfil à parte. Já derrubou o LMS uma vez (16/09).
  user_id uuid references public.profiles(id) on delete set null,
  estado text not null default 'novo'
    check (estado in ('novo','a_falar','a_aguardar','ganho','perdido','silenciado')),
  responsavel uuid references public.profiles(id) on delete set null,
  -- A janela das 24 horas da Meta conta-se DAQUI, não de `ultima_saida`: responder não estica a
  -- janela (ver lib/whatsapp/crm.ts).
  ultima_entrada timestamptz,
  ultima_saida timestamptz,
  por_responder integer not null default 0,
  notas text,
  etiquetas text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_conversas enable row level security;

-- A lista do dia ordena por quem espera e por quem escreveu há menos tempo.
create index if not exists whatsapp_conversas_trabalho_idx
  on public.whatsapp_conversas (por_responder desc, ultima_entrada desc nulls last);
create index if not exists whatsapp_conversas_estado_idx on public.whatsapp_conversas (estado);
create index if not exists whatsapp_conversas_negocio_idx on public.whatsapp_conversas (negocio_id);
