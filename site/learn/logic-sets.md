---
title: "Sets — ZudoJS Academy"
description: "Reason about groups with sets: remove duplicates, test membership, and combine permissions, tags and mailing lists with union, intersection and difference."
source: https://zudojs.oyinlola.site/learn/logic-sets
---

LEVEL 1 · LESSON 12 OF 18

Logic and mathematical thinking Foundation

# Sets

Reason about groups with sets: remove duplicates, test membership, and combine permissions, tags and mailing lists with union, intersection and difference.

- **45 min** to read and try
- **You need:** Boolean logic and Conditional reasoning
- **You build:** A role-based permission checker that says exactly which permissions a user is missing, plus a de-duplicated newsletter list

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain what a set is and why membership, not order or count, is what it tracks
- Use JavaScript's Set to remove duplicates and test membership with has, add, delete and size
- Combine sets with union, intersection, difference and symmetric difference, and link each to OR, AND, AND NOT and XOR
- Check permissions with isSubsetOf and report what is missing with difference
- Avoid the classic set traps: object identity, unnormalised text and new Set("text")

## Three thousand customers got the same email twice

A shop keeps two lists of customers who agreed to receive its newsletter: one from the website, one from the tills in its stores. For the big sale, a developer joins the two lists and sends the email to everyone on the result:

double-send.js

```ts
const webList = ["ada@mail.com", "bola@mail.com", "chidi@mail.com"];
const storeList = ["bola@mail.com", "dayo@mail.com", "ada@mail.com"];

const everyone = [...webList, ...storeList];
console.log(everyone.length, "emails to send");
for (const email of everyone) {
  console.log("sending to", email);
}
```

Output of `node double-send.js` and of the browser terminal

```ts
6 emails to send
sending to ada@mail.com
sending to bola@mail.com
sending to chidi@mail.com
sending to bola@mail.com
sending to dayo@mail.com
sending to ada@mail.com
```

`[...webList, ...storeList]` builds one array from the items of both; the three dots are called **spread**. The result has six entries, but only four customers. Ada and Bola signed up in both places and got the sale email twice. With real lists of tens of thousands, three thousand people get duplicates, some of them report the shop as spam, and the email provider starts filtering its messages.

The developer thought of the lists as *lists*: ordered, and allowed to repeat. The question was really about *groups of people*: who is in at least one list? That question belongs to **sets**. This lesson shows how sets work, how JavaScript's `Set` implements them, and how the set operations map onto the AND, OR and NOT you already know. They will answer questions like "which permissions is this user missing?" and "which tags do these two products share?" in one line each.

## What a set is

A **set** is a collection of distinct things, called its **elements** or **members**. Two properties make it different from a list:

- **No duplicates.** A thing is either in the set or not. Adding it twice changes nothing.
- **Membership is the question.** The main thing you ask a set is "is this element in you?". Mathematically the order of elements does not matter: {Ada, Bola} and {Bola, Ada} are the same set.

Mathematics writes sets with braces, `{ada, bola, chidi}`, and membership with the symbol ∈: "ada ∈ W" reads "ada is an element of W". You will not need the symbols to write code, but you will meet them in documentation, so they appear once or twice below with their meaning.

### JavaScript's Set

JavaScript has a built-in `Set`. You create one with `new Set(…)`, optionally passing an array of starting elements. (`new` creates a fresh object of a built-in kind.) A set has a few **methods**, functions that belong to it and are called with a dot:

set-basics.js

```ts
const cart = new Set(["rice", "beans", "rice", "oil"]);

console.log(cart);
console.log(cart.size);          // how many distinct elements
console.log(cart.has("beans"));  // membership: true or false
console.log(cart.has("sugar"));

cart.add("sugar");
cart.add("rice");                // already there: nothing happens
cart.delete("beans");
console.log(cart);
```

Output of `node set-basics.js` and of the browser terminal

```ts
Set(3) { 'rice', 'beans', 'oil' }
3
true
false
Set(3) { 'rice', 'oil', 'sugar' }
```

JavaScript prints a set as `Set(size) { … }`, with text in single quotes. The second `"rice"` in the array was dropped at once, and adding it again later did nothing. `size` has no parentheses, because it is a **property** (a value), not a method.

JavaScript's `Set` does remember the order in which elements were first added, and loops over them in that order. That is a convenience; do not build logic that depends on it.

### Removing duplicates

