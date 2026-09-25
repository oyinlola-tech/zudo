---
title: "The frequency counter pattern — ZudoJS Academy"
description: "Replace nested loops with one counting pass: check anagram usernames, reconcile lists, find the first unmatched entry and the majority, in O(n)."
source: https://zudojs.oyinlola.site/learn/pattern-frequency
---

LEVEL 3 · LESSON 17 OF 21

Problem-solving patterns Core

# The frequency counter pattern

Replace nested loops with one counting pass: check anagram usernames, reconcile lists, find the first unmatched entry and the majority, in O(n).

- **45 min** to read and try
- **You need:** Big O and complexity, Arrays and strings under the hood, and Hash maps and sets
- **You build:** A username impersonation check backed by a signature index, plus O(n) solutions for list reconciliation, first unique entry and majority vote

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Recognise problems where only how often each value appears matters, not where it appears
- Count the operations of a nested-loop solution and predict how it grows
- Build a frequency table with a Map or a fixed-size array and answer questions from it in O(n)
- Solve anagram, reconciliation, first-unique and majority problems and state their time and space
- Normalise input before counting and test a counter against a slower reference

## The problem: usernames with the same letters

A payments app lets people send money to a username. Scammers have learned a trick: they register a username that uses exactly the letters of a well-known account, shuffled, such as `supportbola` copied as `bolasupport` or `suppotrbola`. In a busy list of contacts the two look alike, and people send money to the wrong one.

