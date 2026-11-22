# The right size

> The entry decides whether you are right. The size decides whether you are still here for the next one.

Two people open exactly the same trade, on the same pair, at the same price, with the same stop. The price hits the stop. One loses €10 and shrugs. The other loses €250 and spends the night staring at the ceiling. The only difference between them was a number typed into the "Volume" field.

Position size is the most important decision and the most forgotten. Everyone wants to talk about entries. Almost nobody wants to talk about lots.

## Risk starts in money, not in lots

The right question is not "how many lots do I open?". It is "how much money am I willing to lose if this trade goes wrong?". The house rule is not to risk more than **1% of the account** per trade. On a €500 account, that is €5.

That may seem small. It is on purpose. With 1%, ten losses in a row (and they will happen) take about 10% off your account. With 10%, they take two-thirds of it.

[[grafico:risco-sequencias]]

## The formula

**Lot = Cash risk ÷ (Stop distance in pips × Pip value per lot)**

Illustrative example, in a dollar account to keep it simple, on EUR/USD:

| Step | Calculation | Result |
|---|---|---|
| 1. Account | | $500 |
| 2. Risk (1%) | 1% of $500 | $5 |
| 3. Stop | from entry to the planned stop | 25 pips |
| 4. Pip value per lot | EUR/USD, account in USD | $10 |
| 5. Lot | 5 ÷ (25 × 10) | 0.02 |

Proof: 25 pips × 0.02 lots × $10 = $5. It matches the risk.

Notice what this means: **the stop decides the lot, not the other way round.** If your idea needs a 50-pip stop, the lot halves (0.01). If the stop is 12 pips, the lot goes up. The cash risk always stays the same.

:::alerta Classic mistake · Tightening the stop to fit a bigger lot
You want to open 0.10 lots because "then it's worth it". For the risk not to exceed $5, the stop would have to sit 5 pips from your entry, inside the normal noise of the market. Any candle will hit the stop, and the idea, which might even have been right, never had room to work. The lot adjusts to the stop. The stop never adjusts to the lot.
:::

:::alerta Classic mistake · Increasing the lot to win it back
You have lost three in a row and the fourth will be "double, to win everything back". It is the most expensive sentence in Forex. The fourth trade does not know you lost the other three, and the probability that it goes wrong is exactly the same. The difference is that now it will hurt twice as much. After losses, the lot stays the same or goes down. It never goes up.
:::

## The calculator (and the proof by hand)

There are free position size calculators online, and some brokers show the risk on the order screen itself. Use them. But do the proof by hand for your first 20 trades, until the sum comes out in your head.

:::ecra Position calculator (illustrative example)
Account: $500
Risk: 1% = $5
Pair: EUR/USD
Stop: 25 pips
Pip value (1 lot): $10
Lot: 0.02
:::

There is also a check that MetaTrader does for you. In the order window, below the S/L field, you can see the stop in **Price**, in **Pips** or in **USD** (or in your account currency). Choose the money view: if the number shown is not your 1% risk, the lot is wrong. In the next chapter you will see that screen step by step.

Two honest notes:

- With a **euro** account, the pip value changes with the day's exchange rate. Confirm it in MT5 or with the broker.
- On **gold** and indices, the contract size and the value of each move differ from broker to broker. Read the specification before you apply the formula.

:::historia Marta, day 8
Marta wanted to open 0.10 lots, "to make it worth it". With a €500 demo and 1% risk, she could only lose €5. To fit 0.10, the stop would have to sit 5 pips from the entry, inside the noise she had seen on M1. She did the sum the other way round: the H4 zone called for a 25-pip stop, so the lot was 0.02. She wrote both numbers in her notebook, side by side. "The stop comes from the chart. The lot comes from the account." For the first time, the small number looked like the right one.
:::

## And when the account is small?

With €200 and 1% risk, you risk €2 per trade. With the minimum lot of 0.01 (about $0.10 per pip on EUR/USD), that gives a stop of around 20 pips. If your idea needs more, there is no smaller lot to drop to. You have two honest ways out: wait for an entry with a shorter stop, or do not enter. "Risking 5% just this once" is not a way out. It is the start of the problem.

## From my life: €1,037 a month

I joined the GNR (Portuguese National Guard) in 2010 and stayed for fourteen years. At the end, my take-home pay was €1,037 a month, with a wife, a small daughter and three hours of train a day to get to and from the Lisbon Territorial Command.

With €1,037 you learn risk management by force. Every euro has a destination before it arrives: rent, food, transport, school. There is no margin for "I'll risk a little more this month". When I started trading, I brought that account with me. It was that account that saved me from doing what I see so many people doing: opening a trade with the money for the mortgage payment.

The formula in this chapter is the same sum I did with my salary. First you decide how much you can lose without your life changing. Only then do you find out how much you can buy.

## The cold rule of this chapter

:::cartao Cold rule no. 5
1% per trade. The stop decides the lot. After a loss, the lot does not go up. I do the account check before I click.
:::

## In short

- Risk is decided in money: 1% of the account per trade.
- Lot = risk ÷ (stop pips × pip value).
- The stop comes from the chart; the lot comes from the account.
- Never tighten the stop to fit a bigger lot; never increase the lot to win it back.
- With a small account, the honest answer is often to wait.

:::exercicio Calculate three positions
1. Account: ______ · risk 1%: ______
2. Trade A, 20-pip stop. Lot: ______ · proof: ______
3. Trade B, 40-pip stop. Lot: ______ · proof: ______
4. Trade C, 60-pip stop. Lot: ______ · proof: ______
5. Is the lot for C bigger or smaller than for A? Why? ____________
:::
