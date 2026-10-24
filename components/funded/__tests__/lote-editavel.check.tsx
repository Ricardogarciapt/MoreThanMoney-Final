/**
 * Lote escrito à mão na barra VENDER | lotes | COMPRAR do SIMPLE.
 *
 *   npx tsx components/funded/__tests__/lote-editavel.check.tsx
 */
import assert from 'node:assert/strict'
import { createElement, type ReactElement } from 'react'
const h = createElement as unknown as (t: unknown, p?: unknown, ...c: unknown[]) => ReactElement
import { renderToStaticMarkup } from 'react-dom/server'
import LoteEditavel, { lerLote } from '../lote-editavel'

let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }

caso('lê ponto e vírgula, e recusa lixo, zero e negativos', () => {
  assert.equal(lerLote('0.05'), 0.05)
  assert.equal(lerLote('0,25'), 0.25)
  assert.equal(lerLote(' 1 '), 1)
  assert.equal(lerLote('2.'), 2)
  assert.equal(lerLote('.5'), 0.5)
  for (const x of ['', 'abc', '0', '-1', '1,2,3', '1e3']) assert.equal(lerLote(x), null, x)
})

caso('o campo é escrevível, com teclado numérico e etiqueta própria', () => {
  const html = renderToStaticMarkup(h(LoteEditavel, { volume: 0.01, passo: 0.01, simbolo: 'XAUUSD', normalizar: (v: number) => v, onMudar: () => {} }))
  assert.match(html, /<input[^>]*inputMode="decimal"/)
  assert.match(html, /value="0.01"/)
  assert.match(html, /aria-label="volume em lotes de XAUUSD"/)
  assert.match(html, /menos volume/)
  assert.match(html, /mais volume/)
})

console.log(`\n${n} casos ok`)
