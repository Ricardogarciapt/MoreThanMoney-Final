# Módulo 4 — Your key: wallets and the seed phrase (≈17 min)
**Objetivo:** understand the difference between self-custody and third-party custody, store your seed phrase without exposing it, and put together a backup plan.  **No fim, o aluno consegue:** 1) tell a hot wallet from a cold wallet and explain when each one makes sense; 2) explain what the seed phrase is and the rules that are never broken; 3) put together a storage plan with two copies in separate places.

## Aula 4.1 — Hot and cold wallets (≈4–5 min)
**Gancho (0:00–0:20):** "A wallet doesn't store coins. It never has. It stores keys. And whoever holds the key holds the money."

**[CENA 1]** An animation of an open wallet, with a golden key coming out of it. Behind it, the blockchain appears as a grid of pages, and the key points to one of them.
**NARRAÇÃO:** Let's correct something right away, because it's the most common confusion. A crypto wallet isn't a safe with coins inside. The coins live on the blockchain, the shared ledger we talked about in module 1. The wallet holds the keys that let you sign transactions, and those keys are what give you access to the value. Once you understand this, the way you think about security changes, because you stop looking for where the coins are and start looking for where the keys are. Think of an everyday analogy: your bank card number doesn't give you money, but anyone who has it and knows the code can spend. With crypto, the key plays that role, only there's no counter and no complaints department.

**[CENA 2]** A golden key in the foreground against a charcoal background. The sentence appears slowly: "In crypto, whoever holds the key holds the money."
**NARRAÇÃO:** That's why the key is the metaphor for this bootcamp. In crypto, whoever holds the key holds the money. There's no manager you can ask for a replacement, and no counter where you can explain that you lost your card. If the key is lost, access is lost. If the key is stolen, the value goes with it. That may sound harsh, but it's exactly what gives meaning to the phrase "being the owner of your money". Being the owner also means being responsible.

**[CENA 3]** A phone screen with an app open, and a small padlock blinking in the corner. Label: "hot wallet".
**NARRAÇÃO:** There are two main types of wallet. The first is the hot wallet. It's an app or a program connected to the internet. It's convenient, quick, and good for everyday operations. The risk is that, because it's connected, it's more exposed: to an infected phone, a fake website, a copied app that looks identical to the original. Convenience and exposure always go together. A well-built app isn't insecure for that reason, but you need to check every time where you downloaded it from.

**[CENA 4]** A small physical device being plugged into a computer with a cable. Beside it, a screen on the device itself asks for confirmation. Label: "cold wallet".
**NARRAÇÃO:** The second is the cold wallet. It's a physical device, often the size of a USB stick, that keeps your keys offline. To sign a transaction, you plug it in and confirm on the device itself. A well-known commercial example is Ledger, which is sold in the MTM shop. The advantage is that the key never leaves the device. The downside is that it's less convenient, and if you lose it without a backup, the problem remains. We'll get to that.

**[CENA 5]** An animated bar chart `tipos-carteira`: two columns compared in bars. "Convenience", "exposure", "daily use", "long-term storage". Each bar grows into its place.
**NARRAÇÃO:** Here's a simple comparison. A hot wallet is like having cash in your pocket: it's within reach, and it's good for buying a coffee. A cold wallet is like a safe at home, with a key that only you use, for your savings. Neither one is the universal answer. It depends on how much you have, how often you move it, and how much risk you're willing to take. The chart shows the trade-off: the more convenience, the more exposure. It isn't a quality ranking. A cold wallet isn't better in every situation; it's better for certain situations.

**[CENA 6]** Ruben pointing at a rule written on a board: "small amount, frequent use → hot. Amount parked → cold."
**NARRAÇÃO:** There's a practical rule worth keeping. Small amounts you use often can live in a hot wallet. Amounts you won't touch for months deserve a cold one. And no wallet protects you from your own mistakes, like sending to the wrong address, or signing something you didn't understand. Technical security doesn't replace attention. Before you confirm any transaction, read what you're confirming. Also note that a cold wallet won't save you from scams. If someone convinces you to sign a malicious transaction on the device itself, the technology is there, but you're the one deciding.

**[CENA 7]** Illustrative case: Tiago, a programmer from Braga, looking at his phone with a "wallet recovered" message on the screen.
**NARRAÇÃO:** Be careful: the wallet address is public, like an account number. You can share it to receive funds. But the private key and the recovery phrase never. Illustrative case: Tiago had almost everything in a phone app. One day he lost the device. He managed to recover the account because he had the recovery phrase stored, but he spent a whole weekend sorting it out. He learned that convenience has a price, and that the price is paid in time, stress and attention.

