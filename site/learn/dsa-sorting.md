---
title: "Sorting algorithms — ZudoJS Academy"
description: "Build bubble, selection, insertion, merge and quick sort, count their comparisons, then sort real orders by several keys with a stable, tested sort."
source: https://zudojs.oyinlola.site/learn/dsa-sorting
---

LEVEL 3 · LESSON 11 OF 21

Algorithms Core

# Sorting algorithms

Build bubble, selection, insertion, merge and quick sort, count their comparisons, then sort real orders by several keys with a stable, tested sort.

- **55 min** to read and try
- **You need:** Big O and complexity, Recursion, Arrays and strings under the hood, and Heaps and priority queues
- **You build:** A tested library of five sorting algorithms with comparison counters, and a multi-key order report sorted by date then amount

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Write a correct comparator and explain why the default sort orders numbers as text
- Implement bubble, selection, insertion, merge and quick sort and count the comparisons each one makes
- Explain stability and use it to sort orders by date and then by amount
- Choose a sort for sorted, nearly sorted, random and duplicate-heavy data, and justify its complexity
- Test a sort against a reference, including stability and duplicates

## The problem: an order report in the wrong order

The finance team at an online shop wants a daily report: every order, grouped by date, and within each date the largest orders first, so they can check the big ones before the bank closes. You have the orders as an array. The first attempt sorts the amounts and gets nonsense:

first-try.js

```ts
const amounts = [25000, 3500, 100, 1200000, 99000, 750];

const sorted = amounts.sort();
console.log(sorted.join(", "));
console.log("same array as before?", sorted === amounts);
```

Output of `node first-try.js` and of the browser terminal

```ts
100, 1200000, 25000, 3500, 750, 99000
same array as before? true
```

Two surprises. First, `₦1,200,000` sits between `₦100` and `₦25,000`. With no arguments, `sort` turns every item into a string and orders the strings character by character, the way a dictionary does. `"1200000"` comes before `"25000"` because `"1"` comes before `"2"`. Second, `sort` did not make a new array: it rearranged the original and returned the same one. Any other code holding `amounts` now sees it in a different order.

Fixing the first surprise takes one line (you will see it next). But the report raises bigger questions that one line does not answer. How does a computer put a million orders in order? Why are some ways of doing it a thousand times slower than others? Why does sorting by amount and then by date sometimes keep the amounts in order within each day, and sometimes scramble them? This lesson answers those by building the classic sorting algorithms yourself, counting the work each one does, and then using what you learned to drive JavaScript's built-in sort properly.

A **sorting algorithm** takes a list of items and a rule for which item comes first, and returns the same items rearranged so that every item comes before or together with the one after it. The rule is the interesting part, so it comes first.

## The comparator: the rule that defines the order

Every sort in this lesson, and JavaScript's own `sort`, learns the order from a **comparator**: a function `compare(a, b)` that returns

- a **negative** number when `a` should come before `b`,
- a **positive** number when `a` should come after `b`,
- **zero** when the two are equal for this order (either may come first).

For numbers, `a - b` does all three at once: it is negative exactly when `a < b`. `b - a` reverses the order. Strings cannot be subtracted, so compare them with `<` and `>`, or with `localeCompare` for human text.

comparators.js

```ts
const amounts = [25000, 3500, 100, 1200000, 99000, 750];

console.log("ascending: ", amounts.toSorted((a, b) => a - b).join(", "));
console.log("descending:", amounts.toSorted((a, b) => b - a).join(", "));

const products = ["rice 50kg", "Garri", "beans", "Yam flour"];
console.log("< and >:     ", products.toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join(" | "));
console.log("localeCompare:", products.toSorted((a, b) => a.localeCompare(b)).join(" | "));

console.log("boolean comparator:", amounts.toSorted((a, b) => a > b).join(", "));
```

Output of `node comparators.js` and of the browser terminal

```ts
ascending:  100, 750, 3500, 25000, 99000, 1200000
descending: 1200000, 99000, 25000, 3500, 750, 100
< and >:      Garri | Yam flour | beans | rice 50kg
localeCompare: beans | Garri | rice 50kg | Yam flour
boolean comparator: 25000, 3500, 100, 1200000, 99000, 750
```

`toSorted` (added in ES2023) sorts a *copy* and leaves the original alone, which is what you want most of the time. Notice three things:

- With `<` on strings, every capital letter comes before every lower-case letter, because the comparison uses character codes. `localeCompare` orders them the way a person expects.
- The last line is a very common bug. `(a, b) => a > b` returns `true` or `false`, which become `1` and `0`. It never returns a negative number, so the sort is never told that anything comes *before* anything else. Nothing in the spec says what happens then: the engine's internal algorithm decides, and it can change with array size or engine version. On Node 24's V8, this particular six-item array happens to come back unchanged, with no error; a different engine, version or array size could reorder it differently. A comparator must be able to return all three signs.
- Sorting never changes the items themselves, only their positions. That is why you can sort order objects and still have the same order objects afterwards.

A comparator also has to be **consistent**: if `a` comes before `b` and `b` before `c`, then `a` must come before `c`, and it must give the same answer every time for the same pair. A comparator that uses `Math.random()` or reads a value that changes during the sort breaks this, and the result is some arbitrary arrangement, not a shuffle and not an error.

## Counting the work

