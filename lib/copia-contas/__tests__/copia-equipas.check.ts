/**
 * Cópia entre contas × equipas — risco % em destinos TradeLocker (fixtures do detalhe do instrumento),
 * resolução de instrumento, isolamento das chaves MetaApi (casa × equipas), fontes partilhadas por
 * conta física, providers como origem, visibilidade por equipa e o mapeamento da migração do 068.
 *
 *   npx tsx lib/copia-contas/__tests__/copia-equipas.check.ts
 */
import assert from 'node:assert/strict'
import type { TLDetalheInstrumento, TLInstrumento } from '@/lib/tradelocker/client'
import { ehErroDeQuota } from '@/lib/mtmcopy/metaapi-quota'
import { calcularLote, chaveEvento } from '../calculo'
import { providerEhFonteDeCopia, providerVisivel } from '../equipas'
import { agruparFontes, chaveDaFonte, desdeDaFonte, type ContaDaFonte } from '../fontes'
import { motivoPontesAbertas, refDoDestinoAntigo, rotaDoCopiador, type CopiadorAntigo } from '../migrar-funded'
import { processarEventoCopia, type EscritorDestino, type LojaCopia } from '../motor'
import { chaveFisica, MAX_FANOUT, MAX_FANOUT_PROVIDER, validarRota, type ArestaRota, type LinhaContaCopia } from '../regras'
import { RegistoPorToken, chaveDaFonteMt, eLimiteDeEquipa, neutralizarErroDeEquipa, resolverToken } from '../tokens'
import {
  cacheComPrazo, contextoTradeLocker, digitsDoTick, nomesNegociaveis, resolverInstrumentoDestino, valorPorPrecoPorLoteTL,
} from '../tradelocker'
import type { CopiaPosicao, EventoCopia, RotaCopia } from '../tipos'

const casos: { nome: string; f: () => void | Promise<void> }[] = []
const caso = (nome: string, f: () => void | Promise<void>) => casos.push({ nome, f })

// ── fixtures TradeLocker (formato de GET /trade/instruments/{id}) ─────────────
const ROTAS = [{ id: 101, type: 'TRADE' }, { id: 201, type: 'INFO' }]
const INSTRUMENTOS: TLInstrumento[] = [
  { tradableInstrumentId: 1, name: 'XAUUSD', routes: ROTAS },
  { tradableInstrumentId: 2, name: 'EURUSD.X', routes: ROTAS },
  { tradableInstrumentId: 3, name: 'US30', routes: ROTAS },
  { tradableInstrumentId: 4, name: 'BTCUSD', routes: [{ id: 202, type: 'INFO' }] }, // sem rota TRADE
  { tradableInstrumentId: 5, name: 'GOLD', routes: ROTAS },
]
const OURO: TLDetalheInstrumento = {
  name: 'XAUUSD', lotSize: 100, lotStep: 0.01, minLot: 0.01, maxLot: 50, quotingCurrency: 'USD',
  tickSize: [{ leftRangeLimit: 0, tickSize: 0.01 }], tickCost: [{ leftRangeLimit: 0, tickCost: 1 }],
}
const EURUSD: TLDetalheInstrumento = {
  name: 'EURUSD.X', lotSize: 100_000, lotStep: 1_000, minLot: 0.01, maxLot: 100, quotingCurrency: 'USD',
  tickSize: [{ leftRangeLimit: 0, tickSize: 0.00001 }], tickCost: [{ leftRangeLimit: 0, tickCost: 1 }],
}
const US30: TLDetalheInstrumento = {
  name: 'US30', lotSize: 1, lotStep: 0.1, minLot: 0.1, maxLot: 20, quotingCurrency: 'USD',
  // faixas por preço: abaixo de 10 000 o tick vale menos
  tickSize: [{ leftRangeLimit: 0, tickSize: 1 }, { leftRangeLimit: 10_000, tickSize: 0.1 }],
  tickCost: [{ leftRangeLimit: 0, tickCost: 0.5 }, { leftRangeLimit: 10_000, tickCost: 0.1 }],
}
const SEM_TICKS: TLDetalheInstrumento = { name: 'XAUUSD', lotSize: 100, lotStep: 0.01, minLot: 0.01, maxLot: 50, quotingCurrency: 'USD' }

const inst = (nome: string) => resolverInstrumentoDestino(nome, INSTRUMENTOS)!

