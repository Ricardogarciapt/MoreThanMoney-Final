/**
 * A LINHA DE ÁGUA — a percentagem contra `saldo_inicial`, e a guarda que impede o número simulado
 * de passar por real.
 *
 *   npx tsx lib/admin-centro/__tests__/linha-de-agua.check.ts
 */
import assert from 'node:assert/strict'
import { linhaDeAgua, provenienciaDoMotor, resumirSaldos, textoLinhaDeAgua } from '../linha-de-agua'

const casos: { nome: string; f: () => void }[] = []
const caso = (nome: string, f: () => void) => casos.push({ nome, f })

caso('acima da linha: 10 250 sobre 10 000 são +2,5 %', () => {
  const l = linhaDeAgua(10_250, 10_000, 'simulado')
  assert.equal(l.pct, 2.5)
  assert.equal(l.delta, 250)
  assert.equal(l.acima, true)
})

caso('abaixo da linha: o sinal é negativo, não o valor absoluto', () => {
  const l = linhaDeAgua(870, 1_000, 'real')
  assert.equal(l.pct, -13)
  assert.equal(l.delta, -130)
  assert.equal(l.acima, false)
})

caso('em cima da linha conta como acima (0 % não é perda)', () => {
  assert.equal(linhaDeAgua(1_000, 1_000, 'real').acima, true)
})

caso('sem saldo inicial NÃO se inventa 0 % — devolve null', () => {
  for (const inicial of [null, undefined, 0, -5]) {
    const l = linhaDeAgua(10_000, inicial as number | null, 'real')
    assert.equal(l.pct, null, `inicial=${inicial}`)
    assert.equal(l.acima, null, `inicial=${inicial}`)
  }
})

caso('sem saldo actual também é null (uma conta sem leitura não está a 0 %)', () => {
  assert.equal(linhaDeAgua(null, 10_000, 'real').pct, null)
})

caso('lixo não rebenta nem passa por número', () => {
  assert.equal(linhaDeAgua(Number.NaN, 10_000, 'real').pct, null)
  assert.equal(linhaDeAgua(10_000, Number.POSITIVE_INFINITY, 'real').pct, null)
})

caso('a proveniência vem sempre no resultado, mesmo quando não há percentagem', () => {
  assert.equal(linhaDeAgua(null, null, 'simulado').proveniencia, 'simulado')
})

caso('motor=sim é simulado; qualquer outra coisa (e o desconhecido) é real', () => {
  assert.equal(provenienciaDoMotor('sim'), 'simulado')
  assert.equal(provenienciaDoMotor('SIM'), 'simulado')
  assert.equal(provenienciaDoMotor('mt5'), 'real')
  assert.equal(provenienciaDoMotor(null), 'real')
  assert.equal(provenienciaDoMotor(undefined), 'real')
})

caso('o texto leva sinal e vírgula decimal', () => {
  assert.equal(textoLinhaDeAgua(linhaDeAgua(10_250, 10_000, 'real')), '+2,50 %')
  assert.equal(textoLinhaDeAgua(linhaDeAgua(870, 1_000, 'real')), '−13,00 %')
  assert.equal(textoLinhaDeAgua(linhaDeAgua(9_876.54, 10_000, 'real')), '−1,23 %')
  assert.equal(textoLinhaDeAgua(linhaDeAgua(null, null, 'real')), '—')
})

caso('com sufixo, o simulado diz que é simulado — o real não precisa de aviso', () => {
  assert.equal(textoLinhaDeAgua(linhaDeAgua(10_250, 10_000, 'simulado'), true), '+2,50 % (sim)')
  assert.equal(textoLinhaDeAgua(linhaDeAgua(10_250, 10_000, 'real'), true), '+2,50 %')
})

caso('o resumo NÃO soma simulado com real — são dois totais', () => {
  const r = resumirSaldos([
    { saldo: 10_500, saldoInicial: 10_000, proveniencia: 'simulado' },
    { saldo: 1_100, saldoInicial: 1_000, proveniencia: 'simulado' },
    { saldo: 980, saldoInicial: 1_000, proveniencia: 'real' },
  ])
  assert.equal(r.simulado.contas, 2)
  assert.equal(r.simulado.saldo, 11_600)
  assert.equal(r.simulado.inicial, 11_000)
  assert.equal(r.simulado.pct, 5.45)
  assert.equal(r.real.contas, 1)
  assert.equal(r.real.saldo, 980)
  assert.equal(r.real.pct, -2)
  // Não existe campo «total»: somar os dois daria um número que não está em conta nenhuma.
  assert.equal('total' in r, false)
})

caso('uma conta sem linha de partida conta no saldo mas NÃO inflaciona a percentagem', () => {
  const r = resumirSaldos([
    { saldo: 10_500, saldoInicial: 10_000, proveniencia: 'real' },
    { saldo: 50_000, saldoInicial: null, proveniencia: 'real' },
  ])
  assert.equal(r.real.contas, 2)
  assert.equal(r.real.saldo, 60_500)
  assert.equal(r.real.comLinha, 1)
  assert.equal(r.real.pct, 5, 'a conta sem linha não pode empurrar os 5 % para cima')
})

caso('sem contas com linha de partida não há percentagem (e não é 0 %)', () => {
  const r = resumirSaldos([{ saldo: 500, saldoInicial: null, proveniencia: 'real' }])
  assert.equal(r.real.pct, null)
  assert.equal(r.simulado.contas, 0)
})

caso('contas sem saldo nenhum ficam fora da contagem', () => {
  const r = resumirSaldos([{ saldo: null, saldoInicial: 10_000, proveniencia: 'simulado' }])
  assert.equal(r.simulado.contas, 0)
  assert.equal(r.simulado.pct, null)
})

let n = 0
for (const c of casos) {
  try { c.f(); n++ } catch (e) { console.error(`✗ ${c.nome}\n  ${e instanceof Error ? e.message : e}`); process.exitCode = 1 }
}
console.log(process.exitCode ? `falharam ${casos.length - n} de ${casos.length}` : `linha-de-agua: ${n} casos, todos certos`)
