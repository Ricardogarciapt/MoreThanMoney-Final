import type { AjusteSaldo, PernaAuditoria } from './auditoria'

/**
 * AUDITORIA DE CONTAS REAIS LIGADAS — converte o histórico cru da corretora em pernas de auditoria
 * (puro, com teste em auditoria-real.check.ts). A página e as métricas são as mesmas das contas
 * MTM Funded; muda só de onde vêm as operações.
 *
 *  · MT5 (MetaApi): os «deals». Cada posição tem uma ou mais entradas (IN) e uma ou mais saídas (OUT);
 *    cada saída é uma perna (parciais juntam-se na mãe, como no motor simulado). Os depósitos e
 *    levantamentos (DEAL_TYPE_BALANCE) são ajustes de capital: não contam como ganho nem drawdown.
 *  · TradeLocker: só há histórico de ORDENS, sem lucro por ordem. Dá direcção, preços e pips, mas
 *    não dólares — a página mostra pips e taxa de acerto por pips, e esconde o que é em dinheiro.
 *
 * Sem risco inicial registado não há R (a corretora não guarda o SL de entrada no histórico), e isso
 * diz-se na página em vez de se inventar.
 */

export interface DealMt5 {
  id?: string | number | null
  positionId?: string | number | null
  type?: string | null
  entryType?: string | null
  symbol?: string | null
  volume?: number | null
  price?: number | null
  profit?: number | null
  commission?: number | null
  swap?: number | null
  time?: string | null
}

export interface HistoricoReal {
  pernas: PernaAuditoria[]
  ajustes: AjusteSaldo[]
  /** Soma de tudo o que mexeu no saldo dentro da janela (trades + ajustes). Para achar o saldo de partida. */
  variacaoSaldo: number
  /** false = a corretora não dá o lucro por operação (TradeLocker): só pips. */
  comValor: boolean
}

const n = (v: unknown) => { const x = Number(v); return v == null || v === '' || !Number.isFinite(x) ? 0 : x }
const iso = (v: unknown) => { const t = Date.parse(String(v ?? '')); return Number.isFinite(t) ? new Date(t).toISOString() : null }

/** Deals MetaApi → pernas (uma por saída), ajustes de saldo e a variação total do saldo. */
export function historicoDosDealsMt5(deals: DealMt5[]): HistoricoReal {
  const ordenados = [...deals].filter((d) => iso(d.time)).sort((a, b) => String(iso(a.time)).localeCompare(String(iso(b.time))))
  const ajustes: AjusteSaldo[] = []
  let variacao = 0
  type Pos = { dir: 'buy' | 'sell' | null; volIn: number; somaIn: number; abertaEm: string | null; custoIn: number; saidas: DealMt5[]; symbol: string }
  const pos = new Map<string, Pos>()

  for (const d of ordenados) {
    const tipo = String(d.type ?? '').toUpperCase()
    if (tipo === 'DEAL_TYPE_BALANCE') {
      const delta = n(d.profit)
      variacao += delta
      if (delta !== 0) ajustes.push({ em: iso(d.time)!, delta })
      continue
    }
    if (!/^DEAL_TYPE_(BUY|SELL)$/.test(tipo)) continue
    variacao += n(d.profit) + n(d.commission) + n(d.swap)
    const pid = String(d.positionId ?? d.id ?? '')
    if (!pid) continue
    const p = pos.get(pid) ?? { dir: null, volIn: 0, somaIn: 0, abertaEm: null, custoIn: 0, saidas: [], symbol: String(d.symbol ?? '') }
    const entrada = String(d.entryType ?? '').toUpperCase()
    if (entrada === 'DEAL_ENTRY_IN') {
      p.dir = tipo.endsWith('SELL') ? 'sell' : 'buy'
      p.volIn += n(d.volume); p.somaIn += n(d.volume) * n(d.price)
      p.abertaEm ??= iso(d.time)
      p.custoIn += n(d.commission) + n(d.swap) + n(d.profit)
    } else if (entrada === 'DEAL_ENTRY_OUT' || entrada === 'DEAL_ENTRY_OUT_BY' || entrada === 'DEAL_ENTRY_INOUT') {
      // Saída de uma posição aberta antes da janela: a direcção é a contrária da do deal de saída.
      p.dir ??= tipo.endsWith('SELL') ? 'buy' : 'sell'
      p.saidas.push(d)
    }
    pos.set(pid, p)
  }

  const pernas: PernaAuditoria[] = []
  for (const [pid, p] of pos) {
    if (!p.saidas.length || !p.dir) continue // ainda aberta: entra quando fechar
    const entrada = p.volIn > 0 ? p.somaIn / p.volIn : null
    p.saidas.forEach((s, i) => {
      pernas.push({
        id: i === 0 ? pid : `${pid}:${i}`,
        mae_id: i === 0 ? null : pid,
        symbol: p.symbol || String(s.symbol ?? ''),
        direcao: p.dir as 'buy' | 'sell',
        volume: n(s.volume),
        preco_entrada: entrada,
        preco_fecho: s.price ?? null,
        // A comissão e o swap da entrada vão para a perna-mãe (no motor simulado é igual).
        pnl: n(s.profit) + (i === 0 ? p.custoIn : 0),
        comissao: -n(s.commission),
        swap: n(s.swap),
        aberta_em: p.abertaEm,
        fechada_em: iso(s.time)!,
        origem: 'conta real',
        risco_inicial: null,
      })
    })
  }
  return { pernas, ajustes, variacaoSaldo: variacao, comValor: true }
}

export interface OrdemTL {
  id: string
  tradableInstrumentId: number
  side: 'buy' | 'sell'
  qty: number
  status: string
  price: number | null
  stopPrice: number | null
  avgPrice: number | null
  filledQty: number | null
  positionId: string | null
  createdDate: number | null
  lastModified: number | null
}

/** Ordens TradeLocker executadas → pernas (sem lucro: só preços, para pips e taxa de acerto). */
export function historicoDasOrdensTL(ordens: OrdemTL[], nomes: Map<number, string> | Record<number, string>): HistoricoReal {
  const nome = (id: number) => (nomes instanceof Map ? nomes.get(id) : nomes[id]) ?? String(id)
  const quando = (o: OrdemTL) => n(o.lastModified ?? o.createdDate)
  const porPos = new Map<string, OrdemTL[]>()
  for (const o of ordens) {
    if (o.status !== 'filled' || !o.positionId) continue
    const g = porPos.get(o.positionId)
    if (g) g.push(o); else porPos.set(o.positionId, [o])
  }
  const pernas: PernaAuditoria[] = []
  for (const [pid, g] of porPos) {
    g.sort((a, b) => quando(a) - quando(b))
    const dir = g[0].side
    let volIn = 0, somaIn = 0, i = 0
    for (const o of g) {
      const q = n(o.filledQty ?? o.qty), preco = o.avgPrice ?? o.price ?? o.stopPrice
      if (o.side === dir) { volIn += q; somaIn += q * n(preco); continue }
      pernas.push({
        id: i === 0 ? pid : `${pid}:${i}`,
        mae_id: i === 0 ? null : pid,
        symbol: nome(g[0].tradableInstrumentId),
        direcao: dir,
        volume: q,
        preco_entrada: volIn > 0 ? somaIn / volIn : null,
        preco_fecho: preco,
        pnl: null,
        aberta_em: iso(quando(g[0])),
        fechada_em: iso(quando(o)) ?? new Date(0).toISOString(),
        origem: 'conta real',
        risco_inicial: null,
      })
      i++
    }
  }
  return { pernas, ajustes: [], variacaoSaldo: 0, comValor: false }
}
