---
title: "How programs run — ZudoJS Academy"
description: "What happens between the code you type and the result on screen: compilers, interpreters, engines and runtimes, and syntax, runtime and logic errors."
source: https://zudojs.oyinlola.site/learn/how-programs-run
---

LEVEL 1 · LESSON 3 OF 18

Start here Foundation

# How programs run

What happens between the code you type and the result on screen: compilers, interpreters, engines and runtimes, and syntax, runtime and logic errors.

- **25 min** to read and try
- **You need:** Welcome to ZudoJS Academy and Your developer environment
- **You build:** Small programs that show the order code runs in, and the three kinds of error: syntax, runtime and logic

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain the difference between source code and machine code, and between a compiler, an interpreter and JIT compilation
- Name the main JavaScript engines and explain what a runtime adds to an engine
- Say which tools JavaScript gets in the browser and in Node.js, and why a server never trusts the browser
- Tell a library from a framework, and a package from a dependency
- Recognise a syntax error, a runtime error and a logic error from what the program prints, and catch a runtime error with try and catch

## Source code

A computer's processor only understands **machine code**: long lists of numbers, each one a tiny instruction like "add these two numbers". Nobody writes that by hand. You write **source code**: text in a programming language that people can read. Then another program turns it into something the processor can do.

Here is a complete JavaScript program. It is three **statements**, three instructions, one per line:

order.js

```ts
console.log("1. Read the tasks");
console.log("2. Count them");
console.log("3. Print the count");
```

Output of `node order.js` and of the browser terminal

```ts
1. Read the tasks
2. Count them
3. Print the count
```

The statements ran from top to bottom, in the order you wrote them. That is the normal rule. Later you will learn ways to repeat, skip or delay statements, but top to bottom is where it starts.

## Compilers, interpreters and runtimes

There are two classic ways to turn source code into something that runs:

|  | Compiler | Interpreter |
| --- | --- | --- |
| What it does | Translates the whole program into machine code *before* it runs, and saves the result as a new file. | Reads the source code and carries it out *while* the program runs. |
| Like… | Translating a whole book, then printing the translation. | An interpreter at a meeting, translating as people speak. |
| Good at | Fast programs. | Starting quickly, and changing code without a build step. |
| Languages | C, C++, Go, Rust | Early JavaScript, Python, Ruby |

Modern JavaScript uses both, with a trick called **JIT** ("just in time") compilation. The engine starts running your code straight away with an interpreter. While it runs, it watches which functions are used again and again. Those "hot" parts are compiled to fast machine code in the background. You get a quick start and fast code, and you never run a compiler yourself.

A program also needs more than a translator. It needs a way to print, read files, talk to the network and wait for timers. The **runtime** is the whole environment a program runs in: the engine plus all those extra tools. `console.log` is one of them: it is given to your code by the runtime.

> NOTE
>
> TypeScript, which you learn later, adds a compile step back: a compiler turns your TypeScript into JavaScript, and that JavaScript then runs as usual.

## JavaScript engines and V8

The program that runs JavaScript is a **JavaScript engine**. There are a few big ones:

- **V8**, made by Google. It runs JavaScript in Chrome and Edge, and it is the engine inside Node.js.
- **SpiderMonkey** in Firefox.
- **JavaScriptCore** in Safari.

All of them follow the same standard, called **ECMAScript**, so the same JavaScript runs in all of them. Node.js is V8 plus the tools a server needs. You can ask Node.js which V8 it contains:

Terminal on your computer

```bash
$ node -p process.versions.v8
13.6.233.17-node.51
```

`node -p` runs one expression and prints the result. Your version number can be different; it depends on your Node.js version.

