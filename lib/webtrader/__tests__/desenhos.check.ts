/**
 * Desenhos no gráfico do WebTrader.
 *
 *   npx tsx lib/webtrader/__tests__/desenhos.check.ts
 */
import assert from 'node:assert/strict'
import { criarDesenho, guardarDesenhos, lerDesenhos, niveisFibo } from '../desenhos'

let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }
const memoria = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m } }

caso('cada ferramenta pede os seus cliques', () => {
  assert.equal(criarDesenho('horizontal', [{ t: 1, p: 2000 }])?.tipo, 'horizontal')
  assert.equal(criarDesenho('tendencia', [{ t: 1, p: 2000 }]), null)
  assert.equal(criarDesenho('fibo', [{ t: 1, p: 2000 }, { t: 2, p: 2100 }])?.tipo, 'fibo')
  assert.equal(criarDesenho('texto', [{ t: 1, p: 2000 }], '   '), null, 'texto vazio não se desenha')
  assert.equal((criarDesenho('texto', [{ t: 1, p: 2000 }], ' Zona ') as { texto: string }).texto, 'Zona')
})

caso('Fibonacci: 0 no fim do movimento, 1 no início, 0.5 a meio', () => {
  const f = niveisFibo(2000, 2100)
  assert.deepEqual(f.map((x) => x.nivel), [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1])
  assert.equal(f[0].preco, 2100)
  assert.equal(f[3].preco, 2050)
  assert.equal(f[6].preco, 2000)
})

caso('guarda por símbolo e ignora lixo no armazenamento', () => {
  const a = memoria()
  const h = criarDesenho('horizontal', [{ t: 1, p: 1.1 }])!
  guardarDesenhos('EURUSD', [h], a)
  assert.deepEqual(lerDesenhos('EURUSD', a), [h])
  assert.deepEqual(lerDesenhos('XAUUSD', a), [])
  a.setItem('mtm_desenhos:US30', '{nao é json')
  assert.deepEqual(lerDesenhos('US30', a), [])
  a.setItem('mtm_desenhos:GER40', JSON.stringify([{ id: 'x', tipo: 'fibo', a: { t: 1 } }, h]))
  assert.deepEqual(lerDesenhos('GER40', a), [h])
})

console.log(`\n${n} casos ok`)
