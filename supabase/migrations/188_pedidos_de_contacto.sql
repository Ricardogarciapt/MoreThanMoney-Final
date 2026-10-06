-- 188 · «Quero que me liguem» + Meta Lead Ads → o livro do consentimento (06/10/2026)
--
-- O QUE ISTO RESOLVE
-- O dono quer encher a lista de pessoas que os agentes podem contactar SOZINHOS por chamada,
-- WhatsApp ou email. A base legal é o consentimento explícito, e o livro já existe
-- (`captacao_consentimento`, migração 143). Faltava:
--   · um sítio para o PEDIDO em si (nome, interesse, melhor hora) — não é consentimento, é o
--     contexto que o setter precisa para ligar bem, e não cabe no livro;
--   · saber, em cada linha do livro, DE ONDE veio (página ou post) e que agente assinou o link.
--
-- CONVENÇÃO: nas linhas que nascem daqui, `canal` é o CANAL DE CONTACTO consentido
-- ('chamada' | 'whatsapp' | 'email'), que é como a regra do motor (lib/agentes/contacto-inicial.ts)
-- o lê. O sítio onde foi dado vai para `origem`. Uma linha por canal marcado; o email só vai na
-- linha do canal email (senão a vista `captacao_permissao_email` lia um «sim» a chamadas como um
-- «sim» a campanhas de email).

create table if not exists public.pedidos_contacto (
  id uuid primary key default gen_random_uuid(),
  fonte text not null default 'site' check (fonte in ('site', 'meta_lead_ads', 'telegram')),
  nome text not null,
  telefone text,
  email text,
  interesse text,
  melhor_hora text,
  canais text[] not null default '{}',
  origem text,
  ag text,
  -- Meta Lead Ads: o id do lead é único — a Meta reentrega o mesmo webhook e não se duplica.
  meta_leadgen_id text unique,
  meta_form_id text,
  meta_page_id text,
  meta_ad_id text,
  -- Só o hash do IP (com sal do servidor): serve para o limite por IP, não para seguir ninguém.
  ip_hash text,
  tarefa_id uuid,
  tarefa_estado text,
  criado_em timestamptz not null default now()
);

create index if not exists idx_pedidos_contacto_ip on public.pedidos_contacto (ip_hash, criado_em desc) where ip_hash is not null;
create index if not exists idx_pedidos_contacto_tel on public.pedidos_contacto (telefone, criado_em desc) where telefone is not null;
create index if not exists idx_pedidos_contacto_criado on public.pedidos_contacto (criado_em desc);

comment on table public.pedidos_contacto is
  'Pedidos «Quero que me liguem» (site, bot, Meta Lead Ads). O consentimento em si vive em captacao_consentimento, uma linha por canal marcado.';

alter table public.pedidos_contacto enable row level security;
revoke all on public.pedidos_contacto from anon, authenticated;

alter table public.captacao_consentimento add column if not exists origem text;
alter table public.captacao_consentimento add column if not exists ag text;
alter table public.captacao_consentimento add column if not exists pedido_contacto_id uuid references public.pedidos_contacto(id) on delete set null;

create index if not exists idx_captacao_consentimento_telefone on public.captacao_consentimento (telefone) where telefone is not null;

-- O estado de agora POR CANAL DE CONTACTO (a vista do email continua a ser a de campanhas).
-- Ausência de linha = SEM permissão. Um `retirado_em` em qualquer linha da mesma pessoa bloqueia.
create or replace view public.captacao_permissao_contacto with (security_invoker = true) as
select
  c.canal,
  coalesce(lower(btrim(c.email)), btrim(c.telefone)) as identificador,
  bool_or(c.base_legal = 'consentimento' and c.retirado_em is null)
    and not bool_or(c.retirado_em is not null) as pode,
  max(c.pedido_em) filter (where c.base_legal = 'consentimento') as consentiu_em,
  max(c.retirado_em) as retirou_em,
  (array_agg(c.origem order by c.pedido_em desc))[1] as ultima_origem,
  (array_agg(c.ag order by c.pedido_em desc))[1] as ultimo_ag
from public.captacao_consentimento c
where c.canal in ('chamada', 'whatsapp', 'email', 'sms', 'telegram')
  and coalesce(btrim(c.email), btrim(c.telefone), '') <> ''
group by c.canal, coalesce(lower(btrim(c.email)), btrim(c.telefone));

comment on view public.captacao_permissao_contacto is
  'Permissão actual por canal de contacto (chamada/whatsapp/email). Ausência de linha = SEM permissão.';

revoke all on public.captacao_permissao_contacto from anon, authenticated;
