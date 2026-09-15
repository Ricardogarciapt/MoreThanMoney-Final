/**
 * PARIDADE T2T — o monitor de preço T2T ORIGINAL (git 8a81044) e o actual (que chama
 * lib/gestao-real/t2t.ts) fazem as mesmas chamadas: entry hit, parciais 50/30/20, BE no Exit 1,
 * BE cedo, ratchet do trailing, fecho no último alvo, pendentes descartadas, posições que
 * desaparecem, anúncios (chat + push) e o estado em site_settings.
 *
 *   npx tsx lib/gestao-real/__tests__/paridade-t2t.check.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { RAIZ, empacotar, fonteDoGit, normalizar, primeiraDiferenca, type Registo } from './harness'
import { FALSOS_SITE } from './falsos-site'

type Monitor = { runT2TPriceMonitor: () => Promise<{ managed: number; actions: string[] }> }
const FICHEIRO = 'lib/mtmcopy/t2t-price-monitor.ts'
const pasta = path.join(RAIZ, 'lib/mtmcopy')

const ACC = 'acc-t2t-00000001'
const ACC2 = 'acc-t2t-00000002'
const recente = () => new Date(Date.now() - 3600_000).toISOString()
const velho = () => new Date(Date.now() - 30 * 3600_000).toISOString()

interface Mundo {
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
interface Cenario {
  nome: string
  linhas: () => Registo[]
  posicoes: Record<string, Registo[]>
  pendentes?: Record<string, Registo[]>
  passos: Array<{ precos: Record<string, number>; mundo?: (w: Mundo) => void }>
}

const linha = (o: Registo): Registo => ({
  id: 'l1', connection_id: 'c1', chat_message_id: 'chat-1', channel_key: 'premium-ideas', symbol: 'XAUUSD',
  direction: 'buy', entry: 2000, sl: 1990, tp: 2005, lot: 0.1,
  raw_message: 'GOLD BUY 2000\nSL 1990\nTP1 2005\nTP2 2010\nTP3 2015', broker_position_id: 'b1',
  created_at: recente(), status: 'open', ...o,
})
const pos = (o: Registo): Registo => ({ id: 'b1', symbol: 'XAUUSD.s', type: 'POSITION_TYPE_BUY', openPrice: 2000.2, volume: 0.1, stopLoss: 1990, takeProfit: 2015, ...o })

const cenarios: Cenario[] = [
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

function novoMundo(c: Cenario): Mundo {
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

async function correr(m: Monitor, c: Cenario, extra: Partial<Mundo> = {}): Promise<Registo[]> {
  const w: Mundo = { ...novoMundo(c), ...extra }
  ;(globalThis as { __P?: unknown }).__P = w
  for (const [i, passo] of c.passos.entries()) {
    passo.mundo?.(w)
    w.precos = { ...passo.precos }
    w.log.push({ k: 'passo', i })
    const r = await m.runT2TPriceMonitor()
    w.log.push({ k: 'fim', managed: r.managed, actions: r.actions })
  }
  w.log.push({ k: 'estado', db: w.db.site_settings })
  return normalizar(w.log)
}

async function main() {
  const original = await empacotar<Monitor>({ codigo: fonteDoGit(FICHEIRO), pasta, falsos: FALSOS_SITE })
  const actual = await empacotar<Monitor>({ codigo: readFileSync(path.join(RAIZ, FICHEIRO), 'utf8'), pasta, falsos: FALSOS_SITE })
  let n = 0
  const tudo: Registo[] = []
  for (const c of cenarios) {
    const a = await correr(original, c)
    const b = await correr(actual, c)
    assert.deepEqual(b, a, `${c.nome}\n${primeiraDiferenca(a, b)}`)
    const k = a.filter((x) => x.k === 'modify' || x.k === 'close' || x.k === 'cancel' || x.k === 'push').length
    assert.ok(k > 0, `${c.nome}: nada exercitado`)
    n += k
    tudo.push(...b)
    console.log(`ok  ${c.nome} (${k} acções)`)
  }
  const acoes = tudo.filter((x) => x.k === 'fim').flatMap((x) => x.actions as string[]).join(' | ')
  for (const r of ['entry_hit', 'early_be', 'exit1', 'be_trail', 'trail ', 'exit2', 'exit3', 'discarded', 'closed', 'ilegível']) {
    assert.ok(acoes.includes(r), `nenhum cenário tocou «${r}»: ${acoes}`)
  }

  // Guarda: conta em live para T2T → o monitor não mexe na posição (as pendentes/fechos continuam).
  const vivo = await correr(actual, cenarios[0], { live: [`${ACC}:t2t`] })
  assert.equal(vivo.filter((x) => x.k === 'modify' || x.k === 'close').length, 0, 'conta em live: o monitor T2T não pode mexer')
  console.log(`paridade T2T: ${cenarios.length} cenários, ${n} acções iguais — todos certos`)
}

main().catch((e) => { console.error(e); process.exit(1) })
