-- QUEM PRODUZIU ESTE POST, E PORQUE É QUE NÃO SE SABE QUANDO NÃO SE SABE.
--
-- O PROBLEMA, MEDIDO ANTES DESTA MIGRAÇÃO:
--
--   select count(*) total, count(*) filter (where caption ilike '%?ag=%') com_ag
--     from social_scheduled_posts;
--   -> total 200, com_ag 0   (181 já publicados)
--
-- A cadeia da atribuição está inteira (`?ag=` -> localStorage -> checkout ->
-- marketplace_compras.agente_codigo -> lib/agentes/receita.ts), mas NINGUÉM a começava: nenhum
-- link emitido levava código. Com receita zero para todos, a regra de vida das 48 h
-- (lib/agentes/vida.ts) pára a equipa inteira por falta de MEDIÇÃO, não por falta de trabalho — e
-- o motivo escrito em cada linha parece sólido a quem o ler depois.
--
-- PORQUE É QUE A COLUNA É PRECISA SE O CÓDIGO JÁ VAI NA LEGENDA:
--
-- O código na legenda é o que MEDE (é ele que viaja no clique de quem lê). A coluna é o que
-- PROVA: diz que post era de que agente mesmo quando a legenda não tinha onde levar um link, e
-- permite a pergunta que de outra forma não se consegue fazer — «quantos posts deste agente
-- saíram sem nada que o medisse». Sem ela, um agente sem receita e um agente sem links medidos
-- são indistinguíveis no painel.
--
-- `agente_motivo` existe porque «por atribuir» sem motivo é um número sem defesa. Ver
-- lib/agentes/marca-conteudo.ts (MotivoSemCodigo) e lib/agentes/receita.ts.

alter table public.social_scheduled_posts
  add column if not exists agente_codigo text,
  -- Escrito sempre que `agente_codigo` é null OU o post saiu sem nenhum link nosso marcado.
  -- Valores: 'pilar_sem_agente' | 'codigo_invalido' | 'sem_link_nosso'.
  add column if not exists agente_motivo text,
  -- Quantos links nossos levaram o código. Zero COM código é um post que não mede nada, e é
  -- diferente de um post sem dono. Guarda-se para o painel poder separar as duas coisas.
  add column if not exists agente_links_marcados integer not null default 0;

-- A forma é a mesma de toda a casa (lib/agentes/atribuicao.ts pareceCodigoDeAgente). Sem isto,
-- um `agente_codigo = 'BLACKFRIDAY50'` entrava pela base e creditava a receita de uma campanha de
-- descontos a um agente que não fez nada.
alter table public.social_scheduled_posts
  drop constraint if exists social_posts_agente_codigo_forma;
alter table public.social_scheduled_posts
  add constraint social_posts_agente_codigo_forma
  check (agente_codigo is null or agente_codigo ~ '^(AG|CEO)-[A-Z0-9]{2,24}$');

alter table public.social_scheduled_posts
  drop constraint if exists social_posts_agente_motivo_valores;
alter table public.social_scheduled_posts
  add constraint social_posts_agente_motivo_valores
  check (agente_motivo is null or agente_motivo in ('pilar_sem_agente', 'codigo_invalido', 'sem_link_nosso'));

-- O painel pergunta sempre «o que é que este agente produziu». Parcial porque a esmagadora
-- maioria das linhas antigas não tem dono e não há nada a indexar nelas.
create index if not exists social_posts_agente_codigo_idx
  on public.social_scheduled_posts (agente_codigo, created_at desc)
  where agente_codigo is not null;

comment on column public.social_scheduled_posts.agente_codigo is
  'Agente que produziu o post (lib/agentes/marca-conteudo.ts). NULL = por atribuir, com o motivo em agente_motivo. Nunca cai no CEO por omissão.';
