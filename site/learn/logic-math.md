---
title: "Mathematical reasoning — ZudoJS Academy"
description: "Use expressions, equations, ratios and percentages to compute discounts, VAT and interest, and keep money exact by counting in kobo, not decimals."
source: https://zudojs.oyinlola.site/learn/logic-math
---

LEVEL 1 · LESSON 13 OF 18

Logic and mathematical thinking Foundation

# Mathematical reasoning

Use expressions, equations, ratios and percentages to compute discounts, VAT and interest, and keep money exact by counting in kobo, not decimals.

- **50 min** to read and try
- **You need:** Boolean logic and Conditional reasoning
- **You build:** An invoice calculator that works in whole kobo, applies discounts and 7.5% VAT, splits a bill fairly and never loses a kobo

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Read and write expressions, and tell a mathematical equation from a JavaScript assignment
- Model a rule as a function and solve simple equations and inequalities for the unknown, then check the answer by substitution
- Compute ratios, percentages, discounts, VAT and simple interest, including reverse VAT and successive discounts
- Explain why 0.1 + 0.2 is not 0.3, and keep money exact as whole kobo with one deliberate rounding step
- Split an amount into parts that always add back up to the whole

## The customer paid exactly, and the till said "short"

A supermarket till adds up a customer's items: a bag of rice at ₦1,999.99, a tin of tomatoes at ₦450.70 and a loaf of bread at ₦250.30. The screen shows ₦2,700.99. The customer pays exactly ₦2,700.99 by transfer, and the till refuses the sale:

short.js

```ts
const prices = [1999.99, 450.7, 250.3];

let total = 0;
for (const price of prices) {
  total = total + price;
}

const paid = 2700.99;
console.log("total:", total);
if (paid >= total) {
  console.log("Payment complete");
} else {
  console.log("Payment short by", total - paid);
}
```

Output of `node short.js` and of the browser terminal

```ts
total: 2700.9900000000002
Payment short by 4.547473508864641e-13
```

The total is not ₦2,700.99; it is a tiny bit more. The difference, written `4.547…e-13` (scientific notation: about 0.00000000000045), is far less than one kobo, but `>=` does not care how small a difference is. The display rounded the total to two decimals, so nobody could see it.

This lesson is about the mathematics inside programs: expressions, functions, equations, ratios and percentages, which you need for discounts, VAT, interest and bill splitting. It is not about hard maths. It is about being *exact*: knowing which numbers a computer can hold precisely, where rounding must happen, and how to check an answer. By the end you will see why the till above should never have used decimals for money at all.

## Variables and expressions

In mathematics, a **variable** is a letter that stands for a number: in "the price of *n* loaves at ₦250 each is 250*n*", *n* is a variable. An **expression** is a combination of numbers, variables and operations that has a value once you know the variables: `250 * n`, `price * quantity + deliveryFee`.

JavaScript expressions work the same way, with the same order of operations you learned at school: parentheses first, then `**` (power), then `*`, `/` and `%`, then `+` and `-`:

expressions.js

```ts
const price = 250;
const quantity = 4;
const deliveryFee = 1500;

console.log(price * quantity + deliveryFee);     // multiplication first
console.log(price * (quantity + deliveryFee));   // parentheses change it
console.log(2 ** 10);                            // 2 to the power 10
console.log(23 % 6);                             // remainder of 23 / 6
```

Output of `node expressions.js` and of the browser terminal

```ts
2500
376000
1024
5
```

`%` is the **remainder** operator: 23 divided by 6 is 3 with 5 left over, so `23 % 6` is 5. It answers everyday questions: is a number even (`n % 2 === 0`)? How many eggs are left after filling boxes of 6?

### = in maths and = in code

In mathematics, `x = x + 1` is a false statement: no number equals itself plus one. In JavaScript it is an instruction: "compute `x + 1`, then store the result in `x`". The `=` in code is **assignment**; it has a direction, right to left. Equality, the mathematical meaning, is written `===` and gives a boolean.

assign.js

```ts
let stock = 10;
stock = stock - 3;           // assignment: take 3 out of stock
console.log(stock);
console.log(stock === 7);    // equality: a question, true or false
```