The trust team asks for a check at sign-up: *"Is the new username an anagram of a protected username?"* Two strings are **anagrams** when they contain the same characters the same number of times, in any order. You met the anagram check briefly in [Arrays and strings under the hood](https://zudojs.oyinlola.site/learn/dsa-arrays-strings#anagram); this lesson takes the idea behind it, turns it into a general tool, and uses it on problems that have nothing to do with letters.

Every lesson in this module follows the same seven steps, because that is how you meet these problems at work and in interviews:

1. the problem,
2. a naive solution, the first thing that works,
3. what is wrong with it, measured by counting operations,
4. the pattern that fixes it,
5. the improved solution,
6. its complexity,
7. new problems to practise the pattern on.

A **pattern** here means a reusable shape of solution: a way of organising the work that fits a whole family of problems. Once you know the shape, you stop inventing each solution from scratch and start recognising which family a new problem belongs to.

REASON IT OUT

### Before you code: what does 'same letters' mean?

- Are `SupportBola` and `bolasupport` anagrams? What about `support_bola`?
- Is `supportbolaa` (one extra `a`) an anagram of `supportbola`?
- Does the *position* of any letter matter to the answer? What is the only thing about each letter that matters?
- What should two empty strings give?
- What is the quickest possible "no"?

**Show the reasoning**

**Case and separators:** the check exists to catch look-alikes, so compare usernames after the same normalisation the app uses when it stores them: lower case, and (for this check) ignoring `_` and `.`. Decide this before coding; the algorithm cannot guess it.

**Counts matter:** `supportbolaa` has two `a`s, so it is not an anagram. "Uses the same set of letters" is not enough. This is the case that breaks the most first attempts.

**Position does not matter at all.** The only fact about each character that decides the answer is *how many times it appears*. That sentence is the key to the whole lesson.

**Two empty strings** are anagrams of each other: every character (there are none) appears the same number of times.

**Quickest no:** different lengths. Strings of different lengths cannot contain the same characters the same number of times.

## A naive solution: find and cross off

The first idea most people have is how you would do it on paper: for each letter of the first word, find it in the second word and cross it off. If a letter cannot be found, the answer is no. If everything is crossed off, yes.

naive-anagram.js

```ts
function normalizeUsername(name) {
  return name.toLowerCase().replace(/[._]/g, "");
}

function isAnagramNaive(a, b) {
  if (a.length !== b.length) return false;
  const remaining = [...b];
  for (const ch of a) {
    const at = remaining.indexOf(ch);   // find it...
    if (at === -1) return false;
    remaining.splice(at, 1);            // ...and cross it off
  }
  return true;
}

const protectedName = normalizeUsername("support_bola");
for (const candidate of ["BolaSupport", "suppotr.bola", "supportbolaa", "supportbole"]) {
  console.log(candidate.padEnd(13), isAnagramNaive(protectedName, normalizeUsername(candidate)));
}
```

Output of `node naive-anagram.js` and of the browser terminal

```ts
BolaSupport   true
suppotr.bola  true
supportbolaa  false
supportbole   false
```

It is correct, including the `supportbolaa` case, because crossing off uses each letter of `b` once. For two usernames of 11 letters it is also perfectly fast. So why not stop here?

## What is wrong with it: count the operations

The same "same items, any order" question appears on much longer inputs. A warehouse packs an order of 5,000 lines, and before the van leaves someone must check that the packing manifest holds exactly the ordered item codes, in whatever order they were picked. That is the anagram question on arrays. The naive function works on arrays too, so measure it there.

As in [Big O and complexity](https://zudojs.oyinlola.site/learn/dsa-complexity#counting-steps), you count operations instead of timing the code, because a count depends only on the algorithm and the input. Here the operations are the element comparisons inside `indexOf` and the elements `splice` shifts left, which are exactly the hidden loops in those two methods:

naive-count.js

```ts
function sameItemsNaive(a, b, counter) {
  if (a.length !== b.length) return false;
  const remaining = [...b];
  for (const item of a) {
    let at = -1;
    for (let i = 0; i < remaining.length; i++) {
      counter.compares++;
      if (remaining[i] === item) { at = i; break; }
    }
    if (at === -1) return false;
    counter.shifts += remaining.length - at - 1; // what splice moves
    remaining.splice(at, 1);
  }
  return true;
}

for (const n of [10, 100, 1000, 10000]) {
  const ordered = Array.from({ length: n }, (_, i) => `SKU-${i}`);
  const packed = [...ordered].reverse(); // picked in the opposite order
  const counter = { compares: 0, shifts: 0 };
  const same = sameItemsNaive(ordered, packed, counter);
  console.log(`n=${String(n).padEnd(6)} same=${same} compares=${counter.compares} shifts=${counter.shifts}`);
}
```

Output of `node naive-count.js` and of the browser terminal

```ts
n=10     same=true compares=55 shifts=0
n=100    same=true compares=5050 shifts=0
n=1000   same=true compares=500500 shifts=0
n=10000  same=true compares=50005000 shifts=0
```

Ten times more lines means about a hundred times more comparisons: `n(n + 1) / 2` of them, which is O(n²). With 10,000 lines the check does 50 million comparisons. The shifts happen to be zero here only because each match is at the end; put the matches at the front and `splice` adds another O(n²) of moving.

The root of the waste is that the naive solution keeps asking a *position* question ("where in `b` is this letter?") when the problem only needs a *count* question ("how many of this letter are there?"). Every search throws away what it learned, and the next search starts again from the beginning.

> NOTE
>
> Sorting both lists and comparing them, the first of the two versions in [Arrays and strings under the hood](https://zudojs.oyinlola.site/learn/dsa-arrays-strings#anagram), brings this down to O(n log n). That is a real improvement, and a fine answer when you need the sorted order anyway. The pattern in this lesson goes further, to O(n).

## The pattern: count once, then answer from the counts

The **frequency counter** pattern replaces repeated searching with one counting pass:

1. Walk the input once and build a **frequency table**: for each distinct value, the number of times it appears. In JavaScript that is a `Map` from value to count.
2. Answer the question by looking values up in the table, which is O(1) on average per lookup (see [Hash maps and sets](https://zudojs.oyinlola.site/learn/dsa-hash-maps) for why).

```ts
input:  s u p p o r t b o l a

table:  s:1  u:1  p:2  o:2  r:1  t:1  b:1  l:1  a:1
        (built in one pass; the positions are gone, only counts remain)
```

The table is a summary that forgets exactly what the problem does not care about (positions) and keeps exactly what it does care about (counts). That is why the pattern works, and it also tells you when it does *not* work: if the answer depends on order or position, a frequency table has thrown the answer away.

### How to recognise it

Reach for a frequency counter when the problem statement says, or means:

- "same items in any order", "a rearrangement of", "an anagram of",
- "how many times", "the most common", "appears more than half the time",
- "appears exactly once", "has a duplicate", "is unmatched",
- "can this be built from that" (an order from stock, a word from tiles).

And be suspicious whenever your first draft has a loop inside a loop that searches for equal values. That inner loop is often a lookup that a table would answer in one step.

### The shape in code

count-shape.js

```ts
function countValues(items) {
  const counts = new Map();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
}

console.log(countValues("supportbola"));
console.log(countValues(["card", "transfer", "card", "ussd", "card"]));
console.log(countValues([]).size);
```

Output of `node count-shape.js` and of the browser terminal

```ts
Map(9) {
  's' => 1,
  'u' => 1,
  'p' => 2,
  'o' => 2,
  'r' => 1,
  't' => 1,
  'b' => 1,
  'l' => 1,
  'a' => 1
}
Map(3) { 'card' => 3, 'transfer' => 1, 'ussd' => 1 }
0
```

Two details carry the whole pattern. `counts.get(item) ?? 0` treats a value you have not seen yet as a count of 0; without it you would compute `undefined + 1`, which is `NaN`. And `for...of` works on strings (character by character) and arrays alike, so one function counts both.

## The improved solution

For "same items in any order" you do not even need two tables. Count up for every item of the first list, count down for every item of the second. If the second list ever asks for an item whose count is already 0, it has one too many; if anything is left over at the end, the first list had more.

same-items.js

```ts
function sameItems(a, b) {
  const counts = new Map();
  let open = 0; // items of a not yet matched by b
  for (const item of a) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
    open++;
  }
  for (const item of b) {
    const left = counts.get(item) ?? 0;
    if (left === 0) return false; // b has an item a does not, or one too many
    counts.set(item, left - 1);
    open--;
  }
  return open === 0;              // b ran out before a did?
}

function normalizeUsername(name) {
  return name.toLowerCase().replace(/[._]/g, "");
}

const protectedName = normalizeUsername("support_bola");
for (const candidate of ["BolaSupport", "suppotr.bola", "supportbolaa", "supportbol", "supportbole"]) {
  console.log(candidate.padEnd(13), sameItems(protectedName, normalizeUsername(candidate)));
}
console.log(sameItems(["SKU-2", "SKU-1", "SKU-2"], ["SKU-2", "SKU-2", "SKU-1"]));
console.log(sameItems(["SKU-2", "SKU-1", "SKU-1"], ["SKU-2", "SKU-2", "SKU-1"]));
console.log(sameItems("", ""));
```

Output of `node same-items.js` and of the browser terminal

```ts
BolaSupport   true
suppotr.bola  true
supportbolaa  false
supportbol    false
supportbole   false
true
false
true
```

The `open` counter replaces a separate length check. A length check would also be correct (two strings with the same characters always have the same `length`, and a different length is the quickest "no"), but `open` counts exactly what the loops visit, so the function needs nothing but a `for...of` loop over each input. Just never mix the two measures: `"ade🙂".length` is 5 (the emoji takes two UTF-16 code units), while `for...of` sees 4 characters. The [failure cases](#failure-cases) come back to this.

Now repeat the measurement from before, counting one operation per table update:

same-items-count.js

```ts
function sameItemsCounted(a, b, counter) {
  const counts = new Map();
  let open = 0;
  for (const item of a) {
    counter.ops++;
    counts.set(item, (counts.get(item) ?? 0) + 1);
    open++;
  }
  for (const item of b) {
    counter.ops++;
    const left = counts.get(item) ?? 0;
    if (left === 0) return false;
    counts.set(item, left - 1);
    open--;
  }
  return open === 0;
}

for (const n of [10, 100, 1000, 10000]) {
  const ordered = Array.from({ length: n }, (_, i) => `SKU-${i}`);
  const packed = [...ordered].reverse();
  const counter = { ops: 0 };
  const same = sameItemsCounted(ordered, packed, counter);
  const naive = (n * (n + 1)) / 2;
  console.log(`n=${String(n).padEnd(6)} same=${same} ops=${String(counter.ops).padEnd(6)} naive compares=${naive}`);
}
```

Output of `node same-items-count.js` and of the browser terminal

```ts
n=10     same=true ops=20     naive compares=55
n=100    same=true ops=200    naive compares=5050
n=1000   same=true ops=2000   naive compares=500500
n=10000  same=true ops=20000  naive compares=50005000
```

Exactly `2n` table operations. At 10,000 lines that is 20,000 instead of 50 million: 2,500 times less work, and the gap keeps widening as `n` grows.

### Real application: an impersonation index

Back to sign-ups. The app has 200,000 protected usernames (verified businesses and staff). Running `sameItems` against each of them on every sign-up is 200,000 checks. The frequency counter helps a second time: two usernames are anagrams exactly when their frequency tables are equal, so turn each table into a string, a **signature**, and index the protected names by signature in a `Map`. Then a sign-up is one signature and one lookup.

Usernames are restricted to `a`–`z` and `0`–`9` after normalisation, a small alphabet known in advance. For that case a plain array of 36 counters is a simpler frequency table than a `Map`: the character's position in the alphabet is its index.

impersonation-index.js

```ts
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function normalizeUsername(name) {
  return name.toLowerCase().replace(/[._]/g, "");
}

function signature(name) {
  const counts = new Array(ALPHABET.length).fill(0);
  for (const ch of normalizeUsername(name)) {
    const i = ALPHABET.indexOf(ch); // at most 36 steps: a constant
    if (i === -1) throw new Error(`invalid character "${ch}" in ${name}`);
    counts[i]++;
  }
  return counts.join(",");
}

function buildIndex(protectedNames) {
  const index = new Map(); // signature -> protected names with that signature
  for (const name of protectedNames) {
    const key = signature(name);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(name);
  }
  return index;
}

function impersonates(index, candidate) {
  const matches = index.get(signature(candidate)) ?? [];
  return matches.filter((name) => normalizeUsername(name) !== normalizeUsername(candidate));
}

const index = buildIndex(["support_bola", "zenith.help", "ada_stores", "kemi2024"]);
console.log(impersonates(index, "BolaSupport"));
console.log(impersonates(index, "help.zenith"));
console.log(impersonates(index, "support.bola")); // the real account, spelt differently
console.log(impersonates(index, "ada_store"));
try {
  impersonates(index, "bola-support");
} catch (error) {
  console.log(error.message);
}
```

Output of `node impersonation-index.js` and of the browser terminal

```json
[ 'support_bola' ]
[ 'zenith.help' ]
[]
[]
invalid character "-" in bola-support
```

`support.bola` is not reported: it normalises to the protected name itself, so it is the same account, not an impersonator. The invalid-character error is deliberate: a hyphen is not allowed in usernames, and silently skipping it would make `bola-support` match. Rejecting unknown input is safer than guessing.

## Its complexity

Let `n` and `m` be the lengths of the two inputs and `k` the number of *distinct* values in them.

| Approach | Time | Extra space | Notes |
| --- | --- | --- | --- |
| find and cross off | O(n · m) | O(m) for the copy | plus `splice` shifting |
| sort both, compare | O(n log n + m log m) | O(n + m) | gives you sorted order as a bonus |
| frequency counter (`Map`) | O(n + m) average | O(k) | hash lookups are O(1) on average |
| frequency counter (array of size A) | O(n + m + A) | O(A) | only for a small, known alphabet of size A |
| signature index, per sign-up | O(L · A), and A = 36 is a constant | O(N · A) for the index | L = username length (each character is looked up in the alphabet), N = protected names |

The space column is the price. A frequency counter trades memory (one entry per distinct value) for time. When values repeat a lot, `k` is small: counting the letters of a million-character text needs a table of a few dozen entries. When every value is distinct, as with order ids, `k = n` and the table is as big as the input. That is usually fine; [in production](#production) you will see when it is not.

The `Map` version is O(n) "on average": the hash table's worst case, when every key collides, is O(n) per lookup, as [Hash maps and sets](https://zudojs.oyinlola.site/learn/dsa-hash-maps#worst-case) showed. The array version has no such worst case, which is one reason to prefer it when the alphabet is small and fixed.

## Three more problems, same pattern

The pattern earns its name when you see it solve problems that look different on the surface. In each of these, notice the moment where "search again" turns into "look it up in the counts".

### The first unmatched transfer

A bank's reconciliation log should list every transfer reference twice: once for the debit, once for the credit. A reference that appears only once is a transfer that left one account and never arrived. Operations want the *first* such reference in log order, to investigate the oldest problem first.

REASON IT OUT

### Before you code: first unmatched

- The naive version checks, for each entry, how many times its reference appears in the whole log. What does that cost for 50,000 entries?
- A frequency table tells you which references appear once. Does it tell you which one was *first*?
- What should the function return when every transfer is matched?

**Show the reasoning**

**Naive:** one full scan per entry, 50,000 × 50,000 = 2.5 billion comparisons. O(n²).

**Order:** the table has forgotten positions, but the input has not. Make *two* passes: the first builds the counts, the second walks the log in order and stops at the first reference whose count is 1. Two O(n) passes are still O(n).

**No unmatched transfer:** return `null`, a normal answer rather than an error.

first-unmatched.js

```ts
function firstUnmatched(log) {
  const counts = new Map();
  for (const entry of log) counts.set(entry.ref, (counts.get(entry.ref) ?? 0) + 1);
  for (const entry of log) {
    if (counts.get(entry.ref) === 1) return entry;
  }
  return null;
}

const log = [
  { ref: "TRF-101", side: "debit", kobo: 500000 },
  { ref: "TRF-102", side: "debit", kobo: 120000 },
  { ref: "TRF-101", side: "credit", kobo: 500000 },
  { ref: "TRF-103", side: "debit", kobo: 75000 },
  { ref: "TRF-103", side: "credit", kobo: 75000 },
  { ref: "TRF-104", side: "credit", kobo: 990000 },
];
console.log(firstUnmatched(log));
console.log(firstUnmatched(log.filter((e) => e.ref !== "TRF-102" && e.ref !== "TRF-104")));
```

Output of `node first-unmatched.js` and of the browser terminal

```json
{ ref: 'TRF-102', side: 'debit', kobo: 120000 }
null
```

The same two-pass shape finds the first non-repeating character in a string, a classic interview question: count the characters, then walk the string and return the first with a count of 1.

### The majority delivery zone

A logistics company wants to know whether a single zone received *more than half* of today's deliveries; if so, it moves a van there permanently. A value that appears more than `n / 2` times is called the **majority element**. There is at most one, because two of them would need more than `n` items between them.

majority.js

```ts
function majority(items) {
  const counts = new Map();
  for (const item of items) {
    const c = (counts.get(item) ?? 0) + 1;
    if (c > items.length / 2) return item; // can stop as soon as it is certain
    counts.set(item, c);
  }
  return null;
}

console.log(majority(["Lekki", "Yaba", "Lekki", "Ikeja", "Lekki"]));
console.log(majority(["Lekki", "Yaba", "Lekki", "Yaba"]));
console.log(majority(["Ikeja"]));
console.log(majority([]));
```

Output of `node majority.js` and of the browser terminal

```ts
Lekki
null
Ikeja
null
```

Two Lekki out of four is exactly half, not more than half, so the second call finds no majority. Returning early the moment a count passes half is safe, because no later item can take the majority away.

The table here can grow to `k` entries. There is a famous trick that needs only two variables: the **Boyer–Moore majority vote**. Keep one candidate and a counter; an equal item adds a vote, a different item cancels one, and when the counter hits 0 the next item becomes the candidate. A true majority survives all the cancelling, because it has more votes than everyone else put together. The survivor is only a *candidate*, though: if there is no majority, the vote still ends with *some* value, which may appear only once, so a second pass must count it.

majority-vote.js

```ts
function majorityVote(items) {
  let candidate = null;
  let votes = 0;
  for (const item of items) {
    if (votes === 0) candidate = item;
    votes += item === candidate ? 1 : -1;
  }
  let count = 0;
  for (const item of items) if (item === candidate) count++; // verify
  return count > items.length / 2 ? candidate : null;
}

console.log(majorityVote(["Lekki", "Yaba", "Lekki", "Ikeja", "Lekki"]));
console.log(majorityVote(["Yaba", "Lekki", "Ikeja"]));
console.log(majorityVote(["Ikeja", "Ikeja", "Yaba", "Yaba", "Yaba"]));
```

Output of `node majority-vote.js` and of the browser terminal

```ts
Lekki
null
Yaba
```

O(n) time and O(1) space. It solves only this one problem, whereas the frequency table answers any counting question, which is why the table is the pattern and the vote is a specialised optimisation you apply when memory really matters.

### Can this order be fulfilled?

A shop's stock is a list of item codes, one per unit on the shelf. An order can be fulfilled if every unit it asks for is in stock. This is "is one list contained in the other, counts included", and it is `sameItems` without the final check that nothing is left over:

can-fulfil.js

```ts
function canFulfil(order, stock) {
  const available = new Map();
  for (const sku of stock) available.set(sku, (available.get(sku) ?? 0) + 1);
  const missing = new Map();
  for (const sku of order) {
    const left = available.get(sku) ?? 0;
    if (left > 0) available.set(sku, left - 1);
    else missing.set(sku, (missing.get(sku) ?? 0) + 1);
  }
  return { ok: missing.size === 0, missing: Object.fromEntries(missing) };
}

const stock = ["RICE", "RICE", "OIL", "SALT", "OIL", "SUGAR"];
console.log(canFulfil(["OIL", "RICE", "OIL"], stock));
console.log(canFulfil(["OIL", "OIL", "OIL", "BEANS"], stock));
```

Output of `node can-fulfil.js` and of the browser terminal

```json
{ ok: true, missing: {} }
{ ok: false, missing: { OIL: 1, BEANS: 1 } }
```

Instead of stopping at the first problem, this version counts what is missing, because a customer would rather hear "one oil and one beans are out of stock" than "no". The shape is the same; only the question asked of the table changed.

## Failure cases

A frequency counter is only as good as its idea of "the same value". Most bugs come from values that look equal to a person but not to `Map`:

same-value.js

```ts
const composed = "josé";    // é as one code point
const decomposed = "josé"; // e followed by a combining accent
console.log(composed === decomposed, composed.normalize("NFC") === decomposed.normalize("NFC"));

const name = "ade🙂";
console.log(name.length, [...name].length, name.split("").length);

const counts = {};
counts["__proto__"] = (counts["__proto__"] ?? 0) + 1;
console.log(Object.keys(counts).length);

const byMap = new Map();
byMap.set("Ada", 1);
console.log(byMap.get("ada"), byMap.get(" Ada".trim()));
```

Output of `node same-value.js` and of the browser terminal

```ts
false true
5 4 5
0
undefined 1
```

- **Unicode forms.** `José` can be stored in two ways that print identically. Normalise with `.normalize("NFC")` before counting any text that people type.
- **Code units versus characters.** `split("")` and indexing see UTF-16 code units, so an emoji becomes two broken halves. Iterate with `for...of` or spread, which see code points.
- **Plain objects as tables.** The key `"__proto__"` never becomes a count on a plain object, and keys such as `"constructor"` already exist. Use a `Map` when the values come from data.
- **Case and spaces.** `"Ada"`, `"ada"` and `" Ada"` are three keys. Normalise once, at the boundary, with the same function everywhere.
- **Counting the wrong unit.** Comparing only the *sets* of values (`new Set(a)` vs `new Set(b)`) loses the counts and calls `supportbolaa` an anagram of `supportbola`.
- **Order-dependent questions.** "Is there a repeated reference within 10 minutes?" or "the longest run of the same value" depend on positions. A single table cannot answer them; the [sliding window](https://zudojs.oyinlola.site/learn/pattern-sliding-window) lesson can.

## Testing a frequency counter

The naive and sorting solutions are slow but easy to trust, which makes them perfect **reference implementations**: run the fast and the trusted version on many generated inputs and compare every answer. A fixed-seed random generator (the xorshift from [Hash maps and sets](https://zudojs.oyinlola.site/learn/dsa-hash-maps#testing)) makes any failure reproducible. Using a tiny alphabet of three letters makes anagrams common, so both answers get exercised:

same-items-test.js

```ts
function sameItems(a, b) {
  const counts = new Map();
  let open = 0;
  for (const item of a) { counts.set(item, (counts.get(item) ?? 0) + 1); open++; }
  for (const item of b) {
    const left = counts.get(item) ?? 0;
    if (left === 0) return false;
    counts.set(item, left - 1);
    open--;
  }
  return open === 0;
}

const bySorting = (a, b) => [...a].sort().join() === [...b].sort().join();

function xorshift(seed) {
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
}

const random = xorshift(7);
const word = () => Array.from({ length: Math.floor(random() * 6) }, () => "abc"[Math.floor(random() * 3)]).join("");
let agree = 0, yes = 0;
for (let i = 0; i < 5000; i++) {
  const a = word(), b = word();
  if (sameItems(a, b) === bySorting(a, b)) agree++;
  if (bySorting(a, b)) yes++;
}
console.log(`${agree}/5000 agree, ${yes} of them anagrams`);

const cases = [["", "", true], ["aab", "abb", false], ["ab", "abc", false], ["abc", "ab", false], ["🙂a", "a🙂", true]];
for (const [a, b, expected] of cases) {
  console.log(`${sameItems(a, b) === expected ? "PASS" : "FAIL"} "${a}" vs "${b}"`);
}
```

Output of `node same-items-test.js` and of the browser terminal

```ts
5000/5000 agree, 251 of them anagrams
PASS "" vs ""
PASS "aab" vs "abb"
PASS "ab" vs "abc"
PASS "abc" vs "ab"
PASS "🙂a" vs "a🙂"
```

Printing how many cases were anagrams proves the test exercised both outcomes; 5,000 agreements on inputs that were always "no" would prove very little. The hand-written cases then pin down the edges the random generator might miss: empty input, same letters with different counts, one input longer than the other in both directions, and characters outside the basic plane.

## Frequency counting in production

- **Let the database count.** When the data lives in a database, `SELECT ref, COUNT(*) FROM transfers GROUP BY ref HAVING COUNT(*) = 1` is the same pattern, run next to the data, without shipping millions of rows to your server. The database builds the same kind of table (or sorts) internally.
- **Store the normalised form.** Store usernames lower-cased and NFC-normalised, with a unique index on that column, so duplicates are rejected by the database even when two sign-ups race each other. Store the signature in its own indexed column and the impersonation check becomes a single indexed query.
- **Bound the table.** A table with one entry per distinct value is as large as the input when values are unique. Counting distinct visitors over a year in memory can exhaust a server. For huge streams, systems use approximate counters (a count-min sketch for frequencies, HyperLogLog for distinct counts) that trade a small error for fixed memory.
- **Untrusted keys.** Counting keys an attacker controls is exactly the hash-flooding scenario; cap input sizes before you count.
- **Explain the rule to users.** A sign-up rejected as "too similar to a protected account" needs a clear message and an appeal path; a check that silently fails people is a support problem.

## New problems to practise

For each problem: name what is being counted, decide whether position matters, then write the solution and state its time and space.

TRY IT YOURSELF

### Group usernames that are anagrams of each other

A moderator wants to see clusters of look-alike accounts. Write `groupAnagrams(names)` that returns only the groups with two or more names, each group in input order. Use the signature idea, but with a `Map` of counts so any character works.

**Show a solution**

group-anagrams.js

```ts
function signature(name) {
  const counts = new Map();
  for (const ch of name.toLowerCase()) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  return JSON.stringify([...counts].sort(([x], [y]) => (x < y ? -1 : 1)));
}

function groupAnagrams(names) {
  const groups = new Map();
  for (const name of names) {
    const key = signature(name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(name);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

console.log(groupAnagrams(["kemi", "mike", "tunde", "Emik", "dent", "tend", "ada"]));
```

Output of `node group-anagrams.js` and of the browser terminal

```json
[ [ 'kemi', 'mike', 'Emik' ], [ 'dent', 'tend' ] ]
```

Each name costs O(L) to count plus O(k log k) to sort its `k` distinct characters, which is bounded by the alphabet, so the whole grouping is O(N · L) time for N names of length up to L, with O(N · L) space for the groups. Sorting the *entries* is needed because two anagrams may meet their characters in different orders, so their Maps would list them differently. `JSON.stringify` then turns the sorted `[character, count]` pairs into one string key. Gluing them together as `"a2b1"` would be shorter but ambiguous once names contain digits: the counts `{1: 1, 2: 1}` and `{1: 121}` would both become `"1121"`.

TRY IT YOURSELF

### Duplicate order ids in an import

A CSV import of 40,000 orders must be rejected if any order id appears more than once. Write `duplicateIds(rows)` that returns each duplicated id once, with how many times it appears, sorted by count (highest first). What should it return for a clean file?

**Show a solution**

duplicate-ids.js

```ts
function duplicateIds(rows) {
  const counts = new Map();
  for (const row of rows) {
    const id = row.id.trim().toUpperCase();
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${id} x${n}`);
}

const rows = [{ id: "ORD-7" }, { id: "ORD-3" }, { id: "ord-7 " }, { id: "ORD-9" }, { id: "ORD-3" }, { id: "ORD-7" }];
console.log(duplicateIds(rows));
console.log(duplicateIds([{ id: "ORD-1" }, { id: "ORD-2" }]));
```

Output of `node duplicate-ids.js` and of the browser terminal

```json
[ 'ORD-7 x3', 'ORD-3 x2' ]
[]
```

Counting is O(n); sorting the `d` duplicated ids is O(d log d), and `d` is usually tiny. A clean file returns an empty list, which the importer treats as "no problems". Normalising with `trim` and `toUpperCase` catches `"ord-7 "`, which a person would certainly call the same id.

TRY IT YOURSELF

### The most common payment method, with ties

Given a day's payments, return the payment method or methods used most often, as an array. If card and transfer are both used 40 times and nothing more, return both. Do it with one counting pass and one pass over the table.

**Show a solution**

top-methods.js

```ts
function topMethods(payments) {
  const counts = new Map();
  for (const p of payments) counts.set(p.method, (counts.get(p.method) ?? 0) + 1);
  let best = 0;
  let methods = [];
  for (const [method, n] of counts) {
    if (n > best) {
      best = n;
      methods = [method];
    } else if (n === best) {
      methods.push(method);
    }
  }
  return methods;
}

const day = ["card", "transfer", "ussd", "card", "transfer", "cash"].map((method) => ({ method }));
console.log(topMethods(day));
console.log(topMethods([{ method: "cash" }]));
console.log(topMethods([]));
```

Output of `node top-methods.js` and of the browser terminal

```json
[ 'card', 'transfer' ]
[ 'cash' ]
[]
```

O(n) to count, O(k) to scan `k` methods: O(n) time, O(k) space. The tie case is the one people forget; returning only `"card"` would hide from the manager that transfers are just as popular.

## Summary

- When only *how often* each value appears matters, not *where*, build a frequency table in one pass and answer from it.
- The naive "find and cross off" is O(n²); counting its comparisons shows `n(n + 1) / 2`. Sorting gets O(n log n); a frequency counter gets O(n) time for O(k) extra space.
- Count up for one input and down for the other to compare two multisets without a second table.
- Need the first match in input order? Count in one pass, then walk the input again.
- For a small, fixed alphabet, an array of counters is a simpler table with no hash worst case, and joining it gives a signature you can index.
- Normalise values (case, spaces, Unicode NFC) before counting, iterate strings with `for...of`, and use `Map` rather than a plain object.
- Test the fast version against a slow, obvious reference on seeded random inputs.

Next: [The two pointers pattern](https://zudojs.oyinlola.site/learn/pattern-two-pointers), a pattern for sorted data and linked lists that often solves the same problems with O(1) extra space.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
