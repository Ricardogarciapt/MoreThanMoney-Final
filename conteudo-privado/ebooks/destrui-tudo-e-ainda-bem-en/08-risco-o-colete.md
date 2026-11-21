# Risk: the vest

> You can't control what the market does. You can control how much of you is exposed to each decision.

There's a kind of vest nobody wants to wear, because it isn't pretty and it doesn't promise anything. It's the vest that takes the impact when everything else fails. In risk management, the vest is the rule that stops you from leaving the game after a bad run.

It's very common to see people spend hours finding the perfect entry and five minutes deciding the size of the position. That's the mistake. The size of the position is the decision that weighs most on your account, and it's the one that gets ignored most.

:::destaque
Before you ask how much you could win, ask how much you're prepared to lose on a single trade, and write the number down.
:::

## The 1% rule

The rule I stand by here is simple: don't risk more than 1% of your capital on any one trade. It sounds conservative. It is. And that's precisely why it holds up.

Illustrative example, with round numbers and an account in dollars to keep things simple: an account of $2,000. One per cent is $20. That means that if the trade goes wrong and hits the stop-loss, you lose $20 and nothing more. Not $200, not "whatever it takes to recover".

:::curso Lesson 306 · What is a stop loss
The stop loss is the order that closes the position automatically if the price moves against you to a point you chose before entering.

- It's set **before** you enter, never after.
- It goes where your idea stops making sense, not where it "hurts less".
- You don't move it away as the price approaches. That's the most expensive mistake I know.

In the course: you mark stops on twenty old charts and compare them with a classmate's. The difference between the two teaches you more than any slide.
:::

## The position size formula

The size of the position connects three things: the risk you accept, the distance to the stop and the value of each pip. The formula is this:

**Size (in lots) = Money at risk ÷ (Stop distance in pips × Pip value per lot)**

Let's go step by step, using the $2,000 account:

| Step | Calculation | Result |
|---|---|---|
| 1. Money at risk | 1% of $2,000 | $20 |
| 2. Stop distance | Set before you enter, for example | 25 pips on EUR/USD |
| 3. Pip value per standard lot | On EUR/USD, with the account in dollars | about $10 |
| 4. Risk value per lot | 25 pips × $10 | $250 |
| 5. Position size | $20 ÷ $250 | 0.08 lots |

So, 0.08 lots, which is the same as 8 micro lots (each micro lot is 0.01 of a lot). Check the sum: if the price hits the 25-pip stop, the loss is 25 × (0.08 × $10) = 25 × $0.80 = $20. That matches the risk you defined.

:::alerta
If the stop is wider, the position size has to be smaller, not bigger. Many people do the opposite: they tighten the stop so they can fit a large lot. That leaves the account at the mercy of the first bit of market noise.
:::

An honest note: the pip value of a pair depends on the account currency and the exchange rate of the day. With an account in euros, the number changes. So before you use the formula, confirm the pip value for the instrument you're using with your broker. On gold, the convention for pip and contract size also varies from broker to broker.

:::exercicio Work out your position
1. Write the value of your account (it can be a hypothetical figure): ____________
2. Work out 1% of that value. Money at risk: ____________
3. Set the stop distance, in pips, before you look at the price: ____________
4. Confirm the pip value per lot for the instrument with your broker: ____________
5. Apply the formula: risk ÷ (pips × pip value). Size: ____________ lots
6. Do the check: pips × pip value × size should give your money at risk. Did it match? ____
:::

:::ecra Position calculator (illustrative example)
Account balance: $1,000
Risk per trade: 1% = $10
Distance to stop: 50 pips
Value per pip (0.01 lot): ≈ $0.10
Maximum lot: 0.02
:::

## Risk and reward: the break-even sum

Another idea that changes the way you see a trade is the relationship between risk and expected return. If you risk 1 to win 2, the trade is 1:2. It sounds like a lucky rule, but it's just maths.

Once you know how much you risk and how much you can win, there's a minimum hit rate needed to stay at zero, before costs. The formula is 1 ÷ (1 + R), where R is the reward ratio.

| Risk:reward ratio | Break-even hit rate (before costs) |
|---|---|
| 1:1 | 50% |
| 1:2 | 33.3% |
| 1:3 | 25% |