To compare algorithms fairly you need a measure that does not change from run to run. Timings do: they depend on the machine, on what else is running, and on the JIT compiler warming up ([Big O and complexity](https://zudojs.oyinlola.site/learn/dsa-complexity#counting-steps) explains why). This lesson counts **comparisons** (calls to the comparator) and **writes** (times a value is stored into the array). Both are exact and repeatable, and for a comparison sort the number of comparisons is the dominant cost.

All the sorts share a few helpers: a seeded random number generator, so "random" data is the same on every run, and a fresh counter object.

tools.js

```ts
export function makeRandom(seed) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

export function randomInts(n, max, seed = 1) {
  const random = makeRandom(seed);
  return Array.from({ length: n }, () => Math.floor(random() * max));
}

export function newStats() {
  return { comparisons: 0, writes: 0 };
}

export const ascending = (a, b) => a - b;
```

Every sort takes `(input, compare, stats)`, copies the input first so the caller's array is never changed, and returns the sorted copy. That is the same contract as `toSorted`.

## Bubble sort

The simplest idea: walk along the array comparing neighbours, and swap any pair that is in the wrong order. After one full pass the largest item has been carried all the way to the end, like a bubble rising. The next pass can stop one place earlier. If a pass makes no swaps at all, the array is sorted and you can stop.

```ts
pass 1:  [5 1 4 2]  ->  [1 5 4 2]  ->  [1 4 5 2]  ->  [1 4 2 5]   5 is in place
pass 2:  [1 4 2 | 5]  ->  [1 4 2]  ->  [1 2 4]                  4 is in place
pass 3:  [1 2 | 4 5]  ->  no swaps: stop
```

bubble.js

```ts
import { newStats } from "./tools.js";

export function bubbleSort(input, compare, stats = newStats()) {
  const a = [...input];
  for (let end = a.length - 1; end > 0; end--) {
    let swapped = false;
    for (let i = 0; i < end; i++) {
      stats.comparisons++;
      if (compare(a[i], a[i + 1]) > 0) {
        [a[i], a[i + 1]] = [a[i + 1], a[i]];
        stats.writes += 2;
        swapped = true;
      }
    }
    if (!swapped) break;
  }
  return a;
}
```

bubble-demo.js

```ts
import { bubbleSort } from "./bubble.js";
import { ascending, newStats, randomInts } from "./tools.js";

console.log(bubbleSort([25000, 3500, 100, 1200000, 99000, 750], ascending).join(", "));

for (const n of [100, 1000]) {
  const random = newStats();
  bubbleSort(randomInts(n, 100000), ascending, random);
  const sorted = newStats();
  bubbleSort(Array.from({ length: n }, (_, i) => i), ascending, sorted);
  console.log(`n=${n}: random ${random.comparisons} comparisons, already sorted ${sorted.comparisons}`);
}
```

Output of `node bubble-demo.js` and of the browser terminal

```ts
100, 750, 3500, 25000, 99000, 1200000
n=100: random 4779 comparisons, already sorted 99
n=1000: random 498225 comparisons, already sorted 999
```

On random data, ten times more items cost about a hundred times more comparisons: O(n²). Pass one makes n − 1 comparisons, pass two n − 2, and so on, which adds up to n(n − 1)/2. On data that is already sorted, the first pass makes no swaps and the `swapped` flag stops it after n − 1 comparisons: O(n) in the best case. Without that flag, bubble sort would do the full n²/2 even on sorted data.

Bubble sort is worth knowing because it is the easiest sort to get right and to reason about, not because you should use it. Its swaps only ever exchange neighbours, which makes it the slowest of the simple sorts in practice.

## Selection sort

Selection sort works the way you might sort cards on a table: find the smallest card, put it first; find the smallest of the rest, put it second; and so on. Each step *selects* the minimum of the unsorted part and swaps it into place.

selection.js

```ts
import { newStats } from "./tools.js";

export function selectionSort(input, compare, stats = newStats()) {
  const a = [...input];
  for (let i = 0; i < a.length - 1; i++) {
    let min = i;
    for (let j = i + 1; j < a.length; j++) {
      stats.comparisons++;
      if (compare(a[j], a[min]) < 0) min = j;
    }
    if (min !== i) {
      [a[i], a[min]] = [a[min], a[i]];
      stats.writes += 2;
    }
  }
  return a;
}
```

selection-demo.js

```ts
import { bubbleSort } from "./bubble.js";
import { selectionSort } from "./selection.js";
import { ascending, newStats, randomInts } from "./tools.js";

const n = 1000;
const inputs = {
  random: randomInts(n, 100000),
  sorted: Array.from({ length: n }, (_, i) => i),
};
for (const [label, data] of Object.entries(inputs)) {
  const s = newStats();
  selectionSort(data, ascending, s);
  const b = newStats();
  bubbleSort(data, ascending, b);
  console.log(`${label}: selection ${s.comparisons} comparisons / ${s.writes} writes, bubble ${b.comparisons} / ${b.writes}`);
}
```

Output of `node selection-demo.js` and of the browser terminal

```ts
random: selection 499500 comparisons / 1976 writes, bubble 498225 / 497286
sorted: selection 499500 comparisons / 0 writes, bubble 999 / 0
```

Selection sort always makes exactly n(n − 1)/2 comparisons, even when the input is already sorted: it cannot know that the rest is sorted without looking at all of it. It is Θ(n²) in every case. Its one strength is writes: at most one swap per position, so at most 2(n − 1) writes, against hundreds of thousands for bubble sort. When writing is far more expensive than comparing (moving heavy records, writing to flash memory that wears out), that can matter. Usually it does not.

Selection sort has a hidden weakness that you will see in the [section on stability](#stability): the long-distance swap can jump an item over another item that is equal to it.

## Insertion sort and the leaderboard

Insertion sort is how most people sort a hand of cards: take the next card and slide it left past every card that is bigger, until it sits in the right place. The left part of the array is always sorted; each step inserts one more item into it.

insertion.js

```ts
import { newStats } from "./tools.js";

export function insertionSort(input, compare, stats = newStats()) {
  const a = [...input];
  for (let i = 1; i < a.length; i++) {
    const item = a[i];
    let j = i - 1;
    while (j >= 0 && (stats.comparisons++, compare(a[j], item) > 0)) {
      a[j + 1] = a[j];
      stats.writes++;
      j--;
    }
    a[j + 1] = item;
    stats.writes++;
  }
  return a;
}
```

The inner loop stops at the first item that is not bigger, so an item that is already in place costs one comparison. How much work insertion sort does depends on how unsorted the input is. An **inversion** is a pair of items in the wrong order relative to each other; insertion sort shifts once per inversion. A sorted array has none (O(n) total), a reversed one has n(n − 1)/2 (O(n²)).

That makes insertion sort the right tool for data that is *nearly* sorted, which is common. The shop runs a loyalty leaderboard: customers ranked by points, highest first. After each purchase, one customer's points go up and the board must be re-sorted. Everyone else is still in order.

leaderboard.js

```ts
import { bubbleSort } from "./bubble.js";
import { insertionSort } from "./insertion.js";
import { selectionSort } from "./selection.js";
import { newStats } from "./tools.js";

const byPointsDesc = (a, b) => b.points - a.points;

const board = Array.from({ length: 1000 }, (_, i) => ({ name: `customer ${i + 1}`, points: 50000 - i * 40 }));
board[700] = { ...board[700], points: board[700].points + 9000 };

for (const [name, sort] of Object.entries({ insertionSort, bubbleSort, selectionSort })) {
  const stats = newStats();
  const ranked = sort(board, byPointsDesc, stats);
  const rank = ranked.findIndex((c) => c.name === "customer 701") + 1;
  console.log(`${name.padEnd(13)} customer 701 is now #${rank}, ${stats.comparisons} comparisons`);
}
```

Output of `node leaderboard.js` and of the browser terminal

```ts
insertionSort customer 701 is now #477, 1223 comparisons
bubbleSort    customer 701 is now #477, 199575 comparisons
selectionSort customer 701 is now #477, 499500 comparisons
```

Customer 701 climbed from place 701 to place 477. Insertion sort paid one comparison per customer plus one per place climbed: 999 + 224 = 1,223. Selection sort paid its full half million. Bubble sort did badly too, for a reason worth remembering: a pass carries a *large* item many places towards the end, but moves an item towards the *front* only one place. Customer 701 needed 224 passes of about a thousand comparisons each. Real libraries use insertion sort for small or nearly sorted pieces for exactly this reason, as you will see with `Array.prototype.sort`.

Bubble, selection and insertion sort are all O(n²) on random data, because each comparison can fix at most one inversion, and a random array has about n²/4 of them. To do better, an algorithm must fix many inversions with one move. The next two sorts do that by dividing the problem.

## Merge sort

The shop has two branches, Lagos and Abuja. Each branch's till produces its orders in time order. Head office wants one list in time order. You do not need to sort anything: both lists are already sorted, so the earliest remaining order is always at the front of one of them. Compare the two fronts, take the earlier one, repeat. That is **merging**, and it takes one comparison per item: O(n) for two lists with n items in total.

REASON IT OUT

### Before you write merge

Think about the inputs before the code. What should happen when one list runs out before the other? What if one list is empty from the start? Two orders from different branches share the timestamp `10:15`: which one should come first, and does it matter? What does `merge` assume about its inputs, and what happens if that assumption is false?

**Show the reasoning**

- **One list runs out**: everything left in the other list is already in order and later than everything taken so far, so copy the rest across without comparing. The same rule covers an empty list: the loop never compares, and the whole other list is copied.
- **Equal timestamps**: either order is sorted, but only one choice is *predictable*. Take from the left list when the two are equal. Then items that compare equal keep their original relative order (everything from the left input before everything from the right). That property is called stability, and merge sort gets it from this one decision.
- **The assumption**: both inputs must already be sorted by the same comparator. `merge` does not check it. If one input is not sorted, the output is not sorted either, and nothing throws. That is worth a test.

merge.js

```ts
import { newStats } from "./tools.js";

export function merge(left, right, compare, stats = newStats()) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    stats.comparisons++;
    if (compare(right[j], left[i]) < 0) out.push(right[j++]);
    else out.push(left[i++]);
  }
  while (i < left.length) out.push(left[i++]);
  while (j < right.length) out.push(right[j++]);
  stats.writes += out.length;
  return out;
}

