-- ============================================================================
-- 158 — O QUE A MONTRA MOSTRA PRIMEIRO
-- ============================================================================
--
-- A montra ordenava por `publicado_em desc` e mais nada. Isso é uma ordem de ARQUIVO: o que entrou
-- por último fica à frente, independentemente de ser o produto que a casa quer vender esta semana
-- ou o último a ser corrigido num detalhe. Os catorze produtos da casa foram todos publicados no
-- mesmo minuto pela migração 153, por isso a ordem entre eles é, na prática, aleatória.
--
-- `destaque` é a decisão do dono: estes vão ao cimo, numa fila própria. `destaque_ordem` decide
-- entre os destacados — sem ela, escolher três destaques deixava a ordem dos três ao acaso, que é
-- metade do problema por resolver.
--
-- Não é um terceiro interruptor de visibilidade: um produto destacado que esteja retirado, inactivo
-- ou por rever continua a não aparecer. O destaque só manda na ORDEM de quem já ia aparecer.

alter table public.marketplace_produtos
  add column if not exists destaque boolean not null default false,
  add column if not exists destaque_ordem integer not null default 0;

-- Índice parcial: a montra pergunta «quais são os destacados» a cada visita, e são poucos.
create index if not exists marketplace_produtos_destaque_idx
  on public.marketplace_produtos (destaque_ordem, publicado_em desc)
  where destaque = true;

comment on column public.marketplace_produtos.destaque is
  'Vai ao cimo da montra, na fila de destaques. Não substitui estado/activo: um produto escondido continua escondido.';
comment on column public.marketplace_produtos.destaque_ordem is
  'Ordem entre destacados (menor primeiro). Empate desfaz-se pela data de publicação.';
