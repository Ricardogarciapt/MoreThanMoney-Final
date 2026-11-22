# The cold order

> The click is the easy part. The hard part is everything you decide before it.

There is a moment when your thumb hovers over the "Buy" button and your heart speeds up. If at that moment you are still deciding where the stop goes, you have already lost control of the trade. A cold order is one where, by the time your thumb reaches the button, everything is already written down: entry, stop, target and lot size. The click is just the signature.

## Order types in MT5

| Type | What it does | When to use it |
|---|---|---|
| **Market execution** | Buys or sells straight away, at the current price | When the price is in your zone and the plan says "enter" |
| **Buy Limit** | Buys if the price **falls** to your level | Waiting for a pullback to buy cheaper |
| **Sell Limit** | Sells if the price **rises** to your level | Waiting for a rise to sell higher |
| **Buy Stop** | Buys if the price **rises** above your level | Entering when the price breaks a resistance |
| **Sell Stop** | Sells if the price **falls** below your level | Entering when the price breaks a support |

Pending orders (limit and stop) have a huge advantage for anyone with a job: you leave the order in the right place and get on with your life. The price comes to you or it does not, and both outcomes are fine.

[[grafico:fluxo-operacao]]

## The stop-loss and the take-profit

The **stop-loss (SL)** is the price at which the trade closes by itself if it goes wrong. The **take-profit (TP)** is the price at which it closes by itself if it goes right.

- The stop goes where your idea **stops making sense**. If you buy because the price is sitting on a support, the stop goes below that support, not "20 pips because I said so".
- The target goes where there is a reason for the price to stop: the next resistance, the next zone.
- Both are set **before** you enter.

:::alerta Classic mistake · Entering without a stop "just for a moment"
"I'll open it now and put the stop in afterwards." Afterwards never arrives in time. The price moves 30 pips against you in a minute of news, and now setting the stop means accepting a loss you had not planned for. So you do not set it. You wait. This is how a trade with €10 of risk turns into one with €200. No order goes in without a stop. Not one.
:::

:::alerta Classic mistake · Moving the stop away as the price approaches
The price is two pips from your stop and you drag the line further away "to give it room". You have just changed the plan halfway through, with your heart, and increased the risk you had agreed to accept. A stop only moves in one direction: in favour of the trade, to protect it. Never away from it.
:::

## Step by step: placing an order on the phone

1. In **Market Watch**, tap the pair and choose **New order**.
2. For type, choose **Market execution** or the pending order type from your plan.
3. Under **Volume**, enter the lot size you calculated (chapter 6). Not the number that "looks good".
4. Fill in **S/L** and **T/P** with the prices from your plan.
5. Confirm the summary. Only then press buy or sell.
6. Go to **Trade** and check that the position shows with SL and TP filled in.
7. Take a screenshot. Into the journal it goes.

[[foto: mt5-ios-ordem.jpg | The order window in MetaTrader 5 for iPhone: volume, Stop Loss and Take Profit filled in before you tap "Sell" or "Buy". Image: MetaQuotes (metatrader5.com). | larga]]

:::galeria A pending order, from start to finish
mt5-video-ordem-mercado.png | 1. Order type, volume and price.
mt5-video-grafico-sltp.png | 2. The stop shows on the chart, with the loss in money.
mt5-video-ordem.png | 3. Volume, price and S/L filled in before confirming.
mt5-video-ordem-executada.png | 4. "Done": the order went in with its stop.
:::


In your case, the cold order looks like this: type Buy Limit, volume 0.02, price 1.08200, S/L 1.07950, T/P 1.08700. That is 25 pips of risk for 50 pips of target (illustrative example).

In other words, a risk-to-reward ratio of 1:2.

On the computer it is the same: the "New order" window has the same fields, and none of them is left blank.

[[foto: mt5-desktop-ordem.jpg | MetaTrader 5 on the computer: "New order" window with Stop Loss and Take Profit, and the history below. Image: MetaQuotes (metatrader5.com). | larga]]

## A checklist before you click

Stick this near your screen. If any answer is "no", the order does not go in.

:::cartao Cold order checklist
- Are the pair and the time in my plan?
- Is there major news in the next 30 minutes?
- Do I know why I am entering, in one sentence?
- Is the stop where the idea stops making sense?
- Did the lot size come out of the risk on my account?
- Is the risk-to-reward ratio at least 1:1.5?
- Am I calm? (from 1 to 5, at least 3)
:::

:::conversa Phone notes · eu
eu: Urge to enter GBP/USD right now. It rose 60 pips in an hour.
eu: Checklist: it is not in the plan. I don't know where to put the stop. Calm: 2 out of 5.
eu: I do not enter. I noted it in the journal as "urge, not plan".
:::

This is the kind of note that is worth more than any winning trade. You learn to recognise the urge before it costs you money.

## The cold rule for this chapter

:::cartao Cold rule no. 4
No order goes in without a stop. The stop never moves away. The checklist is always done, even when it "is obvious".
:::

## In short

- There are market and pending orders (limit and stop); pending orders let you get on with your life.
- The stop goes where the idea stops making sense; the target, where there is a reason for the price to stop.
- Stop and target are set before you enter, on the order screen.
- The seven-question checklist decides whether the order goes in or not.

:::exercicio For today
1. On the demo, place three pending orders on your pair: a Buy Limit, a Sell Limit and a Buy Stop, all with SL and TP.
2. Check on the "Trade" tab that all three show with the right levels.
3. Cancel them. The point was only to train your fingers.
4. Write in your notebook the sentence you will use to justify each entry from now on: "I enter because ____________".
:::
