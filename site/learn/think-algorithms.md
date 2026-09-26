---
title: "Algorithms — ZudoJS Academy"
description: "Learn what makes a method an algorithm, the three shapes every algorithm is built from, and everyday searching, counting, filtering and sorting."
source: https://zudojs.oyinlola.site/learn/think-algorithms
---

LEVEL 1 · LESSON 7 OF 18

Think like a programmer Foundation

# Algorithms

Learn what makes a method an algorithm, the three shapes every algorithm is built from, and everyday searching, counting, filtering and sorting.

- **45 min** to read and try
- **You need:** What programming is and Breaking problems down
- **You build:** A small toolkit of everyday algorithms, run on a pharmacy's sales and stock lists

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Check whether a method is an algorithm using its five properties
- Recognise sequence, decision and repetition in any algorithm
- Describe searching, counting, filtering, transforming and sorting in everyday terms
- Write simple JavaScript loops that search, count, total, filter and transform a list
- Test an algorithm with empty, single, first, last and missing cases

## A shoebox of receipts

Mrs Adeyemi runs a pharmacy. Every sale ends up as a paper receipt in a shoebox. Today she needs three things from that box:

- A customer, Mr Okafor, wants a refund. She must find *his* receipt.
- Her supplier gives a bonus for every sale above ₦10,000. She must count how many there were.
- Her accountant wants the receipts in order of amount, smallest first.

You already know how to do all three. You would look through the receipts one by one for Mr Okafor's name. You would go through them making a tally mark for every big sale. You would make a pile and keep putting each receipt in its place. Each of these is a **method**, and each works for any shoebox, whether it has 5 receipts or 500.

