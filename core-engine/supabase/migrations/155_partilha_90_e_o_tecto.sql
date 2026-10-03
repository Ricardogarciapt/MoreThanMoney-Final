-- A PARTILHA INVERTE-SE: 90% É O TECTO DO EDUCADOR, NÃO O PISO.
--
-- ── A REGRA NOVA ──────────────────────────────────────────────────────────────────────────
--
-- Palavras do dono: «o educador já recebe 90%, 10% são da casa, mas o educador pode aumentar a
-- percentagem da casa se desejar, mas o mínimo é 10%».
--
-- Ou seja: o educador fica com 90%, a casa leva no mínimo 10%, e o educador pode dar MAIS à casa se
-- quiser — mas nunca pode ficar com mais de 90%.
--
-- ── ISTO NÃO É UMA CORRECÇÃO DE UM ERRO. É UMA REGRA NOVA ─────────────────────────────────
--
-- A 151 escreveu `check (partilha_pct >= 90 and partilha_pct <= 100)` com `default 95`. Não era um
-- descuido: naquele momento a regra conhecida era a landing pública («ficas com 90–95%»), e dela
-- lia-se que 95 era o valor a aplicar e 90 o mínimo que o educador podia receber. O `check` guardava
-- exactamente isso — um PISO para proteger o educador.
--
-- A regra do dono é a oposta: 90 é o TECTO. O `check` que protegia o educador de receber menos de 90
-- passa a ser o `check` que impede a casa de receber menos de 10. O número 90 fica no ficheiro, mas
-- muda de lado — e é por isso que este comentário existe: sem ele, quem vier a seguir vê `<= 90`
-- onde antes estava `>= 90` e presume que alguém trocou um sinal por acidente.
--
-- A 151 JÁ ESTÁ APLICADA EM PRODUÇÃO (as quatro tabelas existem, confirmado no catálogo; o registo
-- dela não aparece no ledger de migrações porque foi aplicada por outra via). Por isso isto é
-- `drop constraint` + `add constraint`, e não uma edição da 151 — editar um ficheiro já aplicado não
-- muda nada na base de dados e faz o repositório mentir sobre o que lá está.
--
-- ── O PISO NOVO É 50, E A RAZÃO É UM ERRO DE ESCRITA ──────────────────────────────────────
--
-- Se 90 é o tecto, o piso podia ser 0 — um educador a oferecer tudo à casa é estranho mas não é
-- perigoso. Fica em 50, e não por prudência abstracta: por causa do erro de preenchimento mais
-- provável nesta coluna.
--
-- Quem preenche isto a pensar «a casa leva 10» escreve 10. Com piso 0, a linha grava sem se queixar,
-- e o educador passa a receber 10% em vez de 90% — sem erro, sem aviso, e só se descobre no primeiro
-- extracto, quando já é uma conversa e não um bug. Com piso 50, a base de dados recusa em voz alta.
--
-- 50 continua a permitir a um educador dar metade da receita à casa, que é muito mais do que alguém
-- dá por distracção. O que se perde é o caso de quem quisesse dar 90% à casa; o que se ganha é que
-- ninguém perde 80 pontos percentuais por ter trocado a ordem dos números na cabeça.
--
-- ── O QUE NÃO MUDA ────────────────────────────────────────────────────────────────────────
--
-- As linhas já gravadas em `marketplace_compras` NÃO se tocam. `parte_educador_pct` é copiada para a
-- linha no momento da venda precisamente para isto: uma venda de ontem vale o que valia ontem. Uma
-- migração que "corrigisse" as percentagens antigas para a regra nova estaria a reescrever extractos
-- fechados — e um extracto que muda sozinho não é um extracto.
--
-- Hoje ambas as tabelas estão vazias (0 vendedores, 0 produtos, 0 compras), por isso não há nada a
-- converter. Se não estivessem, este ficheiro NÃO seria o sítio para o fazer.

-- ── Quem vende ────────────────────────────────────────────────────────────────────────────

alter table public.marketplace_educadores
  drop constraint if exists marketplace_educadores_partilha_pct_check;

alter table public.marketplace_educadores
  add constraint marketplace_educadores_partilha_pct_check
  check (partilha_pct >= 50 and partilha_pct <= 90);

alter table public.marketplace_educadores
  alter column partilha_pct set default 90;

comment on column public.marketplace_educadores.partilha_pct is
  'O que o educador fica, em %. 90 e o TECTO (a casa leva no minimo 10%). Piso 50 contra erro de escrita.';

-- ── O produto ─────────────────────────────────────────────────────────────────────────────
--
-- Aqui a coluna é anulável (null = herda a do educador) e continua a ser. O `check` só se aplica
-- quando há valor.

alter table public.marketplace_produtos
  drop constraint if exists marketplace_produtos_partilha_pct_check;

alter table public.marketplace_produtos
  add constraint marketplace_produtos_partilha_pct_check
  check (partilha_pct is null or (partilha_pct >= 50 and partilha_pct <= 90));

comment on column public.marketplace_produtos.partilha_pct is
  'Partilha deste produto em particular. Null = herda a do educador. 90 e o tecto.';

-- ── A compra ──────────────────────────────────────────────────────────────────────────────
--
-- `parte_educador_pct` NÃO leva `check` de intervalo, e é deliberado.
--
-- É um registo histórico, não uma regra: guarda a percentagem que valia no momento daquela venda.
-- Prendê-la ao intervalo de hoje significaria que a próxima vez que a regra mudar — e já mudou uma
-- vez — as vendas antigas deixavam de poder ser gravadas ou lidas sem violar uma restrição. O que
-- muda é o `default`, para uma linha escrita sem percentagem não nascer com a regra antiga.

alter table public.marketplace_compras
  alter column parte_educador_pct set default 90;
