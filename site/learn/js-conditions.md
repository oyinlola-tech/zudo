---
title: "Making decisions"
description: "Let your program choose what to do with if, else if and else, the ternary operator and switch, and keep decisions readable with guard clauses."
source: https://zudojs.oyinlola.site/learn/js-conditions
---

LESSON 8 OF 84

JavaScript fundamentals Foundation

# Making decisions

Let your program choose what to do with if, else if and else, the ternary operator and switch, and keep decisions readable with guard clauses.

- **30 min** to read and try
- **You need:** The lessons Values, variables and types and Operators
- **You build:** An age verification function, tested with valid and invalid inputs

  [Test yourself](#test)

## if and else

So far every line of your programs ran, top to bottom. Real programs have to choose: save the task, or reject it because the title is empty. An `if` statement runs a block of code only when a **condition** is truthy:

if.js

```ts
const title = "";

if (title.trim() === "") {
  console.log("A task needs a title");
}

console.log("This line always runs");
```

Output of `node if.js` and of the browser terminal

```ts
A task needs a title
This line always runs
```

The condition goes in parentheses. The code to run goes in a **block**, between `{` and `}`. Indent the code inside a block by two spaces so you can see at a glance what belongs to the `if`.

Add `else` to say what happens when the condition is falsy. Exactly one of the two blocks runs:

if-else.js

```ts
const title = "Buy milk";

if (title.trim() === "") {
  console.log("A task needs a title");
} else {
  console.log(`Saving "${title}"`);
}
```

Output of `node if-else.js` and of the browser terminal

```ts
Saving "Buy milk"
```

The condition does not have to be a boolean. JavaScript converts it using the truthy and falsy rules from [the first lesson of this part](https://zudojs.oyinlola.site/learn/js-values#booleans). `if (title)` is true for any non-empty string. That is handy, but be careful with numbers: `if (count)` is false when `count` is `0`.

## Several choices with else if

When there are more than two possibilities, chain them with `else if`. JavaScript tests the conditions from top to bottom and runs only the first block whose condition is truthy. `else` at the end catches everything else.

else-if.js

```ts
const hoursLeft = 5;

if (hoursLeft < 0) {
  console.log("Overdue");
} else if (hoursLeft < 24) {
  console.log("Due today");
} else if (hoursLeft < 24 * 7) {
  console.log("Due this week");
} else {
  console.log("Due later");
}
```

Output of `node else-if.js` and of the browser terminal

```ts
Due today
```

`5` is also less than `24 * 7`, but "Due this week" did not print: once one branch runs, the others are skipped. So the order matters. Put the most specific conditions first.

### Nested conditions

A block can contain another `if`. This is called **nesting**:

nested.js

```ts
const loggedIn = true;
const role = "viewer";

if (loggedIn) {
  if (role === "admin") {
    console.log("Show the admin panel");
  } else {
    console.log("Show the normal dashboard");
  }
} else {
  console.log("Show the login page");
}
```

Output of `node nested.js` and of the browser terminal

```ts
Show the normal dashboard
```

One level of nesting is fine. Three or four levels become hard to follow. The section on guard clauses below shows how to flatten them.

## The ternary operator

Sometimes you only want to choose between two *values*. The **ternary operator** `condition ? a : b` gives `a` when the condition is truthy and `b` otherwise. It is called "ternary" because it takes three parts.

ternary.js

```ts
const done = true;
const count = 1;

const mark = done ? "x" : " ";
console.log(`[${mark}] Buy milk`);
console.log(`${count} ${count === 1 ? "task" : "tasks"} left`);
```

Output of `node ternary.js` and of the browser terminal

```json
[x] Buy milk
1 task left
```

Use a ternary for a short choice between two values. For anything longer, or for choices that *do* things (print, save, delete), use `if`. Never nest ternaries inside ternaries; they quickly become unreadable.

## switch

When you compare one value against many fixed options, `switch` can be clearer than a long `else if` chain. It compares with `===`:

switch.js

```ts
const status = "in_progress";

switch (status) {
  case "todo":
    console.log("Not started");
    break;
  case "in_progress":
  case "review":
    console.log("Someone is working on it");
    break;
  case "done":
    console.log("Finished");
    break;
  default:
    console.log(`Unknown status: ${status}`);
}
```

Output of `node switch.js` and of the browser terminal

```ts
Someone is working on it
```

- Each `case` is one possible value. `default` runs when no case matches, like `else`.
- `break` leaves the `switch`. Two cases with nothing between them, like `"in_progress"` and `"review"`, share the same code.

> Forgetting break
>
> Without `break`, JavaScript does not stop at the end of a case. It "falls through" and keeps running the code of the next cases too:

fallthrough.js

```ts
const level = "warn";

switch (level) {
  case "error":
    console.log("page the on-call engineer");
  case "warn":
    console.log("write to the error log");
  case "info":
    console.log("write to the normal log");
}
```

Output of `node fallthrough.js` and of the browser terminal

```ts
write to the error log
write to the normal log
```

Here the fall through is deliberate: a warning is also written to the normal log. Most of the time it is a bug. If you let cases fall through on purpose, add a comment saying so.

## Guard clauses

Decisions usually live inside a **function**: a named piece of code that takes inputs and gives back a result with `return`. Functions get [their own lesson](https://zudojs.oyinlola.site/learn/js-functions); for now you only need this shape:

function-shape.js

```ts
function describe(count) {
  return `${count} tasks`;
}

console.log(describe(3));
```

Output of `node function-shape.js` and of the browser terminal

```ts
3 tasks
```

`count` is a **parameter**: a variable that gets the value you pass in the parentheses when you call the function. `return` ends the function and hands back a value.

Because `return` ends the function straight away, you can check the bad cases first and leave early. Each early check is called a **guard clause**. Compare the nested version with the guarded one:

guard.js

```ts
function canEditNested(user, task) {
  if (user) {
    if (task.ownerId === user.id) {
      if (!task.locked) {
        return "yes";
      } else {
        return "no: task is locked";
      }
    } else {
      return "no: not your task";
    }
  } else {
    return "no: not logged in";
  }
}

function canEdit(user, task) {
  if (!user) return "no: not logged in";
  if (task.ownerId !== user.id) return "no: not your task";
  if (task.locked) return "no: task is locked";
  return "yes";
}

const ada = { id: 1 };
const task = { ownerId: 1, locked: false };

console.log(canEditNested(ada, task), "|", canEdit(ada, task));
console.log(canEditNested(null, task), "|", canEdit(null, task));
console.log(canEdit({ id: 2 }, task));
console.log(canEdit(ada, { ownerId: 1, locked: true }));
```

Output of `node guard.js` and of the browser terminal

```ts
yes | yes
no: not logged in | no: not logged in
no: not your task
no: task is locked
```

Both functions give the same answers, but the second one reads like a checklist: every rule is one line, and the happy path is the last line. When a block is a single statement you may leave out the braces, as in `if (!user) return …;`. Keep that for one-line guards.

> TIP
>
> Notice that `canEdit` starts from "no" and returns "yes" only after every check passed. For anything about permissions, always fail closed: when in doubt, refuse.

## Build: age verification

A sign-up form asks for the user's age. The value arrives as text, typed by a stranger, so it can be anything. The rules:

- The age must be present, a whole number, and between 0 and 130. Otherwise, reject the input with a clear reason.
- Under 13: the user cannot sign up.
- 13 to 17: they can sign up with a parent's consent.
- 18 or older: they can sign up.

First validate the input with guard clauses, then decide. Test the function with many inputs, including bad ones, and print each result:

age-check.js

```ts
function checkAge(input) {
  if (input === undefined || input === null) return "invalid: age is required";

  const text = String(input).trim();
  if (text === "") return "invalid: age is required";

  const age = Number(text);
  if (!Number.isInteger(age)) return "invalid: age must be a whole number";
  if (age < 0 || age > 130) return "invalid: age must be between 0 and 130";

  if (age < 13) return "rejected: too young";
  if (age < 18) return "allowed with parental consent";
  return "allowed";
}

console.log("25    ->", checkAge("25"));
console.log("18    ->", checkAge("18"));
console.log("17    ->", checkAge("17"));
console.log("13    ->", checkAge(" 13 "));
console.log("12    ->", checkAge("12"));
console.log("''    ->", checkAge(""));
console.log("null  ->", checkAge(null));
console.log("abc   ->", checkAge("abc"));
console.log("17.5  ->", checkAge("17.5"));
console.log("-4    ->", checkAge("-4"));
console.log("200   ->", checkAge(200));
```

Output of `node age-check.js` and of the browser terminal

```ts
25    -> allowed
18    -> allowed
17    -> allowed with parental consent
13    -> allowed with parental consent
12    -> rejected: too young
''    -> invalid: age is required
null  -> invalid: age is required
abc   -> invalid: age must be a whole number
17.5  -> invalid: age must be a whole number
-4    -> invalid: age must be between 0 and 130
200   -> invalid: age must be between 0 and 130
```

Walk through a few lines of the output:

- `"abc"` becomes `NaN`, and `Number.isInteger(NaN)` is `false`, so one check rejects both text and decimals.
- The empty string needs its own check, because `Number("")` is `0`, as you saw in the first lesson. Without that guard, an empty form would say "rejected: too young".
- The boundary values `18`, `17`, `13` and `12` are tested on purpose. Bugs love the edges: `<` where you meant `<=`.
- The decision part is only three lines, because the guards already threw out every bad input.

> NOTE
>
> A real sign-up form should not trust an age typed by the user for anything that matters legally. The point here is the shape: validate every outside input first, then decide.

## Practice

TRY IT YOURSELF

### Grade letters

Write a function `grade(score)` that returns `"A"` for 90 and above, `"B"` for 80 to 89, `"C"` for 70 to 79 and `"F"` below 70. Test it with 95, 90, 89, 70 and 12.

**Show a solution**

grade.js

```ts
function grade(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  return "F";
}

console.log(grade(95), grade(90), grade(89), grade(70), grade(12));
```

Output of `node grade.js` and of the browser terminal

```ts
A A B C F
```

Because each guard returns, the later checks do not need an upper limit: by the time `score >= 80` runs, you already know it is below 90.

TRY IT YOURSELF

### HTTP status names

Write `statusText(code)` with a `switch` that returns `"OK"` for 200, `"Created"` for 201, `"Not Found"` for 404 and `"Unknown"` for anything else.

**Show a solution**

status-text.js

```ts
function statusText(code) {
  switch (code) {
    case 200:
      return "OK";
    case 201:
      return "Created";
    case 404:
      return "Not Found";
    default:
      return "Unknown";
  }
}

console.log(statusText(200), "|", statusText(404), "|", statusText("200"));
```

Output of `node status-text.js` and of the browser terminal

```ts
OK | Not Found | Unknown
```

Inside a function, `return` also leaves the `switch`, so no `break` is needed. `"200"` is a string, and `switch` uses `===`, so it does not match `200`.

TRY IT YOURSELF

### Shipping cost

Write `shipping(total, country)`: orders of 50 or more ship free; otherwise shipping is 5 inside `"NG"` and 15 elsewhere. Reject a total that is not a positive number with `"invalid total"`. Use guard clauses.

**Show a solution**

shipping.js

```ts
function shipping(total, country) {
  if (typeof total !== "number" || !(total > 0)) return "invalid total";
  if (total >= 50) return 0;
  return country === "NG" ? 5 : 15;
}

console.log(shipping(80, "GB"), shipping(20, "NG"), shipping(20, "GB"));
console.log(shipping(-5, "NG"), shipping(NaN, "NG"), shipping("80", "NG"));
```

Output of `node shipping.js` and of the browser terminal

```ts
0 5 15
invalid total invalid total invalid total
```

`!(total > 0)` is true for negative numbers, zero and `NaN`, because every comparison with `NaN` is false.

## Recap

- `if` runs a block when its condition is truthy; `else if` and `else` add more branches, and only the first match runs.
- `condition ? a : b` chooses between two values. Keep it short.
- `switch` compares one value with `===` against many cases. Remember `break`.
- Guard clauses check the bad cases first and `return` early, which keeps code flat.
- Validate every outside input before you make a decision with it, and test the edges.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
