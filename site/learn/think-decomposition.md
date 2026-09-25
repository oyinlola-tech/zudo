---
title: "Breaking problems down — ZudoJS Academy"
description: "Split a problem as big as \"build a bank\" into pieces small enough to solve, order them by dependency, and build a money transfer from small, tested steps."
source: https://zudojs.oyinlola.site/learn/think-decomposition
---

LEVEL 1 · LESSON 6 OF 18

Think like a programmer Foundation

# Breaking problems down

Split a problem as big as "build a bank" into pieces small enough to solve, order them by dependency, and build a money transfer from small, tested steps.

- **40 min** to read and try
- **You need:** What programming is
- **You build:** A decomposition tree for a small bank, and a money transfer built and tested piece by piece

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Break a vague problem into pieces until each one is a single clear step
- Say when a piece is small enough to stop splitting
- Order pieces by what they depend on
- Compare top-down and bottom-up approaches and use both
- Build and test a feature piece by piece
- Spot pieces that are too big, overlapping or missing

## "Build us a banking app"

A savings cooperative in Ibadan has 800 members. Today they keep records in exercise books: who paid in, who took a loan, who owes what. The chairman asks you: "Can you build us a banking app?"

You know how to write a program that works out change. You do not know how to write "a banking app". Nobody does, in one go. If you sit down and try to type it from the first line to the last, you will not know where to begin, and whatever you write first will be tangled up with everything else.

