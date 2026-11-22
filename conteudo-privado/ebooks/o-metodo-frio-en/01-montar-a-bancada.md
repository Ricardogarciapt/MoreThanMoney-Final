# Setting up the workbench

> The platform does not make you a trader. But one button pressed by mistake can cost you the month.

Nobody learns carpentry by reading about wood. First you set up the workbench, put each tool in its place, and only then cut the first board. It is the same here. Before we talk about the market, pips or orders, you will have MetaTrader installed on a **demo account**, on your phone and on your computer, and you will know where every button is. From here on, each chapter brings a new idea and the app screen where it applies.

MetaTrader 5 (MT5) is the platform where you will look at charts and place orders. It is free, it exists for phone, computer and browser, and many brokers around the world use it. The app is made by MetaQuotes. The account belongs to the broker. This distinction seems like a detail and it is not: MT5 is just the window. The money, when there is any, sits with the broker.

[[foto: rg-telefone.jpg | Much of my analysis work starts on the phone. The rule is the same as on the computer: plan first, click afterwards. | lado]]

:::historia Marta, day 1
Marta is 34 and works shifts at a hospital. During a break, she gets a WhatsApp message from an acquaintance of an acquaintance: "Install it through this link, it's the pro version of MetaTrader". She almost tapped it. Then she remembered a line she had read: the real app is in the official store and the developer is called MetaQuotes. She deleted the message and went to the Google Play Store. It was the first cold rule she followed without knowing it was one.
:::

*Marta is an example character, built from the questions I hear every week from people starting out. You will follow her to the end of the book.*

## MT4 or MT5?

You will hear about both. They come from the same company and do the essentials in the same way: charts, orders with a stop and a target, history.

| | MetaTrader 4 | MetaTrader 5 |
|---|---|---|
| Age | The older version, still widely used in Forex | The current version, with more markets |
| Pending order types | 4 | 6 (adds Buy Stop Limit and Sell Stop Limit) |
| Chart timeframes | 9 | 21 |
| Economic calendar in the app | No | Yes |

What really matters: **an account belongs to one platform only.** An MT5 account does not work in MT4, and the other way round. When you open an account, the broker asks which one you want. In this book I use MT5. If your broker only offers MT4, everything here still applies, only the location of one or two buttons changes.

## On the phone: install and log in

1. Open the **Google Play Store** (Android) or the **App Store** (iPhone) and search for "MetaTrader 5" (or "MetaTrader 4").
2. Check that the developer is **MetaQuotes**. There are copies with similar names. Never install the app from a link sent by message.
3. Open the app. The first time, it offers a demo account on a MetaQuotes server. It is fine for a look around, but ideally use your broker's demo, with the same conditions as the real account.
4. Go to **Settings › New account** and type the name of the broker.
5. Choose the server. Those with "Demo" in the name are for practice. Those with "Live" or "Real" in the name use real money.
6. Tap **Open demo account** and fill in the details. Or, if you already have an account, tap **Log in to an existing account** and type the account number, password and server exactly as they came in your broker's email.
7. Choose a **realistic** balance. If in the real world you would start with €500, the demo is also €500.
8. Save the account number, the password and the server name somewhere secure, away from your phone.

:::galeria The first screen to visit
mt5-tel-conta.png | In Settings: the account, New account, news, the calendar (Tradays) and chart settings.
:::

:::alerta Classic mistake · Training with a fantasy balance
Demos often come with 10,000 or 100,000 by default. With that balance, a 0.50 lot looks small and a loss of 300 looks like nothing. Then you move to a real €500 account with the same habits. A demo only teaches you something if its size matches your real life.
:::

:::nota If the password won't log in
Nine times out of ten the problem is the server. "Broker-Demo" and "Broker-Live01" are different servers. Copy the server name from the email, letter by letter.
:::

:::historia Marta, day 1, at night
The demo opened with 100,000 by default. Marta deleted it and opened another with €500, the money she one day admits she might use. The password did not work the first time: she had picked the "Live" server. She switched to "Demo" and got in. She wrote the three details in a notebook whose cover says "My method".
:::

## The bottom bar: five buttons

Everything in the MT5 phone app starts from the bottom bar. Learn the five buttons in the order you will use them in this book:

[[foto: mt5-tel-trio.png | Quotes, chart and order window: the three screens where you will spend almost all your time. Real app captures, on an example account. | larga]]

| Button | What it's for | Where we go deeper |
|---|---|---|
| **Quotes** (arrows) | The list of pairs, with the sell and buy price | Chapter 2 |
| **Chart** (candles) | The chart of the chosen pair, with timeframes, indicators and drawings | Chapter 4 |
| **Trade** (line) | Open positions, balance, equity and margin | Chapter 6 |
| **History** (clock) | What has closed: this is where your journal comes from | Chapter 9 |
| **Settings** (cog) | Accounts, messages, news, calendar and preferences | This chapter and chapter 7 |

