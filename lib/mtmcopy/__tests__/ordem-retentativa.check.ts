import assert from 'node:assert/strict'
import { falhaTransitoria } from '../processor'

// Um timeout/erro de rede não prova que a ordem não foi — merece confirmação + 2ª tentativa.
for (const erro of [
  'Timeout 20000ms ao colocar ordem (PREM XAUUSD buy) — MetaAPI não respondeu',
  'Sem resposta MetaAPI',
  'fetch failed',
  'ECONNRESET',
  'socket hang up',
  '503 Service Unavailable',
]) {
  assert.equal(falhaTransitoria(erro), true, `devia ser transitória: ${erro}`)
}

// Recusas do broker são definitivas: repetir só dá o mesmo erro (ou pior, uma trade a mais).
for (const erro of [
  'There is not enough money to complete the request',
  'Invalid stops',
  'Market is closed',
  'TRADE_RETCODE_INVALID_VOLUME',
  undefined,
]) {
  assert.equal(falhaTransitoria(erro), false, `NÃO devia ser transitória: ${erro}`)
}

console.log('✓ ordem-retentativa: 11 verificações')
