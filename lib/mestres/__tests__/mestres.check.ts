/**
 * MESTRES NOSSAS — dimensionamento de lote por conta, pips→preço a partir da entrada REAL, dedupe
 * (evento × conta, entre caminhos, modificações em rajada), decisão live/sombra/parado, exposição,
 * falhas/alertas, concorrência, planeamento de rotas, corte da CopyFactory, T2T e o motor da cópia com
 * os ganchos (kill-switch antes de cada escrita, guardas só de ABERTURA, re-ancoragem, registo).
 * Números à mão. Puro: sem base, sem corretora.
 *
 *   npx tsx lib/mestres/__tests__/mestres.check.ts
 */
import assert from 'node:assert/strict'
import { calcularLote, chaveEvento, escolherNegociavel } from '../../copia-contas/calculo'
import { processarEventoCopia, type EscritorDestino, type GanchosMotor, type LojaCopia, type RegistoOrdemMotor } from '../../copia-contas/motor'
import type { CopiaPosicao, EventoCopia, RotaCopia } from '../../copia-contas/tipos'
import { Limitador, capacidadeDoServidor, servidorDaChave } from '../concorrencia'
import { corpoDoPut, corteConfirmado, idsServidosPeloMotor, planoDeCorte } from '../copyfactory-corte'
import { aberturaAtrasada, aposResultado, decidirModo, eFalhaTecnica, motivoExposicao, riscoPctDaPosicao, type EntradaDecisao } from '../decisao'
import { colapsarModificacoesDaFila, conflitoEntreCaminhos, impressaoParaConta } from '../dedupe'
import { loteDaLigacaoSite, loteDaSubscricaoAuto, valorPorPrecoDoTick } from '../lote'
import { digitosSeguros, niveisEmPips, niveisNaConta, reancorar } from '../pips'
import { stopsNoDestino } from '../../copia-contas/calculo'
import { ligacaoSegueEstrategia, planearRotasDaEstrategia, planoDeEscrita, type RotaExistente } from '../planear'
import { escolherPosicaoMestre, estrategiaDoSinalT2T } from '../t2t'
import { contaPorOmissao, lerConfigGlobal, type ContaMestres, type EstrategiaMestre } from '../tipos'

