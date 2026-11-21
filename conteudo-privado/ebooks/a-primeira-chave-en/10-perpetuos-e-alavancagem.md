# Perpetuals and leverage

> Leverage does not create money. It only amplifies what was already there, mistakes included.

This is the chapter I left near the end on purpose. Perpetuals are very different from buying a coin and holding it. When I explain them to someone who has just started, my main worry is that they understand the risks before feeling the temptation to use them. If you are reading this near the start of the book, that is fine: you can skip to the last chapter and come back here later.

:::post @morethanmoney.pt
imagem: Leverage does not forgive.
legenda: 100x sounds powerful. It just means a liquidation price very close by. If you cannot say where you lose everything, leverage is not for you. Not yet.
:::

## What perpetuals are

A perpetual contract, or perp, is a derivative instrument. You do not buy the coin. You bet that the price will rise (long) or fall (short), with a contract that has no expiry date. To open a position you use margin, which is a fraction of the total value, and the platform lends you the rest. That is what creates the leverage effect.

An analogy. If you have €100 and the platform lends you another €900, you can move an amount worth €1,000. If the market rises 10%, you gain €100 on your €100, which is 100%. If it falls 10%, you lose the full €100. The same move that would have cost you €10 in a simple purchase now costs you everything.

:::destaque
Leverage multiplies gains and losses in the same way. The difference is that the loss can be total before the market appears to have done anything serious.
:::

## Liquidation: the moment the platform closes the position

When the loss uses up the margin you put in, the platform closes the position automatically. This is called liquidation. There is no discussion, no waiting period, and often no chance to react.

[[grafico:alavancagem]]

As a rough guide, and ignoring fees, liquidation happens close to these points: at 2× the position is liquidated near a 50% fall; at 5×, near 20%; at 10×, near 10%; at 20×, near 5%; at 50×, near 2%; and at 100×, near 1%. The higher the leverage, the smaller the move that wipes you out. A normal day in crypto can have swings of that size.

:::alerta
With high leverage, a small, ordinary move can liquidate your position. You do not need a catastrophic piece of news. A single day's swing is enough.
:::

:::ecra Example · open position (illustrative)
Margin: €100
Leverage: 10×
Value controlled: €1,000
Approximate liquidation: a fall of about 10%, before fees
Status: open
:::

:::curso Lesson 8.2 · Perpetuals and leverage
With 10× leverage, a 10% move against you can wipe out the entire margin of that position. This is not theory, it is arithmetic.

In the course: you work out the liquidation price in three examples and see why this is the last module, not the first.
:::

## Why not start here

I would not start with perpetuals. This is not a ban, it is a question of order. First you understand the coin, the wallet, security, regular buying and taxes. Then, if it makes sense, you study derivatives more calmly. Those who start at the end of the road usually lose money and confidence at the same time.

There is also a psychological problem. With leverage, every swing feels urgent. You start checking the price every minute, doing sums in your head and deciding on impulse. That tension is expensive.

:::conversa Telegram · Gonçalo
Gonçalo: I saw a video of some bloke doing 50x, it looks easy!
eu: Before 50x, work out the liquidation. At 50x, a move of about 2% already closes your position.
Gonçalo: Oh... I had not done that sum.
:::

## Illustrative example: the same move, two realities

**Illustrative example**, with round, made-up figures. Inês buys €100 of a coin on the spot. The price falls 10%. She is left with €90, has lost €10, and can wait.

Tiago opens a €100 position with 10× leverage, which means he controls €1,000. The price falls 10%. The loss is €100, which is the whole margin. He ends up with zero, with no time to decide. They saw the same market move and the result was radically different. These numbers are there to illustrate the logic, not as a forecast or a pattern.

:::cartao Before you use leverage
- Do I know the price at which the position gets liquidated?
- Could I lose the whole margin without it affecting me?
- Am I opening this on impulse, or from a written plan?
- Have I understood the basics of the book (coin, wallet, taxes)?
:::

## Exercise: the liquidation sum

:::exercicio How far does the market need to move to liquidate you?
1. Choose a hypothetical margin, for example €100.
2. Choose a hypothetical leverage, for example 5×.
3. Calculate: 100 ÷ 5 = 20%. This is the rough move the price needs to fall to liquidate the position, ignoring fees.
4. Repeat with 10× and with 20×. Write down the three results.
5. Ask yourself: if I woke up tomorrow to this move, how would I react?

____________________________________________________________

____________________________________________________________
:::

## A short story

:::historia
Illustrative case: Gonçalo, 27, a logistics technician in Aveiro, watched a video of someone making big money from perpetuals. He opened a position with high leverage without understanding the liquidation. An ordinary market move closed it within minutes. It was not the end of the world, because the amount was small, but it was an expensive lesson. Today he teaches beginners what he learned.
:::

:::nota
Today: do the exercise sum with your hypothetical numbers, and do not open any position, not even a simulated one, before you have done it.
:::

## In short

- Perpetuals are derivatives: leveraged bets with no expiry date.
- Leverage multiplies gains and losses in the same way.
- Liquidation closes the position automatically when the margin runs out.
- The higher the leverage, the smaller the move that wipes you out.
- For a beginner, the right order is to understand the basics first.

Educational content, not financial advice. With perpetuals you can lose your entire margin in a very short time.

## To do today

1. Choose a hypothetical margin of €100 and a leverage of 5×, and work out the liquidation.
2. Repeat the sum with 10× and 20×, and write the three results on paper.
3. Write the question you would ask yourself if you woke up to that move tomorrow.
4. If you still feel like opening a position, wait a week and do the sum again.
