/**
 * GUARDA: a lista por faturar escapa HTML, desconta reembolsos e o link só vale com a assinatura certa.
 *
 *   npx tsx lib/financas/por-faturar.check.ts
 */
import assert from 'node:assert/strict'
import { assinar, assinaturaValida, mensagem } from './por-faturar'

const p = { charge_id: 'ch_1', data: '2026-11-16', valor: 65, reembolsado: 15, moeda: 'EUR', cliente_nome: 'Ana <b>', cliente_email: 'a@x.pt', pais: 'PT', produto: 'Premium' }
const m = mensagem([p], 'https://x.pt', 's')
assert.ok(m.includes('50,00 EUR'))
assert.ok(m.includes('Ana &lt;b&gt;'))
assert.ok(m.includes(`t=${assinar('ch_1', 's')}`))
assert.equal(mensagem([], 'https://x.pt', 's'), '')
assert.ok(assinaturaValida('ch_1', assinar('ch_1', 's'), 's'))
assert.ok(!assinaturaValida('ch_2', assinar('ch_1', 's'), 's'))
assert.ok(!assinaturaValida('ch_1', 'curto', 's'))
console.log('✓ por-faturar: 7 verificações')
