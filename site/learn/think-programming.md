---
title: "What programming is — ZudoJS Academy"
description: "Learn what programs, instructions and algorithms are, see every program as input, processing and output, and solve a real problem with the problem-solving loop."
source: https://zudojs.oyinlola.site/learn/think-programming
---

LEVEL 1 · LESSON 5 OF 18

Think like a programmer Foundation

# What programming is

Learn what programs, instructions and algorithms are, see every program as input, processing and output, and solve a real problem with the problem-solving loop.

- **40 min** to read and try
- **You need:** How programs run and How the web works
- **You build:** A shop receipt and a laundry bill calculator, each planned in plain language before any code

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain what a program, an instruction, an algorithm and a programming language are
- Describe any program as input, processing and output
- Name the inputs, outputs and rules of a small problem before writing code
- Follow the problem-solving loop from understanding a problem to testing and improving it
- Spot a program that runs without errors but gives the wrong answer

## A shop that adds up by hand

Mama Ngozi runs a small provisions shop. When a customer buys three tins of milk at ₦1,200 each and two loaves of bread at ₦1,500 each, she adds it all up on a scrap of paper, takes the money, and works out the change in her head. On a busy Saturday she makes mistakes. Sometimes she gives too much change; sometimes a customer complains that they were charged twice for the same loaf.

Her son says: "I'll write a program for that." Before he types a single line, he has to answer questions that Mama Ngozi never had to think about, because she answers them with common sense every time:

- What exactly goes into the calculation? The price of each item, how many of each, and how much the customer paid.
- In what order? The total has to be known before the change can be worked out.
- What if the customer pays too little? Mama Ngozi would just say "you're short ₦400". A computer has to be told.

This is what programming really is. It is not mostly typing code. It is taking a job that a person does with judgement, and turning it into steps so exact that a machine with no judgement at all can do it correctly, every time, for every customer. This lesson gives you the words for that work, and a method you will use in every lesson that follows.

## Programs and instructions

An **instruction** is one small action a computer can carry out: multiply two numbers, remember a value, print a line of text. A **program** is a list of instructions, in order, that together do a job.

The important word is *exact*. If you tell a person "add up the shopping", they know you mean price times quantity for each item. A computer knows nothing. It carries out exactly the instructions it is given, in exactly the order they are written, and it never asks "did you mean…?".

Here is a tiny program that works out the cost of the milk:

milk.js

```ts
const price = 1200;
const quantity = 3;
const total = price * quantity;
console.log("Total:", total);
```

Output of `node milk.js` and of the browser terminal

```ts
Total: 3600
```

Line by line:

- `const price = 1200;` creates a **variable**: a name that holds a value. Think of a labelled box with `1200` inside. `const` means the box will keep this value. The `;` ends the instruction.
- `const quantity = 3;` is a second box, holding `3`.
- `const total = price * quantity;` looks inside both boxes, multiplies the values (`*` means multiply) and puts the result in a new box called `total`.
- `console.log("Total:", total);` prints. Text goes between quotes. When you give `console.log` several things separated by commas, it prints them on one line with a space between them.

Now watch what "exact" means. This version has one wrong character: `+` instead of `*`.

milk-wrong.js

```ts
const price = 1200;
const quantity = 3;
const total = price + quantity;
console.log("Total:", total);
```

Output of `node milk-wrong.js` and of the browser terminal

```ts
Total: 1203
```

