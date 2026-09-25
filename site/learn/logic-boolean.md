---
title: "Boolean logic — ZudoJS Academy"
description: "Reduce program decisions to true and false, combine them with AND, OR, NOT and XOR, and let a loop build truth tables that check every case for you."
source: https://zudojs.oyinlola.site/learn/logic-boolean
---

LEVEL 1 · LESSON 10 OF 18

Logic and mathematical thinking Foundation

# Boolean logic

Reduce program decisions to true and false, combine them with AND, OR, NOT and XOR, and let a loop build truth tables that check every case for you.

- **40 min** to read and try
- **You need:** Reasoning about programs, and the JavaScript used so far in this course (console.log, variables, if, simple loops)
- **You build:** A truth-table printer that checks a bank's withdrawal rule and an access rule in every possible case

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain what a boolean value and a proposition are, and name booleans so they read as questions
- Combine conditions with AND, OR, NOT and XOR, in words and in JavaScript
- Write the truth table of any rule with a few inputs, and know it has 2 to the power n rows
- Generate truth tables with nested loops and use them to test a rule in every case
- Avoid the precedence, truthy-value and missing-value traps that break real conditions

## A locked account that could still withdraw

A small bank has a rule for its cash machines, written by the business team:

A customer may withdraw money if the account is active *and* is not locked.

A developer turns it into code. Months later, a customer whose account was locked for fraud walks up to a machine and takes out ₦50,000. The code looked reasonable at a glance:

locked-bug.js

```ts
const isActive = true;
const isLocked = true;     // this account was locked for fraud

if (isActive || !isLocked) {
  console.log("Withdrawal allowed");
} else {
  console.log("Withdrawal refused");
}
```

Output of `node locked-bug.js` and of the browser terminal

```ts
Withdrawal allowed
```

The rule said **and**; the code said **or** (that is what `||` means). With *or*, being active was enough, so the lock was ignored. Nobody noticed because every test account was either fully fine or fully closed, and for those two cases *and* and *or* happen to give the same answer.

This lesson is about the small piece of mathematics that would have caught this bug in a minute: **boolean logic**. It has only two values and four operations, and it describes every decision a program makes. You will learn to say rules precisely, to translate them into JavaScript, and to check a rule in *every* possible situation with a **truth table**, instead of the two or three situations you happened to think of.