Output of `node assign.js` and of the browser terminal

```ts
7
true
```

### Whole division: floor, ceil and remainder

Many business questions divide and then need a whole number. `Math.floor(x)` rounds *down* to a whole number and `Math.ceil(x)` rounds *up*. Which one is right depends on the question, not on the numbers:

whole-division.js

```ts
const eggs = 23;
const perBox = 6;

console.log("full boxes:", Math.floor(eggs / perBox));   // you can only sell full boxes
console.log("boxes needed:", Math.ceil(eggs / perBox));  // to pack every egg
console.log("eggs left over:", eggs % perBox);

const budget = 20000;
const itemPrice = 2500;
console.log("items you can afford:", Math.floor(budget / itemPrice));
```

Output of `node whole-division.js` and of the browser terminal

```ts
full boxes: 3
boxes needed: 4
eggs left over: 5
items you can afford: 8
```

"How many can I fill or afford?" rounds down; you cannot buy 8.7 items. "How many do I need to hold everything?" rounds up; 3.8 boxes means 4 boxes. Picking the wrong one gives an answer that is off by one, which you will meet again in [Why doesn't this work?](https://zudojs.oyinlola.site/learn/solve-broken).

## Functions: rules that turn inputs into outputs

A **mathematical function** is a rule that gives exactly one output for each input: *f*(*x*) = 2*x* + 3 turns 5 into 13, always. A delivery price list is a function: the input is the order total, the output is the fee. A JavaScript function can model the same rule, and when it depends only on its inputs, it behaves exactly like the mathematical one:

delivery-fee.js

```ts
// Delivery: ₦2,000 under ₦10,000; ₦1,000 up to ₦50,000; free above that.
function deliveryFee(orderTotal) {
  if (orderTotal < 10000) return 2000;
  if (orderTotal <= 50000) return 1000;
  return 0;
}

for (const total of [9999, 10000, 50000, 50001]) {
  console.log(total, "->", deliveryFee(total));
}
```

Output of `node delivery-fee.js` and of the browser terminal

```ts
9999 -> 2000
10000 -> 1000
50000 -> 1000
50001 -> 0
```

A function defined in pieces like this is called **piecewise**. The interesting inputs are the boundaries where one piece ends and the next begins; that is why the loop tests 9,999, 10,000, 50,000 and 50,001, exactly as in [Conditional reasoning](https://zudojs.oyinlola.site/learn/logic-conditions#inverting).

## Equations and inequalities: solving for the unknown

An **equation** says two expressions are equal and asks which value of the variable makes it true. Programs need this whenever they know the result and must find the input.

A shop prints prices *including* VAT. Nigeria's VAT rate is 7.5%, so a price including VAT is the net price times 1.075. A receipt must show the net price and the VAT separately. The equation is:

```ts
net × 1.075 = 10,750
```

Divide both sides by 1.075 to get *net* on its own: *net* = 10,750 ÷ 1.075 = 10,000. Rearranging an equation like this, doing the same thing to both sides until the unknown stands alone, is how you turn "I know the result" into a formula for the input.

### Check by substitution

The most useful habit from school maths: after you solve an equation, put the answer back in and see whether it works. In code, that is a test:

reverse-vat.js

```ts
function netFromGross(gross) {
  return gross / 1.075;
}

const gross = 10750;
const net = netFromGross(gross);
console.log("net:", net);
console.log("check: net * 1.075 =", net * 1.075, "->", net * 1.075 === gross);
```

Output of `node reverse-vat.js` and of the browser terminal

```ts
net: 10000
check: net * 1.075 = 10750 -> true
```

### Inequalities

An **inequality** uses `<`, `<=`, `>` or `>=` instead of `=`, and its answer is a range of values rather than one. "Ada saves ₦15,000 a month. After how many months does she have at least ₦100,000?" is the inequality 15,000 × *m* ≥ 100,000. Dividing both sides by 15,000 gives *m* ≥ 6.67. The months are whole, so the smallest answer is 7: a `Math.ceil` question. You can also let a loop find it, which is the method that still works when there is no neat formula:

months.js

```ts
const monthly = 15000;
const target = 100000;

console.log("by formula:", Math.ceil(target / monthly));

let months = 0;
let saved = 0;
while (saved < target) {
  months = months + 1;
  saved = saved + monthly;
}
console.log("by loop:", months, "months, saved", saved);
```

Output of `node months.js` and of the browser terminal

```ts
by formula: 7
by loop: 7 months, saved 105000
```

Two methods that agree are strong evidence that both are right. The loop runs while the condition `saved < target` is true, which is the *opposite* of the goal `saved >= target`: De Morgan again. [Sequences](https://zudojs.oyinlola.site/learn/logic-sequences) uses the same kind of loop for savings that earn interest, where no simple division works.

## Ratios and proportions

A **ratio** compares quantities: two business partners share profit in the ratio 2 : 3, meaning for every 2 parts the first gets, the second gets 3. There are 5 parts in total, so the first gets 2/5 of the profit and the second 3/5. A **proportion** says two ratios are equal, which lets you scale: if 3 kg of rice costs ₦4,500, then 5 kg costs 4,500 × 5/3 = ₦7,500.

Ratios are also how you compare prices fairly. The **unit price** is the price divided by the quantity, the price of one gram or one litre:

unit-price.js

```ts
const small = { grams: 400, price: 1800 };
const large = { grams: 900, price: 3800 };

const smallPerGram = small.price / small.grams;
const largePerGram = large.price / large.grams;

console.log("small: ₦" + smallPerGram.toFixed(2) + " per gram");
console.log("large: ₦" + largePerGram.toFixed(2) + " per gram");
console.log(largePerGram < smallPerGram ? "large is cheaper per gram" : "small is cheaper per gram");
```

Output of `node unit-price.js` and of the browser terminal

```ts
small: ₦4.50 per gram
large: ₦4.22 per gram
large is cheaper per gram
```

`x.toFixed(2)` turns a number into text with exactly two decimals, rounding as needed. Use it only for *display*; it gives back a string, not a number. The `+` between a string and a number joins them as text.

## Percentages: discounts, VAT and interest

**Per cent** means "per hundred". 15% is 15/100 = 0.15. Three calculations cover almost every percentage question in business software:

| Question | Formula | Example |
| --- | --- | --- |
| What is *p*% of *x*? | *x* × *p* / 100 | 15% of ₦8,000 = ₦1,200 |
| *x* increased by *p*% | *x* × (1 + *p*/100) | ₦10,000 + 7.5% VAT = ₦10,750 |
| *x* decreased by *p*% | *x* × (1 − *p*/100) | ₦8,000 − 15% = ₦6,800 |
| What percentage is *a* of *b*? | *a* / *b* × 100 | ₦1,200 of ₦8,000 is 15% |
| Percentage change from *old* to *new* | (*new* − *old*) / *old* × 100 | ₦8,000 to ₦9,000 is +12.5% |

percent.js

```ts
const price = 8000;

console.log("15% of price:", price * 15 / 100);
console.log("after 15% discount:", price * (1 - 15 / 100));
console.log("with 7.5% VAT:", 10000 * (1 + 7.5 / 100));
console.log("change 8000 -> 9000:", (9000 - 8000) / 8000 * 100, "%");
```

Output of `node percent.js` and of the browser terminal

```ts
15% of price: 1200
after 15% discount: 6800
with 7.5% VAT: 10750
change 8000 -> 9000: 12.5 %
```

### Percentages do not add

Two traps catch people who treat percentages like plain numbers.

**Successive discounts multiply.** A 20% sale, then a 10% loyalty discount on the sale price, is not 30% off. The second discount applies to a smaller number.

**Up then down does not return to the start.** A price raised by 20% and then cut by 20% ends below where it started, because the cut is 20% of the *higher* price.

percent-traps.js

```ts
const price = 10000;

const twoDiscounts = price * (1 - 0.2) * (1 - 0.1);
console.log("20% then 10%:", twoDiscounts, "=", (price - twoDiscounts) * 100 / price, "% off");

const upThenDown = price * 1.2 * 0.8;
console.log("+20% then -20%:", upThenDown);
```

Output of `node percent-traps.js` and of the browser terminal

```ts
20% then 10%: 7200 = 28 % off
+20% then -20%: 9600
```

A related confusion: if an interest rate goes from 5% to 7%, it rose by 2 **percentage points**, but by 40 **per cent** (2 is 40% of 5). Say which one you mean; loan adverts rely on people mixing them up.

### Simple interest

**Simple interest** pays the same amount every year: *interest* = *principal* × *rate* × *years*, where the principal is the amount saved or borrowed. ₦200,000 at 10% a year for 3 years earns 200,000 × 0.10 × 3 = ₦60,000. Most real savings accounts pay **compound** interest instead, where each year's interest itself earns interest; that is a sequence, and it is the main example in the next lesson, [Sequences](https://zudojs.oyinlola.site/learn/logic-sequences).

## Why 0.1 + 0.2 is not 0.3

Back to the till. JavaScript stores numbers in a format called **floating point** (the standard is IEEE 754, used by almost every language). It stores numbers in binary, base 2. In binary, many simple decimal fractions have no exact form, just as 1/3 has no exact decimal form (0.3333… never ends). So `0.1` is stored as the closest binary number, which is a tiny bit off, and the tiny errors show up when you calculate:

float.js

```ts
console.log(0.1 + 0.2);
console.log(0.1 + 0.2 === 0.3);
console.log(1.15 * 100);
console.log(3 * 1.1);

let total = 0;
for (let i = 0; i < 10; i++) {
  total = total + 0.1;
}
console.log("ten times 0.1:", total);
```

Output of `node float.js` and of the browser terminal

```ts
0.30000000000000004
false
114.99999999999999
3.3000000000000003
ten times 0.1: 0.9999999999999999
```

Whole numbers do not have this problem. Every whole number up to 9,007,199,254,740,991 (`Number.MAX_SAFE_INTEGER`) is stored exactly, and adding, subtracting and multiplying whole numbers in that range gives exact results. That fact is the whole solution for money.

> Do not "fix" it with toFixed
>
> Rounding with `toFixed` hides the error on screen but leaves it in the number, as the till showed: the display said ₦2,700.99 while the comparison saw the extra bit. `toFixed` also has its own surprises: `(1.005).toFixed(2)` gives `"1.00"`, because 1.005 is really stored as 1.00499999…

## Money as whole kobo

A naira is 100 kobo. If you store every amount as a whole number of kobo, ₦1,999.99 becomes `199999`, and every addition and subtraction is exact. You convert to naira only at the edges: when reading what a person typed, and when showing an amount on screen. This is how banks and payment providers such as Paystack and Stripe handle amounts: their APIs take amounts in the smallest unit (kobo, cents).

kobo.js

```ts
const pricesKobo = [199999, 45070, 25030];

let totalKobo = 0;
for (const price of pricesKobo) {
  totalKobo = totalKobo + price;
}

const paidKobo = 270099;
console.log("total:", totalKobo);
console.log(paidKobo >= totalKobo ? "Payment complete" : "Payment short");

function formatNaira(kobo) {
  return "₦" + (kobo / 100).toFixed(2);
}
console.log(formatNaira(totalKobo));
```

Output of `node kobo.js` and of the browser terminal

```ts
total: 270099
Payment complete
₦2700.99
```

The till bug is gone, and the conversion to naira happens in one place, only for display. For nicer display with thousands separators, JavaScript's built-in `Intl.NumberFormat` formats currency for a given locale:

format.js

```ts
const naira = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });
console.log(naira.format(270099 / 100));
console.log(naira.format(5000000 / 100));
```

Output of `node format.js` and of the browser terminal

```ts
₦2,700.99
₦50,000.00
```

### Where rounding must happen

Addition and subtraction of kobo never need rounding. Percentages do: 7.5% VAT on 2,450 kobo is 183.75 kobo, and you cannot charge three-quarters of a kobo. So there is exactly one rounding step, and you must decide:

- **How** to round. `Math.round` rounds to the nearest whole number, with halves going up (183.5 becomes 184). Tax authorities and payment contracts sometimes specify a rule; follow it.
- **When** to round: on each line of the invoice, or once on the total. The answers can differ.

To avoid a floating-point rate like 0.075, store rates as whole **basis points**: one basis point is 1/100 of a per cent, so 7.5% is 750 basis points, and VAT is `amount * 750 / 10000`. The multiplication stays in whole numbers, and there is only one division, right before the rounding.

REASON IT OUT

### Round each line, or round the total?

A kiosk sells sachets of water at ₦24.50 (2,450 kobo). A customer buys 3. VAT is 7.5%. Before running any code:

- What is the exact VAT on one sachet, in kobo? On three?
- If you round the VAT on each line and add, what do you get? If you add the lines and round once?
- Which one is "right"? Who decides?
- Whatever you choose, what must be true of the numbers printed on the receipt?

**Show the reasoning**

Exact VAT on one sachet is 2,450 × 750 / 10,000 = 183.75 kobo; on three it is 551.25 kobo.

Rounding each line gives 184 × 3 = 552 kobo. Rounding the total gives 551 kobo. They differ by one kobo, because each line rounded up by a quarter kobo and three quarters add up to more than a half.

Neither is wrong mathematically; it is a business and legal rule, and tax rules in many countries specify one. Your job is to ask, implement the chosen rule in *one* function, and use that function everywhere, so that the website, the app and the receipt printer never disagree.

Whichever you choose, the receipt must add up: the printed lines must sum to the printed total. If you round per line, the total VAT is the sum of the rounded lines; you must not round the total separately and print a different number.

round-when.js

```ts
function vatKobo(amountKobo, rateBasisPoints) {
  return Math.round(amountKobo * rateBasisPoints / 10000);
}

const sachet = 2450;
const quantity = 3;
const vatRate = 750;   // 7.5%

const perLine = vatKobo(sachet, vatRate) * quantity;
const onTotal = vatKobo(sachet * quantity, vatRate);

console.log("exact VAT on one sachet:", sachet * vatRate / 10000);
console.log("rounded per line:", perLine);
console.log("rounded on total:", onTotal);
```

Output of `node round-when.js` and of the browser terminal

```ts
exact VAT on one sachet: 183.75
rounded per line: 552
rounded on total: 551
```

## Splitting an amount without losing a kobo

Three friends split a ₦100.00 bill. ₦100 / 3 is ₦33.333…, and rounding each share to ₦33.33 collects only ₦99.99. A kobo vanished. In a payments system, vanished kobo are real money that someone must account for.

The fix works in whole kobo: give everyone the rounded-down share, work out how many kobo are left over with `%`, and hand those out one each to the first few people:

split.js

```ts
function splitKobo(totalKobo, people) {
  const base = Math.floor(totalKobo / people);
  const leftover = totalKobo % people;
  const shares = [];
  for (let i = 0; i < people; i++) {
    shares.push(i < leftover ? base + 1 : base);
  }
  return shares;
}

const shares = splitKobo(10000, 3);
console.log(shares);

let sum = 0;
for (const share of shares) sum = sum + share;
console.log("sum:", sum, sum === 10000 ? "(nothing lost)" : "(MONEY LOST)");

console.log(splitKobo(100, 6));
```

Output of `node split.js` and of the browser terminal

```json
[ 3334, 3333, 3333 ]
sum: 10000 (nothing lost)
[ 17, 17, 17, 17, 16, 16 ]
```

`shares.push(x)` adds `x` to the end of an array. The leftover is always smaller than the number of people (a remainder always is), so no one gets more than one extra kobo, and the shares always add back to the total. The same technique splits a payment between a seller and a platform fee, or spreads a discount across the lines of an invoice.

A ratio split works the same way. To share profit 2 : 3, compute each share rounded down from its fraction, then give the leftover kobo out one at a time. Exercise 1 asks you to do it.

## Build: an invoice in kobo

Put the pieces together. The invoice has lines (unit price in kobo and quantity), an optional percentage discount on the subtotal, and 7.5% VAT on the discounted amount. The rules the business chose: discount and VAT are each rounded once, on the whole amount, with `Math.round`. The function checks its inputs first, and the output shows that the printed numbers add up:

invoice.js

```ts
function percentOf(amountKobo, basisPoints) {
  return Math.round(amountKobo * basisPoints / 10000);
}

function formatNaira(kobo) {
  return "₦" + (kobo / 100).toFixed(2);
}

function invoice(lines, discountBasisPoints, vatBasisPoints) {
  let subtotal = 0;
  for (const line of lines) {
    if (!Number.isInteger(line.priceKobo) || line.priceKobo < 0) throw new Error("bad price: " + line.name);
    if (!Number.isInteger(line.quantity) || line.quantity < 1) throw new Error("bad quantity: " + line.name);
    subtotal = subtotal + line.priceKobo * line.quantity;
  }
  const discount = percentOf(subtotal, discountBasisPoints);
  const afterDiscount = subtotal - discount;
  const vat = percentOf(afterDiscount, vatBasisPoints);
  const total = afterDiscount + vat;
  return { subtotal, discount, vat, total };
}

const lines = [
  { name: "Rice 5kg", priceKobo: 1250000, quantity: 1 },
  { name: "Tomato tin", priceKobo: 45070, quantity: 3 },
  { name: "Water sachet", priceKobo: 2450, quantity: 3 },
];

const result = invoice(lines, 1000, 750);     // 10% discount, 7.5% VAT
console.log("subtotal:", formatNaira(result.subtotal));
console.log("discount:", formatNaira(result.discount));
console.log("VAT:     ", formatNaira(result.vat));
console.log("total:   ", formatNaira(result.total));
console.log("adds up:", result.subtotal - result.discount + result.vat === result.total);

try {
  invoice([{ name: "Bread", priceKobo: 250.3, quantity: 1 }], 0, 750);
} catch (error) {
  console.log(error.message);
}
```

Output of `node invoice.js` and of the browser terminal

```ts
subtotal: ₦13925.60
discount: ₦1392.56
VAT:      ₦939.98
total:    ₦13473.02
adds up: true
bad price: Bread
```

Things to notice:

- The function returns an object: `{ subtotal, discount, vat, total }` is short for `{ subtotal: subtotal, discount: discount, … }`.
- Only two numbers are ever rounded (discount and VAT), each once, each in the same helper. Everything else is whole-number addition and multiplication, which is exact.
- A price in naira with decimals (`250.3`) is refused, not silently accepted. Mixing naira and kobo is the most common money bug of all, and a guard catches it at the door. `throw new Error(…)` stops the function with an error message, and `try`/`catch` catches it; [Handling errors](https://zudojs.oyinlola.site/learn/js-errors), in the JavaScript course, covers them.

## Production concerns

- **Kobo everywhere inside, naira only at the edges.** Name variables with their unit (`priceKobo`, `totalKobo`) so a mix-up is visible in the code.
- **Currencies differ.** The naira and the US dollar have 100 minor units; the Japanese yen has none, and the Kuwaiti dinar has 1,000. A system handling several currencies stores the currency next to every amount and looks up the number of minor units.
- **Size limits.** `Number.MAX_SAFE_INTEGER` kobo is about ₦90 trillion, enough for a shop but not for every national-scale total. Beyond it, JavaScript's `BigInt` type holds whole numbers of any size exactly. Databases have exact decimal types (`NUMERIC`), and you will meet them in [How databases work](https://zudojs.oyinlola.site/learn/databases).
- **One rounding rule, one function.** Write the rule down (half up, per line or per total), implement it once, and test the boundary cases: exactly half a kobo, just under, just over.
- **Parse carefully.** A person types "2,700.99". Turning that text into 270099 kobo without going through a floating-point number (split on the dot, check the digits) is safer than `Math.round(parseFloat(text) * 100)`, which can land on the wrong side of a half.

## Practice

TRY IT YOURSELF

### Split profit by ratio

Two partners share ₦100,000.01 of profit (10,000,001 kobo) in the ratio 2 : 3. Compute each share in whole kobo so that the shares add up exactly to the total. Hint: compute the first share rounded down, and give the second partner the rest.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Out of a 2 : 3 split, the first partner's share is 2/5 of the total.

HINT 2

`const first = Math.floor(profitKobo * 2 / 5);`

SOLUTION

ratio-split.js

```ts
const profitKobo = 10000001;
const first = Math.floor(profitKobo * 2 / 5);
const second = profitKobo - first;

console.log(first, second);
console.log("adds up:", first + second === profitKobo);
console.log("ratio check:", (first / second).toFixed(4), "vs", (2 / 3).toFixed(4));
```

Output of `node ratio-split.js` and of the browser terminal

```ts
4000000 6000001
adds up: true
ratio check: 0.6667 vs 0.6667
```

Computing the last share as "total minus the others" guarantees the parts add up; the leftover kobo goes to the last partner. With more partners, use the leftover-distribution idea from `splitKobo`. The ratio check confirms the split is still 2 : 3 to four decimals.

TRY IT YOURSELF

### Reverse VAT in kobo

Shelf prices include 7.5% VAT. Write `splitGross(grossKobo)` returning `{ net, vat }` in whole kobo so that `net + vat` is exactly the gross price. Try ₦10,750.00 and ₦24.50.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Solve *net* × 1.075 = *gross* for *net*: *net* = *gross* ÷ 1.075, written with whole numbers as `gross * 10000 / 10750`.

HINT 2

`const net = Math.round(grossKobo * 10000 / 10750);`

SOLUTION

split-gross.js

```ts
function splitGross(grossKobo) {
  const net = Math.round(grossKobo * 10000 / 10750);
  const vat = grossKobo - net;
  return { net, vat };
}

console.log(splitGross(1075000));
console.log(splitGross(2450));
```

Output of `node split-gross.js` and of the browser terminal

```json
{ net: 1000000, vat: 75000 }
{ net: 2279, vat: 171 }
```

Solving *net* × 1.075 = *gross* gives *net* = *gross* ÷ 1.075, written with whole numbers as `gross * 10000 / 10750`. Only the net is rounded; the VAT is the difference, so the two always add back to the shelf price. Check by substitution: 1,000,000 + 75,000 = 1,075,000.

TRY IT YOURSELF

### Best deal

A customer has a ₦10,000 basket. Offer A is 25% off. Offer B is 15% off, then another 10% off the reduced price. Offer C is ₦2,400 off. Compute the final price of each in whole naira, and print the best offer.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Write each percentage as `(100 - p) / 100` with whole numbers: `offerA = basket * (100 - 25) / 100`.

HINT 2

Two `if` statements, one for `offerB` and one for `offerC`, each comparing against the current `bestPrice` and updating both `best` and `bestPrice` on a lower find.

SOLUTION

best-deal.js

```ts
const basket = 10000;
const offerA = basket * (100 - 25) / 100;
const offerB = basket * (100 - 15) / 100 * (100 - 10) / 100;
const offerC = basket - 2400;

console.log("A:", offerA, "B:", offerB, "C:", offerC);

let best = "A";
let bestPrice = offerA;
if (offerB < bestPrice) {
  best = "B";
  bestPrice = offerB;
}
if (offerC < bestPrice) {
  best = "C";
  bestPrice = offerC;
}
console.log("best:", best, bestPrice);
```

Output of `node best-deal.js` and of the browser terminal

```ts
A: 7500 B: 7650 C: 7600
best: A 7500
```

Offer B looks like "25% off" but is only 23.5% off, because the second discount applies to ₦8,500, not ₦10,000. Writing the percentages as `(100 - p) / 100` with whole numbers keeps the intermediate values exact here.

## Recap

- An expression combines values with operators in a fixed order; `%` gives the remainder. `=` assigns, `===` asks whether two values are equal.
- `Math.floor` answers "how many can I fill or afford", `Math.ceil` answers "how many do I need".
- Solve equations by doing the same to both sides, then check by substituting the answer back: that check is your test.
- *p*% of *x* is *x* × *p* / 100. Successive discounts multiply; +20% then −20% does not return to the start; percentage points are not per cent.
- Floating point cannot store 0.1 exactly, so never compare money decimals with `===` or `>=`. Store whole kobo, round once with a stated rule, and format only for display.
- Split amounts with floor plus leftover distribution, or compute the last part as "total minus the others", so the parts always add up to the whole.

Next: [Sequences](https://zudojs.oyinlola.site/learn/logic-sequences), where numbers change step by step: instalments, savings with compound interest, and the difference between linear and exponential growth.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
