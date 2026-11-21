# How I read a chart

> A chart won't tell you what's going to happen. It tells you where the price has already been, and that's more than most people bother to look at.

Anyone looking at a price chart for the first time sees green and red candles rising and falling, and nothing more. It looks like an electrocardiogram with no doctor. Most of what you see is noise, and the job is to separate the noise from what keeps repeating.

This chapter is about the tool I use most for that: trend regression. I'm not going to ask you to believe anything. I'll explain the idea in a way that lets you test it yourself, on paper, before you see it on a screen with money involved.

## Starting with the coffee

Imagine you go to a café in Porto every morning and pay, on average, €1.20. One day you pay €1.25. Another day, €1.18. In one week, there's a day when they charge you €1.80. You find that strange, right? It isn't normal. You know the coffee "usually" costs €1.20, and that the swings around that figure are small.

Now imagine that the following month the café raises its price to €1.50, and stays there. That new level is no longer a swing: it's the new normal. Your reference has to change. This example contains the two ideas that hold everything else up: there's an average around which the price oscillates, and that average can move.

:::curso Lesson 301 · What is a candle
Each candle sums up what the price did over a period: a minute, an hour, a day. It has four points.

- **Open and close:** the body of the candle.
- **High and low:** the wicks, up and down.
- Did it close above where it opened? It's bullish. Below? It's bearish.

One candle on its own says little. Ten candles in a row already tell a story: who was in control, and whether they started to tire.

In the course: you read real gold candles, one by one, before you look at any indicator.
:::

## The middle line

A linear regression is a mathematical way of finding the straight line that best fits a series of points. On a price chart, that line shows the general direction of the movement and works as a "centre" around which the price oscillates.

You don't need to know the formula to understand the idea. Imagine placing a ruler on the chart so that the points are more or less balanced on both sides. The line that's left is the middle line.

To practise, do the exercise below. It uses hypothetical values with no connection to real markets.

:::exercicio Working out the average by hand
Illustrative example: ten values of a product, in euros, over ten days.

| Day | Value |
|---|---|
| 1 | €10.00 |
| 2 | €10.20 |
| 3 | €10.10 |
| 4 | €10.40 |
| 5 | €10.30 |
| 6 | €10.60 |
| 7 | €10.50 |
| 8 | €10.70 |
| 9 | €10.60 |
| 10 | €10.90 |

1. Add up the ten values. Result: €104.30.
2. Divide by 10. Average: €10.43.
3. Mark the ten points on your paper chart and draw a horizontal line at €10.43.
4. Notice how many points sit above and how many below. The line gives you a reference, not a forecast.

Day when the value was furthest from the average: ____________
How far away it was: ____________
:::

[[foto: rg-ecras.jpg | At the screen, reviewing old charts. The dullest work is what teaches the most. | polaroid]]

## The elastic

This is where the image of an elastic band helps. Think of the middle line as a point attached to an elastic band. When the price moves far away, the band stretches and pulls it back. The further it moves, the greater the tension.

Regression analysts usually draw two parallel bands either side of the line, set at a certain multiple of the standard deviation. Those bands tell you when the distance is unusual. When the price touches a band, the question isn't "will it come back?", but "what has changed to make it move so far away?".

:::destaque
Regression measures how far something is from a centre. It doesn't measure why it's that far, and it doesn't guarantee that the price will come back.
:::

That distinction is everything. An elastic band can stay stretched for a long time if the floor shifts beneath it. In the café example, the price never went back to €1.20, because the café changed its policy. Markets work the same way: an economic news story, a central bank decision or a shift in collective mood can move the average, and your ruler is then out of date.

:::historia
Illustrative example. A person sees the price stretched away from the line and decides that "it has to come back". They wait, then wait some more, and the loss grows against them. The middle line didn't fail. What failed was the belief that the line is a promise.
:::

:::nota
Before looking at the chart:
• Trend from above: up, down or sideways?
• Am I far from or close to the middle line?
• Is there any major news today?
:::

## What a scanner does

The idea of a scanner, like the GoldKiller Scanner we have on TradingView, is to automate the repetitive work: apply the same reading rule to the whole chart and flag when the price enters a zone that the rule considers unusual. It saves you working out the sums by hand, and above all it saves you staring at the chart all day. The technical details of each indicator are in the product documentation, and it's worth reading them before you trust it.

What the scanner doesn't do is decide for you. An alert is information, not an order. Before any decision you still have to answer four questions: what's the context (is there any important news today?), what's your plan (where you get in, where you get out if you're wrong), how much you're prepared to lose (that's chapter 8) and whether you're in the right emotional state to follow the plan.

:::alerta
A scanner that flags a lot isn't better for flagging a lot. If a signal appears without context, reading it as a guarantee is a mistake. No tool replaces your own reading of the risk.
:::

:::post @morethanmoney.pt
imagem: A scanner doesn't decide for you. It shows you where to look.
legenda: Tools like the GoldKiller Scanner help filter out the noise. The decision, the risk and the responsibility are still yours. Educational content.
:::

:::curso Lesson 409 · Timeframes
The same market looks different depending on the chart you open. On the 5-minute chart it looks like chaos. On the daily it looks like a calm line.

- **Bigger chart** (daily or 4 hours): tells you the direction.
- **Middle chart** (1 hour): shows you the structure.
- **Smaller chart** (15 minutes): is where you choose the moment to enter.

The rule I repeat most: **the bigger chart sets the direction, the smaller one sets the timing.** Anyone who sells on the 5-minute chart against a rise on the daily is swimming against the current, and they'll tire first.

In the course: you do the same analysis on three charts at once, with the regression from the start of this chapter.
:::

## Reading without fooling yourself

There are three mistakes I see repeated in people who are starting to read charts:

| Mistake | What to do instead |
|---|---|
| Seeing patterns everywhere | Define in advance what counts as a pattern and how many times you've seen it |
| Using the line as a target | Use the line as a reference and set your exit before you enter |
| Changing the time window until the story fits | Pick one period and keep it for weeks |

The last one is the sneakiest. If you keep changing the period of analysis until you find the line that proves you right, you're not reading the chart. You're making it confirm what you already thought.

:::destaque
Educational content, not financial advice. Reading charts doesn't guarantee results, and the risk of loss is real.
:::

:::cartao Reading a chart in 5 steps
1. Chart from above: what's the trend?
2. Where is the price relative to the average?
3. Is the elastic stretched or relaxed?
4. Where would my stop be?
5. If I can't see it clearly, I don't enter.
:::

## In summary

- Trend regression draws a middle line around which the price oscillates, and that average can move.
- The bands show unusual distances, not guarantees of a return.
- A scanner automates the reading, but an alert is information, not an order.
- Before acting, you need context, a written plan and a loss limit.
- The biggest mistake is changing the window or the rule until the chart confirms your opinion.

[[grafico:regressao-tendencia]]

## Your mission this week

Take a chart of an asset that interests you (a currency pair or gold, on a demo account or on paper), draw by hand a middle line for the last 20 periods, and write on a sheet how many times the price closed above it and how many times below. Don't draw any conclusions. Just observe.