export function mergeSort(input, compare, stats = newStats()) {
  if (input.length <= 1) return [...input];
  const mid = Math.floor(input.length / 2);
  const left = mergeSort(input.slice(0, mid), compare, stats);
  const right = mergeSort(input.slice(mid), compare, stats);
  return merge(left, right, compare, stats);
}
```

`merge` takes from the right only when the right item is *strictly* earlier. On a tie it takes from the left. Here it is on the two branches' streams:

branches.js

```ts
import { merge } from "./merge.js";
import { newStats } from "./tools.js";

const lagos = [
  { time: "09:02", id: "L-101", naira: 12500 },
  { time: "10:15", id: "L-102", naira: 4800 },
  { time: "13:40", id: "L-103", naira: 99000 },
];
const abuja = [
  { time: "08:55", id: "A-201", naira: 3000 },
  { time: "10:15", id: "A-202", naira: 76000 },
  { time: "11:30", id: "A-203", naira: 15000 },
  { time: "16:05", id: "A-204", naira: 2200 },
];

const byTime = (a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0);
const stats = newStats();
for (const order of merge(lagos, abuja, byTime, stats)) console.log(order.time, order.id);
console.log(`${lagos.length + abuja.length} orders, ${stats.comparisons} comparisons`);
console.log("empty branch:", merge([], abuja, byTime).map((o) => o.id).join(" "));
```

Output of `node branches.js` and of the browser terminal

```ts
08:55 A-201
09:02 L-101
10:15 L-102
10:15 A-202
11:30 A-203
13:40 L-103
16:05 A-204
7 orders, 6 comparisons
empty branch: A-201 A-202 A-203 A-204
```

At `10:15` the Lagos order comes first because Lagos was the left input. Once Lagos ran out, the last Abuja order was copied without a comparison.

**Merge sort** turns merging into a full sort with recursion ([Recursion](https://zudojs.oyinlola.site/learn/js-recursion)): split the array in half, sort each half the same way, and merge the two sorted halves. The base case is a list of zero or one items, which is already sorted.

```json
[38 27 43 3 9 82 10]
[38 27 43]        [3 9 82 10]          split
[38] [27 43]      [3 9] [82 10]        split
[38] [27] [43]    [3] [9] [82] [10]    single items are sorted
[38] [27 43]      [3 9] [10 82]        merge
[27 38 43]        [3 9 10 82]          merge
[3 9 10 27 38 43 82]                   merge
```

Halving can only happen about log₂ n times before the pieces have one item, so there are about log₂ n levels. On each level, all the merges together touch every item once: O(n) per level. That gives O(n log n) in total, and it holds for every input, sorted, reversed or random. The price is memory: merging needs a new array, so merge sort uses O(n) extra space. [Divide and conquer](https://zudojs.oyinlola.site/learn/dsa-divide-conquer) takes this analysis further with recursion trees.

merge-demo.js

```ts
import { insertionSort } from "./insertion.js";
import { mergeSort } from "./merge.js";
import { ascending, newStats, randomInts } from "./tools.js";

for (const n of [1000, 10000, 100000]) {
  const data = randomInts(n, 1000000);
  const stats = newStats();
  const sorted = mergeSort(data, ascending, stats);
  const ok = sorted.every((v, i) => i === 0 || sorted[i - 1] <= v);
  console.log(`n=${n}: ${stats.comparisons} comparisons, n log2 n = ${Math.round(n * Math.log2(n))}, sorted ${ok}`);
}

