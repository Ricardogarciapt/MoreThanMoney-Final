# The WebTrader and the house tools

> The MetaTrader taught you the door. Now I'll show you the house we built for people who are learning.

Until now you have used MetaTrader 5, and you were right to. It's the platform almost every broker offers, and you'll find it everywhere. But over these years of teaching, I have always seen the same slip-ups: the lot size worked out in your head, the forgotten stop, the journal in a separate notebook, the history nobody reviews, position management done by hand with your heart pounding.

That's why MoreThanMoney built its own **WebTrader**. It opens in the browser and on your phone, with nothing to install. It serves the same platform for three types of account: a **demo account** for training, the simulated **MTM Funded** accounts with rules, and **your broker accounts** (TradeLocker and MetaTrader) connected to the same screen. The cold rules on lot size, mandatory stops, the journal and the review stop being discipline you have to remember and become part of the tool itself.

To me, this is where the future of learning is: the student learns, trains and trades in the same place where the teacher can see what they did, with the same numbers.

## From my life: where I learned, and why I did it differently

When I decided to learn trading, in the middle of the 2021 crisis, I paid an education platform an expensive subscription. I won't say the name. I learned useful things there, and the discipline I brought from military life did the rest. But I remember well what it cost at the end of the month for someone earning €1,037. And I remember thinking that half the people who needed that were never going to be able to pay for it.

About six months later I left my "dream job". Today I am free, I am with my family, I have investments (and mistakes too, which are all in this book), and I don't work for anyone. When I founded MoreThanMoney, I promised myself two things: that nobody would have to pay the price of learning alone, and that the price of entry would not be what they charged me.

[[foto: rg-mentoria.jpg | A conversation at the table is worth more than a hundred videos watched alone at two in the morning. | lado]]

## Why MTM costs less

It isn't charity, it's design. There are three reasons, and all of them can be checked:

1. **We built the tools in-house.** The WebTrader, the scanners, the simulated accounts and strategy copying are ours. We don't pay third parties for each student, so we don't have to pass that cost on to you.
2. **The broker pays part of the bill.** Anyone who opens an account with a partner broker and validates it can have access to Premium without paying the monthly fee while the account stays active. Plans and conditions are always up to date at morethanmoney.pt.
3. **We don't make you feel poor to sell to you.** No recruitment schemes, no paying to move up a level, no profit screenshots to push you. The model is simple: tools, lessons and community at a price that fits a Portuguese salary.

## Why I don't believe you can learn trading from free YouTube alone

We also have free videos on YouTube, and you'll see the links shortly. They explain how each tool works. What I don't believe is that you can learn **trading** from free videos alone. For four reasons:

- **Free video is paid for with your attention.** The algorithm rewards whatever keeps you glued to the screen: the spectacular profit, the promise, the rush. It rarely rewards the boring video about lot size, which is what saves your account.
- **There is no order.** You jump from one strategy to another and never give 40 trades in a row to the same plan.
- **Nobody sees your mistakes.** A video can't tell you that you put the stop in the wrong place. A person and a shared history can.
- **Nobody answers for it.** Whoever doesn't gain anything from you also doesn't lose anything if things go wrong for you.

Free is great for having a look. To change your life, you need method, tools and someone who sees you work.

## Logging in to WebTrader

Open **morethanmoney.pt/webtrader** on your computer or phone. Log in with your MTM account (email, Google or PrimeVerse). If you only have the details for a simulated account, there is a third way in: **Log in with account credentials only**, with the login, the password and the "MTM Funded" server, just like in MetaTrader.

[[foto: wt-entrar.png | The WebTrader login screen: MTM account, Google, PrimeVerse or just the account credentials. | larga]]

At the top, the **account selector** shows all your accounts in one place: the demo, the MTM Funded accounts and the broker accounts you connected (TradeLocker or MetaTrader). You switch accounts without leaving the screen. For this chapter I used a demo account with $1,000, the size of a realistic first account.

:::nota
On your phone, the "Add to Home Screen" button installs WebTrader as an app. On iPhone: Share › Add to Home Screen.
:::

## SIMPLE or PRO

WebTrader has two modes, and you switch between them at the top (or with **Alt+M** on a computer):

