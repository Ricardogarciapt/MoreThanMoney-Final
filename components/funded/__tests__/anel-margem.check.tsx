/**
 * Anel do nível de margem (topo do SIMPLE) — cor pelos limiares, «—» sem posições, arco limitado.
 *
 *   npx tsx components/funded/__tests__/anel-margem.check.tsx
 */
import assert from 'node:assert/strict'
import { createElement, type ReactElement } from 'react'
const h = createElement as unknown as (t: unknown, p?: unknown, ...c: unknown[]) => ReactElement
import { renderToStaticMarkup } from 'react-dom/server'
import AnelMargem, { corDoNivel } from '../anel-margem'

let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }
const offset = (html: string) => Number(/stroke-dashoffset="([\d.]+)"/.exec(html)?.[1])

caso('sem posições: anel vazio, «—» e etiqueta que o diz', () => {
  const html = renderToStaticMarkup(h(AnelMargem, { nivel: null }))
  assert.match(html, />—</)
  assert.match(html, /sem posições/)
  assert.equal(corDoNivel(null), '#52525B')
})

caso('limiares: <100 vermelho, <200 ouro claro, resto ouro', () => {
  assert.equal(corDoNivel(80), '#F23645')
  assert.equal(corDoNivel(150), '#E9C46A')
  assert.equal(corDoNivel(450), '#D2A63C')
})

caso('o arco enche até 500 % e não passa disso', () => {
  const cheio = offset(renderToStaticMarkup(h(AnelMargem, { nivel: 500 })))
  const acima = offset(renderToStaticMarkup(h(AnelMargem, { nivel: 4000 })))
  const metade = offset(renderToStaticMarkup(h(AnelMargem, { nivel: 250 })))
  assert.equal(cheio, 0)
  assert.equal(acima, 0)
  assert.ok(metade > 0 && metade < offset(renderToStaticMarkup(h(AnelMargem, { nivel: 0 }))))
})

caso('níveis grandes ficam curtos («4k»), o resto é o número inteiro', () => {
  assert.match(renderToStaticMarkup(h(AnelMargem, { nivel: 4000 })), />4k</)
  assert.match(renderToStaticMarkup(h(AnelMargem, { nivel: 312.7 })), />313</)
})

console.log(`\n${n} casos ok`)
