import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { caminhoSuperAdmin, eSuperAdmin, emailsSuperAdmin } from './super-admin-regras'

// Sem variável, só o dono.
assert.deepEqual(emailsSuperAdmin(''), ['ricardogarciapt@proton.me'])
assert.equal(eSuperAdmin('RicardoGarciaPT@proton.me ', ''), true)
assert.equal(eSuperAdmin('morethanmoneypt@gmail.com', ''), false, 'admin normal não é super admin')
assert.equal(eSuperAdmin(null, ''), false)
assert.equal(eSuperAdmin('a@b.pt', 'x@y.pt, A@B.pt'), true)

assert.equal(caminhoSuperAdmin('/dashboard-gestao'), true)
assert.equal(caminhoSuperAdmin('/dashboard-gestao/x'), true)
assert.equal(caminhoSuperAdmin('/admin/agentes'), true)
assert.equal(caminhoSuperAdmin('/admin/agentes-equipa'), false)
assert.equal(caminhoSuperAdmin('/mtmos'), true)
assert.equal(caminhoSuperAdmin('/mtmos/index.html'), true)
assert.equal(caminhoSuperAdmin('/api/mtmos/db'), false)
assert.equal(caminhoSuperAdmin('/admin'), false)

// As APIs destas páginas usam a guarda de super admin, não a de admin.
const RAIZ = join(__dirname, '..')
for (const f of [
  'app/api/dashboard-gestao/bookings/route.ts',
  'app/api/dashboard-gestao/chat/route.ts',
  'app/api/dashboard-gestao/metrics/route.ts',
  'app/api/admin/agentes/route.ts',
  'app/api/admin/agentes/orcamento/route.ts',
  'app/api/admin/agentes/ordens/route.ts',
  'app/api/admin/agentes/programacao/route.ts',
]) {
  const t = readFileSync(join(RAIZ, f), 'utf8')
  assert.ok(t.includes('requireSuperAdmin('), `${f} tem de usar requireSuperAdmin`)
  assert.ok(!/requireAdmin\(/.test(t), `${f} ainda usa requireAdmin`)
}
assert.ok(readFileSync(join(RAIZ, 'middleware.ts'), 'utf8').includes('caminhoSuperAdmin('), 'middleware fecha as páginas')

console.log('super-admin: verde')
