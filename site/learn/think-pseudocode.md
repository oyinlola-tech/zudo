---
title: "Pseudocode and flowcharts — ZudoJS Academy"
description: "Write an algorithm as pseudocode and as a flowchart, trace it by hand, find its missing paths, and translate it line by line into working JavaScript."
source: https://zudojs.oyinlola.site/learn/think-pseudocode
---

LEVEL 1 · LESSON 8 OF 18

Think like a programmer Foundation

# Pseudocode and flowcharts

Write an algorithm as pseudocode and as a flowchart, trace it by hand, find its missing paths, and translate it line by line into working JavaScript.

- **45 min** to read and try
- **You need:** Algorithms
- **You build:** An ATM withdrawal designed as pseudocode and a flowchart, traced, tested and translated into JavaScript

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Write an algorithm in pseudocode using START, INPUT, OUTPUT, SET, IF, ELSE, WHILE and END conventions
- Draw and read a flowchart with terminators, processes, decisions, input/output and loops
- Trace a flowchart or pseudocode by hand with a trace table
- Translate pseudocode into JavaScript line by line
- Derive test cases from the paths through a flowchart

## Three people, one set of rules

A microfinance bank is adding ATMs to its branches. The branch manager explains the withdrawal rules in an email:

Customers can take money out if they have enough in their account, but not more than ₦20,000 at a time, and it has to be something the machine can pay out: it only holds ₦500 and ₦1,000 notes. Obviously nothing happens if their card is blocked.

Three people must now agree on what this means: the manager, who knows the rules but does not read code; a tester, who has to check the machine does the right thing; and you, the developer. The email is too loose: does "enough" include exactly the balance? What message does the customer see, and which one first, if two rules fail at once? JavaScript would be precise, but the manager cannot read it and the tester should not have to.

Programmers solve this with two tools that sit between plain English and code. **Pseudocode** writes the algorithm as structured text. A **flowchart** draws it as a picture. Both are precise enough to argue about, and simple enough for anyone in the room to follow. This lesson teaches both, using the withdrawal as the example throughout.

## Pseudocode

**Pseudocode** ("pseudo" means "pretend") is an algorithm written in plain language with a few fixed keywords and indentation. It has no strict grammar and no computer runs it. What it has is *conventions*: the same word always means the same thing, so any reader understands it the same way.

These are the conventions this course uses. They are the most common ones in textbooks and exams:

| Pseudocode | Meaning |
| --- | --- |
| `START` … `END` | Where the algorithm begins and ends. |
| `INPUT balance, amount` | These values come in from outside. |
| `OUTPUT "Insufficient funds"` | Show, print or send this. |
| `SET balance TO balance - amount` | Work out a value and remember it under a name. |
| `IF` … `THEN` / `ELSE IF` … `THEN` / `ELSE` / `END IF` | A decision. Only the first branch whose condition is true runs. |
| `WHILE` … `DO` / `END WHILE` | Repeat the indented steps as long as the condition is true. |
| `FOR EACH` item `IN` list / `END FOR` | Repeat the indented steps once for every item. |

Four habits make pseudocode useful:

- **One action per line.** If a line needs "and", it is probably two lines.
- **Indent what is inside.** The steps inside an `IF` or a `WHILE` are indented, so you can see where the block ends.
- **Precise conditions.** Write `amount > 20000`, not "if the amount is too big".
- **No language details.** No semicolons, no brackets, no `console.log`. Anyone, in any language, should be able to follow it.

Here is the manager's email as pseudocode. Writing it forced three decisions the email never made: the order of the checks, the exact message for each, and that taking exactly the balance is allowed.

```ts
START
  INPUT cardBlocked, balance, amount
  IF cardBlocked THEN
    OUTPUT "Card blocked. Contact your bank."
  ELSE IF amount > 20000 THEN
    OUTPUT "The most you can take at once is ₦20000"
  ELSE IF amount is not a multiple of 500 THEN
    OUTPUT "Amount must be a multiple of ₦500"
  ELSE IF amount > balance THEN
    OUTPUT "Insufficient funds"
  ELSE
    SET balance TO balance - amount
    OUTPUT "Take your cash: ₦" amount
    OUTPUT "New balance: ₦" balance
  END IF
END
```

