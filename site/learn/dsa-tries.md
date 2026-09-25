---
title: "Tries and autocomplete — ZudoJS Academy"
description: "Build a prefix tree for product search: autocomplete as the user types, count matches per prefix, delete safely, and weigh the memory it costs."
source: https://zudojs.oyinlola.site/learn/dsa-tries
---

LEVEL 3 · LESSON 9 OF 21

Data structures Core

# Tries and autocomplete

Build a prefix tree for product search: autocomplete as the user types, count matches per prefix, delete safely, and weigh the memory it costs.

- **45 min** to read and try
- **You need:** Trees and binary search trees, Hash maps, and Heaps and priority queues
- **You build:** A tested Trie class that powers autocomplete, prefix counts and ranked suggestions for a product catalogue

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain how a trie stores words as paths of characters and why lookups cost O(length of the word)
- Implement insert, lookup, prefix check, prefix count and delete
- Build autocomplete that stops early, and rank suggestions by popularity
- Normalise keys so case and Unicode forms do not break search
- Weigh a trie's memory against a sorted array or a Map

## The problem: search as you type

A shop's search box suggests products while the customer types. After s, a, m it should show a few products whose names start with "sam". The suggestions must appear after every keystroke, so each one must be cheap.

The obvious way is to check every product name on every keystroke. Here it is for a catalogue of 24,000 generated product names, counting how many characters it compares:

catalog.js

```ts
const brands = ["Samsung", "Sony", "Sharp", "Scanfrost", "Tecno", "Infinix", "Itel", "Hisense",
  "LG", "Lenovo", "HP", "Dell", "Apple", "Anker", "Oraimo", "Nokia", "Xiaomi", "Haier",
  "Philips", "Binatone"];
const kinds = ["Phone", "Tablet", "Laptop", "Television", "Speaker", "Earbuds",
  "Charger", "Power Bank", "Fridge", "Blender", "Smartwatch", "Monitor"];

export const products = [];
for (const brand of brands) {
  for (const kind of kinds) {
    for (let model = 1; model <= 100; model++) products.push(`${brand} ${kind} ${model}`);
  }
}
```

naive-search.js

```ts
import { products } from "./catalog.js";

let comparisons = 0;

function startsWith(name, prefix) {
  const a = name.toLowerCase();
  for (let i = 0; i < prefix.length; i++) {
    comparisons++;
    if (a[i] !== prefix[i]) return false;
  }
  return true;
}

console.log("products:", products.length);
for (const typed of ["s", "sa", "sam", "sams", "samsung ch"]) {
  comparisons = 0;
  const matches = products.filter((name) => startsWith(name, typed));
  console.log(`"${typed}": ${matches.length} matches, ${comparisons} character comparisons`);
}
```

Output of `node naive-search.js` and of the browser terminal

```ts
products: 24000
"s": 4800 matches, 24000 character comparisons
"sa": 1200 matches, 28800 character comparisons
"sam": 1200 matches, 30000 character comparisons
"sams": 1200 matches, 31200 character comparisons
"samsung ch": 100 matches, 37300 character comparisons
```

Every keystroke scans all 24,000 names, and the work never drops below one comparison per product, even when only 100 products can possibly match. The cost is O(n × L) per keystroke, for n products and a typed prefix of length L. It also builds the full list of matches when the box only shows five.

A **trie** (pronounced "try", from re*trie*val), also called a **prefix tree**, turns this around: finding the products that start with "sam" costs about 3 steps, one per typed character, however big the catalogue is.

## A tree of characters

