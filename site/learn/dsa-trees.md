---
title: "Trees and binary search trees — ZudoJS Academy"
description: "Turn flat category rows into a tree, walk it four ways, then build, test and balance a binary search tree of orders, with the cost of every operation."
source: https://zudojs.oyinlola.site/learn/dsa-trees
---

LEVEL 3 · LESSON 6 OF 21

Data structures Core

# Trees and binary search trees

Turn flat category rows into a tree, walk it four ways, then build, test and balance a binary search tree of orders, with the cost of every operation.

- **55 min** to read and try
- **You need:** Recursion, this, prototypes and classes, Hash maps and sets, and Stacks and queues
- **You build:** A category tree builder with safe loading, and a tested binary search tree of orders

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Name the parts of a tree and compute size, depth and height
- Build a tree from flat parent-id rows in O(n) and reject broken data
- Traverse a tree in pre-order, in-order, post-order and level order, recursively and with an explicit stack
- Implement a binary search tree with insert, search and delete, and test its invariant
- Explain why an unbalanced tree is O(n) and how balancing brings it back to O(log n)

## The problem: a category menu from flat rows

An online shop keeps its product categories in a database table. Each row has an `id`, a `name` and a `parentId`: the id of the category it sits inside, or `null` for a top-level category. The shop's menu has to show them nested: *Electronics*, inside it *Phones*, inside that *Android*.

The rows arrive as a flat array. The obvious way to print the menu is: find the top-level rows, print each one, then find its children by scanning the array again, and repeat. Here it is, with a counter for how many rows it compares:

flat-rows.js

```ts
const rows = [
  { id: 1, name: "Electronics", parentId: null },
  { id: 2, name: "Phones", parentId: 1 },
  { id: 3, name: "Laptops", parentId: 1 },
  { id: 4, name: "Android", parentId: 2 },
  { id: 5, name: "iPhone", parentId: 2 },
  { id: 6, name: "Fashion", parentId: null },
  { id: 7, name: "Shoes", parentId: 6 },
  { id: 8, name: "Sneakers", parentId: 7 },
  { id: 9, name: "Gaming laptops", parentId: 3 },
];

let comparisons = 0;

function childrenOf(parentId) {
  const found = [];
  for (const row of rows) {
    comparisons++;
    if (row.parentId === parentId) found.push(row);
  }
  return found;
}

function printMenu(parentId, indent) {
  for (const row of childrenOf(parentId)) {
    console.log(indent + row.name);
    printMenu(row.id, indent + "  ");
  }
}

printMenu(null, "");
console.log(`comparisons: ${comparisons}`);
```

Output of `node flat-rows.js` and of the browser terminal

```ts
Electronics
  Phones
    Android
    iPhone
  Laptops
    Gaming laptops
Fashion
  Shoes
    Sneakers
comparisons: 90
```

