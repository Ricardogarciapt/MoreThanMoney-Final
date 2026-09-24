-- 124 · Prospeção no Telegram: contactos vistos e mapa dos grupos
--
-- PORQUÊ
-- O funil do Telegram tem CINCO linhas em `telegram_leads` — duas são testes, uma é o dono. O
-- funil não está partido: está vazio. Há gente nos nossos grupos, gente que entrou e saiu, gente
-- que escreveu uma pergunta e nunca mais apareceu, e nada disso chega ao funil, porque o funil só
-- conhece quem escreve ao bot em privado.
--
-- Estas duas tabelas guardam o que o sistema JÁ vê e deitava fora.
--
-- O QUE ENTRA (e o que fica de fora, de propósito)
--   `prospecao_contactos` — só gente que interagiu CONNOSCO: escreveu num grupo nosso, entrou num
--   grupo nosso, ou saiu de um. Guarda o identificador, o nome público e a CONTAGEM do que fez.
--   Não guarda o que as pessoas escreveram, não guarda quem está em grupos de terceiros, e não
--   serve para enviar nada — o Telegram não deixa um bot escrever a quem nunca lhe falou, e o
--   MTProto do dono só lê. A lista existe para ele decidir a quem fala.
--
--   `prospecao_grupos` — o mapa dos diálogos: título, tipo, se é nosso, quão activo está. Zero
--   dados pessoais. É a fotografia de onde estamos, não de quem lá está.
--
-- QUEM ESCREVE
--   Só o service_role: o webhook do bot (`/api/telegram/webhook`), o cron `prospecao-radar` e as
--   rotas de `/admin`. Por isso as duas tabelas ficam com RLS ligada e SEM políticas — a chave
--   anon vai no JavaScript do site e não tem nada que ver isto.

begin;

-- ─────────────────────────────── contactos ───────────────────────────────

create table if not exists public.prospecao_contactos (
  tg_user_id        text primary key,
  username          text,
  first_name        text,
  -- Os chat_id dos NOSSOS grupos onde apareceu. Array e não tabela-ponte: são três ou quatro
  -- grupos por pessoa e a única pergunta que se faz é "em quantos está".
  grupos            text[]      not null default '{}',
  mensagens         integer     not null default 0,
  entradas          integer     not null default 0,
  saidas            integer     not null default 0,
  primeiro_visto_at timestamptz not null default now(),
  ultimo_visto_at   timestamptz not null default now(),
  -- 'novo' → ainda por tratar · 'abordado' → o dono já lhe falou · 'ignorado' → não serve
  -- 'no_funil' → já entrou em telegram_leads, sai da prospeção e passa a seguimento
  estado            text        not null default 'novo',
  nota              text,
  updated_at        timestamptz not null default now(),
  constraint prospecao_contactos_estado_check
    check (estado in ('novo', 'abordado', 'ignorado', 'no_funil'))
);

-- A lista lê-se sempre igual: os por tratar, os mais recentes primeiro.
create index if not exists idx_prospecao_contactos_fila
  on public.prospecao_contactos (estado, ultimo_visto_at desc);

alter table public.prospecao_contactos enable row level security;
revoke all on public.prospecao_contactos from anon, authenticated;

-- ─────────────────────────────── grupos ───────────────────────────────

create table if not exists public.prospecao_grupos (
  chat_id          text primary key,
  titulo           text,
  tipo             text,
  membros          integer,
  -- Grupo nosso (administramos) ou de terceiros (estamos lá dentro como qualquer pessoa).
  -- A diferença decide o que se pode fazer: no nosso publica-se; no de terceiros participa-se.
  nosso            boolean     not null default false,
  ultima_atividade timestamptz,
  -- De onde veio esta linha: 'bot' (o bot está no grupo) ou 'mtproto' (só a conta pessoal lá está).
  fonte            text        not null default 'bot',
  nota             text,
  atualizado_at    timestamptz not null default now()
);

create index if not exists idx_prospecao_grupos_atividade
  on public.prospecao_grupos (nosso, ultima_atividade desc nulls last);

alter table public.prospecao_grupos enable row level security;
revoke all on public.prospecao_grupos from anon, authenticated;

-- ─────────────────────────────── o registo, em uma volta ───────────────────────────────

-- PORQUÊ UMA FUNÇÃO E NÃO UM UPSERT NA APLICAÇÃO
-- Cada mensagem num grupo é uma chamada. Fazê-lo em duas voltas (ler, somar, escrever) num
-- webhook que já responde a mensagens de sinais é pedir corridas e contagens perdidas. Aqui é uma
-- volta, atómica, e o `+1` acontece dentro da base.
--
-- SECURITY INVOKER de propósito: quem chama é o service_role, que passa por cima da RLS na mesma.
-- Uma função DEFINER aberta ao PUBLIC foi exactamente o buraco de setembro — não se repete.
create or replace function public.prospecao_registar_contacto(
  p_tg_user_id text,
  p_username   text,
  p_first_name text,
  p_chat_id    text,
  p_motivo     text
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.prospecao_contactos as c (
    tg_user_id, username, first_name, grupos,
    mensagens, entradas, saidas,
    primeiro_visto_at, ultimo_visto_at, updated_at
  )
  values (
    p_tg_user_id,
    nullif(p_username, ''),
    nullif(p_first_name, ''),
    case when p_chat_id is null then '{}'::text[] else array[p_chat_id] end,
    case when p_motivo = 'escreveu' then 1 else 0 end,
    case when p_motivo = 'entrou'   then 1 else 0 end,
    case when p_motivo = 'saiu'     then 1 else 0 end,
    now(), now(), now()
  )
  on conflict (tg_user_id) do update set
    -- O nome mais recente ganha, mas um nome novo em branco nunca apaga o que já lá estava.
    username        = coalesce(nullif(excluded.username, ''),   c.username),
    first_name      = coalesce(nullif(excluded.first_name, ''), c.first_name),
    grupos          = case
                        when p_chat_id is null or p_chat_id = any(c.grupos) then c.grupos
                        else c.grupos || p_chat_id
                      end,
    mensagens       = c.mensagens + case when p_motivo = 'escreveu' then 1 else 0 end,
    entradas        = c.entradas  + case when p_motivo = 'entrou'   then 1 else 0 end,
    saidas          = c.saidas    + case when p_motivo = 'saiu'     then 1 else 0 end,
    ultimo_visto_at = now(),
    -- Quem volta a aparecer depois de ter sido abordado volta à fila: é sinal de vida, e sinal
    -- de vida é a única coisa que se espera de quem já levou uma abordagem.
    estado          = case when c.estado = 'abordado' then 'novo' else c.estado end,
    updated_at      = now();
end;
$$;

revoke all on function public.prospecao_registar_contacto(text, text, text, text, text)
  from public, anon, authenticated;

commit;
