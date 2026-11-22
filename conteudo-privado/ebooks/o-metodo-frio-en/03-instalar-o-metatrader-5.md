# Installing MetaTrader without tripping up

> The platform will not make you a trader. But one button pressed by mistake can cost you the month.

MetaTrader 5 (MT5) is the platform where you will look at charts and place orders. It is free, it exists for phone, computer and browser, and it is used by many brokers around the world. The app is made by MetaQuotes. The account belongs to the broker. This distinction sounds like a detail and it is not: MT5 is just the window. The money, when there is any, sits with the broker.

The first goal of this chapter is simple: have MetaTrader running on a **demo account**, on the phone and on the computer, and know where everything is, before you touch real money.

[[foto: rg-telefone.jpg | A large part of my analysis work starts on the phone. The rule is the same as on the computer: plan first, click afterwards. | lado]]

## MT4 or MT5?

You'll hear about both. They come from the same company, MetaQuotes, and do the essentials the same way: charts, orders with stop and target, history.

| | MetaTrader 4 | MetaTrader 5 |
|---|---|---|
| Age | The older version, still widely used in Forex | The current version, with more markets |
| Pending order types | 4 | 6 (adds Buy Stop Limit and Sell Stop Limit) |
| Chart timeframes | 9 | 21 |
| Economic calendar in the app | No | Yes |

What really matters: **an account belongs to one platform only.** An MT5 account won't log into MT4, and the other way round. When you open an account, the broker asks which one you want. In this book I use MT5. If your broker only offers MT4, everything here still works; only the place of one button or another changes.

## On the phone: install and log in

1. Open **Google Play** (Android) or the **App Store** (iPhone) and search for "MetaTrader 5" (or "MetaTrader 4").
2. Check that the developer is **MetaQuotes**. There are copies with similar names. Never install the app from a link someone sends you in a message.
3. Open the app. The first time, it offers a demo account on a MetaQuotes server. It's fine for a look around, but ideally use your broker's demo, with the same conditions as the real account.
4. Go to **Settings › New account** (in MT4: **Settings › New account** or **Manage accounts › +**) and type the broker's name.
5. Choose the server. Those with "Demo" in the name are for practice. Those with "Live" or "Real" are for real money.
6. Tap **Open a demo account** and fill in the details. Or, if you already have an account, tap **Login to an existing account** and type the account number, password and server exactly as they came in the broker's email.
7. Choose a **realistic** balance. If in the real world you would start with €500, the demo is also €500.
8. Keep the account number, password and server name somewhere safe, off the phone.

:::alerta Classic mistake · Practising with a fantasy balance
The demo often comes with 10,000 or 100,000 by default. With that balance, a 0.50 lot looks small and a 300 loss looks like nothing. Then you move to a real €500 account with the same habits. The demo only teaches you something if it's the size of your life.
:::

:::nota If the password won't work
Nine times out of ten the problem is the server. "Broker-Demo" and "Broker-Live01" are different servers. Copy the server name from the email, letter by letter.
:::

## On the computer: the terminal

The phone is enough to follow the market and to place an order you've already prepared. To analyse calmly, a big screen helps. The PC terminal is the full version.

1. Download the terminal **from your broker's website** or from the official site **metatrader5.com** (MT4: metatrader4.com). There are versions for Windows and Mac. Never from third-party sites.
2. Run the installer and accept the default options. At the end, the terminal opens by itself.
3. If a window opens asking you to open an account, close it. Go to **File › Login to Trade Account** and type the account number, password and server. The same account works on the phone and the PC at the same time.
4. In the bottom right corner you should see the connection speed (for example "45 ms"). If it says "No connection", the server or the password is wrong.

Menu names change a little with the language you choose in the terminal.

The terminal screen has four areas:

| Area | Where it is | What it's for |
|---|---|---|
| **Market Watch** | Top left | The list of pairs with sell and buy, like Quotes on the phone |
| **Navigator** | Bottom left | Your accounts, indicators and scripts |
| **Charts** | Centre | One tab per open chart |
| **Toolbox** | Bottom | Trade, History, Journal and Alerts |

