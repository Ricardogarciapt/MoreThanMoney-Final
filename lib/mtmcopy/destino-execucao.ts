/**
 * PARA ONDE VAI UMA ORDEM DE UMA LIGAÇÃO — a única pergunta de plataforma dos executores.
 *
 *   'mtmfunded'   → conta simulada MTM Funded (migração 070/074). Executa SÓ o motor simulado
 *                   (lib/mtmfunded/simulado/execucao.ts + funções atómicas funded_*). Nunca MetaApi,
 *                   nunca CopyFactory, nunca TradeLocker — mesmo que alguém escreva por engano um
 *                   metaapi_account_id na linha (a 074 proíbe-o com uma check, isto é a segunda tranca).
 *   'tradelocker' → API TradeLocker (lib/tradelocker).
 *   'metaapi'     → MT4/MT5 pela MetaApi.
 *   null          → nada onde executar.
 *
 * Puro (sem base, sem Next) — testado em lib/mtmfunded/__tests__/ligar-conta.check.ts.
 */

export const PLATAFORMA_MTMFUNDED = 'mtmfunded'

export type DestinoExecucao = 'mtmfunded' | 'tradelocker' | 'metaapi' | null

type LigacaoMinima = {
  mt5_platform?: string | null
  metaapi_account_id?: string | null
  tl_account_id?: string | null
  funded_account_id?: string | null
}

export function ehMtmFundedLigacao(c: { mt5_platform?: string | null } | null | undefined): boolean {
  return String(c?.mt5_platform ?? '').toLowerCase() === PLATAFORMA_MTMFUNDED
}

export function destinoDeExecucao(c: LigacaoMinima | null | undefined): DestinoExecucao {
  if (!c) return null
  // A plataforma decide ANTES de olhar para ids: uma linha mtmfunded nunca chega à MetaApi.
  if (ehMtmFundedLigacao(c)) return c.funded_account_id ? 'mtmfunded' : null
  if (String(c.mt5_platform ?? '').toLowerCase() === 'tradelocker') return c.tl_account_id ? 'tradelocker' : null
  return c.metaapi_account_id ? 'metaapi' : null
}

/** Tira as ligações MTM Funded de uma lista que vai para caminhos MetaApi/CopyFactory/TradeLocker. */
export function semMtmFunded<T extends { mt5_platform?: string | null }>(linhas: T[]): T[] {
  return linhas.filter((c) => !ehMtmFundedLigacao(c))
}