// ── TradeLocker: valor do tick, regra de lote, risco % ────────────────────────
caso('TL: valor por 1,0 de preço por lote = tickCost/tickSize (ouro 100, EURUSD 100 000)', () => {
  assert.equal(valorPorPrecoPorLoteTL(OURO, 2000, 'USD'), 100)
  assert.equal(Math.round(valorPorPrecoPorLoteTL(EURUSD, 1.1, 'USD')!), 100_000)
})
caso('TL: faixas por preço escolhem o tick certo', () => {
  assert.equal(valorPorPrecoPorLoteTL(US30, 42_000, 'USD'), 1)
  assert.equal(valorPorPrecoPorLoteTL(US30, 9_000, 'USD'), 0.5)
})
caso('TL: sem ticks usa o lotSize só na mesma moeda; noutra moeda → null (não adivinha)', () => {
  assert.equal(valorPorPrecoPorLoteTL(SEM_TICKS, 2000, 'USD'), 100)
  assert.equal(valorPorPrecoPorLoteTL(SEM_TICKS, 2000, 'EUR'), null)
  assert.equal(valorPorPrecoPorLoteTL(SEM_TICKS, 2000, null), null)
})
caso('TL: dígitos pelo tickSize', () => {
  assert.equal(digitsDoTick(OURO, 2000), 2)
  assert.equal(digitsDoTick(EURUSD, 1.1), 5)
})
caso('TL: contexto com lotStep em unidades (1000/100000 → 0,01)', () => {
  const c = contextoTradeLocker({ instrumento: inst('EURUSD'), detalhe: EURUSD, equity: 5000, saldo: 5000, moedaConta: 'USD', bid: 1.1, ask: 1.10002 })
  assert.deepEqual(c.regra, { min: 0.01, max: 100, step: 0.01 })
  assert.equal(c.simbolo, 'EURUSD.X')
})
caso('TL risco: ouro 1% de 10k, SL a 5,00 → 0,20', () => {
  const c = contextoTradeLocker({ instrumento: inst('XAUUSD'), detalhe: OURO, equity: 10_000, saldo: 10_000, moedaConta: 'USD', bid: 2000, ask: 2000.3 })
  const r = calcularLote({ modo: 'risco_pct', valor: 1, volumeOrigem: 1, saldoOrigem: null, equityDestino: c.equity, loteMax: null, regra: c.regra, distanciaSl: 5, valorPorPrecoPorLote: c.valorPorPrecoPorLote })
  assert.equal(r.ok && r.volume, 0.2)
})
caso('TL risco: EURUSD 0,5% de 5k, SL 20 pips → 0,125 arredonda PARA BAIXO a 0,12', () => {
  const c = contextoTradeLocker({ instrumento: inst('EURUSD'), detalhe: EURUSD, equity: 5_000, saldo: 5_000, moedaConta: 'USD', bid: 1.1, ask: 1.1 })
  const r = calcularLote({ modo: 'risco_pct', valor: 0.5, volumeOrigem: 1, saldoOrigem: null, equityDestino: c.equity, loteMax: null, regra: c.regra, distanciaSl: 0.002, valorPorPrecoPorLote: c.valorPorPrecoPorLote })
  assert.equal(r.ok && r.volume, 0.12)
})
caso('TL risco: US30 com mínimo 0,1 e passo 0,1 — 1% de 10k, SL 50 pontos a 42 000 → 2,0', () => {
  const c = contextoTradeLocker({ instrumento: inst('US30'), detalhe: US30, equity: 10_000, saldo: 10_000, moedaConta: 'USD', bid: 42_000, ask: 42_001 })
  const r = calcularLote({ modo: 'risco_pct', valor: 1, volumeOrigem: 1, saldoOrigem: null, equityDestino: c.equity, loteMax: null, regra: c.regra, distanciaSl: 50, valorPorPrecoPorLote: c.valorPorPrecoPorLote })
  assert.equal(r.ok && r.volume, 2)
})
caso('TL risco: acima do maxLot corta ao máximo; conta pequena abaixo de metade do mínimo recusa', () => {
  const c = contextoTradeLocker({ instrumento: inst('US30'), detalhe: US30, equity: 10_000_000, saldo: null, moedaConta: 'USD', bid: 42_000, ask: 42_000 })
  const alto = calcularLote({ modo: 'risco_pct', valor: 1, volumeOrigem: 1, saldoOrigem: null, equityDestino: c.equity, loteMax: null, regra: c.regra, distanciaSl: 50, valorPorPrecoPorLote: c.valorPorPrecoPorLote })
  assert.equal(alto.ok && alto.volume, 20)
  const pequena = calcularLote({ modo: 'risco_pct', valor: 0.1, volumeOrigem: 1, saldoOrigem: null, equityDestino: 200, loteMax: null, regra: c.regra, distanciaSl: 50, valorPorPrecoPorLote: c.valorPorPrecoPorLote })
  assert.equal(pequena.ok, false)
})
caso('TL risco: sem valor de tick (moeda diferente) → recusa em vez de inventar', () => {
  const c = contextoTradeLocker({ instrumento: inst('XAUUSD'), detalhe: SEM_TICKS, equity: 10_000, saldo: 10_000, moedaConta: 'EUR', bid: 2000, ask: 2000 })
  const r = calcularLote({ modo: 'risco_pct', valor: 1, volumeOrigem: 1, saldoOrigem: null, equityDestino: c.equity, loteMax: null, regra: c.regra, distanciaSl: 5, valorPorPrecoPorLote: c.valorPorPrecoPorLote })
  assert.equal(r.ok, false)
})

