---
title: "TypeScript — ZudoJS Academy"
description: "Add a type system to JavaScript: what TypeScript is and is not, everyday types and inference, unions and narrowing, interfaces, generics, classes, modules, tsconfig, and where types stop and runtime validation begins."
source: https://zudojs.oyinlola.site/learn/typescript
---

LEVEL 5 · TYPESCRIPT

Course Foundation

# TypeScript

Add a type system to JavaScript: what TypeScript is and is not, everyday types and inference, unions and narrowing, interfaces, generics, classes, modules, tsconfig, and where types stop and runtime validation begins.

- **23 lessons**
- **17 h** to read and try
- **Before this:** [JavaScript fundamentals](https://zudojs.oyinlola.site/learn/javascript)

0 of 23 lessons done

[Start lesson 1 →](https://zudojs.oyinlola.site/learn/ts-setup)

## When you finish, you can

- Explain type erasure and why types never validate outside data
- Type functions, objects, arrays and tuples, and know when to let inference work
- Model domain states with literal and discriminated unions
- Narrow unknown values safely with guards and assertion functions
- Write generic functions, interfaces and classes
- Configure a project with tsconfig.json and strict mode
- Validate external data at runtime and return typed errors

**You build:** A typed task manager and a typed CLI calculator

MODULE 1

## Why TypeScript

1. [1**Why TypeScript exists**See a bug that JavaScript runs without complaint, install TypeScript, write a tsconfig.json, and learn the three ways to run TypeScript on Node.js 24.35 min](https://zudojs.oyinlola.site/learn/ts-setup)
2. [2**What the TypeScript compiler does**Follow a TypeScript file through tsc: checking, type erasure, transpiling to older JavaScript, emitted files, watch mode and Node's type stripping.45 min](https://zudojs.oyinlola.site/learn/ts-compiler)

MODULE 2

## Everyday types

1. [3**Basic types**Type strings, numbers, booleans, arrays, tuples and objects, handle null and undefined under strict mode, and meet any, unknown, void and never.35 min](https://zudojs.oyinlola.site/learn/ts-types)
2. [4**Type inference in depth**See how TypeScript works out the types you never wrote (literals, widening, contextual typing, inferred returns) and decide where an annotation pays off.40 min](https://zudojs.oyinlola.site/learn/ts-inference)
3. [5**Typing functions**Type parameters and return values, use optional, default and rest parameters, write function types for callbacks, type async functions, and meet overloads.35 min](https://zudojs.oyinlola.site/learn/ts-functions)
4. [6**Interfaces, unions and literal types**Name object shapes, mark properties optional or readonly, extend and combine them, and model data with several forms using unions and literal types.40 min](https://zudojs.oyinlola.site/learn/ts-objects)
5. [7**Union types in depth**Model real states with discriminated unions, return typed results instead of throwing, combine shapes with intersections, and avoid common union mistakes.50 min](https://zudojs.oyinlola.site/learn/ts-unions)
6. [8**Type aliases and interfaces**Name your domain types once, extend them safely, use declaration merging and recursive types, and learn the real differences between type and interface.45 min](https://zudojs.oyinlola.site/learn/ts-aliases-interfaces)

MODULE 3

## Special types and narrowing

1. [9**Special types: any, unknown, never and friends**Learn what any, unknown, never, void, object, {} and Object really mean, watch one any spread, and use unknown at your program's boundaries.45 min](https://zudojs.oyinlola.site/learn/ts-special-types)
2. [10**Narrowing**Turn wide unions and unknown into precise types with typeof, equality, in, instanceof, discriminants, type guards and assertion functions, and avoid the traps.50 min](https://zudojs.oyinlola.site/learn/ts-narrowing)
3. [11**Type assertions**Learn what as, angle brackets, as unknown as and the non-null ! really do, why none of them check or convert anything, and which safer tool to use instead.40 min](https://zudojs.oyinlola.site/learn/ts-assertions)
4. [12**Enums and their alternatives**Write numeric, string and const enums, read the JavaScript tsc emits for each, avoid their pitfalls, and replace them with unions and as const objects.45 min](https://zudojs.oyinlola.site/learn/ts-enums)
5. [13**Tuples**Type fixed-shape arrays with tuples: optional, rest and named elements, readonly tuples and tuple inference, and return tuples the way useState does.40 min](https://zudojs.oyinlola.site/learn/ts-tuples)

MODULE 4

## Generics and type operators

1. [14**Generics**Write functions, interfaces and classes that work for many types without losing safety, constrain them with extends and keyof, and give them defaults.35 min](https://zudojs.oyinlola.site/learn/ts-generics)
2. [15**Designing generic APIs**Design generic APIs that are easy to call and hard to misuse, and build Repository, Result, Page, ApiResponse, Cache and a typed event emitter.55 min](https://zudojs.oyinlola.site/learn/ts-generic-design)
3. [16**Advanced and utility types**Derive types from one source of truth with keyof, typeof, indexed access and the utility types, and get a first look at mapped, conditional and template types.45 min](https://zudojs.oyinlola.site/learn/ts-advanced)

MODULE 5

## Classes, modules and configuration

1. [17**Classes in TypeScript**Type class properties, use access modifiers and #private, write abstract classes and classes that implement interfaces, and inject dependencies.40 min](https://zudojs.oyinlola.site/learn/ts-classes)
2. [18**Modules in TypeScript**Split a project into files, import types with import type, write .js in import paths, and see how NodeNext, "type": "module" and "exports" fit together.40 min](https://zudojs.oyinlola.site/learn/ts-modules)
3. [19**tsconfig in depth**Learn what every important tsconfig.json option changes, from target, lib and module to each strict flag and verbatimModuleSyntax, with a real tsc run for each.60 min](https://zudojs.oyinlola.site/learn/ts-tsconfig)

MODULE 6

## Types meet the runtime

1. [20**TypeScript and JavaScript together**See why types cannot check data that arrives while the program runs, and close the gap by hand with guards, assertion functions and a validator.45 min](https://zudojs.oyinlola.site/learn/ts-runtime)
2. [21**Runtime validation**See why an annotation on parsed JSON checks nothing, then validate data at runtime with a schema you build, Zod, Valibot and JSON Schema, and infer types.60 min](https://zudojs.oyinlola.site/learn/ts-validation)
3. [22**Typed error handling**Catch errors as unknown, write error classes with a name, a cause and a literal code, return typed results, and handle async failures in a payments service.55 min](https://zudojs.oyinlola.site/learn/ts-errors)
4. [23**Async TypeScript**Type async functions precisely, keep Promise.all tuples intact, narrow allSettled results, use Awaited, and page through an API with async generators.55 min](https://zudojs.oyinlola.site/learn/ts-async)

## Course checkpoint

Prove you can move on. The checkpoint picks 20 questions at random from every lesson in this course. Get 16 right to pass. Your result is saved in this browser only.
