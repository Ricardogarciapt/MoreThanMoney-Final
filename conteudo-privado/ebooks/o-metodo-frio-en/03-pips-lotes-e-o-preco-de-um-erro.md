# Pips, lots and the price of a mistake

> Nobody loses their account because they do not know what a pip is. They lose it because they know, and do not do the sum.

Think of the butcher's. You ask for "a bit of meat" and the butcher weighs it. The price per kilo is the same for everyone, but the final bill depends on how much you take. Forex is the same: the price of the pair is the same for everyone, and your bill depends on the size of the position. Whoever does not weigh things pays for what they did not want.

This is the dullest chapter in the book. It is also the one that protects you most.

## The pip

The **pip** is the unit that measures movement. On most pairs it is the fourth decimal place:

- EUR/USD goes from 1.0850 to 1.0851: it rose **1 pip**.
- On pairs with the yen, it is the second decimal place: USD/JPY from 151.40 to 151.41 is 1 pip.
- MetaTrader 5 shows one more digit (1.08502). That last digit is a tenth of a pip, called a "pipette".

Notice a detail on the screen: in Quotes, MT5 shows the spread in **points**, not in pips. On pairs with five decimal places, 10 points make 1 pip. If you see "8" next to the time, the spread is 0.8 pips.

For gold, the convention varies from broker to broker. Before you trade XAU/USD, check the contract specification to see how much each move is worth.

## The lot

The **lot** is the size of the position.

| Name | Lots in MT5 | Units of the base currency |
|---|---|---|
| Standard | 1.00 | 100,000 |
| Mini | 0.10 | 10,000 |
| Micro | 0.01 | 1,000 |

And here is the connection that matters: the value of each pip depends on the lot.

[[grafico:valor-pip]]

In a dollar account, on EUR/USD, 1 pip is worth about $10 with 1 lot, $1 with 0.10 and $0.10 with 0.01. If the price moves 30 pips against you, the difference between a micro lot and a standard lot is the difference between losing $3 and losing $300. The chart is the same. Your life is not.

## On the screen: the "Volume" field

In MT5 the lot is called **Volume** and appears in the order window, just below the order type. You are not going to open any order yet (that comes in chapter 6), but it is worth seeing now where the number that moves the most money in your account lives.

:::galeria The lot selector
mt5-tel-ordem-lotes.png | Tapping the volume opens a selector with buttons from −0.10 to +0.10 and the big number in the centre. That number decides how much each pip is worth.
:::

:::alerta Classic mistake · Choosing the lot by eye
Those starting out open MetaTrader 5, see the "Volume" field and type a number that "looks small". 0.50, because it is less than one. But 0.50 lots on EUR/USD is about $5 per pip, and a normal 40-pip move against you is $200. Volume is not chosen by eye. It is calculated, and you will learn how in chapter 5.
:::

:::historia Marta, day 4
Curious, Marta opened the order window and tapped the volume. The selector said 0.01 and she pressed +0.10 three times: 0.31. "That's still less than half a lot." Before closing it, she did this chapter's sum on paper: 0.31 lots on EUR/USD is about $3.10 per pip. With a 25-pip stop she would lose about $78 on a single trade, nearly 15% of the demo. She closed the window without placing anything and wrote in her notebook: "Volume is not an opinion."
:::

## Spread and swap: the costs that do not appear on the bill

Every trade starts in the red. When you buy, you buy at the higher price (ask). When you close, you sell at the lower price (bid). That difference, the spread, is the cost of entry.

With a 1-pip spread and 0.10 lots on EUR/USD, each trade costs about $1. That seems like nothing. Now multiply it.

[[grafico:custo-spread]]

Someone who makes 200 trades a month is paying $200 just to get in, before knowing whether they won or lost. That is why the cold method is slow on purpose: fewer trades, more carefully chosen.

The **swap** is the interest you pay (or, sometimes, receive) for holding a position open from one day to the next. On Wednesdays, many brokers charge triple because of the weekend. You can see the figure in the symbol's specification in MT5: on the phone, in **Quotes**, tap the pair and choose **Specification**; on the PC, right-click the symbol and choose **Specification**.

:::ecra MetaTrader 5 · Specification · EUR/USD
Contract size: 100,000
Minimum volume: 0.01
Volume step: 0.01
Buy swap: −6.8 points
Sell swap: +1.2 points
Triple swap: Wednesday
:::

Illustrative values. Open the specification for your own symbol and write down yours.

## Leverage and margin: the magnifying glass

**Leverage** lets you control a position bigger than the money you have in your account. With 30:1 leverage, to open €30,000 of exposure you need €1,000 of **margin**, the deposit the broker sets aside from your account.

Leverage does not change the direction of the market. It changes the size of the impact. It is a magnifying glass: it increases gains and losses by the same amount.

In the European Union, for retail clients, ESMA limits leverage: up to 30:1 on major pairs, 20:1 on other pairs, gold and major indices, and less again on other assets. EU-regulated brokers must also make sure you cannot lose more than the balance in your account (negative balance protection).

:::destaque
The leverage your broker offers is the maximum allowed, not a recommendation. Your risk is decided by the lot and the stop, never by the leverage available.
:::

When the open loss eats into the margin up to a certain level, the broker warns you (margin call) and then starts closing positions on its own (stop out). It is not a punishment. It is the magnifying glass doing its job.

[[grafico:recuperacao-perdas]]

This chart explains why protection is worth more than attack. After you lose half of your account, you need to double what is left just to get back to the start. Nobody remembers this when they overdo the lot size on a trade.

## The cold rule of this chapter

:::cartao Cold rule no. 3
Before each trade I know three numbers: how much 1 pip is worth at my lot, how much spread I pay and how much I lose if the stop is hit. If I do not know them, I do not enter.
:::

## In short

- 1 pip is the fourth decimal place on most pairs; on pairs with the yen, the second.
- The value of a pip depends on the lot: about $10, $1 or $0.10 on EUR/USD, in a dollar account.
- The spread is paid on every trade; whoever trades a lot, pays a lot.
- The swap is paid for every night a position stays open.
- Leverage is a magnifying glass. Risk is controlled with the lot and the stop.
- On screen: spread in points (10 points = 1 pip) and the lot in the "Volume" field.

:::exercicio For today
1. On the demo, open the specification for your pair (phone: Quotes › pair › Specification; PC: right-click › Specification).
2. Copy into your notebook: contract size, minimum volume, buy and sell swap, the day of the triple swap.
3. Do the sum: with 0.01 lots, how much do you lose if the price moves 25 pips against you? ____________
4. And with 0.10? ____________ And with 1.00? ____________
5. Look at the three answers and write which one would let you sleep. ____________
:::
