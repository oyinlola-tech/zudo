---
title: "Problem workshop: beginner — ZudoJS Academy"
description: "Solve ten everyday problems, from even or odd to a tax calculator, by reasoning about inputs, outputs and edge cases first, then coding and testing each one."
source: https://zudojs.oyinlola.site/learn/solve-beginner
---

LEVEL 1 · LESSON 16 OF 18

Problem-solving fundamentals Foundation

# Problem workshop: beginner

Solve ten everyday problems, from even or odd to a tax calculator, by reasoning about inputs, outputs and edge cases first, then coding and testing each one.

- **55 min** to read and try
- **You need:** The Think like a programmer and Logic and mathematical thinking modules
- **You build:** Ten small, tested functions: parity, largest of three, temperature, grades, passwords, age, discounts, an ATM, a cart and income tax

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Apply one repeatable method to any small problem: understand, inputs, outputs, edge cases, pseudocode, code, tests
- List the edge cases of a problem before writing code, including boundaries, empty input and invalid input
- Turn pseudocode into a small JavaScript function with if, loops and return
- Write a check for every edge case and read PASS and FAIL results
- Keep money in whole kobo and make the current date an input so results are exact and testable

## The blank page problem

A friend who runs a small shop sends you a message: "Customers keep asking whether a discount applies to them. Can you write me something that works out the price?" You understand every word. You have seen `if`, variables and a little JavaScript in the earlier lessons. And yet, when you open an empty file, nothing comes.

That feeling is normal, and it has a cause: you are trying to write code before you know exactly what the code must do. "Work out the price" is not a program yet. What price? In what unit? What if the discount is 150%? What if the price is missing? Every one of those questions has to be answered somewhere, and it is much cheaper to answer them on paper than to discover them when a customer is charged a negative amount.

This lesson is a workshop. You solve ten small, realistic problems, and you solve every one of them the same way. The code is short on purpose. The point is the *method*, because the same method works on the thousand-line problems later in the course.

## The method: seven steps

