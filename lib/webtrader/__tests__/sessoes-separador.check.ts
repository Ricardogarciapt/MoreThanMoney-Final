import assert from 'node:assert/strict'
import { armazemDeSessoes, sessoesValidas } from '../sessoes-separador'

/** Sessões do separador (MTM Funded e TradeLocker). Correr: npx tsx lib/webtrader/__tests__/sessoes-separador.check.ts */
const agora = Date.parse('2026-09-18T12:00:00Z')
const ok = { expira: '2026-09-18T13:00:00Z', accountId: 'a' }
const velha = { expira: '2026-09-18T11:00:00Z', accountId: 'b' }
assert.deepEqual(sessoesValidas({ a: ok, b: velha }, agora), { a: ok }, 'as expiradas saem')
assert.deepEqual(sessoesValidas(null, agora), {})
assert.deepEqual(sessoesValidas([ok], agora), {})
assert.deepEqual(sessoesValidas({ x: null, y: { expira: 'lixo' } }, agora), {})

// Sem sessionStorage (servidor, modo privado): ler dá {}, guardar/apagar não rebentam.
const a = armazemDeSessoes<{ expira: string; accountId: string }>('k', (s) => s.accountId)
assert.deepEqual(a.ler(), {})
a.guardar(ok)
a.apagar('a')

// Com um sessionStorage de mentira: guarda por id, lê só as válidas, apaga.
const mem = new Map<string, string>()
;(globalThis as { sessionStorage?: unknown }).sessionStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
const futuro = { expira: new Date(Date.now() + 3600_000).toISOString(), accountId: 'c' }
a.guardar(futuro)
assert.deepEqual(Object.keys(a.ler()), ['c'])
a.apagar('c')
assert.deepEqual(a.ler(), {})
console.log('  ok  sessões do separador: expiradas saem, sem storage não rebenta, guardar/apagar por id')
