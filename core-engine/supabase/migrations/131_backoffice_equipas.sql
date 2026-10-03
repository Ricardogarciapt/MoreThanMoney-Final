-- 131 · QUEM LIDERA QUEM — o modelo de equipa que faltava.
--
-- PORQUÊ ISTO EXISTE
-- A migração 127 criou os papéis e deu ao `team_leader` as capacidades `bo.*_equipa`. Só que a
-- pergunta que essas capacidades precisam de responder — «QUEM são os teus liderados?» — não tinha
-- onde ser respondida: não havia tabela nenhuma a dizer que a Ana responde ao João. O resultado é
-- que `ambitoDeLeitura` recebia sempre uma lista vazia e um team leader só se via a si.
--
-- Isso foi DE PROPÓSITO e está escrito em `lib/backoffice-papeis.ts`: sem modelo de equipa, a
-- falha fecha em vez de abrir. Esta migração dá-lhe o modelo; a regra de fechar por omissão
-- mantém-se exactamente igual (ver `lib/backoffice-equipas.ts`).
--
-- O QUE ISTO GOVERNA, e por isso o cuidado: **quem vê dinheiro de quem**. Uma linha aqui dá a uma
-- pessoa acesso ao extracto, às leads, ao pipeline e às tarefas de outra. Não é uma tabela de
-- organização — é uma tabela de permissões com nome de organograma.
--
-- AS DUAS TABELAS
--   `backoffice_equipas`        — a equipa e o seu líder. Uma equipa por líder é o caso normal, mas
--                                 a tabela aceita várias (ex.: «Closers PT» e «Setters ES» com o
--                                 mesmo responsável) porque separar equipas é mais barato do que
--                                 fundir uma equipa que ficou grande demais.
--   `backoffice_equipa_membros` — quem está na equipa, desde quando, e quem o pôs lá. Tirar alguém
--                                 de uma equipa é um FACTO (`ate` preenchido), não um delete: quando
--                                 alguém perguntar «porque é que o João viu as minhas comissões em
--                                 Outubro», a resposta tem de estar na base.
--
-- DECISÕES QUE PODEM SER REVERTIDAS (e ficam aqui escritas para não se descobrirem por acidente):
--
--  1. UMA PESSOA RESPONDE A UMA PESSOA. O índice único global impede a mesma pessoa de estar em
--     duas equipas activas ao mesmo tempo. Não é uma limitação técnica: com duas equipas activas,
--     dois líderes veem o dinheiro da mesma pessoa e a pergunta «quem é o responsável dela» deixa
--     de ter resposta. Se o dono quiser matriz, tira-se o índice — mas é uma decisão dele.
--  2. UM NÍVEL, SEM RECURSÃO. Um líder vê os membros DIRECTOS da(s) sua(s) equipa(s). Se um membro
--     for ele próprio líder de outra equipa, os membros dessa NÃO sobem. Expandir em cadeia é
--     fácil de escrever e impossível de auditar à vista — e um engano abre acesso a linhas de
--     gente que o líder de cima nunca conheceu.
--  3. O LÍDER NÃO É MEMBRO DA SUA PRÓPRIA EQUIPA. O `check` impede-o. Ele já se vê a si pelo âmbito
--     próprio, e ter-se a si na lista de liderados só servia para esconder um engano de leitura.
--
-- QUEM ESCREVE: só o service_role, pelas rotas `/api/admin/backoffice/equipas*`, que exigem admin.
-- A chave anon vai dentro do JavaScript do site: se ela pudesse inserir aqui, qualquer visitante
-- criava uma equipa com o Ricardo dentro e passava a ler o dinheiro dele.

begin;

-- ─────────────────────────────── a equipa ───────────────────────────────

create table if not exists public.backoffice_equipas (
  id          uuid primary key default gen_random_uuid(),
  nome        text        not null,
  -- O líder. `on delete cascade`: sem líder não há equipa, e uma equipa órfã continuaria a dar
  -- acesso a linhas a partir de um id que já não existe.
  lider_id    uuid        not null references public.profiles(id) on delete cascade,
  criada_em   timestamptz not null default now(),
  criada_por  uuid        references public.profiles(id) on delete set null,
  -- Arquivar em vez de apagar, pelo mesmo motivo de sempre: o histórico das comissões aponta para
  -- decisões tomadas quando esta equipa existia. Arquivada = deixa de dar acesso, imediatamente.
  arquivada_em  timestamptz,
  arquivada_por uuid      references public.profiles(id) on delete set null,
  nota        text,
  constraint backoffice_equipas_nome_nao_vazio check (length(btrim(nome)) > 0)
);

-- Duas equipas activas com o mesmo nome e o mesmo líder é sempre um clique a dobrar, nunca uma
-- intenção. A unicidade só vale enquanto estão activas.
create unique index if not exists uq_backoffice_equipas_activa
  on public.backoffice_equipas (lider_id, lower(btrim(nome)))
  where arquivada_em is null;