// ── TradeLocker: símbolos ─────────────────────────────────────────────────────
caso('TL símbolo: nome exacto ganha; canónico com sufixo resolve; sem rota TRADE fica de fora', () => {
  assert.equal(resolverInstrumentoDestino('GOLD', INSTRUMENTOS)?.instrumento.name, 'GOLD')
  assert.equal(resolverInstrumentoDestino('EURUSD', INSTRUMENTOS)?.instrumento.name, 'EURUSD.X')
  assert.equal(resolverInstrumentoDestino('XAUUSD.pro', INSTRUMENTOS)?.instrumento.name, 'XAUUSD')
  assert.equal(resolverInstrumentoDestino('BTCUSD', INSTRUMENTOS), null)
  assert.deepEqual(nomesNegociaveis(INSTRUMENTOS).sort(), ['EURUSD.X', 'GOLD', 'US30', 'XAUUSD'])
  const r = resolverInstrumentoDestino('EURUSD', INSTRUMENTOS)!
  assert.equal(r.routeTrade, 101)
  assert.equal(r.routeInfo, 201)
})
caso('TL cache longa: o mesmo instrumento lê-se uma vez; pedidos em paralelo partilham a leitura', async () => {
  let t = 0
  let leituras = 0
  const c = cacheComPrazo<number>(12 * 3600_000, () => t)
  const ler = async () => { leituras++; return 7 }
  await Promise.all([c.obter('live:9:1', ler), c.obter('live:9:1', ler)])
  t = 11 * 3600_000
  await c.obter('live:9:1', ler)
  assert.equal(leituras, 1)
  t = 13 * 3600_000
  await c.obter('live:9:1', ler)
  assert.equal(leituras, 2)
  await c.obter('live:10:1', ler) // outra conta, outra chave
  assert.equal(leituras, 3)
})

// ── motor em sombra com destino TradeLocker ───────────────────────────────────
const rotaTL: RotaCopia = {
  id: '99999999-2222-3333-4444-555555555555', user_id: 'u1', origem_tipo: 'mt5', origem_ref: 'prov:aaaaaaaa-0000-0000-0000-000000000001',
  origem_chave: 'mt:1@a', destino_tipo: 'tradelocker', destino_ref: 'auto:aaaaaaaa-0000-0000-0000-000000000002', destino_chave: 'tl:live:9',
  rotulo: null, modo_lote: 'risco_pct', valor: 0.5, mapa_simbolos: {}, filtro_simbolos: [], filtro_direcao: 'ambas', lote_max: null,
  max_abertas: null, copiar_sl: true, copiar_tp: true, copiar_parciais: true, copiar_modificacoes: true, fechar_com_origem: true,
  ativa: true, modo: 'shadow', estado: 'aprovada', pedido_pelo_cliente: false, notas: null, aprovada_em: null, created_at: new Date().toISOString(),
}
function lojaMem() {
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
    async saldoOrigem() { return null },
  }
  return { loja, copias }
}
/** Escritor TL falso montado com as MESMAS peças do escritor real (contextoTradeLocker + resolução). */
function escritorTLFalso(detalhes: Record<string, TLDetalheInstrumento>, cot: Record<string, { bid: number; ask: number }>, equity: number) {
  const chamadas = { escritas: 0 }
  const e: EscritorDestino = {
    async simbolos() { return nomesNegociaveis(INSTRUMENTOS) },
    async contexto(simbolo) {
      const i = resolverInstrumentoDestino(simbolo, INSTRUMENTOS)
      if (!i) return null
      const q = cot[i.instrumento.name]
      return contextoTradeLocker({ instrumento: i, detalhe: detalhes[i.instrumento.name] ?? null, equity, saldo: equity, moedaConta: 'USD', bid: q?.bid ?? null, ask: q?.ask ?? null })
    },
    async posicoes() { return [] },
    async abrir() { chamadas.escritas++; throw new Error('SOMBRA ESCREVEU') },
    async modificar() { chamadas.escritas++; throw new Error('SOMBRA ESCREVEU') },
    async fechar() { chamadas.escritas++; throw new Error('SOMBRA ESCREVEU') },
  }
  return { e, chamadas }
}
const evTL = (id: number, tipo: EventoCopia['tipo'], payload: EventoCopia['payload']): EventoCopia => ({
  id, rota_id: rotaTL.id, origem_posicao_id: 'P9', tipo, payload, chave: chaveEvento(rotaTL.id, 'P9', tipo, id), origem_em: null, criado_em: new Date().toISOString(), tentativas: 0,
})
const ligado = { globalLigado: true, liveDesbloqueado: false, escritaNoProcesso: false }

