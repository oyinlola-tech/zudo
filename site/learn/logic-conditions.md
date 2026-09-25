---
title: "Conditional reasoning — ZudoJS Academy"
description: "Turn business rules into exact conditions, invert and simplify them safely with De Morgan's laws, and write guard clauses that explain every refusal."
source: https://zudojs.oyinlola.site/learn/logic-conditions
---

LEVEL 1 · LESSON 11 OF 18

Logic and mathematical thinking Foundation

# Conditional reasoning

Turn business rules into exact conditions, invert and simplify them safely with De Morgan's laws, and write guard clauses that explain every refusal.

- **45 min** to read and try
- **You need:** Boolean logic
- **You build:** A withdrawal checker that refuses with a precise reason, with its simplified conditions proved equivalent by a loop

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Translate a business rule written in English, including "unless", "only if" and "neither ... nor", into a condition
- Invert a condition correctly with De Morgan's laws, including comparisons such as >=
- Simplify a condition and prove the simplified version equivalent with a loop
- Rewrite an AND-rule as guard clauses that each return a specific reason
- Spot the classic condition bugs: always-true ORs, wrong negations and misplaced NOTs

## "Why was my withdrawal refused?"

The bank from [Boolean logic](https://zudojs.oyinlola.site/learn/logic-boolean) has fixed its cash machine. The rule is now written carefully:

A customer may withdraw an amount only if the account is active, the account is not locked, the balance covers the amount, and the amount does not exceed what is left of today's limit.

The code matches the rule exactly:

rule.js

```ts
const account = { active: true, locked: false, balance: 40000, withdrawnToday: 90000 };
const dailyLimit = 100000;
const amount = 20000;

const allowed =
  account.active &&
  !account.locked &&
  account.balance >= amount &&
  account.withdrawnToday + amount <= dailyLimit;

console.log(allowed);
```

Output of `node rule.js` and of the browser terminal

```ts
false
```

The braces make an **object**: a group of named values, called **properties**. `account.balance` reads the `balance` property. You will study objects in [Objects and JSON](https://zudojs.oyinlola.site/learn/js-data), in the JavaScript course.

The answer is correct, and useless to the customer. The machine says "refused", the customer phones the bank, and the support agent has to work out which of the four parts failed. Here the balance is fine; the daily limit is the problem (₦90,000 already taken, ₦20,000 more would pass ₦100,000).

To tell the customer *why*, the program must reason about the **opposite** of the rule: "when is a withdrawal refused, and for which reason?" Getting the opposite of a condition right is surprisingly hard, and it is where many real bugs live. This lesson gives you the tools: translating rules precisely, De Morgan's laws for inverting them, simplification you can prove, and guard clauses that turn an inverted rule into clear code.

## From sentences to conditions

Business rules arrive as sentences. Before you write any code, split the sentence into atomic propositions (true/false statements, as in [Boolean logic](https://zudojs.oyinlola.site/learn/logic-boolean#propositions)), then find the words that join them. Some joining words map directly onto operators; others need care:

| Words in the rule | Logic | Example |
| --- | --- | --- |
| A and B; A, B and C; both A and B | `a && b` | active and not locked |
| A or B; at least one of | `a \|\| b` | admin or owner |
| not A; A is false; no A | `!a` | not locked |
| A but B | `a && b` | free delivery, but only in Lagos |
| neither A nor B | `!a && !b` | neither suspended nor banned |
| A unless B | `a && !b` | ship today unless it is a holiday |
| A only if B | A needs B: `if (!b)` then no A | withdraw only if active |
| either A or B (but not both) | `a !== b` | card or transfer, not both |

"But" sounds like a contrast, yet logically it is just AND. "Unless" means "if not": "ship today unless it is a holiday" is "ship today if it is not a holiday".

unless.js

```ts
// "Orders placed before 2 pm ship today, unless it is a public holiday."
const hourPlaced = 11;
const isHoliday = true;

const shipsToday = hourPlaced < 14 && !isHoliday;
console.log("ships today:", shipsToday);

// "Neither suspended nor banned users may post."
const isSuspended = false;
const isBanned = false;
console.log("may post:", !isSuspended && !isBanned);
```

Output of `node unless.js` and of the browser terminal

```ts
ships today: false
may post: true
```

"Before 2 pm" uses a 24-hour clock: 14 is 2 pm, and "before" does not include 14 itself, so the operator is `<`.

### "Only if" is a requirement, not a promise

"You may withdraw *only if* the account is active" says an inactive account can never withdraw. It does *not* say every active account may withdraw; other conditions may also apply. A condition that must hold for something to happen is called **necessary**. A condition that on its own guarantees it is called **sufficient**. In an AND-rule, every part is necessary and no single part is sufficient. In an OR-rule, every part is sufficient and no single part is necessary.

necessary.js

```ts
const isActive = true;
const isLocked = true;

// "active" is necessary, not sufficient: this account is active and still refused
console.log(isActive && !isLocked);

const isAdmin = true;
const isOwner = false;
// in an OR-rule, "admin" alone is sufficient
console.log(isAdmin || isOwner);
```

Output of `node necessary.js` and of the browser terminal

```ts
false
true
```

### Comparisons: watch the boundary

Numbers in rules come with boundary words, and each maps to one operator. Getting one wrong affects only the single value on the boundary, which is exactly why it slips through testing:

| Words | Operator | Does the boundary count? |
| --- | --- | --- |
| at least 18, 18 or more, no less than 18 | `age >= 18` | yes, 18 passes |
| more than 18, over 18, above 18 | `age > 18` | no, 18 fails |
| at most ₦100,000, up to, no more than | `total <= 100000` | yes |
| less than, under, below | `total < 100000` | no |

> TIP
>
> When a rule says "over 18" and you are not sure the author meant to exclude 18 itself, ask. This is one of the most common questions a developer should send back to the business, and it is much cheaper to ask than to fix later.

## Inverting a condition

You often need the exact opposite of a rule: when to refuse, when to show an error, when to skip. The safe way to invert any condition is to wrap it in `!( … )`. That is always correct, but hard to read. The trouble starts when you try to push the NOT inside.

Here is the mistake almost everyone makes once. The rule for free delivery is "big order and in Lagos". A developer wants the opposite, "no free delivery", and flips each part:

wrong-flip.js

```ts
const bigOrder = true;
const inLagos = false;

const free = bigOrder && inLagos;
const noFreeWrong = !bigOrder && !inLagos;   // flipped each part, kept &&
const noFreeRight = !(bigOrder && inLagos);

console.log("free:", free);
console.log("wrong opposite:", noFreeWrong);
console.log("right opposite:", noFreeRight);
```

Output of `node wrong-flip.js` and of the browser terminal

```ts
free: false
wrong opposite: false
right opposite: true
```

The order is big but outside Lagos. It does not get free delivery, and it also does not satisfy "not big and not in Lagos". Both answers are `false`, which is impossible for a condition and its opposite: exactly one of them must be true. Flipping each part is not enough; the operator must flip too.

### De Morgan's laws

Augustus De Morgan, another nineteenth-century mathematician, wrote down the two rules for pushing a NOT inside:

```ts
!(a && b)   is the same as   !a || !b
!(a || b)   is the same as   !a && !b
```

In words: **negate each part and swap AND with OR**. "Not (big and in Lagos)" is "not big, *or* not in Lagos": failing either requirement is enough to lose free delivery. And "not (admin or owner)" is "not admin *and* not owner": to be refused you must fail both ways in.

You do not have to trust this. Two inputs have four combinations, so a loop proves it:

de-morgan.js

```ts
let holds = true;
for (const a of [false, true]) {
  for (const b of [false, true]) {
    const law1 = !(a && b) === (!a || !b);
    const law2 = !(a || b) === (!a && !b);
    console.log(a, b, law1, law2);
    if (!law1 || !law2) holds = false;
  }
}
console.log("De Morgan holds in every row:", holds);
```

Output of `node de-morgan.js` and of the browser terminal

```ts
false false true true
false true true true
true false true true
true true true true
De Morgan holds in every row: true
```

The laws extend to any number of parts: `!(a && b && c)` is `!a || !b || !c`. The opposite of a checklist is "at least one box is unticked".

### Negating comparisons

Comparisons have opposites too, and the boundary moves to the other side:

| Condition | Its opposite | Not the opposite |
| --- | --- | --- |
| `balance >= amount` | `balance < amount` | `balance <= amount` |
| `age > 17` | `age <= 17` | `age < 17` |
| `status === "active"` | `status !== "active"` |  |

The opposite of "at least" is "less than", not "at most". Check the boundary: when `balance` equals `amount`, the withdrawal is allowed, so "refused" must be `false` there. `balance < amount` gives `false`; `balance <= amount` would wrongly refuse.

negate-compare.js

```ts
const amount = 5000;
for (const balance of [4999, 5000, 5001]) {
  const allowed = balance >= amount;
  console.log(balance, "allowed:", allowed, "| refused (<):", balance < amount, "| refused (<=):", balance <= amount);
}
```

Output of `node negate-compare.js` and of the browser terminal

```ts
4999 allowed: false | refused (<): true | refused (<=): true
5000 allowed: true | refused (<): false | refused (<=): true
5001 allowed: true | refused (<): false | refused (<=): false
```

At 5000 the account is both "allowed" and "refused (`<=`)": the wrong negation contradicts the rule on exactly one value. The three test values, one below the boundary, the boundary itself, and one above, are the standard way to test any comparison.

## Three classic condition bugs

### The always-true OR

A shop allows cancelling an order that is not shipped and not delivered. A developer writes "status is not shipped or not delivered":

always-true.js

```ts
for (const status of ["pending", "shipped", "delivered"]) {
  const buggy = status !== "shipped" || status !== "delivered";
  const fixed = status !== "shipped" && status !== "delivered";
  console.log(status, "buggy:", buggy, "fixed:", fixed);
}
```

Output of `node always-true.js` and of the browser terminal

```ts
pending buggy: true fixed: true
shipped buggy: true fixed: false
delivered buggy: true fixed: false
```

The buggy version is *always* true. A status cannot be both `"shipped"` and `"delivered"`, so it always differs from at least one of them. The rule "neither shipped nor delivered" is `!(shipped || delivered)`, which De Morgan turns into `!shipped && !delivered`: AND, not OR. Whenever you see `x !== A || x !== B`, it is a bug.

### The comparison that is not a comparison

or-string.js

```ts
const role = "customer";

if (role === "admin" || "manager") {
  console.log("buggy: access granted to", role);
}
if (role === "admin" || role === "manager") {
  console.log("fixed: access granted to", role);
} else {
  console.log("fixed: access refused to", role);
}
```

Output of `node or-string.js` and of the browser terminal

```ts
buggy: access granted to customer
fixed: access refused to customer
```

English lets you say "role is admin or manager"; JavaScript does not. `role === "admin" || "manager"` is read as `(role === "admin") || "manager"`, and the non-empty string `"manager"` is truthy, so everyone gets in. Each side of `||` must be a complete comparison.

### The misplaced NOT

`!` binds tighter than `&&`, `||` and the comparisons (only the dot that reads a property binds tighter still), so `!account.locked && account.active` means "(not locked) and active", while `!(account.locked && account.active)` means "not (locked and active)". These are different rules. When a NOT applies to a group, the parentheses are mandatory.

## Simplifying conditions, and proving it

Conditions grow messy as rules change: someone adds a check, someone else adds a special case. Simpler conditions are easier to read and harder to get wrong. Here are the simplifications you will use most:

| Messy | Simpler | Why |
| --- | --- | --- |
| `isActive === true` | `isActive` | it already is a boolean |
| `!(!isActive)` | `isActive` | double negation |
| `!(age < 18)` | `age >= 18` | negated comparison |
| `age >= 18 && age >= 21` | `age >= 21` | the stricter part implies the other |
| `isAdmin \|\| (isAdmin && isOwner)` | `isAdmin` | absorption: the group adds nothing |
| `(a && b) \|\| (a && c)` | `a && (b \|\| c)` | factor out the shared part |
| `if (x) { return true; } else { return false; }` | `return x;` | the condition is the answer |

`isActive === true` is only the same as `isActive` when the value is a real boolean. With a possibly missing value, the explicit comparison is deliberate, as you saw with unknown values in [Boolean logic](https://zudojs.oyinlola.site/learn/logic-boolean#traps). Simplify only what you know.

### Proving a simplification with a loop

A simplification is a refactor: the behaviour must not change. For boolean inputs you can prove it by comparing the old and new condition on every row. Write the check once, as a function that takes the two conditions as its inputs. In JavaScript a function is a value, so you can pass it to another function like any number or string:

equivalent.js

```ts
function sameOnEveryRow(oldRule, newRule) {
  for (const a of [false, true]) {
    for (const b of [false, true]) {
      for (const c of [false, true]) {
        if (oldRule(a, b, c) !== newRule(a, b, c)) {
          console.log("differs at", a, b, c);
          return false;
        }
      }
    }
  }
  return true;
}

function oldDiscount(isMember, hasCoupon, isSale) {
  return (isMember && hasCoupon) || (isMember && isSale) || (isMember && hasCoupon && isSale);
}
function newDiscount(isMember, hasCoupon, isSale) {
  return isMember && (hasCoupon || isSale);
}
function wrongDiscount(isMember, hasCoupon, isSale) {
  return isMember && hasCoupon || isSale;
}

console.log("new matches old:", sameOnEveryRow(oldDiscount, newDiscount));
console.log("wrong matches old:", sameOnEveryRow(oldDiscount, wrongDiscount));
```

Output of `node equivalent.js` and of the browser terminal

```ts
new matches old: true
differs at false false true
wrong matches old: false
```

The old discount rule has three groups, all needing `isMember`. Factoring out `isMember` gives the short version, and the loop confirms that all eight rows agree. The "wrong" attempt forgot parentheses, and the checker immediately names a row where it differs: a non-member during a sale would get the member discount.

`return` inside the loops ends the whole function at once, so the checker stops at the first row that differs. If it gets through every row, the two rules are **equivalent**: same answer for every input.

For conditions on numbers, such as `age >= 18 && age >= 21`, you cannot loop over every possible number. Loop over the boundary values instead: each boundary, one below it and one above it, plus one value far away on each side. Those are the only places where two comparisons can start to disagree.

boundaries.js

```ts
const ages = [0, 17, 18, 19, 20, 21, 22, 90];
let same = true;
for (const age of ages) {
  const oldRule = age >= 18 && age >= 21;
  const newRule = age >= 21;
  if (oldRule !== newRule) same = false;
}
console.log("same on every boundary value:", same);

const wrongRule = (age) => age > 21;   // "over 21" instead of "21 or more"
for (const age of ages) {
  if ((age >= 21) !== wrongRule(age)) console.log("differs at age", age);
}
```

Output of `node boundaries.js` and of the browser terminal

```ts
same on every boundary value: true
differs at age 21
```

The boundary list catches the classic slip of `>` for `>=` at exactly one value, 21. A list of "normal" ages like 30, 40 and 50 would never find it. `(age) => age > 21` is a short **arrow function**: it takes `age` and returns the comparison.

## Guard clauses: the inverted rule as code

Back to the refused withdrawal. The rule is an AND of four parts:

```ts
allowed = active && !locked && balance >= amount && withdrawnToday + amount <= limit
```

De Morgan tells you its opposite is an OR of the four negated parts:

```ts
refused = !active || locked || balance < amount || withdrawnToday + amount > limit
```

Each part of that OR is one *reason* to refuse. That is exactly the shape of **guard clauses**: a series of early `return`s at the top of a function, each checking one bad case. (`return` ends a function at once and hands back its value, as in the functions of [Boolean logic](https://zudojs.oyinlola.site/learn/logic-boolean#truth-tables). [Making decisions](https://zudojs.oyinlola.site/learn/js-conditions#guard-clauses), in the JavaScript course, comes back to guard clauses.) When a guard's condition is true, the function stops and returns its reason. Only if every guard passes does the function reach the last line, the "yes".

REASON IT OUT

### Which order should the guards go in?

You are about to write `checkWithdrawal(account, amount, dailyLimit)` with one guard per reason. Before writing it, think:

- What inputs could arrive that the business rule never mentions? Think about the amount itself.
- Does the order of the guards change the *answer* (allowed or refused)? Does it change the *reason*?
- A locked account belongs to someone under a fraud investigation. Should the machine tell them "insufficient funds"?
- Which reasons might a customer be able to fix themselves?

**Show the reasoning**

**Inputs the rule forgot.** The amount could be zero, negative, or not a whole number of naira. A negative withdrawal would *add* money. None of these is in the business sentence, but all of them must be refused, so the very first guard checks that the amount is a positive whole number.

**Order and the answer.** The final allowed/refused answer does not depend on the order: an OR is true if any part is true, whatever the order. But the *reason* does. An account that is locked and also short of money will get whichever reason is checked first.

**Order and safety.** Check the account's state (active, not locked) before anything about money. A locked account should hear "account locked", not details about its balance: revealing the balance to someone who may not own the card leaks information. Security checks go first; checks about the specific request go after.

**Fixable reasons.** "Insufficient funds" and "over the daily limit" are things the customer can fix by asking for less, so those messages are worth making specific. "Account locked" needs the bank, so it should point the customer to support.

check-withdrawal.js

```ts
function checkWithdrawal(account, amount, dailyLimit) {
  if (!Number.isInteger(amount) || amount <= 0) return "refused: invalid amount";
  if (!account.active) return "refused: account not active";
  if (account.locked) return "refused: account locked, contact support";
  if (account.balance < amount) return "refused: insufficient funds";
  if (account.withdrawnToday + amount > dailyLimit) return "refused: over daily limit";
  return "allowed";
}

const limit = 100000;
const ada = { active: true, locked: false, balance: 40000, withdrawnToday: 90000 };
const bola = { active: true, locked: true, balance: 500, withdrawnToday: 0 };

console.log(checkWithdrawal(ada, 20000, limit));
console.log(checkWithdrawal(ada, 10000, limit));
console.log(checkWithdrawal(bola, 20000, limit));
console.log(checkWithdrawal(ada, -5000, limit));
console.log(checkWithdrawal(ada, 2.5, limit));
```

Output of `node check-withdrawal.js` and of the browser terminal

```ts
refused: over daily limit
allowed
refused: account locked, contact support
refused: invalid amount
refused: invalid amount
```

`Number.isInteger(amount)` is a built-in check that is true only for whole numbers. Each guard is one negated part of the rule. Compare the guards with the `refused` line above: `!active`, `locked`, `balance < amount`, `withdrawnToday + amount > limit`. De Morgan did the design work; the guards just give each part a name and a message.

Bola's account is both locked and short of money, and she hears only "locked", because that guard comes first. Ada's second attempt of ₦10,000 brings her exactly to the limit (₦100,000), which is allowed because the rule says "does not exceed". The guard uses `>`, the correct negation of `<=`.

> TIP
>
> Guard clauses fail closed: the function returns "allowed" only if it survives every check. If you add a new rule, you add a new guard, and forgetting one cannot accidentally allow something the old guards refused.

## Testing the checker

Two kinds of test catch almost every condition bug:

1. **One test per reason.** For each guard, an input that fails that guard and passes all earlier ones, so you see its exact message.
2. **Boundary tests** for every comparison: just below, exactly on, and just above.

A test table lists the input and the expected result; a loop compares:

test-withdrawal.js

```ts
function checkWithdrawal(account, amount, dailyLimit) {
  if (!Number.isInteger(amount) || amount <= 0) return "refused: invalid amount";
  if (!account.active) return "refused: account not active";
  if (account.locked) return "refused: account locked, contact support";
  if (account.balance < amount) return "refused: insufficient funds";
  if (account.withdrawnToday + amount > dailyLimit) return "refused: over daily limit";
  return "allowed";
}

const ok = { active: true, locked: false, balance: 50000, withdrawnToday: 60000 };
const limit = 100000;

const cases = [
  ["zero amount", ok, 0, "refused: invalid amount"],
  ["inactive", { ...ok, active: false }, 1000, "refused: account not active"],
  ["locked", { ...ok, locked: true }, 1000, "refused: account locked, contact support"],
  ["balance - 1", ok, 50001, "refused: insufficient funds"],
  ["balance exact", { ...ok, withdrawnToday: 0 }, 50000, "allowed"],
  ["limit exact", ok, 40000, "allowed"],
  ["limit + 1", ok, 40001, "refused: over daily limit"],
];

let failures = 0;
for (const [name, account, amount, expected] of cases) {
  const actual = checkWithdrawal(account, amount, limit);
  if (actual !== expected) failures = failures + 1;
  console.log(actual === expected ? "PASS" : "FAIL", name, "->", actual);
}
console.log(failures === 0 ? "all passed" : `${failures} failed`);
```

Output of `node test-withdrawal.js` and of the browser terminal

```ts
PASS zero amount -> refused: invalid amount
PASS inactive -> refused: account not active
PASS locked -> refused: account locked, contact support
PASS balance - 1 -> refused: insufficient funds
PASS balance exact -> allowed
PASS limit exact -> allowed
PASS limit + 1 -> refused: over daily limit
all passed
```

`{ ...ok, active: false }` makes a copy of the `ok` account with one property changed. The three dots are called **spread**; [Objects and JSON](https://zudojs.oyinlola.site/learn/js-data#copying) explains it. Changing one property at a time is what makes each test fail exactly one guard.

Try it: change `account.balance < amount` to `account.balance <= amount` in the checker and run it again. Only "balance exact" fails, the boundary test. Without it, that bug would ship.

## Production concerns

- **One source of truth.** If the web app, the mobile app and the cash machine each write their own version of the withdrawal rule, they will drift apart. Keep the rule in one function on the server and call it from everywhere.
- **Reasons as codes.** Real systems return a short code (`"DAILY_LIMIT"`) as well as a message, so apps can translate the message and support staff can search logs for it.
- **Messages must not leak.** Decide per reason what the user may learn. "Account locked, contact support" is fine; "account locked due to fraud report #4411" is not. Log the detailed reason for staff, show the safe one to the user.
- **Changing a rule is a refactor with tests.** Before you simplify or reorder conditions in a money or permission check, prove equivalence with a loop or a test table, as above.

## Practice

TRY IT YOURSELF

### Invert the free delivery rule

Free delivery: `(bigOrder || isPremium) && inLagos`. Use De Morgan to write `noFreeDelivery` without an outer `!( … )`, then prove with nested loops that it is the exact opposite in all 8 rows.

**Show a solution**

The outer operator is AND, so the opposite is an OR of the negated parts: `!(bigOrder || isPremium) || !inLagos`. The first part is itself a negated OR, which becomes an AND: `(!bigOrder && !isPremium) || !inLagos`.

invert-delivery.js

```ts
function freeDelivery(bigOrder, isPremium, inLagos) {
  return (bigOrder || isPremium) && inLagos;
}
function noFreeDelivery(bigOrder, isPremium, inLagos) {
  return (!bigOrder && !isPremium) || !inLagos;
}

let opposite = true;
for (const bigOrder of [false, true]) {
  for (const isPremium of [false, true]) {
    for (const inLagos of [false, true]) {
      if (freeDelivery(bigOrder, isPremium, inLagos) === noFreeDelivery(bigOrder, isPremium, inLagos)) {
        opposite = false;
      }
    }
  }
}
console.log("exact opposite in all 8 rows:", opposite);
```

Output of `node invert-delivery.js` and of the browser terminal

```ts
exact opposite in all 8 rows: true
```

A condition and its opposite must disagree on every row, so the test looks for any row where they are equal. In words: no free delivery when the order is small and the customer is not premium, or when the address is outside Lagos.

TRY IT YOURSELF

### Fix the cancellation rule

This function should allow cancelling only when the order is neither shipped nor delivered, but it lets every order be cancelled. Find the bug, fix it, and test it with all three statuses.

cancel-bug.js

```ts
function canCancel(status) {
  return status !== "shipped" || status !== "delivered";
}

console.log(canCancel("pending"), canCancel("shipped"), canCancel("delivered"));
```

Output of `node cancel-bug.js` and of the browser terminal

```ts
true true true
```

**Show a solution**

cancel-fixed.js

```ts
function canCancel(status) {
  return status !== "shipped" && status !== "delivered";
}

console.log(canCancel("pending"), canCancel("shipped"), canCancel("delivered"));
```

Output of `node cancel-fixed.js` and of the browser terminal

```ts
true false false
```

"Neither shipped nor delivered" is `!(shipped || delivered)`, and De Morgan turns it into `!shipped && !delivered`. With `||`, every status differs from at least one of the two, so the condition was always true.

TRY IT YOURSELF

### Guard a room booking

A hotel lets a guest book a room only if the guest is logged in, the room exists, the number of nights is a whole number from 1 to 30, and the room is not already booked. Write `checkBooking(guest, room, nights)` with guard clauses in a sensible order, and test each reason plus the 1 and 30 night boundaries.

**Show a solution**

booking.js

```ts
function checkBooking(guest, room, nights) {
  if (!guest) return "refused: please log in";
  if (!room) return "refused: no such room";
  if (!Number.isInteger(nights) || nights < 1 || nights > 30) return "refused: nights must be 1 to 30";
  if (room.booked) return "refused: room already booked";
  return "booked";
}

const guest = { name: "Chidi" };
const room = { number: 12, booked: false };

console.log(checkBooking(null, room, 2));
console.log(checkBooking(guest, undefined, 2));
console.log(checkBooking(guest, room, 0));
console.log(checkBooking(guest, room, 1));
console.log(checkBooking(guest, room, 30));
console.log(checkBooking(guest, room, 31));
console.log(checkBooking(guest, { number: 14, booked: true }, 2));
```

Output of `node booking.js` and of the browser terminal

```ts
refused: please log in
refused: no such room
refused: nights must be 1 to 30
booked
booked
refused: nights must be 1 to 30
refused: room already booked
```

`null` is JavaScript's value for "deliberately nothing": here, no guest is logged in. Like `undefined`, it is falsy, so `!guest` catches both. "From 1 to 30" is `nights >= 1 && nights <= 30`; its opposite, by De Morgan, is `nights < 1 || nights > 30`. The login and existence checks come first, because later guards read properties of `room`, and reading `room.booked` when `room` is `undefined` would crash.

## Recap

- Translate rules word by word: "but" is AND, "unless" is AND NOT, "neither ... nor" is NOT ... AND NOT, "only if" states a necessary condition. Ask when a boundary ("over 18") is unclear.
- De Morgan: `!(a && b)` is `!a || !b`, and `!(a || b)` is `!a && !b`. Negate each part *and* swap the operator.
- The opposite of `>=` is `<`, and of `<=` is `>`. Test comparisons below, on and above the boundary.
- `x !== A || x !== B` is always true, and `x === A || "B"` is always truthy. Both are bugs.
- Simplify conditions, then prove the new version equivalent by comparing it with the old on every row.
- An AND-rule inverted is an OR of reasons; guard clauses check each reason in turn, security checks first, and return "yes" only at the end.

Next: [Sets](https://zudojs.oyinlola.site/learn/logic-sets), where conditions about single values become questions about whole groups: which permissions a user has, which tags two products share, and which items are duplicates.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
