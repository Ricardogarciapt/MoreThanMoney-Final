# Reading the GoldKiller

> Read the pieces together. It's their combination that makes the chart make sense.

Video for this chapter: **GoldKiller bootcamp, video 1 · Basics: what it is and how to read it.**

The GoldKiller follows the gold trend with a calculation that runs underneath the chart, marks every reversal with a signal, and draws how far price usually goes in your favour and against you from the entry. There are four parts. Learn them one at a time.

## 1. The trend engine

Underneath the chart runs a SuperTrend: a line that measures the average volatility of recent candles (the ATR) and sits three times that distance from price. In an uptrend, the reference rises in steps below the candles. In a downtrend, it falls above them. It only switches sides when price crosses it.

This line isn't drawn on the chart. The indicator calculates it, but what you see is its result: the reversal.

## 2. The reversal: BUY and SELL

When the engine moves below price, a green **BUY** label appears under the candle. When it moves above, a red **SELL** label appears above the candle.

:::destaque
Nothing is confirmed until the candle closes. This is where most people get it wrong: they see the candle moving, enter before the close, and the reversal disappears.
:::

## 3. The centre line

On the same candle as the reversal, a grey line jumps to the closing price. This is the **centre line**: the entry for the new leg. Everything else is measured from it.

## 4. The Gain and Drawdown levels

From each reversal, the scanner draws steps:

- **Green, the Gains:** how far the previous legs went in your favour.
- **Red, the Drawdowns:** how far they went against you.

The values come from the price's own previous legs. They're not a forecast. They're a statistical reference: they tell you how much room you have to the first target, and how far price usually pulls back before it carries on.

[[foto: gk-render-2-en.jpg | Reversal, centre line and levels. MTM render, simulation with generated prices. | larga]]

| Level | What it's for in the alerts |
|---|---|
| **Gain 50** | First target (TP1) |
| **Gain 75** | Second target (TP2) |
| **Gain 100** | Third target (TP3), only the strongest legs get there |
| **Drawdown 50** | Stop: the typical pullback of previous legs |

:::alerta Classic mistake · Treating the levels as walls
In a strong trend, price passes Gain 50, 75 and 100 and keeps going. Other times it doesn't reach the first. The levels are a ruler, not a promise.
:::

:::exercicio Video 1 homework
Choose gold on the 15-minute chart and change nothing during the exercise. Look back through the history for five reversals and note, for each one:

| Reversal | BUY or SELL | Reached Gain 50 or Drawdown 50 first? | Did it pass Gain 75? |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |

Do all of this without trading. This exercise trains your eye better than any explanation.
:::