caso('sombra TL: EURUSD sell 0,5% de 5k com SL 20 pips → abrir EURUSD.X 0,12, stops por distância a 5 casas, zero escritas', async () => {
  const { loja, copias } = lojaMem()
  const { e, chamadas } = escritorTLFalso({ 'EURUSD.X': EURUSD }, { 'EURUSD.X': { bid: 1.10010, ask: 1.10012 } }, 5_000)
  const d = await processarEventoCopia(evTL(1, 'open', { symbol: 'EURUSD', direcao: 'sell', volume: 1, preco: 1.1, sl: 1.102, tp: 1.096 }), rotaTL, loja, e, { interruptores: ligado })
  assert.equal(d.resultado, 'sombra')
  assert.equal(d.acaoPretendida.tipo, 'abrir')
  if (d.acaoPretendida.tipo !== 'abrir') return
  assert.equal(d.acaoPretendida.simbolo, 'EURUSD.X')
  assert.equal(d.acaoPretendida.volume, 0.12)
  assert.equal(d.acaoPretendida.sl, 1.1021)
  assert.equal(d.acaoPretendida.tp, 1.0961)
  assert.equal(chamadas.escritas, 0)
  assert.equal([...copias.values()][0].volume_destino_abertura, 0.12)
})
caso('sombra TL: mapa manual XAUUSD→GOLD usa o instrumento GOLD', async () => {
  const { loja } = lojaMem()
  const { e } = escritorTLFalso({ GOLD: OURO }, { GOLD: { bid: 2000, ask: 2000.2 } }, 10_000)
  const d = await processarEventoCopia(evTL(1, 'open', { symbol: 'XAUUSD', direcao: 'buy', volume: 1, preco: 2000, sl: 1995 }), { ...rotaTL, valor: 1, mapa_simbolos: { XAUUSD: 'GOLD' } }, loja, e, { interruptores: ligado })
  assert.equal(d.acaoPretendida.tipo === 'abrir' && d.acaoPretendida.simbolo, 'GOLD')
  assert.equal(d.acaoPretendida.tipo === 'abrir' && d.acaoPretendida.volume, 0.2)
})
caso('sombra TL: instrumento sem rota TRADE → recusado (não existe no destino)', async () => {
  const { loja } = lojaMem()
  const { e } = escritorTLFalso({}, {}, 10_000)
  const d = await processarEventoCopia(evTL(1, 'open', { symbol: 'BTCUSD', direcao: 'buy', volume: 1, preco: 60_000, sl: 59_000 }), rotaTL, loja, e, { interruptores: ligado })
  assert.equal(d.resultado, 'recusado')
})
caso('sombra TL: risco % sem SL na origem → recusado', async () => {
  const { loja } = lojaMem()
  const { e } = escritorTLFalso({ XAUUSD: OURO }, { XAUUSD: { bid: 2000, ask: 2000 } }, 10_000)
  const d = await processarEventoCopia(evTL(1, 'open', { symbol: 'XAUUSD', direcao: 'buy', volume: 1, preco: 2000 }), rotaTL, loja, e, { interruptores: ligado })
  assert.equal(d.resultado, 'recusado')
})

