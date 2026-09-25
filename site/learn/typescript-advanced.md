---
title: "Advanced TypeScript — ZudoJS Academy"
description: "The type system in depth: type operators, utility, mapped, conditional and template literal types, inference, variance and branded types, then type-safe events, CQRS and dependency injection, decorators, declaration files, packages, monorepos, type-level tests and compiler performance."
source: https://zudojs.oyinlola.site/learn/typescript-advanced
---

LEVEL 6 · TYPESCRIPT

Course Advanced

# Advanced TypeScript

The type system in depth: type operators, utility, mapped, conditional and template literal types, inference, variance and branded types, then type-safe events, CQRS and dependency injection, decorators, declaration files, packages, monorepos, type-level tests and compiler performance.

- **22 lessons**
- **20 h** to read and try
- **Before this:** [TypeScript](https://zudojs.oyinlola.site/learn/typescript)

0 of 22 lessons done

[Start lesson 1 →](https://zudojs.oyinlola.site/learn/ts-type-operators)

## When you finish, you can

- Derive types from values and other types with keyof, typeof and indexed access
- Write mapped, conditional and template literal types, using infer
- Choose between as, satisfies and as const
- Model a domain with branded types and discriminated unions
- Build type-safe event, command and dependency injection infrastructure
- Write declaration files and publish a typed package
- Test types, and keep a large project fast to compile

**You build:** A typed event bus, a typed dependency injection container and a typed command bus

MODULE 1

## Type operators

1. [1**Type operators**Derive types from values and from other types with keyof, typeof and indexed access, learn their edge cases, and build an order workflow from one table.50 min](https://zudojs.oyinlola.site/learn/ts-type-operators)
2. [2**Utility types**Use and rebuild TypeScript's utility types, from Partial, Pick and Omit to Exclude, ReturnType, Awaited and ThisType, and learn where each one bites.55 min](https://zudojs.oyinlola.site/learn/ts-utility-types)
3. [3**Mapped types**Loop over keys at the type level: change modifiers, remap keys with as, filter and recurse into nested objects, then build a type-safe config system.55 min](https://zudojs.oyinlola.site/learn/ts-mapped-types)
4. [4**Conditional types**Write types that choose a result from their input with extends, infer and recursion, control distribution over unions, and build a retrying payments client.55 min](https://zudojs.oyinlola.site/learn/ts-conditional-types)
5. [5**Template literal types**Build and take apart string types with template literal types, Uppercase and infer, then type routes, permissions and a compile-time safe event name system.50 min](https://zudojs.oyinlola.site/learn/ts-template-literals)
6. [6**Advanced inference**Learn how TypeScript infers type arguments, contextual types and return types, use const type parameters, and choose satisfies, as or as const.55 min](https://zudojs.oyinlola.site/learn/ts-inference-deep)

MODULE 2

## Functions and design styles

1. [7**Advanced functions**Type overloads, call and construct signatures, this parameters, callable objects and variadic tuples, then build a type-safe command router.55 min](https://zudojs.oyinlola.site/learn/ts-advanced-functions)
2. [8**Object-oriented TypeScript**Use encapsulation, abstraction, inheritance, polymorphism, composition and dependency inversion, then compare OOP and functional designs honestly.60 min](https://zudojs.oyinlola.site/learn/ts-oop)
3. [9**Functional TypeScript**Make signatures tell the truth with readonly data, typed composition, Option, Result and algebraic data types, then build a typed pricing and checkout core.55 min](https://zudojs.oyinlola.site/learn/ts-functional)

MODULE 3

## The type system in depth

1. [10**The type system in depth**Learn when one type fits another: structural typing, excess property checks, variance with in and out, computed types, and when a clever type costs too much.60 min](https://zudojs.oyinlola.site/learn/ts-type-system)
2. [11**Branded types**Stop swapped ids and naira-for-kobo bugs at compile time with branded types, validating smart constructors, money units and the ids in @zudojs/constants.50 min](https://zudojs.oyinlola.site/learn/ts-branded-types)
3. [12**Type-safe domain modelling**Model a shop's users, roles, products, orders, payments, events and ledger so illegal states cannot be written: no double payment, no refund before capture.60 min](https://zudojs.oyinlola.site/learn/ts-domain-modeling)

MODULE 4

## Type-safe infrastructure

1. [13**A type-safe event system**Build an event bus where emit("order.placed", payload) only accepts the right payload: typed listeners, unsubscribe, wildcards and their limits.55 min](https://zudojs.oyinlola.site/learn/ts-typed-events)
2. [14**Type-safe CQRS**Build a command bus and a query bus whose requests, handlers and results are checked from one spec, so a missing handler or a wrong result will not compile.55 min](https://zudojs.oyinlola.site/learn/ts-typed-cqrs)
3. [15**A type-safe dependency injection container**Build a DI container with typed tokens, factories and singleton, scoped and transient lifetimes, and learn exactly which wiring errors types cannot catch.55 min](https://zudojs.oyinlola.site/learn/ts-typed-di)
4. [16**Decorators**Write TC39 standard decorators for classes, methods, fields and accessors, see the JavaScript tsc emits, and compare them with experimentalDecorators.60 min](https://zudojs.oyinlola.site/learn/ts-decorators)

MODULE 5

## Libraries and large projects

1. [17**Declaration files**Type an untyped JavaScript naira formatter with a .d.ts file, declare modules and globals, augment interfaces, install @types and generate declarations.55 min](https://zudojs.oyinlola.site/learn/ts-declarations)
2. [18**Publishing TypeScript packages**Build a TypeScript library into JavaScript plus declarations, write package.json exports, check the tarball, handle ESM and CommonJS, and version types.55 min](https://zudojs.oyinlola.site/learn/ts-publishing)
3. [19**TypeScript monorepos**Split a shop backend into core, logger, database, auth and http packages, link with workspaces, build with project references, enforce dependency direction.60 min](https://zudojs.oyinlola.site/learn/ts-monorepos)
4. [20**Testing TypeScript**Test TypeScript code with Vitest, including generics, error paths and typed mocks, then test types themselves with expectTypeOf and vitest --typecheck.55 min](https://zudojs.oyinlola.site/learn/ts-testing)
5. [21**Debugging TypeScript**Read long type errors from the bottom up, make the compiler show inferred types, fix generic inference and module resolution, and tell type from runtime bugs.50 min](https://zudojs.oyinlola.site/learn/ts-debugging)
6. [22**Compiler performance**Measure what tsc spends its work on with --extendedDiagnostics, then keep a large project fast with skipLibCheck, incremental builds and bounded types.50 min](https://zudojs.oyinlola.site/learn/ts-performance)

## Course checkpoint

Prove you can move on. The checkpoint picks 20 questions at random from every lesson in this course. Get 16 right to pass. Your result is saved in this browser only.
