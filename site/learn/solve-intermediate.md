---
title: "Problem workshop: intermediate — ZudoJS Academy"
description: "Solve eight problems on lists of real data, from duplicate payments to stock levels, reasoning about edge cases and work first, then coding and testing."
source: https://zudojs.oyinlola.site/learn/solve-intermediate
---

LEVEL 1 · LESSON 17 OF 18

Problem-solving fundamentals Foundation

# Problem workshop: intermediate

Solve eight problems on lists of real data, from duplicate payments to stock levels, reasoning about edge cases and work first, then coding and testing.

- **60 min** to read and try
- **You need:** Problem workshop: beginner, and the Logic and mathematical thinking module (especially Sets and Counting)
- **You build:** Tested functions for duplicate detection, sales counts, customer search, order filters, a task board, pagination, a leaderboard and stock levels

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Reason about a problem on a list of records: empty lists, repeated values, ties, first and last items, and inconsistent data
- Count how much work an approach does and pick one that scales, such as a Set instead of nested loops
- Use a lookup table (an object) to count, group and index records
- Solve pagination and ranking problems without off-by-one errors, with ties handled on purpose
- Process a sequence of events in order and reject invalid ones instead of silently corrupting totals

## When the input is a list

A payment company emails you at 9 a.m.: "Our gateway had a hiccup overnight. Some payments were recorded twice. Here are yesterday's 48,000 payment references. Which ones are duplicates?"

