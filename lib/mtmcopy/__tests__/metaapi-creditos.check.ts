/**
 * Créditos da MetaApi (incidente 2026-09-15): cache partilhada de símbolos (hit/miss/trinco/sem
 * tabela), travão de quota (monitor salta, ordem não) e preferência de fonte de preço.
 * Correr: npx tsx lib/mtmcopy/__tests__/metaapi-creditos.check.ts
 */
import assert from 'node:assert/strict'
import { __definirLoja, SEM_TABELA, type LinhaSimbolos, type LojaMetaApi, type SpecGuardada } from '../metaapi-loja'
import { simbolosPartilhados, specPartilhada, esquecerPartilhado, __limparPartilhados, TTL_LISTA_MS, MISS_MIN_IDADE_MS } from '../metaapi-simbolos-partilhados'
import { __limparCachesMetaApi } from '../metaapi-cache'
import {
  __limparQuota, apiDoErro, bloqueioAteDoErro, ehErroDeQuota, ehSegundoPlano, emSegundoPlano,
  leituraDeFundoBloqueada, registarErroQuota,
} from '../metaapi-quota'
import { precoDoSnapshotParaMonitor } from '../metaapi-snapshot-regras'
import { rankedBrokerSymbols } from '../symbol-resolver'

delete process.env.METAAPI_TOKEN

let n = 0
const ok = (c: boolean, m: string) => { n++; assert.ok(c, m) }

/** Loja em memória com as mesmas regras da SQL (reclamar atómico, bloqueio global '*'). */
function lojaMemoria(agora: () => number) {
  const linhas = new Map<string, LinhaSimbolos & { trincoAte: number | null }>()
  const cont = { ler: 0, reclamar: 0, gravar: 0, bloquear: 0 }
  let semTabela = false
  const linha = (id: string) => {
    if (!linhas.has(id)) linhas.set(id, { simbolos: [], specs: {}, atualizadoEm: null, bloqueioAte: null, trincoAte: null })
    return linhas.get(id)!
  }
  const l: LojaMetaApi = {
    async ler(id) { cont.ler++; if (semTabela) return SEM_TABELA; const r = linhas.get(id); return r ? { ...r, simbolos: [...r.simbolos], specs: { ...r.specs } } : null },
    async reclamar(id, s) {
      cont.reclamar++
      if (semTabela) return SEM_TABELA
      if ([id, '*'].some((k) => (linhas.get(k)?.bloqueioAte ?? 0) > agora())) return 'bloqueado'
      const r = linha(id)
      if (r.trincoAte != null && r.trincoAte > agora()) return 'ocupado'
      r.trincoAte = agora() + s * 1000
      return 'ok'
    },
    async gravarLista(id, s) { cont.gravar++; const r = linha(id); r.simbolos = s; r.atualizadoEm = agora(); r.trincoAte = null },
    async libertar(id) { linha(id).trincoAte = null },
    async juntarSpec(id, simbolo, spec: SpecGuardada) { linha(id).specs[simbolo] = spec },
    async esquecer(id, o) { const r = linha(id); r.specs = {}; if (o.lista && r.atualizadoEm != null && agora() - r.atualizadoEm > o.minIdadeMs) r.atualizadoEm = null },
    async lerBloqueios(ids) { if (semTabela) return SEM_TABELA; const m = new Map<string, number>(); for (const i of ids) { const b = linhas.get(i)?.bloqueioAte; if (b != null) m.set(i, b) } return m },
    async bloquear(ids, ate) { cont.bloquear++; for (const i of ids) linha(i).bloqueioAte = ate },
  }
  return { l, cont, linhas, linha, setSemTabela: (v: boolean) => { semTabela = v } }
}

const novaInstancia = () => { __limparPartilhados(); __limparCachesMetaApi(); __limparQuota() }
const LISTA = ['XAUUSD-STD', 'EURUSD-STD', 'EURUSD']
const serveOuro = (lista: string[]) => rankedBrokerSymbols('XAUUSD', lista).length > 0
const serveBtc = (lista: string[]) => rankedBrokerSymbols('BTCUSD', lista).length > 0

