/**
 * SIGNAL-TRACKER: quando é que a entrada enche, quanto vale um setup e de onde vem o preço (07/10).
 *
 *   npx tsx lib/mtmcopy/__tests__/tracker-entrada.check.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x'

import { descarteSilencioso, entradaEncheu, horasAteDesistir, tipoDaEntrada } from '../tracker-entrada'

let n = 0
const caso = (nome: string, f: () => void) => { try { f(); n++ } catch (e) { console.error(`✗ ${nome}`); throw e } }

async function main() {
  const { meioFresco } = await import('../reference-price')

  // O caso real de 02/10: SELL Premium 4195 publicado às 08:12 com o ouro a 4186 → é uma venda STOP.
  caso('tipo decidido contra o preço da admissão', () => {
    assert.equal(tipoDaEntrada({ direcao: 'sell', entrada: 4195, preco: 4186 }), 'limite', 'venda ACIMA do preço = limite (espera que suba)')
    assert.equal(tipoDaEntrada({ direcao: 'sell', entrada: 4180, preco: 4186 }), 'stop', 'venda ABAIXO do preço = stop (espera que desça)')
    assert.equal(tipoDaEntrada({ direcao: 'buy', entrada: 4180, preco: 4186 }), 'limite')
    assert.equal(tipoDaEntrada({ direcao: 'buy', entrada: 4195, preco: 4186 }), 'stop')
    assert.equal(tipoDaEntrada({ direcao: 'buy', entrada: null, preco: 4186 }), 'mercado')
    assert.equal(tipoDaEntrada({ direcao: 'buy', entrada: 4195, preco: null }), null, 'sem preço não se decide')
  })
  caso('a entrada só enche quando o preço a ATRAVESSA no sentido do tipo', () => {
    // venda STOP a 4180 (preço 4186): subir para 4200 NÃO enche (era o defeito: `preço >= entrada`)
    assert.equal(entradaEncheu({ direcao: 'sell', entrada: 4180, tipo: 'stop', preco: 4200 }), false)
    assert.equal(entradaEncheu({ direcao: 'sell', entrada: 4180, tipo: 'stop', preco: 4179.9 }), true)
    // venda LIMITE a 4195: enche ao subir
    assert.equal(entradaEncheu({ direcao: 'sell', entrada: 4195, tipo: 'limite', preco: 4186 }), false)
    assert.equal(entradaEncheu({ direcao: 'sell', entrada: 4195, tipo: 'limite', preco: 4195.2 }), true)
    // compra limite / stop
    assert.equal(entradaEncheu({ direcao: 'buy', entrada: 4180, tipo: 'limite', preco: 4179 }), true)
    assert.equal(entradaEncheu({ direcao: 'buy', entrada: 4180, tipo: 'limite', preco: 4190 }), false)
    assert.equal(entradaEncheu({ direcao: 'buy', entrada: 4195, tipo: 'stop', preco: 4196 }), true)
    assert.equal(entradaEncheu({ direcao: 'buy', entrada: 4195, tipo: 'stop', preco: 4186 }), false)
    assert.equal(entradaEncheu({ direcao: 'buy', entrada: 4195, tipo: null, preco: 4196 }), false, 'tipo por decidir não enche')
    assert.equal(entradaEncheu({ direcao: 'buy', entrada: null, tipo: 'mercado', preco: 1 }), true)
  })
  caso('validade: o Premium vale 60 min (a janela da limite da mestre); o resto 24 h', () => {
    assert.equal(horasAteDesistir('premium', 24), 1)
    assert.equal(horasAteDesistir('sensei', 24), 24)
    assert.equal(horasAteDesistir(null, 24), 24)
    assert.equal(descarteSilencioso(31, 24), true, 'o atraso do tracker parado não vira cartões')
    assert.equal(descarteSilencioso(24.5, 24), false)
  })
  caso('preço da casa: só fresco', () => {
    const agora = Date.parse('2026-10-07T14:44:10Z')
    assert.equal(meioFresco({ bid: 4103.76, ask: 4103.92, em: '2026-10-07T14:44:04Z', em_mercado: '2026-10-07T14:44:04Z' }, agora), 4103.84)
    assert.equal(meioFresco({ bid: 4103.76, ask: 4103.92, em: '2026-10-07T14:44:04Z', em_mercado: '2026-10-06T21:00:00Z' }, agora), null, 'mercado parado (fim de semana / fonte morta) não serve')
    assert.equal(meioFresco({ bid: 82995.6, ask: 82995.61, em: '2026-10-07T14:44:02Z', em_mercado: null }, agora) != null, true, 'cripto sem hora de mercado usa o carimbo do motor')
    assert.equal(meioFresco(null, agora), null)
  })
  caso('o tracker usa isto (guarda estática)', () => {
    const raiz = join(__dirname, '..')
    const tracker = readFileSync(join(raiz, 'signal-tracker.ts'), 'utf8')
    assert.ok(!/const encheu = l\.entry == null \|\| \(compra \? price <= l\.entry : price >= l\.entry\)/.test(tracker), 'acabou o «preço do lado certo = cheia»')
    assert.match(tracker, /entradaEncheu\(/)
    assert.match(tracker, /tipo_entrada: tipoDaEntrada\(/, 'o tipo decide-se na admissão')
    assert.ok(tracker.indexOf('horasAteDesistir(l.source_key') < tracker.indexOf('const price = precos.get(l.symbol)'), 'a validade vê-se antes da cotação')
    const ref = readFileSync(join(raiz, 'reference-price.ts'), 'utf8')
    assert.ok(ref.indexOf('precoDaCasa(sym)') > -1 && ref.indexOf('precoDaCasa(sym)') < ref.indexOf('for (const acc of FONTES)'), 'o preço da casa vem antes da MetaApi')
  })
  console.log(`tracker-entrada: ${n} casos OK`)
}

main().catch((e) => { console.error(e); process.exit(1) })
