-- ============================================================================
-- 152 — A ESCADA DO DESFECHO PASSA PARA SQL (a de 148 nunca chegou a escrever)
-- ============================================================================
--
-- A escada de `lib/mtmcopy/desfecho-unico.ts` fazia a condição no próprio UPDATE, através de um
-- filtro do PostgREST:
--
--   .update({ outcome })
--   .eq('id', id)
--   .or('outcome->>origem.is.null,outcome->>origem.in.(tracker,texto)')
--
-- Isso NUNCA escreveu nada. O PostgREST aceita `outcome->>origem` num GET, mas num PATCH trata a
-- expressão como o NOME de uma coluna e devolve:
--
--   42703 · column chat_messages.outcome does not exist
--
-- Como o código tratava o erro com um `console.warn` e um `return false`, a reconstrução dizia
-- «355 discordavam, 0 corrigidas» sem levantar excepção nenhuma — falhava em silêncio, três
-- passagens seguidas, e o teste que existia (em memória) passava à mesma.
--
-- A condição muda-se para aqui, onde `->>` é só `->>`: uma única instrução atómica, que é o que
-- se queria desde o início. E passa a valer para QUALQUER escritor, agora ou no futuro, mesmo
-- que alguém volte a escrever no campo sem passar pelo módulo.
--
-- Idempotente (`create or replace`). Pode correr antes ou depois do deploy: enquanto a função
-- não existir, a gravação devolve erro VISÍVEL (e a reconstrução recusa-se a dizer que correu
-- bem), em vez de devolver falso calado como até aqui.

-- Grau de cada origem. Fora da escada = 0, para o histórico antigo se deixar corrigir.
create or replace function public.grau_desfecho(p_origem text)
returns int
language sql
immutable
as $$
  select case p_origem
    when 'mestre'  then 3   -- fecho real de uma posição real
    when 'tracker' then 2   -- a nossa cotação, medida entrada→saída
    when 'texto'   then 1   -- o que alguém escreveu no chat
    else 0                  -- sem origem: histórico anterior à escada
  end;
$$;

comment on function public.grau_desfecho(text) is
  'Escada do desfecho: mestre(3) > tracker(2) > texto(1) > sem origem(0). Ver lib/mtmcopy/desfecho-unico.ts.';

/**
 * Grava o desfecho na mensagem de entrada SE quem escreve tiver grau igual ou superior.
 * Devolve true se escreveu, false se foi recusado por um grau superior já lá estar.
 * Erro de verdade (id inexistente é só false) continua a subir como erro.
 */
create or replace function public.gravar_desfecho_unico(
  p_chat_message_id uuid,
  p_origem text,
  p_desfecho jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_afectadas int;
begin
  if p_chat_message_id is null or p_origem is null then
    return false;
  end if;
  -- Origem desconhecida não escreve nada: valeria 0 e substituiria só o que já vale 0, o que é
  -- pior do que recusar — deixaria entrar um escritor novo sem lugar declarado na escada.
  if grau_desfecho(p_origem) = 0 then
    raise exception 'origem de desfecho desconhecida: %', p_origem;
  end if;

  update public.chat_messages
     set outcome = p_desfecho || jsonb_build_object('origem', p_origem)
   where id = p_chat_message_id
     and grau_desfecho(outcome->>'origem') <= grau_desfecho(p_origem);

  get diagnostics v_afectadas = row_count;
  return v_afectadas > 0;
end;
$$;

comment on function public.gravar_desfecho_unico(uuid, text, jsonb) is
  'Único escritor de chat_messages.outcome. Recusa a escrita de uma origem de grau inferior à que já lá está.';

-- Só o servidor grava desfechos. (As RPC SECURITY DEFINER abertas ao público já deram um
-- problema nesta casa — ver memória «RPC definer abertas ao público».)
revoke all on function public.gravar_desfecho_unico(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.gravar_desfecho_unico(uuid, text, jsonb) to service_role;
