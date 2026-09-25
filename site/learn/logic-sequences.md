---
title: "Sequences — ZudoJS Academy"
description: "Spot the pattern in a list of numbers, compute arithmetic and geometric sequences with loops and formulas, and see why compound interest surprises people."
source: https://zudojs.oyinlola.site/learn/logic-sequences
---

LEVEL 1 · LESSON 14 OF 18

Logic and mathematical thinking Foundation

# Sequences

Spot the pattern in a list of numbers, compute arithmetic and geometric sequences with loops and formulas, and see why compound interest surprises people.

- **45 min** to read and try
- **You need:** Mathematical reasoning
- **You build:** A loan repayment schedule in kobo that knows when a loan will never be paid off

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Describe a sequence by its first term and its rule, and find the rule from a few terms using differences and ratios
- Compute any term of an arithmetic or geometric sequence with a loop and with a formula, and check one against the other
- Explain the difference between linear and exponential growth, and compute compound interest
- Model a changing balance as a recurrence relation and compute it step by step with a loop
- Guard loops that may never finish, and avoid off-by-one errors in term numbering

## "Only 15% a month"

A lending app offers quick loans of ₦50,000 at "only 15% interest a month". A borrower plans to pay it all back after a year and wants to know how much that will be. A developer adds a "cost after 12 months" line to the app and writes the natural calculation: 15% of ₦50,000 is ₦7,500 a month, times 12:

loan-guess.js

```ts
const borrowed = 50000;
const monthlyRate = 0.15;
const months = 12;

const guess = borrowed + borrowed * monthlyRate * months;
console.log("app shows: ₦" + guess);

let owed = borrowed;
for (let month = 1; month <= months; month++) {
  owed = owed * (1 + monthlyRate);     // interest is charged on what is owed now
}
console.log("actually owed: ₦" + Math.round(owed));
```

Output of `node loan-guess.js` and of the browser terminal

```ts
app shows: ₦140000
actually owed: ₦267513
```

The contract says interest is charged each month on everything owed, *including last month's interest*. So the debt does not grow by the same ₦7,500 each month; it grows by 15% of an ever larger number. After a year the borrower owes almost twice what the app showed. The developer's formula was reasonable for a different kind of growth.

Both calculations produce a **sequence**: a list of numbers, one per month, each following from the one before. This lesson is about recognising which kind of sequence you are looking at, computing it correctly with a loop, checking it with a formula, and knowing when a loop computing a sequence might never stop.

## Sequences and patterns

A **sequence** is an ordered list of numbers. Each number is a **term**. Order matters, unlike in a set, and repeats are allowed. Mathematicians name the terms with a letter and a position number, the **index**: *a*0, *a*1, *a*2, …, and write *a**n* for the term at position *n*. This lesson starts counting at 0, like JavaScript arrays, so *a*0 is the starting value: what you have at month 0, before anything has happened.

Given a few terms, the programmer's question is: what is the rule? Two tools find most rules.

- **Differences:** subtract each term from the next. If the differences are all the same, each step *adds* a fixed amount.
- **Ratios:** divide each term by the one before. If the ratios are all the same, each step *multiplies* by a fixed amount.

differences.js

```ts
const rent = [300000, 320000, 340000, 360000, 380000];
const users = [500, 1000, 2000, 4000, 8000];

for (let i = 1; i < rent.length; i++) {
  console.log("rent: difference", rent[i] - rent[i - 1], "ratio", (rent[i] / rent[i - 1]).toFixed(3));
}
for (let i = 1; i < users.length; i++) {
  console.log("users: difference", users[i] - users[i - 1], "ratio", users[i] / users[i - 1]);
}
```

Output of `node differences.js` and of the browser terminal

```ts
rent: difference 20000 ratio 1.067
rent: difference 20000 ratio 1.063
rent: difference 20000 ratio 1.059
rent: difference 20000 ratio 1.056
users: difference 500 ratio 2
users: difference 1000 ratio 2
users: difference 2000 ratio 2
users: difference 4000 ratio 2
```

`rent[i]` reads the item at position `i` of the array, counting from 0. The loop starts at `i = 1` so that `rent[i - 1]`, the previous term, always exists.

