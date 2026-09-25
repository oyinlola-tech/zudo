---
title: "Divide and conquer — ZudoJS Academy"
description: "Split problems into halves and combine: find delivery-time percentiles with quickselect, compute powers fast, and predict cost with recursion trees."
source: https://zudojs.oyinlola.site/learn/dsa-divide-conquer
---

LEVEL 3 · LESSON 12 OF 21

Algorithms Core

# Divide and conquer

Split problems into halves and combine: find delivery-time percentiles with quickselect, compute powers fast, and predict cost with recursion trees.

- **55 min** to read and try
- **You need:** Sorting algorithms, Recursion, and Big O and complexity
- **You build:** A tested quickselect for median and 95th-percentile delivery times, a fast modular power function, a ranking-change counter and a recurrence calculator that predicts running times

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Recognise the divide, conquer and combine steps in an algorithm and write the base case first
- Find the k-th smallest item, a median or a percentile in O(n) average time with quickselect
- Compute large powers with O(log n) multiplications, including modular powers with BigInt
- Draw a recursion tree and use it, or the master theorem, to state the cost of a recursive algorithm
- Spot divide-and-conquer mistakes that make an algorithm slower instead of faster

## The problem: the 95th percentile delivery time

A delivery company promises customers a delivery window. To set it honestly, the operations team watches two numbers on a dashboard, recomputed every minute from the last 200,000 deliveries: the **median** delivery time (half of deliveries are faster, half slower) and the **95th percentile**, often written **p95** (95% of deliveries are at least this fast). The average is useless here: a handful of three-hour deliveries stuck behind a flooded road drag it up, while the median and p95 describe what customers actually experience.

There are several definitions of a percentile. This lesson uses the simplest, the **nearest-rank** definition: sort the n values, and the p-th percentile is the value at position ⌈p/100 × n⌉ (counting from 1). ⌈x⌉ means "round up". For 200,000 deliveries, p95 is the 190,000th smallest time.

The obvious way is to sort and index: from [Sorting algorithms](https://zudojs.oyinlola.site/learn/dsa-sorting) you know that costs O(n log n), about 3.5 million comparisons for 200,000 items. But sorting puts *every* delivery in its exact place, and you only need *one* position. This lesson shows how to find it in about 2 to 3 comparisons per item, by applying the idea behind merge sort and quick sort to other problems.

That idea is called **divide and conquer**:

1. **Divide** the problem into smaller problems of the same kind.
2. **Conquer** each smaller problem, usually by calling the same function recursively. Problems small enough to answer directly are the **base case**.
3. **Combine** the answers of the smaller problems into the answer for the whole.

Merge sort divides trivially (cut in half), and all its work is in the combine step (merge). Quick sort does all its work in the divide step (partition), and its combine step is empty. Keep asking "where is the work?" for every algorithm in this lesson; it is also the key to working out their cost.

## Dividing is not magic

Splitting a problem in half does not make it cheaper by itself. Here is the largest order of the day, found by divide and conquer: the largest of the whole list is the larger of the largest in each half.

max-dc.js

```ts
let comparisons = 0;

function largest(orders, lo = 0, hi = orders.length - 1) {
  if (lo === hi) return orders[lo];
  const mid = Math.floor((lo + hi) / 2);
  const left = largest(orders, lo, mid);
  const right = largest(orders, mid + 1, hi);
  comparisons++;
  return left.naira >= right.naira ? left : right;
}

const orders = [
  { id: 1041, naira: 12500 }, { id: 1042, naira: 98000 }, { id: 1043, naira: 4500 },
  { id: 1044, naira: 250000 }, { id: 1045, naira: 7800 }, { id: 1046, naira: 250000 },
];
const top = largest(orders);
console.log(`#${top.id} ₦${top.naira}, ${comparisons} comparisons`);

comparisons = 0;
const many = Array.from({ length: 100000 }, (_, i) => ({ id: i, naira: (i * 7919) % 100003 }));
largest(many);
console.log(`100000 orders: ${comparisons} comparisons`);
```

Output of `node max-dc.js` and of the browser terminal

```ts
#1044 ₦250000, 5 comparisons
100000 orders: 99999 comparisons
```

It makes exactly n − 1 comparisons, the same as a simple loop, because every order except the winner has to lose one comparison somewhere. Divide and conquer paid off in sorting because the combine step (merge) is cheap relative to the work it saves. The skill is to find problems where splitting lets you *skip* work. Two details worth copying from this example: the function passes index ranges (`lo`, `hi`) instead of slicing the array, so dividing costs nothing; and on a tie it keeps the left one, so the answer is predictable (order 1044, not 1046).

## Merge sort revisited: the recursion tree

To see where an algorithm's work goes, draw its **recursion tree**: one node per call, labelled with the work that call does itself (not counting its children). For merge sort on n items, the root merges n items, its two children merge n/2 each, the four grandchildren n/4 each, and so on:

```ts
level 0:                 n                        work n
level 1:          n/2          n/2                work n
level 2:       n/4   n/4    n/4   n/4             work n
  ...                    ...                      ...
level log₂ n:   1  1  1  1  1  1  1  1 ...        n leaves
                                         total: n × log₂ n
```

Every level of merge sort's recursion tree does n work in total, and there are log₂ n levels.

The total cost is the sum over all nodes. Summing level by level is easy here: each level adds up to n, and there are log₂ n levels. You can check the picture by instrumenting a real merge sort, adding each merge's size to the total of its level:

merge-levels.js

```ts
const workPerLevel = [];

function mergeSort(items, level = 0) {
  if (items.length <= 1) return items;
  const mid = Math.floor(items.length / 2);
  const left = mergeSort(items.slice(0, mid), level + 1);
  const right = mergeSort(items.slice(mid), level + 1);
  workPerLevel[level] = (workPerLevel[level] ?? 0) + items.length;
  const out = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) out.push(right[j] < left[i] ? right[j++] : left[i++]);
  return out.concat(left.slice(i), right.slice(j));
}

