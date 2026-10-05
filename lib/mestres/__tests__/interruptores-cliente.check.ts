/**
 * F3 — MOTOR PARTILHADO: os interruptores do cliente da MTM Auto LIDOS pela cadeia, e a via única.
 *
 *  · espelhar_saidas=false → a rota auto: NÃO copia a parcial da mestre (o motor diz «rota não copia
 *    parciais»); true → copia, por proporção. BE/trailing próprios → SL da mestre não se copia.
 *  · a sincronização seguinte corrige as flags de uma rota que já existia.
 *  · via única: a conta 8049315 (mestres_contas/site:) nunca é aberta pelo executor da MTM Auto.
 *  · 'mtmauto' está em TIPOS_LIVE_SUPORTADOS mas sem conta na lista nada passa a live.
 *
 *   npx tsx lib/mestres/__tests__/interruptores-cliente.check.ts
 */
import assert from 'node:assert/strict'
import { chaveEvento } from '../../copia-contas/calculo'
import { processarEventoCopia, type EscritorDestino, type LojaCopia } from '../../copia-contas/motor'
import type { CopiaPosicao, EventoCopia, RotaCopia } from '../../copia-contas/tipos'
import { TIPOS_LIVE_SUPORTADOS, decidirGuarda, lerListaLive, listaPedeLive } from '../../gestao-real/contas-live-regras'
import { flagsDaContaAuto, planearRotasDaEstrategia, planoDeEscrita } from '../planear'
import { MOTIVO_VIA_MESTRES, viaDaConta } from '../via-unica'

let n = 0
const ok = async (f: () => void | Promise<void>) => { await f(); n++ }

const EST = { providerId: 'aaaaaaaa-0000-0000-0000-000000000001', slug: 'premium-ouro', nome: 'Premium', contaMestreId: 'M', copyfactoryIds: [], incluirMtmauto: true }
const conta = (extra: Record<string, unknown>) => ({ id: 'c1', user_id: 'u1', plataforma: 'mt5', login: '8049315', servidor: 'FXIFY-Server', principal: true, risco_pct: 1, modo_lote: 'risk_percent', ...extra })
const sub = { id: 's1', user_id: 'u1', provider_id: EST.providerId, ativo: true, auto_aceitar: true, conta_id: 'c1' }

