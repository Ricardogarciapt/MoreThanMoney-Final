# The right size

> The entry decides whether you are right. The size decides whether you are still around for the next one.

Two people open exactly the same trade, on the same pair, at the same price, with the same stop. The price hits the stop. One loses €10 and shrugs. The other loses €250 and spends the night staring at the ceiling. The only difference between them was a number typed into the "Volume" field.

Position size is the most important decision and the most forgotten one. Everyone wants to talk about entries. Almost nobody wants to talk about lot sizes.

## Risk starts with money, not lots

The right question is not "how many lots should I open?". It is "how much money am I willing to lose if this trade goes wrong?". The house rule is never to risk more than **1% of the account** per trade. On a €500 account, that is €5.

That may sound like very little. That is deliberate. At 1%, ten losses in a row (and they will happen) take about 10% off your account. At 10%, they take two thirds.

[[grafico:risco-sequencias]]

## The formula

**Lot = Money at risk ÷ (Stop distance in pips × Pip value per lot)**

Illustrative example, with the account in dollars to keep it simple, on EUR/USD:

| Step | Calculation | Result |
|---|---|---|
| 1. Account | | $500 |
| 2. Risk (1%) | 1% of $500 | $5 |
| 3. Stop | from entry to the planned stop | 25 pips |
| 4. Pip value per lot | EUR/USD, account in USD | $10 |
| 5. Lot | $5 ÷ (25 × $10) | 0.02 |

Proof: 25 pips × 0.02 lots × $10 = $5. It matches the risk.

Notice what this means: **the stop decides the lot, not the other way round**. If your idea needs a 50-pip stop, the lot halves (0.01). If the stop is 12 pips, the lot goes up. The money at risk always stays the same.

:::alerta Classic mistake · Tightening the stop to fit a bigger lot
You want to open 0.10 lots because "that makes it worth it". For the risk not to exceed $5, the stop would have to sit 5 pips from your entry, inside the normal noise of the market. Any random candle hits the stop, and the idea, which may well have been right, never had room to work. The lot adjusts to the stop. The stop never adjusts to the lot.
:::

:::alerta Classic mistake · Increasing the lot to win it back
You have lost three in a row and the fourth is going to be "double, to get it all back". It is the most expensive sentence in Forex. The fourth trade does not know you lost the other three, and the chance of it going wrong is exactly the same. The difference is that this time it will hurt twice as much. After losses, the lot stays the same or goes down. It never goes up.
:::

## The calculator (and the proof by hand)

There are free position-size calculators online, and some brokers show the risk on the order screen itself. Use them. But do the proof by hand for your first 20 trades, until you can work it out in your head.

:::ecra Position calculator (illustrative example)
Account: $500
Risk: 1% = $5
Pair: EUR/USD
Stop: 25 pips
Pip value (1 lot): $10
Lot: 0.02
:::

Two honest notes:

- With an account in **euros**, the value of a pip changes with the day's exchange rate. Confirm it in MT5 or with your broker.
- With **gold** and indices, the contract size and the value of each move differ from broker to broker. Read the specification before you apply the formula.

## And when the account is small?

With €200 and 1% risk, you risk €2 per trade. With the minimum lot of 0.01 (about $0.10 per pip on EUR/USD), that gives you a stop of around 20 pips. If your idea needs more than that, there is no smaller lot to drop to. You have two honest options: wait for an entry with a shorter stop, or do not enter. "Risking 5% just this once" is not an option. It is the start of the problem.

## The cold rule for this chapter

:::cartao Cold rule no. 6
1% per trade. The stop decides the lot. After a loss, the lot does not go up. I do the sum on the account before I click.
:::

## In short

- Risk is decided in money: 1% of the account per trade.
- Lot = risk ÷ (stop pips × pip value).
- The stop comes from the chart; the lot comes from the account.
- Never tighten the stop to fit a bigger lot, and never increase the lot to win it back.
- With a small account, the honest answer is often to wait.

:::exercicio Work out three positions
1. Account: ______ · risk 1%: ______
2. Trade A, 20-pip stop. Lot: ______ · proof: ______
3. Trade B, 40-pip stop. Lot: ______ · proof: ______
4. Trade C, 60-pip stop. Lot: ______ · proof: ______
5. Is the lot for C bigger or smaller than for A? Why? ____________
:::
