/** Cenários partilhados pelos testes de paridade e de sombra (premium). */
import type { Registo } from './harness'
import { CANONICAL_PREMIUM_ACCOUNT_ID as MESTRE } from '../../mtmcopy/provider-constants'

export { MESTRE }

export const DIRECTA = 'dir-00000001'

export interface Cenario {
  nome: string
  linhas: Registo[]
  posicoes: Record<string, Registo[]>
  /** preço por passo (aplicado a todas as posições do símbolo) + mexidas opcionais no mundo */
  passos: Array<{ preco: Record<string, number>; mundo?: (w: Mundo) => void }>
  mundo?: Partial<Mundo>
}
export interface Mundo {
  db: Record<string, Registo[]>
  contas: Record<string, Registo[]>
  log: Registo[]
  seq: number
  switches: Record<string, boolean>
  snapshotContas?: string[]
  snapshotFalta?: string[]
  precoVivo?: number | null
  falhaFechar?: boolean
  falhaModificar?: boolean
  ilegivel?: string[]
  live?: string[]
}

export const linha = (o: Registo): Registo => ({
  id: 'r1', account_id: MESTRE, symbol: 'XAUUSD', direction: 'buy', entry: 2000, sl: 1990,
  tp1: 2005, tp2: 2010, tp3: 2015, exit_pct_tp1: 70, exit_pct_tp2: 15, exit_pct_tp3: 15,
  original_lot: 0.1, small_account: false, exits_done: 0, trailing_started: false,
  early_trail_started: false, peak_profit_pips: 0, profit_locked: false, profile: null,
  telegram_message_id: null, chat_message_id: 'chat-1', source_key: 'premium',
  created_at: '2026-09-15T10:00:00.000Z', status: 'open', ...o,
})
export const posicao = (o: Registo): Registo => ({
  id: 'p1', symbol: 'XAUUSD.s', type: 'POSITION_TYPE_BUY', openPrice: 2000.3, volume: 0.1,
  stopLoss: 1990, comment: 'MTM Premium', time: '2026-09-15T10:00:05.000Z', ...o,
})

