// Tradução para inglês dos textos da simulação (legendas, etiquetas, painéis, cartões).
// O português é a fonte: `tr('en', texto)` devolve a versão inglesa, ou o próprio texto se não houver.

const EN = {
  // Legendas da demonstração 3D
  'O SuperTrend acompanha a tendência do ouro': 'The SuperTrend follows the trend in gold',
  'Virou para alta: sinal de compra': 'Turned up: buy signal',
  'Virou para baixa: sinal de venda': 'Turned down: sell signal',
  'Alvos (verde) e drawdowns (vermelho) por percentil das pernas anteriores': 'Targets (green) and drawdowns (red) by percentile of previous legs',
  'Nova viragem: os níveis recalculam-se a partir da nova entrada': 'New turn: levels are recalculated from the new entry',
  'Três DEMA (15, 50 e 238) mostram a tendência': 'Three DEMAs (15, 50 and 238) show the trend',
  'A linha laranja é o POC: o preço com mais volume': 'The orange line is the POC: the price with the most volume',
  'O fecho cruza o POC: sinal de entrada': 'The close crosses the POC: entry signal',
  'Stop a 1 ATR e alvos a 1:2, 1:4 e 1:6': 'Stop at 1 ATR, targets at 1:2, 1:4 and 1:6',
  'Velas de 15 minutos, no ouro ou num perpétuo cripto': '15-minute candles, on gold or a crypto perpetual',
  'Abre a sessão: a caixa marca o máximo e o mínimo da range': 'The session opens: the box marks the high and low of the range',
  'Stop na aresta oposta e 4 alvos em R, com o valor em $ para 1% de risco numa conta de 1000 USD': 'Stop on the opposite edge and 4 targets in R, with the $ value for 1% risk on a 1,000 USD account',
  'EMAs de 20, 50 e 238 e uma tabela com a tendência em 6 timeframes': '20, 50 and 238 EMAs and a table with the trend on 6 timeframes',
  'Zonas de suporte e resistência a partir dos pivots': 'Support and resistance zones from pivots',
  'Cruzamento confirmado das EMAs: sinal': 'Confirmed EMA cross: signal',
  'Entrada, stop e até quatro alvos projetados no gráfico': 'Entry, stop and up to four targets projected on the chart',
  'O Sensei junta várias leituras no mesmo gráfico': 'Sensei brings several readings onto one chart',
  'A nuvem dourada é a banda Sensei (média de 89 ± 1 desvio)': 'The gold cloud is the Sensei band (89 average ± 1 deviation)',
  'As confirmações vão acendendo no painel': 'Confirmations light up on the panel',
  'Todas de acordo: sinal Sensei': 'All in agreement: Sensei signal',
  'Quatro saídas em R: 1:1,5, 1:2,5, 1:4 e 1:6': 'Four exits in R: 1:1.5, 1:2.5, 1:4 and 1:6',
  'Exit 1 tocado: o stop passa para breakeven': 'Exit 1 hit: the stop moves to breakeven',
  // Legenda das cores
  'Níveis de alvo': 'Target levels', 'Níveis de drawdown': 'Drawdown levels', 'Entrada (linha central)': 'Entry (center line)',
  'Caixas de sessão': 'Session boxes', 'Alvos TP1 a TP4': 'Targets TP1 to TP4', 'Stop': 'Stop', 'Banda Sensei': 'Sensei band',
  // Etiquetas no gráfico
  'Entrada': 'Entry', 'SL em BE': 'SL at BE', 'ORB COMPRA': 'ORB BUY', 'ORB VENDA': 'ORB SELL', 'SENSEI COMPRA': 'SENSEI BUY',
  'Exit 1  1:1,5': 'Exit 1  1:1.5', 'Exit 2  1:2,5': 'Exit 2  1:2.5',
  'TP1 0,5R  +$5': 'TP1 0.5R  +$5', 'TP3 1,5R  +$15': 'TP3 1.5R  +$15',
  // Painéis
  'Tendência por timeframe': 'Trend by timeframe', 'Confirmações': 'Confirmations',
  'Alta': 'Up', 'Baixa': 'Down', 'Acima': 'Above', 'Abaixo': 'Below',
  'DEMA 15 acima da 50': 'DEMA 15 above 50', 'DEMA 50 acima da 238': 'DEMA 50 above 238', 'Preço acima do POC': 'Price above POC',
  'Acima da banda Sensei': 'Above the Sensei band', 'Estrutura em alta (CHoCH)': 'Bullish structure (CHoCH)', 'ADX acima de 15': 'ADX above 15',
  // Premium Scanner
  'Ouro em 15 minutos, nas sessões de Ásia, Londres e Nova Iorque': 'Gold on 15 minutes, in the Asia, London and New York sessions',
  'Cada vela vota a direção com cinco critérios': 'Every candle votes on direction with five criteria',
  'Maioria de acordo: sinal Premium': 'Majority in agreement: Premium signal',
  'Zona de entrada em recuo, stop e três alvos no gráfico': 'Pullback entry zone, stop and three targets on the chart',
  'O preço volta à zona e a ordem entra': 'Price comes back to the zone and the order fills',
  'TP1 tocado: o stop passa para a entrada': 'TP1 hit: the stop moves to entry',
  'Zona de entrada': 'Entry zone', 'PREMIUM COMPRA': 'PREMIUM BUY', 'PREMIUM VENDA': 'PREMIUM SELL',
  'LONDRES': 'LONDON', 'NOVA IORQUE': 'NEW YORK', 'ÁSIA': 'ASIA',
  'Voto da direção': 'Direction vote', 'Abertura da sessão': 'Session open', 'Há 1 h': '1 h ago', 'Há 4 h': '4 h ago',
}

