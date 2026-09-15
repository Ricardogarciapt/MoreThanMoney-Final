/**
 * AS CONTAS DA CÓPIA ENTRE CONTAS — lote, símbolo, filtros, SL/TP, parciais e idempotência.
 *
 * Puro e testado (lib/copia-contas/__tests__/copia-contas.check.ts). Um arredondamento errado aqui é
 * dinheiro real no destino; por isso nada disto vive no serviço do VPS.
 *
 * Mesmas decisões do copiador MTM Funded (lib/mtmfunded/copia/dimensionar.ts), generalizadas para
 * as quatro plataformas: a regra de volume vem num formato neutro (RegraVolume) em vez da spec MT5.
 */
import { rankedBrokerSymbols } from '@/lib/mtmcopy/symbol-resolver'
import { canonicoDe } from '@/lib/webtrader/corretoras/regras'
import type { ContextoDestino, Direcao, EventoCopia, ModoLoteCopia, RegraVolume, RotaCopia, TipoEventoCopia } from './tipos'

// ── lote ─────────────────────────────────────────────────────────────────────

export const REGRA_POR_OMISSAO: RegraVolume = { min: 0.01, max: null, step: 0.01 }

function casasDo(step: number): number {
  return Math.min(8, (String(step).split('.')[1] || '').length)
}

export function arredondarAoStep(v: number, r: RegraVolume, para: 'baixo' | 'perto' = 'perto'): number {
  const step = r.step > 0 ? r.step : 0.01
  const n = para === 'baixo' ? Math.floor(v / step + 1e-9) : Math.round(v / step)
  return Number((n * step).toFixed(casasDo(step)))
}

export interface EntradaLote {
  modo: ModoLoteCopia
  valor: number
  volumeOrigem: number
  /** proporcional_saldo: saldo (ou equity) da origem */
  saldoOrigem: number | null
  equityDestino: number | null
  loteMax: number | null
  regra: RegraVolume
  /** risco_pct: distância do SL em preço e valor de 1,0 de preço por lote no destino */
  distanciaSl?: number | null
  valorPorPrecoPorLote?: number | null
}

export type Lote = { ok: true; volume: number; bruto: number } | { ok: false; motivo: string }

/**
 * Lote no destino. Nunca se sobe um lote minúsculo até ao mínimo da corretora quando isso passa do
 * DOBRO do pedido: numa conta pequena recusa-se, em vez de abrir várias vezes o risco escolhido.
 */
export function calcularLote(e: EntradaLote): Lote {
  const valor = Number.isFinite(e.valor) ? Number(e.valor) : NaN
  let bruto: number
  switch (e.modo) {
    case 'multiplicador':
      if (!(valor > 0 && valor <= 100)) return { ok: false, motivo: 'multiplicador inválido (0–100)' }
      if (!(e.volumeOrigem > 0)) return { ok: false, motivo: 'volume da origem inválido' }
      bruto = e.volumeOrigem * valor
      break
    case 'fixo':
      if (!(valor > 0 && valor <= 100)) return { ok: false, motivo: 'lote fixo inválido' }
      bruto = valor
      break
    case 'proporcional_saldo':
      if (!(e.saldoOrigem != null && e.saldoOrigem > 0)) return { ok: false, motivo: 'saldo da origem desconhecido' }
      if (!(e.equityDestino != null && e.equityDestino > 0)) return { ok: false, motivo: 'equity do destino desconhecida' }
      if (!(e.volumeOrigem > 0)) return { ok: false, motivo: 'volume da origem inválido' }
      bruto = (e.volumeOrigem * e.equityDestino) / e.saldoOrigem * (valor > 0 ? valor : 1)
      break
    case 'risco_pct': {
      if (!(valor > 0 && valor <= 10)) return { ok: false, motivo: 'risco % inválido (0–10)' }
      if (!(e.distanciaSl != null && e.distanciaSl > 0)) return { ok: false, motivo: 'risco % precisa de SL na posição de origem' }
      if (!(e.equityDestino != null && e.equityDestino > 0)) return { ok: false, motivo: 'equity do destino desconhecida' }
      if (!(e.valorPorPrecoPorLote != null && e.valorPorPrecoPorLote > 0)) return { ok: false, motivo: 'sem valor do tick no destino' }
      bruto = (e.equityDestino * valor / 100) / (e.distanciaSl * e.valorPorPrecoPorLote)
      break
    }
    default:
      return { ok: false, motivo: 'modo de lote desconhecido' }
  }
  if (!Number.isFinite(bruto) || bruto <= 0) return { ok: false, motivo: 'lote calculado inválido' }

  const r = e.regra
  const min = r.min > 0 ? r.min : 0.01
  if (bruto < min / 2) return { ok: false, motivo: `lote ${bruto.toFixed(4)} abaixo de metade do mínimo ${min}` }
  // Risco %: arredonda PARA BAIXO — um arredondamento nunca pode subir o risco escolhido.
  let v = Math.max(min, arredondarAoStep(bruto, r, e.modo === 'risco_pct' ? 'baixo' : 'perto'))
  if (r.max != null && r.max > 0 && v > r.max) v = arredondarAoStep(r.max, r, 'baixo')
  if (e.loteMax != null && e.loteMax > 0 && v > e.loteMax) {
    v = arredondarAoStep(e.loteMax, r, 'baixo')
    if (v < min) return { ok: false, motivo: `lote máximo ${e.loteMax} abaixo do mínimo da corretora ${min}` }
  }
  return { ok: true, volume: Number(v.toFixed(casasDo(r.step > 0 ? r.step : 0.01))), bruto }
}

