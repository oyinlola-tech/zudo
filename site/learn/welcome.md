---
title: "Welcome to the learning path"
description: "What this free course is, who it is for, what you will build, and how the lessons and the terminal on each page work."
source: https://zudojs.oyinlola.site/learn/welcome
---

LESSON 1 OF 84

Start here Foundation

# Welcome to the learning path

What this free course is, who it is for, what you will build, and how the lessons and the terminal on each page work.

- **10 min** to read and try
- **You need:** Nothing. Start here.
- **You build:** A plan for the course, and your first line of code run in the browser

  [Test yourself](#test)

## What this course is

This is a free, hands-on course. It takes you from your first line of JavaScript to a backend running in production.

A **backend** is the part of an application you do not see. When a phone app shows your tasks, the tasks are not stored on the phone. The app asks another computer for them, and a program on that computer answers. That program is the backend. You will learn to write one.

The course is built around four tools, learned in this order:

1. **JavaScript**, the programming language.
2. **Node.js**, the program that runs JavaScript on a server.
3. **TypeScript**, JavaScript with types, which catches many mistakes before the code runs.
4. **ZudoJS**, a framework: a set of ready-made parts for building backends.

ZudoJS is the destination, not the starting point. You first learn how a backend works with no framework at all. Then, when you meet ZudoJS, you know exactly what each part does for you.

## Who it is for

- **Complete beginners.** You have never written code. Start here and follow every lesson in order. Every new word is explained the first time it appears.
- **People who know another language**, like Python, Java or PHP. The first parts will feel quick. Read them anyway: JavaScript has its own surprises.
- **Front-end developers** who know JavaScript in the browser and want to write the server side.
- **TypeScript backend developers** who want to learn ZudoJS itself.

You need a computer running Windows, macOS or Linux, where you can install programs. You do not need to be good at maths.

## What you will build

You learn by building three projects. Each one is bigger than the last.

| Project | Where | What it is |
| --- | --- | --- |
| **Task API** | JavaScript, Node.js, and all the ZudoJS parts | A backend that stores tasks and lets people create, list, update and complete them. You write it first with plain Node.js, then rebuild it with ZudoJS and add a database, users, permissions, events, queues and tests. |
| **BookStore API** | The TypeScript project | A small shop for books, written in TypeScript with no framework. It shows you the problems a framework exists to solve. |
| **ShopFlow** | The capstone, in the Production part | A complete commerce backend: products, orders, users and background work, prepared for deployment. |

## What you will know by the end

- How programs run, how the web works, and the everyday tools of a developer: the terminal, an editor, Git.
- JavaScript: values, functions, objects, classes, errors, asynchronous code and modules.
- Node.js and npm: files, streams, packages and an HTTP server written by hand.
- Backend basics: HTTP, REST API design, databases and SQL with PostgreSQL, and testing.
- TypeScript, and where types stop and runtime checks must begin.
- ZudoJS: dependency injection, routing, configuration, validation, authentication, permissions, caching, events, queues, observability and more.
- Production work: architecture, security, deployment with Docker, and running a real system.

## How the path is structured

The course has 84 lessons in 17 **parts**. A part is a group of lessons on one subject, such as "JavaScript fundamentals" or "Data". You can see every part on the [course overview](https://zudojs.oyinlola.site/learn) and in the sidebar.

Every part and lesson also has one of four **tier** labels. The tier tells you how much you need it:

| Tier | Meaning | Parts |
| --- | --- | --- |
| **Foundation** | You must understand it before moving on. | Start here, JavaScript, Node.js and npm, Backend fundamentals, TypeScript |
| **Core** | Required for everyday ZudoJS work. | The BookStore project, Architecture, Meet ZudoJS, the ZudoJS core, Data, Users and security, Testing and observability |
| **Advanced** | Learn it when your application needs it. | Events and background work, APIs and services, Platform features, Architecture with ZudoJS |
| **Production** | Learn it when you prepare a real application for deployment. | Production |

### Where to start

- **New to programming:** follow every lesson in order, starting with the next one.
- **You already know JavaScript:** read [How the web works](https://zudojs.oyinlola.site/learn/how-the-web-works) if the web is new to you, then skip to [Node.js and npm](https://zudojs.oyinlola.site/learn/node-runtime).
- **You already know TypeScript and backends:** go straight to [Meet ZudoJS](https://zudojs.oyinlola.site/learn/zudo-welcome).

If a later lesson uses something you skipped, it links back to the lesson that teaches it.

## How the lesson pages work

Every lesson page has the same parts. At the top you see how long it takes, what you need first, and what you build. Then come short sections. Each section explains an idea, shows a small example, shows what the example prints, and explains that output. At the end there is a **Practice** section with exercises, and a **Recap**.

### Run in browser

Many examples have a **Run in browser** button. Press it on the example below. A terminal opens at the bottom of the page and runs the code:

welcome.js

```ts
console.log("Hello! I am learning backend development.");
console.log("Lessons in this course:", 84);
```

Output of `node welcome.js` and of the browser terminal

```ts
Hello! I am learning backend development.
Lessons in this course: 84
```

The grey box under the example is its output: what the program printed. The code wrote two lines, so there are two lines of output. You will learn what `console.log` means in [Set up your computer](https://zudojs.oyinlola.site/learn/setup). For now: it prints.

In the browser terminal you can change the code and run it again. Change the first message and press **Run**, or Ctrl + Enter. Nothing you type there can break anything.

### Run it on your computer

Some examples say **Node.js only** instead. They use things a browser cannot do, like reading files or starting a web server. You run those on your own computer. The lesson then shows the exact commands in a box like this one:

Terminal on your computer

```bash
$ node --version
v24.19.0
```

A line that starts with `$` is a command for you to type. Do not type the `$` itself. The lines under it are what the computer printed back. You will install Node.js in [Set up your computer](https://zudojs.oyinlola.site/learn/setup), so do not worry if this command does not work for you yet.

> NOTE
>
> Every output on these pages is real. It was produced by running the code, not typed by hand. If your computer prints something different, compare carefully: often it is a small typing mistake, and finding it is part of learning.

### Mark lessons as done

### The editor

Every example has an **Edit** button, and every lesson has an **Open the editor** button at the top. It opens a workspace that looks and works like Visual Studio Code, the editor most JavaScript developers use: your files on the left, tabs at the top, and a terminal at the bottom. Change the code, press **Run** (or Ctrl + Enter, Cmd + Enter on a Mac), and the output appears in the terminal. You can create your own files too. Everything you type is saved in your browser, so it is still there when you come back. Files in the same folder can import each other, just like on your computer.

### The test

Every lesson ends with **Test yourself**: five questions picked at random from a bank of 30 to 50 about that lesson. Some ask you to choose an answer, some ask what a piece of code prints, and some ask you to write code and run it. Get 4 of 5 right to pass. If you don't pass, read the explanations, look at the lesson again, and take a new test: you get five different questions. Passing marks the lesson as done.

At the bottom of every lesson there is a **Mark this lesson as done** button. Press it when you finish a lesson. The sidebar then shows a tick instead of the lesson's number, and the course overview colours the number green, so you can see where you stopped. Press the button again to undo. This is saved in your browser, on this device only. You do not need an account.

## Practice

TRY IT YOURSELF

### Make it yours

Change the example in [How the lesson pages work](#lesson-pages) so it prints your name and one thing you want to build. Run it in the browser.

**Show a solution**

about-me.js

```ts
console.log("My name is Ada.");
console.log("I want to build an API for my to-do list.");
```

Output of `node about-me.js` and of the browser terminal

```ts
My name is Ada.
I want to build an API for my to-do list.
```

Each `console.log` prints one line. The text inside the quotes is printed exactly as you wrote it.

TRY IT YOURSELF

### Pick your starting point

Read the three descriptions below. For each person, which lesson should they start with?

1. Sam has never written code.
2. Kemi builds websites with JavaScript in the browser, and has never written a server.
3. Lee writes backends in TypeScript every day.

**Show a solution**

1. Sam starts with the next lesson, [Your developer environment](https://zudojs.oyinlola.site/learn/dev-environment), and follows every lesson in order.
2. Kemi reads [How the web works](https://zudojs.oyinlola.site/learn/how-the-web-works) to be sure, then starts at [Node.js and npm](https://zudojs.oyinlola.site/learn/node-runtime).
3. Lee goes straight to [Meet ZudoJS](https://zudojs.oyinlola.site/learn/zudo-welcome), and follows the links back when something is new.

## Recap

- The course goes from JavaScript to Node.js, backend basics, TypeScript, ZudoJS and production. ZudoJS is the destination.
- You build three projects: the Task API, the BookStore API and the ShopFlow capstone.
- Tiers tell you what you must learn (Foundation, Core) and what you learn when you need it (Advanced, Production).
- **Run in browser** examples run on the page. **Node.js only** examples and `$` commands run on your computer. Every output shown is real.

Next you will meet the tools every developer uses: the terminal, an editor and the browser's developer tools.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
