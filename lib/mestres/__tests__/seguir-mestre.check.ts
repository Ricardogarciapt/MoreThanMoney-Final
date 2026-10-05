/**
 * F4 — TAP TO TRADE SEGUE A MESTRE, para qualquer provider e refs pos:/fpos:/tlpos:.
 *
 *  · mestre altera SL → cliente altera SL à MESMA distância da entrada REAL dele (rota T2T);
 *  · mestre fecha 50% → cliente fecha 50%;
 *  · mestre fecha → cliente fecha;
 *  · provider NOVO (F1, metaapi) é seguido: canal derivado → estratégia → origem = conta MT dele;
 *  · espelho «copiar a pessoa» (motor-real): SL/TP do educador espelhados por distância, sem piorar
 *    o stop quando o cliente tem BE/trailing; caso MAU (educador removeu SL) não remove o do cliente.
 *
 *   npx tsx lib/mestres/__tests__/seguir-mestre.check.ts
 */
import assert from 'node:assert/strict'
import { chaveEvento } from '../../copia-contas/calculo'
import { processarEventoCopia, type EscritorDestino, type LojaCopia } from '../../copia-contas/motor'
import type { CopiaPosicao, EventoCopia, RotaCopia } from '../../copia-contas/tipos'
import { decidirModificacaoEspelho } from '../../gestao-real/mtmauto'
import { mapaCanalEstrategia } from '../canal-t2t'
import { candidatasDosFactos, lerRefPosicao, origemT2TDoProvider, refDaPosicao } from '../seguir-mestre'
import { escolherPosicaoMestre, estrategiaDoSinalT2T } from '../t2t'

let n = 0
const ok = async (f: () => void | Promise<void>) => { await f(); n++ }

const ROTA_T2T: RotaCopia = {
  id: '99999999-2222-3333-4444-555555555555', user_id: 'u1', origem_tipo: 'mt5', origem_ref: 'prov:aaaaaaaa-0000-0000-0000-000000000001', origem_chave: 'mt:111@corretora',
  destino_tipo: 'mt5', destino_ref: 'site:aaaaaaaa-0000-0000-0000-000000000002', destino_chave: 'mt:222@outra', rotulo: null, modo_lote: 'risco_pct', valor: 1,
  mapa_simbolos: {}, filtro_simbolos: [], filtro_direcao: 'ambas', lote_max: null, max_abertas: null, copiar_sl: true, copiar_tp: true,
  copiar_parciais: true, copiar_modificacoes: true, fechar_com_origem: true, ativa: true, modo: 'shadow', estado: 'aprovada', pedido_pelo_cliente: false, notas: null, aprovada_em: null, created_at: new Date().toISOString(),
}
// cliente entrou 3 pips pior do que a mestre (2000.0 vs 2000.3)
const copia = (): CopiaPosicao => ({ id: 'c1', rota_id: ROTA_T2T.id, origem_posicao_id: 'P1', destino_posicao_id: 'D1', destino_simbolo: 'XAUUSD', direcao: 'buy', volume_origem_abertura: 1, volume_destino_abertura: 0.2, fechado_pct: 0, estado: 'aberta', client_id: null, preco_origem: 2000, preco_destino: 2000.3, erro: null } as CopiaPosicao)
const loja = (c: CopiaPosicao): LojaCopia => ({ async copia() { return c }, async inserirCopia() { return true }, async atualizarCopia(_id, patch) { Object.assign(c, patch) }, async abertasNaRota() { return 1 }, async saldoOrigem() { return 10_000 } })
function corretora() {
  const log: string[] = []
  const e: EscritorDestino = {
    async contexto(simbolo) { return { simbolo, regra: { min: 0.01, max: 100, step: 0.01 }, equity: 5_000, saldo: 5_000, valorPorPrecoPorLote: 100, bid: 2001, ask: 2001.5, digits: 2 } },
    async simbolos() { return ['XAUUSD'] }, async posicoes() { return [{ id: 'D1', symbol: 'XAUUSD', direcao: 'buy', volume: 0.2, clientId: null }] },
    async abrir() { throw new Error('não') }, async modificar(id, sl, tp) { log.push(`modificar ${id} sl=${sl} tp=${tp}`) }, async fechar(id, v) { log.push(`fechar ${id} ${v ?? 'tudo'}`) },
  }
  return { e, log }
}
const ev = (id: number, tipo: EventoCopia['tipo'], payload: EventoCopia['payload']): EventoCopia => ({ id, rota_id: ROTA_T2T.id, origem_posicao_id: 'P1', tipo, payload, chave: chaveEvento(ROTA_T2T.id, 'P1', tipo, id), origem_em: new Date().toISOString(), criado_em: new Date().toISOString(), tentativas: 0 })
const op = { interruptores: { globalLigado: true, liveDesbloqueado: true, escritaNoProcesso: true }, ganchos: { modo: () => 'live' as const } }