// ── símbolo ──────────────────────────────────────────────────────────────────

/**
 * Símbolo da origem → símbolo no destino.
 *  1. mapa manual da rota (pelo símbolo da corretora de origem OU pelo canónico);
 *  2. MTM Funded: o canónico (o catálogo é canónico);
 *  3. MT4/MT5/TradeLocker: o 1.º da lista da corretora pelo ranking de sempre (rankedBrokerSymbols).
 *     A escolha fina por tradeMode (salta DISABLED/CLOSEONLY) faz-se no escritor, com as specs.
 */
export function mapearSimbolo(
  simboloOrigem: string,
  destinoTipo: RotaCopia['destino_tipo'],
  mapa: Record<string, string> | null | undefined,
  simbolosDestino: string[] | null,
): { simbolo: string | null; canonico: string; via: 'mapa' | 'canonico' | 'corretora' | 'nenhum' } {
  const bruto = String(simboloOrigem ?? '').toUpperCase().trim()
  const canonico = canonicoDe(bruto)
  const m = Object.fromEntries(Object.entries(mapa ?? {}).map(([k, v]) => [k.toUpperCase().trim(), String(v).trim()]))
  const manual = m[bruto] ?? m[canonico]
  if (manual) return { simbolo: manual, canonico, via: 'mapa' }
  if (destinoTipo === 'mtmfunded') return { simbolo: canonico, canonico, via: 'canonico' }
  if (!simbolosDestino) return { simbolo: null, canonico, via: 'nenhum' }
  const escolhido = rankedBrokerSymbols(canonico, simbolosDestino)[0] ?? null
  return { simbolo: escolhido, canonico, via: escolhido ? 'corretora' : 'nenhum' }
}

// ── filtros ──────────────────────────────────────────────────────────────────

export function motivoFiltro(
  rota: Pick<RotaCopia, 'filtro_simbolos' | 'filtro_direcao' | 'max_abertas'>,
  p: { symbol: string; direcao: Direcao },
  abertasNoDestino: number,
): string | null {
  const lista = (rota.filtro_simbolos ?? []).map((s) => String(s).toUpperCase().trim()).filter(Boolean)
  if (lista.length) {
    const s = String(p.symbol).toUpperCase()
    const c = canonicoDe(s)
    if (!lista.includes(s) && !lista.includes(c)) return `símbolo ${c} fora do filtro`
  }
  if (rota.filtro_direcao !== 'ambas' && rota.filtro_direcao !== p.direcao) return `direcção ${p.direcao} fora do filtro`
  if (rota.max_abertas != null && abertasNoDestino >= rota.max_abertas) return `máximo de ${rota.max_abertas} posições abertas`
  return null
}

// ── SL/TP ────────────────────────────────────────────────────────────────────

/**
 * SL/TP como DISTÂNCIAS a partir do preço de referência do destino. Os preços de duas corretoras
 * não batem ao pip; copiar o nível dava um SL a 3 pips numa posição que na origem tinha 30.
 * Sem preço do destino, copia-se o nível (melhor do que nenhum stop).
 */
export function stopsNoDestino(p: {
  direcao: Direcao
  entradaOrigem: number | null
  slOrigem: number | null
  tpOrigem: number | null
  precoDestino: number | null
  digits?: number | null
  copiarSl: boolean
  copiarTp: boolean
}): { sl: number | null; tp: number | null } {
  const r = (x: number) => (p.digits != null ? Number(x.toFixed(p.digits)) : Number(x.toFixed(8)))
  const sinal = p.direcao === 'buy' ? 1 : -1
  const porDistancia = p.entradaOrigem != null && p.entradaOrigem > 0 && p.precoDestino != null && p.precoDestino > 0
  let sl: number | null = null
  let tp: number | null = null
  if (p.copiarSl && p.slOrigem != null && p.slOrigem > 0) {
    if (!porDistancia) sl = r(p.slOrigem)
    else {
      const d = (p.entradaOrigem! - p.slOrigem) * sinal
      if (d > 0) sl = r(p.precoDestino! - d * sinal)
    }
  }
  if (p.copiarTp && p.tpOrigem != null && p.tpOrigem > 0) {
    if (!porDistancia) tp = r(p.tpOrigem)
    else {
      const d = (p.tpOrigem - p.entradaOrigem!) * sinal
      if (d > 0) tp = r(p.precoDestino! + d * sinal)
    }
  }
  return { sl: sl != null && sl > 0 ? sl : null, tp: tp != null && tp > 0 ? tp : null }
}

