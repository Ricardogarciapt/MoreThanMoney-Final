-- A ESCADA DE RANKS PASSA A PERCENTAGEM — e os dois Distribuidores de hoje ficam por conta da casa.
--
-- PORQUE SE MUDOU (2026-09-25). A escada prometia valores FIXOS em euros por mês: 500 no
-- Distribuidor, 1 000 no Líder, 2 500 no Gestor, 7 500 no Diretor, 20 000 no Embaixador. Fizeram-se
-- as contas com o Premium a 65 EUR:
--
--   Distribuidor  7+7 = 14 membros  ->    910 EUR/mes de volume, e pagava 500  (55%)
--   Embaixador  300+300 = 600       -> 39 000 EUR/mes de volume, e pagava 20 000 (51%)
--
-- Metade da receita das pernas que qualificam o rank, EM CIMA dos 50% ja pagos aos patrocinadores
-- directos. Somado, o plano prometia mais de 100% da receita. Nao era uma questao de ser generoso:
-- como estava escrito, nao fechava em nenhum degrau, e isso ja era verdade antes de existir equipa
-- de vendas.
--
-- O QUE SE FAZ EM VEZ DISSO. O residual passa a ser uma PERCENTAGEM do volume da perna menor, com
-- diferencial. Tres consequencias, e todas sao melhores:
--
--  1. Escala com a receita. Um valor fixo promete o mesmo quer a perna renda 900 EUR quer renda
--     90 000; uma percentagem nunca pode custar mais do que aquilo que entrou.
--  2. O diferencial fecha o tecto. Cada upline recebe a SUA percentagem menos a maior ja paga
--     abaixo dele na mesma perna, por isso o total pago sobre um dado volume nunca passa dos 18%
--     do topo. Sem isto, a mesma subscricao pagaria a toda a linha acima e multiplicava-se.
--  3. Deixa de haver tecto para quem cresce. Os 20 000 EUR/mes continuam possiveis — deixam de ser
--     prometidos a 300+300 e passam a ser ganhos por quem tiver perna para eles.
--
-- QUEM JA LA ESTA. So DUAS pessoas sao Distribuidor hoje (verificado: 22 esquerda / 21 direita,
-- 2 000 EUR pendentes), e ninguem chegou a Lider ou acima. Essas duas ficam com o valor fixo com
-- que entraram — decisao do dono, «sao da casa». Fica gravado no no, nao numa data no codigo: assim
-- o dono pode mover alguem de plano de proposito, e a escada nova muda sem tocar em ninguem.

-- ── a escada nova, em percentagem ──────────────────────────────────────────
alter table public.mlm_ranks add column if not exists residual_pct numeric(5,2) not null default 0;
alter table public.mlm_ranks add column if not exists bonus_unico numeric(10,2) not null default 0;

comment on column public.mlm_ranks.residual_pct is
  'Percentagem do volume mensal da PERNA MENOR, com diferencial (ver migracao 130). Substitui monthly_residual, que era um valor fixo em euros e nao fechava contas.';
comment on column public.mlm_ranks.bonus_unico is
  'Bonus pago UMA vez, ao alcancar o rank pela primeira vez. Substitui rank_bonus.';

update public.mlm_ranks set residual_pct = 6,  bonus_unico = 100   where slug = 'distribuidor';
update public.mlm_ranks set residual_pct = 9,  bonus_unico = 250   where slug = 'lider';
update public.mlm_ranks set residual_pct = 12, bonus_unico = 750   where slug = 'gestor';
update public.mlm_ranks set residual_pct = 15, bonus_unico = 2000  where slug = 'diretor';
update public.mlm_ranks set residual_pct = 18, bonus_unico = 5000  where slug = 'embaixador';

-- As colunas antigas NAO se apagam: os nos «da casa» continuam a ser pagos por elas, e apagar o
-- valor com que uma pessoa entrou era perder a prova do que lhe foi prometido.

-- ── quem fica no plano antigo ──────────────────────────────────────────────
alter table public.mlm_nodes add column if not exists plano_rank text not null default 'escada_pct_2026_09';

comment on column public.mlm_nodes.plano_rank is
  'Por que escada esta pessoa e paga. «casa_valor_fixo» = mantem os valores fixos com que entrou (os Distribuidores activos a 25/09/2026, por decisao do dono). «escada_pct_2026_09» = a escada em percentagem. Gravado na pessoa, e nao deduzido de uma data, para o dono poder mover alguem de proposito e para a escada mudar sem tocar em ninguem.';

update public.mlm_nodes n
   set plano_rank = 'casa_valor_fixo'
  from public.mlm_ranks r
 where r.id = n.rank_id
   and r.sort_order >= 2;  -- Distribuidor e acima. Hoje sao exactamente dois.

create index if not exists idx_mlm_nodes_plano_rank on public.mlm_nodes(plano_rank) where plano_rank <> 'escada_pct_2026_09';
