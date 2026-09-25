---
title: "Loops — ZudoJS Academy"
description: "Repeat work with for, while, do...while, for...of and for...in, control a loop with break and continue, and build a number guessing game."
source: https://zudojs.oyinlola.site/learn/js-loops
---

LEVEL 2 · LESSON 7 OF 19

Control flow Foundation

# Loops

Repeat work with for, while, do...while, for...of and for...in, control a loop with break and continue, and build a number guessing game.

- **35 min** to read and try
- **You need:** The lessons up to Making decisions
- **You build:** A number guessing game, tested with a fixed list of guesses, that you can also play in your terminal

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Repeat work with for, while and do...while, and make sure every loop ends
- Loop over lists and strings with for...of, and over object keys with for...in
- Control a loop with break, continue and labels
- Choose the right loop for a job
- Separate a program's rules from its input so a loop can be tested with fixed data

## Why loops exist

Say you want to print the numbers 1 to 5. You could write five `console.log` lines. But what about 1 to 1000? Or one line for every task in a list whose length you do not know yet? A **loop** runs the same block of code again and again, as long as you need. Each run of the block is called an **iteration**.

## The for loop

The classic `for` loop is best when you know how many times to repeat. Its parentheses hold three parts, separated by semicolons:

for.js

```ts
for (let i = 1; i <= 5; i++) {
  console.log(`Iteration ${i}`);
}
console.log("Loop finished");
```

Output of `node for.js` and of the browser terminal

```ts
Iteration 1
Iteration 2
Iteration 3
Iteration 4
Iteration 5
Loop finished
```

