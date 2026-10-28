/**
 * AGENTE CRIPTO: os sub-agentes de NÚMEROS (técnica, volume, order flow). Puros, sem rede.
 *
 * Isto é código e não IA de propósito: um RSI calcula-se, não se opina. A IA recebe o resultado
 * destes cálculos, nunca as velas.
 */
import type { Gatilho, Livro, Mercado, Parecer, Retrato, Vela } from './tipos'

/** RSI de Wilder. `null` sem velas suficientes. */
export function rsi(fechos: number[], periodo = 14): number | null {
  if (fechos.length < periodo + 1) return null
  let ganho = 0
  let perda = 0
  for (let i = 1; i <= periodo; i++) {
    const d = fechos[i] - fechos[i - 1]
    if (d >= 0) ganho += d
    else perda -= d
  }
  ganho /= periodo
  perda /= periodo
  for (let i = periodo + 1; i < fechos.length; i++) {
    const d = fechos[i] - fechos[i - 1]
    ganho = (ganho * (periodo - 1) + Math.max(d, 0)) / periodo
    perda = (perda * (periodo - 1) + Math.max(-d, 0)) / periodo
  }
  if (perda === 0) return ganho === 0 ? 50 : 100
  return 100 - 100 / (1 + ganho / perda)
}

/** ATR de Wilder, em preço. */
export function atr(velas: Vela[], periodo = 14): number | null {
  if (velas.length < periodo + 1) return null
  const tr: number[] = []
  for (let i = 1; i < velas.length; i++) {
    const v = velas[i]
    const ant = velas[i - 1].c
    tr.push(Math.max(v.h - v.l, Math.abs(v.h - ant), Math.abs(v.l - ant)))
  }
  let a = tr.slice(0, periodo).reduce((s, x) => s + x, 0) / periodo
  for (let i = periodo; i < tr.length; i++) a = (a * (periodo - 1) + tr[i]) / periodo
  return a
}

/** Variação % entre o fecho de há `n` velas e o último. */
export function variacaoPct(fechos: number[], n: number): number | null {
  if (fechos.length <= n) return null
  const ant = fechos[fechos.length - 1 - n]
  const ult = fechos[fechos.length - 1]
  return ant > 0 ? ((ult - ant) / ant) * 100 : null
}

/** Volume da última vela face à média das `n` anteriores (1 = normal). */
export function volumeRelativo(velas: Vela[], n = 20): number | null {
  if (velas.length < n + 1) return null
  const ant = velas.slice(-n - 1, -1)
  const media = ant.reduce((s, v) => s + v.v, 0) / n
  return media > 0 ? velas[velas.length - 1].v / media : null
}

/**
 * Desequilíbrio do livro nos primeiros `niveis`: (bids − asks) / (bids + asks), de −1 a 1.
 * Positivo = mais compradores encostados ao preço.
 */
export function desequilibrioLivro(livro: Livro, niveis = 20): number | null {
  const soma = (l: [number, number][]) => l.slice(0, niveis).reduce((s, [p, q]) => s + p * q, 0)
  const b = soma(livro.bids)
  const a = soma(livro.asks)
  return b + a > 0 ? (b - a) / (b + a) : null
}

/** Monta o retrato a partir das velas de 5 min (pelo menos 289 = 24 h para a variação de 24 h). */
export function retratoDeVelas(p: {
  ativo: string
  mercado: Mercado
  id: string
  velas5m: Vela[]
  livro?: Livro | null
  fundingPct?: number | null
  liquidezUsd?: number | null
  agora: Date
}): Retrato | null {
  const v = p.velas5m
  if (!v.length) return null
  const fechos = v.map((x) => x.c)
  const preco = fechos[fechos.length - 1]
  const a = atr(v)
  return {
    ativo: p.ativo,
    mercado: p.mercado,
    id: p.id,
    preco,
    em: p.agora.toISOString(),
    var5mPct: variacaoPct(fechos, 1),
    var1hPct: variacaoPct(fechos, 12),
    var24hPct: variacaoPct(fechos, 288),
    rsi14: rsi(fechos),
    atrPct: a != null && preco > 0 ? (a / preco) * 100 : null,
    volumeRelativo: volumeRelativo(v),
    desequilibrioLivro: p.livro ? desequilibrioLivro(p.livro) : null,
    fundingPct: p.fundingPct ?? null,
    liquidezUsd: p.liquidezUsd ?? null,
  }
}

/** Distâncias do plano, em múltiplos do ATR. RR = 2,5 / 1,5 ≈ 1,67. */
export const PLANO_ATR = { sl: 1.5, tp: 2.5 } as const

