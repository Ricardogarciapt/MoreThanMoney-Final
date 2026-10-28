/**
 * AGENTE CRIPTO: a GUARDA (sub-agente de proteção de capital). Pura, com VETO absoluto.
 *
 * É o que falta ao claudefi: lá o modelo chama a ferramenta de swap e a validação é um hook à
 * volta. Aqui o modelo só devolve um JSON; quem decide se vira ordem, e de que tamanho, é este
 * ficheiro. O tamanho NUNCA vem da IA: calcula-se pelo risco (distância ao SL) e pelos tectos.
 *
 * O executor real da VPS volta a verificar os tectos com os SEUS limites (env da VPS), porque esta
 * guarda corre num processo que lê a Supabase, e a Supabase pode ser escrita por outros.
 */
import { riscoRecompensa, travaoDiario } from '../agentes/trader-disciplina'
import type { DecisaoIA, Gatilho, Modo, OrdemAprovada, Parecer, PosicaoAberta, Retrato } from './tipos'

export const LIMITES_PADRAO = {
  frescuraMaxMs: 5 * 60_000,
  confiancaMin: 0.7,
  /** Teto pedido pelo dono: 5×. A casa começa em 3×. */
  alavancagemMax: 3,
  /** Risco por trade (perda até ao SL) em fracção do capital. */
  riscoPorTrade: 0.01,
  /** Margem máxima por posição em fracção do capital. */
  margemMaxPorPosicao: 0.2,
  /** Memecoins: nocional máximo em fracção do capital. */
  memeMaxPorPosicao: 0.05,
  maxPosicoes: 4,
  maxMemecoins: 2,
  perdaDiariaMax: 0.02,
  drawdownMax: 0.15,
  rrMin: 1.5,
  slMaxPctPerp: 8,
  slMaxPctSpot: 20,
  slippageMaxPctPerp: 0.5,
  slippageMaxPctSpot: 3,
  liquidezMinUsd: 50_000,
  /** Tokens da Pump.fun já graduados (perfil «pump» do filtro de rug). */
  liquidezMinPumpUsd: 15_000,
  /** Abaixo disto não vale a pena (taxas comem tudo). */
  nocionalMinUsd: 10,
  /** Sem vantagem medida ainda: abre com esta fracção do tamanho, para medir. 0 = não abre. */
  exploracaoFraccao: 0.25,
  minAmostra: 20,
} as const

export type Limites = { -readonly [K in keyof typeof LIMITES_PADRAO]: number }

export function lerLimites(bruto: unknown): Limites {
  const r: Limites = { ...LIMITES_PADRAO }
  if (!bruto || typeof bruto !== 'object') return r
  const f = bruto as Record<string, unknown>
  for (const k of Object.keys(r) as (keyof Limites)[]) {
    const v = Number(f[k])
    if (f[k] != null && Number.isFinite(v) && v >= 0) r[k] = v
  }
  // Tecto que não se sobe por configuração: o dono pediu 5× no máximo.
  r.alavancagemMax = Math.min(r.alavancagemMax, 5)
  return r
}

export interface EstadoConta {
  capitalUsd: number
  picoUsd: number
  pnlHojeUsd: number
  abertas: PosicaoAberta[]
}

/** Vantagem medida do tipo de gatilho (rompimento, rsi-extremo, meme-momento) no modo actual. */
export interface VantagemGatilho {
  n: number
  aprovada: boolean
  porque: string
}

export interface EntradaGuarda {
  modo: Modo
  agora: Date
  retrato: Retrato
  gatilho: Gatilho
  decisao: DecisaoIA | null
  pareceres: Parecer[]
  conta: EstadoConta
  vantagem: VantagemGatilho
  limites?: Limites
}

const ACAO_ESPERADA = { 'perp:long': 'LONG_PERP', 'perp:short': 'SHORT_PERP', 'spot:long': 'BUY_SPOT' } as const

/**
 * PAPEL SEM IA. Quando a cadeia grátis de IA está em baixo, o papel não pára: decide o código (o
 * plano do gatilho, com confiança no mínimo da guarda) e a guarda faz o resto — filtro de rug,
 * tectos, travões, tamanho. A posição fica marcada (`sem-ia:<tipo>`) para a régua a medir à parte.
 * No REAL devolve sempre null: dinheiro a sério só com a IA a responder.
 */
export const PREFIXO_SEM_IA = 'sem-ia:'
export const iaEmBaixo = (p: Parecer) => !!p.veto && /^IA indisponível/.test(p.nota)

export function decisaoSemIA(g: Gatilho, modo: Modo, L: Limites = { ...LIMITES_PADRAO }): DecisaoIA | null {
  if (modo !== 'papel') return null
  const action = ACAO_ESPERADA[`${g.mercado}:${g.lado}` as keyof typeof ACAO_ESPERADA]
  if (!action) return null
  return {
    action,
    execution_details: { leverage: 1, max_slippage_pct: g.mercado === 'perp' ? L.slippageMaxPctPerp : L.slippageMaxPctSpot },
    rationale: { technical_trigger: `Sem IA (papel): decide o gatilho ${g.tipo}. ${g.porque}`.slice(0, 400), confidence_score: L.confiancaMin },
    risk_check: { stop_loss_price: g.sl, take_profit_price: g.tp, is_within_safety_limits: true },
  }
}