// ── chaves MetaApi: casa × equipas ────────────────────────────────────────────
const CASA = 'tok-casa'
const EQ_A = 'tok-equipa-a'
caso('token: site/wt/funded usam sempre a casa, mesmo com equipa', () => {
  for (const ref of ['site:aaaaaaaa-0000-0000-0000-000000000001', 'wt:aaaaaaaa-0000-0000-0000-000000000001', 'funded:aaaaaaaa-0000-0000-0000-000000000001']) {
    assert.deepEqual(resolverToken({ ref, tenantId: 'A', tokenEquipa: EQ_A, tokenCasa: CASA }), { chave: 'casa', token: CASA })
  }
})
caso('token: conta MTM Auto de equipa com chave → chave da equipa; equipa sem chave → casa', () => {
  const ref = 'auto:aaaaaaaa-0000-0000-0000-000000000001'
  assert.deepEqual(resolverToken({ ref, tenantId: 'A', tokenEquipa: EQ_A, tokenCasa: CASA }), { chave: 'equipa:A', token: EQ_A })
  assert.deepEqual(resolverToken({ ref, tenantId: 'A', tokenEquipa: null, tokenCasa: CASA }), { chave: 'casa', token: CASA })
})
caso('token: provider na chave da equipa nunca cai na casa (sem chave → null); provider antigo → casa', () => {
  const ref = 'prov:aaaaaaaa-0000-0000-0000-000000000001'
  assert.deepEqual(resolverToken({ ref, tenantId: 'A', tokenEquipa: EQ_A, providerNaChaveEquipa: true, tokenCasa: CASA }), { chave: 'equipa:A', token: EQ_A })
  assert.equal(resolverToken({ ref, tenantId: 'A', tokenEquipa: null, providerNaChaveEquipa: true, tokenCasa: CASA }), null)
  assert.deepEqual(resolverToken({ ref, tenantId: 'A', tokenEquipa: EQ_A, providerNaChaveEquipa: false, tokenCasa: CASA }), { chave: 'casa', token: CASA })
})
caso('token: uma instância do SDK por chave; nunca a de uma equipa noutra', () => {
  const criadas: string[] = []
  const r = new RegistoPorToken((t) => { criadas.push(t.chave); return { token: t.token } })
  const a1 = r.cliente({ chave: 'equipa:A', token: EQ_A })
  const a2 = r.cliente({ chave: 'equipa:A', token: EQ_A })
  const b = r.cliente({ chave: 'equipa:B', token: 'tok-b' })
  const casa = r.cliente({ chave: 'casa', token: CASA })
  assert.equal(a1, a2)
  assert.notEqual(a1, b)
  assert.equal(a1.token, EQ_A)
  assert.equal(b.token, 'tok-b')
  assert.equal(casa.token, CASA)
  assert.deepEqual(criadas, ['equipa:A', 'equipa:B', 'casa'])
})
caso('token: limite numa equipa pausa só essa equipa', () => {
  const r = new RegistoPorToken(() => ({}))
  r.pausar('equipa:A', 5_000)
  assert.equal(r.pausadaAte('equipa:A', 1_000), 5_000)
  assert.equal(r.pausadaAte('equipa:B', 1_000), 0)
  assert.equal(r.pausadaAte('casa', 1_000), 0)
})
caso('token: erro de quota de equipa chega neutralizado ao guarda da casa; o da casa passa intacto', () => {
  const erro = Object.assign(new Error('You have used all your account cpu credits'), { status: 429 })
  const neutro = neutralizarErroDeEquipa(erro, 'equipa:A')
  assert.equal(ehErroDeQuota(erro), true)
  assert.equal(ehErroDeQuota(neutro), false)
  assert.equal(eLimiteDeEquipa(neutro), true)
  assert.equal(neutralizarErroDeEquipa(erro, 'casa'), erro)
  const outro = new Error('not found')
  assert.equal(neutralizarErroDeEquipa(outro, 'equipa:A'), outro)
  assert.ok(!String((neutro as Error).message).includes(EQ_A))
})