1. `let i = 1` runs once, before the loop starts. It creates the **counter**.
2. `i <= 5` is checked before every iteration. When it is false, the loop stops.
3. `i++` runs after every iteration and moves the counter on. You saw `++` in [the lesson on operators](https://zudojs.oyinlola.site/learn/js-operators#arithmetic).

The counter does not have to go up by one. Here it counts down, and adds up a total on the way:

for-sum.js

```ts
let total = 0;
for (let n = 10; n > 0; n -= 2) {
  total += n;
  console.log(`n=${n} total=${total}`);
}
```

Output of `node for-sum.js` and of the browser terminal

```ts
n=10 total=10
n=8 total=18
n=6 total=24
n=4 total=28
n=2 total=30
```

## while and do...while

A `while` loop repeats as long as its condition is truthy. Use it when you do not know in advance how many iterations you need, only when to stop:

while.js

```ts
let balance = 100;
let months = 0;

while (balance < 200) {
  balance = balance * 1.1;   // grows 10% a month
  months++;
}

console.log(`${months} months, balance ${balance.toFixed(2)}`);
```

Output of `node while.js` and of the browser terminal

```ts
8 months, balance 214.36
```

The condition is checked *before* each iteration. If it is false from the start, the body never runs. A `do...while` loop checks *after* each iteration, so its body always runs at least once:

do-while.js

```ts
let tries = 0;

while (tries > 0) {
  console.log("while body");       // never runs
}

do {
  tries++;
  console.log(`do...while body, try ${tries}`);
} while (tries < 0);
```

Output of `node do-while.js` and of the browser terminal

```ts
do...while body, try 1
```

You will rarely need `do...while`. It fits "do this, then ask whether to do it again", like asking a user for input until it is valid.

> Infinite loops
>
> If the condition never becomes false, the loop never ends and your program hangs. `while (balance < 200)` without the line that changes `balance` would run forever. Always check that something inside the loop moves it towards the end. If your program hangs in the terminal, press Ctrl+C to stop it.

## for...of: one iteration per item

Most of the time you loop over a list of things. `for...of` gives you each item in turn, with no counter to manage. You met it briefly in [Values, variables and types](https://zudojs.oyinlola.site/learn/js-values#booleans):

for-of.js

```ts
const titles = ["Buy milk", "Write report", "Call Ada"];

for (const title of titles) {
  console.log(`- ${title}`);
}

for (const letter of "abc") {
  console.log(letter.toUpperCase());
}
```

Output of `node for-of.js` and of the browser terminal

```ts
- Buy milk
- Write report
- Call Ada
A
B
C
```

The square brackets make an **array**, an ordered list; [arrays](https://zudojs.oyinlola.site/learn/js-arrays) come two lessons from now. `for...of` also works on strings, one character at a time. You can use `const` for the loop variable because each iteration gets a fresh one.

### for...in: the keys of an object

`for...in` loops over the **keys** (the property names) of an object. `task[key]` reads the property whose name is stored in `key`:

for-in.js

```ts
const task = { title: "Buy milk", done: false, priority: 2 };

for (const key in task) {
  console.log(`${key}: ${task[key]}`);
}
```

Output of `node for-in.js` and of the browser terminal

```ts
title: Buy milk
done: false
priority: 2
```

> Do not use for...in on arrays
>
> On an array, `for...in` gives you the positions as *strings* (`"0"`, `"1"`, …), not the items. Use `for...of` for arrays. In [the lesson on objects](https://zudojs.oyinlola.site/learn/js-data) you will also see `Object.entries`, which is often clearer than `for...in`.

## break and continue

Two keywords change the flow inside any loop:

- `break` stops the whole loop immediately.
- `continue` skips the rest of this iteration and goes on with the next one.

break-continue.js

```ts
const tasks = ["Buy milk", "", "Write report", "STOP", "Call Ada"];

for (const title of tasks) {
  if (title === "") {
    console.log("(skipping an empty title)");
    continue;
  }
  if (title === "STOP") {
    console.log("(stop marker found)");
    break;
  }
  console.log(`Saving "${title}"`);
}
```

Output of `node break-continue.js` and of the browser terminal

```ts
Saving "Buy milk"
(skipping an empty title)
Saving "Write report"
(stop marker found)
```

`"Call Ada"` was never reached, because `break` ended the loop. `continue` works like a guard clause from [the previous lesson](https://zudojs.oyinlola.site/learn/js-conditions#guard-clauses), but for one iteration.

## Nested loops

A loop can sit inside another loop. For every iteration of the outer loop, the inner loop runs completely:

nested.js

```ts
for (let row = 1; row <= 3; row++) {
  let line = `row ${row}:`;
  for (let col = 1; col <= 4; col++) {
    line += String(row * col).padStart(4);
  }
  console.log(line);
}
```

Output of `node nested.js` and of the browser terminal

```ts
row 1:   1   2   3   4
row 2:   2   4   6   8
row 3:   3   6   9  12
```

That is a small multiplication table. `padStart(4)` pads each number with spaces to 4 characters, so the columns line up. 3 outer iterations × 4 inner iterations = 12 cells. Nested loops multiply quickly: two loops over 1000 items each make a million iterations.

### Leaving nested loops with a label

A `break` inside the inner loop only stops the inner loop; the outer one carries on. To stop both at once, put a **label** (a name followed by a colon) in front of the outer loop and name it in the `break`. `continue` takes a label too. Here a warehouse looks for the first shelf that still has rice:

labels.js

```ts
const shelves = [
  ["beans", "oil"],
  ["salt", "rice", "sugar"],
  ["rice", "garri"],
];

let found = "not in stock";
search: for (let s = 0; s < shelves.length; s++) {
  for (let slot = 0; slot < shelves[s].length; slot++) {
    console.log(`checking shelf ${s}, slot ${slot}`);
    if (shelves[s][slot] === "rice") {
      found = `shelf ${s}, slot ${slot}`;
      break search;
    }
  }
}
console.log("rice:", found);
```

Output of `node labels.js` and of the browser terminal

```ts
checking shelf 0, slot 0
checking shelf 0, slot 1
checking shelf 1, slot 0
checking shelf 1, slot 1
rice: shelf 1, slot 1
```

The search stopped at the first rice, and shelf 2 was never checked. Without the label, `break` would only have left shelf 1's inner loop, and the outer loop would have gone on to shelf 2 and overwritten `found`. Labels are rare in everyday code: often the cleaner fix is to put the loops in a function and `return` as soon as you find the answer, which you will do in [Functions](https://zudojs.oyinlola.site/learn/js-functions).

## Choosing the right loop

- **`for...of`**: you have a list (or a string) and want each item. This is the one you will use most.
- **`for`**: you need a counter, a fixed number of repeats, or the position of each item.
- **`while`**: you repeat until something happens, and you cannot know in advance how many times.
- **`do...while`**: like `while`, but the body must run at least once.
- **`for...in`**: the keys of an object. Never for arrays.

In [the lesson on arrays](https://zudojs.oyinlola.site/learn/js-arrays) you will meet methods like `map` and `filter`, which replace many loops with one line.

## Build: a number guessing game

The computer picks a secret number from 1 to 100. The player guesses; after each guess the game says "too low", "too high" or "correct". The player has 7 tries.

REASON IT OUT

### Before you code: what counts as a try?

Before writing the game, decide its rules for the awkward cases. A test can only check rules you have decided.

- The player types `fifty`, an empty line, `12.5` or `150`. Should any of those use up one of the 7 tries?
- When exactly does the loop stop? List every way the game can end.
- How can you test a game whose secret number is random and whose input comes from a keyboard?

**Show the reasoning**

**Bad input:** none of these is a real guess, so none should cost a try; the game should say what was wrong and ask again. That is a `continue`: skip the rest of this turn without counting it.

**Ways to end:** the guess is correct (the player wins), or the seventh real guess was wrong (the player loses). When the guesses come from a fixed list, there is a third: the list runs out. Each ending needs its own line of code, or the loop runs on too long or stops too early.

**Testing:** make the unknowns into parameters. The rules go in a function that receives the secret and the guesses, so a test can pass `42` and `["50", "25", "abc"]` and know the right answer in advance. Only a thin outer part touches `Math.random()` and the keyboard.

A game that reads the keyboard is hard to test, because a test cannot type. So split it in two: a function with the rules, which you can test with a fixed list of guesses, and a small interactive shell around it.

### Step 1: the rules, tested

guess-game.js

```ts
function checkGuess(secret, input) {
  const guess = Number(input);
  if (String(input).trim() === "" || !Number.isInteger(guess)) return "not a whole number";
  if (guess < 1 || guess > 100) return "out of range (1 to 100)";
  if (guess < secret) return "too low";
  if (guess > secret) return "too high";
  return "correct";
}

function play(secret, guesses, maxTries = 7) {
  let tries = 0;
  for (const input of guesses) {
    const result = checkGuess(secret, input);
    if (result !== "too low" && result !== "too high" && result !== "correct") {
      console.log(`  ${input}: ${result}, try again`);
      continue;                     // a bad guess does not cost a try
    }
    tries++;
    console.log(`  try ${tries}: ${input} is ${result}`);
    if (result === "correct") return `won in ${tries} tries`;
    if (tries === maxTries) return `lost, the number was ${secret}`;
  }
  return "gave up";
}

console.log("Game 1:", play(42, ["50", "25", "abc", "37", "43", "40", "42"]));
console.log("Game 2:", play(99, ["10", "20", "30", "40", "50", "60", "70", "80"]));
console.log("Game 3:", play(7, ["7"]));
```

Output of `node guess-game.js` and of the browser terminal

```ts
  try 1: 50 is too high
  try 2: 25 is too low
  abc: not a whole number, try again
  try 3: 37 is too low
  try 4: 43 is too high
  try 5: 40 is too low
  try 6: 42 is correct
Game 1: won in 6 tries
  try 1: 10 is too low
  try 2: 20 is too low
  try 3: 30 is too low
  try 4: 40 is too low
  try 5: 50 is too low
  try 6: 60 is too low
  try 7: 70 is too low
Game 2: lost, the number was 99
  try 1: 7 is correct
Game 3: won in 1 tries
```

Look at how the output shows every rule working:

- Game 1: `"abc"` was rejected without using up a try (that is the `continue`), and the loop stopped at the correct guess (that is the `return`).
- Game 2: after 7 tries the game ended, even though an eighth guess, `"80"`, was in the list.
- Game 3 prints "1 tries". That is a small bug the test found. Exercise 1 below fixes it.

Because the secret is a parameter, the test chooses it. In the real game it comes from `Math.random()`.

### Step 2: play it in your terminal

To read what the player types, Node.js has a built-in module, `node:readline/promises`. This needs Node.js, so it does not run in the browser terminal. `await` pauses until the player presses Enter; the [lesson on asynchronous JavaScript](https://zudojs.oyinlola.site/learn/js-async) explains how it works. For now, copy the lines as they are.

guess.jsNode.js only

```ts
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

function checkGuess(secret, input) {
  const guess = Number(input);
  if (String(input).trim() === "" || !Number.isInteger(guess)) return "not a whole number";
  if (guess < 1 || guess > 100) return "out of range (1 to 100)";
  if (guess < secret) return "too low";
  if (guess > secret) return "too high";
  return "correct";
}

const secret = Math.floor(Math.random() * 100) + 1;
const maxTries = 7;
const rl = createInterface({ input: stdin, output: stdout });

console.log("I picked a number from 1 to 100. You have 7 tries.");
let tries = 0;
while (tries < maxTries) {
  const input = await rl.question(`Guess ${tries + 1}: `);
  const result = checkGuess(secret, input);
  if (result !== "too low" && result !== "too high" && result !== "correct") {
    console.log(`${result}, try again`);
    continue;
  }
  tries++;
  if (result === "correct") {
    console.log(`Correct! You needed ${tries} ${tries === 1 ? "try" : "tries"}.`);
    break;
  }
  console.log(result);
  if (tries === maxTries) console.log(`Out of tries. The number was ${secret}.`);
}
rl.close();
```

Save it as `guess.js` in the `hello-zudo` folder you made in [Set up your computer](https://zudojs.oyinlola.site/learn/setup). That folder's `package.json` has `"type": "module"`, which `import` and top-level `await` need. Run it and play. Your secret number and guesses will be different; one real game looked like this:

Terminal on your computer

```bash
$ node guess.js
I picked a number from 1 to 100. You have 7 tries.
Guess 1: fifty
not a whole number, try again
Guess 1: 50
too low
Guess 2: 75
too high
Guess 3: 62
too high
Guess 4: 56
too high
Guess 5: 53
too high
Guess 6: 51
too low
Guess 7: 52
Correct! You needed 7 tries.
```

A clever player always guesses the middle of the numbers that are left. That halves the range each time, so 7 tries are always enough for 100 numbers: 7 halvings can find the secret among up to 127 numbers (2 to the power of 7, minus 1). This idea, called binary search, returns in [Linear and binary search](https://zudojs.oyinlola.site/learn/dsa-searching).

## Practice

TRY IT YOURSELF

### Fix “1 tries”

Change `play` so that it prints `won in 1 try` for one guess and `won in 3 tries` for three.

**Show a solution**

Only the winning line changes. Choose the word with a ternary:

guess-plural.js

```ts
function wonMessage(tries) {
  return `won in ${tries} ${tries === 1 ? "try" : "tries"}`;
}

console.log(wonMessage(1));
console.log(wonMessage(3));
```

Output of `node guess-plural.js` and of the browser terminal

```ts
won in 1 try
won in 3 tries
```

In `play`, replace `return \`won in ${tries} tries\`;` with `return wonMessage(tries);`.

TRY IT YOURSELF

### FizzBuzz

Print the numbers 1 to 15, but print `Fizz` for multiples of 3, `Buzz` for multiples of 5 and `FizzBuzz` for multiples of both. Put everything on one line, separated by spaces.

**Show a solution**

fizzbuzz.js

```ts
let line = "";
for (let i = 1; i <= 15; i++) {
  if (i % 15 === 0) line += "FizzBuzz ";
  else if (i % 3 === 0) line += "Fizz ";
  else if (i % 5 === 0) line += "Buzz ";
  else line += `${i} `;
}
console.log(line.trim());
```

Output of `node fizzbuzz.js` and of the browser terminal

```ts
1 2 Fizz 4 Buzz Fizz 7 8 Fizz Buzz 11 Fizz 13 14 FizzBuzz
```

The check for 15 must come first. Otherwise 15 would match "multiple of 3" and stop there.

TRY IT YOURSELF

### First long title

Given `["Buy milk", "Call Ada", "Write the quarterly report", "Pay rent"]`, find and print the first title longer than 10 characters and its position, then stop looking.

**Show a solution**

first-long.js

```ts
const titles = ["Buy milk", "Call Ada", "Write the quarterly report", "Pay rent"];

for (let i = 0; i < titles.length; i++) {
  if (titles[i].length > 10) {
    console.log(`Found at position ${i}: ${titles[i]}`);
    break;
  }
}
```

Output of `node first-long.js` and of the browser terminal

```ts
Found at position 2: Write the quarterly report
```

You need the position, so a counting `for` loop fits. `titles[i]` reads the item at position `i`, and `titles.length` is how many items there are.

## Recap

- A loop repeats a block. Each run is an iteration.
- `for` has a counter; `while` repeats until a condition fails; `do...while` always runs once.
- `for...of` gives each item of a list or string; `for...in` gives the keys of an object.
- `break` stops the loop; `continue` skips to the next iteration. A label (`outer:`) lets them reach an outer loop.
- Make sure every loop moves towards its end, or it runs forever.
- Put logic in a function you can test with fixed input, and keep the keyboard part thin.

Next, [Functions](https://zudojs.oyinlola.site/learn/js-functions): package logic into reusable, testable pieces.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
