# Visual guide to MetaTrader 5

> Put the app next to the book and follow along with your finger. Nobody learns to swim by reading about water.

The chapters explain the why. This guide shows the where. I've gathered here, by theme, the MetaTrader 5 phone screens you'll use every day: from the demo account to the confirmation of an order. These are real captures of the app, on an example account with the account details blurred. The numbers you see (lots, prices, balances) belong to the example. They are not a recommendation.

Open your demo, put the phone next to the book and do each step as you read.

[[foto: mt5-tel-trio.png | Quotes, chart and order window: the three screens where you'll spend almost all your time. | larga]]

## 1. The bottom bar: five buttons

Everything in the MT5 phone app starts at the bottom bar. From left to right:

| Button | What it's for |
|---|---|
| **Quotes** (arrows) | The list of pairs, with the sell and buy price |
| **Chart** (candles) | The chart of the chosen pair |
| **Trade** (line) | Open positions, balance, equity and margin |
| **History** (clock) | What has already closed: your journal comes from here |
| **Settings** (gear) | Accounts, news, calendar and preferences |

:::nota If you get lost
Tap Quotes. It's the starting point for almost everything, like your front door.
:::

## 2. Settings: opening the demo account

:::galeria The first screen to visit
mt5-tel-conta.png | In Settings: New account, news, calendar (Tradays) and charts.
:::

1. Tap **Settings** and then **New account**.
2. Search for the broker by name and choose the **demo** server.
3. Choose a realistic balance, the same money you'll actually use one day. Practising with €100,000 when you'll start with €500 teaches you the wrong reflexes.
4. Keep the account number and password somewhere other than the phone.

This screen also holds the **News** and the economic calendar (**Tradays**), which we use in chapter 7.

## 3. Quotes: reading the price

:::galeria Each line is a pair
mt5-tel-cotacoes.png | Sell on the left, buy on the right. Underneath, the day's low (L) and high (H).
:::

On each line you have:

- **The pair** (EURUSD, GBPCAD…) and, above it, the day's change in points and percent.
- **The time of the last price** and, next to it, the **spread** in points: the difference between buying and selling.
- **Two big prices.** The left one is the price you sell at (Bid) and the right one is the price you buy at (Ask).
- **L and H**: the day's low and high.

:::cartao Red doesn't mean losing
The colours only tell you whether the last price went down (red) or up (blue) compared with the previous one. They have nothing to do with your account.
:::

To open an order or a chart, tap the pair and choose the option in the menu that appears.

### Adding a pair to the list

:::galeria Search by name
mt5-tel-procurar-simbolo.png | Tap the "+" in Quotes and type the pair's name. Assets are grouped: Forex, commodities, indices and crypto.
:::

Keep the list short. The pairs in your plan and little else. A list with forty lines invites you to hunt for opportunities instead of waiting for yours.

## 4. The chart: the same pair on two timeframes

:::galeria Changing the timeframe changes the story
mt5-tel-grafico.png | M1: each candle is one minute. Lots of noise.
mt5-tel-grafico-velas.png | H1: each candle is one hour. The trend is easier to see.
:::

- **Change the timeframe:** tap the chart and choose M1, M5, M15, M30, H1, H4, D1… In the cold method you decide first on H1 or H4 and only then fine-tune the entry on a lower timeframe (chapter 5).
- **The price line:** the coloured label on the right marks the current price.
- **Indicators:** the *f* button at the top. Use one, two at most.
- **Objects:** lines, zones and Fibonacci are also at the top. Draw your zones before you think about entering.

:::galeria Timeframe and indicators
mt5-tel-periodos.png | Hold your finger on the chart to choose the timeframe: minutes, hours and days.
mt5-tel-indicadores.png | The f button lists indicators by family: trend, oscillators, volumes.
:::

:::galeria Draw and fine-tune
mt5-tel-objetos.png | The list of drawn objects, by pair. From here you edit, hide or delete them.
mt5-tel-fibonacci.png | A Fibonacci's properties: points, levels, colour and style.
:::

### Setting up the chart your way

:::galeria Less noise, better reading
mt5-tel-definicoes-grafico.png | In Settings › Charts you choose Japanese candles and what appears on screen.
mt5-tel-cores.png | The colour of each part of the chart. Pick one scheme and leave it alone.
:::

Turn on only what you use. The Ask line helps you see the buy price. The countdown to the candle close helps you not decide halfway through a candle. The rest can stay off.

:::alerta Classic mistake · Living on M1
On the 1-minute chart everything looks like an opportunity. It's the timeframe where people trade the most and think the least. Only open it once you've already decided on a higher timeframe.
:::

## 5. The pending order, step by step

This is the screen that matters most. Notice that the app lets you fill in everything **before** you press the button.

:::galeria From order type to button
mt5-tel-ordem-mercado.png | 1. Choose the type (here, Sell Limit), the volume in lots and the price.
mt5-tel-grafico-sltp.png | 2. Turn on S/L: the line appears on the chart with the loss in money.
:::

:::galeria Confirm without rushing
mt5-tel-ordem.png | 3. Check volume, price and S/L. Only then tap "Place".
mt5-tel-ordem-executada.png | 4. "Done": the order number, the price and the stop.
:::

1. In **Quotes**, tap the pair and choose **New order**.
2. At the top choose the type: **Market execution**, **Buy Limit**, **Sell Limit**, **Buy Stop** or **Sell Stop** (chapter 4 explains when to use each).
3. In **Volume**, type the lot you calculated in chapter 6. Not the one that "looks right".
4. In **Price**, type the price from your plan.
5. Turn on **S/L** and **T/P** and type the prices. Below the field you have three ways to see them: **Price**, **Pips** and **USD** (or your account currency). Use USD to see how much you lose if the stop is hit.
6. Read everything again and tap **Place**.
7. Wait for **Done**. Go to **Trade** and confirm the order is there with its stop.

:::nota The screen that protects you
In step 2 the app shows the loss in money before you confirm. If that number makes you swallow hard, the lot is too big. Go back to chapter 6.
:::

## 6. Quick map: where everything is

| I want to… | Where I tap |
|---|---|
| See prices | Quotes |
| Open an order | Quotes › pair › New order |
| Change the chart timeframe | Chart › tap the screen › timeframe |
| Add an indicator | Chart › *f* |
| Draw a zone or Fibonacci | Chart › objects |
| See positions and margin | Trade |
| See what has closed | History |
| Economic calendar | Settings › Tradays |
| Open another demo account | Settings › New account |

## 7. The screen mistakes that cost money

:::alerta Classic mistake · The comma in the lot
You wanted 0.10 and typed 1.0. On a phone this happens with one clumsy finger. Before placing, read the volume out loud.
:::

:::galeria The lot selector
mt5-tel-ordem-lotes.png | Tapping the volume opens a selector with buttons from −0.10 to +0.10. Check the big number before you close it.
:::

:::alerta Classic mistake · Mixing up Limit and Stop
Buy Limit buys **cheaper** than the current price. Buy Stop buys **higher**. Swap them and you enter exactly in the wrong place.
:::

:::alerta Classic mistake · Stop in pips when you meant price
The S/L field changes depending on whether you choose Price, Pips or USD. Check the tab before typing the number.
:::

## The cold rule of this guide

No order goes out without passing through these three screens: the chart on your decision timeframe, the order window with S/L filled in and the confirmation in Trade. If one is missing, it wasn't a cold order.

*Educational content. Real captures of the MetaTrader 5 app, on an example account with the account details blurred. The values shown are not a recommendation. Trading Forex and CFDs with leverage carries a high risk of loss.*