function plano(lado: 'long' | 'short', preco: number, atrPreco: number) {
  const s = lado === 'long' ? 1 : -1
  return { entrada: preco, sl: preco - s * PLANO_ATR.sl * atrPreco, tp: preco + s * PLANO_ATR.tp * atrPreco }
}

/**
 * AG-SCANNER, parte determinística: há gatilho neste ativo? Só com gatilho é que se gasta uma
 * chamada de IA. Regras simples e escritas, para se poderem medir e desligar uma a uma.
 *
 *  · rompimento: fecho acima do máximo (abaixo do mínimo) das 20 velas anteriores com volume ≥ 1,5×;
 *  · rsi-extremo: RSI ≤ 25 (long) ou ≥ 75 (short), só nos perps (nas memecoins é armadilha);
 *  · meme-momento: memecoin aprovada pelo filtro de rug, a subir a 5 min e a 1 h, com volume ≥ 2×.
 */
export function detectarGatilho(r: Retrato, velas5m: Vela[]): Gatilho | null {
  const a = atr(velas5m)
  if (a == null || !(a > 0) || velas5m.length < 22) return null
  const base = { ativo: r.ativo, mercado: r.mercado, id: r.id }
  const ult = velas5m[velas5m.length - 1]
  const janela = velas5m.slice(-21, -1)
  const max = Math.max(...janela.map((x) => x.h))
  const min = Math.min(...janela.map((x) => x.l))
  const vol = r.volumeRelativo ?? 0

  if (r.mercado === 'spot') {
    if (r.rug && !r.rug.aprovado) return null
    if ((r.var5mPct ?? 0) > 0 && (r.var1hPct ?? 0) > 0 && vol >= 2 && ult.c > max) {
      return { ...base, tipo: 'meme-momento', lado: 'long', ...plano('long', r.preco, a), porque: `Rompeu o máximo de 20 velas com ${vol.toFixed(1)}× volume, a subir a 5 min e 1 h.` }
    }
    return null
  }
  if (vol >= 1.5 && ult.c > max) {
    return { ...base, tipo: 'rompimento', lado: 'long', ...plano('long', r.preco, a), porque: `Fecho acima do máximo de 20 velas (${max}) com ${vol.toFixed(1)}× volume.` }
  }
  if (vol >= 1.5 && ult.c < min) {
    return { ...base, tipo: 'rompimento', lado: 'short', ...plano('short', r.preco, a), porque: `Fecho abaixo do mínimo de 20 velas (${min}) com ${vol.toFixed(1)}× volume.` }
  }
  if (r.rsi14 != null && r.rsi14 <= 25) {
    return { ...base, tipo: 'rsi-extremo', lado: 'long', ...plano('long', r.preco, a), porque: `RSI 14 em ${r.rsi14.toFixed(1)} (sobrevendido).` }
  }
  if (r.rsi14 != null && r.rsi14 >= 75) {
    return { ...base, tipo: 'rsi-extremo', lado: 'short', ...plano('short', r.preco, a), porque: `RSI 14 em ${r.rsi14.toFixed(1)} (sobrecomprado).` }
  }
  return null
}

/** Pareceres dos três sub-agentes de números sobre um gatilho. Nenhum veta: só informam. */
export function pareceresNumericos(r: Retrato, g: Gatilho): Parecer[] {
  const s = g.lado === 'long' ? 1 : -1
  const out: Parecer[] = []
  const rsiV = r.rsi14
  out.push({
    agente: 'analise-tecnica',
    favor: rsiV == null ? 0 : g.tipo === 'rsi-extremo' ? 0.5 : s * (rsiV > 50 ? 0.5 : -0.5),
    nota: `RSI ${rsiV?.toFixed(1) ?? '?'}, ATR ${r.atrPct?.toFixed(2) ?? '?'}%, 1 h ${r.var1hPct?.toFixed(2) ?? '?'}%.`,
  })
  const vol = r.volumeRelativo
  out.push({
    agente: 'volume',
    favor: vol == null ? 0 : vol >= 2 ? 0.7 : vol >= 1.2 ? 0.3 : -0.3,
    nota: `Volume ${vol?.toFixed(2) ?? '?'}× a média de 20 velas.`,
  })
  const d = r.desequilibrioLivro
  const f = r.fundingPct
  let favorFluxo = d == null ? 0 : Math.max(-1, Math.min(1, s * d * 2))
  // Funding muito pago pelo lado que queremos = multidão já lá está.
  if (f != null && s * f > 0.05) favorFluxo -= 0.3
  out.push({
    agente: 'order-flow',
    favor: Math.max(-1, Math.min(1, favorFluxo)),
    nota: `Livro ${d == null ? '?' : (d * 100).toFixed(0) + '%'} a favor dos compradores; funding ${f?.toFixed(4) ?? '?'}%.`,
  })
  return out
}
