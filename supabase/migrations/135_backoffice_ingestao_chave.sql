-- 135 — A chave que impede o mesmo lead de entrar duas vezes no pipeline
--
-- A ingestão corre todas as manhãs sobre as mesmas fontes (telegram_leads, ig_leads, mtm_leads,
-- perfis inactivos). Sem uma chave estável por origem, a segunda manhã criava um negócio novo para
-- cada pessoa que já lá estava — e um pipeline com a mesma pessoa cinco vezes não é um pipeline, é
-- a razão pela qual a equipa deixa de o abrir.
--
-- Não serve o email nem o telegram_id para isto: há leads sem email (um comentário no Instagram
-- traz um nome de utilizador e mais nada) e negócios criados à mão que nunca terão chave.
--
-- O índice é COMPLETO e não parcial — ver a migração 136, que corrigiu esse erro.
alter table public.vendas_negocios add column if not exists chave_origem text;

create unique index if not exists vendas_negocios_chave_origem_unica
  on public.vendas_negocios (chave_origem);