The most common everyday use of a set is removing duplicates from an array: put the items into a set, then spread the set back into an array:

dedupe.js

```ts
const webList = ["ada@mail.com", "bola@mail.com", "chidi@mail.com"];
const storeList = ["bola@mail.com", "dayo@mail.com", "ada@mail.com"];

const everyone = new Set([...webList, ...storeList]);
console.log(everyone.size, "emails to send");

const unique = [...everyone];
console.log(unique);
```

Output of `node dedupe.js` and of the browser terminal

```ts
4 emails to send
[ 'ada@mail.com', 'bola@mail.com', 'chidi@mail.com', 'dayo@mail.com' ]
```

One set, and the double send is gone. You will meet this pattern everywhere: unique product ids in a cart, unique visitors to a page, unique tags on a blog.

### Why a set for membership

You could ask "is this email on the list?" with an array too, using `list.includes(email)`. The difference is speed on big collections: `includes` checks the items one by one until it finds a match, so on a list of a million emails it may look at a million items. A `Set` is built so that `has` jumps almost straight to the answer, however large the set. When your program asks the same membership question many times, such as "has this order id already been processed?", use a set.

## Combining sets

With two sets you can ask four natural questions. Take the web list W = {ada, bola, chidi} and the store list S = {ada, bola, dayo}. A **Venn diagram** draws each set as a circle; the overlap holds the elements that are in both:

  The web list W and the store list S. The overlap holds the customers on both lists: Ada and Bola.

| Operation | Symbol | Elements that are… | W and S | Logic | JavaScript |
| --- | --- | --- | --- | --- | --- |
| Union | W ∪ S | in W or in S (or both) | ada, bola, chidi, dayo | OR | `w.union(s)` |
| Intersection | W ∩ S | in both W and S | ada, bola | AND | `w.intersection(s)` |
| Difference | W \ S | in W but not in S | chidi | AND NOT | `w.difference(s)` |
| Symmetric difference | W △ S | in exactly one of them | chidi, dayo | XOR | `w.symmetricDifference(s)` |

The last column but one is the key idea of this lesson. For any element x, "x is in W ∪ S" is exactly "x is in W *or* x is in S". The set operations are boolean logic applied to membership, one element at a time.

operations.js

```ts
const web = new Set(["ada", "bola", "chidi"]);
const store = new Set(["ada", "bola", "dayo"]);

console.log("union:", web.union(store));
console.log("intersection:", web.intersection(store));
console.log("web only:", web.difference(store));
console.log("store only:", store.difference(web));
console.log("exactly one:", web.symmetricDifference(store));
```

Output of `node operations.js` and of the browser terminal

```ts
union: Set(4) { 'ada', 'bola', 'chidi', 'dayo' }
intersection: Set(2) { 'ada', 'bola' }
web only: Set(1) { 'chidi' }
store only: Set(1) { 'dayo' }
exactly one: Set(2) { 'chidi', 'dayo' }
```

Each method returns a *new* set and leaves the original sets unchanged. Notice that difference depends on the order: `web.difference(store)` and `store.difference(web)` are different sets, just as `a && !b` differs from `b && !a`. Union and intersection do not depend on the order.

> Newer than most tutorials
>
> These methods (`union`, `intersection`, `difference`, `symmetricDifference`, `isSubsetOf`, `isSupersetOf`, `isDisjointFrom`) were added to JavaScript in 2024 and are part of the ES2025 standard. They work in Node.js 22 and later and in all current browsers. Older tutorials, and older code you will read, build them by hand with loops, as the next section does.

### Building them by hand

Writing an operation yourself shows that it really is just a loop and a condition. Intersection keeps each element of the first set that the second set also has:

by-hand.js

```ts
function intersect(a, b) {
  const result = new Set();
  for (const x of a) {
    if (b.has(x)) result.add(x);          // AND: in a and in b
  }
  return result;
}

function subtract(a, b) {
  const result = new Set();
  for (const x of a) {
    if (!b.has(x)) result.add(x);         // AND NOT: in a, not in b
  }
  return result;
}

const web = new Set(["ada", "bola", "chidi"]);
const store = new Set(["ada", "bola", "dayo"]);
console.log(intersect(web, store));
console.log(subtract(web, store));
```

Output of `node by-hand.js` and of the browser terminal

```ts
Set(2) { 'ada', 'bola' }
Set(1) { 'chidi' }
```

The only difference between the two functions is one `!`. `for (const x of a)` loops over the elements of a set exactly as it loops over an array.