| Mode | Who it's for | What you see |
|---|---|---|
| **SIMPLE** | Phone, beginners | The chart full screen, SELL · volume · BUY large at the bottom and a drawer with Positions, Orders, History and More |
| **PRO** | Computer, people who already analyse | Up to 4 charts, the symbol list, the ticket, the calendar and, at the bottom, Positions · Orders · History · Statistics · Journal · Alerts · Account |

[[foto: wt-pro-en.jpg | PRO mode: the chart in the centre, list and ticket on the right, positions and history at the bottom. | larga]]

Three things at the top you will use every day. The timeframe menu (10m, 5m, 15m, 1h, 4h) changes the chart candle without switching off the strategy. The **Tutorial** button opens the room with the WebTrader videos, so you can review a step when you forget it. And the **Log out** icon, in the corner, ends the session; in the apps, the back arrow takes you back to the app.

## Opening a position, step by step

It's the same method as chapter 6, but with the risk set by you.

1. **Choose the symbol** from the list (or tap the symbol name in SIMPLE mode).
2. On the **ticket**, choose **Market** or **Pending** (Limit or Stop).
3. Instead of typing the lot, change the volume to **Risk** and type **1%** (or a dollar amount). WebTrader calculates the lot from the distance to the stop.
4. Type the **SL** and the **TP**, or drag the lines directly on the chart. Typing draws the line; dragging the line fills in the number. There are never two versions of the same order.
5. Read the summary: direction, entry, stop, target, lot, **risk in money and in percentage**, risk/reward ratio and margin.
6. Tap **Confirm**.

[[foto: wt-ticket-en.jpg | The ticket in Risk volume mode: you move the stop and the lot recalculates by itself. | larga]]

:::alerta Classic mistake · Turning on one-click trading on day one
WebTrader has a "one-click" mode, like MetaTrader and TradingView: with it on, tapping BUY sends the order straight away. It's useful for people who already have a trained hand. In your first month, leave it off. The confirmation is your last check before you jump.
:::

[[grafico:webtrader-ordem]]

## Automatic management: what the engine does for you

This is the part that MetaTrader on the phone doesn't give you. On each position you have three buttons:

| Button | What it does |
|---|---|
| **Auto BE** | When the price moves X pips in your favour, the stop moves to the entry (with a small gain, if you want). From then on, the trade can no longer lose you money. |
| **Auto Trailing** | The stop follows the price at a fixed distance, only in your favour. It never moves back. |
| **Trailing now** | Turns trailing on from now on, at the distance you choose. |

In the **Advanced** block of the ticket you can also split the exit into **TP1, TP2 and TP3**, each with a percentage of the volume, move the stop to the entry when TP1 is hit, and set an expiry on a pending order.

What matters is **who executes**. On the MTM Funded and demo accounts, it's the MTM engine, price by price, on a server. On your broker accounts (TradeLocker and MetaTrader), the same buttons, with the same meaning, are saved and executed on MTM's server. The browser never moves a stop on real money: if you close the tab, the management doesn't stop halfway.

[[foto: wt-gestao-en.jpg | An open position with Auto BE and Auto Trailing. The stop moves up by itself and never moves down. | larga]]

[[grafico:auto-be-trailing]]

:::historia Marta, day 26
Marta spent the last week of her demo on WebTrader. She opened a Buy Limit on EURUSD with 1% risk, and the lot came out at 0.04 without any maths. She turned on Auto BE at +15 pips and went to work. At break time she saw the notification: the price had gone up, and the stop was at the entry. At the end of her shift, the trade had closed at the target. What made her smile was not the result. It was that she didn't open the app even once during her shift.
:::

## Navigating: list, charts and scanners on the chart

- **Symbol list:** with the 24-hour change and a mini chart. Drag to reorder, tap the star for favourites.
- **Market status:** next to the symbol name you can see whether the market is **open or closed** and how long until it closes, plus the percentage of traders who are long. It's the schedule from chapter 7 without you having to do time-zone maths.
- **Multi-chart (PRO):** 1, 2 or 4 charts, each with its own symbol and timeframe. H4 in one, H1 in the other, as in chapter 4.
- **MTM studies on the chart:** the house scanners draw directly on the WebTrader chart. When a scanner or an MTM idea gives a signal, a sheet opens with all the numbers (entry, stop, target, lot, risk in money and in percentage). From there you only have three doors: confirm, adjust or discard. A signal never gets in on its own.

