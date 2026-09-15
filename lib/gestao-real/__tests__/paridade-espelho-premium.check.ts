/**
 * PARIDADE DO ESPELHO PREMIUM — `mirrorPremiumExit` ORIGINAL (git 8a81044) e o actual (que chama
 * lib/gestao-real/espelho-premium.ts) fazem as mesmas ordens nas contas dos subscritores e a mesma
 * linha de auditoria, para as três acções e os casos de lote (segura, parcial, fecha resto),
 * ambiguidade, conta ilegível, ligações que não copiam o Premium e o interruptor desligado.
 *
 *   npx tsx lib/gestao-real/__tests__/paridade-espelho-premium.check.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { RAIZ, empacotar, fonteDoGit, normalizar, primeiraDiferenca, type Registo } from './harness'
import { FALSOS_SITE } from './falsos-site'
import { decidirSubscritor } from '../espelho-premium'

type Espelho = { mirrorPremiumExit: (s: string, d: 'buy' | 'sell', a: Record<string, unknown>) => Promise<Registo> }
const FICHEIRO = 'lib/mtmcopy/premium-subscriber-exits.ts'
const pasta = path.join(RAIZ, 'lib/mtmcopy')

const lig = (id: string, o: Registo = {}): Registo => ({ metaapi_account_id: id, copy_method: 'strategy', is_active: true, mt5_status: 'connected', copyfactory_strategy_id: null, copyfactory_strategy_pick: 'MxsR', strategy_lots: null, ...o })
const p = (id: string, symbol: string, type: string, volume: number): Registo => ({ id, symbol, type, volume, openPrice: 2000, stopLoss: 1990, takeProfit: 2015 })

function mundo(): Registo {
  return {
    db: {
      mtmcopy_connections: [
        lig('s-grande'), lig('s-001'), lig('s-003'), lig('s-amb'), lig('s-ilegivel'), lig('s-eur'),
        lig('s-lots', { copyfactory_strategy_pick: null, strategy_lots: { premium: 0.02 } }),
        lig('s-outra', { copyfactory_strategy_pick: 'Oca7' }),
        lig('s-telegram', { copy_method: 'telegram_group' }),
        lig('s-grande'),
      ],
      mtmcopy_signal_log: [],
    },
    contas: {
      's-grande': [p('g1', 'XAUUSD.s', 'POSITION_TYPE_BUY', 0.3)],
      's-001': [p('u1', 'GOLD', 'POSITION_TYPE_BUY', 0.01)],
      's-003': [p('t1', 'XAUUSD-VIP', 'POSITION_TYPE_BUY', 0.03)],
      's-amb': [p('a1', 'XAUUSD', 'POSITION_TYPE_BUY', 0.1), p('a2', 'XAUUSD', 'POSITION_TYPE_BUY', 0.1)],
      's-eur': [p('e1', 'EURUSD', 'POSITION_TYPE_BUY', 0.1), p('e2', 'XAUUSD', 'POSITION_TYPE_SELL', 0.1)],
      's-lots': [p('l1', 'XAUUSD', 'POSITION_TYPE_BUY', 0.02)],
      's-outra': [p('o1', 'XAUUSD', 'POSITION_TYPE_BUY', 0.5)],
      's-telegram': [p('tg', 'XAUUSD', 'POSITION_TYPE_BUY', 0.5)],
    },
    ilegivel: ['s-ilegivel'],
    log: [], seq: 0,
    switches: { premium_subscriber_exits: true },
  }
}

const accoes: Array<{ d: 'buy' | 'sell'; a: Record<string, unknown> }> = [
  { d: 'buy', a: { kind: 'close_frac', frac: 0.7 } },
  { d: 'buy', a: { kind: 'be_trailing', beSl: 2000.5, trailing: { mode: 'threshold_pips', activationPips: 1, trailPips: 75 } } },
  { d: 'buy', a: { kind: 'close_frac', frac: 0.5 } },
  { d: 'buy', a: { kind: 'close_all' } },
  { d: 'sell', a: { kind: 'close_frac', frac: 0.15 } },
]

async function correr(m: Espelho, desligado = false): Promise<Registo[]> {
  const w = mundo() as { log: Registo[]; switches: Record<string, boolean> }
  if (desligado) w.switches.premium_subscriber_exits = false
  ;(globalThis as { __P?: unknown }).__P = w
  for (const x of accoes) {
    const r = await m.mirrorPremiumExit('XAUUSD', x.d, x.a)
    w.log.push({ k: 'resultado', r })
  }
  return normalizar(w.log)
}

async function main() {
  const original = await empacotar<Espelho>({ codigo: fonteDoGit(FICHEIRO), pasta, falsos: FALSOS_SITE })
  const actual = await empacotar<Espelho>({ codigo: readFileSync(path.join(RAIZ, FICHEIRO), 'utf8'), pasta, falsos: FALSOS_SITE })
  for (const desligado of [false, true]) {
    const a = await correr(original, desligado)
    const b = await correr(actual, desligado)
    assert.deepEqual(b, a, primeiraDiferenca(a, b))
  }
  const log = await correr(actual)
  const det = log.filter((x) => x.k === 'resultado').flatMap((x) => ((x.r as Registo).detail as string[])).join(' | ')
  for (const r of ['fecha 70%', 'não escala', 'fecha resto', 'ambíguo', 'sem posições (erro)', 'BE+trailing', 'fecha tudo']) {
    assert.ok(det.includes(r), `não exercitado: ${r} — ${det}`)
  }
  assert.ok(!log.some((x) => x.acc === 's-outra' || x.acc === 's-telegram'), 'contas que não copiam o Premium não se tocam')
  // A decisão pura, directamente
  assert.deepEqual(decidirSubscritor([{ id: 'x', symbol: 'XAUUSD', type: 'POSITION_TYPE_BUY', openPrice: 1, volume: 0.02 }], 'XAUUSD', 'buy', { kind: 'close_frac', frac: 0.7 }).tipo, 'parcial')
  console.log('paridade espelho Premium: 5 acções × 9 ligações, ligado e desligado — todos certos')
}

main().catch((e) => { console.error(e); process.exit(1) })