In [Reasoning about programs](https://zudojs.oyinlola.site/learn/think-reasoning) you asked "what conditions must be true?" and "what if one is false?". Boolean logic is the tool that answers those questions exactly.

## True, false and propositions

A **proposition** is a statement that is either true or false, with nothing in between:

- "The account is active." (true or false)
- "The balance is at least ₦5,000." (true or false)
- "The customer is 18 or older." (true or false)

"How much money is in the account?" is not a proposition: it is a question with a number as its answer. "Withdraw ₦5,000" is not one either: it is an instruction. Programs decide things by turning questions into propositions: "is the balance at least the amount?" has a yes/no answer even though the balance itself is a number.

In JavaScript, the answer to a proposition is a **boolean**: one of the two values `true` and `false`. The name comes from George Boole, a nineteenth-century mathematician who wrote down the rules for calculating with true and false. You can write a boolean directly, or get one from a **comparison**:

comparisons.js

```ts
const balance = 12000;
const amount = 5000;
const age = 17;
const status = "active";

console.log(balance >= amount);   // at least?
console.log(age >= 18);
console.log(status === "active"); // exactly equal?
console.log(status !== "closed"); // not equal?
console.log(typeof true);
```

Output of `node comparisons.js` and of the browser terminal

```ts
true
false
true
true
boolean
```

The comparison operators are `>`, `>=`, `<`, `<=`, `===` (equal) and `!==` (not equal). Each one produces a boolean. `typeof` tells you the type of a value.

### Name booleans as questions

Store the answer to each proposition in a variable whose name reads as a yes/no question: `isActive`, `isLocked`, `hasEnoughMoney`, `canWithdraw`. Then a condition reads like the rule it came from:

named.js

```ts
const balance = 12000;
const amount = 5000;
const status = "active";

const isActive = status === "active";
const hasEnoughMoney = balance >= amount;

console.log("isActive:", isActive);
console.log("hasEnoughMoney:", hasEnoughMoney);
```

Output of `node named.js` and of the browser terminal

```ts
isActive: true
hasEnoughMoney: true
```

Each of these is an **atomic** proposition: it cannot be split into smaller true/false parts. Real rules combine several of them with the four operations below.

## NOT: turning a proposition around

**NOT** flips a boolean: NOT true is false, NOT false is true. In JavaScript it is written `!` in front of the value. "The account is not locked" is `!isLocked`.

A **truth table** lists every possible input and the result for each one. NOT has one input, so it has two rows:

| a | NOT a (`!a`) |
| --- | --- |
| false | true |
| true | false |

not.js

```ts
const isLocked = false;

console.log(!isLocked);    // "not locked"
console.log(!true, !false);
console.log(!!isLocked);   // two NOTs cancel out
```

Output of `node not.js` and of the browser terminal

```ts
true
false true
false
```

Two NOTs give back the original value. That is the **double negation** law: NOT (NOT a) is a. It sounds obvious, but it is how you simplify a sentence like "it is not true that the account is not active".

> TIP
>
> Prefer positive names. `isActive` is easier to reason about than `isNotInactive`; `!isNotInactive` needs two flips in your head before you know what it means.

## AND: every part must be true

**AND** combines two propositions and is true only when *both* are true. In JavaScript it is `&&`. "The account is active and has enough money" is `isActive && hasEnoughMoney`.

AND has two inputs. Each can be false or true, so there are 2 × 2 = 4 rows:

| a | b | a AND b (`a && b`) |
| --- | --- | --- |
| false | false | false |
| false | true | false |
| true | false | false |
| true | true | **true** |

Only one row out of four is true. AND is **strict**: every added condition makes the rule harder to satisfy. That is exactly what you want for permission to do something risky, like moving money.

and.js

```ts
const balance = 12000;
const amount = 15000;
const isActive = true;
const hasEnoughMoney = balance >= amount;

console.log(isActive && hasEnoughMoney);   // active, but not enough money
console.log(isActive && balance >= 5000);  // a comparison can sit inside
console.log(true && true && false);        // one false spoils everything
```

Output of `node and.js` and of the browser terminal

```ts
false
true
false
```

AND works with more than two parts: `a && b && c` is true only when all three are true. A chain of ANDs is a checklist; one unticked box and the answer is no.

## OR: at least one part must be true

**OR** is true when *at least one* of its inputs is true, including when both are. In JavaScript it is `||` (two vertical bars, usually typed with Shift and the backslash key). An online shop lets a user edit an order if they are an admin *or* they placed the order themselves: `isAdmin || isOwner`.

| a | b | a OR b (`a \|\| b`) |
| --- | --- | --- |
| false | false | false |
| false | true | **true** |
| true | false | **true** |
| true | true | **true** |

Three rows out of four are true. OR is **generous**: every added condition is one more way in. That is what you want for "reasons to allow something", and dangerous when the rule really needed AND, as in the cash machine bug.

or.js

```ts
const isAdmin = false;
const isOwner = true;

console.log(isAdmin || isOwner);      // one is enough
console.log(false || false || true);  // any true wins
console.log(true || true);            // both true: still true
```

Output of `node or.js` and of the browser terminal

```ts
true
true
true
```

> Everyday "or" is ambiguous
>
> In everyday speech "or" sometimes means "one or the other, not both": "you get a free drink or a free dessert". Logical OR, and `||`, always includes the case where both are true. When you read a rule written by a person, ask which one they meant. If they meant "not both", you need XOR.

## XOR: exactly one

**XOR**, short for **exclusive or**, is true when exactly one input is true: one or the other, but not both and not neither.

| a | b | a XOR b (`a !== b`) |
| --- | --- | --- |
| false | false | false |
| false | true | **true** |
| true | false | **true** |
| true | true | false |

Look at the table again: XOR is true exactly when the two inputs are *different*. JavaScript has no special XOR operator for booleans, but "different" is something it can already say: `a !== b`.

A checkout form offers two ways to pay, card or bank transfer. The order is valid only if the customer picked exactly one. Picking none is a mistake, and so is picking both (you would charge them twice):

xor.js

```ts
const payByCard = true;
const payByTransfer = true;

console.log(payByCard !== payByTransfer);   // both picked: invalid
console.log(payByCard || payByTransfer);    // OR would have accepted it
console.log(true !== false, false !== false);
```

Output of `node xor.js` and of the browser terminal

```ts
false
true
true false
```

> The ^ operator is not boolean XOR
>
> JavaScript does have a `^` operator, but it works on the bits of numbers and returns a number: `true ^ false` is `1`, not `true`. Use `a !== b` on booleans. It only works when both sides really are booleans; the section on [traps](#traps) shows why.

## Combining operators, and why parentheses matter

Real rules mix operators. An order can be edited by an admin, or by its owner as long as the order has not shipped yet. Written with parentheses, the meaning is clear:

```ts
isAdmin || (isOwner && !hasShipped)
```

Without parentheses, JavaScript decides the grouping by **precedence**, a fixed order of which operator binds first, like multiplication before addition in arithmetic:

1. `!` first (it sticks to the value right after it),
2. then `&&`,
3. then `||` last.

So `a || b && c` means `a || (b && c)`, never `(a || b) && c`. The two groupings give different answers:

precedence.js

```ts
const isAdmin = true;
const isOwner = false;
const hasShipped = true;

console.log(isAdmin || isOwner && !hasShipped);     // read as: isAdmin || (isOwner && !hasShipped)
console.log((isAdmin || isOwner) && !hasShipped);   // a different rule
```

Output of `node precedence.js` and of the browser terminal

```ts
true
false
```

The first says "admins can always edit". The second says "nobody can edit a shipped order, not even an admin". Both are sensible business rules, and they are different rules. The code must say which one the business asked for, and parentheses are how you say it.

> TIP
>
> Whenever you mix `&&` and `||` in one expression, add parentheses even where precedence would give the same result. They cost nothing and remove the question from every future reader's mind.

## Truth tables: checking every case

A rule with inputs that are each true or false has only a limited number of situations. With one input there are 2. With two there are 2 × 2 = 4. Each new input doubles the count, because every existing row appears once with the new input false and once with it true:

| Inputs | Rows |
| --- | --- |
| 1 | 2 |
| 2 | 4 |
| 3 | 8 |
| 4 | 16 |
| n | 2 × 2 × … × 2 (n times), written 2n |

For rules with up to four or five inputs, that is few enough to check every row. Checking every row is the difference between "I tried a few cases" and "I know it is right". Remember that the cash machine bug was hiding in the two rows nobody tried.

REASON IT OUT

### A cinema booking rule

A cinema app has this rule: *a customer can book a seat if the seat is free and, when the film is age-restricted, the customer is 18 or older.*

Before any code, think it through:

- Which atomic propositions does the rule depend on? Give each a boolean name.
- How many rows will its truth table have?
- In which rows should booking be allowed? Try to list them.
- "When the film is age-restricted, the customer is 18+" is not a plain AND or OR. How can you say it with the four operations?

**Show the reasoning**

There are three propositions: `seatFree`, `restricted` (the film is age-restricted) and `isAdult`. Three inputs give 23 = 8 rows.

The seat must be free in every allowed row, so the four rows with `seatFree` false are all "no". Of the four rows with a free seat, only one is a problem: restricted film and not an adult. So booking is allowed in 3 of the 8 rows.

"If the film is restricted, the customer must be an adult" fails only when the film *is* restricted and the customer is *not* an adult. It is true in every other case, so it can be written "the film is not restricted, or the customer is an adult": `!restricted || isAdult`. The whole rule is `seatFree && (!restricted || isAdult)`. The loop below checks that this expression really gives the 3 rows you predicted.

### Let a loop write the table

Writing tables by hand is slow and easy to get wrong. A loop can produce every row. The trick is a `for … of` loop over a short list, written in square brackets: `[false, true]`. A list like this is called an **array**; the loop runs once for each item in it, and the loop variable holds the current item. Put one loop inside another (a **nested** loop) and you get every combination:

two-inputs.js

```ts
for (const a of [false, true]) {
  for (const b of [false, true]) {
    console.log(a, b, "| AND:", a && b, "OR:", a || b, "XOR:", a !== b);
  }
}
```

Output of `node two-inputs.js` and of the browser terminal

```ts
false false | AND: false OR: false XOR: false
false true | AND: false OR: true XOR: true
true false | AND: false OR: true XOR: true
true true | AND: true OR: true XOR: false
```

The outer loop picks `a`; for each `a`, the inner loop tries both values of `b`. Two loops of two give four rows, in the same order as the tables above.

### Wrap the rule in a function

To test a rule, give it a name. A **function** is a named piece of code that takes inputs (its **parameters**, in parentheses) and gives back a result with `return`. You call it by writing its name followed by the inputs. [Functions](https://zudojs.oyinlola.site/learn/js-functions) get a full lesson later; this is all you need now:

cinema.js

```ts
function canBook(seatFree, restricted, isAdult) {
  return seatFree && (!restricted || isAdult);
}

const mark = (value) => (value ? "T" : "F");

let allowed = 0;
console.log("free restricted adult -> book");
for (const seatFree of [false, true]) {
  for (const restricted of [false, true]) {
    for (const isAdult of [false, true]) {
      const result = canBook(seatFree, restricted, isAdult);
      if (result) allowed = allowed + 1;
      console.log(`  ${mark(seatFree)}       ${mark(restricted)}        ${mark(isAdult)}   ->  ${mark(result)}`);
    }
  }
}
console.log(`allowed in ${allowed} of 8 rows`);
```

Output of `node cinema.js` and of the browser terminal

```ts
free restricted adult -> book
  F       F        F   ->  F
  F       F        T   ->  F
  F       T        F   ->  F
  F       T        T   ->  F
  T       F        F   ->  T
  T       F        T   ->  T
  T       T        F   ->  F
  T       T        T   ->  T
allowed in 3 of 8 rows
```

Four new pieces of JavaScript appeared:

- `const mark = (value) => (value ? "T" : "F");` is a very short function, written as an **arrow function**. It turns `true` into `"T"` and `false` into `"F"` so the table is easy to read.
- `condition ? x : y` is the **ternary operator**, a one-line `if`: it gives `x` when the condition is true and `y` otherwise.
- Text in backticks (`\`…\``) is a **template literal**: `${…}` inside it is replaced by the value of the expression.
- `if (result) allowed = allowed + 1;` has no braces. When an `if` controls a single statement, the braces can be left out; with two or more statements they are required.

The table confirms the reasoning: 3 of 8 rows allow a booking, and they are the rows you predicted.

## Testing a rule against its truth table

Printing a table is good for reading. For testing, you want the computer to *compare*: write the expected answer for every row from the business rule, run the code for every row, and report any row where they disagree.

Here is the cash machine rule tested this way. The expected column comes from the sentence "active and not locked", worked out by hand, before looking at any code. Both the buggy version and the fixed version are tested against it:

test-withdraw.js

```ts
function buggyCanWithdraw(isActive, isLocked) {
  return isActive || !isLocked;
}

function fixedCanWithdraw(isActive, isLocked) {
  return isActive && !isLocked;
}

// expected answers, row by row: [isActive, isLocked, expected]
const rows = [
  [false, false, false],
  [false, true, false],
  [true, false, true],
  [true, true, false],
];

for (const [isActive, isLocked, expected] of rows) {
  const buggy = buggyCanWithdraw(isActive, isLocked);
  const fixed = fixedCanWithdraw(isActive, isLocked);
  console.log(
    `active=${isActive} locked=${isLocked}`,
    buggy === expected ? "buggy ok  " : "buggy FAIL",
    fixed === expected ? "fixed ok" : "fixed FAIL",
  );
}
```

Output of `node test-withdraw.js` and of the browser terminal

```ts
active=false locked=false buggy FAIL fixed ok
active=false locked=true buggy ok   fixed ok
active=true locked=false buggy ok   fixed ok
active=true locked=true buggy FAIL fixed ok
```

`rows` is an array of arrays: each inner array is one row. `const [isActive, isLocked, expected] of rows` takes each row apart into three variables; this is called **destructuring**.

The buggy version fails two rows out of four: the active but locked account from the fraud case, and an inactive, unlocked account. A test on "fully fine" (active, unlocked) and "fully closed" (inactive, locked) accounts tried neither. A test that covers the whole truth table cannot miss a row.

> TIP
>
> This is the same idea test runners use, with nicer reporting. In [Testing fundamentals](https://zudojs.oyinlola.site/learn/testing-basics) you will write such tables with Vitest. For rules with more inputs than you can list, a tool can generate the rows for you, the way the nested loops did.

## A few laws you can check

Some combinations always simplify the same way, whatever the value of `a`. They are called **laws** of boolean algebra. You do not need to memorise a list; you need to know they exist, and that a two-row truth table proves each one.

| Expression | Always equals | In words |
| --- | --- | --- |
| `a && true` | `a` | adding a condition that always holds changes nothing |
| `a && false` | `false` | one impossible condition makes the whole AND impossible |
| `a \|\| false` | `a` | adding a way in that never works changes nothing |
| `a \|\| true` | `true` | one way in that always works opens the door to everyone |
| `a && !a` | `false` | something cannot be true and false at once |
| `a \|\| !a` | `true` | something is always true or false |
| `!!a` | `a` | double negation |

laws.js

```ts
let allHold = true;
for (const a of [false, true]) {
  const holds =
    (a && true) === a &&
    (a && false) === false &&
    (a || false) === a &&
    (a || true) === true &&
    (a && !a) === false &&
    (a || !a) === true &&
    !!a === a;
  console.log(`a=${a}: all laws hold? ${holds}`);
  if (!holds) allHold = false;
}
console.log("proved for every value of a:", allHold);
```

Output of `node laws.js` and of the browser terminal

```ts
a=false: all laws hold? true
a=true: all laws hold? true
proved for every value of a: true
```

These laws are useful as *bug detectors*. If you find `isAdmin || true` in a code review, the author meant something else: it lets everyone in. If a rule contains `isOpen && !isOpen`, it can never be true, so that code never runs. In the next lesson, [Conditional reasoning](https://zudojs.oyinlola.site/learn/logic-conditions), you will meet the two most useful laws of all, De Morgan's laws, and use them to simplify and invert real conditions.

## Traps in real code

### Values that are not booleans

In JavaScript, `&&` and `||` accept any value, not just booleans, and they return one of the *values* you gave them, not always `true` or `false`. Values that act like true are called **truthy**; values that act like false are called **falsy**. The falsy values you will meet are `false`, `0`, `""` (empty text), `null`, `undefined` and `NaN` (plus two rarer ones, `-0` and `0n`, covered in the JavaScript course). Everything else is truthy, including the text `"false"`. [Operators](https://zudojs.oyinlola.site/learn/js-operators#logical) covers this in depth; here is why it matters for logic:

truthy.js

```ts
const couponCode = "SAVE10";
const itemsInCart = 3;

console.log(itemsInCart && couponCode);   // "SAVE10", not true!
console.log(couponCode && 0);             // 0, not false!

const hasCoupon = couponCode !== "";
const hasItems = itemsInCart > 0;
console.log(hasCoupon !== hasItems);      // exactly one of them? no, both
console.log(couponCode !== itemsInCart);  // the same XOR on raw values
```

Output of `node truthy.js` and of the browser terminal

```ts
SAVE10
0
false
true
```

The first two lines show that `&&` handed back one of its values: a string and a number, not a boolean. The last two lines ask the same question, "is exactly one of coupon and items present?", and get opposite answers. On real booleans, `hasCoupon !== hasItems` is `false`, which is right: both are present. On the raw values, `"SAVE10" !== 3` only asks whether a string differs from a number, which is always `true`. Turn every input into a real boolean with a comparison first (`itemsInCart > 0`, `couponCode !== ""`), then do the logic. Boolean logic is only reliable on booleans.

### Missing values are not "false"

A boolean has two values, but real data often has a third state: *unknown*. A customer record loaded from a database might not have an `emailVerified` field at all. Reading it gives `undefined`, which is falsy, so the program quietly treats "we don't know" as "no":

unknown.js

```ts
const customer = { name: "Ada" };   // emailVerified is missing

console.log(customer.emailVerified);
console.log(!customer.emailVerified);            // "not verified"?
console.log(customer.emailVerified === true);    // explicit: only true counts
console.log(customer.emailVerified === undefined);
```

Output of `node unknown.js` and of the browser terminal

```ts
undefined
true
false
true
```

The braces `{ name: "Ada" }` make an **object**, a group of named values; `customer.name` reads one. Here, treating "unknown" as "not verified" might be fine (you ask the customer to verify again). Treating "unknown" as "not blocked" is not fine: a missing `isBlocked` would let a blocked user in. Decide deliberately which way a missing value should fall, and write it explicitly: `isBlocked !== false` refuses unless you are sure the user is not blocked.

### Boolean parameters nobody can read

A call like `transfer(5000, true, false)` is unreadable: which `true` means what? Name the booleans at the call site, as you did with `isActive`. Later lessons show how to pass an object of named options instead.

## Build: an access rule, checked in every case

A company's storage app decides who may delete a file. The rule from the product team:

A user may delete a file if their account is not suspended, and they either own the file or are an admin. Nobody may delete a file that is under legal hold.

Four propositions: `isSuspended`, `isOwner`, `isAdmin`, `onLegalHold`. That is 24 = 16 rows. The program writes the rule, generates all 16 rows with four nested loops, and counts and lists the rows where deletion is allowed:

can-delete.js

```ts
function canDelete(isSuspended, isOwner, isAdmin, onLegalHold) {
  return !isSuspended && (isOwner || isAdmin) && !onLegalHold;
}

const mark = (value) => (value ? "T" : "F");

let rows = 0;
let allowed = 0;
for (const isSuspended of [false, true]) {
  for (const isOwner of [false, true]) {
    for (const isAdmin of [false, true]) {
      for (const onLegalHold of [false, true]) {
        rows = rows + 1;
        if (canDelete(isSuspended, isOwner, isAdmin, onLegalHold)) {
          allowed = allowed + 1;
          console.log(`allowed: suspended=${mark(isSuspended)} owner=${mark(isOwner)} admin=${mark(isAdmin)} hold=${mark(onLegalHold)}`);
        }
      }
    }
  }
}
console.log(`${allowed} of ${rows} rows allow deletion`);
```

Output of `node can-delete.js` and of the browser terminal

```ts
allowed: suspended=F owner=F admin=T hold=F
allowed: suspended=F owner=T admin=F hold=F
allowed: suspended=F owner=T admin=T hold=F
3 of 16 rows allow deletion
```

Read the three allowed rows back as sentences: every one is not suspended, not on hold, and has at least one of owner or admin. That matches the rule. If the product team asks "can a suspended admin delete?", you can answer from the table in seconds: no, there is no allowed row with `suspended=T`.

Notice what the parentheses around `(isOwner || isAdmin)` do. Without them, precedence would read the rule as `(!isSuspended && isOwner) || (isAdmin && !onLegalHold)`, and a suspended admin could delete files. Exercise 3 asks you to measure how many rows that changes.

## Production concerns

- **Write the rule in words next to the code.** The business states rules in sentences; the code states them in operators. When they drift apart, the sentence is how a reviewer notices.
- **Keep inputs few.** A rule with 3 inputs has 8 cases; with 10 inputs it has 1,024. When a condition grows past four or five parts, split it into named pieces (`const canManageFile = isOwner || isAdmin;`), each small enough to check.
- **Test the whole table for security rules.** Permission checks, withdrawal rules and anything touching money deserve a test that covers every row, because attackers look for exactly the row you did not think of.
- **Decide how unknown values fall.** Missing data should fall to the safe side: refuse the withdrawal, hide the file, ask again.

## Practice

TRY IT YOURSELF

### Free delivery

A shop gives free delivery when the order total is at least ₦20,000 or the customer has a premium membership, but only for addresses in Lagos. Write `freeDelivery(bigOrder, isPremium, inLagos)`, print its truth table with nested loops, and count the rows where delivery is free.

**Show a solution**

free-delivery.js

```ts
function freeDelivery(bigOrder, isPremium, inLagos) {
  return (bigOrder || isPremium) && inLagos;
}

let free = 0;
for (const bigOrder of [false, true]) {
  for (const isPremium of [false, true]) {
    for (const inLagos of [false, true]) {
      const result = freeDelivery(bigOrder, isPremium, inLagos);
      if (result) free = free + 1;
      console.log(bigOrder, isPremium, inLagos, "->", result);
    }
  }
}
console.log("free in", free, "of 8 rows");
```

Output of `node free-delivery.js` and of the browser terminal

```ts
false false false -> false
false false true -> false
false true false -> false
false true true -> true
true false false -> false
true false true -> true
true true false -> false
true true true -> true
free in 3 of 8 rows
```

The parentheses matter: `bigOrder || isPremium && inLagos` would give free delivery to every big order, even outside Lagos. In a real shop, `bigOrder` would come from a comparison, `total >= 20000`.

TRY IT YOURSELF

### Exactly one payment method

Using the XOR idea, write `validPayment(card, transfer)` that is true only when exactly one method is chosen. Then extend it to three methods (card, transfer, wallet): still exactly one. Hint: count the true values.

**Show a solution**

one-method.js

```ts
function validPayment(card, transfer) {
  return card !== transfer;
}

function validPayment3(card, transfer, wallet) {
  let chosen = 0;
  if (card) chosen = chosen + 1;
  if (transfer) chosen = chosen + 1;
  if (wallet) chosen = chosen + 1;
  return chosen === 1;
}

console.log(validPayment(true, false), validPayment(true, true));
console.log(validPayment3(true, false, false));
console.log(validPayment3(true, true, true));
console.log(true !== true !== true);   // chaining XOR is NOT "exactly one"
```

Output of `node one-method.js` and of the browser terminal

```ts
true false
true
false
true
```

Chaining XOR across three values gives `true` when an *odd* number are true, so it accepts all three methods at once. "Exactly one of many" is a counting question, and counting is the reliable way to answer it. You will count many more things in [Counting](https://zudojs.oyinlola.site/learn/logic-counting).

TRY IT YOURSELF

### Measure a missing pair of parentheses

Write `careless` as the file-deletion rule without the parentheses: `!isSuspended && isOwner || isAdmin && !onLegalHold`. Loop over all 16 rows and print every row where it disagrees with `canDelete`.

**Show a solution**

careless.js

```ts
function canDelete(isSuspended, isOwner, isAdmin, onLegalHold) {
  return !isSuspended && (isOwner || isAdmin) && !onLegalHold;
}

function careless(isSuspended, isOwner, isAdmin, onLegalHold) {
  return !isSuspended && isOwner || isAdmin && !onLegalHold;
}

let differences = 0;
for (const isSuspended of [false, true]) {
  for (const isOwner of [false, true]) {
    for (const isAdmin of [false, true]) {
      for (const onLegalHold of [false, true]) {
        const right = canDelete(isSuspended, isOwner, isAdmin, onLegalHold);
        const wrong = careless(isSuspended, isOwner, isAdmin, onLegalHold);
        if (right !== wrong) {
          differences = differences + 1;
          console.log(`suspended=${isSuspended} owner=${isOwner} admin=${isAdmin} hold=${onLegalHold}: careless says ${wrong}`);
        }
      }
    }
  }
}
console.log(differences, "rows differ");
```

Output of `node careless.js` and of the browser terminal

```ts
suspended=false owner=true admin=false hold=true: careless says true
suspended=false owner=true admin=true hold=true: careless says true
suspended=true owner=false admin=true hold=false: careless says true
suspended=true owner=true admin=true hold=false: careless says true
4 rows differ
```

In every differing row the careless version says `true` where the rule says no: owners deleting files under legal hold, and suspended admins deleting files. Two missing parentheses, several security holes, and a 16-row loop finds them all.

## Recap

- A proposition is a statement that is true or false; a boolean stores its answer. Name booleans as questions: `isActive`, `hasEnoughMoney`.
- NOT (`!`) flips. AND (`&&`) needs every part true: strict. OR (`||`) needs at least one: generous, and includes "both". XOR (`a !== b` on booleans) means exactly one.
- `!` binds first, then `&&`, then `||`. Use parentheses whenever you mix `&&` and `||`.
- A rule with n boolean inputs has 2n cases. Nested `for … of [false, true]` loops generate them all, so you can print, count and test every one.
- Do logic on real booleans (make them with comparisons), and decide on purpose how missing values fall.

Next: [Conditional reasoning](https://zudojs.oyinlola.site/learn/logic-conditions), where you turn longer business rules into conditions, simplify and invert them with De Morgan's laws, and write guard clauses.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
