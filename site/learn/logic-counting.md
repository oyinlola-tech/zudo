---
title: "Counting — ZudoJS Academy"
description: "Count with loops and frequency tables, count possibilities with permutations and combinations, and see why trying every option soon becomes impossible."
source: https://zudojs.oyinlola.site/learn/logic-counting
---

LEVEL 1 · LESSON 15 OF 18

Logic and mathematical thinking Foundation

# Counting

Count with loops and frequency tables, count possibilities with permutations and combinations, and see why trying every option soon becomes impossible.

- **45 min** to read and try
- **You need:** Sets and Sequences
- **You build:** A frequency report for a shop's orders and a calculator that says how long it takes to guess a PIN or password

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Count items that meet a condition, and count whole-number ranges without fencepost errors
- Build a frequency table with an object and find the most common value
- Count possibilities with the multiplication and addition principles, including PINs and passwords
- Tell permutations from combinations and compute both, checking the formulas against brute-force loops
- Explain why brute force explodes, and use counting to judge whether a search or an attack is feasible

## A 4-digit code, guessed in 17 minutes

A small fintech app lets customers reset their transaction PIN. It sends a 4-digit code by SMS, and the customer types it into the app. The developer thought 4 digits was plenty: "nobody can guess a random number". But the check behind the app accepts as many attempts as anyone sends. An attacker writes a script that tries codes one after another, ten per second:

pin-attack.js

```ts
const secretCode = "7351";           // the attacker does not know this
let attempts = 0;
let found = null;

for (let n = 0; n <= 9999; n++) {
  const guess = String(n).padStart(4, "0");   // 0 -> "0000", 42 -> "0042"
  attempts = attempts + 1;
  if (guess === secretCode) {
    found = guess;
    break;
  }
}

console.log("found", found, "after", attempts, "attempts");
console.log("worst case:", 10 ** 4, "attempts");
console.log("at 10 guesses a second, worst case takes", Math.ceil(10 ** 4 / 10 / 60), "minutes");
```

Output of `node pin-attack.js` and of the browser terminal

```ts
found 7351 after 7352 attempts
worst case: 10000 attempts
at 10 guesses a second, worst case takes 17 minutes
```

`String(n).padStart(4, "0")` turns a number into text and pads it with zeros on the left to 4 characters. `break` leaves the loop at once.

There are only 10,000 four-digit codes, and a computer tries them all before the SMS even expires. The code was not the weakness; the unlimited attempts were. To see that, you need to *count*: how many possibilities exist, and how many tries the attacker gets.

Counting is one of the most practical kinds of mathematics in programming. It tells you how many product variants a shop must stock, how many rows a report will have, whether a password is strong, and whether "just try every option" will finish in a second or in a million years. This lesson starts with counting things that exist (orders, ratings) and moves on to counting things that *could* exist (codes, arrangements, choices).

## Counting items: counters and fenceposts

The simplest counting program has a **counter**: a variable that starts at 0 and goes up by one each time a condition holds. Counting is not the same as summing: a counter adds 1 per match, a sum adds the item's value.

counter.js

```ts
const orderTotals = [4500, 12000, 8000, 25000, 10000, 3000, 15500];

let bigOrders = 0;
let bigRevenue = 0;
for (const total of orderTotals) {
  if (total >= 10000) {
    bigOrders = bigOrders + 1;        // count: add 1
    bigRevenue = bigRevenue + total;  // sum: add the value
  }
}
console.log(bigOrders, "orders of ₦10,000 or more, worth ₦" + bigRevenue);
```

Output of `node counter.js` and of the browser terminal

```ts
4 orders of ₦10,000 or more, worth ₦62500
```

### Counting a range: the fencepost error

How many invoice numbers are there from 105 to 112? The quick answer, 112 − 105 = 7, is wrong. Count them: 105, 106, 107, 108, 109, 110, 111, 112 is 8 numbers. A whole-number range from *a* to *b*, both included, has *b* − *a* + 1 numbers.

