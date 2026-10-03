/**
 * ORDENS AVANÇADAS — trailing stop, break-even automático, take-profits parciais, OCO e fechos em
 * lote. Puro, como `matematica.ts`: o site valida com isto antes de gravar e o motor do VPS decide
 * com isto a cada preço. Uma regra escrita duas vezes era uma conta a comportar-se de uma maneira
 * no ecrã e de outra no motor.
 *
 * A UNIDADE é o PREÇO. O trader pensa em pips, em dinheiro ou em preço; o ticket converte tudo com
 * `distanciaEmPreco` antes de enviar, e a base guarda distâncias em preço (migração 072). O motor
 * não precisa de saber de pips nem de conversões de moeda para mover um SL.
 *
 * AS REGRAS, e porquê:
 *  · o trailing só APERTA (compra: o SL só sobe) e anda aos saltos de `passoTrailing` — um SL a
 *    mexer a cada décimo de pip gerava uma escrita (e um evento no copiador) por tick;
 *  · o break-even também só aperta, e acontece uma vez (`be_feito`);
 *  · os TPs parciais medem-se contra o volume INICIAL (TP1 50% = metade do que se abriu, não
 *    metade do que resta) e fecham ao nível exacto, como o TP normal;
 *  · o que um parcial deixaria abaixo do lote mínimo fecha-se todo — como numa corretora.
 */
import {
  type Direcao, type MapaPrecos, type Preco, type Simbolo,
  lucroUsd, normalizarVolume, precoDeFecho,
} from './matematica'

export interface TpParcial { preco: number; pct: number; atingido: boolean }

/** A gestão de uma posição (e de uma pendente, que a passa à posição quando dispara). */
export interface Gestao {
  trailing_distancia: number | null
  trailing_ativacao: number | null
  be_gatilho: number | null
  be_offset: number
  be_no_tp1: boolean
  be_feito: boolean
  tps: TpParcial[] | null
  volume_inicial: number | null
}

export const GESTAO_VAZIA: Gestao = {
  trailing_distancia: null, trailing_ativacao: null, be_gatilho: null, be_offset: 0, be_no_tp1: false,
  be_feito: false, tps: null, volume_inicial: null,
}

const numOuNull = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** A gestão lida de uma linha da base (funded_positions ou funded_orders). */
export function gestaoDaLinha(r: Record<string, unknown>): Gestao {
  let tps: TpParcial[] | null = null
  const bruto = typeof r.tps === 'string' ? safeJson(r.tps) : r.tps
  if (Array.isArray(bruto)) {
    tps = bruto
      .map((t) => ({ preco: Number((t as TpParcial).preco), pct: Number((t as TpParcial).pct), atingido: Boolean((t as TpParcial).atingido) }))
      .filter((t) => t.preco > 0 && t.pct > 0)
    if (!tps.length) tps = null
  }
  return {
    trailing_distancia: numOuNull(r.trailing_distancia),
    trailing_ativacao: numOuNull(r.trailing_ativacao),
    be_gatilho: numOuNull(r.be_gatilho),
    be_offset: numOuNull(r.be_offset) ?? 0,
    be_no_tp1: r.be_no_tp1 === true || r.be_no_tp1 === 'true',
    be_feito: r.be_feito === true || r.be_feito === 'true',
    tps,
    volume_inicial: numOuNull(r.volume_inicial),
  }
}

function safeJson(s: string): unknown { try { return JSON.parse(s) } catch { return null } }

export function temGestao(g: Gestao | null | undefined): boolean {
  return Boolean(g && (g.trailing_distancia || g.be_gatilho || g.be_no_tp1 || (g.tps && g.tps.length)))
}

// ── conversões do ticket ─────────────────────────────────────────────────

export type UnidadeDistancia = 'pips' | 'preco' | 'usd'

/**
 * Uma distância escrita em pips, preço ou dinheiro → em preço. O dinheiro precisa do volume: 30 $
 * de trailing em 0,10 lote de ouro são 3 $ de preço; em 1 lote são 0,30 $.
 */
