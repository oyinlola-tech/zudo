# @zudojs/serialization

JSON serialization with optional type preservation, a transformer registry, and an envelope for cross-service payloads.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-serialization](https://zudojs.oyinlola.site/docs/packages-serialization) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-serialization.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

## Installation

```bash
npm install @zudojs/serialization
```

## Quick Start

```typescript
import { createSerializer } from "@zudojs/serialization";

// Format is positional; options are per-instance defaults.
const serializer = createSerializer("json", { preserveTypes: true });

const json = serializer.serialize({ id: "123", createdAt: new Date() });
const value = serializer.deserialize<{ id: string; createdAt: Date }>(json);

value.createdAt instanceof Date; // true
```

Every serialize/deserialize option — `pretty`, `preserveTypes`, `maxSize`,
`maxDepth`, `strict`, `allowUnsafeKeys`, `includeStack` — can be passed to
`createSerializer` as an instance default. The methods are `serialize` /
`deserialize`, and every option can be overridden per call:

```typescript
serializer.serialize(value, { pretty: true, maxSize: 1_000_000 });
serializer.deserialize(json, { strict: true, maxDepth: 64 });
```

## Type preservation

By default the serializer is a thin pass to `JSON.stringify`/`JSON.parse`. With
`preserveTypes`, values that JSON cannot represent are tagged and restored:

```typescript
const s = createSerializer("json", { preserveTypes: true });

const value = {
  when: new Date(),
  amount: 42n,
  seen: new Set(["a"]),
  index: new Map([["k", new Date()]]),
  bytes: new Uint8Array([1, 2, 3]),
};

const json = s.serialize(value);
const back = s.deserialize<typeof value>(json);
// Date, BigInt, Set, Map, Uint8Array all restored — including values nested
// inside a Map or Set.
```

Built-in transformers cover `Date`, `BigInt`, `Map`, `Set`, `Uint8Array`/`Buffer`
and `Error`. Register your own against the same contract:

```typescript
import { TransformerRegistry, JSONSerializer } from "@zudojs/serialization";

const registry = new TransformerRegistry();
registry.register({
  type: "Money",
  canSerialize: (v): v is Money => v instanceof Money,
  serialize: (v) => (v as Money).toString(), // wrapped as { $type: "Money", $value: "..." }
  deserialize: (v) => Money.parse((v as { $value: string }).$value),
});

const serializer = new JSONSerializer({ transformers: registry });
// Money uses your transformer; Date, BigInt, Map, Set, Buffer and Error still
// use the built-ins.
```

Your registry is consulted first, so registering a tag the built-ins use (say
`"Date"`) replaces that built-in. Transformers you add to the registry later are
picked up.

**The transformer contract.** On the wire a transformed value is always
`{ "$type": <type>, "$value": ... }`.

- `serialize` returns either just the value to store, which the serializer
  wraps as `{ $type: type, $value: <returned> }`, or that full tagged object
  itself (as the built-ins do). A plain object with its own string `$type` is
  taken as the full tagged object; anything else is wrapped. Special values
  nested inside what you return (a `Date`, a `BigInt`) are transformed too.
- `deserialize` always receives the full tagged object, with nested values
  already restored, whichever form `serialize` returned. Read `$value` from it.

**Opting out of the built-ins.** Pass `builtins: false` (to `JSONSerializer`
or `createSerializer`) to use only your registry. A value that no transformer
handles and that JSON would write as `{}` (a `Map`, `Set`, `WeakMap`, `Error`,
`RegExp`, `ArrayBuffer`, ...) then throws `SerializeError` under
`preserveTypes` instead of being silently emptied. To compose a registry by
hand, start from `createBuiltinTransformers()`.

## Untrusted input

`deserialize` is the boundary that matters — the string arrives from a queue, an
RPC peer or a request body.

- **Prototype-polluting keys are dropped** on the `preserveTypes` path, which
  is the one that rebuilds objects key by key. `__proto__`, `constructor` and
  `prototype` never reach the reconstructed object; set `allowUnsafeKeys` to
  keep them, as real own properties, when the payload is trusted. The fast path
  is plain `JSON.parse`, where `__proto__` survives as an inert own property and
  never reaches the prototype — but do not spread or deep-merge such an object
  into another without screening its keys.
- **Input is size-bounded** by `maxSize`, and depth-bounded by `maxDepth`. On
  the `preserveTypes` path the depth limit defaults to 128; on the fast path it
  is enforced whenever you set it, per call or as an instance default.
- **Your own data may carry a `$type` key.** With `preserveTypes`, a plain
  object that has its own string `$type` is written escaped as
  `{"$type":"Object","$value":{...}}` (`ESCAPED_OBJECT_TAG`) and read back as
  the plain object it was, so user data can never be revived as a `Map`,
  `Error`, `BigInt` or `Buffer`. `"Object"` is reserved and cannot be
  registered as a transformer. Payloads written before this escaping existed
  are still read as before: an unescaped tag is revived, since it cannot be
  told apart from one the serializer wrote.
- **An unrecognised or malformed tag is treated as ordinary data**, so a peer
  cannot stop the consumer with `{"$type":"anything"}` or
  `{"$type":"Date","$value":"nope"}`, and a bad record stays readable. Pass
  `strict: true` to make either an error instead.
- **BigInt tags are capped at 4096 decimal digits**
  (`SerializationLimits.MAX_BIGINT_DIGITS` from `@zudojs/constants`, shared
  with `@zudojs/schema`'s `coerce.bigint()`), checked before `BigInt()` runs;
  serializing a larger BigInt throws.

## Errors

Failures throw `@zudojs/errors` serialization classes: `SerializationPayloadTooLargeError`,
`SerializationDepthError`, `InvalidSerializedDataError` (malformed JSON, unknown
or malformed tags under `strict`), `TransformerError` and `SerializeError` (for
example an invalid `Date`). All extend `SerializationError`.

### Serialized errors

Stack traces are **not** serialized unless you ask, because a serialized error
routinely ends up in a queue message or a log sink:

```typescript
serializer.serialize({ error }, { preserveTypes: true }); // name, message, code
serializer.serialize({ error }, { preserveTypes: true, includeStack: true });
```

On the way back, a wire-supplied stack is attached as a non-enumerable
`originalStack` rather than overwriting the reconstructed error's own.

## Envelopes

An envelope carries the metadata a consumer needs to decode the payload:

```typescript
import {
  serializeToEnvelope,
  deserializeFromEnvelope,
} from "@zudojs/serialization";

const envelope = serializeToEnvelope(payload, serializer);
// { metadata: { format, version, contentType, encoding }, data }

const value = deserializeFromEnvelope(envelope, serializer, "json");
```

Both helpers forward a fourth argument to the serializer, so the options that
matter on the wire are reachable through an envelope:

```typescript
const envelope = serializeToEnvelope(payload, serializer, "json", {
  preserveTypes: true,
});

const value = deserializeFromEnvelope(envelope, serializer, "json", {
  preserveTypes: true,
  strict: true,
  maxSize: 1_000_000,
});
```

`unwrapEnvelope` validates the shape and rejects a payload stamped with a schema
version newer than this build understands, rather than misreading it.
`contentType` is derived from the format.

## Features

- JSON serialization with opt-in type preservation
- Built-in transformers for Date, BigInt, Map, Set, Buffer and Error
- Transformer registry for custom types
- Envelope pattern with schema-version and encoding checks
- Prototype-pollution protection on reconstruction
- Size and depth limits on both directions
- Circular reference detection (on the `preserveTypes` path)

## Use Cases

- Queue and RPC message payloads
- Cross-service communication
- Cache value encoding
- API responses carrying non-JSON types