This is called the **fencepost error**: a 50-metre fence with a post every 10 metres needs 6 posts, not 5, because there is a post at both ends. The subtraction counts the *gaps* between posts; the posts are one more.

fencepost.js

```ts
const first = 105;
const last = 112;

let counted = 0;
for (let n = first; n <= last; n++) counted = counted + 1;

console.log("counted:", counted);
console.log("last - first:", last - first);
console.log("last - first + 1:", last - first + 1);
```

Output of `node fencepost.js` and of the browser terminal

```ts
counted: 8
last - first: 7
last - first + 1: 8
```

When in doubt, check the formula against a tiny case you can count on your fingers: from 3 to 3 is one number, and 3 − 3 + 1 = 1.

## Frequency tables

A shop owner asks: "Which products sell most?" and "How are customers rating us?". Both are answered by a **frequency table**: for each distinct value, how many times it appears. In code, the table is an **object** used as a lookup: the value is the property name, and the count is the property's value.

frequency.js

```ts
const soldItems = ["rice", "oil", "rice", "beans", "rice", "oil", "sugar", "rice"];

const counts = {};
for (const item of soldItems) {
  if (counts[item] === undefined) counts[item] = 0;
  counts[item] = counts[item] + 1;
}
console.log(counts);

let topItem = null;
let topCount = 0;
for (const item in counts) {
  if (counts[item] > topCount) {
    topItem = item;
    topCount = counts[item];
  }
}
console.log("best seller:", topItem, "sold", topCount, "times");
```

Output of `node frequency.js` and of the browser terminal

```json
{ rice: 4, oil: 2, beans: 1, sugar: 1 }
best seller: rice sold 4 times
```

New pieces of JavaScript:

- `counts[item]` reads or writes the property whose name is the value of `item`. When `item` is `"rice"`, it means `counts.rice`.
- A property that does not exist yet reads as `undefined`, so the first time an item appears its count is set to 0 before adding 1.
- `for (const item in counts)`, with `in` instead of `of`, loops over the property *names* of an object.

The most common value is called the **mode**. Notice the tie-break: if two items had the same top count, the `>` keeps the first one found. Whether that is right is a business question ("show both"? "show the newest"?), and your code should decide it on purpose.

### Frequencies of numbers: ratings

For ratings from 1 to 5 you know every possible value in advance, so you can list all of them, including those nobody chose. A rating that never appears should show as 0, not be missing from the report:

ratings.js

```ts
const ratings = [5, 4, 5, 3, 5, 1, 4, 5, 2, 5, 4];

const table = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
let sum = 0;
for (const r of ratings) {
  table[r] = table[r] + 1;
  sum = sum + r;
}

for (let stars = 5; stars >= 1; stars--) {
  const share = Math.round(table[stars] / ratings.length * 100);
  console.log(`${stars} stars: ${"#".repeat(table[stars]).padEnd(6)} ${table[stars]} (${share}%)`);
}
console.log("average:", (sum / ratings.length).toFixed(2), "from", ratings.length, "ratings");
```

Output of `node ratings.js` and of the browser terminal

```ts
5 stars: #####  5 (45%)
4 stars: ###    3 (27%)
3 stars: #      1 (9%)
2 stars: #      1 (9%)
1 stars: #      1 (9%)
average: 3.91 from 11 ratings
```

`"#".repeat(n)` repeats a string *n* times, which draws a small text bar chart. `padEnd(6)` adds spaces on the right so the numbers line up.