:::nota If you get lost
Tap Quotes. It is the starting point for almost everything, like the front door of a house.
:::

## Set up the chart before you use it

A messy workbench makes you pick up the wrong tool. Before you open a single chart, go to **Settings › Charts** and set it up like this:

- **Japanese candles** (not lines or bars), because they show the open, close, high and low of each period. In chapter 4 you learn to read them.
- **Ask line** on, so you can see the buy price and, by eye, the spread.
- **Candle close countdown** on, so you do not decide halfway through a candle.
- **No indicators**, for now. Yes, none. In chapter 4 I explain why.
- **A colour scheme** chosen once. After that, do not touch it again.

:::galeria Less noise, more reading
mt5-tel-definicoes-grafico.png | Settings › Charts: Japanese candles and what appears on screen.
mt5-tel-cores.png | The colour of each part of the chart. Pick a scheme and forget the subject.
:::

:::post @ricardogarciapt
imagem: Clean chart. Clear head.
legenda: Twelve indicators on the screen do not give you twelve confirmations. They give you twelve excuses. Start with candles and two zones drawn by hand.
:::

## On the computer: the terminal

The phone is enough to keep an eye on things and to place a prepared order. For calm analysis, the big screen helps. The PC terminal is the full version.

1. Download the terminal **from your broker's website** or from the official site **metatrader5.com** (MT4: metatrader4.com). There is a version for Windows and one for Mac. Never download it from third-party sites.
2. Run the installer and accept the default options. When it finishes, the terminal opens on its own.
3. If a window asks you to open an account, close it. Go to **File › Login to Trade Account** and type the account number, the password and the server. The same account works on the phone and on the PC at the same time.
4. In the bottom right corner, the connection speed should appear (for example "45 ms"). If it says "No connection", the server or the password is wrong.

Menu names can vary a little with the language set in the terminal (in Portuguese, for example, it is often Brazilian Portuguese). Where it helps, I give the English name as well.

The terminal screen has four areas:

| Area | Where it is | What it's for |
|---|---|---|
| **Market Watch** | Top left | The list of pairs with sell and buy prices, like the Quotes on the phone |
| **Navigator** | Bottom left | Your accounts, indicators and scripts |
| **Charts** | Centre | One tab per open chart |
| **Toolbox** | Bottom | Trade, History, Journal, Alerts and Calendar |

:::cartao Shortcuts that save clicks
**F9** new order · **Ctrl+M** Market Watch · **Ctrl+T** Toolbox · **+ / −** zoom the chart in or out · **F8** chart properties
:::

## Phone and PC talking to each other

You can receive on your phone the alerts you set on the PC. In the app, under **Settings › Messages**, you will find your **MetaQuotes ID**, an eight-character code. In the terminal, go to **Tools › Options › Notifications**, turn on push notifications and paste that code. To test it, press **Test**: the message must reach the phone within seconds.

Do this today, even if you do not yet understand what it is for. In chapter 7 you will use these alerts so you can stop staring at the screen waiting for the price to arrive.

## From my life: the grandfather's backyard

My adoptive grandfather was strict. When I did something wrong, the slipper flew. But right after came the other half of him: "Come on, put your shoes on and come with me." We went to the backyard, next to the rubble of a building they had knocked down. Chickens, vegetable patches, the hoe in its place, the watering can in its place. It was his escape, and it was my first school of method.

During the day he worked at the Vilares grocery store in Porto. Dried cod hanging up, chouriços in rows, the smell of salt and smoked meat, customers coming in with "Ó Evaristo, have you got any of this?" like in an old Portuguese film. Nothing was out of place, because in a full grocery store, whoever doesn't put things away can't find anything.

When he died, I held it together at the funeral. I didn't cry. Days later, in a café with a pool table, I stared at the balls sitting on the green cloth and everything came down on me at once: I had lost the person who supported me, who told me off and who gave me a direction. Today, when I tidy my workbench before opening a chart, it is still his voice I hear: everything in its place, and only then do you work.

## The cold rule of this chapter

:::cartao Cold rule no. 1
The demo is the size of my real life. The same balance, the same lots, the same hours. If it is not serious on the demo, it will not be serious on the real account.
:::

## In short

- MT5 is the window; the account and the money are with the broker.
- An account belongs to one platform: MT4 or MT5.
- Install only from the official store, the broker's website or the MetaQuotes website.
- Open a demo with a balance equal to what you would use in real life.
- Five buttons: Quotes, Chart, Trade, History and Settings.
- A chart set up before use: candles, Ask line, no indicators.
- Phone and PC connected by the MetaQuotes ID.

:::exercicio For today
1. Install MT5 on your phone and on your computer and open a demo account with a realistic balance: ____________ €
2. Log in with the same account on both. Server: ____________
3. In Settings › Charts, set Japanese candles, the Ask line and no indicators.
4. Link the PC to the phone with the MetaQuotes ID and do the notification test.
5. Create a folder called "Journal". In chapter 9 you will see why.
:::
