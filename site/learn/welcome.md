---
title: "Welcome to ZudoJS Academy — ZudoJS Academy"
description: "What ZudoJS Academy is, who it is for, its six tracks and 19 levels, the projects you build, how the pages work, and where you should start."
source: https://zudojs.oyinlola.site/learn/welcome
---

LEVEL 1 · LESSON 1 OF 18

Start here Foundation

# Welcome to ZudoJS Academy

What ZudoJS Academy is, who it is for, its six tracks and 19 levels, the projects you build, how the pages work, and where you should start.

- **15 min** to read and try
- **You need:** Nothing. Start here.
- **You build:** A plan for your route through the academy, and your first line of code run in the browser

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain in plain words what a backend is and what the academy teaches you to build
- Name the six tracks in order and say roughly which levels each one covers
- Describe the projects you build, from the Task API to the SaaS capstone
- Use a course page and a lesson page: objectives, Reason it out, examples, the editor, the test and the checkpoint
- Choose the right starting point for your own experience

## What the academy is

Open a banking app and tap "Transfer ₦5,000 to Tunde". Your phone does not move the money. It sends a message to another computer, far away, that says who you are, who Tunde is and how much to send. A program on that computer checks that it is really you, checks that you have ₦5,000, takes it from your account, adds it to Tunde's, writes both changes down so they are never lost, and answers "done". Your phone only shows the answer.

That program is the **backend**: the part of an application you do not see. The screen you tap is the **front end**. The same is true when a to-do app shows your tasks: the tasks are not stored on the phone. The app asks another computer for them, and a backend answers.

**ZudoJS Academy** is a free, hands-on school that teaches you to build backends, from your first line of code to a system running in production. It ends with **ZudoJS**, a **framework** (a set of ready-made, tested parts for building backends in TypeScript). ZudoJS is the destination, not the starting point: you first learn how each part of a backend works with no framework at all. Then, when you meet ZudoJS, you know exactly what each part does for you, and what to do when something goes wrong.

## Who it is for

- **Complete beginners.** You have never written code. Every new word is explained the first time it appears.
- **People who program in another language**, such as Python, Java, PHP or C#, and want to build backends in JavaScript and TypeScript.
- **JavaScript developers**, including front-end developers, who want types and the server side.
- **TypeScript backend developers** who want to learn ZudoJS itself, and later how a framework is built.

You need a computer running Windows, macOS or Linux, where you can install programs. The first levels also work on a phone or tablet, in the browser. You do not need to be good at maths: the mathematics you need is taught in level 1.

## Six tracks, 19 levels

The academy is one path of 19 **levels**. Each level is a **course**. A course is split into **modules** (groups of lessons on one subject), and each module into **lessons**. Level 4 has two courses side by side, so there are 20 courses in total. The levels are grouped into six **tracks**, and each track builds on the ones before it:

| Track | Levels | Courses |
| --- | --- | --- |
| **Thinking** | 1 | Programming thinking: breaking problems down, algorithms, pseudocode, logic and a little mathematics, before serious code |
| **JavaScript** | 2 to 4 | JavaScript fundamentals; Algorithms and data structures; Advanced JavaScript, and JavaScript in the browser and on the server (both level 4) |
| **TypeScript** | 5 to 6 | TypeScript; Advanced TypeScript |
| **Backend engineering** | 7 to 11 | Backend engineering; Database engineering; API engineering; Security; Software design and architecture. All without a framework |
| **ZudoJS** | 12 to 15 | ZudoJS fundamentals; application development; advanced systems; architecture |
| **Production** | 16 to 19 | Distributed systems; Production engineering; Framework engineering; Real-world projects and capstone |