The manager can read this and say "yes, that is what I meant", or "no, check the balance before the ₦20,000 limit". Either answer is progress, and it happened before anyone wrote code.

## From pseudocode to JavaScript

Good pseudocode translates into code almost line by line. Each keyword has a JavaScript partner:

| Pseudocode | JavaScript |
| --- | --- |
| `INPUT amount` | `const amount = 5000;` (for now; later the value comes from a request or a form) |
| `SET balance TO …` | `balance = …;` (declared with `let` if it changes) |
| `IF x THEN` | `if (x) {` |
| `ELSE IF y THEN` | `} else if (y) {` |
| `ELSE` | `} else {` |
| `END IF`, `END WHILE`, `END FOR` | `}` |
| `OUTPUT …` | `console.log(…);` |
| `WHILE x DO` | `while (x) {` |
| `FOR EACH item IN list` | `for (const item of list) {` |

One line needs a new tool: "is not a multiple of 500". A number is a multiple of 500 when dividing it by 500 leaves nothing over. The **remainder operator** `%` gives what is left over after dividing:

remainder.js

```ts
console.log(1500 % 500);
console.log(1700 % 500);
console.log(20000 % 500);
console.log(7 % 2);
```

Output of `node remainder.js` and of the browser terminal

```ts
0
200
0
1
```

1,500 is exactly three 500s, so nothing is left: 0. 1,700 is three 500s with 200 left over. So "amount is not a multiple of 500" becomes `amount % 500 !== 0`. (`7 % 2` is 1 because 7 is odd: the same trick tells even numbers from odd ones.)

Now the whole withdrawal, translated line by line. Put the pseudocode next to it and you can match every line:

withdraw.js

```ts
// INPUT
const cardBlocked = false;
let balance = 15000;
const amount = 5000;

if (cardBlocked) {
  console.log("Card blocked. Contact your bank.");
} else if (amount > 20000) {
  console.log("The most you can take at once is ₦20000");
} else if (amount % 500 !== 0) {
  console.log("Amount must be a multiple of ₦500");
} else if (amount > balance) {
  console.log("Insufficient funds");
} else {
  balance = balance - amount;
  console.log("Take your cash: ₦" + amount);
  console.log("New balance: ₦" + balance);
}
```

Output of `node withdraw.js` and of the browser terminal

```ts
Take your cash: ₦5000
New balance: ₦10000
```

The translation added nothing and left nothing out. That is the sign of good pseudocode: all the thinking was done before the code, so writing the code was just typing.

## Flowcharts

A **flowchart** draws an algorithm as boxes joined by arrows. You follow the arrows from Start to End, doing what each box says. The shape of a box tells you what kind of step it is:

  The five flowchart symbols: terminator, process, decision, input/output and the arrow that shows the order.

- **Terminator** (rounded): where the algorithm starts and ends. There is one Start; there can be more than one End, but one is tidier.
- **Process** (rectangle): an action, such as a calculation. One arrow in, one arrow out.
- **Decision** (diamond): a yes/no question. One arrow in, and *two* arrows out, labelled yes and no. This is `IF`.
- **Input/output** (slanted box): data coming in or a result going out. This is `INPUT` and `OUTPUT`.
- **Arrows**: the order. Follow them; never guess.

### Branches: the withdrawal

Here is the same withdrawal algorithm as a flowchart. Each `IF` in the pseudocode is a diamond. The normal path runs straight down; every refusal leaves to the right, and all paths meet again at End.

  The withdrawal as a flowchart. The normal path runs straight down; each refusal leaves to the right and joins the path to End.

Compare it with the pseudocode. The chain of `ELSE IF`s is the column of diamonds: you only reach a diamond if every diamond above it said "no" (or, for the multiple-of-500 question, "yes"). That is exactly why `ELSE IF` reports only the *first* failed rule. The picture makes it obvious to the manager, who can now see that a customer asking for ₦25,000 hears about the limit, never about their balance.

### Loops: going back up

