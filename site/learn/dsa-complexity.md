---
title: "Big O and complexity — ZudoJS Academy"
description: "Measure how code grows with its input: count steps, state time and space complexity in Big O, Ω and Θ, spot hidden loops and see why push is cheap."
source: https://zudojs.oyinlola.site/learn/dsa-complexity
---

LEVEL 3 · LESSON 1 OF 21

Measuring code Core

# Big O and complexity

Measure how code grows with its input: count steps, state time and space complexity in Big O, Ω and Θ, spot hidden loops and see why push is cheap.

- **50 min** to read and try
- **You need:** Functions, Arrays, Loops and Recursion
- **You build:** Step-counting experiments and a growable array that proves push is amortized O(1)

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Count the steps a function takes and turn the count into Big O
- Tell Big O, Big Ω and Big Θ apart, and best, average and worst case
- Recognise O(1), O(log n), O(n), O(n log n), O(n²) and O(2ⁿ) code on sight
- Find hidden loops inside built-in methods and spread syntax
- Explain why Array push is amortized O(1) with a working growable array
- Test both the result and the growth rate of a function

## An import that got slow

An online shop imports each day's orders from its payment provider every night. Before saving them, the import checks that no order ID appears twice, because a duplicate would charge a customer twice. A developer wrote the check in five minutes and it worked perfectly: with 1,000 orders a day it finished before anyone noticed it ran.

Then the shop ran a December sale. The import received 60,000 orders, ran for many minutes and was killed by the server's time limit. Nothing about the code had changed. Only the input had grown.

Here is the check. It compares every order ID with every later one. A `counter` object counts the comparisons, so you can see how much work it does without using a clock. To make test data, the examples in this course use `Array.from({ length: n }, (_, i) => …)`: it builds an array of `n` items by calling the arrow function with each index `i` (the first parameter, written `_`, is unused), so `Array.from({ length: 3 }, (_, i) => \`ORD-${i + 1}\`)` is `["ORD-1", "ORD-2", "ORD-3"]`.

duplicate-check.js

```ts
function hasDuplicateNested(ids, counter) {
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      counter.steps++;
      if (ids[i] === ids[j]) return true;
    }
  }
  return false;
}

function orderIds(n) {
  return Array.from({ length: n }, (_, i) => `ORD-${i + 1}`);
}

for (const n of [1000, 2000, 4000]) {
  const counter = { steps: 0 };
  hasDuplicateNested(orderIds(n), counter);
  console.log(`${n} orders: ${counter.steps} comparisons`);
}
```

Output of `node duplicate-check.js` and of the browser terminal

```ts
1000 orders: 499500 comparisons
2000 orders: 1999000 comparisons
4000 orders: 7998000 comparisons
```

Look at the pattern, not the numbers. Each time the number of orders *doubles*, the work *quadruples*. At 60,000 orders that is about 1.8 billion comparisons. The code was always slow in this way; the small input only hid it.

Now the same check with a `Set`, which remembers every ID it has seen and can answer "have I seen this?" in one step:

duplicate-set.js

```ts
function hasDuplicateSet(ids, counter) {
  const seen = new Set();
  for (const id of ids) {
    counter.steps++;
    if (seen.has(id)) return true;
    seen.add(id);
  }
  return false;
}

function orderIds(n) {
  return Array.from({ length: n }, (_, i) => `ORD-${i + 1}`);
}

for (const n of [1000, 2000, 4000]) {
  const counter = { steps: 0 };
  hasDuplicateSet(orderIds(n), counter);
  console.log(`${n} orders: ${counter.steps} steps`);
}
```

Output of `node duplicate-set.js` and of the browser terminal

```ts
1000 orders: 1000 steps
2000 orders: 2000 steps
4000 orders: 4000 steps
```

Doubling the input now only doubles the work. At 60,000 orders the loop runs 60,000 times, not 1.8 billion.

This lesson gives you the vocabulary and the method to see this *before* the December sale: counting steps, describing how the count grows with **Big O notation**, and checking your claim with tests. Every later lesson in this course states the cost of each operation this way.

REASON IT OUT

### Before you replace the nested loop

Think these through before reading on:

1. What is the input, and what number describes its size?
2. Which input makes `hasDuplicateNested` do the most work: a list with a duplicate at the start, at the end, or no duplicate at all?
3. The `Set` version is faster. Does it cost anything the nested version does not?
4. Could two IDs be "the same order" but not `===` equal? What would each version do then?

**Show the reasoning**

