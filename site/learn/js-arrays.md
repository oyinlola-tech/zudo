---
title: "Arrays — ZudoJS Academy"
description: "Keep ordered lists in arrays, add, remove and search items, transform them with map, filter, reduce and sort, and build a small student management system."
source: https://zudojs.oyinlola.site/learn/js-arrays
---

LEVEL 2 · LESSON 9 OF 19

Arrays and objects Foundation

# Arrays

Keep ordered lists in arrays, add, remove and search items, transform them with map, filter, reduce and sort, and build a small student management system.

- **40 min** to read and try
- **You need:** The lessons up to Functions
- **You build:** A student management system that lists, adds, finds and ranks students

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Create arrays, read items by index and change them in place
- Add and remove items, and tell the copying slice from the mutating splice
- Search arrays by value and with callbacks
- Transform arrays with map, filter and reduce, and chain the steps
- Sort numbers and text correctly with a comparator and toSorted

## Creating and reading arrays

An **array** is an ordered list of values. You have already used a few: a list of titles in [Loops](https://zudojs.oyinlola.site/learn/js-loops#for-of), a list of numbers in [Functions](https://zudojs.oyinlola.site/learn/js-functions#callbacks). Write one with square brackets and commas. Each item has a position, its **index**, counted from 0, and `.length` tells you how many items there are:

create.js

```ts
const titles = ["Buy milk", "Write report", "Call Ada"];
const empty = [];
const mixed = [1, "two", true, null];

console.log(titles);
console.log(titles.length, empty.length);
console.log(titles[0]);             // the first item
console.log(titles[titles.length - 1]);   // the last item
console.log(titles.at(-1));         // also the last item
console.log(titles[10]);            // no item there
console.log(mixed);
```

Output of `node create.js` and of the browser terminal

```json
[ 'Buy milk', 'Write report', 'Call Ada' ]
3 0
Buy milk
Call Ada
Call Ada
undefined
[ 1, 'two', true, null ]
```

Reading an index that does not exist gives `undefined`, not an error. An array can hold any mix of values, but in practice you keep one kind of thing per array: all titles, or all tasks.

### Updating items

Assign to an index to replace an item:

update.js

```ts
const titles = ["Buy milk", "Write report", "Call Ada"];

titles[1] = "Write the quarterly report";
console.log(titles);
console.log(Array.isArray(titles), typeof titles);
```

Output of `node update.js` and of the browser terminal

```json
[ 'Buy milk', 'Write the quarterly report', 'Call Ada' ]
true object
```

Notice that `titles` is a `const`, and yet it changed. `const` only stops you from pointing the name at a *different* array; the array itself can still change. Changing a value in place is called **mutating** it ([Types in depth](https://zudojs.oyinlola.site/learn/js-types-deep#mutability) explains the difference between a `const` name and an unchangeable value). Arrays are objects, so `typeof` says `"object"`; use `Array.isArray` to check for an array.

## Adding and removing items

Four methods add or remove at the ends. They all mutate the array:

push-pop.js

```ts
const queue = ["b", "c"];

queue.push("d");          // add to the end
queue.unshift("a");       // add to the start
console.log(queue);

const last = queue.pop();     // remove from the end
const first = queue.shift();  // remove from the start
console.log(last, first);
console.log(queue);
```

Output of `node push-pop.js` and of the browser terminal

```json
[ 'a', 'b', 'c', 'd' ]
d a
[ 'b', 'c' ]
```

`pop` and `shift` give back the item they removed. An easy way to remember: `push`/`pop` work at the end, `unshift`/`shift` at the start.

### slice versus splice

These two names look alike and do very different things:

- `slice(start, end)` *copies* a part of the array into a new one. The original does not change. The item at `end` is not included.
- `splice(start, deleteCount, ...newItems)` *changes* the array: it removes items, can insert new ones in their place, and gives back what it removed.

slice-splice.js

```ts
const letters = ["a", "b", "c", "d", "e"];

console.log(letters.slice(1, 3));   // copy positions 1 and 2
console.log(letters.slice(-2));     // copy the last two
console.log(letters);               // unchanged

const removed = letters.splice(1, 2);          // remove 2 items at position 1
console.log(removed, letters);
letters.splice(1, 0, "x", "y");               // remove 0, insert 2
console.log(letters);
```

Output of `node slice-splice.js` and of the browser terminal

```json
[ 'b', 'c' ]
[ 'd', 'e' ]
[ 'a', 'b', 'c', 'd', 'e' ]
[ 'b', 'c' ] [ 'a', 'd', 'e' ]
[ 'a', 'x', 'y', 'd', 'e' ]
```

`slice()` with no arguments copies the whole array, which is useful when you want to change a copy and keep the original.

## Searching

`includes` tells you whether a value is in the array. `indexOf` tells you where, or `-1` if it is not there. Neither converts types: the string `"2"` is never found in `[1, 2, 3]`. `indexOf` compares with `===`; `includes` uses the same rule except that it can also find `NaN` (the SameValueZero rule from [Types in depth](https://zudojs.oyinlola.site/learn/js-types-deep#equality)):

includes.js

```ts
const tags = ["home", "urgent", "shopping"];

console.log(tags.includes("urgent"), tags.includes("work"));
console.log(tags.indexOf("shopping"), tags.indexOf("work"));
console.log([1, 2, 3].includes("2"), [NaN].includes(NaN), [NaN].indexOf(NaN));
```

Output of `node includes.js` and of the browser terminal

```ts
true false
2 -1
false true -1
```

For anything more than an exact value, pass a callback. `find` gives the first item for which the callback returns something truthy, and `findIndex` gives its position. `some` asks "does at least one item match?" and `every` asks "do all items match?":

find.js

```ts
const scores = [42, 87, 65, 91, 73];

console.log(scores.find((s) => s > 80));        // first score above 80
console.log(scores.findIndex((s) => s > 80));   // its position
console.log(scores.find((s) => s > 100));       // no match
console.log(scores.findIndex((s) => s > 100));
console.log(scores.some((s) => s < 50));        // anyone failed?
console.log(scores.every((s) => s >= 40));      // everyone at least 40?
```

Output of `node find.js` and of the browser terminal

```ts
87
1
undefined
-1
true
true
```

Each of these calls your callback with one item at a time, just like `applyToAll` did in the lesson on functions. They stop as soon as they know the answer.

## map, filter and reduce

These three methods replace most loops you would otherwise write. None of them changes the original array; each gives back something new.

- `map` makes a new array of the same length, with each item transformed by your callback.
- `filter` makes a new array with only the items for which your callback returns something truthy.
- `reduce` combines all items into one value, such as a total.

map-filter-reduce.js

```ts
const prices = [1200, 450, 3000, 800];   // in cents

const inEuros = prices.map((cents) => cents / 100);
const expensive = prices.filter((cents) => cents >= 1000);
const total = prices.reduce((sum, cents) => sum + cents, 0);

console.log(inEuros);
console.log(expensive);
console.log(total);
console.log(prices);          // unchanged
```

Output of `node map-filter-reduce.js` and of the browser terminal

```json
[ 12, 4.5, 30, 8 ]
[ 1200, 3000 ]
5450
[ 1200, 450, 3000, 800 ]
```

`reduce` needs two things: a callback that takes the result so far (`sum`) and the current item, and a starting value (`0`). Step by step: 0 + 1200 = 1200, then + 450 = 1650, then + 3000 = 4650, then + 800 = 5450.

> Always give reduce a starting value
>
> Without the `0`, `reduce` starts from the first item, and on an empty array it throws an error. With it, the total of an empty list is simply `0`.

### forEach

`forEach` calls your callback once per item and gives back nothing. Use it when you only want a side effect, such as printing. The callback also receives the index as a second argument; so do `map`, `filter` and the others:

for-each.js

```ts
const titles = ["Buy milk", "Write report"];

titles.forEach((title, index) => {
  console.log(`${index + 1}. ${title}`);
});
```

Output of `node for-each.js` and of the browser terminal

```ts
1. Buy milk
2. Write report
```

A `for...of` loop does the same job and also allows `break`, which `forEach` does not. Pick whichever reads better.

## Sorting

`sort` puts the items in order. It has a famous trap: by default it converts every item to a string and sorts them as text.

sort-trap.js

```ts
const numbers = [10, 9, 1, 100, 25];
numbers.sort();
console.log(numbers);
```

Output of `node sort-trap.js` and of the browser terminal

```json
[ 1, 10, 100, 25, 9 ]
```

As text, `"100"` comes before `"25"` because `"1"` comes before `"2"`, the same rule you saw with `"10" < "9"` in [Operators](https://zudojs.oyinlola.site/learn/js-operators#comparison). To sort numbers, pass a **comparator**: a function that takes two items `a` and `b` and returns a negative number if `a` should come first, a positive number if `b` should, and `0` if they are equal. `a - b` does exactly that:

sort.js

```ts
const numbers = [10, 9, 1, 100, 25];

console.log(numbers.toSorted((a, b) => a - b));   // smallest first
console.log(numbers.toSorted((a, b) => b - a));   // largest first
console.log(numbers);                             // unchanged

const names = ["bola", "Ada", "émile", "Chen"];
console.log(names.toSorted());
console.log(names.toSorted((a, b) => a.localeCompare(b)));
```

Output of `node sort.js` and of the browser terminal

```json
[ 1, 9, 10, 25, 100 ]
[ 100, 25, 10, 9, 1 ]
[ 10, 9, 1, 100, 25 ]
[ 'Ada', 'Chen', 'bola', 'émile' ]
[ 'Ada', 'bola', 'Chen', 'émile' ]
```

- `sort` mutates the array. `toSorted` does the same job but gives back a sorted *copy*. Prefer `toSorted` unless you really want to change the original.
- The default order compares the text character codes, so every capital A–Z comes before every small a–z, and accented letters come after both. `a.localeCompare(b)` sorts text the way a person expects; [Strings in depth](https://zudojs.oyinlola.site/learn/js-strings#sorting) covers sorting text in other languages.

## Chaining methods

Because `map`, `filter`, `slice` and `toSorted` give back a new array, you can call the next method straight on the result. This is called **chaining**. Put each step on its own line so it reads like a recipe:

chaining.js

```ts
const words = ["  milk ", "", "BREAD", "eggs", "  ", "Milk"];

const shoppingList = words
  .map((w) => w.trim().toLowerCase())    // clean each word
  .filter((w) => w !== "")               // drop the empty ones
  .filter((w, i, all) => all.indexOf(w) === i)   // drop repeats
  .toSorted();

console.log(shoppingList);
console.log(shoppingList.join(", "));
```

Output of `node chaining.js` and of the browser terminal

```json
[ 'bread', 'eggs', 'milk' ]
bread, eggs, milk
```

The third `filter` uses all three callback arguments: the item, its index, and the whole array. It keeps an item only if this is the first place it appears. `join` is the opposite of the string method `split`: it glues the items into one string.

## Build: a student management system

A school needs a small program to keep track of students and their grades. Each student is an **object** with a name and a grade: `{ name: "Ada", grade: 91 }`. Objects get [the next lesson](https://zudojs.oyinlola.site/learn/js-data); here you only need `student.name` and `student.grade` to read the two values.

The system is a set of small functions over one array: list, add (with validation), find, average and top students.

REASON IT OUT

### Before you code: what can go wrong when adding a student?

`addStudent(name, grade)` will receive whatever a form sends. Think it through first:

- Which names should be refused? Think about empty text, spaces and names that already exist in another capitalisation.
- Which grades should be refused? Think about 101, -5, 88.5 and the string `"88"`.
- What should `averageGrade()` return for an empty class, and what would the plain formula give?
- Printing the top students needs sorting. What happens to the order of the class list if you use `sort`?

**Show the reasoning**

**Names:** trim spaces first, then refuse empty text. Compare names ignoring case, or "Ada" and "ada" become two students.

**Grades:** only whole numbers from 0 to 100. The string `"88"` should be refused too: converting it is the caller's job, and a library that silently converts will one day convert something it should not.

**Empty class:** the formula divides by `students.length`, which is 0, and `0 / 0` is `NaN`. Decide on an answer (here 0) and check for the empty list first.

**Sorting:** `sort` mutates the array, so after printing the top students the whole class list would be in grade order. `toSorted` sorts a copy and leaves the list alone.

students.js

```ts
const students = [
  { name: "Ada", grade: 91 },
  { name: "Bola", grade: 78 },
  { name: "Chen", grade: 85 },
];

function addStudent(name, grade) {
  const clean = String(name ?? "").trim();
  if (clean === "") return "rejected: name is required";
  if (!Number.isInteger(grade) || grade < 0 || grade > 100) return "rejected: grade must be 0 to 100";
  if (students.some((s) => s.name.toLowerCase() === clean.toLowerCase())) return `rejected: ${clean} exists`;
  students.push({ name: clean, grade });
  return `added ${clean}`;
}

const findStudent = (name) => students.find((s) => s.name.toLowerCase() === name.toLowerCase());

function averageGrade() {
  if (students.length === 0) return 0;
  const total = students.reduce((sum, s) => sum + s.grade, 0);
  return Math.round((total / students.length) * 10) / 10;
}

function topStudents(count) {
  return students
    .toSorted((a, b) => b.grade - a.grade)
    .slice(0, count)
    .map((s) => `${s.name} (${s.grade})`);
}

function listStudents() {
  students.forEach((s, i) => console.log(`${i + 1}. ${s.name.padEnd(6)} ${s.grade}`));
}

console.log(addStudent("  Dayo ", 95));
console.log(addStudent("ada", 50));
console.log(addStudent("", 70));
console.log(addStudent("Emeka", 101));
console.log(addStudent("Femi", "88"));
listStudents();
console.log("Find chen:", findStudent("chen"));
console.log("Find zara:", findStudent("zara"));
console.log("Average:", averageGrade());
console.log("Top 2:", topStudents(2));
```

Output of `node students.js` and of the browser terminal

```ts
added Dayo
rejected: ada exists
rejected: name is required
rejected: grade must be 0 to 100
rejected: grade must be 0 to 100
1. Ada    91
2. Bola   78
3. Chen   85
4. Dayo   95
Find chen: { name: 'Chen', grade: 85 }
Find zara: undefined
Average: 87.3
Top 2: [ 'Dayo (95)', 'Ada (91)' ]
```

Read the output from top to bottom:

- `"  Dayo "` was trimmed before it was saved. `"ada"` was refused because `some` found an existing Ada; the check ignores case.
- `101` and the string `"88"` were both refused. A grade from a form arrives as text; the caller must convert it with `Number` first, and the function does not guess.
- `find` returned the whole student object, or `undefined` for a name that does not exist. A caller must check for `undefined` before using the result.
- The average is (91 + 78 + 85 + 95) / 4 = 87.25, rounded to one decimal. The `students.length === 0` guard avoids dividing by zero, which would give `NaN`.
- `topStudents` uses `toSorted`, so the list order printed by `listStudents` is not disturbed.

## Practice

TRY IT YOURSELF

### Who passed?

Using the same kind of student list, print the names of the students with a grade of 80 or more, as one comma-separated string.

**Show a solution**

passed.js

```ts
const students = [
  { name: "Ada", grade: 91 },
  { name: "Bola", grade: 78 },
  { name: "Chen", grade: 85 },
];

const passed = students
  .filter((s) => s.grade >= 80)
  .map((s) => s.name)
  .join(", ");

console.log(passed);
```

Output of `node passed.js` and of the browser terminal

```ts
Ada, Chen
```

TRY IT YOURSELF

### Remove a student

Write `removeStudent(name)` that removes the student with that name from the array and returns `true`, or returns `false` when there is no such student.

**Show a solution**

remove.js

```ts
const students = [
  { name: "Ada", grade: 91 },
  { name: "Bola", grade: 78 },
];

function removeStudent(name) {
  const index = students.findIndex((s) => s.name === name);
  if (index === -1) return false;
  students.splice(index, 1);
  return true;
}

console.log(removeStudent("Ada"), removeStudent("Zara"));
console.log(students);
```

Output of `node remove.js` and of the browser terminal

```ts
true false
[ { name: 'Bola', grade: 78 } ]
```

Always check for `-1` before you use the index. `students.splice(-1, 1)` would silently remove the *last* student.

TRY IT YOURSELF

### Count by grade band

With `reduce`, count how many grades in `[91, 78, 85, 95, 62, 70]` are 80 or more, and how many are below 80. Print both numbers.

**Show a solution**

bands.js

```ts
const grades = [91, 78, 85, 95, 62, 70];

const high = grades.reduce((count, g) => (g >= 80 ? count + 1 : count), 0);
const low = grades.length - high;

console.log(`80 or more: ${high}, below 80: ${low}`);
```

Output of `node bands.js` and of the browser terminal

```ts
80 or more: 3, below 80: 3
```

`grades.filter((g) => g >= 80).length` gives the same number and may read more clearly. Both are fine.

## Recap

- An array is an ordered list. Items are read by index from 0; `.length` counts them; `at(-1)` is the last one.
- `push`/`pop` work at the end, `unshift`/`shift` at the start. `slice` copies; `splice` changes the array.
- `includes` and `indexOf` look for a value; `find`, `findIndex`, `some` and `every` take a callback.
- `map` transforms, `filter` keeps some items, `reduce` combines them into one value. Give `reduce` a starting value.
- Default `sort` compares as text. Pass `(a, b) => a - b` for numbers, and prefer `toSorted`, which does not mutate.

Next, [Objects and JSON](https://zudojs.oyinlola.site/learn/js-data): group named values into objects and send them over the network as JSON.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