-- A pergunta de cada pedido ao backoffice: «que equipas é que esta pessoa lidera?»
create index if not exists idx_backoffice_equipas_lider
  on public.backoffice_equipas (lider_id)
  where arquivada_em is null;

-- ─────────────────────────── quem está na equipa ───────────────────────────

create table if not exists public.backoffice_equipa_membros (
  id           uuid primary key default gen_random_uuid(),
  equipa_id    uuid        not null references public.backoffice_equipas(id) on delete cascade,
  membro_id    uuid        not null references public.profiles(id) on delete cascade,
  desde        timestamptz not null default now(),
  posto_por    uuid        references public.profiles(id) on delete set null,
  -- Saiu da equipa. Preenchido = deixa de dar acesso, e a linha fica como prova de que deu.
  ate          timestamptz,
  retirado_por uuid        references public.profiles(id) on delete set null,
  nota         text
);

-- UMA equipa activa por pessoa (decisão 1 acima). Índice GLOBAL, e não por equipa: é a diferença
-- entre «não repete na mesma equipa» e «não responde a dois líderes».
create unique index if not exists uq_backoffice_equipa_membros_uma_equipa
  on public.backoffice_equipa_membros (membro_id)
  where ate is null;

-- A leitura quente: os membros activos de uma equipa.
create index if not exists idx_backoffice_equipa_membros_equipa
  on public.backoffice_equipa_membros (equipa_id)
  where ate is null;

-- E o histórico de uma pessoa, para responder a «em que equipa estava em Outubro».
create index if not exists idx_backoffice_equipa_membros_historico
  on public.backoffice_equipa_membros (membro_id, desde desc);

-- O líder não é membro da sua própria equipa. Tem de ser um trigger e não um `check`: a condição
-- precisa do `lider_id`, que vive na outra tabela.
create or replace function public.backoffice_equipa_membro_valido()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lider uuid;
begin
  select lider_id into v_lider from public.backoffice_equipas where id = new.equipa_id;
  if v_lider is not null and v_lider = new.membro_id then
    raise exception 'O líder não pode ser membro da sua própria equipa (já se vê a si pelo âmbito próprio).';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_backoffice_equipa_membro_valido on public.backoffice_equipa_membros;
create trigger trg_backoffice_equipa_membro_valido
  before insert or update of equipa_id, membro_id
  on public.backoffice_equipa_membros
  for each row execute function public.backoffice_equipa_membro_valido();

-- ─────────────────────────────── quem lê ───────────────────────────────

alter table public.backoffice_equipas enable row level security;
alter table public.backoffice_equipa_membros enable row level security;

revoke all on public.backoffice_equipas from anon, authenticated;
revoke all on public.backoffice_equipa_membros from anon, authenticated;
grant select on public.backoffice_equipas to authenticated;
grant select on public.backoffice_equipa_membros to authenticated;

-- O líder vê a(s) sua(s) equipa(s); o membro vê a equipa a que pertence (precisa de saber a quem
-- responde). Mais ninguém, nem para saber que existem.
drop policy if exists backoffice_equipas_ver on public.backoffice_equipas;
create policy backoffice_equipas_ver
  on public.backoffice_equipas
  for select
  to authenticated
  using (
    lider_id = auth.uid()
    or exists (
      select 1 from public.backoffice_equipa_membros m
      where m.equipa_id = backoffice_equipas.id and m.membro_id = auth.uid() and m.ate is null
    )
  );

-- Nas linhas de membro: cada um vê a sua, e o líder vê as da sua equipa. A leitura que as páginas
-- do backoffice usam NÃO passa por aqui (passa pelo servidor, com service role, em
-- `lib/backoffice-equipas.ts`); isto serve para um ecrã poder mostrar a equipa sem ida ao servidor.
drop policy if exists backoffice_equipa_membros_ver on public.backoffice_equipa_membros;
create policy backoffice_equipa_membros_ver
  on public.backoffice_equipa_membros
  for select
  to authenticated
  using (
    membro_id = auth.uid()
    or exists (
      select 1 from public.backoffice_equipas e
      where e.id = backoffice_equipa_membros.equipa_id and e.lider_id = auth.uid()
    )
  );

comment on table public.backoffice_equipas is
  'Equipas do backoffice de vendas: quem lidera quem. É uma tabela de PERMISSÕES — uma linha aqui dá ao líder acesso ao extracto, leads, pipeline e tarefas dos membros. Ver migração 131 e lib/backoffice-equipas.ts.';
comment on table public.backoffice_equipa_membros is
  'Quem está em que equipa, desde quando e por decisão de quem. Retirar é `ate` preenchido, não delete: o acesso que já foi dado tem de ficar provado. Uma pessoa só pode ter UMA linha activa (um líder por pessoa).';

commit;
