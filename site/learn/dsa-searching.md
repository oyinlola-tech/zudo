---
title: "Linear and binary search — ZudoJS Academy"
description: "Find an order among a million by scanning and by halving, write binary search three ways, catch its classic bugs, and use lower and upper bounds for ranges."
source: https://zudojs.oyinlola.site/learn/dsa-searching
---

LEVEL 3 · LESSON 10 OF 21

Algorithms Core

# Linear and binary search

Find an order among a million by scanning and by halving, write binary search three ways, catch its classic bugs, and use lower and upper bounds for ranges.

- **50 min** to read and try
- **You need:** Complexity, Arrays and strings, and Recursion
- **You build:** A tested search toolkit: linear search, iterative and recursive binary search, lower and upper bound, and range queries over sorted orders

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Choose linear search or binary search from the data and the number of searches, and justify the cost
- Write binary search iteratively and recursively with a clear loop invariant
- Recognise and fix the classic binary search bugs
- Use lower and upper bound to find first and last occurrences, counts, insertion points and ranges
- Test a search against a linear reference on edge cases and random sorted data

## The problem: find order 734,512

A customer calls about order 734,512. The support tool has the day's export: a million orders in an array, one object per order. The orders were written as they were created, and order ids only ever go up, so the array is already **sorted by id**. How does the tool find the order?

The simplest way is to look at every order in turn until the id matches. That is **linear search**. Here it is, counting how many orders it looks at:

orders.js

```ts
export const orders = Array.from({ length: 1_000_000 }, (_, i) => ({
  id: 100_000 + i * 3,
  totalKobo: 50_000 + ((i * 7919) % 900_000),
  placedAt: new Date(Date.UTC(2026, 8, 1) + i * 2_000).toISOString(),
}));
```

linear.js

```ts
import { orders } from "./orders.js";

function linearSearch(items, id) {
  let looked = 0;
  for (let i = 0; i < items.length; i++) {
    looked++;
    if (items[i].id === id) return { index: i, looked };
  }
  return { index: -1, looked };
}

console.log("orders:", orders.length, "first id:", orders[0].id, "last id:", orders.at(-1).id);
for (const id of [100_000, 1_600_000, 734_512, 2_500_000, 734_513]) {
  const { index, looked } = linearSearch(orders, id);
  console.log(`id ${id}: index ${index}, looked at ${looked} orders`);
}
```

Output of `node linear.js` and of the browser terminal

```ts
orders: 1000000 first id: 100000 last id: 3099997
id 100000: index 0, looked at 1 orders
id 1600000: index 500000, looked at 500001 orders
id 734512: index 211504, looked at 211505 orders
id 2500000: index 800000, looked at 800001 orders
id 734513: index -1, looked at 1000000 orders
```

Ids go up by 3 in this export (other ids belong to other shops), so 734,513 does not exist. Linear search is quick when the order is near the front, and it looks at all million orders when the order is at the end or *missing*, which is exactly when a customer is most upset. It is O(n): on average about n/2 looks for a present id, and always n for a missing one.

But this search ignores the most useful fact about the data: it is sorted. **Binary search** uses that fact to find any order, or prove it is missing, in about 20 looks. This lesson builds both, shows the bugs that make binary search famous for being hard to get right, and then generalises it into lower and upper bounds, which answer range questions such as "all orders placed on the 3rd".

## Linear search, done properly

Linear search is not a beginner's mistake. It is the right tool when:

- the data is **not sorted** by what you search for (searching orders by customer name when they are sorted by id),
- the array is **small** (a few dozen items: the loop is faster than anything cleverer),
- you search **once**: sorting first costs O(n log n), more than the O(n) scan,
- the condition is not an equality: "the first order over ₦100,000", "the last failed payment".

JavaScript's arrays have linear search built in. All of these are O(n), and all stop at the first match:

built-ins.js

```ts
const payments = [
  { ref: "PAY-1", status: "paid", kobo: 1_250_000 },
  { ref: "PAY-2", status: "failed", kobo: 480_000 },
  { ref: "PAY-3", status: "paid", kobo: 12_500_000 },
  { ref: "PAY-4", status: "failed", kobo: 90_000 },
];

console.log(payments.find((p) => p.kobo > 10_000_000)?.ref);
console.log(payments.findIndex((p) => p.status === "failed"));
console.log(payments.findLast((p) => p.status === "failed")?.ref);
console.log(payments.some((p) => p.kobo < 0));
console.log(payments.find((p) => p.ref === "PAY-9"));

const scores = [3, NaN, 7];
console.log(scores.indexOf(NaN), scores.includes(NaN));
```