The percentages add up to 99%, not 100%, because each was rounded separately. You saw the same effect with money in [Mathematical reasoning](https://zudojs.oyinlola.site/learn/logic-math#splitting). For a display this is usually acceptable; for anything that must add up, distribute the rounding as you did with kobo.

## The multiplication principle

Now count things that *could* exist. A clothing shop sells a T-shirt in 3 sizes (S, M, L) and 4 colours (black, white, red, blue). How many different variants must the stock system track? Each variant is one size *and* one colour. For each of the 3 sizes there are 4 colours, so there are 3 × 4 = 12 variants.

That is the **multiplication principle**: if a choice is made in steps, and step 1 has *a* options and step 2 has *b* options whatever was picked in step 1, then there are *a* × *b* ways to make the whole choice. It extends to any number of steps. A nested loop lists the combinations, and its round count is exactly the product:

variants.js

```ts
const sizes = ["S", "M", "L"];
const colours = ["black", "white", "red", "blue"];

const skus = [];
for (const size of sizes) {
  for (const colour of colours) {
    skus.push(`TSHIRT-${size}-${colour}`);
  }
}
console.log(skus.length, "=", sizes.length, "x", colours.length);
console.log(skus.slice(0, 5));

const sleeves = ["short", "long"];
console.log("with sleeves:", sizes.length * colours.length * sleeves.length);
```

Output of `node variants.js` and of the browser terminal

```ts
12 = 3 x 4
[
  'TSHIRT-S-black',
  'TSHIRT-S-white',
  'TSHIRT-S-red',
  'TSHIRT-S-blue',
  'TSHIRT-M-black'
]
with sleeves: 24
```

`skus.slice(0, 5)` takes the first five items of the array. A **SKU** (stock keeping unit) is a code for one exact variant of a product. Adding one more option with 2 choices doubled the count: every new independent choice *multiplies*. You saw the same thing in [Boolean logic](https://zudojs.oyinlola.site/learn/logic-boolean#truth-tables): *n* true/false inputs give 2 × 2 × … × 2 = 2n rows.

### The addition principle: either this or that

Multiplication is for "this *and* that". For "this *or* that", when the options do not overlap, you add. A restaurant's lunch deal offers one main: one of 4 rice dishes or one of 3 swallows. That is 4 + 3 = 7 mains. With one of 5 soups as well, the whole deal is 7 × 5 = 35 lunches.

If the options overlap, adding counts the overlap twice. That is the rule |A ∪ B| = |A| + |B| − |A ∩ B| from [Sets](https://zudojs.oyinlola.site/learn/logic-sets#testing): subtract what you counted twice.

## Codes and passwords

A code of length *n*, where each position can be any of *k* symbols (repeats allowed), is *n* choices of *k* options each. By the multiplication principle there are *k* × *k* × … × *k* = *k*n codes. Length is the exponent, so it matters far more than the size of the alphabet:

password-space.js

```ts
function describe(label, symbols, length) {
  const count = symbols ** length;
  const seconds = count / 1e9;            // an attacker trying a billion guesses a second
  const years = seconds / (60 * 60 * 24 * 365);
  console.log(`${label}: ${count.toExponential(2)} codes, worst case ${years < 1 ? seconds.toFixed(0) + " seconds" : years.toExponential(1) + " years"}`);
}

describe("4-digit PIN          ", 10, 4);
describe("8 lower-case letters ", 26, 8);
describe("8 letters and digits ", 62, 8);
describe("12 letters and digits", 62, 12);
describe("16 lower-case letters", 26, 16);
```

Output of `node password-space.js` and of the browser terminal

```ts
4-digit PIN          : 1.00e+4 codes, worst case 0 seconds
8 lower-case letters : 2.09e+11 codes, worst case 209 seconds
8 letters and digits : 2.18e+14 codes, worst case 218340 seconds
12 letters and digits: 3.23e+21 codes, worst case 1.0e+5 years
16 lower-case letters: 4.36e+22 codes, worst case 1.4e+6 years
```

`1e9` is 1,000,000,000 in scientific notation, and `toExponential(2)` prints a number in that notation with 2 decimals: `2.09e+11` means 2.09 × 1011, about 209 billion. The `?` and `:` choose between seconds and years depending on the size.

The 8-character password with letters and digits falls in 218,340 seconds, about two and a half days. Four more characters push it to a hundred thousand years. Sixteen lower-case letters beat twelve letters-and-digits: a longer password with a small alphabet can be stronger than a short one with a big alphabet, because the length is the exponent. This is why security guidance now favours long passphrases over short passwords full of symbols.

> NOTE
>
> These numbers assume every code is equally likely. Real people choose `1234`, `0000` and `password1` far more often than random codes, and attackers try those first. Counting gives the *best case* for the defender; human choices make it worse.

REASON IT OUT

### Is a 4-digit reset code safe?

Go back to the SMS reset code from the start. The product team does not want longer codes, because people type them on phones. Before deciding anything, think:

- How many codes are there? What is the chance that one random guess is right?
- What does the attacker control, and what does the server control?
- If the server allowed only 3 attempts per code, what would the attacker's chance be?
- What else must be true for that limit to work? Think about what happens after the 3 attempts, and about how many codes the attacker can request.

**Show the reasoning**

There are 104 = 10,000 codes, so a single guess succeeds with probability 1 in 10,000. The attacker controls how many guesses they send; the server controls how many it *accepts*. With unlimited attempts, the attacker is certain to win. The size of the code only sets how long it takes.

With 3 attempts, the attacker's chance is 3 in 10,000, or 0.03%. That is the same 4-digit code, now reasonably safe, because the counting changed on the attacker's side.

The limit only works if it cannot be sidestepped. After 3 wrong attempts the code must be destroyed, not just "wait a minute". Requesting new codes must also be limited: 1,000 fresh codes with 3 guesses each is 3,000 guesses, about a 26% chance. (The quick estimate, 3,000 / 10,000 = 30%, is a little high: it counts the rounds where the attacker has already won as if they could win again.) And the code must expire quickly. These limits are called **rate limiting**, and every login, PIN and reset endpoint needs them. Counting told you which number to control.

## Permutations: when order matters

A shop's home page has 3 featured slots: first, second and third. There are 8 products to choose from, and each product can appear once. How many different home pages are possible?

Use the multiplication principle, one slot at a time: 8 products can go first; after that, 7 remain for second; then 6 for third. That is 8 × 7 × 6 = 336. An ordered selection without repeats like this is called a **permutation**.

If you arrange *all* 8 products, the count is 8 × 7 × 6 × 5 × 4 × 3 × 2 × 1. That product has a name: 8 **factorial**, written 8!. So the number of ways to arrange *n* things is *n*!, and the number of ordered selections of *k* from *n* is *n*! / (*n* − *k*)!, which is just the first *k* factors of *n*!.

permutations.js

```ts
function factorial(n) {
  let result = 1;
  for (let i = 2; i <= n; i++) result = result * i;
  return result;
}

function orderedSelections(n, k) {
  let result = 1;
  for (let i = 0; i < k; i++) result = result * (n - i);   // n × (n-1) × … (k factors)
  return result;
}

console.log("3 slots from 8:", orderedSelections(8, 3));
console.log("arrange all 8:", factorial(8));
console.log("check:", factorial(8) / factorial(5));

// brute force for a small case: list every ordered pick of 2 from 4
const products = ["rice", "oil", "beans", "sugar"];
let count = 0;
for (const first of products) {
  for (const second of products) {
    if (first !== second) count = count + 1;
  }
}
console.log("2 slots from 4, by listing:", count, "| formula:", orderedSelections(4, 2));
```

Output of `node permutations.js` and of the browser terminal

```ts
3 slots from 8: 336
arrange all 8: 40320
check: 336
2 slots from 4, by listing: 12 | formula: 12
```

The `first !== second` condition is what "no repeats" means in code. Without it, the loops would count 4 × 4 = 16, including "rice, rice". Checking a formula against a brute-force count on a small case is how you gain confidence that the formula counts what you think it counts.

## Combinations: when order does not matter

A pizza shop lets you choose 3 toppings from 8. Now "pepper, onion, chicken" and "chicken, pepper, onion" are the *same* pizza. An unordered selection is a **combination**, and there are fewer of them than permutations.

How many fewer? Every group of 3 toppings can be arranged in 3! = 6 orders, and the permutation count (336) counted each of those orders separately. So the number of combinations is 336 / 6 = 56. In general, the number of ways to choose *k* from *n*, written C(*n*, *k*) and read "*n* choose *k*", is

```ts
C(n, k) = n! / (k! × (n − k)!)  =  (ordered selections) / k!
```

combinations.js

```ts
function choose(n, k) {
  let result = 1;
  for (let i = 1; i <= k; i++) {
    result = result * (n - k + i) / i;   // stays a whole number at every step
  }
  return result;
}

console.log("3 toppings from 8:", choose(8, 3));
console.log("pairs among 6 products:", choose(6, 2));
console.log("choose all or none:", choose(8, 8), choose(8, 0));

// brute force: count unordered pairs by only counting (i, j) with i < j
const toppings = ["pepper", "onion", "chicken", "beef", "corn", "olive"];
let pairs = 0;
for (let i = 0; i < toppings.length; i++) {
  for (let j = i + 1; j < toppings.length; j++) {
    pairs = pairs + 1;
  }
}
console.log("pairs by listing:", pairs);
```

Output of `node combinations.js` and of the browser terminal

```ts
3 toppings from 8: 56
pairs among 6 products: 15
choose all or none: 1 1
pairs by listing: 15
```

The loop in `choose` multiplies and divides one step at a time instead of computing large factorials, which keeps the numbers small and exact. The brute-force loop avoids counting a pair twice by starting the inner loop at `i + 1`: it only counts "pepper, onion", never "onion, pepper".

### Pairs: n × (n − 1) / 2

C(*n*, 2) = *n* × (*n* − 1) / 2 is worth remembering, because pairs appear everywhere in programming. Comparing every customer record with every other one to find duplicates is C(*n*, 2) comparisons. For 1,000 customers that is 499,500; for 1,000,000 customers it is about 500 billion. That is why a program that checks duplicates pair by pair works in testing and dies in production, and why [sets](https://zudojs.oyinlola.site/learn/logic-sets#what) are used for duplicate detection instead.

| Question | Order matters? | Repeats allowed? | Count |
| --- | --- | --- | --- |
| PIN of length *n* from *k* digits | yes | yes | *k*n |
| Fill *k* ranked slots from *n* items | yes | no | *n*! / (*n* − *k*)! |
| Arrange all *n* items | yes | no | *n*! |
| Choose *k* of *n* items, as a group | no | no | C(*n*, *k*) |
| Any group of items, of any size | no | no | 2n |

The last row counts **subsets**: for each of the *n* items you decide "in" or "out", two options each, so 2n subsets in total, the same count as the rows of a truth table.

## Why brute force explodes

**Brute force** means solving a problem by trying every possibility. It is a perfectly good method when the number of possibilities is small, and counting tells you in advance whether it is. A delivery rider must visit *n* addresses and wants the shortest route. Trying every order means *n*! routes. Compare how the counts grow:

explosion.js

```ts
function factorial(n) {
  let result = 1;
  for (let i = 2; i <= n; i++) result = result * i;
  return result;
}

console.log("  n     n^2         2^n              n!");
for (const n of [5, 10, 15, 20, 25]) {
  console.log(
    String(n).padStart(3),
    String(n * n).padStart(7),
    String(2 ** n).padStart(11),
    factorial(n).toExponential(2).padStart(15),
  );
}

const perSecond = 1e9;
const secondsPerYear = 60 * 60 * 24 * 365;
console.log("20 stops, every route, a billion per second:", (factorial(20) / perSecond / secondsPerYear).toFixed(0), "years");
```

Output of `node explosion.js` and of the browser terminal

```ts
  n     n^2         2^n              n!
  5      25          32         1.20e+2
 10     100        1024         3.63e+6
 15     225       32768        1.31e+12
 20     400     1048576        2.43e+18
 25     625    33554432        1.55e+25
20 stops, every route, a billion per second: 77 years
```

With 10 stops, 3.6 million routes: a fast computer checks them in a moment. With 20 stops, about 77 years at a billion routes per second; with 25, about 490 million years. The problem did not get "a bit harder"; the count exploded. This is called a **combinatorial explosion**.

What to do when brute force explodes:

- **Count first.** Before writing "try every combination", compute how many there are. If it is more than about a billion, brute force will not finish.
- **Use structure.** Many problems have smarter algorithms that avoid most of the possibilities. You will study them in the algorithms course.
- **Accept "good enough".** Delivery companies use methods that find a *short* route quickly rather than the *shortest* route slowly.
- **Use it for defence.** Security depends on the same explosion: a strong password or a long random token is safe precisely because trying them all is impossible.

> Big counts lose precision
>
> Factorials outgrow exact JavaScript numbers fast: 18! is the last factorial below `Number.MAX_SAFE_INTEGER`. For exact large counts, use `BigInt`: write numbers with an `n` suffix (`25n`) and every operation stays exact, at any size.

bigint.js

```ts
let exact = 1n;
for (let i = 2n; i <= 25n; i++) exact = exact * i;
console.log(exact);

let approx = 1;
for (let i = 2; i <= 25; i++) approx = approx * i;
console.log(approx);
console.log(Number.isSafeInteger(approx));
```

Output of `node bigint.js` and of the browser terminal

```ts
15511210043330985984000000n
1.5511210043330986e+25
false
```

## Testing counting code

Counting formulas are easy to get subtly wrong: order or no order, repeats or not, a fencepost here and there. The reliable test has three parts:

1. **Tiny cases by hand.** C(4, 2) = 6: write the pairs out. 3! = 6: write the orders out.
2. **Brute force for small inputs.** A loop that lists every possibility is slow but obviously correct. Compare it with the formula for several small inputs.
3. **Edge cases.** Choosing 0 items (1 way: choose nothing), choosing all items (1 way), and asking for more items than exist (0 ways).

test-choose.js

```ts
function choose(n, k) {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) result = result * (n - k + i) / i;
  return result;
}

function countSubsetsOfSize(n, k) {
  let count = 0;
  for (let mask = 0; mask < 2 ** n; mask++) {     // every subset of n items
    let size = 0;
    for (let bit = 0; bit < n; bit++) {
      if (Math.floor(mask / 2 ** bit) % 2 === 1) size = size + 1;
    }
    if (size === k) count = count + 1;
  }
  return count;
}

let failures = 0;
for (let n = 0; n <= 8; n++) {
  for (let k = 0; k <= n; k++) {
    if (choose(n, k) !== countSubsetsOfSize(n, k)) {
      failures = failures + 1;
      console.log("mismatch at", n, k);
    }
  }
}
console.log("checked every n up to 8:", failures === 0 ? "all match" : failures + " mismatches");
console.log("edge cases:", choose(5, 0), choose(5, 5), choose(3, 5));
```

Output of `node test-choose.js` and of the browser terminal

```ts
checked every n up to 8: all match
edge cases: 1 1 0
```

The brute-force side lists all 2n subsets by counting from 0 to 2n − 1 and treating each number as a row of "in/out" switches, one binary digit per item, just like the rows of a truth table. It is slow for large *n*, which is fine: it only has to be right for small *n*, where it checks the fast formula.

## Production concerns

- **Rate-limit anything guessable.** PINs, reset codes, login forms and coupon codes all have a countable space. Limit attempts per code, per account and per client, expire codes quickly, and destroy a code after too many failures.
- **Make tokens uncountable.** Session tokens, password-reset links and API keys should be long random values (for example 128 bits, 2128 possibilities), generated by a cryptographic random source, never by `Math.random`.
- **Count before you enumerate.** Reports that list "all combinations" of filters, and tests that try "all inputs", need a count first. 10 filters with 5 options each is almost 10 million combinations.
- **Let the database count.** Frequency tables over millions of rows belong in SQL (`COUNT` with `GROUP BY`), not in a JavaScript loop over data loaded into memory. You will write those queries in [SQL with PostgreSQL](https://zudojs.oyinlola.site/learn/sql-basics).

## Practice

TRY IT YOURSELF

### Busiest hour

Each order has the hour (0 to 23) it was placed. Build a frequency table, print only the hours that had orders, and print the busiest hour.

**Show a solution**

busiest-hour.js

```ts
const orderHours = [9, 12, 13, 12, 18, 19, 12, 13, 19, 19, 12, 8];

const perHour = {};
for (const hour of orderHours) {
  if (perHour[hour] === undefined) perHour[hour] = 0;
  perHour[hour] = perHour[hour] + 1;
}

let busiest = null;
for (let hour = 0; hour <= 23; hour++) {
  if (perHour[hour] === undefined) continue;
  console.log(`${String(hour).padStart(2, "0")}:00  ${"#".repeat(perHour[hour])}`);
  if (busiest === null || perHour[hour] > perHour[busiest]) busiest = hour;
}
console.log("busiest hour:", busiest, "with", perHour[busiest], "orders");
```

Output of `node busiest-hour.js` and of the browser terminal

```ts
08:00  #
09:00  #
12:00  ####
13:00  ##
18:00  #
19:00  ###
busiest hour: 12 with 4 orders
```

Looping over the hours 0 to 23, rather than over the object's keys, prints them in time order and makes it easy to skip empty hours (or show them as 0, if the report needs every hour).

TRY IT YOURSELF

### Menu combinations

A lunch deal is: one main (4 rice dishes or 3 swallows), one protein (chicken, beef, fish or goat), and any 2 different sides from 5 (order does not matter). How many different lunches are there? Compute it with the principles, then confirm the sides count with a brute-force loop.

**Show a solution**

menu.js

```ts
const mains = 4 + 3;          // addition principle: rice OR swallow
const proteins = 4;

let sidePairs = 0;
for (let i = 0; i < 5; i++) {
  for (let j = i + 1; j < 5; j++) sidePairs = sidePairs + 1;
}
console.log("side pairs:", sidePairs, "| formula:", 5 * 4 / 2);
console.log("lunches:", mains * proteins * sidePairs);
```

Output of `node menu.js` and of the browser terminal

```ts
side pairs: 10 | formula: 10
lunches: 280
```

Mains add (it is one or the other), the three independent choices multiply, and the sides are a combination C(5, 2) = 10 because "rice and plantain" and "plantain and rice" are the same pair of sides.

TRY IT YOURSELF

### How long must a code be?

A voucher code uses the 32 symbols A to Z and 2 to 7 (no 0, 1, O or I, which people confuse). The shop will issue 100,000 vouchers, and wants the chance that a random guess hits *any* valid voucher to be below one in a million. Find the shortest length that works.

**Show a solution**

voucher-length.js

```ts
const symbols = 32;
const issued = 100000;

let length = 1;
while (issued / symbols ** length >= 1 / 1000000) {
  length = length + 1;
}
console.log("length:", length);
console.log("possible codes:", symbols ** length);
console.log("chance per guess:", (issued / symbols ** length).toExponential(2));
```

Output of `node voucher-length.js` and of the browser terminal

```ts
length: 8
possible codes: 1099511627776
chance per guess: 9.09e-8
```

The chance that one guess hits some valid voucher is (vouchers issued) / (possible codes). Each extra character multiplies the possible codes by 32, so the loop finds the first length where the chance falls below one in a million. Rate limiting is still needed: a million guesses would find a valid voucher with a chance of about 9%, and ten million guesses would expect to find about one.

## Recap

- A counter adds 1 per match; a sum adds values. The range *a* to *b* has *b* − *a* + 1 whole numbers (fenceposts, not gaps).
- A frequency table maps each value to its count; an object works as the table, and the mode is the value with the highest count.
- "And" choices multiply; non-overlapping "or" choices add. Codes of length *n* from *k* symbols: *k*n, so length matters most.
- Order matters: permutations, *n*! / (*n* − *k*)!. Order does not matter: combinations, C(*n*, *k*) = permutations / *k*!. Pairs: *n*(*n* − 1) / 2. Subsets: 2n.
- Counts like 2n and *n*! explode. Count before you brute-force, and let that same explosion protect your passwords and tokens, backed by rate limiting.
- Test counting formulas against brute-force loops on small inputs and against the edge cases 0, all, and too many.

Next: [Problem workshop: beginner](https://zudojs.oyinlola.site/learn/solve-beginner), where you put this whole course together: reason through ten everyday problems first, then code them.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
