# Publicação no TradingView: RocketNova

- Tipo: **Invite-only**, como os outros scanners da casa.
- A descrição vai em inglês, sem links nem preços e sem prometer resultados. O acesso explica-se no campo «Author's instructions».

---

## Título
RocketNova by MTM

## Descrição (colar tal como está)

RocketNova is a trend-following tool that only fires when the trend, the structure and the market conditions agree. It reads three moving averages, marks the swing highs and lows as stars, highlights impulse candles and measures volatility and session volume. When a confirmed cross happens next to a recent launch star, it prints the signal and draws the full trade plan on the chart: entry, stop loss and four targets. The plan is then managed through alerts.

HOW IT WORKS

1. Three EMAs
A fast (20), a slow (50) and a long (238) exponential moving average. The signal is born when the fast average crosses the slow one and the candle closes. Candles are coloured by the trend; an optional filter only allows buys above and sells below the long average.

2. Stars (launch pad)
Swing highs and lows are detected with three settings: Depth (bars to the left the extreme must dominate), Deviation (minimum distance from the previous opposite star, in tenths of ATR) and Backstep (bars to the right that confirm the star). High stars are drawn above the bar, low stars below it. By default a buy requires a recent low star and a sell requires a recent high star, within a configurable lookback.

3. Rocket Candle
A candle whose body is at least 1.2 ATR and that closes in its extreme is painted yellow. An optional filter requires one Rocket Candle in the direction of the signal within the last bars before the cross.

4. Volatility Pulse
A panel compares the 14-period ATR with its 100-period average: HIGH (1.3× or more), NORMAL or LOW (0.7× or less), with the ratio shown.

5. Trade Clock
A chip shows the trading session state: Good Volume, Low Volume (volume under half of its 20-bar average) or Market Closed. Outside the session no signals are printed unless you allow it. Position and size are configurable.

TRADE PLAN (fixed on the signal candle)
• Entry at the close of the signal candle.
• Stop loss: Fixed Points (auto mode uses 100 pips, or 200 pips on gold) or Structure, placing the stop at the last opposite star with a 0.2 ATR buffer.
• TP1, TP2, TP3 and TP4 at 30%, 50%, 100% and 150% of the stop distance (TP2 at 60% on gold). TP4 is optional. Each size can be set by hand.
• Levels are drawn as lines, labels and a risk/reward box, and never move after the close.

POSITION MANAGEMENT
• After TP1 the stop can move to the entry price (break-even).
• An opposite signal closes the open trade.
• Every event of the same trade carries the same id as the signal candle.

ALERTS
Use "Any alert() function call" with "Once Per Bar Close". Each signal sends one JSON message with direction, entry, stop, TP1–TP4, timeframe, the bars since the launch star, the Rocket Candle flag, the volatility state and the volume state, ready for webhooks. Follow-up events for the same trade: tp1, tp2, tp3, tp4, sl, be (stop at entry hit) and exit (closed by an opposite signal). Simple "RocketNova Compra" (buy) and "RocketNova Venda" (sell) conditions are also available.

SETTINGS
EMA lengths, launch star and Rocket Candle filters with their lookbacks, Rocket Candle body size, long-EMA filter, Volatility Pulse position and colours, signal, label, star and candle colours, star Depth / Deviation / Backstep, Trade Clock session, position, size and colours, stop mode and sizes, TP sizes, TP4, break-even after TP1, close on opposite signal and the webhook key.

RECOMMENDED USE
• Works on forex, gold, indices and crypto, on any timeframe.
• Read the long average first, then wait for the cross next to a star. Check the Volatility Pulse and the Trade Clock before taking the idea.
• Signals and levels are fixed on candle close and do not repaint. Stars are confirmed after the Backstep bars, so a star appears a few bars after the extreme.

DISCLAIMER
RocketNova is an educational analysis tool. It does not place orders and does not guarantee results. Trading involves risk, and past behaviour does not predict future results. This is not financial advice.

## Author's instructions (sugestão)

RocketNova is invite-only. To request access, send a private message to this account with your TradingView username.
