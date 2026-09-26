-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- CAPTAÇÃO — guardar o que permite trabalhar a pessoa, e guardar QUEM PEDIU para ser contactado.
--
-- O QUE A MEDIÇÃO DE 26/09 MOSTROU
-- Fonte a fonte, a contagem de quem tem forma de contacto:
--   telegram_leads        6 pessoas → 0 com email, 0 com telefone (a tabela não tem sequer colunas
--                         para isso). 2 com @username; as outras 4 só existem como um `chat_id`.
--   ig_leads              6 comentários → 1 PESSOA → 0 com email, 0 com telefone. Só o handle. (A
--                         diferença entre as duas contagens é o aviso: contar comentários em vez de
--                         pessoas fazia esta fonte parecer seis vezes maior do que é.)
--   ig_radar_prospetos  569 linhas  → 0 pessoas. São PUBLICAÇÕES, não gente: media_id, hashtag,
--                         legenda. Contá-las como leads é a forma mais rápida de uma lista de 600
--                         parecer um activo e ser uma ilusão.
--   mtm_leads             1 pessoa  → 0 com email.
--   ib_contas           218 contas  → 80 com email, 92 com telefone, 126 sem nada de nada.
--   profiles            134 pessoas → 134 com email, 17 com telefone.
-- Universo real de emails distintos em toda a base: 187.
--
-- E O NÚMERO QUE MANDA: `email_preferences` — a única tabela onde consentimento de marketing podia
-- estar registado — tem ZERO linhas. Não há, hoje, uma única pessoa nesta base de quem se possa
-- provar que pediu para receber campanhas. Isto não é um detalhe de conformidade: é a diferença
-- entre uma lista e um problema. Estas pessoas estão na UE.
--
-- O QUE ESTA MIGRAÇÃO FAZ
-- 1. Deixa de perder pelo caminho o que as fontes JÁ dão (idioma, país, interesse, handles, o uid
--    de corretora) — ver o levantamento coluna a coluna em `lib/backoffice-dia-ingestao.ts`.
-- 2. Dá ao funil do bot um sítio onde aterrar um email e um telefone, que hoje não existe.
-- 3. Cria o livro do consentimento: quem pediu, onde, com que texto à frente, e quando retirou.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ, DE PROPÓSITO
-- NÃO inventa consentimento para ninguém. Nem para os 134 perfis, nem para os 80 emails das
-- exportações de IB. Marcar retroactivamente 187 pessoas como «aceitaram» seria escrever uma
-- mentira num livro cuja única utilidade é ser verdade — e a primeira queixa de spam transforma-a
-- em prova contra a casa. O livro nasce vazio e enche-se para a frente, com quem pede.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

-- ── 1. O que se perdia entre a fonte e o pipeline ────────────────────────────────────────────────

-- Estas colunas não são campos «nice to have»: cada uma existe porque a fonte já a dá e a ingestão
-- a deitava fora ou a enterrava dentro do texto livre da `nota`. Uma coisa escrita na `nota` não se
-- segmenta — e sem segmentar não há campanha, há um envio para todos.
alter table vendas_negocios
  -- Em que língua se escreve a esta pessoa. 59 perfis e os leads do bot sabem-no; o pipeline não.
  -- Escrever em português a quem se registou em alemão é a forma mais barata de perder um lead.
  add column if not exists idioma text,
  add column if not exists pais text,
  -- O que a pessoa DISSE que quer. Vinha do bot (`interesse`) e do Instagram (a palavra que ela
  -- comentou) e ficava só na nota, em prosa. É o campo que separa «quem quer copytrading» de «quem
  -- quer aprender» — dois discursos diferentes que hoje recebiam o mesmo email.
  add column if not exists interesse text,
  add column if not exists instagram_handle text,
  add column if not exists telegram_username text,
  -- Já abriu conta na corretora. Não é um dado a mais: é o sinal mais quente que existe nesta casa,
  -- e estava a ser descartado à entrada do pipeline.
  add column if not exists broker_uid text,
  add column if not exists etiquetas text[];

