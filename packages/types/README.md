# @zudojs/types

Shared type guards, utility types, and type converters for the Zudojs framework.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-types](https://zudojs.oyinlola.site/docs/packages-types) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-types.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

## Installation

```bash
npm install @zudojs/types
```

## Quick Start

```typescript
import {
  isPlainObject,
  isEmail,
  isUuid,
  systemClock,
  systemRandom,
  toNumber,
} from "@zudojs/types";
import type { Maybe, DeepReadonly } from "@zudojs/types";

if (isPlainObject(value)) {
  for (const key of Object.keys(value)) {
    console.log(key, value[key]);
  }
}

const id: Maybe<string> = null;
const config: DeepReadonly<AppConfig> = { db: { host: "localhost" } };

// Injectable runtime primitives, so tests can substitute deterministic ones.
const token = systemRandom.string(32);
const now = systemClock.now();

// Converters refuse rather than guessing: "" and "0x10" fall back.
const limit = toNumber(query.limit, 20);
```

Deterministic doubles for tests:

```typescript
import { FixedClock, SeededRandom } from "@zudojs/types";
import type { PseudoRandom } from "@zudojs/types";

const clock = new FixedClock(0);
const random: PseudoRandom = new SeededRandom(42);

clock.advance(1_000);
```

## Safety Notes

- `Random` is branded, so `SeededRandom` — whose output is fully predictable
  from its seed — cannot be injected where unpredictability is required.
  Implement a secure generator through `defineSecureRandom()`.
- `Random.int(max)` uses rejection sampling, not `% max`, so draws are uniform
  for every bound rather than only powers of two. `max` must be an integer
  from 1 to `MAX_RANDOM_INT_BOUND` (`Number.MAX_SAFE_INTEGER`); bounds above
  2^32 draw 53 bits. Anything else throws a `RangeError`.
- `SeededRandom` is mulberry32-backed: its `uuid()` values do not repeat after
  16 draws and `int(2)` does not alternate.
- `mapToObject` and `safeJsonParse` cannot be used to reach a prototype.
  `safeJsonParse` drops `__proto__`, `constructor` and `prototype` keys at
  every depth as a deliberate deny-list, so a payload with a legitimate
  `constructor` field loses it.
- `camelToSnake` / `camelToKebab` are Unicode-aware (`caféAuLait` becomes
  `café_au_lait`) and keep characters other than `_`, `-` and whitespace.
- `toNumber` requires a finite number and refuses blank strings, hexadecimal
  literals and `1e999`; `toBoolean(NaN)` falls back rather than returning true.
- `isUuid` accepts versions 1–8 including UUIDv7; use `isUuidV4` where the
  version matters. `isPromise` narrows only to a native `Promise` — use
  `isThenable` for anything awaitable.

## Features

- Type guards (`isPlainObject`, `isDate`, `isEmail`, `isUuid`, etc.)
- Utility types (`Maybe`, `DeepReadonly`, `Prettify`, etc.)
- Type converters and case transformers
- Injectable `Clock` and `Random` primitives, with deterministic test doubles

Branded identifier types (`Brand<>`, `UserId`, `TenantId`, ...) are not in
this package; they live in `@zudojs/constants`.

## Use Cases

- Runtime type checking
- Type-safe utility functions
- Deep immutability
- Nullable type handling
