/**
 * ESCONDER UMA ESTRATÉGIA — as guardas que impedem que se esconda uma coisa que está a mexer
 * dinheiro, ou que tem posições abertas que ficariam sem quem as visse.
 *
 *   npx tsx lib/estrategias-admin/__tests__/apagar.check.ts
 */
import assert from 'node:assert/strict'
import { confirmacaoDeApagar, podeApagarEstrategia, type EstadoParaApagar } from '../apagar'

const casos: { nome: string; f: () => void }[] = []
const caso = (nome: string, f: () => void) => casos.push({ nome, f })

const estado = (over: Partial<EstadoParaApagar> = {}): EstadoParaApagar => ({
  slug: 'mtm-auto-king', apagada: false, abertas: 0, rotasLive: 0, subscritores: 0, modoMotor: 'sombra', ...over,
})

caso('uma estratégia parada, sem abertas e sem quem a siga, esconde-se', () => {
  const v = podeApagarEstrategia(estado())
  assert.equal(v.ok, true)
  assert.ok(v.ok && v.aviso, 'tem de explicar que o histórico fica')
  assert.match(v.ok ? v.aviso! : '', /apagado_em/)
})

caso('NÃO se esconde o que o motor executa em live — esconder não para a execução', () => {
  const v = podeApagarEstrategia(estado({ rotasLive: 3 }))
  assert.equal(v.ok, false)
  assert.equal(v.ok === false && v.motivo, 'executa-em-live')
  assert.match(v.ok === false ? v.mensagem : '', /sombra/)
})

caso('o modo do motor em live chega para recusar, mesmo sem rotas contadas', () => {
  const v = podeApagarEstrategia(estado({ rotasLive: 0, modoMotor: 'live' }))
  assert.equal(v.ok === false && v.motivo, 'executa-em-live')
})

caso('live vem ANTES de abertas: é a recusa mais grave', () => {
  const v = podeApagarEstrategia(estado({ rotasLive: 1, abertas: 9, subscritores: 4 }))
  assert.equal(v.ok === false && v.motivo, 'executa-em-live')
})

caso('NÃO se esconde o que tem posições abertas', () => {
  const v = podeApagarEstrategia(estado({ abertas: 2 }))
  assert.equal(v.ok === false && v.motivo, 'posicoes-abertas')
  assert.match(v.ok === false ? v.mensagem : '', /2 posição/)
})

caso('NÃO se esconde o que os clientes ainda seguem', () => {
  const v = podeApagarEstrategia(estado({ subscritores: 5 }))
  assert.equal(v.ok === false && v.motivo, 'tem-subscritores')
  assert.match(v.ok === false ? v.mensagem : '', /5 conta/)
})

caso('esconder duas vezes é recusado (e não é um erro do sistema)', () => {
  const v = podeApagarEstrategia(estado({ apagada: true }))
  assert.equal(v.ok === false && v.motivo, 'ja-apagada')
})

caso('uma estratégia sem mestre nossa (modoMotor null) também se esconde', () => {
  assert.equal(podeApagarEstrategia(estado({ modoMotor: null })).ok, true)
})

caso('a confirmação é o slug em maiúsculas — quem a escreve leu qual é', () => {
  assert.equal(confirmacaoDeApagar('mtm-auto-king'), 'MTM-AUTO-KING')
})

let n = 0
for (const c of casos) {
  try { c.f(); n++ } catch (e) { console.error(`✗ ${c.nome}\n  ${e instanceof Error ? e.message : e}`); process.exitCode = 1 }
}
console.log(process.exitCode ? `falharam ${casos.length - n} de ${casos.length}` : `apagar-estrategia: ${n} casos, todos certos`)
