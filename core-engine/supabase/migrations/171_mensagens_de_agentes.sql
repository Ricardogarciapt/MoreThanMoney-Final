-- O LIVRO DAS MENSAGENS QUE OS AGENTES MANDAM.
--
-- A DECISÃO DO DONO QUE ISTO SERVE (01/10/2026, palavras dele):
--   «eles devem-se focar em usar as minhas redes sociais, etc, para efectivamente mandar
--    mensagens, crescer os grupos de Telegram, com o MTM System etc. NÃO RETIRES A CAPACIDADE DE
--    MANDAR MENSAGEM.»
--
-- Esta migração não trava nada. Faz com que o envio deixe RASTO — que é a diferença entre «os
-- agentes mandam mensagens» ser uma frase e ser um facto verificável.
--
-- PORQUE É QUE É UMA TABELA NOVA, DEPOIS DE SE PROCURAR AS QUE HÁ:
--
--  · `whatsapp_mensagens` é um livro a sério e FICA a ser o livro do WhatsApp. O que lhe falta é
--    uma coluna que diga quem mandou — e é isso que se lhe acrescenta aqui, não uma tabela.
--  · `ig_setter_rascunhos` guarda o texto público e a DM do setter, e também só lhe falta o dono.
--  · `telegram_messages` PARECE o livro do Telegram e NÃO É: é o espelho do que ENTRA nos canais
--    (`message_id`, `channel_id`, `timestamp`, todos NOT NULL) e é lido pelas funcionalidades de
--    sinais. Escrever saídas lá dentro era a mesma proximidade de nomes que
--    `lib/whatsapp-colunas.check.ts` existe para apanhar — e as saídas do Telegram não têm
--    `channel_key` nem `timestamp` de canal nenhum.
--
-- Ou seja: o Telegram, que é o canal que o dono acabou de mandar usar, NÃO TINHA LIVRO NENHUM.
-- `sendTelegramChannelMessage` (lib/mtmcopy/telegram-bot.ts:165) é a porta por onde sai o funil, o
-- follow-up, o broker-gate e o acolhimento dos grupos, e não escrevia uma linha em sítio nenhum.
--
-- Esta tabela é o livro do AGENTE, transversal aos três canais: a pergunta que ela responde é
-- «que agente mandou o quê, a quem, quando, e com que resultado», e essa pergunta não se responde
-- juntando três tabelas com três formas diferentes. Os livros de cada canal continuam a ser os
-- livros de cada canal.

