import { clampVolume, type MetaApiSymbolSpecification } from '@/lib/mtmcopy/metaapi'
import { rankedBrokerSymbols } from '@/lib/mtmcopy/symbol-resolver'

/**
 * AS CONTAS DA CÓPIA — quanto abrir no destino, onde pôr o SL/TP e quanto fechar num parcial.
 *
 * Tudo puro e testado (lib/mtmfunded/__tests__/copia.check.ts). O serviço do VPS só lê, chama isto
 * e escreve. Um arredondamento errado aqui é dinheiro real na conta do aluno — por isso nada disto
 * vive dentro do serviço, onde só se testa com uma corretora ligada.
 */

export type ModoLote = 'proporcional_saldo' | 'multiplicador' | 'fixo' | 'risco_pct'
export const MODOS_LOTE: ModoLote[] = ['proporcional_saldo', 'multiplicador', 'fixo', 'risco_pct']

/** Diferenças de parcial abaixo disto (em fracção do lote inicial no destino) não se enviam. */
export const LIMIAR_PARCIAL = 0.05

export interface EntradaTamanho {
  modo: ModoLote
  /** proporcional: multiplicador extra (1 = igual) · multiplicador: × · fixo: lotes · risco_pct: % */
  valor: number | null
  volumeOrigem: number
  /** saldo da conta simulada (a base da proporção) */
  saldoOrigem: number
  /** equity da conta de destino */
  equityDestino: number | null
  loteMax: number | null
  spec: MetaApiSymbolSpecification | null
  /** risco_pct: distância do SL em preço e valor do tick (moeda da conta, 1 lote) */
  distanciaSl?: number | null
  tickSize?: number | null
  tickValue?: number | null
}

export type Tamanho = { ok: true; volume: number; bruto: number } | { ok: false; motivo: string }

function arredondarAoStep(v: number, spec: MetaApiSymbolSpecification | null, para: 'baixo' | 'perto'): number {
  const step = spec?.volumeStep && spec.volumeStep > 0 ? spec.volumeStep : 0.01
  const n = para === 'baixo' ? Math.floor(v / step + 1e-9) : Math.round(v / step)
  const casas = Math.min(8, (String(step).split('.')[1] || '').length)
  return Number((n * step).toFixed(casas))
}

/**
 * O lote no destino.
 *
 * Proporcional ao saldo (o de omissão): quem negoceia 1 lote numa simulada de 100 000 com uma conta
 * de 5 000 abre 0,05 — o mesmo risco em percentagem. Nunca se sobe um lote minúsculo até ao mínimo
 * da corretora quando isso passa do DOBRO do que devia: numa conta pequena a cópia recusa-se, em
 * vez de abrir dez vezes o risco pedido.
 */
export function volumeDestino(e: EntradaTamanho): Tamanho {
  const valor = e.valor != null && Number.isFinite(e.valor) ? Number(e.valor) : null
  let bruto: number
  switch (e.modo) {
    case 'proporcional_saldo': {
      if (!(e.saldoOrigem > 0)) return { ok: false, motivo: 'saldo da conta simulada desconhecido' }
      if (!(e.equityDestino != null && e.equityDestino > 0)) return { ok: false, motivo: 'equity do destino desconhecida' }
      bruto = (e.volumeOrigem * e.equityDestino) / e.saldoOrigem * (valor && valor > 0 ? valor : 1)
      break
    }
    case 'multiplicador':
      if (!(valor && valor > 0)) return { ok: false, motivo: 'multiplicador inválido' }
      bruto = e.volumeOrigem * valor
      break
    case 'fixo':
      if (!(valor && valor > 0)) return { ok: false, motivo: 'lote fixo inválido' }
      bruto = valor
      break
    case 'risco_pct': {
      if (!(valor && valor > 0 && valor <= 10)) return { ok: false, motivo: 'risco % inválido (0–10)' }
      if (!(e.distanciaSl && e.distanciaSl > 0)) return { ok: false, motivo: 'risco % precisa de SL na posição' }
      if (!(e.equityDestino && e.equityDestino > 0)) return { ok: false, motivo: 'equity do destino desconhecida' }
      if (!(e.tickSize && e.tickSize > 0 && e.tickValue && e.tickValue > 0)) return { ok: false, motivo: 'sem valor do tick no destino' }
      const perdaPorLote = (e.distanciaSl / e.tickSize) * e.tickValue
      bruto = (e.equityDestino * valor / 100) / perdaPorLote
      break
    }
    default:
      return { ok: false, motivo: 'modo de lote desconhecido' }
  }
  if (!Number.isFinite(bruto) || bruto <= 0) return { ok: false, motivo: 'lote calculado inválido' }

  const min = e.spec?.minVolume && e.spec.minVolume > 0 ? e.spec.minVolume : 0.01
  if (bruto < min / 2) {
    return { ok: false, motivo: `lote ${bruto.toFixed(4)} abaixo de metade do mínimo ${min} — conta pequena para esta posição` }
  }
  let v = clampVolume(bruto, e.spec)
  if (e.loteMax != null && e.loteMax > 0 && v > e.loteMax) {
    v = arredondarAoStep(e.loteMax, e.spec, 'baixo')
    if (v < min) return { ok: false, motivo: `lote máximo ${e.loteMax} abaixo do mínimo da corretora ${min}` }
  }
  return { ok: true, volume: v, bruto }
}

