---
title: "Set up your computer — ZudoJS Academy"
description: "Install Node.js, try JavaScript in the Node.js REPL, write and run your first program, and turn its folder into a project."
source: https://zudojs.oyinlola.site/learn/setup
---

LEVEL 2 · LESSON 2 OF 19

Getting started Foundation

# Set up your computer

Install Node.js, try JavaScript in the Node.js REPL, write and run your first program, and turn its folder into a project.

- **30 min** to read and try
- **You need:** Meet JavaScript, How programs run and Your developer environment, and a computer where you can install programs
- **You build:** A hello-zudo project folder with your first program

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Install Node.js 24 or newer and check the versions of node and npm
- Try expressions in the Node.js REPL and know when a file is the better tool
- Run a JavaScript file with node and turn its folder into an ES module project
- Read a syntax error and a ReferenceError: file and line, error name and message
- Predict which lines of a broken file run before it fails

## From this page to your computer

In [Meet JavaScript](https://zudojs.oyinlola.site/learn/js-intro) you ran code in the browser terminal on the page. That is perfect for trying things, but a backend does not run in a browser tab. It runs as a program on a computer, and the program that runs JavaScript outside the browser is **Node.js**: the V8 engine plus a runtime (a host, in the words of [Meet JavaScript](https://zudojs.oyinlola.site/learn/js-intro#engines-hosts)) that can read files, talk to the network and read the keyboard. ZudoJS needs Node.js 24 or newer.

The same code runs in both places. Press **Run in browser**, then keep reading to run it on your own computer:

hello.js

```ts
console.log("Hello from Node.js!");
```

Output of `node hello.js` and of the browser terminal

```ts
Hello from Node.js!
```

`console.log` prints whatever you give it. It is the first tool every JavaScript developer reaches for when they want to see what their code is doing. The rest of this lesson installs Node.js, runs this line from a file, and shows you how to read the errors you will meet first.

## Install Node.js

Open a terminal first. If you are not sure how, [Your developer environment](https://zudojs.oyinlola.site/learn/dev-environment#terminal) shows you on Windows, macOS and Linux.

1. Go to [nodejs.org/en/download](https://nodejs.org/en/download).
2. Download the **LTS** version for your system. LTS means long-term support: the stable version most companies run. It must be version 24 or newer.
3. Run the installer and accept the defaults.
4. Close your terminal and open a new one, so it finds the new program.

Now check that it worked. `--version` asks a program which version it is:

Terminal on your computer

```bash
$ node --version
v24.19.0
$ npm --version
11.19.0
```

Your numbers can be higher. What matters is that `node --version` starts with `v24` or more. `npm` comes with Node.js. It installs **packages**, which are pieces of code other people published, such as ZudoJS.

> WATCH OUT
>
> If your terminal says `command not found` or `is not recognized`, close every terminal window and open a new one. If it still fails, restart your computer: the installer adds Node.js to your system's PATH, the list of folders where the shell looks for programs, and some systems only pick that up after a restart.

## Try JavaScript in the REPL

Type `node` on its own and press Enter. Node.js starts the **REPL**: Read, Evaluate, Print, Loop. It reads one line of JavaScript, runs it, prints the result, and waits for the next. The prompt changes to `>`. Here is a real session:

Terminal on your computer

```bash
$ node
Welcome to Node.js v24.19.0.
Type ".help" for more information.
> 1 + 2
3
> 10 * 3 - 4
26
> "Buy " + "milk"
'Buy milk'
> const tasks = ["Buy milk", "Write report"]
undefined
> tasks.length
2
> console.log("Hello from the REPL")
Hello from the REPL
undefined
> .exit
```

- Each line after `>` is what was typed. The line under it is the result.
- `'Buy milk'` is text, so the REPL shows it in quotes.
- `const tasks = …` stores a list under the name `tasks`. Storing a value produces no result, so the REPL prints `undefined`, which means "no value". The next line uses the stored list: it has 2 items.
- `console.log` printed its text, then the REPL printed `undefined` because `console.log` itself gives back no value.
- `.exit` leaves the REPL. Pressing Ctrl + C twice, or Ctrl + D, does the same.

The REPL is great for a quick question, like "what does this give?". Everything you type is lost when you leave it. For real programs, you write files.

## Run your first program on your computer

Make a folder for the course and go into it:

Terminal on your computer

```bash
$ mkdir hello-zudo
$ cd hello-zudo
```

Open the folder in your editor with `code .`, or with **File → Open Folder**. Create a file called `hello.js` with the same line as before:

hello.jsNode.js only

```ts
console.log("Hello from Node.js!");
```

Save it, then give the file to Node.js:

Terminal on your computer

```bash
$ node hello.js
Hello from Node.js!
```

`node hello.js` means "run the file `hello.js` in the current folder". If the file is in another folder, give its path, such as `node src/app.js`. When you change the file, save it and run the same command again. Press Up to get the command back.

You just ran JavaScript outside a browser. That is all a backend is at the start: a JavaScript file that Node.js runs.

## Turn the folder into a project

Every Node.js project has a file called `package.json`. It records the project's name and the packages it uses. npm can write one for you:

Terminal on your computer

```bash
$ npm init -y
Wrote to ~/hello-zudo/package.json:

{
  "name": "hello-zudo",
  "version": "1.0.0",
  "description": "",
  "main": "hello.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "commonjs"
}
```

On your computer the first line shows the full path of your folder. Look at the last line of the file: `"type": "commonjs"`. JavaScript has two ways of splitting code into files. **CommonJS** is the old one. **ES modules** are the modern one, and every ZudoJS package uses them. Switch the project over now:

Terminal on your computer

```bash
$ npm pkg set type=module
```

That command prints nothing when it works. Open `package.json` and the last line now says `"type": "module"`. You will learn what modules are in the [lesson on modules](https://zudojs.oyinlola.site/learn/js-modules). Every project in this course starts with these two commands.

## Statements and comments

A program is a list of **statements**, instructions that run one after another from top to bottom. Each statement usually sits on its own line and ends with a semicolon (`;`).

A **comment** is a note for people. Node.js skips it completely. `//` starts a comment that runs to the end of the line. `/*` and `*/` wrap a comment over several lines. Create `tasks.js`:

tasks.js

```ts
// This program prints a short task list.
// Node.js skips every line that starts with two slashes.

console.log("My tasks for today:");
console.log("- Buy milk"); // a comment can also end a line
console.log("- Write report");

/*
  A comment can span several lines.
  It is a good place to explain why the code is written this way.
*/
console.log("Tasks:", 2, "Done:", 0);
```

Output of `node tasks.js` and of the browser terminal

```ts
My tasks for today:
- Buy milk
- Write report
Tasks: 2 Done: 0
```

Four `console.log` statements ran, so four lines were printed. None of the comments appear in the output. The last line shows that `console.log` can take several values separated by commas: it prints them on one line with a space between them. Text goes in quotes; numbers do not.

Run it on your computer with `node tasks.js` and you see the same four lines.

> TIP
>
> Write comments that explain *why*, not *what*. `// print the tasks` above `console.log(tasks)` tells the reader nothing new.

## Your first errors

Everybody types mistakes. The trick is to read what Node.js tells you. Here are the two you will meet first.

### A missing quote

This `typo.js` forgets the closing `"`:

typo.js

```ts
console.log("Hello from Node.js!);
```

Terminal on your computer

```bash
$ node typo.js
file://~/hello-zudo/typo.js:1
console.log("Hello from Node.js!);
            ^^^^^^^^^^^^^^^^^^^^^^

SyntaxError: Invalid or unexpected token
    at compileSourceTextModule (node:internal/modules/esm/utils:318:16)
…

Node.js v24.19.0
```

This is a **syntax error**, as you saw in [How programs run](https://zudojs.oyinlola.site/learn/how-programs-run#errors): the file breaks JavaScript's grammar, so nothing in it runs. The first line points at the file and the line number (`typo.js:1`). The `^^^` marks start at the unclosed text. "Unexpected token" means "I found something here that does not belong". On your computer the first line shows the full path.

### A capital letter

JavaScript is **case-sensitive**: `console` and `Console` are different names. This one is not a grammar mistake, so the file starts, and then fails at that line:

capital.js

```ts
Console.log("Hello from Node.js!");
```

Terminal on your computer

```bash
$ node capital.js
file://~/hello-zudo/capital.js:1
Console.log("Hello from Node.js!");
^

ReferenceError: Console is not defined
    at file://~/hello-zudo/capital.js:1:1
…

Node.js v24.19.0
```

`ReferenceError` means "you used a name that does not exist". The fix is a small `c`. You can see the error's name and message without the crash by catching it:

catch-typo.js

```ts
try {
  Console.log("Hello from Node.js!");
} catch (error) {
  console.log(error.name + ":", error.message);
}
```

Output of `node catch-typo.js` and of the browser terminal

```ts
ReferenceError: Console is not defined
```

When you get an error, read three things: the **file and line** at the top, the **error name** (`SyntaxError`, `ReferenceError`, `TypeError`), and the **message** after it. Skip the `at node:internal…` lines: they are inside Node.js, not your code.

REASON IT OUT

### Before you run it: which lines print?

This file has two mistakes. Before you run it, decide what the terminal will show.

```ts
console.log("Starting the shopping list");
Console.log("- Bread");
console.log("- Milk";
```

- Does `Starting the shopping list` print? It comes before both mistakes.
- Which error does Node.js report: the `ReferenceError` on line 2 or the `SyntaxError` on line 3?
- After you fix line 3, what changes?

**Show the reasoning**

**Nothing prints.** Node.js reads (parses) the whole file before it runs any of it. Line 3 is missing a `)`, so the file is not valid JavaScript, and Node.js stops with a `SyntaxError` pointing at line 3 before running line 1.

**A `ReferenceError` is found only while running.** `Console.log(…)` is perfectly good grammar: a name, a dot, a call. Whether the name `Console` exists is only checked when that line runs. So once line 3 is fixed, the file starts, line 1 prints `Starting the shopping list`, and line 2 throws `ReferenceError: Console is not defined`. Line 3 never runs.

That gives you a quick way to tell the two apart: if *nothing* printed, suspect a syntax error; if some lines printed and then it stopped, the error happened while running, at the first line that did not print.

## Practice

TRY IT YOURSELF

### Print three lines

Change `hello.js` so it prints your name, what you want to build, and the year JavaScript was created (1995, from [Meet JavaScript](https://zudojs.oyinlola.site/learn/js-intro#history)) as a number. Run it in the browser, then on your computer.

**Show a solution**

about-me.js

```ts
console.log("My name is Ada");
console.log("I want to build a task API");
console.log("JavaScript was created in", 1995);
```

Output of `node about-me.js` and of the browser terminal

```ts
My name is Ada
I want to build a task API
JavaScript was created in 1995
```

`console.log` can take several values separated by commas. It prints them on one line with a space between them.

TRY IT YOURSELF

### Use the REPL as a calculator

Start `node` and work out how many minutes there are in a week (7 days of 24 hours of 60 minutes). Then leave the REPL. Do the same in a file, with `console.log`.

**Show a solution**

In the REPL, type `7 * 24 * 60` and press Enter, then `.exit`. In a file:

week.js

```ts
console.log("Minutes in a week:", 7 * 24 * 60);
```

Output of `node week.js` and of the browser terminal

```ts
Minutes in a week: 10080
```

TRY IT YOURSELF

### Fix three mistakes

This program has three mistakes. Run it, read each error, fix it, and run it again until it prints both lines.

broken-list.js

```ts
console.log("Shopping list:);
Console.log("- Bread");
console.log("- Milk"
```

**Show a solution**

fixed-list.js

```ts
console.log("Shopping list:");
console.log("- Bread");
console.log("- Milk");
```

Output of `node fixed-list.js` and of the browser terminal

```ts
Shopping list:
- Bread
- Milk
```

Line 1 was missing a `"`. Line 3 was missing a `)`, and the `;` is good style. Both are syntax errors, so Node.js reports one of them first and runs nothing. Line 2 used `Console` with a capital C, a `ReferenceError` you only see once the syntax errors are fixed.

## Recap

- JavaScript is the language; Node.js is the runtime that runs it on your computer and on servers. You need Node.js 24 or newer: check with `node --version`.
- `node` alone opens the REPL for quick experiments. `node file.js` runs a file.
- `npm init -y` creates `package.json`, and `npm pkg set type=module` switches it to ES modules.
- A program is statements run top to bottom. Comments (`//` and `/* */`) are notes for people.
- Read errors in three parts: file and line, error name, message.

Next, [Values, variables and types](https://zudojs.oyinlola.site/learn/js-values): the building blocks of every program.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
