---
title: "Backtracking — ZudoJS Academy"
description: "Find every valid coupon combination, gift bundle and delivery route by choosing, exploring and undoing, then prune dead branches to solve N-queens and sudoku."
source: https://zudojs.oyinlola.site/learn/dsa-backtracking
---

LEVEL 3 · LESSON 15 OF 21

Algorithms Core

# Backtracking

Find every valid coupon combination, gift bundle and delivery route by choosing, exploring and undoing, then prune dead branches to solve N-queens and sudoku.

- **55 min** to read and try
- **You need:** Recursion, Greedy algorithms, and Big O and complexity
- **You build:** A coupon combiner that lists and ranks every valid discount combination, a gift-bundle finder, a shortest delivery route search with branch and bound, and an N-queens and sudoku solver

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Describe a search as states, choices and constraints, and write it with the choose, explore, undo template
- Generate subsets, combinations and permutations without duplicates, and predict how many there are
- Prune branches that cannot lead to a valid or better answer, and measure the nodes saved
- Solve constraint puzzles such as N-queens and sudoku, and pick the most constrained choice first
- Avoid the classic backtracking bugs: shared arrays, missing undo, duplicate results and unbounded searches

## The problem: which coupons can go together?

An online shop runs seven coupon codes at once. The checkout lets a customer stack several, but marketing has rules:

- at most three coupons per order,
- at most one *percentage* coupon (10% off, 15% off),
- `FLASH3000` cannot be combined with `FREESHIP`,
- the total discount can never exceed 40% of the cart.