**Texto no ecrã:** key · hot wallet · cold wallet · public address · private key never
**Fecho / CTA da aula:** Exercise: make a list of where you have, or think you have, crypto. For each place, write whether it's a hot wallet, a cold wallet, or a platform that holds it for you. Check question: why isn't the wallet the place where the coins are, and what does it actually store?

## Aula 4.2 — The seed phrase: the words that are worth everything (≈4–5 min)
**Gancho (0:00–0:20):** "Twelve or twenty-four words, in a precise order. Whoever has them has the money. Nobody else needs you for anything."

**[CENA 1]** A grid of twelve numbered boxes, filling in word by word, with the label "seed phrase".
**NARRAÇÃO:** When you create a wallet, the app or the device generates a recovery phrase. It's called a seed phrase, or secret recovery phrase. It usually has twelve or twenty-four words, in a specific order. In practice, that phrase is the master key to your wallet. It isn't a password you can change whenever you like. It's the origin of the keys themselves, and whoever has it can recreate the wallet anywhere. Think of it as the combination of a safe, not the door: whoever knows it can open the safe from anywhere, at any time, and leave no trail that anyone can follow in time. Also note that the phrase is generated once, when you create the wallet. That's why it's the moment you need to be most alert.

**[CENA 2]** A lost phone on a table, and beside it a sheet of paper with the words handwritten. An arrow shows the wallet reappearing on a new computer.
**NARRAÇÃO:** Why does it matter so much? Because if you lose your phone, if the app fails, if the device breaks, you can recreate the wallet somewhere else with just those words. Without them, there is no recovery. And with them, whoever holds them can do everything you do. They don't need your password, your code or you. This is the difference that most people don't understand.

**[CENA 3]** A screen with four numbered rules appearing one by one, each with a "not allowed" icon beside it.
**NARRAÇÃO:** That's why there are rules that always apply. There are no exceptions. First rule: never enter your seed phrase on a website. Not to verify, not to recover, not to unlock. No serious platform, no legitimate support team, no official app will ever ask you for those words. Second rule: never send it to anyone, by message, email, call or photo. If someone introduces themselves as support and asks for the phrase, it's a scam. Full stop.

**[CENA 4]** A phone screen with an incoming call and a generic name: "Support". Below it, the line: "Confirm your words to validate your account."
**NARRAÇÃO:** Third rule: never photograph it, and never store it on your phone, your computer, your email, a notes app or in the cloud. Any digital copy is a copy that can be stolen, often without you noticing. Fourth rule: write it by hand, on paper, with a pen. And never keep it in the same place as your bank card or your passwords.

**[CENA 5]** Illustrative example: Inês on the phone, with a notes sheet on the table and a question mark growing on the screen.
**NARRAÇÃO:** Does this sound like overkill? Think about it. Most people who lose crypto don't lose it because of the market. They lose it because they gave the words to someone who phoned them saying they were from support. Illustrative example: Inês received a call from a number that claimed to belong to a platform. The person on the other end was friendly, had a professional tone, and asked her for the words "to confirm her identity". She hung up. Only later did she realize she had come within a step of losing everything, and that the pressure was part of the scheme.

**[CENA 6]** Three keywords highlighted one at a time: "urgency", "authority", "request for words". Below them, the caption: "always the same script".
**NARRAÇÃO:** Notice the pattern. Urgency, authority, a request for words. It's always the same script, and only the platform's name and the tone of voice change. When you feel the pressure rising, stop. No legitimate person needs you in that much of a hurry. No message, no video and no call that starts with urgency is a good reason to unlock anything. Urgency is the favorite tool of anyone who wants your money before you've had time to think. And if the call pushes you to decide now, the answer is to hang up and call the official number yourself. We'll look at all the scam patterns in module 5.

**[CENA 7]** Ruben at a clean sheet of paper, writing the words one by one, with the number beside each, then checking them with his finger.
**NARRAÇÃO:** Let's go through the correct way to store it. Take a clean sheet of paper, write the words one by one, with the number beside each, and check them twice. Then keep the sheet somewhere dry and secure. Don't fold it too often, because paper and damp don't get along. If you ever write a word down wrong, don't try to guess the correction on anyone's screen. Start the sheet again, calmly, at home, with nobody rushing you. And don't show it or photograph it, not even to remind yourself of a word. If you ever need to recover, use only the official app, downloaded from the official stores, and never a link someone sent you.

**Texto no ecrã:** seed phrase · twelve or twenty-four words · never on screen, never in a message · paper and pen
**Fecho / CTA da aula:** Exercise: without looking at any real phrase, write the four golden rules on a sheet of paper, then check that you've written them all. Check question: if someone asks you for your seed phrase to "fix a problem", what can that person do with it?

