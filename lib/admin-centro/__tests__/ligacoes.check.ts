import assert from 'node:assert/strict'
import { appDaConta, contasDaEstrategia, estrategiasDaConta, estrategiasSemFicha, ligaContaAEstrategia, type ContaLigavel, type EstrategiaLigavel } from '../ligacoes'

/**
 * A ligação conta ⇄ estratégia, lida nos dois sentidos. Cada origem escreve a estratégia à sua
 * maneira; o que interessa provar é que as três formas ligam e que nada liga por acaso.
 * Correr: npx tsx lib/admin-centro/__tests__/ligacoes.check.ts
 */
let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }

const premium: EstrategiaLigavel = { id: 'p1', slug: 'premium-ouro', nome: 'Premium Ouro', estrategiaCf: '9gsL' }
const sensei: EstrategiaLigavel = { id: 'p2', slug: 'sensei', nome: 'Sensei', estrategiaCf: 'MxsR' }
const todas = [premium, sensei]

const site: ContaLigavel = { ref: 'site:1', origem: 'site', estrategias: ['9gsL'] }
const auto: ContaLigavel = { ref: 'auto:2', origem: 'auto', estrategias: ['Premium Ouro · auto'] }
const funded: ContaLigavel = { ref: 'funded:3', origem: 'funded', estrategias: ['sensei'] }
const wt: ContaLigavel = { ref: 'wt:4', origem: 'wt', estrategias: [] }

caso('as três maneiras de escrever a mesma estratégia ligam à mesma ficha', () => {
  assert.deepEqual(estrategiasDaConta(site, todas).map((e) => e.id), ['p1'])
  assert.deepEqual(estrategiasDaConta(auto, todas).map((e) => e.id), ['p1'])
  assert.deepEqual(estrategiasDaConta(funded, todas).map((e) => e.id), ['p2'])
  assert.deepEqual(estrategiasDaConta(wt, todas), [])
})

caso('o sentido inverso dá a mesma resposta (é a mesma regra)', () => {
  assert.deepEqual(contasDaEstrategia(premium, [site, auto, funded, wt]).map((c) => c.ref), ['site:1', 'auto:2'])
  assert.deepEqual(contasDaEstrategia(sensei, [site, auto, funded, wt]).map((c) => c.ref), ['funded:3'])
})

caso('slug com outra caixa liga; o slug de outra estratégia não', () => {
  assert.equal(ligaContaAEstrategia({ ...funded, estrategias: ['SENSEI'] }, sensei), true)
  assert.equal(ligaContaAEstrategia({ ...funded, estrategias: ['sensei-x'] }, sensei), false)
})

caso('nome, slug ou CF em branco não ligam TODA a gente', () => {
  const vazia: EstrategiaLigavel = { id: 'p9', slug: '', nome: '', estrategiaCf: null }
  assert.equal(ligaContaAEstrategia(site, vazia), false)
  assert.equal(ligaContaAEstrategia(auto, vazia), false)
  // E uma conta com entradas em branco também não apanha uma estratégia real.
  assert.equal(ligaContaAEstrategia({ ref: 'site:9', origem: 'site', estrategias: ['', '  '] }, premium), false)
})

caso('uma conta pode seguir mais do que uma', () => {
  const duas: ContaLigavel = { ref: 'auto:9', origem: 'auto', estrategias: ['Premium Ouro', 'Sensei · auto'] }
  assert.deepEqual(estrategiasDaConta(duas, todas).map((e) => e.slug), ['premium-ouro', 'sensei'])
})

caso('o que não tem ficha diz-se, em vez de virar pastilha muda', () => {
  const orfa: ContaLigavel = { ref: 'site:7', origem: 'site', estrategias: ['su0a', '9gsL'] }
  assert.deepEqual(estrategiasSemFicha(orfa, todas), ['su0a'])
  assert.deepEqual(estrategiasSemFicha(site, todas), [])
})

caso('cada origem sabe dizer em que app a conta vive', () => {
  assert.equal(appDaConta('site').url, '/mtmcopy')
  assert.equal(appDaConta('auto').nome, 'MTM Auto')
  assert.equal(appDaConta('wt').url, '/webtrader')
  assert.equal(appDaConta('funded').url, '/mtmfunded')
  for (const o of ['site', 'auto', 'wt', 'funded'] as const) {
    const a = appDaConta(o)
    assert.equal(a.chave, o)
    assert.ok(a.url.startsWith('/') && a.nome && a.nota, `app ${o} completa`)
  }
})

console.log(`\n${n} casos ok — ligações do Centro`)