export function guardar(e: EntradaGuarda): { ordem: OrdemAprovada | null; recusas: string[] } {
  const L = e.limites ?? { ...LIMITES_PADRAO }
  const g = e.gatilho
  const r = e.retrato
  const d = e.decisao
  const recusas: string[] = []
  const nao = (m: string) => recusas.push(m)

  if (!d) {
    // Com veto, a IA nem chega a ser chamada: a recusa é o veto, não «a IA falhou».
    const vetos = e.pareceres.filter((p) => p.veto).map((p) => `Veto de ${p.agente}: ${p.nota}`)
    return { ordem: null, recusas: vetos.length ? vetos : ['A IA não devolveu um JSON válido: vale HOLD.'] }
  }
  if (d.action === 'HOLD' || d.action === 'ERROR') return { ordem: null, recusas: [`AG-TRADER: ${d.action} (${d.rationale.technical_trigger}).`] }

  const esperada = ACAO_ESPERADA[`${g.mercado}:${g.lado}` as keyof typeof ACAO_ESPERADA]
  if (!esperada) nao(`Combinação não suportada: ${g.mercado} ${g.lado}.`)
  else if (d.action !== esperada) nao(`A IA pediu ${d.action}, o gatilho era ${esperada}.`)

  const idade = e.agora.getTime() - new Date(r.em).getTime()
  if (!(idade >= 0 && idade <= L.frescuraMaxMs)) nao(`Dados com ${Math.round(idade / 1000)} s: velhos demais.`)
  if (d.rationale.confidence_score < L.confiancaMin) nao(`Confiança ${d.rationale.confidence_score.toFixed(2)} < ${L.confiancaMin}.`)
  if (!d.risk_check.is_within_safety_limits) nao('A própria IA diz que está fora dos limites.')

  for (const p of e.pareceres) if (p.veto) nao(`Veto de ${p.agente}: ${p.nota}`)

  const sl = d.risk_check.stop_loss_price
  const tp = d.risk_check.take_profit_price
  const preco = r.preco
  const rr = riscoRecompensa({ direcao: g.lado === 'long' ? 'buy' : 'sell', entrada: preco, sl, tps: [tp] })
  if (rr == null) nao('SL ou TP do lado errado do preço.')
  else if (rr < L.rrMin) nao(`Risco/recompensa ${rr.toFixed(2)} < ${L.rrMin}.`)
  const distSlPct = (Math.abs(preco - sl) / preco) * 100
  const slMax = g.mercado === 'perp' ? L.slMaxPctPerp : L.slMaxPctSpot
  if (distSlPct > slMax) nao(`SL a ${distSlPct.toFixed(2)}% (máx. ${slMax}%).`)

  // Pump.fun graduado (perfil «pump» do rug): também quando o gatilho é uma carteira esperta num token pump.
  const liqMin = g.tipo === 'pump-graduado' || (g.tipo === 'carteira-esperta' && g.id.endsWith('pump')) ? L.liquidezMinPumpUsd : L.liquidezMinUsd
  if (g.mercado === 'spot' && !((r.liquidezUsd ?? 0) >= liqMin)) nao(`Liquidez ${Math.round(r.liquidezUsd ?? 0)} $ < ${liqMin} $.`)

  const c = e.conta
  if (!(c.capitalUsd > 0)) nao('Sem capital.')
  if (travaoDiario(c.pnlHojeUsd, c.capitalUsd, { perdaDiariaMax: L.perdaDiariaMax })) nao(`Travão do dia: ${c.pnlHojeUsd.toFixed(2)} $ hoje.`)
  if (c.picoUsd > 0 && (c.picoUsd - c.capitalUsd) / c.picoUsd >= L.drawdownMax) nao(`Drawdown de ${(((c.picoUsd - c.capitalUsd) / c.picoUsd) * 100).toFixed(1)}% desde o pico: tudo parado.`)
  if (c.abertas.length >= L.maxPosicoes) nao(`Já há ${c.abertas.length} posições abertas.`)
  if (c.abertas.some((p) => p.ativo === g.ativo)) nao(`Já há uma posição em ${g.ativo}.`)
  if (g.mercado === 'spot' && c.abertas.filter((p) => p.mercado === 'spot').length >= L.maxMemecoins) nao('Máximo de memecoins abertas atingido.')

  let exploracao = false
  if (e.vantagem.n >= L.minAmostra && !e.vantagem.aprovada) nao(`Medido a perder: ${e.vantagem.porque}`)
  else if (!e.vantagem.aprovada) {
    if (L.exploracaoFraccao > 0) exploracao = true
    else nao(`Sem vantagem medida ainda: ${e.vantagem.porque}`)
  }

  const alav = g.mercado === 'perp' ? Math.max(1, Math.min(d.execution_details.leverage, L.alavancagemMax)) : 1
  let nocional = distSlPct > 0 ? (c.capitalUsd * L.riscoPorTrade) / (distSlPct / 100) : 0
  nocional = Math.min(nocional, g.mercado === 'perp' ? c.capitalUsd * L.margemMaxPorPosicao * alav : c.capitalUsd * L.memeMaxPorPosicao)
  if (exploracao) nocional *= L.exploracaoFraccao
  nocional = Math.floor(nocional * 100) / 100
  if (nocional < L.nocionalMinUsd) nao(`Tamanho ${nocional.toFixed(2)} $ abaixo do mínimo de ${L.nocionalMinUsd} $.`)

  const slippageTecto = g.mercado === 'perp' ? L.slippageMaxPctPerp : L.slippageMaxPctSpot
  if (recusas.length) return { ordem: null, recusas }
  return {
    ordem: {
      acao: d.action,
      ativo: g.ativo,
      mercado: g.mercado,
      id: g.id,
      lado: g.lado,
      nocionalUsd: nocional,
      alavancagem: alav,
      entrada: preco,
      sl,
      tp,
      slippageMaxPct: Math.min(d.execution_details.max_slippage_pct, slippageTecto),
      exploracao,
    },
    recusas: [],
  }
}
