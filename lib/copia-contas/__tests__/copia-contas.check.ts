/**
 * Cópia entre contas — lotes, símbolos, ciclos, fan-out, parciais, idempotência, fechaduras do
 * live e «sombra nunca escreve». Números à mão.
 *
 *   npx tsx lib/copia-contas/__tests__/copia-contas.check.ts
 */
import assert from 'node:assert/strict'
import {
  calcularLote, chaveEvento, clientIdDaCopia, mapearSimbolo, motivoFiltro, pctDoEvento, planoParcial, stopsNoDestino,
} from '../calculo'
import { colapsarModificacoes, diffPosicoes, proximaSondagemMs, proximaTentativa, reconciliarArranque } from '../diff'
import { processarEventoCopia, type EscritorDestino, type LojaCopia } from '../motor'
import {
  chaveFisica, criaCiclo, INTERRUPTORES_FECHADOS, MAX_FANOUT, modoEfectivo, pedidoDeModo, validarRota,
  type ArestaRota, type Interruptores, type LinhaContaCopia,
} from '../regras'
import type { CopiaPosicao, EventoCopia, PosicaoOrigem, RotaCopia } from '../tipos'

let n = 0
const t = (nome: string, f: () => void | Promise<void>) => ({ nome, f })
const casos: { nome: string; f: () => void | Promise<void> }[] = []
const caso = (nome: string, f: () => void | Promise<void>) => casos.push(t(nome, f))

const FX = { min: 0.01, max: 100, step: 0.01 }
const IDX = { min: 0.1, max: 50, step: 0.1 }

// ── lote ─────────────────────────────────────────────────────────────────────
caso('multiplicador ×2 de 0,30 → 0,60', () => {
  const r = calcularLote({ modo: 'multiplicador', valor: 2, volumeOrigem: 0.3, saldoOrigem: null, equityDestino: null, loteMax: null, regra: FX })
  assert.deepEqual(r.ok && r.volume, 0.6)
})
caso('fixo 0,05 ignora a origem', () => {
  const r = calcularLote({ modo: 'fixo', valor: 0.05, volumeOrigem: 3, saldoOrigem: null, equityDestino: null, loteMax: null, regra: FX })
  assert.equal(r.ok && r.volume, 0.05)
})
caso('proporcional: 1 lote em 100k → 0,05 em 5k', () => {
  const r = calcularLote({ modo: 'proporcional_saldo', valor: 1, volumeOrigem: 1, saldoOrigem: 100_000, equityDestino: 5_000, loteMax: null, regra: FX })
  assert.equal(r.ok && r.volume, 0.05)
})
caso('proporcional abaixo de metade do mínimo → recusa (não abre 4× o risco)', () => {
  const r = calcularLote({ modo: 'proporcional_saldo', valor: 1, volumeOrigem: 0.05, saldoOrigem: 100_000, equityDestino: 5_000, loteMax: null, regra: FX })
  assert.equal(r.ok, false)
})
caso('proporcional sem equity do destino → recusa', () => {
  const r = calcularLote({ modo: 'proporcional_saldo', valor: 1, volumeOrigem: 1, saldoOrigem: 100_000, equityDestino: null, loteMax: null, regra: FX })
  assert.equal(r.ok, false)
})
caso('risco 1% de 10k com SL a 5,00 de preço e 100 por preço/lote → 0,20', () => {
  const r = calcularLote({ modo: 'risco_pct', valor: 1, volumeOrigem: 1, saldoOrigem: null, equityDestino: 10_000, loteMax: null, regra: FX, distanciaSl: 5, valorPorPrecoPorLote: 100 })
  assert.equal(r.ok && r.volume, 0.2)
})
caso('risco % sem SL → recusa', () => {
  const r = calcularLote({ modo: 'risco_pct', valor: 1, volumeOrigem: 1, saldoOrigem: null, equityDestino: 10_000, loteMax: null, regra: FX, distanciaSl: null, valorPorPrecoPorLote: 100 })
  assert.equal(r.ok, false)
})
caso('risco % acima de 10 → recusa', () => {
  const r = calcularLote({ modo: 'risco_pct', valor: 12, volumeOrigem: 1, saldoOrigem: null, equityDestino: 10_000, loteMax: null, regra: FX, distanciaSl: 5, valorPorPrecoPorLote: 100 })
  assert.equal(r.ok, false)
})
caso('lote máximo corta para baixo ao step', () => {
  const r = calcularLote({ modo: 'multiplicador', valor: 10, volumeOrigem: 1, saldoOrigem: null, equityDestino: null, loteMax: 2.345, regra: FX })
  assert.equal(r.ok && r.volume, 2.34)
})
caso('índice com step 0,1: 0,26 → 0,3', () => {
  const r = calcularLote({ modo: 'multiplicador', valor: 1, volumeOrigem: 0.26, saldoOrigem: null, equityDestino: null, loteMax: null, regra: IDX })
  assert.equal(r.ok && r.volume, 0.3)
})
caso('lote máximo abaixo do mínimo da corretora → recusa', () => {
  const r = calcularLote({ modo: 'fixo', valor: 1, volumeOrigem: 1, saldoOrigem: null, equityDestino: null, loteMax: 0.05, regra: IDX })
  assert.equal(r.ok, false)
})
caso('multiplicador inválido não inventa 1 lote', () => {
  const r = calcularLote({ modo: 'multiplicador', valor: 0, volumeOrigem: 1, saldoOrigem: null, equityDestino: null, loteMax: null, regra: FX })
  assert.equal(r.ok, false)
})

