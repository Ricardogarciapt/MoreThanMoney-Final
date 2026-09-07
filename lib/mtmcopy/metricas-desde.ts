/**
 * Contas cujas métricas arrancam do ZERO numa data.
 *
 * Uma conta reaproveitada traz o histórico de quem lá esteve antes. A 34744071 foi do Sensei
 * antes de ser da Golden Astro; a 34368570 e a 34744077 também negociaram antes de serem o que
 * são hoje. Mostrar esse passado ao lado do nome novo não é um detalhe estético: é atribuir a
 * uma estratégia resultados que ela não fez — para o bem e para o mal.
 *
 * Por isso o desempenho destas contas conta a partir da data aqui indicada, e não do princípio.
 * A data é o início do dia em Lisboa, não o instante em que isto foi escrito: o Ricardo pediu
 * que os ganhos de HOJE contassem.
 *
 * Isto não apaga nada na corretora nem na MetaApi — só decide onde começa a contagem que se
 * mostra. O histórico anterior continua lá para quem o for buscar.
 */

/**
 * 2026-09-07 00:00 em Lisboa (WEST, UTC+1) = 2026-09-06T23:00Z — o dia em que o Ricardo pediu
 * a contagem a zero. Confirmado contra o relógio da base de dados, não escrito de cabeça:
 * escrevi-o três dias errado à primeira, e três dias errado aqui são três dias de trades de
 * outra estratégia a aparecerem como sendo desta.
 */
const HOJE_LISBOA = '2026-09-06T23:00:00.000Z'

export const METRICAS_DESDE: Record<string, string> = {
  // MTM Auto Golden Moves · MT5 34368570 — estratégia nova numa conta que já negociou.
  '111c8463-efb7-4f8c-a908-268c3b634858': HOJE_LISBOA,
  // MTM Auto Golden Astro · MT5 34744071 — era a conta do Sensei até 04/09.
  '16f4f233-5cbe-4fe9-9530-89a58965bfe0': HOJE_LISBOA,
  // MTM Auto Aurum Flow · MT5 34744077 — pedido do Ricardo: recomeçar a contagem hoje.
  'a4ea0c45-3dd1-4b55-bd2a-7f44d8d6884b': HOJE_LISBOA,
}

/**
 * A data a partir da qual se conta o desempenho desta conta.
 *
 * Devolve a MAIS RECENTE entre a janela pedida e o arranque da conta. Pedir 90 dias a uma conta
 * que arrancou hoje devolve hoje — nunca o contrário, senão a janela larga trazia de volta
 * exatamente o passado que se quis deixar para trás.
 */
export function inicioDaContagem(accountId: string, janelaDesde: Date): Date {
  const marco = METRICAS_DESDE[accountId]
  if (!marco) return janelaDesde
  const zero = new Date(marco)
  return zero > janelaDesde ? zero : janelaDesde
}

/** Esta conta tem contagem reiniciada? (para o dizer na interface em vez de o esconder) */
export function temContagemReiniciada(accountId: string): boolean {
  return Boolean(METRICAS_DESDE[accountId])
}
