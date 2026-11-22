# The cold order

> The click is the easy part. The hard part is everything you decide before it.

There is a moment when your thumb hovers over the "Buy" button and your heart speeds up. If at that moment you are still deciding where the stop goes, you have already lost control of the trade. A cold order is one where, by the time your thumb reaches the button, everything is already written down: entry, stop, target and lot size. The click is just the signature.

Look at the road you have covered so far. You set up the workbench (chapter 1), learned to read Quotes (2), know what a pip is worth at your volume (3), drew the map on the chart (4) and worked out the lot from your risk (5). This chapter brings it all together on one screen: the order window.

## Order types in MT5

| Type | What it does | When to use it |
|---|---|---|
| **Market execution** | Buys or sells straight away, at the current price | When the price is in your zone and the plan says "enter" |
| **Buy Limit** | Buys if the price **falls** to your level | Waiting for a pullback to buy cheaper |
| **Sell Limit** | Sells if the price **rises** to your level | Waiting for a rise to sell higher |
| **Buy Stop** | Buys if the price **rises** above your level | Entering when the price breaks a resistance |
| **Sell Stop** | Sells if the price **falls** below your level | Entering when the price breaks a support |

[[grafico:limit-stop]]

Pending orders (limit and stop) have a huge advantage for anyone who works: you leave the order in the right place and get on with your life. The price comes to you or it does not, and both outcomes are fine.

[[grafico:fluxo-operacao]]

## The stop-loss and the take-profit

The **stop-loss (SL)** is the price at which the trade closes by itself if it goes wrong. The **take-profit (TP)** is the price at which it closes by itself if it goes right.

- The stop goes where your idea **stops making sense**. If you buy because the price is sitting on a support, the stop goes below that support, not "20 pips because I said so".
- The target goes where there is a reason for the price to stop: the next resistance, the next zone.
- Both are set **before** you enter.

:::alerta Classic mistake · Entering without a stop "just for a moment"
"I'll open it now and put the stop in afterwards." Afterwards never arrives in time. The price moves 30 pips against you in one minute of news, and now setting the stop means accepting a loss you had not planned for. So you do not set it. You wait. This is how a trade with €10 of risk turns into one with €200. No order goes in without a stop. Not one.
:::

## On the screen: the pending order, step by step

This is the screen that matters most in the whole book. Notice that the app lets you fill in everything **before** you press the button.

:::galeria From order type to button
mt5-tel-ordem-mercado.png | 1. Choose the type (here, Sell Limit), the volume in lots and the price.
mt5-tel-grafico-sltp.png | 2. Turn on S/L: the line appears on the chart with the loss in money.
:::

:::galeria Confirm without rushing
mt5-tel-ordem.png | 3. Check volume, price and S/L. Only then tap "Place".
mt5-tel-ordem-executada.png | 4. "Done": the order number, the price and the stop.
:::

1. In **Quotes**, tap the pair and choose **New order**.
2. At the top, choose the type: **Market execution**, **Buy Limit**, **Sell Limit**, **Buy Stop** or **Sell Stop** (chapter 4 explains when to use each).
3. Under **Volume**, type the lot you calculated in chapter 5. Not the one that "looks right".
4. Under **Price**, type the price from your plan.
5. Turn on **S/L** and **T/P** and type the prices. Below the field you have three ways to see them: **Price**, **Pips** and **USD** (or your account currency). Use the money view to confirm you lose exactly your risk if the stop is hit.
6. Read everything again and tap **Place**.
7. Wait for **Done**. Go to **Trade** and check that the order is there with its stop.
8. Take a screenshot. It goes into the "Journal" folder.

:::nota The screen that protects you
In step 2 the app shows the loss in money before you confirm. If that number makes you swallow hard, the lot is too big. Go back to chapter 5.
:::

In your case, the cold order looks like this: type Buy Limit, volume 0.02, price 1.08200, S/L 1.07950, T/P 1.08700. That is 25 pips of risk for 50 pips of target, a risk-to-reward ratio of 1:2 (illustrative example).

On the computer it is the same: **F9** (or the **New Order** button) opens the same window, with the same fields, and none of them is left blank. On the PC you have an advantage: you can drag the S/L and T/P lines directly on the chart.

[[foto: mt5-desktop-ordem.jpg | MetaTrader 5 on the computer: the "New Order" window with Stop Loss and Take Profit, and the history below. Image: MetaQuotes (metatrader5.com). | larga]]

## The mistakes on the screen that cost money

:::alerta Classic mistake · The comma in the lot
You meant 0.10 and typed 1.0. On a phone this happens with one clumsy finger. Before you place it, read the volume out loud.
:::

:::alerta Classic mistake · Swapping Limit for Stop
Buy Limit buys **cheaper** than the current price. Buy Stop buys **higher**. Swap them and you enter exactly in the wrong place. Come back to the chart in this chapter whenever you hesitate.
:::

:::alerta Classic mistake · Stop in pips when you meant price
The S/L field changes depending on whether you choose Price, Pips or USD. Check the tab before you type the number.
:::