Output of `node built-ins.js` and of the browser terminal

```ts
PAY-3
1
PAY-4
false
undefined
-1 true
```

- `find` returns the item (or `undefined`); `findIndex` returns its index (or −1). `findLast` and `findLastIndex` search from the end, which is what you want for "most recent".
- `some` answers "is there any?" and stops at the first yes.
- `indexOf` and `includes` compare with a value instead of a function. They differ on `NaN`: `indexOf` uses `===`, and `NaN === NaN` is false, so it never finds `NaN`; `includes` uses a comparison that treats `NaN` as equal to itself.
- Returning −1 or `undefined` for "not found" is a convention the caller must check. Forgetting to check is the most common linear-search bug: `payments[-1]` is `undefined`, and the error appears far from its cause.

## Binary search

You already know binary search from the guessing game: "a number from 1 to 100", "50?", "lower", "25?", "higher"… Each answer throws away half of the remaining numbers, so 7 guesses always suffice, because 27 = 128 ≥ 100.

On a sorted array: look at the middle item. If it is the one, done. If it is smaller than the target, the target can only be to the right, so throw away the left half; if it is larger, throw away the right half. Repeat on what remains. After *k* steps at most n / 2k items remain, so after about log₂ n steps there is nothing left: **O(log n)**. For a million orders, log₂ 1,000,000 ≈ 20.

REASON IT OUT

### Before writing binary search

Binary search is short, and famously easy to get wrong. Before you write it, answer these. What must be true about the array, and what happens if it is not? What should the function return when the id is missing, and what can the caller do with that? The array can be empty, or have one item; the id can be smaller than every id, or larger. If the same value appears several times, which one do you get? And the support tool reads the id from a text box: what if it arrives as the string `"734512"`?

**Show the reasoning**

- **Sorted, by the same key and the same comparison you search with.** Binary search on unsorted data does not crash; it silently returns wrong answers, usually "not found" for items that exist. That is the most dangerous kind of bug, so check the precondition in tests (and in development builds, if the data comes from outside).
- **Missing**: return −1, like `indexOf`. (A lower-bound search, later in the lesson, returns something more useful: where the item *would* go.)
- **Empty array, one item, target below the smallest or above the largest**: the loop must handle all of these without special cases, and they are the first things to test. Most binary-search bugs show up at exactly these edges.
- **Duplicates**: plain binary search returns *some* matching index, not necessarily the first. If you need the first or the last, you need lower or upper bound.
- **The string `"734512"`**: compared with numbers, `<` converts the string, but `===` does not, so the loop narrows to the right place and then reports "not found". Convert and validate input at the edge (`Number(text)`, check `Number.isInteger`), before it reaches the search.

### The iterative version

binary.js

```ts
export function binarySearch(items, id, stats = { looked: 0 }) {
  let lo = 0;
  let hi = items.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    stats.looked++;
    const current = items[mid].id;
    if (current === id) return mid;
    if (current < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}
```

The key to getting it right is the **loop invariant**: a statement that is true before every iteration. Here it is: *if the id is in the array at all, it is at an index between `lo` and `hi`, inclusive.*

- At the start, `lo = 0` and `hi = length − 1` cover the whole array, so it is true.
- If `items[mid].id` is smaller than the target, then so is everything at or before `mid` (the array is sorted), so the target can only be at `mid + 1` or later: `lo = mid + 1` keeps the invariant. The `hi = mid − 1` case is the mirror.
- The range `lo..hi` shrinks by at least one every time (`mid` itself is excluded), so the loop ends. When `lo > hi` the range is empty, and by the invariant the id is not in the array.

Every line of the function follows from that one sentence. When you write a binary search, write the invariant first.

binary-orders.js

```ts
import { orders } from "./orders.js";
import { binarySearch } from "./binary.js";

for (const id of [100_000, 1_600_000, 734_512, 2_500_000, 734_513, 99, 9_999_999]) {
  const stats = { looked: 0 };
  const index = binarySearch(orders, id, stats);
  console.log(`id ${id}: index ${index}, looked at ${stats.looked} orders`);
}
console.log("log2 of 1,000,000 =", Math.log2(1_000_000).toFixed(2));
console.log("empty array:", binarySearch([], 5));
```

Output of `node binary-orders.js` and of the browser terminal

```ts
id 100000: index 0, looked at 19 orders
id 1600000: index 500000, looked at 19 orders
id 734512: index 211504, looked at 20 orders
id 2500000: index 800000, looked at 20 orders
id 734513: index -1, looked at 20 orders
id 99: index -1, looked at 19 orders
id 9999999: index -1, looked at 20 orders
log2 of 1,000,000 = 19.93
empty array: -1
```