1. The input is the array of IDs, and its size is its length. By convention that size is called `n`.
2. No duplicate at all. Both functions stop at the first duplicate they find, so an early duplicate is cheap. A clean list forces the nested version to compare every pair, and a clean list is the normal case for this import. That is why the example above used unique IDs.
3. Memory. The `Set` holds up to `n` IDs at once, while the nested loop only holds two counters. You traded memory for time. That trade is usually worth it, but it is a trade, and the section on [space complexity](#space) measures it.
4. `"ORD-7"` and `"ord-7 "` are different strings, so both versions miss that duplicate. Speed does not fix a wrong definition of "equal". Normalize the IDs (trim, upper-case) before either check.

## Count steps, not seconds

Why count comparisons instead of timing the code with a stopwatch? Because the time depends on things that have nothing to do with your algorithm:

- the machine (a laptop, a busy server, a phone),
- what else is running at the same moment,
- the JavaScript engine, which compiles hot code into faster machine code while it runs (this is called **just-in-time compilation**, or JIT),
- the garbage collector, which pauses now and then to free memory.

The number of steps depends only on the algorithm and the input. An **algorithm** is a precise, finite list of steps that turns an input into an output. A **step** (or *basic operation*) is anything that takes a fixed amount of time no matter how big the input is: a comparison, an addition, reading `prices[i]`, assigning a variable. You do not need to count every one. Count the one that runs most often, usually the work inside the innermost loop.

The count as a function of the input size is often written **T(n)**, "the time for an input of size `n`". Here are three functions over a list of prices in kobo (whole numbers, so there are no rounding errors), each counting the work in its inner loop:

count-steps.js

```ts
function cartTotal(prices, counter) {
  let total = 0;
  for (const price of prices) {
    counter.steps++;
    total += price;
  }
  return total;
}

function totalAndMax(prices, counter) {
  let total = 0;
  for (const price of prices) {
    counter.steps++;
    total += price;
  }
  let max = -Infinity;
  for (const price of prices) {
    counter.steps++;
    if (price > max) max = price;
  }
  return { total, max };
}

function cheaperPairs(prices, counter) {
  let pairs = 0;
  for (const a of prices) {
    for (const b of prices) {
      counter.steps++;
      if (a < b) pairs++;
    }
  }
  return pairs;
}

for (const n of [10, 100, 1000]) {
  const prices = Array.from({ length: n }, (_, i) => 50000 + (i % 7) * 25000);
  const counts = [cartTotal, totalAndMax, cheaperPairs].map((fn) => {
    const counter = { steps: 0 };
    fn(prices, counter);
    return counter.steps;
  });
  console.log(`n=${n}: cartTotal ${counts[0]}, totalAndMax ${counts[1]}, cheaperPairs ${counts[2]}`);
}
```

Output of `node count-steps.js` and of the browser terminal

```ts
n=10: cartTotal 10, totalAndMax 20, cheaperPairs 100
n=100: cartTotal 100, totalAndMax 200, cheaperPairs 10000
n=1000: cartTotal 1000, totalAndMax 2000, cheaperPairs 1000000
```

So `cartTotal` takes `n` steps, `totalAndMax` takes `2n` and `cheaperPairs` takes `n²` (n times n). If you counted every tiny operation you would get something like `3n + 2` for `cartTotal`. The next section shows why that detail does not matter.

## Big O: keep the part that grows

Suppose you counted everything in some function and got `T(n) = 3n² + 5n + 20`. Which part matters when `n` is large?

dominant-term.js

```ts
const T = (n) => 3 * n * n + 5 * n + 20;

for (const n of [10, 100, 1000, 100000]) {
  const share = (3 * n * n) / T(n);
  console.log(
    `n=${n}: T(n)=${T(n)}, the 3n² part is ${(share * 100).toFixed(2)}% of it, T(n)/n² = ${(T(n) / (n * n)).toFixed(4)}`,
  );
}
```

Output of `node dominant-term.js` and of the browser terminal

```ts
n=10: T(n)=370, the 3n² part is 81.08% of it, T(n)/n² = 3.7000
n=100: T(n)=30520, the 3n² part is 98.30% of it, T(n)/n² = 3.0520
n=1000: T(n)=3005020, the 3n² part is 99.83% of it, T(n)/n² = 3.0050
n=100000: T(n)=30000500020, the 3n² part is 100.00% of it, T(n)/n² = 3.0001
```

As `n` grows, the `n²` term swallows everything else, and `T(n)` behaves like "a constant times `n²`". **Big O notation** writes exactly that: `T(n)` is **O(n²)**, read "order n squared". Two rules turn a step count into Big O:

1. **Drop lower-order terms.** `5n + 20` is tiny next to `3n²` for large `n`.
2. **Drop constant factors.** `3n²` and `n²` grow the same way: double `n` and both quadruple. The constant depends on the machine anyway.

So `cartTotal` (`n`) and `totalAndMax` (`2n`) are both **O(n)**, **linear**: the work grows in proportion to the input. `cheaperPairs` is **O(n²)**, **quadratic**.

### The precise definition

Big O describes an *upper bound* on growth. Saying "`T(n)` is O(g(n))" means: there is some constant `c` and some starting size `n₀` so that `T(n) ≤ c · g(n)` for every `n ≥ n₀`. For `3n² + 5n + 20`, take `c = 4` and `n₀ = 10`: from `n = 10` on, `3n² + 5n + 20` never exceeds `4n²`. The table above shows the ratio settling towards 3, safely under 4.

Two sibling notations complete the picture:

| Notation | Read as | Meaning | Everyday phrase |
| --- | --- | --- | --- |
| **O(g)** | big O of g | `T(n) ≤ c · g(n)` for large `n`: an upper bound | "grows no faster than g" |
| **Ω(g)** | big omega of g | `T(n) ≥ c · g(n)` for large `n`: a lower bound | "grows at least as fast as g" |
| **Θ(g)** | big theta of g | both O(g) and Ω(g): a tight bound | "grows exactly like g" |

`cheaperPairs` is Θ(n²): it always does exactly `n²` steps. Strictly speaking it is also O(n³), because an upper bound may be loose, but that statement is true and useless. In everyday engineering talk, people say "O" and mean the tight bound. This course does the same, and uses Ω and Θ when the difference matters.

> NOTE
>
> Big O is not the same thing as "worst case". Big O, Ω and Θ describe how *a function* grows. The best case and the worst case (next section) are two *different functions* of `n`, and each of them has its own Big O. You will often read "worst case O(n)", which combines both ideas.

## Best, worst and average case

Many algorithms do different amounts of work for different inputs of the same size. A customer support page looks up an order by ID in a list of 1,000 orders:

find-order-cases.js

```ts
function findOrder(orders, id, counter) {
  for (let i = 0; i < orders.length; i++) {
    counter.comparisons++;
    if (orders[i].id === id) return orders[i];
  }
  return null;
}

const orders = Array.from({ length: 1000 }, (_, i) => ({ id: `ORD-${i + 1}`, total: 150000 }));

function comparisonsFor(id) {
  const counter = { comparisons: 0 };
  findOrder(orders, id, counter);
  return counter.comparisons;
}

console.log("best (first order):", comparisonsFor("ORD-1"));
console.log("worst (last order):", comparisonsFor("ORD-1000"));
console.log("worst (missing id):", comparisonsFor("ORD-9999"));

let sum = 0;
for (const order of orders) sum += comparisonsFor(order.id);
console.log("average over every id that exists:", sum / orders.length);
```

Output of `node find-order-cases.js` and of the browser terminal

```ts
best (first order): 1
worst (last order): 1000
worst (missing id): 1000
average over every id that exists: 500.5
```

- The **best case** is the cheapest input of size `n`: the ID is first. One comparison, so the best case is Θ(1).
- The **worst case** is the most expensive input of size `n`: the ID is last or missing. `n` comparisons, Θ(n).
- The **average case** is the expected work over some assumed mix of inputs. If every existing ID is equally likely, the average is `(n + 1) / 2`, which is still Θ(n): half of `n` is still linear.

Engineers plan for the worst case, because it is a promise: no input will ever be slower. The average case depends on an assumption about your inputs, and in a backend some inputs come from people who may choose the slow ones on purpose. The best case is rarely useful; almost every algorithm is fast on a lucky input.

## The growth classes you will meet

A handful of shapes cover almost every algorithm in this course. Here they are from the slowest-growing (the cheapest) to the fastest-growing.

### O(1): constant time

The work does not depend on `n` at all. Reading `prices[500]` takes the same time in an array of 10 or 10 million items, because the engine computes the position directly. `map.get(sku)` on a `Map` is O(1) on average, as [the lesson on hash maps](https://zudojs.oyinlola.site/learn/dsa-hash-maps) explains. Constant does not mean instant; it means "does not grow".

### O(log n): logarithmic time

The **logarithm** base 2 of `n`, written `log₂ n`, answers "how many times can I halve `n` before I reach 1?". `log₂ 1,024 = 10` because halving 1,024 ten times gives 1. An algorithm that throws away half of the remaining input at each step is O(log n). The classic one is **binary search** in a sorted list: look at the middle item and discard the half that cannot contain the target.

binary-search-steps.js

```ts
function binarySearch(sorted, target, counter) {
  let low = 0;
  let high = sorted.length - 1;
  while (low <= high) {
    counter.steps++;
    const mid = Math.floor((low + high) / 2);
    if (sorted[mid] === target) return mid;
    if (sorted[mid] < target) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

for (const n of [1000, 1000000]) {
  const prices = Array.from({ length: n }, (_, i) => i * 10);
  const counter = { steps: 0 };
  binarySearch(prices, n * 10, counter); // above every price: the worst case
  console.log(`n=${n}: ${counter.steps} steps (log2 n is about ${Math.log2(n).toFixed(1)})`);
}
```

Output of `node binary-search-steps.js` and of the browser terminal

```ts
n=1000: 10 steps (log2 n is about 10.0)
n=1000000: 20 steps (log2 n is about 19.9)
```

A thousand times more data costs only twice the steps. In Big O the base of the logarithm does not matter (logs in different bases differ by a constant factor), so you write O(log n). [The lesson on searching](https://zudojs.oyinlola.site/learn/dsa-searching) builds binary search properly, including its classic bugs.

### O(n): linear time

One pass over the input: summing a cart, finding the most expensive item, the `Set` duplicate check. If you must look at every item at least once, you cannot do better than linear.

### O(n log n): linearithmic time

The cost of good sorting algorithms. **Merge sort** splits the list in half again and again (that is `log n` levels) and does `n` work merging on each level. Count its comparisons and compare with `n log₂ n`:

merge-sort-steps.js

```ts
function mergeSort(items, counter) {
  if (items.length <= 1) return items;
  const mid = Math.floor(items.length / 2);
  const left = mergeSort(items.slice(0, mid), counter);
  const right = mergeSort(items.slice(mid), counter);
  const merged = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    counter.comparisons++;
    if (left[i] <= right[j]) merged.push(left[i++]);
    else merged.push(right[j++]);
  }
  return merged.concat(left.slice(i), right.slice(j));
}

for (const n of [1024, 8192, 65536]) {
  const totals = Array.from({ length: n }, (_, i) => (i * 7919) % n); // shuffled order totals
  const counter = { comparisons: 0 };
  const sorted = mergeSort(totals, counter);
  const ok = sorted.every((v, i) => i === 0 || sorted[i - 1] <= v);
  console.log(`n=${n}: ${counter.comparisons} comparisons, n log2 n = ${n * Math.log2(n)}, sorted: ${ok}`);
}
```

Output of `node merge-sort-steps.js` and of the browser terminal

```ts
n=1024: 8929 comparisons, n log2 n = 10240, sorted: true
n=8192: 88721 comparisons, n log2 n = 106496, sorted: true
n=65536: 956515 comparisons, n log2 n = 1048576, sorted: true
```

The count stays just under `n log₂ n`. For a million items that is about 20 million steps, compared with a trillion for an O(n²) sort. [The lesson on sorting](https://zudojs.oyinlola.site/learn/dsa-sorting) compares the classic sorts in detail.

### O(n²): quadratic time

A loop inside a loop over the same input: every pair of items. A shop that suggests "bought together" bundles by pairing every product with every other product does quadratic work:

bundle-pairs.js

```ts
function bundlePairs(products) {
  const pairs = [];
  for (let i = 0; i < products.length; i++) {
    for (let j = i + 1; j < products.length; j++) {
      pairs.push([products[i], products[j]]);
    }
  }
  return pairs;
}

for (const n of [10, 100, 1000]) {
  const products = Array.from({ length: n }, (_, i) => `SKU-${i + 1}`);
  console.log(`${n} products: ${bundlePairs(products).length} pairs`);
}
```

Output of `node bundle-pairs.js` and of the browser terminal

```ts
10 products: 45 pairs
100 products: 4950 pairs
1000 products: 499500 pairs
```

The count is `n(n - 1) / 2`, which is `n²/2 - n/2`, which is O(n²). This is the same shape as the duplicate check at the top of the lesson. Here the output itself has about `n²/2` items, so no algorithm can do better; for the duplicate check, a better algorithm existed.

### O(2ⁿ): exponential time

Each extra item *doubles* the work. A checkout that tries every combination of a customer's coupons to find the best discount has this shape: each coupon is either used or not, so `n` coupons give `2ⁿ` combinations.

coupon-combinations.js

```ts
function countCombinations(coupons) {
  let combinations = 0;
  function choose(index) {
    if (index === coupons.length) {
      combinations++;
      return;
    }
    choose(index + 1); // skip this coupon
    choose(index + 1); // use this coupon
  }
  choose(0);
  return combinations;
}

for (const n of [5, 10, 20]) {
  const coupons = Array.from({ length: n }, (_, i) => `SAVE${i + 1}`);
  console.log(`${n} coupons: ${countCombinations(coupons)} combinations to try`);
}
```

Output of `node coupon-combinations.js` and of the browser terminal

```ts
5 coupons: 32 combinations to try
10 coupons: 1024 combinations to try
20 coupons: 1048576 combinations to try
```

With 40 coupons it would be about 1.1 trillion. Exponential algorithms are only usable for tiny `n`. [Backtracking](https://zudojs.oyinlola.site/learn/dsa-backtracking) and [dynamic programming](https://zudojs.oyinlola.site/learn/dsa-dynamic-programming) are the two main ways to tame them.

### All of them side by side

growth-table.js

```ts
function show(x) {
  if (!Number.isFinite(x)) return "overflow";
  return x < 1e7 ? String(Math.round(x)) : x.toExponential(1);
}

console.log("n".padEnd(9), "log n".padEnd(7), "n log n".padEnd(9), "n²".padEnd(9), "2ⁿ");
for (const n of [10, 100, 1000, 1000000]) {
  console.log(
    String(n).padEnd(9),
    show(Math.log2(n)).padEnd(7),
    show(n * Math.log2(n)).padEnd(9),
    show(n * n).padEnd(9),
    show(2 ** n),
  );
}
```

Output of `node growth-table.js` and of the browser terminal

```ts
n         log n   n log n   n²        2ⁿ
10        3       33        100       1024
100       7       664       10000     1.3e+30
1000      10      9966      1000000   1.1e+301
1000000   20      2.0e+7    1.0e+12   overflow
```

A computer does very roughly a billion simple steps per second. Read the last row with that in mind: `n log n` for a million items takes a few hundredths of a second, `n²` takes minutes, and `2ⁿ` would outlast the universe.

## Measuring with a clock, carefully

Step counts are the reliable tool, but you should also confirm them on the real machine, because constants and memory effects are real. `performance.now()` returns the current time in milliseconds with a fraction, in both Node.js and the browser. Timings change on every run, so this lesson never prints them. Instead it prints *comparisons* between timings that are true by a wide margin, and you should do the same in your own experiments.

Three habits make a measurement meaningful:

1. **Warm up**: run the function once before measuring, so the JIT has compiled it.
2. **Repeat and take the best**: the fastest of several runs is the one least disturbed by other programs and the garbage collector.
3. **Use big inputs and compare growth**: time `n` and `2n` and look at the ratio. The ratio shows the growth class even when the absolute numbers mean nothing.

timing.js

```ts
function hasDuplicateNested(ids) {
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (ids[i] === ids[j]) return true;
    }
  }
  return false;
}

function hasDuplicateSet(ids) {
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) return true;
    seen.add(id);
  }
  return false;
}

function bestTime(fn, input, runs = 5) {
  fn(input); // warm-up
  let best = Infinity;
  for (let r = 0; r < runs; r++) {
    const start = performance.now();
    fn(input);
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

const orderIds = (n) => Array.from({ length: n }, (_, i) => `ORD-${i + 1}`);
const small = orderIds(2500);
const large = orderIds(5000);

const growth = bestTime(hasDuplicateNested, large) / bestTime(hasDuplicateNested, small);
console.log("nested: doubling n made it more than 2.5 times slower:", growth > 2.5);

const speedUp = bestTime(hasDuplicateNested, large) / bestTime(hasDuplicateSet, large);
console.log("with 5000 orders the Set version is over 20 times faster:", speedUp > 20);
```

Output of `node timing.js` and of the browser terminal

```ts
nested: doubling n made it more than 2.5 times slower: true
with 5000 orders the Set version is over 20 times faster: true
```

If you print `growth` itself on your machine you will usually see a number near 4, the signature of O(n²), and `speedUp` well above 20. The exact values differ each run; the conclusions do not.

> WATCH OUT
>
> Never decide between two algorithms from one timing of a tiny input. For 20 items the "slow" algorithm is often faster, because its constant factor is smaller. Measure at the size you expect in production, and confirm with a step count.

## Space complexity

**Space complexity** measures the extra memory an algorithm needs as the input grows, with the same Big O notation. "Extra" (also called *auxiliary*) means memory beyond the input itself. Reversing the order history for a "newest first" view shows the difference:

reverse-space.js

```ts
function reversedCopy(items) {
  const out = [];
  for (let i = items.length - 1; i >= 0; i--) out.push(items[i]);
  return out; // a second array of n items: O(n) extra space
}

function reverseInPlace(items) {
  let left = 0;
  let right = items.length - 1;
  while (left < right) {
    [items[left], items[right]] = [items[right], items[left]];
    left++;
    right--;
  }
  return items; // only two indexes: O(1) extra space
}

const history = ["ORD-1", "ORD-2", "ORD-3", "ORD-4"];
const copy = reversedCopy(history);
console.log(copy, history);
reverseInPlace(history);
console.log(history);
```

Output of `node reverse-space.js` and of the browser terminal

```json
[ 'ORD-4', 'ORD-3', 'ORD-2', 'ORD-1' ] [ 'ORD-1', 'ORD-2', 'ORD-3', 'ORD-4' ]
[ 'ORD-4', 'ORD-3', 'ORD-2', 'ORD-1' ]
```

Both are O(n) time. The copy uses O(n) extra space but leaves the original alone; the in-place version uses O(1) extra space but changes the caller's array. Neither is "better": the in-place one is wrong if another part of the program still needs the original order. The `reverseInPlace` loop, with one index walking in from each end, is a first taste of the [two pointers](https://zudojs.oyinlola.site/learn/pattern-two-pointers) pattern.

### Recursion uses space too

Every function call that has not returned yet keeps a **stack frame** (its parameters and local variables) on the call stack. A recursive function that goes `n` calls deep uses O(n) space even if it creates no arrays, and the call stack is small. You met this in [the lesson on recursion](https://zudojs.oyinlola.site/learn/js-recursion):

recursion-space.js

```ts
function sumRecursive(amounts, i = 0) {
  if (i === amounts.length) return 0;
  return amounts[i] + sumRecursive(amounts, i + 1);
}

function sumLoop(amounts) {
  let total = 0;
  for (const amount of amounts) total += amount;
  return total;
}

const small = new Array(1000).fill(250);
const huge = new Array(1000000).fill(250);

console.log(sumRecursive(small), sumLoop(small));
console.log(sumLoop(huge));
try {
  sumRecursive(huge);
} catch (error) {
  console.log(error.name + ": " + error.message);
}
```

Output of `node recursion-space.js` and of the browser terminal

```ts
250000 250000
250000000
RangeError: Maximum call stack size exceeded
```

The loop is O(1) extra space and handles a million amounts; the recursion is O(n) extra space and runs out of stack. When you state the space of a recursive function, count the deepest chain of calls.

## Why push is cheap: amortized cost

An array stores its items side by side in one block of memory. The block has a fixed **capacity**. When `push` finds the block full, the engine must allocate a bigger block and copy every item into it, which is O(n) work. So how can `push` be called O(1)?

The answer is **amortized analysis**: instead of the cost of one operation, look at the total cost of a long sequence of operations and divide by their number. Build a growable array yourself and count every copy. The `grow` function decides the new capacity:

growable-array.js

```ts
class GrowableList {
  constructor(grow) {
    this.grow = grow;
    this.capacity = 1;
    this.length = 0;
    this.slots = new Array(1);
    this.copies = 0;
  }

  push(value) {
    if (this.length === this.capacity) {
      const bigger = new Array(this.grow(this.capacity));
      for (let i = 0; i < this.length; i++) {
        bigger[i] = this.slots[i];
        this.copies++;
      }
      this.slots = bigger;
      this.capacity = bigger.length;
    }
    this.slots[this.length++] = value;
  }
}

const doubling = (capacity) => capacity * 2;
const plusOne = (capacity) => capacity + 1;

for (const n of [1000, 10000]) {
  for (const [name, grow] of [["double", doubling], ["plus one", plusOne]]) {
    const list = new GrowableList(grow);
    for (let i = 0; i < n; i++) list.push(i);
    console.log(`${name}, ${n} pushes: ${list.copies} copies, ${(list.copies / n).toFixed(2)} per push`);
  }
}
```

Output of `node growable-array.js` and of the browser terminal

```ts
double, 1000 pushes: 1023 copies, 1.02 per push
plus one, 1000 pushes: 499500 copies, 499.50 per push
double, 10000 pushes: 16383 copies, 1.64 per push
plus one, 10000 pushes: 49995000 copies, 4999.50 per push
```

With doubling, the copies are `1 + 2 + 4 + … + 2ᵏ`, a sum that is always less than twice the final size. So `n` pushes cost fewer than `3n` steps in total (the `n` writes plus fewer than `2n` copies): **amortized O(1)** per push. A single push can still cost O(n) when it triggers a copy, but those are rare enough that the average over any sequence stays constant. Growing by one slot at a time copies on every push and turns `n` pushes into O(n²).

JavaScript engines use the same idea: they grow an array's backing store by a constant factor, not a constant amount. That is why building an array with `push` in a loop is fine, and why the ratio (double, 1.5×) matters more than the exact number.

> TIP
>
> Amortized is not the same as average case. The average case averages over *possible inputs*. Amortized cost averages over *a sequence of operations* on the same structure, and it is a guarantee: no sequence of `n` pushes, however chosen, costs more than O(n) in total.

## What is the complexity of this code?

You can now analyse code by reading it. The rules:

- **Sequential blocks add**: a loop over `n` followed by another loop over `n` is `O(n + n) = O(n)`.
- **Nested blocks multiply**: a loop over `n` containing a loop over `n` is `O(n · n) = O(n²)`.
- **Different inputs keep different letters**: a loop over `orders` (size `n`) containing a loop over `customers` (size `m`) is `O(n · m)`, not O(n²).
- **A loop variable that is multiplied or divided** (`i *= 2`, `size = size / 2`) runs O(log n) times.
- **Recursion**: total work = number of calls × work per call. Space = deepest chain of calls × space per call.
- **Built-in methods are loops too.** Read the table below before you call a method inside a loop.

| Operation | Cost | Why |
| --- | --- | --- |
| `arr[i]`, `arr.length`, `arr.push(x)`, `arr.pop()` | O(1) (push amortized) | direct position, work at the end |
| `arr.shift()`, `arr.unshift(x)`, `arr.splice(i, …)` | O(n) | every later item moves one place (V8 has a shortcut for `shift` on small arrays; you cannot rely on it) |
| `includes`, `indexOf`, `find`, `some`, `every` | O(n) | scan from the start |
| `map`, `filter`, `reduce`, `forEach`, `slice`, `[...arr]`, `concat` | O(n) | visit or copy every item |
| `arr.sort()`, `toSorted()` | O(n log n) | a comparison sort |
| `set.has`, `set.add`, `map.get`, `map.set`, `obj[key]` | O(1) on average | hashing (see [hash maps](https://zudojs.oyinlola.site/learn/dsa-hash-maps)) |
| `str.slice`, `str.split`, `str.includes`, `str.toUpperCase` | O(length) | strings are copied or scanned |

### A hidden quadratic

This looks like one loop, and it is a popular "immutable" style. It collects the IDs of paid orders:

hidden-quadratic.js

```ts
function paidIdsSpread(orders, counter) {
  return orders.reduce((ids, order) => {
    if (!order.paid) return ids;
    counter.copied += ids.length; // [...ids] copies every id collected so far
    return [...ids, order.id];
  }, []);
}

function paidIdsPush(orders, counter) {
  const ids = [];
  for (const order of orders) {
    if (order.paid) {
      counter.copied += 1;
      ids.push(order.id);
    }
  }
  return ids;
}

for (const n of [1000, 2000, 4000]) {
  const orders = Array.from({ length: n }, (_, i) => ({ id: `ORD-${i + 1}`, paid: i % 4 !== 0 }));
  const a = { copied: 0 };
  const b = { copied: 0 };
  const same = paidIdsSpread(orders, a).length === paidIdsPush(orders, b).length;
  console.log(`n=${n}: spread copies ${a.copied}, push writes ${b.copied}, same result: ${same}`);
}
```

Output of `node hidden-quadratic.js` and of the browser terminal

```ts
n=1000: spread copies 280875, push writes 750, same result: true
n=2000: spread copies 1124250, push writes 1500, same result: true
n=4000: spread copies 4498500, push writes 3000, same result: true
```

The spread version copies the whole growing array on every paid order: O(n²). The same trap hides in string building that reads the string it is building ([the next lesson](https://zudojs.oyinlola.site/learn/dsa-arrays-strings) measures when `+=` copies and when it does not), in `array.includes` inside a `filter`, and in `shift()` inside a loop.

REASON IT OUT

### Name the complexity before you run anything

For each function, say its time and extra space in Big O. Say what `n` (and `m`) are.

name-the-complexity.js

```ts
// A: newest order
function newest(orders) {
  return orders[orders.length - 1];
}

// B: orders of VIP customers
function vipOrders(orders, vipIds) {
  return orders.filter((order) => vipIds.includes(order.customerId));
}

// C: how many times a balance can be halved before it is under ₦1
function halvings(balance) {
  let steps = 0;
  while (balance >= 1) {
    balance = balance / 2;
    steps++;
  }
  return steps;
}

// D: a report line for every order, each line listing every product
function report(orders, products) {
  const lines = [];
  for (const order of orders) {
    for (const product of products) lines.push(`${order.id}:${product.sku}`);
  }
  return lines;
}

// E: drain a queue of print jobs
function drain(jobs) {
  while (jobs.length > 0) jobs.shift();
}
```

**Show the reasoning**

- **A**: O(1) time, O(1) space. Reading one index and `length` does not depend on `n`.
- **B**: O(n · m) time, where `n` is the number of orders and `m` the number of VIP IDs, because `includes` scans `vipIds` for every order. Space O(n) for the result. Turn `vipIds` into a `Set` first and it becomes O(n + m).
- **C**: O(log n) time where `n` is the balance, because the value halves each step. O(1) space.
- **D**: O(n · m) time and O(n · m) space: the output itself has `n · m` lines, so you cannot do better while producing all of them.
- **E**: O(n²) time, even though it looks linear. Each `shift` moves every remaining job one place forward: `(n - 1) + (n - 2) + … + 1` moves. (V8 can skip the moves on small arrays, but not on large ones: plan for the quadratic.) [The lesson on queues](https://zudojs.oyinlola.site/learn/dsa-stacks-queues) fixes it.

## When Big O misleads you

Big O is a model. It deliberately throws information away, and sometimes that information matters:

- **Constants matter for small inputs.** An O(n²) loop over 8 items can beat an O(n log n) algorithm with heavy setup. Many sort implementations switch to a simple quadratic sort for tiny sub-arrays for exactly this reason.
- **Averages hide spikes.** Amortized O(1) `push` still has occasional O(n) pushes. In a system that must answer within a strict deadline, the rare slow operation is the one that breaks the deadline.
- **Average case assumes friendly input.** A hash map is O(1) on average, but an attacker who can choose keys that collide can push it towards O(n) per operation. [The hash maps lesson](https://zudojs.oyinlola.site/learn/dsa-hash-maps) shows how.
- **Memory and I/O are not "steps".** One database query or network call takes as long as millions of in-memory steps. A loop that makes a database query per item (the "N + 1 queries" problem) is O(n) in the model and a disaster in production. Count round trips separately from CPU steps.
- **n is not always the obvious thing.** Sorting 10 orders that each contain a 5 MB PDF is cheap to sort and expensive to copy. Ask what actually grows.

## Testing correctness and growth

A faster algorithm is only useful if it gives the same answers. Two kinds of tests protect you:

1. **Correctness against a reference.** Keep the slow, obviously correct version as a *reference implementation* and check that the fast one agrees with it on many generated inputs, including the edge cases (empty, one item, duplicate first, duplicate last).
2. **Growth with a step counter.** Clocks are too noisy for a test suite, but step counts are exact. Assert that doubling `n` doubles the steps of a linear function. If someone later adds an `includes` inside the loop, the test fails.

complexity-tests.js

```ts
function hasDuplicateNested(ids, counter = { steps: 0 }) {
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      counter.steps++;
      if (ids[i] === ids[j]) return true;
    }
  }
  return false;
}

function hasDuplicateSet(ids, counter = { steps: 0 }) {
  const seen = new Set();
  for (const id of ids) {
    counter.steps++;
    if (seen.has(id)) return true;
    seen.add(id);
  }
  return false;
}

function check(label, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}`);
}

// 1. Correctness: generated inputs, some with duplicates and some without
let agree = true;
let withDuplicates = 0;
for (let trial = 0; trial < 200; trial++) {
  const n = trial % 30;
  const modulus = n + (trial % 4); // some generated lists repeat an id, some do not
  const ids = Array.from({ length: n }, (_, i) => `ORD-${(i * (trial % 5 + 1)) % Math.max(modulus, 1)}`);
  const expected = hasDuplicateNested(ids);
  if (expected) withDuplicates++;
  if (hasDuplicateSet(ids) !== expected) agree = false;
}
check(`Set version agrees with the reference on 200 inputs (${withDuplicates} had duplicates)`, agree);
check("empty list", hasDuplicateSet([]) === false);
check("one order", hasDuplicateSet(["ORD-1"]) === false);
check("duplicate at the end", hasDuplicateSet(["ORD-1", "ORD-2", "ORD-3", "ORD-1"]) === true);

// 2. Growth: exact step counts on the worst case (no duplicates)
const ids = (n) => Array.from({ length: n }, (_, i) => `ORD-${i}`);
function steps(fn, n) {
  const counter = { steps: 0 };
  fn(ids(n), counter);
  return counter.steps;
}
check("Set version is linear: doubling n doubles the steps", steps(hasDuplicateSet, 2000) === 2 * steps(hasDuplicateSet, 1000));
const ratio = steps(hasDuplicateNested, 2000) / steps(hasDuplicateNested, 1000);
check(`nested version is quadratic: doubling n multiplies steps by ${ratio.toFixed(3)}`, ratio > 3.9 && ratio < 4.1);
```

Output of `node complexity-tests.js` and of the browser terminal

```ts
PASS Set version agrees with the reference on 200 inputs (93 had duplicates)
PASS empty list
PASS one order
PASS duplicate at the end
PASS Set version is linear: doubling n doubles the steps
PASS nested version is quadratic: doubling n multiplies steps by 4.002
```

Printing how many generated inputs had duplicates is a small but important habit: a generator that only ever produced clean lists would make the "agrees" test pass without testing anything. In a real project these checks go into a test runner such as Vitest (see [the lesson on testing](https://zudojs.oyinlola.site/learn/testing-basics)), and property-based testing tools like fast-check generate the inputs for you.

## Complexity in production code

- **Know your n, today and next year.** Write down the expected size of each input next to the code that handles it. "Orders per day: 1,000 now, 100,000 in a sale" tells you O(n²) is not acceptable.
- **Cap n at the edges.** An API that returns "all orders" has an unbounded `n`. Pagination, request size limits and maximum list lengths turn an unknown `n` into a known one.
- **Choose the data structure first.** Most real speed-ups in application code come from replacing a scan with a `Map` or `Set` lookup, like the duplicate check. The rest of this module shows which structure makes which operation cheap.
- **Space is a budget too.** Loading a million rows into an array "to make it fast" can exhaust the server's memory. Streaming (processing one item at a time) keeps extra space O(1).
- **Measure with a profiler before optimising.** A *profiler* records where a running program spends its time. The slow part is often not the one you would guess; Node's `--cpu-prof` flag and the browser DevTools Performance panel both show it.

## Practice

TRY IT YOURSELF

### Customers who came back

The marketing team wants the customers who ordered in both January and February. Write `returningCustomers(january, february)` twice: once with nested loops, once with a `Set`. Count steps in both and state the complexity of each with `n` and `m` for the two list sizes.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

For `returningNested`: a loop over `january` containing a loop over `february`, comparing values and counting a step per comparison. For `returningSet`: first turn `february` into a `Set`.

HINT 2

`for (const customer of february) { counter.steps++; februarySet.add(customer); }`, then `for (const customer of january) { counter.steps++; if (februarySet.has(customer)) result.push(customer); }`. In the nested version, `break` out of the inner loop on a match so you don't push twice.

SOLUTION

returning-customers.js

```ts
function returningNested(january, february, counter) {
  const result = [];
  for (const a of january) {
    for (const b of february) {
      counter.steps++;
      if (a === b) {
        result.push(a);
        break;
      }
    }
  }
  return result;
}

function returningSet(january, february, counter) {
  const februarySet = new Set();
  for (const customer of february) {
    counter.steps++;
    februarySet.add(customer);
  }
  const result = [];
  for (const customer of january) {
    counter.steps++;
    if (februarySet.has(customer)) result.push(customer);
  }
  return result;
}

const january = Array.from({ length: 3000 }, (_, i) => `CUS-${i}`);
const february = Array.from({ length: 2000 }, (_, i) => `CUS-${i * 3}`);
const a = { steps: 0 };
const b = { steps: 0 };
const nested = returningNested(january, february, a);
const withSet = returningSet(january, february, b);
console.log(nested.length, withSet.length, nested.join() === withSet.join());
console.log(`nested: ${a.steps} steps, set: ${b.steps} steps`);
```

Output of `node returning-customers.js` and of the browser terminal

```ts
1000 1000 true
nested: 4500500 steps, set: 5000 steps
```

The nested version is O(n · m): for each January customer it may scan all of February. The `Set` version is O(n + m) time and O(m) extra space. Note that `break` does not change the Big O: most January customers are not in February, and for them the inner loop still runs to the end.

TRY IT YOURSELF

### Grow by half

Some engines grow arrays by 1.5 times instead of doubling, to waste less memory. Add a `grow` function `(capacity) => Math.ceil(capacity * 1.5)` and one that adds 10 slots each time to the `GrowableList`, push 10,000 items and compare copies per push. Which one is still amortized O(1)?

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Each strategy is a pair `[name, growFn]`, where `growFn` takes the current capacity and returns the new one, same shape as `doubling` and `plusOne` earlier in the lesson.

HINT 2

`["x1.5", (c) => Math.ceil(c * 1.5)]` and `["+10", (c) => c + 10]`. Keep `["x2", (c) => c * 2]` too, so all three get compared.

SOLUTION

grow-by-half.js

```ts
class GrowableList {
  constructor(grow) {
    this.grow = grow;
    this.capacity = 1;
    this.length = 0;
    this.slots = new Array(1);
    this.copies = 0;
  }
  push(value) {
    if (this.length === this.capacity) {
      const bigger = new Array(this.grow(this.capacity));
      for (let i = 0; i < this.length; i++) {
        bigger[i] = this.slots[i];
        this.copies++;
      }
      this.slots = bigger;
      this.capacity = bigger.length;
    }
    this.slots[this.length++] = value;
  }
}

const strategies = [
  ["x2", (c) => c * 2],
  ["x1.5", (c) => Math.ceil(c * 1.5)],
  ["+10", (c) => c + 10],
];
for (const n of [10000, 20000]) {
  for (const [name, grow] of strategies) {
    const list = new GrowableList(grow);
    for (let i = 0; i < n; i++) list.push(i);
    console.log(`${name.padEnd(5)} ${n} pushes: ${(list.copies / n).toFixed(2)} copies per push`);
  }
}
```

Output of `node grow-by-half.js` and of the browser terminal

```ts
x2    10000 pushes: 1.64 copies per push
x1.5  10000 pushes: 2.43 copies per push
+10   10000 pushes: 499.60 copies per push
x2    20000 pushes: 1.64 copies per push
x1.5  20000 pushes: 2.73 copies per push
+10   20000 pushes: 999.60 copies per push
```

Any constant *factor* keeps the copies per push bounded by a constant (for 1.5 the bound is 3; the value moves around with `n` depending on how close `n` is to the last resize, but it never grows past the bound). A constant *amount* (+10) only divides the quadratic cost by 10: doubling `n` doubles the copies per push, so it is still O(n) per push amortized and O(n²) in total.

TRY IT YOURSELF

### Prove it with a counter

What is the time complexity of `discountTiers`? Decide first, then add a counter and check your answer by doubling `n`.

tiers-question.js

```ts
function discountTiers(prices) {
  const tiers = [];
  for (const price of prices) {
    let tier = 0;
    for (let limit = prices.length; limit > 1; limit = Math.floor(limit / 2)) tier++;
    tiers.push(tier + (price > 100000 ? 1 : 0));
  }
  return tiers;
}
```

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

The inner loop already runs the right number of times; you just need to count each pass and grow `tier` at the same time, inside the `for (let limit = …)` loop.

HINT 2

`counter.steps++; tier++;` as the body of the inner loop. Compare the printed steps with `n * Math.log2(n)` for each `n`.

SOLUTION

The outer loop runs `n` times. The inner loop halves `limit` from `n` down to 1, so it runs about `log₂ n` times. Nested blocks multiply: O(n log n).

tiers-answer.js

```ts
function discountTiers(prices, counter) {
  const tiers = [];
  for (const price of prices) {
    let tier = 0;
    for (let limit = prices.length; limit > 1; limit = Math.floor(limit / 2)) {
      counter.steps++;
      tier++;
    }
    tiers.push(tier + (price > 100000 ? 1 : 0));
  }
  return tiers;
}

for (const n of [1024, 2048, 4096]) {
  const counter = { steps: 0 };
  discountTiers(new Array(n).fill(150000), counter);
  console.log(`n=${n}: ${counter.steps} steps, n log2 n = ${n * Math.log2(n)}`);
}
```

Output of `node tiers-answer.js` and of the browser terminal

```ts
n=1024: 10240 steps, n log2 n = 10240
n=2048: 22528 steps, n log2 n = 22528
n=4096: 49152 steps, n log2 n = 49152
```

Doubling `n` slightly more than doubles the steps (from 10,240 to 22,528 is ×2.2): the signature of `n log n`. The inner loop also computes the same value for every price, so the real fix is to compute it once before the outer loop, making the whole function O(n).

## Summary

- Measure an algorithm by counting its steps as a function of the input size `n`, not by the clock. Count the operation that runs most often.
- Big O keeps the fastest-growing term and drops constants: `3n² + 5n + 20` is O(n²). O is an upper bound, Ω a lower bound, Θ a tight bound.
- Best, worst and average case are different functions of `n`; plan for the worst case.
- The common classes, from cheapest: O(1), O(log n), O(n), O(n log n), O(n²), O(2ⁿ). Halving gives log n; nesting multiplies; sequencing adds.
- Space complexity counts extra memory, including the call stack of recursive functions.
- `push` is amortized O(1) because arrays grow by a constant factor; growing by a constant amount would be O(n²) in total.
- Built-in methods and spread are loops: `includes`, `shift`, `[...arr]` inside a loop make it quadratic.
- Test the fast version against a slow reference, and test growth with exact step counts, never with timings.

Next: [Arrays and strings under the hood](https://zudojs.oyinlola.site/learn/dsa-arrays-strings), where you use this toolkit to see what each array and string operation really costs.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
