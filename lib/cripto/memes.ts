/**
 * AGENTE CRIPTO: gatilhos de MEMECOINS a partir do retrato da DexScreener. Puro, sem rede.
 *
 * As memecoins não têm velas fiáveis de graça (a GeckoTerminal corta a ~30 pedidos/min e deixava
 * 2/3 das candidatas sem velas, por isso o spot nunca gerou uma decisão). A DexScreener dá, por par,
 * variação a 5 min/1 h/24 h, volume e número de compras e vendas: chega para os gatilhos de fluxo.
 *
 *  · meme-fluxo: a subir a 5 min E a 1 h, volume dos últimos 5 min ≥ 2× o ritmo da última hora,
 *    compradores a dominar (compras ≥ 1,5× vendas, com pelo menos 20 compras). Perfil de rug normal.
 *  · pump-graduado: token da Pump.fun que já saiu da curva para uma pool (PumpSwap/Raydium/Meteora)
 *    há menos de 6 h, a subir e com mais compras do que vendas. Perfil de rug «pump» (ver rug.ts):
 *    liquidez e idade mínimas mais baixas, o resto (autoridades, detentores, LP, honeypot) igual.
 *
 * Tokens ainda NA CURVA da Pump.fun ficam de fora: não têm LP para verificar nem liquidez medida, e
 * o filtro de rug existe para dizer não ao que não se sabe.
 */
import type { SnapshotMeme } from './fontes'
import type { Gatilho, Retrato } from './tipos'

/** SL/TP das memecoins, em % do preço. RR 1,8; o SL cabe no tecto da guarda (20 %). */
export const PLANO_MEME = { slPct: 10, tpPct: 18 } as const

const DEX_POS_CURVA = new Set(['pumpswap', 'raydium', 'meteora', 'orca'])
export const ePump = (s: Pick<SnapshotMeme, 'mint'>) => s.mint.endsWith('pump')
export const naCurva = (s: Pick<SnapshotMeme, 'dexId'>) => s.dexId === 'pumpfun'

/** Volume dos últimos 5 min face ao ritmo médio de 5 min da última hora (1 = normal). */
export function volumeRelativoSnap(s: SnapshotMeme): number | null {
  if (s.vol5mUsd == null || s.vol1hUsd == null || !(s.vol1hUsd > 0)) return null
  return s.vol5mUsd / (s.vol1hUsd / 12)
}

/** Fluxo de ordens a 5 min: (compras − vendas) / total, de −1 a 1. */
export function fluxo5m(s: SnapshotMeme): number | null {
  const t = s.compras5m + s.vendas5m
  return t > 0 ? (s.compras5m - s.vendas5m) / t : null
}

export function retratoDeSnapshot(s: SnapshotMeme, agora = new Date()): Retrato {
  return {
    ativo: s.simbolo,
    mercado: 'spot',
    id: s.mint,
    preco: s.precoUsd,
    em: agora.toISOString(),
    var5mPct: s.var5mPct,
    var1hPct: s.var1hPct,
    var24hPct: s.var24hPct,
    rsi14: null,
    atrPct: null,
    volumeRelativo: volumeRelativoSnap(s),
    desequilibrioLivro: fluxo5m(s),
    fundingPct: null,
    liquidezUsd: s.liquidezUsd,
  }
}

function plano(preco: number) {
  return { entrada: preco, sl: preco * (1 - PLANO_MEME.slPct / 100), tp: preco * (1 + PLANO_MEME.tpPct / 100) }
}

/** O gatilho de memecoin desta passagem, ou null. Só compras (não há short em spot). */
export function gatilhoMeme(s: SnapshotMeme, r: Retrato): Gatilho | null {
  if (naCurva(s) || !(s.precoUsd > 0)) return null
  const base = { ativo: r.ativo, mercado: 'spot' as const, id: s.mint, lado: 'long' as const, ...plano(s.precoUsd) }
  const vol = volumeRelativoSnap(s) ?? 0
  const sobe = (s.var5mPct ?? 0) > 0 && (s.var1hPct ?? 0) > 0

  if (ePump(s) && DEX_POS_CURVA.has(s.dexId) && s.idadeHoras != null && s.idadeHoras <= 6 && (s.var5mPct ?? 0) > 0 && s.compras5m > s.vendas5m && s.compras5m >= 10) {
    return { ...base, tipo: 'pump-graduado', porque: `Saiu da curva da Pump.fun para ${s.dexId} há ${s.idadeHoras.toFixed(1)} h, +${(s.var5mPct ?? 0).toFixed(1)}% a 5 min, ${s.compras5m} compras vs ${s.vendas5m} vendas.` }
  }
  if (sobe && vol >= 2 && s.compras5m >= 20 && s.compras5m >= 1.5 * s.vendas5m) {
    return { ...base, tipo: 'meme-fluxo', porque: `+${(s.var5mPct ?? 0).toFixed(1)}% a 5 min e +${(s.var1hPct ?? 0).toFixed(1)}% a 1 h, volume ${vol.toFixed(1)}× o ritmo da hora, ${s.compras5m} compras vs ${s.vendas5m} vendas.` }
  }
  return null
}

/** Uma carteira «esperta» acabou de comprar este token: gatilho próprio, medido à parte. */
export function gatilhoCarteira(s: SnapshotMeme, r: Retrato, carteira: string): Gatilho | null {
  if (naCurva(s) || !(s.precoUsd > 0)) return null
  return {
    tipo: 'carteira-esperta', ativo: r.ativo, mercado: 'spot', id: s.mint, lado: 'long', ...plano(s.precoUsd),
    porque: `A carteira esperta ${carteira.slice(0, 4)}…${carteira.slice(-4)} acabou de comprar (${s.dexId}, liquidez ${Math.round(s.liquidezUsd ?? 0)} $).`,
  }
}
