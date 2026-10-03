/**
 * ARRASTAR NA VERTICAL — as contas do gesto, sem React nem browser.
 *
 * Usado pelo hook único components/funded/use-arrasto.ts, que serve a pega da gaveta de posições
 * (layout-simples) e todas as folhas/painéis de baixo do WebTrader (ticket, mercado, conta,
 * seletor de contas, instalar). Uma regra só para «isto fecha?», em vez de cada folha ter a sua.
 *
 * Puro: testado em lib/webtrader/__tests__/arrasto.check.ts.
 */

/** A partir daqui (px para baixo) largar fecha a folha. */
export const LIMIAR_FECHO_PX = 80
/** Um «sacudir» para baixo a esta velocidade (px/ms) fecha mesmo antes do limiar… */
export const VELOCIDADE_FECHO = 0.5
/** …desde que tenha andado pelo menos isto (um toque trémulo não fecha nada). */
export const MINIMO_SACUDIR_PX = 24
/** Abaixo disto não é arrasto, é toque (a pega da gaveta alterna com um toque). */
export const LIMIAR_MOVIMENTO_PX = 5

export interface Amostra { y: number; t: number }

/** Largar com `dy` (px, positivo = para baixo) à `velocidade` (px/ms, positiva = para baixo) fecha? */
export function deveFecharArrasto(dy: number, velocidade: number, limiar = LIMIAR_FECHO_PX, vMin = VELOCIDADE_FECHO): boolean {
  if (!Number.isFinite(dy) || dy <= 0) return false
  if (dy >= limiar) return true
  return Number.isFinite(velocidade) && velocidade >= vMin && dy >= MINIMO_SACUDIR_PX
}

/**
 * Velocidade no fim do gesto (px/ms): da amostra mais antiga dos últimos `janelaMs` até à última.
 * Com menos de duas amostras, ou tempo zero, é 0 — nunca NaN nem Infinity.
 */
export function velocidadeFinal(amostras: readonly Amostra[], janelaMs = 100): number {
  if (amostras.length < 2) return 0
  const ultima = amostras[amostras.length - 1]
  let primeira = ultima
  for (let i = amostras.length - 2; i >= 0; i--) {
    if (ultima.t - amostras[i].t > janelaMs) break
    primeira = amostras[i]
  }
  const dt = ultima.t - primeira.t
  return dt > 0 ? (ultima.y - primeira.y) / dt : 0
}

/** Guarda só as últimas amostras (o que chega para a velocidade). */
export function juntarAmostra(amostras: Amostra[], a: Amostra, maximo = 8): Amostra[] {
  const out = amostras.length >= maximo ? amostras.slice(amostras.length - maximo + 1) : amostras.slice()
  out.push(a)
  return out
}

/**
 * Um toque no conteúdo com scroll só arrasta a folha quando o conteúdo já está no topo e o dedo
 * vai para BAIXO, mais na vertical do que na horizontal. Em qualquer outro caso é scroll normal.
 */
export function conteudoPodeArrastar(scrollTop: number, dx: number, dy: number): boolean {
  return scrollTop <= 0 && dy > 0 && Math.abs(dy) > Math.abs(dx)
}