Together the courses hold hundreds of lessons, and new ones are added as they are written. The [academy home](https://zudojs.oyinlola.site/learn) shows every track and course, and the sidebar of each page shows where you are.

Here is your first program. Press **Run in browser** on it. A terminal opens at the bottom of the page and runs the code:

welcome.js

```ts
console.log("Hello! I am learning backend engineering.");
console.log("Tracks:", 6, "Levels:", 19);
```

Output of `node welcome.js` and of the browser terminal

```ts
Hello! I am learning backend engineering.
Tracks: 6 Levels: 19
```

The grey box under the example is its **output**: what the program printed. `console.log` prints one line each time it runs. When you give it several values separated by commas, it prints them on that line with one space between them. The quotes mark where a piece of text starts and ends; they are not printed.

Two more things you can already do with it. `+` between two pieces of text glues them into one, with nothing added in between. Numbers written without quotes are real numbers, so a sum is worked out before it is printed:

join.js

```ts
console.log("Task" + "API");
console.log("Task " + "API");
console.log("Levels after level 1:", 19 - 1);
```

Output of `node join.js` and of the browser terminal

```ts
TaskAPI
Task API
Levels after level 1: 18
```

The second line has a space inside the quotes of `"Task "`, so the joined text has one too. [What programming is](https://zudojs.oyinlola.site/learn/think-programming), later in this course, explains every part of a line like this. For now: it prints.

## What you build

Every course page says what you build in that course. Across the academy, a few projects keep coming back, each bigger than the last:

| Project | Where | What it is |
| --- | --- | --- |
| **Task API** | Plain Node.js at level 4, then ZudoJS from level 12 | A backend that stores tasks and lets people create, list, update and complete them. You write it by hand first, then rebuild it with ZudoJS and grow it with a database, users, permissions, events, background jobs and tests, until it is deployed and monitored. |
| **BookStore API** | TypeScript, level 7 | A small shop for books in TypeScript with PostgreSQL, authentication and tests, built with no framework. It shows you the problems a framework exists to solve. At level 10 you review its security and fix every finding. |
| **Your own mini framework** | Level 11 | A miniature TypeScript framework with a container, a router, middleware and validation, so no framework is ever magic. |
| **ShopFlow** | Capstone, level 19 | A complete commerce backend: products, orders, users and background work, built with ZudoJS and ready to deploy. |
| **SaaS platform** | Capstone, level 19 | A production-grade software-as-a-service platform, where many customer companies share one system safely. |

A **capstone** is a final project that uses everything you have learned.

## How a course page works

Each course has its own page, for example [/learn/javascript](https://zudojs.oyinlola.site/learn/javascript). At the top, a **breadcrumb** line (Academy / track / course) shows where you are. Then the page shows:

- The level and track, and the course's **tier** (explained below).
- How long the course takes, and which course to finish **before this** one.
- A **progress bar** and a button that says **Start lesson 1**, or **Continue where you left off** once you have begun.
- **When you finish, you can**: the skills the course gives you, and **You build**: its project.
- The modules, each with its lessons in order.
- The **course checkpoint**: 20 questions picked at random from the tests of every lesson in the course. Get 16 right to pass. Pass it before you move to the next level.

### Tiers

Every course, and sometimes a single lesson, carries one of four **tier** labels. The tier tells you how much you need it:

| Tier | Meaning | For example |
| --- | --- | --- |
| **Foundation** | You must understand it before moving on. | Programming thinking, JavaScript fundamentals, TypeScript |
| **Core** | Required for everyday ZudoJS development. | Algorithms, Backend engineering, Security, ZudoJS fundamentals |
| **Advanced** | Learn it when your application needs it. | Advanced TypeScript, ZudoJS advanced systems, Distributed systems |
| **Production** | Learn it when you prepare a real application for deployment. | Production engineering, the capstone |

## How a lesson page works

Every lesson page has the same shape. Its header says **LEVEL n · LESSON i OF m**: the level of the course, and where the lesson sits in it. Under that: the module, the time the lesson takes, what you need first and what you build. Then a box, **By the end of this lesson you can**, lists what the lesson teaches. Read it first, and check yourself against it at the end.

The lesson itself is short sections. Each one starts from a problem, shows a small example with its output, and explains that output. Three kinds of box ask you to do something:

- **Reason it out**: questions to think through *before* you see the code. What do you know? What can go wrong? What happens at the edges? Answer them yourself, then open **Show the reasoning** and compare.
- **Try it yourself**: an exercise. Solve it, then open **Show a solution**.
- **Note**, **Tip** and **Warning** boxes: short facts worth remembering.

### Run in browser, and on your computer

You already met **Run in browser**. In the terminal you can change the code and run it again with **Run** or Ctrl + Enter. Nothing you type there can break anything. Try it: change the second line of the example below to print your own plan, and run it.

plan.js

```ts
console.log("Level 1: Programming thinking");
console.log("Level 2: JavaScript fundamentals");
console.log("Goal:", "a backend in production");
```

Output of `node plan.js` and of the browser terminal

```ts
Level 1: Programming thinking
Level 2: JavaScript fundamentals
Goal: a backend in production
```

The lines run from top to bottom, so the output comes in the same order as the code.

Some examples say **Node.js only** instead. They use things a browser is not allowed to do, like reading your files or starting a web server, so you run them on your own computer. The lesson then shows the exact commands in a box like this one:

Terminal on your computer

```bash
$ node --version
v24.19.0
```

A line that starts with `$` is a command for you to type. Do not type the `$` itself. The lines under it are what the computer printed back (your version number may differ). You install Node.js in [Set up your computer](https://zudojs.oyinlola.site/learn/setup), so do not worry if this command does not work for you yet.

> NOTE
>
> Every output on these pages is real. It was produced by running the code, in Node.js and in the browser terminal, not typed by hand. If your computer prints something different, compare carefully: often it is a small typing mistake, and finding it is part of learning.

### The editor

Every example has an **Edit** button, and every lesson has an **Open the editor** button at the top. The editor is a workspace that looks and works like Visual Studio Code: your files on the left, tabs at the top, and a terminal at the bottom. Change the code, press **Run** (Ctrl + Enter, or Cmd + Enter on a Mac), and the output appears in the terminal. You can create your own files, and files in the same folder can import each other, just like on your computer.

### The test

Every lesson ends with **Test yourself**: five questions picked at random from a bank of 30 to 50 about that lesson. Some ask you to choose an answer, some ask what a piece of code prints, and some ask you to write code and run it. Get 4 of 5 right to pass, and the lesson is marked as done. If you don't pass, read the explanations, look at the lesson again, and take a new test: you get five different questions. You can also press **Mark this lesson as done** yourself.

### Your progress stays in this browser

Finished lessons, test results, checkpoints and the files you write in the editor are saved in **this browser, on this device only**. There is no account and nothing is sent anywhere. That is why the progress bars and **Continue where you left off** know where you stopped. Open the academy in another browser or on another device and it starts fresh; clear your browser's site data and your progress is gone.

## Where to start

You do not have to start at level 1. Pick the first row that describes you:

| If you… | Start at |
| --- | --- |
| have never written code | The next lesson, [Your developer environment](https://zudojs.oyinlola.site/learn/dev-environment), and follow every level in order |
| program in another language | [JavaScript fundamentals](https://zudojs.oyinlola.site/learn/javascript) (level 2) |
| already know JavaScript | [TypeScript](https://zudojs.oyinlola.site/learn/typescript) (level 5) |
| already build TypeScript backends | [ZudoJS fundamentals](https://zudojs.oyinlola.site/learn/zudo-fundamentals) (level 12) |

When a later lesson uses something you skipped, it links back to the lesson that teaches it. A quick way to find your gaps is the course checkpoint: take the checkpoint of a course you think you know. If you pass, move on; if you don't, the questions you missed tell you which lessons to read.

REASON IT OUT

### Is skipping ahead a good idea?

Kemi builds websites with JavaScript in the browser. She wants to reach ZudoJS quickly and thinks about jumping straight to level 12. Before you read the reasoning, think it through:

- What does Kemi already know, and what does she not know yet?
- ZudoJS is written in TypeScript and runs on a server. What would she meet in level 12 that she has never seen?
- What can go wrong if she skips too much? What does it cost if she starts a little too early instead?
- How could she find out, in a few minutes, whether a course is new to her?

**Show the reasoning**

Kemi knows the JavaScript language and the browser. She does not yet know TypeScript's types, how a backend handles HTTP requests, databases or security. ZudoJS lessons assume all of those: they show you what ZudoJS does *for* you, which only makes sense if you know the problem it solves. If she jumps to level 12, every lesson would pile up words she has never met, and she would copy code without understanding why it works.

Starting a little too early costs much less: some lessons feel easy, and she reads them quickly. So the table sends her to [TypeScript](https://zudojs.oyinlola.site/learn/typescript) at level 5. She can still move fast: before each course, she takes its checkpoint. A pass means she can skip that course; a failure shows exactly which lessons to read.

## Practice

TRY IT YOURSELF

### Make it yours

Change the first example so it prints your name and one backend you want to build. Run it in the browser.

**Show a solution**

about-me.js

```ts
console.log("My name is Ada.");
console.log("I want to build:", "a booking API for my salon");
```

Output of `node about-me.js` and of the browser terminal

```ts
My name is Ada.
I want to build: a booking API for my salon
```

Each `console.log` prints one line. The text inside the quotes is printed exactly as you wrote it, and two values separated by a comma are printed with one space between them.

TRY IT YOURSELF

### Pick a starting point

For each person, where should they start?

1. Sam has never written code.
2. Chidi writes Python scripts at work and has never used JavaScript.
3. Kemi builds websites with JavaScript and has never used types.
4. Lee writes TypeScript backends every day.

**Show a solution**

1. Sam starts with the next lesson, [Your developer environment](https://zudojs.oyinlola.site/learn/dev-environment), and follows every level in order.
2. Chidi starts at [JavaScript fundamentals](https://zudojs.oyinlola.site/learn/javascript). Level 1 is about thinking like a programmer, which he already does; the language is what is new.
3. Kemi starts at [TypeScript](https://zudojs.oyinlola.site/learn/typescript), and uses each course's checkpoint to decide what she can skip.
4. Lee goes straight to [ZudoJS fundamentals](https://zudojs.oyinlola.site/learn/zudo-fundamentals), and follows the links back when something is new.

## Recap

- A backend is the program on another computer that stores data, checks every request and answers the app. The academy teaches you to build one.
- The academy is 19 levels in six tracks: Thinking, JavaScript, TypeScript, Backend engineering, ZudoJS and Production. Each level is a course of modules and lessons. ZudoJS is the destination.
- You build the Task API (plain Node.js, then ZudoJS), the BookStore API in TypeScript, your own mini framework, and two capstones: ShopFlow and a SaaS platform.
- Tiers tell you what you must learn (Foundation, Core) and what you learn when you need it (Advanced, Production).
- Lesson pages have objectives, Reason it out boxes, runnable examples with real output, the editor, exercises and a test. Course pages end with a checkpoint of 20 questions: 16 to pass. Progress is saved in this browser only.
- Beginners start at the next lesson; other programmers at JavaScript; JavaScript developers at TypeScript; TypeScript backend developers at ZudoJS fundamentals.

Next, in [Your developer environment](https://zudojs.oyinlola.site/learn/dev-environment), you meet the tools every developer uses: the terminal, a code editor and the browser's developer tools.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
