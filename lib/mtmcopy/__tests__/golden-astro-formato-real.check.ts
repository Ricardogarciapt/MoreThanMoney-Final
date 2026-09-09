/**
 * O formato REAL do grupo GOLDEN ASTRO🚀, contra o que o código esperava.
 *
 * As regras escritas dizem «Gold Buy» / «Gold sell» e um stop fixo de 100 pips. Em 44 setups
 * publicados entre 25/08 e 08/09 não há um único «Gold Buy»: ele escreve «XAUUSD I'm selling»
 * e publica a zona, o stop e os cinco alvos por extenso. O gatilho documentado nunca chegaria,
 * e a escada em pips reconstruída por cima dos níveis dele dava outro trade.
 *
 * As mensagens aqui são cópias literais do grupo (ids 260, 255, 261, 262).
 */
import { direcaoGoldenAstro, planoPublicado, dentroDaJanela } from '../golden-astro'
import { parseSignal } from '../signal-parser'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (a === b) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${String(b)}\n   obtido:   ${String(a)}`)
}

const VENDA = `XAUUSD I'm selling

Entry Zone 4395.09 - 4400.09
Stop Loss 4405.09

TP 1 4392.59
TP 2 4390.09
TP 3 4387.59
TP 4 4385.09
TP 5 4380.09`

const COMPRA = `XAUUSD I'm buying

Entry Zone 4393.58 - 4398.58
Stop Loss 4388.58

TP 1 4401.08
TP 2 4403.58
TP 3 4406.08
TP 4 4408.58
TP 5 4413.58`

// ── o gatilho real ─────────────────────────────────────────────────────────
eq('venda', direcaoGoldenAstro(VENDA), 'sell')
eq('compra', direcaoGoldenAstro(COMPRA), 'buy')
eq('apóstrofe curva', direcaoGoldenAstro('XAUUSD I’m selling'), 'sell')
eq('sem apóstrofe', direcaoGoldenAstro('XAUUSD im buying'), 'buy')
eq('forma documentada ainda serve', direcaoGoldenAstro('Gold Buy now'), 'buy')
eq('follow-up não é entrada', direcaoGoldenAstro('Tp2 hit'), null)
eq('conversa não é entrada', direcaoGoldenAstro('Strange strange market today.'), null)

// ── os níveis são DELE ─────────────────────────────────────────────────────
const pv = planoPublicado(parseSignal(VENDA)!, 'sell')!
eq('venda: entrada dele', pv.entrada, 4400.09)
eq('venda: stop dele', pv.sl, 4405.09)
eq('venda: 5 alvos', pv.tp.length, 5)
eq('venda: TP1 dele', pv.tp[0], 4392.59)
eq('venda: TP5 dele', pv.tp[4], 4380.09)
// risco = 5.00 → metade = 2.50 acima da entrada (venda)
eq('venda: stop a meio risco após TP2', pv.slAposTp2, 4402.59)

const pc = planoPublicado(parseSignal(COMPRA)!, 'buy')!
eq('compra: entrada dele', pc.entrada, 4393.58)
eq('compra: stop dele', pc.sl, 4388.58)
eq('compra: TP5 dele', pc.tp[4], 4413.58)
eq('compra: stop a meio risco após TP2', pc.slAposTp2, 4391.08)

// ── o que NÃO pode passar ──────────────────────────────────────────────────
eq('sem stop → sem plano', planoPublicado({ symbol: 'XAUUSD', entry: 4400, sl: null, tp: [4390] }, 'sell'), null)
eq('sem alvos → sem plano', planoPublicado({ symbol: 'XAUUSD', entry: 4400, sl: 4405, tp: [] }, 'sell'), null)
// stop do lado errado abre uma posição que fecha no instante seguinte
eq('stop trocado (venda)', planoPublicado({ symbol: 'XAUUSD', entry: 4400, sl: 4395, tp: [4390] }, 'sell'), null)
eq('stop trocado (compra)', planoPublicado({ symbol: 'XAUUSD', entry: 4400, sl: 4405, tp: [4410] }, 'buy'), null)
eq('stop igual à entrada', planoPublicado({ symbol: 'XAUUSD', entry: 4400, sl: 4400, tp: [4410] }, 'buy'), null)

// ── janelas de Londres (a regra escrita) ───────────────────────────────────
// 08/09 era horário de verão britânico: 12:30Z = 13:30 em Londres.
eq('13:30 Londres dentro', dentroDaJanela(new Date('2026-09-08T12:30:00Z')), true)
eq('09:00 Londres dentro', dentroDaJanela(new Date('2026-09-08T08:00:00Z')), true)
eq('15:00 Londres dentro', dentroDaJanela(new Date('2026-09-08T14:00:00Z')), true)
// os dois setups reais que caíram fora
eq('16:25 Londres fora', dentroDaJanela(new Date('2026-09-08T15:25:00Z')), false)
eq('17:36 Londres fora', dentroDaJanela(new Date('2026-09-08T16:36:00Z')), false)
eq('12:00 Londres fora', dentroDaJanela(new Date('2026-09-08T11:00:00Z')), false)

console.log(mau === 0 ? `✓ ${ok} verificações passaram` : `${ok} ok, ${mau} FALHARAM`)
process.exit(mau === 0 ? 0 : 1)