-- CONTACTÁVEL — a coluna que impede a lista de se mentir a si mesma.
--
-- Um lead sem forma de lhe chegar não é um lead: é uma linha que faz a lista parecer maior do que é
-- e faz a pessoa que a trabalha perder a confiança nela ao terceiro nome sem contacto. É calculada
-- e não escrita à mão porque um booleano que alguém tem de se lembrar de actualizar é um booleano
-- que vai estar errado — e este vai ser usado para decidir a quem se escreve.
alter table vendas_negocios
  add column if not exists contactavel boolean
  generated always as (
    coalesce(btrim(email), '') <> ''
    or coalesce(btrim(telefone), '') <> ''
    or coalesce(btrim(telegram_id), '') <> ''
    or coalesce(btrim(telegram_username), '') <> ''
    or coalesce(btrim(instagram_handle), '') <> ''
  ) stored;

create index if not exists idx_vendas_negocios_contactavel on vendas_negocios (contactavel) where contactavel;
create index if not exists idx_vendas_negocios_idioma on vendas_negocios (idioma) where idioma is not null;

comment on column vendas_negocios.contactavel is
  'Calculada: há pelo menos uma forma de chegar a esta pessoa. Falsa = não é um lead, é uma linha.';
comment on column vendas_negocios.interesse is
  'O que a pessoa declarou querer, na fonte. Segmenta campanhas — não confundir com pack_previsto, que é o que NÓS achamos.';

-- ── 2. O bot passa a ter onde pôr um contacto ────────────────────────────────────────────────────

-- O funil do Telegram é o único sítio desta casa onde uma conversa pode pedir um email e a pessoa
-- dá-o de livre vontade. Hoje não havia coluna: a resposta dela não tinha para onde ir, e o funil
-- ficava preso a um `chat_id` que só serve dentro do Telegram. Quatro dos seis leads do bot são
-- exactamente isso — um número, sem nome nem forma de contacto fora da app.
alter table telegram_leads
  add column if not exists email text,
  add column if not exists telefone text,
  -- Quando se pediu. Serve para NÃO voltar a pedir a quem já disse que não: repetir o pedido é o
  -- que faz alguém sair do grupo.
  add column if not exists contacto_pedido_em timestamptz;

comment on column telegram_leads.email is
  'Email dado pela pessoa na conversa. Dar o email não é consentimento de marketing — esse fica em captacao_consentimento.';

-- ── 3. O livro do consentimento ──────────────────────────────────────────────────────────────────

-- PORQUE É QUE ISTO É UMA TABELA E NÃO UM BOOLEANO NO PERFIL
-- Um booleano diz «sim». Não diz onde, nem quando, nem o que a pessoa tinha à frente dos olhos
-- quando disse sim — e é isso, e só isso, que se mostra a quem pergunta. Um `marketing_emails =
-- true` sem proveniência não se defende diante de uma queixa, e não distingue quem se inscreveu
-- num ímane de leads de quem apareceu numa exportação de corretora.
--
-- É um LIVRO e não um estado: as linhas não se apagam nem se reescrevem. Retirar consentimento
-- escreve `retirado_em` na linha que existe. Quem quiser saber o estado de agora lê a vista
-- `captacao_permissao_email`, que resolve o histórico.
create table if not exists captacao_consentimento (
  id uuid primary key default gen_random_uuid(),

  -- Como se identifica a pessoa. Guarda-se o email sempre em minúsculas e sem espaços, porque é
  -- assim que é comparado em todos os sítios que decidem envios.
  email text,
  telefone text,
  telegram_chat_id text,
  instagram_handle text,

  -- ONDE deu. Não é etiqueta de relatório: é o que se responde quando alguém pergunta «onde é que
  -- eu vos dei isto?». Uma lista cujas linhas não sabem responder a essa pergunta não se usa.
  canal text not null,

  -- A BASE LEGAL, explícita e obrigatória.
  --
  -- 'consentimento'          a pessoa pediu para receber. Serve para marketing.
  -- 'relacao_contratual'     é cliente e o email é sobre o serviço que paga (renovação, acesso,
  --                          incidente). NÃO serve para campanhas — e é aqui que a maioria dos
  --                          sistemas se engana, porque é o atalho mais tentador que existe.
  -- 'sem_base'               existe na base e nunca pediu nada. Fica registado a dizer isso mesmo,
  --                          para que a ausência de base seja um facto escrito e não um esquecimento.
  base_legal text not null check (base_legal in ('consentimento', 'relacao_contratual', 'sem_base')),

  pedido_em timestamptz not null default now(),

  -- A PROVA: o texto literal que a pessoa aceitou. Obrigatório de propósito. Se ninguém consegue
  -- escrever aqui o que ela leu, então ela não leu nada, e isso não é consentimento.
  prova text not null,
  origem_url text,

  retirado_em timestamptz,
  retirado_por text,

  nota text,
  criado_por uuid,
  criado_em timestamptz not null default now(),

  -- Uma linha sem forma de identificar a pessoa não permite decidir nada sobre ninguém.
  constraint captacao_consentimento_tem_identidade check (
    coalesce(btrim(email), '') <> ''
    or coalesce(btrim(telefone), '') <> ''
    or coalesce(btrim(telegram_chat_id), '') <> ''
    or coalesce(btrim(instagram_handle), '') <> ''
  )
);

