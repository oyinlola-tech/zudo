---
title: "Advanced inference — ZudoJS Academy"
description: "Learn how TypeScript infers type arguments, contextual types and return types, use const type parameters, and choose satisfies, as or as const."
source: https://zudojs.oyinlola.site/learn/ts-inference-deep
---

LEVEL 6 · LESSON 6 OF 22

Type operators Advanced

# Advanced inference

Learn how TypeScript infers type arguments, contextual types and return types, use const type parameters, and choose satisfies, as or as const.

- **55 min** to read and try
- **You need:** Type inference in depth, Type assertions, Designing generic APIs and Template literal types
- **You build:** A typed route table for a shop API, checked with satisfies, whose route names, roles, paths and link parameters are all inferred from the table itself

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Predict the type arguments TypeScript infers, including when literals are kept or widened
- Explain contextual typing of callbacks and why the order of properties can matter
- Use const type parameters, and know which arguments they affect
- Choose between an annotation, satisfies, as and as const for a table of data, and justify the choice
- Derive unions and helper types from a table checked with satisfies

## A route with no handler

A shop's API keeps its routes in a table: method, path, who may call it, and the function that handles it. A developer adds a refund route in a hurry, forgets the handler, and the compiler says nothing, because the table ends in `as RouteDef[]`:

routes.ts

```ts
type Method = "GET" | "POST" | "PATCH" | "DELETE";

interface RouteDef {
  method: Method;
  path: string;
  auth: "public" | "customer" | "admin";
  handler: (params: Record<string, string>) => { status: number; body: unknown };
}

const ROUTES = [
  { method: "GET", path: "/products", auth: "public", handler: () => ({ status: 200, body: ["Ankara tote", "Enamel mug"] }) },
  { method: "POST", path: "/orders/:orderId/refunds", auth: "admin" },
] as RouteDef[];

function dispatch(method: Method, path: string): string {
  const route = ROUTES.find((r) => r.method === method && r.path === path);
  if (!route) return "404";
  try {
    return JSON.stringify(route.handler({}));
  } catch (error) {
    return String(error);
  }
}

console.log(dispatch("GET", "/products"));
console.log(dispatch("POST", "/orders/:orderId/refunds"));
```

Output of `npx tsx routes.ts` and of the browser terminal

```json
{"status":200,"body":["Ankara tote","Enamel mug"]}
TypeError: route.handler is not a function
```

The `as` told the compiler "trust me, these are routes". An assertion only checks that the two types *overlap*, and a list that contains at least one complete route overlaps with `RouteDef[]`, so the incomplete one rode along. If the author had written `const ROUTES: RouteDef[] = …` instead, the missing handler would have been an error, but then every route would be typed as the general `RouteDef`: the compiler would forget that `/products` is a `GET` route, and could not derive route names or link parameters from the table.

