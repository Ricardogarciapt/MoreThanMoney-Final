/**
 * Guarda das demos B2B diárias. Correr: npx tsx lib/site-solucoes/demos-diarias.check.ts
 * A rotina «B2B · Demo do dia» corre isto antes de cada merge.
 */
import assert from 'node:assert/strict'
import { DEMOS_DIARIAS, demoDoDia, demoPorSlug, demosPublicadas, diasEmFila, hojeLisboa } from './demos-diarias'
import { SEGMENTOS } from '@/lib/b2b/sequencias'

const slugs = new Set<string>()
const datas = new Set<string>()
for (const d of DEMOS_DIARIAS) {
  assert.match(d.slug, /^[a-z0-9-]+$/, `slug ${d.slug}`)
  assert.ok(!slugs.has(d.slug), `slug repetido ${d.slug}`)
  slugs.add(d.slug)
  assert.match(d.data, /^\d{4}-\d{2}-\d{2}$/, `data ${d.slug}`)
  assert.ok(!datas.has(d.data), `duas demos no mesmo dia: ${d.data}`)
  datas.add(d.data)
  assert.ok(d.roteiro.length >= 3 && d.roteiro.length <= 7, `roteiro ${d.slug}`)
  assert.ok(d.fica.length >= 2 && d.pecas.length >= 1 && d.segmentos.length >= 1, d.slug)
  for (const s of d.segmentos) assert.ok(SEGMENTOS.includes(s), `segmento ${s}`)
  // Sem números de resultado inventados (percentagens, «x horas poupadas», euros ganhos).
  const tudo = [d.titulo, d.promessa, d.dor, ...d.fica, ...d.roteiro.map((p) => p.texto)].join(' ')
  assert.ok(!/\d+\s*%|poup\w*\s+\d|\d+\s*h(oras)?\s+por|\d+\s*€/i.test(tudo.replace(/1% da conta/g, '')), `número de resultado em ${d.slug}`)
  // Nunca apresentar como cliente real.
  assert.ok(!/cliente nosso|caso real|já usa(m)? (isto|a mtm)/i.test(tudo), `parece caso de cliente: ${d.slug}`)
}

assert.equal(demosPublicadas('2026-11-16').length, 0)
assert.equal(demoDoDia('2026-11-17')?.slug, 'crm-por-voz')
assert.equal(demoDoDia('2026-11-19')?.slug, 'marcacoes-whatsapp')
assert.equal(demoDoDia('2026-11-19', 'parceria_redes')?.slug, 'reuniao-com-resumo')
assert.equal(demoDoDia('2026-11-19', 'licenca_scanners'), null)
assert.equal(demoPorSlug('mentor-ia-comunidade', '2026-11-17'), null, 'futura não se vê')
assert.equal(hojeLisboa(new Date('2026-11-17T23:30:00Z')), '2026-11-17')
assert.equal(hojeLisboa(new Date('2026-07-17T23:30:00Z')), '2026-07-18', 'hora de verão')

const fila = diasEmFila()
console.log(`site-solucoes/demos-diarias: ok · ${DEMOS_DIARIAS.length} demos · ${fila} em fila depois de hoje`)
