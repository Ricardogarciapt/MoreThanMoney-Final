# Reading the chart without a crystal ball

> The chart does not tell you what is going to happen. It tells you where other people have already changed their minds.

Some people look at a chart the way others read their horoscope. They look for a pattern, a figure, a secret signal that says "now it goes up". It does not exist. What the chart shows you is a record: where the price has been, where it stopped, where it turned back. From there, your job is to mark the zones where it makes sense to act and to decide in advance what you will do if the price gets there.

Reading a chart, in the cold method, means drawing a map. It does not mean guessing the destination. And the map is drawn with the second button in the bottom bar: **Chart**.

## The candle

You already set the chart to Japanese candles in chapter 1. Now you will understand why. Each candle shows one period (one minute on M1, one hour on H1) and holds four prices:

[[grafico:anatomia-vela]]

- **Body**: between the open and the close. Gold (or green, or blue, depending on your colours) if it closed above the open; dark (or red) if it closed below.
- **Wicks**: the highest and lowest points the price reached in that period.

A long upper wick means the price rose and was pushed back down before the candle closed. It is information, not a prophecy.

## On the screen: the same pair in two timeframes

Open the chart for your pair: in **Quotes**, tap the pair and choose **Chart**. Now notice what changes when you change the timeframe.

:::galeria Changing the timeframe changes the story
mt5-tel-grafico.png | M1: each candle is one minute. Lots of noise.
mt5-tel-grafico-velas.png | H1: each candle is one hour. The trend is easier to see.
:::

[[grafico:tempos-grafico]]

To change the period, hold your finger on the chart and choose M1, M5, M15, M30, H1, H4, D1… On the PC, the buttons are on the bar at the top.

:::galeria Choosing the period
mt5-tel-periodos.png | Hold your finger on the chart to choose the timeframe: minutes, hours and days.
:::

Two more gestures save time: **swipe** left and right to move back and forth in time, and **pinch** two fingers to see more or fewer candles. The coloured label on the right marks the current price.

:::alerta Classic mistake · Living on M1
On the one-minute chart everything looks like an opportunity. It is the timeframe where the most trades are made and the least is thought. Only open it once you have already decided on a higher timeframe.
:::

## Trend: highs and lows

The simplest way to read direction is to look at the highs and the lows:

| Trend | Highs | Lows | What you look for |
|---|---|---|---|
| **Up** | higher and higher | higher and higher | buys on pullbacks |
| **Down** | lower and lower | lower and lower | sells on rallies |
| **Sideways** | roughly at the same level | roughly at the same level | stay out, or trade the edges carefully |

Always start with the bigger chart (H4 or daily) to find the direction, and only then move down to H1 to choose the moment. Trading against the direction of the bigger chart is rowing against the tide with a plastic oar.

:::nota
First the map (H4 or D1). Then the street (H1). Never the other way round.
:::

:::historia Marta, day 6
After a night shift, Marta opened EURUSD on M1 and saw seven "opportunities" in twenty minutes. Every green candle looked like the start of a rise, every red one like the end of the world. She remembered the note on her sticky note, switched to H4 and kept watching. Over four days, the price had made three lows, each one higher than the last. The seven M1 opportunities were just noise inside a calm uptrend. She closed the app and went to bed.
:::

## Support and resistance are zones, not lines

**Support** is a zone where the price has stopped falling. **Resistance** is a zone where it has stopped rising. Draw them as bands, not as thin lines: the price rarely respects an exact number to the pip.

1. On the H4 chart, look for two or three places where the price reversed more than once.
2. Draw a rectangle that covers the wicks and bodies of that zone.
3. Repeat above and below the current price. Two zones on each side are enough.

When a resistance is broken with force, it often starts working as support, and vice versa. But "often" is not "always", and that is why the stop exists.

### On the screen: drawing the zone

On the phone, drawings are called **objects** and sit behind the shapes icon at the top of the chart.