create table if not exists public.agentes_mensagens (
  id uuid primary key default gen_random_uuid(),

  -- Por onde saiu. Três canais, e só três: é o que o código sabe enviar hoje.
  canal text not null check (canal in ('telegram', 'whatsapp', 'instagram')),

  -- QUEM MANDOU. NULL é uma resposta legítima e não é um buraco: significa «esta mensagem não é
  -- atribuível», e o motivo ao lado diz porquê. Inventar um dono — cair no CEO por omissão — dava
  -- ao topo receita que ninguém ganhou, e a regra de vida das 48 h (lib/agentes/vida.ts)
  -- salvava-o com dinheiro que não era dele. Ver lib/agentes/receita.ts.
  agente_codigo text,

  -- Escrito sempre que `agente_codigo` é NULL **ou** `links_marcados` é 0. «Por atribuir» sem
  -- motivo é um número sem defesa — e uma mensagem com dono e sem link onde medir não é a mesma
  -- coisa que uma mensagem sem dono.
  --   'funil_sem_agente'  — o funil não tem dono declarado em AGENTE_POR_FUNIL
  --   'post_sem_dono'     — herdava do post comentado e o post é anterior à medição
  --   'pilar_sem_agente'  — o pilar do conteúdo não tem agente (marca-conteudo.ts)
  --   'codigo_invalido'   — veio um código que não tem a forma AG-…/CEO-…
  --   'sem_link_nosso'    — há dono, e a mensagem não tem nenhum link nosso onde pôr o código
  agente_motivo text,

  -- A QUEM. `chat_id` no Telegram, E.164 no WhatsApp, `comment_id` ou handle no Instagram. Texto
  -- livre de propósito: os três canais identificam uma pessoa de três maneiras, e normalizar isto
  -- numa coluna só obrigava a inventar uma forma comum que nenhum dos três usa.
  destino text not null,

  -- Que porta do código enviou. É o que permite perguntar «quem é que está a gastar o canal» sem
  -- ir ler o código: 'telegram:followup', 'instagram:setter', 'whatsapp:resposta'…
  funil text,

  tipo text not null default 'texto'
    check (tipo in ('texto', 'template', 'resposta_publica', 'dm')),

  -- O QUE FOI DITO. É a razão principal desta tabela existir: no dia em que uma mensagem correr
  -- mal, sem isto ninguém sabe o que foi dito. Truncado por quem escreve (4000), não aqui.
  texto text,

  -- Quantos sítios da mensagem levaram o código. Zero COM código é uma mensagem que não mede
  -- nada, e é diferente de uma mensagem sem dono.
  links_marcados integer not null default 0,

  -- O RESULTADO, e os três estados são os que `lib/whatsapp-mensageiro.ts` já distingue, porque a
  -- distinção é a que importa: 'recusada' é uma decisão nossa (consentimento, janela das 24 h,
  -- credenciais em falta) e 'falhou' é a rede ou a plataforma. Confundi-las fazia procurar uma
  -- avaria onde estava uma regra a funcionar.
  estado text not null check (estado in ('enviada', 'recusada', 'falhou')),

  -- O código curto mais a frase em português. Em português porque é o que o Ricardo lê.
  motivo text,

  -- O identificador do lado deles: `wa_message_id`, `message_id` do Telegram, `comment_id` do
  -- Instagram. É o que liga esta linha ao que se vê na aplicação quando alguém se queixa.
  referencia text,

  criado_em timestamptz not null default now()
);

-- A forma é a mesma de toda a casa (lib/agentes/atribuicao.ts pareceCodigoDeAgente). Sem isto, um
-- `agente_codigo = 'BLACKFRIDAY50'` entrava pela base e creditava a receita de uma campanha de
-- descontos a um agente que não fez nada.
alter table public.agentes_mensagens
  drop constraint if exists agentes_mensagens_codigo_forma;
alter table public.agentes_mensagens
  add constraint agentes_mensagens_codigo_forma
  check (agente_codigo is null or agente_codigo ~ '^(AG|CEO)-[A-Z0-9]{2,24}$');

alter table public.agentes_mensagens
  drop constraint if exists agentes_mensagens_motivo_valores;
alter table public.agentes_mensagens
  add constraint agentes_mensagens_motivo_valores
  check (agente_motivo is null or agente_motivo in (
    'funil_sem_agente', 'post_sem_dono', 'pilar_sem_agente', 'codigo_invalido', 'sem_link_nosso'
  ));

-- «O que é que este agente mandou» é a pergunta do painel. Parcial porque as linhas sem dono não
-- têm nada que se indexe por agente — e são as que vão ser mais, no início.
create index if not exists agentes_mensagens_agente_idx
  on public.agentes_mensagens (agente_codigo, criado_em desc)
  where agente_codigo is not null;

-- «O que saiu hoje, por canal» — o resumo da máquina de vendas.
create index if not exists agentes_mensagens_canal_idx
  on public.agentes_mensagens (canal, criado_em desc);

-- «O que foi dito a esta pessoa» — a pergunta de quem está a resolver uma queixa.
create index if not exists agentes_mensagens_destino_idx
  on public.agentes_mensagens (destino, criado_em desc);

-- Só o service role escreve e lê isto. Sem política nenhuma, o RLS activo nega a todos os papéis
-- que não o contornem — que é o que se quer: aqui dentro está o texto de conversas privadas com
-- leads, e nada disto tem de chegar ao browser de ninguém.
alter table public.agentes_mensagens enable row level security;

comment on table public.agentes_mensagens is
  'Livro das mensagens que os agentes mandam (Telegram/WhatsApp/Instagram): quem, a quem, o que, quando, e com que resultado. Escrito por lib/agentes/mensagem-livro.ts. Decisão do dono de 01/10/2026: a capacidade de enviar mantém-se; o que esta tabela faz é deixar rasto.';
