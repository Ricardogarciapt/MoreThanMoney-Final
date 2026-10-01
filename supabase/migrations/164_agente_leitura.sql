-- 164 — A LEITURA DO AGENTE (AIOS)
--
-- O AIOS da Dock passa a poder consultar a base para responder a perguntas do dono. É uma função
-- SECURITY DEFINER, e esta casa já foi mordida por elas: a 28/08/2026 havia definers com EXECUTE
-- para PUBLIC, o que dava admin e a lista de emails a quem soubesse o nome. Por isso:
--
--  1. nasce sem privilégios para ninguém (REVOKE logo a seguir ao CREATE);
--  2. só a `service_role` executa — nunca o browser, nunca anon, nunca um autenticado;
--  3. a transação é READ ONLY: mesmo que a validação do TypeScript falhasse, uma escrita rebenta
--     no Postgres. É a fechadura que não depende de nós.
--
-- ═══ O ERRO DA PRIMEIRA VERSÃO, QUE FICA REGISTADO ════════════════════════════════════════
--
-- A primeira versão escrevia `set local transaction read only` e dava a fechadura por feita. NÃO
-- ESTAVA: dentro de PL/pgSQL a transação já começou e esse comando não pega. Descobriu-se a pedir
-- à função que fizesse o que não devia conseguir — `select nextval(...)` — e ela fez.
--
-- O que funciona é o PARÂMETRO, com `true` a limitá-lo à transação:
--     perform set_config('transaction_read_only', 'on', true);
--
-- Provado depois da correcção: `cannot execute nextval() in a read-only transaction`.
--
-- A lição vale mais do que a função: uma fechadura só está fechada quando alguém tenta abri-la. A
-- função parecia correcta, foi criada sem avisos, e lia bem.
create or replace function public.agente_leitura(consulta text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resultado jsonb;
begin
  perform set_config('transaction_read_only', 'on', true);
  -- Um tecto de tempo: uma pergunta falada não espera trinta segundos, e uma consulta que demora
  -- isso está a varrer uma tabela que não devia.
  perform set_config('statement_timeout', '8s', true);

  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', consulta)
    into resultado;

  return resultado;
end;
$$;

revoke all on function public.agente_leitura(text) from public;
revoke all on function public.agente_leitura(text) from anon;
revoke all on function public.agente_leitura(text) from authenticated;
grant execute on function public.agente_leitura(text) to service_role;

comment on function public.agente_leitura(text) is
  'Leitura só-leitura para o AIOS. Validada em lib/agent/leitura-sql.ts antes de chegar aqui; '
  'esta função é a segunda fechadura (transação READ ONLY) e não a única.';