// ── símbolo ──────────────────────────────────────────────────────────────────
caso('mapa manual manda (pelo canónico)', () => {
  assert.equal(mapearSimbolo('XAUUSD.s', 'mt5', { XAUUSD: 'GOLD' }, ['XAUUSD', 'GOLD']).simbolo, 'GOLD')
})
caso('MT5 destino: sufixo da corretora resolvido pela lista', () => {
  const r = mapearSimbolo('XAUUSD', 'mt5', {}, ['EURUSD.r', 'XAUUSD.r', 'US30.r'])
  assert.equal(r.simbolo, 'XAUUSD.r')
})
caso('MTM Funded destino: canónico', () => {
  const r = mapearSimbolo('XAUUSD.pro', 'mtmfunded', {}, null)
  assert.equal(r.simbolo, 'XAUUSD')
})
caso('símbolo que não existe no destino → null', () => {
  assert.equal(mapearSimbolo('BTCUSD', 'tradelocker', {}, ['EURUSD', 'XAUUSD']).simbolo, null)
})

// ── filtros e stops ──────────────────────────────────────────────────────────
const rotaBase: RotaCopia = {
  id: '11111111-2222-3333-4444-555555555555', user_id: 'u1', origem_tipo: 'mt5', origem_ref: 'site:aaaaaaaa-0000-0000-0000-000000000001',
  origem_chave: 'mt:1@a', destino_tipo: 'tradelocker', destino_ref: 'site:aaaaaaaa-0000-0000-0000-000000000002', destino_chave: 'tl:live:9',
  rotulo: null, modo_lote: 'multiplicador', valor: 1, mapa_simbolos: {}, filtro_simbolos: [], filtro_direcao: 'ambas', lote_max: null,
  max_abertas: null, copiar_sl: true, copiar_tp: true, copiar_parciais: true, copiar_modificacoes: true, fechar_com_origem: true,
  ativa: true, modo: 'shadow', estado: 'aprovada', pedido_pelo_cliente: false, notas: null, aprovada_em: null, created_at: new Date().toISOString(),
}
caso('filtro de símbolos aceita o canónico de um símbolo com sufixo', () => {
  assert.equal(motivoFiltro({ ...rotaBase, filtro_simbolos: ['XAUUSD'] }, { symbol: 'XAUUSD.s', direcao: 'buy' }, 0), null)
  assert.ok(motivoFiltro({ ...rotaBase, filtro_simbolos: ['XAUUSD'] }, { symbol: 'EURUSD', direcao: 'buy' }, 0))
})
caso('filtro de direcção e máximo de abertas', () => {
  assert.ok(motivoFiltro({ ...rotaBase, filtro_direcao: 'buy' }, { symbol: 'EURUSD', direcao: 'sell' }, 0))
  assert.ok(motivoFiltro({ ...rotaBase, max_abertas: 2 }, { symbol: 'EURUSD', direcao: 'sell' }, 2))
})
caso('SL/TP por distância a partir do preço do destino', () => {
  const s = stopsNoDestino({ direcao: 'buy', entradaOrigem: 2000, slOrigem: 1990, tpOrigem: 2020, precoDestino: 2001.5, digits: 2, copiarSl: true, copiarTp: true })
  assert.deepEqual(s, { sl: 1991.5, tp: 2021.5 })
  const v = stopsNoDestino({ direcao: 'sell', entradaOrigem: 2000, slOrigem: 2010, tpOrigem: 1980, precoDestino: 1999, digits: 2, copiarSl: true, copiarTp: false })
  assert.deepEqual(v, { sl: 2009, tp: null })
})