Choosing well between an annotation, `as`, `as const` and `satisfies` requires knowing how TypeScript infers types in the first place. [Type inference in depth](https://zudojs.oyinlola.site/learn/ts-inference) covered variables, widening and the basics of contextual typing; [Designing generic APIs](https://zudojs.oyinlola.site/learn/ts-generic-design#inference) covered designing functions for inference. This lesson goes into the rules behind generic calls, callbacks, return types and `const` type parameters, then builds a route table that is checked *and* keeps every detail.

## How type arguments are inferred

When you call a generic function without writing type arguments, TypeScript **infers** them: it walks each argument alongside its parameter type and collects **candidates** for each type parameter wherever the parameter type mentions it. Then it picks one type per parameter from its candidates. Two questions decide the result: which candidate wins, and whether literal types survive. Here are the rules as checked facts, using the `Equal` and `Expect` helpers from [Type operators](https://zudojs.oyinlola.site/learn/ts-type-operators#typeof):

type-tests.ts

```ts
export type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
export type Expect<T extends true> = T;
```

literals.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

function same<T>(value: T): T {
  return value;
}
function boxed<T>(value: T): { value: T } {
  return { value };
}
function boxedCode<T extends string>(value: T): { value: T } {
  return { value };
}
function listOf<T>(...values: T[]): T[] {
  return values;
}

const a = same("NGN");
let b = same("NGN");
const c = boxed("NGN");
const d = boxedCode("NGN");
const e = listOf("NGN", "USD");

type L1 = Expect<Equal<typeof a, "NGN">>;
type L2 = Expect<Equal<typeof b, string>>;
type L3 = Expect<Equal<typeof c, { value: string }>>;
type L4 = Expect<Equal<typeof d, { value: "NGN" }>>;
type L5 = Expect<Equal<typeof e, string[]>>;

console.log(a, b, c.value, d.value, e.length);
```

Output of `npx tsx literals.ts` and of the browser terminal

```ts
NGN NGN NGN NGN 2
```

The candidate is always the literal type `"NGN"`. What happens next depends on where `T` ends up:

- If `T` is the whole return type, the literal is kept (`L1`), and the usual variable rule then applies: a `let` widens it (`L2`).
- If `T` is only *inside* something, such as a property or an array, TypeScript widens the inferred literal to `string` (`L3`, `L5`), because an object or array that holds it is usually meant to hold other values later.
- If the constraint mentions a primitive type (`T extends string`), the literal is kept even inside (`L4`). A constraint like that is a signal that the exact value matters.

### Competing candidates

When one type parameter gets candidates from several arguments, TypeScript does not simply union them. It widens them and tries to find one candidate that all the others fit into. If there is none, the first one wins and the rest become errors:

candidates.ts

```ts
function pair<T>(first: T, second: T): [T, T] {
  return [first, second];
}

const prices = pair(150_000, 99_900);
const mixed = pair(150_000, "NGN");
```

What `npx tsc --noEmit` prints

```ts
candidates.ts:6:29 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.

6 const mixed = pair(150_000, "NGN");
                              ~~~~~


Found 1 error in candidates.ts:6
```

`prices` is `[number, number]`. For `mixed`, the candidates `number` and `string` have no common supertype among them, so `T` became `number` from the first argument, and the second argument is reported. That is usually what you want: two arguments of "the same type" that are not the same type is a mistake. If mixing is intended, say so: `pair<number | string>(…)`, or give each argument its own type parameter.

## Contextual typing in depth

**Contextual typing** is inference in the other direction: an expression gets its type from the place where it is written. Callbacks are the main case. In `orders.map((order) => …)`, `order` has no annotation, and gets its type from `map`'s parameter type. Inside generic calls this creates a puzzle: the callback's parameter type may depend on a type parameter that other arguments have not determined yet.

TypeScript solves it in passes. Arguments whose types need context (for example an arrow function with unannotated parameters) are called **context sensitive**. They are skipped in the first pass; the other arguments fix the type parameters; then the callbacks are checked with those types. Inside an object literal, properties are processed in order, so the order you write them in can matter:

jobs.ts

```ts
function defineJob<In, Out>(job: { parse: (raw: string) => In; run: (input: In) => Out }) {
  return job;
}

const good = defineJob({
  parse: (raw) => ({ orderId: raw }),
  run: (input) => input.orderId.length,
});

const bad = defineJob({
  run: (input) => input.orderId.length,
  parse: (raw) => ({ orderId: raw }),
});
```

What `npx tsc --noEmit` prints

```ts
jobs.ts:11:19 - error TS18046: 'input' is of type 'unknown'.

11   run: (input) => input.orderId.length,
                     ~~~~~


Found 1 error in jobs.ts:11
```

In `good`, `parse` comes first: its result fixes `In` as `{ orderId: string }`, and `run` is then checked with that type. In `bad`, `run` is reached while `In` is still unknown, so `input` is `unknown`. The fix is to write the producer before the consumer, or to annotate one parameter (`run: (input: { orderId: string }) => …`). When you design an API like this, put the property that *produces* a type first in your documentation and examples.

### What provides a context

A contextual type comes from: a parameter type in a call, an annotated variable, a function's declared return type (for the `return` expression), an array or object literal inside another contextually typed literal, a type assertion, and `satisfies`. It does not travel backwards from a later use: a callback stored in its own variable and passed later has no context, and its parameters are implicitly `any`, as [Type inference in depth](https://zudojs.oyinlola.site/learn/ts-inference#contextual) showed. `satisfies` being on that list turns out to matter a lot, as you will see below.

## Return type inference and its limits

A function without a return type annotation gets the union of the types of all its `return` expressions, widened like a `let`. That works until the function calls itself. A shop's category tree counts the products in a category and all its sub-categories:

tree.ts

```ts
interface Category {
  name: string;
  products: string[];
  children: Category[];
}

function countProducts(category: Category) {
  return category.products.length + category.children.reduce((sum, child) => sum + countProducts(child), 0);
}
```

What `npx tsc --noEmit` prints

```ts
tree.ts:7:10 - error TS7023: 'countProducts' implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.

7 function countProducts(category: Category) {
           ~~~~~~~~~~~~~

tree.ts:8:62 - error TS7024: Function implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.

8   return category.products.length + category.children.reduce((sum, child) => sum + countProducts(child), 0);
                                                               ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


Found 2 errors in the same file, starting at: tree.ts:7
```

To infer the return type of `countProducts`, TypeScript must know the type of `countProducts(child)`, which is the return type it is trying to infer. It gives up and reports it. A return type annotation, `countProducts(category: Category): number`, breaks the circle. Recursive functions are one of the places where an annotation is not a style choice but a requirement; exported functions, whose return type is part of a public contract, are another (see [Deciding what to annotate](https://zudojs.oyinlola.site/learn/ts-inference#when-to-annotate)).

TypeScript never infers *parameter* types from how a function body uses them. A parameter without an annotation and without a context is `any`, which `strict` reports as TS7006. Parameters are the boundary where you tell the compiler what you accept.

## const type parameters

You saw in the first section that literals inside objects and arrays are widened when a type argument is inferred. A **const type parameter**, written `<const T>` (TypeScript 5.0 and later), asks for the opposite: infer `T` as if the caller had written `as const` on the argument. [Tuples](https://zudojs.oyinlola.site/learn/ts-tuples#inference) introduced it; here are its exact rules:

const-params.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

function plain<T>(value: T): T {
  return value;
}
function exact<const T>(value: T): T {
  return value;
}
function exactList<const T extends readonly string[]>(values: T): T {
  return values;
}

const p = plain({ currency: "NGN", methods: ["card", "transfer"] });
const x = exact({ currency: "NGN", methods: ["card", "transfer"] });
const list = exactList(["customer", "admin"]);

const roles = ["customer", "admin"];
const fromVariable = exactList(roles);

type C1 = Expect<Equal<typeof p, { currency: string; methods: string[] }>>;
type C2 = Expect<Equal<typeof x, { readonly currency: "NGN"; readonly methods: readonly ["card", "transfer"] }>>;
type C3 = Expect<Equal<typeof list, readonly ["customer", "admin"]>>;
type C4 = Expect<Equal<typeof fromVariable, string[]>>;

console.log(x.methods.length, list[1], fromVariable.length);
```

Output of `npx tsx const-params.ts` and of the browser terminal

```ts
2 admin 2
```

- `const T` keeps every literal, makes arrays readonly tuples and properties readonly (`C2`, `C3`).
- It only affects literals written **in the call**. A variable already has its type; `roles` was widened to `string[]` when it was declared, and nothing at the call can bring the literals back (`C4`).
- Give array-shaped const parameters a `readonly` constraint, as `exactList` does. A `readonly` tuple is what `const` produces, and a mutable constraint such as `string[]` can make older TypeScript versions fall back to a plain array.

A const type parameter is the function form of `as const`. Library authors use it so their callers do not have to remember `as const`. You will use one at the end of this lesson.

## as const in depth

`as const` is a **const assertion**: it turns off widening for the whole literal, at every level. It can only make a type narrower and read-only, never different, which is why [Type assertions](https://zudojs.oyinlola.site/learn/ts-assertions#alternatives) called it the safe assertion. Three details are easy to miss.

First, it only applies to literals. Second, the `readonly` it adds exists only for the compiler; the object is an ordinary, mutable object at runtime. Third, it checks nothing: a typo inside an `as const` table is kept, precisely and read-only:

as-const.ts

```ts
const METHODS = ["GET", "POST", "GTE"] as const;
const settings = { currency: "NGN", vatPercent: 7.5 } as const;

METHODS.push("PUT");
settings.vatPercent = 10;

const current = "NGN";
const wrong = current.toUpperCase() as const;
```

What `npx tsc --noEmit` prints

```ts
as-const.ts:4:9 - error TS2339: Property 'push' does not exist on type 'readonly ["GET", "POST", "GTE"]'.

4 METHODS.push("PUT");
          ~~~~

as-const.ts:5:10 - error TS2540: Cannot assign to 'vatPercent' because it is a read-only property.

5 settings.vatPercent = 10;
           ~~~~~~~~~~

as-const.ts:8:15 - error TS1355: A 'const' assertion can only be applied to references to enum members, or string, number, boolean, array, or object literals.

8 const wrong = current.toUpperCase() as const;
                ~~~~~~~~~~~~~~~~~~~~~


Found 3 errors in the same file, starting at: as-const.ts:4
```

as-const-runtime.ts

```ts
const settings = { currency: "NGN", vatPercent: 7.5 } as const;

console.log(Object.isFrozen(settings));
Object.assign(settings, { vatPercent: 10 });
console.log(settings.vatPercent);

const frozen = Object.freeze({ currency: "NGN", vatPercent: 7.5 });
try {
  Object.assign(frozen, { vatPercent: 10 });
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx as-const-runtime.ts` and of the browser terminal

```ts
false
10
TypeError: Cannot assign to read only property 'vatPercent' of object '#<Object>'
```

The compiler stops `push` and the assignment, but `Object.assign` (typed loosely) and plain JavaScript code can still change the object. When the value must not change at runtime, add `Object.freeze`, whose return type is already read-only. And notice what the first example did *not* report: `"GTE"`. `as const` preserves; it does not check. For checking, you need an annotation or `satisfies`.

## satisfies in depth

`expression satisfies T` checks that the expression is assignable to `T`, including excess property checks on object literals, and then leaves the expression's own inferred type in place. [Type assertions](https://zudojs.oyinlola.site/learn/ts-assertions#alternatives) introduced it as "check, but keep the precise type". What is less known is that `satisfies` also gives the expression a **contextual type**, and that changes what is inferred inside it:

satisfies-context.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

type Method = "GET" | "POST";

const r1 = { method: "GET", path: "/products" };
const r2 = { method: "GET", path: "/products" } satisfies { method: Method; path: string };
const r3 = { method: "GET", path: "/products" } satisfies { method: string; path: string };

type S1 = Expect<Equal<typeof r1.method, string>>;
type S2 = Expect<Equal<typeof r2.method, "GET">>;
type S3 = Expect<Equal<typeof r3.method, string>>;

const handlers = {
  refund: (orderId) => `refunding ${orderId.toUpperCase()}`,
  cancel: (orderId) => `cancelling ${orderId}`,
} satisfies Record<string, (orderId: string) => string>;

console.log(handlers.refund("ord-7"), r2.method);
```

Output of `npx tsx satisfies-context.ts` and of the browser terminal

```ts
refunding ORD-7 GET
```

- On its own, `method` widens to `string` (`S1`). Under `satisfies` with a literal union, the literal `"GET"` is checked against that union and **kept** (`S2`). With `method: string` in the target, it is widened as usual (`S3`). You get literal types exactly where the target type asks for them, without `as const`.
- The callbacks in `handlers` have no annotations, yet `orderId` is a `string`: `satisfies` provided the context. With `as const` alone, they would be implicit `any` errors.

### Combining as const and satisfies

You need both when you want literal types that the target type does not ask for (for example exact numbers or an exact tuple of names) and a check. The order is fixed: `as const` applies to the literal, then `satisfies` checks the result.

combine.ts

```ts
type Currency = "NGN" | "USD" | "GHS";

const good = ["NGN", "USD"] as const satisfies readonly Currency[];
const typo = ["NGN", "UDS"] as const satisfies readonly Currency[];
const swapped = ["NGN", "USD"] satisfies readonly Currency[] as const;
```

What `npx tsc --noEmit` prints

```ts
combine.ts:4:22 - error TS2322: Type '"UDS"' is not assignable to type 'Currency'.

4 const typo = ["NGN", "UDS"] as const satisfies readonly Currency[];
                       ~~~~~

combine.ts:5:32 - error TS1355: A 'const' assertion can only be applied to references to enum members, or string, number, boolean, array, or object literals.

5 const swapped = ["NGN", "USD"] satisfies readonly Currency[] as const;
                                 ~~~~~~~~~


Found 2 errors in the same file, starting at: combine.ts:4
```

`good` is `readonly ["NGN", "USD"]` and checked. The typo is caught. `satisfies … as const` is refused because `as const` must be applied directly to a literal. Write `readonly` in the target (`readonly Currency[]`) when you want the result read-only; against a mutable array type, current TypeScript quietly gives you a mutable tuple instead.

## Annotation, satisfies, as or as const?

REASON IT OUT

### Before you choose a tool for the route table

You are about to write the shop's route table: about twenty routes, each with a method, a path, a role and a handler. Before reading the comparison, answer for each tool:

- Does it reject a missing handler, and a method spelt `"GTE"`?
- After it, does `typeof routes` still know the route names, so `routes.getOrdr` is an error?
- Does it know that `getOrder`'s path is `"/orders/:orderId"`, so link parameters can be derived?
- Do the handlers' `req` parameters get a type without annotations?
- Which of these properties would you give up, and for what?

**Show the reasoning**

An **annotation** (`const routes: Record<string, RouteDef>`) checks everything and types the handlers, but the variable's type becomes the annotation: every name is a valid key (`routes.getOrdr` compiles and is `undefined`), and every path is just `\`/${string}\``. **`as`** types the handlers but only checks that the two types overlap, which sometimes catches an incomplete route and sometimes, as in the opening example, does not; and the type is again the general one. **`as const`** keeps every detail and checks nothing: `"GTE"` passes and the handler parameters are implicit `any`. **`satisfies`** checks everything, types the handlers through context, keeps the names, and keeps the literal methods, roles and paths because the target type asks for literal unions and a path pattern. For a table you own and derive types from, `satisfies` gives up nothing. An annotation is still right when you *want* the general type: a variable that will be reassigned, or a public export whose details you do not want callers to depend on.

|  | Checks the value | Keeps names and literals | Types callbacks inside | Use it for |
| --- | --- | --- | --- | --- |
| `const x: T = …` | Yes | No: `x` is `T` | Yes | Values that should have exactly the general type (reassigned, exported as a contract) |
| `… satisfies T` | Yes | Yes (literals kept where `T` has literal types) | Yes | Tables and config you own and derive types from |
| `… as const` | No | Yes, all of them, read-only | No | Lists and constants; combine with `satisfies` to check them |
| `… as T` | Barely: only "not unrelated" | No: the result is `T` | Yes | Telling the compiler something it cannot know; never for data you are writing |

## Build: a typed route table

The table lives in one module. The roles and methods are written once as `as const` lists, because the router also needs them at runtime; their unions are derived with `(typeof LIST)[number]` from [Type operators](https://zudojs.oyinlola.site/learn/ts-type-operators#values-to-unions). The table is checked with `satisfies`, and everything else is derived from it:

routes.ts

```ts
export const ROLES = ["public", "customer", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const METHODS = ["GET", "POST", "PATCH", "DELETE"] as const;
export type Method = (typeof METHODS)[number];

export interface Request {
  readonly params: Readonly<Record<string, string>>;
  readonly role: Role;
}
export interface Response {
  readonly status: number;
  readonly body: unknown;
}

export interface RouteDef {
  readonly method: Method;
  readonly path: `/${string}`;
  readonly auth: Role;
  readonly handler: (req: Request) => Response;
}

export const routes = {
  listProducts: {
    method: "GET", path: "/products", auth: "public",
    handler: () => ({ status: 200, body: ["Ankara tote", "Enamel mug"] }),
  },
  getOrder: {
    method: "GET", path: "/orders/:orderId", auth: "customer",
    handler: (req) => ({ status: 200, body: { orderId: req.params.orderId, totalKobo: 1_250_000 } }),
  },
  refundOrder: {
    method: "POST", path: "/orders/:orderId/refunds", auth: "admin",
    handler: (req) => ({ status: 202, body: { refunding: req.params.orderId } }),
  },
} satisfies Record<string, RouteDef>;

export type RouteName = keyof typeof routes;
export type RoutePath<N extends RouteName> = (typeof routes)[N]["path"];
export type AdminRoute = { [N in RouteName]: (typeof routes)[N]["auth"] extends "admin" ? N : never }[RouteName];
```

No route repeats a type, no handler annotates `req`, and yet: `RouteName` is `"listProducts" | "getOrder" | "refundOrder"`; `RoutePath<"getOrder">` is `"/orders/:orderId"`, a literal, because the target's `\`/${string}\`` pattern made `satisfies` keep it; and `AdminRoute`, a mapped type indexed by its own keys, is the union of the route names whose `auth` is `"admin"`, which here is `"refundOrder"`. Add a route and all three follow.

Now two functions that use what was inferred. `link` builds a URL for a route, and takes a params object only when the path has parameters, reusing the `ParamNames` type from [Template literal types](https://zudojs.oyinlola.site/learn/ts-template-literals#parsing). `dispatch` is the runtime router:

router.ts

```ts
import { routes } from "./routes.js";
import type { Response, Role, RouteName, RoutePath } from "./routes.js";

type ParamNames<Path extends string> =
  Path extends `${string}:${infer Param}/${infer Rest}` ? Param | ParamNames<`/${Rest}`>
  : Path extends `${string}:${infer Param}` ? Param
  : never;

type LinkArgs<N extends RouteName> =
  [ParamNames<RoutePath<N>>] extends [never] ? [] : [params: Record<ParamNames<RoutePath<N>>, string>];

export function link<N extends RouteName>(name: N, ...args: LinkArgs<N>): string {
  const [values = {}] = args as [Record<string, string>?];
  return routes[name].path.replace(/:(\w+)/g, (_match, key: string) => encodeURIComponent(values[key]));
}

const RANK: Record<Role, number> = { public: 0, customer: 1, admin: 2 };

export function dispatch(method: string, url: string, role: Role): Response {
  for (const route of Object.values(routes)) {
    if (route.method !== method) continue;
    const pattern = route.path.split("/");
    const parts = url.split("/");
    if (pattern.length !== parts.length) continue;
    const params: Record<string, string> = {};
    const same = pattern.every((segment, i) => {
      if (!segment.startsWith(":")) return segment === parts[i];
      params[segment.slice(1)] = decodeURIComponent(parts[i]);
      return true;
    });
    if (!same) continue;
    if (RANK[role] < RANK[route.auth]) return { status: 403, body: "forbidden" };
    return route.handler({ params, role });
  }
  return { status: 404, body: "not found" };
}
```

- `LinkArgs` is a conditional type producing a *parameter list*: an empty tuple when the path has no parameters, and a one-element tuple otherwise. Spread as `...args`, it makes the second argument exist only when needed. [Advanced functions](https://zudojs.oyinlola.site/learn/ts-advanced-functions#variadic) covers this technique.
- `RANK` is annotated, not `satisfies`: the code indexes it with any `Role` and only needs a number back, so the general type is exactly right.
- `Object.values(routes)` loops over the same table the types come from, so the runtime and the types cannot disagree about which routes exist.

app.ts

```ts
import { dispatch, link } from "./router.js";
import type { AdminRoute } from "./routes.js";

const orderUrl = link("getOrder", { orderId: "ORD-1042" });
console.log(orderUrl, link("listProducts"));
console.log(dispatch("GET", orderUrl, "customer"));
console.log(dispatch("POST", link("refundOrder", { orderId: "ORD-1042" }), "customer"));
console.log(dispatch("POST", "/orders/ORD-1042/refunds", "admin"));
console.log(dispatch("DELETE", "/products", "admin"));

const needsAudit: AdminRoute[] = ["refundOrder"];
console.log("audited routes:", needsAudit.join(", "));
```

Output of `npx tsx app.ts` and of the browser terminal

```ts
/orders/ORD-1042 /products
{ status: 200, body: { orderId: 'ORD-1042', totalKobo: 1250000 } }
{ status: 403, body: 'forbidden' }
{ status: 202, body: { refunding: 'ORD-1042' } }
{ status: 404, body: 'not found' }
audited routes: refundOrder
```

And the compiler now rejects the mistakes that `string` keys and `as` let through:

app-mistakes.ts

```ts
import { link } from "./router.js";

link("getOrdr", { orderId: "ORD-1" });
link("getOrder", { orderID: "ORD-1" });
link("getOrder");
link("listProducts", { orderId: "ORD-1" });
```

What `npx tsc --noEmit` prints

```ts
app-mistakes.ts:3:6 - error TS2345: Argument of type '"getOrdr"' is not assignable to parameter of type '"getOrder" | "listProducts" | "refundOrder"'.

3 link("getOrdr", { orderId: "ORD-1" });
       ~~~~~~~~~

app-mistakes.ts:4:20 - error TS2561: Object literal may only specify known properties, but 'orderID' does not exist in type 'Record<"orderId", string>'. Did you mean to write 'orderId'?

4 link("getOrder", { orderID: "ORD-1" });
                     ~~~~~~~

app-mistakes.ts:5:1 - error TS2554: Expected 2 arguments, but got 1.

5 link("getOrder");
  ~~~~

  router.ts:12:52 - Arguments for the rest parameter 'args' were not provided.
    12 export function link<N extends RouteName>(name: N, ...args: LinkArgs<N>): string {
                                                          ~~~~~~~~~~~~~~~~~~~~

app-mistakes.ts:6:22 - error TS2554: Expected 1 arguments, but got 2.

6 link("listProducts", { orderId: "ORD-1" });
                       ~~~~~~~~~~~~~~~~~~~~


Found 4 errors in the same file, starting at: app-mistakes.ts:3
```

### The other three versions, side by side

For comparison, here is the same kind of table with each of the other tools. The annotated version compiles, including the typo in the lookup, and fails at runtime:

annotated.ts

```ts
import type { RouteDef } from "./routes.js";

const routes: Record<string, RouteDef> = {
  listProducts: { method: "GET", path: "/products", auth: "public", handler: () => ({ status: 200, body: [] }) },
};

try {
  console.log(routes.listProdcts.handler({ params: {}, role: "public" }));
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx annotated.ts` and of the browser terminal

```ts
TypeError: Cannot read properties of undefined (reading 'handler')
```

The `as const` version keeps the typo `"GTE"`, and the compiler only complains about the handler's untyped parameter. The missing method check is not in the output below, because there is none:

as-const-table.ts

```ts
const routes = {
  listProducts: { method: "GTE", path: "/products", auth: "public", handler: (req) => ({ status: 200, body: req }) },
} as const;
```

What `npx tsc --noEmit` prints

```ts
as-const-table.ts:2:79 - error TS7006: Parameter 'req' implicitly has an 'any' type.

2   listProducts: { method: "GTE", path: "/products", auth: "public", handler: (req) => ({ status: 200, body: req }) },
                                                                                ~~~


Found 1 error in as-const-table.ts:2
```

And `as`? On this table, TypeScript does reject an incomplete route:

asserted.ts

```ts
import type { RouteDef } from "./routes.js";

const refundOrder = { method: "POST", path: "/orders/:orderId/refunds", auth: "admin" } as RouteDef;
```

What `npx tsc --noEmit` prints

```ts
asserted.ts:3:21 - error TS2352: Conversion of type '{ method: "POST"; path: "/orders/:orderId/refunds"; auth: "admin"; }' to type 'RouteDef' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Property 'handler' is missing in type '{ method: "POST"; path: "/orders/:orderId/refunds"; auth: "admin"; }' but required in type 'RouteDef'.

3 const refundOrder = { method: "POST", path: "/orders/:orderId/refunds", auth: "admin" } as RouteDef;
                      ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  routes.ts:20:12 - 'handler' is declared here.
    20   readonly handler: (req: Request) => Response;
                  ~~~~~~~


Found 1 error in asserted.ts:3
```

But look at why. The assertion gives the literal a context, so `method` is inferred as the literal `"POST"`, and then neither type is assignable to the other: the object lacks a handler, and a general `RouteDef`, whose method could be `"GET"`, is not a `{ method: "POST" }` either. That protection is accidental. In the opening example, the array held one complete route, the element type became a union that overlapped with `RouteDef`, and the incomplete route passed. A check you cannot predict is not a check. `satisfies` and annotations check every entry, every time.

## Testing what is inferred

Inferred types change silently when the code they come from changes. That is the point, and also the risk: replacing `satisfies` with an annotation during a refactor compiles fine and quietly turns `RouteName` into `string`, which switches off every check in `link`. Type tests pin the inferred facts you depend on:

routes.test.ts

```ts
import { dispatch, link } from "./router.js";
import type { AdminRoute, Role, RouteName, RoutePath } from "./routes.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type R1 = Expect<Equal<RouteName, "listProducts" | "getOrder" | "refundOrder">>;
type R2 = Expect<Equal<RoutePath<"getOrder">, "/orders/:orderId">>;
type R3 = Expect<Equal<AdminRoute, "refundOrder">>;
type R4 = Expect<Equal<Role, "public" | "customer" | "admin">>;

// @ts-expect-error: routes without parameters take no params object
link("listProducts", {});

const cases: [string, string, Role, number][] = [
  ["GET", "/products", "public", 200],
  ["GET", "/orders/ORD-1", "public", 403],
  ["GET", "/orders/ORD-1", "customer", 200],
  ["POST", "/orders/ORD-1/refunds", "admin", 202],
  ["PATCH", "/orders/ORD-1", "admin", 404],
];
for (const [method, url, role, want] of cases) {
  const got = dispatch(method, url, role).status;
  console.log(got === want ? "PASS" : "FAIL", method, url, role, got);
}
console.log(link("getOrder", { orderId: "ORD 1/2" }));
```

Output of `npx tsx routes.test.ts` and of the browser terminal

```ts
PASS GET /products public 200
PASS GET /orders/ORD-1 public 403
PASS GET /orders/ORD-1 customer 200
PASS POST /orders/ORD-1/refunds admin 202
PASS PATCH /orders/ORD-1 admin 404
/orders/ORD%201%2F2
```

`R1` to `R3` would fail the moment someone annotated the table; `R2` in particular guards the literal path that `link` relies on. The runtime table checks the router's decisions, including the 403 that protects customer data, and the last line checks that `link` encodes values, so an ID containing `/` cannot change the route.

## Inference in production

- **Let inference flow from one checked source.** A table written once with `satisfies`, with names and unions derived from it, has one place to change and one place to review.
- **Annotate the boundaries.** Exported functions, recursive functions and public class members get explicit types; inference works inside them. The exception is a table like `routes`, whose inferred type *is* the contract; pin that with type tests instead.
- **Prefer const type parameters in helpers** such as `defineRoutes` and `defineConfig`, so callers get literal types without remembering `as const`.
- **Put producers before consumers** in configuration objects that generic functions infer from, and document that order.
- **Treat `as` on data you write as a code smell.** If you find one, try `satisfies` first; the compiler will usually show you what the `as` was hiding.

## Practice

TRY IT YOURSELF

### Fix the pair

`pair(150_000, "NGN")` fails because both arguments share one type parameter. Rewrite `pair` so it accepts two different types and returns a tuple of exactly those types, then check that `pair(150_000, "NGN")` is `[number, string]`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Give `first` and `second` their own type parameters, `<A, B>`, instead of sharing one `T`.

HINT 2

`function pair<A, B>(first: A, second: B): [A, B] { return [first, second]; }`

SOLUTION

pair.ts

```ts
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

function pair<A, B>(first: A, second: B): [A, B] {
  return [first, second];
}

const price = pair(150_000, "NGN");
type P1 = Expect<Equal<typeof price, [number, string]>>;
console.log(price);
```

Output of `npx tsx pair.ts` and of the browser terminal

```json
[ 150000, 'NGN' ]
```

Each type parameter now has one candidate. The literals are widened because they sit inside a tuple, which is usually what you want for a value you might change; with `<const A, const B>` you would get `[150000, "NGN"]`.

TRY IT YOURSELF

### A checked settings table

Write the shop's settings as one object: `currency` (one of `"NGN" | "USD"`), `vatPercent` (a number), and `paymentMethods` (a list of `"card" | "transfer" | "ussd"`). Make it checked, deeply read-only, and precise enough that `(typeof settings)["paymentMethods"][number]` is exactly the methods you listed.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`Settings` needs three `readonly` fields: `currency: "NGN" | "USD"`, `vatPercent: number`, and `paymentMethods: readonly ("card" | "transfer" | "ussd")[]`.

HINT 2

`const settings = { currency: "NGN", vatPercent: 7.5, paymentMethods: ["card", "transfer"] } as const satisfies Settings;` then `type Enabled = (typeof settings)["paymentMethods"][number];`.

SOLUTION

settings.ts

```ts
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

interface Settings {
  readonly currency: "NGN" | "USD";
  readonly vatPercent: number;
  readonly paymentMethods: readonly ("card" | "transfer" | "ussd")[];
}

const settings = {
  currency: "NGN",
  vatPercent: 7.5,
  paymentMethods: ["card", "transfer"],
} as const satisfies Settings;

type Enabled = (typeof settings)["paymentMethods"][number];
type S1 = Expect<Equal<Enabled, "card" | "transfer">>;
type S2 = Expect<Equal<typeof settings.vatPercent, 7.5>>;

console.log(settings.paymentMethods.join(" and "), settings.currency);
```

Output of `npx tsx settings.ts` and of the browser terminal

```ts
card and transfer NGN
```

`satisfies Settings` rejects a wrong currency, a VAT written as text, or an unknown method; `as const` keeps `["card", "transfer"]` as a tuple, so `Enabled` knows USSD is off. `paymentMethods` in the interface is a `readonly` array, because `as const` produces one.

TRY IT YOURSELF

### defineRoutes

Callers of the route module keep forgetting `satisfies Record<string, RouteDef>`. Write a helper `defineRoutes` that checks a table and returns it with its precise type, so that `const routes = defineRoutes({ … })` has the same inferred type as the `satisfies` version. Prove it with a type test on one path.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Constrain the type parameter to the shape you are checking: `<T extends Record<string, RouteDef>>`. That alone gives you the checking that `satisfies` gives a variable.

HINT 2

Add `const` before the type parameter, `<const T extends Record<string, RouteDef>>`, so object and array literals passed in keep their literal types instead of being widened.

SOLUTION

define-routes.ts

```ts
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

interface RouteDef {
  readonly method: "GET" | "POST";
  readonly path: `/${string}`;
  readonly handler: (params: Readonly<Record<string, string>>) => string;
}

function defineRoutes<const T extends Record<string, RouteDef>>(routes: T): T {
  return routes;
}

const routes = defineRoutes({
  listProducts: { method: "GET", path: "/products", handler: () => "2 products" },
  getOrder: { method: "GET", path: "/orders/:orderId", handler: (params) => `order ${params.orderId}` },
});

type D1 = Expect<Equal<(typeof routes)["getOrder"]["path"], "/orders/:orderId">>;
type D2 = Expect<Equal<keyof typeof routes, "listProducts" | "getOrder">>;

console.log(routes.getOrder.handler({ orderId: "ORD-9" }));
```

Output of `npx tsx define-routes.ts` and of the browser terminal

```ts
order ORD-9
```

The constraint does the checking, like the target of `satisfies`, and also provides the context that types `params`. `const T` keeps the literals. A generic identity function with a constraint is how libraries offered "satisfies" before the operator existed, and it is still the nicest API when a table is written by other people.

## Recap

- Type arguments are inferred from candidates. Literals survive when `T` is the whole result or constrained by a primitive, and are widened inside objects and arrays. With competing candidates, the first wins and the rest are errors.
- Context-sensitive callbacks are checked after the other arguments, and object properties in order: put producers before consumers.
- Recursive functions need a return type annotation (TS7023); parameters are never inferred from use.
- `<const T>` infers as if the caller wrote `as const`, but only for literals written in the call.
- `as const` keeps every literal read-only and checks nothing; it does not freeze at runtime.
- `satisfies` checks, provides context (so callbacks are typed and literal unions stay literal) and keeps the inferred type. `as const satisfies T` combines both, in that order.
- For tables you own: `satisfies`, and derive everything else. Annotate when you want the general type; avoid `as` on data you write.

Next: [Advanced functions](https://zudojs.oyinlola.site/learn/ts-advanced-functions), where overloads, `this` parameters and variadic tuple types turn this kind of table into a type-safe command router.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