async function main() {
  await ok(() => {
    assert.deepEqual(flagsDaContaAuto({ espelhar_saidas: false, be_ativo: true, trailing_ativo: true }), { copiar_parciais: false, copiar_modificacoes: false, fechar_com_origem: true })
    assert.deepEqual(flagsDaContaAuto({ espelhar_saidas: true, be_ativo: true, trailing_ativo: true }), { copiar_parciais: true, copiar_modificacoes: true, fechar_com_origem: true })
    assert.deepEqual(flagsDaContaAuto({ espelhar_saidas: false, be_ativo: false, trailing_ativo: false }), { copiar_parciais: false, copiar_modificacoes: true, fechar_com_origem: true })
    assert.deepEqual(flagsDaContaAuto({}), { copiar_parciais: false, copiar_modificacoes: false, fechar_com_origem: true }, 'por omissão: copiar a estratégia, BE/trailing ligados')
  })
  // planeamento: a rota auto: nasce com as flags do cliente
  await ok(() => {
    const semEspelho = planearRotasDaEstrategia({ estrategia: EST, site: [], subsAuto: [sub], contasAuto: [conta({ espelhar_saidas: false })] as never })
    assert.equal(semEspelho.rotas.length, 1)
    assert.equal(semEspelho.rotas[0].copiar_parciais, false)
    const comEspelho = planearRotasDaEstrategia({ estrategia: EST, site: [], subsAuto: [sub], contasAuto: [conta({ espelhar_saidas: true })] as never })
    assert.equal(comEspelho.rotas[0].copiar_parciais, true)
    // rota já existente com flag antiga → sincronização corrige
    const existente = { id: 'r1', destino_chave: semEspelho.rotas[0].destino_chave, destino_ref: 'auto:c1', ativa: true, modo_lote: 'risco_pct', valor: 1, copiar_sl: true, copiar_tp: true, filtro_simbolos: [], max_abertas: null, pausada_motivo: null, copiar_parciais: true, copiar_modificacoes: true, fechar_com_origem: true, abertas: 0 }
    const plano = planoDeEscrita(semEspelho.rotas, [existente])
    assert.equal(plano.actualizar.length, 1)
    assert.equal(plano.actualizar[0].patch.copiar_parciais, false)
    assert.equal(plano.actualizar[0].patch.copiar_modificacoes, false)
    assert.equal(planoDeEscrita(comEspelho.rotas, [existente]).actualizar.length, 0, 'igual → nada a escrever')
  })
  // o motor obedece: parcial da mestre com copiar_parciais=false → saltado; true → fecha a proporção
  await ok(async () => {
    const rotaBase: RotaCopia = {
      id: '99999999-2222-3333-4444-555555555555', user_id: 'u1', origem_tipo: 'mtmfunded', origem_ref: `prov:${EST.providerId}`, origem_chave: 'mtmfunded:m',
      destino_tipo: 'mt5', destino_ref: 'auto:aaaaaaaa-0000-0000-0000-000000000002', destino_chave: 'mt:8049315@fxify-server', rotulo: null, modo_lote: 'risco_pct', valor: 1,
      mapa_simbolos: {}, filtro_simbolos: [], filtro_direcao: 'ambas', lote_max: null, max_abertas: null, copiar_sl: true, copiar_tp: true,
      copiar_parciais: true, copiar_modificacoes: true, fechar_com_origem: true, ativa: true, modo: 'shadow', estado: 'aprovada', pedido_pelo_cliente: false, notas: null, aprovada_em: null, created_at: new Date().toISOString(),
    }
    const copiaAberta = (): CopiaPosicao => ({ id: 'c1', rota_id: rotaBase.id, origem_posicao_id: 'M1', destino_posicao_id: 'D1', destino_simbolo: 'XAUUSD', direcao: 'buy', volume_origem_abertura: 1, volume_destino_abertura: 0.1, fechado_pct: 0, estado: 'aberta', client_id: null, preco_origem: 2000, preco_destino: 2000, erro: null } as CopiaPosicao)
    const loja = (c: CopiaPosicao): LojaCopia => ({ async copia() { return c }, async inserirCopia() { return true }, async atualizarCopia() {}, async abertasNaRota() { return 1 }, async saldoOrigem() { return 10_000 } })
    const log: string[] = []
    const escritor: EscritorDestino = {
      async contexto(simbolo) { return { simbolo, regra: { min: 0.01, max: 100, step: 0.01 }, equity: 5_000, saldo: 5_000, valorPorPrecoPorLote: 100, bid: 2001, ask: 2001.5, digits: 2 } },
      async simbolos() { return ['XAUUSD'] }, async posicoes() { return [{ id: 'D1', symbol: 'XAUUSD', direcao: 'buy', volume: 0.1, clientId: null }] },
      async abrir() { throw new Error('não abre aqui') }, async modificar(id, sl, tp) { log.push(`modificar ${id} ${sl}/${tp}`) }, async fechar(id, v) { log.push(`fechar ${id} ${v ?? 'tudo'}`) },
    }
    const parcial: EventoCopia = { id: 1, rota_id: rotaBase.id, origem_posicao_id: 'M1', tipo: 'partial', payload: { symbol: 'XAUUSD', direcao: 'buy', volume: 0.5, preco: 2000, sl: 1995, tp: 2010, volume_fechado: 0.5 }, chave: chaveEvento(rotaBase.id, 'M1', 'partial', 1), origem_em: new Date().toISOString(), criado_em: new Date().toISOString(), tentativas: 0 }
    const op = { interruptores: { globalLigado: true, liveDesbloqueado: true, escritaNoProcesso: true }, ganchos: { modo: () => 'live' as const } }
    const semEspelho = await processarEventoCopia(parcial, { ...rotaBase, ...flagsDaContaAuto({ espelhar_saidas: false }) }, loja(copiaAberta()), escritor, op)
    assert.equal(semEspelho.resultado, 'saltado'); assert.equal(log.length, 0, 'espelhar_saidas=false: a parcial da mestre não toca na conta')
    const comEspelho = await processarEventoCopia(parcial, { ...rotaBase, ...flagsDaContaAuto({ espelhar_saidas: true }) }, loja(copiaAberta()), escritor, op)
    assert.equal(comEspelho.resultado, 'ok'); assert.deepEqual(log, ['fechar D1 0.05'], 'espelhar_saidas=true: fecha 50% por proporção')
    const modificar: EventoCopia = { ...parcial, id: 2, tipo: 'modify', payload: { symbol: 'XAUUSD', direcao: 'buy', volume: 1, preco: 2000, sl: 2000, tp: 2010 }, chave: chaveEvento(rotaBase.id, 'M1', 'modify', 2) }
    log.length = 0
    const beProprio = await processarEventoCopia(modificar, { ...rotaBase, ...flagsDaContaAuto({ espelhar_saidas: false, be_ativo: true }) }, loja(copiaAberta()), escritor, op)
    assert.equal(beProprio.resultado, 'saltado'); assert.equal(log.length, 0, 'BE próprio ligado: o SL da mestre não se copia (duas mãos no mesmo stop)')
    const semBe = await processarEventoCopia(modificar, { ...rotaBase, ...flagsDaContaAuto({ espelhar_saidas: false, be_ativo: false, trailing_ativo: false }) }, loja(copiaAberta()), escritor, op)
    assert.equal(semBe.resultado, 'ok'); assert.equal(log.length, 1)
  })
  // via única: 8049315
  await ok(() => {
    const rotas = [{ destino_chave: 'mt:8049315@fxify-server', ativa: true, estado: 'aprovada', mestres: true, estrategia_slug: 'mtm-auto-edge' }, { destino_chave: 'mt:1@x', ativa: false, estado: 'aprovada', mestres: true }]
    const v = viaDaConta('mt:8049315@FXIFY-Server', rotas)
    assert.equal(v.via, 'mestres')
    assert.equal(viaDaConta('mt:1@x', rotas).via, 'mtmauto', 'rota inactiva não trava')
    assert.equal(viaDaConta('mt:999@x', rotas).via, 'mtmauto')
    assert.equal(viaDaConta(null, rotas).via, 'mtmauto')
    assert.ok(MOTIVO_VIA_MESTRES.includes('via única'))
  })
  // mtmauto em live só com a conta na lista
  await ok(() => {
    assert.ok(TIPOS_LIVE_SUPORTADOS.includes('mtmauto'))
    assert.equal(listaPedeLive(lerListaLive('[]'), 'abc', 'mtmauto'), false, 'lista vazia: nada em live')
    assert.equal(listaPedeLive(lerListaLive('["abc"]'), 'abc', 'mtmauto'), true)
    assert.equal(decidirGuarda(lerListaLive('["abc"]'), null, 'abc', 'mtmauto', Date.now()), false, 'sem batimento o monitor antigo não se cala')
  })
  console.log(`interruptores-cliente: ${n} casos OK`)
}
main().catch((e) => { console.error(e); process.exit(1) })