// ── parciais ─────────────────────────────────────────────────────────────────
caso('50% de 0,40 → fecha 0,20', () => {
  assert.deepEqual(planoParcial({ volumeDestinoAbertura: 0.4, fechadoPctAntes: 0, pct: 0.5, volumeAbertoDestino: 0.4, regra: FX }), { tipo: 'parcial', volume: 0.2, fechadoPct: 0.5 })
})
caso('50% e depois 50% = 75% fechado', () => {
  const r = planoParcial({ volumeDestinoAbertura: 0.4, fechadoPctAntes: 0.5, pct: 0.5, volumeAbertoDestino: 0.2, regra: FX })
  assert.deepEqual(r, { tipo: 'parcial', volume: 0.1, fechadoPct: 0.75 })
})
caso('parcial que deixaria menos do que o mínimo → fecha tudo', () => {
  const r = planoParcial({ volumeDestinoAbertura: 0.02, fechadoPctAntes: 0, pct: 0.8, volumeAbertoDestino: 0.02, regra: FX })
  assert.equal(r.tipo, 'total')
})
caso('diferença abaixo de 5% → nada (apanha-se no seguinte)', () => {
  const r = planoParcial({ volumeDestinoAbertura: 1, fechadoPctAntes: 0, pct: 0.03, volumeAbertoDestino: 1, regra: FX })
  assert.equal(r.tipo, 'nada')
})
caso('pct do evento: fechado ÷ (fechado + restante)', () => {
  assert.equal(pctDoEvento({ volume_fechado: 0.25, volume: 0.75 }), 0.25)
})

// ── idempotência e diff ─────────────────────────────────────────────────────
caso('chave de evento estável e clientId curto', () => {
  assert.equal(chaveEvento('r', '123', 'close'), 'r:123:close:0')
  assert.equal(chaveEvento('r', '123', 'partial', 0.5), 'r:123:partial:0.5')
  const c = clientIdDaCopia(rotaBase.id, '987654321012')
  assert.equal(c, 'MTMC_11111111_54321012')
  assert.ok(c.length <= 32)
})
const pos = (id: string, volume: number, sl: number | null = null, abertaEm: string | null = null): PosicaoOrigem => ({ id, symbol: 'XAUUSD', direcao: 'buy', volume, preco: 2000, sl, tp: null, abertaEm })
caso('fotografia nula não gera fecho', () => {
  const antes = new Map([['1', pos('1', 1)]])
  const r = diffPosicoes(antes, null)
  assert.equal(r.factos.length, 0)
  assert.equal(r.fotografia, antes)
})
caso('arranque não copia o passado, mas apanha a abertura recente', () => {
  const agora = Date.parse('2026-09-15T12:00:00Z')
  const r = diffPosicoes(null, [pos('velha', 1, null, '2026-09-15T10:00:00Z'), pos('nova', 1, null, '2026-09-15T11:59:30Z')], { agora })
  assert.deepEqual(r.factos.map((f) => `${f.tipo}:${f.posicaoId}`), ['open:nova'])
})
caso('abrir, parcial, modificar e fechar', () => {
  const antes = new Map([['1', pos('1', 1)], ['2', pos('2', 0.5)]])
  const r = diffPosicoes(antes, [pos('1', 0.6, 1990), pos('3', 0.1)])
  assert.deepEqual(r.factos.map((f) => `${f.tipo}:${f.posicaoId}`).sort(), ['close:2', 'modify:1', 'open:3', 'partial:1'])
  const p = r.factos.find((f) => f.tipo === 'partial')!
  assert.equal(p.payload.volume_fechado, 0.4)
  assert.equal(p.discriminador, '0.6')
})
caso('mesma fotografia duas vezes → mesmas chaves (idempotente)', () => {
  const antes = new Map([['1', pos('1', 1)]])
  const a = diffPosicoes(antes, [pos('1', 0.5)]).factos.map((f) => chaveEvento('r', f.posicaoId, f.tipo, f.discriminador))
  const b = diffPosicoes(antes, [pos('1', 0.5)]).factos.map((f) => chaveEvento('r', f.posicaoId, f.tipo, f.discriminador))
  assert.deepEqual(a, b)
})
caso('arranque: cópia aberta sem posição na origem → fecho; volume a menos → parcial', () => {
  const f = reconciliarArranque(
    [
      { origem_posicao_id: 'foi', volume_origem_abertura: 1, fechado_pct: 0, direcao: 'buy', destino_simbolo: 'XAUUSD' },
      { origem_posicao_id: 'meia', volume_origem_abertura: 1, fechado_pct: 0 },
      { origem_posicao_id: 'igual', volume_origem_abertura: 1, fechado_pct: 0.5 },
    ],
    [pos('meia', 0.5), pos('igual', 0.5)],
  )
  assert.deepEqual(f.map((x) => `${x.tipo}:${x.posicaoId}`), ['close:foi', 'partial:meia'])
  assert.equal(f[1].payload.volume_fechado, 0.5)
})
caso('modificações em rajada colapsam na última', () => {
  const f = [{ tipo: 'modify' as const, posicaoId: '1' }, { tipo: 'modify' as const, posicaoId: '1' }, { tipo: 'close' as const, posicaoId: '2' }]
  const r = colapsarModificacoes(f)
  assert.equal(r.manter.length, 2)
  assert.equal(r.saltar.length, 1)
})
caso('tentativas e sondagem com backoff', () => {
  assert.deepEqual(proximaTentativa(0), { desistir: false, emMs: 1000 })
  assert.deepEqual(proximaTentativa(4), { desistir: true })
  assert.equal(proximaSondagemMs(2000, false), 4000)
  assert.equal(proximaSondagemMs(48_000, false), 60_000)
  assert.equal(proximaSondagemMs(60_000, true), 2000)
  assert.equal(proximaSondagemMs(500, true), 2000)
})