Two questions come up every day. Support wants to see *every* valid combination for a given cart, to answer "why didn't my code work?". The checkout wants the *best* valid combination, to apply it automatically. Greedy ([Greedy algorithms](https://zudojs.oyinlola.site/learn/dsa-greedy)) is tempting, "take the biggest discount first", but the rules interact: taking the biggest coupon can rule out two others that together are worth more. You need to consider combinations, and the rules are too irregular for a neat formula.

**Backtracking** is the general technique for this kind of problem. It builds a candidate answer one choice at a time, and as soon as a partial answer breaks a rule, it **backtracks**: undoes the last choice and tries the next alternative. It explores every possibility that could work, and skips every branch that provably cannot.

## The template: choose, explore, undo

Every backtracking algorithm has the same parts:

- a **state**: the partial answer so far (the coupons chosen, the queens placed, the route driven),
- the **choices** available from that state (the next coupon to include or skip, the next column, the next stop),
- **constraints** that a state must satisfy (the rules),
- a **goal**: when the state is a complete answer.

```ts
function explore(state):
  if state breaks a constraint: return          (prune)
  if state is complete: record it; return
  for each choice:
    apply the choice to state                     (choose)
    explore(state)                                (explore)
    remove the choice from state                  (undo)
```

The calls form a **decision tree**: the root is the empty state, each edge is one choice, and each leaf is a complete candidate. Backtracking is a depth-first walk of that tree ([Graph search](https://zudojs.oyinlola.site/learn/dsa-graph-search#dfs)), and the "undo" step is what makes it a walk rather than a copy: the same state object is changed going down and changed back coming up, so the whole search needs only memory proportional to the depth of the tree.

```json
                       { }
             include A /   \ skip A
                 {A}           { }
         incl B /   \ skip  incl B /  \ skip
          {A,B}     {A}      {B}      { }
          /  \      /  \     /  \     /  \
      {A,B,C}{A,B}{A,C}{A} {B,C}{B} {C}  { }
```

The decision tree for subsets of three coupons A, B and C: each level decides one coupon, and the 2³ = 8 leaves are all the subsets.

## Subsets: every coupon combination

Start without the rules, and list every subset of the coupons. At depth `i`, the only decision is whether coupon `i` is in or out.

subsets.js

```ts
function subsets(items) {
  const results = [];
  const chosen = [];
  function explore(i) {
    if (i === items.length) {
      results.push([...chosen]);
      return;
    }
    chosen.push(items[i]);
    explore(i + 1);
    chosen.pop();
    explore(i + 1);
  }
  explore(0);
  return results;
}

const all = subsets(["WELCOME10", "FREESHIP", "LESS500"]);
for (const combo of all) console.log(combo.length === 0 ? "(no coupon)" : combo.join(" + "));
console.log(`${all.length} subsets`);
for (const n of [7, 10, 20]) console.log(`${n} coupons: ${subsets(Array.from({ length: n }, (_, i) => i)).length} subsets`);
```

Output of `node subsets.js` and of the browser terminal

```ts
WELCOME10 + FREESHIP + LESS500
WELCOME10 + FREESHIP
WELCOME10 + LESS500
WELCOME10
FREESHIP + LESS500
FREESHIP
LESS500
(no coupon)
8 subsets
7 coupons: 128 subsets
10 coupons: 1024 subsets
20 coupons: 1048576 subsets
```

Every item doubles the number of subsets: 2n. Twenty coupons already give over a million combinations, and forty would give a trillion. Two details carry every backtracking function in this lesson:

- `results.push([...chosen])` stores a *copy*. `chosen` keeps changing as the search continues; storing the array itself would store a reference to something that will be empty by the end. The [bugs section](#bugs) shows it happen.
- `chosen.pop()` after the recursive call is the undo. It restores exactly the state that existed before `push`, so the "skip" branch starts from the right place.

## Adding the rules, and pruning

REASON IT OUT

### Before you add the rules

Before writing the coupon search, think about the rules. The search builds a combination one coupon at a time. If a partial combination already breaks a rule, can adding more coupons ever make it valid again? Is that true for every rule on the list? What would it mean for the search if one rule were "at least two coupons"? Also: the checkout calls this on every page load. What is the worst case, and what happens when marketing adds its 30th coupon?

**Show the reasoning**

- **Every rule here only gets worse as coupons are added.** Four coupons stay more than three, two percentage coupons stay two, FLASH3000 and FREESHIP stay together, and the discount only grows. Rules like this are called **monotone**. For monotone rules, once a partial combination is invalid, every extension of it is invalid, so the search can stop exploring that branch at once. That is **pruning**.
- **"At least two coupons" is not monotone**: a single coupon breaks it, but adding one fixes it. Such a rule may only be checked at the leaves (on complete candidates), never used to prune. Pruning on a non-monotone rule silently loses valid answers.
- **Worst case**: without pruning, 2n leaves. With 30 coupons that is a billion, on every page load. The "at most three coupons" rule is what saves you: no valid combination has more than three coupons, so there are at most 4,526 valid answers (the combinations of zero to three of 30 coupons), and pruning cuts the search from about two billion nodes to about 64,000. Know which rule keeps your search small, and put a hard limit on the input size anyway.

coupons.js

```ts
export const coupons = [
  { code: "WELCOME10", kind: "percent", value: 10 },
  { code: "PAYDAY15", kind: "percent", value: 15 },
  { code: "LESS2000", kind: "fixed", value: 2000 },
  { code: "LESS500", kind: "fixed", value: 500 },
  { code: "FREESHIP", kind: "shipping", value: 1500 },
  { code: "FLASH3000", kind: "fixed", value: 3000 },
  { code: "BUNDLE1000", kind: "fixed", value: 1000 },
];

export function discountOf(combo, cart) {
  let naira = 0;
  for (const c of combo) naira += c.kind === "percent" ? Math.round((cart * c.value) / 100) : c.value;
  return naira;
}

export function brokenRule(combo, cart) {
  if (combo.length > 3) return "more than 3 coupons";
  if (combo.filter((c) => c.kind === "percent").length > 1) return "two percentage coupons";
  const codes = new Set(combo.map((c) => c.code));
  if (codes.has("FLASH3000") && codes.has("FREESHIP")) return "FLASH3000 with FREESHIP";
  if (discountOf(combo, cart) > cart * 0.4) return "discount above 40%";
  return null;
}

export function validCombos(list, cart, { prune = true } = {}) {
  const results = [];
  const chosen = [];
  let nodes = 0;
  function explore(i) {
    nodes++;
    if (prune && brokenRule(chosen, cart)) return;
    if (i === list.length) {
      if (!brokenRule(chosen, cart)) results.push([...chosen]);
      return;
    }
    chosen.push(list[i]);
    explore(i + 1);
    chosen.pop();
    explore(i + 1);
  }
  explore(0);
  return { results, nodes };
}
```

Discounts are whole naira: percentage coupons are rounded once, when computed. `brokenRule` returns the name of the rule that failed, not just `true`, so support can tell a customer *why*.

checkout.js

```ts
import { brokenRule, coupons, discountOf, validCombos } from "./coupons.js";

const cart = 20000;
const pruned = validCombos(coupons, cart);
const unpruned = validCombos(coupons, cart, { prune: false });
console.log(`${pruned.results.length} valid combinations for a ₦${cart} cart`);
console.log(`nodes explored: ${pruned.nodes} with pruning, ${unpruned.nodes} without`);

const ranked = pruned.results
  .map((combo) => ({ codes: combo.map((c) => c.code).join(" + ") || "(none)", naira: discountOf(combo, cart) }))
  .sort((a, b) => b.naira - a.naira || a.codes.localeCompare(b.codes));
for (const r of ranked.slice(0, 3)) console.log(`₦${r.naira}: ${r.codes}`);

const byCode = (...codes) => codes.map((code) => coupons.find((c) => c.code === code));
console.log("why not?", brokenRule(byCode("FLASH3000", "FREESHIP"), cart));
console.log("why not?", brokenRule(byCode("WELCOME10", "PAYDAY15"), cart));
console.log("why not?", brokenRule(byCode("FLASH3000", "LESS2000", "PAYDAY15"), 12000));
```

Output of `node checkout.js` and of the browser terminal

```ts
52 valid combinations for a ₦20000 cart
nodes explored: 157 with pruning, 255 without
₦8000: PAYDAY15 + LESS2000 + FLASH3000
₦7000: PAYDAY15 + FLASH3000 + BUNDLE1000
₦7000: WELCOME10 + LESS2000 + FLASH3000
why not? FLASH3000 with FREESHIP
why not? two percentage coupons
why not? discount above 40%
```

Both searches find the same 52 valid combinations, but the pruned one explored 157 nodes instead of 255. The saving grows quickly with the number of coupons, because the "at most three" rule cuts off every branch at depth four. Here a greedy "biggest coupon that still fits the rules" would happen to reach the same ₦8,000, but nothing guarantees it: change a rule or the cart and it can miss, and only the search can tell you whether the greedy answer was really the best.

## Combinations and gift bundles

A **combination** is a subset of a fixed size, where order does not matter: {rice, oil, sugar} is the same bundle as {sugar, rice, oil}. The standard way to avoid generating the same set in several orders is to only ever choose items *after* the last one chosen, by passing a start index.

The shop wants gift bundles that cost *exactly* ₦10,000, using each product at most once. The prices are sorted, which enables a second kind of pruning: if the next product is already more than the money left, every product after it is too, so the loop can `break` instead of `continue`.

bundles.js

```ts
const products = [
  { name: "sugar", naira: 1200 }, { name: "tea", naira: 1800 }, { name: "biscuits", naira: 2500 },
  { name: "milk", naira: 3000 }, { name: "oil", naira: 4500 }, { name: "rice", naira: 5500 },
  { name: "honey", naira: 6000 }, { name: "chocolate", naira: 7000 },
].sort((a, b) => a.naira - b.naira);

function bundles(items, budget) {
  const results = [];
  const chosen = [];
  let nodes = 0;
  function explore(start, left) {
    nodes++;
    if (left === 0) {
      results.push(chosen.map((p) => p.name).join(" + "));
      return;
    }
    for (let i = start; i < items.length; i++) {
      if (items[i].naira > left) break;
      chosen.push(items[i]);
      explore(i + 1, left - items[i].naira);
      chosen.pop();
    }
  }
  explore(0, budget);
  return { results, nodes };
}

const { results, nodes } = bundles(products, 10000);
for (const bundle of results) console.log(bundle);
console.log(`${results.length} bundles, ${nodes} nodes explored, 2^${products.length} = ${2 ** products.length} subsets in total`);

function choose(n, k) {
  let count = 0;
  (function pick(start, left) {
    if (left === 0) return void count++;
    for (let i = start; i <= n - left; i++) pick(i + 1, left - 1);
  })(0, k);
  return count;
}
console.log("3-item bundles from 8 products:", choose(8, 3), " from 20:", choose(20, 3));
```

Output of `node bundles.js` and of the browser terminal

```ts
sugar + tea + biscuits + oil
sugar + tea + chocolate
biscuits + milk + oil
milk + chocolate
oil + rice
5 bundles, 51 nodes explored, 2^8 = 256 subsets in total
3-item bundles from 8 products: 56  from 20: 1140
```

The start index guarantees each bundle is produced once, in price order. The `break` on a too-expensive product, plus stopping when the budget is reached exactly, keeps the search to a small fraction of all 256 subsets. The last line counts combinations of a fixed size k from n items. That number, written C(n, k) and read "n choose k", is n! / (k! (n − k)!): 56 for 3 of 8, 1,140 for 3 of 20. The loop bound `i <= n - left` is itself a prune: it stops when there are not enough items left to fill the remaining places.

## Permutations and the delivery route

A rider leaves the depot, visits seven customers and returns. The customers are on a city grid, and the distance between two points is the number of blocks between them (the horizontal plus the vertical distance, called the **Manhattan distance**). Which order of visits is shortest? Every order is a **permutation** of the seven stops: 7! = 5,040 of them. With n stops there are n! orders, which grows even faster than 2n: 10 stops give 3.6 million, 15 give 1.3 trillion.

This is the famous travelling salesman problem, for which no fast exact algorithm is known. For a handful of stops, backtracking with pruning is exact and quick. The pruning here is called **branch and bound**: keep the best complete route found so far, and abandon any partial route whose length, plus a **lower bound** on what is still to come, cannot beat it. The lower bound used here is simple: whatever else happens, the rider still has to get back to the depot from where they are now.

route.js

```ts
export const stops = { depot: [0, 0], A: [2, 6], B: [5, 1], C: [7, 7], D: [1, 3], E: [6, 4], F: [3, 8], G: [8, 2] };
export const blocks = (a, b) => Math.abs(stops[a][0] - stops[b][0]) + Math.abs(stops[a][1] - stops[b][1]);
const customers = Object.keys(stops).filter((s) => s !== "depot");

export function nearestNeighbourRoute() {
  const route = ["depot"];
  const left = new Set(customers);
  let length = 0;
  while (left.size > 0) {
    let next = null;
    for (const s of left) if (next === null || blocks(route.at(-1), s) < blocks(route.at(-1), next)) next = s;
    length += blocks(route.at(-1), next);
    route.push(next);
    left.delete(next);
  }
  return { route: [...route, "depot"], length: length + blocks(route.at(-1), "depot") };
}

export function shortestRoute({ prune = false, bound = false, startWith = Infinity } = {}) {
  let best = { route: null, length: startWith };
  let nodes = 0;
  const route = ["depot"];
  const used = new Set();
  function explore(length) {
    nodes++;
    const atLeast = bound ? length + blocks(route.at(-1), "depot") : length;
    if (prune && atLeast >= best.length) return;
    if (route.length === customers.length + 1) {
      const total = length + blocks(route.at(-1), "depot");
      if (total < best.length) best = { route: [...route, "depot"], length: total };
      return;
    }
    for (const s of customers) {
      if (used.has(s)) continue;
      used.add(s);
      route.push(s);
      explore(length + blocks(route.at(-2), s));
      route.pop();
      used.delete(s);
    }
  }
  explore(0);
  return { ...best, nodes };
}
```

The permutation search uses a `used` set instead of a start index, because in a permutation every remaining stop can come next; order matters here. Undo removes the stop from both `route` and `used`.

rider.js

```ts
import { nearestNeighbourRoute, shortestRoute } from "./route.js";

const greedy = nearestNeighbourRoute();
console.log(`greedy nearest-next: ${greedy.length} blocks: ${greedy.route.join(" > ")}`);

const plain = shortestRoute();
console.log(`every order:         ${plain.length} blocks: ${plain.route.join(" > ")} (${plain.nodes} nodes)`);

for (const [label, options] of [
  ["prune on length", { prune: true }],
  ["+ return-to-depot bound", { prune: true, bound: true }],
  ["+ start from greedy", { prune: true, bound: true, startWith: greedy.length + 1 }],
]) {
  const r = shortestRoute(options);
  console.log(`${label.padEnd(24)} ${r.length} blocks, ${r.nodes} nodes`);
}
```

Output of `node rider.js` and of the browser terminal

```ts
greedy nearest-next: 38 blocks: depot > D > A > F > C > E > B > G > depot
every order:         34 blocks: depot > B > G > E > C > F > A > D > depot (13700 nodes)
prune on length          34 blocks, 6491 nodes
+ return-to-depot bound  34 blocks, 2293 nodes
+ start from greedy      34 blocks, 1998 nodes
```

The greedy "go to the nearest customer next" route, the kind of fast heuristic [Greedy algorithms](https://zudojs.oyinlola.site/learn/dsa-greedy#production) described for delivery routes, is 4 blocks longer than the best. The exhaustive search finds the best by visiting every node of the permutation tree. Each pruning idea cuts the tree further, and the answer never changes, because pruning only discards branches that cannot win. Starting from the greedy route's length (plus one, so that a route of the same length can still be found and recorded) gives the search a good bound before it has found anything itself: a fast heuristic and an exact search working together.

Even so, pruning does not change the worst case: some inputs defeat any bound, and the search is still O(n!) in theory. Route planners for real fleets with dozens of stops use heuristics and dedicated solvers. A dynamic programming method (the Held-Karp algorithm, built on the ideas of the next lesson) solves it exactly in O(2n × n²), which is far better than n! but still exponential.

## N-queens: pruning with constraint sets

Puzzles are where backtracking is easiest to see, because the constraints are crisp. The **N-queens** puzzle asks for every way to place n queens on an n × n chessboard so that no two attack each other: no two in the same row, column or diagonal. (A real version of the same shape: placing n security cameras in a hall so that no two watch the same row, column or diagonal line.)

Placing one queen per row handles the row rule by construction. For the rest, keep three sets of what is already taken: columns, "down" diagonals (where `row - col` is constant) and "up" diagonals (where `row + col` is constant). Checking a square is then three O(1) lookups.

queens.js

```ts
function queens(n) {
  const columns = new Set();
  const down = new Set();
  const up = new Set();
  const placed = [];
  let solutions = 0;
  let nodes = 0;
  let first = null;

  function placeRow(row) {
    nodes++;
    if (row === n) {
      solutions++;
      first ??= [...placed];
      return;
    }
    for (let col = 0; col < n; col++) {
      if (columns.has(col) || down.has(row - col) || up.has(row + col)) continue;
      columns.add(col);
      down.add(row - col);
      up.add(row + col);
      placed.push(col);
      placeRow(row + 1);
      placed.pop();
      columns.delete(col);
      down.delete(row - col);
      up.delete(row + col);
    }
  }
  placeRow(0);
  return { solutions, nodes, first };
}

const eight = queens(8);
for (const col of eight.first) console.log(".".repeat(col) + "Q" + ".".repeat(7 - col));
for (const n of [4, 6, 8, 10]) {
  const { solutions, nodes } = queens(n);
  console.log(`n=${n}: ${solutions} solutions, ${nodes} nodes (n^n = ${n ** n})`);
}
```

Output of `node queens.js` and of the browser terminal

```ts
Q.......
....Q...
.......Q
.....Q..
..Q.....
......Q.
.Q......
...Q....
n=4: 2 solutions, 17 nodes (n^n = 256)
n=6: 4 solutions, 153 nodes (n^n = 46656)
n=8: 92 solutions, 2057 nodes (n^n = 16777216)
n=10: 724 solutions, 35539 nodes (n^n = 10000000000)
```

Without any pruning, trying one queen per row in any column would be nn placements: 16.7 million for n = 8. Checking constraints at every step cuts that to about 2,000 nodes, because most partial boards die after a few rows. That is the whole idea of backtracking in one number.

## Sudoku: choose the most constrained cell

A sudoku grid has 81 cells; each row, column and 3 × 3 box must contain the digits 1 to 9 once each. The backtracking solver picks an empty cell, tries each digit that does not clash, and recurses. The interesting question is *which* empty cell to try next. The first empty cell in reading order is simple. A better rule is to take the cell with the **fewest** legal digits: if a cell has only one option, filling it costs nothing; if a cell has zero options, this branch is dead and you find out immediately. This is the **most constrained variable** heuristic, and it is the single most effective trick for constraint problems.

sudoku.js

```ts
export function solveSudoku(puzzle, { pick = "fewest" } = {}) {
  if (!/^[1-9.]{81}$/.test(puzzle)) throw new Error("a puzzle is 81 characters of 1-9 or .");
  const grid = [...puzzle].map((ch) => (ch === "." ? 0 : Number(ch)));
  const rows = Array.from({ length: 9 }, () => new Set());
  const cols = Array.from({ length: 9 }, () => new Set());
  const boxes = Array.from({ length: 9 }, () => new Set());
  const where = (i) => [Math.floor(i / 9), i % 9, Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3)];
  const set = (i, digit, on) => {
    const [r, c, b] = where(i);
    for (const group of [rows[r], cols[c], boxes[b]]) on ? group.add(digit) : group.delete(digit);
    grid[i] = on ? digit : 0;
  };
  for (let i = 0; i < 81; i++) {
    if (grid[i] === 0) continue;
    const [r, c, b] = where(i);
    if (rows[r].has(grid[i]) || cols[c].has(grid[i]) || boxes[b].has(grid[i])) throw new Error(`clash at cell ${i}`);
    set(i, grid[i], true);
  }
  const options = (i) => {
    const [r, c, b] = where(i);
    return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => !rows[r].has(d) && !cols[c].has(d) && !boxes[b].has(d));
  };

  let guesses = 0;
  function fill() {
    let cell = -1;
    let choices = null;
    for (let i = 0; i < 81; i++) {
      if (grid[i] !== 0) continue;
      const here = options(i);
      if (choices === null || here.length < choices.length) {
        cell = i;
        choices = here;
      }
      if (pick === "first" || here.length <= 1) break;
    }
    if (cell === -1) return true;
    for (const digit of choices) {
      guesses++;
      set(cell, digit, true);
      if (fill()) return true;
      set(cell, digit, false);
    }
    return false;
  }
  return fill() ? { solution: grid.join(""), guesses } : null;
}
```

The three arrays of sets play the role of the column and diagonal sets in N-queens. The setup loop rejects a puzzle that already breaks a rule, so the solver never spends time on impossible input. When the scan finds a cell with one option or none, it stops scanning, since no cell can be more constrained.

solve.js

```ts
import { solveSudoku } from "./sudoku.js";

const puzzle = "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";
const { solution, guesses } = solveSudoku(puzzle);
for (let r = 0; r < 9; r++) console.log(solution.slice(r * 9, r * 9 + 9).replace(/(...)(?!$)/g, "$1 "));

const firstEmpty = solveSudoku(puzzle, { pick: "first" });
console.log(`guesses: fewest-options cell ${guesses}, first empty cell ${firstEmpty.guesses}, same solution ${firstEmpty.solution === solution}`);

const hard = "8..........36......7..9.2...5...7.......457.....1...3...1....68..85...1..9....4..";
console.log(`a hard puzzle: ${solveSudoku(hard).guesses} guesses with the fewest-options rule`);
try {
  solveSudoku("55" + ".".repeat(79));
} catch (error) {
  console.log("rejected:", error.message);
}
```

Output of `node solve.js` and of the browser terminal

```ts
534 678 912
672 195 348
198 342 567
859 761 423
426 853 791
713 924 856
961 537 284
287 419 635
345 286 179
guesses: fewest-options cell 51, first empty cell 4208, same solution true
a hard puzzle: 13810 guesses with the fewest-options rule
rejected: clash at cell 1
```

The same search, with a better choice of what to try next, does a fraction of the work. For the classic puzzle, the fewest-options rule never has to guess wrongly at all: at every step some cell has exactly one legal digit. The "hard" puzzle was designed to defeat human solving techniques, and it needs real backtracking, but it is still solved in a moment.

## The classic backtracking bugs

### Storing the state instead of a copy

no-copy.js

```ts
const results = [];
const chosen = [];
function explore(items, i) {
  if (i === items.length) {
    results.push(chosen);
    return;
  }
  chosen.push(items[i]);
  explore(items, i + 1);
  chosen.pop();
  explore(items, i + 1);
}
explore(["LESS500", "FREESHIP"], 0);
console.log(JSON.stringify(results));
console.log("all the same array:", results.every((r) => r === chosen));
```

Output of `node no-copy.js` and of the browser terminal

```json
[[],[],[],[]]
all the same array: true
```

Four results, all the very same array, which the undo steps have emptied by the end. Always record `[...chosen]` (or build a new value, like a joined string).

### Forgetting to undo

no-undo.js

```ts
function orders(stops, undo) {
  const results = [];
  const route = [];
  const used = new Set();
  function explore() {
    if (route.length === stops.length) {
      results.push(route.join(">"));
      return;
    }
    for (const s of stops) {
      if (used.has(s)) continue;
      used.add(s);
      route.push(s);
      explore();
      route.pop();
      if (undo) used.delete(s);
    }
  }
  explore();
  return results;
}

console.log("with undo:   ", orders(["A", "B", "C"], true).join(" "));
console.log("without undo:", orders(["A", "B", "C"], false).join(" "));
```

Output of `node no-undo.js` and of the browser terminal

```ts
with undo:    A>B>C A>C>B B>A>C B>C>A C>A>B C>B>A
without undo: A>B>C
```

Without `used.delete(s)`, a stop stays "used" after the branch that chose it has finished, so later branches cannot pick it. The search silently returns one route instead of six. Every change made in the "choose" step needs a matching change in the "undo" step; with several pieces of state (`route` *and* `used`, or three constraint sets), it is easy to forget one.

### Duplicate inputs, duplicate results

If the same product appears twice in the list (two jars of honey from different suppliers at the same price), the bundle search produces the same bundle twice, once with each jar. When duplicates matter, sort the input so equal items sit next to each other (by price, then name), and skip an item that equals the previous one at the same depth: `if (i > start && items[i].name === items[i - 1].name && items[i].naira === items[i - 1].naira) continue;`. The branch that took the first jar already covers every bundle with one jar, so starting another branch with the second jar would only repeat it. Compare the whole item, not just the price: two different products that happen to cost the same are not duplicates. The test below checks for duplicates explicitly.

### Unbounded searches

Backtracking is exponential in the worst case, and the worst case can arrive with the next change to the data. A coupon search that is instant with 7 coupons may hang the checkout with 40. Cap the input size, count nodes and stop past a budget, or run the search off the request path.

## Stopping early: the first few results

Support often only needs the first few valid routes or combinations, not all of them. Building the full list and then taking three wastes almost all the work. Instead, hand each result to a callback as soon as it is found, and let the callback say "stop" by returning `true`. Every level of the search then checks the answer of the level below and returns at once:

first-few.js

```ts
function orders(stops, onRoute) {
  const route = [];
  const used = new Set();
  let nodes = 0;
  function explore() {
    nodes++;
    if (route.length === stops.length) return onRoute(route.join(" > "));
    for (const s of stops) {
      if (used.has(s)) continue;
      used.add(s);
      route.push(s);
      const stop = explore();
      route.pop();
      used.delete(s);
      if (stop) return true;
    }
    return false;
  }
  explore();
  return nodes;
}

const first = [];
const nodes = orders(["Ikeja", "Yaba", "Lekki", "Ajah", "Epe", "Ikorodu"], (route) => {
  first.push(route);
  return first.length === 3;
});
console.log(first.join("\n"));
console.log(`${nodes} nodes visited to get 3 of the 720 routes`);
```

Output of `node first-few.js` and of the browser terminal

```ts
Ikeja > Yaba > Lekki > Ajah > Epe > Ikorodu
Ikeja > Yaba > Lekki > Ajah > Ikorodu > Epe
Ikeja > Yaba > Lekki > Epe > Ajah > Ikorodu
12 nodes visited to get 3 of the 720 routes
```

The undo still runs before the early return, so the shared state is clean if the caller searches again. The same pattern answers "find any solution" questions: return `true` from the first result. The sudoku solver above does exactly this with `if (fill()) return true`. In Advanced JavaScript, [Generators](https://zudojs.oyinlola.site/learn/js-generators) show another way to produce results one at a time, where the caller simply stops asking for more.

## Testing a backtracking search

Three kinds of checks catch almost every backtracking bug:

- **Counts against formulas**: subsets of n items must number 2n, permutations n!, combinations C(n, k).
- **Every result is valid, and none is repeated.**
- **Pruned equals brute force**: on small inputs, the pruned search must return exactly what "generate everything, then filter" returns. Pruning that drops a valid answer (for example, pruning on a non-monotone rule) shows up here.

coupon-test.js

```ts
import { brokenRule, coupons, validCombos } from "./coupons.js";

function check(label, ok) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
}

const key = (combo) => combo.map((c) => c.code).join("+");

for (const cart of [3000, 8000, 20000, 100000]) {
  const pruned = validCombos(coupons, cart).results.map(key).sort();
  const brute = validCombos(coupons, cart, { prune: false }).results.map(key).sort();
  check(`cart ₦${cart}: pruned search equals brute force (${pruned.length} combinations)`, pruned.join() === brute.join());
}

const results = validCombos(coupons, 20000).results;
check("every result obeys every rule", results.every((combo) => brokenRule(combo, 20000) === null));
check("no duplicate combinations", new Set(results.map(key)).size === results.length);
check("unpruned search visits all 2^8 - 1 nodes of the tree", validCombos(coupons, 20000, { prune: false }).nodes === 2 ** 8 - 1);
check("empty coupon list gives only 'no coupon'", validCombos([], 5000).results.length === 1);
```

Output of `node coupon-test.js` and of the browser terminal

```ts
PASS cart ₦3000: pruned search equals brute force (7 combinations)
PASS cart ₦8000: pruned search equals brute force (26 combinations)
PASS cart ₦20000: pruned search equals brute force (52 combinations)
PASS cart ₦100000: pruned search equals brute force (52 combinations)
PASS every result obeys every rule
PASS no duplicate combinations
PASS unpruned search visits all 2^8 - 1 nodes of the tree
PASS empty coupon list gives only 'no coupon'
```

The node count check uses a fact about the decision tree: a full binary tree with 27 leaves has 28 − 1 nodes in total. The cart sizes include a tiny cart, where the 40% rule rejects almost everything, and a huge one, where it rejects nothing: the two ends where pruning logic most often goes wrong.

## Backtracking in production

- **Know your n.** Backtracking is fine when the input is small by nature (a cart's coupons, a day's stops for one rider, a 9 × 9 grid) or when strong constraints keep the tree small. Put an explicit limit on the input, and reject or degrade gracefully beyond it.
- **Budgets and timeouts.** Count nodes, and stop with the best answer found so far when the budget runs out. For branch and bound that is still a useful answer, just not a proven optimum; say so.
- **Use a solver when the problem is big.** Timetabling, staff rosters and vehicle routing with time windows are backtracking problems at heart, but industrial ones need constraint solvers, SAT solvers or integer programming libraries, which combine backtracking with much smarter pruning and learning.
- **Look for overlapping subproblems.** If different branches keep solving the same sub-question ("the best bundle from the remaining products with ₦4,500 left"), the search is doing the same work many times. Remembering those answers turns exponential backtracking into dynamic programming, which is the next lesson.
- **Keep rules in one place.** The `brokenRule` function is used by the search, the tests and the support tool. When marketing changes a rule, there is one function to change, and the brute-force test tells you whether pruning is still safe.

## Practice

TRY IT YOURSELF

### Change from a till that is running low

In [Greedy algorithms](https://zudojs.oyinlola.site/learn/dsa-greedy#change-fails), largest-note-first failed when the till had one ₦500 and three ₦200 notes. Write a backtracking search that finds the fewest notes for an amount from a till with limited counts, pruning any branch that already uses as many notes as the best answer found so far. Try ₦600, ₦900 and ₦300.

**Show a solution**

till.js

```ts
function fewestNotes(amount, till) {
  const notes = [...till].sort((a, b) => b[0] - a[0]);
  let best = null;
  const handed = [];
  function explore(i, left) {
    if (best !== null && handed.length >= best.length) return;
    if (left === 0) {
      best = [...handed];
      return;
    }
    if (i === notes.length) return;
    const [value, count] = notes[i];
    const most = Math.min(count, Math.floor(left / value));
    for (let use = most; use >= 0; use--) {
      for (let k = 0; k < use; k++) handed.push(value);
      explore(i + 1, left - use * value);
      for (let k = 0; k < use; k++) handed.pop();
    }
  }
  explore(0, amount);
  return best;
}

const till = [[500, 1], [200, 3], [100, 0]];
for (const amount of [600, 900, 300]) {
  const notes = fewestNotes(amount, till);
  console.log(`₦${amount}: ${notes ? notes.join(" + ") : "cannot make this amount"}`);
}
```

Output of `node till.js` and of the browser terminal

```ts
₦600: 200 + 200 + 200
₦900: 500 + 200 + 200
₦300: cannot make this amount
```

Each level decides how many notes of one value to use, trying the most first, so the first answer found is usually good and the bound prunes the rest early. ₦300 is impossible with no ₦100s: the search tries everything and correctly reports it. Greedy and backtracking work together here the way they did in the route search: greedy order first, exhaustive safety net behind it.

TRY IT YOURSELF

### Seating guests who do not get along

Six guests sit in a row at a dinner. Some pairs must not sit next to each other. Count the valid seatings and print the first one, pruning as soon as the last two guests seated are a forbidden pair. Compare the nodes explored with the 720 complete seatings a brute force would check.

**Show a solution**

seating.js

```ts
const guests = ["Ada", "Bola", "Chidi", "Dayo", "Emeka", "Funmi"];
const apart = new Set(["Ada|Bola", "Chidi|Dayo", "Emeka|Ada", "Funmi|Chidi"]);
const clash = (a, b) => apart.has(`${a}|${b}`) || apart.has(`${b}|${a}`);

let count = 0;
let nodes = 0;
let first = null;
const row = [];
const seated = new Set();

function seat() {
  nodes++;
  if (row.length === guests.length) {
    count++;
    first ??= row.join(", ");
    return;
  }
  for (const g of guests) {
    if (seated.has(g)) continue;
    if (row.length > 0 && clash(row.at(-1), g)) continue;
    seated.add(g);
    row.push(g);
    seat();
    row.pop();
    seated.delete(g);
  }
}

seat();
console.log("first:", first);
console.log(`${count} valid seatings of 720, ${nodes} nodes explored`);
```

Output of `node seating.js` and of the browser terminal

```ts
first: Ada, Chidi, Bola, Dayo, Emeka, Funmi
152 valid seatings of 720, 553 nodes explored
```

The check only looks at the newly seated guest and their left neighbour, because every earlier pair was already checked when it was formed. Checking just the new part of the state at each step, instead of re-validating the whole row, keeps each check O(1).

TRY IT YOURSELF

### Every sudoku solution

A well-formed sudoku has exactly one solution. Modify the idea of the solver to *count* solutions, stopping at 2 (all you need to know is "unique or not"). Test it on the lesson's puzzle and on the same puzzle with its first two given digits removed.

**Show a solution**

unique.js

```ts
function countSolutions(puzzle, limit = 2) {
  const grid = [...puzzle].map((ch) => (ch === "." ? 0 : Number(ch)));
  const ok = (i, d) => {
    const r = Math.floor(i / 9);
    const c = i % 9;
    const br = r - (r % 3);
    const bc = c - (c % 3);
    for (let k = 0; k < 9; k++) {
      if (grid[r * 9 + k] === d || grid[k * 9 + c] === d) return false;
      if (grid[(br + Math.floor(k / 3)) * 9 + bc + (k % 3)] === d) return false;
    }
    return true;
  };
  let found = 0;
  function fill(i) {
    if (found >= limit) return;
    while (i < 81 && grid[i] !== 0) i++;
    if (i === 81) {
      found++;
      return;
    }
    for (let d = 1; d <= 9; d++) {
      if (!ok(i, d)) continue;
      grid[i] = d;
      fill(i + 1);
      grid[i] = 0;
    }
  }
  fill(0);
  return found;
}

const puzzle = "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";
console.log("original:", countSolutions(puzzle) === 1 ? "unique" : "not unique");
console.log("two clues removed:", countSolutions(".." + puzzle.slice(2)) === 1 ? "unique" : "not unique");
```

Output of `node unique.js` and of the browser terminal

```ts
original: unique
two clues removed: not unique
```

Instead of returning `true` at the first solution, the search counts leaves and keeps going, and the `limit` check stops it as soon as the answer ("more than one") is known. Puzzle generators use exactly this to check that a puzzle they made has a single answer. This version uses the simple first-empty-cell rule and scans rows, columns and boxes directly, which is slower than the set-based solver but short.

## Summary

- Backtracking builds an answer choice by choice, explores deeper, and undoes the choice to try the next. It is a depth-first walk of the decision tree and needs memory only for the current path.
- Subsets branch on include or skip (2n), combinations pick only after the last choice with a start index (C(n, k)), permutations pick any unused item (n!). Record copies of the state, never the state itself.
- Prune a branch as soon as it cannot lead to a valid answer. That is only safe for monotone rules, which adding more choices cannot fix; check other rules at the leaves.
- Branch and bound prunes branches that cannot beat the best answer so far, using a lower bound on the remaining cost. A greedy answer makes a good starting bound.
- For constraint puzzles, keep sets of what is used so checks are O(1), and try the most constrained choice first. It can cut the work by orders of magnitude.
- Test with counts against formulas, validity and uniqueness of every result, and pruned search against brute force. Cap the input and the node budget in production.

Next: [Dynamic programming](https://zudojs.oyinlola.site/learn/dsa-dynamic-programming) takes searches whose branches solve the same sub-problems again and again, remembers each answer once, and turns exponential searches for coin change, text differences and van loading into fast table computations.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
