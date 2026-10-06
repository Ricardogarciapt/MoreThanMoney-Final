/**
 * O radar só mostra conteúdo fresco (06/10). Corre: npx tsx lib/instagram/radar-fresco.check.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { postFresco, RADAR_IDADE_MAX_DIAS } from './radar-frescura'

const agora = Date.parse('2026-10-06T15:00:00Z')
assert.equal(postFresco('2026-10-06T09:00:00Z', 'popular', agora), true, 'post de hoje entra')
assert.equal(postFresco('2026-09-20T09:00:00Z', 'popular', agora), false, 'post de semanas fica de fora')
assert.equal(postFresco('2026-09-20T09:00:00Z', 'fresco', agora), false, 'mesmo vindo dos recentes, com data velha fica de fora')
assert.equal(postFresco(null, 'popular', agora), false, 'popular sem data: idade desconhecida, fora')
assert.equal(postFresco(null, 'fresco', agora), true, 'recente sem data: entra')
assert.equal(RADAR_IDADE_MAX_DIAS, 3)

const raiz = join(__dirname, '../..')
assert.match(readFileSync(join(raiz, 'lib/instagram/radar.ts'), 'utf8'), /fields=[^"`]*timestamp/, 'o radar tem de pedir a data do post')
assert.match(readFileSync(join(raiz, 'app/api/admin/social/radar/route.ts'), 'utf8'), /filtroFrescoPostgrest\(\)/, 'a lista filtra por frescura')
assert.match(readFileSync(join(raiz, 'lib/instagram/fila-comentarios-servidor.ts'), 'utf8'), /filtroFrescoPostgrest\(\)/, 'a fila filtra por frescura')
console.log('radar-fresco: só posts até 3 dias, na lista e na fila ✓')
