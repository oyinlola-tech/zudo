# @zudojs/testing

Test helpers, fixtures, mocks, and assertions for Zudojs applications.

## Installation

```bash
npm install --save-dev @zudojs/testing
```

## Quick Start

```typescript
import {
  createCleanupManager,
  createMockFn,
  createSpyLogger,
  createTestClock,
  createTestContainer,
} from "@zudojs/testing";

const container = createTestContainer({
  overrides: [{ token: databaseToken, useValue: fakeDatabase }],
});

const logger = createSpyLogger("test");
const clock = createTestClock(0); // pinned to the epoch
const cleanup = createCleanupManager();

const findUser = createMockFn<[string], Promise<User>>();
findUser.mockResolvedValue({ id: "u_1" });

clock.advance(60_000);
cleanup.register(() => container.dispose(), "container");

// Rejects with an AggregateError if any cleanup fails.
await cleanup.dispose();
```

Assertions compare structurally, so they can actually fail:

```typescript
import { assertResponseStatus, assertResponseBody } from "@zudojs/testing";

assertResponseStatus(response, 201);
assertResponseBody(response, { id: "u_1", roles: new Set(["admin"]) });
```

## Features

- Test container, config, clock, and application context
- Spy logger that records child and context loggers too
- Mock functions, spies, and stubs
- Recording event bus, message bus, and queue
- HTTP request/response builders
- Structural assertions for responses, events, errors, and serialization
- Cleanup manager that reports what failed

## Safety Notes

- Assertions compare structurally, not by `JSON.stringify`. `Map`, `Set`,
  `Date`, `BigInt`, `undefined` values and key order are all handled, and a
  circular value reports a mismatch instead of throwing a `TypeError`.
- `createStub()` answers `then` with `undefined`, so awaiting a stub — or
  returning one from an async factory — resolves rather than hanging.
- `cleanup.dispose()` rejects with an `AggregateError` when any cleanup fails,
  after running them all.
- `mockResolvedValue` and `mockRejectedValue` return promises; `results` stays
  aligned index-for-index with `calls`.
- Spies forward their receiver, so a method reading `this` still works.

## Use Cases

- Unit and integration testing
- Dependency injection in tests
- Deterministic time and randomness
- Asserting on events, messages, and HTTP responses