const slow = newStats();
insertionSort(randomInts(10000, 1000000), ascending, slow);
console.log(`insertion sort, n=10000: ${slow.comparisons} comparisons`);
```

Output of `node merge-demo.js` and of the browser terminal

```ts
n=1000: 8688 comparisons, n log2 n = 9966, sorted true
n=10000: 120441 comparisons, n log2 n = 132877, sorted true
n=100000: 1536475 comparisons, n log2 n = 1660964, sorted true
insertion sort, n=10000: 24873964 comparisons
```

For 10,000 random items merge sort needs about 120,000 comparisons where insertion sort needs about 25 million. At 100,000 items the gap is 1.5 million against roughly 2.5 billion, which is the difference between an instant and a very long wait.

## Quick sort

Merge sort does the easy split first (just cut in half) and the real work afterwards (merging). **Quick sort** does the opposite: it does the real work while splitting, so that nothing is left to do afterwards. It picks one item, the **pivot**, and **partitions** the array: everything smaller than the pivot to its left, everything else to its right. The pivot is now in its final place. Then it quick-sorts the left part and the right part.

The partition below is called the Lomuto scheme. It keeps a boundary `store`: everything before `store` is smaller than the pivot. It walks through the range, and each time it finds a smaller item it swaps it to the boundary and moves the boundary on. Finally it puts the pivot at the boundary. It sorts in place, with no second array.

quick.js

```ts
import { newStats } from "./tools.js";

export function quickSort(input, compare, stats = newStats(), { pivot = "last", random = Math.random } = {}) {
  const a = [...input];
  const swap = (i, j) => {
    [a[i], a[j]] = [a[j], a[i]];
    stats.writes += 2;
  };
  stats.maxDepth = 0;

  function sort(lo, hi, depth) {
    if (lo >= hi) return;
    stats.maxDepth = Math.max(stats.maxDepth, depth);
    if (pivot === "random") swap(lo + Math.floor(random() * (hi - lo + 1)), hi);
    const p = a[hi];
    let store = lo;
    for (let i = lo; i < hi; i++) {
      stats.comparisons++;
      if (compare(a[i], p) < 0) swap(i, store++);
    }
    swap(store, hi);
    sort(lo, store - 1, depth + 1);
    sort(store + 1, hi, depth + 1);
  }

  sort(0, a.length - 1, 1);
  return a;
}
```

The `pivot` option chooses between the textbook choice (the last item of the range) and a random item. The random function can be passed in, so a test can make "random" repeatable. `maxDepth` records how deep the recursion went.

quick-demo.js

```ts
import { quickSort } from "./quick.js";
import { ascending, makeRandom, newStats, randomInts } from "./tools.js";

const n = 2000;
const inputs = {
  random: randomInts(n, 1000000),
  "already sorted": Array.from({ length: n }, (_, i) => i),
};

for (const [label, data] of Object.entries(inputs)) {
  for (const pivot of ["last", "random"]) {
    const stats = newStats();
    quickSort(data, ascending, stats, { pivot, random: makeRandom(42) });
    console.log(`${label.padEnd(14)} pivot=${pivot.padEnd(6)} ${String(stats.comparisons).padStart(7)} comparisons, depth ${stats.maxDepth}`);
  }
}
```

Output of `node quick-demo.js` and of the browser terminal

```ts
random         pivot=last     24686 comparisons, depth 22
random         pivot=random   26581 comparisons, depth 23
already sorted pivot=last   1999000 comparisons, depth 1999
already sorted pivot=random   25416 comparisons, depth 24
```

On random data quick sort is excellent: a little more than n log₂ n comparisons (2,000 × log₂ 2,000 is about 21,900), a recursion depth of a couple of dozen levels, and no extra array. On already sorted data with the last item as pivot, it collapses. The last item is the largest, so the partition puts everything on one side and nothing on the other; each level removes only one item. That is n levels, n²/2 comparisons: O(n²), as slow as bubble sort. The recursion is also 2,000 calls deep; with tens of thousands of sorted items it would overflow the call stack ([Recursion](https://zudojs.oyinlola.site/learn/js-recursion#overflow) shows that error).

Sorted input is not an exotic case. "Re-sort the orders, which are mostly sorted already" is one of the most common things a program does. A **random pivot** fixes it: no particular input is bad any more, only unlucky coin flips, and the chance of a bad run on a large array is vanishingly small. The expected cost is O(n log n) and the worst case O(n²) remains possible in theory.

### Failure case: many equal keys

The warehouse sorts 2,000 order lines by status, and there are only three statuses. A random pivot does not help here:

quick-duplicates.js

```ts
import { quickSort } from "./quick.js";
import { makeRandom, newStats } from "./tools.js";

const statuses = ["delivered", "paid", "shipped"];
const random = makeRandom(9);
const lines = Array.from({ length: 2000 }, () => statuses[Math.floor(random() * 3)]);

const byStatus = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const stats = newStats();
quickSort(lines, byStatus, stats, { pivot: "random", random: makeRandom(42) });
console.log(`${stats.comparisons} comparisons, depth ${stats.maxDepth}`);
```

Output of `node quick-duplicates.js` and of the browser terminal

```ts
672994 comparisons, depth 671
```

After the first few partitions, every range contains only one status. The partition puts every item that is *equal* to the pivot on the right side, so a range of about 670 equal items shrinks by one per level, just like sorted input. The fix is a **three-way partition**: split the range into smaller, equal and larger, and recurse only into smaller and larger. Items equal to the pivot are finished in one pass.

quick3.js

```ts
import { newStats } from "./tools.js";

export function quickSort3(input, compare, stats = newStats(), random = Math.random) {
  const a = [...input];
  const swap = (i, j) => {
    [a[i], a[j]] = [a[j], a[i]];
    stats.writes += 2;
  };

  function sort(lo, hi) {
    if (lo >= hi) return;
    const p = a[lo + Math.floor(random() * (hi - lo + 1))];
    let lt = lo;
    let i = lo;
    let gt = hi;
    while (i <= gt) {
      stats.comparisons++;
      const c = compare(a[i], p);
      if (c < 0) swap(lt++, i++);
      else if (c > 0) swap(i, gt--);
      else i++;
    }
    sort(lo, lt - 1);
    sort(gt + 1, hi);
  }

  sort(0, a.length - 1);
  return a;
}
```

While it runs, `a[lo..lt-1]` holds smaller items, `a[lt..i-1]` equal ones, `a[gt+1..hi]` larger ones, and `a[i..gt]` is still unexamined. A larger item is swapped to the end without advancing `i`, because the item that comes back from the end has not been examined yet.

quick3-demo.js

```ts
import { quickSort3 } from "./quick3.js";
import { makeRandom, newStats, randomInts } from "./tools.js";