export function distanciaEmPreco(
  s: Simbolo, valor: number | null, unidade: UnidadeDistancia, volume: number, preco: number, precos: MapaPrecos,
): number | null {
  if (valor == null || !(valor > 0)) return null
  const f = Math.pow(10, s.digits)
  if (unidade === 'preco') return Math.round(valor * f) / f
  if (unidade === 'pips') return Math.round(valor * s.pip_size * f) / f
  const umPreco = lucroUsd(s, 'buy', volume, preco, preco + 1, precos)
  if (umPreco == null || !(umPreco > 0)) return null
  const d = Math.round((valor / umPreco) * f) / f
  return d > 0 ? d : null
}

/** O salto mínimo do trailing: 1 pip, ou um décimo da distância se for maior. */
export function passoTrailing(s: Simbolo, distancia: number): number {
  return Math.max(s.pip_size, distancia / 10)
}

export type Falha = { ok: false; erro: string }

/**
 * Valida e normaliza a gestão pedida pelo ticket para uma posição/ordem com esta entrada e volume.
 * Os TPs têm de estar do lado do lucro, por ordem a afastar-se da entrada, e cada parte tem de dar
 * pelo menos o lote mínimo. As % somam no máximo 100: o que sobra fecha no TP normal (ou fica).
 */
export function validarGestao(
  s: Simbolo, direcao: Direcao, entrada: number, volume: number, sl: number | null, tp: number | null,
  pedido: Partial<Gestao> | null | undefined,
): { ok: true; gestao: Gestao } | Falha {
  const g: Gestao = { ...GESTAO_VAZIA, volume_inicial: volume }
  if (!pedido) return { ok: true, gestao: g }
  const sinal = direcao === 'buy' ? 1 : -1
  const f = Math.pow(10, s.digits)
  const arred = (x: number) => Math.round(x * f) / f

  const td = numOuNull(pedido.trailing_distancia)
  if (td != null) {
    if (!(td > 0)) return { ok: false, erro: 'a distância do trailing tem de ser positiva' }
    if (td < s.pip_size) return { ok: false, erro: `o trailing tem de ter pelo menos 1 pip (${s.pip_size})` }
    g.trailing_distancia = arred(td)
    const ta = numOuNull(pedido.trailing_ativacao)
    if (ta != null && ta < 0) return { ok: false, erro: 'a ativação do trailing não pode ser negativa' }
    g.trailing_ativacao = ta == null || ta === 0 ? null : arred(ta)
  }

  const bg = numOuNull(pedido.be_gatilho)
  const bo = numOuNull(pedido.be_offset) ?? 0
  g.be_no_tp1 = Boolean(pedido.be_no_tp1)
  if (bg != null) {
    if (!(bg > 0)) return { ok: false, erro: 'o gatilho do break-even tem de ser positivo' }
    g.be_gatilho = arred(bg)
  }
  if (bg != null || g.be_no_tp1) {
    if (bo < 0) return { ok: false, erro: 'o offset do break-even não pode ser negativo' }
    if (bg != null && bo >= bg) return { ok: false, erro: 'o offset do break-even tem de ser menor que o gatilho' }
    g.be_offset = arred(bo)
  }

  if (pedido.tps && pedido.tps.length) {
    const tps = pedido.tps.map((t) => ({ preco: Number(t.preco), pct: Number(t.pct), atingido: false }))
    if (tps.length > 3) return { ok: false, erro: 'no máximo 3 take-profits parciais' }
    let soma = 0
    let anterior = entrada
    for (const [i, t] of tps.entries()) {
      if (!(t.preco > 0) || !(t.pct > 0)) return { ok: false, erro: `TP${i + 1}: indica preço e %` }
      if ((t.preco - anterior) * sinal <= 0) {
        return { ok: false, erro: i === 0 ? `TP1 tem de ficar ${direcao === 'buy' ? 'acima' : 'abaixo'} da entrada` : `TP${i + 1} tem de ficar para lá do TP${i}` }
      }
      if (sl != null && (t.preco - sl) * sinal <= 0) return { ok: false, erro: `TP${i + 1} está do lado do stop` }
      const parte = volumeDaParte(s, volume, t.pct)
      if (parte == null) return { ok: false, erro: `TP${i + 1}: ${t.pct}% de ${volume} lote é menos que o lote mínimo (${s.volume_min})` }
      soma += t.pct
      anterior = t.preco
      t.preco = arred(t.preco)
    }
    if (soma > 100 + 1e-9) return { ok: false, erro: 'as % dos take-profits somam mais de 100%' }
    if (tp != null && (tp - anterior) * sinal < 0) return { ok: false, erro: `o TP final tem de ficar para lá do TP${tps.length}` }
    g.tps = tps
  }
  return { ok: true, gestao: g }
}

