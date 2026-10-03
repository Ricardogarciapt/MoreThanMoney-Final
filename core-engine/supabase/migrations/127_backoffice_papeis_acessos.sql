-- 127 · Backoffice da equipa de vendas: papéis, quem os deu, e que partes do site cada um vê
--
-- PORQUÊ
-- O Ricardo passa a ter gente a vender com ele. Essas pessoas entram em backoffice.morethanmoney.pt
-- e cada uma tem de ver o seu percurso, as suas tarefas e o seu dinheiro — e nada do colega. Até
-- hoje o único conceito de «não-cliente» na base era o MLM binário (`mlm_nodes`), que continua
-- exactamente como está: isto nasce AO LADO, não por cima. Uma pessoa pode ganhar pelos dois.
--
-- AS TABELAS LEGADO `affiliates`, `commissions` e `affiliate_commissions` estão a zero e ficam a
-- zero: não se constrói aqui em cima nem se apaga nada.
--
-- O QUE FICA GUARDADO
--   `backoffice_papeis`       — N papéis por pessoa, com quem atribuiu e quando, e o rasto de quem
--                               retirou. Retirar NÃO apaga a linha (ver mais abaixo).
--   `backoffice_acessos_site` — a que partes DO SITE (não do backoffice) cada pessoa tem acesso.
--                               Lista vazia = comportamento normal de membro. A lista só APERTA:
--                               nunca dá acesso a quem `is_active`/activação já bloqueiam. Essa
--                               regra vive em `lib/backoffice-acessos-site.ts` e é o que mantém
--                               «ter papel» e «ter produto pago» separados.
--
-- QUEM LÊ E QUEM ESCREVE
--   Escrever é só do service_role (rotas `/api/admin/backoffice/*`, que já exigem admin). A chave
--   anon vai dentro do JavaScript do site: se ela pudesse inserir uma linha em `backoffice_papeis`,
--   qualquer visitante dava-se a si mesmo `team_leader` e passava a ver o dinheiro dos outros.
--   Ler cada um lê o SEU (RLS por `auth.uid()`), para o backoffice poder mostrar os próprios papéis
--   sem passar pelo servidor. Ninguém lê os papéis de terceiros pela chave anon — nem para saber
--   que existem.

begin;

-- ─────────────────────────────── papéis ───────────────────────────────

create table if not exists public.backoffice_papeis (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid        not null references public.profiles(id) on delete cascade,
  papel         text        not null,
  -- Quem deu o papel. Nullable porque uma atribuição feita por automatismo (importação, cupão de
  -- parceria) não tem uma pessoa por trás, e mentir «foi o Ricardo» era pior do que não saber.
  atribuido_por uuid        references public.profiles(id) on delete set null,
  atribuido_at  timestamptz not null default now(),
  -- O RANK É POR PAPEL, e não por pessoa: alguém pode ser closer avançado e setter iniciante.
  -- Por isso vive aqui, na linha do papel, e não em `profiles`.
  --
  -- Decisão do dono (25/09): os ranks são DEGRAUS NA PERCENTAGEM DO PRÓPRIO — um closer ganha 20%
  -- até 5 vendas no mês, 25% das 6 às 10, 30% acima disso. NÃO é o modelo clássico em que subir de
  -- rank acrescenta mais um nível de descendência a pagar; esse multiplica o custo sem multiplicar
  -- a receita.
  --
  -- Fica `text` e sem chave estrangeira DE PROPÓSITO: a tabela dos ranks por papel é construída do
  -- lado das comissões e ainda não existe. Uma FK para uma tabela futura não se escreve; um espaço
  -- para a chave dela escreve-se. `mlm_ranks` (8 linhas) serve o MLM binário e NÃO se reaproveita
  -- aqui — são duas coisas diferentes e misturá-las confundia quem lê a base.
  rank_key      text,
  -- RETIRAR É UM FACTO, NÃO UM DELETE.
  -- Isto governa quem vê dinheiro. Quando alguém reclamar «eu era closer em Outubro», a resposta
  -- tem de estar na base, com data e com nome de quem retirou. Uma linha apagada não responde a
  -- nada — e um papel que desaparece sem rasto é indistinguível de um papel que nunca existiu.
  retirado_at   timestamptz,
  retirado_por  uuid        references public.profiles(id) on delete set null,
  nota          text,
  constraint backoffice_papeis_papel_check
    check (papel in ('afiliado', 'setter', 'closer', 'prospector', 'team_leader'))
);

-- Uma pessoa não pode ter o MESMO papel activo duas vezes, mas pode ter o histórico de já o ter
-- tido e perdido. Índice parcial: a unicidade só vale enquanto está activo.
create unique index if not exists idx_backoffice_papeis_activo_unico
  on public.backoffice_papeis (user_id, papel)
  where retirado_at is null;

-- A pergunta feita em cada pedido ao backoffice: «que papéis activos tem esta pessoa?»
create index if not exists idx_backoffice_papeis_por_pessoa
  on public.backoffice_papeis (user_id)
  where retirado_at is null;

-- E a do admin: «quem é que é setter?»
create index if not exists idx_backoffice_papeis_por_papel
  on public.backoffice_papeis (papel, atribuido_at desc)
  where retirado_at is null;

alter table public.backoffice_papeis enable row level security;

-- Escrita: nada para anon nem authenticated. Só o service_role, que passa por cima da RLS.
revoke all on public.backoffice_papeis from anon, authenticated;
grant select on public.backoffice_papeis to authenticated;

-- Cada um vê os seus, e só os seus.
drop policy if exists backoffice_papeis_ver_os_seus on public.backoffice_papeis;
create policy backoffice_papeis_ver_os_seus
  on public.backoffice_papeis
  for select
  to authenticated
  using (user_id = auth.uid());

-- ─────────────────────────── acessos ao site ───────────────────────────

create table if not exists public.backoffice_acessos_site (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  -- Chaves do catálogo em `lib/backoffice-acessos-site.ts` (member_area, app_mobile, sinais, lms,
  -- mtmauto, scanner, mtmfunded). Sem constraint de valores de propósito: o catálogo cresce em
  -- código, com o caminho correspondente, e uma chave desconhecida é IGNORADA pela leitura em vez
  -- de rebentar. O contrário — uma migração por cada área nova — garantia que alguém acrescentava
  -- a área no admin e se esquecia da base.
  areas       text[]      not null default '{}',
  definido_por uuid       references public.profiles(id) on delete set null,
  atualizado_at timestamptz not null default now(),
  nota        text
);

alter table public.backoffice_acessos_site enable row level security;
revoke all on public.backoffice_acessos_site from anon, authenticated;
grant select on public.backoffice_acessos_site to authenticated;

-- Cada um vê a sua restrição — precisa dela para o site lhe explicar porque é que uma área não
-- aparece, em vez de a esconder sem dizer nada.
drop policy if exists backoffice_acessos_site_ver_o_seu on public.backoffice_acessos_site;
create policy backoffice_acessos_site_ver_o_seu
  on public.backoffice_acessos_site
  for select
  to authenticated
  using (user_id = auth.uid());

commit;