const statuses = ["delivered", "paid", "shipped"];
const random = makeRandom(9);
const lines = Array.from({ length: 2000 }, () => statuses[Math.floor(random() * 3)]);
const byStatus = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const few = newStats();
const sorted = quickSort3(lines, byStatus, few, makeRandom(42));
console.log(`3 statuses: ${few.comparisons} comparisons, first ${sorted[0]}, last ${sorted.at(-1)}`);

const many = newStats();
quickSort3(randomInts(2000, 1000000), (a, b) => a - b, many, makeRandom(42));
console.log(`distinct numbers: ${many.comparisons} comparisons`);
```

Output of `node quick3-demo.js` and of the browser terminal

```ts
3 statuses: 3993 comparisons, first delivered, last shipped
distinct numbers: 26563 comparisons
```

From about 670,000 comparisons down to a few thousand: with three distinct keys, three-way quick sort does roughly one pass per distinct value. On data with no duplicates it costs about the same as the two-way version.

Quick sort is **not stable**: the long-distance swaps in the partition can move an item past an equal one. Its extra space is the recursion stack, O(log n) on average. It is fast in practice because it scans memory in order and swaps in place, which suits the processor's cache.

## All five side by side

Same inputs, same comparator, every algorithm. Four kinds of input: random numbers, already sorted, reversed, and "nearly sorted" (sorted with ten neighbouring pairs swapped, like the leaderboard).

compare-all.js

```ts
import { bubbleSort } from "./bubble.js";
import { insertionSort } from "./insertion.js";
import { mergeSort } from "./merge.js";
import { quickSort } from "./quick.js";
import { selectionSort } from "./selection.js";
import { ascending, makeRandom, newStats, randomInts } from "./tools.js";

const n = 2000;
const nearly = Array.from({ length: n }, (_, i) => i);
const random = makeRandom(5);
for (let k = 0; k < 10; k++) {
  const i = Math.floor(random() * (n - 1));
  [nearly[i], nearly[i + 1]] = [nearly[i + 1], nearly[i]];
}
const inputs = {
  random: randomInts(n, 1000000),
  sorted: Array.from({ length: n }, (_, i) => i),
  reversed: Array.from({ length: n }, (_, i) => n - i),
  nearly,
};

const sorts = {
  bubble: bubbleSort,
  selection: selectionSort,
  insertion: insertionSort,
  merge: mergeSort,
  "quick (random pivot)": (data, cmp, stats) => quickSort(data, cmp, stats, { pivot: "random", random: makeRandom(42) }),
};

console.log("".padEnd(21) + Object.keys(inputs).map((k) => k.padStart(10)).join(""));
for (const [name, sort] of Object.entries(sorts)) {
  const cells = Object.values(inputs).map((data) => {
    const stats = newStats();
    sort(data, ascending, stats);
    return String(stats.comparisons).padStart(10);
  });
  console.log(name.padEnd(21) + cells.join(""));
}
```

Output of `node compare-all.js` and of the browser terminal

```ts
                         random    sorted  reversed    nearly
bubble                  1997404      1999   1999000      3997
selection               1999000   1999000   1999000   1999000
insertion                988384      1999   1999000      2008
merge                     19388     10864     11088     10870
quick (random pivot)      26581     25416     25836     25595
```

Read the table by columns. On random data the two O(n log n) sorts need 19,000 to 27,000 comparisons and the three simple sorts one to two million. On sorted and nearly sorted data, bubble and insertion sort need only about n, and beat everything else. Merge sort is the only one that never has a bad column. Summarised:

| Algorithm | Best | Average | Worst | Extra space | Stable |
| --- | --- | --- | --- | --- | --- |
| Bubble (with early exit) | O(n) | O(n²) | O(n²) | O(1) | yes |
| Selection | O(n²) | O(n²) | O(n²) | O(1) | no |
| Insertion | O(n) | O(n²) | O(n²) | O(1) | yes |
| Merge | O(n log n) | O(n log n) | O(n log n) | O(n) | yes |
| Quick (random pivot, three-way) | O(n) | O(n log n) | O(n²), very unlikely | O(log n) stack | no |
| Heap sort ([Heaps](https://zudojs.oyinlola.site/learn/dsa-heaps#heap-sort)) | O(n log n) | O(n log n) | O(n log n) | O(1) | no |

### Why not faster than n log n?

Every algorithm here learns about the order only by asking the comparator "which of these two comes first?". An array of n distinct items can be arranged in n! (n factorial: n × (n − 1) × … × 1) ways, and the sort must end up distinguishing all of them. Each comparison has two answers, so it can at best halve the number of arrangements still possible. Getting from n! possibilities down to one therefore takes at least log₂(n!) comparisons in the worst case, and log₂(n!) grows like n log₂ n. No comparison sort, however clever, can beat O(n log n) in the worst case. Merge sort and heap sort are optimal in this sense.

Sorts that do not compare, like **counting sort**, can be faster when the keys are small whole numbers: to order 100,000 product reviews by star rating (1 to 5), count how many reviews have each rating and write them out group by group, in O(n + k) for k possible keys. That trick only works when you know the keys in advance.

## Stability: date first, then amount

Back to the finance report: orders by date, and within each date the largest amount first. A sort is **stable** if items that compare equal stay in the same order they had in the input. Stability lets you sort by several keys in steps: sort by the *secondary* key (amount, descending) first, then by the *primary* key (date) with a stable sort. Orders with the same date compare equal in the second sort, so they keep the amount order from the first. This is what happens when you click one column header in a spreadsheet and then another.

orders.js

```ts
export const orders = [
  { id: 1001, date: "2026-09-02", naira: 4800 },
  { id: 1002, date: "2026-09-01", naira: 99000 },
  { id: 1003, date: "2026-09-02", naira: 250000 },
  { id: 1004, date: "2026-09-01", naira: 1200 },
  { id: 1005, date: "2026-09-03", naira: 15000 },
  { id: 1006, date: "2026-09-02", naira: 76000 },
  { id: 1007, date: "2026-09-01", naira: 35000 },
];

export const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
export const byAmountDesc = (a, b) => b.naira - a.naira;