create index if not exists idx_captacao_consentimento_email on captacao_consentimento (lower(btrim(email))) where email is not null;
create index if not exists idx_captacao_consentimento_telegram on captacao_consentimento (telegram_chat_id) where telegram_chat_id is not null;
create index if not exists idx_captacao_consentimento_pedido on captacao_consentimento (pedido_em desc);

comment on table captacao_consentimento is
  'Livro de consentimento: quem pediu para ser contactado, onde, com que texto à frente, e quando retirou. Nunca preenchido retroactivamente.';

-- Ninguém além do service role lê isto. A tabela junta email, telefone e handle da mesma pessoa —
-- é exactamente o tipo de vista que a chave anon já expôs uma vez nesta base, pelas funções
-- SECURITY DEFINER abertas ao público. Não se repete.
alter table captacao_consentimento enable row level security;
revoke all on captacao_consentimento from anon, authenticated;

-- ── 4. O estado de agora, resolvido a partir do livro ────────────────────────────────────────────

-- A última palavra de cada pessoa. Um «retirei» posterior ganha sempre a um «aceito» anterior,
-- independentemente da ordem por que as linhas foram escritas — daí resolver-se por `pedido_em` e
-- não por `criado_em`, e daí o `retirado_em` de QUALQUER linha bastar para bloquear.
create or replace view captacao_permissao_email with (security_invoker = true) as
select
  lower(btrim(c.email)) as email,
  -- Pode receber campanha: deu consentimento e nunca o retirou em nenhuma linha.
  bool_or(c.base_legal = 'consentimento' and c.retirado_em is null)
    and not bool_or(c.retirado_em is not null) as pode_marketing,
  max(c.pedido_em) filter (where c.base_legal = 'consentimento') as consentiu_em,
  max(c.retirado_em) as retirou_em,
  (array_agg(c.canal order by c.pedido_em desc))[1] as ultimo_canal,
  count(*) as registos
from captacao_consentimento c
where c.email is not null and btrim(c.email) <> ''
group by lower(btrim(c.email));

comment on view captacao_permissao_email is
  'Estado actual por email, resolvido a partir do livro. Ausência de linha = SEM permissão (nunca o contrário).';

revoke all on captacao_permissao_email from anon, authenticated;

-- ── 5. A medição, para deixar de ser um número num relatório ──────────────────────────────────────

-- Os números do topo deste ficheiro envelhecem no dia em que entrar um lead. Esta vista responde à
-- mesma pergunta sempre que alguém a fizer: por fonte, quantas pessoas há e a quantas se consegue
-- chegar. É a única contagem que interessa antes de planear qualquer campanha.
create or replace view captacao_por_fonte with (security_invoker = true) as
select 'telegram_leads' as fonte, count(*) as pessoas,
       0::bigint as com_email, 0::bigint as com_telefone,
       count(*) filter (where coalesce(btrim(username), '') <> '' or coalesce(btrim(email), '') <> '') as com_alguma_forma
from telegram_leads
union all
select 'ig_leads', count(distinct commenter), 0, 0, count(distinct commenter) filter (where coalesce(btrim(commenter), '') <> '')
from ig_leads
union all
-- Zero em tudo, e a linha fica cá para que isso seja visível: são publicações, não pessoas.
select 'ig_radar_prospetos (publicações, não pessoas)', count(*), 0, 0, 0 from ig_radar_prospetos
union all
select 'mtm_leads', count(*),
       count(*) filter (where coalesce(btrim(email), '') <> ''), 0,
       count(*) filter (where coalesce(btrim(email), '') <> '' or coalesce(btrim(instagram_handle), '') <> '')
