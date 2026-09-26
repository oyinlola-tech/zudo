---
title: "Reasoning about programs — ZudoJS Academy"
description: "Ask what you know, what you assume and what must stay true, build edge-case tables, and use invariants to show a program works for every input, not just a few."
source: https://zudojs.oyinlola.site/learn/think-reasoning
---

LEVEL 1 · LESSON 9 OF 18

Think like a programmer Foundation

# Reasoning about programs

Ask what you know, what you assume and what must stay true, build edge-case tables, and use invariants to show a program works for every input, not just a few.

- **50 min** to read and try
- **You need:** Pseudocode and flowcharts
- **You build:** A bill splitter and a ticket seller, each with written preconditions, an edge-case table and an invariant checked on hundreds of inputs

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Separate what you know from what you assume about a problem
- Write the conditions that must be true before and after an algorithm runs
- Build an edge-case table and turn it into tests
- Find an invariant and check it after every step
- Argue that an algorithm works for all inputs, and back the argument with many automatic checks

## The bill that did not add up

Five friends eat at a restaurant in Lekki. The bill is ₦25,000. One of them writes a tiny program to split it:

split-v1.js

```ts
const total = 25000;
const people = 5;

const share = total / people;
console.log("Each person pays ₦" + share);
```

Output of `node split-v1.js` and of the browser terminal

```ts
Each person pays ₦5000
```

It works, so she shares it with her colleagues. The next week three of them split a ₦10,000 bill:

split-v1-three.js

```ts
const total = 10000;
const people = 3;

const share = total / people;
console.log("Each person pays ₦" + share);
```

Output of `node split-v1-three.js` and of the browser terminal

```ts
Each person pays ₦3333.3333333333335
```

Nobody can pay a third of a kobo. Each of them pays ₦3,333, the restaurant receives ₦9,999, and the waiter has to chase ₦1. Then someone tries 0 people by mistake, and the program says each person pays `Infinity`.

No error message appeared at any point. The program did exactly what it was told. What was missing was *reasoning*: sitting down, before and after writing the code, and asking what could be true, what must be true, and what happens when it is not. Tests catch the cases you try. Reasoning finds the cases you did not think to try, and it is the only way to be confident about all the inputs you will never see. This lesson gives you a method for it.

## The reasoning checklist

Here are the questions experienced programmers ask, often without saying them out loud. You have met most of them already in this module; this is the full list, in order:

1. **What do I know?** The facts given: the inputs, the rules, the output wanted.
2. **What don't I know?** The questions the problem does not answer.
3. **What am I assuming?** The things you are treating as true without being told.
4. **What must be true before it runs?** The conditions on the input for the algorithm to make sense.
5. **What if they are false?** What the program does when those conditions fail.
6. **Where are the boundaries?** The values where the behaviour changes.
7. **What could go wrong?** Everything else: odd input, rounding, things happening at the same time.
8. **Can I show it works?** An argument that it is right for every input, backed by tests.

The rest of the lesson goes through them with the bill splitter, then with a second problem, a concert ticket seller.

## Knowns, unknowns and assumptions

Start by writing down what you actually know about the bill splitter:

- The input is a total in naira and a number of people.
- The output is what each person pays.
- The shares must add up to the total. (Nobody said this, but the restaurant will insist.)

Now what you *don't* know. Each of these is a question to ask, not a thing to guess:

- Is the total always a whole number of naira, or can it have kobo?
- If the total does not divide evenly, who pays the extra? Can shares differ at all?
- Is a service charge or tip included, or added on top?
- Where do the inputs come from: typed by a person, or calculated by another program?

And then the assumptions: things the first program treated as true without anyone saying so. It assumed the division always comes out even. It assumed `people` is at least 1. It assumed both inputs are numbers. None of these was written down, so nobody checked them, and each became a bug.

The rule is simple: **every assumption must either be checked by the code or confirmed by a person, and written down either way.** An assumption nobody wrote down is a bug waiting for the right input.

REASON IT OUT

### Knowns and unknowns for a booking rule

A guest house in Calabar has this rule: "Guests can cancel for free up to 48 hours before check-in." You are asked to write the check. Before any code, list: what do you know, what don't you know, and what would you be tempted to assume?

**Show the reasoning**

