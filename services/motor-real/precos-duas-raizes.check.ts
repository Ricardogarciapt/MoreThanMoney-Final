/**
 * A RESERVA NÃO PODE PIORAR O PRINCIPAL.
 *
 * Desde que o Mac do Ricardo pode alimentar os motores (services/precos-entrada/), há DOIS
 * `ticks.json` a ser lidos. O leitor antigo guardava o último ficheiro que lesse — quem viesse
 * depois ganhava, fresco ou atrasado. Com duas raízes isso era a reserva a tapar o terminal do VPS
 * com um tick pior, e ninguém veria: os dois carimbam `em` com a hora da leitura.
 *
 * Estes guardas fixam a regra: ganha a HORA DE MERCADO mais alta, seja qual for a ordem dos
 * ficheiros, e o resumo diz de quem é o preço que está a mandar.
 *
 * Correr: npx tsx services/motor-real/precos-duas-raizes.check.ts
 */
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { etiquetaDoFicheiro, origemDoFicheiro } from '../funded-motor/fonte-conector-mt5'
import { PrecosNossos } from './precos-nossos'

// ── A etiqueta sai da raiz, sem nada para configurar ────────────────────────
assert.equal(etiquetaDoFicheiro('/var/lib/mtm-conector/MQL5/Files/mtm-conector/ticks.json'), 'mtm-conector')
assert.equal(etiquetaDoFicheiro('/var/lib/mtm-precos-entrada/mac-ricardo/MQL5/Files/mtm-conector/ticks.json'), 'mac-ricardo')
assert.equal(etiquetaDoFicheiro('ticks.json'), '')
// O prefixo da origem NUNCA muda: há logs, testes e auditoria a ler «conector-mt5».
assert.ok(origemDoFicheiro('/x/mac-ricardo/MQL5/Files/mtm-conector/ticks.json').startsWith('conector-mt5'))
assert.equal(origemDoFicheiro('/x/mac-ricardo/MQL5/Files/mtm-conector/ticks.json'), 'conector-mt5:mac-ricardo')
assert.equal(origemDoFicheiro('ticks.json'), 'conector-mt5')

// ── Duas raízes, e ganha o mais fresco ──────────────────────────────────────
const dbVazia = {
  from: () => ({ select: async () => ({ data: [], error: null }) }),
} as unknown as SupabaseClient

async function escreverTicks(raiz: string, ticks: Array<{ s: string; b: number; a: number; t: number }>): Promise<string> {
  const f = path.join(raiz, 'MQL5', 'Files', 'mtm-conector', 'ticks.json')
  await fs.mkdir(path.dirname(f), { recursive: true })
  await fs.writeFile(f, JSON.stringify({ em: Date.now(), p: ticks }), 'utf8')
  return f
}

async function correr(): Promise<void> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'mtm-ticks-'))
  const agora = Date.now()
  // O terminal do VPS: tick de agora. A reserva do Mac: o mesmo símbolo, 5 s atrás (terminal que
  // ficou para trás, ou um lote a chegar tarde).
  const doVps = await escreverTicks(path.join(base, 'mtm-conector'), [{ s: 'XAUUSD', b: 4286.0, a: 4286.4, t: agora - 80 }])
  const doMac = await escreverTicks(path.join(base, 'mac-ricardo'), [
    { s: 'XAUUSD', b: 4280.0, a: 4280.4, t: agora - 5_000 },
    // …e um símbolo que só o Mac tem no Market Watch: esse entra, que é a razão de existir a reserva.
    { s: 'EURUSD', b: 1.0851, a: 1.0852, t: agora - 120 },
  ])

  for (const [a, b, ordem] of [[doVps, doMac, 'VPS primeiro'], [doMac, doVps, 'Mac primeiro']] as const) {
    const fonte = new PrecosNossos({ db: dbVazia, ficheirosConector: [a, b], ritmoConectorMs: 10_000 })
    await fonte.iniciar()
    const xau = fonte.bruto('XAUUSD')
    assert.ok(xau, `${ordem}: tinha de haver preço`)
    assert.equal(xau.bid, 4286.0, `${ordem}: ganha o tick mais fresco, não o último ficheiro lido`)
    assert.equal(xau.fonte, 'mtm-conector', `${ordem}: e o resumo tem de saber de quem é`)
    assert.ok(fonte.bruto('EURUSD'), `${ordem}: o símbolo que só a reserva tem continua a entrar`)
    assert.equal(fonte.bruto('EURUSD')?.fonte, 'mac-ricardo')
    const r = fonte.resumo()
    assert.equal(r.conector.simbolosPorFonte['mtm-conector'], 1)
    assert.equal(r.conector.simbolosPorFonte['mac-ricardo'], 1)
    fonte.parar()
  }

  // E quando o principal PÁRA (o incidente de 28/09: último tick de sexta), a reserva assume — sem
  // que ninguém mude configuração nenhuma.
  await escreverTicks(path.join(base, 'mtm-conector'), [{ s: 'XAUUSD', b: 4286.0, a: 4286.4, t: agora - 3 * 24 * 3600_000 }])
  const fonte = new PrecosNossos({ db: dbVazia, ficheirosConector: [doVps, doMac], ritmoConectorMs: 10_000 })
  await fonte.iniciar()
  assert.equal(fonte.bruto('XAUUSD')?.fonte, 'mac-ricardo', 'principal parado há dias → manda a reserva')
  // O preço da reserva tem 5 s: passa o tecto dos 30 s de quem traz hora de mercado, e serve.
  assert.equal(fonte.preco('XAUUSD'), 4280.2)
  fonte.parar()

  await fs.rm(base, { recursive: true, force: true })
  console.log('precos-duas-raizes: ok')
}

void correr()
