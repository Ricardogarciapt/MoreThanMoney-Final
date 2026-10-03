import assert from 'node:assert/strict'
import { comTecto } from './com-tecto'

const adiar = <T>(ms: number, v: T) => new Promise<T>((r) => setTimeout(() => r(v), ms))

async function correr() {
  // Responde a tempo: vale a resposta, nunca o recuo.
  assert.equal(await comTecto(adiar(5, 'real'), 'recuo', 200), 'real')

  // Não responde a tempo: vale o recuo, e NÃO se espera pela promessa lenta.
  const antes = Date.now()
  assert.equal(await comTecto(adiar(5_000, 'real'), 'recuo', 50), 'recuo')
  assert.ok(Date.now() - antes < 1_000, 'o tecto tem de devolver sem esperar pela promessa lenta')

  // Uma promessa rejeitada continua a rejeitar: o tecto não engole erros, só limita a espera.
  // Quem quiser tratar a falha como recuo põe `.catch()` ANTES de chamar — explicitamente.
  await assert.rejects(() => comTecto(Promise.reject(new Error('falhou')), 'recuo', 200))

  // `0` e `false` são valores de recuo legítimos e não podem ser confundidos com «sem recuo».
  assert.equal(await comTecto(adiar(5_000, 1), 0, 20), 0)
  assert.equal(await comTecto(adiar(5_000, true), false, 20), false)

  console.log('com-tecto: OK')
}

correr()