- **Known:** there is a check-in time and a cancellation time. If the gap is at least 48 hours, cancelling is free.
- **Unknown:** is exactly 48 hours free or not ("up to" suggests yes, but ask)? What is the check-in *time*: 2 pm, or midnight of the check-in day? Which time zone, if a guest in London cancels a room in Calabar? What happens after the deadline: full charge, or one night?
- **Tempting assumptions:** that check-in is at midnight; that everyone is in the same time zone; that the booking cannot be changed (if the guest moves the check-in date, which date counts?).

Every one of these changes the answer for some real guest. The one-line rule hid at least five decisions. Writing them down, and asking the owner, is most of the work.

## Conditions that must be true

Once the questions are answered, write the rules down as **conditions**. Two kinds matter most:

- A **precondition** must be true *before* the algorithm runs, or its answer means nothing. For the bill splitter: `people` is a whole number, at least 1; `total` is a whole number of naira, 0 or more.
- A **postcondition** must be true *after* it runs, if the preconditions held. For the bill splitter: every share is a whole number of naira; no two shares differ by more than ₦1; the shares add up exactly to the total.

The owner answered the unknowns: totals are whole naira, and when the bill does not divide evenly, the first few people pay ₦1 more. Now the design follows from the postconditions. Divide and round *down* to get the basic share; what is left over is the remainder, and that many people pay ₦1 extra.

