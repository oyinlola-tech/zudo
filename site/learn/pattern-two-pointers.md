---
title: "The two pointers pattern — ZudoJS Academy"
description: "Walk sorted data from both ends or at two speeds: pair refunds, dedupe order ids in place, size a tank, and find loops and midpoints with O(1) extra space."
source: https://zudojs.oyinlola.site/learn/pattern-two-pointers
---

LEVEL 3 · LESSON 18 OF 21

Problem-solving patterns Core

# The two pointers pattern

Walk sorted data from both ends or at two speeds: pair refunds, dedupe order ids in place, size a tank, and find loops and midpoints with O(1) extra space.

- **50 min** to read and try
- **You need:** Big O and complexity, Arrays and strings under the hood, Hash maps and sets, and The frequency counter pattern
- **You build:** A refund matcher, an in-place order id deduplicator, a best-container finder and a forwarding-loop detector, each checked against a brute-force reference

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Recognise problems where sorted order or a linked structure lets two indexes replace a nested loop
- Explain why moving one pointer safely discards candidates, using an invariant
- Solve pair sum, in-place dedupe and container problems in O(n) time and O(1) extra space
- Use fast and slow pointers to find the middle of a list and detect a cycle and its start
- Test a two-pointer function against a brute-force reference on generated input

## The problem: which two payments make the refund?

A customer of an online shop was refunded ₦23,500, but the refund did not go out as one payment: the payment provider split it into two payouts. Now the finance team has to find those two payouts in the day's payout list to close the ticket. The list comes from the provider already sorted by amount, smallest first, in kobo (whole numbers of the smallest unit, so there are no rounding errors; see [Mathematical reasoning](https://zudojs.oyinlola.site/learn/logic-math)).

