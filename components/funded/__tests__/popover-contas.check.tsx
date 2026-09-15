/**
 * Seletor de contas do WebTrader — o popover não cobre nem fica cortado pelas métricas.
 *
 *   npx tsx components/funded/__tests__/popover-contas.check.tsx
 */
import assert from 'node:assert/strict'
import { createElement, type ReactElement } from 'react'
const h = createElement as unknown as (t: unknown, p?: unknown, ...c: unknown[]) => ReactElement
import { renderToStaticMarkup } from 'react-dom/server'
import { CaixaPopover, LARGURA_POPOVER, Z_POPOVER, posicaoDoPopover } from '../popover-contas'

let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }
const ecra = { largura: 1440, altura: 900 }
// O botão do seletor na barra do WebTrader (topo à esquerda, ~28 px de altura).
const botao = { top: 6, bottom: 34, left: 40, right: 260 }

caso('desktop: abre por baixo do botão, dentro do ecrã, com altura limitada', () => {
  const p = posicaoDoPopover(botao, ecra)
  assert.equal(p.modo, 'ancorado')
  if (p.modo !== 'ancorado') return
  assert.equal(p.acima, false)
  assert.equal(p.top, 38)
  assert.equal(p.left, 40)
  assert.equal(p.largura, LARGURA_POPOVER)
  assert.ok(p.top + p.alturaMax <= ecra.altura, 'não passa do fundo do ecrã')
})

caso('âncora encostada à direita: a caixa encolhe para dentro, nunca sai do ecrã', () => {
  const p = posicaoDoPopover({ top: 6, bottom: 34, left: 1300, right: 1420 }, ecra)
  if (p.modo !== 'ancorado') throw new Error('devia ser ancorado')
  assert.ok(p.left + p.largura <= ecra.largura - 8)
  assert.ok(p.left >= 8)
})

caso('âncora no fundo sem espaço: abre para CIMA', () => {
  const p = posicaoDoPopover({ top: 820, bottom: 850, left: 100, right: 300 }, ecra)
  if (p.modo !== 'ancorado') throw new Error('devia ser ancorado')
  assert.equal(p.acima, true)
  assert.ok(p.top >= 8 && p.top + p.alturaMax <= 820)
})

caso('telemóvel (< 640 px): folha de baixo, não uma caixa a flutuar sobre as métricas', () => {
  assert.deepEqual(posicaoDoPopover(botao, { largura: 390, altura: 844 }), { modo: 'folha' })
})

caso('render ancorado: fixed, z-index acima das folhas (900) e avisos (1002), com as contas lá dentro', () => {
  const pos = posicaoDoPopover(botao, ecra)
  const html = renderToStaticMarkup(h(CaixaPopover, { pos, titulo: 'Escolher conta', onFechar: () => undefined },
    h('div', { role: 'listbox' }, h('button', { role: 'option' }, 'F1 Active 10 014,95 $'), h('button', null, 'Entrar com credenciais'))))
  assert.ok(Z_POPOVER > 1002)
  assert.match(html, /data-popover-contas="ancorado"/)
  assert.match(html, /class="fixed /)
  assert.match(html, new RegExp(`z-index:${Z_POPOVER}`))
  assert.match(html, /top:38px/)
  assert.match(html, /max-height:\d+px/)
  assert.match(html, /overflow-y-auto/)
  assert.ok(!/absolute/.test(html), 'nada de absolute dentro da barra')
  assert.match(html, /role="listbox"/)
  assert.match(html, /F1 Active 10 014,95 \$/)
})

caso('render folha: fundo escurecido e diálogo modal', () => {
  const html = renderToStaticMarkup(h(CaixaPopover, { pos: { modo: 'folha' }, titulo: 'Escolher conta', onFechar: () => undefined }, h('p', null, 'x')))
  assert.match(html, /data-popover-contas="folha"/)
  assert.match(html, /aria-modal="true"/)
  assert.match(html, /bg-black\/60/)
})

console.log(`\n${n} verificações OK`)
