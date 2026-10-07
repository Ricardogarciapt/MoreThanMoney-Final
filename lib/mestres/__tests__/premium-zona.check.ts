/**
 * PREMIUM: A MESTRE ENTRA NA ZONA DO TRADER E SAI QUANDO ELE SAI (07/10).
 *
 * Correr: npx tsx lib/mestres/__tests__/premium-zona.check.ts
 *
 * O caso mau (medido 24/09–07/10, 66 sinais): a mestre abria a MERCADO no instante do sinal, na ponta
 * pior da zona (ou já fora dela), com o stop de ~100 pips do trader e TP1 a 50 — −458 pips nas velas de
 * 1 min. Exemplos reais da mestre 1c6a3789:
 *   · tg:11460 BUY «Zona 4285 – 4280 | SL 4275»: comprou a 4286,85 (ACIMA da zona) → SL, −118,5 pips;
 *   · tg:11589 SELL «Zona 4181 – 4186 | SL 4191»: vendeu a 4181,64 (no fundo da zona) → SL, −93,6 pips.
 * Com limite no meio da zona e 60 min de validade a mesma série dá +880 pips (+616 / +264 por semana).
 *
 * Prova-se:
 *   1. entradaPremium: limite no meio da zona; mercado só quando o preço já está do lado bom do meio;
 *      recusa zona mal lida (meio para lá do SL/TP1) e preço que já passou o SL;
 *   2. os dois casos reais acima deixam de comprar acima da zona / vender no fundo dela;
 *   3. sinais_config.entradaPremium: padrão e saneamento;
 *   4. exposição: até 2 trades Premium vivas (o trader faz camadas), a 3.ª recusa;
 *   5. saídas do trader com mensagens REAIS: «Close all now» fecha tudo, «HIT SL» fecha o sinal,
 *      «HIT TP1 … Take partials» e «running» não mexem;
 *   6. a ordem limite: níveis vistos da limite, gestão medida a partir da limite;
 *   7. o cano lê isto (fontes): servidor/premium.ts, sinal-mestre.ts, processor.ts, pendente.ts.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSignal } from '../../mtmcopy/signal-parser'
import {
  bloqueioPorExposicao, decidirSinalPremium, entradaPremium, lerEntradaPremium, PREMIUM_ENTRADA_PADRAO, saidaDoTraderPremium,
} from '../premium'
import { niveisDaLimite } from '../../mtmfunded/estrategias-sinais/pendente'
import { configDoProvider, gestaoDoSinal } from '../../mtmfunded/estrategias-sinais/calculo'

let ko = 0
function t(nome: string, f: () => void) {
  try { f(); console.log(`  ✓ ${nome}`) } catch (e) { ko++; console.error(`  ✗ ${nome}\n    ${e instanceof Error ? e.message : String(e)}`) }
}
const raiz = join(__dirname, '..', '..', '..')
const ler = (p: string) => readFileSync(join(raiz, p), 'utf8')
const AGORA = new Date('2026-10-02T07:03:32Z')
const CFG = PREMIUM_ENTRADA_PADRAO

console.log('\n1. onde entrar')
t('BUY com o preço acima do meio → limite no meio, válida 60 min', () => {
  const e = entradaPremium({ direcao: 'buy', zona: [4275, 4280], sl: 4270, tp1: 4285, preco: { bid: 4280.9, ask: 4281.2 }, cfg: CFG, agora: AGORA })
  assert.equal(e.tipo, 'limite')
  if (e.tipo !== 'limite') return
  assert.equal(e.preco, 4277.5)
  assert.equal(Date.parse(e.expiraEm) - AGORA.getTime(), 60 * 60_000)
})
t('SELL com o preço abaixo do meio → limite no meio', () => {
  const e = entradaPremium({ direcao: 'sell', zona: [4181, 4186], sl: 4191, tp1: 4176, preco: { bid: 4181.5, ask: 4181.8 }, cfg: CFG, agora: AGORA })
  assert.deepEqual(e.tipo === 'limite' ? e.preco : e, 4183.5)
})
t('preço já do lado BOM do meio (dentro da zona) → mercado', () => {
  const e = entradaPremium({ direcao: 'buy', zona: [4275, 4280], sl: 4270, tp1: 4285, preco: { bid: 4276.6, ask: 4276.9 }, cfg: CFG, agora: AGORA })
  assert.equal(e.tipo, 'mercado')
})
t('preço que já passou o SL → recusa (nunca abrir com o stop do outro lado)', () => {
  const e = entradaPremium({ direcao: 'sell', zona: [4181, 4186], sl: 4191, tp1: 4176, preco: { bid: 4213.3, ask: 4213.6 }, cfg: CFG, agora: AGORA })
  // vender a 4213 com SL 4191: o «lado bom» do meio, mas para lá do stop
  assert.equal(e.tipo, 'recusar')
})
t('zona mal lida (meio para lá do SL ou do TP1) → recusa', () => {
  // um dígito perdido: «Zona 4332 – 4227» com TP1 4237 → meio 4279,5 já para lá do TP1
  assert.equal(entradaPremium({ direcao: 'buy', zona: [4227, 4332], sl: 4222, tp1: 4237, preco: null, cfg: CFG, agora: AGORA }).tipo, 'recusar')
  // SELL com o SL dentro da zona → meio do lado errado do stop
  assert.equal(entradaPremium({ direcao: 'sell', zona: [4181, 4196], sl: 4186, tp1: 4176, preco: null, cfg: CFG, agora: AGORA }).tipo, 'recusar')
})
t('sem zona → mercado (como antes); modo mercado → mercado', () => {
  assert.equal(entradaPremium({ direcao: 'buy', zona: null, sl: 4270, tp1: 4285, preco: null, cfg: CFG, agora: AGORA }).tipo, 'mercado')
  assert.equal(entradaPremium({ direcao: 'buy', zona: [4275, 4280], sl: 4270, tp1: 4285, preco: null, cfg: { ...CFG, modo: 'mercado' }, agora: AGORA }).tipo, 'mercado')
})
t('sem tick fresco → limite na mesma (a limite não precisa de preço para nascer)', () => {
  assert.equal(entradaPremium({ direcao: 'buy', zona: [4275, 4280], sl: 4270, tp1: 4285, preco: null, cfg: CFG, agora: AGORA }).tipo, 'limite')
})

console.log('\n2. os casos reais da mestre (24/09 e 02/10)')
t('tg:11460 BUY «4285 – 4280»: comprou a 4286,85 (acima da zona) — agora limite a 4282,5', () => {
  const d = decidirSinalPremium({ sinal: parseSignal('GOLD BUY SETUP\nGold Buy Zone 4285 - 4280\nSL : 4275\nTP1 : 4290\nTP2 : 4295\nTP3 : 4300'), agora: new Date('2026-09-24T07:16:31Z') })
  assert.ok(d.abrir, !d.abrir ? d.motivo : '')
  if (!d.abrir) return
  assert.deepEqual(d.sinal.zona, [4280, 4285])
  const e = entradaPremium({ direcao: 'buy', zona: d.sinal.zona, sl: d.sinal.sl, tp1: d.sinal.tps[0], preco: { bid: 4286.69, ask: 4286.85 }, cfg: CFG, agora: AGORA })
  assert.equal(e.tipo === 'limite' ? e.preco : null, 4282.5)
})
t('tg:11589 SELL «4181 – 4186»: vendeu a 4181,64 (fundo da zona) — agora limite a 4183,5', () => {
  const d = decidirSinalPremium({ sinal: parseSignal('GOLD SELL SETUP\nGold Sell Zone 4181 - 4186\nSL : 4191\nTP1 : 4176\nTP2 : 4171\nTP3 : 4166'), agora: AGORA })
  assert.ok(d.abrir)
  if (!d.abrir) return
  const e = entradaPremium({ direcao: 'sell', zona: d.sinal.zona, sl: d.sinal.sl, tp1: d.sinal.tps[0], preco: { bid: 4181.64, ask: 4181.96 }, cfg: CFG, agora: AGORA })
  assert.equal(e.tipo === 'limite' ? e.preco : null, 4183.5)
})

console.log('\n3. configuração')
t('padrão: zona, 60 min, 2 vivas', () => assert.deepEqual(lerEntradaPremium(null), { modo: 'zona', validadeMin: 60, maxVivas: 2 }))
t('lê sinais_config.entradaPremium e sanea o que vier torto', () => {
  assert.deepEqual(lerEntradaPremium({ entradaPremium: { modo: 'mercado', validadeMin: 30, maxVivas: 3 } }), { modo: 'mercado', validadeMin: 30, maxVivas: 3 })
  assert.deepEqual(lerEntradaPremium({ entradaPremium: { modo: 'x', validadeMin: 0, maxVivas: 99 } }), { modo: 'zona', validadeMin: 60, maxVivas: 2 })
})

console.log('\n4. exposição (camadas)')
t('0 e 1 vivas abrem; 2 vivas recusam a 3.ª', () => {
  assert.equal(bloqueioPorExposicao(0, CFG), null)
  assert.equal(bloqueioPorExposicao(1, CFG), null)
  assert.match(String(bloqueioPorExposicao(2, CFG)), /máximo 2/)
})

console.log('\n5. saídas do trader (mensagens reais do canal, 24/09–07/10)')
t('«1st entry running … Close all now» → fecha TODAS as camadas', () =>
  assert.equal(saidaDoTraderPremium('1st entry running +280PIPS ✅\n2nd entry running +270PIPS ✅\n3rd entry running +190PIPS ✅\n4th entry running +200PIPS ✅\nClose all now. If hold set BE. Hold rewards with Breakeven(BE)'), 'fechar_tudo'))
t('«HIT SL» → fecha o sinal a que responde', () => assert.equal(saidaDoTraderPremium('HIT SL'), 'fechar_sinal'))
t('«HIT TP1 … Take partials … If hold set BE» e «running» → a gestão por preço manda (nada)', () => {
  assert.equal(saidaDoTraderPremium('🏦 MTM Premium HIT TP1 ✅ +51PIPS Take partials. Manage Trade Risk. If hold set BE. Hold risk with Breakeven(BE)'), 'nada')
  assert.equal(saidaDoTraderPremium('Trade active and running +50PIPS ✅ Take partials. Manage Trade Risk. If hold set BE.'), 'nada')
  assert.equal(saidaDoTraderPremium('HIT TP3 ✅ +152PIPS HIT ALL TP ✅ Take partials.'), 'nada')
})

console.log('\n6. a ordem limite')
t('níveis vistos da limite: TP do lado errado sai; SL do lado errado anula', () => {
  assert.deepEqual(niveisDaLimite('buy', 4277.5, 4270, [4285, 4290, 4295]), { sl: 4270, tps: [4285, 4290, 4295] })
  assert.deepEqual(niveisDaLimite('sell', 4183.5, 4191, [4184, 4176, 4171]), { sl: 4191, tps: [4176, 4171] })
  assert.equal(niveisDaLimite('buy', 4277.5, 4280, [4285]).sl, null)
})
t('gestão medida a partir da LIMITE (BE a +25 pips da limite, parcial no TP1 do trader)', () => {
  const cfg = configDoProvider({ sinais_config: { perfil: 'zona', beOffsetPips: 2, beGatilhoPips: 25, trailingPassoPips: 3, trailingInicioPips: 30, trailingDistanciaPips: 15 } })
  const simb = { symbol: 'XAUUSD', digits: 2, pip_size: 0.1, volume_min: 0.01, volume_step: 0.01, volume_max: 100 } as never
  const g = gestaoDoSinal({ simbolo: simb, direcao: 'buy', precoExecucao: 4277.5, volume: 0.11, sl: 4270, tps: [4285, 4290, 4295], cfg })
  assert.equal(g.gestao.be_gatilho, 2.5)
  assert.equal(g.tpFinal, 4295)
  assert.equal(g.gestao.tps?.[0]?.preco, 4285)
})

console.log('\n7. o cano')
t('servidor/premium.ts: regra de exposição + entradaPremium + limite passada à mestre; já não usa bloqueioPelaAnterior', () => {
  const s = ler('lib/mestres/servidor/premium.ts')
  assert.match(s, /bloqueioPorExposicao\(/)
  assert.match(s, /entradaPremium\(\{/)
  assert.match(s, /limite: entrada\.tipo === 'limite'/)
  assert.doesNotMatch(s, /bloqueioPelaAnterior\(/)
  assert.match(s, /saidaDoTraderPremium\(p\.texto\)/)
})
t('sinal-mestre.ts: com limite → colocarPendenteDoSinal; a mestre «abriu» também quando ficou pendente', () => {
  const s = ler('lib/mestres/servidor/sinal-mestre.ts')
  assert.match(s, /s\.limite && s\.sl != null\s*\n\s*\? colocarPendenteDoSinal/)
  assert.match(s, /r\.estado === 'aberta' \|\| r\.estado === 'pendente'/)
})
t('processor.ts passa o id do sinal-pai ao motor (para espelhar as saídas)', () => assert.match(ler('lib/mtmcopy/processor.ts'), /paiMessageId: ctx\.parentMessageId/))
t('pendente.ts: ordem marcada `estrategia` e com expiração', () => {
  const s = ler('lib/mtmfunded/estrategias-sinais/pendente.ts')
  assert.match(s, /update\(\{ origem: 'estrategia' \}\)/)
  assert.match(s, /expiraEm: p\.expiraEm/)
})

if (ko) { console.error(`\npremium-zona: ${ko} falha(s)`); process.exit(1) }
console.log('\npremium-zona: tudo certo')