/** Lotes de uma parte: % do volume inicial, arredondado PARA BAIXO ao passo. null se < mínimo. */
export function volumeDaParte(s: Simbolo, volumeInicial: number, pct: number): number | null {
  const bruto = (volumeInicial * pct) / 100
  const passos = Math.floor(bruto / s.volume_step + 1e-9)
  const v = Math.round(passos * s.volume_step * 100) / 100
  return v >= s.volume_min - 1e-9 ? v : null
}

// ── a decisão do motor, por posição, a cada preço ─────────────────────────

export interface PosicaoGerida {
  id: string
  symbol: string
  direcao: Direcao
  volume: number
  preco_entrada: number
  sl: number | null
  tp: number | null
  gestao?: Gestao | null
}

export interface ParcialDecidido {
  indice: number
  volume: number
  preco: number
  pnl: number
  /** A parte fecharia a posição inteira (resto < mínimo, ou era o último 100%). */
  fechaTudo: boolean
}

export interface DecisaoGestao {
  parciais: ParcialDecidido[]
  /** O estado dos TPs DEPOIS dos parciais deste tick (para gravar na mesma transacção). */
  tps: TpParcial[] | null
  volumeRestante: number
  novoSl: number | null
  motivoSl: 'trailing' | 'break_even' | null
  beFeito: boolean
}

const toca = (direcao: Direcao, x: number, nivel: number) => (direcao === 'buy' ? x >= nivel : x <= nivel)

/**
 * O que a gestão faz a UMA posição com este preço. Não fecha por SL nem pelo TP normal — isso é do
 * motor (avaliacao.ts), antes e depois disto. Ordem dentro da posição: parciais → break-even →
 * trailing (o BE «no TP1» tem de ver o TP1 que acabou de ser atingido neste mesmo preço).
 */
export function decidirGestao(pos: PosicaoGerida, s: Simbolo, p: Preco, precos: MapaPrecos): DecisaoGestao {
  const g = pos.gestao
  const out: DecisaoGestao = { parciais: [], tps: g?.tps ?? null, volumeRestante: pos.volume, novoSl: null, motivoSl: null, beFeito: Boolean(g?.be_feito) }
  if (!g) return out
  const x = precoDeFecho(pos.direcao, p)
  const f = Math.pow(10, s.digits)
  const arred = (v: number) => Math.round(v * f) / f
  const sinal = pos.direcao === 'buy' ? 1 : -1

  // ── parciais ──
  if (g.tps?.length) {
    const inicial = g.volume_inicial && g.volume_inicial > 0 ? g.volume_inicial : pos.volume
    const tps = g.tps.map((t) => ({ ...t }))
    let resto = pos.volume
    for (const [i, t] of tps.entries()) {
      if (t.atingido || resto <= 0) continue
      if (!toca(pos.direcao, x, t.preco)) break // por ordem: o TP2 não fecha antes do TP1
      t.atingido = true
      const ultimo = i === tps.length - 1
      const somaAte = tps.slice(0, i + 1).reduce((a, b) => a + b.pct, 0)
      let vol = volumeDaParte(s, inicial, t.pct) ?? 0
      let fechaTudo = false
      if (vol <= 0) continue
      if (vol >= resto - 1e-9 || resto - vol < s.volume_min - 1e-9 || (ultimo && somaAte >= 100 - 1e-9)) {
        vol = resto
        fechaTudo = true
      }
      const pnl = lucroUsd(s, pos.direcao, vol, pos.preco_entrada, t.preco, precos)
      if (pnl == null) { t.atingido = false; break } // sem conversão: fica para o tick em que houver
      out.parciais.push({ indice: i, volume: vol, preco: t.preco, pnl, fechaTudo })
      resto = Math.round((resto - vol) * 100) / 100
      if (fechaTudo) break
    }
    out.tps = tps
    out.volumeRestante = resto
  }
  if (out.volumeRestante <= 0) return out

  let sl = pos.sl
  // ── break-even ──
  if (!g.be_feito) {
    const favor = (x - pos.preco_entrada) * sinal
    const tp1 = out.tps?.[0]?.atingido === true
    if ((g.be_gatilho != null && favor >= g.be_gatilho - 1e-12) || (g.be_no_tp1 && tp1)) {
      const nivel = arred(pos.preco_entrada + sinal * (g.be_offset || 0))
      out.beFeito = true
      // Só aperta, e só se ainda estiver do lado certo do preço (senão fechava no mesmo instante).
      if ((sl == null || (nivel - sl) * sinal > 0) && (x - nivel) * sinal > 0) {
        sl = nivel
        out.novoSl = nivel
        out.motivoSl = 'break_even'
      }
    }
  }

  // ── trailing ──
  if (g.trailing_distancia && g.trailing_distancia > 0) {
    const favor = (x - pos.preco_entrada) * sinal
    if (g.trailing_ativacao == null || favor >= g.trailing_ativacao - 1e-12) {
      const candidato = arred(x - sinal * g.trailing_distancia)
      const passo = passoTrailing(s, g.trailing_distancia)
      if (sl == null ? true : (candidato - sl) * sinal >= passo - 1e-12) {
        // Um trailing pedido sem SL passa a ser o SL: começa logo à distância pedida.
        sl = candidato
        out.novoSl = candidato
        out.motivoSl = 'trailing'
      }
    }
  }
  return out
}

