/**
 * DEDUPLICAÇÃO POR ESTRATÉGIA (decisão do dono, 07/10/2026): o mesmo sinal em duas estratégias na
 * mesma conta dá DUAS execuções; o mesmo sinal repetido na mesma estratégia dá UMA.
 *
 *   npx tsx lib/sinais/__tests__/duplicado-por-estrategia.check.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ambitoDoDuplicado, decidirDuplicado, impressaoNoAmbito, type PonteAberta } from '../../mtmfunded/estrategias-sinais/calculo'
import { conflitoEntreCaminhos, impressaoParaConta } from '../../mestres/dedupe'

let n = 0
const caso = (nome: string, f: () => void) => { try { f(); n++ } catch (e) { console.error(`✗ ${nome}`); throw e } }
const agora = Date.parse('2026-10-07T10:00:00Z')
const base = 'XAUUSD:sell:4133:2026-10-07T10'

function ponte(estrategia: string, fonte: string, chave: string): PonteAberta {
  const ambito = ambitoDoDuplicado(estrategia, fonte)
  return { chave, ambito, impressao: impressaoNoAmbito(base, ambito), symbol: 'XAUUSD', direcao: 'sell', entrada: 4132.73, fonte, criadaEm: agora - 60_000 }
}
const pedido = (estrategia: string, fonte: string, chave: string) => {
  const ambito = ambitoDoDuplicado(estrategia, fonte)
  return { chave, ambito, impressao: impressaoNoAmbito(base, ambito), symbol: 'XAUUSD', direcao: 'sell' as const, entrada: 4132.8, agora }
}

caso('conta SIM: o mesmo sinal em duas estratégias → duas execuções', () => {
  const abertas = [ponte('sensei', 'sensei', 'sensei:msg:tv:a')]
  assert.equal(decidirDuplicado(pedido('Goldkiller', 'Goldkiller', 'Goldkiller:msg:tv:b'), abertas).abrir, true)
})
caso('conta SIM: o mesmo sinal repetido na mesma estratégia → uma', () => {
  const abertas = [ponte('sensei', 'sensei', 'sensei:msg:tv:a')]
  assert.equal(decidirDuplicado(pedido('sensei', 'sensei', 'sensei:msg:tv:a'), abertas).abrir, false, 'mesma chave')
  const r = decidirDuplicado(pedido('sensei', 'sensei', 'sensei:msg:tv:reenvio'), abertas)
  assert.equal(r.abrir, false, 'chave nova, mesmo trade da mesma estratégia')
})
caso('«Todos os sinais»: âmbito = fonte; duas fontes → duas, a mesma fonte → uma', () => {
  const abertas = [ponte('todos', 'Premium', 'chat:1')]
  assert.equal(decidirDuplicado(pedido('todos', 'Scanner Sensei', 'chat:2'), abertas).abrir, true)
  assert.equal(decidirDuplicado(pedido('todos', 'Premium', 'chat:3'), abertas).abrir, false)
})
caso('pontes antigas (impressão sem âmbito) continuam a contar dentro da mesma estratégia', () => {
  const antiga: PonteAberta = { ...ponte('sensei', 'sensei', 'sensei:msg:tv:a'), impressao: base, criadaEm: agora - 2 * 3600_000 }
  assert.equal(decidirDuplicado(pedido('sensei', 'sensei', 'sensei:msg:tv:z'), [antiga]).abrir, false)
  assert.equal(decidirDuplicado(pedido('Goldkiller', 'Goldkiller', 'gk:z'), [antiga]).abrir, true)
})
caso('motor das mestres: impressão com a estratégia (mestres_execucoes_conta)', () => {
  const a = impressaoParaConta({ symbol: 'XAUUSD', direcao: 'sell', entrada: 4132.73, em: agora, estrategia: 'sensei' })
  const b = impressaoParaConta({ symbol: 'XAUUSD', direcao: 'sell', entrada: 4132.73, em: agora, estrategia: 'Goldkiller' })
  const a2 = impressaoParaConta({ symbol: 'XAUUSD', direcao: 'sell', entrada: 4132.9, em: agora + 60_000, estrategia: 'SENSEI' })
  assert.notEqual(a, b, 'duas estratégias = duas chaves = duas execuções')
  assert.equal(a, a2, 'a mesma estratégia repetida = a mesma chave = uma execução')
})
caso('conflito entre caminhos: outra estratégia não bloqueia; a mesma ou desconhecida bloqueia', () => {
  const rec = [{ symbol: 'XAUUSD', direcao: 'sell' as const, entrada: 4132.73, em: agora - 60_000, origem: 'T2T', estrategia: 'sensei' }]
  assert.equal(conflitoEntreCaminhos({ symbol: 'XAUUSD', direcao: 'sell', entrada: 4132.8, agora, estrategia: 'Goldkiller' }, rec), null)
  assert.ok(conflitoEntreCaminhos({ symbol: 'XAUUSD', direcao: 'sell', entrada: 4132.8, agora, estrategia: 'sensei' }, rec))
  assert.ok(conflitoEntreCaminhos({ symbol: 'XAUUSD', direcao: 'sell', entrada: 4132.8, agora, estrategia: 'Goldkiller' }, [{ ...rec[0], estrategia: null }]), 'desconhecida = lado seguro')
})
caso('o código usa o âmbito (guarda estática)', () => {
  const raiz = join(__dirname, '..', '..', '..')
  const abrir = readFileSync(join(raiz, 'lib/mtmfunded/estrategias-sinais/abrir.ts'), 'utf8')
  assert.match(abrir, /ambitoDoDuplicado\(p\.estrategia, p\.fonte\)/)
  assert.match(abrir, /impressao: p\.cfg\.permitirDuplicado \? null : impressao,/)
  const g = readFileSync(join(raiz, 'lib/mestres/servidor/ganchos.ts'), 'utf8')
  assert.match(g, /impressaoParaConta\(\{[^}]*estrategia: est\?\.slug/)
})
console.log(`duplicado-por-estrategia: ${n} casos OK`)