export function show(list) {
  return list.map((o) => `${o.date.slice(5)} #${o.id} ₦${o.naira}`).join("\n");
}
```

two-step.js

```ts
import { insertionSort } from "./insertion.js";
import { mergeSort } from "./merge.js";
import { byAmountDesc, byDate, orders, show } from "./orders.js";
import { selectionSort } from "./selection.js";

const byAmount = mergeSort(orders, byAmountDesc);

console.log("merge sort (stable):");
console.log(show(mergeSort(byAmount, byDate)));
console.log("insertion sort (stable) gives the same:", show(insertionSort(byAmount, byDate)) === show(mergeSort(byAmount, byDate)));
console.log("selection sort (not stable):");
console.log(show(selectionSort(byAmount, byDate)));
```

Output of `node two-step.js` and of the browser terminal

```ts
merge sort (stable):
09-01 #1002 ₦99000
09-01 #1007 ₦35000
09-01 #1004 ₦1200
09-02 #1003 ₦250000
09-02 #1006 ₦76000
09-02 #1001 ₦4800
09-03 #1005 ₦15000
insertion sort (stable) gives the same: true
selection sort (not stable):
09-01 #1002 ₦99000
09-01 #1007 ₦35000
09-01 #1004 ₦1200
09-02 #1003 ₦250000
09-02 #1001 ₦4800
09-02 #1006 ₦76000
09-03 #1005 ₦15000
```

With the stable sorts, each day's orders are still largest first. Selection sort gets the dates right, which is all its comparator asked for, but on 2 September it swapped ₦4,800 and ₦76,000: the long-distance swap moved order #1001 past #1006. Nothing failed; the report is simply wrong, and a finance clerk may not notice for weeks. The ISO date format `YYYY-MM-DD` is what makes `<` on the strings a correct date comparison: the most significant part comes first and every part has a fixed width.

### One comparator with two keys

Sorting twice works, but it relies on stability and on the reader knowing the trick. Usually it is clearer to say exactly what you mean in one comparator: compare by date, and only if the dates are equal, compare by amount. Because `0` is falsy, `||` expresses "if the first comparison is a tie, use the next one":

multi-key.js

```ts
import { byAmountDesc, byDate, orders, show } from "./orders.js";
import { selectionSort } from "./selection.js";

const byId = (a, b) => a.id - b.id;
const report = (a, b) => byDate(a, b) || byAmountDesc(a, b) || byId(a, b);

console.log(show(orders.toSorted(report)));
console.log("selection sort agrees:", show(selectionSort(orders, report)) === show(orders.toSorted(report)));
```

Output of `node multi-key.js` and of the browser terminal

```ts
09-01 #1002 ₦99000
09-01 #1007 ₦35000
09-01 #1004 ₦1200
09-02 #1003 ₦250000
09-02 #1006 ₦76000
09-02 #1001 ₦4800
09-03 #1005 ₦15000
selection sort agrees: true
```

With a comparator that never returns 0 for two different orders (the order id is unique, so it is the final tie-breaker), stability stops mattering: every algorithm, stable or not, must produce exactly this output. That is a good habit whenever the order will be shown to people, saved, or used to split results into pages.

## Array.prototype.sort in practice

You will rarely ship your own sort. JavaScript's `sort` and `toSorted` are fast and, since ES2019, **guaranteed stable**. V8 (the engine in Node.js and Chrome) uses TimSort, a hybrid of merge sort and insertion sort: it finds runs that are already in order, extends short runs with binary insertion sort, and merges the runs. That is why it is O(n) on sorted input and O(n log n) in the worst case, the best of both columns in your table. What remains your job is the comparator and knowing the method's behaviour.

builtin.js

```ts
let calls = 0;
const counted = (a, b) => (calls++, a - b);

const n = 10000;
const sortedAlready = Array.from({ length: n }, (_, i) => i);
sortedAlready.toSorted(counted);
console.log("sorted input, fewer than 2n comparisons:", calls < 2 * n);

calls = 0;
const shuffled = Array.from({ length: n }, (_, i) => (i * 7919) % n);
shuffled.toSorted(counted);
console.log("shuffled input, fewer than n log2 n comparisons:", calls < n * Math.log2(n));
console.log("shuffled input, fewer than n²/100 comparisons:", calls < (n * n) / 100);

const cart = [3500, undefined, 1200, undefined, 800];
console.log(cart.toSorted((a, b) => a - b));

const prices = [4500, 1200, 800];
const view = prices.toSorted((a, b) => a - b);
console.log(prices, view);
```

Output of `node builtin.js` and of the browser terminal

```ts
sorted input, fewer than 2n comparisons: true
shuffled input, fewer than n log2 n comparisons: true
shuffled input, fewer than n²/100 comparisons: true
[ 800, 1200, 3500, undefined, undefined ]
[ 4500, 1200, 800 ] [ 800, 1200, 4500 ]
```

- On sorted input TimSort needs only about n comparisons: it finds one run covering everything and has nothing to merge. On shuffled input it needs fewer than n log₂ n, far below the n² of the simple sorts. The example prints facts rather than exact counts, because the exact number of comparator calls differs between V8 versions (Node.js and Chrome can disagree by a few dozen), and a test should not depend on an engine's internals.
- `undefined` items are always moved to the end without calling your comparator. Holes in sparse arrays are too. Other odd values are not handled for you: a `NaN` amount makes `a - b` return `NaN`, which the sort treats like 0, and the result can be out of order around it. Validate the data before sorting it.
- `toSorted` leaves `prices` alone. Prefer it whenever the array came from somewhere else (a function argument, application state, a cached value). Use `sort` only on an array you just created yourself.

### A reusable multi-key comparator

Report screens often let the user choose the sort columns. Instead of writing a new comparator each time, build one from a list of keys:

by.js

```ts
function by(...keys) {
  return (a, b) => {
    for (const { key, desc = false } of keys) {
      const x = a[key];
      const y = b[key];
      const c = typeof x === "string" ? x.localeCompare(y) : x - y;
      if (c !== 0) return desc ? -c : c;
    }
    return 0;
  };
}

const customers = [
  { name: "Tunde", city: "Lagos", points: 5400 },
  { name: "adaeze", city: "Abuja", points: 5400 },
  { name: "Chioma", city: "Lagos", points: 9100 },
  { name: "Bola", city: "Abuja", points: 2300 },
];

