-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 132 — O LIVRO DOS AVISOS JÁ DADOS
--
-- PORQUÊ ISTO EXISTE
-- O bot passa a avisar o dono de três coisas: uma comissão nova a nascer, um negócio a apodrecer
-- no pipeline, alguém a subir de rank. Um vigia que corra a cada hora e não se lembre do que já
-- disse não é um vigia: é uma máquina de repetir. E um aviso repetido treina a pessoa a ignorar os
-- avisos — o que é pior do que não avisar, porque no dia em que o aviso importa ele já não é lido.
--
-- Isto não é um registo de auditoria (esse é `admin_centro_auditoria`, e é sobre o que o dono FEZ).
-- Isto é uma lista de «já disse isto», e a sua única função é calar a segunda vez.
--
-- PORQUE É UMA TABELA E NÃO UMA LINHA EM `site_settings`
-- Podia viver num JSON — e foi assim que se fez nos vigias antigos, que só precisavam de um
-- ligado/desligado. Aqui a chave é por OBJECTO (uma comissão, um negócio, uma subida), e um JSON
-- que cresce sem limite dentro de uma única linha acaba a ser lido e reescrito inteiro a cada
-- corrida, com duas corridas a pisarem-se uma à outra. Uma chave primária faz o trabalho de graça:
-- inserir duas vezes a mesma chave é um conflito, e o conflito É a resposta.
--
-- CHAVES QUE SE USAM (o formato vive no cron, aqui fica o porquê de cada um):
--   · comissao_nova:<uuid>            — uma vez por comissão, para sempre.
--   · negocio_parado:<uuid>:s<n>      — uma vez por SEMANA de paragem. Um negócio esquecido há um
--                                       mês tem de voltar a incomodar, senão adormece de vez; mas
--                                       de sete em sete dias, não de hora a hora.
--   · rank_subiu:<uuid>:<rank>        — uma vez por pessoa e por rank. Subir duas vezes ao mesmo
--                                       rank não é subir.
--
-- APAGAR ISTO É SEGURO, e é de propósito: a tabela vazia significa «não me lembro de nada», e a
-- primeira corrida seguinte volta a SEMEAR em silêncio em vez de gritar tudo de uma vez (ver o
-- cron). Nada aqui é prova de nada — é memória de curto prazo.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.bot_avisos_enviados (
  -- A chave é o aviso. Não há id próprio de propósito: a unicidade É o objectivo, e um id a mais
  -- só daria espaço para duas linhas com a mesma chave.
  chave       text        primary key,
  -- Que família de aviso é. Serve para semear («já vi ranks alguma vez?») e para limpar por tipo.
  tipo        text        not null,
  -- Sobre o quê, em texto, para se ler a tabela sem descodificar a chave.
  alvo        text,
  enviado_em  timestamptz not null default now()
);

comment on table public.bot_avisos_enviados is
  'Avisos que o bot do Telegram JA deu ao dono. Existe para nao repetir: um aviso repetido treina a pessoa a ignorar os avisos. Nao e auditoria (essa e admin_centro_auditoria) e pode ser apagada sem perder nada — a corrida seguinte volta a semear em silencio.';

comment on column public.bot_avisos_enviados.chave is
  'O aviso, em forma unica. Ex.: comissao_nova:<uuid>, negocio_parado:<uuid>:s3, rank_subiu:<uuid>:4. Inserir duas vezes a mesma chave da conflito, e o conflito e a resposta.';

comment on column public.bot_avisos_enviados.tipo is
  'A familia do aviso (comissao_nova, negocio_parado, rank_subiu). E por aqui que o cron pergunta «ja vi isto alguma vez?» para semear sem gritar na primeira corrida.';

-- Duas leituras, e só estas: «já disse isto?» (a chave primária resolve) e «já vi este tipo
-- alguma vez?» + a limpeza do que é velho. As duas últimas passam pelo par (tipo, data).
create index if not exists idx_bot_avisos_tipo_em
  on public.bot_avisos_enviados (tipo, enviado_em desc);

-- ── RLS ──
--
-- Fechado a sete chaves, como o resto do 128: só o service_role (o cron e o webhook) lê e escreve.
-- A chave anon vai no JavaScript do site, e esta tabela diz por tabela interposta quanto se deve a
-- quem — «comissão nova de 250 € para a Joana» é informação de dinheiro de outra pessoa.
alter table public.bot_avisos_enviados enable row level security;

revoke all on public.bot_avisos_enviados from anon, authenticated;

-- Sem política nenhuma para anon/authenticated: com a RLS ligada e sem policy, ninguém além do
-- service_role passa. Escrever uma policy `using (true)` aqui era abrir o que se acabou de fechar.
