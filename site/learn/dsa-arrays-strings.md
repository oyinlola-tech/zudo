---
title: "Arrays and strings under the hood — ZudoJS Academy"
description: "Learn what array and string operations really cost, from indexing to shift and string building, then solve reverse, palindrome, anagram and rotate with tests."
source: https://zudojs.oyinlola.site/learn/dsa-arrays-strings
---

LEVEL 3 · LESSON 2 OF 21

Data structures Core

# Arrays and strings under the hood

Learn what array and string operations really cost, from indexing to shift and string building, then solve reverse, palindrome, anagram and rotate with tests.

- **50 min** to read and try
- **You need:** Big O and complexity, Arrays, and Objects and JSON
- **You build:** A tested toolkit of array and string functions (remove, insert, reverse, palindrome, anagram, rotate) with their costs

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain why reading arr[i] is O(1) and inserting at the front is O(n)
- Remove many items from an array in O(n) instead of O(n²)
- Explain why strings are immutable and build large strings without a hidden quadratic
- Reverse, check palindromes and anagrams, and rotate arrays, stating time and space
- Write edge-case tests for array and string functions

## Removing cancelled orders

A shop keeps today's orders in an array. Before the nightly report, it removes the cancelled ones. A developer wrote the obvious loop with `splice`, which removes items at a position:

remove-bug.js

```ts
const orders = [
  { id: "ORD-1", status: "paid" },
  { id: "ORD-2", status: "cancelled" },
  { id: "ORD-3", status: "cancelled" },
  { id: "ORD-4", status: "paid" },
  { id: "ORD-5", status: "cancelled" },
];

for (let i = 0; i < orders.length; i++) {
  if (orders[i].status === "cancelled") orders.splice(i, 1);
}

console.log(orders.map((o) => `${o.id}:${o.status}`).join(" "));
```

Output of `node remove-bug.js` and of the browser terminal

```ts
ORD-1:paid ORD-3:cancelled ORD-4:paid
```

`ORD-3` survived. When `splice` removed `ORD-2` at index 1, every later order moved one place to the left, so `ORD-3` slid into index 1. Then the loop moved on to index 2 and never looked at it.

That is a correctness bug, and it points at a cost. "Every later order moved one place" is work: for an array of `n` items, removing at index `i` moves `n - i - 1` items. Walking backwards fixes the bug, but not the cost. Count the moves:

remove-cost.js

```ts
function removeCancelledSplice(orders) {
  let moves = 0;
  for (let i = orders.length - 1; i >= 0; i--) {
    if (orders[i].status === "cancelled") {
      moves += orders.length - i - 1; // items that shift left
      orders.splice(i, 1);
    }
  }
  return moves;
}

function removeCancelledFilter(orders) {
  return orders.filter((o) => o.status !== "cancelled");
}

for (const n of [1000, 2000, 4000]) {
  const make = () => Array.from({ length: n }, (_, i) => ({ id: `ORD-${i}`, status: i % 3 === 0 ? "cancelled" : "paid" }));
  const a = make();
  const moves = removeCancelledSplice(a);
  const b = removeCancelledFilter(make());
  console.log(`n=${n}: splice moved ${moves} items, filter touched ${n}, same result: ${a.length === b.length}`);
}
```

Output of `node remove-cost.js` and of the browser terminal

```ts
n=1000: splice moved 111222 items, filter touched 1000, same result: true
n=2000: splice moved 444889 items, filter touched 2000, same result: true
n=4000: splice moved 1778222 items, filter touched 4000, same result: true
```

The `splice` loop is O(n²): doubling the orders quadruples the moves. `filter` reads each order once and writes the survivors into a new array: O(n) time, O(n) extra space. With 100,000 orders that is the difference between about a billion moves and 100,000.

