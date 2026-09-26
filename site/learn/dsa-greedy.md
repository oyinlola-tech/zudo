---
title: "Greedy algorithms — ZudoJS Academy"
description: "Give change in naira, book meeting rooms and load a van by taking the best-looking choice, then prove when that works and catch it failing with tests."
source: https://zudojs.oyinlola.site/learn/dsa-greedy
---

LEVEL 3 · LESSON 14 OF 21

Algorithms Core

# Greedy algorithms

Give change in naira, book meeting rooms and load a van by taking the best-looking choice, then prove when that works and catch it failing with tests.

- **50 min** to read and try
- **You need:** Sorting algorithms, Graph search, and Heaps and priority queues
- **You build:** A change-giver for naira notes and coins with a checker that finds where greedy fails, a meeting-room booker that accepts the most meetings, and a room planner that uses the fewest rooms

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain what makes an algorithm greedy and why greedy algorithms are fast
- Give change with the fewest naira notes and coins, and show two ways the same greedy rule fails
- Choose the right greedy rule for booking one meeting room and prove it with an exchange argument
- Find the fewest rooms for a day of meetings with a sweep over start and end times
- Test a greedy algorithm against brute force to find counterexamples automatically

## The problem: change at the till

A supermarket till must give a customer ₦3,750 in change. The cashier wants to hand over as few notes and coins as possible: fewer to count, fewer mistakes, and the till keeps its small notes for later. Every cashier in the country already knows the method: take the largest note that fits, subtract it, and repeat.

```ts
₦3,750:  1000  1000  1000  500  200  50      six notes
```

That method is a **greedy algorithm**: it builds the answer one step at a time, and at each step takes the choice that looks best *right now* (the biggest note), without ever going back to reconsider. Greedy algorithms are fast and short, because they never search. The catch is in the last part: a choice that looks best now can rule out a better answer later. This lesson is about telling the two situations apart, and about proving, or testing, which one you are in.

You have met greedy algorithms already. Dijkstra's algorithm in [Graph search](https://zudojs.oyinlola.site/learn/dsa-graph-search#dijkstra) greedily finalises the closest city, and it is correct because road lengths are never negative. Selection sort greedily picks the smallest remaining item. In both cases, someone proved that the local choice is always safe. Where no such proof exists, greedy is only a guess.

## Making change in naira

Nigerian cash comes in notes of ₦1,000, ₦500, ₦200, ₦100, ₦50, ₦20, ₦10 and ₦5, and coins of ₦2 and ₦1. The greedy change-giver walks the denominations from largest to smallest and takes as many of each as fit:

change.js

```ts
export const naira = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

export function greedyChange(amount, denominations) {
  if (!Number.isInteger(amount) || amount < 0) throw new RangeError(`amount must be a whole number of naira, got ${amount}`);
  const sorted = [...denominations].sort((a, b) => b - a);
  const handed = [];
  let left = amount;
  for (const value of sorted) {
    while (left >= value) {
      handed.push(value);
      left -= value;
    }
  }
  return left === 0 ? handed : null;
}

export function describe(handed) {
  if (handed === null) return "cannot make this amount";
  if (handed.length === 0) return "no change due";
  return `${handed.length} pieces: ${handed.join(" + ")}`;
}
```

