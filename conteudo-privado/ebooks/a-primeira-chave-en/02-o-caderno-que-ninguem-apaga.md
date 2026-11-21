# The notebook nobody can erase

> A blockchain is a notebook that the whole village can read and that nobody can tear up on their own.

Imagine a small village where everyone knows everyone else. There is a notebook in the square where people record who owes what. When the baker sells bread on credit to the blacksmith, a line gets written: "blacksmith owes the baker €5". For years the notebook sits in the hands of the grocer, who looks after it. The problem is obvious: what if the grocer is dishonest and tears out the pages that do not suit him?

The village's solution is simple. Instead of one notebook kept by one person, every family has a copy at home. When someone writes a new line, all the copies are updated. To cheat, you would have to change most of the copies at the same time, which is far harder than tearing up just one.

This is the idea behind the blockchain. It is a shared record, copied by many computers, where transactions are organised into blocks linked to one another.

[[grafico:blockchain-caderno]]

## What a block is

Each block is a page of the notebook. It holds a set of transactions (who sent what to whom), a timestamp and a digital fingerprint of the previous page, called a hash. That fingerprint links one block to the one before it. If someone changes a comma on an old page, the fingerprint changes and the link to the following pages breaks. The whole network spots the inconsistency.

You do not need to be able to do any maths to get the idea. Just imagine pages glued to one another with glue that gives way if anyone tampers with a single detail.

The fingerprint, the hash, works like a wax seal that only fits that one letter. If the letter is opened and sealed again with different text, the seal no longer matches. You do not need to know how the hash is calculated to understand that it reacts to any change, however small. That sensitivity is what makes the notebook hard to forge.

:::destaque
With a blockchain you do not trust a person. You trust the rules and the number of independent copies of the record.
:::

:::post @morethanmoney.pt
imagem: A notebook nobody can erase.
legenda: That is what a blockchain is. No jargon, no magic: a public record that thousands of computers keep at the same time. Anyone who tells you it is more complicated than this is trying to sell you something.
:::

## How agreement is reached: mining and proof-of-stake

If everyone could write pages at the same time, the notebook would become a mess. You need a rule for deciding who writes the next page and who checks it. There are two main ways of doing this.

**Proof-of-work.** This is the method Bitcoin uses. Participants, called miners, compete to solve a hard mathematical problem. Whoever solves it first writes the block and receives a reward. The idea is that rewriting the past would cost so much in energy and equipment that it would not pay. The cost is real, and it uses a lot of electricity.

**Proof-of-stake.** This is the method Ethereum has used since September 2022, in an event called The Merge. Instead of spending energy on calculations, those who want to validate blocks lock up a quantity of the coin itself as a guarantee. If they validate badly, they can lose that guarantee. The logic is that whoever has a lot to lose has reasons to behave well.

Both methods aim at the same goal: nobody decides on their own what is true in the notebook.

## Why this matters to beginners

The blockchain explains why crypto transactions are, as a rule, irreversible. If you send money to the wrong address, no bank can cancel the operation. No customer service department can arrange a refund. This feature is an advantage for anyone who does not want censorship, but it is a danger for anyone who makes a mistake or is tricked.

:::alerta
A transaction sent on a public blockchain cannot be reversed. Before you confirm, check the address, the network and the amount. Twice, if necessary.
:::

:::ecra Wallet · Confirm send (example)
To: 0x7a...f3 (example address)
Network: choose the network before sending
Amount: €50.00
Network fee (example): €0.40
Status: waiting for confirmation
:::

:::historia
Illustrative case: Inês, the same nurse from Coimbra as in the first chapter, wanted to send €50 in crypto to a friend. She copied the address, but only copied half of it, because her phone cut the line. She only realised once she had already confirmed. There was nobody to ask for the money back. It was not a disaster, but it was a lesson: the freedom of the blockchain requires human care.
:::

:::conversa WhatsApp · Friend (example)
Friend: Have you sent me the €50 yet?
eu: I have. But I copied the address wrong, what a stupid mistake.
Friend: And now what?
eu: Now there is no going back. So always check twice.
:::

## An exercise with paper and pencil

:::exercicio A record of three blocks
1. On a sheet of paper, draw three squares linked by arrows. Each square is a block.
2. Inside each square, write an imaginary transaction between two people in your family.
3. Change one value in one of the middle squares. Ask yourself which squares now look "suspicious".
4. Write, in one sentence, why a shared copy makes fraud harder.

____________________________________________________________

____________________________________________________________
:::

:::cartao Before you confirm any send
- Check the address, letter by letter, not just the start and the end.
- Confirm the network. If the network is wrong, the money may never arrive.
- Check the amount and the fee. Do not just trust what the button says.
:::

## In short

- A blockchain is a shared record, organised into blocks linked to one another.
- Changing an old block means changing every block after it, which is difficult and visible.
- Bitcoin uses proof-of-work (mining); Ethereum moved to proof-of-stake in September 2022.
- Transactions on public blockchains are, as a rule, irreversible.
- Security starts with you: always confirm the address, the network and the amount.

## To do today

1. Pick a real transaction you have made (a transfer, a payment) and ask yourself who could cancel it.
2. Compare your answer with how the blockchain works. The difference will stick in your memory.
3. Save a note on your phone with the three questions from the card above, so you can read them before any send.