A loop in a flowchart is an arrow that goes back to an earlier box. Here is the savings algorithm from [What programming is](https://zudojs.oyinlola.site/learn/think-programming#practice): how many weeks of saving ₦7,500 does it take to reach a goal?

  The savings loop. The arrow on the left goes back up to the decision, which is checked before every round.

The decision sits at the top of the loop, so it is checked before every round, exactly like `WHILE … DO`. Every loop in a flowchart needs a decision on its path with an exit; an arrow that goes back with no way out is a loop that never ends. Here is the same algorithm in pseudocode and in JavaScript:

```ts
START
  INPUT goal, perWeek
  SET saved TO 0
  SET weeks TO 0
  WHILE saved < goal DO
    SET saved TO saved + perWeek
    SET weeks TO weeks + 1
  END WHILE
  OUTPUT weeks
END
```

savings.js

```ts
// INPUT
const goal = 50000;
const perWeek = 7500;

let saved = 0;
let weeks = 0;
while (saved < goal) {
  saved = saved + perWeek;
  weeks = weeks + 1;
}
console.log("Weeks:", weeks);
```

Output of `node savings.js` and of the browser terminal

```ts
Weeks: 7
```

## Tracing by hand

To **trace** an algorithm is to follow it step by step with real input values, writing down what every value is after each step. It is how you check a flowchart or pseudocode before any code exists, and later, how you find bugs in code. The tool is a **trace table**: one column per value, one row per step.

Trace the savings loop with a goal of ₦20,000 and ₦6,000 a week:

| Step | saved | weeks | saved < goal? |
| --- | --- | --- | --- |
| Start values | 0 | 0 | yes |
| After round 1 | 6000 | 1 | yes |
| After round 2 | 12000 | 2 | yes |
| After round 3 | 18000 | 3 | yes |
| After round 4 | 24000 | 4 | no: leave the loop |
| OUTPUT |  | 4 |  |

The trace predicts 4 weeks. Now run the code and compare. Printing the values inside the loop gives the same table, row by row, which is a handy way to check a trace:

savings-trace.js

```ts
const goal = 20000;
const perWeek = 6000;

let saved = 0;
let weeks = 0;
while (saved < goal) {
  saved = saved + perWeek;
  weeks = weeks + 1;
  console.log("round", weeks, "saved", saved);
}
console.log("Weeks:", weeks);
```

Output of `node savings-trace.js` and of the browser terminal

```ts
round 1 saved 6000
round 2 saved 12000
round 3 saved 18000
round 4 saved 24000
Weeks: 4
```

REASON IT OUT

### Trace the withdrawal

Using the withdrawal flowchart, trace these three customers *before* reading the answer. For each one, write which diamonds you pass through and what the machine shows.

1. Card not blocked, balance ₦12,000, amount ₦12,500.
2. Card not blocked, balance ₦30,000, amount ₦20,000.
3. Card blocked, balance ₦30,000, amount ₦25,300.

**Show the reasoning**

1. Card blocked? no. 12,500 > 20,000? no. Multiple of 500? yes (12,500 is 25 × 500). 12,500 > 12,000? yes. Output: `Insufficient funds`.
2. Blocked? no. 20,000 > 20,000? no: exactly the limit is allowed. Multiple of 500? yes. 20,000 > 30,000? no. So the balance becomes ₦10,000 and the machine pays ₦20,000.
3. Blocked? yes. Output: `Card blocked. Contact your bank.` Nothing else is checked, even though the amount breaks two other rules. The first diamond that sends you right decides the message.

Here are the three traces run through the real code, to confirm them:

withdraw-trace.js

```ts
const blockedList = [false, false, true];
const balanceList = [12000, 30000, 30000];
const amountList = [12500, 20000, 25300];

for (let i = 0; i < 3; i++) {
  const cardBlocked = blockedList[i];
  let balance = balanceList[i];
  const amount = amountList[i];

  if (cardBlocked) {
    console.log("Card blocked. Contact your bank.");
  } else if (amount > 20000) {
    console.log("The most you can take at once is ₦20000");
  } else if (amount % 500 !== 0) {
    console.log("Amount must be a multiple of ₦500");
  } else if (amount > balance) {
    console.log("Insufficient funds");
  } else {
    balance = balance - amount;
    console.log("Take your cash: ₦" + amount + ", new balance: ₦" + balance);
  }
}
```

Output of `node withdraw-trace.js` and of the browser terminal

```ts
Insufficient funds
Take your cash: ₦20000, new balance: ₦10000
Card blocked. Contact your bank.
```

The three customers are stored in three lists, one per input, in the same order, like the medicine names and stock counts in [Algorithms](https://zudojs.oyinlola.site/learn/think-algorithms#filtering). `i` goes 0, 1, 2, and position `i` of each list belongs to the same customer.

## Finding the missing path

A flowchart is also a test plan. Every different path from Start to End is a different behaviour, and each one needs at least one test. The withdrawal has five paths (four refusals and one success), so it needs at least five tests, plus the boundaries: exactly ₦20,000, exactly the balance.

But testing the paths you drew only tests the cases you thought of. The harder question is: *which inputs did nobody draw?* Try some odd amounts:

withdraw-odd.js

```ts
for (const amount of [0, -500]) {
  const cardBlocked = false;
  let balance = 15000;

  if (cardBlocked) {
    console.log("Card blocked. Contact your bank.");
  } else if (amount > 20000) {
    console.log("The most you can take at once is ₦20000");
  } else if (amount % 500 !== 0) {
    console.log("Amount must be a multiple of ₦500");
  } else if (amount > balance) {
    console.log("Insufficient funds");
  } else {
    balance = balance - amount;
    console.log("Take your cash: ₦" + amount + ", new balance: ₦" + balance);
  }
}
```

Output of `node withdraw-odd.js` and of the browser terminal

```ts
Take your cash: ₦0, new balance: ₦15000
Take your cash: ₦-500, new balance: ₦15500
```

0 is a multiple of 500 (0 × 500 = 0), and so is -500. Both slip past every diamond to the success path. The first is silly; the second *adds ₦500 to the customer's account* for withdrawing a negative amount. A real ATM keypad probably cannot type a minus sign, but the same code behind a mobile app or an API would receive whatever is sent.

The fix goes into the design first, not straight into the code: a new diamond, "amount < 500?", placed early in the column, with its own refusal. Then the pseudocode:

```ts
  ...
  ELSE IF amount < 500 THEN
    OUTPUT "The smallest amount is ₦500"
  ELSE IF amount > 20000 THEN
  ...
```

And then the code, tested on every path plus the new cases:

withdraw-tested.js

```ts
for (const amount of [5000, 25000, 5200, 18000, 0, -500, 20000, 15000]) {
  const cardBlocked = false;
  let balance = 15000;
  let message = "";

  if (cardBlocked) {
    message = "Card blocked. Contact your bank.";
  } else if (amount < 500) {
    message = "The smallest amount is ₦500";
  } else if (amount > 20000) {
    message = "The most you can take at once is ₦20000";
  } else if (amount % 500 !== 0) {
    message = "Amount must be a multiple of ₦500";
  } else if (amount > balance) {
    message = "Insufficient funds";
  } else {
    balance = balance - amount;
    message = "Take your cash, new balance: ₦" + balance;
  }
  console.log("₦" + amount, "->", message);
}
```

Output of `node withdraw-tested.js` and of the browser terminal

```ts
₦5000 -> Take your cash, new balance: ₦10000
₦25000 -> The most you can take at once is ₦20000
₦5200 -> Amount must be a multiple of ₦500
₦18000 -> Insufficient funds
₦0 -> The smallest amount is ₦500
₦-500 -> The smallest amount is ₦500
₦20000 -> Insufficient funds
₦15000 -> Take your cash, new balance: ₦0
```

Every path is visited at least once, and the boundaries behave as the manager wants: exactly the whole balance is allowed. (₦20,000 was refused only because this customer has ₦15,000; with ₦30,000 it would pass, as the trace above showed.) Blocked cards are not in this list because `cardBlocked` is fixed to `false`; a complete test plan would also run with it set to `true`.

## Common mistakes

### Separate IFs instead of ELSE IF

The most common translation mistake turns a chain of `ELSE IF`s into separate `if`s. In a flowchart, that would mean every diamond is visited no matter what the one above it said. The result can be alarming:

separate-ifs.js

```ts
let balance = 30000;
const amount = 25200;

if (amount > 20000) {
  console.log("The most you can take at once is ₦20000");
}
if (amount % 500 !== 0) {
  console.log("Amount must be a multiple of ₦500");
}
if (amount > balance) {
  console.log("Insufficient funds");
} else {
  balance = balance - amount;
  console.log("Take your cash: ₦" + amount);
}
```

Output of `node separate-ifs.js` and of the browser terminal

```ts
The most you can take at once is ₦20000
Amount must be a multiple of ₦500
Take your cash: ₦25200
```

Two error messages, and then the machine pays out anyway, because the `else` only belongs to the last `if`. The pseudocode was right; the translation broke it. Keep `ELSE IF` as `else if`, always.

### Pseudocode that is too vague

"Check the amount" is not pseudocode; it is a wish. Check it for what? A good test: could two people translate your line into different code? If yes, it is too vague.

### Pseudocode that is really code

`if (amt%500!==0) {log("err")}` is JavaScript with the brackets hidden. The manager cannot read it, and nobody gains anything. Write for the reader who does not program.

### A decision with one way out

A diamond with only a "yes" arrow leaves the "no" case undefined, which is the flowchart version of the missing case from [What programming is](https://zudojs.oyinlola.site/learn/think-programming#failure). Every diamond needs two labelled exits.

### A loop with no way out

An arrow back up with no decision on its path is a loop that never ends. And a decision whose condition the loop never changes is just as bad: if the box inside the savings loop forgot `saved = saved + perWeek`, `saved < goal` would stay true forever. When you trace a loop, check that something in it moves towards the exit every round.

## Pseudocode or flowchart?

|  | Pseudocode | Flowchart |
| --- | --- | --- |
| Best for | Longer algorithms; anything you will soon turn into code | Short algorithms with many branches; explaining to non-programmers |
| Shows clearly | The exact steps and conditions | Which paths exist and where they go |
| Gets hard when | Branches nest many levels deep | There are more than 15 or so boxes |
| Where you meet it | Design documents, code reviews, interviews, exams | Whiteboard meetings, business rules, support guides |

In practice you use whichever makes the next conversation shorter. A flowchart gets the manager to say "yes, that is the rule". Pseudocode gets the developer to write it without guessing. For big systems, teams use other diagrams too (how requests travel between services, which states an order moves through), and you will meet them in the architecture lessons. They all come from the same idea: agree on the design in a form everyone can check, before the code.

## Practice

TRY IT YOURSELF

### A grade calculator

A university grades scores like this: 70 and above is A, 60 to 69 is B, 50 to 59 is C, 45 to 49 is D, 40 to 44 is E, below 40 is F. Write the pseudocode, then translate it into JavaScript and test it on the boundaries 70, 69, 45, 44 and 39.

**Show a solution**

```ts
START
  INPUT score
  IF score >= 70 THEN
    SET grade TO "A"
  ELSE IF score >= 60 THEN
    SET grade TO "B"
  ELSE IF score >= 50 THEN
    SET grade TO "C"
  ELSE IF score >= 45 THEN
    SET grade TO "D"
  ELSE IF score >= 40 THEN
    SET grade TO "E"
  ELSE
    SET grade TO "F"
  END IF
  OUTPUT grade
END
```

grades.js

```ts
for (const score of [70, 69, 45, 44, 39]) {
  let grade = "";
  if (score >= 70) {
    grade = "A";
  } else if (score >= 60) {
    grade = "B";
  } else if (score >= 50) {
    grade = "C";
  } else if (score >= 45) {
    grade = "D";
  } else if (score >= 40) {
    grade = "E";
  } else {
    grade = "F";
  }
  console.log(score, grade);
}
```

Output of `node grades.js` and of the browser terminal

```ts
70 A
69 B
45 D
44 E
39 F
```

Checking from the highest band down means each condition only needs a lower limit: if a score reached "B", it has already failed "70 or more". Checking in the wrong order (`score >= 40` first) would give every passing student an E.

TRY IT YOURSELF

### Three PIN attempts

An ATM gives a customer three tries to enter the right PIN. After three wrong tries, the card is blocked. Draw the flowchart on paper (it has a loop), write the pseudocode, and translate it. Test it with the attempts `["1111", "2580", "4321"]` when the correct PIN is `"2580"`, and then with three wrong attempts.

**Show a solution**

```ts
START
  INPUT correctPin, attempts
  SET wrong TO 0
  SET accepted TO false
  FOR EACH pin IN attempts
    IF pin = correctPin THEN
      SET accepted TO true
      stop the loop
    ELSE
      SET wrong TO wrong + 1
      OUTPUT "Wrong PIN"
      IF wrong = 3 THEN
        OUTPUT "Card blocked"
        stop the loop
      END IF
    END IF
  END FOR
  IF accepted THEN
    OUTPUT "PIN accepted"
  END IF
END
```

pin.js

```ts
const correctPin = "2580";
const attempts = ["1111", "2580", "4321"];

let wrong = 0;
let accepted = false;
for (const pin of attempts) {
  if (pin === correctPin) {
    accepted = true;
    break;
  } else {
    wrong = wrong + 1;
    console.log("Wrong PIN");
    if (wrong === 3) {
      console.log("Card blocked");
      break;
    }
  }
}
if (accepted) {
  console.log("PIN accepted");
}
```

Output of `node pin.js` and of the browser terminal

```ts
Wrong PIN
PIN accepted
```

With `["1111", "0000", "9999"]` it prints `Wrong PIN` three times and then `Card blocked`. In the flowchart, the loop has *two* exits: the right PIN, and the third wrong one. The third attempt in the first test ("4321") is never looked at, because the loop already stopped: an easy detail to miss without a trace.

TRY IT YOURSELF

### Find the translation bug

This pseudocode is correct: `WHILE saved < goal DO`. The JavaScript below was translated from it and gives the wrong answer for a goal of ₦45,000 at ₦7,500 a week. Trace it by hand, find the bug, and fix it.

savings-bug.js

```ts
const goal = 45000;
const perWeek = 7500;

let saved = 0;
let weeks = 0;
while (saved <= goal) {
  saved = saved + perWeek;
  weeks = weeks + 1;
}
console.log("Weeks:", weeks);
```

Output of `node savings-bug.js` and of the browser terminal

```ts
Weeks: 7
```

**Show a solution**

The trace: after 6 rounds, `saved` is 45,000. The goal is reached, so the answer should be 6. But `45000 <= 45000` is true, so the loop runs a seventh time. The translation turned "less than" into "less than or equal to".

savings-fixed.js

```ts
const goal = 45000;
const perWeek = 7500;

let saved = 0;
let weeks = 0;
while (saved < goal) {
  saved = saved + perWeek;
  weeks = weeks + 1;
}
console.log("Weeks:", weeks);
```

Output of `node savings-fixed.js` and of the browser terminal

```ts
Weeks: 6
```

The bug only shows when the goal is an exact multiple of the weekly amount. A goal of ₦50,000 gives 7 with both versions, which is why a boundary test (a goal the savings hit exactly) is the one that catches it.

## Recap

- Pseudocode is an algorithm in structured plain language: START/END, INPUT/OUTPUT, SET, IF/ELSE IF/ELSE/END IF, WHILE/END WHILE, FOR EACH/END FOR, one action per line, indentation for blocks, precise conditions.
- A flowchart draws it: rounded terminators for Start and End, rectangles for processes, diamonds for yes/no decisions with two labelled exits, slanted boxes for input and output, and arrows for the order. A loop is an arrow back to an earlier decision.
- Good pseudocode translates into JavaScript line by line: `IF` to `if`, `ELSE IF` to `else if`, `END IF` to `}`, `OUTPUT` to `console.log`, `WHILE` to `while`, `FOR EACH` to `for…of`.
- A trace table follows the algorithm by hand, value by value, and predicts the output before you run anything.
- Every path through a flowchart is a test case. Then look for the inputs nobody drew, like 0 and negative amounts, and fix the design before the code.

Next: [Reasoning about programs](https://zudojs.oyinlola.site/learn/think-reasoning): how to be sure an algorithm is right, with assumptions, edge-case tables and invariants.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