// ── fontes partilhadas ────────────────────────────────────────────────────────
const rota = (id: string, origem_ref: string, origem_chave: string, extra: Partial<RotaCopia> = {}): RotaCopia => ({ ...rotaTL, id, origem_ref, origem_chave, origem_tipo: 'mt5', ...extra })
caso('fontes: a mesma conta física (cliente T2T + provider) → UMA ligação para as duas rotas', () => {
  const rotas = [rota('r1', 'site:1', 'mt:1@s'), rota('r2', 'prov:2', 'mt:1@s'), rota('r3', 'auto:3', 'mt:2@s')]
  const contas = new Map<string, ContaDaFonte>([
    ['site:1', { ref: 'site:1', plataforma: 'mt5', metaapiAccountId: 'm1', chaveToken: 'casa' }],
    ['prov:2', { ref: 'prov:2', plataforma: 'mt5', metaapiAccountId: 'm1', chaveToken: 'casa' }],
    ['auto:3', { ref: 'auto:3', plataforma: 'mt5', metaapiAccountId: 'm3', chaveToken: 'casa' }],
  ])
  const { fontes, semFonte } = agruparFontes(rotas, contas)
  assert.equal(fontes.size, 2)
  assert.deepEqual(fontes.get('casa|mt:1@s')!.rotas.map((r) => r.id).sort(), ['r1', 'r2'])
  assert.equal(semFonte.length, 0)
})
caso('fontes: a mesma conta física em chaves diferentes são fontes diferentes (nunca misturar)', () => {
  const rotas = [rota('r1', 'auto:1', 'mt:1@s'), rota('r2', 'prov:2', 'mt:1@s')]
  const contas = new Map<string, ContaDaFonte>([
    ['auto:1', { ref: 'auto:1', plataforma: 'mt5', metaapiAccountId: 'mA', chaveToken: 'equipa:A' }],
    ['prov:2', { ref: 'prov:2', plataforma: 'mt5', metaapiAccountId: 'mB', chaveToken: 'equipa:B' }],
  ])
  const { fontes } = agruparFontes(rotas, contas)
  assert.equal(fontes.size, 2)
  assert.equal(fontes.get('equipa:A|mt:1@s')!.metaapiAccountId, 'mA')
  assert.equal(fontes.get('equipa:B|mt:1@s')!.chaveToken, 'equipa:B')
  assert.equal(chaveDaFonteMt('equipa:A', 'MA'), 'equipa:A|ma')
})
caso('fontes: TradeLocker partilhada por conta física; MTM Funded sem fonte; sem chave → registado, não liga', () => {
  const rotas = [
    rota('t1', 'auto:1', 'tl:live:9', { origem_tipo: 'tradelocker' }), rota('t2', 'prov:2', 'tl:live:9', { origem_tipo: 'tradelocker' }),
    rota('f1', 'funded:3', 'mtmfunded:3', { origem_tipo: 'mtmfunded' }), rota('x1', 'prov:4', 'mt:4@s'),
  ]
  const contas = new Map<string, ContaDaFonte | null>([
    ['auto:1', { ref: 'auto:1', plataforma: 'tradelocker', metaapiAccountId: null, chaveToken: null }],
    ['prov:2', { ref: 'prov:2', plataforma: 'tradelocker', metaapiAccountId: null, chaveToken: null }],
    ['prov:4', { ref: 'prov:4', plataforma: 'mt5', metaapiAccountId: 'm4', chaveToken: null }],
  ])
  const { fontes, semFonte } = agruparFontes(rotas, contas)
  assert.equal(fontes.size, 1)
  assert.equal(fontes.get('tl|tl:live:9')!.rotas.length, 2)
  assert.deepEqual(semFonte.map((s) => s.rotaId), ['x1'])
  assert.equal(chaveDaFonte('mtmfunded', 'mtmfunded:3', 'casa'), null)
})
caso('fontes: desde = aprovação mais antiga', () => {
  assert.equal(desdeDaFonte([{ aprovada_em: '2026-09-15T10:00:00Z' }, { aprovada_em: '2026-09-14T10:00:00Z' }]), Date.parse('2026-09-14T10:00:00Z'))
})