Never more than 20 looks, whether the order is first, last, in the middle, or missing, against up to a million for linear search. Double the orders and binary search needs one more look.

To see the range shrink, here is a trace on a small array of order ids:

trace.js

```ts
const ids = [1004, 1011, 1015, 1020, 1032, 1047, 1051, 1066, 1070, 1089];

function traceSearch(items, target) {
  let lo = 0;
  let hi = items.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const verdict = items[mid] === target ? "found" : items[mid] < target ? "go right" : "go left";
    console.log(`  lo=${lo} hi=${hi} mid=${mid} items[mid]=${items[mid]} -> ${verdict}`);
    if (items[mid] === target) return mid;
    if (items[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  console.log(`  lo=${lo} hi=${hi}: empty range`);
  return -1;
}

console.log("search 1066:", traceSearch(ids, 1066));
console.log("search 1016:", traceSearch(ids, 1016));
```

Output of `node trace.js` and of the browser terminal

```ts
  lo=0 hi=9 mid=4 items[mid]=1032 -> go right
  lo=5 hi=9 mid=7 items[mid]=1066 -> found
search 1066: 7
  lo=0 hi=9 mid=4 items[mid]=1032 -> go left
  lo=0 hi=3 mid=1 items[mid]=1011 -> go right
  lo=2 hi=3 mid=2 items[mid]=1015 -> go right
  lo=3 hi=3 mid=3 items[mid]=1020 -> go left
  lo=3 hi=2: empty range
search 1016: -1
```

When 1016 is not found, the search stops with `lo = 3`, which is exactly where 1016 would have to be inserted to keep the array sorted. Remember that; it becomes lower bound.

### The recursive version