async function main() {
  let relogio = Date.parse('2026-09-15T10:45:00Z')
  const agora = () => relogio
  const m = lojaMemoria(agora)
  __definirLoja(m.l)

  // ── HIT: a lista lida por uma instância serve as seguintes sem getSymbols ──
  let getSymbols = 0
  const ler = async () => { getSymbols++; return LISTA }
  novaInstancia()
  assert.deepEqual(await simbolosPartilhados('A', ler, serveOuro, agora), LISTA)
  ok(getSymbols === 1, '1.ª vez de sempre pede getSymbols')
  await simbolosPartilhados('A', ler, serveOuro, agora)
  ok(getSymbols === 1 && m.cont.ler === 1, 'mesma instância: memória, nem base nem MetaApi')
  novaInstancia() // arranque a frio
  await simbolosPartilhados('A', ler, serveOuro, agora)
  ok(getSymbols === 1, 'instância nova lê a tabela, NÃO pede getSymbols')
  ok(m.cont.ler === 2, '…com uma única leitura à base')

  // ── MISS: símbolo que a corretora não tem ──
  relogio += 60_000
  await simbolosPartilhados('A', ler, serveBtc, agora)
  ok(getSymbols === 1, 'símbolo em falta com lista recente (<10 min): não refresca')
  relogio += MISS_MIN_IDADE_MS
  novaInstancia()
  await simbolosPartilhados('A', ler, serveBtc, agora)
  ok(getSymbols === 2, 'símbolo em falta com lista >10 min: refresca UMA vez')
  for (let i = 0; i < 5; i++) await simbolosPartilhados('A', ler, serveBtc, agora)
  ok(getSymbols === 2, 'repetir o símbolo em falta não volta a pedir')

  // ── prazo de 12 h ──
  relogio += TTL_LISTA_MS + 1
  novaInstancia()
  await simbolosPartilhados('A', ler, serveOuro, agora)
  ok(getSymbols === 3, 'passadas 12 h refresca')

  // ── TRINCO: outra instância está a refrescar ──
  relogio += TTL_LISTA_MS + 1
  novaInstancia()
  ok((await m.l.reclamar('A', 90)) === 'ok', 'outra instância apanha o trinco')
  assert.deepEqual(await simbolosPartilhados('A', ler, serveOuro, agora), LISTA)
  ok(getSymbols === 3, 'com o trinco ocupado usa a lista velha e não pede getSymbols')
  // Conta sem lista nenhuma: espera pela outra instância.
  novaInstancia()
  ok((await m.l.reclamar('B', 90)) === 'ok', 'outra instância apanha o trinco de B')
  setTimeout(() => { void m.l.gravarLista('B', ['BTCUSD']) }, 1_200)
  assert.deepEqual(await simbolosPartilhados('B', ler, serveBtc, agora), ['BTCUSD'])
  ok(getSymbols === 3, 'sem lista, espera e lê o que a outra instância escreveu')
  // Várias chamadas em simultâneo na mesma instância: um só getSymbols.
  novaInstancia()
  let lentas = 0
  const lenta = async () => { lentas++; await new Promise((r) => setTimeout(r, 50)); return ['GBPUSD'] }
  await Promise.all([1, 2, 3, 4].map(() => simbolosPartilhados('C', lenta, undefined, agora)))
  ok(lentas === 1, 'pedidos simultâneos → um só getSymbols')

  // ── QUOTA: com bloqueio ninguém pede getSymbols ──
  novaInstancia()
  const erroQuota = new Error('The ws:getSymbols API allows 4320000 cpu credits per 6h. Please wait some time and retry')
  ok(ehErroDeQuota(erroQuota) && apiDoErro(erroQuota) === 'ws:getSymbols', 'reconhece o erro do incidente')
  ok(!ehErroDeQuota(new Error('Unknown symbol')), 'erro normal não é quota')
  ok(bloqueioAteDoErro(erroQuota, relogio, 600_000) === relogio + 600_000, 'bloqueio padrão')
  ok(bloqueioAteDoErro({ metadata: { recommendedRetryTime: new Date(relogio + 5 * 60_000) } }, relogio) === relogio + 5 * 60_000, 'usa a hora recomendada')
  relogio += TTL_LISTA_MS + 1 // lista velha
  ok(await registarErroQuota('A', erroQuota, relogio), 'regista o erro')
  ok(m.linhas.get('*')?.bloqueioAte === relogio + 10 * 60_000 && m.linhas.get('A')?.bloqueioAte != null, 'grava bloqueio da conta E global')
  novaInstancia() // outra instância: só sabe pela base
  const antes = getSymbols
  assert.deepEqual(await simbolosPartilhados('A', ler, serveOuro, agora), LISTA)
  ok(getSymbols === antes, 'quota bloqueada: usa a lista velha, NÃO pede getSymbols')
  // Uma ordem que falha por quota a refrescar: devolve a lista guardada em vez de rebentar.
  for (const k of ['A', '*']) m.linha(k).bloqueioAte = null
  novaInstancia()
  assert.deepEqual(await simbolosPartilhados('A', async () => { throw erroQuota }, serveOuro, agora), LISTA)
  ok(m.linhas.get('*')!.bloqueioAte! > relogio, 'erro de quota no refresco regista o bloqueio e usa a lista velha')

  // ── travão: monitor salta, ordem não ──
  novaInstancia()
  ok(!ehSegundoPlano(), 'fora do contexto não é fundo')
  const { readOpenPositions, getMarketPrice, placeMarketOrder, precoRest, tipoDeRecusa } = await import('../metaapi')
  const bloqueadoNoFundo = await emSegundoPlano(async () => {
    ok(ehSegundoPlano(), 'dentro do contexto é fundo')
    return leituraDeFundoBloqueada('X', relogio)
  })
  ok(bloqueadoNoFundo, 'bloqueio global lido da base também bloqueia outras contas')
  await emSegundoPlano(async () => {
    const t = Date.now()
    ok((await readOpenPositions('X')) === null, 'monitor: readOpenPositions salta (null)')
    ok((await getMarketPrice('X', 'XAUUSD')) === null, 'monitor: getMarketPrice salta (null)')
    ok((await precoRest('X', 'XAUUSD')) === null, 'monitor: precoRest salta (null)')
    ok(Date.now() - t < 1_000, '…sem tentar ligar à MetaApi')
    const ordem = await placeMarketOrder({ accountId: 'X', symbol: 'XAUUSD', direction: 'buy', volume: 0.01 })
    ok(!ordem.success && /METAAPI_TOKEN/.test(ordem.error ?? ''), 'ordem NÃO é saltada pelo travão (tenta ligar)')
  })
  ok(tipoDeRecusa(erroQuota) === 'quota', 'recusa por quota')
  ok(tipoDeRecusa(new Error('Unknown symbol')) === 'lista', 'recusa por símbolo')
  ok(tipoDeRecusa(new Error('Invalid volume in the request')) === 'spec', 'recusa por volume')
  ok(tipoDeRecusa(new Error('timeout')) === 'outra', 'recusa genérica')
  // Sem bloqueio, o monitor tenta ler (e aqui falha por falta de token → null, mas passou o travão).
  for (const k of ['A', '*']) m.linha(k).bloqueioAte = null
  novaInstancia()
  ok(!(await emSegundoPlano(() => leituraDeFundoBloqueada('X', relogio))), 'sem bloqueio o monitor lê')

  // ── specs partilhadas ──
  novaInstancia()
  let specs = 0
  const lerSpec = async () => { specs++; return { point: 0.01, digits: 2, tradeMode: 'SYMBOL_TRADE_MODE_FULL', minVolume: 0.01, volumeStep: 0.01, maxVolume: 100, contractSize: 100, lixo: 'x' } }
  await specPartilhada('A', 'XAUUSD-STD', lerSpec, agora)
  novaInstancia()
  const s2 = (await specPartilhada('A', 'XAUUSD-STD', lerSpec, agora)) as Record<string, unknown>
  ok(specs === 1 && s2.contractSize === 100 && s2.lixo === undefined, 'spec lida uma vez e servida a outra instância (só campos úteis)')
  await esquecerPartilhado('A', { lista: false })
  novaInstancia()
  await specPartilhada('A', 'XAUUSD-STD', lerSpec, agora)
  ok(specs === 2, 'recusa por volume esquece as specs')

  // ── sem tabela (migração por aplicar): comportamento antigo ──
  novaInstancia()
  m.setSemTabela(true)
  let antigos = 0
  const lerAntigo = async () => { antigos++; return LISTA }
  await simbolosPartilhados('Z', lerAntigo, serveOuro, agora)
  await simbolosPartilhados('Z', lerAntigo, serveOuro, agora)
  ok(antigos === 1, 'sem tabela: cache de memória antiga (1 leitura por instância)')
  m.setSemTabela(false)

  // ── preço: fotografia fresca (<5 s) primeiro ──
  const T = relogio
  const snap = (idadeMs: number, sincronizado = true) => ({
    sincronizado, em: new Date(T - idadeMs).toISOString(),
    precos: { 'XAUUSD-STD': { bid: 4280, ask: 4281, em: T - idadeMs } },
  })
  const chave = rankedBrokerSymbols('XAUUSD', Object.keys(snap(0).precos))[0]
  ok(chave === 'XAUUSD-STD', 'canónico encontra o símbolo da fotografia sem lista de símbolos')
  ok(precoDoSnapshotParaMonitor(snap(4_000), chave, T) === 4280.5, 'fotografia com 4 s serve')
  ok(precoDoSnapshotParaMonitor(snap(6_000), chave, T) === null, 'fotografia com 6 s não serve (vai ao REST)')
  ok(precoDoSnapshotParaMonitor(snap(1_000, false), chave, T) === null, 'fotografia dessincronizada não serve')

  __definirLoja(null)
  console.log(`✓ metaapi-creditos: ${n} verificações`)
}

main().catch((e) => { console.error(e); process.exit(1) })
