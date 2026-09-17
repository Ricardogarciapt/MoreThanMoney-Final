/**
 * Quando é que o motor tem de reescrever `mtm_trading_accounts.metricas` de uma conta simulada.
 *
 * PORQUÊ: o motor reconstruía e gravava as métricas de TODAS as contas activas de minuto a minuto
 * (143 contas → ~115 leituras + ~115 escritas por minuto, medido 15–17/09), mesmo das 134 que não
 * tinham uma única posição aberta e cujo jsonb saía igual. Cada escrita reescreve a linha inteira
 * da conta (~1,5 kB) e era a maior fonte de WAL da base — o WAL que o Realtime descodifica
 * (a consulta mais cara da base) e que o arquivo já não acompanhava na queda de 15/09.
 *
 * Regra: grava-se quando algo que o painel mostra mudou (equity, saldo, margem, posições, fechos,
 * âncora do dia, dias negociados), quando já passou uma hora desde o último ponto do gráfico
 * `historico` (ganha um ponto por hora — sem isto os pontos escorregavam para o refresco) e, sem
 * mudanças, de `REFRESCO_MS` em `REFRESCO_MS` — para `lidoEm` nunca ficar muito velho. Nada disto mexe em decisões: SL/TP, quebras e passagens não passam por aqui.
 */

/** O que, mudando, obriga a nova escrita. Números já arredondados como o painel os mostra. */
export interface AssinaturaMetricas {
  equity: number
  saldo: number
  margem: number
  nivelMargem: number | null
  posicoes: number
  fechos: number
  ancoraDia: number | null
  diasNegociados: number
}

export interface UltimaEscritaMetricas {
  em: number
  assinatura: string
  /** Instante do último ponto de `historico` que ficou gravado (0 = nenhum). */
  ultimoPontoMs: number
}

/** Sem mudanças, reescreve-se na mesma ao fim deste tempo. */
export const REFRESCO_MS = 15 * 60_000
/** Nunca mais do que uma escrita por conta neste intervalo (era o ritmo antigo). */
export const MINIMO_MS = 60_000

const r2 = (x: number | null) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100)

export function assinaturaMetricas(a: AssinaturaMetricas): string {
  return JSON.stringify([
    r2(a.equity), r2(a.saldo), r2(a.margem), r2(a.nivelMargem),
    a.posicoes, a.fechos, r2(a.ancoraDia), a.diasNegociados,
  ])
}

/** Igual ao `construirMetricas` do motor: um ponto de `historico` por hora. */
export const HORA_MS = 3_600_000

/** Último instante do `historico` de umas métricas (0 se não houver). */
export function ultimoPontoDoHistorico(metricas: Record<string, unknown>): number {
  const h = metricas.historico
  if (!Array.isArray(h) || !h.length) return 0
  const t = Date.parse(String((h[h.length - 1] as { t?: unknown })?.t ?? ''))
  return Number.isFinite(t) ? t : 0
}

export function precisaDeEscreverMetricas(
  ultima: UltimaEscritaMetricas | undefined,
  assinatura: string,
  agoraMs: number,
): boolean {
  if (!ultima) return true
  const passou = agoraMs - ultima.em
  if (passou < MINIMO_MS) return false
  if (ultima.assinatura !== assinatura) return true
  if (agoraMs - ultima.ultimoPontoMs >= HORA_MS) return true
  return passou >= REFRESCO_MS
}