:::historia Marta, day 12
Her first real order, still on the demo. A Buy Limit on EURUSD, in a zone she had drawn on Sunday. Marta typed the volume, the price, the stop and the target, and was about to tap "Place" when she remembered to read out loud. "Volume: one point zero." She had typed 1.0 instead of 0.02. In the USD view, the stop would have cost $250, half the account. She corrected it, read it again and placed it. Then she went to Trade to see the order sitting there, waiting. She felt no adrenaline at all. She felt that she had done the work.
:::

## After "Done": the Trade tab

A placed order is not a forgotten order. The third button in the bottom bar, **Trade**, shows you everything that is alive in the account.

[[foto: mt5-android-negociacao.jpg | The trade tab and history in MetaTrader 5 for Android and tablet. This is where you see balance, equity and margin. Image: MetaQuotes (metatrader5.com). | larga]]

- At the top: **balance**, **equity**, **margin** and **free margin**.
- Below: the open **positions**, with the result moving, and the **pending orders** waiting.
- To **modify** or **close**, hold your finger on the position or order and choose the option. On the PC, double-click or right-click.

**Balance** is the money without counting open positions. **Equity** is the balance plus or minus what the open positions are winning or losing. On a €500 demo with nothing open, both show 500.00 € (illustrative). When you have an open trade, always look at equity: that is the real number.

:::alerta Classic mistake · Moving the stop away as the price approaches
The price is two pips from your stop and you modify the position to drag the S/L further away, "to give it room". You have just changed the plan halfway through, with your heart, and increased the risk you had accepted. A stop only moves in one direction: in favour of the trade, to protect it. Never away from it.
:::

## From my life: nobody jumps without checking

Before every jump with the paratroopers there was an equipment check, always in the same order, done by you and by the comrade next to you. Nobody skipped it because they "already knew". In the Marines (Fuzileiros) it was the same with the kit, the weapons and the boat. The check does not exist for the careless. It exists because the moment of action is the worst moment to think.

An order in the market is a short jump. It has equipment (volume, stop, target), a door (the button) and a light (your plan). The checklist that follows is my check before I jump. I do it every time, even when it seems "obvious".

## A checklist before you click

Stick this near your screen. If any answer is "no", the order does not go in.

:::cartao Cold order checklist
- Are the pair and the time in my plan?
- Is there major news in the next 30 minutes?
- Do I know why I am entering, in one sentence?
- Is the stop where the idea stops making sense?
- Did the lot come out of the account risk, and does the money view confirm it?
- Is the risk-to-reward ratio at least 1:1.5?
- Am I calm? (from 1 to 5, at least 3)
:::

:::conversa Phone notes · eu
eu: Urge to enter GBP/USD right now. It rose 60 pips in an hour.
eu: Checklist: it is not in the plan. I don't know where to put the stop. Calm: 2 out of 5.
eu: I do not enter. I noted it in the journal as "urge, not plan".
:::

This is the kind of note that is worth more than any winning trade. You learn to recognise the urge before it costs you money.

## Quick map: where everything is

Now that you have used every screen, keep this map. It is a cheat sheet until your fingers know the way by themselves.

| I want to… | On the phone | On the PC |
|---|---|---|
| See prices | Quotes | Market Watch (Ctrl+M) |
| Add a pair | Quotes › + | Market Watch › right-click › Symbols |
| Open an order | Quotes › pair › New order | F9 |
| Change the chart timeframe | Chart › hold finger › timeframe | Timeframe bar, at the top |
| Add an indicator | Chart › *f* | Insert › Indicators |
| Draw a zone or Fibonacci | Chart › objects | Insert › Objects |
| See positions and margin | Trade | Toolbox › Trade |
| See what has closed | History | Toolbox › History |
| Economic calendar | Settings › Tradays | Toolbox › Calendar |
| Price alerts | Arrive as push notifications, created on the PC (chapter 7) | Toolbox › Alerts |

## The cold rule of this chapter

:::cartao Cold rule no. 6
No order goes in without a stop. The stop never moves away. The checklist is always done, even when it "is obvious". I read the volume out loud before I place it.
:::

## In short

- There are market and pending orders (limit and stop); pending orders let you get on with your life.
- Limit: the price comes back to you. Stop: the price breaks through and carries on.
- The stop goes where the idea stops making sense; the target, where there is a reason for the price to stop.
- In the order window, everything is filled in before "Place", with the money view confirming the risk.
- After "Done", you confirm in Trade. The stop only moves in your favour.
- The seven-question checklist decides whether the order goes in or not.

:::exercicio For today
1. On the demo, place three pending orders on your pair: a Buy Limit, a Sell Limit and a Buy Stop, all with SL and TP.
2. For each one, confirm in the money view that the stop costs your 1% risk.
3. Go to Trade and check that all three show with the right levels.
4. Modify one of them (change the target) and then cancel all three. The aim was only to train your fingers.
5. Write in your notebook the sentence you will use to justify each entry from now on: "I enter because ____________".
:::