comment on column public.agentes_mensagens.agente_codigo is
  'Agente que mandou. NULL = não atribuível, com o motivo em agente_motivo. Nunca cai no CEO por omissão.';


-- ── O CÓDIGO DO AGENTE CHEGA AO LEAD DO TELEGRAM ────────────────────────────────────────────────
--
-- É isto que fecha o caminho que o dono quer crescer: Instagram → bot → grupo. A resposta do funil
-- do Instagram leva `t.me/<bot>?start=lead`, e quem carregava chegava ao bot sem nada que dissesse
-- de onde veio — o lead nascia anónimo e o agente que o trouxe nunca era medido.
--
-- Com `lib/agentes/mensagem-saida.ts` o `start` passa a levar a carga (`lead_ag_AG_SCANNER`), o
-- webhook separa-a, e o código fica AQUI. Daqui segue sozinho: a ingestão da manhã
-- (lib/backoffice-dia-ingestao.ts) leva o lead ao pipeline, e o `?ag=` no browser leva-o à compra.
alter table public.telegram_leads
  add column if not exists agente_codigo text,
  -- Como é que se soube. 'start' = veio na carga do deep-link (prova do próprio clique);
  -- 'manual' = alguém o escreveu no painel. A distinção importa porque a primeira é prova e a
  -- segunda é uma afirmação.
  add column if not exists agente_origem text;

alter table public.telegram_leads
  drop constraint if exists telegram_leads_agente_codigo_forma;
alter table public.telegram_leads
  add constraint telegram_leads_agente_codigo_forma
  check (agente_codigo is null or agente_codigo ~ '^(AG|CEO)-[A-Z0-9]{2,24}$');

alter table public.telegram_leads
  drop constraint if exists telegram_leads_agente_origem_valores;
alter table public.telegram_leads
  add constraint telegram_leads_agente_origem_valores
  check (agente_origem is null or agente_origem in ('start', 'manual'));

create index if not exists telegram_leads_agente_idx
  on public.telegram_leads (agente_codigo)
  where agente_codigo is not null;

comment on column public.telegram_leads.agente_codigo is
  'Agente que trouxe este lead, lido da carga do deep-link /start (lib/agentes/mensagem-saida.ts separarCarga). NULL = chegou sem código.';


-- ── OS LIVROS DE CADA CANAL PASSAM A DIZER QUEM MANDOU ──────────────────────────────────────────
--
-- As colunas vão para os livros que JÁ existem em vez de se duplicar o conteúdo deles. Assim a
-- pergunta «de quem foi esta mensagem» responde-se onde a mensagem está, e não só no livro do
-- agente — que é o que permite cruzar os dois e ver se algum caminho está a enviar sem registar.

alter table public.whatsapp_mensagens
  add column if not exists agente_codigo text,
  add column if not exists agente_links_marcados integer not null default 0;

alter table public.whatsapp_mensagens
  drop constraint if exists whatsapp_mensagens_agente_codigo_forma;
alter table public.whatsapp_mensagens
  add constraint whatsapp_mensagens_agente_codigo_forma
  check (agente_codigo is null or agente_codigo ~ '^(AG|CEO)-[A-Z0-9]{2,24}$');

alter table public.ig_setter_rascunhos
  add column if not exists agente_codigo text,
  add column if not exists agente_links_marcados integer not null default 0;

alter table public.ig_setter_rascunhos
  drop constraint if exists ig_setter_rascunhos_agente_codigo_forma;
alter table public.ig_setter_rascunhos
  add constraint ig_setter_rascunhos_agente_codigo_forma
  check (agente_codigo is null or agente_codigo ~ '^(AG|CEO)-[A-Z0-9]{2,24}$');

comment on column public.whatsapp_mensagens.agente_codigo is
  'Agente que mandou esta mensagem. NULL numa entrada (foi a pessoa) ou numa saída não atribuível.';
comment on column public.ig_setter_rascunhos.agente_codigo is
  'Agente dono desta resposta — herdado do post comentado (social_scheduled_posts.agente_codigo).';