const totals = Array.from({ length: 1024 }, (_, i) => (i * 7919) % 1024);
const sorted = mergeSort(totals);
console.log("sorted:", sorted.every((v, i) => i === 0 || sorted[i - 1] <= v));
console.log("items merged per level:", workPerLevel.join(" "));
console.log("levels:", workPerLevel.length, " total:", workPerLevel.reduce((a, b) => a + b, 0), " n log2 n:", 1024 * 10);
```

Output of `node merge-levels.js` and of the browser terminal

```ts
sorted: true
items merged per level: 1024 1024 1024 1024 1024 1024 1024 1024 1024 1024
levels: 10  total: 10240  n log2 n: 10240
```

Exactly 1,024 items merged on each of the 10 levels. Recursion trees are the most reliable way to find the cost of a recursive algorithm, and the [master theorem](#master) below is a shortcut for the common shapes.

### Bottom-up merge sort: the same tree without recursion

The tree also shows that the recursion is not essential. The leaves are single items, and the merges on each level only need the level below. So you can start at the bottom: merge neighbouring runs of width 1 into runs of width 2, then 2 into 4, and so on, until one run covers the array. This **bottom-up merge sort** needs no call stack at all, which matters for very large arrays, and it is how external sorting of huge files works: sort chunks that fit in memory, then merge runs of chunks level by level.

merge-bottom-up.js

```ts
function mergeSortBottomUp(input, compare) {
  let a = [...input];
  let comparisons = 0;
  for (let width = 1; width < a.length; width *= 2) {
    const next = [];
    for (let lo = 0; lo < a.length; lo += 2 * width) {
      const mid = Math.min(lo + width, a.length);
      const hi = Math.min(lo + 2 * width, a.length);
      let i = lo;
      let j = mid;
      while (i < mid && j < hi) {
        comparisons++;
        next.push(compare(a[j], a[i]) < 0 ? a[j++] : a[i++]);
      }
      while (i < mid) next.push(a[i++]);
      while (j < hi) next.push(a[j++]);
    }
    a = next;
  }
  return { sorted: a, comparisons };
}

const amounts = [4500, 120000, 800, 35000, 800, 99000, 15000];
console.log(mergeSortBottomUp(amounts, (x, y) => x - y).sorted.join(" "));

const data = Array.from({ length: 1000 }, (_, i) => (i * 7919) % 1000);
const { sorted, comparisons } = mergeSortBottomUp(data, (x, y) => x - y);
console.log("sorted:", sorted.every((v, i) => i === 0 || sorted[i - 1] <= v), "comparisons:", comparisons);
```

Output of `node merge-bottom-up.js` and of the browser terminal

```ts
800 800 4500 15000 35000 99000 120000
sorted: true comparisons: 8405
```

The array length does not need to be a power of two: the last run on a level is simply shorter, or has no partner and is copied across.

## Using the combine step: how much did the ranking change?

Merge sort's combine step can do more than merge. The shop ranks its 5,000 products by sales every month. The merchandising team wants one number that says how much the ranking changed since last month. A natural measure: count the pairs of products whose order flipped (A was above B last month, and is below B now). In terms of the [previous lesson](https://zudojs.oyinlola.site/learn/dsa-sorting#insertion), take this month's ranking and write each product's position from last month: the number of flipped pairs is the number of **inversions** in that list.

Checking every pair is O(n²): 12.5 million pairs for 5,000 products. The divide-and-conquer version counts inversions while merge-sorting. Every inversion is either inside the left half, inside the right half (both counted by the recursive calls), or *between* the halves. The between ones are counted in the merge: when an item is taken from the right half, it is smaller than every item still waiting in the left half, and each of those waiting items forms one inversion with it.

inversions.js

```ts
function countInversions(items) {
  let work = 0;
  function sortCount(a) {
    if (a.length <= 1) return { sorted: a, count: 0 };
    const mid = Math.floor(a.length / 2);
    const left = sortCount(a.slice(0, mid));
    const right = sortCount(a.slice(mid));
    let count = left.count + right.count;
    const out = [];
    let i = 0;
    let j = 0;
    while (i < left.sorted.length && j < right.sorted.length) {
      work++;
      if (right.sorted[j] < left.sorted[i]) {
        count += left.sorted.length - i;
        out.push(right.sorted[j++]);
      } else {
        out.push(left.sorted[i++]);
      }
    }
    return { sorted: out.concat(left.sorted.slice(i), right.sorted.slice(j)), count };
  }
  return { count: sortCount(items).count, work };
}

function bruteForce(items) {
  let count = 0;
  let work = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      work++;
      if (items[i] > items[j]) count++;
    }
  }
  return { count, work };
}

