/**
 * Regras numéricas da GESTÃO do MTM Auto — pip, casas do preço, lote e «a corretora aceitou».
 *
 * Vivem aqui (e `lib/risco.ts` / `lib/metaapi.ts` reexportam-nas) porque o motor em tempo real do
 * VPS, no repositório do site, precisa EXACTAMENTE destas: o repositório do site tem uma cópia
 * BYTE A BYTE em `lib/gestao-real/mtmauto-regras.ts` (teste `copias-mtm-auto.check.ts` lá).
 * Mudar aqui = copiar para lá. Sem imports.
 *
 * Nota: o pip daqui NÃO é o de `lib/mtmcopy/trade-outcome.ts` do site (lá, qualquer cripto da
 * lista longa conta em pontos; aqui só BTC/ETH/SOL/XRP/ADA/DOT/BNB/DOGE/LTC/BCH — KASUSD dá
 * 0,0001). Ficou como estava: a migração não muda regras.
 */

export const LOTE_MINIMO = 0.01

/** Valor de um pip, na unidade do preço. */
export function tamanhoPip(symbol: string): number {
  const s = symbol.toUpperCase()
  if (/JPY/.test(s)) return 0.01
  if (/XAU|GOLD/.test(s)) return 0.1
  if (/XAG|SILVER/.test(s)) return 0.01
  if (/BTC|ETH|SOL|XRP|ADA|DOT|BNB|DOGE|LTC|BCH/.test(s)) return 1
  if (/NAS|US30|US500|GER|UK100|JP225|SPX|DOW/.test(s)) return 1
  return 0.0001
}

/**
 * Casas decimais do PREÇO — não confundir com o tamanho do pip.
 *
 * No ouro o pip é 0,1 mas o preço cota-se a 0,01; nos pares forex o pip é 0,0001 e o preço tem
 * 5 casas. Usar o pip para arredondar o preço dava um stop de ouro em 4452,9 quando a corretora
 * aceita 4452,97.
 */
export function casasDoPreco(symbol: string): number {
  const s = symbol.toUpperCase()
  if (/JPY/.test(s)) return 3
  if (/XAU|GOLD/.test(s)) return 2
  if (/XAG|SILVER/.test(s)) return 3
  if (/BTC|ETH|SOL|XRP|ADA|DOT|BNB|DOGE|LTC|BCH/.test(s)) return 2
  if (/NAS|US30|US500|GER|UK100|JP225|SPX|DOW/.test(s)) return 2
  return 5
}

/**
 * O preço como a corretora o entende.
 *
 * Os scanners calculam stops e alvos a partir do ATR e mandam 4452.9733242788 — um preço que não
 * existe no mercado. Assim escrito, o cartão do sinal transborda e promete uma precisão que é
 * falsa; e enviado à corretora obriga-a a arredondar por nós, ou a recusar a ordem.
 */
export function precoDaCorretora(valor: number | null | undefined, symbol: string): number | null {
  const n = Number(valor)
  if (!Number.isFinite(n)) return null
  const f = 10 ** casasDoPreco(symbol)
  return Math.round(n * f) / f
}

export function arredondarLote(n: number): number {
  return Math.max(LOTE_MINIMO, Math.round(n * 100) / 100)
}

/** Resposta do POST /trade da MetaApi (subconjunto). */
export interface RespostaTradeMin {
  stringCode?: string
  numericCode?: number
}

export function trocouBem(r: RespostaTradeMin | null): boolean {
  return r?.stringCode === 'TRADE_RETCODE_DONE' || r?.numericCode === 10009
}
