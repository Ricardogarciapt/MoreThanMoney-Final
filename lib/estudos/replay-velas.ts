/**
 * REPLAY DE UM SINAL EM VELAS — o núcleo que scripts/estudos/perfil-gk-aurum.ts usava sozinho, tirado
 * para aqui para a sombra das estratégias (lib/mtmauto/sombra, services/sombra-estrategias) medir
 * com a MESMA régua. Puro: sem fs, sem rede — quem chama traz as velas.
 *
 * CONVENÇÕES — as mesmas de lib/mtmfunded/reconstituicao.ts (e é por isso que não se reescreve):
 *  1. Dentro de uma vela o extremo ADVERSO vem primeiro (compra: mínimo → máximo → fecho). Se a
 *     mesma vela toca stop e alvo, GANHA O STOP.
 *  2. A vela do sinal não é avaliada: mede-se a partir da PRIMEIRA vela que ABRE depois do alerta.
 *  3. Ordem dentro de cada tick, igual ao motor: SL → gestão (parciais → break-even → trailing) → TP.
 *  4. O trailing e o break-even só APERTAM; o trailing anda aos saltos de max(1 pip, distância/10),
 *     como `passoTrailing` em lib/mtmfunded/simulado/avancadas.ts.
 *  5. Spread simulado à volta do preço médio da vela: entra-se no lado caro, sai-se no lado barato.
 *  6. Unidades: `pipSizeForSymbol` de lib/mtmcopy/trade-outcome (cripto e índices em PONTOS). O
 *     resultado é sempre em R (fracções do risco inicial DEPOIS do spread).
 */
import { pipSizeForSymbol } from '../mtmcopy/trade-outcome'

export type Direcao = 'buy' | 'sell'
export interface Vela { t: number; o: number; h: number; l: number; c: number }
export interface Sinal {
  id: string; em: number; ticker: string; tv: string; direcao: Direcao
  entrada: number; sl: number; tps: number[]
}

/** Taxa da Bybit nos dois lados, em fracção do preço — o «spread» dos perpétuos. */
export const CUSTO_PERP = 0.0005

/**
 * Meio spread, em preço — a tabela do estudo GoldKiller/Aurum, intocada (mudar isto mudava os
 * números já publicados em docs/analise-perfil-gk-aurum.md). Quem precisa de outra tabela (os pares
 * de forex do Scanner) passa `meio` em `OpcoesReplay`.
 */
export function meioSpread(ticker: string, preco: number): number {
  const t = ticker.toUpperCase()
  if (t === 'XAUUSD') return 0.32 / 2
  if (t === 'US30') return 3.6 / 2
  if (/^(USDJPY|USDCAD|EURUSD|GBPUSD|NAS100)$/.test(t)) return pipSizeForSymbol(t) * (t === 'NAS100' ? 20 : 1.5) / 2
  return (preco * CUSTO_PERP) / 2
}

/** Os preços de uma vela pela ordem mais desfavorável (reconstituicao.ts → ticksDaVela). */
export const ticksDaVela = (v: Vela, d: Direcao): number[] => (d === 'buy' ? [v.l, v.h, v.c] : [v.h, v.l, v.c])

export interface Perfil {
  nome: string
  /** gatilho do break-even, em R (null = sem break-even por distância) */
  beR: number | null
  /** lucro fechado pelo break-even, em R */
  beOffsetR: number
  /** onde o trailing arranca, em R (null = sem trailing) */
  trailArranqueR: number | null
  /** distância do trailing, em R */
  trailDistanciaR: number
  /**
   * Break-even quando a PRIMEIRA parcial é feita (o `be_no_tp1` do motor). Só faz sentido com
   * parciais; sem elas quem chama traduz para `beR` = distância ao TP1, como `gestaoDoSinal`.
   */
  beNoTp1?: boolean
  /** Fracções das parciais (0,5 = 50%). Por omissão 50% no TP1 e 25% no TP2 — o modelo do estudo. */
  partes?: number[]
}