console.log(countInversions([1, 3, 2, 5, 4]), bruteForce([1, 3, 2, 5, 4]));

let seed = 7;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const lastMonthRank = Array.from({ length: 5000 }, (_, i) => i + 1);
for (let k = 0; k < 400; k++) {
  const i = Math.floor(random() * 4990);
  const j = i + 1 + Math.floor(random() * 10);
  [lastMonthRank[i], lastMonthRank[j]] = [lastMonthRank[j], lastMonthRank[i]];
}
const fast = countInversions(lastMonthRank);
const slow = bruteForce(lastMonthRank);
console.log(`flipped pairs: ${fast.count} (brute force agrees: ${fast.count === slow.count})`);
console.log(`work: divide and conquer ${fast.work}, brute force ${slow.work}`);
```

Output of `node inversions.js` and of the browser terminal

```json
{ count: 2, work: 6 } { count: 2, work: 10 }
flipped pairs: 3642 (brute force agrees: true)
work: divide and conquer 31689, brute force 12497500
```

The count is the same, for less than 1/300th of the work. The extra line in the merge, `count += left.sorted.length - i`, adds a constant cost per step, so the algorithm is still O(n log n). This number has a name in statistics (the Kendall tau distance), and the same technique compares search result rankings and recommendation lists.

## Quickselect: one position without sorting

Back to the percentile. Quick sort partitions the array around a pivot and puts the pivot in its final sorted position, say position *p*. Everything smaller is left of *p*, everything larger is right of it. Now suppose you only want the item at position *k*:

- If *k* = *p*, the pivot is the answer.
- If *k* < *p*, the answer is somewhere in the left part. The right part is irrelevant.
- If *k* > *p*, it is in the right part.

Quick sort recurses into both parts; **quickselect** recurses into only one. That single change is the whole algorithm, and it changes the cost dramatically.

REASON IT OUT

### Before you write quickselect

Think through these before the code. Is *k* counted from 0 or from 1, and how do you turn "the 95th percentile" into a *k*? What if the array is empty, or *k* is outside it? Partitioning rearranges the array: whose array is it? Delivery times are rounded to whole minutes, so there are 200,000 deliveries but only a few hundred distinct values: does that matter? And what if the deliveries arrive already sorted by time?

**Show the reasoning**

- **Index base**: array positions start at 0, the nearest-rank formula counts from 1. So `k = Math.ceil(p / 100 * n) - 1`. An off-by-one here does not crash; it silently reports the neighbouring value, so test it on a tiny array where you know the answer.
- **Empty array or bad k**: there is no answer. Throw a clear error rather than return `undefined`, which would appear on the dashboard as a blank or as `NaN` minutes.
- **Whose array**: the caller's. The dashboard may use the same array for other charts. Copy it first (O(n) memory), or document loudly that the function reorders its input.
- **Duplicates**: yes, they matter a lot. You saw in [Sorting algorithms](https://zudojs.oyinlola.site/learn/dsa-sorting#quick) that a two-way partition does n²/2 work on a range of equal items. The example below shows it happen.
- **Sorted input**: a fixed pivot (first or last item) is the worst possible choice on sorted data. Pick the pivot at random.

Here is a first version, built from the two-way Lomuto partition of the sorting lesson, with a random pivot. It is iterative: since it only ever continues into one side, a loop that moves `lo` or `hi` replaces the recursion.

tools.js

```ts
export function makeRandom(seed) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

export function deliveryMinutes(n, seed) {
  const random = makeRandom(seed);
  return Array.from({ length: n }, () => Math.round(15 + -Math.log(1 - random()) * 25));
}
```

select-two-way.js

```ts
import { deliveryMinutes, makeRandom } from "./tools.js";

function select(input, k, random, stats) {
  const a = [...input];
  let lo = 0;
  let hi = a.length - 1;
  while (lo < hi) {
    const r = lo + Math.floor(random() * (hi - lo + 1));
    [a[r], a[hi]] = [a[hi], a[r]];
    const pivot = a[hi];
    let store = lo;
    for (let i = lo; i < hi; i++) {
      stats.comparisons++;
      if (a[i] < pivot) {
        [a[i], a[store]] = [a[store], a[i]];
        store++;
      }
    }
    [a[store], a[hi]] = [a[hi], a[store]];
    if (k === store) return a[k];
    if (k < store) hi = store - 1;
    else lo = store + 1;
  }
  return a[lo];
}

const n = 200000;
const distinct = Array.from({ length: n }, (_, i) => (i * 7919) % n);
const minutes = deliveryMinutes(n, 11);