A trie is a tree from [the trees lesson](https://zudojs.oyinlola.site/learn/dsa-trees) where every edge is labelled with one character. The path from the root to a node spells a **prefix**. Words that share a prefix share the path. A flag on a node says "a complete word ends here". Here is a trie holding *cap*, *car*, *card*, *care* and *cat*:

```ts
(root)
  └─ c
      └─ a
          ├─ p   ● cap
          ├─ r   ● car
          │   ├─ d   ● card
          │   └─ e   ● care
          └─ t   ● cat
```

A trie holding cap, car, card, care and cat. ● marks a node where a word ends.

A ● marks a node where a word ends. Notice that *car* ends at a node that also has children: a word can be a prefix of another word, which is why the flag is needed. Without it you could not tell "car is a product" from "car is just the start of card".

- **Looking up** a word of length L means following L edges from the root. The number of other words in the trie does not matter: O(L).
- **Finding everything with a prefix** means following the prefix (O(L)) and then collecting the words in the subtree below that node.
- Each node stores its children in a `Map` from character to child node (a hash map, see [Hash maps and sets](https://zudojs.oyinlola.site/learn/dsa-hash-maps)), so following one edge is O(1) on average.

## Implementing a trie

Each node holds a `Map` of children, an `end` flag, the original `value` to return (the product name with its capital letters), and a `count` of how many words pass through or end at it, which makes "how many products start with sam?" an O(L) question.

The class also **normalises** every key before using it. Customers type "SAM", "sam" and "Sam"; product names are stored as "Samsung". The key is the lower-case form, and `normalize("NFC")` makes sure accented letters are stored one way (the [Unicode section](#unicode) shows why that matters).

trie.js

```ts
const newNode = () => ({ children: new Map(), end: false, value: undefined, count: 0 });

export class Trie {
  #root = newNode();
  visits = 0;

  static key(text) {
    return text.normalize("NFC").toLowerCase();
  }

  get size() { return this.#root.count; }

  insert(text, value = text) {
    const key = Trie.key(text);
    const existing = this.#find(key);
    if (existing?.end) {
      existing.value = value;
      return false;
    }
    let node = this.#root;
    node.count++;
    for (const ch of key) {
      if (!node.children.has(ch)) node.children.set(ch, newNode());
      node = node.children.get(ch);
      node.count++;
    }
    node.end = true;
    node.value = value;
    return true;
  }

  #find(key) {
    let node = this.#root;
    for (const ch of key) {
      this.visits++;
      node = node.children.get(ch);
      if (node === undefined) return null;
    }
    return node;
  }

  has(text) { return this.#find(Trie.key(text))?.end ?? false; }
  get(text) { const node = this.#find(Trie.key(text)); return node?.end ? node.value : undefined; }
  countPrefix(prefix) { return this.#find(Trie.key(prefix))?.count ?? 0; }

  withPrefix(prefix, limit = Infinity) {
    const start = this.#find(Trie.key(prefix));
    if (start === null) return [];
    const results = [];
    const stack = [start];
    while (stack.length > 0 && results.length < limit) {
      const node = stack.pop();
      this.visits++;
      if (node.end) results.push(node.value);
      const keys = [...node.children.keys()].sort().reverse();
      for (const ch of keys) stack.push(node.children.get(ch));
    }
    return results;
  }

  suggest(prefix, limit = 5) {
    return this.withPrefix(prefix, limit);
  }

  delete(text) {
    const key = Trie.key(text);
    if (!this.#find(key)?.end) return false;
    let node = this.#root;
    node.count--;
    for (const ch of key) {
      const child = node.children.get(ch);
      if (--child.count === 0) {
        node.children.delete(ch);
        return true;
      }
      node = child;
    }
    node.end = false;
    node.value = undefined;
    return true;
  }

  nodeCount(node = this.#root) {
    let total = 1;
    for (const child of node.children.values()) total += this.nodeCount(child);
    return total;
  }

  radixNodeCount(node = this.#root) {
    let total = node === this.#root || node.end || node.children.size !== 1 ? 1 : 0;
    for (const child of node.children.values()) total += this.radixNodeCount(child);
    return total;
  }
}
```

Some details worth reading slowly:

- `for (const ch of key)` walks the string by **code point** (a whole Unicode character), not by UTF-16 unit, so an emoji or a rare character stays one edge. `key[i]` or `key.split("")` would cut some characters in half.
- `insert` first checks whether the word is already there. Without that, inserting "Samsung Phone 1" twice would increase every count on its path twice, and `size` would be wrong forever after.
- `withPrefix` walks the subtree depth-first with a stack, pushing children in reverse alphabetical order so they come off the stack alphabetically. Its `limit` parameter stops the `while` loop as soon as enough results are collected, instead of building the whole list and throwing most of it away. The root's `count` is the number of words, so `size` needs no separate counter.
- `suggest` just calls `withPrefix` with its `limit`. The customer sees five suggestions; collecting all 2,400 Samsung products first would waste most of the work.
- `visits` counts how many nodes were touched, so you can compare costs with the naive search. `nodeCount` and `radixNodeCount` are there for the memory section.

basics.js

```ts
import { Trie } from "./trie.js";

const trie = new Trie();
for (const word of ["cap", "car", "card", "care", "cat"]) trie.insert(word);
console.log("added again:", trie.insert("car"));

console.log("size:", trie.size, "nodes:", trie.nodeCount());
console.log("has car:", trie.has("car"), "| has ca:", trie.has("ca"), "| has Card:", trie.has("Card"));
console.log("words starting with ca:", trie.countPrefix("ca"));
console.log("words starting with car:", [...trie.withPrefix("car")].join(", "));
console.log("words starting with cup:", [...trie.withPrefix("cup")].length);
```

Output of `node basics.js` and of the browser terminal

```ts
added again: false
size: 5 nodes: 8
has car: true | has ca: false | has Card: true
words starting with ca: 5
words starting with car: car, card, care
words starting with cup: 0
```

Inserting "car" a second time returns `false` and changes no counts. Lookups are case-insensitive because the key is lower-cased, so `has("Card")` finds "card". "ca" is a prefix but not a word, so `has` is `false`, while `countPrefix("ca")` knows that 5 words start with it. The five words, 17 characters in total, share 8 nodes (counting the root).

## Autocomplete for the catalogue

Now the real catalogue, keystroke by keystroke. The product names are stored as values, so suggestions come back with their original capital letters, and `countPrefix` gives the "2,400 results" number shown under the search box:

autocomplete.js

```ts
import { products } from "./catalog.js";
import { Trie } from "./trie.js";

const search = new Trie();
for (const name of products) search.insert(name);

for (const typed of ["s", "sa", "sam", "sams", "samsung ch"]) {
  search.visits = 0;
  const shown = search.suggest(typed, 3);
  const total = search.countPrefix(typed);
  console.log(`"${typed}": ${total} matches, ${search.visits} nodes visited -> ${shown.join(" | ")}`);
}
```

Output of `node autocomplete.js` and of the browser terminal

```ts
"s": 4800 matches, 21 nodes visited -> Samsung Blender 1 | Samsung Blender 10 | Samsung Blender 100
"sa": 1200 matches, 22 nodes visited -> Samsung Blender 1 | Samsung Blender 10 | Samsung Blender 100
"sam": 1200 matches, 23 nodes visited -> Samsung Blender 1 | Samsung Blender 10 | Samsung Blender 100
"sams": 1200 matches, 24 nodes visited -> Samsung Blender 1 | Samsung Blender 10 | Samsung Blender 100
"samsung ch": 100 matches, 30 nodes visited -> Samsung Charger 1 | Samsung Charger 10 | Samsung Charger 100
```

Compare the node visits with the 24,000 or more character comparisons of the naive search. The trie's cost is the length of the prefix plus the part of the subtree it walks before it has 3 results, and neither depends on the size of the catalogue. Double the catalogue and the naive search doubles; the trie does not notice.

The suggestions are alphabetical, so "Samsung Blender 1" comes before "Samsung Phone 1", and "Samsung Blender 10" comes right after "Samsung Blender 1", because character by character "10" sorts before "2". Both are correct for a trie and both are poor for customers, who want popular products first and numbers in numeric order. Ranking is the next step.

### Ranking suggestions by popularity

Real autocomplete shows the *most popular* matches, not the first alphabetically. Two approaches:

1. **Collect, then pick the best k.** Walk the whole subtree under the prefix and keep the top k by sales with a size-k heap, as in [Heaps](https://zudojs.oyinlola.site/learn/dsa-heaps#top-k). Correct and simple, but after one letter the subtree can hold most of the catalogue.
2. **Precompute.** Store, in every node, the top k products of its subtree. A suggestion is then O(L): walk the prefix and read the list. The price is memory (k entries per node) and work on every insert.

Here is the precomputed version, with a small catalogue and weekly sales figures:

ranked.js

```ts
const node = () => ({ children: new Map(), top: [] });
const root = node();
const K = 3;

function insert(name, sales) {
  const entry = { name, sales };
  let current = root;
  const path = [root];
  for (const ch of name.toLowerCase()) {
    if (!current.children.has(ch)) current.children.set(ch, node());
    current = current.children.get(ch);
    path.push(current);
  }
  for (const n of path) {
    n.top.push(entry);
    n.top.sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name));
    if (n.top.length > K) n.top.pop();
  }
}

function suggest(prefix) {
  let current = root;
  for (const ch of prefix.toLowerCase()) {
    current = current.children.get(ch);
    if (!current) return [];
  }
  return current.top.map((e) => `${e.name} (${e.sales})`);
}

for (const [name, sales] of [
  ["Samsung Galaxy A15", 950], ["Samsung Galaxy S24", 310], ["Samsung Galaxy A05", 1200],
  ["Samsung Soundbar", 140], ["Sony Headphones", 620], ["Sharp Microwave", 480], ["Samsung Fridge", 75],
]) {
  insert(name, sales);
}

console.log("s:", suggest("s").join(", "));
console.log("sam:", suggest("sam").join(", "));
console.log("samsung s:", suggest("samsung s").join(", "));
console.log("x:", suggest("x").length);
```

Output of `node ranked.js` and of the browser terminal

```ts
s: Samsung Galaxy A05 (1200), Samsung Galaxy A15 (950), Sony Headphones (620)
sam: Samsung Galaxy A05 (1200), Samsung Galaxy A15 (950), Samsung Galaxy S24 (310)
samsung s: Samsung Soundbar (140)
x: 0
```

Each insert updates the lists on its path: O(L × k log k) with this simple sort. A suggestion is O(L) plus copying k entries. Large search services do exactly this, recomputing the lists in a nightly batch job rather than on every sale, because popularity changes slowly and search traffic is heavy.

## Deleting a word

A product is discontinued and must disappear from suggestions.

REASON IT OUT

### What must delete get right?

Deleting a word from a trie is more delicate than it looks. Before reading the code, decide: what should happen when the word is not in the trie, or when only its *prefix* is (deleting "ca" when only "car" exists)? When the word is a prefix of another word, like "car" and "card", which nodes may be removed? When another word is a prefix of it, like deleting "card" while "car" stays? And what must happen to the counts?

**Show the reasoning**

- **Not present**, or present only as a prefix: change nothing and return `false`. Decrementing counts first and then discovering the word is missing would corrupt every count on the path. That is why `delete` checks `#find(key)?.end` before touching anything.
- **"car" while "card" exists**: no node may be removed, because "card" still needs them all. Only the `end` flag on the "r" node is cleared, and the counts on the path drop by one.
- **"card" while "car" exists**: the "d" node is used by nothing else, so it can be removed; the "car" nodes must stay.
- **The general rule**: decrement the count of every node on the path. A node whose count reaches 0 is used by no word any more, so it and everything below it can be cut off. The code cuts at the first such node, which also frees its whole subtree.

Forgetting to prune is not a correctness bug for lookups, but it is a memory leak: a catalogue that churns through products would keep every node ever created.

delete.js

```ts
import { Trie } from "./trie.js";

const trie = new Trie();
for (const word of ["car", "card", "care", "cat"]) trie.insert(word);

function show(label) {
  console.log(`${label.padEnd(18)} words: ${[...trie.withPrefix("")].join(",").padEnd(17)} nodes: ${trie.nodeCount()}  "car" prefix count: ${trie.countPrefix("car")}`);
}

show("start");
console.log("delete ca:", trie.delete("ca"));
trie.delete("card");
show("after delete card");
trie.delete("car");
show("after delete car");
trie.delete("care");
show("after delete care");
```

Output of `node delete.js` and of the browser terminal

```ts
start              words: car,card,care,cat nodes: 7  "car" prefix count: 3
delete ca: false
after delete card  words: car,care,cat      nodes: 6  "car" prefix count: 2
after delete car   words: care,cat          nodes: 6  "car" prefix count: 1
after delete care  words: cat               nodes: 4  "car" prefix count: 0
```

Deleting "card" removed one node. Deleting "car" removed none, because "care" still passes through it. Deleting "care" then removed the "r" and "e" nodes, which nothing uses any more. Every step is O(L).

## Keys, case and Unicode

A trie compares characters exactly. Two strings that look identical to a person but differ in their characters end up on different paths, and search silently misses. The shop sells a "Café Latte Mug". Here is what can go wrong:

unicode.js

```ts
const composed = "Café";
const decomposed = "Café";

console.log(composed, decomposed, composed === decomposed);
console.log("lengths:", composed.length, decomposed.length);
console.log("after NFC:", composed.normalize("NFC") === decomposed.normalize("NFC"));
console.log("case:", "Café".toLowerCase() === "CAFÉ".toLowerCase());

const phone = "Phone 📱";
console.log("split:", phone.split("").length, "for...of:", [...phone].length);
```

Output of `node unicode.js` and of the browser terminal

```ts
Café Café false
lengths: 4 5
after NFC: true
case: true
split: 8 for...of: 7
```

- "é" can be stored as one code point (U+00E9) or as "e" followed by a combining accent (U+0301). Text pasted from different apps uses either form. `normalize("NFC")` converts both to the same form, which is why `Trie.key` calls it.
- Customers do not type capitals consistently, so keys are lower-cased. (For a few languages, such as Turkish, lower-casing depends on the locale; `toLocaleLowerCase("tr")` handles that.)
- `split("")` cuts the phone emoji into two meaningless halves, because it counts UTF-16 units. `for...of` and spreading iterate by code point, which is what the trie uses.
- Decide what else to fold: extra spaces, punctuation ("wi-fi" vs "wifi"), accents ("cafe" should probably find "café"). Whatever you decide, apply the *same* function when inserting and when searching. The third exercise builds an accent-insensitive search.

## What a trie costs in memory

Speed is only half the story. Every node is an object with a `Map`, and an empty `Map` alone costs dozens of bytes. Count what the catalogue needs:

memory.js

```ts
import { products } from "./catalog.js";
import { Trie } from "./trie.js";

const trie = new Trie();
for (const name of products) trie.insert(name);

const characters = products.reduce((sum, name) => sum + name.length, 0);
console.log("products:", products.length);
console.log("characters in all names:", characters);
console.log("trie nodes:", trie.nodeCount());

console.log("radix tree nodes:", trie.radixNodeCount());
```

Output of `node memory.js` and of the browser terminal

```ts
products: 24000
characters in all names: 400880
trie nodes: 26062
radix tree nodes: 24326
```

Sharing prefixes cut 400,880 stored characters down to 26,062 nodes: all 2,400 Samsung products share the path for "samsung ", and each brand's 100 phones share "… phone ". That looks like a big win, but a node is not a character. Each node is a whole object plus a `Map`, easily a hundred bytes or more, where a string stores a character in one or two bytes. So even this well-shared trie uses several times the memory of the plain array of names. A trie of long keys with little sharing (URLs, email addresses) is far worse.

Ways to shrink it:

- **Compressed trie (radix tree)**: a chain of nodes with one child each is merged into one edge labelled with a whole string, so "samsung " becomes one edge instead of eight nodes. Here that only saves about 1,700 nodes, because most nodes are the model numbers at the ends of the names, where words end or branch. For long keys with little sharing, such as URL paths, compression removes most of the nodes, which is why web frameworks' routers (for example the one Fastify uses) are radix trees.
- **Fixed arrays**: when the alphabet is small and known (digits, 26 lowercase letters), an array of children indexed by character is faster than a `Map`, but wastes slots for missing children.
- **Do you need a trie at all?** A sorted array of names with binary search finds the first name with a given prefix in O(L log n), and the matches are the names that follow it: very compact and fast enough for most catalogues. You will build exactly that "lower bound" search in [Searching](https://zudojs.oyinlola.site/learn/dsa-searching#bounds). Databases do the same with an index and `LIKE 'sam%'`. Tries win when there are many lookups per second, when you need per-prefix data (counts, top-k lists), or for longest-prefix matching.

| Question | Trie | Sorted array + binary search | `Map` / `Set` |
| --- | --- | --- | --- |
| Is this exact word present? | O(L) | O(L log n) | O(L) average (hashing reads the key) |
| First k words with a prefix | O(L + subtree walked) | O(L log n + k) | O(n × L): must scan |
| How many words have a prefix? | O(L) with counts | O(L log n): two binary searches | O(n × L) |
| Insert or delete | O(L) | O(n): shifting | O(L) average |
| Memory | High (an object per node) | Lowest | Medium |

## Testing the trie

The reference model for a trie is almost embarrassingly simple: an array of words, searched with `startsWith`. It is slow, but obviously right. Generate random words from a tiny alphabet (so there are lots of shared prefixes and prefix-of-another-word cases), apply random inserts and deletes to both, and after each step compare every possible prefix.

trie-test.js

```ts
import { Trie } from "./trie.js";

function check(label, ok) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
}

const empty = new Trie();
check("empty trie", empty.size === 0 && !empty.has("") && empty.suggest("a").length === 0);
check("delete from empty trie", empty.delete("car") === false);

const t = new Trie();
t.insert("Card", "Card");
t.insert("card", "card (updated)");
check("same key updates the value", t.size === 1 && t.get("CARD") === "card (updated)");
t.insert("car");
check("prefix word deleted, longer word kept", t.delete("car") && t.has("card") && !t.has("car"));

let seed = 5;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const randomWord = () => Array.from({ length: 1 + Math.floor(random() * 4) }, () => "abc"[Math.floor(random() * 3)]).join("");

const prefixes = [""];
for (const a of "abc") {
  prefixes.push(a);
  for (const b of "abc") prefixes.push(a + b);
}

const trie = new Trie();
const model = [];
let failures = 0;
for (let step = 0; step < 1500; step++) {
  const word = randomWord();
  if (random() < 0.6) {
    trie.insert(word);
    if (!model.includes(word)) model.push(word);
  } else {
    trie.delete(word);
    if (model.includes(word)) model.splice(model.indexOf(word), 1);
  }
  for (const p of prefixes) {
    const expected = model.filter((w) => w.startsWith(p)).sort();
    const got = [...trie.withPrefix(p)];
    if (got.join() !== expected.join() || trie.countPrefix(p) !== expected.length) failures++;
  }
  if (trie.size !== model.length) failures++;
}
check("1500 random operations match an array of words", failures === 0);
```

Output of `node trie-test.js` and of the browser terminal

```ts
PASS empty trie
PASS delete from empty trie
PASS same key updates the value
PASS prefix word deleted, longer word kept
PASS 1500 random operations match an array of words
```

The generated words are 1 to 4 letters from "abc", so almost every word is a prefix of another, the case that breaks careless `delete` code. The check compares the full, sorted result for 13 prefixes after every step, including the empty prefix (every word).

## Tries in production

- **Where they are used.** Search-box autocomplete, phone keypads and contact search, spell checkers (walk the trie while tolerating a mistake or two), routers in web frameworks (paths such as `/products/:id` stored in a radix tree), and network routers, which pick the rule with the longest matching IP address prefix.
- **Tries do not fix typos.** "smasung" shares only the prefix "s" with "samsung". Full search engines combine prefix search with fuzzy matching (edit distance), synonyms and ranking. A trie is the fast first layer, not the whole search.
- **Autocomplete endpoints need limits.** Cap the number of results, cap the prefix length, and rate-limit the endpoint: it is called on every keystroke by every user. Normalise the query exactly as you normalised the keys.
- **Build once, read many times.** Rebuilding a large trie takes time and memory, so services usually build it at startup or in a background job from the product database, then swap the new trie in, rather than editing a live one from many requests at once.
- **Measure before choosing.** For a few thousand products, the naive filter runs in well under a millisecond, and a sorted array is smaller than a trie. Reach for a trie when the numbers (catalogue size, requests per second, per-prefix features) say you need one.

## Practice

TRY IT YOURSELF

### Delivery zone by longest prefix

A courier prices deliveries by postcode prefix: "1" is ₦3,000, "10" is ₦2,000, "100" is ₦1,500 and "2" is ₦4,500. The rate for a postcode is the one with the *longest* prefix that matches it. Store the prefixes in a trie and write `rateFor(postcode)` that walks the postcode once, remembering the last rate it passed.

**Show a solution**

zones.js

```ts
const root = { children: new Map(), rate: undefined };

function addZone(prefix, rate) {
  let node = root;
  for (const ch of prefix) {
    if (!node.children.has(ch)) node.children.set(ch, { children: new Map(), rate: undefined });
    node = node.children.get(ch);
  }
  node.rate = rate;
}

function rateFor(postcode) {
  let node = root;
  let best;
  for (const ch of postcode) {
    node = node.children.get(ch);
    if (!node) break;
    if (node.rate !== undefined) best = node.rate;
  }
  return best;
}

addZone("1", 3000);
addZone("10", 2000);
addZone("100", 1500);
addZone("2", 4500);

for (const postcode of ["100271", "101233", "112001", "200001", "900001"]) {
  const rate = rateFor(postcode);
  console.log(postcode, rate === undefined ? "no delivery" : `₦${rate.toLocaleString("en-NG")}`);
}
```

Output of `node zones.js` and of the browser terminal

```ts
100271 ₦1,500
101233 ₦2,000
112001 ₦3,000
200001 ₦4,500
900001 no delivery
```

One pass over the postcode, O(L), however many zones exist. This **longest prefix match** is exactly what network routers do with IP addresses, and what a router in a web framework does to pick the most specific route.

TRY IT YOURSELF

### Top sellers under a prefix

Use the `Trie` class for the catalogue, but show the three *best-selling* products for a prefix instead of the first three alphabetically. Sales are in a `Map` from name to units. Walk every product under the prefix and keep the best three. What does this cost after one typed letter, and after a whole brand name?

**Show a solution**

top-sellers.js

```ts
import { products } from "./catalog.js";
import { Trie } from "./trie.js";

const trie = new Trie();
for (const name of products) trie.insert(name);

const sales = new Map(products.map((name, i) => [name, (i * 7919) % 5000]));

function bestSellers(prefix, k) {
  const best = [];
  let seen = 0;
  for (const name of trie.withPrefix(prefix)) {
    seen++;
    best.push(name);
    best.sort((a, b) => sales.get(b) - sales.get(a));
    if (best.length > k) best.pop();
  }
  return { best, seen };
}

for (const typed of ["s", "samsung earbuds"]) {
  const { best, seen } = bestSellers(typed, 3);
  console.log(`"${typed}" looked at ${seen}: ${best.map((n) => `${n} (${sales.get(n)})`).join(", ")}`);
}
```

Output of `node top-sellers.js` and of the browser terminal

```ts
"s" looked at 4800: Sony Monitor 22 (4999), Scanfrost Smartwatch 43 (4998), Sony Power Bank 64 (4997)
"samsung earbuds" looked at 100: Samsung Earbuds 32 (4989), Samsung Earbuds 20 (4961), Samsung Earbuds 8 (4933)
```

The cost is the size of the subtree: after "s" it walks thousands of products, after "samsung earbuds" only 100. Keeping the best three in a small sorted array is fine for k = 3; for larger k use a size-k heap. When short prefixes are common (they are: every search starts with one letter), precompute the top list in each node, as the ranking section showed.

TRY IT YOURSELF

### Accent-insensitive search

Customers type "cafe" and expect to find "Café Latte Mug" and "CAFÉ Espresso Cups". Write a key function that lower-cases and removes accents, insert names with the `Trie` class using that key, and make sure the suggestions still show the original names.

**Show a solution**

accents.js

```ts
import { Trie } from "./trie.js";

function foldKey(text) {
  return text.normalize("NFD").replace(/\p{Mark}/gu, "").toLowerCase();
}

const trie = new Trie();
for (const name of ["Café Latte Mug", "CAFÉ Espresso Cups", "Cafeteria Tray", "Crème Brûlée Set"]) {
  trie.insert(foldKey(name), name);
}

for (const typed of ["cafe", "CAFÉ", "creme b"]) {
  console.log(`${typed} -> ${trie.suggest(foldKey(typed)).join(" | ")}`);
}
```

Output of `node accents.js` and of the browser terminal

```ts
cafe -> CAFÉ Espresso Cups | Café Latte Mug | Cafeteria Tray
CAFÉ -> CAFÉ Espresso Cups | Café Latte Mug | Cafeteria Tray
creme b -> Crème Brûlée Set
```

`normalize("NFD")` splits each accented letter into the base letter plus a combining mark, and `\p{Mark}` (with the `u` flag) removes the marks. The folded text is the key; the original name is the value, so customers see "Crème Brûlée Set", not "creme brulee set". Apply the same `foldKey` to what the customer types, or nothing matches.

## Recap

- A trie stores strings as paths of characters from a shared root; an `end` flag marks where a word ends, because a word can be a prefix of another.
- Lookup, prefix check, insert and delete cost O(L) for a key of length L, independent of how many words are stored. With a count in each node, "how many start with this prefix?" is O(L) too.
- Autocomplete walks to the prefix node and collects words below it, stopping as soon as it has enough. Popular-first suggestions either walk the subtree with a top-k selection, or read top-k lists precomputed in each node.
- Delete must check the word exists first, decrement counts along the path, and prune nodes no word uses.
- Normalise keys (Unicode form, case, whatever else you fold) identically on insert and on search, and iterate strings by code point.
- Tries trade memory for speed. Radix trees compress chains; a sorted array with binary search is the compact alternative for prefix queries.

Next: [Searching](https://zudojs.oyinlola.site/learn/dsa-searching) starts the algorithms module with linear and binary search, including the lower-bound search that answers prefix queries on a sorted array.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