// ── rotas: identidade, ciclos, fan-out ──────────────────────────────────────
const conta = (ref: string, plataforma: LinhaContaCopia['plataforma'], extra: Partial<LinhaContaCopia> = {}): LinhaContaCopia => ({ ref, plataforma, userId: 'u1', ...extra })
caso('chave física: a mesma conta MT5 em dois produtos tem a mesma chave', () => {
  assert.equal(chaveFisica(conta('site:x', 'mt5', { login: '12 345', servidor: 'PUPrime-Live ' })), chaveFisica(conta('auto:y', 'mt5', { login: '12345', servidor: 'puprime-live' })))
  assert.equal(chaveFisica(conta('funded:aaaaaaaa-0000-0000-0000-000000000001', 'mtmfunded')), 'mtmfunded:aaaaaaaa-0000-0000-0000-000000000001')
  assert.equal(chaveFisica(conta('site:z', 'tradelocker', { tlEnv: 'live', tlAccountId: '77' })), 'tl:live:77')
})
caso('recusa a mesma conta (refs diferentes, conta física igual)', () => {
  const r = validarRota(conta('site:a', 'mt5', { login: '1', servidor: 's' }), conta('auto:b', 'mt5', { login: '1', servidor: 's' }), [])
  assert.equal(!r.ok && r.erro, 'mesma_conta')
})
caso('recusa donos diferentes e destino só-leitura', () => {
  assert.equal((validarRota(conta('site:a', 'mt5', { login: '1', servidor: 's' }), { ...conta('site:b', 'mt5', { login: '2', servidor: 's' }), userId: 'u2' }, []) as { erro: string }).erro, 'dono_diferente')
  assert.equal((validarRota(conta('site:a', 'mt5', { login: '1', servidor: 's' }), conta('funded:b', 'mtmfunded', { fundedAccountId: 'b', soLeitura: true }), []) as { erro: string }).erro, 'destino_so_leitura')
})
caso('ciclo A→B→A recusado; cadeia A→B→C aceite', () => {
  const ab: ArestaRota = { id: '1', origem_chave: 'A', destino_chave: 'B' }
  assert.equal(criaCiclo([ab], { origem_chave: 'B', destino_chave: 'A' }), true)
  assert.equal(criaCiclo([ab], { origem_chave: 'B', destino_chave: 'C' }), false)
  assert.equal(criaCiclo([ab, { origem_chave: 'B', destino_chave: 'C' }], { origem_chave: 'C', destino_chave: 'A' }), true)
  // a própria rota editada não conta como caminho
  assert.equal(criaCiclo([ab], { id: '1', origem_chave: 'B', destino_chave: 'A' }), false)
  // recusadas não contam
  assert.equal(criaCiclo([{ ...ab, estado: 'recusada' }], { origem_chave: 'B', destino_chave: 'A' }), false)
})
caso(`fan-out: o ${MAX_FANOUT + 1}.º destino é recusado`, () => {
  const origem = conta('site:o', 'mt5', { login: '1', servidor: 's' })
  const existentes: ArestaRota[] = Array.from({ length: MAX_FANOUT }, (_, i) => ({ id: String(i), origem_chave: 'mt:1@s', destino_chave: `tl:live:${i}` }))
  const r = validarRota(origem, conta('site:d', 'tradelocker', { tlEnv: 'live', tlAccountId: '99' }), existentes)
  assert.equal(!r.ok && r.erro, 'fanout')
  const ok = validarRota(origem, conta('site:d', 'tradelocker', { tlEnv: 'live', tlAccountId: '99' }), existentes.slice(1))
  assert.equal(ok.ok, true)
})
caso('todos os pares de plataformas são permitidos (MTM Funded→MT4/MT5/TL, TL→MT5, MT5→TL, …)', () => {
  const tipos = ['mtmfunded', 'mt4', 'mt5', 'tradelocker'] as const
  const mk = (p: (typeof tipos)[number], i: string) => conta(p === 'mtmfunded' ? `funded:${i}` : `site:${i}`, p, { login: i, servidor: 'srv', tlEnv: 'live', tlAccountId: i, fundedAccountId: i })
  for (const a of tipos) for (const b of tipos) assert.equal(validarRota(mk(a, '1'), mk(b, '2'), []).ok, true, `${a}→${b}`)
})