Binary search is a natural fit for recursion (from [Recursion](https://zudojs.oyinlola.site/learn/js-recursion)): searching the whole array means searching one half of it, which is the same problem, smaller. The base case is the empty range.

recursive.js

```ts
import { orders } from "./orders.js";

function binarySearchRecursive(items, id, lo = 0, hi = items.length - 1, depth = 1) {
  if (lo > hi) return { index: -1, depth };
  const mid = Math.floor((lo + hi) / 2);
  if (items[mid].id === id) return { index: mid, depth };
  if (items[mid].id < id) return binarySearchRecursive(items, id, mid + 1, hi, depth + 1);
  return binarySearchRecursive(items, id, lo, mid - 1, depth + 1);
}

console.log(binarySearchRecursive(orders, 734_512));
console.log(binarySearchRecursive(orders, 734_513));
```

Output of `node recursive.js` and of the browser terminal

```json
{ index: 211504, depth: 20 }
{ index: -1, depth: 21 }
```

It does the same comparisons and is O(log n) in time. It also uses O(log n) stack frames, one per halving, which is harmless (21 frames for a million items, a few dozen for any array that fits in memory), unlike the O(n) recursion that crashed on deep trees. JavaScript engines do not remove those frames even though each call is the last thing its caller does, so the iterative loop is the usual choice in production code; the recursive one is often easier to reason about.

## The classic bugs

A famous study found that most professional programmers, given time to write a binary search, produced one with a bug; a bug in the binary search of Java's standard library went unnoticed for nine years. The bugs are always at the edges. Here they are, each with its symptom.

### Bug 1: `while (lo < hi)` with an inclusive range

bug-condition.js

```ts
function buggy(items, target) {
  let lo = 0;
  let hi = items.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (items[mid] === target) return mid;
    if (items[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

const ids = [1004, 1011, 1015, 1020];
console.log(ids.map((id) => buggy(ids, id)).join(" "));
console.log(buggy([1004], 1004));
```

Output of `node bug-condition.js` and of the browser terminal

```ts
-1 1 2 -1
-1
```

With `lo` and `hi` both inclusive, a range with one item has `lo === hi`, and `lo < hi` refuses to look at it. Some items are "missing", and a one-item array never finds anything. The condition must match the meaning of `hi`: inclusive `hi` needs `lo <= hi`.

### Bug 2: `lo = mid` instead of `lo = mid + 1`

bug-infinite.js

```ts
function buggy(items, target) {
  let lo = 0;
  let hi = items.length - 1;
  let steps = 0;
  while (lo <= hi) {
    if (++steps > 50) return `gave up after 50 steps, stuck at lo=${lo} hi=${hi}`;
    const mid = Math.floor((lo + hi) / 2);
    if (items[mid] === target) return mid;
    if (items[mid] < target) lo = mid;
    else hi = mid - 1;
  }
  return -1;
}

const ids = [1004, 1011, 1015, 1020];
console.log(buggy(ids, 1011));
console.log(buggy(ids, 1030));
```

Output of `node bug-infinite.js` and of the browser terminal

```ts
1
gave up after 50 steps, stuck at lo=2 hi=3
```

When `lo` and `hi` are neighbours, `mid` rounds down to `lo`, so `lo = mid` changes nothing and the loop never ends. Without the step guard, the support tool would hang, and a server would burn a CPU core per request. It only happens for some targets, so a quick test can miss it. The rule: every branch must shrink the range, which is why `mid` itself is always excluded (`mid + 1`, `mid − 1`).

### Bug 3: a middle that is not a whole number

bug-mid.js

```ts
const ids = [1004, 1011, 1015, 1020];
const lo = 0;
const hi = 3;

console.log((lo + hi) / 2, ids[(lo + hi) / 2]);
console.log(Math.floor((lo + hi) / 2), ids[Math.floor((lo + hi) / 2)]);
console.log((3_000_000_000 + 3_000_000_002) >> 1, Math.floor((3_000_000_000 + 3_000_000_002) / 2));
```

Output of `node bug-mid.js` and of the browser terminal

```ts
1.5 undefined
1 1011
852516353 3000000001
```

`ids[1.5]` is `undefined`, and every comparison with `undefined` is false, so the search wanders off. Use `Math.floor`. The shift trick `(lo + hi) >> 1` is popular because it is short, but bitwise operators convert to 32-bit integers, which breaks for indexes above about 2.1 billion: rare for arrays, common when you binary-search over *numbers* such as file offsets or timestamps. (Java's nine-year bug was the related overflow of `lo + hi`, which JavaScript's numbers avoid up to 253.)

### Bug 4: data sorted differently from how you search

bug-sort.js

```ts
function binarySearch(items, target) {
  let lo = 0;
  let hi = items.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (items[mid] === target) return mid;
    if (items[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

const prices = [9500, 12000, 150000, 800, 45000];
const wrong = [...prices].sort();
const right = [...prices].sort((a, b) => a - b);

console.log("default sort:", wrong.join(" "), "-> find 9500:", binarySearch(wrong, 9500));
console.log("numeric sort:", right.join(" "), "-> find 9500:", binarySearch(right, 9500));
console.log("text id:", binarySearch(right, "12000"));
```

Output of `node bug-sort.js` and of the browser terminal

```ts
default sort: 12000 150000 45000 800 9500 -> find 9500: -1
numeric sort: 800 9500 12000 45000 150000 -> find 9500: 1
text id: -1
```

`sort()` without a comparator sorts numbers as *text*, where "12000" comes before "150000" and "9500" comes last. The array is sorted, just not the way `<` compares numbers, so the search for 9500 goes left at 45000 and misses. (It would still find 12000, by luck, which is why a single passing test proves little.) The same happens when names are sorted with `localeCompare` but searched with `<`, or sorted case-sensitively and searched case-insensitively. Sort and search must use **the same comparison**. The last line is the string id from the reasoning box: found by nobody.

| Bug | Symptom | Fix |
| --- | --- | --- |
| `lo < hi` with inclusive `hi` | Some items reported missing; one-item arrays never match | Match the loop condition to the range: `lo <= hi` |
| `lo = mid` or `hi = mid` with inclusive bounds | Infinite loop for some targets | Exclude `mid`: `mid + 1`, `mid − 1` |
| `(lo + hi) / 2` | `items[1.5]` is `undefined`, wrong answers | `Math.floor` |
| `(lo + hi) >> 1` on huge ranges | Negative or wrong middle beyond 2³¹ | `Math.floor((lo + hi) / 2)` |
| Sort and search disagree | Existing items not found | One comparison function for both; numeric comparator |
| Unsorted input | Silent wrong answers | Check the precondition in tests; sort or use linear search |

## Lower and upper bound

Plain binary search answers "is this exact value here?". Real questions are often different:

- "Show every order placed on 3 September." The orders are sorted by time; you need the first order at or after 3 September 00:00 and the first order at or after 4 September.
- "Where does this new order go so the list stays sorted?"
- "Five products cost exactly ₦12,000; list them all." You need the first and the last, not "one of them".

Two functions answer all of these:

- **Lower bound**: the first index whose value is *greater than or equal to* the target. If the target is present, that is its first occurrence; if not, it is where the target would be inserted.
- **Upper bound**: the first index whose value is *strictly greater than* the target. Everything before it is ≤ the target.

Both can return `items.length`, meaning "past the end". The number of items equal to the target is `upper − lower`, and the items in a range `[a, b]` are those from `lowerBound(a)` up to, but not including, `upperBound(b)`.

These are written with a **half-open range**: `lo` is included and `hi` is not (`hi` starts at `items.length`). The invariant: *everything before `lo` is smaller than the target, and everything from `hi` on is greater than or equal to it.* When `lo === hi`, that index is the answer. The two loops differ in a single character:

bounds.js

```ts
export function lowerBound(items, target, key = (x) => x) {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (key(items[mid]) < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function upperBound(items, target, key = (x) => x) {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (key(items[mid]) <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
```

Compare them with bug 1 and bug 2: here `lo < hi` and `hi = mid` are *correct*, because `hi` is exclusive. Neither style is right or wrong on its own; mixing them is the bug. The `key` function lets the same code search objects by one field.

bounds-demo.js

```ts
import { lowerBound, upperBound } from "./bounds.js";

const prices = [800, 9500, 12000, 12000, 12000, 45000, 150000];

for (const target of [12000, 10000, 800, 200000, 100]) {
  const lower = lowerBound(prices, target);
  const upper = upperBound(prices, target);
  console.log(`${String(target).padStart(6)}: lower ${lower}, upper ${upper}, count ${upper - lower}`);
}

const insertAt = lowerBound(prices, 10000);
prices.splice(insertAt, 0, 10000);
console.log("after inserting 10000:", prices.join(" "));
```

Output of `node bounds-demo.js` and of the browser terminal

```ts
 12000: lower 2, upper 5, count 3
 10000: lower 2, upper 2, count 0
   800: lower 0, upper 1, count 1
200000: lower 7, upper 7, count 0
   100: lower 0, upper 0, count 0
after inserting 10000: 800 9500 10000 12000 12000 12000 45000 150000
```

Finding the insertion point is O(log n), but `splice` still shifts every later element: inserting into a sorted array is O(n). That is the trade-off that made binary search trees worth building in [Trees](https://zudojs.oyinlola.site/learn/dsa-trees#bst).

### Range queries: orders on one day

The orders are sorted by id and, since ids grow over time, also by `placedAt`. ISO date strings like `2026-09-03T00:00:00.000Z` have fixed widths and sort correctly as text, so they can be compared with `<` directly.

range.js

```ts
import { orders } from "./orders.js";
import { lowerBound } from "./bounds.js";

let comparisons = 0;
const placedAt = (order) => {
  comparisons++;
  return order.placedAt;
};

const start = lowerBound(orders, "2026-09-03T00:00:00.000Z", placedAt);
const end = lowerBound(orders, "2026-09-04T00:00:00.000Z", placedAt);
const day = orders.slice(start, end);

console.log(`orders on 3 September: ${day.length}`);
console.log(`first: #${day[0].id} at ${day[0].placedAt}`);
console.log(`last:  #${day.at(-1).id} at ${day.at(-1).placedAt}`);
console.log(`comparisons: ${comparisons} (a scan would make ${orders.length})`);
console.log("check:", day.every((o) => o.placedAt.startsWith("2026-09-03")),
  orders[start - 1].placedAt < "2026-09-03", orders[end].placedAt >= "2026-09-04");
```

Output of `node range.js` and of the browser terminal

```ts
orders on 3 September: 43200
first: #359200 at 2026-09-03T00:00:00.000Z
last:  #488797 at 2026-09-03T23:59:58.000Z
comparisons: 40 (a scan would make 1000000)
check: true true true
```

Two lower-bound searches, 40 comparisons, however many orders the export holds. Using `lowerBound` of the next day for the end avoids having to invent a "last possible time on the 3rd". The final line checks the answer from the outside: everything inside is on the 3rd, and the neighbours just outside are not.

### Prefix search on sorted names

All names that start with a prefix sit next to each other in a sorted list, starting at the lower bound of the prefix. That is the compact alternative to the trie from [Tries](https://zudojs.oyinlola.site/learn/dsa-tries):

prefix.js

```ts
import { lowerBound } from "./bounds.js";

const names = ["oppo reno", "oraimo freepods", "oraimo powerbank", "oraimo smartwatch", "sharp tv", "sony radio"]
  .sort();

function withPrefix(sorted, prefix, limit = 5) {
  const results = [];
  for (let i = lowerBound(sorted, prefix); i < sorted.length && results.length < limit; i++) {
    if (!sorted[i].startsWith(prefix)) break;
    results.push(sorted[i]);
  }
  return results;
}

console.log(withPrefix(names, "ora").join(" | "));
console.log(withPrefix(names, "s").join(" | "));
console.log(withPrefix(names, "x").length);
```

Output of `node prefix.js` and of the browser terminal

```ts
oraimo freepods | oraimo powerbank | oraimo smartwatch
sharp tv | sony radio
0
```

O(L log n) to find the start, then O(k) to read k results, with no memory beyond the sorted array. The names are sorted with the default `sort()`, which compares by UTF-16 code units, the same way `<` does, so sort and search agree (bug 4).

## Sort once, search many times?

Binary search needs sorted data, and sorting costs O(n log n). If the data is not already sorted, is it worth it? Count comparisons for *k* searches in n = 100,000 unsorted order totals:

break-even.js

```ts
const n = 100_000;
const totals = Array.from({ length: n }, (_, i) => (i * 7919) % 1_000_003);

let linear = 0;
function linearFind(items, target) {
  for (let i = 0; i < items.length; i++) {
    linear++;
    if (items[i] === target) return i;
  }
  return -1;
}

let binary = 0;
function binaryFind(items, target) {
  let lo = 0;
  let hi = items.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    binary++;
    if (items[mid] === target) return mid;
    if (items[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

const sortCost = Math.round(n * Math.log2(n));
const sorted = [...totals].sort((a, b) => a - b);
for (const k of [1, 10, 100, 1000]) {
  linear = 0;
  binary = 0;
  for (let q = 0; q < k; q++) {
    const target = totals[(q * 104_729 + 50_000) % n];
    linearFind(totals, target);
    binaryFind(sorted, target);
  }
  console.log(`${String(k).padStart(4)} searches: linear ${linear}, sort (about ${sortCost}) + binary ${binary}`);
}
```

Output of `node break-even.js` and of the browser terminal

```ts
   1 searches: linear 50001, sort (about 1660964) + binary 17
  10 searches: linear 712815, sort (about 1660964) + binary 155
 100 searches: linear 5108650, sort (about 1660964) + binary 1556
1000 searches: linear 50136500, sort (about 1660964) + binary 15663
```

The sort's cost is estimated as n log₂ n instead of counted, because `Array.prototype.sort` makes a different number of comparisons in different JavaScript engines. For a single search, sorting first is a loss. After a few dozen searches it wins, and after a thousand it is not close. The arithmetic: k linear searches cost about k × n/2, sorting costs about n log₂ n, so sorting pays off once k is more than about 2 log₂ n, which is 34 searches here. The rule of thumb: if you will search the same data more than a few dozen times, sort it once (or keep it sorted). If you only ever need exact lookups, a `Map` from id to order beats both with O(1) average per lookup, at the price of extra memory and no range queries.

| Need | Good choice | Cost per query |
| --- | --- | --- |
| One search, or unsorted data, or a condition | Linear search (`find`, `some`…) | O(n) |
| Many exact lookups by id | `Map` | O(1) average |
| Exact lookups plus ranges, first/last, "nearest", data rarely changes | Sorted array + binary search / bounds | O(log n) |
| Ranges plus frequent inserts and deletes | Balanced search tree, or a database index | O(log n) |

## Testing a search

Search functions are perfect for testing against a reference: linear search is obviously correct, so every binary search, lower bound and upper bound must agree with it. The inputs that matter are the edges: the empty array, one element, targets below the minimum, above the maximum, between two values, and runs of duplicates. Random small arrays with a small range of values produce all of those, many times over.

search-test.js

```ts
import { lowerBound, upperBound } from "./bounds.js";

function binarySearch(items, target) {
  let lo = 0;
  let hi = items.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (items[mid] === target) return mid;
    if (items[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

const refLower = (a, t) => { const i = a.findIndex((x) => x >= t); return i === -1 ? a.length : i; };
const refUpper = (a, t) => { const i = a.findIndex((x) => x > t); return i === -1 ? a.length : i; };

function check(label, ok) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
}

check("empty array", binarySearch([], 1) === -1 && lowerBound([], 1) === 0 && upperBound([], 1) === 0);
check("one element", binarySearch([5], 5) === 0 && binarySearch([5], 4) === -1 && binarySearch([5], 6) === -1);

let seed = 3;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let failures = 0;
let cases = 0;
for (let round = 0; round < 500; round++) {
  const items = Array.from({ length: Math.floor(random() * 12) }, () => Math.floor(random() * 8)).sort((a, b) => a - b);
  for (let target = -1; target <= 8; target++) {
    cases++;
    const found = binarySearch(items, target);
    const foundOk = found === -1 ? !items.includes(target) : items[found] === target;
    if (!foundOk) failures++;
    if (lowerBound(items, target) !== refLower(items, target)) failures++;
    if (upperBound(items, target) !== refUpper(items, target)) failures++;
  }
}
check(`${cases} random cases agree with linear search`, failures === 0);
```

Output of `node search-test.js` and of the browser terminal

```ts
PASS empty array
PASS one element
PASS 5000 random cases agree with linear search
```

Notice the check for `binarySearch`: with duplicates it may return any matching index, so the test accepts any index that holds the target, and for −1 demands that the target really is absent. Testing "returns index 2" would reject a correct implementation. Each of the six bugs above makes this test fail; try pasting one in.

## Searching in production

- **Databases do this for you.** An index on `orders.id` or `orders.placed_at` is a B-tree, a many-way cousin of binary search, so `WHERE placed_at >= '2026-09-03' AND placed_at < '2026-09-04'` is two "lower bound" descents and a scan between them. Write the range in exactly that half-open form; it is the same reasoning as `lowerBound`, and it avoids missing orders at 23:59:59.5.
- **Cursor pagination is a lower bound.** "The next 50 orders after id 734,512" is `WHERE id > 734512 ORDER BY id LIMIT 50`: find the position, read forward. Unlike `OFFSET`, it stays fast on page 10,000 and does not skip or repeat items when new orders arrive.
- **Binary search is a debugging tool.** `git bisect` binary-searches your commit history for the commit that introduced a bug: 1,000 commits take about 10 test runs. The same idea finds which of 500 config changes broke a build.
- **Keep the precondition true.** A sorted array stays sorted only if every insert uses the lower bound (or re-sorts). One `push` of an out-of-order item silently breaks every later search. Wrap the array in a small class that owns inserts, or assert sortedness in tests.
- **Compare consistently.** Sort and search with the same comparison: numeric comparators for numbers, one locale and options for `localeCompare`, and the same normalisation for text.
- **Binary search on the answer.** The halving idea works on anything monotonic, not just arrays: "what is the smallest number of delivery vans that can finish today's orders by 18:00?" can be answered by binary-searching over the number of vans. That is the subject of [Binary search as a pattern](https://zudojs.oyinlola.site/learn/pattern-binary-search), later in this course.

## Practice

TRY IT YOURSELF

### Every product at one price

Products are sorted by price. Using `lowerBound` and `upperBound` with a `key` function, print every product that costs exactly ₦12,000, and how many cost between ₦10,000 and ₦50,000 inclusive.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

An inclusive range `[a, b]` is everything from `lowerBound(a)` up to, but not including, `upperBound(b)`. The count is the difference between those two indexes.

HINT 2

`const count = upperBound(products, 5_000_000, price) - lowerBound(products, 1_000_000, price);`

SOLUTION

price-range.js

```ts
import { lowerBound, upperBound } from "./bounds.js";

const products = [
  { name: "USB cable", kobo: 250_000 }, { name: "Earbuds", kobo: 1_200_000 },
  { name: "Phone case", kobo: 1_200_000 }, { name: "Power bank", kobo: 1_200_000 },
  { name: "Smartwatch", kobo: 4_500_000 }, { name: "Blender", kobo: 5_000_000 },
  { name: "Speaker", kobo: 5_000_001 },
];
const price = (p) => p.kobo;

const from = lowerBound(products, 1_200_000, price);
const to = upperBound(products, 1_200_000, price);
console.log("at ₦12,000:", products.slice(from, to).map((p) => p.name).join(", "));

const count = upperBound(products, 5_000_000, price) - lowerBound(products, 1_000_000, price);
console.log("between ₦10,000 and ₦50,000:", count);
```

Output of `node price-range.js` and of the browser terminal

```ts
at ₦12,000: Earbuds, Phone case, Power bank
between ₦10,000 and ₦50,000: 5
```

Prices are stored in kobo (integers), so equality is exact; comparing floating-point naira amounts with `===` would be fragile. An inclusive range [a, b] is `upperBound(b) − lowerBound(a)`: the Speaker at one kobo over ₦50,000 is correctly left out. Four binary searches, O(log n) each.

TRY IT YOURSELF

### Nearest delivery slot

Delivery slots are sorted minutes after midnight. A customer asks for a time; offer the slot closest to it (earlier or later; on a tie, the earlier one). Use `lowerBound` to find the first slot at or after the time, then compare it with the slot just before it. Handle times before the first slot and after the last.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Handle the two edges first: `i === 0` means every slot is later than `wanted`; `i === slots.length` means every slot is earlier. Otherwise compare `slots[i - 1]` and `slots[i]` by how far each is from `wanted`.

HINT 2

`if (i === 0) return slots[0]; if (i === slots.length) return slots.at(-1); const before = slots[i - 1]; const after = slots[i]; return wanted - before <= after - wanted ? before : after;`

SOLUTION

nearest-slot.js

```ts
import { lowerBound } from "./bounds.js";

const slots = [9 * 60, 10 * 60 + 30, 12 * 60, 15 * 60, 17 * 60 + 30];
const clock = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function nearestSlot(slots, wanted) {
  const i = lowerBound(slots, wanted);
  if (i === 0) return slots[0];
  if (i === slots.length) return slots.at(-1);
  const before = slots[i - 1];
  const after = slots[i];
  return wanted - before <= after - wanted ? before : after;
}

for (const wanted of ["07:15", "11:15", "11:16", "13:30", "20:00"]) {
  const [h, m] = wanted.split(":").map(Number);
  console.log(`${wanted} -> ${clock(nearestSlot(slots, h * 60 + m))}`);
}
```

Output of `node nearest-slot.js` and of the browser terminal

```ts
07:15 -> 09:00
11:15 -> 10:30
11:16 -> 12:00
13:30 -> 12:00
20:00 -> 17:30
```

The lower bound gives the "after" neighbour; the "before" neighbour is one index earlier. The two edge cases (`i === 0` and `i === slots.length`) are exactly where a careless version reads `slots[-1]` or `slots[slots.length]` and gets `undefined`. 11:15 is a tie between 10:30 and 12:00 and goes to the earlier slot, as asked.

TRY IT YOURSELF

### Which price applied?

A product's price history is a list of changes sorted by the time they took effect. A customer disputes an order placed at a given time. Find the price that was in effect then: the last change at or before that time. Which bound gives it directly?

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`upperBound(history, time, (change) => change.from)` gives the first change strictly *after* `time`. The change in effect at `time` is one index before that.

HINT 2

`const i = upperBound(history, time, (change) => change.from) - 1; return i < 0 ? undefined : history[i].kobo;`

SOLUTION

price-history.js

```ts
import { upperBound } from "./bounds.js";

const history = [
  { from: "2026-08-01T00:00:00Z", kobo: 1_500_000 },
  { from: "2026-08-20T09:00:00Z", kobo: 1_350_000 },
  { from: "2026-09-01T00:00:00Z", kobo: 1_600_000 },
];

function priceAt(history, time) {
  const i = upperBound(history, time, (change) => change.from) - 1;
  return i < 0 ? undefined : history[i].kobo;
}

for (const time of ["2026-07-15T12:00:00Z", "2026-08-20T09:00:00Z", "2026-08-31T23:59:59Z", "2026-09-10T08:00:00Z"]) {
  const kobo = priceAt(history, time);
  console.log(time, kobo === undefined ? "not on sale yet" : `₦${(kobo / 100).toLocaleString("en-NG")}`);
}
```

Output of `node price-history.js` and of the browser terminal

```ts
2026-07-15T12:00:00Z not on sale yet
2026-08-20T09:00:00Z ₦13,500
2026-08-31T23:59:59Z ₦13,500
2026-09-10T08:00:00Z ₦16,000
```

Upper bound finds the first change strictly *after* the time; the one before it is the last change at or before it, which is the price in effect. A change that took effect at exactly the order time applies (08-20 09:00), which is why this uses upper bound and not lower bound. This "floor" search is the array version of the BST floor from [Trees](https://zudojs.oyinlola.site/learn/dsa-trees#practice), and the same lookup that versioned configuration and exchange-rate tables use.

## Recap

- Linear search is O(n) and needs nothing from the data. Use it (and `find`, `findIndex`, `findLast`, `some`, `includes`) for unsorted data, small arrays, one-off searches and conditions. Always handle "not found".
- Binary search on sorted data halves the range each step: O(log n), about 20 looks for a million items. Write the invariant first: if the target exists, it is between `lo` and `hi`.
- The classic bugs live at the edges: a loop condition that does not match the range, a branch that does not shrink it, a fractional or overflowing middle, and data sorted by a different comparison than the search uses.
- Lower bound (first ≥) and upper bound (first >) give first and last occurrences, counts, insertion points, ranges, prefix matches and "nearest" answers, all in O(log n).
- Sorting costs O(n log n), so sort first only when you will search many times; a `Map` beats both for exact lookups, and a database index does all of it for data on disk.
- Test searches against linear search on random small arrays with duplicates, and accept any correct answer.

Next: [Sorting algorithms](https://zudojs.oyinlola.site/learn/dsa-sorting) builds the algorithms that produce the sorted data binary search depends on, and measures them against each other.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