// ── providers como origem ─────────────────────────────────────────────────────
const conta = (ref: string, plataforma: LinhaContaCopia['plataforma'], extra: Partial<LinhaContaCopia> = {}): LinhaContaCopia => ({ ref, plataforma, userId: 'u1', ...extra })
caso('provider: origem de outro dono é aceite; provider como destino é recusado', () => {
  const prov = conta('prov:aaaaaaaa-0000-0000-0000-000000000009', 'tradelocker', { userId: 'admin-equipa', tlEnv: 'live', tlAccountId: '9', provider: { id: 'p', tenantId: 'A' }, soLeitura: true })
  const cliente = conta('auto:aaaaaaaa-0000-0000-0000-000000000001', 'mt5', { login: '1', servidor: 's' })
  assert.equal(validarRota(prov, cliente, []).ok, true)
  assert.equal((validarRota(cliente, prov, []) as { erro: string }).erro, 'provider_destino')
})
caso(`provider: fan-out até ${MAX_FANOUT_PROVIDER} (contas de clientes continuam em ${MAX_FANOUT})`, () => {
  const prov = conta('prov:aaaaaaaa-0000-0000-0000-000000000009', 'mtmfunded', { userId: 'x', fundedAccountId: 'f9', provider: { id: 'p', tenantId: null } })
  const muitas: ArestaRota[] = Array.from({ length: 50 }, (_, i) => ({ id: String(i), origem_chave: 'mtmfunded:f9', destino_chave: `mt:${i}@s` }))
  assert.equal(validarRota(prov, conta('site:d', 'mt5', { login: '999', servidor: 's' }), muitas).ok, true)
  const cheias: ArestaRota[] = Array.from({ length: MAX_FANOUT_PROVIDER }, (_, i) => ({ id: String(i), origem_chave: 'mtmfunded:f9', destino_chave: `mt:${i}@s` }))
  assert.equal((validarRota(prov, conta('site:d', 'mt5', { login: '99999', servidor: 's' }), cheias) as { erro: string }).erro, 'fanout')
})
caso('provider: MTM Funded partilha a chave física com funded: (o trigger emite para as duas); MetaApi antigo sem login usa o id', () => {
  assert.equal(chaveFisica(conta('prov:aaaaaaaa-0000-0000-0000-000000000009', 'mtmfunded', { fundedAccountId: 'ABC' })), chaveFisica(conta('funded:abc', 'mtmfunded', { fundedAccountId: 'abc' })))
  assert.equal(chaveFisica({ ref: 'prov:aaaaaaaa-0000-0000-0000-000000000009', plataforma: 'mt5', metaapiAccountId: 'M-1' }), 'metaapi:m-1')
  assert.equal(chaveFisica({ ref: 'site:aaaaaaaa-0000-0000-0000-000000000009', plataforma: 'mt5', metaapiAccountId: 'M-1' }), null)
})
caso('equipas: visibilidade igual ao catálogo do MTM Auto', () => {
  assert.equal(providerVisivel({ tenantId: null, partilhadaCom: [] }, 'A', 'CASA'), true)
  assert.equal(providerVisivel({ tenantId: 'A', partilhadaCom: [] }, 'A', 'CASA'), true)
  assert.equal(providerVisivel({ tenantId: 'A', partilhadaCom: [] }, 'B', 'CASA'), false)
  assert.equal(providerVisivel({ tenantId: 'A', partilhadaCom: ['B'] }, 'B', 'CASA'), true)
  assert.equal(providerVisivel({ tenantId: 'CASA', partilhadaCom: [] }, null, 'CASA'), true)
  assert.equal(providerEhFonteDeCopia({ tipo: 'mtm_t2t' }), false)
  assert.equal(providerEhFonteDeCopia({ tipo: 'tradelocker', tl_account_id: '9' }), true)
  assert.equal(providerEhFonteDeCopia({ tipo: 'mtmfunded', funded_account_id: null }), false)
})

