/**
 * O QUE A LISTA DE ALERTAS MOSTRA — e, quando não mostra nada, PORQUÊ.
 *
 * ═══ O DEFEITO QUE ISTO CORRIGE, MEDIDO ════════════════════════════════════════════════════
 *
 * A 01/10 entraram 470 alertas em 24 horas e o separador aparecia vazio. Nada falhava: a rota
 * devolvia 24 alertas, 12 deles vivos. O que os fazia desaparecer eram dois filtros em cima um do
 * outro, nenhum deles visível no ecrã:
 *
 *  · a SUBSCRIÇÃO, que nasce com sete símbolos (XAUUSD, EURUSD, GBPUSD, USDCAD, USDJPY, BTCUSD,
 *    US30) e a casa sinaliza em dezenas — NZDCHF, GBPCAD, EURJPY, SPX500, NATURALGAS…;
 *  · o estado, que em «Ativos» mostra só pendentes e activos.
 *
 * Dos 24, sobreviviam TRÊS. Com uma subscrição mais estreita, zero — e o ecrã dizia «não há
 * alertas», que é falso: havia 470.
 *
 * ═══ A CONFUSÃO QUE ESTAVA POR BAIXO ═══════════════════════════════════════════════════════
 *
 * A subscrição existe para decidir o que te É ENVIADO por notificação. Foi usada também para
 * decidir o que te é MOSTRADO quando abres a lista de propósito — e são coisas diferentes: quem
 * abre a lista está a perguntar «o que há?», não «o que é que eu mandei avisar-me?».
 *
 * Por isso a vista abre em TODOS, e seguir passa a ser um filtro que se liga — visível, e com o
 * número do que está a esconder ao lado. Um filtro que esconde sem se ver não é um filtro: é um
 * ecrã partido.
 */

import { alertaNasEstrategias } from '@/lib/alertas/catalogo'

export type EstadoAlerta = 'pending' | 'active' | 'win' | 'loss'

export interface AlertaParaVista {
  ticker?: string | null
  timeframe?: string | null
  strategy?: string | null
  tradeStatus?: string | null
}

export interface Subscricao {
  symbols: string[]
  strategies: string[]
  timeframes: string[]
}

/** O estado em que um alerta cai. Igual ao que a lista sempre usou. */
export function estadoDoAlerta(tradeStatus: string | null | undefined): EstadoAlerta {
  if (tradeStatus === 'pending') return 'pending'
  if (tradeStatus === 'loss') return 'loss'
  if (tradeStatus && (tradeStatus.startsWith('exit_') || tradeStatus === 'closed')) return 'win'
  return 'active'
}

const norm = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

/** Este alerta cabe na subscrição? Uma subscrição vazia não filtra nada. */
export function naSubscricao(a: AlertaParaVista, sub: Subscricao): boolean {
  if (sub.symbols.length > 0) {
    const t = norm(a.ticker)
    if (!sub.symbols.some((s) => t.includes(norm(s)))) return false
  }
  if (sub.timeframes.length > 0 && a.timeframe && !sub.timeframes.includes(a.timeframe)) return false
  // Pela chave CANÓNICA (lib/alertas/catalogo): a rota guardava «SENSEI» e o alerta traz
  // «MTM Sensei X» — comparar texto com texto funcionava por acaso e falhava nos chips.
  if (!alertaNasEstrategias(a.strategy, sub.strategies)) return false
  return true
}

export interface Vista<T> {
  visiveis: T[]
  /** Quantos a subscrição está a esconder AGORA. Vai para o ecrã, ao lado do botão. */
  escondidosPelaSubscricao: number
  /** Quantos o filtro de estado está a esconder. */
  escondidosPeloEstado: number
  /**
   * Porque é que a lista está vazia. `null` quando não está.
   *
   * Existe porque «não há alertas» era mentira: havia, estavam escondidos. Um vazio que não se
   * explica manda a pessoa recarregar a página para sempre.
   */
  motivoDoVazio: 'nada_chegou' | 'subscricao' | 'estado' | null
}

/**
 * A lista final.
 *
 * `soOQueSigo` é o interruptor, e nasce DESLIGADO: quem abre a lista quer ver o que há.
 */
export function montarVista<T extends AlertaParaVista>(
  alertas: T[],
  opcoes: { sub: Subscricao; soOQueSigo: boolean; estado: 'all' | EstadoAlerta },
): Vista<T> {
  const todos = alertas ?? []
  const naSub = todos.filter((a) => naSubscricao(a, opcoes.sub))
  const base = opcoes.soOQueSigo ? naSub : todos

  const porEstado = (a: T) =>
    opcoes.estado === 'all'
      ? ['pending', 'active'].includes(estadoDoAlerta(a.tradeStatus))
      : estadoDoAlerta(a.tradeStatus) === opcoes.estado

  const visiveis = base.filter(porEstado)

  let motivoDoVazio: Vista<T>['motivoDoVazio'] = null
  if (visiveis.length === 0) {
    if (todos.length === 0) motivoDoVazio = 'nada_chegou'
    // A ordem importa: se ligar «todos» já resolvia, o culpado é a subscrição e é isso que se diz.
    else if (opcoes.soOQueSigo && todos.filter(porEstado).length > 0) motivoDoVazio = 'subscricao'
    else motivoDoVazio = 'estado'
  }

  return {
    visiveis,
    escondidosPelaSubscricao: todos.length - naSub.length,
    escondidosPeloEstado: base.length - visiveis.length,
    motivoDoVazio,
  }
}