async function main() {
  await ok(async () => {
    const c = corretora()
    // mestre move o SL de 1995 para 1998 (5→2 pips... 50→20 pips no ouro) e o TP para 2012
    const r = await processarEventoCopia(ev(1, 'modify', { symbol: 'XAUUSD', direcao: 'buy', volume: 1, preco: 2000, sl: 1998, tp: 2012 }), ROTA_T2T, loja(copia()), c.e, op)
    assert.equal(r.resultado, 'ok', JSON.stringify(r))
    assert.deepEqual(c.log, ['modificar D1 sl=1998.3 tp=2012.3'], 'mesma distância à entrada REAL do cliente')
  })
  await ok(async () => {
    const c = corretora()
    const r = await processarEventoCopia(ev(2, 'partial', { symbol: 'XAUUSD', direcao: 'buy', volume: 0.5, preco: 2000, volume_fechado: 0.5 }), ROTA_T2T, loja(copia()), c.e, op)
    assert.equal(r.resultado, 'ok'); assert.deepEqual(c.log, ['fechar D1 0.1'], 'mestre fecha 50% → cliente fecha 50% (0,1 de 0,2)')
  })
  await ok(async () => {
    const c = corretora()
    const r = await processarEventoCopia(ev(3, 'close', { symbol: 'XAUUSD', direcao: 'buy', volume: 0, preco: 2000 }), ROTA_T2T, loja(copia()), c.e, op)
    assert.equal(r.resultado, 'ok'); assert.deepEqual(c.log, ['fechar D1 tudo'])
  })
  // em SOMBRA (estratégia em sombra) nada toca na conta
  await ok(async () => {
    const c = corretora()
    const sombra = { ...copia(), estado: 'sombra' as const }
    const r = await processarEventoCopia(ev(4, 'modify', { symbol: 'XAUUSD', direcao: 'buy', volume: 1, preco: 2000, sl: 1998, tp: 2012 }), ROTA_T2T, loja(sombra), c.e, { ...op, ganchos: { modo: () => 'sombra' as const } })
    assert.equal(r.resultado, 'sombra'); assert.equal(c.log.length, 0)
  })
  // origens por tipo + refs
  await ok(() => {
    const met = origemT2TDoProvider({ id: 'p', tipo: 'metaapi', login: '111', servidor: 'Corretora', metaapi_account_id: 'x' }, 'SIM')
    assert.equal(met.fonte, 'metaapi'); assert.equal(met.origem_chave, 'mt:111@corretora'); assert.equal(refDaPosicao(met, '9'), 'pos:9')
    const tl = origemT2TDoProvider({ id: 'p', tipo: 'tradelocker', tl_env: 'LIVE', tl_account_id: '42' }, 'SIM')
    assert.equal(tl.origem_chave, 'tl:live:42'); assert.equal(refDaPosicao(tl, '7'), 'tlpos:7')
    const tg = origemT2TDoProvider({ id: 'p', tipo: 'telegram' }, 'SIM-ID')
    assert.equal(tg.fonte, 'funded'); assert.equal(tg.contaFunded, 'SIM-ID'); assert.equal(refDaPosicao(tg, '1'), 'fpos:1')
    const mt5 = origemT2TDoProvider({ id: 'p', tipo: 'mt5', login: '1', servidor: 's' }, 'SIM-ID')
    assert.equal(mt5.fonte, 'funded', 'MT5 directo «por ligar» segue a mestre SIM')
    const esp = origemT2TDoProvider({ id: 'p', tipo: 'metaapi', login: '1', servidor: 's', fonte_execucao: 'espelho', espelho_funded_account_id: 'ESP' }, 'SIM')
    assert.equal(esp.contaFunded, 'ESP')
    assert.deepEqual(lerRefPosicao('tlpos:7'), { prefixo: 'tlpos:', id: '7' }); assert.equal(lerRefPosicao('12345'), null)
  })
  // provider NOVO (F1) é seguido: canal → estratégia → origem MT → posição pelos factos do streaming
  await ok(() => {
    const mapa = mapaCanalEstrategia([{ slug: 'educador-x' }])
    assert.equal(estrategiaDoSinalT2T('sinais-educador-x', 'XAUUSD BUY 2000', mapa), 'educador-x')
    const agora = Date.now()
    const iso = (s: number) => new Date(agora - s * 1000).toISOString()
    const factos = [
      { origem_posicao_id: 'P1', tipo: 'open' as const, payload: { symbol: 'XAUUSD', direcao: 'buy', volume: 1, preco: 2000, sl: 1995, tp: 2010, aberta_em: iso(60) }, origem_em: iso(60) },
      { origem_posicao_id: 'P1', tipo: 'modify' as const, payload: { symbol: 'XAUUSD', direcao: 'buy', volume: 1, preco: 2000, sl: 1998, tp: 2010 }, origem_em: iso(30) },
      { origem_posicao_id: 'P0', tipo: 'open' as const, payload: { symbol: 'XAUUSD', direcao: 'buy', volume: 1, preco: 1990, aberta_em: iso(600) }, origem_em: iso(600) },
      { origem_posicao_id: 'P0', tipo: 'close' as const, payload: { symbol: 'XAUUSD', direcao: 'buy', volume: 0 }, origem_em: iso(500) },
    ]
    const cands = candidatasDosFactos(factos)
    assert.equal(cands.length, 1, 'a fechada (P0) não é candidata'); assert.equal(cands[0].sl, 1998, 'último SL conhecido')
    const pos = escolherPosicaoMestre(cands, { symbol: 'XAUUSD', direcao: 'buy', entrada: 2000.5, mensagemEm: iso(55), pip: 0.1 })
    assert.equal(pos?.id, 'P1')
  })
  // espelho «copiar a pessoa» (motor-real): SL/TP por distância
  await ok(() => {
    const base = { symbol: 'XAUUSD', direcao: 'buy' as const, educador: { openPrice: 2000, stopLoss: 2000, takeProfit: 2020 }, cliente: { openPrice: 2000.3, stopLoss: 1995.3, takeProfit: 2010.3 } }
    assert.deepEqual(decidirModificacaoEspelho({ ...base, protegerStop: true }), { tipo: 'modificar', sl: 2000.3, tp: 2020.3 }, 'BE dele → BE do cliente')
    const pior = decidirModificacaoEspelho({ ...base, educador: { openPrice: 2000, stopLoss: 1990, takeProfit: 2010 }, protegerStop: true })
    assert.deepEqual(pior, { tipo: 'nada' }, 'com BE/trailing próprios o espelho não alarga o stop')
    const alarga = decidirModificacaoEspelho({ ...base, educador: { openPrice: 2000, stopLoss: 1990, takeProfit: 2010 }, protegerStop: false })
    assert.deepEqual(alarga, { tipo: 'modificar', sl: 1990.3, tp: 2010.3 }, 'sem protecção própria: copia a pessoa')
    assert.deepEqual(decidirModificacaoEspelho({ ...base, educador: { openPrice: 2000, stopLoss: null, takeProfit: null }, protegerStop: false }), { tipo: 'nada' }, 'educador sem SL não remove o do cliente')
    assert.deepEqual(decidirModificacaoEspelho({ ...base, educador: { openPrice: 2000, stopLoss: 1995.02, takeProfit: 2010 }, protegerStop: false }), { tipo: 'nada' }, '<0,5 pip ignora-se')
  })
  console.log(`seguir-mestre: ${n} casos OK`)
}
main().catch((e) => { console.error(e); process.exit(1) })
