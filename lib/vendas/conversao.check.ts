/** Guarda: `npx tsx lib/vendas/conversao.check.ts`. */
import assert from 'node:assert/strict'
import { conversaoPorOrigem, mediana, quentesSemResposta, type LinhaNegocio } from './conversao'

assert.equal(mediana([]), null)
assert.equal(mediana([3, 1, 2]), 2)
assert.equal(mediana([1, 2, 3, 4]), 2.5)

const n: LinhaNegocio[] = [
  { id: 'a', nome: 'A', origem: 'telegram', estado: 'lead', criado_em: '2026-11-17T10:00:00Z' },
  { id: 'b', nome: 'B', origem: 'telegram', estado: 'contactado', criado_em: '2026-11-17T10:00:00Z' },
  { id: 'c', nome: 'C', origem: 'telegram', estado: 'ganho', criado_em: '2026-11-17T10:00:00Z' },
  { id: 'd', nome: 'D', origem: 'whatsapp_import', estado: 'lead', criado_em: '2026-11-01T10:00:00Z' },
]
const r = conversaoPorOrigem(n, [
  { negocio_id: 'b', em: '2026-11-17T12:00:00Z' },
  { negocio_id: 'c', em: '2026-11-17T14:00:00Z' },
  { negocio_id: 'c', em: '2026-11-17T11:00:00Z' }, // o primeiro conta, não o último
])
const tg = r.find((x) => x.origem === 'telegram')!
assert.equal(tg.total, 3)
assert.equal(tg.trabalhados, 2)
assert.equal(tg.avancados, 1)
assert.equal(tg.ganhos, 1)
assert.equal(tg.pctTrabalhados, 67)
assert.equal(tg.medianaHorasContacto, 1.5)
assert.equal(r.find((x) => x.origem === 'whatsapp_import')!.medianaHorasContacto, null)

const q = quentesSemResposta(n, new Date('2026-11-17T13:00:00Z'))
assert.deepEqual(q.map((x) => x.id), ['a'], 'só o quente parado; o importado fica de fora')
assert.equal(q[0].horas, 3)
console.log('conversao: ok')
