/**
 * As decisões de uma ordem simulada — abrir, fechar (total/parcial), modificar, pendentes e os
 * limites do programa. Números feitos à mão: se um arredondamento mudar em `matematica.ts`, é
 * aqui que se vê antes de chegar à conta de um aluno.
 *
 *   npx tsx lib/mtmfunded/__tests__/simulado-ordens.check.ts
 */
import type { Simbolo, Preco } from '../simulado/matematica'
import {
  planearAbertura, planearFecho, validarModificacao, validarPendente, limitesDaConta,
  diaDaCorretora, precoFresco, simbolosParaMedir, valorDoPip, simboloDaLinha,
  tipoDeEntrada, candidatosDeTicker, planoSincronizacao, interpretarAlerta,
} from '../simulado/ordens'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (a === b) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${String(b)}\n   obtido:   ${String(a)}`)
}

const XAU: Simbolo = { symbol: 'XAUUSD', classe: 'metal', digits: 2, contract_size: 100, pip_size: 0.1, spread_pontos: 18, comissao_lote: 7, volume_min: 0.01, volume_step: 0.01, volume_max: 20, alavancagem_max: 100 }
const EUR: Simbolo = { symbol: 'EURUSD', classe: 'forex', digits: 5, contract_size: 100000, pip_size: 0.0001, spread_pontos: 2, comissao_lote: 7, volume_min: 0.01, volume_step: 0.01, volume_max: 50, alavancagem_max: 100 }
const EURJPY: Simbolo = { ...EUR, symbol: 'EURJPY', digits: 3, pip_size: 0.01 }
const pXau: Preco = { symbol: 'XAUUSD', bid: 2400.0, ask: 2400.18 }
const pEur: Preco = { symbol: 'EURUSD', bid: 1.1, ask: 1.10002 }
const simbolos = { XAUUSD: XAU, EURUSD: EUR }

// ── abrir ──────────────────────────────────────────────────────────────────
const a = planearAbertura({ simbolo: XAU, direcao: 'buy', volume: 0.1, sl: 2390, tp: 2420, preco: pXau, saldo: 10000, alavancagemConta: 100, posicoesAbertas: [], simbolos, precos: { XAUUSD: pXau } })
eq('abrir: ok', a.ok, true)
if (a.ok) {
  eq('compra executa ao ASK', a.precoExecucao, 2400.18)
  eq('comissão 0.1 lote × 7', a.comissao, 0.7)
  eq('margem 0.1×100×2400.18/100', a.margem, 240.02)
  eq('valor do pip 0.1 lote ouro = 1 USD', a.valorPip, 1)
  eq('margem livre depois', a.margemLivreDepois, 9759.28)
}
const aVol = planearAbertura({ simbolo: XAU, direcao: 'buy', volume: 0.123, sl: null, tp: null, preco: pXau, saldo: 10000, alavancagemConta: 100, posicoesAbertas: [], simbolos, precos: {} })
eq('volume arredonda ao passo', aVol.ok && aVol.volume, 0.12)
eq('volume acima do máximo recusa', planearAbertura({ simbolo: XAU, direcao: 'buy', volume: 25, sl: null, tp: null, preco: pXau, saldo: 1e7, alavancagemConta: 100, posicoesAbertas: [], simbolos, precos: {} }).ok, false)
const slErrado = planearAbertura({ simbolo: XAU, direcao: 'sell', volume: 0.1, sl: 2390, tp: null, preco: pXau, saldo: 10000, alavancagemConta: 100, posicoesAbertas: [], simbolos, precos: {} })
eq('venda com SL abaixo recusa', !slErrado.ok && slErrado.erro, 'numa venda o stop fica acima do preço')
// SL encostado: compra executa a 2400.18, SL 2400.10 fica abaixo → válido
eq('SL entre bid e ask numa compra é válido', planearAbertura({ simbolo: XAU, direcao: 'buy', volume: 0.1, sl: 2400.1, tp: null, preco: pXau, saldo: 10000, alavancagemConta: 100, posicoesAbertas: [], simbolos, precos: {} }).ok, true)
const semMargem = planearAbertura({ simbolo: XAU, direcao: 'buy', volume: 5, sl: null, tp: null, preco: pXau, saldo: 1000, alavancagemConta: 100, posicoesAbertas: [], simbolos, precos: {} })
eq('margem insuficiente recusa', semMargem.ok, false)
// alavancagem mais baixa ganha: conta 30 vs símbolo 100 → 0.1×100×2400.18/30
const a30 = planearAbertura({ simbolo: XAU, direcao: 'buy', volume: 0.1, sl: null, tp: null, preco: pXau, saldo: 10000, alavancagemConta: 30, posicoesAbertas: [], simbolos, precos: {} })
eq('alavancagem da conta 1:30', a30.ok && a30.margem, 800.06)
const aberta = { symbol: 'XAUUSD', direcao: 'buy' as const, volume: 0.1, preco_entrada: 2400.18, sl: null, tp: null, comissao: 0.7, swap: 0 }
eq('hedge proibido recusa', planearAbertura({ simbolo: XAU, direcao: 'sell', volume: 0.1, sl: null, tp: null, preco: pXau, saldo: 10000, alavancagemConta: 100, posicoesAbertas: [aberta], simbolos, precos: { XAUUSD: pXau }, regras: { hedge_permitido: false } }).ok, false)
eq('máximo por par/direção', planearAbertura({ simbolo: XAU, direcao: 'buy', volume: 0.1, sl: null, tp: null, preco: pXau, saldo: 10000, alavancagemConta: 100, posicoesAbertas: [aberta, aberta, aberta], simbolos, precos: { XAUUSD: pXau }, regras: { max_posicoes_par_direcao: 3 } }).ok, false)
const semConv = planearAbertura({ simbolo: EURJPY, direcao: 'buy', volume: 0.1, sl: null, tp: null, preco: { symbol: 'EURJPY', bid: 160, ask: 160.008 }, saldo: 10000, alavancagemConta: 100, posicoesAbertas: [], simbolos: {}, precos: {} })
eq('EURJPY sem USDJPY recusa (sem conversão)', semConv.ok, false)
const comConv = planearAbertura({ simbolo: EURJPY, direcao: 'buy', volume: 1, sl: null, tp: null, preco: { symbol: 'EURJPY', bid: 160, ask: 160.008 }, saldo: 10000, alavancagemConta: 100, posicoesAbertas: [], simbolos: {}, precos: { USDJPY: { symbol: 'USDJPY', bid: 150, ask: 150 } } })
eq('valor do pip EURJPY 1 lote ≈ 1000 JPY / 150', comConv.ok && comConv.valorPip, 6.67)

// ── fechar ─────────────────────────────────────────────────────────────────
const pos = { symbol: 'XAUUSD', direcao: 'buy' as const, volume: 0.3, preco_entrada: 2400.18, sl: null, tp: null, comissao: 2.1, swap: -0.9 }
const subiu: Preco = { symbol: 'XAUUSD', bid: 2410.18, ask: 2410.36 }
const total = planearFecho(pos, XAU, subiu, {})
eq('fecho total: ok', total.ok && !total.parcial, true)
if (total.ok) {
  eq('compra fecha ao BID: +10 × 0.3 × 100', total.pnl, 300)
  eq('saldo recebe pnl + swap', total.paraOSaldo, 299.1)
  eq('comissão toda na parte fechada', total.comissaoFechada, 2.1)
}
const parcial = planearFecho(pos, XAU, subiu, {}, 0.1)
eq('parcial: ok', parcial.ok && parcial.parcial, true)
if (parcial.ok) {
  eq('parcial fecha 0.1', parcial.volumeFechado, 0.1)
  eq('parcial deixa 0.2', parcial.volumeRestante, 0.2)
  eq('pnl parcial', parcial.pnl, 100)
  eq('comissão proporcional', parcial.comissaoFechada, 0.7)
  eq('swap proporcional', parcial.swapFechado, -0.3)
  eq('saldo parcial', parcial.paraOSaldo, 99.7)
}
eq('volume ≥ posição = fecho total', (() => { const r = planearFecho(pos, XAU, subiu, {}, 0.5); return r.ok && !r.parcial })(), true)
const resto = planearFecho({ ...pos, volume: 0.02 }, { ...XAU, volume_min: 0.02 }, subiu, {}, 0.01)
eq('parcial não deixa menos que o mínimo', resto.ok, false)
const venda = planearFecho({ ...pos, direcao: 'sell', preco_entrada: 2400, swap: 0 }, XAU, subiu, {})
eq('venda fecha ao ASK: (2400−2410.36)×0.3×100', venda.ok && venda.pnl, -310.8)
const eurFecho = planearFecho({ symbol: 'EURUSD', direcao: 'buy', volume: 1, preco_entrada: 1.10002, sl: null, tp: null, comissao: 7, swap: 0 }, EUR, { symbol: 'EURUSD', bid: 1.10102, ask: 1.10104 }, {})
eq('EURUSD +10 pips 1 lote = 100 USD', eurFecho.ok && eurFecho.pnl, 100)

// ── modificar ──────────────────────────────────────────────────────────────
eq('modificar compra: SL abaixo do BID ok', validarModificacao({ direcao: 'buy' }, pXau, 2399.9, null), null)
eq('modificar compra: SL acima do BID recusa', validarModificacao({ direcao: 'buy' }, pXau, 2400.1, null) != null, true)
eq('modificar venda: TP abaixo do ASK ok', validarModificacao({ direcao: 'sell' }, pXau, null, 2400.1), null)

// ── pendentes ──────────────────────────────────────────────────────────────
eq('buy limit abaixo ok', validarPendente(XAU, 'buy', 'limit', 0.1, 2390, 2380, 2420, pXau).ok, true)
eq('buy limit acima recusa', validarPendente(XAU, 'buy', 'limit', 0.1, 2410, null, null, pXau).ok, false)
eq('sell stop abaixo ok', validarPendente(XAU, 'sell', 'stop', 0.1, 2390, 2395, 2380, pXau).ok, true)
eq('buy stop com SL acima do nível recusa', validarPendente(XAU, 'buy', 'stop', 0.1, 2410, 2415, null, pXau).ok, false)
eq('sem preço ao vivo valida só níveis', validarPendente(EUR, 'sell', 'limit', 0.1, 1.2, 1.21, 1.19, null).ok, true)

// ── limites do programa ───────────────────────────────────────────────────
const regras = { perda_diaria_pct: 5, perda_maxima_pct: 10, objetivo_pct: 8, objetivo_fase2_pct: 5 }
const l = limitesDaConta(regras, 10000, 9800, 10100, 1)
eq('perda diária restante: 9800 − 10100×0.95', l.perdaDiariaRestante, 205)
eq('perda máxima restante: 9800 − 9000', l.perdaMaximaRestante, 800)
eq('objetivo F1 8% = 10800', l.objetivoValor, 10800)
eq('progresso negativo fica 0', l.progressoObjetivoPct, 0)
const l2 = limitesDaConta(regras, 10000, 10250, null, 2)
eq('F2 usa objetivo_fase2 (5%)', l2.objetivoValor, 10500)
eq('progresso 50%', l2.progressoObjetivoPct, 50)
eq('sem regras → nulls', limitesDaConta(null, 10000, 10000, null, 1).perdaDiariaRestante, null)

// ── pequenos ───────────────────────────────────────────────────────────────
eq('dia vira às 22:00 UTC (21:59 ainda é o mesmo)', diaDaCorretora(new Date('2026-09-14T21:59:00Z')), '2026-09-14')
eq('dia vira às 22:00 UTC (22:00 já é o seguinte)', diaDaCorretora(new Date('2026-09-14T22:00:00Z')), '2026-09-15')
const agora = Date.parse('2026-09-14T10:00:10Z')
eq('preço de 4s é fresco', precoFresco('2026-09-14T10:00:06Z', agora), true)
eq('preço de 6s não é', precoFresco('2026-09-14T10:00:04Z', agora), false)
eq('conversões pedidas p/ EURJPY', simbolosParaMedir([{ symbol: 'EURJPY', classe: 'forex' }]).join(','), 'EURJPY,JPYUSD,USDJPY')
eq('valor do pip EURUSD 0.5 lote', valorDoPip(EUR, 0.5, 1.1, {}), 5)
eq('linha com numeric em texto', simboloDaLinha({ symbol: 'X', classe: 'forex', digits: '5', contract_size: '100000', pip_size: '0.0001', volume_step: '0.01' }).contract_size, 100000)

// ── ferramenta de posição: tipo de ordem pela entrada ─────────────────────
eq('compra perto do ASK = mercado', tipoDeEntrada('buy', 2400.2, pXau, 0.5), 'mercado')
eq('compra abaixo = buy limit', tipoDeEntrada('buy', 2390, pXau, 0.5), 'limit')
eq('compra acima = buy stop', tipoDeEntrada('buy', 2410, pXau, 0.5), 'stop')
eq('venda acima = sell limit', tipoDeEntrada('sell', 2410, pXau, 0.5), 'limit')
eq('venda abaixo = sell stop', tipoDeEntrada('sell', 2390, pXau, 0.5), 'stop')

// ── webhook: tickers ──────────────────────────────────────────────────────
eq('OANDA:XAUUSD', candidatosDeTicker('OANDA:XAUUSD')[0], 'XAUUSD')
eq('BINANCE:BTCUSDT → BTCUSD', candidatosDeTicker('BINANCE:BTCUSDT').includes('BTCUSD'), true)
eq('EURUSD.pro → EURUSD', candidatosDeTicker('PEPPERSTONE:EURUSD.pro')[0], 'EURUSD')
eq('XAUUSDm → XAUUSD', candidatosDeTicker('XAUUSDm').includes('XAUUSD'), true)
eq('SPX500 → US500', candidatosDeTicker('OANDA:SPX500USD').includes('US500'), true)
eq('GER30 → GER40', candidatosDeTicker('ger30').includes('GER40'), true)

// ── webhook: sincronizar ao position_size ─────────────────────────────────
const L = (id: string, v: number) => ({ id, direcao: 'buy' as const, volume: v })
const S = (id: string, v: number) => ({ id, direcao: 'sell' as const, volume: v })
eq('já no alvo: nada', planoSincronizacao([L('a', 0.1)], 0.1).length, 0)
eq('alvo 0 fecha tudo', planoSincronizacao([L('a', 0.1), L('b', 0.2)], 0).length, 2)
eq('sem posição abre', JSON.stringify(planoSincronizacao([], -0.3)), JSON.stringify([{ tipo: 'abrir', direcao: 'sell', volume: 0.3 }]))
eq('aumenta a diferença', JSON.stringify(planoSincronizacao([L('a', 0.1)], 0.25)), JSON.stringify([{ tipo: 'abrir', direcao: 'buy', volume: 0.15 }]))
eq('inverte: fecha e abre', JSON.stringify(planoSincronizacao([L('a', 0.1)], -0.2)), JSON.stringify([{ tipo: 'fechar', positionId: 'a', volume: null }, { tipo: 'abrir', direcao: 'sell', volume: 0.2 }]))
eq('reduz FIFO com parcial', JSON.stringify(planoSincronizacao([L('a', 0.1), L('b', 0.2)], 0.15)), JSON.stringify([{ tipo: 'fechar', positionId: 'a', volume: null }, { tipo: 'fechar', positionId: 'b', volume: 0.05 }]))
eq('hedge vira alvo limpo', planoSincronizacao([L('a', 0.1), S('b', 0.1)], 0.1).length, 3)

// ── webhook: interpretar alertas ──────────────────────────────────────────
const manual = interpretarAlerta('{"acao":"buy","symbol":"XAUUSD","volume":0.1,"sl":2390,"tp":2420}')
eq('manual buy', 'acao' in manual && manual.acao, 'buy')
eq('manual volume', 'acao' in manual && manual.volume, 0.1)
const estrat = interpretarAlerta({ action: 'sell', contracts: '0.2', ticker: 'OANDA:XAUUSD', price: '2400', position_size: '-0.2' })
eq('estratégia com position_size = sync', 'acao' in estrat && estrat.acao, 'sync')
eq('alvo negativo', 'acao' in estrat && estrat.alvo, -0.2)
const flat = interpretarAlerta({ action: 'buy', ticker: 'XAUUSD', contracts: '1', position_size: '0' })
eq('estratégia a zero = sync 0', 'acao' in flat && flat.alvo, 0)
eq('texto simples', (() => { const r = interpretarAlerta('sell EURUSD 0.5'); return 'acao' in r && `${r.acao}:${r.ticker}:${r.volume}` })(), 'sell:EURUSD:0.5')
eq('close sem volume ok', (() => { const r = interpretarAlerta({ acao: 'close', symbol: 'XAUUSD' }); return 'acao' in r && r.acao })(), 'close')
eq('limit sem preço recusa', interpretarAlerta({ acao: 'buy', symbol: 'XAUUSD', volume: 0.1, tipo: 'limit' }).ok, false)
eq('placeholder por substituir recusa', interpretarAlerta({ action: 'buy', ticker: '{{ticker}}', contracts: 1 }).ok, false)
eq('acção desconhecida recusa', interpretarAlerta({ acao: 'hold', symbol: 'XAUUSD', volume: 1 }).ok, false)

console.log(mau === 0 ? `✓ ${ok} verificações passaram` : `${ok} ok, ${mau} FALHARAM`)
process.exit(mau === 0 ? 0 : 1)