/**
 * SL/TP no destino como DISTÂNCIAS a partir do preço a que o destino encheu — não os níveis da
 * simulada. O preço da simulada e o da corretora do aluno não batem ao pip; copiar o nível dava um
 * SL a 3 pips numa posição que na simulada tinha 30.
 */
export function stopsPorDistancia(p: {
  direcao: 'buy' | 'sell'
  entradaOrigem: number
  slOrigem: number | null
  tpOrigem: number | null
  precoDestino: number
  digits?: number | null
  copiarSl: boolean
  copiarTp: boolean
}): { sl: number | null; tp: number | null } {
  const r = (x: number) => (p.digits != null ? Number(x.toFixed(p.digits)) : x)
  const sinal = p.direcao === 'buy' ? 1 : -1
  let sl: number | null = null
  let tp: number | null = null
  if (p.copiarSl && p.slOrigem != null && p.slOrigem > 0) {
    const d = (p.entradaOrigem - p.slOrigem) * sinal
    if (d > 0) sl = r(p.precoDestino - d * sinal)
  }
  if (p.copiarTp && p.tpOrigem != null && p.tpOrigem > 0) {
    const d = (p.tpOrigem - p.entradaOrigem) * sinal
    if (d > 0) tp = r(p.precoDestino + d * sinal)
  }
  return { sl: sl != null && sl > 0 ? sl : null, tp: tp != null && tp > 0 ? tp : null }
}

/** Fracção de um parcial: o que fechou ÷ o que havia antes (o mesmo cálculo do trigger 068). */
export function pctParcial(volumeFechado: number, volumeRestante: number): number {
  const total = volumeFechado + volumeRestante
  return total > 0 ? Math.min(1, Math.max(0, volumeFechado / total)) : 0
}

export type PlanoParcial =
  | { tipo: 'nada'; fechadoPct: number; motivo: string }
  | { tipo: 'parcial'; volume: number; fechadoPct: number }
  | { tipo: 'total'; fechadoPct: number }

/**
 * Quanto fechar no destino. `pct` é relativo ao que estava aberto na simulada ANTES deste parcial,
 * por isso a fracção fechada acumula-se a multiplicar: 50% e depois 50% = 75% fechado.
 *
 * O alvo é sempre «o destino deve ficar com (1 − fechado) do lote inicial»; o que se fecha é a
 * diferença para o que está REALMENTE aberto. Assim um parcial saltado (abaixo dos 5%) não se
 * perde: o seguinte apanha-o.
 */
export function planoParcial(p: {
  destVolumeOrigem: number
  fechadoPctAntes: number
  pct: number
  volumeAbertoDestino: number
  spec: MetaApiSymbolSpecification | null
}): PlanoParcial {
  const restanteAntes = 1 - Math.min(1, Math.max(0, p.fechadoPctAntes))
  const fechadoPct = Math.min(1, 1 - restanteAntes * (1 - Math.min(1, Math.max(0, p.pct))))
  const min = p.spec?.minVolume && p.spec.minVolume > 0 ? p.spec.minVolume : 0.01
  if (fechadoPct >= 1 - 1e-9) return { tipo: 'total', fechadoPct: 1 }

  const alvoAberto = p.destVolumeOrigem * (1 - fechadoPct)
  const aFechar = p.volumeAbertoDestino - alvoAberto
  if (aFechar / p.destVolumeOrigem < LIMIAR_PARCIAL) {
    return { tipo: 'nada', fechadoPct, motivo: 'diferença abaixo de 5%' }
  }
  const volume = arredondarAoStep(aFechar, p.spec, 'perto')
  const fica = Number((p.volumeAbertoDestino - volume).toFixed(8))
  if (fica < min - 1e-9) return { tipo: 'total', fechadoPct }
  if (volume < min - 1e-9) return { tipo: 'nada', fechadoPct, motivo: `parcial ${volume} abaixo do lote mínimo` }
  return { tipo: 'parcial', volume, fechadoPct }
}

/** Símbolo da simulada → símbolo da corretora do destino (sem ligação: com a lista de símbolos). */
export function simboloDestino(symbolOrigem: string, simbolosCorretora: string[]): string | null {
  return rankedBrokerSymbols(symbolOrigem, simbolosCorretora)[0] ?? null
}

/** O copiador aceita este símbolo? Lista vazia = todos. */
export function simboloPermitido(symbol: string, lista: string[] | null | undefined): boolean {
  if (!lista?.length) return true
  const s = symbol.toUpperCase()
  return lista.some((x) => String(x).toUpperCase().trim() === s)
}

/** clientId da ordem: «MTMF_<copier8>_<pos8>» — cabe no limite da MetaApi e é único por cópia. */
export function clientIdDaCopia(copierId: string, positionId: string): string {
  const curto = (x: string) => x.replace(/-/g, '').slice(0, 8)
  return `MTMF_${curto(copierId)}_${curto(positionId)}`
}