The yearly rent goes up by a constant ₦20,000: constant differences. The app's user count doubles every month: constant ratio 2. These are the two most important kinds of sequence.

> NOTE
>
> Three or four terms suggest a rule; they do not prove it. The pattern 1, 2, 4, 8 might continue 16 (doubling) or 15 (another rule entirely). In real programs the rule comes from the business: the lease says "₦20,000 more each year", the contract says "15% a month". Look for the rule in the source, and use patterns to check it.

## Arithmetic sequences: add the same amount

An **arithmetic sequence** starts at *a*0 and adds the same **common difference** *d* at every step. Rent that rises ₦20,000 a year, a stock that falls by 35 units a day, a loan repaid in equal instalments with no interest: all arithmetic.

You can compute term *n* in two ways. A **loop** repeats the step *n* times. A **formula**, also called a **closed form**, jumps straight there: after *n* steps you have added *d* exactly *n* times, so

```ts
a(n) = a(0) + n × d
```

arithmetic.js

```ts
const startRent = 300000;
const yearlyRise = 20000;

let rent = startRent;
for (let year = 1; year <= 10; year++) {
  rent = rent + yearlyRise;
}
console.log("year 10 by loop:   ", rent);
console.log("year 10 by formula:", startRent + 10 * yearlyRise);

// stock falling by 35 a day: when does it drop below 100?
let stock = 1000;
let day = 0;
while (stock >= 100) {
  day = day + 1;
  stock = stock - 35;
}
console.log("below 100 on day", day, "with", stock, "left");
```

Output of `node arithmetic.js` and of the browser terminal

```ts
year 10 by loop:    500000
year 10 by formula: 500000
below 100 on day 26 with 90 left
```

The loop and the formula agree, which is a good test of both. A loop is easier to write correctly and extend (for example, if the rise changes in year 5); a formula is instant even for the millionth term. Use one to check the other.

### Adding up an arithmetic sequence

How much rent will the tenant pay over 10 years, from year 1 to year 10? You could add the ten numbers in a loop. There is also a famous shortcut: pair the first term with the last, the second with the second-to-last, and so on. Every pair has the same total, so the sum is (number of terms) × (first + last) / 2:

arithmetic-sum.js

```ts
const first = 320000;    // year 1
const last = 500000;     // year 10
const years = 10;

let total = 0;
for (let year = 1; year <= years; year++) {
  total = total + (300000 + year * 20000);
}
console.log("by loop:   ", total);
console.log("by pairing:", years * (first + last) / 2);
```

Output of `node arithmetic-sum.js` and of the browser terminal

```ts
by loop:    4100000
by pairing: 4100000
```

## Geometric sequences: multiply by the same factor

A **geometric sequence** starts at *a*0 and multiplies by the same **common ratio** *r* at every step. After *n* steps you have multiplied by *r* exactly *n* times, which is *r* to the power *n*:

```ts
a(n) = a(0) × rn
```

In JavaScript, "to the power" is `**`: `2 ** 10` is 1,024. The ratio decides the behaviour:

- *r* greater than 1: growth. Users doubling (*r* = 2), debt at 15% a month (*r* = 1.15).
- *r* between 0 and 1: decay. A delivery van that loses 20% of its value each year (*r* = 0.8).

geometric.js

```ts
let users = 500;
for (let month = 1; month <= 10; month++) {
  users = users * 2;
}
console.log("users after 10 months:", users, "| formula:", 500 * 2 ** 10);

const vanPrice = 12000000;
for (const year of [1, 2, 5, 10]) {
  console.log(`van value after ${year} years: ₦${Math.round(vanPrice * 0.8 ** year)}`);
}
```

Output of `node geometric.js` and of the browser terminal

```ts
users after 10 months: 512000 | formula: 512000
van value after 1 years: ₦9600000
van value after 2 years: ₦7680000
van value after 5 years: ₦3932160
van value after 10 years: ₦1288490
```

The van loses ₦2,400,000 in the first year but less each year after, because 20% of a smaller value is smaller. It never reaches zero: multiplying by 0.8 always leaves something. That is the signature of **exponential decay**.

## Linear versus exponential growth