1. Tap the objects icon and choose **Rectangle**.
2. Tap one corner of the zone and drag to the opposite corner.
3. To fine-tune, tap the drawing and drag its points. To change the colour or delete it, hold your finger on it.
4. Always use the same colour for supports and another for resistances. A month from now you will be grateful.

:::galeria Drawing and fine-tuning
mt5-tel-objetos.png | The list of drawn objects, by pair. From here you edit, hide or delete them.
mt5-tel-fibonacci.png | A Fibonacci's properties: points, levels, colour and style.
:::

## Fibonacci, without the mysticism

The Fibonacci retracement tool marks percentage levels of a pullback: 38.2%, 50% and 61.8% are the most used. The maths comes from the Fibonacci sequence, but the reason it sometimes works is simpler: lots of people look at the same levels.

1. In an uptrend, connect the low to the high of the last move (on the phone: objects › **Fibonacci Retracement**).
2. MT5 draws the levels. Check whether any of them coincides with a support zone you already drew.
3. The overlap of a zone and a level is an interesting place to plan an entry. A level on its own, no.

[[foto: mt5-analise-tecnica.jpg | On the computer, the Fibonacci tools are under the menu "Insert › Objects › Fibonacci". Several charts and timeframes side by side: this is where the big screen helps. Image: MetaQuotes (metatrader5.com). | larga]]

:::post @ricardogarciapt
imagem: Draw the map before you leave the house.
legenda: Zones marked on Sunday, plan written, pending orders in place. During the week, the market comes to you. Or it does not come, and that is fine too.
:::

## Indicators: one at most

Indicators are behind the ***f*** button at the top of the chart. MT5 comes with dozens, grouped by families: trend (moving averages, bands), oscillators (RSI, stochastic, MACD), volumes. You can even put several on the same window.

:::galeria The f button
mt5-tel-indicadores.png | The f button lets you choose an indicator by family: trend, oscillators, volumes.
:::

Knowing where they are does not mean using them all.

:::alerta Classic mistake · Filling the chart with indicators
RSI, MACD, three moving averages, bands, stochastic. The screen becomes a Christmas tree and the decision gets harder, not easier, because there is always one indicator saying yes and another saying no. You pick the one that proves you right. That is confirmation bias with lights on. In the cold method, the chart has candles, zones and, at most, one tool.
:::

If you want to try one, choose a simple moving average on H4, just to see the direction. To remove an indicator, hold your finger on it and choose delete (on the PC: right-click › Indicators List).

## What the scanners do for you

At MoreThanMoney we use scanners that mark zones, trend and possible entries automatically. A scanner does not decide for you: it saves you time drawing and helps you not see what is not there. The rule stays the same: entry, stop, target and lot come from your plan. In "I Destroyed It All. And I'm Glad." I explain in detail the trend-regression reading I use. Here is the essential point: a good tool in the hands of someone without rules is still just a tool.

## The cold rule of this chapter

:::cartao Cold rule no. 4
Map first: direction on H4, moment on H1. Zones, not lines. At most one tool on the screen.
:::

## In short

- The chart is a record of where the price changed direction, not a crystal ball.
- A candle holds four prices: open, close, high and low.
- The timeframe changes the story: decide on H4, fine-tune on H1, stay away from M1.
- Highs and lows tell you the trend; support and resistance are drawn as zones, with the app's objects.
- Fibonacci is worth something when it coincides with a zone; on its own, not.
- Indicators behind the *f* button: one at most.

:::exercicio For today
1. On your pair, open H4. Write down the trend: up, down or sideways: ____________
2. With the app's objects, draw two support zones and two resistance zones.
3. Draw a Fibonacci on the last move and see whether any level coincides with a zone.
4. Switch to M1 for one minute and then go back to H4. Write down what you felt in each: ____________
5. Take a screenshot and save it in the "Journal" folder. Write underneath: "If the price reaches ____ , my plan is ____ ".
:::