### Complement: NOT needs a universe

What about NOT? "Everyone who is *not* on the web list" only makes sense if you know who "everyone" is: all customers, all users, all products. That full set is called the **universe**, and "everything in the universe that is not in W" is the **complement** of W. In code, a complement is always a difference from an explicit universe: `allCustomers.difference(web)`. There is no `complement()` method, because a set cannot know what universe you mean.

## Subsets: does one set contain another?

A is a **subset** of B (written A ⊆ B) when every element of A is also in B. Then B is a **superset** of A. Two sets are **disjoint** when they have no element in common.

Subsets are how permission checks work. An action requires some permissions; a user holds some permissions. The user may act when the required set is a subset of the held set:

subset.js

```ts
const held = new Set(["orders:read", "orders:refund", "customers:read"]);
const refundNeeds = new Set(["orders:read", "orders:refund"]);
const deleteNeeds = new Set(["orders:read", "orders:delete"]);

console.log(refundNeeds.isSubsetOf(held));       // every required one is held
console.log(deleteNeeds.isSubsetOf(held));
console.log(held.isSupersetOf(refundNeeds));     // the same question, other way round
console.log(deleteNeeds.difference(held));       // what exactly is missing

const banned = new Set(["orders:delete", "users:delete"]);
console.log(held.isDisjointFrom(banned));        // nothing in common
```

Output of `node subset.js` and of the browser terminal

```ts
true
false
true
Set(1) { 'orders:delete' }
true
```