It works, and the output already *looks* like a tree. But look at the cost. `printMenu` is called once for the top level and once for each of the 9 rows, and every call scans all 9 rows: 10 × 9 = 90 comparisons. With *n* categories that is (n + 1) × n, which is O(n²) (see [Big O and complexity](https://zudojs.oyinlola.site/learn/dsa-complexity) if the notation is new). A marketplace with 5,000 categories would do about 25 million comparisons to draw one menu.

The data has a shape, and the code ignores it. This lesson gives that shape a name, a **tree**, and shows how to store it so every question about it becomes cheap. Then it builds the most famous tree of all, the **binary search tree**, and finds out exactly when it is fast and when it is secretly as slow as a list.

## What a tree is

A **tree** is a set of **nodes** (the items, here categories) joined by **edges** (the links, here "is inside"), with three rules:

1. Exactly one node has no parent. It is the **root**.
2. Every other node has exactly one **parent**.
3. There are no loops: following parents from any node always ends at the root.

The shop has two top-level categories, so strictly it has two trees (a **forest**). The usual trick is to add one invisible root, "All categories", above them. Here is the result, with the words you need:

```ts
All categories                 depth 0   root
├── Electronics                depth 1
│   ├── Phones                 depth 2
│   │   ├── Android            depth 3   leaf
│   │   └── iPhone             depth 3   leaf
│   └── Laptops                depth 2
│       └── Gaming laptops     depth 3   leaf
└── Fashion                    depth 1
    └── Shoes                  depth 2
        └── Sneakers           depth 3   leaf
```

The category tree with an invisible root. Depth counts edges down from the root.

- **Children** of a node are the nodes directly below it. Phones and Laptops are children of Electronics, and **siblings** of each other.
- A **leaf** is a node with no children. The others are **internal nodes**.
- **Ancestors** of a node are its parent, its parent's parent, and so on up to the root. **Descendants** are everything below it.
- A **subtree** is a node together with all its descendants. Electronics and everything under it is a subtree, and it is itself a tree. That is why recursion fits trees so well: every child is the root of a smaller tree.
- The **depth** of a node is the number of edges from the root down to it. The root has depth 0.
- The **height** of a node is the number of edges on the longest path from it down to a leaf. A leaf has height 0. The height of the tree is the height of its root: 3 here.
- The **size** of a tree is its number of nodes: 10 here, counting the invisible root.

Every tree with *n* nodes has exactly *n* − 1 edges, because every node except the root has exactly one edge up to its parent.

## Building the tree in O(n)

The slow menu kept asking "who are the children of X?" and answered by scanning. The fix is to answer that question once for every node, while building. Give each node a `children` array, and use a `Map` from id to node (a hash map, from [Hash maps and sets](https://zudojs.oyinlola.site/learn/dsa-hash-maps)) so finding a parent by id costs O(1) on average:

categories.js

```ts
export const rows = [
  { id: 1, name: "Electronics", parentId: null },
  { id: 2, name: "Phones", parentId: 1 },
  { id: 3, name: "Laptops", parentId: 1 },
  { id: 4, name: "Android", parentId: 2 },
  { id: 5, name: "iPhone", parentId: 2 },
  { id: 6, name: "Fashion", parentId: null },
  { id: 7, name: "Shoes", parentId: 6 },
  { id: 8, name: "Sneakers", parentId: 7 },
  { id: 9, name: "Gaming laptops", parentId: 3 },
];

export function buildTree(rows) {
  const root = { id: null, name: "All categories", children: [] };
  const byId = new Map([[null, root]]);
  for (const row of rows) byId.set(row.id, { ...row, children: [] });
  for (const row of rows) {
    byId.get(row.parentId).children.push(byId.get(row.id));
  }
  return root;
}
```

Two passes over the rows, each doing O(1) work per row: O(n) time, plus O(n) extra memory for the map and the nodes. The first pass creates every node, so the second pass can link a child to its parent even when the parent's row comes later in the array.

Now size, height and leaf count are short recursive functions. Each one follows the same plan: solve it for the children, then combine.

measure.js

```ts
import { rows, buildTree } from "./categories.js";

function size(node) {
  let total = 1;
  for (const child of node.children) total += size(child);
  return total;
}

function height(node) {
  let tallest = -1;
  for (const child of node.children) tallest = Math.max(tallest, height(child));
  return tallest + 1;
}

function leaves(node) {
  if (node.children.length === 0) return [node.name];
  return node.children.flatMap(leaves);
}

const tree = buildTree(rows);
console.log("size:", size(tree));
console.log("height:", height(tree));
console.log("leaves:", leaves(tree).join(", "));
console.log("edges:", size(tree) - 1);
```

Output of `node measure.js` and of the browser terminal

```ts
size: 10
height: 3
leaves: Android, iPhone, Gaming laptops, Sneakers
edges: 9
```

`flatMap` calls `leaves` on every child and joins the arrays it returns into one array. `height` starts `tallest` at −1 so that a leaf, which has no children, gets −1 + 1 = 0. Each function visits every node once: O(n) time. The extra memory is the call stack, one frame per level, so O(h) where *h* is the height. Remember that O(h): it is the reason deep trees can crash recursive code, which you will see shortly.

REASON IT OUT

### What can be wrong with the rows?

The rows come from a database that admins edit through a form. `buildTree` trusts them completely. Before reading on, list what could be wrong with the data, and what `buildTree` would do in each case. Think about: a `parentId` that points nowhere, a category that is its own parent, two categories that are each other's parent, and two rows with the same id.

**Show the reasoning**

- **Missing parent** (an *orphan*: its parent was deleted). `byId.get(row.parentId)` returns `undefined`, and `undefined.children` throws a `TypeError`. One bad row takes the whole menu down.
- **A category that is its own parent**, or **a loop** such as A inside B and B inside A. Nothing crashes while building, but these nodes are never reachable from the root, so they silently vanish from the menu. Worse, any code that walks *up* through parents from one of them (a breadcrumb) loops forever.
- **Duplicate ids.** The second `byId.set` overwrites the first node, so the first category vanishes, the second is linked twice (once for each row), and every child of that id hangs under it. If the second row's parent sits *below* the first one, those links form a loop that *is* reachable from the root, and any walk of the menu never ends.

The general lesson: a tree built from outside data is only a tree if you check the three rules. A safe builder skips duplicate ids, reports orphans, and counts how many nodes it can reach from the root (or from an orphan, whose subtree is intact). Any node it cannot reach is in a loop or hangs below one.

Here is a builder that checks all of that and reports problems instead of crashing or hiding data:

safe-build.js

```ts
function buildTreeSafely(rows) {
  const root = { id: null, name: "All categories", children: [] };
  const byId = new Map([[null, root]]);
  const problems = [];
  const accepted = [];
  for (const row of rows) {
    if (byId.has(row.id)) {
      problems.push(`duplicate id ${row.id} ("${row.name}" skipped)`);
      continue;
    }
    byId.set(row.id, { ...row, children: [] });
    accepted.push(row);
  }
  const orphans = [];
  for (const row of accepted) {
    const parent = byId.get(row.parentId);
    if (parent) {
      parent.children.push(byId.get(row.id));
    } else {
      problems.push(`"${row.name}" has missing parent ${row.parentId}`);
      orphans.push(byId.get(row.id));
    }
  }
  let reached = 0;
  const stack = [root, ...orphans];
  while (stack.length > 0) {
    const node = stack.pop();
    reached++;
    for (const child of node.children) stack.push(child);
  }
  const stuck = byId.size - reached;
  if (stuck > 0) problems.push(`${stuck} categories are in a loop or below one`);
  return { root, problems };
}

const broken = [
  { id: 1, name: "Electronics", parentId: null },
  { id: 2, name: "Phones", parentId: 1 },
  { id: 2, name: "Mobile phones", parentId: 4 },
  { id: 3, name: "Toys", parentId: 42 },
  { id: 4, name: "Gadgets", parentId: 5 },
  { id: 5, name: "Accessories", parentId: 4 },
];

const { problems } = buildTreeSafely(broken);
for (const problem of problems) console.log("problem:", problem);
```

Output of `node safe-build.js` and of the browser terminal

```ts
problem: duplicate id 2 ("Mobile phones" skipped)
problem: "Toys" has missing parent 42
problem: 2 categories are in a loop or below one
```

Skipping the duplicate row matters: linking it as well would give node 2 a second parent, and here that second parent sits in the Gadgets loop. The loop check uses an explicit stack instead of recursion, for a reason you will meet in [Deep trees and the call stack](#deep). It cannot loop forever itself: every accepted row is linked under at most one parent, so a node in a loop can only be reached from inside that loop, never from the root or an orphan. Toys is reported as an orphan but still counted as reachable, so only the two looping categories are counted as stuck.

## Walking a tree: four orders

A **traversal** visits every node of a tree exactly once. Unlike an array, a tree has no single obvious order, so there are several, and each one answers a different kind of question.

- **Pre-order**: visit the node, then its children. A parent always comes before anything inside it. Use it to print menus and outlines, or to copy a tree.
- **Post-order**: visit the children, then the node. A parent comes after everything inside it. Use it when a node's answer depends on its children's answers: folder sizes, totals, deleting a tree.
- **Level order** (also called **breadth-first**): all nodes at depth 0, then depth 1, then depth 2. Use it for "show the top two levels" or "find the nearest match".
- **In-order** only makes sense for binary trees: left subtree, node, right subtree. It comes back in [Binary trees](#binary).

Pre-order and post-order are both **depth-first**: they go all the way down one branch before moving to the next.

### Pre-order: the menu, now in O(n)

menu.js

```ts
import { rows, buildTree } from "./categories.js";

let visits = 0;

function printMenu(node, depth) {
  visits++;
  console.log("  ".repeat(depth) + node.name);
  for (const child of node.children) printMenu(child, depth + 1);
}

printMenu(buildTree(rows), 0);
console.log(`visits: ${visits}`);
```

Output of `node menu.js` and of the browser terminal

```ts
All categories
  Electronics
    Phones
      Android
      iPhone
    Laptops
      Gaming laptops
  Fashion
    Shoes
      Sneakers
visits: 10
```

Same menu as the first example, but each node is visited once: 10 visits instead of 90 comparisons. For 5,000 categories that is 5,001 visits instead of about 25 million comparisons.

### Post-order: folder sizes

A file system is a tree: folders are internal nodes, files are leaves. The size of a folder is the sum of everything inside it, so you cannot know it until you have measured the children. That is post-order:

folder-sizes.js

```ts
const disk = {
  name: "shop/", children: [
    { name: "images/", children: [
      { name: "logo.png", bytes: 12000 },
      { name: "banner.jpg", bytes: 48000 },
    ] },
    { name: "src/", children: [
      { name: "cart.js", bytes: 3000 },
      { name: "lib/", children: [{ name: "money.js", bytes: 1000 }] },
    ] },
    { name: "README.md", bytes: 500 },
  ],
};

function totalBytes(node, depth) {
  let total = node.bytes ?? 0;
  for (const child of node.children ?? []) total += totalBytes(child, depth + 1);
  console.log(`${"  ".repeat(depth)}${node.name} ${total}`);
  return total;
}

totalBytes(disk, 0);
```

Output of `node folder-sizes.js` and of the browser terminal

```ts
    logo.png 12000
    banner.jpg 48000
  images/ 60000
    cart.js 3000
      money.js 1000
    lib/ 1000
  src/ 4000
  README.md 500
shop/ 64500
```

Every line is printed *after* its children's lines, and the root comes last. That is exactly what the `du` command on Linux and macOS does, for the same reason.

### Level order with a queue

To visit level by level you need to remember the nodes you have seen but not yet expanded, and take them in the order you found them: first in, first out. That is a queue (see [Stacks and queues](https://zudojs.oyinlola.site/learn/dsa-stacks-queues)). Here the queue is an array with a `head` index, because `shift()` can move every remaining element on each call (O(n) on large arrays), which would make the walk O(n²):

levels.js

```ts
import { rows, buildTree } from "./categories.js";

function levels(root) {
  const result = [];
  const queue = [{ node: root, depth: 0 }];
  let head = 0;
  while (head < queue.length) {
    const { node, depth } = queue[head++];
    (result[depth] ??= []).push(node.name);
    for (const child of node.children) queue.push({ node: child, depth: depth + 1 });
  }
  return result;
}

levels(buildTree(rows)).forEach((names, depth) => {
  console.log(`depth ${depth}: ${names.join(", ")}`);
});
```

Output of `node levels.js` and of the browser terminal

```ts
depth 0: All categories
depth 1: Electronics, Fashion
depth 2: Phones, Laptops, Shoes
depth 3: Android, iPhone, Gaming laptops, Sneakers
```

Level order is still O(n) time. Its memory is the widest level that sits in the queue at once, which for a wide, shallow tree (a big menu) can be much more than the height.

### Walking up: breadcrumbs

A product page shows a breadcrumb such as *Electronics › Laptops › Gaming laptops*. That is the path from the root down to one node. You do not need to search the whole tree for it: start at the node and follow `parentId` up, which costs O(depth), then reverse.

breadcrumb.js

```ts
import { rows } from "./categories.js";

const byId = new Map(rows.map((row) => [row.id, row]));

function breadcrumb(id) {
  const path = [];
  let current = byId.get(id);
  while (current) {
    path.push(current.name);
    if (path.length > byId.size) throw new Error(`loop above category ${id}`);
    current = byId.get(current.parentId);
  }
  return path.reverse().join(" › ");
}

console.log(breadcrumb(9));
console.log(breadcrumb(8));
console.log(breadcrumb(1));
```

Output of `node breadcrumb.js` and of the browser terminal

```ts
Electronics › Laptops › Gaming laptops
Fashion › Shoes › Sneakers
Electronics
```

The length check is the guard from the reasoning box: a path can never be longer than the number of categories, so if it is, the data has a loop, and the function stops with an error instead of spinning forever.

## The DOM is a tree

You work with a tree every time a browser loads a page. The HTML becomes the **DOM** (Document Object Model): a tree whose root is the `<html>` element, and every element's children are the elements written inside it. Frameworks walk this tree constantly; so do screen readers and your browser's developer tools.

The page below is a small product page. The example runs against it in your browser, walks the DOM in pre-order, measures its height and builds a table of contents from the headings. The DOM calls these links `children` too:

index.html

```ts
<!doctype html>
<html>
<body>
  <header><h1>Gaming laptops</h1></header>
  <main>
    <section>
      <h2>Specifications</h2>
      <ul><li>16 GB memory</li><li>1 TB storage</li></ul>
    </section>
    <section>
      <h2>Reviews</h2>
      <article><h3>Fast and quiet</h3><p>Five stars.</p></article>
    </section>
  </main>
</body>
</html>
```

walk-dom.js

```ts
let count = 0;
let deepest = 0;
const headings = [];

function walk(element, depth) {
  count++;
  deepest = Math.max(deepest, depth);
  if (/^H[1-3]$/.test(element.tagName)) {
    const level = Number(element.tagName[1]);
    headings.push("  ".repeat(level - 1) + element.textContent);
  }
  for (const child of element.children) walk(child, depth + 1);
}

walk(document.body, 0);
console.log(`elements, counting body itself: ${count}`);
console.log(`deepest element is ${deepest} levels below body`);
console.log(headings.join("\n"));
```

What the browser terminal prints

```ts
elements, counting body itself: 14
deepest element is 4 levels below body
Gaming laptops
  Specifications
  Reviews
    Fast and quiet
```

Pre-order is **document order**: every element comes before the elements inside it, exactly as the tags appear in the HTML, which is the order a reader meets them. (These headings contain no other elements, so a post-order walk would happen to list them in the same order; but it would list each `<section>` after its heading and `<body>` last, which is useless for anything that must see a container before its contents.)

## Deep trees and the call stack

Recursion uses one call-stack frame per level of the tree, and the stack is small: JavaScript engines allow roughly ten thousand frames, depending on the engine and how big each frame is. Most trees are shallow, but not all. A comment thread where each reply answers the previous one is a tree of height 100,000 if people keep replying. Data from outside can be deep on purpose, to crash your server.

The fix is to replace the call stack with your own stack, an array, which lives on the heap and can hold millions of entries:

deep-thread.js

```ts
function makeThread(replies) {
  const root = { text: "comment 0", children: [] };
  let current = root;
  for (let i = 1; i < replies; i++) {
    const reply = { text: `comment ${i}`, children: [] };
    current.children.push(reply);
    current = reply;
  }
  return root;
}

function countRecursive(node) {
  let total = 1;
  for (const child of node.children) total += countRecursive(child);
  return total;
}

function countWithStack(root) {
  let total = 0;
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    total++;
    for (const child of node.children) stack.push(child);
  }
  return total;
}

const thread = makeThread(200_000);
try {
  countRecursive(thread);
} catch (error) {
  console.log(error.name + ": " + error.message);
}
console.log("with a stack:", countWithStack(thread));
```

Output of `node deep-thread.js` and of the browser terminal

```ts
RangeError: Maximum call stack size exceeded
with a stack: 200000
```

One detail when you use a stack for pre-order: the last child pushed is the first popped, so children come out right to left. If the order matters, push them in reverse:

stack-preorder.js

```ts
import { rows, buildTree } from "./categories.js";

function preorder(root) {
  const names = [];
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    names.push(node.name);
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
  }
  return names;
}

console.log(preorder(buildTree(rows)).join(" > "));
```

Output of `node stack-preorder.js` and of the browser terminal

```ts
All categories > Electronics > Phones > Android > iPhone > Laptops > Gaming laptops > Fashion > Shoes > Sneakers
```

> TIP
>
> Replace the stack with a queue and the same loop becomes a level-order walk. Depth-first and breadth-first differ in one decision: which waiting node you expand next.

## Binary trees

A **binary tree** is a tree where every node has at most two children, called `left` and `right`. Because the two slots have names, a node with only a right child is different from a node with only a left child.

Some shapes have names:

- **Full**: every node has zero or two children.
- **Perfect**: full, and all leaves are at the same depth. A perfect tree of height *h* has 2h+1 − 1 nodes: 1, 3, 7, 15, 31… So a perfect tree of height 19 already holds 1,048,575 nodes: height grows with the logarithm of the size.
- **Complete**: every level is full except maybe the last, which fills from the left. This is the shape a heap uses in [the next lesson](https://zudojs.oyinlola.site/learn/dsa-heaps).

Binary trees add the fourth traversal, **in-order**: left subtree, then the node, then the right subtree. An **expression tree** shows all three depth-first orders at once. The price of three laptops plus delivery, `2500 * 3 + 1500`, is a tree with the operator at each internal node and the numbers at the leaves:

```ts
        +
      /   \
     *     1500
   /   \
 2500   3
```

The expression tree for 2500 * 3 + 1500: operators inside, numbers at the leaves.

expression-tree.js

```ts
const leaf = (value) => ({ value, left: null, right: null });
const op = (value, left, right) => ({ value, left, right });

const total = op("+", op("*", leaf(2500), leaf(3)), leaf(1500));

function preorder(node) {
  if (node === null) return [];
  return [node.value, ...preorder(node.left), ...preorder(node.right)];
}

function postorder(node) {
  if (node === null) return [];
  return [...postorder(node.left), ...postorder(node.right), node.value];
}

function inorder(node) {
  if (node.left === null) return String(node.value);
  return `(${inorder(node.left)} ${node.value} ${inorder(node.right)})`;
}

function evaluate(node) {
  if (node.left === null) return node.value;
  const a = evaluate(node.left);
  const b = evaluate(node.right);
  return node.value === "+" ? a + b : a * b;
}

console.log("pre-order: ", preorder(total).join(" "));
console.log("in-order:  ", inorder(total));
console.log("post-order:", postorder(total).join(" "));
console.log("value:     ", evaluate(total));
```

Output of `node expression-tree.js` and of the browser terminal

```ts
pre-order:  + * 2500 3 1500
in-order:   ((2500 * 3) + 1500)
post-order: 2500 3 * 1500 +
value:      9000
```

In-order gives the formula as people write it. Post-order gives it in the order a calculator needs (both numbers before the operator), and `evaluate` is a post-order walk: it cannot apply `*` until it knows both sides. Spreadsheets, template engines and compilers all evaluate expression trees like this.

## Binary search trees

The shop's order service keeps recent orders in memory, keyed by order number. It needs three things: find an order by number, add orders, and list orders *in number order* (for a report, or "all orders between 3000 and 5000"). A `Map` finds an order in O(1), but it has no order by key: listing them sorted costs an O(n log n) sort every time. A sorted array lists in order and finds in O(log n) with binary search (you will write it in [Searching](https://zudojs.oyinlola.site/learn/dsa-searching)), but every insert shifts elements over: O(n).

A **binary search tree** (BST) keeps keys sorted *and* makes inserting cheap. It is a binary tree with one rule, the **BST invariant**:

For every node, every key in its left subtree is smaller than the node's key, and every key in its right subtree is larger.

An **invariant** is a fact that must be true after every operation. The whole data structure depends on it: to find a key, compare with the current node and go left or right, throwing away a whole subtree with each step, like guessing a number with "higher" and "lower". And because everything smaller is on the left, an in-order walk gives the keys sorted.

```ts
              5040
            /      \
        3020        7011
       /    \      /    \
    2005   4100  6010   8800
```

A binary search tree of order numbers: smaller keys to the left, larger to the right.

Here is a BST class. It stores a key and a value in each node, counts comparisons so you can see the cost, and exposes the root read-only so outside code can inspect the shape:

bst.js

```ts
export class BST {
  #root = null;
  #size = 0;
  comparisons = 0;

  get root() { return this.#root; }
  get size() { return this.#size; }

  insert(key, value) {
    const node = { key, value, left: null, right: null };
    if (this.#root === null) {
      this.#root = node;
      this.#size++;
      return;
    }
    let current = this.#root;
    while (true) {
      this.comparisons++;
      if (key === current.key) {
        current.value = value;
        return;
      }
      const side = key < current.key ? "left" : "right";
      if (current[side] === null) {
        current[side] = node;
        this.#size++;
        return;
      }
      current = current[side];
    }
  }

  get(key) {
    let current = this.#root;
    while (current !== null) {
      this.comparisons++;
      if (key === current.key) return current.value;
      current = key < current.key ? current.left : current.right;
    }
    return undefined;
  }

  min() {
    let current = this.#root;
    while (current?.left) current = current.left;
    return current?.key;
  }

  max() {
    let current = this.#root;
    while (current?.right) current = current.right;
    return current?.key;
  }

  keys() {
    const out = [];
    const stack = [];
    let current = this.#root;
    while (current !== null || stack.length > 0) {
      while (current !== null) {
        stack.push(current);
        current = current.left;
      }
      current = stack.pop();
      out.push(current.key);
      current = current.right;
    }
    return out;
  }

  delete(key) {
    const before = this.#size;
    this.#root = this.#remove(this.#root, key);
    return this.#size < before;
  }

  #remove(node, key) {
    if (node === null) return null;
    this.comparisons++;
    if (key < node.key) {
      node.left = this.#remove(node.left, key);
      return node;
    }
    if (key > node.key) {
      node.right = this.#remove(node.right, key);
      return node;
    }
    if (node.left === null) { this.#size--; return node.right; }
    if (node.right === null) { this.#size--; return node.left; }
    let successor = node.right;
    while (successor.left !== null) successor = successor.left;
    node.key = successor.key;
    node.value = successor.value;
    node.right = this.#remove(node.right, successor.key);
    return node;
  }

  height(node = this.#root) {
    if (node === null) return -1;
    return 1 + Math.max(this.height(node.left), this.height(node.right));
  }
}
```

Some things to notice:

- `insert` walks down exactly as a search would, and hangs the new node in the empty slot where the search fell off the tree. Inserting an existing key updates its value instead of adding a duplicate. That is a design choice; a BST that allows duplicates must pick a side for equal keys and stick to it.
- `min` is the leftmost node and `max` the rightmost. The `?.` handles the empty tree, where both return `undefined`.
- `keys()` is an in-order walk written with an explicit stack, so a deep tree cannot overflow the call stack. It pushes the path down the left side, takes the smallest waiting node, then moves into its right subtree. It returns the keys as an array.
- `#remove` returns the new root of the subtree it was given, and the caller stores it. That one pattern handles all three delete cases, which the next reasoning box works through.

orders.js

```ts
import { BST } from "./bst.js";

const orders = new BST();
for (const [id, customer] of [
  [5040, "Ada"], [3020, "Tunde"], [7011, "Chioma"], [2005, "Emeka"],
  [4100, "Bola"], [6010, "Ifeoma"], [8800, "Yusuf"],
]) {
  orders.insert(id, customer);
}

console.log("in order:", orders.keys().join(" "));
console.log("size:", orders.size, "height:", orders.height());
console.log("min:", orders.min(), "max:", orders.max());

orders.comparisons = 0;
console.log("order 6010:", orders.get(6010), `(${orders.comparisons} comparisons)`);
orders.comparisons = 0;
console.log("order 6500:", orders.get(6500), `(${orders.comparisons} comparisons)`);
```

Output of `node orders.js` and of the browser terminal

```ts
in order: 2005 3020 4100 5040 6010 7011 8800
size: 7 height: 2
min: 2005 max: 8800
order 6010: Ifeoma (3 comparisons)
order 6500: undefined (3 comparisons)
```

Finding 6010 compared with 5040 (go right), 7011 (go left) and 6010 (found): 3 comparisons out of 7 orders. Order 6500 does not exist; the search walked the same path and fell off below 6010. Both cost at most height + 1 comparisons. Every BST operation walks one path from the root, so **every operation is O(h)**.

REASON IT OUT

### Deleting from a BST

Deleting a key must remove one node and keep the BST invariant true for every node that remains. Before reading `#remove` closely, work out the cases. What should happen if the node to delete is a leaf? If it has one child? If it has two children, which node can take its place without breaking the rule for either subtree? And what if the key is not in the tree at all, or it is the root?

**Show the reasoning**

- **A leaf**: just remove it. Its parent's slot becomes `null`. In the code, `node.left === null` is true, so it returns `node.right`, which is also `null`.
- **One child**: the child moves up into the deleted node's place. Everything in that child's subtree was already on the correct side of the parent, so the invariant still holds.
- **Two children**: you cannot hang two subtrees on one slot. Instead, replace the node's key with its **in-order successor**: the smallest key in its right subtree (go right once, then left as far as possible). That key is larger than everything on the left and smaller than everything else on the right, so it fits exactly. Then delete the successor from the right subtree; it has no left child, so that is the easy case. (The largest key on the left, the in-order predecessor, works too.)
- **Missing key**: the search reaches `null` and returns it unchanged; `size` does not change, and `delete` returns `false`.
- **The root**: no special case, because `delete` stores whatever `#remove` returns as the new root.

To trust a delete, check the invariant after it. The check must carry a *range* down the tree: every node must be between the smallest and largest key its ancestors allow, not only compared with its own children.

delete.js

```ts
import { BST } from "./bst.js";

function isValidBST(node, low = -Infinity, high = Infinity) {
  if (node === null) return true;
  if (node.key <= low || node.key >= high) return false;
  return isValidBST(node.left, low, node.key) && isValidBST(node.right, node.key, high);
}

const orders = new BST();
for (const id of [5040, 3020, 7011, 2005, 4100, 6010, 8800, 6500]) orders.insert(id, `order ${id}`);

function show(label) {
  console.log(`${label.padEnd(24)} ${orders.keys().join(" ")} | root ${orders.root.key} | valid ${isValidBST(orders.root)}`);
}

show("start");
orders.delete(2005);
show("delete leaf 2005");
orders.delete(6010);
show("delete 6010 (one child)");
orders.delete(5040);
show("delete root 5040");
console.log("delete missing 1234:", orders.delete(1234), "size:", orders.size);
```

Output of `node delete.js` and of the browser terminal

```ts
start                    2005 3020 4100 5040 6010 6500 7011 8800 | root 5040 | valid true
delete leaf 2005         3020 4100 5040 6010 6500 7011 8800 | root 5040 | valid true
delete 6010 (one child)  3020 4100 5040 6500 7011 8800 | root 5040 | valid true
delete root 5040         3020 4100 6500 7011 8800 | root 6500 | valid true
delete missing 1234: false size: 5
```

Deleting the root 5040, which has two children, copied its successor 6500 (the smallest key on the right) into the root and removed 6500 from below.

### The classic bug: checking only the children

The most common wrong validity check compares each node only with its direct children. It misses a key that is on the wrong side of a grandparent:

naive-check.js

```ts
const node = (key, left = null, right = null) => ({ key, left, right });

//        5040
//       /    \
//    3020    7011
//       \
//       6000   <- larger than 5040, but in its LEFT subtree
const tree = node(5040, node(3020, null, node(6000)), node(7011));

function naiveCheck(n) {
  if (n === null) return true;
  if (n.left && n.left.key >= n.key) return false;
  if (n.right && n.right.key <= n.key) return false;
  return naiveCheck(n.left) && naiveCheck(n.right);
}

function isValidBST(n, low = -Infinity, high = Infinity) {
  if (n === null) return true;
  if (n.key <= low || n.key >= high) return false;
  return isValidBST(n.left, low, n.key) && isValidBST(n.right, n.key, high);
}

console.log("naive check:", naiveCheck(tree));
console.log("range check:", isValidBST(tree));
```

Output of `node naive-check.js` and of the browser terminal

```ts
naive check: true
range check: false
```

Every parent-child pair looks fine, yet a search for 6000 goes right at 5040 and never finds it. The range check catches it: 6000 is in 5040's left subtree, so its upper bound is 5040.

## Balanced and unbalanced trees

O(h) is only good news if *h* is small. The height depends entirely on the *order* of the inserts. Order numbers are usually created in increasing order, and inserting sorted keys into a BST makes each new key the right child of the previous one. The "tree" becomes a linked list leaning to the right:

```ts
1
 \
  2
   \
    3        height = n - 1
     \
      …
```

Sorted inserts build a chain leaning right: a linked list in disguise.

Let us measure it with 1,023 orders inserted three ways: sorted, shuffled, and chosen so the tree comes out perfectly balanced (insert the middle key first, then recursively the middle of each half). The shuffle uses a small seeded random generator so the numbers are the same on every run:

balance.js

```ts
import { BST } from "./bst.js";

const n = 1023;
const sorted = Array.from({ length: n }, (_, i) => i + 1);

let seed = 42;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const shuffled = [...sorted];
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(random() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}

function middleFirst(keys, out = []) {
  if (keys.length === 0) return out;
  const mid = Math.floor(keys.length / 2);
  out.push(keys[mid]);
  middleFirst(keys.slice(0, mid), out);
  middleFirst(keys.slice(mid + 1), out);
  return out;
}

for (const [label, keys] of [["sorted", sorted], ["shuffled", shuffled], ["balanced", middleFirst(sorted)]]) {
  const tree = new BST();
  for (const key of keys) tree.insert(key, null);
  const insertCost = tree.comparisons;
  let worst = 0;
  for (const key of sorted) {
    tree.comparisons = 0;
    tree.get(key);
    worst = Math.max(worst, tree.comparisons);
  }
  console.log(`${label.padEnd(9)} height ${String(tree.height()).padStart(4)}  worst lookup ${String(worst).padStart(4)}  total insert comparisons ${insertCost}`);
}
```

Output of `node balance.js` and of the browser terminal

```ts
sorted    height 1022  worst lookup 1023  total insert comparisons 522753
shuffled  height   23  worst lookup   24  total insert comparisons 11404
balanced  height    9  worst lookup   10  total insert comparisons 8194
```

Same keys, same code, wildly different trees. Sorted input gives height 1,022: finding the newest order takes 1,023 comparisons, exactly like scanning an array, and building the tree took over half a million comparisons, O(n²). Random input gives height 23, about two to three times log₂ n (log₂ 1,023 is about 10). That is typical for random input, and still O(log n). The balanced tree has height 9 = log₂(1024) − 1, and no lookup needs more than 10 comparisons.

| Operation | Balanced BST | Degenerate BST (a list) | Sorted array | `Map` |
| --- | --- | --- | --- | --- |
| Find by key | O(log n) | O(n) | O(log n) | O(1) average |
| Insert | O(log n) | O(n) | O(n) (shifting) | O(1) average |
| Delete | O(log n) | O(n) | O(n) (shifting) | O(1) average |
| All keys in order | O(n) | O(n) | O(n) | O(n log n) (sort) |
| Min / max | O(log n) | O(n) | O(1) | O(n) |

A tree is **balanced** when its height stays O(log n) whatever the insert order. You cannot guarantee that with the plain BST above. **Self-balancing trees** fix it by rearranging nodes after inserts and deletes, using small local moves called **rotations** that change the shape without breaking the invariant:

- An **AVL tree** keeps the heights of every node's two subtrees within 1 of each other.
- A **red-black tree** colours nodes and keeps a looser rule, which means fewer rotations on insert. Java's `TreeMap` and the Linux kernel's scheduler use one.
- A **B-tree** gives each node many keys and many children, so the tree is very short and each node fills one disk page. Nearly every database index is a B-tree variant, which is why an indexed lookup in [PostgreSQL](https://zudojs.oyinlola.site/learn/sql-advanced#performance) stays fast at millions of rows.

Implementing a self-balancing tree is a good exercise but rarely a job requirement. The part to remember is the risk: **a plain BST fed sorted or nearly sorted data is a slow linked list**, and real data (ids, timestamps, dates) is very often sorted.

## Testing a tree

A handful of hand-picked cases will not find the bug that appears on the 300th delete. A stronger technique is to run a long random sequence of operations against the BST and against a **reference model**: a simple structure that is obviously correct, even if slow. Here the model is a plain array kept sorted. After every operation, three things must hold: the BST invariant, the same size, and the same keys in the same order.

bst-test.js

```ts
import { BST } from "./bst.js";

function isValidBST(node, low = -Infinity, high = Infinity) {
  if (node === null) return true;
  if (node.key <= low || node.key >= high) return false;
  return isValidBST(node.left, low, node.key) && isValidBST(node.right, node.key, high);
}

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok ? "" : ` -> got ${JSON.stringify(actual)}`}`);
}

const empty = new BST();
check("get on empty tree", empty.get(1), undefined);
check("delete on empty tree", empty.delete(1), false);
check("min of empty tree", empty.min(), undefined);

const one = new BST();
one.insert(7, "a");
one.insert(7, "b");
check("duplicate insert updates", [one.size, one.get(7)], [1, "b"]);
check("delete only node", [one.delete(7), one.size, one.root], [true, 0, null]);

let seed = 7;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const tree = new BST();
const model = [];
let failures = 0;
for (let step = 0; step < 2000; step++) {
  const key = Math.floor(random() * 300);
  if (random() < 0.6) {
    tree.insert(key, step);
    if (!model.includes(key)) model.push(key);
  } else {
    tree.delete(key);
    if (model.includes(key)) model.splice(model.indexOf(key), 1);
  }
  model.sort((a, b) => a - b);
  const same = tree.size === model.length && tree.keys().join() === model.join();
  if (!same || !isValidBST(tree.root)) failures++;
}
check("2000 random operations match the model", failures, 0);
console.log("final size:", tree.size, "height:", tree.height());
```

Output of `node bst-test.js` and of the browser terminal

```ts
PASS get on empty tree
PASS delete on empty tree
PASS min of empty tree
PASS duplicate insert updates
PASS delete only node
PASS 2000 random operations match the model
final size: 180 height: 14
```

This style is called **model-based** or **property-based** testing. The random sequence is seeded, so when it finds a failure you can replay the exact same sequence while you debug. Libraries such as fast-check automate it and even shrink a failing sequence down to the few operations that matter. To prove the test has teeth, break the code on purpose: remove the line `node.right = this.#remove(node.right, successor.key)` and the test fails straight away, because the successor's key would appear twice.

## Trees in real applications

- **Storing trees in a database.** The `parentId` column you started with is called an **adjacency list**, and it is the usual choice. Load the rows once and build the tree in O(n) as you did, or let PostgreSQL walk it with a recursive query (`WITH RECURSIVE`). Add a foreign key so a parent cannot be deleted while it has children, and validate on write that a new `parentId` is not the category itself or one of its descendants: that is how loops get in.
- **Keep the depth bounded or use explicit stacks.** Menus are shallow, but comment threads, org charts and JSON from users are not. Any recursive walk over input you do not control should either cap the depth or use a stack.
- **Do you need a BST at all?** In JavaScript, usually not. If you only look things up by key, a `Map` is faster and simpler. If the data changes rarely, a sorted array with binary search is compact and fast. If it lives in a database, an index (a B-tree) already does the job. Reach for a balanced tree when you need sorted order, range queries and frequent inserts and deletes all at once in memory, and then prefer a well-tested library.
- **Memory.** Each node is an object with two or three references, so a tree of numbers uses several times the memory of an array of the same numbers. That is part of why sorted arrays win for read-heavy data.
- **Trees are everywhere else.** The DOM, file systems, JSON documents, the abstract syntax tree your code becomes before it runs, the routing table of a web framework, the `node_modules` folder. Once you can walk one tree, you can walk all of them.

## Practice

TRY IT YOURSELF

### Products per category

Each leaf category has a `products` count. Print the menu with the total number of products under every category, including the invisible root. Which traversal do you need to *compute* the totals, and which one to *print* them in menu order?

**Show a solution**

category-totals.js

```ts
const tree = {
  name: "All categories", children: [
    { name: "Electronics", children: [
      { name: "Phones", children: [
        { name: "Android", products: 120, children: [] },
        { name: "iPhone", products: 45, children: [] },
      ] },
      { name: "Laptops", products: 30, children: [] },
    ] },
    { name: "Fashion", children: [{ name: "Sneakers", products: 210, children: [] }] },
  ],
};

function addTotals(node) {
  node.total = node.products ?? 0;
  for (const child of node.children) node.total += addTotals(child);
  return node.total;
}

function print(node, depth) {
  console.log(`${"  ".repeat(depth)}${node.name} (${node.total})`);
  for (const child of node.children) print(child, depth + 1);
}

addTotals(tree);
print(tree, 0);
```

Output of `node category-totals.js` and of the browser terminal

```ts
All categories (405)
  Electronics (195)
    Phones (165)
      Android (120)
      iPhone (45)
    Laptops (30)
  Fashion (210)
    Sneakers (210)
```

Computing is post-order (a total needs its children's totals first); printing is pre-order (a parent before its children). Two O(n) walks are still O(n). You could do it in one walk by collecting lines and printing them afterwards, but two simple walks are easier to read.

TRY IT YOURSELF

### Orders in a range

Using the `BST` class, write `range(tree, low, high)` that returns the keys between `low` and `high` inclusive, in order. Do not walk subtrees that cannot contain an answer. Count how many nodes you visit for the range 3000 to 4500 in a tree of 15 orders.

**Show a solution**

range.js

```ts
import { BST } from "./bst.js";

let visited = 0;

function range(node, low, high, out = []) {
  if (node === null) return out;
  visited++;
  if (low < node.key) range(node.left, low, high, out);
  if (low <= node.key && node.key <= high) out.push(node.key);
  if (node.key < high) range(node.right, low, high, out);
  return out;
}

const orders = new BST();
for (const id of [5000, 3000, 7000, 2000, 4000, 6000, 8000, 1500, 2500, 3500, 4500, 5500, 6500, 7500, 8500]) {
  orders.insert(id, null);
}

console.log(range(orders.root, 3000, 4500).join(" "));
console.log(`visited ${visited} of ${orders.size} nodes`);
```

Output of `node range.js` and of the browser terminal

```ts
3000 3500 4000 4500
visited 5 of 15 nodes
```

It is an in-order walk with two gates: only go left if smaller keys could still be in range, only go right if larger ones could. The cost is O(h + k), where *k* is the number of results: one path down to the start of the range, then the matches. A sorted array with binary search gives the same bound; a `Map` would have to check all *n* keys.

TRY IT YOURSELF

### Delivery rate for a weight

A courier charges by weight band: from 0 kg ₦1,500, from 2 kg ₦2,800, from 5 kg ₦4,500, from 10 kg ₦7,000, from 20 kg ₦12,000. Store the bands in a BST keyed by the starting weight, and write `floor(tree, weight)`: the node with the largest key that is less than or equal to `weight`. Print the rate for 0.5 kg, 5 kg, 7.3 kg and 25 kg.

**Show a solution**

floor.js

```ts
import { BST } from "./bst.js";

function floor(tree, weight) {
  let best = null;
  let current = tree.root;
  while (current !== null) {
    if (current.key === weight) return current;
    if (current.key < weight) {
      best = current;
      current = current.right;
    } else {
      current = current.left;
    }
  }
  return best;
}

const rates = new BST();
for (const [from, naira] of [[5, 4500], [0, 1500], [10, 7000], [2, 2800], [20, 12000]]) {
  rates.insert(from, naira);
}

for (const weight of [0.5, 5, 7.3, 25]) {
  const band = floor(rates, weight);
  console.log(`${weight} kg -> from ${band.key} kg: ₦${band.value.toLocaleString("en-NG")}`);
}
```

Output of `node floor.js` and of the browser terminal

```ts
0.5 kg -> from 0 kg: ₦1,500
5 kg -> from 5 kg: ₦4,500
7.3 kg -> from 5 kg: ₦4,500
25 kg -> from 20 kg: ₦12,000
```

Whenever a key is small enough, it is a candidate; remember it and go right to look for a bigger one that still fits. When a key is too big, go left. One path, so O(h). Floor and its mirror, ceiling, are the tree versions of the lower and upper bound searches in [Searching](https://zudojs.oyinlola.site/learn/dsa-searching).

## Recap

- A tree has one root, every other node has exactly one parent, and there are no loops. Depth counts edges down from the root; height counts edges down to the deepest leaf.
- Build a tree from `parentId` rows in O(n) with a map from id to node, and validate outside data: orphans, duplicate ids and loops are all real.
- Pre-order (node first) prints outlines, post-order (children first) computes totals, level order (a queue) goes depth by depth, and in-order on a BST yields sorted keys. All are O(n).
- Recursive walks use O(h) stack; deep or untrusted trees need an explicit stack.
- A BST keeps smaller keys on the left and larger on the right, so search, insert and delete walk one path: O(h). Delete with two children uses the in-order successor. Check validity with a range, not by comparing only with children.
- h is O(log n) only when the tree is balanced. Sorted input turns a plain BST into a list with O(n) operations; self-balancing trees (AVL, red-black) and database B-trees prevent that.

Next: [Heaps and priority queues](https://zudojs.oyinlola.site/learn/dsa-heaps) use a complete binary tree stored in a plain array to always hand you the most urgent job first.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
