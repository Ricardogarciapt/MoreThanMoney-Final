-- 140 — Quem entrou no grupo, e quem já foi acolhido
--
-- PORQUÊ
-- O grupo "MTM System" tem 62 membros e o pipeline não conhece nenhum. O dono mostrou o print de
-- «Jossiney Sousa joined the group via invite link»: essa pessoa não existe em `telegram_leads`,
-- nem em `mtm_leads`, nem em `ig_leads`, nem em `profiles`. O bot nunca soube que ela entrou.
--
-- Duas causas, independentes uma da outra:
--
--  1. O webhook não estava subscrito a `chat_member`. Quem entra num SUPERGRUPO por LINK DE CONVITE
--     não gera a mensagem de serviço `new_chat_members` — gera um update `chat_member`, que o
--     Telegram só entrega a quem o pede em `allowed_updates`. Quem entrava por link era invisível.
--
--  2. Mesmo quando disparava, o acolhimento (`handleLeadsGroupNewMembers`) PUBLICAVA a mensagem e
--     esquecia a pessoa. Quem não carregasse no botão desaparecia para sempre: não ficava lead, não
--     entrava no pipeline, ninguém lhe voltava a falar. É isto que faz um grupo de 62 pessoas e um
--     pipeline vazio.
--
-- Esta tabela resolve a segunda causa e protege da primeira. É, ao mesmo tempo:
--   · o REGISTO de quem passou pelo grupo (e quem saiu, que é a informação que mais ensina);
--   · o LIVRO DO «já disse isto», para ninguém ser acolhido duas vezes quando os dois tipos de
--     update chegam para a mesma pessoa — e a partir de agora vão chegar os dois.
--
-- A chave primária é (grupo, pessoa) e é ela que faz a desduplicação de graça: inserir duas vezes é
-- um conflito, e o conflito É a resposta a «fui eu o primeiro a ver esta entrada?». Mesmo raciocínio
-- de `bot_avisos_enviados` (migração 132) e da `chave` das tarefas (134).

begin;

create table if not exists public.telegram_grupo_membros (
  grupo_id         text        not null,
  tg_user_id       text        not null,
  -- Nome e username são os da altura. Servem para o acolhimento e para o lead ter nome no pipeline;
  -- ninguém decide nada por eles, por isso não vale a pena persegui-los quando mudam.
  nome             text,
  username         text,
  -- Por onde é que soubemos. 'convite' é o caso que estava invisível: entrada por link, que só o
  -- update `chat_member` conta.
  via              text,
  primeira_entrada timestamptz not null default now(),
  ultima_entrada   timestamptz not null default now(),
  -- Preenchido quando a pessoa sai. NÃO se apaga a linha: quem entrou e saiu é exactamente a pessoa
  -- sobre quem há algo a aprender, e apagá-la deixava o grupo a parecer que nunca a teve.
  saiu_em          timestamptz,
  -- A marca do «já foi acolhido». É o que cala a segunda mensagem.
  acolhido_em      timestamptz,
  -- O lead correspondente em `telegram_leads` já foi escrito? Separado do acolhimento porque uma
  -- coisa é falar-lhe e outra é ela existir no pipeline — e foi a segunda que faltava.
  lead_criado_em   timestamptz,
  primary key (grupo_id, tg_user_id)
);

-- «quem está cá dentro?» e «quem saiu ultimamente?»
create index if not exists telegram_grupo_membros_grupo_idx
  on public.telegram_grupo_membros (grupo_id, ultima_entrada desc);

-- Tudo fechado: isto é escrito pelo webhook (service role) e lido pelo /admin. A chave anon vai no
-- JavaScript do site, e a lista de quem está nos nossos grupos não é coisa que se sirva ao browser.
alter table public.telegram_grupo_membros enable row level security;
revoke all on public.telegram_grupo_membros from anon, authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTA PARA QUEM APLICA — falta um passo que NÃO se faz por migração.
--
-- O webhook tem de passar a receber `chat_member`, e isso muda-se na API do Telegram, em produção.
-- Fica aqui escrito e é decisão do dono correr:
--
--   curl -sS "https://api.telegram.org/bot$TELEGRAM_AIBOT_TOKEN/setWebhook" \
--     -d "url=https://www.morethanmoney.pt/api/telegram/webhook" \
--     -d 'allowed_updates=["message","edited_message","channel_post","edited_channel_post","callback_query","my_chat_member","chat_member"]'
--
-- Enquanto não for corrido, o código novo está correcto e adormecido: continua a acolher e a
-- registar quem entra por mensagem de serviço, e passa a fazê-lo também por convite no dia em que
-- o update for subscrito. O bot também precisa de ser ADMIN do grupo para receber `chat_member`.
-- ─────────────────────────────────────────────────────────────────────────────
