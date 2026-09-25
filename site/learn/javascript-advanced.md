---
title: "Advanced JavaScript — ZudoJS Academy"
description: "How JavaScript really works: this and prototypes, the built-in objects, iterators, generators and symbols, functional techniques, the event loop and asynchronous code in depth, memory, error design and module systems."
source: https://zudojs.oyinlola.site/learn/javascript-advanced
---

LEVEL 4 · JAVASCRIPT

Course Core

# Advanced JavaScript

How JavaScript really works: this and prototypes, the built-in objects, iterators, generators and symbols, functional techniques, the event loop and asynchronous code in depth, memory, error design and module systems.

- **20 lessons**
- **18 h** to read and try
- **Before this:** [JavaScript fundamentals](https://zudojs.oyinlola.site/learn/javascript)

0 of 20 lessons done

[Start lesson 1 →](https://zudojs.oyinlola.site/learn/js-this)

## When you finish, you can

- Explain what this is in any call, and how the prototype chain resolves a property
- Choose between inheritance and composition
- Use strings, numbers, BigInt, dates, regular expressions, Map, Set and weak collections correctly
- Write iterators, generators and custom protocols with symbols
- Predict the order in which synchronous code, microtasks and timers run
- Cancel asynchronous work and limit concurrency
- Find and fix a memory leak
- Design which errors are handled and which propagate

**You build:** A tested utility library: an iterator toolkit, a retrying fetch with cancellation and a memory-safe cache

MODULE 1

## The object model

1. [1**this in depth**Predict this in every kind of call, fix a lost this with call, apply, bind and arrow functions, and write your own bind and bindAll helpers.50 min](https://zudojs.oyinlola.site/learn/js-this)
2. [2**Prototypes in depth**Follow the prototype chain step by step, rewrite new, instanceof and extends yourself, see what a class becomes, and block prototype pollution.55 min](https://zudojs.oyinlola.site/learn/js-prototypes)
3. [3**Inheritance and composition**See why subclasses break when their parent changes, then build behaviour from wrappers, delegation, mixins and functions, and use private fields well.55 min](https://zudojs.oyinlola.site/learn/js-composition)

MODULE 2

## Built-in objects

1. [4**Strings in depth**Measure, cut, normalise, search, sort and format product names with accents and emoji, using code points, graphemes, Intl.Segmenter and Intl.Collator.55 min](https://zudojs.oyinlola.site/learn/js-strings)
2. [5**Numbers in depth**Learn how IEEE-754 doubles store numbers, where precision ends, how to round, parse and format naira amounts exactly, and when to reach for BigInt.55 min](https://zudojs.oyinlola.site/learn/js-numbers)
3. [6**Collections in depth**Choose between Map, Set, WeakMap, WeakSet and WeakRef by how they compare keys, keep order and hold memory; build a bounded cache and object-keyed memos.50 min](https://zudojs.oyinlola.site/learn/js-collections)
4. [7**Dates and time zones**Understand what a Date really stores, parse and format instants safely across Africa/Lagos and UTC, do calendar arithmetic, and store dates correctly in APIs.55 min](https://zudojs.oyinlola.site/learn/js-dates)
5. [8**Regular expressions**Validate phone numbers and order codes, parse log lines with named groups, rewrite text with replacers, and avoid regex patterns that freeze a server.60 min](https://zudojs.oyinlola.site/learn/js-regexp)

MODULE 3

## Iteration and symbols

1. [9**Iterables and iterators**Learn the protocol behind for...of, spread and destructuring, then write your own iterables: a number range and an API paginator that fetches pages lazily.50 min](https://zudojs.oyinlola.site/learn/js-iterators)
2. [10**Generators**Write iterators as ordinary loops with function* and yield, then stream order lines lazily from a paged API into a CSV export, with cleanup that always runs.50 min](https://zudojs.oyinlola.site/learn/js-generators)
3. [11**Symbols**Use symbols as keys that never clash, plug your objects into the language with well-known symbols, and build a Money type that refuses to add naira to dollars.45 min](https://zudojs.oyinlola.site/learn/js-symbols)

MODULE 4

## Functional JavaScript

1. [12**Functional JavaScript**Turn a tangled checkout function into a pipeline of small pure steps, with immutable updates, composition, currying and partial application, and test each step.55 min](https://zudojs.oyinlola.site/learn/js-functional)

MODULE 5

## Asynchronous JavaScript in depth

1. [13**Promises in depth**See exactly what a promise guarantees, how chains pass values and errors along, how thenables work, and how to turn a callback SDK into promises safely.55 min](https://zudojs.oyinlola.site/learn/js-promises)
2. [14**Combining promises**Run independent work in parallel with Promise.all, allSettled, race and any, put a time limit on a slow provider, and choose sequential, parallel or batched.50 min](https://zudojs.oyinlola.site/learn/js-promise-combinators)
3. [15**The event loop**Build an exact model of the call stack, task queue and microtask queue, solve ordering puzzles with it, and keep long jobs from starving timers and requests.50 min](https://zudojs.oyinlola.site/learn/js-event-loop)
4. [16**Concurrency and cancellation**Limit how many jobs run at once with a pool, cancel unneeded work with AbortController, and find and fix the race conditions of concurrent async code.60 min](https://zudojs.oyinlola.site/learn/js-concurrency)

MODULE 6

## How JavaScript runs

1. [17**How JavaScript runs**Follow your code through the engine, from text to tokens, syntax tree, bytecode and machine code, and read sync and async stack traces with confidence.50 min](https://zudojs.oyinlola.site/learn/js-execution)
2. [18**Memory and garbage collection**Learn how the garbage collector decides what to free, cause and fix the classic leaks, and measure memory with process.memoryUsage and heap snapshots.55 min](https://zudojs.oyinlola.site/learn/js-memory)

MODULE 7

## Errors and modules in depth

1. [19**Designing error handling**Decide which layer handles each error, chain causes, collect failures with AggregateError, and build a payment flow that never loses an error.55 min](https://zudojs.oyinlola.site/learn/js-error-design)
2. [20**Module systems in depth**See how ES modules and CommonJS load and interoperate in Node.js 24, resolve packages via exports, load plugins with import(), and untangle circular imports.60 min](https://zudojs.oyinlola.site/learn/js-module-systems)

## Course checkpoint

Prove you can move on. The checkpoint picks 20 questions at random from every lesson in this course. Get 16 right to pass. Your result is saved in this browser only.