[[foto: wt-mercado-en.jpg | Market status next to the symbol: open, closed and how long until it closes. | larga]]

## Working with the house strategies and their signals

The WebTrader is not just a place to click buy and sell. The house strategies live inside it: in the bar above the chart you have GoldKiller, MTM Scanner, Sensei, TrendShot and the others. Switch on **one at a time**. Two strategies on the same chart are two opinions shouting at once, and the cold method needs a single voice.

- **GoldKiller:** when there is a signal, a bar appears above the chart with the direction, entry, stop and target, and a **"Usar este sinal"** (use this signal) button. That button only pre-fills the ticket. You are the one who confirms.
- **MTM Scanner:** draws the market structure (BOS, CHoCH) and, when it signals, marks the entry, the stop and two targets with the risk-reward written on them (1:2 and 1:4).
- **Sensei:** the most educational one. It shows a table of confirmations (trend, momentum, structure, volatility) scored from 0 to 20, and a checklist of what is still missing. While it says "waiting for signal", there is no trade.
- **TrendShot:** trend averages and the entry and target levels on the price scale.

[[foto: wt-estrategia-scanner-en.jpg | MTM Scanner switched on alone: entry, stop and two targets with the risk-reward, already drawn. | larga]]

The path is always the same:

1. Pick the asset and the timeframe of your plan.
2. Switch on the strategy you studied, and only that one.
3. Wait for it to signal. No signal, no trade.
4. Use the signal (or copy the numbers into the ticket) and set the volume to **Risk %**.
5. Confirm, switch on Auto BE and Auto Trailing, and write in the journal which strategy you used.

After a month, the journal tells you which strategy works for you. That is why the setup has its own tag ("Sinal GoldKiller", "Sinal Sensei", "Sinal MTM Scanner").

[[foto: wt-estrategia-sensei-en.jpg | Sensei: ten confirmations out of twenty and the checklist of what is missing. Not a signal yet. | larga]]

## History, statistics and journal

In the bottom panel are the three pieces from chapter 9, already linked together:

- **History:** every closed trade, with entry, exit, result and the partial exits.
- **Statistics:** the balance and equity curve, drawdown, win rate, average win against average loss, and groupings by symbol, strategy, hour and day of the week. Always in account dollars, never in promises.
- **Journal:** one note per trade, with the emotion, the setup, the tags and the screenshot. You write the why next to the history itself, not in a notebook that stays at home.

[[foto: wt-historico.jpg | History and statistics side by side: the Sunday review from chapter 9 in two taps. | larga]]

## Calendar and alerts

The **economic calendar** is inside WebTrader, with the medium- and high-impact events for the currencies you trade. The 30-minute rule from chapter 7 is kept without switching apps. **Price alerts** appear as yellow lines on the chart and, when the price reaches them, you get a notification on your phone.

## Sharing your audit

In the **Account** tab you can generate a **public audit link**. The page shows your trades, the results in R and pips, the drawdown and the risk, **with no name, no email and no passwords**. Your login only appears if you want it to. You can revoke the link whenever you like, and the old one stops working.

It's useful for showing your work to a mentor, a colleague or yourself six months from now. It's the opposite of a profit screenshot: it shows everything, the good days and the bad.

[[foto: wt-auditoria-en.jpg | The audit link: everything in view, no personal data. | larga]]

## TradeLocker and WebTrader, side by side

If your broker uses **TradeLocker**, you don't have to choose. You connect your TradeLocker account to WebTrader and it appears in the selector, with the platform's badge. You can keep using the TradeLocker app for what you like about it, and use WebTrader for what it doesn't do in the same way: automatic management on the server (Auto BE, Auto Trailing, partial exits), MTM scanners on the chart, the journal next to the history and the shareable audit. The same goes for MetaTrader accounts.

[[grafico:webtrader-contas]]

## The house tools

The MoreThanMoney scanners automatically mark zones, trend and possible entries on TradingView and on the WebTrader chart. They don't decide for you. They save you time and help you not to see what isn't there. These are the four I use most with people who are starting out, beginning with the one I recommend most.