for (const [label, data] of [["distinct numbers", distinct], ["delivery minutes", minutes]]) {
  const stats = { comparisons: 0 };
  const median = select(data, Math.ceil(0.5 * n) - 1, makeRandom(3), stats);
  console.log(`${label}: median ${median}, ${stats.comparisons} comparisons (${(stats.comparisons / n).toFixed(1)} per item)`);
}
```

Output of `node select-two-way.js` and of the browser terminal

```ts
distinct numbers: median 99999, 999235 comparisons (5.0 per item)
delivery minutes: median 32, 9700173 comparisons (48.5 per item)
```

`deliveryMinutes` generates realistic times: at least 15 minutes, usually under an hour, with a long tail of slow deliveries. On distinct numbers the two-way version needs only a few comparisons per item. On the delivery minutes, where tens of thousands of deliveries share the median value, it needs almost fifty per item, and the count grows with the square of the number of duplicates. The fix is the three-way partition from the sorting lesson: smaller, equal, larger. If *k* lands among the items equal to the pivot, the pivot *is* the answer, and all duplicates are dealt with in a single pass.

select.js

```ts
export function quickselect(input, k, { random = Math.random, stats = { comparisons: 0 } } = {}) {
  if (!Number.isInteger(k) || k < 0 || k >= input.length) {
    throw new RangeError(`k must be an integer from 0 to ${input.length - 1}, got ${k}`);
  }
  const a = [...input];
  let lo = 0;
  let hi = a.length - 1;
  while (lo < hi) {
    const pivot = a[lo + Math.floor(random() * (hi - lo + 1))];
    let lt = lo;
    let i = lo;
    let gt = hi;
    while (i <= gt) {
      stats.comparisons++;
      if (a[i] < pivot) {
        [a[lt], a[i]] = [a[i], a[lt]];
        lt++;
        i++;
      } else if (a[i] > pivot) {
        [a[i], a[gt]] = [a[gt], a[i]];
        gt--;
      } else {
        i++;
      }
    }
    if (k < lt) hi = lt - 1;
    else if (k > gt) lo = gt + 1;
    else return pivot;
  }
  return a[lo];
}

export function percentile(values, p, options) {
  if (values.length === 0) throw new RangeError("no values");
  if (!(p > 0 && p <= 100)) throw new RangeError(`p must be above 0 and at most 100, got ${p}`);
  return quickselect(values, Math.ceil((p / 100) * values.length) - 1, options);
}
```

After the partition, `a[lo..lt-1]` is smaller than the pivot, `a[lt..gt]` equal and `a[gt+1..hi]` larger. The validation happens before any work, and `percentile` converts the nearest-rank definition into a 0-based *k* in exactly one place.

dashboard.js

```ts
import { percentile } from "./select.js";
import { deliveryMinutes, makeRandom } from "./tools.js";

const minutes = deliveryMinutes(200000, 11);

for (const p of [50, 95, 99]) {
  const stats = { comparisons: 0 };
  const value = percentile(minutes, p, { random: makeRandom(3), stats });
  console.log(`p${p}: ${value} min, ${stats.comparisons} comparisons`);
}

const sorted = minutes.toSorted((a, b) => a - b);
console.log(`check by sorting: p50 ${sorted[99999]}, p95 ${sorted[189999]}, p99 ${sorted[197999]}`);
console.log("mean:", (minutes.reduce((s, m) => s + m, 0) / minutes.length).toFixed(1), "min");
```

Output of `node dashboard.js` and of the browser terminal

```ts
p50: 32 min, 528135 comparisons
p95: 90 min, 283007 comparisons
p99: 130 min, 282570 comparisons
check by sorting: p50 32, p95 90, p99 130
mean: 40.0 min
```

The median now costs about 2.6 comparisons per delivery, and p95 and p99 less than 1.5, where a comparison sort needs about log₂ 200,000 ≈ 17.6 per delivery. The sort in the example is only there to check the answers: a clever algorithm should always be checked against a simple one. The mean is 8 minutes above the median, pulled up by the slow tail, which is why the dashboard does not show it.

### Why quickselect is O(n) on average

Draw the recursion tree. It is not a tree at all but a single path, because each round continues into one side. With a random pivot, the side you keep is on average about half the range (it is at most three quarters of it at least half the time). So the work per round is roughly n, then n/2, then n/4, and so on:

```ts
n + n/2 + n/4 + n/8 + ... < 2n
```

That geometric sum never reaches 2n, however many terms it has, so the expected cost is O(n). A more careful analysis gives an average of about 3.4n comparisons for the median (a single run lands above or below that, like the 5.0 and 2.6 per item you measured) and fewer for extreme percentiles. The worst case, a pivot that is always the largest or smallest item, is still O(n²), and a random pivot makes it vanishingly unlikely. If you need a guarantee, an algorithm called **median of medians** picks a pivot that is always good enough, for O(n) in the worst case, at the price of a larger constant; it is rarely used in practice.

## Fast power: halving the exponent

Many security systems, from HTTPS key exchange to the signatures on payment webhooks, compute numbers like 51,000,003 modulo a large prime. Multiplying 5 by itself a million times is a million multiplications. Divide and conquer needs about thirty.

The idea is that an even power is the square of a half power: `x¹⁰⁰ = (x⁵⁰)²`. An odd power needs one extra factor: `x¹⁰¹ = x × (x⁵⁰)²`. So computing xn needs xn/2, once, plus one or two multiplications. The exponent halves each time, so there are about log₂ n steps. This is **exponentiation by squaring**.

The modulus matters: 51,000,003 has about 700,000 digits. Working **modulo** m means keeping only the remainder after dividing by m (the `%` operator). Because `(a × b) % m` equals `((a % m) × (b % m)) % m`, you can reduce after every multiplication and the numbers never grow beyond m². JavaScript numbers lose precision above 253, so the code uses **BigInt**, integers of any size written with an `n` suffix (`5n`).

power.js

```ts
export function powMod(base, exponent, modulus, stats = { multiplications: 0 }) {
  if (exponent < 0n) throw new RangeError("exponent must not be negative");
  if (exponent === 0n) return 1n % modulus;
  const half = powMod(base, exponent / 2n, modulus, stats);
  let result = (half * half) % modulus;
  stats.multiplications++;
  if (exponent % 2n === 1n) {
    result = (result * base) % modulus;
    stats.multiplications++;
  }
  return result;
}