An arithmetic sequence grows **linearly**: plotted on a chart, it is a straight line, because it grows by the same *amount* each step. A geometric sequence with *r* > 1 grows **exponentially**: it grows by the same *percentage* each step, so the amount added gets bigger every time. At first, exponential growth can look slower. Then it overtakes everything:

linear-vs-exp.js

```ts
let linear = 100000;       // +₦20,000 each month
let exponential = 100000;  // +10% each month

console.log("month   linear   exponential");
for (let month = 0; month <= 36; month++) {
  if (month % 6 === 0) {
    console.log(String(month).padStart(5), String(linear).padStart(8), String(Math.round(exponential)).padStart(12));
  }
  linear = linear + 20000;
  exponential = exponential * 1.1;
}
```

Output of `node linear-vs-exp.js` and of the browser terminal

```ts
month   linear   exponential
    0   100000       100000
    6   220000       177156
   12   340000       313843
   18   460000       555992
   24   580000       984973
   30   700000      1744940
   36   820000      3091268
```

`String(x).padStart(8)` turns a number into text and adds spaces in front until it is 8 characters wide, so the columns line up. `month % 6 === 0` prints only every sixth month.

For the first year, adding ₦20,000 a month beats growing 10% a month. By month 18 the exponential one is ahead, and by month 36 it is almost four times as big. Two practical consequences:

