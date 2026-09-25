---
title: "Dynamic programming — ZudoJS Academy"
description: "Turn exponential searches into fast tables: pack a delivery van, make change in naira, and diff two versions of a text, with memoization and tabulation."
source: https://zudojs.oyinlola.site/learn/dsa-dynamic-programming
---

LEVEL 3 · LESSON 16 OF 21

Algorithms Core

# Dynamic programming

Turn exponential searches into fast tables: pack a delivery van, make change in naira, and diff two versions of a text, with memoization and tabulation.

- **60 min** to read and try
- **You need:** Backtracking, Greedy algorithms, Recursion, and Closures in depth
- **You build:** A van loader that picks the most valuable parcels, a change maker that counts and finds the fewest notes, and a line-by-line text diff, all tested against brute force

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Recognise overlapping subproblems and optimal substructure in a recursive solution
- Speed up a recursive solution with memoization, and rewrite it bottom-up as a table
- Solve coin change (fewest pieces and number of ways), the 0/1 knapsack and the longest common subsequence, and reconstruct the actual answer
- Reduce a table's memory to one or two rows and explain the direction of the loop
- Test a dynamic programming solution against brute force and state its time and space cost

## The problem: packing the van before it leaves

Every morning a dispatcher loads a van that can carry 200 kg. There are more parcels than fit. Each parcel has a weight and a delivery fee, and the dispatcher wants the load that earns the most. In [Greedy algorithms](https://zudojs.oyinlola.site/learn/dsa-greedy#knapsack) you saw that "best fee per kilogram first" can miss the best load, and in [Backtracking](https://zudojs.oyinlola.site/learn/dsa-backtracking) you learned to search every combination exactly. Here is that exact search, counting its calls:

parcels.js

```ts
export function makeRandom(seed) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

export function parcels(n, seed = 3) {
  const random = makeRandom(seed);
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    kg: 5 + Math.floor(random() * 36),
    naira: 2000 + Math.floor(random() * 30) * 500,
  }));
}
```

search.js

```ts
import { parcels } from "./parcels.js";

function bestLoad(items, capacity) {
  let calls = 0;
  function best(i, room) {
    calls++;
    if (i === items.length) return 0;
    let value = best(i + 1, room);
    if (items[i].kg <= room) value = Math.max(value, items[i].naira + best(i + 1, room - items[i].kg));
    return value;
  }
  return { naira: best(0, capacity), calls };
}

for (const n of [10, 15, 20]) {
  const { naira, calls } = bestLoad(parcels(n), 200);
  console.log(`${n} parcels: best load ₦${naira}, ${calls} calls`);
}
```

Output of `node search.js` and of the browser terminal

```ts
10 parcels: best load ₦74000, 2047 calls
15 parcels: best load ₦116500, 65519 calls
20 parcels: best load ₦131000, 1572242 calls
```

`best(i, room)` answers one question: "what is the most I can earn from parcels `i` onwards, with `room` kg left?". It either skips parcel `i` or takes it (if it fits), and keeps the better. Correct, but the calls roughly double with every parcel: 20 parcels already need 1.5 million calls, and a real morning with 60 parcels would need more calls than there are grains of sand on Earth.

Yet look at the question again. `i` is between 0 and n, and `room` is a whole number between 0 and 200. So there are at most 21 × 201 = 4,221 *different* questions for 20 parcels. The search asks them 1.5 million times: the same question over and over, from different branches. That waste is what **dynamic programming** removes.

## The idea: overlapping subproblems

A problem is a good fit for dynamic programming (DP) when it has two properties:

- **Optimal substructure**: the best answer is built from best answers to smaller versions of the same problem. The best load from parcel `i` on is either the best load from `i + 1` on, or parcel `i` plus the best load from `i + 1` on with less room.
- **Overlapping subproblems**: the recursion reaches the same smaller problem many times by different paths.

Divide and conquer ([Divide and conquer](https://zudojs.oyinlola.site/learn/dsa-divide-conquer)) has the first property but not the second: the two halves of merge sort share nothing. When subproblems overlap, the fix is to **solve each one once and remember the answer**. There are two ways to do that. The smallest example shows both. The Fibonacci numbers start 0, 1, and each next one is the sum of the previous two: F(n) = F(n − 1) + F(n − 2). (They count many real things, such as the ways to climb a staircase taking one or two steps at a time; [Recursion](https://zudojs.oyinlola.site/learn/js-recursion#bugs) met them as `ways(n)`.)

fib-calls.js

```ts
let calls = 0;
function fib(n) {
  calls++;
  if (n < 2) return n;
  return fib(n - 1) + fib(n - 2);
}

for (const n of [10, 20, 30]) {
  calls = 0;
  const value = fib(n);
  console.log(`fib(${n}) = ${value}, ${calls} calls`);
}
```

Output of `node fib-calls.js` and of the browser terminal

```ts
fib(10) = 55, 177 calls
fib(20) = 6765, 21891 calls
fib(30) = 832040, 2692537 calls
```

fib(30) is computed with 2.7 million calls, but there are only 31 different subproblems, fib(0) to fib(30). fib(28) alone is computed twice, fib(27) three times, fib(26) five times: the repeat counts are themselves Fibonacci numbers, which is why the total grows exponentially.

## Memoization: top-down

**Memoization** keeps the recursive function exactly as it is and adds a cache: before computing an answer, look it up; after computing it, store it. You built a general `memoize` helper in [Closures in depth](https://zudojs.oyinlola.site/learn/js-closures#memoization). For DP the cache is usually written inside the function, keyed by the subproblem's parameters:

fib-memo.js

```ts
function fibMemo(n, memo = new Map()) {
  if (n < 2) return n;
  if (memo.has(n)) return memo.get(n);
  const value = fibMemo(n - 1, memo) + fibMemo(n - 2, memo);
  memo.set(n, value);
  return value;
}

let calls = 0;
const counted = (n, memo) => {
  calls++;
  if (n < 2) return n;
  if (memo.has(n)) return memo.get(n);
  const value = counted(n - 1, memo) + counted(n - 2, memo);
  memo.set(n, value);
  return value;
};

console.log("fib(30) =", fibMemo(30));
console.log("fib(78) =", fibMemo(78), "safe integer:", Number.isSafeInteger(fibMemo(78)));
console.log("fib(79) safe integer:", Number.isSafeInteger(fibMemo(79)));
counted(30, new Map());
console.log("calls for fib(30):", calls);
```

Output of `node fib-memo.js` and of the browser terminal

```ts
fib(30) = 832040
fib(78) = 8944394323791464 safe integer: true
fib(79) safe integer: false
calls for fib(30): 59
```

From 2.7 million calls to 59: each fib(k) is computed once, and every other request for it is a cache hit. The work is now proportional to the number of distinct subproblems times the work per subproblem: O(n) × O(1). That is the formula for the cost of every DP in this lesson: **number of states × work per state**.

fib(78) is the largest Fibonacci number a JavaScript number holds exactly; fib(79) and above exceed `Number.MAX_SAFE_INTEGER` (253 − 1) and would be silently rounded, so beyond that, use BigInt. And the memoized version still recurses n levels deep, so fibMemo(20000) would overflow the call stack.

## Tabulation: bottom-up

**Tabulation** turns the recursion around. Instead of starting from the big question and recursing down, fill a table from the smallest subproblems up, in an order where every entry's inputs are already filled when you reach it. For Fibonacci, that order is simply 0, 1, 2, …, n:

fib-table.js

```ts
function fibTable(n) {
  const table = [0, 1];
  for (let i = 2; i <= n; i++) table[i] = table[i - 1] + table[i - 2];
  return table[n];
}

function fibTwoVariables(n) {
  let previous = 0;
  let current = 1;
  if (n === 0) return 0;
  for (let i = 2; i <= n; i++) [previous, current] = [current, previous + current];
  return current;
}

console.log(fibTable(30), fibTwoVariables(30));
console.log(fibTable(0), fibTable(1), fibTwoVariables(0), fibTwoVariables(1));
console.log("fib(20000) has", String(fibBig(20000)).length, "digits");

function fibBig(n) {
  let previous = 0n;
  let current = 1n;
  for (let i = 2; i <= n; i++) [previous, current] = [current, previous + current];
  return n === 0 ? 0n : current;
}
```

Output of `node fib-table.js` and of the browser terminal

```ts
832040 832040
0 1 0 1
fib(20000) has 4180 digits
```

Tabulation has no recursion, so no stack limit (fib(20000) with BigInt works fine), and no function-call or `Map` overhead. The second version shows **space optimisation**: each entry only needs the previous two, so you can keep two variables instead of the whole table, O(1) memory instead of O(n).

|  | Memoization (top-down) | Tabulation (bottom-up) |
| --- | --- | --- |
| How you write it | The natural recursion plus a cache | Loops that fill a table in dependency order |
| Which subproblems it solves | Only those actually reached | All of them, reached or not |
| Recursion depth | Can overflow the call stack | None |
| Space optimisation | Hard | Often easy (keep only the rows you need) |
| Good when | The recursion is easy to see and many states are unreachable | All states are needed, inputs are large, or memory must be small |

A reliable way to write any DP: first write the plain recursion (it is the specification), then memoize it, and only then, if you need to, convert it into a table.

## Coin change: fewest notes and number of ways

In the greedy lesson, ₦500/₦400/₦100 airtime vouchers broke largest-first: greedy used four vouchers for ₦800 where two ₦400s would do. DP gets it right for any set of values. Define the **state** as an amount `a`, and the subproblem as "the fewest vouchers that make exactly `a`". The last voucher used is one of the values `v`, and what remains, `a − v`, must itself be made with the fewest vouchers:

```ts
fewest(0) = 0
fewest(a) = 1 + min over every value v ≤ a of fewest(a − v)       (Infinity if no v works)
```

REASON IT OUT

### Before you fill the table

Think about these before reading the code. What should `fewest(0)` be, and why? How do you represent "this amount cannot be made at all" so that `1 + fewest(...)` and `min` still behave? You will also want to know *which* vouchers to hand over, not just how many: what extra information must the table keep? Finally, a second question sounds almost identical, "how many different ways can the customer pay ₦500 with ₦400 and ₦100 vouchers?": are ₦400 then ₦100, and ₦100 then ₦400, one way or two?

**Show the reasoning**

- **fewest(0) = 0**: nothing to pay, no vouchers. Every other answer is built on it, so getting the base case wrong shifts every entry.
- **Impossible**: use `Infinity`. `1 + Infinity` is still `Infinity`, and `Math.min` ignores it whenever a real option exists. Convert it to `null` (or "impossible") only when returning to the caller.
- **Which vouchers**: store, for each amount, the voucher that achieved the minimum (a **choice table**). To reconstruct, start at the target, read the voucher, subtract it, and repeat until you reach 0. This is the same trick as the parent links in [BFS](https://zudojs.oyinlola.site/learn/dsa-graph-search#bfs).
- **Ways to pay**: a customer thinks of ₦400 + ₦100 as one way, whichever voucher is handed over first, so count *combinations*, not sequences. The loop order decides which one you count, as the example below shows. Decide on purpose.

coins.js

```ts
export function fewestPieces(amount, values) {
  const fewest = [0];
  const lastPiece = [null];
  for (let a = 1; a <= amount; a++) {
    fewest[a] = Infinity;
    lastPiece[a] = null;
    for (const v of values) {
      if (v <= a && fewest[a - v] + 1 < fewest[a]) {
        fewest[a] = fewest[a - v] + 1;
        lastPiece[a] = v;
      }
    }
  }
  if (fewest[amount] === Infinity) return null;
  const pieces = [];
  for (let a = amount; a > 0; a -= lastPiece[a]) pieces.push(lastPiece[a]);
  return pieces.sort((x, y) => y - x);
}

export function waysToPay(amount, values) {
  const ways = [1, ...Array(amount).fill(0)];
  for (const v of values) {
    for (let a = v; a <= amount; a++) ways[a] += ways[a - v];
  }
  return ways[amount];
}
```

`fewestPieces` fills the table for every amount from 1 up, so when it computes `fewest[a]`, every `fewest[a - v]` is already known. Its cost is O(amount × number of values) time and O(amount) memory. `lastPiece` is the choice table.

vouchers.js

```ts
import { fewestPieces, waysToPay } from "./coins.js";

const vouchers = [500, 400, 100];
for (const amount of [800, 1200, 1300]) {
  console.log(`₦${amount}: ${fewestPieces(amount, vouchers).join(" + ")}`);
}
console.log("₦50:", fewestPieces(50, vouchers));
console.log("₦800 with a ₦750 voucher:", fewestPieces(800, [1500, 1000, 750, 500, 400, 200, 100]).join(" + "));

console.log("ways to pay ₦1000 with 500/400/100:", waysToPay(1000, vouchers));
console.log("ways to pay ₦100 in naira notes and coins:", waysToPay(100, [100, 50, 20, 10, 5, 2, 1]));
```

Output of `node vouchers.js` and of the browser terminal

```ts
₦800: 400 + 400
₦1200: 400 + 400 + 400
₦1300: 500 + 400 + 400
₦50: null
₦800 with a ₦750 voucher: 400 + 400
ways to pay ₦1000 with 500/400/100: 6
ways to pay ₦100 in naira notes and coins: 4563
```

Both amounts that greedy got wrong are now optimal, and the ₦750 trap that made greedy give up is handled. The work is also reasonable: for ₦800 the table has 801 entries of 3 checks each.

### Counting ways: the loop order matters

`waysToPay` counts combinations. Its outer loop is over the *values*: first it counts ways using only ₦500, then lets ₦400 join, then ₦100. Each combination is therefore built in one fixed order (all ₦500s first, then ₦400s, then ₦100s), and counted once. Swap the loops and you count sequences instead, where ₦400 then ₦100 and ₦100 then ₦400 are different:

loop-order.js

```ts
import { waysToPay } from "./coins.js";

function sequencesToPay(amount, values) {
  const ways = [1, ...Array(amount).fill(0)];
  for (let a = 1; a <= amount; a++) {
    for (const v of values) if (v <= a) ways[a] += ways[a - v];
  }
  return ways[amount];
}

console.log("₦500 with 400/100, combinations:", waysToPay(500, [400, 100]));
console.log("₦500 with 400/100, sequences:   ", sequencesToPay(500, [400, 100]));
console.log("₦1000 with 500/400/100, combinations:", waysToPay(1000, [500, 400, 100]), "sequences:", sequencesToPay(1000, [500, 400, 100]));
```

Output of `node loop-order.js` and of the browser terminal

```ts
₦500 with 400/100, combinations: 2
₦500 with 400/100, sequences:    3
₦1000 with 500/400/100, combinations: 6 sequences: 27
```

₦500 from ₦400 and ₦100 vouchers: as combinations, either five ₦100s or ₦400 + ₦100 (2 ways). As sequences, ₦400 + ₦100 and ₦100 + ₦400 are different, giving 3. Both are correct answers to different questions; the bug is using one when the business meant the other.

## The 0/1 knapsack: loading the van

Back to the van. The state is (parcels considered so far, kilograms of room). Let `best[i][c]` be the most fee you can earn using only the first `i` parcels with `c` kg of room. For parcel `i` (weight `w`, fee `f`) there are two choices, exactly as in the recursion:

```ts
best[0][c] = 0                                   (no parcels, no fee)
best[i][c] = best[i − 1][c]                      (leave parcel i)
           or f + best[i − 1][c − w]  if w ≤ c   (take it: less room for the rest)
           whichever is larger
```

This is the **0/1 knapsack**: each parcel is taken whole or not at all. To know *which* parcels to load, walk back through the table: if `best[i][c]` differs from `best[i − 1][c]`, parcel `i` was taken, so subtract its weight and continue with `i − 1`.

knapsack.js

```ts
export function loadVan(items, capacity) {
  const n = items.length;
  const best = Array.from({ length: n + 1 }, () => new Array(capacity + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    const { kg, naira } = items[i - 1];
    for (let c = 0; c <= capacity; c++) {
      best[i][c] = best[i - 1][c];
      if (kg <= c && naira + best[i - 1][c - kg] > best[i][c]) best[i][c] = naira + best[i - 1][c - kg];
    }
  }
  const taken = [];
  for (let i = n, c = capacity; i > 0; i--) {
    if (best[i][c] !== best[i - 1][c]) {
      taken.push(items[i - 1]);
      c -= items[i - 1].kg;
    }
  }
  return { naira: best[n][capacity], taken: taken.reverse(), cells: (n + 1) * (capacity + 1) };
}
```

morning.js

```ts
import { loadVan } from "./knapsack.js";
import { parcels } from "./parcels.js";

const today = parcels(20);
const { naira, taken, cells } = loadVan(today, 200);
console.log(`best load ₦${naira}: parcels ${taken.map((p) => p.id).join(", ")}`);
console.log(`weight ${taken.reduce((s, p) => s + p.kg, 0)} kg of 200, table of ${cells} cells`);

const greedy = [];
let room = 200;
for (const p of today.toSorted((a, b) => b.naira / b.kg - a.naira / a.kg)) {
  if (p.kg <= room) {
    greedy.push(p);
    room -= p.kg;
  }
}
console.log(`greedy by fee per kg: ₦${greedy.reduce((s, p) => s + p.naira, 0)}`);

for (const n of [60, 200]) {
  const result = loadVan(parcels(n), 200);
  console.log(`${n} parcels: ₦${result.naira}, ${result.cells} cells`);
}
```

Output of `node morning.js` and of the browser terminal

```ts
best load ₦131000: parcels 1, 2, 3, 4, 5, 6, 8, 10, 11, 12, 13, 14, 15, 18
weight 200 kg of 200, table of 4221 cells
greedy by fee per kg: ₦130500
60 parcels: ₦174000, 12261 cells
200 parcels: ₦279500, 40401 cells
```

The table has (n + 1) × (capacity + 1) cells, each filled in O(1): O(n × C) time and memory. 200 parcels take 40,000 cells, where the search would need about 2200 calls. Greedy by fee per kilogram comes close here, but not all the way.

### Pseudo-polynomial: the size of the numbers matters

O(n × C) looks polynomial, but C is a *value*, not a count of inputs. If weights were measured in grams, the capacity would be 200,000 and the table 1,000 times bigger, for exactly the same van. Such algorithms are called **pseudo-polynomial**. Keep the unit as coarse as the business allows (whole kilograms, or 5 kg steps), and remember that the knapsack problem is not solvable in true polynomial time in general; DP works because the capacity is a small number.

## Space optimisation, and the loop direction

Row `i` of the knapsack table only reads row `i − 1`. So you can keep one row of `capacity + 1` numbers and update it in place for each parcel, reducing memory from O(n × C) to O(C). There is one catch: the direction of the inner loop.

one-row.js

```ts
import { loadVan } from "./knapsack.js";
import { parcels } from "./parcels.js";

function oneRow(items, capacity, direction) {
  const best = new Array(capacity + 1).fill(0);
  for (const { kg, naira } of items) {
    if (direction === "down") {
      for (let c = capacity; c >= kg; c--) best[c] = Math.max(best[c], naira + best[c - kg]);
    } else {
      for (let c = kg; c <= capacity; c++) best[c] = Math.max(best[c], naira + best[c - kg]);
    }
  }
  return best[capacity];
}

const today = parcels(20);
console.log("full table:   ", loadVan(today, 200).naira);
console.log("one row, down:", oneRow(today, 200, "down"));
console.log("one row, up:  ", oneRow(today, 200, "up"));

const one = [{ kg: 50, naira: 10000 }];
console.log("a single 50 kg parcel, van of 200 kg:", oneRow(one, 200, "down"), "vs", oneRow(one, 200, "up"));
```

Output of `node one-row.js` and of the browser terminal

```ts
full table:    131000
one row, down: 131000
one row, up:   462000
a single 50 kg parcel, van of 200 kg: 10000 vs 40000
```

Going **down** from the capacity, `best[c - kg]` has not been updated for this parcel yet, so it still holds the previous row's value: the parcel is counted at most once. Going **up**, `best[c - kg]` may already include this parcel, so it can be taken again and again. The last line makes it obvious: one 50 kg parcel "earns" ₦40,000 in a 200 kg van. Going up solves a different problem (the **unbounded knapsack**, where every item can be used any number of times, which is exactly what `waysToPay` needed for vouchers). The bug is silent: no error, just a bigger number. The one-row version also loses the information needed to reconstruct which parcels were taken, so keep the full table when you need the list.

## Longest common subsequence: a text diff

An order's delivery instructions were edited, and the support tool must show what changed, like `git diff`. A **subsequence** of a list is what remains after deleting some items without reordering the rest. The **longest common subsequence** (LCS) of the old and new versions is the largest set of lines both versions share in the same order. Everything else is a deletion (in the old version only) or an insertion (in the new one only). Keeping the LCS as large as possible makes the diff as small as possible.

Let `L[i][j]` be the LCS length of the first `i` lines of the old text and the first `j` lines of the new one:

```ts
L[0][j] = L[i][0] = 0                                 (an empty text shares nothing)
if old[i−1] == new[j−1]:  L[i][j] = L[i−1][j−1] + 1  (the line is kept)
otherwise:                L[i][j] = max(L[i−1][j], L[i][j−1])
```

diff.js

```ts
export function lcsTable(a, b) {
  const L = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      L[i][j] = a[i - 1] === b[j - 1] ? L[i - 1][j - 1] + 1 : Math.max(L[i - 1][j], L[i][j - 1]);
    }
  }
  return L;
}

export function diff(a, b) {
  const L = lcsTable(a, b);
  const lines = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      lines.push(`  ${a[i - 1]}`);
      i--;
      j--;
    } else if (j > 0 && (i === 0 || L[i][j - 1] >= L[i - 1][j])) {
      lines.push(`+ ${b[j - 1]}`);
      j--;
    } else {
      lines.push(`- ${a[i - 1]}`);
      i--;
    }
  }
  return lines.reverse();
}
```

`diff` walks back from the bottom-right corner of the table. Equal lines were part of the LCS: keep them and move diagonally. Otherwise it moves in the direction the larger value came from: left means the new line was inserted, up means the old line was deleted.

instructions.js

```ts
import { diff, lcsTable } from "./diff.js";

const before = [
  "Deliver to: 12 Allen Avenue",
  "Ikeja, Lagos",
  "Call before arrival",
  "Leave with security",
  "Fragile: glassware",
];
const after = [
  "Deliver to: 12 Allen Avenue",
  "Ikeja, Lagos",
  "Leave with security",
  "Gate code 4412",
  "Fragile: glassware",
  "Pay on delivery",
];

console.log(diff(before, after).join("\n"));
const L = lcsTable(before, after);
console.log(`lines in common: ${L[before.length][after.length]}, table ${before.length + 1} x ${after.length + 1}`);

const word = (x, y) => lcsTable([...x], [...y])[x.length][y.length];
console.log("letters in common, 'Indomie Chicken' vs 'Indomie Onion Chicken':", word("Indomie Chicken", "Indomie Onion Chicken"));
```

Output of `node instructions.js` and of the browser terminal

```ts
  Deliver to: 12 Allen Avenue
  Ikeja, Lagos
- Call before arrival
  Leave with security
+ Gate code 4412
  Fragile: glassware
+ Pay on delivery
lines in common: 4, table 6 x 7
letters in common, 'Indomie Chicken' vs 'Indomie Onion Chicken': 15
```

The table has (n + 1) × (m + 1) cells for texts of n and m lines, each O(1): O(n × m) time and memory. Working on characters instead of lines (the last line) gives a character-level comparison, useful for highlighting the changed words in a line.

For long files, n × m explodes: two versions of a 100,000-line log would need 10 billion cells. Real diff tools (git, the `diff` command) use Myers' algorithm, which runs in O((n + m) × d) where d is the number of differences, so near-identical files are fast. When you only need the *length* of the LCS, two rows are enough, the same space trick as the knapsack.

## A recipe for any DP problem

1. **Define the state**: the smallest set of parameters that describes a subproblem completely. (Amount left. Parcels considered and room left. Lines consumed in each text.) If you find yourself needing the whole history, the state is wrong or the problem is not DP.
2. **Write the recurrence**: the answer for a state in terms of answers for smaller states, by considering the last (or first) decision.
3. **Base cases**: the states you can answer directly (amount 0, no parcels, an empty text), and a value for "impossible".
4. **Order**: memoize the recursion, or fill a table in an order where every dependency comes first.
5. **The answer and its reconstruction**: which cell holds the answer, and which choice table or walk-back produces the actual items, notes or lines.
6. **Cost**: number of states × work per state, for both time and memory. Then ask whether a smaller table (one or two rows) would do.

The problem-solving patterns in the next module, starting with [Frequency counters](https://zudojs.oyinlola.site/learn/pattern-frequency), are shortcuts for problems that look like they need search or DP but have a simpler structure; [Sliding window and prefix sums](https://zudojs.oyinlola.site/learn/pattern-sliding-window), for example, turns several "best run of consecutive days" problems into a single pass.

## Testing dynamic programming

A DP solution is a faster version of a brute-force one, so test it exactly that way: generate small random inputs, solve them with both, and compare. Also check that the reconstructed answer is *consistent* with the number: the chosen parcels fit and add up to the reported fee; the notes add up to the amount; the diff, applied to the old text, produces the new one.

dp-test.js

```ts
import { loadVan } from "./knapsack.js";
import { makeRandom } from "./parcels.js";

const random = makeRandom(2026);
let failures = 0;
const trials = 300;

for (let t = 0; t < trials; t++) {
  const n = Math.floor(random() * 9);
  const items = Array.from({ length: n }, (_, i) => ({ id: i, kg: 1 + Math.floor(random() * 10), naira: Math.floor(random() * 50) * 100 }));
  const capacity = Math.floor(random() * 25);

  let brute = 0;
  for (let mask = 0; mask < 1 << n; mask++) {
    let kg = 0;
    let naira = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        kg += items[i].kg;
        naira += items[i].naira;
      }
    }
    if (kg <= capacity) brute = Math.max(brute, naira);
  }

  const result = loadVan(items, capacity);
  const takenKg = result.taken.reduce((s, p) => s + p.kg, 0);
  const takenNaira = result.taken.reduce((s, p) => s + p.naira, 0);
  const unique = new Set(result.taken.map((p) => p.id)).size === result.taken.length;
  if (result.naira !== brute || takenNaira !== brute || takenKg > capacity || !unique) failures++;
}
console.log(`${failures === 0 ? "PASS" : "FAIL"} knapsack matches brute force on ${trials} random vans, ${failures} failures`);

const edge = loadVan([], 50);
console.log(`${edge.naira === 0 && edge.taken.length === 0 ? "PASS" : "FAIL"} no parcels`);
const tooHeavy = loadVan([{ id: 1, kg: 80, naira: 9000 }], 50);
console.log(`${tooHeavy.naira === 0 ? "PASS" : "FAIL"} nothing fits`);
```

Output of `node dp-test.js` and of the browser terminal

```ts
PASS knapsack matches brute force on 300 random vans, 0 failures
PASS no parcels
PASS nothing fits
```

The random inputs include zero parcels, zero capacity, parcels worth ₦0 and parcels heavier than the van, which are exactly the edges where off-by-one errors in `c - kg` or the table size show up. The consistency checks catch a reconstruction bug even when the number is right.

## Dynamic programming in production

- **Memory is usually the limit.** An n × m table of numbers takes about 8 × n × m bytes. A 10,000 × 10,000 LCS table is 800 MB. Use one or two rows when you only need the value, typed arrays (`Int32Array`) instead of arrays of numbers, or a different algorithm for large inputs.
- **Pseudo-polynomial tables.** Knapsack and coin change tables grow with the *size of the numbers*. Amounts in kobo are 100 times bigger than in naira; validate the maximum amount and capacity before allocating a table, or a request for ₦10 billion in change allocates billions of cells.
- **Memoization caches grow.** A memo map inside a long-lived service is a cache without a limit ([Closures in depth](https://zudojs.oyinlola.site/learn/js-closures#memoization) covers bounding one). Create the memo per call, as the functions in this lesson do, so it is released when the answer is returned.
- **Recursion depth.** Memoized recursion is as deep as the longest chain of states: fine for tens or hundreds, a stack overflow for 100,000. Tabulate for large inputs.
- **Use proven libraries for classic problems.** Text diffs, spell-check suggestions (edit distance) and route or packing optimisers exist as well-tested packages and services. Write your own DP when the problem is specific to your business, like the coupon or van rules, and test it against brute force.

## Practice

TRY IT YOURSELF

### Did you mean: edit distance

The shop's search should suggest "sneakers" when a customer types "sneekers". The **edit distance** (Levenshtein distance) between two words is the fewest single-letter insertions, deletions and replacements that turn one into the other. Define `D[i][j]` as the distance between the first `i` letters of one word and the first `j` of the other, write the recurrence, and use it to pick the closest product name.

**Show a solution**

edit-distance.js

```ts
function editDistance(a, b) {
  const D = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) D[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const replace = D[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      D[i][j] = Math.min(replace, D[i - 1][j] + 1, D[i][j - 1] + 1);
    }
  }
  return D[a.length][b.length];
}

const products = ["sneakers", "speakers", "sandals", "slippers", "stickers"];
for (const typed of ["sneekers", "sandal", "spekers"]) {
  const ranked = products.map((name) => ({ name, distance: editDistance(typed, name) })).sort((x, y) => x.distance - y.distance || x.name.localeCompare(y.name));
  console.log(`${typed}: did you mean ${ranked[0].name}? (distance ${ranked[0].distance}, next ${ranked[1].name} at ${ranked[1].distance})`);
}
```

Output of `node edit-distance.js` and of the browser terminal

```ts
sneekers: did you mean sneakers? (distance 1, next speakers at 2)
sandal: did you mean sandals? (distance 1, next sneakers at 6)
spekers: did you mean speakers? (distance 1, next sneakers at 2)
```

The base cases are the first row and column: turning a word into the empty string takes as many deletions as it has letters. Each cell takes the cheapest of three moves: replace (free if the letters match), delete a letter from `a`, or insert one from `b`. It is the LCS table with costs, O(n × m). A real search engine does not compare the query with every product; it narrows the candidates first (for example with a trie, [Tries](https://zudojs.oyinlola.site/learn/dsa-tries)) and then ranks them by distance.

TRY IT YOURSELF

### The cheapest transport passes

A dispatch rider works on known days of the month. A one-day bus pass costs ₦1,000, a 7-day pass ₦5,000 and a 30-day pass ₦15,000; a pass bought on day d covers days d to d + 6 (or d + 29). Find the cheapest way to cover all working days. Define `cost[d]` as the cheapest way to cover all working days from day d to the end.

**Show a solution**

passes.js

```ts
function cheapestPasses(days, prices = { 1: 1000, 7: 5000, 30: 15000 }) {
  const working = new Set(days);
  const last = Math.max(...days);
  const cost = new Array(last + 32).fill(0);
  const choice = [];
  for (let d = last; d >= 1; d--) {
    if (!working.has(d)) {
      cost[d] = cost[d + 1];
      continue;
    }
    cost[d] = Infinity;
    for (const [length, naira] of Object.entries(prices)) {
      const total = naira + cost[d + Number(length)];
      if (total < cost[d]) {
        cost[d] = total;
        choice[d] = Number(length);
      }
    }
  }
  const bought = [];
  for (let d = 1; d <= last; ) {
    if (!working.has(d)) d++;
    else {
      bought.push(`day ${d}: ${choice[d]}-day pass`);
      d += choice[d];
    }
  }
  return { naira: cost[1], bought };
}

const light = cheapestPasses([1, 4, 5, 6, 7, 8, 9, 20]);
console.log(`₦${light.naira}: ${light.bought.join(", ")}`);
const busy = cheapestPasses([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16, 18, 20, 22, 25, 27, 30]);
console.log(`₦${busy.naira}: ${busy.bought.join(", ")}`);
```

Output of `node passes.js` and of the browser terminal

```ts
₦7000: day 1: 1-day pass, day 4: 7-day pass, day 20: 1-day pass
₦15000: day 1: 30-day pass
```

The table is filled backwards, from the last day to the first, because `cost[d]` depends on later days. Non-working days cost nothing extra. The array is padded by 31 so `d + 30` never reads past the end (those entries stay 0: nothing left to cover). For a light schedule, day passes plus one weekly pass win; for a busy month, one 30-day pass does.

TRY IT YOURSELF

### Two vans, equal loads

Two vans leave together, and the dispatcher wants their loads as equal as possible so neither driver is overloaded. Given parcel weights, find the heaviest load for the first van that is at most half the total (the second van takes the rest). This is a subset-sum DP: `possible[w]` is true if some set of parcels weighs exactly `w`.

**Show a solution**

two-vans.js

```ts
function splitLoads(weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  const half = Math.floor(total / 2);
  const possible = new Array(half + 1).fill(false);
  possible[0] = true;
  for (const w of weights) {
    for (let s = half; s >= w; s--) {
      if (possible[s - w]) possible[s] = true;
    }
  }
  let first = half;
  while (!possible[first]) first--;
  return { first, second: total - first };
}

console.log(splitLoads([32, 18, 45, 27, 11, 38, 21]));
console.log(splitLoads([100, 5, 5]));
```

Output of `node two-vans.js` and of the browser terminal

```json
{ first: 95, second: 97 }
{ first: 10, second: 100 }
```

It is the one-row knapsack with true/false instead of fees, and the loop goes *down* for the same reason: each parcel may be used once. O(n × total) time, O(total) memory. When one parcel is heavier than all the others together, as in the second case, no split can be close, and the table shows the best there is.

## Summary

- Dynamic programming applies when the best answer is built from best answers to subproblems (optimal substructure) and the same subproblems come up again and again (overlap). Solve each subproblem once. Cost = number of states × work per state.
- Memoization adds a cache to the natural recursion (top-down); tabulation fills a table from the base cases up in dependency order (bottom-up), with no recursion limit and easy space savings.
- Coin change: `fewest[a] = 1 + min fewest[a − v]` with `Infinity` for impossible, and a choice table to name the notes. Counting ways: values in the outer loop counts combinations; amounts outside counts sequences.
- 0/1 knapsack: `best[i][c]` = leave parcel i, or take it with less room. O(n × C), pseudo-polynomial. One row going down is 0/1; going up silently allows repeats.
- LCS: `L[i][j]` grows by one on equal items and otherwise takes the larger neighbour; walking back gives a diff. Edit distance is the same table with costs.
- Define the state, recurrence, base cases, order, answer and reconstruction; then test against brute force on small random inputs and check the reconstruction adds up.

Next: the problem-solving patterns module begins with [Frequency counters](https://zudojs.oyinlola.site/learn/pattern-frequency), the first of several named patterns that let you recognise a problem's shape and reach a linear solution without search or tables.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