// ── migração do copiador 068 ──────────────────────────────────────────────────
const antigo = (extra: Partial<CopiadorAntigo> = {}): CopiadorAntigo => ({
  id: 'cccccccc-0000-0000-0000-000000000001', user_id: 'u1', account_id: 'ffffffff-0000-0000-0000-000000000001', destino_tipo: 'mtmcopy',
  destino_id: 'dddddddd-0000-0000-0000-000000000001', modo_lote: 'risco_pct', valor: 0.5, lote_max: 2, max_posicoes: 3, perda_diaria_max: null,
  copiar_sl: true, copiar_tp: false, simbolos: ['xauusd', 'XAUUSD', 'eurusd'], ativo: true, pausado_motivo: null, created_by: 'admin', ...extra,
})
const destinoSite = conta('site:dddddddd-0000-0000-0000-000000000001', 'mt5', { login: '123', servidor: 'PUPrime-Live' })
caso('migração: activo → aprovada + ativa + SOMBRA, mesmo lote/valor/filtros', () => {
  const r = rotaDoCopiador(antigo(), destinoSite, [], '2026-09-15T12:00:00Z')
  assert.equal(r.ok, true)
  if (!r.ok) return
  const l = r.linha
  assert.equal(l.origem_ref, 'funded:ffffffff-0000-0000-0000-000000000001')
  assert.equal(l.origem_chave, 'mtmfunded:ffffffff-0000-0000-0000-000000000001')
  assert.equal(l.destino_ref, 'site:dddddddd-0000-0000-0000-000000000001')
  assert.equal(l.destino_chave, 'mt:123@puprime-live')
  assert.deepEqual([l.estado, l.ativa, l.modo], ['aprovada', true, 'shadow'])
  assert.deepEqual([l.modo_lote, l.valor, l.lote_max, l.max_abertas, l.copiar_sl, l.copiar_tp], ['risco_pct', 0.5, 2, 3, true, false])
  assert.deepEqual(l.filtro_simbolos, ['XAUUSD', 'EURUSD'])
  assert.equal(l.migrada_de, antigo().id)
  assert.equal(l.aprovada_em, '2026-09-15T12:00:00Z')
})
caso('migração: inactivo → pedido, inactiva, com o motivo da pausa', () => {
  const r = rotaDoCopiador(antigo({ ativo: false, pausado_motivo: 'sem MTM Copy' }), destinoSite, [], 'x')
  assert.ok(r.ok)
  if (!r.ok) return
  assert.deepEqual([r.linha.estado, r.linha.ativa, r.linha.modo, r.linha.pausada_motivo, r.linha.aprovada_em], ['pedido', false, 'shadow', 'sem MTM Copy', null])
})
caso('migração: mtmauto → auto:; tradelocker e destino apagado saltam', () => {
  assert.equal(refDoDestinoAntigo({ destino_tipo: 'mtmauto', destino_id: 'x' }), 'auto:x')
  assert.equal(rotaDoCopiador(antigo({ destino_tipo: 'tradelocker' }), destinoSite, [], 'x').ok, false)
  assert.equal(rotaDoCopiador(antigo(), null, [], 'x').ok, false)
})
caso('migração: valor nulo — proporcional → 1 com aviso; fixo/risco → salta (não se inventa lote)', () => {
  const p = rotaDoCopiador(antigo({ modo_lote: 'proporcional_saldo', valor: null }), destinoSite, [], 'x')
  assert.ok(p.ok && p.linha.valor === 1 && p.avisos.length === 1)
  assert.equal(rotaDoCopiador(antigo({ modo_lote: 'fixo', valor: null }), destinoSite, [], 'x').ok, false)
  assert.equal(rotaDoCopiador(antigo({ modo_lote: 'risco_pct', valor: null }), destinoSite, [], 'x').ok, false)
  assert.equal(rotaDoCopiador(antigo({ modo_lote: 'risco_pct', valor: 12 }), destinoSite, [], 'x').ok, false)
})
caso('migração: perda diária fica nas notas (sem equivalente); duplicada e cópias reais abertas saltam', () => {
  const r = rotaDoCopiador(antigo({ perda_diaria_max: 4 }), destinoSite, [], 'x')
  assert.ok(r.ok && /Perda diária máx\. 4%/.test(r.linha.notas ?? ''))
  const ja: ArestaRota[] = [{ id: 'z', origem_chave: 'mtmfunded:ffffffff-0000-0000-0000-000000000001', destino_chave: 'mt:123@puprime-live' }]
  assert.equal(rotaDoCopiador(antigo(), destinoSite, ja, 'x').ok, false)
  assert.ok(motivoPontesAbertas(2))
  assert.equal(motivoPontesAbertas(0), null)
})
caso('migração: destino de OUTRO dono é recusado (a regra do mesmo dono continua)', () => {
  assert.equal(rotaDoCopiador(antigo(), { ...destinoSite, userId: 'u2' }, [], 'x').ok, false)
})

async function main() {
  let n = 0
  for (const c of casos) {
    try {
      await c.f()
      n++
    } catch (e) {
      console.error(`✗ ${c.nome}\n  ${e instanceof Error ? e.message : e}`)
      process.exitCode = 1
    }
  }
  console.log(process.exitCode ? `falharam ${casos.length - n} de ${casos.length}` : `copia-equipas: ${n} casos, todos certos`)
}
void main()
