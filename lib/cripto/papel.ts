/**
 * AGENTE CRIPTO: a contabilidade das posições e da SESSÃO. Pura.
 *
 * Serve o papel e o real: no real os preços de entrada/saída vêm do executor (o que o exchange
 * deu), aqui só se fazem as contas. Taxas e escorregamento entram sempre, porque um papel sem
 * custos mente a favor do agente.
 */
import type { Lado, Mercado } from './tipos'

export const CUSTOS = {
  /** Taker Bybit perps, por lado. */
  perpTaxaPct: 0.055,
  /** Jupiter: taxa da plataforma + escorregamento médio de uma memecoin, por lado. */
  spotTaxaPct: 0.1,
  spotEscorregamentoPct: 0.5,
} as const

/** Tempo máximo numa posição. Uma memecoin parada um dia já não é o gatilho que a abriu. */
export const TEMPO_MAX_MS = { perp: 48 * 3600_000, spot: 24 * 3600_000 } as const

export interface Posicao {
  mercado: Mercado
  lado: Lado
  entrada: number
  nocionalUsd: number
  sl: number
  tp: number
  abertaEm: string
}

/** Preço efectivo com escorregamento contra nós (papel). */
export function precoComEscorregamento(preco: number, mercado: Mercado, lado: Lado, aEntrar: boolean): number {
  const e = mercado === 'spot' ? CUSTOS.spotEscorregamentoPct / 100 : 0
  const contra = (lado === 'long') === aEntrar ? 1 : -1
  return preco * (1 + contra * e)
}

/** PnL em USD de fechar a `saida`, já com as taxas dos dois lados. */
export function pnlUsd(p: Posicao, saida: number): number {
  const s = p.lado === 'long' ? 1 : -1
  const bruto = p.nocionalUsd * s * ((saida - p.entrada) / p.entrada)
  const taxa = (p.mercado === 'perp' ? CUSTOS.perpTaxaPct : CUSTOS.spotTaxaPct) / 100
  const valorSaida = p.nocionalUsd * (saida / p.entrada)
  return bruto - p.nocionalUsd * taxa - valorSaida * taxa
}

/** Deve fechar agora? SL primeiro (o pior caso, se o preço saltou os dois), depois TP, depois tempo. */
export function motivoDeFecho(p: Posicao, preco: number, agora: Date): 'sl' | 'tp' | 'tempo' | null {
  const long = p.lado === 'long'
  if (long ? preco <= p.sl : preco >= p.sl) return 'sl'
  if (long ? preco >= p.tp : preco <= p.tp) return 'tp'
  if (agora.getTime() - new Date(p.abertaEm).getTime() >= TEMPO_MAX_MS[p.mercado]) return 'tempo'
  return null
}

/**
 * O FIM DA SESSÃO e o ENVIO DOS LUCROS — puro.
 *
 * A sessão fecha à hora definida (omissão 00:00 UTC). Envia-se só o que estiver ACIMA do capital
 * base que o dono entregou: se a conta perdeu, nada sai até recuperar (não se "levanta lucro" de
 * uma conta a perder). Com posições abertas só conta o dinheiro livre, e nunca se deixa a conta
 * abaixo da base.
 */
export function planoVarredura(p: {
  capitalBaseUsd: number
  livreUsd: number
  equityUsd: number
  minimoUsd: number
}): { enviarUsd: number; porque: string } {
  const lucro = p.equityUsd - p.capitalBaseUsd
  if (!(p.capitalBaseUsd > 0)) return { enviarUsd: 0, porque: 'Sem capital base definido.' }
  if (lucro <= 0) return { enviarUsd: 0, porque: `Sem lucro acima da base (${lucro.toFixed(2)} $).` }
  // Enviar ≤ lucro garante equity − enviar ≥ base; enviar ≤ livre garante que não se mexe em margem.
  const enviar = Math.floor(Math.min(lucro, p.livreUsd) * 100) / 100
  if (!(enviar >= p.minimoUsd)) return { enviarUsd: 0, porque: `Lucro livre ${Math.max(0, enviar).toFixed(2)} $ abaixo do mínimo de ${p.minimoUsd} $.` }
  return { enviarUsd: enviar, porque: `Lucro da sessão acima da base: ${enviar.toFixed(2)} $.` }
}

/** Início (UTC) da sessão a que `agora` pertence, com fecho diário à hora `horaFechoUtc`. */
export function inicioDaSessao(agora: Date, horaFechoUtc = 0): Date {
  const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate(), horaFechoUtc))
  if (d.getTime() > agora.getTime()) d.setUTCDate(d.getUTCDate() - 1)
  return d
}