// ── fechos em lote ────────────────────────────────────────────────────────

export type FiltroLote = 'todas' | 'simbolo' | 'ganhadoras' | 'perdedoras' | 'compras' | 'vendas'

/**
 * Que posições um «Fechar…» apanha. Ganhadora/perdedora pelo lucro de preço de AGORA (sem preço,
 * não entra — não se fecha às cegas uma posição que não se sabe se ganha).
 */
export function selecionarParaFecho<T extends PosicaoGerida>(
  posicoes: T[], filtro: FiltroLote, simbolos: Record<string, Simbolo>, precos: MapaPrecos, symbol?: string | null,
): T[] {
  return posicoes.filter((pos) => {
    if (filtro === 'todas') return true
    if (filtro === 'simbolo') return pos.symbol === symbol
    if (filtro === 'compras') return pos.direcao === 'buy'
    if (filtro === 'vendas') return pos.direcao === 'sell'
    const s = simbolos[pos.symbol]
    const p = precos[pos.symbol]
    if (!s || !p) return false
    const l = lucroUsd(s, pos.direcao, pos.volume, pos.preco_entrada, precoDeFecho(pos.direcao, p), precos)
    if (l == null) return false
    return filtro === 'ganhadoras' ? l > 0 : l < 0
  })
}

// ── alertas de preço ──────────────────────────────────────────────────────

export interface AlertaPreco { id: string; symbol: string; condicao: 'acima' | 'abaixo'; preco: number }

/** A condição decide-se à criação, pelo lado do preço de agora — nunca dispara ao nascer. */
export function condicaoDoAlerta(nivel: number, bidAgora: number | null): 'acima' | 'abaixo' {
  return bidAgora == null || nivel >= bidAgora ? 'acima' : 'abaixo'
}

export function alertaDispara(a: AlertaPreco, p: Preco | undefined): boolean {
  if (!p) return false
  return a.condicao === 'acima' ? p.bid >= a.preco : p.bid <= a.preco
}

/** Risco em USD até ao SL (sempre positivo) — guardado à abertura para medir a trade em R. */
export function riscoInicialUsd(s: Simbolo, direcao: Direcao, volume: number, entrada: number, sl: number | null, precos: MapaPrecos): number | null {
  if (sl == null) return null
  const l = lucroUsd(s, direcao, volume, entrada, sl, precos)
  return l == null ? null : Math.abs(l)
}

export { normalizarVolume }
