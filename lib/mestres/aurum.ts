/**
 * O AURUM FLOW VAI À SUA MESTRE SIM? — o símbolo, a decisão, e o motivo quando não vai.
 *
 * Pedido do dono (07/10): a conta-mestre do «MTM Aurum Flow Cripto» (mestres_estrategias.slug
 * `aurum-flow`, conta SIM da casa) recomeça do zero e passa a SEGUIR os sinais do webhook
 * `?strategy=aurum`. Até aqui o webhook só mandava a Aurum para a Bybit e para uma conta MT5 antiga
 * pela MetaApi (lib/mtmcopy/aurum-conta-mestre.ts); a mestre SIM nunca recebia nada — o portão
 * `canExecuteProvider` só deixa passar ouro/BTC e forex, e a Aurum é `crypto_perp`.
 *
 * O desvio é o mesmo cano das outras estratégias (`encaminharSinalParaMestre`, fonte `aurum`), por
 * isso as fechaduras são as de sempre: `mestres_estrategias.sinal_modo`, kill-switch,
 * `mtmauto_providers.ativo`, travas da mestre. Aqui só se decide se o alerta é candidato e em que
 * símbolo da casa ele abre.
 *
 * SÍMBOLO. A TradingView manda perpétuos da Bybit (`XRPUSDT.P`, `BYBIT:ETHUSDT.P`); o catálogo da casa
 * (`funded_symbols`, nomes PU Prime) tem `XRPUSD`, `ETHUSD`… e abrevia alguns a três letras
 * (`DOGUSD` = Dogecoin, `LNKUSD` = Chainlink). Um par que o catálogo não tenha (JUP, por exemplo)
 * chega à mestre com o nome limpo e é recusado lá com motivo — não se inventa um equivalente.
 *
 * Puro: sem base, sem rede. Testes em __tests__/aurum.check.ts.
 */

/** Base do perpétuo → base do símbolo PU Prime, quando o nome não é o mesmo. Só os confirmados no catálogo. */
export const BASE_PU_PRIME: Readonly<Record<string, string>> = {
  DOGE: 'DOG', // Dogecoin → DOGUSD
  LINK: 'LNK', // Chainlink → LNKUSD
  AVAX: 'AVA', // Avalanche → AVAUSD
  ATOM: 'ATM', // Cosmos → ATMUSD
  ALGO: 'ALG', // Algorand → ALGUSD
  NEAR: 'NER', // NEAR protocol → NERUSD
  IOTA: 'IOT', // IOTA → IOTUSD
  '1INCH': 'INC', // 1inch → INCUSD
  SAND: 'SAN', // The Sandbox → SANUSD
  SUSHI: 'SUS', // Sushi → SUSUSD
}

/**
 * `BYBIT:XRPUSDT.P` → `XRPUSD`. Devolve null se não for um par cripto contra dólar (USDT/USDC/USD).
 * Não consulta o catálogo: quem decide se existe é a mestre (`funded_symbols`), que recusa com motivo.
 */
export function simboloDaCasaParaPerp(ticker: string | null | undefined): string | null {
  if (!ticker) return null
  const semBolsa = String(ticker).toUpperCase().split(':').pop()!.trim()
  const limpo = semBolsa.replace(/\.P$/, '').replace(/PERP$/, '').replace(/[^A-Z0-9]/g, '')
  const m = limpo.match(/^([A-Z0-9]+?)(USDT|USDC|USD)$/)
  if (!m) return null
  const base = BASE_PU_PRIME[m[1]] ?? m[1]
  return `${base}USD`
}

export interface EntradaDecisaoAurum {
  /** o alerta é da Aurum Flow (`?strategy=aurum` ou deteção por conteúdo) */
  aurum: boolean
  /** `assetClass` do webhook — a Aurum é só cripto (`crypto_perp`) desde 29/09 */
  classe: string
  /** `initSignalKind` do webhook */
  tipoSinal: 'entry' | 'followup'
  ticker: string | null
  direcao: string | null
  entrada: number | null
  sl: number | null
  /** `stopsSane(entrada, sl)` */
  stopsSaos: boolean
  /** o perps-gate (trend-guard BTC 4h + scorecard por moeda) — o gate de EXECUÇÃO dos perpétuos */
  perpsGate: { allow: boolean; reason: string }
}

export interface DecisaoAurum {
  vai: boolean
  /** o símbolo da casa onde a mestre abre (só quando `vai`) */
  simbolo?: string
  /** porque não; vazio só quando `vai` é true */
  motivo?: string
}

/** A Aurum Flow manda este alerta para a sua mestre SIM? (função pura) */
export function decidirAurumParaMestre(e: EntradaDecisaoAurum): DecisaoAurum {
  if (!e.aurum) return { vai: false, motivo: 'não é um alerta da Aurum Flow' }
  if (e.classe !== 'crypto_perp') return { vai: false, motivo: 'a Aurum Flow é só cripto (alerta não-cripto)' }
  if (e.tipoSinal !== 'entry') return { vai: false, motivo: 'seguimento (TP/BE/SL/saída) — a mestre gere pelos níveis da posição' }
  if (e.direcao !== 'buy' && e.direcao !== 'sell') return { vai: false, motivo: 'sem direcção (compra/venda)' }
  // Numa conta que outros seguem, uma posição sem stop é um risco que ninguém consegue dimensionar.
  if (e.sl == null || !(e.sl > 0)) return { vai: false, motivo: 'sinal sem stop — não se abre na mestre' }
  if (!e.stopsSaos) return { vai: false, motivo: 'stop incoerente com a entrada' }
  if (!e.perpsGate.allow) return { vai: false, motivo: `perps-gate: ${e.perpsGate.reason}` }
  const simbolo = simboloDaCasaParaPerp(e.ticker)
  if (!simbolo) return { vai: false, motivo: `par sem equivalente na casa (${e.ticker ?? '?'})` }
  return { vai: true, simbolo }
}