export function powModSlow(base, exponent, modulus, stats = { multiplications: 0 }) {
  let result = 1n % modulus;
  for (let i = 0n; i < exponent; i++) {
    result = (result * base) % modulus;
    stats.multiplications++;
  }
  return result;
}
```

BigInt division truncates, so `exponent / 2n` is already the rounded-down half. The base case is exponent 0, where the answer is 1 (and `1n % modulus` handles the odd modulus of 1, where every answer is 0).

power-demo.js

```ts
import { powMod, powModSlow } from "./power.js";

const p = 2147483647n;
console.log(`3^13 = ${powMod(3n, 13n, 10n ** 12n)}, check: ${3n ** 13n}`);

for (const exponent of [1000n, 100000n]) {
  const fast = { multiplications: 0 };
  const slow = { multiplications: 0 };
  const a = powMod(5n, exponent, p, fast);
  const b = powModSlow(5n, exponent, p, slow);
  console.log(`5^${exponent} mod p = ${a} (same: ${a === b}), multiplications: fast ${fast.multiplications}, slow ${slow.multiplications}`);
}

const huge = { multiplications: 0 };
console.log(`5^1000003 mod p = ${powMod(5n, 1000003n, p, huge)} with ${huge.multiplications} multiplications`);
```

Output of `node power-demo.js` and of the browser terminal

```ts
3^13 = 1594323, check: 1594323
5^1000 mod p = 553501903 (same: true), multiplications: fast 16, slow 1000
5^100000 mod p = 1561064141 (same: true), multiplications: fast 23, slow 100000
5^1000003 mod p = 2058733868 with 29 multiplications
```

A hundred times larger exponent adds 7 multiplications, not 99,000. The number of multiplications is between log₂ n and 2 log₂ n: one squaring per bit of the exponent, plus one extra multiplication for every 1 bit. The recursion is only log₂ n calls deep (20 for a million), so it cannot overflow the stack.

The same halving works for anything you can "multiply" associatively, meaning `(a × b) × c = a × (b × c)`: matrices (which gives Fibonacci numbers in O(log n) steps), compositions of functions, or applying "one day of compound interest" 3,650 times. For ordinary floating-point numbers you do not need it: `**` and `Math.pow` are already fast. Real cryptographic code uses vetted libraries such as `node:crypto` rather than hand-written `powMod`, because a real implementation must also take the same time whatever the secret exponent is, to avoid timing attacks.

## Recursion trees and the master theorem

All the algorithms so far fit one shape: a call on a problem of size n makes *a* recursive calls on problems of size n/*b*, and does *f*(n) work of its own (dividing and combining). Their cost follows a **recurrence**, a formula that defines the cost in terms of itself on smaller inputs:

```ts
T(n) = a · T(n / b) + f(n)
```

| Algorithm | a | b | f(n) | Cost |
| --- | --- | --- | --- | --- |
| Binary search ([Searching](https://zudojs.oyinlola.site/learn/dsa-searching)) | 1 | 2 | 1 | O(log n) |
| Fast power (n = the exponent) | 1 | 2 | 1 | O(log n) |
| Largest order, divide and conquer | 2 | 2 | 1 | O(n) |
| Quickselect (average) | 1 | 2 | n | O(n) |
| Merge sort, counting inversions | 2 | 2 | n | O(n log n) |
| Schoolbook multiplication of n-digit numbers, split in halves | 4 | 2 | n | O(n²) |
| Karatsuba multiplication | 3 | 2 | n | O(n1.585) |

The recursion tree explains all of these at once. The tree has logb n levels. Going down one level, the number of nodes is multiplied by *a*, while each node's problem is divided by *b*. So there is a tug of war between the **root** (one call doing f(n) work) and the **leaves** (there are alogb n = nlogb a of them, each doing constant work). The **master theorem** says who wins:

1. **Leaves win**: if f(n) grows more slowly than nlogb a, the work per level grows as you go down, and the leaves dominate. Cost: Θ(nlogb a). Example: largest order (a = 2, b = 2, n1 leaves, f = 1): O(n).
2. **Tie**: if f(n) grows like nlogb a, every level does the same work, and there are log n levels. Cost: Θ(f(n) log n). Examples: merge sort (n per level × log n levels), binary search (1 per level × log n levels).
3. **Root wins**: if f(n) grows faster, the work per level shrinks geometrically as you go down, and the root's work dominates the whole sum. Cost: Θ(f(n)). Example: quickselect, n + n/2 + n/4 + … < 2n.

You do not have to trust this. The recurrence itself is a program: compute T(n) for a small n and for an n that is 1,024 times larger, and look at how much the cost grew.

recurrence.js

```ts
function T(n, a, b, f) {
  if (n <= 1) return 1;
  return a * T(n / b, a, b, f) + f(n);
}

