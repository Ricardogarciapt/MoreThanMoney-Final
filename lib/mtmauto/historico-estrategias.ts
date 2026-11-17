/**
 * O HISTÓRICO DO SEPARADOR MTM AUTO — uma trade por posição, e a estratégia escrita ao lado.
 *
 * Duas coisas estavam erradas no histórico da app-mobile (16/11/2026, pedido do Ricardo):
 *
 *  1. As contas de corretora ligadas no site (MTM Copy / Tap to Trade) entravam um FECHO de cada
 *     vez. O motor de cópia sai aos parciais (TP1, TP2, resto), e cada saída era uma «trade»:
 *     uma posição dava três linhas e três ganhos, sem pips. É o mesmo defeito que
 *     `lib/mtmfunded/historico-parciais.ts` corrigiu nas contas MTM Funded, agora nas da corretora.
 *
 *  2. Ninguém dizia DE QUE ESTRATÉGIA era a trade. Desde 23/09 o MTM Auto já não executa por sinal
 *     (`mtmauto_executions` parou): quem abre nas contas dos clientes é o motor de cópia das mestres
 *     (`copia_rotas` → `copia_posicoes`). Essas posições chegavam ao histórico como «MTM Copy» ou
 *     com o comentário da ordem, e o cliente que segue o Premium II não via o Premium II em lado
 *     nenhum. A posição de destino de cada cópia está gravada em `copia_posicoes.destino_posicao_id`,
 *     e a rota diz a estratégia (`estrategia_slug`, ou `origem_ref = 'prov:<id>'`).
 *
 * As funções daqui são PURAS (o teste chama-as com linhas à mão); a leitura da base fica na rota.
 */

export interface DealCorretora {
  id?: string
  positionId?: string
  symbol?: string
  type?: string
  entryType?: string
  volume?: number
  price?: number
  profit?: number
  commission?: number
  swap?: number
  time?: string | Date
  comment?: string
}

export interface TradeCorretora {
  positionId: string
  symbol: string
  direcao: 'buy' | 'sell'
  /** O fecho mais recente da posição. */
  quando: string
  /** Resultado líquido (lucro + comissão + swap) de TODOS os negócios da posição. */
  resultado: number
  /** Pips pesados pelo volume de cada saída; null sem preço de entrada conhecido. */
  pips: number | null
  /** A posição fechou toda? Um parcial com o resto aberto entra no dinheiro mas não na taxa. */
  terminada: boolean
  comentario: string | null
}

const n = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0)
const iso = (v: unknown): string => {
  const t = v instanceof Date ? v.getTime() : Date.parse(String(v ?? ''))
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date(0).toISOString()
}

/**
 * Os negócios do extrato agrupados em TRADES — uma por posição.
 *
 * Entra: IN (abertura) e OUT/INOUT (fechos). Uma posição sem nenhum fecho na janela não aparece
 * (ainda não deu resultado nenhum). Uma posição cuja abertura ficou FORA da janela conta como
 * terminada quando tem fecho — não há como saber o volume inicial, e escondê-la apagava o fecho.
 */