for (const c of customers.toSorted(by({ key: "points", desc: true }, { key: "name" }))) {
  console.log(c.points, c.name);
}
console.log(customers.toSorted(by({ key: "city" }, { key: "points", desc: true })).map((c) => c.name).join(", "));
```

Output of `node by.js` and of the browser terminal

```ts
9100 Chioma
5400 adaeze
5400 Tunde
2300 Bola
adaeze, Bola, Chioma, Tunde
```

Tunde and adaeze tie on points, so the name decides, and `localeCompare` puts the lower-case "adaeze" first where plain `<` would have put her last. For sorting many strings, `new Intl.Collator("en").compare` is a faster comparator that gives the same ordering as `localeCompare`, because the language rules are prepared once instead of on every call.

## Testing a sort

A sort can be wrong in three ways: the output is not in order, the output is not the same items (something lost or duplicated), or equal items moved when they should not have. A handful of hand-picked cases catches the edge cases; a few hundred random arrays compared with a trusted reference (`toSorted`) catch the rest. Small value ranges create many duplicates, which is where sorting bugs hide.

sort-test.js

```ts
import { bubbleSort } from "./bubble.js";
import { insertionSort } from "./insertion.js";
import { mergeSort } from "./merge.js";
import { quickSort } from "./quick.js";
import { quickSort3 } from "./quick3.js";
import { selectionSort } from "./selection.js";
import { makeRandom } from "./tools.js";

const sorts = {
  bubbleSort, selectionSort, insertionSort, mergeSort, quickSort,
  quickSort3: (data, cmp, stats) => quickSort3(data, cmp, stats, makeRandom(7)),
};
const stable = new Set(["bubbleSort", "insertionSort", "mergeSort"]);

const edgeCases = [[], [1], [2, 1], [3, 3, 3], [5, -2, 0, -2, 9], [1, 2, 3, 4], [4, 3, 2, 1]];
const random = makeRandom(2026);
const randomCases = Array.from({ length: 300 }, () =>
  Array.from({ length: Math.floor(random() * 40) }, () => Math.floor(random() * 6)),
);

for (const [name, sort] of Object.entries(sorts)) {
  let failures = 0;
  for (const input of [...edgeCases, ...randomCases]) {
    const before = input.join();
    const got = sort(input, (a, b) => a - b);
    if (got.join() !== input.toSorted((a, b) => a - b).join()) failures++;
    if (input.join() !== before) failures++;

    const tagged = input.map((value, index) => ({ value, index }));
    const out = sort(tagged, (a, b) => a.value - b.value);
    const keptOrder = out.every((x, i) => i === 0 || out[i - 1].value < x.value || out[i - 1].index < x.index);
    if (stable.has(name) && !keptOrder) failures++;
  }
  console.log(`${failures === 0 ? "PASS" : "FAIL"} ${name}: ${edgeCases.length + randomCases.length} inputs, ${failures} failures`);
}
```

Output of `node sort-test.js` and of the browser terminal

```ts
PASS bubbleSort: 307 inputs, 0 failures
PASS selectionSort: 307 inputs, 0 failures
PASS insertionSort: 307 inputs, 0 failures
PASS mergeSort: 307 inputs, 0 failures
PASS quickSort: 307 inputs, 0 failures
PASS quickSort3: 307 inputs, 0 failures
```

Each input is checked three ways: against `toSorted` (order and contents together, since comparing the joined strings catches a lost or duplicated item), for mutation of the input, and, for the sorts that promise it, stability. The stability check tags every value with its original index; in a stable result, equal values must appear with increasing indexes. To see the test earn its keep, change `< 0` to `<= 0` in `merge` (take from the right on ties): the output is still sorted, and only the stability check fails.

## Sorting in production

- **Sort in the database when the data lives there.** `ORDER BY created_at DESC, id DESC` with an index on those columns returns rows already in order, and the database can stop after the first page instead of sorting everything. Loading 100,000 rows into Node to sort them and show 20 wastes memory and time. [SQL with PostgreSQL](https://zudojs.oyinlola.site/learn/sql-basics) covers `ORDER BY`.
- **Pages need a total order.** If page 1 is "the first 20 orders by date" and many orders share a date, the database may break the ties differently on the next request, so an order appears on two pages or on none. Always end the sort with a unique key such as the id, exactly like the `report` comparator above.
- **Money and dates.** Compare amounts as integers (kobo, not floating-point naira) and dates as timestamps or ISO strings with the same time zone. Sorting `"9/2/2026"`-style strings orders them by day or month digit, not by date.
- **Do not sort in a loop.** Sorting a list on every request, or re-sorting after every insert, turns an O(n log n) job into O(n² log n). Keep the data sorted as it changes (insertion, a heap, or a database index), or sort once and cache the result.
- **You only need the top 10?** Do not sort a million items to keep ten. A size-k heap gives the top k in O(n log k) ([Heaps](https://zudojs.oyinlola.site/learn/dsa-heaps#top-k)), and [Divide and conquer](https://zudojs.oyinlola.site/learn/dsa-divide-conquer) shows quickselect, which finds the k-th item in O(n) on average.
- **Comparators run a lot.** Sorting 100,000 items calls the comparator about 1.7 million times. Keep it cheap: no parsing dates, no database calls, no `toLowerCase` on every call. Compute a sort key once per item, sort by the key, and map back.
- **Beware user-controlled sort fields.** A `?sort=` parameter must be checked against a list of allowed columns before it reaches a comparator or an SQL `ORDER BY`; SQL cannot take a column name as a bound parameter, so an unchecked one is an injection risk.

## Practice

TRY IT YOURSELF

### A fair leaderboard

Rank these players for a weekly quiz: most points first; on equal points, whoever finished faster (fewer seconds) first; if that is also equal, by name A to Z. Print the ranking with positions. Use one comparator and `toSorted`.

**Show a solution**

quiz-board.js

```ts
const players = [
  { name: "Kemi", points: 80, seconds: 410 },
  { name: "Ifeanyi", points: 95, seconds: 530 },
  { name: "Amaka", points: 80, seconds: 390 },
  { name: "Musa", points: 95, seconds: 530 },
  { name: "Dayo", points: 60, seconds: 300 },
];

const ranking = (a, b) => b.points - a.points || a.seconds - b.seconds || a.name.localeCompare(b.name);