In the [beginner workshop](https://zudojs.oyinlola.site/learn/solve-beginner) every problem took a few numbers and returned one answer. Real backend problems almost always take a *list*: orders, payments, customers, tasks, stock movements. Lists bring new edge cases and one new question:

- **New edge cases.** The list is empty. It has one item. The same value appears twice, or three times. Two records tie. The interesting item is the first one, or the last one. Some records are written differently ("ord-1" and "ORD-1 ").
- **How much work?** With three numbers, any approach is instant. With 48,000 references, an approach that compares every reference with every other one makes more than a billion comparisons. You need to *count the steps* of an idea before you trust it.

The method stays the same: understand, inputs, outputs, edge cases, pseudocode, code, tests. Every problem below starts with a **Reason it out** box. Answer its questions on paper before you open the reasoning.

## The JavaScript you need

This workshop uses lists and records. You have seen both briefly; here is everything used below, in one program:

toolkit.js

```ts
const orders = [
  { id: "ORD-1", customer: "Ada", totalKobo: 450000 },
  { id: "ORD-2", customer: "Bola", totalKobo: 1200000 },
];

console.log(orders.length);          // how many items
console.log(orders[0].customer);     // first item (positions start at 0)
console.log(orders[orders.length - 1].id);   // last item

const ids = [];
for (const order of orders) {
  ids.push(order.id);                // add to the end of a list
}
console.log(ids.join(" + "));

const countByCustomer = {};          // an object used as a lookup table
countByCustomer["Ada"] = 1;
console.log(countByCustomer["Ada"], countByCustomer["Chen"]);

const seen = new Set(["ORD-1"]);
console.log(seen.has("ORD-1"), seen.has("ORD-9"));
```

Output of `node toolkit.js` and of the browser terminal

```ts
2
Ada
ORD-2
ORD-1 + ORD-2
1 undefined
true false
```

- An **array** is a list in square brackets. `orders[0]` is the item at position (index) 0, the first one; the last one is at `length - 1`.
- An **object** in braces groups named values into a **record**, like one order. `order.id` reads a value.
- An object can also be a **lookup table**: `table[name]` reads or writes the value stored under any name you choose. A name that was never stored gives `undefined`, JavaScript's "nothing here".
- A `Set` holds each value at most once and answers `has(value)` instantly, as you saw in [Sets](https://zudojs.oyinlola.site/learn/logic-sets).

The tests compare lists and records, and `===` cannot do that: two separate lists are never `===`, even with the same contents. So the `check` helper compares their **JSON** text instead. `JSON.stringify` turns a list or record into text such as `["ORD-1","ORD-2"]`; if the texts match, the contents match. You will meet JSON properly in [Objects and JSON](https://zudojs.oyinlola.site/learn/js-data#json).

check.js

```ts
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  console.log(a === e ? `PASS ${label}` : `FAIL ${label}: got ${a}, expected ${e}`);
}

console.log(["ORD-1"] === ["ORD-1"]);
check("same contents", ["ORD-1"], ["ORD-1"]);
check("different order", ["A", "B"], ["B", "A"]);
```

Output of `node check.js` and of the browser terminal

```ts
false
PASS same contents
FAIL different order: got ["A","B"], expected ["B","A"]
```

Note the last line: order counts. When the order of a result matters to the user, decide it in the reasoning step and test it.

## Problem 1: duplicate payments

Back to the email. Given a list of payment references, return each reference that appears more than once.

REASON IT OUT

### Before you code: duplicates

- What exactly is the output? If `PAY-7` appears three times, how many times is it reported?
- Are `"pay-7"`, `"PAY-7"` and `"PAY-7 "` (with a space) the same payment?
- What are the results for an empty list and a list without duplicates?
- Idea one: compare every reference with every reference after it. How many comparisons is that for 4 references? For 48,000?
- Can you find the duplicates by walking through the list only once?

**Show the reasoning**

**Output:** a list of the duplicated references, each reported once, in the order their second copy was found. `PAY-7` three times is still one problem to investigate.

**Inconsistent writing:** references are typed and copied by people and systems. Decide to treat them as the same after removing spaces at the ends and using capitals. Report the cleaned form.

**Empty list and no duplicates** both return an empty list. Neither is an error.

**Idea one** compares item 1 with items 2, 3, 4 (3 comparisons), item 2 with 3 and 4 (2), item 3 with 4 (1): 6 in total. For *n* items it is n × (n − 1) / 2, as you counted in [Counting](https://zudojs.oyinlola.site/learn/logic-counting). For 48,000 references that is about 1.15 billion comparisons.

**Idea two** walks once and remembers what it has seen in a Set. For each reference: if it is already in `seen`, it is a duplicate; either way, add it to `seen`. A second Set, `reported`, makes sure each duplicate is reported once. That is one step per reference: 48,000 steps.

```ts
START duplicates(refs)
  SET seen TO an empty set, reported TO an empty set, found TO an empty list
  FOR EACH raw IN refs
    SET ref TO raw without end spaces, in capitals
    IF ref IS IN seen AND ref IS NOT IN reported THEN
      add ref to found; add ref to reported
    add ref to seen
  END FOR
  RETURN found
END
```

First, idea one, with a counter that records how many comparisons it makes. `for (let i = 0; i < refs.length; i++)` is a loop that counts `i` through every position; the inner loop starts at `i + 1`, the item after `i`. `found.includes(x)` asks whether a list already contains `x`.

duplicates-slow.js

```ts
let comparisons = 0;

function duplicatesSlow(refs) {
  const found = [];
  for (let i = 0; i < refs.length; i++) {
    for (let j = i + 1; j < refs.length; j++) {
      comparisons = comparisons + 1;
      if (refs[i] === refs[j] && !found.includes(refs[i])) found.push(refs[i]);
    }
  }
  return found;
}

console.log(duplicatesSlow(["PAY-1", "PAY-7", "PAY-2", "PAY-7"]), comparisons);

const many = [];
for (let n = 1; n <= 2000; n++) many.push(`PAY-${n}`);
comparisons = 0;
duplicatesSlow(many);
console.log(`2000 references: ${comparisons} comparisons`);
```

Output of `node duplicates-slow.js` and of the browser terminal

```json
[ 'PAY-7' ] 6
2000 references: 1999000 comparisons
```

Two thousand references already need about two million comparisons, and the count grows with the *square* of the list: ten times more references means a hundred times more work. Now idea two:

duplicates.js

```ts
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  console.log(a === e ? `PASS ${label}` : `FAIL ${label}: got ${a}, expected ${e}`);
}

function duplicates(refs) {
  const seen = new Set();
  const reported = new Set();
  const found = [];
  for (const raw of refs) {
    const ref = raw.trim().toUpperCase();
    if (seen.has(ref) && !reported.has(ref)) {
      found.push(ref);
      reported.add(ref);
    }
    seen.add(ref);
  }
  return found;
}

check("one duplicate", duplicates(["PAY-1", "PAY-7", "PAY-2", "PAY-7"]), ["PAY-7"]);
check("three copies, reported once", duplicates(["PAY-7", "PAY-7", "PAY-7"]), ["PAY-7"]);
check("written differently", duplicates(["pay-3", "PAY-3 "]), ["PAY-3"]);
check("order of discovery", duplicates(["A", "B", "B", "A"]), ["B", "A"]);
check("no duplicates", duplicates(["PAY-1", "PAY-2"]), []);
check("empty list", duplicates([]), []);
```

Output of `node duplicates.js` and of the browser terminal

```ts
PASS one duplicate
PASS three copies, reported once
PASS written differently
PASS order of discovery
PASS no duplicates
PASS empty list
```

This version looks at each reference once, so 48,000 references take 48,000 steps. The trade: it uses extra memory for the `seen` set. Trading a little memory for a lot of time is one of the most common moves in programming, and [Hash maps and sets](https://zudojs.oyinlola.site/learn/dsa-hash-maps), in the algorithms course, explains why `has` is so fast.

## Problem 2: counting sales

A supermarket's till records the name of each product sold, one entry per item. The manager wants to know how many of each product sold today, and which product sold best.

REASON IT OUT

### Before you code: counting

- What is a good shape for "how many of each"? A list, or something else?
- What is the count of a product you have not seen yet, and how do you start counting it?
- Two products sell 5 each and nothing sells more. Which is the best seller?
- What do both answers look like for a day with no sales?

**Show the reasoning**

**Shape:** a lookup table from product name to count, such as `{ Bread: 3, Milk: 2 }`. Finding a product's count is then one step, however many products there are.

**Unseen products:** the table has no entry, so reading it gives `undefined`. Before adding one, start the count at 0. Forgetting this gives `undefined + 1`, which is `NaN`.

**Ties:** picking one of them would hide the other from the manager. Return *all* the products that share the top count, as a list.

**No sales:** the counts are an empty table and the best sellers an empty list.

```ts
START countSales(sales)
  SET counts TO an empty table
  FOR EACH product IN sales
    IF counts has no entry for product THEN SET counts[product] TO 0
    SET counts[product] TO counts[product] + 1
  RETURN counts
END

START bestSellers(counts)
  SET best TO 0, names TO an empty list
  FOR EACH name IN counts
    IF counts[name] > best THEN SET best TO counts[name]; SET names TO [name]
    ELSE IF counts[name] = best THEN add name to names
  RETURN names
END
```

`for (const name in counts)` loops over the *names* (keys) stored in an object, in the order they were first added. (One exception: names that look like whole numbers, such as `"12"`, come first, in number order.)

frequency.js

```ts
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  console.log(a === e ? `PASS ${label}` : `FAIL ${label}: got ${a}, expected ${e}`);
}

function countSales(sales) {
  const counts = {};
  for (const product of sales) {
    if (counts[product] === undefined) counts[product] = 0;
    counts[product] = counts[product] + 1;
  }
  return counts;
}

function bestSellers(counts) {
  let best = 0;
  let names = [];
  for (const name in counts) {
    if (counts[name] > best) {
      best = counts[name];
      names = [name];
    } else if (counts[name] === best) {
      names.push(name);
    }
  }
  return names;
}

const today = ["Bread", "Milk", "Bread", "Eggs", "Milk", "Bread", "Milk"];
console.log(countSales(today));

check("clear winner", bestSellers(countSales(["Bread", "Milk", "Bread"])), ["Bread"]);
check("a tie", bestSellers(countSales(today)), ["Bread", "Milk"]);
check("one sale", bestSellers(countSales(["Eggs"])), ["Eggs"]);
check("no sales: counts", countSales([]), {});
check("no sales: best", bestSellers(countSales([])), []);
```

Output of `node frequency.js` and of the browser terminal

```json
{ Bread: 3, Milk: 3, Eggs: 1 }
PASS clear winner
PASS a tie
PASS one sale
PASS no sales: counts
PASS no sales: best
```

This "count into a table" pattern is everywhere: page views per URL, failed logins per user, orders per status. It is also the heart of the [frequency counter pattern](https://zudojs.oyinlola.site/learn/pattern-frequency) in the algorithms course.

## Problem 3: finding a customer

A support agent types an email address to find a customer's account. Given the list of customers and an email, return that customer's record.

REASON IT OUT

### Before you code: search

- What should the function return when nobody has that email? Is that an error?
- The agent types `" Ada@Example.com"`; the record says `"ada@example.com"`. Match or not?
- Where in the list is the search slowest? Where is it fastest?
- The same list is searched 10,000 times a day. Is there a better plan than walking the list every time?

**Show the reasoning**

**Not found** is a normal answer, not an error: agents mistype all the time. Return `null`, JavaScript's value for "deliberately nothing", and let the caller show "No customer with that email".

**Case and spaces:** email addresses are not case-sensitive in practice, so compare cleaned versions: trimmed and lowercase, on both sides.

**Work:** walk from the start and *stop at the first match*. The fastest case is the first customer (1 step); the slowest is the last customer or no match at all (every customer). This is **linear search**. Test the first, the last and a missing email.

**Many searches:** build a lookup table from email to customer once (n steps), then every search is one step. That table is called an **index**, the same idea a database uses ([How databases work](https://zudojs.oyinlola.site/learn/databases)).

```ts
START findByEmail(customers, email)
  SET wanted TO email, trimmed and lowercased
  FOR EACH customer IN customers
    IF customer.email, trimmed and lowercased, = wanted THEN RETURN customer
  RETURN null
END
```

search.js

```ts
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  console.log(a === e ? `PASS ${label}` : `FAIL ${label}: got ${a}, expected ${e}`);
}

const customers = [
  { id: 1, name: "Ada", email: "ada@example.com" },
  { id: 2, name: "Bola", email: "Bola@Example.com" },
  { id: 3, name: "Chen", email: "chen@example.com" },
];

function clean(email) {
  return email.trim().toLowerCase();
}

function findByEmail(list, email) {
  const wanted = clean(email);
  for (const customer of list) {
    if (clean(customer.email) === wanted) return customer;
  }
  return null;
}

check("first", findByEmail(customers, "ada@example.com").id, 1);
check("last", findByEmail(customers, "chen@example.com").id, 3);
check("messy input", findByEmail(customers, "  BOLA@example.COM").id, 2);
check("not found", findByEmail(customers, "dayo@example.com"), null);
check("empty list", findByEmail([], "ada@example.com"), null);

const byEmail = {};
for (const customer of customers) byEmail[clean(customer.email)] = customer;
console.log(byEmail[clean("Chen@Example.com")].name);
console.log(byEmail[clean("dayo@example.com")] ?? null);
```

Output of `node search.js` and of the browser terminal

```ts
PASS first
PASS last
PASS messy input
PASS not found
PASS empty list
Chen
null
```

`return customer` inside the loop ends the whole function at the first match, so the loop never looks further. The index at the end is built once; after that, each search is one lookup. `?? null` turns the `undefined` of a missing entry into `null`, so both versions answer "not found" the same way.

> WATCH OUT
>
> The first test reads `.id` of the result. If the search returned `null`, reading `.id` would crash the test with a TypeError instead of printing FAIL. Crashing is still a failure you would notice, but in the JavaScript course you will learn to guard against it.

## Problem 4: filtering orders

The finance team asks for every *paid* order of at least ₦10,000 placed between 1 and 15 September 2026, both days included.

REASON IT OUT

### Before you code: filters

- Should the function change the original list of orders, or produce a new one?
- Which orders sit exactly on a boundary? List one for each rule.
- Dates are stored as text like `"2026-09-03"`. Can you compare two such texts with `<` and get the right answer? What about `"2026-9-3"`?
- What if no order matches?

**Show the reasoning**

**A new list.** Other code is still using the original orders; removing items from it would be a nasty surprise. Filtering means building a new list with the items that pass every rule.

**Boundaries:** an order of exactly ₦10,000 (included: "at least"), one of ₦9,999.99 (excluded); an order on 1 September and one on 15 September (both included: "both days included"), and one each on 31 August and 16 September (excluded).

**Dates as text:** text compares character by character, left to right. `"2026-09-03" < "2026-09-15"` is true because at the first difference "0" comes before "1". This works only because every date has the same shape: four-digit year, two-digit month, two-digit day. `"2026-9-3"` would compare as larger than `"2026-09-15"` (at the sixth character, "9" is after "0"). Decide that dates must use the fixed `YYYY-MM-DD` form, which is the international standard (ISO 8601) form.

**No match:** an empty list, which is a perfectly good answer.

```ts
START paidOrdersBetween(orders, from, to, minKobo)
  SET result TO an empty list
  FOR EACH order IN orders
    IF order.status = "paid" AND order.totalKobo >= minKobo
       AND order.date >= from AND order.date <= to THEN add order to result
  RETURN result
END
```

filter.js

```ts
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  console.log(a === e ? `PASS ${label}` : `FAIL ${label}: got ${a}, expected ${e}`);
}

const orders = [
  { id: "A", status: "paid", totalKobo: 1000000, date: "2026-09-01" },
  { id: "B", status: "paid", totalKobo: 999999, date: "2026-09-05" },
  { id: "C", status: "pending", totalKobo: 5000000, date: "2026-09-05" },
  { id: "D", status: "paid", totalKobo: 2500000, date: "2026-09-15" },
  { id: "E", status: "paid", totalKobo: 2500000, date: "2026-09-16" },
  { id: "F", status: "paid", totalKobo: 2500000, date: "2026-08-31" },
];

function paidOrdersBetween(list, from, to, minKobo) {
  const result = [];
  for (const order of list) {
    const inRange = order.date >= from && order.date <= to;
    if (order.status === "paid" && order.totalKobo >= minKobo && inRange) {
      result.push(order.id);
    }
  }
  return result;
}

check("September 1-15", paidOrdersBetween(orders, "2026-09-01", "2026-09-15", 1000000), ["A", "D"]);
check("nothing matches", paidOrdersBetween(orders, "2026-10-01", "2026-10-31", 1000000), []);
check("original untouched", orders.length, 6);
console.log("2026-09-03" < "2026-09-15", "2026-9-3" < "2026-09-15");
```

Output of `node filter.js` and of the browser terminal

```ts
PASS September 1-15
PASS nothing matches
PASS original untouched
true false
```

Each order in the test data was written for one rule: A and D sit on the date boundaries and are included, B is 1 kobo short, C is not paid, E and F are one day outside the range. When a filter test fails, the id tells you at once which rule is broken. The last line shows the date trap: the badly formatted date compares wrong.

The function returns only the ids to keep the tests short. In a real program it would return the order records. The JavaScript course shows the shorter built-in way to write this: `orders.filter(…)` ([Arrays](https://zudojs.oyinlola.site/learn/js-arrays#transform)).

## Problem 5: grouping tasks into a board

A task app shows a board with three columns: To do, Doing and Done. Given a list of tasks, each with a title and a status, build the columns.

REASON IT OUT

### Before you code: grouping

- What is the output shape?
- There are no "Doing" tasks today. Should the board still have a Doing column?
- One task has the status `"blocked"`, which the board does not know. What happens to it?
- Inside a column, in what order do the tasks appear?

**Show the reasoning**

**Shape:** a lookup table from status to a list of titles: `{ todo: [...], doing: [...], done: [...] }`.

**Empty columns:** yes. The screen always shows three columns, so start with all three lists, empty, before looking at any task. Grouping only by the statuses that happen to appear would make the Doing column vanish on quiet days.

**Unknown status:** never drop data silently. A task that disappears from the board is worse than a strange column. Put it in an `other` group, so someone notices and fixes the data.

**Order:** keep the order of the input list, so tasks do not jump around on the screen.

```ts
START board(tasks)
  SET columns TO { todo: [], doing: [], done: [], other: [] }
  FOR EACH task IN tasks
    IF columns has a list for task.status THEN add task.title to it
    ELSE add task.title to columns.other
  RETURN columns
END
```

group.js

```ts
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  console.log(a === e ? `PASS ${label}` : `FAIL ${label}: got ${a}, expected ${e}`);
}

function board(tasks) {
  const columns = { todo: [], doing: [], done: [], other: [] };
  for (const task of tasks) {
    if (task.status !== "other" && columns[task.status] !== undefined) {
      columns[task.status].push(task.title);
    } else {
      columns.other.push(`${task.title} (${task.status})`);
    }
  }
  return columns;
}

const tasks = [
  { title: "Buy printer ink", status: "todo" },
  { title: "Send invoices", status: "done" },
  { title: "Call supplier", status: "todo" },
  { title: "Fix the website", status: "blocked" },
];

console.log(board(tasks));
check("empty column still there", board(tasks).doing, []);
check("order kept", board(tasks).todo, ["Buy printer ink", "Call supplier"]);
check("unknown status kept", board(tasks).other, ["Fix the website (blocked)"]);
check("no tasks", board([]), { todo: [], doing: [], done: [], other: [] });
```

Output of `node group.js` and of the browser terminal

```json
{
  todo: [ 'Buy printer ink', 'Call supplier' ],
  doing: [],
  done: [ 'Send invoices' ],
  other: [ 'Fix the website (blocked)' ]
}
PASS empty column still there
PASS order kept
PASS unknown status kept
PASS no tasks
```

One extra check hides in the code: `task.status !== "other"`. Without it, a task whose status really is `"other"` would land in the other column *without* its status label, and look different from every other unknown task. Asking "what if the input uses one of my own internal names?" is a good habit whenever user data becomes a key in your table.

## Problem 6: pagination

A shop has hundreds of products, and the website shows 20 per page with "Previous" and "Next" buttons. Given the full list, a page number and a page size, return the products for that page and the total number of pages.

REASON IT OUT

### Before you code: pages

- Do pages start at 0 or at 1? Which products are on page 1, page 2, page *p*?
- 45 products, 20 per page: how many pages, and how many products on the last one?
- What happens for page 0, page −1, page 4 of 3, and a page size of 0?
- What should an empty shop return?

**Show the reasoning**

**People count pages from 1,** but list positions start at 0. Page 1 is positions 0 to 19, page 2 is 20 to 39, page *p* starts at (p − 1) × size. Mixing the two counting systems up is the classic **off-by-one error**, where a result is wrong by exactly one step: the first page silently skips 20 products, or two pages share one.

**Total pages:** 45 / 20 = 2.25, and a partial page is still a page, so round *up*: 3 pages, the last with 5 products. `Math.ceil` rounds up.

**Bad page numbers** (0, negative, not whole) and a page size that is not a positive whole number are caller mistakes: return `"invalid"`. **Page 4 of 3** is different: it can happen honestly (a product was deleted while someone was browsing). Return an empty page and the real total, so the website can say "no more products".

**Empty shop:** 0 pages and an empty page 1.

```ts
START paginate(items, page, size)
  IF page or size is not a whole number, or page < 1, or size < 1 THEN RETURN "invalid"
  SET start TO (page − 1) × size
  SET pageItems TO the items from position start up to (not including) start + size
  RETURN pageItems and totalPages = round up (length of items ÷ size)
END
```

`list.slice(start, end)` returns a new list with the items from position `start` up to, but not including, `end`. If `end` is past the end of the list, it simply stops at the end, so the last partial page needs no special code.

paginate.js

```ts
function paginate(items, page, size) {
  if (!Number.isInteger(page) || !Number.isInteger(size)) return "invalid";
  if (page < 1 || size < 1) return "invalid";
  const start = (page - 1) * size;
  return {
    items: items.slice(start, start + size),
    totalPages: Math.ceil(items.length / size),
  };
}

function show(result) {
  if (result === "invalid") return "invalid";
  return `[${result.items.join(",")}] of ${result.totalPages} pages`;
}

const products = [];
for (let n = 1; n <= 45; n++) products.push(n);

console.log(show(paginate(products, 1, 20)));
console.log(show(paginate(products, 3, 20)));   // the partial last page
console.log(show(paginate(products, 4, 20)));   // past the end
console.log(show(paginate(products, 0, 20)));
console.log(show(paginate(products, 1, 0)));
console.log(show(paginate([], 1, 20)));
console.log(show(paginate(["Rice", "Beans"], 1, 2)));   // exactly one full page
```

Output of `node paginate.js` and of the browser terminal

```json
[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20] of 3 pages
[41,42,43,44,45] of 3 pages
[] of 3 pages
invalid
invalid
[] of 0 pages
[Rice,Beans] of 1 pages
```

The products are the numbers 1 to 45, so you can see at a glance which positions each page took: page 1 is 1–20 and the last page is 41–45, with nothing skipped or repeated. Using data where each item shows its own position is a handy testing trick for any off-by-one problem. (The "1 pages" in the last line is a wording bug you could fix for the screen; the number is right.)

## Problem 7: a sales leaderboard

A company shows a weekly leaderboard of its sales agents, highest sales first, with a rank number next to each name.

REASON IT OUT

### Before you code: ranking

- Two agents sold exactly the same amount. What ranks do they get, and what rank does the next agent get?
- In what order are tied agents listed? Does it matter?
- Sorting rearranges a list. Whose list gets rearranged?
- What about an empty team, or a team of one?

**Show the reasoning**

**Ties share a rank,** and the next rank skips: sales of 900, 700, 700, 500 give ranks 1, 2, 2, 4. This is "competition ranking", the kind used in sport: the fourth agent had three people ahead of them. (Another choice is 1, 2, 2, 3; either is fine if you decide and test it.)

**Tied agents** need a second rule, or they may appear in a different order each week and people will complain. Here: alphabetical by name.

**Sort a copy.** The list of agents belongs to the caller; rearranging it in place could break other code that relies on its order. Sort a copy.

**Rank rule:** walking the sorted list, an agent whose sales equal the previous agent's takes the previous rank; otherwise their rank is their position + 1.

```ts
START leaderboard(agents)
  SET sorted TO a copy of agents, by sales (highest first), then by name
  FOR EACH position i IN sorted
    IF i > 0 AND sorted[i].sales = sorted[i − 1].sales THEN rank stays the same
    ELSE SET rank TO i + 1
    add "rank. name sales" to the result
  RETURN result
END
```

`list.toSorted(compare)` returns a sorted *copy* and leaves the original alone. The `compare` function is given two agents and returns a negative number if the first should come first, a positive number if the second should, and 0 if they are equal. [Arrays](https://zudojs.oyinlola.site/learn/js-arrays#sort) explains it fully.

ranking.js

```ts
function compareAgents(a, b) {
  if (a.sales !== b.sales) return b.sales - a.sales;   // higher sales first
  if (a.name < b.name) return -1;                      // then by name
  if (a.name > b.name) return 1;
  return 0;
}

function leaderboard(agents) {
  const sorted = agents.toSorted(compareAgents);
  const lines = [];
  let rank = 0;
  for (let i = 0; i < sorted.length; i++) {
    const tied = i > 0 && sorted[i].sales === sorted[i - 1].sales;
    if (!tied) rank = i + 1;
    lines.push(`${rank}. ${sorted[i].name} ₦${sorted[i].sales}`);
  }
  return lines;
}

const team = [
  { name: "Tunde", sales: 700000 },
  { name: "Amaka", sales: 900000 },
  { name: "Zainab", sales: 500000 },
  { name: "Emeka", sales: 700000 },
];

console.log(leaderboard(team).join("\n"));
console.log(team[0].name);                  // the original order is untouched
console.log(leaderboard([]).length, leaderboard([{ name: "Solo", sales: 1 }]));
```

Output of `node ranking.js` and of the browser terminal

```ts
1. Amaka ₦900000
2. Emeka ₦700000
2. Tunde ₦700000
4. Zainab ₦500000
Tunde
0 [ '1. Solo ₦1' ]
```

Emeka and Tunde share rank 2 and appear in alphabetical order; Zainab is 4th. `"\n"` inside text is a line break, so `join("\n")` prints one agent per line.

## Problem 8: stock levels

A warehouse starts the day with some stock of each product. During the day it records movements: deliveries in, and sales out. At the end of the day the manager wants the stock level of every product, and a list of any movements that could not be applied.

REASON IT OUT

### Before you code: inventory

- A sale of 8 bags of rice arrives when there are only 5. What should happen?
- Does the order of the movements matter?
- What about a movement for a product the warehouse does not stock, or a quantity of 0 or −3?
- Should the function change the starting stock it was given?

**Show the reasoning**

**Selling more than you have** would make the stock negative, which is impossible for real bags of rice. The movement is *rejected*: stock stays as it was, and the movement goes on the rejected list with a reason, so a person can look into it. Silently skipping it, or letting the stock go to −3, would both hide a real problem.

**Order matters.** With 5 bags, "sell 8, then receive 10" rejects the sale, but "receive 10, then sell 8" accepts it. So movements must be processed in the order they happened, and the test must check both orders.

**Unknown products and bad quantities** are rejected with their own reasons. A quantity must be a positive whole number; a delivery of −3 is not a delivery.

**Do not change the input.** Copy the starting stock into a new table and update the copy. The starting figures may be needed again, for example for a report that compares the start and end of the day.

```ts
START endOfDay(start, movements)
  SET stock TO a copy of start; SET rejected TO an empty list
  FOR EACH m IN movements, in order
    IF stock has no entry for m.product THEN reject m ("unknown product"); continue
    IF m.quantity is not a positive whole number THEN reject m ("bad quantity"); continue
    IF m.type = "in" THEN add m.quantity to stock[m.product]
    ELSE IF m.quantity > stock[m.product] THEN reject m ("not enough stock")
    ELSE subtract m.quantity from stock[m.product]
  RETURN stock and rejected
END
```

`continue` skips the rest of the loop body and moves straight on to the next movement: it is the guard clause of a loop.

inventory.js

```ts
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  console.log(a === e ? `PASS ${label}` : `FAIL ${label}: got ${a}, expected ${e}`);
}

function endOfDay(start, movements) {
  const stock = {};
  for (const product in start) stock[product] = start[product];
  const rejected = [];

  for (const m of movements) {
    const label = `${m.type} ${m.quantity} ${m.product}`;
    if (stock[m.product] === undefined) {
      rejected.push(`${label}: unknown product`);
      continue;
    }
    if (!Number.isInteger(m.quantity) || m.quantity <= 0) {
      rejected.push(`${label}: bad quantity`);
      continue;
    }
    if (m.type === "in") {
      stock[m.product] = stock[m.product] + m.quantity;
    } else if (m.quantity > stock[m.product]) {
      rejected.push(`${label}: not enough stock`);
    } else {
      stock[m.product] = stock[m.product] - m.quantity;
    }
  }
  return { stock, rejected };
}

const start = { rice: 5, beans: 12 };

const day = endOfDay(start, [
  { type: "out", product: "rice", quantity: 8 },
  { type: "in", product: "rice", quantity: 10 },
  { type: "out", product: "rice", quantity: 8 },
  { type: "out", product: "beans", quantity: 12 },
  { type: "in", product: "garri", quantity: 4 },
  { type: "in", product: "beans", quantity: -3 },
]);

console.log(day.stock);
console.log(day.rejected.join("\n"));
check("start untouched", start, { rice: 5, beans: 12 });
check("order matters", endOfDay(start, [
  { type: "in", product: "rice", quantity: 10 },
  { type: "out", product: "rice", quantity: 8 },
]).stock.rice, 7);
check("no movements", endOfDay(start, []).stock, { rice: 5, beans: 12 });
```

Output of `node inventory.js` and of the browser terminal

```json
{ rice: 7, beans: 0 }
out 8 rice: not enough stock
in 4 garri: unknown product
in -3 beans: bad quantity
PASS start untouched
PASS order matters
PASS no movements
```

Follow the rice by hand: 5, the sale of 8 is rejected, +10 makes 15, −8 makes 7. Beans: all 12 sold, exactly the stock (allowed: `>`, not `>=`), leaving 0. Every rejected movement says what it was and why, which is what the manager needs to investigate. The same shape, "apply events in order, reject the invalid ones with a reason", runs bank ledgers, booking systems and the [transactions](https://zudojs.oyinlola.site/learn/zudo-transactions) you meet later in the course.

## Patterns you now own

| Pattern | Problems | The key idea |
| --- | --- | --- |
| Remember what you have seen | Duplicates | A Set turns "compare with everything" into one check per item. |
| Count into a table | Sales counts | Start unseen keys at 0; return all ties. |
| Walk and stop early / build an index | Customer search | "Not found" is a normal answer; index when you search often. |
| Build a new list | Filtering | Never change the input; one test item per rule and boundary. |
| Group into a table of lists | Task board | Create the known groups first; never drop unknown data. |
| Index arithmetic | Pagination | Pages count from 1, positions from 0; round the page count up. |
| Sort a copy, then walk | Leaderboard | Decide the tie rule and the tie-break order. |
| Apply events in order | Stock levels | Reject invalid events with a reason; copy the starting state. |

And one question to ask about every idea before you code it: **how many steps does this take for a list of 10 items, and for a list of 100,000?** [Big O and complexity](https://zudojs.oyinlola.site/learn/dsa-complexity), the first lesson of the algorithms course, gives that question a precise language.

## Practice

TRY IT YOURSELF

### The second-highest price

A shop wants to show "our second most expensive item". Given a list of prices in kobo, return the second-highest *distinct* price, or `null` if there is none. Reason first: what are the answers for `[500, 900, 900]`, `[700]` and `[]`?

**Show a solution**

Reasoning: "distinct" means that two items at the top price do not count as first and second. `[500, 900, 900]` gives 500. A single item or an empty list has no second price: `null`. Keep two "best so far" values in one pass: the highest and the second highest, and update both when a new highest appears.

second-highest.js

```ts
function secondHighest(prices) {
  let first = null;
  let second = null;
  for (const p of prices) {
    if (first === null || p > first) {
      second = first;
      first = p;
    } else if (p < first && (second === null || p > second)) {
      second = p;
    }
  }
  return second;
}

console.log(secondHighest([300, 900, 500, 700]));
console.log(secondHighest([500, 900, 900]));
console.log(secondHighest([700]), secondHighest([]), secondHighest([400, 400]));
```

Output of `node second-highest.js` and of the browser terminal

```ts
700
500
null null null
```

The condition `p < first` is what skips the second 900. Without it, `[500, 900, 900]` would answer 900.

TRY IT YOURSELF

### Most common first letter

A school wants to know which first letter is most common among its students' names, to plan name tags. Count the first letters (ignoring case) of `["Ada", "amaka", "Bola", "Chen", "bayo", "Abdul"]` and print the table.

**Show a solution**

letters.js

```ts
function countFirstLetters(names) {
  const counts = {};
  for (const name of names) {
    if (name.length === 0) continue;
    const letter = name[0].toUpperCase();
    if (counts[letter] === undefined) counts[letter] = 0;
    counts[letter] = counts[letter] + 1;
  }
  return counts;
}

console.log(countFirstLetters(["Ada", "amaka", "Bola", "Chen", "bayo", "Abdul"]));
console.log(countFirstLetters(["", "Eze"]));
```

Output of `node letters.js` and of the browser terminal

```json
{ A: 3, B: 2, C: 1 }
{ E: 1 }
```

The same "count into a table" pattern, with one extra edge case: an empty name has no first letter, so it is skipped instead of crashing on `name[0].toUpperCase()`.

TRY IT YOURSELF

### Bookings that overlap

A meeting room has bookings with start and end hours, such as `{ who: "Ada", start: 9, end: 11 }`. A booking that ends at 11 and one that starts at 11 do not clash. Write `clashes(bookings)` that lists every pair that overlaps. Reason about the boundary before you code.

**Show a solution**

Two bookings overlap when each one starts before the other ends: `a.start < b.end && b.start < a.end`. Using `<` (not `<=`) makes back-to-back bookings legal. Every pair must be compared, so this is the nested-loop shape from problem 1, which is fine for the few bookings one room has in a day.

clashes.js

```ts
function clashes(bookings) {
  const found = [];
  for (let i = 0; i < bookings.length; i++) {
    for (let j = i + 1; j < bookings.length; j++) {
      const a = bookings[i];
      const b = bookings[j];
      if (a.start < b.end && b.start < a.end) found.push(`${a.who} and ${b.who}`);
    }
  }
  return found;
}

console.log(clashes([
  { who: "Ada", start: 9, end: 11 },
  { who: "Bola", start: 11, end: 12 },
  { who: "Chen", start: 10, end: 13 },
]));
console.log(clashes([]));
```

Output of `node clashes.js` and of the browser terminal

```json
[ 'Ada and Chen', 'Bola and Chen' ]
[]
```

Ada (9–11) and Bola (11–12) touch but do not overlap. Chen (10–13) overlaps both.

## Recap

- Lists bring their own edge cases: empty, one item, repeats, ties, the first and the last item, and inconsistently written data.
- Count the steps of an idea. Comparing every item with every other item grows with the square of the list; remembering what you have seen in a Set is one step per item.
- Objects as lookup tables count, group and index records. Start unseen keys at a known value.
- Pages count from 1 and positions from 0: write the formula down and test the first, last and partial pages.
- Decide tie rules and sort order explicitly. Sort and filter into new lists; never change the caller's data.
- When applying events in order, reject invalid ones with a reason instead of letting totals go wrong.

Next, [Why doesn't this work?](https://zudojs.oyinlola.site/learn/solve-broken) hands you algorithms that are already written and already wrong, and you find the bugs by reasoning and tracing.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