Amounts are whole naira, as integers, so no floating-point error can creep into the subtraction ([Mathematical reasoning](https://zudojs.oyinlola.site/learn/logic-math) explains why money should never be a float). The function returns `null` if something is left over that no denomination can cover.

till.js

```ts
import { describe, greedyChange, naira } from "./change.js";

for (const amount of [3750, 1999, 480, 0]) {
  console.log(`₦${amount}: ${describe(greedyChange(amount, naira))}`);
}
```

Output of `node till.js` and of the browser terminal

```ts
₦3750: 6 pieces: 1000 + 1000 + 1000 + 500 + 200 + 50
₦1999: 10 pieces: 1000 + 500 + 200 + 200 + 50 + 20 + 20 + 5 + 2 + 2
₦480: 5 pieces: 200 + 200 + 50 + 20 + 10
₦0: no change due
```

Each step is O(1) per note handed out, so the whole thing is O(d + k) for d denominations and k pieces: instant, even for large amounts. And for the naira it always gives the fewest pieces. Why?

### Why greedy works for the naira

Look at what a best answer (one with the fewest pieces) can contain below ₦1,000. It never holds two ₦500s: swap them for one ₦1,000 and you save a piece. It never holds three ₦200s: swap them for ₦500 + ₦100. It never holds two ₦200s *and* a ₦100: that is ₦500 in three pieces instead of one. The same kind of swap limits every smaller group (two ₦50s become a ₦100, three ₦20s become ₦50 + ₦10, three ₦2s become ₦5 + ₦1, and so on). Work through all of them and the most a best answer can hold in pieces smaller than ₦1,000 is 500 + 200 + 200 + 50 + 20 + 20 + 5 + 2 + 2 = ₦999. So a best answer for ₦3,750 cannot make more than ₦999 of it from small pieces: it must contain three ₦1,000 notes, exactly what greedy takes first. The same argument then repeats for ₦500 on what is left, and so on down. Such swaps, which turn any best answer into the greedy one without making it worse, are called an **exchange argument**, and you will meet them again below. Denomination systems where greedy gives the fewest pieces for every amount are called **canonical**, and most national currencies are designed to be canonical on purpose.

That argument depended on the specific values. Change them, or change the rules, and greedy can fail.

## Two ways greedy change fails

### Failure 1: the till has run out of a note

It is late in the day and the till has one ₦500 note, three ₦200 notes, and no ₦100s or smaller. A customer needs ₦600 in change. Greedy takes the ₦500 first, then has ₦100 left and nothing to make it with.

empty-till.js

```ts
function greedyFromTill(amount, till) {
  const handed = [];
  let left = amount;
  for (const [value, count] of till) {
    let use = Math.min(count, Math.floor(left / value));
    for (; use > 0; use--) {
      handed.push(value);
      left -= value;
    }
  }
  return left === 0 ? handed : null;
}

function searchFromTill(amount, till, i = 0) {
  if (amount === 0) return [];
  if (i === till.length) return null;
  const [value, count] = till[i];
  let best = null;
  for (let use = Math.min(count, Math.floor(amount / value)); use >= 0; use--) {
    const rest = searchFromTill(amount - use * value, till, i + 1);
    if (rest !== null && (best === null || use + rest.length < best.length)) {
      best = [...Array(use).fill(value), ...rest];
    }
  }
  return best;
}

const till = [[500, 1], [200, 3]];
console.log("greedy:", greedyFromTill(600, till));
console.log("search:", searchFromTill(600, till));
```

Output of `node empty-till.js` and of the browser terminal

```ts
greedy: null
search: [ 200, 200, 200 ]
```

Greedy says "cannot make change" while three ₦200 notes would do it. The search tries every possible count of each note (with the most first), which is guaranteed correct but explores many combinations; [Backtracking](https://zudojs.oyinlola.site/learn/dsa-backtracking) is about doing that kind of search efficiently. With a limited supply, the swap argument above no longer holds: you cannot swap two ₦500s for a ₦1,000 you do not have.

### Failure 2: denominations that are not canonical

A phone shop sells airtime vouchers of ₦500, ₦400 and ₦100, and wants to fill a customer's ₦800 top-up with as few vouchers as possible. Greedy takes the ₦500 first, and pays for it:

vouchers.js

```ts
import { describe, greedyChange } from "./change.js";

function fewestPieces(amount, denominations) {
  const previous = new Map([[0, null]]);
  const queue = [0];
  for (let head = 0; head < queue.length; head++) {
    const reached = queue[head];
    if (reached === amount) break;
    for (const value of denominations) {
      const next = reached + value;
      if (next <= amount && !previous.has(next)) {
        previous.set(next, [reached, value]);
        queue.push(next);
      }
    }
  }
  if (!previous.has(amount)) return null;
  const handed = [];
  for (let at = amount; at !== 0; at = previous.get(at)[0]) handed.push(previous.get(at)[1]);
  return handed.sort((a, b) => b - a);
}

const vouchers = [500, 400, 100];
for (const amount of [800, 1200, 900]) {
  console.log(`₦${amount} greedy: ${describe(greedyChange(amount, vouchers))}`);
  console.log(`₦${amount} best:   ${describe(fewestPieces(amount, vouchers))}`);
}

const real = [1500, 1000, 750, 500, 400, 200, 100];
console.log(`₦800 with a ₦750 voucher on sale, greedy: ${describe(greedyChange(800, real))}`);
console.log(`₦800 with a ₦750 voucher on sale, best:   ${describe(fewestPieces(800, real))}`);
```

Output of `node vouchers.js` and of the browser terminal

```ts
₦800 greedy: 4 pieces: 500 + 100 + 100 + 100
₦800 best:   2 pieces: 400 + 400
₦1200 greedy: 4 pieces: 500 + 500 + 100 + 100
₦1200 best:   3 pieces: 400 + 400 + 400
₦900 greedy: 2 pieces: 500 + 400
₦900 best:   2 pieces: 500 + 400
₦800 with a ₦750 voucher on sale, greedy: cannot make this amount
₦800 with a ₦750 voucher on sale, best:   2 pieces: 400 + 400
```

`fewestPieces` is breadth-first search from [Graph search](https://zudojs.oyinlola.site/learn/dsa-graph-search#bfs) in disguise: the vertices are amounts from ₦0 up to the target, and each voucher is an edge that adds its value. BFS finds the amount in the fewest steps, and each step is one voucher. It is always right, but it visits up to *amount* vertices with *d* edges each, O(amount × d), where greedy was nearly free.

The last two lines are the nastiest failure. With a ₦750 voucher in the set, greedy grabs it for ₦800, is left with ₦50 that nothing can cover, and reports that ₦800 is impossible, even though two ₦400 vouchers make it exactly. A greedy algorithm that fails does not always fail by giving a slightly worse answer; sometimes it gives no answer, or a wrong "no".

> NOTE
>
> Whether greedy is optimal for a denomination set can be checked by computer: compare greedy with an exact method for every amount below the sum of the two largest denominations. For a set that includes a smallest unit every amount can be built from (like the naira's ₦1 coin), a known result says that if they agree on all of those, greedy is optimal for every amount. Exercise 3 builds that check.

## Booking one meeting room

A co-working space has one meeting room and a day's worth of booking requests. Two bookings cannot overlap. The manager wants to accept as many bookings as possible, so as many customers as possible are happy. This is called **interval scheduling** (or activity selection): each request is an **interval** of time with a start and an end, and you want the largest set of intervals that do not overlap.

REASON IT OUT

### Before you choose a rule

A greedy algorithm needs a rule for which request to accept next. Before reading on, think about these candidate rules and try to break each one with a small example: accept the request that *starts* earliest; accept the *shortest* request; accept the request that *ends* earliest. Also decide: a meeting that ends at 10:00 and another that starts at 10:00, do they conflict? And how should times like `"09:30"` be stored so comparisons are reliable?

**Show the reasoning**

- **Earliest start** fails: one request from 08:00 to 18:00 starts first, is accepted, and blocks every other meeting of the day.
- **Shortest first** fails: a short meeting from 11:30 to 12:30 can overlap two longer ones (09:00 to 12:00 and 12:00 to 15:00) that could both have been accepted.
- **Earliest end** works, and the reason is below: the meeting that finishes first leaves the most time for everything else.
- **Touching meetings**: treat an interval as *half-open*, `[start, end)`, meaning it includes its start minute but not its end minute. Then 09:00 to 10:00 and 10:00 to 11:00 do not overlap, which is what people expect. Two intervals overlap exactly when `a.start < b.end && b.start < a.end`.
- **Times**: convert to minutes since midnight (a number) once, at the edge of the program. `"9:30"` and `"09:30"` compare differently as strings; 570 and 570 do not.

bookings.js

```ts
export function minutes(time) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw new Error(`bad time: ${time}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function booking(name, from, to) {
  const start = minutes(from);
  const end = minutes(to);
  if (end <= start) throw new Error(`${name}: ends before it starts`);
  return { name, from, to, start, end };
}

export const overlaps = (a, b) => a.start < b.end && b.start < a.end;

export function acceptMost(requests) {
  const accepted = [];
  for (const request of requests.toSorted((a, b) => a.end - b.end || a.start - b.start)) {
    const last = accepted.at(-1);
    if (last === undefined || request.start >= last.end) accepted.push(request);
  }
  return accepted;
}
```

The helpers enforce the decisions from the reasoning box before any scheduling happens: times become minutes, bad input is rejected with the offending value in the message, and `overlaps` uses the half-open rule.

edges.js

```ts
import { booking, overlaps } from "./bookings.js";

const nine = booking("standup", "09:00", "10:00");
console.log("touching:", overlaps(nine, booking("review", "10:00", "11:00")));
console.log("one minute in:", overlaps(nine, booking("call", "09:59", "10:30")));
console.log("inside:", overlaps(nine, booking("quick chat", "09:15", "09:30")));

for (const [from, to] of [["10:00", "09:00"], ["9:5", "10:00"], ["24:00", "25:00"], ["9:30", "10:00"]]) {
  try {
    const b = booking("test", from, to);
    console.log(`${from}-${to} accepted as minutes ${b.start}-${b.end}`);
  } catch (error) {
    console.log(`${from}-${to} rejected: ${error.message}`);
  }
}
```

Output of `node edges.js` and of the browser terminal

```ts
touching: false
one minute in: true
inside: true
10:00-09:00 rejected: test: ends before it starts
9:5-10:00 rejected: bad time: 9:5
24:00-25:00 rejected: bad time: 24:00
9:30-10:00 accepted as minutes 570-600
```

`acceptMost` sorts the requests by end time and walks through them once, accepting every request that starts at or after the end of the last accepted one. Because accepted meetings are in end-time order, checking against the last one is enough. Sorting is O(n log n), and the walk is O(n).

one-room.js

```ts
import { acceptMost, booking } from "./bookings.js";

const requests = [
  booking("board meeting", "08:00", "12:00"),
  booking("interview Ada", "09:00", "10:00"),
  booking("sales sync", "10:00", "11:00"),
  booking("client demo", "10:30", "12:30"),
  booking("lunch talk", "12:00", "13:00"),
  booking("design review", "12:30", "14:30"),
  booking("interview Tunde", "13:00", "14:00"),
  booking("all hands", "14:00", "17:00"),
  booking("1-on-1", "15:00", "15:30"),
];

const accepted = acceptMost(requests);
for (const b of accepted) console.log(`${b.from}-${b.to} ${b.name}`);
console.log(`accepted ${accepted.length} of ${requests.length}`);

const byEarliestStart = [];
for (const r of requests.toSorted((a, b) => a.start - b.start)) {
  if (byEarliestStart.every((b) => r.start >= b.end || r.end <= b.start)) byEarliestStart.push(r);
}
const byShortest = [];
for (const r of requests.toSorted((a, b) => a.end - a.start - (b.end - b.start))) {
  if (byShortest.every((b) => r.start >= b.end || r.end <= b.start)) byShortest.push(r);
}
console.log(`earliest start would accept ${byEarliestStart.length}, shortest first ${byShortest.length}`);
```

Output of `node one-room.js` and of the browser terminal

```ts
09:00-10:00 interview Ada
10:00-11:00 sales sync
12:00-13:00 lunch talk
13:00-14:00 interview Tunde
15:00-15:30 1-on-1
accepted 5 of 9
earliest start would accept 4, shortest first 5
```

On this day "earliest start" accepts one booking fewer: it takes the four-hour board meeting first, which blocks three morning meetings. "Shortest first" happens to tie with earliest end. A rule that works on one example proves nothing; the next section proves the earliest-end rule for every input, and the [testing section](#testing) shows how quickly brute force catches the wrong rules.

## Proving a greedy choice

Most greedy correctness proofs use one of two arguments. Both are worth learning in plain words, because they are also how you *convince yourself* before trusting a greedy algorithm with money or bookings.

### The exchange argument

Take any best schedule, one that accepts the maximum number of meetings. Look at its first meeting (the one that ends earliest in it). Greedy's first choice, call it *g*, is the request with the earliest end of all. So *g* ends no later than the best schedule's first meeting. Now **exchange**: remove the best schedule's first meeting and put *g* in its place. *g* ends no later, so it cannot overlap anything the first meeting did not already avoid. The new schedule is still valid and has the same number of meetings, so it is also a best schedule, and it starts with greedy's choice.

Repeat the argument on the requests that start after *g* ends: there is a best schedule that agrees with greedy's second choice too, and so on. Greedy never takes a step that a best schedule could not also take, so it ends with a best schedule. The pattern is always the same: show that any optimal answer can be changed, one step at a time, into the greedy answer without getting worse.

### Greedy stays ahead

The second argument compares greedy with any other valid schedule, meeting by meeting. After k accepted meetings, greedy's k-th meeting ends no later than the other schedule's k-th meeting (true for k = 1 by the choice rule, and each step keeps it true, because anything the other schedule can accept next, greedy could also accept). So greedy is never behind, and if the other schedule had one more meeting, greedy would have had room for it too.

The coin argument in [Making change](#change) was an exchange argument as well: swap bundles of small notes for a big one. When you cannot find such an argument, and you cannot find a counterexample either, treat the greedy algorithm as a heuristic: fast, often good, not guaranteed.

## How many rooms do you need?

The co-working space now wants to accept *every* booking and asks a different question: what is the fewest rooms that can host all of them, and which meeting goes in which room? This is **interval partitioning**.

A lower bound is easy to see. At 10:45, the board meeting, the sales sync and the client demo are all running, so no plan can use fewer than three rooms. The largest number of meetings running at the same moment is called the **depth**, and you need at least that many rooms. The greedy algorithm below always achieves the depth, which proves it optimal: process meetings in order of start time, and put each one into any room that is free by then; open a new room only when none is.

rooms.js

```ts
import { booking } from "./bookings.js";

const requests = [
  booking("board meeting", "08:00", "12:00"),
  booking("interview Ada", "09:00", "10:00"),
  booking("sales sync", "10:00", "11:00"),
  booking("client demo", "10:30", "12:30"),
  booking("lunch talk", "12:00", "13:00"),
  booking("design review", "12:30", "14:30"),
  booking("interview Tunde", "13:00", "14:00"),
  booking("all hands", "14:00", "17:00"),
  booking("1-on-1", "15:00", "15:30"),
];

function assignRooms(requests) {
  const rooms = [];
  const plan = [];
  for (const meeting of requests.toSorted((a, b) => a.start - b.start || a.end - b.end)) {
    let room = rooms.findIndex((freeAt) => freeAt <= meeting.start);
    if (room === -1) {
      room = rooms.length;
      rooms.push(0);
    }
    rooms[room] = meeting.end;
    plan.push({ room: room + 1, meeting });
  }
  return { count: rooms.length, plan };
}

function depth(requests) {
  const events = [];
  for (const r of requests) events.push([r.start, 1], [r.end, -1]);
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let running = 0;
  let most = 0;
  for (const [, change] of events) {
    running += change;
    most = Math.max(most, running);
  }
  return most;
}

const { count, plan } = assignRooms(requests);
for (const { room, meeting } of plan) console.log(`room ${room}: ${meeting.from}-${meeting.to} ${meeting.name}`);
console.log(`rooms used: ${count}, depth: ${depth(requests)}`);
```

Output of `node rooms.js` and of the browser terminal

```ts
room 1: 08:00-12:00 board meeting
room 2: 09:00-10:00 interview Ada
room 2: 10:00-11:00 sales sync
room 3: 10:30-12:30 client demo
room 1: 12:00-13:00 lunch talk
room 2: 12:30-14:30 design review
room 1: 13:00-14:00 interview Tunde
room 1: 14:00-17:00 all hands
room 2: 15:00-15:30 1-on-1
rooms used: 3, depth: 3
```

Two functions, two ideas:

- `assignRooms` is the greedy plan. For each meeting in start order, `findIndex` finds a room whose last meeting has ended. It only opens a new room when every existing room is busy at the new meeting's start, and at that moment all those rooms plus the new meeting are running together, so the depth is at least the number of rooms. Greedy therefore never uses more rooms than the depth, and no plan can use fewer.
- `depth` is a **sweep**: turn every meeting into two events (+1 at its start, −1 at its end), sort the events by time, and keep a running count. Sorting ends before starts at the same minute (`a[1] - b[1]` puts −1 first) is what makes touching meetings not count as overlapping, the half-open rule again.

Scanning the rooms with `findIndex` costs O(rooms) per meeting. For a conference centre with hundreds of rooms, keep the rooms in a min-heap ordered by the time they become free ([Heaps](https://zudojs.oyinlola.site/learn/dsa-heaps)), and each meeting costs O(log rooms): O(n log n) in total.

## Loading a van: where greedy works and where it does not

A delivery van can carry 100 kg. The warehouse has bulk goods sold by weight, each with a value per kilogram. To load the most valuable cargo, greedy takes the goods with the highest *value per kg* first, and when the next one does not fit completely, takes as much of it as fits. This is the **fractional knapsack** problem, and greedy is optimal for it, by an exchange argument: if a load contains some lower-value-per-kg goods while higher-value-per-kg goods are left behind, swapping a kilogram of one for the other raises the value.

bulk.js

```ts
function loadBulk(goods, capacityKg) {
  let room = capacityKg;
  const load = [];
  for (const g of goods.toSorted((a, b) => b.nairaPerKg - a.nairaPerKg)) {
    if (room === 0) break;
    const kg = Math.min(g.kg, room);
    load.push({ name: g.name, kg, naira: kg * g.nairaPerKg });
    room -= kg;
  }
  return load;
}

const warehouse = [
  { name: "rice", kg: 50, nairaPerKg: 1400 },
  { name: "beans", kg: 40, nairaPerKg: 1800 },
  { name: "garri", kg: 80, nairaPerKg: 900 },
  { name: "palm oil", kg: 30, nairaPerKg: 2100 },
];

const load = loadBulk(warehouse, 100);
for (const item of load) console.log(`${item.kg} kg ${item.name}: ₦${item.naira}`);
console.log(`total ₦${load.reduce((sum, item) => sum + item.naira, 0)} for ${load.reduce((sum, item) => sum + item.kg, 0)} kg`);
```

Output of `node bulk.js` and of the browser terminal

```ts
30 kg palm oil: ₦63000
40 kg beans: ₦72000
30 kg rice: ₦42000
total ₦177000 for 100 kg
```

Palm oil and beans go in whole, and the last 30 kg is filled with rice, the next best value per kilogram. Garri, the cheapest per kilogram, is left behind. Sorting is O(n log n), loading O(n).

Now the warehouse ships fridges, generators and TVs. You cannot take 40% of a fridge. This is the **0/1 knapsack** problem: each item is taken whole or not at all. The same greedy rule fails:

van.js

```ts
function greedyWhole(items, capacity) {
  let kg = 0;
  const taken = [];
  for (const item of items.toSorted((a, b) => b.naira / b.kg - a.naira / a.kg)) {
    if (kg + item.kg <= capacity) {
      taken.push(item);
      kg += item.kg;
    }
  }
  return taken;
}

function bestWhole(items, capacity) {
  let best = [];
  let bestValue = 0;
  for (let mask = 0; mask < 1 << items.length; mask++) {
    const chosen = items.filter((_, i) => mask & (1 << i));
    const kg = chosen.reduce((sum, item) => sum + item.kg, 0);
    const value = chosen.reduce((sum, item) => sum + item.naira, 0);
    if (kg <= capacity && value > bestValue) {
      best = chosen;
      bestValue = value;
    }
  }
  return best;
}

const items = [
  { name: "generator", kg: 60, naira: 420000 },
  { name: "fridge", kg: 50, naira: 330000 },
  { name: "TV", kg: 50, naira: 320000 },
];
const show = (list) => `${list.map((i) => i.name).join(" + ")} = ₦${list.reduce((s, i) => s + i.naira, 0)}`;

console.log("greedy by value per kg:", show(greedyWhole(items, 100)));
console.log("best by trying all:    ", show(bestWhole(items, 100)));
```

Output of `node van.js` and of the browser terminal

```ts
greedy by value per kg: generator = ₦420000
best by trying all:     fridge + TV = ₦650000
```

The generator has the best value per kilogram (₦7,000 per kg), so greedy takes it first, and then neither of the 50 kg items fits in the remaining 40 kg. The fridge and the TV together are worth more and fill the van exactly. The brute force tries all 2n subsets, which is fine for 3 items and hopeless for 60. [Dynamic programming](https://zudojs.oyinlola.site/learn/dsa-dynamic-programming) solves the 0/1 van exactly in O(n × capacity).

The lesson generalises: greedy tends to work when choices can be split or swapped freely (fractions of rice, canonical notes, meetings that can be exchanged for earlier-ending ones), and tends to fail when an early choice uses up a resource in a lumpy way that blocks better combinations later (whole items, limited notes, odd voucher values).

## Testing greedy algorithms against brute force

A greedy algorithm is short, fast, and easy to believe. The most effective defence against a wrong one is to compare it with a brute-force solution on many small random inputs. Brute force is slow but obviously correct, and small inputs keep it fast enough. When they disagree, the test prints the smallest input it found, a counterexample you can reason about.

greedy-test.js

```ts
import { acceptMost } from "./bookings.js";

let seed = 7;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function randomDay(n) {
  return Array.from({ length: n }, (_, i) => {
    const start = Math.floor(random() * 20);
    return { name: `m${i}`, start, end: start + 1 + Math.floor(random() * 6) };
  });
}

function bruteForceMost(requests) {
  let best = 0;
  for (let mask = 0; mask < 1 << requests.length; mask++) {
    const chosen = requests.filter((_, i) => mask & (1 << i));
    const valid = chosen.every((a, i) => chosen.every((b, j) => i === j || a.end <= b.start || b.end <= a.start));
    if (valid) best = Math.max(best, chosen.length);
  }
  return best;
}

function shortestFirst(requests) {
  const accepted = [];
  for (const r of requests.toSorted((a, b) => a.end - a.start - (b.end - b.start))) {
    if (accepted.every((b) => r.start >= b.end || r.end <= b.start)) accepted.push(r);
  }
  return accepted;
}

const rules = { "earliest end": acceptMost, "shortest first": shortestFirst };
for (const [name, rule] of Object.entries(rules)) {
  seed = 7;
  let counterexample = null;
  let trials = 0;
  for (; trials < 500 && !counterexample; trials++) {
    const day = randomDay(1 + Math.floor(random() * 8));
    if (rule(day).length !== bruteForceMost(day)) counterexample = day;
  }
  if (!counterexample) console.log(`PASS ${name}: agrees with brute force on ${trials} random days`);
  else {
    const shown = counterexample.map((m) => `[${m.start},${m.end})`).join(" ");
    console.log(`FAIL ${name} after ${trials} days: ${shown} -> greedy ${rule(counterexample).length}, best ${bruteForceMost(counterexample)}`);
  }
}
```

Output of `node greedy-test.js` and of the browser terminal

```ts
PASS earliest end: agrees with brute force on 500 random days
FAIL shortest first after 19 days: [8,9) [15,20) [18,24) [13,19) [0,5) [12,17) -> greedy 3, best 4
```

The earliest-end rule survives 500 random days. The shortest-first rule is caught after 19 random days, with a concrete day to look at: draw those six intervals on a line and you will see a short meeting blocking two that could both have fitted. The same harness, with `fewestPieces` as the reference, catches the voucher failure for ₦800. This technique is sometimes called **differential testing**, and property-testing libraries such as fast-check automate it, including shrinking a failing input to the smallest one that still fails.

## Greedy algorithms in production

- **Enforce "no overlap" in the database.** Two receptionists can accept overlapping bookings at the same moment, each checking before the other saves. PostgreSQL can refuse the second one with an exclusion constraint on a time range (`EXCLUDE USING gist (room WITH =, during WITH &&)`, which needs the `btree_gist` extension for the `room WITH =` part), so the rule holds no matter which code path writes the row.
- **Time zones and midnight.** Minutes since midnight only work within one day and one time zone. Real bookings store instants (UTC timestamps) and convert for display. A meeting from 23:00 to 01:00 breaks the simple model; decide whether you allow it.
- **Greedy as a deliberate approximation.** Many scheduling and routing problems (delivery routes with time windows, packing parcels into the fewest vans) have no known fast exact algorithm. Production systems use greedy heuristics, such as "put each parcel into the first van it fits, largest parcels first", because they are fast and usually within a few percent of optimal. That is a valid engineering choice as long as everyone knows it is an approximation.
- **Change-giving with real stock.** A vending machine or a cash-dispensing till has limited notes. Greedy-first with a fallback search (or refusing the sale when exact change is impossible) is the usual design; greedy alone will sometimes refuse change it could have given.
- **Fairness.** "Accept the most meetings" favours short meetings, and "earliest deadline first" can starve long jobs. The optimal answer to the stated problem may not be what users consider fair, so make the objective explicit with the business.

## Practice

TRY IT YOURSELF

### Deliveries with deadlines

A single rider has five deliveries today, each with a riding time and a promised deadline (minutes from now). Deliveries happen one after another. **Lateness** is how far past its deadline a delivery arrives (0 if on time). Order the deliveries to make the *worst* lateness as small as possible. Try the greedy rule "earliest deadline first", and compare with trying all 120 orders.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`edf` should be `jobs` sorted by `deadline`, earliest first, the same shape as `printJobs.toSorted((a, b) => a.minutes - b.minutes)` in the worked example.

HINT 2

`const edf = jobs.toSorted((a, b) => a.deadline - b.deadline);`

SOLUTION

deadlines.js

```ts
const jobs = [
  { id: "A", minutes: 30, deadline: 60 },
  { id: "B", minutes: 20, deadline: 45 },
  { id: "C", minutes: 45, deadline: 150 },
  { id: "D", minutes: 25, deadline: 70 },
  { id: "E", minutes: 40, deadline: 130 },
];

function worstLateness(order) {
  let time = 0;
  let worst = 0;
  for (const job of order) {
    time += job.minutes;
    worst = Math.max(worst, time - job.deadline);
  }
  return worst;
}

function permutations(list) {
  if (list.length <= 1) return [list];
  return list.flatMap((item, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((rest) => [item, ...rest]));
}

const edf = jobs.toSorted((a, b) => a.deadline - b.deadline);
console.log("earliest deadline first:", edf.map((j) => j.id).join(""), "worst lateness", worstLateness(edf));
console.log("shortest first:", jobs.toSorted((a, b) => a.minutes - b.minutes).map((j) => j.id).join(""), "worst lateness", worstLateness(jobs.toSorted((a, b) => a.minutes - b.minutes)));
const best = Math.min(...permutations(jobs).map(worstLateness));
console.log("best of all 120 orders:", best);
```

Output of `node deadlines.js` and of the browser terminal

```ts
earliest deadline first: BADEC worst lateness 10
shortest first: BDAEC worst lateness 15
best of all 120 orders: 10
```

Earliest deadline first matches the best of all 120 orders. The exchange argument: if an order has two neighbouring deliveries where the later deadline goes first, swapping them does not increase the worst lateness. After the swap, the delivery with the earlier deadline finishes sooner than before. The other one now finishes exactly when the pair used to finish, which is when the earlier-deadline delivery used to arrive; its deadline is later, so it is no more late than that delivery was. Keep swapping and you reach deadline order without getting worse. Riding times do not matter to the rule at all, which surprises most people.

TRY IT YOURSELF

### Merge overlapping bookings

The cleaning crew needs to know when the room is in use. Merge a list of bookings into the fewest non-overlapping busy periods, treating touching bookings (one ends at 10:00, the next starts at 10:00) as one period. Use a greedy sweep in start order.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Compare the new `[start, end]` with `merged.at(-1)`. If `start` is at or before that period's end, stretch it with `Math.max`. Otherwise push a brand new period.

HINT 2

`for (const [start, end] of sorted) { const last = merged.at(-1); if (last && start <= last[1]) last[1] = Math.max(last[1], end); else merged.push([start, end]); }`

SOLUTION

busy.js

```ts
function toMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
const toTime = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function busyPeriods(bookings) {
  const sorted = bookings.map(([from, to]) => [toMinutes(from), toMinutes(to)]).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged.map(([s, e]) => `${toTime(s)}-${toTime(e)}`);
}

console.log(busyPeriods([["13:00", "14:00"], ["09:00", "10:00"], ["10:00", "11:30"], ["11:00", "12:00"], ["15:00", "15:30"], ["13:30", "13:45"]]).join(", "));
```

Output of `node busy.js` and of the browser terminal

```ts
09:00-12:00, 13:00-14:00, 15:00-15:30
```

Sorted by start, each booking either extends the current busy period (it starts before or exactly when the period ends) or starts a new one. `Math.max` matters: the 13:30 to 13:45 booking lies inside 13:00 to 14:00 and must not shorten it. The sort is O(n log n) and the sweep O(n). Here touching bookings merge (`<=`), because the room is busy without a break; for conflict checks earlier in the lesson they did not overlap. The same data, two questions, two boundary rules.

TRY IT YOURSELF

### Is a set of vouchers safe for greedy?

Write `firstGreedyFailure(denominations)` that returns the smallest amount where greedy gives more pieces than the best answer (or fails when the best answer exists), checking every amount up to the sum of the two largest denominations, or `null` if greedy is always optimal. Try it on the naira, on ₦500/₦400/₦100 and on a set with ₦750.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

For each `amount`, try every denomination as the piece used last: `fewest[amount - value] + 1`, keeping the smallest. Then compare that best answer with `greedyCount(amount, sorted)`.

HINT 2

`fewest[amount] = Infinity; for (const value of sorted) { if (value <= amount) fewest[amount] = Math.min(fewest[amount], fewest[amount - value] + 1); } if (fewest[amount] !== Infinity && greedyCount(amount, sorted) > fewest[amount]) return amount;`

SOLUTION

canonical.js

```ts
function greedyCount(amount, denominations) {
  let pieces = 0;
  for (const value of denominations) {
    pieces += Math.floor(amount / value);
    amount %= value;
  }
  return amount === 0 ? pieces : Infinity;
}

function firstGreedyFailure(denominations) {
  const sorted = [...denominations].sort((a, b) => b - a);
  const limit = sorted[0] + (sorted[1] ?? 0);
  const fewest = [0];
  for (let amount = 1; amount <= limit; amount++) {
    fewest[amount] = Infinity;
    for (const value of sorted) {
      if (value <= amount) fewest[amount] = Math.min(fewest[amount], fewest[amount - value] + 1);
    }
    if (fewest[amount] !== Infinity && greedyCount(amount, sorted) > fewest[amount]) return amount;
  }
  return null;
}

console.log("naira:", firstGreedyFailure([1000, 500, 200, 100, 50, 20, 10, 5, 2, 1]));
console.log("500/400/100:", firstGreedyFailure([500, 400, 100]));
console.log("with 750:", firstGreedyFailure([1500, 1000, 750, 500, 400, 200, 100]));
```

Output of `node canonical.js` and of the browser terminal

```ts
naira: null
500/400/100: 800
with 750: 800
```

The table `fewest[amount]` builds the best answer for every amount from the answers for smaller amounts: the fewest pieces for an amount is one piece plus the fewest for what is left, tried for every denomination. That is dynamic programming, the subject of [Dynamic programming](https://zudojs.oyinlola.site/learn/dsa-dynamic-programming) two lessons from now. Checking up to the sum of the two largest values is a known result (Kozen and Zaks, 1994) for coin systems that contain a 1: if greedy is optimal for all amounts below that bound, it is optimal for all amounts. The naira has a ₦1 coin and passes. The ₦750 set has no unit coin, so a clean pass would prove less for it, but a failure is a failure either way. Both voucher sets first go wrong at ₦800, the amount from earlier in the lesson; below that, greedy happens to be optimal for them, which is exactly why hand-testing a few small amounts is not enough.

## Summary

- A greedy algorithm builds an answer step by step, always taking the choice that looks best now and never undoing it. It is fast, usually a sort plus one pass, and only correct when you can prove the local choice is safe.
- Largest-note-first gives the fewest pieces for canonical systems like the naira. It fails with a limited supply of notes, and with non-canonical sets such as ₦500/₦400/₦100 vouchers, sometimes by answering "impossible" when an answer exists.
- To accept the most bookings in one room, sort by end time and accept every booking that starts after the last accepted one ends. Earliest start and shortest first are wrong rules.
- Prove greedy rules with an exchange argument (any optimal answer can be turned into the greedy one without getting worse) or by showing greedy stays ahead.
- The fewest rooms for all bookings equals the maximum number running at once; assigning each meeting in start order to any free room achieves it. Treat intervals as half-open, `[start, end)`, and store times as numbers.
- Greedy by value per kg is optimal for divisible goods, not for whole items. Test greedy code against brute force on small random inputs to find counterexamples automatically.

Next: [Backtracking](https://zudojs.oyinlola.site/learn/dsa-backtracking) handles the problems greedy cannot, by trying choices, undoing them when they lead nowhere, and pruning whole branches of the search early.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
