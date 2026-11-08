# Publicação no TradingView: SniperPro by MTM

- Dois estudos, ambos **Invite-only**, como os outros scanners da casa.
- A descrição vai em inglês, sem links nem preços e sem prometer resultados. O acesso explica-se no campo «Author's instructions».
- Publica primeiro o SniperPro (painel de preço) e depois o Asst (painel inferior); na descrição do Asst referes o outro pelo nome.

---

## 1 · Título
SniperPro by MTM

## 1 · Descrição (colar tal como está)

SniperPro is a complete price-panel toolkit in a single study. It brings together exhaustion bands, an adaptive trend screener, a Kalman cloud, a fading SuperTrend, a Parabolic SAR, volume-exhaustion labels, classic pivots and key levels. Every section can be switched on or off, so the chart stays as light as you need.

HOW IT WORKS

1. Exhaustion bands
A 55-period average of the candle midpoint with three envelopes at 1.5, 2 and 2.5 standard deviations. The zone between the second and the third envelope is filled: red above price, blue below. Price inside that zone is stretched and usually mean-reverts or pauses.

2. Trend Screener
Eleven adaptive moving averages (VIDYA) on Fibonacci lengths from 8 to 987. Each average speeds up when momentum is strong and slows down when the market is quiet. The table at the top of the chart summarises them:
• Bias: Bullish or Bearish, by how many lengths price is above or below.
• State: Trending, Consolidating or Pulling Back (price against the short average but with the long one).
• Strength: Very Strong, Strong, Neutral, Weak or Very Weak, by how aligned the lengths are.
The 55 (coloured by slope), 233 (purple) and 987 (gold) averages are drawn on the chart.

3. Kalman cloud
Two Kalman filters (short 5, long 13). The cloud is blue while the short filter is above the long one and red while it is below. Candles take the same colour. An optional glow highlights the lines.

4. SuperTrend and Parabolic SAR
A fast SuperTrend (ATR 2, multiplier 1) whose line fades as price moves away from it, so a strong line means price is close to the trailing level. A Parabolic SAR is drawn as crosses.

5. Volume exhaustion (KDE)
At every swing high and low the study estimates how often the current momentum reading has marked a turning point before, using a Gaussian kernel density weighted by relative volume. When the probability is above the threshold, a yellow "Vol: N%" label is printed at the pivot.

6. Signals
A signal appears when the short Kalman filter crosses the long one on a valid candle (minimum body-to-range ratio and, on H1 and above, a minimum body size in pips) and at least three of four trend votes agree: SuperTrend 10/3, HalfTrend 2/2, Ichimoku 5/26/52/26 and Parabolic SAR. The "+N" label is the score: trend votes in favour, plus one for a recent momentum divergence and one for a recent volume-exhaustion label.

7. Classic pivots
Pivot point with up to seven supports and seven resistances (S1–S7, R1–R7). The timeframe is automatic (daily on M15 and below, weekly up to H4, monthly on daily charts, yearly above) or fixed. Labels with prices can sit on the left or the right.

8. Key levels
The most recent swing highs and lows are drawn as horizontal levels with a glow: red above price, blue below. The number of levels, the glow size and its opacity are adjustable.

ALERTS
Use "Any alert() function call" with "Once Per Bar Close". Each signal sends one JSON message (direction, entry, stop loss from SuperTrend 10/3, TP1–TP3 at 1R, 2R and 3R, score, trend bias, state and strength), ready for webhooks. Simple "SniperPro Compra" (buy) and "SniperPro Venda" (sell) conditions are also available.

SETTINGS
Bands (source, length, three deviations, colours, dashed, transparency), Trend Screener (source, CMO or StDev method, eleven lengths, table colours), Kalman cloud (lengths, colours, glow, fill, candle colours), SuperTrend (length, multiplier, opacity range), KDE (bandwidth, bins, threshold, relative-volume length, activation, colours), Exp-RSI, trend votes, divergence thresholds, candle filters, pivots and key levels.

RECOMMENDED USE
• Works on forex, gold, indices and crypto, on any timeframe.
• Read the table first (bias, state, strength), then look for signals in the direction of the bias, away from the exhaustion zone and near a pivot or key level.
• Pair it with SniperPro Asst by MTM in the lower panel for momentum, retests and divergences.
• Signals and levels are fixed on candle close and do not repaint.

DISCLAIMER
SniperPro is an educational analysis tool. It does not place orders and does not guarantee results. Trading involves risk, and past behaviour does not predict future results. This is not financial advice.

## 1 · Author's instructions

SniperPro is invite-only. To request access, send a private message to this account with your TradingView username.

---

## 2 · Título
SniperPro Asst by MTM

## 2 · Descrição (colar tal como está)

SniperPro Asst is the lower-panel companion of SniperPro by MTM. It reads momentum with a smoothed short RSI, frames it with dynamic retest and reversal bands, shows the trend direction of four independent tools, and marks momentum divergences.

HOW IT WORKS

1. Exp-RSI
A 5-period RSI smoothed exponentially (factor 0.1). It is drawn as a candle: blue while rising, red while falling. The dotted trail shows the previous value.

2. Momentum channel (MOM-LRC)
A linear-regression channel of the Exp-RSI over the last 5 bars, widened by the channel multiplier. It shows the short-term slope and how stretched the momentum is.

3. Retest and reversal bands
An EMA of the Exp-RSI (200 by default) with bands at 1.0 and 1.5 standard deviations. A touch of the upper band is labelled "Bearish Retest" and of the lower band "Bullish Retest". The outer zones (4 standard deviations, capped at 0 and 100) are the "Bearish Reversal" and "Bullish Reversal" areas, where momentum is exhausted.

4. Trend Direction
Four dotted lines show the vote of SuperTrend 10/3, HalfTrend 2/2, Ichimoku 5/26/52/26 and Parabolic SAR: at 51 when the tool favours buying, at 49 when it favours selling. The centre line at 50 is coloured by the majority.

5. Divergences
A bearish divergence is marked when price makes a higher high while the Exp-RSI makes a lower high, with the RSI above the configured thresholds (65 then 50). A bullish divergence is the mirror (35 then 50). Each one is marked with a circle on the RSI and a "D" near the reversal zone.

ALERTS
"SniperPro Asst Divergência Bullish" and "SniperPro Asst Divergência Bearish" alert conditions.

SETTINGS
Exp-RSI length and smoothing, EMA period, regression bars and multipliers, SuperTrend, HalfTrend, Ichimoku, Parabolic SAR, divergence thresholds and colours.

RECOMMENDED USE
• Use it under SniperPro by MTM: take signals from the price panel when the Exp-RSI is leaving a retest band in the same direction, and be careful with signals that start inside a reversal zone.
• Works on forex, gold, indices and crypto, on any timeframe.
• Values are fixed on candle close and do not repaint.

DISCLAIMER
SniperPro Asst is an educational analysis tool. It does not place orders and does not guarantee results. Trading involves risk, and past behaviour does not predict future results. This is not financial advice.

## 2 · Author's instructions

SniperPro Asst is invite-only. To request access, send a private message to this account with your TradingView username.