To open an order on the PC, press **F9** (or the **New Order** button). The window is the same as on the phone, with the same fields: type, volume, price, S/L and T/P.

:::cartao Shortcuts that save clicks
**F9** new order · **Ctrl+M** Market Watch · **Ctrl+T** Toolbox · **+ / −** zoom the chart in or out · **F8** chart properties
:::

## Phone and PC talking to each other

You can receive on your phone the alerts you set on the PC. In the app, under **Settings › Messages**, you'll find your **MetaQuotes ID**, an eight-character code. In the terminal, go to **Tools › Options › Notifications**, turn on push notifications and paste that code. From then on, a price alert created on the PC reaches your phone, even with the computer far away.

This helps with this book's rule: you leave the order and the alerts ready on the PC and don't sit staring at the screen.

## The five tabs that matter

The app has five tabs along the bottom of the screen. Learn them in the order you will use them:

| Tab | What it is for |
|---|---|
| **Market Watch** | The list of pairs. Tap one to see details or place an order. |
| **Chart** | The chart of the chosen pair, with candles, timeframes and drawing tools. |
| **Trade** | Your balance, equity, margin and open positions. |
| **History** | Every closed trade, with its result. This is the raw material for your journal. |
| **Messages / Settings** | Notifications, accounts and preferences. |

[[foto: mt5-android-negociacao.jpg | The trade tab and the history in MetaTrader 5 for Android and tablet. This is where you see balance, equity and margin. Image: MetaQuotes (metatrader5.com). | larga]]

*The real app screens, organised by topic, are in the **Visual guide to MetaTrader 5** at the end of the book.*


On a demo account just opened with €500, the "Trade" tab shows balance €500.00, equity €500.00, margin €0.00 and free margin €500.00 (illustrative values).

**Balance** is the money without counting open positions. **Equity** is the balance plus or minus what your open positions are winning or losing. When you have a trade open, always look at equity: that is the real number.

## Tidying the chart (less is more)

Tap the chart and set it up like this:

- **Candles** (not lines or bars), because they show the open, close, high and low of each period.
- **Working timeframe**: start with the H1 (one candle per hour) and use the H4 or D1 to see the bigger direction.
- **No indicators**, for now. Yes, none. In chapter 5 I explain why.
- **Bid line** visible, so you can see the spread with your own eyes.

:::post @ricardogarciapt
imagem: Clean chart. Clear head.
legenda: Twelve indicators on the screen do not give you twelve confirmations. They give you twelve excuses. Start with candles and two zones drawn by hand.
:::

## Broker: four questions before you open an account

When you move from the demo to a real account (and you only do that in chapter 11), ask these four questions:

1. **Who regulates me?** Look up the entity and the licence number on the regulator's website, not only on the broker's site.
2. **Which entity holds my account?** Many groups have several entities in different countries, with different rules.
3. **What does it cost?** Typical spread, commissions, swap, withdrawal costs.
4. **Can I withdraw?** Read the withdrawal rules before you deposit.

:::nota
The account must always be in my name. If someone asks me for access, a password or a "power of attorney" so they can trade for me, the conversation ends there.
:::

## The cold rule for this chapter

:::cartao Cold rule no. 3
The demo is the size of my real life. The same balance, the same lot sizes, the same hours. If it is not serious on the demo, it will not be serious with real money.
:::

## In short

- MT5 is the window; the account and the money sit with the broker.
- An account belongs to one platform only: MT4 or MT5.
- Install only from the official store, your broker's website or the MetaQuotes website.
- Open a demo with a balance equal to what you would use in real life.
- Learn the five tabs: Market Watch, Chart, Trade, History and Settings.
- When you have open positions, look at equity, not balance.
- Before a real account, the four questions: regulation, entity, costs, withdrawals.

:::exercicio For today
1. Install MT5 on your phone and computer and open a demo account with a realistic balance: €____________
2. Log in with the same account on both. Server: ____________
3. Add the pair you chose in chapter 1 to Market Watch.
4. Set the chart to candles, H1, no indicators. Take a screenshot and save it in a folder called "Journal".
5. On the Trade tab, write down your balance, equity and free margin: ____________
:::
