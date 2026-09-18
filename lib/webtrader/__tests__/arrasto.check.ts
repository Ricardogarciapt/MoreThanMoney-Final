import assert from 'node:assert/strict'
import {
  LIMIAR_FECHO_PX, MINIMO_SACUDIR_PX, VELOCIDADE_FECHO, conteudoPodeArrastar, deveFecharArrasto, juntarAmostra, velocidadeFinal,
} from '../arrasto'

/**
 * As contas do arrasto das folhas e da gaveta do WebTrader (components/funded/use-arrasto.ts).
 * Correr: npx tsx lib/webtrader/__tests__/arrasto.check.ts
 */
let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }

caso('fecha a partir de ~80 px para baixo, devagar ou não', () => {
  assert.equal(LIMIAR_FECHO_PX, 80)
  assert.equal(deveFecharArrasto(80, 0), true)
  assert.equal(deveFecharArrasto(200, 0), true)
  assert.equal(deveFecharArrasto(79, 0), false)
})

caso('um sacudir rápido fecha antes do limiar, mas um tremor não', () => {
  assert.equal(deveFecharArrasto(30, VELOCIDADE_FECHO), true)
  assert.equal(deveFecharArrasto(30, 2), true)
  assert.equal(deveFecharArrasto(MINIMO_SACUDIR_PX - 1, 5), false, 'andou pouco: é um toque trémulo')
  assert.equal(deveFecharArrasto(30, VELOCIDADE_FECHO - 0.01), false)
})

caso('para cima (ou nada) nunca fecha; valores estranhos não rebentam', () => {
  assert.equal(deveFecharArrasto(-200, -3), false)
  assert.equal(deveFecharArrasto(0, 9), false)
  assert.equal(deveFecharArrasto(Number.NaN, 1), false)
  assert.equal(deveFecharArrasto(40, Number.NaN), false)
  assert.equal(deveFecharArrasto(Number.POSITIVE_INFINITY, 0), false)
})

caso('velocidade: só a janela final conta; sem amostras é 0', () => {
  assert.equal(velocidadeFinal([]), 0)
  assert.equal(velocidadeFinal([{ y: 10, t: 5 }]), 0)
  assert.equal(velocidadeFinal([{ y: 0, t: 0 }, { y: 0, t: 0 }]), 0, 'dt 0 não dá Infinity')
  // Parado 1 s e depois 60 px em 60 ms: a velocidade é a do fim (1 px/ms), não a média.
  const a = [{ y: 0, t: 0 }, { y: 0, t: 1000 }, { y: 30, t: 1030 }, { y: 60, t: 1060 }]
  assert.equal(velocidadeFinal(a), 60 / 60)
  // Para cima dá negativa.
  assert.ok(velocidadeFinal([{ y: 100, t: 0 }, { y: 40, t: 50 }]) < 0)
})

caso('juntarAmostra guarda só as últimas', () => {
  let a: Array<{ y: number; t: number }> = []
  for (let i = 0; i < 20; i++) a = juntarAmostra(a, { y: i, t: i })
  assert.equal(a.length, 8)
  assert.deepEqual(a[a.length - 1], { y: 19, t: 19 })
  const b = [{ y: 1, t: 1 }]
  juntarAmostra(b, { y: 2, t: 2 })
  assert.equal(b.length, 1, 'não muda o array de quem chama')
})

caso('conteúdo com scroll: só arrasta a folha no topo, para baixo e na vertical', () => {
  assert.equal(conteudoPodeArrastar(0, 2, 20), true)
  assert.equal(conteudoPodeArrastar(12, 0, 20), false, 'a meio da lista é scroll')
  assert.equal(conteudoPodeArrastar(0, 0, -20), false, 'para cima é scroll')
  assert.equal(conteudoPodeArrastar(0, 30, 10), false, 'na horizontal (separadores deslizáveis) não')
  assert.equal(conteudoPodeArrastar(-4, 0, 10), true, 'o bounce do iOS (scrollTop negativo) conta como topo')
})

console.log(`\n${n} verificações OK`)