No error, no warning. The computer was told to add, so it added. It has no idea that ₦1,203 is a silly price for three tins of milk. You met this kind of mistake, a **logic error**, in [How programs run](https://zudojs.oyinlola.site/learn/how-programs-run#errors). Because the computer never catches it for you, *you* have to know what the right answer is before you run the program. That habit is the heart of this whole course.

## Algorithms and programming languages

Before you can write a program, you need to know *how* to solve the problem. That method is an **algorithm**: a finite list of precise steps that takes some input and produces the right output. A cooking recipe is close to an algorithm, but it is allowed to say "salt to taste". An algorithm is not: every step must be clear enough that anyone, or anything, following it gets the same result.

Here is an algorithm for totalling a shopping list, written in plain English:

```ts
1. Start with a total of 0.
2. For each item on the list:
     multiply its price by its quantity,
     and add the result to the total.
3. Report the total.
```

Notice that it says nothing about JavaScript. You could follow it with pen and paper, and Mama Ngozi could follow it too. An algorithm is the idea; a program is that idea written in a **programming language**: a language with strict grammar rules that a computer can run. JavaScript, Python, Java, Go and C are all programming languages. The same algorithm can be written in any of them.

Here is the algorithm in JavaScript, for a list of three items:

shopping-total.js

```ts
let total = 0;

total = total + 1200 * 3;   // milk
total = total + 1500 * 2;   // bread
total = total + 300 * 5;    // sachets of pure water

console.log("Total:", total);
```

Output of `node shopping-total.js` and of the browser terminal

```ts
Total: 8100
```

- `let` creates a variable whose value can change later. `total` starts at 0 and grows. (With `const`, the next lines would be an error.)
- `total = total + 1200 * 3;` means: take the current value of `total`, add 3,600, and put the result back into `total`. The right-hand side is worked out first, then stored.
- Multiplication happens before addition, as in maths, so `total + 1200 * 3` is `total + 3600`.
- Everything after `//` on a line is a **comment**: a note for people. The computer ignores it.

Each JavaScript line matches step 2 of the algorithm for one item. Later, in [Algorithms](https://zudojs.oyinlola.site/learn/think-algorithms), you will let a loop do "for each item" for you, however long the list is.

### From your idea to the machine

The text you type in a programming language is **source code**. The processor cannot run source code directly; it only runs **machine code**. [How programs run](https://zudojs.oyinlola.site/learn/how-programs-run#compiler-interpreter) explained the machinery in between. Here is how it all fits together, from a problem in your head to the processor doing the work:

```ts
problem        "Mama Ngozi's totals are wrong"
   |
   v  you think
algorithm      the steps, in plain language
   |
   v  you write
source code    shopping-total.js (JavaScript)
   |
   v  the engine translates
machine code   numbers the processor understands
   |
   v  the processor carries it out,
      inside a runtime (Node.js or a browser)
output         Total: 8100
```

The first two arrows are your job. The last two are done by software someone else wrote. That is why most of programming happens in the top half of this picture.

| Word | Meaning | In the shop example |
| --- | --- | --- |
| Instruction | One action the computer can carry out | Multiply price by quantity |
| Program | A list of instructions that does a job | `shopping-total.js` |
| Algorithm | The precise steps that solve the problem, in any language | "Start at 0, add price × quantity for each item" |
| Programming language | A strict language a computer can run | JavaScript |
| Source code | The program as text written by a person | The lines in the file |
| Compiler / interpreter | Software that translates source code into something the processor can run, before or during the run | V8, the engine inside Node.js and Chrome, does both |
| Runtime | The environment a program runs in: the engine plus tools like printing, files and network | Node.js, which gives you `console.log` |
| Machine execution | The processor actually carrying out machine code | The moment 8100 is calculated |

## Input, processing, output

Every program, from a calculator to a banking system, has the same shape:

- **Input**: the data that comes in. The things the program does not know until it runs.
- **Processing**: the steps that turn the input into a result. This is where the algorithm lives.
- **Output**: what comes out. Something printed, shown, saved or sent.

This is called the **IPO model** (input, processing, output). Here it is for some programs you use every day:

| Program | Input | Processing | Output |
| --- | --- | --- | --- |
| Calculator | Two numbers and an operation | Do the arithmetic | The result on the screen |
| ATM | Card, PIN, amount | Check the PIN, check the balance, subtract | Cash, a receipt, a new balance |
| Web server | An HTTP request | Find or change the data it asks for | An HTTP response |
| Search box | The words you typed | Find matching items and rank them | A list of results |
| Shop till | Prices, quantities, amount paid | Total, then change | A receipt |

The web server row is the one this course builds towards. In [How the web works](https://zudojs.oyinlola.site/learn/how-the-web-works#http) you saw a request go in and a response come out; every backend you write is processing in the middle of that.

Here is Mama Ngozi's receipt as a program, with the three parts marked:

receipt.js

```ts
// Input
const milkPrice = 1200;
const milkQuantity = 3;
const breadPrice = 1500;
const breadQuantity = 2;
const amountPaid = 10000;

// Processing
const total = milkPrice * milkQuantity + breadPrice * breadQuantity;
const change = amountPaid - total;

// Output
console.log("Total: ₦" + total);
console.log("Paid: ₦" + amountPaid);
console.log("Change: ₦" + change);
```

Output of `node receipt.js` and of the browser terminal

```ts
Total: ₦6600
Paid: ₦10000
Change: ₦3400
```

- The input values are written at the top. In a real till they would come from a barcode scanner and a keypad; in a web app, from a form or a request. Writing them in the code keeps these first programs simple. Later lessons read input from real sources.
- `"Total: ₦" + total`: when one side of `+` is text, `+` glues the two together into one piece of text instead of adding.
- The order matters: `change` uses `total`, so `total` must be worked out first.

The whole point of a program is that the processing stays the same while the input changes. Here is the next customer, who buys one tin of milk and three loaves, and pays ₦6,000. Only the input lines are different:

receipt-next.js

```ts
// Input
const milkPrice = 1200;
const milkQuantity = 1;
const breadPrice = 1500;
const breadQuantity = 3;
const amountPaid = 6000;

// Processing
const total = milkPrice * milkQuantity + breadPrice * breadQuantity;
const change = amountPaid - total;

// Output
console.log("Total: ₦" + total);
console.log("Paid: ₦" + amountPaid);
console.log("Change: ₦" + change);
```

Output of `node receipt-next.js` and of the browser terminal

```ts
Total: ₦5700
Paid: ₦6000
Change: ₦300
```

Write the processing once, and it works for every customer. That is why a shop, a bank or a website is worth automating.

> NOTE
>
> "Output" does not always mean printing. A program's output can be a row saved in a database, an SMS sent to a customer, or a response sent back to a browser. In these early lessons, `console.log` is how you see the output.

REASON IT OUT

### Before the receipt goes into a real shop

The receipt program works for the two customers above. Before Mama Ngozi relies on it, think it through without looking at code:

1. Which inputs come from the shop, and which come from the customer?
2. What must be true of each input for the answer to make sense?
3. What should the output be when the customer pays less than the total?
4. What happens if a quantity is 0? Is that a mistake, or fine?

**Show the reasoning**

1. The prices come from the shop. The quantities and the amount paid come from the customer's sale. That difference matters: the shop's own data is usually trustworthy, while anything typed in during a sale can be mistyped.
2. Prices should be positive. Quantities should be whole numbers, zero or more; nobody buys 2.5 loaves or -1 tins. The amount paid should be zero or more.
3. Right now the program would print a negative change, such as `Change: ₦-400`. A person would say "you still owe ₦400". The program needs a decision: if the amount paid is less than the total, print what is still owed instead of change. You will add that in [the section on failures](#failure).
4. A quantity of 0 is fine: the customer simply did not buy that item, and its line adds 0 to the total. Thinking about zero is always worth it; it is the input people forget most often.

## The problem-solving loop

Experienced programmers do not start by typing. They go round a loop of steps, and they go round it more than once:

```ts
1. Understand    What is really being asked?
2. Break down    What smaller problems is it made of?
3. Inputs        What data comes in? What values can it have?
4. Outputs       What exactly must come out?
5. Design steps  Write the algorithm in plain language.
6. Implement     Turn the steps into code.
7. Test          Run it on inputs whose answer you
                 already know. Does it match?
8. Improve       Fix what the tests found, handle
                 new cases, make it clearer.
      |
      +--> back to 1 when something new is learned
```

Watch the loop solve a real problem, one step at a time.

### 1. Understand

A laundry shop writes this on its board:

Wash and iron: ₦500 per shirt, ₦800 per trousers. Bring 10 pieces or more and get ₦1,000 off!

The owner wants a program that works out what a customer pays. First, say it in your own words and ask about anything unclear. Two questions come up straight away:

- Do shirts and trousers count together towards the 10 pieces? The board says "pieces", and the owner confirms: yes, 6 shirts and 4 trousers is 10 pieces.
- Is it ₦1,000 off per piece, or once for the whole order? Once for the whole order.

Those questions took ten seconds to ask. Getting either one wrong would make every bill wrong.

### 2. Break down

The problem is made of smaller ones: count the pieces, price the shirts, price the trousers, add them, decide whether the discount applies, and show the result. Each of those is easy on its own. The next lesson, [Breaking problems down](https://zudojs.oyinlola.site/learn/think-decomposition), is about this step for much bigger problems.

### 3. Inputs and 4. Outputs

- **Inputs:** the number of shirts and the number of trousers. Both are whole numbers, 0 or more. The prices and the discount are fixed rules from the board, not inputs from the customer.
- **Outputs:** the number of pieces, the price before discount (the **subtotal**), the discount, and the amount to pay.

### 5. Design the steps

```ts
1. pieces = shirts + trousers
2. subtotal = shirts × 500 + trousers × 800
3. if pieces is 10 or more, discount = 1000,
   otherwise discount = 0
4. toPay = subtotal − discount
5. show pieces, subtotal, discount, toPay
```

This half-English, half-maths way of writing steps is called **pseudocode**. It has its own lesson, [Pseudocode and flowcharts](https://zudojs.oyinlola.site/learn/think-pseudocode).

### 6. Implement

Here is a first attempt. Step 3 needs a decision, which JavaScript writes with `if`:

laundry-v1.js

```ts
// Input
const shirts = 6;
const trousers = 4;

// Processing
const pieces = shirts + trousers;
const subtotal = shirts * 500 + trousers * 800;
let discount = 0;
if (pieces > 10) {
  discount = 1000;
}
const toPay = subtotal - discount;

// Output
console.log("Pieces:", pieces);
console.log("Subtotal: ₦" + subtotal);
console.log("Discount: ₦" + discount);
console.log("To pay: ₦" + toPay);
```

Output of `node laundry-v1.js` and of the browser terminal

```ts
Pieces: 10
Subtotal: ₦6200
Discount: ₦0
To pay: ₦6200
```

- `let discount = 0;` starts the discount at 0, with `let` because it may change.
- `if (pieces > 10) { … }` runs the lines between the braces only when the condition in brackets is true. Otherwise they are skipped.

### 7. Test

Was that right? You can only tell if you worked out the answer yourself *before* looking at the output. 6 shirts and 4 trousers is 10 pieces, and the board says 10 or more gets ₦1,000 off. So the answer should be ₦5,200, not ₦6,200. The program is wrong.

The bug is `pieces > 10`, which means "more than 10". The rule says "10 or more", which is `pieces >= 10`. This is one of the most common mistakes in programming, and it hides exactly at the **boundary**: the value where the rule switches from one answer to the other. A test with 3 pieces or with 15 pieces would never have found it.

So good tests are chosen on purpose. Write down inputs and expected outputs *before* running anything, and always include the values just below, on, and just above each boundary:

| Shirts | Trousers | Pieces | Expected to pay | Why this test |
| --- | --- | --- | --- | --- |
| 0 | 0 | 0 | ₦0 | Nothing brought: the smallest input |
| 9 | 0 | 9 | ₦4,500 | Just below the boundary: no discount |
| 10 | 0 | 10 | ₦4,000 | Exactly on the boundary: discount |
| 11 | 0 | 11 | ₦4,500 | Just above: discount |
| 6 | 4 | 10 | ₦5,200 | Both kinds together reach 10 |

Here is the fixed program. To try several inputs in one run, it uses a **loop**: a way to repeat instructions. `for (let shirts = 8; shirts <= 11; shirts++)` means "start with `shirts` at 8; while it is 11 or less, run the block; then add 1 to it (`shirts++`) and go again".

laundry-test.js

```ts
const trousers = 0;

for (let shirts = 8; shirts <= 11; shirts++) {
  const pieces = shirts + trousers;
  const subtotal = shirts * 500 + trousers * 800;
  let discount = 0;
  if (pieces >= 10) {
    discount = 1000;
  }
  const toPay = subtotal - discount;
  console.log(pieces, "pieces -> to pay ₦" + toPay);
}
```

Output of `node laundry-test.js` and of the browser terminal

```ts
8 pieces -> to pay ₦4000
9 pieces -> to pay ₦4500
10 pieces -> to pay ₦4000
11 pieces -> to pay ₦4500
```

Every line matches the table. Notice something odd, too: 10 pieces cost less than 9. That is not a bug in the program; it is how the shop's rule works. Testing often teaches you something about the *problem*, and it is worth telling the owner: customers with 9 pieces may start adding a handkerchief to save ₦500.

### 8. Improve

The program is correct for sensible input. Now ask what else can come in. Someone could type `-2` shirts by mistake, and the program would happily print a negative bill. An improvement is to check the input first, with `if` and `else`: `else` is the block that runs when the condition is false.

laundry-v2.js

```ts
const shirts = -2;
const trousers = 3;

if (shirts < 0) {
  console.log("Error: shirts cannot be negative");
} else if (trousers < 0) {
  console.log("Error: trousers cannot be negative");
} else {
  const pieces = shirts + trousers;
  const subtotal = shirts * 500 + trousers * 800;
  let discount = 0;
  if (pieces >= 10) {
    discount = 1000;
  }
  console.log("To pay: ₦" + (subtotal - discount));
}
```

Output of `node laundry-v2.js` and of the browser terminal

```ts
Error: shirts cannot be negative
```

`else if` adds another condition to try when the first one was false. The bill is only calculated when both inputs passed their checks. Checking input before using it is a habit you will keep for the rest of the course; on a server, it is a security rule.

Then the loop starts again. If the owner adds a new rule next month ("20 pieces or more: ₦2,500 off"), you go back to step 1 with the new rule, and step 7 gets new boundary tests at 19 and 20.

## How programs go wrong

The laundry bug showed one way a program fails. Here are the others you will meet most often, all at the level of thinking, before any fancy code.

### Steps in the wrong order

A program runs top to bottom. If a step uses a value before it has been worked out, it uses whatever was there before:

wrong-order.js

```ts
let total = 0;
const amountPaid = 5000;

const change = amountPaid - total;   // too early: total is still 0
total = 1200 * 3;

console.log("Total: ₦" + total);
console.log("Change: ₦" + change);
```

Output of `node wrong-order.js` and of the browser terminal

```ts
Total: ₦3600
Change: ₦5000
```

The customer would get all their money back as "change". The design said "total, then change", and the code did it the other way round.

### A case nobody thought about

The reasoning exercise above asked what happens when a customer pays too little. Here is the answer, and the fix: a decision that treats that case on its own.

short-payment.js

```ts
const total = 6600;
const amountPaid = 6000;

if (amountPaid >= total) {
  console.log("Change: ₦" + (amountPaid - total));
} else {
  console.log("Still to pay: ₦" + (total - amountPaid));
}
```

Output of `node short-payment.js` and of the browser terminal

```ts
Still to pay: ₦600
```

Most real bugs are missing cases, not typing mistakes. The loop's "inputs" step is where you catch them: for every input, ask what values it could have, and what the program should do with each.

### Input that is not what you expected

Anything typed into a keyboard or a web form arrives as **text**, even when it looks like a number. And `+` glues text instead of adding it:

text-input.js

```ts
const itemsTotal = 3600;
const deliveryFee = "500";      // came from a form, so it is text

console.log("Total: ₦" + (itemsTotal + deliveryFee));
console.log("Total: ₦" + (itemsTotal + Number(deliveryFee)));
```

Output of `node text-input.js` and of the browser terminal

```ts
Total: ₦3600500
Total: ₦4100
```

The first line charges over three million naira. `Number(…)` turns the text `"500"` into the number 500, and the second line is right. The lesson is not about `Number`; it is that the program's input is not under your control, so you must check and convert it before you trust it.

### An unclear rule

Some bugs are born before the code. "Add VAT" does not say at what rate, or whether delivery is included. "Customers with more than 10 orders get free delivery" might mean 10 orders this month, or ever. When a rule is unclear, no amount of careful coding will make the program right. Asking the question, in step 1 of the loop, is the fix.

## The same shape at every size

A large program is many small input-processing-output steps joined together: the output of one step becomes the input of the next. Here is a checkout that does three steps in a row:

checkout.js

```ts
// Input
const itemsTotal = 18000;
const isMember = true;
const deliveryFee = 1500;

// Step 1: members get 10% off the items
let discount = 0;
if (isMember) {
  discount = itemsTotal / 10;
}
const afterDiscount = itemsTotal - discount;

// Step 2: delivery is free from ₦15,000 after discount
let delivery = deliveryFee;
if (afterDiscount >= 15000) {
  delivery = 0;
}

// Step 3: the amount to pay
const toPay = afterDiscount + delivery;

console.log("Items: ₦" + itemsTotal);
console.log("Discount: ₦" + discount);
console.log("Delivery: ₦" + delivery);
console.log("To pay: ₦" + toPay);
```

Output of `node checkout.js` and of the browser terminal

```ts
Items: ₦18000
Discount: ₦1800
Delivery: ₦0
To pay: ₦16200
```

`true` is a value meaning "yes"; its opposite is `false`. `if (isMember)` runs its block when `isMember` is `true`. The order of the steps is part of the rule: delivery is decided on the price *after* the discount. Swap the steps and some customers get free delivery they should not.

The backend programs you will write later in this course have exactly this shape. A bank transfer, for example:

- **Input:** the sender's account, the receiver's account, the amount, and who is asking.
- **Processing:** check that the person asking owns the sending account, that the amount is positive, and that the balance is big enough; subtract from one account; add to the other; record the transfer.
- **Output:** a success or failure message, and the new balance.

What changes at that size is not the shape. It is how much can go wrong: thousands of inputs a minute, some of them mistakes and some of them attacks, and outputs that move real money. That is why the rest of this course spends so much time on steps 3, 7 and 8 of the loop: knowing your inputs, testing, and improving.

## Practice

TRY IT YOURSELF

### An ATM withdrawal as input, processing, output

Describe an ATM cash withdrawal in the IPO model, in plain language. Then write a program with these inputs: the balance is ₦25,000 and the customer asks for ₦10,000. It should print the new balance, or `Not enough money` when the amount is larger than the balance. Try it again with a request of ₦30,000.

**Show a solution**

- **Input:** the balance of the account and the amount requested. (A real ATM also takes the card and the PIN.)
- **Processing:** if the amount is not more than the balance, subtract it; otherwise refuse.
- **Output:** the new balance and the cash, or a refusal message.

atm.js

```ts
const balance = 25000;
const amount = 10000;

if (amount <= balance) {
  console.log("Dispense ₦" + amount);
  console.log("New balance: ₦" + (balance - amount));
} else {
  console.log("Not enough money");
}
```

Output of `node atm.js` and of the browser terminal

```ts
Dispense ₦10000
New balance: ₦15000
```

With `const amount = 30000;` it prints `Not enough money`. Did you think about asking for exactly ₦25,000? With `<=` ("less than or equal to") it is allowed and leaves ₦0. With `<` it would be refused: the same boundary bug as the laundry shop.

TRY IT YOURSELF

### How many weeks to save?

Ada wants to save ₦50,000 for a new phone. She can put away ₦7,500 each week. How many weeks until she has enough? First, work it out by hand. Then write a program that adds ₦7,500 at a time and counts the weeks until the savings reach the goal.

**Show a solution**

By hand: 6 weeks gives ₦45,000, which is not enough; 7 weeks gives ₦52,500. So the answer is 7 weeks.

savings.js

```ts
const goal = 50000;
const perWeek = 7500;

let saved = 0;
let weeks = 0;
while (saved < goal) {
  saved = saved + perWeek;
  weeks = weeks + 1;
}

console.log("Weeks:", weeks);
console.log("Saved: ₦" + saved);
```

Output of `node savings.js` and of the browser terminal

```ts
Weeks: 7
Saved: ₦52500
```

`while (saved < goal) { … }` is another loop: it repeats the block as long as the condition is true, checking it again before every round. You knew the answer (7) before running the program, so you could trust the output. Try a goal of ₦45,000: the answer should be exactly 6, because 6 × 7,500 is exactly 45,000. That is the boundary test.

TRY IT YOURSELF

### Walk the loop for a bus fare

A bus company charges ₦300 for trips up to 5 km and ₦500 for longer trips. Children under 5 years old ride free. Go through steps 1 to 5 of the problem-solving loop in plain language: what would you ask, what are the inputs and outputs, and what are the steps? Then implement it and test it with a 5 km trip for an adult, a 6 km trip for an adult, and a 10 km trip for a 4-year-old.

**Show a solution**

1. **Understand:** is 5 km exactly the cheaper fare or the dearer one? ("Up to 5 km" means 5 km is ₦300.) Is a 5-year-old free? ("Under 5" means no.)
2. **Break down:** decide if the rider is free; if not, decide the fare from the distance.
3. **Inputs:** the distance in km (0 or more) and the rider's age in years.
4. **Outputs:** the fare.
5. **Steps:** if age is under 5, the fare is 0; otherwise, if the distance is 5 or less, the fare is 300; otherwise 500.

bus-fare.js

```ts
const distance = 6;
const age = 30;

let fare = 0;
if (age < 5) {
  fare = 0;
} else if (distance <= 5) {
  fare = 300;
} else {
  fare = 500;
}

console.log("Fare: ₦" + fare);
```

Output of `node bus-fare.js` and of the browser terminal

```ts
Fare: ₦500
```

Expected before running: 5 km adult ₦300, 6 km adult ₦500, 10 km child ₦0. Change the two inputs for each case and compare. The age check comes first on purpose: a child is free whatever the distance, so that question must be asked before the distance matters.

## Recap

- A program is a list of exact instructions. The computer does exactly what it is told, in order, and never guesses what you meant.
- An algorithm is the method: finite, precise steps from input to output, independent of any language. A program is an algorithm written in a programming language as source code, which an engine turns into machine execution inside a runtime.
- Every program is input, processing, output. The processing stays the same while the input changes; that is what makes a program worth writing.
- The problem-solving loop: understand, break down, inputs, outputs, design steps, implement, test, improve, and round again.
- Decide the expected answer before you run anything. Test below, on and above every boundary. Most bugs are wrong order, missing cases, unexpected input or unclear rules, and none of them produce an error message.

Next: [Breaking problems down](https://zudojs.oyinlola.site/learn/think-decomposition), breaking a problem as big as "build a bank" into pieces small enough to solve one at a time.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
