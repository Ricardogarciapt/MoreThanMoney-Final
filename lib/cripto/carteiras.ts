/**
 * AGENTE CRIPTO: CARTEIRAS ESPERTAS — a parte pura (pontuação e leitura de transacções).
 *
 * A ideia: seguir carteiras Solana que ganham dinheiro e, quando uma delas compra um token que
 * passa no filtro de rug, isso é um gatilho (`carteira-esperta`), medido à parte como os outros.
 *
 * O cuidado: DESCOBRIR carteiras a partir de tokens que já subiram escolhe, por definição, quem
 * acertou uma vez (viés de sobrevivência). Por isso a descoberta só as põe como «candidatas»; a
 * pontuação que as promove a «esperta» vem SÓ de compras apanhadas depois de começarem a ser
 * seguidas, avaliadas 1 h depois ao preço da DexScreener.
 */

export const REGRA_ESPERTA = {
  /** Compras seguidas e avaliadas antes de se poder decidir. */
  minCompras: 5,
  acertoMin: 0.55,
  retornoMedioMinPct: 5,
  /** Com isto de compras e sem chegar a esperta, sai da lista. */
  descartarApos: 12,
  /** Descoberta: comprou a um preço pelo menos este múltiplo abaixo do actual. */
  cedoMultiplo: 1.5,
  compraMinUsd: 100,
} as const

export type EstadoCarteira = 'candidata' | 'esperta' | 'descartada'

export interface PontuacaoCarteira {
  n: number
  ganhos: number
  somaRetornoPct: number
}

/** O estado que a pontuação merece. Uma esperta que piora volta a candidata (e pode sair). */
export function estadoDaCarteira(p: PontuacaoCarteira, r = REGRA_ESPERTA): EstadoCarteira {
  if (p.n >= r.minCompras && p.ganhos / p.n >= r.acertoMin && p.somaRetornoPct / p.n >= r.retornoMedioMinPct) return 'esperta'
  if (p.n >= r.descartarApos) return 'descartada'
  return 'candidata'
}

/** Retorno de uma compra, em %, limitado a [−100, 500] para um 100× não decidir sozinho a média. */
export function retornoPct(precoCompra: number, precoAgora: number): number | null {
  if (!(precoCompra > 0) || !(precoAgora >= 0)) return null
  return Math.max(-100, Math.min(500, (precoAgora / precoCompra - 1) * 100))
}

export function pontuar(retornos: number[]): PontuacaoCarteira {
  return { n: retornos.length, ganhos: retornos.filter((x) => x > 0).length, somaRetornoPct: retornos.reduce((s, x) => s + x, 0) }
}

/** Uma negociação da GeckoTerminal (`/pools/{pool}/trades`), só os campos que se usam. */
export interface TradePool {
  kind: 'buy' | 'sell'
  carteira: string
  /** Preço em USD do token comprado (`price_to_in_usd` numa compra). */
  precoUsd: number
  volumeUsd: number
  em: string
}

/** Quem comprou CEDO (bem abaixo do preço actual) e com dinheiro a sério: candidatos a seguir. */
export function compradoresCedo(trades: TradePool[], precoAgora: number, r = REGRA_ESPERTA): { carteira: string; precoUsd: number; em: string }[] {
  const vistos = new Map<string, { carteira: string; precoUsd: number; em: string }>()
  for (const t of trades) {
    if (t.kind !== 'buy' || !(t.precoUsd > 0) || t.volumeUsd < r.compraMinUsd) continue
    if (t.precoUsd * r.cedoMultiplo > precoAgora) continue
    const ant = vistos.get(t.carteira)
    if (!ant || t.precoUsd < ant.precoUsd) vistos.set(t.carteira, { carteira: t.carteira, precoUsd: t.precoUsd, em: t.em })
  }
  return [...vistos.values()]
}

const SOL_EMBRULHADO = 'So11111111111111111111111111111111111111112'
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const USDT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
const BASE = new Set([SOL_EMBRULHADO, USDC, USDT])

/** O que interessa de `getTransaction(…, { encoding: 'jsonParsed' })`. */
export interface TransacaoRpc {
  meta?: {
    err?: unknown
    fee?: number
    preBalances?: number[]
    postBalances?: number[]
    preTokenBalances?: { mint?: string; owner?: string; uiTokenAmount?: { uiAmount?: number | null } }[]
    postTokenBalances?: { mint?: string; owner?: string; uiTokenAmount?: { uiAmount?: number | null } }[]
  } | null
  transaction?: { message?: { accountKeys?: ({ pubkey?: string } | string)[] } }
}

/**
 * As COMPRAS que esta carteira fez nesta transacção: tokens (que não SOL/USDC/USDT) cujo saldo
 * dela subiu, pagos com SOL ou USDC/USDT que lhe saíram. Sem pagamento (airdrop, transferência
 * recebida) não é compra. Transacção falhada também não.
 */
export function comprasDaTransacao(tx: TransacaoRpc | null, carteira: string): { mint: string; quantidade: number }[] {
  const m = tx?.meta
  if (!m || m.err) return []
  const saldo = (lista: typeof m.preTokenBalances) => {
    const s = new Map<string, number>()
    for (const b of lista ?? []) if (b.owner === carteira && b.mint) s.set(b.mint, (s.get(b.mint) ?? 0) + (b.uiTokenAmount?.uiAmount ?? 0))
    return s
  }
  const antes = saldo(m.preTokenBalances)
  const depois = saldo(m.postTokenBalances)
  const chaves = (tx?.transaction?.message?.accountKeys ?? []).map((k) => (typeof k === 'string' ? k : k.pubkey ?? ''))
  const i = chaves.indexOf(carteira)
  const solGasto = i >= 0 ? ((m.preBalances?.[i] ?? 0) - (m.postBalances?.[i] ?? 0) - (i === 0 ? m.fee ?? 0 : 0)) / 1e9 : 0
  const estavelGasto = [USDC, USDT].some((x) => (antes.get(x) ?? 0) - (depois.get(x) ?? 0) > 0.5)
  if (!(solGasto > 0.001) && !estavelGasto) return []
  const out: { mint: string; quantidade: number }[] = []
  for (const [mint, q] of depois) {
    if (BASE.has(mint)) continue
    const d = q - (antes.get(mint) ?? 0)
    if (d > 0) out.push({ mint, quantidade: d })
  }
  return out
}
