-- 138 — A REDE DE IBs: as contas de corretora que hoje vivem em ficheiros Excel
--
-- O PROBLEMA
-- O negócio de IB da MTM está espalhado por quatro corretoras — PU Prime (a casa), Infinox,
-- Hantec e VT Markets — e existe só em exportações de Excel que alguém descarrega, olha e fecha.
-- Ninguém no sistema sabe que o Cayo Magni negociou 228 lotes na Infinox, nem que há comissão a
-- ser paga por uma corretora que não é a nossa. Não se pode trabalhar o que não se vê.
--
-- O objectivo declarado pelo dono: trazer esse volume todo para a mesma rede, fechar parcerias e
-- pôr essas pessoas dentro do ecossistema.
--
-- Esta migração dá-lhe um sítio. Não inventa dados: guarda o que as corretoras exportam, liga cada
-- conta a um membro da casa quando se consegue, e diz em que ponto da migração está.

-- ── Quem são os IBs ──────────────────────────────────────────────────────────
--
-- Tabela à parte e não um papel novo em `backoffice_papeis`: ser IB não é uma função de vendas, é
-- uma relação com uma corretora, com um identificador dela. Metê-lo no mesmo saco dos setters e
-- closers obrigava a mexer nas capacidades todas por uma coisa que não é do mesmo tipo.
create table if not exists public.ib_membros (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  -- `master` responde pela rede inteira perante a corretora; `sub` traz clientes por baixo dele.
  nivel        text not null default 'sub' check (nivel in ('master', 'sub')),
  -- O identificador desta pessoa NA corretora (ex.: 7526800 na PU Prime). É por aqui que as
  -- exportações se ligam a gente nossa — sem isto, uma linha de Excel não tem dono.
  ib_externo   text,
  corretora    text not null default 'pu_prime',
  desde        timestamptz not null default now(),
  ate          timestamptz,
  nota         text
);

create index if not exists ib_membros_externo_idx on public.ib_membros (corretora, ib_externo);

-- ── As contas ────────────────────────────────────────────────────────────────
--
-- Uma linha por conta de corretora, venha ela de que exportação vier. A chave é (corretora, conta)
-- porque é isso que a corretora garante único — o email repete-se (a mesma pessoa abre cinco
-- contas) e o nome repete-se ainda mais.
create table if not exists public.ib_contas (
  id               uuid primary key default gen_random_uuid(),
  corretora        text not null check (corretora in ('pu_prime', 'infinox', 'hantec', 'vtmarkets')),
  conta            text not null,
  cliente_nome     text,
  cliente_email    text,
  cliente_telefone text,

  -- Quando se consegue ligar a conta a um membro da casa. Fica NULO enquanto não se conseguir —
  -- um palpite aqui seria pior do que o vazio, porque daria a alguém o crédito de um cliente que
  -- não é dele, e comissões calculam-se a partir disto.
  user_id          uuid references public.profiles(id) on delete set null,
  ib_id            uuid references public.profiles(id) on delete set null,
  ib_externo       text,

  tipo_conta       text,
  plataforma       text,
  moeda            text,
  saldo            numeric,
  equity           numeric,
  volume_lotes     numeric,
  comissao_usd     numeric,
  depositos_usd    numeric,

  registo          date,
  ultima_negociacao date,
  ultimo_deposito  date,

  /**
   * O PONTO DA MIGRAÇÃO.
   *
   * `na_casa`     — já está na PU Prime. Não há nada a fazer senão cuidar dela.
   * `a_transitar` — está noutra corretora e vale a pena trazer. É daqui que saem negócios.
   * `a_fechar`    — está noutra corretora e não vale a pena mexer (sem volume, sem depósito).
   * `perdido`     — tentou-se e não veio. Fica para não se voltar a tentar sem se saber porquê.
   * `por_avaliar` — chegou agora de uma importação e ninguém olhou. É o estado de entrada.
   */
  estado_migracao  text not null default 'por_avaliar'
                   check (estado_migracao in ('na_casa','a_transitar','a_fechar','perdido','por_avaliar')),

  nota             text,
  importado_em     timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),

  unique (corretora, conta)
);

create index if not exists ib_contas_estado_idx on public.ib_contas (estado_migracao, corretora);
create index if not exists ib_contas_email_idx on public.ib_contas (lower(cliente_email));
create index if not exists ib_contas_ib_idx on public.ib_contas (ib_id);

-- ── Quem vê isto ─────────────────────────────────────────────────────────────
--
-- Dados de clientes de corretora: nome, email, telefone, saldo. Não é informação para a equipa de
-- vendas inteira. A leitura fica fechada à RLS e o acesso faz-se pelo servidor, com service role,
-- depois de a página verificar que a pessoa é IB — como o resto do backoffice já faz.
alter table public.ib_membros enable row level security;
alter table public.ib_contas enable row level security;

-- Cada IB vê a sua própria linha de membro. Mais nada passa por RLS: o resto é servidor.
drop policy if exists ib_membros_ver_o_seu on public.ib_membros;
create policy ib_membros_ver_o_seu on public.ib_membros for select using (user_id = auth.uid());

-- ── A rede que já existe hoje ────────────────────────────────────────────────
--
-- O Ricardo é o master (IB 7526800 na PU Prime, que é o que aparece em todas as linhas da
-- exportação). Os sub-IBs entram sem `ib_externo` porque ainda não têm um: tê-lo é precisamente
-- o passo seguinte do plano, e inventar um número aqui punha a base a mentir.
insert into public.ib_membros (user_id, nivel, ib_externo, corretora, nota)
select id, 'master', '7526800', 'pu_prime', 'Master IB da rede MTM na PU Prime.'
from public.profiles where email = 'ricardo.subtilgarcia@gmail.com'
on conflict (user_id) do nothing;

insert into public.ib_membros (user_id, nivel, corretora, nota)
select id, 'sub', 'pu_prime', 'Sub-IB da rede MTM — falta o identificador próprio na corretora.'
from public.profiles
where email in (
  'rui.pmcr@gmail.com',        -- Rui Rodrigues
  'lilly.darling111@gmail.com',-- Lily Darling
  'rj_sousa@hotmail.com',      -- Rafael Bastos
  'imrubenfp@gmail.com'        -- Ruben Pereira
)
on conflict (user_id) do nothing;
