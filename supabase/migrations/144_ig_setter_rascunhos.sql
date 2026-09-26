-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- O SETTER DO INSTAGRAM — a bancada onde as mensagens ficam ESCRITAS e à espera de aprovação.
--
-- O QUE A MEDIÇÃO DE 26/09 MOSTROU
--   ig_leads              6 comentários → 1 PESSOA (ruipaulo.fxcripto). Os 6 em `public_fallback`:
--                         nenhuma DM saiu, nem uma.
--   ig_engagement_log    65 respostas públicas, 65 com êxito. Nos últimos 30 dias: 19 respostas a
--                         5 pessoas (18 na marca, 1 na pessoal). NENHUMA delas virou lead.
--   ig_radar_prospetos  572 linhas → 0 pessoas. São PUBLICAÇÕES.
--   mtm_leads             1 pessoa (source `instagram_organic`).
--
-- Lido junto, isto diz uma coisa só: o funil por palavra-chave funciona e a conversão não é o
-- problema. O problema é que em 30 dias apenas 5 pessoas comentaram a sério, e as 5 receberam um
-- agradecimento e mais nada. O gargalo é a ENTRADA.
--
-- O QUE ESTA TABELA É
-- Um sítio onde a mensagem fica ESCRITA e não ENVIADA. O setter da persona (fase 1 pública + fase 2
-- por privado) nasce em modo rascunho: redige, calcula se a janela da Meta deixa a DM sair, e
-- pára aí. Quem carrega no botão é uma pessoa.
--
-- PORQUE É QUE NÃO ENVIA SOZINHO
-- O `ig-engage` já publica respostas automaticamente, e isso foi aprovado pelo dono — mas o que
-- ele publica são agradecimentos sem links e sem preços. Isto é outra coisa: é uma conversa de
-- venda a sair em nome da marca. A regra é a mesma do resto da casa (o motor real esteve em sombra
-- antes de escrever, o T2T nasceu por provider): o que é novo nasce DESLIGADO.
--
-- E há uma razão de plataforma, não só de prudência. A Meta dá UMA private reply por comentário,
-- dentro de 7 dias. Uma automação que gaste essa única mensagem com o texto errado não tem segunda
-- tentativa — o comentário está queimado para sempre. Uma revisão humana antes do primeiro envio
-- custa minutos; a alternativa não se desfaz.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.ig_setter_rascunhos (
  -- O comentário é a chave, e não um id nosso: a Meta conta a sua única private reply POR
  -- COMENTÁRIO, e é por comentário que temos de saber se já a gastámos.
  comment_id        text primary key,
  media_id          text not null,
  ig_account_id     text not null,
  ig_username       text,
  commenter         text,
  comment_text      text,

  -- Quando o comentário foi escrito. É daqui que sai a conta dos 7 dias — sem isto não há forma de
  -- saber se a DM ainda pode sair, e o código trata «não sei» como «não sai».
  comentado_em      timestamptz,

  -- FASE 1: a resposta pública. Curta, valida, não vende.
  texto_publico     text,
  -- FASE 2: a DM. Entrega o prometido e faz UMA pergunta.
  texto_dm          text,

  -- A DM pode mesmo sair? E, se não, porquê — `fora_dos_7_dias`, `data_desconhecida`,
  -- `ja_gastou_a_unica`, `conta_nao_escreve_sozinha`.
  --
  -- O motivo fica guardado porque é ELE que decide o texto da fase 1: quando a DM não sai, a
  -- resposta pública não pode dizer «mandei-te por privado». Prometer em público uma mensagem que
  -- não chega faz a marca parecer avariada à frente de todos os outros leitores do post.
  dm_possivel       boolean not null default false,
  dm_motivo         text,

  -- Em que degrau da qualificação vai esta conversa. Um de cada vez, nunca dois na mesma mensagem.
  passo             text not null default 'entrega',

  -- rascunho → aprovado → enviado. Ou descartado. Ou encerrado, quando a pessoa disse que não quer.
  --
  -- `encerrado` existe como estado e não como um simples «descartado» porque as duas coisas não são
  -- a mesma: descartar é uma decisão nossa sobre uma mensagem, encerrar é um NÃO da pessoa. Um não
  -- tem de ficar registado, para que ninguém — nem uma automação, nem um humano a olhar para a
  -- lista — lhe volte a escrever por distração.
  estado            text not null default 'rascunho'
                    check (estado in ('rascunho','aprovado','enviado','descartado','encerrado')),
  erro              text,

  criado_em         timestamptz not null default now(),
  decidido_em       timestamptz,
  enviado_em        timestamptz
);

-- A lista que o painel abre: o que está por decidir, o mais recente primeiro.
create index if not exists ig_setter_rascunhos_por_decidir
  on public.ig_setter_rascunhos (estado, criado_em desc);

-- Agrupar por pessoa. A lição do `ig_leads`: contar comentários em vez de pessoas fez uma fonte de
-- 1 pessoa parecer ter 6 leads.
create index if not exists ig_setter_rascunhos_por_pessoa
  on public.ig_setter_rascunhos (commenter);

-- Nada disto é do cliente: são mensagens de venda por aprovar. Só o service role (crons e rotas de
-- admin) lê e escreve. Sem o `revoke`, a chave anon vê a lista inteira de quem comentou e o que lhe
-- íamos dizer — foi exactamente o buraco das RPC `security definer` abertas ao público.
alter table public.ig_setter_rascunhos enable row level security;
revoke all on public.ig_setter_rascunhos from anon, authenticated;

-- ── O INTERRUPTOR, E NASCE DESLIGADO ────────────────────────────────────────────────────────────
--
-- Três andares, e os três começam em false. Separados de propósito: ligar a redacção dos rascunhos
-- (para o dono LER o que sairia) é uma decisão barata e reversível; ligar o envio é outra coisa
-- completamente diferente. Um interruptor só obrigaria a arriscar as duas ao mesmo tempo.
--
--   redigir        — o setter escreve rascunhos e não envia nada. É o modo de sombra.
--   enviar_publica — a fase 1 sai sozinha (a conta pessoal do Ricardo nunca; ver isAutoPublishBlocked).
--   enviar_dm      — a fase 2 sai sozinha. É a única mensagem que a Meta dá por comentário.
--
-- `value` é jsonb e é lido com `typeof v === 'string' ? JSON.parse(v) : v` no código, porque nesta
-- base a coluna tanto vem como objecto como string JSON conforme quem a escreveu. Não é paranoia:
-- já custou um dia a perceber porque é que uma configuração «guardada» não fazia efeito.
insert into public.site_settings (key, value)
values ('ig_setter_persona', '{"redigir": false, "enviar_publica": false, "enviar_dm": false}'::jsonb)
on conflict (key) do nothing;