const shapes = [
  ["binary search      a=1 b=2 f=1", 1, 2, () => 1, "log n: x2"],
  ["largest (d&c)      a=2 b=2 f=1", 2, 2, () => 1, "n: x1024"],
  ["quickselect (avg)  a=1 b=2 f=n", 1, 2, (n) => n, "n: x1024"],
  ["merge sort         a=2 b=2 f=n", 2, 2, (n) => n, "n log n: x2048"],
  ["Karatsuba          a=3 b=2 f=n", 3, 2, (n) => n, "n^1.585: x59049"],
  ["four half products a=4 b=2 f=n", 4, 2, (n) => n, "n^2: x1048576"],
];

const small = 2 ** 10;
const large = 2 ** 20;
for (const [name, a, b, f, predicted] of shapes) {
  const growth = T(large, a, b, f) / T(small, a, b, f);
  console.log(`${name}  grew x${growth.toFixed(0).padEnd(8)} predicted ${predicted}`);
}
```

Output of `node recurrence.js` and of the browser terminal

```ts
binary search      a=1 b=2 f=1  grew x2        predicted log n: x2
largest (d&c)      a=2 b=2 f=1  grew x1024     predicted n: x1024
quickselect (avg)  a=1 b=2 f=n  grew x1024     predicted n: x1024
merge sort         a=2 b=2 f=n  grew x1955     predicted n log n: x2048
Karatsuba          a=3 b=2 f=n  grew x59728    predicted n^1.585: x59049
four half products a=4 b=2 f=n  grew x1049088  predicted n^2: x1048576
```

Each measured growth factor is close to the prediction. (The small differences come from the lower-order terms, such as the +1 in binary search's 11 versus 21 steps, and they fade as n grows.) Evaluating `T` here is cheap even when the algorithm is not, because `a * T(n / b)` makes one recursive call per level instead of *a* of them.

> NOTE
>
> The master theorem needs subproblems of *equal size*, n/b, and it does not cover every f(n). Quick sort's worst case, T(n) = T(n − 1) + n, shrinks by subtraction rather than division; the recursion tree still works (a path of n levels doing n, n − 1, n − 2, … work: n²/2). When in doubt, draw the tree and add up the levels.

### Karatsuba: why a = 3 instead of 4 matters

The last two rows are both ways of multiplying two n-digit numbers by splitting each into a high half and a low half. The obvious way needs four half-size products, and the leaves win: O(n²), no better than school multiplication. In 1960 Anatoly Karatsuba noticed that three half-size products are enough, with a few extra additions. That changes one number in the recurrence, a = 3, and the cost drops to nlog₂ 3 ≈ n1.585. For numbers with a million digits, the `T` function above says that is about 200 times less work. It is used inside the BigInt implementations of JavaScript engines. When the leaves dominate, reducing *a* is what pays; when the root dominates, making f(n) cheaper is what pays.

## When divide and conquer goes wrong

Every one of these bugs keeps the answer correct and silently destroys the running time, which is why you count operations in tests.

### Slicing when you only needed to index

Binary search on a sorted list of order ids should cost O(log n). This version slices the array at every step to "pass the half" to the recursive call:

slice-cost.js

```ts
let copied = 0;

function containsSliced(sorted, id) {
  if (sorted.length === 0) return false;
  const mid = Math.floor(sorted.length / 2);
  if (sorted[mid] === id) return true;
  const half = sorted[mid] < id ? sorted.slice(mid + 1) : sorted.slice(0, mid);
  copied += half.length;
  return containsSliced(half, id);
}

let steps = 0;
function containsIndexed(sorted, id, lo = 0, hi = sorted.length - 1) {
  if (lo > hi) return false;
  steps++;
  const mid = Math.floor((lo + hi) / 2);
  if (sorted[mid] === id) return true;
  return sorted[mid] < id ? containsIndexed(sorted, id, mid + 1, hi) : containsIndexed(sorted, id, lo, mid - 1);
}

const ids = Array.from({ length: 1000000 }, (_, i) => 100000 + i * 2);
console.log(containsSliced(ids, 1899999), "items copied:", copied);
console.log(containsIndexed(ids, 1899999), "steps:", steps);
```

Output of `node slice-cost.js` and of the browser terminal

```ts
false items copied: 999977
false steps: 20
```

Both correctly report that the id (an odd number) is not in the list. The sliced version copied about a million items to do twenty comparisons: n/2 + n/4 + … is about n, so its real cost is O(n), no better than a linear scan. When you divide, pass index ranges. Merge sort can afford its slices only because it does O(n) work per level anyway.

### Subproblems that do not shrink

If the divide step can produce a part as large as the input, the recursion never ends. The classic case is computing the midpoint as `Math.ceil((lo + hi) / 2)` and then recursing on `[lo, mid]`: for a two-item range, `mid` equals `hi`, and the "half" is the whole range again. The result is a `RangeError: Maximum call stack size exceeded`, or an infinite loop in an iterative version. Check your split on ranges of one and two items.

### Overlapping subproblems

Divide and conquer assumes the subproblems are *independent*: the halves of merge sort share no items. Some recursive definitions split into subproblems that overlap, like "the ways to pay ₦n" (ways to pay ₦n − 50 plus ways to pay ₦n − 100, which both need ₦n − 150, …). Solving them independently repeats the same work exponentially often, as you saw with `ways(25)` in [Recursion](https://zudojs.oyinlola.site/learn/js-recursion#bugs). Such problems need [dynamic programming](https://zudojs.oyinlola.site/learn/dsa-dynamic-programming) instead: solve each subproblem once and remember it.

### Unbalanced splits

The analysis assumed the parts are a fixed fraction of the input. A split that peels off one item at a time (quick sort's fixed pivot on sorted data) turns log n levels into n levels. Random pivots, or splitting by position rather than by value, keep the split balanced.

## Testing divide-and-conquer code

Each algorithm here has a slow, obviously correct twin: sort and index, multiply in a loop, check every pair. Compare them on many small random inputs, including every possible *k*, duplicates, and the edges (one item, *k* = 0, *k* = n − 1). Then check the error paths.

select-test.js

```ts
import { percentile, quickselect } from "./select.js";
import { makeRandom } from "./tools.js";