const RULES = [[/^Rompimento da caixa (.+) a favor da tendência$/, (m) => `Breakout of the ${m[1]} box with the trend`]]

export function tr(lang, text) {
  if (lang !== 'en' || text == null) return text
  if (EN[text]) return EN[text]
  for (const [re, fn] of RULES) {
    const m = text.match(re)
    if (m) return fn(m)
  }
  return text
}

export const CARD_TEXT_EN = {
  'gold-killer': [
    { title: 'SuperTrend turn', text: 'An ATR SuperTrend (10 × 3) on price. When the line flips side, a buy or sell signal appears.' },
    { title: 'Targets and drawdowns by percentile', text: 'Green and red levels come from history: how far price went for and against you in previous legs.' },
    { title: 'Recalculated on every turn', text: 'Each new leg starts at the center line, the entry, and the levels are drawn again from there.' },
    { title: 'Alert with entry, stop and targets', text: 'The alert carries the entry, the stop at drawdown 50 and three targets at gains 50, 75 and 100, ready for webhooks.' },
    { title: 'Smoothed price source', text: 'Read the close, HLCC4 or a smoothed version of price that cuts out candle noise.' },
  ],
  'mtm-scanner': [
    { title: 'Three DEMAs, three horizons', text: 'DEMA 15, 50 and 238: short, medium and long term. When they line up, the trend is clear.' },
    { title: 'Volume POC', text: 'The orange line marks the price with the most volume in recent candles: where the market traded most.' },
    { title: 'Signal on the POC cross', text: 'When the close crosses the POC, a B or S appears on the chart, with an alert.' },
    { title: 'ATR stop and targets', text: 'Stop 1 ATR from entry and targets at 2, 4 and 6 times that risk, drawn at the signal.' },
    { title: 'Market structure', text: 'CHoCH when structure changes side, with BOS, inducements and sweeps over price.' },
  ],
  'aurum-flow': [
    { title: 'Session boxes', text: 'Pre London, London and New York: each box keeps the high, the low and the opening range.' },
    { title: 'Breakout with the trend', text: 'The signal only fires when the close breaks the box in the direction of the underlying trend.' },
    { title: 'Stop on the opposite edge', text: 'The stop sits on the other side of the range, with an ATR buffer and a risk cap per trade.' },
    { title: 'Four targets in R, in dollars', text: 'TP1 to TP4 in multiples of risk, with the $ value for the risk per trade you choose.' },
    { title: 'Mandatory regime', text: 'A trend average filters the side: buys above, sells below. A dead market does not count.' },
  ],
  trendshot: [
    { title: 'EMA cross', text: '20, 50 and 238 EMAs. A cross confirmed on the candle close gives the buy or sell signal.' },
    { title: 'Trend on six timeframes', text: 'The table shows the trend on several timeframes at once, without switching charts.' },
    { title: 'Support and resistance', text: 'Zones from pivots, with height capped by ATR so they do not cover the whole chart.' },
    { title: 'Entry, stop and up to four targets', text: 'After the signal, levels stay fixed at the entry zone: SL and TP1 to TP4.' },
    { title: 'Underlying trend', text: 'The 238 EMA shows the side of the market. Trading with it is the first rule.' },
  ],
  sensei: [
    { title: 'Confirmations panel', text: 'Each reading lights up on the panel. The signal only fires when there are enough confirmations.' },
    { title: 'Sensei band', text: 'An 89 average with one standard deviation: shows whether price is stretched or within normal.' },
    { title: 'SMC structure', text: 'CHoCH, BOS, sweeps and order blocks: the structure engine that reads who is in control.' },
    { title: 'Four exits in R', text: 'Exits at 1:1.5, 1:2.5, 1:4 and 1:6, with levels fixed on the signal candle.' },
    { title: 'Stop to entry', text: 'When the first exit is hit, the stop moves up to the entry price.' },
  ],
  'premium-scanner': [
    { title: 'Five-criteria vote', text: 'Price against the session open, against 1 h and 4 h ago, and against the EMA200 and EMA9. The majority sets the direction.' },
    { title: 'Three gold sessions', text: 'Asia, London and New York. Outside the sessions the scanner stays quiet.' },
    { title: 'Pullback entry', text: 'The entry zone sits a few dollars against price: you wait for gold to come back to you instead of chasing it.' },
    { title: 'Stop and three fixed targets', text: 'Stop beyond the zone and TP1, TP2 and TP3 at $5, $10 and $15, with the part that closes at each one.' },
    { title: 'Stop to entry', text: 'When TP1 is hit, the stop on the rest moves to the entry price.' },
  ],
}