`difference` turns a plain "no" into a helpful answer: the user is missing `orders:delete`. That is the same move as the guard clauses in [Conditional reasoning](https://zudojs.oyinlola.site/learn/logic-conditions#guards): not just refuse, but say why.

### The empty set is a subset of everything

The **empty set**, written ∅, has no elements. It is a subset of every set: "every element of ∅ is in B" is true because there are no elements to fail the test. This is logically right, and it has a real consequence:

empty.js

```ts
const held = new Set();                 // a brand new user with no permissions
const adminPageNeeds = new Set();        // someone forgot to fill this in

console.log(adminPageNeeds.isSubsetOf(held));
console.log(adminPageNeeds.size);
```

Output of `node empty.js` and of the browser terminal

```ts
true
0
```

A page whose required-permission set is empty is open to *everyone*, including a user with no permissions at all. If the empty set got there by accident, you have a security hole that no test on "users with the right permissions" will catch. The build below refuses empty requirements on purpose.

## Sets and logic are the same thing

You can check the table of operations with the loop technique from [Boolean logic](https://zudojs.oyinlola.site/learn/logic-boolean#truth-tables). For every element of the universe, membership in the union must equal "in W OR in S", and so on:

sets-are-logic.js

```ts
const universe = new Set(["ada", "bola", "chidi", "dayo", "efe"]);
const web = new Set(["ada", "bola", "chidi"]);
const store = new Set(["ada", "bola", "dayo"]);

const union = web.union(store);
const both = web.intersection(store);
const webOnly = web.difference(store);
const exactlyOne = web.symmetricDifference(store);

let allMatch = true;
for (const x of universe) {
  const w = web.has(x);
  const s = store.has(x);
  const ok =
    union.has(x) === (w || s) &&
    both.has(x) === (w && s) &&
    webOnly.has(x) === (w && !s) &&
    exactlyOne.has(x) === (w !== s);
  console.log(x, "web:", w, "store:", s, "matches logic:", ok);
  if (!ok) allMatch = false;
}
console.log("every element matches:", allMatch);
```

Output of `node sets-are-logic.js` and of the browser terminal

```ts
ada web: true store: true matches logic: true
bola web: true store: true matches logic: true
chidi web: true store: false matches logic: true
dayo web: false store: true matches logic: true
efe web: false store: false matches logic: true
every element matches: true
```

Efe is in the universe but on neither list: she is in none of the results, which is the "false, false" row of every truth table. This connection means the laws you already know work on sets too. De Morgan's laws, for example, say that the customers on *neither* list are the complement of the union: `universe.difference(web.union(store))`.

## Traps: what counts as "the same"?

A set drops an element when it is "the same" as one already inside. JavaScript decides sameness almost exactly like `===`. That leads to three traps.

### Text that looks the same but is not

normalise.js

```ts
const signups = ["Ada@Mail.com", "ada@mail.com ", "ada@mail.com"];

console.log(new Set(signups).size);

const normalised = new Set();
for (const email of signups) {
  normalised.add(email.trim().toLowerCase());
}
console.log(normalised);
```

Output of `node normalise.js` and of the browser terminal

```ts
3
Set(1) { 'ada@mail.com' }
```

To a person, all three are Ada. To `===`, a capital letter or a trailing space makes a different string. **Normalise** values before they go into a set: `trim()` removes spaces at both ends and `toLowerCase()` makes every letter small. Deciding what "the same customer" means is a business decision, and the code must apply it before the set sees the data.

### Objects are compared by identity

objects.js

```ts
const orders = new Set();
orders.add({ id: 101, total: 5000 });
orders.add({ id: 101, total: 5000 });
console.log(orders.size);

const orderIds = new Set();
orderIds.add(101);
orderIds.add(101);
console.log(orderIds.size);
```

Output of `node objects.js` and of the browser terminal

```ts
2
1
```

Two objects written the same way are still two different objects, just as two identical-looking houses are two houses. `===` on objects asks "is this the very same object?", and so does a set. To de-duplicate records, put their **ids** (numbers or strings) in the set, not the objects.

### new Set("admin") is not a set of one role

string-trap.js

```ts
const roles = new Set("admin");
console.log(roles);
console.log(roles.has("admin"));

const fixed = new Set(["admin"]);
console.log(fixed.has("admin"));
```

Output of `node string-trap.js` and of the browser terminal

```ts
Set(5) { 'a', 'd', 'm', 'i', 'n' }
false
true
```

`new Set(…)` loops over what you give it. Looping over a string gives its characters, so you get a set of letters; with `"manager"` the repeated `"a"` would even disappear. Always pass an array: `new Set(["admin"])`.

### Two sets are never === each other

Sets are objects, so `new Set([1, 2]) === new Set([1, 2])` is `false`. To ask whether two sets have the same elements, check that each is a subset of the other: `a.isSubsetOf(b) && b.isSubsetOf(a)`.

## Build: role-based permissions

A shop's back office has three roles. Each role grants a set of permissions. A user can have several roles, and holds every permission that any of their roles grants, which is the *union* of their roles' sets.

REASON IT OUT

### Designing the permission check

You are going to write `checkAccess(user, required)`. Before reading the code, think:

- A user has roles ["support", "warehouse"]. How do you get the set of permissions they hold?
- Which set operation answers "may they do this?", and which answers "what are they missing?"
- What should happen if a user has a role name that does not exist, for example a typo like "suport"?
- What should happen if `required` is empty?

**Show the reasoning**

**Held permissions** are the union of the permission sets of each role, built by starting from an empty set and taking the union with each role's set in turn.

**May they?** is `required.isSubsetOf(held)`. **What is missing** is `required.difference(held)`. If the difference is empty, the subset check is true: the two answers always agree, so you can compute the difference once and use its size.

**Unknown roles** should grant nothing, and should be reported, because a typo in a role name silently removing someone's access (or, in a badly written check, crashing the page) is hard to debug. Failing closed means an unknown role adds no permissions.

**Empty requirements** are the trap from the subsets section: the empty set is a subset of everything, so an action with no requirements would be open to all. Most likely someone forgot to fill it in. The safe choice is to refuse and report it.

permissions.js

```ts
const rolePermissions = {
  support: new Set(["orders:read", "customers:read", "orders:refund"]),
  warehouse: new Set(["orders:read", "stock:read", "stock:update"]),
  manager: new Set(["orders:read", "orders:refund", "orders:delete", "reports:read"]),
};

function permissionsOf(user) {
  let held = new Set();
  for (const role of user.roles) {
    const granted = rolePermissions[role];
    if (!granted) {
      console.log(`warning: unknown role "${role}" for ${user.name}`);
      continue;
    }
    held = held.union(granted);
  }
  return held;
}

function checkAccess(user, required) {
  if (required.size === 0) return "refused: action has no permissions configured";
  const missing = required.difference(permissionsOf(user));
  if (missing.size > 0) return `refused: missing ${[...missing].join(", ")}`;
  return "allowed";
}

const amaka = { name: "Amaka", roles: ["support", "warehouse"] };
const tunde = { name: "Tunde", roles: ["suport"] };

console.log(permissionsOf(amaka));
console.log(checkAccess(amaka, new Set(["orders:refund"])));
console.log(checkAccess(amaka, new Set(["orders:delete", "reports:read", "stock:read"])));
console.log(checkAccess(tunde, new Set(["customers:read"])));
console.log(checkAccess(amaka, new Set()));
```

Output of `node permissions.js` and of the browser terminal

```ts
Set(5) {
  'orders:read',
  'customers:read',
  'orders:refund',
  'stock:read',
  'stock:update'
}
allowed
refused: missing orders:delete, reports:read
warning: unknown role "suport" for Tunde
refused: missing customers:read
refused: action has no permissions configured
```

New pieces:

- `rolePermissions[role]` reads a property whose name is in a variable. If there is no such role, it gives `undefined`, which the guard catches.
- `continue` skips the rest of this loop round and moves on to the next role.
- `held = held.union(granted)` replaces `held` with a bigger set each round, which is why `held` is declared with `let`.
- `[...missing].join(", ")` spreads the set into an array and joins its items into one string with commas between.

Amaka's two roles both grant `orders:read`, but it appears once in her permissions: the union removed the duplicate. Her request for three permissions reports only the two she lacks, because `stock:read` is covered by her warehouse role. Tunde's typo gives him nothing and leaves a warning in the log for someone to fix.

> TIP
>
> Real systems, including the ZudoJS permissions package you will meet much later in [Permissions](https://zudojs.oyinlola.site/learn/zudo-permissions), add wildcards (`orders:*`), role hierarchies and conditions on top. Underneath, the question is still this subset check.

## Testing with set identities

Sets obey exact rules, and those rules make good tests: they must hold for *any* two sets, so if one fails, your code has a bug. Two of the most useful:

- **Counting the union:** |A ∪ B| = |A| + |B| − |A ∩ B|. (The bars mean "number of elements".) Adding the two sizes counts the overlap twice, so you subtract it once. You will use this again in [Counting](https://zudojs.oyinlola.site/learn/logic-counting).
- **Splitting a set:** A \ B and A ∩ B never overlap, and together they make up all of A. Every web customer is either also a store customer or web-only, never both, never neither.

identities.js

```ts
function checkIdentities(a, b) {
  const unionOk = a.union(b).size === a.size + b.size - a.intersection(b).size;
  const onlyA = a.difference(b);
  const both = a.intersection(b);
  const splitOk = onlyA.isDisjointFrom(both) && onlyA.union(both).size === a.size;
  return unionOk && splitOk;
}

const web = new Set(["ada", "bola", "chidi"]);
const store = new Set(["ada", "bola", "dayo"]);
const nobody = new Set();

console.log(checkIdentities(web, store));
console.log(checkIdentities(web, nobody));
console.log(checkIdentities(nobody, nobody));
console.log(checkIdentities(web, web));
```

Output of `node identities.js` and of the browser terminal

```ts
true
true
true
true
```

The test tries ordinary sets, an empty set on one side, both empty, and a set with itself. Those are the edge cases for set code, just as zero and the boundary value are the edge cases for numbers.

## Production concerns

- **Sets do not survive JSON.** `JSON.stringify(new Set(["a"]))` gives `"{}"`: the elements vanish. When you send a set over the network or save it, convert it to an array first (`[...set]`) and back into a set when you read it. [Objects and JSON](https://zudojs.oyinlola.site/learn/js-data#json) covers JSON.
- **Normalise at the edge.** Lower-case and trim emails, usernames and tags when they enter the system, so every set and every comparison downstream agrees on what "the same" means.
- **Databases do this too.** A `UNIQUE` constraint makes a database column behave like a set, and SQL has `UNION`, `INTERSECT` and `EXCEPT`. For large data, ask the database rather than loading everything into a JavaScript set. You will see this in [SQL with PostgreSQL](https://zudojs.oyinlola.site/learn/sql-basics).
- **Fail closed on missing configuration.** Unknown roles grant nothing; empty requirement sets are refused. Both are cases where "the maths says yes" and the business says "that was a mistake".

## Practice

TRY IT YOURSELF

### Unsubscribes

The shop from the start has a third list: customers who unsubscribed. Build the final send list: everyone on the web or store list, minus anyone who unsubscribed, with emails normalised. Print the number of emails and the list.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

"On either list, but not unsubscribed" is (W ∪ S) \ U: union first, then difference.

HINT 2

`const sendTo = web.union(store).difference(unsubscribed);`

SOLUTION

send-list.js

```ts
function normalisedSet(list) {
  const result = new Set();
  for (const email of list) result.add(email.trim().toLowerCase());
  return result;
}

const web = normalisedSet(["ada@mail.com", "Bola@Mail.com", "chidi@mail.com"]);
const store = normalisedSet(["bola@mail.com ", "dayo@mail.com", "ada@mail.com"]);
const unsubscribed = normalisedSet(["CHIDI@mail.com"]);

const sendTo = web.union(store).difference(unsubscribed);
console.log(sendTo.size);
console.log([...sendTo]);
```

Output of `node send-list.js` and of the browser terminal

```ts
3
[ 'ada@mail.com', 'bola@mail.com', 'dayo@mail.com' ]
```

"On either list, but not unsubscribed" is (W ∪ S) \ U: union, then difference. Normalising all three lists the same way is what makes Bola appear once and Chidi's unsubscribe take effect despite the capital letters.

TRY IT YOURSELF

### Similar products

Products have tags. Write `similarity(a, b)`: the number of shared tags divided by the number of distinct tags on either product. (It is 1 for identical tag sets and 0 for no overlap. This measure is called the **Jaccard index**.) Compare a rice cooker with a blender and with a novel.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

The ratio is `a.intersection(b).size` divided by `a.union(b).size`.

HINT 2

Guard first: `if (all.size === 0) return 0;` — otherwise dividing 0 by 0 gives `NaN`.

SOLUTION

similar.js

```ts
function similarity(a, b) {
  const all = a.union(b);
  if (all.size === 0) return 0;
  return a.intersection(b).size / all.size;
}

const riceCooker = new Set(["kitchen", "electric", "appliance", "cooking"]);
const blender = new Set(["kitchen", "electric", "appliance", "drinks"]);
const novel = new Set(["book", "fiction"]);

console.log(similarity(riceCooker, blender));
console.log(similarity(riceCooker, novel));
console.log(similarity(new Set(), new Set()));
```

Output of `node similar.js` and of the browser terminal

```ts
0.6
0
0
```

The cooker and blender share 3 tags out of 5 distinct ones: 3 / 5 = 0.6. The guard handles two untagged products, where dividing 0 by 0 would give `NaN`. A shop can use this to suggest "similar products".

TRY IT YOURSELF

### Who needs a follow-up?

Given the sets of customers who opened a promotion email, who clicked it, and who bought, find: (a) customers who clicked but did not buy, (b) customers who bought without clicking (they came some other way), (c) whether everyone who clicked had also opened it.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

"A but not B" is always `A.difference(B)`; the order of the two sets matters.

HINT 2

"Every A is a B" is always `A.isSubsetOf(B)`: here, `clicked.isSubsetOf(opened)`.

SOLUTION

funnel.js

```ts
const opened = new Set(["ada", "bola", "chidi", "dayo", "efe"]);
const clicked = new Set(["ada", "chidi", "dayo"]);
const bought = new Set(["ada", "femi"]);

console.log("clicked, did not buy:", clicked.difference(bought));
console.log("bought without clicking:", bought.difference(clicked));
console.log("every clicker opened:", clicked.isSubsetOf(opened));
```

Output of `node funnel.js` and of the browser terminal

```ts
clicked, did not buy: Set(2) { 'chidi', 'dayo' }
bought without clicking: Set(1) { 'femi' }
every clicker opened: true
```

"A but not B" is always a difference, and "every A is a B" is always a subset check. Chidi and Dayo are the customers worth a reminder. If `isSubsetOf` had returned `false`, the tracking data would be broken, since you cannot click an email you never opened: a subset check is also a cheap data-quality test.

## Recap

- A set holds distinct elements; its main question is membership. `new Set(array)`, `has`, `add`, `delete` and `size` cover everyday use, and `[...new Set(array)]` removes duplicates.
- Union is OR, intersection is AND, difference is AND NOT, symmetric difference is XOR. A complement needs an explicit universe: `universe.difference(set)`.
- A ⊆ B means every element of A is in B. Permission checks are `required.isSubsetOf(held)`, and `required.difference(held)` says what is missing.
- The empty set is a subset of everything, so empty requirements open the door to everyone. Refuse them.
- Sets compare like `===`: normalise text, store ids instead of objects, and pass an array, not a string, to `new Set`.

Next: [Mathematical reasoning](https://zudojs.oyinlola.site/learn/logic-math), where you calculate with the numbers inside your rules: percentages, VAT, interest, and why money is counted in kobo.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