let checks = 0;
let failures = 0;
const random = makeRandom(2026);

for (let t = 0; t < 300; t++) {
  const n = 1 + Math.floor(random() * 30);
  const values = Array.from({ length: n }, () => Math.floor(random() * 8));
  const before = values.join();
  const sorted = values.toSorted((a, b) => a - b);
  for (let k = 0; k < n; k++) {
    checks++;
    if (quickselect(values, k, { random: makeRandom(1 + t) }) !== sorted[k]) failures++;
  }
  if (values.join() !== before) failures++;
}
console.log(`${failures === 0 ? "PASS" : "FAIL"} quickselect matches sorting on ${checks} (array, k) pairs`);

const tiny = [40, 10, 30, 20];
console.log("PASS nearest rank:", percentile(tiny, 50) === 20 && percentile(tiny, 75) === 30 && percentile(tiny, 100) === 40);

for (const [label, run] of [
  ["empty", () => percentile([], 50)],
  ["p = 0", () => percentile(tiny, 0)],
  ["k too big", () => quickselect(tiny, 4)],
  ["k not integer", () => quickselect(tiny, 1.5)],
]) {
  try {
    run();
    console.log(`FAIL ${label}: no error`);
  } catch (error) {
    console.log(`PASS ${label}: ${error.message}`);
  }
}
```

Output of `node select-test.js` and of the browser terminal

```ts
PASS quickselect matches sorting on 4510 (array, k) pairs
PASS nearest rank: true
PASS empty: no values
PASS p = 0: p must be above 0 and at most 100, got 0
PASS k too big: k must be an integer from 0 to 3, got 4
PASS k not integer: k must be an integer from 0 to 3, got 1.5
```

Values between 0 and 7 in arrays of up to 30 items guarantee plenty of duplicates, which is exactly where the two-way version fell over. The nearest-rank check uses an array small enough to work out by hand: sorted, it is 10, 20, 30, 40, so the median is the 2nd value and p75 the 3rd. For performance, add a test that counts comparisons on a large duplicate-heavy input and fails if they exceed, say, 10n; that catches someone "simplifying" the three-way partition back to two-way.

## Divide and conquer in production

- **Percentiles on live traffic.** Quickselect needs all values in memory. Monitoring systems that report p95 latency over millions of requests use **sketches** instead (HDR histograms, t-digest): small summaries that answer percentile queries approximately, with a known error, and that can be merged across servers. When the data is in a database, `percentile_disc(0.95) WITHIN GROUP (ORDER BY minutes)` in PostgreSQL does it for you.
- **Parallelism.** Independent subproblems can run at the same time. Map-reduce systems, parallel sorts and database query engines split data into chunks, process them on different cores or machines, and combine the results. It only works when the combine step is cheap and the parts truly do not depend on each other.
- **Data larger than memory.** Bottom-up merging is how you sort a 50 GB log file on a machine with 4 GB of memory: sort chunks that fit, write them out as runs, then merge runs (with the k-way heap merge from [Heaps](https://zudojs.oyinlola.site/learn/dsa-heaps#merge)).
- **Small cases.** Recursion has overhead per call. Real implementations stop dividing at a small size (often 16 to 64 items) and finish with a simple algorithm such as insertion sort, which is faster on tiny inputs.
- **Recursion depth.** Balanced splits give depth log₂ n, which is always safe. Unbalanced splits can reach depth n. Recurse into the smaller part and loop on the larger one, or write the algorithm iteratively like the quickselect above.

## Practice

TRY IT YOURSELF

### The best run of trading days

A shop's daily profit (in thousands of naira, negative on loss days) is below. Find the largest total of any run of *consecutive* days, with divide and conquer: the best run is entirely in the left half, entirely in the right half, or it *crosses* the middle. The crossing case is the combine step: the best run ending at the middle plus the best run starting just after it. What is the cost?

**Show a solution**

best-run.js

```ts
function bestRun(days, lo = 0, hi = days.length - 1) {
  if (lo === hi) return days[lo];
  const mid = Math.floor((lo + hi) / 2);

  let sum = 0;
  let bestLeft = -Infinity;
  for (let i = mid; i >= lo; i--) {
    sum += days[i];
    bestLeft = Math.max(bestLeft, sum);
  }
  sum = 0;
  let bestRight = -Infinity;
  for (let i = mid + 1; i <= hi; i++) {
    sum += days[i];
    bestRight = Math.max(bestRight, sum);
  }

  return Math.max(bestRun(days, lo, mid), bestRun(days, mid + 1, hi), bestLeft + bestRight);
}

