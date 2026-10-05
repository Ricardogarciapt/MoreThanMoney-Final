/**
 * A GUARDA DA NORMALIZAÇÃO DO FEED DIRECTO.
 *
 *   npx tsx lib/webtrader/feed-directo/normalizar.check.ts
 *
 * O caso mau: a conta do cliente tem `XAUUSD.r` e `GOLD` e o ecrã pede «XAUUSD» — sem mapa, o
 * gráfico ficava vazio e a cotação em branco numa conta que tem ouro.
 */
import { construirMapa, simboloDaCorretora, codigoTimeframe, timeframeParaDerivar, timeframesSuportados, fichaDeSpecMetaApi, digitosDeTick, velasDeTL, posicoesEOrdensDeTL, classeDoSimbolo } from './normalizar'

const falhas: string[] = []
const teste = (nome: string, cond: boolean) => { if (!cond) falhas.push(nome) }

// ── símbolos ────────────────────────────────────────────────────────────────
{
  const mapa = construirMapa(['XAUUSD.r', 'EURUSDm', 'US100.cash', 'GOLD', 'BTCUSDT', 'NVDA', 'XAUUSD.r'])
  teste('XAUUSD.r → XAUUSD', mapa.paraCanonico['XAUUSD.r'] === 'XAUUSD')
  teste('GOLD → XAUUSD', mapa.paraCanonico['GOLD'] === 'XAUUSD')
  teste('EURUSDm → EURUSD', mapa.paraCanonico['EURUSDm'] === 'EURUSD')
  teste('US100.cash → NAS100', mapa.paraCanonico['US100.cash'] === 'NAS100')
  teste('BTCUSDT → BTCUSD', mapa.paraCanonico['BTCUSDT'] === 'BTCUSD')
  teste('XAUUSD lê-se por um dos dois símbolos da conta', ['XAUUSD.r', 'GOLD'].includes(mapa.paraCorretora['XAUUSD']))
  teste('o nome da corretora também resolve', simboloDaCorretora(mapa, 'EURUSDm') === 'EURUSDm')
  teste('um símbolo que a conta não tem dá null', simboloDaCorretora(mapa, 'GBPJPY') === null)
  const pref = construirMapa(['XAUUSD.r', 'GOLD'], { XAUUSD: 'GOLD' })
  teste('a preferência guardada ganha ao ranking', pref.paraCorretora['XAUUSD'] === 'GOLD')
  const prefMorta = construirMapa(['XAUUSD.r'], { XAUUSD: 'GOLD' })
  teste('preferência para um símbolo que já não existe é ignorada', prefMorta.paraCorretora['XAUUSD'] === 'XAUUSD.r')
  teste('só da corretora: NVDA fica NVDA (acção)', mapa.paraCanonico['NVDA'] === 'NVDA' && classeDoSimbolo('NVDA') === 'acao')
}

// ── timeframes ──────────────────────────────────────────────────────────────
{
  teste('M5 → 5m na MetaApi', codigoTimeframe(300, 'metaapi', 'mt5') === '5m')
  teste('H1 → 1H na TradeLocker', codigoTimeframe(3600, 'tradelocker') === '1H')
  teste('M2 não existe em MT4', codigoTimeframe(120, 'metaapi', 'mt4') === null)
  teste('M2 em MT4 deriva-se de 1m', timeframeParaDerivar(120, 'metaapi', 'mt4')?.codigo === '1m')
  teste('H2 na TradeLocker deriva-se de 1H', timeframeParaDerivar(7200, 'tradelocker')?.codigo === '1H')
  teste('M3 numa TradeLocker (sem 1m que divida… 1m divide) deriva de 1m', timeframeParaDerivar(180, 'tradelocker')?.codigo === '1m')
  const lista = [{ chave: 'M1', seg: 60 }, { chave: 'M5', seg: 300 }, { chave: 'S30', seg: 30 }] as const
  teste('S30 não se dá em nenhuma plataforma', timeframesSuportados(lista, 'metaapi', 'mt5').map((t) => t.chave).join() === 'M1,M5')
}

// ── fichas ──────────────────────────────────────────────────────────────────
{
  const f = fichaDeSpecMetaApi('XAUUSD', { symbol: 'XAUUSD.r', digits: 2, contractSize: 100, minVolume: 0.01, volumeStep: 0.01, maxVolume: 50, profitCurrency: 'USD' })
  teste('ficha do ouro: 2 dígitos, pip 0,1, contrato 100', f.digits === 2 && Math.abs(f.pip_size - 0.1) < 1e-9 && f.contract_size === 100 && f.classe === 'metal')
  teste('tick 0,00001 → 5 dígitos', digitosDeTick(0.00001) === 5)
  teste('tick 0,01 → 2 dígitos', digitosDeTick(0.01) === 2)
}

// ── TradeLocker: velas e posições ───────────────────────────────────────────
{
  const v = velasDeTL({ d: { barDetails: [{ t: 1_700_000_060_000, o: 1, h: 2, l: 0.5, c: 1.5, v: 3 }, { t: 1_700_000_000_000, o: 1, h: 1, l: 1, c: 1, v: 1 }] } })
  teste('velas TL: ms → s, ordenadas', v.length === 2 && v[0].t === 1_700_000_000 && v[1].t === 1_700_000_060)
  const mapa = construirMapa(['XAUUSD', 'EURUSD'])
  const nomes = new Map([[1, 'XAUUSD'], [2, 'EURUSD']])
  const r = posicoesEOrdensDeTL(
    [{ id: 'p1', tradableInstrumentId: 1, side: 'buy', qty: 0.1, avgPrice: 2400, stopLossId: 'o1', takeProfitId: null, openDate: 1_700_000_000_000, unrealizedPl: 12.5 }],
    [
      { id: 'o1', tradableInstrumentId: 1, side: 'sell', qty: 0.1, type: 'stop', status: 'working', price: null, stopPrice: 2390, positionId: 'p1', stopLoss: null, takeProfit: null, createdDate: null },
      { id: 'o2', tradableInstrumentId: 2, side: 'buy', qty: 0.2, type: 'limit', status: 'working', price: 1.05, stopPrice: null, positionId: null, stopLoss: 1.04, takeProfit: 1.07, createdDate: null },
    ],
    nomes, mapa,
  )
  teste('a ordem de protecção vira SL da posição e não aparece como pendente', r.posicoes[0].sl === 2390 && r.ordens.length === 1 && r.ordens[0].id === 'o2')
  teste('o lucro da TradeLocker passa tal e qual', r.posicoes[0].lucro === 12.5)
}

if (falhas.length) { console.error('FALHOU:\n - ' + falhas.join('\n - ')); process.exit(1) }
console.log('normalizar.check: tudo verde')
