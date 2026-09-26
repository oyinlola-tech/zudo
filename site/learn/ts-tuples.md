---
title: "Tuples — ZudoJS Academy"
description: "Type fixed-shape arrays with tuples: optional, rest and named elements, readonly tuples and tuple inference, and return tuples the way useState does."
source: https://zudojs.oyinlola.site/learn/ts-tuples
---

LEVEL 5 · LESSON 13 OF 23

Special types and narrowing Foundation

# Tuples

Type fixed-shape arrays with tuples: optional, rest and named elements, readonly tuples and tuple inference, and return tuples the way useState does.

- **40 min** to read and try
- **You need:** Narrowing and Enums and their alternatives
- **You build:** A typed bank-statement parser that turns CSV lines into tuples, plus a useState-style state helper

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Tell when an array literal is inferred as an array and when as a tuple
- Write tuples with optional, rest and named elements
- Protect tuples from push and in-place sorting with readonly
- Return tuples from functions, useState-style, and destructure them
- Model success and failure as a union of tuples and narrow it

## A row that lost its shape

Your bank lets customers download a statement as CSV. Each line has a date, a description and an amount in naira. You parse a line and want to add up the amounts:

row.ts

```ts
const row = ["2026-09-01", "POS purchase, Shoprite Lekki", -2500];

const amount = row[2];
console.log(amount.toFixed(2));
```

What `npx tsc --noEmit` prints

```ts
row.ts:4:20 - error TS2339: Property 'toFixed' does not exist on type 'string | number'.
  Property 'toFixed' does not exist on type 'string'.

4 console.log(amount.toFixed(2));
                     ~~~~~~~


Found 1 error in row.ts:4
```

You can see that position 2 holds a number. TypeScript cannot, because it inferred `row` as `(string | number)[]`: an array of any length where *every* element could be a string or a number. It has no idea which position holds which. For a list of similar things (a list of prices, a list of names), that is exactly right. For a small, fixed record where each position means something different, you need a **tuple**: an array type with a fixed number of elements, each with its own type.

row.ts

```ts
const row: [string, string, number] = ["2026-09-01", "POS purchase, Shoprite Lekki", -2500];

const [date, description, amount] = row;
console.log(date, amount.toFixed(2), description.length);
```

Output of `npx tsx row.ts` and of the browser terminal

```ts
2026-09-01 -2500.00 28
```

