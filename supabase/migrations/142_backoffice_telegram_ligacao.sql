-- NOTA DE NUMERAÇÃO (26/09): este ficheiro foi escrito como `139_` e aplicado em produção com
-- esse nome, ao mesmo tempo que outro agente aplicava um `139_ib_contas_colunas_em_falta`. O
-- Supabase regista as migrações pela DATA e não pelo número, por isso as duas entraram sem
-- colidir — mas num repositório com dois ficheiros `139_` a ordem numa base NOVA passava a
-- depender da ordem alfabética, e isso é o género de coisa que só se descobre no dia em que se
-- levanta um ambiente de raiz. Renumerado para 142; em produção continua registado como 139.

-- 139 — Ligar o Telegram de quem trabalha no backoffice, sem abrir a conta de ninguém
--
-- PORQUÊ
-- O motor do dia (migração 134) já prepara o trabalho de cada pessoa e já sabe escrever-lhe: lê
-- `backoffice_contactos.telegram_chat_id` e manda o resumo. Só que essa tabela está VAZIA desde
-- que nasceu, porque não havia nenhuma forma de a preencher. O motor corre todas as manhãs a
-- preparar tarefas que ninguém sabe que existem.
--
-- Faltava a porta. E a porta é a parte perigosa: quem entra por ela passa a ver pipeline, tarefas
-- e o extracto de alguém. A pergunta não é «como é que a pessoa liga o Telegram» — é «como é que
-- se impede a pessoa A de ligar o Telegram dela à conta da pessoa B».
--
-- A DECISÃO: CÓDIGO DE USO ÚNICO, GERADO DENTRO DO BACKOFFICE.
-- A alternativa óbvia era pedir o email ao bot. Não serve: o email de um colega sabe-se, adivinha-se
-- e está escrito em cima de metade das conversas da equipa. Quem escrevesse `/ligar joao@…` ficava
-- a receber as tarefas do João, a ver o pipeline do João e o extracto do João — e o João nunca
-- saberia.
--
-- Com um código gerado DENTRO do backoffice, a identidade já foi provada antes de o código existir:
-- para o ver é preciso ter feito login na conta. O bot não autentica ninguém; só verifica um
-- segredo que só a própria pessoa pôde ter visto. É o mesmo raciocínio do `TELEGRAM_ADMIN_CHAT_ID`
-- do painel do dono — a autoridade nunca vem de algo que o próprio chat afirma sobre si.
--
-- Quatro travões, e cada um fecha um buraco diferente:
--   1. o código é de USO ÚNICO e morre em minutos (um código reutilizável reencaminhado num grupo
--      é uma conta entregue a quem passar por lá);
--   2. guarda-se o RESUMO (sha-256) e nunca o código (quem ler a tabela não liga nada com ela);
--   3. um chat de Telegram só pode estar ligado a UMA pessoa (índice único) — senão o mesmo
--      telemóvel recebia e riscava o trabalho de duas;
--   4. as tentativas erradas contam-se por chat, para o código não se adivinhar à força.

begin;

-- ── 1. Os códigos de ligação ────────────────────────────────────────────────
--
-- A chave primária é o RESUMO do código e não o código: é isso que faz de uma fuga desta tabela um
-- não-acontecimento. Quem escreve o código ao bot vê-o resumido da mesma maneira e a linha é
-- encontrada; quem só tem a tabela não tem nada que se escreva ao bot.
create table if not exists public.backoffice_telegram_codigos (
  codigo_hash    text primary key,
  user_id        uuid        not null references public.profiles(id) on delete cascade,
  criado_em      timestamptz not null default now(),
  -- Curto de propósito. Ver `lib/backoffice-telegram-codigo.ts`: o código vive o tempo de o copiar
  -- do ecrã para a conversa, e mais nada.
  expira_em      timestamptz not null,
  -- Preenchido no momento em que é consumido. Um código usado NÃO se apaga: fica como rasto de
  -- quem ligou o quê e quando. Apagá-lo deixava a pergunta «este chat como é que aqui chegou?»
  -- sem resposta possível.
  usado_em       timestamptz,
  usado_por_chat text
);

create index if not exists backoffice_telegram_codigos_pessoa_idx
  on public.backoffice_telegram_codigos (user_id, criado_em desc);

-- ── 2. As tentativas, por chat ──────────────────────────────────────────────
--
-- Uma tentativa errada não tem linha nos códigos (o resumo não corresponde a nada), por isso a
-- contagem tem de viver à parte. Sem isto, um código de oito caracteres continua a ser forte, mas
-- a força passava a ser a única defesa — e uma defesa só é a que costuma faltar.
create table if not exists public.backoffice_telegram_tentativas (
  chat_id       text primary key,
  contagem      integer     not null default 0,
  janela_inicio timestamptz not null default now()
);

-- ── 3. O contacto: quando ligou, e por que conta do Telegram ────────────────
alter table public.backoffice_contactos add column if not exists ligado_em timestamptz;
alter table public.backoffice_contactos add column if not exists telegram_username text;

-- UM CHAT, UMA PESSOA. É o travão que impede o caso que interessa: alguém que já tem o Telegram
-- ligado à conta dele a apontá-lo também à conta de outro. A base recusa, e recusa antes de o
-- código ser consumido.
create unique index if not exists backoffice_contactos_chat_unico
  on public.backoffice_contactos (telegram_chat_id)
  where telegram_chat_id is not null;

-- ── 4. Ninguém lê isto com a chave do browser ───────────────────────────────
--
-- RLS ligada e ZERO políticas, de propósito: nem o próprio dono da linha precisa de ler os seus
-- códigos pelo cliente do site. O código mostra-se UMA vez, na resposta da rota que o cria, e essa
-- rota corre com service role depois de verificar a sessão. Uma política de `select` aqui só daria
-- ao JavaScript da página a capacidade de reler um segredo que já foi mostrado.
alter table public.backoffice_telegram_codigos    enable row level security;
alter table public.backoffice_telegram_tentativas enable row level security;

revoke all on public.backoffice_telegram_codigos    from anon, authenticated;
revoke all on public.backoffice_telegram_tentativas from anon, authenticated;

commit;
