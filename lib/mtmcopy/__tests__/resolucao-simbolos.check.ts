/**
 * Resolução automática de símbolos: quem manda, o que se guarda, e quando se RECUSA a adivinhar.
 *
 *   npx tsx lib/mtmcopy/__tests__/resolucao-simbolos.check.ts
 */
import assert from 'node:assert/strict'
import { resolverSimboloDestino, empateIndecidivel } from '../resolucao-simbolos'
import { rankedBrokerSymbolsComChave, rankedBrokerSymbols } from '../symbol-resolver'

// ── o ranking com chave continua a dar a mesma ordem que o de sempre ─────────────────────────
{
  const lista = ['EURUSD-STD', 'XAUUSD-STD', 'XAUUSD.crp', 'US30-STD']
  assert.deepEqual(rankedBrokerSymbolsComChave('XAUUSD', lista).map((r) => r.sym), rankedBrokerSymbols('XAUUSD', lista))
}

// ── 1) o mapa manual manda, mesmo contra o catálogo ─────────────────────────────────────────
{
  const r = resolverSimboloDestino('XAUUSD', { mapaManual: { XAUUSD: 'GOLD' }, simbolosDestino: ['XAUUSD.r', 'GOLD'] })
  assert.equal(r.via, 'mapa')
  assert.equal(r.simbolo, 'GOLD')
  assert.equal(r.guardar, undefined, 'a decisão humana não se «guarda» como se fosse nossa')
}
{
  // Minúsculas na chave do mapa não escapam à decisão humana.
  assert.equal(resolverSimboloDestino('XAUUSD', { mapaManual: { xauusd: 'GOLD.x' }, simbolosDestino: ['XAUUSD'] }).simbolo, 'GOLD.x')
}

// ── 2) a resolução automática do caso normal (sufixo da corretora) ──────────────────────────
for (const [sufixo, esperado] of [['.r', 'XAUUSD.r'], ['m', 'XAUUSDm'], ['_i', 'XAUUSD_i'], ['-VIP', 'XAUUSD-VIP']] as const) {
  const lista = [`EURUSD${sufixo}`, `XAUUSD${sufixo}`, `US30${sufixo}`]
  const r = resolverSimboloDestino('XAUUSD', { simbolosDestino: lista })
  assert.equal(r.via, 'automatico', `sufixo ${sufixo}`)
  assert.equal(r.simbolo, esperado)
  assert.equal(r.guardar, true, 'o que se resolveu sozinho guarda-se, para não voltar a perguntar')
}

// ── 3) o que já foi guardado ganha à resolução nova (a escolha não pode andar a mudar) ──────
{
  const lista = ['XAUUSD-STD', 'XAUUSD.s']
  const r = resolverSimboloDestino('XAUUSD', { guardadas: { XAUUSD: 'XAUUSD.s' }, simbolosDestino: lista })
  assert.equal(r.via, 'guardado')
  assert.equal(r.simbolo, 'XAUUSD.s')
}
{
  // ...mas só enquanto o símbolo guardado ainda existir na conta.
  const r = resolverSimboloDestino('XAUUSD', { guardadas: { XAUUSD: 'XAUUSD.antigo' }, simbolosDestino: ['XAUUSD.r', 'EURUSD.r'] })
  assert.equal(r.via, 'automatico')
  assert.equal(r.simbolo, 'XAUUSD.r')
}

// ── 4) A RECUSA — dois candidatos igualmente prováveis não se desempatam à sorte ─────────────
{
  // Mesmo core, sufixos diferentes, cada um aparece uma vez, grafias do mesmo tamanho: empate.
  const r = resolverSimboloDestino('XAUUSD', { simbolosDestino: ['XAUUSD.r', 'XAUUSD.x'] })
  assert.equal(r.via, 'ambiguo')
  assert.equal(r.simbolo, null, 'ambíguo NÃO devolve símbolo — senão alguém abria a ordem na mesma')
  assert.deepEqual(r.empatados?.sort(), ['XAUUSD.r', 'XAUUSD.x'])
  assert.match(String(r.motivo), /igualmente prováveis/)
  assert.match(String(r.motivo), /mapa de símbolos/, 'o motivo diz o que fazer a seguir')
}
{
  // O mesmo empate, resolvido por uma pessoa: o mapa manual desfaz a ambiguidade.
  const r = resolverSimboloDestino('XAUUSD', { mapaManual: { XAUUSD: 'XAUUSD.x' }, simbolosDestino: ['XAUUSD.r', 'XAUUSD.x'] })
  assert.equal(r.via, 'mapa')
  assert.equal(r.simbolo, 'XAUUSD.x')
}

// O que NÃO é ambíguo, mesmo com vários candidatos:
{
  // (a) há match exacto — é esse, ponto final.
  const r = resolverSimboloDestino('XAUUSD', { simbolosDestino: ['XAUUSD', 'XAUUSD.r', 'XAUUSD.x'] })
  assert.equal(r.via, 'automatico')
  assert.equal(r.simbolo, 'XAUUSD')
}
{
  // (b) um dos sufixos é o NATIVO da conta (aparece em quase todos os símbolos) — ganha.
  const lista = ['EURUSD-STD', 'GBPUSD-STD', 'US30-STD', 'XAUUSD-STD', 'XAUUSD.crp']
  const r = resolverSimboloDestino('XAUUSD', { simbolosDestino: lista })
  assert.equal(r.via, 'automatico')
  assert.equal(r.simbolo, 'XAUUSD-STD')
}

// ── 5) o que não existe mesmo, e o que ainda não se sabe ─────────────────────────────────────
{
  const r = resolverSimboloDestino('BTCUSD', { simbolosDestino: ['EURUSD.r', 'XAUUSD.r'] })
  assert.equal(r.via, 'nenhum')
  assert.match(String(r.motivo), /não existe no destino/)
}
{
  // Catálogo vazio NÃO é «não existe» — é a ausência de resposta (conta undeployada/por sincronizar).
  const r = resolverSimboloDestino('XAUUSD', { simbolosDestino: [] })
  assert.equal(r.via, 'nenhum')
  assert.match(String(r.motivo), /ainda não deu a lista/)
  assert.doesNotMatch(String(r.motivo), /não existe no destino/)
}
assert.equal(resolverSimboloDestino('', { simbolosDestino: ['XAUUSD'] }).via, 'nenhum')

// ── 6) a garantia de sempre: US30 nunca casa com US3000 ─────────────────────────────────────
{
  const r = resolverSimboloDestino('US30', { simbolosDestino: ['US3000', 'EURUSD'] })
  assert.equal(r.simbolo, null)
  assert.equal(r.via, 'nenhum')
}

// ── 7) o predicado do empate, isolado ────────────────────────────────────────────────────────
assert.equal(empateIndecidivel([]), false)
assert.equal(empateIndecidivel(rankedBrokerSymbolsComChave('XAUUSD', ['XAUUSD.r'])), false, 'um só nunca empata')
assert.equal(empateIndecidivel(rankedBrokerSymbolsComChave('XAUUSD', ['XAUUSD.r', 'XAUUSD.x'])), true)

console.log('resolucao-simbolos: ok')