let n = 0
const casos: { nome: string; f: () => void | Promise<void> }[] = []
const caso = (nome: string, f: () => void | Promise<void>) => casos.push({ nome, f })
const perto = (a: number | null | undefined, b: number, eps = 1e-6) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} ≠ ${b}`)
const FX = { min: 0.01, max: 100, step: 0.01 }

// ── dimensionamento por conta ───────────────────────────────────────────────
caso('site: strategy_lots da estratégia manda (lote fixo)', () => {
  const r = loteDaLigacaoSite({ lot_mode: 'risk_percent', lot_value: 1, strategy_lots: { Wl1B: 0.03, Hvmg: 0.01 } }, { idsCopyFactory: ['Wl1B', 'SDNb'] })
  assert.ok(r.ok)
  assert.equal(r.ok && r.lote.modo_lote, 'fixo')
  assert.equal(r.ok && r.lote.valor, 0.03)
})
caso('site: risco % limitado ao max_risk_percent', () => {
  const r = loteDaLigacaoSite({ lot_mode: 'risk_percent', lot_value: 3, max_risk_percent: 1 })
  assert.equal(r.ok && r.lote.modo_lote, 'risco_pct')
  assert.equal(r.ok && r.lote.valor, 1)
})
caso('site: multiplier nunca inventa lotes — cai no max_risk_percent, ou recusa', () => {
  const a = loteDaLigacaoSite({ lot_mode: 'multiplier', lot_value: 1, max_risk_percent: 0.5 })
  assert.equal(a.ok && a.lote.modo_lote, 'risco_pct')
  assert.equal(a.ok && a.lote.valor, 0.5)
  assert.equal(loteDaLigacaoSite({ lot_mode: 'multiplier', lot_value: 1 }).ok, false)
})
caso('site: Equity Edge sem SL/TP à corretora; lote fixo forçado (bónus) vence tudo', () => {
  const e = loteDaLigacaoSite({ lot_mode: 'risk_percent', lot_value: 0.25, prop_firm_type: 'equity_edge' })
  assert.equal(e.ok && e.lote.copiar_sl, false)
  assert.equal(e.ok && e.lote.copiar_tp, false)
  const f = loteDaLigacaoSite({ lot_mode: 'risk_percent', lot_value: 2, strategy_lots: { Wl1B: 0.5 } }, { idsCopyFactory: ['Wl1B'], loteFixoForcado: 0.01 })
  assert.equal(f.ok && f.lote.modo_lote, 'fixo')
  assert.equal(f.ok && f.lote.valor, 0.01)
})
caso('site T2T: risco por fonte ({riscoPct, riscoMaxPct}) manda sobre t2t_lot_*', () => {
  const r = loteDaLigacaoSite({ lot_mode: 'fixed', lot_value: 0.1, t2t_lot_mode: 'risk_percent', t2t_lot_value: 1, t2t_source_risk: { 'sensei-scanner': { riscoPct: 0.8, riscoMaxPct: 0.5 } } }, { t2t: true, fonteT2T: 'sensei-scanner' })
  assert.equal(r.ok && r.lote.modo_lote, 'risco_pct')
  assert.equal(r.ok && r.lote.valor, 0.5)
  const s = loteDaLigacaoSite({ lot_mode: 'fixed', lot_value: 0.1, t2t_lot_mode: 'risk_percent', t2t_lot_value: 1 }, { t2t: true, fonteT2T: 'outra' })
  assert.equal(s.ok && s.lote.valor, 1)
})
caso('MTM Auto: multiplicador multiplica o RISCO e o tecto manda', () => {
  const r = loteDaSubscricaoAuto({ modo_risco: 'multiplicador', risco_pct: 1, multiplicador: 3 }, { risco_max_pct: 2 })
  assert.equal(r.ok && r.lote.modo_lote, 'risco_pct')
  assert.equal(r.ok && r.lote.valor, 2)
  const f = loteDaSubscricaoAuto({ modo_risco: 'lote', lote_fixo: 0.05 }, {})
  assert.equal(f.ok && f.lote.valor, 0.05)
  assert.equal(loteDaSubscricaoAuto({ simbolos: ['XAUUSD'] }, { simbolos_permitidos: ['EURUSD'], risco_pct: 1 }).ok, false)
})
caso('valor do tick → risco % certo num par com lucro noutra moeda (USDJPY numa conta USD)', () => {
  // tick 0,001 vale 0,6667 USD por lote (100 000 JPY × 0,001 / 150) → 1,0 de preço = 666,7 USD/lote
  const v = valorPorPrecoDoTick(0.6667, 0.001)
  perto(v, 666.7, 1e-6)
  // 1% de 10 000 = 100 USD; SL 20 pips = 0,20 → 100 / (0,20 × 666,7) = 0,749… → PARA BAIXO 0,74
  const l = calcularLote({ modo: 'risco_pct', valor: 1, volumeOrigem: 0.1, saldoOrigem: null, equityDestino: 10_000, loteMax: null, regra: FX, distanciaSl: 0.2, valorPorPrecoPorLote: v })
  assert.equal(l.ok && l.volume, 0.74)
  assert.equal(valorPorPrecoDoTick(null, 0.001), null)
})
caso('ouro: 1% de 5 000 com SL de 50 pips (5,00) e contrato 100 → 0,10', () => {
  const l = calcularLote({ modo: 'risco_pct', valor: 1, volumeOrigem: 0.1, saldoOrigem: null, equityDestino: 5_000, loteMax: null, regra: FX, distanciaSl: 5, valorPorPrecoPorLote: 100 })
  assert.equal(l.ok && l.volume, 0.1)
})
caso('símbolo negociável: salta o DISABLED (VT Markets EURUSD) e prefere FULL a desconhecido', () => {
  const i = escolherNegociavel([{ simbolo: 'EURUSD', tradeMode: 'SYMBOL_TRADE_MODE_DISABLED' }, { simbolo: 'EURUSD-STD', tradeMode: 'SYMBOL_TRADE_MODE_FULL' }], 'buy')
  assert.equal(i, 1)
  assert.equal(escolherNegociavel([{ simbolo: 'A' }, { simbolo: 'B', tradeMode: 'SYMBOL_TRADE_MODE_FULL' }], 'sell'), 1)
  assert.equal(escolherNegociavel([{ simbolo: 'A', tradeMode: 'SYMBOL_TRADE_MODE_CLOSEONLY' }], 'buy'), -1)
  assert.equal(escolherNegociavel([{ simbolo: 'A', tradeMode: 'SYMBOL_TRADE_MODE_LONGONLY' }], 'sell'), -1)
})

// ── pips → preço pela entrada REAL ──────────────────────────────────────────
caso('ouro compra: SL 50 pips e TP 100 pips da mestre sobre a entrada real do cliente', () => {
  const p = niveisEmPips({ direcao: 'buy', entrada: 2000, sl: 1995, tp: 2010, symbol: 'XAUUSD' })
  perto(p.slPips, -50)
  perto(p.tpPips, 100)
  assert.deepEqual(niveisNaConta({ direcao: 'buy', entradaReal: 2003.4, pips: p, symbol: 'XAUUSD-STD', digits: 2 }), { sl: 1998.4, tp: 2013.4 })
})
caso('venda JPY: 30 pips de SL, 60 de TP', () => {
  const p = niveisEmPips({ direcao: 'sell', entrada: 150.0, sl: 150.3, tp: 149.4, symbol: 'USDJPY' })
  perto(p.slPips, -30)
  perto(p.tpPips, 60)
  assert.deepEqual(niveisNaConta({ direcao: 'sell', entradaReal: 149.95, pips: p, symbol: 'USDJPY', digits: 3 }), { sl: 150.25, tp: 149.35 })
})
caso('BE da mestre (+2 pips) chega ao cliente como entrada DELE + 2 pips', () => {
  const p = niveisEmPips({ direcao: 'buy', entrada: 2000, sl: 2000.2, tp: null, symbol: 'XAUUSD' })
  perto(p.slPips, 2)
  assert.equal(niveisNaConta({ direcao: 'buy', entradaReal: 2001, pips: p, symbol: 'XAUUSD', digits: 2 }).sl, 2001.2)
})
caso('índices e cripto em PONTOS', () => {
  const p = niveisEmPips({ direcao: 'buy', entrada: 42000, sl: 41900, tp: 42300, symbol: 'US30' })
  perto(p.slPips, -100)
  assert.deepEqual(niveisNaConta({ direcao: 'buy', entradaReal: 42010, pips: p, symbol: 'US30.s', digits: 1 }), { sl: 41910, tp: 42310 })
  const b = niveisEmPips({ direcao: 'sell', entrada: 60000, sl: 60500, tp: 59000, symbol: 'BTCUSD' })
  perto(b.slPips, -500)
})
caso('re-ancoragem: só corrige quando o enchimento fugiu mais de meio pip da cotação', () => {
  const base = { direcao: 'buy' as const, symbol: 'XAUUSD', digits: 2, entradaMestre: 2000, slMestre: 1995, tpMestre: 2010, copiarSl: true, copiarTp: true }
  assert.equal(reancorar({ ...base, entradaReal: 2001.02, slEnviado: 1996, tpEnviado: 2011 }), null)
  const r = reancorar({ ...base, entradaReal: 2002, slEnviado: 1996, tpEnviado: 2011 })
  assert.ok(r)
  assert.equal(r!.sl, 1997)
  assert.equal(r!.tp, 2012)
  // sem SL copiado (Equity Edge) nunca inventa um
  assert.equal(reancorar({ ...base, copiarSl: false, copiarTp: false, entradaReal: 2002, slEnviado: null, tpEnviado: null }), null)
})

caso('BE/trailing no lucro passam na modificação (antes eram descartados); na abertura um SL do lado errado não passa', () => {
  const be = stopsNoDestino({ direcao: 'buy', entradaOrigem: 2000, slOrigem: 2000.2, tpOrigem: null, precoDestino: 2003, digits: 2, copiarSl: true, copiarTp: false, permitirSlNoLucro: true })
  assert.equal(be.sl, 2003.2)
  const venda = stopsNoDestino({ direcao: 'sell', entradaOrigem: 150, slOrigem: 149.8, tpOrigem: null, precoDestino: 150.05, digits: 3, copiarSl: true, copiarTp: false, permitirSlNoLucro: true })
  assert.equal(venda.sl, 149.85)
  assert.equal(stopsNoDestino({ direcao: 'buy', entradaOrigem: 2000, slOrigem: 2000.2, tpOrigem: null, precoDestino: 2003, digits: 2, copiarSl: true, copiarTp: false }).sl, null)
  assert.deepEqual(['XAUUSD', 'USDJPY', 'EURUSD', 'US30'].map(digitosSeguros), [2, 3, 5, 1])
})

// ── dedupe ──────────────────────────────────────────────────────────────────
caso('rajada de modificações: só a última de cada sequência vai à corretora', () => {
  const f = [{ id: 1, tipo: 'modify' as const }, { id: 2, tipo: 'modify' as const }, { id: 3, tipo: 'partial' as const }, { id: 4, tipo: 'modify' as const }, { id: 5, tipo: 'modify' as const }, { id: 6, tipo: 'close' as const }]
  const r = colapsarModificacoesDaFila(f)
  assert.deepEqual(r.processar.map((x) => x.id), [2, 3, 5, 6])
  assert.deepEqual(r.substituidos.map((x) => x.id), [1, 4])
})
caso('mesmo trade por outro caminho na mesma conta (≤15 pips, ≤30 min) → duplicado', () => {
  const agora = Date.parse('2026-09-18T10:00:00Z')
  const recentes = [{ symbol: 'XAUUSD.s', direcao: 'buy' as const, entrada: 2000.5, em: agora - 5 * 60_000, origem: 'o Tap to Trade do site' }]
  assert.ok(conflitoEntreCaminhos({ symbol: 'XAUUSD', direcao: 'buy', entrada: 2001.2, agora }, recentes))
  assert.equal(conflitoEntreCaminhos({ symbol: 'XAUUSD', direcao: 'sell', entrada: 2001.2, agora }, recentes), null)
  assert.equal(conflitoEntreCaminhos({ symbol: 'XAUUSD', direcao: 'buy', entrada: 2005, agora }, recentes), null) // 45 pips
  assert.equal(conflitoEntreCaminhos({ symbol: 'XAUUSD', direcao: 'buy', entrada: 2000.5, agora: agora + 40 * 60_000 }, recentes), null)
})
caso('impressão do trade: mesma hora e mesmo balde de 10 pips → igual', () => {
  const a = impressaoParaConta({ symbol: 'XAUUSD', direcao: 'buy', entrada: 2000.1, em: '2026-09-18T10:05:00Z' })
  const b = impressaoParaConta({ symbol: 'XAUUSD', direcao: 'buy', entrada: 2000.3, em: '2026-09-18T10:55:00Z' })
  assert.equal(a, b)
  assert.notEqual(a, impressaoParaConta({ symbol: 'XAUUSD', direcao: 'buy', entrada: 2000.1, em: '2026-09-18T11:05:00Z' }))
})
caso('chave do evento é por rota (= mestre × conta): o mesmo facto duas vezes dá a mesma chave', () => {
  assert.equal(chaveEvento('r1', 'p1', 'open'), chaveEvento('r1', 'p1', 'open'))
  assert.notEqual(chaveEvento('r1', 'p1', 'open'), chaveEvento('r2', 'p1', 'open'))
})

// ── decisão live / sombra / parado ──────────────────────────────────────────
const est = (x: Partial<EstrategiaMestre> = {}): EstrategiaMestre => ({
  providerId: 'p', slug: 'Goldkiller', contaMestreId: 'm', modo: 'live', sinalModo: 'desligado', t2tModo: 'desligado', incluirMtmauto: false,
  mtmautoCortadoEm: null, copyfactoryIds: ['Wl1B'], copyfactoryCortadoEm: '2026-09-18T00:00:00Z', maxAtrasoAberturaS: 30, ...x,
})
const contaLive: ContaMestres = { ...contaPorOmissao('mt:1@s', 'site:x'), modo: 'live' }
const d = (x: Partial<EntradaDecisao> = {}) => decidirModo({
  global: { ligado: true, kill: false, liveDesbloqueado: true }, escritaNoProcesso: true, estrategia: est(), conta: contaLive,
  rota: { ativa: true, estado: 'aprovada', tipo_rota: 'estrategia', destino_ref: 'site:x' }, ...x,
})
caso('tudo aberto → live', () => assert.equal(d().modo, 'live'))
caso('kill-switch vence tudo → parado', () => assert.equal(d({ global: { ligado: true, kill: true, liveDesbloqueado: true } }).modo, 'parado'))
caso('motor desligado / estratégia desligada / sem estratégia / rota inactiva → parado', () => {
  assert.equal(d({ global: { ligado: false, kill: false, liveDesbloqueado: true } }).modo, 'parado')
  assert.equal(d({ estrategia: est({ modo: 'desligado' }) }).modo, 'parado')
  assert.equal(d({ estrategia: null }).modo, 'parado')
  assert.equal(d({ rota: { ativa: false, estado: 'aprovada', destino_ref: 'site:x' } }).modo, 'parado')
})
caso('qualquer fechadura do live em falta → SOMBRA (nunca live por defeito)', () => {
  assert.equal(d({ estrategia: est({ modo: 'sombra' }) }).modo, 'sombra')
  assert.equal(d({ escritaNoProcesso: false }).modo, 'sombra')
  assert.equal(d({ global: { ligado: true, kill: false, liveDesbloqueado: false } }).modo, 'sombra')
  assert.equal(d({ conta: null }).modo, 'sombra')
  assert.equal(d({ conta: { ...contaLive, modo: 'sombra' } }).modo, 'sombra')
  const cf = d({ estrategia: est({ copyfactoryCortadoEm: null }) })
  assert.equal(cf.modo, 'sombra')
  assert.match(cf.motivo, /CopyFactory por cortar/)
})
caso('conta MTM Auto só em live com o mtm-auto cortado', () => {
  const r = { ativa: true, estado: 'aprovada', tipo_rota: 'estrategia', destino_ref: 'auto:x' }
  assert.equal(d({ rota: r }).modo, 'sombra')
  assert.equal(d({ rota: r, estrategia: est({ incluirMtmauto: true, mtmautoCortadoEm: '2026-09-18' }) }).modo, 'live')
})
caso('rota T2T segue o t2t_modo, não o modo da cópia', () => {
  const r = { ativa: true, estado: 'aprovada', tipo_rota: 't2t', destino_ref: 'site:x' }
  assert.equal(d({ rota: r }).modo, 'parado')
  assert.equal(d({ rota: r, estrategia: est({ modo: 'desligado', t2tModo: 'sombra' }) }).modo, 'sombra')
})
caso('interruptor em STRING JSON (site_settings) lê-se igual', () => {
  assert.deepEqual(lerConfigGlobal('{"ligado":true,"kill":true,"live_desbloqueado":false}'), { ligado: true, kill: true, liveDesbloqueado: false })
  assert.deepEqual(lerConfigGlobal(null), { ligado: false, kill: false, liveDesbloqueado: false })
})
caso('abertura atrasada (fila parada/kill levantado) é recusada; dentro do limite passa', () => {
  const agora = Date.parse('2026-09-18T10:00:40Z')
  assert.ok(aberturaAtrasada('2026-09-18T10:00:00Z', '2026-09-18T10:00:00Z', agora, 30))
  assert.equal(aberturaAtrasada('2026-09-18T10:00:20Z', '2026-09-18T10:00:20Z', agora, 30), null)
})
caso('exposição por conta: posições, risco total (desconhecido conta 2%) e lotes', () => {
  const l = { maxPosicoes: 3, maxRiscoTotalPct: 4, maxLoteTotal: 1 }
  assert.ok(motivoExposicao([{ volume: 0.1, riscoPct: 1 }, { volume: 0.1, riscoPct: 1 }, { volume: 0.1, riscoPct: 1 }], { volume: 0.1, riscoPct: 0.5 }, l))
  assert.ok(motivoExposicao([{ volume: 0.1, riscoPct: 1 }, { volume: 0.1, riscoPct: null }], { volume: 0.1, riscoPct: 1.5 }, l)) // 1+2+1,5
  assert.equal(motivoExposicao([{ volume: 0.1, riscoPct: 1 }], { volume: 0.1, riscoPct: 1 }, l), null)
  assert.ok(motivoExposicao([{ volume: 0.9, riscoPct: 0.5 }], { volume: 0.2, riscoPct: 0.5 }, l))
  perto(riscoPctDaPosicao({ volume: 0.1, distanciaSl: 5, valorPorPrecoPorLote: 100, equity: 5_000 }), 1)
})
caso('falhas seguidas: um alerta ao chegar a N, bloqueio ao chegar ao limite, sucesso repõe', () => {
  assert.deepEqual(aposResultado(1, false, 3, 6), { falhasSeguidas: 2, alertar: false, bloquear: false })
  assert.deepEqual(aposResultado(2, false, 3, 6), { falhasSeguidas: 3, alertar: true, bloquear: false })
  assert.deepEqual(aposResultado(3, false, 3, 6), { falhasSeguidas: 4, alertar: false, bloquear: false })
  assert.deepEqual(aposResultado(5, false, 3, 6), { falhasSeguidas: 6, alertar: false, bloquear: true })
  assert.deepEqual(aposResultado(5, true, 3, 6), { falhasSeguidas: 0, alertar: false, bloquear: false })
  assert.equal(eFalhaTecnica('timeout ao falar com a MetaApi'), true)
  assert.equal(eFalhaTecnica('XAUUSD não existe no destino'), false)
  assert.equal(eFalhaTecnica('risco total 7.00% acima do limite de 6% da conta'), false)
})

// ── concorrência ────────────────────────────────────────────────────────────
caso('1 operação por cada 5 contas do mesmo servidor (mínimo 1)', () => {
  assert.equal(capacidadeDoServidor(0), 1)
  assert.equal(capacidadeDoServidor(5), 1)
  assert.equal(capacidadeDoServidor(6), 2)
  assert.equal(capacidadeDoServidor(23), 5)
  assert.equal(servidorDaChave('mt:123@PUPrime-Live 6'), 'mt:PUPrime-Live 6')
  assert.equal(servidorDaChave('tl:live:999'), 'tl:live')
})
caso('limitador: nunca passa da capacidade e serve por ordem de chegada', async () => {
  const lim = new Limitador(() => 2)
  let dentro = 0
  let pico = 0
  const ordem: number[] = []
  await Promise.all([1, 2, 3, 4, 5].map((i) => lim.correr('srv', async () => {
    dentro++; pico = Math.max(pico, dentro)
    await new Promise((r) => setTimeout(r, 5))
    ordem.push(i); dentro--
  })))
  assert.equal(pico, 2)
  assert.deepEqual([...ordem].sort(), [1, 2, 3, 4, 5])
  assert.deepEqual(lim.ocupacao('srv'), { emCurso: 0, aEspera: 0 })
})

// ── planeamento das rotas ───────────────────────────────────────────────────
const ESTR = { providerId: 'prov-gk', slug: 'Goldkiller', nome: 'MTM Auto GoldKiller', contaMestreId: 'BE70CA16-7B29-455A-8EEB-D1562E0CA919', copyfactoryIds: ['Wl1B', 'SDNb'], incluirMtmauto: false }
caso('quem segue: pick ou strategy_lots da estratégia; T2T-só, MTM Funded e repetidas ficam fora', () => {
  const site = [
    { id: 's1', user_id: 'u1', copy_method: 'strategy', copyfactory_strategy_pick: 'Wl1B', lot_mode: 'risk_percent', lot_value: 0.5, max_risk_percent: 1, mt5_login: '111', mt5_server: 'PUPrime-Live 6', is_active: true },
    { id: 's2', user_id: 'u2', copy_method: 'strategy', strategy_lots: { SDNb: 0.02 }, mt5_login: '222', mt5_server: 'VTMarkets-Live 6', is_active: false },
    { id: 's3', user_id: 'u3', copy_method: 'strategy', copyfactory_strategy_pick: 'hbKq', mt5_login: '333', mt5_server: 'X' },
    { id: 's4', user_id: 'u4', copy_method: 'telegram_group', purpose: 'tap_to_trade', mt5_login: '444', mt5_server: 'X' },
    { id: 's5', user_id: 'u5', copy_method: 'strategy', copyfactory_strategy_pick: 'Wl1B', mt5_platform: 'mtmfunded', funded_account_id: 'f', lot_mode: 'risk_percent', lot_value: 1 },
    { id: 's6', user_id: 'u1', copy_method: 'strategy', copyfactory_strategy_pick: 'Wl1B', lot_mode: 'fixed', lot_value: 0.01, mt5_login: '111', mt5_server: 'puprime-live 6' },
  ]
  const r = planearRotasDaEstrategia({ estrategia: ESTR, site: site as never, subsAuto: [], contasAuto: [] })
  assert.deepEqual(r.rotas.map((x) => x.destino_ref), ['site:s1', 'site:s2'])
  assert.equal(r.rotas[0].origem_ref, 'prov:prov-gk')
  assert.equal(r.rotas[0].origem_chave, 'mtmfunded:be70ca16-7b29-455a-8eeb-d1562e0ca919')
  assert.equal(r.rotas[0].modo_lote, 'risco_pct')
  assert.equal(r.rotas[1].modo_lote, 'fixo')
  assert.equal(r.rotas[1].valor, 0.02)
  assert.equal(r.rotas[1].pausada_motivo, 'ligação pausada pelo cliente')
  assert.ok(r.ignorados.some((i) => i.ref === 'site:s5'))
  assert.ok(r.ignorados.some((i) => i.ref === 'site:s6' && /mesma conta física/.test(i.motivo)))
  assert.equal(ligacaoSegueEstrategia(site[3] as never, ESTR.copyfactoryIds), false)
})
caso('MTM Auto só entra com incluir_mtmauto; conta = a da subscrição, senão a principal', () => {
  const subs = [{ id: 'sub1', user_id: 'u9', provider_id: 'prov-gk', ativo: true, auto_aceitar: true, risco_pct: 1 }]
  const contas = [
    { id: 'a1', user_id: 'u9', plataforma: 'mtmfunded', funded_account_id: 'f' },
    { id: 'a2', user_id: 'u9', plataforma: 'mt5', login: '9', servidor: 'S', principal: true, copia_ativa: false },
  ]
  assert.equal(planearRotasDaEstrategia({ estrategia: ESTR, site: [], subsAuto: subs as never, contasAuto: contas as never }).rotas.length, 0)
  const r = planearRotasDaEstrategia({ estrategia: { ...ESTR, incluirMtmauto: true }, site: [], subsAuto: subs as never, contasAuto: contas as never })
  assert.equal(r.rotas[0].destino_ref, 'auto:a2')
  assert.equal(r.rotas[0].pausada_motivo, 'cópia pausada na conta MTM Auto')
})
caso('escrita das rotas: cria, actualiza o que mudou, retira sem perder posições abertas', () => {
  const des = planearRotasDaEstrategia({ estrategia: ESTR, site: [{ id: 's1', user_id: 'u1', copy_method: 'strategy', copyfactory_strategy_pick: 'Wl1B', lot_mode: 'risk_percent', lot_value: 0.5, mt5_login: '111', mt5_server: 'S' }] as never, subsAuto: [], contasAuto: [] }).rotas
  const exist = (x: Partial<RotaExistente>): RotaExistente => ({ id: 'r', destino_chave: 'mt:111@s', destino_ref: 'site:s1', ativa: true, modo_lote: 'risco_pct', valor: 0.5, copiar_sl: true, copiar_tp: true, filtro_simbolos: [], max_abertas: null, pausada_motivo: null, abertas: 0, ...x })
  assert.equal(planoDeEscrita(des, []).criar.length, 1)
  const igual = planoDeEscrita(des, [exist({})])
  assert.equal(igual.criar.length + igual.actualizar.length + igual.retirar.length, 0)
  assert.deepEqual(planoDeEscrita(des, [exist({ valor: 1 })]).actualizar[0].patch, { valor: 0.5 })
  const saiu = planoDeEscrita([], [exist({ abertas: 2 })])
  assert.deepEqual(saiu.retirar[0].patch, { pausada_motivo: 'deixou de seguir a estratégia' })
  assert.deepEqual(planoDeEscrita([], [exist({})]).retirar[0].patch, { ativa: false, pausada_motivo: 'deixou de seguir a estratégia' })
})

// ── corte da CopyFactory ────────────────────────────────────────────────────
caso('corte: tira só a estratégia (mantém as outras), com o name; conta só com ela fica vazia', () => {
  const subs = [
    { _id: 'A', name: 'Ruben', subscriptions: [{ strategyId: 'Wl1B', multiplier: 1 }, { strategyId: '5IHE' }] },
    { _id: 'B', name: 'Pedro', subscriptions: [{ strategyId: 'SDNb' }] },
    { _id: 'C', subscriptions: [{ strategyId: 'Hvmg' }] },
    { _id: 'D', name: 'x', subscriptions: [{ strategyId: 'Wl1B', removed: true }] },
  ]
  const p = planoDeCorte(subs, ['Wl1B', 'SDNb'])
  assert.deepEqual(p.map((a) => a.tipo), ['manter_outras', 'remover_todas', 'nada', 'nada'])
  const a = p[0]
  assert.ok(a.tipo === 'manter_outras')
  assert.deepEqual(corpoDoPut(a as never), { name: 'Ruben', subscriptions: [{ strategyId: '5IHE' }] })
  assert.deepEqual(corpoDoPut(p[1] as never), { name: 'Pedro', subscriptions: [] })
  assert.equal(corteConfirmado([{ _id: 'A', subscriptions: [{ strategyId: '5IHE' }] }, null], ['Wl1B']).ok, true)
  assert.equal(corteConfirmado([{ _id: 'A', subscriptions: [{ strategyId: 'Wl1B' }] }], ['Wl1B']).ok, false)
  assert.deepEqual([...idsServidosPeloMotor([{ copyfactory_ids: ['Wl1B'], copyfactory_cortado_em: 'x' }, { copyfactory_ids: ['hbKq'], copyfactory_cortado_em: null }])], ['Wl1B'])
})

// ── T2T ─────────────────────────────────────────────────────────────────────
caso('T2T: estratégia pelo trader PrimeVerse ou pelo canal', () => {
  assert.equal(estrategiaDoSinalT2T('ideias-e-sinais', '📡 PrimeVerse · fxedge\nXAUUSD BUY'), 'mtm-auto-edge')
  assert.equal(estrategiaDoSinalT2T('sinais-goldkiller', 'XAUUSD BUY'), 'Goldkiller')
  assert.equal(estrategiaDoSinalT2T('trade-ideas', 'EURUSD'), null)
})
caso('T2T: posição da mestre do sinal — mesma direcção, janela, entrada perto, a mais recente', () => {
  const c = [
    { id: 'velha', symbol: 'XAUUSD', direcao: 'buy' as const, preco_entrada: 2000, aberta_em: '2026-09-18T07:00:00Z', estado: 'aberta' },
    { id: 'certa', symbol: 'XAUUSD', direcao: 'buy' as const, preco_entrada: 2001, aberta_em: '2026-09-18T09:59:58Z', estado: 'aberta' },
    { id: 'venda', symbol: 'XAUUSD', direcao: 'sell' as const, preco_entrada: 2001, aberta_em: '2026-09-18T10:00:01Z', estado: 'aberta' },
    { id: 'longe', symbol: 'XAUUSD', direcao: 'buy' as const, preco_entrada: 2020, aberta_em: '2026-09-18T10:00:30Z', estado: 'aberta' },
  ]
  const p = escolherPosicaoMestre(c, { symbol: 'XAUUSD', direcao: 'buy', entrada: 2000.5, mensagemEm: '2026-09-18T10:00:00Z', pip: 0.1 })
  assert.equal(p?.id, 'certa')
  assert.equal(escolherPosicaoMestre(c, { symbol: 'EURUSD', direcao: 'buy', entrada: null, mensagemEm: '2026-09-18T10:00:00Z', pip: 0.0001 }), null)
})

// ── o motor da cópia com os ganchos das mestres ─────────────────────────────
const ROTA: RotaCopia = {
  id: '99999999-2222-3333-4444-555555555555', user_id: 'u1', origem_tipo: 'mtmfunded', origem_ref: 'prov:aaaaaaaa-0000-0000-0000-000000000001',
  origem_chave: 'mtmfunded:m', destino_tipo: 'mt5', destino_ref: 'site:aaaaaaaa-0000-0000-0000-000000000002', destino_chave: 'mt:1@s',
  rotulo: null, modo_lote: 'risco_pct', valor: 1, mapa_simbolos: {}, filtro_simbolos: [], filtro_direcao: 'ambas', lote_max: null,
  max_abertas: null, copiar_sl: true, copiar_tp: true, copiar_parciais: true, copiar_modificacoes: true, fechar_com_origem: true,
  ativa: true, modo: 'shadow', estado: 'aprovada', pedido_pelo_cliente: false, notas: null, aprovada_em: null, created_at: new Date().toISOString(),
}
const LIVE = { globalLigado: true, liveDesbloqueado: true, escritaNoProcesso: true }
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
    async saldoOrigem() { return 10_000 },
  }
  return { loja, copias }
}
function corretora(preco = 2001.5) {
  const log: string[] = []
  const posicoes: { id: string; symbol: string; direcao: 'buy' | 'sell'; volume: number; clientId: string | null }[] = []
  const e: EscritorDestino = {
    async contexto(simbolo) { return { simbolo, regra: FX, equity: 5_000, saldo: 5_000, valorPorPrecoPorLote: 100, bid: 2001, ask: 2001.5, digits: 2 } },
    async simbolos() { return ['XAUUSD.s'] },
    async posicoes() { return posicoes.map((p) => ({ ...p })) },
    async abrir(o) { log.push(`abrir ${o.simbolo} ${o.volume} sl=${o.sl} tp=${o.tp}`); posicoes.push({ id: 'D1', symbol: o.simbolo, direcao: o.direcao, volume: o.volume, clientId: o.clientId }); return { positionId: 'D1', simbolo: o.simbolo, preco } },
    async modificar(id, sl, tp) { log.push(`modificar ${id} sl=${sl} tp=${tp}`) },
    async fechar(id, v) { log.push(`fechar ${id} ${v ?? 'tudo'}`); const i = posicoes.findIndex((p) => p.id === id); if (i >= 0 && v == null) posicoes.splice(i, 1) },
  }
  return { e, log, posicoes }
}
const evt = (id: number, tipo: EventoCopia['tipo'], payload: EventoCopia['payload']): EventoCopia => ({
  id, rota_id: ROTA.id, origem_posicao_id: 'M1', tipo, payload, chave: chaveEvento(ROTA.id, 'M1', tipo, id), origem_em: new Date().toISOString(), criado_em: new Date().toISOString(), tentativas: 0,
})
const ABRIR = { symbol: 'XAUUSD', direcao: 'buy' as const, volume: 0.1, preco: 2000, sl: 1995, tp: 2010 }

caso('motor: kill-switch antes da escrita → nada enviado, nada gravado como «enviando», repete depois', async () => {
  const { loja, copias } = lojaMem()
  const c = corretora()
  const g: GanchosMotor = { modo: () => 'live', podeEscrever: () => false }
  const r = await processarEventoCopia(evt(1, 'open', ABRIR), ROTA, loja, c.e, { interruptores: LIVE, ganchos: g })
  assert.equal(r.resultado, 'erro')
  assert.equal(r.repetir, true)
  assert.equal(c.log.length, 0)
  assert.equal(copias.size, 0)
})
caso('motor: o modo dos ganchos manda (sombra mesmo com as fechaduras da cópia abertas) — zero escritas', async () => {
  const { loja } = lojaMem()
  const c = corretora()
  const regs: RegistoOrdemMotor[] = []
  const r = await processarEventoCopia(evt(1, 'open', ABRIR), { ...ROTA, modo: 'live' }, loja, c.e, { interruptores: LIVE, ganchos: { modo: () => 'sombra', registar: async (x) => { regs.push(x) } } })
  assert.equal(r.resultado, 'sombra')
  assert.equal(c.log.length, 0)
  assert.equal(regs[0].estado, 'sombra')
})
caso('motor: live abre com risco 1% (5 000 × 1% / (5 × 100) = 0,10), re-ancora na entrada REAL e regista enviando→ok', async () => {
  const { loja, copias } = lojaMem()
  const c = corretora(2002.5) // cotação 2001,5 mas encheu a 2002,5
  const regs: RegistoOrdemMotor[] = []
  const g: GanchosMotor = { modo: () => 'live', podeEscrever: () => true, reancorar: true, registar: async (x) => { regs.push(x) } }
  const r = await processarEventoCopia(evt(1, 'open', ABRIR), ROTA, loja, c.e, { interruptores: LIVE, ganchos: g })
  assert.equal(r.resultado, 'ok')
  assert.deepEqual(c.log, ['abrir XAUUSD.s 0.1 sl=1996.5 tp=2011.5', 'modificar D1 sl=1997.5 tp=2012.5'])
  assert.deepEqual(regs.map((x) => `${x.tipo}:${x.estado}${x.sufixo ? ':' + x.sufixo : ''}`), ['abrir:enviando', 'abrir:ok', 'modificar:ok:reancorar'])
  assert.ok((regs[1].latenciaCorretoraMs ?? -1) >= 0)
  assert.equal([...copias.values()][0].preco_destino, 2002.5)
  // o BE da mestre (+2 pips) sobre a entrada REAL do cliente: 2002,5 + 0,2
  await processarEventoCopia(evt(2, 'modify', { symbol: 'XAUUSD', direcao: 'buy', preco: 2000, sl: 2000.2, tp: 2010 }), ROTA, loja, c.e, { interruptores: LIVE, ganchos: g })
  assert.equal(c.log[2], 'modificar D1 sl=2002.7 tp=2012.5')
})
caso('motor: a guarda de ABERTURA bloqueia abrir, mas nunca parciais/fechos de uma posição já aberta', async () => {
  const { loja } = lojaMem()
  const c = corretora()
  const g: GanchosMotor = { modo: () => 'live', podeEscrever: () => true }
  await processarEventoCopia(evt(1, 'open', ABRIR), ROTA, loja, c.e, { interruptores: LIVE, ganchos: g })
  const bloqueada: GanchosMotor = { ...g, bloqueioAbertura: async () => ({ motivo: 'pausada: ligação pausada pelo cliente', gravarRecusa: true }) }
  const p = await processarEventoCopia(evt(2, 'partial', { symbol: 'XAUUSD', direcao: 'buy', volume_fechado: 0.05, volume: 0.05 }), ROTA, loja, c.e, { interruptores: LIVE, ganchos: bloqueada })
  assert.equal(p.resultado, 'ok')
  const f = await processarEventoCopia(evt(3, 'close', { symbol: 'XAUUSD', direcao: 'buy' }), ROTA, loja, c.e, { interruptores: LIVE, ganchos: bloqueada })
  assert.equal(f.resultado, 'ok')
  const outra = await processarEventoCopia({ ...evt(4, 'open', ABRIR), origem_posicao_id: 'M2' }, ROTA, loja, c.e, { interruptores: LIVE, ganchos: bloqueada })
  assert.equal(outra.resultado, 'recusado')
  assert.deepEqual(c.log.filter((x) => x.startsWith('abrir')).length, 1)
})
caso('motor: T2T sem aceite → saltado SEM rasto (o aceite posterior ainda pode abrir)', async () => {
  const { loja, copias } = lojaMem()
  const c = corretora()
  const g: GanchosMotor = { modo: () => 'live', podeEscrever: () => true, bloqueioAbertura: async () => ({ motivo: 'T2T: sinal não aceite por este cliente', gravarRecusa: false }) }
  const r = await processarEventoCopia(evt(1, 'open', ABRIR), ROTA, loja, c.e, { interruptores: LIVE, ganchos: g })
  assert.equal(r.resultado, 'saltado')
  assert.equal(copias.size, 0)
  const aceite = await processarEventoCopia(evt(2, 'open', ABRIR), ROTA, loja, c.e, { interruptores: LIVE, ganchos: { modo: () => 'live', podeEscrever: () => true } })
  assert.equal(aceite.resultado, 'ok')
  // o mesmo evento outra vez (reinício, 2 consumidores) → nunca segunda ordem
  const outraVez = await processarEventoCopia(evt(2, 'open', ABRIR), ROTA, loja, c.e, { interruptores: LIVE, ganchos: { modo: () => 'live', podeEscrever: () => true } })
  assert.equal(outraVez.resultado, 'saltado')
  assert.equal(c.log.filter((x) => x.startsWith('abrir')).length, 1)
})
caso('motor: fecho de uma posição que já fechou no destino (SL dele) → confirma e segue, sem erro', async () => {
  const { loja, copias } = lojaMem()
  const c = corretora()
  const g: GanchosMotor = { modo: () => 'live', podeEscrever: () => true }
  await processarEventoCopia(evt(1, 'open', ABRIR), ROTA, loja, c.e, { interruptores: LIVE, ganchos: g })
  c.posicoes.splice(0)
  const e2: EscritorDestino = { ...c.e, async fechar() { throw new Error('Position not found') } }
  const f = await processarEventoCopia(evt(2, 'close', { symbol: 'XAUUSD', direcao: 'buy' }), ROTA, loja, e2, { interruptores: LIVE, ganchos: g })
  assert.equal(f.resultado, 'saltado')
  assert.equal([...copias.values()][0].estado, 'fechada')
})

caso('motor: estratégia voltou a SOMBRA — a posição aberta em live continua a ser gerida em live até fechar', async () => {
  const { loja } = lojaMem()
  const c = corretora()
  await processarEventoCopia(evt(1, 'open', ABRIR), ROTA, loja, c.e, { interruptores: LIVE, ganchos: { modo: () => 'live', podeEscrever: () => true } })
  const emSombra: GanchosMotor = { modo: () => 'sombra', podeEscrever: () => true, gerirAbertasEmLive: () => true }
  const f = await processarEventoCopia(evt(2, 'close', { symbol: 'XAUUSD', direcao: 'buy' }), ROTA, loja, c.e, { interruptores: LIVE, ganchos: emSombra })
  assert.equal(f.resultado, 'ok')
  assert.equal(c.log.at(-1), 'fechar D1 tudo')
  // uma posição NOVA com a estratégia em sombra não abre
  const nova = await processarEventoCopia({ ...evt(3, 'open', ABRIR), origem_posicao_id: 'M9' }, ROTA, loja, c.e, { interruptores: LIVE, ganchos: emSombra })
  assert.equal(nova.resultado, 'sombra')
  assert.equal(c.log.filter((x) => x.startsWith('abrir')).length, 1)
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
  console.log(process.exitCode ? `falharam ${casos.length - n} de ${casos.length}` : `mestres: ${n} casos, todos certos`)
}
void main()
