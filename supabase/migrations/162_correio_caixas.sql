-- 162 — AS CAIXAS DE CORREIO DO DOMÍNIO
--
-- O Zoho é a fonte de verdade de QUEM recebe correio. Esta tabela é a ligação que o Zoho não
-- consegue ter: que pessoa desta casa está por trás de cada endereço — o utilizador do site, o
-- educador do LMS — e para onde é que o correio dela deve ser reencaminhado quando ela não usa a
-- caixa da MTM.
--
-- Sem isto, o painel do Zoho é uma lista de endereços sem dono. Foi assim que se descobriu, a
-- 30/09, que três educadores tinham endereços @morethanmoney.pt gravados como login que nunca
-- existiram no servidor de correio: tudo o que o LMS lhes enviou foi para o vazio.
--
-- SEM POLÍTICAS, de propósito: RLS ligado e zero policies = só a service role entra. Tem endereços
-- pessoais de educadores; não tem nada que ser legível pelo cliente autenticado.
create table if not exists public.correio_caixas (
  id uuid primary key default gen_random_uuid(),
  -- Endereço completo em minúsculas. ÚNICO: o mesmo endereço não pode ser caixa e alias ao mesmo
  -- tempo, e é o Zoho que o recusaria — mais vale recusá-lo aqui, com uma frase em português.
  endereco text not null unique,
  tipo text not null default 'caixa' check (tipo in ('caixa','alias')),
  user_id uuid references public.profiles(id) on delete set null,
  educador_id uuid references public.lms_educators(id) on delete set null,
  -- Para onde vai o correio quando a pessoa não usa a caixa da MTM.
  reencaminhar_para text,
  -- Só fica `true` quando o Zoho confirma o destino: ele manda um código para lá e só entrega
  -- depois de alguém o introduzir. Dizer «ligado» antes disso é mentir a quem confia no ecrã.
  reencaminhar_ativo boolean not null default false,
  -- O que o Zoho nos devolveu. Sem isto não se consegue mexer na conta depois de criada.
  zoho_account_id text,
  zoho_zuid text,
  estado text not null default 'ativa' check (estado in ('ativa','suspensa','por_criar','erro')),
  ultimo_erro text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.correio_caixas enable row level security;

create index if not exists correio_caixas_user_idx on public.correio_caixas (user_id);
create index if not exists correio_caixas_educador_idx on public.correio_caixas (educador_id);