To use arrays and strings well you need a model of how they sit in memory. This lesson builds that model, uses it to explain what each operation costs, and then solves four classic problems (reverse, palindrome, anagram, rotate) with tests and a stated complexity. It builds on [Big O and complexity](https://zudojs.oyinlola.site/learn/dsa-complexity); the array methods themselves are in [the Arrays lesson](https://zudojs.oyinlola.site/learn/js-arrays).

## How an array sits in memory

Memory is a long row of numbered bytes. The number of a byte is its **address**. An array stores its items in one **contiguous** block: slot 0, then slot 1 right after it, then slot 2, with no gaps. Every slot has the same size (in JavaScript engines, typically 8 bytes: a number, or a pointer to an object stored elsewhere).

```ts
address:   1000     1008     1016     1024     1032
         +--------+--------+--------+--------+--------+
 slots:  | ORD-1  | ORD-2  | ORD-3  | ORD-4  | ORD-5  |
         +--------+--------+--------+--------+--------+
 index:      0        1        2        3        4

 address of slot i = start + i × slot size
 slot 3            = 1000  + 3 × 8          = 1024
```

An array is one contiguous block: the address of any slot is computed from its index.

That formula is why **indexing is O(1)**: to read `orders[3]` the engine does one multiplication and one addition, whether the array holds five items or five million. It never walks past the earlier items.

The same layout explains the costs of changing an array:

- **At the end** (`push`, `pop`): write or clear one slot. O(1), with `push` amortized because the block sometimes has to grow (see [amortized cost](https://zudojs.oyinlola.site/learn/dsa-complexity#amortized)).
- **In the middle or at the front** (`splice`, `unshift`, `shift`): the slots must stay contiguous, so every item after the position moves one slot. O(n).

> NOTE
>
> JavaScript arrays are more flexible than this picture: they can hold mixed types, grow, and have holes. Engines keep the fast contiguous layout while you use an array like a list (fill it from index 0 upwards, no huge gaps). If you write `ids[1000000] = "x"` into an empty array, the engine may switch that array to a slower dictionary-like storage. Keep arrays dense.

dense.js

```ts
const ids = [];
ids[5] = "ORD-6";
console.log(ids.length, Object.keys(ids));
console.log(ids[0], 0 in ids);
```

Output of `node dense.js` and of the browser terminal

```ts
6 [ '5' ]
undefined false
```

The array claims a length of 6 but has one real item: indexes 0 to 4 are **holes**, missing entirely (`0 in ids` is `false`). Holes behave differently in different methods (`forEach` skips them, `for...of` does not), so they are a source of bugs as well as slow storage.

## Inserting and deleting: count the moves

To see the moves for yourself, build an array the way the engine does: a fixed block of slots and a length. `insertAt` opens a gap by moving items right, starting from the end; `removeAt` closes the gap by moving items left.

slot-array.js

```ts
export class SlotArray {
  constructor(capacity) {
    this.slots = new Array(capacity);
    this.length = 0;
    this.moves = 0;
  }

  get(index) {
    if (index < 0 || index >= this.length) throw new RangeError(`index ${index} out of range`);
    return this.slots[index];
  }

  insertAt(index, value) {
    if (this.length === this.slots.length) throw new RangeError("full");
    if (index < 0 || index > this.length) throw new RangeError(`index ${index} out of range`);
    for (let i = this.length; i > index; i--) {
      this.slots[i] = this.slots[i - 1]; // move right
      this.moves++;
    }
    this.slots[index] = value;
    this.length++;
  }

  removeAt(index) {
    const value = this.get(index);
    for (let i = index; i < this.length - 1; i++) {
      this.slots[i] = this.slots[i + 1]; // move left
      this.moves++;
    }
    this.length--;
    this.slots[this.length] = undefined;
    return value;
  }

  toArray() {
    return this.slots.slice(0, this.length);
  }
}
```

slot-demo.js

```ts
import { SlotArray } from "./slot-array.js";

const list = new SlotArray(10);
for (const id of ["B-1", "B-2", "B-3", "B-4"]) list.insertAt(list.length, id); // append
console.log(list.toArray(), "moves:", list.moves);
list.insertAt(0, "B-0");
console.log(list.toArray(), "moves:", list.moves);
list.removeAt(2);
console.log(list.toArray(), "moves:", list.moves);
```

Output of `node slot-demo.js` and of the browser terminal

```json
[ 'B-1', 'B-2', 'B-3', 'B-4' ] moves: 0
[ 'B-0', 'B-1', 'B-2', 'B-3', 'B-4' ] moves: 4
[ 'B-0', 'B-1', 'B-3', 'B-4' ] moves: 6
```

Appending cost no moves. Inserting at the front moved all four items. Removing index 2 of 5 moved the two items after it. In general:

| Operation on an array of n items | Moves | Time |
| --- | --- | --- |
| read or write `arr[i]` | 0 | O(1) |
| insert or remove at the end (`push`, `pop`) | 0 | O(1) (push amortized) |
| insert or remove at index `i` (`splice`) | `n - i` or `n - i - 1` | O(n - i), so O(n) in the worst case |
| insert or remove at the front (`unshift`, `shift`) | `n` or `n - 1` | O(n) |
| find a value (`indexOf`, `includes`) | 0, but up to `n` reads | O(n) |

### A real case: a sorted booking list

A clinic keeps today's appointments sorted by time, so the reception screen can show them in order. Every new booking is inserted at its place. Finding the place can be fast (binary search, O(log n), in [the searching lesson](https://zudojs.oyinlola.site/learn/dsa-searching)), but opening the gap is not:

bookings.js

```ts
import { SlotArray } from "./slot-array.js";

function insertSorted(list, time) {
  let index = 0;
  while (index < list.length && list.get(index) < time) index++;
  list.insertAt(index, time);
}

const early = new SlotArray(1000);
const late = new SlotArray(1000);
for (let t = 0; t < 500; t++) {
  insertSorted(early, 1000 - t); // each new booking is earlier than all others
  insertSorted(late, 1000 + t); // each new booking is later than all others
}
console.log("always earliest:", early.moves, "moves");
console.log("always latest:", late.moves, "moves");
console.log(early.get(0), early.get(499), late.get(0), late.get(499));
```

Output of `node bookings.js` and of the browser terminal

```ts
always earliest: 124750 moves
always latest: 0 moves
501 1000 1000 1499
```

The same 500 bookings cost 124,750 moves when every new one belongs at the front, and none when every new one belongs at the end. The worst case of a sorted insert is O(n) moves per booking, O(n²) for `n` bookings. When bookings arrive in time order (the common case), the sorted array is cheap; when they arrive in random order, a structure that keeps order without moving items, such as a balanced tree from [the trees lesson](https://zudojs.oyinlola.site/learn/dsa-trees), is the better choice (or a heap from [the heaps lesson](https://zudojs.oyinlola.site/learn/dsa-heaps), if the screen only ever needs the *next* appointment).

## shift and unshift: the hidden O(n)

`shift()` removes the first item, and the language specification defines it as moving every other item one place to the left: O(n). `unshift(x)` is the mirror image. A loop that calls `shift` until the array is empty is therefore O(n²), the same trap as the `splice` loop.

V8, the engine in Node.js and Chrome, has a trick for some arrays (it can move the start of the block instead of the items), so small arrays often shift quickly. You cannot rely on it: on large arrays the moves come back. A payout job that processes 50,000 queued transfers shows the difference between `shift` and simply walking an index forward:

shift-cost.js

```ts
function drainWithShift(transfers) {
  let total = 0;
  while (transfers.length > 0) total += transfers.shift().amount;
  return total;
}

function drainWithIndex(transfers) {
  let total = 0;
  for (let next = 0; next < transfers.length; next++) total += transfers[next].amount;
  return total;
}

function timeIt(fn, makeInput) {
  const input = makeInput();
  const start = performance.now();
  const result = fn(input);
  return { ms: performance.now() - start, result };
}

const make = () => Array.from({ length: 50000 }, (_, i) => ({ id: `TRF-${i}`, amount: 150000 }));
timeIt(drainWithIndex, make); // warm-up
const shifted = timeIt(drainWithShift, make);
const indexed = timeIt(drainWithIndex, make);
console.log("same total:", shifted.result === indexed.result, shifted.result);
console.log("index is over 10 times faster:", shifted.ms > 10 * indexed.ms);
```

Output of `node shift-cost.js` and of the browser terminal

```ts
same total: true 7500000000
index is over 10 times faster: true
```

Walking an index is O(1) per item, so the whole drain is O(n). When you need a real queue (items arriving at the back while others leave at the front), use the queue structures from [the stacks and queues lesson](https://zudojs.oyinlola.site/learn/dsa-stacks-queues), which never move items.

## Strings are immutable

A **string** is a sequence of UTF-16 **code units** (16-bit numbers; most characters are one code unit, some such as emoji are two). Like an array, it supports O(1) indexing: `code[2]` and `code.length` do not depend on the length of the string.

Unlike an array, a string is **immutable**: once created, it never changes. Every method that seems to change a string returns a *new* one, and creating it costs time proportional to its length:

immutable.js

```ts
const currency = "ngn";
const upper = currency.toUpperCase();
const padded = currency.padStart(6, "*");
console.log(currency, upper, padded);

const receipt = "Total: ₦4,500";
console.log(receipt[0], receipt.length, receipt.at(-1));
console.log(receipt.replace("4,500", "5,000"), "|", receipt);
```

Output of `node immutable.js` and of the browser terminal

```ts
ngn NGN ***ngn
T 13 0
Total: ₦5,000 | Total: ₦4,500
```

`currency` and `receipt` are unchanged after all those calls. In a module (every example on this site is one) or in strict mode, assigning to an index such as `currency[0] = "N"` throws a `TypeError`; in old sloppy scripts it is silently ignored. Either way the string stays the same.

Immutability is why strings are safe to share: a function that receives your string cannot change it behind your back. The price is that every modification is a copy. `slice`, `toUpperCase`, `replace`, `trim` and `split` are all O(length). (`+` is the exception the next section explains.)

> TIP
>
> Why does `"₦".length` equal 1 but `"🎉".length` equal 2? The naira sign fits in one UTF-16 code unit; the emoji needs two. This matters as soon as you reverse or cut strings, which the [reverse](#reverse) section shows. [The strings lesson](https://zudojs.oyinlola.site/learn/js-strings) covers code points and grapheme clusters in depth.

## Building a big string

A bank exports a statement as text: one line per transaction. If every `+=` copied the whole string built so far, like the spread in the [hidden quadratic](https://zudojs.oyinlola.site/learn/dsa-complexity#analyse), then building `n` lines would copy about `n²/2` lines' worth of characters. Count what a naive copy-on-every-concatenation engine would do:

naive-concat-model.js

```ts
function naiveCopies(lines) {
  let length = 0;
  let copied = 0;
  for (const line of lines) {
    copied += length + line.length; // copy the old string and the new line
    length += line.length;
  }
  return copied;
}

for (const n of [1000, 2000, 4000]) {
  const lines = Array.from({ length: n }, (_, i) => `TX-${String(i).padStart(5, "0")},150000,NGN\n`);
  const total = lines.join("").length;
  console.log(`${n} lines (${total} chars): naive copying moves ${naiveCopies(lines)} chars, join moves ${total}`);
}
```

Output of `node naive-concat-model.js` and of the browser terminal

```ts
1000 lines (20000 chars): naive copying moves 10010000 chars, join moves 20000
2000 lines (40000 chars): naive copying moves 40020000 chars, join moves 40000
4000 lines (80000 chars): naive copying moves 160040000 chars, join moves 80000
```

Real engines are smarter. V8 represents `a + b` as a small node that points at both halves (a **rope**) and copies nothing yet, so a loop that only appends is fast. The copy happens later, all at once, when something needs the characters in one piece. This is called **flattening**. The trap is a loop that appends *and* reads the string it is building: every read flattens, so every iteration copies everything again.

flatten-trap.js

```ts
function statementReading(lines) {
  let text = "";
  for (const line of lines) {
    if (text.length > 0 && !text.endsWith("\n")) text += "\n"; // reads the text: flattens it
    text += line + "\n";
  }
  return text;
}

function statementJoin(lines) {
  return lines.join("\n") + "\n";
}

function bestTime(fn, input, runs = 3) {
  fn(input);
  let best = Infinity;
  for (let r = 0; r < runs; r++) {
    const start = performance.now();
    fn(input);
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

const lines = Array.from({ length: 5000 }, (_, i) => `TX-${i},150000,NGN`);
console.log("same text:", statementReading(lines) === statementJoin(lines));
console.log("join is over 10 times faster:", bestTime(statementReading, lines) > 10 * bestTime(statementJoin, lines));
```

Output of `node flatten-trap.js` and of the browser terminal

```ts
same text: true
join is over 10 times faster: true
```

The rule that works on every engine: **collect the pieces in an array and `join` once**. `join` knows the total length up front, allocates the result once and copies each piece once: O(total length). Plain `+=` in a loop is fine in modern engines as long as the loop does not also inspect the string.

## Before you write the classic problems

REASON IT OUT

### What does "the same" mean?

The next section checks palindromes (text that reads the same backwards) and anagrams (two texts with the same letters in a different order). Before writing any code, decide:

1. Is `"Level"` a palindrome? Is `"Was it a car or a cat I saw?"`? What about `""` and `"a"`?
2. Are `"Dormitory"` and `"dirty room"` anagrams?
3. What happens to a palindrome check if the string contains an emoji like `"🎉"`?
4. Which is cheaper in memory: comparing a string with a reversed copy, or comparing from both ends inwards?
5. What is the fastest possible time for either check, and why can you not beat it?

**Show the reasoning**

1. It depends on your rules, and you must write them down. The usual rule for sentences: ignore case, spaces and punctuation. Then both are palindromes. `""` and `"a"` read the same both ways, so they are palindromes too; your tests should say so explicitly.
2. With the same rule (ignore case and spaces), yes: both contain d, o, r, m, i, t, o, r, y.
3. An emoji is two code units. Reversing code units swaps them and produces an invalid character. Work with code points (`[...text]`) or compare from both ends with code points. For a plain comparison you can often avoid reversing entirely.
4. The reversed copy costs O(n) extra space. Two indexes moving inwards cost O(1) extra space (after any normalization).
5. O(n): every character might be the one that differs, so any correct algorithm has to look at all of them in the worst case. That is a lower bound, Ω(n), and both checks below reach it.

## Reverse

Reversing an array in place with two indexes is O(n) time and O(1) extra space; you met it in [space complexity](https://zudojs.oyinlola.site/learn/dsa-complexity#space). For a string, you must build a new one anyway (strings are immutable), so the extra space is O(n) whatever you do. The subtle part is what you reverse:

reverse-string.js

```ts
function reverseUnits(text) {
  return text.split("").reverse().join(""); // UTF-16 code units
}

function reverseCodePoints(text) {
  return [...text].reverse().join(""); // code points: emoji stay whole
}

const note = "Paid ₦500 🎉";
console.log(reverseCodePoints(note));
console.log(reverseUnits(note) === reverseCodePoints(note));
console.log(reverseUnits("🎉").length, [...reverseUnits("🎉")].map((c) => c.codePointAt(0).toString(16)));
```

Output of `node reverse-string.js` and of the browser terminal

```ts
🎉 005₦ diaP
false
2 [ 'df89', 'd83c' ]
```

`split("")` cuts the emoji into its two halves (called **surrogates**: `d83c` and `df89`) and reversing puts them in the wrong order, which is no longer a valid character. Spreading a string with `[...text]` iterates by **code point**, which keeps each emoji whole. (Some emoji are several code points joined together, such as flags and family emoji; only `Intl.Segmenter` handles those, covered in [the strings lesson](https://zudojs.oyinlola.site/learn/js-strings).) Both versions are O(n) time and O(n) space.

## Palindrome

A payment reference system rejects "vanity" references that read the same backwards. Following the rules from the reasoning above: ignore case and anything that is not a letter or digit.

palindrome.js

```ts
function normalize(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function isPalindrome(text) {
  const clean = [...normalize(text)];
  let left = 0;
  let right = clean.length - 1;
  while (left < right) {
    if (clean[left] !== clean[right]) return false;
    left++;
    right--;
  }
  return true;
}

function check(label, actual, expected) {
  console.log(`${actual === expected ? "PASS" : "FAIL"} ${label}`);
}

check("simple", isPalindrome("level"), true);
check("mixed case", isPalindrome("Level"), true);
check("sentence with punctuation", isPalindrome("Was it a car or a cat I saw?"), true);
check("even length", isPalindrome("abba"), true);
check("not a palindrome", isPalindrome("REF-2024"), false);
check("empty string", isPalindrome(""), true);
check("one character", isPalindrome("a"), true);
check("only punctuation", isPalindrome("?!"), true);
check("emoji in the middle", isPalindrome("ab🎉ba"), true);
check("digits count", isPalindrome("12321"), true);
```

Output of `node palindrome.js` and of the browser terminal

```ts
PASS simple
PASS mixed case
PASS sentence with punctuation
PASS even length
PASS not a palindrome
PASS empty string
PASS one character
PASS only punctuation
PASS emoji in the middle
PASS digits count
```

`\p{L}` and `\p{N}` in the regular expression mean "any letter" and "any digit" in any alphabet (the `u` flag enables them), so accented names and non-Latin scripts work. Complexity: normalizing is O(n) time and O(n) space (a new string and an array of code points), the comparison is O(n) time and O(1) extra space, so the whole function is O(n) time and O(n) space. The two indexes walking inwards are the [two pointers](https://zudojs.oyinlola.site/learn/pattern-two-pointers) pattern, which has a lesson of its own later in this course.

Notice the test for `"?!"`: after normalization it is empty. Is an empty reference a palindrome? Mathematically yes, but the payment system should probably reject empty references before this check even runs. Tests are where you discover questions like that.

## Anagram

Customers sometimes type a voucher code with two letters swapped. Support wants to know whether a typed code is an anagram of a real one (same characters, different order), to suggest "did you mean…?". Two approaches:

anagram.js

```ts
function normalize(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function isAnagramSort(a, b) {
  const x = [...normalize(a)].sort().join("");
  const y = [...normalize(b)].sort().join("");
  return x === y;
}

function isAnagramCount(a, b) {
  const x = normalize(a);
  const y = normalize(b);
  if (x.length !== y.length) return false;
  const counts = new Map();
  for (const ch of x) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  for (const ch of y) {
    const left = counts.get(ch);
    if (!left) return false; // missing or already used up
    counts.set(ch, left - 1);
  }
  return true;
}

const cases = [
  ["SAVE20NGN", "SVAE20NGN", true],
  ["Dormitory", "dirty room", true],
  ["SAVE20", "SAVE02", true],
  ["SAVE20", "SAVE21", false],
  ["aab", "abb", false],
  ["", "", true],
];
for (const [a, b, expected] of cases) {
  const sort = isAnagramSort(a, b);
  const count = isAnagramCount(a, b);
  console.log(`${sort === expected && count === expected ? "PASS" : "FAIL"} "${a}" vs "${b}" -> ${count}`);
}
```

Output of `node anagram.js` and of the browser terminal

```ts
PASS "SAVE20NGN" vs "SVAE20NGN" -> true
PASS "Dormitory" vs "dirty room" -> true
PASS "SAVE20" vs "SAVE02" -> true
PASS "SAVE20" vs "SAVE21" -> false
PASS "aab" vs "abb" -> false
PASS "" vs "" -> true
```

- **Sorting** both strings makes anagrams identical. Sorting is O(n log n) time and O(n) space. Short and hard to get wrong.
- **Counting** each character with a `Map` is O(n) time. Its extra space is O(k), where `k` is the number of *different* characters (at most 36 for codes of letters and digits, so effectively constant).

The `"aab"` vs `"abb"` case is the one that catches buggy versions: both strings use only `a` and `b` and have the same length, and only the counts differ. The counting approach is the **frequency counter** pattern; [the next lesson](https://zudojs.oyinlola.site/learn/dsa-hash-maps) explains why `Map` makes it fast, and [the frequency pattern lesson](https://zudojs.oyinlola.site/learn/pattern-frequency) applies it to many more problems.

## Rotate

A support team has a weekly on-call rota. Each week it rotates by one place: whoever was last moves to the front. Rotating an array right by `k` means every item moves `k` places towards the end, and the items that fall off the end come back at the front.

rotate.js

```ts
function rotateCopy(items, k) {
  const n = items.length;
  if (n === 0) return [];
  const shift = ((k % n) + n) % n; // handles k > n and negative k
  return [...items.slice(n - shift), ...items.slice(0, n - shift)];
}

function reverseRange(items, from, to) {
  while (from < to) {
    [items[from], items[to]] = [items[to], items[from]];
    from++;
    to--;
  }
}

function rotateInPlace(items, k) {
  const n = items.length;
  if (n === 0) return items;
  const shift = ((k % n) + n) % n;
  reverseRange(items, 0, n - 1); // E D C B A
  reverseRange(items, 0, shift - 1); // D E | C B A   (for shift = 2)
  reverseRange(items, shift, n - 1); // D E | A B C
  return items;
}

const rota = ["Ada", "Bola", "Chidi", "Dayo", "Efe"];
console.log(rotateCopy(rota, 2).join(" "));
console.log(rotateInPlace([...rota], 2).join(" "));

const tests = [[0], [1], [5], [7], [-1], [12]];
for (const [k] of tests) {
  const a = rotateCopy(rota, k).join(" ");
  const b = rotateInPlace([...rota], k).join(" ");
  console.log(`k=${k}: ${a === b ? "PASS" : "FAIL"} ${a}`);
}
console.log("empty:", rotateCopy([], 3).length, rotateInPlace([], 3).length);
```

Output of `node rotate.js` and of the browser terminal

```ts
Dayo Efe Ada Bola Chidi
Dayo Efe Ada Bola Chidi
k=0: PASS Ada Bola Chidi Dayo Efe
k=1: PASS Efe Ada Bola Chidi Dayo
k=5: PASS Ada Bola Chidi Dayo Efe
k=7: PASS Dayo Efe Ada Bola Chidi
k=-1: PASS Bola Chidi Dayo Efe Ada
k=12: PASS Dayo Efe Ada Bola Chidi
empty: 0 0
```

Three details carry this solution:

- **Normalize k.** Rotating 5 items by 5 changes nothing, so only `k % n` matters. In JavaScript `-1 % 5` is `-1`, not 4, so `((k % n) + n) % n` turns a left rotation into the equivalent right one. And `n === 0` must be handled first, or `k % 0` is `NaN`.
- **The copy** is two slices: O(n) time and O(n) extra space. Clear, and it leaves the input alone.
- **The three reversals** rotate in place: each item is swapped at most twice, so O(n) time and O(1) extra space. Useful when the array is huge or when the caller wants it changed.

The naive alternative, `k` times "`items.unshift(items.pop())`", is O(n · k): each `unshift` moves every item.

## Testing array and string functions

Array and string bugs live at the edges. For every function in this lesson, the tests covered a checklist worth reusing:

| Edge | Example | Catches |
| --- | --- | --- |
| empty input | `[]`, `""` | `n - 1` becoming `-1`, division or `% 0` |
| one item | `["Ada"]`, `"a"` | loops that assume a pair |
| odd and even lengths | `"level"`, `"abba"` | off-by-one in two-index loops |
| the change at the first and last position | duplicate first, cancelled last | loops that start or stop one early |
| adjacent matches | two cancelled orders in a row | skipped items after `splice` |
| sizes beyond the length | `k = 7` for 5 items, negative `k` | missing normalization |
| non-ASCII text | `"₦"`, `"🎉"`, accented letters | code unit vs code point bugs |
| same multiset, different counts | `"aab"` vs `"abb"` | anagram checks that only compare sets |

A second habit from [the complexity lesson](https://zudojs.oyinlola.site/learn/dsa-complexity#testing): test a fast in-place version against a simple copying version (as the rotate tests did), and assert on moves or steps rather than timings. Here is the fixed `removeCancelled` checked both ways:

remove-tests.js

```ts
function removeCancelledInPlace(orders) {
  let write = 0;
  for (let read = 0; read < orders.length; read++) {
    if (orders[read].status !== "cancelled") {
      orders[write] = orders[read];
      write++;
    }
  }
  const writes = write;
  orders.length = write; // cut off the leftovers
  return writes;
}

function check(label, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}`);
}

const make = (statuses) => statuses.map((status, i) => ({ id: `ORD-${i + 1}`, status }));
const ids = (orders) => orders.map((o) => o.id).join(",");

const cases = [
  [],
  ["paid"],
  ["cancelled"],
  ["cancelled", "cancelled", "paid"],
  ["paid", "cancelled", "cancelled", "paid", "cancelled"],
];
for (const statuses of cases) {
  const expected = ids(make(statuses).filter((o) => o.status !== "cancelled"));
  const orders = make(statuses);
  removeCancelledInPlace(orders);
  check(`[${statuses.join(" ")}] -> [${ids(orders)}]`, ids(orders) === expected);
}

const big = make(Array.from({ length: 10000 }, (_, i) => (i % 2 ? "paid" : "cancelled")));
check("10,000 orders: at most one write per order", removeCancelledInPlace(big) <= 10000);
check("10,000 orders: 5,000 remain", big.length === 5000);
```

Output of `node remove-tests.js` and of the browser terminal

```ts
PASS [] -> []
PASS [paid] -> [ORD-1]
PASS [cancelled] -> []
PASS [cancelled cancelled paid] -> [ORD-3]
PASS [paid cancelled cancelled paid cancelled] -> [ORD-1,ORD-4]
PASS 10,000 orders: at most one write per order
PASS 10,000 orders: 5,000 remain
```

The in-place version keeps a *read* index and a *write* index: every kept order is copied once to the write position. O(n) time and O(1) extra space, and adjacent cancelled orders are no problem because nothing ever shifts. Setting `orders.length` to a smaller number truncates the array.

## Arrays and strings in production

- **Prefer building a new array** (`filter`, `map`) over deleting from an existing one, unless memory is tight. It avoids both the skipped-item bug and the O(n²) moves, and it does not surprise other code that holds the same array.
- **The copying methods cost O(n).** `toSorted`, `toReversed`, `toSpliced` and `with` (ES2023) never change the original, which is safer, but each call copies. Calling them inside a loop over the same array is a hidden quadratic.
- **Numbers in bulk**: for a million prices, a typed array such as `Float64Array` or `Int32Array` stores raw numbers contiguously with no per-item overhead. It has a fixed length. Mind the range: an `Int32Array` holds at most 2,147,483,647, which is only about ₦21 million in kobo.
- **Normalize text at the boundary.** Trim, fix the case and apply Unicode normalization (`text.normalize("NFC")`) once when input arrives, so every comparison afterwards is a plain `===`.
- **Limit input sizes.** An O(n²) algorithm on a user-supplied string of 10 MB is a denial of service. Reject oversized input before any expensive work.
- **Stream large exports.** A statement with a million lines does not need to exist as one string: write each chunk to the response or file as it is produced (see [streams](https://zudojs.oyinlola.site/learn/node-streams)), which keeps memory O(1) in the number of lines.

## Practice

TRY IT YOURSELF

### Insert without splice

Write `insertAt(items, index, value)` for a plain JavaScript array without `splice`: grow the array by one, move the items after `index` one place right (starting from the end), then write the value. Return the number of moves, and throw a `RangeError` for an index outside `0` to `items.length`. Why must the loop start from the end?

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Writing `items[items.length]` first grows the array by one slot. Then walk an index down from `items.length` to just above `index`, copying each item one place right before you overwrite its old slot.

HINT 2

`for (let i = items.length; i > index; i--) { items[i] = items[i - 1]; moves++; }`, then `items[index] = value;` after the loop.

SOLUTION

insert-at.js

```ts
function insertAt(items, index, value) {
  if (!Number.isInteger(index) || index < 0 || index > items.length) {
    throw new RangeError(`index ${index} out of range`);
  }
  let moves = 0;
  for (let i = items.length; i > index; i--) {
    items[i] = items[i - 1];
    moves++;
  }
  items[index] = value;
  return moves;
}

const queue = ["Ada", "Bola", "Chidi"];
console.log(insertAt(queue, 1, "Dayo"), queue.join(" "));
console.log(insertAt(queue, 0, "Efe"), queue.join(" "));
console.log(insertAt(queue, queue.length, "Femi"), queue.join(" "));
try {
  insertAt(queue, 9, "Gbenga");
} catch (error) {
  console.log(error.name, error.message);
}
```

Output of `node insert-at.js` and of the browser terminal

```ts
2 Ada Dayo Bola Chidi
4 Efe Ada Dayo Bola Chidi
0 Efe Ada Dayo Bola Chidi Femi
RangeError index 9 out of range
```

Writing `items[items.length]` first grows the array by one (it is the next dense slot). If the loop started at `index` and moved forwards, it would copy `items[index]` into `items[index + 1]`, overwriting that item before it was moved, and the same value would be smeared across the rest of the array. Moving from the end means every item is copied before its slot is overwritten. Moves: `items.length - index`, so O(n) at the front and O(1) at the end.

TRY IT YOURSELF

### Is it a rotation?

A rota was rotated by some unknown `k`. Write `isRotation(a, b)` for two strings: `true` when `b` is `a` rotated by any amount. Hint: every rotation of `a` appears inside `a + a`. State the complexity.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Two strings of different lengths can never be rotations of each other. For equal lengths, think about what every rotation of `a` has in common when you write out `a + a`.

HINT 2

`return a.length === b.length && (a + a).includes(b);`

SOLUTION

is-rotation.js

```ts
function isRotation(a, b) {
  return a.length === b.length && (a + a).includes(b);
}

console.log(isRotation("ABCDE", "DEABC"));
console.log(isRotation("ABCDE", "ABCED"));
console.log(isRotation("ABCDE", "ABCDE"));
console.log(isRotation("", ""));
console.log(isRotation("AB", "ABAB"));
```

Output of `node is-rotation.js` and of the browser terminal

```ts
true
false
true
true
false
```

`a + a` is O(n) time and space. `includes` is a substring search: engines use fast algorithms that are usually close to O(n), but a simple search can be O(n · m) in the worst case (m is the length of `b`). The length check is essential: without it, `"A"` would count as a rotation of `"AB"` (`"ABAB"` contains `"A"`), and so would `"ABAB"` itself, because `"AB" + "AB"` is exactly `"ABAB"`.

TRY IT YOURSELF

### Compress a stock log

A warehouse scanner logs one letter per scanned box: `"AAABCCDDDD"`. Write `compress(log)` that returns `"A3B1C2D4"`, building the result with an array and `join`. Handle the empty log. What is the complexity?

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Inside the outer `while`, grow `run` with an inner loop as long as the next character equals `log[i]`. Then you know the whole run's length before you push anything.

HINT 2

`while (i + run < log.length && log[i + run] === log[i]) run++;` then `parts.push(log[i], String(run)); i += run;`. Without `i += run` the outer loop never advances.

SOLUTION

compress.js

```ts
function compress(log) {
  const parts = [];
  let i = 0;
  while (i < log.length) {
    let run = 1;
    while (i + run < log.length && log[i + run] === log[i]) run++;
    parts.push(log[i], String(run));
    i += run;
  }
  return parts.join("");
}

console.log(compress("AAABCCDDDD"));
console.log(compress("ABC"));
console.log(JSON.stringify(compress("")));
console.log(compress("Z".repeat(12)));
```

Output of `node compress.js` and of the browser terminal

```ts
A3B1C2D4
A1B1C1
""
Z12
```

Even though there are two loops, `i` jumps forward by the length of each run, so every character is read once: O(n) time. The output has at most `2n` characters: O(n) space. `"ABC"` becomes longer than the input, a known weakness of this format; a real system would keep whichever is shorter.

## Summary

- An array is a contiguous block of equal-sized slots, so `arr[i]` is O(1): start + i × slot size.
- Changing the end is O(1); changing the front or middle moves every later item: `splice`, `shift` and `unshift` are O(n), and calling them in a loop is O(n²).
- To remove many items, build a new array with `filter`, or compact in place with a read index and a write index: O(n) either way.
- Strings are immutable: every "change" returns a new string in O(length). Collect pieces in an array and `join` once; never read a string you are building in the same loop.
- Reverse by code point (`[...text]`), not by code unit (`split("")`), or emoji break.
- Palindrome: normalize, then two indexes inwards, O(n). Anagram: sort, O(n log n), or count, O(n). Rotate: two slices, O(n) space, or three reversals, O(1) space; always normalize `k` and handle empty input.
- Test the edges: empty, one item, odd and even lengths, adjacent matches, `k` beyond the length, non-ASCII text.

Next: [Hash maps and sets](https://zudojs.oyinlola.site/learn/dsa-hash-maps), the structure behind every O(1) lookup in this lesson.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