const profit = [12, -30, 45, 10, -8, 22, -60, 18, 5, -2];
console.log("best run:", bestRun(profit));
console.log("all losses:", bestRun([-5, -2, -9]));
```

Output of `node best-run.js` and of the browser terminal

```ts
best run: 69
all losses: -2
```

The best run is days 3 to 6: 45 + 10 − 8 + 22 = 69. Each call does O(n) work scanning outwards from the middle, and there are two half-size calls: T(n) = 2T(n/2) + n, the merge sort shape, so O(n log n). When every day is a loss, the answer is the least bad single day, because the base case returns a single day and a run must contain at least one. There is an O(n) solution to this problem too (Kadane's algorithm), which you will meet with the problem-solving patterns in [Sliding window and prefix sums](https://zudojs.oyinlola.site/learn/pattern-sliding-window).

TRY IT YOURSELF

### Merge many branches by halves

Head office receives one list of order times per branch, each sorted. Merge *k* lists by divide and conquer: merge the first half of the lists, merge the second half, then merge the two results. Count comparisons for 16 branches with 1,000 orders each, and compare with merging the lists one after another into a growing result.

**Show a solution**

merge-branches.js

```ts
let comparisons = 0;

function merge(a, b) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    comparisons++;
    out.push(b[j] < a[i] ? b[j++] : a[i++]);
  }
  return out.concat(a.slice(i), b.slice(j));
}

function mergeAll(lists, lo = 0, hi = lists.length - 1) {
  if (lo > hi) return [];
  if (lo === hi) return lists[lo];
  const mid = Math.floor((lo + hi) / 2);
  return merge(mergeAll(lists, lo, mid), mergeAll(lists, mid + 1, hi));
}

const branches = Array.from({ length: 16 }, (_, b) =>
  Array.from({ length: 1000 }, (_, i) => i * 16 + ((b * 7) % 16)),
);

const byHalves = mergeAll(branches);
console.log("by halves:", byHalves.length, "orders,", comparisons, "comparisons");

comparisons = 0;
let running = [];
for (const list of branches) running = merge(running, list);
console.log("one by one:", running.length, "orders,", comparisons, "comparisons");
console.log("same result:", byHalves.join() === running.join());
```

Output of `node merge-branches.js` and of the browser terminal

```ts
by halves: 16000 orders, 63984 comparisons
one by one: 16000 orders, 134940 comparisons
same result: true
```

By halves, each order takes part in log₂ 16 = 4 merges: O(N log k) for N orders in total, the same as the heap merge in [Heaps](https://zudojs.oyinlola.site/learn/dsa-heaps#merge). One by one, the early orders are merged again and again into an ever-growing result: O(N k). The recursion tree over the *lists* is the merge sort tree, with branches instead of single items as leaves.

TRY IT YOURSELF

### The k cheapest products, in order

The catalogue page shows the 5 cheapest of 10,000 products, cheapest first. Use `quickselect` to find the 5th smallest price, then collect everything cheaper than it (plus enough equal ones to make 5), and sort only those. Why is that O(n + k log k)?

**Show a solution**

cheapest.js

```ts
import { quickselect } from "./select.js";
import { makeRandom } from "./tools.js";

const random = makeRandom(5);
const prices = Array.from({ length: 10000 }, () => 500 + Math.floor(random() * 200000));

function cheapest(values, k) {
  const threshold = quickselect(values, k - 1, { random: makeRandom(3) });
  const below = values.filter((v) => v < threshold);
  const equal = values.filter((v) => v === threshold).slice(0, k - below.length);
  return [...below, ...equal].sort((a, b) => a - b);
}

const five = cheapest(prices, 5);
console.log(five.join(" "));
console.log("matches a full sort:", five.join() === prices.toSorted((a, b) => a - b).slice(0, 5).join());
```

Output of `node cheapest.js` and of the browser terminal

```ts
503 506 507 532 539
matches a full sort: true
```

Quickselect is O(n) on average, the two filters are O(n), and sorting the k survivors is O(k log k). The "equal" step matters when several products share the threshold price: taking all of them could return more than k, taking none could return fewer. For a stream of prices that does not fit in memory, the size-k heap from [Heaps](https://zudojs.oyinlola.site/learn/dsa-heaps#top-k) is the better tool.

## Summary

- Divide and conquer: divide into smaller problems of the same kind, conquer them recursively (with a base case), and combine. Ask where the work is: merge sort works in the combine step, quick sort and quickselect in the divide step.
- Splitting alone saves nothing (the largest order still needs n − 1 comparisons). It pays when it lets you skip work, like quickselect ignoring one side, or when the combine step is cheap and does double duty, like counting inversions during a merge.
- Quickselect finds the k-th smallest item, a median or a percentile in O(n) on average: n + n/2 + n/4 + … < 2n. Use a random pivot, a three-way partition for duplicates, copy the input, and convert percentiles to a 0-based k in one place.
- Exponentiation by squaring computes xn with O(log n) multiplications; with BigInt and a modulus it handles the huge powers used in cryptography.
- A recursion tree adds up the work level by level. For T(n) = aT(n/b) + f(n), the master theorem compares f(n) with nlogb a: leaves win, tie (× log n), or root wins.
- Common mistakes keep the answer right and ruin the cost: slicing instead of passing indexes, parts that do not shrink, unbalanced splits, and overlapping subproblems.

Next: [Graph search](https://zudojs.oyinlola.site/learn/dsa-graph-search) leaves arrays behind and explores graphs with breadth-first and depth-first search, to find delivery routes, solve mazes and pick seats.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
