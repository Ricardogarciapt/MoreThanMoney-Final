-- 195 — Marketplace: variantes do mesmo produto agrupadas (06/10).
--
-- Cada variante CONTINUA a ser uma linha de produto (checkout, Stripe, direitos, compras e
-- biblioteca não mudam). Estas colunas só dizem à montra e à ficha quais linhas são o mesmo
-- produto: a montra desenha um cartão por grupo («desde X») e a ficha um selector de opções.
--
-- grupo           slug do grupo; nulo = produto sozinho (fica igual ao que era).
-- variante_nome   o nome da opção no selector («Mensal», «Anual», «Vitalício», «6 meses»…).
-- variante_ordem  a ordem no selector; a variante de ordem mais baixa é a PRINCIPAL (dá o título,
--                 a capa, o destaque e o lugar do cartão na montra).
alter table public.marketplace_produtos
  add column if not exists grupo text,
  add column if not exists variante_nome text,
  add column if not exists variante_ordem integer not null default 0;

alter table public.marketplace_produtos drop constraint if exists marketplace_produtos_grupo_check;
alter table public.marketplace_produtos add constraint marketplace_produtos_grupo_check
  check (grupo is null or grupo ~ '^[a-z0-9][a-z0-9-]{0,59}$');

alter table public.marketplace_produtos drop constraint if exists marketplace_produtos_variante_nome_check;
alter table public.marketplace_produtos add constraint marketplace_produtos_variante_nome_check
  check (variante_nome is null or char_length(variante_nome) between 1 and 40);

create index if not exists marketplace_produtos_grupo_idx
  on public.marketplace_produtos (grupo, variante_ordem) where grupo is not null;

-- Os grupos de hoje. Só se agrupa o que tem mais de uma periodicidade/duração; o GoldKiller (uma
-- só linha) e as carteiras Ledger (cada linha é um aparelho diferente, sem cores à venda aqui)
-- ficam sozinhos.
update public.marketplace_produtos as p
   set grupo = g.grupo, variante_nome = g.nome, variante_ordem = g.ordem
  from (values
    ('scanners-mensal',        'pack-scanners',  'Mensal',    1),
    ('scanners-semestral',     'pack-scanners',  '6 meses',   2),
    ('scanners-vitalicio',     'pack-scanners',  'Vitalício', 3),
    ('sensei-ea-anual',        'mtm-sensei-ea',  'Anual',     1),
    ('sensei-ea-vitalicio',    'mtm-sensei-ea',  'Vitalício', 2),
    ('sensei-scalp-anual',     'sensei-scalp',   'Anual',     1),
    ('sensei-scalp-vitalicio', 'sensei-scalp',   'Vitalício', 2),
    ('membro-mensal',          'membro',         'Mensal',    1),
    ('membro-anual',           'membro',         'Anual',     2),
    ('premium-mensal',         'premium',        'Mensal',    1),
    ('premium-anual',          'premium',        'Anual',     2),
    ('mtm-scanner-mensal',     'mtm-scanner',    'Mensal',    1),
    ('mtm-scanner-vitalicio',  'mtm-scanner',    'Vitalício', 2)
  ) as g(slug, grupo, nome, ordem)
 where p.slug = g.slug;