:::scanner DEFY
foto: sc-defy.jpg
estilo: Exhaustion and key levels
ativos: Forex, gold, indices
tempo: 15 minutes to 1 hour
It's the tool I trust most for teaching. It draws exhaustion bands and key levels, and only gives a signal with confirmations (the stars). Each signal arrives with everything marked on the candle: entry, a warning line, the stop and three fixed targets. There is nothing for you to invent. Either the plan is on the chart, or there is no trade.
:::

:::scanner Golden Zone
foto: sc-golden-zone.jpg
estilo: Trend-following scalping
ativos: Gold (XAUUSD)
tempo: 5 minutes
It doesn't tell you to chase the price. It marks a zone and waits for the price to come back to it. A check mark is a warning, not an entry. A white flag means it's over.
:::

:::scanner Momentum
foto: sc-momentum.jpg
estilo: Direction following
ativos: Forex, gold, indices, crypto
tempo: 15 minutes to 1 hour
It works by colour: green buys, red sells, with five confirmations worth one point each. The lilac boxes mark sideways market, and sideways market is where you don't enter.
:::

:::scanner Aurum Flow
foto: sc-aurum-flow.jpg
estilo: Breakout of the opening range
ativos: Gold and crypto
tempo: Session opens
It marks the opening range and waits for the price to break it. The stop sits on the opposite edge, so you know the risk before you enter. It's the simplest tool to explain and one of the hardest to stick to: it demands that you wait for the right time.
:::

### Where to learn to use them

Each tool has a free YouTube playlist with what it is, the confirmations and a practical example, and a video **bootcamp**, narrated by me, with the strategy's behaviour animated from start to finish.

| Tool | Playlist and bootcamp | Tool page |
|---|---|---|
| **DEFY** | youtube.com/playlist?list=PLGgrpPKdUTXs | morethanmoney.pt/scanner/defy |
| **Golden Zone** | youtube.com/playlist?list=PLV0hwsHYlTJI | morethanmoney.pt/scanner/golden-zone |
| **Momentum** | youtube.com/playlist?list=PLN4Z40YVHXW0 | morethanmoney.pt/scanner/momentum |
| **Aurum Flow** | youtube.com/playlist?list=PLdRz7aeu-CNM | morethanmoney.pt/scanner/aurum-flow |

### How you get access

The videos are free. The tools are not. There are two ways to use them:

1. **Buy the scanner you want**, for six months or for life, on each one's page, or the **Scanner Pack**, with all of them, monthly.
2. **Be a MoreThanMoney member.** Member plans give you the lessons, the community, WebTrader and the house strategies and ideas, and some plans already include the scanners.

Prices and what each plan includes are always up to date at morethanmoney.pt/upgrade. I don't write them here, so they don't go out of date on paper.

:::alerta Classic mistake · Buying a tool so you don't need a plan
A scanner doesn't replace the plan from chapter 8. If you don't know your risk per trade, your window and your stop-loss rules, the best scanner in the world only gives you prettier signals for making the same mistakes. Method first. Tool second.
:::

## The cold rule of this chapter

:::cartao Cold rule no. 11
The tool works for my plan, never the other way round. Volume on risk, stop before confirming, automatic management on, journal next to history. A signal only pre-fills: I am the one who decides.
:::

## In summary

- MoreThanMoney's WebTrader brings demo, MTM Funded and broker accounts (TradeLocker and MetaTrader) onto one screen.
- SIMPLE for the phone, PRO for the computer.
- Risk volume mode works out the lot from the stop. Typing or dragging gives the same result.
- Auto BE, Auto Trailing and partial exits run on the server, even with the tab closed.
- History, statistics and journal live together. The audit shares everything without personal data.
- DEFY, Golden Zone, Momentum and Aurum Flow: free videos to learn from, access by buying the scanner or as a member.

:::exercicio Do this today
1. Go to morethanmoney.pt/webtrader and open a demo account with a realistic balance.
2. Place a pending order with volume in Risk mode at 1%. Calculated lot: ______
3. Turn on Auto BE on that position. At how many pips? ______
4. Write the journal note for that trade inside WebTrader.
5. Watch a playlist for one of the house tools and write, in one sentence, when it says "don't enter": ____________
:::