players.toSorted(ranking).forEach((p, i) => console.log(`${i + 1}. ${p.name} ${p.points} pts ${p.seconds}s`));
```

Output of `node quiz-board.js` and of the browser terminal

```ts
1. Ifeanyi 95 pts 530s
2. Musa 95 pts 530s
3. Amaka 80 pts 390s
4. Kemi 80 pts 410s
5. Dayo 60 pts 300s
```

Each key is one comparison chained with `||`, in order of importance. Points are descending (`b - a`), time ascending (`a - b`). Ifeanyi and Musa tie on both numbers, so the name decides. Because the final key (the name) is unique here, the result does not depend on the sort being stable.

TRY IT YOURSELF

### Merge two branches without duplicates

The Lagos and Abuja reports are both sorted by order id, but some orders were reported by both branches (a customer paid in one and collected in the other). Write `mergeUnique(a, b)` that merges two lists of ids sorted in ascending order into one sorted list with no duplicates, in O(n) time, and print how many comparisons it made.

**Show a solution**

merge-unique.js

```ts
function mergeUnique(a, b) {
  const out = [];
  let i = 0;
  let j = 0;
  let comparisons = 0;
  const add = (id) => {
    if (out.at(-1) !== id) out.push(id);
  };
  while (i < a.length && j < b.length) {
    comparisons++;
    if (a[i] < b[j]) add(a[i++]);
    else if (b[j] < a[i]) add(b[j++]);
    else {
      add(a[i++]);
      j++;
    }
  }
  while (i < a.length) add(a[i++]);
  while (j < b.length) add(b[j++]);
  return { out, comparisons };
}

const lagos = [1001, 1003, 1004, 1008, 1010];
const abuja = [1002, 1003, 1008, 1009, 1011, 1012];
const { out, comparisons } = mergeUnique(lagos, abuja);
console.log(out.join(" "));
console.log(`${lagos.length + abuja.length} ids in, ${out.length} out, ${comparisons} comparisons`);
console.log(mergeUnique([], [5, 5, 6]).out.join(" "));
```

Output of `node merge-unique.js` and of the browser terminal

```ts
1001 1002 1003 1004 1008 1009 1010 1011 1012
11 ids in, 9 out, 7 comparisons
5 6
```

It is the merge step with a third case for equal ids, where both pointers advance but only one copy is written. The `add` helper also drops duplicates *within* one list, which the last line tests. Every step moves at least one pointer forward, so the loop runs at most n + m times: O(n + m).

TRY IT YOURSELF

### Median-of-three pivot

Instead of a random pivot, many libraries use the **median of three**: look at the first, middle and last items of the range and use the middle value of those three as the pivot. Add a `pivot: "median3"` option to a copy of the Lomuto quick sort and compare its comparisons with the last-item pivot on 2,000 already sorted and 2,000 reversed items.

**Show a solution**

median3.js

```ts
function quickSort(input, compare, pivot) {
  const a = [...input];
  let comparisons = 0;
  const swap = (i, j) => ([a[i], a[j]] = [a[j], a[i]]);

  function medianIndex(lo, hi) {
    const mid = Math.floor((lo + hi) / 2);
    const trio = [lo, mid, hi].sort((x, y) => compare(a[x], a[y]));
    return trio[1];
  }

  function sort(lo, hi) {
    if (lo >= hi) return;
    if (pivot === "median3") swap(medianIndex(lo, hi), hi);
    const p = a[hi];
    let store = lo;
    for (let i = lo; i < hi; i++) {
      comparisons++;
      if (compare(a[i], p) < 0) swap(i, store++);
    }
    swap(store, hi);
    sort(lo, store - 1);
    sort(store + 1, hi);
  }

  sort(0, a.length - 1);
  return { a, comparisons };
}

const n = 2000;
const inputs = {
  sorted: Array.from({ length: n }, (_, i) => i),
  reversed: Array.from({ length: n }, (_, i) => n - i),
};
for (const [label, data] of Object.entries(inputs)) {
  for (const pivot of ["last", "median3"]) {
    const { a, comparisons } = quickSort(data, (x, y) => x - y, pivot);
    const ok = a.every((v, i) => i === 0 || a[i - 1] <= v);
    console.log(`${label.padEnd(8)} ${pivot.padEnd(7)} ${comparisons} comparisons, sorted ${ok}`);
  }
}
```

Output of `node median3.js` and of the browser terminal

```ts
sorted   last    1999000 comparisons, sorted true
sorted   median3 17964 comparisons, sorted true
reversed last    1999000 comparisons, sorted true
reversed median3 33670 comparisons, sorted true
```

On sorted data the middle item is the true median, so every partition splits evenly and the cost falls from n²/2 to below n log₂ n. Reversed data costs a little more, because after the first partition the pieces are no longer perfectly ordered, but it stays far from quadratic. The comparisons made while picking the pivot are not counted here; they add three per partition. Median-of-three is deterministic, so a determined attacker who knows your code can still build an input that makes it quadratic ("median-of-three killer" sequences exist). That is why production sorts either randomise, fall back to heap sort when the recursion gets too deep (introsort), or avoid quick sort entirely, as V8's TimSort does.

## Summary

- A comparator returns negative, zero or positive, and must be consistent. `a - b` for numbers, `localeCompare` or `Intl.Collator` for text. Without one, `sort` compares as strings. A comparator that returns booleans silently breaks the sort.
- Bubble, selection and insertion sort are O(n²) on random data. Insertion sort is O(n) on nearly sorted data and does one shift per inversion; selection sort always does n²/2 comparisons but very few writes.
- Merge sort splits in half, sorts both halves and merges them: O(n log n) always, O(n) extra space, stable because merge takes from the left on ties.
- Quick sort partitions around a pivot: O(n log n) on average and in place, but O(n²) with a fixed pivot on sorted data, and on many equal keys unless it uses a three-way partition. It is not stable.
- No comparison sort beats O(n log n) in the worst case. Count comparisons, not milliseconds, to compare algorithms.
- A stable sort keeps equal items in their input order. Either sort by the secondary key and then stably by the primary, or better, write one comparator with all keys and a unique tie-breaker.
- `Array.prototype.sort` is stable TimSort, sorts in place and returns the same array; `toSorted` returns a copy. `undefined` goes last; `NaN` breaks the order. Test sorts against `toSorted` on many small random arrays with duplicates, and check stability with tagged items.

Next: [Divide and conquer](https://zudojs.oyinlola.site/learn/dsa-divide-conquer) takes the idea behind merge sort and quick sort, split the problem, solve the parts, combine, and uses it for quickselect, fast exponentiation and the recursion trees that tell you what a recursive algorithm costs.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