export const cenarios: Cenario[] = [
  {
    nome: 'compra: tranca de lucro → BE cedo → TP1 70% + BE/trailing/runner + espelho → ratchet → TP2 → TP3 fecha tudo',
    linhas: [linha({})],
    posicoes: { [MESTRE]: [posicao({})] },
    passos: [2000.5, 2001.6, 2004.5, 2005.2, 2006, 2009, 2010.2, 2008.1, 2015.3, 2016].map((p) => ({ preco: { XAUUSD: p } })),
  },
  {
    nome: 'venda com preenchimento longe da zona: zona larga (100p) arma trailing pré-Exit 1 pela entrada do sinal',
    linhas: [linha({ direction: 'sell', entry: 2000, sl: 2010, tp1: 1985, tp2: 1980, tp3: 1975 })],
    posicoes: { [MESTRE]: [posicao({ type: 'POSITION_TYPE_SELL', openPrice: 1995, stopLoss: 2010 })] },
    passos: [1996, 1995.5, 1994, 1988.5, 1984.9, 1983, 1979.9, 1981, 1974].map((p) => ({ preco: { XAUUSD: p } })),
  },
  {
    nome: 'conta pequena (0,01): Exit 1 não fecha — BE + TP final + espelho close_frac; depois só trailing',
    linhas: [linha({ small_account: true, original_lot: 0.01 })],
    posicoes: { [MESTRE]: [posicao({ volume: 0.01 })] },
    passos: [2003, 2005.5, 2007, 2010.5, 2012, 2009].map((p) => ({ preco: { XAUUSD: p } })),
  },
  {
    nome: 'perfil trailing EURUSD (mtmscanner arranca aos +10 pips; pip 0,0001)',
    linhas: [linha({ symbol: 'EURUSD', entry: 1.1, sl: 1.098, tp1: 1.104, tp2: null, tp3: null, profile: 'trailing', source_key: 'mtmscanner' })],
    posicoes: { [MESTRE]: [posicao({ symbol: 'EURUSD', openPrice: 1.1001, stopLoss: 1.098, comment: 'MTM Premium' })] },
    passos: [1.1005, 1.1012, 1.103, 1.1025, 1.105, 1.1049].map((p) => ({ preco: { EURUSD: p } })),
  },
  {
    nome: 'perfil trailing BTCUSD em PONTOS (pip 1), conta directa sem espelho',
    linhas: [linha({ account_id: DIRECTA, symbol: 'BTCUSD', entry: 60000, sl: 59500, tp1: 61000, tp2: null, tp3: null, profile: 'trailing', source_key: 'sensei' })],
    posicoes: { [DIRECTA]: [posicao({ symbol: 'BTCUSD', openPrice: 60010, stopLoss: 59500, volume: 0.05 })] },
    passos: [60100, 60250, 60800, 60500, 61500, 61400].map((p) => ({ preco: { BTCUSD: p } })),
  },
  {
    nome: 'fotografia sem a posição → confirma por RPC e gere; depois desaparece → encerra e anuncia',
    linhas: [linha({})],
    posicoes: { [MESTRE]: [posicao({})] },
    mundo: { snapshotContas: [MESTRE], snapshotFalta: ['p1'] },
    passos: [
      { preco: { XAUUSD: 2002 } },
      { preco: { XAUUSD: 2004.9 }, mundo: (w) => { w.snapshotFalta = [] } },
      { preco: { XAUUSD: 2003 }, mundo: (w) => { w.contas[MESTRE] = [] } },
    ],
  },
  {
    nome: 'trailing em tempo real (preço vivo ≠ posição) e fecho do TP1 recusado pela corretora',
    linhas: [linha({})],
    posicoes: { [MESTRE]: [posicao({})] },
    mundo: { switches: { premium_price_monitor: true, trailing_tempo_real: true } },
    passos: [
      { preco: { XAUUSD: 2001 }, mundo: (w) => { w.precoVivo = 2002.5 } },
      { preco: { XAUUSD: 2004.6 }, mundo: (w) => { w.precoVivo = null } },
      { preco: { XAUUSD: 2005.5 }, mundo: (w) => { w.falhaFechar = true } },
      { preco: { XAUUSD: 2006 }, mundo: (w) => { w.falhaFechar = false; w.precoVivo = 2006.4 } },
      { preco: { XAUUSD: 2008 }, mundo: (w) => { w.precoVivo = 2011 } },
    ],
  },
  {
    nome: 'conta ilegível (null) → nada concluído; conta directa e mestre na mesma passagem',
    linhas: [linha({}), linha({ id: 'r2', account_id: DIRECTA, direction: 'sell', entry: 2000, sl: 2008, tp1: 1995, tp2: 1990, tp3: 1985 })],
    posicoes: { [MESTRE]: [posicao({})], [DIRECTA]: [posicao({ id: 'p9', type: 'POSITION_TYPE_SELL', openPrice: 2000, stopLoss: 2008 })] },
    passos: [
      { preco: { XAUUSD: 1999 }, mundo: (w) => { w.ilegivel = [MESTRE] } },
      { preco: { XAUUSD: 1994.9 }, mundo: (w) => { w.ilegivel = [] } },
      { preco: { XAUUSD: 1989.9 } },
      { preco: { XAUUSD: 1984 } },
    ],
  },
]

export function novoMundo(c: Cenario): Mundo {
  return {
    db: {
      mtmcopy_premium_active: JSON.parse(JSON.stringify(c.linhas)),
      mtmcopy_connections: [{ metaapi_account_id: DIRECTA, is_active: true, copy_method: 'telegram_group', mt5_status: 'connected' }],
      chat_messages: [{ id: 'chat-1', channel_slug: 'premium-ideas' }],
    },
    contas: JSON.parse(JSON.stringify(c.posicoes)),
    log: [],
    seq: 0,
    switches: { premium_price_monitor: true, trailing_tempo_real: false },
    ...JSON.parse(JSON.stringify(c.mundo ?? {})),
  }
}