export interface Resultado {
  /** resultado total da posição em R (soma das partes) */
  R: number
  motivo: 'sl' | 'tp' | 'be' | 'trailing' | 'aberta'
  /** maior excursão a favor antes do stop original, em R */
  mfeR: number
  /** maior excursão contra, em R */
  maeR: number
  barras: number
  /** abertura da primeira vela avaliada (ms) — a posição conta como aberta a partir do sinal */
  inicioEm: number
  /** fim da vela em que a posição fechou, ou fim da janela se ficou aberta (ms) */
  fechoEm: number
}

export interface OpcoesReplay {
  /** quantas velas se seguem depois do sinal (por omissão 288 = 3 dias em M15) */
  janelaBarras?: number
  /** duração de uma vela em segundos (para `fechoEm`; por omissão 900 = M15) */
  segundosVela?: number
  /** meio spread em preço; por omissão `meioSpread(ticker, entrada)` */
  meio?: number
}

/**
 * Replica UM sinal sobre as velas com um perfil de gestão. `perfil` a null = baseline: parciais e
 * alvos iguais, sem break-even e sem trailing.
 */
export function replicar(s: Sinal, velas: Vela[], perfil: Perfil | null, opcoes: OpcoesReplay = {}): Resultado | { erro: string } {
  const janelaBarras = opcoes.janelaBarras ?? 288
  const segundosVela = opcoes.segundosVela ?? 900
  const sinal = s.direcao === 'buy' ? 1 : -1
  const meio = opcoes.meio ?? meioSpread(s.ticker, s.entrada)
  // Entra-se ao preço anunciado, no lado caro do spread.
  const entrada = s.entrada + sinal * meio
  const Rp = Math.abs(entrada - s.sl)
  if (!(Rp > 0)) return { erro: 'risco zero depois do spread' }

  const i0 = velas.findIndex((v) => v.t * 1000 >= s.em)
  if (i0 < 0) return { erro: 'sinal depois da última vela' }
  const janela = velas.slice(i0, i0 + janelaBarras)
  if (janela.length < 4) return { erro: 'menos de 4 velas depois do sinal' }
  // Sem vela nos 30 min a seguir ao alerta não se replica (buraco no histórico / mercado fechado).
  if (janela[0].t * 1000 - s.em > 30 * 60 * 1000) return { erro: 'sem velas no histórico à hora do sinal' }

  const tpFinal = s.tps[s.tps.length - 1]
  const fraccoes = perfil?.partes ?? [0.5, 0.25]
  const partes = fraccoes
    .map((pct, i) => ({ pct, preco: s.tps[i] ?? tpFinal, feito: false }))
    .filter((p) => p.preco != null && (p.preco - entrada) * sinal > 0 && (p.preco - tpFinal) * sinal < 0)

  let sl = s.sl
  let vivo = 1
  let R = 0
  let motivo: Resultado['motivo'] = 'aberta'
  let mfe = 0
  let mae = 0
  let slOriginalTocado = false
  let barras = 0
  let fechoEm = 0
  let beFeito = false

  const passo = Math.max(pipSizeForSymbol(s.ticker), perfil ? (perfil.trailDistanciaR * Rp) / 10 : Infinity)
  const nivelBe = perfil ? entrada + sinal * perfil.beOffsetR * Rp : 0
  const armarBe = (x: number) => {
    // só aperta, e só se ficar do lado certo do preço
    if ((nivelBe - sl) * sinal > 0 && (x - nivelBe) * sinal > 0) { sl = nivelBe; beFeito = true }
  }

  for (const v of janela) {
    barras++
    for (const medio of ticksDaVela(v, s.direcao)) {
      // Fecha-se no lado barato do spread.
      const x = medio - sinal * meio
      const favor = (x - entrada) * sinal

      // MFE/MAE do CAMINHO: até ao stop original, sem gestão pelo meio.
      if (!slOriginalTocado) {
        if (favor > mfe) mfe = favor
        if (favor < mae) mae = favor
        if ((x - s.sl) * sinal <= 0) slOriginalTocado = true
      }

      if (motivo !== 'aberta') continue

      // 1) SL primeiro — num salto de preço o stop ganha ao alvo
      if ((x - sl) * sinal <= 0) {
        R += (vivo * (sl - entrada) * sinal) / Rp
        motivo = sl === s.sl ? 'sl' : (beFeito && Math.abs(sl - nivelBe) < 1e-12 ? 'be' : 'trailing')
        vivo = 0
        fechoEm = (v.t + segundosVela) * 1000
        continue
      }

      // 2) parciais, por ordem. Uma parcial já feita SALTA-SE (continue). A versão original do estudo
      // tinha `break` aqui, e isso impedia a 2.ª parcial sempre que o TP2 não era tocado no MESMO
      // tick do TP1 — o pedaço de 25% corria até ao alvo final ou ao stop. Corrigido a 16/09.
      for (const parte of partes) {
        if (parte.feito) continue
        if ((x - parte.preco) * sinal < 0) break
        parte.feito = true
        R += (parte.pct * (parte.preco - entrada) * sinal) / Rp
        vivo = Math.max(0, vivo - parte.pct)
      }
      if (vivo <= 0) { motivo = 'tp'; fechoEm = (v.t + segundosVela) * 1000; continue }

      if (perfil) {
        // 3) break-even — no TP1 (parcial feita) ou por distância
        if (perfil.beNoTp1 && partes.length && partes[0].feito) armarBe(x)
        if (perfil.beR != null && favor >= perfil.beR * Rp - 1e-12) armarBe(x)
        // 4) trailing
        if (perfil.trailArranqueR != null && favor >= perfil.trailArranqueR * Rp - 1e-12) {
          const candidato = x - sinal * perfil.trailDistanciaR * Rp
          if ((candidato - sl) * sinal >= passo - 1e-12) sl = candidato
        }
      }

      // 5) TP final
      if ((x - tpFinal) * sinal >= 0) {
        R += (vivo * (tpFinal - entrada) * sinal) / Rp
        vivo = 0
        motivo = 'tp'
        fechoEm = (v.t + segundosVela) * 1000
      }
    }
    // Só se pára quando a posição fechou E o caminho já tocou o stop original (o MFE precisa do resto).
    if (motivo !== 'aberta' && slOriginalTocado) break
  }

  if (motivo === 'aberta' && vivo > 0) {
    // Fica aberta: marca-se a mercado no fim da janela, que é o que o dono veria na conta.
    const ultima = janela[janela.length - 1]
    R += (vivo * (ultima.c - sinal * meio - entrada) * sinal) / Rp
    fechoEm = (ultima.t + segundosVela) * 1000
  }

  return { R, motivo, mfeR: mfe / Rp, maeR: mae / Rp, barras, inicioEm: s.em, fechoEm }
}

// ── estatística ──────────────────────────────────────────────────────────────

export const percentil = (xs: number[], p: number): number => {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const i = (s.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo)
}

/** Pior sequência: a maior queda acumulada em R pela ordem cronológica (valor ≤ 0). */
export function piorSequencia(rs: number[]): number {
  let pico = 0
  let acc = 0
  let pior = 0
  for (const r of rs) {
    acc += r
    if (acc > pico) pico = acc
    if (acc - pico < pior) pior = acc - pico
  }
  return pior
}

/** Maior número de perdas SEGUIDAS pela ordem cronológica (uma trade a 0 R não parte nem soma). */
export function perdasSeguidas(rs: number[]): number {
  let atual = 0
  let max = 0
  for (const r of rs) {
    if (r < -1e-9) { atual++; if (atual > max) max = atual }
    else if (r > 1e-9) atual = 0
  }
  return max
}