Every programmer faces this, on every project. The way out is **decomposition**: breaking a big problem into smaller problems, then breaking those into smaller ones again, until every piece is so small and clear that you know exactly how to solve it. It was step 2 of [the problem-solving loop](https://zudojs.oyinlola.site/learn/think-programming#loop), where the laundry bill split into "count the pieces, price the shirts, price the trousers…". This lesson is about doing that for problems a thousand times bigger.

## The first split

Start by asking: "What are the main jobs this thing has to do?" For a bank, talk to the chairman and the members, and you get a list like this:

```ts
Banking application
 |
 +-- Users             who the members are
 +-- Authentication    proving who you are
 +-- Accounts          where money is kept
 +-- Deposits          putting money in
 +-- Withdrawals       taking money out
 +-- Transfers         moving money between accounts
 +-- Transactions      the record of every movement
 +-- Notifications     telling people what happened
```

This picture is a **decomposition tree**: the whole problem at the top, and its parts below it. Each part is still big, but each is already easier to think about than "a banking app". Here is what each one is responsible for:

| Piece | Its job, in one sentence | Example input | Example output |
| --- | --- | --- | --- |
| Users | Keep each member's name, phone number and status. | A new member's details | A saved member |
| Authentication | Check that a person is who they claim to be. | Phone number and PIN | "Yes, this is Ada" or "no" |
| Accounts | Keep each account's owner and balance. | An account number | Owner and balance |
| Deposits | Add money to an account. | Account, amount | New balance |
| Withdrawals | Take money out, if there is enough. | Account, amount | New balance or a refusal |
| Transfers | Move money from one account to another. | From, to, amount | Two new balances or a refusal |
| Transactions | Record every movement so it can be listed and checked later. | A movement that happened | A saved record; a statement |
| Notifications | Send an SMS or email when something happens. | Phone number, message | A sent SMS |

Notice that every piece got the same treatment you learned in [What programming is](https://zudojs.oyinlola.site/learn/think-programming#ipo): one job, an input and an output. That is not a coincidence. A good piece *is* a small program, with its own input, processing and output.

## Going deeper: a transfer

"Transfers" is still too big to write. So you split it again. Keep asking "what does this involve?" until the answer is a single clear step.

### Level 2

```ts
Transfer money from account A to account B
 |
 +-- Check the request
 +-- Move the money
 +-- Record the transfer
 +-- Tell both people
```

### Level 3

Each of those four is still a small collection of steps. One more split:

```ts
Check the request
 +-- Is the person logged in?
 +-- Does the person own account A?
 +-- Does account B exist?
 +-- Are A and B different accounts?
 +-- Is the amount more than 0?
 +-- Is A's balance at least the amount?

Move the money
 +-- Subtract the amount from A's balance
 +-- Add the amount to B's balance

Record the transfer
 +-- Save: from, to, amount, date and time

Tell both people
 +-- SMS to A's owner: "You sent ₦15,000 to ..."
 +-- SMS to B's owner: "You received ₦15,000 from ..."
```

Now every leaf is one clear step. "Is the amount more than 0?" is a single `if`. "Subtract the amount from A's balance" is one line of code. You could hand any leaf to a programmer who has never heard of the bank, and they could write it.

### When to stop splitting

A piece is small enough when you can answer yes to all three:

1. Can you describe it in one sentence without the word "and"?
2. Do you know exactly what goes in and what comes out?
3. Could you test it on its own, with a few inputs whose answers you know?

"Check the request" fails the first question: it checks the owner *and* the amount *and* the balance. "Is the amount more than 0?" passes all three. Going further than that ("compare the amount with 0, then decide") adds nothing, so you stop.

REASON IT OUT

### What can go wrong in the middle of a transfer?

Look at the level 3 tree for a transfer. Before any code, think about these:

1. "Move the money" is two steps. What happens if the power fails, or the program crashes, after the first step and before the second?
2. A member taps "Send" and the network is slow, so they tap it again. The request arrives twice. What happens?
3. The SMS provider is down. Should the transfer fail?
4. Which of the checks could be true when you check it, but false a moment later?

**Show the reasoning**

1. ₦15,000 leaves account A and never reaches B. The money has vanished. The two steps must happen *together or not at all*. Databases have a feature for exactly this, called a **transaction**, which you will use in the database lessons. For now, the decomposition has taught you something important: those two leaves are not independent, and the plan must say so.
2. Without protection, ₦30,000 moves instead of ₦15,000. Real systems give every transfer request a unique reference number, and refuse a second request with the same reference. That is a new leaf the first tree forgot: "Is this a request we have already done?"
3. No. The money has already moved correctly; a failed SMS should not undo it. Notification is a separate piece that can be retried later. This is a design decision the tree makes visible: some pieces are essential, others are "best effort".
4. The balance. If two transfers from the same account are checked at the same moment, both can see ₦50,000, both can pass, and together they spend more than is there. Again, database transactions and locks solve this later. Spotting it now, on paper, is what decomposition is for.

## From pieces to code

Here is the transfer written straight from the tree. Every piece is a block marked with a comment, in the same order as the tree. Two small new tools: `===` means "is equal to" and `!==` means "is not equal to". Both work on text as well as numbers.

transfer.js

```ts
// Input
const loggedInUser = "ada";
const fromOwner = "ada";
let fromBalance = 50000;
let toBalance = 12000;
const amount = 15000;

// Piece 1: check the request
let problem = "none";
if (loggedInUser !== fromOwner) {
  problem = "you do not own this account";
} else if (amount <= 0) {
  problem = "the amount must be more than 0";
} else if (amount > fromBalance) {
  problem = "not enough money";
}

// Piece 2: move the money, only if the check passed
if (problem === "none") {
  fromBalance = fromBalance - amount;
  toBalance = toBalance + amount;
}

// Pieces 3 and 4: record and tell (here, print)
if (problem === "none") {
  console.log("Transfer of ₦" + amount + " done");
  console.log("A now has ₦" + fromBalance);
  console.log("B now has ₦" + toBalance);
} else {
  console.log("Refused:", problem);
}
```

Output of `node transfer.js` and of the browser terminal

```ts
Transfer of ₦15000 done
A now has ₦35000
B now has ₦27000
```

- `problem` starts as `"none"`. Each check can replace it with the reason for refusing. Because of `else if`, only the first failed check is reported.
- Piece 2 only runs when every check passed. The move never happens after a failed check.
- The two `let` balances change; everything else stays fixed.

Change one input and a different piece decides the outcome. Here Tunde is logged in and tries to send from Ada's account:

transfer-refused.js

```ts
const loggedInUser = "tunde";
const fromOwner = "ada";
let fromBalance = 50000;
const amount = 15000;

let problem = "none";
if (loggedInUser !== fromOwner) {
  problem = "you do not own this account";
} else if (amount <= 0) {
  problem = "the amount must be more than 0";
} else if (amount > fromBalance) {
  problem = "not enough money";
}

console.log("Problem:", problem);
console.log("Ada still has ₦" + fromBalance);
```

Output of `node transfer-refused.js` and of the browser terminal

```ts
Problem: you do not own this account
Ada still has ₦50000
```

The ownership check comes first on purpose. If the balance check came first, Tunde could learn whether Ada has more than ₦15,000 just from the message he gets back. Deciding the *order* of the leaves is part of the design, not a detail.

The "tell both people" piece is a small program of its own. Its input is a few values from the transfer; its output is the text of two messages. It does not need to know how the checks or the move work:

notify.js

```ts
const amount = 15000;
const fromName = "Ada";
const toName = "Bola";
const reference = "TX-1042";

console.log("To " + fromName + ": You sent ₦" + amount + " to " + toName + ". Ref " + reference);
console.log("To " + toName + ": You received ₦" + amount + " from " + fromName + ". Ref " + reference);
```

Output of `node notify.js` and of the browser terminal

```ts
To Ada: You sent ₦15000 to Bola. Ref TX-1042
To Bola: You received ₦15000 from Ada. Ref TX-1042
```

Because it only needs four values, you can check the wording of every message without moving a single naira.

> NOTE
>
> In the JavaScript course you will learn [functions](https://zudojs.oyinlola.site/learn/js-functions), which let you give each piece a name, like `checkTransfer`, and reuse it. The thinking is the same as the comments here: one named piece per leaf.

## Top-down and bottom-up

What you did so far is **top-down** design: start from the whole problem and split it, level by level, until you reach steps you can write. It is the best way to *understand* a problem and to make sure nothing is forgotten.

The opposite is **bottom-up**: start from small, useful pieces you are sure you will need, build them, test them, and then combine them into bigger features. It is often the best way to *build*, because every piece you combine already works.

Here is a bottom-up piece every transfer needs: the transfer fee. Nigerian banks charge a small fee for transfers to other banks: ₦10 up to ₦5,000, ₦25 up to ₦50,000, and ₦50 above that. You can build and test this piece before any transfer code exists.

To test it on several amounts in one run, this example uses a **list**: values between square brackets, separated by commas. `for (const amount of [ … ])` runs the block once for each value in the list, with `amount` set to that value.

fee.js

```ts
for (const amount of [100, 5000, 5001, 50000, 50001]) {
  let fee = 50;
  if (amount <= 5000) {
    fee = 10;
  } else if (amount <= 50000) {
    fee = 25;
  }
  console.log("₦" + amount, "-> fee ₦" + fee);
}
```

Output of `node fee.js` and of the browser terminal

```ts
₦100 -> fee ₦10
₦5000 -> fee ₦10
₦5001 -> fee ₦25
₦50000 -> fee ₦25
₦50001 -> fee ₦50
```

The test amounts are the boundaries, on and just above each one, as in the laundry tests of [What programming is](https://zudojs.oyinlola.site/learn/think-programming#loop). The piece is correct, so now it can be plugged into the transfer: the check becomes "is the balance at least the amount *plus the fee*?"

transfer-with-fee.js

```ts
let balance = 20000;
const amount = 19990;

// the fee piece, already tested
let fee = 50;
if (amount <= 5000) {
  fee = 10;
} else if (amount <= 50000) {
  fee = 25;
}

// the check piece, now using the fee
if (amount + fee > balance) {
  console.log("Refused: you need ₦" + (amount + fee) + " but have ₦" + balance);
} else {
  balance = balance - amount - fee;
  console.log("Sent. Balance: ₦" + balance);
}
```

Output of `node transfer-with-fee.js` and of the browser terminal

```ts
Refused: you need ₦20015 but have ₦20000
```

Adding the fee piece changed another piece: the balance check. Pieces are not always as separate as the tree makes them look. You will see why in the next section.

|  | Top-down | Bottom-up |
| --- | --- | --- |
| Starts from | The whole problem | Small pieces you know you need |
| Good at | Understanding the problem; nothing forgotten | Working, tested parts early; reuse |
| Risk | A beautiful plan with nothing working for a long time | Well-made parts that do not fit together, or that nobody needed |

Real teams use both: **design top-down, build bottom-up**. Draw the tree from the top so you know every piece and how they connect, then build and test the leaves first and combine them upwards.

## Dependencies between pieces

A piece **depends on** another piece when it cannot work without it. A transfer needs accounts to move money between. Accounts need users to own them. Notifications need users' phone numbers. Writing these down gives you a second picture, next to the tree:

```ts
Piece            needs
---------------  ------------------------------
Users            (nothing)
Authentication   Users
Accounts         Users
Deposits         Accounts, Transactions
Withdrawals      Accounts, Authentication, Transactions
Transfers        Accounts, Authentication, Transactions
Transactions     Accounts
Notifications    Users
```

This table answers practical questions:

- **What to build first.** Build a piece only after the pieces it needs. Users need nothing, so they come first. Transfers need the most, so they come late.
- **What can be built at the same time.** Notifications only need Users. One person can build notifications while another builds accounts.
- **What breaks when something changes.** If the Accounts piece changes how it stores balances, every piece that needs Accounts must be checked again. The fewer things a piece needs, the safer it is to change.

The last point is why good pieces need as little as possible from each other. The notifications piece needs a phone number and a message, nothing else. It does not need to know what a transfer is. So when the cooperative switches to a cheaper SMS company, only the notifications piece changes, and no transfer code is touched.

> Circles are a warning sign
>
> If piece A needs B, and B needs A, neither can be built or tested first. That usually means the split is in the wrong place: some part of A and some part of B belong together in a piece of their own.

REASON IT OUT

### In what order would you build the bank?

Using the "needs" table, choose an order to build the eight pieces so that nothing is built before the pieces it needs. Is there more than one correct order? Which pieces could two people build at the same time?

**Show the reasoning**

One correct order: Users, Authentication, Accounts, Transactions, Deposits, Withdrawals, Transfers, Notifications. Check each: Authentication needs Users (built); Transactions needs Accounts (built); Deposits needs Accounts and Transactions (both built), and so on.

There are many correct orders. Notifications only needs Users, so it can come second, or last, or anywhere in between. Authentication and Accounts both need only Users, so two people can build them at the same time. Deposits, Withdrawals and Transfers can also be built in parallel once their needs are done.

What is *never* correct is building Transfers before Accounts. You would have nothing to transfer between, and you would end up inventing a fake version of accounts inside the transfer code, which then disagrees with the real one.

## When decomposition goes wrong

Decomposition can be done badly. These are the mistakes to look for in any plan, including your own.

### Pieces that are too big

"Handle money" as one piece, containing deposits, withdrawals, transfers and fees, is too big to test and too big to hand to one person. The sign: its one-sentence description needs several "and"s.

### Pieces that overlap

Withdrawals and transfers both need "is there enough money?". If each piece writes that check itself, the two copies drift apart. Here the withdrawal copy allows emptying the account and the transfer copy does not:

overlap.js

```ts
const balance = 20000;
const amount = 20000;

// the check, as written in the withdrawal piece
if (amount <= balance) {
  console.log("Withdrawal: allowed");
} else {
  console.log("Withdrawal: refused");
}

// the same check, written again in the transfer piece
if (amount < balance) {
  console.log("Transfer: allowed");
} else {
  console.log("Transfer: refused");
}
```

Output of `node overlap.js` and of the browser terminal

```ts
Withdrawal: allowed
Transfer: refused
```

A member can take all ₦20,000 out in cash but cannot send it to their sister. Both copies look reasonable on their own; the bug only exists because the same rule lives in two places. The fix is decomposition again: make "has enough money" its own piece, in one place, and let both withdrawals and transfers use it.

### Missing pieces

The first transfer tree had no leaf for "have we already done this request?", and nothing for "what if the SMS fails?". Missing pieces are found by asking the reasoning questions you asked above: what can arrive twice, what can fail halfway, what happens when a part we depend on is down.

Here is the missing leaf for requests that arrive twice. Each request carries a reference number; the piece remembers the last reference it handled and refuses a repeat. The list plays the part of two requests arriving from a member who tapped "Send" twice:

duplicate.js

```ts
let balance = 50000;
let lastReference = "";

for (const reference of ["TX-1042", "TX-1042"]) {
  if (reference === lastReference) {
    console.log("Already done:", reference);
  } else {
    balance = balance - 15000;
    lastReference = reference;
    console.log("Sent ₦15000. Balance:", balance);
  }
}
```

Output of `node duplicate.js` and of the browser terminal

```ts
Sent ₦15000. Balance: 35000
Already done: TX-1042
```

A real bank stores every reference it has handled, not only the last one, but the idea is the same. Without this leaf, the second tap would have sent another ₦15,000.

### Splitting along the wrong line

It is tempting to split by screen: "the home page", "the send money page". But the rule "you can only send from your own account" must hold whether the request comes from the phone app, the website or a bank officer's computer. Split by *job* (checking, moving, recording, telling), and the screens become thin layers on top of the same pieces.

## Testing piece by piece

Small pieces are the reason testing is possible at all. You could never test "the banking app" in one go; there are too many combinations. But you can test "is the amount more than 0?" completely with a handful of values.

Here is the check piece of the transfer, run on a list of amounts chosen from its boundaries: 0, the smallest valid amount, the exact balance, and one more than the balance.

check-test.js

```ts
const fromBalance = 50000;

for (const amount of [0, 1, 50000, 50001]) {
  let problem = "none";
  if (amount <= 0) {
    problem = "the amount must be more than 0";
  } else if (amount > fromBalance) {
    problem = "not enough money";
  }
  console.log(amount, "->", problem);
}
```

Output of `node check-test.js` and of the browser terminal

```ts
0 -> the amount must be more than 0
1 -> none
50000 -> none
50001 -> not enough money
```

Write what you expect for each amount before you run it, then compare. Once each piece passes on its own, you test the joins: does the check really stop the move? Does a refused transfer leave both balances unchanged? Those tests, of pieces working together, are called **integration tests**. The tests of one piece alone are **unit tests**. You will write both with a real test runner in [Testing fundamentals](https://zudojs.oyinlola.site/learn/testing-basics).

Here is an integration test of the check and the move together. For each amount it runs both pieces, then checks something that must always be true: the money in the two accounts adds up to the same total as before. A transfer moves money; it never creates or destroys it.

join-test.js

```ts
for (const amount of [15000, 60000]) {
  let fromBalance = 50000;
  let toBalance = 12000;
  const before = fromBalance + toBalance;

  let problem = "none";
  if (amount <= 0) {
    problem = "the amount must be more than 0";
  } else if (amount > fromBalance) {
    problem = "not enough money";
  }
  if (problem === "none") {
    fromBalance = fromBalance - amount;
    toBalance = toBalance + amount;
  }

  const after = fromBalance + toBalance;
  console.log("₦" + amount, problem, "| A:", fromBalance, "B:", toBalance, "| total kept:", before === after);
}
```

Output of `node join-test.js` and of the browser terminal

```ts
₦15000 none | A: 35000 B: 27000 | total kept: true
₦60000 not enough money | A: 50000 B: 12000 | total kept: true
```

The refused transfer left both balances exactly as they were, and in both runs the total stayed ₦62,000. `before === after` gives `true` or `false`, so the test reports its own verdict. A rule like "the total never changes", which must hold after every step, is called an **invariant**; [Reasoning about programs](https://zudojs.oyinlola.site/learn/think-reasoning) uses them a lot.

## Decomposition in real systems

In a real company, the first level of the tree often becomes separate teams: one team owns payments, another owns notifications. The line between two pieces becomes an agreement between teams: "send us a phone number and a message; we send the SMS". That agreement is called an **interface**. Teams can change anything inside their piece as long as they keep the interface the same.

Frameworks are decomposed the same way. ZudoJS, the framework this course ends with, is a set of separate packages: one for authentication, one for permissions, one for transactions, one for messaging, and so on. Each does one job and says clearly what it needs from the others. When you reach it, you will recognise the tree you drew in this lesson.

The production lesson from all this: most serious failures in big systems happen at the joins, not inside the pieces. A payment succeeds but the record is not saved; an SMS is sent for a transfer that was then cancelled. When you plan, spend as much time on the arrows between pieces as on the pieces themselves.

## Practice

TRY IT YOURSELF

### Decompose a food ordering app

A restaurant in Enugu wants customers to order jollof rice and other meals from their phones for delivery. Write the first level of the decomposition tree. Then break "place an order" down until every leaf is one clear step.

**Show a solution**

```ts
Food ordering app
 +-- Customers        sign up, addresses, phone numbers
 +-- Menu             meals, prices, what is available today
 +-- Cart             meals the customer has chosen
 +-- Orders           placing and tracking orders
 +-- Payments         taking the money
 +-- Kitchen          what the cooks see
 +-- Delivery         riders and addresses
 +-- Notifications    "your food is on the way"

Place an order
 +-- Check the order
 |    +-- Is the cart not empty?
 |    +-- Is every meal still available today?
 |    +-- Is the address inside the delivery area?
 +-- Work out the price
 |    +-- Add up price x quantity for each meal
 |    +-- Add the delivery fee
 +-- Take the payment
 +-- Save the order with status "received"
 +-- Send the order to the kitchen
 +-- Tell the customer the order number
```

Your tree may differ; there is no single right answer. Check it with the three questions: can each leaf be said in one sentence without "and", do you know its input and output, and could you test it alone? Also ask the reasoning questions: what if payment succeeds but saving the order fails?

TRY IT YOURSELF

### Order the pieces

A school results portal has these pieces. Say what each one needs, then give an order to build them: Students, Subjects, Scores (a student's score in a subject), Report cards (all of one student's scores, with an average), Parent SMS (sends a report card summary to a parent's phone), Parents (a parent's name and phone, linked to a student).

**Show a solution**

```ts
Piece          needs
Students       (nothing)
Subjects       (nothing)
Parents        Students
Scores         Students, Subjects
Report cards   Scores
Parent SMS     Parents, Report cards
```

One order: Students, Subjects, Parents, Scores, Report cards, Parent SMS. Students and Subjects need nothing, so two people can start them at the same time. Parent SMS needs the most, so it comes last.

TRY IT YOURSELF

### Build the daily limit piece

The cooperative adds a rule: a member may send at most ₦100,000 in total per day. Build this as a piece on its own. Its inputs are how much the member has already sent today and the new amount; its output is `allowed` or `over the daily limit`. Test it with ₦80,000 already sent and new amounts of ₦19,999, ₦20,000 and ₦20,001. Decide the expected answers first.

**Show a solution**

Expected: ₦80,000 + ₦19,999 is below the limit, allowed. ₦80,000 + ₦20,000 is exactly ₦100,000, which "at most" allows. ₦80,000 + ₦20,001 is over.

daily-limit.js

```ts
const dailyLimit = 100000;
const sentToday = 80000;

for (const amount of [19999, 20000, 20001]) {
  let result = "allowed";
  if (sentToday + amount > dailyLimit) {
    result = "over the daily limit";
  }
  console.log("₦" + amount, "->", result);
}
```

Output of `node daily-limit.js` and of the browser terminal

```ts
₦19999 -> allowed
₦20000 -> allowed
₦20001 -> over the daily limit
```

This piece does not know about balances, fees or SMS. It needs two numbers and gives one answer, so it is easy to test and easy to change if the limit changes. In the transfer, it becomes one more leaf under "Check the request".

## Recap

- Decomposition breaks a big problem into smaller ones, and those into smaller ones, until every piece is one clear step.
- Stop splitting when a piece can be said in one sentence without "and", has a known input and output, and can be tested alone.
- Top-down design finds all the pieces; bottom-up building gives you working, tested pieces early. Design top-down, build bottom-up.
- Pieces depend on each other. Build a piece after the pieces it needs; pieces with the same needs can be built in parallel; the fewer needs a piece has, the safer it is to change.
- Watch for pieces that are too big, that overlap (the same rule in two places), that are missing, or that are split by screen instead of by job.
- Small pieces can be unit-tested one by one; integration tests check the joins, where most real failures happen.

Next: [Algorithms](https://zudojs.oyinlola.site/learn/think-algorithms), the step-by-step methods inside each piece, and the handful of patterns (searching, counting, filtering, sorting) that most pieces are made of.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
