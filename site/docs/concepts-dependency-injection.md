---
title: "Dependency Injection"
description: "Dependency injection in ZudoJS: a token-based container with singleton, transient and scoped lifetimes and circular dependency detection."
source: https://zudojs.oyinlola.site/docs/concepts-dependency-injection
---

v1.0.0

# Dependency Injection

Token-based DI container with scoped lifecycles and module awareness.

DI CONTAINER TOKENS

## Overview

*Dependency injection* means a piece of code is handed the things it needs instead of creating them itself. The thing that does the handing is a *container*.

You register a value in the container under a *token* — a named key. Later, any code with the same token asks the container for it and gets it back. Nobody has to know how it was built.

That matters most in tests. Swap what is registered under a token and every caller quietly uses the replacement, with no changes to the code being tested.

> **Source of truth**
>
> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release. The container shown here is the one built into @zudojs/core.

## Tokens

A token is just a key. The container accepts a string, a symbol, or a class as one. createToken<T>(description) makes a fresh symbol for you and carries the type T, so resolve() hands back a properly typed value.

Prefer createToken over a bare string. Two different parts of your app can accidentally pick the same string; two calls to createToken can never collide.

```ts
import { createToken } from "@zudojs/core";

interface Clock { now(): number; }

const ClockToken = createToken<Clock>("Clock");

console.log(typeof ClockToken);           // "symbol"
console.log(ClockToken.toString());       // "Symbol(Clock)"
```

## Registering and Resolving

A *provider* tells the container how to produce the value for a token. There are three kinds, and each is a small object.

| Provider | What it means | Use it when |
| --- | --- | --- |
| `{ useValue: v }` | Hand back `v` exactly as given | Config objects, already-built instances, test doubles |
| `{ useClass: C }` | Call `new C()` with no arguments | Classes that need nothing to construct |
| `{ useFactory: (c) => … }` | Run your function, passing the container itself | Anything that needs other tokens first |

This complete program registers a port number and builds a connection string from it. Note that the factory receives the container, so it can resolve other tokens.

```ts
import { Container, createToken } from "@zudojs/core";

const PortToken = createToken<number>("Port");
const UrlToken = createToken<string>("Url");

const container = new Container();

container.register(PortToken, { useValue: 5432 });
container.register(UrlToken, {
  useFactory: (c) => `postgres://localhost:${c.resolve(PortToken)}`,
});

console.log(container.resolve(UrlToken));   // "postgres://localhost:5432"
console.log(container.has(PortToken));       // true
```

**What you should see.** postgres://localhost:5432, then true.

Other methods: unregister(token) removes one entry, clear() empties the container, and createScope() is covered below.

> **Watch out**
>
> useClass in the core container constructs with no arguments. If your class needs its collaborators passed in, use useFactory, or reach for [@zudojs/container](https://zudojs.oyinlola.site/docs/packages-container.md), which supports an inject list.

## Lifetimes

The third argument to register says how long an instance lives. It defaults to "singleton".

| Lifetime | How many instances | Good for |
| --- | --- | --- |
| `"singleton"` | One, built on first resolve and reused forever | Connection pools, caches, loggers |
| `"transient"` | A new one on every `resolve()` | Cheap, stateful helpers |
| `"scoped"` | One per scope — usually one per request | Per-request state such as the current user |

A *scope* is a boundary you create with container.createScope(). Resolve through that object and scoped providers are cached for its lifetime. This program shows all three lifetimes at once.

```ts
import { Container, createToken } from "@zudojs/core";

let made = 0;
const IdToken = createToken<number>("Id");

const container = new Container();
container.register(IdToken, { useFactory: () => ++made }, "scoped");

const requestA = container.createScope();
const requestB = container.createScope();

console.log(requestA.resolve(IdToken));   // 1
console.log(requestA.resolve(IdToken));   // 1 (same scope, same instance)
console.log(requestB.resolve(IdToken));   // 2 (different scope)
```

**What you should see.** 1, 1, 2.

Inside an application you rarely call createScope yourself. createApplication builds its container so the current [execution context](https://zudojs.oyinlola.site/docs/concepts-contexts.md) is the scope, which means one instance per request, job or message. With no scope active, scoped providers behave like transient ones.

## When It Goes Wrong

The container fails loudly rather than handing back undefined. Three errors cover almost everything.

| Error | Cause | Fix |
| --- | --- | --- |
| `ProviderNotFoundError` | Resolving a token nothing was registered under | Register it, or check you imported the same token object |
| `ProviderAlreadyRegisteredError` | Registering the same token twice | `unregister(token)` first, or register once at startup |
| `DependencyResolutionError` | A cycle (A needs B, B needs A), or a factory that threw | Break the cycle, or read the wrapped `cause` |

A cycle is caught immediately with the full resolution chain attached, rather than crashing with a stack overflow.

## Swapping Things in Tests

This is the payoff. Register a fake under the same token and the code under test never notices.

```ts
import { Container, createToken } from "@zudojs/core";

interface Mailer { send(to: string): void; }

const MailerToken = createToken<Mailer>("Mailer");

function welcome(container: Container, to: string): void {
  container.resolve(MailerToken).send(to);
}

const sent: string[] = [];
const container = new Container();
container.register(MailerToken, { useValue: { send: (to) => { sent.push(to); } } });

welcome(container, "ada@example.com");
console.log(sent);   // [ "ada@example.com" ]
```

**What you should see.** [ 'ada@example.com' ]. No real mail server, no network, and welcome was not modified.

> **Tip**
>
> Pass your own container to createApplication({ container }) when you want registrations in place before any module starts.

## Common Mistakes

- **Calling createToken twice for the same thing.** You get two different symbols, so the second resolve throws ProviderNotFoundError. Create each token once and export it.
- **Expecting useClass to inject constructor arguments.** The core container calls new C() with none. Use useFactory.
- **Registering inside a hot path.** The second call throws ProviderAlreadyRegisteredError. Register during startup only.
- **Using "scoped" with no scope active.** It silently behaves like "transient", so per-request state is not shared. Resolve through a scope, or through an execution context.

## Related

- [@zudojs/container](https://zudojs.oyinlola.site/docs/packages-container.md) — the standalone container: constructor injection via inject, disposal, snapshots, child scopes.
- [@zudojs/core](https://zudojs.oyinlola.site/docs/packages-core.md) — the full reference for Container, createToken and the provider types.
- [Contexts](https://zudojs.oyinlola.site/docs/concepts-contexts.md) — what defines a scope inside a running application.
- [Modules](https://zudojs.oyinlola.site/docs/concepts-modules.md) — where registrations usually belong.