A method like that, written down so exactly that anyone, or any computer, gets the same result by following it, is an **algorithm**. You met the word in [What programming is](https://zudojs.oyinlola.site/learn/think-programming#algorithms). This lesson looks inside: what makes a method an algorithm, what they are built from, and the five everyday algorithms that most programs are made of.

## What makes a method an algorithm

An algorithm is a finite sequence of precise steps that turns an input into an output. Computer scientists usually list five properties. A method must have all five:

| Property | Meaning | A step that breaks it |
| --- | --- | --- |
| Input | It works on some data given to it (possibly none). | (Rarely broken; the input may be empty.) |
| Output | It produces at least one result. | "Look through the receipts." And then what? Nothing is reported. |
| Precise | Every step has exactly one meaning. | "Count the big sales." How big is big? |
| Finite | It always stops after a limited number of steps. | "Keep checking the box until the receipt appears." If it is not there, you check forever. |
| Effective | Every step can actually be done, with the tools available. | "Find the receipt the customer is thinking of." |

Here is Mrs Adeyemi's search, written so that it has all five:

```ts
Input:  the receipts, and a customer name
Output: the matching receipt, or "not found"

1. Take the first receipt.
2. If its name is the customer name, report this receipt. Stop.
3. If there are no more receipts, report "not found". Stop.
4. Take the next receipt and go back to step 2.
```

It is precise: "its name is the customer name" can only mean one thing. It is finite: each round uses up one receipt, and there are only so many, so step 3 must eventually happen. And it has an output in *both* cases, found and not found. The most common way to break the "finite" and "output" properties is to forget the case where the thing you want is not there.

REASON IT OUT

### Is this an algorithm?

A shop assistant is given these instructions for restocking. Check them against the five properties before reading on. Which properties does each step break, and how would you fix it?

```ts
1. Look at each shelf.
2. If a shelf is nearly empty, get more from the store room.
3. Keep going until the shop looks full.
```

**Show the reasoning**

- **Precise:** "nearly empty" means different things to different people. Fix: "if a shelf has fewer than 5 items".
- **Precise again:** "get more": how many? Fix: "bring enough to make 20".
- **Finite:** "until the shop looks full" may never happen, for example if the store room runs out. Fix: go through each shelf once, from the first to the last, then stop.
- **Output:** nothing is reported. If the store room ran out of something, the owner never finds out. Fix: "write down every item you could not restock".

A fixed version: "For each shelf, from the first to the last: if it has fewer than 5 items, bring items from the store room until it has 20, or until the store room has none left; if the store room ran out, write the item on the reorder list. When you have done the last shelf, give the reorder list to the owner." Every step now has one meaning, it stops, and it produces something.

## Three shapes: sequence, decision, repetition

Every algorithm, however large, is built from only three shapes of step. You have already used all three.

### Sequence: one step after another

A **sequential** algorithm does its steps in order, each one once. Adding 7.5% VAT to a price is a sequence:

sequence.js

```ts
const price = 20000;
const vat = price * 7.5 / 100;
const total = price + vat;
console.log("VAT: ₦" + vat);
console.log("Total: ₦" + total);
```

Output of `node sequence.js` and of the browser terminal

```ts
VAT: ₦1500
Total: ₦21500
```

### Decision: choose between paths

A **conditional** algorithm picks which steps to run based on a condition. In JavaScript that is `if` and `else`. Here, medicines carry no VAT, while the pharmacy's other goods, such as soap and cosmetics, pay 7.5%:

decision.js

```ts
const price = 20000;
const isMedicine = true;

let vat = 0;
if (isMedicine) {
  vat = 0;
} else {
  vat = price * 7.5 / 100;
}
console.log("To pay: ₦" + (price + vat));
```

Output of `node decision.js` and of the browser terminal

```ts
To pay: ₦20000
```

### Repetition: do it again

A **repetitive** algorithm repeats some steps, either a set number of times or until a condition changes. In JavaScript that is a loop. Most useful algorithms repeat, because they work through a **list**: values between square brackets, separated by commas. `for (const price of prices)` runs the block once for each value in the list `prices`, with `price` set to that value.

repetition.js

```ts
const prices = [2500, 800, 12000];

for (const price of prices) {
  console.log("Item: ₦" + price);
}
console.log("Items in the list:", prices.length);
```

Output of `node repetition.js` and of the browser terminal

```ts
Item: ₦2500
Item: ₦800
Item: ₦12000
Items in the list: 3
```

`prices.length` is the number of items in the list. The loop does not need to know it: it simply goes through the list from the first item to the last, however many there are.

That is the whole toolbox. Sequence, decision and repetition, combined and nested inside each other, are enough to write any algorithm there is. The rest of this lesson combines them into the five algorithms you will use most.

## Searching

**Everyday version:** finding Mr Okafor's receipt; finding your name on an exam results list; finding a contact in your phone.

**The algorithm:** look at each item in turn. If it is the one you want, you are done. If you reach the end without finding it, it is not there. This is called **linear search**, because it goes along the list in a line.

search.js

```ts
const customers = ["Bello", "Eze", "Okafor", "Musa", "Adeyemi"];
const wanted = "Okafor";

let found = false;
let position = 0;
for (const name of customers) {
  position = position + 1;
  if (name === wanted) {
    found = true;
    break;
  }
}

if (found) {
  console.log(wanted, "is receipt number", position);
} else {
  console.log(wanted, "not found");
}
```

Output of `node search.js` and of the browser terminal

```ts
Okafor is receipt number 3
```

- `found` starts as `false` and becomes `true` only when the name matches. After the loop, it tells you which case happened.
- `position` counts how many receipts have been looked at, so it is the position of the match.
- `break` stops the loop straight away. Once Mr Okafor's receipt is found, there is no point looking at the other two.

Now search for someone who is not there. The algorithm must still finish and still give an answer:

search-missing.js

```ts
const customers = ["Bello", "Eze", "Okafor", "Musa", "Adeyemi"];
const wanted = "Nwosu";

let found = false;
let looked = 0;
for (const name of customers) {
  looked = looked + 1;
  if (name === wanted) {
    found = true;
    break;
  }
}

console.log("Found:", found, "after looking at", looked, "receipts");
```

Output of `node search-missing.js` and of the browser terminal

```ts
Found: false after looking at 5 receipts
```

To be sure something is *not* there, linear search has to look at every item. With 5 receipts that is nothing. With 5 million records it is slow. When you look up a word in a dictionary you do not start at "A": because the words are *sorted*, you open the middle and jump towards the word. That faster method, binary search, only works on sorted data. It has its own lesson in the [algorithms course](https://zudojs.oyinlola.site/learn/dsa-searching).

## Counting, totalling and the best so far

**Everyday version:** tally marks for every sale above ₦10,000; adding up the day's takings; finding the biggest sale of the day.

All three use the same idea: keep a running value, start it at the right place, and update it as you go through the list. That running value is called an **accumulator**.

### Counting

count.js

```ts
const sales = [4500, 12000, 800, 15500, 10000, 23000];

let bigSales = 0;
for (const amount of sales) {
  if (amount > 10000) {
    bigSales = bigSales + 1;
  }
}
console.log("Sales above ₦10,000:", bigSales);
```

Output of `node count.js` and of the browser terminal

```ts
Sales above ₦10,000: 3
```

Did you expect 3 or 4? The sale of exactly ₦10,000 is not *above* ₦10,000. Whether it should count is a question for the supplier, not for the code. The algorithm is only as precise as the rule it was given.

### Totalling

total.js

```ts
const sales = [4500, 12000, 800, 15500, 10000, 23000];

let takings = 0;
for (const amount of sales) {
  takings = takings + amount;
}
console.log("Takings today: ₦" + takings);
console.log("Average sale: ₦" + takings / sales.length);
```

Output of `node total.js` and of the browser terminal

```ts
Takings today: ₦65800
Average sale: ₦10966.666666666666
```

Counting adds 1 for each match; totalling adds the value itself. The average is the total divided by how many there are. That long decimal is real: money needs rounding, which [Mathematical reasoning](https://zudojs.oyinlola.site/learn/logic-math) covers properly.

### The best so far

To find the biggest sale, walk through the list remembering the biggest one you have seen so far. Whenever you see a bigger one, it becomes the new "biggest so far". At the end, the biggest so far is the biggest.

biggest.js

```ts
const sales = [4500, 12000, 800, 15500, 10000, 23000];

let biggest = sales[0];
for (const amount of sales) {
  if (amount > biggest) {
    biggest = amount;
  }
}
console.log("Biggest sale: ₦" + biggest);
```

Output of `node biggest.js` and of the browser terminal

```ts
Biggest sale: ₦23000
```

`sales[0]` is the first item of the list. Items are numbered from 0, so `sales[1]` is the second. Starting with the first real sale, rather than with 0, matters; the [failure section](#failure) shows why.

## Filtering

**Everyday version:** picking out the unpaid invoices; making a list of students who passed; finding the medicines that are nearly out of stock.

**The algorithm:** go through every item; keep the ones that match a rule; ignore the rest. The result is a new, shorter list. The original list is not changed.

The pharmacy has two lists that go together: the name of each medicine, and how many are in stock, in the same order. To reorder, it needs every medicine with 5 or fewer left. `stock[i]` means "the item at position `i` of the list", and `lowStock.push(…)` adds an item to the end of the list `lowStock`.

filter.js

```ts
const medicines = ["Paracetamol", "Vitamin C", "Cough syrup", "Plasters", "ORS"];
const stock = [40, 3, 12, 5, 0];

const lowStock = [];
for (let i = 0; i < medicines.length; i++) {
  if (stock[i] <= 5) {
    lowStock.push(medicines[i]);
  }
}
console.log("Reorder:", lowStock);
console.log("Still", medicines.length, "medicines in the full list");
```

Output of `node filter.js` and of the browser terminal

```ts
Reorder: [ 'Vitamin C', 'Plasters', 'ORS' ]
Still 5 medicines in the full list
```

- This loop counts positions instead of going through values: `i` starts at 0 and goes up by 1 while it is less than the length (5), so it takes the values 0, 1, 2, 3 and 4, exactly the positions in the list.
- `stock[i]` and `medicines[i]` are the stock and the name of the same medicine, because both lists are in the same order.
- `const lowStock = [];` is an empty list, filled by `push`. `const` means `lowStock` always refers to the same list; the list itself can still grow.
- Node prints a list in square brackets, with text in single quotes.

## Transformation

**Everyday version:** converting a price list from naira to kobo; adding VAT to every price on the board; writing every customer's name in capitals for the delivery labels.

**The algorithm:** go through every item and make a new item from it, by the same rule. The result is a new list, the *same length* as the original. Filtering changes how many items there are; transformation changes what each one is.

Banks and payment services usually store money in the smallest unit, kobo (100 kobo = ₦1), so that amounts are always whole numbers. Transforming a price list:

transform.js

```ts
const pricesInNaira = [2500, 800, 12000, 150];

const pricesInKobo = [];
for (const naira of pricesInNaira) {
  pricesInKobo.push(naira * 100);
}
console.log(pricesInKobo);
console.log("Same length:", pricesInKobo.length === pricesInNaira.length);
```

Output of `node transform.js` and of the browser terminal

```json
[ 250000, 80000, 1200000, 15000 ]
Same length: true
```

`pricesInKobo.length === pricesInNaira.length` compares the two lengths and gives `true` or `false`. It is a small check you can write for every transformation: the same number of items must come out as went in.

## Sorting

**Everyday version:** putting exam scripts in order of score; arranging playing cards in your hand; the accountant's receipts, smallest first.

There are many sorting algorithms. One of the simplest to follow by hand is **selection sort**:

```ts
Input:  a pile of receipts
Output: the same receipts, smallest amount first

1. Find the smallest receipt in the pile.
2. Move it to the end of the sorted row.
3. If the pile is not empty, go back to step 1.
```

Tracing it by hand on four receipts shows how it works. Each round removes one receipt from the pile, so after four rounds it must stop: the algorithm is finite.

```ts
Round  Pile                      Smallest  Sorted row
-----  ------------------------  --------  ------------------------
start  4500, 12000, 800, 15500   -         (empty)
1      4500, 12000, 15500        800       800
2      12000, 15500              4500      800, 4500
3      15500                     12000     800, 4500, 12000
4      (empty)                   15500     800, 4500, 12000, 15500
```

Notice that step 1, "find the smallest", is the "best so far" algorithm from earlier. Algorithms are built from smaller algorithms, just as problems are built from smaller problems.

Writing selection sort in code takes a loop inside a loop, which you will do in the [sorting lesson](https://zudojs.oyinlola.site/learn/dsa-sorting). In everyday code you use the sort that JavaScript already has. For text, it puts items in alphabetical order:

sort-names.js

```ts
const customers = ["Okafor", "Bello", "Musa", "Adeyemi", "Eze"];
customers.sort();
console.log(customers);
```

Output of `node sort-names.js` and of the browser terminal

```json
[ 'Adeyemi', 'Bello', 'Eze', 'Musa', 'Okafor' ]
```

For numbers there is a trap. The built-in sort compares items *as text* unless you tell it otherwise, and as text, `"12000"` comes before `"4500"` because `"1"` comes before `"4"`:

sort-numbers.js

```ts
const sales = [4500, 12000, 800, 15500];

const asText = [4500, 12000, 800, 15500];
asText.sort();
console.log("Sorted as text:   ", asText);

sales.sort((a, b) => a - b);
console.log("Sorted as numbers:", sales);
```

Output of `node sort-numbers.js` and of the browser terminal

```ts
Sorted as text:    [ 12000, 15500, 4500, 800 ]
Sorted as numbers: [ 800, 4500, 12000, 15500 ]
```

`(a, b) => a - b` is a tiny function that tells `sort` how to compare two numbers. You will understand it fully after [Functions](https://zudojs.oyinlola.site/learn/js-functions); for now, it is the standard way to sort numbers from smallest to largest. The lesson here is not the syntax. It is that you should never trust a sort until you have checked its output on an input where you know the right order.

## Combining algorithms

Real tasks combine these algorithms. Here is the pharmacy's end-of-day report: count the sales above ₦10,000, total everything, find the biggest sale, and list the bonus sales. It is one loop, with several accumulators updated together:

report.js

```ts
const sales = [4500, 12000, 800, 15500, 10000, 23000];

let takings = 0;
let bonusCount = 0;
let biggest = sales[0];
const bonusSales = [];

for (const amount of sales) {
  takings = takings + amount;
  if (amount > 10000) {
    bonusCount = bonusCount + 1;
    bonusSales.push(amount);
  }
  if (amount > biggest) {
    biggest = amount;
  }
}

console.log("Sales:", sales.length);
console.log("Takings: ₦" + takings);
console.log("Biggest: ₦" + biggest);
console.log("Bonus sales:", bonusCount, bonusSales);
```

Output of `node report.js` and of the browser terminal

```ts
Sales: 6
Takings: ₦65800
Biggest: ₦23000
Bonus sales: 3 [ 12000, 15500, 23000 ]
```

Totalling, counting, the best so far and filtering, all in one pass through the list. Every report, dashboard and statement you will ever build is some combination of these, run over data from a database instead of a list in the code.

## When algorithms fail

Algorithms rarely fail on the normal case. They fail on the edges: empty lists, values at the boundary, starting values that happen to be wrong.

### The wrong starting value

A small business had a bad week and made a loss every day. Its daily profits are all negative. Find the best day, starting "best so far" at 0:

best-wrong.js

```ts
const profits = [-2000, -500, -1200];

let best = 0;
for (const profit of profits) {
  if (profit > best) {
    best = profit;
  }
}
console.log("Best day: ₦" + best);
```

Output of `node best-wrong.js` and of the browser terminal

```ts
Best day: ₦0
```

₦0 is not in the list. No day was bigger than the starting value, so the start was reported as the answer. The fix is to start with a real item, `profits[0]`, as the `biggest.js` example did. Then the answer is always one of the actual values:

best-right.js

```ts
const profits = [-2000, -500, -1200];

let best = profits[0];
for (const profit of profits) {
  if (profit > best) {
    best = profit;
  }
}
console.log("Best day: ₦" + best);
```

Output of `node best-right.js` and of the browser terminal

```ts
Best day: ₦-500
```

### The empty list

What is the average sale on a day with no sales? The algorithm divides the total, 0, by the count, 0:

empty-average.js

```ts
const sales = [];

let takings = 0;
for (const amount of sales) {
  takings = takings + amount;
}
console.log("Average:", takings / sales.length);

if (sales.length === 0) {
  console.log("No sales today");
} else {
  console.log("Average:", takings / sales.length);
}
```

Output of `node empty-average.js` and of the browser terminal

```ts
Average: NaN
No sales today
```

`NaN` means "not a number": 0 divided by 0 has no answer. Printed on a report, it confuses people; saved in a database, it spreads into every calculation that uses it. The second version checks for the empty list first and says something sensible. An empty list is a normal input, not an error; the algorithm must have an output for it.

### The rule at the boundary

The count of sales "above ₦10,000" gave 3 because the ₦10,000 sale was left out. If the supplier meant "₦10,000 or more", every bonus report is short by one sale on some days. The code was correct; the rule was not precise enough. That is the "precise" property failing before a single line was written.

## Testing an algorithm

For any algorithm that works on a list, these inputs find most bugs:

| Input | Why |
| --- | --- |
| An empty list | Does it still finish and give a sensible output? |
| A list with one item | The smallest real case; starting values are often wrong here. |
| The wanted item first, and last | Loops that start or stop one step too early miss these. |
| The wanted item missing | The "not found" path is the one people forget. |
| Duplicates | Two receipts for Okafor: which one is found? Is that what you want? |
| Boundary values | Exactly ₦10,000, exactly 5 in stock. |

Here the search is tested on several names at once. It uses a loop inside a loop: the outer loop takes each name to search for, and for each one, the inner loop searches the whole list. Write down the expected result for each name first: Bello is first (1), Adeyemi is last (5), Nwosu is missing.

search-test.js

```ts
const customers = ["Bello", "Eze", "Okafor", "Musa", "Adeyemi"];

for (const wanted of ["Bello", "Adeyemi", "Nwosu"]) {
  let position = 0;
  let found = false;
  for (const name of customers) {
    position = position + 1;
    if (name === wanted) {
      found = true;
      break;
    }
  }
  if (found) {
    console.log(wanted, "-> position", position);
  } else {
    console.log(wanted, "-> not found");
  }
}
```

Output of `node search-test.js` and of the browser terminal

```ts
Bello -> position 1
Adeyemi -> position 5
Nwosu -> not found
```

First, last and missing all match the expected results. `break` only stops the inner loop, so the outer loop carries on with the next name. Notice also that `position` and `found` are reset at the start of each outer round; if they were created once, outside both loops, the second search would start with the first search's leftovers.

In production, one more question matters: how many steps does the algorithm take as the list grows? Searching 5 receipts is instant; searching 10 million customer records one by one, on every request, is not. Measuring that is the subject of [Big O and complexity](https://zudojs.oyinlola.site/learn/dsa-complexity), the first lesson of the algorithms course.

## Practice

TRY IT YOURSELF

### Count the pending orders

A delivery company has a list of order statuses: `["delivered", "pending", "pending", "cancelled", "delivered", "pending"]`. Write an algorithm that counts the pending orders. Say the expected answer before running it.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Start a counter at 0, and step through each status with a `for...of` loop.

HINT 2

Inside the loop: `if (status === "pending") { pending = pending + 1; }`

SOLUTION

Expected: 3.

pending.js

```ts
const statuses = ["delivered", "pending", "pending", "cancelled", "delivered", "pending"];

let pending = 0;
for (const status of statuses) {
  if (status === "pending") {
    pending = pending + 1;
  }
}
console.log("Pending orders:", pending);
```

Output of `node pending.js` and of the browser terminal

```ts
Pending orders: 3
```

This is counting: start at 0, add 1 for every item that matches the rule. Test it with an empty list too: the answer should be 0, and it is, because the loop never runs.

TRY IT YOURSELF

### Find the cheapest supplier

Three suppliers quote for a carton of paracetamol. The names are `["Emzor", "Fidson", "May & Baker"]` and their prices, in the same order, are `[18500, 17200, 19000]`. Find the cheapest price and who offers it. Then test it with the cheapest supplier first, and with the cheapest last.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Loop with an index, `for (let i = 0; i < prices.length; i++)`, so you can read the same position from both arrays.

HINT 2

`if (prices[i] < cheapest) { cheapest = prices[i]; cheapestName = suppliers[i]; }`

SOLUTION

cheapest.js

```ts
const suppliers = ["Emzor", "Fidson", "May & Baker"];
const prices = [18500, 17200, 19000];

let cheapest = prices[0];
let cheapestName = suppliers[0];
for (let i = 0; i < prices.length; i++) {
  if (prices[i] < cheapest) {
    cheapest = prices[i];
    cheapestName = suppliers[i];
  }
}
console.log("Cheapest:", cheapestName, "at ₦" + cheapest);
```

Output of `node cheapest.js` and of the browser terminal

```ts
Cheapest: Fidson at ₦17200
```

This is "best so far", with `<` instead of `>`, and it remembers two things at once: the price and the name at the same position. It starts from the first real supplier, never from 0: starting from 0 would report ₦0, because no price is less than 0. If two suppliers quote the same lowest price, `<` keeps the first one found. Decide whether that is what the pharmacy wants.

TRY IT YOURSELF

### Filter and transform together

A pharmacy gives a 10% discount on items priced ₦5,000 or more. Given the prices `[2500, 8000, 5000, 1200, 12000]`, make a new list with the discounted price of *only* the items that qualify. What length do you expect the result to have?

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

The `if` is the filter (keep only prices ₦5,000 or more); the calculation inside `push` is the transform.

HINT 2

`if (price >= 5000) { discounted.push(price - price / 10); }`

SOLUTION

Three prices qualify (8,000, 5,000 and 12,000), so the result has 3 items: 7,200, 4,500 and 10,800.

discounts.js

```ts
const prices = [2500, 8000, 5000, 1200, 12000];

const discounted = [];
for (const price of prices) {
  if (price >= 5000) {
    discounted.push(price - price / 10);
  }
}
console.log(discounted);
```

Output of `node discounts.js` and of the browser terminal

```json
[ 7200, 4500, 10800 ]
```

The `if` is the filter; the calculation inside `push` is the transformation. The boundary value, ₦5,000, is in the test list on purpose, and it qualifies because the rule says "or more".

## Recap

- An algorithm has input, output, precise steps, a guaranteed end, and steps that can actually be done. The "not found" and "empty" cases are where the properties usually break.
- Every algorithm is built from three shapes: sequence, decision (`if`) and repetition (loops).
- Searching looks at each item until it finds a match, and must still answer when there is none. Sorted data allows faster searching.
- Counting, totalling and "best so far" keep a running value (an accumulator). Start it correctly: 0 for counts and totals, the first real item for the best so far.
- Filtering keeps the items that match a rule. Transformation makes a new item from every item. Sorting puts items in order; check numeric sorts, because the default sort compares text.
- Test with an empty list, one item, the wanted item first and last, a missing item, duplicates and boundary values.

Next: [Pseudocode and flowcharts](https://zudojs.oyinlola.site/learn/think-pseudocode), two ways to write an algorithm down clearly before you write it in code.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
