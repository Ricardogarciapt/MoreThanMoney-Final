-- 203 · ACESSOS À ÁREA DE GESTÃO DO BACKOFFICE
--
-- A área «Gestão» (backoffice.morethanmoney.pt/gestao) tem módulos que o dono quer abrir à equipa:
-- «Clientes & CRM» (agenda, WhatsApp, leads sociais, formulários) e «Comercial» (tráfego, cupões).
-- Não são papéis de venda — não levam comissão nem pipeline próprio —, por isso não entram em
-- `backoffice_papeis` (o CHECK desses papéis anda em cinco tabelas de comissões). São acessos,
-- uma linha por pessoa, com as áreas dadas. O resto da Gestão (contas, agentes, dashboard) é só do dono.
--
-- Chaves de `areas`: ver AREAS_GESTAO em `lib/backoffice-papeis.ts`. Uma chave desconhecida é ignorada.

begin;

create table if not exists public.backoffice_gestao_acessos (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  areas         text[]      not null default '{}',
  definido_por  uuid        references public.profiles(id) on delete set null,
  atualizado_at timestamptz not null default now(),
  nota          text
);

alter table public.backoffice_gestao_acessos enable row level security;
revoke all on public.backoffice_gestao_acessos from anon, authenticated;
grant select on public.backoffice_gestao_acessos to authenticated;

-- O middleware lê com a sessão da própria pessoa: cada um vê só a sua linha.
drop policy if exists backoffice_gestao_acessos_ver_o_seu on public.backoffice_gestao_acessos;
create policy backoffice_gestao_acessos_ver_o_seu
  on public.backoffice_gestao_acessos
  for select
  to authenticated
  using (user_id = auth.uid());

commit;

-- O DESTINO de cada formulário no CRM: etiquetas e interesse que a submissão leva para o pipeline,
-- e se avisa o dono no Telegram. Ver `DestinoFormulario` em `lib/custom-forms.ts`.
alter table public.custom_forms add column if not exists destino jsonb not null default '{}'::jsonb;