export function tradesDosNegocios(deals: DealCorretora[], pipDe: (symbol: string) => number): TradeCorretora[] {
  const grupos = new Map<string, DealCorretora[]>()
  for (const d of deals) {
    if (d.type !== 'DEAL_TYPE_BUY' && d.type !== 'DEAL_TYPE_SELL') continue
    const k = String(d.positionId ?? d.id ?? '')
    if (!k) continue
    grupos.set(k, [...(grupos.get(k) ?? []), d])
  }
  const out: TradeCorretora[] = []
  for (const [positionId, ds] of grupos) {
    const entradas = ds.filter((d) => d.entryType === 'DEAL_ENTRY_IN')
    const saidas = ds.filter((d) => d.entryType === 'DEAL_ENTRY_OUT' || d.entryType === 'DEAL_ENTRY_INOUT')
    if (!saidas.length) continue
    // A direcção da POSIÇÃO: a da abertura; sem abertura à vista, o inverso do fecho.
    const direcao: 'buy' | 'sell' = entradas.length
      ? (entradas[0]!.type === 'DEAL_TYPE_BUY' ? 'buy' : 'sell')
      : (saidas[0]!.type === 'DEAL_TYPE_SELL' ? 'buy' : 'sell')
    const volEntrada = entradas.reduce((a, d) => a + n(d.volume), 0)
    const precoEntrada = volEntrada > 0
      ? entradas.reduce((a, d) => a + n(d.price) * n(d.volume), 0) / volEntrada
      : null
    const volSaida = saidas.reduce((a, d) => a + n(d.volume), 0)
    const symbol = String(saidas[0]!.symbol ?? entradas[0]?.symbol ?? '')
    let pips: number | null = null
    if (precoEntrada && precoEntrada > 0 && volSaida > 0) {
      const pip = pipDe(symbol) || 1
      const sinal = direcao === 'buy' ? 1 : -1
      const soma = saidas.reduce((a, d) => a + ((n(d.price) - precoEntrada) * sinal / pip) * n(d.volume), 0)
      pips = Math.round((soma / volSaida) * 10) / 10
    }
    const resultado = Math.round(ds.reduce((a, d) => a + n(d.profit) + n(d.commission) + n(d.swap), 0) * 100) / 100
    const quando = saidas.map((d) => iso(d.time)).sort().pop()!
    const comentario = String(entradas[0]?.comment ?? saidas[0]?.comment ?? '').trim() || null
    out.push({
      positionId, symbol, direcao, quando, resultado, pips,
      terminada: volEntrada > 0 ? volSaida >= volEntrada - 1e-6 : true,
      comentario,
    })
  }
  return out.sort((a, b) => b.quando.localeCompare(a.quando))
}

/** Uma cópia do motor: a posição no destino e a rota que a abriu. */
export interface CopiaConhecida {
  destinoPosicaoId: string
  destinoRef: string
  estrategia: string | null
  tipoRota: string | null
}

/**
 * A estratégia de uma posição de corretora — se foi o motor de cópia que a abriu.
 * Casa pela posição E pela conta de destino (`site:<ligação>` ou `auto:<conta MTM Auto>`): dois
 * números de posição iguais em corretoras diferentes não são a mesma trade.
 */
export function estrategiaDaPosicao(
  copias: CopiaConhecida[],
  destinoRef: string,
  positionId: string,
): { estrategia: string | null; t2t: boolean } | null {
  const c = copias.find((x) => x.destinoPosicaoId === positionId && x.destinoRef === destinoRef)
  if (!c) return null
  return { estrategia: c.estrategia, t2t: c.tipoRota === 't2t' }
}

/** O resumo por estratégia — o «histórico das estratégias» do separador. Só pips e contagens. */
export interface ResumoEstrategia {
  estrategia: string
  trades: number
  ganhas: number
  pips: number
  winrate: number | null
}

export function resumoPorEstrategia(
  linhas: Array<{ estrategia?: string | null; pips: number | null; resultado: number | null; contaParaTaxa?: boolean }>,
): ResumoEstrategia[] {
  const m = new Map<string, ResumoEstrategia>()
  for (const l of linhas) {
    if (!l.estrategia || l.resultado == null) continue
    const r = m.get(l.estrategia) ?? { estrategia: l.estrategia, trades: 0, ganhas: 0, pips: 0, winrate: null }
    if (l.pips != null) r.pips = Math.round((r.pips + l.pips) * 10) / 10
    if (l.contaParaTaxa !== false) {
      r.trades += 1
      if (l.resultado > 0) r.ganhas += 1
    }
    m.set(l.estrategia, r)
  }
  return [...m.values()]
    .map((r) => ({ ...r, winrate: r.trades ? Math.round((r.ganhas / r.trades) * 100) : null }))
    .sort((a, b) => b.trades - a.trades)
}
