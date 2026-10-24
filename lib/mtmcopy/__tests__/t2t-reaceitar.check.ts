/**
 * REACEITAR UM T2T QUE NUNCA CHEGOU À CORRETORA — app/api/mtmcopy/tap-to-trade/route.ts.
 *
 * Correr: npx tsx lib/mtmcopy/__tests__/t2t-reaceitar.check.ts
 *
 * A rota não se exercita aqui (precisa de base e corretora); prova-se o contrato no código:
 *   1. com o mercado fechado, a reserva deixa de ficar `pending` (passa a `error` com `T2T:`);
 *   2. só se retoma uma reserva `error`/`skipped` com detalhe `T2T…` e sem posição;
 *   3. a retoma é condicional ao estado lido (dois toques ao mesmo tempo → só um retoma);
 *   4. falhas da corretora («Tap to Trade… falhou») não começam por `T2T`, logo continuam a bloquear.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const rota = readFileSync(join(__dirname, '..', '..', '..', 'app/api/mtmcopy/tap-to-trade/route.ts'), 'utf8')
assert.match(rota, /status: 'error', detail: `T2T: mercado fechado/, 'mercado fechado liberta a reserva')
assert.match(rota, /!antiga\.broker_position_id && \(antiga\.status === 'error' \|\| antiga\.status === 'skipped'\) && \/\^T2T\\b\//, 'só reservas sem ordem')
assert.match(rota, /\.eq\('id', antiga!\.id\)\.eq\('status', antiga!\.status\)/, 'retoma condicional')
assert.match(rota, /`Tap to Trade\$\{plataforma\} falhou:/, 'falha da corretora tem outro prefixo')
assert.ok(!/^T2T\b/.test('Tap to Trade falhou: timeout'))
console.log('✓ t2t-reaceitar: só se volta a aceitar o que nunca chegou à corretora')