## Aula 4.3 — Not your keys, not your coins (≈4–5 min)
**Gancho (0:00–0:20):** "Leaving crypto on a platform is a bit like leaving money in a bank. It's convenient. But who holds the key?"

**[CENA 1]** A sentence highlighted in gold on charcoal: "not your keys, not your coins". Below it, the plain meaning: "if you don't hold the keys, you don't hold the coins".
**NARRAÇÃO:** There's a phrase that veterans repeat: not your keys, not your coins. In plain terms, it means: if you don't hold the keys, you don't hold the coins. Let's understand what that means, without dramatizing it, because the phrase doesn't mean that leaving crypto on a platform is automatically a mistake. It means you need to know what you're accepting when you do it.

**[CENA 2]** An illustration of a platform as a big safe with many drawers. Each drawer has a username. One of them is marked: "your balance".
**NARRAÇÃO:** When you buy crypto on a platform and leave it there, the platform keeps the keys for you. This is called third-party custody. It's the most convenient option. You recover your password if you forget it, you see your balance on the screen, and you can sell with one click. For many people, this convenience is exactly what they're looking for, and there's nothing wrong with that, as long as the choice is made knowingly.

**[CENA 3]** A line between two boxes: "platform" and "you". The line grows thin and flickers, with a warning icon.
**NARRAÇÃO:** The price of that convenience is that you start depending on the platform. If the platform has a technical problem, if it's attacked, if it's badly run, or if it stops operating, your access can be blocked. In some cases, the money may not come back. It isn't the most common scenario, but it's exactly what the word custody means: someone looks after what belongs to you, and you have to trust that they do. Think of a traditional bank: the money is in your name, but the bank has the systems, and you trust it to keep them secure. With crypto it's similar, only the regulation and the recovery rights vary a great deal from case to case.

**[CENA 4]** A split screen: on the left, a personal wallet with a key in the hand of the person using it. On the right, a platform vault with a padlock that isn't yours.
**NARRAÇÃO:** And there's the opposite too. A personal wallet, with no custody, gives you full control. But if you lose the key, you lose everything, and there's nobody to ask for help. The risk moves from whoever holds it for you to yourself. Notice that the word recover can mean two things: recovering your account, when you've forgotten your password, and recovering your money, when something goes wrong. The first is normal. The second depends on who holds it and on the rules you accepted when you signed up. There's no abstract right choice. There's the right choice for your situation, for your amount, for the way you handle technology.

**[CENA 5]** A simple chart: a large bar labeled "trading", sitting above a small bar labeled "savings parked". An arrow marks the split.
**NARRAÇÃO:** Many people use a hybrid approach. They leave on the platform the amount they use for trading, and move to a cold wallet the amount they want to keep for months. It isn't the only way to do it, but it's a sensible way to separate what moves from what rests. And separating is often the best protection there is. Remember the essentials: separating isn't running away. Someone who separates has a plan for each part, and that's what sets management apart from improvisation.

**[CENA 6]** A rule written on a board: "the more value and the less use → more self-custody. The less value and the more use → regulated platform, with support."
**NARRAÇÃO:** Here's a practical rule. The more value you have, the less waiting time you accept, and the greater the need for self-custody. The less value and the more you use it, the more sense it makes to be on a regulated platform, with support and account recovery. Nobody is forcing you to pick one extreme. You can sit somewhere in the middle, as long as you know where you stand. Before you leave value anywhere, read the custody terms, find out who is responsible and how an account is recovered. If you can't find that information, it's one more question to ask before you go ahead.

**[CENA 7]** Illustrative case: Rui, a teacher from Leiria, looking at a notebook where he has written a list of steps, with a tick beside each one.
**NARRAÇÃO:** Illustrative case: Rui, a teacher from Leiria, had everything on one platform and had never thought about it. When he understood the difference, he didn't change everything overnight. It isn't about being better or worse. It's about knowing where your responsibilities lie. He started by moving the part he wasn't using into a cold wallet, and left the rest where it was for trading. He made the change calmly, and wrote down each step. It took a few weeks, and he says it was the best use of his time in crypto so far.

**Texto no ecrã:** third-party custody · own wallet · separate what moves from what rests · regulated platform
**Fecho / CTA da aula:** Exercise: take the list you made in lesson 4.1 and mark, for each amount, whether it's in third-party custody or whether you hold the keys. Then answer: if the platform holding that amount became unavailable tomorrow, how long would it take you to find out what was going on? Check question: what changes in your life if the platform where you keep your crypto stops working tomorrow?

