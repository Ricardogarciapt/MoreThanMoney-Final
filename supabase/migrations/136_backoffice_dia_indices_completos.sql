-- 136 — Corrige as chaves de idempotência das migrações 134 e 135
--
-- O QUE CORREU MAL, escrito para não se repetir:
-- criei os índices únicos como PARCIAIS (`where chave is not null`), a pensar que assim deixava
-- passar as linhas sem chave. O `ON CONFLICT` do Postgres não consegue usar um índice parcial a
-- menos que a instrução repita o mesmo predicado — e o PostgREST não tem como o exprimir. A
-- ingestão rebentava em todas as fontes com:
--
--   there is no unique or exclusion constraint matching the ON CONFLICT specification
--
-- O `where` era desnecessário desde o início: num índice único do Postgres os NULOS não colidem
-- uns com os outros, por isso um índice completo já permite quantas linhas sem chave se quiser.
-- Ser esperto a mais custou uma ingestão partida.

drop index if exists public.vendas_tarefas_chave_unica;
create unique index if not exists vendas_tarefas_chave_unica
  on public.vendas_tarefas (chave);

drop index if exists public.vendas_negocios_chave_origem_unica;
create unique index if not exists vendas_negocios_chave_origem_unica
  on public.vendas_negocios (chave_origem);
