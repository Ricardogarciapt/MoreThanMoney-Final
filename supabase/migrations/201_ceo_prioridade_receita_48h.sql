-- 201 · CEO: receita à frente durante 48 h (07/10 a 09/10/2026), decisão do dono.
--
-- As instruções do CEO mudam-se por migração (lib/agentes/educacao.ts: o CEO não se reescreve, e o
-- caminho do agente não serve para o dono). A versão fica registada em agentes_instrucoes_versoes
-- como `activa`, com a receita dos 7 dias anteriores ao lado e avaliação daqui a 48 h: se a receita
-- baixar, correrReversoes (lib/agentes/evolucao.ts) devolve as instruções de antes.
-- Idempotente: só acrescenta se o bloco ainda não estiver lá.

with ceo as (
  select id, instrucoes from public.agentes_equipa
  where pilar = 'ceo' and pai_id is null
    and position('PRIORIDADE RECEITA — de 07/10 a 09/10/2026' in coalesce(instrucoes, '')) = 0
), novo as (
  select id, instrucoes as antes, instrucoes || E'\n\n' || 'PRIORIDADE RECEITA — de 07/10 a 09/10/2026 (48 h, decisão do dono). Em cada ciclo, antes de qualquer outro trabalho:
1. Pões à frente as acções que geram receita: reactivar ex-clientes que pagaram, pelo motor, que verifica a base legal (soft opt-in, ou email de serviço sobre o contrato da própria pessoa); seguir os leads quentes do pipeline do backoffice (quem respondeu, pediu contacto ou marcou); marcar chamadas pelo /agendar; e propor ao dono os posts e as ofertas já prontos, cada um com o link ?ag= do agente que o fez.
2. Trabalho interno (análises, notas, código sem cliente à vista) vem depois, e só quando nesse ciclo não houver acção de receita possível — e escreves porquê.
3. Cobras aos filhos resultados MEDIDOS: cada filho de vendas diz no ciclo o que mexeu, com origem — decisões em agentes_envios, actividades no pipeline, chamadas marcadas, vendas atribuídas ao seu código ?ag=. Um filho que repete «sem facto novo» dois ciclos seguidos recebe de ti um pedido concreto, com prazo.
4. Não prometes números nem inventas resultados: o que reportas vem da base (receita atribuída, agentes_envios, pipeline). Se a medição não existe, dizes que não existe.
Os limites da casa ficam todos: o que não tem base legal não sai; dinheiro, trading, apagar dados e merge continuam na mesa do dono.' as depois from ceo
), versao as (
  insert into public.agentes_instrucoes_versoes
    (agente_id, autor, instrucoes_antes, instrucoes_depois, porque, aceita, veredicto, estado, receita_antes, avaliar_apos)
  select n.id, 'dono', n.antes, n.depois,
         'Decisão do dono (07/10): durante 48 h cada ciclo do CEO põe à frente as acções que geram receita e cobra aos filhos resultados medidos. Até às 14:30 de 07/10, 154 ciclos deram 0 decisões de envio (agentes_envios vazio) e 0 € atribuídos aos filhos.',
         true,
         'Acrescento por migração (o CEO não se reescreve). Nenhum limite retirado; o bloco repete que o que não tem base legal não sai e que dinheiro, trading, apagar e merge são do dono.',
         'activa',
         coalesce((select sum(greatest(e.valor, 0)) from public.agentes_eventos e
                   where e.agente_id = n.id and e.tipo = 'receita' and e.criado_em >= now() - interval '7 days'), 0),
         now() + interval '48 hours'
  from novo n
  returning agente_id
)
update public.agentes_equipa a
set instrucoes = n.depois, atualizado_em = now()
from novo n
where a.id = n.id and a.id in (select agente_id from versao);
