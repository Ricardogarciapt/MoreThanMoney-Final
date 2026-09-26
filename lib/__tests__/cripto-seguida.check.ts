/**
 * A REDUÇÃO DO CRIPTO, PRESA — `npx tsx lib/__tests__/cripto-seguida.check.ts`.
 *
 * A regra vive num sítio só (`lib/cripto-seguida.ts`) e é usada em dois: a listagem do webtrader
 * (app/api/mtmfunded/simulado/precos) e o motor de preços (services/funded-motor/motor.ts). Este
 * ficheiro existe para que a lista não se possa alargar por acidente e, sobretudo, para que ao
 * apertá-la ninguém tire preço a quem está dentro do mercado:
 *
 *  · uma classe que não é cripto NUNCA pode ser escondida — foi assim que a gate da Apple escondeu
 *    cinco pares de forex por terem «USDT»/«USDC» no nome;
 *  · o BTCUSD e o ETHUSD têm posições, ordens, espelho e sinais reais na base (contados a
 *    26/09/2026): tirá-los da lista é tirar preço a trades abertas;
 *  · o guard do motor tem de continuar a deixar passar o que está a ser negociado.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CLASSE_CRIPTO, CRIPTO_SEGUIDA, criptoDeFora, ehCriptoSeguida, simboloListavel } from '../cripto-seguida'
import { CRIPTO, NAO_CRIPTO } from './catalogo-simbolos'
import { CRUZADOS_CRIPTO } from '../mtmfunded/precos/cruzados'

const RAIZ = join(__dirname, '..', '..')

// ── A lista é a que o dono pediu, e são quatro ────────────────────────────────

assert.deepEqual([...CRIPTO_SEGUIDA], ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD'])

// O que a base prova estar a ser negociado em cripto. Acrescentar aqui só depois de olhar para
// funded_positions / funded_orders / funded_espelho_posicoes / funded_sinal_posicoes.
for (const s of ['BTCUSD', 'ETHUSD']) {
  assert.ok(ehCriptoSeguida(s), `${s} tem trades reais na base: não pode sair da lista`)
}

// ── Nenhuma outra classe é afectada ──────────────────────────────────────────

for (const s of NAO_CRIPTO) {
  assert.ok(simboloListavel(s, 'forex'), `${s} não é cripto e foi escondido`)
  assert.ok(!criptoDeFora(s, 'metal'), `${s} não é cripto e foi escondido`)
}
// Os que mais se parecem com cripto sem o serem: aqui é a CLASSE que decide, não as letras.
for (const s of ['USDCLP', 'USDCOP', 'USDCZK', 'USDTHB', 'USDTWD', 'XAUUSD', 'BITO', 'IBIT']) {
  assert.ok(simboloListavel(s, 'forex'))
}
// Sem classe (ficha ainda não carregada) mostra-se: um preço a faltar é pior do que um símbolo a mais.
assert.ok(simboloListavel('ADAUSD', null))
assert.ok(!criptoDeFora('ADAUSD', undefined))

// ── O cripto do catálogo fica reduzido às quatro ──────────────────────────────

const deFora = CRIPTO.filter((s) => criptoDeFora(s, CLASSE_CRIPTO))
const dentro = CRIPTO.filter((s) => simboloListavel(s, CLASSE_CRIPTO))
assert.deepEqual(dentro.sort(), ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD'], 'a listagem de cripto tem de ser exactamente as quatro')
assert.equal(deFora.length + dentro.length, CRIPTO.length)
assert.ok(deFora.length > 50, `a redução perdeu o efeito: só ${deFora.length} símbolos de fora`)
for (const s of ['ADAUSD', 'LTCUSD', 'DOTUSD', 'BNBUSD', 'BTCJPY', 'BTCXAU', 'USDTJPY']) {
  assert.ok(criptoDeFora(s, CLASSE_CRIPTO), `${s} devia ter ficado de fora`)
}

// ── Um cruzado que se mantém não pode depender de uma perna que se largou ─────
// Senão o símbolo continua no ecrã e o preço dele deixa de existir — pior do que o esconder.

for (const c of CRUZADOS_CRIPTO) {
  if (!ehCriptoSeguida(c.symbol)) continue
  for (const perna of [c.a, c.b]) {
    assert.ok(
      ehCriptoSeguida(perna) || !CRIPTO.includes(perna),
      `${c.symbol} fica na lista mas a perna ${perna} é uma cripto que se deixou de seguir`,
    )
  }
}

// ── Uma lista só: quem decide cripto tem de vir daqui ─────────────────────────

const motor = readFileSync(join(RAIZ, 'services', 'funded-motor', 'motor.ts'), 'utf8')
const rota = readFileSync(join(RAIZ, 'app', 'api', 'mtmfunded', 'simulado', 'precos', 'route.ts'), 'utf8')
assert.match(motor, /from '\.\.\/\.\.\/lib\/cripto-seguida'/, 'o motor deixou de usar a lista partilhada')
assert.match(rota, /from '@\/lib\/cripto-seguida'/, 'a listagem do webtrader deixou de usar a lista partilhada')

/**
 * O guard do motor passa a régua pela procura de quem olha, não pelo que está no mercado. Estes
 * quatro nomes são as quatro razões para um símbolo continuar a ter preço; se um deles sair do
 * guard, uma posição aberta numa cripto fora da lista fica sem cotação.
 */
const guard = motor.match(/function criptoQueNinguemUsa[\s\S]*?\n}/)?.[0] ?? ''
assert.ok(guard, 'o guard criptoQueNinguemUsa desapareceu do motor')
for (const excepcao of ['interessados', 'simbolosDoEspelho', 'simbolosDoProvider', 'alertasPorSimbolo']) {
  assert.ok(guard.includes(excepcao), `o guard do motor deixou de respeitar ${excepcao}`)
}

console.log('cripto-seguida: OK —', dentro.length, 'cripto na listagem,', deFora.length, 'fora')
