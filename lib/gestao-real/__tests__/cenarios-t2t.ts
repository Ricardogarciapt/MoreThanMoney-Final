/** Cenários partilhados pelos testes de paridade e de sombra (t2t). */
import type { Registo } from './harness'

export const ACC = 'acc-t2t-00000001'
export const ACC2 = 'acc-t2t-00000002'
export const recente = () => new Date(Date.now() - 3600_000).toISOString()
export const velho = () => new Date(Date.now() - 30 * 3600_000).toISOString()

export interface Mundo {
  db: Record<string, Registo[]>
  contas: Record<string, Registo[]>
  pendentes: Record<string, Registo[]>
  precos: Record<string, number>
  log: Registo[]
  seq: number
  switches: Record<string, boolean>
  falhaModificar?: boolean
  falhaFechar?: boolean
  ilegivel?: string[]
  live?: string[]
}
export interface Cenario {
  nome: string
  linhas: () => Registo[]
  posicoes: Record<string, Registo[]>
  pendentes?: Record<string, Registo[]>
  passos: Array<{ precos: Record<string, number>; mundo?: (w: Mundo) => void }>
}

export const linha = (o: Registo): Registo => ({
  id: 'l1', connection_id: 'c1', chat_message_id: 'chat-1', channel_key: 'premium-ideas', symbol: 'XAUUSD',
  direction: 'buy', entry: 2000, sl: 1990, tp: 2005, lot: 0.1,
  raw_message: 'GOLD BUY 2000\nSL 1990\nTP1 2005\nTP2 2010\nTP3 2015', broker_position_id: 'b1',
  created_at: recente(), status: 'open', ...o,
})
export const pos = (o: Registo): Registo => ({ id: 'b1', symbol: 'XAUUSD.s', type: 'POSITION_TYPE_BUY', openPrice: 2000.2, volume: 0.1, stopLoss: 1990, takeProfit: 2015, ...o })

export const cenarios: Cenario[] = [
  {
    nome: 'Premium multi-TP: entry hit → BE cedo → Exit 1 50% + BE + trailing → ratchet → Exit 2 30% → Exit 3 fecha',
    linhas: () => [linha({})],
    posicoes: { [ACC]: [pos({})] },
    passos: [2001, 2004.5, 2005.1, 2007, 2010.4, 2012, 2014, 2015.2].map((p) => ({ precos: { XAUUSD: p } })),
  },
  {
    nome: 'fonte sem trailing (canal desconhecido), alvo único EURUSD: BE cedo recusado, depois aceite, fecha no alvo',
    linhas: () => [linha({ channel_key: 'outro-canal', symbol: 'EURUSD', entry: 1.1, sl: 1.098, tp: 1.104, raw_message: null, lot: 0.05 })],
    posicoes: { [ACC]: [pos({ symbol: 'EURUSD', openPrice: 1.1, volume: 0.05, stopLoss: 1.098, takeProfit: 1.104 })] },
    passos: [
      { precos: { EURUSD: 1.1009 }, mundo: (w) => { w.falhaModificar = true } },
      { precos: { EURUSD: 1.101 }, mundo: (w) => { w.falhaModificar = false } },
      { precos: { EURUSD: 1.1035 } },
      { precos: { EURUSD: 1.1041 } },
    ],
  },
  {
    nome: 'BTCUSD Aurum em PONTOS, venda: BE cedo e trailing a 1× risco; lote 0,01 não parte → fecha tudo no Exit 1',
    linhas: () => [linha({ channel_key: 'aurum-flow', symbol: 'BTCUSD', direction: 'sell', entry: 60000, sl: 60400, tp: 59000, raw_message: 'Aurum Flow BTCUSD SELL 60000\nSL 60400\nTP1 59500\nTP2 59000', lot: 0.01 })],
    posicoes: { [ACC]: [pos({ symbol: 'BTCUSD', type: 'POSITION_TYPE_SELL', openPrice: 60000, volume: 0.01, stopLoss: 60400, takeProfit: 59000 })] },
    passos: [59900, 59830, 59600, 59490, 59300].map((p) => ({ precos: { BTCUSD: p } })),
  },
  {
    nome: 'pendentes: stop varrido antes de encher (descarta + cancela), ordem velha (24 h), posição anunciada que desaparece',
    linhas: () => [
      linha({ id: 'l2', broker_position_id: 'o2', created_at: recente() }),
      linha({ id: 'l3', broker_position_id: 'o3', created_at: velho(), symbol: 'EURUSD', entry: 1.1, sl: 1.09, tp: 1.12, raw_message: null }),
      linha({ id: 'l4', connection_id: 'c2', broker_position_id: 'b4' }),
    ],
    posicoes: { [ACC2]: [pos({ id: 'b4' })] },
    pendentes: { [ACC]: [{ id: 'o2', symbol: 'XAUUSD.s' }, { id: 'o3', symbol: 'EURUSD' }] },
    passos: [
      { precos: { XAUUSD: 1995, EURUSD: 1.1 } },
      { precos: { XAUUSD: 1989, EURUSD: 1.1 } },
      { precos: { XAUUSD: 1999 }, mundo: (w) => { w.contas[ACC2] = [] } },
    ],
  },
  {
    nome: 'conta ilegível → nada concluído; volta a ler e gere',
    linhas: () => [linha({})],
    posicoes: { [ACC]: [pos({})] },
    passos: [
      { precos: { XAUUSD: 2006 }, mundo: (w) => { w.ilegivel = [ACC] } },
      { precos: { XAUUSD: 2006 }, mundo: (w) => { w.ilegivel = [] } },
      { precos: { XAUUSD: 2011 } },
    ],
  },
]

export function novoMundo(c: Cenario): Mundo {
  return {
    db: {
      mtmcopy_signal_log: c.linhas(),
      mtmcopy_connections: [{ id: 'c1', metaapi_account_id: ACC, mt5_status: 'connected' }, { id: 'c2', metaapi_account_id: ACC2, mt5_status: 'connected' }],
      site_settings: [],
    },
    contas: JSON.parse(JSON.stringify(c.posicoes)),
    pendentes: JSON.parse(JSON.stringify(c.pendentes ?? {})),
    precos: {},
    log: [],
    seq: 0,
    switches: { t2t_price_monitor: true },
  }
}