// ── fechaduras do live ───────────────────────────────────────────────────────
caso('modo efectivo: global desligado → parado; tudo aberto menos o desbloqueio → sombra', () => {
  assert.equal(modoEfectivo({ ...rotaBase, modo: 'live' }, INTERRUPTORES_FECHADOS), 'parado')
  assert.equal(modoEfectivo({ ...rotaBase, ativa: false }, { ...INTERRUPTORES_FECHADOS, globalLigado: true }), 'parado')
  assert.equal(modoEfectivo({ ...rotaBase, estado: 'pedido' }, { ...INTERRUPTORES_FECHADOS, globalLigado: true }), 'parado')
  assert.equal(modoEfectivo({ ...rotaBase, modo: 'live' }, { globalLigado: true, liveDesbloqueado: false, escritaNoProcesso: true }), 'sombra')
  assert.equal(modoEfectivo({ ...rotaBase, modo: 'live' }, { globalLigado: true, liveDesbloqueado: true, escritaNoProcesso: false }), 'sombra')
  assert.equal(modoEfectivo({ ...rotaBase, modo: 'live' }, { globalLigado: true, liveDesbloqueado: true, escritaNoProcesso: true }), 'live')
})
caso('pedido de live: palavra errada 400, sem desbloqueio 423', () => {
  assert.deepEqual(pedidoDeModo({ modo: 'shadow' }, rotaBase, false), { ok: true })
  assert.equal((pedidoDeModo({ modo: 'live', confirmacao: 'ligar' }, rotaBase, false) as { status: number }).status, 400)
  assert.equal((pedidoDeModo({ modo: 'live', confirmacao: 'LIGAR' }, rotaBase, false) as { status: number }).status, 423)
  assert.equal((pedidoDeModo({ modo: 'live', confirmacao: 'LIGAR' }, { estado: 'pedido' }, true) as { status: number }).status, 409)
})

