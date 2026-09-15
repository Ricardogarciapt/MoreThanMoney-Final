/**
 * As rotas do admin «MTM Auto · Cópia» são SÓ para administradores.
 *
 *  1. `soAdmin` nega (403) antes de correr o handler: não-admin, admin sem id, verificador a rebentar.
 *  2. Todas as rotas em app/api/admin/mtmauto-copia exportam APENAS handlers embrulhados em soAdmin
 *     (uma rota nova esquecida sem guarda falha aqui).
 *  3. A rota do cliente /api/contas/copia exige sessão (Bearer) e só cria PEDIDOS do próprio.
 *
 *   npx tsx lib/copia-contas/__tests__/admin-auth.check.ts
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { soAdmin, type Verificador } from '../servidor/guarda'

async function main() {
  let chamadas = 0
  const handler = async (adminId: string) => { chamadas++; return new Response(JSON.stringify({ adminId }), { status: 200 }) }

  const casos: [string, Verificador, number][] = [
    ['não autenticado', async () => ({ isAdmin: false, error: 'Não autenticado' }), 403],
    ['membro normal', async () => ({ isAdmin: false, userId: 'u1' }), 403],
    ['admin sem id', async () => ({ isAdmin: true }), 403],
    ['verificador rebenta', async () => { throw new Error('supabase em baixo') }, 403],
  ]
  for (const [nome, v, status] of casos) {
    const r = await soAdmin(handler, v)()
    assert.equal(r.status, status, nome)
  }
  assert.equal(chamadas, 0, 'o handler nunca corre sem admin')

  const ok = await soAdmin(handler, async () => ({ isAdmin: true, userId: 'admin-1' }))()
  assert.equal(ok.status, 200)
  assert.deepEqual(await ok.json(), { adminId: 'admin-1' })
  assert.equal(chamadas, 1)

  const rebenta = await soAdmin(async () => { throw new Error('x') }, async () => ({ isAdmin: true, userId: 'a' }))()
  assert.equal(rebenta.status, 500, 'erro no handler vira 500 JSON, não crash')

  // ── 2. varrer as rotas ──
  const raiz = join(process.cwd(), 'app/api/admin/mtmauto-copia')
  const rotas: string[] = []
  const andar = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f)
      if (statSync(p).isDirectory()) andar(p)
      else if (f === 'route.ts') rotas.push(p)
    }
  }
  andar(raiz)
  assert.ok(rotas.length >= 8, `esperava ≥8 rotas, há ${rotas.length}`)
  for (const p of rotas) {
    const src = readFileSync(p, 'utf8')
    const metodos = [...src.matchAll(/export\s+(?:async\s+function|const|function)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1])
    assert.ok(metodos.length > 0, `${p}: sem handlers`)
    const guardados = [...src.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=\s*soAdmin\(/g)].map((m) => m[1])
    assert.deepEqual(guardados.sort(), metodos.sort(), `${p}: há handlers sem soAdmin`)
  }

  // ── 3. rota do cliente ──
  const cliente = readFileSync(join(process.cwd(), 'app/api/contas/copia/route.ts'), 'utf8')
  assert.match(cliente, /status: 401/)
  assert.match(cliente, /pedidoPeloCliente: true/)
  assert.match(cliente, /exigirDono: user\.id/)
  assert.doesNotMatch(cliente, /acao|ativa:\s*true|modo:\s*'live'/, 'o cliente não liga rotas nem pede live')

  console.log(`admin-auth: ${rotas.length} rotas guardadas, todos certos`)
}

void main().catch((e) => { console.error('✗', e instanceof Error ? e.message : e); process.exit(1) })
