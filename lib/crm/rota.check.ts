import assert from 'node:assert/strict'
import { POST } from '../../app/api/leads/route'

async function main() {
  // Só caminhos que terminam antes de aceder à base; não usa credenciais reais.
  const original = process.env.AUTOMATION_SECRET_KEY
  const teste = 's'.repeat(32)
  function pedido(body = '{}', secret?: string, evento?: string) {
    return new Request('https://example.test/api/leads', { method: 'POST', body,
      headers: { ...(secret ? { 'x-mtm-secret': secret } : {}), ...(evento ? { 'idempotency-key': evento } : {}) } })
  }
  try {
    delete process.env.AUTOMATION_SECRET_KEY
    assert.equal((await POST(pedido())).status, 503)
    process.env.AUTOMATION_SECRET_KEY = teste
    assert.equal((await POST(pedido())).status, 403)
    assert.equal((await POST(pedido('{}', 'incorrect'))).status, 403)
    assert.equal((await POST(pedido('{}', teste))).status, 400)
    assert.equal((await POST(pedido('{bad', teste, 'event-1'))).status, 400)
    assert.equal((await POST(pedido('{}', teste, 'event-1'))).status, 400)
    assert.equal((await POST(pedido('x'.repeat(32769), teste, 'event-1'))).status, 413)
    console.log('CRM: rota HTTP recusa pedidos não autenticados, inválidos e demasiado grandes OK')
  } finally {
    if (original === undefined) delete process.env.AUTOMATION_SECRET_KEY
    else process.env.AUTOMATION_SECRET_KEY = original
  }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