// ── motor: sombra nunca escreve ─────────────────────────────────────────────
function lojaMemoria(saldo = 100_000) {
  const copias = new Map<string, CopiaPosicao>()
  let seq = 0
  const loja: LojaCopia = {
    async copia(r, p) { return copias.get(`${r}|${p}`) ?? null },
    async inserirCopia(c) {
      const k = `${c.rota_id}|${c.origem_posicao_id}`
      if (copias.has(k)) return false
      copias.set(k, { id: `c${++seq}`, destino_posicao_id: null, destino_simbolo: null, direcao: null, volume_destino_abertura: null, fechado_pct: 0, estado: 'sombra', client_id: null, preco_origem: null, preco_destino: null, erro: null, ...c } as CopiaPosicao)
      return true
    },
    async atualizarCopia(id, patch) { for (const [k, v] of copias) if (v.id === id) copias.set(k, { ...v, ...patch }) },
    async abertasNaRota(r) { return [...copias.values()].filter((c) => c.rota_id === r && ['sombra', 'aberta', 'enviando'].includes(c.estado)).length },
    async saldoOrigem() { return saldo },
  }
  return { loja, copias }
}
function escritorQueRebentaAoEscrever() {
  const chamadas = { leituras: 0, escritas: 0 }
  const e: EscritorDestino = {
    async contexto(simbolo) { chamadas.leituras++; return { simbolo, regra: FX, equity: 5_000, saldo: 5_000, valorPorPrecoPorLote: 100, bid: 2001, ask: 2001.5, digits: 2 } },
    async simbolos() { chamadas.leituras++; return ['XAUUSD.r', 'EURUSD.r'] },
    async posicoes() { chamadas.leituras++; return [] },
    async abrir() { chamadas.escritas++; throw new Error('SOMBRA ESCREVEU (abrir)') },
    async modificar() { chamadas.escritas++; throw new Error('SOMBRA ESCREVEU (modificar)') },
    async fechar() { chamadas.escritas++; throw new Error('SOMBRA ESCREVEU (fechar)') },
  }
  return { e, chamadas }
}
const ev = (id: number, tipo: EventoCopia['tipo'], payload: EventoCopia['payload']): EventoCopia => ({
  id, rota_id: rotaBase.id, origem_posicao_id: 'P1', tipo, payload, chave: chaveEvento(rotaBase.id, 'P1', tipo, id), origem_em: null, criado_em: new Date().toISOString(), tentativas: 0,
})
const ligadoSemLive: Interruptores = { globalLigado: true, liveDesbloqueado: false, escritaNoProcesso: true }

