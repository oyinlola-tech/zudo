---
title: "Set up your computer"
description: "Install Node.js, run your first JavaScript file, and learn the two places you will run code in this course."
source: https://zudojs.oyinlola.site/learn/setup
---

LESSON 1 OF 10

JavaScript for the backend

# Set up your computer

Install Node.js, run your first JavaScript file, and learn the two places you will run code in this course.

- **15 min** to read and try
- **You need:** A computer where you can install programs
- **You build:** A hello-zudo folder with your first program

## What a backend is

When you open an app on your phone and see your tasks, the tasks are not stored on the phone. The app asks another computer for them, and that computer answers. The program on that other computer is the **backend**.

A backend receives requests, checks them, reads and writes data, and sends answers back. In this course you will write one in JavaScript, then TypeScript, using ZudoJS.

JavaScript started inside web browsers. **Node.js** is a program that runs JavaScript outside the browser, on a server or on your own computer. ZudoJS needs Node.js 24 or newer.

## Two places to run code

Every example in this course has a **Run in browser** button. Press it on the example below. A terminal opens at the bottom of the page, runs the code, and prints the result.

hello.js

```ts
console.log("Hello from Node.js!");
```

Output of `node hello.js` and of the browser terminal

```ts
Hello from Node.js!
```

`console.log` prints whatever you give it. It is the first tool every JavaScript developer reaches for when they want to see what their code is doing.

The browser terminal is for trying things quickly. The real backend will run on your computer, so the rest of this lesson installs Node.js there.

> NOTE
>
> In the browser terminal you can change the code and press **Run** again, or press Ctrl + Enter. Try changing the message.

## Open a terminal

A terminal is a window where you type commands instead of clicking. Backend developers use it all day.

- **Windows:** press the Start button, type `PowerShell`, and open **Windows PowerShell**.
- **macOS:** press Cmd + Space, type `Terminal`, and press Enter.
- **Linux:** press Ctrl + Alt + T on most desktops.

In this course, a line that starts with `$` is a command for you to type. Type everything after the `$`, then press Enter. The lines under it are what the computer prints back.

## Install Node.js

1. Go to [nodejs.org/en/download](https://nodejs.org/en/download).
2. Download the **LTS** version for your system. LTS means long-term support: the stable version most companies run. It must be version 24 or newer.
3. Run the installer and accept the defaults.
4. Close your terminal and open a new one, so it finds the new program.

Now check that it worked:

Terminal on your computer

```bash
$ node --version
v24.19.0
$ npm --version
11.19.0
```

Your numbers can be higher. What matters is that `node --version` starts with `v24` or more. `npm` comes with Node.js. It installs packages, which are pieces of code other people published, such as ZudoJS.

> WATCH OUT
>
> If your terminal says `command not found` or `is not recognized`, close every terminal window and open a new one. If it still fails, restart your computer: the installer adds Node.js to your system's search path, and some systems only pick that up after a restart.

## Run your first program on your computer

Make a folder for the course and go into it. `mkdir` makes a folder and `cd` moves into it:

Terminal on your computer

```bash
$ mkdir hello-zudo
$ cd hello-zudo
```

Open the folder in your editor. In VS Code you can type `code .` in the terminal. Create a file called `hello.js` with the same line as before:

hello.jsNode.js only

```ts
console.log("Hello from Node.js!");
```

Save it, then run it with Node.js:

Terminal on your computer

```bash
$ node hello.js
Hello from Node.js!
```

You just ran JavaScript outside a browser. That is all a backend is at the start: a JavaScript file that Node.js runs.

## Turn the folder into a project

Every Node.js project has a file called `package.json`. It records the project's name and the packages it uses. npm can write one for you:

Terminal on your computer

```bash
$ npm init -y
Wrote to /home/you/hello-zudo/package.json:

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

Look at the last line: `"type": "commonjs"`. JavaScript has two ways of splitting code into files. **CommonJS** is the old one. **ES modules** are the modern one, and every ZudoJS package uses them. Switch the project over now:

Terminal on your computer

```bash
$ npm pkg set type=module
```

That command prints nothing when it works. Open `package.json` and the last line now says `"type": "module"`. You will learn what modules are in lesson 5.

## Practice

TRY IT YOURSELF

### Print three lines

Change `hello.js` so it prints your name, what you want to build, and the number of lessons in this course (10). Run it in the browser, then on your computer.

**Show a solution**

about-me.js

```ts
console.log("My name is Ada");
console.log("I want to build a task API");
console.log("Lessons in this course:", 10);
```

Output of `node about-me.js` and of the browser terminal

```ts
My name is Ada
I want to build a task API
Lessons in this course: 10
```

`console.log` can take several values separated by commas. It prints them on one line with a space between them.

## Recap

- A backend is a program on another computer that answers requests. Node.js runs JavaScript there.
- The browser terminal on these pages runs examples instantly. Your computer is where the real project lives.
- `node file.js` runs a file. `npm init -y` creates `package.json`, and `npm pkg set type=module` switches it to ES modules.

Next you will learn the building blocks of every program: values, variables and functions.