Two tools do this. `Math.floor(x)` rounds a number down to the whole number below it. `%`, which you met in [Pseudocode and flowcharts](https://zudojs.oyinlola.site/learn/think-pseudocode#translate), gives the remainder:

floor.js

```ts
console.log(Math.floor(10000 / 3));
console.log(10000 % 3);
console.log(3333 * 3 + 1);
```

Output of `node floor.js` and of the browser terminal

```ts
3333
1
10000
```

₦10,000 among 3 is ₦3,333 each with ₦1 left over, and the last line checks it: three shares of ₦3,333 plus the ₦1 remainder is the whole bill. So one person pays ₦3,334 and two pay ₦3,333. The postcondition "shares add up to the total" holds: 3,334 + 3,333 + 3,333 = 10,000.

### What if a precondition is false?

For each precondition, decide what happens when it fails. Usually the answer is: refuse, with a message that says what is wrong. Never carry on and produce a number that looks like an answer, like `Infinity` or `NaN`. Here is the splitter with its preconditions checked first:

split-v2.js

```ts
const total = 10000;
const people = 3;

if (people < 1) {
  console.log("Refused: need at least 1 person");
} else if (total < 0) {
  console.log("Refused: the total cannot be negative");
} else if (total % 1 !== 0 || people % 1 !== 0) {
  console.log("Refused: use whole numbers");
} else {
  const base = Math.floor(total / people);
  const extra = total % people;

  let sum = 0;
  for (let person = 1; person <= people; person++) {
    let share = base;
    if (person <= extra) {
      share = base + 1;
    }
    sum = sum + share;
    console.log("Person " + person + " pays ₦" + share);
  }
  console.log("Shares add up to ₦" + sum);
}
```

Output of `node split-v2.js` and of the browser terminal

```ts
Person 1 pays ₦3334
Person 2 pays ₦3333
Person 3 pays ₦3333
Shares add up to ₦10000
```

- `total % 1 !== 0` is true when a number has a fractional part: dividing by 1 leaves the part after the decimal point. It checks "is a whole number".
- `||` means "or": the condition is true if either side is true. You will study it properly in [Boolean logic](https://zudojs.oyinlola.site/learn/logic-boolean).
- The loop gives each person `base`, and the first `extra` people one naira more.
- The last line prints the sum of the shares, so the output shows the postcondition holding, instead of asking you to trust it.

## Boundaries and edge-case tables

An **edge case** is an input at the edge of what is allowed: the smallest, the largest, the empty, the value where a rule switches. Most bugs live there, because the normal cases are the ones everybody tests. An **edge-case table** lists them with the reason each is interesting and the expected result, worked out before running anything.

| Total | People | Why it is interesting | Expected |
| --- | --- | --- | --- |
| 25000 | 5 | Divides evenly: the normal case | 5000 each |
| 10000 | 3 | Remainder 1 | 3334, 3333, 3333 |
| 10001 | 3 | Remainder 2: the largest remainder for 3 people | 3334, 3334, 3333 |
| 2 | 3 | Total smaller than the number of people | 1, 1, 0 |
| 0 | 4 | Nothing to pay | 0 each |
| 7500 | 1 | One person pays everything | 7500 |
| 5000 | 0 | Precondition broken | Refused |
| -100 | 2 | Precondition broken | Refused |
| 1000.5 | 2 | Not whole naira | Refused |

The row "₦2 among 3 people" is worth a moment. Someone pays ₦0. Is that right? The algorithm is consistent, and the postconditions hold. Whether the owner wants a ₦0 share printed is a product question, and the table is what made you notice it.

Now turn the table into a test. Each row becomes one run, using two lists in the same order. Instead of printing every share, the test checks the postconditions itself and prints a verdict:

split-test.js

```ts
const totals = [25000, 10000, 10001, 2, 0, 7500, 5000, -100, 1000.5];
const peopleList = [5, 3, 3, 3, 4, 1, 0, 2, 2];

for (let i = 0; i < totals.length; i++) {
  const total = totals[i];
  const people = peopleList[i];

  if (people < 1 || total < 0 || total % 1 !== 0 || people % 1 !== 0) {
    console.log(total, "/", people, "-> refused");
  } else {
    const base = Math.floor(total / people);
    const extra = total % people;
    let sum = 0;
    let shares = "";
    for (let person = 1; person <= people; person++) {
      let share = base;
      if (person <= extra) {
        share = base + 1;
      }
      sum = sum + share;
      shares = shares + share + " ";
    }
    console.log(total, "/", people, "->", shares + "| adds up:", sum === total);
  }
}
```

Output of `node split-test.js` and of the browser terminal

```ts
25000 / 5 -> 5000 5000 5000 5000 5000 | adds up: true
10000 / 3 -> 3334 3333 3333 | adds up: true
10001 / 3 -> 3334 3334 3333 | adds up: true
2 / 3 -> 1 1 0 | adds up: true
0 / 4 -> 0 0 0 0 | adds up: true
7500 / 1 -> 7500 | adds up: true
5000 / 0 -> refused
-100 / 2 -> refused
1000.5 / 2 -> refused
```

Every row matches the table. Notice how the tests came from the reasoning, not from guessing: each precondition produced a test that breaks it; each boundary (remainder 0, 1, 2; total smaller than people; one person) produced a test on it; and the postcondition is checked in every row.

## Invariants: what never changes

Some conditions are not just true at the start or the end, but at *every* step. Such a condition is called an **invariant**. You met one in [Breaking problems down](https://zudojs.oyinlola.site/learn/think-decomposition#testing): a transfer moves money between accounts, so the total money in the bank never changes. Invariants are powerful because you can check them after every single step, and the moment one breaks, you know exactly which step broke it.

### A ticket seller

A concert hall in Abuja has 500 seats. Requests arrive to buy tickets, sometimes for one person, sometimes for a group. Two invariants must hold after every sale:

- `sold + available === 500`: seats are never created or lost.
- `sold <= 500`: the hall is never oversold.

Here is a first version. It checks that there are seats left before selling, then checks both invariants after every request:

tickets-v1.js

```ts
const capacity = 500;
let sold = 496;
let available = 4;

for (const request of [2, 3, 1]) {
  if (sold < capacity) {
    sold = sold + request;
    available = available - request;
    console.log("Sold", request, "-> sold", sold, "available", available);
  } else {
    console.log("Sold out, refused", request);
  }
  if (sold + available !== capacity || sold > capacity) {
    console.log("INVARIANT BROKEN after request for", request);
  }
}
```

Output of `node tickets-v1.js` and of the browser terminal

```ts
Sold 2 -> sold 498 available 2
Sold 3 -> sold 501 available -1
INVARIANT BROKEN after request for 3
Sold out, refused 1
INVARIANT BROKEN after request for 1
```

The first invariant held (501 + -1 is still 500), but the second broke: 501 tickets for 500 seats. It is still broken after the next request, even though that request was refused: once the state is wrong, it stays wrong, which is why the *first* broken message is the one to look at. The check `sold < capacity` asked "is there at least one seat?" when the question was "are there enough seats for this whole group?". The invariant pointed at the exact request that caused it. The fix is the right precondition for each sale, `request <= available`:

tickets-v2.js

```ts
const capacity = 500;
let sold = 496;
let available = 4;

for (const request of [2, 3, 1, 1, 1]) {
  if (request <= available) {
    sold = sold + request;
    available = available - request;
    console.log("Sold", request, "-> sold", sold, "available", available);
  } else {
    console.log("Not enough seats for", request, "- only", available, "left");
  }
  if (sold + available !== capacity || sold > capacity) {
    console.log("INVARIANT BROKEN after request for", request);
  }
}
```

Output of `node tickets-v2.js` and of the browser terminal

```ts
Sold 2 -> sold 498 available 2
Not enough seats for 3 - only 2 left
Sold 1 -> sold 499 available 1
Sold 1 -> sold 500 available 0
Not enough seats for 1 - only 0 left
```

No invariant message, all the way to a full hall and one refusal after it. The group of 3 was refused while seats remained, which is correct; the owner might like a smarter message ("only 2 left, buy 2?"), but that is a feature, not a bug.

### Invariants inside a loop

Invariants also explain *why* an algorithm works. Take "best so far" from [Algorithms](https://zudojs.oyinlola.site/learn/think-algorithms#counting). Its invariant is: *after looking at some items, `biggest` is the biggest of the items looked at so far.*

1. **It is true at the start.** Before the loop, `biggest` is the first item, and the first item is the biggest of a list containing only itself.
2. **Each step keeps it true.** When the next item arrives, either it is bigger than `biggest` (and becomes `biggest`), or it is not (and `biggest` stays). Either way, `biggest` is again the biggest of everything seen.
3. **So it is true at the end.** When the loop finishes, "everything seen" is the whole list.

This three-step argument is how you show a loop is correct for *every* list, not just the ones you tried: true at the start, kept true by each step, therefore true at the end. It also shows exactly why starting at 0 was wrong: with all-negative profits, "0 is the biggest of the items seen so far" is false from the very beginning.

You can print the invariant at each step and watch it hold:

invariant-trace.js

```ts
const sales = [4500, 12000, 800, 15500];

let biggest = sales[0];
let seen = "";
for (const amount of sales) {
  if (amount > biggest) {
    biggest = amount;
  }
  seen = seen + amount + " ";
  console.log("seen:", seen + "| biggest so far:", biggest);
}
```

Output of `node invariant-trace.js` and of the browser terminal

```ts
seen: 4500 | biggest so far: 4500
seen: 4500 12000 | biggest so far: 12000
seen: 4500 12000 800 | biggest so far: 12000
seen: 4500 12000 800 15500 | biggest so far: 15500
```

## Can I show it works?

A test shows that a program works for the inputs you tried. It says nothing about the inputs you did not try. There are two ways to get further, and good programmers use both.

### An argument

Here is why the bill splitter's shares always add up, for *any* valid total and number of people. Division with a remainder always satisfies `total = base × people + extra`, with `extra` smaller than `people`. That is what "divide and keep the remainder" means: 10,000 = 3,333 × 3 + 1. The algorithm gives every person `base` (that is `base × people` in all) and gives `extra` people one more naira (another `extra`). So the shares add up to `base × people + extra`, which is the total. And since `extra` is smaller than `people`, there are always enough people to hand the extra naira to.

That argument covers every input at once. No test, however many you write, can do that.

### Many automatic checks

Arguments can contain mistakes too. So back them with tests on far more inputs than you would ever write by hand. Two loops, one inside the other, can try every total from 0 to 100 with every group size from 1 to 10, and check both postconditions on each of those 1,010 cases:

split-many.js

```ts
let checked = 0;
let failed = 0;

for (let total = 0; total <= 100; total++) {
  for (let people = 1; people <= 10; people++) {
    const base = Math.floor(total / people);
    const extra = total % people;
    let sum = 0;
    let smallest = base + 1;
    let largest = 0;
    for (let person = 1; person <= people; person++) {
      let share = base;
      if (person <= extra) {
        share = base + 1;
      }
      sum = sum + share;
      if (share < smallest) {
        smallest = share;
      }
      if (share > largest) {
        largest = share;
      }
    }
    checked = checked + 1;
    if (sum !== total || largest - smallest > 1) {
      failed = failed + 1;
      console.log("FAILED:", total, "among", people);
    }
  }
}
console.log("Checked", checked, "cases,", failed, "failed");
```

Output of `node split-many.js` and of the browser terminal

```ts
Checked 1010 cases, 0 failed
```

Instead of choosing expected outputs one by one, this test checks *properties* that must hold for every input: the shares add up to the total, and no two differ by more than ₦1. This style is called **property-based testing**, and there are libraries that generate thousands of random inputs for you. The idea is the one you just used: reason out what must always be true, then check it everywhere.

## What could go wrong

The last question on the checklist is the widest. These are the answers that come up again and again:

### Decimals that are not exact

Computers store most decimals approximately. Money calculated in naira with kobo as decimals picks up tiny errors:

decimals.js

```ts
const price = 0.1;
const fee = 0.2;
console.log(price + fee);
console.log(price + fee === 0.3);
console.log(10 + 20 === 30);
```

Output of `node decimals.js` and of the browser terminal

```ts
0.30000000000000004
false
true
```

Whole numbers are exact. That is why the bill splitter insists on whole naira, and why banks store amounts in kobo, as whole numbers. [Mathematical reasoning](https://zudojs.oyinlola.site/learn/logic-math) covers this properly.

### Input that breaks an unchecked assumption

If `people` arrives from a form, it arrives as text: `"3"`. `10000 / "3"` happens to work, because division converts the text, but `"3" + 1` is `"31"`. Any calculation that uses `+` on it goes wrong silently. The precondition "is a whole number" should be checked on the converted value, not assumed.

### Off by one

Loops that start at 1 instead of 0, or stop at `<` instead of `<=`, are wrong by exactly one item. In the splitter, `person <= people` is right because `person` counts from 1. Tracing the first and the last round of a loop by hand catches most of these.

### Things happening at the same time

Two customers try to buy the last concert ticket at the same moment. Both requests check `request <= available`, both see 1 seat, both succeed, and 501 tickets are sold. The invariant is right and the check is right, but they were run by two requests at once. This is called a **race condition**, and you cannot see it by tracing one request. The reasoning question that finds it is: "what if this happens twice, at the same time?". Databases solve it with transactions and locks, which you will use in the backend lessons.

> Reasoning is not optional on a server
>
> A bill splitter with a bug costs a waiter ₦1. A ticket seller with a race condition sells seats that do not exist, and a bank with one creates money. The more users and the more money a program handles, the more of this checklist you must answer before you ship.

## Practice

TRY IT YOURSELF

### Old enough to open an account?

A bank's form asks for a customer's birth year only, and the rule is "you must be 18 or older". Go through the checklist: what do you know, what don't you know, what would the obvious code assume? Then write an edge-case table for a check done in 2026.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Four bands, checked in an order that matters: an impossible (negative) difference first, then clearly old enough, then exactly on the boundary, then everyone else.

HINT 2

`if (difference < 0) { decision = "invalid birth year"; } else if (difference >= 19) { decision = "allow"; } else if (difference === 18) { decision = "ask for the full date of birth"; } else { decision = "refuse"; }`

SOLUTION

- **Known:** the birth year and the current year, 2026.
- **Unknown:** the birthday. Someone born in 2008 is 18 in 2026 only after their birthday; before it, they are 17. With the year alone, the question cannot always be answered.
- **The obvious code assumes** that `2026 - birthYear` is the age. For 2008 that says 18, which is wrong for about half of those customers for part of the year.

| Birth year | 2026 − year | Real age in 2026 | Safe decision |
| --- | --- | --- | --- |
| 2007 | 19 | 18 or 19 | Allow |
| 2008 | 18 | 17 or 18 | Cannot tell: ask for the full date |
| 2009 | 17 | 16 or 17 | Refuse |
| 2030 | -4 | Not born | Refuse: invalid input |

age.js

```ts
const thisYear = 2026;

for (const birthYear of [2007, 2008, 2009, 2030]) {
  const difference = thisYear - birthYear;
  let decision = "";
  if (difference < 0) {
    decision = "invalid birth year";
  } else if (difference >= 19) {
    decision = "allow";
  } else if (difference === 18) {
    decision = "ask for the full date of birth";
  } else {
    decision = "refuse";
  }
  console.log(birthYear, "->", decision);
}
```

Output of `node age.js` and of the browser terminal

```ts
2007 -> allow
2008 -> ask for the full date of birth
2009 -> refuse
2030 -> invalid birth year
```

The real fix is not in the code: it is to ask for the full date of birth. Reasoning showed that the input cannot support the rule. That is a finding to take back to the people who designed the form.

TRY IT YOURSELF

### A stock count that goes wrong

A shop starts the day with 20 bags of rice. Through the day, events arrive: a positive number is a delivery, a negative number is a sale. Two invariants should hold after every event: the stock is never negative, and the stock equals the starting stock plus all deliveries minus all sales. Write a loop that processes `[5, -12, -8, -7, 10]`, tracks the stock, and checks the invariants after each event. What does it find, and what should the shop do about it?

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Update `stock` first, then check both invariants right after, the same order as the wallet example.

HINT 2

Two separate checks, not one combined condition: `if (stock < 0) { ... }`, and then `if (stock !== start + delivered - soldTotal) { ... }`.

SOLUTION

stock.js

```ts
const start = 20;
let stock = start;
let delivered = 0;
let soldTotal = 0;

for (const change of [5, -12, -8, -7, 10]) {
  stock = stock + change;
  if (change > 0) {
    delivered = delivered + change;
  } else {
    soldTotal = soldTotal - change;
  }
  console.log("change", change, "-> stock", stock);
  if (stock < 0) {
    console.log("INVARIANT BROKEN: negative stock");
  }
  if (stock !== start + delivered - soldTotal) {
    console.log("INVARIANT BROKEN: stock does not match the records");
  }
}
```

Output of `node stock.js` and of the browser terminal

```ts
change 5 -> stock 25
change -12 -> stock 13
change -8 -> stock 5
change -7 -> stock -2
INVARIANT BROKEN: negative stock
change 10 -> stock 8
```

The records are consistent (the second invariant always holds), but after the fourth event the shop sold 7 bags when it had only 5. The invariant pinpoints the event. The fix is a precondition on every sale: refuse it when `-change > stock`, exactly like the ticket seller. Note that `soldTotal = soldTotal - change` subtracts a negative number, which adds.

TRY IT YOURSELF

### Split a bill with a service charge

A restaurant adds a 10% service charge to the bill before it is split. Write the preconditions and postconditions, then implement it for a bill of ₦23,000 among 4 people. Assume the charge is always a whole number of naira (the restaurant rounds it down). Check that the shares add up.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

10% of a number is `number / 10`; round it down with `Math.floor`, the same as the VAT example.

HINT 2

`const charge = Math.floor(bill / 10); const total = bill + charge;`

SOLUTION

- **Preconditions:** the bill is a whole number, 0 or more; people is a whole number, at least 1.
- **Postconditions:** charge is 10% of the bill, rounded down; the shares add up to bill + charge; no two shares differ by more than ₦1.

split-service.js

```ts
const bill = 23000;
const people = 4;

const charge = Math.floor(bill / 10);
const total = bill + charge;
const base = Math.floor(total / people);
const extra = total % people;

let sum = 0;
for (let person = 1; person <= people; person++) {
  let share = base;
  if (person <= extra) {
    share = base + 1;
  }
  sum = sum + share;
  console.log("Person " + person + " pays ₦" + share);
}
console.log("Total with charge: ₦" + total, "| adds up:", sum === total);
```

Output of `node split-service.js` and of the browser terminal

```ts
Person 1 pays ₦6325
Person 2 pays ₦6325
Person 3 pays ₦6325
Person 4 pays ₦6325
Total with charge: ₦25300 | adds up: true
```

The order is a decision: the charge is on the bill before splitting, not added to each share. (10% of each share, rounded down, could lose up to ₦1 per person.) Try a bill of ₦23,005: the charge is ₦2,300, the total ₦25,305, and the remainder 1 goes to person 1.

## Recap

- Ask the checklist: what do I know, what don't I know, what am I assuming, what must be true, what if it is false, where are the boundaries, what could go wrong, can I show it works?
- Every assumption is either checked by the code or confirmed by a person, and written down.
- Preconditions must hold before the algorithm runs; when they fail, refuse clearly. Postconditions must hold after it runs; print or check them instead of trusting them.
- An edge-case table lists the smallest, largest, empty and switching inputs with their expected results, and turns directly into tests.
- An invariant holds after every step. Check it in every round and it points at the exact step that broke it. "True at the start, kept by each step, so true at the end" is how you show a loop is correct.
- Tests cover the inputs you tried; an argument covers all of them. Use both, and check properties over many inputs automatically.

Next: [Boolean logic](https://zudojs.oyinlola.site/learn/logic-boolean), the true/false reasoning inside every condition you have written in this module.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
