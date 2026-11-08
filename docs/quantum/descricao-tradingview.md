# Publicação no TradingView: Quantum

- Dois scripts, publicados em separado, ambos **Invite-only**: «Quantum by MTM» (painel de preço) e «Quantum Oscillator by MTM» (painel inferior).
- A descrição vai em inglês, sem links nem preços e sem prometer resultados. O acesso explica-se no campo «Author's instructions».

---

## Script 1 · Título
Quantum by MTM

## Descrição (colar tal como está)

Quantum is a trend-following tool that enters on pullbacks. It reads the market in three steps: first it confirms the direction, then it waits for the price to pull back inside that direction, and only then it prints the entry signal. Nothing here tries to guess a top or a bottom.

HOW IT WORKS

1. Primary line
A long moving average (269 by default; EMA, SMA, WMA, HMA, RMA or VWMA) drawn with a base line and a glow. It turns blue when price holds above it and red when price holds below it, grey while undecided. The candles and the bar colours follow the same phase.

2. Phase arrow
A large triangle marks the start of each phase: up when two closes confirm price above the primary line, down when two closes confirm price below it.

3. Strength panel
A table with a score from 0 to 100 and an arrow per timeframe (M1, M5, M15, M30, H1, H4, D, W). Each timeframe compares price with a fast average and the fast average with a slow one. Above 60 is strong bullish, 40 or less is strong bearish, 45 to 50 is neutral.

4. Small arrows
Printed when the close crosses back over the 8-period average in the direction of the phase: the bars are aligned again.

5. Pullback triangles
A pullback to the 21-period ribbon followed by a close back above the 8-period average (buy) or below it (sell), in a candle of the phase colour.

6. Wave dots
The Stochastic RSI (RSI 14, %K 5, smoothing 1) leaves its zone in the direction of the phase: up through 20 in a bullish phase, down through 80 in a bearish phase.

7. Structure
HH / HL / LH / LL labels on swing points (21 bars) and two trend lines through the last pivots (13 bars): blue through the highs, red through the lows.

8. Volatility bands
Two bands around a 20-period mean, at 2 and 3 standard deviations, filled in grey. A pullback that reaches the band is the stronger entry.

9. Sessions
Highs and lows of the New York, London and Asia sessions, with labels, extended until the next session starts.

READING
Buy: phase up, blue primary line, score above 60, small arrows blue, oscillator in the lower zone, then a blue triangle and/or a blue dot. Sell is the mirror image. The strongest entries have the triangle and the dot on the same candle, with price at the lower band (buy) or the upper band (sell).

ALERTS
Use "Any alert() function call" with "Once Per Bar Close". Each entry sends one JSON message with direction, price, a stop beyond the extreme of the last bars of the pullback, a target at two times the risk, the score, the signal type and the timeframe, ready for webhooks. Simple conditions are also available: phase up, phase down, buy entry and sell entry.

SETTINGS
Sessions and timezone, timeframes where signals are shown, bar colour and plot candles, primary line length and type with base and glow widths, high/low lines and labels with swing length and pivot lookback, macro line, band length and multipliers, oscillator lengths and levels, strength panel position and lengths, webhook key, stop lookback, target multiple and score filter.

RECOMMENDED USE
• Forex, gold, indices and crypto; 5, 15 and 30 minutes for intraday, 1 hour and above for swings.
• Confirm the phase, the primary line and the score first. Check that the entry timeframe and the next three agree on the panel.
• Signals are fixed on candle close and do not repaint. Swing labels and trend lines appear after the confirmation bars.

DISCLAIMER
Quantum is an educational analysis tool. It does not place orders and does not guarantee results. Trading involves risk, and past behaviour does not predict future results. This is not financial advice.

## Script 2 · Título
Quantum Oscillator by MTM

## Descrição (colar tal como está; versão simples, aceite pelo TradingView)

Quantum Oscillator by MTM is the lower panel of the Quantum trend-following system.

It is a Stochastic RSI with RSI length 14, K length 5 and smoothing 1 and 1. Two zones are shaded on the panel. The zone from 80 to 100 is red and marks the sell pullback zone. The zone from 0 to 20 is blue and marks the buy pullback zone.

The background of the panel shows the phase of the market. The phase comes from a 260-period EMA on the chart. Blue means price is above the average and red means price is below it.

A triangle prints when the oscillator leaves the zone of the direction. An up triangle prints when the oscillator crosses above 20 during a bullish phase. A down triangle prints when the oscillator crosses below 80 during a bearish phase.

Use it together with the Quantum by MTM script on the price panel. Before an entry the oscillator must be inside the zone of the direction. Leaving that zone is the wave signal that confirms the pullback is over.

Settings include the timeframes where triangles are shown, the RSI length, the EMA length for the phase, the K length and smoothing, the D smoothing, the top and bottom lines, the zone limits and the background transparency.

Alerts are available for the buy triangle and the sell triangle.

This is an educational analysis tool. It does not place orders and does not guarantee results. It is not financial advice.

## Author's instructions (sugestão, para os dois)

Quantum is invite-only. To request access, send a private message to this account with your TradingView username.

---

## Descrição em português (para a loja, Telegram e redes)

O Quantum é um seguidor de tendência que entra em recuos. Lê o mercado em três tempos: confirma a direção com a linha primária, a seta de fase e o painel de força por timeframe; espera que o preço recue e que o oscilador entre na zona da direção; e só então dá o sinal de entrada, um triângulo de recuo, um ponto de onda ou os dois na mesma vela. Traz ainda a estrutura (HH, HL, LH, LL e linhas de tendência), as bandas de volatilidade e os máximos e mínimos das sessões de Nova Iorque, Londres e Ásia. Alertas com entrada, stop e alvo, prontos para webhook.

Conteúdo educativo, não constitui consultoria financeira. Não executa ordens nem garante resultados.

## Scripts publicados (08/11/2026)

- Quantum by MTM: https://www.tradingview.com/script/JxLihEk6/
- Quantum Oscillator by MTM: https://www.tradingview.com/script/HLrwD3QG/

Os links vão no email de acesso pós-compra (lib/scanners/links-tradingview.ts). Falta o `PUB;…` de cada um para o widget do scanner mobile (`lib/scanners/estudos.ts`).