## Aula 4.4 — The storage plan: copies that survive (≈4–5 min)
**Gancho (0:00–0:20):** "A wet piece of paper can't be read. A stolen photo protects nothing. How do you keep a key safe for twenty years?"

**[CENA 1]** Three animated icons in a row: a flame, a drop of water, a clock labelled "years". Each one passes over the backup without destroying it.
**NARRAÇÃO:** We've reached the last lesson of the module, and the plan you're going to put together. The central idea is this: your backup has to survive three things. Fire, water, and your own forgetfulness. It may sound like an exaggerated list, but it's the list of problems most people report when they lose access. A good plan thinks about these three risks from the start, not when it's already too late.

**[CENA 2]** A metal plate slowly rotating, with the words engraved on it. Label: "Cryptotag Zeus, sold in the MTM shop".
**NARRAÇÃO:** Paper is cheap and good for getting started. But paper degrades with damp, with time, with a spilled coffee. That's why many people use metal plates, with the words engraved or stamped into them. One product sold in the MTM shop is the Cryptotag Zeus, a metal plate for recording your seed. It isn't the only method, and it isn't mandatory. It's a way to have a copy that doesn't wear out easily, and that already counts for a lot.

**[CENA 3]** A four-step plan appearing on a board: "1. how many copies", "2. where", "3. who knows", "4. test".
**NARRAÇÃO:** Let's build the plan in four steps. First, decide how many copies you want. Two is the reasonable minimum. One copy means that if it's lost, you lose everything. And if the paper copy and the metal copy are in the same place, you aren't making two copies. You're making one, twice. More than three complicates management and increases exposure. For most people, two well-kept copies are the right balance between security and simplicity.

**[CENA 4]** A simple map of a house and an outside location, with two copies marked in different spots. A dotted arrow links the two places.
**NARRAÇÃO:** Second, choose different locations. If both copies are in the same drawer, a fire or a burglary takes both. Think about home, and a trusted place outside it, with safe and discreet access. The goal isn't to hide them, it's to spread the risk. A copy that survives a problem at home is a copy that saves you.

**[CENA 5]** Two people on a screen with a padlock between them. The one on the left has a sealed envelope. The one on the right has nothing in their hand.
**NARRAÇÃO:** Third, decide who knows what. Nobody needs to know the phrase. It's enough for someone you trust to know that a plan exists, and where the copies are, in case something happens to you. That person doesn't need to have the words. If they do, they become one more point of failure, and one more place where the phrase can be copied without you knowing.

**[CENA 6]** A test screen: an empty wallet, a phrase being entered, and a green tick appearing when the wallet recovers successfully.
**NARRAÇÃO:** Fourth, test the recovery. This is the part almost nobody does, and it's the most important. With a zero or negligible amount, in an official app, try to recreate the wallet using only the written phrase. If you manage it, the copy works. If you don't, you've discovered the problem now, and not when you really need it. A failed test today is a cheap lesson. A test that reveals a failure ten years from now is a loss. Repeat the test whenever you change wallet or app, and at least once a year, because apps change and memory does too.

**[CENA 7]** Illustrative case: Inês with a metal plate in one hand and a folded sheet of paper in the other, on a wooden table.
**NARRAÇÃO:** Illustrative case: Inês engraved the phrase on a metal plate, kept a second paper copy in a relative's safe, and did the recovery test with a symbolic amount in a test wallet. It took an afternoon. For her, it was the most useful afternoon of the year as far as crypto goes. Not because she gained anything, but because she stopped depending on luck. Notice that the plan doesn't require anything technical. It requires method and discipline. Inês didn't have to become an expert. She had to have a plan and stick to it.

**[CENA 8]** Ruben closing a notebook, with the phrase "the key has to work before you use it for real" appearing in the corner.
**NARRAÇÃO:** The idea I want you to take from here is that the four steps have one common goal: for your key to keep existing when you're no longer paying attention to it. A key that only works in your head isn't a key. It's a hope. And hope isn't a security plan. Think of it as insurance: you don't like paying for it, but you never see it as wasted on the day you need it.

**Texto no ecrã:** two copies · different locations · who knows what · test the recovery
**Fecho / CTA da aula:** Final exercise for the module: write your plan in five lines. How many copies, where they are, who knows they exist, when you do the test, and what you do if the test fails. Keep this sheet with the module 3 checklist. Check question: if your paper copy were soaked today, what would you do to avoid losing access?

**Missão do módulo 4:** this week, do the recovery test with a zero or negligible amount, in an official app, and write down the result. If you couldn't recover, don't move on to module 5 until you've solved the problem. The key has to work before you use it for real.