// ── parciais ─────────────────────────────────────────────────────────────────

/** Diferenças abaixo disto (fracção do lote inicial do destino) não se enviam. */
export const LIMIAR_PARCIAL = 0.05

export type PlanoParcial =
  | { tipo: 'nada'; fechadoPct: number; motivo: string }
  | { tipo: 'parcial'; volume: number; fechadoPct: number }
  | { tipo: 'total'; fechadoPct: number }

/**
 * Parcial PROPORCIONAL. A fracção fechada acumula-se a multiplicar (50% e depois 50% = 75%). O
 * alvo é «o destino fica com (1 − fechado) do lote inicial»; fecha-se a diferença para o que está
 * REALMENTE aberto — um parcial saltado (abaixo de 5%) apanha-se no seguinte.
 */
export function planoParcial(p: {
  volumeDestinoAbertura: number
  fechadoPctAntes: number
  /** fecho ÷ volume que havia na origem antes do parcial */
  pct: number
  volumeAbertoDestino: number
  regra: RegraVolume
}): PlanoParcial {
  const lim = (x: number) => Math.min(1, Math.max(0, x))
  const fechadoPct = Math.min(1, 1 - (1 - lim(p.fechadoPctAntes)) * (1 - lim(p.pct)))
  if (fechadoPct >= 1 - 1e-9) return { tipo: 'total', fechadoPct: 1 }
  if (!(p.volumeDestinoAbertura > 0)) return { tipo: 'nada', fechadoPct, motivo: 'volume de abertura do destino desconhecido' }
  const min = p.regra.min > 0 ? p.regra.min : 0.01
  const alvoAberto = p.volumeDestinoAbertura * (1 - fechadoPct)
  const aFechar = p.volumeAbertoDestino - alvoAberto
  if (aFechar / p.volumeDestinoAbertura < LIMIAR_PARCIAL) return { tipo: 'nada', fechadoPct, motivo: 'diferença abaixo de 5%' }
  const volume = arredondarAoStep(aFechar, p.regra, 'perto')
  const fica = Number((p.volumeAbertoDestino - volume).toFixed(8))
  if (fica < min - 1e-9) return { tipo: 'total', fechadoPct }
  if (volume < min - 1e-9) return { tipo: 'nada', fechadoPct, motivo: `parcial ${volume} abaixo do lote mínimo` }
  return { tipo: 'parcial', volume, fechadoPct }
}

/** pct de um parcial a partir do evento: fechado ÷ (fechado + restante). */
export function pctDoEvento(payload: EventoCopia['payload']): number {
  const fechado = Number(payload.volume_fechado ?? 0)
  const restante = Number(payload.volume ?? 0)
  const total = fechado + restante
  return total > 0 ? Math.min(1, Math.max(0, fechado / total)) : 0
}

// ── idempotência ─────────────────────────────────────────────────────────────

/**
 * Chave única de um facto por rota. Abrir e fechar acontecem uma vez por posição; um parcial e
 * uma modificação precisam de um discriminador (volume restante / níveis) — o mesmo facto visto
 * duas vezes (reinício, dois leitores) dá a mesma chave e a base (unique) fica com um.
 */
export function chaveEvento(rotaId: string, posicaoId: string, tipo: TipoEventoCopia, discriminador: string | number = '0'): string {
  return `${rotaId}:${posicaoId}:${tipo}:${discriminador}`
}

/** clientId da ordem no destino: «MTMC_<rota8>_<pos8>» — cabe no limite da MetaApi e é único por cópia. */
export function clientIdDaCopia(rotaId: string, posicaoId: string): string {
  const curto = (x: string) => String(x).replace(/[^0-9a-zA-Z]/g, '').slice(-8)
  return `MTMC_${curto(rotaId.replace(/-/g, '').slice(0, 8))}_${curto(posicaoId)}`
}

/** Distância do SL em preço (para risco %), a partir dos factos da origem. */
export function distanciaDoSl(direcao: Direcao, entrada: number | null, sl: number | null): number | null {
  if (entrada == null || sl == null || !(entrada > 0) || !(sl > 0)) return null
  const d = direcao === 'buy' ? entrada - sl : sl - entrada
  return d > 0 ? d : null
}

export function precoDeReferencia(ctx: Pick<ContextoDestino, 'bid' | 'ask'>, direcao: Direcao): number | null {
  const v = direcao === 'buy' ? ctx.ask : ctx.bid
  return v != null && v > 0 ? v : null
}