So the task is: in a sorted list of amounts, find two different entries that add up to exactly a target. You solved an unsorted version of this, "two-sum", with a `Map` in [Hash maps and sets](https://zudojs.oyinlola.site/learn/dsa-hash-maps#uses). This lesson uses the fact that the list is *sorted*, and gets the same speed with no extra memory at all.

REASON IT OUT

### Before you code: pairs in a sorted list

- Can one payout be paired with itself? What about two different payouts of the same amount?
- What should happen when no pair adds up to the target?
- You add the smallest and the largest amount and the sum is too big. Which of the two can never be part of the answer, and why?
- And if the sum is too small?

**Show the reasoning**

**Itself:** no. A payout of ₦11,750 is one payment, not two. Two separate payouts of ₦11,750 each are fine: they are different entries that happen to have the same amount. So pair different *positions*, not different amounts.

**No pair:** return `null`. It is a normal outcome (maybe the refund failed), not a crash.

**Too big:** the largest amount is out. Its best possible partner is the smallest amount, and even that is too much, so every other partner (all bigger) is too much as well. Drop it.

**Too small:** by the mirror argument, the smallest amount is out: even the largest partner cannot lift it to the target. Drop it.

That third answer is the whole pattern. Each comparison rules out one entry for good.

## A naive solution: try every pair

The first working solution tries every pair of positions `i < j`:

naive-pair.js

```ts
function refundPairNaive(amounts, target) {
  for (let i = 0; i < amounts.length; i++) {
    for (let j = i + 1; j < amounts.length; j++) {
      if (amounts[i] + amounts[j] === target) return [amounts[i], amounts[j]];
    }
  }
  return null;
}

const payouts = [150000, 420000, 850000, 1175000, 1175000, 1500000, 1900000];
console.log(refundPairNaive(payouts, 2350000));
console.log(refundPairNaive(payouts, 2320000));
console.log(refundPairNaive(payouts, 1000000));
console.log(refundPairNaive([1175000, 1175000], 2350000), refundPairNaive([1175000], 2350000));
```

Output of `node naive-pair.js` and of the browser terminal

```json
[ 850000, 1500000 ]
[ 420000, 1900000 ]
[ 150000, 850000 ]
[ 1175000, 1175000 ] null
```

It is correct. It returns the first matching pair in the order it tries them (for ₦23,500 that is ₦8,500 + ₦15,000, although the two ₦11,750 payouts would also match), it accepts two different payouts of equal amount, and it never pairs an entry with itself because `j` starts at `i + 1`.

## What is wrong with it: count the operations

A payment provider can send tens of thousands of payouts a day. Count the additions the naive version makes when there is no matching pair, which is its worst case (it has to try everything before it can say no):

naive-pair-count.js

```ts
function refundPairNaive(amounts, target, counter) {
  for (let i = 0; i < amounts.length; i++) {
    for (let j = i + 1; j < amounts.length; j++) {
      counter.adds++;
      if (amounts[i] + amounts[j] === target) return [i, j];
    }
  }
  return null;
}

for (const n of [10, 100, 1000, 10000]) {
  const amounts = Array.from({ length: n }, (_, i) => 10000 + i * 200); // even kobo amounts
  const counter = { adds: 0 };
  const pair = refundPairNaive(amounts, 1, counter); // an odd target: no pair exists
  console.log(`n=${String(n).padEnd(6)} pair=${pair} adds=${counter.adds}`);
}
```

Output of `node naive-pair-count.js` and of the browser terminal

```ts
n=10     pair=null adds=45
n=100    pair=null adds=4950
n=1000   pair=null adds=499500
n=10000  pair=null adds=49995000
```

That is `n(n − 1) / 2` additions: O(n²). At 10,000 payouts, about 50 million. The waste is the same as in [the frequency lesson](https://zudojs.oyinlola.site/learn/pattern-frequency#whats-wrong): the naive solution ignores information it already has. Here that information is the *order*. After one addition it knows that a sum is too big or too small, which rules out a whole row of pairs, yet it goes on and tries them anyway.

The `Map` two-sum from the hash maps lesson would do this in O(n) time, but it builds a table of up to `n` entries: O(n) extra memory. On sorted data you can have O(n) time *and* O(1) extra space.

## The pattern: two indexes that each only move one way

A **pointer**, in this pattern, is simply a variable that holds a position: an array index or a reference to a list node. The **two pointers** pattern keeps two of them and moves them through the data by a rule, so that together they visit it in one pass instead of a nested loop. It comes in three shapes:

```ts
1. Opposite ends, moving inwards      (pair sum, container, palindrome)
   [ 1  4  8  11  11  15  19 ]
     L ->                <- R

2. Same direction: a reader and a writer   (remove duplicates in place)
   [ 3  3  5  7  7  7  9 ]
     W  R ->
     (R reads every item; W marks where the next kept item goes)

3. Same direction, different speeds: fast and slow   (middle, cycles)
   A -> B -> C -> D -> E
   S    F                  S moves one step, F moves two
```

Why is this allowed to skip pairs? Because of an **invariant**: a statement that is true before every step of a loop, which you prove once and then rely on. For pair sum it is:

If a matching pair exists, both of its entries lie between `left` and `right` (inclusive).

It is true at the start, when the pointers are at the two ends. Each move keeps it true, by the argument from the reason block: when the sum is too big, the entry at `right` cannot be in any matching pair, so moving `right` left drops nothing useful; when it is too small, the same holds for `left`. When the pointers meet, no pair is left, and by the invariant none existed. Each step moves one pointer one place, so there are at most `n − 1` steps.

### How to recognise it

- The input is **sorted** (or you can afford to sort it), and the question is about pairs: a sum, a difference, the closest pair.
- You must change an array **in place**, keeping some items and dropping others, with O(1) extra space.
- The question compares the two **ends** of something: palindromes, "the widest", "from both sides".
- The data is a **linked structure** (each item points to the next one) and you need its middle, its *k*-th item from the end, or to know whether it loops.
- Two sorted lists must be **merged** or compared, one pointer per list.

## The improved solution

refund-pair.js

```ts
function refundPair(amounts, target, counter = { adds: 0 }) {
  let left = 0;
  let right = amounts.length - 1;
  while (left < right) {           // two different positions
    counter.adds++;
    const sum = amounts[left] + amounts[right];
    if (sum === target) return [left, right];
    if (sum > target) right--;     // amounts[right] is too big for any partner
    else left++;                   // amounts[left] is too small for any partner
  }
  return null;
}

const payouts = [150000, 420000, 850000, 1175000, 1175000, 1500000, 1900000];
console.log(refundPair(payouts, 2350000));
console.log(refundPair(payouts, 2320000));
console.log(refundPair(payouts, 1000000));
console.log(refundPair([1175000], 2350000), refundPair([], 0));

for (const n of [10, 100, 1000, 10000]) {
  const amounts = Array.from({ length: n }, (_, i) => 10000 + i * 200);
  const counter = { adds: 0 };
  refundPair(amounts, 1, counter);
  console.log(`n=${String(n).padEnd(6)} adds=${counter.adds}`);
}
```

Output of `node refund-pair.js` and of the browser terminal

```json
[ 2, 5 ]
[ 1, 6 ]
[ 0, 2 ]
null null
n=10     adds=9
n=100    adds=99
n=1000   adds=999
n=10000  adds=9999
```

`left < right` (not `<=`) is what stops a single ₦11,750 payout from pairing with itself, and it also handles lists of zero or one entry without any special case. The counts drop from `n(n − 1) / 2` to at most `n − 1`: at 10,000 payouts, 9,999 additions instead of 49,995,000.

The function returns positions, which is what finance needs to find the two payout records. Here is the search traced for a target of ₦23,500 (2,350,000 kobo), amounts shown in thousands of kobo:

```json
[150  420  850  1175  1175  1500  1900]
 L                                R     150 + 1900 = 2050  too small: L++
      L                           R     420 + 1900 = 2320  too small: L++
           L                      R     850 + 1900 = 2750  too big:   R--
           L                R           850 + 1500 = 2350  found [2, 5]
```

The pair it finds is ₦8,500 + ₦15,000, not the two ₦11,750 payouts: several pairs can match, and this function returns the first one its walk reaches. If finance needs *all* matching pairs, that is a different question; exercise 2 counts them.

## Its complexity

| Approach | Time | Extra space | Needs sorted input? |
| --- | --- | --- | --- |
| every pair | O(n²) | O(1) | no |
| `Map` of seen amounts | O(n) average | O(n) | no |
| sort, then two pointers | O(n log n) | O(n) for a sorted copy, or O(1) if you may sort in place | no, it sorts first |
| two pointers on sorted input | O(n) | O(1) | yes |

The pattern's advantage is the memory column. When the data arrives sorted (from a database `ORDER BY`, a sorted export, an index) it is the best choice. When it does not, sorting costs O(n log n), and the `Map` version may be faster; which to pick depends on whether memory or time is scarcer, and whether you need the sorted order anyway. [Sorting algorithms](https://zudojs.oyinlola.site/learn/dsa-sorting) covers what sorting costs.

## Same direction: removing duplicate order ids in place

Two exports of order ids were merged and sorted, and some ids now appear twice or three times. The list has 5 million entries on a small worker machine, so the fix must happen **in place**: inside the same array, without building a second one.

The naive in-place fix walks the array and `splice`s out every repeat. It looks linear, but each `splice` shifts every later element one place to the left, as [Arrays and strings under the hood](https://zudojs.oyinlola.site/learn/dsa-arrays-strings#insert-delete) showed. Count the shifts:

dedupe-splice.js

```ts
function dedupeSplice(ids, counter) {
  let i = 1;
  while (i < ids.length) {
    if (ids[i] === ids[i - 1]) {
      counter.shifts += ids.length - i - 1; // what splice moves
      ids.splice(i, 1);
    } else {
      i++;
    }
  }
  return ids.length;
}

for (const n of [1000, 10000, 100000]) {
  const ids = Array.from({ length: n }, (_, i) => Math.floor(i / 2)); // every id twice
  const counter = { shifts: 0 };
  const kept = dedupeSplice(ids, counter);
  console.log(`n=${String(n).padEnd(6)} kept=${String(kept).padEnd(5)} shifts=${counter.shifts}`);
}
```

Output of `node dedupe-splice.js` and of the browser terminal

```ts
n=1000   kept=500   shifts=249500
n=10000  kept=5000  shifts=24995000
n=100000 kept=50000 shifts=2499950000
```

Quadratic again: 100,000 ids cause 2.5 billion element moves. The two-pointer version uses a **reader** that visits every element once and a **writer** that marks where the next kept element goes. Because the array is sorted, a duplicate is always equal to the last element *kept*, which sits just before the writer:

dedupe-in-place.js

```ts
function dedupeSorted(ids, counter = { writes: 0 }) {
  if (ids.length === 0) return 0;
  let write = 1;                      // ids[0 .. write-1] are the kept, unique ids
  for (let read = 1; read < ids.length; read++) {
    if (ids[read] !== ids[write - 1]) {
      ids[write] = ids[read];
      write++;
      counter.writes++;
    }
  }
  ids.length = write;                 // cut off the leftovers
  return write;
}

const orders = ["ORD-101", "ORD-101", "ORD-104", "ORD-107", "ORD-107", "ORD-107", "ORD-110"];
console.log(dedupeSorted(orders), orders);
console.log(dedupeSorted([]), dedupeSorted(["ORD-1"]));

for (const n of [1000, 10000, 100000]) {
  const ids = Array.from({ length: n }, (_, i) => Math.floor(i / 2));
  const counter = { writes: 0 };
  const kept = dedupeSorted(ids, counter);
  console.log(`n=${String(n).padEnd(6)} kept=${String(kept).padEnd(5)} writes=${counter.writes}`);
}
```

Output of `node dedupe-in-place.js` and of the browser terminal

```ts
4 [ 'ORD-101', 'ORD-104', 'ORD-107', 'ORD-110' ]
0 1
n=1000   kept=500   writes=499
n=10000  kept=5000  writes=4999
n=100000 kept=50000 writes=49999
```

The invariant here: before each step, `ids[0]` to `ids[write − 1]` are exactly the distinct ids seen so far, in order. The reader moves every step; the writer moves only when something new is found. One pass: O(n) time, O(1) extra space. `ids.length = write` then cuts off the leftover tail in place, without building a new array.

> WATCH OUT
>
> An in-place function changes the caller's array. That is the point here (there is no memory for a copy), but it surprises callers who still need the original. Name such functions clearly, document it, and prefer a copying version whenever memory allows.

## Opposite ends again: the biggest tank

A classic interview problem shows that the opposite-ends shape is not only for sums. A farm has a row of wall panels of different heights, one metre apart. You may pick any two panels as the sides of a water tank; the water level can only reach the shorter of the two, and the width is the distance between them. Which two panels hold the most water? (This problem is known as **container with most water**.)

```ts
heights:  3  8  6  2  5  4  8  3  7
index:    0  1  2  3  4  5  6  7  8

panels 1 and 8: width 7, level min(8, 7) = 7, area 49
```

REASON IT OUT

### Before you code: which pointer moves?

- Start with the widest tank: the first and last panel. To try a different pair you must bring one side inwards, which makes the tank narrower. How could a narrower tank ever hold more?
- Suppose the left panel is shorter than the right one. Is there any better tank that still uses the left panel?

**Show the reasoning**

A narrower tank only wins if it is **taller**, and the level is limited by the *shorter* side.

If the left panel is the shorter one, every other tank that uses it is narrower (the right side moves in) and its level is still at most the left panel's height. So none of them can beat the current tank: the left panel is finished, and `left++` is safe. Moving the *taller* side instead is not safe: the next tanks would still be capped by the short side while the width shrinks, and the tall panel you dropped might belong to the best tank. In `[2, 10, 10]` the best tank uses the two 10s (width 1, area 10); moving the right side first would throw one of them away and report 4. Always move the shorter side; on a tie, either.

container.js

```ts
function biggestTankNaive(heights, counter) {
  let best = 0;
  for (let i = 0; i < heights.length; i++) {
    for (let j = i + 1; j < heights.length; j++) {
      counter.checks++;
      best = Math.max(best, (j - i) * Math.min(heights[i], heights[j]));
    }
  }
  return best;
}

function biggestTank(heights, counter) {
  let left = 0;
  let right = heights.length - 1;
  let best = 0;
  while (left < right) {
    counter.checks++;
    best = Math.max(best, (right - left) * Math.min(heights[left], heights[right]));
    if (heights[left] < heights[right]) left++;
    else right--;
  }
  return best;
}

const panels = [3, 8, 6, 2, 5, 4, 8, 3, 7];
for (const fn of [biggestTankNaive, biggestTank]) {
  const counter = { checks: 0 };
  console.log(fn.name, fn(panels, counter), `${counter.checks} checks`);
}

const many = Array.from({ length: 5000 }, (_, i) => ((i * 7919) % 97) + 1);
for (const fn of [biggestTankNaive, biggestTank]) {
  const counter = { checks: 0 };
  console.log(fn.name, fn(many, counter), `${counter.checks} checks`);
}
```

Output of `node container.js` and of the browser terminal

```ts
biggestTankNaive 49 36 checks
biggestTank 49 8 checks
biggestTankNaive 474912 12497500 checks
biggestTank 474912 4999 checks
```

Same answers, `n − 1` checks instead of `n(n − 1) / 2`. Note what makes this correct: not the sorting (these heights are not sorted) but the argument that each move discards a side that cannot be in any better answer. Every two-pointer solution needs such an argument; if you cannot make it, the pattern does not apply.

## Fast and slow pointers

The third shape runs two pointers in the same direction at different speeds. It is at its best on **linked** data, where each item knows only the next item and there is no index to jump to. [Linked lists](https://zudojs.oyinlola.site/learn/dsa-linked-lists) builds that structure fully; here a node is just an object `{ stop, next }`, and `next` is `null` at the end.

### The middle, and the k-th stop from the end

A delivery route is stored as a linked list of stops. In the [Linked lists practice](https://zudojs.oyinlola.site/learn/dsa-linked-lists#practice) you found its middle stop in one walk: the fast pointer moves two stops per step, the slow one moves one, so when the fast pointer reaches the end, the slow one is halfway. A close relative answers "which stop is `k` from the end?" (the rider wants a warning three stops before the last one). Give the lead pointer a head start of `k` stops, then move both one stop at a time. They stay `k` apart, so when the lead falls off the end, the trailing pointer is `k` from the end:

route-pointers.js

```ts
function routeFrom(stops) {
  let head = null;
  for (let i = stops.length - 1; i >= 0; i--) head = { stop: stops[i], next: head };
  return head;
}

function middleStop(head) {
  let slow = head;
  let fast = head;
  while (fast !== null && fast.next !== null) {
    slow = slow.next;
    fast = fast.next.next;
  }
  return slow?.stop ?? null;
}

function stopFromEnd(head, k) {
  let lead = head;
  for (let i = 0; i < k; i++) {
    if (lead === null) return null; // fewer than k stops
    lead = lead.next;
  }
  let trail = head;
  while (lead !== null) {
    lead = lead.next;
    trail = trail.next;
  }
  return trail?.stop ?? null;
}

const route = routeFrom(["Depot", "Yaba", "Surulere", "Ikeja", "Maryland", "Lekki"]);
console.log(middleStop(route), stopFromEnd(route, 1), stopFromEnd(route, 3));
console.log(stopFromEnd(route, 6), stopFromEnd(route, 7), middleStop(null));
```

Output of `node route-pointers.js` and of the browser terminal

```ts
Ikeja Lekki Ikeja
Depot null null
```

Both walk the list once and keep two references: O(n) time, O(1) space. With an even number of stops there are two middles and this loop returns the second. The condition `fast !== null && fast.next !== null` checks both nodes the fast pointer is about to jump over, so it never reads `.next` of `null`; in `stopFromEnd`, the head-start loop is where "fewer than `k` stops" is caught.

### Detecting a forwarding loop

A payments app lets an account forward incoming money to another account. Each account forwards to at most one other, so following the forwards is walking a linked structure. A misconfiguration (Ada forwards to Bola, Bola to Chidi, Chidi to Dayo, Dayo back to Bola) creates a loop, and a naive "follow until you reach an account that keeps the money" never ends.

[Linked lists](https://zudojs.oyinlola.site/learn/dsa-linked-lists#cycles) detected such a cycle two ways: a `Set` of visited nodes (O(n) space) and **Floyd's cycle detection**, the tortoise and the hare (O(1) space): a slow pointer moves one step and a fast pointer two; with no loop the fast pointer reaches the end, and with a loop the fast one gains one step per move and must land on the slow one within a lap. Support needs more than "there is a loop", though: to fix the settings they need to know *which account* closes it.

Floyd's method has a second phase that finds where the loop starts: once they meet, put one pointer back at the start and move both one step at a time; they meet again exactly at the first account inside the loop. (Why: if the start is `a` steps from the loop and they met `b` steps into a loop of length `L`, the fast pointer walked twice as far, which works out to `a` being a whole number of laps minus `b`. So walking `a` more steps from the meeting point also lands on the loop's start.)

forwarding-loop.js

```ts
function findLoopStart(forwards, from, counter = { steps: 0 }) {
  const next = (account) => forwards.get(account) ?? null;
  let slow = from;
  let fast = from;
  while (fast !== null && next(fast) !== null) {
    counter.steps++;
    slow = next(slow);
    fast = next(next(fast));
    if (slow === fast) {
      let a = from;
      let b = slow;
      while (a !== b) {
        counter.steps++;
        a = next(a);
        b = next(b);
      }
      return a;                  // the first account inside the loop
    }
  }
  return null;                   // reached an account that keeps the money
}

const healthy = new Map([["ada", "bola"], ["bola", "chidi"]]);
const broken = new Map([["ada", "bola"], ["bola", "chidi"], ["chidi", "dayo"], ["dayo", "bola"]]);
console.log(findLoopStart(healthy, "ada"));
console.log(findLoopStart(broken, "ada"));
console.log(findLoopStart(broken, "dayo"));
console.log(findLoopStart(new Map([["eze", "eze"]]), "eze"));

const long = new Map(Array.from({ length: 100000 }, (_, i) => [`acct-${i}`, `acct-${(i + 1) % 100000}`]));
const counter = { steps: 0 };
console.log(findLoopStart(long, "acct-0", counter), counter.steps, "steps");
```

Output of `node forwarding-loop.js` and of the browser terminal

```ts
null
bola
dayo
eze
acct-0 100000 steps
```

An account that forwards to itself is a loop of length 1, and it is found like any other. On a loop of 100,000 accounts the whole search takes about 100,000 steps and remembers only two account names. The `Set` version would be simpler to read and just as fast; choose Floyd's method when memory is tight or the structure is huge, and the `Set` when clarity matters more.

## Failure cases

- **Unsorted input.** The pair-sum argument ("everything to the left is smaller") is only true for sorted data. On unsorted amounts `refundPair` silently misses pairs. Either sort first, check the order, or use the `Map` version.
- **Sorted the wrong way.** Numbers sorted with the default `sort()` are sorted as *strings* (`[100, 25, 3]`), which breaks every argument above. Sort numbers with `(a, b) => a - b`.
- **`<` versus `<=`.** `while (left <= right)` in pair sum pairs an entry with itself. Decide whether the pointers may meet, and write it down.
- **A pointer that never moves.** If some branch of the loop moves neither pointer, the loop never ends. Every branch must move at least one pointer towards the other.
- **Floating-point money.** `0.1 + 0.2 === 0.3` is false, so an exact target sum in naira with decimals can be missed. Keep amounts in integer kobo.
- **Reading past the end.** In fast and slow pointers, check `fast` and `fast.next` before jumping two steps.
- **Mutating shared data.** In-place algorithms change the caller's array; a caller that reuses it afterwards sees the truncated version.

## Testing two-pointer code

Two-pointer bugs hide in edges: the first and last element, equal values, the pointers meeting. The brute-force versions are slow but obviously correct, so compare against them on many small generated inputs, where edges come up constantly. Small value ranges make duplicates and matches common:

two-pointers-test.js

```ts
function refundPair(a, target) {
  let left = 0, right = a.length - 1;
  while (left < right) {
    const sum = a[left] + a[right];
    if (sum === target) return [left, right];
    if (sum > target) right--;
    else left++;
  }
  return null;
}

function hasPairBrute(a, target) {
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (a[i] + a[j] === target) return true;
  return false;
}

function xorshift(seed) {
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
}

const random = xorshift(99);
let agree = 0, found = 0, validPairs = 0;
for (let t = 0; t < 3000; t++) {
  const a = Array.from({ length: Math.floor(random() * 8) }, () => Math.floor(random() * 10)).sort((x, y) => x - y);
  const target = Math.floor(random() * 20);
  const pair = refundPair(a, target);
  if ((pair !== null) === hasPairBrute(a, target)) agree++;
  if (pair !== null) {
    found++;
    const [i, j] = pair;
    if (i < j && a[i] + a[j] === target) validPairs++;
  }
}
console.log(`${agree}/3000 agree with brute force; ${found} pairs found, ${validPairs} of them valid`);
```

Output of `node two-pointers-test.js` and of the browser terminal

```ts
3000/3000 agree with brute force; 627 pairs found, 627 of them valid
```

The test checks two different things: that the fast version finds a pair exactly when one exists, and that every pair it returns is really valid (two different positions that add up). Comparing only "found or not" would pass a function that returned the wrong positions.

## Two pointers in production

- **Databases merge with two pointers.** When both sides of a SQL join are sorted on the join key, the database can use a *merge join*: one pointer per table, advancing whichever key is smaller. It is the same walk as merging two sorted lists.
- **Files too big for memory.** Sorting a 50 GB log is done by sorting chunks, writing them to disk, then merging the sorted chunks with one pointer per file (an *external merge sort*). Memory use stays small because each file is read front to back once.
- **Reconciliation.** Matching a bank statement against the ledger, both sorted by reference, is two pointers: advance the smaller reference, report a reference present on only one side.
- **Is sorting worth it?** If you have to sort just to use two pointers, the sort dominates (O(n log n)). Often the data is already sorted by an index; take advantage of that, and ask the database for sorted rows rather than sorting in your server.

## New problems to practise

TRY IT YOURSELF

### Merge two sorted statements

A bank statement and the shop's ledger are both sorted by amount (in kobo). Write `mergeSorted(a, b)` that returns one sorted array with every entry of both, in O(n + m) time, without calling `sort`.

**Show a solution**

merge-sorted.js

```ts
function mergeSorted(a, b) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] <= b[j]) out.push(a[i++]);
    else out.push(b[j++]);
  }
  while (i < a.length) out.push(a[i++]);
  while (j < b.length) out.push(b[j++]);
  return out;
}

console.log(mergeSorted([1500, 4000, 9000], [2000, 4000, 12000, 15000]));
console.log(mergeSorted([], [300]), mergeSorted([], []));
```

Output of `node merge-sorted.js` and of the browser terminal

```json
[
   1500,  2000,
   4000,  4000,
   9000, 12000,
  15000
]
[ 300 ] []
```

One pointer per list; each step copies the smaller head and advances only that pointer. Every element is copied once: O(n + m) time and O(n + m) space for the result. Using `<=` takes from `a` first on ties, so equal amounts keep the order "statement before ledger". That property is called **stability**, and merge sort relies on it (see [Sorting algorithms](https://zudojs.oyinlola.site/learn/dsa-sorting)).

TRY IT YOURSELF

### How many pairs fit the budget?

A customer has a gift card for ₦20,000 and wants to buy exactly two different items. Given the item prices sorted ascending (in naira, whole numbers), count how many pairs of positions cost at most ₦20,000 together, in O(n).

**Show a solution**

budget-pairs.js

```ts
function pairsWithinBudget(prices, budget) {
  let left = 0;
  let right = prices.length - 1;
  let pairs = 0;
  while (left < right) {
    if (prices[left] + prices[right] <= budget) {
      pairs += right - left; // left pairs with every index from left+1 to right
      left++;
    } else {
      right--;
    }
  }
  return pairs;
}

console.log(pairsWithinBudget([3000, 5000, 8000, 12000, 17000], 20000));
console.log(pairsWithinBudget([15000, 16000], 20000), pairsWithinBudget([10000, 10000], 20000));
```

Output of `node budget-pairs.js` and of the browser terminal

```ts
7
0 1
```

When `prices[left] + prices[right]` fits, every item between them is cheaper than `prices[right]`, so `left` fits with all `right − left` of them at once, and `left` is done. When it does not fit, `right` is too expensive even with the cheapest partner, so it is done. That counts up to `n(n − 1) / 2` pairs in O(n) steps, without listing them.

TRY IT YOURSELF

### The closest pair to a refund

Sometimes no two payouts add up exactly, because a fee was deducted. Write `closestPair(amounts, target)` for a sorted list that returns the pair of positions whose sum is closest to the target. What is the argument that the pointer moves stay safe?

**Show a solution**

closest-pair.js

```ts
function closestPair(amounts, target) {
  let left = 0;
  let right = amounts.length - 1;
  let best = null;
  while (left < right) {
    const sum = amounts[left] + amounts[right];
    if (best === null || Math.abs(sum - target) < Math.abs(best.sum - target)) {
      best = { left, right, sum };
    }
    if (sum === target) break;
    if (sum > target) right--;
    else left++;
  }
  return best;
}

console.log(closestPair([150000, 420000, 850000, 1500000, 1900000], 2330000));
console.log(closestPair([500], 1000));
```

Output of `node closest-pair.js` and of the browser terminal

```json
{ left: 1, right: 4, sum: 2320000 }
null
```

When the sum is too big, every other pair using `right` (with a partner further right than `left`) is bigger still, so it is further from the target on the same side: `right` cannot improve on what was already seen, and it is safe to drop. The mirror holds for too small. So the same moves as exact pair sum work; you just remember the best sum seen. O(n) time, O(1) space.

## Summary

- Two pointers are two position variables moved by a rule, replacing a nested loop with one pass: from both ends inwards, reader and writer in the same direction, or fast and slow.
- The rule is only correct if each move discards something that cannot be part of the answer. State that invariant; if you cannot, the pattern does not apply.
- On sorted input, pair sum drops from `n(n − 1) / 2` additions to at most `n − 1`, with O(1) extra space, where a `Map` needs O(n).
- A reader and a writer remove duplicates from a sorted array in place in O(n), where repeated `splice` is O(n²).
- Container with most water: always move the shorter side.
- Fast and slow pointers find the middle of a linked list in one walk and detect a cycle (and its start) in O(1) space.
- Test against brute force on small generated inputs, and check that returned positions are really valid, not only that something was found.

Next: [Sliding window and prefix sums](https://zudojs.oyinlola.site/learn/pattern-sliding-window), where two pointers mark the edges of a range that slides along the data: the best 7 days of revenue, the longest on-time streak.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
