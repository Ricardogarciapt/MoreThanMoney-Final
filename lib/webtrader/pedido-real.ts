import type { CapacidadesWT, DirecaoWT } from './corretoras/tipos'

/**
 * DO RASCUNHO PARA A ORDEM REAL — o único sítio que traduz um pedido do ticket partilhado
 * (components/funded/rascunho-ordem.tsx) para o corpo que /api/webtrader/{plataforma}/ordem aceita.
 *
 * Porquê existe: as contas REAIS passaram a ter os modos SIMPLE e PRO, e no SIMPLE os botões
 * grandes SELL/BUY enviam pelo rascunho (como no MT5 e no TradeLocker). O caminho de envio não
 * mudou — aviso «Conta REAL», aceite obrigatório na primeira ordem de cada conta e confirmação por
 * acção continuam todos —, mas a TRADUÇÃO passa a estar testada.
 *
 * A regra que justifica o ficheiro: o que a corretora não sabe fazer é RECUSADO em voz alta. Uma
 * OCO, um trailing ou TPs parciais chegados de um pré-preenchimento não podem cair em silêncio e
 * sair como uma ordem simples com dinheiro real — quem pediu duas pernas não quer uma.
 *
 * Puro (sem React, sem rede): testado em lib/webtrader/__tests__/pedido-real.check.ts.
 */

export interface PedidoRascunho {
  accao: 'abrir' | 'pendente'
  direcao: DirecaoWT
  volume: number
  sl: number | null
  tp: number | null
  tipo?: 'limit' | 'stop'
  preco?: number
  /** Gestão automática (trailing, break-even, TPs parciais) — só o motor simulado a executa. */
  gestao?: Record<string, unknown> | null
  /** Segunda perna OCO. */
  oco?: unknown
  /** GTD das pendentes. */
  expiraEm?: string | null
}

export interface CorpoOrdemReal {
  symbol: string
  direcao: DirecaoWT
  tipo: 'mercado' | 'limit' | 'stop'
  volume: number
  preco: number | null
  sl: number | null
  tp: number | null
}

export type TraducaoOrdemReal =
  | { ok: true; corpo: CorpoOrdemReal; descricao: string }
  | { ok: false; erro: string }

const SO_FUNDED = (o: string) => `${o} só existe nas contas MTM Funded — nesta conta envia a ordem sem isso.`

/** Tem gestão automática pedida? (um objecto vazio não conta: é o valor por omissão do rascunho) */
const temGestaoPedida = (g: PedidoRascunho['gestao']) =>
  g != null && typeof g === 'object' && Object.values(g).some((v) => v != null && v !== false)

export function ordemParaCorretora(p: PedidoRascunho, symbol: string, capacidades: CapacidadesWT): TraducaoOrdemReal {
  if (!symbol) return { ok: false, erro: 'Sem símbolo.' }
  if (p.direcao !== 'buy' && p.direcao !== 'sell') return { ok: false, erro: 'Direcção inválida.' }
  if (!Number.isFinite(p.volume) || p.volume <= 0) return { ok: false, erro: 'Volume inválido.' }
  for (const [nome, v] of [['SL', p.sl], ['TP', p.tp]] as const) {
    if (v != null && !Number.isFinite(v)) return { ok: false, erro: `${nome} inválido.` }
  }

  // O que a corretora não faz recusa-se aqui, não se deixa cair.
  if (p.oco != null && !capacidades.oco) return { ok: false, erro: SO_FUNDED('A ordem OCO (duas pernas)') }
  if (temGestaoPedida(p.gestao) && !(capacidades.trailing || capacidades.bracketTps)) {
    return { ok: false, erro: SO_FUNDED('A gestão automática (trailing, break-even, TPs parciais)') }
  }
  if (p.expiraEm && !capacidades.modificarPendente) return { ok: false, erro: SO_FUNDED('A validade (GTD) da pendente') }

  const tipo: CorpoOrdemReal['tipo'] = p.accao === 'abrir' ? 'mercado' : (p.tipo ?? 'limit')
  if (!capacidades[tipo]) return { ok: false, erro: `Esta conta não aceita ordens ${tipo === 'mercado' ? 'a mercado' : tipo}.` }
  let preco: number | null = null
  if (tipo !== 'mercado') {
    if (!Number.isFinite(p.preco as number)) return { ok: false, erro: 'Preço da pendente inválido.' }
    preco = p.preco as number
  }
  if ((p.sl != null || p.tp != null) && !capacidades.slTp) return { ok: false, erro: 'Esta conta não aceita SL/TP na ordem.' }

  const corpo: CorpoOrdemReal = { symbol, direcao: p.direcao, tipo, volume: p.volume, preco, sl: p.sl, tp: p.tp }
  return { ok: true, corpo, descricao: descricaoDaOrdemReal(corpo) }
}

/** O texto que a confirmação e o aviso «feito» mostram — o mesmo do ticket da corretora. */
export function descricaoDaOrdemReal(c: CorpoOrdemReal): string {
  const lado = c.direcao === 'buy' ? 'Comprar' : 'Vender'
  const onde = c.tipo === 'mercado' ? ' a mercado' : ` ${c.tipo} @ ${c.preco}`
  return `${lado} ${c.volume} ${c.symbol}${onde}`
}