The way to read the table is this: with 1:2, you need to be right in about a third of your trades to avoid losing money, not counting spreads or commissions. With 1:1, you need to be right half the time. Costs always push that threshold up, and that's why ignoring the spread is such an expensive mistake.

[[grafico:winrate-rr]]

Notice that these numbers are nobody's forecast. They're a break-even sum. They tell you the minimum you need to avoid losing, and nothing more.

:::curso Lesson 407 · Risk and reward
You don't need to be right every time. You need that, when you are right, you win more than you lose when you're wrong.

Illustrative example, without costs: ten trades with a risk of 1 and a target of 2. You get four right (+8) and six wrong (−6). You were wrong more often than right and, even so, the account closed at +2.

Don't read this as a promise that you'll get four out of ten right. It's just maths, and that's why you choose the target before you enter.

In the course: you do this sum with your own demo journal, not with example numbers.
:::

## Losing streaks are normal

This is the point where most people give up. A losing streak doesn't mean the system is broken, or that you're bad at this. It means probability has done its job.

Imagine an account of €1,000 that loses ten trades in a row. What happens depends on the risk per trade:

| Risk per trade | Capital after 10 losses in a row |
|---|---|
| 1% | about €904 |
| 2% | about €817 |
| 5% | about €599 |
| 10% | about €349 |

Illustrative and hypothetical example. The table shows what the rule does: at 1%, a very bad run takes about 10% of your capital. At 10%, it takes two-thirds. The same sequence, with two completely different outcomes.

[[grafico:risco-sequencias]]

### Thinking in probabilities

There's a book I've read more times than I'd like to admit: "Trading in the Zone" by Mark Douglas. Its central idea fits on one line. Each trade is a unique event, and the result of one tells you nothing about the next. What you have on your side isn't being right this time. It's repeating a process with an edge many times, without a single loss knocking you out of the game.

When I first read this, I understood why I used to fume after a stop. I wanted every trade to prove me right. The market doesn't work like that, and the vest is there precisely so you can cope with the part where it doesn't prove you right.

:::destaque
You don't need to know what will happen next to make money over time. You need to know how much you lose if you're wrong, and to accept that loss before you click.
:::

Now a question I often ask beginners: how likely are losing streaks? Think of a coin toss, with a 50% chance each way. If you toss the coin 100 times, the probability of at least one run of five or more "losses" (heads, in this example) is about 81%. It isn't rare bad luck. It's what you should expect.

[[grafico:sequencia-perdas]]

:::destaque
A losing streak isn't proof that the plan is wrong. Before you judge it, you need to know whether the size of the losses fitted within the risk you had defined.
:::

:::historia
Illustrative example. A trader has a week of five losses. Instead of stopping, they increase the lot on Friday to "win it all back at once". Friday ends up worse than the whole week. The plan didn't fail on Friday. It failed the moment the size of the position stopped following the rule.
:::

:::cartao Vest rules
- Never more than 1% per trade.
- Stop set before I enter.
- Two losses in a row: I stop for the day.
- I've lost 5% in the week: I stop for the week.
- Never move the stop further away.
:::

## How the vest looks day to day

Three simple rules that help you keep the vest on:

- Set the money at risk and the stop before you enter. Never after.
- Never increase the size of a position to recover a loss.
- When your daily loss reaches the limit you wrote down, shut the trading screen. The daily limit is in chapter 9.

:::story
Which of these rules is the hardest for you to keep?
sticker: Stop before entering | Stopping after 2 losses
:::

## In summary

- Before anything else, decide how much you're prepared to lose on a trade.
- Under the 1% rule, on a $2,000 account, the risk is $20, and the size depends on the stop distance.
- The formula is risk ÷ (pips × pip value). Always confirm the pip value with your broker.
- At 1:2, the break-even hit rate is about 33%, before costs.
- Losing streaks are normal. The difference lies in the risk you let yourself accept.

## Your mission this week

Write your risk rule on a sheet of paper: the value of your risk per trade, how you work out the position size and your daily loss limit. Sign and date it, and keep it somewhere you'll see before every trade.

:::destaque
Educational content, not financial advice. The examples are hypothetical and are not a forecast of results. The risk of loss is real, and you can lose some or all of your capital.
:::
