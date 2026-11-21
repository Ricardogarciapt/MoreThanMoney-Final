# Pips, lots and the price of a mistake

> Nobody loses their account because they do not know what a pip is. They lose it because they know and never do the sum.

Think about the butcher's. You ask for "a bit of meat" and the butcher weighs it. The price per kilo is the same for everyone, but the final bill depends on how much you take. Forex is the same: the price of the pair is the same for everyone, and your bill depends on the size of your position. Whoever does not weigh things up pays for more than they meant to.

This is the dullest chapter in the book. It is also the one that protects you the most.

## The pip

A **pip** is the unit used to measure movement. On most pairs it is the fourth decimal place:

- EUR/USD goes from 1.0850 to 1.0851: it has risen **1 pip**.
- On pairs with the yen, it is the second decimal place: USD/JPY from 151.40 to 151.41 is 1 pip.
- MetaTrader 5 shows one more digit (1.08502). That last digit is a tenth of a pip, called a "pipette".

With gold, the convention varies from broker to broker. Before you trade XAU/USD, check the contract specification for how much each move is worth.

## The lot

A **lot** is the size of the position.

| Name | Lots in MT5 | Units of the base currency |
|---|---|---|
| Standard | 1.00 | 100,000 |
| Mini | 0.10 | 10,000 |
| Micro | 0.01 | 1,000 |

And here is the link that matters: the value of each pip depends on the lot size.

[[grafico:valor-pip]]

On an account in dollars, on EUR/USD, 1 pip is worth about $10 with 1 lot, $1 with 0.10 and $0.10 with 0.01. If the price moves 30 pips against you, the difference between a micro lot and a standard lot is the difference between losing $3 and losing $300. The chart is the same. Your life is not.

:::alerta Classic mistake · Choosing the lot size by eye
Someone starts, opens MetaTrader 5, sees the "Volume" field and types a number that "looks small". 0.50, because it is less than one. But 0.50 lots on EUR/USD is about $5 per pip, and a normal 40-pip move against you is $200. You do not choose the volume by eye. You calculate it, and you will learn how in chapter 6.
:::

## The spread and the swap: the costs that do not appear on the bill

Every trade starts in the red. When you buy, you buy at the higher price (ask). When you close, you sell at the lower price (bid). That difference, the spread, is your entry cost.

With a 1-pip spread and 0.10 lots on EUR/USD, each trade costs about $1. That sounds like nothing. Now multiply it.

[[grafico:custo-spread]]

Someone who makes 200 trades a month is paying $200 just to get in, before knowing whether they have won or lost. That is why the cold method is slow on purpose: fewer trades, each one more carefully chosen.

The **swap** is the interest you pay (or, sometimes, receive) for holding a position open overnight. On Wednesdays, at many brokers, it is charged triple to cover the weekend. You can see the value in the symbol specification in MT5.

:::ecra MetaTrader 5 · Specification · EUR/USD
Contract size: 100,000
Minimum volume: 0.01
Volume step: 0.01
Buy swap: −6.8 points
Sell swap: +1.2 points
Triple swap: Wednesday
:::

Illustrative values. Open the specification for your own symbol and write down your own.

## Leverage and margin: the magnifying glass

**Leverage** lets you control a position bigger than the money you have in your account. With 30:1 leverage, to open €30,000 of exposure you need €1,000 of **margin**, which is the deposit the broker sets aside from your account.

Leverage does not change the direction of the market. It changes the size of the impact. It is a magnifying glass: it increases the gain and increases the loss by the same amount.

In the European Union, for retail clients, ESMA caps leverage: up to 30:1 on major currency pairs, 20:1 on other currency pairs, gold and major indices, and lower still on other assets. Brokers regulated in the EU must also make sure you cannot lose more than your account balance (negative balance protection).

:::destaque
The leverage your broker offers is the maximum allowed, not a recommendation. Your risk is decided by the lot size and the stop, never by how much leverage is available.
:::

When your open loss eats into the margin to a certain level, the broker warns you (a margin call) and then starts closing positions by itself (a stop out). This is not a punishment. It is the magnifying glass doing its job.

[[grafico:recuperacao-perdas]]

This chart explains why protection is worth more than attack. After you lose half your account, you need to double what is left just to get back to where you started. Nobody remembers this on the trade where they overdo the lot size.

## The cold rule for this chapter

:::cartao Cold rule no. 2
Before every trade I know three numbers: what 1 pip is worth at my lot size, how much spread I pay, and how much I lose if the stop is hit. If I do not know them, I do not enter.
:::

## In short

- A pip is the fourth decimal place on most pairs; on pairs with the yen, the second.
- The value of a pip depends on the lot size: about $10, $1 or $0.10 on EUR/USD, on an account in dollars.
- You pay the spread on every trade; if you trade a lot, you pay a lot.
- You pay the swap for every night a position stays open.
- Leverage is a magnifying glass. Risk is controlled with lot size and stop.

:::exercicio For today
1. In MT5 on a demo account, open the specification for your pair (right-click the symbol, then "Specification").
2. Copy into your notebook: contract size, minimum volume, buy and sell swap, the day of the triple swap.
3. Do the sum: with 0.01 lots, how much do you lose if the price moves 25 pips against you? ____________
4. And with 0.10? ____________ And with 1.00? ____________
5. Look at the three answers and write down which one would let you sleep. ____________
:::