You met the problem-solving loop in [What programming is](https://zudojs.oyinlola.site/learn/think-programming) and edge-case tables in [Reasoning about programs](https://zudojs.oyinlola.site/learn/think-reasoning). Here it is as a checklist you can follow every time:

1. **Understand** the problem. Say it back in one sentence, in your own words.
2. **Inputs**: what values come in? What type is each one (a number, some text, a list)? What unit (naira or kobo, Celsius or Fahrenheit)?
3. **Outputs**: what exactly comes out? A number, a word, a message?
4. **Edge cases**: the unusual inputs where programs break. An **edge case** is an input at the limit of what the problem allows: zero, a negative number, an empty list, a value exactly on a boundary, or an input that is simply wrong.
5. **Pseudocode**: the steps in plain language, as in [Pseudocode and flowcharts](https://zudojs.oyinlola.site/learn/think-pseudocode).
6. **Code**: translate the pseudocode into JavaScript, line by line.
7. **Test**: run the code on the normal cases *and* every edge case from step 4, and compare with what you expected.

Steps 1 to 5 happen before you type any code. For the first problem you will see every step written out. After that, each problem starts with a **Reason it out** box: try to answer its questions yourself, on paper, before you open the reasoning and read the code.

## The JavaScript you need

The JavaScript course comes after this one, so this workshop uses only the pieces of the language you have already met in this course. Here are the main ones again, in one program:

toolkit.js

```ts
const shopName = "Mama Titi's Store";   // a value that never changes
let itemsSold = 0;                      // a value that can change
itemsSold = itemsSold + 3;

function describeSales(name, count) {   // a function with two inputs
  if (count === 0) {
    return `${name} has sold nothing yet`;
  }
  return `${name} has sold ${count} items`;
}

console.log(describeSales(shopName, itemsSold));
console.log(describeSales("Kiosk 2", 0));
```

Output of `node toolkit.js` and of the browser terminal

```ts
Mama Titi's Store has sold 3 items
Kiosk 2 has sold nothing yet
```

- `const` and `let` create variables. `const` cannot be given a new value; `let` can.
- A **function** is a named set of steps. The names in the parentheses (`name`, `count`) are its **parameters**: its inputs. `return` ends the function and hands back its output. This input → steps → output shape is exactly the shape of every problem in this workshop.
- `===` asks "are these exactly equal?". `if` runs its block only when the condition is true.
- Text in backticks is a **template literal**: `${…}` inserts a value into the text.

### A tiny test helper

Step 7 says "test". A **test** is a piece of code that runs your function on one input and compares the result with the answer you worked out by hand. You will use this small helper in every problem:

check.js

```ts
function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`PASS ${label}`);
  } else {
    console.log(`FAIL ${label}: got ${actual}, expected ${expected}`);
  }
}

check("2 + 2", 2 + 2, 4);
check("half of 5", 5 / 2, 2);
```

Output of `node check.js` and of the browser terminal

```ts
PASS 2 + 2
FAIL half of 5: got 2.5, expected 2
```

The second check fails because the expected value was wrong, not the code. That happens too, and it is useful: a failing test always means "your idea and the program disagree; find out which one is wrong". The real test runner you will use later, Vitest, works on the same idea ([Testing fundamentals](https://zudojs.oyinlola.site/learn/testing-basics)).

## Problem 1: even or odd

An events company seats guests in pairs. Given the number of guests, say whether it is even (everyone has a partner) or odd (one person is left over).

### Step by step

**Understand.** A whole number is even when it divides by 2 with nothing left over, odd otherwise.

**Inputs.** One number, `n`.

**Outputs.** The text `"even"` or `"odd"`. And if the input is not a whole number? Then neither answer is true, so the function should say `"invalid"` instead of guessing.

**Edge cases.** Write them down as a table: the input, and the answer you expect.

| Input | Expected | Why it is interesting |
| --- | --- | --- |
| 4 | even | a normal case |
| 7 | odd | a normal case |
| 0 | even | zero is even: 0 divided by 2 leaves nothing |
| -3 | odd | negative numbers can be odd too |
| 2.5 | invalid | not a whole number |

**Pseudocode.**

```ts
START parity(n)
  IF n is not a whole number THEN RETURN "invalid"
  IF the remainder of n divided by 2 is 0 THEN RETURN "even"
  RETURN "odd"
END
```

**Code.** JavaScript's remainder operator is `%`: `7 % 2` is `1`. `Number.isInteger(n)` is `true` only for whole numbers. Here is a first attempt, with the tests from the table:

parity-first-try.js

```ts
function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`PASS ${label}`);
  } else {
    console.log(`FAIL ${label}: got ${actual}, expected ${expected}`);
  }
}

function parity(n) {
  if (!Number.isInteger(n)) return "invalid";
  if (n % 2 === 1) return "odd";
  return "even";
}

check("4", parity(4), "even");
check("7", parity(7), "odd");
check("0", parity(0), "even");
check("-3", parity(-3), "odd");
check("2.5", parity(2.5), "invalid");
```

Output of `node parity-first-try.js` and of the browser terminal

```ts
PASS 4
PASS 7
PASS 0
FAIL -3: got even, expected odd
PASS 2.5
```

The code "checks for odd" instead of following the pseudocode, which "checks for even". It looks equivalent, and for positive numbers it is. But in JavaScript, `-3 % 2` is `-1`, not `1`: the remainder keeps the sign of the number on the left. So `-3 % 2 === 1` is false and the function says "even". Without the `-3` row in the edge-case table, this bug would have shipped.

The fix is to follow the pseudocode exactly: compare with `0`, which works for any sign.

parity.js

```ts
function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`PASS ${label}`);
  } else {
    console.log(`FAIL ${label}: got ${actual}, expected ${expected}`);
  }
}

function parity(n) {
  if (!Number.isInteger(n)) return "invalid";
  if (n % 2 === 0) return "even";
  return "odd";
}

check("4", parity(4), "even");
check("7", parity(7), "odd");
check("0", parity(0), "even");
check("-3", parity(-3), "odd");
check("2.5", parity(2.5), "invalid");
check("text '4'", parity("4"), "invalid");
```

Output of `node parity.js` and of the browser terminal

```ts
PASS 4
PASS 7
PASS 0
PASS -3
PASS 2.5
PASS text '4'
```

The last test is new: `"4"` in quotes is text, not a number, and `Number.isInteger` refuses it. Text that looks like a number arrives from every form and web address, so it belongs in almost every edge-case table.

> NOTE
>
> Notice the shape: the invalid input is handled *first*, and the function leaves early with `return`. Checking the bad cases first, so the rest of the function only sees good input, is called a **guard clause**. You will use it in nearly every problem below.

## Problem 2: the largest of three

Three delivery riders report how many parcels they delivered today. The rider with the most wins a bonus. Given the three counts, return the highest.

REASON IT OUT

### Before you code: the largest of three

Answer these on paper first.

- What are the inputs and the output?
- What happens when two riders tie for the most?
- Does your idea still work if all three numbers are negative? (Counts cannot be negative, but a "change since yesterday" can, and you want a function you can reuse.)
- Does it matter *where* the largest number is: first, second or third?

**Show the reasoning**

**Inputs:** three numbers, `a`, `b`, `c`. **Output:** the largest value (not which rider; that would be a different problem).

**Ties:** if two values are equal and the largest, the answer is simply that value. `largest(5, 5, 2)` is 5.

**Negatives:** a common first idea is "start with `largest = 0` and look for something bigger". For `-4, -1, -9` nothing is bigger than 0, so it returns 0, which is not even one of the inputs. Start with the first input instead: it is a real candidate.

**Position:** test the largest value in each of the three positions, because each position is handled by different lines of code.

```ts
START largest(a, b, c)
  SET best TO a
  IF b > best THEN SET best TO b
  IF c > best THEN SET best TO c
  RETURN best
END
```

This is the "keep the best so far" pattern. It grows to lists of any length in the next workshop.

largest.js

```ts
function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`PASS ${label}`);
  } else {
    console.log(`FAIL ${label}: got ${actual}, expected ${expected}`);
  }
}

function largest(a, b, c) {
  let best = a;
  if (b > best) best = b;
  if (c > best) best = c;
  return best;
}

check("largest first", largest(9, 4, 7), 9);
check("largest second", largest(4, 9, 7), 9);
check("largest third", largest(4, 7, 9), 9);
check("a tie", largest(5, 5, 2), 5);
check("all equal", largest(3, 3, 3), 3);
check("all negative", largest(-4, -1, -9), -1);
check("decimals", largest(2.5, 2.25, 2.75), 2.75);
```

Output of `node largest.js` and of the browser terminal

```ts
PASS largest first
PASS largest second
PASS largest third
PASS a tie
PASS all equal
PASS all negative
PASS decimals
```

`best` uses `let` because its value changes as better candidates appear. JavaScript also has a built-in `Math.max(4, 9, 7)`, and in real code you would use it. Writing it yourself once is still worth it: "keep the best so far" is one of the most common patterns in programming.

## Problem 3: temperature conversion

A cold-room supplier's sensors report Celsius, but one customer's equipment only shows Fahrenheit. Convert in both directions. The formulas are `F = C × 9 / 5 + 32` and `C = (F − 32) × 5 / 9`.

REASON IT OUT

### Before you code: temperatures

- Which values do you know the answer to without a calculator? Use them as tests.
- What is the lowest temperature that can exist? What should the function do below it?
- What goes wrong if you forget the parentheses in `(F − 32) × 5 / 9`?
- If you convert 25.5 °C to Fahrenheit and back, do you expect exactly 25.5?

**Show the reasoning**

**Known values:** water freezes at 0 °C = 32 °F and boils at 100 °C = 212 °F. And −40 is the one temperature where both scales agree: −40 °C = −40 °F. These three make excellent tests because you know them for certain.

**Lower limit:** nothing can be colder than absolute zero, −273.15 °C. A reading below it means a broken sensor, so the function should refuse it rather than convert nonsense.

**Parentheses:** without them, `F − 32 × 5 / 9` multiplies first, as in school maths, and you subtract about 17.8 instead of subtracting 32 first.

**Round trips:** decimals in a computer are not exact (you met this in [Mathematical reasoning](https://zudojs.oyinlola.site/learn/logic-math)), so a result can be off in the last of many decimal places, and a round trip may not come back exactly where it started. Round the result for display, and compare decimals with rounding in tests.

```ts
START toFahrenheit(c)
  IF c < -273.15 THEN RETURN "invalid"
  RETURN c × 9 / 5 + 32
END

START toCelsius(f)
  RETURN (f − 32) × 5 / 9
END
```

temperature.js

```ts
function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`PASS ${label}`);
  } else {
    console.log(`FAIL ${label}: got ${actual}, expected ${expected}`);
  }
}

function toFahrenheit(c) {
  if (c < -273.15) return "invalid";
  return (c * 9) / 5 + 32;
}

function toCelsius(f) {
  return ((f - 32) * 5) / 9;
}

function roundTo1(x) {
  return Math.round(x * 10) / 10;
}

check("freezing", toFahrenheit(0), 32);
check("boiling", toFahrenheit(100), 212);
check("-40 is -40", toFahrenheit(-40), -40);
check("back to freezing", toCelsius(32), 0);
check("below absolute zero", toFahrenheit(-300), "invalid");
check("normal body heat", toFahrenheit(36.6), 97.88);

console.log("round trip, raw:", toCelsius(toFahrenheit(25.5)));
check("round trip, rounded", roundTo1(toCelsius(toFahrenheit(25.5))), 25.5);
```

Output of `node temperature.js` and of the browser terminal

```ts
PASS freezing
PASS boiling
PASS -40 is -40
PASS back to freezing
PASS below absolute zero
FAIL normal body heat: got 97.88000000000001, expected 97.88
round trip, raw: 25.500000000000004
PASS round trip, rounded
```

Read the two surprises carefully. `toFahrenheit(36.6)` is off by 0.00000000000001, and the round trip came back as 25.500000000000004. No thermometer could ever show that difference, but `===` sees every digit. The code is right; the *test* needs to compare rounded values, as the round-trip check does. `Math.round(x * 10) / 10` rounds to one decimal place: multiply to move the decimal point, round to a whole number, divide back.

> TIP
>
> When a test on decimals fails by a tiny amount, the fix is almost never in the formula. Decide how many decimal places matter to a person (one, for a thermometer), and round to that before comparing or showing.

## Problem 4: a grade calculator

A school uses this scale for exam scores from 0 to 100: A for 70 and above, B for 60–69, C for 50–59, D for 45–49, E for 40–44, and F below 40. Write `grade(score)`.

REASON IT OUT

### Before you code: grades

- Which scores are the most likely to be graded wrong?
- If you write the checks as a chain of `if`s, in which order must they go? What happens with the order reversed?
- What about 69.5? And 101, −5, or no number at all?

**Show the reasoning**

**The risky scores are the boundaries**: 70 and 69, 60 and 59, 50 and 49, 45 and 44, 40 and 39, plus the ends of the range, 0 and 100. A bug like writing `>` where you meant `>=` only shows up exactly on a boundary, so test both sides of every one.

**Order:** check from the highest grade down. Each check can then be one comparison, because anything that reached it already failed the checks above. In the reverse order, `score >= 40` comes first and gives E to a score of 95. ([Why doesn't this work?](https://zudojs.oyinlola.site/learn/solve-broken) comes back to this.)

**69.5:** the table does not say. You have to *decide*, and write the decision down. Here: a score counts for the grade whose lower limit it has reached, so 69.5 is a B. **Invalid scores** (below 0, above 100, or not a number) get `"invalid"`.

```ts
START grade(score)
  IF score is not a number, or score < 0, or score > 100 THEN RETURN "invalid"
  IF score >= 70 THEN RETURN "A"
  IF score >= 60 THEN RETURN "B"
  IF score >= 50 THEN RETURN "C"
  IF score >= 45 THEN RETURN "D"
  IF score >= 40 THEN RETURN "E"
  RETURN "F"
END
```

With this many tests, a list is shorter than a line per test. As in [Algorithms](https://zudojs.oyinlola.site/learn/think-algorithms#three-shapes), the scores go in an **array** (a list of values in square brackets), and `for (const score of scores)` runs its block once for each value, with `score` set to that value.

grades.js

```ts
function grade(score) {
  if (typeof score !== "number" || Number.isNaN(score)) return "invalid";
  if (score < 0 || score > 100) return "invalid";
  if (score >= 70) return "A";
  if (score >= 60) return "B";
  if (score >= 50) return "C";
  if (score >= 45) return "D";
  if (score >= 40) return "E";
  return "F";
}

const scores = [100, 70, 69.5, 69, 60, 59, 50, 49, 45, 44, 40, 39, 0, -5, 101, NaN];
let line = "";
for (const score of scores) {
  line = line + `${score}:${grade(score)} `;
}
console.log(line);
```

Output of `node grades.js` and of the browser terminal

```ts
100:A 70:A 69.5:B 69:B 60:B 59:C 50:C 49:D 45:D 44:E 40:E 39:F 0:F -5:invalid 101:invalid NaN:invalid
```

This test prints a table instead of PASS or FAIL, and you compare it with the scale by eye. That is fine for a first look. `typeof score !== "number"` catches text; `Number.isNaN(score)` catches `NaN`, the "not a number" value that a failed calculation produces, which is technically of type number.

## Problem 5: a password checker

A banking app's sign-up form needs a password check. The rules: at least 8 characters, at least one digit, at least one capital letter (A–Z) and at least one small letter (a–z). The form should tell the user *everything* that is wrong at once, not one problem at a time.

REASON IT OUT

### Before you code: passwords

- What is the output? A yes/no is not enough for "tell the user everything".
- How do you find out whether a password contains a digit, when you can only look at one character at a time?
- Which inputs sit exactly on a boundary? Which are strange: an empty password, only spaces?
- What about letters such as É or Ñ? Decide, and write the decision down.

**Show the reasoning**

**Output:** a list of problems. An empty list means the password is acceptable.

**Finding a digit:** go through the characters one by one, and raise a flag (a boolean variable, set to `true`) the first time you see a digit. Do the same for capitals and small letters. After the loop, a flag that is still `false` means a rule failed. Characters can be compared: `ch >= "0" && ch <= "9"` is true for exactly the ten digits, because characters are stored as numbers and the digits, the capitals A–Z and the small letters a–z each sit next to each other in order.

**Boundaries:** exactly 7 characters (too short) and exactly 8 (long enough). **Strange inputs:** an empty password breaks every rule, so the user should see all four problems.

**É and Ñ:** with the A–Z comparison they count as neither capital nor small. That is a decision: the rule says A–Z. Write it down so the next developer knows it was on purpose.

```ts
START passwordProblems(password)
  SET problems TO an empty list
  IF length of password < 8 THEN add "at least 8 characters" to problems
  SET hasDigit, hasUpper, hasLower TO false
  FOR EACH character ch IN password
    IF ch is between "0" and "9" THEN SET hasDigit TO true
    IF ch is between "A" and "Z" THEN SET hasUpper TO true
    IF ch is between "a" and "z" THEN SET hasLower TO true
  END FOR
  IF NOT hasDigit THEN add "a digit" to problems
  IF NOT hasUpper THEN add "a capital letter" to problems
  IF NOT hasLower THEN add "a small letter" to problems
  RETURN problems
END
```

password.js

```ts
function passwordProblems(password) {
  const problems = [];
  if (password.length < 8) problems.push("at least 8 characters");

  let hasDigit = false;
  let hasUpper = false;
  let hasLower = false;
  for (const ch of password) {
    if (ch >= "0" && ch <= "9") hasDigit = true;
    if (ch >= "A" && ch <= "Z") hasUpper = true;
    if (ch >= "a" && ch <= "z") hasLower = true;
  }

  if (!hasDigit) problems.push("a digit");
  if (!hasUpper) problems.push("a capital letter");
  if (!hasLower) problems.push("a small letter");
  return problems;
}

function report(password) {
  const problems = passwordProblems(password);
  if (problems.length === 0) return `"${password}": OK`;
  return `"${password}": needs ${problems.join(", ")}`;
}

console.log(report("Lagos2026"));
console.log(report("Lagos26"));      // 7 characters
console.log(report("Lagos202"));     // exactly 8
console.log(report("lagos2026"));
console.log(report("LAGOS2026"));
console.log(report("Lagosisland"));
console.log(report(""));
console.log(report("        "));    // 8 spaces
```

Output of `node password.js` and of the browser terminal

```ts
"Lagos2026": OK
"Lagos26": needs at least 8 characters
"Lagos202": OK
"lagos2026": needs a capital letter
"LAGOS2026": needs a small letter
"Lagosisland": needs a digit
"": needs at least 8 characters, a digit, a capital letter, a small letter
"        ": needs a digit, a capital letter, a small letter
```

New pieces: `[]` is an empty list, `problems.push(…)` adds an item to its end, `.length` counts the items (or, on text, the characters), and `join(", ")` glues the items into one string. `for (const ch of password)` loops over the characters of the text.

Every test here was chosen for a reason: one passing password, one per broken rule, the 7/8 boundary, and the two strange inputs. Look at the last line: eight spaces pass the length rule. Is that acceptable? The rules as written say yes. Spotting a question like that is exactly what testing edge cases is for; you would take it back to whoever wrote the rules.

> WATCH OUT
>
> A form check is only the first line of defence. A real system also refuses passwords that appear in lists of leaked passwords, and never stores a password as plain text: it stores a slow, salted hash instead, which `@zudojs/auth` does for you later in the academy. Current guidance, such as NIST's, also prefers a generous minimum length over rules about character types, for the reason you saw in [Counting](https://zudojs.oyinlola.site/learn/logic-counting#passwords): length is the exponent.

## Problem 6: an age calculator

A bank lets customers open their own account from the age of 18. Given a date of birth, work out the person's age in whole years.

REASON IT OUT

### Before you code: age

- "Current year minus birth year" is the obvious answer. Find a date where it is wrong.
- Where does "today" come from? What happens to your tests tomorrow if the function reads today's date from the computer's clock?
- Someone born on 29 February: on 28 February of a year without a 29th, are they one year older yet?
- What should happen with a birth date in the future?

**Show the reasoning**

**The obvious answer fails before the birthday.** Born 25 September 2008, on 24 September 2026: 2026 − 2008 = 18, but the person turns 18 tomorrow. So: subtract the years, then take one away if this year's birthday has not happened yet. The birthday has not happened yet if today's month is earlier than the birth month, or it is the same month and today's day is earlier.

**Today is an input.** If the function read the clock, its answer would change every day and a test written today would fail next year. Passing today's date in as a parameter makes the function give the same answer for the same inputs, forever. That is one of the most useful habits in this course: *make time an input*.

**29 February:** with the rule above, on 28 February the day (28) is earlier than 29, so they are not older yet; on 1 March they are. Different countries' laws decide differently, so this is a decision to write down, and a test to keep.

**Future birth dates** are invalid: the function returns `"invalid"`.

```ts
START ageOn(birthYear, birthMonth, birthDay, year, month, day)
  SET age TO year − birthYear
  IF month < birthMonth, OR (month = birthMonth AND day < birthDay) THEN
    SET age TO age − 1
  IF age < 0 THEN RETURN "invalid"
  RETURN age
END
```

age.js

```ts
function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`PASS ${label}`);
  } else {
    console.log(`FAIL ${label}: got ${actual}, expected ${expected}`);
  }
}

function ageOn(birthYear, birthMonth, birthDay, year, month, day) {
  let age = year - birthYear;
  const birthdayNotYet = month < birthMonth || (month === birthMonth && day < birthDay);
  if (birthdayNotYet) age = age - 1;
  if (age < 0) return "invalid";
  return age;
}

check("day before 18th birthday", ageOn(2008, 9, 25, 2026, 9, 24), 17);
check("on 18th birthday", ageOn(2008, 9, 25, 2026, 9, 25), 18);
check("earlier month", ageOn(2008, 12, 1, 2026, 9, 24), 17);
check("later month", ageOn(2008, 1, 31, 2026, 9, 24), 18);
check("29 Feb, on 28 Feb", ageOn(2008, 2, 29, 2026, 2, 28), 17);
check("29 Feb, on 1 Mar", ageOn(2008, 2, 29, 2026, 3, 1), 18);
check("born today", ageOn(2026, 9, 24, 2026, 9, 24), 0);
check("born tomorrow", ageOn(2026, 9, 25, 2026, 9, 24), "invalid");

const age = ageOn(2008, 9, 25, 2026, 9, 24);
console.log(age >= 18 ? "Welcome" : "Sorry, you must be 18 or older");
```

Output of `node age.js` and of the browser terminal

```ts
PASS day before 18th birthday
PASS on 18th birthday
PASS earlier month
PASS later month
PASS 29 Feb, on 28 Feb
PASS 29 Feb, on 1 Mar
PASS born today
PASS born tomorrow
Sorry, you must be 18 or older
```

`||` means "or" and `&&` means "and", as in [Boolean logic](https://zudojs.oyinlola.site/learn/logic-boolean). The last line uses the **ternary operator** `condition ? a : b`, a short `if`/`else` that gives back `a` when the condition is true and `b` otherwise. The program on a real server would pass in today's date from the clock at the very edge of the program, and every test would still pass, because the function itself never looks at the clock.

## Problem 7: a discount calculator

Back to the shop from the start of the lesson. The shop runs promotions like "20% off, up to ₦5,000 off". Given a price and a promotion, work out what the customer pays.

REASON IT OUT

### Before you code: discounts

- In what unit should prices be stored, and why not in naira with decimals?
- 20% of ₦149.99 is not a whole number of kobo. What do you do with the fraction?
- Which percentages are valid? What about 0, 100 and 150?
- With a cap of ₦5,000, find a price where the cap matters and one where it does not.

**Show the reasoning**

**Kobo.** Money is stored as a whole number of the smallest unit, kobo (₦1 = 100 kobo), so adding and subtracting amounts is always exact. You convert to naira only for display. ([Mathematical reasoning](https://zudojs.oyinlola.site/learn/logic-math) showed why decimals drift.)

**Fractions of a kobo:** round the *discount* to a whole kobo, once, then subtract. The shop decides the rounding rule; here, normal rounding with `Math.round`.

**Valid percentages:** 0 to 100. 0 means no discount and 100 means free (both fine). Anything else is an input error, not a discount: a 150% discount would pay the customer to take the goods.

**The cap:** 20% of ₦10,000 is ₦2,000, under the cap, so the cap does nothing. 20% of ₦40,000 is ₦8,000, over the cap, so the discount becomes ₦5,000. And exactly at the edge: 20% of ₦25,000 is exactly ₦5,000.

```ts
START discountedPrice(priceKobo, percent, capKobo)
  IF percent < 0 OR percent > 100 THEN RETURN "invalid"
  SET discount TO round(priceKobo × percent / 100)
  IF discount > capKobo THEN SET discount TO capKobo
  RETURN priceKobo − discount
END
```

discount.js

```ts
function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`PASS ${label}`);
  } else {
    console.log(`FAIL ${label}: got ${actual}, expected ${expected}`);
  }
}

function discountedPrice(priceKobo, percent, capKobo) {
  if (percent < 0 || percent > 100) return "invalid";
  let discount = Math.round((priceKobo * percent) / 100);
  if (discount > capKobo) discount = capKobo;
  return priceKobo - discount;
}

function naira(kobo) {
  return `₦${(kobo / 100).toFixed(2)}`;
}

const CAP = 500000;  // ₦5,000 in kobo

check("under the cap", discountedPrice(1000000, 20, CAP), 800000);
check("over the cap", discountedPrice(4000000, 20, CAP), 3500000);
check("exactly the cap", discountedPrice(2500000, 20, CAP), 2000000);
check("0%", discountedPrice(1000000, 0, CAP), 1000000);
check("100% of a small item", discountedPrice(150000, 100, CAP), 0);
check("fraction of a kobo", discountedPrice(14999, 20, CAP), 11999);
check("150%", discountedPrice(1000000, 150, CAP), "invalid");

console.log(naira(discountedPrice(14999, 20, CAP)));
```

Output of `node discount.js` and of the browser terminal

```ts
PASS under the cap
PASS over the cap
PASS exactly the cap
PASS 0%
PASS 100% of a small item
PASS fraction of a kobo
PASS 150%
₦119.99
```

The fraction test: 20% of 14,999 kobo is 2,999.8 kobo, which rounds to 3,000, leaving 11,999 kobo, or ₦119.99. `toFixed(2)` shows a number with exactly two decimals. A variable written in capitals, like `CAP`, is a common way to mark a fixed setting.

## Problem 8: an ATM withdrawal

An ATM receives a withdrawal request. It knows the account balance, how much the customer has already taken out today, and the daily limit of ₦100,000. It only has ₦500 and ₦1,000 notes. Decide whether to pay out, and what to tell the customer.

REASON IT OUT

### Before you code: the ATM

- List every reason to refuse a withdrawal.
- Does the order of the checks matter? What should a customer who types −₦5,000 be told?
- Which amounts sit exactly on a limit, and should they be allowed?
- What is the output when the withdrawal succeeds?

**Show the reasoning**

**Reasons to refuse:** the amount is not a positive whole number; it cannot be paid in ₦500 notes (not a multiple of 500); it would take today's total over ₦100,000; it is more than the balance.

**Order matters for the message.** Every check must pass, so in the end the same requests are refused whatever the order. But the *first* failing check decides what the customer reads. Telling someone who typed −₦5,000 "insufficient funds" is wrong and confusing. So check the amount itself first (is it a sensible request at all?), then the rules about the machine and the day, then the account.

**Exact limits are allowed:** withdrawing exactly the whole balance leaves ₦0, and reaching exactly ₦100,000 for the day is within the limit. Use `>` for "over the limit", not `>=`.

**Success output:** the message includes the new balance, so the customer (and the test) can see it.

```ts
START withdraw(balance, withdrawnToday, amount)
  IF amount is not a whole number OR amount <= 0 THEN RETURN "Declined: invalid amount"
  IF amount is not a multiple of 500 THEN RETURN "Declined: amounts must be in ₦500 notes"
  IF withdrawnToday + amount > 100000 THEN RETURN "Declined: daily limit reached"
  IF amount > balance THEN RETURN "Declined: insufficient funds"
  RETURN "Approved: new balance is ₦" + (balance − amount)
END
```

atm.js

```ts
const DAILY_LIMIT = 100000;   // naira

function withdraw(balance, withdrawnToday, amount) {
  if (!Number.isInteger(amount) || amount <= 0) return "Declined: invalid amount";
  if (amount % 500 !== 0) return "Declined: amounts must be in ₦500 notes";
  if (withdrawnToday + amount > DAILY_LIMIT) return "Declined: daily limit reached";
  if (amount > balance) return "Declined: insufficient funds";
  return `Approved: new balance is ₦${balance - amount}`;
}

console.log(withdraw(50000, 0, 20000));      // normal
console.log(withdraw(50000, 0, 50000));      // exactly the balance
console.log(withdraw(50000, 0, 50500));      // 500 more than the balance
console.log(withdraw(500000, 80000, 20000)); // exactly reaches the limit
console.log(withdraw(500000, 80000, 20500)); // just over the limit
console.log(withdraw(50000, 0, 1250));       // not in ₦500 notes
console.log(withdraw(50000, 0, -5000));      // negative
console.log(withdraw(50000, 0, 0));          // zero
console.log(withdraw(1000, 0, 5000));        // two problems: which one is reported?
```

Output of `node atm.js` and of the browser terminal

```ts
Approved: new balance is ₦30000
Approved: new balance is ₦0
Declined: insufficient funds
Approved: new balance is ₦480000
Declined: daily limit reached
Declined: amounts must be in ₦500 notes
Declined: invalid amount
Declined: invalid amount
Declined: insufficient funds
```

Each check is a guard clause: a bad request leaves the function at its first problem, and only a request that passed every check reaches the last line. That makes the function easy to read top to bottom as a list of rules, which is exactly how the bank would describe it.

Look at the tests in pairs: 50,000 and 50,500 on the balance, 20,000 and 20,500 on the daily limit. One value exactly on the limit, one just past it. This **boundary pair** habit catches most `>` versus `>=` mistakes.

## Problem 9: a shopping cart total

An online grocery shop needs the total for a cart. Each item has a price (in kobo) and a quantity. Delivery costs ₦1,500, and is free when the goods cost ₦20,000 or more.

REASON IT OUT

### Before you code: the cart

- How is one item described? How is a whole cart described?
- What is the total of an empty cart? Does an empty cart pay for delivery?
- What should happen with a quantity of 0? And with a quantity of −2?
- Is the free-delivery rule "more than ₦20,000" or "₦20,000 or more"? Which test tells them apart?

**Show the reasoning**

**An item** needs a name, a price in kobo and a quantity, kept together. **A cart** is a list of items.

**Empty cart:** the goods cost 0 and nothing is delivered, so the total is 0. A careless version charges ₦1,500 to deliver nothing, because 0 is less than ₦20,000. That needs its own rule.

**Quantity 0** is harmless: the item adds nothing. **A negative quantity** would reduce the bill, which is how people steal from badly written shops. Refuse the whole cart as invalid.

**The rule says "₦20,000 or more"**, so use `>=`, and test a cart worth exactly ₦20,000.

```ts
START cartTotal(items)
  SET subtotal TO 0
  FOR EACH item IN items
    IF item.quantity is not a whole number OR item.quantity < 0 THEN RETURN "invalid"
    SET subtotal TO subtotal + item.price × item.quantity
  END FOR
  IF subtotal = 0 THEN RETURN 0
  IF subtotal >= 2000000 THEN RETURN subtotal
  RETURN subtotal + 150000
END
```

To describe one item, JavaScript has **objects**: named values grouped in braces, such as `{ name: "Rice 5kg", price: 850000, quantity: 1 }`. You read one value with a dot: `item.price`. A cart is then an array of objects. Objects get their own lesson, [Objects and JSON](https://zudojs.oyinlola.site/learn/js-data), in the JavaScript course.

cart.js

```ts
function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`PASS ${label}`);
  } else {
    console.log(`FAIL ${label}: got ${actual}, expected ${expected}`);
  }
}

const DELIVERY = 150000;        // ₦1,500
const FREE_FROM = 2000000;      // ₦20,000

function cartTotal(items) {
  let subtotal = 0;
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 0) return "invalid";
    subtotal = subtotal + item.price * item.quantity;
  }
  if (subtotal === 0) return 0;
  if (subtotal >= FREE_FROM) return subtotal;
  return subtotal + DELIVERY;
}

const rice = { name: "Rice 5kg", price: 850000, quantity: 1 };
const oil = { name: "Palm oil 1L", price: 250000, quantity: 2 };
const eggs = { name: "Eggs (crate)", price: 400000, quantity: 0 };

check("small cart pays delivery", cartTotal([rice, oil]), 1500000);
check("empty cart", cartTotal([]), 0);
check("quantity 0 adds nothing", cartTotal([rice, eggs]), 1000000);
check("exactly ₦20,000 is free", cartTotal([{ name: "Yam", price: 500000, quantity: 4 }]), 2000000);
check("just under ₦20,000", cartTotal([{ name: "Yam", price: 499900, quantity: 4 }]), 2149600);
check("negative quantity", cartTotal([rice, { name: "Oil", price: 250000, quantity: -2 }]), "invalid");
```

Output of `node cart.js` and of the browser terminal

```ts
PASS small cart pays delivery
PASS empty cart
PASS quantity 0 adds nothing
PASS exactly ₦20,000 is free
PASS just under ₦20,000
PASS negative quantity
```

Work the first test out by hand to see why it passes: rice is 850,000 kobo, oil is 2 × 250,000 = 500,000, subtotal 1,350,000 kobo (₦13,500), under ₦20,000, so add 150,000 for delivery: 1,500,000 kobo, ₦15,000. Doing one test by hand like this is how you know the *expected* value is right.

## Problem 10: a tax calculator

Income tax is usually charged in **bands**: each slice of income is taxed at its own rate. The bands below are made up for practice (real tax law has more rules, reliefs and bands):

| Slice of yearly income | Rate |
| --- | --- |
| the first ₦800,000 | 0% |
| the next ₦2,200,000 (from ₦800,000 to ₦3,000,000) | 15% |
| everything above ₦3,000,000 | 20% |

REASON IT OUT

### Before you code: bands

- Someone earns ₦4,000,000. Is all of it taxed at 20%? Work out the tax by hand.
- What is the tax on exactly ₦800,000? On ₦800,001?
- How do you work out how much of an income falls inside one band?

**Show the reasoning**

**Not all at 20%.** That is the most common misunderstanding about tax bands. For ₦4,000,000: the first ₦800,000 is taxed at 0% (₦0), the next ₦2,200,000 at 15% (₦330,000), and the last ₦1,000,000 at 20% (₦200,000). Total: ₦530,000. Earning more never makes you take home less, because only the slice above the line pays the higher rate.

**Boundaries:** ₦800,000 pays nothing; ₦800,001 pays 15% of ₦1, which is 15 kobo. Work in kobo again, and round the tax to whole kobo at the end.

**The slice inside a band** from `low` to `high` is: nothing if the income is at or below `low`; otherwise the smaller of `income − low` and `high − low`. `Math.min(a, b)` gives the smaller of two numbers.

```ts
START incomeTax(income)
  IF income < 0 THEN RETURN "invalid"
  SET tax TO 0
  IF income > 800000 THEN
    SET tax TO tax + 15% of min(income − 800000, 2200000)
  IF income > 3000000 THEN
    SET tax TO tax + 20% of (income − 3000000)
  RETURN tax, rounded to whole kobo
END
```

tax.js

```ts
function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`PASS ${label}`);
  } else {
    console.log(`FAIL ${label}: got ${actual}, expected ${expected}`);
  }
}

// All amounts in kobo.
const BAND1_TOP = 80000000;    // ₦800,000
const BAND2_TOP = 300000000;   // ₦3,000,000

function incomeTax(income) {
  if (income < 0) return "invalid";
  let tax = 0;
  if (income > BAND1_TOP) {
    tax = tax + 0.15 * Math.min(income - BAND1_TOP, BAND2_TOP - BAND1_TOP);
  }
  if (income > BAND2_TOP) {
    tax = tax + 0.2 * (income - BAND2_TOP);
  }
  return Math.round(tax);
}

check("no income", incomeTax(0), 0);
check("exactly ₦800,000", incomeTax(80000000), 0);
check("₦800,001", incomeTax(80000100), 15);
check("₦2,000,000", incomeTax(200000000), 18000000);
check("exactly ₦3,000,000", incomeTax(300000000), 33000000);
check("₦4,000,000", incomeTax(400000000), 53000000);
check("negative", incomeTax(-100), "invalid");

const earn = 400000000;
const tax = incomeTax(earn);
console.log(`Tax on ₦${earn / 100}: ₦${tax / 100} (${(tax / earn) * 100}% of income)`);
```

Output of `node tax.js` and of the browser terminal

```ts
PASS no income
PASS exactly ₦800,000
PASS ₦800,001
PASS ₦2,000,000
PASS exactly ₦3,000,000
PASS ₦4,000,000
PASS negative
Tax on ₦4000000: ₦530000 (13.25% of income)
```

The last line shows the **effective rate**: ₦4,000,000 earners pay 13.25% of their income in this made-up system, even though their top band is 20%. That one number is the answer to the misunderstanding in the reasoning box.

Notice how the tests came straight from the reasoning: zero, both sides of the first boundary, a value inside band 2, exactly the second boundary, a value in band 3, and an invalid input. You did not invent them after writing the code; you wrote them down before. That is the whole method in one habit.

## What the ten problems have in common

Look back over the workshop. The same few ideas did almost all the work:

- **Guard clauses first.** Invalid input is refused at the top of the function, with a clear answer (`"invalid"`, "Declined: …"). The rest of the function can then trust its input.
- **Boundary pairs.** For every limit, one test exactly on it and one just past it: 69/70, 7/8 characters, ₦50,000/₦50,500, ₦800,000/₦800,001.
- **Decisions written down.** 69.5, É, 29 February, eight spaces: the problem statement did not say. You decided, and a test now records the decision.
- **Exact units.** Money in whole kobo; decimals rounded to what a person can see before comparing.
- **Inputs instead of hidden state.** Today's date is a parameter, so the answer never changes by itself.
- **Tests from the reasoning, not from the code.** The expected value comes from working it out by hand. Copying what the program prints into the test would only prove the program agrees with itself.

## Practice

TRY IT YOURSELF

### Leap years

A year is a leap year if it divides by 4, except years that divide by 100, which are leap years only if they also divide by 400. Before coding, list your test years and their expected answers. Then write `isLeapYear(year)`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Check the most specific rule first, the same order as the fizzbuzz example: divides by 400, then by 100, then by 4.

HINT 2

`if (year % 400 === 0) return true; if (year % 100 === 0) return false; return year % 4 === 0;`

SOLUTION

Reasoning: the rule has three parts, so you need a test for each part plus a normal year. 2024 (divides by 4: leap), 2026 (not by 4: not leap), 1900 (by 100 but not 400: not leap), 2000 (by 400: leap). The order of the checks follows the "except" in the rule: the most specific rule first.

leap.js

```ts
function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`PASS ${label}`);
  } else {
    console.log(`FAIL ${label}: got ${actual}, expected ${expected}`);
  }
}

function isLeapYear(year) {
  if (year % 400 === 0) return true;
  if (year % 100 === 0) return false;
  return year % 4 === 0;
}

check("2024", isLeapYear(2024), true);
check("2026", isLeapYear(2026), false);
check("1900", isLeapYear(1900), false);
check("2000", isLeapYear(2000), true);
```

Output of `node leap.js` and of the browser terminal

```ts
PASS 2024
PASS 2026
PASS 1900
PASS 2000
```

If you checked `% 4` first, 1900 would come out as a leap year: the same "wrong condition order" bug as the grades.

TRY IT YOURSELF

### Add VAT to the cart

The shop must now add VAT at 7.5% on the goods, but not on delivery. Where does VAT go in the pseudocode of problem 9? Is an empty cart still ₦0? Write `totalWithVat(subtotalKobo)` that takes the goods subtotal and returns the final total, and test a ₦13,500 cart, a ₦20,000 cart and an empty cart.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Guard the empty cart first: `if (subtotal === 0) return 0;`, the same as the school-fee example.

HINT 2

`const vat = Math.round(subtotal * 0.075); const delivery = subtotal >= 2000000 ? 0 : 150000; return subtotal + vat + delivery;`

SOLUTION

VAT is worked out on the subtotal, rounded to whole kobo, before the delivery rule. The free-delivery rule still looks at the goods alone. An empty cart has no VAT and no delivery, so it stays ₦0.

vat.js

```ts
function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`PASS ${label}`);
  } else {
    console.log(`FAIL ${label}: got ${actual}, expected ${expected}`);
  }
}

function totalWithVat(subtotal) {
  if (subtotal === 0) return 0;
  const vat = Math.round(subtotal * 0.075);
  const delivery = subtotal >= 2000000 ? 0 : 150000;
  return subtotal + vat + delivery;
}

check("₦13,500 cart", totalWithVat(1350000), 1601250);
check("₦20,000 cart", totalWithVat(2000000), 2150000);
check("empty cart", totalWithVat(0), 0);
```

Output of `node vat.js` and of the browser terminal

```ts
PASS ₦13,500 cart
PASS ₦20,000 cart
PASS empty cart
```

By hand: 7.5% of 1,350,000 kobo is 101,250 kobo; plus delivery 150,000 gives 1,350,000 + 101,250 + 150,000 = 1,601,250 kobo (₦16,012.50).

TRY IT YOURSELF

### Count the notes

After approving a withdrawal, the ATM must decide which notes to pay out: as many ₦1,000 notes as possible, then ₦500 notes. Reason first: what are the inputs, the output, and the edge cases? Then write `notesFor(amount)` that returns text like `"2 x ₦1000, 1 x ₦500"`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`thousands = Math.floor(amount / 1000)`. The remainder for ₦500 notes is `amount % 1000`, and dividing that by 500 gives how many.

HINT 2

`return \`${thousands} x ₦1000, ${fiveHundreds} x ₦500\`;` with `fiveHundreds = (amount % 1000) / 500`.

SOLUTION

Input: an approved amount (already a positive multiple of 500). Output: two counts. Edge cases: an amount that needs no ₦500 note (₦3,000), one that needs only a ₦500 note (₦500), and a large amount. `Math.floor` rounds down, so `Math.floor(2500 / 1000)` is 2; the remainder `2500 % 1000` is what is left for ₦500 notes.

notes.js

```ts
function notesFor(amount) {
  const thousands = Math.floor(amount / 1000);
  const rest = amount % 1000;
  const fiveHundreds = rest / 500;
  return `${thousands} x ₦1000, ${fiveHundreds} x ₦500`;
}

console.log(notesFor(2500));
console.log(notesFor(3000));
console.log(notesFor(500));
console.log(notesFor(100000));
```

Output of `node notes.js` and of the browser terminal

```ts
2 x ₦1000, 1 x ₦500
3 x ₦1000, 0 x ₦500
0 x ₦1000, 1 x ₦500
100 x ₦1000, 0 x ₦500
```

This function trusts its input because `withdraw` already checked it. That is a decision too: write it down, or add a guard clause if the function could ever be called from somewhere else.

## Recap

- Every problem gets the same seven steps: understand, inputs, outputs, edge cases, pseudocode, code, tests. The first five happen before any code.
- Edge cases are zero, negatives, empty input, values exactly on a boundary and inputs of the wrong type. Write them in a table with the answer you expect.
- Refuse invalid input first with guard clauses; the order of the checks decides which message the user sees.
- Test both sides of every boundary. Record every decision the problem statement left open as a test.
- Keep money in whole kobo, round decimals before comparing, and pass "today" in as an input.

Next, [Problem workshop: intermediate](https://zudojs.oyinlola.site/learn/solve-intermediate) uses the same method on lists of data: finding duplicates, counting, searching, grouping, paging and ranking.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