caso('sombra: abrir → parcial → modificar → fechar, com zero escritas e acções pretendidas certas', async () => {
  const { loja, copias } = lojaMemoria()
  const { e, chamadas } = escritorQueRebentaAoEscrever()
  const rota: RotaCopia = { ...rotaBase, modo: 'live', modo_lote: 'proporcional_saldo', valor: 1 } // pede live, mas o desbloqueio está fechado
  const a = await processarEventoCopia(ev(1, 'open', { symbol: 'XAUUSD', direcao: 'buy', volume: 2, preco: 2000, sl: 1990, tp: 2020 }), rota, loja, e, { interruptores: ligadoSemLive })
  assert.equal(a.resultado, 'sombra')
  assert.deepEqual(a.acaoPretendida, { tipo: 'abrir', simbolo: 'XAUUSD.r', direcao: 'buy', volume: 0.1, sl: 1991.5, tp: 2021.5, clientId: clientIdDaCopia(rota.id, 'P1') })
  const p = await processarEventoCopia(ev(2, 'partial', { symbol: 'XAUUSD', direcao: 'buy', volume_fechado: 1, volume: 1 }), rota, loja, e, { interruptores: ligadoSemLive })
  assert.equal(p.resultado, 'sombra')
  assert.deepEqual(p.acaoPretendida, { tipo: 'fechar_parcial', posicao: null, volume: 0.05, fechadoPct: 0.5 })
  const m = await processarEventoCopia(ev(3, 'modify', { symbol: 'XAUUSD', direcao: 'buy', preco: 2000, sl: 2000, tp: 2020 }), rota, loja, e, { interruptores: ligadoSemLive })
  assert.equal(m.resultado, 'sombra')
  const f = await processarEventoCopia(ev(4, 'close', { symbol: 'XAUUSD', direcao: 'buy' }), rota, loja, e, { interruptores: ligadoSemLive })
  assert.equal(f.resultado, 'sombra')
  assert.equal(chamadas.escritas, 0)
  assert.equal([...copias.values()][0].estado, 'fechada')
})
caso('sombra: repetir a abertura não cria segunda cópia', async () => {
  const { loja, copias } = lojaMemoria()
  const { e } = escritorQueRebentaAoEscrever()
  const o = ev(1, 'open', { symbol: 'XAUUSD', direcao: 'buy', volume: 1, preco: 2000 })
  await processarEventoCopia(o, rotaBase, loja, e, { interruptores: ligadoSemLive })
  const r2 = await processarEventoCopia(o, rotaBase, loja, e, { interruptores: ligadoSemLive })
  assert.equal(r2.resultado, 'saltado')
  assert.equal(copias.size, 1)
})
caso('interruptor global desligado → saltado sem ler nada', async () => {
  const { loja } = lojaMemoria()
  const { e, chamadas } = escritorQueRebentaAoEscrever()
  const r = await processarEventoCopia(ev(1, 'open', { symbol: 'XAUUSD', direcao: 'buy', volume: 1 }), rotaBase, loja, e, { interruptores: INTERRUPTORES_FECHADOS })
  assert.equal(r.resultado, 'saltado')
  assert.equal(chamadas.leituras + chamadas.escritas, 0)
})
caso('live (as três fechaduras abertas): abre uma vez, com a cópia gravada ANTES da ordem', async () => {
  const { loja, copias } = lojaMemoria()
  let estadoNoEnvio: string | null = null
  const e: EscritorDestino = {
    ...escritorQueRebentaAoEscrever().e,
    async abrir(o) { estadoNoEnvio = [...copias.values()][0]?.estado ?? null; return { positionId: 'D1', simbolo: o.simbolo } },
  }
  const r = await processarEventoCopia(ev(1, 'open', { symbol: 'EURUSD', direcao: 'sell', volume: 1 }), { ...rotaBase, modo: 'live' }, loja, e, { interruptores: { globalLigado: true, liveDesbloqueado: true, escritaNoProcesso: true } })
  assert.equal(r.resultado, 'ok')
  assert.equal(estadoNoEnvio, 'enviando')
  assert.equal([...copias.values()][0].estado, 'aberta')
})
caso('live: envio incerto e depois não encontrado → erro, nunca reenvio', async () => {
  const { loja, copias } = lojaMemoria()
  let envios = 0
  const e: EscritorDestino = { ...escritorQueRebentaAoEscrever().e, async abrir() { envios++; throw new Error('timed out') }, async posicoes() { return [] } }
  const s: Interruptores = { globalLigado: true, liveDesbloqueado: true, escritaNoProcesso: true }
  const rota = { ...rotaBase, modo: 'live' as const }
  const o = ev(1, 'open', { symbol: 'EURUSD', direcao: 'buy', volume: 1 })
  const r1 = await processarEventoCopia(o, rota, loja, e, { interruptores: s })
  assert.equal(r1.repetir, true)
  const cedo = await processarEventoCopia(o, rota, loja, e, { interruptores: s, agora: () => Date.now() + 1000 })
  assert.equal(cedo.repetir, true)
  const tarde = await processarEventoCopia(o, rota, loja, e, { interruptores: s, agora: () => Date.now() + 120_000 })
  assert.equal(tarde.resultado, 'erro')
  assert.equal(envios, 1)
  assert.equal([...copias.values()][0].estado, 'erro')
})
caso('live: leitura nula do destino num parcial → repetir, nada concluído', async () => {
  const { loja, copias } = lojaMemoria()
  await loja.inserirCopia({ rota_id: rotaBase.id, origem_posicao_id: 'P1', volume_origem_abertura: 1, volume_destino_abertura: 1, estado: 'aberta', destino_posicao_id: 'D1', destino_simbolo: 'EURUSD' })
  const e: EscritorDestino = { ...escritorQueRebentaAoEscrever().e, async posicoes() { return null } }
  const r = await processarEventoCopia(ev(2, 'partial', { volume_fechado: 0.5, volume: 0.5 }), { ...rotaBase, modo: 'live' }, loja, e, { interruptores: { globalLigado: true, liveDesbloqueado: true, escritaNoProcesso: true } })
  assert.equal(r.repetir, true)
  assert.equal([...copias.values()][0].estado, 'aberta')
  assert.equal([...copias.values()][0].fechado_pct, 0)
})

async function main() {
  for (const c of casos) {
    try {
      await c.f()
      n++
    } catch (e) {
      console.error(`✗ ${c.nome}\n  ${e instanceof Error ? e.message : e}`)
      process.exitCode = 1
    }
  }
  console.log(process.exitCode ? `falharam ${casos.length - n} de ${casos.length}` : `copia-contas: ${n} casos, todos certos`)
}
void main()
