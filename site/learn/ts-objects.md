---
title: "Interfaces, unions and literal types"
description: "Name object shapes with interfaces and type aliases, mark properties optional or readonly, extend and combine shapes, and model data that can take several forms with unions, literal types and discriminated unions."
source: https://zudojs.oyinlola.site/learn/ts-objects
---

LESSON 35 OF 84

TypeScript Foundation

# Interfaces, unions and literal types

Name object shapes with interfaces and type aliases, mark properties optional or readonly, extend and combine shapes, and model data that can take several forms with unions, literal types and discriminated unions.

- **40 min** to read and try
- **You need:** Typing functions
- **You build:** A typed user management module with roles, account states and safe profile updates

  [Test yourself](#test)

## Two ways to name a shape

You have written `type Task = { ... }` since [Why TypeScript exists](https://zudojs.oyinlola.site/learn/ts-setup). That is a **type alias**: a name for any type. For object shapes there is a second way, the **interface**. Here is the same user, described both ways:

shapes.ts

```ts
type UserAlias = {
  id: number;
  email: string;
  name: string;
};

interface User {
  id: number;
  email: string;
  name: string;
}

const a: UserAlias = { id: 1, email: "ada@example.com", name: "Ada" };
const b: User = a;
console.log(b.name, b.email);
```

Output of `npx tsx shapes.ts` and of the browser terminal

```ts
Ada ada@example.com
```

Assigning `a` to `b` works even though the names differ. TypeScript compares **shapes**, not names: any object with the right properties fits. This is called **structural typing**.

So which one should you use?

- **interface** only describes objects (and classes). It can be extended with `extends`, and the compiler's error messages show its name.
- **type** can name anything: a union like `"todo" | "done"`, a tuple, a function type. Only a type alias can do those.

A simple rule, and the one ZudoJS follows: **use `interface` for object shapes, and `type` for everything else.**

## Optional and readonly properties

Two marks change how a property behaves:

user.ts

```ts
export interface User {
  readonly id: number;
  email: string;
  name: string;
  nickname?: string;
}

export const ada: User = { id: 1, email: "ada@example.com", name: "Ada Lovelace" };
```

- `readonly id`: once a user exists, nobody may change its id.
- `nickname?`: the question mark makes the property **optional**. A user may have a nickname or not. Its type is `string | undefined`.

Now the compiler guards every user in the program:

guard.tsNode.js only

```ts
import type { User } from "./user.js";

const user: User = { id: 1, email: "ada@example.com", name: "Ada" };

user.id = 2;
user.email = null;
const other: User = { id: 2, name: "Grace" };
console.log(user.nickname.toUpperCase());
```

What `npx tsc --noEmit` prints

```ts
guard.ts:5:6 - error TS2540: Cannot assign to 'id' because it is a read-only property.

5 user.id = 2;
       ~~

guard.ts:6:1 - error TS2322: Type 'null' is not assignable to type 'string'.

6 user.email = null;
  ~~~~~~~~~~

guard.ts:7:7 - error TS2741: Property 'email' is missing in type '{ id: number; name: string; }' but required in type 'User'.

7 const other: User = { id: 2, name: "Grace" };
        ~~~~~

  user.ts:3:3 - 'email' is declared here.
    3   email: string;
        ~~~~~

guard.ts:8:13 - error TS18048: 'user.nickname' is possibly 'undefined'.

8 console.log(user.nickname.toUpperCase());
              ~~~~~~~~~~~~~


Found 4 errors in the same file, starting at: guard.ts:5
```

Four mistakes, four errors. The import says `import type`, because `User` is only a type; [Modules in TypeScript](https://zudojs.oyinlola.site/learn/ts-modules) explains why that matters.

> READONLY IS A COMPILE-TIME PROMISE
>
> Like every type, `readonly` is removed before the code runs. It stops *your code* from changing the id, but plain JavaScript could still change it. Use `Object.freeze` when you need the runtime to enforce it. Also, `readonly` is shallow: a `readonly roles: string[]` cannot be replaced, but you can still `push` into it. Write `readonly roles: readonly string[]` to lock both.

## Extending and combining shapes

Many shapes share properties. An interface can **extend** another, which copies in all its properties and adds more:

extend.ts

```ts
interface Person {
  name: string;
  email: string;
}

interface User extends Person {
  readonly id: number;
}

interface Admin extends User {
  readonly permissions: readonly string[];
}

type Timestamps = { createdAt: string; updatedAt: string };
type StoredUser = User & Timestamps;

const grace: Admin = { id: 2, name: "Grace", email: "grace@example.com", permissions: ["users:write"] };
const stored: StoredUser = {
  id: 1,
  name: "Ada",
  email: "ada@example.com",
  createdAt: "2026-01-05",
  updatedAt: "2026-03-01",
};

function greet(person: Person): string {
  return `Hello, ${person.name}`;
}

console.log(greet(grace), "|", greet(stored), "|", grace.permissions.join(", "));
```

Output of `npx tsx extend.ts` and of the browser terminal

```ts
Hello, Grace | Hello, Ada | users:write
```

- `Admin extends User`: an admin is a user with permissions. Every `Admin` is also a `User` and a `Person`.
- `User & Timestamps` is an **intersection**: a value that has *all* the properties of both. It is the `type` way of combining shapes, and it also works with shapes you did not write yourself.
- `greet` asks only for a `Person`. Both an admin and a stored user have a name and an email, so both are accepted. A function should ask for the smallest shape it needs.

## Unions and literal types

A **union** type, written with `|`, says a value is one of several types. You already used `Task | undefined`. A **literal type** is a type with exactly one value, such as `"admin"`. Put literals in a union and you get a fixed list of allowed values, which is what an `enum` is for in other languages:

role.ts

```ts
type Role = "member" | "editor" | "admin";

const role: Role = "superuser";

let status = "active";
const fixedStatus = "active";
const allowed: "active" | "suspended" = status;
const alsoAllowed: "active" | "suspended" = fixedStatus;
```

What `npx tsc --noEmit` prints

```ts
role.ts:3:7 - error TS2322: Type '"superuser"' is not assignable to type 'Role'.

3 const role: Role = "superuser";
        ~~~~

role.ts:7:7 - error TS2322: Type 'string' is not assignable to type '"active" | "suspended"'.

7 const allowed: "active" | "suspended" = status;
        ~~~~~~~


Found 2 errors in the same file, starting at: role.ts:3
```

The first error is what you expect: `"superuser"` is not a role. The second one is a surprise at first. `status` holds `"active"`, an allowed value, so why is it refused, while `fixedStatus` on the last line is fine?

A `const` can never change, so `fixedStatus` keeps the literal type `"active"`. A `let` gets the wider type `string`. When you want a variable to hold only certain words, annotate it: `let status: "active" | "suspended" = "active"`.

## Narrowing a union

Before you use a union value, you check which member it is. TypeScript follows the check and **narrows** the type inside each branch. You have seen `typeof` and `=== undefined`. For objects, the `in` operator checks whether a property exists:

contact.ts

```ts
type Contact = string | { email: string } | { phone: string; country: string };

function describeContact(contact: Contact): string {
  if (typeof contact === "string") {
    return `name only: ${contact}`;
  }
  if ("email" in contact) {
    return `email ${contact.email}`;
  }
  return `phone +${contact.country} ${contact.phone}`;
}

console.log(describeContact("Ada"));
console.log(describeContact({ email: "ada@example.com" }));
console.log(describeContact({ phone: "20 7946 0000", country: "44" }));
```

Output of `npx tsx contact.ts` and of the browser terminal

```ts
name only: Ada
email ada@example.com
phone +44 20 7946 0000
```

After `typeof contact === "string"` returns, only the two object shapes are left. After the `"email" in contact` check returns, only the phone shape is left, so `contact.country` is allowed on the last line without any check.

## Discriminated unions

The most useful union in real code is the **discriminated union**: several object shapes that share one property with a different literal value in each. That property, often called `kind` or `status`, tells them apart. Here is a user account that is active, invited or suspended, each with its own data:

account.ts

```ts
type AccountState =
  | { kind: "active"; lastLogin: string }
  | { kind: "invited"; invitedBy: number }
  | { kind: "suspended"; reason: string; until: string };

function describeState(state: AccountState): string {
  switch (state.kind) {
    case "active":
      return `active, last login ${state.lastLogin}`;
    case "invited":
      return `invited by user ${state.invitedBy}`;
    case "suspended":
      return `suspended until ${state.until}: ${state.reason}`;
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}

console.log(describeState({ kind: "active", lastLogin: "2026-09-20" }));
console.log(describeState({ kind: "invited", invitedBy: 1 }));
console.log(describeState({ kind: "suspended", reason: "spam", until: "2026-10-01" }));
```

Output of `npx tsx account.ts` and of the browser terminal

```ts
active, last login 2026-09-20
invited by user 1
suspended until 2026-10-01: spam
```

Inside `case "suspended"`, TypeScript knows `state` has `reason` and `until`. Reading `state.reason` in the `"active"` case would be an error. The `default` branch is the exhaustiveness check you learned in [Basic types](https://zudojs.oyinlola.site/learn/ts-types#void-never): add a fourth state and every `switch` that forgot it stops compiling.

Compare this with the alternative, one shape with many optional properties: `{ kind: string; lastLogin?: string; invitedBy?: number; reason?: string; until?: string }`. That allows nonsense like an active user with a suspension reason, and forces a check on every read. With a discriminated union, impossible states cannot even be written.

## Build: a user management module

Put it all together. First the types, in their own file:

user.types.ts

```ts
export type Role = "member" | "editor" | "admin";

export type AccountState =
  | { kind: "active" }
  | { kind: "suspended"; reason: string };

export interface User {
  readonly id: number;
  email: string;
  name: string;
  role: Role;
  state: AccountState;
}

export interface NewUser {
  email: string;
  name: string;
}

export interface ProfileUpdate {
  name?: string;
  email?: string;
}
```

`NewUser` is what someone sends to sign up. It has no `id`, `role` or `state`, because the server decides those, never the client. Now the functions:

users.ts

```ts
import type { NewUser, ProfileUpdate, Role, User } from "./user.types.js";

const users: User[] = [];

export function createUser(input: NewUser): User {
  const user: User = { id: users.length + 1, email: input.email, name: input.name, role: "member", state: { kind: "active" } };
  users.push(user);
  return user;
}

export function changeRole(actor: User, target: User, role: Role): void {
  if (actor.role !== "admin" || actor.state.kind !== "active") {
    throw new Error(`user ${actor.id} may not change roles`);
  }
  target.role = role;
}

export function suspend(actor: User, target: User, reason: string): void {
  if (actor.role !== "admin" || actor.id === target.id) {
    throw new Error(`user ${actor.id} may not suspend user ${target.id}`);
  }
  target.state = { kind: "suspended", reason };
}

export function updateProfile(user: User, changes: ProfileUpdate): void {
  if (changes.name !== undefined) user.name = changes.name;
  if (changes.email !== undefined) user.email = changes.email;
}

export function describe(user: User): string {
  const state = user.state.kind === "active" ? "active" : `suspended (${user.state.reason})`;
  return `#${user.id} ${user.name} <${user.email}> ${user.role}, ${state}`;
}
```

And a program that uses them:

main.ts

```ts
import { changeRole, createUser, describe, suspend, updateProfile } from "./users.js";

const ada = createUser({ email: "ada@example.com", name: "Ada" });
const eve = createUser({ email: "eve@example.com", name: "Eve" });

ada.role = "admin";
changeRole(ada, eve, "editor");
updateProfile(eve, { name: "Eve Smith" });

try {
  changeRole(eve, eve, "admin");
} catch (error) {
  console.log(String(error));
}

suspend(ada, eve, "spam");
console.log(describe(ada));
console.log(describe(eve));
```

Output of `npx tsx main.ts` and of the browser terminal

```ts
Error: user 2 may not change roles
#1 Ada <ada@example.com> admin, active
#2 Eve Smith <eve@example.com> editor, suspended (spam)
```

The first admin is made by hand (`ada.role = "admin"`), as a setup script would do. After that, only an active admin can change roles, and nobody can suspend themselves. Eve, an editor, cannot make herself an admin.

### A security trap the types do not catch

`updateProfile` copies `name` and `email` one by one. It is tempting to write it in one line with the spread you know from [the objects lesson](https://zudojs.oyinlola.site/learn/js-data). This version is **insecure, on purpose**:

insecure.ts

```ts
import type { ProfileUpdate, User } from "./user.types.js";

function updateProfileInsecure(user: User, changes: ProfileUpdate): User {
  return { ...user, ...changes };
}

const eve: User = { id: 2, email: "eve@example.com", name: "Eve", role: "member", state: { kind: "active" } };
const requestBody = JSON.parse('{"name": "Eve", "role": "admin"}');

console.log(updateProfileInsecure(eve, requestBody).role);
```

Output of `npx tsx insecure.ts` and of the browser terminal

```ts
admin
```

This compiles without a single error, and Eve just made herself an admin. The type `ProfileUpdate` says there is no `role`, but the request body is data from outside, and `JSON.parse` returns `any`, which the compiler trusts blindly. At runtime, the spread copies every property the client sent. This is a real and common hole called **mass assignment**.

The fix is the version in `users.ts`: copy only the fields a user may change, by name. Types describe what you *expect*; they do not remove what an attacker *adds*. [TypeScript and JavaScript together](https://zudojs.oyinlola.site/learn/ts-runtime) shows how to check outside data properly.

## Practice

TRY IT YOURSELF

### Add a deleted state

Add a third account state, `{ kind: "deleted"; deletedAt: string }`, to the `AccountState` union in `account.ts`, and run `npx tsc --noEmit`. What does the compiler report, and why is that good? Then handle the new case.

**Show a solution**

The `default` branch of `describeState` fails with an error like `Type '{ kind: "deleted"; deletedAt: string; }' is not assignable to type 'never'`, which points at every `switch` that forgot the new state. Add a case:

deleted.ts

```ts
type AccountState =
  | { kind: "active"; lastLogin: string }
  | { kind: "deleted"; deletedAt: string };

function describeState(state: AccountState): string {
  switch (state.kind) {
    case "active":
      return `active, last login ${state.lastLogin}`;
    case "deleted":
      return `deleted on ${state.deletedAt}`;
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}

console.log(describeState({ kind: "deleted", deletedAt: "2026-09-01" }));
```

Output of `npx tsx deleted.ts` and of the browser terminal

```ts
deleted on 2026-09-01
```

TRY IT YOURSELF

### Shapes for a payment

Model a payment method as a discriminated union: a card (`last4`, `expires`), a bank transfer (`iban`) or cash. Write `label(method)` that prints e.g. `card ending 4242`. Why is a card number's last four digits a `string`, not a `number`?

**Show a solution**

payment.ts

```ts
type PaymentMethod =
  | { kind: "card"; last4: string; expires: string }
  | { kind: "bank"; iban: string }
  | { kind: "cash" };

function label(method: PaymentMethod): string {
  switch (method.kind) {
    case "card":
      return `card ending ${method.last4} (expires ${method.expires})`;
    case "bank":
      return `bank transfer from ${method.iban.slice(0, 4)}…`;
    case "cash":
      return "cash on delivery";
  }
}

console.log(label({ kind: "card", last4: "0042", expires: "12/28" }));
console.log(label({ kind: "bank", iban: "GB33BUKB20201555555555" }));
console.log(label({ kind: "cash" }));
```

Output of `npx tsx payment.ts` and of the browser terminal

```ts
card ending 0042 (expires 12/28)
bank transfer from GB33…
cash on delivery
```

As a number, `0042` would become `42` and lose its leading zeros. Anything you never do arithmetic on, such as card digits, phone numbers and postcodes, is a string. This `switch` has no `default`, and still compiles: the compiler sees that every case returns, so the function cannot reach its end. Add a fourth kind and it reports TS2366, which you met in [Typing functions](https://zudojs.oyinlola.site/learn/ts-functions).

TRY IT YOURSELF

### Who may suspend whom?

In the user module, `suspend` checks that the actor is an admin, but not that the actor is active. A suspended admin can still suspend others. Fix it, and make sure an admin cannot suspend another admin either.

**Show a solution**

suspend.ts

```ts
type Role = "member" | "editor" | "admin";
type AccountState = { kind: "active" } | { kind: "suspended"; reason: string };
interface User {
  readonly id: number;
  role: Role;
  state: AccountState;
}

function suspend(actor: User, target: User, reason: string): void {
  const allowed =
    actor.role === "admin" && actor.state.kind === "active" && target.role !== "admin" && actor.id !== target.id;
  if (!allowed) throw new Error(`user ${actor.id} may not suspend user ${target.id}`);
  target.state = { kind: "suspended", reason };
}

const ada: User = { id: 1, role: "admin", state: { kind: "active" } };
const bob: User = { id: 2, role: "admin", state: { kind: "suspended", reason: "audit" } };
const eve: User = { id: 3, role: "member", state: { kind: "active" } };

const attempts: [User, User][] = [[bob, eve], [ada, bob], [ada, eve]];
for (const [actor, target] of attempts) {
  try {
    suspend(actor, target, "spam");
    console.log(`user ${target.id} suspended`);
  } catch (error) {
    console.log(String(error));
  }
}
```

Output of `npx tsx suspend.ts` and of the browser terminal

```ts
Error: user 2 may not suspend user 3
Error: user 1 may not suspend user 2
user 3 suspended
```

Write permission checks as one clear "allowed" condition, and deny by default: the action only happens when every rule says yes.

## Recap

- Use `interface` for object shapes and `type` for unions, tuples and functions. TypeScript compares shapes, not names.
- `readonly` blocks changes at compile time; `?` makes a property optional (`T | undefined`).
- `extends` builds one interface on another; `A & B` combines two shapes.
- Literal types in a union (`"member" | "admin"`) allow only listed values. `const` keeps literal types; `let` widens to `string`.
- Narrow unions with `typeof`, `in` and equality checks. A discriminated union with an exhaustive `switch` makes impossible states impossible to write.
- Types do not remove extra properties sent by a client. Copy allowed fields by name.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
