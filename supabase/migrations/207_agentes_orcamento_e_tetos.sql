-- 207 — ORÇAMENTO DOS AGENTES: DAR SALDO, TETOS E O LIVRO DA DESPESA
--
-- O dono passa a poder carregar saldo num agente, pôr-lhe um teto de gasto por dia e por mês, e
-- registar uma despesa à mão. Tudo fica no livro (`agentes_eventos`), nunca só na linha.
--
-- ═══ PORQUE UMA FUNÇÃO E NÃO DOIS UPDATES ══════════════════════════════════════════════════
--
-- `orcamento` e `gasto` na linha têm de bater certo com o livro. Dois pedidos separados (inserir
-- o evento, somar na linha) deixam o livro e a linha a discordar no dia em que o segundo falha.
-- A função faz as duas coisas na mesma transacção, e a soma é feita pela base (`gasto + valor`),
-- não por um valor lido antes — dois carregamentos ao mesmo tempo não se comem um ao outro.
--
-- O saldo continua a NÃO estar na base: é `orcamento - gasto` na leitura (lib/agentes/motor.ts).

alter table public.agentes_equipa add column if not exists teto_dia numeric(12,2);
alter table public.agentes_equipa add column if not exists teto_mes numeric(12,2);

comment on column public.agentes_equipa.teto_dia is 'Teto de gasto por dia (Lisboa), em dólares. Nulo = sem teto. Atingido, o motor não acorda o agente até ao dia seguinte.';
comment on column public.agentes_equipa.teto_mes is 'Teto de gasto por mês (Lisboa), em dólares. Nulo = sem teto.';

-- Os tipos novos: `credito` (o dono deu saldo) e `teto` (o dono mudou os tetos). Repete a lista
-- inteira da 202 — um check com a lista curta apagava os tipos que o motor já escreve.
alter table public.agentes_eventos drop constraint if exists agentes_eventos_tipo_check;
alter table public.agentes_eventos add constraint agentes_eventos_tipo_check check (tipo = any (array[
  'nasceu','gastou','receita','avaliado','avisado','parou','retomado','clonou','trabalho','reformou','reformado','renomeado',
  'educou','escalou','desbloqueou','morreu','reproducao_bloqueada','versao_proposta','versao_aceite','versao_rejeitada',
  'versao_revertida','ciclo','envio','motor',
  'ciclo_estado','proof','clonagem_pedida','clonagem_validada','clonagem_bloqueada','dominante','missao','recursos','arquivado','worker','ceo_accao',
  'credito','teto'
]));

create index if not exists agentes_eventos_dinheiro_idx
  on public.agentes_eventos (agente_id, criado_em desc)
  where tipo in ('credito', 'gastou');

/**
 * Um movimento de dinheiro de um agente: `credito` soma ao orçamento, `gastou` soma ao gasto.
 * Devolve a linha como ficou. Valor tem de ser positivo — um «crédito negativo» é uma despesa e
 * escreve-se como despesa, para o livro dizer o que aconteceu.
 */
create or replace function public.agentes_movimentar(
  p_agente uuid,
  p_tipo text,
  p_valor numeric,
  p_detalhe text
) returns table (orcamento numeric, gasto numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tipo not in ('credito', 'gastou') then
    raise exception 'tipo inválido: %', p_tipo;
  end if;
  if p_valor is null or p_valor <= 0 or p_valor > 100000 then
    raise exception 'valor inválido: %', p_valor;
  end if;

  insert into public.agentes_eventos (agente_id, tipo, valor, detalhe)
  values (p_agente, p_tipo, round(p_valor, 2), nullif(left(coalesce(p_detalhe, ''), 500), ''));

  return query
  update public.agentes_equipa a
     set orcamento = case when p_tipo = 'credito' then a.orcamento + round(p_valor, 2) else a.orcamento end,
         gasto     = case when p_tipo = 'gastou'  then a.gasto     + round(p_valor, 2) else a.gasto end,
         atualizado_em = now()
   where a.id = p_agente
  returning a.orcamento, a.gasto;

  if not found then
    raise exception 'agente não existe: %', p_agente;
  end if;
end;
$$;

revoke all on function public.agentes_movimentar(uuid, text, numeric, text) from public, anon, authenticated;
grant execute on function public.agentes_movimentar(uuid, text, numeric, text) to service_role;