- **Debts and growth rates compound.** A small monthly rate on a debt is a large yearly one, as the loan app showed. When you display a rate, show what it means over the period people care about.
- **Exponential costs break systems.** An algorithm whose work doubles with each extra input item is fine for 10 items and hopeless for 60. You will see this in [Counting](https://zudojs.oyinlola.site/learn/logic-counting), where the number of possible passwords grows exactly this way.

> TIP
>
> A handy estimate for doubling: at *p*% growth per period, something doubles in roughly 72 / *p* periods (the "rule of 72"). At 10% a month, about 7.2 months; the table agrees, since 177,156 at month 6 is close to double. Use it to sanity-check results, not to calculate money.

## Compound interest

**Compound interest** adds each period's interest to the balance, so the next period's interest is calculated on a larger amount. A balance *P* growing at rate *r* per period for *n* periods is a geometric sequence:

```ts
balance after n periods = P × (1 + r)n
```

Compare it with **simple interest** from [Mathematical reasoning](https://zudojs.oyinlola.site/learn/logic-math#percentages), which pays the same amount every period and is arithmetic. For ₦500,000 at 12% a year:

compound.js

```ts
const principal = 500000;
const rate = 0.12;

for (const years of [1, 5, 10, 20]) {
  const simple = principal + principal * rate * years;
  const compound = principal * (1 + rate) ** years;
  console.log(`${years} years: simple ₦${simple}, compound ₦${Math.round(compound)}`);
}
```

Output of `node compound.js` and of the browser terminal

```ts
1 years: simple ₦560000, compound ₦560000
5 years: simple ₦800000, compound ₦881171
10 years: simple ₦1100000, compound ₦1552924
20 years: simple ₦1700000, compound ₦4823147
```

After one period they are equal: compounding only matters from the second period on. Over 20 years, the compound balance is nearly three times the simple one, all of it "interest on interest".

### How often is interest added?

"12% a year" is often paid as 1% a month. Twelve monthly additions of 1% give slightly more than one yearly addition of 12%, because each month's interest starts earning in the months that follow:

monthly.js

```ts
const principal = 500000;

const yearly = principal * 1.12;
const monthly = principal * 1.01 ** 12;
console.log("12% once a year:", Math.round(yearly));
console.log("1% each month:  ", Math.round(monthly));
console.log("effective yearly rate:", ((1.01 ** 12 - 1) * 100).toFixed(2) + "%");
```

Output of `node monthly.js` and of the browser terminal

```ts
12% once a year: 560000
1% each month:   563413
effective yearly rate: 12.68%
```

The 12.68% is the **effective annual rate**. Lenders often advertise the smaller-looking number, and the loan app's "15% a month" is an effective rate of over 435% a year. Showing both is honest design.

## Recurrence relations: each term from the last

Real balances rarely follow a pure formula. A savings account grows by interest *and* by a monthly deposit. A loan grows by interest *and* shrinks by each repayment. The rule is easiest to state as "how to get the next term from this one":

```ts
balance(n) = balance(n − 1) × (1 + r) + deposit
```

A rule that defines each term from earlier terms is a **recurrence relation**. Together with a starting value, it defines the whole sequence. Recurrences map directly onto loops: the variable holds the current term, and each loop round applies the rule once. Every sequence in this lesson has been computed that way.

savings.js

```ts
const monthlyRate = 0.01;
const deposit = 20000;

let balance = 0;
for (let month = 1; month <= 24; month++) {
  balance = balance * (1 + monthlyRate) + deposit;
  if (month % 6 === 0) {
    console.log(`month ${month}: ₦${Math.round(balance)} (deposited ₦${month * deposit})`);
  }
}
```

Output of `node savings.js` and of the browser terminal

```ts
month 6: ₦123040 (deposited ₦120000)
month 12: ₦253650 (deposited ₦240000)
month 18: ₦392295 (deposited ₦360000)
month 24: ₦539469 (deposited ₦480000)
```

Here is the difference between the rule and the order of operations in it: this saver deposits at the *end* of the month, after interest. If they deposited at the start, the rule would be `(balance + deposit) * (1 + monthlyRate)`, and every deposit would earn one extra month of interest. Which one is right comes from the account's terms, and it is exactly the kind of detail you should ask about.

### Recurrences with two earlier terms

Some recurrences look back further. The best known is the **Fibonacci sequence**: each term is the sum of the two before it, starting 0, 1. It appears in nature and in computer science (you will meet it again with recursion and algorithms). A loop keeps the two most recent terms:

fibonacci.js

```ts
let previous = 0;
let current = 1;
const terms = [previous, current];
for (let i = 2; i < 12; i++) {
  const next = previous + current;
  previous = current;
  current = next;
  terms.push(current);
}
console.log(terms.join(", "));
```

Output of `node fibonacci.js` and of the browser terminal

```ts
0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89
```

The order of the three assignments matters: compute `next` from the old values first, then shift both variables along. Swap the two shifting lines (`current = next;` before `previous = current;`) and `current` is overwritten before `previous` copies it, so both end up holding the new term and the sequence goes wrong.

## Loans: will it ever be paid off?

A loan repaid in fixed monthly instalments follows the recurrence

```ts
owed(n) = owed(n − 1) × (1 + r) − payment
```

Computing the schedule is a loop that runs "while something is still owed". But a loop with a condition, a `while` loop, is only safe if the condition eventually becomes false.

REASON IT OUT

### Before you loop until the loan is repaid

You will write a loop that applies the loan recurrence each month until nothing is owed. Think it through before any code:

- ₦100,000 at 5% a month, repaid at ₦4,000 a month. What happens in the first month? Does the debt go down?
- In general, what must be true of the payment for the debt to shrink at all?
- The last month rarely needs a full payment. What should the last payment be?
- The recurrence produces fractions of a kobo. Where should rounding happen?

**Show the reasoning**

**First month:** interest is 5% of ₦100,000 = ₦5,000, and the payment is only ₦4,000. After the month the borrower owes ₦101,000, more than at the start. Every month after, the interest is even larger, so the debt grows forever and a `while (owed > 0)` loop never ends. The program freezes.

**In general,** the debt shrinks only if the payment is larger than the first month's interest (owed × r). Check that before looping, and refuse with a clear message. As a second safety net, cap the number of months (for example, 600 months, 50 years): a loop with a bound cannot hang the program, whatever the inputs.

**Last payment:** when the amount owed after interest is less than a full payment, the borrower pays only that amount, and the loan ends at exactly zero.

**Rounding:** work in whole kobo as in [Mathematical reasoning](https://zudojs.oyinlola.site/learn/logic-math#kobo), and round the interest once per month, when it is charged. That is what a bank statement shows: a whole-kobo interest line each month.

schedule.js

```ts
function repaymentSchedule(borrowedKobo, monthlyRateBasisPoints, paymentKobo) {
  const firstInterest = Math.round(borrowedKobo * monthlyRateBasisPoints / 10000);
  if (paymentKobo <= firstInterest) {
    return { error: "payment does not cover the interest; the loan would never be repaid" };
  }
  let owed = borrowedKobo;
  let month = 0;
  let totalPaid = 0;
  const maxMonths = 600;
  while (owed > 0 && month < maxMonths) {
    month = month + 1;
    const interest = Math.round(owed * monthlyRateBasisPoints / 10000);
    owed = owed + interest;
    const payment = Math.min(paymentKobo, owed);
    owed = owed - payment;
    totalPaid = totalPaid + payment;
  }
  return { months: month, totalPaid, lastPayment: totalPaid - (month - 1) * paymentKobo };
}

console.log(repaymentSchedule(10000000, 500, 1500000));   // ₦100,000, 5%/month, ₦15,000/month
console.log(repaymentSchedule(10000000, 500, 400000));    // ₦4,000/month
console.log(repaymentSchedule(10000000, 0, 3000000));     // no interest: arithmetic
```

Output of `node schedule.js` and of the browser terminal

```json
{ months: 9, totalPaid: 12473436, lastPayment: 473436 }
{
  error: 'payment does not cover the interest; the loan would never be repaid'
}
{ months: 4, totalPaid: 10000000, lastPayment: 1000000 }
```

The amounts are in kobo: the ₦100,000 loan at 5% a month, repaid at ₦15,000, takes 9 months and costs ₦124,734.36 in total, with a last payment of ₦4,734.36. At ₦4,000 a month the function refuses. `Math.min(a, b)` gives the smaller of two numbers, so the last payment is never more than what is owed. The loop has two ways to stop: the loan is repaid, or 600 months have passed. The first check refuses hopeless loans before the loop even starts.

With 0% interest the recurrence becomes arithmetic (subtract ₦30,000 a month), and the answer is easy to check by hand: four months, the last one ₦10,000. Checking a general routine on a special case you can solve by hand is one of the best tests there is.

## Pitfalls: off-by-one, drift and overflow

### Off-by-one: which term is "month 12"?

If *a*0 is the start, then after 12 months you want *a*12, which takes 12 loop rounds, not 11 or 13. The two common loop shapes are `for (let m = 1; m <= 12; m++)` and `for (let m = 0; m < 12; m++)`; both run 12 times. Mixing them (`m = 0` with `m <= 12`) runs 13 times. Test with a case you can verify by hand: 1 month of 10% on ₦1,000 must give ₦1,100.

off-by-one.js

```ts
let rightCount = 0;
for (let m = 1; m <= 12; m++) rightCount = rightCount + 1;

let wrongCount = 0;
for (let m = 0; m <= 12; m++) wrongCount = wrongCount + 1;

console.log(rightCount, wrongCount);
console.log("one month check:", 1000 * 1.1 ** 1);
```

Output of `node off-by-one.js` and of the browser terminal

```ts
12 13
one month check: 1100
```

### Drift: small errors, many steps

A loop that multiplies a decimal hundreds of times lets floating-point errors pile up, and the result can differ from the formula in the last digits. For money that is not acceptable: round to whole kobo at each step, as the schedule did, because that is what the bank's ledger records. For estimates and charts, compare the loop with the formula and accept a tiny difference.

### Overflow: exponential sequences get huge

overflow.js

```ts
console.log(2 ** 53);
console.log(2 ** 53 + 1);
console.log(1.15 ** 5000);
console.log(1.15 ** 6000);
```

Output of `node overflow.js` and of the browser terminal

```ts
9007199254740992
9007199254740992
3.0846206955449947e+303
Infinity
```

Exponential sequences quickly pass `Number.MAX_SAFE_INTEGER`, above which whole numbers stop being exact: adding 1 to 253 did nothing. `e+303` means "times 10 to the power 303", and a little further on the numbers are too big to store at all and become `Infinity`. If a result can grow without limit, guard it, cap it, or use `BigInt` for exact whole numbers.

## Production concerns

- **The contract is the specification.** Compounding period, deposit timing, rounding rule and the order of "interest, then payment" all change the numbers. Get them in writing, and name them in the code.
- **Show schedules, not just totals.** A month-by-month table lets customers and support staff check the numbers, and lets you test each step.
- **Bound every loop that waits for a condition.** A maximum number of rounds turns a hang into an error message.
- **Display rates honestly.** Show the effective yearly rate next to a monthly one. In many countries, Nigeria included, regulators require lenders, especially digital lenders, to disclose the full cost of a loan clearly.

## Practice

TRY IT YOURSELF

### Find the rule

For each sequence, print the differences and the ratios between neighbours, decide whether it is arithmetic or geometric, and compute term 10 with a formula (the first term is term 0). A: 4500, 4350, 4200, 4050 (stock). B: 1000, 1200, 1440, 1728 (followers).

**Show a solution**

find-rule.js

```ts
const a = [4500, 4350, 4200, 4050];
const b = [1000, 1200, 1440, 1728];

for (let i = 1; i < a.length; i++) console.log("A diff", a[i] - a[i - 1], "ratio", (a[i] / a[i - 1]).toFixed(3));
for (let i = 1; i < b.length; i++) console.log("B diff", b[i] - b[i - 1], "ratio", (b[i] / b[i - 1]).toFixed(3));

console.log("A term 10:", 4500 + 10 * -150);
console.log("B term 10:", Math.round(1000 * 1.2 ** 10));
```

Output of `node find-rule.js` and of the browser terminal

```ts
A diff -150 ratio 0.967
A diff -150 ratio 0.966
A diff -150 ratio 0.964
B diff 200 ratio 1.200
B diff 240 ratio 1.200
B diff 288 ratio 1.200
A term 10: 3000
B term 10: 6192
```

A has a constant difference of −150, so it is arithmetic (falling). B has a constant ratio of 1.2, so it is geometric: the followers grow 20% per step.

TRY IT YOURSELF

### When does the exponential plan win?

Plan A pays you ₦1,000,000 now and ₦100,000 more each year. Plan B pays ₦800,000 now and 15% more each year. Use a loop to find the first year in which Plan B pays more than Plan A.

**Show a solution**

crossover.js

```ts
let planA = 1000000;
let planB = 800000;
let year = 0;
while (planB <= planA && year < 100) {
  year = year + 1;
  planA = planA + 100000;
  planB = planB * 1.15;
}
console.log(`year ${year}: A ₦${planA}, B ₦${Math.round(planB)}`);
```

Output of `node crossover.js` and of the browser terminal

```ts
year 5: A ₦1500000, B ₦1609086
```

The loop is capped at 100 years in case the plans never cross. For the first few years the linear plan is ahead; from year 5 the exponential one pays more, and the gap widens every year after.

TRY IT YOURSELF

### Savings goal with interest

A saver deposits ₦50,000 at the end of each month into an account paying 1% a month. Using the recurrence, find how many months until the balance reaches at least ₦1,000,000, and compare with how long it would take without interest.

**Show a solution**

savings-goal.js

```ts
let balance = 0;
let months = 0;
while (balance < 1000000 && months < 600) {
  months = months + 1;
  balance = balance * 1.01 + 50000;
}
console.log("with interest:", months, "months, balance ₦" + Math.round(balance));
console.log("without interest:", Math.ceil(1000000 / 50000), "months");
```

Output of `node savings-goal.js` and of the browser terminal

```ts
with interest: 19 months, balance ₦1040545
without interest: 20 months
```

Interest saves one month here. Over longer horizons the effect is much larger, because the interest itself keeps compounding.

## Recap

- A sequence is an ordered list of terms. Constant differences mean arithmetic (add *d*); constant ratios mean geometric (multiply by *r*). The real rule comes from the business or contract.
- Arithmetic: *a*n = *a*0 + *n* × *d*, and its sum is (terms) × (first + last) / 2. Geometric: *a*n = *a*0 × *r*n.
- Linear growth adds the same amount; exponential growth adds the same percentage and eventually overtakes any linear growth.
- Compound interest is geometric: *P* × (1 + *r*)n. More frequent compounding raises the effective rate.
- A recurrence defines each term from earlier ones, and a loop computes it one step at a time. Check loops against formulas and hand-solvable special cases.
- Bound every `while` loop, check that a loan payment exceeds the interest, count loop rounds carefully, and round money to kobo at each step.

Next: [Counting](https://zudojs.oyinlola.site/learn/logic-counting), where you count possibilities instead of naira: frequency tables, how many passwords or order combinations exist, and why trying them all quickly becomes impossible.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