> NOTE
>
> You install Node.js in [Set up your computer](https://zudojs.oyinlola.site/learn/setup), at the start of the next course. Until then, the commands in this lesson's boxes show you exactly what Node.js prints, and every example without the **Node.js only** label runs in the browser terminal on this page. Come back and try the boxes once Node.js is installed.

## Where JavaScript runs

JavaScript runs in two main places, and each gives it different tools:

|  | In the browser | On the server (Node.js) |
| --- | --- | --- |
| Job | Make web pages react: buttons, forms, animations. | Answer requests, read and write files and databases. |
| Extra tools | `window`, `document` (the page), `localStorage` | `process`, files, network servers |
| Who controls it | The visitor: any code sent to the browser can be read and changed. | You: the code stays on your server. |

`typeof` tells you what kind of value a name holds, or `"undefined"` if it does not exist. Here is what this prints when Node.js runs it on your computer:

where.jsNode.js only

```ts
console.log("window:", typeof window);
console.log("document:", typeof document);
console.log("process:", typeof process);
```

Output of `node where.js`

```ts
window: undefined
document: undefined
process: object
```

Node.js has no page, so it has no `window` and no `document`. It does have `process`, which describes the running program. In a browser tab it is the other way round. The language is the same; the runtime around it is different.

> Never trust the browser
>
> Because the visitor controls the browser, a backend must check everything the browser sends. A check in the web page is a convenience for the user. The real check always happens on the server. This rule comes back in every part of the course.

REASON IT OUT

### Where should the quantity check run?

An online shop's order page has a quantity box. JavaScript in the page refuses any quantity below 1 before the order is sent. The server just multiplies the price by whatever quantity arrives. Before you read on, think it through:

- Who controls the JavaScript that runs in the page? Who controls the code on the server?
- What could a visitor do to get a quantity of `-5` to the server anyway?
- What would a quantity of `-5` do to the bill?
- Is the check in the page useless, then?

**Show the reasoning**

The page's JavaScript is sent to the visitor's browser, and the visitor controls the browser: they can open the devtools and change the code, switch JavaScript off, or skip the page completely and send the request from a program of their own. The server's code stays on the server, where only you can change it.

So a quantity of `-5` can reach the server whenever someone wants it to. Multiplied by the price, it gives a negative amount: the shop would owe the customer money for taking goods. The check that matters is the one on the server, which must refuse any quantity below 1 whatever the page did.

The check in the page is still worth keeping: it tells an honest customer about a typing mistake at once, without waiting for the server. It is a convenience, not a protection. Keep both, and never rely on the first.

### JavaScript is not Java

The names are alike for marketing reasons from 1995, when Java was popular. They are different languages, made by different people, and they work differently. Java code must be compiled before it runs, and you must state the type of every variable. JavaScript runs straight from the source, and does not ask for types. If a job advert or a video says "Java", it does not mean this course.

## Programs, libraries and frameworks

An **executable program** is a file your operating system can start directly. `node` is one (on Windows it is `node.exe`). Your `order.js` is not: it is text. You run it by giving it to Node.js, with `node order.js`.

Most code you run is not written by you. It comes in three shapes:

- A **library** is code you call when you need it. You are in charge. JavaScript comes with a small built-in library, such as `Math`.
- A **framework** is code that calls *your* code. It is in charge: it decides when your pieces run. People say: "you call a library, a framework calls you."
- A **package** is a library, framework or tool published with a name and a version number, so others can install it. **npm** is where JavaScript packages are published. A package your project needs is one of its **dependencies**.

Using a library looks like this. Your code calls it and uses the answer:

library.js

```ts
console.log(Math.max(4, 12, 7));
console.log(Math.round(7.6));
console.log("buy milk".toUpperCase());
```

Output of `node library.js` and of the browser terminal

```ts
12
8
BUY MILK
```

You decided what to call and when. Now a tiny, home-made "framework". You hand it two functions, and it decides when to run them:

framework.js

```ts
function runTaskApp(app) {
  console.log("[framework] starting");
  app.onStart();
  for (const title of ["Buy milk", "Write report"]) {
    app.onTask(title);
  }
  console.log("[framework] stopped");
}

runTaskApp({
  onStart() {
    console.log("My app is ready");
  },
  onTask(title) {
    console.log("New task:", title);
  },
});
```

Output of `node framework.js` and of the browser terminal

```json
[framework] starting
My app is ready
New task: Buy milk
New task: Write report
[framework] stopped
```

You do not need to understand every line yet. Look at the output: your two functions ran, but `runTaskApp` chose the order and how often. ZudoJS works this way: you write the pieces, such as "what to do when a request arrives", and the framework calls them at the right time.

A project lists its dependencies in a file called `package.json`. You will create one in [Set up your computer](https://zudojs.oyinlola.site/learn/setup). When you have installed ZudoJS packages, it contains a part like this:

package.json

```json
{
  "name": "task-api",
  "type": "module",
  "dependencies": {
    "@zudojs/errors": "^1.2.0",
    "@zudojs/schema": "^1.1.1"
  }
}
```

Each line under `dependencies` is a package name and the versions your project accepts.

## Syntax errors and runtime errors

Things go wrong in two very different moments.

### Syntax errors: before anything runs

**Syntax** is the grammar of a language. Before V8 runs a file, it reads the whole file to understand it. If the grammar is broken, nothing runs at all. Save this as `broken.js`. The second line is missing a `)`:

broken.js

```ts
console.log("This line is fine");
console.log("This line is missing a bracket";
```

Press **Run in browser** to see the terminal's message. Here is the same file run with Node.js on a computer:

Terminal on your computer

```bash
$ node broken.js
~/hello-programs/broken.js:2
console.log("This line is missing a bracket";
            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

SyntaxError: missing ) after argument list
    at wrapSafe (node:internal/modules/cjs/loader:1804:18)
…

Node.js v24.19.0
```

Read it from the top. Node.js names the file and the line (`broken.js:2`), shows that line, and marks the place with `^`. Then comes the kind of error, `SyntaxError`, and a message: `missing ) after argument list`. The lines starting with `at` are Node.js's own internals, and you can skip them.

Notice what is *not* there: `This line is fine` was never printed. The mistake is on line 2, yet line 1 did not run either, because the file was rejected as a whole.

### Runtime errors: while the program runs

A **runtime error** happens when the grammar is fine, but a statement cannot be carried out. This program asks for the title of a task that does not exist. Its second line, `const task = undefined;`, creates a name, `task`, and gives it the special value `undefined`, which means "no value at all". `task.title` then asks for the title of nothing:

crash.js

```ts
console.log("Starting");
const task = undefined;
console.log(task.title);
console.log("Never printed");
```

Terminal on your computer

```bash
$ node crash.js
Starting
~/hello-programs/crash.js:3
console.log(task.title);
                 ^

TypeError: Cannot read properties of undefined (reading 'title')
    at Object.<anonymous> (~/hello-programs/crash.js:3:18)
…

Node.js v24.19.0
```

This time `Starting` *was* printed. The program ran line 1 and line 2, then crashed on line 3 and stopped. `Never printed` never ran. The list of `at …` lines is a **stack trace**: the path the program took to reach the error. Its first line points at your file, line 3, column 18.

A program can catch a runtime error and carry on. `try` runs some code, and if it throws an error, `catch` receives it. Every error has a `name` and a `message`:

catch.js

```ts
const task = undefined;

try {
  console.log(task.title);
} catch (error) {
  console.log("Name:", error.name);
  console.log("Message:", error.message);
}

console.log("The program is still running");
```

Output of `node catch.js` and of the browser terminal

```ts
Name: TypeError
Message: Cannot read properties of undefined (reading 'title')
The program is still running
```

Same error, but no crash. A backend must work this way: one bad request must never stop the server for everyone. [Handling errors](https://zudojs.oyinlola.site/learn/js-errors), in the JavaScript course, covers `try` and `catch` in depth.

### Logic errors: no message at all

The hardest mistakes print no error. The program runs, but does the wrong thing. This should print the average of three prices, which is 20:

average.js

```ts
const average = 10 + 20 + 30 / 3;
console.log("Average price:", average);
```

Output of `node average.js` and of the browser terminal

```ts
Average price: 40
```

`const average = …` works out the value on the right and keeps it under the name `average`. As in maths, division happens before addition, so this computed `10 + 20 + 10`. The fix is brackets: `(10 + 20 + 30) / 3`. The only way to catch a logic error is to check the output against what you expected. That is why every example in this course shows its real output, and why you will learn to write tests.

## Practice

TRY IT YOURSELF

### Fix the syntax error

Fix `broken.js` so both lines print, and run it in the browser. (Once Node.js is installed, run it with `node broken.js` too.)

**Show a solution**

fixed.js

```ts
console.log("This line is fine");
console.log("This line is missing a bracket");
```

Output of `node fixed.js` and of the browser terminal

```ts
This line is fine
This line is missing a bracket
```

One `)` was enough. Once the grammar is right, the whole file runs.

TRY IT YOURSELF

### Which kind of error?

For each case, say whether it is a syntax error, a runtime error or a logic error.

1. The program prints nothing at all, and Node.js reports `SyntaxError: Unexpected end of input`.
2. The program prints three lines, then stops with `TypeError`.
3. A shop's total shows 5 when it should show 50, and there is no message.

**Show a solution**

1. A syntax error. Nothing printed because the file was rejected before it ran. "Unexpected end of input" usually means a missing `}` or `)` at the end.
2. A runtime error. The first lines ran, then one statement could not be carried out.
3. A logic error. The code ran without complaint but computed the wrong value.

TRY IT YOURSELF

### Let the framework call you more

Add a third function, `onStop`, to the object you pass to `runTaskApp`, and change `runTaskApp` so it calls it just before `[framework] stopped`. Make it print `Goodbye`. You do not need to know the rules for writing functions yet: copy the shape of `onStart`, and remember the comma between the functions.

**Show a solution**

framework-stop.js

```ts
function runTaskApp(app) {
  console.log("[framework] starting");
  app.onStart();
  for (const title of ["Buy milk", "Write report"]) {
    app.onTask(title);
  }
  app.onStop();
  console.log("[framework] stopped");
}

runTaskApp({
  onStart() {
    console.log("My app is ready");
  },
  onTask(title) {
    console.log("New task:", title);
  },
  onStop() {
    console.log("Goodbye");
  },
});
```

Output of `node framework-stop.js` and of the browser terminal

```json
[framework] starting
My app is ready
New task: Buy milk
New task: Write report
Goodbye
[framework] stopped
```

Your code only says *what* to do on stop. The framework decides *when*. ZudoJS has the same idea for starting and stopping an application, which you will meet in the lesson on the runtime.

## Recap

- You write source code; an engine turns it into machine code. Compilers translate ahead of time, interpreters while running, and JavaScript engines do both with JIT.
- V8 runs JavaScript in Chrome and in Node.js. The runtime around the engine decides what extra tools you get: a page in the browser, files and servers in Node.js.
- You call a library; a framework calls you. A package is published code with a name and version; the packages you use are your dependencies.
- A syntax error stops the whole file before it runs. A runtime error stops the program at one line, unless you catch it. A logic error gives a wrong answer with no message.

Next: [How the web works](https://zudojs.oyinlola.site/learn/how-the-web-works), what happens between a browser and a server when you open a web page.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