from mtm_leads
union all
select 'ib_contas', count(*),
       count(*) filter (where coalesce(btrim(cliente_email), '') <> ''),
       count(*) filter (where coalesce(btrim(cliente_telefone), '') <> ''),
       count(*) filter (where coalesce(btrim(cliente_email), '') <> '' or coalesce(btrim(cliente_telefone), '') <> '')
from ib_contas
union all
select 'profiles', count(*),
       count(*) filter (where coalesce(btrim(email), '') <> ''),
       count(*) filter (where coalesce(btrim(phone), '') <> '' or coalesce(btrim(whatsapp), '') <> ''),
       count(*) filter (where coalesce(btrim(email), '') <> '' or coalesce(btrim(phone), '') <> '')
from profiles
union all
select 'vendas_negocios (pipeline)', count(*),
       count(*) filter (where coalesce(btrim(email), '') <> ''),
       count(*) filter (where coalesce(btrim(telefone), '') <> ''),
       count(*) filter (where contactavel)
from vendas_negocios;

comment on view captacao_por_fonte is
  'Pessoas por fonte e a quantas se consegue chegar. Um lead sem contacto não é um lead.';

revoke all on captacao_por_fonte from anon, authenticated;

-- ── 6. Recuperar o que já estava na base e o pipeline tinha deitado fora ─────────────────────────

-- Isto não busca dados novos a sítio nenhum: reaproveita o que já está nas nossas tabelas para as
-- linhas que a ingestão criou antes de saber guardá-lo. 90 dos 107 negócios vieram de `perfil:<uuid>`
-- — o perfil está ali, identificado, com país, idioma e (em 5 casos) um telefone que o pipeline
-- pôs a NULL por não ter para onde o levar.
update vendas_negocios n
set telefone = coalesce(nullif(btrim(n.telefone), ''), nullif(btrim(p.phone), ''), nullif(btrim(p.whatsapp), '')),
    pais     = coalesce(n.pais, nullif(btrim(p.country), '')),
    idioma   = coalesce(n.idioma, nullif(btrim(p.preferred_language), ''), nullif(btrim(p.detected_language), ''))
from profiles p
where n.chave_origem like 'perfil:%'
  and p.id::text = lower(substring(n.chave_origem from 8));

-- Telegram: o `chat_id` está na chave, e o resto (username, interesse, idioma, uid de corretora)
-- estava a ser descartado ou enterrado na nota.
update vendas_negocios n
set telegram_username = coalesce(n.telegram_username, nullif(btrim(t.username), '')),
    interesse         = coalesce(n.interesse, nullif(btrim(t.interesse), ''), nullif(btrim(t.interest), '')),
    idioma            = coalesce(n.idioma, nullif(btrim(t.lang), '')),
    broker_uid        = coalesce(n.broker_uid, nullif(btrim(t.broker_uid), '')),
    etiquetas         = coalesce(n.etiquetas, t.tags)
from telegram_leads t
where n.chave_origem like 'telegram:%'
  and t.chat_id = substring(n.chave_origem from 10);

-- Instagram: a chave `ig-pessoa:<handle>` guarda o handle em minúsculas. É o único contacto que
-- existe destas pessoas — tê-lo só dentro de uma chave de deduplicação é tê-lo escondido.
update vendas_negocios n
set instagram_handle = coalesce(n.instagram_handle, substring(n.chave_origem from 11))
where n.chave_origem like 'ig-pessoa:%';

-- Corretora: o país da conta. A chave é `ib:<corretora>:<id|email|telefone>`, por isso liga-se pelo
-- email, que é o que as duas pontas têm em comum sem ambiguidade.
update vendas_negocios n
set pais = coalesce(n.pais, sub.pais)
from (
  select lower(btrim(cliente_email)) as email, max(nullif(btrim(pais), '')) as pais
  from ib_contas where coalesce(btrim(cliente_email), '') <> '' group by 1
) sub
where n.origem = 'corretora'
  and n.email is not null
  and lower(btrim(n.email)) = sub.email;