You met tuples briefly in [Basic types](https://zudojs.oyinlola.site/learn/ts-types#tuples). This lesson covers the whole feature: optional and rest elements, labels, `readonly`, how TypeScript decides between an array and a tuple, and the places where tuples are the best design, and where they are not.

## What a tuple type knows

A tuple type carries three pieces of information an array type does not: how many elements there are, the type of each position, and therefore which indexes exist:

knows.ts

```ts
const transfer: [from: string, to: string, kobo: number] = ["ACC-001", "ACC-002", 250000];

const size: 3 = transfer.length;
const [from, to, kobo] = transfer;
console.log(`${from} -> ${to}: ₦${(kobo / 100).toLocaleString("en-NG")}`, size);
```

Output of `npx tsx knows.ts` and of the browser terminal

```ts
ACC-001 -> ACC-002: ₦2,500 3
```

`transfer.length` has the literal type `3`, not `number`. Reading or destructuring past the end is a compile error:

past-end.ts

```ts
const transfer: [string, string, number] = ["ACC-001", "ACC-002", 250000];

const [from, to, kobo, fee] = transfer;
console.log(transfer[3]);
```

What `npx tsc --noEmit` prints

```ts
past-end.ts:3:24 - error TS2493: Tuple type '[string, string, number]' of length '3' has no element at index '3'.

3 const [from, to, kobo, fee] = transfer;
                         ~~~

past-end.ts:4:22 - error TS2493: Tuple type '[string, string, number]' of length '3' has no element at index '3'.

4 console.log(transfer[3]);
                       ~


Found 2 errors in the same file, starting at: past-end.ts:3
```

Under the hood a tuple is an ordinary JavaScript array. Nothing at runtime knows it is a tuple, which matters in a moment.

### Named elements

In `[from: string, to: string, kobo: number]`, the names before the colons are **labels** (TypeScript calls them named tuple elements). They change nothing about the type: `[from: string]` and `[string]` are the same type, and the caller can destructure with any names. They exist for people: your editor shows them on hover and in error messages, and they document what each position means. Either label every element or none.

## Optional and rest elements

### Optional elements

A `?` after an element type makes that element optional. Optional elements must come after all required ones, and the `length` type becomes a union:

optional.ts

```ts
type Fee = [label: string, kobo: number, waivedFor?: string];

const fees: Fee[] = [
  ["SMS alert", 400],
  ["Transfer fee", 1075, "Premium"],
];

for (const [label, kobo, waivedFor] of fees) {
  const note = waivedFor === undefined ? "" : ` (free for ${waivedFor})`;
  console.log(`${label}: ₦${kobo / 100}${note}`);
}

const first: Fee = ["Card maintenance", 5000];
const size: 2 | 3 = first.length;
console.log(size);
```

Output of `npx tsx optional.ts` and of the browser terminal

```ts
SMS alert: ₦4
Transfer fee: ₦10.75 (free for Premium)
2
```

Inside the loop, `waivedFor` is `string | undefined`, so you must narrow it before use, exactly as with an optional property.

### Rest elements

A **rest element**, `...T[]`, stands for zero or more elements of one type. It turns a tuple into a type with a fixed part and a variable part. A monthly report row with a branch name followed by any number of daily totals:

rest.ts

```ts
type BranchRow = [branch: string, ...dailyKobo: number[]];

const rows: BranchRow[] = [
  ["Lekki", 1250000, 980000, 1430000],
  ["Ikeja", 2100000],
  ["Wuse"],
];

for (const [branch, ...daily] of rows) {
  const total = daily.reduce((sum, kobo) => sum + kobo, 0);
  console.log(`${branch}: ₦${(total / 100).toLocaleString("en-NG")}, days reported: ${daily.length}`);
}
```

Output of `npx tsx rest.ts` and of the browser terminal

```ts
Lekki: ₦36,600, days reported: 3
Ikeja: ₦21,000, days reported: 1
Wuse: ₦0, days reported: 0
```

The rest element can also sit at the start or in the middle, as long as there is only one. `[...path: string[], amount: number]` describes "any number of strings, then exactly one number at the end", which fits a ledger path like `["assets", "bank", "gtbank", 500000]`:

leading-rest.ts

```ts
type LedgerEntry = [...path: string[], kobo: number];

function describe(entry: LedgerEntry): string {
  const kobo = entry[entry.length - 1];
  const path = entry.slice(0, -1);
  return `${path.join(":")} = ${kobo}`;
}

console.log(describe(["assets", "bank", "gtbank", 500000]));
console.log(describe(["expenses", 2500]));
```

Output of `npx tsx leading-rest.ts` and of the browser terminal

```ts
assets:bank:gtbank = 500000
expenses = 2500
```

TypeScript knows only the *shape* here, not every index: `entry[entry.length - 1]` is typed `string | number`, and the template literal accepts both. When a type starts needing this much care, an object like `{ path: string[]; kobo: number }` is often clearer; you will see that trade-off again at the end of the lesson.

## readonly tuples

Here is the runtime fact from earlier coming back to bite. A tuple is a real array, and plain tuple types still allow the array methods that change length:

push.ts

```ts
const rate: [currency: string, nairaPerUnit: number] = ["USD", 1550];

rate.push(1600);

const [currency, value] = rate;
console.log(currency, value, rate.length, rate);
```

Output of `npx tsx push.ts` and of the browser terminal

```ts
USD 1550 3 [ 'USD', 1550, 1600 ]
```

This compiles. The type still says "two elements" while the array now has three. A **readonly tuple** removes `push`, `pop`, `sort`, `splice` and assignment to elements, so the shape cannot drift:

readonly.ts

```ts
const rate: readonly [currency: string, nairaPerUnit: number] = ["USD", 1550];

rate.push(1600);
rate[1] = 1600;
```

What `npx tsc --noEmit` prints

```ts
readonly.ts:3:6 - error TS2339: Property 'push' does not exist on type 'readonly [currency: string, nairaPerUnit: number]'.

3 rate.push(1600);
       ~~~~

readonly.ts:4:6 - error TS2540: Cannot assign to '1' because it is a read-only property.

4 rate[1] = 1600;
       ~


Found 2 errors in the same file, starting at: readonly.ts:3
```

Write `readonly` on tuples you do not intend to change, which is almost all of them. A function parameter typed `readonly [string, number]` accepts both mutable and readonly tuples, so it is the friendlier choice for inputs too. To "change" a readonly tuple, make a new one: `const next = [rate[0], 1600] as const`.

### Sorting in place

`sort` and `reverse` change the array they are called on. On a tuple that holds different kinds of things, that can scramble the positions. On a readonly tuple, TypeScript refuses; use the copying versions `toSorted` and `toReversed` instead, which return a new array:

to-sorted.ts

```ts
const topUps: readonly [number, number, number] = [5000, 1000, 20000];

const ascending = topUps.toSorted((a, b) => a - b);
console.log(ascending, topUps);
```

Output of `npx tsx to-sorted.ts` and of the browser terminal

```json
[ 1000, 5000, 20000 ] [ 5000, 1000, 20000 ]
```

Note the result type: `toSorted` returns `number[]`, not a tuple. After sorting, TypeScript no longer promises which value is where, which is honest.

## When TypeScript infers a tuple

An array literal on its own is always inferred as an array. That is a deliberate default: most arrays grow and shrink. There are four ways to get a tuple instead.

inference.ts

```ts
const inferred = ["NGN", 1];
const annotated: [string, number] = ["NGN", 1];
const constant = ["NGN", 1] as const;

function pair(): [currency: string, rate: number] {
  return ["USD", 1550];
}
const returned = pair();

function tuple<const T extends readonly unknown[]>(...items: T): T {
  return items;
}
const generic = tuple("GBP", 2050, true);

console.log(inferred.length, annotated.length, constant.length, returned.length, generic.length);
```

Output of `npx tsx inference.ts` and of the browser terminal

```ts
2 2 2 2 3
```

- `inferred` is `(string | number)[]`: an array.
- An **annotation** makes it `[string, number]`.
- `as const` makes it `readonly ["NGN", 1]`: a readonly tuple of literal types. That is the most precise type there is, and often too precise for values that are not constants.
- A **return type** on a function makes the returned literal a tuple, which is how most tuples in real code are created.
- A **const type parameter**, `<const T extends readonly unknown[]>` (TypeScript 5.0), asks TypeScript to infer `T` as if the caller had written `as const`. Here `generic` is `readonly ["GBP", 2050, true]`, without the caller writing anything.

Without the return type, even a two-element return would be inferred as an array, and every caller would lose the positions:

no-return-type.ts

```ts
function exchangeRate(currency: string) {
  return [currency, 1550];
}

const [code, rate] = exchangeRate("USD");
console.log(rate.toFixed(2));
```

What `npx tsc --noEmit` prints

```ts
no-return-type.ts:6:18 - error TS2339: Property 'toFixed' does not exist on type 'string | number'.
  Property 'toFixed' does not exist on type 'string'.

6 console.log(rate.toFixed(2));
                   ~~~~~~~


Found 1 error in no-return-type.ts:6
```

## Returning tuples, useState-style

The most famous tuple in JavaScript is React's `const [count, setCount] = useState(0)`. It returns a tuple, not an object, for one reason: the caller chooses the names. With an object, every caller would have to write `const { value: count, setValue: setCount } = …`. With a tuple, names are free and destructuring is short. Here is the same idea as a small state helper for a shopping cart:

state.ts

```ts
export function createState<T>(initial: T): readonly [get: () => T, set: (next: T | ((previous: T) => T)) => void] {
  let value = initial;
  const get = () => value;
  const set = (next: T | ((previous: T) => T)) => {
    value = typeof next === "function" ? (next as (previous: T) => T)(value) : next;
  };
  return [get, set] as const;
}

const [itemCount, setItemCount] = createState(0);
const [coupon, setCoupon] = createState<string | null>(null);

setItemCount(3);
setItemCount((n) => n + 1);
setCoupon("SAVE10");

console.log(itemCount(), coupon());
```

Output of `npx tsx state.ts` and of the browser terminal

```ts
4 SAVE10
```

- The return type is a readonly tuple with labels, so callers see `get` and `set` in their editor, then pick their own names.
- `T` is inferred from the initial value: `number` for the counter. For the coupon, `null` alone would infer `T = null`, so the caller passes `<string | null>`, exactly as with `useState`.
- The one `as` is there because TypeScript cannot tell, from `typeof next === "function"`, that the function is the updater and not a `T` that happens to be a function. It is the "proof the compiler cannot follow" case from [Type assertions](https://zudojs.oyinlola.site/learn/ts-assertions#justified); it would be wrong if `T` itself were a function type, which is why React documents the same limitation.

### Tuples you already use

The standard library returns and accepts tuples in several places, and the types are written that way:

builtins.ts

```ts
const balances = { "ACC-001": 125000, "ACC-002": 0 };

for (const [account, kobo] of Object.entries(balances)) {
  console.log(account, kobo);
}

const fees = new Map<string, number>([["transfer", 1075], ["sms", 400]]);
console.log([...fees.entries()][0]);

const [user, account] = await Promise.all([
  Promise.resolve({ name: "Ada" }),
  Promise.resolve({ id: "ACC-001", kobo: 125000 }),
]);
console.log(user.name, account.kobo);
```

Output of `npx tsx builtins.ts` and of the browser terminal

```ts
ACC-001 125000
ACC-002 0
[ 'transfer', 1075 ]
Ada 125000
```

`Object.entries` gives `[string, number][]`, an array of pairs. A `Map` is built from pairs. `Promise.all` on a tuple of promises returns a tuple of results, so `user` and `account` each get their own type; with a plain array, both would be a union.

### Tuples as parameter lists

A function's parameter list is itself a tuple type, and a rest parameter can be typed with one. `Parameters<typeof fn>`, a built-in utility type that [Advanced and utility types](https://zudojs.oyinlola.site/learn/ts-advanced#utility-types) covers with the others, gives you that tuple:

params.ts

```ts
function transfer(from: string, to: string, kobo: number): string {
  return `${from} -> ${to}: ${kobo}`;
}

type TransferArgs = Parameters<typeof transfer>;

const queued: TransferArgs[] = [
  ["ACC-001", "ACC-002", 250000],
  ["ACC-003", "ACC-001", 1000],
];

for (const args of queued) console.log(transfer(...args));
```

Output of `npx tsx params.ts` and of the browser terminal

```ts
ACC-001 -> ACC-002: 250000
ACC-003 -> ACC-001: 1000
```

`TransferArgs` is `[from: string, to: string, kobo: number]`, labels included. Spreading a tuple into a call type-checks each argument by position, which is what makes a queue of saved calls safe.

## Build: a statement parser

REASON IT OUT

### Before you parse the statement

Each line of the CSV looks like `2026-09-01,POS purchase,-2500.00`. Some lines have a fourth column, a reference. The file comes from another system, so treat it as outside data. Think first:

- What tuple type describes a valid row, including the optional reference?
- What can be wrong with a line? Think about too few columns, a date that is not a date, an amount that is not a number, and a description that contains a comma.
- How should the parser report a bad line: throw, skip it silently, or return something the caller must check?
- Amounts like `-2500.00` are naira with decimals. What should the program store?

**Show the reasoning**

A valid row is `readonly [date: string, description: string, kobo: number, reference?: string]`. A line can have too few or too many columns, a malformed date, or an amount where `Number(…)` gives `NaN`. A real bank CSV quotes descriptions that contain commas; this simple parser does not support quotes, so it must at least refuse lines with the wrong number of columns instead of shifting every field. Skipping silently hides data loss and throwing stops the whole file for one bad line, so each line returns either an error or a row, and the caller decides. A union of two tuples, `[error: string, row: null] | [error: null, row: Row]`, does exactly that and narrows on the first element. Money is stored as whole kobo, as in [Narrowing](https://zudojs.oyinlola.site/learn/ts-narrowing#build).

statement.ts

```ts
export type Row = readonly [date: string, description: string, kobo: number, reference?: string];
export type ParseResult = readonly [error: string, row: null] | readonly [error: null, row: Row];

export function parseLine(line: string): ParseResult {
  const cells = line.split(",").map((cell) => cell.trim());
  if (cells.length < 3 || cells.length > 4) return [`expected 3 or 4 columns, got ${cells.length}`, null];
  const [date, description, amount, reference] = cells;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [`bad date "${date}"`, null];
  const naira = Number(amount);
  if (amount === "" || !Number.isFinite(naira)) return [`bad amount "${amount}"`, null];
  const kobo = Math.round(naira * 100);
  return [null, reference ? [date, description, kobo, reference] : [date, description, kobo]];
}
```

The parser lives in its own module, so the tests can import it. A small script runs it over a sample statement:

main.ts

```ts
import { parseLine } from "./statement.js";

const csv = `2026-09-01,POS purchase,-2500.00
2026-09-02,Salary,450000.00,PAY-0925
2026-09-03,Airtime
2026-09-04,Transfer to Ada,abc
2026-09-05,Lunch, Yaba,-3000`;

let balance = 0;
for (const [lineNo, line] of csv.split("\n").entries()) {
  const [error, row] = parseLine(line);
  if (error !== null) {
    console.log(`line ${lineNo + 1}: ${error}`);
    continue;
  }
  const [date, description, kobo, reference] = row;
  balance += kobo;
  console.log(`${date} ${description.padEnd(16)} ${String(kobo).padStart(9)}${reference ? " " + reference : ""}`);
}
console.log(`balance: ₦${(balance / 100).toFixed(2)}`);
```

Output of `npx tsx main.ts` and of the browser terminal

```ts
2026-09-01 POS purchase       -250000
2026-09-02 Salary            45000000 PAY-0925
line 3: expected 3 or 4 columns, got 2
line 4: bad amount "abc"
line 5: bad amount "Yaba"
balance: ₦447500.00
```

Read how the tuples work together:

- `ParseResult` is a union of two tuples, and the first element is `string` in one and `null` in the other. `null` is a unit type, so it works as a discriminant: after `if (error !== null) continue`, TypeScript knows `row` is a `Row`, even though both came from destructuring.
- `cells` is a `string[]`, not a tuple, so destructuring it gives four `string`s. That is not quite true: on a three-column line, `reference` is `undefined`. The truthiness check `reference ? … : …` handles it (an empty reference counts as none), but the compiler did not make you write it. The `noUncheckedIndexedAccess` option, covered in [tsconfig in depth](https://zudojs.oyinlola.site/learn/ts-tsconfig), makes every such element `string | undefined` so you cannot forget. (With it on, this parser would not compile until `date` and `amount` are checked too: the compiler would be pointing at the same kind of gap.)
- The last line has a comma inside the description and produced four columns: `"Yaba"` became the amount and was refused. Without the column count and amount checks, it would have been stored as a real transaction. Supporting quoted CSV properly is a job for a CSV library.

## Testing functions that return tuples

A tuple is an array, so tests compare it with deep equality, position by position. Test each position you care about, the failure tuples, and the optional element both present and absent:

statement.test.ts

```ts
import { parseLine } from "./statement.js";

const cases: [line: string, expected: unknown][] = [
  ["2026-09-01,POS purchase,-2500.00", [null, ["2026-09-01", "POS purchase", -250000]]],
  ["2026-09-02,Salary,450000,PAY-1", [null, ["2026-09-02", "Salary", 45000000, "PAY-1"]]],
  ["2026-09-03,Airtime", ["expected 3 or 4 columns, got 2", null]],
  ["01/09/2026,Rent,-100000", ['bad date "01/09/2026"', null]],
  ["2026-09-04,Refund,", ['bad amount ""', null]],
];

for (const [line, expected] of cases) {
  const same = JSON.stringify(parseLine(line)) === JSON.stringify(expected);
  console.log(same ? "PASS" : "FAIL", line);
}
```

Output of `npx tsx statement.test.ts` and of the browser terminal

```ts
PASS 2026-09-01,POS purchase,-2500.00
PASS 2026-09-02,Salary,450000,PAY-1
PASS 2026-09-03,Airtime
PASS 01/09/2026,Rent,-100000
PASS 2026-09-04,Refund,
```

Notice `"2026-09-04,Refund,"`: `Number("")` is `0`, not `NaN`, so without the explicit `amount === ""` check an empty amount would have become a ₦0 transaction. The test table is where you find out. In a Vitest suite, `expect(parseLine(line)).toEqual(expected)` does the deep comparison for you.

## Tuples in production code

- **Keep them short.** Two or three positions whose meaning is obvious: pairs, entries, `[value, setValue]`, `[error, result]`. Beyond that, use an object; `row.kobo` is clearer than `row[2]`, and adding a field does not shift every position.
- **Make them readonly.** `push` on a tuple compiles and breaks the type's promise. `readonly` costs nothing.
- **Label them.** Labels are free documentation that shows up in editors and error messages.
- **Validate at the boundary.** JSON has no tuples: `JSON.parse("[1, 2]")` is an array of `any`. A tuple from a request, file or queue needs its length and every position checked, like any outside data.
- **Prefer objects in public APIs and JSON.** An API field `"rate": ["USD", 1550]` forces every client to know the positions; `{ "currency": "USD", "rate": 1550 }` explains itself.

## Practice

TRY IT YOURSELF

### Min and max in one pass

Write `range(amounts: readonly number[]): readonly [min: number, max: number] | null`, which returns `null` for an empty list. Use it on a list of withdrawals.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Destructure `const [first, ...rest] = amounts;` and return `null` when `first` is `undefined`. Otherwise track `min` and `max`, starting both at `first`, the way `span` tracks `lowest` and `highest`.

HINT 2

Write the return type yourself: `readonly [min: number, max: number] | null`. Without it, the returned array literal would be inferred as a plain array, not a tuple.

SOLUTION

range.ts

```ts
function range(amounts: readonly number[]): readonly [min: number, max: number] | null {
  const [first, ...rest] = amounts;
  if (first === undefined) return null;
  let min = first;
  let max = first;
  for (const amount of rest) {
    if (amount < min) min = amount;
    if (amount > max) max = amount;
  }
  return [min, max];
}

const result = range([5000, 1200, 20000, 800]);
if (result !== null) {
  const [smallest, largest] = result;
  console.log(smallest, largest);
}
console.log(range([]));
```

Output of `npx tsx range.ts` and of the browser terminal

```ts
800 20000
null
```

The return type makes the returned literal a tuple, and the caller chooses the names. `null` for an empty list is part of the type, so the caller must narrow before destructuring.

TRY IT YOURSELF

### A useToggle helper

Using the same idea as `createState`, write `useToggle(initial: boolean)` that returns a readonly tuple `[isOn: () => boolean, toggle: () => void]`. Use it for a "show balance" switch.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Keep the flag in a closed-over variable: `let on = initial;`. The getter is `() => on`; the toggle is `() => { on = !on; }`.

HINT 2

Return them as a tuple, and write the return type yourself: `readonly [isOn: () => boolean, toggle: () => void]`. Without it, the array literal infers as a plain array.

SOLUTION

toggle.ts

```ts
function useToggle(initial: boolean): readonly [isOn: () => boolean, toggle: () => void] {
  let on = initial;
  return [() => on, () => { on = !on; }] as const;
}

const [showBalance, toggleBalance] = useToggle(false);
console.log(showBalance());
toggleBalance();
console.log(showBalance());
toggleBalance();
console.log(showBalance());
```

Output of `npx tsx toggle.ts` and of the browser terminal

```ts
false
true
false
```

Both functions close over the same `on` variable, so the toggle is visible through the getter. The caller named them `showBalance` and `toggleBalance`, which an object return would not have allowed without renaming.

TRY IT YOURSELF

### Tuple or object?

For each of these, would you use a tuple or an object, and why? (a) A currency pair and its rate returned by `latestRate()`. (b) A customer record with name, e-mail, phone, BVN and date of birth. (c) The two halves of a split bill, `[yours, mine]`.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Ask: will this value be destructured once, right where it is returned, with names the caller picks? Or does it need to travel further, into JSON, logs or a form with many fields?

HINT 2

Count the fields, and ask whether their order is obvious without looking anything up. Five fields of mixed meaning rarely stay obvious.

SOLUTION

(a) Either works; a labelled readonly tuple `[pair: string, rate: number]` is fine for a two-value return that callers destructure at once, and an object is better if it goes into JSON. (b) An object: five fields, all strings except the date, would be impossible to keep in the right order, and positions say nothing in logs or JSON. (c) A tuple: two values of the same kind, destructured immediately, where the caller naming them (`const [yours, mine] = split(bill)`) is the whole point.

## Recap

- A tuple type fixes the length and the type of each position. An array literal is inferred as an array unless an annotation, a return type, `as const` or a const type parameter says otherwise.
- `?` marks optional elements (at the end), `...T[]` a rest element (one per tuple, anywhere). Labels document positions and change nothing else.
- Plain tuples still allow `push` and `sort`. `readonly` tuples do not; use `toSorted` for a sorted copy.
- Return tuples when callers should name the parts (`[get, set]`, `[error, row]`). `Object.entries`, `Map`, `Promise.all` and `Parameters` all speak tuples.
- A union of tuples with a `null` or literal element narrows like a discriminated union, even after destructuring.
- Keep tuples short, readonly and labelled, validate them at the boundary, and switch to an object when positions stop being obvious.

Next: [Generics](https://zudojs.oyinlola.site/learn/ts-generics), where functions like `createState<T>` come from.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
